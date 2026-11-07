(function (exports) {
"use strict";
// Voltage for Discord (round 12 P12-22), the Shelter plugin. Talks to Voltage on this PC (ws://localhost:43822; Legcord's
// page can't reach ws://127.0.0.1, localhost works) after you allow it once in Voltage. It gets the song, cover, colours,
// theme, lyric line and position; it can ask Voltage to play / pause / skip / like / seek / change the volume and to lower
// the music (your mic, calls, Go Live). Nothing is sent to Discord's servers.
// H1-H3: Discord's colours are set live on the root element (the "Discord live theme" plugin keeps only the rules in
// Quick CSS while this is connected), with eased colour changes and a cross-fading cover. H4: a mini player in the user
// panel. H5: the line being sung. H6: lower the music while you talk. H7 / H8 (off by default): calls, Go Live.
const {
  flux: { dispatcher, stores: { UserStore, VoiceStateStore } },
  plugin: { store },
} = shelter;

const URL = 'ws://localhost:43822';
const DEFAULTS = { mini: true, lyric: true, mic: 'speaking', micDb: -14, ring: 'off', voice: 'off', voiceDb: -10, golive: 'off', look: true };
for (const [k, v] of Object.entries(DEFAULTS)) if (store[k] === undefined) store[k] = v;

let ws = null, retry = null, backoff = 2000, stopped = false, live = false;
const st = { track: null, playing: false, pos: 0, posAt: 0, dur: 0, palette: null, theme: null, art: null, blurred: null, lyric: null, gaming: false };
const nodes = []; // everything we added to the page, removed on unload
const unsubs = [];

// ───────────── connection ─────────────
function send(msg) { if (ws && ws.readyState === WebSocket.OPEN && live) ws.send(JSON.stringify(msg)); }
function connect() {
  if (stopped) return;
  clearTimeout(retry);
  let sock;
  try { sock = new WebSocket(URL); } catch { return later(); }
  ws = sock;
  sock.onopen = () => { backoff = 2000; sock.send(JSON.stringify({ v: 1, type: 'hello', token: store.token || undefined, client: 'Discord (Shelter)' })); };
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'paired') store.token = m.token;
    else if (m.type === 'welcome') { live = true; render(); }
    else if (m.type === 'refused') { live = false; backoff = 60000; } // not allowed (or the prompt timed out): ask again in a minute
    else if (m.type) incoming(m.type, m.data);
  };
  sock.onclose = () => { if (ws === sock) { ws = null; live = false; render(); later(); } };
  sock.onerror = () => {};
}
// Voltage not running: look again quietly, every 2 s growing to every 30 s (never an error in the console spam sense)
function later() { if (!stopped) { clearTimeout(retry); retry = setTimeout(connect, backoff); backoff = Math.min(30000, backoff * 1.6); } }

function incoming(type, d) {
  if (type === 'track') { const changed = d?.id !== st.track?.id; st.track = d; if (changed) st.lyric = null; }
  else if (type === 'playing') { st.playing = !!d; st.posAt = Date.now(); }
  else if (type === 'position') { st.pos = d?.pos ?? 0; st.dur = d?.dur ?? st.dur; st.posAt = Date.now(); }
  else if (type === 'palette') { st.palette = d; colours(); }
  else if (type === 'theme') st.theme = d;
  else if (type === 'cover') { st.art = d?.art ?? null; st.blurred = d?.blurred ?? null; cover(); }
  else if (type === 'lyric') st.lyric = d;
  else if (type === 'gaming') st.gaming = !!d;
  render();
}
const now = () => (st.playing ? st.pos + (Date.now() - st.posAt) / 1000 : st.pos);

// ───────────── H1-H3: colours and the cover ─────────────
const CSS = `
@property --voltage-accent { syntax: '<color>'; inherits: true; initial-value: #a020f0; }
@property --voltage-c1 { syntax: '<color>'; inherits: true; initial-value: #000000; }
@property --voltage-c2 { syntax: '<color>'; inherits: true; initial-value: #000000; }
:root { transition: --voltage-accent 1.4s ease, --voltage-c1 1.4s ease, --voltage-c2 1.4s ease; }
.voltage-cover { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity 1.2s ease;
  background: 50% 50% / 134% 134% no-repeat; animation: voltage-drift 40s steps(160) infinite alternate; }
.voltage-cover.on { opacity: 1; }
body.voltage-look #app-mount { position: relative; z-index: 1; } /* the cover layers sit behind Discord, never over it */
@keyframes voltage-drift { from { background-size: 134% 134%; background-position: 42% 45%; } to { background-size: 154% 154%; background-position: 58% 56%; } }
.voltage-mini { margin: 0 8px 6px; padding: 8px; border-radius: 10px; display: grid; grid-template-columns: 40px 1fr; gap: 4px 10px; align-items: center;
  background: color-mix(in srgb, var(--voltage-accent) 12%, rgba(0,0,0,.35)); border: 1px solid color-mix(in srgb, var(--voltage-accent) 30%, transparent); }
.voltage-mini img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; grid-row: span 2; }
.voltage-mini .meta { min-width: 0; overflow: hidden; white-space: nowrap; }
.voltage-mini .meta b, .voltage-mini .meta span { display: block; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
.voltage-mini .meta span { opacity: .7; font-size: 12px; }
.voltage-mini .row { display: flex; align-items: center; gap: 4px; }
.voltage-mini button { background: none; border: 0; color: var(--interactive-normal, #ddd); cursor: pointer; padding: 2px 4px; border-radius: 4px; line-height: 0; }
.voltage-mini button:hover { color: #fff; background: color-mix(in srgb, var(--voltage-accent) 20%, transparent); }
.voltage-mini .bar { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); cursor: pointer; overflow: hidden; }
.voltage-mini .bar i { display: block; height: 100%; background: var(--voltage-accent); box-shadow: 0 0 6px var(--voltage-accent); }
.voltage-mini .lyric { grid-column: 1 / -1; font-size: 12px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: color-mix(in oklab, var(--voltage-accent) 45%, white); }
`;

function colours() {
  document.body.classList.toggle('voltage-look', !!store.look);
  if (!store.look || !st.palette) return;
  const r = document.documentElement.style, p = st.palette;
  const safe = (c) => (/^[#a-zA-Z0-9(),.%\s-]{3,60}$/.test(c || '') ? c : null);
  if (p.idle) { for (const k of ['--voltage-accent', '--voltage-c1', '--voltage-c2']) r.removeProperty(k); return; }
  for (const [k, v] of [['--voltage-accent', p.accent], ['--voltage-c1', p.c1], ['--voltage-c2', p.c2]]) if (safe(v)) r.setProperty(k, v);
}

// two stacked layers: the new cover is decoded first, then fades in over the old one (no black flash, no pop)
let layers = null, front = 0, coverKey = null;
function cover() {
  if (!store.look) return;
  const url = st.blurred && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(st.blurred) ? st.blurred : null;
  if (url === coverKey) return;
  coverKey = url;
  if (!layers) {
    layers = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'voltage-cover'; document.body.prepend(d); nodes.push(d); return d; });
    // in step with Voltage's own drift: both use the wall clock modulo 80 s
    for (const l of layers) l.style.animationDelay = `-${((Date.now() / 1000) % 80).toFixed(2)}s`;
  }
  const next = layers[1 - front], prev = layers[front];
  if (!url) { prev.classList.remove('on'); return; }
  const img = new Image();
  img.onload = () => {
    if (coverKey !== url) return;
    next.style.backgroundImage = `url("${url}")`;
    next.classList.add('on'); prev.classList.remove('on');
    front = 1 - front;
  };
  img.src = url;
}

// ───────────── H4 / H5: the mini player in the user panel ─────────────
const ICON = {
  prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z', next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z', play: 'M8 5v14l11-7z', pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  like: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
};
const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mini = null, tick = null;
function render() {
  if (stopped) return; // unloaded: a late socket close must not draw the player again
  if (!store.mini) { mini?.remove(); mini = null; return; }
  const panel = document.querySelector('section[class*="panels_"]');
  if (!panel) return; // not drawn yet: the next update tries again
  if (!mini || !panel.contains(mini)) {
    mini = document.createElement('div');
    mini.className = 'voltage-mini';
    const account = panel.querySelector('[class*="accountPopoutButton_"]')?.closest('[class*="container_"]');
    (account?.parentElement ?? panel).insertBefore(mini, account ?? panel.firstChild);
    nodes.push(mini);
    mini.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]');
      if (b) { send({ type: 'cmd', cmd: b.dataset.cmd }); return; }
      const bar = e.target.closest('.bar');
      if (bar && st.dur) { const r = bar.getBoundingClientRect(); send({ type: 'seek', pos: ((e.clientX - r.left) / r.width) * st.dur }); }
    });
    mini.addEventListener('wheel', (e) => { e.preventDefault(); send({ type: 'cmd', cmd: e.deltaY < 0 ? 'volUp' : 'volDown' }); }, { passive: false });
  }
  if (!live || !st.track) { mini.style.display = 'none'; return; } // Voltage not running or nothing playing: no player
  mini.style.display = '';
  mini.className = 'voltage-mini';
  const pct = st.dur ? Math.min(100, (now() / st.dur) * 100) : 0;
  const art = st.art && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(st.art) ? `<img src="${st.art}" alt="">` : '<div></div>';
  mini.innerHTML = `${art}<div class="meta"><b title="${esc(st.track.title)}">${esc(st.track.title)}</b><span>${esc(st.track.artist)}</span></div>
    <div class="row"><button data-cmd="prev" title="Previous">${svg(ICON.prev)}</button><button data-cmd="playPause" title="${st.playing ? 'Pause' : 'Play'}">${svg(st.playing ? ICON.pause : ICON.play)}</button>
    <button data-cmd="next" title="Next">${svg(ICON.next)}</button><button data-cmd="like" title="Like">${svg(ICON.like)}</button></div>
    <div class="bar" title="Seek"><i style="width:${pct.toFixed(2)}%"></i></div>
    ${store.lyric && st.lyric?.text ? `<div class="lyric">${esc(st.lyric.text)}</div>` : ''}`;
}

// ───────────── H6-H8: lower the music for your mic, calls, Go Live ─────────────
const reasons = new Map(); // reason -> dB; the lowest wins
let ducked = 0, pausedBy = null;
function duck(reason, db) {
  if (db == null) reasons.delete(reason); else reasons.set(reason, db);
  const want = Math.min(0, ...reasons.values());
  if (want === ducked) return;
  ducked = want;
  send(want < 0 ? { type: 'duck', db: want, ms: 150 } : { type: 'unduck', ms: 700 });
}
function pauseFor(reason, on) {
  if (on && st.playing && !pausedBy) { pausedBy = reason; send({ type: 'cmd', cmd: 'pause' }); }
  else if (!on && pausedBy === reason) { pausedBy = null; if (!st.playing) send({ type: 'cmd', cmd: 'resume' }); }
}
const me = () => UserStore?.getCurrentUser?.()?.id;
const myVoice = () => { try { return VoiceStateStore?.getVoiceStateForUser?.(me()) ?? null; } catch { return null; } };
let micQuiet = null;
function onSpeaking(e) {
  if (e.userId !== me() || store.mic !== 'speaking') return;
  if (e.speakingFlags) { clearTimeout(micQuiet); duck('mic', Number(store.micDb) || -14); }
  else { clearTimeout(micQuiet); micQuiet = setTimeout(() => duck('mic', null), 800); } // pauses between words don't pump
}
function onVoice() {
  const v = myVoice(), inCall = !!v?.channelId;
  duck('unmuted', store.mic === 'unmuted' && inCall && !v.selfMute && !v.mute ? Number(store.micDb) || -14 : null);
  duck('voice', store.voice === 'lower' && inCall ? Number(store.voiceDb) || -10 : null);
  if (!inCall) duck('mic', null);
}
function onCall(e) {
  const ringing = Array.isArray(e?.ringing) && e.ringing.includes(me());
  if (store.ring === 'pause') pauseFor('ring', e.type !== 'CALL_DELETE' && ringing);
}
function onStream(e) {
  const mine = (e.streamKey ?? '').includes(me() ?? '-');
  const on = e.type === 'STREAM_START' || e.type === 'STREAM_CREATE';
  if (!mine && e.type !== 'STREAM_STOP') return;
  if (store.golive === 'lower') duck('golive', on ? -18 : null);
  else if (store.golive === 'pause') pauseFor('golive', on);
}

// ───────────── settings (Shelter > Plugins > Voltage for Discord) ─────────────
function settings() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:10px;color:var(--text-default,#ddd)';
  const row = (label, el) => { const l = document.createElement('label'); l.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center'; l.textContent = label; l.append(el); box.append(l); };
  const check = (k) => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!store[k]; c.onchange = () => { store[k] = c.checked; apply(); }; return c; };
  const pick = (k, opts) => { const s = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; o.selected = store[k] === v; s.append(o); } s.onchange = () => { store[k] = s.value; apply(); }; return s; };
  const status = document.createElement('div');
  status.textContent = live ? 'Connected to Voltage.' : 'Not connected: is Voltage running, with Settings > Plugins > Voltage for Discord on? The first time, allow it in Voltage.';
  box.append(status);
  row('Song colours and cover in Discord', check('look'));
  row('Mini player in the user panel', check('mini'));
  row('The line being sung under it', check('lyric'));
  row('Lower the music for your mic', pick('mic', [['speaking', 'While you speak'], ['unmuted', 'While you are unmuted in a call'], ['off', 'Off']]));
  row('In any voice channel', pick('voice', [['off', 'Nothing'], ['lower', 'Lower the music']]));
  row('A call is ringing', pick('ring', [['off', 'Nothing'], ['pause', 'Pause the music']]));
  row('While you Go Live', pick('golive', [['off', 'Nothing'], ['lower', 'Lower the music'], ['pause', 'Pause the music']]));
  if (store.token) { const b = document.createElement('button'); b.textContent = 'Forget the pairing'; b.onclick = () => { delete store.token; ws?.close(); }; box.append(b); }
  return box;
}
function apply() {
  if (!store.look) { for (const k of ['--voltage-accent', '--voltage-c1', '--voltage-c2']) document.documentElement.style.removeProperty(k); layers?.forEach((l) => l.classList.remove('on')); coverKey = null; }
  else { colours(); cover(); }
  onVoice();
  render();
}

// ───────────── lifecycle ─────────────
const sub = (type, f) => { dispatcher.subscribe(type, f); unsubs.push(() => dispatcher.unsubscribe(type, f)); };
exports.onLoad = () => {
  stopped = false;
  const style = document.createElement('style');
  style.id = 'voltage-for-discord';
  style.textContent = CSS;
  document.head.append(style);
  nodes.push(style);
  sub('SPEAKING', onSpeaking);
  sub('VOICE_STATE_UPDATES', onVoice);
  for (const t of ['CALL_CREATE', 'CALL_UPDATE', 'CALL_DELETE']) sub(t, onCall);
  for (const t of ['STREAM_START', 'STREAM_CREATE', 'STREAM_STOP', 'STREAM_DELETE']) sub(t, onStream);
  tick = setInterval(() => { if (live && st.playing) render(); }, 1000); // the progress bar
  connect();
};
exports.onUnload = () => {
  stopped = true;
  clearTimeout(retry); clearInterval(tick); clearTimeout(micQuiet);
  if (ducked < 0) send({ type: 'unduck', ms: 500 });
  if (pausedBy) send({ type: 'cmd', cmd: 'resume' });
  if (ws) { ws.onclose = ws.onmessage = ws.onerror = null; ws.close(); ws = null; } live = false;
  for (const u of unsubs.splice(0)) u();
  for (const n of nodes.splice(0)) n.remove();
  for (const k of ['--voltage-accent', '--voltage-c1', '--voltage-c2']) document.documentElement.style.removeProperty(k);
  document.body.classList.remove('voltage-look');
  layers = null; mini = null; coverKey = null;
};
exports.settings = settings;
return exports;
})({});
