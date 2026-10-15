# Voltage plugins

Official plugins for [Voltage](https://github.com/CastilloA27/Voltage), the YouTube Music desktop client for Windows.
Install them from inside Voltage: **Settings › Plugins › Official plugins › Browse**.

| Plugin | What it does | Needs |
|---|---|---|
| [Legcord live theme](legcord-theme) | Discord in [Legcord](https://legcord.app) takes on Voltage's look: black, the album gradient behind dark glass, accent borders and neon glow, all in the colours of the song you're playing, fading with every change. Or just the accent colour on top of your own theme. | Legcord. Reads and changes `%APPDATA%\legcord\quickCss.css` (only its own marked block; your Quick CSS stays as it is, and turning the plugin off gives the file back unchanged) |

## How plugins work

- A plugin is a folder with `plugin.json` and one script. Voltage runs the script in a sandboxed Web Worker: no access to
  the page, Voltage's internals, your accounts or the network.
- It talks to Voltage only through a small API, `voltage`:
  - `voltage.on(event, fn)` events:
    - `palette` `{accent, c1, c2, onAccent, idle}`
    - `track` `{id, title, artist, album, thumb}` or `null`
    - `playing`
    - `settings`
    - `stop` (`'disable'` or `'quit'`; you get about 1.5 s to clean up)
  - `voltage.call(capability, args)`
  - `voltage.notify(text)`
  - `voltage.log(...)`
- Capabilities are declared in `plugin.json` and shown to you before you turn a plugin on. Voltage checks every call against
  what you approved. If an update changes `plugin.json`, it has to be approved again.
  - Files: `"permissions": {"files": ["%APPDATA%/app/file.css"]}` allows `file.read`, `file.exists` and `file.write` (written
    in place) on exactly those files. Allowed roots: `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%`.
- Settings are declared too (`switch`, `choice`, `slider`), and Voltage draws them in Settings › Plugins.
- Every file in `catalog.json` carries a sha256. Voltage refuses a download that doesn't match.

## Making one

1. Copy `legcord-theme` as a starting point and change `id` (lowercase, digits, `-`; same as the folder name).
2. In Voltage: Settings › Plugins › **Install from a folder**, then turn it on. Logs go to Voltage's log
   (Settings › About › Open logs).
3. For an official plugin, add the folder here and run `node build-catalog.mjs`.
