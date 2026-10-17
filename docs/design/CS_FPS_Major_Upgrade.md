> 2026-10-18 最新：Owner完成人工驗收並明確授權v1.0正式發布。產品main a8438c9a、Pages39074829702 success，正式站CS桌機／390各63/63、MOBA11/11。保留已通過美術、正式AI／五職16能力／C4／合法原創設計音效／真數據戰報／Replay相容；MOBA來源與最新main相同。完整結果與風險見review/cs-major-upgrade/RELEASE_V1.md。以下為設計及歷史驗收紀錄，不覆蓋最新發布授權。

> 2026-10-11 Owner 最新指示：人物美術接受目前完成度，停止人體／手指完美化，不再以舊獨立 1／U findings 阻擋反覆追修；原審查分數與遮擋限制保留，不宣稱獨立藝術 PASS 或量測90分。只收必要 B 技術驗證後直接 C → D → E，完成停 Owner Review，不 push／deploy、不動 MOBA。升級完成後已授權清理本 CS 工作區淘汰 evidence／profile-builds，保留最終可用版、必要完整驗證紀錄、素材授權與唯一恢復點；執行前逐份核對明確清單、resolved path、連結及使用中程序。 最新技術結果與執行狀態見 review/cs-major-upgrade/RESUME_CHECKPOINT.md。

> CS Major已完成必要實作與驗證，■ A／B／C／D／E，停Owner Review。指定B7 GPU45/45/95720ms未重跑，C37/42/34、D51與新增input15/Browser15、契約28/完成36、正式flow25+終局8、Worker12、雙尺寸三圖60s各18全依真native收件；完整成果與限制見review/cs-major-upgrade/OWNER_REVIEW.md。不push/deploy/commit、不動MOBA，真手機與視覺待Owner驗收。

## 2026-10-08 歷史狀態：B7仍未放行（以checkpoint最新段為準）

■ A｜▣ B7｜□ C｜□ D｜□ E；尚未Owner Review。anatomy-taper局部GPU17/17、衣料37/37及4/4pixels均native0，但獨立四圖肘／布袖口仍1；蒙皮摺高中位僅7–8mm，正在修正可見回折面與摺形。最新source與實際執行狀態唯一入口：review/cs-major-upgrade/RESUME_CHECKPOINT.md；當次審查合併VISUAL_REVIEW_B7_CUFF_RECOVERED_20261008.md。先前完整56圖藝術否決仍保存，不能以局部或技術PASS覆蓋。esbuild原失敗為OOM／環境問題；另查出Worker CSS注入真回歸已修，12/12只屬該source。證據產出已改局部4PNG／純量測0PNG／同源archive共用／CS-only封存；盤點與清理邊界見EVIDENCE_RETENTION.md，未刪歷史資料。不push／deploy、不動MOBA，真手機FPS／觸控／safe area／音效未實測。

## 範圍與正式基準

- 2026-10-02 `git fetch origin main` 後正式 SHA：`1cf6472961528eeb3acfeb2558deadb4b425372d`。
- 隔離分支：`feature/cs-fps-major-upgrade`；worktree：`worktrees/cs-fps-major-upgrade`。
- 原工作區既有修改保留。本輪不 commit／push／deploy；完成停在 Owner Review。
- §0 交接快照仍寫 v16，最新 RELEASED 紀錄與正式 HEAD 已是 v17；本輪依最新 HEAD 建立，不改 MOBA。
- 禁區：MOBA、正式 Competition contract、Router、Progress／Reward。Result／Replay 僅允許必要向後相容擴充。

## Phase gate

| Phase | 交付範圍 | 繼續前需要的證據 | 目前狀態 |
|---|---|---|---|
| Baseline | 三圖、10 角色、桌機／390 視窗、載入與 renderer／memory | 同 seed、1×、GPU／viewport／DPR／build 清楚記錄 | DEV 實際 GPU 已完成；production 對照待補 |
| A | 原創場景、建築、材質、區域地標、掩體與路線對齊 | 實際 Battle 截圖、效能比較、導航／LOS／地圖 verifier | A37通過場景階段最低門檻；完整24PNG World2，最終頂級品質／整體polish仍待E |
| B | rig、持槍、武器差異、聲音與 feedback | 動作／槍聲／hit/death 真事件、效能比較 | Owner接受美術＋必要技術PASS；指定390 GPU45/45與Worker12/12沿用，不重做 |
| C | peek／hold／entry／trade／crossfire／lurk／rotate／fake／execute／retake／clutch／save／eco | 決策→路徑→事件證據；同 seed 決定性及雙方測試 | C1 37/37、coordinator42/42、runtime34/34 native0；legacy24/24與completion36/36保持 |
| D | HUD／economy／spectator／Replay／Result 與真統計 | 正式流程、舊契約相容、320／360／390／430 版面 | Node51、原48重播行為＋分段四寬度、新input15與真Legacy Browser15收件；真手機未測 |
| E | 效能與整體 polish | 最終同情境效能、整體 verifier、Owner Review 報告 | 正式flow25＋終局8、Worker12、最新build1、雙尺寸各18/18 native0；舊archive明確10清理完成，停Owner Review |

Phase 未通過，不推進下一 Phase。明顯 frame-time regression 先修正。

## 技術美術契約

地圖優先建立可辨識的建築輪廓、室內外層次、路線與具功能的地標，材質／光影其次。
不直接複製任何官方地圖、模型、貼圖、UI 或音效。舊 map key 作相容識別，不是授權來源。

- 高價值表面：主要建築／地標／Bombsite、角色持槍輪廓與近鏡頭武器。
- 支援表面：門窗、屋頂、欄杆、管線、道路、植被、標識，使用共用材質／geometry 與 instancing。
- 材質：石材／混凝土／塗漆金屬／木材／布料／玻璃／地面接觸／標識，依 roughness／metalness 區分。
- 光照：單一日光 shadow、半球補光；靜態光感優先材質與 AO；不增加大量 PointLight。
- VFX：只讀真實 shot／damage／death／utility 事件；固定池、有限 lifetime，避免常駐粒子。
- 桌機起始預算：draw calls ≤300、triangles ≤750k、貼圖估計 ≤256MB、DPR≤2、shadow≤2048。
- 手機起始預算：draw calls ≤150、triangles ≤300k、貼圖估計 ≤128MB、DPR≤1.5、shadow≤1024。
- 既有版本若超預算，記錄實測值並逐步優化；不得以隱藏角色／掩體假裝降低成本。
- texture memory 是尺寸×4×mipmap 的估計，不是實際 VRAM。heap 是 JS heap，不是總記憶體。
- 桌機 GPU 模擬窄視窗不是手機真機；Android FPS／觸控／熱節流／音訊仍需人工驗收。

## Skill 與資產來源紀錄

- 已讀：`threejs-aaa-graphics-builder`（visual-scorecard、implementation-blueprint、model-recipes、render-recipes、technical-art、shader-cookbook、performance-safe-visual-detail）。
- 已讀：`threejs-debug-profiler`（debug-profile-checklists、performance-profile）；`imagegen`。
- 相依 `threejs-3d-generator`／`threejs-image-generator` 未出現在可用 skill catalog，已搜尋本機 skill 目錄；以內建 imagegen 製作原創材質。
- 憑證探針：`TRIPO_API_KEY=MISSING`、`GEMINI_API_KEY=MISSING`、`ELEVENLABS_API_KEY=MISSING`（只印 SET/MISSING，不印值）。
- 現有 rigged 角色：Quaternius CC0；現有錄製槍聲：CC0，依現有 license 文件。
- 原創材質 atlas：內建 imagegen 製作；實際路徑 `public/assets/fps/major-v1/environment-albedo-atlas.png`。原生成輸出 `01a0fa37-1baa-7f93-906a-c36c1a7c756e/exec-d97a6a0c-3578-4b0e-b13b-c763dbf9e48b.png`。四格為石材／塗漆鋼板／混凝土／木板，不使用官方貼圖。

## baseline 量測

工具範例：`node tools/browser_measure_cs_major_upgrade.mjs --phase=baseline-新輪次 --baselineSha=1cf6472961528eeb3acfeb2558deadb4b425372d --width=1366 --state=combat --details=true`。執行時把「新輪次」換成未使用的 ASCII 名稱；工具禁止覆蓋非空證據目錄。現行有效基線見本文 A14 段落。
相同 seed `505001`、1×、10 秒取樣，先等 10 名 rigged 人物就緒；三圖逐一量測。
輸出：`review/cs-major-upgrade/evidence/<phase>/<width>/metrics.json` 與 active-play screenshot。

第一輪：`HARNESS_FAIL`，在 150 秒內未確認十名 rigged 就緒，產品尚未判定；加入診斷後重跑。
依賴：`npm ci` 遇既有 postprocessing／three peer conflict，使用 lockfile 的 `--legacy-peer-deps` 相容安裝。

尚未有完整 baseline／Phase gate，不宣稱品質達標或 READY_TO_REVIEW。

## 2026-10-02 工作中檢查點：Phase A

### DEV 實際 GPU baseline 與中間版本

AMD Radeon(TM) Graphics，headed Chrome，seed `505001`，1×、10 秒活動取樣、10/10 rigged。
下面是中間版 A2（仍為舊空間配置）的實測，**不是最終成績**：

| 情境 | 圖 | FPS 前 → A2 | p95 ms 前 → A2 | calls p95 前 → A2 | triangles p95 前 → A2 | 貼圖估計 MB 前 → A2 |
|---|---|---|---|---|---|---|
| 1366 視窗 | mirage | 40.3 → 60.1 | 33.4 → 16.8 | 1150 → 842 | 25534 → 42528 | 36.0 → 31.5 |
| 1366 視窗 | dust2 | 42.7 → 58.7 | 33.4 → 16.8 | 1154 → 852 | 25092 → 46516 | 34.6 → 31.6 |
| 1366 視窗 | inferno | 36.5 → 55.6 | 50.0 → 33.3 | 1387 → 854 | 28176 → 45736 | 38.8 → 33.0 |
| 390 模擬視窗 | mirage | 57.5 → 59.0 | 16.8 → 16.8 | 1150 → 820 | 25534 → 30834 | 待最終整理 |
| 390 模擬視窗 | dust2 | 57.3 → 57.7 | 16.8 → 16.8 | 1154 → 826 | 25082 → 32354 | 待最終整理 |
| 390 模擬視窗 | inferno | 50.6 → 60.0 | 33.4 → 16.8 | 1387 → 853 | 28176 → 38236 | 待最終整理 |

- 桌機 baseline canvas 只有 430×507；A2 已改成 1120×630，不能當成固定像素成本的嚴格 A/B。
- 手機 baseline DPR=2／shadow2048；A2 DPR≤1.5／shadow1024，這是品質分級而非相同設定比較。
- 初次就緒時間包含模組、Worker 全場模擬、角色、聲音資產；不等同純地圖載入。baseline scene:map-build 約 90–251 ms。
- 全部數值仍需 production 同條件對照與重複取樣。未做 Android 真機 FPS／熱節流／觸控／音訊驗收。
- 材質、掩體使用 Instancing；每棟建物細節合批，保留各棟 fade material；環境動態燈=0。
- A2 截圖仍不達標，故 **Phase A 未完成、B–E 未開始**。接續重做原創空間配置。

### 原創空間與相容層（正在驗證）

- `MAPS` 改為澄灣水務／潮汐貨港／赤脊鑄造原創 collider、nodes、Bombsite、spawn 與掩體配置；legacy key 保留，未動 Competition map pool。
- `fpsMapIdentity.js` 是原創呈現名稱／美術語彙的唯一來源。
- `fpsLegacyMapData.js` 封存正式 baseline 的舊地圖；`sceneVersion=legacy` 使用它。缺版本的舊進行中 snapshot 選 legacy。
- 新比賽使用 `sceneVersion=major.v1`，版本加入模擬 cache key、Worker args 與 CS 進度 snapshot，避免新舊場景混用。
- 新場景結果 id 納入版本；legacy id 保持舊算法。尚未改 `CsMatchResult.v1` 欄位或 MOBA Replay。
- 新增 verifier：`cs_major_scene_v1` 48/48、`cs_major_simulation_v1` 21/21 預期形狀。後者逐格比正式 baseline、檢查原創配置決定性、路線與完成；結果尚待本輪完成。
- 沒有刪除或放寬既有 verifier。C3/C4 的字面檢查描述舊場景；完成版需另列歷史 gate 與替代證據，不假裝全綠。

### 已修正的建置問題

- 原依賴安裝不完整造成 `lucide-react` entry 找不到；重裝 lockfile 後 production build 成功，兩次舊逾時歸類 `HARNESS_FAIL`。
- ExtrudeGeometry non-indexed 與 Box/Tube indexed 不能直接合批；只在混合批次正規化。48/48 場景幾何／釋放檢查防止復發。
- 舊配置階段 `cs_match_completion` 36/36、build 通過。原創配置與版本相容的完整驗證正在執行，不能沿用先前綠燈。

## 2026-10-02 Phase A5 檢查點（尚非交付）

### 已確認的修正

- 赤脊鑄造防守出生區通道過窄，使雙方無接觸輪流安包，延長賽 48:48 仍未結束並耗盡 heap。擴寬東側與機控室外側通道後，完整賽制 36/36 通過；未指定勝負、未修改 OT 規則。
- 澄灣水務箱牆窄縫小於角色直徑，回推在兩個 collider 間振盪。移動同源箱體後 `blockedPositions=0`，三圖新版決定性／legacy 逐格及結果 id 比較 21/21 通過。
- 驗證 harness 增加 96 回合 watchdog，只回報失敗而不指定勝負；不寫入正式引擎。
- 三圖加入同源平台／緩坡（2.4／1.8／2.2 公尺），地形與 `player.elevation` 共用 `fpsMajorElevation`；舊比賽仍為 0 高度。新增高度後完整 gate 正在重跑。
- 材質使用 Standard shader 的 world-scale atlas UV，不加 render pass；移除拉伸 albedo 當 bump 的做法。長邊界牆不再擺滿建築窗戶。
- 服務道路沿 authoritative navigable routes 生成；地面鋪面隨坡面。室內梁架有獨立屋頂遮擋淡出。
- 掩體區分木箱、油桶、沙包與 ESMO 維修車；外形收在同源 AABB 內，不以假裝飾製造新掩體。
- 全場總覽固定地圖中心；其他導播仍追真實事件。遮擋依 3D slab 判斷，只淡出真正擋住角色的建物。

### A5 DEV 實際 GPU（開局狀態，不是最終高強度交戰效能）

| 圖 | 桌機 FPS／p95 ms／calls／triangles | 390 模擬視窗 FPS／p95 ms／calls／triangles |
|---|---|---|
| 澄灣水務 | 58.1／16.8／831／42088 | 57.6／16.9／440／21984 |
| 潮汐貨港 | 60.1／16.8／833／41230 | 60.1／16.8／446／22102 |
| 赤脊鑄造 | 59.9／16.8／843／43750 | 60.0／16.8／838／34548 |

皆 10/10 rigged、console／page error 0；兩視窗各 9/9 PASS。貼圖估計約 31.6 MB。桌機 canvas1120×630；手機 DPR1.5、shadow1024，仍不可稱 Android 真機。

量測曾錯用 positional 參數，將 current 場景誤標 baseline；已移到 `phase-a3-concurrent`，工具現在拒絕該寫法。桌機 baseline 以正式 SHA 的三個已修改 src 檔唯讀 overlay 重測：50.2／52.5／44.6 FPS、p95 33.4ms，calls1150／1154／1387；來源 SHA 寫入 metrics。其他 source 保持同一正式 main，未 checkout 或覆蓋正式工作區。原始 A2 前數字僅為歷史檢查點，不混作最終比較。

### 遊戲設計與核心循環

玩家承諾：透過賽前部署、經濟與回合觀察，指揮具有辨識度的隊伍在原創競技 FPS 場域執行策略。主要操作為選擇部署、觀戰焦點與回看；不是新增可手動控制角色的另一款 FPS。

核心循環：玩家部署路線／資源 → AI 面對資訊、交火與炸彈時間壓力 → 由位置、支援、道具與裝備決定回合 → 回看真實錄格與統計修正下場部署。回合勝負及結果仍來自原正式賽制，獎勵／Competition 流程不另算。

關卡計畫：出生集結後選擇中路控制或側翼進點；入口先接觸／交換，道具造成推進窗口；植包後攻守互換為守包／回防，晚回合在拆彈與保槍間做選擇。每圖以不同地標、交火距離、迴轉路、室內中繼及 site 平台承接同一戰術循環。難度不加固定命中 buff，優先用合法位置、暴露時間與已知資訊形成差異。

### Skill／分工／資產補充

- 已完整讀 Director、phase-playbook、gameplay systems 及 workflows／game-design-level-design／game-feel／physics-selection／兩個 checklist；AAA 最終 gate／scorecard 及三張 calibration anchors 已讀／看。
- 新地形沿用既有 deterministic custom collision／固定 simulation step；不引入 Rapier、不重寫引擎。
- `threejs-game-ui-designer`、`threejs-qa-release`、三個 generator 的主檔與 UI／QA required refs 本機缺失；採 Director fallback、frontend-design、專案 browser harness／verifier，不宣稱缺失 skill 已執行。
- 已依 Director 要求委派三個唯讀 Phase B／C／D audit；owner 統一修改，無多 agent 同改核心。
- Codex 3D Asset 的 server wallet probe 回傳 `TRIPO_API_KEY is missing`，無法生成外部模型；未消費 credits。角色繼續沿用 CC0 rig並改善其呈現，材質使用已生成原創 atlas。不要求使用者中途設定金鑰。
- 後續必要修正：大量 rigid 配件合批、死亡／VFX 高度、authoritative ammo／reload、真 utility 消耗／flight、fake／entry／trade 等路由、半場名單歸屬、seek 未來資訊、真統計與不重跑 simulation 的 CS replay。

目前不宣稱成熟 AAA 達標；A 最終交戰／production 測試及 B–E 尚待完成。

## 休眠前接續檢查點（2026-10-02）

- 所有修改已寫入隔離 worktree，尚未 commit／push／deploy；原工作區不動。
- 最新桌機實際交戰量測 `phase-a-combat/1366` 已結束，9/9 PASS：澄灣水務 51.6 FPS／p95 33.3ms／calls857／triangles42562；潮汐貨港 58.2／16.8／867／41612；赤脊鑄造 57.8／16.8／876／44180。三圖皆 10/10 rigged、console／page error 0。
- 以上仍是 DEV 實際 GPU，不是 production 或手機真機；Phase A 不提前標為完成，B–E 尚未實作。
- 接續順序：正式 SHA overlay 同情境交戰 baseline → 390 視窗交戰比較 → 確認 A gate → B 人物／槍械／音效與回饋 → C 戰術 → D UI／Replay／統計 → E 最終優化與 Owner Review。
- 休眠／網路切換後，若 browser、dev server 或測試中斷，該次量測作廢重跑，不能沿用不完整數據。已完成的 verifier 與證據仍保留。
- 使用者詢問休眠影響，尚未明確要求暫停 goal；不自行將 goal 標為 paused 或 complete。未完成不得標 READY_TO_REVIEW。

## Phase A6–A8 進度（工作中，非最終交付）

- 休眠使 baseline browser CDP 中斷，標 `HARNESS_FAIL`；隔離重跑三圖桌機與 390 視窗，各 9/9 PASS。未用中斷資料作通過證據。
- 水務拱窗／貨港百葉／鑄造高窗、工業門面、site 警戒鋪面、中路排水溝、單批接觸遮蔭、海岸色階與外圍 instanced 植栽已實作。新版三圖現在都有同源可通行室內／遮蔽空間：水務檢修廊、海關檢查廊、機控室。
- 首輪立面曲面與小標線均用過高細分，場景只有 44/48 通過；減少曲面細分、依標線尺寸自適應網格、背景植栽 LOD 後 48/48 通過，未調高 35000 triangles／90 batches 門檻。
- A6 桌機交戰 53.6／52.6／47.8 FPS，部分 frame time 退步；未繼續 B。固定配件依 torso／head／weapon mount 與材質合批，保留真實關鍵定位 mesh、原骨骼 updater；手機停用小配件 shadow，10 名 rig不移除。
- A7 桌機：55.1／60.1／60.0 FPS，p95 均 16.8ms，calls634／644／653，triangles55476／55174／53630。390 視窗：60.1／60.1／59.7 FPS，p95 均16.8ms，calls350／356／615。以上仍是 DEV AMD GPU，不是真機或 production。
- 同情境正式 baseline 桌機：57.2／60.0／54.3 FPS，p95 33.2／16.7／33.3ms，calls1150／1154／1387；390 視窗：54.6／52.4／49.0 FPS，p95 33.3／33.4／33.4ms。版本增加桌機 canvas 面積，不冒充固定像素 A/B；最終需整理載入、貼圖估計與 heap，並補 production 證據。
- `cs_major_scene_v1` 48/48、強化高度來源斷言後 `cs_major_simulation_v1` 21/21、`cs_match_completion` 36/36、build 本輪完整 4/4 通過。既有角色 9/9、rig 14/14 通過。
- 新 `cs_major_character_v1`：實際 CC0 GLB 的 BIN／nodes／skins 保留，Node fixture 僅在記憶體移除圖片引用；30 個獨立 clone、10 人五槍族／姿勢後 visible 頂點 bounds、材質／三角數／釋放 87/87 通過。active mesh 65–85→44–53，triangles2716–3144、8 materials。這不證明貼圖／GPU／真機視覺；browser 另測。
- baseline 唯讀 overlay 已擴充為所有本輪修改的既有 `src` 檔，避免之後人物／呈現層改動滲入正式版本比較。
- A8 正在補最新場景的交戰、總覽、跟隨與 POV 截圖／效能，尚未完成視覺審核；不宣稱成熟 AAA 已達標。
- 使用者明確要求所有長任務附階段進度條，以及整體／小任務剩餘時間估算；已保存到隔離分支 `AGENTS.md`。無全域記憶工具，不宣稱跨所有對話保存。

## Phase A10–A11 下班休眠接續檢查點（2026-10-02）

- 整體 `▣□□□□`：A 驗收中，B／C／D／E 尚未實作；A 子任務 `■■■▣`：地圖實作、技術檢查、截圖量測已完成，獨立視覺審核尚未交付。不得據此宣告 Phase A、整個 goal 或 READY_TO_REVIEW 完成。
- 修正近鏡頭黑色天空與海岸水面覆蓋陸地：無額外 render pass 的漸層天空、三側陸地／東側水道；外圍植栽仍不進可行走區。POV 未顯示武器是已確認缺口，Phase B 待修。
- A10：同 seed `505001`，AMD 實際 GPU，桌機／390px，各三圖 active／overview／detail／pov，共 24 PNG；每次記錄精確 CSS canvas rect。兩個 browser gate 均 exit 0、9/9；10/10 rigged，console／page error 0。
- A10 桌機 mirage／dust2／inferno：50.2／58.6／60.1 FPS；p95 33.3／16.8／16.7ms；calls635／646／654；triangles56304／55654／53992。390px：59.5／60.1／60.1 FPS，p95 均16.8ms；calls352／358／616；triangles31166／33816／42534。
- 桌機 mirage 的長幀需要檢查，沒有直接當作通過：骨骼掛件改成每次同步只更新一次父矩陣並共用 inverse，保留實際掛件形狀與骨架。重驗 `cs_major_character_v1` 87/87、build 通過，runner 本次2/2、exit0。A11 targeted mirage：54.7 FPS／p95 16.8ms／calls636／triangles56304，browser exit0、3/3。不同時間量測仍有 GC／系統波動，不以單次60FPS宣稱沒有剩餘風險。
- 新工具 `tools/audit_cs_major_pixels.mjs` 是自製 fallback，不是官方 inspector；精確裁切分析原 PNG，不另存／修改圖片。A10 桌機與390均12/12張 MEASURED、0 NOT_MEASURED／ERROR、exit0。包含 entropy／edge density／luminance／clipping 與 advisory render budget。calls 全部仍高於 desktop300／mobile150目標，不能宣稱完整效能預算已達標。
- 獨立 reviewer `/root/phase_a_fresh_eyes` 只收到全部24張截圖、scorecard與pixel JSON，尚待結果；不提供實作背景或先前分數。低分與 automatic failure 必須如實處理，不以工具有輸出冒充 AAA 通過。
- 所有量測仍是 DEV 共用正式元件的診斷入口；正式玩家流程／production、320／360／430完整 UI、Android 真機仍未驗。手機模擬不是手機硬體FPS。
- 下班休眠時不啟動新的本機長測試；目前 owner 的 browser／build行程均已完成。程式與證據保存於隔離 worktree，未 commit／push／deploy。喚醒後從獨立審核結果及 Phase A gate 接續，再依序 B→C→D→E。
- 整體剩餘粗估6–10小時以上，不含休眠／中斷，並非承諾；若場景審核退回或新增效能問題，先更新估算。使用者尚未明確要求暫停 goal，不自行改為 paused／complete。

## Phase A12–A13：場景複核與量測修正（工作中）

- A10 獨立審查平均 0.9；A12 平均 1.5，Art／Materials／Lighting 為 2，World 為 1.5，仍未達場景完成標準。人物、POV、手機 HUD 也有明確缺口，不宣稱 AAA／premium 完成。
- A12 補切角體量、拱／鋸齒／階梯屋頂、不同工業 site 設備、合批背景街廓與原創港機；A13 補完整中庭拱頂、海關雨棚、機控室斜屋頂、壓機院吊機及港機基座。所有地面支柱收在既有 collider 內；高空梁架不新增可行走地面掩體。外圍地表延伸但保持相同頂點數，中央低於競技地形、三側接陸地、東側水道。
- 建物淡出、場景幾何與材質冪等釋放、環境零動態燈不變。`cs_major_scene_v1` 48/48 與 build 多輪通過，35000 environment triangles／90 batches 門檻未調高。
- 自動鏡頭開局改用全隊部署中心；交戰聚焦若缺其中一方，退回存活者取景；姓名標籤依實際投影避重疊，不改 simulation 或生命值。
- **量測撤回**：A12 的 390px 和舊 `baseline-combat` 兩尺寸雖標 combat，實際游標約12秒、無射擊，不能當交戰前後比較。舊檔保留為問題證據，禁止引用為有效交戰 baseline。其他舊輪次若未核對游標，也不能僅憑 state 標籤稱有效交戰。
- 工具改為拖曳實際 thumb，再以真實方向鍵修正量化游標；強制斷言 authoritative frameIndex、muzzles≥1、alive≥8、暫停狀態，然後以真實播放鈕取樣。新增整隊取景與 body／finite 檢查，不直接寫 frame／鏡頭／引擎。
- A13 桌機與390各15/15、exit0；每尺寸三圖四視角共24張PNG；像素fallback每尺寸12/12 MEASURED，0 ERROR／NOT_MEASURED。獨立審查使用完整24張、scorecard（含校準圖）及pixel JSON，尚待結果。

| 圖 | A13 桌機 FPS／p95 ms／calls／triangles | A13 390 模擬 FPS／p95 ms／calls／triangles |
|---|---|---|
| 澄灣水務 | 54.3／16.8／637／55976 | 54.7／16.8／638／45376 |
| 潮汐貨港 | 59.7／16.8／645／58682 | 59.7／16.8／644／49690 |
| 赤脊鑄造 | 60.1／16.8／657／56438 | 60.0／16.8／655／47066 |

- 10/10 rigged、page／console error 0；貼圖估計約31.6MB。桌機 heap225／347／581MB、冷就緒7.9／11.2／8.9秒；390 heap198／469／516MB、冷就緒7.9／11.0／9.1秒。heap 是瞬時 JS 值；冷就緒包括模組、整場 Worker 模擬、rig／音效，不是純地圖載入。
- 重測正式 SHA 的 `baseline-a13-verified-combat/1366`：15/15、exit0；47.1／59.2／53.1FPS，p95 33.4／16.8／33.3ms，calls1200／1259／1315。正式鏡頭 canvas430×507，新版1120×630；不同原創配置的首個有效交戰並非相同 frame，不能稱固定像素／相同戰局 A/B。
- 澄灣水務真交戰 baseline max1083ms；A13 desktop max850ms、390 max867ms，沒有新增更長的峰值證據，但仍有實際卡頓待 CPU／render profile 定位。不能用p95或接近60FPS隱藏它。390正式baseline重測仍在執行。
- 整體 `▣□□□□`，A尚未完成，B–E未實作；剩餘粗估8–12小時以上，遇品質退回／量測問題須修訂，不含休眠。未commit／push／deploy，未READY_TO_REVIEW，手機真機與production正式玩家流程未驗。

## Phase A14：長幀根因修正與視覺退回（2026-10-03 接續）

- 正式真交戰 baseline：`baseline-a13-verified-combat/1366` 與 `baseline-a14-verified-combat/390` 均 15/15、exit 0。390px FPS 49.6／52.8／51.1，p95 33.3／33.4／33.4ms，calls1202／1259／1313；正式 canvas／DPR／shadow 與候選不同，不是固定像素 A/B。
- 水務 CPU profile `phase-a13-profile/1366/mirage-cpu-profile.json`：`getProgramInfoLog` 自耗時約 789.5ms，首次載彈者死亡使 C4 PointLight 從不可見變成可見，StandardMaterial 燈數改變觸發 driver shader 編譯。major 改為無 C4 動態燈，保留模型／emissive／標籤；legacy 保留原行為。
- `phase-a14-bomb-light/1366` 診斷 5/5、exit 0，對應 CPU profile 的 shader 查詢自耗時 0ms、max frame33.4ms（修正前約816.7ms）。CPU profile 不當正式 FPS 樣本。
- A14 結構補強：水務高塔與開口側拱廊、冷鏈四柱吊運架、鑄造錯層爐膽／煙道／工序背景。技術 runner 本輪 3/3、exit 0：場景48/48、legacy 模擬逐格相容21/21、build；未放寬預算。
- `phase-a14/{1366,390}` 各18/18、exit0；每尺寸三圖四狀態，共24張PNG。10/10 rigged、major 有效 PointLight／SpotLight 0、整隊未消失、page／console error 0。兩份像素 fallback 各12/12 MEASURED、0 ERROR／NOT_MEASURED。

| 地圖 | 桌機 FPS／p95／max ms／calls／triangles | 390px 模擬 FPS／p95／max ms／calls／triangles |
|---|---|---|
| 澄灣水務 | 60.16／16.8／16.8／639／56102 | 60.00／16.8／33.5／638／45424 |
| 潮汐貨港 | 59.58／16.8／83.3／646／58898 | 59.79／16.8／66.6／645／49906 |
| 赤脊鑄造 | 60.09／16.8／16.8／657／58880 | 60.07／16.8／16.8／656／48942 |

- 貼圖估計31.61–31.62MB；桌機瞬時JS heap243／386／530MB，390px217／493／516MB。不是VRAM或整體記憶體。冷就緒含整場模擬、音效與rig，不能稱純地圖載入。
- A14 fresh-eyes 只收到全部24PNG、scorecard／校準圖及像素JSON：Art1、Hero1、Obstacles1、Interactables1、World1、Materials2、Lighting2、VFX1、UI1、Performance2，平均1.3/3。三圖World各1/3；主世界仍是方形圍牆沙盤、孤立盒屋、平面街道色帶。手機人物卡遮戰場、貨港標籤／血條重疊。未通過，不宣稱premium／AAA完成。
- 接續 A15 優先：連續街區與周界體量、統一地表與實際地坪功能、正確局部屋頂淡出；不以樹／桶／材質噪聲代替結構，不改 MOBA／Competition／Router／結果契約。完成後重跑雙尺寸與完整複核，通過 A 才開始 B。
- 整體 `▣A □B □C □D □E`；A暫估1–3小時，整體9–13小時以上，不含休眠／中斷，僅估算。未 commit／push／deploy，未 READY_TO_REVIEW。

## A16 完整效能／視覺複核與 A17 接續（2026-10-03）

| 地圖 | A16桌機 FPS／p95／max ms／calls／triangles | A16 390px FPS／p95／max ms／calls／triangles |
| --- | --- | --- |
| 澄灣水務 | 59.76／16.8／33.5／637／49088 | 59.95／16.8／33.3／638／41418 |
| 潮汐貨港 | 58.11／16.8／83.4／645／50684 | 59.70／16.8／83.4／644／44764 |
| 赤脊鑄造 | 60.10／16.7／16.9／661／52218 | 59.20／16.8／83.3／660／45008 |

- `phase-a16/{1366,390}` 各18/18、exit0，完整24PNG；像素各12/12 MEASURED，0 ERROR／NOT_MEASURED；10/10 rigged、有效PointLight／SpotLight 0、page／console error 0。貼圖估計26.28MB；桌機瞬時JS heap239／474／510MB，390px198／462／500MB，不是VRAM或總記憶體。
- 獨立reviewer只取得完整截圖、scorecard／anchors及像素JSON：Art2、Hero1、Obstacles1、Interactables1、World1、Materials2、Lighting2、VFX1、UI2、Performance2，平均1.5/3，三圖World各1/3；primitive-dominant／大面積實心盒體及平面街區仍未通過。A不放行。
- A16技術scene60/60、simulation21/21、character87/87、MR12完成36/36與build已完成exit0；這些不代表手機真機、production流程或整體A–E完成。
- A17的新方向：用有授權且有厚窗／門框的建築模組，直接將局部實心建物改成雙入口可通行廠房；不再只加屋頂小物。場外改用完整工業建築與起伏地形，仍不以fog／bloom掩蓋缺內容。
- 已下載／檢查 [Building Kit](https://kenney.nl/assets/building-kit)、[Factory Kit](https://kenney.nl/assets/factory-kit)、[City Kit Industrial](https://kenney.nl/assets/city-kit-industrial)官方包，各`License.txt`均CC0。來源、版本、hash與離線轉換流程見`public/assets/fps/major-v1/CC0_AUTHORED_KIT.md`；不是CS官方資產，不使用商標。
- A17首輪scene58/60因兩圖超預算；調整遠景細分、植栽與次要拱窗LOD後60/60，桌機環境34930／33658／34574 triangles，不調高35000／90 batches。追加來源與雙入口檢查後scene66／simulation24，完整runner與GPU尚待本輪結果。
- 整體 `▣A □B □C □D □E`；下一檢查點為A17技術／實際遊戲與完整複核。整體暫估10–16小時以上，不含休眠；使用Astra沒有同條件模型速度測試，不以名稱宣稱更快。未commit／push／deploy／READY_TO_REVIEW。

### A17 完整量測

| 地圖 | 桌機 FPS／p95／max ms／calls／triangles | 390px 模擬 FPS／p95／max ms／calls／triangles |
| --- | --- | --- |
| 澄灣水務 | 58.77／16.8／33.4／649／56564 | 60.00／16.8／33.4／648／49910 |
| 潮汐貨港 | 59.87／16.8／33.5／651／55142 | 60.07／16.8／17.0／649／49886 |
| 赤脊鑄造 | 59.61／16.7／66.6／670／57388 | 59.90／16.8／33.5／669／50836 |

- `phase-a17/{1366,390}` 各18/18、exit0；十名rigged，PointLight／SpotLight有效數0，page／console error0。貼圖估計26.28MB，桌機JS heap209／458／492MB，390px200／439／470MB；瞬時JS值不是總記憶體。
- 冷就緒桌機16.6／19.1／18.0秒、390px15.5／18.3／18.3秒，包含整場模擬等成本，不稱純地圖載入。純map-build桌機140／130／126ms、390px169／114／118ms；environment子段桌機91／88／82ms。不同戰局、不同canvas／品質層，不冒充嚴格像素A/B。
- 首輪simulation23/24因貨港新西門被舊貨箱擋住；重現確認blocked=true後移major貨箱，完整runner3/3（scene66／simulation24／build）exit0。修正薄屋頂雙面法線後scene／build再2/2。stdout／stderr保存在`phase-a17-tech`。
- 首次targeted4PNG誤標baseline：呼叫者使用Node `-e`卻只push參數，第一個phase落在argv[1]而被slice(2)略過。新候選六檔已移至`phase-a17-waterworks/1366`，該輪不是正式baseline；舊`baseline/1366`水務及metadata遭覆蓋無法復原，撤回該目錄比較資格。有效正式SHA的兩個verified-combat目錄未受影響。
- 工具追加必填phase／baseline正式SHA／安全名稱／禁止覆蓋非空目錄，後續使用完整argv。不得因工具事故改產品程式或提高視覺分數。
- 全部24正式候選PNG＋4targeted共28張，三份像素JSON均完整MEASURED且0ERROR，已交唯讀fresh-eyes reviewer，不提供實作或先前評分背景。場外資產未映射共享atlas而呈灰色、主世界部分立面仍是平窗，owner明確認為有材質與完成度風險；目前不宣稱場景完成。

### A17 獨立複核與 A18 修正

- 複核已完成：Art2／Hero1／Obstacles1／Interactables0／World1／Materials2／Lighting2／VFX1／UI2／Performance2，平均1.4/3。逐圖 World：水務2、貨港1、鑄造1。水務只通過場景局部門檻，不代表整體遊戲或 Phase A 已完成。
- 明確缺口：貨港與鑄造的重複盒體、灰色場外廠房、鑄造POV巨大平窗遮擋；手機觀戰卡片與回正按鈕重疊仍待D。角色／互動物／VFX待B，不用本輪場景進展代替。
- A18：貨港／鑄造閉合廠房改成0.48m厚牆、真窗洞與內縮玻璃；省去不能進入建物的內側背板、冗餘門橫桿及直條，碰撞仍由既有完整AABB提供。場外CC0建築按實際面與palette拆為共享atlas牆／屋頂及原設備色兩批；增加邊界外裝卸坪、運輸道路、種植帶。未新增貼圖或動態燈。
- POV頭部原本固定世界高度1.56m，現在加上同源地形高度，避免站上平台後眼睛落到地板下；legacy高度仍0。
- 初驗scene65/66：鑄造35112triangles超35000。裁去封閉建物不可見背板後（含場外道路），桌機34930／33458／34378、57／61／73batches；手機28278／29794／29578。scene66/66、camera recovery8/8、build皆exit0，實際GPU正在重測，未放行A。

### A18 實測與複核結果、A19 接續

| 地圖 | A18桌機 FPS／p95 ms／calls／triangles | A18 390px FPS／p95 ms／calls／triangles |
| --- | --- | --- |
| 澄灣水務 | 59.87／16.8／650／56564 | 60.15／16.8／649／49910 |
| 潮汐貨港 | 60.08／16.8／653／54944 | 60.11／16.8／651／51276 |
| 赤脊鑄造 | 60.02／16.8／672／57318 | 60.01／16.8／670／52516 |

- `phase-a18/{1366,390}`各18/18 exit0，全部24PNG、像素各12/12 MEASURED／0ERROR。texture估計26.28MB，heap桌機228／466／475MB、390px200／428／490MB。冷就緒桌機18.1／17.3／19.6秒、390px15.4／18.1／17.7秒，包含模擬與資產，非純地圖載入。相對A17 p95無明顯regression；calls仍超起始建議，主要角色部件與材質合批改善仍待B。不是手機真機。
- 完整24PNG獨立複核：Art2／Hero1／Obstacles1／Interactables1／World1／Materials2／Lighting1／VFX0／UI1／Performance2，平均1.2/3。三圖active皆2，overview與POV皆1；故不能沿用A17水務局部2推論整圖已通過。owner依所見也保留World1，對陰影／暖色壓縮採較低Lighting1。
- 自動失敗仍包括大面積平地／重複屋體、primitive人物及手機人物卡／回正鈕重疊。VFX0表示這組靜態截圖未展示有效事件，不推論程式沒有VFX。像素16/24 edge<.04；鑄造桌機overview entropy2.444、contrast57；貨港POV darkClip桌機6.82%／390px10.01%。不得以約60FPS或有貼圖宣稱premium。
- A19：major POV預設垂直FOV由42改72，滾輪／雙指範圍50–92；legacy仍42及原36–72。第一人稱與追焦目標均含地形高度。只調真正玩家鏡頭規則，不改frame、朝向或選取目標來製造截圖。
- 場外地坪維持相同格數／三角形，重新分配格點至近場，石脊繞過三組廠房地基；植栽與設施共用場外高度。鑄造天空補光改中性、增加日光層次。scene66/66與build通過，實際A19GPU重測中。
- 量測工具新增真實POV選手／FOV／眼高斷言，並記錄FPS來源與資產內容SHA-256（不是commit SHA）；像素JSON轉載該指紋，改善未commit候選的追溯性。尚未完成A，總體暫估12–20小時以上，不含休眠／中斷。

### A19 地形回歸修正

- `phase-a19/{1366,390}`數值各21/21，但截圖顯示場外地面背面剔除；此輪明確視覺失敗，不能引用為有效完成證據或畫質升級的效能比較。
- 原因：重分配PlaneGeometry格點時，Z列方向設成遞減，與既有index繞序相反，法線朝下。新增各圖／品質層的全部地表法線正Y檢查，修正前實際66/72 exit1、六項失敗；原始stdout保留`phase-a19/ground-normal-failure.log`。
- 僅修正Z列順序，不以DoubleSide掩蓋反面；新檢查72/72、camera recovery8/8與build皆exit0。runner的shape由66同步72，舊66項保留，新增檢查是針對真實漏網回歸。最新重測另存`phase-a19b`，不覆蓋A19。

### A19b 完整驗證與 A20 原創地表

- A19b雙尺寸各21/21 exit0，24PNG、像素各12/12 MEASURED／0ERROR。桌機FPS59.44／58.00／60.03、390px60.12／60.11／60.10，p95均16.8ms；calls桌機648／653／672、390px649／651／670。texture約26.28MB；場外地形可見，但仍套用工業地坪，owner判定材質不合適，未宣稱A通過。
- 兩尺寸來源指紋一致：`90f8a0c1a424b04f49cc95d1b293c5eaaa30b7fc67228fe6e9733418d427d4d9`，26個FPS來源／資產檔。每張POV均保留實際選取角色、FOV72、eyeY1.56／groundY0；本組沒有站上平台的POV樣本，不推論高地樣本已實測。
- A20依imagegen skill產生新的岩石／碎石／草地／柏油atlas，實際輸出1254²、3,847,522bytes，SHA與完整prompt見`public/assets/fps/major-v1/TERRAIN_ATLAS.md`。已存入專案，原始生成輸出保留；非CS官方素材。
- 場內地面沿用既有atlas，場外地形與道路另共用一材質；桌機GPU貼圖1024²、手機512²，預期增加5.33／1.33MB。幾何數不變，只增加一個地形批次；朝向檢查同時覆蓋拆分後兩個地表，未刪掉外側檢查。scene72與build皆exit0，A20 GPU實測中。

### A20b 驗證與 A21 室內空間（2026-10-03）

- A20桌機21/21，但遠景atlas重複接縫出現白網格；A20b以連續world UV的梯度取樣，避免fract邊界選錯mip。不增加取樣次數、燈光或幾何。scene72與build通過。
- A20b桌機／390px各21/21 exit0，24PNG像素全MEASURED、0ERROR；兩尺寸28檔來源指紋同為`3fbacb1aeecca5bb29709289c5c9fd9b61ab03b66dac5a948f1978a32ef0a218`。
- 桌機三圖FPS58.82／59.90／60.02、p95全16.8ms，calls651／654／673，triangles56564／54944／57318，texture約31.61MB、JS heap232／453／492MB，cold-ready16.7／18.0／19.0秒。
- 390px三圖FPS60.12／60.10／60.11、p95全16.8ms，calls650／652／671，triangles49910／51276／52516，texture約27.61MB、JS heap242／468／489MB，cold-ready16.2／18.3／18.9秒。texture相對A19b實增約5.33／1.33MB；heap受GC與戰局影響。cold-ready包含模擬與全部資產，不是純地圖載入；390px仍是桌機GPU非真機。
- owner檢視新鑄造全景及貨港手機POV：白網格已改善，但全景重複封閉建物與手機卡片遮擋仍存在，不宣稱A通過。A21將貨港通關轉運廊、鑄造西側鑄件廊改成4.8m雙入口室內路線；碰撞／可見牆／導航同源。次要窗框採低成本幾何，分別採中脊採光屋頂與單坡屋頂，不新增動態燈。
- A21首輪scene72/72：桌機水務34930／貨港33354／鑄造33908三角形、58／72／84批次，未放寬35000／90預算。模擬相容／完整比賽及新GPU尚待驗證。A仍進行，B–E未完成；整體暫估12–20小時以上，不含休眠。

### A21b 第一人稱實體遮擋修正（2026-10-03）

- A21完整simulation24/24 exit0：三圖新房雙入口與導航可通行、同seed決定性、完整比賽完成、零穿牆；legacy逐格與正式baseline一致。scene72與build再2/2 exit0。
- A21桌機21/21，但水務51.6FPS／p95 33.4ms，貨港59.8／16.8ms、鑄造60.1／16.8ms。水務視為待重測效能警訊，不能用technical PASS掩蓋；此輪未跑390px，先處理明確POV缺陷。
- owner從A20b第一人稱圖追查到fadeOccluders仍對全場選手做建築淡出，造成透牆與窗框懸浮。新增產品函式執行測試，修正前10/12、兩項第一人稱牆／屋頂斷言失敗；修正後12/12 exit0。舊8項全保留，新增俯瞰與legacy行為保持測試，不調低門檻。
- major POV現在立即還原所有牆、局部地標、屋頂及結構，俯瞰仍使用遮擋淡出；不改碰撞、AI或legacy。browser量測新增fadedWalls／fadedRoofs實際狀態斷言，每圖多一項，完整雙尺寸A21b待驗證。

- A21b雙尺寸各24/24 exit0，24PNG像素全部MEASURED、0ERROR，POV牆／屋頂淡出均0。兩尺寸來源28檔SHA-256一致：`b2515d816289e22aa21853f4aef12adfabedb14f091d2e5d569611a7a65b541c`。完整集已送獨立視覺複核，未挑選子集。
- 桌機FPS60.14／59.91／59.91，p95 16.9／16.8／16.8ms，calls651／663／683、triangles56564／54880／56888、texture31.61MB、heap240／466／487MB，cold-ready13.4／20.7／23.1秒。
- 390px FPS60.12／60.14／60.10，p95 16.9／16.8／16.8ms，calls650／662／681、triangles49910／51332／52270、texture27.61MB、heap224／450／485MB，cold-ready14.1／20.8／23.3秒。水務掉幀未重現，原因未確認；手機真機仍未測。
- 載入拆解：地圖建立desktop132／148／146ms、390px160／128／149ms；模擬約3.9／17.1／19.4秒及4.1／17.4／19.5秒。A20b與A21b每圖都有sim:worker-fallback，尚不知是DEV環境或產品Worker問題；依debugging skill停止新增功能，補有限長度reason診斷再重現，不猜原因、不以畫面可用忽略主執行緒阻塞。

### A21b 獨立複核與載入根因定位

- reviewer完整看24/24PNG、三張anchors與兩份像素JSON，未讀程式或先前分數。Art2／Hero1／Obstacles1／Interactables1／World1／Materials2／Lighting2／VFX0／UI1／Performance2，平均1.3/3。owner對照取相同或較低結論，World仍1，不放行A。
- 已觀察到的automatic failures：主世界重複矩形建築／場外稀疏平地、人物同輪廓換色、390px detail／POV資訊卡遮住近場。19/24張edgeDensity<.04；材質／明暗指標改善不等於空間成熟。VFX0是此靜態證據集未展示事件，不推論程式沒有VFX。
- 下一步應改善active／overview的競技構圖與場外延伸，減少三圖共享巨大廠房輪廓，並讓地標與交戰區具尺度層次；不再用增加表面紋理或小裝飾代替空間改善。人物與手機卡片仍屬B／D未完成項目。
- 兩次獨立DEV診斷都重現worker-fallback。補filename／line後定位`@react-refresh:603:1`的`window is not defined`；尚未更改Vite／部署設定，沒有假造window或繞過Worker錯誤。新`browser_check_cs_major_worker.mjs`直接執行production bundle的真實Worker，對三圖major＋水務legacy與canonical完整SHA及主執行緒心跳，目前驗證中。

### Production Worker 驗證完成（2026-10-03）

- 首版gate以Node對Chrome完整SHA，8/12失敗；追查首個差異為位置／角度最後位元，例如14.191152139847034對14.191152139847032。這是錯用跨JS環境作逐位元Worker等價oracle，不能據此修改產品模擬或四捨五入所有座標。追加大量差異資料的第二輪另遇CDP WebSocket HARNESS_FAIL，保留兩份失敗紀錄。
- 正確gate直接將同一production Worker bundle的canonical handler也在瀏覽器主執行緒執行，精確比對兩份完整SHA；測試頁暫時攔截同步回覆後立即還原onmessage／postMessage，產品程式不增加export、不改frames、不使用結果fallback。Node SHA保留為診斷值而非跨環境精確gate。心跳只計Worker期間，不混入刻意執行的同步對照。
- 最後12/12 exit0，三圖major與水務legacy全數完成、完整SHA各自一致。Worker耗時約5.62／7.10／21.09／2.79秒，主執行緒最大心跳間隔27.2／28.5／46.7／26.6ms。證據`review/cs-major-upgrade/evidence/worker-production/gate-1791036337143.json`，包含實際bundle檔名及SHA。
- 結論限於：本機production bundle的真實Worker可用且與同瀏覽器canonical等價；DEV React Refresh問題仍在，未改全域Vite設定。此檢查不等於正式玩家進場／恢復流程、手機真機或全部seed已驗。模擬21秒仍偏長，後續需針對pathfinding成本改善，不以Worker有回應冒充載入已快。

### A22 場外區域輪廓（2026-10-03，進行中）

- 回應A21b World1複核，三圖不再共享三座相同巨型外圍廠房；保留兩種CC0建築但依區域重新安排尺度、方向及位置，讓近場地標不被背景倉庫搶走。
- 水務前景為三座開放濾池、刮泥橋、池壁與維修步道，增加共用geometry的植栽instances；貨港為開放轉運雨棚、工作船與既有岸線；鑄造改為儲氣設備與水平管廊。均為競技邊界外的背景，未新增可行走掩體或第二套碰撞資料。
- 場外基座保護區調整至新設施位置；海岸東側高度維持海平面，不把船／港機套入陸側丘陵。建築沿用共享atlas，池面／船窗使用既有無貼圖面板材質合批，不加動態燈、反射pass或新貼圖。
- scene72/72與build已2/2 exit0，git diff --check無錯；未放寬35000三角形／90批次預算。正在另存`phase-a22`雙尺寸實際GPU／完整截圖，尚未宣稱品質或效能通過。A仍進行，B–E未完成。

### A22 完整量測與下一個缺口

- 桌機／390px各24/24 exit0、24張PNG、像素各12/12 MEASURED／0ERROR。兩尺寸來源28檔hash一致：`4316573f95c450a380f7bce96334df591af7e8bc224c78187f7975ddee0974de`。
- 桌機三圖FPS59.27／59.52／60.10、p95全16.8ms，calls652／664／682，triangles56154／53538／55660；texture約31.61MB、heap241／310／532MB，cold-ready17.3／20.9／23.0秒。
- 390px三圖FPS59.93／60.10／60.13、p95全16.8ms，calls651／663／681，triangles48974／49992／50986；texture約27.61MB、heap248／456／493MB，cold-ready15.9／19.8／24.1秒。此為同一AMD桌機GPU、DEV Worker fallback環境，不能冒充真機或production載入測試。
- runtime環境三角形桌機34582／32078／32756，390px27404／28534／28084；無新動態燈或貼圖。相比A21b渲染總三角形下降，p95未見明顯回歸；heap單次讀值有GC／時間差異，不推論記憶體已最佳化。
- owner檢視三張桌機全景及390px水務active：場外功能輪廓有差異，但競技區內仍有重複封閉屋體，水務窄版active上半部大塊海面、人物依賴名牌。A仍未通過；下一步先修正自動導播過大的固定距離／邊界留白，再改善Bombsite主體與交戰空間，不以新增場外裝飾代替內場品質。

### A23／A24 交戰構圖與據點內部

- A23自動鏡頭使用`fitFpsCombatCamera`，取實際交戰群邊界，保留4m周圍、腳頭及地形高度；透視水平／垂直邊界分別0.82／0.78。玩家指定全場／POV及legacy不變。
- A23桌機三圖約59.2／59.9／60.1FPS、calls637／665／682、triangles53288／53492／55626；390px約60.1FPS、calls648／660／678、triangles47786／49958／48996，p95皆16.8ms。原始metrics及24張PNG保留`review/cs-major-upgrade/evidence/phase-a23`。窄版依然是桌機GPU，不是手機實測。
- A24發現僅框角色可能裁掉遠端已安裝炸彈，因此加入獨立objective錨點（不混算actorCount）；lookAt高度與解算高度一致。兩個新增測試用真實Three相機驗證遠端炸彈及角色的四周／腳頭，12/12通過。
- A24水務新增`pressure-gallery`，原69,10的16×7m建物外框不變，南北入口皆4.8m；箱體移至71,22保留A點西側低掩體而不堵門。採光屋面與薄框窗沿用現有合批資產、無新增燈或貼圖。scene72/72通過，三圖模擬與實機截圖仍待完成。

### A24驗證結果與A25貨港立面

- A24三圖simulation24/24及桌機／390px各24/24 exit0；兩尺寸來源hash`0d4a8860354223207177632e929e159e48a1db214e8f0058a0179735b72ddc6c`。
- 桌機三圖FPS60.09／59.90／58.70，p95全16.8ms，calls643／665／682，triangles52684／53492／55626；texture約31.61MB，heap230／355／580MB，cold-ready15.2／19.1／22.5秒。
- 390px三圖FPS58.42／59.57／60.07，p9516.9／16.8／16.8ms，calls652／660／678，triangles47390／49958／48996；texture約27.61MB，heap223／445／472MB，cold-ready15.0／22.4／24.6秒。皆桌機GPU與DEV fallback，非真機／production載入證據。
- A25只改貨港兩類密閉工業建物。冷鏈庫用白色隔熱板、藍色帶、氣密閉門及平頂冷凝機；裝卸倉改大型閉合捲門、護角、結構柱，與維修工位區分。所有裝飾共用原solid／closed-panels批次與淡出，碰撞不變；不增加動態燈、透明效果、貼圖或render pass。
- A25 CPU scene72/72、build通過，貨港三角形桌機32634／mobile29010、73批次。單圖桌機／窄版GPU與新截圖待驗，A仍不放行。

- A25貨港最終桌機／390px各8/8 exit0；FPS59.9／60.1、p95均16.8ms、calls665／660、triangles54112／50498。8張PNG全部像素量測，0ERROR。owner已檢視桌機active／全景與390px全景；冷鏈庫有獨立辨識，但其餘大面積重複屋頂、地表空曠與人物小仍是缺口。A未完成，這不是premium scorecard通過。

### A26 地表分區

- 沿既有導航路徑的道路切換到既有terrainMat／terrainAtlas，水務使用碎石tile1，貨港／鑄造使用瀝青tile3；沒有新增圖片載入、材質或draw call。據點仍是混凝土，A／B透過材質色調區分，保留原有字母／警戒線。
- 新增地表齊平排水格柵，固定沿大建築外側，不佔碰撞；全部合入Site_safety-lines。同時為標線與格柵設定獨立微小lift，避免與鋪面z-fighting。
- scene fixture補上道路幾何，新增六項材質／atlas格／法線測試，78/78與build通過；此fixture不是導航oracle。三圖環境幾何仍低於35000／90，不放寬預算。GPU與全狀態截圖驗證中。

- 首輪A26桌機水務／貨港約57／56FPS、p9533.3ms，鑄造59.7／16.8ms；未改程式的隔離重測水務／貨港均約60／16.8ms、16/16 exit0。暫未重現，原因未定，保留兩次完整證據，不將技術PASS當作首輪效能合格。
- A26b為streets折點合批12面CircleGeometry，去重後補上矩形道路之間的尖角缺口；使用同一高度函式、材質與Mesh，不新增碰撞。scene78及build通過，新的三圖雙尺寸量測待完成。

- A26b雙尺寸各24/24；桌機58.3／60.0／60.1FPS、窄版57.5／59.6／60.1FPS，p95全16.8ms；24PNG像素全MEASURED／0ERROR。只證明當次桌機GPU，不排除首輪A26波動或真機風險。

### A27 結構金屬材質

- 現有金屬掃描的青色與深色roof頂點色重複相乘，讓不同屋頂／設備都偏暗青。保留同一次albedo採樣，只在major結構atlas右上金屬格以luma計算中性基底，再混回12%原色；不改光照／exposure、不加emissive或post。
- material新增atlasRole，地形材質明確指定terrain，因此碎石tile1不會被誤作金屬。兩種shader使用不同cache key；legacy不套新映射。實際Three版本0.160.1，延用既有可編譯的onBeforeCompile與textureGrad路徑，不照抄skill的r184新API。
- scene新增六個角色／program cache隔離測試至84/84，build通過；GLSL實際編譯、畫面對比、效能仍待phase-a27 GPU證據，不宣稱premium。

- A27雙尺寸來源hash一致：`2e1436658a3fd621b597ee8768f00229f84079be481958186112d64a240b675f`，各24/24 exit0。桌機三圖FPS59.51／59.28／60.01、p95全16.8ms、calls643／665／682、triangles53032／54580／56106；texture約31.61MB、heap227／318／537MB、cold-ready16.6／20.2／24.0秒。
- 390px三圖FPS60.14／60.10／60.12、p9516.8／16.9／16.8ms、calls652／660／678、triangles47738／50966／49476；texture約27.61MB、heap208／429／475MB、cold-ready16.5／20.2／22.6秒。仍是桌機GPU／DEV fallback測量，不是真機或production載入測試。
- 24PNG像素全MEASURED／0ERROR；完整capture、兩份pixel metrics、scorecard及anchors已交獨立唯讀reviewer，不提供建置背景或舊評分。owner已檢視貨港active及水務POV，材質可讀性改善但沒有宣稱場景完成。

### A28／A29 閉合立面與窗框層次

- A27獨立複核平均1.5/3、World1：大面積箱形量體、平面窗及缺乏功能連續性的地坪仍不合格。A28由限定環境模組的worker改為0.28m深凹龕，水務拱形採光、货港服務面板、鑄造設備凹龕；保留封底與至少1.25m窗台，不冒充可通行房間。屋型依用途取代index循環。
- A28三圖雙尺寸各24/24、24PNG與像素各12/12，來源hash均`00cbcc1d5ca8d1ad21d312098a969fd7919ad6742646e3fed2d53c3590b03d71`。桌機FPS58.95／60.16／59.73，窄版58.45／56.69／58.20，p95全16.8ms；calls桌機643／665／682、窄版652／660／678。貼圖桌機31.61／窄版27.61MB，heap桌機239／367／483、窄版194／431／480MB。仍非真機或production載入驗證。
- A29先補水務工業採光窗格與內緣暗邊。首次使用完整box造成37,216三角形，scene83/84失敗；薄條改雙三角平面後33,216、68批次，scene84/84與build通過。未放寬原35k／90門檻，不新增貼圖或材質；本輪水務雙尺寸GPU待完成。這是局部可讀性工作，不能替代整體場景完成度。

### A30 相連設備組合

- 水務(62,44)/(64,78)泵機罩、雙壓力筒與管匯，(84,42)錯高調壓罐；貨港(7,15)/(61,78)/(78,78)吊修桁架、控制室、吊具與待修機組；鑄造(44,47)/(65,72)/(53,61)捕集罩、煙道、集塵筒與排氣管。替換舊generic屋頂／parapet／雨水管，不重複堆疊裝飾。
- 水務(62,44)、貨港(61,78)、鑄造(44,47)降低共用hgt至4.5，使設備進入較低視角；實際W.vy乘0.92後為4.14m，仍高於最高平台眼高3.96m，避免2D LOS仍阻擋但目視穿過基座。未新增可站立區域或改平面路徑。
- 原創低多邊形設備與既有原創atlas／CC0建築混用；圓件桌機8／手機6段，所有設備合批，沿用現有局部遮擋及dispose。CPU桌機33972／30150／32224三角形、手機28270／26694／27172，批次71／77／87。
- 新增12項足跡／眼高檢查；初版hgt4.2先94/96失敗，再4.5修正96/96。camera12/12通過，最終三圖simulation／build runner執行中，GPU／新圖待驗，不作場景品質完成宣稱。

### A31／A32 近景一致性與連續設施

- A31major追焦不再因遠方選手把背景廠房淡出；實際水務detail外殼恢復。雙尺寸各24/24、三圖約59–60FPS／p9516.7–16.8ms，但窄版水務p9933.3ms警訊保留。角色bounds profile子樹327.8→45.5ms，整體profile FPS沒有提升，不能宣稱整體問題已解決。
- A32鑄造以相連供料棚／料斗／輸送廊接西廠房，南側管匯接儲氣槽與低服務棚；貨港兩真房間以厚門框、捲門箱、I形屋梁與牆帶維修設備形成室內功能背景。保留4.8m門寬與3.6m門高，不另建碰撞或封住另一扇門。
- A32major DEV可見性診斷重用世界矩陣與bounds，不刪檢查／不降頻。新增bounds等價6項（總14）、實際snapshot原生／major完整等價8項，均exit0。scene96／camera15／build通過，幾何水務33972、貨港30894、鑄造32762，71／77／88批次；新GPU及全24張畫面仍待驗。
- 一般command確認、進度條／整體及小任務ETA偏好已保存到隔離分支AGENTS；整體剩餘暫無可靠估算，小階段驗證預估20–40分鐘，不含休眠。每週usage沒有可讀工具，不宣稱已建立自動0%停機。A仍未完成，B–E未完成，Owner Review尚未就緒。

- A32完整雙尺寸GPU各24/24與24PNG完成，獨立審核World1.5／平均1.4仍退回，尤其鑄造detail／POV的大牆與封窗。DEV診斷profile子樹採樣1592→1110ms，原尖峰保留；CPU速度或新增周邊棚架不能代替中央空間品質。

### A33 中央製程空間

- 鑄造(44,47)與(53,61)原實心基座改成中央集塵廊／澆鑄工位：7m高、4.8m真雙入口，保留原外框，分別沿南北與東西穿越；空間真相由共用room walls產生。梁軌／罩在3.9m以上，維修／製程件在無門側0.8m牆帶，地面不新增不匹配的裝飾阻擋。
- 房間牆／門設備／地坪合批，major材質統一使用最小遮擋fade，POV全部恢復不透明；legacy呈現與模擬不變。原封閉設施改為closed wall＋process room三owner守門，不取消footprint／眼高目的。
- 新ray檢查找出道路四角採樣產生遠距浮起斜面；跨平台段按≤2m×4細格採同源地形，平地維持兩tri。scene102／bounds14／snapshot8／camera17通過，幾何34138／31084／33720tri與57／62／77batch，完整模擬／build及GPU待驗。A仍未放行；人物、戰術、HUD／Replay／Stats與真機缺口保留。

### A34 精確路段快取與下一輪造型入口

- A33完整24PNG獨立審核仍World1.5／平均1.40；鑄造通道已可看穿，但大門楣／石牆／青柱缺承重關係，貨港白框與住宅窗突兀，水務大藍窗仍重複。下一輪限定玩家眼高主要造型、板塊與材質整合，回收原重複幾何，不能靠加外圍孤立物求通過。
- 新通廊增加導航成本，A34以每場major有界精確／有向路段cache修正，不改路點、clearance或結果；三圖完整等價23與正式baseline simulation24通過。browser鑄造cold-ready桌機42.37→12.96秒／390px39.58→12.62秒、frames仍2636，畫面calls／tri／texture不變；兩尺寸各24/24及像素12/12。
- A34桌機貨港原單次max116.7ms保留；同source隔離複核8/8，FPS60.12、p95 16.8／p99 17.1／max17.4ms、calls653、tri52628。這次未重現長幀，不能推論永久零卡頓。真正手機、POV效能、完整生命週期記憶體仍待後續實測。

### A35 主要建築構造替換

- 鑄造兩個製程通廊採耐火牆裙、4.5–5m主柱跨、深灰鋼骨與承重門梁；原巨棕門楣換退縮封閉上板，上板與門牆共同fade，避免屋頂淡出時斷裂。4.8m門洞與既有中央淨空不變。
- 貨港維修庫／通關轉運廊採整高鋼柱、低部封板、高位工業採光與深灰裝卸門架；真正使用CC0厚門框／窗套，統一頂點塗裝而不放入dummy來源。附近(64,58)封閉建物改高採光／低裝卸面，不新增假入口或可射穿窗。
- 水務三個主要設備站改厚砌體墩、高位小幅採光、壓力房窄槽與封閉檢修板，替換原大藍窗及重複窗格；凹龕仍0.28m且完整封底，不能走入。
- 短scene102／camera17／production build已通過。CPU三圖desktop33724／31732／34728tri、mobile28162／28156／29778tri，batch57／62／77；貼圖、批次、即時燈不增加。鑄造距35k僅272tri，後續仍須幾何回收而非堆加。GPU雙尺寸完整24PNG與獨立品質複核待完成；不把CPU通過當作World或A完成。
- A35完整24PNG新獨立複核仍World1.5／平均1.45，主要空廊、盒體與園區接合未達標。A36核心是「工位作為真掩體、中央通廊作為實際rotate／peek空間」，用room.fixtures統一collider／LOS／navigation／render，保留4.8m物理直廊（角色中心帶扣半徑後2.1m）；低水務主泵樓改同footprint真雙門廊。closed服務閘門仍是實體封板，不暗示新出界路線。GPU／品質待驗，不先宣稱A完成。
- A36工位封閉底座／背板已由真站蹲射線114/114證明，原35k／90不變；三圖desktop33470／31766／34846tri，mobile28240／28238／30016，batch57／60／73。圖面仍須完整fresh-eyes，不以增加機台或技術PASS代表成熟場景。GPU雙尺寸各24與像素12已完成；水務長幀重現，先診斷production，不繼續追加畫質。唯讀probe只存在隔離驗證建置，DEV關閉，原產品shader／鏡頭／數據不改；輸出與DEV量測分開保存。
- 最新完整28PNG盲審World1.5／平均1.55，水務detail兩尺寸及重測均0，厚梁遮選手是P0視覺缺陷。先修實際遮擋，不靠提高光照、增加屋頂機械或全場玻璃化掩蓋。production shader trace找到首次透明雙面背面program等待，屋頂一次性預熱8/8與首次GPU8/8通過；仍需不含trace重測及真正遮擋定位，A未放行。

### A37 視覺透明與GPU program一致

- 實際ray／GL查到Building_7 opacity≈0.16但version0、compiledOpaque=true；是數值與shader不同步，不是需要移除建物。major透明模式變更才needsUpdate，局部bounds與共享min fade保留；POV恢復真正不透明、legacy原行為不變。新4項真Three material守門加原17至21，沒有放寬舊斷言。
- 雙尺寸production各27/27、24PNG像素皆MEASURED／ERROR0，同source hash2a6e50fea3f8efae771aeb5de2fd4362173d4590918780b275502abbece846ee；所有淡出材質的已編譯fragment shader均非OPAQUE，水務完整選手恢復。桌機59.06／60.01／60.10與窄版60.13／60.06／60.10FPS，p95全16.8；水務桌機仍p99 33.4／max50.1ms，窄版max≤17ms，保留波動、不稱永久零卡頓。沒有新貼圖／幾何／燈光，scene114／fixture15／warmup8／camera21都重跑通過。
- 本輪切到production取證、DEV關閉，不拿與舊DEV baseline的差異當固定像素受控A/B；DPR與shadow品質不降低。calls仍超技能建議，需要B／E實測改善；JS heap不是VRAM。完整24PNG已交只看scorecard／anchors／metrics的獨立review，未收到World放行前不開始B、不稱premium或READY_TO_REVIEW。

### Phase A 階段結案，Phase B 入口

- A37獨立審核已完整查看24PNG＋3anchor：所有World2，scorecard依Art／Hero／Obstacle／Interactable／World／Material／Lighting／VFX／UI／Performance為2／2／2／1／2／2／2／1／2／2，平均1.8；整體非premium。390px detail／POV展開卡遮路徑是仍在的automatic failure，列入D；互動狀態／VFX證據列入B–D，重複立面／空曠周邊列入E，不能宣稱頂級品質已完成。
- 新正式dist build23.74秒exit0；`fpsSim.worker-CQI4-CNW.js`三圖major與mirage legacy同瀏覽器canonical完整SHA一致、完成／主執行緒回應全部12/12 exit0。證據`review/cs-major-upgrade/evidence/worker-production/gate-1791107568881.json`；Node／Chrome最後位元差異未放寬同環境exact守門。
- `■ A　▣ B　□ C　□ D　□ E`：A的場景階段技術與最低視覺門檻通過，才開始B唯讀稽核；整體goal仍active，未READY_TO_REVIEW。B先找持槍socket／槍族姿態、真事件feedback與音效pooling缺口，不改frame／simulation RNG／MOBA／Router／Result。已完整載入VFX技能與gameplay-workflows／game-feel／game-feel checklist；不用技能範例hitstop去更改競技回放時間或模擬。
- 官方codex週額度剩17%（2026-10-04 17:55臺灣），0%停新工序／子代理並pause goal；B稽核小階段估15–30分鐘，不含休眠。整體餘時待B–D實際稽核重估，不復用已撤回的工時；不push／deploy。

### B1 真實手骨持槍與槍口

- major產品明確啟用手骨姿態，五槍族原創模型的grip socket對準GLB hand_r，muzzle提供世界position及原生+X方向；不新增可繪資產，不做假bone。短flash採真槍管方向，長tracer使用真槍口→權威event.to，同源terrain處理坡地終點。legacy原姿態／高度／效果不變。
- 真GLB及原Aim／Shoot／Walk_Loop／Death01 clips共63項，無新mesh／tri／材質、5200／8原預算；原87項仍檢查純合批等價。FX接線18項涵蓋五族、未ready／非finite／zero方向回退、legacy、seek、事件不改動、244池及釋放。三registry區段3/3與build19.90秒通過；新雙尺寸GPU／24PNG仍待。
- B1不涵蓋左手IK、可靠蹲換彈資料、音訊pooling、POV五族、死亡seek／地形。B1估再10–20分鐘，整體B–E暫估1–3工作天，實際依回歸修正及C／D稽核更新，不含休眠與額度暫停。週剩14%（2026-10-04 18:35臺灣），0%pause，未READY_TO_REVIEW。
- B1實際雙尺寸各33/33／24PNG像素完成，三圖約60.1FPS／p95及p99約16.8ms；同A37資產與DPR／shadow，calls差約−2至+1，沒有明顯回退，仍非真手機。B2只處理暫停／接地／回合及seek生命週期，真GLB19與五registry區段5/5、build通過，新GPU待驗；尚不是B完整交付。

### B2已驗生命週期與持續效能守門

- 原動畫dt、真手骨與槍口在暫停保持不變，直接進入已死後續frame用原clip終態；真GPU兩尺寸各42/42與24PNG像素完成，legacy原流程不變。地面陰影為無厚度薄片，DoubleSide單pass保留混色／opacity0.38，每圖少1次draw、實際version0，無新貼圖／Mesh／燈光。
- 首輪及後續長幀不能忽略；60秒trace一次透明Standard shader等候79.59ms，已把符合此特徵的真投擲物材質加入major準備期預熱，12項取消／去重／釋放守門通過，GPU排程重測中。其他100ms級RAF間隔仍未歸因，不宣稱GC或單pass已解決一切。
- 延長量測跨回合時沒有屍體，原13/14失敗保留；動畫生命週期仍用原10秒交戰情境與完整assertion，60秒效能另驗。新版正式build／Worker尚待，先不新增畫質。人物備持、雙手協調、可靠蹲換彈、POV五族、音訊pooling與手機卡片仍待B–D，不稱premium或READY_TO_REVIEW。

### B3已驗音效呈現切片

- 原生Gain／Panner graph有界lazy重用，桌機64／窄版32；一次性錄音source自然回收，暫停／靜音／seek／換比賽取消舊排程。真CC0錄音與權威shot ID維持一對一派送政策，不靠合成槍聲。major腳步用真相鄰frame位移與新事件ID；左右聲道依世界位置及鏡頭right，觀戰listener在焦點，POV在眼睛，不冒充HRTF／室內聲學。
- pool22與Playback25、八registry區段、正式build／Worker12、雙尺寸69與完整24PNG像素已驗；原生PCM／Node graphs證據見最新Sprint節，390px仍為桌機GPU。首輪resume等待前提與缺舊runtime檔失敗均保留，沒有刪assertion或補假資料。
- 同來源60秒開聲／靜音約59.73／59.85FPS、p95／p99 16.8ms，沒有持續明顯回退但49.8ms尖峰仍在。B3只是pool／播放生命週期切片；備持／跑射、可靠蹲換彈、POV五族、環境音、UI遮擋與C–E仍待，不稱premium或READY_TO_REVIEW。

### B4已驗通用備持／跑射動畫切片


- 使用既有真GLB Pistol_Idle_Loop／Aim／Shoot作通用上半身53骨，腿部Idle／Walk／Sprint互斥分層，真shooting edge不重置腿部相位。共享clip／tracks但不共享action；原Hit／Death、legacy、pause／seek／reset與floor contact保留。沒有來源的蹲換彈不補假動作，也不把手槍來源冒稱五族專屬／雙手IK。
- Node26、八registry、C5A.1 17、正式build／Worker12，GPU1366與390各78及24PNG完成。M／D／I桌機59.65／60.10／60.10FPS、p99 16.9／16.8／16.8ms，窄版59.95／60.06／60.11FPS、p99全16.8；calls及貼圖不增。水務max33.4ms、heap快照及真手機限制保留。新診斷用masked上下層真action時間，不以舊full-action 0當分層時間。來源d69464c80f67e14b750224a622786eb3cda3b7c4f5e109662b05fb46b491ec4a；evidence/phase-b4-pose-layers-production/。B只完成B1–B4切片，POV／可靠蹲換彈／音訊polish與C–E、premium整體品質仍待。

### B5 POV顯示修正與B6人物方向（2026-10-05，尚未結案）

#### Owner 人物美術追加驗收（2026-10-05）

- 人物必須有帥氣服裝、自己的風格與特色；臉部要看得出輪廓，裝備與攜帶道具需要可辨。只有連續蒙皮／重染色不等於完成。
- 原創隊伍方向：CT偏俐落戰術制服、清楚胸背護具與通訊頭戴；T偏層次野戰外套、圍巾／頭巾及有用途的背包、腰掛。保留既有角色／職能的呈現差異，不新增假的gameplay職業或狀態。
- 必驗兩隊前／側／背近鏡頭、持槍與死亡姿態；衣服不能像裸肌染色，道具不能埋入身體或只靠小色塊表示。避免過大頭盔、過量小Mesh、遮滿全臉、照抄CS官方造型或未授權素材。
- 效能仍是硬門檻，優先共用geometry／material、合批固定裝備、控制真skin與shadow成本；手機差異需要實測，不降DPR掩蓋回退。

#### B6 目前驗收與下一步（2026-10-05）

- 已接回真蒙皮輪廓與眼眉，不發光；共用衍生服裝geometry、4個既有材質及原65骨架，隱藏26個替代proxy。此底層改善仍不是帥氣服裝的完成宣告。
- 兩隊六視角原生近拍揭露UV重複頂點獨立平滑造成褲腿裂縫；接縫共用鄰域／同步膨脹後大裂縫消除，Node新增996接縫連續檢查、16/16通過。`phase-b6-seam-safe/1366` 20/20只證明該次啟用的技術gate，領口鋸齒、頭戴、配件辨識與一致取景仍需修整。
- 服裝設計接續必須把領口、肩部層次、胸背護具、腰掛與角色職能整合成可讀輪廓，而不是往人體表面堆小方塊；臉部保留鼻梁／下顎／眼眉辨識，不以全員蒙面替代臉部美術。
- 60秒開聲效能同品質對照正在執行；B6增加真skin及shadow成本，不能僅因draw calls下降便認定無回退。正式Worker、三圖雙尺寸、死亡與真手機仍待完整驗收。

- POV借用既有真五族 geometry／material、grip／muzzle，不造替代武器；角色ID查asset，私有手／flash與事件時鐘。major camera必須在scene hierarchy才渲染子Mesh。首輪87技術通過卻無可見槍的失敗已保留並補scene gate；修正來源401bf403d6a065e2edf7c2d30bc034b9bb3827975aa9c4e9e5e6e643d256a9ad、Node25／Worker12／兩尺寸87與24PNG保存。近看槍造型仍方塊化，列後續原創武器美術，不冒称成熟FPS品質。
- 短樣本390max166.7／150ms保留；同品質60秒靜音B4／B5約59.99／60.02、p99均16.8，開聲A/B仍待。POV另3秒paused raster只證明該情境成本，不是完整交戰／真手機。效能門檻未確認前不增加角色幾何。
- 人物改造應major-only衍生連續蒙皮服裝取代Cylinder／RoundedBox proxy，保留65骨與socket／原動畫；不可直接露出來源superhero肌肉，也不可修改共用source geometry。計實際可見tri、共享生命週期、mobile shadow與同鏡位實測。可靠蹲換彈資料、槍造型、環境音、D遮擋與C–E仍待，未READY_TO_REVIEW。

### B7 動作資料切片與武器精修 brief（2026-10-05，續跑）

- 唯一彈量來源：major回合初始化 `fpsWeaponHandling.js`，每把容量、三匣備彈；手槍1800／SMG2200／步槍2500／狙擊3000／霰彈2800ms換彈。這是本遊戲候選設定，非官方CS規則。真射擊逐發扣彈；空匣後才換彈，死亡取消、拾槍保留剩彈。禁止靠呈現層補算彈量。
- 蹲姿來自模擬靜止hold／cover／engage；目前沒有蹲走或命中倍率。frame只存純量與round-local ms，真GLB蹲姿腿部／通用Pistol_Reload上層互斥，以保存時刻定位action。五族專用換彈美術仍未完成；legacy無新欄位／RNG，逐格與固定baseline守門保留。
- 21項新動作verifier、26項B4、19項生命週期、25項POV、20項服裝、24項三圖simulation、build及正式Worker12項已過。首次19/21與過時B4 literal禁止新接線25/26完整失敗log保留，修正原因見Sprint新節；未跑全121段。
- Mirage真UI換彈中途pause／seek與蹲姿，1366／390各27/27 PASS exit0；固定browser情境的Dust2／Inferno沒有合適換彈中段，列SKIP_NO_ELIGIBLE_FRAME。Node Inferno有9個換彈frame不能替代Chrome情境。兩次缺前提HARNESS_FAIL exit2保留；不改seed／產品／門檻。
- 武器精修：五族沿用原創Vector-9共享第三人稱／POV來源。以切角機匣、可讀握把、槍托、護木、鏡筒及功能性表面取代方塊輪廓；保留真grip／muzzle，增加各族support grip。掌心、指節、拇指與袖口使用合批私有geometry，貼來源socket；不增加命中／碰撞規則。
- 技術美術：共用metal／polymer／dark材質，不新增貼圖、燈光或post；細節沿剛性mount合批，POV借geometry／material、手部資源私有且dispose一次。每族POV總mesh≤12保持，新增三角形預算每族≤1500；DPR／shadow不降以掩蓋成本。交戰draw calls既有約490–523超初始技能建議，E仍需量測優化。
- 本輪已讀AAA visual-scorecard、implementation-blueprint、model-recipes、render-recipes、technical-art與procedural／performance checklists。threejs-3d-generator／image-generator／audio-generator在技能path ladder均不存在，使用Director fallback；Git Bash官方probe已實跑，`TRIPO_API_KEY=MISSING`、`GEMINI_API_KEY=MISSING`、`ELEVENLABS_API_KEY=MISSING`（完整輸出在ignored evidence/b7-asset-credential-probe-20261005.log）。不假稱已讀缺失技能或成功呼叫生成API。
- 資產ledger：人物沿既有Quaternius CC0 rig＋原創服装atlas混合；武器原創程序精修，外部3D來源受上述缺技能／credential阻擋；手部原創程序合批；音效沿既有CC0真錄音，環境音仍待可靠來源與接線。缺外部來源不等於premium通過，圖片驗收、完整效能與真手機仍待。

### B7 Owner武器品質追修：來源模型、真手、權威POV換彈（2026-10-05）

- Owner否決程序積木槍，前節程序來源限制已由實際合法下載解決。major-only以五族CC0 GLB取代程序主體，人物與POV共用geometry／PBR；各作者、原包、處理與限制見public/assets/fps/major-weapons-v1/SOURCES.md。並非22槍逐一或Valve原作素材：AWP仍共用SVD、Deagle仍共用M1911，逐槍外形對應是可見品質風險。
- 擷取既有Quaternius來源真手指權重與瞄準骨姿，鏡像／平滑法線；每手1658tri，POV私有clone與袖口貼合。握點至槍口採pistol .23／smg .25／rifle .52／sniper .74／shotgun .55m，沿原grip／muzzle／support定位，不改彈道或碰撞。
- 長槍白模根因是來源Blender材料未輸出PBR factor；新增Principled材料與保留面材質分區後，金屬／聚合物／木件實際可見，失敗比較圖仍保存。硬質反射共用有限DataTexture，末一actor釋放，不增常駐點光源。
- 成本：武器2243／2708／3888／5388／3047tri，分族上限2400／2800／4000／5500／3200；本體<17000、私有kit≤5200／材質≤8維持，整人新增明列22000上限。服裝fixture改用實際來源模型，新增成本與legacy反例21/21；不把新增幾何當免費。
- POV只讀保存frame的version=1換彈時間，通用抬轉槍與支援手姿態；不是作者五族專用clip。首次browser 28/30 PRODUCT_FAIL因相機追焦資料缺handling欄位，major接線改讀同一frame玩家後桌機30/30、390版46/46重驗通過。Node33/33，不用牆鐘、不寫ammo。
- 環境音採SketchMan3 CC0 wind-loop原檔，251584 bytes，沿原單AudioContext控制loop、frame offset及低通／gain。純14/14、較早390三圖132/132與最新版Mirage46/46原生PCM／pause／mute測過；OS喇叭與真手機未測。
- 最新雙尺寸三圖完整圖庫、60秒長樣本與獨立盲視覺review正在補驗。技術PASS不表示達到Owner要求的CS畫面或premium門檻；B7、C–E與A最終polish仍待，不push／deploy。

### B7 武器品質盲審、共享材質與M4真PBR追修（2026-10-05 UTC07:47，未結案）

- 舊版完整75張獨立Fresh-Eyes盲審平均1.4/3，採較低分，報告review/cs-major-upgrade/VISUAL_REVIEW_B7_20261005.md。粗簡手套／袖管、重複人物／方形建築與窄版人物卡遮槍尚未達Premium；新追修需再看全套圖片，不沿用舊評分作新版本驗收。
- B1原socket補跑53/63，改真GLB fixture仍53/63，實測每actor武器複製19材質超原private 8。新增按共享reflection environment鍵控的有引用計數材質池，原來源不改，最後lease才dispose並先於reflection釋放；原本private geometry≤5200／材質≤8門檻保留。fixture改載實際五族GLB並檢查真import、無Mesh socket與原成本，63/63。完整原FAIL與診斷log保留；不是單改fixture消除真正產品成本問題。
- 手／袖新增袖口皺摺、私有微表面與權威支援手逐次更新。首輪38/38雖PASS，production build警告THREE.RGBFormat不存在，保留log且不當紋理正常輸出；改合法RGBA資料、增加真資料／末一釋放反例，POV35/35。新版面板移出POV戰場，真UI檢查panel與canvas不相交、控制44px、無水平溢出，雙尺寸各39/39、原生exit0。仍未完成手套美術。
- rifle換為nisu／3DModelsCC0作者CC0 M4A1（https://opengameart.org/content/m4a1-assault-rifle），原Base Color／Normal／Metallic-Roughness縮1K，9236→3772tri，主體＋原Magazine兩mesh，保留4000上限。原ZIP SHA ed5779ec82718861964227e2aad2a900978ea087081154365d6d86246be62f0d，成品GLB SHA 0d8f3f208b7f7b54d56185fa69abff6541727703ea124fe377579c6dc44da944。首候選FBX父transform重疊產生異常坐標，失敗GLB／JSON／log封存；烘入world transform並解除parent、加入有限bounds守門後再整合。舊Tabasco rifle封存，不丟失來源。
- 真PBR fixture以textured rifle必須內嵌有效baseColor／normal／metallicRoughness texture與原Magazine，取代該族舊純factor三材質條件；未貼圖SMG／sniper原factor和白色反例仍保留。POV35／服裝21／socket63 runner 3/3、exit0，累計22/122非全套。兩尺寸M4各33/33、PASS／exit0。
- POV原Magazine只在私有clone按保存換彈進度抽出／復位，支援手跟真彈匣；不修改ammo／actor來源。純35/35增強pause、前後seek及結束復位。最新phase-b7-author-magazine-reload-desktop-20261005/1366 Mirage41/41；mobile同名phase/390三圖107/107，PASS／原生exit0、原生console/page error 0。fingerprint 909511d50d344feae001f22ecb3230f7be12c5ff52db950249ed4c52b87f59c8（51檔）。只Mirage pistol／sniper有保存中段換彈；rifle及其餘缺情境全部NOT_MEASURED_NO_RECORDED_RELOAD，不改seed／frame、不冒稱步槍browser彈匣已過。圖庫新增每張實測canvas rect，像素工具用exact file匹配；舊缺rect圖保持未測。
- 修改前雙尺寸三圖長樣本各114/114，390 FPS59.605／59.944／59.912、p99 17／16.9／17ms、max150／33.4／33.4；桌機Mirage與runner重疊22秒，保留有負載標記，乾淨同artifact補測59.301FPS／p99 17.2／max133.3ms。這些與舊build22.92秒均不是最新版本最終效能／正式build，不挪用。
- 官方quota本輪codex剩64%，pauseRequired=false。手與袖仍需品質修整；另合法CC0 para/MakeHuman FPS arms原包已下載至ignored evidence供評估、尚未整合。Windows tar無LZMA，使用官方7-Zip portable 7zr置tmp解壓，不作全域安裝、不提交。B7未完成，C／D／E待；新工作未commit、不push／deploy、不動MOBA。

### B7 解剖手型與GPU隔離取證（2026-10-05 UTC08:15，驗證中）

- 合法CC0 para／MakeHuman FPS arms替換POV手部靜態幾何：只用原手指／掌骨權重、離線自製曲指握持姿態，3196→1756tri／手，保留1800上限；不採來源皮膚貼圖、sample animation／IK runtime，不改第三人稱原Quaternius。原hands.glb封存，來源／處理／ZIP及成品SHA已記public SOURCES。POV私有clone加原創掌背／指縫／袖口色與微表面；袖徑縮細、布色降低飽和。面板次級文字GC.blueL，現金按$N.N萬。
- 真fixture純35／服裝21／socket63 runner3/3、原生exit0。原hand成本錯用position.count/3，現在按index?.count計真tri；1800上限不變。舊尺寸assert限定Quaternius開掌長厚，改實際人體曲指局部合理長寬厚範圍並增加上限／color attribute長度，不能靠無效巨型／零幾何過關。來源export初輪constraints.clear例外但Blender退出0且沒有成品，判FAIL；逐一remove並加--python-exit-code 1。第二輪保存Pose mode使select_all失敗exit1，轉OBJECT後成功；preview world缺失首輪exit1也保留。
- browser初輪phase-b7-para-hand-grip-desktop-20261005為HARNESS_FAIL exit2、0/0，GPU recent crash且場景atlas未ready。隔離重跑desktop-clean為38/40 PRODUCT_FAIL exit1：shader驗證失敗，整場white、淡出program讀不到，完整PNG／log保留。未針對紅燈修改產品；舊PASS封存artifact與同一新手型artifact各9/9基本gate／exit0／console 0，新手型真POV實圖正常。支持GPU狀態問題，但不把原PRODUCT_FAIL抹成PASS，也不宣稱已證明根因。
- 重新build三圖recovery再次GPU崩潰／CDP失去回應，確認僅本worktree私有Chrome PID100012、profile esmo-cdp-5WjM1e／port60409後停止該Chrome；RESULT=HARNESS_FAIL、原生exit2、0/0，283051ms、cleanup confirmed/profileRemoved，完整log保留。未停止使用者瀏覽器，不以無輸出推論測試通過。
- 工具新增reuseCurrentPhase／reuseWidth，來源完整SHA及檔數必須與該封存build一致，全部public資產逐byte一致；才以同bundle跨地圖／視窗重取證，紀錄bundle SHA／來源關聯且不覆寫原verdict。trace／baseline混用仍拒絕，舊referencePhase禁止新probe規則不變。source drift反例實跑exit1，明確拒絕舊M4／舊手型build，不讓新來源沿用舊PASS。當前唯一GPU session12210，desktop-reuse三圖全武器／圖庫／音效／成本 gate；後續390再驗、像素與完整盲審／正式build仍待。
- 像素advisory在前一909511來源版本：桌機11／窄版29張全部MEASURED、NOT_MEASURED0／ERROR0，真圖庫rect實測。不作Premium／PASS結論、不代替最新手型圖片。B7未結案，C／D／E待，新修改未commit，不push／deploy，不動MOBA。

## 休眠前最新安全停點（2026-10-05，B7 未完成）

- 本節優先於下方歷史 session 記錄。最新 GPU gates 已全部結束，已查無本輪 esmo-cdp／browser_measure／Worker gate 行程，沒有 build 或驗證在背景執行；因 Owner 準備出門與休眠，不啟動下一輪。
- 原 checkpoint commit 已完整建立：0be09c29774c81e06113dc9cc649101d74114658。本輪新實作、素材、工具與文件已保存至磁碟，但全部仍未 commit，沒有 staged；原始素材 assets-source／tmp、browser profile、log、測試輸出不應提交，保留完整失敗證據。
- 最新產品 fingerprint：6e17e6c9cac611869fb8cb6ea747853fb3085e23d03c809e820de09afec19787（51 檔）。封存成品：review/cs-major-upgrade/profile-builds/phase-b7-anatomical-grip-build-20261005-1366。buildOnly 18.11 秒／exit0 僅代表來源與 bundle manifest 保存，browser NOT RUN，不是正式 npm build 或 browser PASS。
- 新版真曲指主手朝握把、支援手托護木；袖口按每手 quaternion 轉換的真腕點接合。POV 純 35／服裝 21／socket 63 通過，原每手 1800tri 上限保留；新增法線／index 合法與真腕點接合誤差 <1e-6，不改模擬、彈量或 legacy。runner 累計 22/122，非全套。
- 最新預設 D3D11 桌機 phase-b7-anatomical-grip-desktop-20261005/1366：Mirage／Dust2 部分 74/74 後 Inferno GPU 崩潰，RESULT=HARNESS_FAIL／exit2，不能算三圖 PASS。僅確認本輪私有 Chrome 後停止，原 log／PNG／metrics 保留；M／D FPS 59.673／60.075、p99 16.9／16.8ms。
- 同來源 OpenGL 三圖 phase-b7-anatomical-grip-desktop-gl-20261005/1366：110/110 PASS／exit0、console/page error 0；真 AMD OpenGL。FPS 18.480／19.040／19.628、p99 100／83.4／66.6ms，明顯慢，不能採為最終效能交付或直接與 D3D11 基線比較。harness 可選 gl／d3d11 僅作用於私有 Chrome，預設不變；真 renderer 前提斷言保留，拒絕 software。
- 最新 390px D3D11 單圖：phase-b7-anatomical-grip-mobile-mirage-20261005/390 為 41/41 PASS／exit0，FPS 58.747、p99 17.7、max166.7ms；phase-b7-anatomical-grip-mobile-dust2-20261005/390 為 33/33 PASS／exit0，FPS59.768、p99 16.9、max49.9ms。兩輪 console/page error 0、Chrome cleanup confirmed／profileRemoved。只是桌機 GPU 的窄版 viewport，不是真手機。
- 下一步醒來先查官方 quota（最近 UTC08:17 codex 剩61%，pauseRequired=false），再以同來源封存 build 單輪隔離補 390 Inferno 與桌機 Inferno D3D11；接著最新像素 advisory／完整同版 Fresh-Eyes 複審、B 正式 build／scoped 守門，才續 C → D → E。最新完整盲審與正式 build 尚未執行；舊版盲審1.4/3不能挪用。步槍 browser 中段換彈缺保存情境仍 NOT_MEASURED，不改 seed／frame 補圖。
- 整體：B ▣（B7 品質與驗證中）→ C □ → D □ → E □。不動 MOBA、不 push、不 deploy；完成後停 Owner Review。休眠期間不承諾背景執行，續跑從本節開始，不重做已完成內容。

## 連網續跑最新停點（2026-10-05 UTC13:35後，B7 複審中）

- Owner 已連網並要求續跑；官方額度 UTC13:28:54 codex 剩59%，pauseRequired=false。原 checkpoint commit 0be09c29774c81e06113dc9cc649101d74114658 未改，新工作仍未 commit／staged；不動 MOBA、不 push／deploy。
- 同產品 fingerprint 6e17e6c9cac611869fb8cb6ea747853fb3085e23d03c809e820de09afec19787、同封存 build，補齊 Inferno 隔離 D3D11：phase-b7-anatomical-grip-mobile-inferno-resume-20261005/390 與 desktop-inferno-resume/1366 各43/43 PASS／原生exit0、console/page error 0、Chrome/profile清理確認。390 FPS60.075／p99 17.1／max18ms；桌機60.078／p99 16.8／max16.9ms，只是10秒樣本與桌機GPU窄viewport，非真手機。原三圖74項部分HARNESS_FAIL與OpenGL低FPS歷史保留，不改原verdict。
- 正式 npm run build 已成功，25.29秒／原生exit0，完整stdout/stderr與exit檔在 evidence/b7-formal-build-resume-20261005.*；既有大型chunk提示保留。與先前buildOnly的browser NOT RUN明確分開。
- 完整同來源6集合共87 PNG像素fallback全87 MEASURED、0 NOT_MEASURED／0 ERROR，各工具exit0；不作Premium證明。完整索引與metrics為 evidence/b7-current-complete-review-inputs-20261005.json，獨立唯讀Fresh-Eyes只收圖片、scorecard與量測，不收原始碼／舊分數，正在逐張審查。
- GPU gates均已結束。當前純驗證runner session25561：11段B scoped，前10段PASS，最後simulation進行中；不是11/11或全套PASS，完成必查原生exit與完整輸出形狀。log為evidence/b7-formal-scoped-resume-20261005.log，runner保存各段完整log及tools/.verify-state.json。
- 下一步收runner與87圖獨立結論，武器／手／袖必要追修及同版重驗後才決定B結案；C→D→E未開始，最終Owner Review。任何新增圖片需納入完整複審，不沿用舊版評分宣稱完成。

## B7 手套／袖品質追修最新停點（2026-10-05，GPU驗證中）

- 87/87完整Fresh-Eyes獨立審核已完成，平均1.6/3；槍械2、握持／手套／袖各1，不放行B7。報告 VISUAL_REVIEW_B7_ANATOMICAL_20261005.md 對應6e17e6…版本，不挪作新版本審核。窄版通訊遮視野與人物輪廓重複留D／E，原三圖74項HARNESS_FAIL與OpenGL低FPS歷史保留。
- 共用手／袖追修：沿私有真手geometry增加掌背／指節墊片、車線色分區，原每手1756tri／1800上限保留；手槍支撐掌改姿態與接觸方向，長槍托握分離；袖增加腕部壓縮、肘折與厚袖口，整套私有geometry實測≤5200，不新增Mesh／骨架／燈光、不改模擬或legacy。袖色讀同一actor服裝材質並copy，來源color不改。
- Poly Haven作者Rob Tuytel CC0 Leather White／Fabric Pattern 05原1K OpenGL法線，逐byte MD5符合作者公開API；原JPEG無改／重壓縮，兩張估計10.67MiB RGBA+mipmap，非VRAM。只major有界app cache下載、POV借用不釋放；原privateRGBA fallback保留，法線就緒後停用重複bump。來源URL／license／MD5／SHA／成本在public SOURCES，API metadata只放ignored evidence。
- verifier擴充原POV35項中的生命週期檢查，驗原作者bytes、私有RGBA一次釋放、借用normal不釋放、source衣色不改、真私有geometry≤5200；不改count／門檻。POV35／服裝21／socket63 runner3/3 PASS／原生exit0，累計22/122非全套。browser新增真解碼1024²／NoColorSpace／禁雙重bump／私有成本前提斷言，未放寬舊斷言。
- 新source fingerprint 0ed1d11f352b1343e7960d0d9a1d5152017a4a88f85c2761808b6dc562c6eccb（53檔），buildOnly phase-b7-textile-contact-build-20261005-1366 已23.38秒／exit0，只保存來源與bundle，不是browser PASS／最新正式npm build。上一6e17e…正式build25.29秒與11/11守門都有效但屬前版，不挪用。
- 當前唯一GPU session1314：phase-b7-textile-contact-mobile-mirage-20261005/390，同build與public逐byte核對，真保存幀五族／中段換彈／handling／音效／最新法線與成本gate。完整log／exit需收尾，不預報PASS。下一步看pistol／rifle／sniper reload真圖，必要追修後桌機／另兩圖、完整同版複審／長樣本／正式build，B通過才C→D→E。
- 不動MOBA、不commit／push／deploy；原checkpoint SHA0be09c29774c81e06113dc9cc649101d74114658仍不變。官方quota最近UTC13:41:29 codex剩57%，pauseRequired=false；最終Owner Review，真手機仍未測。

## B7 握持與抬槍校正最新停點（2026-10-05 UTC14:20後）

- 原 checkpoint commit 已核對成功：0be09c29774c81e06113dc9cc649101d74114658；git log -5、status、cached/stat 已查，無 staged；後續產品、合法素材、工具及文件皆未 commit。tmp／assets-source 原始資料與 ignored evidence／log／browser profile 保留但不應 commit。不 push／deploy、不動 MOBA。
- 下方 session1314／79785／82658 均已原生 exit0 結束，不是在背景執行。0ed1d…窄版 Mirage 58/58；6bc059…掌背校正版 Mirage 桌機與390各58/58，390 FPS59.277／p99 17.2／max133.4ms；各完整log／exit在evidence，尖峰留E追查。這些是前版，不替代目前版本的驗證。
- B7仍未放行；87張前版獨立審核1.6/3且手／袖各1，報告保留。最新縮窄袖口與手套腕帶、沿真握把pivot向內偏轉、真保存shot以正pitch抬槍並向眼側kick；僅major呈現，不改ammo／shot／damage／legacy。真muzzle世界位置方向與pause／原frame不變新增1項因果測試，原35全部保留，POV成36；registry對齊36，不放寬斷言。runner POV36／服裝21／socket63 3/3 PASS／exit0，累計22/122非全套。
- 最新fingerprint e6522607124340700863c83247d83c6b365c38c3e0bb7887a9eb6c16a352753f（53檔），buildOnly phase-b7-grip-pivot-build-20261005-1366 18.29秒／exit0，browser NOT RUN，最新正式npm build未跑。兩張CC0 1K法線原bytes／授權及借用生命期保留；SOURCES繁中寬字修正已納入新build。
- 當前唯一GPU session74441：phase-b7-grip-pivot-desktop-mirage-20261005/1366，重用指紋與所有public逐byte相同的build；正在真保存幀五族／換彈／handling／音效gate，不預報PASS。下一步收完整log及原生exit、檢視pistol／rifle／sniper換彈→390與另兩圖同版→獨立全捕獲審核→長樣本／正式build／Worker後B結案，才C→D→E。
- 官方quota UTC14:13:36 codex剩53%，pauseRequired=false。沒有正式goal物件，不偽造背景／goal狀態。最終停Owner Review，真手機FPS／觸控／音效未測。

## B7 側向包握與袖皺最新停點（2026-10-05 UTC14:51）

- 原 checkpoint commit 完整：0be09c29774c81e06113dc9cc649101d74114658。git log -5／status／cached-stat／diff-stat 已重查，無 staged；後續產品、合法素材、工具及文件皆未 commit。tmp／assets-source／ignored evidence、log、profile 保留但不應提交。不動 MOBA、不 push／deploy，最終 Owner Review。
- 最新產品 fingerprint 6b5887fc627d0c5fc8c2db8db464363a83a4ddc4c72e1b05b1c9bedcd8648c5e（53檔），封存 phase-b7-side-grip-folds-build-20261005-1366，buildOnly 18.04秒／exit0；bundle cbb224fbf8fd113fcde89f4927d00f10f607a4d3c3a82c0a98aa44a8462991f0。最新正式 npm build／Worker／長樣本尚未跑，不沿用前版結果。
- 左支援掌改向護木側面包握；原 CC0 真手骨姿重新匯出、掌背與指節護墊合入每手原 Mesh，各1773tri≤1800；袖真 geometry 三道斜壓皺／腕口收束，私有總5118tri≤5200。真腕接合、POV36／服裝21／socket63 全過，runner3/3原生exit0、累計22/122非全套。
- 同來源最新 Mirage 桌機與390各42/42 PASS／原生exit0，各14 PNG共28張，像素各14/14 MEASURED／exit0。桌機58.908FPS、p99 33.3／max66.7ms；390約60.1FPS、p95約16.8ms、console/page error 0，只是桌機GPU窄viewport。完整log／exit／metrics在 evidence/phase-b7-side-grip-folds-{desktop,mobile}-mirage-20261005/{1366,390} 及 b7-side-grip-folds-*.log。session18951／56941／80853 均已結束；下方歷史GPU執行中記錄不再有效。
- B7未放行：前版 e652 全50圖獨立審核1.6/3，手／袖1，報告 VISUAL_REVIEW_B7_GRIP_PIVOT_20261005.md 保留；不能挪作新版本。新28圖獨立唯讀審核中。新側向握持已看，但袖仍欠可讀布料細節；CC0候選原JPEG只下載到ignored evidence，尚未接產品，Fabric Pattern 05棋盤格albedo不採用。需選適合制服的素織布與皮革、保留來源byte／授權與資源預算。
- e652 另兩圖首輪缺固定種子真中段換彈，HARNESS_FAIL exit2原證據保留；不改seed／frame／產品補情境。移除該非成立情境後另兩圖coverage56/56 PASS僅屬前版。最新6b5887 Dust2／Inferno NOT RUN；M4中段換彈缺保存情境仍 NOT_MEASURED。
- 官方quota先前UNKNOWN現已恢復：UTC14:51:34 codex剩49%，pauseRequired=false；其他limitId不相加。下一步完成手／袖材質、收28圖盲審→新來源build與全同版視覺／音效／長樣本／Worker／正式build→B結案後C→D→E。真手機FPS／觸控／音效仍未測。沒有正式goal物件，不偽造背景或goal狀態。

## B7 素織布／皮革校色最新停點（2026-10-05 UTC15:08後）

- 原完整checkpoint SHA 0be09c29774c81e06113dc9cc649101d74114658未改；無staged，後續新工作全部已存磁碟、未commit。不動MOBA、不push／deploy；tmp／assets-source／ignored evidence／log／profile不應提交，原始與失敗證據保留。
- 最新6b5887側向包握版本28/28圖獨立審查已完成：VISUAL_REVIEW_B7_SIDE_GRIP_20261005.md，平均1.4/3；握持各2、手套／袖各1。互動物件0只是本集缺圖，不是功能不存在；手機五行通訊遮戰場列D。前版分數不挪用，B7仍未放行，C／D／E未開始。
- 已接原CC0 Terlenka素織布colour／normal、Leather White colour＋既有normal，共四張app-cache借用；素織布原JPEG1024×1026、皮革1024²，原MD5／SHA／授權／物理尺寸保存在SOURCES。每手1773tri、整套私有5118tri，不提高1800／5200門檻。原actor色copy不改來源；按原JPEG實測線性RGB平均校色，避免複乘米色變暗；斜向壓皺與暗縫沿原geometry加強，不加Mesh／燈光／runtime骨架。
- 第一輪source4635c34291d0acb769397a1704918dd2d11777a763fdbcf0c17b055860860221，buildOnly26.32秒／exit0；桌機 phase-b7-woven-leather-desktop-mirage-20261005/1366 33/34 PRODUCT_FAIL／exit1。唯一失敗是驗證將官方1K誤當方形1024²，實際兩張Terlenka均1024×1026且正確解碼／sRGB。原證據完整保留、私有Chrome cleanup confirmed。檢查改成依實際作者檔名精確尺寸（不是放寬區間），原geometry與色彩空間門檻保留；Sprint紀錄本節記原因。實圖也確實偏暗，因此另校色，不以該錯誤尺寸紅燈推論產品壞掉。
- 校色後runner POV36／服裝21／socket63 3/3 PASS／原生exit0，累計22/122非全套，完整log b7-woven-neutral-scoped-20261005.log。新 buildOnly phase-b7-woven-neutral-build-20261005-1366 執行中（session待工具原生完成）；當前無GPU。前兩個build原來源文件繁中文字修正造成byte不同，保留各manifest，不重用來源不符build。
- 下一步收新manifest與原生exit→逐一隔離桌機／390 Mirage完整五族及真換彈實圖→必要手／袖追修→全同版獨立複審／另兩圖／音效／長樣本／Worker／正式npm build，B放行後C→D→E。官方quota最近UTC14:51:34 codex剩49%，pauseRequired=false；真手機FPS／觸控／音效未測，最終Owner Review。

## B7 正向狙擊／相向握姿／護具最新停點（2026-10-05 UTC15:42後）

- 原 checkpoint commit 完整，SHA 0be09c29774c81e06113dc9cc649101d74114658；無 staged，後續工作均存磁碟、未 commit。本輪依設計不另 commit、不 push／deploy、不動 MOBA。tmp、assets-source、ignored evidence／logs／browser profiles 保留且不得提交。
- 上輪素織布校色 source d07b128c…：Mirage 桌機及390各42/42 PASS／原生exit0，各14 PNG與14/14像素MEASURED。完整28圖 Fresh-Eyes 審查平均1.7/3，VISUAL_REVIEW_B7_WOVEN_NEUTRAL_20261005.md；手套／袖各1，人物與敵人剪影各1，不能當新版分數。手機通訊遮戰場列D；B7仍未放行，C／D／E未開始。
- 原狙擊槍實際GLB方向與握點有誤：只重匯出major source，原Tabasco CC0 blend SHA ccdc960c722b58752cf33cd04f391b7fb9ea9a2352d4299c3605c409d5868eda未改。真握把[-4.83959,-2.82,-.53]、+Y原管口，正旋轉det+1；5388tri≤5500。新sniper.glb SHA afab27895b8bba29b8843a2f4fe5d9ecbde2276f4c6f897dc3415eb1e9cb4f48。舊檔與首個缺extras候選完整保留，36/37紅燈因匯出漏provenance，補extras後37/37，不放寬斷言。
- 主手移到真握把外側2.5cm，左右掌相向；真腕接點、原65骨、saved-frame換彈／shot authority不改。私有128²／65536B縫線遮罩共用兩手、僅釋放一次，四張CC0貼圖借用不釋放。前一seam-only source a22d6a…桌機43/43 PASS、sampler實際GPU編譯已證；390未跑，不能冒充最新版驗證。
- major才修正RoundedBoxGeometry參數順序，軟包／面罩真bevel；支援包加厚、marksman長包拉長，加同材質織帶。legacy保留原幾何。既有成本fixture擴成兩隊×5身份×5槍族50組，全部仍在原上限。最新scoped runner POV37／服裝21／socket63 3/3 PASS／原生exit0（累計22/122非全套），完整log b7-sniper-major-gear-scoped-20261005.log。
- 最新buildOnly phase-b7-inward-grip-sniper-gear-build-20261005-1366：22.54秒／原生exit0。source fingerprint 52286a4d5fa76efb694632efd4eb1ede7c47f8e88acefc92e619ebb8e982df1a（56檔），bundle972cf238148460aec1f93be6f6afb22893286f94d43c3b662feaedff6e96dd3b。此建置本身browser NOT RUN；目前唯一GPU session51282執行桌機Mirage完整武器與新增兩隊各三種人物前後圖，不預報PASS。新增readonly operator probe只走原生UI／真frame0，像素audit按實測canvasRect，不改產品source。
- 下一步收session51282原生exit／完整metrics→同build逐一390→查看全部圖、完整像素audit與獨立複審→必要追修→另兩地圖、音效／生命週期、長樣本、Worker、正式npm build；B放行後C→D→E。官方quota UTC15:42:21 codex剩44%，pauseRequired=false；真手機FPS／觸控／音效未實測，最終停Owner Review。

## B7 真腕口／人物布料與預算修正最新停點（2026-10-06 台灣／UTC16:50後）

- 原 checkpoint commit 完整，SHA 0be09c29774c81e06113dc9cc649101d74114658；git log -5／status／cached-stat／diff-stat 已重查，無 staged。後續工作均已存磁碟、未 commit；本輪依設計不另 commit，不 push／deploy、不動 MOBA。tmp、assets-source、ignored evidence／logs／browser profiles 保留但不得提交。
- 下方 session51282／76408／70692 均已結束，沒有本輪 GPU／build 在背景執行。52286a4d5fa76efb694632efd4eb1ede7c47f8e88acefc92e619ebb8e982df1a 來源的 Mirage 桌機 retry 與390各55/55 PASS／原生exit0，各26 PNG及26/26像素 MEASURED；首次 timeout22圖為 HARNESS_FAIL／exit2，沒有最終metrics。全部74圖加三張參考由獨立 Fresh-Eyes 實際讀完，VISUAL_REVIEW_B7_INWARD_GEAR_20261005.md 平均1.50/3，槍形2、握姿／手套／袖／正面身份各1，B未放行，不能挪用到新來源。
- 52286桌機10.718FPS／390 11.590FPS與舊B5對照15.34FPS均保留。唯讀查到另一工作區 MOBA browser gate 共用GPU，沒有停止或改動其行程；該行程自行結束後乾淨B5對照6/6 PASS／exit0，60.1FPS、p95 16.8ms，phase-b7-perf-b5-clean-20261005/1366。這只證明環境恢復，不證明新來源性能。正式新增 tools/run_isolated_gpu_gate.ps1（此任務review/tools下），在原生PowerShell前後唯讀CIM快照；其他esmo-cdp gate存在或查詢失敗都HARNESS_FAIL，不能把UNKNOWN當空。Node子行程CIM曾access denied，該實驗已移除；不停止外工作區／一般瀏覽器，不保證快照間絕無外部負載。
- 新來源尚未建置／browser。人物衣褲與背包借用原CC0 Terlenka兩張貼圖，以shader線性增益維持原材質色；skinned私有clone也接相同gain，不改來源圖／canonical色。原7432頂點新增89184B共用私有顏色，以真手骨20mm連續腕口過渡取代T袖三角鋸齒分區；不改原65骨、12862tri、權重／面積守恆。POV手套灰化、17段袖縱縫門檻修正，背包織帶移到真外表。
- 增加major正面肩墊／胸包身份輪廓後，scoped服裝21/22 FAIL／exit1：CT assault狙擊22158tri、support狙擊22090tri超過22000。保留完整 b7-woven-wrist-front-kit-scoped-20261005.log 與成本診斷。軟包及新增護具改成封閉真倒角44tri（六面／十二邊／八角），代替生成器108tri；legacy幾何不變。修後POV37／服裝22／socket63 runner3/3 PASS／exit0，累計22/122不是全套；b7-woven-wrist-bevel-budget-scoped-20261005.log。5200 owned／22000整人／17000本體／8材質及五槍族原預算都保留。
- 服裝21→22新增借用貼圖與skinned shader／釋放檢查；原「不能有任何color」假設改成明確禁止來源superhero paint、只准真腕口私有有限連續色，原面積／權重／骨架守恆及成本不放寬。人物gallery改原生眼平拖曳及有限真wheel拉遠，驗Head／grip／muzzle實際相機投影落畫面，不只固定近距離；原characterViews距離門檻未改。新GPU布料uniform讀回檢查與圖庫構圖尚未執行。
- 下一步：完成SOURCES新來源紀錄→buildOnly新fingerprint→GPU guard序列桌機及390 Mirage完整武器／換彈／人物圖→全圖像素與獨立複審，必要追修；之後另兩圖、音效／生命週期、長樣本、Worker、正式npm build，B放行才C→D→E。C／D／E未開始。官方quota UTC16:46:10 codex剩39%，pauseRequired=false，其他limitId不相加。真手機FPS／觸控／音效未測；最終停Owner Review。

## B7 衣料細摺／袖口下一候選停點（2026-10-06 台灣／UTC17:16後）

- 原完整checkpoint commit SHA 0be09c29774c81e06113dc9cc649101d74114658未改；無staged、新工作均已存磁碟但未commit。tmp、assets-source、ignored evidence／logs／profile保留不提交；不動MOBA、不push／deploy，本輪依設計不新commit。
- 上版52368c9f…57檔，buildOnly21.18秒、Mirage桌機與390各56/56／原生exit0、各26 PNG／26像素MEASURED。全52圖及三錨點獨立Fresh-Eyes完成，VISUAL_REVIEW_B7_WRIST_BEVEL_20261006.md：平均1.6/3；五槍除SMG1其餘2，右握2／左握1／手套1／袖1，六身份正面1、背面2。B仍未放行，不能將shader就緒當可見質感完成。D的回合banner／通訊疊字與卡遮腳未修。
- 該來源12段B runner12/12 PASS／exit0（累計22/122非全套），三圖simulation24含legacy完整frame/result等價，187秒；正式npm build23.30秒／exit0；production Worker12/12 PASS／exit0，同一瀏覽器canonical與Worker完整SHA一致、等待主線回應。完整log b7-woven-wrist-bevel-all-b-scoped／formal-build／worker-20261006.*。所有session61396／87906／89854已結束。
- 依新圖追修（尚未build／browser）：減POV袖過大環形鼓起／偏心，增加腕口實際厚度；沿原geometry bind-space加約1.6mm nominal衣料細摺與雙線topstitch，藉真表面導數改normal、維持原CC0 weave，不加texture／mesh／燈光，不改原材質色或骨架權重。POV與rigid／skinned布料共用helper；POV既有色增益不重複套用。正面assault既有肩墊／support既有胸包放大主輪廓，沒有新增小配件或提高成本門檻。
- 新scoped POV37／服裝22／socket63 3/3 PASS／exit0，完整 b7-sewn-cloth-scoped-20261006.log；補入既有材質生命週期斷言確認bind varying與normal導數callback，不放寬成本／骨架／面積。後加雙線topstitch需建置與GPU實測，不預報PASS。下一步先SOURCES紀錄／新buildOnly→GPU guard逐一桌機與390完整52圖／像素→全圖獨立複審，必要追修；再另兩圖、音效生命週期／長樣本／正式build與Worker，B放行才C→D→E。真手機未測，最終Owner Review。官方quota UTC17:14:58 codex剩35%，pauseRequired=false。


## B7 POV拼片／SMG凹口候選最新停點（2026-10-05T18:17:52.809Z）

- 原checkpoint已完整，HEAD仍0be09c29774c81e06113dc9cc649101d74114658；git log -5／status／cached-stat／diff-stat已核對，無staged。最新工作都已寫磁碟、尚未commit。本輪設計不新增commit、不動MOBA、不push／deploy；tmp、assets-source、ignored evidence／log／browser profiles均保留且不提交。
- 目前B▣／C□／D□／E□；B7未放行，完成後停Owner Review。3ae20faf…全52圖獨立複審1.7/3（VISUAL_REVIEW_B7_SEWN_CLOTH_SMG_EYE_20261006.md）；SMG／袖／手套仍1，support／marksman正面1，不能挪作新版本分數。原桌機與390各57/57 PASS／exit0、各26像素MEASURED；桌機53.3/p95 33.3ms，39058.6/p9516.8ms。相同build另60秒跨回合6/6 PASS／exit0、59.3/p9516.8ms，短樣本落差仍保留。
- 真手槍組裝已修：固定七個原matrix_world，解除parent後轉原Frame座標再烘焙；新GLB SHA6665515998470bf8dc020b88ad21ddea9c49356b5586b8af9e613b1cdded84d3，仍2243tri／2564頂點／原四張1K貼圖。原97e175bb…保存在ignored source evidence，原.blend未改。真握點截面與管口幾何已在原POV37內加斷言；budget不變。該候選e522febf…桌機57/57 PASS／exit0（phase-b7-pistol-assembly-desktop-mirage-20261006），實圖散件已回同一組裝；POV袖GPU確讀0.0016，不能將平滑外觀歸因shader未啟用。e522未跑390／獨立複審，不能套用。
- 首輪手槍build受PowerShell5重定向stderr＋ErrorActionPreference=Stop中斷，wrapper native1、gate exit未知／manifest未保存、browser NOT RUN；原log／部分build／guard保留，記HARNESS_FAIL而非產品fail。guard只在native node工序用Continue保留stderr後讀原生exit，CIM查詢仍Stop；沒有刪警告、沒有改Vite門檻。隔離retry建置17.45秒／原生exit0／manifest完整，確認是chunk-size advisory；source e522febf0f93a90d9a6f1e76ab305b9272318062f257957c782d4fb1d279b44f。
- 下一候選只改POV私有袖拼片／3cm袖口與雙車線、原64KiB手套護片灰綠層次／粗糙度、SMG同借用shader機匣凹口與有下界握把區；SMG原GLB逐byte不變，整組槍／雙手／袖上移6cm。私有5118tri≤5200、原RGBA大小、Mesh／Texture／draw上限不增加。離線72度POV投影magazine minNDC.y=-.956998，僅離線，不當browser PASS。
- scoped POV37／clothing22／socket63 runner3/3 PASS／exit0（b7-pov-panel-port-scoped-20261006.*）。最新buildOnly18.78秒／原生exit0（phase-b7-pov-panel-port-build-20261006-1366），source800c385f273a6745a570f347a59e179351e0cf84f5b70f0a856bb2888c256c1a／57檔、bundlebbe5a69bbb5fa145f3ccc0e5b4c42272450661625466553ac262824b866fe2b1。此buildOnly不等於browser PASS／正式npm build。最新正式build／Worker仍是舊52368c9f…，不能套用。
- 唯一本任務GPU session48649正在phase-b7-pov-panel-port-desktop-mirage-20261006重用此精確build；完整log b7-pov-panel-port-desktop-mirage-20261006.log，尚未有native exit／metrics，不預報PASS。下一步先收session→同build390→全部52PNG像素／獨立複審→針對SMG／袖／手套品質與正面剪影修正；不以技術green放行B，不重做已完成simulation／世界。最新quota UTC18:01:43 codex剩31%、pauseRequired=false；下次大型工序／階段切換重查。


## Owner額度預留規則更新（2026-10-05T18:42:17.444Z）

- 2026-10-05T18:42:17.444Z Owner新指示已保存：Codex每週usage剩餘10%或以下，先保存程式、完整log／原生exit與最新進度／下一步，再暫停；取代舊0%門檻，不用剩餘積分。AGENTS.md與check_weekly_quota.mjs已更新，guard輸出pauseAtRemainingPercent=10，語法檢查通過。續跑／階段切換／大型工序前查，達門檻停新工作與子代理，安全收尾／中止測試，保存停點；有goal才設paused，未有goal不造假。官方查詢最新兩次UNKNOWN（RPC -32600／exit1），不可當0%、10%或即時27%；最後成功UTC18:34:12.538Z codex剩27%。
- GPU session22415已結束／原生exit0，新production桌機Mirage46/46 PASS、source944719f9f66e9582636d89ae3e51a2cb41a53f1c8081264d8892ca3f7cc9a8ab／57檔、bundle3a6379ddee4381eb80446b5fcd0ddf532328fe73c82942d5f85b74541523ce02；完整b7-compressed-sleeve-desktop-mirage-20261006.log／.exit.txt與manifest保留。此輪flags不同前版57項，不能宣稱46涵蓋舊57，390／全像素／獨立審查／正式build／Worker尚未跑新版。沒有本任務GPU／build／runner在跑，B7未放行，C／D／E未開始。下一步先重查官方quota，再確認袖子實際輪廓效果與必要shader診斷，品質改善後同版390及完整複審，不重做已完成內容。
- Owner原圖覆核發現800c385f版390 rifle／SMG／sniper的返回觀戰／✕／資訊均清楚可見；審查者已撤回rifle與sniper reload缺失，但仍稱SMG／sniper未見，與Owner直接原圖相衝突。原獨立分數保存但缺控制finding不作產品修改依據，不能宣稱控制壞掉。


## B7 內前臂拼片方向與鋼木shotgun候選（2026-10-05T19:18:10.727Z）

- 2026-10-05T19:18:10.727Z 最新停點：原完整checkpoint0be09c29774c81e06113dc9cc649101d74114658不變；無staged，新工作均寫磁碟未commit，不動MOBA、不push／deploy。Owner新10%或以下保存進度後暫停規則已寫AGENTS及官方唯讀guard，最新成功UTC19:11:51 codex剩23%、pauseAtRemainingPercent=10、pauseRequired=false；間歇RPC -32600 UNKNOWN仍保留，不當成0或即時舊值。B▣／C□／D□／E□、未READY_TO_REVIEW。
- 944719f9…46/46原圖＋3anchors獨立唯讀審查已完：VISUAL_REVIEW_B7_COMPRESSED_SLEEVE_20261006.md平均1.7/3，袖1／shotgun1，左右握持／手套／另四槍族2；全部底部返回／✕／資訊可見。opening十秒D47.67FPS／p9533.5/p9983.3/max183.3、M58.91/p9516.8/max216.7；不是combat受控比較。全46像素MEASURED／error0，B7不放行。
- 只加深POV布面5mm／12%（body仍原1.6mm／4%）的a830d0ab…桌機combat57/57 PASS／exit0、123179ms，尚無390／獨立複審。後續真幾何投影診斷發現原拼片normal朝鏡頭反側；原袖只對齊肘腕軸、缺roll。按來源手掌+Y面投影到軸垂面對齊內前臂裁片，不跟鏡頭、不改手或腕端點；五族右袖panel朝鏡頭dot由約-.86至+.71，左袖長槍由負值轉+.06–.31，pistol左側仍-.26，不能宣稱全角度可見。原37內加拼片與掌面平行的獨立幾何斷言，腕點1e-6／5118tri≤5200／所有權上限保留；3/3 scoped PASS／exit0。首次temp診斷清理呼叫不存在assets.restore、native1，JSON數據已寫但不標PASS；改正assets.dispose後native0，前／後／palm-side診斷分檔保留，不覆寫。
- roll-only dfef4a50…production桌機Mirage57/57 PASS／exit0、109479ms，真實圖拼片／縫線可見；無390／獨立複審／正式build／Worker，不能挪前版結果。再在crookedmouth CC0 shotgun原單steel slot的借用材質加ESMO原創鋼／木製前托、握把、木紋／止滑紋分區，GLB3047tri／原socket逐byte不改，零新增Mesh／Texture／draw；與原有有界lease共用，原37增末一引用釋放反例、3/3 PASS／exit0。公用SOURCES已記轉換／原JPEG保持；browser額外核對真shotgun GPU uniform，不放寬舊斷言。
- 唯一GPU session91646執行phase-b7-palm-panel-shotgun-desktop-mirage-20261006：新production build、combat、五槍／真reload／六身份全正反／衣料及handling。尚未收原生exit／新manifest／metrics，不預報PASS；log b7-palm-panel-shotgun-desktop-mirage-20261006.log。下一步收session→看袖／shotgun真實圖→同精確build390→全52像素與獨立複審；B品質過再另兩地圖、音效／動畫／長樣本與正式build／Worker，才C→D→E，最終Owner Review。之前800c385f…正式build20.54秒／Worker12等都是舊來源，不套用現在。


## 2026-10-08 CS Major B7 續跑取證與Owner重開停點

- A■／B▣／C□／D□／E□／Owner Review□。本輪未改产品source、未動MOBA、未commit／push／deploy；最新HEAD0be09c2、source c2a744dc…59檔。
- 同精確封存build的新桌機／390各25/25、native0，32PNG及32/32pixels完整；32圖＋3anchors獨立複審已保存VISUAL_REVIEW_B7_SEGMENTED_SLEEVE_20261008.md，肩／肘／袖口不足，背面部分遮擋先補證，B7不放行。
- 新版60秒33.892FPS／p9549.9ms；即時舊fdaa控制40.445／p9533.6ms，各7/7 native0。技術PASS不是效能放行，差異未定位。
- tool-only靜態matrix診斷與選用三分之四背側取景草案已加，三檔語法exit0；runtime尚NOT RUN，下一session先補齊probe完整性守門，再取證，不宣稱產品優化已完成。沒有放寬或刪除原断言。
- Owner要求再次重開Codex，已保存最新RESUME_CHECKPOINT.md、完整logs／exit／inventory與Git快照；所有本任務GPU／runner與兩個唯讀子代理已完成，無本任務背景工作。另有其他MOBA工作區Vite build，未操作。
- 官方quota UTC18:34:03 codex剩31%、pauseRequired=false；暫停是Owner重開要求，已建立goal將paused。沿現停點續B→C→D→E，不重做已完成取證。真手機FPS／觸控／safe area／音訊仍未實測。

## CS B7 肘部切面修正已通過 scoped 技術守門（2026-10-08）

真腕口上一來源D/M各37/37、各28PNG及pixels28/28；獨立56PNG＋3anchors仍未放行，詳VISUAL_REVIEW_B7_TRUE_WRIST_20261008.md。此輪只修CS第三人稱衣袖，真肘切面upper-.046／upper+.014、布腕total-.015，428tri／224vertices；原450小預算、17000／22000／5200成本上限不變。肩cap補正已累積法線位移，35號雙肩真頂點反例已過。四段87／63／37／35、4/4、native0，完整logs/state存evidence/b7-elbow-local-scoped-20261008/。

最新D GPU phase-b7-elbow-rows-desktop-20261008 session22134取證中，尚未收exit，不報美術PASS。下一步同archive M390、pixels、完整獨立藝術檢視；B7未放行，C/D/E未實作。最新正式build／Worker／三圖lifecycle仍NOT RUN。不動MOBA、不commit／push／deploy；真手機FPS／觸控／safe area／音訊未實测。官方UTC20:43:13 codex剩15%，≤10%安全保存暫停。

## CS B7 已保存停點：quota spawn EPERM（2026-10-08）

任務未完成，尚未Owner Review。最新肘切面source34a2c118（59檔）四段87／63／37／35全過；同archive D/M各37/37、各28PNG／pixels28/28及native0完整保存。獨立56圖：肩2／肘1／前臂2／布腕1／衣料1／輪廓1，B7未放行，見VISUAL_REVIEW_B7_ELBOW_ROWS_20261008.md。本輪anchors未看；已定位skill assets/scorecard-anchors三圖，續跑待完成。主流程及子代理已完成收尾，無待收GPU/runner。

官方quota子行程spawn EPERM／native1，停止新工序，不做retry without sandbox或追加approval。最後成功剩14%，本次UNKNOWN非10%門檻；完整保存及下一步見RESUME_CHECKPOINT.md最上。C/D/E未實作；最新正式build／Worker／三圖lifecycle NOT RUN。不動MOBA、不commit／push／deploy，真手機未實測。


## 2026-10-12 CS Major：C／D／E收件，停止於Owner Review

■ A｜■ B｜■ C｜■ D｜■ E；不commit/push/deploy、不動MOBA。指定B7390 GPU45/45/95720ms保留未重跑；Owner接受人物現在完成度，舊藝術1／U原樣保留，沒有新藝術PASS或90分。

C1 37/37、coordinator42/42、runtime34/34全native0，真utility/情報/路徑/fake/crossfire/trade/clutch/save與same-seed完整SHA收件。D保存權威幀CsReplay.v1/gzip、正常simulation/cursor cache與重播零simulation/Worker/completion/發獎、stable五人身份/HUD移出戰場/真逐局十人結果完成。Major-only CsMatchResult.v1可選sceneVersion/roundDetails/utilityDamage，Legacy原形狀及Reward/Store路徑保持；契約28/28、completion36/36、D Node51/51 native0。

D原48/53只44px紅燈，430與12/12三窄版分段補驗收件；正式flow原25/26唯一終局高度修後8/8通過。新casts/events壞輸入、未來歷史prefix與Legacy重播退出真缺陷已修，input Node15/15与原生Browser15/15/native0通過；保留原反例/紅燈，不放寬真因果或冒稱單次full gate全綠。新版窄輸入gate加入runner；C1改只檢查真存在zone類型、缺Mirage火區明確SKIP，兩其他圖非空火區因果仍強制，不造事件以滿足測試。C其他修正都是canonical真缺陷：盲效秒尺度、炸彈40秒/單一拆彈者、114秒提前切局、fake真到達再轉進、角色路徑phase保留、crossfire真32距離節點、save依nav實際退離。Legacy完整24/24与completion既有PASS保留。

E最新Worker12/12/native0、pristine build1/1/native0；桌機1366与390三圖各60秒均18/18 RESULTPASS/native0，0PNG。桌機FPS57.72/54.00/52.67，390桌機GPU窄視窗59.75/59.47/59.69；max尖峰/首載/heap及drawcalls超起始預算均如實保存，真手機FPS/觸控/音效/safe area/熱節流/人物場景視覺未實測。沒有假稱Android完成或嚴格A/B。

最新source c9b686f5…97檔；canonical C domain89c34e18…與191011bytes純模擬逐byte保持。e-input-only-provenance.json逆修後完整97檔SHA重建前版69016eb3…，已PASS桌機/Worker/formal25/D48依未受影響來源沿用，不重做。正式dist与唯一最新archive、source恢復gzip653711bytes、B恢復点、C/D/Legacy真fixture與素材來源/授權保留。

已依既有Owner授權完成明確10份舊CS archive清理，native0/10確認；elbow cwd UNKNOWN与其餘不確定候選保留，全部PNG/evidence/log/metrics/native/原失敗保留。resolved path、實際JS bundle與全檔handle/cwd現場重查，沒有操作使用者程序。原历史建置引用由e-approved-root-review-history-v2.md接續，較早結論不改寫；logical數字不當磁碟或OneDrive實際回收量。

恢復與所有完整驗證入口：`review/cs-major-upgrade/RESUME_CHECKPOINT.md`；交付成果与限制：`review/cs-major-upgrade/OWNER_REVIEW.md`。桌機正式localhost:5179/ESMO-/已啟動，手機HTTPS缺cloudflared未自行安裝。只留Owner preview，停止新工作與下一Sprint，等待Owner Review。


## 2026-10-14 最終四項收件：工程完成，Owner Review（本節優先）

最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)。正式獨立 owner4-pristine-final-20261014，session39140／PID147032；source 15ae830c7923ee71ad67a294500c2366a707cd5c8d8780e055e2eb32b2075d8d，bundle 4ae13686774921db249405c3cfa694645c287899d2f9ee466e27b13cf2bec834。HTTP200、HTML與全部JS逐byte同archive。
最後地面記號包含道具圈／球尾與A/B固定圓環／圓形填色均移除，保留A/B字母。實Browser31/31＋新pristine正式Dashboard→CS→Battle→Result26/26，native0與自有Chrome cleanup confirmed/profileRemoved；root人工看B點新PNG無圈。
最後兩個Major-only visible旗標精確反轉後，全部105份source/asset的SHA回到已驗LOD版本：ground-only-source-delta.json。所有simulation、pose、utility、shader、素材與controls不變，原contact12/12、tactical34/34、POV41/41（最壞5096<5200）、utility27/27與動作Browser29/29證據繼續有效，沒有重跑舊對局／30／55／B7。
最後工具首輪30/31把objective-site共用tag六個物件誤算為字母；保留原失敗與native1，再以實PlaneGeometry+CanvasTexture精確挑兩個字母，兩字母及visibility門檻未放寬。後續未改產品或scene/frame救測試。
主閱：review/cs-major-upgrade/OWNER4_CLOSURE.md；完整收件與所有native/streams證據索引：evidence/owner4-review-20261013/owner4-engineering-complete.json（SHA c5431308fc792196b2c3ab9b8eb0980cdc05c4a7cd60e840c9d9fee032fa2322）。前版所有source/hash/Preview收件只作歷史對照，本節為最新After。
Legacy完整JSON同c9，但原安包0仍2/3/native1 NOT_TRIGGERED；未改seed洗綠。Owner專業CS體感、所有位置／全時間視覺與手機真機FPS/觸控仍待驗收。進度條與剩餘時間偏好已保存在AGENTS.md。
■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。沒有CS背景測試仍跑，僅保留Review Preview服務。僅停止核對過的自有舊5183／PID175048再替換，其他舊Preview與foreign/MOBA／未知程序保留。未commit/push/deploy，不開始下一Sprint。


### Owner4B接地與HE呈現架構（2026-10-14）

新增 src/battle/fps/presentation/fpsVisibleGrounding.js：nondeath pelvis保留經parent matrix投回local的世界UP位移，鎖住水平root motion；支撐點只取可見鞋底80候選/屍體1597候選，不拿cached Box3/hidden mesh當接地證據。fpsBoundsSampler.js繼續用於既有framing/診斷，沒有被改成另一份真地面。FpsCharacterRenderer順序是restore→mixer/pose→衣物sync→可見support取樣/apply單一modelY→衣物再次sync。停止的屍體使用姿態/root/visibility signature快取；權威parent X/Z與frame不變。Death contactY另記真取樣surfaceY，不能以rootY+offset代替。

新增 fpsFloorSampler.js：初始化讀同一份場景ground/roads/paving/room floor/paint triangles並以2m空間格索引；真callback傳入renderer，包含ramp tessellation與各種lift，不把.045寫死全圖。它只服務呈現，沒有第二份導航/collider/Store。真CPU15定姿+99動態與Browser三圖已保存完整可見vertex oracle；5mm候選不是全部通過（3個5.213mm），原8cm門檻不放寬。

新增 fpsHeVfx.js：4事件、每事件2暖色contact/6 sparks/3 brown-grey dust，最多44葉物件；contact .18s、sparks .32s、dust1.10s，依保存detonatedAtRoundSec與subframe，不讀wall time。Reduced motion移除動態火花仍保留暖色/塵煙；不新增PointLight/後處理/傷害或地圈。時間是本案設計值，非Valve公布參數；[Valve CS2視覺](https://www.counter-strike.net/cs2)僅作風格參考。

fpsAwarenessLook增加同源walls/lineBlocked，僅公共node/local clear-ray與TTL情報；保留合法corner/trueintel預瞄與封閉空間明示理由，沒讀hidden enemy/沒改duty或route。Mirage closedFacade只省內部outer endcaps（window jamb保留），belt兩端退30mm；crate steel最多20mm呈現外突、正規collider不變。Geometry candidate不是flicker outcome KPI；所有角度、專業CS體感与手機真機仍Owner驗收。
