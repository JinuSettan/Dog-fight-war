// Route maths for airliner flights: great-circle distance, bearing and a believable flight time.
const R_EARTH = 6371;
const D2R = Math.PI / 180;

export function distKm(a, b) {
  const dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** initial true bearing a -> b in degrees */
export function bearingDeg(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

export function flightPlan(a, b, cruiseKmh = 830) {
  const km = distKm(a, b);
  // 22 min for climb + descent overhead on top of the cruise leg
  const minutes = Math.round(km / cruiseKmh * 60 + 22);
  return { km, minutes, bearing: bearingDeg(a, b) };
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
