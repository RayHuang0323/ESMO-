# Meta Progression / Club Mastery v1 ＋ Tactic Framework v2 — 設計

> 狀態：**設計定案，尚未實作**。兩輪 grilling 的決策已鎖定於此。
> 本文件明確區分 `CURRENT_RUNTIME` / `DESIGN_ONLY` / `FUTURE_OWNER_WORK`。

---

## 0. 一句話

**Retention 管「今天做什麼」，Club Mastery 管「我的戰隊是什麼流派」，Team Development 管「俱樂部投資什麼」。三者共用一種貨幣（Club Points）與一組計數器，但永遠是三個 domain。**

---

## 1. 三個 domain 的邊界（不可混）

| domain | 時間尺度 | 回答的問題 | 既有／新增 |
|---|---|---|---|
| **Retention v1** | 日／週／季（世界時間） | 今天做什麼 | 既有，不改玩法 |
| **Club Mastery v1** | **生涯累計**，無日／週節奏 | 我的戰隊走什麼流派 | **新增** |
| **Team Development** | 生涯累計 | 俱樂部投資什麼 | 既有，只借用機制 |

Club Mastery **不是** `teamDevelopment` 的第五個 category。它借用後者的三樣基礎設施——**prerequisite 檢查、unlock flag、settlement 冪等**——但有自己的 domain 與自己的畫面。

---

## 2. 貨幣：單一 Club Points，兩種讀法

現況缺陷（必須先修）：`retentionState.js:227` 是 `tier: clubTierOf(R.clubPoints)`，**讀的是餘額**。一旦允許花點數，Club Level 就會倒退。

修正：

| 欄位 | 語意 | 單調性 | 用途 |
|---|---|---|---|
| `clubPointsLifetime` | 累計**獲得** | 只增不減 | Club Level／Prestige |
| `clubPoints` | 可花**餘額** | 可增可減 | 兌換 Coach／Collection |

`CLUB_TIERS` 改讀 `clubPointsLifetime`。**花點數不得降級**——這條要有 verifier。

⚠ 這是 prerequisite fix，必須在任何兌換功能之前完成。

---

## 3. Doctrine：TEMPO / CONTROL / ADAPTIVE

三條**共用**的高階流派，底下分 mode-specific branch。
**`Development` 不是 doctrine**——它是經營，留在 Team Development。

| Doctrine | 打法主張 | MOBA branch（既有 archetype） | CS branch |
|---|---|---|---|
| **TEMPO** 強攻 | 用節奏換取先手，容錯低 | m1 速推流、m7 前期壓制、m5 下路強攻 | rush／execute 系 |
| **CONTROL** 控圖 | 用資源與視野壓縮對手選項 | m4 龍堆運營、m2 四一分推 | 控圖／架點系 |
| **ADAPTIVE** 應變 | 保留選擇權，後期決勝 | m8 後期決戰、m6 全圖游走、m3 強開團 | mid-round 轉點系 |

CS branch 本輪 **`DESIGN_ONLY`**：只做 metadata mapping，不接 unlock、不新增 variant、不改 runtime。理由不只是所有權——TD-52 量到 CS 戰術間勝率差達 **0.5%↔92.8%**，在那個地形上放「解鎖更好的戰術」會直接發勝率，違反「高階不等於更強」。

### 3.1 Active Doctrine 如何產生選擇成本

**不用重懲罰、不用現實時間、不用點數。**

- Mastery 進度**永久保留**，且**所有 doctrine 同時累積**（計數器本來就是全域的，假裝它不累積只會逼玩家做假動作）。
- 選擇成本落在**出賽**：**只有 Active Doctrine 的已解鎖 variant 能在 Match Prep 裝備**。
- 切換 doctrine **免費、即時、無冷卻**，但切換之後可用的打法組合就換了一套。

為什麼這樣比「切換要付代價」好：玩家不會因為選錯而報廢存檔，也不會為了保住進度而不敢嘗試；但「我這支戰隊現在是控圖流」在每一次 Match Prep 都是真的。這同時滿足 `collection ownership != competitive power`——你擁有全部，但一次只能用一套。

BASIC 戰術（MOBA m1–m8 全部）**不受 Active Doctrine 限制，永遠可用**。

---

## 4. Tactic Framework v2

### 4.1 分層

| 層 | 內容 | 狀態 |
|---|---|---|
| **BASIC** | MOBA m1–m8 全部；CS 既有 `TACTICS_DB` 全部 | `CURRENT_RUNTIME`，**永遠可用、不得倒退鎖住** |
| **ADVANCED** | BASIC 戰術的 **variant**（同 `tacticId`，不同 config） | `CURRENT_RUNTIME`（MOBA），Mastery 解鎖 |
| **MASTERY / SIGNATURE** | doctrine 專屬 variant、需多條件 | `DESIGN_ONLY`（v1 不做） |

**Variant 不是新戰術**，是既有戰術的特化：同一個 `tacticId`、同一份 `MobaTacticConfig` 契約、同一支 `toEngineTactic()`。⇒ **沒有第二套 tactic system**。

### 4.2 Variant 欄位邊界（依 `toEngineTactic()` audit）

**ALLOWED_VARIANT_FIELDS**（已映射到引擎 ⇒ 改了真的會變）

`macro.aggression`、`macro.riskTolerance`、`macro.grouping`、`macro.splitPush`、`macro.tempo`、
`objectives.dragonPriority`、`objectives.baronPriority`、`objectives.towerPriority`、`objectives.invadePriority`、
`economy.supportRoamRate`、`lanePlan.{top,jungle,mid,adc,support}`

**FORBIDDEN_VARIANT_FIELDS**

| 欄位 | 為什麼禁止 |
|---|---|
| `tacticId` | 變體不得變成另一個戰術 |
| `evidence` | 不得自訂自己的成功標準 |
| `fit` | 不得讓變體「適合所有人」 |
| `macro.{earlyGame,midGame,lateGame}` | **未映射到引擎** |
| `objectives.heraldPriority` | **未映射**（引擎無預示者） |
| `economy.{carryPriority,jungleResourceShare}` | **未映射**（引擎無金流分配） |
| `vision.*` | **未映射**（引擎無視野系統） |

⚠ 未映射欄位列入 FORBIDDEN 的理由是**假選擇**：讓玩家調一個引擎讀不到的數字，是這個系統最容易犯、也最難被發現的謊。

⚠ 這也代表你要的 **phase plan（early/mid/late）在 MOBA 目前是 `DESIGN_ONLY`**——契約有欄位，引擎不讀。要讓它成真需要 LogicEngine 支援，標 `FUTURE_OWNER_WORK`。

### 4.3 VariantTradeoff 契約（取代「delta 總和 = 0」）

**不使用純量 delta 加總。** 不同欄位的 gameplay impact 不等權、也可能非線性，delta=0 證明不了公平。

每個 variant 必須宣告：

```
{
  variantId, baseTacticId, doctrine,
  benefitAxes: [...],      // 至少 1
  costAxes: [...],         // 至少 1
  changedFields: {...},    // 只能是 ALLOWED，且在 envelope 內
  rationale
}
```

Verifier 鎖住的是**結構**：

1. `benefitAxes` 與 `costAxes` **必須同時非空**
2. 禁止所有 `changedFields` 都朝同一個「更好」方向
3. 每個 field 的 delta 不得超出安全 envelope
4. `FORBIDDEN_VARIANT_FIELDS` **零修改**
5. `tacticId` 不可改

⚠ **這只證明「結構上不是純升級」，不證明勝率公平。** 真正的 gameplay sidegrade 需要 calibration evidence（`CalibrationEvidence.v1`，V7-2.9 已建立），列為 `FUTURE_OWNER_WORK`。**不得宣稱已平衡。**

---

## 5. Mastery Track：進度從哪來

### 5.1 執行極限（audit 結論）

既有 `COUNTERS`／`SETS` 是：`match`／`competitiveMatch`／`practiceMatch`／`win`／`training`／`scout`／`youthAppearance`／`matchIncome`；`players`／`lineups`。

**沒有任何一個知道玩家用了哪個戰術。** ⇒ doctrine 進度用現有計數**無法表達**。

最小誠實擴充：在**既有的** `recordMatchActivity` 呼叫點多記一個欄位，不建立第二條事件流。

- 新增 career-scope 袋子 `retention.career`，`pruneScopes` **永不清除**（mastery 是生涯累計）
- 新增 `SETS.tactics`（用過的不同 `tacticId`）
- 新增 `COUNTERS.tacticIntent`（達成戰術自身 `evidence` 目標的場次）

### 5.2 為什麼用 `evidence` 而不是場次

`MobaTacticConfig` 每張卡已自帶 `evidence`（m1：`towerPushes ≥ 8`、`midGanks ≥ 2`、`groupedFights ≥ 4`）。那是**戰術自己宣告的意圖**，已經在賽後畫面使用。

⇒ Mastery 條件寫成「**用速推流打出它該有的樣子**」，而不是「打 5 場」。這直接回應「任務不要變 checklist」，也讓 challenge 天然是教學。

### 5.3 反刷弱對手（強制）

所有 mastery 與 challenge 條件必須通過 `eligibleMatch()`：

- `matchSource` 不得是 `practice`（既有 `recordMatchActivity` 已對 `win` 做此排除，沿用同一條規則）
- 需達 `matchTierOf()` 的最低層級
- Quick Practice 預設**完全不計**，除非 challenge 明確標 `practiceEligible: true`

---

## 6. Coach：永久 Collection Asset

**不做薪水／合約／退休**——ESMO 已經在選手身上有那一整套，教練再來一份只會讓每週結算多一組狀態，而第一版看不到樂趣。

Coach v1 只有兩個作用點，都接既有系統：

1. **unlock path**：作為 variant 解鎖的 prerequisite 之一
2. **training specialization**：綁既有 `teamDevelopment` 的訓練節點語意

**不給任何數值加成，不做對手情報**（後者會外溢到 CS owner 的地盤）。

---

## 7. Club Points 用途（Reward Catalog v1）

| 項目 | 價格帶 | 理由 |
|---|---|---|
| Coach（每位） | 800–1500 | 日目標 10／週 40 ⇒ 約 2–4 週的累積，不是一天可得 |
| Collection（隊徽／稱號） | 200–600 | 小額出口，讓餘額有日常用處 |
| Club Asset（設施外觀） | 1000+ | 長期目標 |

**Tactic variant 不用 Club Points 買**——它由 Mastery 直接解鎖。兩種資源語意分明：**Mastery 換打法、Points 換身分**。

⚠ 價格帶是 provisional，未經校準，不得標 FINAL。

---

## 8. 第一版內容量

| 類別 | 數量 | 說明 |
|---|---|---|
| Doctrine | 3 | TEMPO／CONTROL／ADAPTIVE |
| Mastery Track | 3（每 doctrine 1 條） | v1 只把 **1 條**打通到底 |
| Tactic Variant | 2–3 | 全部掛在 MOBA BASIC 之上 |
| Coach | 2 | 永久 Collection |
| Collection | 少量 | 稱號／隊徽 |

在 sidegrade 預算好不好玩還沒驗證之前做 9 個 variant，是在放大一個未驗證的假設。

---

## 9. CURRENT_RUNTIME / DESIGN_ONLY / FUTURE_OWNER_WORK

| 項目 | 狀態 |
|---|---|
| MOBA m1–m8 BASIC 可用 | `CURRENT_RUNTIME` |
| MOBA variant（ALLOWED 欄位） | `CURRENT_RUNTIME` |
| Doctrine／Mastery／Club Points／Coach／Collection | `CURRENT_RUNTIME`（平台層） |
| MOBA phase plan（early/mid/late） | `DESIGN_ONLY` — 契約有欄位、引擎不讀 |
| `heraldPriority`／`carryPriority`／`vision.*` | `DESIGN_ONLY` — 未映射 |
| CS doctrine mapping／metadata | `DESIGN_ONLY` |
| CS variant／unlock／runtime 支援 | `FUTURE_OWNER_WORK` `CS_OWNER_HANDOFF` |
| variant 的真實勝率平衡 | `FUTURE_OWNER_WORK`（需 calibration evidence） |

---

## 10. 明確不做

不改 Online CBR、Rating、`starExcess`、`MATCH_BAND`；不改 CS runtime（route／weapon／economy／combat／tactic semantics）；不建立第二套 player entity；不建立第二套 tactic system；不給永久 player stat 獎勵；不做 coach 薪資生命週期；不 push／deploy。
