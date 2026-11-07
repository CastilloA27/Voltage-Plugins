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

// 1.5: the areas (P12-19), each with its own switch
assert.match(file, /\[class\*="mentioned_"\]::before/, 'mention bar in the accent');
assert.match(file, /--message-mentioned-background-default:/);
assert.match(file, /--interactive-background-selected:/, 'selected channel');
assert.match(file, /channelTextArea_"\]:focus-within/, 'message box glow');
assert.doesNotMatch(file, /--status-speaking:/, 'speaking ring stays green by default');
await p.emit('settings', { areaMentions: false, speaking: 'accent' });
await p.advance(1000);
assert.doesNotMatch(file, /mentioned_/, 'mentions switched off: their rules are gone');
assert.match(file, /--status-speaking: var\(--voltage-accent\)/);
assert.match(file, /--interactive-background-selected:/, 'the other areas stay');

// the now-playing strip: off by default; a title can't break out of the CSS string
assert.doesNotMatch(file, /themed_"\]\[class\*="container_"\]::after/);
await p.emit('settings', { nowPlaying: true });
await p.emit('track', { id: 'c', title: 'Evil" } body { display: none } /* \\ \n', artist: 'X' });
await p.advance(1000);
const strip1 = /::after \{ content: "([^"]*)";/.exec(file)?.[1];
assert.ok(strip1 && strip1.startsWith('♪ Evil'), `strip text: ${strip1}`);
assert.ok(!/["\\\n]/.test(strip1), 'no quote, backslash or line break in the CSS string');
assert.equal(p.scope.cssText('a"b\\c\nd'), 'a b c d');

// P12-20 d: an unchanged block isn't written again; while a game is in front only a song change writes
let writes = 0;
const count = (fn) => async (...a) => { writes = 0; await fn(...a); return writes; };
p.calls.length = 0;
const nWrites = () => p.calls.filter((c) => c.cap === 'file.write').length;
await p.emit('settings', { nowPlaying: true }); // nothing changed
await p.advance(1000);
assert.equal(nWrites(), 0, 'unchanged: no write');
// a settings change during a game waits for the game to end
await p.emit('gaming', true);
await p.advance(1000);
const atGame = nWrites();
await p.emit('settings', { areaMembers: false });
await p.advance(1000);
assert.equal(nWrites(), atGame, 'no write for a settings change while a game is in front');
await p.emit('gaming', false);
await p.advance(1000);
assert.equal(nWrites(), atGame + 1, 'the deferred change is written when the game ends');
// a song change during a game still writes at once
await p.emit('gaming', true);
await p.advance(1000);
const atGame2 = nWrites();
await p.emit('palette', { accent: 'rgb(40 40 200)', c1: 'rgb(10 10 60)', c2: 'rgb(60 10 60)', onAccent: '#fff', idle: false });
await p.advance(1000);
assert.equal(nWrites(), atGame2 + 1, 'a song change still writes');
await p.emit('gaming', false);
await p.advance(1000);
void count;

// P12-15: Reapply writes even when nothing changed
const before = nWrites();
await p.emit('command', { id: 'reapply' });
await p.advance(1000);
assert.equal(nWrites(), before + 1);

// P12-22: with Voltage for Discord connected, the helper sets the colours live: a song change writes nothing
await p.emit('discord', { connected: true });
await p.advance(1000);
assert.match(file, /--voltage-accent: #a020f0/, 'the file keeps fixed colours (the helper overrides them live)');
const atHelper = nWrites();
await p.emit('palette', { accent: 'rgb(10 200 200)', c1: 'rgb(10 60 60)', c2: 'rgb(10 10 60)', onAccent: '#000', idle: false });
await p.emit('track', { id: 'd', title: 'Next song', artist: 'X' });
await p.advance(1000);
assert.equal(nWrites(), atHelper, 'no write per song while the helper works');
await p.emit('discord', { connected: false });
await p.advance(1000);
assert.match(file, /--voltage-accent: rgb\(10 200 200\)/, 'helper gone: the file follows the song again');

// P12-14: another client: the block moves to that file, the old file is given back without it
const files = { '%APPDATA%/legcord/quickCss.css': `${mine}\n`, '%APPDATA%/vesktop/settings/quickCss.css': '.vesktop {}\n' };
const q = await loadPlugin('legcord-theme', {
  answer: (cap, a) => {
    if (cap === 'file.read') return files[a.path] ?? '';
    if (cap === 'file.write') { files[a.path] = a.text; return null; }
    return undefined;
  },
});
await q.emit('palette', { accent: 'rgb(200 40 40)', c1: 'rgb(60 10 10)', c2: 'rgb(10 10 60)', onAccent: '#fff', idle: false });
await q.advance(1000);
assert.ok(files['%APPDATA%/legcord/quickCss.css'].includes(START));
await q.emit('settings', { client: 'vesktop' });
await q.advance(1000);
assert.equal(files['%APPDATA%/legcord/quickCss.css'], `${mine}\n`, 'Legcord file back to exactly what it was');
assert.ok(files['%APPDATA%/vesktop/settings/quickCss.css'].startsWith('.vesktop {}') && files['%APPDATA%/vesktop/settings/quickCss.css'].includes(START));
console.log('PASS legcord-theme.test.mjs');
