/**
 * Eliteprepware Warehouse Optimization Engine
 * First-Fit Decreasing (FFD) Algorithm + Min-Heap Priority Queue
 */

/**
 * Min-Heap Priority Queue for Warehouse Locations ordered by dock distance
 */
export class MinHeap {
  constructor(comparator = (a, b) => a.distance - b.distance) {
    this.heap = [];
    this.comparator = comparator;
  }

  size() {
    return this.heap.length;
  }

  peek() {
    return this.heap[0] || null;
  }

  push(node) {
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.comparator(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  _bubbleDown(index) {
    const len = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < len && this.comparator(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < len && this.comparator(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }

  toArray() {
    return [...this.heap];
  }
}

/**
 * First-Fit Decreasing (FFD) Placement Algorithm paired with Min-Heap
 * Items: [{id, size, velocity}]
 * Slots: [{id, distance, free}]
 */
export function allocate(items, slots) {
  // Sort items decreasing: highest velocity first; on tie, largest footprint first
  const sortedItems = [...items].sort((a, b) => (b.velocity - a.velocity) || (b.size - a.size));
  
  // Initialize Min-Heap with available slots ordered by proximity to dock
  const heap = new MinHeap((a, b) => a.distance - b.distance);
  slots.filter(s => s.free > 0).forEach(s => heap.push({ ...s }));

  const assigned = [];
  const unplaced = [];

  for (const item of sortedItems) {
    const tempPopped = [];
    let placed = false;

    // Search closest available slot that fits the item footprint
    while (heap.size() > 0) {
      const candidateSlot = heap.pop();
      if (candidateSlot.free >= item.size) {
        candidateSlot.free -= item.size;
        assigned.push({
          itemId: item.id,
          slotId: candidateSlot.id,
          distance: candidateSlot.distance
        });
        if (candidateSlot.free > 0) {
          heap.push(candidateSlot);
        }
        placed = true;
        break;
      } else {
        tempPopped.push(candidateSlot);
      }
    }

    // Reinsert popped candidate slots back into priority queue
    for (const s of tempPopped) {
      heap.push(s);
    }

    if (!placed) {
      unplaced.push(item.id);
    }
  }

  return { assigned, unplaced };
}

/**
 * Rebalance Algorithm: Computes relocations to optimize velocity-distance match
 */
export function rebalance(items, slots, current) {
  const ideal = allocate(items, slots);
  const cur = new Map(current.map((c) => [c.itemId, c]));
  const vel = new Map(items.map((i) => [i.id, i.velocity]));

  const moves = ideal.assigned
    .filter((a) => cur.get(a.itemId) && cur.get(a.itemId).slotId !== a.slotId)
    .map((a) => {
      const from = cur.get(a.itemId);
      return {
        itemId: a.itemId,
        fromSlotId: from.slotId,
        toSlotId: a.slotId,
        benefit: +((from.distance - a.distance) * vel.get(a.itemId)).toFixed(2)
      };
    })
    .filter((m) => m.benefit > 0)
    .sort((a, b) => b.benefit - a.benefit);

  return { moves, unplaced: ideal.unplaced, ideal };
}

/**
 * Items sitting in expired rental slots
 */
export const expiredPlacements = (current, activeSlotIds) => 
  current.filter((c) => !activeSlotIds.has(c.slotId));
