// League of Legends game pack. The game process ("League of Legends.exe") only exists from loading screen to the end of
// a match; while it runs, Riot's Live Client Data API answers on https://127.0.0.1:2999 (official, documented,
// self-signed certificate). We read /liveclientdata/allgamedata every 2 s and report one state; Voltage decides what
// the music does. Built from Riot's documented payloads (tests: tools/gamesim.mjs + fixtures/), not yet tested in a
// real match.
const POLL_MS = 2000;

/** allgamedata payload -> state. Pure, so the simulator can test it. */
function leagueState(d) {
  if (!d || !Array.isArray(d.allPlayers)) return 'loading';
  const events = d.events?.Events ?? [];
  if (events.some((e) => e.EventName === 'GameEnd')) return 'match_over';
  if (!events.some((e) => e.EventName === 'GameStart') && (d.gameData?.gameTime ?? 0) < 1) return 'loading';
  // spectating / a replay (1.0.1): no active player of your own (missing, or Riot's "Spectator mode doesn't currently
  // support this feature" error), but the game is running
  const me = d.activePlayer?.riotId ?? d.activePlayer?.summonerName;
  if (!me) return 'spectating';
  const self = d.allPlayers.find((p) => (p.riotId ?? p.summonerName) === me);
  return self?.isDead ? 'dead' : 'in_match';
}
const LABELS = { loading: 'Loading', in_match: 'In the match', dead: 'Dead', spectating: 'Spectating', match_over: 'Game over', menu: 'Client' };

let last = null;
async function poll() {
  try {
    if (!(await voltage.game.running())) { last = null; return; } // Voltage gives the music back by itself
    let state;
    try {
      const r = await voltage.game.http('/liveclientdata/allgamedata');
      state = r.status === 200 ? leagueState(r.json) : 'loading'; // 404 until the match has loaded
    } catch (e) {
      state = String(e).includes('GAME_API_DOWN') ? 'loading' : null;
    }
    if (state && state !== last) {
      last = state;
      await voltage.game.report(state, LABELS[state]);
      voltage.log(`state: ${state}`);
    }
  } catch (e) {
    if (!String(e).includes('GAME_NOT_RUNNING')) voltage.log(`poll failed: ${e}`);
  }
}

setInterval(poll, POLL_MS);
poll();
self.leagueState = leagueState; // for the simulator
