# Theming Voltage

A Voltage theme can change **everything you see**: every colour, font, size, corner, shadow and glow; where each part of
the screen sits; how parts are drawn (a one-line player, an ASCII progress bar, a table of songs); the words on buttons and
tabs; every icon; and it can add images, fonts, UI sounds and a decorative layer over the whole window.

A theme **can't run code**. Anything that needs code (a live visualizer, a clock, a spinning dial) is a
[plugin](GUIDE.md); a theme can name a companion plugin and leave it a place to draw (see "Behaviour" below).

Reference (generated from Voltage's code, so it's always exact): [`themes/theme-reference.md`](themes/theme-reference.md)
(every token, variant, label and icon), [`themes/parts.md`](themes/parts.md) (every part you can style), and
[`themes/theme.schema.json`](themes/theme.schema.json) (autocomplete and error marks in VS Code).

## Examples

Six complete themes in [`themes/`](themes/), each a folder you can install or copy: `voltage-starter` (Voltage's own look with
every value written out: the best starting point), `terminal` (text only: pixel font, ASCII progress, renamed labels,
scanlines), `crt-green` (green phosphor, vignette, flicker, click sounds), `pastel-goth` (rounded font, round covers,
decorations in the overlay), `sidebar` (a different layout: song table in the middle, player bar along the bottom) and
`frosted-light` (follows Windows' light / dark setting). Their fonts, art and sounds are made by
[`themes/tools/make-examples.py`](themes/tools/make-examples.py) and are CC0: reuse them freely.

## Your first theme in 10 minutes

1. Make a folder, for example `C:\themes\neon-night\`, with one file, `theme.json`:

   ```json
   {
     "$schema": "https://raw.githubusercontent.com/CastilloA27/Voltage-Plugins/main/themes/theme.schema.json",
     "id": "neon-night",
     "name": "Neon night",
     "version": "1.0.0",
     "extends": "voltage",
     "tokens": {
       "color.bg": "#05010d",
       "color.text": "#f4e9ff",
       "effect.glow-size": "18px",
       "shape.radius": "20px"
     },
     "accent": { "mode": "fixed", "color": "#ff2fd1" }
   }
   ```

2. In Voltage: **Settings > Appearance > Theme**, paste the folder path in the field, press **Live**. The theme is installed
   and switched on, and from now on **every time you save a file in the folder, Voltage shows the change within a second**.
3. Change `"color.bg"`, save, watch it change. Try `"shape.roundness": "0"` (square corners everywhere).
4. Hold **Ctrl+Shift** and point at anything: Voltage shows its part name (for example `[data-part="player.button.play"]`)
   and its states. That's what you write in CSS.
5. Add a `theme.css` next to `theme.json`, and `"css": "theme.css"` in the manifest:

   ```css
   [data-part="info.title"] { letter-spacing: .08em; text-transform: uppercase; }
   [data-part="tracklist.row"][data-state~="active"] { background: rgb(var(--brand-rgb) / .18); }
   [data-part="app"][data-state~="paused"] [data-part="art"] img { filter: grayscale(1); }
   ```

6. Before sharing: `node tools/theme-check.mjs C:\themes\neon-night` (in the Voltage repo) lists anything Voltage would
   refuse or drop. Share the folder (or zip it); others install it the same way.

A theme can't hide the window buttons: if its CSS hides or covers minimize, maximize or close, Voltage switches that CSS
off and says so under the theme picker. If a theme ever makes Voltage hard to use: tray icon > **Reset look**, or start Voltage with `--safe-mode`.

## The package

```
my-theme/
  theme.json          required: id, name, version
  theme.css           optional, 512 KB at most
  assets/...          images (png, jpg, webp, gif, avif, svg), fonts (woff2, woff, ttf, otf), sounds (ogg, wav, mp3)
```

25 MB and 500 files at most. Plain file names only (letters, digits, `.`, `_`, `-`). Voltage checks every file when it
installs a theme and again when it loads one; a theme that breaks the rules isn't installed, and `theme-check` tells you why.

## theme.json

| Key | What |
|---|---|
| `id`, `name`, `version` | Required. `id`: a-z, 0-9, `-` (not a built-in theme's id) |
| `extends` | Start from another theme: a built-in (`voltage`, `synthwave`, `midnight`, `matrix`, `mono`, `contrast`) or an installed package. Everything you don't set is inherited |
| `appearance` | `dark`, `light` or `system` (follows Windows' light / dark setting, live) |
| `tokens` | Design values, see below |
| `modes` | `{"light": {tokens}, "dark": {tokens}}`: extra tokens for one appearance |
| `accent` | `{"mode": "album"}` (the cover's colour, Voltage's default) or `{"mode": "fixed", "color": "#rrggbb"}` |
| `fonts` | `[{"family": "Terminus", "src": "assets/terminus.woff2"}]`, then use the family in `font.body` etc. |
| `css` | Your stylesheet in the package |
| `layout` | Where parts go, see "Layout" |
| `parts` | Which variant each part uses, see "Variants" |
| `strings` | New words for buttons, tabs and messages |
| `icons` | Your own icons |
| `sounds` | UI sounds |
| `overlay` | `true`: a layer above the whole window for scanlines, vignettes, stickers |
| `plugin` | A companion plugin's id (offered when your theme is installed) |

Anything Voltage can't use is listed under the theme picker ("Theme report") and by `theme-check`; the rest still works.

## Tokens

Tokens are named `group.name` (`color.bg`, `shape.roundness`, `font.body`); each sets a CSS variable that Voltage's own styles
read, so one token changes every place that uses it. The full list with Voltage's own values is in
[`themes/theme-reference.md`](themes/theme-reference.md). The ones that matter most:

| Token | Does |
|---|---|
| `color.bg`, `color.text`, `color.text-dim`, `color.text-strong` | Background and text |
| `color.ink` | The colour of every hover, divider and soft overlay (white on dark themes, something dark on light ones) |
| `color.shade` | Shadows and dark overlays |
| `color.surface`, `color.border`, `effect.blur` | The glass panels |
| `shape.radius`, `shape.roundness` | Corner roundness; `shape.roundness` scales every corner (1 = Voltage's, 0 = square, 2 = twice as round) |
| `effect.glow-size`, `effect.glow-alpha` | The neon glow |
| `accent.album-mix` | How much of the cover's colour goes into the background (0-1) |
| `font.body`, `font.mono` | Fonts |

**A light theme** sets `"appearance": "light"`, a light `color.bg`, dark `color.text` / `color.text-strong`, and a dark
`color.ink` (for example `"#14101c"`).

Every colour token takes any CSS colour (`#ff9ad5`, `rgb(...)`, `hotpink`, `oklch(...)`); Voltage works out what it needs.

In your CSS you can use every variable (`var(--bg)`, `rgb(var(--ink) / .1)`, `var(--accent)` = the current accent).

## Layout

The home view is a grid. Name areas, give their sizes, and put a part in each:

```json
"layout": {
  "home": {
    "areas": ["nav main", "prog prog", "bar bar"],
    "columns": "320px 1fr",
    "rows": "1fr 48px 84px",
    "place": { "nav": "sidebar", "main": "nowplaying", "prog": "progress", "bar": "player" },
    "below": { "900px": { "areas": ["main", "bar"], "rows": "1fr 84px", "place": { "main": "tracklist", "bar": "player" } } }
  }
}
```

Parts you can place: `sidebar` (search + tabs + list), `search`, `tracklist` (tabs + list), `nowplaying`, `art`, `info`,
`player`, `progress`, `volume`, `lyrics`, `spacer`, `slot:<name>`. A part placed on its own leaves Now Playing (it never
shows twice); a part you don't place isn't shown (its keyboard shortcuts still work). `below` gives another layout for
windows up to that width. **A layout must show the song list and a way to play**, or Voltage keeps its own layout (so a
theme can't lock you out of your music). Without `nowplaying`, the `player` cell also carries the volume, Play on (the
output picker), radio and the full-screen button, so nothing is lost.

**The full player and the mini player** can be laid out the same way: `"layout": {"nowplaying": {...}, "mini": {...}}`.
Their parts: `art`, `info`, `lyrics` (full player), `progress`, `player`, `volume`, `back` / `video` (full player), `expand`
(mini, back to the full window), `spacer`, `slot:<name>`. Each must have `player`; if you don't place `back` / `expand`, a
small one floats in a corner. A theme's mini layout replaces the mini-player skin while the theme is on.

```json
"mini": { "areas": ["art meta ctl"], "columns": "56px 1fr auto", "place": { "art": "art", "meta": "info", "ctl": "player" } }
```

## Variants

Some parts can be drawn in different ways: `"parts": {"progress": {"variant": "ascii"}}`.

| Part | Variants (the first is Voltage's) |
|---|---|
| `player` | `panel`, `compact`, `text` (words instead of icons, from `strings`) |
| `progress` | `wave`, `line`, `blocks`, `ascii` (`[######------] 1:23 / 3:14`), `none` |
| `tracklist` | `rows`, `dense`, `table`, `text` (one monospace line per song) |
| `nav` | `icons`, `text` |
| `art` | `cover`, `round`, `vinyl` (round, spins while playing), `none` |
| `lyrics` | `karaoke`, `plain`, `ticker` (only the current line) |
| `titlebar` | `full`, `minimal`, `hidden` (the window buttons always stay) |

## Words and icons

`"strings": {"tab.library": "ls ~/music", "player.play": "[ play ]"}`: plain text, 60 characters at most. Every key is
in the reference. Permission prompts and other safety texts can't be changed.

`"icons": {"play": "assets/icons/play.svg", "pause": {"text": "||"}}`: an svg / png / webp from your package (drawn in
the text colour, like Voltage's own) or up to 8 characters of text. Icon names are in the reference.

## Fonts, sounds, overlay

- **Fonts:** `"fonts": [{"family": "Terminus", "src": "assets/terminus.woff2", "weight": 400}]`, then
  `"tokens": {"font.body": "Terminus, monospace"}`. Use fonts whose licence allows it (OFL fonts are a safe choice).
- **Sounds:** `"sounds": {"click": "sfx/click.ogg", "navigate": "sfx/tab.ogg"}`. Events: `click`, `hover`, `navigate`,
  `open`, `close`, `play`, `pause`, `skip`, `like`, `notify`, `error`. 1 MB and 3 seconds at most each. **Off until the
  user turns on Settings > Appearance > Theme sounds**, and always silent while gaming.
- **Overlay:** `"overlay": true` adds `[data-part="overlay"]` over the whole window; style it in your CSS
  (`background: repeating-linear-gradient(...)` for scanlines, `radial-gradient(...)` for a vignette, an image for
  stickers). It never takes clicks, and it disappears while a permission prompt is open.

## Moments: animate on what happens

For about 1.2 seconds after something happens, `<html>` carries `data-event`: `track-change`, `skip`, `previous`, `seek`,
`like`, `unlike`, `shuffle`, `queue-add`, `download-done` (a new one restarts it). Not set while gaming or with reduced motion.

```css
:root[data-event="like"] [data-part="art"] { animation: pop .6s ease; }
:root[data-event="track-change"] [data-part="info.title"] { animation: slide-in .5s ease; }
@keyframes pop { 50% { transform: scale(1.06); } }
```

## Behaviour: a companion plugin

A theme has no code. For anything that moves on its own or reacts (an ASCII visualizer for a terminal theme, a radio dial),
write a [plugin](GUIDE.md), name it in `"plugin"`, and give it a place in your layout with a cell `slot:<name>`. The plugin
lists `theme.<name>` in `provides.slots` and draws there with `voltage.slot.render('theme.<name>', html, css)`.

## CSS rules

Your CSS applies only while your theme is on. Removed by Voltage: `@import`, any `url()` that isn't a file in your package
or an inline image, `position: fixed` (use the overlay), `expression()` / bindings, and selectors that read what someone
types. **Style parts, not class names:** `[data-part="..."]` and `[data-state~="..."]` are promised not to change in
Voltage 1.x; Voltage's own class names can change in any update.

## Old themes (v1)

Themes made in the theme editor before packages (the colour / panel / font editor, shared as JSON) keep working exactly as
before.
