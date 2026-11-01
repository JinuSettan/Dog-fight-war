// Pedestrians: a crowd of low-poly rigged people wandering around the player while he is on foot.
// Positions are plain maths (random waypoints inside a ring around the player), no assets besides the *_lod.glb characters.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF, makeRig, pose } from './walker.js';
import { raySphere } from './weapons.js';
import { personFor } from './talk.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const MEM_KEY = 'dogfight-war.npcmem.v1';
let NPC_MEM = {}; try { NPC_MEM = JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); } catch (e) { NPC_MEM = {}; }
let _memT = 0;
/** people remember what the player did to them (saved on the phone) */
export function saveMem() { clearTimeout(_memT); _memT = setTimeout(() => { try { localStorage.setItem(MEM_KEY, JSON.stringify(NPC_MEM)); } catch (e) { /* no storage */ } }, 800); }

export class Crowd {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.npcs = []; this.models = []; this.rand = rng(12345); this.count = 0; this.frame = 0;
    this.R_MIN = 10; this.R_MAX = 70; this.R_RESPAWN = 95; this.people = []; this.genders = [];
  }

  /** @param urls list of *_lod.glb urls (one per character) */
  async load(urls) {
    this.models = [];
    for (const u of urls) { try { this.models.push((await loadGLTF(u)).scene); } catch (e) { console.warn('crowd model failed', u, e); } }
    this.rebuild();
  }

  setCount(n) { this.count = n; this.rebuild(); }

  rebuild() {
    for (const n of this.npcs) this.group.remove(n.root);
    this.npcs = [];
    if (!this.models.length) return;
    for (let i = 0; i < this.count; i++) {
      const src = this.models[i % this.models.length];
      const scene = cloneSkinned(src);
      const root = new THREE.Group(); root.add(scene);
      const k = 0.94 + this.rand() * 0.12; root.scale.setScalar(k);
      const rig = makeRig(scene);
      this.group.add(root);
      const mi = i % this.models.length, who = personFor(i, this.genders[mi] === 'f'), mem = (NPC_MEM[i] = NPC_MEM[i] || { h: 0, c: 0, log: [] });
      this.npcs.push({ who, mem, slot: i, extra: '', root, rig, talkT: 0, pos: new THREE.Vector3(1e5, 0, 0), yaw: this.rand() * 6.28, speed: 0, phase: this.rand() * 6.28, seed: this.rand() * 10, grounded: true,
        want: 1.0 + this.rand() * 0.9, tx: 0, tz: 0, wait: 0, check: this.rand() * 0.3, placed: false });
    }
  }

  _spawn(n, around, ctx) {
    const a = this.rand() * Math.PI * 2, r = this.R_MIN + Math.sqrt(this.rand()) * (this.R_MAX - this.R_MIN);
    n.pos.set(around.x + Math.sin(a) * r, around.y, around.z + Math.cos(a) * r);
    n.pos.y = ctx.ground(n.pos.x, n.pos.z, around.y);
    n.placed = true; this._pick(n, around);
  }

  _pick(n, around) {
    const a = this.rand() * Math.PI * 2, d = 8 + this.rand() * 40;
    n.tx = n.pos.x + Math.sin(a) * d; n.tz = n.pos.z + Math.cos(a) * d;
    // drift slightly toward the player's area so the crowd does not wander off
    n.tx += (around.x - n.pos.x) * 0.15; n.tz += (around.z - n.pos.z) * 0.15;
    n.wait = this.rand() < 0.25 ? 1 + this.rand() * 4 : 0;
  }

  /** closest standing pedestrian within maxD metres */
  nearest(pos, maxD = 5.5) {
    let best = null, bd = maxD;
    for (const n of this.npcs) { if (!n.placed || n.down > 0) continue; const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  /** pedestrian is hit (car / bullet): falls down for a few seconds */
  knock(n, dead = false) { if (n.down > 0) return false; n.mem.h = 1; saveMem(); n.down = dead ? 7 : 4.5; n.fall = 0; n.speed = 0; n.dead = dead; return true; }

  /** put an NPC (the ejected driver) next to (x,z) and make it run away from `from` */
  eject(x, y, z, from) {
    let best = null, bd = 1e9;
    for (const n of this.npcs) { if (n.down > 0) continue; const d = Math.hypot(n.pos.x - x, n.pos.z - z); if (d < bd) { bd = d; best = n; } }
    if (!best) return false;
    best.mem.c = 1; saveMem(); best.pos.set(x, y, z); best.placed = true; best.flee = 9; best.wait = 0; best.root.visible = true;
    best.yaw = Math.atan2(x - from.x, z - from.z); best.tx = x + Math.sin(best.yaw) * 60; best.tz = z + Math.cos(best.yaw) * 60;
    return true;
  }

  rayHit(o, d, maxT) {
    let best = null;
    for (const n of this.npcs) {
      if (n.down > 0 || !n.placed) continue;
      const h = _hc.set(n.pos.x, n.pos.y + 1.6, n.pos.z), b = _hc2.set(n.pos.x, n.pos.y + 1.0, n.pos.z);
      const th = raySphere(o, d, h, 0.2); if (th !== null && th < maxT && (!best || th < best.t)) best = { t: th, n, head: true };
      const tb = raySphere(o, d, b, 0.42); if (tb !== null && tb < maxT && (!best || tb < best.t)) best = { t: tb, n, head: false };
    }
    return best;
  }

  /**
   * @param ctx {ground(x,z,y), blocked(from,dx,dz,dist), aircraft, L, bodyR}
   * @param player Vector3 (the walking player)
   */
  update(dt, player, ctx, active) {
    this.group.visible = active && this.npcs.length > 0;
    if (!active) return;
    this.frame++;
    this.people.length = 0;
    for (const n of this.npcs) {
      if (n.down > 0) {                       // knocked down / shot: lie on the ground, then respawn somewhere else
        n.down -= dt; n.fall = Math.min(1, (n.fall || 0) + dt * 2.5);
        n.root.rotation.x = -Math.PI / 2 * n.fall; n.root.position.set(n.pos.x, n.pos.y + 0.12 * n.fall, n.pos.z);
        if (n.down <= 0) { n.placed = false; n.fall = 0; n.root.rotation.x = 0; n.dead = false; }
        continue;
      }
      if (n.talkT > 0) {                      // chatting with the player: stop, face him, keep breathing
        n.talkT -= dt; n.speed = 0;
        n.yaw += angDiff(n.yaw, Math.atan2(player.x - n.pos.x, player.z - n.pos.z)) * (1 - Math.exp(-dt * 6));
        n.root.rotation.y = n.yaw; n.phase = pose(n.rig, n, dt, 0); this.people.push({ x: n.pos.x, z: n.pos.z, n });
        continue;
      }
      if (!n.placed || n.pos.distanceTo(player) > this.R_RESPAWN) this._spawn(n, player, ctx);
      // steer
      const dx = n.tx - n.pos.x, dz = n.tz - n.pos.z, dist = Math.hypot(dx, dz);
      let want = 0;
      if ((n.mem.h || n.mem.c) && n.flee <= 0 && n.placed && Math.hypot(n.pos.x - player.x, n.pos.z - player.z) < 16) { n.flee = 6; n.wait = 0; n.tx = n.pos.x + (n.pos.x - player.x) * 6; n.tz = n.pos.z + (n.pos.z - player.z) * 6; }
      if (n.flee > 0) { n.flee -= dt; n.want = 5.6; if (n.flee <= 0) n.want = 1.0 + this.rand() * 0.9; }
      if (n.wait > 0) { n.wait -= dt; }
      else if (dist < 1.2) this._pick(n, player);
      else {
        want = n.want;
        n.yaw += angDiff(n.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 5));
      }
      n.speed += (want - n.speed) * (1 - Math.exp(-dt * 6));
      const sx = Math.sin(n.yaw), sz = Math.cos(n.yaw), step = n.speed * dt;
      if (step > 1e-4) {
        // wall test a few times per second only
        n.check -= dt;
        if (n.check <= 0) { n.check = 0.25; n.blocked = ctx.blocked ? ctx.blocked(n.pos, sx, sz, 1.2) : false; }
        if (n.blocked) { n.yaw += 1.2 + this.rand() * 1.6; n.speed = 0; this._pick(n, player); n.blocked = false; }
        else { n.pos.x += sx * step; n.pos.z += sz * step; }
      }
      // keep out of the aircraft and away from the player
      if (ctx.aircraft && ctx.aircraft.visible) {
        const q = ctx.aircraft.quaternion, p = ctx.aircraft.position;
        const f = _f.set(0, 0, -1).applyQuaternion(q);
        _a.copy(p).addScaledVector(f, ctx.L * 0.5); _b.copy(p).addScaledVector(f, -ctx.L * 0.5);
        _ab.copy(_b).sub(_a); const t = clamp(_p.copy(n.pos).sub(_a).dot(_ab) / _ab.lengthSq(), 0, 1);
        _c.copy(_a).addScaledVector(_ab, t);
        const ox = n.pos.x - _c.x, oz = n.pos.z - _c.z, od = Math.hypot(ox, oz), R = (ctx.bodyR || 2.6) + 0.3;
        if (od < R && od > 1e-3) { n.pos.x = _c.x + ox / od * R; n.pos.z = _c.z + oz / od * R; }
      }
      const px = n.pos.x - player.x, pz = n.pos.z - player.z, pd = Math.hypot(px, pz);
      if (pd < 0.7 && pd > 1e-3) { n.pos.x = player.x + px / pd * 0.7; n.pos.z = player.z + pz / pd * 0.7; }
      // ground
      const gy = ctx.ground(n.pos.x, n.pos.z, n.pos.y);
      n.pos.y += (gy - n.pos.y) * (1 - Math.exp(-dt * 20));
      n.root.position.copy(n.pos); n.root.rotation.y = n.yaw;
      // animate (far people at half rate)
      this.people.push({ x: n.pos.x, z: n.pos.z, n });
      const near = pd < 45;
      if (near || (this.frame + (n.seed | 0)) % 2 === 0) n.phase = pose(n.rig, n, near ? dt : dt * 2, 0);
    }
  }
}
const _f = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ab = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
const _hc = new THREE.Vector3(), _hc2 = new THREE.Vector3();
