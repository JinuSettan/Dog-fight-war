// Street View mode: Google's own panorama viewer (arrows, links) on top, a map with the blue coverage lines below.
// Google's terms only allow Street View inside Google's viewer, so this is an overlay, not part of the 3D scene.
// Needs the "Maps JavaScript API" enabled for the Google key (Google Cloud console -> APIs).

let loading = null;

export function loadMaps(key) {
  if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const fail = (m) => { loading = null; reject(new Error(m)); };
    window.__dfwMapsReady = () => resolve();
    window.gm_authFailure = () => fail('Google rejected the key: enable "Maps JavaScript API" for it (and allow this app)');
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&callback=__dfwMapsReady';
    s.async = true; s.onerror = () => fail('Could not load Google Maps (offline?)');
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.google && window.google.maps && window.google.maps.StreetViewPanorama)) fail('Google Maps timed out'); }, 20000);
  });
  return loading;
}

/** find two numbers "lat, lon" in text (also works on a pasted Google Maps link with @lat,lon) */
export function parseLatLon(text) {
  const t = String(text || '');
  const at = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const m = at || t.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export class StreetView {
  /** @param els {root, pano, map, msg} DOM elements; @param cb {onChange(lat,lon)} */
  constructor(els, cb = {}) {
    this.el = els; this.cb = cb; this.pano = null; this.map = null; this.marker = null; this.svc = null;
    this.driveT = null; this.last = null; this.isOpen = false;
  }

  say(t) { this.el.msg.textContent = t || ''; this.el.msg.style.display = t ? 'block' : 'none'; }

  async open(lat, lon, key) {
    this.isOpen = true; this.el.root.classList.remove('hidden'); this.say('Loading Street View…');
    try { await loadMaps(key); } catch (e) { this.say(e.message); return false; }
    return this.go(lat, lon);
  }

  async go(lat, lon) {
    const g = window.google.maps, here = { lat, lng: lon };
    if (!this.svc) this.svc = new g.StreetViewService();
    if (!this.map) {
      this.map = new g.Map(this.el.map, { center: here, zoom: 17, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false });
      new g.StreetViewCoverageLayer().setMap(this.map);
      this.marker = new g.Marker({ map: this.map, position: here, icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
      this.map.addListener('click', (e) => this._pick(e.latLng));
    } else { this.map.setCenter(here); this.marker.setPosition(here); }
    const r = await this.svc.getPanorama({ location: here, radius: 250, preference: 'nearest', source: 'outdoor' }).catch(() => null);
    if (!r || !r.data || !r.data.location) { this.say('No Street View within 250 m — tap a blue line on the map'); return false; }
    this.say('');
    if (!this.pano) {
      this.pano = new g.StreetViewPanorama(this.el.pano, {
        pano: r.data.location.pano, pov: { heading: 0, pitch: 0 }, zoom: 0, addressControl: false, fullscreenControl: false, motionTracking: false,
        motionTrackingControl: false, zoomControl: false, panControl: false, enableCloseButton: false, linksControl: true, clickToGo: true, showRoadLabels: true,
      });
      this.pano.addListener('position_changed', () => this._moved());
    } else this.pano.setPano(r.data.location.pano);
    this._moved();
    return true;
  }

  _moved() {
    const p = this.pano && this.pano.getPosition(); if (!p) return;
    this.last = { lat: p.lat(), lon: p.lng() };
    if (this.map) { this.map.panTo(p); this.marker.setPosition(p); }
    this.cb.onChange && this.cb.onChange(this.last.lat, this.last.lon);
  }

  async _pick(latLng) {
    const r = await this.svc.getPanorama({ location: latLng, radius: 60 }).catch(() => null);
    if (r && r.data && r.data.location && this.pano) this.pano.setPano(r.data.location.pano);
  }

  /** hold the drive button: step to the link that points roughly where you look */
  driveStart() { if (this.driveT || !this.pano) return; this._step(); this.driveT = setInterval(() => this._step(), 750); }
  driveStop() { if (this.driveT) clearInterval(this.driveT); this.driveT = null; }
  _step() {
    const p = this.pano; if (!p) return;
    const links = p.getLinks() || []; if (!links.length) return;
    const h = p.getPov().heading;
    let best = null, bd = 1e9;
    for (const l of links) { const d = Math.abs((((l.heading - h) % 360) + 540) % 360 - 180); if (d < bd) { bd = d; best = l; } }
    if (best && bd < 80) p.setPano(best.pano);
  }

  close() { this.driveStop(); this.isOpen = false; this.el.root.classList.add('hidden'); }
}
