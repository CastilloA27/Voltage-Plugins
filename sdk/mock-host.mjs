// Mock host for plugin unit tests (round 10 A2): runs a plugin's real main.js in a sandbox with a fake `voltage` object and
// fake timers, so a test can send events, move the clock and check what the plugin did. No Voltage needed.
//
//   import { loadPlugin } from '../sdk/mock-host.mjs';
//   const p = await loadPlugin('streaks', { settings: { notify: true } });
//   await p.emit('track', { id: 'a', title: 'Song', artist: 'Someone' });
//   await p.emit('playing', true);
//   await p.advance(31_000);              // timers fire; 'position' events are yours to send
//   p.calls      // [{cap, args}] every voltage.call (storage.*, playback.*, net.fetch, ...)
//   p.lineNotes  // lyrics.notes: the last {trackId, list} a plugin sent (Voltage 1.10.0)
//   p.notices    // voltage.notify texts;  p.logs: voltage.log lines;  p.panel: last {html, css};  p.reported: game states
//   p.scope      // the plugin's globals: functions it put on `self` for tests (self.parse = parse)
//   p.sockets    // net.ws: [{sock, url, sent: [texts], open}]; send the plugin traffic with p.emit('ws', {sock, type, data})
//   p.storage    // the plugin's key/value store;  p.now: the fake clock (starts at the real time, or the `start` option)
//   p.fx         // ui.fx: {vars, states: {part: words}, sprites: [{name, opts}], sounds: [names], layers: {target: opts}}
//
// Start-up: like Voltage, the plugin gets settings, track, playing, gaming, theme, palette and background in that order
// (pass `track`, `playing`, `gaming`, `theme`, `palette`, `background` to change what it gets; `startEvents: false` sends
// only settings). loadPlugin takes a plugin id (a folder next to this sdk folder) or any folder path.
//
// Answers to calls: pass `answer(cap, args)` (return a value, or throw for an error); the default answers storage.* from
// p.storage, game.running from `running`, game.report into p.reported, and null for everything else.
// tools/gamesim.mjs (game packs against fixtures) is built the same way.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_THEME = { id: 'voltage', name: 'Voltage', tokens: { bg: '#000000', text: '#f2f2f2', textDim: '#ffffff8c', glassBg: '#0000006b',
  glassBorder: '#ffffff12', glassBlur: 26, radius: 14, glowSize: 12, glowAlpha: 40, bgStrength: 0.6, font: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  brand: '#a020f0', accentMode: 'album', accent: '#a020f0' } };
const IDLE_PALETTE = { accent: '#a020f0', c1: '#000000', c2: '#000000', onAccent: '#ffffff', idle: true };

export async function loadPlugin(idOrDir, { settings = {}, storage = {}, secrets = {}, running = false, answer = null, start = Date.now(),
  startEvents = true, track = null, playing = false, gaming = false, theme = DEFAULT_THEME, palette = IDLE_PALETTE,
  background = { style: 'gradient', image: null } } = {}) {
  const dir = fs.existsSync(path.resolve(idOrDir)) ? path.resolve(idOrDir) : path.join(ROOT, idOrDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  const src = fs.readFileSync(path.join(dir, manifest.main), 'utf8');
  let now = start, timerSeq = 0; // the fake clock starts at the real time (or `start`), so dates look normal
  const timers = new Map(); // id -> {f, at, every}
  const handlers = {};
  const host = {
    manifest, calls: [], notices: [], logs: [], reported: [], panel: null, slots: {}, themeTokens: null, lyrics: [], options: {},
    storage: structuredClone(storage), secrets: { ...secrets }, running, sockets: [],
    fx: { vars: {}, states: {}, sprites: [], sounds: [], layers: {} },
    get now() { return now; },
  };
  const defaultAnswer = (cap, args) => {
    if (cap === 'storage.get') return host.storage[args.key] ?? null;
    if (cap === 'storage.set') {
      host.storage[args.key] = structuredClone(args.value);
      if (JSON.stringify(host.storage).length > 256 * 1024) throw new Error('plugin storage is full (256 KB)');
      return null;
    }
    if (cap === 'storage.all') return structuredClone(host.storage);
    if (cap === 'secret.get') return host.secrets[args.key] ?? null;
    if (cap === 'secret.set') { if (args.value == null) delete host.secrets[args.key]; else host.secrets[args.key] = args.value; return null; }
    if (cap === 'net.ws.open') { const sock = host.sockets.length + 1; host.sockets.push({ sock, url: args.url, sent: [], open: true }); return sock; }
    if (cap === 'net.ws.send') { host.sockets[args.sock - 1]?.sent.push(args.text); return null; }
    if (cap === 'net.ws.close') { const s = host.sockets[args.sock - 1]; if (s) s.open = false; return null; }
    if (cap === 'game.running') return host.running;
    if (cap === 'game.report') { if (!host.running) throw new Error('GAME_NOT_RUNNING'); host.reported.push(args.state); return null; }
    return null;
  };
  const call = async (cap, args = {}) => {
    host.calls.push({ cap, args });
    return (answer && (await answer(cap, args, host))) ?? defaultAnswer(cap, args);
  };
  const voltage = {
    on: (name, f) => { (handlers[name] ??= []).push(f); },
    off: (name, f) => { const l = handlers[name] ?? []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); },
    call,
    notify: (t) => host.notices.push(String(t)),
    log: (...a) => host.logs.push(a.map(String).join(' ')),
    storage: { get: (key) => call('storage.get', { key }), set: (key, value) => call('storage.set', { key, value }), all: () => call('storage.all', {}) },
    playback: Object.fromEntries(['pause', 'resume', 'next', 'prev'].map((k) => [k, () => call(`playback.${k}`, {})])),
    queue: { remove: (ids) => call('queue.remove', { ids }) },
    panel: { render: (html, css = '') => { host.panel = { html: String(html), css: String(css) }; } },
    slot: { render: (name, html, css = '') => { host.slots[String(name)] = { html: String(html), css: String(css) }; } },
    theme: { set: (tokens) => { host.themeTokens = tokens; }, clear: () => { host.themeTokens = null; },
      // ui.fx (only for the active theme's helper in Voltage): recorded in p.fx; names and values as Voltage checks them
      vars: (vars) => { for (const [k, v] of Object.entries(vars ?? {})) { if (!/^[a-z0-9-]{1,24}$/.test(k)) continue; if (v === null) delete host.fx.vars[k]; else host.fx.vars[k] = v; } },
      state: (part, words) => { const w = (Array.isArray(words) ? words : []).map(String).filter((x) => /^[a-z0-9-]{1,24}$/.test(x)).slice(0, 8); if (w.length) host.fx.states[String(part)] = w; else delete host.fx.states[String(part)]; },
      spawn: (name, opts = {}) => { host.fx.sprites.push({ name: String(name), opts }); },
      sound: (name) => { host.fx.sounds.push(String(name)); },
      layer: (target, opts) => { if (opts === null) delete host.fx.layers[String(target)]; else host.fx.layers[String(target)] = opts ?? {}; } },
    game: { running: () => call('game.running', {}), report: (state, label) => call('game.report', { state, label }), log: () => call('game.log.read', {}), http: (p) => call('game.http', { path: p }) },
    lyrics: { provide: (rid, result) => host.lyrics.push({ rid, result }), refresh: () => { host.refreshes = (host.refreshes ?? 0) + 1; },
      notes: (trackId, list) => { host.lineNotes = { trackId: String(trackId ?? ''), list: Array.isArray(list) ? list : [] }; } }, // 1.10.0: the last notes sent
    net: {
      fetch: (url, o = {}) => call('net.fetch', { url, method: o.method, headers: o.headers, body: o.body }),
      ws: async (url) => {
        const sock = await call('net.ws.open', { url });
        return { sock, send: (text) => call('net.ws.send', { sock, text: String(text) }), close: () => call('net.ws.close', { sock }) };
      },
    },
    secret: { get: (key) => call('secret.get', { key }), set: (key, value) => call('secret.set', { key, value }) },
    discord: { css: (text) => { host.discordCss = String(text ?? ''); } },
    art: { offer: (id, url) => { (host.artOffers ??= []).push({ id: String(id), url: String(url) }); } },
    navigate: {
      artist: (name, channel) => { (host.navigations ??= []).push({ kind: 'artist', query: String(name), channel }); },
      search: (query) => { (host.navigations ??= []).push({ kind: 'search', query: String(query) }); },
    },
    settingOptions: (key, options) => { host.options[key] = options; },
    audio: { eq: (bands, preamp = 0) => call('audio.eq', { bands: bands ?? [], preamp }), watch: (apps) => call('audio.watch', { apps }), unwatch: () => call('audio.unwatch', {}) },
  };
  voltage.playback.duck = (db, ms = 300) => call('playback.duck', { db, ms });
  const add = (f, ms, every) => { const id = ++timerSeq; timers.set(id, { f, at: now + Math.max(0, ms | 0), every }); return id; };
  const ctx = {
    voltage, console, structuredClone, URL, TextEncoder, TextDecoder, Math, JSON, crypto: globalThis.crypto, btoa, atob,
    Blob, Response, DecompressionStream, CompressionStream, URLSearchParams, // what a worker has (e.g. to inflate a download)
    performance: { now: () => now },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    setTimeout: (f, ms) => add(f, ms, 0), setInterval: (f, ms) => add(f, ms, Math.max(1, ms | 0)),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id),
  };
  ctx.self = ctx;
  host.scope = ctx; // the plugin's globals (what it put on `self`), for unit tests of its helpers
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: `${manifest.id}/${manifest.main}` });
  const flush = () => new Promise((r) => setImmediate(r));
  /** Sends an event to the plugin's handlers and waits for them. */
  host.emit = async (name, data) => { for (const f of handlers[name] ?? []) await f(data); await flush(); };
  /** Moves the fake clock, firing due timers in order. */
  host.advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due;
      now = t.at;
      if (t.every) t.at += t.every; else timers.delete(id);
      await t.f();
      await flush();
    }
    now = end;
  };
  host.listens = (name) => !!handlers[name]?.length;
  // what Voltage sends a plugin at start (in this order); `settings` is every key with its saved value or default
  const all = Object.fromEntries((manifest.settings ?? []).filter((d) => d.type !== 'secret').map((d) => [d.key, d.default]));
  await host.emit('settings', { ...all, ...settings });
  if (startEvents) {
    await host.emit('track', track);
    await host.emit('playing', playing);
    await host.emit('gaming', gaming);
    await host.emit('theme', theme);
    await host.emit('palette', palette);
    await host.emit('background', background);
  }
  return host;
}
