# 07 Claude Code 接手指令

## 接手方式

Claude Code 應直接在本機 GitHub 專案資料夾工作。

不要以 Project Knowledge 裡的舊 JS / JSX 檔案作為目前主幹。

## 開工前

先讀：

- README_給Claude先讀.md
- 00_目前專案狀態.md
- 01_AI_START_HERE.md
- 02_Legacy_Recovery_規格.md
- 03_開發規範.md
- 04_Roadmap.md
- 05_Sprint紀錄.md
- 06_目前主幹架構.md
- 08_目前待辦與風險.md

## Sprint 19 建議先讀檔案

只讀必要檔案，不要掃整個專案。

先讀：

- `src/AppShell.jsx`
- `src/screens/DashboardScreen.jsx`
- `src/screens/moba/RoleSelectScreen.jsx`
- `src/screens/moba/BanPickScreen.jsx`
- `src/screens/moba/MatchmakingScreen.jsx`
- `src/screens/moba/TacticScreen.jsx`
- `src/screens/moba/LoadingScreen.jsx`
- `src/GameView.jsx`
- `src/battle/ui/BattleHeroStrip.jsx`
- `src/battle/ui/BattleHUD.jsx`
- `src/battle/ui/BattleTimeline.jsx`
- `src/battle/ui/HeroDetailPanel.jsx`
- `src/screens/moba/HeroCodexDetail.jsx`
- `src/data/heroDatabase.js`
- `src/data/roster.js`

## 需要 Legacy 規格時

不要全文讀 `EsportsGame.jsx`。

用搜尋定位：

- MainMenu
- RoleSelectModule
- DraftModule
- TacticsModule
- Loading
- PostMatch
- HERO_IMG
- CHAMPIONS_100
- SKILL_DB
- CHAMP_DATA

## 修改前

先回報：

1. 現況接線。
2. 發現的問題。
3. 修改計畫。
4. 預計修改檔案。
5. 不會修改哪些 Contract / Engine 檔案。

## 修改後

必須交付：

1. 修改檔案完整路徑。
2. 修改內容摘要。
3. 驗證結果。
4. 本機驗收步驟。
5. Legacy Diff Checklist。
6. 尚未恢復項目。
7. 下一 Sprint 建議。

## 不可做

- 不要開始下一個 Sprint。
- 不要大幅重構。
- 不要重寫 UI。
- 不要動 Battle Balance。
- 不要建立第二套資料來源。
