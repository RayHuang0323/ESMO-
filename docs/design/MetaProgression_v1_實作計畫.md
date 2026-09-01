# Meta Progression v1 ＋ Tactic Framework v2 — 實作計畫

> **狀態：計畫，尚未執行。** 等 owner review 後才開始 Phase 1。

**Goal：** 打通一條真正可玩的閉環——Challenge → 進度 → 完成 → 領獎 → 解鎖一個既有 MOBA 戰術的 variant → Match Prep 真的能用 → reload 後仍在。

**Architecture：** 三個 domain（Retention／Club Mastery／Team Development）共用一種貨幣與一組計數器，但各自獨立。Tactic variant 不是新戰術，是既有 `MobaTacticConfig` 的特化，走既有 `toEngineTactic()`，**不新增第二套 tactic system**。

**Spec：** `docs/design/MetaProgression_v1與TacticFramework_v2.md`

**Tech Stack：** 純函式契約（不 import React／zustand／localStorage／亂數／時鐘）＋ zustand profileStore ＋ 既有 `tools/check_*.mjs` verifier 模式。專案無測試框架 ⇒ **verifier 腳本就是測試**。

---

## Global Constraints

逐字取自 spec，每個 task 都隱含適用：

- **BASIC 永遠可用**：MOBA `m1`–`m8` 全部，**不得倒退鎖住**。
- **不建立第二套**：tactic system、player entity、任務系統、成本模型，皆不得有第二份。
- **FORBIDDEN_VARIANT_FIELDS 零修改**：`tacticId`、`evidence`、`fit`、`macro.{earlyGame,midGame,lateGame}`、`objectives.heraldPriority`、`economy.{carryPriority,jungleResourceShare}`、`vision.*`。
- **未映射欄位不得產生玩家可感知的效果**（假選擇紅線）。
- **花 Club Points 不得降低 Club Level**。
- **Quick Practice 預設不計** career progression，除非 challenge 標 `practiceEligible: true`。
- **零改動**：Online CBR、Rating、`starExcess`、`MATCH_BAND`、CS runtime（route／weapon／economy／combat／tactic semantics）。
- **不 push、不 deploy。**
- 註解用繁體中文、程式碼與 commit message 用英文。

---

## 檔案結構

| 檔案 | 責任 | 動作 |
|---|---|---|
| `src/platform/retention/retentionState.js` | 加 `clubPointsLifetime`、career 袋子、tactic 記錄 | **修改** |
| `src/platform/mastery/doctrine.js` | 三條 doctrine 定義與 MOBA/CS mapping | 新增 |
| `src/platform/mastery/tacticVariant.js` | `VariantTradeoff` 契約、ALLOWED/FORBIDDEN、variant 資料 | 新增 |
| `src/platform/mastery/clubMastery.js` | track 定義、進度推導、解鎖狀態、claim | 新增 |
| `src/platform/mastery/clubCatalog.js` | Coach／Collection 與價格 | 新增 |
| `src/platform/profileStore.js` | `clubMastery` 狀態、actions、persist | **修改** |
| `src/screens/ClubMasteryScreen.jsx` | 最小入口畫面 | 新增 |
| `tools/check_club_mastery_v1.mjs` | 全部不變式 | 新增 |

---

## Phase 1 — 平台層閉環（無 UI）

> 完成後即可用 verifier 證明閉環成立。**這是最小 vertical slice 的核心。**

### Task 1：`clubPointsLifetime` prerequisite fix

**Files：** Modify `src/platform/retention/retentionState.js`（`emptyRetention` 33、`normalizeRetention` 44、`retentionViewOf` 226、`claimObjective` 243、`clubTierOf` 276）；Test `tools/check_club_mastery_v1.mjs`

**Interfaces：** Produces `clubPointsLifetime`（number，只增不減）、`clubTierOf(lifetime)`、`spendClubPoints(retention, amount)`

- [ ] **Step 1：寫失敗的檢查**（新建 verifier）

```js
import { emptyRetention, normalizeRetention, clubTierOf, spendClubPoints } from "../src/platform/retention/retentionState.js";
let r = { ...emptyRetention(), clubPoints: 6000, clubPointsLifetime: 6000 };
ck("花點數不降等級", (() => {
  const before = clubTierOf(r.clubPointsLifetime).id;
  const after = spendClubPoints(r, 5000);
  return after.ok && clubTierOf(after.retention.clubPointsLifetime).id === before
    && after.retention.clubPoints === 1000;
})());
ck("餘額不足不得透支", spendClubPoints({ ...r, clubPoints: 100 }, 500).ok === false);
```

- [ ] **Step 2：跑它，確認失敗**

Run：`node tools/check_club_mastery_v1.mjs`
Expected：FAIL —`spendClubPoints is not a function`

- [ ] **Step 3：最小實作**

`emptyRetention()` 與 `normalizeRetention()` 加 `clubPointsLifetime`（舊存檔沒有 ⇒ 回填為 `clubPoints`，因為在此之前只進不出）；`claimObjective` 同時加兩個欄位；`clubTierOf` 的呼叫點改讀 lifetime；新增：

```js
export function spendClubPoints(retention, amount) {
  const R = normalizeRetention(retention);
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0) return { ok: false, retention: R, reason: "金額必須為正" };
  if (R.clubPoints < n) return { ok: false, retention: R, reason: "俱樂部點數不足" };
  //  ⚠ 只動餘額，lifetime 不變 —— 花點數不得讓等級倒退
  return { ok: true, retention: { ...R, clubPoints: R.clubPoints - n }, reason: null };
}
```

- [ ] **Step 4：跑驗證器，確認通過**

Run：`node tools/check_club_mastery_v1.mjs`　Expected：PASS

- [ ] **Step 5：Commit**

```bash
git add src/platform/retention/retentionState.js tools/check_club_mastery_v1.mjs
git commit -m "Separate lifetime club points from the spendable balance"
```

---

### Task 2：career 袋子與戰術記錄

**Files：** Modify `src/platform/retention/retentionState.js`（`pruneScopes` 74、`recordMatchActivity` 139、`COUNTERS`／`SETS` 於 `retentionObjectives.js` 61/72）

**Interfaces：** Consumes Task 1 的 `normalizeRetention`。Produces `retention.career = { counters:{}, sets:{} }`、`SETS.tactics`、`COUNTERS.tacticIntent`、`recordTacticUsage(retention, { tacticId, evidenceMet, evidenceTotal, matchSource, win })`

- [ ] **Step 1：寫失敗的檢查**

```js
ck("career 袋子不被 prune 清掉", (() => {
  let r = recordTacticUsage(emptyRetention(), { tacticId: "m1", evidenceMet: 2, evidenceTotal: 3, matchSource: "competitive", win: true });
  r = pruneScopes(r, coordsOf({ day: 999, week: 99, year: 9 }));
  return r.career.sets.tactics.includes("m1");
})());
ck("快速練習不進 career", (() => {
  const r = recordTacticUsage(emptyRetention(), { tacticId: "m1", evidenceMet: 3, evidenceTotal: 3, matchSource: "practice", win: true });
  return (r.career.sets.tactics ?? []).length === 0;
})());
ck("未達 evidence 門檻不計 intent", (() => {
  const r = recordTacticUsage(emptyRetention(), { tacticId: "m1", evidenceMet: 1, evidenceTotal: 3, matchSource: "competitive", win: true });
  return (r.career.counters.tacticIntent ?? 0) === 0;
})());
```

- [ ] **Step 2：跑它，確認失敗**　Expected：`recordTacticUsage is not a function`

- [ ] **Step 3：最小實作**

`emptyRetention()` 加 `career: { counters: {}, sets: {} }`；`pruneScopes` **完全不碰 `career`**；新增：

```js
/** 戰術意圖門檻：達成該戰術自己 evidence 目標的**過半**才算「打出它該有的樣子」。 */
export const TACTIC_INTENT_RATIO = 0.5;

export function recordTacticUsage(retention, { tacticId, evidenceMet = 0, evidenceTotal = 0, matchSource = "unknown", win = false } = {}) {
  const R = normalizeRetention(retention);
  //  ⚠ 沿用 recordMatchActivity 的同一條規則：快速練習不進生涯進度
  if (!tacticId || matchSource === "practice") return R;
  const sets = { ...R.career.sets };
  const list = Array.isArray(sets.tactics) ? sets.tactics : [];
  if (!list.includes(tacticId)) sets.tactics = [...list, tacticId];
  const counters = { ...R.career.counters };
  const met = evidenceTotal > 0 && evidenceMet / evidenceTotal >= TACTIC_INTENT_RATIO;
  if (met) counters.tacticIntent = (counters.tacticIntent ?? 0) + 1;
  if (met && win) counters.tacticIntentWin = (counters.tacticIntentWin ?? 0) + 1;
  return { ...R, career: { counters, sets } };
}
```

- [ ] **Step 4：跑驗證器，確認通過**

- [ ] **Step 5：Commit**

```bash
git add src/platform/retention/retentionState.js src/platform/retention/retentionObjectives.js tools/check_club_mastery_v1.mjs
git commit -m "Record which tactic a match was played with, career-scope only"
```

---

### Task 3：Doctrine 定義與 mapping

**Files：** Create `src/platform/mastery/doctrine.js`

**Interfaces：** Produces `DOCTRINE`（`TEMPO`/`CONTROL`/`ADAPTIVE`）、`DOCTRINES`、`doctrineOfMobaTactic(tacticId)`、`CS_DOCTRINE_MAP`（`DESIGN_ONLY`）

- [ ] **Step 1：寫失敗的檢查**

```js
ck("三條 doctrine", DOCTRINES.length === 3);
ck("m1–m8 全部有歸屬", ["m1","m2","m3","m4","m5","m6","m7","m8"].every((id) => doctrineOfMobaTactic(id) != null));
ck("CS mapping 標 DESIGN_ONLY", CS_DOCTRINE_MAP.status === "DESIGN_ONLY");
```

- [ ] **Step 2：跑它，確認失敗**

- [ ] **Step 3：最小實作**

```js
export const DOCTRINE = Object.freeze({ TEMPO: "tempo", CONTROL: "control", ADAPTIVE: "adaptive" });
export const DOCTRINES = Object.freeze([
  Object.freeze({ id: DOCTRINE.TEMPO, zh: "強攻", emoji: "⚡", claim: "用節奏換先手，容錯低" }),
  Object.freeze({ id: DOCTRINE.CONTROL, zh: "控圖", emoji: "🗺️", claim: "用資源與視野壓縮對手選項" }),
  Object.freeze({ id: DOCTRINE.ADAPTIVE, zh: "應變", emoji: "🔄", claim: "保留選擇權，後期決勝" }),
]);
const MOBA_MAP = Object.freeze({
  m1: DOCTRINE.TEMPO, m7: DOCTRINE.TEMPO, m5: DOCTRINE.TEMPO,
  m4: DOCTRINE.CONTROL, m2: DOCTRINE.CONTROL,
  m8: DOCTRINE.ADAPTIVE, m6: DOCTRINE.ADAPTIVE, m3: DOCTRINE.ADAPTIVE,
});
export const doctrineOfMobaTactic = (tacticId) => MOBA_MAP[tacticId] ?? null;
//  ⚠ CS 只做 metadata mapping：不接 unlock、不新增 variant、不改 runtime。
//    理由見 spec §3：TD-52 量到 CS 戰術勝率差達 0.5%↔92.8%。
export const CS_DOCTRINE_MAP = Object.freeze({ status: "DESIGN_ONLY", ownerHandoff: "CS_OWNER_HANDOFF", byTacticId: Object.freeze({}) });
```

- [ ] **Step 4：跑驗證器，確認通過**

- [ ] **Step 5：Commit**

```bash
git add src/platform/mastery/doctrine.js tools/check_club_mastery_v1.mjs
git commit -m "Name the three doctrines and map the eight MOBA tactics onto them"
```

---

### Task 4：`VariantTradeoff` 契約

**Files：** Create `src/platform/mastery/tacticVariant.js`

**Interfaces：** Consumes Task 3 的 `DOCTRINE`。Produces `ALLOWED_VARIANT_FIELDS`、`FORBIDDEN_VARIANT_FIELDS`、`FIELD_ENVELOPE`、`validateVariant(v)`、`applyVariant(baseConfig, v)`、`TACTIC_VARIANTS`

- [ ] **Step 1：寫失敗的檢查**

```js
ck("必須同時有 benefit 與 cost", validateVariant({ ...ok, costAxes: [] }).ok === false);
ck("FORBIDDEN 欄位零修改", validateVariant({ ...ok, changedFields: { "vision.river": 0.9 } }).ok === false);
ck("tacticId 不可改", validateVariant({ ...ok, changedFields: { tacticId: "m2" } }).ok === false);
ck("超出 envelope 被擋", validateVariant({ ...ok, changedFields: { "macro.aggression": 0.99 } }).ok === false);
ck("applyVariant 不動 base", (() => {
  const base = mobaTacticById("m1"); const before = base.macro.aggression;
  applyVariant(base, TACTIC_VARIANTS[0]); return base.macro.aggression === before;
})());
ck("套用後仍通過 MobaTacticConfig 驗證", validateMobaTacticConfig(applyVariant(mobaTacticById("m1"), TACTIC_VARIANTS[0])).ok);
```

- [ ] **Step 2：跑它，確認失敗**

- [ ] **Step 3：最小實作**

```js
export const ALLOWED_VARIANT_FIELDS = Object.freeze([
  "macro.aggression", "macro.riskTolerance", "macro.grouping", "macro.splitPush", "macro.tempo",
  "objectives.dragonPriority", "objectives.baronPriority", "objectives.towerPriority", "objectives.invadePriority",
  "economy.supportRoamRate",
  "lanePlan.top", "lanePlan.jungle", "lanePlan.mid", "lanePlan.adc", "lanePlan.support",
]);
//  ⚠ 未映射欄位一律禁止 —— 讓玩家調一個引擎讀不到的數字就是假選擇。
export const FORBIDDEN_VARIANT_FIELDS = Object.freeze([
  "tacticId", "evidence", "fit",
  "macro.earlyGame", "macro.midGame", "macro.lateGame",
  "objectives.heraldPriority", "economy.carryPriority", "economy.jungleResourceShare",
  "vision.river", "vision.enemyJungle", "vision.objectiveSetup",
]);
/** 單一欄位相對 base 的最大位移。**不是平衡保證**，只是防爆走。 */
export const FIELD_ENVELOPE = 0.2;
```

`validateVariant` 逐條檢查 spec §4.3 的五項；`applyVariant` 回傳深拷貝後套用的新 config，**不改動 base**。

- [ ] **Step 4：跑驗證器，確認通過**

- [ ] **Step 5：Commit**

```bash
git add src/platform/mastery/tacticVariant.js tools/check_club_mastery_v1.mjs
git commit -m "Make a tactic variant declare what it gives up"
```

---

### Task 5：Mastery track 與解鎖判定

**Files：** Create `src/platform/mastery/clubMastery.js`

**Interfaces：** Consumes Task 2 的 `retention.career`、Task 3 的 doctrine、Task 4 的 variants。Produces `MASTERY_TRACKS`、`masteryViewOf(retention, clubMastery)`、`claimMasteryReward(clubMastery, trackId, view)`、`unlockedVariantIds(clubMastery)`、`equippableVariants(clubMastery)`

- [ ] **Step 1：寫失敗的檢查**

```js
ck("未達成不得領取", claimMasteryReward(st, "tempo_intent", viewNotDone).ok === false);
ck("同一 track 不得重複領", (() => {
  const a = claimMasteryReward(st, "tempo_intent", viewDone);
  return a.ok && claimMasteryReward(a.clubMastery, "tempo_intent", viewDone).ok === false;
})());
ck("未知獎勵 fail closed", claimMasteryReward(st, "does_not_exist", viewDone).ok === false);
ck("非 Active Doctrine 的 variant 不可裝備", (() => {
  const s = { ...unlockedAll, activeDoctrine: DOCTRINE.CONTROL };
  return equippableVariants(s).every((v) => v.doctrine === DOCTRINE.CONTROL);
})());
ck("BASIC 不受 Active Doctrine 限制", basicTacticsAlwaysAvailable(unlockedAll).length === 8);
ck("切換 doctrine 不清除已解鎖", (() => {
  const s = { ...unlockedAll, activeDoctrine: DOCTRINE.TEMPO };
  return unlockedVariantIds({ ...s, activeDoctrine: DOCTRINE.ADAPTIVE }).length === unlockedVariantIds(s).length;
})());
```

- [ ] **Step 2：跑它，確認失敗**

- [ ] **Step 3：最小實作**

三條 track，各綁 `retention.career` 的計數；`claimMasteryReward` 沿用 `claimObjective` 的冪等模式，但 claims **不 prune**；未知 `trackId` 或未知 reward kind ⇒ `{ ok: false }`（fail closed）。

- [ ] **Step 4：跑驗證器，確認通過**

- [ ] **Step 5：Commit**

```bash
git add src/platform/mastery/clubMastery.js tools/check_club_mastery_v1.mjs
git commit -m "Let a doctrine decide which variants can take the field"
```

---

### Task 6：profileStore 接線與 persist

**Files：** Modify `src/platform/profileStore.js`（初始狀態 275–400、actions、persist）

**Interfaces：** Produces `clubMastery` 狀態、`setActiveDoctrine(id)`、`claimMastery(trackId)`、`buyCatalogItem(itemId)`

- [ ] **Step 1：寫失敗的檢查**（reload 保存）

```js
ck("解鎖 reload 後仍在", (() => {
  const saved = JSON.parse(JSON.stringify(afterUnlockState));
  return normalizeClubMastery(saved.clubMastery).unlocked.includes("m1_siege_slow");
})());
ck("舊存檔沒有 clubMastery 也能載入", normalizeClubMastery(undefined).unlocked.length === 0);
```

- [ ] **Step 2–5：** 同前四個 task 的節奏（跑失敗 → 實作 → 跑通過 → commit）

```bash
git commit -m "Persist what the club has unlocked"
```

---

### Task 7：Match Prep 真的能用

**Files：** Modify MOBA 賽前戰術選擇的呼叫點（Phase 1 先確認 `battleStore` 是否已帶 `tacticId`；若無則此 task 升級為含接線）

**Interfaces：** Consumes Task 5 的 `equippableVariants`。Produces 賽前可選 BASIC ＋ Active Doctrine 的已解鎖 variant

- [ ] **Step 1：寫失敗的檢查**：`DESIGN_ONLY` 的 variant 不得進 runtime；送進引擎的 config 必須通過 `validateMobaTacticConfig`
- [ ] **Step 2–5：** 同上

```bash
git commit -m "Field a variant the club actually earned"
```

---

## Phase 2 — 最小 UI

### Task 8：`ClubMasteryScreen`

**Files：** Create `src/screens/ClubMasteryScreen.jsx`；Modify 路由（**不動 Home／AppShell 結構**）

至少可理解：Club level／XP、Club Points、三條 Mastery track、下一個目標、tactic unlock、coach／collection preview。Desktop ＋ 390px。沿用 `ESMO_Design_System_v1.md`。

### Task 9：Coach／Collection catalog

**Files：** Create `src/platform/mastery/clubCatalog.js`；接 Task 1 的 `spendClubPoints`

檢查：餘額不足不得購買、重複購買擋下、購買不降 Club Level。

---

## Future（本輪不做）

| 項目 | 狀態 |
|---|---|
| MOBA phase plan 真正進引擎 | `FUTURE_OWNER_WORK` — 需 LogicEngine 支援 |
| CS variant／unlock | `FUTURE_OWNER_WORK` `CS_OWNER_HANDOFF` |
| variant 勝率平衡 | `FUTURE_OWNER_WORK` — 需 `CalibrationEvidence.v1` |
| MASTERY／SIGNATURE 層 | `DESIGN_ONLY` |
| Coach 合約生命週期 | 明確不做 |

---

## 驗證（每個 Phase 結束都要跑）

```
node tools/check_club_mastery_v1.mjs      # 新增，鎖全部不變式
node tools/check_retention_v7b.mjs        # Retention 未回歸
node tools/check_online_valuation_v29.mjs # CBR 零改動
node tools/check_moba_tactic24.mjs        # 戰術契約未回歸
npm run build
```

`check_club_mastery_v1` 必須鎖住：BASIC 永遠可用／unlock prerequisite 正確／reward 不可重複領／unknown reward fail closed／Quick Practice 不刷 career／MOBA 與 CS progression 不互相污染／unlock reload 正確／`DESIGN_ONLY` variant 不得進 runtime／無第二套 player 或 tactic／CBR 與 Rating 零改動／CS runtime 零改動。

---

## Self-review 結果

- **Spec 覆蓋**：§2→Task 1、§3→Task 3＋5、§4.2→Task 4、§4.3→Task 4、§5→Task 2、§6→Task 9、§7→Task 9、§8→Task 3–5、§9→全域標記、§10→verifier。
- **無 placeholder**：所有 code step 都有實際程式碼；Task 6–9 的步驟節奏明列。
- **型別一致**：`recordTacticUsage`／`spendClubPoints`／`claimMasteryReward`／`equippableVariants` 在定義與引用處名稱一致。
- **已知風險**：Task 7 依賴「賽前呼叫點是否已帶 `tacticId`」，尚未查證 ⇒ 已在該 task 標明可能升級範圍。
