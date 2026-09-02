# Club Assets v1 Implementation Plan

> **For agentic workers:** 這份計畫由本 session 直接執行（inline）。步驟用 `- [ ]` 追蹤。

**Goal:** 把 Club Points 這條「只進不出」的迴圈接上出口——玩家用點數購買永久收藏的教練，裝備一位總教練，而那位教練提供**真的有消費端**的既有 capability。

**Architecture:** 新增三個純函式 domain 模組（capability 合併政策、教練型錄、資產狀態），由 `profileStore` 做唯一 orchestration。`clubCapabilities(profile)` 成為 capability 的**唯一權威**，回傳 `{ total, sources }`；provenance 讓「球探天數吃合併值、人才池只吃發展樹」這種分流成為可能。UI 重用首頁那個死掉的「商店」磚位。

**Tech Stack:** React 18、zustand、純 ESM domain 模組、CSS 檔（無新依賴）、Node verifier + CDP browser smoke。

**Spec:** 本輪 Grill Round 1／Round 2 的結論與使用者最終決策（見 `docs/handoff/05_Sprint紀錄.md` 本輪章節）。

## Global Constraints

- **不得修改 CS runtime 或 CS presentation 檔**（`src/battle/fps/**`、`src/screens/fps/**`）。`CsTacticScreen.jsx` 刻意不動。
- **不得碰** CBR、Rating、`starExcess`、`MATCH_BAND`、CS matchmaking、`onlineValuation`。
- **不擴 Variant、不做 balance calibration、不做 gacha／RNG pack、不做付費商城、不做教練合約生命週期。**
- **不 push、不 deploy。** 只做 local commit。
- **不修 F6**（Team Development 點數乾涸），也**不得順手新增發展點獎勵**。
- Club Points 是唯一消費貨幣；**購買只動 `clubPoints`，`clubPointsLifetime` 永不變**（必須走 `spendClubPoints()`，不得自己減）。
- 教練效果一律走 capability 邊界，**production code 不得出現 `if (coachId === ...)`**。
- 時間語意一律用既有 `deriveTime(meta.days).week`，**不建立第二個時間 authority**，不使用 ServerTime／真實時鐘。
- UI 遵守 2026-09-02 起的 `AGENTS.md` §Motion Policy，含 `prefers-reduced-motion`；Desktop + 390px 皆不得水平溢出。
- 回覆與 UI 文案繁體中文；程式碼、commit message、檔名英文。

---

## 定案內容（實作依據）

### Capability 合併政策

| capability | strategy | cap | 依據 |
|---|---|---|---|
| `trainingDaysReduction` | `sum` | **2** | 消費端 `profileStore.js:951` `Math.max(1, hours - r)`；課表最長 `hours: 3` |
| `dailyRecoveryBonus` | `sum` | **8** | 消費端 `profileStore.js:1009` → `applyDailyRecovery`；`restPerDay: 8`、energy clamp 100 |
| `scoutDaysReduction` | `sum` | **2** | 天數用合併值；**人才池只讀 `sources.teamDevelopment`** |
| `unlocks` | `union` | — | 旗標冪等 |

**cap 是 domain 層的上限，不依賴消費端 clamp。**

### 型錄（三位教練，全部是完整可用產品）

| assetId | name | specialty | price | prerequisite | capability | status |
|---|---|---|---|---|---|---|
| `coach_conditioning` | 體能教練 | `conditioning` | **700** | 無 | `dailyRecoveryBonus +4`、`trainingDaysReduction +1` | `CURRENT_RUNTIME` |
| `coach_scouting` | 球探總監 | `scouting` | **1100** | 無 | `scoutDaysReduction +1` | `CURRENT_RUNTIME` |
| `coach_tactical` | 戰術教練 | `tactical` | **1700** | `clubPointsLifetime >= 500` | `unlocks: mobaOpponentResearch, dataAnalysis` | `CURRENT_RUNTIME` |

**與使用者指示的一處偏差（已在對話中說明並採用）**：Tactical Coach 不用 `mobaDraftIntel`——該旗標**全專案沒有消費端**，會是一張沒有效果的卡。改用兩個 live 旗標：`mobaOpponentResearch`（`BanPickScreen.jsx:543` 對手選角摘要）與 `dataAnalysis`（`moba/TacticScreen.jsx:110`）。兩者都是 MOBA，不碰 CS。

`csMapResearch` / `csDemoAnalysis` 記為 **CS OWNER_HANDOFF future extension**，v1 型錄不得出現任何 CS 能力（由 verifier 硬擋）。

`specialty` 三值 `tactical | conditioning | scouting` 是**專長領域，不是等級**。刪除 `rarity`，不使用 `presentationTier`。UI 不得出現星等、N/R/SR、金銀銅或任何強度排序視覺。

### 換教練規則

- 空槽第一次裝備**免費**（不受每週限制）。
- 有教練後**不可卸下**（消滅「卸下再裝上」繞過鎖的 exploit，也消滅「沒有總教練」這個無意義狀態）。
- 換另一位：**每個 Career Week 最多一次**，week = `deriveTime(meta.days).week`。
- 不花 Club Points 換教練。

### Persistence

```js
clubAssets: {
  schema: "ClubAssets.v1",
  owned: { [assetId]: { acquiredWeek: number } },
  headCoachId: string | null,
  lastCoachChangeWeek: number | null,
}
```

`profileStore.save()` 存整個 store state ⇒ 只要進 `DEFAULT` 與載入 normalize 就會被持久化（與 `clubMastery` 同模式）。

### competitivePolicy

值域 `careerOnly | cosmeticNeutral | rankedEligible`。v1 所有有 capability 的教練 = `careerOnly`，`rankedEligible` 零個。

---

## File Structure

**Create**

| 檔案 | 責任 |
|---|---|
| `src/platform/assets/clubCapabilities.js` | `CAPABILITY_POLICY` 表 + `mergeCapabilities` + `clubCapabilitiesOf`。**唯一** capability 權威 |
| `src/platform/assets/coachCatalog.js` | 型錄資料 + 查表 + 型錄自我驗證 |
| `src/platform/assets/clubAssetsState.js` | `ClubAssets.v1` normalize / purchase / equip / view |
| `src/screens/manage/ClubAssetsScreen.jsx` | 俱樂部資產頁 |
| `src/screens/manage/clubAssets.css` | 該頁樣式（含 reduced-motion） |
| `tools/check_club_assets_v1.mjs` | 契約 verifier |
| `tools/browser_check_club_assets_ui.mjs` | Desktop + 390px browser smoke |

**Modify**

| 檔案 | 改動 |
|---|---|
| `src/platform/profileStore.js` | `clubAssets` slice；`clubCapabilities()` / `buyClubAsset()` / `equipHeadCoach()` / `clubAssetsView()`；`:906` `:951` `:1009` 三個讀取點改走合併權威 |
| `src/screens/manage/RecruitScreen.jsx` | 天數讀 `total`、人才池讀 `sources.teamDevelopment` |
| `src/screens/moba/BanPickScreen.jsx` | `unlocks` 改讀合併權威 |
| `src/screens/moba/TacticScreen.jsx` | 同上 |
| `src/screens/manage/RosterScreen.jsx` | 同上 |
| `src/screens/DashboardScreen.jsx` | `NAV.equip = "clubAssets"`；兩處磚標籤 商店 → 俱樂部資產 |
| `src/AppShell.jsx` | 註冊 `clubAssets` 畫面 |
| `docs/handoff/05_Sprint紀錄.md`、`docs/handoff/08_目前待辦與風險.md` | 本輪紀錄 + F6 技術債 |

**刻意不動**：`src/screens/fps/CsTacticScreen.jsx`（CS owner 邊界）。它繼續直接讀 `teamDevelopmentEffects`，語意等同 `sources.teamDevelopment`；由 verifier 斷言「v1 型錄無 CS 能力」保證等價。

---

## Task 1：Capability 合併權威

**Files:** Create `src/platform/assets/clubCapabilities.js`

**Produces:**
- `CAPABILITY_POLICY: { [kind]: { strategy: "sum"|"union", cap: number|null } }`
- `EMPTY_CAPABILITIES: { trainingDaysReduction, dailyRecoveryBonus, scoutDaysReduction, unlocks }`
- `mergeCapabilities(a, b) -> capabilities`（套用 policy 與 cap）
- `clubCapabilitiesOf({ teamDevelopment, clubAssets }) -> { total, sources: { teamDevelopment, coach } }`

- [ ] **Step 1**：寫 `CAPABILITY_POLICY`，四個 kind 各自宣告 strategy 與 cap（值見上表）。
- [ ] **Step 2**：`mergeCapabilities` 依表逐 kind 合併：`sum` 相加後 `Math.min(cap)`；`union` 做 `{...a.unlocks, ...b.unlocks}`。未知 kind **fail closed**（忽略，不塞進結果）。
- [ ] **Step 3**：`coachCapabilitiesOf(clubAssets)` 由 `headCoachId` 查型錄取 `capability`，未裝備或查不到 ⇒ `EMPTY_CAPABILITIES`。
- [ ] **Step 4**：`clubCapabilitiesOf` 組出 `{ total, sources }`，`sources` 兩份都是**未合併前**的原始值。
- [ ] **Step 5**：純函式檢查——不 import React / zustand / localStorage / 時鐘 / 亂數。

## Task 2：教練型錄

**Files:** Create `src/platform/assets/coachCatalog.js`

**Consumes:** Task 1 的 capability kind 名稱。
**Produces:** `CLUB_ASSET_VERSION`、`COACH_CATALOG`、`assetById(id)`、`ASSET_SPECIALTIES`、`COMPETITIVE_POLICIES`、`validateCatalog()`

- [ ] **Step 1**：定義欄位形狀（`assetId / type / name / description / priceClubPoints / prerequisite / tags / specialty / capability / status / competitivePolicy`）。
- [ ] **Step 2**：寫三筆資料（見定案表）。`prerequisite` 形狀 `{ kind: "clubPointsLifetime", min: 500 } | null`。
- [ ] **Step 3**：`validateCatalog()` 回傳錯誤陣列，至少擋：重複 id、價格非正整數、`specialty` 不在值域、`competitivePolicy` 不在值域、**capability 非空但不是 `careerOnly`**、**capability 含 CS 旗標**（`csMapResearch` / `csDemoAnalysis` / `csTeamPrep`）。
- [ ] **Step 4**：檔頭註明「新增教練＝只改這張表，不改邏輯」。

## Task 3：資產狀態機

**Files:** Create `src/platform/assets/clubAssetsState.js`

**Consumes:** `assetById`、`COACH_CATALOG`。
**Produces:**
- `emptyClubAssets()`、`normalizeClubAssets(raw)`
- `purchaseAsset(assets, assetId, { clubPointsLifetime, careerWeek }) -> { ok, assets, reason, code }`
- `equipHeadCoach(assets, assetId, { careerWeek }) -> { ok, assets, reason, code }`
- `canChangeCoach(assets, careerWeek) -> { ok, code }`
- `clubAssetsViewOf(assets, { clubPoints, clubPointsLifetime, careerWeek })`

- [ ] **Step 1**：`normalizeClubAssets` 對舊存檔 fail-safe：缺欄位補、未知 assetId 從 `owned` 剔除、`headCoachId` 不在 `owned` ⇒ 歸 `null`。
- [ ] **Step 2**：`purchaseAsset` 依序判定並 **fail closed**：未知資產 `unknown_asset`、已擁有 `already_owned`、prerequisite 不成立 `prerequisite`、餘額不足 `insufficient`。**本函式不扣點**，只回傳 `ok` 與新的 `assets`；扣點由 store 用 `spendClubPoints` 做，確保「只有一個地方動餘額」。
- [ ] **Step 3**：`purchaseAsset` **不自動裝備**（ownership 與 loadout 分離），但回傳 `firstOwned: boolean` 供 store 判斷是否觸發免費首裝。
- [ ] **Step 4**：`canChangeCoach`：`headCoachId === null` ⇒ `{ ok: true, code: "first_equip" }`；`lastCoachChangeWeek === careerWeek` ⇒ `{ ok: false, code: "weekly_locked" }`；否則 `{ ok: true, code: "ok" }`。
- [ ] **Step 5**：`equipHeadCoach`：未擁有 ⇒ `not_owned`；已是現任 ⇒ `already_equipped`（**零變化**，不消耗當週換人資格）；受週鎖 ⇒ `weekly_locked`。成功時**只有非首裝才寫 `lastCoachChangeWeek`**。
- [ ] **Step 6**：**不提供 unequip**。檔頭寫明理由。

## Task 4：Store 接線與唯一權威

**Files:** Modify `src/platform/profileStore.js`

**Consumes:** Task 1–3 的全部 export。
**Produces:** `clubCapabilities()`、`buyClubAsset(assetId)`、`equipHeadCoach(assetId)`、`clubAssetsView()`、`careerWeek()`

- [ ] **Step 1**：`DEFAULT` 加 `clubAssets: emptyClubAssets()`（放在 `clubMastery` 旁，`:406` 附近）。
- [ ] **Step 2**：載入路徑加 `clubAssets: normalizeClubAssets(saved.clubAssets)`（`:660` 附近）。
- [ ] **Step 3**：加 `careerWeek()` = `deriveTime(get().meta.days).week`。**唯一時間來源**。
- [ ] **Step 4**：加 `clubCapabilities()` = `clubCapabilitiesOf({ teamDevelopment: get().teamDevelopment, clubAssets: get().clubAssets })`。
- [ ] **Step 5**：把 `:906` 既有的 `teamDevelopmentEffects()` action 改為回傳 `get().clubCapabilities().total`（保持舊呼叫端相容），並在註解說明它現在是合併值。
- [ ] **Step 6**：`:951` 訓練天數改讀 `get().clubCapabilities().total.trainingDaysReduction`。
- [ ] **Step 7**：`:1009` 每日恢復改讀合併值。⚠ 該處在 `advanceDaysInState` 的 callback 內、拿的是 `cur` 而非 `get()` ⇒ 必須用 `clubCapabilitiesOf({ teamDevelopment: cur.teamDevelopment, clubAssets: cur.clubAssets }).total.dailyRecoveryBonus`，不可改成讀 `get()`（會讀到推進前的狀態）。
- [ ] **Step 8**：`buyClubAsset(assetId)`：先 `purchaseAsset` 判定 → 再 `spendClubPoints(retention, price)` → 兩者皆 ok 才 **單一 `set()`** 同時寫 `retention` 與 `clubAssets` → `save()`。任一失敗 ⇒ **完全不寫入**。若 `firstOwned` 且 `headCoachId === null` ⇒ 同一次 set 內免費裝備。
- [ ] **Step 9**：`equipHeadCoach(assetId)`：`equipHeadCoach(assets, assetId, { careerWeek: get().careerWeek() })`，成功才 set + save。
- [ ] **Step 10**：`clubAssetsView()` 組合 `retentionView()` 的點數與 `careerWeek()`。

## Task 5：消費端切換（含 Recruit 分流）

**Files:** Modify `RecruitScreen.jsx`、`moba/BanPickScreen.jsx`、`moba/TacticScreen.jsx`、`manage/RosterScreen.jsx`

- [ ] **Step 1**：`RecruitScreen.jsx:37` 改成讀 `useProfileStore((s) => s.clubCapabilities())`，取 `{ total, sources }`。
- [ ] **Step 2**：`:50` `genProspects(seed, { scoutNetworkRank: sources.teamDevelopment.scoutDaysReduction })` —— **人才池只吃發展樹**，並在該處寫下理由（買教練不得改變抽到的人才分布）。
- [ ] **Step 3**：`:76` `SCOUT_DAYS[depth] - total.scoutDaysReduction` —— 天數吃合併值。
- [ ] **Step 4**：三個 `unlocks` 消費端（BanPick `mobaOpponentResearch`、moba Tactic `dataAnalysis`、Roster `contractSummary`）改讀 `total.unlocks`。
- [ ] **Step 5**：確認 `src/screens/fps/CsTacticScreen.jsx` **零改動**。

## Task 6：契約 verifier

**Files:** Create `tools/check_club_assets_v1.mjs`

- [ ] **Step 1**：型錄檢查——`validateCatalog()` 無錯誤；三筆資料的 id／價格／specialty／prerequisite 逐值斷言。
- [ ] **Step 2**：**Online 邊界**——斷言 `valuateSquad` 的參數與 `SquadSnapshot.v1` 形狀不含 `clubAssets` / `headCoachId` / `coach` 任何欄位；斷言 `src/platform/matchmaking/**` 與 `onlineValuation.js` 原始碼**不出現** `clubAssets` / `coachCatalog` 字串。
- [ ] **Step 3**：**無 hardcode 教練 id**——掃 `src/platform/**` 與 `src/screens/**`（排除 `assets/coachCatalog.js` 與資產頁本身），斷言不出現 `coach_conditioning` 等字面量比較。
- [ ] **Step 4**：**CS 邊界**——斷言型錄無 CS 旗標；斷言 `src/screens/fps/CsTacticScreen.jsx` 與 baseline 逐位元組相同（用 git 比對）。
- [ ] **Step 5**：合併政策——逐 kind 驗 strategy 與 cap；驗 `sum` 超過 cap 會被夾住；驗 `union` 冪等。
- [ ] **Step 6**：狀態機——購買冪等（重複購買 `already_owned` 且 state 零變化）、unknown asset fail closed、餘額不足不寫入、prerequisite 擋人。
- [ ] **Step 7**：週鎖——首裝免費不寫 `lastCoachChangeWeek`；同週第二次換人被拒；`careerWeek + 1` 後可換；`already_equipped` 不消耗資格。
- [ ] **Step 8**：**lifetime 保護**——購買後 `clubPointsLifetime` 逐值不變、`clubTierOf` 等級不下降。
- [ ] **Step 9**：Meta Progression v1 不退化——`check_club_mastery_v1` 仍 265/265（由外層 gate 跑，不在本支重跑）。

## Task 7：俱樂部資產頁

**Files:** Create `ClubAssetsScreen.jsx` + `clubAssets.css`；Modify `DashboardScreen.jsx`、`AppShell.jsx`

- [ ] **Step 1**：`DashboardScreen.jsx:40` `NAV` 加 `equip: "clubAssets"` ⇒ 死掉的商店磚變成真入口。
- [ ] **Step 2**：`:683` 與 `:856` 兩處磚標籤 `商店` → `俱樂部資產`，detail 改 `教練與收藏`。**兩處都要改**（桌機 utility 與手機 sheet 是兩份清單，只改一份會讓其中一台裝置看到舊名）。
- [ ] **Step 3**：`AppShell.jsx` 註冊 `{screen === "clubAssets" && <ClubAssetsScreen onBack={home} />}`。
- [ ] **Step 4**：頁面沿用 Club Mastery 的視覺語言：`ESMO_CSS_VARS` + 專屬 CSS + `--specialty-accent`。三個 specialty 各自色相，**但不得構成排序**（同飽和度、同權重）。
- [ ] **Step 5**：資訊層級——目前裝備的總教練是 hero；型錄卡顯示 名稱／專長／價格／能力白話／prerequisite／擁有狀態；餘額常駐。
- [ ] **Step 6**：狀態文案——買不起顯示「還差 N 點」、prerequisite 未達顯示「需要職業俱樂部（累計 500）」、週鎖顯示「本週已換過，下週可再換」。**判定全部來自 domain view**，畫面不自己算。
- [ ] **Step 7**：Motion——購買成功一次性回饋、裝備切換 accent 轉場、餘額變化過渡、hover/press。全部 CSS，`prefers-reduced-motion` 一個 media block 關掉。
- [ ] **Step 8**：testid：`club-assets-screen`、`club-assets-back`、`club-assets-balance`、`asset-card-<id>`（帶 `data-owned` / `data-affordable` / `data-equipped`）、`asset-buy-<id>`、`asset-equip-<id>`、`head-coach-hero`。

## Task 8：Browser smoke、文件、commit

**Files:** Create `tools/browser_check_club_assets_ui.mjs`；Modify `05_Sprint紀錄.md`、`08_目前待辦與風險.md`

- [ ] **Step 1**：smoke 走真實路徑：首頁 → 商店磚／更多 sheet → 資產頁（桌機 + 390px 各一輪）。
- [ ] **Step 2**：完整 vertical slice 斷言——種入足夠點數 → 點「購買」→ `clubPoints` 減 700、`clubPointsLifetime` 不變、`clubTierOf` 不降 → `owned` 有它 → 自動免費裝備 → reload 仍擁有且仍裝備。
- [ ] **Step 3**：**capability 真的生效**——記錄某未訓練選手 energy → `advanceDay(1)` → 斷言 energy 增量比未裝備基準**多 4**；`assignTraining` 的 `totalDays` 比基準**少 1**。
- [ ] **Step 4**：週鎖——同週換人第二次被拒；`advanceDay(7)` 後可換；reload 不能繞過。
- [ ] **Step 5**：390px 無水平溢出；reduced-motion 下 `animationName === "none"`；捲得到底。
- [ ] **Step 6**：文件——Sprint 紀錄新章節；**F6 記入 `08_目前待辦與風險.md` 為 P1 progression design debt**（原文：Team Development currently has effectively no recurring point source; 15 nodes but career only gains approximately one spendable development point），明寫本輪不修；Club Points 未來 sink 方向（優先 Club Identity / cosmetic，其次 Club Facilities，且 Facility 的並行訓練／青訓名額**必須標為 Career progression effect，未校準前不實作**）。
- [ ] **Step 7**：跑全部 gate + build，輸出貼進回報。
- [ ] **Step 8**：`git add <明確清單>` → commit（**不 push**）。

---

## Self-Review

**Spec coverage**：使用者九條最終決策逐條對應 —— ①→Task 1+5、②→Task 2、③→Task 2（含 mobaDraftIntel 偏差說明）、④→Task 2、⑤→Task 3+4、⑥→Task 2+6、⑦→Task 8 Step 2–4、⑧→Task 8 Step 6、⑨→Task 8 Step 6。

**Type consistency**：`clubCapabilitiesOf` 在 Task 1 定義、Task 4 Step 4/7 與 Task 5 使用，形狀一致；`purchaseAsset` 回傳 `{ ok, assets, reason, code, firstOwned }` 在 Task 3 定義、Task 4 Step 8 使用；`careerWeek` 在 Task 4 Step 3 定義，Task 3 全部函式以參數接收（domain 不自己讀時鐘）。

**已知風險**：Task 4 Step 7 是最容易寫錯的一步（`cur` vs `get()`）；Task 7 Step 2 的「兩份清單」是 V7B 與 V7-2.5 各踩過一次的坑。
