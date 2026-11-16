import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db.client.js';
import { wrap, unwrap, body, HttpError } from '../../shared/http.js';
import { allocate, rebalance, expiredPlacements } from './allocation.algo.js';

const r = Router();

const slotSchema = z.object({
  code: z.string().min(1),
  zone: z.string().optional(),
  distance: z.number().nonnegative(),
  capacity_units: z.number().positive().default(1),
  block_id: z.string().uuid().optional(),
});

const intakeSchema = z.object({
  client_id: z.string().uuid(),
  reference: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    size_units: z.number().positive().default(1),
    velocity: z.number().nonnegative().default(1),
  })).min(1),
});

const capacityBlockSchema = z.object({
  name: z.string().optional(),
  pallet_count: z.number().positive(),
  start_date: z.string().date().optional(),
  end_date: z.string().date(),
  status: z.enum(['active', 'expired', 'upcoming']).default('active'),
});

// ==========================================
// 1. CAPACITY BLOCKS & GATEKEEPER
// ==========================================

/**
 * GET /api/storage/capacity-blocks
 * Retrieves all rented capacity blocks and current gatekeeper status
 */
r.get('/capacity-blocks', wrap(async (_q, res) => {
  const { data: blocks } = await db.from('capacity_blocks').select('*').order('end_date', { ascending: true });
  
  // Calculate total active rented pallets
  const today = new Date().toISOString().slice(0, 10);
  const activeBlocks = (blocks || []).filter(b => b.status === 'active' && (!b.end_date || b.end_date >= today));
  const totalRentedPallets = activeBlocks.reduce((acc, b) => acc + (Number(b.pallet_count) || 0), 0);

  // Calculate occupied pallets
  const { data: occupiedItems } = await db.from('items').select('size_units, quantity').is('departed_at', null);
  const totalOccupiedPallets = (occupiedItems || []).reduce((acc, i) => acc + ((Number(i.size_units) || 1) * (Number(i.quantity) || 1)), 0);

  const availableRentedSpace = Math.max(0, totalRentedPallets - totalOccupiedPallets);

  res.json({
    blocks: blocks || [],
    metrics: {
      total_rented_pallets: totalRentedPallets,
      total_occupied_pallets: totalOccupiedPallets,
      available_rented_space: availableRentedSpace,
      utilization_pct: totalRentedPallets > 0 ? Math.round((totalOccupiedPallets / totalRentedPallets) * 100) : 0
    }
  });
}));

/**
 * POST /api/storage/capacity-blocks
 * Define new rented warehouse space
 */
r.post('/capacity-blocks', body(capacityBlockSchema), wrap(async (q, res) => {
  const { data, error } = await db.from('capacity_blocks').insert(q.body).select().single();
  if (error) throw new HttpError(400, error.message);
  res.status(201).json(data);
}));

/**
 * PATCH /api/storage/capacity-blocks/:id
 */
r.patch('/capacity-blocks/:id', body(capacityBlockSchema.partial()), wrap(async (q, res) => {
  const { data, error } = await db.from('capacity_blocks').update(q.body).eq('id', q.params.id).select().maybeSingle();
  if (error) throw new HttpError(400, error.message);
  res.json(data);
}));

/**
 * POST /api/storage/capacity-blocks/expire-check
 * Lease Expiration Engine: Flags expired capacity blocks as inactive, marks associated locations
 * inactive, and automatically computes high-priority relocation tasks for affected inventory.
 */
r.post('/capacity-blocks/expire-check', wrap(async (_q, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  // Find expired active blocks
  const { data: expired } = await db.from('capacity_blocks')
    .select('id, name')
    .eq('status', 'active')
    .lt('end_date', today);

  const expiredBlockIds = (expired || []).map(b => b.id);

  if (expiredBlockIds.length > 0) {
    // 1. Mark blocks as expired
    await db.from('capacity_blocks').update({ status: 'expired' }).in('id', expiredBlockIds);

    // 2. Mark locations linked to these blocks as inactive
    await db.from('storage_slots').update({ active: false }).in('block_id', expiredBlockIds);
  }

  // 3. Scan for items sitting in inactive slots and trigger rebalance relocation
  const { current, items, fullSlots, activeIds } = await loadState();
  const displacedItems = expiredPlacements(current, activeIds);
  const { moves, unplaced } = rebalance(items, fullSlots, current);

  res.json({
    expired_blocks_count: expiredBlockIds.length,
    displaced_items_count: displacedItems.length,
    recommended_moves: moves,
    unplaced_items: unplaced
  });
}));

// ==========================================
// 2. SLOTS & PHYSICAL LOCATIONS
// ==========================================

r.get('/slots', wrap(async (_q, res) => {
  res.json(unwrap(await db.from('slot_availability').select('*').order('distance')));
}));

r.post('/slots', body(slotSchema), wrap(async (q, res) => {
  res.status(201).json(unwrap(await db.from('storage_slots').insert(q.body).select().single()));
}));

r.patch('/slots/:id', body(z.object({ active: z.boolean().optional(), block_id: z.string().uuid().nullable().optional() })), wrap(async (q, res) => {
  res.json(unwrap(await db.from('storage_slots').update(q.body).eq('id', q.params.id).select().maybeSingle(), 'Slot not found'));
}));

// ==========================================
// 3. INVENTORY & THE CAPACITY GATEKEEPER
// ==========================================

r.get('/items', wrap(async (_q, res) => {
  res.json(unwrap(await db.from('items')
    .select('*, clients(company_name), item_assignments(released_at, storage_slots(code))')
    .is('departed_at', null)
    .order('received_at', { ascending: false })));
}));

/**
 * POST /api/storage/intakes
 * The Capacity Gatekeeper:
 * Calculates Total Rented Pallets (Active) - Occupied Pallets.
 * If incoming inventory exceeds this number, intake is blocked.
 * Otherwise uses FFD + Min-Heap to auto-place into the closest active slots.
 */
r.post('/intakes', body(intakeSchema), wrap(async (q, res) => {
  const { client_id, reference, items } = q.body;

  // 1. Calculate incoming footprint
  const incomingTotal = items.reduce((sum, item) => sum + ((Number(item.size_units) || 1) * (Number(item.quantity) || 1)), 0);

  // 2. Gatekeeper Check: Calculate Active Rented Capacity vs Occupied Pallets
  const today = new Date().toISOString().slice(0, 10);
  const { data: blocks } = await db.from('capacity_blocks').select('*');
  
  if (blocks && blocks.length > 0) {
    const activeBlocks = blocks.filter(b => b.status === 'active' && (!b.end_date || b.end_date >= today));
    const totalRentedPallets = activeBlocks.reduce((acc, b) => acc + (Number(b.pallet_count) || 0), 0);

    const { data: occupiedItems } = await db.from('items').select('size_units, quantity').is('departed_at', null);
    const totalOccupiedPallets = (occupiedItems || []).reduce((acc, i) => acc + ((Number(i.size_units) || 1) * (Number(i.quantity) || 1)), 0);

    const availableRentedSpace = totalRentedPallets - totalOccupiedPallets;

    if (totalRentedPallets > 0 && incomingTotal > availableRentedSpace) {
      throw new HttpError(422, `Capacity Gatekeeper Alert: Incoming shipment of ${incomingTotal.toFixed(1)} pallet units exceeds active rented capacity (Available: ${availableRentedSpace.toFixed(1)} units). Expand active Capacity Blocks before authorizing intake.`);
    }
  }

  // 3. Record intake and insert item rows
  const intake = unwrap(await db.from('intakes').insert({ client_id, reference }).select().single());
  const rows = unwrap(await db.from('items').insert(items.map((i) => ({ ...i, client_id, intake_id: intake.id }))).select());
  
  // 4. Placement Routing: FFD + Min-Heap based on dock proximity
  const slots = unwrap(await db.from('slot_availability').select('*').eq('active', true))
    .map((s) => ({ id: s.id, distance: Number(s.distance), free: Number(s.free_units) }));
  
  const { assigned, unplaced } = allocate(
    rows.map((i) => ({ id: i.id, size: Number(i.size_units), velocity: Number(i.velocity) })),
    slots
  );

  if (assigned.length) {
    unwrap(await db.from('item_assignments').insert(assigned.map((a) => ({ item_id: a.itemId, slot_id: a.slotId }))));
  }

  res.status(201).json({
    intake,
    items: rows,
    placed: assigned.length,
    unplaced
  });
}));

async function loadState() {
  const allSlots = unwrap(await db.from('storage_slots').select('*'));
  const dist = new Map(allSlots.map((s) => [s.id, Number(s.distance)]));
  const asg = unwrap(await db.from('item_assignments').select('item_id, slot_id, items(size_units,velocity)').is('released_at', null));
  const active = allSlots.filter((s) => s.active);
  return {
    current: asg.map((a) => ({ itemId: a.item_id, slotId: a.slot_id, distance: dist.get(a.slot_id) })),
    items: asg.map((a) => ({ id: a.item_id, size: Number(a.items.size_units), velocity: Number(a.items.velocity) })),
    fullSlots: active.map((s) => ({ id: s.id, distance: Number(s.distance), free: Number(s.capacity_units) })),
    activeIds: new Set(active.map((s) => s.id)),
  };
}

// Relocations ranked by velocity-dock benefit
r.get('/rebalance', wrap(async (_q, res) => {
  const { current, items, fullSlots, activeIds } = await loadState();
  const { moves, unplaced } = rebalance(items, fullSlots, current);
  res.json({ moves, unplaced, mustMove: expiredPlacements(current, activeIds).map((c) => c.itemId) });
}));

r.post('/rebalance/apply', wrap(async (_q, res) => {
  const { current, items, fullSlots, activeIds } = await loadState();
  const { moves, ideal } = rebalance(items, fullSlots, current);
  const target = new Map(ideal.assigned.map((a) => [a.itemId, a.slotId]));
  const forced = expiredPlacements(current, activeIds).map((c) => c.itemId).filter((id) => target.has(id));
  const toMove = new Set([...moves.map((m) => m.itemId), ...forced]);
  for (const itemId of toMove) {
    unwrap(await db.from('item_assignments').update({ released_at: new Date().toISOString() }).eq('item_id', itemId).is('released_at', null));
    unwrap(await db.from('item_assignments').insert({ item_id: itemId, slot_id: target.get(itemId) }));
  }
  res.json({ moved: toMove.size, unplaced: ideal.unplaced });
}));

r.post('/items/:id/release', wrap(async (q, res) => {
  const now = new Date().toISOString();
  unwrap(await db.from('item_assignments').update({ released_at: now }).eq('item_id', q.params.id).is('released_at', null));
  unwrap(await db.from('items').update({ departed_at: now }).eq('id', q.params.id));
  res.json({ released: true });
}));

export default r;
