// FlightModel: 6-DOF-ish jet physics (thrust, drag, lift, gravity, stall, wheels/runway contact).
// Pure JS (no three.js) so it can be unit-tested with plain Node. World frame = three.js frame:
//   +X right, +Y up, -Z forward at start. Body frame: x right, y up, z back (forward = -z).
// Control law: fly-by-wire "alpha command" (stick = g demand) like a modern fighter, with
// feed-forward so the nose follows the flight path, plus stall / low-speed nose drop.
import { V3, Q4, clamp, lerp, smoothstep, DEG } from './math.js';
import { KT, FPM } from './config.js';

export const G = 9.80665;

export function isa(hMSL) {
  const h = Math.max(-500, hMSL);
  let T, rho;
  if (h < 11000) {
    T = 288.15 - 0.0065 * h;
    rho = 1.225 * Math.pow(T / 288.15, 4.2559);
  } else {
    T = 216.65;
    rho = 0.3639 * Math.exp(-(h - 11000) / 6341.6);
  }
  return { rho, a: Math.sqrt(1.4 * 287.05 * T) };
}

const FIXED_DT = 1 / 120;

export class FlightModel {
  constructor(cfg, opts = {}) {
    this.cfg = cfg;
    this.groundMSL = opts.groundMSL ?? 0;      // MSL height of world y = 0
    this.fuelBurnScale = opts.fuelBurnScale ?? 0.4;
    this.assist = opts.assist ?? true;          // auto-level + coordinated turns
    this.wind = new V3(0, 0, 0);

    this.pos = new V3(); this.vel = new V3(); this.q = new Q4(); this.w = new V3();
    this.acc = new V3();                         // total acceleration incl. gravity (m/s^2)
    this.groundY = 0;                            // terrain height under the aircraft (world y)

    // controls
    this.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    this.gearDown = true; this.gearPos = 1;
    this.flapsTarget = 0; this.flapsPos = 0;
    this.airbrake = false; this.airbrakePos = 0;
    this.wheelBrake = false; this.parkingBrake = true;

    // engine / fuel
    this.thrustState = 0;                        // sea-level static N (spooled)
    this.fuel = cfg.fuelKg;
    this.afterburner = false;

    // wheels (body coordinates)
    const gh = cfg.gearHeight;
    const loadNose = cfg.main / (cfg.main - cfg.nose);           // nose static load share
    this.wheels = [
      { r: new V3(0, -gh, cfg.nose), share: loadNose, nose: true },
      { r: new V3(-cfg.track / 2, -gh, cfg.main), share: (1 - loadNose) / 2, nose: false },
      { r: new V3(cfg.track / 2, -gh, cfg.main), share: (1 - loadNose) / 2, nose: false },
    ];
    const L = cfg.lengthM, b = cfg.span;
    this.hull = [
      new V3(0, 0.1, -L * 0.5), new V3(0, 0.3, L * 0.5),
      new V3(-b / 2, 0.2, L * 0.12), new V3(b / 2, 0.2, L * 0.12),
      new V3(0, cfg.gearHeight * 0.9, L * 0.32),
    ];
    this.bellyPt = new V3(0, -gh * 0.55, 0);
    this.Ipitch = 0.30 * cfg.massKg * Math.pow(0.17 * L, 2) * 1.0;
    this.Iroll = 0.30 * cfg.massKg * Math.pow(0.12 * b, 2);
    this.Iyaw = this.Ipitch * 1.1;

    // telemetry / state flags
    this.onGround = true; this.wasOnGround = true; this.groundTime = 0;
    this.crashed = false; this.crashReason = '';
    this.stalling = false; this.overG = false; this.overspeed = false;
    this.landing = null;           // {fpm, text, quality}
    this.justLanded = false;
    this.events = [];              // 'touchdown', 'liftoff', 'crash'
    this.phase = 'PARKED';
    this.t = 0;
    this._acc = 0;
    this.tele = {};
    this._tmp = { a: new V3(), b: new V3(), c: new V3(), d: new V3() };
    this.resetOnRunway(0);
  }

  get mass() { return this.cfg.massKg - (this.cfg.fuelKg - this.fuel); }
  get stallDeg() { return this.cfg.stallDeg; }

  resetOnRunway(z = 0) {
    const c = this.cfg;
    this.pos.set(0, c.gearHeight - 0.25 + this.groundY, z);
    this.vel.set(0, 0, 0); this.q = new Q4(); this.w.set(0, 0, 0);
    this.gearDown = true; this.gearPos = 1; this.flapsTarget = 0.5; this.flapsPos = 0.5;
    this.parkingBrake = true; this.wheelBrake = false; this.thrustState = 0; this.input.throttle = 0;
    this.fuel = c.fuelKg; this.crashed = false; this.crashReason = ''; this.landing = null;
    this.onGround = true; this.wasOnGround = true; this.groundTime = 0; this.phase = 'PARKED'; this.justLanded = false;
    this.acc.set(0, 0, 0);
  }

  resetAirborne(altAgl = 1500, speedKt = 380, heading = new V3(0, 0, -1)) {
    const c = this.cfg;
    this.pos.set(0, this.groundY + altAgl, 0);
    this.q = Q4.lookAlong(heading);
    this.vel = heading.clone().normalize().scale(speedKt * KT);
    this.w.set(0, 0, 0);
    this.gearDown = false; this.gearPos = 0; this.flapsTarget = 0; this.flapsPos = 0;
    this.parkingBrake = false; this.wheelBrake = false;
    this.input.throttle = 0.7; this.thrustState = c.thrustMil * 0.7;
    this.fuel = c.fuelKg; this.crashed = false; this.crashReason = ''; this.landing = null;
    this.onGround = false; this.wasOnGround = false; this.phase = 'CRUISE';
    this.acc.set(0, 0, 0);
  }

  // ---- toggles --------------------------------------------------------------------------
  toggleGear() { if (this.onGround && this.gearDown) return false; this.gearDown = !this.gearDown; return true; }
  cycleFlaps() { this.flapsTarget = this.flapsTarget >= 1 ? 0 : this.flapsTarget + 0.5; }
  setAirbrake(on) { this.airbrake = on; }
  crash(reason) { if (!this.crashed) { this.crashed = true; this.crashReason = reason; this.events.push('crash'); } }

  // ---- main update ----------------------------------------------------------------------
  update(frameDt) {
    if (this.crashed) { this.vel.scale(0.9); this.w.set(0, 0, 0); this._telemetry(); return; }
    this._acc += Math.min(frameDt, 0.1);
    let n = 0;
    while (this._acc >= FIXED_DT && n < 12) { this._step(FIXED_DT); this._acc -= FIXED_DT; n++; }
    if (this._acc > FIXED_DT * 12) this._acc = 0;
    this._telemetry();
  }

  _step(dt) {
    const c = this.cfg, q = this.q, vel = this.vel, pos = this.pos, inp = this.input;
    const T = this._tmp;
    this.t += dt;

    // actuators
    this.gearPos = clamp(this.gearPos + (this.gearDown ? 1 : -1) * dt * 0.28, 0, 1);
    this.flapsPos += clamp(this.flapsTarget - this.flapsPos, -dt * 0.25, dt * 0.25);
    this.airbrakePos += clamp((this.airbrake ? 1 : 0) - this.airbrakePos, -dt * 1.5, dt * 1.5);
    if (this.parkingBrake && inp.throttle > 0.12) this.parkingBrake = false;

    // atmosphere + air-relative motion
    const hMSL = pos.y - this.groundY + this.groundMSL;
    const { rho, a: sound } = isa(hMSL);
    const mass = this.mass;
    const vAir = T.a.set(vel.x - this.wind.x, vel.y - this.wind.y, vel.z - this.wind.z);
    const V = vAir.length();
    const vb = q.rotateInv(vAir, T.b);
    const alpha = V > 2 ? Math.atan2(-vb.y, -vb.z) : 0;
    const beta = V > 2 ? Math.asin(clamp(vb.x / V, -1, 1)) : 0;
    const qbar = 0.5 * rho * V * V;
    const mach = V / sound;
    const S = c.wingArea;

    // ---- aerodynamics ----
    const flapsLift = (c.flapsLift ?? 0.45) * this.flapsPos;
    const cl0 = c.cL0 + flapsLift;
    const stall = (c.stallDeg - 2 * this.flapsPos) * DEG;
    const slope = (c.cLMax - c.cL0) / (c.stallDeg * DEG);
    let CL;
    const aa = Math.abs(alpha);
    if (aa <= stall) {
      CL = cl0 + slope * alpha;
    } else {
      const peak = cl0 + slope * stall * Math.sign(alpha);
      const over = (aa - stall) / (12 * DEG);
      const k = Math.exp(-1.6 * over);
      CL = peak * k + 0.95 * Math.sin(2 * alpha) * (1 - k);
    }
    CL -= this.airbrakePos * (this.onGround ? 0.45 : 0.08);
    const stallBlend = smoothstep(stall, stall + 12 * DEG, aa);
    let CD = c.cD0 + c.kInd * CL * CL
      + this.gearPos * 0.016 + this.flapsPos * 0.028 + this.airbrakePos * 0.055
      + 0.35 * beta * beta + 1.25 * Math.sin(alpha) * Math.sin(alpha) * stallBlend
      + 0.040 * smoothstep(0.85, 1.1, mach) * (1 - 0.25 * smoothstep(1.2, 2.0, mach));
    this.stalling = aa > stall - 1 * DEG && V > 20;

    // ---- engine ----
    const t = clamp(inp.throttle, 0, 1);
    let cmd;
    if (c.hasAB) {
      const mil = c.thrustMil * (0.04 + 0.96 * clamp(t / 0.88, 0, 1));
      cmd = lerp(mil, c.thrustAB, smoothstep(0.88, 0.93, t));
      this.afterburner = t > 0.9 && this.fuel > 0;
    } else {
      cmd = c.thrustMil * (0.04 + 0.96 * t);
      this.afterburner = false;
    }
    if (this.fuel <= 0) cmd = 0;
    const tau = cmd > this.thrustState ? (c.hasAB ? 1.0 : 2.4) : 0.7;
    this.thrustState += (cmd - this.thrustState) * (1 - Math.exp(-dt / tau));
    const lapse = Math.pow(rho / 1.225, 0.7);
    const ram = 1 + (this.afterburner ? 0.30 : 0.15) * Math.min(mach, 2.0);
    const thrust = this.thrustState * lapse * ram;
    const sfc = (this.afterburner ? 0.20 : (c.hasAB ? 0.075 : 0.058)) / 3600;
    this.fuel = Math.max(0, this.fuel - thrust * sfc * dt * this.fuelBurnScale);

    // ---- forces (world) ----
    const upW = q.rotate(T.c.set(0, 1, 0), new V3());
    const rightW = q.rotate(T.c.set(1, 0, 0), new V3());
    const fwdW = q.rotate(T.c.set(0, 0, -1), new V3());
    const F = new V3();
    if (V > 1) {
      const vHat = vAir.clone().scale(1 / V);
      const liftDir = upW.clone().addScaled(vHat, -upW.dot(vHat));
      if (liftDir.lengthSq() < 1e-6) liftDir.copy(upW); else liftDir.normalize();
      F.addScaled(liftDir, qbar * S * CL);
      F.addScaled(vHat, -qbar * S * CD);
      F.addScaled(rightW, qbar * S * (-0.9 * beta));
    }
    F.addScaled(fwdW, thrust);
    const nonGravAero = F.clone();

    // ---- ground contact ----
    let torque = new V3(); // body-frame torque
    let anyWheel = false, hullHit = false, maxPen = 0;
    const wvel = q.rotate(this.w, new V3());     // angular velocity in world frame
    const gearOK = this.gearPos > 0.85;
    const fwdH = new V3(fwdW.x, 0, fwdW.z);
    if (fwdH.lengthSq() < 1e-4) fwdH.set(upW.x, 0, upW.z);
    fwdH.normalize();
    const g = this.groundY;
    if (pos.y - g < 12) {
      for (const wh of this.wheels) {
        if (!gearOK) break;
        const rW = q.rotate(wh.r, new V3());
        const py = pos.y + rW.y;
        const depth = g - py;
        if (depth <= 0) continue;
        anyWheel = true; maxPen = Math.max(maxPen, depth);
        const vpt = vel.clone().add(wvel.cross(rW));
        const W = mass * G;
        const kW = (W * wh.share) / 0.30;
        const cW = 2 * 0.75 * Math.sqrt(kW * mass * wh.share);
        const N = Math.max(0, kW * Math.min(depth, 1.2) - cW * vpt.y);
        // wheel axes
        let wf = fwdH;
        if (wh.nose) {
          const steer = clamp(inp.yaw * 0.9 + inp.roll * 0.5, -1, 1) * 0.55 / (1 + V / 14);
          const cs = Math.cos(steer), sn = Math.sin(steer);
          wf = new V3(fwdH.x * cs - fwdH.z * sn, 0, fwdH.x * sn + fwdH.z * cs);
        }
        const wr = new V3(-wf.z, 0, wf.x);
        const vLong = vpt.dot(wf), vLat = vpt.dot(wr);
        let mu = 0.022;
        if (!wh.nose && (this.wheelBrake || this.airbrakePos > 0.9 && V < 60)) mu += 0.55;
        if (this.parkingBrake) mu = 1.2;
        const Fl = -mu * N * Math.tanh(vLong / 0.6);
        const Fs = -(wh.nose ? 0.75 : 0.9) * N * Math.tanh(vLat / 0.35);
        const Fw = new V3(wf.x * Fl + wr.x * Fs, N, wf.z * Fl + wr.z * Fs);
        F.add(Fw);
        const Fb = q.rotateInv(Fw, new V3());
        torque.add(wh.r.cross(Fb));
      }
      // hull strikes
      const pts = this.gearDown && gearOK ? this.hull : this.hull.concat([this.bellyPt]);
      for (const hp of pts) {
        const rW = q.rotate(hp, new V3());
        if (pos.y + rW.y < g + 0.05) { hullHit = true; break; }
      }
    }
    this.onGround = anyWheel;

    // touchdown / liftoff events
    if (anyWheel && !this.wasOnGround) {
      const fpm = Math.max(0, -vel.y) / FPM;
      this._touchdown(fpm);
    } else if (!anyWheel && this.wasOnGround && this.groundTime > 0.5 && V > 30) {
      this.events.push('liftoff');
      this.justLanded = false;
    }
    this.groundTime = anyWheel ? this.groundTime + dt : 0;
    this.wasOnGround = anyWheel;

    if (hullHit && !this.crashed) {
      const sink = Math.max(0, -vel.y);
      const spd = Math.hypot(vel.x, vel.z);
      if (spd > 18 || sink > 3.5) this.crash(this.gearPos < 0.85 && spd < 95 ? 'Gear-up landing: belly impact' : 'Crashed into the ground');
      else { // slow scrape: just stop sinking
        pos.y = Math.max(pos.y, g + 0.05 - q.rotate(this.bellyPt, new V3()).y);
        if (vel.y < 0) vel.y = 0;
        vel.scale(1 - 1.2 * dt);
      }
    }

    // ---- integrate linear ----
    F.y -= mass * G;
    this.acc.copy(F).scale(1 / mass);
    vel.addScaled(this.acc, dt);
    pos.addScaled(vel, dt);
    const nonGrav = F.clone(); nonGrav.y += mass * G;

    // ---- control / angular ----
    const Vs = Math.sqrt(2 * mass * G / (Math.max(rho, 0.08) * S * (c.cLMax + flapsLift * 0.9)));
    this.Vs = Vs;
    const Vr = c.rotateKt * KT;
    const eff = smoothstep(0.45 * Vs, 0.95 * Vs, V);
    const effG = anyWheel ? smoothstep(0.82 * Vr, 1.0 * Vr, V) : 1;
    const wCmd = new V3();

    if (!anyWheel) {
      // feed-forward: rotate body with the velocity vector (keeps alpha / beta, follows gravity+lift)
      if (V > 25) {
        const vHat = vAir.clone().scale(1 / V);
        const ffW = vHat.cross(this.acc).scale(1 / V);
        const ffB = q.rotateInv(ffW, new V3());
        const k = smoothstep(25, 60, V);
        wCmd.add(ffB.scale(k));
      }
      // pitch: alpha-command (stick = g demand)
      const sinG = V > 1 ? clamp(vAir.y / V, -1, 1) : 0;
      const cosG = Math.sqrt(1 - sinG * sinG);
      const cosPhiRaw = upW.y / Math.max(0.3, Math.sqrt(Math.max(0.0001, 1 - fwdW.y * fwdW.y)));
      // bank compensation only up to ~70 deg of bank (beyond that, lift would pull the nose to the ground)
      let nzTrim = (this.assist && cosPhiRaw > 0.34) ? clamp(cosG / cosPhiRaw, 0.3, 0.75 * c.maxG) : cosG;
      const pi = clamp(inp.pitch, -1, 1);
      const nzCmd = pi >= 0 ? nzTrim + pi * (c.maxG - nzTrim) : nzTrim + pi * (nzTrim - c.minG);
      const qS = Math.max(qbar * S, 500);
      const clNeed = (nzCmd * mass * G) / qS;
      let aCmd = (clNeed - cl0) / slope;
      aCmd = clamp(aCmd, -stall * 0.6, stall - 3 * DEG);
      const kA = 1 / c.ctrlTau;
      const pitchCap = c.pitchRate;
      const dPitch = clamp(kA * (aCmd - alpha), -pitchCap, pitchCap);
      wCmd.x += dPitch * eff;
      // yaw: weathercock + rudder
      wCmd.y += clamp(-1.5 * kA * beta, -1.5, 1.5) * eff - inp.yaw * c.yawRate * eff;
      // roll: rate command (+ auto-level)
      let rollCmd = -inp.roll * c.rollRate * eff;
      if (this.assist && Math.abs(inp.roll) < 0.06 && Math.abs(fwdW.y) < 0.85) {
        const bank = Math.atan2(-rightW.y, upW.y);     // right-bank positive
        if (Math.abs(bank) < 80 * DEG) rollCmd += clamp(0.9 * bank, -0.4 * c.rollRate, 0.4 * c.rollRate) * eff;
      }
      wCmd.z += rollCmd;
      // stall / low-speed nose drop and wing drop
      const slow = 1 - smoothstep(0.55 * Vs, 0.85 * Vs, V);
      const dep = Math.max(slow, smoothstep(stall + 1 * DEG, stall + 8 * DEG, aa));
      if (dep > 0) {
        wCmd.x = lerp(wCmd.x, -0.7 * Math.sign(alpha || 1) , dep);
        wCmd.z += 0.35 * dep * Math.sin(this.t * 2.1);
      }
      const tauR = Math.max(0.05, c.ctrlTau);
      const a = 1 - Math.exp(-dt / tauR);
      this.w.x += (wCmd.x - this.w.x) * a;
      this.w.y += (wCmd.y - this.w.y) * a;
      this.w.z += (wCmd.z - this.w.z) * a;
    } else {
      // on wheels: attitude is decided by the gear springs; only rotation (pitch) is commanded
      this.w.x += (torque.x / this.Ipitch) * dt;
      this.w.z += (torque.z / this.Iroll) * dt;
      this.w.y += (torque.y / this.Iyaw) * dt;
      if (effG > 0) {
        // elevator moment: rotate the nose about the main wheels at Vr
        const pi = clamp(inp.pitch, -1, 1);
        const pitchDeg = Math.asin(clamp(fwdW.y, -1, 1)) / DEG;
        let acc = pi * effG * (1 / c.ctrlTau);
        if ((pitchDeg > 13 || this.w.x > 0.18) && acc > 0) acc = 0;     // tail-strike / rate protection
        if (pitchDeg < -2 && acc < 0) acc = 0;
        this.w.x += acc * dt;
      }
      const damp = Math.exp(-dt * 1.5);
      this.w.x *= damp; this.w.z *= damp; this.w.y *= Math.exp(-dt * 0.8);
      const lim = 1.0;
      this.w.x = clamp(this.w.x, -lim, lim); this.w.y = clamp(this.w.y, -lim, lim); this.w.z = clamp(this.w.z, -lim, lim);
    }
    q.integrateBody(this.w.x, this.w.y, this.w.z, dt);

    // load factor & limits
    const nz = nonGrav.dot(upW) / (mass * G);
    this.nz = nz;
    this.overG = nz > c.maxG * 1.05 || nz < c.minG * 1.05;
    this.overspeed = mach > 2.6;
    if (!anyWheel && (nz > c.maxG * 1.6 || nz < c.minG * 1.8)) this.crash('Airframe overstress (G-limit exceeded)');
    this._last = { alpha, beta, qbar, mach, V, CL, CD, rho, thrust, hMSL };

    // phase
    this._updatePhase(V);
  }

  _touchdown(fpm) {
    const lim = this.cfg.sinkLimitFpm;
    let text, quality;
    if (fpm < 150) { text = 'Butter landing'; quality = 3; }
    else if (fpm < 350) { text = 'Smooth landing'; quality = 2; }
    else if (fpm < lim * 0.6) { text = 'Firm landing'; quality = 1; }
    else { text = 'Hard landing'; quality = 0; }
    this.landing = { fpm: Math.round(fpm), text, quality };
    this.justLanded = true;
    this.events.push('touchdown');
    if (fpm > lim) this.crash(`Landing gear collapsed (sink ${Math.round(fpm)} fpm)`);
  }

  _updatePhase(V) {
    const agl = this.pos.y - this.groundY;
    const vr = this.cfg.rotateKt * KT;
    if (this.crashed) { this.phase = 'CRASHED'; return; }
    if (this.onGround) {
      if (V < 1 && this.parkingBrake) this.phase = 'PARKED';
      else if (this.justLanded) this.phase = V < 12 ? 'TAXI' : 'ROLLOUT';
      else if (V < 10 && this.input.throttle < 0.2) this.phase = 'TAXI';
      else if (V < vr * 0.95) this.phase = 'TAKEOFF ROLL';
      else this.phase = 'ROTATE';
    } else if (agl < 60 && this.gearDown && this.vel.y > -1 && V < vr * 1.4) this.phase = 'LIFTOFF';
    else if (this.gearDown && agl < 900 && V < (this.cfg.approachKt + 60) * KT) this.phase = 'APPROACH';
    else this.phase = 'CRUISE';
  }

  _telemetry() {
    const q = this.q, f = q.rotate(new V3(0, 0, -1)), u = q.rotate(new V3(0, 1, 0)), r = q.rotate(new V3(1, 0, 0));
    const last = this._last || { alpha: 0, beta: 0, mach: 0, V: 0 };
    const V = this.vel.length();
    this.tele = {
      speedKt: V / KT,
      machNo: last.mach || 0,
      altAglFt: (this.pos.y - this.groundY) / 0.3048,
      altMslFt: (this.pos.y - this.groundY + this.groundMSL) / 0.3048,
      vsFpm: this.vel.y / FPM,
      pitchDeg: Math.asin(clamp(f.y, -1, 1)) / DEG,
      rollDeg: Math.atan2(-r.y, u.y) / DEG,
      headingRad: Math.atan2(f.x, -f.z),
      aoaDeg: (last.alpha || 0) / DEG,
      nz: this.nz || 1,
      throttle: this.input.throttle,
      fuelKg: this.fuel,
      fuelPct: this.fuel / this.cfg.fuelKg,
      thrustKN: (last.thrust || 0) / 1000,
      afterburner: this.afterburner,
    };
    this.forward = f; this.up = u; this.right = r;
  }
}

