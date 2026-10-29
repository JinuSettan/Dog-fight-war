// Combat: AI enemy fighters, guns, heat-seeking missiles, flares, explosions, lock-on, waves.
import * as THREE from 'three';
import { createAircraft } from './models.js';
import { AIRCRAFT, ENEMY_TYPES, DIFFICULTY } from './config.js';
import { ParticleSystem, Billboards, makePuffTexture } from './particles.js';

const G = 9.80665;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _r = new THREE.Vector3();

function segHitSphere(p0, p1, c, r) {
  _a.copy(p1).sub(p0); const l2 = _a.lengthSq();
  const t = l2 > 0 ? clamp(_b.copy(c).sub(p0).dot(_a) / l2, 0, 1) : 0;
  _c.copy(p0).addScaledVector(_a, t);
  return _c.distanceToSquared(c) < r * r;
}

function makeMissileMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 10), white);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 10), dark);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -1.6;
  g.add(body, nose);
  const finGeo = new THREE.BoxGeometry(0.9, 0.02, 0.45);
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(finGeo, dark); f.position.z = 1.0; f.rotation.z = i * Math.PI / 2; g.add(f);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.25), dark); c.position.z = -0.8; c.rotation.z = i * Math.PI / 2; g.add(c);
  }
  g.scale.setScalar(1.6);
  return g;
}

export class Enemy {
  constructor(api, type, diff, pos, dir) {
    this.api = api; this.type = type; this.diff = diff;
    this.pos = pos.clone(); this.fwd = dir.clone().normalize(); this.up = UP.clone();
    this.vel = new THREE.Vector3();
    this.speed = 230 * diff.speed; this.hp = diff.hp; this.maxHp = diff.hp;
    this.alive = true; this.dying = 0; this.state = 'attack'; this.stateT = 0;
    this.gunCd = rnd(1, 3); this.burst = 0; this.missCd = rnd(4, 9) + diff.fireGap * 0.3; this.missiles = 2; this.flares = 10; this.flareCd = 0;
    this.bank = 0; this.groundY = 0; this.gT = Math.random(); this.radius = 12; this.seed = Math.random() * 100; this.spin = 0; this.id = Math.random().toString(36).slice(2, 6);
    this.q = new THREE.Quaternion(); this.dist = 0; this.threat = null;
    api.root.position.copy(pos);
    api.setGear(false);
    this._applyOrientation(0);
  }
  _applyOrientation(dt) {
    const right = _r.copy(this.fwd).cross(this.up).normalize();
    const up = _d.copy(right).cross(this.fwd).normalize();
    _m.makeBasis(right, up, _c.copy(this.fwd).negate());
    this.q.setFromRotationMatrix(_m);
    this.api.root.quaternion.copy(this.q);
    this.api.root.position.copy(this.pos);
  }
}

export class Combat {
  constructor(world, audio, cb = {}) {
    this.world = world; this.audio = audio; this.cb = cb;
    this.scene = world.scene;
    this.enemies = []; this.bullets = []; this.missiles = []; this.flares = [];
    this.kills = 0; this.wave = 0; this.waveTimer = 0; this.active = false;
    this.shots = 0; this.hits = 0;
    this.player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1), up: UP.clone(), alive: true, radius: 9, speed: 0 };
    this.lock = { target: null, t: 0, locked: false };
    this.smoke = new ParticleSystem(2200, { texture: makePuffTexture('soft'), fogMix: 0.6, nearFade: 8 });
    this.fire = new ParticleSystem(900, { texture: makePuffTexture('flare'), additive: true, fogMix: 0, nearFade: 4 });
    this.tracers = new Billboards(900, { texture: makePuffTexture('flare', 64), additive: true, fogMix: 0, nearFade: 3 });
    this.scene.add(this.smoke.mesh, this.fire.mesh, this.tracers.mesh);
    this.missileMesh = makeMissileMesh();
    this.t = 0; this._gT = 0; this._gIdx = 0; this.ammo = 600; this.missileAmmo = 6; this.flareAmmo = 24;
    this._gunAcc = 0; this._gunSnd = 0;
    this.targetCycle = 0;
    this.fogHook = (c, d) => { this.smoke.setFog(c, d); this.fire.setFog(c, d); };
    world.onFogChange = this.fogHook; this.fogHook(world.fogColor || new THREE.Color(0xcad9e8), world.scene.fog.density);
    this.protos = new Map();
  }

  async preload() {
    for (const t of ENEMY_TYPES) { const a = await createAircraft(t); this.protos.set(t, a); }
  }

  reset(cfg) {
    for (const e of this.enemies) this.scene.remove(e.api.root);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.enemies = []; this.bullets = []; this.missiles = []; this.flares = [];
    this.kills = 0; this.wave = 0; this.waveTimer = 2; this.shots = 0; this.hits = 0;
    this.ammo = cfg.weapons ? 600 : 0; this.missileAmmo = cfg.weapons ? 6 : 0; this.flareAmmo = cfg.weapons ? 24 : 12;
    this.lock = { target: null, t: 0, locked: false };
  }

  setPlayer(model) {
    const p = this.player, m = model;
    p.pos.set(m.pos.x, m.pos.y, m.pos.z);
    p.vel.set(m.vel.x, m.vel.y, m.vel.z);
    p.fwd.set(m.forward.x, m.forward.y, m.forward.z);
    p.up.set(m.up.x, m.up.y, m.up.z);
    p.speed = p.vel.length();
    p.alive = !m.crashed;
  }

  // ---------- effects ----------
  explode(pos, size = 40, big = true) {
    const f = this.fire, s = this.smoke;
    f.spawn(pos.x, pos.y, pos.z, 0, 0, 0, size * 0.5, size * 2.6, 0.22, 1, 0.95, 0.8, 1.0, 0, 0);
    for (let i = 0; i < (big ? 16 : 7); i++) {
      const v = size * rnd(0.4, 1.4);
      f.spawn(pos.x, pos.y, pos.z, rnd(-1, 1) * v, rnd(-0.6, 1.3) * v, rnd(-1, 1) * v, size * rnd(0.3, 0.6), size * rnd(1.0, 1.9), rnd(0.5, 1.1), 1, rnd(0.45, 0.75), rnd(0.1, 0.25), 0.9, 1.5);
    }
    for (let i = 0; i < (big ? 18 : 8); i++) {
      const v = size * rnd(0.2, 0.9);
      s.spawn(pos.x, pos.y, pos.z, rnd(-1, 1) * v, rnd(-0.2, 1.1) * v, rnd(-1, 1) * v, size * 0.4, size * rnd(2, 3.5), rnd(2.5, 5), 0.18, 0.17, 0.17, 0.75, 0.9, rnd(-0.5, 0.5));
    }
    for (let i = 0; i < (big ? 22 : 8); i++) {
      const v = size * rnd(2, 6);
      f.spawn(pos.x, pos.y, pos.z, rnd(-1, 1) * v, rnd(-1, 1) * v, rnd(-1, 1) * v, 1.2, 0.3, rnd(0.3, 0.9), 1, 0.8, 0.4, 1, 1.5, 0);
    }
    this.audio.explosion(Math.min(1, size / 40));
    const d = pos.distanceTo(this.player.pos);
    this.cb.onShake?.(Math.max(0, 1 - d / 1500) * (big ? 1 : 0.4));
  }

  // ---------- spawning ----------
  spawnWave(diffId) {
    const diff = DIFFICULTY[diffId] || DIFFICULTY.normal;
    this.wave++;
    const n = Math.min(1 + this.wave, 6);
    const p = this.player;
    for (let i = 0; i < n; i++) {
      const type = ENEMY_TYPES[(i + this.wave) % ENEMY_TYPES.length];
      const proto = this.protos.get(type); if (!proto) continue;
      const clone = this._cloneAircraft(proto);
      const a = rnd(0, Math.PI * 2), r = rnd(4500, 8000);
      const ground = Math.max(0, p.pos.y - 1200);
      const pos = new THREE.Vector3(p.pos.x + Math.cos(a) * r, Math.max(900, p.pos.y + rnd(-400, 600)), p.pos.z + Math.sin(a) * r);
      const dir = new THREE.Vector3(p.pos.x - pos.x, 0, p.pos.z - pos.z).normalize();
      const e = new Enemy(clone, type, diff, pos, dir);
      e.diffId = diffId; e.groundY = 0;
      this.scene.add(clone.root);
      this.enemies.push(e);
    }
    this.cb.onWave?.(this.wave, n);
  }

  _cloneAircraft(proto) {
    const root = proto.root.clone(true);
    const flames = [];
    root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'ConeGeometry' && o.material?.blending === THREE.AdditiveBlending) flames.push(o); });
    const cfg = proto.cfg;
    const api = {
      root, cfg, setGear: () => {}, setAfterburner(level) {
        for (const f of flames) {
          const l = level * (0.85 + 0.3 * Math.random());
          f.material.opacity = Math.min(0.85, level * 0.9);
          f.scale.set(1 + 0.1 * l, l * (cfg.lengthM * 0.34) + 0.01, 1 + 0.1 * l);
          f.position.z = cfg.lengthM * 0.5 + l * cfg.lengthM * 0.17;
          f.visible = level > 0.02;
        }
      },
    };
    // each clone needs its own flame materials
    for (const f of flames) f.material = f.material.clone();
    return api;
  }

  // ---------- player weapons ----------
  fireGun(dt, on) {
    const p = this.player;
    if (!on || this.ammo <= 0 || !p.alive) { this._gunAcc = 0; return; }
    this._gunAcc += dt * 70;
    const n = Math.floor(this._gunAcc); this._gunAcc -= n;
    for (let i = 0; i < n && this.ammo > 0; i++) {
      this.ammo--; this.shots++;
      const spread = 0.0025;
      const dir = _a.copy(p.fwd).add(_b.set(rnd(-1, 1) * spread, rnd(-1, 1) * spread, rnd(-1, 1) * spread)).normalize();
      const jitter = i / Math.max(1, n);
      const b = { pos: p.pos.clone().addScaledVector(p.fwd, 9).addScaledVector(p.vel, -dt * jitter), prev: new THREE.Vector3(), vel: p.vel.clone().addScaledVector(dir, 1050), life: 2.1, owner: 'p' };
      b.prev.copy(b.pos);
      this.bullets.push(b);
    }
    if (performance.now() - this._gunSnd > 70) { this._gunSnd = performance.now(); this.audio.gun(); }
  }

  fireMissile() {
    const p = this.player;
    if (!p.alive) return 'dead';
    if (this.missileAmmo <= 0) return 'EMPTY';
    const tgt = this.lock.locked ? this.lock.target : null;
    if (!tgt || !tgt.alive) return 'NO LOCK';
    this.missileAmmo--;
    const side = (this.missileAmmo % 2 ? -1 : 1) * 3.2;
    const right = _a.copy(p.fwd).cross(p.up).normalize();
    const pos = p.pos.clone().addScaledVector(right, side).addScaledVector(p.up, -1.2).addScaledVector(p.fwd, 2);
    this._spawnMissile(pos, p.fwd.clone(), p.vel.clone().addScaledVector(p.fwd, 40), 'p', tgt);
    this.audio.missile();
    this.shots++;
    return 'FOX 2';
  }

  _spawnMissile(pos, fwd, vel, owner, target) {
    const mesh = this.missileMesh.clone(true);
    mesh.position.copy(pos); this.scene.add(mesh);
    const m = { pos: pos.clone(), fwd: fwd.clone().normalize(), speed: vel.length(), vel: vel.clone(), owner, target, age: 0, mesh, dead: false, decoyed: new Set(), trail: 0, lost: false };
    this.missiles.push(m);
    return m;
  }

  dropFlares() {
    const p = this.player;
    if (this.flareAmmo <= 0 || !p.alive) return false;
    this.flareAmmo = Math.max(0, this.flareAmmo - 2);
    for (let i = 0; i < 2; i++) this._spawnFlare(p.pos, p.vel, p.fwd, p.up, 'p');
    this.audio.beep(300, 0.06, 'triangle', 0.1);
    return true;
  }
  _spawnFlare(pos, vel, fwd, up, owner) {
    const right = _a.copy(fwd).cross(up).normalize();
    const f = { pos: pos.clone().addScaledVector(fwd, -8).addScaledVector(up, -2), vel: vel.clone().multiplyScalar(0.92).addScaledVector(right, rnd(-25, 25)).addScaledVector(up, rnd(-30, -8)), life: 5.2, owner };
    this.flares.push(f);
  }

  // ---------- lock-on ----------
  updateLock(dt) {
    const p = this.player, L = this.lock;
    let best = null, bestAng = 1e9;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      _a.copy(e.pos).sub(p.pos); const d = _a.length();
      if (d > 9000 || d < 150) continue;
      const ang = Math.acos(clamp(_a.normalize().dot(p.fwd), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = e; }
    }
    if (L.target && L.target.alive && L.locked) {
      // keep lock while within a wide cone
      _a.copy(L.target.pos).sub(p.pos); const d = _a.length();
      const ang = Math.acos(clamp(_a.normalize().dot(p.fwd), -1, 1));
      if (ang < 1.05 && d < 11000) return;
      L.locked = false; L.t = 0; L.target = null;
    }
    if (best && bestAng < 0.42) {
      if (L.target !== best) { L.target = best; L.t = 0; L.locked = false; }
      L.t += dt;
      if (L.t > 0.35 && !L.locked) { this.audio.lockTone(); }
      if (L.t > 1.1) { L.locked = true; this.audio.lockedTone(); }
    } else { L.t = Math.max(0, L.t - dt * 2); if (L.t <= 0) { L.target = null; L.locked = false; } }
  }
  cycleTarget() {
    const alive = this.enemies.filter((e) => e.alive);
    if (!alive.length) return;
    this.targetCycle = (this.targetCycle + 1) % alive.length;
    this.lock.target = alive[this.targetCycle]; this.lock.locked = false; this.lock.t = 0.5;
  }

  incomingMissile() {
    let best = null, bd = 1e9;
    for (const m of this.missiles) {
      if (m.owner !== 'e' || m.dead || m.target !== 'player') continue;
      const d = m.pos.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { m: best, dist: bd } : null;
  }

  _missileThreat(e) {
    let best = null, bd = 3500;
    for (const m of this.missiles) {
      if (m.owner !== 'p' || m.dead || m.target !== e) continue;
      const d = m.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = m; }
    }
    return best ? { m: best, dist: bd } : null;
  }

  // ---------- update ----------
  update(dt, diffId, mode) {
    this.t += dt;
    const p = this.player;
    // waves
    if (this.active && mode === 'dogfight') {
      const alive = this.enemies.some((e) => e.alive || e.dying > 0);
      if (!alive) { this.waveTimer -= dt; if (this.waveTimer <= 0) { this.spawnWave(diffId); this.waveTimer = 5; } }
    }
    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive) this._enemyAI(e, dt);
      else {
        e.dying -= dt; this._dying(e, dt);
        if (e.dying <= 0) { this.scene.remove(e.api.root); this.enemies.splice(i, 1); }
      }
    }
    this._bullets(dt);
    this._missiles(dt);
    this._flares(dt);
    this.smoke.update(dt); this.fire.update(dt);
    // tracers
    const tb = this.tracers; let n = 0;
    for (const b of this.bullets) { if (n >= 900) break; tb.offset[n * 3] = b.pos.x; tb.offset[n * 3 + 1] = b.pos.y; tb.offset[n * 3 + 2] = b.pos.z; tb.size[n] = b.owner === 'p' ? 5.5 : 5; tb.color[n * 4] = 1; tb.color[n * 4 + 1] = b.owner === 'p' ? 0.85 : 0.35; tb.color[n * 4 + 2] = b.owner === 'p' ? 0.35 : 0.25; tb.color[n * 4 + 3] = 1; tb.rot[n] = 0; n++; }
    tb.commit(n);
    // player ram
    if (p.alive) for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.pos.distanceToSquared(p.pos) < 22 * 22) { this.explode(e.pos, 50); this._kill(e, true); this.cb.onPlayerHit?.(1000, 'collision'); }
    }
    if (this.active) this.updateLock(dt);
  }

  _enemyAI(e, dt) {
    const p = this.player, diff = e.diff;
    const toP = _a.copy(p.pos).sub(e.pos); const dist = toP.length(); e.dist = dist;
    const toPn = _b.copy(toP).multiplyScalar(1 / Math.max(dist, 1));
    const cosAim = e.fwd.dot(toPn);
    const tLead = clamp(dist / (e.speed + 300), 0, 2.5) * 0.85;
    const tgt = _c.copy(p.pos).addScaledVector(p.vel, tLead);
    const want = new THREE.Vector3().copy(tgt).sub(e.pos).normalize();

    // ground sampling (staggered)
    e.gT -= dt;
    if (e.gT <= 0) { e.gT = 0.9 + Math.random() * 0.4; e.groundY = this.world.groundHeight(e.pos.x, e.pos.z, e.groundY); }
    const agl = e.pos.y - e.groundY;

    // state machine
    e.stateT -= dt;
    const thr = this._missileThreat(e);
    if (thr && thr.dist < 2600) { e.state = 'evade'; e.stateT = 1.2; e.threat = thr; }
    else if (e.state === 'evade' && e.stateT <= 0) e.state = 'attack';
    if (e.state === 'attack' && dist < 450 && cosAim < 0.2) { e.state = 'extend'; e.stateT = 2.6 + Math.random(); }
    if (e.state === 'extend' && e.stateT <= 0) e.state = 'attack';

    let desired = want;
    if (e.state === 'evade' && e.threat) {
      const md = _d.copy(e.threat.m.pos).sub(e.pos).normalize();
      const side = _r.copy(md).cross(UP).normalize().multiplyScalar(Math.sin(this.t * 0.9 + e.seed) > 0 ? 1 : -1);
      desired = new THREE.Vector3().copy(side).addScaledVector(UP, -0.25).normalize();
      if (e.flareCd <= 0 && e.flares > 0 && thr && thr.dist < 1800 && Math.random() < dt * 4) {
        e.flares--; e.flareCd = 0.35;
        this._spawnFlare(e.pos, e.vel, e.fwd, e.up, 'e');
      }
    } else if (e.state === 'extend') {
      desired = new THREE.Vector3().copy(e.fwd).addScaledVector(UP, 0.18).normalize();
    }
    e.flareCd -= dt;
    // ground / ceiling avoidance
    if (agl < 300 || e.pos.y < 120) {
      const k = clamp((300 - Math.min(agl, e.pos.y)) / 300, 0, 1);
      desired = new THREE.Vector3().copy(desired).lerp(new THREE.Vector3(e.fwd.x, 0.9, e.fwd.z).normalize(), Math.min(1, k * 1.6)).normalize();
    }
    if (e.pos.y > 11000) desired.y = Math.min(desired.y, -0.1);

    // turn limited by G
    const ang = Math.acos(clamp(e.fwd.dot(desired), -1, 1));
    const gMax = diff.turnG * (e.state === 'evade' ? 1.15 : 1);
    const rate = gMax * G / Math.max(e.speed, 120);
    const step = Math.min(ang, rate * dt);
    if (ang > 1e-4) { _d.copy(e.fwd).cross(desired); if (_d.lengthSq() < 1e-9) _d.set(0, 1, 0); _d.normalize(); e.fwd.applyAxisAngle(_d, step).normalize(); }
    // speed
    const base = (e.state === 'extend' ? 300 : 245) * diff.speed;
    const target = base * (1 - 0.28 * Math.min(1, ang / 1.0));
    e.speed += clamp(target - e.speed, -26 * dt, 16 * dt);
    // bank
    const right = _r.copy(e.fwd).cross(UP).normalize();
    const lat = _d.copy(desired).sub(_a.copy(e.fwd).multiplyScalar(e.fwd.dot(desired)));
    const sgn = Math.sign(lat.dot(right)) || 0;
    const bankT = sgn * Math.min(1.3, (step / Math.max(dt, 1e-3)) * e.speed / G * 0.95);
    e.bank += (bankT - e.bank) * Math.min(1, dt * 3);
    const up0 = _a.copy(right).cross(e.fwd).normalize();
    e.up.copy(up0).multiplyScalar(Math.cos(e.bank)).addScaledVector(right, Math.sin(e.bank)).normalize();
    e.vel.copy(e.fwd).multiplyScalar(e.speed);
    e.pos.addScaledVector(e.vel, dt);
    e._applyOrientation(dt);
    e.api.setAfterburner(e.state === 'extend' || e.speed > base * 0.97 ? 0.8 : 0.25);

    // weapons
    if (e.state !== 'evade' && p.alive) {
      e.gunCd -= dt;
      const aimErr = Math.acos(clamp(e.fwd.dot(toPn), -1, 1));
      if (e.burst > 0) {
        e.burst -= dt;
        e._acc = (e._acc || 0) + dt * 18; const n = Math.floor(e._acc); e._acc -= n;
        for (let i = 0; i < n; i++) {
          const sp = (1 - diff.gunAcc) * 0.022 + 0.002;
          const dir = _a.copy(e.fwd).add(_b.set(rnd(-1, 1) * sp, rnd(-1, 1) * sp, rnd(-1, 1) * sp)).normalize();
          const b = { pos: e.pos.clone().addScaledVector(e.fwd, 12), prev: new THREE.Vector3(), vel: e.vel.clone().addScaledVector(dir, 1000), life: 1.6, owner: 'e' };
          b.prev.copy(b.pos); this.bullets.push(b);
        }
        if (dist < 3000 && Math.random() < dt * 14) this.audio.noiseBurst(0.04, 1500, 0.06 * clamp(1 - dist / 3000, 0.1, 1), 1, 'bandpass');
      } else if (e.gunCd <= 0 && dist < 1050 && aimErr < 0.06) { e.burst = 0.7; e.gunCd = rnd(1.6, 2.8); }
      e.missCd -= dt;
      if (e.missCd <= 0 && e.missiles > 0 && dist > 1300 && dist < 6500 && aimErr < 0.38) {
        e.missiles--; e.missCd = diff.fireGap + rnd(0, 6);
        this._spawnMissile(e.pos.clone().addScaledVector(e.fwd, 6), e.fwd.clone(), e.vel.clone().addScaledVector(e.fwd, 40), 'e', 'player');
        this.cb.onMissileLaunch?.(dist);
      }
    }
  }

  damageEnemy(e, dmg, byPlayer = true) {
    if (!e.alive) return;
    e.hp -= dmg;
    if (e.hp <= 0) this._kill(e, byPlayer);
  }
  _kill(e, byPlayer) {
    if (!e.alive) return;
    e.alive = false; e.dying = 2.2 + Math.random() * 0.8; e.spin = rnd(-2.5, 2.5);
    this.explode(e.pos, 28, false);
    if (byPlayer) { this.kills++; this.cb.onKill?.(e); }
    if (this.lock.target === e) { this.lock = { target: null, t: 0, locked: false }; }
  }
  _dying(e, dt) {
    // tumble & fall with fire/smoke trail, explode at end
    e.speed *= 1 - dt * 0.1;
    e.fwd.y -= dt * 0.55; e.fwd.normalize();
    e.vel.copy(e.fwd).multiplyScalar(e.speed); e.vel.y -= 30 * (2.6 - Math.max(0, e.dying));
    e.pos.addScaledVector(e.vel, dt);
    e.bank += e.spin * dt;
    const right = _r.copy(e.fwd).cross(UP).normalize();
    const up0 = _a.copy(right).cross(e.fwd).normalize();
    e.up.copy(up0).multiplyScalar(Math.cos(e.bank)).addScaledVector(right, Math.sin(e.bank)).normalize();
    e._applyOrientation(dt);
    this.smoke.spawn(e.pos.x, e.pos.y, e.pos.z, rnd(-3, 3), rnd(-3, 3), rnd(-3, 3), 6, 26, 3.2, 0.12, 0.11, 0.11, 0.8, 0.5, 0.3);
    this.fire.spawn(e.pos.x, e.pos.y, e.pos.z, rnd(-3, 3), rnd(-3, 3), rnd(-3, 3), 12, 5, 0.35, 1, 0.55, 0.15, 0.9, 0.8, 0);
    if (e.dying <= 0) this.explode(e.pos, 60);
  }

  _bullets(dt) {
    const p = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prev.copy(b.pos);
      b.vel.y -= 6 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && b.owner === 'p') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (segHitSphere(b.prev, b.pos, e.pos, e.radius)) {
            this.hits++; this.damageEnemy(e, 7 * (100 / e.maxHp) * (e.maxHp / 100), true);
            this.fire.spawn(b.pos.x, b.pos.y, b.pos.z, rnd(-8, 8), rnd(-8, 8), rnd(-8, 8), 4, 1, 0.25, 1, 0.8, 0.4, 1, 1, 0);
            this.audio.hit(); this.cb.onHitMarker?.();
            dead = true; break;
          }
        }
      } else if (!dead && b.owner === 'e' && p.alive) {
        if (segHitSphere(b.prev, b.pos, p.pos, p.radius)) { this.cb.onPlayerHit?.(3.2, 'gun'); this.audio.hit(); dead = true; }
      }
      if (b.pos.y < -40) dead = true;
      if (dead) this.bullets.splice(i, 1);
    }
  }

  _missiles(dt) {
    const p = this.player;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      // target position
      let tp = null, tv = null, targetAlive = false;
      if (m.target === 'player') { tp = p.pos; tv = p.vel; targetAlive = p.alive; }
      else if (m.target && m.target.flare) { tp = m.target.flare.pos; tv = m.target.flare.vel; targetAlive = m.target.flare.life > 0; }
      else if (m.target && m.target.alive) { tp = m.target.pos; tv = m.target.vel; targetAlive = true; }
      if (m.target && !targetAlive) { m.target = null; m.lost = true; }
      // seeker / decoy
      if (tp && m.age > 0.6) {
        const toT = _a.copy(tp).sub(m.pos); const d = toT.length(); toT.multiplyScalar(1 / Math.max(d, 1));
        const off = Math.acos(clamp(toT.dot(m.fwd), -1, 1));
        if (off > 0.9 && d > 120) { m.target = null; m.lost = true; tp = null; }       // gimbal limit
        else {
          for (const f of this.flares) {
            if (m.decoyed.has(f)) continue;
            const fd = f.pos.distanceTo(m.pos);
            if (fd > d * 1.6 + 200) continue;
            const fo = Math.acos(clamp(_b.copy(f.pos).sub(m.pos).normalize().dot(m.fwd), -1, 1));
            if (fo > 0.6) continue;
            m.decoyed.add(f);
            const chance = f.owner === 'p' ? 0.55 : 0.4 + 0.2 * (m.owner === 'p' && m.target && m.target.diff ? m.target.diff.flare : 0);
            if (Math.random() < chance) { m.target = { flare: f }; tp = f.pos; tv = f.vel; this.cb.onDecoy?.(m); break; }
          }
        }
      }
      // propulsion
      const burn = m.age < 5.5;
      if (burn) m.speed = Math.min(760, m.speed + 190 * dt); else m.speed = Math.max(0, m.speed - 55 * dt);
      // guidance (lead pursuit w/ turn limit)
      if (tp) {
        const d = m.pos.distanceTo(tp); const t = d / Math.max(m.speed, 150);
        const aim = _c.copy(tp).addScaledVector(tv, t * 0.9).sub(m.pos).normalize();
        const ang = Math.acos(clamp(m.fwd.dot(aim), -1, 1));
        const rate = (m.owner === 'p' ? 34 : 24) * G / Math.max(m.speed, 150);
        const step = Math.min(ang, rate * dt * (burn ? 1 : 0.6));
        if (ang > 1e-4) { _d.copy(m.fwd).cross(aim); if (_d.lengthSq() > 1e-9) { _d.normalize(); m.fwd.applyAxisAngle(_d, step).normalize(); } }
      } else { m.fwd.y -= dt * 0.03; m.fwd.normalize(); }
      m.vel.copy(m.fwd).multiplyScalar(m.speed);
      m.vel.y -= 4 * dt;
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      _m.lookAt(_a.set(0, 0, 0), _b.copy(m.fwd), UP);
      m.mesh.quaternion.setFromRotationMatrix(_m);
      // trail
      m.trail += dt;
      if (m.trail > 0.012) {
        m.trail = 0;
        const back = _a.copy(m.pos).addScaledVector(m.fwd, -2.5);
        this.smoke.spawn(back.x, back.y, back.z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), 1.2, burn ? 7 : 4.5, burn ? 3.4 : 2.0, 0.9, 0.9, 0.9, burn ? 0.55 : 0.3, 0.3, 0.2);
        if (burn) this.fire.spawn(back.x, back.y, back.z, 0, 0, 0, 3.4, 1.4, 0.07, 1, 0.75, 0.35, 1, 0, 0);
      }
      // fuze / impact
      let boom = false, hitPlayer = false, hitEnemy = null;
      if (tp && m.target) {
        const d = m.pos.distanceTo(tp);
        if (m.target === 'player' && d < 24) { boom = true; hitPlayer = true; }
        else if (m.target && m.target.flare && d < 15) boom = true;
        else if (m.target && m.target.alive && d < 22) { boom = true; hitEnemy = m.target; }
      }
      // proximity to other enemies/player of opposite owner
      if (!boom && m.owner === 'p') for (const e of this.enemies) { if (e.alive && e.pos.distanceToSquared(m.pos) < 15 * 15) { boom = true; hitEnemy = e; break; } }
      if (!boom && m.owner === 'e' && p.alive && p.pos.distanceToSquared(m.pos) < 20 * 20) { boom = true; hitPlayer = true; }
      if (m.pos.y < -30 || m.age > 24 || (!burn && m.speed < 140)) { this.explode(m.pos, 14, false); boom = false; m.dead = true; }
      if (boom) {
        this.explode(m.pos, hitPlayer || hitEnemy ? 36 : 22, true);
        if (hitPlayer) this.cb.onPlayerHit?.(48 + rnd(0, 12), 'missile');
        if (hitEnemy) { this.hits++; this.damageEnemy(hitEnemy, 120, true); this.cb.onHitMarker?.(); }
        m.dead = true;
      }
      if (m.dead) { this.scene.remove(m.mesh); this.missiles.splice(i, 1); }
    }
  }

  _flares(dt) {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt; f.vel.multiplyScalar(Math.exp(-0.5 * dt)); f.vel.y -= 6 * dt;
      f.pos.addScaledVector(f.vel, dt);
      this.fire.spawn(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 7 + rnd(0, 3), 6, 0.06, 1, 0.9, 0.7, 1, 0, 0);
      if (Math.random() < dt * 40) this.smoke.spawn(f.pos.x, f.pos.y, f.pos.z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), 1.5, 5, 2.2, 0.9, 0.9, 0.9, 0.35, 0.5, 0.1);
      if (f.life <= 0) this.flares.splice(i, 1);
    }
  }
}
