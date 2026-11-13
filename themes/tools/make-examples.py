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
    import io
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32000)) for v in out))
    return buf.getvalue()


SVG = lambda body, vb='0 0 64 64': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>\n'

# ── 1. voltage: Voltage's own look, every value written out (the default is just a theme; a starting point to copy) ──
ref = (OUT / 'theme-reference.md').read_text(encoding='utf-8')
tokens = {}
for line in ref.splitlines():
    cells = [c.strip() for c in line.split('|')]
    if len(cells) > 5 and cells[1].startswith('`') and cells[4].startswith('`') and '.' in cells[1]:
        tokens[cells[1].strip('`')] = cells[4].strip('`')
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
               'color.brand': '#5fd7ff', 'color.brand-rgb': '95 215 255', 'color.on-accent': '#0c0c0c', 'color.knob': '#d0d0d0',
               'color.select-bg': '#1e3a44', 'surface.menu': '12 12 12', 'surface.pop': '16 16 16', 'surface.tip': '12 12 12',
               'effect.blur': '0px', 'effect.glow-size': '0px', 'effect.glow-alpha': '0%', 'accent.album-mix': '0', 'shape.radius': '0px', 'shape.k': '0',
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
''', files={'assets/volt-pixel.ttf': font('Volt Pixel')})

# ── 3. crt-green: an original green-phosphor terminal (a vault-computer feel, nothing copied) ──
write('crt-green', {
    'id': 'crt-green', 'name': 'CRT green', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'fonts': [{'family': 'Volt Pixel', 'src': 'assets/volt-pixel.ttf'}],
    'description': 'Green phosphor on a curved tube: vignette, scanlines, a faint flicker, terse tab names and relay clicks.',
    'tokens': {'color.bg': '#020f05', 'color.text': '#5dff7a', 'color.text-dim': '#2fa648', 'color.text-strong': '#a8ffb6',
               'color.text-soft': '#7dff94', 'color.text-muted': '#49d964', 'color.surface': '#03170a', 'color.border': '#1f6b30',
               'color.brand': '#5dff7a', 'color.brand-rgb': '93 255 122', 'color.on-accent': '#020f05', 'color.knob': '#5dff7a',
               'color.ink': '93 255 122', 'color.select-bg': '#0b3a17', 'color.focus': '#a8ffb6',
               'surface.menu': '3 20 9', 'surface.pop': '3 24 10', 'surface.tip': '3 20 9',
               'effect.blur': '0px', 'effect.glow-size': '8px', 'effect.glow-alpha': '45%', 'accent.album-mix': '0', 'shape.radius': '0px', 'shape.k': '0',
               'font.mono': '"Volt Pixel", "Cascadia Mono", monospace', 'font.body': '"Volt Pixel", "Cascadia Mono", monospace'},
    'accent': {'mode': 'fixed', 'color': '#5dff7a'},
    'parts': {'nav': {'variant': 'text'}, 'tracklist': {'variant': 'dense'}, 'progress': {'variant': 'blocks'}, 'player': {'variant': 'text'}, 'art': {'variant': 'cover'}},
    'strings': {'brand': 'VOLT-OS 1.0', 'nav.settings': 'SYS', 'nav.explore': 'MAP', 'nav.stats': 'STAT', 'nav.mini': 'MINI',
                'tab.search': 'SCAN', 'tab.library': 'DATA', 'tab.queue': 'RADIO', 'search.placeholder': 'ENTER QUERY',
                'empty.search': 'NO SIGNAL. ENTER A QUERY.', 'empty.queue': 'RADIO: NO STATIONS QUEUED',
                'search.busy': 'SCANNING...', 'player.prev': '<PREV', 'player.play': 'PLAY', 'player.next': 'NEXT>', 'nowplaying.idle': 'STANDBY'},
    'sounds': {'click': 'assets/tick.wav', 'navigate': 'assets/hum.wav', 'play': 'assets/blip.wav', 'pause': 'assets/blip.wav', 'error': 'assets/hum.wav'},
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
''', files={'assets/volt-pixel.ttf': font('Volt Pixel'), 'assets/tick.wav': tone('tick'), 'assets/blip.wav': tone('blip'), 'assets/hum.wav': tone('hum')})

# ── 4. pastel-goth: pink / lilac on black, a rounded font, little bats, stars and bows (original art) ──
bat = SVG('<path fill="#ff9ad5" d="M32 22c2-4 4-6 4-6l1 6c4-1 8 0 10 3 3-3 8-4 13-2-5 2-7 7-7 12-4-3-9-3-12 0-1-3-4-5-9-5s-8 2-9 5c-3-3-8-3-12 0 0-5-2-10-7-12 5-2 10-1 13 2 2-3 6-4 10-3l1-6s2 2 4 6z"/><circle cx="29" cy="29" r="1.6" fill="#1a0b1d"/><circle cx="35" cy="29" r="1.6" fill="#1a0b1d"/>')
star = SVG('<path fill="#d9b3ff" d="M32 6l6 18 18 2-14 11 5 19-15-10-15 10 5-19L8 26l18-2z"/>')
bow = SVG('<path fill="#ff9ad5" d="M32 30c-6-8-18-14-22-10s2 18 10 18c5 0 9-4 12-8zm0 0c6-8 18-14 22-10s-2 18-10 18c-5 0-9-4-12-8z"/><circle cx="32" cy="31" r="5" fill="#ffc7e8"/>')
skull = SVG('<path fill="#f3e6ff" d="M32 8c-12 0-20 8-20 19 0 6 3 10 7 13v7c0 2 2 3 4 3h18c2 0 4-1 4-3v-7c4-3 7-7 7-13 0-11-8-19-20-19z"/><circle cx="24" cy="28" r="5" fill="#2a1430"/><circle cx="40" cy="28" r="5" fill="#2a1430"/><path fill="#2a1430" d="M30 37h4l-2 4z"/><path fill="#ff9ad5" d="M20 10c-4-5-11-4-11 1s7 6 11 2zm0 0c3 2 6 1 6-1"/>')
write('pastel-goth', {
    'id': 'pastel-goth', 'name': 'Pastel goth', 'version': '1.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'Pink and lilac on black, a rounded font, round covers, little bats, stars and bows around the window.',
    'fonts': [{'family': 'Volt Round', 'src': 'assets/volt-round.ttf'}],
    'tokens': {'color.bg': '#120914', 'color.text': '#ffe6f4', 'color.text-dim': '#d8a9cc', 'color.text-strong': '#fff4fb',
               'color.text-soft': '#ffd9ee', 'color.text-muted': '#e9bfe0', 'color.surface': 'rgba(42, 16, 48, .55)', 'color.border': 'rgba(255, 154, 213, .22)',
               'color.brand': '#ff9ad5', 'color.brand-rgb': '255 154 213', 'color.on-accent': '#2a0f2a', 'color.knob': '#ffc7e8',
               'color.select-bg': '#3a1840', 'surface.menu': '30 12 34', 'surface.pop': '34 14 38', 'surface.tip': '30 12 34',
               'effect.blur': '18px', 'effect.glow-size': '16px', 'effect.glow-alpha': '45%', 'accent.album-mix': '0.35', 'shape.radius': '22px', 'shape.k': '1.6'},
    'accent': {'mode': 'fixed', 'color': '#ff9ad5'},
    'parts': {'art': {'variant': 'round'}, 'progress': {'variant': 'line'}},
    'strings': {'empty.queue': 'nothing queued yet... play something cute', 'nowplaying.idle': 'shhh, nothing playing', 'empty.search': 'search for something spooky (or sweet)'},
    'icons': {'heart': 'assets/bow.svg'},
    'overlay': True,
}, css='''
[data-part="titlebar.brand"], [data-part="info.title"] { font-family: "Volt Round", "Segoe UI", sans-serif; letter-spacing: .05em; }
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
''', files={'assets/volt-round.ttf': font('Volt Round', True), 'assets/bat.svg': bat, 'assets/star.svg': star, 'assets/bow.svg': bow, 'assets/skull.svg': skull})

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
               'color.brand': '#e0334d', 'color.brand-rgb': '224 51 77', 'color.on-accent': '#ffffff'},
    'modes': {
        'light': {'color.bg': '#f4f2f5', 'color.text': '#1d1b20', 'color.text-dim': '#5f5a66', 'color.text-strong': '#0d0c0f',
                  'color.text-soft': '#2a272e', 'color.text-muted': '#45414b', 'color.surface': 'rgba(255, 255, 255, .62)',
                  'color.border': 'rgba(20, 16, 28, .09)', 'color.ink': '20 16 28', 'color.shade': '120 110 130', 'color.knob': '#ffffff',
                  'color.focus': '#1d1b20', 'color.placeholder': '#e4e1e8', 'color.select-bg': '#f3d7dc', 'color.mini-solid': '#f4f2f5',
                  'color.media-bg': '#e9e6ec', 'surface.menu': '250 249 251', 'surface.pop': '252 251 253', 'surface.drag': '245 243 247',
                  'surface.game': '244 242 245', 'surface.tip': '250 249 251', 'color.danger': '#c62828', 'color.error-text': '#b3261e',
                  'color.ok': '#1e7d3a', 'color.warn': '#9a5b00', 'color.brand': '#b8233c', 'color.brand-rgb': '184 35 60'},
        'dark': {'color.bg': '#151417', 'color.surface': 'rgba(40, 38, 44, .6)', 'color.border': 'rgba(255, 255, 255, .08)'}},
    'accent': {'mode': 'fixed', 'color': '#e0334d'},
    'parts': {'player': {'variant': 'compact'}, 'progress': {'variant': 'line'}, 'tracklist': {'variant': 'dense'}},
    'layout': {'home': {
        'areas': ['list art', 'list info', 'prog prog', 'bar bar'],
        'columns': 'minmax(300px, 380px) 1fr', 'rows': '1fr auto 36px 72px',
        'place': {'list': 'sidebar', 'art': 'art', 'info': 'info', 'prog': 'progress', 'bar': 'player'},
        'below': {'900px': {'areas': ['list', 'prog', 'bar'], 'columns': '1fr', 'rows': '1fr 36px 72px',
                            'place': {'list': 'sidebar', 'prog': 'progress', 'bar': 'player'}}}}},
}, css='''
[data-part="art"] { display: flex; align-items: center; justify-content: center; }
[data-part="art"] img { box-shadow: 0 24px 60px rgb(var(--shade) / .35); border-radius: 12px; }
[data-part="info.title"] { font-weight: 700; }
html[data-appearance="light"] [data-part="tracklist.row.artist"], html[data-appearance="light"] [data-part="tracklist.row.time"] { color: rgb(var(--ink) / .72); }
''')
