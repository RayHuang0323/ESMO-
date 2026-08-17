# R61 UI / Mobile Product Polish 進度

## 起始 checkpoint

- 日期：2026-08-17
- branch：`release/moba-combat-closure`
- HEAD / upstream：`616404c08b5739c1ddb553e81b5abd943a6abb73`
- working tree：乾淨
- 電量：97%，未觸發低電量 checkpoint
- 範圍：高頻 UI、手機版驗收、戰隊發展 UX、R60 deterministic UI fixture；不改戰鬥核心、賽季／賽事、roster generation、player lifecycle production logic。

## Audit 摘要

- 共用 `ManageFrame` 的返回按鈕只有 32px，手機觸控目標偏小；Roster、Recruit、Team Development 共用此問題。
- Roster 的兩層篩選可橫向捲動，但按鈕與狀態文字偏小，選手列在窄視窗中仍把戰力／潛力／狀態擠在右側，需保留 hierarchy 並改善換行。
- Player 檔案已使用同一個 Player 來源切換 MOBA／CS，但 16 項能力與成長資訊在 320px 需要更清楚的欄位與觸控尺寸。
- Team Development 已有 20 節點、Lv.0/3、下一級效果與 GSAP；本輪只補「已解鎖效果／下一個可發展節點／影響範圍」的閱讀路徑，不增加節點或假造效果。
- R60 的 12 個效果節點與 8 個規劃中節點已有 production hook／inert 狀態；需要一個 Node 可跑的 deterministic fixture 覆蓋未升級、Lv1、Lv2、Lv3、前置鎖定、規劃中及資訊解鎖前後。
- Node 可驗證 DOM 結構與 state fixture，不能證明真機觸控、視覺體感或 FPS；最後以 viewport 模擬結果交付，真機仍列待人工驗收。

## 修正設計

- 沿用 `src/ui/theme.js` 的 `GC`、`FONT`、`MONO`，不新增畫面色票。
- 以「決策摘要 → 遊戲／系統內容 → 下一步操作」為共用 hierarchy；MOBA／CS 只替換 game-specific 資料。
- 手機採單欄、可換行、至少 40px 互動目標；只在篩選列／路線列保留局部橫向捲動，頁面本身不得水平溢出。
- GSAP 只保留現有戰隊發展 tab／升級 feedback，新增內容尊重 `prefers-reduced-motion`，不把動畫寫入資料或 Store。

## Phase 狀態

- [x] 起始環境與電量 checkpoint
- [x] 高頻頁面 audit
- [x] UI / responsive focused fix
- [x] deterministic fixture（`tools/check_r61_ui_fixture.mjs`）
- [x] verifier / viewport / build / review
- [x] handoff / TODO / final local commit（隨 R61 正式 local commit 完成）

## 已落地修正

- 共用管理頁返回操作提升為 40px 觸控目標，標題列允許窄版收縮。
- 名單卡片在 390px 以下改為頭像／摘要／右側資訊可換行的三段 hierarchy；摘要 modal 關閉、模式切換與完整檔案入口具備可操作尺寸。
- 選手完整檔案在 390px 以下將 16 項能力改為單欄閱讀，仍共用原 Player、XP、潛力、體力與狀態資料。
- 戰隊發展每條路線新增「已解鎖效果」與「下一個可發展節點」摘要；節點卡仍分開呈現目前效果、下一級效果、影響範圍與規劃中狀態。
- 沿用既有 GSAP tab／升級 feedback 與 reduced-motion 分支，未新增資料寫入或新動畫系統。

## 驗證與交接結果

- `tools/check_r61_ui_fixture.mjs`、`tools/check_team_development_v1.mjs`、Roster R58.1／R58.2、Recruit、Finance、CS23、Q7a 與 production build 均 PASS；JavaScript syntax 與 `git diff --check` PASS。
- Chrome extension browser smoke 以校準後 CSS viewport 320／360／390／430／1280px 驗證首頁、Roster、MOBA／CS、摘要／完整檔案、Recruit、Team Development、CS prep 與 MOBA prep；均未見水平溢出。Team Development 額外確認四分類各 5 卡、路線摘要與既有資訊解鎖區塊。
- `check_progress25.mjs` 本輪低併發執行超過 120 秒 timeout；保留既有歷史紀錄，不把未執行完成當 PASS，不改 seeds、assertion 或 baseline。
- 已移除 AppShell 玩家畫面上的 `S23 SHELL` 浮水印；source marker 保留以維持 CS23 verifier。真機觸控／safe-area／FPS／動畫體感仍待人工驗收。

## Phase 結束前狀態

- [x] focused verifier、viewport/nav smoke、production build、syntax、diff check
- [x] handoff／TODO 更新
- [x] formal R61 local commit（本文件與 R61 變更同一提交）
