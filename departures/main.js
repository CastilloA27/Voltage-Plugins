/// <reference path="../sdk/voltage.d.ts" />
// Departures board: the Departures theme's helper (review round 15 wave 1, F1). Works out when each upcoming song "departs"
// (starts), as a clock time, from the queue's lengths and where the current song is, and hands the theme numbers it prints
// with CSS counters: --fx-dep-0-h / -m (the current song ends), --fx-dep-1-h / -m ... --fx-dep-8-h / -m (the next eight
// start), --fx-dep-n (how many are known). While paused the times slide later; nothing at all while a game is in front.
const N = 8;
let queue = null, pos = 0, dur = 0, playing = false, gaming = false, last = '', timer = null;

function update() {
  if (gaming || !queue) return;
  const now = Date.now();
  let t = now + Math.max(0, dur - pos) * 1000; // the current song ends
  const vars = {};
  const put = (k, ms) => { const d = new Date(ms); vars[`dep-${k}-h`] = d.getHours(); vars[`dep-${k}-m`] = d.getMinutes(); };
  put(0, t);
  let n = 0;
  for (let k = 1; k <= N; k++) {
    const next = queue.tracks[queue.index + k];
    if (!next) { vars[`dep-${k}-h`] = null; vars[`dep-${k}-m`] = null; continue; }
    put(k, t);
    n = k;
    t += (Number.isFinite(next.dur) ? next.dur : 210) * 1000; // unknown length: a typical song
  }
  vars['dep-n'] = n;
  const key = JSON.stringify(vars);
  if (key !== last) { last = key; voltage.theme.vars(vars); } // only when a minute (or the queue) changes
}
voltage.on('queue', (q) => { queue = q; update(); });
voltage.on('position', (p) => { pos = p?.pos ?? 0; dur = p?.dur ?? 0; update(); });
voltage.on('playing', (p) => {
  playing = !!p;
  clearInterval(timer);
  if (!playing) timer = setInterval(update, 15000); // paused: the clock keeps going, so the departures slide
  update();
});
voltage.on('gaming', (g) => { gaming = !!g; if (!gaming) update(); });
