// Streaks with the mock host (sdk/mock-host.mjs): a play counts after 30 s of real listening, it's saved, an artist heard
// long ago isn't "new" again (1.0.1 keeps old artists as hashes), and a failed save is reported once.
//   node tests/streaks.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const listen = async (p, track, secs) => {
  await p.emit('track', track);
  await p.emit('playing', true);
  for (let s = 0; s <= secs; s++) { await p.emit('position', { pos: s, dur: 200 }); await p.advance(1000); }
};

// a play counts after 30 s and is saved
{
  const p = await loadPlugin('streaks', { settings: { notify: false } });
  await listen(p, { id: 'a', title: 'Plastic Love', artist: 'Mariya Takeuchi' }, 31);
  await p.advance(30_000); // the periodic save
  const d = p.storage.data;
  assert.equal(d.plays.a, 1, 'one play counted');
  assert.ok(d.artists['mariya takeuchi'], 'artist dated');
  assert.ok(d.total >= 30);
}

// an artist first heard two years ago (now only a hash) isn't new this month
{
  const old = { days: {}, plays: {}, artists: { 'mariya takeuchi': '2024-01-05' }, hours: {}, badges: {}, total: 0 };
  const p = await loadPlugin('streaks', { settings: { notify: false }, storage: { data: old } });
  await listen(p, { id: 'z', title: 'Other', artist: 'Someone Else' }, 31);
  await p.advance(30_000); // a save compacts the old artist into `seen`
  assert.equal(p.storage.data.artists['mariya takeuchi'], undefined);
  assert.ok(p.storage.data.seen.length > 0);
  await listen(p, { id: 'b', title: 'September', artist: 'Mariya Takeuchi' }, 31);
  await p.advance(30_000);
  assert.equal(p.storage.data.artists['mariya takeuchi'], undefined, 'not dated again: known through the hash');
  assert.ok(p.storage.data.artists['someone else'], 'a really new artist is dated');
}

// a full store: one notice, not one per save
{
  const p = await loadPlugin('streaks', {
    settings: { notify: false },
    answer: (cap) => { if (cap === 'storage.set') throw new Error('plugin storage is full'); },
  });
  await listen(p, { id: 'c', title: 'x', artist: 'y' }, 31);
  await p.advance(120_000);
  assert.equal(p.notices.filter((n) => n.includes("couldn't save")).length, 1);
}
console.log('PASS streaks.test.mjs');
