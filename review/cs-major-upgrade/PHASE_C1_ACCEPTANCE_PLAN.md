# Phase C1 驗收計畫

2026-10-11：B已放行。C1最終37/37/native0，完整c1-zone-causal-scoped.*；時間尺度／晚安包倒數／保槍者轉交拆彈均有守門。Mirage火區未觸發明列SKIP，三圖合計smoke/molly皆非空且真因果無錯，不要求每圖都有兩類道具。C coordinator42/42、runtime34/34/native0；final Worker／Browser待E，不將Node當真機證據。所有變更僅限 `major.v1`，`legacy` 的 RNG 呼叫順序與完整 frame／result 保持原樣。

## 獨立致盲與槍口閃光

- 投擲事件至真實落地爆炸之前，受影響角色的致盲值保持零；槍戰不會產生致盲。
- 爆炸時計算距離與真牆體 LOS；牆後、範圍外、死亡角色不受影響。敵我分別驗證，不能只測攻方。
- 當兩顆閃光重疊，使用明確的持續時間規則；既有值不得被較短效果意外縮短。每個 tick 的衰減與 frame 記錄使用同一權威值。
- 命中計算只讀致盲值；呈現層槍口閃光仍讀原 shot／muzzle 事件，不再共享致盲狀態。時序單位必須明確，不能混用秒與 tick ratio。
- 純 helper 的邊界案例之外，讀取真模擬的 throwable／player／shot frame，驗證因果時間與實際影響。

## 戰術道具的真庫存與飛行

- 原 `sec===18` 的 tactic smoke 與 `sec===24` 的 tactic molly 都會免費生成區域；Major 必須一起改成存活持有者的合法投擲意圖。
- 無庫存、不存在的目標節點、無存活持有者，均不能生成煙或火區。每次投擲只消耗一個道具，目標位置由真投擲資料記錄。
- 煙與火只在權威 flight 完成後出現，使用相同 throwable ID／thrower 關聯；火焰傷害仍由既有 damage 路徑累計 utilDmg，不另外計算 UI 數字。
- 同 tick 隨機投擲與 tactic 投擲不能重複消耗或憑空補回庫存。不得加固定勝負、擊殺或結果。

## 單一拆彈者與中斷

- 任一時刻只允許一名存活、到達包點且符合既有安全條件的拆彈者累積進度，其餘 CT 掩護。
- 原拆彈者死亡、離開範圍、受到阻擋，或身份轉交時，進度依明確中斷規則重置，不能讓下一位繼承已完成進度。
- 重新開始須發出新 start 事件；interrupt／defused 事件都指向當時真實角色與時間。成功事件只發一次，bomb timer 照常推進。
- 完成與爆炸在同 tick 的優先順序需明確且決定性；保留 legacy 舊行為，不用改結果來滿足測試。

## 驗證與必要相容性

1. 新 helper 的獨立邊界及反例；測試輸入與預期行為不能只照抄實作公式。
2. 三張 Major 地圖／雙方角色的真 frame 因果與無穿牆、無瞬移、無非有限位置；情境未觸發需具名跳過或失敗，不能以空陣列 every() 冒充覆蓋。
3. 同 seed 完整輸出 hash 決定性；`cs_major_simulation_v1` 保留對正式基線 `1cf6472961528eeb3acfeb2558deadb4b425372d` 的 legacy 全 frame／player／roundHist／result 比對。
4. canonical 與 Worker 完整輸出一致、`cs_match_completion`，以及新增 frame 欄位的呈現相容性。
5. 走 scoped `tools/verify.mjs`，保存完整 stdout／stderr、原生 exit、runner checkpoint；新增 verifier 時同步 registry 的輸出形狀。不得放寬既有斷言。

歷史2026-10-08的NOT RUN狀態已由上述最新结果更新，舊證據保留。C2–C4真runtime正在執行，未完成的條件不借C1或B的PASS。

## C 階段設計契約與接點

玩家承諾：賽前選擇的戰術會讓隊伍真正移動、配合道具與包點目標，轉播呈現能回溯的因果。主要操作是選擇布局、觀察交戰並使用既有播放／重播控制；不新增直接操縱射擊。每回合由購買與路線決策、接觸／交叉掩護、安包／回防或保存槍枝構成。壓力來自時間、可見敵人與真實道具庫存，成功與失敗仍由canonical傷害與正式回合規則結算，不另算勝負或奖励。更好的布局能調整入口、側翼、道具時機與風險。保留原創三圖與同源導航，無新物理引擎或新增地圖。

- C1：先修致盲因果、道具庫存與單一拆彈者。只加小純helper與major限定接點，legacy整份輸出不變。
- C2：coordinator只接收可見對手及有來源／時間的隊友intel；過期即清。輸出route／anchor／aim／pace／utility intent，由既有safeMove、assignRoute及damage消費，不能直接寫位置或kill。低血撤退不得讀牆後全知敵人。
- C3：entry／lurk／rotate／fake／execute使用既有四階段戰術所有權。fake需先抵達假攻節點再轉真攻；lurk需獨立合法支路與有限資訊。意圖標籤本身不是驗收證據。
- C4：crossfire使用不同合法anchor；retake有實際到點；save有撤離路線與真存活保槍；clutch／trade記錄真1vN與時間窗。eco／force及武器決策讀當前stable team的分差，換邊不倒置。

每段保存決策→路線→位置→權威事件的具名案例與反例；情境未觸發不能以空陣列給PASS。每0.5秒fixed step仍是既有模擬唯一時間來源，新增時間欄位需明示秒／毫秒。經濟、路由、Store／Progress／MOBA維持既有範圍。全局Premium、觸控與真機品質不能用Node宣稱。

已讀技能reference ledger：`threejs-gameplay-systems/references/gameplay-workflows.md`、`game-design-level-design.md`、`physics-engine-selection.md`、`checklists/game-design-level-design.md`；均已載入。此輪沿既有deterministic 2D collider／LOS與導航，沒有安裝依賴、切換物理引擎或擴充Sprint。
