// Visualizer pack: extra progress-bar styles, drawn here (in the plugin's worker) on canvases Voltage hands over
// (capability ui.canvas). Procedural like Voltage's own styles: mpv gives no audio samples. ~30 frames a second while
// playing, nothing while Voltage is hidden, and only on change while a game is in front.
const FRAME_MS = 1000 / 30;
const canvases = new Map(); // id -> {canvas, ctx, style, width, height, dpr, key}
let pos = 0, dur = 0, at = performance.now(), playing = false, visible = true, gaming = false;
let target = [160, 32, 240];
const col = [160, 32, 240];
let amp = 0, phase = 0, last = 0;
const sparks = []; // particles style: {x, y, vx, vy, life}

// palette colours are CSS strings: 'rgb(20 122 235)', 'rgb(20, 122, 235)' or '#1478eb'
const rgbOf = (c) => {
  const h = /^#([0-9a-f]{6})$/i.exec(c || '');
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16));
  const m = /(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(c || '');
  return m ? [+m[1], +m[2], +m[3]] : null;
};
const now = () => (playing ? pos + (performance.now() - at) / 1000 : pos);

voltage.on('palette', (p) => { target = rgbOf(p?.accent) ?? [160, 32, 240]; });
voltage.on('position', (p) => { pos = p.pos; dur = p.dur; at = performance.now(); });
voltage.on('playing', (v) => { pos = now(); at = performance.now(); playing = v; });
voltage.on('visible', (v) => { visible = v; });
voltage.on('gaming', (g) => { gaming = g; });
voltage.on('canvas', (d) => {
  d.canvas.width = d.width; d.canvas.height = d.height;
  canvases.set(d.id, { ...d, ctx: d.canvas.getContext('2d'), key: '' });
});
voltage.on('canvas-resize', (d) => {
  const c = canvases.get(d.id);
  if (c) { c.width = c.canvas.width = d.width; c.height = c.canvas.height = d.height; c.key = ''; }
});
voltage.on('canvas-gone', (d) => { canvases.delete(d.id); });

function frame(t) {
  schedule();
  if (!canvases.size || !visible) { last = 0; return; }
  if (last && t - last < FRAME_MS - 2) return;
  const dt = Math.min(100, t - (last || t));
  last = t;
  const k = 1 - Math.exp(-dt / 450);
  for (let i = 0; i < 3; i++) col[i] += (target[i] - col[i]) * k;
  amp += ((playing ? 1 : 0) - amp) * (1 - Math.exp(-dt / 350));
  phase += dt * 0.0024;
  const frac = dur ? Math.min(1, now() / dur) : 0;
  const still = gaming || (!playing && amp < 0.002 && !sparks.length);
  for (const c of canvases.values()) {
    const px = frac * c.width;
    if (still) { // nothing moves: redraw only when the playhead or colour changed
      const key = `${px | 0}|${col.map((v) => v | 0)}|${c.width}`;
      if (key === c.key) continue;
      c.key = key;
    } else c.key = '';
    draw(c, px, dt, still);
  }
}

function draw(c, px, dt, still) {
  const { ctx, width: W, height: H, dpr } = c, mid = H / 2, rgb = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  // the unplayed rest, faint
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(px, mid); ctx.lineTo(W, mid); ctx.stroke();
  if (c.style === 'blocks') blocks(ctx, W, H, px, rgb, dpr);
  else if (c.style === 'ribbon') ribbon(ctx, H, px, dpr);
  else particles(ctx, H, px, rgb, dpr, dt, still);
  // playhead
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(Math.max(px, 4.5 * dpr), mid, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
}

function particles(ctx, H, px, rgb, dpr, dt, still) {
  const mid = H / 2;
  ctx.strokeStyle = `rgba(${rgb},.75)`;
  ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(px, mid); ctx.stroke();
  if (still) { sparks.length = 0; return; }
  // new sparks at the playhead while playing, drifting back along the played part
  for (let n = Math.random() < amp * 0.9 ? 2 : 0; n > 0 && px > 4; n--) {
    sparks.push({ x: px, y: mid, vx: -(0.4 + Math.random() * 1.6) * dpr, vy: (Math.random() - 0.5) * 0.9 * dpr, life: 1 });
  }
  const f = dt / 33;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * f; s.y += s.vy * f; s.vy *= 0.97; s.life -= 0.018 * f;
    if (s.life <= 0 || s.x < 0) { sparks.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(${rgb},${s.life * 0.9})`;
    ctx.beginPath(); ctx.arc(s.x, Math.max(2, Math.min(H - 2, s.y)), (0.8 + 1.6 * s.life) * dpr, 0, Math.PI * 2); ctx.fill();
  }
  if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
}

function ribbon(ctx, H, px, dpr) {
  const mid = H / 2, a = amp * H * 0.3;
  const hues = [[0, 0.55], [40, 0.35], [-40, 0.35]];
  hues.forEach(([shift, alpha], n) => {
    const c = shifted(shift);
    ctx.fillStyle = `rgba(${c},${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let x = 0; x <= px; x += 3 * dpr) {
      const taper = Math.min(1, x / (40 * dpr)) * Math.min(1, (px - x) / (24 * dpr) + 0.1);
      ctx.lineTo(x, mid - Math.sin(x / (38 * dpr) + phase * (1.4 + n * 0.35) + n * 2) * a * taper);
    }
    for (let x = px; x >= 0; x -= 3 * dpr) {
      const taper = Math.min(1, x / (40 * dpr)) * Math.min(1, (px - x) / (24 * dpr) + 0.1);
      ctx.lineTo(x, mid + Math.sin(x / (30 * dpr) - phase * (1.1 + n * 0.3) + n) * a * 0.6 * taper);
    }
    ctx.closePath(); ctx.fill();
  });
  ctx.strokeStyle = `rgba(${shifted(0)},.9)`;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(px, mid); ctx.stroke();
}

function blocks(ctx, W, H, px, rgb, dpr) {
  const bw = 5 * dpr, gap = 2 * dpr, rows = 5, bh = (H * 0.8 - (rows - 1) * gap) / rows, top = H * 0.1;
  for (let x = gap, i = 0; x < W - bw; x += bw + gap, i++) {
    if (x >= px) break;
    const n = 0.5 + 0.5 * Math.sin(i * 0.7 + phase * 2.3) * Math.cos(i * 0.23 - phase * 1.1);
    const lit = Math.max(1, Math.round((0.25 + 0.75 * n * amp) * rows));
    for (let r = 0; r < rows; r++) {
      const on = rows - r <= lit;
      ctx.fillStyle = on ? `rgba(${rgb},${r === rows - lit ? 1 : 0.7})` : 'rgba(255,255,255,.05)';
      ctx.fillRect(x, top + r * (bh + gap), bw, bh);
    }
  }
}

/** The accent with its hue rotated (neighbouring colours for the ribbons). */
function shifted(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 1 / 3, q = Math.sqrt(k);
  const t = [c + (1 - c) * k, k * (1 - c) - q * s, k * (1 - c) + q * s];
  const cl = (v) => Math.max(0, Math.min(255, v)) | 0;
  const [r, g, b] = col;
  return `${cl(r * t[0] + g * t[1] + b * t[2])},${cl(r * t[2] + g * t[0] + b * t[1])},${cl(r * t[1] + g * t[2] + b * t[0])}`;
}

const schedule = () => (self.requestAnimationFrame ? requestAnimationFrame(frame) : setTimeout(() => frame(performance.now()), FRAME_MS));
schedule();
voltage.on('stop', () => { canvases.clear(); });
