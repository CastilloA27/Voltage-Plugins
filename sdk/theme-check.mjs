// Voltage theme checker for Voltage 1.10.1: the same rules Voltage uses when it installs and loads a theme.
// Generated from the Voltage app (tools/publish-kit.mjs): don't edit; it is replaced with every Voltage release.
// Usage: node sdk/theme-check.mjs <theme folder> [--strict]   (Node 18 or newer; no install needed)
//   Exit 0 = Voltage accepts it; 1 = it would refuse it (or, with --strict, would drop anything at all).

// <define:VOLTAGE_ICON_NAMES>
var define_VOLTAGE_ICON_NAMES_default = ["play", "check", "pause", "next", "prev", "close", "block", "min", "max", "mini", "expand", "gear", "back", "add", "heart", "list", "thumbUp", "thumbDown", "moon", "volUp", "volOff", "save", "grid", "spark", "down", "share", "link", "refresh", "lyrics", "shuffle", "repeat", "queueAdd", "playNext", "person", "history", "edit", "dupes", "fullscreen", "chart", "explore", "video", "download", "speaker", "radio", "trash", "search"];

// tools/theme-check.mjs
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import path from "node:path";

// src/strings.js
var STRINGS = {
  "brand": "Voltage",
  "nav.home": "Home",
  "nav.settings": "Settings",
  "nav.explore": "Explore",
  "nav.stats": "Listening stats",
  "nav.mini": "Mini player",
  "window.minimize": "Minimize",
  "window.maximize": "Maximize",
  "tab.search": "Results",
  "tab.library": "Library",
  "tab.queue": "Queue",
  "search.placeholder": "Search songs, artists, albums (Ctrl+F)",
  "empty.search": "Type a song, artist or album and press Enter.",
  "empty.queue": "Play a song to start a queue.",
  "search.busy": "Searching\u2026",
  "player.prev": "Previous",
  "player.play": "Play / pause",
  "player.next": "Next",
  "player.shuffle": "Shuffle",
  "player.repeat": "Repeat",
  "player.mute": "Mute (M)",
  "player.unmute": "Unmute (M)",
  "nowplaying.idle": "Nothing playing",
  // round 15 F14: a line over the song's title, empty (hidden) unless a theme sets it: "A wild {artist} appears!"
  "info.kicker": "",
  "nowplaying.lyrics": "Show lyrics",
  "nowplaying.cover": "Show cover",
  "nowplaying.fullscreen": "Full-screen player (F)",
  "nowplaying.exitFullscreen": "Exit the full-screen player (F) \xB7 F11: window full screen",
  "nowplaying.radio": "More like this (replaces what's up next)",
  "time.loading": "Loading\u2026",
  "lyrics.loading": "Loading lyrics\u2026",
  "lyrics.instrumental": "Instrumental",
  "lyrics.none": "No lyrics found for this song.",
  "view.explore": "Explore",
  "view.settings": "Settings",
  "view.stats": "Your listening",
  "library.liked": "Liked songs",
  "library.recent": "Recently played",
  // round 14 R14-4: the song / playlist menus, Explore, the mini player, dialog buttons, common notices.
  // {name} = filled in by Voltage (a theme may move or drop it)
  "menu.playNow": "Play now",
  "menu.playNext": "Play next",
  "menu.addQueue": "Add to queue",
  "menu.addPlaylist": "Add to playlist\u2026",
  "menu.goArtist": "Go to {artist}",
  "menu.goAlbum": "Go to album",
  "menu.radio": "More like this",
  "menu.download": "Download (play offline)",
  "menu.removeDownload": "Remove download",
  "menu.copyLink": "Copy link",
  "menu.copyLinkAt": "Copy link at {time}",
  "menu.share": "Share\u2026",
  "menu.removeQueue": "Remove from queue",
  "menu.removePlaylist": "Remove from playlist",
  "menu.play": "Play",
  "menu.shufflePlay": "Shuffle play",
  "menu.open": "Open",
  "explore.forYou": "For you",
  "explore.listenAgain": "Listen again",
  "explore.mixes": "Your mixes",
  "explore.onRepeat": "On repeat",
  "explore.fromLiked": "From your liked songs",
  "explore.forgotten": "Forgotten favourites",
  "explore.albums": "Albums",
  "explore.singles": "Singles & EPs",
  "explore.related": "Fans also like",
  "mini.expand": "Back to full window",
  "dialog.cancel": "Cancel",
  "dialog.notNow": "Not now",
  "note.liked": "Liked",
  "note.disliked": "Disliked",
  "note.ratingRemoved": "Rating removed",
  "note.playNext": "Playing next: {title}",
  "note.addedQueue": "Added to queue: {title}",
  "note.addedTo": "Added to {playlist}",
  "dialog.deleteSmart": 'Delete the smart playlist "{playlist}"?',
  "dialog.deleteSmartText": "Only the rules go; no songs are touched.",
  "dialog.delete": "Delete",
  "dialog.removeDownloads": "Remove all {count} downloaded songs from this PC?",
  "dialog.removeDownloadsText": "They stay in your library and play from YouTube again.",
  "dialog.remove": "Remove",
  "stats.period": "Period",
  "stats.minutesShort": "Minutes",
  "stats.recap": "Recap",
  "stats.minutes": "Minutes listened",
  "stats.plays": "Plays",
  "stats.artists": "Artists",
  "stats.streak": "Day streak",
  "stats.longest": "longest {days}",
  "stats.topArtists": "Top artists",
  "stats.topSongs": "Top songs",
  "stats.topArtist": "Top artist",
  "stats.topSong": "Top song",
  "stats.songsPlayed": "Songs played",
  "stats.daysListening": "Days listening",
  "stats.close": "Close",
  "note.volume": "Volume {volume}%",
  "note.noSuggestions": "No new suggestions right now",
  "note.savingTo": 'Saving {count} songs to "{playlist}" in the background',
  "note.addingTo": 'Adding {count} songs to "{playlist}" in the background',
  "note.recapCopied": "Recap card copied: paste it anywhere (Ctrl+V)",
  "note.recapSaved": "Recap card saved to Pictures\\Voltage",
  "note.themeSaved": 'Theme "{name}" saved',
  "note.lyricsDeleted": "Saved lyrics deleted ({count} song{s})",
  "note.queueReplaced": "Queue replaced \xB7 Ctrl+Z to undo",
  "note.sleepStopped": "Sleep timer: stopped after the song",
  "note.miniGhost": "Mini player see-through: same hotkey to undo",
  "note.noMoreResults": "No more results",
  "note.romanInstalled": "Romanization installed",
  "note.updateOut": "Voltage {version} is out \xB7 Settings > About to download it",
  "note.upToDate": "Voltage {version} is the newest version",
  "note.savedPlaylist": 'Saved "{playlist}"',
  "note.discoverOffline": "Discovery needs the internet",
  "note.discoverEmptyPlaylist": "Discovery needs a playlist with songs in it",
  "note.discoverNone": "No songs to discover for this playlist right now",
  "note.discoverNoMore": "Discovery: no more songs for this playlist right now",
  "note.notOnSpotifySkipped": "Not on Spotify: skipped {title}",
  "note.discoverNotOnSpotify": "Discovery: these songs aren't on Spotify. Switch to This PC to hear them.",
  "note.discoverAdded": "Added to {playlist}: {title}",
  "note.radioFrom": "Up next: songs like {title}",
  "note.sleepAfterSong": "Sleep timer: after this song",
  "note.sleepMinutes": "Sleep timer: {minutes} min",
  "note.sleepPaused": "Sleep timer: paused",
  "note.removalUndone": "Removal undone",
  "note.removedUnavailable": "Removed {count} unavailable song{s} \xB7 syncing with YouTube in the background",
  "note.removedDuplicates": "Removed {count} duplicate{s} \xB7 syncing with YouTube in the background",
  "note.libraryRefreshed": "Library refreshed",
  "note.savedWillSync": "{what}: saved, will sync when Google allows",
  "note.synced": "Synced {count} change{s} with YouTube",
  "note.created": 'Created "{playlist}"',
  "note.deletedPlaylist": 'Deleted "{playlist}"',
  "note.addedToLibrary": 'Added "{playlist}" to your library',
  "note.queueCleared": "Queue cleared",
  "note.discoverFinding": "Finding songs you haven't heard\u2026",
  "note.discoverNothingNew": "Nothing new to discover right now",
  "note.discoverFound": "Discover: {count} songs you haven't played",
  "note.offlineNotDownloaded": `Offline: "{title}" isn't downloaded`,
  "note.skippedUnplayable": 'Skipped "{title}": {reason} on YouTube',
  "note.noVideo": "No music video found for this song: showing the cover",
  "note.notOnSpotifyStuck": `"{title}" isn't on Spotify, and nothing after it could play on {device}. Switch to This PC to play it.`,
  "note.notOnSpotify": `"{title}" isn't on Spotify: skipped on {device}`,
  "note.playingOn": "Playing on {device}. Game auto-pause controls it too.",
  "note.spotifyConnected": "Spotify connected",
  "note.downloadsRemoved": "Removed {count} downloads",
  "note.backOnline": "Back online",
  "note.playlistEmpty": '"{playlist}" is empty',
  "note.queuedPlaylist": 'Added {count} songs from "{playlist}" to the queue',
  "note.backupSaved": "Backup saved to {path}",
  "note.switchedAccount": "Switched to {account}"
};
var MAX_STRING = 60;

// src/theme.js
var VOLTAGE = {
  bg: "#000000",
  text: "#f2f2f2",
  textDim: "#ffffff8c",
  glassBg: "#0000006b",
  glassBorder: "#ffffff12",
  glassBlur: 26,
  radius: 14,
  glowSize: 12,
  glowAlpha: 40,
  bgStrength: 0.6,
  font: "segoe",
  brand: "#a020f0",
  accentMode: "album",
  accent: "#a020f0"
};
var BUILTIN = [
  { id: "voltage", name: "Voltage", tokens: VOLTAGE },
  { id: "synthwave", name: "Synthwave", tokens: { ...VOLTAGE, bg: "#0b0014", text: "#ffeefe", textDim: "#ffdcff99", glassBg: "#14002373", glassBorder: "#ff3cc82e", glassBlur: 22, radius: 16, glowSize: 18, glowAlpha: 60, bgStrength: 0.75, font: "bahnschrift", brand: "#ff2fd1", accentMode: "fixed", accent: "#ff2fd1" } },
  { id: "midnight", name: "Midnight", tokens: { ...VOLTAGE, bg: "#050b1a", text: "#e8eefc", textDim: "#c8d7ff8c", glassBg: "#08102880", glassBorder: "#78a0ff1f", glassBlur: 30, radius: 12, glowSize: 10, glowAlpha: 35, bgStrength: 0.5 } },
  { id: "matrix", name: "Matrix", tokens: { ...VOLTAGE, bg: "#000a02", text: "#c8ffd0", textDim: "#8cffa08c", glassBg: "#0014058c", glassBorder: "#00ff5a2e", glassBlur: 18, radius: 4, glowSize: 14, glowAlpha: 55, bgStrength: 0.3, font: "cascadia", brand: "#00ff6a", accentMode: "fixed", accent: "#00ff6a" } },
  { id: "mono", name: "Monochrome", tokens: { ...VOLTAGE, bg: "#000000", text: "#ffffff", textDim: "#ffffff80", glassBg: "#ffffff0a", glassBorder: "#ffffff1f", glassBlur: 20, radius: 6, glowSize: 0, glowAlpha: 0, bgStrength: 0.25, font: "consolas", brand: "#ffffff", accentMode: "fixed", accent: "#ffffff" } },
  { id: "contrast", name: "High contrast", tokens: { ...VOLTAGE, bg: "#000000", text: "#ffffff", textDim: "#ffffffd9", glassBg: "#000000", glassBorder: "#ffffff99", glassBlur: 0, radius: 8, glowSize: 0, glowAlpha: 0, bgStrength: 0, brand: "#ffd400", accentMode: "fixed", accent: "#ffd400" } }
];
var current = BUILTIN[0];
var PKG_HOST = "http://vtheme.localhost";
var pkgUrl = (id, rel) => `${PKG_HOST}/${id}/${String(rel).split("/").map(encodeURIComponent).join("/")}`;
var SAFE_REL = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,5}$/;
var TOKEN_CATALOG = {
  "color.bg": ["--bg", "color"],
  "color.text": ["--text", "color"],
  "color.text-dim": ["--text-dim", "color"],
  "color.text-strong": ["--color-text-strong", "color"],
  "color.text-soft": ["--color-text-soft", "color"],
  "color.text-muted": ["--color-text-muted", "color"],
  "color.surface": ["--glass-bg", "color"],
  "color.border": ["--glass-border", "color"],
  "color.brand": ["--brand", "color"],
  "color.on-accent": ["--on-accent", "color"],
  "color.knob": ["--color-knob", "color"],
  "color.focus": ["--color-focus", "color"],
  "color.placeholder": ["--color-placeholder", "color"],
  "color.media-bg": ["--color-media-bg", "color"],
  "color.danger": ["--color-danger", "color"],
  "color.danger-bg": ["--color-danger-bg", "color"],
  "color.danger-soft": ["--color-danger-soft", "color"],
  "color.error-text": ["--color-error-text", "color"],
  "color.warn": ["--color-warn", "color"],
  "color.warn-soft": ["--color-warn-soft", "color"],
  "color.ok": ["--color-ok", "color"],
  "color.select-bg": ["--color-select-bg", "color"],
  "color.mini-solid": ["--color-mini-solid", "color"],
  "color.vinyl-groove": ["--color-vinyl-groove", "color"],
  "color.vinyl-label-ring": ["--color-vinyl-label-ring", "color"],
  "color.ink": ["--ink", "rgb"],
  "color.shade": ["--shade", "rgb"],
  "color.brand-rgb": ["--brand-rgb", "rgb"],
  "color.warn-rgb": ["--warn-rgb", "rgb"],
  "surface.menu": ["--surface-menu", "rgb"],
  "surface.pop": ["--surface-pop", "rgb"],
  "surface.drag": ["--surface-drag", "rgb"],
  "surface.game": ["--surface-game", "rgb"],
  "surface.tip": ["--surface-tip", "rgb"],
  "effect.blur": ["--glass-blur", "length"],
  "effect.glow-size": ["--glow-size", "length"],
  "effect.glow-alpha": ["--glow-alpha", "percent"],
  "accent.album-mix": ["--bg-strength", "number"],
  "shape.radius": ["--radius", "length"],
  "shape.roundness": ["--shape-k", "number"],
  "shape.radius-circle": ["--radius-circle", "length"],
  "shape.radius-pill": ["--radius-pill", "length"],
  "font.body": ["--font", "font"],
  "font.mono": ["--font-mono", "font"],
  "font.console": ["--font-console", "font"]
};
var TOKEN_ALIASES = { "shape.k": "shape.roundness" };
function toChannels(v) {
  const s = String(v ?? "").trim();
  if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(s)) return s.split(/\s+/).every((n) => +n <= 255) ? s.split(/\s+/).join(" ") : null;
  let m2 = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m2) {
    const h = m2[1].length === 3 ? [...m2[1]].map((c) => c + c).join("") : m2[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
  }
  m2 = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(s);
  if (m2) return [m2[1], m2[2], m2[3]].every((n) => +n <= 255) ? `${+m2[1]} ${+m2[2]} ${+m2[3]}` : null;
  if (typeof document === "undefined" || typeof CSS === "undefined" || !CSS.supports("color", s) || /[;{}<>\\]|url\(/i.test(s)) return null;
  const x = document.createElement("canvas").getContext("2d");
  x.fillStyle = "#000";
  x.fillStyle = s;
  return toChannels(x.fillStyle);
}
function validTokenValue(type, v) {
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string" || v.length > 200 || /[;{}<>\\]|url\(|expression\(|@import/i.test(v)) return false;
  const supports = (prop, val) => typeof CSS !== "undefined" && CSS.supports ? CSS.supports(prop, val) : true;
  if (type === "color") return supports("color", v);
  if (type === "rgb") return toChannels(v) !== null;
  if (type === "length") return supports("width", v) || v.trim() === "0";
  if (type === "percent") return /^\d+(\.\d+)?%$/.test(v.trim());
  if (type === "number") return Number.isFinite(+v);
  if (type === "font") return /^[\w\s"',.-]{1,200}$/.test(v);
  return false;
}
function tokenVars(tokens = {}, bad = []) {
  const vars = {};
  for (const [raw, v] of Object.entries(tokens ?? {})) {
    const name = TOKEN_ALIASES[raw] ?? raw;
    const def = TOKEN_CATALOG[name];
    if (!def) {
      bad.push(`${raw}: unknown token`);
      continue;
    }
    if (!validTokenValue(def[1], v)) {
      bad.push(`${raw}: not a valid ${def[1] === "rgb" ? "colour" : def[1]}`);
      continue;
    }
    vars[def[0]] = def[1] === "rgb" ? toChannels(v) : String(v);
  }
  for (const [col, ch] of [["--brand", "--brand-rgb"], ["--color-warn", "--warn-rgb"]]) {
    if (vars[col] && !vars[ch]) {
      const c = toChannels(vars[col]);
      if (c) vars[ch] = c;
    }
  }
  return vars;
}
var packageThemes = [];
var rawPackages = [];
function setPackages(list = []) {
  rawPackages = Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && p.manifest) : [];
  const byId = new Map(rawPackages.map((p) => [p.id, p]));
  const resolve = (id, depth = 0, seen = /* @__PURE__ */ new Set()) => {
    const p = byId.get(id);
    if (!p || depth > 8 || seen.has(id)) return null;
    seen.add(id);
    const m2 = p.manifest, report = { tokens: [], css: [], notes: [] };
    const parentId = typeof m2.extends === "string" ? m2.extends : "voltage";
    const builtin = BUILTIN.find((b) => b.id === parentId);
    const chain = [id];
    for (let x = parentId; x && byId.has(x) && !BUILTIN.some((b) => b.id === x); x = byId.get(x).manifest.extends) {
      if (chain.includes(x)) {
        chain.push(x);
        break;
      }
      chain.push(x);
    }
    const loops = chain.length > 1 && chain.indexOf(chain[chain.length - 1]) < chain.length - 1;
    const parent = loops ? null : builtin ? { tokens: builtin.tokens, vars: {}, modes: {}, css: "", fonts: [], pkgIds: [] } : resolve(parentId, depth + 1, seen);
    if (loops) report.notes.push(`"extends" goes round in a loop (${chain.join(" > ")}): using Voltage`);
    else if (!parent) report.notes.push(`extends "${parentId}", which isn't installed: using Voltage`);
    const base = parent ?? { tokens: BUILTIN[0].tokens, vars: {}, modes: {}, css: "", fonts: [], pkgIds: [] };
    const vars = { ...base.vars, ...tokenVars(m2.tokens, report.tokens) };
    const modes = {};
    for (const mode of ["light", "dark"]) modes[mode] = { ...base.modes?.[mode] ?? {}, ...tokenVars(m2.modes?.[mode], report.tokens) };
    const fonts = [...base.fonts ?? []];
    for (const f of Array.isArray(m2.fonts) ? m2.fonts.slice(0, 20) : []) {
      if (/^[\w -]{1,40}$/.test(f?.family ?? "") && SAFE_REL.test(f?.src ?? "") && /\.(woff2?|ttf|otf)$/i.test(f.src) && (!f.weight || /^\d{3}( \d{3})?$/.test(String(f.weight))) && (!f.style || /^(normal|italic)$/.test(f.style))) fonts.push({ ...f, pkg: id });
      else report.notes.push(`a font entry was skipped (family, src inside the package, woff2 / woff / ttf / otf, weight like 400 or "300 700")`);
    }
    const own = (p.css ?? "").replace(/url\(\s*(["']?)(?!data:|https?:|\/)([^"')]+)\1\s*\)/gi, (all, q, rel) => SAFE_REL.test(rel) ? `url("${pkgUrl(id, rel)}")` : all);
    const accent = m2.accent && typeof m2.accent === "object" ? m2.accent : null;
    const tokens = { ...base.tokens, ...accent?.mode === "fixed" && /^#[0-9a-f]{6}$/i.test(accent.color ?? "") ? { accentMode: "fixed", accent: accent.color } : accent?.mode === "album" ? { accentMode: "album" } : {} };
    for (const k of Object.keys(m2)) if (!["id", "name", "version", "author", "description", "minVoltage", "extends", "appearance", "tokens", "modes", "fonts", "css", "accent", "layout", "parts", "strings", "icons", "sounds", "overlay", "plugin", "supports", "holidays", "uses", "sprites", "hotspots", "split", "options", "transitions", "kind", "discord", "$schema"].includes(k)) report.notes.push(`unknown key "${k}"`);
    return {
      id,
      name: String(m2.name).slice(0, 60),
      pkg: true,
      version: String(m2.version ?? ""),
      author: String(m2.author ?? "").slice(0, 60),
      appearance: ["dark", "light", "system"].includes(m2.appearance) ? m2.appearance : base.appearance ?? "dark",
      tokens,
      vars,
      modes,
      fonts,
      css: [base.css, own].filter(Boolean).join("\n"),
      pkgIds: [...base.pkgIds ?? [], id],
      report,
      layout: m2.layout ? cleanLayout(m2.layout, report.notes) : base.layout ?? null,
      strings: { ...base.strings ?? {}, ...cleanStrings(m2.strings, report.notes) },
      icons: { ...base.icons ?? {}, ...cleanIcons(m2.icons, id, report.notes) },
      variants: { ...base.variants ?? {}, ...cleanVariants(m2.parts, report.notes) },
      supports: { ...base.supports ?? {}, ...cleanSupports(m2.supports, report.notes) },
      overlay: typeof m2.overlay === "boolean" ? m2.overlay : base.overlay ?? false,
      uses: Array.isArray(m2.uses) ? m2.uses.filter((u) => ["level", "beat", "pointer"].includes(u)) : base.uses ?? [],
      // round 15 F3 / F10
      sprites: { ...base.sprites ?? {}, ...cleanSprites(m2.sprites, report.notes) },
      // F6
      hotspots: m2.hotspots ? cleanHotspots(m2.hotspots, report.notes) : base.hotspots ?? [],
      // F5
      split: Array.isArray(m2.split) ? m2.split.filter((p2) => SPLIT_PARTS.includes(p2)) : base.split ?? [],
      // F13
      options: m2.options ? cleanOptions(m2.options, report.notes) : base.options ?? [],
      // F8
      transitions: m2.transitions === "view" ? "view" : base.transitions ?? null,
      // F9
      kind: m2.kind === "effect" ? "effect" : "theme",
      // F16: an effect pack stacks on any theme
      discord: typeof m2.discord === "string" && /^[A-Za-z0-9._/-]{1,80}\.css$/.test(m2.discord) && !m2.discord.includes("..") ? pkgUrl(id, m2.discord) : base.discord ?? null,
      // F18
      holidays: typeof m2.holidays === "boolean" ? m2.holidays : base.holidays ?? true,
      // false: no holiday hello with this theme (E3)
      sounds: { ...base.sounds ?? {}, ...cleanSounds(m2.sounds, id, report.notes) },
      plugin: typeof m2.plugin === "string" && /^[a-z0-9-]{1,40}$/.test(m2.plugin) ? m2.plugin : base.plugin ?? null
    };
  };
  packageThemes = rawPackages.map((p) => resolve(p.id)).filter(Boolean);
  return packageThemes;
}
var darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
var HOME_PARTS = ["sidebar", "search", "tracklist", "nowplaying", "art", "info", "player", "progress", "volume", "lyrics", "titlebar", "spacer"];
var VIEW_PARTS = {
  home: HOME_PARTS,
  nowplaying: ["art", "info", "lyrics", "progress", "player", "volume", "back", "video", "spacer"],
  mini: ["art", "info", "player", "progress", "volume", "expand", "spacer"],
  // R14-2 (2026-11-13): Explore and Stats, their own page as one part (it keeps its back button) beside the player parts
  explore: ["explore", "art", "info", "lyrics", "progress", "player", "volume", "spacer"],
  stats: ["stats", "art", "info", "lyrics", "progress", "player", "volume", "spacer"]
};
var VIEW_NEEDS = {
  home: (p) => (p.has("sidebar") || p.has("tracklist")) && (p.has("nowplaying") || p.has("player")) ? null : "it must show the song list (sidebar or tracklist) and a way to play (nowplaying or player)",
  nowplaying: (p) => p.has("player") ? null : "the full player must have the play controls (player)",
  mini: (p) => p.has("player") ? null : "the mini player must have the play controls (player)",
  explore: (p) => p.has("explore") ? null : "Explore must show its page (explore)",
  stats: (p) => p.has("stats") ? null : "Stats must show its page (stats)"
};
var AREA = /^([a-z][a-z0-9-]{0,30}|\.)$/;
var gridValue = (v) => typeof v === "string" && v.length <= 200 && !/[;{}<>\\]|url\(|expression\(/i.test(v) && (typeof CSS === "undefined" || !CSS.supports || CSS.supports("grid-template-columns", v));
function columnTracks(cols) {
  if (!cols || /repeat\(/i.test(cols)) return null;
  const out = [];
  let depth = 0, cur = "";
  for (const ch of cols.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function resizeEdge(t, area) {
  const rows = t.areas.map((r) => r.split(" "));
  const n = rows[0].length;
  const tracks = columnTracks(t.columns);
  if (!tracks || tracks.length !== n) return null;
  const xs = rows.flatMap((r) => r.map((a, x) => a === area ? x : -1)).filter((x) => x >= 0);
  if (!xs.length) return null;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1 && x1 < n - 1) return { track: x1, side: "right" };
  if (x0 === x1 && x0 > 0) return { track: x0, side: "left" };
  return null;
}
function cleanTemplate(t, where, report, view = "home") {
  const allowed = VIEW_PARTS[view];
  if (!t || typeof t !== "object") {
    report.push(`${where}: not an object`);
    return null;
  }
  const rows = Array.isArray(t.areas) ? t.areas.slice(0, 12).map((r) => String(r).trim().split(/\s+/)) : null;
  if (!rows?.length || rows.some((r) => !r.length || r.some((a) => !AREA.test(a))) || rows.some((r) => r.length !== rows[0].length)) {
    report.push(`${where}: "areas" must be rows of names (a-z, 0-9, -, or . for empty), each row the same length`);
    return null;
  }
  const names = new Set(rows.flat().filter((a) => a !== "."));
  for (const n of names) {
    const cells = rows.flatMap((r, y) => r.map((a, x) => a === n ? [x, y] : null)).filter(Boolean);
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    if ((Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) !== cells.length) {
      report.push(`${where}: area "${n}" isn't a rectangle`);
      return null;
    }
  }
  const out = { areas: rows.map((r) => r.join(" ")), place: {} };
  for (const k of ["columns", "rows"]) {
    if (t[k] == null) continue;
    if (!gridValue(String(t[k]))) {
      report.push(`${where}: "${k}" isn't a grid size list`);
      return null;
    }
    out[k] = String(t[k]);
  }
  const used = /* @__PURE__ */ new Set();
  for (const [area, part] of Object.entries(t.place ?? {})) {
    if (!names.has(area)) {
      report.push(`${where}: "${area}" isn't one of the areas`);
      continue;
    }
    if (!allowed.includes(part) && !/^slot:[a-z0-9-]{1,30}$/.test(part)) {
      report.push(`${where}: "${part}" isn't a part that can be placed here (${allowed.join(", ")}, slot:<name>)`);
      continue;
    }
    if (used.has(part) && part !== "spacer") {
      report.push(`${where}: "${part}" is placed twice`);
      continue;
    }
    used.add(part);
    out.place[area] = part;
  }
  const missing = VIEW_NEEDS[view](new Set(Object.values(out.place)));
  if (missing) {
    report.push(`${where}: refused: ${missing}`);
    return null;
  }
  if (t.resizable != null) {
    const want = Array.isArray(t.resizable) ? t.resizable.map(String) : [];
    const ok = want.filter((a) => names.has(a) && resizeEdge(out, a));
    for (const a of want) if (!ok.includes(a)) report.push(`${where}.resizable: "${a}" can't be resized (it must be an area that spans whole columns, beside another column, and "columns" can't use repeat())`);
    if (ok.length) out.resizable = ok;
  }
  return out;
}
function cleanLayout(layout, report = []) {
  if (!layout || typeof layout !== "object") return null;
  const out = {};
  for (const [view, t] of Object.entries(layout)) {
    if (!VIEW_PARTS[view]) {
      report.push(`layout.${view}: can't be laid out (${Object.keys(VIEW_PARTS).join(", ")})`);
      continue;
    }
    const base = cleanTemplate(t, `layout.${view}`, report, view);
    if (!base) continue;
    const below = [];
    for (const [w, bt] of Object.entries(t.below ?? {})) {
      const max = /^(\d{3,4})px$/.exec(w);
      if (!max) {
        report.push(`layout.${view}.below: "${w}" must be a width like "900px"`);
        continue;
      }
      const c = cleanTemplate(bt, `layout.${view}.below.${w}`, report, view);
      if (c) below.push({ max: +max[1], ...c });
    }
    out[view] = { ...base, below: below.sort((a, b) => a.max - b.max) };
  }
  return Object.keys(out).length ? out : null;
}
var BAR_HOME = cleanLayout({ home: {
  areas: ["list now now", "prog prog prog", "bar bar vol"],
  columns: "minmax(280px, 360px) 1fr minmax(180px, 260px)",
  rows: "minmax(0, 1fr) 50px 68px",
  place: { list: "sidebar", now: "nowplaying", prog: "progress", bar: "player", vol: "volume" },
  below: { "800px": { areas: ["list", "prog", "bar"], columns: "1fr", rows: "minmax(0, 1fr) 50px 68px", place: { list: "sidebar", prog: "progress", bar: "player" } } }
} })?.home ?? null;
var ICON_NAMES = /* @__PURE__ */ new Set();
function registerIconNames(list) {
  ICON_NAMES = new Set(list);
}
function cleanStrings(strings, report = []) {
  const out = {};
  for (const [k, v] of Object.entries(strings && typeof strings === "object" ? strings : {})) {
    if (!(k in STRINGS)) {
      report.push(`strings: "${k}" isn't a label that can be renamed`);
      continue;
    }
    if (typeof v !== "string" || !v.trim() || v.length > MAX_STRING || /[\u0000-\u001f\u007f]/.test(v)) {
      report.push(`strings: "${k}" must be plain text up to ${MAX_STRING} characters`);
      continue;
    }
    out[k] = v;
  }
  return out;
}
function cleanIcons(icons, pkgId, report = []) {
  const out = {};
  for (const [n, v] of Object.entries(icons && typeof icons === "object" ? icons : {})) {
    if (ICON_NAMES.size ? !ICON_NAMES.has(n) : !/^[a-zA-Z]{1,24}$/.test(n)) {
      report.push(`icons: "${n}" isn't an icon name`);
      continue;
    }
    if (typeof v === "string" && SAFE_REL.test(v) && /\.(svg|png|webp)$/i.test(v)) out[n] = { url: pkgUrl(pkgId, v) };
    else if (v && typeof v === "object" && typeof v.text === "string" && v.text.length >= 1 && v.text.length <= 8 && !/[\u0000-\u001f]/.test(v.text)) out[n] = { text: v.text };
    else report.push(`icons: "${n}" must be an svg / png / webp in the package or {"text": "..."} (up to 8 characters)`);
  }
  return out;
}
var THEME_SUPPORTS = {
  background: ["bgStyle", ["gradient", "cover", "video", "black"]],
  miniSkin: ["miniSkin", ["classic", "vinyl", "cassette", "ring", "strip"]]
};
function cleanSupports(sup, report = []) {
  const out = {};
  for (const [name, vals] of Object.entries(sup && typeof sup === "object" ? sup : {})) {
    const def = THEME_SUPPORTS[name];
    if (!def) {
      report.push(`supports: "${name}" isn't a setting a theme can restrict (${Object.keys(THEME_SUPPORTS).join(", ")})`);
      continue;
    }
    const ok = (Array.isArray(vals) ? vals : []).filter((v) => def[1].includes(v));
    if (!ok.length) {
      report.push(`supports.${name}: list one or more of ${def[1].join(", ")}`);
      continue;
    }
    out[def[0]] = ok;
  }
  return out;
}
var WORD = /^[a-z][a-z0-9-]{0,23}$/;
function cleanSprites(sp, report = []) {
  const out = {};
  for (const [name, v] of Object.entries(sp && typeof sp === "object" ? sp : {})) {
    const cls = String(v?.class ?? name).split(/\s+/).filter((c) => WORD.test(c)).slice(0, 3);
    const life = Math.round(Number(v?.life ?? 1e3));
    if (!WORD.test(name) || !cls.length || !(life >= 100 && life <= 1e4)) {
      report.push(`sprites.${name}: a name, "class" (a-z words) and "life" 100-10000 ms`);
      continue;
    }
    if (Object.keys(out).length >= 32) {
      report.push("sprites: 32 at most");
      break;
    }
    out[name] = { cls, life };
  }
  return out;
}
var HOTSPOT_ACTIONS = ["play-pause", "next", "previous", "like", "shuffle", "repeat", "mini", "lyrics", "view:main", "view:explore", "view:stats", "view:nowplaying"];
var PCT = /^\d{1,3}(\.\d+)?%$/;
function cleanHotspots(list, report = []) {
  const out = [];
  for (const h of Array.isArray(list) ? list.slice(0, 16) : []) {
    const rect = Array.isArray(h?.rect) && h.rect.length === 4 && h.rect.every((r) => PCT.test(String(r))) ? h.rect.map(String) : null;
    const ok = WORD.test(h?.id ?? "") && /^([a-z][a-z0-9.-]{0,40}|area:[a-z][a-z0-9-]{0,30})$/.test(h?.part ?? "") && rect && (HOTSPOT_ACTIONS.includes(h.action) || h.event && WORD.test(h.event));
    if (!ok) {
      report.push(`hotspots: "${h?.id}" needs id, part, rect ["x%","y%","w%","h%"] and an action (${HOTSPOT_ACTIONS.join(", ")}) or an event`);
      continue;
    }
    out.push({
      id: h.id,
      part: h.part,
      rect,
      action: HOTSPOT_ACTIONS.includes(h.action) ? h.action : null,
      event: h.event && WORD.test(h.event) ? h.event : null,
      label: String(h.label ?? h.id).slice(0, 40)
    });
  }
  return out;
}
var SPLIT_PARTS = ["info.title", "titlebar.brand", "nowplaying.idle"];
function cleanOptions(list, report = []) {
  const out = [];
  for (const o of Array.isArray(list) ? list.slice(0, 12) : []) {
    const base = WORD.test(o?.id ?? "") && ["switch", "choice", "slider"].includes(o?.type);
    const values = o?.type === "choice" ? Array.isArray(o.values) ? o.values.map(String).filter((v) => WORD.test(v) || /^\d{1,4}$/.test(v)).slice(0, 8) : [] : null;
    const min = Number(o?.min ?? 0), max = Number(o?.max ?? 100);
    if (!base || o.type === "choice" && values.length < 2 || o.type === "slider" && !(max > min)) {
      report.push(`options: "${o?.id}" needs id, type (switch / choice / slider), values for a choice, min < max for a slider`);
      continue;
    }
    const def = o.type === "switch" ? !!o.default : o.type === "choice" ? values.includes(String(o.default)) ? String(o.default) : values[0] : Math.min(max, Math.max(min, Number(o.default ?? min)));
    out.push({ id: o.id, type: o.type, label: String(o.label ?? o.id).slice(0, 40), values, min, max, step: Number(o.step ?? 1), default: def });
  }
  return out;
}
var VARIANTS = {
  player: ["panel", "compact", "text", "bar"],
  // bar: R14-3, a bar along the bottom (BAR_HOME) when the theme has no home layout
  progress: ["wave", "line", "blocks", "ascii", "none"],
  tracklist: ["rows", "dense", "table", "text", "cards"],
  // cards: R14-3, a grid of cover cards
  nav: ["icons", "text", "tabs", "sidebar"],
  // R14-3: tabs beside the brand, or a rail down the left
  art: ["cover", "round", "vinyl", "none"],
  lyrics: ["karaoke", "plain", "ticker"],
  titlebar: ["full", "minimal", "hidden"]
};
function cleanVariants(parts, report = []) {
  const out = {};
  for (const [part, v] of Object.entries(parts && typeof parts === "object" ? parts : {})) {
    const variant = v && typeof v === "object" ? v.variant : v;
    if (!VARIANTS[part]) {
      report.push(`parts: "${part}" has no variants (${Object.keys(VARIANTS).join(", ")})`);
      continue;
    }
    if (!VARIANTS[part].includes(variant)) {
      report.push(`parts.${part}: "${variant}" isn't one of ${VARIANTS[part].join(", ")}`);
      continue;
    }
    if (variant !== VARIANTS[part][0]) out[part] = variant;
  }
  return out;
}
var SOUND_EVENTS = ["click", "hover", "navigate", "open", "close", "play", "pause", "skip", "like", "notify", "error", "holiday"];
function cleanSounds(sounds, pkgId, report = []) {
  const out = {};
  for (const [ev, rel] of Object.entries(sounds && typeof sounds === "object" ? sounds : {})) {
    if (!SOUND_EVENTS.includes(ev)) {
      report.push(`sounds: "${ev}" isn't an event (${SOUND_EVENTS.join(", ")})`);
      continue;
    }
    if (typeof rel !== "string" || !SAFE_REL.test(rel) || !/\.(ogg|wav|mp3)$/i.test(rel)) {
      report.push(`sounds.${ev}: an ogg / wav / mp3 file in the package`);
      continue;
    }
    out[ev] = pkgUrl(pkgId, rel);
  }
  return out;
}

// tools/theme-check.mjs
var args = process.argv.slice(2);
var dir = args.find((a) => !a.startsWith("--"));
var strict = args.includes("--strict");
if (!dir || !existsSync(dir)) {
  console.error(`usage: node theme-check.mjs <theme folder> [--strict]${dir ? `
"${dir}" isn't a folder` : ""}`);
  process.exit(2);
}
registerIconNames(typeof define_VOLTAGE_ICON_NAMES_default !== "undefined" ? define_VOLTAGE_ICON_NAMES_default : [...readFileSync(new URL("../src/ui.jsx", import.meta.url), "utf8").matchAll(/^  ([a-zA-Z]+): '/gm)].map((m2) => m2[1]));
var errors = [];
var warnings = [];
var TYPES = ["json", "css", "png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "woff2", "woff", "ttf", "otf", "ogg", "wav", "mp3", "txt", "md"];
var SAFE = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,5}$/;
var svgOk = (t) => {
  const s = t.toLowerCase();
  if (["<script", "foreignobject", "javascript:", "<!entity", "<!doctype", "<iframe", "<embed", "<object", "data:text/html"].some((b) => s.includes(b))) return false;
  if (/[\s/]on[a-z]+\s*=/.test(s) || /attributename|<set[\s/>]|<animate/.test(s)) return false;
  if ([...s.matchAll(/url\(\s*["']?([^"')\s]*)/g)].some((m2) => !m2[1].startsWith("#"))) return false;
  return ![...s.matchAll(/href\s*=\s*["']?([^"'\s>]*)/g)].some((m2) => !m2[1].startsWith("#"));
};
var total = 0;
var files = [];
var walk = (d, rel = "") => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f), r = rel ? `${rel}/${f}` : f, st = lstatSync(p);
    if (st.isSymbolicLink()) {
      errors.push(`${r}: links aren't allowed`);
      continue;
    }
    if (st.isDirectory()) {
      walk(p, r);
      continue;
    }
    const ext = f.split(".").pop().toLowerCase();
    if (!SAFE.test(r) || !TYPES.includes(ext)) {
      errors.push(`${r}: not an allowed file (images, fonts, sounds, theme.json, CSS; plain names only)`);
      continue;
    }
    if (ext === "css" && st.size > 512 * 1024) errors.push(`${r}: CSS is limited to 512 KB`);
    if (["ogg", "wav", "mp3"].includes(ext) && st.size > 1024 * 1024) errors.push(`${r}: sounds are limited to 1 MB`);
    if (ext === "svg" && !svgOk(readFileSync(p, "utf8"))) errors.push(`${r}: this SVG has scripts, links or other active content`);
    total += st.size;
    files.push(r);
  }
};
walk(dir);
if (total > 25 * 1024 * 1024) errors.push(`the theme is ${(total / 1048576).toFixed(1)} MB (25 MB at most)`);
if (files.length > 500) errors.push(`${files.length} files (500 at most)`);
if (strict) {
  for (const f of files.filter((r) => /\.(woff2?|ttf|otf)$/i.test(r))) {
    const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
    if (!files.some((r) => r.startsWith(d) && /^(ofl|licen[cs]e|copying)[^/]*\.(txt|md)$/i.test(r.slice(d.length)))) warnings.push(`${f}: no licence file (OFL.txt or LICENSE.txt) next to this font`);
  }
}
var m = null;
try {
  m = JSON.parse(readFileSync(path.join(dir, "theme.json"), "utf8"));
} catch (e) {
  errors.push(`theme.json: ${e.message}`);
}
if (m) {
  if (!/^[a-z0-9-]{1,40}$/.test(m.id ?? "") || /^(c-|p-|-)/.test(m.id) || ["voltage", "synthwave", "midnight", "matrix", "mono", "contrast"].includes(m.id)) errors.push(`"id" must be 1-40 of a-z, 0-9 and -, and not a built-in theme's id`);
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 60) errors.push('"name" is needed (up to 60 characters)');
  if (typeof m.version !== "string") errors.push('"version" is needed (a string, like "1.0.0")');
  const css = typeof m.css === "string" ? (() => {
    try {
      return readFileSync(path.join(dir, m.css), "utf8");
    } catch {
      errors.push(`"css": ${m.css} isn't in the package`);
      return "";
    }
  })() : "";
  const [t] = setPackages([{ id: m.id, manifest: m, css }]);
  if (t) {
    warnings.push(...t.report.tokens, ...t.report.notes);
    for (const ref of [...(m.fonts ?? []).map((f) => f?.src), ...Object.values(m.icons ?? {}).filter((v) => typeof v === "string"), ...Object.values(m.sounds ?? {})]) {
      if (typeof ref === "string" && !files.includes(ref)) errors.push(`${ref}: named in theme.json but not in the package`);
    }
  }
  for (const [re, what] of [[/@import/i, "@import (removed)"], [/url\(\s*["']?(https?:|\/\/)/i, "url() to the internet (removed: a theme loads nothing from outside)"], [/position\s*:\s*fixed/i, 'position: fixed (removed: use "overlay": true for full-window layers)'], [/\[\s*value|placeholder\]/i, "selectors on typed values (removed)"]]) {
    if (re.test(css)) warnings.push(`theme.css: ${what}`);
  }
}
for (const e of errors) console.log(`ERROR    ${e}`);
for (const w of warnings) console.log(`dropped  ${w}`);
console.log(errors.length ? `
${errors.length} error(s): Voltage would refuse this theme.` : warnings.length ? `
OK to install; ${warnings.length} thing(s) above are dropped.` : "\nOK: nothing to fix.");
console.log(`${files.length} files, ${(total / 1024).toFixed(0)} KB, ${Object.keys(TOKEN_CATALOG).length} tokens known.`);
process.exit(errors.length || strict && warnings.length ? 1 : 0);
