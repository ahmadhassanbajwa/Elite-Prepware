# Eliteprepware Backend

1. Supabase SQL editor: run `supabase/migrations/001_init.sql` (also creates the private `invoices` bucket).
2. Fill `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never expose). Optional: `PORT`, `COMPANY_NAME`, `COMPANY_ADDRESS`.
3. Make yourself admin: Auth > Users, edit the user's `app_metadata` to `{"role":"admin"}`.
4. Optional: drop your logo at `src/assets/logo.png`.
5. `npm install && npm start`, then open http://localhost:3000 and sign in with your admin user.

All `/api/*` routes need `Authorization: Bearer <supabase user JWT>` for an admin.

| Area | Routes |
|---|---|
| Clients | `GET/POST /api/clients`, `GET/PATCH /api/clients/:id` |
| Pricing | `/api/pricing/types` (CRUD, archive), `/items/:itemId` (GET/POST), `DELETE /prices/:id`, `POST /overrides` |
| Storage | `/api/storage/slots`, `POST /intakes` (auto-places), `GET /rebalance`, `POST /rebalance/apply`, `POST /items/:id/release` |
| Invoices | `POST /api/invoices`, `GET /api/invoices[/:id]`, `GET /:id/pdf-url`, `PATCH /:id/status` |
