# Writing a Voltage plugin

A plugin is a folder with a `plugin.json` and **one** script. Voltage runs the script in a sandboxed Web Worker: it can't
see the page, Voltage's internals, your accounts or the network. It talks to Voltage only through the `voltage` object.

| File | What it's for |
|---|---|
| [`sdk/voltage.d.ts`](sdk/voltage.d.ts) | Types for the whole API: add `/// <reference path="../sdk/voltage.d.ts" />` to your `main.js` for completion and checks |
| [`sdk/mock-host.mjs`](sdk/mock-host.mjs) | Runs your real `main.js` in Node with a fake `voltage` and a fake clock, for unit tests (example: [`tests/streaks.test.mjs`](tests/streaks.test.mjs)) |
| [`tools/gamesim.mjs`](tools/gamesim.mjs) | Game packs: replays a recorded match (`tests/*.json`) and checks the states you report |

## The API promise

**Voltage 1.x never removes or changes anything in this API incompatibly.** New capabilities, events and fields are only
added. A plugin that needs something newer says so with `"minVoltage"`; older Voltages then don't offer it in the catalog
and refuse to load it with "needs Voltage X or newer", instead of failing halfway. A breaking change would be Voltage 2.0,
which isn't planned.

## plugin.json

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "author": "you",
  "description": "One or two sentences: what it does and what it touches.",
  "main": "main.js",
  "minVoltage": "1.6.0",
  "permissions": { "capabilities": ["playback.control"], "files": [], "hosts": [] },
  "settings": [
    { "key": "level", "label": "How much", "type": "slider", "min": 0, "max": 100, "default": 50, "unit": "%" },
    { "key": "mode", "label": "Mode", "type": "choice", "options": [["a", "A"], ["b", "B"]], "default": "a" },
    { "key": "on", "label": "Do the thing", "type": "switch", "default": true, "when": { "key": "mode", "is": "a" } }
  ],
  "provides": { "panel": { "title": "My plugin" } }
}
```

- `id`: lowercase letters, digits and `-`, at most 40; the folder has the same name.
- `version` and `minVoltage`: plain `major.minor.patch` numbers.
- `provides`: `panel` (your window, needs `ui.panel`), `waveStyles` (progress-bar animations, needs `ui.canvas`), `themes`
  (needs `ui.theme`), `commands` (1.6+: `[{"id", "label", "song": true}]`, at most 10: entries in Ctrl+K, and in a song's
  right-click menu with `"song"`; you get the `command` event).
- Settings types: `switch`, `choice`, `slider`, and since 1.6 `text`, `number`, `color`, `secret` (needs `storage.secret`:
  typed by the user, stored encrypted, read with `voltage.secret.get(key)`). Voltage draws them in Settings › Plugins and
  sends them as the `settings` event on start and on every change (never a secret's value). `when` shows a setting only for
  some values of another; `voltage.settingOptions(key, [[value, label]])` fills a `choice` setting's options at run time.
- `game` (game packs): `{"name", "exes": ["x.exe"], "log": "%APPDATA%/...", "http": "http://127.0.0.1:PORT"}`.

## Permissions: three tiers

| Tier | What | Who may use it |
|---|---|---|
| 1 | events, `storage`, `notify`, `log` | every plugin, no approval |
| 2 | `playback.control`, `audio.sessions`, `audio.level` (1.6+), `storage.secret` (1.6+), `audio.eq`, `lyrics.provider`, `ui.canvas`, `ui.panel`, `ui.theme` | listed when the user turns the plugin on |
| 3 | `files` (exactly the listed existing text files under `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%`), `net.fetch` (only the listed `hosts`), `net.ws` (1.6+: a WebSocket to the `local` ports listed, e.g. `"ws://127.0.0.1:4455"` for OBS), `game.log`, `game.local_http` | shown in red; **only plugins from the signed official catalog**, or with Settings › Plugins › Developer mode on |

The approval covers `id` + `permissions` (+ `game`). An update that changes them has to be approved again; one that only
changes code, text or settings keeps running. Voltage's own data, auto-run places, credential stores and dot-folders are
always refused, and so are local debug ports and Voltage's own ports.

## Lifecycle and events

1. Voltage starts your worker when the plugin is turned on (and at every launch), then sends `settings`, `track`, `playing`,
   `gaming`, `theme`, `palette` and `background`.
2. `position`, `queue`, `lyric` and `game` are sent only once you `voltage.on(...)` them.
3. `stop` (`'disable'` or `'quit'`): clean up within ~1.5 s, then the worker ends. Whatever you held (a duck, EQ bands, a
   game pause) is given back by Voltage anyway.
4. A plugin that crashes is restarted once after 5 s; a second crash turns it off until Voltage restarts.

Be cheap: stop animations and polling while `visible` is false or `gaming` is true.

## Budgets

Voltage measures every plugin (Settings › Plugins shows it) and enforces limits. Over a limit, messages are dropped (a call
gets a `BUSY` error); a plugin that stays over its budget for 10 s is turned off with a notice.

| What | Limit |
|---|---|
| all messages (calls, renders, logs...) | 50 per second |
| `panel.render`, `theme.set` | 10 per second each |
| `notify` | 3 per 10 s |
| `log` | 20 per second |
| `storage.set` | 5 per second; 256 KB stored in all |
| `net.fetch` | 60 per minute; answers over 5 MB are cut off |

## Packaging

One script per plugin. If you write several files, bundle them into one before publishing, for example
`npx esbuild src/index.js --bundle --format=iife --outfile=main.js`. Keep the source readable: people (and the catalog
review) read `main.js`.

## Testing

- **Unit tests:** `sdk/mock-host.mjs` (send events, move the clock, check `calls`, `notices`, `storage`, `panel`, `reported`).
  Run them with `node tests/<name>.test.mjs`.
- **Game packs:** record real log lines or API answers into a `tests/*.json` fixture and run `node tools/gamesim.mjs`.
- **In Voltage:** Settings › Plugins › Install from a folder, then turn it on. `voltage.log` lines go to Voltage's log
  (Settings › About › Open logs folder). A plugin with tier-3 permissions needs Developer mode there.

## Publishing in the official catalog

Add the folder here, commit it, run `node build-catalog.mjs` (it signs the catalog; see the README), commit `catalog.json` +
`catalog.json.sig`, push both commits. The catalog points downloads at the commit that holds your files and carries your
`permissions` and `minVoltage`, so users see what a plugin can do before installing it.
