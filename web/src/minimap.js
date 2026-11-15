// GTA-style radar: small square map in the corner, rotates so "up" is where the camera looks.
// Draws the road graph (roads.js), cars (white), zombies (red) and the player arrow.
export class Minimap {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.range = 95; }

  resize() {
    const r = this.c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(64, Math.round(r.width * d)); if (this.c.width !== w) { this.c.width = w; this.c.height = w; }
  }

  /** @param o {x, z, view (yaw of the camera), heading (yaw of the player), roads, cars[], zombies[], mine (car to skip)} */
  draw(o) {
    const g = this.g, W = this.c.width; if (!W) return;
    const s = (W / 2) / this.range, sv = Math.sin(o.view), cv = Math.cos(o.view);
    const fx = sv, fz = cv, rx = -cv, rz = sv;                    // camera forward / right on the ground
    const X = (x, z) => ((x - o.x) * rx + (z - o.z) * rz) * s + W / 2;
    const Y = (x, z) => W / 2 - ((x - o.x) * fx + (z - o.z) * fz) * s;
    g.save(); g.clearRect(0, 0, W, W);
    const rad = W * 0.06; g.beginPath(); g.roundRect(0, 0, W, W, rad); g.clip();
    g.fillStyle = '#2a2f36'; g.fillRect(0, 0, W, W);
    // roads
    const nodes = o.roads && o.roads.nodes ? o.roads.nodes : [], lim = this.range * 1.7;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#b4bac2'; g.lineWidth = Math.max(3, 8 * s);
    g.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]; if (Math.abs(n.x - o.x) > lim || Math.abs(n.z - o.z) > lim) continue;
      for (const j of n.e) { if (j < i) continue; const m = nodes[j]; g.moveTo(X(n.x, n.z), Y(n.x, n.z)); g.lineTo(X(m.x, m.z), Y(m.x, m.z)); }
    }
    g.stroke();
    g.strokeStyle = '#4a515b'; g.lineWidth = Math.max(1, 1.2 * s); g.stroke();
    // zombies, cars
    g.fillStyle = '#e5483a';
    for (const z of o.zombies || []) { if (z.state === 'dead') continue; const x = X(z.pos.x, z.pos.z), y = Y(z.pos.x, z.pos.z); if (x < 0 || y < 0 || x > W || y > W) continue; g.beginPath(); g.arc(x, y, Math.max(2.2, W * 0.017), 0, 6.3); g.fill(); }
    g.fillStyle = '#f3f5f7';
    for (const c of o.cars || []) { if (c === o.mine || c.wrecked) continue; const x = X(c.pos.x, c.pos.z), y = Y(c.pos.x, c.pos.z); if (x < 0 || y < 0 || x > W || y > W) continue; g.fillRect(x - W * 0.018, y - W * 0.018, W * 0.036, W * 0.036); }
    // player arrow (points along the player's heading relative to the view)
    const hx = Math.sin(o.heading), hz = Math.cos(o.heading), sx = hx * rx + hz * rz, sy = -(hx * fx + hz * fz);
    g.translate(W / 2, W / 2); g.rotate(Math.atan2(sx, -sy));
    const a = W * 0.065; g.beginPath(); g.moveTo(0, -a * 1.3); g.lineTo(a, a); g.lineTo(0, a * 0.45); g.lineTo(-a, a); g.closePath();
    g.fillStyle = '#4aa8ff'; g.fill(); g.lineWidth = Math.max(1.5, W * 0.012); g.strokeStyle = '#fff'; g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = Math.max(2, W * 0.025); g.beginPath(); g.roundRect(0, 0, W, W, rad); g.stroke();
  }
}
