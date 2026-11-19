# Writing a Voltage plugin

A plugin is a folder with a `plugin.json` and **one** script. Voltage runs the script in a sandboxed Web Worker: it can't
see the page, Voltage's internals, your accounts or the network. It talks to Voltage only through the `voltage` object.

## The kit

Everything here lives in this repo, [CastilloA27/Voltage-Plugins](https://github.com/CastilloA27/Voltage-Plugins). Clone it,
or download only `sdk/` if that's all you need: nothing in the kit needs the Voltage app's source.

| File | What it's for |
|---|---|
| [`sdk/voltage.d.ts`](sdk/voltage.d.ts) | Types for the whole API: add `/// <reference path="../sdk/voltage.d.ts" />` to your `main.js` for completion and checks |
| [`sdk/mock-host.mjs`](sdk/mock-host.mjs) | Runs your real `main.js` in Node 18+ with a fake `voltage` and a fake clock, for unit tests ("Testing" below) |
| [`tools/gamesim.mjs`](tools/gamesim.mjs) | Game packs: replays a recorded match (`tests/*.json`) and checks the states you report |
| **Start here:** [`streaks/`](streaks) + [`tests/streaks.test.mjs`](tests/streaks.test.mjs) | A complete small plugin to copy: a panel, three settings, storage, notices, and its mock-host test |
| More examples | [`similar-artists/`](similar-artists) (a panel with clicks: `data-action`, `ui.navigate`), [`voice-duck/`](voice-duck) (capabilities, a panel, audio levels), [`legcord-theme/`](legcord-theme) (files), [`song-facts/`](song-facts) (network, a secret, slots, lyric notes), [`vu-meter/`](vu-meter) and [`aurora-sky/`](aurora-sky) (theme helpers: `ui.fx`, a canvas layer), [`league/`](league) (a game pack, with recorded matches in [`tests/`](tests)). Most plugins have a test there: `tests/<id>.test.mjs` |

Themes have their own guide: [THEMING.md](THEMING.md).

## The API promise

**Voltage 1.x never removes or changes anything in this API incompatibly.** New capabilities, events and fields are only
added. A plugin that needs something newer says so with `"minVoltage"`; older Voltages then don't offer it in the catalog
and refuse to load it with "needs Voltage X or newer", instead of failing halfway. A breaking change would be Voltage 2.0,
which isn't planned.

**Retiring something (the rule in writing).** When a better way replaces part of the API:
1. The old one is marked **deprecated**: `@deprecated` in `sdk/voltage.d.ts` with the replacement and the Voltage version,
   and a row in the table below. It **keeps working for all of Voltage 1.x**.
2. From that release Voltage writes one line per plugin per run to its log when a plugin uses it ("<plugin> uses <x>,
   deprecated since <version>: use <y>"), so authors can find it.
3. The official catalog's plugins move to the replacement in the next catalog update.
4. Removal only in a 2.0, announced in the release before it. Permissions follow the same rule: a capability is never
   narrowed in 1.x (that would make approved plugins fail).

| Deprecated | Since | Use instead |
|---|---|---|
| (nothing yet) | | |

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
- `version` and `minVoltage`: plain `major.minor.patch` numbers (compared as numbers: 1.10.0 is newer than 1.9.0).
- `permissions`: `capabilities` (the table below), `files` (exact paths, see tier 3), `hosts` (address prefixes for
  `net.fetch`, e.g. `"https://api.example.com/v1"`), `local` (`["ws://127.0.0.1:4455"]` for `net.ws`).
- `provides`:
  - `panel` `{title}`: your window (needs `ui.panel`).
  - `waveStyles` `[{id, label, help}]`: progress-bar animations (needs `ui.canvas`).
  - `themes` `[{id, name, tokens, css}]`: themes in Settings › Appearance while you run (needs `ui.theme`).
  - `commands` (1.6+) `[{"id", "label", "song": true, "panel": true}]`, at most 10: entries in Ctrl+K, and in a song's
    right-click menu with `"song"`; you get the `command` event. 1.9.0+: `"panel": true` makes Voltage open your panel.
  - `slots` (1.6.1+, needs `ui.slot`): where you draw inside Voltage's own views: `"discovery.details"` (under the song
    in Discovery), `"nowplaying.details"` (1.9.0+: the full player's Details tab, scrollable), or `"theme.<name>"` (a cell a
    theme's layout placed as `slot:<name>`). Draw with `voltage.slot.render(name, html, css)`; `''` hides it; the `slot`
    event `{name, open}` says when it's on screen.
- `game` (game packs): `{"name", "exes": ["x.exe"], "log": "%APPDATA%/...", "http": "http://127.0.0.1:PORT"}`.

### Settings

Voltage draws them in Settings › Plugins and sends them as the `settings` event: on start and on every change, **always the
whole object** (every key, with the user's value or your `default`; a `secret`'s value is never in it).

| `type` | Fields besides `key`, `label`, `default`, `help` | What the user gets / you get |
|---|---|---|
| `switch` | | a switch / `true` or `false` |
| `choice` | `options`: `[[value, label], ...]` | chips (a drop-down over 8 options) / the value. `voltage.settingOptions(key, [[value, label]])` fills the options at run time (at most 50) |
| `slider` | `min` (0), `max` (100), `step` (1), `unit` (shown after the number) | a slider / a number |
| `text` (1.6+) | `placeholder`, `max` (characters, 200) | a text field, saved when it loses focus / a string |
| `number` (1.6+) | `min`, `max`, `step`, `placeholder` | a number field; emptied, it goes back to `default` / a number |
| `color` (1.6+) | | a colour picker / `"#rrggbb"` |
| `secret` (1.6+, needs `storage.secret`) | | a password field, stored encrypted for the Windows user / nothing: read it with `voltage.secret.get(key)` |

Any setting can have `"when": {"key": "other", "is": value}` (or `"in": [values]`): it shows only while that other setting has
that value.

## Capabilities and tiers

Voltage checks every call against what the user approved. One table for every capability (the minimum Voltage it needs,
`-` = every Voltage with plugins):

| Capability | Tier | Since | What it allows |
|---|---|---|---|
| events, `storage`, `notify`, `log` | 1 | - | no approval needed |
| `playback.control` | 2 | - | pause, resume, next, previous, `duck` (lower the music) |
| `audio.sessions` | 2 | - | how loud chosen apps are (voice chat), never what they play |
| `audio.eq` | 2 | - | equalizer bands after the user's own EQ |
| `audio.level` | 2 | 1.6 | how loud Voltage's music is (a level, never the sound) |
| `storage.secret` | 2 | 1.6 | `secret` settings, encrypted |
| `ui.canvas` | 2 | - | progress-bar styles (`provides.waveStyles`) |
| `ui.panel` | 2 | - | your window (`provides.panel`) |
| `ui.theme` | 2 | - | your own themes, and adjusting the active one while you run |
| `lyrics.provider` | 2 | - | a lyrics source in the lyrics view |
| `ui.slot` | 2 | 1.6.1 | content inside Voltage's views (`provides.slots`) |
| `ui.art` | 2 | 1.6.1 | offer a cover for a song whose art is a video frame |
| `ui.navigate` | 2 | 1.6.1 | open an artist page or a search in Voltage, within 3 s of a click in your panel |
| `queue.write` | 2 | 1.6.1 | take upcoming songs out of the queue |
| `discord.css` | 2 | 1.6.1 | style Discord through Voltage for Discord |
| `ui.fx` | 2 | 1.7.1 | drive the active theme's effects, only as that theme's helper (canvas layers 1.7.2) |
| `lyrics.notes` | 2 | 1.10.0 | marks on lyric lines with your notes; you never see the lyrics |
| `files` (`permissions.files`) | 3 | - | `file.read` / `file.exists` / `file.write` on exactly the listed existing text files under `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%` |
| `net.fetch` | 3 | - | only the listed `hosts`, 60 requests a minute |
| `net.ws` | 3 | 1.6 | a WebSocket to a `local` port on this PC (e.g. OBS) |
| `game.log`, `game.local_http` | 3 | - | a game pack's log / local API, only while the game runs |

Tier 2 is listed when the user turns the plugin on. Tier 3 is shown in red and allowed **only for plugins from the signed
official catalog**, or with Settings › Plugins › Developer mode on. The approval covers `id` + `permissions` (+ `game`): an
update that changes them has to be approved again; one that only changes code, text or settings keeps running. Voltage's own
data, auto-run places, credential stores and dot-folders are always refused, and so are local debug ports and Voltage's own
ports.

## Lifecycle and events

1. Voltage starts your worker when the plugin is turned on (and at every launch), then sends, in this order, `settings`,
   `track`, `playing`, `gaming`, `theme`, `palette` and `background`.
2. `position`, `queue`, `lyric`, `game`, `visible`, `level` and `output` (1.6.1+) are sent only once you `voltage.on(...)`
   them. With 1.6.1+ you can stop them again: `voltage.off(name, handler)`; with no handler left Voltage stops sending it
   (for `level` it stops measuring). Check `if (voltage.off)` first: older Voltage doesn't have it.
3. `stop` (`'disable'` or `'quit'`): clean up within ~1.5 s, then the worker ends. Whatever you held (a duck, EQ bands, a
   game pause) is given back by Voltage anyway.
4. A plugin that crashes is restarted once after 5 s; a second crash turns it off until Voltage restarts.

Every event and what it carries is in [`sdk/voltage.d.ts`](sdk/voltage.d.ts) (`Voltage.Events`). Be cheap: stop animations and
polling while `visible` is false or `gaming` is true, and let go of `level` while you draw nothing (the Visualizer pack
shows how: it sleeps until an event wakes it).

## Panels and slots

`voltage.panel.render(html, css)` (any time; up to 200 KB of HTML, 100 KB of CSS; slots 50 KB / 20 KB) draws your window
in a shadow root, so your CSS styles only your panel and Voltage's styles don't reach in. What survives:

- **Tags:** `div span p b i strong em small h1-h4 ul ol li br hr table thead tbody tr td th img button input label select
  option textarea progress meter code pre details summary section header footer figure figcaption blockquote a`, and inline
  SVG with `svg path circle rect line polyline g`. Other tags are dropped but keep their text; `script style iframe object
  embed template` are dropped with their content.
- **Attributes:** `class title id name type value min max step checked selected placeholder disabled for rows colspan
  rowspan alt open width height aria-label data-action data-value`, and on SVG `viewBox d cx cy r x y x1 y1 x2 y2 points fill
  stroke stroke-width stroke-linecap transform opacity`. No `style` attribute (use your CSS), no `on...` handlers, no value
  with `javascript:`, `data:` or `url(`.
- `input` types: `text number range checkbox radio search`. `img` only with `src="data:image/(png|jpeg|gif|webp);base64,..."`.
  Links are shown, never followed.
- **CSS:** like a theme's: no `@import`, `@font-face` or `url()` (except inline images). Voltage's CSS variables reach into
  the panel, so `var(--accent)`, `var(--text)`, `rgb(var(--ink) / .1)` and every token in
  [`themes/theme-reference.md`](themes/theme-reference.md) follow the user's theme. Buttons and inputs get Voltage's basic
  look; yours overrides it.
- **Clicks:** an element with `data-action` sends `panel-action` `{action, value, form}` to your worker (`value` = its
  `data-value`, or an input's value; `form` = every named input, select and textarea, checkboxes as `true` / `false`). Inputs,
  selects and textareas fire on change. From a slot, the event also has `slot: <name>`.
- `panel` `{open}` says when your window is shown: render then, and stop updating it when it closes.

## Budgets

Voltage measures every plugin (Settings › Plugins shows it) and enforces limits. Over a limit, messages are dropped (a call
gets a `BUSY` error); a plugin that stays over its budget for 10 s is turned off with a notice.

| What | Limit |
|---|---|
| all messages (calls, renders, logs...) | 50 per second |
| `panel.render`, `slot.render`, `theme.set` | 10 per second each |
| `theme.vars` / `theme.state` / `theme.spawn` / `theme.sound` | 60 / 20 / 60 / 5 per second (vars are written once per frame) |
| `notify` | 3 per 10 s (200 characters) |
| `log` | 20 per second (500 characters a line) |
| `storage.set` | 5 per second; 256 KB stored in all |
| `net.fetch` | 60 per minute; answers over 5 MB are cut off |

## Packaging

One script per plugin. If you write several files, bundle them into one before publishing, for example
`npx esbuild src/index.js --bundle --format=iife --outfile=main.js`. Keep the source readable: people (and the catalog
review) read `main.js`.

## Testing

**Unit tests with the mock host** (Node 18+, nothing to install). It works from any folder: copy `sdk/mock-host.mjs` next
to your tests (or point to it in a clone of this repo) and give `loadPlugin` your plugin's folder:

```js
import assert from 'node:assert/strict';
import { loadPlugin } from './mock-host.mjs';
const p = await loadPlugin('C:/dev/my-plugin', { settings: { level: 80 }, track: { id: 'a', title: 'Song', artist: 'Someone' } });
await p.emit('playing', true);
await p.advance(31_000);                 // the fake clock: your timers fire
assert.equal(p.notices.length, 1);       // also: p.calls, p.storage, p.panel, p.slots, p.lineNotes, p.fx, p.reported
```

Like Voltage, the mock host sends `settings` (every key, with your defaults), `track`, `playing`, `gaming`, `theme`, `palette`
and `background` at start; options change what it sends (`startEvents: false` sends only `settings`). Answer `net.fetch` and
other calls with `answer(cap, args)`. What it does **not** check: permissions, budgets and the panel's HTML rules; Voltage
does, so try the plugin in the app before publishing.

- **Game packs:** record real log lines or API answers into a `tests/*.json` fixture and run `node tools/gamesim.mjs`.
- **In Voltage:** Settings › Plugins › Install from a folder, then turn it on. `voltage.log` lines go to Voltage's log
  (Settings › About › Open logs folder). A plugin with tier-3 permissions needs Developer mode there.

## Publishing in the official catalog

Add the folder here, commit it, run `node build-catalog.mjs` (it signs the catalog; see the README), commit `catalog.json` +
`catalog.json.sig`, push both commits. The catalog points downloads at the commit that holds your files and carries your
`permissions` and `minVoltage`, so users see what a plugin can do before installing it.
