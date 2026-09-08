# Rift 330 幾何診斷（2026-09-08）

本文件記錄候選篩選與整合證據，不代表已完成所有交付 gates。實際 source／GLB 已更新為 `esmo-rift-330-corridor-v3`。所有方案保留 330×330 世界，未修改 LogicEngine、速度、HP、AI、經濟或結果流。

## 核心問題

core-v2 full flat 8/10。regress 14/15、regress2 6/8；seed 271 的兵線長時間未到基地，英雄抵達門牙塔後仍受既有兵線條件限制。不能修改攻城條件來補救地形。

## 本次候選證據

| 幾何候選 | 回歸結果 | focused pacing | 判定 |
| --- | --- | --- | --- |
| 外路彎道收斂、道路淨寬 8、基地 flankSegs=1 | 20/20 結束，最長 32.3 分；7/8 | 24/25；v2 對照組未被判失衡；順序 23/40 vs 24/40 | 不整合 |
| 上述方案＋石怪移至 (151,248)/(179,82) | regress 15/15；regress2 8/8，最長 28.7 分 | 23/25；15 分擊殺 p50=6，v2 對照組未被判失衡；順序 16/40 vs 21/40 | 不整合 |
| 原道路＋flankSegs=1＋縮短石怪往返 | 19/20 結束；6/8 | 未跑 | 不整合 |

第二案導航 14/14；6 個營地去回可達、3 組鏡像路徑差 0。石怪去程 77.7314、回程 61.8232。這些通過項不能取代 pacing 全綠。

## 採用的 corridor-v3

保留原三路長度＋道路淨寬 8＋基地 flankSegs=1＋石怪 (151,248)/(179,82)。regress2 8/8，20/20 結束，最長 24.4 分；pacing 25/25，15 分擊殺 p50=7、首殺 p50=379s、時長 p50=21.7 分；v3 正反序藍勝 22/40 vs 23/40。runtime29 focused 35/35，v2 順序 54% vs 52%。導航 14/14。

正式 source 與 loader 候選輸出逐欄 deepEqual PASS。Blender MCP 重匯：97 meshes、167,612 triangles、13,425,188 bytes。可走格 89,083，published baseline 34,481 的 2.5835 倍。岩壁 97,760 頂點，導航輪廓外違規 0。資產 gate 14/14；presentation 12/12、controls 18/18。

完整 10 區段無 loader 回歸 **10/10 PASS，exit 0**：tactic24、cs23、progress25、experience26、talent27、stats28、regress、regress2、runtime29、build。正式 flow09／dash10 亦通過。三路 603 採樣點無通行淨寬違規。

最終 browser smoke 因 CUA 對 JS confirm 的 focus 命令持續逾時而未完成；正常返回測試 Battle 可走通，但不能宣稱新圖完整正式流程／Replay／手機畫面已驗收。未清 localStorage、未改 UI 繞過確認。野怪 rig 尚未開始。

沒有放寬 verifier 門檻，沒有將特定 seed 的勝負寫入產品。

## Replay / Online 影響

地圖座標、障礙物與路徑會改變相同 seed 的模擬結果，因此屬未來 simulationVersion 與凍結 combat inputs 的變更記錄；本工作不修改共用 Online contract。既存 replay 播放已存 frames，同尺寸但道路不同時採既有 2D fallback，不能重新跑引擎替代。
