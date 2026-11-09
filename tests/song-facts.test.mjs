// Song facts: strict MusicBrainz match, credits, samples, Wikipedia bio, 1 request/s, cache, lookups only with the panel open.
//   node tests/song-facts.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const MB = 'https://musicbrainz.org/ws/2';
const urls = [];
const answer = (cap, a, host) => {
  if (cap !== 'net.fetch') return undefined;
  urls.push({ url: a.url, at: host.now, ua: a.headers?.['user-agent'] });
  const u = a.url;
  if (u.startsWith(`${MB}/artist?`)) return { status: 200, json: { artists: [{ id: 'art1', score: 100, name: '竹内まりや', 'sort-name': 'Takeuchi, Mariya' }] } };
  if (u.startsWith(`${MB}/recording?`)) {
    if (!u.includes('arid%3A(art1)')) return { status: 200, json: { recordings: [] } };
    return { status: 200, json: { recordings: [
      { id: 'cover', score: 100, title: 'Plastic Love', length: 300000, 'artist-credit': [{ name: 'Some Cover Band', artist: { id: 'other' } }] }, // wrong artist
      { id: 'short', score: 100, title: 'Plastic Love', length: 250000, 'first-release-date': '1980', 'artist-credit': [{ name: '竹内まりや', artist: { id: 'art1' } }] }, // single edit: length off
      { id: 'later', score: 100, title: 'Plastic Love', length: 471000, 'first-release-date': '2019-04-22', 'artist-credit': [{ name: '竹内まりや', artist: { id: 'art1' } }] },
      { id: 'rec1', score: 98, title: 'Plastic Love', length: 470000, 'first-release-date': '1984-04-25', 'artist-credit': [{ name: '竹内まりや', artist: { id: 'art1' } }] },
    ] } };
  }
  if (u.startsWith(`${MB}/recording/rec1`)) {
    return { status: 200, json: {
      title: 'Plastic Love', 'first-release-date': '1984-04-25',
      'artist-credit': [{ name: 'Mariya Takeuchi', joinphrase: '', artist: { id: 'art1' } }],
      releases: [{ title: 'VARIETY', date: '1984-04-25' }, { title: 'Expressions', date: '2008-10-22' }],
      relations: [
        { type: 'producer', artist: { name: 'Tatsuro Yamashita' } },
        { type: 'performance', work: { id: 'work1' } },
        { type: 'samples material', direction: 'backward', recording: { title: 'x', 'artist-credit': [] } },
      ],
    } };
  }
  if (u.startsWith(`${MB}/work/work1`)) return { status: 200, json: { relations: [
    { type: 'composer', artist: { name: 'Mariya Takeuchi' } }, { type: 'lyricist', artist: { name: 'Mariya Takeuchi' } },
  ] } };
  if (u.startsWith(`${MB}/artist/art1`)) return { status: 200, json: { relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q1134489' } }] } };
  if (u.includes('Special:EntityData/Q1134489')) return { status: 200, json: { entities: { Q1134489: { sitelinks: { enwiki: { title: 'Mariya Takeuchi' } } } } } };
  if (u.includes('/page/summary/Mariya_Takeuchi')) return { status: 200, json: { extract: 'Mariya Takeuchi is a Japanese singer-songwriter.' } };
  return { status: 404, text: '' };
};
const p = await loadPlugin('song-facts', { answer });
const settle = async () => { for (let i = 0; i < 20; i++) await p.advance(600); };

// nothing is looked up while the panel is closed
await p.emit('track', { id: 'v1', title: 'Mariya Takeuchi - Plastic Love (Official Music Video)', artist: 'Mariya Takeuchi', dur: 471 });
await settle();
assert.equal(urls.length, 0, 'no requests with the panel closed');

await p.emit('panel', { open: true });
await settle();
const html = p.panel.html;
assert.match(html, /Released<\/dt><dd>1984 · <i>VARIETY<\/i>/);
assert.match(html, /Written by<\/dt><dd>Mariya Takeuchi/);
assert.match(html, /Produced by<\/dt><dd>Tatsuro Yamashita/);
assert.match(html, /Sampled in<\/dt><dd>1 other recording/);
assert.match(html, /Japanese singer-songwriter/);
assert.match(html, /CC BY-SA/);
assert.ok(urls.some((u) => u.url.includes('/recording/rec1')), 'the earliest matching recording: not the cover, the edit (length) or the 2019 reissue');
assert.ok(urls.some((u) => u.url.includes('arid%3A(art1)')), 'searched by the artist id found through the romanized name');
assert.ok(urls.every((u) => /Voltage-SongFacts/.test(u.ua)), 'identifies itself to MusicBrainz');
// at most one MusicBrainz request a second
const mb = urls.filter((u) => u.url.startsWith(MB)).map((u) => u.at);
assert.ok(mb.every((t, i) => i === 0 || t - mb[i - 1] >= 1000), `MusicBrainz spacing: ${mb.map((t, i) => (i ? t - mb[i - 1] : 0)).join(', ')}`);

// cached: the same song again makes no request
const n = urls.length;
await p.emit('track', { id: 'v2', title: 'Other', artist: 'Nobody', dur: 100 });
await settle();
assert.match(p.panel.html, /doesn't know this song/);
await p.emit('track', { id: 'v1', title: 'Mariya Takeuchi - Plastic Love (Official Music Video)', artist: 'Mariya Takeuchi', dur: 471 });
await settle();
assert.ok(urls.slice(n).every((u) => !u.url.includes('rec1')), 'cached song: no lookup');
assert.match(p.panel.html, /Japanese singer-songwriter/);

// 1.1: the Discovery slot (ui.slot) looks up while it shows, a line each, no bio; empty for an unknown song
await p.emit('panel', { open: false });
await p.emit('slot', { name: 'discovery.details', open: true });
await p.emit('track', { id: 'v1', title: 'Mariya Takeuchi - Plastic Love (Official Music Video)', artist: 'Mariya Takeuchi', dur: 471 });
await settle();
const sl = p.slots['discovery.details'].html;
assert.match(sl, /<p>Released 1984 · <i>VARIETY<\/i><\/p>/);
assert.match(sl, /<p>Produced by Tatsuro Yamashita<\/p>/);
assert.doesNotMatch(sl, /singer-songwriter/, 'no bio in the slot');
await p.emit('track', { id: 'v2', title: 'Other', artist: 'Nobody', dur: 100 });
await settle();
assert.equal(p.slots['discovery.details'].html, '', 'unknown song: the slot hides');
const m = urls.length;
await p.emit('slot', { name: 'discovery.details', open: false });
await p.emit('track', { id: 'v3', title: 'New', artist: 'Someone', dur: 100 });
await settle();
assert.equal(urls.length, m, 'no lookups with the slot and the panel closed');

// the title helper: video suffixes and "Artist - " prefixes go
assert.equal(JSON.stringify(p.scope.titles('Mariya Takeuchi - Plastic Love (Official Music Video)', 'Mariya Takeuchi')), JSON.stringify(['Mariya Takeuchi - Plastic Love', 'Plastic Love']));
console.log('PASS song-facts.test.mjs');
