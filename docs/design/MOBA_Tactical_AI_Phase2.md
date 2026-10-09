# MOBA Tactical AI Phase 2（moba-sim.v20）

> **狀態：RELEASED（2026-10-09，main `92245f4`，Pages run `37915626577`）。** Phase 3 未開始。
> （10-08 的 NOT READY 阻擋項——藍方／迭代順序偏差——已由 Team Call 同類冷卻解除：n=1000 純藍方 +0.3pp、反轉順序 z 0.00；見 `docs/handoff/05_Sprint紀錄.md`。）

- 分支：`feature/moba-tactical-ai-p2`（基於 main `fde17c7`＝moba-sim.v19 RELEASED、Map Topology FROZEN）
- 範圍：Combat Intent、兵線優先、引擎內 Team Call、Gank／殘血追擊、Objective／Smite。偷塔、完整分推、後期換線、Ambush 留 Phase 3。
- 規則旗標全部在 v3 正式規則集（`matchProgression.js` 末段「Tactical AI Phase 2」區塊），可個別關閉做對照；
  **七個旗標全關 ⇒ 與 v19（main `fde17c7`）逐位元相同**（scratchpad `equiv_v19.mjs` 實測）。

## 設計原則

素質／個性／狀態／隊友配合 → 改變**決策與執行** → 產生不同場上事件 → 自然影響勝負。不加任何「素質高＝勝率」的數值。
全部決定性、**不新增亂數**（Gank 選路與物件評估改成評分後，反而少抽 rng）。差異來源（皆為既有作用點）：

| 來源 | 用在哪 |
|---|---|
| 風險傾向 `_riskV19`（英雄定位＋positioning／decision／focus／courage／clutch／resilience＋戰術身分） | Intent 門檻、Gank 門檻、追擊所需傷害、呼叫回應 |
| `roamInfoAdj`（comms）／`commitAdj`（synergy）／呼叫者的 `roamFollowAdj`（leadership）／`roamGateAdj`（decision） | Team Call 回應、Gank 門檻 |
| 英雄定位 | 近戰／遠程（Poke 只給遠程）、呼叫回應的定位加成 |

## ① Combat Intent（`_combatIntentV20`）

在既有 `_combatDecisionV3` 的 ENGAGE／KITE／PURSUE 之上再分四種意圖：

| Intent | 走位（移動分支） | 出手（`_combatStep`） |
|---|---|---|
| ALLIN 強開 | 貼到攻擊距離 0.6 倍 | 正常 |
| TRADE 換血 | 2.5 秒貼近（攻擊距離 0.85 倍）→ 2 秒退到攻擊距離＋3，循環 | 退開段只在貼身時還手 |
| POKE 消耗（僅遠程） | 站在最大射程 | 正常 |
| KITE 拉扯 | 既有拉扯 | 正常 |

分數＝既有接戰分數＋等級／經濟差＋雙方 R 與閃現是否在手＋基本技能就緒數＋援軍（14 內但不在交戰圈的隊友−敵人）＋退路（身後自家塔）−敵塔下無兵線。
門檻＝基準＋風險傾向×1.8。殘血（<40%）、人數不佔優、對方血比我多 ⇒ 最多 Poke／Kite。回應了同一目標的呼叫 ⇒ +0.2；收到撤退呼叫 ⇒ −0.35。

## ② 兵線優先（`_waveBusyV20`）

對線英雄攻擊距離＋5 內還有敵方小兵 ⇒ 兵線未處理：不接一般的小規模接觸（`_joinV3`）、輔助不出發遊走（4 秒後再看）。
可打斷的高價值情境（`_highValueV20`）：本隊物件窗、救殘血隊友、夾擊（2 名以上隊友已在、敵人 ≤ 2）、回應了呼叫。打野不受限制。

## ③ Team Call（`_teamCallsV20`）

在全員決策凍結之後才發出與回應（與陣列順序無關）。只用**看得見的資訊**（任一隊友 16 內）；只有呼叫距離內的隊友收得到。

| 呼叫 | 發出 | 回應後的行為 |
|---|---|---|
| focus 集火 | 有人 All-in 某目標 | 前往並優先打該目標、意圖 +0.2 |
| lowhp 殘血 | 看得見的敵人 ≤ 30% | 同上；追擊不受擊殺估算擋 |
| gank | 打野評分出發時對該路 | 該路對線者對該路敵人意圖 +0.2 |
| retreat 撤退 | 有人在 2 名以上敵人面前撤退 | 意圖 −0.35 |
| objective 物件 | 物件評估開窗 | 參與物件窗（兵線未清的對線者除外） |

每個收到的人對每個呼叫只決定一次：距離、血量、定位、兵線、風險傾向、溝通／配合、叫的人的領導。

## ④ Gank／殘血追擊

- `_gankPickV20`：三路評分（看得見的敵方對線者殘血、壓線離塔、我方對線者在場且健康、Gank 偏好權重；敵方多人／敵方打野在附近、距離扣分）。
  分數不到 `gankMinScore` 0.8 ⇒ 不出發、4 秒後再看（取代「計時器到點＋亂數挑路」）。
- `_chaseKillableV20`：對方在追擊窗（chaseMaxT）內逃不回自家塔射程 ⇒ 追（既有超時／距離／leash 仍會收手）；
  逃得回去 ⇒ 附近隊友 DPS ×（逃回時間＋0.8 秒）≥ 剩餘血量（謹慎的人要更多餘裕、對方閃現在手 ×1.25）才追。

## ⑤ Objective／Smite

- `_objectiveEvalV20`：龍、巴龍都評估（戰術 knob＋Objective Stakes 急迫度＋人數＋平均血量＋坑邊雙方人數（敵方只算看得見的）
  ＋打野在不在／懲戒好了沒＋大招就緒＋已開打）取高者；≥ 0.75 才開窗，每 4 秒評估。少於 4 人且不佔人數優勢不打巴龍。
- `smiteCampV20`：物件迫近（打野在坑 35 內、本隊物件窗開著、或 20 秒內重生）才保留懲戒，否則可用於清野（冷卻 75 秒，來得及回來搶）。

## 量測與結果

見 `docs/handoff/05_Sprint紀錄.md` 同名節（v19 vs v20）。新 gate：`tools/check_moba_tactical_ai_p2.mjs`（verify 區段 `tactical_ai_p2`）。
