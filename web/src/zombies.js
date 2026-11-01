// Zombie police officers (your RE2 model, auto-rigged by tools/process_people.py). They spawn in a ring around the player, shamble / run
// at him and claw when close. Animation is procedural (walker.pose + a reaching-arms overlay), no clips.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF, makeRig, pose, armsForward } from './walker.js';
import { raySphere } from './weapons.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Zombies {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.zs = []; this.model = null; this.count = 0; this.frame = 0;
    this.R_MIN = 32; this.R_MAX = 85; this.R_LOSE = 130;
    this.kills = 0;
  }

  async load(url = 'models/zombie/zombie_lod.glb') {
    try { this.model = (await loadGLTF(url)).scene; } catch (e) { console.warn('zombie model failed', e); return; }
    this.rebuild();
  }

  setCount(n) { this.count = n; this.rebuild(); }

  rebuild() {
    for (const z of this.zs) this.group.remove(z.root);
    this.zs = [];
    if (!this.model) return;
    for (let i = 0; i < this.count; i++) {
      const scene = cloneSkinned(this.model); const root = new THREE.Group(); root.add(scene); this.group.add(root);
      const run = Math.random() < 0.3;
      this.zs.push({ root, rig: makeRig(scene), pos: new THREE.Vector3(1e5, 0, 0), yaw: Math.random() * 6.28, speed: 0, phase: Math.random() * 6, seed: Math.random() * 9, grounded: true,
        hp: 100, state: 'dead', lie: 0, respawn: Math.random() * 3, vmax: run ? 3.4 : 1.5 + Math.random() * 0.7, atk: 0, check: Math.random() * 0.3, blocked: false, wob: Math.random() * 6, hurt: 0 });
      root.visible = false;
    }
  }

  clear() { for (const z of this.zs) { z.state = 'dead'; z.lie = 0; z.respawn = 1 + Math.random() * 3; z.root.visible = false; } }

  _spawn(z, around, ctx) {
    const a = Math.random() * Math.PI * 2, r = this.R_MIN + Math.sqrt(Math.random()) * (this.R_MAX - this.R_MIN);
    z.pos.set(around.x + Math.sin(a) * r, around.y, around.z + Math.cos(a) * r);
    if (ctx.allowed && !ctx.allowed(z.pos.x, z.pos.z)) { z.respawn = 0.5; return false; }
    z.pos.y = ctx.ground(z.pos.x, z.pos.z, around.y);
    z.hp = 100; z.state = 'chase'; z.fall = 0; z.speed = 0; z.root.visible = true; z.root.rotation.x = 0; z.yaw = Math.atan2(around.x - z.pos.x, around.z - z.pos.z);
    return true;
  }

  /** @param ctx {ground, blocked, hurt(dmg), allowed?(x,z), car?} */
  update(dt, player, ctx, active) {
    this.group.visible = active && this.zs.length > 0;
    if (!active) return;
    this.frame++;
    for (const z of this.zs) {
      const dx = player.x - z.pos.x, dz = player.z - z.pos.z, dist = Math.hypot(dx, dz);
      if (z.state === 'dead') {
        if (z.lie > 0) { z.lie -= dt; this._lie(z, dt); if (z.lie <= 0) { z.root.visible = false; z.respawn = 2 + Math.random() * 4; } continue; }
        z.respawn -= dt; if (z.respawn <= 0) this._spawn(z, player, ctx);
        continue;
      }
      if (dist > this.R_LOSE) { z.state = 'dead'; z.lie = 0; z.respawn = 1; z.root.visible = false; continue; }
      z.hurt = Math.max(0, z.hurt - dt * 4);
      // steer to the player
      const want = z.state === 'attack' ? 0 : z.vmax;
      if (dist > 1.05) {
        z.yaw += angDiff(z.yaw, Math.atan2(dx, dz) + Math.sin(performance.now() / 700 + z.wob) * 0.18) * (1 - Math.exp(-dt * 4));
        z.state = 'chase';
      } else z.state = 'attack';
      z.speed += (want - z.speed) * (1 - Math.exp(-dt * 5));
      const sx = Math.sin(z.yaw), sz = Math.cos(z.yaw), step = z.speed * dt;
      if (step > 1e-4) {
        z.check -= dt;
        if (z.check <= 0) { z.check = 0.25; z.blocked = ctx.blocked ? ctx.blocked(z.pos, sx, sz, 1.0) : false; }
        if (z.blocked) { z.yaw += (z.wob > 3 ? 1 : -1) * 1.1; z.blocked = false; }
        else { z.pos.x += sx * step; z.pos.z += sz * step; }
      }
      // do not stack
      for (const o of this.zs) {
        if (o === z || o.state === 'dead') continue;
        const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, od2 = ox * ox + oz * oz;
        if (od2 < 0.5 && od2 > 1e-6) { const od = Math.sqrt(od2), push = (0.7 - od) * 0.5; z.pos.x += ox / od * push; z.pos.z += oz / od * push; }
      }
      const gy = ctx.ground(z.pos.x, z.pos.z, z.pos.y);
      z.pos.y += (gy - z.pos.y) * (1 - Math.exp(-dt * 18));
      z.root.position.copy(z.pos); z.root.rotation.y = z.yaw;
      // claws
      if (z.state === 'attack') { z.atk -= dt; if (z.atk <= 0) { z.atk = 0.95; ctx.hurt && ctx.hurt(9 + Math.random() * 5, z); } }
      else z.atk = Math.min(z.atk, 0.4);
      const near = dist < 40;
      if (near || (this.frame + (z.seed | 0)) % 2 === 0) this._anim(z, near ? dt : dt * 2);
    }
  }

  _anim(z, dt) {
    z.phase = pose(z.rig, z, dt, 0);
    const B = z.rig.bones, R = z.rig.rest, t = performance.now() / 1000;
    const set = (n, x = 0, y = 0, zz = 0) => { const b = B[n]; if (b) b.rotation.set(R[n].x + x, R[n].y + y, R[n].z + zz); };
    const reach = z.state === 'attack' ? Math.sin(t * 9 + z.seed) * 0.35 : Math.sin(t * 2 + z.seed) * 0.08;
    armsForward(z.rig, 1, { l: 1.3 + reach * 0.5, li: -0.25, lf: 0.2, r: 1.4 - reach * 0.5, ri: -0.25, rf: 0.25 });
    const lean = 0.22 + clamp(z.speed / 3.4, 0, 1) * 0.18;
    set('Spine', lean, Math.sin(t * 1.3 + z.seed) * 0.1); set('Chest', lean * 0.8, -Math.sin(t * 1.3 + z.seed) * 0.12);
    set('Neck', 0.18 + Math.sin(t * 0.9 + z.seed) * 0.1, 0, Math.sin(t * 1.1 + z.seed) * 0.28); set('Head', 0.05, 0, 0.18);
    if (z.hurt > 0 && B.Spine) B.Spine.rotation.x -= z.hurt * 0.25;
    z.root.position.y = z.pos.y; z.root.rotation.x = 0;
  }

  _lie(z, dt) {
    // fall backwards, then lie still
    z.fall = clamp((z.fall || 0) + dt * 2.2, 0, 1);
    z.root.rotation.x = -Math.PI / 2 * z.fall; z.root.position.y = z.pos.y + 0.1 * z.fall;
    z.root.visible = true;
  }

  /** nearest hit among living zombies: head sphere (headshot) or torso sphere */
  rayHit(o, d, maxT) {
    let best = null;
    for (const z of this.zs) {
      if (z.state === 'dead') continue;
      const h = _c.set(z.pos.x, z.pos.y + 1.62, z.pos.z), b = _c2.set(z.pos.x, z.pos.y + 1.0, z.pos.z), l = _c3.set(z.pos.x, z.pos.y + 0.45, z.pos.z);
      const th = raySphere(o, d, h, 0.2); if (th !== null && th < maxT && (!best || th < best.t)) best = { t: th, z, head: true };
      const tb = raySphere(o, d, b, 0.42); if (tb !== null && tb < maxT && (!best || tb < best.t)) best = { t: tb, z, head: false };
      const tl = raySphere(o, d, l, 0.32); if (tl !== null && tl < maxT && (!best || tl < best.t)) best = { t: tl, z, head: false };
    }
    return best;
  }

  damage(z, dmg) {
    z.hp -= dmg; z.hurt = 1;
    if (z.hp <= 0 && z.state !== 'dead') { z.state = 'dead'; z.lie = 6; z.fall = 0; this.kills++; return true; }
    return false;
  }

  /** a car hit it */
  runOver(z) { if (z.state !== 'dead') { z.hp = 0; z.state = 'dead'; z.lie = 5; z.fall = 0; this.kills++; return true; } return false; }

  get alive() { return this.zs.filter((z) => z.state !== 'dead').length; }
}
const _c = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
