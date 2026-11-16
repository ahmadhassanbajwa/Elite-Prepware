import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db.js';
import { wrap, unwrap, body } from '../../shared/http.js';
import { resolvePrices } from './pricing.service.js';

const r = Router();
const basis = z.enum(['flat', 'per_unit', 'per_period']);
const typeSchema = z.object({ name: z.string().min(1), billing_basis: basis });
const priceSchema = z.object({
  pricing_type_id: z.string().uuid(), amount: z.number().nonnegative(),
  currency: z.string().length(3).default('USD'), effective_from: z.string().datetime().optional(),
});
const overrideSchema = z.object({
  client_id: z.string().uuid(), pricing_type_id: z.string().uuid(),
  amount: z.number().nonnegative(), effective_from: z.string().datetime().optional(),
});

// Admin-defined pricing categories (soft-deleted so old invoices stay intact)
r.get('/types', wrap(async (_q, res) => res.json(unwrap(await db.from('pricing_types').select('*').is('archived_at', null).order('name')))));
r.post('/types', body(typeSchema), wrap(async (q, res) => res.status(201).json(unwrap(await db.from('pricing_types').insert(q.body).select().single()))));
r.patch('/types/:id', body(typeSchema.partial()), wrap(async (q, res) =>
  res.json(unwrap(await db.from('pricing_types').update(q.body).eq('id', q.params.id).select().maybeSingle(), 'Type not found'))));
r.delete('/types/:id', wrap(async (q, res) => {
  unwrap(await db.from('pricing_types').update({ archived_at: new Date().toISOString() }).eq('id', q.params.id));
  res.status(204).end();
}));

// Attach any number of pricing components to an item
r.get('/items/:itemId', wrap(async (q, res) => {
  const item = unwrap(await db.from('items').select('client_id').eq('id', q.params.itemId).maybeSingle(), 'Item not found');
  res.json(await resolvePrices(q.params.itemId, item.client_id));
}));
r.post('/items/:itemId', body(priceSchema), wrap(async (q, res) =>
  res.status(201).json(unwrap(await db.from('item_prices').insert({ ...q.body, item_id: q.params.itemId }).select().single()))));
r.delete('/prices/:id', wrap(async (q, res) => { // end-date instead of delete, preserving history
  unwrap(await db.from('item_prices').update({ effective_to: new Date().toISOString() }).eq('id', q.params.id));
  res.status(204).end();
}));

// Client-specific negotiated rates
r.post('/overrides', body(overrideSchema), wrap(async (q, res) =>
  res.status(201).json(unwrap(await db.from('client_price_overrides').insert(q.body).select().single()))));

export default r;
