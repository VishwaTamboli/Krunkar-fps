// Tiny synthesized SFX via Web Audio API. No external files.
let ctx = null;
let master = null;
let muted = false;
let volume = 0.35;
const VOL_KEY = 'neon-breach-volume';

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    try {
      const saved = parseFloat(localStorage.getItem(VOL_KEY));
      if (!Number.isNaN(saved)) volume = Math.max(0, Math.min(1, saved));
    } catch { /* private mode */ }
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, type = 'square', vol = 1, slideTo = null, delay = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 1, delay = 0, lowpass = 3000) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const AudioSys = {
  init() { ensure(); },
  get muted() { return muted; },
  get volume() { return volume; },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* ignore */ }
    if (master && !muted) master.gain.value = volume;
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : volume;
    return muted;
  },
  shoot() { noise(0.12, 0.9, 0, 5000); tone(180, 0.1, 'square', 0.5, 60); },
  enemyShoot() { tone(900, 0.12, 'sawtooth', 0.35, 300); },
  hit() { tone(1400, 0.06, 'square', 0.5); },
  kill() { tone(700, 0.25, 'sawtooth', 0.6, 120); noise(0.2, 0.5, 0, 2500); },
  hurt() { tone(120, 0.25, 'sawtooth', 0.8, 50); noise(0.15, 0.4); },
  reload() { tone(500, 0.05, 'square', 0.4); tone(750, 0.05, 'square', 0.4, null, 0.15); tone(1000, 0.07, 'square', 0.5, null, 0.5); },
  empty() { tone(220, 0.05, 'square', 0.4); },
  wave() { tone(440, 0.12, 'square', 0.5); tone(660, 0.12, 'square', 0.5, null, 0.12); tone(880, 0.2, 'square', 0.5, null, 0.24); },
};
