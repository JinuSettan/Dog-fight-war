// Tiny procedural audio engine (no asset files): engine, wind, gun, missile, explosion, warnings.
export class AudioEngine {
  constructor() { this.ctx = null; this.on = true; this.ready = false; this._beepT = 0; }
  start() {
    if (this.ready) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.55 : 0; this.master.connect(c.destination);
    // noise buffer
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    let b0 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.985 * b0 + 0.015 * w; d[i] = (w * 0.6 + b0 * 6) * 0.5; }
    this.noiseBuf = buf;
    const loopNoise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    // engine rumble
    this.engN = loopNoise(); this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 300;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    this.engN.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master);
    // turbine whine
    this.whine = c.createOscillator(); this.whine.type = 'sawtooth'; this.whine.frequency.value = 200;
    this.whF = c.createBiquadFilter(); this.whF.type = 'bandpass'; this.whF.frequency.value = 900; this.whF.Q.value = 1.5;
    this.whG = c.createGain(); this.whG.gain.value = 0;
    this.whine.connect(this.whF); this.whF.connect(this.whG); this.whG.connect(this.master); this.whine.start();
    // wind
    this.windN = loopNoise(); this.windF = c.createBiquadFilter(); this.windF.type = 'highpass'; this.windF.frequency.value = 900;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    this.windN.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    // afterburner roar
    this.abN = loopNoise(); this.abF = c.createBiquadFilter(); this.abF.type = 'bandpass'; this.abF.frequency.value = 500; this.abF.Q.value = 0.4;
    this.abG = c.createGain(); this.abG.gain.value = 0;
    this.abN.connect(this.abF); this.abF.connect(this.abG); this.abG.connect(this.master);
    this.ready = true;
  }
  setEnabled(v) { this.on = v; if (this.ready) this.master.gain.value = v ? 0.55 : 0; }
  update(throttle, speedMS, ab, onGround, vol = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const th = Math.max(0.05, throttle);
    this.engF.frequency.setTargetAtTime(180 + th * 650, t, 0.1);
    this.engG.gain.setTargetAtTime((0.25 + th * 0.4) * vol, t, 0.1);
    this.whine.frequency.setTargetAtTime(220 + th * 1500, t, 0.15);
    this.whG.gain.setTargetAtTime((0.015 + th * 0.05) * vol, t, 0.15);
    this.windG.gain.setTargetAtTime(Math.min(0.5, (speedMS / 450) * (onGround ? 0.2 : 0.55)) * vol, t, 0.2);
    this.windF.frequency.setTargetAtTime(500 + speedMS * 3, t, 0.2);
    this.abG.gain.setTargetAtTime((ab ? 0.45 : 0) * vol, t, 0.25);
  }
  _env(node, a, peak, d) { const t = this.ctx.currentTime; node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  beep(freq = 880, dur = 0.12, type = 'square', vol = 0.12) {
    if (!this.ready || !this.on) return;
    const c = this.ctx; const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(this.master);
    this._env(g, 0.005, vol, dur); o.start(); o.stop(c.currentTime + dur + 0.05);
  }
  noiseBurst(dur = 0.3, freq = 800, vol = 0.4, q = 0.7, type = 'lowpass') {
    if (!this.ready || !this.on) return;
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); s.connect(f); f.connect(g); g.connect(this.master);
    this._env(g, 0.004, vol, dur); s.start(0, Math.random()); s.stop(c.currentTime + dur + 0.05);
  }
  gun() { this.noiseBurst(0.05, 1800, 0.18, 0.8, 'bandpass'); }
  missile() { this.noiseBurst(0.9, 1200, 0.35, 0.5, 'lowpass'); }
  explosion(vol = 1) { this.noiseBurst(1.5, 260, 0.9 * vol, 0.4, 'lowpass'); this.noiseBurst(0.5, 1200, 0.3 * vol, 0.6, 'lowpass'); }
  hit() { this.noiseBurst(0.12, 2500, 0.25, 1, 'bandpass'); }
  touchdown() { this.noiseBurst(0.25, 500, 0.5, 0.8, 'lowpass'); this.beep(120, 0.15, 'sine', 0.2); }
  lockTone() { this.beep(1400, 0.05, 'sine', 0.08); }
  lockedTone() { this.beep(1900, 0.16, 'sine', 0.1); }
  warn(kind) {
    if (!this.ready || !this.on) return;
    const now = performance.now();
    if (now - this._beepT < (kind === 'missile' ? 230 : 420)) return;
    this._beepT = now;
    if (kind === 'missile') this.beep(1300, 0.1, 'square', 0.12);
    else if (kind === 'stall') { this.beep(520, 0.2, 'sawtooth', 0.1); }
    else if (kind === 'pullup') { this.beep(760, 0.15, 'square', 0.14); }
    else this.beep(900, 0.1, 'square', 0.1);
  }
}
