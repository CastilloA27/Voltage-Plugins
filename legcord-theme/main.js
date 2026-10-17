// Legcord live theme: writes Voltage's current colours into Legcord's Quick CSS file, which Legcord reloads by itself.
// The colours are registered CSS properties with a transition, so Discord fades between songs instead of jumping.
// Only a marked block at the end of the file is ours; everything else in the file is left exactly as it was.
const FILE = '%APPDATA%/legcord/quickCss.css';
const START = '{} /* >>> Voltage live colours';
const END = '/* <<< Voltage live colours */';
const PURPLE = { accent: '#a020f0', c1: '#2a0a4a', c2: '#12051f' };

let settings = { style: 'voltage', strength: 30, idle: 'purple' };
let colours = null; // null = nothing playing
let gaming = false; // Voltage's game mode: the cover stays, but nothing moves (no drift, no fade) while a game is in front
let bg = { style: 'gradient', image: null }; // Voltage's background (Settings > Appearance) and its baked cover
let timer = null;
let seq = 0; // drift animation name counter
let fadeFrom = null, fadeTimer = null; // previous cover, during a song change
let warned = false;
// Voltage's active theme (Settings > Appearance > Theme): Discord follows its background, panel tint and opacity, glow and
// font. Voltage's own theme = the values below.
let theme = { bg: [0, 0, 0], panel: [0, 0, 0], panelAlpha: 0.42, glowSize: 12, glowAlpha: 40, font: null };

const safe = (c) => (/^[#a-zA-Z0-9(),.%\s-]{3,60}$/.test(c || '') ? c : null);

// `{}` first: an unfinished rule above (e.g. bare declarations) would otherwise swallow our first rule.
function block(c) {
  const A = 'var(--voltage-accent)';
  const mix = (with_, pct) => `color-mix(in oklab, ${A} ${100 - pct}%, ${with_})`;
  const alpha = (pct) => `color-mix(in srgb, ${A} ${pct}%, transparent)`;
  const vars = {
    '--brand-500': A, '--blurple-50': A, '--background-brand': A, '--control-primary-background-default': A,
    '--badge-primary-background': A, '--checkbox-background-selected-default': A, '--radio-background-selected-default': A,
    '--radio-foreground-active': A, '--switch-background-selected-default': A, '--switch-thumb-icon-active': A,
    '--input-border-active': A, '--progressbar-indicator-background': A, '--reaction-border-reacted-default': A,
    '--togglebutton-border-selected': A, '--interactive-accent-background-hover': A, '--interactive-accent-background-selected': A,
    '--chart-brand': A, '--illo-blue-40': A,
    '--brand-530': mix('black', 8), '--brand-560': mix('black', 15), '--brand-600': mix('black', 22), '--brand-630': mix('black', 30),
    '--brand-660': mix('black', 38), '--brand-700': mix('black', 46), '--brand-730': mix('black', 54), '--brand-760': mix('black', 62),
    '--brand-800': mix('black', 70), '--brand-830': mix('black', 76), '--brand-860': mix('black', 82), '--brand-900': mix('black', 88),
    '--blurple-59': mix('black', 15), '--button-outline-brand-border-active': mix('black', 15),
    '--control-primary-background-hover': mix('black', 10), '--control-primary-background-active': mix('black', 20),
    '--brand-460': mix('white', 12), '--brand-430': mix('white', 20), '--brand-400': mix('white', 28), '--brand-360': mix('white', 38),
    '--brand-345': mix('white', 42), '--brand-330': mix('white', 46), '--brand-300': mix('white', 52), '--brand-260': mix('white', 60),
    '--brand-230': mix('white', 66), '--brand-200': mix('white', 72), '--brand-160': mix('white', 80), '--brand-130': mix('white', 86),
    '--brand-100': mix('white', 92), '--blurple-29': mix('white', 38), '--blurple-31': mix('white', 35),
    '--control-brand-foreground': mix('white', 40), '--control-brand-foreground-new': mix('white', 40),
    '--text-link': mix('white', 35), '--mention-foreground': mix('white', 45),
    '--mention-background': alpha(24), '--message-highlight-background-default': alpha(16), '--message-highlight-background-hover': alpha(12),
    '--reaction-background-reacted-default': alpha(24), '--reaction-background-reacted-hover': alpha(30),
    '--togglebutton-background-selected': alpha(16), '--togglebutton-background-selected-hover': alpha(24),
    '--polls-voted-fill': alpha(20), '--datepicker-range-background-default': alpha(40), '--background-code': alpha(8),
  };
  for (const p of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]) vars[`--brand-${String(p).padStart(2, '0')}a`] = alpha(p);
  if (settings.style === 'voltage') Object.assign(vars, voltageSurfaces());
  const decl = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const look = settings.style === 'voltage' ? voltageLook() : '';
  const tint = settings.style === 'gradient' ? `
#app-mount::after {
  content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 10000; mix-blend-mode: screen;
  opacity: ${Math.max(0, Math.min(100, Number(settings.strength) || 30)) / 100};
  background: radial-gradient(ellipse at 10% 0%, var(--voltage-c2), transparent 65%),
              radial-gradient(ellipse at 95% 100%, var(--voltage-accent), transparent 60%),
              radial-gradient(ellipse at 60% 40%, var(--voltage-c1), transparent 75%);
}` : '';
  return `${START} (Voltage plugin "Legcord live theme": this block is rewritten on every song) */
@property --voltage-accent { syntax: '<color>'; inherits: true; initial-value: #a020f0; }
@property --voltage-c1 { syntax: '<color>'; inherits: true; initial-value: #000000; }
@property --voltage-c2 { syntax: '<color>'; inherits: true; initial-value: #000000; }
:root:root {
  --voltage-accent: ${c.accent}; --voltage-c1: ${c.c1}; --voltage-c2: ${c.c2};
  transition: --voltage-accent 1.4s ease, --voltage-c1 1.4s ease, --voltage-c2 1.4s ease;
}
:root:root, .visual-refresh.visual-refresh, .theme-dark.theme-dark, .theme-darker.theme-darker, .theme-midnight.theme-midnight, .theme-light.theme-light {
${decl}
}${tint}${look}
${END}`;
}

// ── "Voltage look": Discord dressed like Voltage while it plays: pitch black, the album gradient glowing through
// dark glass surfaces, accent borders and Voltage's neon glow on the brand controls. ──
// panel opacities below are tuned for Voltage's 0.42 glass; another theme scales them by its own opacity
const glass = (a) => `rgba(${theme.panel.join(', ')}, ${Math.min(0.97, a * (theme.panelAlpha / 0.42)).toFixed(3)})`;
const bgCss = () => `rgb(${theme.bg.join(' ')})`;
const glow = (pct) => `0 0 ${theme.glowSize}px color-mix(in srgb, var(--voltage-accent) ${Math.round(pct * theme.glowAlpha / 40)}%, transparent)`;
const tinted = (pct, a) => `color-mix(in srgb, color-mix(in oklab, var(--voltage-c1) ${pct}%, ${bgCss()}) ${a}%, transparent)`;
function voltageSurfaces() {
  const A = 'var(--voltage-accent)';
  const edge = (pct) => `color-mix(in srgb, ${A} ${pct}%, transparent)`;
  return {
    // the window's layers: see-through so the gradient behind them shows (like Voltage's glass panels)
    // the outermost layer is clear: stacked translucent layers would add up to near-black (3 x 0.5 = 87%)
    // Voltage's .glass is 0.42 black plus backdrop saturate(1.4); lighter values here look the same without the backdrop cost
    '--app-frame-background': glass(0.3), '--background-base-lowest': 'transparent', '--background-base-lower': glass(0.34),
    '--background-base-low': glass(0.3), '--chat-background': 'transparent', '--chat-background-default': 'transparent',
    '--home-background': 'transparent', '--panel-bg': glass(0.3), '--bg-surface-raised': tinted(14, 92),
    '--guild-profile-banner-background-default': glass(0.4),
    // things that float over content stay nearly solid, so text on them reads well
    '--background-surface-high': glass(0.38), '--background-surface-higher': tinted(18, 95), '--background-surface-highest': tinted(20, 96),
    '--modal-background': tinted(14, 96), '--modal-footer-background': tinted(10, 96), '--card-background-default': tinted(12, 70),
    '--background-secondary-alt': tinted(12, 80), '--background-accent': edge(30),
    '--input-background-default': 'rgba(255, 255, 255, .05)',
    // hover / selected states and borders in the accent
    '--background-mod-subtle': edge(10), '--background-mod-normal': edge(16), '--background-mod-strong': edge(22), '--background-mod-muted': edge(7),
    '--border-subtle': edge(16), '--border-muted': edge(12), '--border-normal': edge(26), '--border-strong': edge(40), '--border-focus': A,
    '--card-border-default': edge(20), '--chat-border': edge(18), '--app-frame-border': edge(22),
    '--scrollbar-auto-thumb': edge(45), '--scrollbar-thin-thumb': edge(45), '--scrollbar-auto-scrollbar-color-thumb': edge(45),
    '--interactive-text-active': '#ffffff',
  };
}
function voltageLook() {
  const k = Math.max(0, Math.min(100, Number(settings.strength) || 30)) / 30; // 30% = Voltage's own look
  const p = (n) => Math.round(Math.min(100, n * k));
  // Voltage's own background layers (styles.css): .bg gradient (c1 top-left, c2 bottom-right; 60% for the gradient style,
  // 25% under a cover), .bg-cover = the same baked blurred cover Voltage shows, 12% oversized and drifting at 20 updates/s,
  // .bg-cover-shade = vignette + grain. Black = no gradient at all.
  const style = bg.style || 'gradient';
  const g = style === 'black' ? 0 : style === 'cover' && bg.image ? 25 : 60;
  const image = style === 'cover' && bg.image && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(bg.image) ? bg.image : null;
  // drift in step with Voltage: both use phase = wall clock mod 80 s. A new animation name per write restarts it at that
  // phase (Legcord applies the file ~0.7 s after we write it).
  seq += 1;
  const phase = (((Date.now() + 700) / 1000) % 80).toFixed(2);
  // song change: the previous cover stays underneath (html::before) while the new one fades in over it, like Voltage's
  // cross-fade. Swapping the image in place showed as a one-frame flash of the whole window.
  const prev = !gaming && fadeFrom && fadeFrom !== image ? fadeFrom : null;
  // Drift by moving the image inside a fixed layer (a repaint), 4 times a second. Measured in the user's Legcord
  // 2026-10-15: moving a transformed full-window layer made Discord drop content tiles for a frame (~1 flash every 2 s);
  // repainting at Voltage's 20/s cost +50-70% of a core (Discord's page is heavy); 4/s costs ~1% and the drift is
  // so slow (~5 px/s) that it still reads as smooth. Same wall-clock phase as Voltage, so both drift together.
  const drift = gaming ? 'none' : `voltage-drift-${seq} 40s steps(160) -${phase}s infinite alternate`;
  const cover = image ? `${prev ? `
html::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: url("${prev}") 50% 50% / 134% 134% no-repeat; animation: ${drift};
}` : ''}
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: url("${image}") 50% 50% / 134% 134% no-repeat;
  animation: ${drift}${prev ? `, voltage-in-${seq} 1.2s ease both` : ''};
}
@keyframes voltage-in-${seq} { from { opacity: 0; } to { opacity: 1; } }
@keyframes voltage-drift-${seq} { from { background-size: 134% 134%; background-position: 42% 45%; } to { background-size: 154% 154%; background-position: 58% 56%; } }
body::after {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse 85% 75% at 58% 42%, rgba(0, 0, 0, .18), rgba(0, 0, 0, .62) 100%); /* no grain here: ~8% CPU in Discord */
}` : '';
  return `
html, body {
  background:
    radial-gradient(120% 90% at 15% 0%, color-mix(in oklab, var(--voltage-c1) ${p(g)}%, transparent), transparent 62%),
    radial-gradient(100% 100% at 100% 100%, color-mix(in oklab, var(--voltage-c2) ${p(g)}%, transparent), transparent 58%),
    ${bgCss()} !important;
}
#app-mount { position: relative; z-index: 1; background: transparent !important; }${cover}
/* Voltage's neon glow: filled brand buttons, the selected server, focus rings */
[class*="colorBrand"], [class*="lookFilled"][class*="colorBrand"], [class*="brand_"][class*="button"] {
  box-shadow: ${glow(45)} !important;
}
[class*="selected"] > [class*="wrapper"] [class*="blobContainer"], [class*="listItem"] [class*="selected"] [class*="childWrapper"] {
  box-shadow: ${glow(40)};
}
[class*="pill"] [class*="item"] { background: var(--voltage-accent) !important; box-shadow: 0 0 10px var(--voltage-accent); }
:focus-visible { outline-color: var(--voltage-accent) !important; }
::selection { background: color-mix(in srgb, var(--voltage-accent) 45%, transparent); }${theme.font ? `
:root:root { --font-primary: ${theme.font}; --font-display: ${theme.font}; --font-headline: ${theme.font}; }` : ''}`;
}

// Removes our block and exactly the separator we added, so turning the plugin off gives back the file byte for byte.
const SEP = '\n\n';
function strip(text) {
  const i = text.indexOf(START);
  if (i < 0) return text;
  const j = text.indexOf(END, i);
  let head = text.slice(0, i);
  if (head.endsWith(SEP)) head = head.slice(0, -SEP.length);
  let tail = j < 0 ? '' : text.slice(j + END.length);
  if (tail.startsWith('\n')) tail = tail.slice(1);
  return head + tail;
}

async function write(b) {
  try {
    const cur = (await voltage.call('file.read', { path: FILE })) ?? '';
    const base = strip(cur);
    const next = b ? `${base}${SEP}${b}\n` : base;
    if (next !== cur) await voltage.call('file.write', { path: FILE, text: next });
  } catch (e) {
    if (!warned) { warned = true; voltage.notify(`couldn't update Legcord (${e.message}). Is Legcord installed?`); }
    voltage.log(String(e));
  }
}

function current() {
  if (colours) return colours;
  return settings.idle === 'purple' ? PURPLE : null;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { const c = current(); write(c ? block(c) : null); }, 350);
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; schedule(); });
voltage.on('gaming', (on) => { if (gaming !== !!on) { gaming = !!on; schedule(); } });
voltage.on('background', (b) => {
  // a song change first reports the cover still loading (no image yet): keep showing the old one until the new arrives
  if (b?.style === 'cover' && !b.image && bg.image && bg.style === 'cover') return;
  if (b?.image && bg.image && b.image !== bg.image) {
    fadeFrom = bg.image; // cross-fade from the old cover in the next write...
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => { fadeFrom = null; }, 3000); // ...but not in later writes (a settings change)
  }
  bg = b || bg;
  schedule();
});
// theme tokens are hex colours (#rgb / #rrggbb / #rrggbbaa); anything else keeps Voltage's own value
const hexParts = (h) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(h || '');
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return { rgb: [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)), a: x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1 };
};
voltage.on('theme', (t) => {
  const tk = t?.tokens ?? {}, bgc = hexParts(tk.bg), pan = hexParts(tk.glassBg);
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
  const font = typeof tk.font === 'string' && /^[\w\s",-]{1,120}$/.test(tk.font) && !/Segoe UI Variable/.test(tk.font) ? tk.font : null;
  theme = { bg: bgc?.rgb ?? [0, 0, 0], panel: pan?.rgb ?? [0, 0, 0], panelAlpha: pan ? Math.max(0.05, pan.a) : 0.42,
    glowSize: num(tk.glowSize, 0, 40, 12), glowAlpha: num(tk.glowAlpha, 0, 100, 40), font };
  schedule();
});
voltage.on('palette', (p) => {
  colours = p.idle ? null : { accent: safe(p.accent) ?? PURPLE.accent, c1: safe(p.c1) ?? PURPLE.c1, c2: safe(p.c2) ?? PURPLE.c2 };
  schedule();
});
voltage.on('stop', async (reason) => {
  clearTimeout(timer);
  // turned off: give Discord its own colours back. Voltage quitting: the idle choice (purple or Discord's own).
  const c = reason === 'quit' && settings.idle === 'purple' ? PURPLE : null;
  await write(c ? block(c) : null);
});
