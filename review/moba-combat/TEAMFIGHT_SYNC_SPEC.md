> # ⚠ 本檔已被取代（2026-08-08）
>
> **Synchronization 假說已被實測否決（B-4 gate：FAIL）。**
> 現行規格見 **`TEAMFIGHT_COMMITMENT_SPEC.md`**。
>
> 本檔**保留為歷史記錄與設計決策證據**，不得刪除：
> 它記載了假說、依據該假說做出的兩項架構決策（引擎預設模型、synergy 移出 `joinAdj`
> ——這兩項在新規格中**繼續有效**），以及否決它的量測。
> 否決證據的完整摘要見新規格 §1。

---

# Combat Decision B — Teamfight Synchronization（**已否決，僅供備查**）

2026-08-08｜對應 `COMBAT_STAT_AUDIT_FINAL.md` §3-B

---

## 0. 要解決的問題（實測界定）

`r3_teamfight`（30 seeds × 鏡像 = 每格 60 場，含逐場 raw sample）：

### 決策層：接線正確，沒有問題

| synergy | 參團擲骰命中 | 理論 |
|---|---|---|
| 40 | 79.73% | 81.00% |
| 70 | 82.83% | 85.00% |
| 90 | 86.86% | 87.67% |

Δ(90−40) 實測 **+7.13 ± 4.21pp** vs 理論 +6.67pp ⇒ `joinAdj` 完全按設計運作。

### 行為層：同步**完全沒有發生**

| synergy | 段落峰值人數 | 每 tick 平均 |
|---|---|---|
| 40 | 3.787 | 0.880 |
| 70 | 3.818 | 0.877 |
| 90 | 3.803 | 0.876 |

**非單調、全距 0.03 人。** 參團率上升 7pp，同時進場人數完全沒動。

### 結果層：唯一顯著的下游效果是「死更多」

| 指標 | Δ(90−40) | 配對 95% CI | 顯著 |
|---|---|---|---|
| **死亡** | **+2.117** | **[0.622, 3.611]** | **★** |
| 擊殺 | +0.533 | [−0.922, 1.988] | · |
| 推塔 | +0.633 | [−0.255, 1.522] | · |
| 淨交換勝率 | −2.00pp | [−4.40, 0.40]pp | · |
| 勝率 | −9.6pp | [−27.8, 8.6]pp | · |

⇒ **提高配合度唯一在統計上確立的效果，就是死更多，沒有任何補償項達到顯著。**

### 根因（`LogicEngine.js:720` `_joinV3`）

參團是**每人各自獨立**的黏性擲骰（每 `joinEvalPeriod` = 6 秒重評一次）：

```js
if (this.t >= p.joinEvalT) {
  p.joinEvalT = this.t + R.joinEvalPeriod;
  let c = this._joinChance(K, hot, M);        // 戰術 joinFight + 能力 joinAdj
  ...
  p.joinGo = (K ? this.rng2() : this.rng()) < c;
}
```

**五個人各自擲骰，沒有任何一行程式碼讓他們「一起」到。**
提高機率只會讓每個人各自更常出發 ⇒ 更頻繁地**逐個**走進戰場 ⇒ 被各個擊破。

⇒ 這是**結構問題，不是權重問題**：調 `joinAdj` 的 `+0.040` 無法修正符號。

---

## 1. 紅線（B 明確禁止）

| 禁止 | 理由 |
|---|---|
| 改傷害公式（`dmgAmt`、`p.power`） | S28 紅線 |
| 改經濟（`_dmgGold`、賞金） | 屬 **A**，且會讓 A 的證據失效 |
| 改等級曲線（`mlv`、`XP`、`powerMultFor`） | 屬 **A** |
| 改撤退／推進（`retreatAdj`、`returnAdj`、`retreatAt` 相關） | 屬 **A**，本輪不得碰 |
| 改遊走（`_roamPickV1`、`roam*Adj`、`roamRate`） | 屬 **C**，已關閉，不得回頭動 |
| 直接提高 `tfWonRate` / 降低死亡數 | 那是改分數不是改決策 |
| 大幅重構 `_joinV3` / `_postCombatV3` | 要求最小改動 |
| 新增第二套決策模型或 Store | 專案最高原則 |

**驗收必須看行為指標（同時進場人數、抵達離散度），不能看被直接寫入的數字。**

---

## 2. 模型設計

### A. 集結窗（rally window）— 團隊層，不是個人層

引擎已有 `this.fight3`（團戰物件，`LogicEngine.js:3085` 附近），含
`start` / `pos` / `members` / `deaths` / `lastContact`。**直接沿用，不新增狀態容器。**

新增團隊層的集結狀態（放在既有的 `this._tac[side]`，與 C 的 `roamLane` 同一個位置）：

```
S.rallyAt    第一個人決定參戰的時點
S.rallyPos   該次集結的目標點（＝當時的 hot）
S.rallyGo    已承諾參戰的隊友 id 集合
```

流程：
1. 某人 `_joinV3` 回傳 true 且窗未開 ⇒ **開窗**（`S.rallyAt = t`）。
2. 窗內其他人評估時，看得到「已有幾人承諾、他們的 ETA」。
3. 窗長由 `R.rallyWindow` 決定（建議 4–6 秒，與既有 `joinEvalPeriod` 同量級）。

### B. 抵達同步閘（核心機制）

**現況**：只要擲骰過了就走進去，不管會不會是一個人到。
**改為**：承諾參戰前，先看「我到的時候有沒有人跟我一起到」。

```
myEta      = dist(p.pos, hot) / fightSpeed
alliesEta  = 已承諾隊友各自的 ETA
together   = |myEta − median(alliesEta)| <= tol
```

- `together` 為真 ⇒ 照常參戰（同步進場）
- `together` 為假且**我會太早到**（比隊友早 tol 以上）⇒ **等待**：
  維持 `SETUP` 但不推進到 `ENGAGE`（沿用既有 `p.fsm` 兩態，不新增狀態）
- `together` 為假且**我會太晚到**（戰鬥可能已結束）⇒ **不去**

⚠ **「等待」不得變成永久卡住**：窗關閉（`rallyWindow` 逾時）或戰鬥消失即解除，
回到既有的 `_joinV3` 判定。這一條必須有明確的驗收（B-9）。

### C. synergy 的新語意

| 現在 | 改為 |
|---|---|
| `joinAdj +0.040` ⇒ 個人更常參戰 | **新增 `syncAdj`**：抵達同步的容忍窗 `tol` 與等待意願 |

- **高 synergy** ⇒ `tol` 較寬鬆但**願意等**（更常同步進場、solo 進場變少）
- **低 synergy** ⇒ 不等人，各自衝（＝現行行為）
- **中性（全 70）** ⇒ 見 §6 的架構決定

⚠ `joinAdj` 的 `synergy: +0.040` 是否保留、或比照 C 把 synergy 移出 `joinAdj`
改為純同步作用點，**留待實作前決定**（見 §6）。
C 的教訓是：若某素質同時控制「量」與「質」，量的效果會淹沒質的效果。

### D. 四項素質分工（不得重複控制同一件事）

| 素質 | 負責 | 作用點 |
|---|---|---|
| **synergy** | 抵達**同步**（一起到） | 新增 `syncAdj` |
| **courage** | **敢不敢**進場 | 既有 `joinAdj +0.050`（不動） |
| **tacticalIQ** | 這團**該不該**打 | 既有 `joinAdj +0.040`（不動） |
| **leadership** | 團隊層**號召** | 既有 `TEAM_LED_JOIN 0.020`（不動） |

⚠ `comms +0.030` 留在 `joinAdj`。它在 C 已有 `roamInfoAdj`，B 不再給它新作用點，
避免同一素質橫跨兩個結構問題而無法歸因。

---

## 3. Telemetry

**沿用既有**：`groupedFights`、`tfEpisodes`、`tfWonRate`、`tfPeakMean`、`tfHeadMean`、
`tfRolls`、`tfGoRate`、`tfBehindRate`（全部已在 `measure_stat_sensitivity.mjs`）。

**需新增（純觀測，不改行為、不動 rng）**：

| 欄位 | 定義 | 為什麼需要 |
|---|---|---|
| `tfSoloEntry` | 進入「團戰!」時，該側在 hot 半徑內少於 2 人的次數 | **直接量「單獨送頭」**，是 B 的核心產出 |
| `tfArrivalSpread` | 每個段落中，該側第一位與最後一位進入 `ENGAGE` 的時間差 | **直接量「同步程度」**，比 peak 人數更靈敏 |
| `tfWaited` | 因同步閘而選擇等待的次數 | 驗證 §2-B 真的在動作 |
| `tfDeclinedLate` | 因「會太晚到」而不去的次數 | 同上 |

⚠ `tfArrivalSpread` 是本規格**最重要**的新指標：`tfPeakMean` 在現況下是平的
（3.787/3.818/3.803），靈敏度不足以當主要驗收依據。

---

## 4. 驗收標準（B-1 ~ B-12）

情境 `teamfight`（`joinFight` 0.85、`gankInterval` 28），30 seeds × 鏡像、
raw sample ＋ **配對檢定**（C 的教訓：只看點估計會下錯結論）。

| # | 斷言 | 理由 |
|---|---|---|
| **B-1** | 中性紅線：`toPlayerMods(全70)` 與 `NEUTRAL_MODS` **逐鍵逐序相同**，且注入全 70 ⇒ 逐位元 == feature off | `check_moba_stats28` §9；**C 在此踩過兩次坑** |
| **B-2** | `tfArrivalSpread` 隨 synergy **顯著下降** | 主要目標：更同步 |
| **B-3** | `tfSoloEntry` 隨 synergy **顯著下降** | 主要目標：少單獨送頭 |
| **B-4** | **死亡不得隨 synergy 顯著上升** | 這是現況唯一顯著的壞效果，必須消除 |
| **B-5** | `tfPeakMean` 隨 synergy 上升（或至少不下降） | 同時進場人數 |
| **B-6** | `tfWonRate` 不得顯著下降 | 淨交換不能變差 |
| **B-7** | 推塔不得顯著下降 | 不能用犧牲推線換集結 |
| **B-8** | **撤退／作戰持續／重返不得出現顯著變化** | **不得污染 A 的證據基準** |
| **B-9** | 「等待」不得造成卡死：`fightUptime` 不得顯著下降，且無零擊殺場 | §2-B 的風險 |
| **B-10** | 遊走指標（`roams`／`roamEngaged`／`roamPaid`）不得顯著變化 | **不得污染 C** |
| **B-11** | 固定 seed 重跑一致；新決策**不新增 rng 抽樣** | C-9 同款 |
| **B-12** | `regress` 15/15、`regress2` 8/8、`stats28` 29/29、`runtime29` ≥ 43/44、`credibility` 45/45、`build` PASS | 既有回歸 |

⚠ **B-4 是本規格的成敗判準**。若同步做到了（B-2/B-3 綠）但死亡仍顯著上升，
代表根因不在同步，而在別處（很可能是 A），**應停止並重新診斷，不要繼續調參**。

⚠ B-8 與 B-10 是**隔離條款**：A 的證據（decision 勝率 −23.1pp ★ 等）
與 C 的成果都建立在目前的基準上，B 不得動搖它們。
實作後必須重跑 `r3_neutral` / `r2_split` 逐場比對（比照 C 的作法）。

---

## 5. 最小改動範圍（預估）

| 檔案 | 改動 | 風險 |
|---|---|---|
| `src/LogicEngine.js` `_joinV3`（:720）＋ 呼叫點（:3451） | 加入抵達同步閘；`_tac[side]` 加集結窗狀態 | **中**：唯一動到正式決策行為處 |
| `src/battle/moba/mobaPlayerStats.js` | 新增 `syncAdj`（＋ `MOD_CLAMP`、`NEUTRAL_MODS`，**鍵順序須與 `toPlayerMods` 一致**） | 中 |
| `src/battle/moba/matchProgression.js` | 新增 `rallyWindow` / `syncTol` / `teamfightSyncV1` 等常數 | 低 |
| `tools/check_moba_stats28.mjs` | mod 鍵 allowlist 登記 `syncAdj` | 低 |
| `tools/measure_stat_sensitivity.mjs` | 四個新 telemetry 欄位 | 低 |
| `tools/check_moba_roam_quality.mjs` | **不動** | — |
| `tools/check_moba_teamfight_sync.mjs`（新增） | B-1~B-12 驗收 | 低 |

**不得動**：`dmgAmt` / `p.power` / 塔傷 / 金錢 / 等級曲線 / `retreat*` / `roam*` /
Store / Router / BattleResult / CS / UI / 3D / 英雄模型 / 地圖。

---

## 6. 架構決策（**2026-08-08 已確認，實作依此進行**）

### ✅ 6-1 決策：**引擎預設模型**

- 未注入能力層時**也走**新版團戰同步模型（以中性參數運作）
- 全 70 中性值代表新版模型的 neutral behavior
- 能力層只負責**改參數**，不負責決定模型是否啟用

理由：Teamfight Synchronization 是**戰鬥引擎行為模型**，不是單一能力功能；
避免重演 C 的 injected / non-injected baseline 分裂。

### ✅ 6-2 決策：**synergy 移出 `joinAdj`**

`joinAdj` 保留「**是否**參戰」語意；新增 `syncAdj` 處理
「已決定參戰後，**是否願意等待隊友並同步 ENGAGE**」。

⚠ **不為了維持舊權重總和而保留錯誤接線。** 移除後 `joinAdj` 總和由 0.19 降為 0.15
（courage .050 / tacticalIQ .040 / comms .030 / reflex .030），
但**四項各自的絕對權重未變** ⇒ 單項量測（其餘固定 70）時
`wsum` 只加總變動的那一項 ⇒ **不會意外放大任何一項**。
此結論須由 B verifier 明確斷言（B-13）。

### 實作模型（依決策定案）

```
發現團戰 → 個別判定是否參戰（joinAdj，維持現狀）
        → 承諾後進入 SETUP，向戰場靠近
        → 到達 standoff 半徑則待命，持續估算自己與已承諾隊友的 ETA
        → 依 syncAdj 決定可接受的 arrival spread 與等待窗
        → 條件成立（或等待窗逾時）才 ENGAGE
```

⚠ **禁止**做成「高 synergy 所有人固定多等 X 秒」。等待是**條件式**的：
ETA 對齊即刻進場，對齊不了才等；`syncAdj` 只改變「可接受的離散度」與「願意等多久」。

⚠ 已有隊友在戰場內時**永遠允許進場**（不能見死不救），
且已在戰場內的人不得被拉出來 —— 這兩條防止同步機制製造新病灶。

### 主要 telemetry（依決策調整）

`tfArrivalSpread`、`tfSoloEntry`、**`tfReadyAtEngage`**（新增）為主要驗收依據。
**`tfPeakMean` 降為輔證**（現況三格全距僅 0.03 人，靈敏度不足）。

---

## 6-舊. 決策前的分析（保留備查）

### 6-1：B 是「引擎預設」還是「能力層附加」？

C 一開始做成能力層附加，結果違反 `stats28` §9（中性全 70 ⇒ 逐位元 == feature off），
最後改成**引擎預設**（未注入能力層時以中性參數運作）。

B 面臨完全相同的選擇：

- **引擎預設**：中性也套用同步閘 ⇒ §9 自然成立，但**改變引擎預設戰鬥行為**，
  `regress`／`regress2` 的節奏基準需重新確認。
- **能力層附加**：需要「所有 `syncAdj` 為 0 時走舊路徑」的斷點式閘門，
  代價是「全 70 用舊模型、71 用新模型」，且未來量測的 70 分格與 40/90 格是不同模型。

**建議：比照 C 採引擎預設**，理由一致（同步是修正一個壞掉的預設決策），
且能避免量測基準分裂。**但這是改變引擎預設行為，需明確授權。**

### 6-2：synergy 是否移出 `joinAdj`？

C 的教訓：`comms` 同時控制遊走的「量」（`roamAdj`）與「質」（`roamInfoAdj`）時，
量的效果淹沒質的效果，最後必須把 comms 完全移出 `roamAdj` 才量得到品質梯度。

synergy 目前在 `joinAdj +0.040`（量）。若同時給它 `syncAdj`（質），
很可能重演同一個問題 —— 參戰次數上升會淹沒同步的效果。

**建議：把 synergy 移出 `joinAdj`，只保留 `syncAdj`。**
代價是 `joinAdj` 的權重總和改變，會影響 courage / tacticalIQ / comms / reflex 的相對比重
⇒ 這四項在 audit 表的分類需在 B 完成後重新確認（比照 C 的作法，先不改分類）。

---

## 7. 已知風險

1. **B 與 A 的耦合**：更同步的團戰會改變死亡與推進，而那正是 A 的量測基準。
   ⇒ B 實作後必須重跑 `r3_neutral` / `r2_split` 逐場比對（B-8 已涵蓋）。
2. **「等待」可能製造新病灶**：等待中的英雄站在原地不動，可能被逐個點掉，
   或造成比賽拖長。B-9 專門守這一條。
3. **`tfPeakMean` 靈敏度不足**：現況三格全距只有 0.03 人，
   ⇒ **主要驗收必須用 `tfArrivalSpread` 與 `tfSoloEntry`**，B-5 只作輔證。
4. **rng 中立性**：同步閘若使用 `rng2()` 會平移隨機序列，
   使「B 造成的差異」與「seed 位移」無法分離。⇒ B-11 要求決定性判定（比照 C）。
