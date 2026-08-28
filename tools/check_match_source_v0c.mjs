#!/usr/bin/env node
// ============================================================================
//  tools/check_match_source_v0c.mjs — Season vNext V0C：Match Source 契約
//
//  執行：repo 根目錄 `node tools/check_match_source_v0c.mjs`；失敗 exit 1。
//
//  ── V0C 要解決什麼 ───────────────────────────────────────────────────────
//  `applyMatchProgress` 是**唯一**的永久成長寫入點，但它分不出這場是
//  「一般比賽」還是「正式季賽」——`MatchProgressTransaction` 沒有來源欄位。
//  來源其實一路都在（`MatchOrigin.v1` → adapter 的 `ctx.origin`），
//  但 adapter 只把它換算成一個 **Fan 倍率**就丟掉了。
//  ⇒ 「粉絲分得出來、成長分不出來」。這就是 TD-35。
//
//  ── 為什麼不能沿用 `FAN_SOURCE` ──────────────────────────────────────────
//  `fanSourceWeight.js` 的三桶是 practice / league / major，
//  其中 **`kind: "ticket"`（玩家自己排隊的一般比賽）被歸進 practice**。
//  那對粉絲曲線是對的（一般比賽不該像正式賽那樣漲粉），
//  但對產品定位是錯的：**快速練習**與**競技比賽**是兩層不同的東西。
//  ⇒ V0C 另立 `MATCH_SOURCE`（practice / competitive / official）當**成長**的來源，
//    `fanSourceWeight` **一個位元都不動**（粉絲行為逐值不變）。
//    兩者都只讀同一份 `MatchOrigin`，並由 §X 釘住「不得在 official 與否上分歧」。
//
//  ⚠ V0C **不做**：完整 Ranked、真人連線、Live Event、快速練習入口、
//    Career Clock、年齡增加、老化、退休。
//  ⚠ 來源倍率一律 **1.0**——本輪只要求「分得出來、可獨立控制」，
//    數值留給 Foundation Calibration。
//
//  §S 來源分類  §T 進得了交易單  §W 真的影響成長寫入  §X 與 Fan 不分歧
//  §F 既有行為不變  §N 沒有過度設計  §M mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { execFileSync } from "child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};

const P_SOURCE = "src/platform/progress/matchSource.js";
const P_TX = "src/platform/contracts/matchProgressTransaction.js";
const P_SETTLE = "src/platform/progress/applyMatchProgress.js";
const P_MOBA = "src/platform/progress/adapters/mobaProgressAdapter.js";
const P_CS = "src/platform/progress/adapters/csProgressAdapter.js";
const P_FAN = "src/platform/progress/fanSourceWeight.js";

const fan = await imp(P_FAN);
const origin = await imp("src/platform/contracts/matchOrigin.js");
const txc = await imp(P_TX);
const career = await imp("src/platform/progress/careerGrowth.js");
let ms = null;
try { ms = await imp(P_SOURCE); } catch { /* 實作之前不存在 ⇒ 照實報紅 */ }

//  真實的 origin fixture（用契約自己的工廠產生，不手捏）
const ticketOrigin = { schema: origin.ORIGIN_VERSION, kind: origin.ORIGIN_KINDS.ticket, ticketId: "t1" };
const leagueOrigin = { schema: origin.ORIGIN_VERSION, kind: origin.ORIGIN_KINDS.fixture, fixtureId: "f1", competitionId: "comp:moba:s1:org:regular" };
const majorOrigin = { schema: origin.ORIGIN_VERSION, kind: origin.ORIGIN_KINDS.fixture, fixtureId: "f2", competitionId: "comp:cs:s1:org:major" };

// ── §S 來源分類 ────────────────────────────────────────────────────────────
console.log("\n§S 來源分類（三層，MOBA / CS 共用一份）");

/**
 * 「來源分得出來」的判準——sentinel 會拿同一個判準去測變異版。
 *
 * ⚠ 2026-08-26（V0D / TD-36）：最後一行原本是 `null ⇒ practice`。
 *   那正是 TD-36 記下來要修的東西——把「查不到來源」與「玩家真的在打練習賽」
 *   當成同一件事，於是 `practice` 的倍率永遠動不了。
 *   V0D 讓退路變成 `unknown`，`practice` 改由**明確的 practice origin** 產生。
 *   **這是刻意的期望變更**，V0C 本來就把數值與第四層留給後續。
 */
function classifiesThreeTiers(mod) {
  if (!mod) return false;
  return mod.matchSourceFromOrigin(ticketOrigin) === mod.MATCH_SOURCE.competitive
    && mod.matchSourceFromOrigin(leagueOrigin) === mod.MATCH_SOURCE.official
    && mod.matchSourceFromOrigin(majorOrigin) === mod.MATCH_SOURCE.official
    && mod.matchSourceFromOrigin(null) === mod.MATCH_SOURCE.unknown;
}
{
  ck("S1) 三層來源存在且語意明確（practice / competitive / official）",
    ms ? ["practice", "competitive", "official"].every((k) => k in (ms.MATCH_SOURCE ?? {})) : false,
    ms ? Object.keys(ms.MATCH_SOURCE ?? {}).join(",") : "matchSource.js 不存在");

  ck("S2) `ticket`（一般比賽）→ competitive；`fixture`（季賽）→ official",
    classifiesThreeTiers(ms),
    ms ? `ticket→${ms.matchSourceFromOrigin(ticketOrigin)}｜league→${ms.matchSourceFromOrigin(leagueOrigin)}｜major→${ms.matchSourceFromOrigin(majorOrigin)}` : "");

  //  ⚠ V0D / TD-36：退路從 `practice` 改成 `unknown`（理由見上面的判準函式）。
  //    方向沒有變——查不到來源時仍然給一個**不會多發**的層級，
  //    只是不再拿「快速練習」這個產品模式去承擔資料遺失。
  ck("S3) 沒有 origin ⇒ unknown（查不到 ≠ 練習賽；TD-36 已解）",
    ms ? ms.matchSourceFromOrigin(null) === ms.MATCH_SOURCE.unknown
      && ms.matchSourceFromOrigin(undefined) === ms.MATCH_SOURCE.unknown
      && ms.matchSourceFromOrigin({}) === ms.MATCH_SOURCE.unknown : false);

  //  ⚠ 只掃**程式碼**，不掃註解。本檔的註解本來就寫著「不得靠 route / stage 猜」，
  //    連註解一起掃會掃到自己那句話——那會逼人刪掉說明，正好與目的相反。
  const codeOnly = (src) => src.split(/\r?\n/)
    .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  ck("S4) 分類是純函式，不讀 UI / route / stage / Store",
    ms ? !/useProfileStore|window\.|document\.|STAGE|location/.test(codeOnly(read(P_SOURCE))) : false,
    "來源不得靠畫面猜");
}

// ── §T 進得了交易單 ────────────────────────────────────────────────────────
console.log("\n§T 來源進得了 MatchProgressTransaction");
{
  const tx = txc.createMatchProgressTransaction({
    mode: "moba", matchId: "m1", sourceResultVersion: "BattleResult.v2",
    teamRewards: { money: 0, fans: 0, reputation: 0 }, playerProgress: [],
    metadata: { winner: "us", matchSource: "official" },
  });
  ck("T1) 交易單保留 `metadata.matchSource`（不再被白名單吃掉）",
    tx?.metadata?.matchSource === "official", JSON.stringify(tx?.metadata ?? {}));

  const bare = txc.createMatchProgressTransaction({
    mode: "moba", matchId: "m2", sourceResultVersion: "BattleResult.v2",
    teamRewards: { money: 0, fans: 0, reputation: 0 }, playerProgress: [], metadata: { winner: "us" },
  });
  ck("T2) 沒帶來源的舊交易單仍合法（欄位是附加的，不是必填）",
    txc.validateMatchProgressTransaction(bare).ok && bare.metadata.matchSource === null);

  ck("T3) 兩個 adapter 都把來源寫進交易單（MOBA / CS 共用同一支分類）",
    /matchSource/.test(read(P_MOBA)) && /matchSource/.test(read(P_CS))
      && /matchSourceFromOrigin/.test(read(P_MOBA)) && /matchSourceFromOrigin/.test(read(P_CS)));
}

// ── §W 真的影響成長寫入 ────────────────────────────────────────────────────
console.log("\n§W 來源真的到得了成長寫入點（不是只存著好看）");

/** 「結算真的把來源交給 PCGM」的判準。 */
const settlementUsesSource = (src) =>
  /tx\.metadata\?\.matchSource|metadata\.matchSource/.test(src)
  && /applyLevelGrowth\([^)]*source/.test(src.replace(/\n/g, " "));
{
  ck("W1) `applyMatchProgress` 讀交易單的來源並交給 `applyLevelGrowth`",
    settlementUsesSource(read(P_SETTLE)));

  ck("W2) PCGM 的來源清單與 MATCH_SOURCE 對得上（不是兩套詞彙）",
    ms ? ["practice", "competitive", "official"].every((k) => k in (career.GROWTH_SOURCES ?? {})) : false,
    Object.keys(career.GROWTH_SOURCES ?? {}).join(","));

  ck("W3) 三個來源可**獨立控制**（各自有自己的 base 參數）",
    ms ? ["practice", "competitive", "official"]
      .every((k) => typeof career.PCGM_PARAMS?.sourceBase?.[k] === "number") : false,
    JSON.stringify(career.PCGM_PARAMS?.sourceBase ?? {}));

  //  ⚠ W4 原本是「本輪倍率一律 1.0」——那是 **V0C 自己的 scope 宣告**
  //    （「只做分得出來，數值留給 Foundation Calibration」），
  //    Foundation Calibration 執行之後它就必然失效，不是回歸。
  //    ⇒ 退休那條宣告，改成驗證 V0C 真正的交付：**倍率確實是分開生效的**。
  //      如果來源沒接進結算，official 調高也不會有任何差別 ⇒ 這條會變紅。
  ck("W4) 來源倍率確實分開生效（official ≠ competitive 時，成長係數真的不同）",
    (() => {
      const p = { age: 24, stats: { learning: 70 } };
      const o = career.careerGrowthFactor({ source: "official", player: p });
      const c = career.careerGrowthFactor({ source: "competitive", player: p });
      const base = career.PCGM_PARAMS?.sourceBase ?? {};
      return base.official !== base.competitive ? o !== c : o === c;
    })(),
    JSON.stringify(career.PCGM_PARAMS?.sourceBase ?? {}));
}

// ── §X 與 Fan 分類不分歧 ───────────────────────────────────────────────────
console.log("\n§X 成長來源與粉絲來源不得分歧");
{
  //  兩者可以分桶不同（Fan 需要 league/major，成長不需要），
  //  但「這場是不是正式季賽」必須永遠一致，否則會出現
  //  「粉絲當正式賽發、成長當練習算」這種對不起來的狀態。
  const cases = [[ticketOrigin, false], [leagueOrigin, true], [majorOrigin, true], [null, false]];
  ck("X1) 兩支分類器對「是不是正式季賽」永遠一致",
    ms ? cases.every(([o, isOfficial]) =>
      (ms.matchSourceFromOrigin(o) === ms.MATCH_SOURCE.official) === isOfficial
      && (fan.fanSourceFromOrigin(o) !== fan.FAN_SOURCE.practice) === isOfficial) : false);

  ck("X2) `fanSourceWeight.js` 一個位元都沒動（粉絲行為逐值不變）",
    (() => {
      try { execFileSync("git", ["diff", "--quiet", "origin/main", "--", P_FAN], { cwd: ROOT }); return true; }
      catch { return false; }
    })(), "對 origin/main 比對");

  ck("X3) 粉絲倍率仍是 1.0 / 5.0 / 8.5（順序不變式）",
    fan.FAN_SOURCE_WEIGHT[fan.FAN_SOURCE.practice] < fan.FAN_SOURCE_WEIGHT[fan.FAN_SOURCE.league]
      && fan.FAN_SOURCE_WEIGHT[fan.FAN_SOURCE.league] < fan.FAN_SOURCE_WEIGHT[fan.FAN_SOURCE.major]);
}

// ── §F 既有行為不變 ────────────────────────────────────────────────────────
console.log("\n§F 既有行為不變");
{
  ck("F1) 沒有第二套結算：`applyProgressToState` 仍是唯一入帳點",
    (() => {
      const walk = (dir, out = []) => {
        for (const e of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(rel, out); else if (/\.(js|jsx)$/.test(e.name)) out.push(rel);
        }
        return out;
      };
      const definers = walk("src").filter((f) => /export function applyProgressToState/.test(read(f)));
      return definers.length === 1;
    })());

  ck("F2) 三支被凍結的契約檔只有 metadata 白名單一處附加",
    (() => {
      try {
        execFileSync("git", ["diff", "--quiet", "origin/main", "--", "src/battle/battleResult.js"], { cwd: ROOT });
        execFileSync("git", ["diff", "--quiet", "origin/main", "--", "src/platform/contracts/CsMatchResult.js"], { cwd: ROOT });
        return true;
      } catch { return false; }
    })(), "BattleResult.v2 / CsMatchResult.v1 零改動");
}

// ── §N 沒有過度設計 ────────────────────────────────────────────────────────
console.log("\n§N 沒有為未來 Ranked 過度設計");
{
  ck("N1) 沒有新增 Ranked / Live Event / 快速練習的 UI 或路由",
    !fs.existsSync(resolve(ROOT, "src/screens/manage/RankedScreen.jsx"))
      && !fs.existsSync(resolve(ROOT, "src/screens/common/PracticePanel.jsx"))
      && !/practice|ranked/i.test(read("src/platform/router/matchFlows.js")));

  ck("N2) 沒有新增 server / matchmaking 實作",
    !fs.existsSync(resolve(ROOT, "src/platform/matchmaking/realGateway.js")));

  const codeLines = ms
    ? read(P_SOURCE).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("*")).length
    : -1;
  ck("N3) `matchSource.js` 很小（只做分類，不夾帶其他責任）",
    codeLines > 0 && codeLines < 40, codeLines < 0 ? "檔案不存在" : `${codeLines} 行實碼`);
}

// ── §M mutation sentinel ───────────────────────────────────────────────────
console.log("\n§M mutation sentinel");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (!ms) throw new Error("matchSource.js 不存在，sentinel 無法執行");
  const A = await mutated(P_SOURCE,
    (s) => s.replace("MATCH_SOURCE.competitive;", "MATCH_SOURCE.practice;"), "A-collapse");
  ck("M-A) 把一般比賽併回練習 ⇒ §S2 變紅", classifiesThreeTiers(A) === false);

  const B = read(P_SETTLE).replace(/matchSource/g, "__removed__");
  ck("M-B) 結算不再讀來源 ⇒ §W1 變紅", settlementUsesSource(B) === false);
} catch (e) {
  ck("M-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_match_source_v0c：${pass}/${pass + fail} 通過`);
console.log("   三層來源：practice（快速練習，尚未實作入口）／competitive（今日的一般比賽）／official（正式季賽）");
console.log(`   來源倍率（Foundation Calibration 取值）：${JSON.stringify(career.PCGM_PARAMS?.sourceBase ?? {})}`);
process.exit(fail === 0 ? 0 : 1);
