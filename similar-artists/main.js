/// <reference path="../sdk/voltage.d.ts" />
// Similar artists (PLUGIN-PLAN P12-24 I5): a panel with artists like the one playing, from ListenBrainz (what people
// listen to in the same sessions; free, no key). The artist is found on MusicBrainz first (names, aliases and sort names:
// MusicBrainz credits 竹内まりや, YouTube says Mariya Takeuchi). Click one to open it in Voltage (capability ui.navigate).
// Looked up only while the panel is open, one MusicBrainz request a second, cached per artist.
const MB = 'https://musicbrainz.org/ws/2';
const LB = 'https://labs.api.listenbrainz.org/similar-artists/json';
// ListenBrainz's current model (C7, 2026-11-08); if they retire it the panel says so and the cache keeps what it had
const ALGO = 'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30';
const UA = { 'user-agent': 'Voltage-SimilarArtists/1.0 (+https://github.com/CastilloA27/Voltage-Plugins)', accept: 'application/json' };
const KEEP = 120; // artists in the cache (storage is capped at 256 KB)

let settings = { count: 15 };
let artist = null, open = false, status = '', busy = null;
let cache = {}; // normalised name -> {at, list: [{name, comment}]} | {at, none: true}
let heard = new Set(); // artists you've played (normalised, the last 600): picks the right one of several with one name
let heardDirty = false;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
const words = (s) => String(s ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');
const firstArtist = (a) => String(a ?? '').split(/,|、|&| feat\.| x /i)[0].trim();
/** Same artist: the name, its sort name ("Takeuchi, Mariya") or an alias, word order ignored. */
const same = (name, ...cands) => cands.some((n) => n && (norm(n) === norm(name) || words(n) === words(name)));
const luceneQ = (s) => `"${String(s).replace(/["\\]/g, ' ')}"`;

let lastMb = 0;
async function get(url, tries = 2) {
  if (url.startsWith(MB)) {
    const wait = lastMb + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastMb = Date.now();
  }
  const r = await voltage.net.fetch(url, { headers: UA });
  if (r.status === 503 && url.startsWith(MB) && tries > 0) { lastMb = Date.now() + 2000; return get(url, tries - 1); } // MB is busy
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.json ?? JSON.parse(r.text);
}

/** The artist's MusicBrainz ids: exact name, alias or sort-name matches with a high search score, best first, up to 3.
 *  Several entries can share a name (C7: two "$uicideboy$", ListenBrainz only knows one), so each is tried in turn. */
async function mbids(name) {
  const q = `artist:${luceneQ(name)} OR alias:${luceneQ(name)} OR sortname:${luceneQ(name)}`;
  const j = await get(`${MB}/artist?query=${encodeURIComponent(q)}&limit=8&fmt=json`);
  return (j?.artists ?? []).filter((x) => (x.score ?? 0) >= 90
    && (same(name, x.name, x['sort-name']) || (x.aliases ?? []).some((a) => same(name, a.name, a['sort-name']))))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3).map((x) => x.id);
}

async function similar(name) {
  const key = norm(name);
  const c = cache[key];
  if (c && Date.now() - c.at < 30 * 86400000) return c;
  const ids = await mbids(name);
  let entry = ids.length ? { at: Date.now(), none: true, found: true } : { at: Date.now(), none: true };
  // a shared name (C7: "Sublime" the US band / a Japanese singer): the entry whose similar artists you play most wins
  let best = -1;
  const near = new Set(ids.length > 1 ? Object.values(cache).flatMap((c) => (c.list ?? []).map((x) => norm(x.name))) : []);
  for (const id of ids) {
    const j = await get(`${LB}?${new URLSearchParams({ artist_mbids: id, algorithm: ALGO })}`);
    const list = (Array.isArray(j) ? j : []).filter((x) => x?.name && !same(name, x.name))
      .slice(0, 30).map((x) => ({ name: String(x.name), comment: String(x.comment ?? '').slice(0, 60) }));
    if (!list.length) continue;
    // then the better known one (more similar artists: more listeners); the Japanese "Sublime" has 2, the US band 30
    // "artists you play" includes the ones ListenBrainz lists next to them: YouTube says "Anri", ListenBrainz 杏里
    const overlap = list.filter((x) => heard.has(norm(x.name)) || near.has(norm(x.name))).length * 100 + list.length;
    if (overlap > best) { best = overlap; entry = { at: Date.now(), list }; }
    if (ids.length === 1) break;
  }
  cache[key] = entry;
  const keys = Object.keys(cache);
  if (keys.length > KEEP) for (const k of keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - KEEP)) delete cache[k];
  voltage.storage.set('cache', cache);
  return entry;
}
self.same = same; self.firstArtist = firstArtist; self.similar = similar; // for tests

async function load() {
  if (!open || !artist || busy === artist) return;
  const want = artist;
  busy = want; status = 'Looking it up…'; render();
  try { await similar(want); status = ''; } catch (e) { status = `Couldn't reach MusicBrainz / ListenBrainz (${e.message ?? e}). Try again later.`; }
  if (busy === want) busy = null;
  render();
}

function render() {
  if (!open) return;
  const c = artist ? cache[norm(artist)] : null;
  let body;
  if (!artist) body = '<p class="dim">Nothing is playing.</p>';
  else if (!c || status) body = `<p class="dim">${esc(status || 'Looking it up…')}</p>`;
  else if (c.none) body = `<p class="dim">${c.found ? 'ListenBrainz has no similar artists for them yet.' : 'MusicBrainz doesn\'t know this artist under this name.'}</p>`;
  else body = `<ul>${c.list.slice(0, settings.count).map((a) => `<li><button data-action="open" data-value="${esc(a.name)}" title="Open in Voltage"><b>${esc(a.name)}</b>${a.comment ? ` <small>${esc(a.comment)}</small>` : ''}</button></li>`).join('')}</ul>
    <p class="src">From ListenBrainz (people who listen to ${esc(artist)} also listen to…). Click one to open it in Voltage.</p>`;
  voltage.panel.render(`${artist ? `<p class="now">Like <b>${esc(artist)}</b></p>` : ''}${body}`, `
    .now { margin: 0 0 10px; } .dim { opacity: .65; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    li button { width: 100%; text-align: left; background: none; border: 0; padding: 6px 8px; border-radius: 8px; color: inherit; cursor: pointer; }
    li button:hover { background: rgba(255,255,255,.06); } small { opacity: .55; } .src { opacity: .45; font-size: 11px; margin: 10px 0 0; }`);
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; render(); });
voltage.on('track', (t) => {
  const a = t ? firstArtist(t.artist) : null;
  if (a && !heard.has(norm(a))) {
    heard.add(norm(a)); heardDirty = true;
    if (heard.size > 600) heard.delete(heard.values().next().value);
  }
  if (a === artist) return;
  artist = a; status = ''; render(); load();
});
voltage.on('panel', ({ open: o }) => { open = o; render(); load(); });
voltage.on('panel-action', ({ action, value }) => { if (action === 'open' && value) voltage.navigate.artist(value); });
(async () => {
  try { const c = await voltage.storage.get('cache'); if (c && typeof c === 'object') cache = c; } catch { /* first run */ }
  try { const h = await voltage.storage.get('heard'); if (Array.isArray(h)) for (const x of h) heard.add(x); } catch { /* first run */ }
})();
setInterval(() => { if (heardDirty) { heardDirty = false; voltage.storage.set('heard', [...heard]); } }, 60000);
self.heard = heard;
