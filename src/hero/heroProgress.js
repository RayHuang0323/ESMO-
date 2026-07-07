// ============================================================================
//  hero/heroProgress.js — Hero Progress 唯一正式模型（Sprint08，純 JS）
//  閉環：BattleResult → applyMatchResult → { xp/level/mastery } → buildLoadout
//        → LogicEngine(seed, loadout) → 下場沿用。
//  無第二套 State/EXP：本模組是唯一模型；儲存由 heroProgressStore 適配。
//
//  ── Hero Formula ──────────────────────────────────────────────────────────
//  EXP/場：90 + K*8 + A*4 + 參與率*60 + 勝利80 + MVP60（上限 400）
//  升級需求：need(L)=round(120*1.18^(L-1))，等級上限 20
//  屬性成長（每級，L1 為基準 1.0）：HP+2.0%｜ATK+1.6%｜Armor+1.2%｜AttackSpeed+1.0%
//  引擎映射（戰鬥模型為 power/tough 雙通道）：
//    tough 乘數 = hpMult × armorMult（生命與減傷 → 有效生命）
//    power 乘數 = atkMult × asMult （攻擊與攻速 → 每秒輸出）
// ============================================================================

export const LEVEL_CAP = 20;
export const XP_CAP_PER_MATCH = 400;

export const xpNeed = (level) => Math.round(120 * Math.pow(1.18, level - 1));   // L→L+1
export const attrs = (level) => {
  const L = Math.min(LEVEL_CAP, Math.max(1, level)) - 1;
  const hp = 1 + 0.020 * L, atk = 1 + 0.016 * L, armor = 1 + 0.012 * L, atkSpd = 1 + 0.010 * L;
  return { hp, atk, armor, atkSpd, toughMult: hp * armor, powerMult: atk * atkSpd };
};

export const emptyHero = () => ({
  xp: 0, level: 1,
  mastery: { games: 0, wins: 0, mvps: 0, k: 0, d: 0, a: 0, dmg: 0, heal: 0, twrDmg: 0 },
});
export const createInitialProgress = (heroIds) =>
  Object.fromEntries(heroIds.map((id) => [id, emptyHero()]));

export function xpFromResult(pr) {
  const raw = 90 + pr.k * 8 + pr.a * 4 + Math.round(pr.participation * 60) + (pr.won ? 80 : 0) + (pr.mvp ? 60 : 0);
  return Math.min(XP_CAP_PER_MATCH, raw);
}

/** 加 XP 並處理連續升級；回傳 {xp,level,levelsGained} */
export function grantXp(hero, gain) {
  let { xp, level } = hero;
  xp += gain;
  let levelsGained = 0;
  while (level < LEVEL_CAP && xp >= xpNeed(level)) { xp -= xpNeed(level); level += 1; levelsGained += 1; }
  if (level >= LEVEL_CAP) xp = Math.min(xp, xpNeed(LEVEL_CAP));   // 封頂後不再溢流
  return { xp, level, levelsGained };
}

/**
 * 唯一入口：BattleResult + heroAssign（playerId→heroId）→ 新 progress + 明細
 * 純函數：不改動入參。
 */
export function applyMatchResult(progress, battleResult, heroAssign) {
  const next = JSON.parse(JSON.stringify(progress));
  const detail = [];
  for (const pr of battleResult.players) {
    const heroId = heroAssign[pr.id];
    if (!heroId) continue;
    if (!next[heroId]) next[heroId] = emptyHero();
    const h = next[heroId];
    const before = { level: h.level, ...attrs(h.level) };
    const gain = xpFromResult(pr);
    const g = grantXp(h, gain);
    h.xp = g.xp; h.level = g.level;
    const m = h.mastery;
    m.games += 1; m.wins += pr.won ? 1 : 0; m.mvps += pr.mvp ? 1 : 0;
    m.k += pr.k; m.d += pr.d; m.a += pr.a; m.dmg += pr.dmg; m.heal += pr.heal; m.twrDmg += pr.twrDmg;
    detail.push({ playerId: pr.id, heroId, xpGain: gain, levelsGained: g.levelsGained,
      levelBefore: before.level, levelAfter: h.level,
      attrsBefore: before, attrsAfter: attrs(h.level) });
  }
  return { progress: next, detail };
}

/** progress + heroAssign → 引擎 loadout（{playerId:{level,toughMult,powerMult}}） */
export function buildLoadout(progress, heroAssign) {
  const out = {};
  for (const [pid, heroId] of Object.entries(heroAssign)) {
    const level = progress[heroId]?.level ?? 1;
    const a = attrs(level);
    out[pid] = { level, toughMult: a.toughMult, powerMult: a.powerMult };
  }
  return out;
}
