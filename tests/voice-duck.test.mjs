// Voice chat ducking 1.1: your own apps, timing settings, pause mode, the meter panel.   node tests/voice-duck.test.mjs
import assert from 'node:assert/strict';
import { loadPlugin } from '../sdk/mock-host.mjs';

const calls = (p, cap) => p.calls.filter((c) => c.cap === cap);
const voice = (p, v) => p.emit('audio', { levels: { 'legcord.exe': v } });

// your own apps are added to the watch list (normalised; junk dropped)
const p = await loadPlugin('voice-duck', { settings: { extra: 'ms-teams, Zoom.exe ;  slack  bad/name x' } });
await p.advance(1);
const watched = calls(p, 'audio.watch').at(-1).args.apps;
assert.ok(watched.includes('legcord.exe') && watched.includes('ms-teams.exe') && watched.includes('zoom.exe') && watched.includes('slack.exe'));
assert.ok(!watched.some((a) => a.includes('/')), 'invalid names dropped');
assert.equal(JSON.stringify(p.scope.extraApps('bad/name, ok')), '["ok.exe"]', 'a name Voltage would refuse is dropped');

// default timing: reacts after 150 ms, comes back 1 s after quiet
await voice(p, 0.2); await p.advance(100); await voice(p, 0.2);
assert.equal(calls(p, 'playback.duck').length, 0, 'not yet (100 ms)');
await p.advance(60); await voice(p, 0.2);
assert.equal(calls(p, 'playback.duck').at(-1).args.db < 0, true, 'lowered after 150 ms');
await voice(p, 0); await p.advance(900);
assert.ok(calls(p, 'playback.duck').at(-1).args.db < 0, 'still low at 0.9 s');
await p.advance(150);
assert.equal(calls(p, 'playback.duck').at(-1).args.db, 0, 'back after 1 s');

// slower settings
await p.emit('settings', { attack: 500, release: 3 });
await voice(p, 0.2); await p.advance(300); await voice(p, 0.2);
assert.equal(calls(p, 'playback.duck').at(-1).args.db, 0, 'not at 300 ms with "reacts after" 500');
await p.advance(250); await voice(p, 0.2);
assert.ok(calls(p, 'playback.duck').at(-1).args.db < 0);
await voice(p, 0); await p.advance(2900);
assert.ok(calls(p, 'playback.duck').at(-1).args.db < 0, 'still low at 2.9 s');
await p.advance(200);
assert.equal(calls(p, 'playback.duck').at(-1).args.db, 0);

// pause mode: pauses only when playing, resumes only what it paused
const q = await loadPlugin('voice-duck', { settings: { action: 'pause' } });
await q.emit('playing', true);
await voice(q, 0.2); await q.advance(200); await voice(q, 0.2);
assert.equal(calls(q, 'playback.pause').length, 1);
await q.emit('playing', false);
await voice(q, 0); await q.advance(1100);
assert.equal(calls(q, 'playback.resume').length, 1, 'resumed what it paused');
await q.emit('playing', true); // Voltage says so after the resume
// you pressed play yourself in the middle: it doesn't resume again afterwards
await voice(q, 0.2); await q.advance(200); await voice(q, 0.2);
assert.equal(calls(q, 'playback.pause').length, 2);
await q.emit('playing', false); await q.emit('playing', true); // you resumed by hand
await voice(q, 0); await q.advance(1100);
assert.equal(calls(q, 'playback.resume').length, 1, 'no second resume');
// not playing at all: no pause, no resume
await q.emit('playing', false);
await voice(q, 0.2); await q.advance(200); await voice(q, 0.2); await voice(q, 0); await q.advance(1100);
assert.equal(calls(q, 'playback.pause').length, 2);
assert.equal(calls(q, 'playback.resume').length, 1);

// the panel: a bar per app with sound, the threshold line, the state
await p.emit('panel', { open: true });
await p.emit('audio', { levels: { 'legcord.exe': 0.2, 'zoom.exe': 0.01 } });
await p.advance(250); await p.emit('audio', { levels: { 'legcord.exe': 0.2, 'zoom.exe': 0.01 } });
assert.match(p.panel.html, /legcord/); assert.match(p.panel.html, /zoom/); assert.match(p.panel.html, /class="line"/);
assert.match(p.panel.html, /class="over"/, 'legcord is over the line');
console.log('PASS voice-duck.test.mjs');
