/// <reference path="../sdk/voltage.d.ts" />
// Reels: rarity-weighted slot reels for the Jackpot theme (docs/review-round-14.md in the Voltage repo).
// The middle row of a reel shows strip symbol (roll + 1) % 8; symbol 0 is WILD (Jackpot's strip). Jackpot's middle column is the cover,
// so a "line" means the four other reels showing the same symbol in the middle row.
let surprise = true;
const RANK = ['common', 'rare', 'epic', 'legendary'];
const rnd = (n) => Math.floor(Math.random() * n);
const rollFor = (symbol) => (symbol + 7) % 8; // the roll that puts `symbol` in the middle row

// Popularity: YouTube's play count (Voltage 1.7.1+ sends it on 'track' when the song came with one)
const viewTier = (v) => (typeof v !== 'number' ? 0 : v >= 1e9 ? 3 : v >= 1e8 ? 2 : v >= 1e7 ? 1 : 0);
const playTier = (plays) => (plays >= 20 ? 3 : plays >= 10 ? 2 : plays >= 4 ? 1 : 0);

// A real roll every time: the song's tier (your plays or its popularity, whichever is higher) is only the likeliest
// outcome. 55% the tier itself, 30% one lower, 15% one higher with surprises on (a lucky spin).
function rarityOf(plays, views) {
  const tier = Math.max(playTier(plays), viewTier(views));
  const r = Math.random();
  let out = r < 0.55 ? tier : r < 0.85 ? tier - 1 : surprise ? tier + 1 : tier;
  out = Math.min(3, Math.max(0, out));
  return RANK[out];
}

// how many of the four reels match, by rarity: common = whatever the dice say
function rollsFor(rarity) {
  const rolls = Array.from({ length: 5 }, () => rnd(8));
  const match = { common: 0, rare: 2, epic: 3, legendary: 4 }[rarity];
  if (!match) return rolls;
  const symbol = rarity === 'legendary' ? 0 : 1 + rnd(7); // legendary: WILDs; otherwise any other symbol
  const reels = [0, 1, 3, 4].sort(() => Math.random() - 0.5).slice(0, match); // index 2 is the cover
  for (const i of reels) rolls[i] = rollFor(symbol);
  return rolls;
}

voltage.on('settings', (s) => { if (typeof s.surprise === 'boolean') surprise = s.surprise; });
voltage.on('track', async (t) => {
  if (!t) { voltage.theme.vars(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`roll-${n}`, null]))); return voltage.theme.state('app', []); }
  const key = `p:${t.id}`;
  const plays = ((await voltage.storage.get(key)) ?? 0) + 1;
  await voltage.storage.set(key, plays).catch(() => {}); // a few bytes per song; storage is 256 KB in all
  const rarity = rarityOf(plays, t.views);
  // round 15 F1: the theme's own variables (--fx-roll-1..5) and the rarity as a word on the app (data-fx)
  voltage.theme.vars(Object.fromEntries(rollsFor(rarity).map((v, i) => [`roll-${i + 1}`, v])));
  voltage.theme.state('app', [rarity]);
});
