"""Writes Voltage's six example theme packages (docs/theming-v2.md section 5) into themes/<id>/: python make-examples.py
Everything in them is made here: the fonts (pixelfont.py, CC0), the sounds (synthesised, CC0), the SVG art (CC0).
Re-run after changing this file; the folders are what the catalog and THEMING.md point to."""
import json, math, random, shutil, struct, sys, wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
sys.path.insert(0, str(HERE))
import pixelfont  # noqa: E402


def write(pkg, manifest, css=None, files=None):
    d = OUT / pkg
    if d.exists():
        shutil.rmtree(d)
    (d / 'assets').mkdir(parents=True)
    if css:
        manifest['css'] = 'theme.css'
        (d / 'theme.css').write_text(css.strip() + '\n', encoding='utf-8')
    for rel, data in (files or {}).items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data) if isinstance(data, bytes) else p.write_text(data, encoding='utf-8')
    m = {'$schema': 'https://raw.githubusercontent.com/CastilloA27/Voltage-Plugins/main/themes/theme.schema.json', **manifest}
    (d / 'theme.json').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    if not any((d / 'assets').iterdir()):
        (d / 'assets').rmdir()
    print('wrote', d.name)


def font(family, round_=False):
    tmp = OUT / f'.{family}.ttf'
    pixelfont.build(str(tmp), family, round_)
    b = tmp.read_bytes()
    tmp.unlink()
    return b


def tone(kind):
    """Short UI sounds (22.05 kHz mono 16-bit wav), synthesised."""
    sr, out = 22050, []
    rnd = random.Random(7)
    if kind == 'tick':      # a relay-like click: a burst of noise with a fast decay
        n = int(sr * 0.035)
        out = [rnd.uniform(-1, 1) * math.exp(-i / (sr * 0.004)) * 0.6 for i in range(n)]
    elif kind == 'blip':    # a short square-ish beep
        n = int(sr * 0.06)
        out = [(1 if math.sin(2 * math.pi * 1320 * i / sr) > 0 else -1) * 0.18 * math.exp(-i / (sr * 0.02)) for i in range(n)]
    elif kind == 'hum':     # a low two-note chirp for navigation
        n = int(sr * 0.09)
        out = [math.sin(2 * math.pi * (440 if i < n / 2 else 660) * i / sr) * 0.3 * math.exp(-i / (sr * 0.05)) for i in range(n)]
    elif kind == 'chime':   # a soft bell
        n = int(sr * 0.25)
        out = [(math.sin(2 * math.pi * 1046 * i / sr) + 0.4 * math.sin(2 * math.pi * 1568 * i / sr)) * 0.22 * math.exp(-i / (sr * 0.07)) for i in range(n)]
    elif kind == 'bell':    # the slot bell: bright, ringing
        n = int(sr * 0.6)
        out = [(math.sin(2 * math.pi * 1760 * i / sr) + 0.5 * math.sin(2 * math.pi * 2637 * i / sr) + 0.3 * math.sin(2 * math.pi * 3520 * i / sr)) * 0.18 * math.exp(-i / (sr * 0.18)) for i in range(n)]
    elif kind == 'coin':    # a coin chime: two quick high notes
        n = int(sr * 0.35)
        out = [math.sin(2 * math.pi * (1975 if i < sr * 0.08 else 2637) * i / sr) * 0.22 * math.exp(-(i % int(sr * 0.08) if i < sr * 0.08 else i - sr * 0.08) / (sr * 0.09)) for i in range(n)]
    elif kind == 'reel':    # reels: a fast run of ticks slowing down
        n = int(sr * 0.5); t, out = 0.0, [0.0] * n
        gap = 0.018
        while t < 0.48:
            k0 = int(t * sr)
            for i in range(k0, min(n, k0 + int(sr * 0.006))): out[i] += rnd.uniform(-1, 1) * 0.35 * math.exp(-(i - k0) / (sr * 0.0015))
            t += gap; gap *= 1.12
    import io
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32000)) for v in out))
    return buf.getvalue()


FONTS = HERE / 'fonts'  # OFL fonts from github.com/google/fonts, each with its OFL.txt (R14-8)
CC0 = 'Made for Voltage. CC0 1.0: public domain (https://creativecommons.org/publicdomain/zero/1.0/).\n'
ofl = lambda name, f: {f'assets/{name}/{f}': (FONTS / name / f).read_bytes(), f'assets/{name}/OFL.txt': (FONTS / name / 'OFL.txt').read_bytes()}

SVG = lambda body, vb='0 0 64 64': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>\n'

# ── 1. voltage: Voltage's own look, every value written out (the default is just a theme; a starting point to copy) ──
ref = (OUT / 'theme-reference.md').read_text(encoding='utf-8')
tokens = {}
for line in ref.splitlines():
    cells = [c.strip() for c in line.split('|')]
    if len(cells) > 5 and cells[1].startswith('`') and cells[4].startswith('`') and '.' in cells[1]:
        tokens[cells[1].strip('`')] = cells[4].strip('`')
tokens = {k: ('#%02x%02x%02x' % tuple(map(int, v.split())) if all(x.isdigit() for x in v.split()) and len(v.split()) == 3 else v)
          for k, v in tokens.items() if k not in ('color.brand-rgb', 'color.warn-rgb')}  # plain colours (R14-1)
tokens.update({'effect.blur': '26px', 'effect.glow-size': '12px', 'effect.glow-alpha': '40%', 'accent.album-mix': '0.6', 'shape.radius': '14px',
               'font.body': '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'})
write('voltage-starter', {'id': 'voltage-starter', 'name': 'Voltage (starter)', 'version': '1.0.0', 'author': 'Voltage',
      'description': "Voltage's own look with every value written out: copy this folder to start a theme.",
      'appearance': 'dark', 'tokens': tokens, 'accent': {'mode': 'album'}})

# ── 2. terminal ──
write('terminal', {
    'id': 'terminal', 'name': 'Terminal', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'A text-only UI: a pixel font, square corners, no glass or glow, ASCII progress, command-style labels.',
    'fonts': [{'family': 'Volt Pixel', 'src': 'assets/volt-pixel.ttf'}],
    'tokens': {'color.bg': '#0c0c0c', 'color.text': '#d0d0d0', 'color.text-dim': '#8a8a8a', 'color.text-strong': '#ffffff',
               'color.text-soft': '#e0e0e0', 'color.text-muted': '#b0b0b0', 'color.surface': '#0c0c0c', 'color.border': '#3a3a3a',
               'color.brand': '#5fd7ff', 'color.on-accent': '#0c0c0c', 'color.knob': '#d0d0d0',
               'color.select-bg': '#1e3a44', 'surface.menu': '#0c0c0c', 'surface.pop': '#101010', 'surface.tip': '#0c0c0c',
               'effect.blur': '0px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0', 'shape.radius': '0px', 'shape.roundness': '0',
               'font.body': '"Cascadia Mono", Consolas, monospace', 'font.mono': '"Cascadia Mono", Consolas, monospace'},
    'accent': {'mode': 'fixed', 'color': '#5fd7ff'},
    'parts': {'nav': {'variant': 'text'}, 'tracklist': {'variant': 'text'}, 'progress': {'variant': 'ascii'}, 'player': {'variant': 'text'}, 'art': {'variant': 'none'}},
    'strings': {'brand': 'voltage@pc:~$', 'nav.settings': 'config', 'nav.explore': 'explore', 'nav.stats': 'stats', 'nav.mini': 'mini',
                'tab.search': 'grep', 'tab.library': 'ls ~/music', 'tab.queue': 'cat queue', 'search.placeholder': 'search --all  (ctrl+f)',
                'empty.search': 'usage: type a song, artist or album, press enter', 'empty.queue': 'queue: empty. play something.',
                'search.busy': 'searching...', 'player.prev': '[prev]', 'player.play': '[play]', 'player.next': '[next]',
                'nowplaying.idle': 'idle: nothing playing'},
    'icons': {'min': {'text': '_'}, 'max': {'text': '[ ]'}, 'close': {'text': 'x'}, 'play': {'text': '>'}, 'pause': {'text': '||'},
              'next': {'text': '>>'}, 'prev': {'text': '<<'}, 'heart': {'text': '<3'}, 'search': {'text': '/'}},
    'layout': {
        # tmux: the list in the left pane, now playing and the lyrics stacked on the right, a status bar along the bottom
        'home': {'areas': ['list info', 'list lyr', 'prog prog', 'bar bar'], 'columns': '1fr 1fr', 'rows': 'auto minmax(0, 1fr) 32px 52px',
                 'place': {'list': 'sidebar', 'info': 'info', 'lyr': 'lyrics', 'prog': 'progress', 'bar': 'player'},
                 'resizable': ['list'],
                 'below': {'900px': {'areas': ['list', 'info', 'prog', 'bar'], 'columns': '1fr', 'rows': 'minmax(0, 1fr) auto 32px 52px',
                                     'place': {'list': 'sidebar', 'info': 'info', 'prog': 'progress', 'bar': 'player'}}}},
        'nowplaying': {'areas': ['back info video', 'lyr lyr lyr', 'prog prog prog', 'ctl ctl vol'], 'columns': '56px 1fr 56px',
                       'rows': 'auto minmax(0, 1fr) 32px 64px',
                       'place': {'back': 'back', 'info': 'info', 'video': 'video', 'lyr': 'lyrics', 'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}},
    'overlay': True,
}, css='''
[data-part="titlebar.brand"], [data-part="info.title"] { font-family: "Volt Pixel", monospace; letter-spacing: .04em; }
[data-part="titlebar.brand"] { font-size: 16px; color: var(--accent); text-shadow: none; }
[data-part="titlebar.brand"]::after { content: "_"; margin-left: 2px; animation: term-blink 1.06s steps(1) infinite; }
@keyframes term-blink { 50% { opacity: 0; } }
[data-part="info.title"] { font-size: 24px; }
[data-part="tracklist.row"][data-state~="active"] { background: rgb(95 215 255 / .14); }
[data-part="tracklist.row"][data-state~="active"] [data-part="tracklist.row.title"]::before { content: "> "; color: var(--accent); }
[data-part="overlay"] { background: repeating-linear-gradient(0deg, rgb(0 0 0 / .18) 0 1px, transparent 1px 3px); }
/* tmux panes: thin borders, a title on each, a status bar */
.lay-area { border: 1px solid #3a3a3a !important; border-radius: 0 !important; position: relative; padding-top: 22px; }
.lay-area::before { position: absolute; top: 3px; left: 8px; font: 12px "Cascadia Mono", Consolas, monospace; color: #8a8a8a; }
.lay-sidebar::before { content: "[0] ls ~/music"; }
.lay-info::before, .lay-view-nowplaying [data-cell="info"]::before { content: "[1] now-playing"; }
.lay-lyrics::before, .lay-view-nowplaying [data-cell="lyrics"]::before { content: "[2] less lyrics.txt"; }
.lay-progress, .lay-player, .lay-volume { padding-top: 0; }
.lay-player, .lay-view-nowplaying [data-cell="player"] { background-color: #1e3a44 !important; border-color: #1e3a44 !important; }
.lay-info, .lay-view-nowplaying [data-cell="info"] { text-align: left; padding-left: 12px; }
.lay-lyrics .lyrics, .lay-view-nowplaying [data-cell="lyrics"] .lyrics { width: 100% !important; height: 100% !important; padding: 20% 12px !important; text-align: left; }
.lay-lyrics .lyrics p.on, .lay-view-nowplaying [data-cell="lyrics"] .lyrics p.on { transform-origin: left center; } /* the sung line grows from its left edge */
.lay-lyrics [data-part="lyrics.line"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"] { font: 14px/1.6 "Cascadia Mono", Consolas, monospace; }
.lay-lyrics [data-part="lyrics.line"][data-state~="active"]::before, .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"][data-state~="active"]::before { content: "> "; color: var(--accent); }
''', files={'assets/volt-pixel.ttf': font('Volt Pixel'), 'assets/LICENSE.txt': CC0})

# ── 3. crt-green: an original green-phosphor terminal (a vault-computer feel, nothing copied) ──
write('crt-green', {
    'id': 'crt-green', 'name': 'CRT green', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'fonts': [{'family': 'Volt Pixel', 'src': 'assets/volt-pixel.ttf'}],
    'description': 'Green phosphor on a curved tube: vignette, scanlines, a faint flicker, terse tab names and relay clicks.',
    'tokens': {'color.bg': '#020f05', 'color.text': '#5dff7a', 'color.text-dim': '#2fa648', 'color.text-strong': '#a8ffb6',
               'color.text-soft': '#7dff94', 'color.text-muted': '#49d964', 'color.surface': '#03170a', 'color.border': '#1f6b30',
               'color.brand': '#5dff7a', 'color.on-accent': '#020f05', 'color.knob': '#5dff7a',
               'color.ink': '#5dff7a', 'color.select-bg': '#0b3a17', 'color.focus': '#a8ffb6',
               'surface.menu': '#031409', 'surface.pop': '#03180a', 'surface.tip': '#031409',
               'effect.blur': '0px', 'effect.glow-size': '8px', 'effect.glow-alpha': '45%', 'accent.album-mix': '0', 'shape.radius': '0px', 'shape.roundness': '0',
               'font.mono': '"Volt Pixel", "Cascadia Mono", monospace', 'font.body': '"Volt Pixel", "Cascadia Mono", monospace'},
    'accent': {'mode': 'fixed', 'color': '#5dff7a'},
    'parts': {'nav': {'variant': 'text'}, 'tracklist': {'variant': 'dense'}, 'progress': {'variant': 'blocks'}, 'player': {'variant': 'text'}, 'art': {'variant': 'cover'}},
    'strings': {'brand': 'VOLT-OS 1.0', 'nav.settings': 'SYS', 'nav.explore': 'MAP', 'nav.stats': 'STAT', 'nav.mini': 'MINI',
                'tab.search': 'SCAN', 'tab.library': 'DATA', 'tab.queue': 'RADIO', 'search.placeholder': 'ENTER QUERY',
                'empty.search': 'NO SIGNAL. ENTER A QUERY.', 'empty.queue': 'RADIO: NO STATIONS QUEUED',
                'search.busy': 'SCANNING...', 'player.prev': '<PREV', 'player.play': 'PLAY', 'player.next': 'NEXT>', 'nowplaying.idle': 'STANDBY'},
    'sounds': {'click': 'assets/tick.wav', 'navigate': 'assets/hum.wav', 'play': 'assets/blip.wav', 'pause': 'assets/blip.wav', 'error': 'assets/hum.wav'},
    'layout': {
        # a teletext page: an inverted header with the song, the list on the left, the picture and the lyrics on the right
        'home': {'areas': ['info info', 'list art', 'list lyr', 'prog prog', 'bar bar'], 'columns': '1fr minmax(240px, 34%)',
                 'rows': 'auto minmax(0, 1fr) minmax(0, 1fr) 36px 60px',
                 'place': {'info': 'info', 'list': 'sidebar', 'art': 'art', 'lyr': 'lyrics', 'prog': 'progress', 'bar': 'player'},
                 'resizable': ['list'],
                 'below': {'900px': {'areas': ['info', 'list', 'prog', 'bar'], 'columns': '1fr', 'rows': 'auto minmax(0, 1fr) 36px 60px',
                                     'place': {'info': 'info', 'list': 'sidebar', 'prog': 'progress', 'bar': 'player'}}}},
        'nowplaying': {'areas': ['back info info video', 'art art lyr lyr', 'prog prog prog prog', 'ctl ctl vol vol'],
                       'columns': '56px 1fr 1fr 56px', 'rows': 'auto minmax(0, 1fr) 40px 80px',
                       'place': {'back': 'back', 'info': 'info', 'video': 'video', 'art': 'art', 'lyr': 'lyrics',
                                 'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}},
    'overlay': True,
}, css='''

[data-part="app"] { text-shadow: 0 0 4px rgb(93 255 122 / .55); }
[data-part="art"] img { filter: grayscale(1) sepia(1) hue-rotate(70deg) saturate(3) brightness(.8) contrast(1.2); }
[data-part="overlay"] {
  background:
    radial-gradient(ellipse at center, transparent 58%, rgb(0 0 0 / .55) 100%),
    repeating-linear-gradient(0deg, rgb(0 0 0 / .28) 0 1px, transparent 1px 3px);
  animation: crt-flicker 4.5s infinite;
}
@keyframes crt-flicker { 0%, 100% { opacity: 1; } 47% { opacity: .96; } 48% { opacity: .9; } 49% { opacity: .97; } }
@media (prefers-reduced-motion: reduce) { [data-part="overlay"] { animation: none; } }

/* teletext: the header bar inverted, the cells as plain screen areas */
.lay-area { border-radius: 0 !important; border-color: #1f6b30 !important; }
.lay-area.lay-info, .lay-view-nowplaying .lay-area[data-cell="info"] { background-color: #5dff7a !important; border-color: #5dff7a !important; text-align: left; padding: 6px 14px; }
.lay-info *, .lay-view-nowplaying [data-cell="info"] * { color: #020f05 !important; text-shadow: none !important; }
.lay-info .btn, .lay-view-nowplaying [data-cell="info"] .btn { border-color: #020f05 !important; background-color: transparent !important; }
.lay-art, .lay-view-nowplaying [data-cell="art"] { display: grid; place-items: center; min-height: 0; padding: 12px; overflow: hidden; }
.lay-art .art-part, .lay-view-nowplaying [data-cell="art"] .art-part { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; width: 100%; height: 100%; min-height: 0; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { width: auto !important; height: auto !important; max-width: 100% !important; max-height: 100% !important; aspect-ratio: 1; object-fit: contain; }
.lay-lyrics .lyrics, .lay-view-nowplaying [data-cell="lyrics"] .lyrics { width: 100% !important; height: 100% !important; padding: 30% 10px !important; text-align: left; }
.lay-lyrics .lyrics p.on, .lay-view-nowplaying [data-cell="lyrics"] .lyrics p.on { transform-origin: left center; } /* the sung line grows from its left edge */
.lay-lyrics [data-part="lyrics.line"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"] { text-transform: uppercase; letter-spacing: .04em; font-size: 14px; }
''', files={'assets/volt-pixel.ttf': font('Volt Pixel'), 'assets/LICENSE.txt': CC0, 'assets/tick.wav': tone('tick'), 'assets/blip.wav': tone('blip'), 'assets/hum.wav': tone('hum')})

# ── 4. pastel-goth: pink / lilac on black, a rounded font, little bats, stars and bows (original art) ──
bat = SVG('<path fill="#ff9ad5" d="M32 22c2-4 4-6 4-6l1 6c4-1 8 0 10 3 3-3 8-4 13-2-5 2-7 7-7 12-4-3-9-3-12 0-1-3-4-5-9-5s-8 2-9 5c-3-3-8-3-12 0 0-5-2-10-7-12 5-2 10-1 13 2 2-3 6-4 10-3l1-6s2 2 4 6z"/><circle cx="29" cy="29" r="1.6" fill="#1a0b1d"/><circle cx="35" cy="29" r="1.6" fill="#1a0b1d"/>')
star = SVG('<path fill="#d9b3ff" d="M32 6l6 18 18 2-14 11 5 19-15-10-15 10 5-19L8 26l18-2z"/>')
bow = SVG('<path fill="#ff9ad5" d="M32 30c-6-8-18-14-22-10s2 18 10 18c5 0 9-4 12-8zm0 0c6-8 18-14 22-10s-2 18-10 18c-5 0-9-4-12-8z"/><circle cx="32" cy="31" r="5" fill="#ffc7e8"/>')
skull = SVG('<path fill="#f3e6ff" d="M32 8c-12 0-20 8-20 19 0 6 3 10 7 13v7c0 2 2 3 4 3h18c2 0 4-1 4-3v-7c4-3 7-7 7-13 0-11-8-19-20-19z"/><circle cx="24" cy="28" r="5" fill="#2a1430"/><circle cx="40" cy="28" r="5" fill="#2a1430"/><path fill="#2a1430" d="M30 37h4l-2 4z"/><path fill="#ff9ad5" d="M20 10c-4-5-11-4-11 1s7 6 11 2zm0 0c3 2 6 1 6-1"/>')
write('pastel-goth', {
    'id': 'pastel-goth', 'name': 'Pastel goth', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'Pink and lilac on black, a rounded font, round covers, little bats, stars and bows around the window.',
    'fonts': [{'family': 'Fredoka', 'src': 'assets/fredoka/Fredoka.ttf', 'weight': '300 700'}],
    'tokens': {'color.bg': '#120914', 'color.text': '#ffe6f4', 'color.text-dim': '#d8a9cc', 'color.text-strong': '#fff4fb',
               'color.text-soft': '#ffd9ee', 'color.text-muted': '#e9bfe0', 'color.surface': 'rgba(42, 16, 48, .55)', 'color.border': 'rgba(255, 154, 213, .22)',
               'color.brand': '#ff9ad5', 'color.on-accent': '#2a0f2a', 'color.knob': '#ffc7e8',
               'color.select-bg': '#3a1840', 'surface.menu': '#1e0c22', 'surface.pop': '#220e26', 'surface.tip': '#1e0c22',
               'effect.blur': '18px', 'effect.glow-size': '16px', 'effect.glow-alpha': '45%', 'accent.album-mix': '0.35', 'shape.radius': '22px', 'shape.roundness': '1.6'},
    'accent': {'mode': 'fixed', 'color': '#ff9ad5'},
    'parts': {'art': {'variant': 'round'}, 'progress': {'variant': 'line'}},
    'strings': {'empty.queue': 'nothing queued yet... play something cute', 'nowplaying.idle': 'shhh, nothing playing', 'empty.search': 'search for something spooky (or sweet)'},
    'icons': {'heart': 'assets/bow.svg'},
    'layout': {
        # a locket: the round cover large on the left, the song and the controls beside it, the list across the bottom
        'home': {'areas': ['art info info', 'art bar vol', 'art prog prog', 'list list list'], 'columns': 'minmax(220px, 38%) 1fr 270px',
                 'rows': 'minmax(0, 1fr) 72px 36px minmax(0, 1.2fr)',
                 'place': {'art': 'art', 'info': 'info', 'bar': 'player', 'vol': 'volume', 'prog': 'progress', 'list': 'sidebar'},
                 'below': {'800px': {'areas': ['info', 'bar', 'prog', 'list'], 'columns': '1fr', 'rows': 'auto 72px 36px minmax(0, 1fr)',
                                     'place': {'info': 'info', 'bar': 'player', 'prog': 'progress', 'list': 'sidebar'}}}},
        'nowplaying': {'areas': ['back . video', '. art .', '. info .', 'prog prog prog', 'ctl ctl vol'], 'columns': '1fr minmax(0, 440px) 1fr',
                       'rows': 'auto minmax(0, 1fr) auto 36px 88px',
                       'place': {'back': 'back', 'video': 'video', 'art': 'art', 'info': 'info', 'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}},
    'overlay': True,
}, css='''
[data-part="titlebar.brand"], [data-part="info.title"] { font-family: "Fredoka", "Segoe UI", sans-serif; font-weight: 600; letter-spacing: .02em; }
[data-part="titlebar.brand"] { font-size: 16px; color: #ff9ad5; text-shadow: 0 0 12px rgb(255 154 213 / .6); }
[data-part="info.title"] { font-size: 24px; }
[data-part="tracklist.row"][data-state~="active"] { background: rgb(255 154 213 / .14); }
[data-part="overlay"] {
  background:
    url("assets/bat.svg") no-repeat left 50% top 2px / 44px,
    url("assets/star.svg") no-repeat left calc(50% + 40px) top 6px / 12px,
    url("assets/star.svg") no-repeat left calc(50% - 38px) top 14px / 9px,
    url("assets/bow.svg") no-repeat right 14px bottom 10px / 38px;
  opacity: .85;
}
[data-part="nowplaying.idle"] { background: url("assets/skull.svg") no-repeat center top / 72px; padding-top: 84px; }
/* the locket: the round cover with a lilac ring, the song beside it */
.lay-art, .lay-info, .lay-player, .lay-progress, .lay-volume { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; backdrop-filter: none !important; }
.lay-volume { display: flex; align-items: center; }
.lay-art, .lay-view-nowplaying [data-cell="art"] { display: grid; place-items: center; min-height: 0; padding: 24px; overflow: hidden; }
.lay-art .art-part, .lay-view-nowplaying [data-cell="art"] .art-part { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; width: 100%; height: 100%; min-height: 0; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { width: auto !important; height: min(42vh, 32vw) !important; max-width: 100% !important; aspect-ratio: 1; object-fit: cover; border-radius: 50% !important;
  box-shadow: 0 0 0 6px #120914, 0 0 0 9px #d9b3ff, 0 0 30px rgb(255 154 213 / .45) !important; }
.lay-info { align-self: end; text-align: left; }
.lay-info [data-part="info.title"] { font-size: clamp(26px, 3.4vw, 46px); }
''', files={**ofl('fredoka', 'Fredoka.ttf'), 'CREDITS.md': '# Credits\n\n- Font: Fredoka by the Fredoka Project Authors, SIL Open Font License 1.1 (assets/fredoka/OFL.txt).\n- Art: made for Voltage, CC0.\n', 'assets/bat.svg': bat, 'assets/star.svg': star, 'assets/bow.svg': bow, 'assets/skull.svg': skull})

# ── 5. sidebar: the streaming-app shape (library left, the song list centre, the player as a bar along the bottom) ──
write('sidebar', {
    'id': 'sidebar', 'name': 'Sidebar', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'Search and tabs down the left, the song list as a table in the middle, art and the player in a bar along the bottom.',
    'tokens': {'color.bg': '#121212', 'color.surface': 'rgba(24, 24, 24, .9)', 'color.border': 'rgba(255, 255, 255, .06)',
               'effect.blur': '0px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0.25', 'shape.radius': '8px'},
    'accent': {'mode': 'album'},
    'parts': {'tracklist': {'variant': 'table'}, 'titlebar': {'variant': 'minimal'}, 'player': {'variant': 'compact'}, 'progress': {'variant': 'line'}},
    'layout': {'home': {
        'areas': ['search list', 'art list', 'info list', 'side list', 'prog prog', 'bar bar'],
        'columns': '300px 1fr', 'rows': 'auto auto auto 1fr 36px 64px',
        'place': {'search': 'search', 'list': 'tracklist', 'art': 'art', 'info': 'info', 'side': 'spacer', 'bar': 'player', 'prog': 'progress'},
        'below': {'800px': {'areas': ['search', 'list', 'prog', 'bar'], 'columns': '1fr', 'rows': 'auto 1fr 36px 64px',
                            'place': {'search': 'search', 'list': 'tracklist', 'bar': 'player', 'prog': 'progress'}}}}},
}, css='''
[data-part="view.home"] { gap: 8px; }
[data-part="tracklist"] { background: rgb(255 255 255 / .03); border-radius: 8px; }
[data-part="art"] img { border-radius: 6px; }
''')

# ── 6. frosted-light: light frosted glass that follows Windows' light / dark setting, a red accent, big art ──
write('frosted-light', {
    'id': 'frosted-light', 'name': 'Frosted light', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'system',
    'description': "Frosted glass in light or dark, following Windows' setting; a red accent, a big cover, the player as a bar.",
    'tokens': {'effect.blur': '30px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0.4', 'shape.radius': '12px',
               'color.brand': '#e0334d', 'color.on-accent': '#ffffff'},
    'modes': {
        'light': {'color.bg': '#f4f2f5', 'color.text': '#1d1b20', 'color.text-dim': '#5f5a66', 'color.text-strong': '#0d0c0f',
                  'color.text-soft': '#2a272e', 'color.text-muted': '#45414b', 'color.surface': 'rgba(255, 255, 255, .62)',
                  'color.border': 'rgba(20, 16, 28, .09)', 'color.ink': '#14101c', 'color.shade': '#786e82', 'color.knob': '#ffffff',
                  'color.focus': '#1d1b20', 'color.placeholder': '#e4e1e8', 'color.select-bg': '#f3d7dc', 'color.mini-solid': '#f4f2f5',
                  'color.media-bg': '#e9e6ec', 'surface.menu': '#faf9fb', 'surface.pop': '#fcfbfd', 'surface.drag': '#f5f3f7',
                  'surface.game': '#f4f2f5', 'surface.tip': '#faf9fb', 'color.danger': '#c62828', 'color.error-text': '#b3261e',
                  'color.ok': '#1e7d3a', 'color.warn': '#9a5b00', 'color.brand': '#b8233c'},
        'dark': {'color.bg': '#151417', 'color.surface': 'rgba(40, 38, 44, .6)', 'color.border': 'rgba(255, 255, 255, .08)'}},
    'accent': {'mode': 'fixed', 'color': '#e0334d'},
    'parts': {'player': {'variant': 'compact'}, 'progress': {'variant': 'line'}, 'tracklist': {'variant': 'dense'}},
    'layout': {'home': {
        'areas': ['list art', 'list info', 'prog prog', 'bar bar'],
        'columns': 'minmax(300px, 380px) 1fr', 'rows': '1fr auto 36px 72px',
        'place': {'list': 'sidebar', 'art': 'art', 'info': 'info', 'prog': 'progress', 'bar': 'player'},
        'resizable': ['list'],
        'below': {'900px': {'areas': ['list', 'prog', 'bar'], 'columns': '1fr', 'rows': '1fr 36px 72px',
                            'place': {'list': 'sidebar', 'prog': 'progress', 'bar': 'player'}}}}},
}, css='''
[data-part="art"] { display: flex; align-items: center; justify-content: center; }
[data-part="art"] img { box-shadow: 0 24px 60px rgb(var(--shade) / .35); border-radius: 12px; }
[data-part="info.title"] { font-weight: 700; }
html[data-appearance="light"] [data-part="tracklist.row.artist"], html[data-appearance="light"] [data-part="tracklist.row.time"] { color: rgb(var(--ink) / .72); }
''')

# Reels land on Voltage's random rolls (--roll-1..5, new on every song), so every spin ends differently.
# ── 7. jackpot: a video slot (the user, 2026-11-12: "video slot, not 3 reel slot"). Purely a look: no betting, credits
#    or odds. A 5 x 3 symbol screen with the cover as the centre symbol; the reels spin and stop left to right on a new
#    song; paylines, coins and JACKPOT on a like. All symbol art is drawn here (CC0).
TILE = 100
def tile(body, bg='#fff6e2'):
    return f'<g><rect width="100" height="100" fill="{bg}"/><rect x="3" y="3" width="94" height="94" rx="10" fill="url(#shine)" opacity=".5"/>{body}</g>'
SYMBOLS = [
    # seven
    '<path d="M28 24h46v10L50 80H36l22-44H28z" fill="#d81b2a" stroke="#7a0010" stroke-width="3" stroke-linejoin="round"/>',
    # cherries
    '<path d="M50 22c-6 14-16 26-22 34M50 22c4 14 10 24 18 32" stroke="#2f7d1f" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M50 22c8-6 18-6 24 0-8 4-16 4-24 0z" fill="#3fa52a"/><circle cx="30" cy="64" r="14" fill="#c4122a"/><circle cx="68" cy="62" r="14" fill="#c4122a"/><circle cx="25" cy="59" r="4" fill="#ff8a95"/><circle cx="63" cy="57" r="4" fill="#ff8a95"/>',
    # bell
    '<path d="M50 16c-16 0-24 14-24 30v14l-8 10h64l-8-10V46c0-16-8-30-24-30z" fill="#ffc21a" stroke="#a86a00" stroke-width="3"/><circle cx="50" cy="78" r="7" fill="#a86a00"/><path d="M38 34c2-6 6-9 11-10" stroke="#fff3b0" stroke-width="4" fill="none" stroke-linecap="round"/>',
    # star
    '<path d="M50 14l10 24 26 2-20 17 7 25-23-14-23 14 7-25-20-17 26-2z" fill="#ffd400" stroke="#b37a00" stroke-width="3" stroke-linejoin="round"/>',
    # gem
    '<path d="M30 30h40l14 16-34 38-34-38z" fill="#2fb7ff" stroke="#0a5a8a" stroke-width="3" stroke-linejoin="round"/><path d="M30 30l8 16h24l8-16M16 46h68M38 46l12 38 12-38" stroke="#0a5a8a" stroke-width="2" fill="none"/><path d="M36 34l-4 8" stroke="#d9f4ff" stroke-width="3"/>',
    # bar
    '<rect x="16" y="36" width="68" height="28" rx="6" fill="#1b1b1b" stroke="#d4af37" stroke-width="3"/><text x="50" y="58" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="20" fill="#ffd966">BAR</text>',
    # lemon
    '<ellipse cx="50" cy="52" rx="30" ry="22" fill="#ffe14a" stroke="#b39a00" stroke-width="3"/><path d="M20 52l-6-2M80 52l6-2" stroke="#b39a00" stroke-width="4" stroke-linecap="round"/><path d="M40 42c4-3 10-4 16-3" stroke="#fff6b8" stroke-width="4" fill="none" stroke-linecap="round"/>',
    # crown
    '<path d="M18 70l-4-38 20 18 16-26 16 26 20-18-4 38z" fill="#ffc21a" stroke="#a86a00" stroke-width="3" stroke-linejoin="round"/><rect x="18" y="70" width="64" height="10" rx="3" fill="#d4af37"/><circle cx="50" cy="58" r="6" fill="#d81b2a"/><circle cx="32" cy="62" r="4" fill="#2fb7ff"/><circle cx="68" cy="62" r="4" fill="#2fb7ff"/>',
]
# The user's "arcane tech" symbol pack (2026-11-12, themes/tools/symbols/arcane): 8 of its 11 on the strip; position 0 = WILD
# (what the Reels plugin lands for a legendary song). Each file goes in as a nested <svg>, its ids prefixed so they can't clash.
import re as _re
ARCANE = ['special_wild', 'high_1_chrono_compass', 'high_2_aether_vial', 'high_3_void_gauntlet', 'high_4_astral_phoenix', 'special_scatter', 'low_a', 'low_k']
def _nested(i, name):
    src = (HERE / 'symbols' / 'arcane' / f'{name}.svg').read_text(encoding='utf-8')
    src = _re.sub(r'<!--.*?-->', '', src, flags=_re.S)
    inner = _re.sub(r'^\s*<svg[^>]*>|</svg>\s*$', '', src.strip())
    inner = _re.sub(r'id="([^"]+)"', lambda m: f'id="s{i}-{m.group(1)}"', inner)
    inner = _re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#s{i}-{m.group(1)})', inner)
    return (f'<g transform="translate(0 {i * 100})"><rect width="100" height="100" fill="#0d0a1f"/><rect x="2" y="2" width="96" height="96" rx="10" fill="#17112e" stroke="#2c2350"/>'
            f'<svg x="4" y="4" width="92" height="92" viewBox="0 0 200 200">{inner}</svg></g>')
arcane_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 800">' + ''.join(_nested(i, n) for i, n in enumerate(ARCANE)) + '</svg>' + chr(10)
reel_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 800"><defs><linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e8d6b0"/></linearGradient></defs>'
            + ''.join(f'<g transform="translate(0 {i * TILE})">{tile(b)}</g>' for i, b in enumerate(SYMBOLS)) + '</svg>\n')
def _bulb(cx, cy, lit):
    """One marquee bulb in a 16 x 16 cell: halo (lit only), gold socket ring, glass with a highlight."""
    if lit:
        g = {'c': ('#ffffff', '#8ff6ff', '#00b8e6'), 'h': '#00d2ff'} if lit == 'cyan' else {'c': ('#ffffff', '#e2b8ff', '#9b4dff'), 'h': '#b26bff'}
        gid = f'b{lit}'
        return (f'<circle cx="{cx}" cy="{cy}" r="8" fill="url(#{gid}h)"/>'
                f'<circle cx="{cx}" cy="{cy}" r="4.6" fill="none" stroke="#d4af37" stroke-width="1.1"/>'
                f'<circle cx="{cx}" cy="{cy}" r="3.8" fill="url(#{gid})"/>'
                f'<ellipse cx="{cx - 1.2}" cy="{cy - 1.4}" rx="1.3" ry=".9" fill="#ffffff" opacity=".9"/>')
    return (f'<circle cx="{cx}" cy="{cy}" r="4.6" fill="none" stroke="#8a7330" stroke-width="1.1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="3.8" fill="url(#boff)"/>'
            f'<ellipse cx="{cx - 1.2}" cy="{cy - 1.4}" rx="1.1" ry=".7" fill="#ffffff" opacity=".25"/>')
def _bulb_defs():
    out = []
    for name, (a, b, c), h in (('cyan', ('#ffffff', '#8ff6ff', '#00b8e6'), '#00d2ff'), ('violet', ('#ffffff', '#e2b8ff', '#9b4dff'), '#b26bff')):
        out.append(f'<radialGradient id="b{name}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="{a}"/><stop offset=".45" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></radialGradient>')
        out.append(f'<radialGradient id="b{name}h"><stop offset="0" stop-color="{h}" stop-opacity=".7"/><stop offset=".55" stop-color="{h}" stop-opacity=".25"/><stop offset="1" stop-color="{h}" stop-opacity="0"/></radialGradient>')
    out.append('<radialGradient id="boff" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#5a4f80"/><stop offset="1" stop-color="#1a1436"/></radialGradient>')
    return '<defs>' + ''.join(out) + '</defs>'
_PATTERN = ['cyan', None, 'violet', None]
bulbs_h = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 16">' + _bulb_defs()
           + ''.join(_bulb(8 + 16 * i, 8, lit) for i, lit in enumerate(_PATTERN)) + '</svg>' + chr(10))
bulbs_v = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 64">' + _bulb_defs()
           + ''.join(_bulb(8, 8 + 16 * i, lit) for i, lit in enumerate(_PATTERN)) + '</svg>' + chr(10))
coin_svg = SVG('<circle cx="32" cy="32" r="26" fill="#ffc21a" stroke="#a86a00" stroke-width="4"/><circle cx="32" cy="32" r="17" fill="none" stroke="#fff0a0" stroke-width="3"/><path d="M27 22h10v20H27z" fill="#d4af37"/>')
REEL = 180  # the largest symbol size (--reel in the CSS shrinks it on short windows)
write('jackpot', {
    'id': 'jackpot', 'name': 'Jackpot', 'version': '2.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'A video slot: a 5 x 3 symbol screen with the cover in the middle, reels that spin on every new song, paylines, coins and JACKPOT when you like a song.',
    'fonts': [{'family': 'Bungee', 'src': 'assets/bungee/Bungee-Regular.ttf'}],
    'tokens': {'color.bg': '#07061a', 'color.text': '#eef4ff', 'color.text-dim': '#a9b8e0', 'color.text-strong': '#ffffff',
               'color.surface': 'rgba(20, 16, 48, .8)', 'color.border': 'rgba(0, 210, 255, .35)', 'color.brand': '#00d2ff',
               'color.on-accent': '#04101f', 'color.knob': '#9ff0ff', 'color.select-bg': '#24174d', 'surface.menu': '#120d26',
               'surface.pop': '#141030', 'surface.tip': '#120d26', 'effect.blur': '10px', 'effect.glow-size': '16px', 'effect.glow-alpha': '55%',
               'accent.album-mix': '0.2', 'shape.radius': '18px'},
    'accent': {'mode': 'fixed', 'color': '#00d2ff'},
    'parts': {'progress': {'variant': 'blocks'}, 'art': {'variant': 'cover'}},
    'supports': {'background': ['gradient']},  # its own arcane backdrop: the cover / video (warm album colours) clash with the cabinet (the user, 2026-11-12)
    'strings': {'player.next': 'Spin', 'player.prev': 'Back', 'player.shuffle': 'Roll', 'library.liked': 'Jackpots',
                'empty.queue': 'Insert a song to play', 'nowplaying.idle': 'Insert a song', 'nav.stats': 'Win history',
                'explore.fromLiked': 'Your jackpots', 'note.liked': 'BIG WIN!', 'menu.playNow': 'Spin it', 'menu.playNext': 'Spin next'},
    'sounds': {'skip': 'assets/reel.wav', 'play': 'assets/bell.wav', 'like': 'assets/coin.wav', 'click': 'assets/tick.wav', 'navigate': 'assets/tick.wav'},
    'overlay': True, 'plugin': 'reels',
    'layout': {
        'nowplaying': {
            'areas': ['back info info info info info video', 'l r1 r2 art r4 r5 r', 'prog prog prog prog prog prog prog', 'ctl ctl ctl ctl ctl vol vol'],
            'columns': '1fr repeat(5, var(--reel)) 1fr', 'rows': 'auto calc(var(--reel) * 3) 48px 96px',
            'place': {'back': 'back', 'info': 'info', 'video': 'video', 'l': 'spacer', 'r': 'spacer',
                      'r1': 'slot:reel1', 'r2': 'slot:reel2', 'art': 'art', 'r4': 'slot:reel4', 'r5': 'slot:reel5',
                      'prog': 'progress', 'ctl': 'player', 'vol': 'volume'},
            'below': {'1100px': {'areas': ['back info info info video', 'l r2 art r4 r', 'prog prog prog prog prog', 'ctl ctl ctl vol vol'],
                                 'columns': '1fr repeat(3, var(--reel)) 1fr', 'rows': 'auto calc(var(--reel) * 3) 48px 96px',
                                 'place': {'back': 'back', 'info': 'info', 'video': 'video', 'l': 'spacer', 'r': 'spacer', 'r2': 'slot:reel2', 'art': 'art', 'r4': 'slot:reel4',
                                           'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}}},
        'mini': {'areas': ['art meta ctl'], 'columns': '64px 1fr auto', 'place': {'art': 'art', 'meta': 'info', 'ctl': 'player'}},
    },
}, css=r"""
/* the backdrop: the arcane palette, never the album's colours (supports.background is gradient only) */
[data-part="background"] { background-color: #07061a !important; opacity: 1 !important;
  background-image: radial-gradient(120% 90% at 15% 0%, rgb(90 40 200 / .45), transparent 62%), radial-gradient(100% 100% at 100% 100%, rgb(0 170 230 / .3), transparent 58%), radial-gradient(60% 50% at 50% 55%, rgb(200 40 220 / .12), transparent 70%) !important; }

/* marquee lettering */
[data-part="titlebar.brand"], [data-part="info.title"], .for-you-title { font-family: "Bungee", "Bahnschrift", sans-serif; letter-spacing: .04em; }
[data-part="titlebar.brand"] { color: #00e5ff; text-shadow: 0 0 10px rgb(0 210 255 / .7); }
[data-part="info.title"] { color: #ffd700; text-shadow: 0 0 14px rgb(112 0 255 / .8), 0 2px 0 #3a1d7a; }

/* one symbol's size: 180 px, smaller on short windows so the whole cabinet fits (1366 x 768: ~146 px) */
:root { --reel: clamp(96px, calc((100vh - 330px) / 3), 180px); }
/* the screen: five reels of symbols (one strip image, each reel at its own offset); the cover is the centre symbol */
.lay-view-nowplaying { column-gap: 0; }
.lay-view-nowplaying [data-cell^="slot:reel"], .lay-view-nowplaying [data-cell="art"] {
  /* longhands: a shorthand mixing var() with other background properties doesn't survive the cleaner */
  background-image: url("assets/reel.svg"); background-size: var(--reel) calc(var(--reel) * 8); background-repeat: repeat-y; background-position-x: 0; background-position-y: var(--o); position: relative; overflow: hidden;
  border-top: 5px solid #d4af37; border-bottom: 5px solid #d4af37;
  box-shadow: inset 0 26px 30px -10px rgb(0 0 0 / .75), inset 0 -26px 30px -10px rgb(0 0 0 / .75), inset -1px 0 0 #2c2350, 0 0 26px rgb(0 210 255 / .25); }
.lay-view-nowplaying [data-cell="slot:reel1"] { --o: calc(var(--roll-1, 0) * var(--reel) * -1); border-radius: 16px 0 0 16px; border-left: 5px solid #d4af37; }
.lay-view-nowplaying [data-cell="slot:reel2"] { --o: calc(var(--roll-2, 3) * var(--reel) * -1); }
.lay-view-nowplaying [data-cell="art"] { --o: calc(var(--roll-3, 5) * var(--reel) * -1); padding: var(--reel) 0; display: block; }
.lay-view-nowplaying [data-cell="slot:reel4"] { --o: calc(var(--roll-4, 2) * var(--reel) * -1); }
.lay-view-nowplaying [data-cell="slot:reel5"] { --o: calc(var(--roll-5, 7) * var(--reel) * -1); border-radius: 0 16px 16px 0; border-right: 5px solid #d4af37; }
.lay-view-nowplaying [data-cell="art"] .art-part { display: block; width: var(--reel); height: var(--reel); }
.lay-view-nowplaying [data-cell="art"] img { width: var(--reel) !important; height: var(--reel) !important; max-width: none; border-radius: 0; object-fit: cover;
  box-shadow: inset 0 0 0 4px #00d2ff, 0 0 24px rgb(0 210 255 / .6); }

/* nothing playing: a dimmed reel strip drifts behind INSERT A SONG */
[data-part="nowplaying.idle"] { position: relative; width: min(100%, 900px); padding: 40px 0; border-top: 5px solid #d4af37; border-bottom: 5px solid #d4af37; overflow: hidden;
  background-image: url("assets/reel.svg"); background-size: 120px 960px; background-repeat: repeat; background-position: 0 0;
  animation: idle-drift 24s linear infinite; }
[data-part="nowplaying.idle"]::before { content: ""; position: absolute; inset: 0; background-color: rgb(7 6 26 / .78); }
[data-part="nowplaying.idle"] > * { position: relative; }
[data-part="nowplaying.idle"] .logo { font-family: "Bungee", sans-serif; color: #ffd700; text-shadow: 0 0 18px rgb(112 0 255 / .9), 0 3px 0 #3a1d7a; }
[data-part="nowplaying.idle"] p { font-family: "Bungee", sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #00e5ff; opacity: 1;
  animation: idle-blink 1.4s steps(2) infinite; }
@keyframes idle-drift { to { background-position: 0 960px; } }
@keyframes idle-blink { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { [data-part="nowplaying.idle"], [data-part="nowplaying.idle"] p { animation: none; } }

/* three reels under 1100 px: the gold frame closes on reels 2 and 4 */
@media (max-width: 1100px) {
  .lay-view-nowplaying [data-cell="slot:reel2"] { border-radius: 16px 0 0 16px; border-left: 5px solid #d4af37; }
  .lay-view-nowplaying [data-cell="slot:reel4"] { border-radius: 0 16px 16px 0; border-right: 5px solid #d4af37; }
}

/* a new song: the five reels spin and stop left to right */
@keyframes spin-reel { from { background-position-y: calc(var(--o) - var(--reel) * 16); filter: blur(2px); } 85% { filter: blur(0); } to { background-position-y: var(--o); } }
@keyframes spin-cover { 0% { transform: translateY(-140%); filter: blur(5px); } 75% { transform: translateY(5%); filter: blur(0); } 100% { transform: none; } }
:root[data-event="track-change"] [data-cell^="slot:reel"], :root[data-event="skip"] [data-cell^="slot:reel"], :root[data-event="previous"] [data-cell^="slot:reel"],
:root[data-event="track-change"] [data-cell="art"], :root[data-event="skip"] [data-cell="art"], :root[data-event="previous"] [data-cell="art"] { animation: spin-reel .5s cubic-bezier(.15, .7, .3, 1) both; }
:root[data-event] [data-cell="slot:reel2"] { animation-duration: .65s !important; }
:root[data-event] [data-cell="art"] { animation-duration: .8s !important; }
:root[data-event] [data-cell="slot:reel4"] { animation-duration: .95s !important; }
:root[data-event] [data-cell="slot:reel5"] { animation-duration: 1.1s !important; }
:root[data-event="track-change"] [data-cell="art"] img, :root[data-event="skip"] [data-cell="art"] img, :root[data-event="previous"] [data-cell="art"] img { animation: spin-cover .8s cubic-bezier(.15, .7, .3, 1); }

/* a like: the middle payline lights across all five reels, coins rain, BIG WIN */
.lay-view-nowplaying [data-cell^="slot:reel"]::after, .lay-view-nowplaying [data-cell="art"]::after { content: ""; position: absolute; left: 0; right: 0; top: calc(50% - 3px); height: 6px;
  background: linear-gradient(90deg, #00f2fe, #f093fb, #00f2fe); box-shadow: 0 0 14px 4px rgb(0 210 255 / .8); opacity: 0; pointer-events: none; }
:root[data-event="like"] [data-cell^="slot:reel"]::after, :root[data-event="like"] [data-cell="art"]::after { animation: payline 1.2s ease-out; }
@keyframes payline { 10%, 30%, 50%, 70% { opacity: 1; } 20%, 40%, 60% { opacity: .3; } 100% { opacity: 0; } }

/* marquee bulbs: real bulbs (glass, gold socket, halo) in the margins outside the panels, framing the window like a
   cabinet; nothing crosses the title bar. Four-bulb pattern (cyan, dark, violet, dark) moved one bulb per step = a chase. */
[data-part="overlay"] {
  /* the two bottom corners: a gold rivet over the spot where a column meets the row */
  background-image: radial-gradient(circle, #d4af37 0 2.5px, #0d0a1f 3.5px), radial-gradient(circle, #d4af37 0 2.5px, #0d0a1f 3.5px), url("assets/bulbs-h.svg"), url("assets/bulbs-v.svg"), url("assets/bulbs-v.svg");
  background-repeat: no-repeat, no-repeat, repeat-x, repeat-y, repeat-y;
  background-size: 16px 16px, 16px 16px, 64px 16px, 16px 64px, 16px 64px;
  background-position: -1px calc(100% + 1px), calc(100% + 1px) calc(100% + 1px), 0 calc(100% + 1px), -1px 0, calc(100% + 1px) 0;
  animation: bulbs 2s steps(4) infinite;
}
@keyframes bulbs { to { background-position: -1px calc(100% + 1px), calc(100% + 1px) calc(100% + 1px), 64px calc(100% + 1px), -1px 64px, calc(100% + 1px) -64px; } }
[data-part="overlay"]::before { content: ""; position: absolute; inset: -20% 0 0; background: url("assets/coin.svg") 0 0 / 46px 46px; opacity: 0;
  -webkit-mask: linear-gradient(transparent, #000 20%, #000 70%, transparent); mask: linear-gradient(transparent, #000 20%, #000 70%, transparent); }
:root[data-event="like"] [data-part="overlay"]::before { animation: coins 1.2s linear; }
@keyframes coins { 0% { opacity: 0; background-position: 0 -200px, 23px -120px; } 15% { opacity: .9; } 85% { opacity: .9; } 100% { opacity: 0; background-position: 0 600px, 23px 700px; } }
[data-part="overlay"]::after { content: "BIG WIN"; position: absolute; inset: 0; display: grid; place-items: center; font: 900 min(13vw, 140px) "Bungee", sans-serif;
  color: #ffd700; text-shadow: 0 0 30px #7000ff, 0 0 60px #00d2ff, 0 6px 0 #3a1d7a; opacity: 0; }
:root[data-event="like"] [data-part="overlay"]::after { animation: bigwin 1.2s ease-out; }
:root[data-event="like"] [data-part="overlay"] { animation-duration: .5s; }
@keyframes bigwin { 0% { opacity: 0; transform: scale(.6); } 20% { opacity: 1; transform: scale(1.08); } 35%, 60% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.15); } }
@media (prefers-reduced-motion: reduce) { [data-part="overlay"] { animation: none; } }

/* progress: a bonus meter of bulbs */
.prog-blocks { justify-content: space-between; }
.prog-blocks i { flex: 0 0 14px; width: 14px; height: 14px; border-radius: 50%; background: #1b1440; box-shadow: inset 0 0 3px rgb(0 0 0 / .8); }
.prog-blocks i.on { background: radial-gradient(circle at 40% 35%, #e8fdff, #00d2ff 60%, #0a4a7a); box-shadow: 0 0 8px #00d2ff; }
/* arcade buttons: play (spin) green, next amber, previous red */
[data-part="player.button.play"] { background: radial-gradient(circle at 40% 30%, #c8fbff, #00d2ff 60%, #0a3f6e) !important; box-shadow: 0 0 0 4px #d4af37, 0 0 18px rgb(0 210 255 / .7) !important; color: #04101f !important; }
[data-part="player.button.next"] { background: radial-gradient(circle at 40% 30%, #e6c8ff, #7000ff 60%, #2a0a66) !important; color: #f4ecff !important; box-shadow: 0 0 0 3px #d4af37 !important; }
[data-part="player.button.prev"] { background: radial-gradient(circle at 40% 30%, #ffd0f4, #f093fb 55%, #6a1a6e) !important; color: #2a0626 !important; box-shadow: 0 0 0 3px #d4af37 !important; }
/* rarity from the Reels companion plugin (data-rarity on html): a badge after the title, a lit payline on epic and up */
:root[data-rarity="rare"] [data-part="info.title"]::after { content: "  ★ RARE"; color: #7fd4ff; font-size: .55em; }
:root[data-rarity="epic"] [data-part="info.title"]::after { content: "  ★★ EPIC"; color: #d68cff; font-size: .55em; }
:root[data-rarity="legendary"] [data-part="info.title"]::after { content: "  ★★★ LEGENDARY"; color: #ffe066; font-size: .55em; text-shadow: 0 0 12px #ff9900; }
:root[data-rarity="epic"] .lay-view-nowplaying [data-cell^="slot:reel"]::after, :root[data-rarity="legendary"] .lay-view-nowplaying [data-cell^="slot:reel"]::after,
:root[data-rarity="legendary"] .lay-view-nowplaying [data-cell="art"]::after { opacity: .85; }

/* the lever, in the empty column right of the reels: pulls down on a skip / new song */
.lay-view-nowplaying [data-area="r"] { position: relative; }
.lay-view-nowplaying [data-area="r"]::before { content: ""; position: absolute; left: 18px; top: 18%; width: 12px; height: 200px; border-radius: 6px;
  background: linear-gradient(90deg, #9a9a9a, #f0f0f0 45%, #8a8a8a); transform-origin: 50% 100%; box-shadow: 0 0 0 2px #7a4a00; }
.lay-view-nowplaying [data-area="r"]::after { content: ""; position: absolute; left: 4px; top: calc(18% - 30px); width: 40px; height: 40px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #e6c8ff, #7000ff 55%, #2a0a66); box-shadow: 0 4px 10px rgb(0 0 0 / .6); transform-origin: 24px 230px; }
.lay-view-nowplaying [data-area="r"] { min-height: 260px; }
@keyframes lever { 0% { transform: none; } 30% { transform: rotateX(70deg) scaleY(.35); } 100% { transform: none; } }
@keyframes lever-ball { 0% { transform: none; } 30% { transform: translateY(150px); } 100% { transform: none; } }
:root[data-event="skip"] [data-area="r"]::before, :root[data-event="track-change"] [data-area="r"]::before { animation: lever .7s ease-in-out; }
:root[data-event="skip"] [data-area="r"]::after, :root[data-event="track-change"] [data-area="r"]::after { animation: lever-ball .7s ease-in-out; }

/* the home screen: the cover in a gold reel window, the playing row lit gold */
[data-part="nowplaying"] .art { box-shadow: 0 0 0 5px #d4af37, 0 0 0 9px #24174d, 0 0 30px rgb(0 210 255 / .45) !important; }
[data-part="tracklist.row"][data-state~="active"] { background: linear-gradient(90deg, rgb(0 210 255 / .2), transparent); box-shadow: inset 3px 0 0 #00d2ff; }
/* the mini player is too small for marquee bulbs */
[data-part="app"][data-state~="mini"] [data-part="overlay"] { background: none; animation: none; }
/* the mini player: one reel window */
.lay-view-mini [data-cell="art"] { border-radius: 10px; box-shadow: inset 0 0 0 3px #d4af37; padding: 4px; background: #120d26; }
""", files={**ofl('bungee', 'Bungee-Regular.ttf'), 'assets/reel.svg': arcane_svg, 'assets/coin.svg': coin_svg, 'assets/bulbs-h.svg': bulbs_h, 'assets/bulbs-v.svg': bulbs_v,
            'assets/reel.wav': tone('reel'), 'assets/bell.wav': tone('bell'), 'assets/coin.wav': tone('coin'), 'assets/tick.wav': tone('tick'),
            'CREDITS.md': '# Credits\n\n- Font: Bungee by the Bungee Project Authors (David Jonathan Ross), SIL Open Font License 1.1 (assets/bungee/OFL.txt).\n- Reel symbols: the \"arcane tech\" slot symbol pack, provided by the Voltage author (2026-11-12).\n- Coins and sounds: made for Voltage, CC0.\n- Purely a look: no betting, credits or odds.\n'})

# ── 8. paper: black ink on newsprint. A blackletter masthead, big serif headlines, halftone covers, ruled columns,
#    no glass and no glow (docs/review-round-14.md > Paper). Fonts: Playfair Display + UnifrakturMaguntia (OFL).
INK, PAPER = '#161412', '#f1ece1'
write('paper', {
    'id': 'paper', 'name': 'Paper', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'light',
    'description': 'Black ink on newsprint: a blackletter masthead, big serif headlines, halftone covers, ruled columns. No glass, no glow.',
    'fonts': [{'family': 'Playfair Display', 'src': 'assets/playfair/PlayfairDisplay.ttf', 'weight': '400 900'},
              {'family': 'UnifrakturMaguntia', 'src': 'assets/unifraktur/UnifrakturMaguntia-Book.ttf'}],
    'tokens': {'color.bg': PAPER, 'color.text': INK, 'color.text-dim': '#4d4740', 'color.text-strong': '#000000',
               'color.text-soft': '#2a2622', 'color.text-muted': '#3d3832', 'color.surface': '#f7f3ea',
               'color.border': 'rgba(22, 20, 18, .85)', 'color.ink': INK, 'color.shade': '#5a5248', 'color.knob': PAPER,
               'color.focus': INK, 'color.placeholder': '#ddd6c8', 'color.select-bg': '#e3dccd', 'color.mini-solid': PAPER,
               'color.media-bg': '#e6e0d3', 'surface.menu': '#f7f3ea', 'surface.pop': '#f7f3ea', 'surface.drag': '#efe9dc',
               'surface.game': PAPER, 'surface.tip': '#f7f3ea', 'color.danger': '#a3201a', 'color.error-text': '#a3201a',
               'color.ok': '#2c5e1a', 'color.warn': '#7a4a00', 'color.brand': INK, 'color.on-accent': PAPER,
               'effect.blur': '0px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0',
               'shape.radius': '0px', 'shape.roundness': '0'},
    'accent': {'mode': 'fixed', 'color': INK},
    'parts': {'tracklist': {'variant': 'table'}, 'progress': {'variant': 'line'}, 'art': {'variant': 'cover'}, 'nav': {'variant': 'tabs'}},
    # the page is the background: the album's colours, a blurred cover or a video behind newsprint don't belong
    'layout': {
        # the front page: the headline across the top, the cover as the lead photo, the lyrics as the article, the list as a side column
        'home': {'areas': ['head head list', 'art lyr list', 'prog prog list', 'bar bar list'],
                 'columns': 'minmax(220px, 1fr) minmax(220px, 1fr) minmax(280px, 340px)', 'rows': 'auto minmax(0, 1fr) 36px 72px',
                 'place': {'head': 'info', 'art': 'art', 'lyr': 'lyrics', 'list': 'sidebar', 'prog': 'progress', 'bar': 'player'},
                 'resizable': ['list'],
                 'below': {'1000px': {'areas': ['head list', 'art list', 'prog list', 'bar list'], 'columns': '1fr minmax(260px, 320px)',
                                      'rows': 'auto minmax(0, 1fr) 36px 72px',
                                      'place': {'head': 'info', 'art': 'art', 'list': 'sidebar', 'prog': 'progress', 'bar': 'player'}}}},
        'nowplaying': {'areas': ['back head head video', 'art art lyr lyr', 'prog prog prog prog', 'ctl ctl vol vol'],
                       'columns': '56px 1fr 1fr 56px', 'rows': 'auto minmax(0, 1fr) 40px 88px',
                       'place': {'back': 'back', 'head': 'info', 'video': 'video', 'art': 'art', 'lyr': 'lyrics',
                                 'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}},
    'supports': {'background': ['black']},
    'strings': {'nowplaying.idle': 'Stop the presses: nothing is playing', 'empty.queue': 'No stories filed yet. Queue a song.',
                'empty.search': 'Search the archives', 'library.liked': 'Clippings', 'explore.fromLiked': 'From your clippings',
                'nav.stats': 'The almanac', 'note.liked': 'Clipped', 'nav.home': 'Front page', 'nav.explore': 'Sections',
                'nav.settings': 'Masthead', 'nav.mini': 'Pocket edition'},
}, css=r"""
/* the masthead and the headlines */
[data-part="titlebar"] { border-bottom: 3px double #161412; }
.nav-tabs button { font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 13.5px; color: #3d3832; }
.nav-tabs button.on { color: #000; border-bottom-color: #161412; }
[data-part="titlebar.brand"] { font-family: "UnifrakturMaguntia", "Old English Text MT", serif; font-size: 24px; letter-spacing: 0; color: #000; text-transform: none; }
[data-part="info.title"], .for-you-title, [data-part="explore.shelf"] h2, [data-part="explore.shelf"] h3 { font-family: "Playfair Display", Georgia, serif; font-weight: 900; letter-spacing: -.01em; color: #000; }
[data-part="info.title"] { font-size: 34px; line-height: 1.05; }
[data-part="info"] { font-family: "Playfair Display", Georgia, serif; font-style: italic; }
[data-part="info"] [data-part="info.title"] { font-style: normal; }
[data-part="tracklist.row.title"] { font-family: "Playfair Display", Georgia, serif; font-weight: 700; }
[data-part="tracklist.row.artist"], [data-part="tracklist.row.time"] { color: #3d3832; opacity: 1; }
[data-part="lyrics.line"] { font-family: "Playfair Display", Georgia, serif; }

/* columns: ruled boxes with a hard offset shadow, like paste-up on a light table */
[data-part="sidebar"], [data-part="nowplaying"], [data-part="dialog"], [data-part="menu"] {
  background-color: #f7f3ea !important; border: 1.5px solid #161412 !important; box-shadow: 5px 5px 0 #161412 !important; }
[data-part="tracklist.row"] { border-bottom: 1px dotted rgb(22 20 18 / .45); }
[data-part="tracklist.row"][data-state~="active"] { background-color: #161412 !important; }
[data-part="tracklist.row"][data-state~="active"], [data-part="tracklist.row"][data-state~="active"] * { color: #f1ece1 !important; }

/* halftone covers: grey ink through a dot screen (a mask on the picture itself: full ink on the dots, lighter between) */
[data-part="art"] img, [data-part="tracklist.row"] img, [data-part="explore.card"] img { filter: grayscale(1) contrast(1.25) brightness(1.05); }
[data-part="art"] img { border: 1.5px solid #161412;
  -webkit-mask-image: radial-gradient(circle, #000 0 1.3px, rgb(0 0 0 / .62) 1.9px); -webkit-mask-size: 4px 4px;
  mask-image: radial-gradient(circle, #000 0 1.3px, rgb(0 0 0 / .62) 1.9px); mask-size: 4px 4px; }

/* the front page: open newsprint between ink rules, not boxes */
.lay-area:not(.lay-sidebar) { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; backdrop-filter: none !important; }
.lay-area.lay-info, .lay-view-nowplaying .lay-area[data-cell="info"] { border-top: 4px solid #161412 !important; border-bottom: 3px double #161412 !important; border-top-color: #161412 !important; border-bottom-color: #161412 !important; padding: 6px 0 10px; }
.lay-info [data-part="info.title"], .lay-view-nowplaying [data-cell="info"] [data-part="info.title"] { font-size: clamp(30px, 4.4vw, 60px); }
.lay-art, .lay-view-nowplaying [data-cell="art"] { display: grid; place-items: start center; padding-top: 14px; min-height: 0; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { max-height: 100%; object-fit: contain; }
/* the article: the lyrics, set like a news column */
.lay-area.lay-lyrics, .lay-view-nowplaying .lay-area[data-cell="lyrics"] { border-left: 1px solid #161412 !important; border-left-color: #161412 !important; padding: 10px 0 0 18px; min-height: 0; }
.lay-lyrics .lyrics, .lay-view-nowplaying [data-cell="lyrics"] .lyrics { width: 100% !important; height: 100% !important; padding: 0 4px 40% !important; text-align: justify; hyphens: auto; }
.lay-lyrics .lyrics p.on, .lay-view-nowplaying [data-cell="lyrics"] .lyrics p.on { transform-origin: left center; } /* the sung line grows from its left edge */
.lay-lyrics [data-part="lyrics.line"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"] { font-size: 16px; line-height: 1.55; color: #161412; opacity: .62; }
.lay-lyrics [data-part="lyrics.line"][data-state~="active"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"][data-state~="active"] { opacity: 1; font-weight: 700; }

/* the player: ink buttons */
[data-part="player.button.play"] { background-color: #161412 !important; color: #f1ece1 !important; box-shadow: none !important; }
[data-part="progress.bar"] { filter: grayscale(1); }
[data-part="nowplaying.idle"] .logo { font-family: "UnifrakturMaguntia", serif; font-size: 56px; color: #000; text-shadow: none; }
[data-part="nowplaying.idle"] p { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-size: 16px; border-top: 1px solid #161412; border-bottom: 1px solid #161412; padding: 4px 18px; }
""", files={**ofl('playfair', 'PlayfairDisplay.ttf'), **ofl('unifraktur', 'UnifrakturMaguntia-Book.ttf'),
            'CREDITS.md': '# Credits\n\n- Fonts: Playfair Display by the Playfair Display Project Authors (Claus Eggers Sorensen), and UnifrakturMaguntia by j. \'mach\' wust and Peter Wiegel; both SIL Open Font License 1.1 (assets/playfair/OFL.txt, assets/unifraktur/OFL.txt).\n- Everything else: made for Voltage, CC0.\n'})

PANEL_BRACKETS = 'background-image: linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000), linear-gradient(#ffb000, #ffb000); background-size: 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px; background-position: left top, left top, right top, right top, left bottom, left bottom, right bottom, right bottom; background-repeat: no-repeat;'
WINDOW_BRACKETS = 'background-image: linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)), linear-gradient(rgb(255 176 0 / .8), rgb(255 176 0 / .8)); background-size: 34px 3px, 3px 34px, 34px 3px, 3px 34px, 34px 3px, 3px 34px, 34px 3px, 3px 34px; background-position: left top, left top, right top, right top, left bottom, left bottom, right bottom, right bottom; background-repeat: no-repeat;'
# ── 9. tactical: a gamer HUD. Olive and amber, corner brackets on every panel, a stencil font, a compass-tape progress
#    bar, "uplink" wording, the mini player as a HUD strip for over games (docs/review-round-14.md > Tactical).
#    Fonts: Black Ops One + Share Tech Mono (OFL).
write('tactical', {
    'id': 'tactical', 'name': 'Tactical', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'A gamer HUD: olive and amber, corner brackets on every panel, a stencil font, a compass-tape progress bar, the mini player as a HUD strip.',
    'fonts': [{'family': 'Black Ops One', 'src': 'assets/blackops/BlackOpsOne-Regular.ttf'},
              {'family': 'Share Tech Mono', 'src': 'assets/sharetech/ShareTechMono-Regular.ttf'}],
    'tokens': {'color.bg': '#0b0e08', 'color.text': '#dfe4cf', 'color.text-dim': '#a3ad8c', 'color.text-strong': '#f4f7e8',
               'color.text-soft': '#cfd6ba', 'color.text-muted': '#b7c09f', 'color.surface': 'rgba(22, 28, 15, .84)',
               'color.border': 'rgba(255, 176, 0, .22)', 'color.brand': '#ffb000', 'color.on-accent': '#1a1200', 'color.knob': '#ffcf5a',
               'color.select-bg': '#2a3218', 'surface.menu': '#141a0d', 'surface.pop': '#161d0f', 'surface.tip': '#141a0d',
               'effect.blur': '4px', 'effect.glow-size': '8px', 'effect.glow-alpha': '35%', 'accent.album-mix': '0',
               'shape.radius': '2px', 'shape.roundness': '0.2'},
    'accent': {'mode': 'fixed', 'color': '#ffb000'},
    'parts': {'progress': {'variant': 'line'}, 'tracklist': {'variant': 'dense'}, 'nav': {'variant': 'sidebar'}},
    # its own grid backdrop: album colours, a blurred cover or a video behind the HUD clash with it
    'supports': {'background': ['gradient']},
    'strings': {'nowplaying.idle': 'No signal. Awaiting uplink', 'empty.queue': 'Queue empty. Awaiting orders.',
                'empty.search': 'Enter search coordinates', 'library.liked': 'Commendations', 'explore.fromLiked': 'From your commendations',
                'nav.stats': 'Debrief', 'note.liked': 'Target marked', 'player.next': 'Advance', 'player.prev': 'Fall back',
                'nav.home': 'Base', 'nav.explore': 'Recon', 'nav.settings': 'Loadout', 'nav.mini': 'HUD'},
    'sounds': {'click': 'assets/tick.wav', 'navigate': 'assets/blip.wav', 'skip': 'assets/hum.wav'},
    'layout': {
        # the HUD: the list down the left, the cover as the target in the middle, intel (the song) and the comms log (lyrics) on the right
        'home': {'areas': ['list art intel', 'list art comms', 'list prog prog', 'list bar vol'],
                 'columns': 'minmax(260px, 320px) 1fr minmax(240px, 300px)', 'rows': 'auto minmax(0, 1fr) 40px 72px',
                 'place': {'list': 'sidebar', 'art': 'art', 'intel': 'info', 'comms': 'lyrics', 'prog': 'progress', 'bar': 'player', 'vol': 'volume'},
                 'resizable': ['list', 'comms'],
                 'below': {'1000px': {'areas': ['list art', 'list intel', 'prog prog', 'bar bar'], 'columns': 'minmax(240px, 300px) 1fr',
                                      'rows': 'minmax(0, 1fr) auto 40px 72px',
                                      'place': {'list': 'sidebar', 'art': 'art', 'intel': 'info', 'prog': 'progress', 'bar': 'player'}}}},
        'nowplaying': {'areas': ['back . . video', 'intel art art comms', 'prog prog prog prog', 'ctl ctl vol vol'],
                       'columns': 'minmax(200px, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(200px, 1fr)', 'rows': 'auto minmax(0, 1fr) 40px 88px',
                       'place': {'back': 'back', 'video': 'video', 'intel': 'info', 'art': 'art', 'comms': 'lyrics',
                                 'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}},
'mini': {'areas': ['art meta ctl'], 'columns': '48px 1fr auto', 'place': {'art': 'art', 'meta': 'info', 'ctl': 'player'}}},
}, css=r"""
/* the backdrop: a dark olive map grid with a vignette, never the album's colours */
[data-part="background"] { background-color: #0b0e08 !important; opacity: 1 !important;
  background-image: radial-gradient(120% 100% at 50% 40%, transparent 40%, rgb(0 0 0 / .7)), linear-gradient(rgb(160 180 110 / .07) 1px, transparent 1px), linear-gradient(90deg, rgb(160 180 110 / .07) 1px, transparent 1px) !important;
  background-size: auto, 48px 48px, 48px 48px !important; }

/* lettering: stencil headings, mono readouts */
[data-part="titlebar.brand"], [data-part="info.title"], .for-you-title, [data-part="explore.shelf"] h2 { font-family: "Black Ops One", "Bahnschrift", sans-serif; font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
[data-part="titlebar.brand"] { color: #ffb000; }
[data-part="info.title"] { color: #f4f7e8; text-shadow: 0 0 10px rgb(255 176 0 / .25); }
[data-part="progress.time"], [data-part="tracklist.row.time"], [data-part="search"], [data-part="tracklist.tabs"], [data-part="info"] { font-family: "Share Tech Mono", Consolas, monospace; }

/* corner brackets on every panel */
[data-part="sidebar"], [data-part="nowplaying"], [data-part="dialog"], [data-part="menu"], [data-part="explore.card"] { __PANEL__ }

/* HUD cells: brackets on each, a label above each */
.lay-area:not(.lay-sidebar) { __PANEL__ position: relative; }
.lay-art::before, .lay-info::before, .lay-lyrics::before, .lay-view-nowplaying [data-cell="art"]::before, .lay-view-nowplaying [data-cell="info"]::before, .lay-view-nowplaying [data-cell="lyrics"]::before {
  position: absolute; top: 6px; left: 12px; font: 11px "Share Tech Mono", monospace; letter-spacing: .16em; color: #ffb000; opacity: .85; z-index: 1; }
.lay-art::before, .lay-view-nowplaying [data-cell="art"]::before { content: "TARGET LOCK"; }
.lay-info::before, .lay-view-nowplaying [data-cell="info"]::before { content: "// INTEL"; }
.lay-lyrics::before, .lay-view-nowplaying [data-cell="lyrics"]::before { content: "// COMMS LOG"; }
.lay-info, .lay-view-nowplaying [data-cell="info"] { padding-top: 26px; text-align: left; }
/* the target: a reticle over the cover */
.lay-art, .lay-view-nowplaying [data-cell="art"] { display: grid; place-items: center; min-height: 0; padding: 28px 12px 12px; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { max-height: 100%; object-fit: contain; }
.lay-art::after, .lay-view-nowplaying [data-cell="art"]::after { content: ""; position: absolute; inset: 28px 12px 12px; pointer-events: none;
  background-image: radial-gradient(circle, transparent 0 23%, rgb(255 176 0 / .7) 23.3% 23.8%, transparent 24.1%),
    linear-gradient(90deg, transparent calc(50% - .5px), rgb(255 176 0 / .55) calc(50% - .5px) calc(50% + .5px), transparent calc(50% + .5px)),
    linear-gradient(transparent calc(50% - .5px), rgb(255 176 0 / .55) calc(50% - .5px) calc(50% + .5px), transparent calc(50% + .5px));
  background-size: min(100%, 100vh) min(100%, 100vh), 100% 30%, 30% 100%; background-position: center; background-repeat: no-repeat; }
/* the comms log: the lyrics as a terminal feed */
.lay-lyrics, .lay-view-nowplaying [data-cell="lyrics"] { padding: 26px 8px 8px; min-height: 0; }
.lay-lyrics .lyrics, .lay-view-nowplaying [data-cell="lyrics"] .lyrics { width: 100% !important; height: 100% !important; padding: 30% 6px !important; text-align: left; }
.lay-lyrics .lyrics p.on, .lay-view-nowplaying [data-cell="lyrics"] .lyrics p.on { transform-origin: left center; } /* the sung line grows from its left edge */
.lay-lyrics [data-part="lyrics.line"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"] { font: 14px/1.5 "Share Tech Mono", Consolas, monospace; color: #a3ad8c; }
.lay-lyrics [data-part="lyrics.line"]::before, .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"]::before { content: "> "; color: #ffb000; }
.lay-lyrics [data-part="lyrics.line"][data-state~="active"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"][data-state~="active"] { color: #ffcf5a; }

/* the nav rail: mono labels, amber when active */
.nav-rail button { font: 10px "Share Tech Mono", Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
.nav-rail button.on { color: #ffb000; box-shadow: inset 3px 0 0 #ffb000; }

/* the playing row: an amber target marker */
[data-part="tracklist.row"][data-state~="active"] { background-color: rgb(255 176 0 / .12) !important; box-shadow: inset 3px 0 0 #ffb000; }

/* progress: a compass tape (ticks every 10 px, a long one every 50) */
[data-part="progress"] { position: relative; }
[data-part="progress.bar"] { background-image: linear-gradient(90deg, rgb(255 176 0 / .55) 0 1px, transparent 1px), linear-gradient(90deg, rgb(223 228 207 / .28) 0 1px, transparent 1px);
  background-size: 50px 12px, 10px 6px; background-repeat: repeat-x; background-position: 0 50%, 0 50%; }

/* covers: a thin amber frame and a scan line */
[data-part="art"] img { outline: 1px solid rgb(255 176 0 / .5); outline-offset: 4px; filter: saturate(.75) contrast(1.05); }

/* buttons: square, amber play */
[data-part="player.button.play"] { border-radius: 3px !important; background-color: #ffb000 !important; color: #1a1200 !important; box-shadow: 0 0 0 2px #0b0e08, 0 0 0 3px #ffb000 !important; }

/* nothing playing: a blinking NO SIGNAL */
[data-part="nowplaying.idle"] .logo { font-family: "Black Ops One", sans-serif; color: #ffb000; letter-spacing: .1em; text-transform: uppercase; }
[data-part="nowplaying.idle"] p { font-family: "Share Tech Mono", monospace; text-transform: uppercase; letter-spacing: .14em; color: #dfe4cf; animation: hud-blink 1.2s steps(2) infinite; }
@keyframes hud-blink { 50% { opacity: .3; } }

/* the mini player: a HUD strip for over games */
.lay-view-mini { font-family: "Share Tech Mono", Consolas, monospace; text-transform: uppercase; letter-spacing: .04em; }
.lay-view-mini [data-cell="art"] img { outline: 1px solid #ffb000; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { [data-part="nowplaying.idle"] p { animation: none; } }
""".replace('__PANEL__', PANEL_BRACKETS),
files={**ofl('blackops', 'BlackOpsOne-Regular.ttf'), **ofl('sharetech', 'ShareTechMono-Regular.ttf'),
       'assets/tick.wav': tone('tick'), 'assets/blip.wav': tone('blip'), 'assets/hum.wav': tone('hum'),
       'CREDITS.md': '# Credits\n\n- Fonts: Black Ops One by the Black-Ops Project Authors, and Share Tech Mono by Carrois Type Design (Ralph du Carrois); both SIL Open Font License 1.1 (assets/blackops/OFL.txt, assets/sharetech/OFL.txt).\n- Sounds: made for Voltage, CC0.\n'})

# ── 10. sumi-ink: watery black ink on washi, Japanese-inspired (the user, 2026-11-12). A hanging-scroll layout: the
#     lyrics written top to bottom, right to left on the left; the cover in a brushed enso; the list on the right.
#     Ink-wash mountains behind, a red hanko seal, an ink drop that blooms on a like. Font: Yuji Syuku (OFL, with kana
#     and kanji, so Japanese lyrics are brushed too). All art drawn here (CC0).
BRUSH = ('<filter id="brush" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="4"/>'
         '<feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>'
         '<filter id="bleed"><feGaussianBlur stdDeviation="3"/></filter>')
enso_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>' + BRUSH + '</defs>'
            '<path d="M128 26 A78 78 0 1 0 176 86" fill="none" stroke="#141414" stroke-width="22" stroke-linecap="round" opacity=".14" filter="url(#bleed)"/>'
            '<path d="M128 26 A78 78 0 1 0 176 86" fill="none" stroke="#141414" stroke-width="12" stroke-linecap="round" opacity=".9" filter="url(#brush)"/>'
            '<path d="M170 70 Q176 84 174 98" fill="none" stroke="#141414" stroke-width="5" stroke-linecap="round" opacity=".55" filter="url(#brush)"/></svg>' + chr(10))
mountains_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 500" preserveAspectRatio="none"><defs>' + BRUSH +
                 '<filter id="mist"><feGaussianBlur stdDeviation="10"/></filter><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
                 '<stop offset="0" stop-color="#141414" stop-opacity="1"/><stop offset="1" stop-color="#141414" stop-opacity="0"/></linearGradient></defs>'
                 '<path d="M0 300 L120 210 L210 260 L330 150 L470 250 L560 200 L700 280 L820 190 L960 260 L1080 170 L1220 250 L1340 200 L1460 260 L1600 220 V500 H0Z" fill="url(#fade)" opacity=".07" filter="url(#mist)"/>'
                 '<path d="M0 360 L160 280 L260 330 L420 230 L560 320 L690 270 L860 350 L1000 260 L1150 340 L1290 280 L1440 330 L1600 290 V500 H0Z" fill="url(#fade)" opacity=".11" filter="url(#mist)"/>'
                 '<path d="M0 430 L200 360 L330 400 L500 330 L640 410 L800 370 L960 420 L1120 350 L1300 410 L1460 380 L1600 400 V500 H0Z" fill="url(#fade)" opacity=".16" filter="url(#brush)"/></svg>' + chr(10))
hanko_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>' + BRUSH + '</defs>'
             '<rect x="6" y="6" width="52" height="52" rx="7" fill="#b7282e" filter="url(#brush)"/>'
             '<rect x="11" y="11" width="42" height="42" rx="4" fill="none" stroke="#f4efe4" stroke-width="2" opacity=".8"/>'
             '<text x="32" y="44" text-anchor="middle" font-family="Yu Mincho, MS Mincho, serif" font-size="32" font-weight="700" fill="#f4efe4">' + chr(0x97F3) + '</text></svg>' + chr(10))
stroke_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 40" preserveAspectRatio="none"><defs>' + BRUSH + '</defs>'
              '<path d="M8 24 C80 14 200 12 300 18 S380 26 392 20" fill="none" stroke="#141414" stroke-width="9" stroke-linecap="round" opacity=".85" filter="url(#brush)"/></svg>' + chr(10))
wash_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60" preserveAspectRatio="none"><defs>' + BRUSH + '<filter id="soft"><feGaussianBlur stdDeviation="4"/></filter></defs>'
            '<path d="M6 30 C60 8 340 6 394 28 C340 54 60 54 6 30Z" fill="#141414" opacity=".14" filter="url(#soft)"/></svg>' + chr(10))
blot_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>' + BRUSH + '<filter id="wet"><feGaussianBlur stdDeviation="6"/></filter></defs>'
            '<circle cx="100" cy="100" r="70" fill="#141414" opacity=".25" filter="url(#wet)"/><circle cx="100" cy="100" r="46" fill="#141414" opacity=".85" filter="url(#brush)"/>'
            '<circle cx="160" cy="62" r="8" fill="#141414" opacity=".7" filter="url(#brush)"/><circle cx="44" cy="150" r="5" fill="#141414" opacity=".6" filter="url(#brush)"/></svg>' + chr(10))
SUMI_HOME = {
    'areas': ['lyr art list', 'lyr info list', 'lyr prog list', 'lyr bar list'],
    'columns': 'minmax(180px, 280px) 1fr minmax(280px, 340px)', 'rows': 'minmax(0, 1fr) auto 36px 72px',
    'place': {'lyr': 'lyrics', 'art': 'art', 'info': 'info', 'prog': 'progress', 'bar': 'player', 'list': 'sidebar'},
    'resizable': ['lyr', 'list'],
    'below': {'1000px': {'areas': ['art list', 'info list', 'prog list', 'bar list'], 'columns': '1fr minmax(260px, 320px)', 'rows': 'minmax(0, 1fr) auto 36px 72px',
                         'place': {'art': 'art', 'info': 'info', 'prog': 'progress', 'bar': 'player', 'list': 'sidebar'}}}}
write('sumi-ink', {
    'id': 'sumi-ink', 'name': 'Sumi Ink', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'light',
    'description': 'Watery black ink on washi: lyrics written down a hanging scroll, the cover in a brushed enso, ink-wash mountains, a red hanko seal.',
    'fonts': [{'family': 'Yuji Syuku', 'src': 'assets/yujisyuku/YujiSyuku-Regular.ttf'}],
    'tokens': {'color.bg': '#f4efe4', 'color.text': '#141414', 'color.text-dim': '#4a4640', 'color.text-strong': '#000000',
               'color.text-soft': '#26231f', 'color.text-muted': '#3b3732', 'color.surface': 'rgba(248, 244, 235, .78)',
               'color.border': 'rgba(20, 20, 20, .16)', 'color.ink': '#141414', 'color.shade': '#5c564d', 'color.knob': '#f4efe4',
               'color.focus': '#141414', 'color.placeholder': '#e2dccf', 'color.select-bg': '#e6dfd0', 'color.mini-solid': '#f4efe4',
               'color.media-bg': '#e9e3d6', 'surface.menu': '#f8f4eb', 'surface.pop': '#f8f4eb', 'surface.drag': '#efe9dc',
               'surface.game': '#f4efe4', 'surface.tip': '#f8f4eb', 'color.danger': '#b7282e', 'color.error-text': '#a3201a',
               'color.ok': '#2c5e1a', 'color.warn': '#7a4a00', 'color.brand': '#141414', 'color.on-accent': '#f4efe4',
               'effect.blur': '6px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0',
               'shape.radius': '4px', 'shape.roundness': '0.4'},
    'accent': {'mode': 'fixed', 'color': '#141414'},
    'parts': {'progress': {'variant': 'line'}, 'tracklist': {'variant': 'dense'}},
    'supports': {'background': ['gradient']},
    'strings': {'nowplaying.idle': 'Silence. The page is empty', 'empty.queue': 'An empty scroll. Queue a song.', 'empty.search': 'Search',
                'library.liked': 'Treasured', 'explore.fromLiked': 'From what you treasure', 'note.liked': 'Kept'},
    'sounds': {'like': 'assets/chime.wav'},
    'overlay': True,
    'layout': {'home': SUMI_HOME,
               'nowplaying': {'areas': ['back info video', 'lyr art .', 'prog prog prog', 'ctl ctl vol'],
                              'columns': '1fr minmax(0, 460px) 1fr', 'rows': 'auto minmax(0, 1fr) 40px 88px',
                              'place': {'back': 'back', 'info': 'info', 'video': 'video', 'lyr': 'lyrics', 'art': 'art',
                                        'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}},
}, css=r"""
/* washi and ink-wash mountains, never the album's colours */
[data-part="background"] { background-color: #f4efe4 !important; opacity: 1 !important;
  background-image: url("assets/mountains.svg"), radial-gradient(90% 70% at 70% 20%, rgb(255 255 255 / .55), transparent 70%) !important;
  background-size: 100% 46%, auto !important; background-position: left bottom, 0 0 !important; background-repeat: no-repeat !important; }

/* brush lettering */
[data-part="titlebar.brand"], [data-part="info.title"], [data-part="lyrics.line"], .for-you-title, [data-part="tracklist.row.title"], [data-part="nowplaying.idle"] {
  font-family: "Yuji Syuku", "Yu Mincho", "MS Mincho", serif; }
[data-part="titlebar.brand"] { font-size: 18px; letter-spacing: .08em; padding-left: 30px;
  background-image: url("assets/hanko.svg"); background-repeat: no-repeat; background-size: 24px 24px; background-position: left center; }
[data-part="info.title"] { font-size: 30px; padding-bottom: 12px; color: #000;
  background-image: url("assets/stroke.svg"); background-repeat: no-repeat; background-size: 100% 12px; background-position: center bottom; }

/* the centre column is one open composition on the paper: no boxes, no blur */
.lay-art, .lay-info, .lay-progress, .lay-player, .lay-view-nowplaying .lay-area:not(.lay-lyrics) { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; backdrop-filter: none !important; }
[data-part="titlebar.brand"] { color: #141414; opacity: 1; }
[data-part="tracklist.row.artist"], [data-part="tracklist.row.time"] { color: #3b3732; opacity: 1; }
/* panels: rice paper, no hard edges */
[data-part="sidebar"], [data-part="nowplaying"] { box-shadow: 0 10px 30px rgb(60 50 30 / .08) !important; }
[data-part="tracklist.row"][data-state~="active"] { background-color: transparent !important;
  background-image: url("assets/wash.svg"); background-size: 100% 100%; background-repeat: no-repeat; }

/* the cover inside a brushed enso, the photo in ink tones */
.lay-art, .lay-view-nowplaying [data-cell="art"] { display: grid; place-items: center; min-height: 0;
  background-image: url("assets/enso.svg"); background-repeat: no-repeat; background-position: center; background-size: contain; }
.lay-art .art-part, .lay-view-nowplaying [data-cell="art"] .art-part { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; width: 100%; height: 100%; min-height: 0; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { width: auto !important; height: auto !important; max-width: 80% !important; max-height: 80% !important; aspect-ratio: 1; object-fit: cover; }
.lay-art { overflow: hidden; }
.lay-art img, .lay-view-nowplaying [data-cell="art"] img { border-radius: 50% !important; filter: grayscale(1) sepia(.15) contrast(1.08);
  box-shadow: 0 0 0 6px rgb(244 239 228 / .9) !important; }

/* the hanging scroll: the lyrics written top to bottom, right to left */
.lay-lyrics, .lay-view-nowplaying [data-cell="lyrics"] { min-height: 0; display: flex; justify-content: center; padding: 14px 6px;
  border-left: 1px solid rgb(20 20 20 / .2); border-right: 1px solid rgb(20 20 20 / .2);
  background-image: linear-gradient(#3a2a1c, #3a2a1c), linear-gradient(#3a2a1c, #3a2a1c); background-size: 100% 6px, 100% 6px; background-position: top, bottom; background-repeat: no-repeat; }
.lay-lyrics .lyrics, .lay-view-nowplaying [data-cell="lyrics"] .lyrics { writing-mode: vertical-rl; width: 100% !important; height: 100% !important; max-height: none;
  padding: 8px 45% !important; text-align: start; line-height: 1.9; }
.lay-lyrics [data-part="lyrics.line"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"] { font-size: 19px; margin: 0 5px; color: #141414; opacity: .5; }
.lay-lyrics [data-part="lyrics.line"][data-state~="active"], .lay-view-nowplaying [data-cell="lyrics"] [data-part="lyrics.line"][data-state~="active"] { opacity: 1; font-size: 22px; }

/* a like: an ink drop blooms */
[data-part="overlay"]::after { content: ""; position: absolute; left: 50%; top: 50%; width: 360px; height: 360px; margin: -180px 0 0 -180px;
  background-image: url("assets/blot.svg"); background-size: contain; background-repeat: no-repeat; opacity: 0; transform: scale(.2); }
:root[data-event="like"] [data-part="overlay"]::after { animation: ink-bloom 1.2s ease-out; }
@keyframes ink-bloom { 0% { opacity: 0; transform: scale(.2); } 25% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(1.5); } }
@media (prefers-reduced-motion: reduce) { :root[data-event="like"] [data-part="overlay"]::after { animation: none; } }

/* the player: an ink play button */
[data-part="player.button.play"] { background-color: #141414 !important; color: #f4efe4 !important; box-shadow: none !important; }
[data-part="nowplaying.idle"] { background-image: url("assets/enso.svg"); background-repeat: no-repeat; background-position: center top; background-size: 120px; padding-top: 130px; }
[data-part="nowplaying.idle"] .logo { color: #141414; text-shadow: none; }
""", files={**ofl('yujisyuku', 'YujiSyuku-Regular.ttf'), 'assets/enso.svg': enso_svg, 'assets/mountains.svg': mountains_svg,
            'assets/hanko.svg': hanko_svg, 'assets/stroke.svg': stroke_svg, 'assets/wash.svg': wash_svg, 'assets/blot.svg': blot_svg,
            'assets/chime.wav': tone('chime'),
            'CREDITS.md': '# Credits\n\n- Font: Yuji Syuku by the Yuji Project Authors (Kinuta Font Factory), SIL Open Font License 1.1 (assets/yujisyuku/OFL.txt).\n- Ink art and sounds: made for Voltage, CC0.\n'})
