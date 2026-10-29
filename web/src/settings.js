// Persistent user settings (localStorage, guarded: it can throw in private windows / WebViews)
const KEY = 'dogfight-war.settings.v1';
const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const defaults = {
  apiKey: (import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) || '',
  ionToken: (import.meta.env && import.meta.env.VITE_CESIUM_ION_TOKEN) || '',
  category: 'war',           // war | airline
  aircraft: 'f15e',
  warAircraft: 'f15e',
  airport: 'KJFK',           // New York JFK is the default departure / war-mode airport
  dest: 'OMDB',              // airliner destination
  time: 'noon',
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
  scenery: 'auto',           // auto | on | off  (3D airport buildings)
  tune: {},                  // per airport {along, across, heading, ground}
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* ignore */ }
  const out = { ...defaults, ...s };
  // Migrate the app's former default departure (Cochin) to the requested New York JFK start.
  // Keep any other airport the player deliberately selected.
  if (!s.airport || s.airport === 'VOCI') out.airport = 'KJFK';
  if (!out.apiKey) out.apiKey = defaults.apiKey;
  if (!out.ionToken) out.ionToken = defaults.ionToken;
  out.tune = { ...(s.tune || {}) };
  if (out.category === 'war' && out.aircraft === 'a318') out.aircraft = out.warAircraft || 'f15e';
  return out;
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
export { isTouch };
