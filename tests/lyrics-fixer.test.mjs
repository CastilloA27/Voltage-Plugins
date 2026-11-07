// Lyrics fixer: tap-along timing, nudge / shift, save -> a lyrics source, LRCLIB proof-of-work and sharing (only after
// the confirmation).   node tests/lyrics-fixer.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadPlugin } from '../sdk/mock-host.mjs';

const posts = [];
const answer = (cap, a) => {
  if (cap !== 'net.fetch') return undefined;
  if (a.url.includes('/api/get?')) return { status: 200, json: { plainLyrics: 'First line\nSecond line\n\nThird line\n' } };
  if (a.url.endsWith('/api/request-challenge')) return { status: 200, json: { prefix: 'vtest', target: '0fff' + 'f'.repeat(60) } };
  if (a.url.endsWith('/api/publish')) { posts.push(a); return { status: 201, text: '' }; }
  return { status: 404, text: '' };
};
const p = await loadPlugin('lyrics-fixer', { answer });

// SHA-256 matches Node's
for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(200)]) {
  assert.equal(Buffer.from(p.scope.sha256(s)).toString('hex'), crypto.createHash('sha256').update(s).digest('hex'), `sha256 of ${s.length} chars`);
}

// open the panel on a playing song: LRCLIB's text, empty lines dropped
await p.emit('track', { id: 'v1', title: 'Song', artist: 'Artist', album: 'Album', dur: 200 });
await p.emit('panel', { open: true });
assert.match(p.panel.html, /Tap: line 1 of 3/);
// tap along: positions 10 s, 14.5 s, 20 s (a tap lands 0.15 s early to make up for reaction time)
await p.emit('playing', true);
for (const t of [10, 14.5, 20]) {
  await p.emit('position', { pos: t, dur: 200 });
  await p.emit('panel-action', { action: 'tap' });
}
assert.match(p.panel.html, /00:09\.85.*First line/s);
assert.match(p.panel.html, /00:19\.85.*Third line/s);
// nudge line 2 by +0.1, then everything 0.25 s later
await p.emit('panel-action', { action: 'nudge', value: '1:0.1' });
await p.emit('panel-action', { action: 'shift', value: '0.25' });
assert.match(p.panel.html, /00:14\.70.*Second line/s);
// save: "My lyrics" is a source for this song now
await p.emit('panel-action', { action: 'save' });
assert.equal(p.refreshes, 1, 'asks Voltage to show it at once');
await p.emit('lyrics-request', { rid: 'r1', id: 'v1', title: 'Song', artist: 'Artist', dur: 200 });
const mine = p.lyrics.at(-1).result;
assert.equal(mine.source, 'My lyrics');
assert.equal(JSON.stringify(mine.lines.map((l) => l.t)), '[10.1,14.7,20.1]');
await p.emit('lyrics-request', { rid: 'r2', id: 'other', title: 'X', artist: 'Y', dur: 1 });
assert.equal(p.lyrics.at(-1).result, null, 'nothing for other songs');

// sharing: nothing is sent before the confirmation; then a valid proof-of-work token and the LRC body
await p.emit('panel-action', { action: 'share' });
assert.match(p.panel.html, /Share these lyrics publicly/);
assert.equal(posts.length, 0, 'not sent yet');
await p.emit('panel-action', { action: 'share-yes' });
for (let i = 0; i < 50 && !posts.length; i++) await p.advance(10);
assert.equal(posts.length, 1);
const [prefix, nonce] = posts[0].headers['x-publish-token'].split(':');
assert.ok(crypto.createHash('sha256').update(prefix + nonce).digest('hex') <= '0fff' + 'f'.repeat(60), 'the token meets the target');
const body = JSON.parse(posts[0].body);
assert.equal(body.syncedLyrics, '[00:10.10] First line\n[00:14.70] Second line\n[00:20.10] Third line');
assert.equal(body.plainLyrics, 'First line\nSecond line\nThird line');
assert.equal(body.duration, 200);
assert.match(p.panel.html, /Shared on LRCLIB/);

// a song LRCLIB doesn't have: paste your own
const q = await loadPlugin('lyrics-fixer', { answer: (cap, a) => (cap === 'net.fetch' ? { status: 404, text: '' } : undefined) });
await q.emit('track', { id: 'v2', title: 'New', artist: 'Someone', dur: 100 });
await q.emit('panel', { open: true });
assert.match(q.panel.html, /paste the lyrics/i);
await q.emit('panel-action', { action: 'paste', form: { paste: '[00:01.00] a\nb\n' } });
assert.match(q.panel.html, /Tap: line 1 of 2/, 'timestamps in pasted text are dropped');
console.log('PASS lyrics-fixer.test.mjs');
