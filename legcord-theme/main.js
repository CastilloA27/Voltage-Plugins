// Legcord live theme: writes Voltage's current colours into Legcord's Quick CSS file, which Legcord reloads by itself.
// The colours are registered CSS properties with a transition, so Discord fades between songs instead of jumping.
// Only a marked block at the end of the file is ours; everything else in the file is left exactly as it was.
const FILE = '%APPDATA%/legcord/quickCss.css';
const START = '{} /* >>> Voltage live colours';
const END = '/* <<< Voltage live colours */';
const PURPLE = { accent: '#a020f0', c1: '#2a0a4a', c2: '#12051f' };

let settings = { style: 'accent', strength: 30, idle: 'purple' };
let colours = null; // null = nothing playing
let timer = null;
let warned = false;

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
  const decl = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
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
}${tint}
${END}`;
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
