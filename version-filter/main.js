/// <reference path="../sdk/voltage.d.ts" />
// Version filter (PLUGIN-PLAN P12-24 I1): radio and autoplay leave out the versions you don't want (sped up / nightcore,
// slowed + reverb, live, remix, karaoke / instrumental, covers, 8D). Only songs Voltage queued from a radio by itself are
// touched (track.radio); a song you pick yourself always plays, and so do your playlists, albums and what you queue.
// How: upcoming radio songs are taken out of the queue before they play (capability queue.write); if one starts anyway
// (it came in between two queue updates), it's skipped at once, unless you chose it.

let settings = { spedUp: true, slowed: true, live: false, remix: false, karaoke: true, cover: false, eightD: true, debug: false };
const asked = new Set(); // ids already removed (or asked to be), so a queue update doesn't send them again
let removedTotal = 0;

// Words that mark a version wherever they are: nobody names an original song "Nightcore" or "8D Audio".
const ANYWHERE = {
  spedUp: /\b(nightcore|sped[\s-]*up|speed[\s-]*up|spedup)\b/i,
  slowed: /\b(slowed(\s*(\+|&|and)\s*reverb(ed)?)?|reverb(ed)?\s*(\+|&|and)\s*slowed|daycore)\b/i,
  eightD: /\b8\s*d(\s*audio)?\b/i,
};
// Words that only count in the version part: inside () [] 【】 or after " - " / " | ", so "Live Forever", "Cover Me" or
// "Remix Your Heart" (real titles) stay. "Love Live!" is a franchise, not a live recording.
const VERSION = {
  live: /\b(live|en vivo|ao vivo|concert|unplugged)\b|ライブ/i, // \b doesn't work next to kana: those words stand alone
  remix: /\b(remix|rmx|bootleg|mashup|vip mix)\b|リミックス/i,
  karaoke: /\b(karaoke|instrumental|inst\.?|off[\s-]?vocal|backing track)\b|カラオケ|オフボーカル/i,
  // "cover" ends its tag ("(Cover)", "(Acoustic Cover)") or names who ("Cover by", "Cover ver."): C11 found
  // "Twinz (Deep Cover 98)", a song's title in brackets
  cover: /(^|\/)\s*([^/]{0,30}\s)?cover(ed)?(\s+(by|ver\.?|version)\b[^/]*)?\s*($|\/)|\bcovered by\b|\btribute\b|歌ってみた|弾いてみた/i,
};

/** The version part of a title: everything in brackets, and what follows a " - " or " | " separator. */
function versionPart(title) {
  const t = String(title || '');
  const parts = [];
  for (const m of t.matchAll(/[([【「]([^)\]】」]*)[)\]】」]/g)) parts.push(m[1]);
  const sep = t.search(/\s[-–—|]\s/);
  if (sep >= 0) parts.push(t.slice(sep + 3));
  return parts.join(' / ').replace(/love\s*live!?/gi, ' ');
}

/** Which unwanted version a song is ('spedUp', 'live', ...), or null. */
function versionOf(track, s = settings) {
  if (!track) return null;
  const title = String(track.title || ''), artist = String(track.artist || '');
  for (const [k, re] of Object.entries(ANYWHERE)) if (s[k] && (re.test(title) || re.test(artist))) return k;
  // channels that only post versions ("Nightcore Reality", "slowed + reverb" channels) are caught above by the artist
  const v = versionPart(title);
  if (!v) return null;
  for (const [k, re] of Object.entries(VERSION)) if (s[k] && re.test(v)) return k;
  return null;
}
self.versionOf = versionOf; self.versionPart = versionPart; // for tests

async function sweep(q) {
  if (!q?.tracks) return;
  const ids = [];
  for (const t of q.tracks.slice(q.index + 1)) {
    if (!t.radio || asked.has(t.id)) continue;
    const k = versionOf(t);
    if (k) { ids.push(t.id); asked.add(t.id); if (settings.debug) voltage.log(`left out (${k}): ${t.title} - ${t.artist}`); }
  }
  if (!ids.length) return;
  try {
    const n = await voltage.queue.remove(ids);
    removedTotal += n || 0;
    voltage.storage.set('removed', removedTotal);
  } catch (e) { voltage.log(`couldn't change the queue: ${e}`); }
}

voltage.on('settings', (s) => { settings = { ...settings, ...s }; asked.clear(); });
voltage.on('queue', sweep);
voltage.on('track', (t) => {
  if (!t || !t.radio || t.how === 'pick') return; // you chose it: it plays
  const k = versionOf(t);
  if (!k) return;
  if (settings.debug) voltage.log(`skipped (${k}): ${t.title} - ${t.artist}`);
  removedTotal++;
  voltage.storage.set('removed', removedTotal);
  voltage.playback.next();
});
voltage.storage.get('removed').then((n) => { if (typeof n === 'number') removedTotal = n; });
