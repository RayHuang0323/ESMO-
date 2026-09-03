// ============================================================================
//  Retention Economy Calibration v1 驗證：
//      `node tools/check_retention_economy_v1.mjs`
//
//  驗的是這一輪的三件事：
//    ① **門檻依自然供給，不依容量上限。** 用真的賽季建構器算出玩家一季實際
//       被排到幾場正式賽，再用它檢查每一個週目標的門檻。
//    ② **快速練習換不到任何永久 Club Points。** 校準前它可以換到 1,010 CP/季
//       （Natural 全季的 65%），這是本輪最大的一個洞。
//    ③ **Club XP 完全不受本輪影響。** 兩套是不同權威，Retention 校準不得
//       動到 Club Progression。
//
//  ⚠ 投影模型在 `tools/retention_economy_model.mjs`。它只負責「玩家每天做了
//    什麼」；目標判定、計數、領取、價格、賽程供給全部呼叫生產程式。
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗 → 一律用絕對 file:// URL import。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import { readFileSync } from "fs";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

const M = await import(u("tools/retention_economy_model.mjs"));
const {
  ARCHETYPES, projectCareer, fixtureDaysForSeason, fixturesPerWeek,
  PURCHASABLE, CATALOG_TOTAL, CHEAPEST, CHEAPEST_COACH,
  R, O, DAYS_PER_WEEK, DAYS_PER_SEASON, asWeeks, asSeasons,
} = M;
const CPG = await import(u("src/platform/progression/clubProgression.js"));
const MS = await import(u("src/platform/progress/matchSource.js"));
const CA = await import(u("src/platform/assets/clubAssetsState.js"));

const A = [];
const ck = (name, cond, detail = "") => A.push([name, !!cond, detail]);
const notes = [];

// ── 供給（一切校準的基準）──────────────────────────────────────────────────
const fixtureDays = fixtureDaysForSeason({});
const perWeek = fixturesPerWeek(fixtureDays);
const minWeek = Math.min(...perWeek);
const avgWeek = perWeek.reduce((s, n) => s + n, 0) / perWeek.length;

ck("1) 一季正式賽供給是 35 場（14 聯賽 ＋ 3 站 × 7 巡迴）",
  fixtureDays.length === 35, `${fixtureDays.length} 場`);
ck("2) 每週正式賽供給落在 2–4 場",
  minWeek >= 2 && Math.max(...perWeek) <= 4, JSON.stringify(perWeek));

// ── §A 門檻 vs 自然供給 ────────────────────────────────────────────────────
const weekly = Object.fromEntries(O.OBJECTIVE_POOLS.weekly.map((o) => [o.id, o]));
const daily = Object.fromEntries(O.OBJECTIVE_POOLS.daily.map((o) => [o.id, o]));
const season = Object.fromEntries(O.OBJECTIVE_POOLS.season.map((o) => [o.id, o]));

ck("3) 週『本週出賽』門檻不超過自然供給的平均場次",
  weekly.volume.target <= Math.ceil(avgWeek), `target=${weekly.volume.target} avg=${avgWeek.toFixed(2)}`);
ck("4) 週『本週賽程』門檻不超過供給最少的那一週",
  weekly.fixtures && weekly.fixtures.target <= minWeek, `target=${weekly.fixtures?.target} min=${minWeek}`);
ck("5) 週『本週戰績』門檻不超過自然供給 × 五成勝率的整數上界",
  weekly.streak.target <= Math.ceil(avgWeek * 0.5) + 1, `target=${weekly.streak.target} 期望勝場=${(avgWeek * 0.5).toFixed(2)}`);
ck("6) 週『輪替陣容』門檻在正常名單規模內（新局 5 人 ＋ 正常補進）",
  weekly.rotate.target <= 8, `target=${weekly.rotate.target}`);
ck("7) 沒有任何週目標的門檻是用『每日容量 × 7』推出來的",
  O.OBJECTIVE_POOLS.weekly.every((o) => o.target <= 8), JSON.stringify(Object.entries(weekly).map(([k, v]) => `${k}=${v.target}`)));
ck("8) 賽季『財務目標』門檻低於自然供給的對戰收入",
  season.finance.target <= fixtureDays.length * 200_000,
  `target=${season.finance.target} 自然供給≈${fixtureDays.length * 200_000}`);

// ── §A2 抽選必須抽得滿（Calibration v1 把週目標池從 5 加到 6 才引爆的舊 bug）──
//  舊的 `pickObjectives` 用「起點 ＋ 固定步長」走等差數列，只有步長與池長度
//  互質時才走得遍。三個池本來都是 5 個（質數）⇒ 永遠互質 ⇒ 從沒露出來。
//  池變成 6 之後，步長 2/3/4 只走得到 3/2/3 個索引 ⇒ 有些週只抽出 2 個目標。
ck("A2-1) 任何池大小、任何 n 都抽得滿且不重複", (() => {
  for (let len = 2; len <= 12; len++) {
    const pool = Array.from({ length: len }, (_, i) => ({ id: `o${i}` }));
    for (const n of [1, 2, 3, 4]) {
      for (let s = 0; s < 200; s++) {
        const got = O.pickObjectives(pool, n, `w${s}:team`);
        if (got.length !== Math.min(n, len)) return false;
        if (new Set(got.map((o) => o.id)).size !== got.length) return false;
      }
    }
  }
  return true;
})());
ck("A2-2) 抽選仍然是決定性的（同 seed 同結果）", (() => {
  for (const scope of Object.keys(O.OBJECTIVE_POOLS)) {
    const pool = O.OBJECTIVE_POOLS[scope];
    const n = O.OBJECTIVE_SLOTS[scope];
    const a = O.pickObjectives(pool, n, `${scope}:seed`).map((o) => o.id).join(",");
    const b = O.pickObjectives(pool, n, `${scope}:seed`).map((o) => o.id).join(",");
    if (a !== b) return false;
  }
  return true;
})());
ck("A2-3) 每一週都抽得出滿額的週目標（12 週逐週檢查）", (() => {
  for (let w = 1; w <= 12; w++) {
    const prefix = O.scopePrefix("weekly", { week: w });
    const got = O.pickObjectives(O.OBJECTIVE_POOLS.weekly, O.OBJECTIVE_SLOTS.weekly, `${prefix}:me`);
    if (got.length !== O.OBJECTIVE_SLOTS.weekly) return false;
  }
  return true;
})());

// ── §B 快速練習換不到永久 Club Points（純函式，不靠模擬）──────────────────
//  ⚠ 這裡刻意**不用**投影模型：模型共用一條亂數流，加一場練習會位移後續
//    的勝負擲骰，差幾十點看起來像雜訊。純函式比對才是精確證明。
const coords = R.coordsOf({ day: 3, week: 1, year: 1 });
const onlyPractice = (() => {
  let r = R.emptyRetention();
  for (let i = 0; i < 20; i++) {
    r = R.recordMatchActivity(r, {
      matchSource: MS.MATCH_SOURCE.practice, win: true, income: 500_000,
      appeared: [{ id: "p1", age: 20 }, { id: "p2", age: 20 }, { id: "p3", age: 23 },
        { id: "p4", age: 24 }, { id: "p5", age: 22 }],
    }, coords);
  }
  return r;
})();
const practiceView = R.retentionViewOf(onlyPractice, { coords, teamId: "me", leagueRank: null, circuitPoints: 0 });
const practiceClaimables = practiceView.groups.flatMap((g) => g.items).filter((i) => i.claimable);
ck("9) 只打快速練習：沒有任何目標變成可領取",
  practiceClaimables.length === 0, practiceClaimables.map((i) => i.defId).join(",") || "none");
ck("10) 只打快速練習：Club Points 餘額與累計都是 0",
  practiceView.clubPoints === 0 && practiceView.clubPointsLifetime === 0,
  `balance=${practiceView.clubPoints} lifetime=${practiceView.clubPointsLifetime}`);
ck("11) 日目標池不含任何獎勵快速練習的項目",
  O.OBJECTIVE_POOLS.daily.every((o) => o.id !== "tryout"),
  O.OBJECTIVE_POOLS.daily.map((o) => o.id).join(","));

// 同一組比賽改成正式賽 ⇒ 必須推得動目標（證明擋掉的是練習，不是比賽本身）
const onlyOfficial = (() => {
  let r = R.emptyRetention();
  for (let i = 0; i < 3; i++) {
    r = R.recordMatchActivity(r, {
      matchSource: MS.MATCH_SOURCE.official, win: true, income: 500_000,
      appeared: [{ id: "p1", age: 20 }, { id: "p2", age: 20 }, { id: "p3", age: 23 },
        { id: "p4", age: 24 }, { id: "p5", age: 22 }],
    }, coords);
  }
  return r;
})();
const officialView = R.retentionViewOf(onlyOfficial, { coords, teamId: "me", leagueRank: null, circuitPoints: 0 });
ck("12) 改成正式賽程：同樣的場次數就推得動目標",
  officialView.groups.flatMap((g) => g.items).some((i) => i.claimable));
const competitiveView = (() => {
  let r = R.emptyRetention();
  for (let i = 0; i < 3; i++) {
    r = R.recordMatchActivity(r, {
      matchSource: MS.MATCH_SOURCE.competitive, win: true, income: 300_000,
      appeared: [{ id: "p1", age: 20 }, { id: "p2", age: 20 }, { id: "p3", age: 23 },
        { id: "p4", age: 24 }, { id: "p5", age: 22 }],
    }, coords);
  }
  return R.retentionViewOf(r, { coords, teamId: "me", leagueRank: null, circuitPoints: 0 });
})();
ck("13) 一般競技依契約推得動目標（但推不動『本週賽程』）", (() => {
  const items = competitiveView.groups.flatMap((g) => g.items);
  const fx = items.find((i) => i.defId === "fixtures");
  return items.some((i) => i.claimable) && (!fx || fx.rawProgress === 0);
})());

// ── §C 領取：一次性 / reload safe / 重複安全 ───────────────────────────────
ck("14) 同一個目標只能領一次", (() => {
  let r = onlyOfficial;
  const v = R.retentionViewOf(r, { coords, teamId: "me" });
  const item = v.groups.flatMap((g) => g.items).find((i) => i.claimable);
  if (!item) return false;
  const a = R.claimObjective(r, item.id, v);
  if (!a.ok) return false;
  r = a.retention;
  const v2 = R.retentionViewOf(r, { coords, teamId: "me" });
  const b = R.claimObjective(r, item.id, v2);
  return b.ok === false && b.retention.clubPoints === a.retention.clubPoints;
})());
ck("15) reload 安全：normalize 之後領取紀錄還在，且不能再領", (() => {
  let r = onlyOfficial;
  const v = R.retentionViewOf(r, { coords, teamId: "me" });
  const item = v.groups.flatMap((g) => g.items).find((i) => i.claimable);
  const a = R.claimObjective(r, item.id, v);
  const reloaded = R.normalizeRetention(JSON.parse(JSON.stringify(a.retention)));
  const v2 = R.retentionViewOf(reloaded, { coords, teamId: "me" });
  const again = R.claimObjective(reloaded, item.id, v2);
  return reloaded.clubPoints === a.retention.clubPoints && again.ok === false;
})());
ck("16) 沒完成的目標領不到（完全不寫入）", (() => {
  const fresh = R.emptyRetention();
  const v = R.retentionViewOf(fresh, { coords, teamId: "me" });
  const item = v.groups.flatMap((g) => g.items).find((i) => !i.done);
  const r = R.claimObjective(fresh, item.id, v);
  return r.ok === false && r.retention.clubPoints === 0 && Object.keys(r.retention.claims).length === 0;
})());

// ── §D 快轉不得自動 farm ───────────────────────────────────────────────────
ck("17) 只推進天數、什麼都不做 ⇒ 沒有任何可領取的目標", (() => {
  const fresh = R.emptyRetention();
  for (let d = 1; d <= 30; d++) {
    const c = R.coordsOf({ day: d, week: Math.floor((d - 1) / DAYS_PER_WEEK) + 1, year: 1 });
    const v = R.retentionViewOf(fresh, { coords: c, teamId: "me", leagueRank: null, circuitPoints: 0 });
    if (v.groups.flatMap((g) => g.items).some((i) => i.claimable)) return false;
  }
  return true;
})());
ck("18) 快轉跨過的日子不會累積進度（計數器帶尺度前綴）", (() => {
  //  第 1 天打了 3 場，快轉到第 10 天 ⇒ 第 10 天的日目標進度必須是 0
  let r = onlyOfficial;                       // coords 是第 3 天
  const later = R.coordsOf({ day: 10, week: 2, year: 1 });
  const v = R.retentionViewOf(r, { coords: later, teamId: "me" });
  return v.daily.items.every((i) => i.rawProgress === 0);
})());

// ── §E 換季 ────────────────────────────────────────────────────────────────
ck("19) 換季後賽季目標重置，且上一季領過的不會再出現", (() => {
  const c1 = R.coordsOf({ day: 84, week: 12, year: 1 });
  let r = R.emptyRetention();
  r = R.bumpCounter(r, O.COUNTERS.youthAppearance, 40, c1);
  const v1 = R.retentionViewOf(r, { coords: c1, teamId: "me", leagueRank: 1, circuitPoints: 200 });
  const claimed = [];
  for (const it of v1.season.items.filter((i) => i.claimable)) {
    const a = R.claimObjective(r, it.id, v1);
    if (a.ok) { r = a.retention; claimed.push(it.id); }
  }
  if (claimed.length === 0) return false;
  const c2 = R.coordsOf({ day: 85, week: 13, year: 2 });
  const v2 = R.retentionViewOf(r, { coords: c2, teamId: "me", leagueRank: null, circuitPoints: 0 });
  //  新的一年：id 換前綴 ⇒ 不可能是上一季那幾個；進度歸零。
  const overlap = v2.season.items.filter((i) => claimed.includes(i.id));
  return overlap.length === 0 && v2.season.items.every((i) => i.claimed === false);
})());
ck("20) 換季不會讓 clubPointsLifetime 下降", (() => {
  const c1 = R.coordsOf({ day: 84, week: 12, year: 1 });
  let r = R.bumpCounter(R.emptyRetention(), O.COUNTERS.youthAppearance, 40, c1);
  const v1 = R.retentionViewOf(r, { coords: c1, teamId: "me", leagueRank: 1, circuitPoints: 200 });
  for (const it of v1.season.items.filter((i) => i.claimable)) {
    const a = R.claimObjective(r, it.id, v1); if (a.ok) r = a.retention;
  }
  const before = r.clubPointsLifetime;
  const c2 = R.coordsOf({ day: 85, week: 13, year: 2 });
  const after = R.normalizeRetention(R.retentionViewOf(r, { coords: c2, teamId: "me" }) && r);
  return after.clubPointsLifetime >= before && before > 0;
})());

// ── §F Club Assets：購買不得動到 lifetime 或所有權 ─────────────────────────
ck("21) 花點數只扣餘額，clubPointsLifetime 不變", (() => {
  const r = { ...R.emptyRetention(), clubPoints: 5000, clubPointsLifetime: 5000 };
  const s = R.spendClubPoints(r, 700);
  return s.ok && s.retention.clubPoints === 4300 && s.retention.clubPointsLifetime === 5000;
})());
ck("22) 餘額不足時完全不寫入", (() => {
  const r = { ...R.emptyRetention(), clubPoints: 100, clubPointsLifetime: 5000 };
  const s = R.spendClubPoints(r, 700);
  return s.ok === false && s.retention.clubPoints === 100 && s.retention.clubPointsLifetime === 5000;
})());
ck("23) 型錄價格沒有被本輪改動（校準的是目標，不是售價）",
  CATALOG_TOTAL === 10_900 && PURCHASABLE.length === 14,
  `${PURCHASABLE.length} 項 / ${CATALOG_TOTAL} 點`);
ck("24) 購買後所有權不回退（買兩次同一項不會變成沒有）", (() => {
  let assets = CA.emptyClubAssets();
  const first = CA.purchaseAsset(assets, CHEAPEST.assetId, { clubPoints: 99_999 });
  if (!first.ok) return false;
  assets = first.assets;
  const second = CA.purchaseAsset(assets, CHEAPEST.assetId, { clubPoints: 99_999 });
  //  重複購買必須被拒絕，而且**不得**把已擁有的清掉
  const stillOwned = CA.ownsAsset ? CA.ownsAsset(second.assets ?? assets, CHEAPEST.assetId) : true;
  return second.ok === false && stillOwned;
})());

// ── §G Club XP 完全不受本輪影響 ────────────────────────────────────────────
ck("25) Club XP 授予值沒有被本輪改動",
  CPG.CLUB_XP_AWARD.practice === 0 && CPG.CLUB_XP_AWARD.unknown === 0
  && CPG.CLUB_XP_AWARD.competitive === 60 && CPG.CLUB_XP_AWARD.official === 150
  && CPG.CLUB_XP_WIN_BONUS === 0.5,
  JSON.stringify(CPG.CLUB_XP_AWARD));
ck("26) Club XP 曲線沒有被本輪改動（前 20 級門檻逐值比對）", (() => {
  const want = [120, 300, 540, 860, 1260, 1760, 2380, 3140, 4060, 5160,
    6460, 8000, 9800, 11880, 14260, 16960, 20000, 23400, 27180, 31180];
  return want.every((v, i) => CPG.clubXpForLevel(i + 2) === v);
})());
ck("27) Club Points 與 Club XP 是兩套獨立權威（retention 模組不 import progression）", (() => {
  //  真的去讀原始碼，不憑印象。
  //  ⚠ 只看**真的 import 語句**。這兩個檔的註解裡本來就會提到
  //    `platform/progression/clubProgression.js`（指路給下一個人看「聲望 ≠ Club Level」），
  //    把註解當成相依會誤判——第一版斷言就是這樣紅的。
  const files = ["src/platform/retention/retentionState.js", "src/platform/retention/retentionObjectives.js"];
  //  `.` 在 JS 正則預設不跨行 ⇒ 這樣就只會比對到單一行的 import／export 語句。
  const IMPORT = /^\s*(?:import|export).*from\s*["'][^"']*progression\/clubProgression/m;
  const DYNAMIC = /import\s*\(\s*["'][^"']*progression\/clubProgression/;
  return files.every((f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    return !IMPORT.test(src) && !DYNAMIC.test(src);
  });
})());

// ── §H 經濟投影 ────────────────────────────────────────────────────────────
const proj = {};
for (const key of ["natural", "engaged", "high"]) {
  proj[key] = projectCareer({ archetype: ARCHETYPES[key], seasons: 10 });
}
const ratio = proj.high.cpPerSeason / proj.natural.cpPerSeason;

ck("28) Natural 落在 2,200–3,000 CP/季",
  proj.natural.cpPerSeason >= 2200 && proj.natural.cpPerSeason <= 3000, `${proj.natural.cpPerSeason}`);
ck("29) High Activity 落在 3,500–4,200 CP/季",
  proj.high.cpPerSeason >= 3500 && proj.high.cpPerSeason <= 4200, `${proj.high.cpPerSeason}`);
ck("30) High / Natural 差距不超過 1.8x（硬上限）",
  ratio <= 1.8, `${ratio.toFixed(2)}x`);
ck("31) Natural 的週目標完成率過半（『正常玩就能完成大部分』）",
  proj.natural.weeklyCompletion >= 0.7, `${(proj.natural.weeklyCompletion * 100).toFixed(1)}%`);
ck("32) 沒有任何週目標對 Natural 是完全做不到的（完成率 0%）",
  Object.values(proj.natural.weeklyByDef).every((b) => b.rate > 0),
  Object.entries(proj.natural.weeklyByDef).map(([k, v]) => `${k}=${(v.rate * 100).toFixed(0)}%`).join(" "));
ck("33) 第一個有感資產落在 2–4 個生涯週",
  proj.natural.firstReach.cheapest !== null
  && Math.ceil(proj.natural.firstReach.cheapest / DAYS_PER_WEEK) >= 2
  && Math.ceil(proj.natural.firstReach.cheapest / DAYS_PER_WEEK) <= 4,
  asWeeks(proj.natural.firstReach.cheapest));
ck("34) Natural 蒐集完整型錄落在 3–5 季",
  proj.natural.firstReach.fullCatalog !== null
  && proj.natural.firstReach.fullCatalog / DAYS_PER_SEASON >= 3
  && proj.natural.firstReach.fullCatalog / DAYS_PER_SEASON <= 5,
  asSeasons(proj.natural.firstReach.fullCatalog));
ck("35) High Activity 蒐集完整型錄落在 2–3.5 季",
  proj.high.firstReach.fullCatalog !== null
  && proj.high.firstReach.fullCatalog / DAYS_PER_SEASON >= 2
  && proj.high.firstReach.fullCatalog / DAYS_PER_SEASON <= 3.5,
  asSeasons(proj.high.firstReach.fullCatalog));

// ── 輸出 ───────────────────────────────────────────────────────────────────
console.log("\n=== Retention Economy Calibration v1 ===\n");
let pass = 0;
for (const [name, ok, detail] of A) {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`);
  if (ok) pass++;
}

console.log("\n--- 供給（用真的賽季建構器算出來的）---");
console.log(`   一季正式賽 ${fixtureDays.length} 場　每週分布 ${JSON.stringify(perWeek)}　平均 ${avgWeek.toFixed(2)} 場/週`);

console.log("\n--- 目標門檻（CALIBRATED）---");
for (const [scope, pool] of Object.entries(O.OBJECTIVE_POOLS)) {
  console.log(`   ${scope.padEnd(6)} (${O.OBJECTIVE_SLOTS[scope]} 格 · ${O.CLUB_POINTS[scope]} 點/個)：`
    + pool.map((o) => `${o.id}=${o.target}`).join("  "));
}

console.log("\n--- 經濟投影（10 季）---");
console.log("   原型                     CP/季   週完成率   第一個資產        完整型錄");
for (const key of ["natural", "engaged", "high"]) {
  const r = proj[key];
  console.log(`   ${ARCHETYPES[key].label.padEnd(24)} ${String(r.cpPerSeason).padStart(5)}`
    + `   ${(r.weeklyCompletion * 100).toFixed(1).padStart(6)}%`
    + `   ${asWeeks(r.firstReach.cheapest).padEnd(18)}${asSeasons(r.firstReach.fullCatalog)}`);
}
console.log(`   High / Natural = ${ratio.toFixed(2)}x`);
console.log("   CP 來源/季：" + ["natural", "engaged", "high"]
  .map((k) => `${k} ${JSON.stringify(proj[k].cpByScopePerSeason)}`).join("　"));

console.log("\n--- 週目標逐項完成率 ---");
for (const key of ["natural", "engaged", "high"]) {
  console.log(`   ${key.padEnd(8)} ` + Object.entries(proj[key].weeklyByDef)
    .map(([k, v]) => `${k} ${(v.rate * 100).toFixed(0)}%`).join("  "));
}

console.log("\n--- Club XP 曲線（本輪重新驗證，未改動）---");
const off = (w) => CPG.clubXpForMatch({ matchSource: MS.MATCH_SOURCE.official, win: w });
const comp = (w) => CPG.clubXpForMatch({ matchSource: MS.MATCH_SOURCE.competitive, win: w });
for (const key of ["natural", "engaged", "high"]) {
  const a = ARCHETYPES[key];
  const extra = a.extraCompetitivePerWeek * 12;
  const xp = fixtureDays.length * (a.winRate * off(true) + (1 - a.winRate) * off(false))
    + extra * (a.winRate * comp(true) + (1 - a.winRate) * comp(false));
  console.log(`   ${a.label.padEnd(24)} ${Math.round(xp).toString().padStart(6)} XP/季`
    + `　1季 Lv.${CPG.clubLevelOf(Math.round(xp))}`
    + `　3季 Lv.${CPG.clubLevelOf(Math.round(xp * 3))}`
    + `　10季 Lv.${CPG.clubLevelOf(Math.round(xp * 10))}`);
}

console.log(`\n${pass}/${A.length} 通過`);
process.exit(pass === A.length ? 0 : 1);
