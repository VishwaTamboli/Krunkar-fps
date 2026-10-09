import * as THREE from 'three';

export const ARENA = 56;
export const HALF = ARENA / 2;

// Simple pooled particle bursts (Points-based, no textures).
export class ParticlePool {
  constructor(scene, maxBursts = 24) {
    this.scene = scene;
    this.density = 1; // 0..1, lowered by graphics quality setting
    this.bursts = [];
    for (let i = 0; i < maxBursts; i++) {
      const n = 26;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.16, transparent: true, opacity: 1, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      scene.add(pts);
      this.bursts.push({ pts, vel: new Float32Array(n * 3), life: 0, n });
    }
    this.idx = 0;
  }
  burst(pos, color = 0xffcc33, speed = 5) {
    const b = this.bursts[this.idx++ % this.bursts.length];
    const active = Math.max(4, Math.floor(b.n * this.density));
    const p = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      if (i >= active) { p[i * 3 + 1] = -50; b.vel[i * 3] = b.vel[i * 3 + 1] = b.vel[i * 3 + 2] = 0; continue; }
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      b.vel[i * 3] = Math.cos(th) * Math.cos(ph) * s;
      b.vel[i * 3 + 1] = Math.abs(Math.sin(ph)) * s + 2;
      b.vel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * s;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.color.setHex(color);
    b.pts.material.opacity = 1;
    b.pts.visible = true;
    b.life = 0.55;
  }
  update(dt) {
    for (const b of this.bursts) {
      if (!b.pts.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.pts.visible = false; continue; }
      const p = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        b.vel[i * 3 + 1] -= 12 * dt;
        p[i * 3] += b.vel[i * 3] * dt;
        p[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
        p[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        if (p[i * 3 + 1] < 0.02 && p[i * 3 + 1] > -10) p[i * 3 + 1] = 0.02;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life * 2.5);
    }
  }
}

// Procedural canvas textures — original designs, no external assets.
function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2e35'; g.fillRect(0, 0, 256, 256);
  // aggregate speckle
  for (let i = 0; i < 900; i++) {
    const v = 30 + Math.random() * 40;
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // cracks
  g.strokeStyle = 'rgba(12,13,16,0.7)'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  // patch seams
  g.strokeStyle = 'rgba(15,16,20,0.9)'; g.lineWidth = 3;
  g.strokeRect(30, 40, 120, 90);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  t.anisotropy = 4;
  return t;
}

function paverTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d7f88'; g.fillRect(0, 0, 256, 256);
  // paver grid with tonal variation
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 115 + Math.random() * 25;
      g.fillStyle = `rgb(${v},${v},${v + 4})`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  g.strokeStyle = '#54555c'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  // wear
  g.fillStyle = 'rgba(60,60,66,0.25)';
  for (let i = 0; i < 80; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.anisotropy = 4;
  return t;
}

// Painted building facade: base plaster + floor bands + window grid. Original art.
function makeFacadeTexture(base, band, glass) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // subtle plaster noise
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // floor bands
  g.fillStyle = band;
  g.fillRect(0, 0, 256, 10); g.fillRect(0, 84, 256, 8); g.fillRect(0, 168, 256, 8);
  // windows: dark glass + frame + sill
  for (const y of [28, 112, 196]) {
    for (const x of [24, 96, 168]) {
      g.fillStyle = '#3a3f46'; g.fillRect(x - 3, y - 3, 62, 52);
      g.fillStyle = glass; g.fillRect(x, y, 56, 46);
      // glass sheen diagonal
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.beginPath(); g.moveTo(x, y + 46); g.lineTo(x + 24, y); g.lineTo(x + 40, y); g.lineTo(x + 16, y + 46); g.fill();
      g.fillStyle = band; g.fillRect(x - 3, y + 49, 62, 5);
    }
  }
  // ground-floor storefront band
  g.fillStyle = 'rgba(20,22,28,0.85)'; g.fillRect(0, 232, 256, 24);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function signTexture(text, color = '#00eeff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#05080f'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = color;
  g.font = 'bold 64px Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return new THREE.CanvasTexture(c);
}

export function buildArena(scene) {
  const boxes = [];   // {minX,maxX,minZ,maxZ,h,h0}
  const circles = []; // {x,z,r}
  const solids = [];  // meshes for bullet raycast blocking

  // Outdoor dusk sky, warm low sun + cool sky fill. Consistent palette:
  // sand/terracotta/slate buildings, teal + amber neon, green vegetation.
  scene.background = new THREE.Color(0x141c33);
  scene.fog = new THREE.Fog(0x1a2238, 34, 130);

  // Gradient sky dome (cheap canvas texture, BackSide) + moon + stars.
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0a0f24');
    grad.addColorStop(0.45, '#1a2238');
    grad.addColorStop(0.72, '#4a3a55');
    grad.addColorStop(0.88, '#b0623f');
    grad.addColorStop(1, '#2a2118');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(c);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(160, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    scene.add(dome);
    // Moon disc + soft halo.
    const moon = new THREE.Mesh(new THREE.CircleGeometry(5, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4ecd8, fog: false }));
    moon.position.set(-70, 62, -110); moon.lookAt(0, 10, 0);
    scene.add(moon);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(9, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4ecd8, transparent: true, opacity: 0.18, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, -0.5)); halo.lookAt(0, 10, 0);
    scene.add(halo);
    // Stars (single Points draw).
    const SN = 220;
    const sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.42;
      const r = 145;
      sp[i * 3] = Math.cos(th) * Math.cos(ph) * r;
      sp[i * 3 + 1] = 25 + Math.sin(ph) * r * 0.9;
      sp[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.7, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    stars.frustumCulled = false;
    scene.add(stars);
  }

  const hemi = new THREE.HemisphereLight(0x8fa7d6, 0x3a3226, 0.9);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x33415e, 0.55);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.7);
  sun.position.set(-24, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  // Cool moonlight rim from the opposite side (no shadow, cheap).
  const moonLight = new THREE.DirectionalLight(0x7d92d6, 0.35);
  moonLight.position.set(30, 40, -35);
  scene.add(moonLight);
  const fill = new THREE.DirectionalLight(0x5a78c8, 0.4);
  fill.position.set(22, 16, -20);
  scene.add(fill);
  const bounce = new THREE.PointLight(0x8a6a4a, 8, 60);
  bounce.position.set(0, 1.2, 0);
  scene.add(bounce);

  // Street-level neon / plaza accents (names kept for quality scaling).
  const cyan = new THREE.PointLight(0x22e6ff, 60, 40); cyan.position.set(-8, 4, -7); scene.add(cyan);
  const magenta = new THREE.PointLight(0xff2fd6, 60, 40); magenta.position.set(10, 4, 8); scene.add(magenta);
  const warm = new THREE.PointLight(0xffb14e, 25, 34); warm.position.set(0, 5, 0); scene.add(warm);

  // ---- Shared materials / geometries (reuse keeps draw setup cheap) ----
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95, metalness: 0.02 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.9, metalness: 0.03 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ab, roughness: 0.85, metalness: 0.05 });
  const plasterSand = new THREE.MeshStandardMaterial({ color: 0xc7a87e, roughness: 0.9, metalness: 0.02 });
  const plasterTerra = new THREE.MeshStandardMaterial({ color: 0xb0704f, roughness: 0.9, metalness: 0.02 });
  const plasterSlate = new THREE.MeshStandardMaterial({ color: 0x7e8ba0, roughness: 0.9, metalness: 0.05 });
  const plasterSage = new THREE.MeshStandardMaterial({ color: 0x9aa27e, roughness: 0.9, metalness: 0.02 });
  const trimDark = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.7, metalness: 0.3 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.8, metalness: 0.05 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3d4454, roughness: 0.5, metalness: 0.7 });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.6 });
  const neonTeal = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
  const neonAmber = new THREE.MeshBasicMaterial({ color: 0xffb14e });
  const neonPink = new THREE.MeshBasicMaterial({ color: 0xff5f8f });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7a3c, roughness: 0.9, metalness: 0 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5d8f43, roughness: 0.9, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 0.95, metalness: 0 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8d94, roughness: 0.95, metalness: 0.02 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.95, metalness: 0 });
  const whitePaint = new THREE.MeshBasicMaterial({ color: 0xd8d4c4 });
  const yellowPaint = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
  // --- Urban detail pass materials (shared, cheap) ---
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x2a3d55, roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.85 });
  const stainMat = new THREE.MeshBasicMaterial({ color: 0x0c0d10, transparent: true, opacity: 0.35, depthWrite: false });
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.55, metalness: 0.7 });
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x2f6f6b, roughness: 0.5, metalness: 0.4 });
  const bollardStripe = new THREE.MeshBasicMaterial({ color: 0xffe6b8 });
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xa83226, roughness: 0.55, metalness: 0.3 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3d6b32, roughness: 0.95, metalness: 0 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5a8f3e, roughness: 0.95, metalness: 0 });
  const flowerMatA = new THREE.MeshBasicMaterial({ color: 0xff5f8f });
  const flowerMatB = new THREE.MeshBasicMaterial({ color: 0xffc766 });
  const storeGlassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.08, metalness: 0.4, emissive: 0x33484f, emissiveIntensity: 0.7, transparent: true, opacity: 0.82 });
  const interiorGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poolLightMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const escapeMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6, metalness: 0.65 });

  // Solid box helper: registers bullet blocker + player/enemy collision + rooftop.
  const B = (x, z, w, h, d, mat, opts = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, (opts.y0 ?? 0) + h / 2, z);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    if (opts.ry) m.rotation.y = opts.ry;
    scene.add(m);
    if (opts.solid !== false) solids.push(m);
    if (opts.collide !== false) {
      boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: (opts.y0 ?? 0) + h, h0: opts.y0 ?? 0 });
    }
    return m;
  };

  // ---- Terrain: asphalt base, streets, sidewalks, curbs, plaza, drains ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA + 8, ARENA + 8), asphaltMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sidewalks raised 0.12 (walkable step-up) flanking both streets.
  const walk = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), sidewalkMat);
    m.position.set(x, 0.06, z); m.receiveShadow = true;
    scene.add(m);
  };
  walk(0, 4, ARENA, 2); walk(0, -4, ARENA, 2);
  walk(4, 0, 2, ARENA); walk(-4, 0, 2, ARENA);
  // Curbs.
  const curb = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), curbMat);
    m.position.set(x, 0.11, z); m.receiveShadow = true;
    scene.add(m);
  };
  curb(0, 5.1, ARENA, 0.25); curb(0, -5.1, ARENA, 0.25);
  curb(5.1, 0, 0.25, ARENA); curb(-5.1, 0, 0.25, ARENA);
  // Lane dashes + crosswalks (flat paint, no colliders).
  const dashG = new THREE.BoxGeometry(1.6, 0.02, 0.18);
  for (let x = -24; x <= 24; x += 4) {
    if (Math.abs(x) < 4) continue; // keep intersection clear
    const d1 = new THREE.Mesh(dashG, yellowPaint); d1.position.set(x, 0.02, 0); scene.add(d1);
  }
  const dashG2 = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  for (let z = -24; z <= 24; z += 4) {
    if (Math.abs(z) < 4) continue;
    const d2 = new THREE.Mesh(dashG2, whitePaint); d2.position.set(0, 0.02, z); scene.add(d2);
  }
  for (let i = -2; i <= 2; i++) {
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 2.6), whitePaint);
    s1.position.set(i * 1.1, 0.02, 6.2); scene.add(s1);
    const s2 = s1.clone(); s2.position.z = -6.2; scene.add(s2);
  }
  // Central plaza paving (courtyard landmark, north of intersection).
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(13, 0.1, 5.4), sidewalkMat);
  plaza.position.set(0, 0.05, -7.7); plaza.receiveShadow = true;
  scene.add(plaza);
  const plazaTrim = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.06, 0.3), neonTeal);
  plazaTrim.position.set(0, 0.08, -5.1); scene.add(plazaTrim);
  const plazaTrim2 = plazaTrim.clone(); plazaTrim2.position.z = -10.3; scene.add(plazaTrim2);
  // Drainage grates along curbs.
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.6, metalness: 0.6 });
  for (const [x, z] of [[-12, 5.1], [12, 5.1], [-12, -5.1], [12, -5.1], [5.1, 12], [-5.1, -12]]) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), grateMat);
    gr.position.set(x, 0.14, z);
    scene.add(gr);
  }

  // ---- Perimeter brick boundary (keeps play area connected/enclosed) ----
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 0.9, metalness: 0.02 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.85, metalness: 0.02 });
  const mkPerim = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), brickMat);
    m.position.set(x, 1.5, z); m.receiveShadow = true;
    scene.add(m); solids.push(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w === 1 ? 1.4 : w, 0.25, d === 1 ? 1.4 : d), capMat);
    cap.position.set(x, 3.1, z);
    scene.add(cap);
  };
  mkPerim(ARENA + 2, 1, 0, -HALF);
  mkPerim(ARENA + 2, 1, 0, HALF);
  mkPerim(1, ARENA + 2, -HALF, 0);
  mkPerim(1, ARENA + 2, HALF, 0);

  // ---- Buildings: reusable, coherent architecture ----
  const facadeSand = new THREE.MeshStandardMaterial({ map: makeFacadeTexture('#c7a87e', '#8a6f4d', '#274b5a'), roughness: 0.9 });
  const facadeTerra = new THREE.MeshStandardMaterial({ map: makeFacadeTexture('#b0704f', '#6e3f2c', '#2b3f57'), roughness: 0.9 });
  const facadeSlate = new THREE.MeshStandardMaterial({ map: makeFacadeTexture('#7e8ba0', '#4c5666', '#3d4a2c'), roughness: 0.9 });
  const facadeSage = new THREE.MeshStandardMaterial({ map: makeFacadeTexture('#9aa27e', '#5f6650', '#33454f'), roughness: 0.9 });
  const litWinWarm = new THREE.MeshBasicMaterial({ color: 0xffc766 });
  const litWinCool = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

  // Balcony helper (slab + 3 rails), windows strip, door + awning, roof props.
  const mkBuilding = (x, z, w, d, hgt, facade, opts = {}) => {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), facade);
    base.position.y = hgt / 2; base.castShadow = true; base.receiveShadow = true;
    grp.add(base);
    // parapet cap + cornice band
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.4), trimDark);
    cap.position.y = hgt + 0.17; cap.castShadow = true;
    grp.add(cap);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.4, d + 0.15), opts.bandMat ?? plasterSand);
    band.position.y = Math.min(3.1, hgt - 0.6);
    grp.add(band);
    // door + stoop + awning on street face (faces map center by default)
    const face = opts.face ?? 'c';
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.15), trimDark);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.1), opts.awnMat ?? neonAmber);
    if (face === 's' || face === 'c') { door.position.set(0, 1.1, d / 2 + 0.05); awn.position.set(0, 2.6, d / 2 + 0.55); }
    else if (face === 'n') { door.position.set(0, 1.1, -d / 2 - 0.05); awn.position.set(0, 2.6, -d / 2 - 0.55); }
    else if (face === 'e') { door.rotation.y = Math.PI / 2; door.position.set(w / 2 + 0.05, 1.1, 0); awn.position.set(w / 2 + 0.55, 2.6, 0); }
    else { door.rotation.y = Math.PI / 2; door.position.set(-w / 2 - 0.05, 1.1, 0); awn.position.set(-w / 2 - 0.55, 2.6, 0); }
    grp.add(door, awn);
    // a couple of warm lit windows (emissive) over the painted facade
    const lw = opts.lit ?? litWinWarm;
    for (let i = 0; i < (opts.litCount ?? 2); i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), lw);
      const ox = (i - 0.5) * (opts.litCount ?? 2 > 1 ? 2.2 : 0);
      if (face === 's' || face === 'c') win.position.set(ox + 2.2, 4.4, d / 2 + 0.06);
      else if (face === 'n') win.position.set(ox - 2.2, 4.4, -d / 2 - 0.06);
      else if (face === 'e') { win.rotation.y = Math.PI / 2; win.position.set(w / 2 + 0.06, 4.4, ox); }
      else { win.rotation.y = Math.PI / 2; win.position.set(-w / 2 - 0.06, 4.4, ox); }
      grp.add(win);
    }
    // balcony on upper floor (slab + rails)
    if (opts.balcony !== false && hgt >= 5) {
      const by = 3.6;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 1.2), trimDark);
      const railF = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 0.08), metalMat);
      const railS1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.2), metalMat);
      const railS2 = railS1.clone();
      if (face === 's' || face === 'c' || face === 'n') {
        const sgn = (face === 'n') ? -1 : 1;
        slab.position.set(-w / 4, by, sgn * (d / 2 + 0.6));
        railF.position.set(-w / 4, by + 0.44, sgn * (d / 2 + 1.16));
        railS1.position.set(-w / 4 - 1.46, by + 0.44, sgn * (d / 2 + 0.6));
        railS2.position.set(-w / 4 + 1.46, by + 0.44, sgn * (d / 2 + 0.6));
      } else {
        const sgn = (face === 'w') ? -1 : 1;
        slab.rotation.y = railF.rotation.y = Math.PI / 2;
        slab.position.set(sgn * (w / 2 + 0.6), by, 0);
        railF.position.set(sgn * (w / 2 + 1.16), by + 0.44, 0);
        railS1.position.set(sgn * (w / 2 + 0.6), by + 0.44, -1.46);
        railS2.position.set(sgn * (w / 2 + 0.6), by + 0.44, 1.46);
      }
      slab.castShadow = true;
      grp.add(slab, railF, railS1, railS2);
    }
    // rooftop props: AC box + vent pipe
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.9), metalMat);
    ac.position.set(w / 4, hgt + 0.7, 0); ac.castShadow = true;
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.2, 8), metalMat);
    vent.position.set(-w / 4, hgt + 0.9, -d / 4);
    grp.add(ac, vent);
    // drainpipe down the corner
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, hgt, 6), metalMat);
    pipe.position.set(w / 2 + 0.12, hgt / 2, d / 2 - 0.4);
    grp.add(pipe);
    grp.position.set(x, 0, z);
    if (opts.ry) grp.rotation.y = opts.ry;
    scene.add(grp);
    solids.push(base);
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: hgt + 0.35, h0: 0 });
    return grp;
  };

  // Corner blocks (tall, varied palette + heights).
  mkBuilding(-16, -16, 14, 12, 7, facadeSand, { face: 's', awnMat: neonAmber });
  mkBuilding(16, -16, 14, 12, 8, facadeSlate, { face: 's', awnMat: neonTeal, lit: litWinCool });
  mkBuilding(-16, 16, 14, 12, 6, facadeTerra, { face: 'n', awnMat: neonPink });
  mkBuilding(16, 16, 14, 12, 7, facadeSage, { face: 'n', awnMat: neonTeal, lit: litWinCool });
  // Side blocks shape the alleys.
  mkBuilding(-19, 5.5, 10, 5, 5, facadeSlate, { face: 'e', balcony: false, litCount: 3 });
  mkBuilding(19, -5.5, 10, 5, 5, facadeTerra, { face: 'w', balcony: false, litCount: 3 });
  // Low shop rows with storefront signs.
  const shopN1 = mkBuilding(-6, -14, 5, 4, 4, facadeSand, { face: 's', balcony: false, litCount: 1 });
  void shopN1;
  mkBuilding(6, -14, 5, 4, 4, facadeSage, { face: 's', balcony: false, litCount: 1, lit: litWinCool });
  mkBuilding(-6, 14, 5, 4, 4, facadeTerra, { face: 'n', balcony: false, litCount: 1 });
  mkBuilding(6, 14, 5, 4, 4, facadeSand, { face: 'n', balcony: false, litCount: 1 });

  // Shop + street signs (original names).
  const mkSign = (text, color, w, x, y, z, ry) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, color) }));
    s.position.set(x, y, z); s.rotation.y = ry;
    scene.add(s);
    return s;
  };
  const neonMats = [];
  const mkNeon = (text, colorHex, x, y, z, ry) => {
    const s = mkSign(text, colorHex === 0x22e6ff ? '#22e6ff' : colorHex === 0xffb14e ? '#ffb14e' : '#ff5f8f', 6, x, y, z, ry);
    neonMats.push(s.material);
    return s;
  };
  mkNeon('CAFE', 0xffb14e, -6, 3.2, -11.9, 0);
  mkNeon('MARKET', 0x22e6ff, 6, 3.2, -11.9, 0);
  mkNeon('GARAGE', 0xff5f8f, -6, 3.2, 11.9, Math.PI);
  mkNeon('HOTEL', 0x22e6ff, 16, 5.4, -9.9, 0);
  mkSign('5TH AVE', '#d8d4c4', 3, 5.4, 3.4, 8, -Math.PI / 2);
  mkSign('SITE A', '#22e6ff', 5, -27.3, 4.2, -14, Math.PI / 2);
  mkSign('SITE B', '#ffb14e', 5, 27.3, 4.2, 14, -Math.PI / 2);

  // Landmark water tower on the NE block roof (visible from everywhere).
  {
    const g = new THREE.Group();
    const legG = new THREE.CylinderGeometry(0.12, 0.12, 3, 6);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(legG, woodMat);
      leg.position.set(ox, 1.5, oz);
      g.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 2.4, 12), plasterTerra);
    tank.position.y = 4.2; tank.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1, 12), trimDark);
    roof.position.y = 5.9;
    g.add(tank, roof);
    g.position.set(16, 8, -16);
    scene.add(g);
  }

  // Plaza fountain (dry planter landmark) + benches.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.85, metalness: 0.03 });
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 10, 24), stoneMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.8, -7.7);
    rim.castShadow = true; rim.receiveShadow = true;
    scene.add(rim); solids.push(rim);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 20), stoneMat);
    basin.position.set(0, 0.25, -7.7); basin.receiveShadow = true;
    scene.add(basin);
    const obelisk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), stoneMat);
    obelisk.position.set(0, 1.4, -7.7); obelisk.castShadow = true;
    scene.add(obelisk); solids.push(obelisk);
    const rock1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4), rockMat);
    rock1.position.set(0.7, 0.6, -7.2); rock1.castShadow = true;
    const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), rockMat);
    rock2.position.set(-0.6, 0.55, -8.1);
    scene.add(rock1, rock2);
    circles.push({ x: 0, z: -7.7, r: 2.0 });
  }
  // Benches (standable cover) + planters with bushes.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 0.8, metalness: 0.05 });
  B(-3.5, -7.7, 2.2, 0.55, 0.7, benchMat);
  B(3.5, -7.7, 2.2, 0.55, 0.7, benchMat);
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.85, metalness: 0.1 });
  const bushG = new THREE.IcosahedronGeometry(0.55, 1);
  const mkPlanter = (x, z) => {
    B(x, z, 1.4, 0.7, 1.4, planterMat);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(bushG, i ? leafMat2 : leafMat);
      b.position.set(x + (i ? 0.3 : -0.3), 1.05, z);
      b.scale.y = 0.8; b.castShadow = true;
      scene.add(b);
    }
  };
  mkPlanter(-5.6, -9.6); mkPlanter(5.6, -9.6); mkPlanter(-5.6, -5.8); mkPlanter(5.6, -5.8);
  mkPlanter(-9, 6.5); mkPlanter(9, -6.5);

  // Street trees (trunk + canopy), circle colliders.
  const canopyG = new THREE.IcosahedronGeometry(1.3, 1);
  const mkTree = (x, z, s = 1) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 2.4 * s, 7), trunkMat);
    trunk.position.set(x, 1.2 * s, z); trunk.castShadow = true;
    scene.add(trunk); solids.push(trunk);
    const c1 = new THREE.Mesh(canopyG, leafMat);
    c1.position.set(x, (2.9) * s, z); c1.scale.setScalar(s); c1.castShadow = true;
    const c2 = new THREE.Mesh(canopyG, leafMat2);
    c2.position.set(x + 0.7 * s, 2.3 * s, z + 0.4 * s); c2.scale.setScalar(0.7 * s); c2.castShadow = true;
    scene.add(c1, c2);
    circles.push({ x, z, r: 0.45 * s });
  };
  mkTree(-6.5, 4.4); mkTree(6.5, -4.4); mkTree(-6.5, -4.4); mkTree(6.5, 4.4);
  mkTree(-13, 7.5, 1.2); mkTree(13, -7.5, 1.2);

  // Streetlights: pole + arm + glowing head + fake light cone.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.55, metalness: 0.75 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6b8 });
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const coneGeo = new THREE.ConeGeometry(2.2, 5.5, 10, 1, true);
  const mkLamp = (x, z, flip) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), poleMat);
    pole.position.set(x, 2.7, z); pole.castShadow = true;
    scene.add(pole); solids.push(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), poleMat);
    arm.position.set(x, 5.3, z + (flip ? 0.55 : -0.55));
    scene.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.5), lampHeadMat);
    head.position.set(x, 5.25, z + (flip ? 1.05 : -1.05));
    scene.add(head);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 2.5, z + (flip ? 1.05 : -1.05));
    scene.add(cone);
    circles.push({ x, z, r: 0.3 });
  };
  mkLamp(-14, 3.4, false); mkLamp(-4, -3.4, true); mkLamp(6, 3.4, false); mkLamp(16, -3.4, true);
  mkLamp(-14, -3.4, true); mkLamp(16, 3.4, false);
  // Two real spotlights for key lamps (rest stay fake cones for perf) + ground pools.
  const poolGeo = new THREE.CircleGeometry(2.6, 20);
  const mkLampLight = (x, z, flip) => {
    const hz = z + (flip ? 1.05 : -1.05);
    const spot = new THREE.SpotLight(0xffd9a0, 35, 18, 0.7, 0.5, 1.2);
    spot.position.set(x, 5.2, hz);
    spot.target.position.set(x, 0, hz);
    scene.add(spot, spot.target);
    const pool = new THREE.Mesh(poolGeo, poolLightMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.025, hz);
    scene.add(pool);
  };
  mkLampLight(6, 3.4, false); mkLampLight(-14, -3.4, true);
  // Warm uplights washing two corner facades.
  for (const [x, z] of [[-16, -9.5], [16, -9.5]]) {
    const up = new THREE.PointLight(0xffb14e, 12, 16);
    up.position.set(x, 0.6, z);
    scene.add(up);
  }
  // Cool fountain accent light.
  const fountainLight = new THREE.PointLight(0x22e6ff, 14, 12);
  fountainLight.position.set(0, 1.6, -7.7);
  scene.add(fountainLight);

  // Parked vehicles (original stylized): delivery van + sedan. Bodies block + are cover.
  const vanBlue = new THREE.MeshStandardMaterial({ color: 0x3f6b8f, roughness: 0.5, metalness: 0.4 });
  const carRed = new THREE.MeshStandardMaterial({ color: 0x8f3f3f, roughness: 0.5, metalness: 0.4 });
  const mkVan = (x, z, ry) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.7, 1.9), vanBlue);
    body.position.y = 1.25; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.85), vanBlue);
    cab.position.set(2.4, 0.95, 0); cab.castShadow = true;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 1.6), glassDark);
    shield.position.set(2.95, 1.25, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.18, 1.95), neonAmber);
    stripe.position.y = 1.7;
    g.add(body, cab, shield, stripe);
    const wheelG = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    for (const [ox, oz] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [2.3, -0.95], [2.3, 0.95]]) {
      const w = new THREE.Mesh(wheelG, tireMat);
      w.rotation.x = Math.PI / 2; w.position.set(ox, 0.38, oz);
      g.add(w);
    }
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    solids.push(body, cab);
    boxes.push({ minX: x - 2.6, maxX: x + 2.6, minZ: z - 1, maxZ: z + 1, h: 2.1, h0: 0 });
  };
  const mkSedan = (x, z, ry) => {
    const g = new THREE.Group();
    const lower = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 1.6), carRed);
    lower.position.y = 0.65; lower.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.45), carRed);
    cabin.position.set(-0.2, 1.25, 0); cabin.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.5), glassDark);
    glass.position.set(-0.2, 1.25, 0);
    g.add(lower, cabin, glass);
    const wheelG = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 12);
    for (const [ox, oz] of [[-1.1, 0.8], [1.1, 0.8], [-1.1, -0.8], [1.1, -0.8]]) {
      const w = new THREE.Mesh(wheelG, tireMat);
      w.rotation.x = Math.PI / 2; w.position.set(ox, 0.33, oz);
      g.add(w);
    }
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    solids.push(lower, cabin);
    boxes.push({ minX: x - 1.8, maxX: x + 1.8, minZ: z - 0.9, maxZ: z + 0.9, h: 1.55, h0: 0 });
  };
  mkVan(-8, 1.4, 0);
  mkSedan(9, -1.6, Math.PI);

  // ---- Roads detail: manholes, oil stains, puddles, bollards, hydrant ----
  {
    const mhGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 16);
    for (const [x, z] of [[-10, 0], [12, 0.5], [0, -12], [2, 14]]) {
      const mh = new THREE.Mesh(mhGeo, manholeMat);
      mh.position.set(x, 0.025, z); mh.receiveShadow = true;
      scene.add(mh);
    }
    const stainGeo = new THREE.CircleGeometry(1, 12);
    for (const [x, z, s] of [[-8, 1.4, 2.6], [9, -1.6, 2.2], [3, -3, 1.4]]) {
      const st = new THREE.Mesh(stainGeo, stainMat);
      st.rotation.x = -Math.PI / 2;
      st.position.set(x, 0.022, z); st.scale.set(s, s * 0.7, 1);
      st.renderOrder = 1;
      scene.add(st);
    }
    const pudGeo = new THREE.CircleGeometry(1, 20);
    for (const [x, z, sx, sz] of [[-3, -1.5, 1.6, 1.0], [11, 2.2, 1.2, 0.8], [-11, -2, 1.0, 0.7]]) {
      const p = new THREE.Mesh(pudGeo, puddleMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.024, z); p.scale.set(sx, sz, 1);
      p.receiveShadow = true;
      scene.add(p);
    }
    // Bollards guarding plaza + shop fronts.
    const bolGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.9, 10);
    const stripeGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.12, 10);
    for (const [x, z] of [[-6.5, -5.1], [-2.2, -5.1], [2.2, -5.1], [6.5, -5.1], [-6.5, 5.1], [6.5, 5.1]]) {
      const b = new THREE.Mesh(bolGeo, bollardMat);
      b.position.set(x, 0.45, z); b.castShadow = true;
      scene.add(b); solids.push(b);
      const s = new THREE.Mesh(stripeGeo, bollardStripe);
      s.position.set(x, 0.68, z);
      scene.add(s);
      circles.push({ x, z, r: 0.22 });
    }
    // Fire hydrant near SE corner.
    {
      const g = new THREE.Group();
      const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 10), hydrantMat);
      bodyM.position.y = 0.45; bodyM.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), hydrantMat);
      cap.position.y = 0.85;
      const sideG = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8);
      const s1 = new THREE.Mesh(sideG, hydrantMat);
      s1.rotation.z = Math.PI / 2; s1.position.y = 0.55;
      g.add(bodyM, cap, s1);
      g.position.set(7.2, 0, 6.8);
      scene.add(g);
      solids.push(bodyM);
      circles.push({ x: 7.2, z: 6.8, r: 0.35 });
    }
  }

  // Delivery crates + dumpsters (jumpable cover) in the west alley + near shops.
  const crateA = new THREE.MeshStandardMaterial({ color: 0x6b5a33, roughness: 0.8, metalness: 0.1 });
  const crateB = new THREE.MeshStandardMaterial({ color: 0x4f6242, roughness: 0.8, metalness: 0.1 });
  const dumpMat = new THREE.MeshStandardMaterial({ color: 0x2e5a3c, roughness: 0.6, metalness: 0.5 });
  B(-19, -4, 2.4, 2.4, 2.4, crateB);
  B(-16.2, -4.2, 1.6, 1.6, 1.6, crateA);
  B(-19, 8.6, 2, 2, 2, crateA);
  B(20.5, 1.8, 2.2, 1.6, 1.4, crateB);
  B(12, 10.5, 2.2, 1.3, 1.2, dumpMat); // dumpster near south shops
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.2), trimDark);
  lid.position.set(12, 1.36, 10.5); lid.castShadow = true;
  scene.add(lid);
  B(-12, -10.5, 2.2, 1.3, 1.2, dumpMat);
  const lid2 = lid.clone(); lid2.position.set(-12, 1.36, -10.5); scene.add(lid2);

  // Jersey barriers (concrete cover) at approaches + plaza edge.
  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0xb0aa9c, roughness: 0.85, metalness: 0.02 });
  const mkJersey = (x, z, w, d) => {
    B(x, z, w, 1.1, d, jerseyMat);
    const stripeM = new THREE.Mesh(new THREE.BoxGeometry(w === 1 ? 1.02 : w, 0.14, d === 1 ? 1.02 : d), neonAmber);
    stripeM.position.set(x, 0.75, z);
    scene.add(stripeM);
  };
  mkJersey(7.5, 6.4, 4, 1); mkJersey(-7.5, -6.4, 4, 1);
  mkJersey(6.4, -7.5, 1, 4); mkJersey(-6.4, 7.5, 1, 4);

  // Terrace courtyard (stairs + raised deck, standable) SW of center.
  {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8f8578, roughness: 0.9, metalness: 0.02 });
    B(-6, 9.2, 3.5, 0.9, 2.5, deckMat);
    for (let i = 0; i < 3; i++) {
      B(-6, 7.35 - i * 0.6, 2.6, 0.3 * (i + 1), 0.6, deckMat);
    }
    // terrace railing
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.7, 0.08), metalMat);
    rail.position.set(-6, 1.35, 10.42); rail.castShadow = true;
    scene.add(rail);
  }

  // Overhead cables across the street + wall pipes (visual only).
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x14161c });
  const mkCable = (a, b, sag) => {
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.035, 5), cableMat);
    scene.add(tube);
  };
  mkCable(new THREE.Vector3(-3.5, 5.2, -14), new THREE.Vector3(3.5, 5.2, -14), 0.8);
  mkCable(new THREE.Vector3(-9, 6.4, -10), new THREE.Vector3(-9, 5.4, -3), 0.6);
  mkCable(new THREE.Vector3(9, 6.4, 10), new THREE.Vector3(9, 5.4, 3), 0.6);

  // Rocks cluster near planters (visual, tiny colliders not needed).
  for (const [x, z, s] of [[-4.6, -9.6, 0.35], [4.8, -5.8, 0.28], [8.2, -6.5, 0.42]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat);
    r.position.set(x, s * 0.6, z); r.castShadow = true;
    scene.add(r);
  }

  // ---- Vegetation pass: hedges, grass tufts, flowers, ivy ----
  {
    // Hedge rows lining the plaza + sidewalks (cover, box colliders).
    const hedgeSpots = [
      [-9.5, -9.6, 3, 1], [9.5, -9.6, 3, 1], [-9.5, -5.8, 3, 1], [9.5, -5.8, 3, 1],
      [-11, 6.5, 1, 2.4], [11, -6.5, 1, 2.4],
    ];
    for (const [x, z, w, d] of hedgeSpots) B(x, z, w, 0.9, d, hedgeMat);
    // Grass tufts (2 crossed planes each would cost draws; use small cones, merged loop).
    const tuftGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
    const tuftSpots = [
      [-6.5, 6.2], [-5.9, 6.6], [6.2, -6.2], [7, -6.8], [-9.8, 5.2], [12.5, 8.8],
      [-12.8, -8.2], [4.2, 8.5], [-4.4, -6.1], [10.8, 6.1], [-7.8, -8.4], [8.4, 8.2],
      [-2.5, 10.8], [2.8, -10.9], [-20.5, 2.5], [20.5, -2.2],
    ];
    for (const [x, z] of tuftSpots) {
      for (let k = 0; k < 3; k++) {
        const t = new THREE.Mesh(tuftGeo, grassMat);
        t.position.set(x + (Math.random() - 0.5) * 0.7, 0.22, z + (Math.random() - 0.5) * 0.7);
        t.rotation.y = Math.random() * Math.PI;
        t.scale.setScalar(0.7 + Math.random() * 0.7);
        scene.add(t);
      }
    }
    // Flower dots on planters (cheap basic mats, no lights).
    const flGeo = new THREE.SphereGeometry(0.09, 6, 5);
    for (const [x, z] of [[-5.6, -9.6], [5.6, -9.6], [-5.6, -5.8], [5.6, -5.8]]) {
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(flGeo, k % 2 ? flowerMatA : flowerMatB);
        f.position.set(x + (Math.random() - 0.5) * 1.0, 1.35 + Math.random() * 0.15, z + (Math.random() - 0.5) * 1.0);
        scene.add(f);
      }
    }
    // Ivy patches on two corner facades (flat dark-green planes).
    const ivyMat = new THREE.MeshStandardMaterial({ color: 0x2f5a28, roughness: 1 });
    const ivyGeo = new THREE.PlaneGeometry(2.4, 3.2);
    for (const [x, y, z, ry] of [
      [-9.2, 1.8, -9.9, 0], [-8.0, 1.5, -9.9, 0],
      [22.9, 1.8, 12.5, Math.PI / 2], [22.9, 1.5, 13.8, Math.PI / 2],
    ]) {
      const iv = new THREE.Mesh(ivyGeo, ivyMat);
      iv.position.set(x, y, z); iv.rotation.y = ry;
      iv.receiveShadow = true;
      scene.add(iv);
    }
  }

  // ---- Building extras: fire escapes, roof rails, antennas, storefronts ----
  const beaconMats = [];
  {
    // Fire escape on two corner blocks (platforms + rails + ladder, visual).
    const mkEscape = (x, z, ry) => {
      const g = new THREE.Group();
      for (const ly of [2.6, 4.6]) {
        const plat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.1), escapeMat);
        plat.position.y = ly; plat.castShadow = true;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.06), escapeMat);
        rail.position.set(0, ly + 0.36, 0.52);
        g.add(plat, rail);
      }
      const lad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.08), escapeMat);
      lad.position.set(1.3, 2.4, 0.5);
      g.add(lad);
      g.position.set(x, 0, z); g.rotation.y = ry;
      scene.add(g);
    };
    mkEscape(-16, -9.9, 0); mkEscape(22.1, 16, -Math.PI / 2);
    // Rooftop railings + antennas + red beacon blinkers.
    for (const [x, z, w, hgt] of [[-16, -16, 14, 7], [16, -16, 14, 8], [-16, 16, 14, 6]]) {
      for (const dz of [-3, 3]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.7, 0.08), escapeMat);
        r.position.set(x, hgt + 0.7, z + dz);
        scene.add(r);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), escapeMat);
      ant.position.set(x + w / 3, hgt + 1.9, z);
      scene.add(ant);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2244 }));
      beacon.position.set(x + w / 3, hgt + 3.6, z);
      scene.add(beacon);
      beaconMats.push(beacon.material);
    }
    // Storefront glass + warm interior glow strips on the four low shops.
    for (const [x, z, ry] of [[-6, -12, 0], [6, -12, 0], [-6, 12, Math.PI], [6, 12, Math.PI]]) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), storeGlassMat);
      glass.position.set(x, 1.3, z + (ry === 0 ? 0.06 : -0.06));
      glass.rotation.y = ry;
      scene.add(glass);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.25), interiorGlowMat);
      glow.position.set(x, 2.25, z + (ry === 0 ? 0.07 : -0.07));
      glow.rotation.y = ry;
      scene.add(glow);
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.1), escapeMat);
      shutter.position.set(x + 2.6, 1.0, z);
      scene.add(shutter);
    }
  }

  // Fake AO contact discs under vehicles/props (cheap depth cue).
  {
    const aoTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
      grad.addColorStop(0, 'rgba(0,0,0,0.42)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false });
    const aoGeo = new THREE.PlaneGeometry(1, 1);
    const aoSpots = [
      [-8, 1.4, 6], [9, -1.6, 5], [-19, -4, 3.6], [12, 10.5, 3.4], [-12, -10.5, 3.4],
      [-3.5, -7.7, 3], [3.5, -7.7, 3], [0, -7.7, 5], [-6, 9.2, 5],
    ];
    for (const [x, z, s] of aoSpots) {
      const m = new THREE.Mesh(aoGeo, aoMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      m.scale.set(s, s, 1);
      m.renderOrder = 1;
      scene.add(m);
    }
  }

  // Drifting dust (single draw call) + distant skyline silhouette.
  const DUST_N = 140;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 52;
    dustPos[i * 3 + 1] = 0.5 + Math.random() * 7;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 52;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false }));
  dust.frustumCulled = false;
  scene.add(dust);
  {
    // far rooftops outside the walls give the city depth (no colliders, unlit cheap)
    const farMat = new THREE.MeshBasicMaterial({ color: 0x232c44 });
    const farMat2 = new THREE.MeshBasicMaterial({ color: 0x2c2340 });
    const spots = [[-45, -30, 18, 22], [40, -38, 22, 18], [-42, 30, 20, 16], [44, 28, 16, 20], [0, -52, 30, 14], [0, 52, 26, 16]];
    spots.forEach(([x, z, w, h], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 2 ? farMat2 : farMat);
      m.position.set(x, h / 2, z);
      scene.add(m);
    });
    // a few lit windows far away
    const farWin = new THREE.MeshBasicMaterial({ color: 0xffc766 });
    for (let i = 0; i < 14; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), farWin);
      const side = i % 2 ? 1 : -1;
      w.position.set(-45 + (i * 7) % 90, 6 + (i * 3) % 10, side * 44);
      if (side < 0) w.rotation.y = Math.PI;
      scene.add(w);
    }
  }

  // Spawn points on open streets/plaza edges (all clear of footprints).
  const spawnPoints = [
    new THREE.Vector3(-24, 0, -24), new THREE.Vector3(24, 0, -24),
    new THREE.Vector3(-24, 0, 24), new THREE.Vector3(24, 0, 24),
    new THREE.Vector3(0, 0, -24), new THREE.Vector3(-22, 0, -1),
    new THREE.Vector3(22, 0, 4), new THREE.Vector3(0, 0, 24),
  ];

  // Neon flicker + dust drift + beacons + fountain shimmer.
  let flick = 0;
  function update(dt, t) {
    flick += dt;
    const k = 0.8 + Math.sin(t * 2.2) * 0.2;
    neonTeal.color.setRGB(0.13 * k, 0.9 * k, k);
    const f = (Math.sin(flick * 13) > -0.92) ? 1 : 0.45; // faulty GARAGE sign buzz
    neonPink.color.setRGB(f, 0.37 * f, 0.56 * f);
    const blink = (Math.sin(t * 2.5) > 0.4) ? 1 : 0.15;
    for (const m of beaconMats) m.color.setRGB(blink, 0.13 * blink, 0.27 * blink);
    if (fountainLight) fountainLight.intensity = 12 + Math.sin(t * 3.1) * 3;
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST_N; i++) {
      p[i * 3 + 1] -= dt * 0.1;
      p[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.08;
      if (p[i * 3 + 1] < 0.3) p[i * 3 + 1] = 7.5;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  return { boxes, circles, solids, spawnPoints, sun, cyan, magenta, warm, update };
}

// Shared circle-vs-world collision resolve (mutates pos).
// feetOffset: eye height for the player (pass EYE), 0 for ground-based objects
// (enemies) so their horizontal blocking behavior is unchanged. Boxes with a top
// at/near/below the mover's feet are skipped so you can stand on them.
export function collideWorld(pos, radius, boxes, circles, feetOffset = 0) {
  pos.x = Math.max(-HALF + radius + 0.5, Math.min(HALF - radius - 0.5, pos.x));
  pos.z = Math.max(-HALF + radius + 0.5, Math.min(HALF - radius - 0.5, pos.z));
  const feet = pos.y - feetOffset;
  for (const o of boxes) {
    const top = o.h ?? Infinity;
    const h0 = o.h0 ?? 0;
    // Above the box (standing on it / landing on it): no horizontal push.
    if (feet >= top - 0.35) continue;
    // Fully below a floating box (e.g. under stacked crate overhang): pass under.
    if (feet + 1.7 <= h0) continue;
    const cx = Math.max(o.minX, Math.min(pos.x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(pos.z, o.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        const pl = pos.x - o.minX + radius, pr = o.maxX - pos.x + radius;
        const pt = pos.z - o.minZ + radius, pb = o.maxZ - pos.z + radius;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = o.minX - radius;
        else if (m === pr) pos.x = o.maxX + radius;
        else if (m === pt) pos.z = o.minZ - radius;
        else pos.z = o.maxZ + radius;
      }
    }
  }
  for (const c of circles) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const rr = c.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * rr;
      pos.z = c.z + (dz / d) * rr;
    }
  }
}

// Highest standable surface under (x,z): ground (0) or the top of a box whose
// footprint contains the point (expanded by radius) and whose top is at or
// below feetY + stepUp. Returns the surface height (feet-level).
export function groundHeight(x, z, feetY, radius, boxes, stepUp = 0.45) {
  let support = 0;
  for (const o of boxes) {
    if (x < o.minX - radius || x > o.maxX + radius) continue;
    if (z < o.minZ - radius || z > o.maxZ + radius) continue;
    const top = o.h ?? Infinity;
    const h0 = o.h0 ?? 0;
    if (top > feetY + stepUp) continue; // too high to step onto from here
    if (feetY + 1.7 <= h0) continue; // head would clip a floating box
    if (top > support) support = top;
  }
  return support;
}
