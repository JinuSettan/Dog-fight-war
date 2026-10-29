// GLB loading + normalisation: every aircraft ends up with nose = -Z, up = +Y, origin = CG,
// scaled to its real length, wheels touching y = -gearHeight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT } from './config.js';

const loader = new GLTFLoader();
const cache = new Map();

function base(path) { return (import.meta.env?.BASE_URL ?? './') + path; }

export function loadGLB(path, onProgress) {
  if (!cache.has(path)) {
    cache.set(path, new Promise((res, rej) => loader.load(base(path), (g) => res(g), onProgress, rej)));
  }
  return cache.get(path);
}

function fixMaterials(root, { shadow = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadow; o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.anisotropy = 4;
      if (/glass|canopy/i.test(m.name || '') || /canopy|glass/i.test(o.name || '')) {
        m.transparent = true; m.opacity = Math.min(m.opacity ?? 1, 0.55); m.depthWrite = false;
        if (m.color) m.color.set(0x88aacc);
        m.metalness = 0.2; m.roughness = 0.1;
      }
      if (m.metalness !== undefined && m.metalness > 0.85) m.metalness = 0.65;
      m.side = THREE.FrontSide;
      if (m.envMapIntensity !== undefined) m.envMapIntensity = 0.9;
    }
  });
}

/** Returns a fresh instance (shared geometry) of the aircraft with an API for gear/afterburner. */
export async function createAircraft(id) {
  const cfg = AIRCRAFT[id];
  const gltf = await loadGLB(cfg.model);
  const raw = gltf.scene.clone(true);
  fixMaterials(raw);

  // 1. rotate nose axis to -Z
  const pivot = new THREE.Group();
  pivot.add(raw);
  if (cfg.noseAxis === '+x') pivot.rotation.y = Math.PI / 2;
  else if (cfg.noseAxis === '+z') pivot.rotation.y = Math.PI;
  else if (cfg.noseAxis === '-x') pivot.rotation.y = -Math.PI / 2;
  pivot.updateMatrixWorld(true);

  // 2. measure (ignore far-away helper geometry by using the whole box)
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = cfg.lengthM / size.z;

  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(pivot);
  holder.scale.setScalar(s);
  // centre in X/Z, wheels at -gearHeight in Y
  holder.position.set(-center.x * s, -box.min.y * s - cfg.gearHeight, -center.z * s);
  root.add(holder);

  // gear visibility: nodes named *landingOn*/*LandingOpen* are the extended gear, *landingOff*/*Closed* retracted
  const gearDown = [], gearUp = [];
  raw.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (/landingon|landingopen|landinglights|_gear_|gear_0|gear_1|gear_2|gear_3/.test(n)) gearDown.push(o);
    else if (/landingoff|landingclosed/.test(n)) gearUp.push(o);
  });
  const api = {
    root, cfg, holder, size: size.clone().multiplyScalar(s),
    setGear(down) {
      for (const o of gearDown) o.visible = down;
      for (const o of gearUp) o.visible = !down;
    },
  };
  api.setGear(true);

  // afterburner glow (additive cone)
  if (cfg.hasAB) {
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 12, 1, true), flameMat);
    cone.rotation.x = -Math.PI / 2;            // cone tip toward -Z initially; flip so tip points back (+Z)
    cone.rotation.x = Math.PI / 2;
    const engines = id === 'mig29' || id === 'mig35' || id === 'f15e' || id === 'eagle' ? [-1, 1] : [0];
    const flames = engines.map((sx) => {
      const f = cone.clone(); f.material = flameMat.clone();
      f.position.set(sx * cfg.lengthM * 0.055, 0.2, cfg.lengthM * 0.5 + 0.1);
      f.scale.set(1, 1, 1);
      root.add(f); return f;
    });
    api.setAfterburner = (level) => {
      for (const f of flames) {
        const l = level * (0.85 + 0.3 * Math.random());
        f.material.opacity = Math.min(0.85, level * 0.9);
        f.scale.set(1 + 0.1 * l, l * (cfg.lengthM * 0.34) + 0.01, 1 + 0.1 * l);
        f.position.z = cfg.lengthM * 0.5 + (l * cfg.lengthM * 0.17);
        f.visible = level > 0.02;
      }
    };
  } else api.setAfterburner = () => {};

  return api;
}

export async function createRunway(lengthM) {
  const gltf = await loadGLB('models/runway.glb');
  const raw = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(raw);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  const s = lengthM / size.z;                       // long axis along Z
  raw.position.set(-center.x, -box.max.y, -center.z);
  const sc = new THREE.Group();
  sc.add(raw);
  sc.scale.set(Math.min(s, 0.55), 1, s);              // keep width realistic (~45-60 m)
  root.add(sc);
  raw.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.polygonOffset = true; m.polygonOffsetFactor = -6; m.polygonOffsetUnits = -6; m.side = THREE.DoubleSide; }
      o.renderOrder = 2;
    }
  });
  root.userData.width = size.x * Math.min(s, 0.55);
  return root;
}
