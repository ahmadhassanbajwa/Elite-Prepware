import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db.js';
import { wrap, unwrap, body } from '../../shared/http.js';
import { createInvoice, signedPdfUrl } from './invoice.service.js';

const r = Router();
const createSchema = z.object({
  client_id: z.string().uuid(), item_ids: z.array(z.string().uuid()).optional(),
  period_start: z.string().date(), period_end: z.string().date(),
  tax_rate: z.number().min(0).max(1).optional(), due_days: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
});

r.get('/', wrap(async (q, res) => {
  let query = db.from('invoices').select('*, clients(company_name)').order('created_at', { ascending: false });
  if (q.query.client_id) query = query.eq('client_id', q.query.client_id);
  res.json(unwrap(await query));
}));
r.get('/:id', wrap(async (q, res) => res.json(unwrap(
  await db.from('invoices').select('*, clients(*), invoice_line_items(*)').eq('id', q.params.id).maybeSingle(), 'Invoice not found'))));
r.post('/', body(createSchema), wrap(async (q, res) => res.status(201).json(await createInvoice(q.body))));
r.get('/:id/pdf-url', wrap(async (q, res) => res.json({ url: await signedPdfUrl(q.params.id) })));
r.patch('/:id/status', body(z.object({ status: z.enum(['paid', 'void']) })), wrap(async (q, res) =>
  res.json(unwrap(await db.from('invoices').update(q.body).eq('id', q.params.id).select().maybeSingle(), 'Invoice not found'))));

export default r;
