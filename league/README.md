# League of Legends (unfinished)

A game pack that pauses (or lowers) your music while you're in a League match and brings it back when you're dead or the
game ends. It reads Riot's official Live Client Data API (`https://127.0.0.1:2999`, only while `League of Legends.exe` runs).

**State: unfinished.** It passes the simulator fixtures in `tests/league-*.json` but has **never been tested in a real match**,
so it isn't in the catalog (`"unlisted": true`).

## Install it from a folder

`game.local_http` is a tier-3 capability: Voltage only grants it to signed catalog plugins or to a folder plugin whose own
Developer mode is on.

1. Download or clone this repository.
2. Voltage: **Settings > Plugins > Install from a folder**, pick the `league` folder.
3. On the plugin's row, turn on **Developer mode for League of Legends** (it warns you: the plugin isn't signed).
4. Approve its permissions and switch it on. **Settings > Gaming** has the per-phase choices (pause / lower the volume).

## Test it without the game

```
node tools/gamesim.mjs tests/league-match.json
node tools/gamesim.mjs                      # every fixture
```

The simulator runs `main.js` with a fake `voltage` API and fake timers, feeds the Live Client Data answers from the fixture and
checks the states the pack reports (`loading`, `in_match`, `dead`, `match_over`...). Record a new fixture from a real match to
add a case.
