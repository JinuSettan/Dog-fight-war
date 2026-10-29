// Persistent user settings (localStorage, guarded: it can throw in private windows / WebViews)
const KEY = 'dogfight-war.settings.v1';
const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const defaults = {
  apiKey: (import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) || '',
  aircraft: 'f15e',
  airport: 'VOCI',
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
  tune: {},                  // per airport {along, across, heading, ground}
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* ignore */ }
  const out = { ...defaults, ...s };
  if (!out.apiKey) out.apiKey = defaults.apiKey;
  out.tune = { ...(s.tune || {}) };
  return out;
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
export { isTouch };
