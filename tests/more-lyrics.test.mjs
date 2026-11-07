// More lyrics (Kugou + QQ Music): strict matching, KRC and QRC decoding, header / credit lines dropped, the loose search,
// a switch per source, several results for Voltage 1.6.1.   node tests/more-lyrics.test.mjs
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { loadPlugin } from '../sdk/mock-host.mjs';

const KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
/** A KRC file as Kugou serves it: "krc1" + (zlib(text) XOR key), base64. */
function krc(text) {
  const z = zlib.deflateSync(Buffer.from(text, 'utf8'));
  for (let i = 0; i < z.length; i++) z[i] ^= KEY[i % 16];
  return Buffer.concat([Buffer.from('krc1'), z]).toString('base64');
}
const WORDS = ['Don\'t hurt me', 'I\'m just playing games', 'I know', 'that I\'m the type', 'of woman who'];
const KRC = [
  '[0,3000]<0,500,0>Plastic Love <500,500,0>- 竹内まりや', // Kugou's header line: dropped
  '[3000,2000]<0,300,0>作词<300,300,0>：竹内まりや', // a credit: dropped
  ...WORDS.map((l, i) => `[${6000 + i * 3000},2500]${l.split(' ').map((w, k) => `<${k * 400},400,0>${w} `).join('')}`),
].join('\n');
// QRC: absolute word times in ms, wrapped in QQ's XML (quotes in the text are escaped there)
const QRC = `<?xml version="1.0" encoding="utf-8"?>\n<QrcInfos>\n<LyricInfo LyricCount="1">\n<Lyric_1 LyricType="1" LyricContent="[ti:Plastic Love]\n`
  + `[0,500]Plastic Love - (0,250)竹内まりや(250,250)\n`
  + WORDS.map((l, i) => `[${7000 + i * 3000},2500]${l.split(' ').map((w, k) => `${w.replace(/'/g, '&apos;')} (${7000 + i * 3000 + k * 400},400)`).join('')}`).join('\n')
  + '\n"/>\n</LyricInfo>\n</QrcInfos>';

const kugouSongs = [
  { songname: 'Plastic Love (Cover)', singername: 'Someone Else', duration: 474, hash: 'X' }, // wrong artist
  { songname: 'Plastic Love', singername: '竹内まりや', duration: 470, hash: 'A' }, // other script, exact title, close length
];
const qqSongs = [{ songname: 'Plastic Love', singer: [{ name: '竹内まりや (Mariya Takeuchi)' }], interval: 471, songid: 77 }];
let qrcHex = '';
const answer = (cap, a) => {
  if (cap !== 'net.fetch') return undefined;
  if (a.url.includes('/search/song')) return { status: 200, json: { data: { info: kugouSongs } } };
  if (a.url.includes('krcs.kugou.com')) return { status: 200, json: { candidates: a.url.includes('hash=A') ? [{ id: 1, accesskey: 'k' }] : [] } };
  if (a.url.includes('lyrics.kugou.com')) return { status: 200, json: { content: krc(KRC) } };
  if (a.url.includes('client_search_cp')) return { status: 200, json: { data: { song: { list: qqSongs } } } };
  if (a.url.includes('lyric_download.fcg')) return { status: 200, text: a.url.includes('musicid=77') ? `<!--\n<lyric><content type="file"><![CDATA[${qrcHex}]]></content></lyric>-->` : '' };
  return { status: 404, text: '' };
};
const p = await loadPlugin('more-lyrics', { answer });

// a synthetic QRC, encrypted with the plugin's own cipher in encrypt mode (3DES-EDE: the decrypt order reversed)
{
  const { keySchedule, crypt, KEY: K, ENC, DEC } = p.scope.qqCipher;
  const z = zlib.deflateSync(Buffer.from(QRC, 'utf8'));
  const data = new Uint8Array(Math.ceil(z.length / 8) * 8);
  data.set(z);
  const sched = [keySchedule(K, 0, ENC), keySchedule(K, 8, DEC), keySchedule(K, 16, ENC)];
  const block = new Uint8Array(8);
  for (let i = 0; i < data.length; i += 8) {
    crypt(data, i, block, sched[0]); crypt(block, 0, block, sched[1]); crypt(block, 0, block, sched[2]);
    data.set(block, i);
  }
  qrcHex = Buffer.from(data).toString('hex').toUpperCase();
  assert.equal(await p.scope.decryptQrc(qrcHex), QRC, 'QRC round trip (padding after the zlib stream is ignored)');
}

let rid = 0;
const ask = async (req) => {
  await p.emit('lyrics-request', { rid: `r${++rid}`, id: req.id ?? 'v1', ...req });
  return p.lyrics.at(-1).result;
};

// found on both: the bilingual YouTube title, the romanized artist; header and credit lines dropped, word timing kept
const both = await ask({ title: 'プラスティック・ラブ - Plastic Love', artist: 'Mariya Takeuchi', dur: 471 });
assert.equal(both.length, 2, 'a list for Voltage 1.6.1 (it has lyrics.refresh)');
for (const r of both) {
  assert.equal(r.lines.length, 5, r.source);
  assert.equal(r.lines[0].text, "Don't hurt me", r.source);
  assert.equal(r.wordSynced, true);
}
const k = both.find((r) => r.source === 'Kugou'), q = both.find((r) => r.source === 'QQ Music');
assert.equal(k.lines[0].t, 6);
assert.equal(JSON.stringify(k.lines[0].words.map((w) => +w.t.toFixed(1))), '[6,6.4,6.8]');
assert.equal(q.lines[0].t, 7);
assert.equal(JSON.stringify(q.lines[0].words.map((w) => +w.t.toFixed(1))), '[7,7.4,7.8]', 'QRC word times are absolute');
assert.equal(q.lines[1].text, "I'm just playing games", 'XML escapes undone');

// a length that's off by more than 3 s, or another song: nothing (no lyrics beats wrong lyrics)
assert.equal((await ask({ title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 })).length, 0);
assert.equal((await ask({ title: 'September', artist: 'Mariya Takeuchi', dur: 470 })).length, 0);

// a source switched off isn't asked
await p.emit('settings', { qq: false });
const only = await ask({ title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 471 });
assert.equal(JSON.stringify(only.map((r) => r.source)), '["Kugou"]');
await p.emit('settings', { qq: true });

// the loose search (command): a length that's off is accepted for that one song, and labelled
await p.emit('track', { id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 });
await p.emit('command', { id: 'loose', track: { id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi' } });
assert.equal(p.refreshes, 1, 'asks Voltage to request lyrics again');
const loose = await ask({ id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 });
assert.equal(JSON.stringify(loose.map((r) => r.source).sort()), '["Kugou (loose match)","QQ Music (loose match)"]');
assert.ok(p.notices.some((n) => n.includes('loose match')));
assert.equal((await ask({ id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 })).length, 0, 'only once: back to strict');
// a command for a song that isn't playing: told, nothing searched
await p.emit('command', { id: 'loose', track: { id: 'other', title: 'X', artist: 'Y' } });
assert.equal(p.refreshes, 1);

// Voltage 1.6.0 (no lyrics.refresh): one result, the best
const old = await loadPlugin('more-lyrics', { answer });
delete old.scope.voltage.lyrics.refresh;
await old.emit('lyrics-request', { rid: 'x', id: 'v1', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 471 });
const one = old.lyrics.at(-1).result;
assert.ok(one && !Array.isArray(one) && one.wordSynced, 'a single result');

// the norm() helper: brackets, feat. and punctuation don't matter
assert.equal(p.scope.norm('Plastic Love (2021 Remaster) feat. X'), p.scope.norm('plastic love'));
console.log('PASS more-lyrics.test.mjs');
