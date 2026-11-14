/// <reference path="../sdk/voltage.d.ts" />
// JRPG battle: the JRPG theme's helper (review round 15 wave 1). The song is the enemy and its HP is the time left (the
// theme draws that from --progress by itself). This adds what CSS can't know:
//  - seeking forward is an attack: the seconds skipped pop up as damage (F6 sprite) and the enemy flashes (F2 state "hit");
//  - skipping the song is running away ("Got away safely!");
//  - experience across days (F1): a point per minute you listen, a level from it (--fx-lv, --fx-exp 0-1), kept in storage.
// Nothing at all while a game is in front.
let pos = 0, dur = 0, playing = false, gaming = false, xp = 0, listened = 0, lastTick = 0, dirty = false, hitTimer = null;
const levelOf = (x) => Math.floor(Math.sqrt(x / 4)) + 1;            // lv 2 at 4 min, lv 5 at 64, lv 10 at ~5 h
const nextAt = (lv) => 4 * lv * lv;                                 // xp where lv + 1 starts
function show() {
  const lv = levelOf(xp), from = 4 * (lv - 1) * (lv - 1), to = nextAt(lv);
  voltage.theme.vars({ lv, exp: Math.round(((xp - from) / Math.max(1, to - from)) * 1000) / 1000 });
}
function hit(text) {
  voltage.theme.spawn('dmg', { x: 0.52 + (Math.random() - 0.5) * 0.12, y: 0.38, text });
  voltage.theme.state('art', ['hit']);
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => voltage.theme.state('art', []), 450);
}

voltage.on('position', (p) => {
  const np = p?.pos ?? 0;
  if (!gaming && playing && np - pos > 3 && Math.abs(dur - (p?.dur ?? 0)) < 1) hit(String(Math.round(np - pos))); // a seek forward
  // experience: real listening only (no jumps), a point a minute
  const now = Date.now();
  if (playing && lastTick && now - lastTick < 2500 && np >= pos && np - pos < 3) {
    listened += (now - lastTick) / 1000;
    if (listened >= 60) { listened -= 60; xp += 1; dirty = true; const lvBefore = levelOf(xp - 1); show(); if (levelOf(xp) > lvBefore) voltage.theme.state('app', ['level-up']); }
  }
  lastTick = now; pos = np; dur = p?.dur ?? 0;
});
voltage.on('track', (t) => {
  if (t?.how === 'next' && !gaming) voltage.theme.spawn('dmg', { x: 0.5, y: 0.45, text: 'Got away safely!' });
  voltage.theme.state('app', []);
  pos = 0;
});
voltage.on('playing', (p) => { playing = !!p; lastTick = 0; });
voltage.on('gaming', (g) => { gaming = !!g; });
voltage.on('stop', async () => { if (dirty) await voltage.storage.set('xp', xp).catch(() => {}); });
setInterval(() => { if (dirty) { dirty = false; voltage.storage.set('xp', xp).catch(() => {}); } }, 60000);
(async () => { xp = (await voltage.storage.get('xp')) ?? 0; show(); })();
