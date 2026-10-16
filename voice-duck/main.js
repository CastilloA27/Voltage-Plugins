// Voice chat ducking: Voltage reports how loud the voice apps are (capability audio.sessions, ~20 levels a second while
// anything is audible, never the audio itself); when it stays above the threshold for 150 ms the music drops quickly,
// and a second after it goes quiet it comes back slowly. Only the PC player is lowered (not a Spotify speaker).
// Electron apps play everything from one session, so their notification sounds dip the music briefly too.
const APPS = {
  discord: ['legcord.exe', 'discord.exe', 'discordptb.exe', 'discordcanary.exe', 'vesktop.exe', 'webcord.exe'],
};
APPS.all = [...APPS.discord, 'teamspeak.exe', 'ts3client_win64.exe', 'mumble.exe', 'guilded.exe'];
const THRESHOLD = { high: 0.012, medium: 0.03, low: 0.08 }; // peak level 0..1
const ATTACK_MS = 150, RELEASE_MS = 1000;

let settings = { level: 30, sensitivity: 'medium', apps: 'discord' };
let loudSince = 0, ducked = false, release = null, watching = false;

// mpv's volume is cubic, so "30 % of the music" is 60·log10(0.3) dB (same as Voltage's game duck)
const db = () => Math.max(-60, 60 * Math.log10(Math.max(1, settings.level) / 100));

function up() {
  clearTimeout(release);
  release = null;
  if (ducked) { ducked = false; voltage.playback.duck(0, 700); }
}

voltage.on('settings', async (s) => {
  const appsChanged = s.apps !== settings.apps;
  settings = { ...settings, ...s };
  if (ducked) voltage.playback.duck(db(), 300); // a new level applies right away
  if (appsChanged || !watching) await watch();
});

async function watch() {
  try { await voltage.audio.watch(APPS[settings.apps] ?? APPS.discord); watching = true; } catch (e) { voltage.log(`watch failed: ${e}`); }
}

voltage.on('audio', ({ levels }) => {
  const peak = Math.max(0, ...Object.values(levels || {}));
  const now = Date.now();
  if (peak >= (THRESHOLD[settings.sensitivity] ?? THRESHOLD.medium)) {
    if (!loudSince) loudSince = now;
    clearTimeout(release);
    release = null;
    if (!ducked && now - loudSince >= ATTACK_MS) { ducked = true; voltage.playback.duck(db(), 150); }
  } else {
    loudSince = 0;
    // quiet frames stop arriving after the first one, so the release is a timer, not a frame count
    if (ducked && !release) release = setTimeout(up, RELEASE_MS);
  }
});

voltage.on('stop', () => { up(); return voltage.audio.unwatch().catch(() => {}); });
