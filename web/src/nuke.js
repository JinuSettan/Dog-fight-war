// Nuclear bomb: a falling bomb, then flash -> fireball -> shock ring -> rising stem + mushroom cap + dust. All procedural (no textures).
import * as THREE from 'three';

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}

export class Nuke {
  constructor(scene, hooks = {}) {
    this.scene = scene; this.hooks = hooks; this.bombs = []; this.blasts = [];
    this.tex = puffTexture();
    this.bombGeo = new THREE.CapsuleGeometry(0.45, 2.6, 4, 12); this.bombGeo.rotateX(Math.PI / 2);
    this.bombMat = new THREE.MeshStandardMaterial({ color: 0x5c6258, metalness: 0.6, roughness: 0.4 });
  }
  /** release a bomb from pos with the carrier's velocity */
  drop(pos, vel, dir) {
    const m = new THREE.Group(); m.add(new THREE.Mesh(this.bombGeo, this.bombMat));
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.7), this.bombMat); fin.position.z = 1.4; m.add(fin); const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2; m.add(fin2);
    m.position.copy(pos); this.scene.add(m);
    this.bombs.push({ m, v: vel.clone(), t: 0 });
  }
  _detonate(p) {
    const g = new THREE.Group(); g.position.copy(p); this.scene.add(g);
    const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, fog: false })); g.add(fire);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 2; g.add(ring);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x4b3a30, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false })); g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshBasicMaterial({ color: 0x6b4a36, transparent: true, fog: false, depthWrite: false })); g.add(cap);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 12, 40), new THREE.MeshBasicMaterial({ color: 0x8a5a3c, transparent: true, fog: false, depthWrite: false })); torus.rotation.x = Math.PI / 2; g.add(torus);
    const light = new THREE.PointLight(0xffb060, 0, 3000, 1.2); light.position.y = 40; g.add(light);
    const puffs = []; for (let i = 0; i < 70; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: i % 3 ? 0x5a4a40 : 0xffa050, transparent: true, depthWrite: false, fog: false })); s.visible = false; g.add(s); puffs.push({ s, a: Math.random() * 6.28, r: Math.random(), h: Math.random(), d: Math.random() * 6 }); }
    const b = { g, fire, ring, stem, cap, torus, light, puffs, t: 0, p: p.clone(), flash: 0 };
    this.blasts.push(b); this.hooks.onDetonate && this.hooks.onDetonate(p);
  }
  update(dt, ground) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t += dt; b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
      b.m.lookAt(b.m.position.clone().add(b.v));
      const gy = ground(b.m.position.x, b.m.position.z, b.m.position.y);
      if (b.m.position.y <= gy + 1 || b.t > 90) { const p = b.m.position.clone(); p.y = Math.max(gy, 0); this.scene.remove(b.m); this.bombs.splice(i, 1); this._detonate(p); }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]; b.t += dt; const t = b.t;
      const f = Math.min(1, t / 3);
      const fr = 30 + 190 * Math.pow(f, 0.55);
      b.fire.scale.setScalar(fr); b.fire.position.y = fr * 0.5 + t * 20;
      b.fire.material.opacity = Math.max(0, 1 - t / 7); b.fire.material.color.setRGB(1, Math.max(0.25, 0.95 - t * 0.12), Math.max(0.05, 0.7 - t * 0.14));
      b.light.intensity = Math.max(0, 8 - t * 1.6) * 3e5 / 1e3;
      const rr = Math.min(2200, t * 520); b.ring.scale.setScalar(Math.max(1, rr)); b.ring.material.opacity = Math.max(0, 0.9 - rr / 2300);
      const h = Math.min(900, 40 + t * 70);
      b.stem.scale.set(60 + t * 6, h, 60 + t * 6); b.stem.position.y = h / 2; b.stem.material.opacity = t < 2 ? t / 2 * 0.9 : Math.max(0, 0.9 - (t - 40) / 30);
      const capR = Math.min(420, 40 + t * 40);
      b.cap.scale.set(capR, capR * 0.55, capR); b.cap.position.y = h + capR * 0.1; b.cap.material.opacity = t < 3 ? 0.9 * Math.min(1, t / 3) : Math.max(0, 0.9 - (t - 45) / 30);
      b.torus.scale.set(capR * 0.95, capR * 0.95, capR * 0.95 * 0.6); b.torus.position.y = h - capR * 0.12; b.torus.material.opacity = b.cap.material.opacity * 0.9;
      for (const p of b.puffs) {
        p.s.visible = t > p.d * 0.3; if (!p.s.visible) continue;
        const k = Math.min(1, (t - p.d * 0.3) / 20), ang = p.a + t * 0.05, R = 40 + p.r * (260 * k + 30);
        p.s.position.set(Math.cos(ang) * R, (p.h * 0.35 + k * 0.6) * h + 10, Math.sin(ang) * R); p.s.scale.setScalar(80 + 220 * p.r * (0.4 + k));
        p.s.material.opacity = Math.max(0, 0.55 * (1 - t / 55));
      }
      if (t > 60) { this.scene.remove(b.g); b.g.traverse((o) => { o.geometry?.dispose?.(); }); this.blasts.splice(i, 1); }
    }
  }
  get active() { return this.bombs.length > 0 || this.blasts.length > 0; }
  clear() { for (const b of this.bombs) this.scene.remove(b.m); for (const b of this.blasts) this.scene.remove(b.g); this.bombs = []; this.blasts = []; }
}
