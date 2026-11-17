// On-foot mode: the player steps out of the aircraft and walks around the airport / city.
// The man.glb scan is auto-rigged (see tools/make_man.py); animation is procedural (walk / run / idle / jump).
// Scene frame: runway along Z, y up. The character model faces +Z in its own space.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyGrip, relaxHands } from './grip.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

const gltfLoader = new GLTFLoader();
const gltfCache = new Map();
/** cached GLTF load (the scene graph is shared; use cloneRig for extra copies) */
export function loadGLTF(url) {
  if (!gltfCache.has(url)) gltfCache.set(url, gltfLoader.loadAsync(url));
  return gltfCache.get(url);
}

/** bones by name + rest rotations of a rigged character scene */
export function makeRig(scene) {
  const bones = {}; let armDown = 0.5;
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { o.frustumCulled = false; }
    if (o.userData && o.userData.rig && o.userData.rig.armDown != null) armDown = o.userData.rig.armDown;
  });
  const rest = {}; for (const [k, b] of Object.entries(bones)) rest[k] = b.rotation.clone();
  return { bones, rest, hipY: bones.Hips ? bones.Hips.position.y : 0.95, armDown };
}

/**
 * Procedural pose: legs / arms / torso from speed (m/s) and phase. st = {speed, phase, grounded}. returns the new phase.
 * Pure maths, shared by the player and the crowd.
 */
export function pose(rig, st, dt, running = 0) {
  const B = rig.bones, R = rig.rest;
  const sp = st.speed;
  const phase = st.phase + dt * (sp * 2.1 + 0.001);
  const s = Math.sin(phase), c = Math.cos(phase);
  const amp = clamp(sp / 3.2, 0, 1) * (0.42 + 0.30 * clamp((sp - 3.2) / 4.3, 0, 1));
  const br = Math.sin(performance.now() / 1000 * 1.7 + (st.seed || 0)) * 0.012;
  const set = (n, x = 0, y = 0, z = 0) => { const b = B[n]; if (!b) return; b.rotation.set(R[n].x + x, R[n].y + y, R[n].z + z); };
  const air = st.grounded === false;
  const kneeL = Math.max(0, -c) * 1.5 * amp, kneeR = Math.max(0, c) * 1.5 * amp;
  set('ThighL', air ? -0.5 : -s * amp); set('ThighR', air ? 0.3 : s * amp);
  set('ShinL', air ? 0.9 : kneeL); set('ShinR', air ? 0.5 : kneeR);
  set('FootL', air ? 0.2 : -kneeL * 0.25); set('FootR', air ? 0 : -kneeR * 0.25);
  const ad = rig.armDown, sw = amp * 0.85;
  set('UpperArmL', air ? -0.9 : s * sw, 0, -ad); set('UpperArmR', air ? -0.9 : -s * sw, 0, ad);
  const elbow = 0.18 + amp * (running ? 1.0 : 0.35);
  set('ForeArmL', -elbow - Math.max(0, s) * amp * 0.5); set('ForeArmR', -elbow - Math.max(0, -s) * amp * 0.5);
  const lean = clamp(sp / 7.5, 0, 1) * 0.28 + (air ? 0.1 : 0);
  set('Spine', lean * 0.5 + br, s * amp * 0.12); set('Chest', lean * 0.5 + br, -s * amp * 0.16);
  set('Neck', -lean * 0.5); set('Head', -lean * 0.2);
  const hips = B.Hips;
  if (hips) { hips.position.y = rig.hipY + (air ? 0 : -Math.abs(Math.cos(phase)) * 0.045 * amp * 2.4 + 0.012 * amp); hips.rotation.set(R.Hips.x, R.Hips.y + s * amp * 0.1, R.Hips.z); }
  return phase;
}

/**
 * Arm overlays. Bones have identity orientation and the arms hang in an A-pose, so raising an arm forward is a pitch (x) rotation;
 * z (applied first) sets how far the arm is tilted in / out. L arm tilts inward with negative z, R arm with positive z.
 */
export function armsForward(rig, k, o) {
  if (k <= 0.001) return;
  const B = rig.bones, R = rig.rest, ad = rig.armDown;
  const mix = (n, x, y, z) => { const b = B[n]; if (!b) return; b.rotation.set(lerp(b.rotation.x, R[n].x + x, k), lerp(b.rotation.y, R[n].y + y, k), lerp(b.rotation.z, R[n].z + z, k)); };
  mix('UpperArmL', -(o.l ?? 1.35), 0, -(ad + (o.li ?? 0.1))); mix('ForeArmL', -(o.lf ?? 0.4), 0, 0);
  mix('UpperArmR', -(o.r ?? 1.35), 0, ad + (o.ri ?? 0.1)); mix('ForeArmR', -(o.rf ?? 0.6), 0, 0);
}

/** arms raised forward holding a gun (k = blend 0..1); applied on top of pose() */
export function aimPose(rig, k, kick = 0) {
  armsForward(rig, k, { l: 1.3, li: 0.12, lf: 0.35, r: 1.28 + kick * 0.06, ri: 0.3, rf: 0.7 });
  const c = rig.bones.Chest; if (c && k > 0.001) c.rotation.x = lerp(c.rotation.x, rig.rest.Chest.x - 0.05, k);
}

export class Walker {
  constructor() {
    this.root = new THREE.Group(); this.root.visible = false;
    this.pos = new THREE.Vector3(); this.vy = 0; this.grounded = true;
    this.yaw = 0; this.camYaw = 0; this.speed = 0; this.phase = 0; this.jumpT = 0;
    this.active = false; this.loaded = false; this.aim = 0; this.aimTarget = 0; this.face = false;
    this._ray = new THREE.Raycaster(); this._o = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  /** (re)load the playable character model */
  async load(url = 'models/man.glb') {
    if (this.url === url && this.loaded) return;
    const g = await loadGLTF(url);
    if (this.model) this.root.remove(this.model);
    this.model = g.scene; this.root.add(g.scene);
    this.rig = makeRig(g.scene);
    this.url = url; this.loaded = true;
    this._apply(0, 0);
  }

  /** put the man next to the aircraft (left door) and start walking */
  enter(aircraft, ground) {
    const q = aircraft.quaternion, p = aircraft.position;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q); right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
    this.pos.copy(p).addScaledVector(right, -4.2).addScaledVector(fwd, 4);
    this.pos.y = ground(this.pos.x, this.pos.z, p.y);
    this.yaw = Math.atan2(-right.x, -right.z);          // face away from the aircraft
    this.camYaw = this.yaw; this.speed = 0; this.vy = 0; this.grounded = true; this.phase = 0;
    this.active = true; this.root.visible = true;
    this._apply(0, 0);
  }
  leave() { this.active = false; this.root.visible = false; }

  /** distance (m) from the man to the aircraft fuselage axis, plus the closest axis point */
  distToAircraft(ac, L) {
    const q = ac.quaternion, p = ac.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const a = p.clone().addScaledVector(f, L * 0.5), b = p.clone().addScaledVector(f, -L * 0.5);
    const ab = b.clone().sub(a), t = clamp(this.pos.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    const c = a.clone().addScaledVector(ab, t);
    const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
    return { dist: Math.hypot(dx, dz), c, dx, dz };
  }

  /**
   * @param dt seconds
   * @param inp {f, r, run, jump} movement intent (f forward, r right, camera relative)
   * @param ctx {ground(x,z,prevY), blocked(from,to)->bool, aircraft, L}
   */
  update(dt, inp, ctx) {
    const mag = clamp(Math.hypot(inp.f, inp.r), 0, 1);
    const maxSp = inp.run ? 7.5 : 3.2;
    const target = mag * maxSp;
    this.speed = lerp(this.speed, target, 1 - Math.exp(-dt * 9));
    this.aim = lerp(this.aim, this.aimTarget, 1 - Math.exp(-dt * 10));
    if (mag > 0.05) {
      const a = this.camYaw;
      const fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
      let dx = fx * inp.f + rx * inp.r, dz = fz * inp.f + rz * inp.r;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const want = Math.atan2(dx, dz);
      this.yaw += angDiff(this.yaw, this.face ? this.camYaw : want) * (1 - Math.exp(-dt * 12));
      const nx = this.pos.x + dx * this.speed * dt, nz = this.pos.z + dz * this.speed * dt;
      if (!ctx.blocked || !ctx.blocked(this.pos, nx, nz, dx, dz, this.speed * dt)) { this.pos.x = nx; this.pos.z = nz; }
    }
    if (mag <= 0.05 && this.face) this.yaw += angDiff(this.yaw, this.camYaw) * (1 - Math.exp(-dt * 12));
    // keep out of the fuselage
    if (ctx.aircraft && ctx.aircraft.visible) {
      const d = this.distToAircraft(ctx.aircraft, ctx.L);
      const R = ctx.bodyR || 2.6;
      if (d.dist < R && d.dist > 1e-3) { this.pos.x = d.c.x + (d.dx / d.dist) * R; this.pos.z = d.c.z + (d.dz / d.dist) * R; }
    }
    // vertical: follow the ground, jump + gravity
    const gy = ctx.ground(this.pos.x, this.pos.z, this.pos.y);
    if (inp.jump && this.grounded) { this.vy = 5.2; this.grounded = false; }
    if (!this.grounded) {
      this.vy -= 18 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= gy && this.vy <= 0) { this.pos.y = gy; this.vy = 0; this.grounded = true; }
    } else {
      // smooth steps on slopes, drop off edges with gravity
      if (gy < this.pos.y - 0.45) { this.grounded = false; this.vy = 0; } else this.pos.y = lerp(this.pos.y, gy, 1 - Math.exp(-dt * 25));
    }
    this._apply(dt, inp.run ? 1 : 0);
  }

  _apply(dt, running = 0) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (!this.loaded) return;
    this.phase = pose(this.rig, this, dt, running);
    aimPose(this.rig, this.aim, this.kick || 0);
    relaxHands(this.rig);
    if (this.weapons) applyGrip(this);
  }

  /** third-person camera; writes position/lookAt */
  camera(orbit, ground, outPos, outLook) {
    const yawBase = this.camYaw;
    const el = clamp(0.28 + orbit.pitch * 0.8, -0.1, 1.25);
    const dist = 3.6 * orbit.dist;
    const ty = this.pos.y + 1.45;
    outLook.set(this.pos.x, ty, this.pos.z);
    outPos.set(this.pos.x - Math.sin(yawBase) * Math.cos(el) * dist, ty + Math.sin(el) * dist, this.pos.z - Math.cos(yawBase) * Math.cos(el) * dist);
    if (this.aim > 0.02) {                       // armed: over-the-shoulder camera, crosshair ray is almost horizontal at chest / head height
      const sy = Math.sin(yawBase), cy = Math.cos(yawBase), back = 2.6 * orbit.dist, a = Math.min(1, this.aim);
      const ax = this.pos.x - sy * back - cy * 0.55, az = this.pos.z - cy * back + sy * 0.55, ay = this.pos.y + 1.72;
      const lx = this.pos.x + sy * 24, lz = this.pos.z + cy * 24, ly = this.pos.y + clamp(1.4 - orbit.pitch * 16, -3, 12);
      outPos.x = lerp(outPos.x, ax, a); outPos.y = lerp(outPos.y, ay, a); outPos.z = lerp(outPos.z, az, a);
      outLook.x = lerp(outLook.x, lx, a); outLook.y = lerp(outLook.y, ly, a); outLook.z = lerp(outLook.z, lz, a);
    }
    const gy = ground(outPos.x, outPos.z, this.pos.y);
    if (outPos.y < gy + 0.4) outPos.y = gy + 0.4;
  }
}
