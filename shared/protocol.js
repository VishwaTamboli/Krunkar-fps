// Shared LAN protocol constants + validation (browser- and Node-safe, no DOM).
// Stage 1: lobby presence only. Auth, matches and chat arrive in later stages.
export const EVENTS = {
  JOIN: 'lobby:join',
  LEAVE: 'lobby:leave',
  STATE: 'lobby:state',
  ERROR: 'lobby:error',
};

export const MIN_NAME = 2;
export const MAX_NAME = 16;
export const MAX_PLAYERS = 8;

// ---- Match stage (host start, countdown, live movement sync) ----
export const MATCH = {
  STATE: 'match:state',
  START: 'match:start',
  END: 'match:end',
  LEAVE: 'match:leave',
  UPDATE: 'player:update',
  SNAP: 'players:snapshot',
};

export const COUNTDOWN_MS = 3000;
export const SEND_MS = 66; // client -> server position rate (~15Hz)
export const SNAP_MS = 83; // server -> clients snapshot rate (~12Hz)
export const MAX_SPEED = 10; // sprint (9) + slack, for update validation
export const ARENA_HALF = 28;

// Spawn footprints mirror arena.js spawnPoints (x,z). Index = roster order.
export const SPAWNS = [
  [0, 20], [-24, -24], [24, -24], [-24, 24],
  [24, 24], [0, -24], [-22, -1], [22, 4],
];

export function validateUpdate(u) {
  if (!u || typeof u !== 'object') return { ok: false };
  const { x, y, z, yaw } = u;
  for (const v of [x, y, z, yaw]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false };
  }
  if (Math.abs(x) > ARENA_HALF + 2 || Math.abs(z) > ARENA_HALF + 2) return { ok: false };
  if (y < 0 || y > 12) return { ok: false };
  return { ok: true, x, y, z, yaw };
}

// ---- Authoritative combat (Stage 3) ----
export const COMBAT = {
  SHOOT: 'combat:shoot',
  RESULT: 'combat:result', // server -> shooter only
  FX: 'combat:fx', // server -> everyone except shooter (remote tracers)
  DAMAGE: 'combat:damage', // server -> victim only
  KILL: 'combat:kill', // server -> everyone (kill feed)
};

export const EYE = 1.7;
export const SHOT_CD_MS = 130;
export const SHOT_RANGE = 120;
export const DMG_BODY = 34;
export const DMG_HEAD = 68;
export const RESPAWN_MS = 3000;
export const KILL_SCORE = 100;
export const REGEN_DELAY_MS = 5000;
export const REGEN_RATE = 6; // hp per second

export function validateShot(s) {
  if (!s || typeof s !== 'object') return { ok: false };
  const { o, d } = s;
  if (!o || !d) return { ok: false };
  for (const v of [o.x, o.y, o.z, d.x, d.y, d.z]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false };
  }
  if (Math.abs(Math.hypot(d.x, d.y, d.z) - 1) > 0.02) return { ok: false };
  if (Math.abs(o.x) > ARENA_HALF + 4 || Math.abs(o.z) > ARENA_HALF + 4) return { ok: false };
  if (o.y < 0 || o.y > 12) return { ok: false };
  return { ok: true, o, d };
}

// ---- Real-time chat (lobby + match scopes, in-memory history) ----
export const CHAT = {
  SEND: 'chat:send',
  NEW: 'chat:new',
  HISTORY: 'chat:history',
};
export const MAX_MSG = 200;
export const CHAT_HIST = 50;
export const CHAT_BURST = 5; // max messages per window per socket
export const CHAT_WINDOW_MS = 10_000;

const NAME_RE = /^[A-Za-z0-9_ ]+$/;

export function validateName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < MIN_NAME) return { ok: false, error: `Name must be at least ${MIN_NAME} characters.` };
  if (name.length > MAX_NAME) return { ok: false, error: `Name must be at most ${MAX_NAME} characters.` };
  if (!NAME_RE.test(name)) return { ok: false, error: 'Name may only use letters, numbers, spaces and _.' };
  return { ok: true, name };
}

// ---- Account credentials (shared client + server rule) ----
export const MIN_USER = 3;
export const MAX_USER = 16;
export const MIN_PASS = 6;
export const MAX_PASS = 72;
const USER_RE = /^[A-Za-z0-9_]+$/;

export function validateCredentials(rawUser, rawPass) {
  const username = String(rawUser ?? '').trim();
  const password = typeof rawPass === 'string' ? rawPass : '';
  if (username.length < MIN_USER || username.length > MAX_USER) {
    return { ok: false, error: `Username must be ${MIN_USER}–${MAX_USER} characters.` };
  }
  if (!USER_RE.test(username)) {
    return { ok: false, error: 'Username may only use letters, numbers and _.' };
  }
  if (password.length < MIN_PASS) return { ok: false, error: `Password must be at least ${MIN_PASS} characters.` };
  if (password.length > MAX_PASS) return { ok: false, error: `Password must be at most ${MAX_PASS} characters.` };
  return { ok: true, username, password };
}
