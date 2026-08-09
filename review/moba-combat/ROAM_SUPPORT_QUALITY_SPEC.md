# Combat Decision C — Roam Support Quality（**僅規格，本輪不實作**）

2026-08-08｜對應 `COMBAT_STAT_AUDIT_FINAL.md` §3-C

---

## 0. 要解決的問題（實測界定，不是猜測）

`r2_roam`（30 seeds × 鏡像 = 每格 60 場）：

| comms | 遊走／分 | 接戰率 | 換到人頭率 | 空手遊走／場 |
|---|---|---|---|---|
| 40 | 0.486 | 21.2% | 9.0% | 10.58 |
| 70 | 0.580 | 21.2% | 8.3% | 12.27 |
| 90 | 0.617 | 20.2% | 8.3% | 13.03 |

- **量**：每分鐘遊走次數與理論吻合（40 端差 −0.2%）⇒ `roamAdj` 接線正確。
- **質**：Δ接戰率 −1.0pp（95% CI −5.1 ~ +3.0）、Δ換到人頭率 −0.7pp（−3.5 ~ +2.1）⇒ **皆不顯著**。
- **淨效果**：空手遊走 10.58 → 13.03。

**根因（`LogicEngine.js:3217-3221`）**：遊走的全部內容是

```js
if (this.t >= S.roamNext) {
  S.roamNext = this.t + 40 + this.rng2() * 15;
  if (this.rng2() < clamp(K.roamRate + M.roamAdj, 0, 1)) {
    S.roamUntil = this.t + 8; this.exec[p.side].supportRoams++;
  }
}
if (this.t < S.roamUntil) { effLane = "mid"; stOv = "遊走"; }
```

即：**固定週期擲一次骰 → 命中就無條件走中路 8 秒**。
沒有「去哪裡」、沒有「值不值得」、沒有「現在去還來不來得及」、沒有「該不該取消」。
⇒ 提高機率只能提高次數，**結構上不可能提高品質**。

---

## 1. 紅線（本規格明確禁止的做法）

| 禁止 | 理由 |
|---|---|
| 降低 `roamAdj` 權重 | 那是把問題藏起來，量會變少但品質仍為零 |
| 直接提高 `roamEngaged` / `roamPaid` 的機率 | 那是改分數不是改決策；proxy 會變好看但行為沒變 |
| 給 comms 加傷害／擊殺／勝率 | 違反 S28 紅線（能力不得乘進傷害式） |
| 改 `dmgAmt`、`p.power`、塔傷、金錢或等級曲線 | 那是結構問題 A 的範圍，本階段不得碰 |
| 新增第二套決策模型／第二個 Store | 違反專案最高原則 |

**驗收標準必須是行為指標本身，不能是被直接寫入的數字。**

---

## 2. 模型設計

### A. Roam target selection（去哪裡）

把「無條件走中路」換成「從候選中挑一個，或不去」。

**候選集**：`top` / `mid` / `bot` 三路 ＋ `null`（不去）。

每個候選算一個 **value**，全部只用引擎已有的狀態（不新增狀態、不新增 rng）：

| 因子 | 資料來源（皆已存在） | 語意 |
|---|---|---|
| 人數差 | `alive.filter(側 & 距該路目標 < R.joinRadius)` | 我方能到幾人 vs 敵方幾人 |
| 敵方血量 | `q.hp / q.maxHp` | 有殘血可收 ⇒ 值得去 |
| 我方血量 | 同上 | 隊友快死 ⇒ 值得去救 |
| 抵達時間 | `dist(p.pos, tgt) / 移速` | 太遠 ⇒ 到了也沒用 |
| 戰鬥是否仍會在 | `hot`、`p.chaseId`、`_recentDeathsV3` | 抵達時戰鬥可能已結束 |
| 兵線／物件價值 | `frontTower(側, lane)`、`neutrals.dragon/baron.alive` | 有塔可推、有龍可打 ⇒ 加權 |
| 已有隊友前往 | 其他人的 `S.roamUntil` / `fsm === "ROAM"` | 已經有人去了 ⇒ 不重複 |

**`null`（不去）必須是合法且常見的結果** —— 這正是「空手遊走」下降的來源。

### B. Timing（何時去、何時放棄）

現行是「命中就固定 8 秒」。改為：

1. **出發前**：`抵達時間 > 戰鬥預期剩餘時間` ⇒ 不去（選 `null`）。
2. **途中重評**（沿用既有 6 秒黏性節奏，如 `joinEvalPeriod` / `splitEvalT`）：
   - 目標已死或已撤 ⇒ 取消，回線
   - 出現更高 value 的目標 ⇒ 改道
   - 自己血量低於撤退門檻 ⇒ 回線（不與 A 的撤退邏輯衝突，直接沿用 `p.retreating`）
3. **停留時間由情境決定**，不是固定 8 秒：戰鬥還在就留，結束就走。

⚠ **重評必須沿用既有的黏性週期**，不可每 tick 重算 —— 否則行為會抖動，
且會改變 rng 消耗次數，破壞既有 baseline 的逐位元一致性。

### C. comms 的語意重新定位

comms **不應該**是「更常離線」，而應該是「**離線這個決定更正確**」。

| 現在 | 應改為 |
|---|---|
| `roamAdj +0.080` ⇒ 提高擲骰命中率 | 提高**資訊品質**：能看到多少候選、對 value 的估計誤差多小 |

**建議機制（與既有 `_qualRoll` 同一風格，不新增作用點類型）**：
comms 高 ⇒ value 估計的雜訊小、可見候選多；comms 低 ⇒ 估計有偏差，
可能挑到次佳或看不見最佳候選。中性（70）＝現行行為。

⇒ 高 comms 的表現會是「**次數不一定增加，但挑對的比例上升**」。

### D. 四項素質的分工（不得重複控制同一件事）

| 素質 | 負責 | 具體作用點 |
|---|---|---|
| **mapAware** | *知道*哪裡值得去 | 候選集的**可見範圍**（視野半徑） |
| **comms** | 更快／更正確地**共享與呼叫** | value 估計的**準確度**（雜訊大小） |
| **decision** | 這件事**值不值得做** | `null` 門檻（value 要多高才出發） |
| **leadership** | 團隊層**號召** | 隊友**跟進**的機率（已有 `TEAM_LED_*` 機制可沿用） |

⚠ 這四者目前**全部**擠在 `roamAdj` 裡（`mapAware +.100`、`comms +.080`、`apm +.060`、
`leadership +.050`），這正是四項素質重複控制同一件事的根源。
本規格實作時，`roamAdj` 應退化為「出發頻率的基準」，四項素質改掛到上表各自的位置。

⚠ **`apm` 不應出現在這一層**。它的語意是操作速度，與「支援決策品質」無關。
實作時應從 `roamAdj` 移除 apm，或降為極小值（本輪 apm 實測結果見 `COMBAT_STAT_AUDIT_FINAL.md`）。

---

## 3. Telemetry（優先重用既有欄位）

| 欄位 | 現況 | 本階段 |
|---|---|---|
| `exec.supportRoams` | 引擎原生 | 沿用，語意變成「實際出發次數」 |
| `roamEpisodes` | 由 `supportRoams` 增量偵測 | 沿用不變 |
| `roamEngaged` | 段落窗內輔助 `atkTicks` 增加 | 沿用不變 |
| `roamPaid` | 段落窗內該側 K+A 增加 | 沿用不變（仍是**上界**） |
| `roamMissed` | `roamEpisodes − roamPaid` | 沿用不變 |
| `groupedFights` | 引擎原生 | 沿用 |

**需要新增的純觀測欄位（不改行為、不動 rng）**：

| 新欄位 | 定義 | 為什麼需要 |
|---|---|---|
| `roamDeclined` | 評估後選擇 `null` 的次數 | 「正確地不去」是本模型的核心產出，現有欄位量不到 |
| `roamAborted` | 出發後中途取消／改道的次數 | 驗證 B 段的重評是否真的在動作 |
| `roamLane` 分布 | 每次出發選了哪一路 | 驗證 A 段是否真的在挑，而不是恆走中路 |

三者都可用既有的攔截手法取得（如 `_objJoinV3` / `_joinV3` 的包裝），**不需要改引擎行為**。

---

## 4. 驗收標準（實作完成後必須通過）

情境 `roam`、30 seeds × 鏡像、raw sample + Welch/配對檢定。

| # | 斷言 | 理由 |
|---|---|---|
| C-1 | **中性（全 70）逐位元不變** | 與 P0-3 同一條紅線；`--stats` 未注入時完全短路 |
| C-2 | `roamMissed` 隨 comms **顯著下降** | 這是本階段的主要目標 |
| C-3 | `roamEngaged` / `roamEpisodes` 比例隨 comms **顯著上升** | 品質提升的直接證據 |
| C-4 | `roamEpisodes` **不要求**隨 comms 上升 | 明確允許「次數持平甚至下降」 |
| C-5 | 推塔不得顯著下降 | 不能用犧牲推線換支援 |
| C-6 | 撤退次數／作戰持續**不得出現顯著異常** | 避免污染結構問題 A 的量測基準 |
| C-7 | 勝率**不作為通過條件** | 30 seeds 精度 ±17.9pp，且不應直接保證勝率 |
| C-8 | `roamLane` 分布不得退化成恆走中路 | 證明 A 段真的在挑選 |
| C-9 | `regress` / `regress2` / `check_moba_runtime29` 全綠 | 既有回歸不得破壞 |

⚠ C-2 與 C-3 必須用 **raw sample 的配對檢定**，不可只看點估計 ——
先前正是因為缺 CI 而把 comeback 的結論下錯過一次。

---

## 5. 最小改動範圍（實作階段的預期檔案清單）

| 檔案 | 改動性質 | 風險 |
|---|---|---|
| `src/LogicEngine.js:3217-3221` | 遊走決策本體：擲骰 → 候選評估＋重評 | **中**：唯一動到正式決策行為的地方 |
| `src/battle/moba/mobaPlayerStats.js` | `roamAdj` 權重重新分工（mapAware/comms/decision/leadership 各歸其位；移除 apm） | 中：動到權重表，但屬本階段授權範圍 |
| `tools/measure_stat_sensitivity.mjs` | 新增 `roamDeclined` / `roamAborted` / `roamLane` 三個純觀測欄位 | 低 |
| `tools/check_moba_roam_quality.mjs`（新增） | C-1 ~ C-9 的驗收腳本 | 低 |
| `review/moba-combat/` | 新一輪量測輸出 | 無 |

**不得動**：`dmgAmt` / `p.power` / 塔傷 / 金錢 / 等級曲線（屬 A）、
`_joinV3` / `_postCombatV3`（屬 B）、Store / Router / BattleResult / CS / UI / 3D。

---

## 6. 已知風險

1. **C 與 A 的耦合**：遊走改動會影響推塔與撤退，而那正是 A 的量測基準。
   ⇒ C 實作後必須重跑 `r3_neutral` 與 `r2_split` 作為 A 的新基準，否則 A 的證據會失效。
2. **rng 消耗次數改變**：候選評估若使用 `rng2()`，會改變擲骰序列 ⇒ 中性逐位元不變（C-1）
   必須靠「未注入能力層時完全短路」來保證，而不是靠巧合。
3. **`roamAdj` 重新分工會改動四項素質**（mapAware / comms / decision / leadership）
   ⇒ 這四項在 `COMBAT_STAT_AUDIT_FINAL.md` 的分類需要在 C 完成後重新確認。
