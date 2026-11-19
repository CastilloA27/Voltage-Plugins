# Voltage plugins

Official plugins for Voltage, the YouTube Music desktop client for Windows. Install them from inside Voltage:
**Settings › Plugin store** (filter by kind, status and tags; every file is checked against the signed catalog). Theme
packages live in the separate [Voltage-Themes](https://github.com/CastilloA27/Voltage-Themes) repo, the theme store.

| Plugin | What it does | Needs |
|---|---|---|
| [Legcord live theme](legcord-theme) | Discord in [Legcord](https://legcord.app) takes on Voltage's look: black, the album gradient behind dark glass, accent borders and neon glow, all in the colours of the song you're playing, fading with every change. Or just the accent colour on top of your own theme. | Legcord. Reads and changes `%APPDATA%\legcord\quickCss.css` (only its own marked block; your Quick CSS stays as it is, and turning the plugin off gives the file back unchanged) |
| [Voice chat ducking](voice-duck) | Lowers the music while people talk in Discord, Legcord, TeamSpeak or Mumble, and brings it back a second after they stop. Level and sensitivity adjustable. | Voltage 1.6+. Sees how loud those apps are (never what they play); lowers the PC player only |
| [Visualizer pack](visualizers) | Three more progress-bar animations in the song's colours: Particles, Ribbon, Pixel blocks (Settings › Appearance › Progress animation). | Voltage 1.6+. Draws in the player |
| [Headphone correction (AutoEQ)](autoeq) | Pick your headphones from ~8,850 measured profiles (AutoEQ project) and their correction EQ is applied on top of your own EQ. | Voltage 1.6.1+. Downloads profiles from the AutoEq repository on GitHub only |
| [More lyrics sources](more-lyrics) | Adds Kugou and QQ Music as lyrics sources: word-by-word timed lyrics for many Japanese, Chinese and Korean songs; they show up in the lyrics view's source menu. | Voltage 1.6+. Talks to Kugou's and QQ Music's lyrics search only |
| [Song facts](song-facts) | Everything about a song: release, writers and producers, samples, the artist's story, the song's and the album's own Wikipedia articles (in the song's language first); with a free Genius token, what it means, line-by-line explanations (also as marks on Voltage's lyrics) and the album's story. Right-click a song > Song facts, the full player's Details tab, or under the song in Discovery. | Voltage 1.10.0+ (1.3.0). MusicBrainz, Wikidata, Wikipedia and (with your token) Genius only |
| [Lyrics fixer](lyrics-fixer) | Make your own timed lyrics: tap along as each line starts, nudge, save as "My lyrics", optionally share on lrclib.net. | Voltage 1.6+. LRCLIB only |
| [Streaks & achievements](streaks) | Listening streaks and badges (night owl, on repeat, explorer, marathon…) in its own window, with a notification when you earn one. Counts from when it's installed; nothing leaves your PC. | Voltage 1.4+. Its own window |
| [Version filter](version-filter) | Radio and autoplay leave out the versions you don't want: sped up / nightcore, slowed + reverb, live, remixes, karaoke and instrumentals, covers, 8D. Only songs the radio adds by itself; a song you pick always plays. | Voltage 1.6.1+. Changes the queue (its own radio picks only) |
| [Better covers](better-covers) | When a song only has a video frame as its art, finds its album cover on Apple's iTunes catalogue (strict match: same artist, title and album) and Voltage shows that instead. | Voltage 1.6.1+. itunes.apple.com search only |
| [Similar artists](similar-artists) | A panel with artists like the one you're playing, from ListenBrainz (what people listen to together); click one to open their page in Voltage. | Voltage 1.6.1+. MusicBrainz and ListenBrainz only |
| [Voltage for Discord](discord/shelter) | Not in the store: a helper for Discord (Legcord + Shelter, installed in Shelter by URL). A mini player in Discord, the song's colours and cover (or the music video) as Discord's look, a theme's own Discord CSS, voice-chat ducking. | Voltage 1.6.1+ with Settings › Integrations › Voltage for Discord on; Discord on your PC only (127.0.0.1), asks you once to allow it |

### Theme helpers

A theme can name a helper plugin for effects CSS can't do alone; when you switch to that theme, Voltage offers to install
it and shows what it may do. They only act while their theme is the active one (capability `ui.fx`).

| Plugin | For the theme | What it adds | Needs |
|---|---|---|---|
| [Reels](reels) | Jackpot | a rarity per song (from its plays and popularity), the reels land to match; coins on a winning line | Voltage 1.7.1+ (coins 1.7.2+) |
| [VU meter](vu-meter) | Studio | the meters' needles follow how loud the music is (a level, never the sound) | Voltage 1.7.1+ |
| [Aurora sky](aurora-sky) | Aurora | WebGL northern lights in the album's colours, a different sky per song; 30 fps playing, 4 paused, none while gaming | Voltage 1.7.2+ |
| [Departures board](departures) | Departures | the clock time each upcoming song starts, from the queue | Voltage 1.7.2+ |
| [JRPG battle](jrpg-battle) | JRPG | seeking forward deals damage, skipping runs away, a level from your listening time | Voltage 1.7.2+ |
| [Word rain](word-rain) | Word Rain | the sung words fall and pile up behind the player | Voltage 1.7.2+, synced lyrics |

## Unfinished, for builders

Kept in this repo but not offered in the catalog:

| Plugin | State |
|---|---|
| [League of Legends](league) | Game pack, never tested in a real match. See [league/README.md](league/README.md) to install it from a folder and test it with the simulator |
| [OBS: now playing](obs) | Parked. Tested against a stand-in OBS server (`tools/fake-obs.mjs`), not a real OBS |

## How plugins work

- A plugin is a folder with `plugin.json` and one script. Voltage runs the script in a sandboxed Web Worker: no access to
  the page, Voltage's internals, your accounts or the network. It talks to Voltage only through the `voltage` object.
- What a plugin may do is listed in its `plugin.json` and shown before you turn it on, in three tiers: tier 1 (events, its
  own storage, notices) needs nothing; tier 2 (playback, panels, themes, lyrics, ...) is listed when you turn it on; tier 3
  (files, the internet, game logs) is shown in red and allowed only for plugins from this signed catalog, or with
  Settings › Plugins › Developer mode on. An update that changes the permissions has to be approved again.
- Every file in `catalog.json` carries a sha256. Voltage refuses a download that doesn't match.

## Making one

Everything a plugin author needs is in this repo; nothing needs the Voltage app's source.

- **[GUIDE.md](GUIDE.md)**: the manifest, every setting type, the capability table (tier and minimum Voltage version), the
  events, panels and slots, budgets, packaging, testing, the API promise.
- [`sdk/voltage.d.ts`](sdk/voltage.d.ts): types for your editor; [`sdk/mock-host.mjs`](sdk/mock-host.mjs): runs your plugin
  in Node for unit tests, from any folder.
- Start by copying [`streaks`](streaks) and its test [`tests/streaks.test.mjs`](tests/streaks.test.mjs); change `id`
  (lowercase, digits, `-`; the same as the folder name).
- In Voltage: Settings › Plugins › **Install from a folder**, then turn it on. Logs go to Voltage's log (Settings › About ›
  Open logs). A plugin with tier-3 permissions needs Developer mode for that.
- Themes: **[THEMING.md](THEMING.md)**, the generated reference in [`themes/`](themes) and the checker
  [`sdk/theme-check.mjs`](sdk/theme-check.mjs).
- For an official plugin, add the folder here and run `node build-catalog.mjs`.

## Catalog signature

`catalog.json` is signed with an Ed25519 key that never leaves the maintainer's PC (`catalog.json.sig`). Voltage has the
public key built in and refuses the official catalog when the signature doesn't verify, so a compromised GitHub account
alone can't ship plugin updates. `node build-catalog.mjs` signs automatically (key:
`%USERPROFILE%\.voltage-signing\catalog-ed25519.pem.dpapi`, DPAPI-encrypted for the maintainer's Windows user;
`--export-key` prints it for an offline backup; or `VOLTAGE_SIGNING_KEY`).
