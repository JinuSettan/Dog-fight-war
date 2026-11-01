// Persistent user settings (localStorage, guarded: it can throw in private windows / WebViews)
const KEY = 'dogfight-war.settings.v1';
const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const defaults = {
  apiKey: (import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) || '',
  ionToken: (import.meta.env && import.meta.env.VITE_CESIUM_ION_TOKEN) || '',
  geminiKey: (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || '',   // people chat (enter in the lobby; never put keys in code)
  category: 'war',           // war | airline
  aircraft: 'f15e',
  warAircraft: 'f15e',
  airport: 'VOCI',           // departure airport (also the war-mode airport)
  dest: 'OMDB',              // airliner destination
  time: 'noon',
  weather: 'auto',           // auto (snow at night) | snow | off
  mode: 'dogfight',          // dogfight | free
  start: 'runway',           // runway | air | final
  difficulty: 'normal',
  resolution: isTouch ? '720' : '1080',
  tileQuality: isTouch ? 'low' : 'med',
  clouds: isTouch ? 0.3 : 0.45,
  brightness: 1.0,
  invertPitch: false,
  assist: true,
  sound: true,
  fov: 68,
  tilt: false,               // steer by tilting the phone
  tiltRange: 28,             // degrees of tilt = full stick
  stickSens: 1.0,
  pax: 96,
  character: 'man',          // id from models/people/people.json
  crowd: isTouch ? 8 : 16,   // pedestrians while on foot
  trees: isTouch ? 'low' : 'med',   // off | low | med | high
  zombies: 'auto',           // auto (New York airports) | on | off
  traffic: isTouch ? 4 : 8,  // AI cars on the roads
  scenery: 'auto',           // auto | on | off  (3D airport buildings)
  tune: {},                  // per airport {along, across, heading, ground}
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* ignore */ }
  const out = { ...defaults, ...s };
  if (!out.apiKey) out.apiKey = defaults.apiKey;
  if (!out.ionToken) out.ionToken = defaults.ionToken;
  if (!out.geminiKey) out.geminiKey = defaults.geminiKey;
  out.tune = { ...(s.tune || {}) };
  if (out.category === 'war' && out.aircraft === 'a318') out.aircraft = out.warAircraft || 'f15e';
  return out;
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
export { isTouch };
