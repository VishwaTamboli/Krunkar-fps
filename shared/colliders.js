// Major static blockers mirrored from arena.js, for authoritative server LOS.
// Entries: { minX, maxX, minZ, maxZ, h }. Browser- and Node-safe (no DOM).
const DEFS = [
  // x, z, w, d, h — corner blocks
  [-16, -16, 14, 12, 7.4], [16, -16, 14, 12, 8.4],
  [-16, 16, 14, 12, 6.4], [16, 16, 14, 12, 7.4],
  // side blocks
  [-19, 5.5, 10, 5, 5.4], [19, -5.5, 10, 5, 5.4],
  // low shops
  [-6, -14, 5, 4, 4.4], [6, -14, 5, 4, 4.4],
  [-6, 14, 5, 4, 4.4], [6, 14, 5, 4, 4.4],
  // vehicles
  [-8, 1.4, 5.2, 2, 2.1], [9, -1.6, 3.6, 1.8, 1.55],
  // crates + dumpsters
  [-19, -4, 2.4, 2.4, 2.4], [-16.2, -4.2, 1.6, 1.6, 1.6],
  [-19, 8.6, 2, 2, 2], [20.5, 1.8, 2.2, 1.4, 1.6],
  [12, 10.5, 2.2, 1.2, 1.3], [-12, -10.5, 2.2, 1.2, 1.3],
  // plaza fountain (approx box) + terrace deck
  [0, -7.7, 4, 4, 2.2], [-6, 9.2, 3.5, 2.5, 0.9],
];

export const WALLS = DEFS.map(([x, z, w, d, h]) => ({
  minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h,
}));

// Smallest t in (eps, maxT) where ray o+t*d enters a wall box, else Infinity.
export function segmentWallT(ox, oy, oz, dx, dy, dz, maxT) {
  let best = Infinity;
  for (const w of WALLS) {
    let tmin = 0;
    let tmax = maxT;
    // X slab
    if (Math.abs(dx) < 1e-9) {
      if (ox < w.minX || ox > w.maxX) continue;
    } else {
      let t1 = (w.minX - ox) / dx;
      let t2 = (w.maxX - ox) / dx;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab (box spans 0..h)
    if (Math.abs(dy) < 1e-9) {
      if (oy < 0 || oy > w.h) continue;
    } else {
      let t1 = (0 - oy) / dy;
      let t2 = (w.h - oy) / dy;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) {
      if (oz < w.minZ || oz > w.maxZ) continue;
    } else {
      let t1 = (w.minZ - oz) / dz;
      let t2 = (w.maxZ - oz) / dz;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin > 1e-4 && tmin < best) best = tmin;
  }
  return best;
}

// Ray-sphere t (nearest positive) or Infinity. Used for player capsules.
export function raySphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const thc = Math.sqrt(Math.max(0, r2 - d2));
  const t = tca - thc;
  return t > 1e-4 ? t : Infinity;
}
