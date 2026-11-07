/// <reference path="../sdk/voltage.d.ts" />
// Headphone correction (AutoEQ, github.com/jaakkopasanen/AutoEq): the index of measured headphones and each one's
// ParametricEQ.txt (preamp + up to 10 low-shelf / peak / high-shelf filters) come from the AutoEq repository's results
// folder, the only address this plugin may reach. The chosen profile is kept in storage (works offline afterwards) and
// sent to Voltage as EQ bands (capability audio.eq), applied after your own EQ preset.
// 1.1 (round 12 P12-1): a correction is for one pair of headphones, so it's applied only while the music plays on the
// output it was picked on (Voltage 1.6.1's 'output' event); on speakers, a TV or a Spotify speaker it's off. More devices can
// be added from the panel ("Use on this output too").
const BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results';

let settings = { on: true };
let profile = null; // {name, path, source, bands, preamp, devices: [{id, name}]}
let output = null; // {kind, id, name}: where the music plays now
let index = null; // [{name, path, source}]
let query = '', status = '', open = false;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** "Filter 2: ON PK Fc 170 Hz Gain -7.0 dB Q 1.06" lines -> bands; "Preamp: -6.4 dB" -> preamp. */
function parseParametric(text) {
  const bands = [];
  let preamp = 0;
  for (const l of text.split('\n')) {
    const p = /^Preamp:\s*(-?[\d.]+)\s*dB/i.exec(l);
    if (p) preamp = +p[1];
    const m = /^Filter \d+:\s*ON\s+(LSC|PK|HSC)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+(-?[\d.]+)\s*dB\s+Q\s+([\d.]+)/i.exec(l);
    if (m) bands.push({ type: { LSC: 'lowshelf', PK: 'peak', HSC: 'highshelf' }[m[1].toUpperCase()], f: +m[2], gain: +m[3], q: +m[4] });
  }
  return { bands, preamp };
}

/** INDEX.md "- [HyperX Cloud III](./Rtings/HMS%20II.3%20over-ear/HyperX%20Cloud%20III) by Rtings on HMS II.3" -> entries. */
function parseIndex(md) {
  const out = [];
  for (const l of md.split('\n')) {
    const m = /^- \[(.+?)\]\(\.\/(.+?)\) by (.+)$/.exec(l.trim());
    if (m) out.push({ name: m[1], path: m[2], source: m[3] });
  }
  return out;
}

/** Is the music on one of the profile's outputs? A profile from 1.0 (no devices yet) takes the first output it sees. */
function onItsOutput() {
  if (!profile || output?.kind !== 'local' || !output.id) return false;
  return (profile.devices ?? []).some((d) => d.id === output.id);
}

let applied = null;
async function apply() {
  const want = !!(settings.on && profile?.bands?.length && onItsOutput());
  if (want === applied && want === false) return; // nothing to undo (calls only when something changes)
  applied = want;
  try {
    if (want) await voltage.audio.eq(profile.bands, profile.preamp);
    else await voltage.audio.eq(null);
  } catch (e) { voltage.log(`eq failed: ${e}`); }
}

async function adopt() {
  // a profile picked with AutoEQ 1.0 has no devices: it was meant for whatever played then; take the current output
  if (profile && !profile.devices && output?.kind === 'local' && output.id) {
    profile.devices = [{ id: output.id, name: output.name }];
    await voltage.storage.set('profile', profile);
  }
}

async function loadIndex() {
  if (index) return;
  status = 'Loading the headphone list…'; render();
  try {
    const r = await voltage.net.fetch(`${BASE}/INDEX.md`);
    // 1.0.1: the AutoEq project reorganised its repository -> this plugin needs an update, not a retry
    if (r.status === 404) throw new Error("AutoEq moved its files: update this plugin in Settings > Plugins > Official plugins");
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    index = parseIndex(r.text);
    status = '';
  } catch (e) { status = `Couldn't load the list (${e.message ?? e}). Check your connection.`; }
  render();
}

async function pick(i) {
  const e = results()[i];
  if (!e) return;
  status = `Loading ${e.name}…`; render();
  try {
    const name = decodeURIComponent(e.path.split('/').pop());
    const r = await voltage.net.fetch(`${BASE}/${e.path}/${encodeURIComponent(`${name} ParametricEQ.txt`)}`);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const { bands, preamp } = parseParametric(r.text);
    if (!bands.length) throw new Error('no filters in the profile');
    const here = output?.kind === 'local' && output.id ? [{ id: output.id, name: output.name }] : null;
    profile = { name: e.name, path: e.path, source: e.source, bands: bands.slice(0, 20), preamp, devices: here };
    await voltage.storage.set('profile', profile);
    status = '';
    applied = null;
    await apply();
    voltage.notify(`Correction for ${e.name} on${here ? ` (on ${here[0].name})` : ''}`);
  } catch (err) { status = `Couldn't load that profile (${err.message ?? err}).`; }
  render();
}

function results() {
  if (!index || query.trim().length < 2) return [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((e) => words.every((w) => e.name.toLowerCase().includes(w))).slice(0, 40);
}

function whereLine() {
  if (!profile) return '';
  const names = (profile.devices ?? []).map((d) => esc(d.name)).join(', ');
  if (output?.kind === 'spotify') return `<br><small class="warn">Off: the music plays on ${esc(output.name)}.</small>`;
  if (onItsOutput()) return `<br><small>On for ${names}.</small>`;
  const here = output?.name ? esc(output.name) : 'this output';
  return `<br><small class="warn">Off on ${here}${names ? ` (it's for ${names})` : ''}.</small>
    ${output?.id ? `<button data-action="here">Use on ${here} too</button>` : ''}`;
}

function render() {
  if (!open) return;
  const list = results();
  voltage.panel.render(`
    <p class="now">${profile ? `<b>${esc(profile.name)}</b> <small>measured by ${esc(profile.source)} · ${profile.bands.length} filters · preamp ${profile.preamp} dB</small>
      ${settings.on ? whereLine() : '<br><small class="warn">Correction is switched off (Settings &gt; Plugins).</small>'}` : 'No headphones chosen yet.'}</p>
    <div class="row"><input name="q" placeholder="Search your headphones, e.g. HyperX Cloud III" value="${esc(query)}" data-action="search">
      ${profile ? '<button data-action="clear">Remove</button>' : ''}</div>
    ${status ? `<p class="status">${esc(status)}</p>` : ''}
    ${list.length ? `<ul>${list.map((e, i) => `<li><button class="pick" data-action="pick" data-value="${i}"><b>${esc(e.name)}</b> <small>${esc(e.source)}</small></button></li>`).join('')}</ul>`
      : query.trim().length >= 2 && index ? '<p class="status">No match. Try fewer words (only the model name).</p>' : ''}
    <p class="hint">Profiles from the AutoEQ project (Jaakko Pasanen and contributors). Your exact model may be missing: a close
      relative of the same family usually helps; if it sounds worse, remove it.</p>`, `
    .row { display: flex; gap: 8px; } .row input { flex: 1; }
    ul { list-style: none; padding: 0; margin: 8px 0; max-height: 46vh; overflow: auto; }
    li { margin: 2px 0; } .pick { width: 100%; text-align: left; border-radius: 8px; }
    small { opacity: .65; } .status { opacity: .8; } .warn { color: #ffb347; opacity: 1; } .hint { opacity: .5; font-size: 12px; }`);
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; applied = null; apply(); render(); });
voltage.on('output', async (o) => { output = o; await adopt(); apply(); render(); });
voltage.on('panel', ({ open: o }) => { open = o; if (o) loadIndex(); render(); });
voltage.on('panel-action', ({ action, value, form }) => {
  if (action === 'search') { query = String(form?.q ?? ''); render(); }
  else if (action === 'pick') pick(+value);
  else if (action === 'clear') { profile = null; voltage.storage.set('profile', null); applied = null; apply(); render(); }
  else if (action === 'here' && profile && output?.id && !onItsOutput()) {
    profile.devices = [...(profile.devices ?? []), { id: output.id, name: output.name }];
    voltage.storage.set('profile', profile);
    apply(); render();
  }
});
voltage.on('stop', () => voltage.audio.eq(null).catch(() => {}));

(async () => {
  try { profile = await voltage.storage.get('profile'); } catch { /* none yet */ }
  await adopt();
  apply();
})();
self.parseParametric = parseParametric; self.parseIndex = parseIndex; // for tests
