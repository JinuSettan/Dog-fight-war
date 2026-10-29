import * as THREE from 'three';
import { World, RUNWAY_Y } from './world.js';
import { createAircraft } from './models.js';
import { FlightModel } from './physics.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { AIRCRAFT, WAR_LIST, AIRLINE_LIST, AIRPORTS, DIFFICULTY, RESOLUTIONS, TILE_QUALITY, TIMES, KT } from './config.js';
import { createCabin } from './cabin.js';
import { flightPlan, fmtDuration } from './route.js';
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
  apt: null, flight: null, cabin: null, cine: { kind: '', shot: 0, t: 0, init: false, a0: 0, pos: new THREE.Vector3() },
};
window.__game = G;                              // handy for debugging / tests
const airportOf = (icao) => AIRPORTS.find((a) => a.icao === icao) || AIRPORTS[0];
const isAirline = () => S.category === 'airline';
const curApt = () => G.apt || airportOf(S.airport);
const CAMS = ['Chase', 'Cockpit', 'Far', 'Cabin', 'Window seat'];
const camCount = () => (isAirline() ? 5 : 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const WAR_TABS = [['aircraft', 'Aircraft'], ['airport', 'Airport'], ['mission', 'Mission'], ['graphics', 'Graphics'], ['controls', 'Controls']];
const AIR_TABS = [['flight', 'Flight'], ['airport', 'Departure'], ['graphics', 'Graphics'], ['controls', 'Controls']];
const tabsFor = () => (isAirline() ? AIR_TABS : WAR_TABS);
const tuneOf = (icao) => ({ along: 0, across: 0, heading: 0, ground: 0, ...(S.tune[icao] || {}) });
const tune = () => tuneOf(S.airport);

function statBars(c) {
  const speed = clamp((c.thrustAB / c.massKg) / 14, 0.1, 1);
  const agility = clamp((c.rollRate * 0.6 + c.pitchRate) / 5, 0.1, 1);
  const armor = clamp(c.maxG / 9, 0.1, 1);
  const fire = c.weapons ? 1 : 0.04;
  const row = (n, v) => `<span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
  return `<div class="stats">${row('Speed', speed)}${row('Agility', agility)}${row('Strength', armor)}${row('Firepower', fire)}</div>`;
}

function syncCategoryUi() {
  document.querySelectorAll('#cat button').forEach((b) => b.classList.toggle('on', b.dataset.cat === S.category));
  $('flyBtn').textContent = isAirline() ? 'BOARD' : 'FLY';
  $('brandSub').textContent = isAirline() ? 'airline pilot — real airports' : 'real-world jet combat';
}

function buildLobby() {
  const tabs = tabsFor();
  if (!tabs.some(([id]) => id === G.tab)) G.tab = tabs[0][0];
  syncCategoryUi();
  $('tabs').innerHTML = tabs.map(([id, n]) => `<div class="tab ${G.tab === id ? 'on' : ''}" data-tab="${id}">${n}</div>`).join('');
  $('tabs').onclick = (e) => { const t = e.target.closest('.tab'); if (!t) return; G.tab = t.dataset.tab; buildLobby(); };
  const pane = $('pane');
  const keepScroll = pane.scrollTop;
  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const slider = (name, min, max, step, val, fmt) => `<input type="range" data-sl="${name}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val" data-val="${name}">${fmt(val)}</span>`;
  const dep = airportOf(S.airport);

  let html = '';
  if (G.tab === 'aircraft') {
    html = WAR_LIST.map((id) => { const c = AIRCRAFT[id]; return `<div class="card ${S.aircraft === id ? 'on' : ''}" data-ac="${id}"><h3><span>${c.name}</span><span style="color:${c.color}">●</span></h3><p>${c.blurb}</p>${statBars(c)}</div>`; }).join('');
  } else if (G.tab === 'flight') {
    const c = AIRCRAFT.a318;
    const plan = flightPlan(dep, airportOf(S.dest));
    html = `<div class="card on" style="cursor:default"><h3><span>${c.name}</span><span>${c.seats} seats</span></h3><p>${c.blurb}</p></div>
      <div class="note"><b>1.</b> Departure: <b>${dep.iata} ${dep.city}</b> (Departure tab) &nbsp; <b>2.</b> choose a destination &nbsp; <b>3.</b> BOARD</div>
      <input type="search" id="destSearch" placeholder="Destination: city / country / code…" autocomplete="off">
      <div id="destList" style="margin-top:6px"></div>
      <div class="card" style="cursor:default;margin-top:8px"><h3><span>${dep.iata} ✈ ${airportOf(S.dest).iata}</span><span>${Math.round(plan.km)} km</span></h3>
        <p style="margin:0">${dep.city} to ${airportOf(S.dest).city} · about ${fmtDuration(plan.minutes)} real flight time · you fly take-off + landing, cruise is time-compressed (AUTOPILOT key U, or the ✈ button)</p></div>
      <div class="row"><label>Passengers</label>${slider('pax', 20, c.seats, 1, Math.min(S.pax, c.seats), (v) => v + ' pax')}</div>
      <div class="row"><label>Start</label>${seg('start', [['runway', 'On the runway'], ['final', 'Final approach (landing practice)']], S.start === 'air' ? 'runway' : S.start)}</div>
      <div class="row"><label>Time of day</label>${seg('time', TIMES.map((t) => [t.id, t.name]), S.time)}</div>
      <div class="note">Passenger comfort drops with steep banks, high g-forces, stalls and hard landings. Revenue = passengers × distance × comfort.</div>`;
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
      <div class="row"><label>Airport 3D</label>${seg('scenery', [['auto', 'Auto'], ['on', 'Always'], ['off', 'Off']], S.scenery)}</div>
      <div class="row"><label>Clouds</label>${slider('clouds', 0, 1, 0.05, S.clouds, (v) => Math.round(v * 100) + '%')}</div>
      <div class="row"><label>Brightness</label>${slider('brightness', 0.6, 1.6, 0.05, S.brightness, (v) => Number(v).toFixed(2))}</div>
      <div class="row"><label>Field of view</label>${slider('fov', 50, 95, 1, S.fov, (v) => v + '°')}</div>
      <div class="row"><label>Sound</label>${seg('sound', [[true, 'On'], [false, 'Off']], S.sound)}</div>
      <div class="card" style="cursor:default"><h3><span>Real 3D world (buildings)</span><span class="status" id="tileStatus"><i></i><b>…</b></span></h3>
        <p>Paste <b>one</b> of these keys, then press Apply. Without a key you get the offline demo terrain.</p>
        <div class="row" style="margin:4px 0"><label>Google Maps<br>Tiles API key</label><input type="text" id="apiKey" value="${S.apiKey || ''}" placeholder="AIza…" autocomplete="off" spellcheck="false"></div>
        <div class="row" style="margin:4px 0"><label>Cesium ion<br>token (free)</label><input type="text" id="ionKey" value="${S.ionToken || ''}" placeholder="eyJ…" autocomplete="off" spellcheck="false"></div>
        <div class="row" style="margin:4px 0"><button class="btn pri" id="applyKey">Apply</button></div>
        <div class="note">Google: enable “Map Tiles API” (billing account needed, free monthly credit). Cesium ion: free account at ion.cesium.com → Access Tokens → copy the default token; it streams the same Google Photorealistic 3D Tiles. 4K needs a strong GPU, use Auto on phones.</div></div>`;
  } else if (G.tab === 'controls') {
    html = `<div class="row"><label>Tilt steering</label>${seg('tilt', [[false, 'Off'], [true, 'On (tilt phone)']], S.tilt)}</div>
      <div class="row"><label>Tilt range</label>${slider('tiltRange', 12, 50, 1, S.tiltRange, (v) => v + '°')}</div>
      <div class="row"><label>Stick sensitivity</label>${slider('stickSens', 0.5, 2, 0.05, S.stickSens, (v) => Number(v).toFixed(2))}</div>
      <div class="row"><label>Invert pitch</label>${seg('invertPitch', [[false, 'Off'], [true, 'On']], S.invertPitch)}</div>
      <div class="row"><label>Flight assist</label>${seg('assist', [[true, 'On (auto-level)'], [false, 'Off']], S.assist)}</div>
      <div class="keys" style="margin-top:12px">
        <b>↑ / ↓</b><span>Pitch (↓ = pull up, nose up)</span><b>← / →</b><span>Roll / nose-wheel steering</span>
        <b>A / D</b><span>Rudder</span><b>W / S · Shift / Ctrl</b><span>Throttle up / down (above 90% = afterburner)</span>
        <b>Space</b><span>Cannon</span><b>M · Enter</b><span>Fire missile (needs lock: keep target in the cone)</span>
        <b>X</b><span>Flares</span><b>G</b><span>Landing gear</span><b>F</b><span>Flaps</span><b>B</b><span>Wheel brakes (hold)</span><b>V</b><span>Airbrake</span>
        <b>C</b><span>Camera: chase / cockpit / far (airliner: cabin, window seat)</span><b>L</b><span>Cinematic take-off / landing cameras on / off</span>
        <b>U</b><span>Airliner: autopilot cruise to the destination (press again to skip to approach)</span>
        <b>T</b><span>Look at target</span><b>N</b><span>Next target</span><b>H</b><span>HUD on/off</span><b>Y</b><span>Re-centre phone tilt</span>
        <b>P / Esc</b><span>Pause</span><b>Mouse / finger drag</b><span>Look around (mouse orbit, cabin look)</span>
        <b>Touch</b><span>Left stick = pitch/roll, right slider = throttle, buttons for guns, missiles, flares, gear, flaps, brakes, camera, 🎬 cinematic, ✈ autopilot</span>
      </div>`;
  }
  pane.innerHTML = html;
  pane.scrollTop = keepScroll;
  if (G.tab === 'airport') { renderAirports(''); $('aptSearch').oninput = (e) => renderAirports(e.target.value); }
  if (G.tab === 'flight') { renderDests(''); $('destSearch').oninput = (e) => renderDests(e.target.value); }
  if (G.tab === 'graphics') $('applyKey').onclick = applyKey;
  updateTileStatus();
}

function renderAirports(q) {
  const ql = q.trim().toLowerCase();
  const list = AIRPORTS.filter((a) => !ql || `${a.name} ${a.city} ${a.country} ${a.iata} ${a.icao}`.toLowerCase().includes(ql));
  $('aptList').innerHTML = list.map((a) => `<div class="card ${S.airport === a.icao ? 'on' : ''}" data-apt="${a.icao}"><h3 class="apt"><span>${a.iata} · ${a.name}</span><span>${a.len} m</span></h3><p style="margin:0">${a.city}, ${a.country} · RWY ${String(Math.round(a.hdg / 10)).padStart(2, '0')} · elev ${a.elev} m</p></div>`).join('') || '<div class="note">No airport found</div>';
}

function renderDests(q) {
  const ql = q.trim().toLowerCase(), dep = airportOf(S.airport);
  const list = AIRPORTS.filter((a) => a.icao !== dep.icao && (!ql || `${a.name} ${a.city} ${a.country} ${a.iata} ${a.icao}`.toLowerCase().includes(ql)))
    .map((a) => ({ a, p: flightPlan(dep, a) })).sort((x, y) => x.p.km - y.p.km);
  $('destList').innerHTML = list.map(({ a, p }) => `<div class="card ${S.dest === a.icao ? 'on' : ''}" data-dest="${a.icao}" style="padding:7px 12px"><h3 class="apt" style="margin:0"><span>${a.iata} · ${a.city}</span><span>${Math.round(p.km)} km · ${fmtDuration(p.minutes)}</span></h3><p style="margin:0">${a.name}, ${a.country}</p></div>`).join('') || '<div class="note">No airport found</div>';
}

function updateTileStatus() {
  const el = $('tileStatus'); if (!el || !G.world) return;
  const w = G.world; const b = el.querySelector('b');
  el.className = 'status';
  const src = w.tilesSource === 'ion' ? 'Cesium ion' : 'Google';
  if (w.tilesStatus === 'ok') { el.classList.add('ok'); b.textContent = w.groundCalibrated ? `${src} 3D tiles ON` : `${src} 3D tiles: aligning…`; }
  else if (w.tilesStatus === 'loading') { el.classList.add('load'); b.textContent = `Connecting to ${src}…`; }
  else if (w.tilesStatus === 'error') { el.classList.add('err'); b.textContent = 'Tile error: ' + (w.tilesError || '').slice(0, 60); }
  else b.textContent = 'Offline demo terrain (no key)';
}

function applyKey() {
  S.apiKey = $('apiKey').value.trim(); S.ionToken = $('ionKey').value.trim(); saveSettings(S);
  G.world.s = S; G.world.setupTiles();
  G.world.setAirport(airportOf(S.airport), tune());
}

async function setCategory(cat) {
  if (S.category === cat) return;
  if (cat === 'airline') {
    if (S.aircraft !== 'a318') S.warAircraft = S.aircraft;
    S.category = 'airline'; G.tab = 'flight';
    if (S.start === 'air') S.start = 'runway';
    if (S.dest === S.airport) S.dest = AIRPORTS.find((a) => a.icao !== S.airport && a.iata === 'DXB')?.icao || AIRPORTS.find((a) => a.icao !== S.airport).icao;
    await setAircraft('a318');
  } else {
    S.category = 'war'; G.tab = 'aircraft';
    await setAircraft(S.warAircraft && S.warAircraft !== 'a318' ? S.warAircraft : 'f15e');
  }
  saveSettings(S); buildLobby();
}

// delegated lobby events
document.addEventListener('click', async (e) => {
  const t = e.target;
  const cat = t.closest?.('[data-cat]');
  if (cat) { await setCategory(cat.dataset.cat); return; }
  const ac = t.closest?.('[data-ac]');
  if (ac) { await setAircraft(ac.dataset.ac); S.warAircraft = S.aircraft; saveSettings(S); buildLobby(); return; }
  const dest = t.closest?.('[data-dest]');
  if (dest) { S.dest = dest.dataset.dest; saveSettings(S); buildLobby(); return; }
  const apt = t.closest?.('[data-apt]');
  if (apt) {
    S.airport = apt.dataset.apt; if (S.dest === S.airport) S.dest = AIRPORTS.find((a) => a.icao !== S.airport).icao;
    saveSettings(S);
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
    if (name === 'tilt' && v) { G.input.calibrate(); }
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
    S[sl] = v; G.world.applySettings(S); G.input.s = S;
    if (valEl) valEl.textContent = sl === 'clouds' ? Math.round(v * 100) + '%' : sl === 'fov' || sl === 'tiltRange' ? v + '°' : sl === 'pax' ? v + ' pax' : v.toFixed(2);
  }
  saveSettings(S);
});

function showLobby() {
  G.state = 'lobby'; G.paused = false; G.ended = false; G.flight = null; G.apt = null;
  G.cine.on = false; $('cineBars').classList.add('hidden');
  G.input.lookEnabled = false; G.input.orbit.yaw = G.input.orbit.pitch = 0;
  if (G.cabin) G.cabin.group.visible = false;
  if (G.world.cruise) G.world.setCruise(false);
  $('lobby').classList.remove('hidden'); $('touch').classList.add('hidden');
  for (const id of ['pause', 'debrief', 'loading']) $(id).classList.add('hidden');
  if (G.ac) G.ac.root.visible = true;
  G.combat?.reset(G.cfg || AIRCRAFT.f15e); if (G.combat) G.combat.active = false;
  const ap = airportOf(S.airport);
  if (G.world.airport !== ap) G.world.setAirport(ap, tune());
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
async function waitForTiles(maxMs = 28000) {
  const w = G.world, t0 = performance.now();
  const hasTiles = w.tilesStatus === 'ok' || w.tilesStatus === 'loading';
  $('loadNote').textContent = hasTiles ? 'Streaming 3D map tiles…' : 'Building terrain…';
  while (hasTiles && performance.now() - t0 < maxMs) {
    const p = w.loadProgress;
    $('loadBar').style.width = Math.round(p * 100) + '%';
    $('loadSub').textContent = w.tilesStatus === 'error' ? 'Tile error — using offline terrain' : `${Math.round(p * 100)}%`;
    if (p >= 0.99 || w.tilesStatus === 'error') break;
    await sleep(120);
  }
  $('loadBar').style.width = '100%';
}

async function startFlight() {
  $('lobby').classList.add('hidden'); $('debrief').classList.add('hidden'); $('pause').classList.add('hidden');
  G.state = 'loading'; saveSettings(S);
  const ov = $('loading'); ov.classList.remove('hidden');
  const w = G.world;
  if (w.cruise) w.setCruise(false);
  G.apt = null; G.cine.on = false; $('cineBars').classList.add('hidden');
  if (w.airport !== airportOf(S.airport)) await w.setAirport(airportOf(S.airport), tune());
  parkOnRunway();
  $('loadTitle').textContent = isAirline() ? `Boarding ${S.pax} passengers` : 'Preparing flight';
  await waitForTiles();
  ov.classList.add('hidden');
  beginFlight();
}

function buildCabinFor(pax) {
  if (G.cabin) { G.ac.root.remove(G.cabin.group); G.cabin.group.traverse((o) => { o.geometry?.dispose?.(); }); G.cabin = null; }
  if (!isAirline()) return;
  G.cabin = createCabin(G.cfg, pax, 1 + Math.floor(Math.random() * 9999));
  G.ac.root.add(G.cabin.group);
}

function placeOnFinal(dist, extraKt = 8) {
  const m = G.model, cfg = G.cfg, len = G.world.runwayLen || 3000;
  const aimZ = len / 2 - 300, gs = 3 * DEG;
  const spd = (cfg.approachKt + extraKt) * KT;
  m.resetAirborne(100, 150, new V3(0, -Math.sin(gs), -Math.cos(gs)));
  m.pos.set(0, RUNWAY_Y + dist * Math.tan(gs), aimZ + dist);
  m.vel.set(0, -spd * Math.sin(gs), -spd * Math.cos(gs));
  m.gearDown = true; m.gearPos = 1; m.flapsTarget = 1; m.flapsPos = 1; m.input.throttle = 0.35; m.thrustState = cfg.thrustMil * 0.3;
}

function beginFlight() {
  const m = G.model, cfg = G.cfg, len = G.world.runwayLen || 3000;
  G.score = 0; G.hp = 100; G.flightTime = 0; G.ended = false; G.endT = 0; G.tookOff = false; G.landedT = 0; G.shake = 0; G.bonusLanding = 0;
  G.ac.root.visible = true; G.apt = null;
  m.assist = S.assist; m.groundMSL = airportOf(S.airport).elev; m.groundY = RUNWAY_Y;
  const air = isAirline();
  if (air) {
    const a = airportOf(S.airport), b = airportOf(S.dest), plan = flightPlan(a, b);
    G.flight = { from: a.iata, to: b.iata, fromCity: a.city, toCity: b.city, dest: b, km: plan.km, minutes: plan.minutes, pax: S.pax, comfort: 100, cruising: false, arrived: false, progress: 0, cruiseT: 0, cruiseDur: 0, warp: 1, revenue: 0, altM: 0, noted: {} };
    buildCabinFor(S.pax);
  } else { G.flight = null; buildCabinFor(0); }
  const start = air && S.start === 'air' ? 'runway' : S.start;
  if (start === 'runway') {
    m.resetOnRunway(len / 2 - 140);
  } else if (start === 'air') {
    m.groundY = RUNWAY_Y;
    m.resetAirborne(1300, 360, new V3(0, 0, -1));
    m.pos.set(0, 1300 + RUNWAY_Y, len / 2 + 600);
  } else {
    placeOnFinal(7300, 8);
    if (air) G.flight.arrived = true;      // landing practice counts as a completed leg
  }
  G.input.throttle = m.input.throttle || (start === 'runway' ? 0 : 0.5);
  G.input.pitch = G.input.roll = G.input.yaw = 0;
  G.combat.reset(cfg); G.combat.active = !air && S.mode === 'dogfight';
  G.hud.msgs = [];
  if (start === 'runway') G.hud.msg(air ? `${G.flight.from} → ${G.flight.to} · throttle up (W) · rotate at ${cfg.rotateKt} kt` : 'Throttle up (W)  ·  rotate at ' + cfg.rotateKt + ' kt', 'info', 4);
  else if (start === 'final') G.hud.msg('Follow the ILS cross · gear is down', 'info', 4);
  else G.hud.msg(S.mode === 'dogfight' ? 'Bandits inbound — arm up!' : 'Free flight', 'warn', 3);
  G.camMode = 0; G.targetCam = false; G.cine.on = false; G.cine.kind = '';
  G.input.lookEnabled = false; G.input.orbit.yaw = G.input.orbit.pitch = 0;
  syncMesh(0); G.model._telemetry();
  placeCamera(1, true);
  G.state = 'playing'; G.t0 = performance.now(); G.groundT = 0;
  if (touchUI) $('touch').classList.remove('hidden');
  $('bAuto').classList.toggle('hidden', !air);
  $('bFire').classList.toggle('hidden', air); $('bMsl').classList.toggle('hidden', air); $('bFlare').classList.toggle('hidden', air);
  const dl = G.world.tilesStatus; if (dl === 'off' && !S.apiKey && !S.ionToken) G.hud.msg('Demo terrain · add a Google Maps key or Cesium token (Graphics tab) for real 3D', 'warn', 4.5);
}

function setPaused(p) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  G.paused = p; G.state = p ? 'paused' : 'playing';
  $('pause').classList.toggle('hidden', !p);
}

// ------------------------------------------------------------------------------------------
// Airliner: autopilot cruise (time-compressed) and arrival
// ------------------------------------------------------------------------------------------
function canCruise() {
  const F = G.flight, m = G.model;
  return !!F && !F.cruising && !F.arrived && !m.onGround && !G.ended && !m.crashed && m.tele.altAglFt > 6000 && m.gearPos < 0.1 && m.tele.speedKt > 200;
}

function startCruise() {
  const F = G.flight, m = G.model, cfg = G.cfg;
  F.cruising = true; F.cruiseT = 0;
  F.cruiseDur = clamp(F.minutes * 60 / 150, 40, 110);          // real seconds the cruise takes
  F.warp = F.minutes * 60 / F.cruiseDur;
  F.alt0 = m.pos.y; F.altCruise = cfg.cruiseAltM || 10000;
  const f = m.forward; F.hdg = new V3(f.x, 0, f.z).normalize();
  G.world.setCruise(true);
  G.input.throttle = Math.max(G.input.throttle, 0.6);
  G.hud.msg(`AUTOPILOT · cruise to ${F.to} · time ×${Math.round(F.warp)}`, 'good', 3.5);
}

function updateCruise(dt) {
  const F = G.flight, m = G.model;
  F.cruiseT += dt;
  const p = clamp(F.cruiseT / F.cruiseDur, 0, 1);
  F.progress = p;
  // altitude profile: climb to cruise level, hold, descend to ~3000 m
  const up = smooth01(p / 0.22), down = smooth01((p - 0.78) / 0.22);
  const alt = F.alt0 + (F.altCruise - F.alt0) * up - (F.altCruise - 3000) * down * up;
  const prevY = m.pos.y;
  m.pos.y = alt;
  const vy = (alt - prevY) / Math.max(dt, 1e-3);
  const gsp = 260;
  m.pos.x += F.hdg.x * gsp * dt; m.pos.z += F.hdg.z * gsp * dt;
  const dir = new V3(F.hdg.x * gsp, clamp(vy, -30, 30), F.hdg.z * gsp);
  m.q.copy(Q4.lookAlong(dir, new V3(0, 1, 0)));
  m.vel.set(dir.x, dir.y, dir.z);
  m.onGround = false;
  F.altM = alt; F.speedKmh = (G.cfg.cruiseKmh || 830) * (0.6 + 0.4 * (up * (1 - down)));
  F.remainingKm = F.km * (1 - p);
  F.etaMin = F.minutes * (1 - p);
  m._telemetry();
  if (p >= 1) arriveAtDestination();
}
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

async function arriveAtDestination() {
  const F = G.flight; if (!F || !F.cruising || G.state !== 'playing') return;
  G.state = 'loading';
  const ov = $('loading'); ov.classList.remove('hidden');
  $('loadTitle').textContent = `Descending into ${F.toCity}`;
  const dest = F.dest, w = G.world;
  F.cruising = false; F.arrived = true; F.progress = 1;
  w.setCruise(false);
  G.apt = dest;
  await w.setAirport(dest, tuneOf(dest.icao));
  await waitForTiles(24000);
  const m = G.model;
  m.groundMSL = dest.elev; m.groundY = RUNWAY_Y;
  placeOnFinal(9500, 22);
  m.flapsTarget = 0.5; m.flapsPos = 0.5;
  G.groundT = 0; G.camPos.copy(w.camera.position);
  ov.classList.add('hidden');
  G.state = 'playing';
  G.hud.msg(`Welcome to ${F.toCity} · follow the ILS cross, speed ${G.cfg.approachKt + 10} kt`, 'good', 5);
}

// passenger comfort model
function updateComfort(dt, T, W) {
  const F = G.flight; if (!F || F.cruising || G.ended) return;
  let loss = 0;
  if (!G.model.onGround || T.speedKt > 30) {
    const dnz = Math.abs(T.nz - 1);
    if (dnz > 0.3) loss += (dnz - 0.3) * 14;
    const bank = Math.abs(T.rollDeg);
    if (!G.model.onGround && bank > 30) loss += (bank - 30) * 0.06;
    if (W.stall) loss += 8;
    if (W.pullup) loss += 3;
    if (Math.abs(T.pitchDeg) > 18 && !G.model.onGround) loss += 1.5;
  }
  F.comfort = clamp(F.comfort - loss * dt, 0, 100);
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

function setCam(mode) {
  G.camMode = mode; G.targetCam = false;
  G.input.lookEnabled = isAirline() && mode >= 3;
  G.input.orbit.yaw = G.input.orbit.pitch = 0;
  if (G.cabin) G.cabin.group.visible = isAirline() && mode >= 3;
  G.hud.msg(CAMS[mode] + (mode >= 3 ? ' view · drag to look around' : ''), 'info', 1.6);
}

function handleActions() {
  const m = G.model;
  for (const a of G.input.drain()) {
    if (a === 'pause') { if (G.state === 'playing' || G.state === 'paused') setPaused(!G.paused); continue; }
    if (G.state !== 'playing') continue;
    const F = G.flight;
    const lock = F && F.cruising;               // while on autopilot only camera / hud / pause actions work
    if (a === 'gear' && !lock) { if (!m.toggleGear()) G.hud.msg('Cannot retract gear on the ground', 'warn', 1.5); else G.hud.msg(m.gearDown ? 'GEAR DOWN' : 'GEAR UP', 'info', 1.2); }
    else if (a === 'flaps' && !lock) { m.cycleFlaps(); G.hud.msg('FLAPS ' + Math.round(m.flapsTarget * 100) + '%', 'info', 1.2); }
    else if (a === 'airbrake' && !lock) { m.setAirbrake(!m.airbrake); G.hud.msg(m.airbrake ? 'AIRBRAKE' : 'AIRBRAKE IN', 'info', 1); }
    else if (a === 'missile') { if (!G.cfg.weapons) { G.hud.msg('No weapons on this aircraft', 'warn', 1.5); } else { const r = G.combat.fireMissile(); if (r === 'NO LOCK') G.hud.msg('NO LOCK — keep target in the cone', 'warn', 1.6); else if (r === 'EMPTY') G.hud.msg('OUT OF MISSILES', 'warn', 1.6); else if (r !== 'dead') G.hud.msg(r, 'good', 1.2); } }
    else if (a === 'flare') { if (G.cfg.weapons) { if (G.combat.dropFlares()) G.hud.msg('FLARES', 'info', 1); else G.hud.msg('NO FLARES', 'warn', 1.2); } }
    else if (a === 'camera') { setCam((G.camMode + 1) % camCount()); }
    else if (a === 'targetcam') { G.targetCam = !G.targetCam; }
    else if (a === 'nextTarget') { G.combat.cycleTarget(); }
    else if (a === 'hud') { G.hud.visible = !G.hud.visible; }
    else if (a === 'restart') { startFlight(); return; }
    else if (a === 'autolevel' && !lock) { m.assist = !m.assist; G.hud.msg('ASSIST ' + (m.assist ? 'ON' : 'OFF'), 'info', 1.2); }
    else if (a === 'calibrate') { G.input.calibrate(); G.hud.msg('Tilt centred', 'info', 1); }
    else if (a === 'cine') {
      G.cine.on = !G.cine.on; G.cine.kind = ''; $('cineBars').classList.toggle('hidden', !G.cine.on);
      G.hud.msg(G.cine.on ? 'CINEMATIC CAMERA ON (L)' : 'Cinematic camera off', 'info', 1.6);
    }
    else if (a === 'cruise') {
      if (!isAirline()) { G.hud.msg('Autopilot cruise is for the airliner', 'warn', 1.5); }
      else if (F && F.cruising) { F.cruiseT = F.cruiseDur; G.hud.msg('Skipping to approach…', 'info', 1.5); }
      else if (canCruise()) startCruise();
      else if (F && F.arrived) G.hud.msg('Already at the destination — land the aircraft', 'warn', 2);
      else G.hud.msg('Autopilot: climb above 6000 ft, gear up, speed above 200 kt', 'warn', 2.5);
    }
  }
}

function updateGameplay(dt) {
  const m = G.model, cfg = G.cfg, w = G.world, inp = G.input, F = G.flight;
  handleActions();
  if (G.state !== 'playing') return;
  G.flightTime += dt;
  if (F && F.cruising) { updateCruise(dt); syncMesh(dt); G.warn = {}; return; }
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
      if (F) { if (m.landing.quality === 0) F.comfort = clamp(F.comfort - 28, 0, 100); else if (m.landing.quality === 1) F.comfort = clamp(F.comfort - 8, 0, 100); }
      else if (bonus && !m.crashed) { G.score += bonus; G.bonusLanding = bonus; }
      G.hud.msg(`${m.landing.text.toUpperCase()}  ${m.landing.fpm} fpm${!F && bonus ? '  +' + bonus : ''}`, m.landing.quality >= 1 ? 'good' : 'warn', 3.2);
    } else if (ev === 'liftoff') {
      if (!G.tookOff) { G.tookOff = true; if (!F) G.score += 50; G.hud.msg(F ? 'AIRBORNE · gear up (G) · autopilot (U) above 6000 ft' : 'AIRBORNE  +50  ·  gear up (G)', 'good', 3); }
    } else if (ev === 'crash') {
      G.combat.explode(m.pos, 55); G.ac.root.visible = false; G.endT = 0; G.ended = true; G.shake = 1;
      if (F) F.comfort = 0;
      G.hud.msg(m.crashReason.toUpperCase(), 'bad', 4);
    }
  }
  syncMesh(dt);

  // combat
  G.combat.setPlayer(m);
  if (!F) G.combat.fireGun(dt, inp.fire && cfg.weapons && !G.ended);
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
  if (F) updateComfort(dt, T, W);

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

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function showDebrief(crashed) {
  if (G.state === 'debrief') return;
  G.state = 'debrief';
  const m = G.model, c = G.combat, F = G.flight;
  $('touch').classList.add('hidden');
  if (G.cabin) G.cabin.group.visible = false;
  G.input.lookEnabled = false; G.cine.on = false; $('cineBars').classList.add('hidden');
  const mins = Math.floor(G.flightTime / 60), secs = Math.floor(G.flightTime % 60);
  if (F) {
    const atDest = F.arrived && !crashed;
    const q = m.landing ? m.landing.quality : 0;
    const rating = crashed ? 0 : clamp(Math.round(F.comfort / 25 + q * 0.4 + (atDest ? 0.6 : 0)), 1, 5);
    const revenue = atDest ? Math.round(F.pax * (35 + F.km * 0.085) * (F.comfort / 100) * (0.7 + q * 0.1)) : 0;
    G.score = revenue;
    $('dbTitle').textContent = crashed ? 'CRASHED' : atDest ? `ARRIVED · ${F.toCity.toUpperCase()}` : 'BACK AT THE RUNWAY';
    $('dbBig').textContent = revenue ? `$${revenue.toLocaleString('en-US')}` : stars(rating);
    $('dbSub').textContent = crashed ? m.crashReason : atDest ? `${stars(rating)}  ${m.landing ? m.landing.text + ' · ' + m.landing.fpm + ' fpm' : ''}` : 'Fly the whole route (autopilot key U above 6000 ft) to earn revenue';
    $('dbGrid').innerHTML = `<span>Route</span><b>${F.from} → ${F.to}</b><span>Distance</span><b>${Math.round(F.km)} km</b><span>Passengers</span><b>${F.pax}</b><span>Passenger comfort</span><b>${Math.round(F.comfort)}%</b><span>Flight time (game)</span><b>${mins}:${String(secs).padStart(2, '0')}</b><span>Real route time</span><b>${fmtDuration(F.minutes)}</b>`;
  } else {
    $('dbTitle').textContent = crashed ? (m.crashReason.includes('Shot') ? 'SHOT DOWN' : 'CRASHED') : 'LANDED';
    $('dbBig').textContent = G.score + ' pts';
    $('dbSub').textContent = crashed ? m.crashReason : (m.landing ? `${m.landing.text} — ${m.landing.fpm} fpm` : 'Safe landing');
    const acc = c.shots ? Math.round(100 * c.hits / c.shots) : 0;
    $('dbGrid').innerHTML = `<span>Flight time</span><b>${mins}:${String(secs).padStart(2, '0')}</b><span>Kills</span><b>${c.kills}</b><span>Waves reached</span><b>${c.wave}</b><span>Hits / shots</span><b>${c.hits} / ${c.shots} (${acc}%)</b><span>Aircraft</span><b>${G.cfg.name}</b>`;
  }
  $('debrief').classList.remove('hidden');
}

// ------------------------------------------------------------------------------------------
// Camera
// ------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q2 = new THREE.Quaternion();

function setFov(cam, f) { if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } }
function setNear(cam, n) { if (cam.near !== n) { cam.near = n; cam.updateProjectionMatrix(); } }

/** which part of the flight are we in (for the cinematic cameras) */
function flightPhase() {
  const m = G.model, len = G.world.runwayLen || 3000, agl = m.pos.y - m.groundY, T = m.tele;
  if (m.crashed || G.ended) return 'air';
  if (m.onGround && !m.landing) return 'takeoff';
  if (m.onGround && m.landing) return 'rollout';
  const dz = m.pos.z - len / 2;
  if (!m.landing && agl < 500 && m.vel.y > -1 && G.tookOff && G.flightTime < 90 && dz < 4000) return 'takeoff';
  if (agl < 900 && m.vel.y < -0.5 && dz > -len * 0.4 && dz < 7000 && Math.abs(m.pos.x) < 1500) return 'land';
  return 'air';
}

const CINE = {
  takeoff: [
    { name: 'side', dur: 6, fov: 38, anchor: (m, ctx) => ctx.set(55, ctx.gy + 3.5, m.pos.z - 40), look: (m) => m.pos },
    { name: 'low', dur: 5, fov: 62, follow: (m, L, out) => out.set(0, 1.6, L * 0.95) },
    { name: 'ahead', dur: 8, fov: 26, anchor: (m, ctx, len) => ctx.set(-38, ctx.gy + 3, Math.max(-len / 2 + 60, m.pos.z - 750)), look: (m) => m.pos },
    { name: 'chaseHigh', dur: 8, fov: 52, follow: (m, L, out) => out.set(L * 0.45, L * 0.42, L * 2.1) },
  ],
  land: [
    { name: 'threshold', dur: 9, fov: 24, anchor: (m, ctx, len) => ctx.set(48, ctx.gy + 3.2, len / 2 - 120), look: (m) => m.pos },
    { name: 'chase', dur: 6, fov: 56, follow: (m, L, out) => out.set(-L * 0.25, L * 0.3, L * 1.9) },
    { name: 'low', dur: 5, fov: 60, follow: (m, L, out) => out.set(L * 0.4, 1.4, L * 0.85) },
  ],
  rollout: [
    { name: 'side', dur: 5, fov: 40, anchor: (m, ctx) => ctx.set(46, ctx.gy + 2.4, m.pos.z - 30), look: (m) => m.pos },
    { name: 'tail', dur: 6, fov: 56, follow: (m, L, out) => out.set(-L * 0.3, L * 0.25, L * 1.8) },
    { name: 'front', dur: 9, fov: 44, follow: (m, L, out) => out.set(L * 0.35, 1.6, -L * 1.6) },
  ],
};

/** cinematic shot for the current phase; returns false when the free camera should be used */
function cinematic(dt, out) {
  const ph = flightPhase();
  const C = G.cine;
  const shots = CINE[ph];
  if (!shots) { C.kind = ''; return false; }
  const m = G.model, L = G.cfg.lengthM, len = G.world.runwayLen || 3000;
  if (C.kind !== ph) { C.kind = ph; C.shot = 0; C.t = 0; C.init = false; }
  C.t += dt;
  let sh = shots[C.shot % shots.length];
  if (C.t > sh.dur) { C.shot++; C.t = 0; C.init = false; sh = shots[C.shot % shots.length]; }
  const pp = G.ac.root.position, pq = G.ac.root.quaternion;
  G.ac.root.visible = true;
  if (sh.anchor) {
    if (!C.init) { C.init = true; const ctx = new THREE.Vector3(); ctx.gy = m.groundY; sh.anchor(m, ctx, len); C.pos.copy(ctx); }
    out.pos.copy(C.pos);
    out.look.copy(pp);
    out.pos.y = Math.max(out.pos.y, m.groundY + 2);
  } else {
    sh.follow(m, L, _v2);
    out.pos.copy(_v2).applyQuaternion(pq).add(pp);
    out.look.set(0, L * 0.04, -L * 2.5).applyQuaternion(pq).add(pp);
    out.pos.y = Math.max(out.pos.y, m.groundY + 1.2);
  }
  out.fov = sh.fov;
  return true;
}
const _cs = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 };

function placeCamera(dt, snap = false) {
  const cam = G.world.camera, m = G.model, cfg = G.cfg, o = G.input.orbit;
  const pq = G.ac.root.quaternion; const pp = G.ac.root.position;
  const alive = !(G.ended && m.crashed);
  const L = cfg.lengthM;
  const air = cfg.cat === 'airline';
  let pos = _v, look = _v2, upv = new THREE.Vector3(0, 1, 0);
  let fovT = S.fov, nearT = 0.6;
  const inCabin = air && G.camMode >= 3 && G.cabin && alive;
  const cockpit = G.camMode === 1 && !G.targetCam && !inCabin;
  G.ac.root.visible = alive && !(cockpit && !o.drag);
  if (G.cabin) G.cabin.group.visible = !!inCabin;

  if (!alive) {
    pos = G.camPos.clone();
    look = new THREE.Vector3(m.pos.x, m.pos.y, m.pos.z);
  } else if (inCabin) {
    const view = G.camMode === 3 ? G.cabin.views.cabin : G.cabin.views.window;
    pos = view.pos.clone().applyQuaternion(pq).add(pp);
    _e.set(view.pitch + o.pitch, view.yaw + o.yaw, 0);
    _q2.setFromEuler(_e);
    _q.copy(pq).multiply(_q2);
    if (G.shake > 0.01) { const s = G.shake * 0.04; pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; }
    else if (G.flight && !G.flight.cruising && !m.onGround) { const k = 0.004; pos.x += (Math.random() - 0.5) * k; pos.y += (Math.random() - 0.5) * k; }
    G.ac.root.visible = true;
    cam.position.copy(pos); cam.quaternion.copy(_q);
    setFov(cam, view.fov); setNear(cam, 0.08);
    G.camPos.copy(pos); return;
  } else if (G.cine.on && cinematic(dt, _cs)) {
    cam.position.copy(_cs.pos); _m.lookAt(_cs.pos, _cs.look, _up); _q.setFromRotationMatrix(_m);
    cam.quaternion.copy(_q);
    setFov(cam, _cs.fov); setNear(cam, 0.6);
    G.camPos.copy(_cs.pos); return;
  } else if (cockpit) {
    const cz = air ? -L * 0.41 : -L * 0.3, cy = air ? 0.55 : Math.max(0.9, cfg.gearHeight * 0.5);
    _q.copy(pq);
    pos = new THREE.Vector3(0, cy, cz).applyQuaternion(_q).add(pp);
    look = new THREE.Vector3(0, cy, cz - 50).applyQuaternion(_q).add(pp);
    upv.set(0, 1, 0).applyQuaternion(_q);
    cam.position.copy(pos); _m.lookAt(pos, look, upv); cam.quaternion.setFromRotationMatrix(_m);
    setFov(cam, fovT); setNear(cam, 0.3);
    G.camPos.copy(pos); return;
  } else {
    const far = G.camMode === 2 ? 2.4 : 1;
    const dist = L * 1.65 * far * o.dist;
    const off = new THREE.Vector3(0, L * 0.30 * far, dist);
    off.applyAxisAngle(_up, o.yaw); off.applyAxisAngle(new THREE.Vector3(1, 0, 0), -o.pitch * 0.9);
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
  setFov(cam, fovT); setNear(cam, 0.6);
  pos.y = Math.max(pos.y, m.groundY + 2.5);
  if (G.shake > 0.01) { const s = G.shake * 1.1; pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s; }
  G.camPos.copy(pos);
  cam.position.copy(pos);
  _m.lookAt(pos, look, upv); _q.setFromRotationMatrix(_m);
  if (snap) cam.quaternion.copy(_q); else cam.quaternion.slerp(_q, 1 - Math.exp(-dt * 14));
}

function lobbyCamera(dt) {
  const cam = G.world.camera, m = G.model, L = G.cfg.lengthM;
  setFov(cam, S.fov); setNear(cam, 0.6);
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
function hudState() {
  const F = G.flight, m = G.model;
  const inCabin = !!F && G.camMode >= 3;
  const airline = F ? {
    from: F.from, to: F.to, fromCity: F.fromCity, toCity: F.toCity, km: F.km, pax: F.pax, comfort: F.comfort,
    canCruise: G.state === 'playing' && canCruise(), cruising: F.cruising, progress: F.progress,
    remainingKm: F.cruising ? F.remainingKm : F.km, etaMin: F.cruising ? F.etaMin : F.minutes, warp: F.warp,
    altM: F.cruising ? F.altM : m.tele.altMslFt * 0.3048, speedKmh: F.cruising ? F.speedKmh : m.tele.speedKt * 1.852,
  } : null;
  return {
    model: m, cfg: G.cfg, camera: G.world.camera, combat: G.combat, mode: S.mode, score: G.score, hp: G.hp, warn: G.warn || {},
    ils: G.ils, hdgOff: curApt().hdg + tuneOf(curApt().icao).heading, brake: G.input.brake, touch: touchUI, fps: G.fps, renderH: G.world.renderHeight,
    tilesLabel: G.world.tilesStatus === 'ok' ? (G.world.tilesSource === 'ion' ? 'Cesium 3D' : 'Google 3D') : G.world.tilesStatus === 'loading' ? 'loading…' : 'demo terrain',
    airline, cruise: !!(F && F.cruising), cabinView: inCabin && G.cabin && G.cabin.group.visible,
  };
}

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
      if (G.state === 'lobby') { G.model.update(dt); syncMesh(dt); lobbyCamera(dt); }
      w.update(dt, G.model.pos);
      if (Math.floor(now / 500) !== G._st) { G._st = Math.floor(now / 500); updateTileStatus(); }
    }
    // clouds whiteout + attribution
    $('whiteout').style.opacity = String(Math.min(0.92, w.cloudDensity * 0.95));
    const cr = $('credit');
    const txt = w.tilesStatus === 'ok' && !w.cruise ? (w.tilesSource === 'ion' ? 'Google · Cesium ion · ' : 'Google · ') + (w.attribution || 'Map data') : '';
    if (cr.textContent !== txt) cr.textContent = txt;
    // HUD
    const inGame = G.state === 'playing' || G.state === 'paused' || G.state === 'debrief';
    G.hud.draw(inGame ? hudState() : { model: null }, dt);
    w.render();
  } catch (err) {
    console.error(err);
    if (!G._errShown) { G._errShown = true; G.hud.msg('Error: ' + (err.message || err), 'bad', 8); }
  }
}

boot();
