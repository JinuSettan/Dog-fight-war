// Minimal, dependency-free vector / quaternion math (used by physics so it can be unit-tested in plain Node).
export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapPi = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) {
    return new V3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
  }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}

export class Q4 {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Q4(this.x, this.y, this.z, this.w); }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this;
  }
  /** this = this * q */
  mul(q) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    this.x = aw * q.x + ax * q.w + ay * q.z - az * q.y;
    this.y = aw * q.y - ax * q.z + ay * q.w + az * q.x;
    this.z = aw * q.z + ax * q.y - ay * q.x + az * q.w;
    this.w = aw * q.w - ax * q.x - ay * q.y - az * q.z;
    return this;
  }
  setAxisAngle(ax, ay, az, angle) {
    const s = Math.sin(angle / 2);
    this.x = ax * s; this.y = ay * s; this.z = az * s; this.w = Math.cos(angle / 2);
    return this;
  }
  /** rotate vector v (returns new V3) */
  rotate(v, out = new V3()) {
    const { x: qx, y: qy, z: qz, w: qw } = this;
    const ix = qw * v.x + qy * v.z - qz * v.y;
    const iy = qw * v.y + qz * v.x - qx * v.z;
    const iz = qw * v.z + qx * v.y - qy * v.x;
    const iw = -qx * v.x - qy * v.y - qz * v.z;
    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
  }
  /** rotate by inverse (world -> body) */
  rotateInv(v, out = new V3()) {
    const c = new Q4(-this.x, -this.y, -this.z, this.w);
    return c.rotate(v, out);
  }
  /** integrate a body-frame angular velocity (rad/s) over dt */
  integrateBody(wx, wy, wz, dt) {
    const mag = Math.hypot(wx, wy, wz);
    if (mag < 1e-9) return this;
    const ang = mag * dt;
    const d = new Q4().setAxisAngle(wx / mag, wy / mag, wz / mag, ang);
    this.mul(d).normalize();
    return this;
  }
  /** build orientation looking along `fwd` (-Z body forward) with approximate `up` */
  static lookAlong(fwd, up = new V3(0, 1, 0)) {
    const f = fwd.clone().normalize();
    let r = f.cross(up);
    if (r.lengthSq() < 1e-8) r = f.cross(new V3(0, 0, 1));
    r.normalize();
    const u = r.cross(f).normalize();
    // columns: right, up, back(-f)
    const b = f.clone().scale(-1);
    const m00 = r.x, m01 = u.x, m02 = b.x;
    const m10 = r.y, m11 = u.y, m12 = b.y;
    const m20 = r.z, m21 = u.z, m22 = b.z;
    const tr = m00 + m11 + m22;
    const q = new Q4();
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q.w = 0.25 * s; q.x = (m21 - m12) / s; q.y = (m02 - m20) / s; q.z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q.w = (m21 - m12) / s; q.x = 0.25 * s; q.y = (m01 + m10) / s; q.z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q.w = (m02 - m20) / s; q.x = (m01 + m10) / s; q.y = 0.25 * s; q.z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q.w = (m10 - m01) / s; q.x = (m02 + m20) / s; q.y = (m12 + m21) / s; q.z = 0.25 * s;
    }
    return q.normalize();
  }
}
