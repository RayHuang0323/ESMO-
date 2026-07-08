// ============================================================================
//  platform/seasonData.js — Season 純邏輯（Sprint09，零框架相依，Node 可驗）
//  所有統計皆為 BattleResult 的純推導；禁止重新演算 Battle。
// ============================================================================
export const resultKey = (r) => `${r.winner}|${r.duration}|${r.score.blue}:${r.score.red}`;

/** 積分榜：勝負/勝率/場均擊殺/金差 */
export function standings(history) {
  const t = { blue: { w: 0, l: 0, k: 0, gd: 0 }, red: { w: 0, l: 0, k: 0, gd: 0 } };
  for (const r of history) {
    t[r.winner].w++; t[r.winner === "blue" ? "red" : "blue"].l++;
    t.blue.k += r.score.blue; t.red.k += r.score.red;
    t.blue.gd += r.gold.blue - r.gold.red; t.red.gd += r.gold.red - r.gold.blue;
  }
  const n = history.length || 1;
  return ["blue", "red"].map((side) => ({
    side, name: history[0]?.teams?.[side]?.name ?? side,
    wins: t[side].w, losses: t[side].l,
    winRate: history.length ? t[side].w / history.length : 0,
    avgKills: t[side].k / n, avgGoldDiff: t[side].gd / n,
  })).sort((a, b) => b.wins - a.wins);
}

/** 選手排行：生涯 KDA / 場均 Rating / MVP（全沿用 BattleResult 內數值） */
export function playerRanking(history) {
  const acc = {};
  for (const r of history) for (const p of r.players) {
    const a = (acc[p.id] ??= { id: p.id, heroId: p.heroId, games: 0, k: 0, d: 0, a: 0, rating: 0, mvps: 0, wins: 0 });
    a.games++; a.k += p.k; a.d += p.d; a.a += p.a; a.rating += p.rating; a.mvps += p.mvp ? 1 : 0; a.wins += p.won ? 1 : 0;
  }
  return Object.values(acc).map((a) => ({
    ...a, kda: a.d ? (a.k + a.a) / a.d : a.k + a.a, avgRating: a.games ? a.rating / a.games : 0,
  })).sort((x, y) => y.avgRating - x.avgRating);
}

/** 賽季分析：場均時長/擊殺/龍/巴龍 */
export function analytics(history) {
  const n = history.length;
  if (!n) return { games: 0, avgDuration: 0, avgKills: 0, avgDragons: 0, avgBarons: 0 };
  const s = history.reduce((o, r) => ({
    dur: o.dur + r.duration, k: o.k + r.score.blue + r.score.red,
    dr: o.dr + r.dragon.blue + r.dragon.red, ba: o.ba + r.baron.blue + r.baron.red,
  }), { dur: 0, k: 0, dr: 0, ba: 0 });
  return { games: n, avgDuration: s.dur / n, avgKills: s.k / n, avgDragons: s.dr / n, avgBarons: s.ba / n };
}
