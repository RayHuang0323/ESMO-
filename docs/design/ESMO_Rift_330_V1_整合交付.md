# ESMO Rift 330 V1 — 本機整合候選

本輪由使用者授權 Blender MCP 重製 MOBA 地圖，並確認地圖必須至少擴大 1.2 倍，優先 1.5 倍。實作位於 `art/moba-rift-esmo-v1`；baseline 為已發布的 `53bc02d0e57cbf6566665a1799bd4256195d71b9`。**未整合 main、未 commit、未 push、未 deploy。**

## 尺寸與玩法邊界

- 邏輯邊界從 220×220 擴為 **330×330**，線性 1.5 倍、面積 2.25 倍。`WORLD_SCALE=1.7` 保持不變；渲染世界為 561×561。
- 三路、河道、基地、泉水、營地、草叢、坑位、侵入點與牆體同步換算。原有 180° 雙方對稱保留。
- 以同一地形縮回設計尺寸作對照，固定英雄半徑下，可走格點為 34,481 → 81,243（約 2.356 倍）。這是靜態場取樣，不是新增營地數或戰術勝率的證明。
- 英雄移速、傷害、射程、波次、野怪刷新、勝負、獎勵、世界時間等規則沒有修改。擴圖確實會增加行軍時間，因此需要重新評估整場節奏。
- 塔的碰撞半徑／實體尺寸不隨地圖放大。初版連塔半徑放大會讓部分英雄站在攻擊範圍外；已修正，seed 4242 同樣本於 1792 秒正常終局。
- 地形有岩壁、森林、基地台座的視覺高低差；可行走地面維持既有單一高度，沒有新增高低地戰鬥規則。

## Blender 資產與整合

- `art/moba-rift/build_rift.py`：透過 Blender MCP 執行；建立獨立 `ESMO_Rift_330_v1` 場景，保留原有角色場景。可重現的原創網格與程序化地表貼圖，沒有下載或複製官方遊戲素材。
- `art/moba-rift/esmo-rift.blend`：可繼續編修的 Blender 場景。
- `art/moba-rift/source.json`：由 `tools/export_esmo_rift_source.mjs` 從本專案地圖資料匯出；不是第二套戰鬥真相來源。
- `public/assets/moba/rift-v1/esmo-rift.glb`：正式 runtime 載入資產；103 個分區網格、142,256 三角形、約 11.3 MiB。內嵌原創貼圖，無外部貼圖請求或 decoder CDN。
- `rift-albedo.png` 同時供小地圖使用；`rift-preview.png` 是 Blender 預覽，**不能替代 GameView 的 browser smoke**。
- 草地、三路石板、河道、坑口、岩壁森林、真實草叢、營地標記、基地與主堡台座已重製。地形沿用現有通路拓樸作為擴大後的碰撞／連通性基礎。
- 塔的生死、HP、水晶、英雄、小兵及野怪仍由原有 runtime snapshot 呈現；GLB 不放第二套可攻擊物件。沒有把佈景營地冒充成可打的新營地。
- 靜態環境由 `EsmoRiftEnvironment.jsx` 載入。下載中或載入失敗會回到同尺寸的既有 map renderer；低畫質隱藏樹冠／樹幹，保留草叢與戰鬥資訊。
- 相機改為真正的 OrthographicCamera，固定 52° 俯角與朝向；保留單一 cameraStore、平移、縮放與導播。像素拖曳換算依正交視錐，移除野怪 HTML 標籤的透視 distanceFactor。

## 驗證記錄

- `npm run build`：PASS（另有既有 bundle size warning）。最後交付時需以最終 diff 重跑。
- `check_moba_nav_h2`：14 PASS / 0 FAIL；20 航段雙方皆可達，鏡像路徑長最大差 0.00。
- `check_esmo_rift_v1`：擴圖、可走空間、GLB 來源／預算、nav wall 同源、塔半徑、replay 尺寸相容門檻。
- `check_moba_controls29b3`，`SKIP_NESTED=1`：18/18，含自然終局、回城、結果冪等、重播不重模擬、camera 不影響結果。這是 focused 子項，不當成完整巢狀 gate。
- `check_moba_presentation29b2`，`SKIP_NESTED=1`：11/12。唯一紅點是 Timeline 仍以舊 `useState(() => isMobile)`／`fold && latest` 字串判斷；主幹已使用 `useState(loadTimelineMode)`。`BattleTimeline.jsx` 與 baseline 無 diff，本輪未改 verifier。
- `check_moba_map`：無法啟動；引用的 `tools/lib/baseSymmetryRaster.mjs` 不在已發布 origin/main。沒有讀取其他 AI 未發布 worktree 來補件，也沒有刪掉該 import 或斷言。
- `pacing29b1`（`SKIP_NESTED=1`）：21/25，exit 1。紅點為擊殺節奏分布、v2 檢定力、首殺時間及陣列順序勝率；首殺 p50=570s、15 分擊殺 p50=3、時長 p50=29.8 分；正序藍勝 11/40、反序 20/40。**不能宣稱擴圖無節奏／公平性風險**。已啟動同一已發布 baseline 的對照，未修改門檻或戰鬥規則。
- baseline `pacing29b1` focused：25/25，exit 0；首殺 p50=399s、15 分擊殺 p50=8、時長 p50=22.9 分，正序／反序 21/40 vs 20/40。因此候選 pacing 四個紅點確認是本次擴圖的新增回歸。正在獨立 process 診斷 1.2 倍方案；未改目前 330 資產、正式程式或 verifier 門檻。
- `runtime29`：依既有 `tools/verify.mjs` K0 文件改採 flat 分段，避免 63 子行程重複 fan-out；先前兩份完整巢狀行程已中止，不計通過。候選執行 tactic24/cs23/progress25/experience26/talent27/stats28/regress/regress2/runtime29/build；baseline 對照 regress/regress2/runtime29。baseline regress 與 regress2 已 PASS，其餘待結果。
- Chrome 正式流程：Dashboard → MOBA → Lineup → Matchmaking → BanPick → Tactic → Loading → GameView 已走通。已在 1440px 與 390px 觀察新地圖及真實動態對戰，console error log 為空。實體 Android 尚未測試。
- 320/360/390/430px 的 document scrollWidth 均等於 viewport 寬度；430px 實際對戰畫面持續更新，console error log 為空。此項不包含真機觸控或效能認證。

## Online / replay 影響

維持 `CAREER_OWNS_ROSTER / ONLINE_OWNS_MATCH`，不修改 `MatchEntryRequest.v1`、`SquadSnapshot.v1` 或 `ChallengeInstance.v1`，也沒有新增 matchmaking、rating、pricing authority。

**相同 seed 在不同地圖尺寸／nav 幾何下不保證同一結果。** 未來 Online owner 必須把 map version、bounds、lanes、landmarks、collision geometry 與 navigation projection 行為納入 simulationVersion／凍結輸入考量。本輪只記錄影響，不自行改 Online contract 或以 roster hash 派生 seed。

新 replay 由既有 `replayBuffer` 自動保存當局 330 bounds／lanes／river。220／100 的舊 replay 透過既有 `canUse3DPresentation` 尺寸檢查，使用其當局 mapMeta 的 2D fallback；不縮放已存 frame、不重跑引擎、不刪存檔。舊 replay 的 3D 模式不再適用於新地圖，這是交付限制。

## 待 Owner 驗收與整合限制

- 參照三路、對角基地、河道／野區與雙坑的結構語彙；**未把「80% 相似」當成已有客觀量測或美術 PASS**。寫實程度、森林密度與地圖風格仍需 Owner 視覺驗收。
- 手機 browser emulation 不能證明真機 FPS、熱節流、pinch、拖曳手感、長時間 WebGL 穩定。
- 原有核心只有六個可互動小營地；沒有為美術需求擴寫戰鬥系統或增加虛假的可打野怪。
- static GLB 改動後必須重新匯出 source／資產並跑同源檢查；renderer 不得單獨位移阻擋牆體。
- 整合前補齊 map verifier 的已發布依賴、檢視所有整場門檻與節奏結果，並在最新 main 做 semantic integration。不得將本候選直接當成已正式發布地圖。

## Owner 幾何方向修正（2026-09-08，優先於前述等比候選）

Owner 明確要求保留 300～330 世界，禁止退回小圖或將 fairness 紅點當成已知風險交付。後续必須重新配置幾何，保留有效對線距離，將擴展空間分配給野區／側翼／通道；不提高全域速度，不改 Battle 核心、傷害、AI、經濟或結果流。pacing 與順序公平性先通過，再跑完整驗證。

- 1.2 倍等比方案只有獨立 process 診斷，23/25：首殺 p50=476s、15 分擊殺 p50=4，仍未達門檻；未覆蓋 330 資產，依 Owner 指示不採用。
- 第一份 330 非等比幾何診斷保留三路已驗證弧長：top/bot 309.36658、mid 226.27417。核心錨點置中到 330，地形寬度／周邊獨立擴展。
- 此方案 nav 14/14；實際 published baseline 可走格點 34,481，候選 85,987（不是把舊地圖圖片放大）。pacing／fairness 仍在診斷，未採用為正式程式。
- 被取代的等比 330 full 分段檢查已停止：tactic24 與 experience26 在各自 cap 內未終局，cs23/progress25/talent27 PASS，其餘未完成。這份結果不能用作新幾何的完整驗證。
- Published baseline 的 regress/regress2/runtime29 flat 對照 3/3 PASS；順序公平性不得再歸類為 baseline 問題。

### 已採用的非等比幾何：esmo-rift-330-core-v2

核心保留原版尺度，平移到新世界中心；外圍石怪營地與活動區獨立配置。最終 quarry 診斷 pacing 25/25，首殺 p50 395s、時長 p50 23.0min、正反序藍胜 16/40 vs 17/40。正式程式 source 與診斷成功版本逐欄一致；無提高全域速度或修改 LogicEngine。

六營地往返皆可達、鏡像路線等長。可走格點 88,361（published 34,481）。Blender MCP 重匯 97 meshes / 167,748 triangles / 13,439,928 bytes；導航岩壁頂點違規 0（100,984 頂點），asset gate 13/13。模型和 minimap cache revision 同步為 330-core-v2。

Replay 相容性同時比對既存 bounds 與 lanes，防止同尺寸舊布局套入新環境；舊 frame 不變。presentation focused 12/12、controls 18/18、flow09/dash10 PASS。Timeline 舊 verifier 修正理由詳見 Sprint 新節。

正式 pacing、完整 flat gates 與最終 browser smoke 尚在進行，不能以 focused 成果宣稱完整驗證／發布。野怪 rig 工作仍須在地圖驗證完成後接續。

## MOBA Rift 330 瀏覽器與野怪整合完成（2026-09-08，候選未發布）

本節更新先前「browser 未完成／rig 未製作」狀態，不改寫既有 Sprint 歷史。330330 corridor-v3 的 pacing／fairness／navigation PASS 保留；本輪未改幾何、移速或 Battle 規則。

已完成正式 Battle 自然結束、Result／3D Replay 控制與末幀比分核對、桌面與手機尺寸呈現驗收；修正 Replay 被 Result 捲動容器裁切與頂部關閉操作。Blender MCP 已製作 Dragon、Baron、紅／藍 Buff、狼、石甲蟲六種原創骨架 GLB，含 Idle／Move／Attack／Hit／Death，接實際 snapshot/event，不新增戰鬥狀態。新模型實戰 25:39、8:18，Replay 末幀一致，console errors 0。

新增 rig gate 14/14、focused presentation 12/12、controls 18/18、camp 6 出＋6 回與 3 鏡像對、最終 build 均 PASS。既有 foundation 10/10 PASS 證據保留。新增 consumer 僅處理呈現；LogicEngine／Store／router／結果與 Online contracts 未改。

仍需誠實保留：舊 Replay 無完整野怪攻擊／受擊時間，不偽造缺失動作；真機 Android FPS／觸控未測，瀏覽器節流樣本不可當效能保證。六 GLB 約 11.3 MB，增加 skinning／面數成本。診斷參數下 390px 底部面板遮擋與既有 nexus guard 事件 lane 文案列入紀錄。基地／塔／坑建築精修留下一輪。

完整資產、程式與驗證清單：`docs/design/ESMO_Rift_330_野怪整合驗收.md`；瀏覽器證據：`art/moba-rift/browser-acceptance.md`。依使用者要求，未 commit／push／deploy，未整合其他 AI worktree。
