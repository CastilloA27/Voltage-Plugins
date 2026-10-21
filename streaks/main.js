// Streaks & achievements: counts your listening from the events Voltage sends (track, playing, position), keeps it in the
// plugin's own storage, and shows streaks and badges in its panel. Nothing leaves the PC. History starts when the plugin
// is installed (plugins can't read Voltage's play history).
const DAY = 86400000;
const PLAY_SECS = 30; // a play counts after 30 s, like Voltage's own stats

let settings = { notify: true, streakMinutes: 10 };
let data = { days: {}, plays: {}, artists: {}, hours: {}, badges: {}, total: 0 };
let loaded = false, dirty = false, open = false, saveFailed = false;
let cur = null, curSecs = 0, counted = false, playing = false, lastPos = null;

const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstArtist = (a) => String(a || '').split(',')[0].trim();

function streak() {
  const need = settings.streakMinutes * 60;
  let n = 0, best = 0, run = 0;
  // current: today (if already reached) or yesterday backwards
  let t = Date.now();
  if ((data.days[dayKey(t)] ?? 0) < need) t -= DAY;
  while ((data.days[dayKey(t)] ?? 0) >= need) { n++; t -= DAY; }
  // best: over every recorded day
  const keys = Object.keys(data.days).sort();
  let prev = null;
  for (const k of keys) {
    if (data.days[k] < need) { run = 0; prev = k; continue; }
    const contiguous = prev && Date.parse(k) - Date.parse(prev) <= DAY * 1.5 && data.days[prev] >= need;
    run = contiguous ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { now: n, best: Math.max(best, n) };
}

const monthArtists = () => { const m = dayKey().slice(0, 7); return Object.values(data.artists).filter((d) => d.startsWith(m)).length; };
// Artists first heard before last month are only needed to know they aren't new: kept as a short hash (32-bit FNV-1a,
// base 36) in one string, so months of listening stay far under the plugin storage cap (256 KB). 1.0.1
const hash = (s) => { let h = 0x811c9dc5; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const knownArtist = (a) => !!data.artists[a] || (data.seen ?? '').split(',').includes(hash(a));

/** Keeps the stored data small (pure, for tests): the 1500 most played songs, titles for the top 50 (the panel shows 5),
 *  the last 400 days, dated artists for this and last month only. */
function compact(d, today = dayKey()) {
  const ids = Object.keys(d.plays);
  if (ids.length > 1500) {
    const keep = new Set(ids.sort((a, b) => d.plays[b] - d.plays[a]).slice(0, 1500));
    for (const id of ids) if (!keep.has(id)) delete d.plays[id];
  }
  const top = new Set(Object.keys(d.plays).sort((a, b) => d.plays[b] - d.plays[a]).slice(0, 50));
  for (const id of Object.keys(d.titles ?? {})) if (!top.has(id)) delete d.titles[id];
  const days = Object.keys(d.days).sort();
  for (const k of days.slice(0, Math.max(0, days.length - 400))) delete d.days[k];
  const [y, m] = today.split('-').map(Number);
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const seen = new Set((d.seen ?? '').split(',').filter(Boolean));
  for (const [a, when] of Object.entries(d.artists)) if (when.slice(0, 7) < lastMonth) { seen.add(hash(a)); delete d.artists[a]; }
  d.seen = [...seen].join(',');
  return d;
}
const topPlays = () => Math.max(0, ...Object.values(data.plays));
const hourPlays = (from, to) => Object.entries(data.hours).filter(([h]) => (from < to ? h >= from && h < to : h >= from || h < to)).reduce((s, [, n]) => s + n, 0);
const bestDay = () => Math.max(0, ...Object.values(data.days));

// [id, title, description, progress 0..1]
const BADGES = () => [
  ['hour', 'First hour', 'Listen for an hour in total', data.total / 3600],
  ['streak3', 'Warming up', 'A 3-day listening streak', streak().best / 3],
  ['streak7', 'Weekly ritual', 'A 7-day streak', streak().best / 7],
  ['streak30', 'Unbroken', 'A 30-day streak', streak().best / 30],
  ['repeat25', 'On repeat', 'Play one song 25 times', topPlays() / 25],
  ['repeat100', 'Obsessed', 'Play one song 100 times', topPlays() / 100],
  ['explorer', 'Explorer', '25 new artists this month', monthArtists() / 25],
  ['night', 'Night owl', '25 plays between midnight and 4 am', hourPlays(0, 4) / 25],
  ['early', 'Early bird', '25 plays between 5 and 8 am', hourPlays(5, 8) / 25],
  ['marathon', 'Marathon', '3 hours of music in one day', bestDay() / (3 * 3600)],
  ['thousand', 'Ten thousand minutes', '10,000 minutes in total', data.total / 600000],
];

function checkBadges() {
  for (const [id, title, desc, p] of BADGES()) {
    if (p >= 1 && !data.badges[id]) {
      data.badges[id] = dayKey();
      dirty = true;
      if (settings.notify) voltage.notify(`Badge earned: ${title} (${desc.toLowerCase()})`);
    }
  }
}

function render() {
  if (!open) return;
  const s = streak(), today = Math.round((data.days[dayKey()] ?? 0) / 60);
  const badges = BADGES().map(([id, title, desc, p]) => {
    const got = data.badges[id];
    return `<div class="badge ${got ? 'got' : ''}"><b>${esc(title)}</b><small>${esc(desc)}</small>
      ${got ? `<small class="when">Earned ${esc(got)}</small>` : `<progress max="100" value="${Math.min(100, Math.round(p * 100))}"></progress>`}</div>`;
  }).join('');
  const top = Object.entries(data.plays).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, n]) => `<li>${esc(data.titles?.[id] ?? id)} <small>${n} play${n === 1 ? '' : 's'}</small></li>`).join('');
  voltage.panel.render(`
    <div class="stats">
      <div><span class="big">${s.now}</span><small>day streak</small></div>
      <div><span class="big">${s.best}</span><small>best streak</small></div>
      <div><span class="big">${today}</span><small>minutes today (streak: ${settings.streakMinutes})</small></div>
      <div><span class="big">${Math.round(data.total / 3600)}</span><small>hours since installed</small></div>
    </div>
    <h3>Badges <small>${Object.keys(data.badges).length} of ${BADGES().length}</small></h3>
    <div class="grid">${badges}</div>
    ${top ? `<h3>Most played</h3><ol>${top}</ol>` : ''}
    <p class="hint">Counting since this plugin was installed. A play counts after 30 seconds.</p>`, `
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 8px; }
    .stats > div { background: rgba(255,255,255,.06); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; }
    .big { font-size: 28px; font-weight: 700; }
    small { opacity: .65; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    .badge { border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 4px; opacity: .6; }
    .badge.got { opacity: 1; border-color: rgba(160,32,240,.8); background: rgba(160,32,240,.14); }
    progress { appearance: none; width: 100%; height: 6px; border: 0; border-radius: 3px; background: rgba(255,255,255,.1); }
    progress::-webkit-progress-bar { background: rgba(255,255,255,.1); border-radius: 3px; }
    progress::-webkit-progress-value { background: #a020f0; border-radius: 3px; }
    .when { color: #c9a0ff; opacity: 1; }
    ol { padding-left: 20px; } .hint { opacity: .5; font-size: 12px; }`);
}

async function save() {
  if (!dirty || !loaded) return;
  dirty = false;
  compact(data);
  try {
    await voltage.storage.set('data', data);
    saveFailed = false;
  } catch (e) {
    voltage.log(`save failed: ${e}`);
    if (!saveFailed) voltage.notify(`Streaks couldn't save your progress (${e}). It keeps counting and tries again.`);
    saveFailed = true;
  }
}

function countPlay() {
  if (!cur || counted || curSecs < PLAY_SECS) return;
  counted = true;
  data.plays[cur.id] = (data.plays[cur.id] ?? 0) + 1;
  (data.titles ??= {})[cur.id] = `${cur.title} · ${firstArtist(cur.artist)}`.slice(0, 120);
  const a = firstArtist(cur.artist).toLowerCase();
  if (a && !knownArtist(a)) data.artists[a] = dayKey();
  const h = String(new Date().getHours()).padStart(2, '0');
  data.hours[h] = (data.hours[h] ?? 0) + 1;
  dirty = true;
  checkBadges();
  render();
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; render(); });
voltage.on('track', (t) => {
  if (t?.id === cur?.id) return;
  cur = t; curSecs = 0; counted = false; lastPos = null;
  save();
});
voltage.on('playing', (p) => { playing = p; lastPos = null; });
voltage.on('position', ({ pos }) => {
  if (!playing || !cur) return;
  // only real listening time: small forward steps (a seek doesn't count)
  if (lastPos != null && pos > lastPos && pos - lastPos <= 3) {
    const d = pos - lastPos;
    curSecs += d;
    data.total += d;
    data.days[dayKey()] = (data.days[dayKey()] ?? 0) + d;
    dirty = true;
    countPlay();
    if (Math.floor(data.total / 60) !== Math.floor((data.total - d) / 60)) checkBadges(); // once a minute is enough
  }
  lastPos = pos;
});
voltage.on('panel', ({ open: o }) => { open = o; render(); });
voltage.on('stop', () => save());

(async () => {
  try { const d = await voltage.storage.get('data'); if (d && typeof d === 'object') data = { ...data, ...d }; } catch { /* first run */ }
  loaded = true;
  render();
})();
setInterval(save, 30000);
