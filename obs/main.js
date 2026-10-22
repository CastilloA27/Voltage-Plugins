/// <reference path="../sdk/voltage.d.ts" />
// OBS: now playing. Talks to OBS's built-in obs-websocket server (v5, OBS 28+) on this PC through Voltage's net.ws:
// sets a text source to the song, and shows one source (an overlay) only while music plays. The password is a "secret"
// setting (stored encrypted by Voltage). Reconnects every 10 s while OBS isn't running. Tested against tools/fake-obs.mjs,
// not yet against a real OBS.
const OBS = 'ws://127.0.0.1:4455';
let settings = { textSource: 'Now playing', format: 'title-artist', paused: 'keep', showSource: '' };
let ws = null, ready = false, seq = 0, retry = null, track = null, playing = false, lastText = null, lastShown = null, again = false, identifying = false, refusedNoted = false;
const pending = new Map(); // requestId -> resolve

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const sha = async (s) => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

function request(requestType, requestData = {}) {
  if (!ws || !ready) return Promise.resolve(null);
  const requestId = `v${++seq}`;
  return new Promise((res) => {
    pending.set(requestId, res);
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } })).catch(() => res(null));
    setTimeout(() => { if (pending.delete(requestId)) res(null); }, 5000);
  });
}

function textFor(t) {
  if (!t) return '';
  return settings.format === 'artist-title' ? `${t.artist} - ${t.title}` : settings.format === 'title' ? t.title : `${t.title} - ${t.artist}`;
}

/** Brings OBS in line with what's playing (only what changed is sent). */
async function sync() {
  if (!ready) return;
  const text = playing || settings.paused === 'keep' ? textFor(track) : '';
  if (settings.textSource && text !== lastText) {
    const r = await request('SetInputSettings', { inputName: settings.textSource, inputSettings: { text } });
    if (r?.requestStatus?.result) lastText = text;
    else if (r) voltage.log(`text source "${settings.textSource}": ${r.requestStatus?.comment ?? 'not found'}`);
  }
  const show = !!(playing && track);
  if (settings.showSource && show !== lastShown) {
    const scene = (await request('GetCurrentProgramScene'))?.responseData?.currentProgramSceneName;
    const id = scene && (await request('GetSceneItemId', { sceneName: scene, sourceName: settings.showSource }))?.responseData?.sceneItemId;
    if (id == null) { voltage.log(`source "${settings.showSource}" isn't in the scene "${scene ?? '?'}"`); lastShown = show; return; }
    const r = await request('SetSceneItemEnabled', { sceneName: scene, sceneItemId: id, sceneItemEnabled: show });
    if (r?.requestStatus?.result) lastShown = show;
  }
}

async function connect() {
  clearTimeout(retry);
  if (ws) return;
  try {
    ws = await voltage.net.ws(OBS);
  } catch {
    ws = null; // OBS isn't running (or its server is off): look again in 10 s
    retry = setTimeout(connect, 10000);
  }
}

voltage.on('ws', async (e) => {
  if (!ws || e.sock !== ws.sock) return;
  if (e.type === 'close' || e.type === 'error') {
    if (ready) voltage.log('OBS closed the connection');
    if (identifying && !refusedNoted) { // closed right after we logged in: the password is wrong
      refusedNoted = true;
      voltage.notify("OBS didn't accept the WebSocket password: check it in Settings > Plugins > OBS");
    }
    identifying = false;
    ws = null; ready = false; lastText = null; lastShown = null;
    for (const r of pending.values()) r(null);
    pending.clear();
    retry = setTimeout(connect, again ? 0 : 10000); // `again`: closed on purpose to log in with a new password
    again = false;
    return;
  }
  let m;
  try { m = JSON.parse(e.data); } catch { return; }
  if (m.op === 0) { // Hello: identify, with the password challenge if OBS asks for one
    const a = m.d.authentication;
    const d = { rpcVersion: 1, eventSubscriptions: 0 };
    if (a) {
      const pw = (await voltage.secret.get('password')) ?? '';
      if (!pw) voltage.notify('OBS asks for its WebSocket password: add it in Settings > Plugins > OBS');
      d.authentication = await sha((await sha(pw + a.salt)) + a.challenge);
    }
    identifying = true;
    ws.send(JSON.stringify({ op: 1, d }));
  } else if (m.op === 2) { // Identified
    ready = true; identifying = false; refusedNoted = false;
    voltage.log('connected to OBS');
    sync();
  } else if (m.op === 7) {
    pending.get(m.d.requestId)?.(m.d);
    pending.delete(m.d.requestId);
  }
});

voltage.on('settings', (s) => {
  const reconnect = ws && ready;
  settings = { ...settings, ...s };
  lastText = null; lastShown = null; // apply to the (maybe new) sources
  if (reconnect) { again = true; ws.close(); } else sync(); // a new password: log in again (close -> reconnect)
});
voltage.on('track', (t) => { track = t; sync(); });
voltage.on('playing', (p) => { playing = p; sync(); });
voltage.on('stop', async () => {
  clearTimeout(retry);
  if (ready && settings.showSource) { playing = false; await sync(); } // leave the overlay hidden
  ws?.close();
});

connect();
