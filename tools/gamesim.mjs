// Game-pack simulator (PLUGIN-PLAN G2): runs a pack's real main.js in a sandbox with a fake `voltage` API and fake
// timers, feeds it a timeline from a fixture, and checks the states it reports.
//   node tools/gamesim.mjs                 every tests/*.json
//   node tools/gamesim.mjs tests/x.json    one fixture
// Fixture: {pack, steps: [{running: bool} | {http: {status, json} | "down"} | {log: [lines]} | {wait: ms} | {poll: n}],
//           expect: [states in order]}. A step sets what the fake API answers, then the pack polls once ({poll: n}
// polls n times; {wait} advances the clock and fires due timers, then polls).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function run(file) {
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const src = fs.readFileSync(path.join(root, fx.pack, 'main.js'), 'utf8');
  let now = 0, running = false, http = 'down', pending = []; // like real life: the pack starts before the game
  const reported = [], intervals = [], timeouts = [];
  const voltage = {
    log: () => {}, notify: () => {}, on: () => {}, call: async () => null,
    game: {
      running: async () => running,
      report: async (state) => { if (!running) throw new Error('GAME_NOT_RUNNING'); reported.push(state); },
      log: async () => { if (!running) throw new Error('GAME_NOT_RUNNING'); const l = pending; pending = []; return l; },
      http: async () => {
        if (!running) throw new Error('GAME_NOT_RUNNING');
        if (http === 'down') throw new Error('GAME_API_DOWN: connection refused');
        return http;
      },
    },
  };
  const ctx = {
    voltage, console, performance: { now: () => now }, Date: { now: () => now },
    setInterval: (f) => { intervals.push(f); return intervals.length; },
    setTimeout: (f, ms) => { timeouts.push({ f, at: now + ms }); return timeouts.length; },
    clearTimeout: () => {}, clearInterval: () => {},
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: `${fx.pack}/main.js` });
  const flush = () => new Promise((r) => setImmediate(r));
  const poll = async () => { for (const f of intervals) await f(); await flush(); };
  await flush(); // the pack's own first poll at start
  for (const st of fx.steps) {
    if ('running' in st) running = st.running;
    if ('http' in st) http = st.http;
    if ('log' in st) pending.push(...st.log);
    if ('wait' in st) {
      now += st.wait;
      for (const t of timeouts.splice(0)) { if (t.at <= now) await t.f(); else timeouts.push(t); }
      await flush();
    }
    for (let i = 0; i < (st.poll ?? 1); i++) await poll();
  }
  const ok = JSON.stringify(reported) === JSON.stringify(fx.expect);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${path.basename(file)}${ok ? '' : `\n  expected ${fx.expect.join(' > ')}\n  got      ${reported.join(' > ')}`}`);
  return ok;
}

const files = process.argv[2] ? [process.argv[2]] : fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.json')).map((f) => path.join(root, 'tests', f));
let failed = 0;
for (const f of files) if (!(await run(f))) failed++;
process.exit(failed ? 1 : 0);
