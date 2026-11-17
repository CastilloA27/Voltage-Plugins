/// <reference path="../sdk/voltage.d.ts" />
// Song facts (round 12): the playing song in MusicBrainz (release year, writers, producers, samples) and its artist's
// Wikipedia summary (through the Wikidata link MusicBrainz keeps), shown in a panel. Looked up only while the panel is
// open, one MusicBrainz request a second (their rule), cached per song and per artist. Matching is strict: same artist,
// same title, length within 3 s; a wrong song's facts are worse than none.
const MB = 'https://musicbrainz.org/ws/2';
const UA = { 'user-agent': 'Voltage-SongFacts/1.0 (+https://github.com/CastilloA27/Voltage-Plugins)', accept: 'application/json' };
const KEEP_SONGS = 150, KEEP_ARTISTS = 80; // storage is capped at 256 KB

let settings = { bio: true, meaning: true, wiki: true, lineNotes: true };
let track = null, open = false, slotShown = false, busy = null;
// 1.1: also a few lines under the song in Discovery (ui.slot 'discovery.details', Voltage 1.6.1+), looked up while that shows
const shown = () => open || slotShown;
let cache = { songs: {}, artists: {}, ids: {}, genius: {}, wiki: {} }; // songs: id -> facts | {none: true}; artists: mbid -> {bio, wiki}; ids: name -> mbid | null

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[(（[【].*?[)）\]】]/g, ' ').replace(/\s(feat|ft)\..*$/i, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');
/** The artist to look up: the credited one, or the title's "Artist - " part when it is the channel's name with spaces
 *  ("jbalvinVEVO" + "J Balvin - Amarillo"). */
function artistOf(t) {
  const fa = firstArtist(t.artist), head = String(t.title ?? '').split(/\s+[-–]\s+/);
  return head.length > 1 && norm(head[0]) === norm(fa) ? head[0].trim() : fa;
}
const firstArtist = (a) => String(a ?? '').split(/,|、|&| feat\.| x /i)[0].replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\s+official$/i, '').trim();
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
  const fa = artistOf(t), dur = t.dur || 0;
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
  let writers = [], workWd = null, workLang = null;
  const work = rels.find((x) => x.type === 'performance' && x.work)?.work;
  if (work) {
    const w = await get(`${MB}/work/${work.id}?inc=artist-rels+url-rels&fmt=json`);
    workWd = wikidataOf(w);
    workLang = (w?.languages ?? [])[0] ?? w?.language ?? null;
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
    // 1.3: for the song's and the album's own Wikipedia articles
    workWd, lang: workLang, rgid: first?.['release-group']?.id ?? null, recWd: wikidataOf(r),
  };
}

const wikidataOf = (x) => (x?.relations ?? []).find((y) => y.type === 'wikidata')?.url?.resource?.match(/Q\d+$/)?.[0] ?? null;

// ───────────── 1.3: the song's and the album's own Wikipedia articles, in the song's language first ─────────────
// Only through links (MusicBrainz -> Wikidata -> that language's article), never a search: a wrong article is worse than none.
// The song's language (MusicBrainz work, ISO 639-3) picks the Wikipedia; English is the fallback. The lead and the sections
// about how it was made, what it's about and the cover.
const WIKI_LANGS = { jpn: 'ja', spa: 'es', kor: 'ko', zho: 'zh', fra: 'fr', por: 'pt', deu: 'de', ita: 'it', eng: 'en' };
const LANG_NAME = { ja: 'Japanese', es: 'Spanish', ko: 'Korean', zh: 'Chinese', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian', en: 'English' };
const WANT = /background|\bhistory\b|\borigins?\b|\bdevelopment\b|composition|writing|recording|production|lyric|theme|meaning|artwork|cover|title|concept|inspiration|背景|制作|楽曲|歌詞|テーマ|ジャケット|アートワーク|解説|タイトル|コンセプト|antecedentes|composici|letra|tem[aá]tica|significado|portada|grabaci|producci|inspiraci|concepto|배경|가사|작사|커버|fond|paroles|pochette|hintergrund|text|cover|composizione|testo|copertina|letra|capa|antecedentes/i;
const KEEP_WIKI = 12;
const WD_API = 'https://www.wikidata.org/w/api.php';
const SONG_TYPES = ['Q7366', 'Q134556', 'Q105543609', 'Q2188189'], ALBUM_TYPES = ['Q482994', 'Q208569', 'Q169930', 'Q209939'];
const claimIds = (ent, p) => (ent?.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
/** The artist's Wikidata id (MusicBrainz keeps the link). */
async function artistQid(artistId) {
  if (!artistId) return null;
  const a = cache.artists[artistId] ?? (cache.artists[artistId] = {});
  if (a.qid !== undefined) return a.qid;
  const x = await get(`${MB}/artist/${artistId}?inc=url-rels&fmt=json`);
  a.qid = wikidataOf(x);
  return a.qid;
}
/** Wikidata items named `name` that are a song (or an album) whose performer is exactly this artist. */
async function searchQid(name, qid, types, lang) {
  if (!name || !qid) return null;
  for (const l of [...new Set([lang, 'en'].filter(Boolean))]) {
    const s = await get(`${WD_API}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${l}&uselang=${l}&type=item&limit=50&format=json`);
    const ids = (s?.search ?? []).map((x) => x.id).slice(0, 50); // a common word ("Amarillo") has the song far down
    if (!ids.length) continue;
    const e = await get(`${WD_API}?action=wbgetentities&ids=${ids.join('|')}&props=claims&format=json`);
    const hit = ids.find((id) => {
      const ent = e?.entities?.[id];
      return claimIds(ent, 'P31').some((t) => types.includes(t)) && claimIds(ent, 'P175').includes(qid);
    });
    if (hit) return hit;
  }
  return null;
}
async function wikiFor(qid, lang, hint) {
  if (!qid) return null;
  const e = await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const links = e?.entities?.[qid]?.sitelinks ?? {};
  const order = [...new Set([lang && WIKI_LANGS[lang], hint, 'en'].filter(Boolean))];
  for (const l of order) {
    const title = links[`${l}wiki`]?.title;
    if (!title) continue;
    const q = `https://${l}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
    const text = (await get(q))?.query?.pages?.[0]?.extract;
    if (!text) continue;
    const parts = text.split(/\n(?===+ )/);
    const lead = clip(parts[0], 600);
    const sections = parts.slice(1).map((x) => { const m = x.match(/^=+ *(.+?) *=+\n([\s\S]*)$/); return m && { head: m[1], body: clip(m[2].replace(/\n{2,}/g, '\n'), 900) }; })
      .filter((x) => x && x.body && WANT.test(x.head)).slice(0, 3);
    return { lang: l, title, lead, sections };
  }
  return null;
}
async function addWiki(t) {
  const k = t.id, f = known[k]?.facts;
  if (!settings.wiki || !f || f.none || f.pending || f.error || known[k].wiki) return;
  if (cache.wiki?.[k]) { known[k].wiki = cache.wiki[k]; return render(); }
  known[k].wiki = { pending: true };
  render();
  try {
    const hint = /[\u3040-\u30ff\u4e00-\u9fff]/.test(t.title) ? 'ja' : (known[k]?.meaning?.lang ?? null);
    const aq = await artistQid(f.artistId);
    const wl = (f.lang && WIKI_LANGS[f.lang]) || hint || null;
    // the title as MusicBrainz has it, its parts ("曲 - Song") and a bilingual title split where the script changes
    // ("悲しみがとまらない I CAN'T STOP THE LONELINESS"): the first that names a song by exactly this artist wins
    const variants = [...new Set([f.title, ...titles(f.title, f.artist ?? ''),
      ...String(f.title ?? '').split(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])\s+(?=[A-Za-z])/u)].map((x) => x.trim()).filter(Boolean))];
    let songQ = f.workWd ?? f.recWd ?? null;
    for (const v of variants) { if (songQ) break; songQ = await searchQid(v, aq, SONG_TYPES, wl); }
    let song = await wikiFor(songQ, f.lang, hint);
    let album = null, albumQ = null, single = false;
    if (f.rgid) {
      const rg = await get(`${MB}/release-group/${f.rgid}?inc=url-rels&fmt=json`);
      albumQ = wikidataOf(rg);
      single = rg?.['primary-type'] === 'Single';
    }
    albumQ = albumQ ?? (f.album ? await searchQid(f.album, aq, ALBUM_TYPES, wl) : null);
    if (albumQ) album = await wikiFor(albumQ, f.lang, hint);
    if (album && song && album.title === song.title) album = null; // a single's article is the song's
    if (album && !song && single) { song = album; album = null; } // the song came out as a single: its article is the song's
    known[k].wiki = { song, album };
    cache.wiki = { ...(cache.wiki ?? {}), [k]: known[k].wiki };
    trim('wiki', KEEP_WIKI);
    save();
  } catch (e) { known[k].wiki = { error: String(e.message ?? e) }; }
  render();
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
const LIMIT = 200000;
function save() {
  for (const kind of ['genius', 'wiki', 'genius', 'wiki', 'songs', 'artists']) {
    if (JSON.stringify(cache).length <= LIMIT) break;
    const keys = Object.keys(cache[kind] ?? {});
    for (const x of keys.slice(0, Math.ceil(keys.length / 2))) delete cache[kind][x];
  }
  return voltage.storage.set('cache', cache).catch(() => {});
}

// ───────────── 1.2: meanings from Genius (the user, 2026-11-17: "alternative meanings, double entendres, the cover") ─────────────
// Genius' song description and its line-by-line annotations (written by fans; shown as that), and the album's description
// (often about the cover and the title). Needs the user's own free Genius access token (genius.com/api-clients), kept as a
// secret setting. Matching is strict like MusicBrainz': the same artist, the same title (either script), never a translation
// or a remix the user isn't playing: Genius' top hit for "Plastic Love" is somebody's cover.
const GENIUS = 'https://api.genius.com';
const KEEP_GENIUS = 10; // the long texts: 10 songs fit the storage cap with room to spare
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
  const fa = artistOf(t), want = titles(t.title, fa).map(norm).filter(Boolean);
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
  // 1.3: every explained line for Voltage's lyrics (lyrics.notes): the quoted fragment and its note; Voltage finds the line
  const notes = refs.map((r) => ({ text: String(r.fragment ?? '').slice(0, 400), note: clip(r.annotations?.[0]?.body?.plain, 500) }))
    .filter((x) => x.text && x.note).slice(0, 40);
  let album = null;
  if (song?.album?.id) {
    const al = (await genius(`/albums/${song.album.id}?text_format=plain`, token))?.album;
    album = { name: song.album.name, about: clip(real(al?.description_annotation?.annotations?.[0]?.body?.plain), 1500) || null };
  }
  return { lang: /^[a-z]{2}$/.test(song?.language ?? '') ? song.language : null, url: song?.url ?? hit.url, title: hit.full_title, about: clip(real(song?.description?.plain), 2500) || null, lines, notes, album };
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
  sendNotes();
}

// ───────────── 1.3: marks on Voltage's own lyric lines (lyrics.notes, Voltage 1.10.0+) ─────────────
// Voltage shows the lyrics; this only sends Genius's explained fragments with their notes, and Voltage matches them to its
// lines (the plugin never sees the lyrics). Cleared on every new song and when switched off.
function sendNotes() {
  if (!voltage.lyrics?.notes) return; // an older Voltage
  const m = track && known[track.id]?.meaning;
  const list = settings.lineNotes !== false && settings.meaning !== false && m?.notes?.length ? m.notes.map((n) => ({ ...n, source: 'Genius' })) : [];
  voltage.lyrics.notes(track?.id ?? '', list);
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
  if ((open || nowShown) && !known[k]?.meaning) await addMeaning(t); // first: Genius tells the song's language
  if (open || nowShown) addWiki(t);
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
  h4 { margin: 16px 0 6px; font-size: 14px; letter-spacing: .02em; } h5 { margin: 10px 0 4px; font-size: 13px; opacity: .8; }
  .txt { line-height: 1.5; margin: 0 0 8px; } .note { opacity: .9; }
  blockquote { margin: 10px 0 4px; padding: 2px 10px; border-left: 3px solid currentColor; opacity: .75; font-style: italic; white-space: pre-line; }
  .src { opacity: .45; font-size: 11px; margin: 6px 0 0; }`;
function wikiHtml(w) {
  if (!settings.wiki || !w || w.pending || w.error) return w?.pending ? '<h4>From Wikipedia</h4><p class="dim">Looking…</p>' : '';
  const one = (x, label) => !x ? '' : `<h4>${label}</h4>${x.lead ? `<p class="txt">${esc(x.lead)}</p>` : ''}${x.sections.map((s) => `<h5>${esc(s.head)}</h5><p class="txt">${esc(s.body).replace(/\n/g, '</p><p class="txt">')}</p>`).join('')}
    <p class="src">From ${LANG_NAME[x.lang] ?? x.lang} Wikipedia: “${esc(x.title)}” (CC BY-SA)</p>`;
  return one(w.song, 'The song on Wikipedia') + one(w.album, 'The album on Wikipedia');
}
function fullHtml(t) {
  if (!t) return '<p class="dim">Nothing is playing.</p>';
  const k = known[t.id] ?? {};
  return `<p class="now"><b>${esc(t.title)}</b> · ${esc(t.artist)}</p>${factsHtml(k.facts, t)}${meaningHtml(k.meaning)}${wikiHtml(k.wiki)}`;
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

voltage.on('settings', (s) => { settings = { ...settings, ...s }; known = Object.fromEntries(Object.entries(known).map(([k, v]) => [k, { facts: v.facts }])); render(); wanted(); sendNotes(); });
voltage.on('track', (t) => {
  track = t; render(); wanted();
  sendNotes(); // clears the last song's marks at once
  // the marks need the song's Genius notes even with the panel closed (without a token the lookup stops before any request)
  if (t && settings.lineNotes !== false && settings.meaning !== false && !known[t.id]?.meaning) addMeaning(t);
});
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
  try { const c = await voltage.storage.get('cache'); if (c?.songs && c?.artists) cache = { ids: {}, genius: {}, wiki: {}, ...c }; } catch { /* first run */ }
})();
self.titles = titles; self.norm = norm; self.sameArtist = sameArtist; self.findGenius = findGenius; self.lookupMeaning = lookupMeaning; self.lookup = lookup; self.wikiFor = wikiFor; self.wikidataOf = wikidataOf; self.get = get; self.addWiki = addWiki; self.known = () => known; self.artistQid = artistQid; self.searchQid = searchQid; // for tests
