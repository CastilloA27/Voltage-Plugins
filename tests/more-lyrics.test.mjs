// More lyrics (Kugou): strict matching, KRC decoding, header / credit lines dropped.   node tests/more-lyrics.test.mjs
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
const LYRICS = [
  '[0,3000]<0,500,0>Plastic Love <500,500,0>- 竹内まりや', // Kugou's header line: dropped
  '[3000,2000]<0,300,0>作词<300,300,0>：竹内まりや', // a credit: dropped
  ...['Don\'t hurt me', 'I\'m just playing games', 'I know', 'that I\'m the type', 'of woman who'].map((l, i) =>
    `[${6000 + i * 3000},2500]${l.split(' ').map((w, k) => `<${k * 400},400,0>${w} `).join('')}`),
].join('\n');

const songs = [
  { songname: 'Plastic Love (Cover)', singername: 'Someone Else', duration: 474, hash: 'X' }, // wrong artist
  { songname: 'Plastic Love', singername: '竹内まりや', duration: 470, hash: 'A' }, // other script, exact title, close length
];
const answer = (cap, a) => {
  if (cap !== 'net.fetch') return undefined;
  if (a.url.includes('/search/song')) return { status: 200, json: { data: { info: songs } } };
  if (a.url.includes('krcs.kugou.com')) return { status: 200, json: { candidates: a.url.includes('hash=A') ? [{ id: 1, accesskey: 'k' }] : [] } };
  if (a.url.includes('lyrics.kugou.com')) return { status: 200, json: { content: krc(LYRICS) } };
  return { status: 404, text: '' };
};
const p = await loadPlugin('more-lyrics', { answer });
const ask = async (req) => {
  await p.emit('lyrics-request', { rid: req.title + req.dur, ...req });
  return p.lyrics.at(-1).result;
};

// found: the bilingual YouTube title, the romanized artist; header and credit lines dropped, word timing kept
const r = await ask({ title: 'プラスティック・ラブ - Plastic Love', artist: 'Mariya Takeuchi', dur: 471 });
assert.ok(r, 'found');
assert.equal(r.source, 'Kugou');
assert.equal(r.lines.length, 5);
assert.equal(r.lines[0].text, "Don't hurt me");
assert.equal(r.lines[0].t, 6);
assert.equal(r.wordSynced, true);
assert.equal(JSON.stringify(r.lines[0].words.map((w) => +w.t.toFixed(1))), "[6,6.4,6.8]");

// a length that's off by more than 3 s: nothing (no lyrics beats wrong lyrics)
assert.equal(await ask({ title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 }), null);
// another song: nothing
assert.equal(await ask({ title: 'September', artist: 'Mariya Takeuchi', dur: 470 }), null);
// 1.1: the loose search (command): a length that's off is accepted for that one song, and labelled
await p.emit('track', { id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 });
await p.emit('command', { id: 'loose', track: { id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi' } });
assert.equal(p.refreshes, 1, 'asks Voltage to request lyrics again');
const loose = await ask({ id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 });
assert.ok(loose && loose.source === 'Kugou (loose match)');
assert.ok(p.notices.some((n) => n.includes('loose match')));
assert.equal(await ask({ id: 'v9', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 490 }), null, 'only once: back to strict');
// a command for a song that isn't playing: told, nothing searched
await p.emit('command', { id: 'loose', track: { id: 'other', title: 'X', artist: 'Y' } });
assert.equal(p.refreshes, 1);
// the norm() helper: brackets, feat. and punctuation don't matter
assert.equal(p.scope.norm('Plastic Love (2021 Remaster) feat. X'), p.scope.norm('plastic love'));
console.log('PASS more-lyrics.test.mjs');
