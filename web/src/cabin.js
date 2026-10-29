// Procedural passenger cabin for the airliner: seats, passengers, windows, overhead bins.
// Local frame = aircraft frame (nose -Z, up +Y, right +X). Everything stays inside the A318 fuselage.
import * as THREE from 'three';

const FLOOR = -0.95, CEIL = 1.2;
const WALL_X = 1.72;
const Z_FRONT = -10.9, PITCH = 0.76, ROWS = 19;
const SEAT_X = [-1.18, -0.76, -0.34, 0.34, 0.76, 1.18];

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function sideWall(side, zMin, zMax, rows, color) {
  const shape = new THREE.Shape();
  const yMin = FLOOR, yMax = 0.62;
  shape.moveTo(zMin, yMin); shape.lineTo(zMax, yMin); shape.lineTo(zMax, yMax); shape.lineTo(zMin, yMax); shape.closePath();
  for (const z of rows) {
    const h = new THREE.Path();
    const cx = z + 0.12, cy = 0.08, rx = 0.13, ry = 0.19;
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry; if (i === 0) h.moveTo(px, py); else h.lineTo(px, py); }
    shape.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); p.setXYZ(i, side * WALL_X, v, u); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(0.55) }));
  return m;
}

export function createCabin(cfg, pax = 100, seed = 7) {
  const group = new THREE.Group();
  group.visible = false;
  const rand = rng(seed);
  const zBack = Z_FRONT + ROWS * PITCH + 1.2;
  const lit = (c, k = 0.5, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, emissive: new THREE.Color(c).multiplyScalar(k), ...o });

  // floor + aisle carpet
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, zBack - Z_FRONT), lit('#3b4552', 0.5));
  floor.position.set(0, FLOOR - 0.03, (zBack + Z_FRONT) / 2); group.add(floor);
  const aisle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, zBack - Z_FRONT), lit('#7a2f38', 0.6));
  aisle.position.set(0, FLOOR + 0.005, (zBack + Z_FRONT) / 2); group.add(aisle);

  // walls with windows
  const rowZ = []; for (let r = 0; r < ROWS; r++) rowZ.push(Z_FRONT + 0.7 + r * PITCH);
  const wallCol = '#d8d4cb';
  group.add(sideWall(-1, Z_FRONT, zBack, rowZ, wallCol), sideWall(1, Z_FRONT, zBack, rowZ, wallCol));
  // upper sloped panels and bins
  for (const s of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, zBack - Z_FRONT), lit('#e9e6df', 0.6));
    up.position.set(s * 1.55, 0.93, (zBack + Z_FRONT) / 2); up.rotation.z = -s * 0.65; group.add(up);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.34, zBack - Z_FRONT - 0.4), lit('#efece6', 0.55));
    bin.position.set(s * 1.18, 0.82, (zBack + Z_FRONT) / 2); group.add(bin);
  }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, zBack - Z_FRONT), lit('#f4f2ee', 0.7));
  ceil.position.set(0, CEIL, (zBack + Z_FRONT) / 2); group.add(ceil);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, zBack - Z_FRONT - 0.6), new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false }));
  strip.position.set(0, CEIL - 0.04, (zBack + Z_FRONT) / 2); group.add(strip);
  // bulkheads
  const bf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.08), lit('#cfcac0', 0.5)); bf.position.set(0, 0.1, Z_FRONT - 0.04); group.add(bf);
  const br = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.08), lit('#cfcac0', 0.5)); br.position.set(0, 0.1, zBack + 0.04); group.add(br);

  // seats (instanced)
  const N = ROWS * 6;
  const seatCol = new THREE.Color('#1e4a8a');
  const mk = (geo, mat) => new THREE.InstancedMesh(geo, mat, N);
  const base = mk(new THREE.BoxGeometry(0.42, 0.12, 0.46), lit('#1e4a8a', 0.55));
  const back = mk(new THREE.BoxGeometry(0.42, 0.62, 0.1), lit('#1e4a8a', 0.55));
  const rest = mk(new THREE.BoxGeometry(0.3, 0.2, 0.1), lit('#3a64a8', 0.55));
  const torso = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), lit('#ffffff', 0.5), N);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 12, 10), lit('#ffffff', 0.5), N);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const cloth = ['#c94f4f', '#3f6fb5', '#e6c15a', '#4a9a6a', '#d9d9d9', '#2a2f3a', '#9b5fb0', '#e08a3c', '#6f8aa6'];
  const skin = ['#f1c7a0', '#d9a273', '#a86f45', '#7a4a2c', '#e8b98f'];
  // choose which seats are occupied
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const occupied = new Set(order.slice(0, Math.min(N, pax)));
  let nt = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 6; c++) {
    const i = r * 6 + c, x = SEAT_X[c], z = rowZ[r] + 0.05;
    m4.makeTranslation(x, FLOOR + 0.42, z); base.setMatrixAt(i, m4); base.setColorAt(i, seatCol);
    m4.makeTranslation(x, FLOOR + 0.78, z + 0.2); back.setMatrixAt(i, m4); back.setColorAt(i, seatCol);
    m4.makeTranslation(x, FLOOR + 1.2, z + 0.22); rest.setMatrixAt(i, m4); rest.setColorAt(i, col.set('#3a64a8'));
    if (occupied.has(i)) {
      m4.makeTranslation(x, FLOOR + 0.82, z + 0.02); torso.setMatrixAt(nt, m4); torso.setColorAt(nt, col.set(cloth[Math.floor(rand() * cloth.length)]));
      m4.makeTranslation(x, FLOOR + 1.22, z + 0.0); head.setMatrixAt(nt, m4); head.setColorAt(nt, col.set(skin[Math.floor(rand() * skin.length)]));
      nt++;
    }
  }
  torso.count = nt; head.count = nt;
  for (const im of [base, back, rest, torso, head]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; group.add(im); }

  // a few standing flight attendants' trolley + galley props at the rear
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.7), lit('#bfc4c9', 0.5)); trolley.position.set(0, FLOOR + 0.45, zBack - 0.6); group.add(trolley);

  const midRow = rowZ[8];
  return {
    group,
    rowZ,
    views: {
      cabin: { name: 'Cabin', pos: new THREE.Vector3(0, FLOOR + 1.5, zBack - 1.0), yaw: 0, pitch: -0.03, fov: 72 },
      window: { name: 'Window seat', pos: new THREE.Vector3(-1.12, FLOOR + 1.12, midRow + 0.02), yaw: Math.PI / 2, pitch: -0.04, fov: 66 },
    },
  };
}
