// Frontend transport: same-origin Socket.IO client for the LAN server.
// In dev, Vite proxies /socket.io to the backend. Singleton: lobby UI and the
// match code share one connection.
import { io } from 'socket.io-client';
import { EVENTS, MATCH, COMBAT, CHAT } from '../shared/protocol.js';
import { getToken, clearSession } from './auth.js';

// Backend URL for Socket.IO (set via VITE_BACKEND_URL at build time)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

function createNetClient() {
  let socket = null;
  const stateHandlers = new Set();
  const statusHandlers = new Set();
  const errorHandlers = new Set();
  const matchHandlers = new Set();
  const snapHandlers = new Set();
  const combatHandlers = { result: new Set(), fx: new Set(), damage: new Set(), kill: new Set() };
  const authHandlers = new Set();
  const chatNewHandlers = new Set();
  const chatHistHandlers = new Set();

  const setStatus = () => {
    const connected = !!socket?.connected;
    statusHandlers.forEach((f) => f(connected));
  };
  const authRequired = () => {
    clearSession();
    setStatus();
    authHandlers.forEach((f) => f());
  };

  return {
    connect() {
      if (socket) {
        if (!socket.connected) socket.connect();
        return socket;
      }
      // In production (Vercel), connect directly to Render backend for WebSocket support
      // In dev, Vite proxy handles it via relative path
      const url = BACKEND_URL || undefined;
      socket = io(url, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
      socket.on('connect', setStatus);
      socket.on('disconnect', setStatus);
      socket.on('connect_error', (e) => {
        if (/unauthorized/i.test(e?.message ?? '')) authRequired();
        else errorHandlers.forEach((f) => f({ message: 'Connection failed. Is the host server running?' }));
      });
      socket.on(EVENTS.STATE, (s) => stateHandlers.forEach((f) => f(s, socket.id)));
      socket.on(EVENTS.ERROR, (e) => errorHandlers.forEach((f) => f(e)));
      socket.on(MATCH.STATE, (m) => matchHandlers.forEach((f) => f(m, socket.id)));
      socket.on(MATCH.SNAP, (s) => snapHandlers.forEach((f) => f(s)));
      socket.on(COMBAT.RESULT, (r) => combatHandlers.result.forEach((f) => f(r)));
      socket.on(COMBAT.FX, (r) => combatHandlers.fx.forEach((f) => f(r)));
      socket.on(COMBAT.DAMAGE, (r) => combatHandlers.damage.forEach((f) => f(r)));
      socket.on(COMBAT.KILL, (r) => combatHandlers.kill.forEach((f) => f(r)));
      socket.on(CHAT.NEW, (m) => chatNewHandlers.forEach((f) => f(m)));
      socket.on(CHAT.HISTORY, (h) => chatHistHandlers.forEach((f) => f(h)));
      setStatus();
      return socket;
    },
    // Drop the connection so the next connect() picks up a fresh token.
    reconnect() {
      try {
        socket?.disconnect();
      } catch {
        /* ignore */
      }
      socket = null;
      return this.connect();
    },
    id() {
      return socket?.id ?? null;
    },
    // Lobby presence. Identity comes from the login session, not a name field.
    join() {
      this.connect().emit(EVENTS.JOIN);
    },
    leave() {
      socket?.emit(EVENTS.LEAVE);
    },
    // Match stage: host start/end, member leave, movement updates.
    startMatch() {
      socket?.emit(MATCH.START);
    },
    endMatch() {
      socket?.emit(MATCH.END);
    },
    leaveMatch() {
      socket?.emit(MATCH.LEAVE);
    },
    sendUpdate(u) {
      socket?.emit(MATCH.UPDATE, u);
    },
    sendShoot(s) {
      socket?.emit(COMBAT.SHOOT, s);
    },
    sendChat(text) {
      socket?.emit(CHAT.SEND, { text });
    },
    requestHistory() {
      socket?.emit(CHAT.HISTORY, {});
    },
    onChatNew(f) {
      chatNewHandlers.add(f);
      return () => chatNewHandlers.delete(f);
    },
    onChatHistory(f) {
      chatHistHandlers.add(f);
      return () => chatHistHandlers.delete(f);
    },
    onState(f) {
      stateHandlers.add(f);
      return () => stateHandlers.delete(f);
    },
    onStatus(f) {
      statusHandlers.add(f);
      return () => statusHandlers.delete(f);
    },
    onError(f) {
      errorHandlers.add(f);
      return () => errorHandlers.delete(f);
    },
    onMatch(f) {
      matchHandlers.add(f);
      return () => matchHandlers.delete(f);
    },
    onSnapshot(f) {
      snapHandlers.add(f);
      return () => snapHandlers.delete(f);
    },
    onCombatResult(f) {
      combatHandlers.result.add(f);
      return () => combatHandlers.result.delete(f);
    },
    onCombatFx(f) {
      combatHandlers.fx.add(f);
      return () => combatHandlers.fx.delete(f);
    },
    onCombatDamage(f) {
      combatHandlers.damage.add(f);
      return () => combatHandlers.damage.delete(f);
    },
    onCombatKill(f) {
      combatHandlers.kill.add(f);
      return () => combatHandlers.kill.delete(f);
    },
    onAuthRequired(f) {
      authHandlers.add(f);
      return () => authHandlers.delete(f);
    },
  };
}

export const net = createNetClient();
