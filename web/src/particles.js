// Instanced billboard particles (clouds, smoke, fire, flares) with log-depth support and haze.
import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aOffset;
attribute float aSize;
attribute vec4 aColor;
attribute float aRot;
varying vec2 vUv;
varying vec4 vColor;
varying float vDist;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  vDist = -mv.z;
  float c = cos(aRot), s = sin(aRot);
  vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += p * aSize;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uFog;
uniform float uFogDensity;
uniform float uFogMix;
uniform float uNearFade;
uniform float uFarStart;
uniform float uFarEnd;
varying vec2 vUv;
varying vec4 vColor;
varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  a *= smoothstep(uNearFade * 0.25, uNearFade, vDist);
  a *= 1.0 - smoothstep(uFarStart, uFarEnd, vDist);
  if (a < 0.003) discard;
  float f = 1.0 - exp(-pow(vDist * uFogDensity, 2.0));
  vec3 col = mix(vColor.rgb * t.rgb, uFog, f * uFogMix);
  gl_FragColor = vec4(col, a);
}`;

export function makePuffTexture(kind = 'soft', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  if (kind === 'cloud') {
    // lumpy cloud puff: several overlapping soft blobs
    const rnd = mulberry(7);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * h * 0.38;
      const x = h + Math.cos(a) * r, y = h + Math.sin(a) * r * 0.8;
      const rad = h * (0.38 + rnd() * 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.28)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
    }
  } else if (kind === 'flare') {
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,240,200,0.9)');
    gr.addColorStop(0.4, 'rgba(255,170,70,0.35)');
    gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  } else {
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low level instanced billboard set. Fill `offset/size/color/rot` arrays and call commit(count). */
export class Billboards {
  constructor(max, { texture, additive = false, fogMix = 1, nearFade = 40, farStart = 1e9, farEnd = 2e9 } = {}) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.offset = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.color = new Float32Array(max * 4);
    this.rot = new Float32Array(max);
    this.aOffset = new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOffset', this.aOffset);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aRot', this.aRot);
    geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uMap: { value: texture },
        uFog: { value: new THREE.Color(0xcad9e8) },
        uFogDensity: { value: 1e-5 },
        uFogMix: { value: fogMix },
        uNearFade: { value: nearFade },
        uFarStart: { value: farStart },
        uFarEnd: { value: farEnd },
      },
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.geo = geo;
  }
  commit(count) {
    this.geo.instanceCount = count;
    this.aOffset.needsUpdate = this.aSize.needsUpdate = this.aColor.needsUpdate = this.aRot.needsUpdate = true;
  }
  setFog(color, density) { this.material.uniforms.uFog.value.copy(color); this.material.uniforms.uFogDensity.value = density; }
}

/** CPU-simulated particles: smoke trails, explosions, sparks, flares. */
export class ParticleSystem {
  constructor(max, opts) {
    this.max = max;
    this.bb = new Billboards(max, opts);
    this.p = [];            // active particles
    this.pool = [];
    this.mesh = this.bb.mesh;
  }
  spawn(x, y, z, vx, vy, vz, s0, s1, life, r, g, b, a0, drag = 0, rotSpeed = 0, grow = 1) {
    if (this.p.length >= this.max) return;
    const q = this.pool.pop() || {};
    q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz;
    q.s0 = s0; q.s1 = s1; q.life = life; q.age = 0; q.r = r; q.g = g; q.b = b; q.a0 = a0;
    q.drag = drag; q.rot = Math.random() * 6.28; q.rs = rotSpeed; q.grow = grow;
    this.p.push(q);
  }
  update(dt) {
    const bb = this.bb, P = this.p;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) { this.pool.push(q); continue; }
      P[n++] = q;
    }
    P.length = n;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy *= k; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.rs * dt;
      const t = q.age / q.life;
      bb.offset[i * 3] = q.x; bb.offset[i * 3 + 1] = q.y; bb.offset[i * 3 + 2] = q.z;
      bb.size[i] = q.s0 + (q.s1 - q.s0) * Math.pow(t, q.grow < 1 ? q.grow : 1);
      bb.color[i * 4] = q.r; bb.color[i * 4 + 1] = q.g; bb.color[i * 4 + 2] = q.b;
      bb.color[i * 4 + 3] = q.a0 * (1 - t) * Math.min(1, t * 12);
      bb.rot[i] = q.rot;
    }
    bb.commit(n);
  }
  setFog(c, d) { this.bb.setFog(c, d); }
}

/** Procedural cloud field on a toroidal grid around the player. */
export class CloudField {
  constructor() {
    this.cell = 3200;
    this.half = 7;                 // (2*half+1)^2 cells
    this.coverage = 0.4;
    this.minY = 1300; this.maxY = 3200;
    this.maxPuffs = 6000;
    this.tex = makePuffTexture('cloud', 128);
    this.bb = new Billboards(this.maxPuffs, { texture: this.tex, fogMix: 0.55, nearFade: 380, farStart: this.cell * this.half * 0.8, farEnd: this.cell * this.half * 1.02 });
    this.mesh = this.bb.mesh;
    this.mesh.renderOrder = 5;
    this.cx = NaN; this.cz = NaN;
    this.sun = new THREE.Vector3(0.3, 0.9, 0.1);
    this.puffs = [];               // cached for in-cloud check
    this.seed = 1337;
    this.tint = new THREE.Color(1, 1, 1);
  }
  setCoverage(c) { this.coverage = c; this.cx = NaN; }
  setSun(dir, color) { this.sun.copy(dir); if (color) this.tint.copy(color); this.cx = NaN; }
  _hash(i, j, k = 0) {
    let h = Math.imul(i * 73856093 ^ j * 19349663 ^ (k + this.seed) * 83492791, 0x2545f491);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  rebuild(px, pz) {
    const ci = Math.floor(px / this.cell), cj = Math.floor(pz / this.cell);
    this.cx = ci; this.cz = cj;
    const bb = this.bb; let n = 0; this.puffs.length = 0;
    const sun = this.sun;
    for (let di = -this.half; di <= this.half; di++) {
      for (let dj = -this.half; dj <= this.half; dj++) {
        const i = ci + di, j = cj + dj;
        if (this._hash(i, j, 1) > this.coverage) continue;
        const cxw = (i + 0.15 + 0.7 * this._hash(i, j, 2)) * this.cell;
        const czw = (j + 0.15 + 0.7 * this._hash(i, j, 3)) * this.cell;
        const cyw = this.minY + (this.maxY - this.minY) * this._hash(i, j, 4);
        const R = 350 + 650 * this._hash(i, j, 5);
        const count = 10 + Math.floor(this._hash(i, j, 6) * 16);
        for (let k = 0; k < count && n < this.maxPuffs; k++) {
          const a = this._hash(i, j, 10 + k) * Math.PI * 2;
          const rr = Math.sqrt(this._hash(i, j, 40 + k)) * R;
          const ox = Math.cos(a) * rr * 1.5, oz = Math.sin(a) * rr * 1.5;
          const oy = (this._hash(i, j, 70 + k) - 0.35) * R * 0.75 * (1 - 0.6 * rr / R);
          const size = R * (0.55 + 0.7 * this._hash(i, j, 100 + k));
          const x = cxw + ox, y = cyw + oy, z = czw + oz;
          // fake lighting: top faces sun
          const shade = THREE.MathUtils.clamp(0.72 + 0.45 * (oy / R) + 0.2 * (ox * sun.x + oz * sun.z) / (R * 1.5), 0.55, 1.12);
          bb.offset[n * 3] = x; bb.offset[n * 3 + 1] = y; bb.offset[n * 3 + 2] = z;
          bb.size[n] = size * 2;
          bb.color[n * 4] = Math.min(1, shade * this.tint.r);
          bb.color[n * 4 + 1] = Math.min(1, shade * this.tint.g);
          bb.color[n * 4 + 2] = Math.min(1, (shade + 0.03) * this.tint.b);
          bb.color[n * 4 + 3] = 0.78;
          bb.rot[n] = this._hash(i, j, 130 + k) * 6.28;
          this.puffs.push(x, y, z, size);
          n++;
        }
      }
    }
    bb.commit(n);
  }
  /** returns 0..1 how deep inside cloud the point is */
  densityAt(p) {
    let d = 0; const a = this.puffs;
    for (let i = 0; i < a.length; i += 4) {
      const dx = p.x - a[i], dy = p.y - a[i + 1], dz = p.z - a[i + 2];
      const r = a[i + 3] * 0.75;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd < r * r) d += 1 - Math.sqrt(dd) / r;
    }
    return Math.min(1, d * 0.5);
  }
  update(playerPos) {
    const ci = Math.floor(playerPos.x / this.cell), cj = Math.floor(playerPos.z / this.cell);
    if (ci !== this.cx || cj !== this.cz) this.rebuild(playerPos.x, playerPos.z);
  }
  setFog(c, d) { this.bb.setFog(c, d); }
}
