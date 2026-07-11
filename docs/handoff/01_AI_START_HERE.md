# 01 AI START HERE

## 你要先做的事

每次開工前，先讀本資料夾文件。

不要依舊記憶推論。

不要直接開始修改。

## 工作模式

1. 先讀交接文件。
2. 再讀本機 GitHub 目前相關原始碼。
3. 先回報：
   - 現況
   - 問題
   - 修改計畫
   - 預計修改檔案
4. 等使用者確認或任務明確後再修改。
5. 修改後提供：
   - 修改檔案完整路徑
   - 驗證結果
   - Legacy Diff Checklist
   - 技術債

## 本機主幹優先

目前主幹以本機 GitHub 工作目錄為準。

Project Knowledge 中的 `EsportsGame.jsx` 是 Legacy UI / UX / 資料來源，不是目前主幹程式。

## Legacy 使用方式

`EsportsGame.jsx` 可用來讀：

- Legacy MainMenu
- RoleSelectModule
- DraftModule
- TacticsModule
- Loading
- Hero Detail
- Codex
- Recruit
- Finance
- Sponsor
- Training
- HERO_IMG / 英雄圖片
- CHAMPIONS_100
- SKILL_DB
- CHAMP_DATA

但不得用它覆蓋目前主幹。

## 不要全文掃描

避免大量 Token 消耗。

除非必要，不要全文讀整個專案。

應先讀指定檔案，再用搜尋定位 Legacy 模組。

## 禁止

- 不要大幅重構。
- 不要自由重新設計 UI。
- 不要開始下一個 Sprint。
- 不要建立第二套資料來源。
- 不要重寫戰鬥引擎。
