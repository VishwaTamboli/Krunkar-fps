// Remote human player avatar: simple humanoid + nametag, interpolated.
// Combat hit-testing arrives in a later stage; this is visual only.
import * as THREE from 'three';

const PALETTE = [0x00eeff, 0xffb14e, 0xff5f8f, 0x9dff3b, 0xb28dff, 0x7dffce];

function nametagTexture(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name, 128, 34);
  g.fillStyle = '#dff6ff';
  g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

export class RemotePlayer {
  constructor(scene, name, colorIdx = 0, x = 0, z = 0) {
    this.scene = scene;
    this.target = { x, y: 0, z, yaw: 0 };
    const accent = new THREE.MeshBasicMaterial({ color: PALETTE[colorIdx % PALETTE.length] });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3247, roughness: 0.5, metalness: 0.6 });
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.62, 0.7, 0.4), dark, 0, 1.25, 0); // torso
    add(new THREE.BoxGeometry(0.64, 0.08, 0.42), accent, 0, 1.52, 0); // shoulder stripe
    add(new THREE.BoxGeometry(0.5, 0.25, 0.35), dark, 0, 0.85, 0); // hips
    add(new THREE.BoxGeometry(0.22, 0.8, 0.25), dark, -0.15, 0.4, 0); // legs
    add(new THREE.BoxGeometry(0.22, 0.8, 0.25), dark, 0.15, 0.4, 0);
    add(new THREE.BoxGeometry(0.4, 0.34, 0.4), dark, 0, 1.8, 0); // head
    add(new THREE.BoxGeometry(0.32, 0.1, 0.05), accent, 0, 1.82, -0.2); // visor (faces -Z)
    add(new THREE.BoxGeometry(0.12, 0.14, 0.7), dark, 0.35, 1.2, -0.35); // gun
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nametagTexture(String(name).slice(0, 16)),
      depthTest: false,
      transparent: true,
    }));
    tag.scale.set(1.8, 0.45, 1);
    tag.position.y = 2.35;
    tag.renderOrder = 15;
    g.add(tag);
    g.position.set(x, 0, z);
    scene.add(g);
    this.group = g;
  }

  setTarget(x, y, z, yaw) {
    this.target.x = x;
    this.target.y = y || 0;
    this.target.z = z;
    this.target.yaw = yaw;
  }

  update(dt) {
    const k = 1 - Math.exp(-10 * dt);
    this.group.position.x += (this.target.x - this.group.position.x) * k;
    this.group.position.y += (this.target.y - this.group.position.y) * k;
    this.group.position.z += (this.target.z - this.group.position.z) * k;
    let d = this.target.yaw - this.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.group.rotation.y += d * (1 - Math.exp(-12 * dt));
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
        else {
          m.map?.dispose?.();
          m.dispose?.();
        }
      }
    });
  }
}
