import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { requireAdmin, errorHandler, wrap, HttpError } from './shared/http.js';
import clients from './modules/clients/clients.routes.js';
import pricing from './modules/pricing/pricing.routes.js';
import storage from './modules/storage/storage.routes.js';
import invoices from './modules/invoicing/invoice.routes.js';
import auth from './modules/auth/auth.routes.js';

const app = express();
app.use(cors(), express.json());
app.get('/health', (_q, res) => res.json({ ok: true }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

app.get('/auth/dev-credentials', (req, res) => {
  const origin = req.get('origin');
  const loopbackOrigin = origin && (() => {
    try {
      const hostname = new URL(origin).hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    } catch {
      return false;
    }
  })();
  const remoteAddress = req.socket.remoteAddress || '';
  const loopbackClient = remoteAddress === '::1'
    || remoteAddress === '127.0.0.1'
    || remoteAddress.startsWith('::ffff:127.');
  const { DEVELOPMENT_LOGIN_EMAIL, DEVELOPMENT_LOGIN_PASSWORD } = process.env;
  const enabled = process.env.NODE_ENV === 'development'
    && loopbackOrigin
    && loopbackClient
    && Boolean(DEVELOPMENT_LOGIN_EMAIL && DEVELOPMENT_LOGIN_PASSWORD);

  res.set('Cache-Control', 'no-store');
  if (!enabled) return res.json({ enabled: false });

  if (req.query.fill === '1') {
    return res.json({
      enabled: true,
      email: DEVELOPMENT_LOGIN_EMAIL,
      password: DEVELOPMENT_LOGIN_PASSWORD
    });
  }
  res.json({ enabled: true });
});

// Email/password login for the dashboard (uses the anon key; the service key never leaves the server).
app.post('/auth/login', wrap(async (req, res) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_ANON_KEY) throw new HttpError(500, 'SUPABASE_ANON_KEY is not set in .env');
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: req.body.email, password: req.body.password });
  if (error) throw new HttpError(401, error.message);
  res.json({ token: data.session.access_token });
}));
app.use('/api', requireAdmin);
app.use('/api/auth', auth);
app.use('/api/clients', clients);
app.use('/api/pricing', pricing);
app.use('/api/storage', storage);
app.use('/api/invoices', invoices);
app.use(errorHandler);

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Eliteprepware API on :${port}`));
}

export default app;
