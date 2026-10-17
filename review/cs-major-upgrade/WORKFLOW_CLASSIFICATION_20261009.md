# CS Major 剩餘工作分類與 Blender MCP 流程

2026-10-09，依使用者最新指示。只處理尚未完成的 B → C → D → E；不因工具切換重做 A 或已通過成果。官方每週剩餘 3%（含以下）先保存再暫停。完成停 Owner Review，不動 MOBA、不 push／deploy。

## 工具分工

- `BLENDER_MCP`：人物比例／身體造型、袖子／手套／手指／握槍姿勢、Rig／Bone／Weight／Pose、武器比例、第一人稱手臂、建築／Bombsite／Prop、材質／UV／環境美術的資產作者工序。先評估既有資產，不全面重建。
- `CODE`：React／HUD／UI UX、相機 runtime、Simulation、Tactical AI、Stats、Replay、Collision／Nav／gameplay metadata、LOD／culling／FPS optimization，以及證據與工具守門。
- `HYBRID`：Blender 資產 → R3F／Three.js 整合 → 真遊戲 GPU／Browser 驗證。Blender viewport 或匯出成功不能代替遊戲驗收；涉及 runtime 骨姿／socket／動作時亦須此流程。

## 已驗證基礎與本次 audit

已讀最新 checkpoint、B7 recovered review、C1 acceptance plan、CS Major phase／技術美術契約與現有作者／bake 腳本。當前產品 source `08c66c9f36557d575d348d01510f7cfb0f813ee63cab5152460398f974297803`，bundle `27783afd99c54a244cb89bf361c6d5be62010ccc69609a56eef7085cc9e44827`。衣料 37/37、core 14/14、扳機側補證 16/16 已有原生 exit0，四圖袖口／可見支撐手局部審查已有結果；不重跑這些未受影響 gate。B7 尚未完整放行，C/D/E 只分類，未實作。

| 階段／剩餘項目 | 分類 | 下一個實際工序／驗收 |
| --- | --- | --- |
| B7 既有兩張 trigger-side-low 原圖、像素及獨立審查 | CODE | 直接審已存在完整兩圖，不重 build／重拍；遮擋保留 U |
| B7 CT 布袖口尖角、折片硬邊 | BLENDER_MCP | 載入真角色／衣料與保存握姿，觀察截面、法線及相鄰頂點；只修有證據的局部 |
| B7 扳機手食指／拇指／掌面、手套曲率 | BLENDER_MCP | 在資產作者視角檢查真骨與手皮，確認問題再修；不能從被遮擋圖片推論穿模 |
| B7 支撐掌、握把 socket、動作間骨姿相容 | HYBRID | 作者造型／pose → runtime 原 IK／pose layers 整合 → 真保存 hold／shot／reload／death 驗證 |
| B7 六身份正面辨識與剪影不足 | BLENDER_MCP | 僅改善仍不合格身份的原創配件／比例／輪廓，保留現有合法來源與預算 |
| B7 五武器族、第一人稱手臂尚未完整同版驗收 | HYBRID | 先檢查現有成品；只有缺陷才作者修整，整合真 muzzle／socket／換彈事件，再局部取證 |
| B7 材質、UV、布料／皮革可讀性剩餘缺陷 | HYBRID | Blender 作者與 UV 檢查 → 共用現有 PBR／textile 整合；UV 密度及材料分區不猜 |
| B7 hit／death／shot／reload／音訊事件與 lifecycle 補驗 | CODE | 從真事件與已存在 pools／lifecycle 補缺口；不重做 B1–B6 |
| B7 最新 source 全套桌機／390、六身份／武器／動作及 Worker 相容 | HYBRID | 局部缺陷解除才取最小必要同版全套；已有同 source 成果共用，舊 source 不借分 |
| B7 正式 build 與 scoped verifier 收尾 | CODE | 依實際變更選 gate，完整 logs／原生 exit；build／環境失敗先分類 |
| C1 獨立致盲、投擲飛行／爆炸與真庫存 | CODE | 按 PHASE_C1_ACCEPTANCE_PLAN；Major 小 helper，legacy RNG／完整輸出不變 |
| C1 單一拆彈者／中斷／轉交／爆炸優先順序 | CODE | 真角色／時間／事件因果，不能指定結果；同 tick 決定性 |
| C2 有限視野／隊友 intel 來源與 TTL | CODE | coordinator 只讀合法資訊，過期清除；不讀牆後全知敵人 |
| C2 合法 route／anchor／aim／pace／utility intent | CODE | 既有 safeMove／assignRoute 消費，不直接寫位置／擊殺 |
| C3 entry／lurk／rotate／fake／execute | CODE | 決策→合法路徑→實際抵達→權威事件，非只加標籤 |
| C4 crossfire／retake／save／trade／clutch | CODE | 真 anchor／時間窗／存活與保槍；未觸發情境具名跳過或失敗 |
| C4 eco／force 與換邊 stable team 決策 | CODE | 讀現有隊伍／經濟權威值，避免換邊倒置 |
| C 決定性、三圖雙方、Worker／completion／legacy 相容 | CODE | scoped runner，真非空因果情境與完整 hash；保留基線逐格比較 |
| C 新道具視覺（只有真事件需要時） | HYBRID | 原事件驅動 pools 優先；若確有資產缺口才 Blender 作者並整合，無另算傷害 |
| D HUD／economy／回合狀態與資訊層級 | CODE | 玩家可讀圖形、真值來源，避免 banner／通訊遮槍與戰場 |
| D spectator／相機 runtime／播放控制 | CODE | 原生操作、真選手與幀，支援 reset／seek／pause；不靠資產假狀態 |
| D Replay／未來通訊清除／Result 相容 | CODE | 播放保存 frame，不重跑引擎；必要欄位向後相容，不動 Store／Router |
| D ADR／KAST／utility 等統計 | CODE | 可靠權威來源，缺資料誠實標示，不另算第二份 UI 真相 |
| D 320／360／390／430、safe area、reduced motion | CODE | useViewport 唯一來源，真 Browser 溢出／互動驗證；真機另列未實測 |
| E 建築／Bombsite／Prop／環境最後弱面 polish | BLENDER_MCP | A 已通過不重建；只修最終完整審查指出的弱面，同源導航／collider 保持 |
| E 美術整合與資產預算核對 | HYBRID | GLB／source／材質共享／真成本量測，與 collision／Nav metadata 分開 |
| E calls444 成本、LOD／culling／FPS optimization | CODE | 先 profile 真瓶頸，減少重複材料／draw；不隱藏角色或掩體偽優化 |
| E renderer／音訊／dispose／長窗生命週期 | CODE | 同情境、同 GPU 的成本／frame-time 比較與回歸守門 |
| E 最終全套藝術、功能與同版 aggregate | HYBRID | 全 capture set Fresh-Eyes／十類 scorecard、局部 U 不補分；技術 PASS 不代藝術 |
| Owner Review 桌機 preview／手機 HTTPS tunnel | CODE | 本機及既有 cloudflared，未安裝先回報；不記錄 tunnel URL、不發布 |

## 哪些能減少反覆建置成本

袖口截面／布邊尖角、手指彎曲／掌面接觸、骨權重與握姿、人物身份剪影、近鏡頭武器比例與 UV 是最值得先用 Blender 的項目：可在同一作者場景即時旋轉、看線框／法線／骨權重及調整造型，先排除錯誤，不必每個數值都等待 Vite build → Browser 截圖。尤其袖口已反覆多輪局部候選，直接載入真幾何比繼續盲調數值更有針對性。

這是流程成本判斷，尚未量測 Blender 節省分鐘數，不承諾倍數。React 版面、戰術因果、相機操作與 FPS 無法由 Blender 證明，仍走 CODE。最終每次產品 source 改變仍需遊戲驗證，但作者探索只保留有決策價值的少量圖，不每次完整重拍。

## 可重現資產與證據

保留合法原 source asset／授權、作者 script、修改參數、輸入 SHA、匯出設定及輸出 GLB／資料 SHA。Blender MCP 執行的作者修改也必須落地 script；`.blend` 可作編輯快照，不能成為唯一修改來源。重新生成由保留來源與 script 完成，Vite build 只消費已生成資產，不能暗中重生成覆蓋修改。

目前已有 GLB 匯出及 sleeve input→candidate→bind bake→AO 的真資料管線，但數支腳本仍在 `tmp/`，不符合長期 source 管理；下一工序先把必要作者腳本與參數移至正式 CS 資產來源工具，記錄 hashes，不重跑已完成 bake。Blender 評估先使用當前真 runtime 幾何／骨姿，而不是另建近似模型取代證據。

沿 EVIDENCE_RETENTION：必要局部四圖、純量測零圖、遮擋必要補證兩圖；同 source／probe／bundle 核對後共用 build。完整最終驗收不縮成局部圖。logs／screenshots／builds／scratch 不提交；不刪歷史證據。

## 執行順序

1. 審完現有兩圖；原扳機握持仍 U 時，不重複同角度取圖。
2. Blender MCP 作者檢查真幾何／骨姿，先保存可重現輸入與腳本；證據確認缺陷才修局部。
3. CODE 整合、必要 CPU 與局部真 GPU；B7 真正通過後再收完整 B gate。
4. 依 C → D → E 接續，不跳過 phase gate；官方額度守門在續跑、階段切換與大型工序前查詢。
