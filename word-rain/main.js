/// <reference path="../sdk/voltage.d.ts" />
// Word rain: the Word Rain theme's helper (review round 15 wave 1: F7 physics). The words of the line being sung fall into
// Voltage's background layer one after another, bounce a little and pile up at the bottom of the window; the oldest fade
// after a while and a new song sweeps the pile away. A 2D canvas, a column height map for the pile (no physics library).
// Voltage sends no frames while a game is in front, while hidden or with reduced motion; 30 a second playing, 6 paused.
const COL = 6;                 // pile resolution in canvas pixels
const MAX_WORDS = 90;          // alive at once (oldest go first)
const FADE_AFTER = 30;         // seconds a settled word stays
let ctx = null, W = 1, H = 1, dpr = 1, heights = null, words = [], queue = [], spawnAt = 0, now = 0, playing = false;
let accent = '#a020f0', ink = '#ffffff', clearing = 0;

function measure(text, size) { ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`; return ctx.measureText(text).width; }
function resetPile() { heights = new Float32Array(Math.ceil(W / COL) + 1).fill(H); }
function topAt(x, w) { let top = H; for (let c = Math.max(0, Math.floor(x / COL)); c <= Math.min(heights.length - 1, Math.floor((x + w) / COL)); c++) top = Math.min(top, heights[c]); return top; }
function settle(b) { for (let c = Math.max(0, Math.floor(b.x / COL)); c <= Math.min(heights.length - 1, Math.floor((b.x + b.w) / COL)); c++) heights[c] = Math.min(heights[c], b.y); }
function rebuild() { resetPile(); for (const b of words) if (b.done) settle(b); }

function drop(text, i) {
  if (!ctx) return;
  const size = Math.round((22 + Math.random() * 16) * dpr);
  const w = measure(text, size);
  const x = Math.max(0, Math.min(W - w, W * (0.08 + Math.random() * 0.84) - w / 2));
  words.push({ text, size, w, h: size * 1.05, x, y: -size * 1.2, vy: 0, born: now, done: false, hot: i === 0 });
  if (words.length > MAX_WORDS) { words.splice(0, words.length - MAX_WORDS); rebuild(); }
}

voltage.on('layer', ({ target, canvas, width, height, dpr: d }) => {
  if (target !== 'background') return;
  W = canvas.width = width; H = canvas.height = height; dpr = d || 1;
  ctx = canvas.getContext('2d');
  resetPile();
});
voltage.on('layer-resize', ({ width, height }) => { if (!ctx) return; W = ctx.canvas.width = width; H = ctx.canvas.height = height; words = words.filter((b) => b.x + b.w <= W); rebuild(); });
voltage.on('layer-gone', () => { ctx = null; words = []; queue = []; });

voltage.on('frame', ({ t, dt }) => {
  if (!ctx) return;
  now = t;
  const step = Math.min(dt || 0, 0.1);
  // the line's words come one by one, ~0.3 s apart (Voltage gives plugins the line, not each word's time)
  if (queue.length && t >= spawnAt) { const [text, i] = queue.shift(); drop(text, i); spawnAt = t + 0.3; }
  const g = 1400 * dpr;
  let changed = false;
  for (const b of words) {
    if (b.done) continue;
    b.vy = Math.min(b.vy + g * step, 1600 * dpr);
    b.y += b.vy * step;
    const floor = topAt(b.x, b.w);
    if (b.y + b.h >= floor) {
      b.y = floor - b.h;
      if (b.vy > 260 * dpr) b.vy = -b.vy * 0.22; // a little bounce
      else { b.vy = 0; b.done = true; settle(b); }
    }
  }
  // old words fade and leave; a new song sweeps everything away
  const before = words.length;
  words = words.filter((b) => !(b.done && t - b.born > FADE_AFTER + 3));
  if (words.length !== before) changed = true;
  if (clearing) { clearing = Math.max(0, clearing - step); if (!clearing) { words = []; changed = true; } }
  if (changed) rebuild();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'top';
  for (const b of words) {
    const age = t - b.born;
    let a = b.done && age > FADE_AFTER ? Math.max(0, 1 - (age - FADE_AFTER) / 3) : 1;
    if (clearing) a *= clearing / 0.8;
    ctx.globalAlpha = a * (b.done ? 0.55 : 0.95);
    ctx.font = `700 ${b.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = b.hot ? accent : ink;
    ctx.fillText(b.text, b.x, b.y);
  }
  ctx.globalAlpha = 1;
});

voltage.on('lyric', (l) => {
  const text = String(l?.text ?? '').trim();
  if (!text || text === '♪') return;
  const parts = text.split(/\s+/).filter(Boolean).slice(0, 14);
  queue = parts.map((w, i) => [w.slice(0, 24), i]);
  spawnAt = now;
});
voltage.on('track', () => { clearing = words.length ? 0.8 : 0; queue = []; });
voltage.on('palette', (p) => { if (p?.accent) accent = p.accent; });
voltage.on('theme', (th) => { if (th?.tokens?.text) ink = th.tokens.text; if (th?.id === 'word-rain' && !ctx) voltage.theme.layer('background', { fps: playing ? 30 : 6, scale: 1 }); });
voltage.on('playing', (p) => { playing = !!p; voltage.theme.layer('background', { fps: playing ? 30 : 6, scale: 1 }); });
voltage.theme.layer('background', { fps: 30, scale: 1 });
