// Headphone correction (AutoEQ, github.com/jaakkopasanen/AutoEq): the index of measured headphones and each one's
// ParametricEQ.txt (preamp + up to 10 low-shelf / peak / high-shelf filters) come from the AutoEq repository's results
// folder, the only address this plugin may reach. The chosen profile is kept in storage (works offline afterwards) and
// sent to Voltage as EQ bands (capability audio.eq), applied after your own EQ preset.
const BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results';

let settings = { on: true };
let profile = null; // {name, path, source, bands, preamp}
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

async function apply() {
  try {
    if (settings.on && profile?.bands?.length) await voltage.audio.eq(profile.bands, profile.preamp);
    else await voltage.audio.eq(null);
  } catch (e) { voltage.log(`eq failed: ${e}`); }
}

async function loadIndex() {
  if (index) return;
  status = 'Loading the headphone list…'; render();
  try {
    const r = await voltage.net.fetch(`${BASE}/INDEX.md`);
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
    profile = { name: e.name, path: e.path, source: e.source, bands: bands.slice(0, 20), preamp };
    await voltage.storage.set('profile', profile);
    status = '';
    await apply();
    voltage.notify(`Correction for ${e.name} on`);
  } catch (err) { status = `Couldn't load that profile (${err.message ?? err}).`; }
  render();
}

function results() {
  if (!index || query.trim().length < 2) return [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return index.filter((e) => words.every((w) => e.name.toLowerCase().includes(w))).slice(0, 40);
}

function render() {
  if (!open) return;
  const list = results();
  voltage.panel.render(`
    <p class="now">${profile ? `<b>${esc(profile.name)}</b> <small>measured by ${esc(profile.source)} · ${profile.bands.length} filters · preamp ${profile.preamp} dB</small>
      ${settings.on ? '' : '<br><small class="warn">Correction is switched off (Settings &gt; Plugins).</small>'}` : 'No headphones chosen yet.'}</p>
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

voltage.on('settings', (s) => { settings = { ...settings, ...s }; apply(); render(); });
voltage.on('panel', ({ open: o }) => { open = o; if (o) loadIndex(); render(); });
voltage.on('panel-action', ({ action, value, form }) => {
  if (action === 'search') { query = String(form?.q ?? ''); render(); }
  else if (action === 'pick') pick(+value);
  else if (action === 'clear') { profile = null; voltage.storage.set('profile', null); apply(); render(); }
});
voltage.on('stop', () => voltage.audio.eq(null).catch(() => {}));

(async () => {
  try { profile = await voltage.storage.get('profile'); } catch { /* none yet */ }
  apply();
})();
self.parseParametric = parseParametric; self.parseIndex = parseIndex; // for tests
