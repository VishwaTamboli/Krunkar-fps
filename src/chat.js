// Session-wide multiplayer chat panel (bottom-right): one shared conversation
// across lobby and matches, unread badge + glow, C to toggle, Enter to send.
// XSS-safe rendering (textContent only), sticky autoscroll.
// Visibility follows the lobby screen / deployed state; single-player never
// sees it. Typing never reaches the game: the input stops key propagation,
// opening the panel clears stuck movement keys, and main.js ignores mouse
// clicks that land inside the panel.
import { net } from './net.js';
import { getToken, getUsername } from './auth.js';
import { MAX_MSG } from '../shared/protocol.js';

const $ = (id) => document.getElementById(id);

export function initChat({ isDeployed }) {
  const panel = $('chat-panel');
  if (!panel) return { refresh: () => {} };
  const header = $('chat-header'), badge = $('chat-badge'), minBtn = $('chat-min-btn');
  const list = $('chat-list');
  const input = $('chat-input'), sendBtn = $('chat-send-btn');

  let open = false;
  let focused = false;
  let connected = false;
  let unread = 0;
  let msgs = [];
  let stick = true;
  let histRequested = false;

  const fmtTs = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  function render() {
    list.innerHTML = '';
    for (const m of msgs) {
      const li = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'chead';
      const who = document.createElement('b');
      who.textContent = m.user;
      if (m.user === getUsername()) who.classList.add('self');
      const ts = document.createElement('span');
      ts.textContent = fmtTs(m.ts);
      head.append(who, ts);
      const txt = document.createElement('div');
      txt.className = 'cbody';
      txt.textContent = m.text;
      li.append(head, txt);
      list.appendChild(li);
    }
    if (stick) list.scrollTop = list.scrollHeight;
    input.disabled = !connected;
    input.placeholder = connected ? 'Message (Enter to send)' : 'Offline…';
  }

  function paintBadge() {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);
    panel.classList.toggle('glow', unread > 0 && (!open || !focused));
  }

  function setOpen(v) {
    open = v;
    panel.classList.toggle('closed', !open);
    if (open) {
      unread = 0;
      paintBadge();
      // Release any movement keys held when chat opened; main.js clears its
      // key state on window blur, and the input swallows further keydowns.
      window.dispatchEvent(new Event('blur'));
      input.focus();
    } else {
      input.blur();
    }
  }

  function viewing() {
    return open && focused;
  }

  function onIncoming(m) {
    if (!m || typeof m.user !== 'string' || typeof m.text !== 'string') return;
    msgs.push({ user: m.user, text: m.text, ts: m.ts });
    if (msgs.length > 200) msgs.shift();
    if (viewing()) render();
    else {
      unread += 1;
      paintBadge();
      render(); // keep list fresh behind the badge
    }
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_MSG) return;
    net.sendChat(text);
    input.value = '';
    input.focus();
  }

  function refresh() {
    const inLobbyView = !$('lobby-screen')?.classList.contains('hidden');
    const show = !!getToken() && (inLobbyView || !!isDeployed?.());
    panel.classList.toggle('hidden', !show);
    panel.classList.toggle('compact', !!isDeployed?.() && !inLobbyView);
    if (show && !histRequested) {
      histRequested = true;
      net.requestHistory();
    }
    if (!show) histRequested = false;
    render();
  }

  list.addEventListener('scroll', () => {
    stick = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  });
  header.addEventListener('click', () => setOpen(!open));
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });
  panel.addEventListener('focusin', () => {
    focused = true;
    unread = 0;
    paintBadge();
  });
  panel.addEventListener('focusout', () => {
    focused = panel.contains(document.activeElement);
    paintBadge();
  });
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // game keys (WASD/Space/R/…) must not fire while typing
    if (e.key === 'Enter') send();
  });
  // C toggles the panel; inputs handle their own keys. The game binds no C key.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC') return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (panel.classList.contains('hidden')) return;
    setOpen(!open);
  });

  net.onChatNew(onIncoming);
  net.onChatHistory(({ messages }) => {
    // Merge (don't overwrite): live messages may arrive around the response.
    const seen = new Set(msgs.map((m) => `${m.ts}|${m.user}|${m.text}`));
    const extra = (Array.isArray(messages) ? messages : []).filter(
      (m) => m && typeof m.user === 'string' && typeof m.text === 'string' &&
        !seen.has(`${m.ts}|${m.user}|${m.text}`)
    );
    msgs = msgs.concat(extra);
    msgs.sort((a, b) => a.ts - b.ts);
    msgs = msgs.slice(-200);
    render();
  });
  net.onStatus((c) => {
    connected = c;
    if (c) net.requestHistory();
    render();
  });
  net.onMatch(() => refresh());
  net.onState(() => refresh());

  // Visibility follows overlay/deploy state without coupling to lobby/main.
  const obs = new MutationObserver(refresh);
  for (const el of [$('lobby-screen'), $('match-bar')]) {
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  refresh();
  return { refresh };
}
