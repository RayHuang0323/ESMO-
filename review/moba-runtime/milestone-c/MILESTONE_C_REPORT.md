# Milestone C：MOBA Runtime 戰鬥可讀性與單位行為修正

日期：2026-07-29  
狀態：**本機完成，待人工／Android 真機驗收；未 push、未部署。**

## 1. 範圍與 rollback

- rollback 基準：`f66cfb0db5a3feed118c18df51ec4f51b28c1491`
- 主要實作 commit：`df3e053`（`Milestone C: improve MOBA combat readability and jungle behavior`）
- 正式 GameView legacy 入口、文件與證據：見本輪最終 commit。
- 回退方式：由新到舊執行 `git revert <commit>`；不可使用 `git reset --hard`。

本輪延伸既有 snapshot、Runtime Adapter、固定 FX pool 與 Replay presentation，不重寫
LogicEngine、不新增第二套戰鬥結果，也未修改地圖結構、經濟、天賦、獎勵或 Replay
contract。因塔的扣血時序、仇恨與野怪狀態原本只能由權威模擬產生，本輪有小範圍修改
受保護的 `LogicEngine.js`；v1／v2 舊規則維持原路徑。

## 2. 根因與修正

### 2.1 敵我辨識與英雄動作

- 移除英雄頭頂大型「藍方／紅方」文字。
- 保留不遮場的隊伍色腳下環、腰帶、血條旁菱形隊標與 3px 名牌色邊。
- 十名英雄繼續使用 `hero-visual.v2` 的獨立主色、比例、頭部、背部、武器與輪廓；
  stable hero id 與 100+ deterministic fallback 不變。
- cast/release 事件驅動武器、肩部與飾件前搖／後搖；hit 事件加入短暫抖動及 emissive
  閃光。Live 與 Replay 都讀既有 FX event，不另造結果。

### 2.2 塔攻擊

根因是舊呈現以每 tick HP 差和隨機展示事件推測塔攻擊；實際塔傷是連續扣血，視覺
可能出現沒有對應傷害的「音波」，也沒有穩定 source／target。

- v3 改為每 `0.5 sim-s` 一發、每發對小兵 `60 HP` 的離散單體攻擊；240 HP 小兵
  依序顯示 `180 → 120 → 60 → 0`，總 DPS 與舊版 120/s 相同。
- 傷害與 `tower:basic` 彈體由同一事件產生，包含固定 sourceId／targetId；
  呈現為塔冠蓄能、弧線追蹤彈、短尾跡與小型命中爆點，不使用全長 beam／同心音波。
- 目標有效時維持鎖定；預設優先塔下敵方小兵。敵方英雄在塔區攻擊守方英雄時，
  進入 3 秒 threat，下一次有效選擇優先該英雄。
- 塔對英雄仍保留既有 1 HP clamp，不新增塔殺，也不改 KDA／勝負契約。
- 為避免主 RNG 取樣序列因刪除舊展示判斷而位移，保留等量 RNG 消耗，但不再用它決定
  是否發射視覺彈體。

### 2.3 小兵接塔與血條

- Adapter 的隊形偏移若碰到塔／牆，不再整幀跳回 lane center；改以
  `1 → .65 → .35 → 0` 逐級收斂後投影至可走區，消除塔邊穿模與左右抖動。
- 沿用 B-fix 的 camera-facing 黑底槽、連續 HP fill、`depthTest=false` 與固定
  renderOrder；小兵塔下仍能清楚看見多次扣血。

### 2.4 野怪行為

根因是 camp 只有靜態 HP 目標，位置又有 renderer-only offset；引擎座標與地圖 Buff
剪影相差約 17.1 sim-unit。

- 六個正式營地統一使用 snapshot／`gameData.CAMPS` 座標；藍紅 Buff 為
  `(76,171)`／`(144,49)`，移除隱性展示 offset。
- 營地新增 deterministic 小範圍巡遊、5.5 索敵、2.4 追擊、2.35 攻擊距離、
  1.35 秒攻擊、7.5 leash 與 3.4 回營速度。
- 野怪離散攻擊會造成真实 4 HP 步進並產生 `monsterClaw` 斬擊／命中事件；
  超出 leash 後回營並補滿、清除 target／ownership。
- 新增固定幾何／材質的低模 Runtime camp renderer：Buff 使用角、核心與重型輪廓，
  普通營地顯示群體成員；含相機朝向血條、受擊抖動、攻擊前撲與回營環。

### 2.5 正式 GameView

- 正式 `GameView` 固定掛載 `MobaRuntimeView3D`。
- 移除「地圖 新版／舊版」按鈕、legacy renderer 分支與其頂層匯入；也移除與 Timeline
  重疊的常駐「回到中心」鈕。自由鏡頭仍保留既有「回到導播」與雙擊回導播操作。
- 底層 legacy 檔案沒有刪除，避免影響其他相容／除錯用途；正式玩家流程已無法誤觸。

## 3. 修改檔案

主要實作：

- `src/LogicEngine.js`
- `src/gameData.js`
- `src/battle/moba/matchProgression.js`
- `src/battle/moba/map/mapCampLayout.js`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/map/MobaMapBlockout.jsx`
- `src/battle/moba/map/MobaRuntimeMap.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeNeutrals.jsx`（新增）
- `src/GameView.jsx`

驗證與文件：

- `tools/check_moba_milestone_c.mjs`（新增）
- `tools/check_moba_milestone_b1.mjs`
- `tools/check_moba_milestone_b_fix.mjs`
- `tools/check_moba_pacing29b1.mjs`
- `docs/handoff/05_Sprint紀錄.md`
- `review/moba-runtime/milestone-c/MILESTONE_C_REPORT.md`
- `review/moba-runtime/milestone-c/gameview-desktop-1440x900.png`
- `review/moba-runtime/milestone-c/gameview-mobile-390x844.png`

B.1／B-fix 舊 verifier 原本硬性要求「藍方／紅方」文字，與本輪明確需求衝突，因此改為
驗證小型色帶／底圈／血條隊標存在且大型文字不存在；沒有刪除英雄辨識要求。pacing
verifier 改以 camp `homePos` 對照 CAMPS，允許權威 snapshot 的動態 camp pos。

## 4. 驗證

- `node tools/check_moba_milestone_c.mjs`：PASS。塔四次 HP step／四個同源彈體、
  sticky target、champion threat 優先、camp idle→aggro→attack→leash reset、
  Buff 座標、塔邊小兵相鄰幀位移 `0.769`、自然隊標與正式 runtime-v2-only 均有斷言。
- `npm run build`：PASS（2595 modules；僅既有 chunk-size warning）。
- `npm run check:mobamap`：PASS，3553/0。
- H.2 navigation／collision：PASS，14/0。
- B.1、B.2、B.3、B.4、B-fix：全部 PASS。
- `regress`：PASS，15/15；平均 23.5 分、32.4 kills。
- `regress2`：PASS，8/8；20/20 完賽、藍 12／紅 8、median 22.8 分。
- pacing：PASS，25/25；presentation：12/12；controls：18/18；
  camera/replay：16/16。
- 完整 `runtime29`：exit 1，**43/44**。唯一失敗為既有 v2 正／反序 40-seed
  抽樣仍為 55%／35%，位移 20pp > 15pp；Sprint23–28、regress 15/15、
  regress2 與 production build 均 exit 0。這是 H.3 已記錄的同一個 v2 順序敏感紅燈；
  本輪 v3 塔／營地改動未改 v2 分支，也未放寬門檻。
- `git diff --check`：最終 commit 前重跑。

第一次在 dev server 同時運作時執行 build 遇到一次 Node heap allocation OOM；Node
本身 heap limit 正常，停止畫面取證後以明確 `--max-old-space-size=1536` 重跑即 PASS，
不是 JSX／Rollup 編譯錯誤。

## 5. 正式 GameView 視覺證據

- 桌機 1440×900：
  `review/moba-runtime/milestone-c/gameview-desktop-1440x900.png`
- 手機 viewport 390×844：
  `review/moba-runtime/milestone-c/gameview-mobile-390x844.png`

兩張皆來自正式 Draft → Tactic → GameView 流程，不是元件 harness。桌機畫面在 1×
正式模擬可見紅／藍小型隊標、英雄主色、塔鎖定圈、雙方小兵及連續血條；手機畫面
沒有水平溢出，Timeline 與隊伍面板維持收合，舊地圖入口不再存在。

## 6. 已知限制與待人工確認

- 截圖只能證明單一瞬間；塔追蹤彈的弧線、野怪巡遊／回營、英雄前搖／受擊抖動、
  十名英雄逐一近景仍需在 1× 動態畫面人工看完整循環。
- 10 名英雄是 ESMO 自有程序式低模 recipe，已對齊選角圖案的色彩／motif，但不是
  逐一完整 GLB 角色模型；若要更接近選角立繪，下一步應走自有角色模型與 LOD 管線，
  不能直接貼用受保護素材。
- Replay contract 未變；Live snapshot 支援 camp 動態欄位。既有 compact Replay
  沒有保存 camp 每幀追擊位置，重播仍以 metadata／home 位置顯示營地，這是向後相容
  限制，不會重跑引擎。
- 390×844 是桌面瀏覽器 viewport，不是 Android 真機。Android WebGL driver、
  H.2 閃爍、FPS、熱降頻、觸控、safe area 與長場 Replay 仍須人工驗收，不宣稱通過。
- 未 push、未部署；沒有納入既有 bug 影片、terrain preview、backup、blend／glb、
  舊地圖截圖或 log。
