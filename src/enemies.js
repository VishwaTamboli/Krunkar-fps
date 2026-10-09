import * as THREE from 'three';
import { collideWorld } from './arena.js';

let enemyId = 0;

// Robotic soldier built from primitives. States: patrol, chase, attack, dead.
export class Enemy {
  constructor(scene, pos, opts = {}) {
    this.id = enemyId++;
    this.scene = scene;
    this.hp = opts.hp ?? 60;
    this.maxHp = this.hp;
    this.speed = opts.speed ?? 2.6;
    this.damage = opts.damage ?? 10;
    this.detectRange = 34;
    this.attackRange = 14;
    this.attackCd = 1.4;
    this.attackTimer = 1 + Math.random();
    this.state = 'patrol';
    this.alive = true;
    this.deadTimer = 0;
    this.walkPhase = Math.random() * 6;
    this.wanderTarget = new THREE.Vector3(pos.x, 0, pos.z);
    this.pickWander(pos);
    this.stuckTimer = 0;
    this.lastPos = pos.clone();
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.flashTimer = 0;
    this.joltTimer = 0;
    this.recoil = 0;
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
    this.accent = opts.accent ?? 0x00eeff;

    const armor = new THREE.MeshStandardMaterial({ color: 0x5b6784, roughness: 0.35, metalness: 0.9 });
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.5, metalness: 0.7, emissive: 0x000000 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.6, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x232b40, roughness: 0.85, metalness: 0.2 });
    const glowRed = new THREE.MeshBasicMaterial({ color: 0xff2244 });
    const glowAccent = new THREE.MeshBasicMaterial({ color: this.accent });

    const g = new THREE.Group();
    // --- legs with hip pivots (smooth swing) + armor ---
    const legGeo = new THREE.BoxGeometry(0.26, 0.78, 0.28);
    legGeo.translate(0, -0.39, 0); // pivot at hip
    this.legL = new THREE.Mesh(legGeo, cloth);
    this.legL.position.set(-0.18, 0.78, 0);
    this.legR = new THREE.Mesh(legGeo, cloth);
    this.legR.position.set(0.18, 0.78, 0);
    const kneeGeo = new THREE.BoxGeometry(0.28, 0.2, 0.12);
    const kneeL = new THREE.Mesh(kneeGeo, armor);
    kneeL.position.set(0, -0.4, -0.16);
    const kneeR = kneeL.clone();
    this.legL.add(kneeL); this.legR.add(kneeR);
    const bootGeo = new THREE.BoxGeometry(0.28, 0.16, 0.42);
    bootGeo.translate(0, -0.72, -0.06);
    const bootL = new THREE.Mesh(bootGeo, dark);
    const bootR = new THREE.Mesh(bootGeo, dark);
    this.legL.add(bootL); this.legR.add(bootR);
    const stripeGeo = new THREE.BoxGeometry(0.27, 0.05, 0.29);
    const stripeL = new THREE.Mesh(stripeGeo, glowAccent);
    stripeL.position.set(0, -0.18, 0);
    const stripeR = stripeL.clone();
    this.legL.add(stripeL); this.legR.add(stripeR);
    // hips / belt
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.4), dark);
    hips.position.y = 0.88;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.42), glowAccent);
    belt.position.y = 0.98;
    // --- torso: layered armor + glowing core ---
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 0.48), this.bodyMat);
    torso.position.y = 1.32;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.14), armor);
    chest.position.set(0, 1.38, 0.28);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 18), armor);
    coreRing.position.set(0, 1.32, 0.32);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), glowAccent);
    this.core.position.set(0, 1.32, 0.32);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.22), dark);
    pack.position.set(0, 1.4, -0.34);
    const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), glowAccent);
    packLight.position.set(0, 1.55, -0.46);
    // --- shoulders + arms with shoulder pivots ---
    const padGeo = new THREE.BoxGeometry(0.26, 0.2, 0.44);
    const padL = new THREE.Mesh(padGeo, armor);
    padL.position.set(-0.52, 1.62, 0);
    const padR = new THREE.Mesh(padGeo, armor);
    padR.position.set(0.52, 1.62, 0);
    const padStripeGeo = new THREE.BoxGeometry(0.27, 0.06, 0.45);
    const padStripeL = new THREE.Mesh(padStripeGeo, glowAccent);
    padStripeL.position.set(-0.52, 1.7, 0);
    const padStripeR = new THREE.Mesh(padStripeGeo, glowAccent);
    padStripeR.position.set(0.52, 1.7, 0);
    const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
    armGeo.translate(0, -0.28, 0); // pivot at shoulder
    this.armL = new THREE.Mesh(armGeo, cloth);
    this.armL.position.set(-0.52, 1.55, 0);
    const gauntL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.2), armor);
    gauntL.position.set(0, -0.5, 0);
    this.armL.add(gauntL);
    this.armR = new THREE.Mesh(armGeo, cloth);
    this.armR.position.set(0.52, 1.55, 0);
    const gauntR = gauntL.clone();
    this.armR.add(gauntR);
    // --- detailed rifle in right hand ---
    this.gunGroup = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.62), dark);
    const gunRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.5), glowAccent);
    gunRail.position.y = 0.1;
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), armor);
    gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, 0.02, -0.48);
    const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.12), cloth);
    gunMag.position.set(0, -0.16, 0.02); gunMag.rotation.x = 0.25;
    const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.08), dark);
    gunSight.position.set(0, 0.14, 0.05);
    const gunDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), glowRed);
    gunDot.position.set(0, 0.15, 0.05);
    const gunTip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), glowRed);
    gunTip.position.set(0, 0.02, -0.7);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 }));
    this.muzzle.position.set(0, 0.02, -0.8);
    this.gunGroup.add(gunBody, gunRail, gunBarrel, gunMag, gunSight, gunDot, gunTip, this.muzzle);
    this.gunGroup.position.set(0.52, 1.15, -0.45);
    this.gunTipWorld = new THREE.Vector3();
    this.gunTipObj = gunTip;
    this.gunArmObj = this.gunGroup;
    // --- helmet + visor + antenna ---
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.44), armor);
    head.position.y = 1.95;
    head.userData.headshot = true;
    const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.06), dark);
    visorFrame.position.set(0, 1.95, -0.22);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), glowRed);
    eye.position.set(0, 1.95, -0.26);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), dark);
    chin.position.set(0, 1.76, -0.2);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), dark);
    antenna.position.set(0.2, 2.28, 0.1);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), glowAccent);
    antennaTip.position.set(0.2, 2.48, 0.1);

    g.add(this.legL, this.legR, hips, belt, torso, chest, coreRing, this.core, pack, packLight,
      padL, padR, padStripeL, padStripeR, this.armL, this.armR, this.gunGroup,
      head, visorFrame, eye, chin, antenna, antennaTip);
    g.position.copy(pos);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.enemy = this; } });
    this.group = g;
    this.hitMeshes = [torso, chest, head, this.legL, this.legR];
    scene.add(g);

    // floating health bar (sprites always face camera)
    this.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x220000, depthTest: false }));
    this.barBg.scale.set(1.15, 0.13, 1);
    this.barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x33ff66, depthTest: false }));
    this.barFg.scale.set(1.05, 0.08, 1);
    this.barBg.renderOrder = 20; this.barFg.renderOrder = 21;
    scene.add(this.barBg, this.barFg);
    this.updateBar();
  }

  pickWander(from) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    this.wanderTarget.set(
      Math.max(-24, Math.min(24, from.x + Math.cos(a) * r)), 0,
      Math.max(-24, Math.min(24, from.z + Math.sin(a) * r))
    );
  }

  updateBar() {
    const f = Math.max(0, this.hp / this.maxHp);
    this.barFg.scale.x = 1.05 * f;
    this.barFg.material.color.setHex(f > 0.5 ? 0x33ff66 : f > 0.25 ? 0xffbb22 : 0xff3333);
    const p = this.group.position;
    this.barBg.position.set(p.x, 2.45, p.z);
    this.barFg.position.set(p.x - (1 - f) * 0.52, 2.45, p.z);
    const vis = this.alive && f < 1;
    this.barBg.visible = vis; this.barFg.visible = vis;
  }

  takeDamage(dmg, particles, hitPoint) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flashTimer = 0.09;
    this.joltTimer = 0.18;
    this.bodyMat.emissive.setHex(0xffffff);
    if (hitPoint && particles) particles.burst(hitPoint, 0xff4455, 5);
    this.updateBar();
    if (this.hp <= 0) {
      this.die(particles);
      return true;
    }
    return false;
  }

  die(particles) {
    this.alive = false;
    this.state = 'dead';
    this.deadTimer = 1.0;
    this.barBg.visible = false; this.barFg.visible = false;
    if (particles) particles.burst(this.group.position.clone().setY(1.3), this.accent, 8);
  }

  // Returns 'attackReady' event info or null. onAttack callback handled by main.
  update(dt, playerPos, world, losClear) {
    const g = this.group;
    if (!this.alive) {
      // Death animation: crumple backward + tip sideways, arms splay, core dims.
      this.deadTimer -= dt;
      g.rotation.x = Math.max(-Math.PI / 2, g.rotation.x - dt * 2.6);
      g.rotation.z += (this.deathDir * 1.1 - g.rotation.z) * Math.min(1, dt * 4);
      g.position.y = Math.max(-1.2, g.position.y - dt * 0.9);
      this.armL.rotation.x += (-2.4 - this.armL.rotation.x) * Math.min(1, dt * 5);
      this.armR.rotation.x += (-2.4 - this.armR.rotation.x) * Math.min(1, dt * 5);
      this.armL.rotation.z = 0.7; this.armR.rotation.z = -0.7;
      if (this.core) {
        const s = Math.max(0.15, this.core.scale.x - dt * 2);
        this.core.scale.set(s, s, s);
      }
      return null;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.bodyMat.emissive.setHex(0x000000);
    }

    const toPlayer = new THREE.Vector3().subVectors(playerPos, g.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    let moveTarget = null;
    let wantAttack = false;
    if (dist < this.attackRange && losClear) {
      this.state = 'attack';
      wantAttack = true;
    } else if (dist < this.detectRange) {
      this.state = 'chase';
      moveTarget = playerPos;
    } else {
      this.state = 'patrol';
      if (g.position.distanceTo(this.wanderTarget) < 1.2) this.pickWander(g.position);
      moveTarget = this.wanderTarget;
    }

    // face movement or player
    const face = wantAttack ? toPlayer : (moveTarget ? new THREE.Vector3().subVectors(moveTarget, g.position) : null);
    if (face && face.lengthSq() > 0.01) {
      const targetYaw = Math.atan2(-face.x, -face.z);
      let d = targetYaw - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += THREE.MathUtils.clamp(d, -3 * dt, 3 * dt);
    }

    if (moveTarget && !(wantAttack && dist < this.attackRange * 0.6)) {
      const dir = new THREE.Vector3().subVectors(moveTarget, g.position);
      dir.y = 0;
      const L = dir.length();
      if (L > 0.3) {
        dir.normalize();
        // slight strafe wobble in chase so enemies don't stack in a line
        if (this.state === 'chase') {
          const w = Math.sin(performance.now() * 0.001 + this.id) * 0.35;
          const px = -dir.z * w, pz = dir.x * w;
          dir.x += px; dir.z += pz; dir.normalize();
        }
        const before = g.position.clone();
        g.position.x += dir.x * this.speed * dt;
        g.position.z += dir.z * this.speed * dt;
        collideWorld(g.position, 0.6, world.boxes, world.circles);
        // stuck detection -> pick new wander dir / sidestep
        this.stuckTimer += dt;
        if (this.stuckTimer > 0.6) {
          this.stuckTimer = 0;
          const moved = g.position.distanceTo(this.lastPos);
          this.lastPos.copy(g.position);
          if (moved < 0.25 && L > 1) {
            this.pickWander(g.position);
            g.rotation.y += Math.PI / 2;
          }
        }
        void before;
      }
      // walk animation
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase) * 0.55;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      g.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
    } else if (wantAttack) {
      // Strafe orbit while shooting: face player but sidestep, keep range.
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1 + Math.random() * 2;
        this.strafeDir = Math.random() < 0.7 ? -this.strafeDir : this.strafeDir;
      }
      if (dist > 0.5) {
        const fwd = toPlayer.clone().normalize();
        const px = -fwd.z * this.strafeDir, pz = fwd.x * this.strafeDir;
        // radial correction: close in when far, back off when crowded
        let radial = 0;
        if (dist > this.attackRange * 0.85) radial = 0.8;
        else if (dist < this.attackRange * 0.45) radial = -0.8;
        const mx = px * 0.9 + fwd.x * radial;
        const mz = pz * 0.9 + fwd.z * radial;
        const ml = Math.hypot(mx, mz);
        if (ml > 0.01) {
          const before = g.position.clone();
          const sp = this.speed * 0.65;
          g.position.x += (mx / ml) * sp * dt;
          g.position.z += (mz / ml) * sp * dt;
          collideWorld(g.position, 0.6, world.boxes, world.circles);
          // blocked strafe -> flip direction so they don't grind walls
          if (g.position.distanceTo(before) < sp * dt * 0.3) {
            this.strafeDir *= -1;
            this.strafeTimer = Math.max(this.strafeTimer, 0.5);
          }
        }
      }
      // walk animation while strafing
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase) * 0.55;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      g.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
    } else {
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
    }
    // support-arm swing + gun-arm aim pose + shooting recoil
    const attacking = this.state === 'attack';
    const swing = Math.sin(this.walkPhase);
    this.armL.rotation.x = attacking ? -0.55 + swing * 0.06 : swing * 0.5;
    this.armL.rotation.z = 0;
    this.armR.rotation.x = attacking ? -1.15 + Math.sin(this.walkPhase + 0.4) * 0.05 : Math.sin(this.walkPhase + Math.PI) * 0.45;
    this.armR.rotation.z = 0;
    // recoil decay + muzzle flash fade
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.muzzle) this.muzzle.material.opacity = Math.max(0, this.muzzle.material.opacity - dt * 9);
    if (this.gunGroup) {
      const kick = this.recoil * 0.09;
      this.gunGroup.position.z = -0.45 + kick;
      this.gunGroup.position.y = 1.15 + (attacking ? 0.06 : Math.abs(Math.cos(this.walkPhase)) * 0.015) - this.recoil * 0.02;
      this.gunGroup.rotation.x = -this.recoil * 0.18;
    }
    // torso lean into motion + breathing idle
    const moving = this.state !== 'attack' || Math.abs(swing) > 0.05;
    void moving;
    // hit-reaction jolt (quick tilt that decays), else strafe lean into sidestep
    if (this.joltTimer > 0) {
      this.joltTimer -= dt;
      g.rotation.z = Math.sin((this.joltTimer / 0.18) * Math.PI) * 0.12;
    } else if (attacking) {
      const lean = THREE.MathUtils.clamp(-this.strafeDir * 0.09, -0.12, 0.12);
      g.rotation.z += (lean - g.rotation.z) * Math.min(1, dt * 6);
    } else {
      g.rotation.z += (0 - g.rotation.z) * Math.min(1, dt * 8);
    }

    // attack cooldown
    this.attackTimer -= dt;
    if (wantAttack && this.attackTimer <= 0) {
      this.attackTimer = this.attackCd;
      this.recoil = 1;
      if (this.muzzle) {
        this.muzzle.material.opacity = 0.95;
        const s = 0.9 + Math.random() * 0.5;
        this.muzzle.scale.set(s, s, s);
      }
      this.gunTipObj.getWorldPosition(this.gunTipWorld);
      return { type: 'enemyFire', from: this.gunTipWorld.clone(), enemy: this };
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.group, this.barBg, this.barFg);
  }
}
