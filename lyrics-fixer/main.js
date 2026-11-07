/// <reference path="../sdk/voltage.d.ts" />
// Lyrics fixer (round 12): make your own timed lyrics for the playing song. Start from LRCLIB's text (or paste your own),
// press Tap as each line starts, nudge lines that are off, and save: the result becomes a lyrics source ("My lyrics") that
// Voltage can pick and you can choose in the lyrics view's source menu. Optionally share it on LRCLIB (lrclib.net, no
// account: a proof-of-work token proves it's not spam, computed here in small slices so the plugin stays responsive).
const API = 'https://lrclib.net/api';
const UA = { 'user-agent': 'Voltage-LyricsFixer/1.0 (+https://github.com/CastilloA27/Voltage-Plugins)' };
const KEEP = 200; // songs with saved lyrics (storage is capped at 256 KB)

let track = null, open = false, playing = false, pos = 0, at = Date.now(), dur = 0;
let lines = null; // [{t: seconds | null, text}] being edited for `track`
let next = 0; // the line the next Tap times
let status = '', step = 'edit'; // 'edit' | 'confirm-share' | 'sharing'
let mine = {}; // song id -> {lines: [{t, text}], at}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => (playing ? pos + (Date.now() - at) / 1000 : pos);
const stamp = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const lrc = (ls) => ls.filter((l) => l.t != null).map((l) => `[${stamp(l.t)}] ${l.text}`).join('\n');
const textLines = (s) => String(s ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*\[[\d:.]+\]\s*/, '').trim()).filter(Boolean).slice(0, 300);

// ───────────── SHA-256 (synchronous: the proof-of-work needs millions of hashes, crypto.subtle is async per hash) ─────────────
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351,
  0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3,
  0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const W = new Uint32Array(64);
/** SHA-256 of ASCII text -> 32 bytes. */
function sha256(str) {
  const n = str.length, blocks = ((n + 8) >> 6) + 1, m = new Uint8Array(blocks * 64);
  for (let i = 0; i < n; i++) m[i] = str.charCodeAt(i);
  m[n] = 0x80;
  const bits = n * 8;
  m[m.length - 4] = bits >>> 24; m[m.length - 3] = bits >>> 16; m[m.length - 2] = bits >>> 8; m[m.length - 1] = bits;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let b = 0; b < m.length; b += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[b + i * 4] << 24) | (m[b + i * 4 + 1] << 16) | (m[b + i * 4 + 2] << 8) | m[b + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15], y = W[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b2 = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b2) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v; });
  return out;
}
const hexBytes = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const notAbove = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return true; };
/** LRCLIB's challenge: the nonce whose sha256(prefix + nonce) is at most `target` (hex). Slices of 20,000 hashes. */
async function solve(prefix, target, progress = () => {}) {
  const t = hexBytes(target);
  for (let nonce = 0; ; nonce++) {
    if (notAbove(sha256(prefix + nonce), t)) return String(nonce);
    if (nonce % 20000 === 19999) { progress(nonce + 1); await new Promise((r) => setTimeout(r, 0)); }
  }
}

// ───────────── editing ─────────────

async function start() {
  const t = track;
  if (!t) return;
  if (mine[t.id]) { lines = mine[t.id].lines.map((l) => ({ ...l })); next = lines.length; status = 'Your saved lyrics. Tap again from any line to redo it.'; return render(); }
  lines = null; status = 'Getting the text from LRCLIB…'; render();
  try {
    const q = new URLSearchParams({ track_name: t.title, artist_name: String(t.artist ?? '').split(',')[0].trim(), ...(t.album ? { album_name: t.album } : {}), ...(dur ? { duration: String(Math.round(dur)) } : {}) });
    const r = await voltage.net.fetch(`${API}/get?${q}`, { headers: UA });
    const j = r.status === 200 ? (r.json ?? JSON.parse(r.text)) : null;
    if (track?.id !== t.id) return;
    const text = j?.plainLyrics || (j?.syncedLyrics ?? '');
    if (text) { lines = textLines(text).map((x) => ({ t: null, text: x })); next = 0; status = 'Press Tap as each line starts (play the song from the beginning).'; }
    else status = 'LRCLIB has no text for this song: paste the lyrics below.';
  } catch (e) { status = `Couldn't reach LRCLIB (${e.message ?? e}): paste the lyrics below.`; }
  render();
}

function tap() {
  if (!lines || next >= lines.length) return;
  const t = Math.max(0, now() - 0.15); // people tap a little after the line starts
  lines[next].t = Math.round(t * 100) / 100;
  for (let i = next + 1; i < lines.length; i++) if (lines[i].t != null && lines[i].t < lines[next].t) lines[i].t = null; // later taps redone
  next += 1;
  render();
}

function nudge(i, d) {
  if (!lines?.[i] || lines[i].t == null) return;
  lines[i].t = Math.max(0, Math.round((lines[i].t + d) * 100) / 100);
  render();
}

async function save() {
  if (!track || !lines?.some((l) => l.t != null)) return;
  mine[track.id] = { lines: lines.filter((l) => l.t != null).sort((a, b) => a.t - b.t), at: Date.now() };
  const ids = Object.keys(mine).sort((a, b) => mine[a].at - mine[b].at);
  for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) delete mine[id];
  try { await voltage.storage.set('mine', mine); status = 'Saved: "My lyrics" is now a source for this song.'; } catch (e) { status = `Couldn't save (${e.message ?? e}).`; }
  voltage.lyrics.refresh?.(); // show it right away (Voltage 1.6.1+); otherwise from the next play
  render();
}

async function share() {
  const t = track, ls = mine[t?.id]?.lines;
  if (!t || !ls?.length) return;
  step = 'sharing'; status = 'Proving to LRCLIB that this isn\'t spam (a few seconds to a minute)…'; render();
  try {
    const c = await voltage.net.fetch(`${API}/request-challenge`, { method: 'POST', headers: UA });
    const ch = c.json ?? JSON.parse(c.text);
    if (!ch?.prefix || !ch?.target) throw new Error('no challenge');
    const nonce = await solve(ch.prefix, ch.target, (n) => { status = `Proving to LRCLIB that this isn't spam… ${Math.round(n / 1000)}k tries`; render(); });
    const body = JSON.stringify({ trackName: t.title, artistName: String(t.artist ?? '').split(',')[0].trim(), albumName: t.album ?? '',
      duration: Math.round(dur || t.dur || 0), plainLyrics: ls.map((l) => l.text).join('\n'), syncedLyrics: lrc(ls) });
    const r = await voltage.net.fetch(`${API}/publish`, { method: 'POST', headers: { ...UA, 'content-type': 'application/json', 'x-publish-token': `${ch.prefix}:${nonce}` }, body });
    status = r.status === 201 || r.status === 200 ? 'Shared on LRCLIB: thank you! Other players can use these lyrics now.' : `LRCLIB said no (HTTP ${r.status}).`;
  } catch (e) { status = `Couldn't share (${e.message ?? e}).`; }
  step = 'edit'; render();
}

// ───────────── panel ─────────────

function render() {
  if (!open) return;
  const t = track;
  if (!t) return voltage.panel.render('<p class="dim">Play a song, then open this again.</p>');
  const rows = (lines ?? []).map((l, i) => `<tr class="${i === next ? 'next' : ''}"><td class="t">${l.t != null ? stamp(l.t) : '—'}</td><td>${esc(l.text)}</td>
    <td class="n">${l.t != null ? `<button data-action="nudge" data-value="${i}:-0.1">−</button><button data-action="nudge" data-value="${i}:0.1">+</button>` : ''}
    <button data-action="from" data-value="${i}" title="Tap again from this line">↺</button></td></tr>`).join('');
  const timed = (lines ?? []).filter((l) => l.t != null).length;
  const saved = !!mine[t.id];
  voltage.panel.render(`
    <p class="now"><b>${esc(t.title)}</b> · ${esc(t.artist)}</p>
    ${status ? `<p class="status">${esc(status)}</p>` : ''}
    ${step === 'confirm-share' ? `<div class="confirm"><p>Share these lyrics publicly on lrclib.net? Anyone can see and use them; there's no account, so you can't delete them later.</p>
      <button data-action="share-yes" class="primary">Share</button> <button data-action="share-no">Cancel</button></div>` : ''}
    ${lines ? `
      <div class="bar"><button data-action="tap" class="primary big" ${next >= lines.length ? 'disabled' : ''}>Tap: line ${Math.min(next + 1, lines.length)} of ${lines.length}</button>
        <button data-action="shift" data-value="-0.25" title="Everything 0.25 s earlier">All −</button><button data-action="shift" data-value="0.25" title="Everything 0.25 s later">All +</button>
        <button data-action="save" ${timed ? '' : 'disabled'}>Save as my lyrics</button>
        ${saved ? `<button data-action="share" ${step === 'sharing' ? 'disabled' : ''}>Share on LRCLIB</button>` : ''}
        ${saved ? '<button data-action="forget">Delete mine</button>' : ''}</div>
      <table>${rows}</table>` : `
      <textarea name="paste" rows="10" placeholder="Paste the lyrics here, one line per line"></textarea>
      <p><button data-action="paste" class="primary">Use these lines</button></p>`}`, `
    .now { margin: 0 0 8px; } .status { opacity: .8; } .dim { opacity: .6; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; position: sticky; top: 0; }
    .big { padding: 10px 16px; font-weight: 600; } textarea { width: 100%; box-sizing: border-box; }
    table { width: 100%; border-collapse: collapse; } td { padding: 3px 6px; vertical-align: top; }
    td.t { font-variant-numeric: tabular-nums; opacity: .7; width: 64px; } td.n { white-space: nowrap; width: 1%; }
    tr.next td { background: rgba(255,255,255,.07); } .confirm { border: 1px solid rgba(255,180,70,.6); border-radius: 10px; padding: 10px; margin: 8px 0; }`);
}

voltage.on('track', (t) => { if (t?.id !== track?.id) { track = t; lines = null; next = 0; status = ''; step = 'edit'; dur = t?.dur ?? 0; if (open) start(); } });
voltage.on('playing', (p) => { pos = now(); at = Date.now(); playing = !!p; });
voltage.on('position', (p) => { pos = p.pos; at = Date.now(); dur = p.dur || dur; });
voltage.on('panel', ({ open: o }) => { open = o; if (o && !lines) start(); else render(); });
voltage.on('panel-action', ({ action, value, form }) => {
  if (action === 'tap') tap();
  else if (action === 'nudge') { const [i, d] = String(value).split(':'); nudge(+i, +d); }
  else if (action === 'from') { next = Math.max(0, Math.min(lines?.length ?? 0, +value)); status = `Tap again from line ${next + 1}.`; render(); }
  else if (action === 'shift') { for (const l of lines ?? []) if (l.t != null) l.t = Math.max(0, Math.round((l.t + +value) * 100) / 100); render(); }
  else if (action === 'paste') { const ls = textLines(form?.paste); if (ls.length) { lines = ls.map((x) => ({ t: null, text: x })); next = 0; status = 'Press Tap as each line starts.'; } render(); }
  else if (action === 'save') save();
  else if (action === 'share') { step = 'confirm-share'; render(); }
  else if (action === 'share-yes') share();
  else if (action === 'share-no') { step = 'edit'; render(); }
  else if (action === 'forget' && track) { delete mine[track.id]; voltage.storage.set('mine', mine).catch(() => {}); status = 'Deleted your lyrics for this song.'; voltage.lyrics.refresh?.(); render(); }
});
// your saved lyrics are a source like any other
voltage.on('lyrics-request', (req) => {
  const m = mine[req.id];
  voltage.lyrics.provide(req.rid, m ? { source: 'My lyrics', synced: true, lines: m.lines.map((l) => ({ t: l.t, text: l.text })) } : null);
});

(async () => { try { mine = (await voltage.storage.get('mine')) ?? {}; } catch { /* first run */ } })();
self.sha256 = sha256; self.solve = solve; self.lrc = lrc; // for tests
