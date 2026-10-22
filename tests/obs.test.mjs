// The OBS plugin with the mock host: logs in with the obs-websocket 5 password challenge, sets the text source, shows the
// overlay only while playing, and says so once when the password is refused.   node tests/obs.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadPlugin } from '../sdk/mock-host.mjs';

const b64sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
const p = await loadPlugin('obs', { settings: { textSource: 'Now playing', format: 'title-artist', paused: 'keep', showSource: 'Overlay' }, secrets: { password: 'hunter2' } });
await p.advance(10);
assert.equal(p.sockets.length, 1);
assert.equal(p.sockets[0].url, 'ws://127.0.0.1:4455');
const sock = p.sockets[0].sock, sent = () => p.sockets[0].sent.map((t) => JSON.parse(t));
const reply = async (m) => { await p.emit('ws', { sock, type: 'message', data: JSON.stringify(m) }); await p.advance(1); };
// Hello with a challenge -> Identify with the right answer
await reply({ op: 0, d: { rpcVersion: 1, authentication: { challenge: 'abc', salt: 'xyz' } } });
assert.equal(sent()[0].op, 1);
assert.equal(sent()[0].d.authentication, b64sha(b64sha('hunter2xyz') + 'abc'));
await p.emit('track', { id: 'v1', title: 'Plastic Love', artist: 'Mariya Takeuchi' });
await reply({ op: 2, d: { negotiatedRpcVersion: 1 } });
const answer = async () => { // answer every open request: OK, scene "Gaming", item id 7
  for (const r of sent().filter((x) => x.op === 6 && !x.answered)) {
    r.answered = true;
    const d = r.d.requestType === 'GetCurrentProgramScene' ? { currentProgramSceneName: 'Gaming' } : r.d.requestType === 'GetSceneItemId' ? { sceneItemId: 7 } : {};
    await reply({ op: 7, d: { requestId: r.d.requestId, requestStatus: { result: true }, responseData: d } });
  }
};
await answer();
const text = sent().find((x) => x.d?.requestType === 'SetInputSettings');
assert.equal(text.d.requestData.inputSettings.text, 'Plastic Love - Mariya Takeuchi');
await p.emit('playing', true);
for (let i = 0; i < 4; i++) await answer(); // scene -> item -> enable
const shows = () => sent().filter((x) => x.d?.requestType === 'SetSceneItemEnabled').map((x) => x.d.requestData.sceneItemEnabled);
assert.deepEqual(shows(), [false, true]); // hidden at login (nothing playing), shown on play
await p.emit('playing', false);
for (let i = 0; i < 4; i++) await answer();
assert.deepEqual(shows(), [false, true, false]);

// refused password: closed right after Identify -> one notice
const q = await loadPlugin('obs', { secrets: { password: 'wrong' } });
await q.advance(10);
const s2 = q.sockets[0].sock;
await q.emit('ws', { sock: s2, type: 'message', data: JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { challenge: 'c', salt: 's' } } }) });
await q.advance(1);
await q.emit('ws', { sock: s2, type: 'close', data: null });
assert.equal(q.notices.filter((n) => n.includes("didn't accept")).length, 1);
console.log('PASS obs.test.mjs');
