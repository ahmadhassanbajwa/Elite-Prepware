import { db } from '../../shared/db.js';
import { unwrap, HttpError } from '../../shared/http.js';
import { resolvePrices } from '../pricing/pricing.service.js';
import { generatePdf } from './pdf.generator.js';

const cents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => +(c / 100).toFixed(2);
const DAY = 86400000;

// per_period items are billed per started 30-day month inside the billing window.
function periodsFor(item, start, end) {
  const from = Math.max(new Date(item.received_at).getTime(), start.getTime());
  const to = Math.min(item.departed_at ? new Date(item.departed_at).getTime() : Infinity, end.getTime());
  return Math.max(1, Math.ceil((to - from) / DAY / 30));
}

export async function createInvoice({ client_id, item_ids, period_start, period_end, tax_rate = 0, due_days = 30, currency = 'USD' }) {
  const client = unwrap(await db.from('clients').select('*').eq('id', client_id).maybeSingle(), 'Client not found');
  const start = new Date(period_start), end = new Date(period_end);

  let q = db.from('items').select('*').eq('client_id', client_id).lte('received_at', end.toISOString());
  if (item_ids?.length) q = q.in('id', item_ids);
  else q = q.or(`departed_at.is.null,departed_at.gte.${start.toISOString()}`);
  const items = unwrap(await q);

  const lines = [];
  for (const item of items) {
    for (const p of await resolvePrices(item.id, client_id, end.toISOString())) {
      if (p.currency !== currency) throw new HttpError(422, `Price "${p.name}" on "${item.name}" is ${p.currency}, invoice is ${currency}`);
      const quantity = p.billing_basis === 'flat' ? 1
        : p.billing_basis === 'per_unit' ? item.quantity
        : item.quantity * periodsFor(item, start, end);
      lines.push({
        item_id: item.id, pricing_type_id: p.pricing_type_id,
        description: `${item.name}: ${p.name}`, quantity, unit_price: p.amount,
        line_total: fromCents(cents(p.amount) * quantity),
      });
    }
  }
  if (!lines.length) throw new HttpError(422, 'Nothing billable for this client and period');

  const subC = lines.reduce((s, l) => s + cents(l.line_total), 0);
  const taxC = Math.round(subC * tax_rate);
  const number = unwrap(await db.rpc('next_invoice_number'));
  const due = new Date(Date.now() + due_days * DAY).toISOString().slice(0, 10);

  const invoice = unwrap(await db.from('invoices').insert({
    invoice_number: number, client_id, currency, period_start, period_end, due_date: due,
    subtotal: fromCents(subC), tax: fromCents(taxC), total: fromCents(subC + taxC),
  }).select().single());
  unwrap(await db.from('invoice_line_items').insert(lines.map((l) => ({ ...l, invoice_id: invoice.id }))));

  const pdf = await generatePdf({ invoice, client, lines });
  const pdf_path = `${client_id}/${number}.pdf`;
  const up = await db.storage.from('invoices').upload(pdf_path, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new HttpError(500, `PDF upload failed: ${up.error.message}`);
  return unwrap(await db.from('invoices').update({ pdf_path }).eq('id', invoice.id).select().single());
}

export async function signedPdfUrl(invoiceId, seconds = 300) {
  const inv = unwrap(await db.from('invoices').select('pdf_path').eq('id', invoiceId).maybeSingle(), 'Invoice not found');
  const { data, error } = await db.storage.from('invoices').createSignedUrl(inv.pdf_path, seconds);
  if (error) throw new HttpError(500, error.message);
  return data.signedUrl;
}
