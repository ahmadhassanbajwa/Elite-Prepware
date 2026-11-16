import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db.js';
import { wrap, unwrap, body } from '../../shared/http.js';

const r = Router();
const create = z.object({
  company_name: z.string().min(1),
  email: z.string().email().optional(),
  billing_address: z.string().optional(),
  tax_id: z.string().optional(),
});

r.get('/', wrap(async (_q, res) => res.json(unwrap(await db.from('clients').select('*').order('company_name')))));
r.get('/:id', wrap(async (q, res) => res.json(unwrap(await db.from('clients').select('*').eq('id', q.params.id).maybeSingle(), 'Client not found'))));
r.post('/', body(create), wrap(async (q, res) => res.status(201).json(unwrap(await db.from('clients').insert(q.body).select().single()))));
r.patch('/:id', body(create.partial()), wrap(async (q, res) =>
  res.json(unwrap(await db.from('clients').update(q.body).eq('id', q.params.id).select().maybeSingle(), 'Client not found'))));

export default r;
