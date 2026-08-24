#!/usr/bin/env node
// ============================================================================
//  tools/check_no_player_injury.mjs — 「ESMO 不採用選手受傷／傷停機制」的守門
//
//  執行：repo 根目錄 `node tools/check_no_player_injury.mjs`；**失敗時 exit 1**。
//
//  ── 這支 gate 要證明什麼 ─────────────────────────────────────────────────
//  受傷（injury / 傷停）在 Milestone O2 曾是 gameplay 狀態：賽後決定性抽籤決定
//  是否受傷、傷停天數每日 −1、傷停中不可出賽、名單／首頁／選手頁都會顯示。
//  產品方向已確定**不採用**這套機制。本 gate 同時擋兩個方向的回歸：
//
//    ① 受傷不得回來 —— 沒有產生路徑、不擋出賽、不倒數、UI 不出現。
//    ② **年齡與體力不得被順手刪掉** —— 移除受傷 ≠ 移除選手生命週期。
//       age / condition / exhausted / 連續出賽 / Training v1.1 年齡係數
//       全部必須原封不動。Season vNext（老化・巔峰・衰退・退休）另案設計，
//       它要能站在這些欄位上，所以這裡把它們一起釘住。
//
//  §1 產生面（4）    §2 出賽資格（6：MOBA / CS 各一套）   §3 每日推進（1）
//  §4 保留面（6）    §5 UI 與寫入路徑（3）  §6 舊存檔（3）
//  §7 mutation sentinel A–D（把規則改回去 ⇒ 這支 gate 必須變紅）
//
//  ⚠ 本檔只讀 `src/`，不改動任何 runtime；sentinel 用的變異副本寫在
//    `tools/.sentinel-*.mjs`，跑完即刪。
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve, join } from "path";
import { parse } from "@babel/parser";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");

//  profileStore 需要 localStorage 才能走 save/load 邊界。這不是第二套
//  persistence，只是讓 verifier 能測到既有存檔路徑；每次 process 都是全新的。
const verifyStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (verifyStorage.has(k) ? verifyStorage.get(k) : null),
  setItem: (k, v) => verifyStorage.set(k, String(v)),
  removeItem: (k) => verifyStorage.delete(k),
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── 受測模組 ────────────────────────────────────────────────────────────────
const cond = await import(pathToFileURL(resolve(ROOT, "src/platform/condition/playerCondition.js")).href);
const squad = await import(pathToFileURL(resolve(ROOT, "src/platform/contracts/matchSquad.js")).href);
const training = await import(pathToFileURL(resolve(ROOT, "src/data/trainingCalculator.js")).href);
const playerModel = await import(pathToFileURL(resolve(ROOT, "src/data/playerModel.js")).href);
const seedPlayers = await import(pathToFileURL(resolve(ROOT, "src/data/players.js")).href);
const uiFoundation = await import(pathToFileURL(resolve(ROOT, "src/ui/playerProfileFoundation.js")).href);

// ── 原始碼掃描範圍 ─────────────────────────────────────────────────────────
//  只掃經營／UI／platform 三區。`src/battle/**` 的「受傷／承受傷害」講的是
//  戰鬥中掉血，與選手傷病無關，掃進來只會製造假紅。
const SCAN_DIRS = ["src/screens", "src/ui", "src/platform"];
const CODE = /\.(js|jsx)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (CODE.test(entry.name)) out.push(rel);
  }
  return out;
}
const SCAN_FILES = SCAN_DIRS.flatMap((d) => walk(d));

/**
 * 把註解塗白（同長度空白、換行保留 ⇒ 行號不變）再拿去掃。
 *
 * ⚠ 這是刻意的。本輪把「為什麼不做受傷」寫進了幾個檔頭，那是**給下一個開發者
 *   看的說明**，不是產品行為，也不是玩家看得到的字。掃描要擋的只有兩件事：
 *   ① 真的還在用的 injury 識別字；② 真的會被渲染出去的傷病字面。
 *   把註解一起擋掉，只會逼人刪掉「為什麼不做」的說明——那正好是最該留下的東西。
 */
function stripComments(text) {
  let out = text;
  try {
    const ast = parse(text, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
    for (const c of ast.comments ?? []) {
      const blanked = out.slice(c.start, c.end).replace(/[^\n]/g, " ");
      out = out.slice(0, c.start) + blanked + out.slice(c.end);
    }
  } catch { /* 解析不了就整份掃，寧可嚴格 */ }
  return out;
}
const SOURCES = new Map(SCAN_FILES.map((f) => [f.replace(/\\/g, "/"), stripComments(read(f))]));

/** 掃出違規行。`sources` 可被替換 ⇒ sentinel 能餵變異內容進來。 */
function scanFor(pattern, sources = SOURCES) {
  const hits = [];
  for (const [file, text] of sources) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${file}:${i + 1}`);
      pattern.lastIndex = 0;
    });
  }
  return hits;
}
const RE_INJURY_ID = /injur/i;                       // injuryDays / isInjured / injuryRisk …
const RE_INJURY_ZH = /受傷|傷停|傷病|療傷/;           // 玩家看得到的字面

// ── sentinel 用：把變異後的原始碼寫成臨時模組再 import ──────────────────────
const TMP = [];
async function importMutated(relPath, mutate, tag) {
  const src = read(relPath);
  const mutated = mutate(src);
  if (mutated === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改，請更新 sentinel）`);
  const tmp = resolve(ROOT, `tools/.sentinel-${tag}.mjs`);
  fs.writeFileSync(tmp, mutated, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}

// ── 共用 fixture ───────────────────────────────────────────────────────────
const mkPlayer = (id, role, extra = {}) => ({
  id, name: id, role, lv: 10, xp: 0, potential: 90, age: 24,
  energy: 90, condition: "精神飽滿", rosterTier: "active",
  stats: { accuracy: 60, reflex: 60, learning: 70 }, ...extra,
});
const MOBA_ROLES = ["上路", "打野", "中路", "下路", "輔助"];
const CS_ROLES = ["上路", "打野", "中路", "下路", "輔助"];

/** 五名帶著舊存檔傷停資料的選手（體力充足 ⇒ 唯一可能的阻擋原因就是受傷）。 */
const HURT_MOBA = MOBA_ROLES.map((r, i) => mkPlayer(`m${i + 1}`, r, { injuryDays: 6, injured: true }));
const HURT_CS = CS_ROLES.map((r, i) => mkPlayer(`c${i + 1}`, r, { injuryDays: 6, injured: true }));
const mobaSeats = { b1: "m1", b2: "m2", b3: "m3", b4: "m4", b5: "m5" };
const csSeats = { f1: "c1", f2: "c2", f3: "c3", f4: "c4", f5: "c5" };

// ── §1 產生面：受傷不再被產生 ───────────────────────────────────────────────
console.log("\n§1 產生面");

/** 「這次結算有沒有生出受傷」的判準——sentinel B 會拿同一個判準去測變異版。 */
function settlementIsInjuryFree(mod, player, key) {
  const wear = mod.applyMatchWear(player, key);
  const leaked = Object.keys(wear).filter((k) => RE_INJURY_ID.test(k));
  const onPlayer = Object.keys(wear.player).filter((k) => RE_INJURY_ID.test(k) && !(k in player));
  const onRecent = (wear.player.recentMatches ?? []).some((r) => Object.keys(r ?? {}).some((k) => RE_INJURY_ID.test(k)));
  return leaked.length === 0 && onPlayer.length === 0 && !onRecent;
}

{
  const fresh = mkPlayer("s1", "中路");
  ck("1) 比賽結算不再產生 injury（回傳與選手物件都沒有 injury 欄位）",
    settlementIsInjuryFree(cond, fresh, "tx-1:s1"));

  //  舊機制：體力 < 30 ⇒ 受傷機率跳到 12%。掃 400 組 key，一次都不該生出受傷。
  const low = mkPlayer("s2", "中路", { energy: 5 });
  ck("2) 低 condition 不會產生 injury（400 組決定性 key 全數乾淨）",
    Array.from({ length: 400 }, (_, i) => settlementIsInjuryFree(cond, low, `tx-low-${i}:s2`)).every(Boolean));

  //  舊機制：連續出賽每場 +2%（上限 35%）。streak 99 是舊上限區。
  const streaky = mkPlayer("s3", "中路", { energy: 20, matchStreak: 99 });
  ck("3) 連續出賽不會產生 injury（streak 99 × 400 組 key 全數乾淨）",
    Array.from({ length: 400 }, (_, i) => settlementIsInjuryFree(cond, streaky, `tx-streak-${i}:s3`)).every(Boolean));

  ck("3b) condition 模組不再輸出任何 injury API",
    !("isInjured" in cond) && !("injuryDaysOf" in cond) && !("injury" in (cond.CONDITION ?? {})),
    Object.keys(cond).filter((k) => RE_INJURY_ID.test(k)).join(",") || "（無）");
}

// ── §2 出賽資格：injury 不再是資格條件 ─────────────────────────────────────
console.log("\n§2 出賽資格");

/** 「傷停資料不影響出賽」的判準——sentinel A 會拿同一個判準去測變異版。 */
const oldSaveCanPlay = (mod) => mod.matchFitness({ id: "a", name: "A", age: 27, energy: 66, injuryDays: 6, injured: true }).ok === true;

{
  ck("4) injuryDays > 0 的舊存檔選手仍可出賽", oldSaveCanPlay(cond));

  const v = squad.validateSquad({ mode: "moba", seats: mobaSeats, players: HURT_MOBA });
  ck("5) injury 不再是 eligibility condition（整隊帶傷停資料仍通過驗證）",
    v.ok && !v.errors.some((e) => RE_INJURY_ID.test(e.code ?? "")),
    v.errors.map((e) => e.code).join(",") || "無錯誤");

  //  §6：auto lineup 不得因為 injury 跳過任何人
  const filled = squad.autoFillSquad({ mode: "moba", seats: {}, players: HURT_MOBA });
  ck("6) auto lineup 不因 injury skip player（五席全部填滿）",
    Object.values(filled).filter(Boolean).length === 5,
    JSON.stringify(filled));

  //  §16/17：MOBA 與 CS 兩套名單都不得回歸。CS 走自己的席位（f1–f5）與角色對位，
  //  是另一條 validateSquad 路徑，必須各驗一次——只驗 MOBA 會漏掉 CS。
  const vCs = squad.validateSquad({ mode: "cs", seats: csSeats, players: HURT_CS });
  ck("5b) CS roster 不回歸（整隊帶傷停資料仍通過 CS 陣容驗證）",
    vCs.ok && !vCs.errors.some((e) => RE_INJURY_ID.test(e.code ?? "")),
    vCs.errors.map((e) => e.code).join(",") || "無錯誤");

  const filledCs = squad.autoFillSquad({ mode: "cs", seats: {}, players: HURT_CS });
  ck("6c) CS auto lineup 不因 injury skip player（五席全部填滿）",
    Object.values(filledCs).filter(Boolean).length === 5,
    JSON.stringify(filledCs));

  //  對照組：exhausted 仍然要被跳過（不能因為拆受傷就讓疲勞失去意義）
  const tired = MOBA_ROLES.map((r, i) => mkPlayer(`t${i + 1}`, r, { energy: cond.CONDITION.unfitBelow - 1 }));
  const tiredFill = squad.autoFillSquad({ mode: "moba", seats: {}, players: tired });
  ck("6b) 對照：auto lineup 仍會跳過 exhausted 選手（疲勞沒有一併失效）",
    Object.values(tiredFill).filter(Boolean).length === 0);
}

// ── §3 每日推進：不再有傷停倒數 ────────────────────────────────────────────
console.log("\n§3 每日推進");
{
  const before = { id: "d1", name: "D", age: 27, energy: 66, injuryDays: 6, restDays: 0 };
  const after = cond.applyDailyRecovery(before);
  ck("7) daily progression 不再依賴 injury countdown（舊欄位原封不動，不倒數）",
    after.injuryDays === 6, `injuryDays ${before.injuryDays} → ${after.injuryDays}`);
}

// ── §4 保留面：condition / exhausted / age / Training v1.1 ────────────────
console.log("\n§4 保留面（移除受傷 ≠ 移除年齡與體力）");

/** 「Training 年齡係數仍在作用」的判準——sentinel C 會拿同一個判準去測變異版。 */
function trainingIsAgeSensitive(mod) {
  const course = playerModel.courseById("aim");
  const young = mod.calculateTrainingResult(mkPlayer("y", "中路", { age: 19, energy: 66 }), course);
  const old = mod.calculateTrainingResult(mkPlayer("o", "中路", { age: 34, energy: 66 }), course);
  return young.modifiers.age > old.modifiers.age && young.totalGain > old.totalGain;
}

{
  ck("8) condition 仍存在（體力仍會因出賽下降、conditionText 仍分級）",
    cond.applyMatchWear(mkPlayer("e1", "中路", { energy: 90 }), "k").player.energy < 90
      && cond.conditionText(90) === "精神飽滿" && cond.conditionText(20) === "疲勞");

  ck("9) exhausted 仍存在且仍擋出賽",
    cond.isExhausted({ energy: cond.CONDITION.unfitBelow - 1 }) === true
      && cond.matchFitness({ id: "x", name: "X", energy: cond.CONDITION.unfitBelow - 1 }).code === "exhausted");

  ck("10) 連續出賽仍累積且仍加重體力消耗（輪換仍有意義）",
    cond.applyMatchWear(mkPlayer("e2", "中路", { energy: 90, matchStreak: 0 }), "k").drained
      < cond.applyMatchWear(mkPlayer("e3", "中路", { energy: 90, matchStreak: 4 }), "k").drained);

  ck("11) condition recovery 仍存在（休息一天回體力、連續出賽計數會歸零）",
    (() => {
      const r = cond.applyDailyRecovery({ id: "r1", energy: 50, restDays: 0, matchStreak: 3 });
      return r.energy === 50 + cond.CONDITION.restPerDay && r.matchStreak === 0;
    })());

  ck("12) age 欄位仍存在（種子名單每人都有正整數年齡）",
    seedPlayers.INITIAL_PLAYERS.length > 0
      && seedPlayers.INITIAL_PLAYERS.every((p) => Number.isFinite(Number(p.age)) && Number(p.age) > 0),
    seedPlayers.INITIAL_PLAYERS.map((p) => `${p.role}:${p.age}`).join(" "));

  ck("13) Training age factor 仍存在且仍隨年齡改變成長",
    typeof training.ageEfficiency === "function" && trainingIsAgeSensitive(training),
    `18:${training.ageEfficiency(18)} 27:${training.ageEfficiency(27)} 36:${training.ageEfficiency(36)}`);

  //  §14 Training v1.1 零語意變更：版本字串 ＋ golden fixture（本輪之前跑出來的實值）
  const golden = training.calculateTrainingResult(
    { id: "golden", name: "Golden", age: 27, potential: 90, energy: 66, learning: 70,
      stats: { focus: 60, mechanics: 60, learning: 70 } },
    playerModel.courseById("aim"));
  ck("14) Training v1.1 行為未改（版本字串 ＋ golden fixture 逐項相符）",
    training.TRAINING_FORMULA_VERSION === "training-growth.v1.1"
      && golden.gains.accuracy === 1.9 && golden.gains.reflex === 1.9
      && golden.totalGain === 3.8 && golden.efficiency === 0.948
      && golden.modifiers.age === 1.01 && golden.modifiers.learning === 1 && golden.modifiers.condition === 0.939
      && golden.energyAfter === 51,
    JSON.stringify({ g: golden.gains, t: golden.totalGain, e: golden.efficiency, m: golden.modifiers }));

  ck("14b) 訓練本身不產生 injury（結果物件沒有任何 injury 欄位）",
    !JSON.stringify(golden).match(RE_INJURY_ID));
}

// ── §5 UI 與寫入路徑 ───────────────────────────────────────────────────────
console.log("\n§5 UI 與寫入路徑");

/** 「UI 不出現傷停字樣」的判準——sentinel D 會拿同一個判準去測變異內容。 */
const uiWordingClean = (sources) => scanFor(RE_INJURY_ZH, sources).length === 0;

{
  const idHits = scanFor(RE_INJURY_ID);
  ck("15) 沒有 injury write path（screens/ui/platform 三區零個 injury 識別字）",
    idHits.length === 0, idHits.slice(0, 6).join(" ") || "（乾淨）");

  const zhHits = scanFor(RE_INJURY_ZH);
  ck("16) player-facing injury wording 不存在（受傷／傷停／傷病／療傷）",
    uiWordingClean(SOURCES), zhHits.slice(0, 6).join(" ") || "（乾淨）");

  //  狀態 helper 是唯一權威：畫面不自己組狀態字串
  const st = uiFoundation.statusPresentationOf({ id: "u1", name: "U", age: 27, energy: 66, injuryDays: 6, injured: true });
  ck("17) UI 狀態 helper 對舊傷停存檔回傳「可出賽」而非傷停",
    st.canPlay === true && !RE_INJURY_ID.test(st.key) && !RE_INJURY_ZH.test(`${st.label}${st.detail}`),
    `${st.key} / ${st.label} / ${st.detail}`);
}

// ── §6 舊存檔相容（deterministic fixture）───────────────────────────────────
console.log("\n§6 舊存檔相容");
{
  //  §16 指定的 fixture：age 27、體力 66、injuryDays 6、injured true。
  const PLAYER_A = {
    id: "oldsave-a", name: "舊存檔選手", role: "中路", lv: 12, xp: 3000,
    age: 27, potential: 90, energy: 66, condition: "正常",
    injuryDays: 6, injured: true, injuryUntil: 999, injuryRisk: 0.4,
    rosterTier: "active", stats: { accuracy: 60, reflex: 60, learning: 70 },
  };
  const KEY = "esmo.profile.v1";
  verifyStorage.clear();

  let store = null, crashed = null;
  try {
    //  先把舊存檔放進 localStorage，再讓 profileStore 走它自己的 load()。
    const profileMod = await import(pathToFileURL(resolve(ROOT, "src/platform/profileStore.js")).href);
    const s0 = profileMod.useProfileStore.getState();
    verifyStorage.set(KEY, JSON.stringify({ ...s0, players: [PLAYER_A] }));
    profileMod.useProfileStore.setState({ players: [PLAYER_A] });
    s0.save();
    store = profileMod.useProfileStore.getState();
    JSON.parse(verifyStorage.get(KEY));            // save/reload 往返
  } catch (e) { crashed = e; }

  ck("18) old-save injury data 不 crash（載入 → save → 反序列化全程無例外）",
    crashed === null, crashed ? String(crashed.message).slice(0, 120) : "");

  const a = (store?.players ?? []).find((p) => p.id === "oldsave-a");
  ck("18b) 舊存檔 fixture：age 仍是 27、體力仍是 66（沒有被順手清掉）",
    Number(a?.age) === 27 && Number(a?.energy) === 66, `age=${a?.age} energy=${a?.energy}`);

  ck("18c) 舊存檔 fixture：可出賽，且狀態摘要不含 injury 欄位",
    cond.matchFitness(a).ok === true
      && !Object.keys(cond.conditionSummary(a)).some((k) => RE_INJURY_ID.test(k)),
    Object.keys(cond.conditionSummary(a)).join(","));
}

// ── §7 mutation sentinel ───────────────────────────────────────────────────
console.log("\n§7 mutation sentinel（把規則改回去 ⇒ 上面對應的檢查必須變紅）");
try {
  // A. 重新把 injuryDays > 0 當成不可出賽
  const A = await importMutated("src/platform/condition/playerCondition.js",
    (s) => s.replace("  if (isExhausted(player)) {",
      "  if (Number(player?.injuryDays) > 0) return { ok: false, code: \"injured\", message: \"傷停中\" };\n  if (isExhausted(player)) {"),
    "A-eligibility");
  ck("S-A) 重新把 injuryDays > 0 當成不可出賽 ⇒ 檢查 4 變紅", oldSaveCanPlay(A) === false);

  // B. 重新加入 injury roll
  const B = await importMutated("src/platform/condition/playerCondition.js",
    (s) => s.replace("      matchesPlayed: num(player?.matchesPlayed) + 1,",
      "      matchesPlayed: num(player?.matchesPlayed) + 1,\n      injuryDays: 4,"),
    "B-roll");
  ck("S-B) 重新加入 injury roll ⇒ 檢查 1–3 變紅",
    settlementIsInjuryFree(B, mkPlayer("s1", "中路"), "tx-1:s1") === false);

  // C. 把 Training age factor 拿掉
  const C = await importMutated("src/data/trainingCalculator.js",
    (s) => s.replace("  const age = ageEfficiency(player.age);", "  const age = 1;"),
    "C-agefactor");
  ck("S-C) 把 Training age factor 拿掉 ⇒ 檢查 13 變紅", trainingIsAgeSensitive(C) === false);

  // D. UI 重新顯示「傷停」
  //  ⚠ 注入的是**會被渲染的字串**，不是註解——註解本來就允許（見 stripComments）。
  const mutatedSources = new Map(SOURCES);
  const victim = "src/screens/manage/RosterScreen.jsx";
  mutatedSources.set(victim, `${SOURCES.get(victim)}\nexport const __SENTINEL_BADGE = "傷停 3 天";\n`);
  ck("S-D) UI 重新顯示「傷停」 ⇒ 檢查 16 變紅", uiWordingClean(mutatedSources) === false);
} catch (e) {
  ck("S-*) sentinel 可執行", false, String(e.message).slice(0, 160));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

// ── 結果 ───────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅" : "❌"} check_no_player_injury：${pass}/${pass + fail} 通過`);
console.log("   產品規則：選手不再有受傷 gameplay 狀態；年齡・體力・疲勞・連續出賽・Training v1.1 全數保留。");
console.log("   Season vNext（年齡推進／巔峰／衰退／退休／新人生成）另案設計，本輪不實作。");
process.exit(fail === 0 ? 0 : 1);
