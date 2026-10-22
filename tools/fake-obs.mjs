// A stand-in for OBS's obs-websocket 5 server, for testing the OBS plugin without OBS (Voltage's net.ws or anything else).
//   node tools/fake-obs.mjs [port=4455] [password]
// Speaks the parts the plugin uses: Hello / Identify (with the password challenge) / Identified, and the requests
// GetCurrentProgramScene, GetSceneItemId, SetSceneItemEnabled, SetInputSettings. Prints every request; a plain
// WebSocket server in ~80 lines (RFC 6455 text frames), no packages.
import crypto from 'node:crypto';
import http from 'node:http';

const port = Number(process.argv[2] ?? 4455), password = process.argv[3] ?? '';
const salt = 'c2FsdHNhbHQ=', challenge = crypto.randomBytes(16).toString('base64');
const b64sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
const want = password ? b64sha(b64sha(password + salt) + challenge) : null;
const state = { text: {}, items: { 'Music overlay': { id: 7, enabled: false } } };

function frame(text) {
  const p = Buffer.from(text), n = p.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : null;
  if (!head) throw new Error('too long for this test server');
  return Buffer.concat([head, p]);
}

function* frames(buf) { // client frames are masked
  let i = 0;
  while (i + 2 <= buf.length) {
    const op = buf[i] & 15; let n = buf[i + 1] & 127, o = i + 2;
    if (n === 126) { n = buf.readUInt16BE(o); o += 2; } else if (n === 127) { n = Number(buf.readBigUInt64BE(o)); o += 8; }
    const mask = buf.subarray(o, o + 4); o += 4;
    if (o + n > buf.length) return;
    const data = Buffer.from(buf.subarray(o, o + n)).map((b, k) => b ^ mask[k % 4]);
    yield { op, text: data.toString() };
    i = o + n;
  }
}

const server = http.createServer();
server.on('upgrade', (req, sock) => {
  const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (op, d) => sock.write(frame(JSON.stringify({ op, d })));
  send(0, { obsWebSocketVersion: '5.5.0', rpcVersion: 1, ...(want ? { authentication: { challenge, salt } } : {}) });
  console.log('client connected');
  sock.on('data', (buf) => {
    for (const f of frames(buf)) {
      if (f.op === 8) { console.log('client closed'); sock.end(); return; }
      if (f.op !== 1) continue;
      const m = JSON.parse(f.text);
      if (m.op === 1) {
        if (want && m.d.authentication !== want) { console.log('auth FAILED'); sock.end(Buffer.from([0x88, 0])); return; }
        console.log('identified'); send(2, { negotiatedRpcVersion: 1 });
      } else if (m.op === 6) {
        const { requestType: t, requestId, requestData: q = {} } = m.d;
        console.log('request', t, JSON.stringify(q));
        let res = {}, ok = true;
        if (t === 'GetCurrentProgramScene') res = { currentProgramSceneName: 'Gaming' };
        else if (t === 'GetSceneItemId') { const it = state.items[q.sourceName]; ok = !!it; res = ok ? { sceneItemId: it.id } : {}; }
        else if (t === 'SetSceneItemEnabled') { for (const it of Object.values(state.items)) if (it.id === q.sceneItemId) it.enabled = q.sceneItemEnabled; }
        else if (t === 'SetInputSettings') state.text[q.inputName] = q.inputSettings?.text;
        else ok = false;
        send(7, { requestType: t, requestId, requestStatus: { result: ok, code: ok ? 100 : 600 }, responseData: res });
      }
    }
  });
  sock.on('error', () => {});
});
server.listen(port, '127.0.0.1', () => console.log(`fake obs-websocket on ws://127.0.0.1:${port}${password ? ' (password)' : ''}`));
