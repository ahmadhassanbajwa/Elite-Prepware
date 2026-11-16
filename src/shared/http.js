import { db } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Unwrap a supabase response: throws on error, returns data.
export function unwrap({ data, error }, notFound) {
  if (error) throw new HttpError(400, error.message);
  if (notFound && !data) throw new HttpError(404, notFound);
  return data;
}

export const body = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(new HttpError(422, JSON.stringify(r.error.flatten().fieldErrors)));
  req.body = r.data; next();
};

// Verify session and check active status for workers and admins
export const verifySession = wrap(async (req, _res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'Missing bearer token');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Invalid or expired session');
  
  // If user is a worker, verify worker_profiles.is_active state
  if (data.user.app_metadata?.role === 'worker' || data.user.user_metadata?.role === 'worker') {
    if (data.user.app_metadata?.is_active === false) {
      throw new HttpError(401, 'Account suspended. Session revoked by administrator.');
    }
    const { data: profile } = await db.from('worker_profiles').select('is_active').eq('worker_id', data.user.id).maybeSingle();
    if (profile && !profile.is_active) {
      throw new HttpError(401, 'Account suspended. Session revoked by administrator.');
    }
  }

  req.user = data.user;
  next();
});

// Admin-only: expects an active Supabase user whose app_metadata.role === 'admin'.
export const requireAdmin = wrap(async (req, res, next) => {
  await verifySession(req, res, () => {
    if (req.user.app_metadata?.role !== 'admin') throw new HttpError(403, 'Administrator access required');
    next();
  });
});

export const errorHandler = (err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
};
