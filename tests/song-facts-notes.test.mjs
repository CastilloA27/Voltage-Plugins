// Song facts 1.3: Genius's explained lines go to Voltage's lyrics (lyrics.notes) for the playing song, also with the panel
// closed, only with a token; a new song clears them; the setting turns them off.   node tests/song-facts-notes.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const G = 'https://api.genius.com';
const urls = [];
const answer = (cap, a) => {
  if (cap !== 'net.fetch') return undefined;
  urls.push(a.url);
  const u = a.url;
  if (u.startsWith(`${G}/search`)) {
    return { status: 200, json: { response: { hits: [{ type: 'song', result: { id: 7, title: 'Plastic Love', full_title: 'Plastic Love by 竹内まりや (Mariya Takeuchi)', primary_artist: { name: '竹内まりや (Mariya Takeuchi)' }, url: 'https://genius.com/x' } }] } } };
  }
  if (u.startsWith(`${G}/songs/7`)) return { status: 200, json: { response: { song: { id: 7, language: 'ja', description: { plain: '?' }, url: 'https://genius.com/x' } } } };
  if (u.startsWith(`${G}/referents`)) {
    return { status: 200, json: { response: { referents: [
      { fragment: '私のことを決して本気で愛さないで', annotations: [{ votes_total: 5, body: { plain: 'She asks not to be loved for real.' } }] },
      { fragment: 'I\'m just playing games\nI know that\'s plastic love', annotations: [{ votes_total: 9, body: { plain: 'The title line.' } }] },
      { fragment: 'no note here', annotations: [{ body: { plain: '' } }] },
    ] } } };
  }
  return { status: 404, text: '' };
};
const settle = async (p) => { for (let i = 0; i < 40; i++) { await p.advance(1200); await new Promise((r) => setTimeout(r, 0)); } };
const song = { id: 's1', title: 'Plastic Love', artist: 'Mariya Takeuchi', dur: 471 };

// with a token: notes for the playing song, the panel closed; the empty one is dropped; the source is Genius
const p = await loadPlugin('song-facts', { settings: { bio: false, wiki: false }, secrets: { geniusToken: 'test-token' }, answer });
await p.emit('track', song);
await settle(p);
assert.equal(p.lineNotes?.trackId, 's1');
assert.equal(p.lineNotes.list.length, 2, JSON.stringify(p.lineNotes));
assert.ok(p.lineNotes.list.every((n) => n.source === 'Genius' && n.text && n.note));
assert.ok(p.lineNotes.list.some((n) => n.text.includes('plastic love') && n.note === 'The title line.'), 'a two-line fragment stays whole');
assert.ok(urls.every((u) => u.startsWith(G)), 'only Genius for the notes (no MusicBrainz / Wikipedia with everything closed)');

// a new song: the old marks go at once
await p.emit('track', { id: 's2', title: 'Unknown', artist: 'Nobody', dur: 100 });
assert.equal(p.lineNotes.trackId, 's2');
assert.equal(p.lineNotes.list.length, 0);

// the setting off: back to the first song, nothing is sent
await p.emit('settings', { lineNotes: false });
await p.emit('track', song);
await settle(p);
assert.equal(p.lineNotes.list.length, 0);

// no token: no request at all
urls.length = 0;
const q = await loadPlugin('song-facts', { settings: { bio: false, wiki: false }, answer });
await q.emit('track', song);
await settle(q);
assert.equal(urls.length, 0, 'no token: nothing fetched');
assert.equal(q.lineNotes?.list.length ?? 0, 0);
console.log('PASS song-facts-notes.test.mjs');
