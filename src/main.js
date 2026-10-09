import * as THREE from 'three';
import { buildArena, collideWorld, groundHeight, ParticlePool } from './arena.js';
import { Enemy } from './enemies.js';
import { AudioSys } from './audio.js';
import { initLobby } from './lobby.js';
import { initChat } from './chat.js';
import { net } from './net.js';
import { RemotePlayer } from './remote.js';
import { SEND_MS } from '../shared/protocol.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('game'), startScreen = $('start-screen'), pauseScreen = $('pause-screen');
const overScreen = $('gameover-screen'), playBtn = $('play-btn'), resumeBtn = $('resume-btn');
const pauseRestartBtn = $('pause-restart-btn'), againBtn = $('again-btn'), muteBtn = $('mute-btn');
const hpBar = $('hp-bar'), hpText = $('hp-text'), ammoEl = $('ammo'), reloadTip = $('reload-tip');
const waveEl = $('wave'), remainingEl = $('remaining'), killsEl = $('kills');
const hitmarkerEl = $('hitmarker'), vignette = $('vignette'), banner = $('wave-banner');
const crosshair = $('crosshair'), hud = $('hud');
const settingsScreen = $('settings-screen'), sensSlider = $('sens-slider'), sensValue = $('sens-value');
const qualitySelect = $('quality-select'), volSlider = $('vol-slider'), volValue = $('vol-value');

// ---------- Settings (persisted) ----------
const SETTINGS_KEY = 'neon-breach-settings';
const DEFAULTS = { sens: 1.0, quality: 'high', volume: 0.35 };
let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    const p = JSON.parse(raw);
    if (typeof p.sens === 'number') settings.sens = Math.max(0.1, Math.min(3, p.sens));
    if (['low', 'medium', 'high'].includes(p.quality)) settings.quality = p.quality;
    if (typeof p.volume === 'number') settings.volume = Math.max(0, Math.min(1, p.volume));
  }
} catch { /* private mode */ }
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
AudioSys.setVolume(settings.volume);

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';

const world = buildArena(scene);
const particles = new ParticlePool(scene);

// Graphics quality — each level has real effects:
// low: 1x pixels, no shadows, dim accents, few particles
// medium: 1.5x pixels, 1024 shadows, normal accents, most particles
// high: 2x pixels, 2048 shadows, full accents, all particles
function applyQuality(q) {
  settings.quality = q;
  const dpr = window.devicePixelRatio || 1;
  if (q === 'low') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    world.sun.castShadow = false;
    particles.density = 0.35;
    world.cyan.intensity = 25; world.magenta.intensity = 25; world.warm.intensity = 10;
  } else if (q === 'medium') {
    renderer.setPixelRatio(Math.min(dpr, 1.5));
    renderer.shadowMap.enabled = true;
    world.sun.castShadow = true;
    setShadowSize(1024);
    particles.density = 0.7;
    world.cyan.intensity = 45; world.magenta.intensity = 45; world.warm.intensity = 18;
  } else {
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.shadowMap.enabled = true;
    world.sun.castShadow = true;
    setShadowSize(2048);
    particles.density = 1;
    world.cyan.intensity = 60; world.magenta.intensity = 60; world.warm.intensity = 25;
  }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  saveSettings();
}
function setShadowSize(s) {
  if (world.sun.shadow.mapSize.x === s) return;
  world.sun.shadow.mapSize.set(s, s);
  if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
}
applyQuality(settings.quality);

// ---------- Player ----------
const EYE = 1.7, RADIUS = 0.55;
const GRAV = 24, JUMP_VEL = 8.8, COYOTE = 0.12;
const player = {
  pos: new THREE.Vector3(0, EYE, 20), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, onGround: true, coyote: 0,
  hp: 100, maxHp: 100, lastHurt: -99,
  bobPhase: 0,
};
const keys = {};
let playing = false, started = false, gameOver = false;
let ads = false;

// ---------- Weapon (sci-fi rifle, original stylized design) ----------
const gun = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2132, roughness: 0.45, metalness: 0.85 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: 0.4, metalness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x00eeff, emissiveIntensity: 2.2 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x252c40, roughness: 0.8, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.5), mid);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), gripMat);
  grip.position.set(0, -0.14, 0.12); grip.rotation.x = 0.3;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 10), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.42);
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.34), dark);
  shroud.position.set(0, 0.04, -0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.06), dark);
  sight.position.set(0, 0.12, -0.05);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), glow);
  dot.position.set(0, 0.12, -0.05);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.4), glow);
  strip.position.set(0, -0.05, -0.02);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.22), gripMat);
  stock.position.set(0, -0.02, 0.32);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  mag.position.set(0, -0.15, -0.02); mag.rotation.x = 0.25;
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.3), mid);
  railL.position.set(-0.055, 0.04, -0.32);
  const railR = railL.clone(); railR.position.x = 0.055;
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), mid);
  ring1.position.set(0, 0.04, -0.5);
  const ring2 = ring1.clone(); ring2.position.z = -0.58;
  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), gripMat);
  foregrip.position.set(0, -0.08, -0.3);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xaaffff, transparent: true, opacity: 0.9 }));
  tip.position.set(0, 0.04, -0.65); tip.visible = false;
  // star-shaped muzzle flash card (cheap, additive)
  const flashTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(160,240,255,0.9)');
    grad.addColorStop(1, 'rgba(0,238,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.set(0.34, 0.34, 1);
  flash.position.set(0, 0.04, -0.72);
  gun.add(body, grip, barrel, shroud, sight, dot, strip, stock, mag, railL, railR, ring1, ring2, foregrip, tip, flash);
  gun.userData.tip = tip;
  gun.userData.flash = flash;
  gun.userData.mag = mag;
}
const HIP_POS = new THREE.Vector3(0.27, -0.24, -0.5);
const ADS_POS = new THREE.Vector3(0, -0.155, -0.35);
gun.position.copy(HIP_POS);
camera.add(gun);
scene.add(camera);
const muzzleLight = new THREE.PointLight(0x66eeff, 0, 9);
muzzleLight.position.set(0.27, -0.1, -1.2);
camera.add(muzzleLight);

const MAG = 30, RELOAD_TIME = 1.5, FIRE_CD = 0.13;
let ammo = MAG, reloading = false, reloadTimer = 0, lastShot = 0, muzzleTimer = 0, hitTimer = 0;
let crossHeat = 0; // crosshair expansion from firing + movement
const crossInner = crosshair.firstElementChild;

// Tracers: additive glowing beams + pooled smoke puffs (cheap, reused).
const tracers = [];
function fireBeam(from, to, color, width = 0.03, life = 0.09) {
  const len = from.distanceTo(to);
  if (len < 0.1) return;
  const geo = new THREE.BoxGeometry(width, width, len);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.lookAt(to);
  scene.add(m);
  // bright core + softer outer glow (2 draws, short life)
  const outer = new THREE.Mesh(new THREE.BoxGeometry(width * 2.4, width * 2.4, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  outer.position.copy(m.position); outer.quaternion.copy(m.quaternion);
  scene.add(outer);
  tracers.push({ m, life, outer });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    const k = Math.max(0, t.life * 10);
    t.m.material.opacity = k;
    if (t.outer) t.outer.material.opacity = k * 0.3;
    if (t.life <= 0) {
      scene.remove(t.m, t.outer);
      t.m.geometry.dispose(); t.m.material.dispose();
      if (t.outer) { t.outer.geometry.dispose(); t.outer.material.dispose(); }
      tracers.splice(i, 1);
    }
  }
}
// Smoke puffs: 12 reusable additive-soft sprites for impacts + muzzle.
const smokePool = [];
let smokeIdx = 0;
{
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(200,210,225,0.55)');
  grad.addColorStop(1, 'rgba(200,210,225,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(0.5, 0.5, 1);
    s.visible = false;
    scene.add(s);
    smokePool.push({ s, life: 0 });
  }
}
function puffSmoke(pos, scale = 0.6) {
  const p = smokePool[smokeIdx++ % smokePool.length];
  p.s.visible = true;
  p.s.position.copy(pos);
  p.s.scale.set(scale, scale, 1);
  p.s.material.opacity = 0.5;
  p.life = 0.6;
}
function updateSmoke(dt) {
  for (const p of smokePool) {
    if (!p.s.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    p.s.position.y += dt * 0.8;
    const k = 1 + dt * 1.6;
    p.s.scale.multiplyScalar(k);
    p.s.material.opacity = Math.max(0, p.life * 0.8);
  }
}

// ---------- Enemies & waves ----------
let enemies = [];
let wave = 1, kills = 0, startTime = 0, elapsed = 0;
let pendingSpawns = 0, reinforceTimer = 0, breakTimer = 0, inBreak = false;
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

function enemyStats(w) {
  return {
    hp: 60 + (w - 1) * 20,
    speed: Math.min(2.4 + w * 0.18, 4.4),
    damage: Math.min(7 + w, 16),
  };
}
function spawnEnemy() {
  const s = enemyStats(wave);
  // distinct accent color per enemy so hostiles read clearly
  const ACCENTS = [0x00eeff, 0xffb14e, 0xff5f8f, 0x9dff3b];
  s.accent = ACCENTS[enemies.length % ACCENTS.length];
  const cands = world.spawnPoints.filter((p) => p.distanceTo(player.pos) > 14);
  const at = (cands.length ? cands : world.spawnPoints)[Math.floor(Math.random() * (cands.length || world.spawnPoints.length))];
  const jitter = new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
  enemies.push(new Enemy(scene, at.clone().add(jitter), s));
}
function startWave(n) {
  wave = n;
  const count = Math.min(2 + n, 8);
  const immediate = Math.min(count, 6);
  pendingSpawns = count - immediate;
  reinforceTimer = 0;
  for (let i = 0; i < immediate; i++) spawnEnemy();
  banner.textContent = `WAVE ${n}`;
  banner.classList.remove('hidden');
  void banner.offsetWidth;
  banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
  setTimeout(() => banner.classList.add('hidden'), 2600);
  AudioSys.wave();
  updateHUD();
}

function losClear(fromPos, toPos) {
  const dir = tmpV.subVectors(toPos, fromPos);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.normalize();
  raycaster.set(fromPos, dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(world.solids, false);
  return hits.length === 0;
}

// ---------- Combat ----------
function showHitmarker(kill) {
  hitmarkerEl.classList.toggle('kill', !!kill);
  hitmarkerEl.classList.add('show');
  hitTimer = 0.14;
}
function damagePlayer(amount) {
  if (gameOver || !playing) return;
  player.hp = Math.max(0, player.hp - amount);
  player.lastHurt = elapsed;
  vignette.classList.add('show');
  setTimeout(() => vignette.classList.remove('show'), 160);
  AudioSys.hurt();
  updateHUD();
  if (player.hp <= 0) endGame();
}

const muzzleWorld = new THREE.Vector3();
const enemyHeadTmp = new THREE.Vector3();
function shoot(now) {
  if (!playing || gameOver || reloading || (mp.active && mp.dead)) return;
  if (now - lastShot < FIRE_CD * 1000) return;
  if (ammo <= 0) {
    AudioSys.empty();
    startReload();
    return;
  }
  lastShot = now;
  ammo--;
  AudioSys.shoot();

  gun.userData.tip.visible = true;
  if (gun.userData.flash) {
    gun.userData.flash.material.opacity = 0.95;
    const fs = 0.3 + Math.random() * 0.12;
    gun.userData.flash.scale.set(fs, fs, 1);
  }
  muzzleLight.intensity = 8;
  muzzleTimer = 0.05;
  gun.userData.tip.getWorldPosition(muzzleWorld);
  puffSmoke(muzzleWorld, 0.35);
  gun.position.z += 0.06;
  gun.rotation.x -= 0.045; // recoil kick, recovered in animate
  crossHeat = Math.min(1, crossHeat + 0.22);

  gun.userData.tip.getWorldPosition(muzzleWorld);
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 120;
  const aliveMeshes = [];
  for (const e of enemies) if (e.alive) aliveMeshes.push(...e.hitMeshes);
  const eHits = raycaster.intersectObjects(aliveMeshes, false);
  const wHits = raycaster.intersectObjects(world.solids, false);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorPt = new THREE.Vector3();
  const floorHit = raycaster.ray.intersectPlane(floorPlane, floorPt);

  const eDist = eHits.length ? eHits[0].distance : Infinity;
  const wDist = wHits.length ? wHits[0].distance : Infinity;

  let end;
  if (eDist < wDist) {
    const h = eHits[0];
    const enemy = h.object.userData.enemy;
    const headshot = h.object.userData.headshot === true;
    end = h.point;
    const killed = enemy.takeDamage(headshot ? 68 : 34, particles, h.point);
    AudioSys.hit();
    showHitmarker(killed);
    if (killed) {
      kills++;
      AudioSys.kill();
    }
  } else if (wHits.length) {
    end = wHits[0].point;
    particles.burst(end, 0xffbb33, 6);
    particles.burst(end, 0xfff2cc, 3);
    puffSmoke(end, 0.7);
  } else if (floorHit && raycaster.ray.direction.y < 0) {
    end = floorPt;
    particles.burst(end, 0x33ccff, 4);
    puffSmoke(end, 0.5);
  } else {
    end = raycaster.ray.at(60, new THREE.Vector3());
  }
  fireBeam(muzzleWorld.clone(), end.clone(), 0x66f6ff, ads ? 0.02 : 0.035);
  if (mp.active) {
    // Server owns hit validation: send the camera ray, keep local world tracer.
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    net.sendShoot({ o: { x: o.x, y: o.y, z: o.z }, d: { x: d.x, y: d.y, z: d.z } });
  }
  if (ammo === 0) startReload();
  updateHUD();
}

function startReload() {
  if (reloading || ammo === MAG) return;
  reloading = true;
  reloadTimer = RELOAD_TIME;
  reloadTip.classList.remove('hidden');
  AudioSys.reload();
}
function updateReload(dt) {
  if (!reloading) return;
  reloadTimer -= dt;
  const k = 1 - reloadTimer / RELOAD_TIME;
  gun.rotation.x = Math.sin(k * Math.PI) * 0.5;
  gun.userData.mag.position.y = -0.15 - Math.sin(k * Math.PI) * 0.09; // mag drop/insert
  if (reloadTimer <= 0) {
    reloading = false;
    ammo = MAG;
    gun.rotation.x = 0;
    gun.userData.mag.position.y = -0.15;
    reloadTip.classList.add('hidden');
    updateHUD();
  }
}

// ---------- HUD ----------
function updateHUD() {
  const pct = Math.max(0, (player.hp / player.maxHp) * 100);
  hpBar.style.width = pct + '%';
  hpBar.classList.toggle('low', pct <= 30);
  hpText.textContent = `${Math.ceil(player.hp)}`;
  ammoEl.innerHTML = `${ammo} <span>/ ∞</span>`;
  ammoEl.classList.toggle('empty', ammo === 0);
  waveEl.textContent = wave;
  remainingEl.textContent = enemies.filter((e) => e.alive).length + pendingSpawns;
  killsEl.textContent = kills;
}

// ---------- Flow ----------
function resetGame() {
  for (const e of enemies) e.dispose();
  enemies = [];
  for (const t of tracers) { scene.remove(t.m); if (t.outer) scene.remove(t.outer); }
  tracers.length = 0;
  player.pos.set(0, EYE, 20); player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0;
  player.onGround = true; player.coyote = COYOTE;
  player.hp = player.maxHp; player.lastHurt = -99;
  ammo = MAG; reloading = false; reloadTip.classList.add('hidden');
  wave = 1; kills = 0; elapsed = 0; startTime = performance.now();
  pendingSpawns = 0; inBreak = false; breakTimer = 0;
  gameOver = false;
  updateHUD();
  startWave(1);
}
function endGame() {
  gameOver = true;
  playing = false;
  document.exitPointerLock?.();
  $('stat-wave').textContent = wave;
  $('stat-kills').textContent = kills;
  $('stat-time').textContent = `${Math.floor(elapsed)}s`;
  overScreen.classList.remove('hidden');
}
function lock() { canvas.requestPointerLock(); }

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    playing = true;
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');
    hud.classList.remove('hidden');
  } else {
    playing = false;
    ads = false;
    if (started && !gameOver && !mp.leaving && settingsScreen.classList.contains('hidden')) {
      pauseScreen.classList.remove('hidden');
    }
  }
});

playBtn.addEventListener('click', () => {
  AudioSys.init();
  AudioSys.setVolume(settings.volume);
  started = true;
  resetGame();
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  lock();
});
resumeBtn.addEventListener('click', () => lock());
pauseRestartBtn.addEventListener('click', () => {
  resetGame();
  pauseScreen.classList.add('hidden');
  lock();
});
againBtn.addEventListener('click', () => {
  resetGame();
  overScreen.classList.add('hidden');
  lock();
});
function toggleMute() {
  AudioSys.init();
  muteBtn.textContent = AudioSys.toggleMute() ? '🔇' : '🔊';
}
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });

// ---------- LAN lobby (Stage 1: presence; match stage adds host/start) ----------
initLobby({ enterMatch });

// ---------- Settings menu ----------
let settingsFrom = 'start'; // which screen to return to
function syncSettingsUI() {
  sensSlider.value = settings.sens;
  sensValue.textContent = Number(settings.sens).toFixed(1);
  qualitySelect.value = settings.quality;
  volSlider.value = settings.volume;
  volValue.textContent = `${Math.round(settings.volume * 100)}%`;
}
function openSettings(from) {
  settingsFrom = from;
  syncSettingsUI();
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  settingsScreen.classList.remove('hidden');
}
function closeSettings() {
  settingsScreen.classList.add('hidden');
  if (!started || gameOver) {
    if (!gameOver) startScreen.classList.remove('hidden');
  } else if (!playing) {
    pauseScreen.classList.remove('hidden');
  }
}
$('settings-btn').addEventListener('click', () => openSettings('start'));
$('pause-settings-btn').addEventListener('click', () => openSettings('pause'));
$('settings-back-btn').addEventListener('click', closeSettings);
$('settings-reset-btn').addEventListener('click', () => {
  settings = { ...DEFAULTS };
  AudioSys.setVolume(settings.volume);
  applyQuality(settings.quality);
  syncSettingsUI();
});
sensSlider.addEventListener('input', () => {
  settings.sens = parseFloat(sensSlider.value);
  sensValue.textContent = Number(settings.sens).toFixed(1);
  saveSettings();
});
qualitySelect.addEventListener('change', () => applyQuality(qualitySelect.value));
volSlider.addEventListener('input', () => {
  settings.volume = parseFloat(volSlider.value);
  volValue.textContent = `${Math.round(settings.volume * 100)}%`;
  AudioSys.init();
  AudioSys.setVolume(settings.volume);
  saveSettings();
});

// ---------- Input ----------
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyM') toggleMute();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mousemove', (e) => {
  if (!playing) return;
  const s = (ads ? 0.0013 : 0.0022) * settings.sens;
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.addEventListener('mousedown', (e) => {
  if (!playing) return;
  // Clicks inside the chat panel must never shoot or aim.
  if (e.target instanceof Element && e.target.closest('#chat-panel')) return;
  if (e.button === 0) shoot(performance.now());
  if (e.button === 2) { ads = true; crosshair.classList.add('ads'); }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 2) { ads = false; crosshair.classList.remove('ads'); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', () => {
  if (started && !playing && !gameOver && !settingsScreen.classList.contains('hidden')) return;
  if (started && !playing && !gameOver && !pauseScreen.classList.contains('hidden')) lock();
});

// ---------- Player update ----------
function updatePlayer(dt) {
  const sprint = (keys['ShiftLeft'] || keys['ShiftRight']) && !ads;
  const speed = ads ? 3 : sprint ? 9 : 5.2;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const noInput = mp.active && mp.dead; // eliminated: camera moves, body doesn't
  let ix = 0, iz = 0;
  if (!noInput && keys['KeyW']) { ix -= sin; iz -= cos; }
  if (!noInput && keys['KeyS']) { ix += sin; iz += cos; }
  if (!noInput && keys['KeyA']) { ix -= cos; iz += sin; }
  if (!noInput && keys['KeyD']) { ix += cos; iz -= sin; }
  const len = Math.hypot(ix, iz);
  const moving = len > 0;
  if (moving) { ix = (ix / len) * speed; iz = (iz / len) * speed; }
  player.vel.x = ix; player.vel.z = iz;
  // Horizontal move + push-out (boxes at/below feet are skipped so roofs are walkable).
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collideWorld(player.pos, RADIUS, world.boxes, world.circles, EYE);
  // Vertical: gravity + landing on ground or box tops.
  const feetPrev = player.pos.y - EYE;
  player.vel.y -= GRAV * dt;
  if (!noInput && keys['Space'] && (player.onGround || player.coyote > 0)) {
    player.vel.y = JUMP_VEL;
    player.onGround = false;
    player.coyote = 0;
  }
  player.pos.y += player.vel.y * dt;
  const feetNew = player.pos.y - EYE;
  // Highest surface we could stand on, given where we started this frame.
  const support = groundHeight(player.pos.x, player.pos.z, Math.max(feetPrev, feetNew), RADIUS, world.boxes);
  const wasGround = player.onGround;
  if (player.vel.y <= 0 && feetNew <= support) {
    // Landing (ground or rooftop): snap, stop falling, regain footing.
    player.pos.y = support + EYE;
    player.vel.y = 0;
    player.onGround = true;
    player.coyote = COYOTE;
  } else if (feetNew <= 0) {
    player.pos.y = EYE;
    player.vel.y = 0;
    player.onGround = true;
    player.coyote = COYOTE;
  } else {
    // Walked off an edge: brief coyote grace before becoming airborne.
    if (wasGround) player.coyote = COYOTE;
    else player.coyote = Math.max(0, player.coyote - dt);
    if (player.coyote <= 0) player.onGround = false;
  }
  void wasGround;

  // head bob
  if (moving && player.onGround) player.bobPhase += dt * (sprint ? 12 : 9);
  const bobY = moving && player.onGround ? Math.sin(player.bobPhase) * 0.045 : 0;
  const bobX = moving && player.onGround ? Math.cos(player.bobPhase * 0.5) * 0.02 : 0;

  camera.position.set(player.pos.x + bobX * cos, player.pos.y + bobY, player.pos.z - bobX * sin);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;

  // ADS: fov + gun position lerp
  const targetFov = ads ? 52 : 75;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
  gun.position.lerp(ads ? ADS_POS : HIP_POS, Math.min(1, dt * 12));
  // subtle weapon sway while walking / sprinting (not while aiming)
  if (!ads && moving && player.onGround) {
    gun.position.x += Math.cos(player.bobPhase * 0.5) * 0.006;
    gun.position.y += Math.abs(Math.sin(player.bobPhase)) * 0.004;
    gun.rotation.z = Math.cos(player.bobPhase * 0.5) * (sprint ? 0.03 : 0.015);
  } else {
    gun.rotation.z *= 0.85;
  }

  // health regen after 5s calm (single-player only; the server regens in matches)
  if (!mp.active && elapsed - player.lastHurt > 5 && player.hp < player.maxHp && !gameOver) {
    player.hp = Math.min(player.maxHp, player.hp + 6 * dt);
    updateHUD();
  }
}

// ---------- Enemy update ----------
const playerEye = new THREE.Vector3();
function updateEnemies(dt) {
  playerEye.copy(player.pos);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    let clear = false;
    if (e.alive) {
      enemyHeadTmp.copy(e.group.position); enemyHeadTmp.y += 1.8;
      clear = losClear(enemyHeadTmp, playerEye);
    }
    const evt = e.update(dt, player.pos, world, clear);
    if (evt && evt.type === 'enemyFire') {
      AudioSys.enemyShoot();
      const dist = evt.from.distanceTo(playerEye);
      const hitChance = THREE.MathUtils.clamp(1.25 - dist / 22, 0.25, 0.92);
      const hits = Math.random() < hitChance;
      const target = hits ? playerEye.clone() : playerEye.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
      fireBeam(evt.from.clone(), target, 0xff3344, 0.03, 0.12);
      particles.burst(evt.from, 0xff3344, 3);
      if (hits) damagePlayer(e.damage);
    }
    if (!e.alive && e.deadTimer <= 0) {
      e.dispose();
      enemies.splice(i, 1);
      updateHUD();
    }
  }
  // separation steering so enemies don't overlap
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive) continue;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.25 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (1.5 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.group.position.x -= nx * push; a.group.position.z -= nz * push;
        b.group.position.x += nx * push; b.group.position.z += nz * push;
      }
    }
  }
  // reinforcements
  if (pendingSpawns > 0) {
    reinforceTimer -= dt;
    const aliveCount = enemies.filter((e) => e.alive).length;
    if (reinforceTimer <= 0 && aliveCount < 5) {
      spawnEnemy();
      pendingSpawns--;
      reinforceTimer = 2.5;
      updateHUD();
    }
  }
  // wave clear -> break -> next
  const aliveCount = enemies.filter((e) => e.alive).length;
  if (!inBreak && aliveCount === 0 && pendingSpawns <= 0 && !gameOver) {
    inBreak = true;
    breakTimer = 3.5;
  }
  if (inBreak) {
    breakTimer -= dt;
    if (breakTimer <= 0) {
      inBreak = false;
      startWave(wave + 1);
    }
  }
}

// ---------- Multiplayer match (no bots; movement sync only, combat comes later) ----------
const matchBar = $('match-bar'), matchTime = $('match-time'), matchCount = $('match-count');
const hudRight = $('hud-right'), leaveMatchBtn = $('leave-match-btn');
const mp = { active: false, leaving: false, dead: false, spawn: { x: 0, z: 20 }, remotes: new Map(), sendAcc: 0, startedAt: 0, scoreSig: '' };
let lastMatch = { status: 'lobby', members: [], endsAt: 0, startedAt: 0 };

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function updateMatchBar() {
  if (!mp.active) return;
  matchTime.textContent = fmtTime(Date.now() - mp.startedAt);
  matchCount.textContent = lastMatch.members.length;
}

function enterMatch(spawn) {
  // Bot-free arena: clear any single-player enemies, never start waves here.
  for (const e of enemies) e.dispose();
  enemies = [];
  pendingSpawns = 0;
  inBreak = false;
  banner.classList.add('hidden');
  mp.active = true;
  mp.leaving = false;
  mp.spawn = spawn;
  mp.startedAt = lastMatch.startedAt || Date.now();
  mp.sendAcc = 0;
  player.pos.set(spawn.x, EYE, spawn.z);
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(spawn.x, spawn.z); // face arena center
  player.pitch = 0;
  player.onGround = true;
  player.coyote = COYOTE;
  player.hp = player.maxHp;
  player.lastHurt = -99;
  ammo = MAG;
  reloading = false;
  reloadTip.classList.add('hidden');
  gameOver = false;
  started = true;
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  $('lobby-screen')?.classList.add('hidden');
  hud.classList.remove('hidden');
  hudRight?.classList.add('hidden');
  matchBar?.classList.remove('hidden');
  pauseRestartBtn.classList.add('hidden');
  leaveMatchBtn?.classList.remove('hidden');
  mp.dead = false;
  mp.scoreSig = '';
  $('mp-death')?.classList.add('hidden');
  $('mp-score')?.classList.remove('hidden');
  const kf = $('kill-feed');
  if (kf) kf.innerHTML = '';
  updateHUD();
  updateMatchBar();
  lock(); // Deploy click counts as the user gesture for pointer lock
}

function exitMatch() {
  if (!mp.active) return;
  mp.active = false;
  mp.leaving = true; // suppress the pause screen from our own unlock
  for (const r of mp.remotes.values()) r.dispose();
  mp.remotes.clear();
  matchBar?.classList.add('hidden');
  hudRight?.classList.remove('hidden');
  pauseRestartBtn.classList.remove('hidden');
  leaveMatchBtn?.classList.add('hidden');
  mp.dead = false;
  $('mp-death')?.classList.add('hidden');
  $('mp-score')?.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  document.exitPointerLock?.();
  $('lobby-screen')?.classList.remove('hidden');
  setTimeout(() => { mp.leaving = false; }, 150);
}

net.onMatch((m) => {
  lastMatch = m;
  if (!mp.active) return;
  const me = m.members.some((p) => p.id === net.id());
  if (m.status !== 'live' || !me) exitMatch();
  else updateMatchBar();
});

net.onSnapshot((snap) => {
  if (!mp.active) return;
  const seen = new Set();
  let my = null;
  for (const p of snap.players ?? []) {
    if (p.id === net.id()) {
      my = p;
      continue;
    }
    seen.add(p.id);
    let r = mp.remotes.get(p.id);
    if (!p.alive) {
      if (r) r.group.visible = false; // eliminated: hide until respawn
      continue;
    }
    if (!r) {
      const idx = Math.max(0, lastMatch.members.findIndex((m) => m.id === p.id));
      r = new RemotePlayer(scene, p.name ?? 'Player', idx, p.x, p.z);
      mp.remotes.set(p.id, r);
    }
    r.group.visible = true;
    r.setTarget(p.x, p.y - EYE, p.z, p.yaw);
  }
  for (const [id, r] of mp.remotes) {
    if (!seen.has(id)) {
      r.dispose();
      mp.remotes.delete(id);
    }
  }
  // The server owns my hp/alive in matches.
  if (my) {
    player.hp = my.hp;
    updateHUD();
    const deathText = $('mp-death-text');
    if (!my.alive && !mp.dead) {
      mp.dead = true;
      if (deathText) deathText.textContent = `ELIMINATED BY ${my.by ?? '???'} — RESPAWN IN ${Math.ceil((my.respawnIn ?? 3000) / 1000)}`;
      $('mp-death')?.classList.remove('hidden');
    } else if (!my.alive && mp.dead) {
      if (deathText) deathText.textContent = `ELIMINATED BY ${my.by ?? '???'} — RESPAWN IN ${Math.ceil((my.respawnIn ?? 0) / 1000)}`;
    } else if (my.alive && mp.dead) {
      mp.dead = false;
      player.pos.set(my.x, my.y, my.z); // authoritative respawn position
      player.vel.set(0, 0, 0);
      $('mp-death')?.classList.add('hidden');
    }
  }
  // Scoreboard (rebuild only when it changes).
  const rows = (snap.players ?? []).map((p) => ({
    n: p.id === net.id() ? `${p.name} (you)` : p.name,
    k: p.kills ?? 0,
    d: p.deaths ?? 0,
    self: p.id === net.id(),
  }));
  rows.sort((a, b) => b.k - a.k || a.d - b.d);
  const sig = JSON.stringify(rows);
  if (sig !== mp.scoreSig) {
    mp.scoreSig = sig;
    const el = $('mp-score-list');
    if (el) {
      el.innerHTML = '';
      for (const r of rows) {
        const li = document.createElement('li');
        li.textContent = `${r.n} — ${r.k}K / ${r.d}D`;
        if (r.self) li.classList.add('self');
        el.appendChild(li);
      }
    }
  }
});

// Server hit verdict for my shots (hitmarker + sound; tracer was local).
net.onCombatResult(({ hit, kill }) => {
  if (!mp.active || !hit) return;
  AudioSys.hit();
  showHitmarker(!!kill);
  if (kill) AudioSys.kill();
});

// Remote players' tracers, relayed by the server.
net.onCombatFx(({ from, to, hit }) => {
  if (!mp.active) return;
  const a = new THREE.Vector3(from.x, from.y, from.z);
  const b = new THREE.Vector3(to.x, to.y, to.z);
  fireBeam(a, b, 0xff4455, 0.03, 0.12);
  particles.burst(b, hit ? 0xff4455 : 0xffbb33, hit ? 6 : 3);
  if (camera.position.distanceTo(a) < 35) AudioSys.enemyShoot();
});

// Authoritative damage to me.
net.onCombatDamage(({ hp, killed }) => {
  if (!mp.active) return;
  player.hp = Math.max(0, hp);
  player.lastHurt = elapsed;
  vignette.classList.add('show');
  setTimeout(() => vignette.classList.remove('show'), 160);
  AudioSys.hurt();
  updateHUD();
  void killed;
});

// Kill feed for everyone.
net.onCombatKill(({ killerName, victimName, headshot }) => {
  if (!mp.active) return;
  const feed = $('kill-feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.textContent = `${killerName} ▸ ${victimName}${headshot ? ' ✖' : ''}`;
  feed.prepend(div);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => div.remove(), 4000);
});

leaveMatchBtn?.addEventListener('click', () => net.leaveMatch());

// ---------- Multiplayer chat (lobby + match; hidden in single-player) ----------
// Called here (after mp exists) so the deploy check never hits a TDZ.
initChat({ isDeployed: () => mp.active && !mp.leaving });

// ---------- Main loop ----------
resetGame();
// menu backdrop: freeze gameplay until Play
playing = false;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const active = playing && !gameOver;
  if (active) {
    elapsed = (performance.now() - startTime) / 1000;
    updatePlayer(dt);
    updateReload(dt);
    if (mp.active) {
      // Match mode: sync self, interpolate remotes, never run bot waves.
      mp.sendAcc += dt;
      if (mp.sendAcc >= SEND_MS / 1000 && !mp.dead) {
        mp.sendAcc = 0;
        net.sendUpdate({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw });
      }
      for (const r of mp.remotes.values()) r.update(dt);
      updateMatchBar();
    } else {
      updateEnemies(dt);
    }
  } else if (!started) {
    // slow menu camera drift
    const t = performance.now() * 0.0001;
    camera.position.set(Math.sin(t) * 10, 6, Math.cos(t) * 10 + 8);
    camera.lookAt(0, 1, 0);
  }
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (gun.userData.flash) gun.userData.flash.material.opacity = Math.max(0, muzzleTimer * 18);
    if (muzzleTimer <= 0) { gun.userData.tip.visible = false; muzzleLight.intensity = 0; }
  }
  if (hitTimer > 0) {
    hitTimer -= dt;
    if (hitTimer <= 0) hitmarkerEl.classList.remove('show');
  }
  gun.position.z += ((ads ? ADS_POS.z : HIP_POS.z) - gun.position.z) * Math.min(1, dt * 10);
  if (!reloading) gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 10); // recoil recovery
  // crosshair expansion: firing heat + movement spread
  const movingSpread = playing && (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']) ? 0.25 : 0;
  crossHeat = Math.max(0, crossHeat - dt * 3);
  const spread = 1 + crossHeat * 0.9 + movingSpread;
  crossInner.style.transform = `scale(${spread.toFixed(3)})`;
  crosshair.classList.toggle('hot', crossHeat > 0.35);
  world.update(dt, performance.now() * 0.001);
  particles.update(dt);
  updateTracers(dt);
  updateSmoke(dt);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
