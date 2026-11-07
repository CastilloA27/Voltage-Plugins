// Legcord theme: the user's own Quick CSS is never lost (round 12 P12-16).   node tests/legcord-theme.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const START = '{} /* >>> Voltage live colours', END = '/* <<< Voltage live colours */';
const mine = '.my-rule { color: hotpink; }';
let file = '';
const p = await loadPlugin('legcord-theme', {
  answer: (cap, a) => {
    if (cap === 'file.read') return file;
    if (cap === 'file.write') { file = a.text; return null; }
    return undefined;
  },
});
const strip = p.scope.strip;

// a complete block: removed, your CSS before and after it kept
const whole = `${mine}\n\n${START} x */\n:root{--a:1}\n${END}\n.after { color: red; }`;
assert.ok(strip(whole).includes(mine) && strip(whole).includes('.after { color: red; }') && !strip(whole).includes(START));

// a cut-off block (no end marker) followed by your own CSS: nothing after it is dropped
const cut = `${START} x */\n:root{--a:1}\n${mine}\n`;
const kept = strip(cut);
assert.ok(kept.includes(mine), 'your CSS after a cut-off block is kept');
assert.ok(!kept.includes(START), 'the orphaned start marker is neutralised');

// the next writes: a fresh block is appended and later replaced, your CSS stays in between and is never swallowed
file = cut;
await p.emit('palette', { accent: 'rgb(200 40 40)', c1: 'rgb(60 10 10)', c2: 'rgb(10 10 60)', onAccent: '#fff', idle: false });
await p.emit('playing', true);
await p.emit('track', { id: 'a', title: 'A', artist: 'B' });
await p.advance(5000);
assert.ok(file.includes(mine), 'after the first write');
assert.equal(file.split(START).length - 1, 1, 'exactly one live block');
await p.emit('palette', { accent: 'rgb(40 200 40)', c1: 'rgb(10 60 10)', c2: 'rgb(10 10 60)', onAccent: '#000', idle: false });
await p.emit('track', { id: 'b', title: 'C', artist: 'D' });
await p.advance(5000);
assert.ok(file.includes(mine), 'after the second write');
assert.equal(file.split(START).length - 1, 1, 'still one live block');
console.log('PASS legcord-theme.test.mjs');
