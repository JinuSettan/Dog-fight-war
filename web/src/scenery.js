// Airport scenery around the (virtual) runway: lights always, terminal / tower / apron / parked jets
// when the map has no real buildings (offline terrain) or when the player forces them on.
// Frame: runway along Z, take-off direction = -Z, +X = right of the runway, y = 0 terrain, slab top = runwayY.
import * as THREE from 'three';
import { createAircraft } from './models.js';

const STYLES = {
  in: { wall: '#ebe4d4', glass: '#5d8099', roof: '#c9572e', accent: '#f2a33a', tower: '#e6e1d6' },
  gulf: { wall: '#eadfc6', glass: '#7fb4cc', roof: '#f4f1ea', accent: '#c8a24a', tower: '#e8e2d2', arch: true },
  eu: { wall: '#dadee3', glass: '#6d8aa0', roof: '#8a949e', accent: '#2f6db3', tower: '#cfd5db' },
  us: { wall: '#cfd2d4', glass: '#5f7d95', roof: '#6e7377', accent: '#b43a3a', tower: '#c9ccce' },
  asia: { wall: '#e6e6e0', glass: '#6a8fa8', roof: '#4b5a66', accent: '#2f9d6b', tower: '#dfe3e3' },
};
const COUNTRY_STYLE = {
  India: 'in', UAE: 'gulf', Qatar: 'gulf', UK: 'eu', France: 'eu', Germany: 'eu', Netherlands: 'eu',
  USA: 'us', Japan: 'asia', Singapore: 'asia', Australia: 'us',
};
export const styleFor = (apt) => STYLES[COUNTRY_STYLE[apt.country] || 'eu'];

let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c); _dot.colorSpace = THREE.SRGBColorSpace;
  return _dot;
}

function lightPoints(pts, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.PointsMaterial({ map: dotTexture(), color, size, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 4;
  return p;
}

function facadeTexture(st, w, h, floors, bays) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = st.wall; g.fillRect(0, 0, c.width, c.height);
  const gw = c.width / bays, gh = c.height / floors;
  for (let i = 0; i < bays; i++) for (let j = 0; j < floors; j++) {
    g.fillStyle = st.glass; g.fillRect(i * gw + gw * 0.08, j * gh + gh * 0.14, gw * 0.84, gh * 0.62);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i * gw + gw * 0.08, j * gh + gh * 0.14, gw * 0.84, gh * 0.14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTexture(apt, st) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,20,30,0.92)'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = st.accent; g.fillRect(0, 0, 14, 128); g.fillRect(1010, 0, 14, 128);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = '800 64px system-ui, Arial, sans-serif';
  g.fillText(apt.iata, 40, 66);
  g.font = '700 40px system-ui, Arial, sans-serif';
  let name = apt.name.toUpperCase(); if (name.length > 26) name = name.slice(0, 26);
  g.fillText(name, 220, 48);
  g.font = '500 26px system-ui, Arial, sans-serif'; g.fillStyle = '#9fd0ff';
  g.fillText(`${apt.city}, ${apt.country}`.toUpperCase(), 222, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
}

function flatQuad(w, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 1; return m;
}

/** Light groups for the runway (always on). */
function buildLights(L, W, Y) {
  const g = new THREE.Group();
  const y = Y + 0.5;
  const edge = [], center = [], green = [], red = [], app = [];
  for (let z = -L / 2; z <= L / 2 + 0.1; z += 60) { edge.push(-(W / 2 + 2.5), y, z, W / 2 + 2.5, y, z); }
  for (let z = -L / 2 + 30; z <= L / 2 - 30; z += 30) center.push(0, y, z);
  for (let x = -W / 2; x <= W / 2 + 0.1; x += 4) { green.push(x, y, L / 2 + 1); red.push(x, y, -L / 2 - 1); }
  for (let z = L / 2 + 60; z <= L / 2 + 900; z += 30) {
    app.push(0, y + 0.2, z);
    if ((z - L / 2) % 150 === 0) for (let x = -15; x <= 15; x += 3) if (x) app.push(x, y + 0.2, z);
  }
  g.add(lightPoints(edge, 0xffffff, 5), lightPoints(center, 0xfff1c4, 4), lightPoints(green, 0x40ff70, 6), lightPoints(red, 0xff3a2a, 6), lightPoints(app, 0xfff6dd, 5));
  // PAPI (2 white / 2 red), left of the runway near the touchdown zone
  const pw = [], pr = [];
  for (let i = 0; i < 4; i++) (i < 2 ? pr : pw).push(-(W / 2 + 16 + i * 9), y + 0.4, L / 2 - 320);
  g.add(lightPoints(pw, 0xffffff, 9), lightPoints(pr, 0xff4030, 9));
  return g;
}

function buildStatic(apt, L, W, Y, st) {
  const g = new THREE.Group();
  const stripLen = L + 240;
  // --- surfaces ---
  const asphalt = '#4a4e54', apron = '#5b5f65';
  g.add(flatQuad(26, stripLen, asphalt, 118, 0.32, 0));                  // parallel taxiway
  g.add(flatQuad(2.2, stripLen, '#e8c23a', 118, 0.36, 0));              // taxiway centre line
  for (const z of [L / 2 - 200, -L / 2 + 250]) {                         // connectors to runway
    g.add(flatQuad(105, 24, asphalt, 68, 0.32, z));
    g.add(flatQuad(105, 1.6, '#e8c23a', 68, 0.36, z));
  }
  g.add(flatQuad(190, 640, apron, 215, 0.3, 0));                         // apron
  g.add(flatQuad(480, 780, '#6a6e74', 485, 0.28, 0));                    // terminal forecourt / car park
  // --- terminal ---
  const TL = 600, TH = 17, TX = 327;
  const tex = facadeTexture(st, TL, TH, 3, 36); tex.repeat.set(1, 1);
  const facade = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 });
  const side = std(st.wall);
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(56, TH, TL), [side, side, side, side, side, side]);
  terminal.position.set(TX, TH / 2, 0);
  // facade plane toward the runway
  const face = new THREE.Mesh(new THREE.PlaneGeometry(TL, TH), facade);
  face.rotation.y = -Math.PI / 2; face.position.set(TX - 28.05, TH / 2, 0);
  g.add(terminal, face);
  if (st.arch) {
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, TL * 0.96, 28, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: st.roof, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }));
    roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, 0.42); roof.position.set(TX - 2, TH, 0);
    g.add(roof);
  } else {
    g.add(box(66, 1.6, TL + 10, std(st.roof), TX - 5, TH + 0.8, 0));
    g.add(box(24, 1.0, TL * 0.9, std(st.accent), TX - 40, 7.5, 0));       // front canopy
  }
  // sign on the facade
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(190, 23.75), new THREE.MeshBasicMaterial({ map: signTexture(apt, st), toneMapped: false }));
  sign.rotation.y = -Math.PI / 2; sign.position.set(TX - 28.3, TH + 9, 0);
  g.add(sign);
  // pier toward the apron (gate fingers) + jet bridges
  const bridgeMat = std('#b9bec4', { metalness: 0.3, roughness: 0.5 });
  const gates = [];
  for (let i = 0; i < 6; i++) gates.push(-216 + i * 86 + (i > 2 ? 0 : 0));
  for (const gz of gates) {
    g.add(box(40, 4.2, 4.2, bridgeMat, TX - 48, 5.0, gz - 9));
    g.add(box(5, 5, 5.6, std('#3a3f45'), TX - 69, 4.4, gz - 9));
  }
  // --- control tower ---
  const tallBase = apt.country === 'UAE' || apt.country === 'Qatar' ? 78 : 58;
  const tz = -210, tx = TX + 40;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.2, tallBase, 18), std(st.tower));
  shaft.position.set(tx, tallBase / 2, tz);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 5.4, 8, 18), new THREE.MeshStandardMaterial({ color: '#6fa4c2', roughness: 0.1, metalness: 0.5 }));
  cab.position.set(tx, tallBase + 4, tz);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 1.2, 18), std('#8d9399'));
  cabRoof.position.set(tx, tallBase + 8.6, tz);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 12, 6), std('#d33'));
  mast.position.set(tx, tallBase + 15, tz);
  g.add(shaft, cab, cabRoof, mast);
  // --- hangars / cargo on the far side ---
  g.add(box(70, 20, 150, std('#9aa3ab'), -330, 10, -260));
  g.add(box(60, 18, 130, std('#a9b0b6'), -330, 9, -40));
  g.add(box(90, 12, 220, std('#8e969d'), -420, 6, 230));
  g.add(box(10, 10, 10, std('#cfd3d6'), -250, 5, 350));
  // --- fuel tanks ---
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 14, 20), std('#e4e6e8')); t.position.set(-380, 7, 420 + i * 34); g.add(t); }
  // --- car park + vehicles (instanced) ---
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.5, 4.4), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }), 520);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const palette = ['#d9d9d9', '#222831', '#b33a3a', '#2f5d9b', '#e8e8e8', '#7d8590', '#e0c34a'];
  let n = 0;
  for (let r = 0; r < 14 && n < 520; r++) for (let c2 = 0; c2 < 40 && n < 520; c2++) {
    if (Math.sin(r * 12.9898 + c2 * 78.233) * 43758.5453 % 1 > 0.55) continue;
    m4.makeTranslation(385 + r * 11 + (r > 6 ? 8 : 0), 0.3 + 0.75, -340 + c2 * 17);
    cars.setMatrixAt(n, m4); cars.setColorAt(n, col.set(palette[(r * 7 + c2 * 3) % palette.length])); n++;
  }
  cars.count = n; cars.instanceMatrix.needsUpdate = true; if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  g.add(cars);
  const veh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 7), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 24);
  let k = 0; const vcols = ['#f2f2f2', '#e8b23a', '#2a6fb0', '#cf3b2b'];
  for (const gz of gates) for (let j = 0; j < 4; j++) {
    const x = 252 + (j % 2) * 16 - 6 + (j > 1 ? 24 : 0), z = gz + (j % 2 ? 16 : -20);
    if (k >= 24) break;
    m4.makeRotationY(j * 0.4); m4.setPosition(x, 0.3 + 1.3, z); veh.setMatrixAt(k, m4); veh.setColorAt(k, col.set(vcols[(k + j) % 4])); k++;
  }
  veh.count = k; veh.instanceMatrix.needsUpdate = true; if (veh.instanceColor) veh.instanceColor.needsUpdate = true;
  g.add(veh);
  // --- blue taxiway edge lights ---
  const tl = [];
  for (let z = -stripLen / 2; z <= stripLen / 2; z += 40) tl.push(118 - 13.5, 0.8, z, 118 + 13.5, 0.8, z);
  g.add(lightPoints(tl, 0x4aa8ff, 4));
  g.userData.gates = gates;
  return g;
}

/**
 * @param {object} apt airport definition
 * @param {number} L runway length, W runway width
 * @param {number} Y runway slab top (world y)
 */
export async function buildAirportScenery(apt, L, W, Y, { parked = 5 } = {}) {
  const st = styleFor(apt);
  const root = new THREE.Group();
  const lights = buildLights(L, W, Y);
  const buildings = buildStatic(apt, L, W, Y, st);
  root.add(lights, buildings);
  try {
    const gates = buildings.userData.gates;
    for (let i = 0; i < Math.min(parked, gates.length); i++) {
      const jet = await createAircraft('a318');
      jet.setGear(true); jet.setAfterburner(0);
      jet.root.position.set(262, 0.3 + jet.cfg.gearHeight - 0.15, gates[i] + 3);
      buildings.add(jet.root);
    }
  } catch (e) { console.warn('parked jets failed', e); }
  return { root, lights, buildings, style: st };
}
