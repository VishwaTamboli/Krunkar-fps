// Account + session logic. Passwords are bcrypt hashes only — plaintext is
// never stored or logged. Error messages stay generic on login so usernames
// can't be enumerated.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { validateCredentials } from '../shared/protocol.js';

const SALT_ROUNDS = 12;
// Constant-cost dummy compare when the user doesn't exist (timing hygiene).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', SALT_ROUNDS);

export async function registerUser(db, username, password) {
  const v = validateCredentials(username, password);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const hash = await bcrypt.hash(v.password, SALT_ROUNDS);
  const r = db.createUser(v.username, hash);
  if (!r.ok && r.taken) return { ok: false, status: 409, error: 'Username is taken.' };
  return { ok: true, username: v.username };
}

export async function loginUser(db, username, password) {
  const name = String(username ?? '').trim();
  const pw = typeof password === 'string' ? password : '';
  const u = name ? db.findUser(name) : null;
  const good = u ? await bcrypt.compare(pw, u.pass_hash) : await bcrypt.compare(pw, DUMMY_HASH).then(() => false);
  if (!u || !good) return { ok: false, status: 401, error: 'Invalid username or password.' };
  const token = crypto.randomUUID();
  db.createSession(token, u.id);
  return { ok: true, token, username: u.username };
}

export function getSessionUser(db, token) {
  if (!token) return null;
  const s = db.findSession(String(token));
  return s ? { id: s.user_id, username: s.username } : null;
}

export function logoutToken(db, token) {
  if (token) db.deleteSession(String(token));
}

// Tiny in-memory rate limiter for login/register (per IP).
export function authRateLimit(max, windowMs = 60_000) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || now > h.reset) {
      h = { n: 0, reset: now + windowMs };
      hits.set(req.ip, h);
    }
    h.n += 1;
    if (h.n > max) return res.status(429).json({ error: 'Too many attempts. Wait a minute and retry.' });
    next();
  };
}
