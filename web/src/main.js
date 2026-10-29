import * as THREE from 'three';
import { World, RUNWAY_Y } from './world.js';
import { createAircraft } from './models.js';
import { FlightModel } from './physics.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { AIRCRAFT, AIRCRAFT_LIST, AIRPORTS, DIFFICULTY, RESOLUTIONS, TILE_QUALITY, TIMES, KT } from './config.js';
import { loadSettings, saveSettings, isTouch } from './settings.js';
import { V3, Q4, clamp } from './math.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const touchUI = isTouch || /[?&]touch=1/.test(location.search);

const S = loadSettings();
const G = {
  state: 'boot', model: null, ac: null, cfg: null, aircraftId: null,
  world: null, combat: null, hud: null, input: null, audio: new AudioEngine(),
  score: 0, hp: 100, t0: 0, flightTime: 0, shake: 0, camMode: 0, targetCam: false,
  groundT: 0, endT: 0, ended: false, msgT: 0, tookOff: false, landedT: 0, paused: false,
  camPos: new THREE.Vector3(), camQ: new THREE.Quaternion(), lobbyAngle: 0, tab: 'aircraft', fps: 60, frames: 0, fpsT: 0,
  warn: {}, bonusLanding: 0,
};
window.__game = G;                              // handy for debugging / tests
const airportOf = (icao) => AIRPORTS.find((a) => a.icao === icao) || AIRPORTS[0];

// ------------------------------------------------------------------------------------------
async function boot() {
  const note = (t) => { $('bootNote').textContent = t; };
  try {
    note('Starting renderer…');
    G.world = new World($('gl'), S);
    G.hud = new Hud($('hud'));
    G.input = new Input(S);
    G.audio.on = S.sound;
    G.world.scene.add(new THREE.Group());
    note('Loading runway…');
    await G.world.init();
    G.combat = new Combat(G.world, G.audio, {
      onShake: (a) => { G.shake = Math.max(G.shake, a); },
      onPlayerHit: (d, kind) => playerHit(d, kind),
      onHitMarker: () => G.hud.hitMarker(),
      onKill: (e) => { G.score += 100; G.hud.msg('SPLASH ONE  +100', 'good'); },
      onWave: (w, n) => G.hud.msg(`WAVE ${w} — ${n} bandit${n > 1 ? 's' : ''}`, 'warn', 3),
      onMissileLaunch: (d) => { G.hud.msg('MISSILE LAUNCH!', 'bad', 2); },
      onDecoy: () => {},
    });
    note('Loading enemy fighters…');
    await G.combat.preload();
    note('Loading your aircraft…');
    await G.world.setAirport(airportOf(S.airport), S.tune[S.airport] || {});
    await setAircraft(S.aircraft);
    buildLobby();
    showLobby();
    $('boot').classList.add('hidden');
    addEventListener('resize', onResize);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    note('Error: ' + (err && err.message ? err.message : err));
    $('bootNote').style.color = '#ff7a6a';
  }
}

function onResize() { G.world.applyResolution(); G.hud.resize(); }

// ------------------------------------------------------------------------------------------
async function setAircraft(id) {
  const cfg = AIRCRAFT[id] || AIRCRAFT.f15e;
  G.cfg = cfg; G.aircraftId = cfg.id; S.aircraft = cfg.id;
  const ac = await createAircraft(cfg.id);
  if (G.ac) G.world.scene.remove(G.ac.root);
  G.ac = ac; G.world.scene.add(ac.root);
  const m = new FlightModel(cfg, { groundMSL: airportOf(S.airport).elev });
  m.groundY = RUNWAY_Y;
  G.model = m;
  m.assist = S.assist;
  parkOnRunway();
}

function parkOnRunway() {
  const m = G.model, len = G.world.runwayLen || 3000;
  m.groundY = RUNWAY_Y;
  m.groundMSL = airportOf(S.airport).elev;
  m.resetOnRunway(len / 2 - 140);
  syncMesh(0);
}

function syncMesh(dt) {
  const m = G.model, ac = G.ac;
  ac.root.position.set(m.pos.x, m.pos.y, m.pos.z);
  ac.root.quaternion.set(m.q.x, m.q.y, m.q.z, m.q.w);
  ac.setGear(m.gearPos > 0.5);
  const ab = m.afterburner ? 1 : m.input.throttle > 0.3 ? 0.18 * m.input.throttle : 0;
  ac.setAfterburner(ab);
}

// ------------------------------------------------------------------------------------------
// Lobby UI
// ------------------------------------------------------------------------------------------
const TABS = [['aircraft', 'Aircraft'], ['airport', 'Airport'], ['mission', 'Mission'], ['graphics', 'Graphics'], ['controls', 'Controls']];

function statBars(c) {
  const speed = clamp((c.thrustAB / c.massKg) / 14, 0.1, 1);
  const agility = clamp((c.rollRate * 0.6 + c.pitchRate) / 5, 0.1, 1);
  const armor = clamp(c.maxG / 9, 0.1, 1);
  const fire = c.weapons ? 1 : 0.04;
  const row = (n, v) => `<span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
  return `<div class="stats">${row('Speed', speed)}${row('Agility', agility)}${row('Strength', armor)}${row('Firepower', fire)}</div>`;
}

function buildLobby() {
  $('tabs').innerHTML = TABS.map(([id, n]) => `<div class="tab ${G.tab === id ? 'on' : ''}" data-tab="${id}">${n}</div>`).join('');
  $('tabs').onclick = (e) => { const t = e.target.closest('.tab'); if (!t) return; G.tab = t.dataset.tab; buildLobby(); };
  const pane = $('pane');
  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const slider = (name, min, max, step, val, fmt) => `<input type="range" data-sl="${name}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val" data-val="${name}">${fmt(val)}</span>`;

  let html = '';
  if (G.tab === 'aircraft') {
    html = AIRCRAFT_LIST.map((id) => { const c = AIRCRAFT[id]; return `<div class="card ${S.aircraft === id ? 'on' : ''}" data-ac="${id}"><h3><span>${c.name}</span><span style="color:${c.color}">●</span></h3><p>${c.blurb}</p>${statBars(c)}</div>`; }).join('');
  } else if (G.tab === 'airport') {
    html = `<input type="search" id="aptSearch" placeholder="Search airport / city / code…" autocomplete="off">
      <div class="row"><span class="status" id="tileStatus"><i></i><b>…</b></span></div>
      <div id="aptList" style="margin-top:6px"></div>
      <div class="note" style="margin-top:10px"><b>Fine-tune runway</b> — move the virtual runway until it lines up with the real one on the map.</div>
      <div class="row"><label>Along runway</label>${slider('along', -1800, 1800, 10, tune().along, (v) => v + ' m')}</div>
      <div class="row"><label>Sideways</label>${slider('across', -400, 400, 2, tune().across, (v) => v + ' m')}</div>
      <div class="row"><label>Heading</label>${slider('heading', -12, 12, 0.1, tune().heading, (v) => Number(v).toFixed(1) + '°')}</div>
      <div class="row"><label>Ground level</label>${slider('ground', -20, 20, 0.25, tune().ground, (v) => Number(v).toFixed(1) + ' m')}</div>`;
  } else if (G.tab === 'mission') {
    html = `<div class="row"><label>Mode</label>${seg('mode', [['dogfight', 'Dogfight (waves)'], ['free', 'Free flight']], S.mode)}</div>
      <div class="row"><label>Start</label>${seg('start', [['runway', 'Runway'], ['final', 'Final approach'], ['air', 'In the air']], S.start)}</div>
      <div class="row"><label>Difficulty</label>${seg('difficulty', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.name]), S.difficulty)}</div>
      <div class="row"><label>Time of day</label>${seg('time', TIMES.map((t) => [t.id, t.name]), S.time)}</div>
      <div class="note">Runway: hold throttle (W) → at rotate speed pull back (↓) → gear up (G).<br>Final approach: follow the pink ILS cross to the runway, flare gently and brake (B).</div>`;
  } else if (G.tab === 'graphics') {
    html = `<div class="row"><label>Resolution</label><div class="seg" data-seg="resolution">${RESOLUTIONS.map((r) => `<button data-v="${r.id}" class="${S.resolution === r.id ? 'on' : ''}">${r.name}</button>`).join('')}</div></div>
      <div class="row"><label>Map detail</label>${seg('tileQuality', TILE_QUALITY.map((q) => [q.id, q.name]), S.tileQuality)}</div>
      <div class="row"><label>Clouds</label>${slider('clouds', 0, 1, 0.05, S.clouds, (v) => Math.round(v * 100) + '%')}</div>
      <div class="row"><label>Brightness</label>${slider('brightness', 0.6, 1.6, 0.05, S.brightness, (v) => Number(v).toFixed(2))}</div>
      <div class="row"><label>Field of view</label>${slider('fov', 50, 95, 1, S.fov, (v) => v + '°')}</div>
      <div class="row"><label>Sound</label>${seg('sound', [[true, 'On'], [false, 'Off']], S.sound)}</div>
      <div class="row" style="align-items:flex-start"><label>Google Maps<br>Tiles API key</label><div style="flex:1;min-width:200px"><input type="text" id="apiKey" value="${S.apiKey || ''}" placeholder="AIza…" autocomplete="off" spellcheck="false"><div class="row" style="margin:6px 0 0"><button class="btn pri" id="applyKey">Apply key</button><span class="status" id="tileStatus"><i></i><b>…</b></span></div><div class="note">Enable “Map Tiles API” in Google Cloud and paste a key. Without a key the game uses offline demo terrain. 4K needs a strong GPU — use Auto on phones.</div></div></div>`;
  } else if (G.tab === 'controls') {
    html = `<div class="row"><label>Invert pitch</label>${seg('invertPitch', [[false, 'Off'], [true, 'On']], S.invertPitch)}</div>
      <div class="row"><label>Flight assist</label>${seg('assist', [[true, 'On (auto-level)'], [false, 'Off']], S.assist)}</div>
      <div class="keys" style="margin-top:12px">
        <b>↑ / ↓</b><span>Pitch (↓ = pull up, nose up)</span><b>← / →</b><span>Roll / nose-wheel steering</span>
        <b>A / D</b><span>Rudder</span><b>W / S · Shift / Ctrl</b><span>Throttle up / down (above 90% = afterburner)</span>
        <b>Space</b><span>Cannon</span><b>M · Enter</b><span>Fire missile (needs lock: keep target in the cone)</span>
        <b>X</b><span>Flares</span><b>G</b><span>Landing gear</span><b>F</b><span>Flaps</span><b>B</b><span>Wheel brakes (hold)</span><b>V</b><span>Airbrake</span>
        <b>C</b><span>Camera: chase / cockpit / far</span><b>T</b><span>Look at target</span><b>N</b><span>Next target</span><b>H</b><span>HUD on/off</span>
        <b>P / Esc</b><span>Pause</span><b>Mouse drag</b><span>Orbit camera · wheel = zoom</span>
        <b>Touch</b><span>Left stick = pitch/roll, right slider = throttle, buttons for guns, missiles, flares, gear, flaps, brakes</span>
      </div>`;
  }
  pane.innerHTML = html;
  if (G.tab === 'airport') { renderAirports(''); $('aptSearch').oninput = (e) => renderAirports(e.target.value); }
  if (G.tab === 'graphics') $('applyKey').onclick = applyKey;
  updateTileStatus();
}

const tune = () => ({ along: 0, across: 0, heading: 0, ground: 0, ...(S.tune[S.airport] || {}) });

function renderAirports(q) {
  const ql = q.trim().toLowerCase();
  const list = AIRPORTS.filter((a) => !ql || `${a.name} ${a.city} ${a.country} ${a.iata} ${a.icao}`.toLowerCase().includes(ql));
  $('aptList').innerHTML = list.map((a) => `<div class="card ${S.airport === a.icao ? 'on' : ''}" data-apt="${a.icao}"><h3 class="apt"><span>${a.iata} · ${a.name}</span><span>${a.len} m</span></h3><p style="margin:0">${a.city}, ${a.country} · RWY ${String(Math.round(a.hdg / 10)).padStart(2, '0')} · elev ${a.elev} m</p></div>`).join('') || '<div class="note">No airport found</div>';
}

function updateTileStatus() {
  const el = $('tileStatus'); if (!el || !G.world) return;
  const w = G.world; const b = el.querySelector('b');
  el.className = 'status';
  if (w.tilesStatus === 'ok') { el.classList.add('ok'); b.textContent = w.groundCalibrated ? 'Google 3D tiles ON' : 'Google 3D tiles: aligning…'; }
  else if (w.tilesStatus === 'loading') { el.classList.add('load'); b.textContent = 'Connecting to Google tiles…'; }
  else if (w.tilesStatus === 'error') { el.classList.add('err'); b.textContent = 'Tile error: ' + (w.tilesError || '').slice(0, 60); }
  else b.textContent = 'Offline demo terrain (no API key)';
}

function applyKey() {
  S.apiKey = $('apiKey').value.trim(); saveSettings(S);
  G.world.s = S; G.world.setupTiles();
  G.world.setAirport(airportOf(S.airport), tune());
}

// delegated lobby events
document.addEventListener('click', async (e) => {
  const t = e.target;
  const ac = t.closest?.('[data-ac]');
  if (ac) { await setAircraft(ac.dataset.ac); saveSettings(S); buildLobby(); return; }
  const apt = t.closest?.('[data-apt]');
  if (apt) {
    S.airport = apt.dataset.apt; saveSettings(S);
    await G.world.setAirport(airportOf(S.airport), tune());
    parkOnRunway(); renderAirports($('aptSearch')?.value || ''); buildLobby(); return;
  }
  const sg = t.closest?.('[data-seg] button');
  if (sg) {
    const name = sg.parentElement.dataset.seg; let v = sg.dataset.v;
    if (v === 'true') v = true; else if (v === 'false') v = false;
    S[name] = v; saveSettings(S);
    G.input.s = S; if (name === 'assist' && G.model) G.model.assist = v;
    if (name === 'sound') G.audio.setEnabled(v);
    G.world.applySettings(S); G.hud.resize(); buildLobby();
  }
});
document.addEventListener('input', (e) => {
  const sl = e.target.dataset?.sl; if (!sl) return;
  const v = parseFloat(e.target.value);
  const valEl = document.querySelector(`[data-val="${sl}"]`);
  if (['along', 'across', 'heading', 'ground'].includes(sl)) {
    S.tune[S.airport] = { ...tune(), [sl]: v }; G.world.setTune(S.tune[S.airport]); parkOnRunway();
    if (valEl) valEl.textContent = sl === 'heading' ? v.toFixed(1) + '°' : sl === 'ground' ? v.toFixed(1) + ' m' : v + ' m';
  } else {
    S[sl] = v; G.world.applySettings(S);
    if (valEl) valEl.textContent = sl === 'clouds' ? Math.round(v * 100) + '%' : sl === 'fov' ? v + '°' : v.toFixed(2);
  }
  saveSettings(S);
});

function showLobby() {
  G.state = 'lobby'; G.paused = false; G.ended = false;
  $('lobby').classList.remove('hidden'); $('touch').classList.add('hidden');
  for (const id of ['pause', 'debrief', 'loading']) $(id).classList.add('hidden');
  if (G.ac) G.ac.root.visible = true;
  G.combat?.reset(G.cfg || AIRCRAFT.f15e); if (G.combat) G.combat.active = false;
  G.world.applySettings(S);
  parkOnRunway(); buildLobby();
}

$('flyBtn').onclick = () => { G.audio.on = S.sound; G.audio.start(); startFlight(); };
$('pResume').onclick = () => setPaused(false);
$('pRestart').onclick = () => { setPaused(false); startFlight(); };
$('pLobby').onclick = () => showLobby();
$('dRetry').onclick = () => startFlight();
$('dLobby').onclick = () => showLobby();

// ------------------------------------------------------------------------------------------
// Flight start
// ------------------------------------------------------------------------------------------
async function startFlight() {
  $('lobby').classList.add('hidden'); $('debrief').classList.add('hidden'); $('pause').classList.add('hidden');
  G.state = 'loading'; saveSettings(S);
  const ov = $('loading'); ov.classList.remove('hidden');
  const w = G.world; const t0 = performance.now();
  parkOnRunway();
  const hasTiles = w.tilesStatus === 'ok' || w.tilesStatus === 'loading';
  $('loadTitle').textContent = 'Preparing flight';
  $('loadNote').textContent = hasTiles ? 'Streaming 3D map tiles…' : 'Building terrain…';
  while (hasTiles && performance.now() - t0 < 28000) {
    const p = w.loadProgress;
    $('loadBar').style.width = Math.round(p * 100) + '%';
    $('loadSub').textContent = w.tilesStatus === 'error' ? 'Tile error — using offline terrain' : `${Math.round(p * 100)}%`;
    if (p >= 0.99 || w.tilesStatus === 'error') break;
    await new Promise((r) => setTimeout(r, 120));
  }
  $('loadBar').style.width = '100%';
  ov.classList.add('hidden');
  beginFlight();
}

function beginFlight() {
  const m = G.model, cfg = G.cfg, len = G.world.runwayLen || 3000;
  G.score = 0; G.hp = 100; G.flightTime = 0; G.ended = false; G.endT = 0; G.tookOff = false; G.landedT = 0; G.shake = 0; G.bonusLanding = 0;
  G.ac.root.visible = true;
  m.assist = S.assist; m.groundMSL = airportOf(S.airport).elev; m.groundY = RUNWAY_Y;
  if (S.start === 'runway') {
    m.resetOnRunway(len / 2 - 140);
  } else if (S.start === 'air') {
    m.groundY = RUNWAY_Y;
    m.resetAirborne(1300, 360, new V3(0, 0, -1));
    m.pos.set(0, 1300 + RUNWAY_Y, len / 2 + 600);
  } else {
    // final approach: 3 degree glide slope, aim point 300 m past the threshold
    const aimZ = len / 2 - 300, dist = 7300, gs = 3 * DEG;
    const spd = (cfg.approachKt + 8) * KT;
    m.resetAirborne(100, 150, new V3(0, -Math.sin(gs), -Math.cos(gs)));
    m.pos.set(0, RUNWAY_Y + dist * Math.tan(gs), aimZ + dist);
    m.vel.set(0, -spd * Math.sin(gs), -spd * Math.cos(gs));
    m.gearDown = true; m.gearPos = 1; m.flapsTarget = 1; m.flapsPos = 1; m.input.throttle = 0.35; m.thrustState = cfg.thrustMil * 0.3;
  }
  G.input.throttle = m.input.throttle || (S.start === 'runway' ? 0 : 0.5);
  G.input.pitch = G.input.roll = G.input.yaw = 0;
  G.combat.reset(cfg); G.combat.active = S.mode === 'dogfight';
  G.hud.msgs = [];
  if (S.start === 'runway') G.hud.msg('Throttle up (W)  ·  rotate at ' + cfg.rotateKt + ' kt', 'info', 4);
  else if (S.start === 'final') G.hud.msg('Follow the ILS cross · gear is down', 'info', 4);
  else G.hud.msg(S.mode === 'dogfight' ? 'Bandits inbound — arm up!' : 'Free flight', 'warn', 3);
  G.camMode = 0; G.targetCam = false;
  syncMesh(0); G.model._telemetry();
  placeCamera(1, true);
  G.state = 'playing'; G.t0 = performance.now();
  if (touchUI) $('touch').classList.remove('hidden');
  const dl = G.world.tilesStatus; if (dl === 'off' && !S.apiKey) G.hud.msg('Demo terrain · add a Google Maps key (Graphics tab) for real 3D', 'warn', 4.5);
}

function setPaused(p) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  G.paused = p; G.state = p ? 'paused' : 'playing';
  $('pause').classList.toggle('hidden', !p);
}

// ------------------------------------------------------------------------------------------
// Gameplay
// ------------------------------------------------------------------------------------------
function playerHit(dmg, kind) {
  if (G.ended || G.model.crashed) return;
  G.hp -= dmg; G.hud.damage(Math.min(1, dmg / 30)); G.shake = Math.max(G.shake, Math.min(1, dmg / 40));
  if (kind === 'missile') G.hud.msg('HIT BY MISSILE', 'bad');
  if (G.hp <= 0) {
    G.hp = 0;
    G.model.crash(kind === 'collision' ? 'Mid-air collision' : 'Shot down');
  }
}

function handleActions() {
  const m = G.model;
  for (const a of G.input.drain()) {
    if (a === 'pause') { if (G.state === 'playing' || G.state === 'paused') setPaused(!G.paused); continue; }
    if (G.state !== 'playing') continue;
    if (a === 'gear') { if (!m.toggleGear()) G.hud.msg('Cannot retract gear on the ground', 'warn', 1.5); else G.hud.msg(m.gearDown ? 'GEAR DOWN' : 'GEAR UP', 'info', 1.2); }
    else if (a === 'flaps') { m.cycleFlaps(); G.hud.msg('FLAPS ' + Math.round(m.flapsTarget * 100) + '%', 'info', 1.2); }
    else if (a === 'airbrake') { m.setAirbrake(!m.airbrake); G.hud.msg(m.airbrake ? 'AIRBRAKE' : 'AIRBRAKE IN', 'info', 1); }
    else if (a === 'missile') { if (!G.cfg.weapons) { G.hud.msg('No weapons on this aircraft', 'warn', 1.5); } else { const r = G.combat.fireMissile(); if (r === 'NO LOCK') G.hud.msg('NO LOCK — keep target in the cone', 'warn', 1.6); else if (r === 'EMPTY') G.hud.msg('OUT OF MISSILES', 'warn', 1.6); else if (r !== 'dead') G.hud.msg(r, 'good', 1.2); } }
    else if (a === 'flare') { if (G.combat.dropFlares()) G.hud.msg('FLARES', 'info', 1); else G.hud.msg('NO FLARES', 'warn', 1.2); }
    else if (a === 'camera') { G.camMode = (G.camMode + 1) % 3; G.targetCam = false; }
    else if (a === 'targetcam') { G.targetCam = !G.targetCam; }
    else if (a === 'nextTarget') { G.combat.cycleTarget(); }
    else if (a === 'hud') { G.hud.visible = !G.hud.visible; }
    else if (a === 'restart') { startFlight(); return; }
    else if (a === 'autolevel') { m.assist = !m.assist; G.hud.msg('ASSIST ' + (m.assist ? 'ON' : 'OFF'), 'info', 1.2); }
  }
}

function updateGameplay(dt) {
  const m = G.model, cfg = G.cfg, w = G.world, inp = G.input;
  handleActions();
  if (G.state !== 'playing') return;
  G.flightTime += dt;
  inp.update(dt, m.onGround);
  if (!G.ended) {
    m.input.pitch = inp.pitch; m.input.roll = inp.roll; m.input.yaw = inp.yaw; m.input.throttle = inp.throttle;
    m.wheelBrake = inp.brake;
  } else { m.input.pitch = m.input.roll = m.input.yaw = 0; }

  // ground under the aircraft
  G.groundT -= dt;
  const agl = m.pos.y - m.groundY;
  if (G.groundT <= 0) { G.groundT = agl < 80 || m.onGround ? 0.05 : 0.14; m.groundY = w.groundHeight(m.pos.x, m.pos.z, m.groundY); }

  m.update(dt);

  // events
  for (const ev of m.events.splice(0)) {
    if (ev === 'touchdown' && m.landing) {
      G.audio.touchdown();
      const bonus = [0, 50, 200, 300][m.landing.quality] || 0;
      if (bonus && !m.crashed) { G.score += bonus; G.bonusLanding = bonus; }
      G.hud.msg(`${m.landing.text.toUpperCase()}  ${m.landing.fpm} fpm${bonus ? '  +' + bonus : ''}`, m.landing.quality >= 1 ? 'good' : 'warn', 3.2);
    } else if (ev === 'liftoff') {
      if (!G.tookOff) { G.tookOff = true; G.score += 50; G.hud.msg('AIRBORNE  +50  ·  gear up (G)', 'good', 3); }
    } else if (ev === 'crash') {
      G.combat.explode(m.pos, 55); G.ac.root.visible = false; G.endT = 0; G.ended = true; G.shake = 1;
      G.hud.msg(m.crashReason.toUpperCase(), 'bad', 4);
    }
  }
  syncMesh(dt);

  // combat
  G.combat.setPlayer(m);
  G.combat.fireGun(dt, inp.fire && cfg.weapons && !G.ended);
  G.combat.update(dt, S.difficulty, S.mode);

  // warnings
  const T = m.tele; const W = G.warn = {};
  const sinkFpm = -T.vsFpm;
  if (!m.onGround) {
    W.stall = m.stalling && agl > 8;
    const tG = agl / Math.max(1, m.vel.y < 0 ? -m.vel.y : 0.001);
    const approachCfg = m.gearDown && T.speedKt < cfg.approachKt + 55 && sinkFpm < 1300 && agl < 250;
    W.pullup = !approachCfg && agl < 1800 && ((tG < 7 && sinkFpm > 1500) || (tG < 3.5 && sinkFpm > 700));
    W.gear = !m.gearDown && agl < 280 && T.speedKt < 230 && T.throttle < 0.8 && S.start !== 'air';
  }
  W.overg = m.overG;
  W.fuel = T.fuelPct < 0.15 && T.fuelPct > 0;
  W.overspeed = m.overspeed;
  const inc = G.combat.incomingMissile(); W.missile = !!inc;
  if (inc) G.audio.warn('missile'); else if (W.pullup) G.audio.warn('pullup'); else if (W.stall) G.audio.warn('stall');
  if (m.fuel <= 0 && !G.ended && T.speedKt > 5 && !m.onGround && !G.flameoutMsg) { G.flameoutMsg = true; G.hud.msg('FLAMEOUT — glide to the runway', 'bad', 3); }
  if (m.fuel > 0) G.flameoutMsg = false;

  // ILS
  G.ils = null;
  const len = w.runwayLen || 3000;
  const dz = m.pos.z - (len / 2);
  if (dz > 100 && dz < 22000 && m.forward.z < -0.3 && agl < 4000 && Math.abs(m.pos.x) < dz * 0.3 + 600 && !G.ended) {
    const dist = dz + 300;
    const refY = RUNWAY_Y + dist * Math.tan(3 * DEG);
    G.ils = { dist: dz, gs: (refY - m.pos.y) / (refY * 0.14 + 12), loc: -m.pos.x / (dz * 0.045 + 70) };
  }

  // end conditions
  if (G.ended) { G.endT += dt; if (G.endT > 2.4) showDebrief(true); }
  else if (m.onGround && T.speedKt < 3 && m.landing && !m.crashed) {
    G.landedT += dt; if (G.landedT > 2.0 && !G.combat.enemies.some((e) => e.alive && e.dist < 2500)) { G.ended = true; G.endT = 1.6; showDebrief(false); }
  } else G.landedT = 0;
}

function showDebrief(crashed) {
  if (G.state === 'debrief') return;
  G.state = 'debrief';
  const m = G.model, c = G.combat;
  $('touch').classList.add('hidden');
  $('dbTitle').textContent = crashed ? (m.crashReason.includes('Shot') ? 'SHOT DOWN' : 'CRASHED') : 'LANDED';
  $('dbBig').textContent = G.score + ' pts';
  $('dbSub').textContent = crashed ? m.crashReason : (m.landing ? `${m.landing.text} — ${m.landing.fpm} fpm` : 'Safe landing');
  const acc = c.shots ? Math.round(100 * c.hits / c.shots) : 0;
  const mins = Math.floor(G.flightTime / 60), secs = Math.floor(G.flightTime % 60);
  $('dbGrid').innerHTML = `<span>Flight time</span><b>${mins}:${String(secs).padStart(2, '0')}</b><span>Kills</span><b>${c.kills}</b><span>Waves reached</span><b>${c.wave}</b><span>Hits / shots</span><b>${c.hits} / ${c.shots} (${acc}%)</b><span>Aircraft</span><b>${G.cfg.name}</b>`;
  $('debrief').classList.remove('hidden');
}

// ------------------------------------------------------------------------------------------
// Camera
// ------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
function placeCamera(dt, snap = false) {
  const cam = G.world.camera, m = G.model, cfg = G.cfg, o = G.input.orbit;
  const pq = G.ac.root.quaternion; const pp = G.ac.root.position;
  const alive = !(G.ended && m.crashed);
  const L = cfg.lengthM;
  let pos = _v, look = _v2, upv = new THREE.Vector3(0, 1, 0);
  G.ac.root.visible = alive && !(G.camMode === 1 && !G.targetCam && !o.drag);
  if (!alive) {
    // watch the wreck from where the camera was
    pos = G.camPos.clone();
    look = new THREE.Vector3(m.pos.x, m.pos.y, m.pos.z);
  } else if (G.camMode === 1 && !G.targetCam) {
    _q.copy(pq);
    pos = new THREE.Vector3(0, Math.max(0.9, cfg.gearHeight * 0.5), -L * 0.3).applyQuaternion(_q).add(pp);
    look = new THREE.Vector3(0, Math.max(0.9, cfg.gearHeight * 0.5), -L * 0.3 - 50).applyQuaternion(_q).add(pp);
    upv.set(0, 1, 0).applyQuaternion(_q);
    const f = 1;
    cam.position.copy(pos); _m.lookAt(pos, look, upv); cam.quaternion.setFromRotationMatrix(_m);
    G.camPos.copy(pos); return;
  } else {
    const far = G.camMode === 2 ? 2.4 : 1;
    const dist = L * 1.65 * far * o.dist;
    const off = new THREE.Vector3(0, L * 0.30 * far, dist);
    // orbit offsets in aircraft frame
    off.applyAxisAngle(_up, o.yaw); off.applyAxisAngle(new THREE.Vector3(1, 0, 0), -o.pitch * 0.9);
    // smoothed follow: use aircraft frame blended with velocity direction
    off.applyQuaternion(pq);
    pos = new THREE.Vector3().copy(pp).add(off);
    if (G.targetCam && G.combat.lock.target?.alive) {
      look = G.combat.lock.target.pos.clone();
      const dirT = look.clone().sub(pp).normalize();
      pos = new THREE.Vector3().copy(pp).addScaledVector(dirT, -dist).addScaledVector(_up, L * 0.45);
    } else {
      look = new THREE.Vector3(0, L * 0.06, -L * 3.2).applyQuaternion(pq).add(pp);
    }
    upv = new THREE.Vector3(0, 1, 0).lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(pq), 0.35).normalize();
    if (!snap) pos.lerpVectors(G.camPos, pos, 1 - Math.exp(-dt * 12));
  }
  // keep the camera above the ground
  pos.y = Math.max(pos.y, m.groundY + 2.5);
  // screen shake
  if (G.shake > 0.01) { const s = G.shake * 1.1; pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s; }
  G.camPos.copy(pos);
  cam.position.copy(pos);
  _m.lookAt(pos, look, upv); _q.setFromRotationMatrix(_m);
  if (snap) cam.quaternion.copy(_q); else cam.quaternion.slerp(_q, 1 - Math.exp(-dt * 14));
}

function lobbyCamera(dt) {
  const cam = G.world.camera, m = G.model, L = G.cfg.lengthM;
  G.lobbyAngle += dt * 0.16;
  const R = L * (touchUI ? 2.6 : 2.3), a = G.lobbyAngle;
  const x = m.pos.x + Math.sin(a) * R, z = m.pos.z + Math.cos(a) * R, y = m.pos.y + L * (0.28 + 0.08 * Math.sin(a * 0.7));
  cam.position.set(x, y, z);
  // push the aircraft into the free (right-hand) part of the screen, next to the lobby panel
  const W = window.innerWidth, panelW = Math.min(560, W);
  let shift = 0;
  if (W > 760) {
    const ratio = ((panelW + W) / 2 - W / 2) / (W / 2);
    const tanH = Math.tan(cam.fov * DEG / 2) * cam.aspect;
    shift = ratio * tanH * R;
  }
  cam.lookAt(m.pos.x - Math.cos(a) * shift, m.pos.y + 0.4, m.pos.z + Math.sin(a) * shift);
  G.camPos.copy(cam.position);
}

// ------------------------------------------------------------------------------------------
// Main loop
// ------------------------------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (dt <= 0) return;
  G.frames++; G.fpsT += dt; if (G.fpsT >= 0.5) { G.fps = G.frames / G.fpsT; G.frames = 0; G.fpsT = 0; }
  const w = G.world;
  try {
    if (G.state === 'playing' || G.state === 'debrief') {
      updateGameplay(dt);
      G.shake = Math.max(0, G.shake - dt * 1.8);
      placeCamera(dt);
      w.update(dt, G.model.pos);
      G.audio.update(G.model.input.throttle, G.model.vel.length(), G.model.afterburner, G.model.onGround, G.ended ? 0.2 : 1);
    } else if (G.state === 'paused') {
      handleActions();
      w.update(dt * 0, G.model.pos);
    } else if (G.state === 'lobby' || G.state === 'loading') {
      G.model.update(dt); syncMesh(dt);
      lobbyCamera(dt);
      w.update(dt, G.model.pos);
      if (Math.floor(now / 500) !== G._st) { G._st = Math.floor(now / 500); updateTileStatus(); }
    }
    // clouds whiteout + attribution
    $('whiteout').style.opacity = String(Math.min(0.92, w.cloudDensity * 0.95));
    const cr = $('credit');
    const txt = w.tilesStatus === 'ok' ? 'Google · ' + (w.attribution || 'Map data') : '';
    if (cr.textContent !== txt) cr.textContent = txt;
    // HUD
    const inGame = G.state === 'playing' || G.state === 'paused' || G.state === 'debrief';
    G.hud.draw(inGame ? {
      model: G.model, cfg: G.cfg, camera: w.camera, combat: G.combat, mode: S.mode, score: G.score, hp: G.hp, warn: G.warn || {},
      ils: G.ils, hdgOff: airportOf(S.airport).hdg + tune().heading, brake: G.input.brake, touch: touchUI, fps: G.fps, renderH: w.renderHeight,
      tilesLabel: w.tilesStatus === 'ok' ? 'Google 3D' : w.tilesStatus === 'loading' ? 'loading…' : 'demo terrain',
    } : { model: null }, dt);
    w.render();
  } catch (err) {
    console.error(err);
    if (!G._errShown) { G._errShown = true; G.hud.msg('Error: ' + (err.message || err), 'bad', 8); }
  }
}

boot();
