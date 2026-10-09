// LAN server: Express + Socket.IO lobby, matches, and accounts.
// Stages so far: lobby presence, match movement sync, auth + SQLite.
// Accounts (bcrypt hashes) and match history live in data/game.sqlite on the
// host. Only this backend opens that file; it is never served to clients.
// Scores/stats are written server-side only — no client score claims accepted.
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { EVENTS, MATCH, COMBAT, MAX_PLAYERS } from '../shared/protocol.js';
import { createGame } from './game.js';
import { createChat } from './chat.js';
import { openDb } from './db.js';
import { registerUser, loginUser, logoutToken, getSessionUser, authRateLimit } from './auth.js';

const PORT = Number(process.env.PORT) || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '16kb' }));
// DB_PATH override exists so tests can use a scratch database.
// Default is the host's data/game.sqlite (never served to clients).
const db = openDb(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'game.sqlite'));

// socket.id -> { userId, name, joinedAt }. Name always comes from the session.
const lobby = new Map();
let currentMatchDbId = null;

const bearer = (req) => {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer (.+)$/.exec(h);
  return m ? m[1] : null;
};

const loginLimiter = authRateLimit(10);
app.post('/api/register', loginLimiter, async (req, res) => {
  const r = await registerUser(db, req.body?.username, req.body?.password);
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true, username: r.username });
});
app.post('/api/login', loginLimiter, async (req, res) => {
  const r = await loginUser(db, req.body?.username, req.body?.password);
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true, token: r.token, username: r.username });
});
app.post('/api/logout', (req, res) => {
  logoutToken(db, bearer(req));
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const u = getSessionUser(db, bearer(req));
  if (!u) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ ok: true, username: u.username });
});
// Own persisted match history (wins/losses derived from stored rows).
app.get('/api/history', (req, res) => {
  const u = getSessionUser(db, bearer(req));
  if (!u) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ ok: true, matches: db.getUserHistory(u.id) });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, stage: 4, players: lobby.size, match: game.state().status });
});

// Production: serve the built frontend so LAN peers only need the game port.
app.use(express.static(path.join(__dirname, '..', 'dist')));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });
const game = createGame(io, lobby, {
  onLive: () => {
    currentMatchDbId = db.insertMatch();
  },
  onEnd: (results = []) => {
    // Never let a persistence failure kill the server or swallow the broadcast.
    try {
      if (currentMatchDbId !== null) {
        const id = currentMatchDbId;
        currentMatchDbId = null;
        db.endMatch(id);
        if (results.length) {
          db.writeStats(id, results);
          const win = [...results].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
          if (win && win.kills > 0) db.setWinner(id, win.userId, 'most_kills');
        }
      }
    } catch (e) {
      console.error('[mp] match persistence failed:', e?.message ?? e);
    }
  },
});
createChat(io); // session-wide chat needs no per-lobby wiring

// Reject unauthenticated sockets before they reach lobby or gameplay.
io.use((socket, next) => {
  const sess = getSessionUser(db, socket.handshake.auth?.token);
  if (!sess) return next(new Error('unauthorized'));
  socket.user = sess; // { id, username }
  next();
});

function lobbyState() {
  return {
    count: lobby.size,
    players: [...lobby.entries()].map(([id, p]) => ({ id, name: p.name, joinedAt: p.joinedAt })),
    host: game.hostId(),
  };
}
function broadcast() {
  io.emit(EVENTS.STATE, lobbyState());
}

io.on('connection', (socket) => {
  socket.emit(MATCH.STATE, game.state());
  socket.on(EVENTS.JOIN, () => {
    // Identity comes from the session, never from a client payload, so
    // usernames can't be impersonated.
    const { id: userId, username } = socket.user;
    if (!lobby.has(socket.id) && lobby.size >= MAX_PLAYERS) {
      socket.emit(EVENTS.ERROR, { message: `Lobby is full (max ${MAX_PLAYERS}).` });
      return;
    }
    // Same account reconnecting (new tab): replace the stale entry.
    for (const [oldId, p] of lobby) {
      if (p.userId === userId && oldId !== socket.id) {
        lobby.delete(oldId);
        game.removeSocket(oldId);
      }
    }
    const prev = lobby.get(socket.id);
    lobby.set(socket.id, { userId, name: username, joinedAt: prev?.joinedAt ?? Date.now() });
    game.rejoin(socket.id); // restores mid-match reconnects (stats kept server-side)
    broadcast();
  });

  socket.on(EVENTS.LEAVE, () => {
    if (lobby.delete(socket.id)) broadcast();
  });

  socket.on(MATCH.START, () => game.start(socket));
  socket.on(MATCH.END, () => game.end(socket));
  socket.on(MATCH.LEAVE, () => {
    game.leaveMatch(socket);
  });
  socket.on(MATCH.UPDATE, (u) => game.onUpdate(socket, u));
  socket.on(COMBAT.SHOOT, (s) => game.onShoot(socket, s));

  socket.on('disconnect', () => {
    game.removeSocket(socket.id);
    if (lobby.delete(socket.id)) broadcast();
  });
});

httpServer.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[mp] Port ${PORT} is already in use. Stop the other app, or run: PORT=3101 npm run server`);
    process.exit(1);
  }
  throw err;
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[mp] LAN server on http://0.0.0.0:${PORT}`);
  console.log(`[mp] Health check: http://localhost:${PORT}/api/health`);
});
