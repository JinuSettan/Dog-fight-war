// 2D canvas HUD drawn over the WebGL canvas: ladder, FPM, tapes, radar, target boxes, warnings, ILS.
import * as THREE from 'three';
import { fmtDuration } from './route.js';

const GREEN = '#7dffa0', AMBER = '#ffc04a', RED = '#ff5a4a', CYAN = '#7fe8ff';
const DEG = Math.PI / 180;
const FT = 3.28084, KT = 1.943844;

export class Hud {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.msgs = []; this.hitT = 0; this.dmgT = 0; this.flash = 0;
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.visible = true; this.blink = 0;
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight; this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.fs = Math.max(11, Math.min(18, this.H / 46));
  }
  msg(text, kind = 'info', dur = 2.6) {
    this.msgs = this.msgs.filter((m) => m.text !== text);
    this.msgs.push({ text, kind, t: dur, dur });
    if (this.msgs.length > 4) this.msgs.shift();
  }
  hitMarker() { this.hitT = 0.25; }
  damage(a) { this.dmgT = Math.min(1, this.dmgT + a); }

  _proj(x, y, z, cam, out) {
    const v = this._v.set(x, y, z).sub(cam.position);
    const f = this._f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    out.front = v.dot(f) > 0.01;
    v.add(cam.position).project(cam);
    out.x = (v.x * 0.5 + 0.5) * this.W; out.y = (-v.y * 0.5 + 0.5) * this.H;
    return out;
  }

  draw(S, dt) {
    const g = this.g, W = this.W, H = this.H, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    this.blink += dt;
    const blinkOn = Math.floor(this.blink * 3) % 2 === 0;
    for (const m of this.msgs) m.t -= dt;
    this.msgs = this.msgs.filter((m) => m.t > 0);
    this.hitT = Math.max(0, this.hitT - dt); this.dmgT = Math.max(0, this.dmgT - dt * 0.6);

    // damage vignette
    if (this.dmgT > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
      gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,30,20,${0.6 * this.dmgT})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (!S.model || !this.visible) { this._messages(S, blinkOn); return; }
    if (S.cruise || S.cabinView) { this._flightInfo(S, blinkOn); this._messages(S, blinkOn); return; }
    const m = S.model, T = m.tele, cam = S.camera, fs = this.fs;
    g.lineWidth = Math.max(1.2, fs / 9); g.font = `${fs}px ui-monospace, Menlo, Consolas, monospace`;
    g.shadowColor = 'rgba(0,255,120,0.55)'; g.shadowBlur = 4;
    g.strokeStyle = GREEN; g.fillStyle = GREEN; g.textBaseline = 'middle';
    const P = { x: 0, y: 0, front: true };

    // ---- pitch ladder + horizon ----
    const fw = m.forward, h = this._p.set(fw.x, 0, fw.z);
    if (h.lengthSq() < 1e-4) h.set(-Math.sin(T.headingRad || 0), 0, -Math.cos(T.headingRad || 0));
    h.normalize();
    const hx = h.x, hz = h.z;
    const rx = -hz, rz = hx;                                    // horizontal right vector (hx,0,hz) x up
    const R = 3000;
    const drawLadder = (deg, half, gap) => {
      const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
      const bx = cam.position.x + hx * c * R, by = cam.position.y + s * R, bz = cam.position.z + hz * c * R;
      this._proj(bx, by, bz, cam, P); if (!P.front) return null;
      const p0 = { x: P.x, y: P.y };
      this._proj(bx + rx * 120, by, bz + rz * 120, cam, P);
      let dx = P.x - p0.x, dy = P.y - p0.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      if (p0.x < -400 || p0.x > W + 400 || p0.y < -400 || p0.y > H + 400) return null;
      const seg = (a, b) => { g.beginPath(); g.moveTo(p0.x + dx * a, p0.y + dy * a); g.lineTo(p0.x + dx * b, p0.y + dy * b); g.stroke(); };
      seg(gap, half); seg(-gap, -half);
      if (deg !== 0) {
        const tick = deg > 0 ? 7 : -7;                          // end ticks: up for + (down for -)
        g.beginPath(); g.moveTo(p0.x + dx * half, p0.y + dy * half); g.lineTo(p0.x + dx * half - dy * tick, p0.y + dy * half + dx * tick); g.stroke();
        g.beginPath(); g.moveTo(p0.x - dx * half, p0.y - dy * half); g.lineTo(p0.x - dx * half - dy * tick, p0.y - dy * half + dx * tick); g.stroke();
        g.textAlign = 'left'; g.fillText(String(Math.abs(deg)), p0.x + dx * (half + 6) - 4, p0.y + dy * (half + 6));
      }
      return p0;
    };
    g.setLineDash([]);
    drawLadder(0, Math.min(W * 0.35, 260), 70);
    for (let d = 10; d <= 80; d += 10) { drawLadder(d, 70, 28); g.setLineDash([6, 5]); drawLadder(-d, 70, 28); g.setLineDash([]); }

    // ---- boresight + flight path marker ----
    this._proj(m.pos.x + fw.x * 3000, m.pos.y + fw.y * 3000, m.pos.z + fw.z * 3000, cam, P);
    if (P.front) {
      g.beginPath(); g.moveTo(P.x - 14, P.y); g.lineTo(P.x - 5, P.y); g.moveTo(P.x + 5, P.y); g.lineTo(P.x + 14, P.y); g.moveTo(P.x, P.y - 14); g.lineTo(P.x, P.y - 5); g.stroke();
    }
    const sp = m.vel.length();
    if (sp > 8) {
      this._proj(m.pos.x + m.vel.x / sp * 3000, m.pos.y + m.vel.y / sp * 3000, m.pos.z + m.vel.z / sp * 3000, cam, P);
      if (P.front) {
        g.beginPath(); g.arc(P.x, P.y, 9, 0, 7); g.moveTo(P.x - 9, P.y); g.lineTo(P.x - 20, P.y); g.moveTo(P.x + 9, P.y); g.lineTo(P.x + 20, P.y); g.moveTo(P.x, P.y - 9); g.lineTo(P.x, P.y - 17); g.stroke();
      }
    }

    // ---- heading tape ----
    const hd = ((((T.headingRad / DEG) + (S.hdgOff || 0)) % 360) + 360) % 360;
    const tw = Math.min(W * 0.34, 360), tx = W / 2, ty = fs * 2.2;
    g.save(); g.beginPath(); g.rect(tx - tw / 2, 0, tw, ty + fs * 2); g.clip();
    const pxPerDeg = tw / 60;
    for (let d = Math.floor(hd / 5) * 5 - 40; d <= hd + 40; d += 5) {
      const x = tx + (d - hd) * pxPerDeg; const dd = ((d % 360) + 360) % 360;
      g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty + (dd % 10 === 0 ? fs * 0.7 : fs * 0.4)); g.stroke();
      if (dd % 10 === 0) { g.textAlign = 'center'; const lbl = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10).padStart(2, '0'); g.fillText(lbl, x, ty + fs * 1.5); }
    }
    g.restore();
    g.beginPath(); g.moveTo(tx, ty - 2); g.lineTo(tx - 6, ty - 10); g.lineTo(tx + 6, ty - 10); g.closePath(); g.fill();
    g.textAlign = 'center'; g.fillText(String(Math.round(hd) % 360).padStart(3, '0') + '°', tx, ty - fs * 1.3);

    // ---- speed (left) / altitude (right) ----
    const mg = S.touch ? Math.max(84, W * 0.1) : Math.max(16, W * 0.06);
    const lx = mg, rx2 = W - mg, cy = H * 0.5;
    const box = (x, y, w, hh, align, text, color = GREEN) => {
      g.strokeStyle = color; g.fillStyle = color;
      g.strokeRect(x - (align === 'right' ? w : 0), y - hh / 2, w, hh);
      g.textAlign = align === 'right' ? 'right' : 'left'; g.fillText(text, align === 'right' ? x - 6 : x + 6, y);
      g.strokeStyle = GREEN; g.fillStyle = GREEN;
    };
    const lowSpd = T.speedKt < m.cfg.rotateKt * 0.9 && m.onGround;
    g.textAlign = 'left';
    g.fillText('SPD KT', lx, cy - fs * 2.4);
    box(lx, cy, fs * 5.6, fs * 1.9, 'left', String(Math.round(T.speedKt)), m.stalling ? RED : GREEN);
    g.fillText('M ' + T.machNo.toFixed(2), lx, cy + fs * 2.2);
    g.fillText('G ' + T.nz.toFixed(1), lx, cy + fs * 3.6);
    g.fillStyle = Math.abs(T.aoaDeg) > m.cfg.stallDeg - 3 ? AMBER : GREEN;
    g.fillText('AOA ' + T.aoaDeg.toFixed(1) + '°', lx, cy + fs * 5.0); g.fillStyle = GREEN;
    g.fillText('VR ' + Math.round(m.cfg.rotateKt), lx, cy - fs * 3.9);

    const agl = Math.max(0, T.altAglFt), msl = T.altMslFt;
    g.textAlign = 'right';
    g.fillText('ALT FT', rx2, cy - fs * 2.4);
    box(rx2, cy, fs * 6.4, fs * 1.9, 'right', String(Math.round(msl / 10) * 10), GREEN);
    g.textAlign = 'right';
    g.fillStyle = agl < 400 && T.vsFpm < -900 ? RED : GREEN;
    g.fillText('RA ' + (agl < 2500 ? Math.round(agl) : '----'), rx2, cy + fs * 2.2);
    g.fillStyle = GREEN;
    g.fillText('VS ' + Math.round(T.vsFpm / 50) * 50, rx2, cy + fs * 3.6);
    g.fillText('HDG ' + String(Math.round(hd) % 360).padStart(3, '0'), rx2, cy + fs * 5.0);

    // ---- throttle / fuel bars ----
    const bh = fs * 6, bx = lx, by = H - Math.max(16, W * 0.04) - bh - fs * 3.5;
    const bar = (x, label, v, col) => {
      g.strokeStyle = col; g.strokeRect(x, by, fs * 1.0, bh); g.fillStyle = col;
      g.fillRect(x + 2, by + bh - bh * Math.min(1, v) + 1, fs * 1.0 - 4, bh * Math.min(1, v) - 2);
      g.textAlign = 'center'; g.fillText(label, x + fs * 0.5, by + bh + fs * 0.9);
      g.strokeStyle = GREEN; g.fillStyle = GREEN;
    };
    if (!S.touch) {
      bar(bx, 'THR', T.throttle, T.afterburner ? AMBER : GREEN);
      bar(bx + fs * 2.4, 'FUEL', T.fuelPct, T.fuelPct < 0.15 ? RED : GREEN);
    } else {
      g.textAlign = 'left'; g.fillText(`THR ${Math.round(T.throttle * 100)}%${T.afterburner ? ' AB' : ''}`, lx, cy + fs * 6.4);
      g.fillStyle = T.fuelPct < 0.15 ? RED : GREEN; g.fillText(`FUEL ${Math.round(T.fuelPct * 100)}%`, lx, cy + fs * 7.8); g.fillStyle = GREEN;
    }

    // ---- status strip (bottom centre) ----
    g.textAlign = 'center';
    const st = [];
    st.push(m.gearPos > 0.95 ? 'GEAR DN' : m.gearPos < 0.05 ? 'GEAR UP' : 'GEAR ...');
    st.push('FLAP ' + Math.round(m.flapsPos * 100) + '%');
    if (m.airbrakePos > 0.5) st.push('AIRBRAKE');
    if (m.parkingBrake) st.push('PARK BRK'); else if (S.brake && m.onGround) st.push('BRAKES');
    if (T.afterburner) st.push('A/B');
    g.fillText(st.join('  ·  '), W / 2, H - Math.max(14, fs * 1.2) - (S.touch ? fs * 9 : 0));
    g.fillStyle = CYAN; g.fillText(m.phase, W / 2, H - Math.max(14, fs * 1.2) - fs * 1.6 - (S.touch ? fs * 9 : 0)); g.fillStyle = GREEN;

    // ---- weapons ----
    if (S.cfg.weapons) {
      g.textAlign = 'right';
      const wy = H - Math.max(16, W * 0.04) - fs * 3 - (S.touch ? fs * 9 : 0);
      g.fillText(`GUN ${S.combat.ammo}`, rx2, wy);
      g.fillText(`MSL ${S.combat.missileAmmo}`, rx2, wy + fs * 1.5);
      g.fillText(`FLR ${S.combat.flareAmmo}`, rx2, wy + fs * 3);
    }

    // ---- enemies: boxes, arrows, pipper ----
    g.shadowColor = 'rgba(255,60,40,0.6)';
    const combat = S.combat;
    for (const e of combat.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(m.pos);
      this._proj(e.pos.x, e.pos.y, e.pos.z, cam, P);
      const locked = combat.lock.target === e;
      const col = locked && combat.lock.locked ? RED : locked ? AMBER : '#ff8a7a';
      g.strokeStyle = col; g.fillStyle = col;
      const inside = P.front && P.x > 24 && P.x < W - 24 && P.y > 24 && P.y < H - 24;
      if (inside) {
        const sz = Math.max(12, Math.min(34, 5200 / d + 10));
        if (locked && combat.lock.locked) {
          g.setLineDash([]); g.strokeRect(P.x - sz, P.y - sz, sz * 2, sz * 2);
          g.beginPath(); g.moveTo(P.x, P.y - sz - 6); g.lineTo(P.x - 6, P.y - sz - 14); g.lineTo(P.x + 6, P.y - sz - 14); g.closePath(); g.fill();
        } else {
          g.setLineDash([sz * 0.45, sz * 0.8]); g.strokeRect(P.x - sz, P.y - sz, sz * 2, sz * 2); g.setLineDash([]);
        }
        g.textAlign = 'center'; g.fillText((d / 1000).toFixed(1) + 'km', P.x, P.y + sz + fs);
        // enemy hp bar
        const hw = sz * 2 * (e.hp / e.maxHp);
        g.fillRect(P.x - sz, P.y + sz + fs * 1.7, hw, 3);
      } else {
        // edge arrow
        let ax = P.x - W / 2, ay = P.y - H / 2;
        if (!P.front) { ax = -ax; ay = -ay; if (Math.abs(ax) < 1 && Math.abs(ay) < 1) ay = 1; }
        const ang = Math.atan2(ay, ax);
        const rr = Math.min(W, H) * 0.42;
        const ex = W / 2 + Math.cos(ang) * rr * (W / H) * 0.85, ey = H / 2 + Math.sin(ang) * rr;
        g.save(); g.translate(Math.max(30, Math.min(W - 30, ex)), Math.max(40, Math.min(H - 60, ey))); g.rotate(ang);
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-4, 0); g.lineTo(-8, 9); g.closePath(); g.fill(); g.restore();
      }
    }
    // gun pipper for current target
    const tgt = combat.lock.target || combat.enemies.filter((e) => e.alive).sort((a, b) => a.pos.distanceToSquared(m.pos) - b.pos.distanceToSquared(m.pos))[0];
    if (tgt && tgt.alive && S.cfg.weapons) {
      const d = tgt.pos.distanceTo(m.pos);
      if (d < 2200) {
        const t = d / 1050;
        const lx2 = tgt.pos.x + (tgt.vel.x - m.vel.x) * t, ly2 = tgt.pos.y + (tgt.vel.y - m.vel.y) * t + 0.5 * 6 * t * t, lz2 = tgt.pos.z + (tgt.vel.z - m.vel.z) * t;
        this._proj(lx2, ly2, lz2, cam, P);
        if (P.front) {
          g.strokeStyle = AMBER; g.fillStyle = AMBER; g.shadowColor = 'rgba(255,190,60,0.6)';
          g.beginPath(); g.arc(P.x, P.y, 20, 0, 7); g.stroke(); g.beginPath(); g.arc(P.x, P.y, 2, 0, 7); g.fill();
          for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; g.beginPath(); g.moveTo(P.x + Math.cos(an) * 20, P.y + Math.sin(an) * 20); g.lineTo(P.x + Math.cos(an) * 27, P.y + Math.sin(an) * 27); g.stroke(); }
        }
      }
    }
    // incoming missiles on HUD
    g.strokeStyle = AMBER; g.fillStyle = AMBER;
    for (const mm of combat.missiles) {
      if (mm.owner !== 'e' || mm.dead) continue;
      this._proj(mm.pos.x, mm.pos.y, mm.pos.z, cam, P);
      if (P.front && P.x > 10 && P.x < W - 10 && P.y > 10 && P.y < H - 10) {
        g.beginPath(); g.moveTo(P.x, P.y - 12); g.lineTo(P.x + 11, P.y + 9); g.lineTo(P.x - 11, P.y + 9); g.closePath(); g.stroke();
      }
    }
    g.strokeStyle = GREEN; g.fillStyle = GREEN; g.shadowColor = 'rgba(0,255,120,0.55)';

    // ---- radar ----
    if (S.cfg.weapons || combat.enemies.length) this._radar(S, m, combat);

    // ---- ILS ----
    if (S.ils) this._ils(S.ils, W, H, fs);

    // ---- hit marker ----
    if (this.hitT > 0) {
      g.strokeStyle = '#fff'; g.lineWidth = 2.2; const cx = W / 2, c2 = H / 2, k = 12;
      g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(cx + sx * 6, c2 + sy * 6); g.lineTo(cx + sx * k, c2 + sy * k); } g.stroke();
    }

    // ---- top-right: score panel ----
    g.textAlign = 'right'; g.fillStyle = GREEN; g.strokeStyle = GREEN;
    let y = fs * 1.6;
    if (S.airline) {
      g.fillText(`${S.airline.from} > ${S.airline.to}   ${Math.round(S.airline.km)} km`, rx2, y); y += fs * 1.5;
      g.fillStyle = S.airline.comfort < 60 ? RED : S.airline.comfort < 80 ? AMBER : GREEN;
      g.fillText(`PAX ${S.airline.pax}  COMFORT ${Math.round(S.airline.comfort)}%`, rx2, y); y += fs * 1.5; g.fillStyle = GREEN;
    } else if (S.mode === 'dogfight') { g.fillText(`WAVE ${combat.wave}   KILLS ${combat.kills}`, rx2, y); y += fs * 1.5; }
    g.fillText(`SCORE ${S.score}`, rx2, y); y += fs * 1.5;
    // health bar
    const hw = fs * 9; g.strokeRect(rx2 - hw, y - fs * 0.4, hw, fs * 0.8);
    g.fillStyle = S.hp < 30 ? RED : S.hp < 60 ? AMBER : GREEN; g.fillRect(rx2 - hw + 2, y - fs * 0.4 + 2, (hw - 4) * Math.max(0, S.hp) / 100, fs * 0.8 - 4);
    g.fillStyle = GREEN; g.textAlign = 'right'; g.fillText('HP', rx2 - hw - 6, y);
    y += fs * 1.6;
    g.fillStyle = 'rgba(180,255,200,0.8)'; g.font = `${fs * 0.85}px ui-monospace, monospace`;
    g.fillText(`${S.fps | 0} fps · ${S.renderH}p · ${S.tilesLabel}`, rx2, y);
    g.font = `${fs}px ui-monospace, monospace`;

    // ---- warnings ----
    const W2 = [];
    if (S.warn.missile) W2.push(['MISSILE! FLARES!', RED]);
    if (S.warn.pullup) W2.push(['PULL UP', RED]);
    if (S.warn.stall) W2.push(['STALL', RED]);
    if (S.warn.overg) W2.push(['OVER-G', AMBER]);
    if (S.warn.gear) W2.push(['GEAR!', AMBER]);
    if (S.warn.fuel) W2.push(['LOW FUEL', AMBER]);
    if (S.warn.overspeed) W2.push(['OVERSPEED', AMBER]);
    g.shadowBlur = 8; g.textAlign = 'center'; g.font = `bold ${fs * 1.7}px ui-monospace, monospace`;
    W2.forEach(([t, c], i) => { if (blinkOn || c === AMBER) { g.fillStyle = c; g.shadowColor = c; g.fillText(t, W / 2, H * 0.30 + i * fs * 2.2); } });
    g.font = `${fs}px ui-monospace, monospace`;
    if (S.airline && S.airline.canCruise && blinkOn) {
      g.fillStyle = CYAN; g.shadowColor = CYAN; g.textAlign = 'center'; g.font = `bold ${fs * 1.2}px ui-monospace, monospace`;
      g.fillText(`AUTOPILOT  [U]  ->  cruise to ${S.airline.to}`, W / 2, H * 0.22);
    }
    this._messages(S, blinkOn);
  }

  /** cabin / cruise overlay: route card with progress, altitude, speed, ETA */
  _flightInfo(S, blinkOn) {
    const g = this.g, W = this.W, H = this.H, fs = this.fs, A = S.airline; if (!A) return;
    g.save(); g.shadowBlur = 0;
    const pw = Math.min(W * 0.92, fs * 30), x = (W - pw) / 2, y = Math.max(10, fs * 0.8);
    const ph = fs * (A.cruising ? 6.4 : 3.4);
    g.fillStyle = 'rgba(8,14,22,0.66)'; g.strokeStyle = 'rgba(140,200,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x, y, pw, ph, 10); g.fill(); g.stroke();
    g.fillStyle = '#e8f2ff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `800 ${fs * 1.35}px system-ui, sans-serif`;
    g.fillText(`${A.from}  ✈  ${A.to}`, x + fs, y + fs * 1.1);
    g.textAlign = 'right'; g.font = `600 ${fs * 0.95}px system-ui, sans-serif`; g.fillStyle = '#9fd0ff';
    g.fillText(`${A.fromCity} to ${A.toCity}`, x + pw - fs, y + fs * 1.1);
    g.textAlign = 'left'; g.fillStyle = '#cfe6ff'; g.font = `${fs * 0.95}px ui-monospace, monospace`;
    g.fillText(`FL${String(Math.round(A.altM * 3.28084 / 100)).padStart(3, '0')}   ${Math.round(A.speedKmh)} km/h   PAX ${A.pax}`, x + fs, y + fs * 2.6);
    if (A.cruising) {
      const by = y + fs * 4.1, bw = pw - fs * 2;
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + fs, by, bw, fs * 0.5);
      g.fillStyle = '#4cc2ff'; g.fillRect(x + fs, by, bw * Math.max(0, Math.min(1, A.progress)), fs * 0.5);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + fs + bw * Math.max(0, Math.min(1, A.progress)), by + fs * 0.25, fs * 0.45, 0, 7); g.fill();
      g.fillStyle = '#cfe6ff'; g.textAlign = 'left';
      g.fillText(`${Math.round(A.remainingKm)} km to go · ETA ${fmtDuration(A.etaMin)}`, x + fs, y + fs * 5.4);
      g.textAlign = 'right'; g.fillStyle = '#ffd04a';
      g.fillText(`×${Math.round(A.warp)} · [U] skip`, x + pw - fs, y + fs * 2.6);
    }
    g.restore();
    g.textBaseline = 'middle';
  }

  _messages(S, blinkOn) {
    const g = this.g, W = this.W, H = this.H, fs = this.fs;
    g.textAlign = 'center'; g.shadowBlur = 6;
    let y = H * 0.37;
    for (const m of this.msgs) {
      const a = Math.min(1, m.t / 0.5, (m.dur - m.t) / 0.15 + 0.2);
      g.globalAlpha = Math.max(0, Math.min(1, a));
      const col = m.kind === 'good' ? '#8dff9d' : m.kind === 'bad' ? RED : m.kind === 'warn' ? AMBER : '#e6fff0';
      g.fillStyle = col; g.shadowColor = col;
      g.font = `bold ${fs * 1.15}px ui-monospace, monospace`;
      g.fillText(m.text, W / 2, y); y += fs * 1.7;
    }
    g.globalAlpha = 1; g.shadowBlur = 0;
  }

  _radar(S, m, combat) {
    const g = this.g, fs = this.fs;
    const R = Math.max(44, Math.min(78, this.H * 0.1)), cx = R + 14, cy = R + fs * 5.2;
    const range = 12000;
    g.save();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(0,30,12,0.45)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(125,255,160,0.7)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(125,255,160,0.25)'; g.beginPath(); g.arc(cx, cy, R * 0.5, 0, 7); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const f = m.forward; const hl = Math.hypot(f.x, f.z) || 1; const hx = f.x / hl, hz = f.z / hl; const rx = -hz, rz = hx;
    const plot = (p, col, shape) => {
      const dx = p.x - m.pos.x, dz = p.z - m.pos.z;
      let fwd = dx * hx + dz * hz, rt = dx * rx + dz * rz;
      const dd = Math.hypot(fwd, rt); const k = dd > range ? range / dd : 1;
      const px = cx + rt * k / range * R, py = cy - fwd * k / range * R;
      g.fillStyle = col; g.strokeStyle = col;
      if (shape === 'tri') { g.beginPath(); g.moveTo(px, py - 5); g.lineTo(px + 4, py + 4); g.lineTo(px - 4, py + 4); g.closePath(); g.fill(); }
      else { g.beginPath(); g.arc(px, py, 3.2, 0, 7); g.fill(); const dy = p.y - m.pos.y; if (Math.abs(dy) > 300) { g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + (dy > 0 ? -7 : 7)); g.stroke(); } }
    };
    for (const e of combat.enemies) if (e.alive) plot(e.pos, combat.lock.target === e ? '#ffd04a' : '#ff6a5a', 'dot');
    for (const mm of combat.missiles) if (mm.owner === 'e') plot(mm.pos, '#ffc04a', 'tri');
    g.fillStyle = '#7dffa0'; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 4.5, cy + 5); g.lineTo(cx - 4.5, cy + 5); g.closePath(); g.fill();
    g.restore();
  }

  _ils(I, W, H, fs) {
    const g = this.g; const s = fs * 7, cx = W * 0.5 + W * 0.17, cy = H * 0.62;
    g.save(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(125,255,160,0.7)'; g.fillStyle = 'rgba(0,30,12,0.35)';
    g.fillRect(cx - s / 2, cy - s / 2, s, s); g.strokeRect(cx - s / 2, cy - s / 2, s, s);
    g.beginPath(); g.moveTo(cx - s / 2, cy); g.lineTo(cx + s / 2, cy); g.moveTo(cx, cy - s / 2); g.lineTo(cx, cy + s / 2); g.stroke();
    for (const k of [-0.5, 0.5]) { g.beginPath(); g.arc(cx + k * s * 0.5, cy, 2, 0, 7); g.arc(cx, cy + k * s * 0.5, 2, 0, 7); g.stroke(); }
    g.strokeStyle = '#ff7ae8'; g.fillStyle = '#ff7ae8'; g.lineWidth = 3;
    const lx = cx + Math.max(-1, Math.min(1, I.loc)) * s * 0.45, gy = cy - Math.max(-1, Math.min(1, I.gs)) * s * 0.45;
    g.beginPath(); g.moveTo(lx, cy - s * 0.4); g.lineTo(lx, cy + s * 0.4); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.4, gy); g.lineTo(cx + s * 0.4, gy); g.stroke();
    g.fillStyle = '#9fffb2'; g.font = `${fs * 0.8}px ui-monospace, monospace`; g.textAlign = 'center';
    g.fillText(`ILS  ${(I.dist / 1000).toFixed(1)} km`, cx, cy - s / 2 - fs * 0.7);
    g.restore();
  }
}
