# Milestone D-fix2 正式 GameView 證據

本資料夾只收本輪正式 Dashboard → MOBA → Draft → Tactic → GameView 的新證據。
舊 Milestone 截圖不重複納入。

| 檔案 | 正式畫面／用途 |
|---|---|
| `01-stage1-fx-dataflow.png` | 正式 GameView 桌面實戰；診斷列同時顯示 tower／skill 的 source、target 與 cast／travel／impact 階段。 |
| `02-stage1-buff-nameplate.png` | 正式 GameView 的紅藍 Buff 場景、縮小名稱／等級與完整血條。 |
| `03-stage2-formal-gameview.png` | 正式 GameView 團隊目標交戰；Boss HUD、角色頭頂資訊、Buff 場地標記及實戰面板同框。 |
| `04-stage2-complete-match.png` | 正式 GameView 完整對局進入賽後結果的全頁證據。 |

補充：

- `03`／`04` 皆走 Dashboard → MOBA → lineup → matchmaking → Ban/Pick →
  Tactic → 正式 GameView，不是 `moba-runtime-battle` debug harness。
- 正式畫面觀察的一場為 29:11、29:26；另由專屬 verifier 以最終程式碼完整跑完
  seed 6310（20:53.5、7:18），並輸出各決策 action tick／transition。
- 自動化瀏覽器可證明桌面正式路徑、畫面與結果流程，但不能等同 Android 真機 FPS、
  熱降頻、觸控或 safe area 驗收。
