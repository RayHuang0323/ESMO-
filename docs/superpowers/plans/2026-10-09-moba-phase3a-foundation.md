# MOBA Phase 3a 地基（統一組裝＋戰術書）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 MOBA 所有模式經同一份 `MatchSetup` 與同一支組裝器建立比賽，並以只含選擇的 `TacticPlan.v2`＋版本化 Resolver 取代分散的戰術投影；前段（3a-A）與 v20 逐位元對等，末段（3a-B）才升 v21 加入新行為。

**Architecture:** 新增 `MatchRuleset`（明確功能集）→ `MatchSetup`（每場唯一輸入）→ `assembleMatch`（唯一組裝器，順序＝現行 Live）。戰術改為 `TacticPlan.v2`（玩家資料零數值）＋版本化模板／覆蓋層資料＋`tacticResolver`（經典模板輸出與現行 `toEngineTactic`／`toEngineTacticIdentity` 逐欄等價）。UI 由 Capability Registry 驅動，只顯示 live 選項。

**Tech Stack:** React 18 + Vite 5 + zustand；LogicEngine（純 JS）；驗證＝Node `tools/*.mjs`（`ck()` 累積式）＋ `tools/browser/run-gate.mjs` 瀏覽器 gate＋`tools/verify.mjs` 分段 runner。無測試框架。

**Spec:** `docs/design/MOBA_Tactical_AI_Phase3_正式架構.md`（決策過程：`docs/design/MOBA_Tactical_AI_Phase3_教練戰術系統提案.md`）

## Global Constraints

- **版本（Owner 2026-10-09 裁定）**：v20 已發布，其指紋 `050b3f66620f0f57` **永不覆寫**。第一個動到模擬語意清單的任務（T3）即將 `MOBA_SIMULATION_VERSION` 升為 `"moba-sim.v21"`，註解標明「**未發布候選**」；3a 期間 v21 指紋可在未發布狀態下重新登記（依 v17 先例）；3a-A 只作本地候選、**不獨立發布**；3a-B 完成後 v21 整體定稿發布。「3a-A Live 與 v20 逐位元相同」由 T0 黃金基準證明。
- 3a-B 才升 `moba-sim.v21`；`KNOWN_SIMULATION_VERSIONS` 與 v1～v20 指紋一律保留不改。
- 不修改：`src/battle/fps/**`、`src/screens/fps/**`、地圖／Topology 檔（`src/battle/moba/map/**`、`src/gameData.js`）、Online／DB（`src/platform/online/**`、`supabase/**`）。
- 不修改 `SquadSnapshot.v1`、`ChallengeInstance` 雜湊欄位；三個 localStorage 鍵名不變（`esmo.profile.v1`／`esmo.heroProgress.v2`／`esmo.season.v1`）。
- 戰術與素質不得產生傷害／勝率倍率（S28 紅線）。
- 玩家／AI 的戰術資料不得含數值；數值只在 `tacticTemplates`、`tacticOverlays`、`tacticResolver`。
- 正式 ruleset 不得開啟 DEV 旗標或未上線功能；Challenge 不開裝備（`featureFlags.js:84` 邊界）。
- 組裝器不得 import `src/data/heroDatabase.js`（英雄查表一律注入，避免 396KB data URI 進 Node 驗證器）。
- 長驗證一律走 `tools/verify.mjs`；大樣本分批（每批 ≤ 250 場、workers ≤ 3）；開跑前確認無 CS／瀏覽器測試並行、可用記憶體 ≥ 3 GB；瀏覽器 gate 一次一支；log 寫 scratchpad，不寫 repo 路徑。
- 改既有檔前確認換行格式；CRLF 檔不得用會壓平換行的工具改寫（用保留位元組的替換）。
- 每個 commit：`git add <明確檔案>`，不用 `git add .`；截圖與 gate 產出不入版控；不 push、不 deploy（除非 Owner 另行指示）。

## Review Focus

1. **恢復進行中的舊場次**（存檔中 `activeMatch.config.tactic` 是完整 v1 物件，可能含變體數值）：重新整理後必須以 legacy 輸入恢復，且追趕到原時間點的結果與 v20 相同 → Task 4、Task 12 加測。
2. **Challenge 快照未宣告 Ban/Pick 結果**（`draftDeclared=false`）時，v20 根本不組英雄層：`challenge.v20` 必須照樣不組，不能因 ruleset 允許就補上 → Task 5 加測。
3. **玩家換掉某個席位的選手後再載入戰術書**：任務適性必須依新選手重算，計畫本身不變 → Task 10 加測。
4. **正式站從 v20 bundle 升到 3a-A bundle**：同一個 session seed 的比賽結果必須相同（玩家中途更新網頁也不會換一場比賽）→ Task 4 browser 對等測試。
5. **戰術書選了 Registry 標為 design 的選項**（例如透過舊存檔或手改 localStorage）：Resolver 必須拒絕並回退模板值，UI 不得顯示 → Task 8、Task 9 加測。

---

## 檔案結構（3a 新增與修改）

| 檔案 | 責任 | 在指紋清單 |
|---|---|---|
| Create `src/platform/contracts/matchRuleset.js` | `MatchRuleset.v1`：ruleset 表、模式→ruleset 解析、驗證 | 是 |
| Create `src/platform/contracts/matchSetup.js` | `MatchSetup.v1`：建立、驗證、正規化雜湊（純函式） | 否（資料形狀；語意在組裝器） |
| Create `src/battle/moba/matchAssembler.js` | `assembleMatch(setup, deps)`：唯一組裝器 | 是 |
| Create `src/platform/tactics/tacticPlan.js` | `TacticPlan.v2`、`TacticPlanBinding.v1`、驗證、legacy 轉換 | 否 |
| Create `src/platform/tactics/tacticTemplates.js` | 經典 m1～m8＋模板 v2（版本化數值） | 是 |
| Create `src/platform/tactics/tacticOverlays.js` | 由 `TacticVariant` 遷移的覆蓋層（版本化數值） | 是 |
| Create `src/battle/moba/tactics/tacticResolver.js` | binding／legacy → 引擎 knobs＋identity | 是 |
| Create `src/platform/tactics/capabilityRegistry.js` | 戰術維度 → 掛點、最低版本、gate、狀態 | 否（UI 與 gate 讀） |
| Create `src/platform/tactics/tacticIndicators.js` | 計畫輪廓、席位任務適性、配合度負擔、矛盾提示 | 否 |
| Create `src/screens/moba/tacticBook/*.jsx` | 戰術書 UI（快速／標準、模板列、確認頁） | 否 |
| Create `src/platform/tactics/aiCoach.js`（3a-B） | AI 教練 v1 | 是 |
| Modify `src/useLocalServer.js:147-313` | 改為建立 setup → `assembleMatch` | 否（不在清單） |
| Modify `src/platform/challenge/challengeRunner.js:125-194` | 改用 setup＋`assembleMatch` | 是（既有） |
| Modify `tools/balance/moba_items_balance_runner.mjs:116-157` | `configure()` 改用 `assembleMatch`（tool ruleset） | 否 |
| Modify `src/platform/mastery/tacticVariant.js` | 變體資料改由覆蓋層提供；保留舊 API 給熟練度 | 否 |
| Modify `src/screens/moba/TacticScreen.jsx` | 改為戰術書容器 | 否 |
| Modify `src/platform/profileStore.js`、`src/platform/persistence/saveBundle.js` | `tacticBook` 切片（雲端）、`activeMatch.config.tacticPlanBinding` | 否 |
| Modify `src/platform/contracts/simulationVersion.js` | 新增語意檔；T3 升 `moba-sim.v21`（未發布候選）；3a 期間只重登 v21；v1～v20 指紋不動 | — |
| Modify `tools/verify.mjs` | 新增 gate 區段 | — |
| Create `tools/fixtures/match_golden_v20.json` | v20 黃金雜湊（Task 0 產生後入版控） | — |

---

## 任務依賴

```
T0 黃金基準 ─┬─► T1 Ruleset ─► T2 MatchSetup ─► T3 組裝器 ─┬─► T4 Live 遷移 ─┐
             │                                               ├─► T5 Challenge 遷移 ─┼─► T7 跨模式 gate＋指紋重登記（3a-A 架構完成）
             │                                               └─► T6 balance runner ─┘
             └─► T8 TacticPlan＋模板／覆蓋層 ─► T9 Resolver（等價）─► T10 Registry＋真實性 gate
                                                       │
                                     T11 指標 ◄────────┘
                       T12 存檔與熟練度銜接（依賴 T4、T9）
                       T13 戰術書 UI（依賴 T10、T11、T12）─► T14 3a-A 全套驗收＋（Owner 指示時）發布
T15 AI 教練 v1 ─┐
T16 challenge.v21 ruleset ─┴─► T17 v21 平衡掃描＋全套驗收（3a-B）
```
T4～T6 可平行（不同檔案），但驗證**依序**跑（記憶體）。T8 可與 T1～T7 平行開發。

---

### Task 0：擷取 v20 黃金基準（G-A0）

**目的**：在任何重構之前，用**現行 v20 程式碼**記錄三條組裝路徑的結果雜湊，作為之後所有對等 gate 的唯一基準。

**Files:**
- Create: `tools/lib/matchGolden.mjs`（共用：狀態雜湊、固定情境清單）
- Create: `tools/capture_match_golden_v20.mjs`（只在 v20 程式碼上跑一次）
- Create: `tools/fixtures/match_golden_v20.json`

**Interfaces:**
- Produces: `GOLDEN_CASES`（情境清單）、`runToEnd(engine, {dt, maxT})`、`engineStreamHash(engine, everyTicks=20)`、`finalDigest(engine)`；fixture JSON `{ simVersion, fingerprint, cases: [{ id, path, seed, digest, streamHash }] }`

- [ ] **Step 1：寫共用庫**

```js
// tools/lib/matchGolden.mjs
export const fnv = (s, h = 0x811c9dc5) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
export function runAndHash(engine, { dt = 0.5, maxT = 3600, every = 20 } = {}) {
  let h = 0x811c9dc5, n = 0;
  while (!engine.over && engine.t < maxT) {
    engine.tick(dt); n++;
    if (n % every === 0) h = fnv(JSON.stringify(engine.players.map((p) => [Math.round(p.pos.x * 1000), Math.round(p.pos.y * 1000), Math.round(p.hp), p.k, p.d])), h);
  }
  return { streamHash: h.toString(16), digest: `${engine.t.toFixed(1)}:${engine.winner}:${engine.bK}:${engine.rK}:${Math.round(engine.bGold)}:${Math.round(engine.rGold)}` };
}
//  情境：Live 等價（career.v20：有／無天賦選擇、有／無出裝、藍方有選手素質）、
//        Challenge（有／無 draft、雙方素質、各種模板）、balance runner（off／standard／策略、skills on/off）。
export const GOLDEN_CASES = [
  ...[3, 7, 11, 19, 23, 29].flatMap((seed) => [
    { id: `live-m${seed % 8 + 1}-${seed}`, path: "live", seed, tacticId: `m${seed % 8 + 1}`, talents: seed % 2 === 0, buildStrategy: seed % 3 === 0 ? "aggressive" : "standard" },
    { id: `challenge-draft-${seed}`, path: "challenge", seed, draft: true, tacticIds: [`m${seed % 8 + 1}`, `m${(seed + 3) % 8 + 1}`] },
    { id: `challenge-nodraft-${seed}`, path: "challenge", seed, draft: false, tacticIds: ["m4", "m7"] },
    { id: `runner-standard-${seed}`, path: "runner", seed, config: "standard", skills: true, talents: true },
    { id: `runner-off-${seed}`, path: "runner", seed, config: "off", skills: false, talents: false },
  ]),
];
```

- [ ] **Step 2：寫擷取腳本**。Live 路徑用「v20 `useLocalServer.start()` 的組裝順序」在 Node 重現（逐行對照 `src/useLocalServer.js:165-295`，store 讀值改成固定 fixture：`tools/fixtures/` 既有的選手名單或 `playerModel` 產生的 5 名固定選手、`lineup` b1–b5、`loadout` 取 `heroProgress` 預設）；Challenge 路徑直接呼叫現行 `runChallenge`（以 `tools/check_player_challenge_slice5.mjs` 的快照建構方式產生兩份快照）；runner 路徑呼叫現行 `configure()`。

- [ ] **Step 3：執行並存檔**

Run（scratchpad log）：`node tools/capture_match_golden_v20.mjs > <scratchpad>/golden.log 2>&1`
Expected：`tools/fixtures/match_golden_v20.json` 含 30 筆、`simVersion: "moba-sim.v20"`、`fingerprint: "050b3f66620f0f57"`；同一指令連跑兩次輸出逐字相同。

- [ ] **Step 4：Commit**

```bash
git add tools/lib/matchGolden.mjs tools/capture_match_golden_v20.mjs tools/fixtures/match_golden_v20.json
git commit -m "Phase 3a T0: capture v20 golden digests for live, challenge and balance-runner assembly"
```

**風險**：Live 的 Node 重現若與真實 hook 有差，基準就不可信 ⇒ Task 4 另有瀏覽器對等測試補強（真實 Live 與 Node 結果比對）。

---

### Task 1：`MatchRuleset.v1`（含 RS-1）

**Files:**
- Create: `src/platform/contracts/matchRuleset.js`
- Test: `tools/check_match_ruleset_3a.mjs`

**Interfaces:**
- Produces:
  - `MATCH_RULESET_VERSION = "MatchRuleset.v1"`
  - `MATCH_RULESETS`（frozen）：`career.v20`、`challenge.v20`、`balanceTool.v20`
  - `resolveRulesetForMode({ mode, flags }) → Ruleset`（mode ∈ `career|general|practice|challenge|spectate`；`flags` 由呼叫端傳入 `FEATURE_FLAGS` 的快照，**本檔不 import featureFlags**，方便測試）
  - `validateRuleset(r) → { ok, errors }`
  - `PRODUCTION_FORBIDDEN_KEYS = ["ruleOverrides", "incomeK", "itemsStrategies", "forcedLayout"]`

- [ ] **Step 1：寫失敗測試**

```js
// tools/check_match_ruleset_3a.mjs
import { MATCH_RULESETS, resolveRulesetForMode, validateRuleset } from "../src/platform/contracts/matchRuleset.js";
import { FEATURE_FLAGS } from "../src/featureFlags.js";
let pass = 0, fail = 0; const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
for (const r of Object.values(MATCH_RULESETS)) ck(`R1 ${r.rulesetId} 通過驗證`, validateRuleset(r).ok, validateRuleset(r).errors.join(";"));
const career = resolveRulesetForMode({ mode: "career", flags: FEATURE_FLAGS });
ck("R2 career 對應 career.v20", career.rulesetId === "career.v20");
ck("R3 challenge 不開裝備（Competitive／Challenge 邊界）", resolveRulesetForMode({ mode: "challenge", flags: FEATURE_FLAGS }).layers.items === false);
ck("R4 challenge.v20 重現現況：無技能、STANDARD、雙方素質", (() => { const c = MATCH_RULESETS["challenge.v20"].layers; return !c.heroSkills && c.objectiveLayout === "standard" && c.playerStatSides === "both"; })());
//  RS-1：正式 ruleset 開的功能，其依賴旗標在正式設定必須為 true；不得引用 DEV 旗標
for (const r of Object.values(MATCH_RULESETS).filter((x) => x.kind === "production"))
  ck(`RS-1 ${r.rulesetId} 只依賴已上線旗標`, r.releaseRequirements.every((f) => FEATURE_FLAGS[f] === true && !/dev/i.test(f)), r.releaseRequirements.join(","));
const off = resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, itemsV1: false } });
ck("R5 旗標關閉 ⇒ 該層關閉（不強制開啟）", off.layers.items === false);
ck("R6 ruleset 物件凍結", Object.isFrozen(career) && Object.isFrozen(career.layers));
console.log(`\nMatch Ruleset 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
```

- [ ] **Step 2：執行確認失敗**：`node tools/check_match_ruleset_3a.mjs` → Expected：`Cannot find module .../matchRuleset.js`

- [ ] **Step 3：實作**

```js
// src/platform/contracts/matchRuleset.js
export const MATCH_RULESET_VERSION = "MatchRuleset.v1";
export const PRODUCTION_FORBIDDEN_KEYS = Object.freeze(["ruleOverrides", "incomeK", "itemsStrategies", "forcedLayout"]);
const R = (o) => Object.freeze({ version: MATCH_RULESET_VERSION, ...o, layers: Object.freeze({ ...o.layers }), releaseRequirements: Object.freeze([...(o.releaseRequirements ?? [])]) });
export const MATCH_RULESETS = Object.freeze({
  "career.v20": R({ rulesetId: "career.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", redTactic: "styleTemplate" },
    releaseRequirements: ["heroSkillsV1", "heroBattleTalentsV1", "itemsV1"] }),
  "challenge.v20": R({ rulesetId: "challenge.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false, tacticIdentity: true, playerStatSides: "both", objectiveLayout: "standard", redTactic: "snapshot" },
    releaseRequirements: [] }),
  "balanceTool.v20": R({ rulesetId: "balanceTool.v20", kind: "tool", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "none", objectiveLayout: "bySeed", redTactic: "std" },
    releaseRequirements: [] }),
});
export const rulesetById = (id) => MATCH_RULESETS[id] ?? null;
//  旗標關閉 ⇒ 對應層關閉（永不強制開啟）。
export function resolveRulesetForMode({ mode, flags }) {
  const base = mode === "challenge" ? MATCH_RULESETS["challenge.v20"] : MATCH_RULESETS["career.v20"];
  if (base.rulesetId !== "career.v20") return base;
  const on = (f) => flags?.[f] === true;
  const skills = on("heroSkillsV1");
  return R({ ...base, layers: { ...base.layers, heroSkills: skills, heroPassives: skills, heroPowerCurve: skills,
    battleTalents: skills && on("heroBattleTalentsV1"), items: on("itemsV1") } });
}
export function validateRuleset(r) {
  const errors = [];
  if (!r || r.version !== MATCH_RULESET_VERSION) errors.push("version");
  if (!["production", "tool"].includes(r?.kind)) errors.push("kind");
  if (!["blue", "both", "none"].includes(r?.layers?.playerStatSides)) errors.push("playerStatSides");
  if (!["bySeed", "standard", "explicit"].includes(r?.layers?.objectiveLayout)) errors.push("objectiveLayout");
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4：執行確認通過**：`node tools/check_match_ruleset_3a.mjs` → Expected：`Match Ruleset 3a：10/10 PASS`（R1×3 個 ruleset、R2、R3、R4、RS-1×2 個 production ruleset、R5、R6）

- [ ] **Step 5：Commit**：`git add src/platform/contracts/matchRuleset.js tools/check_match_ruleset_3a.mjs` → `git commit -m "Phase 3a T1: explicit MatchRuleset.v1 with production/tool separation (RS-1)"`

**風險**：`career.v20` 的層與現行 Live 的旗標判斷若有一處不同（例如 DEV 網址參數），Task 4 的對等 gate 會抓到。DEV 參數（`?heroSkillsDev=1`、`?itemsDev=1`）改由呼叫端在 DEV build 自行組 `tool` ruleset，**不進**正式 ruleset。

---

### Task 2：`MatchSetup.v1`

**Files:**
- Create: `src/platform/contracts/matchSetup.js`
- Test: `tools/check_match_setup_contract_3a.mjs`

**Interfaces:**
- Consumes: `rulesetById`、`PRODUCTION_FORBIDDEN_KEYS`（Task 1）；`stableStringify`（`src/platform/contracts/squadSnapshot.js:147`）
- Produces:
  - `MATCH_SETUP_VERSION = "MatchSetup.v1"`
  - `createMatchSetup(input) → { ok, setup, errors }`
  - `matchSetupHash(setup) → string`（`stableStringify` 後 FNV-1a 64 位十六進位，與既有快照雜湊同一工具）
  - Setup 形狀：
    ```
    { schema, rulesetId, ruleset, seed, seedSource: "session"|"local"|"challenge"|"tool",
      objectiveLayout: "STANDARD"|"SWAPPED"|null, loadout|null,
      playerSlots: { blue: [], red: [] } | null, roster|null, talentSelections|null,
      buildStrategy|null, tactic: { blue: TacticInput|null, red: TacticInput|null },
      tool?: { ruleOverrides, incomeK, itemsStrategies, forcedLayout },
      meta: { sessionId, mode, opponentId } }
    TacticInput = { kind: "binding", binding } | { kind: "legacy", config } | { kind: "std" }
    ```

- [ ] **Step 1：寫失敗測試**（重點案例）

```js
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
// S1 合法 career setup 建立成功、ruleset 凍結進 setup
// S2 production ruleset 帶 tool 欄位（incomeK）⇒ 拒絕（code: "tool_field_in_production"）
// S3 鍵順序不同的同一輸入 ⇒ 雜湊相同；改任一欄 ⇒ 雜湊不同
// S4 objectiveLayout：ruleset=bySeed 且未給 ⇒ 由 seed 推導（同 resolveObjectiveLayout）；standard ⇒ "STANDARD"
// S5 tactic legacy 輸入原樣保存（含變體數值），雜湊涵蓋之
// S6 setup 物件深度凍結（呼叫端無法事後竄改）
```
（每案例以 `ck()` 斷言，寫法同 Task 1。）

- [ ] **Step 2：確認失敗** → `Cannot find module`
- [ ] **Step 3：實作**：純函式；`objectiveLayout` 用既有 `resolveObjectiveLayout({ explicit, seed })`（`src/platform/contracts/objectiveLayout.js`）；`ruleset.layers.objectiveLayout === "standard"` 時固定 `"STANDARD"`；深度凍結；production ruleset 遇 `tool` 欄位回錯誤。
- [ ] **Step 4：確認通過** → `Match Setup 契約 3a：N/N PASS`
- [ ] **Step 5：Commit** → `"Phase 3a T2: MatchSetup.v1 contract with normalized inputs hash"`

**風險**：雜湊涵蓋 `loadout`（英雄熟練）——它會隨生涯成長，屬正確行為（不同輸入）；但不得涵蓋呈現層欄位（`playbackRate`、`quality`、debug 旗標）。

---

### Task 3：唯一組裝器 `assembleMatch`

**Files:**
- Create: `src/battle/moba/matchAssembler.js`
- Modify: `src/platform/contracts/simulationVersion.js`（`SIMULATION_SEMANTICS_FILES` 加入 `matchRuleset.js`、`matchAssembler.js`）
- Test: `tools/check_match_assembler_3a.mjs`

**Interfaces:**
- Consumes: Task 1、Task 2；既有 `toEnginePlayerMods`、`toEngineHeroMods`、`toEngineHeroSkills`、`toEngineHeroPassives`、`toEngineHeroPowerCurve`、`selectBattleTalents`、`toEngineArchetypes`、`toEngineSpells`、`toEngineTactic`、`toEngineTacticIdentity`、`matchItemsConfig`、`toEngineItems`
- Produces: `assembleMatch(setup, { LogicEngine, heroLookup }) → { ok, engine, applied: { objectiveLayout, talentSelection, buildStrategy, tacticMeta, replayConfig } , errors }`

**組裝順序（＝現行 Live `useLocalServer.js:167-295`，不得調換）**
1. `new LogicEngine(seed, loadout)`；`tool.ruleOverrides`（僅 tool）
2. `configureObjectiveLayout`（依 setup.objectiveLayout；`challenge.v20` 的 standard 時**不呼叫**，與 v20 Challenge 相同——由 Task 0 黃金基準確認呼叫與不呼叫是否等價，不等價就照 v20 行為不呼叫）
3. `configurePlayers`（依 `playerStatSides`；`blue` 時 red 傳 `[]`）
4. `configureHeroes`（有 roster 才呼叫）
5. 技能層：`heroSkills` 開且有 roster ⇒ `configureHeroSkills`（天賦由 `battleTalents` 決定）→ `configureHeroPassives` → `configureHeroPowerCurve`
6. `configureArchetypes`
7. `configureSpells`
8. `configureMatch`（戰術：Task 3 先只接受 `legacy`／`std`；`binding` 在 Task 9 接上 Resolver）
9. `configureItems`（`items` 開：production 用 `matchItemsConfig`，tool 用 `toEngineItems`＋`itemsStrategies`）；`tool.incomeK`

> ⚠ Challenge v20 的實際順序是 players → match → heroes → archetypes → spells（`challengeRunner.js:136-189`），與 Live 不同。**以 Task 0 的 challenge 黃金基準為準**：若「改成 Live 順序」使雜湊不同，`challenge.v20` 必須保留 v20 順序（組裝器以 ruleset 的 `order: "live" | "challengeV20"` 區分），到 `challenge.v21` 才統一為 Live 順序。

- [ ] **Step 1：寫失敗測試**：對 `GOLDEN_CASES` 中 `path: "live"` 的每一筆，用 `createMatchSetup`（career.v20）建 setup → `assembleMatch` → `runAndHash`，比對 `tools/fixtures/match_golden_v20.json` 的 `digest` 與 `streamHash`。
- [ ] **Step 2：確認失敗** → `Cannot find module .../matchAssembler.js`
- [ ] **Step 3：實作**（依上列順序；每一步保留現行程式的 null／空值短路，例如 `heroMods` 為 null 就不呼叫）
- [ ] **Step 4：確認通過**：`node tools/check_match_assembler_3a.mjs` → Expected：live 6 筆逐位元相同
- [ ] **Step 5：同一支測試加入 challenge（12 筆）與 runner（12 筆）**，用對應 ruleset；全部相同後 Commit → `"Phase 3a T3: single match assembler reproducing v20 live/challenge/runner order"`

**風險**：最大風險在順序與短路條件。對策：每一層的呼叫條件逐條對照原始碼行號寫在組裝器註解中；黃金基準 30 筆涵蓋有／無天賦、有／無 draft、有／無出裝、skills on/off。

---

### Task 4：Live 改用組裝器

**Files:**
- Modify: `src/useLocalServer.js:147-313`
- Create: `src/battle/moba/liveMatchSetup.js`（從 store 狀態建立 setup：`buildLiveMatchSetup({ opts, profile, heroProgress, flags })`，純函式）
- Test: `tools/check_live_setup_3a.mjs`；`tools/browser_check_live_assembly_parity_3a.mjs`

**Interfaces:**
- Consumes: Task 1～3
- Produces: `buildLiveMatchSetup(...) → setup`；`useLocalServer.start()` 改為：建 setup → `assembleMatch(setup, { LogicEngine, heroLookup: heroById })` → `beginReplayCapture`（取 `applied.replayConfig`）→ `enableCombatDebug`（呈現層，留在 hook）→ 其餘不變；`activeMatchRef.current.config` 增加 `matchSetupHash`
- 恢復路徑（`resumeTimeSec`）沿用同一個 setup（存檔中的 `objectiveLayout`、legacy `tactic`）

- [ ] **Step 1：寫失敗測試**（Node）：以 Task 0 的 live 情境輸入呼叫 `buildLiveMatchSetup` → 雜湊與 golden 情境一致；舊存檔樣本（`activeMatch.config.tactic` 為變體套用後的 v1 物件、`objectiveLayout: "SWAPPED"`、`resumeTimeSec: 300`）建出的 setup 為 `legacy` 戰術輸入、layout 保留。
- [ ] **Step 2：確認失敗**
- [ ] **Step 3：實作**；`useLocalServer` 中所有 `featureEnabled(...)` 讀取移到 `resolveRulesetForMode`（場次建立當下一次）；DEV 網址參數只在 `import.meta.env.DEV` 時改用 tool ruleset。
- [ ] **Step 4：確認 Node 測試通過**
- [ ] **Step 5：瀏覽器對等**：本地 dev server、`?debug=moba-runtime-battle&shot=hud&waitTs=120`、固定 seed；debug-only 掛點 `window.__ESMO_MATCH_SETUP_HASH`、`window.__ESMO_ENGINE_STREAM_HASH(t)`（只在 `?shot=` 時掛，與既有 `__ESMO_COMBAT_FEEDBACK` 同模式）；比對 Node 以同 setup 跑到同 ts 的雜湊 ⇒ 相同。
  Run：`node tools/browser/run-gate.mjs tools/browser_check_live_assembly_parity_3a.mjs --timeout 900000`（一次一支）
- [ ] **Step 6：既有回歸**（依序）：`npm run build`；`node tools/regress.mjs`；`node tools/regress2.mjs`；`browser_check_moba_gameplay_presentation`；`browser_check_moba_combat_feedback`
- [ ] **Step 7：Commit** → `"Phase 3a T4: live battle builds MatchSetup and uses the single assembler (bit-identical to v20)"`

**風險**：(a) 存檔恢復；(b) 正式站中途更新 bundle 時同一 session 結果不同 → Review Focus 4，由瀏覽器對等與舊存檔樣本雙重驗證；(c) `heroDatabase` 只在 hook 注入，不進組裝器。

---

### Task 5：Challenge 改用組裝器（`challenge.v20`，逐位元相同）

**Files:**
- Modify: `src/platform/challenge/challengeRunner.js:125-194`
- Test: 擴充 `tools/check_match_assembler_3a.mjs`；既有 `check_player_challenge_slice1`～`slice8`

**Interfaces:**
- Consumes: Task 1～3；`snapshotCovers`、`SNAPSHOT_INPUTS`（既有）
- Produces: `runChallenge` 對外簽名與回傳形狀**完全不變**；內部改為 `createMatchSetup({ rulesetId: "challenge.v20", ... })` → `assembleMatch`
- **只組快照宣告的層**：`useLoadout`／`useStats`／`useTactic`／`draftDeclared` 的判斷原樣保留，未宣告的層在 setup 中為 null（Review Focus 2）

- [ ] **Step 1：寫失敗測試**：`challenge-nodraft-*` 情境確認英雄層未組（`engine.heroMods` 為空）且雜湊＝golden
- [ ] **Step 2～4：實作、通過**（12 筆 challenge golden 全相同）
- [ ] **Step 5：既有挑戰 gate**（依序，各支單跑）：`check_player_challenge_slice1`（108）～`slice8`（121）；slice3 §③ 為已登記 flaky，不放寬
- [ ] **Step 6：Commit** → `"Phase 3a T5: challenge runner uses the single assembler under challenge.v20 (bit-identical)"`

**風險**：`challengeRunner.js` 在指紋清單內 ⇒ 指紋改變，於 Task 7 重新登記 **v21 候選**指紋（v20 不動）。

---

### Task 6：balance runner 改用組裝器

**Files:**
- Modify: `tools/balance/moba_items_balance_runner.mjs:116-157`
- Test: Task 3 的 runner golden；既有 `check_moba_items_m2`（G1 legacy 指紋）、`check_moba_tactic24`、`check_tactical_identity_v17`

**Interfaces:**
- `configure(seed, config, M, incomeK, rosterOverride)` 簽名與回傳 `{ e, ... }` 不變；內部建 `balanceTool.v20` setup（`tool.ruleOverrides` ← `RULE_OVERRIDES`、`tool.incomeK`、`tool.itemsStrategies`、`tool.forcedLayout` ← `ESMO_BALANCE_LAYOUT`）

- [ ] **Step 1～4**：runner golden 12 筆相同
- [ ] **Step 5：既有 gate**（依序）：`check_moba_items_m2`（53/53）、`check_moba_tactic24`（29）、`check_tactical_identity_v17`（22/22）、`check_moba_tactical_ai_p2`（33/33）
- [ ] **Step 6：Commit** → `"Phase 3a T6: balance runner configure() goes through the single assembler (tool ruleset)"`

---

### Task 7：跨模式一致 gate＋正式組裝掃描＋v21 候選指紋登記（3a-A 架構完成點）

**Files:**
- Create: `tools/check_match_setup_3a.mjs`（G-A1、G-A2、RS-1、正式組裝掃描）
- Modify: `src/platform/contracts/simulationVersion.js`（`"moba-sim.v21"` 未發布候選指紋登記，註解寫明「Live／Challenge／runner 結果與 v20 黃金基準逐位元相同」與 gate 結果；**v20 指紋不動**）
- Modify: `tools/verify.mjs`（新增區段 `match_setup_3a`）

- [ ] **Step 1：G-A1**：同一份 setup（每個 ruleset 各 6 seeds）分別經「Live 組裝函式（Node）」「Challenge 包裝」「runner 包裝」——凡 ruleset 相同者結果雜湊相同
- [ ] **Step 2：G-A2**：30 筆 golden 全部逐位元相同
- [ ] **Step 3：正式組裝掃描**（先剝註解再掃，避免掃到自己註解——專案既有教訓）：`src/**`（排除 `src/debug/**`、`src/App.jsx` 開機快照、`src/useGameStore.js` 開機快照）中出現 `.configureMatch(`／`.configureHeroes(` 的檔案只能是 `src/battle/moba/matchAssembler.js`
- [ ] **Step 4：指紋**：`node tools/check_simulation_version_gate.mjs --print` 取新指紋 → 以 `moba-sim.v21`（未發布候選）登記 → `check_simulation_version_gate` 全綠（v1～v19 指紋不變）
- [ ] **Step 5：Commit** → `"Phase 3a T7: cross-mode consistency gate; re-register moba-sim.v20 fingerprint (no semantic change, golden 30/30)"`

---

### Task 8：`TacticPlan.v2`、模板與覆蓋層資料

**Files:**
- Create: `src/platform/tactics/tacticPlan.js`、`src/platform/tactics/tacticTemplates.js`、`src/platform/tactics/tacticOverlays.js`
- Modify: `src/platform/mastery/tacticVariant.js`（`TACTIC_VARIANTS` 改為從 `tacticOverlays.js` 讀；`applyVariant` 保留簽名、內部改走覆蓋層；過時的 `FORBIDDEN_VARIANT_FIELDS` 改由 Registry 推導，舊常數保留匯出為唯讀相容）
- Test: `tools/check_tactic_plan_3a.mjs`

**Interfaces:**
- Produces:
  - `TACTIC_PLAN_VERSION = "TacticPlan.v2"`、`TACTIC_PLAN_BINDING_VERSION = "TacticPlanBinding.v1"`
  - `createTacticPlan({ templateId, overlayIds, choices }) → { ok, plan, errors }`（choices 只接受 Registry live 的鍵與列舉值）
  - `bindTacticPlan(plan, { resolverVersion, templatesVersion, overlaysVersion }) → binding`（含 `planHash`、`legacyTacticId`＝模板對應的經典 id，供熟練度計數）
  - `planFromLegacyTacticId(tacticId) → plan`（Challenge 歷史與熟練度）
  - `TACTIC_TEMPLATES`：`classic.m1`～`classic.m8`（數值逐欄取自現行 `MOBA_TACTICS`，**由程式從 `MobaTacticConfig.js` 匯入建立，不手抄**）、`std`、模板 v2（9～12 個，見 Step 3）
  - `TACTIC_OVERLAYS`：現行三個變體逐欄遷移（id 不變）

- [ ] **Step 1：寫失敗測試**：
  - P1 經典模板 `classic.mN` 展開後與 `mobaTacticById("mN")` 逐欄相同
  - P2 覆蓋層套在經典模板上 ≡ 現行 `applyVariant(mobaTacticById(base), variant)` 逐欄相同
  - P3 `createTacticPlan` 拒絕 Registry design 狀態的鍵（例：`teamfight.style`）與未知列舉值（Review Focus 5）
  - P4 plan 物件中不存在任何 number（遞迴掃描）
  - P5 同一 plan 不同鍵序 ⇒ `planHash` 相同
- [ ] **Step 2～4：實作、通過**
- [ ] **Step 3 附：模板 v2 定義**（每個模板只能用 3a live 的選擇；每個附 `category`、`name`、`desc`、`cons`，文案繁中）：
  前期節奏：三路壓制、野區入侵、下路雙人壓制；中期控圖：中野聯動、輔助遊走控河道、龍坑運營；分推牽制：上路單帶（四一分推）、中路單帶；團戰決勝：抱團強開、保核心拖後期；穩健運營：標準運營、劣勢穩守
- [ ] **Step 5：Commit** → `"Phase 3a T8: TacticPlan.v2 (choices only), classic/v2 templates and overlays migrated from variants"`

**風險**：模板 v2 會產生「現有八套沒有的 knob 組合」，屬新的輸入、不是語意變化；其效果由 Task 10 的真實性 gate 驗證。

---

### Task 9：`tacticResolver`（等價）＋組裝器接上 binding

**Files:**
- Create: `src/battle/moba/tactics/tacticResolver.js`
- Modify: `src/battle/moba/matchAssembler.js`（`TacticInput.kind === "binding"` 走 Resolver）
- Modify: `src/platform/contracts/simulationVersion.js`（語意清單加入 `tacticResolver.js`、`tacticTemplates.js`、`tacticOverlays.js`）
- Test: `tools/check_tactic_resolver_3a.mjs`（G-A3）

**Interfaces:**
- Produces: `TACTIC_RESOLVER_VERSION = "tacticResolver.v1"`；`resolveTactic(input) → { knobs, identity, meta: { tacticId, tacticName, playbookName, version } }`
  - `input.kind === "legacy"` ⇒ `toEngineTactic(config)`／`toEngineTacticIdentity(config)` 原樣
  - `input.kind === "binding"` ⇒ 模板數值 → 覆蓋層 → 選擇對照表 → 同一對投影
  - `input.kind === "std"` ⇒ `STANDARD_OPP_TACTIC` 的投影

- [ ] **Step 1：寫失敗測試**（G-A3）：8 經典模板 × {無覆蓋層、各覆蓋層} 經 binding 解析 ≡ 現行兩個投影（逐欄 `JSON.stringify` 相等）；legacy 分支與 std 分支同理；未知 resolverVersion ⇒ 拒絕
- [ ] **Step 2～4：實作、通過**
- [ ] **Step 5：對等再確認**：`check_match_assembler_3a` 30/30（Live golden 情境改以 binding 輸入亦相同）、`check_match_setup_3a` 全綠
- [ ] **Step 6：Commit** → `"Phase 3a T9: tacticResolver.v1 equivalent to v20 projections; assembler accepts plan bindings"`

---

### Task 10：Capability Registry＋真實性 gate（G-A5、G-A7）

**Files:**
- Create: `src/platform/tactics/capabilityRegistry.js`
- Create: `tools/check_tactic_registry_3a.mjs`（G-A5，秒級）
- Create: `tools/check_tactic_truth_3a.mjs`（G-A7，長，分批）
- Modify: `tools/verify.mjs`（`tactic_registry_3a`、`tactic_truth_3a` 區段）

**Interfaces:**
- Produces: `CAPABILITIES`（每列 `{ dimension, choices, resolverFields, engineReads, minSimVersion, gate, status }`）；`liveCapabilities(simVersion) → []`；`isLiveChoice(path, value, simVersion) → bool`
- 3a live 維度：時期（early/mid/late stance）、打野節奏（tempo）、三路姿態、帶線（單一路）、打野重心、輔助任務、核心是誰、物件排序、入侵、團戰姿態、風險、集結。**design 狀態**：兵線、包夾、資源交換、團戰風格／開團手／目標、主 Call、條件、多路帶線、預示者、視野。

- [ ] **Step 1：G-A5 測試**：每個 live 列的 `resolverFields` 確實出現在 Resolver 輸出；`engineReads` 中每個 knob／identity 欄位在 `LogicEngine.js`（剝註解後）被讀取；UI 匯出的可選清單（Task 13 的 `tacticBookOptions()`）＝`liveCapabilities` 展開
- [ ] **Step 2：G-A7 測試**：每個 live 選項，以 `std` 為基準、只改該選項，固定 seeds 1–40、balance runner（skills on），量測該選項宣稱的事件（對照表寫在 Registry 的 `gate.metric`：帶線→`splitPushActions`、入侵→`invadeAttempts`、打野抓人／發育→`topGanks+midGanks+botGanks`、物件排序→`dragonContests`／`baronContests`、輔助遊走→`supportRoams`、團戰姿態→`groupedFights`、風險→撤退次數…）⇒ 方向正確且配對 z ≥ 2
  - 量測不到的選項：**從 live 移回 design**（不放大係數），並在 Registry 註明原因
- [ ] **Step 3：執行**：`node tools/verify.mjs --only=tactic_truth_3a`（背景、可續跑；預估 40 seeds × ~25 選項 × 2 ≈ 2000 場，分 8 批）
- [ ] **Step 4：Commit** → `"Phase 3a T10: capability registry and truth gate (every live option has a measured engine effect)"`

**風險**：部分選項在 40 seeds 下量不出（C2 前例）——對策是移回 design，不是加大樣本硬過；若 Owner 要保留，另以 n≥400 新 seeds 證明。

---

### Task 11：戰術指標

**Files:**
- Create: `src/platform/tactics/tacticIndicators.js`
- Test: `tools/check_tactic_indicators_3a.mjs`

**Interfaces:**
- Produces:
  - `planProfile(binding) → { early, midControl, lateTeamfight, objectives, splitPressure, risk }`（0–1，「傾向」）
  - `seatMissionFit({ binding, seatPlayers, heroLookup }) → { [seat]: { mission, grade: "A"|"B"|"C"|"D", strongest, weakest } }`——係數**從 `mobaPlayerStats.js` 的作用點表匯入**，不另寫權重；英雄面用 `getHeroCombatArchetype().movementProfile`
  - `coordinationLoad(binding, seatPlayers) → { load, capacity }`（capacity 由 synergy＋comms 推導；3a 只顯示，引擎效果在 3b）
  - `contradictions(binding) → [{ id, text }]`（規則表；每條需在 Task 10 的資料中有對應現象，否則不收錄）
- [ ] **Step 1：測試**：經典模板雷達形狀符合文案（m7 前期最高、m8 後期最高、m2 分推最高…）；適性對素質單調（提高帶線相關素質 ⇒ 等級不降）；換人後適性重算、plan 不變（Review Focus 3）
- [ ] **Step 2～4：實作、通過**
- [ ] **Step 5：Commit** → `"Phase 3a T11: plan profile, seat mission fit from player stats, coordination load and contradictions"`

---

### Task 12：存檔、場次設定與熟練度銜接

**Files:**
- Modify: `src/platform/profileStore.js`（新切片 `tacticBook: { plans: TacticPlan.v2[≤5] }`、`saveTacticPlan`／`deleteTacticPlan` 公開動作自行存檔）
- Modify: `src/platform/persistence/saveBundle.js:52`（`CLOUD_PROFILE_KEYS` 加入 `tacticBook`）
- Modify: `src/useLocalServer.js`（`activeMatch.config.tacticPlanBinding`；舊欄 `tactic` 讀取保留為 legacy 恢復）
- Modify: `src/platform/progress/applyMatchProgress.js:311`（`tacticId` 改取 `binding.legacyTacticId`，形狀不變）
- Test: `tools/check_tactic_save_3a.mjs`；既有 `check_save_bundle_b1b`（86）、`check_save_hardening_b1c`（76）、`check_cloud_save_b1d`（109）、`browser_check_exit_flush`（12）

- [ ] **Step 1：測試**：舊存檔（無 `tacticBook`）載入 ⇒ 空清單、不報錯；存 6 份 ⇒ 拒絕第 6 份；戰術書寫入後直接讀磁碟一致（B1C 規則：公開動作必須自行存檔）；含 v1 `activeMatch.config.tactic` 的進行中場次可恢復且結果＝v20（Review Focus 1）；熟練度計數鍵不變
- [ ] **Step 2～4：實作、通過**；既有存檔 gate 依序全綠
- [ ] **Step 5：Commit** → `"Phase 3a T12: tacticBook cloud slice, plan binding in active match, legacy resume path, mastery keys unchanged"`

---

### Task 13：戰術書 UI（快速／標準）

**Files:**
- Create: `src/screens/moba/tacticBook/TacticBookScreen.jsx`（容器：步驟條 情報／戰術書／確認）
- Create: `src/screens/moba/tacticBook/TemplateStrip.jsx`、`ChoicePanel.jsx`、`IndicatorPanel.jsx`、`ConfirmPanel.jsx`、`tacticBookOptions.js`（由 Registry 產生選項）
- Modify: `src/screens/moba/TacticScreen.jsx`（改為掛載戰術書；保留出裝策略、天賦選擇、變體列）
- Test: `tools/browser_check_tactic_book_3a.mjs`（桌機 1366＋390）

**UI 規格**：
- 模板列：分類（前期／控圖／分推／團戰／穩健／經典）＋「我的戰術書」；點模板 ⇒ 帶入全部選擇
- 快速：勝利條件、強邊、物件排序（拖曳；手機另提供上下箭頭）
- 標準：時期、三路、打野、輔助、核心、團戰姿態、風險、集結（手機摺疊；桌機全展開）
- 右側／下方：計畫輪廓雷達、席位任務適性（5 人）、配合度負擔、矛盾提示（點開看說明）
- 確認頁：摘要＋指標＋對手模板名與雷達＋「存成我的戰術書」＋「確認上場」
- 所有可選項來自 `tacticBookOptions()`（＝Registry live），testid 一律 `tb-*`
- 專業模式按鈕顯示但停用，標「3b 開放」（不得出現可點但無效的選項）

- [ ] **Step 1：瀏覽器 gate**：模板帶入、每個 live 選項可點且送出的 binding 正確、design 選項不存在於 DOM、確認頁數值與 `planProfile`／`seatMissionFit` 一致、390 無橫向溢出、console／page error 0、從戰術書開打的比賽 `__ESMO_MATCH_SETUP_HASH` 與以同 binding 建立的 Node setup 相同
- [ ] **Step 2～4：實作、通過**（`npm run build` 後跑；瀏覽器 gate 一次一支）
- [ ] **Step 5：既有 UI gate**：`browser_check_moba_gameplay_presentation`、`browser_check_moba_combat_feedback`、`browser_check_challenge_manual_draft`（27）
- [ ] **Step 6：Commit** → `"Phase 3a T13: tactic book UI (quick/standard depth) driven by the capability registry"`

---

### Task 14：3a-A 全套驗收（與發布準備）

- [ ] `npm run build`；`node tools/regress.mjs`；`node tools/regress2.mjs`
- [ ] `node tools/verify.mjs --resume`（背景、分段；既有紅燈照 `CLAUDE.md` 清單判讀）
- [ ] 新 gate：`match_ruleset_3a`、`match_setup_3a`、`tactic_plan_3a`、`tactic_resolver_3a`、`tactic_registry_3a`、`tactic_truth_3a`、`tactic_indicators_3a`、`tactic_save_3a`
- [ ] MOBA 40 支 gate 批次＋Replay 相關 19 支（同 v20 驗收清單）：結果與 v20 相同
- [ ] CS 保護：`check_cs23`、`check_moba_runtime29`（走 verify）——CS 相關不得有新紅
- [ ] 瀏覽器：本計畫新增兩支＋既有 Combat Feedback／Gameplay Presentation／Challenge
- [ ] `docs/handoff/05_Sprint紀錄.md` 追加節；commit；**是否發布由 Owner 決定**（3a-A 發布後正式站行為逐位元不變，可用 v20 正式站 smoke 驗證）

---

### Task 15：AI 教練 v1（3a-B）

**Files:**
- Create: `src/platform/tactics/aiCoach.js`
- Modify: `src/battle/moba/liveMatchSetup.js`（`career.v21` 紅方戰術＝AI 教練產生的 binding）
- Modify: `src/platform/contracts/matchRuleset.js`（新增 `career.v21`：`redTactic: "aiCoachV1"`）
- Test: `tools/check_ai_coach_3a.mjs`

**Interfaces:**
- Produces: `aiCoachPlan({ team, roster, opponentHistory, seed, fixtureId }) → binding`——依 `team.style` 選模板類別，再依**自己選手的素質**決定席位任務（例：上路帶線相關素質最高者 ⇒ 帶線；輔助 mapAware／comms 高 ⇒ 遊走），全部用 Task 11 的 `seatMissionFit`；決定性
- [ ] 測試：同輸入同輸出；不同 style 產生不同類別；任務選擇符合素質排序；只使用 live 選項
- [ ] Commit → `"Phase 3a T15: AI coach v1 composes red-side plans from team style and own player stats"`

**注意**：紅方選手素質**仍不注入引擎**（3a 維持；注入屬 3b，見正式架構 §7），所以 AI 教練 v1 影響的是「計畫」，不是紅方個人執行。

---

### Task 16：`challenge.v21` ruleset（3a-B）

**Files:**
- Modify: `src/platform/contracts/matchRuleset.js`（新增 `challenge.v21`：heroSkills／passives／curve ON、battleTalents OFF、items OFF、layout bySeed、組裝順序＝Live）
- Modify: `src/platform/challenge/challengeRunner.js`（新挑戰用 `challenge.v21`；`challengeReplayability` 依版本拒絕 v20 以前）
- Modify: `src/platform/contracts/simulationVersion.js`（`moba-sim.v21`、新指紋、`KNOWN_SIMULATION_VERSIONS` 追加）
- Test: 擴充 `check_match_ruleset_3a`（RS-1 對 v21）；既有 challenge slice1～8 依新版本更新**版本事實**（不放寬判準）

- [ ] 測試：v20 挑戰被 `canReplay` 明確拒絕並附中文原因；v21 挑戰重算一致；Challenge 不開裝備
- [ ] Commit → `"Phase 3a T16: challenge.v21 ruleset (skills on, layout by seed, items off) and moba-sim.v21"`

---

### Task 17：v21 平衡掃描與全套驗收（3a-B）

- [ ] 主導計畫掃描：每個模板（經典＋v2）vs `std`、事前指定新 seeds、STANDARD／SWAPPED 各半、每組 ≥ 400 場、分批（≤ 250／批、≤ 3 workers）
- [ ] side bias：正式設定 n=1000 純藍方與巨龍側；Challenge 設定 n=1000（預期巨龍側問題因 bySeed 佈局而對稱化）
- [ ] 時長分布（20～40 分長期目標，記錄不強制）
- [ ] Task 14 全套 gate 重跑（版本事實更新為 v21）
- [ ] 05／08 紀錄；commit；發布由 Owner 決定（照 v19／v20 release 流程與正式站 smoke）

---

## 工作量預估

以「一個工作階段」＝約 3～4 小時有效開發＋該任務的驗證計算。長驗證在背景跑，不佔開發時間，但佔真實時間。

| 任務 | 開發 | 驗證（真實時間） | 備註 |
|---|---|---|---|
| T0 黃金基準 | 0.5 | 0.5 h | 之後所有對等的唯一依據 |
| T1 Ruleset | 0.5 | 秒級 | |
| T2 MatchSetup | 0.5 | 秒級 | |
| T3 組裝器 | 1 | 0.5 h | 順序與短路條件最易錯 |
| T4 Live 遷移 | 1 | 1.5 h | 含瀏覽器對等、既有瀏覽器 gate |
| T5 Challenge 遷移 | 0.5 | 1 h | slice1～8 |
| T6 runner 遷移 | 0.5 | 1 h | items_m2／tactic24／identity |
| T7 跨模式 gate＋指紋 | 0.5 | 0.5 h | **3a-A 架構完成點** |
| T8 Plan＋模板＋覆蓋層 | 1 | 秒級 | 模板 v2 文案 |
| T9 Resolver | 1 | 0.5 h | |
| T10 Registry＋真實性 | 1 | 3～4 h | 約 2000 場分 8 批 |
| T11 指標 | 1 | 秒級 | |
| T12 存檔 | 1 | 1 h | B1B／B1C／B1D |
| T13 UI | 2 | 1 h | 桌機＋390 |
| T14 3a-A 全套驗收 | 0.5 | 3～4 h | verify 全套＋瀏覽器 |
| **3a-A 小計** | **≈ 12.5 階段** | **≈ 15～18 h** | |
| T15 AI 教練 | 1 | 0.5 h | |
| T16 challenge.v21 | 1 | 1 h | |
| T17 平衡＋全套 | 0.5 | 6～8 h | 大樣本掃描 |
| **3a-B 小計** | **≈ 2.5 階段** | **≈ 8～10 h** | |
| **3a 合計** | **≈ 15 階段** | **≈ 23～28 h 驗證** | 不確定度約 ±30%，主要來自 T3／T4 對等除錯與 T10 量測不到的選項 |

## 本計畫刻意延後（不在 3a）
引擎決策點改讀 Director、席位任務的引擎執行、主 Call、包夾、資源交換、兵線、條件應變、配合度負擔的引擎效果、紅方素質注入、教練介入、CommandLog、賽後執行報告、專業模式（皆 3b）；Challenge 自訂計畫、預約介入、同步線上協議、T2 校準、多路帶線（皆 3c）；約 55 支工具腳本的組裝遷移（碰到再遷移）。
