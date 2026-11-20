// Procedural Manhattan for the "Rise of the Underworld" start when no real 3D map is loaded (no Google / Cesium key).
// One InstancedMesh of boxes (one draw call) with a window shader; sidewalks; analytic wall collision for people; nuke collapse animation.
// With a real 3D map (tilesStatus 'ok') this group is hidden and the real New York shows instead.
import * as THREE from 'three';

const hash = (a, b, c = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };
const PALETTE = [0x8a8378, 0x9b9285, 0x6f6a64, 0xa59a8a, 0x7b6a5e, 0x8c5a48, 0x74808c, 0x606a75, 0x9aa3a8, 0x4d5560];

export class City {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.rects = []; this.byBlock = new Map(); this.mesh = null; this.walk = null; this.synth = null;
    this.lit = 0; this.collapsing = []; this.uLit = { value: 0 };
  }

  clear() {
    for (const m of [this.mesh, this.walk]) if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.mesh = this.walk = null; this.rects = []; this.byBlock.clear(); this.collapsing = []; this.synth = null;
  }

  /** @param s the roads' synthetic grid description {Sx,Sz,X0,NX,Z0,NZ}, @param roadW road width */
  build(s, roadW = 12) {
    this.clear(); this.synth = s;
    const pad = roadW / 2 + 5;                                  // road half width + sidewalk
    const lots = [];
    for (let i = 0; i < s.NX - 1; i++) for (let j = 0; j < s.NZ - 1; j++) {
      const xa = s.X0 - s.Sx * (i + 1) + pad, xb = s.X0 - s.Sx * i - pad;
      const za = s.Z0 + s.Sz * j + pad, zb = s.Z0 + s.Sz * (j + 1) - pad;
      const cz = (za + zb) / 2, mid = 1 - Math.min(1, Math.abs(cz) / 2300);                 // taller towards the middle of the grid
      const n = 2 + Math.floor(hash(i, j, 1) * 2.99);
      const open = hash(i, j, 2) < 0.06;                                                       // a plaza / small park every now and then
      let x = xa; const wTot = xb - xa;
      for (let k = 0; k < n; k++) {
        const w = wTot / n, gap = k < n - 1 ? 1.5 : 0, bx0 = x, bx1 = x + w - gap;
        x += w;
        const r = hash(i * 7 + k, j, 3);
        const h = open ? 3 + r * 5 : 16 + Math.pow(hash(i * 3 + k, j * 5, 4), 2.1) * (60 + 190 * mid) + (hash(j, k, 5) < 0.12 ? 40 : 0);
        const color = new THREE.Color(PALETTE[Math.floor(hash(i + k, j, 6) * PALETTE.length)]);
        const rect = { x0: bx0, x1: bx1, z0: za, z1: zb, h, alive: true, i: lots.length, color };
        lots.push(rect); this.rects.push(rect);
        const key = i * 1000 + j; if (!this.byBlock.has(key)) this.byBlock.set(key, []); this.byBlock.get(key).push(rect);
      }
    }
    // buildings
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
    const uLit = this.uLit;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLit = uLit;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vFN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vFN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vFN; uniform float uLit;\nfloat hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float tsWin = 0.0; float tsLit = 0.0;
          { float side = 1.0 - step(0.5, abs(vFN.y));
            float u = abs(vFN.x) > 0.5 ? vWP.z : vWP.x;
            float cu = floor(u / 3.4), cv = floor(vWP.y / 3.7);
            float inU = step(0.28, fract(u / 3.4)) * step(fract(u / 3.4), 0.86), inV = step(0.3, fract(vWP.y / 3.7)) * step(fract(vWP.y / 3.7), 0.8);
            tsWin = side * inU * inV * step(3.0, vWP.y);
            tsLit = step(0.62, hsh(vec2(cu, cv) + floor(vWP.x * 0.01 + vWP.z * 0.013)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.15, 0.22) * (0.8 + 0.5 * hsh(vec2(cu, cv))), tsWin * 0.88); }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * tsWin * tsLit * uLit * 1.5;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, lots.length); this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lots.length * 3), 3);
    lots.forEach((r) => { this._set(r); this.mesh.setColorAt(r.i, r.color); });
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    this.group.add(this.mesh);
    // sidewalks: one flat slab per block (just above the asphalt ribbons at y = 0.06)
    const blocks = [];
    for (let i = 0; i < s.NX - 1; i++) for (let j = 0; j < s.NZ - 1; j++) blocks.push([s.X0 - s.Sx * (i + 1) + pad - 5, s.X0 - s.Sx * i - pad + 5, s.Z0 + s.Sz * j + pad - 5, s.Z0 + s.Sz * (j + 1) - pad + 5]);
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.walk = new THREE.InstancedMesh(sg, sm, blocks.length); this.walk.frustumCulled = false;
    const m = new THREE.Matrix4();
    blocks.forEach((b, k) => { m.compose(new THREE.Vector3((b[0] + b[1]) / 2, 0.075, (b[2] + b[3]) / 2), new THREE.Quaternion(), new THREE.Vector3(b[1] - b[0], 1, b[3] - b[2])); this.walk.setMatrixAt(k, m); });
    this.walk.renderOrder = 2; this.group.add(this.walk);
    this.group.visible = true;
  }

  _set(r, k = 1) {
    const m = new THREE.Matrix4(), h = Math.max(0.6, r.h * k);
    m.compose(new THREE.Vector3((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(r.x1 - r.x0, h, r.z1 - r.z0));
    this.mesh.setMatrixAt(r.i, m);
  }

  _near(x, z) {
    const s = this.synth; if (!s) return [];
    const i = Math.floor((s.X0 - x) / s.Sx), j = Math.floor((z - s.Z0) / s.Sz);
    return this.byBlock.get(i * 1000 + j) || [];
  }

  /** is the circle (x, z, r) inside a standing building? */
  blocked(x, z, r = 0.3) {
    for (const b of this._near(x, z)) if (b.alive && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }

  /** distance along a ray to the first building box, or null */
  rayDist(o, d, far = 200) {
    if (!this.synth) return null;
    let best = null; const seen = new Set();
    for (let t = 0; t <= far + 30; t += 28) {
      const x = o.x + d.x * Math.min(t, far), z = o.z + d.z * Math.min(t, far);
      const s = this.synth, key = Math.floor((s.X0 - x) / s.Sx) * 1000 + Math.floor((z - s.Z0) / s.Sz);
      if (seen.has(key)) continue; seen.add(key);
      for (const b of this.byBlock.get(key) || []) {
        if (!b.alive) continue;
        let t0 = 0, t1 = far;
        const ax = [[o.x, d.x, b.x0, b.x1], [o.y, d.y, 0, b.h], [o.z, d.z, b.z0, b.z1]];
        let hit = true;
        for (const [p, v, lo, hi] of ax) {
          if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
          let a = (lo - p) / v, c = (hi - p) / v; if (a > c) { const q = a; a = c; c = q; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { hit = false; break; }
        }
        if (hit && (best === null || t0 < best)) best = t0;
      }
    }
    return best;
  }

  /** nuclear (or any) blast: buildings inside the radius collapse once the shock wave reaches them */
  blast(x, z, R, speed = 700) {
    for (const b of this.rects) {
      const d = Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z);
      if (d < R && b.alive) { b.dying = { delay: d / speed, t: 0, scale: 1 - d / R * 0.6 }; this.collapsing.push(b); }
    }
  }

  setLit(v) { this.uLit.value = v; }

  update(dt) {
    if (!this.mesh || !this.collapsing.length) return;
    let dirty = false;
    for (let n = this.collapsing.length - 1; n >= 0; n--) {
      const b = this.collapsing[n], d = b.dying;
      d.delay -= dt; if (d.delay > 0) continue;
      d.t += dt; const k = Math.min(1, d.t / 2.2);
      b.alive = b.alive && k < 0.3;
      this._set(b, Math.max(0.04, 1 - k * 0.97)); b.color.multiplyScalar(0.985); this.mesh.setColorAt(b.i, b.color);
      dirty = true;
      if (k >= 1) { b.h = Math.max(1.2, b.h * 0.04); this._set(b, 1); this.collapsing.splice(n, 1); }
    }
    if (dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}
