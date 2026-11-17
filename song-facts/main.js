/// <reference path="../sdk/voltage.d.ts" />
// Song facts (round 12): the playing song in MusicBrainz (release year, writers, producers, samples) and its artist's
// Wikipedia summary (through the Wikidata link MusicBrainz keeps), shown in a panel. Looked up only while the panel is
// open, one MusicBrainz request a second (their rule), cached per song and per artist. Matching is strict: same artist,
// same title, length within 3 s; a wrong song's facts are worse than none.
const MB = 'https://musicbrainz.org/ws/2';
const UA = { 'user-agent': 'Voltage-SongFacts/1.0 (+https://github.com/CastilloA27/Voltage-Plugins)', accept: 'application/json' };
const KEEP_SONGS = 150, KEEP_ARTISTS = 80; // storage is capped at 256 KB

let settings = { bio: true, meaning: true };
let track = null, open = false, slotShown = false, busy = null;
// 1.1: also a few lines under the song in Discovery (ui.slot 'discovery.details', Voltage 1.6.1+), looked up while that shows
const shown = () => open || slotShown;
let cache = { songs: {}, artists: {}, ids: {}, genius: {} }; // songs: id -> facts | {none: true}; artists: mbid -> {bio, wiki}; ids: name -> mbid | null

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

// ───────────── 1.2: meanings from Genius (the user, 2026-11-17: "alternative meanings, double entendres, the cover") ─────────────
// Genius' song description and its line-by-line annotations (written by fans; shown as that), and the album's description
// (often about the cover and the title). Needs the user's own free Genius access token (genius.com/api-clients), kept as a
// secret setting. Matching is strict like MusicBrainz': the same artist, the same title (either script), never a translation
// or a remix the user isn't playing: Genius' top hit for "Plastic Love" is somebody's cover.
const GENIUS = 'https://api.genius.com';
const KEEP_GENIUS = 60;
const SKIP = /translation|tłumaczenie|перевод|übersetzung|traducción|traduction|tradução|romanized|english translation|terjemahan/i;
const VERSION = /\b(remix|mix|live|acoustic|instrumental|demo|edit|version|cover)\b/i;
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t; };
const real = (s) => { const t = String(s ?? '').trim(); return t && t !== '?' ? t : null; };

async function genius(path, token) {
  const r = await voltage.net.fetch(`${GENIUS}${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (r.status === 401) throw new Error('the Genius token was refused (Settings > Plugins > Song facts)');
  if (r.status === 429) throw new Error('Genius asks to slow down; try again in a minute');
  if (r.status !== 200) throw new Error(`Genius HTTP ${r.status}`);
  return (r.json ?? JSON.parse(r.text)).response;
}

/** The playing song on Genius: the right artist, a matching title, not a translation, not another version. */
async function findGenius(t, token) {
  const fa = firstArtist(t.artist), want = titles(t.title, fa).map(norm).filter(Boolean);
  const playingVersion = VERSION.test(t.title);
  const seen = new Map();
  for (const q of [`${titles(t.title, fa)[0]} ${fa}`, titles(t.title, fa)[0]]) {
    const res = await genius(`/search?q=${encodeURIComponent(q)}&per_page=20`, token);
    for (const h of res?.hits ?? []) if (h.type === 'song' && !seen.has(h.result.id)) seen.set(h.result.id, h.result);
    const ok = [...seen.values()].filter((s) => {
      const artist = String(s.primary_artist?.name ?? '');
      if (!sameArtist(fa, [{ name: artist }, { name: artist.replace(/^.*\((.+)\)\s*$/, '$1') }])) return false;
      if (SKIP.test(s.title) || SKIP.test(s.full_title ?? '')) return false;
      if (!playingVersion && VERSION.test(s.title)) return false;
      const names = [s.title, ...(String(s.title).match(/[(（]([^)）]+)[)）]/g) ?? []).map((x) => x.slice(1, -1))].map(norm).filter(Boolean);
      return names.some((n) => want.some((w) => n === w || n.includes(w) || w.includes(n)));
    });
    // the most-viewed match is the original (re-uploads and duplicates have few views)
    ok.sort((a, b) => (b.stats?.pageviews ?? 0) - (a.stats?.pageviews ?? 0));
    if (ok.length) return ok[0];
  }
  return null;
}

async function lookupMeaning(t) {
  const token = await voltage.secret?.get('geniusToken').catch(() => null);
  if (!token) return { noToken: true };
  const hit = await findGenius(t, token);
  if (!hit) return { none: true };
  const song = (await genius(`/songs/${hit.id}?text_format=plain`, token))?.song;
  const refs = (await genius(`/referents?song_id=${hit.id}&text_format=plain&per_page=50`, token))?.referents ?? [];
  const lines = refs.map((r) => ({ line: clip(r.fragment, 160), note: clip(r.annotations?.[0]?.body?.plain, 700), votes: r.annotations?.[0]?.votes_total ?? 0 }))
    .filter((x) => x.line && x.note).sort((a, b) => b.votes - a.votes).slice(0, 15);
  let album = null;
  if (song?.album?.id) {
    const al = (await genius(`/albums/${song.album.id}?text_format=plain`, token))?.album;
    album = { name: song.album.name, about: clip(real(al?.description_annotation?.annotations?.[0]?.body?.plain), 1500) || null };
  }
  return { url: song?.url ?? hit.url, title: hit.full_title, about: clip(real(song?.description?.plain), 2500) || null, lines, album };
}

async function addMeaning(t) {
  if (!settings.meaning) return;
  const k = t.id;
  if (cache.genius?.[k]) { known[k] = { ...(known[k] ?? {}), meaning: cache.genius[k] }; return render(); }
  known[k] = { ...(known[k] ?? {}), meaning: { pending: true } };
  render();
  try {
    const m = await lookupMeaning(t);
    known[k] = { ...(known[k] ?? {}), meaning: m };
    if (!m.noToken) { cache.genius = { ...(cache.genius ?? {}), [k]: m }; trim('genius', KEEP_GENIUS); save(); }
  } catch (e) {
    known[k] = { ...(known[k] ?? {}), meaning: { error: String(e.message ?? e) } };
  }
  render();
}

// ───────────── what's known per song (the playing one, and one picked from a right-click) ─────────────
let known = {}; // id -> { facts, meaning }
let pinned = null; // a song picked with the "Song facts" command; the panel shows it until closed
const subject = () => pinned ?? track;
let nowShown = false; // the full player's Details tab (ui.slot 'nowplaying.details', Voltage 1.9.0+)

async function load(t) {
  if (!t) return;
  const k = t.id;
  if (!known[k]?.facts) {
    const cached = cache.songs[k];
    if (cached) known[k] = { ...(known[k] ?? {}), facts: { ...cached } };
    else if (busy !== k) {
      busy = k; known[k] = { ...(known[k] ?? {}), facts: { pending: true } }; render();
      try {
        const f = await lookup(t);
        cache.songs[k] = f; trim('songs', KEEP_SONGS);
        known[k].facts = { ...f };
        save();
      } catch (e) { known[k].facts = { error: String(e.message ?? e) }; } finally { if (busy === k) busy = null; }
    }
    render();
  }
  const f = known[k]?.facts;
  if (f && !f.none && !f.pending && !f.error && settings.bio && f.artistId && !f.bio) {
    try { const b = await bio(f.artistId); f.bio = b.bio; f.wiki = b.wiki; render(); save(); } catch { /* no bio is fine */ }
  }
  if ((open || nowShown) && !known[k]?.meaning) addMeaning(t);
}
const wanted = () => { if (open) load(subject()); if ((slotShown || nowShown) && track) load(track); };

// ───────────── drawing ─────────────
function factsHtml(f, t) {
  if (!f || f.pending) return '<p class="dim">Looking it up…</p>';
  if (f.error) return `<p class="dim">Couldn't look it up (${esc(f.error)}).</p>`;
  if (f.none) return '<p class="dim">MusicBrainz doesn\'t know this song (or not under this title and artist). Uploads and re-uploads often aren\'t there.</p>';
  const rows = [
    ['Released', f.year ? `${esc(f.year)}${f.album ? ` · <i>${esc(f.album)}</i>` : ''}` : null],
    ['Written by', f.writers.length ? f.writers.map((w) => `${esc(w.name)}${w.roles.length === 1 && w.roles[0] !== 'writer' ? ` <small>(${esc(w.roles[0])})</small>` : ''}`).join(', ') : null],
    ['Produced by', f.producers.length ? f.producers.map(esc).join(', ') : null],
    ['Samples', f.samples.length ? f.samples.map((s) => `<i>${esc(s.title)}</i>${s.artist ? ` by ${esc(s.artist)}` : ''}`).join('; ') : null],
    ['Sampled in', f.sampledBy ? `${f.sampledBy} other recording${f.sampledBy === 1 ? '' : 's'}` : null],
  ].filter(([, v]) => v);
  return `${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '<p class="dim">MusicBrainz has this song, but no credits for it yet.</p>'}
    <p class="src">Song data from MusicBrainz (CC0).</p>
    ${settings.bio && f.bio ? `<h4>About ${esc(firstArtist(t.artist))}</h4><p class="txt">${esc(f.bio)}</p><p class="src">From Wikipedia (“${esc(f.wiki)}”, CC BY-SA)</p>` : ''}`;
}
function meaningHtml(m) {
  if (!settings.meaning) return '';
  if (!m || m.pending) return '<h4>What it means</h4><p class="dim">Looking on Genius…</p>';
  if (m.noToken) return '<h4>What it means</h4><p class="dim">For meanings, line-by-line explanations and the album\'s story, add a free Genius access token: genius.com/api-clients, then Settings › Plugins › Song facts.</p>';
  if (m.error) return `<h4>What it means</h4><p class="dim">${esc(m.error)}</p>`;
  if (m.none) return '<h4>What it means</h4><p class="dim">Genius doesn\'t have this song (or not under this title and artist).</p>';
  const parts = [];
  parts.push(`<h4>What it means</h4>${m.about ? `<p class="txt">${esc(m.about).replace(/\n+/g, '</p><p class="txt">')}</p>` : '<p class="dim">No description on Genius yet.</p>'}`);
  if (m.lines.length) parts.push(`<h4>Line by line</h4>${m.lines.map((x) => `<blockquote>${esc(x.line)}</blockquote><p class="txt note">${esc(x.note)}</p>`).join('')}`);
  if (m.album?.about) parts.push(`<h4>The album: <i>${esc(m.album.name)}</i></h4><p class="txt">${esc(m.album.about).replace(/\n+/g, '</p><p class="txt">')}</p>`);
  parts.push(`<p class="src">Meanings and explanations: Genius, written by its community (fans' readings, not always the artist's) · ${esc(m.url)}</p>`);
  return parts.join('');
}
const CSS = `.now { margin: 0 0 10px; } .dim { opacity: .65; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 6px; }
  dt { opacity: .6; } dd { margin: 0; } small { opacity: .6; }
  h4 { margin: 16px 0 6px; font-size: 14px; letter-spacing: .02em; }
  .txt { line-height: 1.5; margin: 0 0 8px; } .note { opacity: .9; }
  blockquote { margin: 10px 0 4px; padding: 2px 10px; border-left: 3px solid currentColor; opacity: .75; font-style: italic; white-space: pre-line; }
  .src { opacity: .45; font-size: 11px; margin: 6px 0 0; }`;
function fullHtml(t) {
  if (!t) return '<p class="dim">Nothing is playing.</p>';
  const k = known[t.id] ?? {};
  return `<p class="now"><b>${esc(t.title)}</b> · ${esc(t.artist)}</p>${factsHtml(k.facts, t)}${meaningHtml(k.meaning)}`;
}

// the Discovery slot: released / written / produced / samples on a line each, nothing while unknown or looking
function renderDiscovery() {
  if (!slotShown || !voltage.slot) return;
  const f = known[track?.id]?.facts;
  if (!f || f.pending || f.none || f.error) return voltage.slot.render('discovery.details', '');
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
  renderDiscovery();
  if (nowShown && voltage.slot) voltage.slot.render('nowplaying.details', fullHtml(track), `:host { display: block; font-size: 14px; color: inherit; } ${CSS}`);
  if (open) voltage.panel.render(`${pinned ? '<p class="dim small">The song you picked · close this to follow the playing song again</p>' : ''}${fullHtml(subject())}`, CSS);
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; known = Object.fromEntries(Object.entries(known).map(([k, v]) => [k, { facts: v.facts }])); render(); wanted(); });
voltage.on('track', (t) => { track = t; render(); wanted(); });
voltage.on('panel', ({ open: o }) => { open = o; if (!o) pinned = null; render(); wanted(); });
voltage.on('slot', ({ name, open: o }) => {
  if (name === 'discovery.details') slotShown = o;
  else if (name === 'nowplaying.details') nowShown = o;
  else return;
  render(); wanted();
});
// right-click a song (or Ctrl+K) > "Song facts": Voltage opens the panel ("panel": true in plugin.json); it shows that song
voltage.on('command', ({ id, track: t }) => { if (id !== 'open' || !t) return; pinned = t; render(); wanted(); });

(async () => {
  try { const c = await voltage.storage.get('cache'); if (c?.songs && c?.artists) cache = { ids: {}, genius: {}, ...c }; } catch { /* first run */ }
})();
self.titles = titles; self.norm = norm; self.sameArtist = sameArtist; self.findGenius = findGenius; self.lookupMeaning = lookupMeaning; // for tests
