import { db } from '../../shared/db.js';
import { unwrap } from '../../shared/http.js';

const active = (q, date) => q.lte('effective_from', date).or(`effective_to.is.null,effective_to.gt.${date}`);

// All prices that apply to an item on a date, with the client's negotiated overrides applied.
export async function resolvePrices(itemId, clientId, date = new Date().toISOString()) {
  const prices = unwrap(await active(
    db.from('item_prices').select('*, pricing_types(id,name,billing_basis,archived_at)').eq('item_id', itemId), date));
  const overrides = unwrap(await active(
    db.from('client_price_overrides').select('*').eq('client_id', clientId), date));
  const byType = new Map(overrides.map((o) => [o.pricing_type_id, o.amount]));
  return prices.map((p) => ({
    pricing_type_id: p.pricing_type_id,
    name: p.pricing_types.name,
    billing_basis: p.pricing_types.billing_basis,
    currency: p.currency,
    amount: byType.has(p.pricing_type_id) ? Number(byType.get(p.pricing_type_id)) : Number(p.amount),
    overridden: byType.has(p.pricing_type_id),
  }));
}
