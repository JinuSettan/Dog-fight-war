// Vegetation: real tree meshes (your tree_1..3.glb) + grass tufts (your grass.png), placed by maths around the player.
// Placement = hashed grid cells + low-frequency noise (forest patches); every cell is deterministic, so trees never "pop around".
// Ground heights come from world.treeGround (null = not allowed: water, runway/apron, rooftops ...) and are cached, with a per-frame ray budget.
import * as THREE from 'three';
import { loadGLTF } from './walker.js';

function h2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, 7), b = h2(xi + 1, yi, 7), c = h2(xi, yi + 1, 7), d = h2(xi + 1, yi + 1, 7);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** 0..1 "forest-ness": big patches of dense forest, open meadows between */
export function forestiness(x, z) { return Math.min(1, Math.max(0, (vn(x / 260, z / 260) * 0.65 + vn(x / 70, z / 70) * 0.35 - 0.38) * 3.2)); }

const CELL = 12, TREE_R = 0.45;
const LEVELS = { off: null, low: { treeR: 70, grassR: 22, trees: 0.55, grass: 900 }, med: { treeR: 110, grassR: 32, trees: 1, grass: 1800 }, high: { treeR: 160, grassR: 42, trees: 1.5, grass: 3000 } };

export class Vegetation {
  constructor(scene, world) {
    this.world = world; this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.types = []; this.cache = new Map(); this.level = 'med'; this.ready = false; this.active = false;
    this.cx = 1e9; this.cz = 1e9; this.pending = 0; this.mode = 'off';
    this.maxTrees = 700; this.trunks = [];
  }

  async load(base = 'models/props/') {
    const loader = new THREE.TextureLoader();
    for (let i = 1; i <= 3; i++) {
      let g; try { g = await loadGLTF(base + 'tree_' + i + '.glb'); } catch (e) { console.warn('tree load failed', i, e); continue; }
      const parts = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
        const mat = o.material; if (mat.alphaTest === 0 && mat.transparent) { mat.alphaTest = 0.4; mat.transparent = false; mat.depthWrite = true; }
        mat.side = THREE.DoubleSide;
        const im = new THREE.InstancedMesh(geo, mat, this.maxTrees); im.count = 0; im.frustumCulled = false; im.castShadow = false;
        this.group.add(im); parts.push(im);
      });
      this.types.push(parts);
    }
    // grass: three crossed cards, the supplied blade texture (RGBA)
    try {
      const tex = await loader.loadAsync(base + 'grass.png'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      // one tuft = 11 leaning blades (each a crossed pair of cards) scattered in a 0.6 m patch
      const cards = []; let sd = 7; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      for (let k = 0; k < 11; k++) {
        const hgt = 0.55 + rnd() * 0.5, w = hgt * 0.3, ang = rnd() * 3.14, lean = (rnd() - 0.5) * 0.5, ox = (rnd() - 0.5) * 0.6, oz = (rnd() - 0.5) * 0.6;
        for (let c = 0; c < 2; c++) {
          const pl = new THREE.PlaneGeometry(w, hgt); pl.translate(0, hgt / 2, 0); pl.rotateX(lean); pl.rotateY(ang + c * 1.2); pl.translate(ox, 0, oz); cards.push(pl);
        }
      }
      const merged = mergeGeos(cards);
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xcfe8b0 });
      this.grass = new THREE.InstancedMesh(merged, mat, 3000); this.grass.count = 0; this.grass.frustumCulled = false;
      this.group.add(this.grass);
    } catch (e) { console.warn('grass load failed', e); }
    this.ready = this.types.length > 0;
  }

  setLevel(l) { this.level = LEVELS[l] ? l : (l === 'off' ? 'off' : 'med'); this.cx = 1e9; if (this.level === 'off') this.group.visible = false; }

  _cell(ix, iz) {
    const k = ix * 73856093 ^ iz * 19349663; let c = this.cache.get(k);
    if (c) return c;
    const L = LEVELS[this.level]; if (!L) return null;
    const x0 = ix * CELL, z0 = iz * CELL;
    const f = forestiness(x0 + CELL / 2, z0 + CELL / 2);
    const real = this.world.tilesStatus === 'ok' && !this.world.cruise;
    // real map already has photogrammetric trees: only add a few in open lawns, so it does not look doubled
    const dens = (real ? 0.12 : 0.05 + f * 1.25) * L.trees;
    const r = h2(ix, iz, 1);
    let n = Math.floor(dens) + (h2(ix, iz, 2) < dens - Math.floor(dens) ? 1 : 0);
    c = { trees: [], tufts: [], filled: false, n, f, real };
    c.r = r; this.cache.set(k, c); return c;
  }

  _fill(c, ix, iz) {
    const w = this.world; c.filled = true;
    for (let i = 0; i < c.n; i++) {
      const x = ix * CELL + h2(ix, iz, 10 + i) * CELL, z = iz * CELL + h2(ix, iz, 20 + i) * CELL;
      const y = (this.avoid && this.avoid(x, z)) ? null : w.treeGround(x, z); this.pending++;
      if (y === null) continue;
      const type = Math.floor(h2(ix, iz, 30 + i) * this.types.length) % this.types.length;
      const s = 0.65 + h2(ix, iz, 40 + i) * 0.8;
      c.trees.push({ x, y, z, type, s, rot: h2(ix, iz, 50 + i) * 6.283 });
    }
    // grass tufts: denser in meadows, none where a tree trunk sits or in dense forest floor
    const nt = Math.round((1 - c.f * 0.6) * (c.real ? 2 : 5) * (0.6 + h2(ix, iz, 5)));
    for (let i = 0; i < nt; i++) {
      const x = ix * CELL + h2(ix, iz, 60 + i) * CELL, z = iz * CELL + h2(ix, iz, 70 + i) * CELL;
      const y = (this.avoid && this.avoid(x, z)) ? null : w.treeGround(x, z); this.pending++; if (y === null) continue;
      c.tufts.push({ x, y, z, s: 0.7 + h2(ix, iz, 80 + i) * 0.8, rot: h2(ix, iz, 90 + i) * 6.283 });
    }
  }

  /** @param focus Vector3 (player / aircraft), @param on whether vegetation should be shown at all */
  update(dt, focus, on) {
    const L = LEVELS[this.level];
    this.active = !!(on && L && this.ready);
    this.group.visible = this.active;
    if (!this.active) return;
    // ray budget: a few cells per frame (real map = raycast against huge meshes)
    const real = this.world.tilesStatus === 'ok' && !this.world.cruise;
    let budget = real ? 2 : 24;
    const R = L.treeR, ci = Math.floor(focus.x / CELL), cj = Math.floor(focus.z / CELL), rc = Math.ceil(R / CELL);
    let dirty = Math.hypot(focus.x - this.cx, focus.z - this.cz) > 6 || this.pendingDirty;
    this.pendingDirty = false;
    for (let dz = -rc; dz <= rc && budget > 0; dz++) for (let dx = -rc; dx <= rc && budget > 0; dx++) {
      if (dx * dx + dz * dz > rc * rc) continue;
      const c = this._cell(ci + dx, cj + dz); if (!c || c.filled) continue;
      this._fill(c, ci + dx, cj + dz); budget--; dirty = true; this.pendingDirty = budget === 0;
    }
    if (!dirty) return;
    this.cx = focus.x; this.cz = focus.z;
    for (const t of this.types) for (const im of t) im.count = 0;
    let gn = 0; this.trunks.length = 0;
    const M = _m, q = _q, p = _p, sc = _s, up = _up;
    const R2 = R * R, G2 = L.grassR * L.grassR;
    const counts = this.types.map(() => 0);
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const c = this.cache.get((ci + dx) * 73856093 ^ (cj + dz) * 19349663); if (!c || !c.filled) continue;
      for (const t of c.trees) {
        const ex = t.x - focus.x, ez = t.z - focus.z, d2 = ex * ex + ez * ez; if (d2 > R2) continue;
        const k = counts[t.type]; if (k >= this.maxTrees) continue;
        q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y, t.z); sc.setScalar(t.s); M.compose(p, q, sc);
        for (const im of this.types[t.type]) im.setMatrixAt(k, M);
        counts[t.type]++;
        if (d2 < 900) this.trunks.push(t);
      }
      if (this.grass) for (const g of c.tufts) {
        const ex = g.x - focus.x, ez = g.z - focus.z; if (ex * ex + ez * ez > G2 || gn >= L.grass) continue;
        q.setFromAxisAngle(up, g.rot); p.set(g.x, g.y, g.z); sc.setScalar(g.s); M.compose(p, q, sc); this.grass.setMatrixAt(gn++, M);
      }
    }
    this.types.forEach((parts, i) => parts.forEach((im) => { im.count = counts[i]; im.instanceMatrix.needsUpdate = true; }));
    if (this.grass) { this.grass.count = gn; this.grass.instanceMatrix.needsUpdate = true; }
    if (this.cache.size > 6000) this.cache.clear();        // keeps memory bounded on very long walks (cells are deterministic, they simply refill)
  }

  /** push a circle (x,z,r) out of nearby trunks. returns true if it moved */
  push(pos, r = 0.4) {
    let moved = false;
    for (const t of this.trunks) {
      const dx = pos.x - t.x, dz = pos.z - t.z, R = TREE_R * t.s + r, d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = t.x + dx / d * R; pos.z = t.z + dz / d * R; moved = true; }
    }
    return moved;
  }
}

function mergeGeos(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
