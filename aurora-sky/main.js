/// <reference path="../sdk/voltage.d.ts" />
// Aurora sky: the Aurora theme's helper (review round 15 F7, wave 1). A WebGL sky in Voltage's background layer: curtains
// of light in the album's colours over black, a different sky for every song (Voltage's per-song seed), swaying faster
// with the music's level. 30 frames a second while playing, 4 while paused; Voltage sends no frames while a game is in
// front, while hidden or with reduced motion. No WebGL: the layer is dropped and the theme's black background stays.
let gl = null, prog = null, u = {}, w = 1, h = 1, playing = false, asked = false, lvl = 0;
let col = { a: [0.63, 0.13, 0.94], b: [0.1, 0.9, 0.6], c: [0.2, 0.4, 1] }, target = col, mix = 1;

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;
// fbm curtains: each band is a wavy line in x, a soft glow below it fading down, coloured from c1 (low) to c2 (high)
const FS = `#version 300 es
precision mediump float;
uniform vec2 res; uniform float t, seed, level; uniform vec3 c1, c2, c3;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / res; float asp = res.x / res.y;
  vec2 q = vec2(uv.x * asp, uv.y);
  vec3 sky = vec3(0.);
  float s = seed * 97.;
  // a real aurora: a sharp, bright lower edge that sways, rays rising from it and fading upwards
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sp = .03 + fi * .015 + level * .05;
    float x = q.x * (1. + fi * .35) + s + fi * 2.7;
    float edge = .36 + fi * .1 + (fbm(vec2(x * .9, t * sp)) - .5) * .38;
    float d = uv.y - edge;                       // above the lower edge > 0
    float curtain = smoothstep(-.012, .012, d) * exp(-max(d, 0.) * (3.2 + fi * 1.3));
    float rays = pow(fbm(vec2(x * 16., t * .1 + fi * 5.)), 2.) * 2.2; // the vertical streaks
    vec3 c = mix(c2, c1, clamp(d * 3.5, 0., 1.)); // the album's second colour at the edge, its first higher up
    c = mix(c, c3, .2 * fi);
    sky += c * curtain * (.3 + rays) * (.62 - fi * .14);
    sky += c * exp(-abs(d) * 45.) * .12;        // the glow along the edge
  }
  // small round stars that twinkle, hidden behind bright aurora and near the ground
  vec2 cell = q * 110.; vec2 g = floor(cell); float r = hash(g + s);
  float st = step(.986, r) * smoothstep(.16, 0., length(fract(cell) - .5)) * (.55 + .45 * sin(t * 1.5 + r * 40.));
  sky += vec3(st) * .8 * (1. - clamp(length(sky) * 2.5, 0., 1.)) * smoothstep(.15, .5, uv.y);
  o = vec4(sky * (1. - uv.y * .15), 1.);
}`;

function parse(c) {
  const m = /rgb\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c ?? '');
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255];
  const x = /^#([0-9a-f]{6})$/i.exec(c ?? '');
  return x ? [0, 2, 4].map((i) => parseInt(x[1].slice(i, i + 2), 16) / 255) : null;
}
// lift dark colours so the sky never goes muddy; keep them as the album has them otherwise
const lift = (c) => { const m = Math.max(...c, 0.001); return m < 0.45 ? c.map((v) => v * (0.45 / m)) : c; };

function init(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) { voltage.log('no WebGL2: Aurora stays black'); voltage.theme.layer('background', null); return; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const k of ['res', 't', 'seed', 'level', 'c1', 'c2', 'c3']) u[k] = gl.getUniformLocation(prog, k);
}

voltage.on('layer', ({ target: tg, canvas, width, height }) => {
  if (tg !== 'background') return;
  w = width; h = height; canvas.width = w; canvas.height = h;
  try { init(canvas); } catch (e) { voltage.log(`shader: ${e.message}`); voltage.theme.layer('background', null); gl = null; }
  self.auroraCanvas = canvas;
});
voltage.on('layer-resize', ({ target: tg, width, height }) => {
  if (tg !== 'background' || !self.auroraCanvas) return;
  w = width; h = height; self.auroraCanvas.width = w; self.auroraCanvas.height = h;
});
voltage.on('layer-gone', () => { gl = null; prog = null; self.auroraCanvas = null; });
voltage.on('frame', ({ t, dt, seed, level }) => {
  if (!gl) return;
  lvl += ((level || 0) - lvl) * 0.15;
  if (mix < 1) { // the colours ease to a new song's over ~1.5 s
    mix = Math.min(1, mix + (dt || 0) / 1.5);
    for (const k of ['a', 'b', 'c']) col[k] = col[k].map((v, i) => v + (target[k][i] - v) * mix);
  }
  gl.viewport(0, 0, w, h);
  gl.uniform2f(u.res, w, h); gl.uniform1f(u.t, t % 10000); gl.uniform1f(u.seed, seed || 0); gl.uniform1f(u.level, lvl);
  gl.uniform3fv(u.c1, col.a); gl.uniform3fv(u.c2, col.b); gl.uniform3fv(u.c3, col.c);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
});
voltage.on('palette', (p) => {
  if (!p) return;
  const a = parse(p.c1), b = parse(p.c2), c = parse(p.accent);
  if (p.idle || !a || !b || !c) return; // nothing playing: keep the last sky
  target = { a: lift(a), b: lift(b), c: lift(c) };
  col = { a: [...col.a], b: [...col.b], c: [...col.c] }; mix = 0;
});
voltage.on('playing', (p) => {
  playing = !!p;
  voltage.theme.layer('background', { gl: true, fps: playing ? 30 : 4 });
  asked = true;
});
// back to Aurora after another theme: ask again (Voltage dropped the layer when the theme changed)
voltage.on('theme', (th) => { if (th?.id === 'aurora' && !gl) voltage.theme.layer('background', { gl: true, fps: playing ? 30 : 4 }); });
if (!asked) voltage.theme.layer('background', { gl: true, fps: 30 });
