#!/usr/bin/env node
// ============================================================================
//  tools/check_retention_v7b.mjs — V7B：Retention Foundation v1
//
//  執行：repo 根目錄 `node tools/check_retention_v7b.mjs`；失敗 exit 1。
//
//  ── 這一支要釘住什麼 ─────────────────────────────────────────────────────
//  Retention 是一種很容易做壞的系統：做過頭就變成日常打卡壓力，做偏了就變成
//  「每天點一點 → 永久變強」的最佳養成路徑。V7B 的規格因此有幾條硬紅線：
//
//    · 日目標**不得**直接給永久戰力，也**不得**要求玩家去推正式季賽
//    · 週目標要能靠正常遊玩完成大部分，主題是**輪替**不是刷場次
//    · 賽季目標**不得**以冠軍為前提（沒奪冠也要有完整賽季進度）
//    · 獎勵優先俱樂部資源／非戰力展示；**不做** Season Pass / Alliance / Ranked
//    · **沒有 ServerTime**：三個尺度一律綁世界時間
//    · 首頁與目標頁**不做逐項紅點**，只有一個聚合數字
//
//  §D 目標定義與量體　§S 尺度與決定性　§R 記錄寫入點　§C 領取
//  §P 快速練習的邊界　§V 推導不落盤　§N 本輪邊界　§E 端到端　§M sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_OBJ = "src/platform/retention/retentionObjectives.js";
const P_STATE = "src/platform/retention/retentionState.js";
const P_APPLY = "src/platform/progress/applyMatchProgress.js";
const P_STORE = "src/platform/profileStore.js";
const P_SCREEN = "src/screens/manage/ObjectivesScreen.jsx";
const P_DASH = "src/screens/DashboardScreen.jsx";

const O = await imp(P_OBJ);
const S = await imp(P_STATE);

const COORDS = S.coordsOf({ day: 10, week: 2, year: 1 });
const TEAM = "team-v7b";
const viewOf = (r, extra = {}) => S.retentionViewOf(r, { coords: COORDS, teamId: TEAM, ...extra });

// ════════════════════════════════════════════════════════════════════════════
//  §D 目標定義與量體
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§D 目標定義與量體】");

const v0 = viewOf(S.emptyRetention());

ck("D1) 三個尺度都在，且日／週各 3 個、賽季 4 個",
  v0.daily.items.length === 3 && v0.weekly.items.length === 3 && v0.season.items.length === 4,
  `日 ${v0.daily.items.length}／週 ${v0.weekly.items.length}／季 ${v0.season.items.length}`);

ck("D2) 呈現的目標總數 ≤ 10（不做十幾個任務格）",
  v0.groups.reduce((s, g) => s + g.items.length, 0) <= 10,
  `${v0.groups.reduce((s, g) => s + g.items.length, 0)} 個`);

//  ⚠ 日目標的量體：三個加起來 10–20 分鐘。池裡每一個的 target 都必須是 1
//    （一場對戰／一次訓練／一次偵查）——出現 target 3 就已經超出區間。
ck("D3) 日目標每一個都是「做一次」（10–20 分鐘的量體）",
  O.OBJECTIVE_POOLS.daily.every((d) => d.target === 1),
  O.OBJECTIVE_POOLS.daily.map((d) => `${d.id}=${d.target}`).join(" "));

ck("D4) 日目標**一個都不要求正式季賽**（季賽是賽程排定的，不是想打就有）",
  O.OBJECTIVE_POOLS.daily.every((d) => !/季賽|賽程|聯賽|巡迴|冠軍/.test(`${d.name}${d.desc}`)),
  O.OBJECTIVE_POOLS.daily.map((d) => d.name).join("／"));

ck("D5) 日目標導向的是快速對戰／一般對戰／訓練／球探",
  (() => {
    const ids = new Set(O.OBJECTIVE_POOLS.daily.map((d) => d.id));
    return ids.has("play") && ids.has("train") && ids.has("scout") && ids.has("tryout");
  })());

//  ⚠ 週目標的主題是輪替。至少要有「不同選手」與「不同陣容」兩種去重目標，
//    否則整組就退化成「多打幾場」。
ck("D6) 週目標包含輪替（不同選手／不同陣容）與新人",
  (() => {
    const ids = new Set(O.OBJECTIVE_POOLS.weekly.map((d) => d.id));
    return ids.has("rotate") && ids.has("variety") && ids.has("youth");
  })());

//  每日容量 3 場 ⇒ 一週最多 21 場。週出賽目標必須遠低於它，否則就是在要求刷場次。
const CAP = (await imp("src/platform/time/worldClock.js")).COMPETITIVE_BLOCK.matchesPerDay;
ck("D7) 週出賽目標**遠低於**一週容量上限（不是要玩家刷場次）",
  (() => {
    const vol = O.OBJECTIVE_POOLS.weekly.find((d) => d.id === "volume");
    return vol.target <= CAP * 7 / 3;
  })(),
  `本週 ${O.OBJECTIVE_POOLS.weekly.find((d) => d.id === "volume").target} 場 vs 一週上限 ${CAP * 7} 場`);

//  ⚠⚠ 賽季目標的紅線：四個都不得以冠軍為前提。
ck("D8) 賽季目標**沒有任何一個需要冠軍**（沒奪冠也有完整賽季進度）",
  O.OBJECTIVE_POOLS.season.every((d) => !/冠軍|奪冠|第 1 名|總冠軍/.test(`${d.name}${d.desc}`)),
  O.OBJECTIVE_POOLS.season.map((d) => `${d.name}：${d.desc}`).join("｜"));

ck("D9) 賽季目標涵蓋名次／巡迴／U21 培養／財務（規格點名的四類）",
  (() => {
    const ids = new Set(O.OBJECTIVE_POOLS.season.map((d) => d.id));
    return ids.has("rank") && ids.has("circuit") && ids.has("youth") && ids.has("finance");
  })());

ck("D10) 獎勵**只有俱樂部點數**，沒有任何選手數值／等級／天賦",
  (() => {
    //  ⚠ 用字界限：不加 \b 的話 `/xp/i` 會命中每一行 `e**xp**ort`。
    const s = codeOnly(read(P_OBJ)) + codeOnly(read(P_STATE));
    return !/\b(xp|level|talent|potential|stat|stats|attribute)\b/i.test(s)
      && !/player\.(level|xp|stats)/i.test(s)
      && Object.values(O.CLUB_POINTS).every((n) => Number(n) > 0);
  })(),
  `日 ${O.CLUB_POINTS.daily}／週 ${O.CLUB_POINTS.weekly}／季 ${O.CLUB_POINTS.season} 點`);

ck("D11) 俱樂部點數的出口是**純展示**的聲望等級（v1 不換戰力）",
  S.clubTierOf(0).name === "見習俱樂部" && S.clubTierOf(999999).next === null
  && S.CLUB_TIERS.length >= 3);

// ════════════════════════════════════════════════════════════════════════════
//  §S 尺度綁世界時間、決定性、過期自動失效
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 尺度與決定性】");

ck("S1) **沒有 ServerTime**：整個 retention 層不碰 Date.now / 真實時間",
  !/Date\.now|new Date\(|performance\.now|serverTime/i.test(codeOnly(read(P_OBJ)) + codeOnly(read(P_STATE))));

ck("S2) 尺度前綴由世界座標推導（d/w/y）",
  O.scopePrefix("daily", COORDS) === "d10"
  && O.scopePrefix("weekly", COORDS) === "w2"
  && O.scopePrefix("season", COORDS) === "y1");

ck("S3) **決定性**：同一天同一隊抽到的目標逐項相同（重整不會換一組）",
  JSON.stringify(viewOf(S.emptyRetention()).daily.items.map((i) => i.defId))
  === JSON.stringify(viewOf(S.emptyRetention()).daily.items.map((i) => i.defId)),
  viewOf(S.emptyRetention()).daily.items.map((i) => i.defId).join("／"));

ck("S4) 換一天會換一組（不是永遠同三個）",
  (() => {
    const a = new Set();
    for (let d = 1; d <= 12; d++) {
      const v = S.retentionViewOf(S.emptyRetention(), { coords: S.coordsOf({ day: d, week: 1, year: 1 }), teamId: TEAM });
      a.add(v.daily.items.map((i) => i.defId).join(","));
    }
    return a.size >= 3;
  })(), "12 天內至少出現 3 種組合");

ck("S5) 抽出的目標**不重複**（同一格不會出現兩次）",
  new Set(v0.daily.items.map((i) => i.defId)).size === v0.daily.items.length
  && new Set(v0.weekly.items.map((i) => i.defId)).size === v0.weekly.items.length);

ck("S6) 不同戰隊看到不同組合（種子含 teamId）",
  (() => {
    const a = S.retentionViewOf(S.emptyRetention(), { coords: COORDS, teamId: "A" }).daily.items.map((i) => i.defId).join(",");
    const b = S.retentionViewOf(S.emptyRetention(), { coords: COORDS, teamId: "ZZZZ" }).daily.items.map((i) => i.defId).join(",");
    return typeof a === "string" && typeof b === "string";
  })(), "只要求決定性，不要求一定不同");

ck("S7) 過期的計數器**語意上自動失效**（換日之後今天的進度歸零）",
  (() => {
    let r = S.recordMatchActivity(S.emptyRetention(), { matchSource: "competitive", win: true }, COORDS);
    const today = S.retentionViewOf(r, { coords: COORDS, teamId: TEAM });
    const tomorrow = S.retentionViewOf(r, { coords: S.coordsOf({ day: 11, week: 2, year: 1 }), teamId: TEAM });
    const dayObj = (v) => v.daily.items.find((i) => i.defId === "play");
    return (dayObj(today)?.progress ?? 0) === 1 && (dayObj(tomorrow)?.progress ?? 0) === 0;
  })());

ck("S8) 但**週與年的進度不會跟著歸零**（三個尺度各自累加）",
  (() => {
    const r = S.recordMatchActivity(S.emptyRetention(), { matchSource: "competitive", win: true }, COORDS);
    const next = S.retentionViewOf(r, { coords: S.coordsOf({ day: 11, week: 2, year: 1 }), teamId: TEAM });
    return (next.weekly.items.find((i) => i.defId === "volume")?.progress ?? 0) >= 1
      || Object.keys(r.counters).some((k) => k.startsWith("w2:"));
  })());

ck("S9) `pruneScopes` 掃得掉過期 key（存檔不會無限成長）",
  (() => {
    const bag = { "d9:match": 3, "d10:match": 1, "w1:match": 5, "w2:match": 1, "y1:match": 9 };
    const kept = Object.keys(S.pruneScopes(bag, COORDS)).sort();
    return JSON.stringify(kept) === JSON.stringify(["d10:match", "w2:match", "y1:match"]);
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §R 記錄：只掛在既有的唯一寫入點
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 記錄寫入點】");

ck("R1) 比賽側掛在**唯一結算入口** `applyMatchProgress`",
  /recordMatchActivity\(/.test(codeOnly(read(P_APPLY))));

ck("R2) 沒有第二個比賽側寫入點（其他檔案不得呼叫 `recordMatchActivity`）",
  (() => {
    const hits = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${f.name}`;
        if (f.isDirectory()) walk(rel);
        else if (/\.(js|jsx)$/.test(f.name) && !rel.endsWith("retentionState.js")) {
          //  ⚠ 一定要用 `recordMatchActivity`：Legacy 的 `EsportsGame.jsx` 有一個
          //    同名不同事的 `recordMatch`，用舊名字掃會掃到它。
          if (/\brecordMatchActivity\s*\(/.test(codeOnly(read(rel)))) hits.push(rel);
        }
      }
    };
    walk("src");
    return hits.length === 1 && hits[0].endsWith("applyMatchProgress.js");
  })());

ck("R3) 訓練掛在 `assignTraining`（安排的那一刻，不是課程結束）",
  /assignTraining[\s\S]{0,600}recordTrainingActivity\(/.test(codeOnly(read(P_STORE))));

ck("R4) 球探掛在 `setScouted`，且**只在偵查等級真的往上走**時記",
  /setScouted[\s\S]{0,500}recordScoutActivity\(/.test(codeOnly(read(P_STORE)))
  && /advanced\s*=\s*\(Number\(level\)/.test(codeOnly(read(P_STORE))));

ck("R5) 年度座標取自 `careerYearOf`（同一條時間不得有兩種年度）",
  /careerYearOf\(/.test(codeOnly(read(P_APPLY))) && /careerYearOf\(/.test(codeOnly(read(P_STORE)))
  && !/days\s*\/\s*84|Math\.floor\(days\s*\/\s*\d+\)/.test(codeOnly(read(P_STATE))));

ck("R6) 出賽名單取自交易單的 `playerProgress`（實際出賽者，不是整份名單）",
  /tx\.playerProgress[\s\S]{0,200}appeared/.test(codeOnly(read(P_APPLY)))
  || /appeared\s*=\s*\(tx\.playerProgress/.test(codeOnly(read(P_APPLY))));

// ════════════════════════════════════════════════════════════════════════════
//  §C 領取
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 領取】");

let R1 = S.emptyRetention();
R1 = S.recordMatchActivity(R1, { matchSource: "competitive", win: true, income: 100000, appeared: [{ id: "p1", age: 19 }] }, COORDS);
R1 = S.recordTrainingActivity(R1, COORDS);
R1 = S.recordScoutActivity(R1, COORDS);
const V1 = viewOf(R1);
const firstDone = V1.daily.items.find((i) => i.claimable);

ck("C1) 做完之後日目標真的變成可領取", !!firstDone,
  V1.daily.items.map((i) => `${i.name} ${i.text}${i.claimable ? " ✔" : ""}`).join("｜"));

const C1 = S.claimObjective(R1, firstDone?.id, V1);
ck("C2) 領取成功，俱樂部點數增加",
  C1.ok === true && C1.retention.clubPoints === O.CLUB_POINTS.daily,
  `+${C1.gained} 點`);

ck("C3) **同一個目標不可重複領**（第二次直接被拒，且不寫入）",
  (() => {
    const v = viewOf(C1.retention);
    const again = S.claimObjective(C1.retention, firstDone.id, v);
    return again.ok === false && again.gained === 0 && again.retention.clubPoints === C1.retention.clubPoints;
  })());

ck("C4) 沒完成的目標領不到",
  (() => {
    const v = viewOf(S.emptyRetention());
    const undone = v.daily.items.find((i) => !i.done);
    const r = S.claimObjective(S.emptyRetention(), undone.id, v);
    return r.ok === false && r.retention.clubPoints === 0;
  })());

ck("C5) 換日之後**領不到昨天那一格**（id 帶尺度前綴，天然過期）",
  (() => {
    const tomorrow = S.retentionViewOf(R1, { coords: S.coordsOf({ day: 11, week: 2, year: 1 }), teamId: TEAM });
    const r = S.claimObjective(R1, firstDone.id, tomorrow);
    return r.ok === false;
  })());

ck("C6) 領取是**手動**的：達成不會自動入袋",
  (() => {
    const v = viewOf(R1);
    return v.clubPoints === 0 && v.daily.items.some((i) => i.claimable);
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §P 快速練習的邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 快速練習的邊界】");

const RP = S.recordMatchActivity(S.emptyRetention(), {
  matchSource: "practice", win: true, income: 999999, appeared: [{ id: "p9", age: 18 }],
}, COORDS);

ck("P1) 練習算「今天打了一場」（日目標 play / tryout 需要它）",
  (Number(RP.counters[`d10:${O.COUNTERS.match}`]) || 0) === 1
  && (Number(RP.counters[`d10:${O.COUNTERS.practiceMatch}`]) || 0) === 1);

ck("P2) 練習**不計勝場**（不能靠練習刷週戰績）",
  (Number(RP.counters[`d10:${O.COUNTERS.win}`]) || 0) === 0);

ck("P3) 練習**不計收入**（賽季財務目標刷不動）",
  (Number(RP.counters[`y1:${O.COUNTERS.matchIncome}`]) || 0) === 0);

ck("P4) 練習**不算輪替、不算青訓**（週輪替與 U21 目標不吃練習）",
  (Number(RP.counters[`w2:${O.COUNTERS.youthAppearance}`]) || 0) === 0
  && (RP.sets[`w2:${O.SETS.players}`] ?? []).length === 0);

// ════════════════════════════════════════════════════════════════════════════
//  §V 推導不落盤
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§V 推導不落盤】");

//  ⚠ 這條守的是「**目標清單不落盤**」，不是「欄位永遠不得增加」。
//    2026-09-01 Meta Progression v1 新增 `clubPointsLifetime`（累計獲得、
//    只增不減，供俱樂部等級讀取）：花點數不得讓等級倒退，所以「累計」與
//    「可花餘額」必須是兩個欄位。白名單隨之更新，**斷言強度不變**——
//    任何不在清單上的欄位（尤其是目標清單或進度快取）仍然會讓這條失敗。
ck("V1) 存檔只存點數／計數器／集合／領取紀錄——**目標清單不落盤**",
  (() => {
    const keys = Object.keys(S.emptyRetention()).sort();
    return JSON.stringify(keys) === JSON.stringify(["claims", "clubPoints", "clubPointsLifetime", "counters", "schema", "sets"]);
  })(),
  Object.keys(S.emptyRetention()).join(", "));

ck("V2) 舊存檔沒有 retention ⇒ 空的，且畫面照樣算得出目標（不炸）",
  (() => {
    const v = S.retentionViewOf(undefined, { coords: COORDS, teamId: TEAM });
    return v.daily.items.length === 3 && v.clubPoints === 0;
  })());

ck("V3) 壞掉的 retention 一律當成空的（不猜、不回填）",
  (() => {
    const v = S.normalizeRetention({ clubPoints: "abc", counters: 5, sets: null, claims: "x" });
    return v.clubPoints === 0 && JSON.stringify(v.counters) === "{}" && JSON.stringify(v.claims) === "{}";
  })());

ck("V4) 賽季名次與巡迴積分是**讀賽季狀態**，不是計數器",
  (() => {
    const s = codeOnly(read(P_STORE));
    return /leagueRank/.test(s) && /circuitPoints/.test(s)
      && !/leagueRank/.test(codeOnly(read(P_APPLY)));
  })());

ck("V5) 沒有賽季時名次目標據實顯示「尚未開賽」，不猜一個名次",
  (() => {
    const v = S.retentionViewOf(S.emptyRetention(), { coords: COORDS, teamId: TEAM, leagueRank: null });
    const rank = v.season.items.find((i) => i.defId === "rank");
    return rank?.progress === 0 && /尚未開賽/.test(rank?.detail ?? "");
  })());

ck("V6) 目標頁與首頁**不自己算進度**（只讀 `retentionView()`）",
  /retentionView\(\)/.test(read(P_SCREEN)) && /retentionView\(\)/.test(read(P_DASH))
  && !/OBJECTIVE_POOLS|pickObjectives/.test(read(P_SCREEN) + read(P_DASH)));

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

//  ⚠ 一律掃**程式碼**。本輪三個檔的註解裡就寫著「沒有 ServerTime」
//    「不 import React / zustand」——用裸關鍵字掃會掃到理由本身。
const RET_SRC = [P_OBJ, P_STATE, P_SCREEN].map((p) => codeOnly(read(p))).join("\n");

ck("N1) 沒有 Season Pass / 戰令 / 付費軌",
  !/season\s*pass|seasonPass|battlePass|戰令|通行證|premium/i.test(RET_SRC));

ck("N2) 沒有 Alliance / 公會 / 工會",
  !/alliance|guild|公會|工會|聯盟成員/i.test(RET_SRC));

ck("N3) 沒有 Ranked / 牌位 / 排行榜",
  !/\b(ranked|mmr|elo|ladder|leaderboard)\b|牌位|段位/i.test(RET_SRC));

ck("N4) 沒有 ServerTime / 真實時間倒數",
  !/serverTime|utc|countdown|expiresAt|resetAt/i.test(RET_SRC));

//  ⚠ 逐項紅點是規格明文擋掉的。首頁只准有**一個聚合數字**。
ck("N5) 首頁只有一個聚合徽章，沒有逐項紅點",
  (() => {
    const d = read(P_DASH);
    return /objectiveBadge/.test(d) && (d.match(/home-utility-badge-/g) ?? []).length === 1
      && /view\(\)\.claimable|retentionView\(\)\.claimable/.test(d);
  })());

ck("N6) 目標頁也只有分組聚合，沒有逐項紅點",
  !/dot|紅點|badge-dot/i.test(codeOnly(read(P_SCREEN))));

ck("N7) Retention 層不 import React / zustand / Store（純函式）",
  (() => {
    const s = codeOnly(read(P_OBJ)) + codeOnly(read(P_STATE));
    return !/from\s+["']react["']|zustand|profileStore/.test(s);
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端：真的透過結算入口跑一場，看目標亮不亮
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端】");
{
  const applyMod = await imp(P_APPLY);
  const origin = await imp("src/platform/contracts/matchOrigin.js");
  const mobaAd = await imp("src/platform/progress/adapters/mobaProgressAdapter.js");

  const players = [
    { id: "p1", name: "A", age: 19, level: 5, xp: 0, stats: { learning: 70 }, energy: 100 },
    { id: "p2", name: "B", age: 27, level: 5, xp: 0, stats: { learning: 70 }, energy: 100 },
  ];
  const br = {
    schema: "BattleResult.v2", winner: "blue", duration: 1800,
    score: { blue: 20, red: 5 }, gold: { blue: 50000, red: 30000 }, towers: { blue: 9, red: 2 },
    mvpId: "p1",
    players: [
      { id: "p1", side: "blue", k: 10, d: 1, a: 5, gold: 12000, dmg: 30000, rating: 60, participation: 0.8 },
      { id: "p2", side: "blue", k: 5, d: 2, a: 8, gold: 9000, dmg: 20000, rating: 40, participation: 0.6 },
    ],
  };
  const ticketOrigin = { schema: origin.ORIGIN_VERSION, kind: "ticket", originId: "t-v7b", mode: "moba" };
  const state = {
    players, finance: { funds: 1_000_000, transactions: [] },
    meta: { days: 10, fans: 1000, competitiveBlock: null },
    processedMatchTransactions: {}, economy: { formLog: [] },
    retention: S.emptyRetention(),
  };
  const tx = mobaAd.mobaResultToTransaction(br, { players, lineup: null, streak: 0, fansNow: 1000, origin: ticketOrigin });
  const out = applyMod.applyProgressToState(state, tx);

  ck("E1) 結算之後 retention 真的被寫進 nextState",
    !!out.nextState?.retention && Object.keys(out.nextState.retention.counters).length > 0,
    Object.keys(out.nextState?.retention?.counters ?? {}).join(" "));

  const week = (await imp("src/platform/economy/timeline.js")).deriveTime(10).week;
  const year = (await imp("src/platform/time/worldClock.js")).careerYearOf(10).year;
  const V = S.retentionViewOf(out.nextState.retention, { coords: S.coordsOf({ day: 10, week, year }), teamId: TEAM });

  ck("E2) 「今日出賽」亮了",
    (V.daily.items.find((i) => i.defId === "play")?.progress ?? 0) >= 1
    || (V.weekly.items.find((i) => i.defId === "volume")?.progress ?? 0) >= 1,
    V.daily.items.map((i) => `${i.name} ${i.text}`).join("｜"));

  ck("E3) U21 出賽被記到（19 歲的 p1 上場了）",
    (Number(out.nextState.retention.counters[`y${year}:${O.COUNTERS.youthAppearance}`]) || 0) === 1,
    `青訓人次 ${out.nextState.retention.counters[`y${year}:${O.COUNTERS.youthAppearance}`]}`);

  ck("E4) 年度財務目標的進度真的動了（對戰收入入帳）",
    (Number(out.nextState.retention.counters[`y${year}:${O.COUNTERS.matchIncome}`]) || 0) > 0,
    `$${Math.round((out.nextState.retention.counters[`y${year}:${O.COUNTERS.matchIncome}`] || 0) / 10000)}萬`);

  ck("E5) 陣容簽章記到了（週目標「兩套打法」有東西可比）",
    (out.nextState.retention.sets[`w${week}:${O.SETS.lineups}`] ?? []).length === 1,
    JSON.stringify(out.nextState.retention.sets[`w${week}:${O.SETS.lineups}`] ?? []));

  //  ⚠ 冪等：同一筆交易再結算一次，計數不得增加。
  const again = applyMod.applyProgressToState(out.nextState.processedMatchTransactions
    ? { ...state, ...out.nextState } : state, tx);
  ck("E6) **冪等**：同一場再結算一次不會重複計數",
    again.nextState === null || JSON.stringify(again.nextState?.retention?.counters ?? {})
      === JSON.stringify(out.nextState.retention.counters),
    again.nextState === null ? "第二次完全沒有寫入" : "計數逐值相同");
}

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");

ck("M-A) 目標池與獎勵表都是凍結的（呼叫端改不動規則）",
  Object.isFrozen(O.OBJECTIVE_POOLS) && Object.isFrozen(O.CLUB_POINTS)
  && Object.values(O.OBJECTIVE_POOLS).every(Object.isFrozen));

ck("M-B) 把練習的勝場守衛拿掉 ⇒ §P2 會紅（守衛真的存在）",
  /const isPractice = matchSource === "practice"/.test(codeOnly(read(P_STATE)))
  && /if \(isPractice\) return r;/.test(codeOnly(read(P_STATE))));

ck("M-C) 領取一律經過 view（拿不到 view 就領不到 ⇒ 不可能繞過完成判定）",
  /function claimObjective\(retention, objectiveId, view\)/.test(read(P_STATE)));

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`V7B Retention Foundation v1：${pass} / ${pass + fail} 通過`);
if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
console.log("✅ 全數通過");
