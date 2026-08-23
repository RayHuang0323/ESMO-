// ============================================================================
//  Fan System F0 驗證：repo 根目錄執行 `node tools/check_fan_f0.mjs`
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  F0 只做兩件事，這裡就只驗這兩件：
//    1. `meta.fans` 的**載入清洗**——壞存檔不得把非法值帶進 runtime，
//       但合法值（含 0）必須原樣保留、**不做尺度 migration**。
//    2. `reputation` **deprecated**——欄位還在（舊存檔仍可讀），但不再是產品輸出：
//       settlement 不寫入、收據不帶、UI 不顯示。
//  外加兩條長期紅線（F1 會搬進 `check_fan_system.mjs`）：結算冪等、粉絲不碰戰力。
//
//  ⚠ 這**不是** F5 的 `check_fan_system.mjs`。那一支從 F1 才開始建。
//    本檔的斷言之後會併進去，不要在兩邊各維護一份。
//
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗 → 一律用絕對 file:// URL import。
//  ⚠ profileStore 的 `canLS` 在 **module 載入當下**就固定了，所以 localStorage
//    的假實作必須在**第一次 import 之前**裝好；每個情境都用 `?v=` 讓 ESM 重新求值。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const A = [];
const ck = (name, cond, detail = "") => A.push([name, !!cond, detail]);

// ── 假 localStorage（必須在載入 profileStore 之前）──────────────────────────
const KEY = "esmo.profile.v1";
let store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

let seq = 0;
/**
 * 把一段**原始 JSON 文字**放進假存檔，重新載入 profileStore，回傳 state。
 * 刻意收字串而不是物件：`Infinity` 這種值沒辦法用 `JSON.stringify` 產生
 * （會變成 `null`），但 `JSON.parse('{"fans":1e999}')` 真的會得到 Infinity——
 * 那正是壞存檔在現實中的樣子。
 */
async function loadWithRawSave(rawJson) {
  store.clear();
  if (rawJson !== null) store.set(KEY, rawJson);
  const mod = await import(u("src/platform/profileStore.js") + `?v=${++seq}`);
  return mod.useProfileStore.getState();
}

const DEFAULT_FANS = 128_000;

// ══ §1 合法值原樣保留（最重要的一條：裁決 2 不做尺度 migration）════════════
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 128_000, days: 8 } }));
  ck("1a) 正常 128000 存檔載入後**逐值不變**", s.meta.fans === 128_000, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 0, days: 8 } }));
  ck("1b) `0` 是合法值，不得被當成壞值換掉", s.meta.fans === 0, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 1, days: 8 } }));
  ck("1c) 小的合法值也原樣保留（沒有隱藏的下限）", s.meta.fans === 1, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 9_999_999, days: 8 } }));
  ck("1d) 大的合法值也原樣保留（沒有隱藏的上限）", s.meta.fans === 9_999_999, `得到 ${s.meta.fans}`);
}

// ══ §2 壞值被清洗 ═════════════════════════════════════════════════════════
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: -5, days: 8 } }));
  ck("2a) 負數 → 夾到 0（不憑空發粉絲，也不判死刑）", s.meta.fans === 0, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: null, days: 8 } }));
  ck("2b) `null` → 回退 DEFAULT（不是 0——「沒有值」不等於「零粉絲」）",
    s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  //  顯式的 undefined 是最陰的一種：spread 擋不住，`{...{fans:1},...{fans:undefined}}`
  //  會得到 `{fans: undefined}`。JSON 沒有 undefined 字面值，所以這裡直接構造。
  store.clear();
  store.set(KEY, JSON.stringify({ meta: { days: 8 } }));   // 缺 fans ⇒ 等價於 undefined
  const mod = await import(u("src/platform/profileStore.js") + `?v=${++seq}`);
  const s = mod.useProfileStore.getState();
  ck("2c) 缺 `fans` 欄位 → DEFAULT", s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave('{"meta":{"fans":1e999,"days":8}}');
  ck("2d) `Infinity`（JSON 的 1e999）→ 回退 DEFAULT",
    s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave('{"meta":{"fans":-1e999,"days":8}}');
  ck("2e) `-Infinity` → 回退 DEFAULT（不是夾到 0——它不是可還原的負數）",
    s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  //  Number("abc") === NaN ⇒ 這一條同時覆蓋「非數字字串」與 NaN 分支
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: "abc", days: 8 } }));
  ck("2f) 非數字字串 / NaN → 回退 DEFAULT", s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: {}, days: 8 } }));
  ck("2g) 物件 → 回退 DEFAULT", s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: true, days: 8 } }));
  ck("2h) 布林 → 回退 DEFAULT（`Number(true) === 1` 不該變成 1 個粉絲）",
    s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: "128000", days: 8 } }));
  ck("2i) 數字字串 → 取其數值（型別錯但意圖明確，與既有 `num()` 一致）",
    s.meta.fans === 128_000, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 1234.7, days: 8 } }));
  ck("2j) 小數 → floor（清洗不得讓粉絲變多）", s.meta.fans === 1234, `得到 ${s.meta.fans}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 128_000, days: 8 } }));
  ck("2k) 清洗後一定是整數", Number.isInteger(s.meta.fans), `得到 ${typeof s.meta.fans}`);
}

// ══ §3 reload 穩定 / 舊存檔相容 ═══════════════════════════════════════════
{
  //  冪等：清洗過的值再存再讀，必須是同一個值（不會每次載入都漂移）
  const first = await loadWithRawSave(JSON.stringify({ meta: { fans: -5, days: 8 } }));
  const again = await loadWithRawSave(JSON.stringify({ meta: { fans: first.meta.fans, days: 8 } }));
  ck("3a) 清洗冪等：sanitize(sanitize(x)) === sanitize(x)",
    again.meta.fans === first.meta.fans, `${first.meta.fans} → ${again.meta.fans}`);
}
{
  //  真的走一次 save → load，而不是自己捏 JSON
  store.clear();
  store.set(KEY, JSON.stringify({ meta: { fans: 128_000, days: 8 } }));
  const m1 = await import(u("src/platform/profileStore.js") + `?v=${++seq}`);
  m1.useProfileStore.getState().save();
  const persisted = JSON.parse(store.get(KEY));
  const m2 = await import(u("src/platform/profileStore.js") + `?v=${++seq}`);
  const s2 = m2.useProfileStore.getState();
  ck("3b) save → reload 之後 fans 仍是 128000（落盤與再載入都不漂移）",
    persisted.meta.fans === 128_000 && s2.meta.fans === 128_000,
    `落盤 ${persisted.meta.fans} / 重載 ${s2.meta.fans}`);
}
{
  //  舊存檔＝只有少數欄位。其餘欄位回退 DEFAULT，但既有的合法 fans 必須留著。
  const s = await loadWithRawSave(JSON.stringify({
    meta: { fans: 45_678, reputation: 47, days: 30 },
    team: { name: "舊隊伍" },
  }));
  ck("3c) 舊存檔相容：合法 fans 保留、其餘欄位回退 DEFAULT",
    s.meta.fans === 45_678 && s.team.name === "舊隊伍" && Number.isFinite(s.meta.achievement),
    `fans ${s.meta.fans} / team ${s.team.name}`);
}
{
  const s = await loadWithRawSave(JSON.stringify({ meta: { fans: 45_678, reputation: 47, days: 30 } }));
  ck("3d) 舊存檔的 `reputation` **仍讀得到**（deprecated ≠ 刪除）",
    s.meta.reputation === 47, `得到 ${s.meta.reputation}`);
}
{
  const s = await loadWithRawSave(null);
  ck("3e) 完全沒有存檔 → DEFAULT 128000（種子量級未被 F0 改動）",
    s.meta.fans === DEFAULT_FANS, `得到 ${s.meta.fans}`);
}

// ══ §4 reputation deprecated：settlement 不再輸出 ═════════════════════════
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { makeTransactionId, MATCH_PROGRESS_TX_VERSION } =
  await import(u("src/platform/contracts/matchProgressTransaction.js"));

const mkTx = (matchId = "m-1", reputation = 0) => ({
  version: MATCH_PROGRESS_TX_VERSION,
  transactionId: makeTransactionId("moba", matchId),
  matchId,
  mode: "moba",
  sourceResultVersion: "BattleResult.v2",
  recordedAt: 1_700_000_000_000,
  teamRewards: { money: 120_000, fans: 300, reputation },
  playerProgress: [],
  unlocks: [],
  metadata: { winner: "blue" },
});
const mkState = () => ({
  players: [],
  finance: { funds: 1_000_000, transactions: [] },
  meta: { fans: 1_000, reputation: 40, days: 8 },
  processedMatchTransactions: {},
});

{
  //  ⚠ 刻意送**非零** reputation：如果結算還在套用它，這一條就會紅。
  const { nextState, receipt } = applyProgressToState(mkState(), mkTx("m-1", 7));
  ck("4a) settlement 不再把 reputation 寫進 meta（送 7 也不動）",
    nextState.meta.reputation === 40, `得到 ${nextState.meta.reputation}`);
  ck("4b) 收據不再帶 `team.reputation`",
    !("reputation" in receipt.team), `keys: ${Object.keys(receipt.team).join(",")}`);
  ck("4c) 粉絲仍然正常入帳（F0 沒有動到粉絲結算）",
    nextState.meta.fans === 1_300 && receipt.team.fans === 300,
    `fans ${nextState.meta.fans} / receipt ${receipt.team.fans}`);
  ck("4d) `meta.reputation` 欄位本身仍在（deprecated ≠ 刪除）",
    "reputation" in nextState.meta);
}
{
  //  契約仍接受 reputation 欄位 ⇒ schema 沒有被改動，舊 transaction 仍可驗證
  const { validateMatchProgressTransaction } =
    await import(u("src/platform/contracts/matchProgressTransaction.js"));
  const r = validateMatchProgressTransaction(mkTx("m-2", 0));
  ck("4e) 契約 schema 未變動：帶 reputation 的 transaction 仍然合法",
    r.ok === true || r.errors?.length === 0, JSON.stringify(r).slice(0, 90));
}

// ══ §5 結算冪等（長期紅線，F1 會搬進 check_fan_system）════════════════════
{
  const s0 = mkState();
  const tx = mkTx("m-3", 0);
  const a = applyProgressToState(s0, tx);
  const s1 = { ...s0, ...a.nextState };
  const b = applyProgressToState(s1, tx);
  ck("5a) 同一場重複結算不會重複加粉絲",
    b.nextState === null && b.receipt.alreadyApplied === true && s1.meta.fans === 1_300,
    `第二次 nextState=${b.nextState} fans=${s1.meta.fans}`);
}

// ══ §6 紅線：粉絲不得進入戰力 / 勝率 / 引擎 ═══════════════════════════════
{
  const engines = [
    "src/LogicEngine.js",
    "src/battle/moba/LogicEngine.js",
    "src/battle/battleResult.js",
    "src/battle/moba/matchProgression.js",
    "src/battle/battleReducer.js",
  ];
  const dirty = engines.filter((p) => fs.existsSync(path.join(ROOT, p)) && /\bfans\b/i.test(read(p)));
  ck("6a) 引擎 / 戰力 / BattleResult 完全沒有 `fans`",
    dirty.length === 0, dirty.join(", ") || "(乾淨)");

  //  唯一允許的例外：賽後把現有粉絲數餵給**獎勵公式**（不是模擬）。
  const feed = read("src/battle/useBattleFeed.js");
  const onlyFansNow = (feed.match(/\bfans\w*/gi) ?? []).every((m) => m === "fansNow" || m === "fans");
  ck("6b) `useBattleFeed` 只在賽後把 `fansNow` 餵給獎勵公式（不進模擬）",
    /fansNow:\s*profile\.meta\?\.fans/.test(feed) && onlyFansNow,
    (feed.match(/\bfans\w*/gi) ?? []).join(",") || "(無)");

  //  `teamRewardsFor` 是允許讀 fans 的地方——但它算的是獎勵，不是戰力。
  const rf = read("src/platform/progress/rewardFormulas.js");
  ck("6c) `teamRewardsFor()` 只用 fans 算獎勵，回傳值沒有任何 stats 欄位",
    /fansNow/.test(rf) && !/\bstats\b|winProb|strength/i.test(rf));
}

// ══ §7 UI 不再顯示聲望 ════════════════════════════════════════════════════
{
  const receipt = read("src/ui/RewardReceiptPanel.jsx");
  ck("7a) 賽後收據不再有「聲望」格", !/\["聲望"/.test(receipt));
  ck("7b) 賽後收據也不再讀 `t.reputation`", !/t\.reputation/.test(receipt));

  const moba = read("src/platform/ui/MobaFlowScreens.jsx");
  ck("7c) MOBA 賽後把 `fanGain` 標成「粉絲」而不是「聲望」",
    /\["粉絲",\s*r\.fanGain/.test(moba) && !/\["聲望",\s*r\.fanGain/.test(moba));

  //  全站掃描：不該再有任何**顯示用**的「聲望」字樣（註解不算）
  const uiFiles = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.jsx$/.test(e.name)) uiFiles.push(p);
    }
  };
  walk("src");
  const offenders = uiFiles.filter((p) => {
    if (/EsportsGame\.jsx|App\.jsx/.test(p)) return false;          // Legacy，不在主幹
    return read(p).split("\n").some((ln) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return false;              // 註解不算
      return /["'`]聲望/.test(ln);                                   // 出現在字串字面值裡＝會被顯示
    });
  });
  ck("7d) 主幹 .jsx 沒有任何會被顯示的「聲望」字串",
    offenders.length === 0, offenders.join(", ") || "(乾淨)");
}

// ── 輸出 ───────────────────────────────────────────────────────────────────
let pass = 0;
for (const [name, ok, detail] of A) {
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`);
}
console.log(`\n${pass}/${A.length} 通過`);
process.exit(pass === A.length ? 0 : 1);
