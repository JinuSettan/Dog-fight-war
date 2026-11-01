// On-foot weapons: AK-47 and pistol (your gun_*.glb), hitscan shooting from the camera crosshair, tracers, muzzle flash, ammo.
// Targets are anything with rayHit(origin, dir, maxDist) -> {t, hit} | null  (zombies, cars, pedestrians); walls stop bullets.
import * as THREE from 'three';
import { loadGLTF } from './walker.js';

export const WEAPONS = {
  none: { id: 'none', name: 'Fists', mag: 0, reserve: 0 },
  pistol: { id: 'pistol', name: 'Pistol', file: 'gun_pistol.glb', mag: 12, reserve: 60, rate: 4, dmg: 34, spread: 0.004, auto: false, hold: [0.17, 1.30, 0.40], recoil: 0.05 },
  ak47: { id: 'ak47', name: 'AK-47', file: 'gun_ak47.glb', mag: 30, reserve: 150, rate: 9.5, dmg: 26, spread: 0.014, auto: true, hold: [0.10, 1.31, 0.52], recoil: 0.035 },
};
const ORDER = ['ak47', 'pistol', 'none'];

export class Weapons {
  constructor(scene, audio) {
    this.audio = audio; this.scene = scene;
    this.cur = 'ak47'; this.guns = {}; this.ammo = {}; this.cool = 0; this.reloadT = 0; this.flashT = 0; this.kick = 0;
    for (const w of Object.values(WEAPONS)) this.ammo[w.id] = { mag: w.mag, reserve: w.reserve };
    // tracers
    this.tracers = []; const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      const l = new THREE.Line(g, mat.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); this.tracers.push({ l, t: 0 });
    }
    // muzzle flash (two crossed additive quads)
    const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    for (let k = 0; k < 2; k++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), fm); q.rotation.z = k * 0.8; this.flash.add(q); }
    this.flash.visible = false; scene.add(this.flash);
    // impact sparks
    this.sparks = []; const sm = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), sm.clone()); m.visible = false; scene.add(m); this.sparks.push({ m, t: 0 }); }
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3(); this._mz = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  async load(walkerRoot, base = 'models/props/') {
    this.holder = new THREE.Group(); walkerRoot.add(this.holder);
    for (const id of ['ak47', 'pistol']) {
      try {
        const g = await loadGLTF(base + WEAPONS[id].file);
        const m = g.scene.clone(true); m.position.set(...WEAPONS[id].hold); m.visible = false; this.holder.add(m); this.guns[id] = m;
        const bb = new THREE.Box3().setFromObject(g.scene); m.userData.len = bb.max.z - bb.min.z; m.userData.front = bb.max.z;
      } catch (e) { console.warn('weapon load failed', id, e); }
    }
    this.select(this.cur);
  }

  get weapon() { return WEAPONS[this.cur]; }
  get armed() { return this.cur !== 'none' && !!this.guns[this.cur]; }

  select(id) {
    if (!WEAPONS[id]) return;
    this.cur = id; this.reloadT = 0;
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === id;
  }
  cycle() { this.select(ORDER[(ORDER.indexOf(this.cur) + 1) % ORDER.length]); return this.weapon.name; }

  reload() {
    const w = this.weapon, a = this.ammo[w.id];
    if (!w.mag || this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return false;
    this.reloadT = w.id === 'ak47' ? 2.0 : 1.4; return true;
  }
  addAmmo(n) { for (const id of ['ak47', 'pistol']) this.ammo[id].reserve += Math.round(n * (id === 'ak47' ? 1 : 0.5)); }

  show(v) { if (this.holder) this.holder.visible = v; }

  _tracer(a, b) {
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const p = t.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.l.visible = true; t.t = 0.07; t.l.material.opacity = 0.9;
  }
  _spark(p) {
    const s = this.sparks.find((x) => x.t <= 0) || this.sparks[0];
    s.m.position.copy(p); s.m.visible = true; s.t = 0.12; s.m.scale.setScalar(1);
  }

  /**
   * @param dt seconds; @param wantFire trigger held; @param cam THREE.Camera (crosshair ray); @param ctx {targets[], world, groundY, onHit(kind, ref, hit, dmg, head)}
   * @returns {fired, empty}
   */
  update(dt, wantFire, cam, ctx) {
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; t.l.material.opacity = Math.max(0, t.t / 0.07) * 0.9; if (t.t <= 0) t.l.visible = false; }
    for (const s of this.sparks) if (s.t > 0) { s.t -= dt; s.m.scale.multiplyScalar(1 + dt * 8); s.m.material.opacity = Math.max(0, s.t / 0.12); if (s.t <= 0) s.m.visible = false; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.kick = Math.max(0, this.kick - dt * 6);
    this.cool -= dt;
    const w = this.weapon, g = this.guns[this.cur];
    if (g) { g.position.z = w.hold[2] - this.kick * 0.35; g.rotation.x = -this.kick * 0.5; }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (g) g.rotation.x = 0.7 * Math.sin(Math.min(1, this.reloadT) * Math.PI);
      if (this.reloadT <= 0) { const a = this.ammo[w.id], n = Math.min(w.mag - a.mag, a.reserve); a.mag += n; a.reserve -= n; this.reloadT = 0; }
      return { fired: false };
    }
    if (!this.armed || !wantFire) { this._held = wantFire; return { fired: false }; }
    if (!w.auto && this._held) return { fired: false };
    this._held = wantFire;
    if (this.cool > 0) return { fired: false };
    const a = this.ammo[w.id];
    if (a.mag <= 0) { if (!this.reload()) { this.cool = 0.3; this.audio && this.audio.beep(300, 0.04, 'square', 0.05); return { fired: false, empty: true }; } return { fired: false }; }
    a.mag--; this.cool = 1 / w.rate; this.kick = 1; this.flashT = 0.045;
    this.audio && this.audio.gun();
    // crosshair ray with spread
    cam.getWorldDirection(this._d);
    this._d.x += (Math.random() - 0.5) * 2 * w.spread; this._d.y += (Math.random() - 0.5) * 2 * w.spread; this._d.z += (Math.random() - 0.5) * 2 * w.spread; this._d.normalize();
    this._o.copy(cam.position);
    let bestT = 220, hit = null, kind = null;
    for (const tg of ctx.targets) {
      const r = tg.rayHit(this._o, this._d, bestT);
      if (r && r.t < bestT) { bestT = r.t; hit = r; kind = tg; }
    }
    const wall = ctx.world ? ctx.world.rayWall(this._o, this._d, bestT) : null;
    if (wall !== null && wall < bestT) { bestT = wall; hit = null; kind = null; }
    if (!hit && ctx.groundY != null && this._d.y < -0.01) { const tg = (ctx.groundY - this._o.y) / this._d.y; if (tg > 0 && tg < bestT) bestT = tg; }
    const end = this._o.clone().addScaledVector(this._d, bestT);
    // muzzle position
    if (g) { this._mz.set(0, 0, g.userData.front || 0.4); g.localToWorld(this._mz); } else this._mz.copy(this._o);
    this.flash.position.copy(this._mz); this.flash.quaternion.copy(cam.quaternion); this.flash.visible = true; this.flash.scale.setScalar(this.cur === 'ak47' ? 1 : 0.7);
    this._tracer(this._mz, end);
    if (hit && kind) { this._spark(end); ctx.onHit && ctx.onHit(kind, hit, w.dmg * (hit.head ? 2.2 : 1), end); }
    else if (bestT < 219) this._spark(end);
    return { fired: true };
  }
}

/** ray vs sphere helper: t of the first intersection in front of the origin, or null */
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : (-b + Math.sqrt(disc) > 0 ? 0.01 : null);
}
