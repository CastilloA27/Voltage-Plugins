/// <reference path="../sdk/voltage.d.ts" />
// Reels: rarity-weighted slot reels for the Jackpot theme (docs/review-round-14.md in the Voltage repo).
// The middle row of a reel shows strip symbol (roll + 1) % 8; symbol 0 is the seven. Jackpot's middle column is the cover,
// so a "line" means the four other reels showing the same symbol in the middle row.
let surprise = true;
const RANK = ['common', 'rare', 'epic', 'legendary'];
const rnd = (n) => Math.floor(Math.random() * n);
const rollFor = (symbol) => (symbol + 7) % 8; // the roll that puts `symbol` in the middle row

function rarityOf(plays) {
  let r = plays >= 20 ? 3 : plays >= 10 ? 2 : plays >= 4 ? 1 : 0;
  if (surprise && r < 3 && Math.random() < 0.06) r += 1; // a lucky spin
  return RANK[r];
}

// how many of the four reels match, by rarity: common = whatever the dice say
function rollsFor(rarity) {
  const rolls = Array.from({ length: 5 }, () => rnd(8));
  const match = { common: 0, rare: 2, epic: 3, legendary: 4 }[rarity];
  if (!match) return rolls;
  const symbol = rarity === 'legendary' ? 0 : 1 + rnd(7); // legendary: sevens; otherwise any other symbol
  const reels = [0, 1, 3, 4].sort(() => Math.random() - 0.5).slice(0, match); // index 2 is the cover
  for (const i of reels) rolls[i] = rollFor(symbol);
  return rolls;
}

voltage.on('settings', (s) => { if (typeof s.surprise === 'boolean') surprise = s.surprise; });
voltage.on('track', async (t) => {
  if (!t) return voltage.theme.rolls([], null);
  const key = `p:${t.id}`;
  const plays = ((await voltage.storage.get(key)) ?? 0) + 1;
  await voltage.storage.set(key, plays).catch(() => {}); // a few bytes per song; storage is 256 KB in all
  const rarity = rarityOf(plays);
  voltage.theme.rolls(rollsFor(rarity), rarity);
});
