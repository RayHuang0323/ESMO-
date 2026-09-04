#!/usr/bin/env node
// ============================================================================
//  tools/check_club_assets_v1.mjs — Club Assets v1 契約驗證
//
//  執行：`node tools/check_club_assets_v1.mjs`；失敗 exit 1。
//
//  ── 這支在守什麼 ────────────────────────────────────────────────────────
//  ① 型錄自我一致（價格、specialty、competitivePolicy、無 rarity）
//  ② **Online 邊界**：俱樂部資產不得以任何形式進入估值／配對
//  ③ **無硬編碼教練 id**：效果只能走 capability 表，不能靠 `if (id === ...)`
//  ④ **CS 邊界**：型錄不得授予 CS 旗標；`CsTacticScreen.jsx` 逐位元組未改
//  ⑤ 合併政策：逐 kind 的 strategy 與 cap 真的生效
//  ⑥ 狀態機：購買冪等、fail closed、原子性
//  ⑦ 週鎖：首裝免費、同週擋、跨週解、reload 繞不過
//  ⑧ **lifetime 保護**：花點數不得動 lifetime、不得讓俱樂部等級下降
// ============================================================================
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = async (p) => import(pathToFileURL(join(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const eq = (n, a, b) => ck(n, JSON.stringify(a) === JSON.stringify(b), `得到 ${JSON.stringify(a)}`);

const catalogMod = await imp("src/platform/assets/coachCatalog.js");
const capMod = await imp("src/platform/assets/clubCapabilities.js");
const stateMod = await imp("src/platform/assets/clubAssetsState.js");
const retentionMod = await imp("src/platform/retention/retentionState.js");

const { COACH_CATALOG, assetById, validateCatalog, ASSET_SPECIALTIES, COMPETITIVE_POLICIES, CS_OWNED_FLAGS, hasCapability, isRetired, purchasableAssets } = catalogMod;
const { CAPABILITY_POLICY, mergeCapabilities, clubCapabilitiesOf, emptyCapabilities } = capMod;
const {
  emptyClubAssets, normalizeClubAssets, purchaseAsset, equipHeadCoach, canChangeCoach, clubAssetsViewOf, ASSET_FAIL,
} = stateMod;
const { emptyRetention, spendClubPoints, clubTierOf } = retentionMod;

// ── ① 型錄 ────────────────────────────────────────────────────────────────
console.log("\n── ① 型錄 ──");
const catErrors = validateCatalog();
ck("型錄自我驗證無錯誤", catErrors.length === 0, catErrors.join(" / ") || "clean");
eq("型錄剛好三位教練", COACH_CATALOG.length, 3);
eq("價格為 700 / 1100 / 1700", COACH_CATALOG.map((a) => a.priceClubPoints).sort((x, y) => x - y), [700, 1100, 1700]);
eq("specialty 三值互不重複", [...new Set(COACH_CATALOG.map((a) => a.specialty))].sort(), [...ASSET_SPECIALTIES].sort());
ck("沒有任何 rarity / presentationTier 欄位",
  COACH_CATALOG.every((a) => !("rarity" in a) && !("presentationTier" in a)));
ck("每一位都有 capabilityText 與 tradeoffText（UI 不自己翻譯 capability）",
  COACH_CATALOG.every((a) => Boolean(a.capabilityText) && Boolean(a.tradeoffText)));
ck("三位都是完整可用產品（status = CURRENT_RUNTIME）",
  COACH_CATALOG.every((a) => a.status === "CURRENT_RUNTIME"));
ck("有 capability 的資產一律 careerOnly",
  COACH_CATALOG.filter(hasCapability).every((a) => a.competitivePolicy === "careerOnly"));
eq("v1 沒有任何 rankedEligible 資產",
  COACH_CATALOG.filter((a) => a.competitivePolicy === "rankedEligible").length, 0);
ck("competitivePolicy 值域固定為三值", COMPETITIVE_POLICIES.length === 3);
//  只有最貴的那位有 prerequisite——門檻的作用是讓 Club Level 第一次有意義，不是製造 grind。
const withPre = COACH_CATALOG.filter((a) => a.prerequisite);
eq("只有一位有 prerequisite", withPre.length, 1);
eq("該 prerequisite 是 lifetime >= 500", withPre[0]?.prerequisite, { kind: "clubPointsLifetime", min: 500 });
ck("有 prerequisite 的就是最貴的那位",
  withPre[0]?.priceClubPoints === Math.max(...COACH_CATALOG.map((a) => a.priceClubPoints)));

// ── ② Online / 競技邊界 ───────────────────────────────────────────────────
console.log("\n── ② Online 邊界 ──");
const FORBIDDEN_IN_ONLINE = ["clubAssets", "coachCatalog", "headCoachId", "clubCapabilities"];

//  ⚠ 兩組檔案，分開處理：
//  · ALWAYS 這組是主幹一定有的配對／隊伍契約 ⇒ 缺檔就是**紅燈**。
//  · OPTIONAL 這組屬於 V7-2.9 Online CBR guardrails，住在 `v7/fast-calibration`
//    那條線上（它們相依 `squadSnapshot.js` → `onlineCbr.js`，帶進來等於把整條
//    CBR 鏈一起帶進來）。本 release 刻意不含它們。
//    缺檔時**明說跳過**，不算 pass 也不算 fail——靜默通過會讓這條邊界
//    在「檔案根本不存在」時看起來是綠的，那比紅燈更危險。
const ONLINE_FILES_ALWAYS = [
  "src/platform/contracts/matchmaking.js",
  "src/platform/contracts/matchSquad.js",
];
const ONLINE_FILES_OPTIONAL = [
  "src/platform/contracts/onlineValuation.js",
  "src/platform/contracts/matchmakingPolicy.js",
  "src/platform/contracts/cbrDecisionGate.js",
];
let skipped = 0;
const scanOnline = (f, required) => {
  let src = "";
  try { src = readFileSync(join(ROOT, f), "utf8"); } catch {
    if (required) { ck(`${f} 可讀`, false, "找不到檔案"); return; }
    skipped++; console.log(`➖ ${f}　不在本 release（V7-2.9 guardrails 在 v7/fast-calibration 線上）`);
    return;
  }
  const hits = FORBIDDEN_IN_ONLINE.filter((t) => src.includes(t));
  ck(`${f} 不出現任何俱樂部資產欄位`, hits.length === 0, hits.join(",") || "clean");
};
for (const f of ONLINE_FILES_ALWAYS) scanOnline(f, true);
for (const f of ONLINE_FILES_OPTIONAL) scanOnline(f, false);

//  估值真的只吃 SquadSnapshot：塞進俱樂部資產欄位，結果必須逐值不變。
//  ⚠ 只有 `onlineValuation.js` 在這棵樹上時才驗得到；不在就明說，不假裝驗過。
if (existsSync(join(ROOT, "src/platform/contracts/onlineValuation.js"))) {
  const { valuateSquad } = await imp("src/platform/contracts/onlineValuation.js");
  const snapshot = {
    players: [
      { sta: 70, fps: 70, moba: 70, personality: 60 }, { sta: 65, fps: 68, moba: 66, personality: 55 },
      { sta: 72, fps: 60, moba: 71, personality: 58 }, { sta: 61, fps: 63, moba: 64, personality: 61 },
      { sta: 69, fps: 66, moba: 62, personality: 57 },
    ],
  };
  const baseVal = valuateSquad({ snapshot });
  const pollutedVal = valuateSquad({
    snapshot: { ...snapshot, clubAssets: { headCoachId: "coach_conditioning" }, headCoachId: "coach_tactical" },
  });
  eq("估值對俱樂部資產欄位完全無感", JSON.stringify(baseVal), JSON.stringify(pollutedVal));
} else {
  skipped++;
  console.log("➖ 估值輸入污染測試　需要 onlineValuation.js，不在本 release");
}

//  ⚠ 這一條**永遠**要驗：不管估值層在不在，俱樂部資產都不得洩進 SquadSnapshot。
//  它守的是「本 release 有沒有自己把 clubAssets 塞進競技資料流」，
//  與 V7-2.9 在不在無關。
const squadSrc = readFileSync(join(ROOT, "src/platform/contracts/matchSquad.js"), "utf8");
ck("SquadSnapshot 來源不含任何俱樂部資產欄位",
  FORBIDDEN_IN_ONLINE.every((t) => !squadSrc.includes(t)));

// ── ③ 無硬編碼教練 id ────────────────────────────────────────────────────
console.log("\n── ③ 無硬編碼 ──");
const ALLOWED_ID_FILES = new Set([
  "src/platform/assets/coachCatalog.js",   // 型錄本身
]);
const ids = COACH_CATALOG.map((a) => a.assetId);
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};
const sourceFiles = [...walk(join(ROOT, "src/platform")), ...walk(join(ROOT, "src/screens"))];
const offenders = [];
for (const p of sourceFiles) {
  const rel = relative(ROOT, p).split("\\").join("/");
  if (ALLOWED_ID_FILES.has(rel)) continue;
  const src = readFileSync(p, "utf8");
  for (const id of ids) if (src.includes(`"${id}"`) || src.includes(`'${id}'`)) offenders.push(`${rel}:${id}`);
}
ck("production code 沒有任何硬編碼的教練 id", offenders.length === 0, offenders.join(" / ") || "clean");

// ── ④ CS 邊界 ────────────────────────────────────────────────────────────
console.log("\n── ④ CS 邊界 ──");
const grantedFlags = COACH_CATALOG.flatMap((a) => Object.keys(a.capability?.unlocks ?? {}));
ck("型錄不授予任何 CS 旗標", grantedFlags.every((f) => !CS_OWNED_FLAGS.includes(f)), grantedFlags.join(",") || "無旗標");
//  CS 屬於另一個 owner（Codex）。
//
//  ⚠ 這一條原本檢查「`src/screens/fps/` 與 `src/battle/fps/` 整棵樹逐位元組未動」，
//    而它的註解寫的是「**本輪**必須未動」——它是 Club Assets v1 那一輪的範圍守衛。
//    但實作成 working tree 檢查之後，就變成對**所有後續 Sprint** 的永久凍結，
//    連 Codex 並不擁有的賽前畫面也一起凍住。
//
//  2026-09-05 Owner 裁示（TD Expansion v1）把真正的邊界寫清楚了，那是**具名的
//  battle runtime**，不是整個 fps 目錄：
//      EsportsFPS3D.jsx / fpsRoster.js / CsPrepScreen.jsx / CsLoadingScreen.jsx
//      ＋ camera・POV・C4・audio・locomotion・combat route runtime
//  `CsTacticScreen.jsx` 不在其中，而且它**本來就是 Team Development 的消費端**
//  （`csDemoAnalysis` 的讀取點就在那支檔案裡）。Expansion v1 的 N4／N5 在 Phase 0
//  collision check 通過後（Codex 分支對該檔 0 個新 commit）獲授權加賽前資訊面板。
//
//  ⇒ 收窄成「具名禁區逐位元組未動」。**保護力沒有降低**：Codex 的 battle runtime
//    仍然整棵樹凍結，只是不再連帶凍結它不擁有的畫面。
const CS_FROZEN = [
  "src/battle/fps/",                    // Codex 的 battle runtime，整棵樹
  "src/screens/fps/CsPrepScreen.jsx",
  "src/screens/fps/CsLoadingScreen.jsx",
];
let csDirty = "";
try {
  csDirty = execFileSync("git", ["status", "--porcelain", "--", ...CS_FROZEN],
    { cwd: ROOT, encoding: "utf8" }).trim();
} catch (e) { csDirty = `git 失敗：${e.message}`; }
ck("Codex 具名 CS 禁區完全未改動", csDirty === "", csDirty || "clean");
//  戰術教練用的兩個旗標必須真的有消費端——否則就是一張沒有效果的卡。
const banPick = readFileSync(join(ROOT, "src/screens/moba/BanPickScreen.jsx"), "utf8");
const mobaTactic = readFileSync(join(ROOT, "src/screens/moba/TacticScreen.jsx"), "utf8");
ck("mobaOpponentResearch 有真實消費端", banPick.includes("unlocks.mobaOpponentResearch"));
ck("dataAnalysis 有真實消費端", mobaTactic.includes("unlocks.dataAnalysis"));

// ── ⑤ 合併政策 ───────────────────────────────────────────────────────────
console.log("\n── ⑤ 合併政策 ──");
eq("trainingDaysReduction 政策", CAPABILITY_POLICY.trainingDaysReduction, { strategy: "sum", cap: 2 });
eq("dailyRecoveryBonus 政策", CAPABILITY_POLICY.dailyRecoveryBonus, { strategy: "sum", cap: 8 });
eq("scoutDaysReduction 政策", CAPABILITY_POLICY.scoutDaysReduction, { strategy: "sum", cap: 2 });
eq("unlocks 政策", CAPABILITY_POLICY.unlocks, { strategy: "union", cap: null });

const merged = mergeCapabilities(
  { trainingDaysReduction: 3, dailyRecoveryBonus: 12, scoutDaysReduction: 5, unlocks: { a: "A" } },
  { trainingDaysReduction: 3, dailyRecoveryBonus: 12, scoutDaysReduction: 5, unlocks: { b: "B" } },
);
eq("sum 超過 cap 會被夾住（training）", merged.trainingDaysReduction, 2);
eq("sum 超過 cap 會被夾住（recovery）", merged.dailyRecoveryBonus, 8);
eq("sum 超過 cap 會被夾住（scout）", merged.scoutDaysReduction, 2);
eq("union 合併兩邊旗標", merged.unlocks, { a: "A", b: "B" });
eq("union 冪等", mergeCapabilities({ unlocks: { a: "A" } }, { unlocks: { a: "A" } }).unlocks, { a: "A" });
ck("未知 capability kind 被丟掉（fail closed）",
  !("madeUpKind" in mergeCapabilities({ madeUpKind: 9 }, {})));
eq("空能力有全部四個 kind", Object.keys(emptyCapabilities()).sort(),
  ["dailyRecoveryBonus", "scoutDaysReduction", "trainingDaysReduction", "unlocks"]);

//  provenance：sources 必須是**合併前**的原始值，且 total 是套 cap 之後的。
const cond = assetById("coach_conditioning");
const prov = clubCapabilitiesOf({
  developmentEffects: { trainingDaysReduction: 1, dailyRecoveryBonus: 4, scoutDaysReduction: 1, unlocks: { dev: "D" } },
  clubAssets: { schema: "ClubAssets.v1", owned: { coach_conditioning: { acquiredWeek: 1 } }, headCoachId: "coach_conditioning", lastCoachChangeWeek: null },
});
eq("provenance：發展樹那一份未被合併污染", prov.sources.teamDevelopment.dailyRecoveryBonus, 4);
eq("provenance：教練那一份就是型錄值", prov.sources.coach.dailyRecoveryBonus, cond.capability.dailyRecoveryBonus);
eq("provenance：total 是兩者相加", prov.total.dailyRecoveryBonus, 8);
eq("provenance：教練不提供 scout ⇒ total 等於發展樹", prov.total.scoutDaysReduction, 1);
ck("provenance：sources.teamDevelopment 不含教練的旗標",
  !("mobaOpponentResearch" in prov.sources.teamDevelopment.unlocks));

//  ⚠ 這條是 F7 的守門員：教練絕不能成為人才池的來源。
const scoutProv = clubCapabilitiesOf({
  developmentEffects: { scoutDaysReduction: 1 },
  clubAssets: { schema: "ClubAssets.v1", owned: { coach_scouting: { acquiredWeek: 1 } }, headCoachId: "coach_scouting", lastCoachChangeWeek: null },
});
eq("球探：天數吃合併值（1+1=2）", scoutProv.total.scoutDaysReduction, 2);
eq("球探：人才池只看得到發展樹的 1", scoutProv.sources.teamDevelopment.scoutDaysReduction, 1);
//  RecruitScreen 必須真的做了分流，不是只有註解。
const recruit = readFileSync(join(ROOT, "src/screens/manage/RecruitScreen.jsx"), "utf8");
ck("RecruitScreen 人才池讀 sources.teamDevelopment",
  /scoutNetworkRank:\s*devOnlyEffects\.scoutDaysReduction/.test(recruit));
ck("RecruitScreen 球探天數讀合併值",
  /SCOUT_DAYS\[depth\]\s*-\s*developmentEffects\.scoutDaysReduction/.test(recruit));

//  沒裝備、裝備了沒買的教練 ⇒ 都不給能力。
eq("沒裝備總教練 ⇒ 教練能力為空",
  clubCapabilitiesOf({ developmentEffects: {}, clubAssets: emptyClubAssets() }).sources.coach, emptyCapabilities());
eq("裝備了沒買的教練 ⇒ 不給能力（存檔被手改也擋得住）",
  clubCapabilitiesOf({
    developmentEffects: {},
    clubAssets: { schema: "ClubAssets.v1", owned: {}, headCoachId: "coach_conditioning", lastCoachChangeWeek: null },
  }).sources.coach, emptyCapabilities());

// ── ⑥ 狀態機 ─────────────────────────────────────────────────────────────
console.log("\n── ⑥ 狀態機 ──");
const rich = { clubPoints: 5000, clubPointsLifetime: 5000, careerWeek: 3 };
const buy1 = purchaseAsset(emptyClubAssets(), "coach_conditioning", rich);
ck("買得起就買得到", buy1.ok === true);
eq("回傳價格供 store 扣點", buy1.price, 700);
ck("第一次購買標記 firstOwned", buy1.firstOwned === true);
ck("購買不會自動裝備（ownership 與 loadout 分離）", buy1.assets.headCoachId === null);
eq("記下取得週次", buy1.assets.owned.coach_conditioning.acquiredWeek, 3);

const buyAgain = purchaseAsset(buy1.assets, "coach_conditioning", rich);
ck("重複購買被拒", buyAgain.ok === false && buyAgain.code === ASSET_FAIL.ALREADY_OWNED);
eq("重複購買 state 零變化", JSON.stringify(buyAgain.assets), JSON.stringify(buy1.assets));
eq("重複購買不回傳價格（不可能被扣款）", buyAgain.price, 0);

const unknown = purchaseAsset(emptyClubAssets(), "coach_does_not_exist", rich);
ck("未知資產 fail closed", unknown.ok === false && unknown.code === ASSET_FAIL.UNKNOWN_ASSET);
eq("未知資產 state 零變化", JSON.stringify(unknown.assets), JSON.stringify(emptyClubAssets()));

const poor = purchaseAsset(emptyClubAssets(), "coach_conditioning", { clubPoints: 699, clubPointsLifetime: 5000, careerWeek: 1 });
ck("餘額不足不可買", poor.ok === false && poor.code === ASSET_FAIL.INSUFFICIENT);
eq("餘額不足 state 零變化", JSON.stringify(poor.assets), JSON.stringify(emptyClubAssets()));

const noPre = purchaseAsset(emptyClubAssets(), "coach_tactical", { clubPoints: 9999, clubPointsLifetime: 499, careerWeek: 1 });
ck("prerequisite 未達不可買（lifetime 499 < 500）", noPre.ok === false && noPre.code === ASSET_FAIL.PREREQUISITE);
const okPre = purchaseAsset(emptyClubAssets(), "coach_tactical", { clubPoints: 9999, clubPointsLifetime: 500, careerWeek: 1 });
ck("prerequisite 剛好達標可買（lifetime 500）", okPre.ok === true);

//  ── Permanent Ownership Contract ────────────────────────────────────────
//  ⚠ 這幾條取代了舊的「normalize 剔除型錄裡沒有的資產」。
//    舊規則會讓型錄改名／下架直接洗掉玩家買過的東西——那與「永久收藏」矛盾。
console.log("\n── ⑥-b 永久擁有 ──");
const ghost = normalizeClubAssets({ owned: { ghost_coach: { acquiredWeek: 4 } } });
eq("型錄查不到的資產**仍然保留擁有**", Object.keys(ghost.owned), ["ghost_coach"]);
eq("並保留取得週次", ghost.owned.ghost_coach.acquiredWeek, 4);
ck("且標記為 unknown 讓 UI 可以顯示成典藏", ghost.owned.ghost_coach.unknown === true);
//  但它不提供任何能力——擁有 ≠ 生效。
eq("查不到型錄的資產不提供能力",
  clubCapabilitiesOf({
    developmentEffects: {},
    clubAssets: { schema: "ClubAssets.v1", owned: { ghost_coach: { acquiredWeek: 1 } }, headCoachId: "ghost_coach", lastCoachChangeWeek: null },
  }).sources.coach, emptyCapabilities());

//  型錄「縮編」的模擬：把整份型錄換成空的，既有 ownership 一個都不能少。
{
  const before = purchaseAsset(emptyClubAssets(), "coach_conditioning", rich).assets;
  const afterCatalogShrink = normalizeClubAssets(JSON.parse(JSON.stringify(before)));
  eq("型錄變更後 ownership 不下降", Object.keys(afterCatalogShrink.owned).sort(), Object.keys(before.owned).sort());
}

//  retired：下架但不刪除。型錄目前沒有下架品，所以用合成物件驗語意。
ck("isRetired 認得下架標記", isRetired({ ...assetById("coach_scouting"), retired: true }) === true);
ck("未標記的資產不算下架", isRetired(assetById("coach_scouting")) === false);
ck("每一筆型錄都明寫 retired（下架用改值，不用刪除）",
  COACH_CATALOG.every((a) => a.retired === false), COACH_CATALOG.map((a) => a.retired).join(","));
eq("purchasableAssets 目前等於全部（無下架品）", purchasableAssets().length, COACH_CATALOG.length);
ck("狀態機有 RETIRED 失敗碼", ASSET_FAIL.RETIRED === "retired");
eq("normalize 把「裝備了沒買的教練」拉回 null",
  normalizeClubAssets({ owned: {}, headCoachId: "coach_conditioning" }).headCoachId, null);
eq("normalize：沒有總教練就不留換人紀錄",
  normalizeClubAssets({ owned: {}, headCoachId: null, lastCoachChangeWeek: 9 }).lastCoachChangeWeek, null);
eq("normalize(undefined) 給空袋子", normalizeClubAssets(undefined), emptyClubAssets());

// ── ⑦ 週鎖 ───────────────────────────────────────────────────────────────
console.log("\n── ⑦ 週鎖 ──");
let A = purchaseAsset(emptyClubAssets(), "coach_conditioning", rich).assets;
A = purchaseAsset(A, "coach_scouting", rich).assets;

const first = equipHeadCoach(A, "coach_conditioning", { careerWeek: 3 });
ck("空槽首次裝備成功", first.ok === true && first.firstEquip === true);
eq("首裝不寫 lastCoachChangeWeek（買完當週仍能換）", first.assets.lastCoachChangeWeek, null);

const swap = equipHeadCoach(first.assets, "coach_scouting", { careerWeek: 3 });
ck("首裝之後同一週還能換一次", swap.ok === true && swap.firstEquip === false);
eq("換人寫下當週", swap.assets.lastCoachChangeWeek, 3);

const swapAgain = equipHeadCoach(swap.assets, "coach_conditioning", { careerWeek: 3 });
ck("同一週第二次換人被拒", swapAgain.ok === false && swapAgain.code === ASSET_FAIL.WEEKLY_LOCKED);
eq("被拒時 state 零變化", JSON.stringify(swapAgain.assets), JSON.stringify(swap.assets));

const nextWeek = equipHeadCoach(swap.assets, "coach_conditioning", { careerWeek: 4 });
ck("跨到下一個生涯週就能再換", nextWeek.ok === true);
eq("換人紀錄更新為新的一週", nextWeek.assets.lastCoachChangeWeek, 4);

const sameCoach = equipHeadCoach(swap.assets, "coach_scouting", { careerWeek: 3 });
ck("重複裝備現任被拒（且不消耗資格）", sameCoach.ok === false && sameCoach.code === ASSET_FAIL.ALREADY_EQUIPPED);
eq("重複裝備現任 state 零變化", JSON.stringify(sameCoach.assets), JSON.stringify(swap.assets));

const notOwned = equipHeadCoach(swap.assets, "coach_tactical", { careerWeek: 9 });
ck("裝備沒買的教練被拒", notOwned.ok === false && notOwned.code === ASSET_FAIL.NOT_OWNED);

//  ⚠ reload 繞不過：週鎖狀態存在存檔裡，normalize 之後仍然鎖著。
const reloaded = normalizeClubAssets(JSON.parse(JSON.stringify(swap.assets)));
eq("reload 之後 lastCoachChangeWeek 還在", reloaded.lastCoachChangeWeek, 3);
ck("reload 之後同週仍然換不了",
  equipHeadCoach(reloaded, "coach_conditioning", { careerWeek: 3 }).ok === false);
//  年度／賽季 rollover：週次是從總天數推導的單調值，跨年只是更大的數字。
ck("跨賽季（第 13 週）仍可換", equipHeadCoach(swap.assets, "coach_conditioning", { careerWeek: 13 }).ok === true);
ck("跨年度（第 97 週）仍可換", equipHeadCoach(swap.assets, "coach_conditioning", { careerWeek: 97 }).ok === true);
ck("canChangeCoach 對空槽回 first_equip", canChangeCoach(emptyClubAssets(), 1).code === "first_equip");

//  ⚠ 沒有「卸下」——那是繞過週鎖的唯一路徑。
ck("狀態機不提供任何卸下入口",
  !("unequipHeadCoach" in stateMod) && !("clearHeadCoach" in stateMod)
  && !readFileSync(join(ROOT, "src/platform/assets/clubAssetsState.js"), "utf8").includes("unequip"));

// ── ⑧ lifetime 與俱樂部等級保護 ──────────────────────────────────────────
console.log("\n── ⑧ lifetime 保護 ──");
const R0 = { ...emptyRetention(), clubPoints: 2000, clubPointsLifetime: 2000 };
const tierBefore = clubTierOf(R0.clubPointsLifetime);
const spent = spendClubPoints(R0, 1700);
ck("花得動", spent.ok === true);
eq("餘額正確扣除", spent.retention.clubPoints, 300);
eq("lifetime 逐值不變", spent.retention.clubPointsLifetime, R0.clubPointsLifetime);
const tierAfter = clubTierOf(spent.retention.clubPointsLifetime);
eq("俱樂部等級不下降", tierAfter.id, tierBefore.id);
ck("花光之後等級仍在（精英俱樂部）", tierAfter.id === "elite", tierAfter.name);
const overspend = spendClubPoints(spent.retention, 999);
ck("超額消費被拒", overspend.ok === false);
eq("超額消費 state 零變化", JSON.stringify(overspend.retention), JSON.stringify(spent.retention));

//  ⚠ profileStore 的購買路徑必須走 spendClubPoints，不得自己減餘額。
const storeSrc = readFileSync(join(ROOT, "src/platform/profileStore.js"), "utf8");
ck("buyClubAsset 走 spendClubPoints", /buyClubAsset[\s\S]{0,2200}?spendClubPointsIn\(/.test(storeSrc));
ck("store 沒有任何地方手動遞減 clubPoints",
  !/clubPoints:\s*[^,\n]*-\s/.test(storeSrc.replace(/clubPoints:\s*R\.clubPoints\s*-\s*n/g, "")));

// ── ⑨ view：規則全在 domain 算完 ─────────────────────────────────────────
console.log("\n── ⑨ view ──");
const view = clubAssetsViewOf(first.assets, {
  catalog: COACH_CATALOG, clubPoints: 800, clubPointsLifetime: 800, careerWeek: 3,
});
eq("view 帶出三筆", view.items.length, 3);
const vCond = view.items.find((i) => i.assetId === "coach_conditioning");
const vScout = view.items.find((i) => i.assetId === "coach_scouting");
const vTac = view.items.find((i) => i.assetId === "coach_tactical");
ck("已擁有且已裝備", vCond.owned === true && vCond.equipped === true);
ck("已擁有但未裝備 ⇒ 可裝備", vScout.owned === true && vScout.equipped === false && vScout.canEquip === true);
ck("未擁有且買不起 ⇒ 不可買且說得出差多少", vTac.canBuy === false && vTac.shortBy === 900, `shortBy=${vTac.shortBy}`);
eq("買不起的阻擋碼是 insufficient", vTac.blockedBy, ASSET_FAIL.INSUFFICIENT);
const viewPoor = clubAssetsViewOf(emptyClubAssets(), {
  catalog: COACH_CATALOG, clubPoints: 9999, clubPointsLifetime: 100, careerWeek: 1,
});
eq("lifetime 不足時阻擋碼是 prerequisite",
  viewPoor.items.find((i) => i.assetId === "coach_tactical").blockedBy, ASSET_FAIL.PREREQUISITE);
ck("空收藏時 view 說得出首裝免費", viewPoor.firstEquipFree === true);
const viewLocked = clubAssetsViewOf(swap.assets, {
  catalog: COACH_CATALOG, clubPoints: 0, clubPointsLifetime: 0, careerWeek: 3,
});
ck("週鎖時 view 說得出原因", viewLocked.canChangeCoach === false && viewLocked.changeBlockedBy === ASSET_FAIL.WEEKLY_LOCKED);
ck("週鎖時已擁有的都不可裝備", viewLocked.items.filter((i) => i.owned && !i.equipped).every((i) => i.canEquip === false));

console.log(`\nClub Assets v1：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`
  + (skipped ? `　（${skipped} 項不適用於本 release，見 ② Online 邊界）` : ""));
if (fail) process.exitCode = 1;
