// Types for Voltage's plugin API (the `voltage` object every plugin script gets). Voltage 1.6.
// Use: add `/// <reference path="../sdk/voltage.d.ts" />` at the top of your main.js (or copy this file next to it) and
// your editor completes and checks the API. The API promise: nothing here is removed or changed incompatibly in Voltage 1.x;
// new things are only added (they need a newer Voltage: declare it with "minVoltage" in plugin.json).

declare namespace Voltage {
  interface Track { id: string; title: string; artist: string; album?: string; thumb?: string }
  interface Palette { accent: string; c1: string; c2: string; onAccent: string; idle: boolean }
  interface ThemeTokens {
    bg: string; text: string; textDim: string; glassBg: string; glassBorder: string; glassBlur: number; radius: number;
    glowSize: number; glowAlpha: number; bgStrength: number; font: string; brand: string; accentMode: 'album' | 'fixed'; accent: string;
  }
  interface Theme { id: string; name: string; tokens: ThemeTokens }
  type GameState = 'menu' | 'loading' | 'in_match' | 'dead' | 'spectating' | 'round_over' | 'match_over';
  interface LyricLine { t: number; text: string; words?: { t: number; w: string }[] }
  interface Lyrics { source: string; synced: boolean; wordSynced?: boolean; lines: LyricLine[] }
  interface LyricsRequest { rid: string; id: string; title: string; artist: string; album?: string; dur: number }
  interface EqBand { type: 'peak' | 'lowshelf' | 'highshelf'; f: number; gain: number; q?: number }
  interface FetchResult { status: number; contentType: string | null; location: string | null; json: unknown; text: string }

  /** Event name -> what the handler gets. Events marked "on demand" are only sent once you listen for them. */
  interface Events {
    palette: Palette;
    track: Track | null;
    playing: boolean;
    /** A fullscreen game is in front: stop anything costly (animation, polling). */
    gaming: boolean;
    /** Voltage's window is shown (false: hidden in the tray or minimized). */
    visible: boolean;
    theme: Theme;
    background: { style: 'gradient' | 'cover' | 'black'; image: string | null };
    /** Your settings (plugin.json "settings"), on start and on every change. */
    settings: Record<string, unknown>;
    /** Turned off ('disable') or Voltage is quitting ('quit'): clean up within ~1.5 s. */
    stop: 'disable' | 'quit';
    /** On demand. Once a second, and at once after a seek. */
    position: { pos: number; dur: number };
    /** On demand. Up to 200 tracks around the current one. */
    queue: { index: number; tracks: Pick<Track, 'id' | 'title' | 'artist'>[] };
    /** On demand. The line being sung. */
    lyric: { index: number; text: string } | null;
    /** On demand. Voltage's game watcher (built-in games and packs). */
    game: { game: string; state: GameState; label: string } | null;
    /** Capability audio.sessions, after voltage.audio.watch(). Levels 0..1 per exe name, ~20 per second. */
    audio: { levels: Record<string, number> };
    /** Capability audio.level (Voltage 1.6+), on demand: how loud Voltage's own music is (peak 0..1), ~20 per second while
     *  it plays on this PC; silence is sent once. A level only, never the sound. */
    level: { level: number };
    /** Capability ui.canvas: your progress-bar style was picked; draw on this OffscreenCanvas. */
    canvas: { id: string; canvas: OffscreenCanvas; style: string; width: number; height: number; dpr: number };
    'canvas-resize': { id: string; width: number; height: number };
    'canvas-gone': { id: string };
    /** Capability ui.panel: your window was opened or closed. */
    panel: { open: boolean };
    /** Capability ui.panel: a click on an element with data-action. */
    'panel-action': { action: string; value?: string; form?: Record<string, string> };
    /** Capability lyrics.provider: answer with voltage.lyrics.provide(rid, ...). */
    'lyrics-request': LyricsRequest;
  }

  interface Api {
    on<K extends keyof Events>(name: K, handler: (data: Events[K]) => void | Promise<void>): void;
    /** Any capability by name; the helpers below are easier. Rejects with an Error whose message says why. */
    call(capability: string, args?: Record<string, unknown>): Promise<unknown>;
    /** A short notice in Voltage (at most 3 per 10 s). */
    notify(text: string): void;
    /** A line in Voltage's log (Settings > About > Open logs folder), at most 20 per second. */
    log(...parts: unknown[]): void;
    /** Tier 1: your own key/value store, kept across restarts and updates; 256 KB in all, at most 5 writes a second. */
    storage: {
      get(key: string): Promise<unknown>;
      set(key: string, value: unknown): Promise<void>;
      all(): Promise<Record<string, unknown>>;
    };
    /** Capability playback.control. duck: lower the music by db (-60..0; 0 = normal again) over ms. */
    playback: {
      pause(): Promise<void>; resume(): Promise<void>; next(): Promise<void>; prev(): Promise<void>;
      duck(db: number, ms?: number): Promise<void>;
    };
    /** Capability ui.panel + plugin.json provides.panel {title}. Plain HTML/CSS only (no scripts, no url(), data: images). */
    panel: { render(html: string, css?: string): void };
    /** Capability ui.theme: adjust the active theme while you run; clear() undoes it. */
    theme: { set(tokens: Partial<ThemeTokens>): void; clear(): void };
    /** Game packs (plugin.json "game"; capabilities game.log / game.local_http, tier 3). Only while the game runs. */
    game: {
      running(): Promise<boolean>;
      report(state: GameState, label?: string): Promise<void>;
      /** New lines of the declared log since the last call (the first call skips the backlog). */
      log(): Promise<string[]>;
      /** GET on the declared 127.0.0.1 API. */
      http(path: string): Promise<{ status: number; json: unknown; text: string }>;
    };
    /** Capability lyrics.provider: your answer to a 'lyrics-request' (null = none for this song). */
    lyrics: { provide(rid: string, result: Lyrics | null): void };
    /** Capability net.fetch + plugin.json permissions.hosts (tier 3): only those addresses, 60 requests a minute,
     *  no cookies, redirects come back as 3xx with `location`, answers over 5 MB are cut off. */
    net: { fetch(url: string, options?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }): Promise<FetchResult> };
    /** audio.eq: bands after the user's EQ (<= 20, +-15 dB), null removes them. audio.sessions: watch exe names. */
    audio: {
      eq(bands: EqBand[] | null, preamp?: number): Promise<void>;
      watch(apps: string[]): Promise<void>;
      unwatch(): Promise<void>;
    };
  }
}

declare const voltage: Voltage.Api;
