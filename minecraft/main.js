// Minecraft (Java edition) game pack: reads new lines of %APPDATA%\.minecraft\logs\latest.log (Voltage hands over only
// lines written after the plugin started reading). Joining a world / server = in the match; leaving = menu; your own
// death chat line = dead for 8 s (respawning isn't logged). Built from vanilla 1.16-1.21 log lines (tests:
// tools/gamesim.mjs + fixtures/), not yet tested in a real game. Modded launchers that move the log aren't covered.
const POLL_MS = 1500, DEAD_MS = 8000;

const JOIN = /Loaded \d+ advancements|joined the game|Preparing spawn area: 100%/i;
const LOAD = /Connecting to [^,]+, \d+|Starting integrated minecraft server|Preparing start region/i;
const LEAVE = /Stopping singleplayer server|Stopping server|Disconnected from server|Lost connection|Left the game|Disconnecting from server|Stopping!/i;
const DEATH = / (was (slain|shot|killed|blown|fireballed|pummeled|squashed|struck|impaled|poked|pricked|stung|squished|frozen|burnt|doomed|knocked)|drowned|died|fell|burned|blew up|hit the ground|tried to swim|went up in flames|walked into|starved|suffocated|withered|discovered the floor|froze to death|experienced kinetic|didn't want to live)\b/;

/** One log line -> the next state. `me` = the signed-in player (from "Setting user: <name>"). Pure, for the simulator. */
function mcStep(s, line, me) {
  if (LEAVE.test(line)) return 'menu';
  if (me && line.includes('[CHAT]') && line.includes(` ${me} `) && DEATH.test(line.slice(line.indexOf(me) + me.length))) return 'dead';
  if (JOIN.test(line)) return 'in_match';
  if (LOAD.test(line)) return 'loading';
  return s;
}
const LABELS = { menu: 'Menu', loading: 'Loading a world', in_match: 'In a world', dead: 'Died' };

let state = 'menu', reported = null, me = null, deadTimer = null;
async function report(s) {
  if (s === reported) return;
  reported = s;
  try { await voltage.game.report(s, LABELS[s]); } catch (e) { if (!String(e).includes('GAME_NOT_RUNNING')) voltage.log(`${e}`); }
}

async function poll() {
  try {
    if (!(await voltage.game.running())) { state = 'menu'; reported = null; return; }
    const lines = await voltage.game.log();
    for (const l of lines) {
      const u = /Setting user: (\S+)/.exec(l);
      if (u) me = u[1];
      state = mcStep(state, ` ${l} `, me);
    }
    if (state === 'dead' && !deadTimer) {
      deadTimer = setTimeout(() => { deadTimer = null; if (state === 'dead') { state = 'in_match'; report(state); } }, DEAD_MS);
    }
    await report(state);
  } catch (e) {
    if (!String(e).includes('GAME_NOT_RUNNING')) voltage.log(`poll failed: ${e}`);
  }
}

setInterval(poll, POLL_MS);
poll();
self.mcStep = mcStep; // for the simulator
