// Wanted / crime logic (pure, no three.js): heat from crimes -> police stars -> the army.
//  - killing civilians / cops / soldiers, carjacking, running people over, shooting at the law raise "heat"
//  - killing ENEMIES (jets, zombies) is never a crime
//  - 4+ stars OR 5 civilian kills OR killing a soldier = treason level: the army comes
export const CRIMES = { civilian: 30, runover: 25, carjack: 15, cop: 55, soldier: 80, shoot: 8, bomb: 100 };
export class Wanted {
  constructor() { this.reset(); }
  reset() { this.heat = 0; this.kills = 0; this.quiet = 0; this.treason = false; }
  crime(kind) {
    const add = CRIMES[kind] || 0; if (!add) return this.level;
    this.heat = Math.min(125, this.heat + add); this.quiet = 0;
    if (kind === 'civilian' || kind === 'runover') this.kills++;
    if (kind === 'soldier' || kind === 'bomb' || this.kills >= 5) this.treason = true;
    return this.level;
  }
  get level() { return this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 25)); }
  get army() { return this.treason || this.level >= 4; }
  get police() { return this.level > 0; }
  /** how many units should be hunting the player */
  want() { const l = this.level; return { cops: l ? Math.min(8, 1 + l * 2 - (this.army ? 2 : 0)) : 0, army: this.army ? Math.min(8, 3 + l) : 0 }; }
  update(dt, seen) {
    if (this.heat <= 0) return;
    this.quiet += dt;
    if (this.quiet > (seen ? 25 : 10)) { this.heat = Math.max(0, this.heat - dt * 3.2); if (this.heat <= 0) { this.treason = false; this.kills = 0; } }
  }
}
