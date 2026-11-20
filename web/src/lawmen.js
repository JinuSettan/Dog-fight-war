// Police officers and soldiers who hunt the player when he commits crimes. Same pattern as zombies.js (rigged GLB + procedural pose),
// but they stop at shooting range and fire. They only exist while the wanted level asks for them.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF, makeRig, pose, aimPose } from './walker.js';
import { raySphere } from './weapons.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const _c = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();

export class Lawmen {
  constructor(scene, audio) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.audio = audio; this.models = {}; this.us = []; this.zs = this.us; this.R_MIN = 38; this.R_MAX = 70; this.R_LOSE = 160;
    this.want = { cops: 0, army: 0 }; this.seen = false;
    // tracers
    this.tr = []; const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 10; i++) { const l = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8 })); l.visible = false; l.userData.t = 0; this.group.add(l); this.tr.push(l); }
  }
  async load(base = 'models/lawmen/') {
    for (const [k, f] of [['cop', 'police_lod.glb'], ['army', 'army_man_lod.glb']]) {
      try { this.models[k] = (await loadGLTF(base + f)).scene; } catch (e) { console.warn('lawman model', f, e); }
    }
  }
  _make(type) {
    const m = this.models[type]; if (!m) return null;
    const scene = cloneSkinned(m), root = new THREE.Group(); root.add(scene); this.group.add(root); root.visible = false;
    const u = { type, root, rig: makeRig(scene), pos: new THREE.Vector3(), yaw: 0, speed: 0, phase: Math.random() * 6, seed: Math.random() * 9, grounded: true, hp: type === 'army' ? 140 : 90, state: 'dead',
      lie: 0, fire: 1 + Math.random(), burst: 0, vmax: type === 'army' ? 4.4 : 4.0, hold: 18 + Math.random() * 8, hurt: 0, check: 0, blocked: false, wob: Math.random() * 6, leaving: false };
    this.us.push(u); return u;
  }
  count(type) { return this.us.filter((u) => u.type === type && u.state !== 'dead').length; }
  clear() { for (const u of this.us) { u.state = 'dead'; u.lie = 0; u.root.visible = false; } for (const t of this.tr) t.visible = false; }
  _spawn(type, around, ctx) {
    let u = this.us.find((x) => x.type === type && x.state === 'dead' && x.lie <= 0) || this._make(type); if (!u) return false;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = this.R_MIN + Math.random() * (this.R_MAX - this.R_MIN);
      u.pos.set(around.x + Math.sin(a) * r, around.y, around.z + Math.cos(a) * r);
      if (ctx.allowed && !ctx.allowed(u.pos.x, u.pos.z)) continue;
      u.pos.y = ctx.ground(u.pos.x, u.pos.z, around.y);
      u.hp = type === 'army' ? 140 : 90; u.state = 'chase'; u.fall = 0; u.speed = 0; u.root.visible = true; u.root.rotation.x = 0; u.leaving = false;
      u.yaw = Math.atan2(around.x - u.pos.x, around.z - u.pos.z); return true;
    }
    return false;
  }
  /** ctx {ground, blocked(from,dx,dz,d), hurt(dmg, unit), allowed?, los?(from,to)}; want {cops, army} from Wanted */
  update(dt, player, ctx, want, active) {
    this.group.visible = active && this.us.length > 0;
    for (const t of this.tr) if (t.visible) { t.userData.t -= dt; if (t.userData.t <= 0) t.visible = false; }
    if (!active) return;
    this.want = want; this.seen = false;
    for (const type of ['cop', 'army']) {
      const need = type === 'cop' ? want.cops : want.army;
      if (this.count(type) < need && (this._sp = (this._sp || 0) - dt) <= 0) { this._sp = 1.1; this._spawn(type, player, ctx); }
    }
    for (const u of this.us) {
      if (u.state === 'dead') { if (u.lie > 0) { u.lie -= dt; this._lie(u, dt); if (u.lie <= 0) u.root.visible = false; } continue; }
      if (u.script) { this._scripted(u, dt); continue; }
      const dx = player.x - u.pos.x, dz = player.z - u.pos.z, dist = Math.hypot(dx, dz);
      const need = u.type === 'cop' ? want.cops : want.army;
      if (this.count(u.type) > need) u.leaving = true;
      if (dist > this.R_LOSE || (u.leaving && dist > 55)) { u.state = 'dead'; u.lie = 0; u.root.visible = false; continue; }
      u.hurt = Math.max(0, u.hurt - dt * 4);
      const shooting = dist < u.hold + 6 && !u.leaving;
      if (dist < 70) this.seen = true;
      const wantYaw = Math.atan2(dx, dz);
      u.yaw += angDiff(u.yaw, wantYaw) * (1 - Math.exp(-dt * (shooting ? 8 : 5)));
      const goal = u.leaving ? 0 : (dist > u.hold ? u.vmax : dist < u.hold - 7 ? -1.4 : 0);
      u.speed += (goal - u.speed) * (1 - Math.exp(-dt * 5));
      const step = u.speed * dt, sx = Math.sin(u.yaw), sz = Math.cos(u.yaw);
      if (Math.abs(step) > 1e-4) {
        u.check -= dt; if (u.check <= 0) { u.check = 0.2; u.blocked = ctx.blocked ? ctx.blocked(u.pos, sx, sz, 1.2) : false; }
        if (u.blocked) { u.yaw += (u.wob > 3 ? 1 : -1) * 1.2; u.blocked = false; } else { u.pos.x += sx * step; u.pos.z += sz * step; }
      }
      const gy = ctx.ground(u.pos.x, u.pos.z, u.pos.y); u.pos.y += (gy - u.pos.y) * (1 - Math.exp(-dt * 18));
      u.root.position.copy(u.pos); u.root.rotation.y = u.yaw;
      if (shooting && Math.abs(angDiff(u.yaw, wantYaw)) < 0.25) {
        u.fire -= dt;
        if (u.fire <= 0) {
          if (u.burst <= 0) { u.burst = u.type === 'army' ? 4 : 2; u.fire = 0.9 + Math.random() * 0.9; } else { u.burst--; u.fire = u.type === 'army' ? 0.11 : 0.3; }
          if (u.burst > 0 || true) this._shoot(u, player, dist, ctx);
        }
      }
      this._anim(u, dt, shooting);
    }
  }
  /** an officer placed by a cutscene: aims at u.script.target (a Vector3) and fires tracers, never hurts anybody */
  spawnScripted(type, pos, yaw, target) {
    const u = this._make(type); if (!u) return null;
    u.pos.copy(pos); u.yaw = yaw; u.state = 'chase'; u.script = { target, t: 0 }; u.root.visible = true; u.root.position.copy(pos); u.root.rotation.y = yaw; this.group.visible = true; return u;
  }
  _scripted(u, dt) {
    const s = u.script; s.t -= dt; const tg = s.target;
    u.yaw += angDiff(u.yaw, Math.atan2(tg.x - u.pos.x, tg.z - u.pos.z)) * (1 - Math.exp(-dt * 6)); u.root.rotation.y = u.yaw; u.speed = 0;
    if (s.t <= 0) { s.t = 0.22; const k = this.tr.find((t) => !t.visible); if (k) { const from = _c.set(u.pos.x, u.pos.y + 1.4, u.pos.z); k.visible = true; k.userData.t = 0.07; k.position.copy(from); k.lookAt(tg); k.scale.z = Math.min(40, from.distanceTo(tg)); } u.burst = 2; }
    u.burst = Math.max(0, u.burst - dt * 4); this._anim(u, dt, true);
  }
  _shoot(u, p, dist, ctx) {
    const k = this.tr.find((t) => !t.visible); const from = _c.set(u.pos.x + Math.sin(u.yaw) * 0.5, u.pos.y + 1.4, u.pos.z + Math.cos(u.yaw) * 0.5), to = _c2.set(p.x, p.y + 1.1, p.z);
    if (ctx.los && !ctx.los(from, to)) return;
    const hit = Math.random() < clamp(0.62 - dist * 0.014, 0.12, 0.6);
    if (k) { k.visible = true; k.userData.t = 0.07; k.position.copy(from); k.lookAt(hit ? to : to.add(_c3.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3))); k.scale.z = Math.min(40, from.distanceTo(to)); }
    this.audio && this.audio.beep && this.audio.beep(u.type === 'army' ? 190 : 260, 0.05, 'square', 0.04);
    if (hit) ctx.hurt && ctx.hurt((u.type === 'army' ? 6 : 8) + Math.random() * 4, u);
  }
  _anim(u, dt, shooting) {
    u.phase = pose(u.rig, u, dt, 0);
    if (shooting || u.type) aimPose(u.rig, shooting ? 1 : 0.6, shooting ? Math.max(0, u.burst) * 0.4 : 0);
    if (u.hurt > 0 && u.rig.bones.Spine) u.rig.bones.Spine.rotation.x -= u.hurt * 0.25;
    u.root.rotation.x = 0;
  }
  _lie(u, dt) { u.fall = clamp((u.fall || 0) + dt * 2.2, 0, 1); u.root.rotation.x = -Math.PI / 2 * u.fall; u.root.position.y = u.pos.y + 0.1 * u.fall; u.root.visible = true; }
  rayHit(o, d, maxT) {
    let best = null;
    for (const z of this.us) {
      if (z.state === 'dead') continue;
      const h = _c.set(z.pos.x, z.pos.y + 1.62, z.pos.z), b = _c2.set(z.pos.x, z.pos.y + 1.0, z.pos.z), l = _c3.set(z.pos.x, z.pos.y + 0.45, z.pos.z);
      const th = raySphere(o, d, h, 0.2); if (th !== null && th < maxT && (!best || th < best.t)) best = { t: th, z, head: true };
      const tb = raySphere(o, d, b, 0.42); if (tb !== null && tb < maxT && (!best || tb < best.t)) best = { t: tb, z, head: false };
      const tl = raySphere(o, d, l, 0.32); if (tl !== null && tl < maxT && (!best || tl < best.t)) best = { t: tl, z, head: false };
    }
    return best;
  }
  damage(z, dmg) { z.hp -= dmg; z.hurt = 1; if (z.hp <= 0 && z.state !== 'dead') { z.state = 'dead'; z.lie = 8; z.fall = 0; return true; } return false; }
  runOver(z) { if (z.state !== 'dead') { z.hp = 0; z.state = 'dead'; z.lie = 6; z.fall = 0; return true; } return false; }
}
