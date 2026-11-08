// Better covers (P12-24 I4) + Similar artists (I5).   node tests/better-covers.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const res = (o) => ({ kind: 'song', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg', ...o });
let answers = [];
const p = await loadPlugin('better-covers', {
  answer: (cap) => (cap === 'net.fetch' ? { status: 200, json: { results: answers } } : undefined),
});
const m = p.scope.matches;
// strict: same artist and title (brackets, feat., accents, a cut-off channel name, "Artist - " in the title)
assert.ok(m({ title: 'El Del Buho', artist: 'Legion RG' }, res({ trackName: 'El Del Búho', artistName: 'Legión RG & Herencia De Grandes' })));
assert.ok(m({ title: 'La Sandía', artist: 'Grupo Marca Regist' }, res({ trackName: 'La Sandía', artistName: 'Grupo Marca Registrada' })));
assert.ok(m({ title: 'Junior H - Y LLORO [Official Video]', artist: 'Junior H' }, res({ trackName: 'Y Lloro', artistName: 'Junior H' })));
assert.ok(m({ title: 'Jugaste y Sufrí ft. DannyLux', artist: 'Eslabon Armado' }, res({ trackName: 'Jugaste y Sufrí (feat. DannyLux)', artistName: 'Eslabon Armado' })));
// C12's near misses stay misses
assert.ok(!m({ title: 'Remember Summer Days', artist: 'Anri' }, res({ trackName: 'Remember Summer Days', artistName: 'YUKIKA' })), 'another artist');
assert.ok(!m({ title: 'Fantasy', artist: 'Meiko Nakahara' }, res({ trackName: 'Fantasy', artistName: 'Mariah Carey' })));
assert.ok(!m({ title: 'Midnight Pretenders', artist: 'Tomoko Aran' }, res({ trackName: 'Midnight Pretenders (Cover)', artistName: 'Annie K.' })));
assert.ok(!m({ title: 'Self Care', artist: 'Mac Miller' }, res({ trackName: 'Come Back to Earth', artistName: 'Mac Miller' })), 'another song');
assert.ok(!m({ title: 'Ab', artist: 'Short' }, res({ trackName: 'Ab', artistName: 'Shorter Name' })), 'a short name is never a prefix');
assert.ok(!m({ title: 'X', artist: 'A', album: 'One' }, res({ trackName: 'X', artistName: 'A', collectionName: 'Two' })), 'album known: must agree');

// only video-frame art is looked up; the album (not a compilation / single) wins; the offer is 600 px
answers = [res({ trackName: 'No Rain', artistName: 'Blind Melon', collectionName: 'Greatest Hits' }),
  res({ trackName: 'No Rain', artistName: 'Blind Melon', collectionName: 'Blind Melon', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/album/100x100bb.jpg' })];
await p.emit('track', { id: 'a', title: 'No Rain', artist: 'Blind Melon', thumb: 'https://lh3.googleusercontent.com/x=w544' });
assert.equal(p.calls.filter((c) => c.cap === 'net.fetch').length, 0, 'an album cover: nothing to do');
await p.emit('track', { id: 'b', title: 'No Rain', artist: 'Blind Melon', thumb: 'https://i.ytimg.com/vi/b/hqdefault.jpg' });
assert.deepEqual(JSON.parse(JSON.stringify(p.artOffers)), [{ id: 'b', url: 'https://is1-ssl.mzstatic.com/image/thumb/Music/album/600x600bb.jpg' }]);
await p.emit('track', { id: 'b', title: 'No Rain', artist: 'Blind Melon', thumb: 'https://i.ytimg.com/vi/b/hqdefault.jpg' });
assert.equal(p.calls.filter((c) => c.cap === 'net.fetch').length, 1, 'cached: asked once');
assert.equal(p.artOffers.length, 2, 'offered again from the cache');
answers = [];
await p.emit('track', { id: 'c', title: 'Unknown', artist: 'Nobody', thumb: 'https://i.ytimg.com/vi/c/hqdefault.jpg' });
assert.equal(p.artOffers.length, 2, 'no match: no offer');
console.log('PASS better-covers.test.mjs');

// Similar artists: found by alias, the artist itself left out, a click opens it in Voltage
const s = await loadPlugin('similar-artists', {
  answer: (cap, a) => {
    if (cap !== 'net.fetch') return undefined;
    if (a.url.includes('musicbrainz.org')) return { status: 200, json: { artists: [{ id: 'mb-1', score: 100, name: '竹内まりや', 'sort-name': 'Takeuchi, Mariya', aliases: [{ name: 'Mariya Takeuchi' }] }] } };
    if (a.url.includes('listenbrainz')) {
      assert.match(a.url, /artist_mbids=mb-1/);
      return { status: 200, json: [{ name: 'Mariya Takeuchi' }, { name: '山下達郎', comment: 'Japanese singer' }, { name: 'Anri' }] };
    }
    return undefined;
  },
});
await s.emit('track', { id: 'x', title: 'Plastic Love', artist: 'Mariya Takeuchi' });
assert.equal(s.calls.filter((c) => c.cap === 'net.fetch').length, 0, 'panel closed: no lookups');
await s.emit('panel', { open: true });
await s.advance(3000);
assert.match(s.panel.html, /山下達郎/);
assert.match(s.panel.html, /Anri/);
assert.doesNotMatch(s.panel.html, /data-value="Mariya Takeuchi"/, 'not the artist itself');
await s.emit('panel-action', { action: 'open', value: 'Anri' });
assert.deepEqual(JSON.parse(JSON.stringify(s.navigations)), [{ kind: 'artist', query: 'Anri' }]);
console.log('PASS similar-artists (in better-covers.test.mjs)');
