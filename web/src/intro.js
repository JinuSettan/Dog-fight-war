// "VOIDFORGE STUDIOS presents / RISE OF THE UNDERWORLD": GTA-style opening on the New York avenue.
// Timeline (s): 0-2.8 studio card, 2.8-5.2 "Presents", 5.2-6 fade into the street, 6-19 the incident (getaway car + police chase + an officer
// firing + the hero watching), 14.5-18.5 title card, 19-20 fade, then the player takes over.
const D = 20;
export class Intro {
  constructor() {
    const css = `#introCard{position:fixed;inset:0;z-index:40;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f2efe6;font-family:Georgia,'Times New Roman',serif;text-align:center;opacity:0;transition:opacity .9s}
#introCard .a{font-size:min(8vw,56px);letter-spacing:.32em;font-weight:700}#introCard .b{font-size:min(4vw,22px);letter-spacing:.5em;margin-top:14px;opacity:.8;font-style:italic}
#introCard.title .a{font-size:min(11vw,84px);letter-spacing:.14em;color:#e8dcc0;text-shadow:0 0 30px #000,0 4px 0 #3b2a1a}
#introBlack{position:fixed;inset:0;background:#000;z-index:39;pointer-events:none;opacity:1;transition:opacity .9s}`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    this.black = document.createElement('div'); this.black.id = 'introBlack'; this.black.style.display = 'none';
    this.card = document.createElement('div'); this.card.id = 'introCard'; this.card.innerHTML = '<div class="a"></div><div class="b"></div>';
    document.body.append(this.black, this.card);
    this.on = false; this.t = 0; this.stage = -1;
  }
  start() { this.on = true; this.t = 0; this.stage = -1; this.black.style.display = 'block'; this.black.style.transition = 'none'; this.black.style.opacity = '1'; this.card.style.opacity = '0'; this.card.classList.remove('title'); }
  stop() { this.on = false; this.black.style.display = 'none'; this.card.style.opacity = '0'; }
  _show(a, b, title = false) { this.card.classList.toggle('title', title); this.card.children[0].textContent = a; this.card.children[1].textContent = b; this.card.style.opacity = '1'; }
  /** advance; returns the shot number (0 = black, 1 = low street cam, 2 = over-the-shoulder) or -1 when finished */
  update(dt) {
    if (!this.on) return -1; this.t += dt; const t = this.t;
    const stage = t < 2.8 ? 0 : t < 5.2 ? 1 : t < 14.5 ? 2 : t < 18.6 ? 3 : t < D - 1 ? 4 : 5;
    if (stage !== this.stage) {
      this.stage = stage;
      if (stage === 0) this._show('VOIDFORGE STUDIOS', '');
      if (stage === 1) this._show('VOIDFORGE STUDIOS', 'PRESENTS');
      if (stage === 2) { this.card.style.opacity = '0'; this.black.style.transition = 'opacity 1.2s'; this.black.style.opacity = '0'; }
      if (stage === 3) this._show('RISE OF THE UNDERWORLD', 'NEW YORK', true);
      if (stage === 4) this.card.style.opacity = '0';
      if (stage === 5) { this.black.style.transition = 'opacity .9s'; this.black.style.opacity = '1'; }
    }
    if (t >= D) { this.black.style.opacity = '0'; this.stop(); return -1; }
    return t < 5.2 ? 0 : t < 11 ? 1 : 2;
  }
  skip() { if (this.on && this.t < D - 1) this.t = D - 1; }
}
export const INTRO_LEN = D;
