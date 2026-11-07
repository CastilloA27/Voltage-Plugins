/// <reference path="../sdk/voltage.d.ts" />
// Voice chat ducking: Voltage reports how loud the voice apps are (capability audio.sessions, ~20 levels a second while
// anything is audible, never the audio itself); when it stays above the threshold for a moment the music drops quickly,
// and once it goes quiet it comes back slowly. Only the PC player is lowered (not a Spotify speaker).
// Electron apps play everything from one session, so their notification sounds dip the music briefly too.
// 1.1 (round 12): your own apps (exe names), timing sliders, lower or pause, and a panel with a live meter.
const APPS = {
  discord: ['legcord.exe', 'discord.exe', 'discordptb.exe', 'discordcanary.exe', 'vesktop.exe', 'webcord.exe'],
};
APPS.all = [...APPS.discord, 'teamspeak.exe', 'ts3client_win64.exe', 'mumble.exe', 'guilded.exe'];
const THRESHOLD = { high: 0.012, medium: 0.03, low: 0.08 }; // peak level 0..1
const MAX_APPS = 20; // what Voltage accepts per plugin

let settings = { level: 30, sensitivity: 'medium', apps: 'discord', extra: '', attack: 150, release: 1, action: 'lower' };
let loudSince = 0, ducked = false, release = null, watching = '', playing = false, pausedByUs = false;
let open = false, levels = {}, lastDraw = 0;

// mpv's volume is cubic, so "30 % of the music" is 60·log10(0.3) dB (same as Voltage's game duck)
const db = () => Math.max(-60, 60 * Math.log10(Math.max(1, settings.level) / 100));
const threshold = () => THRESHOLD[settings.sensitivity] ?? THRESHOLD.medium;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** "Teams, zoom.exe  slack" -> ['teams.exe', 'zoom.exe', 'slack.exe']: what Voltage accepts (lower case, .exe, 5-60 chars). */
function extraApps(text) {
  return String(text ?? '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
    .map((n) => (n.endsWith('.exe') ? n : `${n}.exe`))
    .filter((n) => /^[a-z0-9._ -]{5,60}$/.test(n));
}
const watchList = () => [...new Set([...(APPS[settings.apps] ?? APPS.discord), ...extraApps(settings.extra)])].slice(0, MAX_APPS);

function down() {
  ducked = true;
  if (settings.action === 'pause') {
    if (playing) { pausedByUs = true; voltage.playback.pause(); }
  } else voltage.playback.duck(db(), 150);
}

function up() {
  clearTimeout(release);
  release = null;
  if (!ducked) return;
  ducked = false;
  if (pausedByUs) { pausedByUs = false; voltage.playback.resume(); }
  voltage.playback.duck(0, 700);
}

voltage.on('settings', async (s) => {
  const before = settings.action;
  settings = { ...settings, ...s };
  if (ducked && before !== settings.action) up(); // switching lower <-> pause: let go of the old one first
  else if (ducked && settings.action === 'lower') voltage.playback.duck(db(), 300); // a new level applies right away
  await watch();
  draw(true);
});

async function watch() {
  const list = watchList(), key = list.join();
  if (key === watching) return;
  try { await voltage.audio.watch(list); watching = key; } catch (e) { voltage.log(`watch failed: ${e}`); }
}

voltage.on('playing', (p) => {
  const was = playing;
  playing = !!p;
  // you pressed play yourself while it was paused for voices: don't resume it again later
  if (playing && !was && pausedByUs) pausedByUs = false;
});

voltage.on('audio', ({ levels: l }) => {
  levels = l || {};
  const peak = Math.max(0, ...Object.values(levels));
  const now = Date.now();
  if (peak >= threshold()) {
    if (!loudSince) loudSince = now;
    clearTimeout(release);
    release = null;
    if (!ducked && now - loudSince >= settings.attack) down();
  } else {
    loudSince = 0;
    // quiet frames stop arriving after the first one, so the release is a timer, not a frame count
    if (ducked && !release) release = setTimeout(up, Math.round(settings.release * 1000));
  }
  draw();
});

/** The panel: one bar per app that's making sound, a line at the threshold, and whether the music is lowered now. */
function draw(force = false) {
  if (!open) return;
  const now = Date.now();
  if (!force && now - lastDraw < 200) return; // 5 a second is plenty for a meter
  lastDraw = now;
  const t = threshold(), scale = (v) => Math.min(100, Math.sqrt(v / 0.2) * 100); // sqrt: quiet voices still show
  const rows = Object.entries(levels).filter(([, v]) => v > 0.001).sort((a, b) => b[1] - a[1]);
  voltage.panel.render(`
    <p class="state ${ducked ? 'on' : ''}">${ducked ? (settings.action === 'pause' ? 'Paused for voices' : 'Music lowered') : 'Listening'}</p>
    <div class="meter">
      ${rows.length ? rows.map(([n, v]) => `<div class="row"><span>${esc(n.replace(/\.exe$/, ''))}</span>
        <div class="bar"><i style="width:${scale(v).toFixed(1)}%" class="${v >= t ? 'over' : ''}"></i></div></div>`).join('')
        : '<p class="dim">Nothing you listen to is making sound right now.</p>'}
      ${rows.length ? `<div class="line" style="left:calc(var(--name) + (100% - var(--name)) * ${(scale(t) / 100).toFixed(3)})" title="Starts at"></div>` : ''}
    </div>
    <p class="dim">The orange line is where the music starts to drop ("Starts at" in the settings). Watching:
      ${esc(watchList().map((n) => n.replace(/\.exe$/, '')).join(', '))}.</p>`, `
    .state { font-weight: 600; } .state.on { color: var(--accent, #a020f0); }
    .meter { position: relative; --name: 110px; margin: 10px 0; }
    .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .row span { width: calc(var(--name) - 8px); flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { flex: 1; height: 8px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
    .bar i { display: block; height: 100%; background: rgba(255,255,255,.5); } .bar i.over { background: var(--accent, #a020f0); }
    .line { position: absolute; top: 0; bottom: 0; width: 2px; background: #ffb347; }
    .dim { opacity: .6; font-size: 12px; }`);
}

voltage.on('panel', ({ open: o }) => { open = o; draw(true); });
voltage.on('stop', () => { up(); return voltage.audio.unwatch().catch(() => {}); });
self.extraApps = extraApps; // for tests
