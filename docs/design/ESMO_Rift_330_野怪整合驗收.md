# ESMO Rift 330 野怪整合驗收 — 2026-09-08

候選 worktree `art/moba-rift-esmo-v1`；未 commit / push / deploy。330×330 corridor-v3 幾何、世界尺度、移速與 Battle 規則保持本輪開始時已驗證版本。

## 完成內容

- Blender MCP 原創六種生物：Dragon、Baron、紅 Buff、藍 Buff、狼群、六足石甲蟲；覆蓋現有兩個 Boss 與六處真實營地，不新增引擎不存在的野怪。
- 每種有加權骨架、獨立輪廓、色彩／法線材質與 Idle、Move、Attack、Hit、Death。兩個 Boss 另有 Roar 資產，沒有可靠現役事件便不虛構觸發。
- `art/moba-neutrals/build_neutrals.py` 可重建，六份 `.blend` 與六種總覽圖保留；交付 GLB 與 manifest 在 `public/assets/moba/neutrals-v1/`。
- `RiggedMobaRuntimeNeutrals.jsx` 共用 GLB 幾何／材質，每隻獨立 skeleton/mixer，加入接地陰影與視錐剔除；載入失敗保留原呈現 fallback。
- `neutralAnimationPolicy.js` 只讀實際 position、alive、HP、attackAt、hitAt、deathAt、respawn 和模擬時間；不寫 Battle state、不套用 root motion，不新增傷害或 AI。
- `MobaRuntimeView3D.jsx` 接入新 consumer。`MobaReplayScreen.jsx` 修正 Result 捲動容器裁切重播：body portal、固定視窗、頂部關閉鈕，修正舊版地圖 fallback 文案。

## 驗證

- 原 corridor-v3 foundation 10/10 全部 PASS；pacing 25/25、navigation 14/14、順序公平性正常／反序藍勝 22/40、23/40，差 3pp。此階段沒有重改幾何或模擬。
- 新增 `check_moba_neutral_rigs.mjs` 14/14 PASS：六資產骨架、權重、材質與法線、真正變動的動畫通道；實際引擎快照觀察 Attack 992、Hit 992、Death 184、respawn 65 次。
- focused presentation29b2 12/12、controls29b3 18/18 PASS（SKIP_NESTED=1）；最終 build exit 0；camp 6 出發 + 6 回程、3 鏡像配對 PASS；diff whitespace check PASS。
- 正式流程由零開始自然結束 24:07、4:10，Result → runtime-v2 Replay 暫停／+10 秒／事件跳轉／末幀比分一致／返回 Result → Dashboard 通過。
- 新資產實戰自然結束 25:39、8:18，觀察真實 Boss HP、死亡與重生；新資產 Replay 末幀同為 25:39、8:18，console errors 0。
- 桌面與 390px Replay，320/360/390/430px Battle 無水平溢出；正交平移／縮放、導播返回、面板關閉已驗收。詳細紀錄見 `art/moba-rift/browser-acceptance.md`。

## 實際限制與後續

- 本輪是原創風格化有機生物，不宣稱寫實電影品質或已獲 Owner 美術 PASS。每模型 6740–12328 triangles、5 primitives；六份 GLB 約 11.3 MB。新增 skinning 與面數有成本。
- 最終 Replay 當下 sample 482 draw calls / 94459 triangles；不同鏡頭無法與舊版作公平 A/B，瀏覽器背景節流使 FPS 不穩。未經實體 Android FPS／觸控／長時間溫度測試。
- 舊／現役 Replay 儲存 frame 缺少每隻野怪移動與攻擊／受擊時間，不能完整重演細節動作；只呈現錄影實有 HP／存活／重生，缺事件不捏造。若要完整記錄應獨立審核 Replay 契約，這次不擴充。
- 瀏覽器沒有逐格截到 2 秒 Death clip 全過程，時間邊界由實際引擎 policy verifier 驗證。
- `?diag=1` 診斷面板會遮擋 390px Result 底部操作；正常玩家 UI 不開該參數。原事件文字有 nexus guard lane 顯示 undefined 的既有問題，留待事件呈現修正。
- 基地、主堡、防禦塔、兩個坑的建築細節，以及更細緻生物貼圖／LOD，值得下一輪提升，未夾帶重構。
- 保持 Online contract consumer。先前地圖導航輸入變更應納入未來 simulationVersion／frozen map input 審核；本輪模型與動畫不改模擬。LogicEngine、Store、router、結果與 Online contracts diff 為空。
