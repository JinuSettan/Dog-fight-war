// Cars: your police Dodge Charger and BMW M3 Touring. Parked cars, AI traffic that follows the road graph, and arcade driving for the player
// (hijack with E). Everything is plain maths: bicycle-model steering, 4 wheel-point ground sampling, ray tests for walls.
import * as THREE from 'three';
import { loadGLTF } from './walker.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export const SPECS = {
  police: { id: 'police', file: 'car_police.glb', name: 'Police Charger', L: 5.07, W: 2.04, H: 1.68, wb: 3.05, vmax: 46, acc: 15 },
  m3: { id: 'm3', file: 'car_m3.glb', name: 'BMW M3 Touring', L: 4.84, W: 2.1, H: 1.46, wb: 2.85, vmax: 56, acc: 20 },
};

export class Vehicles {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group); this.cars = []; this.src = {}; this.frame = 0;
    this.traffic = 0; this.ready = false;
  }

  async load(base = 'models/props/') {
    for (const s of Object.values(SPECS)) {
      try {
        const g = await loadGLTF(base + s.file); this.src[s.id] = g.scene;
        g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; } });
      } catch (e) { console.warn('car load failed', s.id, e); }
    }
    this.ready = Object.keys(this.src).length > 0;
  }

  spawn(kind, x, z, yaw, y = 0) {
    const spec = SPECS[kind]; if (!spec || !this.src[kind]) return null;
    const root = new THREE.Group(); const body = this.src[kind].clone(true); root.add(body); this.group.add(root);
    const car = { kind, spec, root, body, pos: new THREE.Vector3(x, y, z), yaw, speed: 0, pitch: 0, roll: 0, hp: 100, wrecked: false, driver: null, ai: null,
      gt: Math.random() * 0.1, check: Math.random() * 0.25, wall: false, want: 9 + Math.random() * 6, wait: 0, sampleY: y, stuck: 0 };
    this._place(car); this.cars.push(car); return car;
  }

  remove(car) { this.group.remove(car.root); this.cars.splice(this.cars.indexOf(car), 1); }
  clear() { for (const c of [...this.cars]) this.group.remove(c.root); this.cars = []; }

  _place(car) { car.root.position.copy(car.pos); car.root.rotation.set(car.pitch, car.yaw, car.roll, 'YXZ'); }

  /** four wheel-points ground sampling -> height, pitch, roll */
  _ground(car, ctx, dt, full) {
    const S = car.spec, s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    if (!full) {
      const y = ctx.ground(car.pos.x, car.pos.z, car.pos.y);
      car.sampleY = y; car.pos.y += (y - car.pos.y) * (1 - Math.exp(-dt * 12)); car.pitch *= 0.9; car.roll *= 0.9; return;
    }
    const hw = S.W * 0.4, hl = S.wb * 0.5;
    const p = (lx, lz) => { const x = car.pos.x + c * lx + s * lz, z = car.pos.z - s * lx + c * lz; return ctx.ground(x, z, car.pos.y); };
    const fl = p(-hw, hl), fr = p(hw, hl), rl = p(-hw, -hl), rr = p(hw, -hl);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2, left = (fl + rl) / 2, right = (fr + rr) / 2;
    const y = (front + rear) / 2;
    const tp = -Math.atan2(front - rear, S.wb), tr = Math.atan2(left - right, S.W * 0.8);
    const k = 1 - Math.exp(-dt * 10);
    car.pos.y += (y - car.pos.y) * (1 - Math.exp(-dt * 14)); car.pitch += (clamp(tp, -0.45, 0.45) - car.pitch) * k; car.roll += (clamp(tr, -0.35, 0.35) - car.roll) * k;
  }

  /** speed / steering integration. steer: +1 = right. */
  _integrate(car, thr, steer, hand, dt) {
    const S = car.spec; let v = car.speed;
    if (car.wrecked) thr = 0;
    if (thr > 0) { if (v >= 0) v += S.acc * thr * (1 - Math.max(0, v) / S.vmax) * dt; else v += 30 * thr * dt; }
    else if (thr < 0) { if (v > 0.4) v -= 32 * -thr * dt; else v += S.acc * 0.55 * thr * (1 - -v / 12) * dt; }
    else v -= Math.sign(v) * Math.min(Math.abs(v), (1.8 + Math.abs(v) * 0.06) * dt);
    if (hand) v -= Math.sign(v) * Math.min(Math.abs(v), 24 * dt);
    car.speed = v;
    const sa = steer * 0.62 / (1 + Math.abs(v) / 7);
    const lim = 15 / Math.max(8, Math.abs(v)) * (hand ? 1.7 : 1);          // lateral-grip limit: fast cars turn slowly
    car.yaw -= clamp(v * Math.tan(sa) / S.wb * (hand ? 1.6 : 1), -lim, lim) * dt;
    car.pos.x += Math.sin(car.yaw) * v * dt; car.pos.z += Math.cos(car.yaw) * v * dt;
  }

  impact(car, v, ctx) {
    const a = Math.abs(v);
    if (a > 4) { car.hp -= (a - 4) * 2.4; ctx.onCrash && ctx.onCrash(car, a); }
    car.speed = -v * 0.28;
    if (car.hp <= 0 && !car.wrecked) { car.hp = 0; car.wrecked = true; car.body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.color) o.material.color.multiplyScalar(0.28); } }); ctx.onWreck && ctx.onWreck(car); }
  }

  _collide(car, ctx, dt) {
    const S = car.spec, v = car.speed;
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    // walls (map buildings / scenery): rays from the bumper in the direction of travel
    if (Math.abs(v) > 0.6 && ctx.world) {
      car.check -= dt;
      if (car.check <= 0) {
        car.check = ctx.player === car ? 0 : 0.2;
        const dir = Math.sign(v), px = car.pos.x + s * dir * S.L * 0.5, pz = car.pos.z + c * dir * S.L * 0.5;
        car.wall = ctx.world.wallAhead(px, car.pos.y, pz, s * dir, c * dir, Math.abs(v) * 0.12 + 0.35)
          || ctx.world.wallAhead(px + c * S.W * 0.4, car.pos.y, pz - s * S.W * 0.4, s * dir, c * dir, Math.abs(v) * 0.12 + 0.35)
          || ctx.world.wallAhead(px - c * S.W * 0.4, car.pos.y, pz + s * S.W * 0.4, s * dir, c * dir, Math.abs(v) * 0.12 + 0.35);
      }
      if (car.wall) { car.pos.x -= s * Math.sign(v) * Math.min(0.4, Math.abs(v) * dt); car.pos.z -= c * Math.sign(v) * Math.min(0.4, Math.abs(v) * dt); this.impact(car, v, ctx); car.wall = false; car.stuck += 1; }
    }
    // trees
    if (ctx.veg && ctx.veg.active) { const px = car.pos.x, pz = car.pos.z; if (ctx.veg.push(car.pos, S.W * 0.5) && Math.abs(v) > 1.5) this.impact(car, v, ctx); else if (car.pos.x !== px || car.pos.z !== pz) car.speed *= 0.9; }
    // other cars (two circles per car)
    for (const o of this.cars) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > 36) continue;
      const R = 1.05 + 1.05, so = Math.sin(o.yaw), co = Math.cos(o.yaw);
      for (const a of [-1.3, 1.3]) for (const b of [-1.3, 1.3]) {
        const ax = car.pos.x + s * a, az = car.pos.z + c * a, bx = o.pos.x + so * b, bz = o.pos.z + co * b;
        const ex = bx - ax, ez = bz - az, ed = Math.hypot(ex, ez);
        if (ed < R && ed > 1e-4) {
          const push = (R - ed) * 0.5, nx = ex / ed, nz = ez / ed;
          car.pos.x -= nx * push; car.pos.z -= nz * push;
          if (o.driver !== 'player' && !o.ai) { o.pos.x += nx * push; o.pos.z += nz * push; }
          const rel = Math.abs(car.speed - o.speed);
          if (rel > 3 && ctx.player === car) this.impact(car, car.speed, ctx); else car.speed *= 0.92;
          o.speed *= 0.85;
        }
      }
    }
    // people
    if (Math.abs(v) > 3.5 && ctx.hitPeople) ctx.hitPeople(car, s, c);
  }

  /** player control. inp {f, r, hand} */
  drive(car, inp, dt, ctx) {
    ctx.player = car;
    this._integrate(car, inp.f, inp.r, inp.hand, dt);
    this._collide(car, ctx, dt);
    car.gt -= dt; if (car.gt <= 0) { car.gt = 0.05; this._ground(car, ctx, 0.05, true); }
    this._place(car);
  }

  nearest(pos, maxD = 4) {
    let best = null, bd = maxD;
    for (const c of this.cars) { const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) - c.spec.W * 0.3; if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /** obstacle in front of an AI car (other cars, people) */
  _blocked(car, ctx) {
    const s = Math.sin(car.yaw), c = Math.cos(car.yaw), look = 6 + Math.abs(car.speed) * 1.3;
    const test = (x, z, lat) => { const dx = x - car.pos.x, dz = z - car.pos.z, f = dx * s + dz * c, l = dx * c - dz * s; return f > 1 && f < look && Math.abs(l) < lat; };
    for (const o of this.cars) if (o !== car && test(o.pos.x, o.pos.z, 2.6)) return true;
    if (ctx.people) for (const p of ctx.people) if (test(p.x, p.z, 1.9)) return true;
    return false;
  }

  _ai(car, dt, ctx) {
    const R = ctx.roads, a = car.ai; if (!R || !R.ready || !a) return;
    const n = R.nodes[a.to]; if (!n) { car.ai = null; return; }
    const m = R.nodes[a.from] || n;
    let fx = n.x - m.x, fz = n.z - m.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const off = 2.3, tx = n.x - fz * off, tz = n.z + fx * off;          // right-hand lane: right = (-fz, fx)
    const dx = tx - car.pos.x, dz = tz - car.pos.z, dist = Math.hypot(dx, dz);
    if (dist < 7) { const nx = R.next(a.to, a.from); if (nx < 0) { car.ai = null; return; } a.from = a.to; a.to = nx; }
    const des = Math.atan2(dx, dz), err = angDiff(car.yaw, des);
    const steer = clamp(-err * 1.8, -1, 1);
    let want = car.want * (Math.abs(err) > 0.5 ? 0.45 : 1) * (dist < 25 ? 0.7 : 1);
    if (this._blocked(car, ctx)) want = 0;
    if (car.wait > 0) { car.wait -= dt; want = 0; }
    const thr = car.speed < want - 0.5 ? 0.8 : car.speed > want + 1 ? -0.5 : 0;
    this._integrate(car, thr, steer, want === 0 && car.speed < 2, dt);
    if (Math.abs(car.speed) < 0.3 && want > 0) { car.stuck += dt; if (car.stuck > 5) { car.ai = null; car.stuck = 0; car.respawnMe = true; } } else car.stuck = 0;
  }

  /** place an AI car on the road near the player */
  _spawnTraffic(car, player, ctx) {
    const R = ctx.roads; if (!R || !R.ready) return false;
    const at = R.randomNear(player.x, player.z, 70, 210); if (at < 0) return false;
    const nx = R.next(at, -1); if (nx < 0) return false;
    const a = R.nodes[at], b = R.nodes[nx];
    let fx = b.x - a.x, fz = b.z - a.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    const t = 0.15 + Math.random() * 0.6;
    car.pos.set(a.x + (b.x - a.x) * t - fz * 2.3, player.y, a.z + (b.z - a.z) * t + fx * 2.3);
    car.pos.y = ctx.ground(car.pos.x, car.pos.z, player.y); car.yaw = Math.atan2(fx, fz); car.speed = 0; car.hp = 100; car.respawnMe = false;
    car.ai = { from: at, to: nx }; car.driver = 'npc'; car.root.visible = true;
    return true;
  }

  setTraffic(n) { this.traffic = n; }

  /** make sure `traffic` AI cars exist (added lazily so the roads can finish loading first) */
  ensureTraffic(player, ctx) {
    const ai = this.cars.filter((c) => c.driver === 'npc');
    if (ai.length < this.traffic && ctx.roads && ctx.roads.ready && this.ready) {
      const k = Math.random() < 0.35 ? 'police' : 'm3';
      const c = this.spawn(k, 0, 0, 0, player.y); if (c) { if (!this._spawnTraffic(c, player, ctx)) this.remove(c); }
    } else if (ai.length > this.traffic) this.remove(ai[ai.length - 1]);
  }

  update(dt, player, ctx, active) {
    this.group.visible = active; if (!active) return;
    this.frame++;
    if (this.frame % 10 === 0) for (let i = 0; i < 3; i++) this.ensureTraffic(player, ctx);
    for (const car of this.cars) {
      if (car.driver === 'player') { car.root.visible = true; continue; }
      const d2 = (car.pos.x - player.x) ** 2 + (car.pos.z - player.z) ** 2;
      if (car.driver === 'npc') {
        if (d2 > 260 * 260 || car.respawnMe) { if (!this._spawnTraffic(car, player, ctx)) { car.root.visible = false; } continue; }
        this._ai(car, dt, ctx);
        if (d2 < 80 * 80) this._collide(car, { ...ctx, player: null }, dt);
        else { car.check = 0; }
      } else if (Math.abs(car.speed) > 0.05) { this._integrate(car, 0, 0, true, dt); }
      car.gt -= dt;
      if (car.gt <= 0) { const near = d2 < 70 * 70; car.gt = near ? 0.06 : 0.25; this._ground(car, ctx, car.gt, near); }
      car.root.visible = d2 < 320 * 320;
      this._place(car);
    }
  }

  /** ray vs oriented boxes */
  rayHit(o, d, maxT) {
    let best = null;
    for (const car of this.cars) {
      if (!car.root.visible) continue;
      const S = car.spec, s = Math.sin(car.yaw), c = Math.cos(car.yaw);
      const ox = o.x - car.pos.x, oy = o.y - (car.pos.y + S.H * 0.5), oz = o.z - car.pos.z;
      const lx = ox * c - oz * s, lz = ox * s + oz * c, dx = d.x * c - d.z * s, dz = d.x * s + d.z * c;
      let t0 = 0, t1 = maxT, hit = true;
      for (const [p, q, h] of [[lx, dx, S.W / 2], [oy, d.y, S.H / 2], [lz, dz, S.L / 2]]) {
        if (Math.abs(q) < 1e-8) { if (Math.abs(p) > h) { hit = false; break; } continue; }
        let a = (-h - p) / q, b = (h - p) / q; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 < maxT && (!best || t0 < best.t)) best = { t: t0, car };
    }
    return best;
  }

  /** chase camera for the driver */
  camera(car, orbit, ground, outPos, outLook, dt) {
    const S = car.spec, yaw = car.yaw + orbit.yaw, back = (7.4 + Math.abs(car.speed) * 0.06) * orbit.dist;
    const el = clamp(0.26 + orbit.pitch * 0.6, 0.03, 1.1);
    const tx = car.pos.x + Math.sin(car.yaw) * 1.5, tz = car.pos.z + Math.cos(car.yaw) * 1.5, ty = car.pos.y + 1.5;
    outLook.set(tx, ty, tz);
    outPos.set(tx - Math.sin(yaw) * Math.cos(el) * back, ty + Math.sin(el) * back + 0.8, tz - Math.cos(yaw) * Math.cos(el) * back);
    const gy = ground(outPos.x, outPos.z, car.pos.y); if (outPos.y < gy + 0.6) outPos.y = gy + 0.6;
  }
}
