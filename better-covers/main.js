/// <reference path="../sdk/voltage.d.ts" />
// Better covers (PLUGIN-PLAN P12-24 I4): when the playing song's art is a video frame (an upload or a music video, not an
// album cover), look the song up on the iTunes Search API (official, no key) and offer its album cover to Voltage.
// Strict matching: same artist and same title (brackets and "feat." ignored), and the same album when Voltage knows it.
// Voltage decides: it only takes the offer while the song's own art is a video frame, never over an album cover.
// Lookups are cached (found or not) so a song is asked about once.

const API = 'https://itunes.apple.com/search';
const MAX_CACHE = 3000;
let settings = { size: 600, debug: false };
let cache = {}; // id -> cover URL | '' (no match)
let loaded = false, current = null, dirty = false;
const recent = []; // request times (iTunes allows ~20 a minute)

// C12 (2026-11-08): accents differ between YouTube and iTunes ("Legion RG" / "Legión RG"), so they're dropped on both sides
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').normalize('NFKC')
  .replace(/\(.*?\)|\[.*?\]|【.*?】|\s[-–—|]\s.*$/g, ' ')
  .replace(/\b(feat|ft|with)\b\.?.*$/, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const firstArtist = (a) => String(a || '').split(/,|&| x | and |、/i)[0].trim();

/** Is an iTunes result the same song? Same artist (first credited, normalised), same title, same album if known. */
function matches(track, r) {
  if (!r?.artworkUrl100 || r.kind !== 'song') return false;
  const ta = norm(firstArtist(track.artist)), ra = norm(r.artistName);
  // YouTube cuts long channel names ("Grupo Marca Regist"): a cut-off name of 10+ letters may match the start
  const cut = ta.length >= 10 && ra.startsWith(ta);
  if (!ta || !ra || !(ra === ta || cut || ra.split(' ').length > 1 && (ra.startsWith(`${ta} `) || ta.startsWith(`${ra} `)))) return false;
  if (norm(title(track)) !== norm(r.trackName)) return false;
  if (track.album && norm(track.album) !== norm(r.collectionName) && norm(track.album) !== norm(r.trackName)) return false;
  return true;
}
/** The song's title without the "Artist - " some uploads start with ("Junior H - Y LLORO [Official Video]"). */
function title(track) {
  const t = String(track.title || ''), a = firstArtist(track.artist);
  return a && t.toLowerCase().startsWith(`${a.toLowerCase()} - `) ? t.slice(a.length + 3) : t;
}
const sized = (u, px) => u.replace(/\/\d+x\d+bb\./, `/${px}x${px}bb.`);
/** The best match: prefer the album (not a compilation or single) when several results match. */
function pick(track, results) {
  const ok = (results ?? []).filter((r) => matches(track, r));
  if (!ok.length) return null;
  const score = (r) => (/compilation|greatest|best of|hits/i.test(r.collectionName) ? 0 : 2) + (/ - single$| - ep$/i.test(r.collectionName) ? 0 : 1);
  ok.sort((a, b) => score(b) - score(a));
  return sized(ok[0].artworkUrl100, settings.size);
}
const term = (t) => `${firstArtist(t.artist)} ${norm(title(t))}`.slice(0, 120);
self.matches = matches; self.term = term; self.pick = pick; self.norm = norm; // for tests

const videoFrame = (thumb) => /^https:\/\/i\.ytimg\.com\//.test(thumb || '');

async function lookup(t) {
  if (t.id in cache) return cache[t.id];
  const now = Date.now();
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (recent.length >= 15) return null; // later: the next time the song plays
  recent.push(now);
  const r = await voltage.net.fetch(`${API}?${new URLSearchParams({ term: term(t), media: 'music', entity: 'song', limit: '25' })}`);
  if (r.status !== 200 || !r.json) return null; // not cached: tried again later
  const url = pick(t, r.json.results);
  cache[t.id] = url ?? '';
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete cache[k];
  dirty = true;
  if (settings.debug) voltage.log(url ? `cover for ${t.title}: ${url}` : `no match for ${t.title} - ${t.artist}`);
  return url;
}

voltage.on('settings', (s) => { const was = settings.size; settings = { ...settings, ...s }; if (was !== settings.size) cache = {}; });
voltage.on('track', async (t) => {
  current = t?.id ?? null;
  if (!t || !videoFrame(t.thumb)) return;
  if (!loaded) { loaded = true; cache = (await voltage.storage.get('cache')) ?? {}; }
  try {
    const url = await lookup(t);
    if (url && current === t.id) voltage.art.offer(t.id, url);
  } catch (e) { if (settings.debug) voltage.log(`lookup failed: ${e}`); }
});
setInterval(() => { if (dirty) { dirty = false; voltage.storage.set('cache', cache); } }, 30000);
voltage.on('stop', () => { if (dirty) voltage.storage.set('cache', cache); });
