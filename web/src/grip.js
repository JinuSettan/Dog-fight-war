// Two-bone IK that puts BOTH hands on the weapon (AAA-style grip) and curls the fingers around it.
// The rig has identity bone orientations, so every bone's "rest direction" is simply its child's local offset.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

/**
 * Grip points in GUN space (muzzle +Z, up +Y, gun's left +X): palm centre P, finger direction F, palm normal N, curl (rad per finger joint), thumb curl.
 * hold = where the gun origin sits in character space (x left, y up, z forward); pivot = point it pitches around.
 */
export const GRIPS = {
  ak47: {
    twist: [-0.2, -0.32, 0.2, 0.32], hold: [-0.10, 1.30, 0.38], pivot: [-0.10, 1.43, -0.06], pole: { R: [-0.5, -1, -0.35], L: [0.55, -1, -0.15] },
    R: { P: [0.0, 0.05, -0.195], F: [0.15, -0.55, 0.2], N: [0.5, 0.2, 0.85], curl: [1.1, 1.25, 0.9], thumb: [0.2, 0.3, 0.2] },
    L: { P: [0.0, 0.112, 0.12], F: [-0.55, 0.0, 0.85], N: [0.0, 1.0, 0.0], curl: [1.0, 1.15, 0.9], thumb: [0.1, 0.2, 0.1] },
  },
  pistol: {
    twist: [-0.1, -0.18, 0.12, 0.18], hold: [-0.03, 1.39, 0.47], pivot: [-0.05, 1.46, 0.0], pole: { R: [-0.5, -1, -0.2], L: [0.5, -1, -0.2] },
    R: { P: [-0.018, 0.058, -0.062], F: [0.15, -0.55, 0.2], N: [0.5, 0.2, 0.85], curl: [1.1, 1.25, 0.9], thumb: [0.2, 0.3, 0.2] },
    L: { P: [0.036, 0.062, -0.022], F: [0.1, -0.5, 0.85], N: [-0.95, 0.0, 0.1], curl: [1.0, 1.2, 0.9], thumb: [0.1, 0.1, 0.1] },
  },
};

const FINGERS = ['Index', 'Mid', 'Ring', 'Pinky'];

/** cache per-rig data: segment lengths, rest directions, hand rest frame, finger axes */
function prep(rig) {
  if (rig._grip) return rig._grip;
  const B = rig.bones, d = { up: {}, fo: {}, rest: {}, L1: {}, L2: {}, hand: {}, axis: {} };
  for (const s of ['L', 'R']) {
    const U = B['UpperArm' + s], F = B['ForeArm' + s], H = B['Hand' + s]; if (!U || !F || !H) { rig._grip = null; return null; }
    d.L1[s] = F.position.length(); d.L2[s] = H.position.length();
    d.up[s] = F.position.clone().normalize(); d.fo[s] = H.position.clone().normalize();
    const mid = B['Mid1' + s], idx = B['Index1' + s], pk = B['Pinky1' + s];
    const f = mid ? mid.position.clone().normalize() : H.position.clone().normalize();
    let across = idx && pk ? pk.position.clone().sub(idx.position).normalize() : V(0, 0, 1);
    let n = new THREE.Vector3().crossVectors(across, f).normalize(); if (n.y > 0) n.negate();       // palm faces down / inward at rest
    d.hand[s] = { f, n };
    // curl axis: rotating about it moves finger tips toward the palm normal
    let a = across.clone(); if (new THREE.Vector3().crossVectors(a, f).dot(n) < 0) a.negate(); d.axis[s] = a;
    d.rest[s] = { U: U.quaternion.clone(), F: F.quaternion.clone(), H: H.quaternion.clone() };
  }
  rig._grip = d; return d;
}

/** frame quaternion mapping (f0,n0) -> (f1,n1) */
function frameQuat(f0, n0, f1, n1, out) {
  const b0 = new THREE.Matrix4().makeBasis(f0, n0, new THREE.Vector3().crossVectors(f0, n0));
  const b1 = new THREE.Matrix4().makeBasis(f1, n1, new THREE.Vector3().crossVectors(f1, n1));
  _m.copy(b1).multiply(b0.transpose());
  return out.setFromRotationMatrix(_m);
}
function orthoN(f, n) { return n.clone().addScaledVector(f, -n.dot(f)).normalize(); }

function solve(rig, side, target, pole, hf, hn, w, gunQ) {
  const d = prep(rig); if (!d) return;
  const B = rig.bones, U = B['UpperArm' + side], F = B['ForeArm' + side], H = B['Hand' + side];
  const sh = U.getWorldPosition(V(0, 0, 0)), L1 = d.L1[side], L2 = d.L2[side];
  const dir = target.clone().sub(sh); let dist = dir.length(); dir.divideScalar(dist || 1);
  dist = Math.min(dist, (L1 + L2) * 0.999);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = sh.clone().addScaledVector(dir, cosA * L1).addScaledVector(perp, sinA * L1);
  const hand = sh.clone().addScaledVector(dir, dist);
  const pq = U.parent.getWorldQuaternion(new THREE.Quaternion());
  const qU = new THREE.Quaternion().setFromUnitVectors(d.up[side], elbow.clone().sub(sh).normalize().applyQuaternion(pq.clone().invert()));
  const uw = pq.clone().multiply(qU);
  const qF = new THREE.Quaternion().setFromUnitVectors(d.fo[side], hand.clone().sub(elbow).normalize().applyQuaternion(uw.clone().invert()));
  const fw = uw.clone().multiply(qF);
  const qHw = frameQuat(d.hand[side].f, d.hand[side].n, hf, hn, new THREE.Quaternion());
  const qH = fw.clone().invert().multiply(qHw);
  U.quaternion.slerp(qU, w); F.quaternion.slerp(qF, w); H.quaternion.slerp(qH, w);
}

function curl(rig, side, amounts, thumb, w) {
  const d = prep(rig); if (!d) return;
  const a = d.axis[side], B = rig.bones;
  for (const f of FINGERS) for (let k = 0; k < 3; k++) { const b = B[f + (k + 1) + side]; if (b) { _q.setFromAxisAngle(a, amounts[k]); b.quaternion.slerp(_q, w); } }
  for (let k = 0; k < 3; k++) { const b = B['Thumb' + (k + 1) + side]; if (b) { _q.setFromAxisAngle(a, thumb[k]); b.quaternion.slerp(_q, w); } }
}

/** call after pose(); w = walker (root, rig, aim, aimPitch, weapons) */
export function applyGrip(w) {
  const wp = w.weapons; if (!wp || !wp.armed || !w.rig) return;
  const spec = GRIPS[wp.cur], gun = wp.guns[wp.cur]; if (!spec || !gun) return;
  const k = THREE.MathUtils.smoothstep(w.aim, 0.0, 0.8); if (k < 0.01) return;
  const rig = w.rig, B0 = rig.bones, tw = spec.twist || [0, 0, 0, 0];
  if (B0.Spine) B0.Spine.rotation.y += tw[0] * k; if (B0.Chest) B0.Chest.rotation.y += tw[1] * k; if (B0.Neck) B0.Neck.rotation.y += tw[2] * k; if (B0.Head) B0.Head.rotation.y += tw[3] * k;   // bladed stance, eyes stay on target
  w.root.updateMatrixWorld(true);
  // gun placement: pitched about the shoulder pivot, recoil pushes it back, reload tips it
  const pitch = (w.aimPitch || 0) * 0.9, kick = w.kick || 0, rl = wp.reloadT > 0 ? Math.sin(Math.min(1, wp.reloadT) * Math.PI) : 0;
  const pv = V(...spec.pivot), hold = V(...spec.hold).sub(pv).applyAxisAngle(V(1, 0, 0), -pitch).add(pv);
  hold.z -= kick * 0.05; hold.y += kick * 0.01;
  gun.position.copy(hold); gun.rotation.set(-pitch - kick * 0.04 + rl * 0.5, 0, 0);
  w.root.updateMatrixWorld(true);
  const rq = w.root.getWorldQuaternion(new THREE.Quaternion()), gq = gun.getWorldQuaternion(new THREE.Quaternion());
  for (const s of ['R', 'L']) {
    const g = spec[s]; if (!g) continue;
    const dd = prep(rig); if (!dd) return;
    const F = V(...g.F).normalize(), N = orthoN(F, V(...g.N)), Pw = gun.localToWorld(V(...g.P));
    const Fw = F.clone().applyQuaternion(gq), Nw = N.clone().applyQuaternion(gq);
    const palm = (dd.hand[s].f.length() ? 0.055 : 0.05);                    // wrist -> palm centre along the fingers
    const wrist = Pw.clone().addScaledVector(Fw, -palm);
    const pole = V(...spec.pole[s]).applyQuaternion(rq);
    solve(rig, s, wrist, pole, Fw, Nw, k, gq);
    curl(rig, s, g.curl, g.thumb, k);
  }
  // head follows the aim a little, spine leans into the weapon
  const B = rig.bones; if (B.Head) B.Head.rotation.x -= pitch * 0.4 * k; if (B.Chest) B.Chest.rotation.x -= pitch * 0.25 * k;
}

/** relaxed hands when nothing is held (slightly curled fingers instead of a flat board) */
export function relaxHands(rig) {
  if (!rig.bones.Index1L) return;
  for (const side of ['L', 'R']) curl(rig, side, [0.22, 0.32, 0.22], [0.1, 0.15, 0.1], 1);
}
