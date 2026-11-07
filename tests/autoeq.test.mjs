// AutoEQ 1.1: the correction applies only on the output it was picked on (round 12 P12-1).   node tests/autoeq.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const HEADSET = { kind: 'local', id: 'wasapi/{headset}', name: 'Speakers (HyperX Cloud III S Wireless)' };
const SPEAKERS = { kind: 'local', id: 'wasapi/{speakers}', name: 'Speakers (Realtek)' };
const ECHO = { kind: 'spotify', id: 'spotify:echo', name: "Andrew's Echo" };
const bands = [{ type: 'peak', f: 170, gain: -7, q: 1.06 }];
const lastEq = (p) => p.calls.filter((c) => c.cap === 'audio.eq').at(-1)?.args.bands.length ?? null;

// a profile saved by AutoEQ 1.0 (no devices): adopts the first output it sees, then follows it
const p = await loadPlugin('autoeq', { storage: { profile: { name: 'HyperX Cloud III', path: 'x', source: 'Rtings', bands, preamp: -6 } } });
await p.advance(1);
assert.equal(lastEq(p), 0, 'nothing applied before Voltage says where the music plays');
await p.emit('output', HEADSET);
assert.equal(lastEq(p), 1, 'on: the headset');
assert.deepEqual(p.storage.profile.devices, [{ id: HEADSET.id, name: HEADSET.name }], 'adopted and saved');
await p.emit('output', SPEAKERS);
assert.equal(lastEq(p), 0, 'off on the speakers');
await p.emit('output', ECHO);
assert.equal(lastEq(p), 0, 'off on a Spotify speaker');
await p.emit('output', HEADSET);
assert.equal(lastEq(p), 1, 'back on with the headset');

// the panel says why it's off, and "Use on ... too" adds the output
await p.emit('output', SPEAKERS);
await p.emit('panel', { open: true });
assert.match(p.panel.html, /Off on Speakers \(Realtek\)/);
await p.emit('panel-action', { action: 'here' });
assert.equal(lastEq(p), 1, 'on for the speakers too');
assert.equal(p.storage.profile.devices.length, 2);

// switched off in settings: off everywhere
await p.emit('settings', { on: false });
assert.equal(lastEq(p), 0);

// a new pick remembers the output it was picked on
const index = '- [HyperX Cloud III](./Rtings/over-ear/HyperX%20Cloud%20III) by Rtings on HMS II.3\n';
const peq = 'Preamp: -6.4 dB\nFilter 1: ON PK Fc 170 Hz Gain -7.0 dB Q 1.06\n';
const q = await loadPlugin('autoeq', { answer: (cap, a) => (cap === 'net.fetch' ? { status: 200, text: a.url.endsWith('INDEX.md') ? index : peq } : undefined) });
await q.emit('output', SPEAKERS);
await q.emit('panel', { open: true });
await q.emit('panel-action', { action: 'search', form: { q: 'hyperx' } });
await q.emit('panel-action', { action: 'pick', value: '0' });
await q.advance(1);
assert.deepEqual(q.storage.profile.devices, [{ id: SPEAKERS.id, name: SPEAKERS.name }]);
assert.equal(lastEq(q), 1);
await q.emit('output', HEADSET);
assert.equal(lastEq(q), 0, 'picked on the speakers: off on the headset');
console.log('PASS autoeq.test.mjs');
