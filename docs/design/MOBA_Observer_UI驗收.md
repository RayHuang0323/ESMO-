# MOBA Observer HUD — 2026-09-13 本地驗收候選

## 範圍與狀態

在 `art/moba-rift-esmo-v1` / `692ee77` 上小步整合，並非根目錄舊的 finance 工作樹。不改 LogicEngine、match rules、pacing、fairness、Store schema、reward、Replay capture contract。沒有導入官方 LoL 素材；沒有重做 330×330 地圖或 neutral GLB。

目前是**可跑的本地候選，不是全部需求結案**。本機開發站 `http://localhost:5187/ESMO-/`。

## HUD

- 中央 scoreboard／time／team gold；desktop 雙側十席英雄狀態與選中英雄底座。
- HP、XP、等級、KDA、金錢、Buff、召喚師 CD 讀 snapshot；擊殺列讀 battleStore.events。
- P/Q/W/E/R 是英雄資料庫技能說明，不冒充模擬個別技能。裝備／魔力沒有資料，明示未提供。
- 手機隊伍按鈕打開可捲動抽屜，關閉鈕頂部固定；詳情高於控制列與 WebGL Html labels。
- 小地圖可點／拖曳／方向鍵移鏡頭，透過既有 cameraStore，沒有另一套相機狀態。
- Replay 英雄 panel 只讀保存的 replay source；原有 seek／rate／事件跳转保留，未加 capture 欄位。

## 新增 VFX 定義

| 效果 | 來源／觸發 | 持續與上限 | 意義與 reduced motion |
|---|---|---|---|
| 野怪接觸提示 | 既有 pose Attack / Hit | Attack 1s、Hit 10/24s；每隻至多一個預配置 ring | 攻擊／受擊，不代表 AoE；減少動態時固定大小 |
| 野怪重心 | 真 attackAt 取樣 | 攻擊前 0.45s 的局部垂直位移 | 不移動 entity world；減少動態關閉 |
| 目標名稱／血條 | alive、targetId、hpRatio | 固定一套／實體；滿血閒置普通營地不顯示血條 | 攻擊中文字、面向鏡頭；無預測數字 |
| 塔目標菱形 | 既有 tower FX targetId | 真 cast/travel phases；既有 LOCK_CAP 48 | 這發塔彈打誰；固定不旋轉，不畫虛構全範圍危險圈 |
| 塔冠蓄能 | tower FX sourceId/phaseProgress | cast 期；每塔一個既有 crown | 出手辨識；減少動態關閉抬升／縮放 |

物件隨 renderer 卸載釋放；不建立持續增長的粒子陣列。新增動作尚未完成 browser 動態驗收，不能據 Node 測試宣稱 FPS 或視覺品質合格。

## 真實畫面

經正式 Dashboard → MOBA 陣容 → 配對 → Ban/Pick → 戰術 → Loading → Battle 流程，非靜態 UI mock。

![桌機實戰](../../review/battle-observer-ui/desktop-1366.jpg)

![390px實戰](../../review/battle-observer-ui/mobile-390.jpg)

![手機隊伍面板](../../review/battle-observer-ui/mobile-team.jpg)

另有 `mobile-320.jpg`。320/360/390/430 瀏覽器 viewport scrollWidth 等於視窗寬度；未經 Android/iOS 真機、觸控手勢、FPS、長時間散熱驗收。截圖先於最後一批 VFX，不作 VFX 完成證據。

## 驗證

- `node tools/verify.mjs --only=runtime29,regress,regress2,build`：新增 VFX 後最終 4/4 PASS（regress 46s、regress2 44s、runtime29 109s、build 22s，exit 0）。快照保存於 `review/battle-observer-ui/logs/final-gates.json`；其中其他 87 段是歷史結果，不屬本輪驗證。
- 新 HUD SSR 8/8：十席、真 HP、五技能說明、缺口、唯讀、空資料、Replay source／不啟動結算。
- focused presentation 12/12、controls 18/18、pacing 25/25、neutral rigs 14/14、rift 與 flow/dashboard 亦已執行；最終重跑完整輸出保存在 `review/battle-observer-ui/logs/`。
- 現役 runtime29 runner 使用既有 flat 規則及歷史例外，不能等同全專案 91 項全部通過。
- 未刪或放寬既有 verifier。scratch runners／logs 不應 commit。

## 未完成／衝突

1. 石甲蟲原位修復：目前 `(151,248)/(179,82)`；試回 `(151,229)/(179,101)` 會改變真導航與接戰，regress 13/15、regress2 7/8。已撤回，不以模型單獨平移掩蓋。需另行確認允許的行為影響再繼續處理。
2. Replay confirm 阻塞已解除。完成的瀏覽器操作與仍有的缺口見下節，不再要求快速完成確認。
3. 新 VFX 的動態、低畫質、重疊與 reduced-motion 人工验收未完成。
4. 不宣稱已達頂級商業 MOBA 的最终美術標準；目前技能 glyph 仍是原創幾何符號，沒有虛構技能功能。

未 commit、未 push、未部署；保留本地候選供後續驗收。

## 續驗：3D Replay（2026-09-13）

- 使用者按 OK 後，5188 獨立本機場次完成於 25:10（紅方 17:8）；實際賽後 3D 重播確認 0:00、12:00 seek、±10s、事件跳轉與 Nacht 選取。舊 5187 開發中混合版本錄影正確退回 2D，不冒充相容的 3D。
- 最後補上 Replay 缺少召喚師冷卻時「未保存」提示（僅 metadata 可用時顯示技能名稱），未變更錄影契約。SSR 再跑 8/8、build exit 0（17s）。此開發更新造成 debug 場景重載；不再觸發原生快速完成確認。
- 補充使用 `replay-viewer.html` 與真 LogicEngine seed 42 錄影驗收：516 frames、87 events、21:25，通過原 canUse3DPresentation，不是假 snapshot。驗證 4× 播放時間前進、暫停、手機隊伍抽屜／選角／詳情關閉，以及同份錄影關閉再開。此獨立頁的「返回 Result」只驗證 onClose 回呼，不能當作正式 Result 路由或發獎驗證。
- 320/360/390/430 重播頁 scrollWidth 各等於 viewport width；console error 為空。未經手機真機。
- 以下新圖來自上述固定真引擎錄影的實際 3D renderer，不是 25:10 場次，也不是示意圖。

![桌機3D重播](../../review/battle-observer-ui/replay-desktop-final.jpg)

![手機3D重播](../../review/battle-observer-ui/replay-mobile.jpg)

- 仍需改善：舊 Replay 事件文字保留 B2 / camp_red_buff 等原始名稱；未完整驗證重播事件文字呈現。錄影未保存 neutral attackAt/hitAt，不能重現所有野怪攻擊骨架時序；本輪不擴充契約。野怪／塔 VFX 動態、低畫質與 reduced-motion 仍未完整人工驗收。
- `review/` 錄影／獨立驗收頁與 `_scratch_*` 都是本機驗收產物，不應隨產品提交。

## 最後收尾驗收（2026-09-13；以下更新前述待辦狀態）

### 動態

正式流程以 1× 查看實戰，並補充同一 renderer 對真引擎完整快照片段的連續影格。診斷 viewer 明示「不是產品 Replay」；資料由未修改的 LogicEngine seed42、固定 .5 tick 擷取，沒有人工設 HP、攻擊或死亡。診斷片段慢放為每真實秒一模擬秒，與正式 1× 分開標記。

| 真快照片段 | 模擬時間 | 檢查 |
|---|---:|---|
| 野怪 Hit / Attack | 35 / 35.5 | 小怪受擊姿態、反擊及接觸提示，無位置補償 |
| 野怪 Death | 35–38 | 藍 Buff 主體倒下，死亡窗口後消失，存活小怪仍在 |
| 巨龍 Attack / Hit | 241.5 | 頭／翅姿態、受擊疊加；HP 取真 snapshot |
| 巨龍 Death | 329.5–332.5 | 倒下 → 清除，開始重生文字 |
| 巴龍 Attack / Hit | 498.5 | 身軀／頭部攻擊姿態，受擊疊加 |
| 巴龍 Death | 631.5–634.5 | 死亡姿態 → 清除，血條消失 |
| 塔攻擊 | 179.5–182.5 | 塔冠光點蓄能、隊色目標框、炮彈移動、命中及清除 |

連續影格：`review/battle-observer-ui/dynamic-final/`。野怪 death-00/07/14、dragon-death-05/16、baron-death-05/16 等有人工檢視，不以事件計數代替影格。正式 1× 額外保存 neutral-* / formal-tower-*；後者採樣時有塔已被摧毀，不能當成完整三階段證據。完整塔三階段以真快照片段的 tower-final-* 為準。

逐格發現塔目標標記太小／實際渲染太暗：改用既有固定塔隊色材質與獨立 pool（每隊 48，卸載隨既有 geometry/material 清理），半徑 2.2S，僅真 cast／travel；不影響其他技能 lock、目標或命中計算。正常品質動態已檢查；手機低畫質查看同場交戰。reduced-motion 系統切換、Android/iOS 真機與長時間散熱仍未實測。

### Replay 名称與 UI

`replayDisplayText.js` 為純顯示 formatter：playersMeta.playerName 優先；缺名字為「藍方第 2 席」，不補假選手。營地 ID 轉可讀名稱；塔事件以已保存 data.lane/tier/victimSide 命名，沒有改原事件。新 verifier `check_replay_display_text.mjs` 18 PASS / 0 FAIL（exit 0）。

瀏覽器已確認「紅方下路 1 塔 被摧毀」「Nacht 使用懲戒（藍 Buff）」「Ember 使用閃現（逃生）」；證據 final-replay-clean.jpg。SSR HUD 8 PASS / 0 FAIL（exit 0）。

![正式桌機](../../review/battle-observer-ui/final-desktop.jpg)

![正式390px低畫質](../../review/battle-observer-ui/final-mobile-390.jpg)

Desktop 1366×768 高畫質／Mobile 390×844 低畫質，390px scrollWidth=390。手機隊伍抽屜、關閉、英雄詳情、畫質設定可操作；原分頁的 viewport override 才生效，已明確讀回確認，不拿另一分頁尺寸當通過。正式場次透過 Dashboard 暫停／返回接續，無清除 localStorage。已抽查的正式／獨立重播／動態診斷 console errors=[]。

### 仍阻斷 commit：塔旁石甲蟲

使用者最後追加修復要求已重現。真實出生中心 (151,248)，最近下路塔 (157.8858,249.4918)，距離 7.0456；紅方鏡像相同。圖像、snapshot、renderer 座標一致，並非 renderer 漂移。前次恢復舊座標的試驗造成 regress/regress2 失敗，故未重做相同修改，也沒有只移動模型造成第二套位置。本次地圖幾何、gameData、LogicEngine、pacing、fairness、contracts diff 均空。此項未解，不能宣稱全部無阻斷，暫不建立候選 commit；無 push / deploy。

### 最終 gate 固定版本結果

最後的固定队色鎖定 pool 修改後，重新完整執行 `node tools/verify.mjs --only=runtime29,regress,regress2,build`，exit 0、4/4 PASS：regress 15/15（34s）、regress2 8/8（41s）、runtime29 flat 35/35（127s）、build（27s）。runtime29 沿用 runner 的既有委派與 TD-21 規則，不等於全專案 91 段全部通過。新增 Replay 名稱 18/18、HUD SSR 8/8 亦 exit 0。

本次正式場次自然完成於 22:52。因先暫停再跨分頁恢復，這份中途重新擷取的錄影在正式賽後走 2D fallback；已看到時間軸從 0 起但首份狀態是恢復後的資料，不能當成完整 0:00 錄影。此為此次觀察到的恢復錄影限制，當時尚未追查根因，不能宣稱已修好。未改相容判定或補造前半段。正式錄影事件仍確認為「Pyre 擊殺 Nacht（助攻 Scoria,Ember）」「巴龍 被紅方擊殺」。完整的固定錄影 3D 檢查與此份中途錄影分開記錄。

## 使用者授權營地修復後的追加驗收

使用者明確允許只修正石甲蟲及其鏡像真實座標，重新驗證 pacing/fairness；未授權改動參數或地圖幾何。查出 `buildDesignTerrainShapes` 原本直接以可移動營地生成岩壁，改 CAMPS 會讓 runtime collision 偏離已烘焙 GLB。這是先前位置試驗的隱性幾何副作用。

修正方式：`RIFT_BAKED_CLEARINGS` 保存兩個既有地形生成 landmark（220 設計座標，不是第二套目標出生點）。只供地形生成；`T.camps`、meta、怪物與所有 gameplay 仍讀 `gameData.CAMPS`。新增 `check_krug_camp_clearance.mjs` 驗證塔／路／營地淨空、鏡像、可達、引擎與呈現同源，並斷言搬營地不改 wallItems / groundLayers。`check_esmo_rift_v1` 14/14 確認源檔岩壁逐項相同；未重新產生 GLB、改路線、塔位或戰鬥參數。

部分錄影 UI：`replayBuffer` 本來就只在分頁記憶體保存，`useLocalServer` 續局重建至保存時間後才讓 feed 擷取；因此跨載入的前段缺失是既有生命週期限制。UI 改為從 `frames[0].t` 開始、seek 不可越過起點，缺前段時明示「錄影自 … 開始，前段未保存」。只修顯示，不補造 frame、不改相容性或 capture 契約。名稱與起點 formatter 檢查現為 22/22；390px 實際缺前段 fixture 確認起點 952.5、畫面文字 15:52、scrollWidth=390。fixture 只刪去已錄影的前段來重現資料缺口，並非產品資料來源。

候選位置仍需同時通過所有 gates；不得把不同位置的各次 PASS 拼成最終 PASS。中間失敗紀錄保留於本機 logs，不提交。最終結果另列下方。

### 最後保留的磁碟版本與阻斷

位置 `(153,228)/(177,102)`，距最近塔 22.04、距兵線 21.09，距其他營地皆 ≥20。6 往返可達、3 鏡像對路徑長一致。最終主 runner 4/4 exit0：regress15/15、regress2 8/8、runtime29 flat35/35、build；補充 observer8、presentation12、controls18、flow09、dash10、Rift14、neutrals、nav14、Replay display22 均通過。runtime29 保留既有委派與 TD-21 設定，不宣稱全專案 91 段通過。

**FINAL_GATE=BLOCKED**：pacing29b1 24/25、exit1。40 場 15 分鐘擊殺 p50=6（要求 ≥7）；其餘24項含順序公平性通過（正序藍勝23/40、反序18/40，差12.5pp≤15）。只搬營地仍可能影響接戰位置；不得為了通過而修改 pacing 或門檻。本輪沒有符合全部無阻斷的候選，未 commit／push／deploy。

實際瀏覽器證據：兩側 `krug-blue-fixed.jpg` / `krug-red-fixed.jpg` 已在野區、非塔旁；最終 Replay 390×844 與1366×768 截圖及隊伍抽屜完整擷取，scrollWidth 分別390/1366，`krug-final-console.json` errors=[]。前一輪動態連續影格驗證仍有效，動畫/VFX程式沒有再改；本輪另複查塔鎖框、蓄能與飛行。真機與 reduced-motion 系統設定未實測。

## 使用者要求撤回石甲蟲位置修改後的最終 gate

依使用者要求，撤回 `(153,228)/(177,102)` 試驗，`gameData.CAMPS` 恢復 `(151,248)/(179,82)`；原始中心距下路塔 7.05 列為已知限制，本輪不再修正。移除 `RIFT_BAKED_CLEARINGS` 與 terrain 接線，確保地圖／碰撞幾何回到候選前狀態。UI／Replay／動態野怪／塔特效本輪變更均保留。

最終結果：pacing29b1 25/25（15 分鐘擊殺 p50=7；順序公平性 3pp）、nav_h2 14/14；`verify --only=runtime29,regress,regress2,build` exit 0、4/4（runtime29 flat 35/35）；presentation 12/12、controls 18/18、flow09、dash10、observer SSR 8/8、Replay display 22/22、Rift 14/14、neutral rigs 均通過。瀏覽器 Desktop／390px Replay 及 console errors=[] 複查完成。符合候選條件，已建立本地 commit；不 push／deploy。

## Release Gate 例外紀錄（2026-09-13）

### BASELINE_KNOWN_FAILURE：`presentation29b2` §2 camp HP

### Supplemental baseline：`check_esmo_rift_v1` §13

乾淨 `origin/main=dc8941611e600403505026e95f3c65914a4f60f4` 與整合版 `94eb62b49907dbf02409e7be41b10e553a717a03` 均為 exit 1、`13 PASS / 1 FAIL`；唯一失敗均為 `Blender source exactly follows runtime nav walls`，差異同為既有 camp-wall／rock source 幾何未與目前 runtime nav walls 完全相等。此腳本未收錄於正式 MOBA Battle UI runner，故列為 supplemental baseline debt；本輪不修改地形、營地、Battle 規則或 verifier。

以相同 `SKIP_NESTED=1` 指令重跑：乾淨 `origin/main=dc8941611e600403505026e95f3c65914a4f60f4` 與整合 commit `94eb62b49907dbf02409e7be41b10e553a717a03` 的結果完全一致：exit 1、`11/12`，唯一失敗為「6 座營地、2 座觀測到連續掉血」，斷言要求 `total === 6 && ok >= 4`。

這是既有 baseline verifier debt，不是 `94eb62b` 造成；本輪不修改 camp HP、Battle 規則、`gameData` 或 `presentation29b2` verifier。其餘正式 Gate 維持獨立驗證與完整輸出，不以放寬斷言掩蓋此例外。
