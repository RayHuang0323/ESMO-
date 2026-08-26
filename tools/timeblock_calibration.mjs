// V2：四種 Time Block 做法的比較模擬
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const ROOT = "D:/OneDrive/文件/GitHub/ESMO-injury";
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const rewards = await imp("src/platform/progress/rewardFormulas.js");
const cond = await imp("src/platform/condition/playerCondition.js");
const clock = await imp("src/platform/time/worldClock.js");

const r1 = (v) => Math.round(v * 10) / 10;
const XP_PER_MATCH = Math.round((rewards.BASE_XP_WIN + rewards.BASE_XP_LOSS) / 2);   // 勝負各半
const YEAR = clock.CAREER_YEAR.daysPerYear;

// ── 體力天花板：一天最多打幾場競技（既有機制，不是新規則）─────────────────
//  出賽扣 matchEnergyCost，連續出賽再加 streakEnergyStep，每日恢復 restPerDay。
function matchesPerDayByEnergy() {
  const C = cond.CONDITION;
  let energy = 100, n = 0, streak = 0;
  while (energy >= C.matchEnergyCost + C.unfitBelow) {
    energy -= C.matchEnergyCost + streak * C.streakEnergyStep;
    streak += 1; n += 1;
    if (n > 50) break;
  }
  return n;
}

/**
 * 四種做法。每一種回傳：
 *   · daysFor(matches)   打這麼多場**額外**消耗幾天世界時間
 *   · maxMatchesInDays(d) 在 d 天內最多打幾場
 */
const DESIGNS = {
  "A 每場 +1 天": {
    daysFor: (m) => m,
    maxMatchesInDays: (d) => d,
    note: "打一場就 +1 天",
  },
  "B 每 N 場自動 +1 天": {
    N: 3,
    daysFor(m) { return Math.floor(m / this.N); },
    maxMatchesInDays(d) { return d * this.N + (this.N - 1); },
    note: "累計滿 N 場就自動推一天",
  },
  "C 每日配額 N 場": {
    N: 3,
    daysFor: () => 0,                                  // ⭐ 完全不「加」天
    maxMatchesInDays(d) { return d * this.N; },
    note: "一天最多打 N 場；要再打得自己推進日曆",
  },
  "D 競技點數（每場扣 X，每日回 Y）": {
    X: 4, Y: 10, cap: 12,
    daysFor: () => 0,
    maxMatchesInDays(d) { return Math.floor((this.cap + d * this.Y) / this.X); },
    note: "另一套獨立於體力的資源條",
  },
};

console.log("═".repeat(74));
console.log("  V2 Time Block 候選比較");
console.log(`  每場競技 XP ≈ ${XP_PER_MATCH}｜生涯年度 ${YEAR} 天｜體力天花板 ${matchesPerDayByEnergy()} 場/日`);
console.log("═".repeat(74));

console.log("\n【① 凍齡測試：完全不推進日曆，最多能刷多少 XP？】");
for (const [name, d] of Object.entries(DESIGNS)) {
  const m = d.maxMatchesInDays(0);
  const verdict = m === Infinity || m > 999 ? "❌ 可無限刷" : m === 0 ? "⚠ 一場都打不了" : "✅ 有界";
  console.log(`  ${name.padEnd(26)} 0 天內最多 ${String(m).padStart(3)} 場 = ${String(m * XP_PER_MATCH).padStart(5)} XP   ${verdict}`);
}

console.log("\n【② 老太快測試：一年打 100 場競技，額外消耗幾天？】");
for (const [name, d] of Object.entries(DESIGNS)) {
  const extra = d.daysFor(100);
  const pct = r1(extra / YEAR * 100);
  const verdict = extra === 0 ? "✅ 不額外老" : extra > YEAR * 0.5 ? "❌ 老太快" : "⚠ 會多老";
  console.log(`  ${name.padEnd(26)} 額外 ${String(extra).padStart(3)} 天 = 年度的 ${String(pct).padStart(5)}%   ${verdict}`);
}

console.log("\n【③ 一個 Career Year（84 天）裡，競技場次的上限】");
for (const [name, d] of Object.entries(DESIGNS)) {
  const m = d.maxMatchesInDays(YEAR);
  console.log(`  ${name.padEnd(26)} 最多 ${String(m).padStart(4)} 場｜XP 上限 ${String(m * XP_PER_MATCH).padStart(6)}`
    + `｜相當於正式季賽（14 場）的 ${r1(m / 14)} 倍`);
}

console.log("\n【④ 兩個玩家的年齡差：都推進 84 天，一個狂打競技、一個完全不打】");
for (const [name, d] of Object.entries(DESIGNS)) {
  const heavy = YEAR + d.daysFor(d.maxMatchesInDays(YEAR));
  const light = YEAR;
  const gap = heavy - light;
  console.log(`  ${name.padEnd(26)} 狂打者走了 ${String(heavy).padStart(4)} 天，不打者 ${light} 天 ⇒ 相差 ${String(gap).padStart(3)} 天`
    + (gap === 0 ? "  ✅ 一樣老" : gap > 30 ? "  ❌ 差太多" : "  ⚠ 有差"));
}

console.log("\n【⑤ 需要新增什麼】");
const NEEDS = {
  "A 每場 +1 天": "比賽結算要**寫時鐘** ⇒ 第二個時間推進者",
  "B 每 N 場自動 +1 天": "比賽結算要**寫時鐘**（有條件）⇒ 仍是第二個時間推進者",
  "C 每日配額 N 場": "只要一個「今天用了幾格」的計數器；**不寫時鐘**",
  "D 競技點數（每場扣 X，每日回 Y）": "一條新資源（點數／上限／回復），與體力平行 ⇒ 兩套疲勞",
};
for (const [name, need] of Object.entries(NEEDS)) console.log(`  ${name.padEnd(26)} ${need}`);
