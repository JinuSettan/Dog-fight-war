// Talk to pedestrians: you type, the person answers (text from an AI model over HTTPS), spoken with the phone's voice and shown as
// movie-style subtitles for 5 seconds. The key is never stored in code: Lobby -> Graphics -> "Talk key", or the GitHub secret GEMINI_API_KEY.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const MALE = ['Arun', 'Rahul', 'Vishnu', 'Anil', 'Suresh', 'Joseph', 'Nikhil', 'Kiran', 'Mathew', 'Ravi', 'Sanjay', 'Faisal', 'Hari', 'Jacob'];
const FEMALE = ['Anjali', 'Meera', 'Sneha', 'Divya', 'Priya', 'Neha', 'Fathima', 'Anita', 'Lekha', 'Maya', 'Remya', 'Sara', 'Nisha', 'Aswathy'];
const JOBS = ['shopkeeper', 'taxi driver', 'nurse', 'student', 'engineer', 'airport worker', 'teacher', 'chef', 'delivery rider', 'tourist'];

export function personFor(i, female, seed = 0) {
  const names = female ? FEMALE : MALE;
  return { name: names[(i * 5 + seed) % names.length], job: JOBS[(i * 3 + seed) % JOBS.length], age: 20 + ((i * 11 + seed) % 35), female, pitch: (female ? 1.25 : 0.82) + ((i * 13) % 10) / 50 };
}

export class Talk {
  constructor(getKey) {
    this.getKey = getKey; this.busy = false; this.subT = 0; this.subs = document.getElementById('subs');
    this.voices = []; try { this.voices = speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { this.voices = speechSynthesis.getVoices(); }; } catch (e) { /* no tts */ }
  }

  persona(p, ctx) {
    const m = ctx.mem || {};
    let mem = '';
    if (m.h) mem += 'The player earlier attacked you (shot or ran you over). You are scared and angry at them. ';
    if (m.c) mem += 'The player once stole your car. You are furious. ';
    if (m.log && m.log.length) mem += 'Earlier conversation with the player: ' + m.log.slice(-4).map((x) => `Player: "${x[0]}" You: "${x[1]}"`).join(' ') + ' Remember it and stay consistent. ';
    return `You are ${p.name}, a ${p.age} year old ${p.female ? 'woman' : 'man'} who works as a ${p.job}, living in ${ctx.city || 'a big city'}. `
      + `This is a game world${ctx.zombies ? ' where a zombie outbreak of undead police officers is happening right now, you are scared' : ''}. Stay in character like a real person. `
      + mem + (ctx.extra ? ctx.extra + ' ' : '')
      + 'Never say you are an AI, a model or mention any company. Answer in the same language the player writes in (Malayalam in Malayalam script if they write Malayalam or Manglish, otherwise English). '
      + 'Maximum 18 words, one or two short spoken sentences, no emojis, no quotes.';
  }

  /** one text completion. returns {text} or {err} */
  async gen(system, user, maxTokens = 120) {
    const key = (this.getKey() || '').trim();
    if (!key) return { err: 'Add the talk key in Lobby → Graphics first' };
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 } };
    let last = 'no answer';
    for (const m of MODELS) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctl.signal });
        clearTimeout(to);
        if (!r.ok) { last = r.status === 400 || r.status === 403 ? 'Key not accepted (' + r.status + ')' : r.status === 429 ? 'Too many questions, wait a bit' : 'Error ' + r.status; if (r.status === 400 || r.status === 403 || r.status === 429) break; continue; }
        const j = await r.json();
        const t = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map((x) => x.text || '').join(' ').trim();
        if (t) return { text: t.replace(/\s+/g, ' ') };
      } catch (e) { last = 'No internet?'; }
    }
    return { err: last };
  }

  ask(p, text, ctx) { this.lastLang = /[\u0D00-\u0D7F]/.test(text) ? 'ml' : 'en'; return this.gen(this.persona(p, ctx), text, 120); }

  /** movie-style subtitle, 5 seconds */
  show(name, text, ms = 5000) {
    const el = this.subs; if (!el) return;
    el.innerHTML = ''; const n = document.createElement('b'); n.textContent = name + '  '; const t = document.createElement('span'); t.textContent = text;
    el.append(n, t); el.classList.add('on'); clearTimeout(this._h); this._h = setTimeout(() => el.classList.remove('on'), ms);
  }

  speak(p, text) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const ml = /[ഀ-ൿ]/.test(text), hi = /[ऀ-ॿ]/.test(text);
      const lang = ml ? 'ml' : hi ? 'hi' : 'en';
      const cands = this.voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
      const pick = cands.find((v) => (p.female ? /female|woman/i : /\bmale\b|man/i).test(v.name)) || cands[0];
      if (pick) { u.voice = pick; u.lang = pick.lang; } else u.lang = ml ? 'ml-IN' : hi ? 'hi-IN' : 'en-IN';
      u.pitch = Math.min(2, p.pitch); u.rate = 1.0; speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device */ }
  }
}
