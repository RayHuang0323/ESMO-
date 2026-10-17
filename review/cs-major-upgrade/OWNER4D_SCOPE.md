# Owner4D：CS 目標紀律、牆面與受擊時序（紀錄；已交 Owner Review）

使用者 2026-10-15 追加五項：三圖全面牆面閃爍、C4 倒數／放置／掉包回收／時間壓力、受擊與倒地連續、真正找掩體、戰術更接近專業 CS。完成後更新 5183，停 Owner Review；不 push／deploy、不動 MOBA。

## 本輪行為契約

- 玩家觀看的是有計畫的攻防：開局控圖／取得資訊 → 分工推進／道具掩護 → 回收或安包 → 交叉守包／回防；時間與情報改變決策。
- 主軸：T 必須保有 C4 任務責任，掉包指定一位可達存活隊員回收，隊友保留交叉；安包消耗真進度並顯示真姿勢／進度／事件聲音。敵情或傷害可合理阻擋，不保證每局安包或獲勝。
- 壓力：以剩餘路程與安包預留時間提前投入；不等到固定最後秒數。CT 依情報與可達時間選擇回防／保槍。
- 選位：公開幾何及自身／TTL 隊伍情報；掩體必須遮住威脅方向，路線不穿牆、端點不與隊友預約重疊；空地不因 HOLD 就蹲下。
- 回饋：射擊依原射速／彈藥與事件時鐘；上半身受擊不停止腿步，死亡位置插值連續，按真 kill.roundSec 開始倒地，保留原 Death01 與身體接地。
- 地圖：既有三圖、碰撞／導航／門窗尺寸保留。一次性渲染表面裁切處理共面競爭，不用調深度偏移掩蓋。
- 本輪不新增模式、經濟規則、連線、外部美術或 MOBA 改動；不寫死戰果。

## 實際進度

■ 根因查核；■ 修正與 CPU／完整對局守門；▣ 最新 GPU；□ 最新 pristine／5183；□ Owner Review。

- 三圖 CPU 全垂直面競爭：Mirage 1709→0、Dust2 3828→0、Inferno 3004→0。這不是 GPU 視覺 PASS。
- 初輪三圖 contact 12/12；完整 tactical 30/34→32/34，已修復回收路線來源／瞄準來源混用及掩體重複預約。原 verifier 以三位小數 routePoints 重建導航有誤差，改真原始 route 後再定位產品 Major memo 的公分 alias；改精確且有界 memo 後完整34/34 PASS，原 .001 門檻保持。
- 動畫19/19、pose26/26、handling21/21、audio26/26 已有真結果；原始失敗與 baseline4f168947 對照均保留。新幀內死亡時鐘與導航反例整合13/13 PASS；真GPU三圖C4／死亡34/34。
- 原完整 fixture 大於 Node 單字串上限；後續只用逐frame串流讀取，不 JSON.parse 整份、不重跑舊局救分析。
- 5183 仍是 Owner4C source8692541d…／PID63640，不能當 Owner4D 驗收；新版diagnostic-owner4d-hud-20261015-1366已build，source fbc1591b…（112份），等待正式pristine。

## Verifier 校正紀錄（不得省略原紅燈）

1. 共面射線落在同一 mesh 的共邊可命中兩個 triangle；以兩個 mesh owner 判斷競爭，仍要求無缺口、有限UV／normal／color。
2. baseline4f 的 lifecycle12/19、pose17/26、audio步頻失敗已單獨保存。fixture 原為隱藏 rig 且沒有正式 terrain sampler，現按真載入完畢顯示並提供 sampler。
3. 接地讀真可見變形頂點，排除隱藏 bind AABB；syncAnchors 依 Owner4B 已實際採用的前後各一次。死亡收尾必等真 clip.duration，保留原精度並要求 paused；產品另加 settled 一次完整取樣後快取。
4. 原跑步 .05 固定相位改依真 GLB 步頻；比較 quaternion 前正規化，原角差1e-5不變。world-up 私有clip比對精確track值、action與mixer仍必須私有；資源測試先完成正式已存在的一次 held-item 初始化。
5. 受擊從全身 Hit_Chest 改原 clip 上半身遮罩，測試要求腿部持續。音訊 fixture 以真 roundSec 前進，腳步位置依原 GLB stride，新增真安包開始聲／導播／防重播，shape25→26。
6. 導航 oracle 用原始 route[0]，不以顯示用三位小數 routePoints[0] 重算；原 .001 守門不放寬。

## 技能與參考 ledger

已讀 threejs-debug-profiler：debug-profile-checklists、scene-debugging；debugging-and-error-recovery；threejs-gameplay-systems：gameplay-workflows、game-design-level-design、game-feel。目標／回復／壓力／訊號與可驗證反例如上；不新增物理引擎。

## 證據

`evidence/owner4d-review-20261015/`；完整 wrapper stdout／stderr／native 在 `evidence/authenticity-closure-20261012/owner4d-*20261015.*`。runner 完整各段 stdout＋stderr 已分批複製入 `*-child-logs/`，不只留尾端。

## 新 GPU 追加紀錄

三圖時序合併420樣本因16MiB預算為HARNESS_FAIL，產品0 fail；原證據保留，改逐圖隔離各15/15 PASS，不放寬預算。Mirage三近房間10/10，新36張移動裁圖及全景檢視未見共面雜色。新版HE／flash25/25 PASS；HE像素及交付流程進行中。首輪C4／死亡28/34：Major實際使用FpsSavedFrameHud未接進度，已修並重建；另plantRecord零基round observer修為audit一基，保持位置1e-6；新版34/34 PASS。


## 最終收件

最新完成狀態以 OWNER4D_CLOSURE.md、engineering-complete.json 與 RESUME_CHECKPOINT.md 最上節為準；本文保留實作中歷史與失敗原因。
