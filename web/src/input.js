// Unified input: keyboard, mouse (camera orbit), gamepad and on-screen touch controls.
import { clamp } from './math.js';

export class Input {
  constructor(settings) {
    this.s = settings;
    this.keys = new Set();
    this.pitch = 0; this.roll = 0; this.yaw = 0;       // smoothed axes -1..1
    this.throttle = 0;                                  // persistent 0..1
    this.fire = false; this.brake = false;
    this.queue = [];                                    // one-shot actions
    this.orbit = { yaw: 0, pitch: 0, dist: 1, drag: false };
    this.touch = { stickId: null, sx: 0, sy: 0, ax: 0, ay: 0, thrId: null, thr: null };
    this.pad = null; this.padPrev = [];
    this.enabled = false;
    this._bind();
  }
  act(a) { this.queue.push(a); }
  drain() { const q = this.queue; this.queue = []; return q; }

  _bind() {
    const onKey = (down) => (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
      if (down) {
        if (this.keys.has(k)) return;
        this.keys.add(k);
        const map = { KeyG: 'gear', KeyF: 'flaps', KeyM: 'missile', Enter: 'missile', KeyX: 'flare', KeyC: 'camera', KeyT: 'targetcam', KeyP: 'pause', Escape: 'pause', KeyH: 'hud', KeyR: 'restart', KeyV: 'airbrake', KeyN: 'nextTarget', KeyJ: 'autolevel' };
        if (map[k]) this.act(map[k]);
      } else this.keys.delete(k);
    };
    addEventListener('keydown', onKey(true));
    addEventListener('keyup', onKey(false));
    addEventListener('blur', () => this.keys.clear());
    const cv = document.getElementById('gl');
    const hud = document.getElementById('hud');
    const target = hud || cv;
    let last = null;
    target.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { this.orbit.drag = true; last = [e.clientX, e.clientY]; target.setPointerCapture?.(e.pointerId); } });
    target.addEventListener('pointermove', (e) => {
      if (!this.orbit.drag || e.pointerType !== 'mouse') return;
      this.orbit.yaw -= (e.clientX - last[0]) * 0.006;
      this.orbit.pitch = clamp(this.orbit.pitch + (e.clientY - last[1]) * 0.005, -1.2, 1.2);
      last = [e.clientX, e.clientY];
    });
    const up = () => { this.orbit.drag = false; };
    target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    target.addEventListener('wheel', (e) => { this.orbit.dist = clamp(this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.5, 3); e.preventDefault(); }, { passive: false });
    this._bindTouch();
  }

  _bindTouch() {
    const zone = document.getElementById('stickZone'); if (!zone) return;
    const knob = document.getElementById('stickKnob'), base = document.getElementById('stickBase');
    const R = 62; const T = this.touch;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      T.stickId = e.pointerId; T.sx = e.clientX; T.sy = e.clientY; T.ax = 0; T.ay = 0;
      base.style.display = 'block'; base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
      knob.style.left = e.clientX + 'px'; knob.style.top = e.clientY + 'px';
      zone.setPointerCapture(e.pointerId); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== T.stickId) return;
      let dx = e.clientX - T.sx, dy = e.clientY - T.sy; const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      T.ax = dx / R; T.ay = dy / R;
      knob.style.left = (T.sx + dx) + 'px'; knob.style.top = (T.sy + dy) + 'px';
    });
    const end = (e) => { if (e.pointerId !== T.stickId) return; T.stickId = null; T.ax = T.ay = 0; base.style.display = 'none'; knob.style.left = '-99px'; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    // throttle slider
    const thr = document.getElementById('thrSlider'), fill = document.getElementById('thrFill');
    if (thr) {
      const set = (e) => { const r = thr.getBoundingClientRect(); this.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); fill.style.height = (this.throttle * 100) + '%'; };
      thr.addEventListener('pointerdown', (e) => { T.thrId = e.pointerId; thr.setPointerCapture(e.pointerId); set(e); e.preventDefault(); });
      thr.addEventListener('pointermove', (e) => { if (e.pointerId === T.thrId) set(e); });
      const te = (e) => { if (e.pointerId === T.thrId) T.thrId = null; };
      thr.addEventListener('pointerup', te); thr.addEventListener('pointercancel', te);
    }
    const bind = (id, fn, hold) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); fn(true); });
      const off = (e) => { el.classList.remove('on'); if (hold) fn(false); };
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    bind('bFire', (d) => { this.touchFire = d; }, true);
    bind('bBrake', (d) => { this.touchBrake = d; }, true);
    bind('bMsl', (d) => d && this.act('missile'));
    bind('bFlare', (d) => d && this.act('flare'));
    bind('bGear', (d) => d && this.act('gear'));
    bind('bFlaps', (d) => d && this.act('flaps'));
    bind('bCam', (d) => d && this.act('camera'));
    bind('bMenu', (d) => d && this.act('pause'));
  }

  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** call once per frame */
  update(dt, onGround) {
    const K = this.keys;
    const kb = (a, b) => (K.has(a) ? 1 : 0) - (K.has(b) ? 1 : 0);
    let tp = kb('ArrowDown', 'ArrowUp') + kb('KeyK', 'KeyI');   // down arrow = pull back = nose up
    let tr = kb('ArrowRight', 'ArrowLeft');
    let ty = kb('KeyD', 'KeyA') + kb('KeyE', 'KeyQ');
    if (this.s.invertPitch) tp = -tp;
    // throttle keys
    const dth = kb('KeyW', 'KeyS') + kb('PageUp', 'PageDown') + (K.has('ShiftLeft') ? 1 : 0) - (K.has('ControlLeft') ? 1 : 0);
    if (dth) this.throttle = clamp(this.throttle + dth * dt * 0.45, 0, 1);
    if (K.has('KeyZ')) this.throttle = 0;
    if (K.has('Digit1')) this.throttle = 0.25; if (K.has('Digit2')) this.throttle = 0.5; if (K.has('Digit3')) this.throttle = 0.75; if (K.has('Digit4')) this.throttle = 1;
    let fire = K.has('Space') || !!this.touchFire;
    let brake = K.has('KeyB') || !!this.touchBrake;

    // touch stick
    const T = this.touch;
    if (T.stickId !== null) {
      tr = clamp(tr + T.ax * 1.2, -1, 1);
      const py = T.ay * (this.s.invertPitch ? -1 : 1);
      tp = clamp(tp + py * 1.2, -1, 1);
    }
    // gamepad
    const p = this._pad();
    if (p) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      tr = clamp(tr + dz(p.axes[0]), -1, 1);
      tp = clamp(tp + dz(p.axes[1]) * (this.s.invertPitch ? -1 : 1), -1, 1);
      ty = clamp(ty + dz(p.axes[2] || 0), -1, 1);
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      this.throttle = clamp(this.throttle + (rt - lt) * dt * 0.6, 0, 1);
      const prev = this.padPrev;
      const pressed = (i) => p.buttons[i]?.pressed && !prev[i];
      if (pressed(1)) this.act('missile'); if (pressed(2)) this.act('flare'); if (pressed(3)) this.act('camera');
      if (pressed(4)) this.act('gear'); if (pressed(5)) this.act('flaps'); if (pressed(9)) this.act('pause');
      fire = fire || !!p.buttons[0]?.pressed; brake = brake || !!p.buttons[10]?.pressed;
      this.padPrev = p.buttons.map((b) => b.pressed);
    }
    const ramp = (cur, tgt, up, down) => { const r = Math.abs(tgt) > Math.abs(cur) || Math.sign(tgt) !== Math.sign(cur) ? up : down; const d = tgt - cur; return cur + clamp(d, -r * dt, r * dt); };
    this.pitch = ramp(this.pitch, tp, 3.2, 5.0);
    this.roll = ramp(this.roll, tr, 3.8, 6.0);
    this.yaw = ramp(this.yaw, ty, 3.0, 5.0);
    this.fire = fire; this.brake = brake;
    // orbit returns to centre when released
    if (!this.orbit.drag) { this.orbit.yaw *= Math.exp(-dt * 2.2); this.orbit.pitch *= Math.exp(-dt * 2.2); }
    const fill = document.getElementById('thrFill'); if (fill) fill.style.height = (this.throttle * 100) + '%';
  }
}
