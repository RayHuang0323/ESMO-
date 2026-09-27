# MOBA Runtime Follow-up v13（candidate；base `2aa4a99`）

本輪只接正式 `LogicEngine` → snapshot → R3F runtime；不碰 legacy、Online Backend、Competitive、Tower／Smite 數值、既有藍方偏差或 flicker。`heroSkillsOn=false` 不執行 v13 的 gameplay 接點。此文件描述實作範圍，並非發布宣告。

## Camera 與 Buff 血條

- `battleFocus` 由「半徑 14 內所有人的平均位置」改成敵對英雄配對；貼身距離、近期實際互擊 FX、低血量、多人與技能爆發加分。無交戰時錨定活英雄，不把藍方平均點當作戰鬥位置。KILL／FIRST_BLOOD 也進入短事件鏡頭。
- `BattleCameraController` 為焦點加入 3.2 秒 hold 與 1.5 秒高價值事件切入；手動、靜態鏡頭及 Replay 的來源分支不變。
- 藍 Buff 等營地原本就是每隻成員獨立 `hp/maxHp`；snapshot、adapter 亦逐 `memberId` 讀值。根因在 rigged neutral 血條額外緩動，畫面可落後正式 HP。現存活血條直接用該成員的 `hpRatio`；死亡後短暫保留**空血條**，不顯示假的逐幀扣血。

## 400 QWER 對象矩陣（資料盤點，不把支援條件當成必定命中）

| 對象 | 正式 gameplay 命中範圍 | Presentation 與限制 |
|---|---|---|
| 英雄 | 400/400 authored QWER；敵方／友方／自我依各招 mechanic | 400/400 presentation；控制、增益、護盾只在對應英雄契約成立時套用 |
| Lane minion | 75 招可按 v12 限制主動清兵（非 R、傷害、射程／補刀／推進條件）；另 91 招路徑或 AoE 在**以英雄為目標**時可波及兵；兩者聯集 120 招 | cast 與命中由同一技能事件；波及傷害走 `_laneSkillHits`，死亡／經濟走既有兵線結算；範圍最多 3 隻、×0.5。R 不主動拿兵當施法目標 |
| Jungle camp 成員 | 170 招符合中立目標傷害機制；實際需打野位置、個體在射程、沒有較優先的敵方英雄；英雄目標路徑／AoE 可波及成員 | 每隻獨立 HP、死亡、重生；傷害走 `_objSkillHits`／`applyMemberHits`。若預定個體先死亡，彈道不會偷換到同營另一隻 |
| Dragon／Baron | 同 170 招中符合射程且英雄在物件附近者可主動施放；英雄目標路徑／AoE 亦可波及 | 走既有 boss HP／歸屬；不對建築施法。Boss 不承受硬控 |

非上述 mechanic 的技能（包含自身／隊友 buff、shield、位移、拉人等）**沒有對兵、野怪或 boss 的完整受體契約**，不能因為畫面上有特效便宣稱 400/400 跨目標支援。`root-dot`／`area-dot` 在中立目標的主動退路仍是既有單次傷害接點，不宣稱完整英雄版 DoT 節奏。

## 非英雄 capability

- 小兵：slow 改移速，root 停移動，stun 停移動與出手，mark 只增幅後續技能傷害（上限 +20%）。`area-silence` 仍可傷害，但沒有對不施法單位造假「沉默」。
- 一般／Buff 野怪：每個成員各自承傷與攻擊 CD；stun 停該成員出手。營地共用隊形中心，因此存活成員的 root／slow 對該隊形移動生效。死亡／leash reset／重生清掉舊狀態。
- Dragon／Baron：傷害可作用；hard CC／slow 免疫。`area-mark` 最多 +10% 後續技能傷害，持續時間減半；不受隊友 buff／shield／silence。
- 控制只由正式技能命中產生；控制命中另發帶原 skillId 的 impact FX。沒有自行推測 UI HP 或第二套映射。

## 後期自然成長 vs. 物件獎勵

- v13 `phaseScalingV1` 只在 heroSkillsOn 的 v3 正式對戰啟用，6 分鐘前 1×，6–24 分鐘線性成長，24 分鐘封頂；新生小兵 HP 最多 1.35×、傷害 1.15×；新生／重生野怪與 boss HP 最多 1.30×、傷害 1.12×。既存單位不在半血時突然補血。Buff 成員各自重生、各自更新 maxHp；營地 maxHp 是三成員總和。
- Baron 既有 `baronBuffUntil` 約 70 秒的獲取後兵線強化仍是**獨立、暫時的物件獎勵**，此輪沒有新增第二套目標 buff 或更動倍率。Dragon 既有團隊層數同樣不動。
- 成長對兩側與鏡像地圖使用同一時間函式，不讀 winner／seed／side。上限、起迄時間在 `matchProgression` 一處維護。

## 驗證註記

- 版本語意變更記為 `moba-sim.v13`，舊 v1–v12 指紋保留；舊 Challenge 不跨版本重算。Replay 仍讀既有權威 frame，不重跑引擎。
- 舊 v12 lane verifier 的「R 不主動對兵施放」斷言改為辨識 `origin=nonHeroSplash`：英雄目標 AoE 波及兵，不是主動拿 R 清兵。沒有改原本 75 招的施法條件或門檻。
- 真手機 FPS／觸控手勢／視覺體感尚待使用者實測。長局、fairness 與 browser gate 須以最後一次 v13 程式碼結果為準。
- 本輪最終本機 gate：skill-off 對乾淨 `2aa4a99` 10 seeds 每 20 ticks、winner／finished diff 0；Items ON skill-on n=1000 1000/1000 finished，Blue/Red 54.3/45.7，擊殺比 1.116，median/P90/max 21.06/25.29/41.81m，庫存／守恆錯誤 0；Hero Skills release gate PASS、專項 PASS、runtime29 flat 35/35、presentation 12/12、controls 18/18、regress 15/15、regress2 8/8、build PASS。
- Pacing candidate／clean baseline 同為 23/25、同兩條紅燈；Camera／Replay 舊 verifier 兩邊同為 14/16、同兩條紅燈。正式 browser 39/40：唯一桌機 D1 缺死亡樣本，390px 有 12 次死亡且標記 0，兩端 page／console／shader errors 0。這些未通過項目不得寫成 PASS；沒有變更 baseline 或 gate 門檻。

## Reference ledger

- `threejs-gameplay-systems`：正式引擎 authority、受體能力與可驗證 hit path；本輪沒有建立第二套 gameplay 資料。
- `build-game-camera-controls`：焦點 scoring、hysteresis、手動／Replay 狀態保護；只調現有導播接點。
- `webapp-testing`：本機 headless Chromium desktop／390px 基礎 smoke；無真機性能主張。
