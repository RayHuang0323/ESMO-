# MOBA Tactical AI Phase 3：教練戰術系統——正式架構（已核准）

> **狀態：正式架構 v1（2026-10-09，Owner 核准 Q1～Q12 與三點補充）。** 基準：main `1d0e219`（moba-sim.v20 RELEASED）。
> 本文件是 Phase 3 的**唯一架構依據**；`MOBA_Tactical_AI_Phase3_教練戰術系統提案.md` 保留為決策過程紀錄（理由、比較、Audit 細節）。
> 3a 詳細實作計畫：`docs/superpowers/plans/2026-10-09-moba-phase3a-foundation.md`。
> 本輪只有文件；**未修改遊戲程式、未 commit、未 push、未 deploy**。

---

## 1. 已鎖定的產品決策

| # | 決策 | 鎖定內容 |
|---|---|---|
| Q1 | 統一組裝 | 所有模式經 `MatchSetup.v1` ＋ 唯一組裝器 `assembleMatch`；Challenge 改用新 ruleset 時升 v21（見 §3 補充 1） |
| Q2 | 契約零數值 | **玩家／AI 的戰術資料只含選擇**（列舉、排序、席位、模板 id、覆蓋層 id、條件詞彙）；數值只存在**有版本號的模板資料、覆蓋層資料與 Resolver** |
| Q3 | 任務綁席位 | 席位任務綁 `b1`～`b5`／`r1`～`r5`；換人時計畫不變、適性重算 |
| Q4 | 熟練度只解鎖深度 | 解鎖條件槽數、介入卡種類、專業模板；不解鎖數值；Ranked 所有人槽數相同 |
| Q5 | 同步線上不暫停 | 固定延遲＋**公平指令操作時窗**（§3 補充 2） |
| Q6 | 介入公告 | 生效時雙方公告卡片名稱，不預告 |
| Q7 | 非同步 Challenge | 排位只能預約介入；休閒挑戰可即時介入並標示「不計排位」 |
| Q8 | 賽季 AI 對 AI | 戰術在 3c 校準後生效；**校準是 3c 必要交付**（§3 補充 3） |
| Q9 | 跳過自己的賽程 | 用 T1（同一個引擎、無畫面），結果與觀戰逐位元相同 |
| Q10 | 八套戰術 | 雙軌：m1～m8 保留為「經典模板」（Legacy 文案逐字），另設計模板 v2 |
| Q11 | 配合度負擔 | 正式機制：計畫越複雜，低配合度隊伍執行率越低（3b 引擎落地；3a 先在指標顯示） |
| Q12 | 賽後計畫執行報告 | 與 3b 一起交付 |

---

## 2. 架構總覽

```
經營層（不進模擬）： TacticBook · Scouting · Doctrine／Mastery（只解鎖深度）
        │ 選擇（模板 id／覆蓋層 id／列舉／排序／席位／條件）
        ▼
MatchSetup.v1 ── 每場唯一正規化輸入（含 rulesetId、inputsHash）
        │ assembleMatch(setup)  ← 唯一組裝器（Live／T1 Headless／Challenge／balance runner／未來伺服器）
        ▼
模擬核心（全部在模擬指紋清單內）
  MatchRuleset（明確功能集）→ 決定組裝哪些層
  Tactic Resolver vN：binding ＋ 版本化模板／覆蓋層資料 → 引擎方針（3a：與 v20 投影等價）
  LogicEngine ＋ Tactical Director（3b）：時期切換、條件應變、教練指令，經主 Call 以 Team Call 發令
        │
        ├─ T0 Live（畫面＋介入）   ├─ T1 Headless（快速完成／Challenge／伺服器裁決）
        ├─ Replay（逐格＋CommandLog 標記）   └─ Result／賽季
T2 統計（賽季 AI 對 AI）：teamStrength ＋ TacticMatchup（3c 由 T1 批次校準、版本化）
```

**五個支柱**（詳細理由見提案 §4～§5）：① MatchSetup＋唯一組裝器 ② TacticPlan.v2（只含選擇）③ Tactic Resolver（版本化）④ Tactical Director（引擎內，用 Team Call 發令）⑤ Capability Registry＋CommandLog。

---

## 3. Owner 三點補充的落實

### 補充 1：明確 ruleset，不得強制開啟未上線功能
**新增 `MatchRuleset.v1`**（`src/platform/contracts/matchRuleset.js`，列入模擬指紋清單）：
```
MatchRuleset.v1 {
  rulesetId: "career.v20" | "challenge.v20" | "balanceTool.v20" | "career.v21" | "challenge.v21" | …,
  kind: "production" | "tool",    // tool 專用能力（規則覆寫、incomeK、分隊出裝、強制佈局）只准 tool
  simVersion,
  layers: {
    heroSkills: bool, heroPassives: bool, heroPowerCurve: bool, battleTalents: bool, items: bool,
    tacticIdentity: bool, playerStatSides: "blue" | "both" | "none",
    objectiveLayout: "bySeed" | "standard" | "explicit",
    aiCoach: "styleTemplate" | "aiCoachV1"
  },
  releaseRequirements: [ "<featureFlag 名稱>" … ]   // 這個 ruleset 依賴的正式旗標
}
```
- **ruleset 在建立場次時解析一次、凍結進 `MatchSetup`**；組裝器只讀 setup，不在組裝時讀 `featureEnabled()` 或網址參數。恢復進行中場次時沿用存檔裡的 ruleset，不受旗標日後改動影響。
- **Gate `RS-1`**：每個 ruleset 的 `layers` 中為 true 的功能，其 `releaseRequirements` 的旗標在正式設定必須為 true；DEV 專用旗標（`?itemsDev=1`、`?heroSkillsDev=1`）**永遠不得**出現在正式 ruleset。
- **工具專用能力隔離**：規則覆寫（`RULE_OVERRIDES`）、收入倍率（`incomeK`）、分隊出裝策略、強制佈局只允許出現在 `kind: "tool"` 的 ruleset；`assembleMatch` 對 `kind: "production"` 的 setup 遇到這些欄位一律拒絕（RS-1 一併驗證）。
- **既有邊界照舊**：`featureFlags.js:84` 規定「Competitive／Challenge／Ranked 不由 `itemsV1` 開啟，維持獨立 disabled 邊界」。⇒ `challenge.v21` 的 `items: false`。要讓 Challenge 使用裝備，需 Owner 另行明確解除此邊界（屆時升版）。
- **實測現況**（3a 對等基準要逐位元重現）：
  | ruleset | heroSkills／passives／curve | talents | items | layout | playerStats | 戰術 |
  |---|---|---|---|---|---|---|
  | `career.v20`（Live） | 依旗標（正式皆 ON） | 依旗標（ON，有選擇時） | ON（`itemsV1:true`） | bySeed | 只藍方 | 藍：玩家；紅：style→模板 |
  | `challenge.v20` | OFF | OFF | OFF | standard | 雙方 | 雙方：選定模板 |
  | `balanceTool.v20` | 依環境變數 `ESMO_BALANCE_SKILLS` | 依 `ESMO_BALANCE_TALENTS`（AI 自動補位） | 依參數（`toEngineItems`，可分隊策略） | bySeed／環境變數強制 | none | 雙方 std |
  | `challenge.v21`（3a 末） | ON | OFF（Challenge 無天賦選擇資料） | OFF（邊界） | bySeed | 雙方 | 雙方：選定模板 |

### 補充 2：同步線上的公平指令操作時窗（規格，伺服器未實作）
| 規則 | 內容 |
|---|---|
| 開放期 | 比賽時間 3:00 起至比賽結束（開局 3 分鐘禁止，避免開局即用的套路）；斷線重連期間、伺服器追趕期間不開放 |
| 指令邊界 | 介入只在**固定網格**生效：每 5 sim 秒一個邊界（tick 對齊）。伺服器收到指令 ⇒ 落在「收到時刻＋固定延遲 D（4 sim 秒）之後的第一個邊界」 |
| 雙方同邊界 | 同一邊界雙方都有指令 ⇒ **同時生效**，處理順序固定（blue 先、red 後，但同 tick 套用、同 tick 公告），結果與到達順序無關 |
| 封存揭示 | 伺服器在邊界到來前**不轉發**任一方的指令（commit 後於邊界揭示），避免「看到對方介入再反應」 |
| 操作視窗 | 客戶端面板打開後 **10 秒真實時間**內必須送出；逾時＝取消、**不消耗次數** |
| 遲到 | 超過伺服器接受期限的指令自動順延到下一個邊界（仍在開放期內）；比賽已結束則作廢、不消耗 |
| 冪等 | 每個指令帶 `clientSeq`＋nonce；重送同一個 seq 不會重複套用 |
| 斷線 | 斷線方計畫照跑；若有預約介入依條件觸發；手動介入不被自動使用；重連後若未用仍可介入 |
| 觀戰延遲 | 第三方觀戰串流延遲 ≥ D＋一個邊界，避免觀戰者洩漏資訊 |
| 驗證 | 伺服器驗剩餘次數、卡片在當前 `interventionDeckVersion` 為 live、開放期、目標席位合法；CommandLog 雜湊串接 |

單機：可暫停（1×）；2×／4× 自動降回 1× 並暫停；指令於關閉面板當下 tick＋1 生效（無延遲 D）。
非同步：只能預約（排位）；休閒可即時（標示不計排位）。

### 補充 3：賽季 AI 對 AI 戰術校準＝3c 必要交付
- 3c 的**完成定義**包含：`TacticMatchup` 模型、`CalibrationEvidence`（T1 批次對照、樣本量、誤差、seeds 清單）、`SIMULATOR_VERSION` 升版、Gate `G-C3` 通過。
- **未通過 G-C3，Phase 3 不得標記為完成**；不允許以「延後到 Phase 4」結案。
- 每次 `moba-sim` 升版後，校準必須重跑（Gate 檢查 `CalibrationEvidence.simVersion` ＝ 當前版本）。
- 在 3c 完成前，賽季畫面明示「AI 對 AI 的戰術尚未影響聯賽結果」，不得暗示已生效。

---

## 4. 核心資料契約（定稿）

### 4.1 `TacticPlan.v2`（玩家資料，零數值）
```
TacticPlan.v2 {
  schema, planId, name,
  templateId,                    // "classic.m1"…"classic.m8" | "v2.<id>" | "std"
  overlayIds: [],                // 由變體遷移而來的覆蓋層（具名、版本化資料）
  choices: {                     // 只有列舉／排序／席位；缺項＝沿用模板
    winCondition, phases.{early,mid,late}.{stance,focusLane,grouping,objectiveOrder,tradePolicy*},
    lanes.{top,mid,bot}.{stance,wave*}, jungle.{route*,focus},
    seats.{seatId}.{mission,priority}, teamfight.{style*,engager*,focusTarget*,peelFor*},
    risk.{tolerance,comeback*}, comms.{shotcaller*,secondCaller*}
  },
  contingencies: []              // 3b 起
}
（* = 3b 以後才在 Registry 標為 live；3a 不得出現在 UI 或被 Resolver 接受）
```
### 4.2 版本化資料（數值只在這裡）
- `tacticTemplates.vN`：經典 m1～m8（數值＝現行 `MobaTacticConfig` 原值，逐欄等價）＋模板 v2。
- `tacticOverlays.vN`：現行三個 `TacticVariant` 原樣遷移（保留宣告式取捨）。
- `tacticResolver.vN`：列舉選擇 → 契約數值的對照表與投影。
三者版本號一起進 `TacticPlanBinding`。

### 4.3 `TacticPlanBinding.v1`、`MatchSetup.v1`、`TacticCommand.v1`、`CapabilityRegistry`
定義同提案 §5.2～§5.6；`MatchSetup.v1` 增加 `rulesetId` 與凍結的 `ruleset`；**不修改 `SquadSnapshot.v1`**。

### 4.4 Legacy 相容轉接（正式設計，不是暫時方案）
- 舊存檔中進行中場次的 `activeMatch.config.tactic`（完整 `MobaTacticConfig.v1` 物件，可能含變體後的任意數值）：恢復時以 `legacyTacticInput` 進入 `MatchSetup`，由 Resolver 的 legacy 分支直接走既有 `toEngineTactic`／`toEngineTacticIdentity`。該分支有明確標記與 gate，保留到最後一個含 v1 設定的存檔版本退場為止。
- Challenge 歷史紀錄（只有戰術 id）：以經典模板轉成 binding（`source: "legacyMigrated"`）。

---

## 5. 保護清單（每個階段的不可回歸項）

| 項目 | 保護方式 |
|---|---|
| v1～v20 版本紀錄 | `SIMULATION_SEMANTICS_FINGERPRINTS` 舊值不得變動（gate 已有）；**v20 已發布，指紋永不覆寫**——3a 自 T3 起升 `moba-sim.v21`（未發布候選），3a 期間只重登 v21，3a-A 不獨立發布，3a-B 完成後 v21 定稿發布 |
| 舊 Replay | 逐格播放不變；新欄位全 optional；Gate：既有 Replay fixtures 播放與 seek 結果不變 |
| Challenge | 3a 前段 `challenge.v20` 逐位元重現；v21 起舊挑戰由 `canReplay` 明確拒絕並顯示原因；`SquadSnapshot.v1`、`ChallengeInstance` 雜湊不變 |
| 存檔 | 三個 localStorage 鍵名不變；新切片歸類 `CLOUD_PROFILE_KEYS`；B1B／B1C／B1D gate 全綠；舊進行中場次可恢復 |
| CS／FPS | 不修改 `src/battle/fps/**`、`src/screens/fps/**`；CS 相關 gate（cs23 等）列入每階段批次 |
| 正式站 | 3a 前段發布後正式站行為逐位元不變（正式站 smoke＋本地對等 gate）；v21 發布照 v19／v20 release 流程 |
| Map／Topology | FROZEN，不在任何任務的修改清單 |

---

## 6. 分期總覽與依賴

| 階段 | 範圍 | 模擬版本 | 發布 |
|---|---|---|---|
| **3a-A 地基（對等）** | Ruleset、MatchSetup、唯一組裝器、三個正式組裝點遷移、TacticPlan.v2、模板／覆蓋層資料、Resolver（等價）、Registry、戰術書 UI（快速／標準）、指標、存檔 | **v21 未發布候選**（Live 結果與 v20 逐位元相同；不獨立發布） | 可單獨發布；正式站行為不變 |
| **3a-B 新行為** | Challenge 改用 `challenge.v21`；AI 教練 v1（紅方依 style＋自己選手素質組計畫） | **v21** | 依 release 流程 |
| **3b 深度** | Tactical Director、席位任務、主 Call、團戰指揮、包夾、資源交換、兵線、條件應變、配合度負擔、紅方素質注入、單機教練介入＋CommandLog＋Replay 標記、賽後執行報告、專業模式 UI | v22 | 依 release 流程 |
| **3c 跨模式** | 非同步預約介入、Challenge 自訂計畫、同步線上協議規格＋伺服器 runner 介面、**T2 TacticMatchup 校準（必要）**、多路帶線、Scouting 深化 | v23＋SIMULATOR_VERSION 升版 | Phase 3 完成條件含 G-C3 |

依賴：3a-A → 3a-B → 3b →（3c 的非同步預約與 Challenge 自訂計畫依賴 3b 的介入與 CommandLog；T2 校準依賴 3b 的最終引擎行為，在 3c 最後執行）。

---

## 7. 必要重構 vs 可延後

| 重構 | 時程 | 理由 |
|---|---|---|
| 三個正式組裝點（`useLocalServer`、`challengeRunner`、balance runner）改用 `assembleMatch` | **3a-A 必要** | 跨模式一致的前提；大多數 gate 經 balance runner |
| 正式程式碼禁止自行組裝（gate） | **3a-A 必要** | 防止再次分歧 |
| `MobaTacticConfig` 兩個投影收進 Resolver | **3a-A 必要** | 單一戰術真相；舊投影保留為 Resolver 內部的等價基準與 legacy 分支 |
| `TacticVariant` → 覆蓋層 | **3a-A 必要** | 戰術書 UI 要處理變體；避免兩份白名單 |
| 約 55 支工具腳本的自行組裝 | **延後**（碰到再遷移） | 多數是刻意只組部分層的引擎探針；全改會讓既有基準漂移 |
| debug 畫面（ItemInspector、ItemsUiGallery） | 延後 | 不影響正式模擬 |
| 引擎決策點改讀 Director | **3b 必要** | 時期切換／條件應變／介入的前提；逐點搬遷、逐點等價 gate |
| Doctrine／Mastery 改以計畫特徵推導流派 | 3b | 3a 期間以 binding 的經典對應 id 維持既有計數（不改形狀） |
| `simulateFixture` TacticMatchup | 3c 必要 | 補充 3 |
| Online 票券／裁決輸入加入 resolver／deck 版本 | 3c | 伺服器未實作；契約升版屆時處理既有斷言 |

---

## 8. 驗收 Gate 一覽（3a 細節見實作計畫）

| Gate | 階段 | 內容 |
|---|---|---|
| G-A0 基準擷取 | 3a-A 第一步 | 以 v20 程式碼擷取 Live 等價、Challenge、balance runner 三條路徑的黃金雜湊 |
| G-A1 跨模式一致 | 3a-A | 同 setup、同 ruleset ⇒ 三條路徑結果雜湊相同 |
| G-A2 對等 | 3a-A | 遷移後三條路徑與 G-A0 黃金雜湊逐位元相同 |
| RS-1 ruleset 正式性 | 3a-A | 正式 ruleset 不含未上線或 DEV 功能 |
| G-A3 Resolver 等價 | 3a-A | 經典模板（含覆蓋層）經 Resolver ≡ 既有兩個投影（逐欄） |
| G-A5 Registry | 3a-A | 每個 live 選項有引擎掛點與 gate；UI 選項清單＝Registry live 清單 |
| G-A7 真實性 | 3a-A | 每個 live 選項：固定 40 seeds 配對，宣稱的事件有可量測差異 |
| G-A6 UI | 3a-A | 桌機＋390 瀏覽器 gate |
| G-A9 存檔 | 3a-A | 舊存檔載入／遷移／恢復；B1B／B1C／B1D |
| G-A8 平衡 | 3a-B | 主導計畫掃描、STANDARD／SWAPPED side bias、事前指定新 seeds |
| G-B*、G-C* | 3b／3c | 見提案 §13 |

**測試執行紀律**：長 gate 一律走 `tools/verify.mjs` 分段、可續跑；大樣本量測分批（每批 ≤ 250 場、≤ 3 workers）、可續跑；每批開跑前確認無 CS／瀏覽器測試並行、可用記憶體 ≥ 3 GB；瀏覽器 gate 一次只跑一支；可疑結果以事前指定的新 seeds 重驗後才判 blocker。
