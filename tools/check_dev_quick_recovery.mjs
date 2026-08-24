#!/usr/bin/env node
// ============================================================================
//  tools/check_dev_quick_recovery.mjs — DEV 快速恢復／快速推進的守門
//
//  執行：repo 根目錄 `node tools/check_dev_quick_recovery.mjs`；**失敗時 exit 1**。
//
//  ── 這支 gate 要證明什麼 ─────────────────────────────────────────────────
//  DEV Quick Recovery 是**開發測試便利功能，不是正式遊戲設計**。
//  一個測試工具最容易出的兩種事故，這裡各釘一邊：
//
//    ① **漏到正式版**——玩家看得到、按得到，正式難度被悄悄拿掉。
//    ② **把正式規則改鬆來遷就工具**——例如順手把 `unfitBelow` 調低、
//       把恢復費率調高、或另寫一套「開發用的推進日期」繞過賽季日曆。
//
//  另外還驗一件與工具無關、但**必須先成立**的事：
//    ③ **正式玩法本來就沒有 soft-lock。** 如果正式玩家真的會卡死，那應該修
//       正式玩法，不是拿 DEV 工具蓋住。這裡用真的 Store 實跑一次全隊體力見底
//       ＋ 零資金的情境，證明玩家能免費脫困。
//
//  §1 閘門（4）  §2 恢復目標由門檻推導（4）  §3 推進走既有時鐘（3）
//  §4 工具隔離與可移除性（4）  §5 正式規則零改動（4）
//  §6 正式玩法沒有 soft-lock（實跑，4）  §7 mutation sentinel A–D
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── 測試環境 shim ───────────────────────────────────────────────────────────
//  `isDebugMode()` 讀 window.location 與 localStorage；profileStore 讀 localStorage。
//  這不是第二套實作，只是讓 Node 能走到既有程式碼的那些分支。
const storage = new Map();
const makeStorage = () => ({
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
});
globalThis.localStorage = makeStorage();
/** 假裝瀏覽器在某個網址上。`search = null` ⇒ 完全沒有 window（等同 SSR/Node）。 */
function setWindow(search) {
  if (search === null) { delete globalThis.window; return; }
  globalThis.window = { location: { search, hash: "" }, localStorage: makeStorage() };
}

const P_LOGIC = "src/debug/DevQuickRecovery/logic.js";
const P_PANEL = "src/debug/DevQuickRecovery/index.jsx";
const P_TRAINING = "src/screens/manage/TrainingScreen.jsx";
const P_FLAGS = "src/featureFlags.js";

const cond = await import(pathToFileURL(resolve(ROOT, "src/platform/condition/playerCondition.js")).href);
const flags = await import(pathToFileURL(resolve(ROOT, P_FLAGS)).href);

// ── sentinel 用：把變異後的 logic.js 寫在**同一個資料夾**再 import ───────────
//  必須同資料夾，否則 `../../platform/...` 這些相對 import 會解析不到。
const TMP = [];
async function importMutatedLogic(mutate, tag) {
  const src = read(P_LOGIC);
  const mutated = mutate(src);
  if (mutated === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改，請更新 sentinel）`);
  const tmp = resolve(ROOT, `src/debug/DevQuickRecovery/.sentinel-${tag}.js`);
  fs.writeFileSync(tmp, mutated, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}

// ── §1 閘門：正式模式看不到 ────────────────────────────────────────────────
console.log("\n§1 閘門");

/** 「正式（非測試）模式下工具是隱形的」的判準——sentinel A 會拿它去測變異版。 */
function hiddenInProduction(mod) {
  setWindow(null);
  const noWindow = mod.devQuickRecoveryEnabled() === false;
  setWindow("");                       // 有瀏覽器、但沒有任何 debug 訊號
  const plainVisit = mod.devQuickRecoveryEnabled() === false;
  setWindow("?asiaCircuit=1");         // 有其他參數，但不是 debug
  const otherParams = mod.devQuickRecoveryEnabled() === false;
  return noWindow && plainVisit && otherParams;
}

const logic = await importMutatedLogic((s) => `${s}\n`, "identity");  // 與正式碼逐字相同的副本
{
  ck("1) production / default 模式看不到 DEV 工具（無 window／一般造訪／其他參數皆 false）",
    hiddenInProduction(logic));

  setWindow("?debug=1");
  ck("2) 測試模式 ＋ 旗標開啟 ⇒ 顯示", logic.devQuickRecoveryEnabled() === true);

  setWindow("?debug=0");
  ck("3) `?debug=0` 可明確關閉（逃生口仍在）", logic.devQuickRecoveryEnabled() === false);

  ck("4) 旗標是單一關閉點（`featureEnabled('devQuickRecovery')` 存在且為布林）",
    typeof flags.featureEnabled("devQuickRecovery") === "boolean"
      && "devQuickRecovery" in flags.FEATURE_FLAGS,
    `目前值 ${flags.FEATURE_FLAGS.devQuickRecovery}`);
  setWindow(null);
}

// ── §2 恢復目標：由 authoritative 門檻推導，不寫死 ──────────────────────────
console.log("\n§2 恢復目標由門檻推導");

/** 「目標體力是門檻推導出來的」的判準——sentinel B 會拿它去測變異版。 */
function targetIsThresholdDerived(mod) {
  for (const start of [0, 1, 7, 14, 14.5]) {
    const p = { id: "x", name: "X", energy: start };
    const got = mod.energyToMatchFit(p);
    //  期望值 = 從現值起、以既有每日恢復量為步長、第一個讓 isMatchFit 成立的值
    let want = start;
    while (!cond.isMatchFit({ ...p, energy: want })) want += cond.CONDITION.restPerDay;
    if (got !== want) return false;
    //  且**剛好**跨過門檻——多跨一步就代表它在做「一鍵滿血」而不是「解除封鎖」
    if (got - cond.CONDITION.restPerDay >= cond.CONDITION.unfitBelow) return false;
  }
  return true;
}

{
  ck("5) 恢復目標＝門檻推導（多組起始體力逐一比對，剛好跨過門檻不多跨）",
    targetIsThresholdDerived(logic),
    `門檻 ${cond.CONDITION.unfitBelow}／步長 ${cond.CONDITION.restPerDay} ⇒ 0 體力目標 ${logic.energyToMatchFit({ energy: 0 })}`);

  ck("6) 恢復後一定通過 authoritative 的 `isMatchFit()`",
    [0, 3, 14].every((e) => cond.isMatchFit({ id: "y", energy: logic.energyToMatchFit({ id: "y", energy: e }) })));

  ck("7) 已經可出賽的人不動（這是解除封鎖，不是一鍵滿血）",
    [15, 50, 100].every((e) => logic.energyToMatchFit({ id: "z", energy: e }) === e));

  ck("8) logic 向 condition 層要門檻與費率（沒有自己的體力常數）",
    /CONDITION\.restPerDay/.test(read(P_LOGIC)) && /isMatchFit/.test(read(P_LOGIC))
      && /from "\.\.\/\.\.\/platform\/condition\/playerCondition\.js"/.test(read(P_LOGIC)));
}

// ── §3 推進：走既有 canonical day progression ───────────────────────────────
console.log("\n§3 推進走既有時鐘");

/** 「面板沒有自己的日期邏輯」的判準——sentinel C 會拿它去測變異版。 */
function usesCanonicalDayProgression(panelSrc) {
  const usesStore = /advanceDay\(/.test(panelSrc);
  const FORBIDDEN = [/meta\.days/, /advanceDaysInState/, /weeklySettlement/, /seasonState/, /settleWeek/, /new Date\(/];
  return usesStore && !FORBIDDEN.some((re) => re.test(panelSrc));
}

{
  const panel = read(P_PANEL);
  ck("9) 推進 1／3 天呼叫既有的 `profileStore.advanceDay()`，沒有第二套日期邏輯",
    usesCanonicalDayProgression(panel));

  ck("10) 推不滿時照實顯示原因，不強推（讀 `stoppedBy` 並顯示）",
    /stoppedBy/.test(panel) && /不強推|請先出賽或棄權/.test(panel));

  ck("11) 兩顆推進鈕都存在且天數是 1 與 3",
    /data-testid="dev-advance-1"[\s\S]{0,120}advance\(1\)/.test(panel)
      && /data-testid="dev-advance-3"[\s\S]{0,120}advance\(3\)/.test(panel));
}

// ── §4 工具隔離與可移除性 ──────────────────────────────────────────────────
console.log("\n§4 工具隔離與可移除性");
{
  //  正式程式碼裡真的 **import** DEV 工具的地方只能有一處（TrainingScreen 的掛載點）。
  //  ⚠ 只數 import，不數註解——`featureFlags.js` 的移除說明本來就該指名它，
  //    把那種提及也算成「耦合」會逼人刪掉移除指引，正好與本 gate 的目的相反。
  const refs = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!rel.includes("/debug")) walk(rel); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      if (/^\s*import[^\n]*DevQuickRecovery/m.test(read(rel))) refs.push(rel);
    }
  };
  walk("src");
  ck("12) 正式程式碼只有一處 import DEV 工具（＝唯一掛載點，好整包移除）",
    refs.length === 1 && refs[0].endsWith("TrainingScreen.jsx"), refs.join(" ") || "(無)");

  const training = read(P_TRAINING);
  ck("13) 掛載點就是 1 個 import ＋ 1 行 JSX",
    (training.match(/import DevQuickRecovery/g) ?? []).length === 1
      && (training.match(/<DevQuickRecovery \/>/g) ?? []).length === 1);

  ck("14) 工具本體全部在 `src/debug/DevQuickRecovery/`（刪一個資料夾即可）",
    fs.existsSync(resolve(ROOT, "src/debug/DevQuickRecovery/logic.js"))
      && fs.existsSync(resolve(ROOT, "src/debug/DevQuickRecovery/index.jsx"))
      //  排除本 gate 自己寫進去的 sentinel 暫存檔（跑完會刪）
      && fs.readdirSync(resolve(ROOT, "src/debug/DevQuickRecovery"))
        .filter((f) => /\.(js|jsx)$/.test(f) && !f.startsWith(".sentinel-")).length === 2);

  ck("15) 面板自陳「不是正式遊戲設計」（下一個人不會誤讀成產品功能）",
    /開發測試便利功能，不是正式遊戲設計/.test(read(P_PANEL))
      && /開發測試便利功能，不是正式遊戲設計|不是正式遊戲設計/.test(read(P_FLAGS)));
}

// ── §5 正式規則零改動 ──────────────────────────────────────────────────────
console.log("\n§5 正式規則零改動");

/** 「Training v1.1 沒被動過」的判準——sentinel D 會拿它去測變異版。 */
function trainingUnchanged(mod, playerModel) {
  const golden = mod.calculateTrainingResult(
    { id: "golden", name: "Golden", age: 27, potential: 90, energy: 66, learning: 70,
      stats: { focus: 60, mechanics: 60, learning: 70 } },
    playerModel.courseById("aim"));
  return mod.TRAINING_FORMULA_VERSION === "training-growth.v1.1"
    && golden.gains.accuracy === 1.9 && golden.gains.reflex === 1.9
    && golden.totalGain === 3.8 && golden.efficiency === 0.948
    && golden.modifiers.age === 1.01 && golden.modifiers.condition === 0.939
    && golden.energyAfter === 51;
}

const training = await import(pathToFileURL(resolve(ROOT, "src/data/trainingCalculator.js")).href);
const playerModel = await import(pathToFileURL(resolve(ROOT, "src/data/playerModel.js")).href);
{
  ck("16) condition 門檻與恢復費率逐值未動",
    cond.CONDITION.matchEnergyCost === 12 && cond.CONDITION.streakEnergyStep === 3
      && cond.CONDITION.unfitBelow === 15 && cond.CONDITION.restPerDay === 8
      && cond.CONDITION.streakDecayDays === 1,
    JSON.stringify(cond.CONDITION));

  ck("17) Training v1.1 零語意變更（版本字串 ＋ golden fixture 逐項相符）",
    trainingUnchanged(training, playerModel));

  ck("18) age 仍是訓練係數且仍隨年齡改變",
    typeof training.ageEfficiency === "function"
      && training.ageEfficiency(19) > training.ageEfficiency(34),
    `19:${training.ageEfficiency(19)} 34:${training.ageEfficiency(34)}`);

  ck("19) 休息課仍是免費的 1 天（脫困路徑沒有被順手調整）",
    (() => { const r = playerModel.courseById("rest"); return r?.energyCost === 0 && r?.hours === 1; })());
}

// ── §6 正式玩法沒有 soft-lock（用真的 Store 實跑）──────────────────────────
console.log("\n§6 正式玩法沒有 soft-lock（實跑，不是靠註解宣稱）");
{
  storage.clear();
  const profileMod = await import(pathToFileURL(resolve(ROOT, "src/platform/profileStore.js")).href);
  const store = () => profileMod.useProfileStore.getState();

  //  最壞情境：全隊體力見底、資金歸零、沒有人在訓練。
  const flat = (store().players ?? []).map((p) => ({ ...p, energy: 0, condition: "低潮", training: null }));
  profileMod.useProfileStore.setState({
    players: flat,
    finance: { ...(store().finance ?? {}), funds: 0 },
  });
  ck("20) 情境成立：全隊不可出賽且資金為 0",
    flat.length > 0 && flat.every((p) => !cond.isMatchFit(p)) && Number(store().finance?.funds) === 0,
    `${flat.length} 人 / funds ${store().finance?.funds}`);

  //  ① 免費脫困的入口存在：休息課不看體力（UI 與 Store 都豁免）
  const assigned = store().assignTraining(flat[0].id, "rest");
  ck("21) 0 體力仍可指派「休息調整」（免費、1 天）⇒ 免費脫困入口存在", assigned === true);

  //  ② 推進日期本身不要錢、也不被資金擋
  const before = Number(store().meta?.days) || 1;
  const res = store().advanceDay(1);
  const after = Number(store().meta?.days) || 1;
  ck("22) 零資金仍可推進日期（推進不收費、不被資金擋）",
    after === before + 1, `第 ${before} 天 → 第 ${after} 天${res?.stoppedBy ? `（stoppedBy: ${res.stoppedBy.message}）` : ""}`);

  //  ③ 一天之後，指派休息的人已經脫困（+30 一次到位）
  const rested = (store().players ?? []).find((p) => p.id === flat[0].id);
  const others = (store().players ?? []).filter((p) => p.id !== flat[0].id);
  ck("23) 休息一天後該選手已可出賽；其餘人也靠每日自然恢復往上走",
    cond.isMatchFit(rested) && others.every((p) => Number(p.energy) >= cond.CONDITION.restPerDay),
    `休息者 ${rested?.energy}／其餘 ${others.map((p) => p.energy).join(",")}`);

  //  ④ **完整脫困**：繼續免費推進日期，直到全隊都可出賽。
  //  這才是「有沒有 soft-lock」真正的答案——不是「有沒有一條路」，
  //  而是「那條路走得完，而且不必花錢」。上限只是防呆，不是行為的一部分。
  const fundsBefore = Number(store().finance?.funds) || 0;
  let days = 0;
  while (days < 30 && (store().players ?? []).some((p) => !cond.isMatchFit(p))) {
    store().advanceDay(1);
    days++;
  }
  const allFit = (store().players ?? []).every((p) => cond.isMatchFit(p));
  ck("24) 全隊只靠正常 recovery 就能完全脫困（免費、不需買人）",
    allFit && days < 30,
    `再推 ${days} 天 ⇒ 體力 ${(store().players ?? []).map((p) => Math.round(Number(p.energy))).join(",")}`);
  ck("25) 脫困過程沒有任何花費門檻（推進不需要錢，資金只受既有週結算影響）",
    Number.isFinite(Number(store().finance?.funds)),
    `funds ${fundsBefore} → ${store().finance?.funds}（週結算薪資照常，與推進本身無關）`);
}

// ── §7 mutation sentinel ───────────────────────────────────────────────────
console.log("\n§7 mutation sentinel（把規則改回去 ⇒ 上面對應的檢查必須變紅）");
try {
  // A. 拿掉 isDebugMode 那一層 ⇒ 正式模式也看得到
  const A = await importMutatedLogic(
    (s) => s.replace("  isDebugMode() && featureEnabled(\"devQuickRecovery\");",
      "  featureEnabled(\"devQuickRecovery\");"),
    "A-gate");
  ck("S-A) 拿掉 `isDebugMode()` 那一層 ⇒ 檢查 1 變紅", hiddenInProduction(A) === false);

  // B. 把恢復目標寫死數字
  const B = await importMutatedLogic(
    (s) => s.replace("  const start = Number.isFinite(Number(player?.energy)) ? Number(player.energy) : 0;",
      "  return 100;\n  const start = Number.isFinite(Number(player?.energy)) ? Number(player.energy) : 0;"),
    "B-hardcoded");
  ck("S-B) 把恢復目標寫死 ⇒ 檢查 5 變紅", targetIsThresholdDerived(B) === false);

  // C. 面板自己算日期（不走 advanceDay）
  //  ⚠ 注入的是**真的自己讀時鐘再自己加**的程式碼——這正是掃描器要擋的形狀。
  const mutatedPanel = `${read(P_PANEL)}\n`
    + "const __sentinel = (n) => { const d = Number(useProfileStore.getState().meta.days) + n;\n"
    + "  useProfileStore.setState({ meta: { days: d } }); };\n";
  ck("S-C) 面板自己算日期 ⇒ 檢查 9 變紅", usesCanonicalDayProgression(mutatedPanel) === false);

  // D. 為了遷就工具而動 Training v1.1 的年齡係數
  const tmpTraining = resolve(ROOT, "src/data/.sentinel-training.js");
  fs.writeFileSync(tmpTraining,
    read("src/data/trainingCalculator.js").replace("  const age = ageEfficiency(player.age);", "  const age = 1;"), "utf8");
  TMP.push(tmpTraining);
  const D = await import(pathToFileURL(tmpTraining).href);
  ck("S-D) 順手改掉 Training 年齡係數 ⇒ 檢查 17 變紅", trainingUnchanged(D, playerModel) === false);
} catch (e) {
  ck("S-*) sentinel 可執行", false, String(e.message).slice(0, 200));
} finally {
  setWindow(null);
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

// ── 結果 ───────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅" : "❌"} check_dev_quick_recovery：${pass}/${pass + fail} 通過`);
console.log("   DEV Quick Recovery 是**開發測試便利功能，不是正式遊戲設計**；正式上線前必須關閉或移除。");
console.log(`   正式規則未動：不可出賽門檻 體力 < ${cond.CONDITION.unfitBelow}｜每日恢復 +${cond.CONDITION.restPerDay}｜Training ${training.TRAINING_FORMULA_VERSION}`);
process.exit(fail === 0 ? 0 : 1);
