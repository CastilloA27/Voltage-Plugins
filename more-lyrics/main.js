// More lyrics sources: Kugou's word-timed lyrics (KRC). Search the song (same title, same first artist, length within
// 3 s), ask Kugou's lyrics search for that exact recording, download the KRC, decode it (base64, "krc1" header, a fixed
// XOR key, zlib) and hand Voltage lines with word times. Matching is strict on purpose: no lyrics beats wrong lyrics.
const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
const CREDIT = /^\s*(作词|作曲|编曲|作詞|編曲|词|曲|制作人|混音|录音|母带|和声|监制|Lyrics|Composer|Arranger|Producer|Written by)\s*[:：]/i;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[(（[【].*?[)）\]】]/g, ' ').replace(/feat\..*$/i, ' ')
  .replace(/[\s\-_'’"“”.,!?！？・·~〜]+/g, '');
const firstArtist = (a) => String(a ?? '').split(/,|、|&| feat\.| x /i)[0].trim();

async function getJson(url) {
  const r = await voltage.net.fetch(url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return r.json ?? JSON.parse(r.text);
}

/** base64 KRC -> text: skip "krc1", XOR with the key, zlib-inflate. */
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

const LATIN = /^[\p{Script=Latin}\p{N}\s\p{P}\p{S}]*$/u;

async function find({ title, artist, dur }) {
  const fa = firstArtist(artist), wantA = norm(fa);
  // bilingual YouTube titles ("プラスティック・ラブ - Plastic Love"): every part is a possible title
  const parts = [...new Set([title, ...title.split(/\s+[-–]\s+/)].map((t) => t.replace(/[(（[【].*?[)）\]】]/g, ' ').trim()).filter(Boolean))];
  const wants = parts.map(norm).filter(Boolean);
  const ok = (x) => {
    const n = norm(x.songname), a = norm(x.singername);
    if (!n || (dur && Math.abs(x.duration - dur) > 3)) return false;
    const sameArtist = !wantA || a.includes(wantA) || wantA.includes(a);
    if (sameArtist) return wants.some((w) => n === w || n.includes(w) || w.includes(n));
    // the artist in another script (Mariya Takeuchi / 竹内まりや): only an exact title and a closer length
    const otherScript = LATIN.test(fa) !== LATIN.test(x.singername);
    return otherScript && wants.includes(n) && (!dur || Math.abs(x.duration - dur) <= 2);
  };
  let song = null;
  // artist + title first; then the artist alone (Kugou maps "Tomoko Aran" to 亜蘭知子, which "Tomoko Aran I'm in Love"
  // doesn't), then the title alone; 30 results each, at most 3 searches
  for (const q of [`${fa} ${parts[parts.length - 1]}`, fa, parts[0]].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3)) {
    const s = await getJson(`https://mobiles.kugou.com/api/v3/search/song?format=json&page=1&pagesize=30&showtype=1&keyword=${encodeURIComponent(q)}`);
    song = (s.data?.info ?? []).find(ok);
    if (song) break;
  }
  if (!song) return null;
  const l = await getJson(`https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${song.duration * 1000}&hash=${song.hash}`);
  const c = (l.candidates ?? [])[0];
  if (!c) return null;
  const d = await getJson(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${c.id}&accesskey=${c.accesskey}&fmt=krc&charset=utf8`);
  if (!d.content) return null;
  // Kugou often opens with a header line, "Title - Artist (reading)" or "Artist - Title": not a lyric
  const header = (text) => /\s[-–]\s/.test(text) && text.split(/\s[-–]\s/).map(norm)
    .some((p) => p.length > 1 && wants.some((w) => p === w || p.startsWith(w) || w.startsWith(p)));
  const lines = parseKrc(await decodeKrc(d.content)).filter((l, i) => !(i < 3 && header(l.text)));
  if (lines.length < 5) return null;
  return { source: 'Kugou', synced: true, wordSynced: lines.some((x) => x.words.length > 1), lines };
}

voltage.on('lyrics-request', async (req) => {
  let result = null;
  try { result = await find(req); } catch (e) { voltage.log(`${req.title}: ${e.message ?? e}`); }
  voltage.lyrics.provide(req.rid, result);
});
self.parseKrc = parseKrc; self.norm = norm; // for tests
