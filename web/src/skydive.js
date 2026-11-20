// Bail-out: free fall, then a parachute (auto-opens low, or press Space). Procedural green canopy.
import * as THREE from 'three';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Skydive {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.8, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), mat); dome.scale.set(1, 0.62, 1); dome.position.y = 5.2;
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(3.42, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), new THREE.MeshStandardMaterial({ color: 0xd9d4b8, roughness: 0.8, side: THREE.DoubleSide, wireframe: false, transparent: true, opacity: 0.0 }));
    this.canopy = new THREE.Group(); this.canopy.add(dome);
    const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 3.3, 5.3 - 0.15, Math.sin(a) * 3.3), new THREE.Vector3(0, 1.45, 0)); }
    this.canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe8e8e0 })));
    this.group.add(this.canopy);
    this.active = false; this.open = 0; this.opening = false; this.hv = new THREE.Vector2(); this.t = 0;
  }
  start(W, pos, vel, yaw) {
    this.active = true; this.open = 0; this.opening = false; this.t = 0; this.hv.set(vel.x * 0.5, vel.z * 0.5);
    W.pos.copy(pos); W.vy = Math.min(0, vel.y * 0.4); W.grounded = false; W.yaw = yaw; W.speed = 0; W.root.visible = true;
    this.group.visible = false;
  }
  /** returns 'landed' once the feet touch down */
  update(dt, W, inp, ground, openReq) {
    if (!this.active) return null;
    this.t += dt;
    const gy = ground(W.pos.x, W.pos.z, W.pos.y), agl = W.pos.y - gy;
    if (!this.opening && (openReq || agl < 260) && this.t > 0.8) this.opening = true;
    if (this.opening) this.open = Math.min(1, this.open + dt / 1.3);
    const k = this.open;
    const tv = -52 * (1 - k) + -5.6 * k;
    W.vy += (tv - W.vy) * (1 - Math.exp(-dt * (k > 0 ? 1.6 : 0.8)));
    const sp = k > 0.5 ? 7 : 12;
    const a = W.camYaw, fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    const wx = (fx * inp.f + rx * inp.r) * sp, wz = (fz * inp.f + rz * inp.r) * sp;
    this.hv.x += (wx - this.hv.x) * (1 - Math.exp(-dt * 0.9)); this.hv.y += (wz - this.hv.y) * (1 - Math.exp(-dt * 0.9));
    W.pos.x += this.hv.x * dt; W.pos.z += this.hv.y * dt; W.pos.y += W.vy * dt;
    if (Math.hypot(this.hv.x, this.hv.y) > 1) W.yaw += (Math.atan2(this.hv.x, this.hv.y) - W.yaw) * (1 - Math.exp(-dt * 2));
    W.grounded = false; W.speed = 0;
    this.group.visible = k > 0.02; this.group.position.copy(W.pos); this.group.rotation.y = W.yaw;
    this.canopy.scale.set(0.2 + 0.8 * k, 0.15 + 0.85 * k, 0.2 + 0.8 * k);
    this.canopy.rotation.z = clamp(-inp.r * 0.12, -0.15, 0.15);
    W._apply(dt, 0);
    if (W.pos.y <= gy + 0.02) {
      W.pos.y = gy; W.vy = 0; W.grounded = true; this.active = false; this.group.visible = false;
      return k < 0.5 ? 'splat' : 'landed';
    }
    return null;
  }
  get fallSpeed() { return 0; }
}
