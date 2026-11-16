import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../../shared/db.client.js';
import { wrap, unwrap, body, HttpError } from '../../shared/http.js';

const r = Router();

const provisionWorkerSchema = z.object({
  full_name: z.string().min(1, 'Worker full name is required'),
  email: z.string().email().optional(),
});

/**
 * Generate secure random alphanumeric password
 */
function generateSecurePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return pwd;
}

/**
 * GET /api/auth/workers
 * List all provisioned workers and their profile status
 */
r.get('/workers', wrap(async (_q, res) => {
  // Check if worker_profiles exists
  const { data: profiles, error } = await db
    .from('worker_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    // If table hasn't been migrated yet, return empty list gracefully
    return res.json([]);
  }

  res.json(profiles || []);
}));

/**
 * POST /api/auth/workers
 * Admin provisions a new worker account bypassing user sign-up
 */
r.post('/workers', body(provisionWorkerSchema), wrap(async (q, res) => {
  const { full_name } = q.body;
  
  // Auto-generate clean worker email if not specified: worker.<slug>.<rand>@eliteprepware.internal
  const slug = full_name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const randSuffix = crypto.randomInt(100, 999);
  const email = q.body.email || `${slug || 'staff'}.${randSuffix}@eliteprepware.internal`;
  const autoPassword = generateSecurePassword(12);

  // 1. Create account directly via Supabase Admin API
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password: autoPassword,
    email_confirm: true,
    user_metadata: { full_name, role: 'worker' },
    app_metadata: { role: 'worker', is_active: true }
  });

  if (authError) {
    throw new HttpError(400, `Worker provisioning failed: ${authError.message}`);
  }

  const workerId = authData.user.id;

  // 2. Insert into worker_profiles table
  const { error: profileError } = await db.from('worker_profiles').insert({
    worker_id: workerId,
    full_name,
    email,
    is_active: true
  });

  if (profileError && !profileError.message.includes('Could not find')) {
    // Non-fatal if table not migrated yet, but log
    console.error('worker_profiles insert notice:', profileError.message);
  }

  res.status(201).json({
    worker_id: workerId,
    full_name,
    email,
    temporary_password: autoPassword,
    is_active: true,
    message: 'Worker provisioned successfully. Share credentials with staff.'
  });
}));

/**
 * PATCH /api/auth/workers/:id/status
 * Instant Revocation: Toggle is_active.
 * If suspending (is_active = false), immediately terminates all sessions.
 */
r.patch('/workers/:id/status', body(z.object({ is_active: z.boolean() })), wrap(async (q, res) => {
  const { id } = q.params;
  const { is_active } = q.body;

  // 1. Update worker profile state
  await db.from('worker_profiles').update({ is_active }).eq('worker_id', id);

  // 2. Also sync app_metadata
  await db.auth.admin.updateUserById(id, {
    app_metadata: { is_active }
  });

  // 3. If suspending, instantly invalidate sessions
  if (!is_active) {
    try {
      await db.auth.admin.signOut(id);
    } catch (e) {
      console.warn('Signout warning:', e.message);
    }
  }

  res.json({
    worker_id: id,
    is_active,
    revoked: !is_active
  });
}));

/**
 * POST /api/auth/workers/:id/reset-password
 * Admin resets worker credentials and receives new temporary password
 */
r.post('/workers/:id/reset-password', wrap(async (q, res) => {
  const { id } = q.params;
  const newPassword = generateSecurePassword(12);

  const { error } = await db.auth.admin.updateUserById(id, {
    password: newPassword
  });

  if (error) {
    throw new HttpError(400, `Password reset failed: ${error.message}`);
  }

  res.json({
    worker_id: id,
    new_password: newPassword,
    message: 'Password reset successfully. Hand new credentials to worker.'
  });
}));

export default r;
