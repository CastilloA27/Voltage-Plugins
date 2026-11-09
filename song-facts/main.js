/// <reference path="../sdk/voltage.d.ts" />
// Song facts (round 12): the playing song in MusicBrainz (release year, writers, producers, samples) and its artist's
// Wikipedia summary (through the Wikidata link MusicBrainz keeps), shown in a panel. Looked up only while the panel is
// open, one MusicBrainz request a second (their rule), cached per song and per artist. Matching is strict: same artist,
// same title, length within 3 s; a wrong song's facts are worse than none.
const MB = 'https://musicbrainz.org/ws/2';
const UA = { 'user-agent': 'Voltage-SongFacts/1.0 (+https://github.com/CastilloA27/Voltage-Plugins)', accept: 'application/json' };
const KEEP_SONGS = 150, KEEP_ARTISTS = 80; // storage is capped at 256 KB

let settings = { bio: true };
let track = null, open = false, slotShown = false, facts = null, status = '', busy = null;
// 1.1: also a few lines under the song in Discovery (ui.slot 'discovery.details', Voltage 1.6.1+), looked up while that shows
const shown = () => open || slotShown;
let cache = { songs: {}, artists: {}, ids: {} }; // songs: id -> facts | {none: true}; artists: mbid -> {bio, wiki}; ids: name -> mbid | null

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[(（[【].*?[)）\]】]/g, ' ').replace(/\s(feat|ft)\..*$/i, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');
const firstArtist = (a) => String(a ?? '').split(/,|、|&| feat\.| x /i)[0].trim();
/** "Song (Official Video)", "Artist - Song", bilingual "曲 - Song": every reasonable title to try. */
function titles(t, artist) {
  const base = String(t ?? '').replace(/[(（[【].*?[)）\]】]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = base.split(/\s+[-–|]\s+/).filter((p) => p && norm(p) !== norm(artist));
  return [...new Set([base, ...parts].map((x) => x.trim()).filter(Boolean))];
}
/** Is `name` one of the credited artists? Their credited name, their own name or their sort name ("Takeuchi, Mariya"),
 *  word order ignored: MusicBrainz credits Japanese artists in their own script and lists the romanization as sort name. */
const words = (s) => String(s ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');
function sameArtist(name, credits) {
  const want = norm(name), wantW = words(name);
  if (!want) return false;
  return credits.some((c) => [c.name, c.artist?.name, c.artist?.['sort-name']].some((n) => {
    const x = norm(n);
    return x && (x.includes(want) || want.includes(x) || (wantW && words(n) === wantW));
  }));
}
const luceneQ = (s) => `"${String(s).replace(/["\\]/g, ' ')}"`;

let lastMb = 0;
async function get(url, tries = 2) {
  if (url.startsWith(MB)) { // at most one MusicBrainz request a second
    const wait = lastMb + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastMb = Date.now();
  }
  const r = await voltage.net.fetch(url, { headers: UA });
  if ((r.status === 301 || r.status === 302 || r.status === 303 || r.status === 307) && r.location && tries > 0) {
    return get(new URL(r.location, url).href, tries - 1); // Wikidata / Wikipedia redirects (checked again by Voltage)
  }
  if (r.status === 503 && url.startsWith(MB) && tries > 0) { lastMb = Date.now() + 2000; return get(url, tries - 1); } // MB is busy
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.json ?? JSON.parse(r.text);
}

/** The artist's MusicBrainz ids from the name YouTube gives, searched in names, aliases and sort names (MusicBrainz
 *  credits 竹内まりや, YouTube says Mariya Takeuchi). Up to 3: several artists can share a name ("Sublime"). */
async function artistIds(name) {
  const key = norm(name);
  if (Array.isArray(cache.ids[key])) return cache.ids[key];
  const q = `artist:${luceneQ(name)} OR alias:${luceneQ(name)} OR sortname:${luceneQ(name)}`;
  const j = await get(`${MB}/artist?query=${encodeURIComponent(q)}&limit=8&fmt=json`);
  const ids = (j?.artists ?? []).filter((x) => (x.score ?? 0) >= 90 && (sameArtist(name, [{ name: x.name, artist: x }])
    || (x.aliases ?? []).some((al) => sameArtist(name, [{ name: al.name, artist: { 'sort-name': al['sort-name'] } }]))))
    .slice(0, 3).map((x) => x.id);
  cache.ids[key] = ids;
  trim('ids', KEEP_ARTISTS * 2);
  return ids;
}

/** The recording: same artist, a matching title, length within 3 s (when known). Of all that match, the earliest
 *  released (MusicBrainz keeps one recording per compilation / reissue too); undated ones last. */
async function findRecording(t) {
  const fa = firstArtist(t.artist), dur = t.dur || 0;
  const ids = await artistIds(fa);
  // by artist id first (finds the artist under any spelling), then by the credited name
  const tries = [...(ids.length ? [{ q: `arid:(${ids.join(' OR ')})`, ok: (a) => a.some((c) => ids.includes(c.artist?.id)) }] : []),
    { q: `artist:${luceneQ(fa)}`, ok: (a) => sameArtist(fa, a) }];
  for (const by of tries) {
    for (const title of titles(t.title, fa).slice(0, 2)) {
      const j = await get(`${MB}/recording?query=${encodeURIComponent(`recording:${luceneQ(title)} AND ${by.q}`)}&limit=25&fmt=json`);
      const want = norm(title);
      const hits = (j?.recordings ?? []).filter((r) => {
        const n = norm(r.title), len = r.length ? r.length / 1000 : 0;
        return (r.score ?? 0) >= 80 && n && (n === want || n.includes(want) || want.includes(n))
          && by.ok(r['artist-credit'] ?? []) && (!dur || !len || Math.abs(len - dur) <= 3);
      });
      const date = (r) => r['first-release-date'] || '9999';
      hits.sort((a, b) => date(a).localeCompare(date(b)) || (b.score ?? 0) - (a.score ?? 0));
      if (hits.length) return hits[0];
    }
  }
  return null;
}

const ROLE = { composer: 'composer', lyricist: 'lyricist', writer: 'writer', librettist: 'lyricist' };
/** Recording + its work -> what the panel shows. */
async function lookup(t) {
  const rec = await findRecording(t);
  if (!rec) return { none: true };
  const r = await get(`${MB}/recording/${rec.id}?inc=artist-credits+releases+release-groups+artist-rels+recording-rels+work-rels&fmt=json`);
  const rels = r?.relations ?? [];
  const producers = [...new Set(rels.filter((x) => x.type === 'producer' && x.artist).map((x) => x.artist.name))];
  const samples = rels.filter((x) => x.type === 'samples material' && x.recording && x.direction !== 'backward')
    .map((x) => ({ title: x.recording.title, artist: (x.recording['artist-credit'] ?? []).map((c) => c.name).join(', ') })).slice(0, 6);
  const sampledBy = rels.filter((x) => x.type === 'samples material' && x.recording && x.direction === 'backward').length;
  // the album: the earliest album / single / EP it's on, not a compilation or a soundtrack it was put on later
  const releases = (r?.releases ?? []).filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
  const own = (x) => !(x['release-group']?.['secondary-types'] ?? []).some((t) => /compilation|soundtrack|dj-mix|mixtape|live/i.test(t));
  const first = releases.find(own) ?? null;
  const year = (rec['first-release-date'] || r?.['first-release-date'] || releases[0]?.date || '').slice(0, 4) || null;
  let writers = [];
  const work = rels.find((x) => x.type === 'performance' && x.work)?.work;
  if (work) {
    const w = await get(`${MB}/work/${work.id}?inc=artist-rels&fmt=json`);
    const seen = new Map();
    for (const x of w?.relations ?? []) {
      if (!x.artist || !ROLE[x.type]) continue;
      const k = x.artist.name;
      seen.set(k, [...new Set([...(seen.get(k) ?? []), ROLE[x.type]])]);
    }
    writers = [...seen].map(([name, roles]) => ({ name, roles }));
  }
  const artist = (r?.['artist-credit'] ?? [])[0]?.artist;
  return {
    mbid: rec.id, title: r?.title ?? rec.title, artist: (r?.['artist-credit'] ?? []).map((c) => c.name + (c.joinphrase ?? '')).join('') || t.artist,
    year, album: first?.title ?? null, writers, producers, samples, sampledBy, artistId: artist?.id ?? null,
  };
}

/** The artist's English Wikipedia summary, through MusicBrainz's Wikidata link. */
async function bio(artistId) {
  if (cache.artists[artistId]) return cache.artists[artistId];
  let out = { bio: null };
  const a = await get(`${MB}/artist/${artistId}?inc=url-rels&fmt=json`);
  const wd = (a?.relations ?? []).find((x) => x.type === 'wikidata')?.url?.resource?.match(/Q\d+$/)?.[0];
  if (wd) {
    const e = await get(`https://www.wikidata.org/wiki/Special:EntityData/${wd}.json`);
    const title = e?.entities?.[wd]?.sitelinks?.enwiki?.title;
    if (title) {
      const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (s?.extract) out = { bio: s.extract.length > 700 ? `${s.extract.slice(0, 700).replace(/\s+\S*$/, '')}…` : s.extract, wiki: title };
    }
  }
  cache.artists[artistId] = out;
  trim('artists', KEEP_ARTISTS);
  return out;
}

function trim(kind, keep) {
  const k = Object.keys(cache[kind]);
  for (const x of k.slice(0, Math.max(0, k.length - keep))) delete cache[kind][x];
}
const save = () => voltage.storage.set('cache', cache).catch(() => {});

async function load() {
  const t = track;
  if (!t || !shown() || busy === t.id) return;
  if (facts?.id === t.id && !facts.pending) return;
  const cached = cache.songs[t.id];
  if (cached) { facts = { id: t.id, ...cached }; render(); if (!cached.none && settings.bio && cached.artistId) await addBio(t); return; }
  busy = t.id; facts = { id: t.id, pending: true }; status = 'Looking it up…'; render();
  try {
    const f = await lookup(t);
    if (track?.id !== t.id) return;
    cache.songs[t.id] = f;
    trim('songs', KEEP_SONGS);
    facts = { id: t.id, ...f };
    status = '';
    render();
    if (!f.none && settings.bio && f.artistId) await addBio(t);
    save();
  } catch (e) {
    if (track?.id === t.id) { facts = null; status = `Couldn't look it up (${e.message ?? e}).`; render(); }
  } finally { if (busy === t.id) busy = null; }
}

async function addBio(t) {
  try {
    const b = await bio(cache.songs[t.id].artistId);
    if (track?.id === t.id && facts) { facts.bio = b.bio; facts.wiki = b.wiki; render(); save(); }
  } catch { /* a missing bio isn't worth an error */ }
}

// the Discovery slot: released / written / produced / samples on a line each, nothing while unknown or looking
function renderSlot() {
  if (!slotShown || !voltage.slot) return;
  const f = facts;
  if (!f || f.pending || f.none || f.id !== track?.id) return voltage.slot.render('discovery.details', '');
  const rows = [
    f.year ? `Released ${esc(f.year)}${f.album ? ` · <i>${esc(f.album)}</i>` : ''}` : null,
    f.writers.length ? `Written by ${f.writers.slice(0, 4).map((w) => esc(w.name)).join(', ')}` : null,
    f.producers.length ? `Produced by ${f.producers.slice(0, 3).map(esc).join(', ')}` : null,
    f.samples.length ? `Samples ${f.samples.slice(0, 2).map((s) => `<i>${esc(s.title)}</i>${s.artist ? ` by ${esc(s.artist)}` : ''}`).join('; ')}` : null,
  ].filter(Boolean);
  voltage.slot.render('discovery.details', rows.map((r) => `<p>${r}</p>`).join(''),
    ':host { font-size: 13px; color: inherit; } p { margin: 1px 0; opacity: .7; } i { opacity: .9; }');
}

function render() {
  renderSlot();
  if (!open) return;
  const f = facts, t = track;
  let body;
  if (!t) body = '<p class="dim">Nothing is playing.</p>';
  else if (!f || f.pending) body = `<p class="dim">${esc(status || 'Looking it up…')}</p>`;
  else if (f.none) body = '<p class="dim">MusicBrainz doesn\'t know this song (or not under this title and artist). Uploads and re-uploads often aren\'t there.</p>';
  else {
    const rows = [
      ['Released', f.year ? `${esc(f.year)}${f.album ? ` · <i>${esc(f.album)}</i>` : ''}` : null],
      ['Written by', f.writers.length ? f.writers.map((w) => `${esc(w.name)}${w.roles.length === 1 && w.roles[0] !== 'writer' ? ` <small>(${esc(w.roles[0])})</small>` : ''}`).join(', ') : null],
      ['Produced by', f.producers.length ? f.producers.map(esc).join(', ') : null],
      ['Samples', f.samples.length ? f.samples.map((s) => `<i>${esc(s.title)}</i>${s.artist ? ` by ${esc(s.artist)}` : ''}`).join('; ') : null],
      ['Sampled in', f.sampledBy ? `${f.sampledBy} other recording${f.sampledBy === 1 ? '' : 's'}` : null],
    ].filter(([, v]) => v);
    body = `${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '<p class="dim">MusicBrainz has this song, but no credits for it yet.</p>'}
      ${settings.bio && f.bio ? `<h4>About ${esc(firstArtist(t.artist))}</h4><p class="bio">${esc(f.bio)}</p><p class="src">From Wikipedia (“${esc(f.wiki)}”, CC BY-SA)</p>` : ''}
      <p class="src">Song data from MusicBrainz (CC0).</p>`;
  }
  voltage.panel.render(`
    ${t ? `<p class="now"><b>${esc(t.title)}</b> · ${esc(t.artist)}</p>` : ''}
    ${body}`, `
    .now { margin: 0 0 10px; } .dim { opacity: .65; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 12px; }
    dt { opacity: .6; } dd { margin: 0; } small { opacity: .6; }
    h4 { margin: 14px 0 4px; } .bio { line-height: 1.45; margin: 0; } .src { opacity: .45; font-size: 11px; margin: 6px 0 0; }`);
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; render(); if (settings.bio && facts && !facts.none && !facts.bio && track) addBio(track); });
voltage.on('track', (t) => { track = t; facts = null; status = ''; render(); load(); });
voltage.on('panel', ({ open: o }) => { open = o; render(); load(); });
voltage.on('slot', ({ name, open: o }) => { if (name !== 'discovery.details') return; slotShown = o; render(); load(); });

(async () => {
  try { const c = await voltage.storage.get('cache'); if (c?.songs && c?.artists) cache = { ids: {}, ...c }; } catch { /* first run */ }
})();
self.titles = titles; self.norm = norm; self.sameArtist = sameArtist; // for tests
