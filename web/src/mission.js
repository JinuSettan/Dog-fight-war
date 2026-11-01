// "Who did it?" case: five pedestrians are suspects. One took a bag and hid it; two others saw something; the rest are innocent.
// The story is random every time. People answer through the chat (talk.js) using the secret role text given here.
const ITEMS = ['bag', 'suitcase', 'gold watch', 'laptop', 'wallet'];
const PLACES = ['behind the terminal building', 'near the control tower', 'next to the fuel tanks', 'in the car park', 'under the apron lights'];
const VICTIMS = ['Mr. Thomas', 'Mrs. Pillai', 'Captain Roy', 'Dr. Menon', 'Mr. Kareem'];

export class Case {
  constructor() { this.active = false; this.suspects = []; this.solved = false; this.wrong = 0; }

  start(npcs, city) {
    if (!npcs || npcs.length < 5) return false;
    const pick = npcs.slice(0, 5), k = Math.floor(Math.random() * 5), r = (a) => a[Math.floor(Math.random() * a.length)];
    this.item = r(ITEMS); this.place = r(PLACES); this.victim = r(VICTIMS); this.city = city; this.culprit = pick[k]; this.suspects = pick; this.active = true; this.solved = false; this.wrong = 0;
    const others = pick.filter((n) => n !== this.culprit); const c = this.culprit.who;
    pick.forEach((n) => { n.extra = ''; });
    this.culprit.extra = `SECRET: you stole ${this.victim}'s ${this.item} and hid it ${this.place}. Never admit it easily: deny, get nervous, blame others. Only if the player asks very directly where the ${this.item} is, slip and half-reveal the place.`;
    others[0].extra = `You saw who stole ${this.victim}'s ${this.item}: it was a ${c.female ? 'woman' : 'man'}. You do not know the name. Tell this only if the player asks what you saw.`;
    others[1].extra = `You saw who stole ${this.victim}'s ${this.item}: the person's name starts with the letter ${c.name[0]}. Tell this only if the player asks what you saw.`;
    others[2].extra = `You know nothing about the theft but you noticed ${r(others.filter((o) => o !== others[2])).who.name} looking nervous near the terminal.`;
    others[3].extra = 'You know nothing about the theft. You are annoyed that people are asking.';
    return true;
  }

  text() { return `CASE: ${this.victim}'s ${this.item} was stolen at ${this.city} airport. Suspects: ${this.suspects.map((n) => n.who.name).join(', ')}. Talk (T), then ACCUSE.`; }
  isSuspect(n) { return this.active && !this.solved && this.suspects.includes(n); }
  accuse(n) {
    if (!this.isSuspect(n)) return null;
    if (n === this.culprit) { this.solved = true; return { ok: true, text: `${n.who.name} breaks down: "Yes… it was me. The ${this.item} is ${this.place}."` }; }
    this.wrong++; return { ok: false, text: `${n.who.name}: "It was not me! Find the real one."` };
  }
}
