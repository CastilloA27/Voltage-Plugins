// Visualizer pack 1.1: follows the music's level, takes the level only while drawing, sleeps when settled, 5 styles draw.
//   node tests/visualizers.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

/** A 2D context that accepts everything and counts what was drawn. */
function fakeCanvas() {
  const ops = { n: 0 };
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'ops' ? ops : () => { ops.n++; }), set: () => true });
  return { canvas: { getContext: () => ctx, width: 0, height: 0 }, ops };
}
const st = (p) => p.scope.state();

const p = await loadPlugin('visualizers');
const c = fakeCanvas();
await p.emit('canvas', { id: 1, canvas: c.canvas, style: 'eq', width: 600, height: 40, dpr: 1 });
await p.emit('position', { pos: 30, dur: 200 });
assert.equal(st(p).listening, false, 'paused: no level wanted');
await p.emit('playing', true);
assert.equal(st(p).listening, true, 'playing with a canvas: takes the level');
assert.equal(st(p).running, true);

// loud music -> a stronger motion than quiet music (auto-gained against the loudest recent peak)
for (let i = 0; i < 40; i++) { await p.emit('level', { level: 0.6 }); await p.advance(34); }
const loud = st(p).amp;
for (let i = 0; i < 40; i++) { await p.emit('level', { level: 0.05 }); await p.advance(34); }
const quiet = st(p).amp;
assert.ok(loud > 0.9 && quiet < loud * 0.6, `follows the level: loud ${loud.toFixed(2)}, quiet ${quiet.toFixed(2)}`);

// every style draws something
for (const style of ['particles', 'ribbon', 'blocks', 'neon', 'eq']) {
  const k = fakeCanvas();
  await p.emit('canvas', { id: 2, canvas: k.canvas, style, width: 600, height: 40, dpr: 1 });
  await p.advance(100);
  assert.ok(k.ops.n > 5, `${style} draws`);
}
await p.emit('canvas-gone', { id: 2 });

// paused: lets go of the level, settles, then the loop stops
await p.emit('playing', false);
assert.equal(st(p).listening, false, 'paused: the level is released (voltage.off)');
await p.advance(4000);
assert.equal(st(p).running, false, 'settled: no more frames');
const drawn = c.ops.n;
await p.advance(5000);
assert.equal(c.ops.n, drawn, 'asleep: nothing drawn');
// an event wakes it
await p.emit('position', { pos: 90, dur: 200 });
await p.advance(100);
assert.ok(c.ops.n > drawn, 'woken by a seek');

// a game in front: no level, drawn only on change
await p.emit('playing', true);
await p.emit('gaming', true);
assert.equal(st(p).listening, false);
await p.emit('gaming', false);
assert.equal(st(p).listening, true);
// hidden window: sleeps, no level
await p.emit('visible', false);
assert.equal(st(p).listening, false);
await p.advance(200);
assert.equal(st(p).running, false);
console.log('PASS visualizers.test.mjs');
