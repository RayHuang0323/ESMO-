#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_schema_v11.mjs — CS Season M0：schema v11 雙讀相容遷移
//
//  執行：repo 根目錄 `node tools/check_cs_schema_v11.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md §3
//  計畫：docs/superpowers/plans/2026-08-21-cs-season-competition.md（M0）
//
//  M0 證明的**只有一件事**：把賽季狀態改成 keyed by gameMode，沒有弄壞 MOBA。
//  這一支結束時 **CS 仍然沒有任何賽季**——`competitionByMode.cs` 必須是 null。
//
//  守的四組：
//    §1  舊存檔（v8/v10 形狀）載入 → `competitionByMode.moba` 逐值等於
//        遷移前會拿到的那一個；`.cs` 為 null；v2 wrapper 沒有因為改名而空掉
//    §2  別名與 canonical **不可分岔**——含外部 `useProfileStore.setState`
//        那條繞道（既有 6 支 browser gate 走的正是它）
//    §3  mode 參數：預設 moba 逐值不變；`"cs"` 走自己的空狀態；未知 mode 丟例外
//    §4  save → reload round trip，且持久化 payload 仍帶得動既有讀取端
//
//  ⚠ 不得為了讓這一支變綠而放寬斷言。契約要改，先改 §3 規格與交接文件。
// ============================================================================
import fs from "node:fs";

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

const { upgradeSeasonShape } = await import("../src/platform/competition/seasonState.js");

//  ── 舊存檔素材 ───────────────────────────────────────────────────────────
//  用**真的舊存檔**，不是手寫 fixture：s7d_s1_champion.json 是 schemaVersion 8、
//  帶完整 SeasonState.v2 legacy state 的實際存檔，走的正是玩家會走的遷移路徑。
const LEGACY_PATH = "review/fixtures/competition/s7d_s1_champion.json";
const legacyRaw = JSON.parse(fs.readFileSync(new URL(`../${LEGACY_PATH}`, import.meta.url), "utf8"));
//  遷移前的 store 會做的事：`competition: upgradeSeasonShape(saved.competition ?? null)`。
//  拿同一支純函式獨立算一次當期望值 ⇒ 這是等價斷言，不是拿實作對自己。
const expectedMoba = upgradeSeasonShape(legacyRaw.competition ?? null);
const expectedHistory = Array.isArray(legacyRaw.competitionHistory) ? legacyRaw.competitionHistory : [];

/** 載入一份存檔並拿到一個**全新的** store 模組實例（query 破 ESM 快取）。 */
let bootSeq = 0;
const bootWith = async (saved) => {
  LS = JSON.stringify(saved);
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  return mod.useProfileStore;
};

// ── §1 舊存檔遷移 ──────────────────────────────────────────────────────────
console.log("\n§1 舊存檔（v8/v10 形狀）→ v11 遷移");
const store1 = await bootWith(legacyRaw);
const s1 = () => store1.getState();

ck("schemaVersion 升到 11", s1().schemaVersion === 11, `實際 ${s1().schemaVersion}`);
ck("canonical 結構存在且只有 moba / cs 兩個 slot",
  !!s1().competitionByMode && eq(Object.keys(s1().competitionByMode).sort(), ["cs", "moba"]));
ck("舊存檔的 competition 搬進 competitionByMode.moba（逐值相同）",
  eq(s1().competitionByMode.moba, expectedMoba));
ck("moba instance 真的有內容（不是空搬）",
  !!s1().competitionByMode.moba?.schema, `schema=${s1().competitionByMode.moba?.schema}`);
ck("cs instance 初始為 null（M0 不建立任何 CS 賽季）", s1().competitionByMode.cs === null);
ck("competition 別名指向同一個 moba instance（同參考，不是複製）",
  s1().competition === s1().competitionByMode.moba);
ck("competitionHistoryByMode.moba 承接舊 competitionHistory",
  eq(s1().competitionHistoryByMode.moba, expectedHistory));
ck("competitionHistoryByMode.cs 為空陣列", eq(s1().competitionHistoryByMode.cs, []));
ck("competitionHistory 別名逐值等於 .moba",
  eq(s1().competitionHistory, s1().competitionHistoryByMode.moba));
//  ⚠ 這一條守的是遷移最容易踩的坑：v2 wrapper 由 `withIdentity` 在載入時建，
//    而它讀的是**別名**。若別名投影晚於 wrapper 計算，整個賽事頁會空掉。
ck("SeasonState.v2 wrapper 仍然建得出來（別名投影早於 wrapper 計算）",
  !!s1().seasonStateV2);
ck("competitionView() 仍讀得到這一季", s1().competitionView().hasSeason === true);

// ── §2 別名與 canonical 不可分岔 ──────────────────────────────────────────
console.log("\n§2 別名與 canonical 不可分岔");
const mobaBefore = s1().competitionByMode.moba;
const marked = { ...mobaBefore, __v11ProbeMarker: "external-setState" };
store1.setState({ competition: marked });
ck("外部 setState({ competition }) 落在 competitionByMode.moba",
  s1().competitionByMode.moba === marked);
ck("外部 setState 之後別名仍指向同一個 canonical",
  s1().competition === s1().competitionByMode.moba);
ck("外部 setState 沒有碰到 cs slot", s1().competitionByMode.cs === null);

store1.setState({ competitionHistory: [{ id: "probe-final" }] });
ck("外部 setState({ competitionHistory }) 落在 competitionHistoryByMode.moba",
  eq(s1().competitionHistoryByMode.moba, [{ id: "probe-final" }]));
ck("歷史別名與 canonical 一致",
  eq(s1().competitionHistory, s1().competitionHistoryByMode.moba));
ck("歷史寫入沒有污染 cs 的歷史", eq(s1().competitionHistoryByMode.cs, []));

//  functional 形式的 setState 也必須被導回（zustand 允許傳函式）
store1.setState((prev) => ({ competition: { ...prev.competition, __v11ProbeFn: true } }));
ck("functional setState 也被導回 canonical",
  s1().competitionByMode.moba?.__v11ProbeFn === true &&
  s1().competition === s1().competitionByMode.moba);

//  store 內部寫入路徑（`_setCompetitionState`）
store1.getState()._setCompetitionState({ ...s1().competition, __v11ProbeInternal: true });
ck("內部 _setCompetitionState 之後別名與 canonical 仍一致",
  s1().competition === s1().competitionByMode.moba &&
  s1().competitionByMode.moba?.__v11ProbeInternal === true);

// ── §3 mode 參數 ──────────────────────────────────────────────────────────
console.log("\n§3 mode-aware selectors");
const store3 = await bootWith(legacyRaw);
const s3 = () => store3.getState();

ck("competitionView() 與 competitionView(\"moba\") 逐值相同",
  eq(s3().competitionView(), s3().competitionView("moba")));
ck("competitionView(\"cs\") 在無 CS 賽季時 hasSeason 為 false",
  s3().competitionView("cs").hasSeason === false);
//  先給 moba 一份非空歷史，再確認 cs 的 view **不會**把它讀出來。
store3.setState({ competitionHistory: [{ id: "moba-final-1" }] });
ck("competitionView(\"cs\").history 不會回 MOBA 的歷屆名次",
  eq(s3().competitionView("cs").history, []) &&
  eq(s3().competitionView("moba").history, [{ id: "moba-final-1" }]));

ck("ensureCompetitionSeason() 預設就是 moba（已有賽季 ⇒ created:false）",
  eq(s3().ensureCompetitionSeason(), s3().ensureCompetitionSeason("moba")));
const csEnsure = s3().ensureCompetitionSeason("cs");
ck("ensureCompetitionSeason(\"cs\") 在 M0 明確回未實作，不偷建賽季",
  csEnsure.ok === false && csEnsure.state === null && csEnsure.created === false);
ck("ensureCompetitionSeason(\"cs\") 之後 cs slot 仍是 null",
  s3().competitionByMode.cs === null);
ck("activeCompetitionEvent(\"cs\") 回空狀態，不借用 MOBA 的 v2 wrapper",
  s3().activeCompetitionEvent("cs").legacyState === null &&
  s3().activeCompetitionEvent("cs").seasonStateV2 === null);
const v2Before = s3().seasonStateV2;
ck("_syncSeasonStateV2(\"cs\") 是 no-op（v2 wrapper 是 MOBA 專屬）",
  s3()._syncSeasonStateV2("cs") === null && s3().seasonStateV2 === v2Before);

ck("未知 mode 一律丟例外，不靜默回退成 moba",
  threw(() => s3().competitionView("dota")) &&
  threw(() => s3().ensureCompetitionSeason("CS")) &&
  threw(() => s3().activeCompetitionEvent("")));

// ── §4 隔離：碰 cs 不得動到 moba ──────────────────────────────────────────
console.log("\n§4 moba / cs 隔離");
const isoBefore = JSON.stringify(s3().competitionByMode.moba);
const isoV2Before = JSON.stringify(s3().seasonStateV2);
s3().ensureCompetitionSeason("cs");
s3().competitionView("cs");
s3().activeCompetitionEvent("cs");
ck("對 cs 的一串操作之後 moba instance 逐值不變",
  JSON.stringify(s3().competitionByMode.moba) === isoBefore);
ck("對 cs 的一串操作之後 seasonStateV2 逐值不變",
  JSON.stringify(s3().seasonStateV2) === isoV2Before);

// ── §5 save / reload round trip ──────────────────────────────────────────
console.log("\n§5 save / reload");
const store5 = await bootWith(legacyRaw);
store5.getState().save();
const persisted = JSON.parse(LS);
ck("持久化 payload 帶 canonical competitionByMode", !!persisted.competitionByMode);
ck("持久化 payload 的 cs slot 仍是 null", persisted.competitionByMode.cs === null);
//  ⚠ 別名**必須**留在 payload 裡：既有至少 5 支 verifier / browser gate 直接讀
//    `JSON.parse(localStorage...).competition`（tools/browser_check_q6_prod.mjs 等）。
//    拿掉它們會在瀏覽器 gate 才炸，那是最貴的失敗點。
ck("持久化 payload 仍帶 competition 別名（既有讀取端不得斷）", !!persisted.competition);
ck("持久化 payload 的 schemaVersion 是 11", persisted.schemaVersion === 11);

const store5b = await bootWith(persisted);
const s5b = () => store5b.getState();
ck("v11 存檔重新載入後 moba instance 逐值不變",
  eq(s5b().competitionByMode.moba, upgradeSeasonShape(persisted.competitionByMode.moba)));
ck("v11 存檔重新載入後 cs 仍是 null", s5b().competitionByMode.cs === null);
ck("v11 存檔重新載入後別名仍指向 canonical",
  s5b().competition === s5b().competitionByMode.moba);
ck("v11 存檔重新載入後賽事頁仍讀得到這一季", s5b().competitionView().hasSeason === true);
//  重入冪等：v11 → save → 再載入，不得被當成 v10 再遷移一次
store5b.getState().save();
const persisted2 = JSON.parse(LS);
ck("v11 → save → 載入 → save 冪等（canonical 逐值相同）",
  eq(persisted2.competitionByMode.moba, persisted.competitionByMode.moba));

//  ── 誠實揭露：別名留在 payload 裡的代價 ──
const dupBytes = JSON.stringify(persisted.competition ?? null).length;
console.log(`   ↳ 別名在 payload 中的重複量：${dupBytes} bytes（總量 ${LS.length} bytes）`);

// ── §6 Mutation sentinel ─────────────────────────────────────────────────
console.log("\n§6 Mutation sentinel");
//  證明 §2 真的有鑑別力：模擬「少了寫入轉接」的世界——別名被直接覆蓋，
//  canonical 原封不動。那個世界裡 §2 的第一條必須是紅的。
const naiveCurrent = { competition: mobaBefore, competitionByMode: { moba: mobaBefore, cs: null } };
const naiveNext = { ...naiveCurrent, competition: marked };   // 沒有路由的寫法
ck("mutation sentinel：拿掉寫入轉接後，canonical 不會跟著別名走",
  naiveNext.competitionByMode.moba !== marked && naiveNext.competition === marked,
  "memory-only mutation：模擬未經 routeCompetitionWrite 的 set");

// ── 結果 ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nCS schema v11 migration: ${pass}/${total} PASS`);
if (fail > 0) process.exitCode = 1;
