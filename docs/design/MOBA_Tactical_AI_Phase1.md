# MOBA Tactical AI Phase 1（moba-sim.v19）

- 分支：`feature/moba-tactical-ai-p1`（基於 main `cd91256`＝moba-sim.v18 RELEASED、Map Topology FROZEN）
- 範圍：只處理 2026-10-07 Audit 確認的三個 P0。Poke／Trade／All-in、Team Call、兵線／Roam／Gank 重構、偷塔／分推／Ambush 留 Phase 2／3。
- 規則旗標全部在 v3 正式規則集（`matchProgression.js` 末段「Tactical AI Phase 1」區塊），可個別關閉做對照。

## 設計原則：選手差異不是勝率加成

同一個情境，不同選手可以做出不同但合理的選擇。Phase 1 的差異**只有一個來源**——「風險傾向」`_riskV19(p)`：

| 來源 | 作用點（皆為既有） | 範圍 |
|---|---|---|
| 英雄定位 | `heroMod.retreatAdj`（坦克 −0.05 … 射手 +0.06） | 兩隊、所有模式 |
| 選手素質 | `playerMod.retreatAdj`（positioning／decision／focus ＋；courage／clutch／resilience −） | ±0.10 |
| 戰術身分 | `retreatFloorShift`（riskTolerance） | 戰術決定 |

正值＝謹慎、負值＝積極。決定性使用、**不擲骰**（不新增亂數、seed 可重現、Replay／Challenge 不受影響）。不新增素質鍵（`STAT_MAP` 不動）。

## P0-1 塔旁前後反覆移動

**根因（以決策目標乒乓量測，非導航抖動）**：v18 每英雄每分鐘 3.95 次「3 秒內目標 A→B→A」，最大宗是 M1.7 發呆再任務：
抵達對線站位點 → 被派「推進：壓向前線建築」→ 下一 tick 對線分支又拉回 → 抵達 → 再被派……（`等兵線` 只准 8 秒且不重置）。
另一半是塔區層每 tick 重算 `allow`（血量 45%／55% 死區、兵線剛死光或剛到）。

| 修正 | 旗標 | 個人差異 |
|---|---|---|
| 塔區血量遲滯：未在塔下 ≥ enter 0.55 才進、已在塔下被允許的人 < exit 0.45 才被逼出（決策層 FALLBACK 用同一套） | `towerHysteresisV19` | 門檻 ± risk×0.5 |
| 退塔最短承諾 2.5 秒（經 `_diveAssessV18` 驗證的強殺可覆蓋） | 同上 | 1.5–3.5 秒 |
| FALLBACK 進入後吃決策鎖（舊式每 0.5 秒重判） | 同上 | — |
| 對線站位點死區 3 單位 | `laneAnchorDeadbandV19` | ± risk×8 |
| 對線期在自家兵線後面等＝合法停留 | `laneWaitV19` | — |
| 發呆再任務承諾 4 秒（「推進」除外，見下） | `taskCommitV19`／`taskCommitPush:false` | 2–6 秒 |

⚠ 「推進」任務**不承諾**：實測承諾它會讓英雄在無兵線的敵塔邊空等，regress2 最長 25.3 → 34.8 分（消融測試）。

## P0-2 技能等級（HeroSkillLevel.v2）與大招保留

- Lv1／2／3 依升級優先序逐一解鎖三招基本技能；Lv4／5／7／8／9／10 升級（Lv10 全滿 3 級）。
- R：Lv6 解鎖、Lv11／Lv16 升級（上限 3，原為 2）。特殊英雄可用 `rules.R.unlockLevels` 覆寫（metadata hook）。
- rank 0＝鎖定：引擎施放閘門擋下；snapshot `locked:true`、`ready:false`；HUD 顯示「未解鎖／LvN」；Replay 相容（v18 replay rank 恆 ≥ 1）。
- **大招保留** `ultHoldV19`：R 要有理由才放——收頭（目標 ≤ 40% 血，積極的人門檻較高 ⇒ 更早出手）、多目標（目標身邊 ≥ 2 敵）、
  團戰（14 內有熱點、身邊有隊友、對面 ≥ 2）、保命（自己 < 35%）；增益類要身邊有敵人；對隊友要那位隊友殘血且有敵人；野怪／小兵一律不放。

## P0-3 勝利條件優先

`_winConditionV19(side)`：敵方任一路高地已破（`_laneBreached`）、我方存活 ≥ 3 且不少於對方、**推得動**（人數優勢 ≥ 1，
或目標建築旁已有己方兵線）⇒ 還沒開打的龍／巴龍窗關掉、不擲新的物件骰，改開「收尾推進」主動權窗（沿用 Milestone F 攻城路徑）。
已開打（物件 HP 真的在掉）的窗不砍。跟進收尾的血量門檻 `initiativeHpMin + risk×0.6`（謹慎的人更健康才上）。

兩個在 n=1000 量測中找到並修正的問題：
- 圍攻窗的塔區「推進目標」原本是英雄自己這一路的前線建築 ⇒ 圍攻門牙塔／別路塔一律被判無理由進塔（seed 89：34.3 → 22.6 分）。
- 沒有「推得動」條件時，雙方高地都破的局面會兩隊同時去攻有守軍、無兵線的門牙塔空耗（seed 258：39.3 → 24.0 分）。

## 已知取捨

- 技能逐級解鎖使前期清野變慢（正式設定前 5 分鐘 −13%）、中位時長 +1.5 分；野怪數值未調（Owner 決策項，見 08）。
- 「推進」再任務不承諾（承諾會拖長對局），所以剩餘的決策乒乓多數仍是它；根治屬 Phase 2 兵線決策。

## 量測與結果

見 `docs/handoff/05_Sprint紀錄.md` 同名節（v18 vs v19 前後數據）。新 gate：`tools/check_moba_tactical_ai_p1.mjs`（verify 區段 `tactical_ai_p1`）。
