/// <reference path="../sdk/voltage.d.ts" />
// More lyrics sources: word-timed lyrics from Kugou (KRC) and QQ Music (QRC). Each source searches the song (same title,
// same first artist, length within 3 s), downloads its lyrics, decodes them and hands Voltage lines with word times.
// Matching is strict on purpose: no lyrics beats wrong lyrics.
// 1.1 (round 12 P12-11): a command (song menu / Ctrl+K) searches the playing song again more loosely: the title must still
// match, but not the length, and the artist may be missing or spelled differently. Shown as "… (loose match)".
// 1.2 (round 12 P12-10 / P12-18): QQ Music as a second source (strongest for Chinese, good for J-pop and K-pop), a switch
// per source; with Voltage 1.6.1+ every source that found lyrics shows in the lyrics view's source menu.
const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
// credit lines in Chinese and Japanese (詞 / 作詞 are Japanese for the lyricist; Kugou's Plastic Love opens with "詞：竹内まりや")
const CREDIT = /^\s*(作词|作曲|编曲|作詞|編曲|词|詞|曲|制作人|混音|录音|母带|和声|监制|歌|唄|Lyrics|Music|Composer|Arranger|Producer|Written by)\s*[:：]/i;
const LATIN = /^[\p{Script=Latin}\p{N}\s\p{P}\p{S}]*$/u;
const COPY = /karaoke|cover|instrumental|inst\.|remix|伴奏|翻唱|纯音乐|カラオケ|カバー/i;

let settings = { kugou: true, qq: true };
let looseFor = null; // the song id the loose search was asked for

const norm = (s) => String(s ?? '').toLowerCase().replace(/[(（[【].*?[)）\]】]/g, ' ').replace(/feat\..*$/i, ' ')
  .replace(/[\s\-_'’"“”.,!?！？・·~〜]+/g, '');
const firstArtist = (a) => String(a ?? '').split(/,|、|&| feat\.| x /i)[0].trim();

async function getJson(url) {
  const r = await voltage.net.fetch(url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.json ?? JSON.parse(r.text);
}

/** How a request is matched, shared by every source: {fa, parts, wants, pick(list, fields), header(text)}. Strict: title,
 *  first artist (or the artist in another script with an exact title), length within 3 s. Loose: same artist at any
 *  length first, then anyone's, never karaoke / cover / instrumental / remix copies unless the title says so. */
function matcher({ title, artist, dur }, loose) {
  const fa = firstArtist(artist), wantA = norm(fa);
  // bilingual YouTube titles ("プラスティック・ラブ - Plastic Love"): every part is a possible title
  const parts = [...new Set([title, ...title.split(/\s+[-–]\s+/)].map((t) => t.replace(/[(（[【].*?[)）\]】]/g, ' ').trim()).filter(Boolean))];
  const wants = parts.map(norm).filter(Boolean);
  const pick = (list, f) => {
    const titleOk = (x) => { const n = norm(f.title(x)); return !!n && wants.some((w) => n === w || n.includes(w) || w.includes(n)); };
    const artistOk = (x) => { const a = norm(f.artist(x)); return !wantA || a.includes(wantA) || wantA.includes(a); };
    const copy = (x) => COPY.test(f.title(x) ?? '') && !COPY.test(title);
    const ok = (x) => {
      if (!titleOk(x) || (dur && Math.abs(f.dur(x) - dur) > 3)) return false;
      if (artistOk(x)) return true;
      // the artist in another script (Mariya Takeuchi / 竹内まりや): only an exact title and a closer length
      const otherScript = LATIN.test(fa) !== LATIN.test(f.artist(x));
      return otherScript && wants.includes(norm(f.title(x))) && (!dur || Math.abs(f.dur(x) - dur) <= 2);
    };
    return loose ? list.find((x) => titleOk(x) && artistOk(x) && !copy(x)) ?? list.find((x) => titleOk(x) && !copy(x)) : list.find(ok);
  };
  // the sources often open with a header line, "Title - Artist (reading)" or "Artist - Title": not a lyric
  const header = (text) => /\s[-–]\s/.test(text) && text.split(/\s[-–]\s/).map(norm)
    .some((p) => p.length > 1 && wants.some((w) => p === w || p.startsWith(w) || w.startsWith(p)));
  return { fa, parts, pick, header };
}
const finish = (lines, m, source) => {
  const kept = lines.filter((l, i) => !(i < 3 && m.header(l.text)));
  return kept.length < 5 ? null : { source, synced: true, wordSynced: kept.some((x) => x.words.length > 1), lines: kept };
};

// ───────────── Kugou (KRC: base64, "krc1", a fixed XOR key, zlib) ─────────────

async function decodeKrc(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).subarray(4);
  for (let i = 0; i < bin.length; i++) bin[i] ^= KEY[i % 16];
  const out = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(out).text();
}

/** "[1671,1767]<0,469,0>沈<469,365,0>む..." -> {t, text, words} (word time = line start + offset, in seconds). */
function parseKrc(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());
    if (!m) continue;
    const start = +m[1];
    const words = [...m[3].matchAll(/<(\d+),(\d+),\d+>([^<]*)/g)].map((w) => ({ t: (start + +w[1]) / 1000, w: w[3] })).filter((w) => w.w);
    const line = words.map((w) => w.w).join('').trim();
    if (line && !CREDIT.test(line)) lines.push({ t: start / 1000, text: line, words });
  }
  return lines;
}

async function kugou(req, loose) {
  const m = matcher(req, loose);
  const f = { title: (x) => x.songname, artist: (x) => x.singername, dur: (x) => x.duration };
  let song = null;
  // artist + title first; then the artist alone (Kugou maps "Tomoko Aran" to 亜蘭知子, which "Tomoko Aran I'm in Love"
  // doesn't), then the title alone; 30 results each, at most 3 searches
  for (const q of [`${m.fa} ${m.parts[m.parts.length - 1]}`, m.fa, m.parts[0]].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3)) {
    const s = await getJson(`https://mobiles.kugou.com/api/v3/search/song?format=json&page=1&pagesize=30&showtype=1&keyword=${encodeURIComponent(q)}`);
    song = m.pick(s.data?.info ?? [], f);
    if (song) break;
  }
  if (!song) return null;
  const l = await getJson(`https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${song.duration * 1000}&hash=${song.hash}`);
  const c = (l.candidates ?? [])[0];
  if (!c) return null;
  const d = await getJson(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${c.id}&accesskey=${c.accesskey}&fmt=krc&charset=utf8`);
  if (!d.content) return null;
  return finish(parseKrc(await decodeKrc(d.content)), m, loose ? 'Kugou (loose match)' : 'Kugou');
}

// ───────────── QQ Music (QRC: hex, QQ's triple-DES variant, zlib, an XML wrapper) ─────────────
// QQ's cipher, ported from Lyricify Lyrics Helper (github.com/WXRIW/Lyricify-Lyrics-Helper, Decrypter/Qrc/DESHelper.cs,
// Apache-2.0, see NOTICE in this folder): non-standard byte order and two altered S-box entries, so not standard 3DES.
const ENC = 1, DEC = 0;
const QQ_KEY = new TextEncoder().encode('!@#)(*$%123ZXC!@!@#)(NHL');
const SBOX = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];
// a bit of a little-endian-word byte array (QQ's order), placed at bit c
const bitnum = (a, off, b, c) => (((a[off + Math.floor(b / 32) * 4 + 3 - Math.floor((b % 32) / 8)] >> (7 - (b % 8))) & 1) << c) >>> 0;
const intr = (a, b, c) => ((a >>> (31 - b)) & 1) << c;
const intl = (a, b, c) => (((a << b) & 0x80000000) >>> c) >>> 0;
const sboxbit = (a) => (a & 0x20) | ((a & 0x1f) >> 1) | ((a & 0x01) << 4);
const SHIFT = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const PERM_C = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35];
const PERM_D = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3];
const COMP = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1,
  40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31];
const IP0 = [57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];
const IP1 = [56, 48, 40, 32, 24, 16, 8, 0, 58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6];
const PBOX = [15, 6, 19, 20, 28, 11, 27, 16, 0, 14, 22, 25, 4, 17, 30, 9, 1, 7, 23, 13, 31, 26, 2, 8, 18, 12, 29, 5, 21, 10, 3, 24];

function keySchedule(key, off, mode) {
  const sched = Array.from({ length: 16 }, () => new Uint8Array(6));
  let C = 0, D = 0;
  for (let i = 0; i < 28; i++) C = (C | bitnum(key, off, PERM_C[i], 31 - i)) >>> 0;
  for (let i = 0; i < 28; i++) D = (D | bitnum(key, off, PERM_D[i], 31 - i)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const s = SHIFT[i];
    C = (((C << s) | (C >>> (28 - s))) & 0xfffffff0) >>> 0;
    D = (((D << s) | (D >>> (28 - s))) & 0xfffffff0) >>> 0;
    const k = sched[mode === DEC ? 15 - i : i];
    for (let j = 0; j < 24; j++) k[j >> 3] |= intr(C, COMP[j], 7 - (j % 8));
    for (let j = 24; j < 48; j++) k[j >> 3] |= intr(D, COMP[j] - 27, 7 - (j % 8));
  }
  return sched;
}

function f(state, key) {
  const t1 = (intl(state, 31, 0) | ((state & 0xf0000000) >>> 1) | intl(state, 4, 5) | intl(state, 3, 6) | ((state & 0x0f000000) >>> 3)
    | intl(state, 8, 11) | intl(state, 7, 12) | ((state & 0x00f00000) >>> 5) | intl(state, 12, 17) | intl(state, 11, 18)
    | ((state & 0x000f0000) >>> 7) | intl(state, 16, 23)) >>> 0;
  const t2 = (intl(state, 15, 0) | ((state & 0x0000f000) << 15) | intl(state, 20, 5) | intl(state, 19, 6) | ((state & 0x00000f00) << 13)
    | intl(state, 24, 11) | intl(state, 23, 12) | ((state & 0x000000f0) << 11) | intl(state, 28, 17) | intl(state, 27, 18)
    | ((state & 0x0000000f) << 9) | intl(state, 0, 23)) >>> 0;
  const l = [(t1 >>> 24) & 0xff, (t1 >>> 16) & 0xff, (t1 >>> 8) & 0xff, (t2 >>> 24) & 0xff, (t2 >>> 16) & 0xff, (t2 >>> 8) & 0xff];
  for (let i = 0; i < 6; i++) l[i] ^= key[i];
  const s = ((SBOX[0][sboxbit(l[0] >> 2)] << 28) | (SBOX[1][sboxbit(((l[0] & 0x03) << 4) | (l[1] >> 4))] << 24)
    | (SBOX[2][sboxbit(((l[1] & 0x0f) << 2) | (l[2] >> 6))] << 20) | (SBOX[3][sboxbit(l[2] & 0x3f)] << 16)
    | (SBOX[4][sboxbit(l[3] >> 2)] << 12) | (SBOX[5][sboxbit(((l[3] & 0x03) << 4) | (l[4] >> 4))] << 8)
    | (SBOX[6][sboxbit(((l[4] & 0x0f) << 2) | (l[5] >> 6))] << 4) | SBOX[7][sboxbit(l[5] & 0x3f)]) >>> 0;
  let out = 0;
  for (let i = 0; i < 32; i++) out = (out | intl(s, PBOX[i], i)) >>> 0;
  return out;
}

function crypt(input, off, output, key) {
  let s0 = 0, s1 = 0;
  for (let i = 0; i < 32; i++) { s0 = (s0 | bitnum(input, off, IP0[i], 31 - i)) >>> 0; s1 = (s1 | bitnum(input, off, IP1[i], 31 - i)) >>> 0; }
  for (let r = 0; r < 15; r++) { const t = s1; s1 = (f(s1, key[r]) ^ s0) >>> 0; s0 = t; }
  s0 = (f(s1, key[15]) ^ s0) >>> 0;
  for (const [o, k] of [[3, 7], [2, 6], [1, 5], [0, 4], [7, 3], [6, 2], [5, 1], [4, 0]]) {
    output[o] = intr(s1, k, 7) | intr(s0, k, 6) | intr(s1, k + 8, 5) | intr(s0, k + 8, 4)
      | intr(s1, k + 16, 3) | intr(s0, k + 16, 2) | intr(s1, k + 24, 1) | intr(s0, k + 24, 0);
  }
}

const SCHED = [keySchedule(QQ_KEY, 16, DEC), keySchedule(QQ_KEY, 8, ENC), keySchedule(QQ_KEY, 0, DEC)];
/** The hex in lyric_download.fcg's <content> -> the QRC XML text. */
async function decryptQrc(hex) {
  const n = hex.length >> 1;
  const data = new Uint8Array(n - (n % 8));
  for (let i = 0; i < data.length; i++) data[i] = parseInt(hex.substr(i * 2, 2), 16);
  const block = new Uint8Array(8);
  for (let i = 0; i < data.length; i += 8) {
    crypt(data, i, block, SCHED[0]);
    crypt(block, 0, block, SCHED[1]);
    crypt(block, 0, block, SCHED[2]);
    data.set(block, i);
  }
  // the blocks are padded past the end of the zlib stream: keep what was inflated, ignore the "trailing junk" error
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const parts = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); } } catch (e) { if (!parts.length) throw e; }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer()).replace(/^\uFEFF/, '');
}

const unxml = (s) => s.replace(/&(quot|apos|lt|gt|amp|#(\d+)|#x([0-9a-f]+));/gi, (_, n, d, h) =>
  (d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' }[n.toLowerCase()]));

/** The QRC XML's LyricContent: "[1547,1152]夢(1547,377)な(1924,223)…" -> {t, text, words} (word times are absolute ms). */
function parseQrc(xml) {
  const m = /LyricContent="([\s\S]*?)"\s*\/>/.exec(xml);
  if (!m) return [];
  const lines = [];
  for (const raw of unxml(m[1]).split(/\r?\n/)) {
    const lm = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());
    if (!lm) continue;
    const words = [...lm[3].matchAll(/(.*?)\((\d+),(\d+)\)/g)].map((w) => ({ t: +w[2] / 1000, w: w[1] })).filter((w) => w.w);
    const line = words.map((w) => w.w).join('').trim();
    if (line && !CREDIT.test(line)) lines.push({ t: +lm[1] / 1000, text: line, words });
  }
  return lines;
}

async function qq(req, loose) {
  const m = matcher(req, loose);
  const f = { title: (x) => x.songname, artist: (x) => (x.singer ?? []).map((s) => s.name).join(' '), dur: (x) => x.interval };
  let song = null;
  for (const q of [`${m.fa} ${m.parts[m.parts.length - 1]}`, m.parts[0]].filter((v, i, a) => v && a.indexOf(v) === i)) {
    const s = await getJson(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&n=20&p=1&cr=1&t=0&w=${encodeURIComponent(q)}`);
    song = m.pick(s.data?.song?.list ?? [], f);
    if (song) break;
  }
  if (!song?.songid) return null;
  const r = await voltage.net.fetch(`https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg?version=15&miniversion=82&lrctype=4&musicid=${song.songid}`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const hex = /<content[^>]*><!\[CDATA\[([0-9A-Fa-f]+)\]\]>/.exec(r.text ?? '')?.[1];
  if (!hex) return null;
  return finish(parseQrc(await decryptQrc(hex)), m, loose ? 'QQ Music (loose match)' : 'QQ Music');
}

// ───────────── answering Voltage ─────────────

const SOURCES = { kugou, qq };
const rank = (r) => (r.wordSynced ? 2000 : 1000) + Math.min(r.lines.length, 80);

voltage.on('settings', (s) => { settings = { ...settings, ...s }; });
voltage.on('lyrics-request', async (req) => {
  const loose = req.id === looseFor;
  const on = Object.keys(SOURCES).filter((k) => settings[k] !== false);
  const found = (await Promise.all(on.map((k) => SOURCES[k](req, loose).catch((e) => { voltage.log(`${k} ${req.title}: ${e.message ?? e}`); return null; }))))
    .filter(Boolean).sort((a, b) => rank(b) - rank(a));
  if (loose) {
    looseFor = null;
    voltage.notify(found.length ? `Found lyrics for "${req.title}" on ${found.map((x) => x.source.replace(' (loose match)', '')).join(' and ')} (loose match: pick it in the lyrics view's source menu)`
      : `No source has lyrics for "${req.title}", even with a loose search`);
  }
  // Voltage 1.6.1+ takes several (each becomes a choice in the source menu); older ones one: the best
  voltage.lyrics.provide(req.rid, voltage.lyrics.refresh ? found : found[0] ?? null);
});

let current = null;
voltage.on('track', (t) => { current = t; });
voltage.on('command', ({ id, track }) => {
  if (id !== 'loose') return;
  if (!track || track.id !== current?.id) { voltage.notify('Play the song first, then search again'); return; }
  if (!voltage.lyrics.refresh) { voltage.notify('This needs Voltage 1.6.1 or newer'); return; }
  looseFor = track.id;
  voltage.lyrics.refresh();
});
self.parseKrc = parseKrc; self.parseQrc = parseQrc; self.decryptQrc = decryptQrc; self.norm = norm; // for tests
self.qqCipher = { keySchedule, crypt, KEY: QQ_KEY, ENC, DEC }; // tests encrypt a synthetic QRC with it
