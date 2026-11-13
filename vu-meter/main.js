/// <reference path="../sdk/voltage.d.ts" />
// VU meter: Studio's helper. Sets --fx-vu (0-1) and --fx-vu-r from Voltage's level meter (capability audio.level) through
// theme.vars (ui.fx, only while Studio is the active theme). VU ballistics: ~300 ms to rise, slower to fall; auto-gain so
// quiet and loud songs both swing the needle. Only listens while playing and visible; nothing while a game is in front.
let vu = 0, vuR = 0, norm = 0.15, last = 0, playing = false, visible = true, gaming = false, listening = false;
const want = () => playing && visible && !gaming;

function onLevel({ level }) {
  const now = Date.now();
  const dt = Math.min(200, now - (last || now));
  last = now;
  norm = Math.max(level, norm * Math.exp(-dt / 8000), 0.05);
  const x = Math.min(1, level / norm);
  const k = (target, cur) => 1 - Math.exp(-dt / (target > cur ? 120 : 380));
  vu += (x - vu) * k(x, vu);
  // the right channel: the same level, a little lag and jitter, so the two needles don't move as one
  const xr = Math.min(1, x * (0.92 + Math.random() * 0.1));
  vuR += (xr - vuR) * k(xr, vuR) * 0.85;
  voltage.theme.vars({ vu: Math.round(vu * 1000) / 1000, 'vu-r': Math.round(vuR * 1000) / 1000 });
}
function sync() {
  if (want() && !listening) { voltage.on('level', onLevel); listening = true; }
  if (!want() && listening) {
    voltage.off('level', onLevel); listening = false;
    vu = vuR = 0; voltage.theme.vars({ vu: 0, 'vu-r': 0 }); // the needles rest
  }
}
voltage.on('playing', (p) => { playing = !!p; sync(); });
voltage.on('visible', (v) => { visible = v !== false; sync(); });
voltage.on('gaming', (g) => { gaming = !!g; sync(); });
