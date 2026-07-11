# README 給 Claude 先讀

你現在接手的是 **ESMO Web MOBA / 電競經營遊戲**。

請先閱讀本資料夾內所有交接文件，再開始任何修改。

## 最高原則

**Legacy Experience + Modern Architecture**

- `EsportsGame.jsx` 是 Legacy Prototype，也是 UI / UX / 流程 / 英雄圖片 / Legacy 模組的產品規格來源。
- 目前主幹原始碼以本機 GitHub 工作目錄為準。
- UI / UX / 操作流程 / 資訊密度以 Legacy 為規格。
- Architecture、Store、Router、BattleResult、HeroProgress、SeasonStore、battleStore、LogicEngine 以目前主幹為準。
- MOBA Battle 保持 Three.js / React Three Fiber 3D，不恢復 Legacy 2D Battle。

## 不可做

- 不可把 `EsportsGame.jsx` 當成目前主幹程式。
- 不可用 Legacy 檔案覆蓋目前主幹架構。
- 不可建立第二套 Store。
- 不可建立第二套 Hero Database。
- 不可重新統計 BattleResult。
- 不可重寫 LogicEngine 或 Battle Balance。
- 不可因為新架構而重新設計 UI。

## 開工前必讀順序

1. `00_目前專案狀態.md`
2. `01_AI_START_HERE.md`
3. `02_Legacy_Recovery_規格.md`
4. `03_開發規範.md`
5. `04_Roadmap.md`
6. `05_Sprint紀錄.md`
7. `06_目前主幹架構.md`
8. `07_Claude_Code_接手指令.md`
9. `08_目前待辦與風險.md`

完成閱讀後，先回報理解與本次修改計畫，不要直接修改。
