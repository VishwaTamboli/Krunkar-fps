// Session-wide chat: one shared conversation for every authenticated player,
// in the lobby and in matches. Splitting chat by room caused messages to
// silently "disappear" (players on different tabs never saw each other), so
// delivery is now a single room. Usernames come from the socket session, so
// senders can't be impersonated. History is in-memory only; no chat table.
import { CHAT, MAX_MSG, CHAT_HIST, CHAT_BURST, CHAT_WINDOW_MS } from '../shared/protocol.js';

export function createChat(io) {
  const hist = [];
  const buckets = new Map(); // socketId -> [timestamps] for rate limiting

  io.on('connection', (socket) => {
    socket.join('session');
    socket.on(CHAT.SEND, (raw) => {
      const text = String(raw?.text ?? '').trim();
      const user = socket.user?.username ?? '?';
      if (!text) return;
      if (text.length > MAX_MSG) {
        console.warn(`[chat] rejected over-long message from ${user}`);
        socket.emit('lobby:error', { message: `Message too long (max ${MAX_MSG} chars).` });
        return;
      }
      const now = Date.now();
      const arr = (buckets.get(socket.id) ?? []).filter((t) => now - t < CHAT_WINDOW_MS);
      if (arr.length >= CHAT_BURST) {
        console.warn(`[chat] rate-limited ${user}`);
        socket.emit('lobby:error', { message: 'Slow down — too many messages.' });
        return;
      }
      arr.push(now);
      buckets.set(socket.id, arr);
      const msg = { user, text: text.slice(0, MAX_MSG), ts: now };
      hist.push(msg);
      if (hist.length > CHAT_HIST) hist.shift();
      console.log(`[chat] ${user} (${text.length} chars)`);
      io.to('session').emit(CHAT.NEW, msg);
    });

    socket.on(CHAT.HISTORY, () => {
      socket.emit(CHAT.HISTORY, { scope: 'session', messages: hist.slice() });
    });

    socket.on('disconnect', () => {
      buckets.delete(socket.id);
    });
  });
}
