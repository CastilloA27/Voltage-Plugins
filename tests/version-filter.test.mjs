// Version filter (P12-24 I1).   node tests/version-filter.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

let queue = [];
const p = await loadPlugin('version-filter', {
  answer: (cap, a) => {
    if (cap === 'queue.remove') { const before = queue.length; queue = queue.filter((t, i) => i === 0 || !a.ids.includes(t.id)); return before - queue.length; }
    return undefined;
  },
});
const v = (title, artist = 'X') => p.scope.versionOf({ title, artist });

// C11: real titles that contain the words stay
for (const t of ['Live Forever', 'Cover Me', 'Remix Your Heart', 'Slow Dancing in the Dark', 'Instrumental Love',
  'Live and Let Die', 'Plastic Love', 'Speed of Light', 'Night Cruising', 'Love Live! Days', 'Stay With Me (真夜中のドア)',
  '4:00 A.M.', 'Love Is Live', 'Undercover Martyn', 'Tokyo Live Wire', 'Daylight - Remastered 2011', 'Mayonaka no Door (2019 Remaster)'])
  assert.equal(v(t), null, `kept: ${t}`);
// defaults on: sped up / nightcore, slowed + reverb, 8D, karaoke / instrumental
assert.equal(v('Plastic Love (Sped Up)'), 'spedUp');
assert.equal(v('Plastic Love', 'Nightcore Reality'), 'spedUp');
assert.equal(v('mayonaka no door - sped up version'), 'spedUp');
assert.equal(v('Stay With Me (slowed + reverb)'), 'slowed');
assert.equal(v('Song | slowed & reverb'), 'slowed');
assert.equal(v('Song [8D AUDIO]'), 'eightD');
assert.equal(v('Song (Instrumental)'), 'karaoke');
assert.equal(v('Song (Off Vocal)'), 'karaoke');
assert.equal(v('Song (Karaoke Version)'), 'karaoke');
// off by default: live, remix, cover
assert.equal(v('Song (Live at Budokan)'), null);
assert.equal(v('Song - Remix'), null);
assert.equal(v('Song (Cover)'), null);
await p.emit('settings', { live: true, remix: true, cover: true });
assert.equal(v('Song (Live at Budokan)'), 'live');
assert.equal(v('Song - Live'), 'live');
assert.equal(v('Song (Night Tempo Remix)'), 'remix');
assert.equal(v('Song 【歌ってみた】'), 'cover');
assert.equal(v('Song (Cover by Someone)'), 'cover');
assert.equal(v('Live Forever'), null, 'still only in the version part');
assert.equal(v('Twinz (Deep Cover 98) (feat. Fat Joe)'), null, 'C11: a title in brackets');
assert.equal(v('Song (Acoustic Cover)'), 'cover');
assert.equal(v('Song (Cover ver.)'), 'cover');
assert.equal(v('Love Live! Sunshine (Love Live!)'), null);
await p.emit('settings', { live: false, remix: false, cover: false, spedUp: false });
assert.equal(v('Plastic Love (Sped Up)'), null, 'a switch off: plays');
await p.emit('settings', { spedUp: true });

// the queue: only radio songs after the current one are taken out
queue = [
  { id: 'now', title: 'Now (Sped Up)', artist: 'A', radio: true },
  { id: 'mine', title: 'Mine (Sped Up)', artist: 'A' },
  { id: 'r1', title: 'Good Song', artist: 'B', radio: true },
  { id: 'r2', title: 'Good Song (Nightcore)', artist: 'B', radio: true },
  { id: 'r3', title: 'Other [8D Audio]', artist: 'C', radio: true },
];
await p.emit('queue', { index: 0, tracks: queue });
const removes = p.calls.filter((c) => c.cap === 'queue.remove');
assert.equal(removes.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(removes[0].args.ids)), ['r2', 'r3']);
assert.deepEqual(queue.map((t) => t.id), ['now', 'mine', 'r1'], 'yours and the playing one stay');
await p.emit('queue', { index: 0, tracks: [...queue, { id: 'r2', title: 'Good Song (Nightcore)', radio: true }] });
assert.equal(p.calls.filter((c) => c.cap === 'queue.remove').length, 1, 'not asked twice');

// a radio song that starts anyway is skipped, unless you chose it
const nexts = () => p.calls.filter((c) => c.cap === 'playback.next').length;
await p.emit('track', { id: 'x', title: 'X (Sped Up)', artist: 'A', radio: true, how: 'auto' });
assert.equal(nexts(), 1);
await p.emit('track', { id: 'y', title: 'Y (Sped Up)', artist: 'A', radio: true, how: 'pick' });
assert.equal(nexts(), 1, 'picked: plays');
await p.emit('track', { id: 'z', title: 'Z (Sped Up)', artist: 'A', how: 'auto' });
assert.equal(nexts(), 1, 'from your playlist: plays');
await p.emit('track', { id: 'w', title: 'W (Sped Up)', artist: 'A', radio: true, how: 'next' });
assert.equal(nexts(), 2, 'you pressed next into a radio song: still filtered');
console.log('PASS version-filter.test.mjs');
