// World: renderer, sky, light, clouds, Google Photorealistic 3D Tiles (or procedural fallback), runway.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { CloudField } from './particles.js';
import { createRunway } from './models.js';
import { buildAirportScenery } from './scenery.js';
import { TIMES, TILE_QUALITY, RESOLUTIONS } from './config.js';
import { smoothstep } from './math.js';

const DEG = Math.PI / 180;
export const RUNWAY_Y = 0.45;               // top surface of the virtual runway slab (world y); real/terrain ground sits at y = 0 below it

// ---------- procedural fallback terrain -------------------------------------------------
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let h = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { h += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.07; }
  return h;
}
export function terrainRaw(x, z) { return fbm(x / 9000 + 11.3, z / 9000 + 4.7); }
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const flat = smoothstep(2600, 8000, d);
  const raw = terrainRaw(x, z);
  const h = Math.max(0, (raw - 0.42) * 2400) * flat;
  return h < 1 ? 0 : h;
}

function buildTerrain() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false });
  const make = (size, seg, dy) => {
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      const raw = terrainRaw(x, z);
      const flat = smoothstep(2600, 8000, Math.hypot(x, z));
      pos.setY(i, h + dy);
      const field = hash2(Math.floor(x / 350), Math.floor(z / 350));
      if (raw < 0.42 - 0.025 && flat > 0.5) c.setRGB(0.10, 0.24, 0.42);                 // water
      else if (h > 1500) c.setRGB(0.92, 0.94, 0.97);                                      // snow
      else if (h > 900) c.setRGB(0.42, 0.40, 0.37);                                       // rock
      else if (h > 450) c.setRGB(0.30 + 0.05 * field, 0.34, 0.22);                        // dry forest
      else c.setRGB(0.20 + 0.18 * field, 0.38 + 0.12 * field, 0.14 + 0.06 * field);      // fields
      c.convertSRGBToLinear();
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  group.add(make(24000, 240, 0));
  group.add(make(260000, 120, -8));

  // towns / city blocks
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc9c4bb, roughness: 0.9 }), 2600);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  const centers = [[-5200, -6500, 1400], [6800, 4300, 1100], [-9500, 7000, 900], [3000, -14000, 1800]];
  for (const [cx, cz, R] of centers) {
    for (let i = 0; i < 650 && n < 2600; i++) {
      const a = hash2(i, cx) * 6.283, r = Math.sqrt(hash2(i, cz)) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const gy = terrainHeight(x, z);
      if (gy < 1.5) continue;
      const core = 1 - r / R;
      const hh = 12 + hash2(i + 7, n) * (30 + 220 * core * core);
      const w = 22 + hash2(i + 3, n) * 38;
      s.set(w, hh, w * (0.7 + hash2(i, 9) * 0.6));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(hash2(i, 5) * 3) * 0.2 + 0.1);
      p.set(Math.round(x / 60) * 60, gy + hh / 2, Math.round(z / 60) * 60);
      m.compose(p, q, s);
      boxes.setMatrixAt(n++, m);
    }
  }
  boxes.count = n;
  group.add(boxes);
  return group;
}

// ---------- sky -------------------------------------------------------------------------
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHor, uSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(uHor, uMid, smoothstep(0.0, 0.18, h)) : uHor;
        c = mix(c, uTop, smoothstep(0.12, 0.85, h));
        if (h < 0.0) c = mix(uHor, uHor * 0.85, smoothstep(0.0, -0.3, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.18 + pow(s, 90.0) * 0.6 + smoothstep(0.9993, 0.9998, s) * 3.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -100;
  return sky;
}

export class World {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.s = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.6, 400000);
    this.scene.add(this.camera);

    // image based light so metallic aircraft are not black
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x706850, 1.0);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sky = buildSky();
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0xcad9e8, 2.2e-5);

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.terrain = buildTerrain();
    this.scene.add(this.terrain);

    this.clouds = new CloudField();
    this.scene.add(this.clouds.mesh);

    this.runwayHolder = new THREE.Group();
    this.scene.add(this.runwayHolder);
    this.runway = null;

    this.tiles = null;
    this.tilesStatus = 'off';       // off | loading | ok | error
    this.tilesError = '';
    this.reorient = null;
    this.airport = null;
    this.tune = { along: 0, across: 0, heading: 0, ground: 0 };
    this.groundShift = 0;
    this.attribution = '';
    this._ray = new THREE.Raycaster();
    this._ray.firstHitOnly = true;
    this._down = new THREE.Vector3(0, -1, 0);
    this._org = new THREE.Vector3();
    this.pixelRatioAuto = 1;
    this.fpsAvg = 60;
    this.timeId = 'noon';
    this.cloudDensity = 0;
    this._drawCalls = 0;
    this.applyResolution();
  }

  // ---------- setup ----------
  async init() {
    await this.setAirportRunway(500);
    this.setTime(this.s.time);
    this.applySettings(this.s);
    this.setupTiles();
  }

  setupTiles() {
    if (this.tiles) {
      this.worldRoot.remove(this.tiles.group);
      this.tiles.dispose();
      this.tiles = null;
    }
    const key = (this.s.apiKey || '').trim();
    const ion = (this.s.ionToken || '').trim();
    if (!key && !ion) { this.tilesStatus = 'off'; this.terrain.visible = true; this.tilesSource = ''; return; }
    try {
      const tiles = new TilesRenderer();
      if (key) { tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true })); this.tilesSource = 'google'; }
      else { tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: ion, assetId: '2275207', autoRefreshToken: true })); this.tilesSource = 'ion'; }
      const draco = new DRACOLoader();
      draco.setDecoderPath((import.meta.env?.BASE_URL ?? './') + 'draco/');
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
      const ap = this.airport || { lat: 0, lon: 0 };
      this.reorient = new ReorientationPlugin({ lat: ap.lat * DEG, lon: ap.lon * DEG, height: 0 });
      tiles.registerPlugin(this.reorient);
      if (this.s.tileQuality === 'high' || this.s.tileQuality === 'ultra') tiles.registerPlugin(new TilesFadePlugin());
      tiles.setCamera(this.camera);
      tiles.setResolutionFromRenderer(this.camera, this.renderer);
      tiles.errorTarget = (TILE_QUALITY.find((q) => q.id === this.s.tileQuality) || TILE_QUALITY[1]).sse;
      const lru = tiles.lruCache;
      if (lru) {
        if ('minSize' in lru) lru.minSize = 500;
        if ('maxSize' in lru) lru.maxSize = 1400;
        if ('maxBytesSize' in lru) lru.maxBytesSize = (this.s.tileQuality === 'low' ? 350 : 700) * 1024 * 1024;
      }
      tiles.addEventListener('load-root-tileset', () => { if (this.tilesStatus !== 'ok') this.tilesStatus = 'ok'; this.terrain.visible = !!this.cruise; this.groundCalibrated = false; this.updateSceneryVisibility(); });
      tiles.addEventListener('load-error', (e) => {
        const msg = String(e?.error?.message || e?.error || 'tile load error');
        if (this.tilesStatus === 'loading' || !tiles.root) {
          this.tilesStatus = 'error'; this.tilesError = msg; this.terrain.visible = true;
        }
      });
      this.worldRoot.add(tiles.group);
      this.tiles = tiles;
      this.tilesStatus = 'loading';
      this.groundCalibrated = false;
      this.applyRoot();
    } catch (err) {
      console.error('tiles setup failed', err);
      this.tilesStatus = 'error'; this.tilesError = String(err); this.terrain.visible = true;
    }
  }

  async setAirportRunway(len) {
    if (this.runway) { this.runwayHolder.remove(this.runway); this.runway = null; }
    this.runway = await createRunway(len);
    this.runway.position.y = RUNWAY_Y;
    this.runwayHolder.add(this.runway);
    this.runwayLen = len;
  }

  async setAirport(ap, tune = {}) {
    this.airport = ap;
    this.tune = { along: 0, across: 0, heading: 0, ground: 0, ...tune };
    if (!this.runway || Math.abs((this.runwayLen || 0) - ap.len) > 1) await this.setAirportRunway(ap.len);
    await this.buildScenery(ap);
    if (this.reorient && this.tiles) {
      this.reorient.transformLatLonHeightToOrigin(ap.lat * DEG, ap.lon * DEG, 0);
      this.reorient.lat = ap.lat * DEG; this.reorient.lon = ap.lon * DEG;
    }
    this.groundCalibrated = false;
    this.applyRoot();
  }

  async buildScenery(ap) {
    const token = (this._sceneryToken = (this._sceneryToken || 0) + 1);
    if (this.scenery) { this.runwayHolder.remove(this.scenery.root); this.scenery = null; }
    const W = (this.runway && this.runway.userData.width) || 45;
    const sc = await buildAirportScenery(ap, this.runwayLen || ap.len, W, RUNWAY_Y, { parked: this.s.sceneryJets ?? 5 });
    if (token !== this._sceneryToken) return;      // a newer airport was requested meanwhile
    this.scenery = sc; this.runwayHolder.add(sc.root);
    this.updateSceneryVisibility();
  }

  /** 3D buildings: always in 'on', never in 'off', and only without real map buildings in 'auto' */
  updateSceneryVisibility() {
    if (!this.scenery) return;
    const mode = this.s.scenery || 'auto';
    const real = this.tilesStatus === 'ok' && !this.cruise;
    this.scenery.buildings.visible = mode === 'on' || (mode === 'auto' && !real);
  }

  /** At cruise altitude the map tiles are not needed: hide + pause them and show the stylised terrain */
  setCruise(on) {
    this.cruise = !!on;
    if (this.tiles) this.tiles.group.visible = !on;
    this.terrain.visible = on || this.tilesStatus !== 'ok';
    this.updateSceneryVisibility();
  }

  setTune(tune) { this.tune = { ...this.tune, ...tune }; this.applyRoot(); }

  applyRoot() {
    const ap = this.airport; if (!ap) return;
    const t = this.tune;
    this.worldRoot.rotation.y = (ap.hdg + t.heading) * DEG + Math.PI;
    this.worldRoot.position.set(-t.across, this.groundShift + (t.ground || 0), t.along);
    this.worldRoot.updateMatrixWorld(true);
  }

  /** Find the real surface height under the runway centre and put it at y = RUNWAY_Y */
  calibrateGround() {
    if (!this.tiles || !this.tiles.root) return false;
    this.worldRoot.position.y = 0; this.worldRoot.updateMatrixWorld(true);
    const hits = [];
    for (const [x, z] of [[0, 0], [0, 400], [0, -400], [30, 0], [-30, 0]]) {
      const h = this._rawTileHeight(x, z);
      if (h !== null) hits.push(h);
    }
    if (!hits.length) return false;
    hits.sort((a, b) => a - b);
    const med = hits[Math.floor(hits.length / 2)];
    this.groundShift = -med;                 // real surface under the runway centre -> y = 0 (slab floats 0.45 m above)
    this.applyRoot();
    this.groundCalibrated = true;
    return true;
  }

  _rawTileHeight(x, z) {
    if (!this.tiles) return null;
    this._org.set(x, 9000, z);
    this._ray.set(this._org, this._down);
    this._ray.far = 18000;
    const hits = this._ray.intersectObject(this.tiles.group, true);
    return hits.length ? 9000 - hits[0].distance : null;
  }

  groundHeight(x, z, prev = 0) {
    // flat virtual runway zone
    const halfL = (this.runwayLen || 3000) / 2 + 350;
    if (Math.abs(x) < 110 && Math.abs(z) < halfL) return RUNWAY_Y;
    if (this.tiles && this.tilesStatus === 'ok' && !this.cruise) {
      if (!this.groundCalibrated) return 0;
      const h = this._rawTileHeight(x, z);
      return h === null ? prev : h;
    }
    return terrainHeight(x, z);
  }

  // ---------- look & quality ----------
  setTime(id) {
    const t = TIMES.find((x) => x.id === id) || TIMES[1];
    this.timeId = t.id;
    const sunDir = new THREE.Vector3(...t.sun).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(5000);
    this.sunDir = sunDir;
    const u = this.sky.material.uniforms;
    u.uTop.value.set(t.sky[0]); u.uMid.value.set(t.sky[1]); u.uHor.value.set(t.sky[2]);
    u.uSun.value.copy(sunDir);
    this.fogColor = new THREE.Color(t.fog);
    this.scene.fog.color.copy(this.fogColor);
    this.sun.intensity = t.sunI * 0.62 * (this.s.brightness || 1);
    this.hemi.intensity = t.hemi * 0.5 * (this.s.brightness || 1);
    const sunCol = t.id === 'sunset' ? new THREE.Color(1.0, 0.82, 0.7) : new THREE.Color(1, 1, 1);
    this.clouds.setSun(sunDir, sunCol);
    this._syncFog();
  }

  _syncFog() {
    const d = this.scene.fog.density;
    this.clouds.setFog(this.fogColor, d);
    this.onFogChange && this.onFogChange(this.fogColor, d);
  }

  applySettings(s) {
    this.s = s;
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = 0.95 * (s.brightness || 1);
    this.clouds.setCoverage(s.clouds);
    this.clouds.mesh.visible = s.clouds > 0.01;
    if (this.tiles) this.tiles.errorTarget = (TILE_QUALITY.find((q) => q.id === s.tileQuality) || TILE_QUALITY[1]).sse;
    this.setTime(s.time);
    this.applyResolution();
    this.updateSceneryVisibility();
  }

  applyResolution() {
    const res = RESOLUTIONS.find((r) => r.id === this.s.resolution) || RESOLUTIONS[0];
    const h = window.innerHeight, w = window.innerWidth;
    let pr;
    if (res.id === 'auto') pr = this.pixelRatioAuto;
    else pr = res.h / h;
    pr = Math.max(0.35, Math.min(pr, 3.5));
    // cap total pixels (WebGL limits / memory)
    const maxPixels = 3840 * 2160 * 1.05;
    if (w * h * pr * pr > maxPixels) pr = Math.sqrt(maxPixels / (w * h));
    this._pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.tiles) this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
  }
  get renderHeight() { return Math.round(window.innerHeight * this._pr); }

  /** auto resolution: keep ~50 fps */
  adaptResolution(dt) {
    const fps = 1 / Math.max(dt, 1e-3);
    this.fpsAvg += (fps - this.fpsAvg) * 0.04;
    if (this.s.resolution !== 'auto') return;
    this._adaptT = (this._adaptT || 0) + dt;
    if (this._adaptT < 1.2) return;
    this._adaptT = 0;
    let pr = this.pixelRatioAuto;
    if (this.fpsAvg < 42) pr *= 0.88; else if (this.fpsAvg > 58) pr *= 1.07;
    const maxPr = Math.min(1080 / window.innerHeight, 1.25);
    pr = Math.max(0.45, Math.min(pr, Math.max(0.6, maxPr)));
    if (Math.abs(pr - this.pixelRatioAuto) > 0.02) { this.pixelRatioAuto = pr; this.applyResolution(); }
  }

  // ---------- per frame ----------
  update(dt, focusPos) {
    const cam = this.camera;
    this.sky.position.copy(cam.position);
    this.sun.target.position.copy(focusPos);
    this.sun.position.copy(focusPos).addScaledVector(this.sunDir, 3000);
    if (this.tiles && !this.cruise) {
      this.tiles.setCamera(cam);
      this.tiles.setResolutionFromRenderer(cam, this.renderer);
      cam.updateMatrixWorld();
      this.tiles.update();
      if (this.tilesStatus === 'ok' && !this.groundCalibrated && this.tiles.root) {
        // wait until the runway area has some loaded geometry
        this._calT = (this._calT || 0) + dt;
        if (this._calT > 0.4) { this._calT = 0; this.calibrateGround(); }
      }
      const a = this.tiles.getAttributions?.();
      if (a && a.length) { const t = a.filter((x) => x.type === 'string').map((x) => x.value).join(' · '); if (t !== this.attribution) this.attribution = t; }
    }
    this.clouds.update(focusPos);
    this.cloudDensity = this.clouds.mesh.visible ? this.clouds.densityAt(cam.position) : 0;
    this.adaptResolution(dt);
  }

  /** 0..1 of how much the tile renderer still has to do around the camera */
  get loadProgress() {
    if (!this.tiles || this.tilesStatus === 'off') return 1;
    if (this.tilesStatus === 'error') return 1;
    if (!this.tiles.root) return 0.05;
    const st = this.tiles.stats || {};
    const pending = (st.queued || 0) + (st.downloading || 0) + (st.parsing || 0);
    const ready = this.groundCalibrated ? 1 : 0.4;
    return Math.max(0.1, Math.min(1, ready * (pending === 0 ? 1 : 1 / (1 + pending / 12))));
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
