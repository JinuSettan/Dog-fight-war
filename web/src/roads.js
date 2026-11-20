// Road network for traffic. Two sources, one interface:
//  - demo terrain (no real map): a procedural street grid west of the airport, drawn as asphalt ribbons;
//  - real map: streets fetched from OpenStreetMap (Overpass API) around the player and converted with world.latLonToScene.
//    The real 3D tiles already show the roads, so nothing is drawn there; the graph is only used to drive cars along them.
// Graph: nodes {x,z,e:[node ids]}; cars walk node -> node.
import * as THREE from 'three';

const KEY = 'dogfight-war.roads.v1';
const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export class Roads {
  constructor(scene, world) {
    this.world = world; this.scene = scene; this.nodes = []; this.mesh = null; this.kind = 'none'; this.status = 'none';
    this.width = 9; this.synth = null;
  }

  clear() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    this.nodes = []; this.kind = 'none'; this.synth = null;
  }

  get ready() { return this.nodes.length > 1; }

  // ---------------- demo terrain: procedural grid ----------------
  buildSynthetic(o = {}) {
    this.clear(); this.kind = 'grid';
    this.width = o.width || 9;
    const Sx = o.Sx || o.S || 190, Sz = o.Sz || o.S || 190, X0 = o.X0 ?? -330, NX = o.NX || 8, Z0 = o.Z0 ?? -1710, NZ = o.NZ || 19;   // intersections at x = X0 - Sx*i, z = Z0 + Sz*j
    const S = Sx;
    const id = (i, j) => i * NZ + j;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) this.nodes.push({ x: X0 - Sx * i, z: Z0 + Sz * j, e: [] });
    const link = (a, b) => { this.nodes[a].e.push(b); this.nodes[b].e.push(a); };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      if (i + 1 < NX) link(id(i, j), id(i + 1, j));
      if (j + 1 < NZ) link(id(i, j), id(i, j + 1));
    }
    this.synth = { S, Sx, Sz, X0, NX, Z0, NZ };
    // ribbons
    const pos = [], uv = [], idx = [], hw = this.width / 2;
    const quad = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = -dz / L * hw, nz = dx / L * hw, v = pos.length / 3;
      pos.push(ax + nx, 0.06, az + nz, ax - nx, 0.06, az - nz, bx + nx, 0.06, bz + nz, bx - nx, 0.06, bz - nz);
      uv.push(0, 0, 1, 0, 0, L / 14, 1, L / 14); idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    };
    for (let i = 0; i < NX; i++) quad(X0 - Sx * i, Z0, X0 - Sx * i, Z0 + Sz * (NZ - 1));
    for (let j = 0; j < NZ; j++) quad(X0, Z0 + Sz * j, X0 - Sx * (NX - 1), Z0 + Sz * j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = '#3d4146'; c.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${95 + Math.random() * 60 | 0},.12)`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    c.fillStyle = '#d9c24a'; c.fillRect(62, 0, 2, 64); c.fillRect(66, 0, 2, 64);           // double centre line (half length = dashed look)
    c.fillStyle = '#d8d8d8'; c.fillRect(6, 0, 2, 128); c.fillRect(120, 0, 2, 128);          // edge lines
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.scene.add(this.mesh);
    this.status = 'grid';
  }

  /** true where a point is on / next to a drawn road (used to keep trees off the asphalt) */
  onRoad(x, z, margin = 4) {
    const s = this.synth; if (!s) return false;
    if (z < s.Z0 - margin || z > s.Z0 + s.Sz * (s.NZ - 1) + margin || x > s.X0 + margin || x < s.X0 - s.Sx * (s.NX - 1) - margin) return false;
    const rx = ((s.X0 - x) % s.Sx + s.Sx) % s.Sx, rz = ((z - s.Z0) % s.Sz + s.Sz) % s.Sz, w = this.width / 2 + margin;
    return Math.min(rx, s.Sx - rx) < w || Math.min(rz, s.Sz - rz) < w;
  }

  // ---------------- real map: OpenStreetMap ----------------
  /** @param json Overpass "out skel" result (elements: node{id,lat,lon}, way{nodes}) */
  fromOverpass(json) {
    this.clear(); this.kind = 'osm';
    const pts = new Map(), ways = [];
    for (const e of json.elements || []) { if (e.type === 'node') pts.set(e.id, e); else if (e.type === 'way' && e.nodes) ways.push(e.nodes); }
    const idOf = new Map();
    const get = (nid) => {
      if (idOf.has(nid)) return idOf.get(nid);
      const p = pts.get(nid); if (!p) return -1;
      const q = this.world.latLonToScene(p.lat, p.lon); if (!q) return -1;
      const i = this.nodes.length; this.nodes.push({ x: q.x, z: q.z, e: [] }); idOf.set(nid, i); return i;
    };
    for (const w of ways) {
      let prev = -1;
      for (const nid of w) {
        const i = get(nid); if (i < 0) { prev = -1; continue; }
        if (prev >= 0 && prev !== i) { this.nodes[prev].e.push(i); this.nodes[i].e.push(prev); }
        prev = i;
      }
    }
    // drop isolated bits
    this.status = 'osm';
    return this.nodes.length;
  }

  async fetchOSM(lat, lon, radius = 650) {
    const k = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + radius;
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (raw[k]) { this.fromOverpass(raw[k]); return this.nodes.length; }
    } catch (e) { /* no storage */ }
    const q = `[out:json][timeout:20];way(around:${radius},${lat},${lon})[highway~"^(${HIGHWAYS})$"];(._;>;);out skel;`;
    this.status = 'loading';
    for (const url of OVERPASS) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch(url + '?data=' + encodeURIComponent(q), { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) continue;
        const json = await r.json();
        if (!json.elements || !json.elements.length) continue;
        try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); const keys = Object.keys(raw); if (keys.length > 6) delete raw[keys[0]]; raw[k] = json; localStorage.setItem(KEY, JSON.stringify(raw)); } catch (e) { /* quota */ }
        this.fromOverpass(json); return this.nodes.length;
      } catch (e) { /* try the next mirror */ }
    }
    this.status = 'failed'; return 0;
  }

  // ---------------- queries ----------------
  nearest(x, z, rmax = 1e9) {
    let best = -1, bd = rmax * rmax;
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd && n.e.length) { bd = d; best = i; } }
    return best;
  }
  randomNear(x, z, rmin, rmax, rnd = Math.random) {
    const c = [];
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; const d = Math.hypot(n.x - x, n.z - z); if (d >= rmin && d <= rmax && n.e.length) c.push(i); }
    return c.length ? c[Math.floor(rnd() * c.length)] : -1;
  }
  /** next node when arriving at `at` from `from`: never turn back unless dead end */
  next(at, from, rnd = Math.random) {
    const e = this.nodes[at].e; if (!e.length) return -1;
    const opts = e.filter((k) => k !== from);
    return opts.length ? opts[Math.floor(rnd() * opts.length)] : e[0];
  }
}
