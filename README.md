# Voltage plugins

Official plugins for [Voltage](https://github.com/CastilloA27/Voltage), the YouTube Music desktop client for Windows.
Install them from inside Voltage: **Settings › Plugins › Official plugins › Browse**.

| Plugin | What it does | Needs |
|---|---|---|
| [Legcord live theme](legcord-theme) | Discord in [Legcord](https://legcord.app) takes on Voltage's look: black, the album gradient behind dark glass, accent borders and neon glow, all in the colours of the song you're playing, fading with every change. Or just the accent colour on top of your own theme. | Legcord. Reads and changes `%APPDATA%\legcord\quickCss.css` (only its own marked block; your Quick CSS stays as it is, and turning the plugin off gives the file back unchanged) |
| [Voice chat ducking](voice-duck) | Lowers the music while people talk in Discord, Legcord, TeamSpeak or Mumble, and brings it back a second after they stop. Level and sensitivity adjustable. | Voltage 1.4+. Sees how loud those apps are (never what they play); lowers the PC player only |
| [Visualizer pack](visualizers) | Three more progress-bar animations in the song's colours: Particles, Ribbon, Pixel blocks (Settings › Appearance › Progress animation). | Voltage 1.4+. Draws in the player |
| [Streaks & achievements](streaks) | Listening streaks and badges (night owl, on repeat, explorer, marathon…) in its own window, with a notification when you earn one. Counts from when it's installed; nothing leaves your PC. | Voltage 1.4+. Its own window |

## How plugins work

- A plugin is a folder with `plugin.json` and one script. Voltage runs the script in a sandboxed Web Worker: no access to
  the page, Voltage's internals, your accounts or the network.
- It talks to Voltage only through a small API, `voltage`:
  - `voltage.on(event, fn)` events:
    - `palette` `{accent, c1, c2, onAccent, idle}`
    - `track` `{id, title, artist, album, thumb}` or `null`
    - `playing`, `gaming` (a fullscreen game is in front: drop anything costly), `settings`
    - `background` `{style, image}` (Voltage's background and its blurred cover)
    - `position` `{pos, dur}` (once a second), `queue` `{index, tracks}`, `lyric` `{index, text}` or `null`,
      `game` `{game, state, label}` or `null` (only sent to plugins that listen for them)
    - `audio` `{levels: {exe: 0..1}}` (capability `audio.sessions`, after `voltage.audio.watch([...])`)
    - `stop` (`'disable'` or `'quit'`; you get about 1.5 s to clean up)
  - `voltage.storage.get/set/all`: a small key/value store of your own (256 KB)
  - `voltage.playback.pause/resume/next/prev/duck(db, ms)` (capability `playback.control`)
  - `voltage.panel.render(html, css)` (capability `ui.panel` + `"provides": {"panel": {"title": "…"}}`): your window, opened
    from Settings › Plugins or Ctrl+K. Plain content only: Voltage keeps an allowlist of tags/attributes (no scripts, no
    `style` attributes, no `url()`, images only as `data:`; links don't open). Logic stays in your worker: clicks on
    `data-action` elements arrive as `panel-action` `{action, value, form}`; `panel` `{open}` says when it's shown.
  - Progress-bar styles (capability `ui.canvas` + `"provides": {"waveStyles": [{"id", "label", "help"}]}`): you get
    `canvas` `{id, canvas, style, width, height, dpr}` (an OffscreenCanvas; set its size yourself), `canvas-resize`,
    `canvas-gone`; draw from `position`/`playing`/`palette`, and stop while `visible` is false or `gaming` is true.
  - `voltage.call(capability, args)`, `voltage.notify(text)`, `voltage.log(...)`
- Permissions come in three tiers. Voltage checks every call against what you approved; if an update changes
  `plugin.json`'s permissions, it has to be approved again.

  | Tier | What | Approval |
  |---|---|---|
  | 1 | events, `storage`, `notify` | none |
  | 2 | `"permissions": {"capabilities": [...]}`: `playback.control`, `audio.sessions`, `ui.canvas`, `ui.panel` | listed when you turn the plugin on |
  | 3 | files (`"permissions": {"files": ["%APPDATA%/app/file.css"]}`: `file.read`, `file.exists`, `file.write` on exactly those existing text files), later network | shown in red, and **only for plugins from this signed catalog** (or with Settings › Plugins › Developer mode on) |

  Allowed file roots: `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%`; Voltage's own data, auto-run places, credential
  stores and dot-folders are always refused.
- Settings are declared too (`switch`, `choice`, `slider`), and Voltage draws them in Settings › Plugins.
- Every file in `catalog.json` carries a sha256. Voltage refuses a download that doesn't match.

## Making one

1. Copy `voice-duck` (capabilities) or `legcord-theme` (files) as a starting point and change `id` (lowercase, digits, `-`;
   same as the folder name).
2. In Voltage: Settings › Plugins › **Install from a folder**, then turn it on. Logs go to Voltage's log
   (Settings › About › Open logs). A plugin with file access needs Developer mode for that.
3. For an official plugin, add the folder here and run `node build-catalog.mjs`.

## Catalog signature

`catalog.json` is signed with an Ed25519 key that never leaves the maintainer's PC (`catalog.json.sig`). Voltage has the
public key built in and refuses the official catalog when the signature doesn't verify, so a compromised GitHub account
alone can't ship plugin updates. `node build-catalog.mjs` signs automatically (key:
`%USERPROFILE%\.voltage-signing\catalog-ed25519.pem.dpapi`, DPAPI-encrypted for the maintainer's Windows user;
`--export-key` prints it for an offline backup; or `VOLTAGE_SIGNING_KEY`).
