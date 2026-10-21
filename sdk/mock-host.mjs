// Mock host for plugin unit tests (round 10 A2): runs a plugin's real main.js in a sandbox with a fake `voltage` object and
// fake timers, so a test can send events, move the clock and check what the plugin did. No Voltage needed.
//
//   import { loadPlugin } from '../sdk/mock-host.mjs';
//   const p = await loadPlugin('streaks', { settings: { notify: true } });
//   await p.emit('track', { id: 'a', title: 'Song', artist: 'Someone' });
//   await p.emit('playing', true);
//   await p.advance(31_000);              // timers fire; 'position' events are yours to send
//   p.calls      // [{cap, args}] every voltage.call (storage.*, playback.*, net.fetch, ...)
//   p.notices    // voltage.notify texts;  p.logs: voltage.log lines;  p.panel: last {html, css};  p.reported: game states
//   p.storage    // the plugin's key/value store;  p.now: the fake clock (starts at the real time, or the `start` option)
//
// Answers to calls: pass `answer(cap, args)` (return a value, or throw for an error); the default answers storage.* from
// p.storage, game.running from `running`, game.report into p.reported, and null for everything else.
// tools/gamesim.mjs (game packs against fixtures) is built the same way.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadPlugin(idOrDir, { settings = {}, storage = {}, running = false, answer = null, start = Date.now() } = {}) {
  const dir = fs.existsSync(idOrDir) ? idOrDir : path.join(ROOT, idOrDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  const src = fs.readFileSync(path.join(dir, manifest.main), 'utf8');
  let now = start, timerSeq = 0; // the fake clock starts at the real time (or `start`), so dates look normal
  const timers = new Map(); // id -> {f, at, every}
  const handlers = {};
  const host = {
    manifest, calls: [], notices: [], logs: [], reported: [], panel: null, themeTokens: null, lyrics: [],
    storage: structuredClone(storage), running,
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
    call,
    notify: (t) => host.notices.push(String(t)),
    log: (...a) => host.logs.push(a.map(String).join(' ')),
    storage: { get: (key) => call('storage.get', { key }), set: (key, value) => call('storage.set', { key, value }), all: () => call('storage.all', {}) },
    playback: Object.fromEntries(['pause', 'resume', 'next', 'prev'].map((k) => [k, () => call(`playback.${k}`, {})])),
    panel: { render: (html, css = '') => { host.panel = { html: String(html), css: String(css) }; } },
    theme: { set: (tokens) => { host.themeTokens = tokens; }, clear: () => { host.themeTokens = null; } },
    game: { running: () => call('game.running', {}), report: (state, label) => call('game.report', { state, label }), log: () => call('game.log.read', {}), http: (p) => call('game.http', { path: p }) },
    lyrics: { provide: (rid, result) => host.lyrics.push({ rid, result }) },
    net: { fetch: (url, o = {}) => call('net.fetch', { url, method: o.method, headers: o.headers, body: o.body }) },
    audio: { eq: (bands, preamp = 0) => call('audio.eq', { bands: bands ?? [], preamp }), watch: (apps) => call('audio.watch', { apps }), unwatch: () => call('audio.unwatch', {}) },
  };
  voltage.playback.duck = (db, ms = 300) => call('playback.duck', { db, ms });
  const add = (f, ms, every) => { const id = ++timerSeq; timers.set(id, { f, at: now + Math.max(0, ms | 0), every }); return id; };
  const ctx = {
    voltage, console, structuredClone, URL, TextEncoder, TextDecoder, Math, JSON,
    performance: { now: () => now },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    setTimeout: (f, ms) => add(f, ms, 0), setInterval: (f, ms) => add(f, ms, Math.max(1, ms | 0)),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id),
  };
  ctx.self = ctx;
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
  await host.emit('settings', settings);
  return host;
}
