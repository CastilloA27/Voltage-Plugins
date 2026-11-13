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
    '<rect x="16" y="36" width="68" height="28" rx="6" fill="#1b1b1b" stroke="#e0a82e" stroke-width="3"/><text x="50" y="58" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="20" fill="#ffd966">BAR</text>',
    # lemon
    '<ellipse cx="50" cy="52" rx="30" ry="22" fill="#ffe14a" stroke="#b39a00" stroke-width="3"/><path d="M20 52l-6-2M80 52l6-2" stroke="#b39a00" stroke-width="4" stroke-linecap="round"/><path d="M40 42c4-3 10-4 16-3" stroke="#fff6b8" stroke-width="4" fill="none" stroke-linecap="round"/>',
    # crown
    '<path d="M18 70l-4-38 20 18 16-26 16 26 20-18-4 38z" fill="#ffc21a" stroke="#a86a00" stroke-width="3" stroke-linejoin="round"/><rect x="18" y="70" width="64" height="10" rx="3" fill="#e0a82e"/><circle cx="50" cy="58" r="6" fill="#d81b2a"/><circle cx="32" cy="62" r="4" fill="#2fb7ff"/><circle cx="68" cy="62" r="4" fill="#2fb7ff"/>',
]
reel_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 800"><defs><linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e8d6b0"/></linearGradient></defs>'
            + ''.join(f'<g transform="translate(0 {i * TILE})">{tile(b)}</g>' for i, b in enumerate(SYMBOLS)) + '</svg>\n')
coin_svg = SVG('<circle cx="32" cy="32" r="26" fill="#ffc21a" stroke="#a86a00" stroke-width="4"/><circle cx="32" cy="32" r="17" fill="none" stroke="#fff0a0" stroke-width="3"/><path d="M27 22h10v20H27z" fill="#e0a82e"/>')
REEL = 180  # px per symbol on the screen: 5 reels x 3 rows = 900 x 540
write('jackpot', {
    'id': 'jackpot', 'name': 'Jackpot', 'version': '2.0.0', 'author': 'Voltage', 'extends': 'voltage', 'appearance': 'dark',
    'description': 'A video slot: a 5 x 3 symbol screen with the cover in the middle, reels that spin on every new song, paylines, coins and JACKPOT when you like a song.',
    'fonts': [{'family': 'Bungee', 'src': 'assets/bungee/Bungee-Regular.ttf'}],
    'tokens': {'color.bg': '#12030a', 'color.text': '#fff4e0', 'color.text-dim': '#e8c9a0', 'color.text-strong': '#ffffff',
               'color.surface': 'rgba(52, 6, 16, .78)', 'color.border': 'rgba(255, 204, 51, .38)', 'color.brand': '#ffcc33',
               'color.on-accent': '#2a0a00', 'color.knob': '#ffe28a', 'color.select-bg': '#4a0c18', 'surface.menu': '#28050c',
               'surface.pop': '#2e060e', 'surface.tip': '#28050c', 'effect.blur': '10px', 'effect.glow-size': '16px', 'effect.glow-alpha': '55%',
               'accent.album-mix': '0.2', 'shape.radius': '18px'},
    'accent': {'mode': 'fixed', 'color': '#ffcc33'},
    'parts': {'progress': {'variant': 'blocks'}, 'art': {'variant': 'cover'}},
    'supports': {'background': ['cover', 'gradient', 'black']},  # a music video behind the cabinet fights the reels
    'strings': {'player.next': 'Spin', 'player.prev': 'Back', 'player.shuffle': 'Roll', 'library.liked': 'Jackpots',
                'empty.queue': 'Insert a song to play', 'nowplaying.idle': 'Insert a song', 'nav.stats': 'Win history',
                'explore.fromLiked': 'Your jackpots', 'note.liked': 'BIG WIN!', 'menu.playNow': 'Spin it', 'menu.playNext': 'Spin next'},
    'sounds': {'skip': 'assets/reel.wav', 'play': 'assets/bell.wav', 'like': 'assets/coin.wav', 'click': 'assets/tick.wav', 'navigate': 'assets/tick.wav'},
    'overlay': True, 'plugin': 'reels',
    'layout': {
        'nowplaying': {
            'areas': ['back info info info info info video', 'l r1 r2 art r4 r5 r', 'prog prog prog prog prog prog prog', 'ctl ctl ctl ctl ctl vol vol'],
            'columns': f'1fr repeat(5, {REEL}px) 1fr', 'rows': f'auto {REEL * 3}px 48px 96px',
            'place': {'back': 'back', 'info': 'info', 'video': 'video', 'l': 'spacer', 'r': 'spacer',
                      'r1': 'slot:reel1', 'r2': 'slot:reel2', 'art': 'art', 'r4': 'slot:reel4', 'r5': 'slot:reel5',
                      'prog': 'progress', 'ctl': 'player', 'vol': 'volume'},
            'below': {'1100px': {'areas': ['back info video', 'r2 art r4', 'prog prog prog', 'ctl ctl vol'],
                                 'columns': f'1fr {REEL}px 1fr', 'rows': f'auto {REEL * 3}px 48px 96px',
                                 'place': {'back': 'back', 'info': 'info', 'video': 'video', 'r2': 'slot:reel2', 'art': 'art', 'r4': 'slot:reel4',
                                           'prog': 'progress', 'ctl': 'player', 'vol': 'volume'}}}},
        'mini': {'areas': ['art meta ctl'], 'columns': '64px 1fr auto', 'place': {'art': 'art', 'meta': 'info', 'ctl': 'player'}},
    },
}, css=r"""
/* marquee lettering */
[data-part="titlebar.brand"], [data-part="info.title"], .for-you-title { font-family: "Bungee", "Bahnschrift", sans-serif; letter-spacing: .04em; }
[data-part="titlebar.brand"] { color: #ffcc33; text-shadow: 0 0 10px rgb(255 204 51 / .7); }
[data-part="info.title"] { color: #ffd966; text-shadow: 0 0 12px rgb(255 190 40 / .75), 0 2px 0 #7a3b00; }

/* the screen: five reels of symbols (one strip image, each reel at its own offset); the cover is the centre symbol */
.lay-view-nowplaying { column-gap: 0; }
.lay-view-nowplaying [data-cell^="slot:reel"], .lay-view-nowplaying [data-cell="art"] {
  /* longhands: a shorthand mixing var() with other background properties doesn't survive the cleaner */
  background-image: url("assets/reel.svg"); background-size: 180px 1440px; background-repeat: repeat-y; background-position-x: 0; background-position-y: var(--o); position: relative; overflow: hidden;
  border-top: 5px solid #e0a82e; border-bottom: 5px solid #e0a82e;
  box-shadow: inset 0 26px 30px -10px rgb(0 0 0 / .75), inset 0 -26px 30px -10px rgb(0 0 0 / .75), inset -1px 0 0 #7a4a00, 0 0 26px rgb(255 190 40 / .25); }
.lay-view-nowplaying [data-cell="slot:reel1"] { --o: calc(var(--roll-1, 0) * -180px); border-radius: 16px 0 0 16px; border-left: 5px solid #e0a82e; }
.lay-view-nowplaying [data-cell="slot:reel2"] { --o: calc(var(--roll-2, 3) * -180px); }
.lay-view-nowplaying [data-cell="art"] { --o: calc(var(--roll-3, 5) * -180px); padding: 180px 0; display: block; }
.lay-view-nowplaying [data-cell="slot:reel4"] { --o: calc(var(--roll-4, 2) * -180px); }
.lay-view-nowplaying [data-cell="slot:reel5"] { --o: calc(var(--roll-5, 7) * -180px); border-radius: 0 16px 16px 0; border-right: 5px solid #e0a82e; }
.lay-view-nowplaying [data-cell="art"] .art-part { display: block; width: 180px; height: 180px; }
.lay-view-nowplaying [data-cell="art"] img { width: 180px !important; height: 180px !important; max-width: none; border-radius: 0; object-fit: cover;
  box-shadow: inset 0 0 0 4px #ffcc33, 0 0 24px rgb(255 204 51 / .6); }

/* a new song: the five reels spin and stop left to right */
@keyframes spin-reel { from { background-position-y: calc(var(--o) - 2880px); filter: blur(2px); } 85% { filter: blur(0); } to { background-position-y: var(--o); } }
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
  background: linear-gradient(90deg, #ffe680, #ff9900, #ffe680); box-shadow: 0 0 14px 4px rgb(255 190 40 / .8); opacity: 0; pointer-events: none; }
:root[data-event="like"] [data-cell^="slot:reel"]::after, :root[data-event="like"] [data-cell="art"]::after { animation: payline 1.2s ease-out; }
@keyframes payline { 10%, 30%, 50%, 70% { opacity: 1; } 20%, 40%, 60% { opacity: .3; } 100% { opacity: 0; } }

/* marquee bulbs around the window, chasing */
[data-part="overlay"] {
  background:
    radial-gradient(circle, #ffe9a0 0 3px, #ffb800 4px, transparent 6px) 0 4px / 26px 14px repeat-x,
    radial-gradient(circle, #ffe9a0 0 3px, #ffb800 4px, transparent 6px) 13px calc(100% - 4px) / 26px 14px repeat-x;
  animation: bulbs 1.2s steps(2) infinite;
}
@keyframes bulbs { to { background-position: 26px 4px, 39px calc(100% - 4px); } }
[data-part="overlay"]::before { content: ""; position: absolute; inset: -20% 0 0; background: url("assets/coin.svg") 0 0 / 46px 46px; opacity: 0;
  -webkit-mask: linear-gradient(transparent, #000 20%, #000 70%, transparent); mask: linear-gradient(transparent, #000 20%, #000 70%, transparent); }
:root[data-event="like"] [data-part="overlay"]::before { animation: coins 1.2s linear; }
@keyframes coins { 0% { opacity: 0; background-position: 0 -200px, 23px -120px; } 15% { opacity: .9; } 85% { opacity: .9; } 100% { opacity: 0; background-position: 0 600px, 23px 700px; } }
[data-part="overlay"]::after { content: "BIG WIN"; position: absolute; inset: 0; display: grid; place-items: center; font: 900 min(13vw, 140px) "Bungee", sans-serif;
  color: #ffd966; text-shadow: 0 0 30px #ff9900, 0 6px 0 #7a3b00; opacity: 0; }
:root[data-event="like"] [data-part="overlay"]::after { animation: bigwin 1.2s ease-out; }
:root[data-event="like"] [data-part="overlay"] { animation-duration: .25s; }
@keyframes bigwin { 0% { opacity: 0; transform: scale(.6); } 20% { opacity: 1; transform: scale(1.08); } 35%, 60% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.15); } }
@media (prefers-reduced-motion: reduce) { [data-part="overlay"] { animation: none; } }

/* progress: a bonus meter of bulbs */
.prog-blocks { justify-content: space-between; }
.prog-blocks i { flex: 0 0 14px; width: 14px; height: 14px; border-radius: 50%; background: #4a1a10; box-shadow: inset 0 0 3px rgb(0 0 0 / .8); }
.prog-blocks i.on { background: radial-gradient(circle at 40% 35%, #fff6c8, #ffb800 60%, #b36b00); box-shadow: 0 0 8px #ffb800; }
/* arcade buttons: play (spin) green, next amber, previous red */
[data-part="player.button.play"] { background: radial-gradient(circle at 40% 30%, #8dff9a, #1fa83a 60%, #0b5a1c) !important; box-shadow: 0 0 0 4px #e0a82e, 0 0 18px rgb(80 255 120 / .6) !important; color: #032a0c !important; }
[data-part="player.button.next"] { background: radial-gradient(circle at 40% 30%, #ffe38a, #f0a000 60%, #7a4a00) !important; color: #2a1500 !important; box-shadow: 0 0 0 3px #e0a82e !important; }
[data-part="player.button.prev"] { background: radial-gradient(circle at 40% 30%, #ff9a8a, #d0221a 60%, #6a0a06) !important; color: #2a0300 !important; box-shadow: 0 0 0 3px #e0a82e !important; }
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
  background: radial-gradient(circle at 35% 30%, #ff9a8a, #d0221a 55%, #5a0806); box-shadow: 0 4px 10px rgb(0 0 0 / .6); transform-origin: 24px 230px; }
.lay-view-nowplaying [data-area="r"] { min-height: 260px; }
@keyframes lever { 0% { transform: none; } 30% { transform: rotateX(70deg) scaleY(.35); } 100% { transform: none; } }
@keyframes lever-ball { 0% { transform: none; } 30% { transform: translateY(150px); } 100% { transform: none; } }
:root[data-event="skip"] [data-area="r"]::before, :root[data-event="track-change"] [data-area="r"]::before { animation: lever .7s ease-in-out; }
:root[data-event="skip"] [data-area="r"]::after, :root[data-event="track-change"] [data-area="r"]::after { animation: lever-ball .7s ease-in-out; }

/* the home screen: the cover in a gold reel window, the playing row lit gold */
[data-part="nowplaying"] .art { box-shadow: 0 0 0 5px #e0a82e, 0 0 0 9px #5a1020, 0 0 30px rgb(255 190 40 / .45) !important; }
[data-part="tracklist.row"][data-state~="active"] { background: linear-gradient(90deg, rgb(255 204 51 / .22), transparent); box-shadow: inset 3px 0 0 #ffcc33; }
/* the mini player is too small for marquee bulbs */
[data-part="app"][data-state~="mini"] [data-part="overlay"] { background: none; animation: none; }
/* the mini player: one reel window */
.lay-view-mini [data-cell="art"] { border-radius: 10px; box-shadow: inset 0 0 0 3px #e0a82e; padding: 4px; background: #2a0610; }
""", files={**ofl('bungee', 'Bungee-Regular.ttf'), 'assets/reel.svg': reel_svg, 'assets/coin.svg': coin_svg,
            'assets/reel.wav': tone('reel'), 'assets/bell.wav': tone('bell'), 'assets/coin.wav': tone('coin'), 'assets/tick.wav': tone('tick'),
            'CREDITS.md': '# Credits\n\n- Font: Bungee by the Bungee Project Authors (David Jonathan Ross), SIL Open Font License 1.1 (assets/bungee/OFL.txt).\n- Symbols, coins and sounds: made for Voltage, CC0.\n- Purely a look: no betting, credits or odds.\n'})
