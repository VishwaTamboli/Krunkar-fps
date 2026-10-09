// Frontend session store + auth HTTP API. Token lives in sessionStorage
// (per-tab, cleared on tab close). No sockets here, so no import cycles.
const TOKEN_KEY = 'nb-token';
const USER_KEY = 'nb-user';

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function getUsername() {
  try {
    return sessionStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}
export function setSession(token, username) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, username);
  } catch {
    /* private mode */
  }
}
export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
  }
}

async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

export const apiRegister = (username, password) => post('/api/register', { username, password });
export const apiLogin = (username, password) => post('/api/login', { username, password });

export async function apiMe() {
  const t = getToken();
  if (!t) return { ok: false, status: 401 };
  const r = await fetch('/api/me', { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

export async function apiLogout() {
  const t = getToken();
  try {
    if (t) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
    }
  } catch {
    /* server down: still clear locally */
  }
  clearSession();
}
