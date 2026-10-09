// Lobby + match UI: auth gate, presence, host start, countdown, deploy, end.
// Single-player flow is untouched: this only wires the overlay DOM.
// hooks: { enterMatch(spawn) } — provided by main.js for the 3D transition.
import { net } from './net.js';
import { getUsername, setSession, apiRegister, apiLogin, apiMe, apiLogout } from './auth.js';

const $ = (id) => document.getElementById(id);

export function initLobby(hooks = {}) {
  const screen = $('lobby-screen');
  if (!screen) return;
  const authScreen = $('auth-screen');
  const userInput = $('auth-user'), passInput = $('auth-pass');
  const authError = $('auth-error'), lobbyUser = $('lobby-user');
  const list = $('lobby-list');
  const dot = $('lobby-dot'), statusText = $('lobby-status-text');
  const count = $('lobby-count'), error = $('lobby-error');
  const joinBtn = $('lobby-join-btn'), leaveBtn = $('lobby-leave-btn');
  const logoutBtn = $('lobby-logout-btn');
  const startBtn = $('lobby-start-btn'), deployBtn = $('lobby-deploy-btn');
  const endBtn = $('lobby-end-btn'), matchStatus = $('lobby-match-status');
  const banner = $('wave-banner');
  let lobby = { count: 0, players: [], host: null };
  let match = { status: 'lobby', members: [], endsAt: 0, startedAt: 0 };
  let selfId = null;
  let joined = false;
  let deployed = false;
  let cdTimer = null;

  const showError = (msg) => {
    if (!msg) {
      error.classList.add('hidden');
      error.textContent = '';
      return;
    }
    error.textContent = msg;
    error.classList.remove('hidden');
  };
  const showAuthError = (msg) => {
    if (!msg) {
      authError.classList.add('hidden');
      authError.textContent = '';
      return;
    }
    authError.textContent = msg;
    authError.classList.remove('hidden');
  };

  const isMember = () => match.members.some((m) => m.id === selfId);
  const isHost = () => selfId && lobby.host === selfId;

  const flashBanner = (text, ms = 1800) => {
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove('hidden');
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = '';
    clearTimeout(flashBanner.t);
    flashBanner.t = setTimeout(() => banner.classList.add('hidden'), ms);
  };

  const tickCountdown = () => {
    clearInterval(cdTimer);
    if (match.status !== 'countdown' || !banner) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((match.endsAt - Date.now()) / 1000));
      if (match.status !== 'countdown') {
        clearInterval(cdTimer);
        return;
      }
      banner.textContent = left > 0 ? `MATCH STARTS IN ${left}` : 'DEPLOY!';
      banner.classList.remove('hidden');
    };
    update();
    cdTimer = setInterval(update, 250);
  };

  const render = () => {
    count.textContent = `${lobby.count} online`;
    lobbyUser.textContent = getUsername() ?? '?';
    list.innerHTML = '';
    const inMatchIds = new Set(match.members.map((m) => m.id));
    for (const p of lobby.players) {
      const li = document.createElement('li');
      const self = p.id === selfId;
      let label = p.name;
      if (p.id === lobby.host) label = `👑 ${label}`;
      if (self) label += ' (you)';
      li.textContent = label;
      if (self) li.classList.add('self');
      if ((match.status === 'live' || match.status === 'countdown') && inMatchIds.has(p.id)) {
        const tag = document.createElement('span');
        tag.className = 'intag';
        tag.textContent = match.status === 'live' ? 'IN MATCH' : 'QUEUED';
        li.appendChild(tag);
      }
      list.appendChild(li);
    }
    joined = lobby.players.some((p) => p.id === selfId);
    joinBtn.disabled = joined;
    startBtn.classList.toggle('hidden', !(isHost() && match.status === 'lobby' && joined));
    deployBtn.classList.toggle('hidden', !(match.status === 'live' && isMember() && !deployed));
    endBtn.classList.toggle('hidden', !(isHost() && match.status !== 'lobby'));
    if (match.status === 'lobby') matchStatus.textContent = 'Waiting for the host to start.';
    else if (match.status === 'countdown') matchStatus.textContent = 'Match starting — get ready!';
    else if (isMember()) matchStatus.textContent = deployed ? 'You are deployed. Good luck!' : 'Match is live — deploy!';
    else matchStatus.textContent = 'Match in progress — wait for it to end.';
  };

  const renderStatus = (connected) => {
    dot.classList.toggle('on', connected);
    statusText.textContent = connected ? 'Connected' : 'Offline';
  };

  const showAuth = () => {
    screen.classList.add('hidden');
    authScreen?.classList.remove('hidden');
    showAuthError(null);
  };
  const showLobby = () => {
    authScreen?.classList.add('hidden');
    screen.classList.remove('hidden');
    showError(null);
    net.reconnect();
  };

  net.onState((s, id) => {
    lobby = s;
    selfId = id;
    render();
  });
  net.onStatus(renderStatus);
  net.onError((e) => showError(e?.message ?? 'Lobby error.'));
  net.onAuthRequired(() => {
    showError('Session expired. Log in again.');
    showAuth();
  });
  net.onMatch((m) => {
    const prev = match.status;
    match = m;
    if (match.status !== 'live') deployed = false;
    if (match.status === 'countdown') tickCountdown();
    else clearInterval(cdTimer);
    if (prev === 'countdown' && match.status === 'live') flashBanner('MATCH LIVE — DEPLOY!');
    if (prev !== 'lobby' && match.status === 'lobby') flashBanner('MATCH ENDED');
    render();
  });
  renderStatus(false);

  // Entry: multiplayer button checks the session first.
  $('mp-btn')?.addEventListener('click', async () => {
    $('start-screen')?.classList.add('hidden');
    showAuthError(null);
    try {
      const me = await apiMe();
      if (me.ok) {
        showLobby();
        return;
      }
    } catch {
      /* server down: fall through to auth screen */
    }
    authScreen?.classList.remove('hidden');
  });

  const login = async () => {
    showAuthError(null);
    try {
      const r = await apiLogin(userInput.value, passInput.value);
      if (!r.ok) {
        showAuthError(r.error ?? 'Login failed.');
        return;
      }
      setSession(r.token, r.username);
      passInput.value = '';
      showLobby();
    } catch {
      showAuthError('Cannot reach the host server.');
    }
  };
  const register = async () => {
    showAuthError(null);
    try {
      const r = await apiRegister(userInput.value, passInput.value);
      if (!r.ok) {
        showAuthError(r.error ?? 'Registration failed.');
        return;
      }
      await login(); // new account drops straight in
    } catch {
      showAuthError('Cannot reach the host server.');
    }
  };
  $('auth-login-btn')?.addEventListener('click', login);
  $('auth-register-btn')?.addEventListener('click', register);
  // Enter submits; stopPropagation keeps game keys from firing while typing.
  for (const input of [userInput, passInput]) {
    input?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') login();
    });
  }
  $('auth-back-btn')?.addEventListener('click', () => {
    authScreen?.classList.add('hidden');
    $('start-screen')?.classList.remove('hidden');
  });

  const back = () => {
    net.leave();
    screen.classList.add('hidden');
    if (!$('gameover-screen')?.classList.contains('hidden')) return;
    if ($('pause-screen')?.classList.contains('hidden')) $('start-screen')?.classList.remove('hidden');
    showError(null);
  };
  $('lobby-back-btn')?.addEventListener('click', back);
  joinBtn?.addEventListener('click', () => {
    showError(null);
    net.join();
  });
  logoutBtn?.addEventListener('click', async () => {
    net.leave();
    await apiLogout();
    net.reconnect();
    showAuth();
  });
  leaveBtn?.addEventListener('click', () => net.leave());
  startBtn?.addEventListener('click', () => {
    showError(null);
    net.startMatch();
  });
  endBtn?.addEventListener('click', () => net.endMatch());
  deployBtn?.addEventListener('click', () => {
    const me = match.members.find((m) => m.id === selfId);
    if (!me?.spawn || !hooks.enterMatch) return;
    deployed = true;
    render();
    hooks.enterMatch(me.spawn);
  });
}
