// Authoritative match server: lifecycle, movement relay, and combat.
// The server owns hp, deaths, kills, and scores. Clients send only inputs
// (movement, shoot origin/dir); hit tests, damage, and kills are computed
// here against validated positions and static colliders. Client score claims
// are never accepted — results are built from server-side stats at match end.
import {
  MATCH, COMBAT, COUNTDOWN_MS, SNAP_MS, MAX_SPEED, SPAWNS, EYE,
  SHOT_CD_MS, SHOT_RANGE, DMG_BODY, DMG_HEAD, RESPAWN_MS,
  REGEN_DELAY_MS, REGEN_RATE, KILL_SCORE, validateUpdate, validateShot,
} from '../shared/protocol.js';
import { segmentWallT, raySphereT } from '../shared/colliders.js';

export function createGame(io, lobby, hooks = {}) {
  let status = 'lobby'; // lobby | countdown | live
  let members = []; // socket ids in the current match
  let spawns = {}; // socket id -> { x, z }
  let spawnIdx = {}; // socket id -> SPAWNS index (stable across reconnects)
  let endsAt = 0;
  let startedAt = 0;
  let countdownTimer = null;
  let snapTimer = null;
  const pos = new Map(); // id -> { x, y, z, yaw, t }
  const lastSeen = new Map(); // id -> ms (movement rate limit)
  const hp = new Map(); // id -> { hp, alive, respawnAt, lastHurt, lastShot, by }
  const stats = new Map(); // userId -> { kills, deaths } (survives reconnects)

  // First-joined player still present is the host.
  function hostId() {
    let best = null;
    for (const [id, p] of lobby) {
      if (!best || p.joinedAt < best.t) best = { id, t: p.joinedAt };
    }
    return best?.id ?? null;
  }

  const nameOf = (id) => lobby.get(id)?.name ?? '?';
  const statsOf = (id) => {
    const u = lobby.get(id)?.userId;
    if (u == null) return { kills: 0, deaths: 0 };
    return stats.get(u) ?? { kills: 0, deaths: 0 };
  };

  const state = () => ({
    status,
    members: members.map((id) => ({ id, name: nameOf(id), spawn: spawns[id] ?? null })),
    endsAt,
    startedAt,
  });
  const broadcast = () => io.emit(MATCH.STATE, state());

  function freeSpawnIdx() {
    const used = new Set(Object.values(spawnIdx));
    for (let i = 0; i < SPAWNS.length; i++) if (!used.has(i)) return i;
    return members.length % SPAWNS.length;
  }

  function start(socket) {
    if (status !== 'lobby') return;
    if (socket.id !== hostId()) {
      socket.emit('lobby:error', { message: 'Only the host can start the match.' });
      return;
    }
    if (lobby.size < 1) return;
    status = 'countdown';
    endsAt = Date.now() + COUNTDOWN_MS;
    broadcast();
    clearTimeout(countdownTimer);
    countdownTimer = setTimeout(goLive, COUNTDOWN_MS);
  }

  function goLive() {
    if (status !== 'countdown') return;
    members = [...lobby.keys()].sort(
      (a, b) => (lobby.get(a)?.joinedAt ?? 0) - (lobby.get(b)?.joinedAt ?? 0)
    );
    spawns = {};
    spawnIdx = {};
    members.forEach((id, i) => {
      const idx = i % SPAWNS.length;
      spawnIdx[id] = idx;
      const s = SPAWNS[idx];
      spawns[id] = { x: s[0], z: s[1] };
    });
    pos.clear();
    lastSeen.clear();
    hp.clear();
    stats.clear();
    for (const id of members) hp.set(id, { hp: 100, alive: true, respawnAt: 0, lastHurt: 0, lastShot: 0, by: null });
    status = 'live';
    startedAt = Date.now();
    hooks.onLive?.();
    broadcast();
    clearInterval(snapTimer);
    snapTimer = setInterval(snapshot, SNAP_MS);
  }

  function snapshot() {
    if (status !== 'live') return;
    const now = Date.now();
    const dt = SNAP_MS / 1000;
    // Revives + regen before emitting.
    for (const id of members) {
      const h = hp.get(id);
      if (!h) continue;
      if (!h.alive && now >= h.respawnAt) {
        h.alive = true;
        h.hp = 100;
        h.by = null;
        const s = spawns[id];
        if (s) pos.set(id, { x: s.x, y: EYE, z: s.z, yaw: 0, t: now });
      } else if (h.alive && h.hp < 100 && now - h.lastHurt > REGEN_DELAY_MS) {
        h.hp = Math.min(100, h.hp + REGEN_RATE * dt);
      }
    }
    const players = [];
    for (const id of members) {
      const p = pos.get(id);
      const h = hp.get(id);
      const st = statsOf(id);
      players.push({
        id,
        name: nameOf(id),
        x: p?.x ?? spawns[id]?.x ?? 0,
        y: p?.y ?? EYE,
        z: p?.z ?? spawns[id]?.z ?? 0,
        yaw: p?.yaw ?? 0,
        hp: Math.ceil(h?.hp ?? 100),
        alive: h?.alive ?? true,
        respawnIn: h && !h.alive ? Math.max(0, h.respawnAt - now) : 0,
        by: h?.by ?? null,
        kills: st.kills,
        deaths: st.deaths,
      });
    }
    io.emit(MATCH.SNAP, { t: now, players });
  }

  function results() {
    return [...stats.entries()].map(([userId, s]) => ({
      userId,
      kills: s.kills,
      deaths: s.deaths,
      score: s.kills * KILL_SCORE,
    }));
  }

  function end(socket) {
    if (status === 'lobby') return;
    if (socket && socket.id !== hostId()) {
      socket.emit('lobby:error', { message: 'Only the host can end the match.' });
      return;
    }
    clearTimeout(countdownTimer);
    clearInterval(snapTimer);
    const res = results();
    status = 'lobby';
    members = [];
    spawns = {};
    spawnIdx = {};
    endsAt = 0;
    startedAt = 0;
    pos.clear();
    lastSeen.clear();
    hp.clear();
    stats.clear();
    hooks.onEnd?.(res);
    broadcast();
  }

  function bumpStat(id, field) {
    const u = lobby.get(id)?.userId;
    if (u == null) return;
    const s = stats.get(u) ?? { kills: 0, deaths: 0 };
    s[field] += 1;
    stats.set(u, s);
  }

  function onUpdate(socket, u) {
    if (status !== 'live' || !members.includes(socket.id)) return;
    if (hp.get(socket.id)?.alive === false) return; // the dead don't move
    const now = Date.now();
    if (now - (lastSeen.get(socket.id) ?? 0) < 30) return; // ~33Hz cap
    const v = validateUpdate(u);
    if (!v.ok) return;
    const prev = pos.get(socket.id);
    if (prev) {
      const dt = Math.max(0.001, (now - prev.t) / 1000);
      const d = Math.hypot(v.x - prev.x, v.y - prev.y, v.z - prev.z);
      if (d > MAX_SPEED * dt + 1.5) return; // teleport/speed hack: ignore
    }
    lastSeen.set(socket.id, now);
    pos.set(socket.id, { x: v.x, y: v.y, z: v.z, yaw: v.yaw, t: now });
  }

  function onShoot(socket, s) {
    if (status !== 'live' || !members.includes(socket.id)) return;
    const me = hp.get(socket.id);
    if (!me?.alive) return;
    const now = Date.now();
    if (now - me.lastShot < SHOT_CD_MS) return; // fire-rate limit
    const v = validateShot(s);
    if (!v.ok) return;
    const mine = pos.get(socket.id);
    if (!mine) return;
    // Origin must be near the shooter's validated position (eye vs feet slack).
    if (Math.hypot(v.o.x - mine.x, v.o.y - mine.y, v.o.z - mine.z) > 3.5) return;
    me.lastShot = now;

    const { o, d } = v;
    const wallT = segmentWallT(o.x, o.y, o.z, d.x, d.y, d.z, SHOT_RANGE);
    let best = null; // { id, t, head }
    for (const id of members) {
      if (id === socket.id) continue;
      const h = hp.get(id);
      if (!h?.alive) continue;
      const p = pos.get(id);
      if (!p) continue;
      const feet = p.y - EYE;
      const tHead = raySphereT(o.x, o.y, o.z, d.x, d.y, d.z, p.x, feet + 1.62, p.z, 0.38);
      const tBody = raySphereT(o.x, o.y, o.z, d.x, d.y, d.z, p.x, feet + 1.0, p.z, 0.75);
      const t = Math.min(tHead, tBody);
      if (t < SHOT_RANGE && t < wallT && (!best || t < best.t)) {
        best = { id, t, head: tHead <= tBody };
      }
    }

    const endT = best ? best.t : Math.min(wallT, SHOT_RANGE);
    const end = { x: o.x + d.x * endT, y: o.y + d.y * endT, z: o.z + d.z * endT };
    // Everyone except the shooter renders the remote tracer (shooter draws its own).
    socket.broadcast.emit(COMBAT.FX, { from: o, to: end, hit: !!best });

    if (!best) {
      socket.emit(COMBAT.RESULT, { hit: false, kill: false });
      return;
    }
    const victim = hp.get(best.id);
    const dmg = best.head ? DMG_HEAD : DMG_BODY;
    victim.hp -= dmg;
    victim.lastHurt = now;
    const killed = victim.hp <= 0;
    if (killed) {
      victim.hp = 0;
      victim.alive = false;
      victim.respawnAt = now + RESPAWN_MS;
      victim.by = nameOf(socket.id);
      bumpStat(socket.id, 'kills');
      bumpStat(best.id, 'deaths');
    }
    socket.emit(COMBAT.RESULT, { hit: true, kill: killed, headshot: best.head });
    io.to(best.id).emit(COMBAT.DAMAGE, {
      hp: Math.max(0, Math.ceil(victim.hp)),
      fromName: nameOf(socket.id),
      killed,
    });
    if (killed) {
      io.emit(COMBAT.KILL, {
        killerName: nameOf(socket.id),
        victimName: nameOf(best.id),
        headshot: best.head,
      });
    }
  }

  // Same-account reconnect mid-match: restore them as a member with kept stats.
  function rejoin(socketId) {
    if (status !== 'live' || members.includes(socketId)) return;
    const u = lobby.get(socketId)?.userId;
    if (u == null || !stats.has(u)) return;
    members.push(socketId);
    const idx = freeSpawnIdx();
    spawnIdx[socketId] = idx;
    const s = SPAWNS[idx];
    spawns[socketId] = { x: s[0], z: s[1] };
    hp.set(socketId, { hp: 100, alive: true, respawnAt: 0, lastHurt: 0, lastShot: 0, by: null });
    broadcast();
  }

  function drop(id) {
    pos.delete(id);
    lastSeen.delete(id);
    hp.delete(id);
    delete spawns[id];
    delete spawnIdx[id];
  }

  function leaveMatch(socket) {
    if (!members.includes(socket.id)) return;
    members = members.filter((id) => id !== socket.id);
    drop(socket.id);
    if (members.length === 0) end(null);
    else broadcast();
  }

  function removeSocket(id) {
    const wasMember = members.includes(id);
    if (wasMember) members = members.filter((m) => m !== id);
    drop(id);
    if (status === 'live' && wasMember) {
      if (members.length === 0) end(null);
      else broadcast();
    }
    if (status === 'countdown' && lobby.size === 0) {
      clearTimeout(countdownTimer);
      status = 'lobby';
      members = [];
      broadcast();
    }
  }

  return { state, start, end, leaveMatch, onUpdate, onShoot, rejoin, removeSocket, hostId };
}
