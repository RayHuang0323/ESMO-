# 🎮 ESMO

> 一款使用 Web 技術打造的 3D MOBA 遊戲。

---

# 專案簡介

ESMO 是一款以 React、Vite、React Three Fiber（R3F）與 Three.js 開發的 MOBA 遊戲。

本專案的目標是建立一套容易維護、容易擴充，並可持續透過 AI 協作開發的遊戲架構。

目前仍屬於 Alpha Prototype 開發階段。

---

# 🧭 架構主線（Trunk）— 重要

> 本節為 ESMO 唯一的權威架構定義，所有 AI 協作與開發都以此為準。最後拍板：2026-06-30。

**主線（Trunk，唯一長期維護）：React + Vite + React Three Fiber（Three.js r160）。**
- 核心檔案：`gameData.js`、`LogicEngine.js`、`useGameStore.js`、`useLocalServer.js`、`MobaView3D.jsx`、`GameView.jsx`。
- 所有新功能、修正、重構都在此進行。建置進入點 `src/main.jsx` 掛載的是 `<GameView/>`。

**Legacy Prototype（只供參考與功能移植，不再維護）：Artifact／沙盒 monolith。**
- 檔案：`EsportsGame.jsx`、`App.jsx`、`EsportsFPS3D.jsx`（為 Claude artifact 沙盒撰寫，使用 Three.js r128 舊 API）。
- 定位：功能與資料（如 `CHAMPIONS_100`、`SKILL_DB`、`PERSONALITY`、戰鬥模型）的**來源庫**。後續工作是把這裡的功能**逐步移植**進主線，而非繼續在其上開發。
- 其 r128 舊 API 無需修復，因為它不再被建置為產品。

接手本專案的人或 AI，請只在主線上開發；需要某項功能時，從 Legacy Prototype 移植過來。

---

# 專案特色

- ⚔️ MOBA 遊戲玩法
- 🌐 Web 技術開發
- 🎨 3D 場景（React Three Fiber）
- 🤖 AI 協作開發
- 📚 完整開發文件
- 🔄 GitHub 版本管理

---

# 技術

- React
- Vite
- React Three Fiber (R3F)
- Three.js (r160)
- JavaScript

---

# 專案結構

```text
ESMO
├── src/
│   ├── main.jsx        ← 主線進入點（掛載 GameView，不碰 App）
│   ├── GameView.jsx    ← 主線根元件
│   ├── MobaView3D.jsx  useLocalServer.js  useGameStore.js
│   ├── LogicEngine.js  gameData.js
│   ├── data/
│   │   ├── heroes.js      ← 英雄資料（ROLE_STATS 已接線；CHAMPIONS_100 名單）
│   │   └── heroMapping.js ← Hero Mapping Layer（玩家↔英雄身份，純函式）
│   └── index.html 由根目錄載入 /src/main.jsx
├── docs/           專案文件
├── legacy/         Legacy Prototype（沙盒成品，僅供參考與移植）
├── backup/         重大版本備份
├── package.json
└── README.md
```

> 註：`src/main.jsx` 與 `GameView.jsx` 等主線檔需置於同層；`index.html` 的 `<script src="/src/main.jsx">` 已對應此路徑。`legacy/` 用以隔離 `EsportsGame.jsx`、`App.jsx` 等沙盒檔。

---

# 文件

所有開發文件皆位於 `docs/`，主要包含：

- AI 專案說明
- 專案介紹
- 遊戲設計（GDD）
- 開發路線圖（`03`，含 v0.2 任務）
- 更新日誌（`04`）
- 英雄資料庫
- 技能資料庫
- 待辦事項
- 開發者手冊
- 技術債務清單（`09`，含現階段 Top 5）

---

# 專案狀態

目前開發階段：

> Alpha Prototype ｜主線：React + Vite + R3F（r160）｜進行中版本：v0.2（地基整理）

---

# 開發者

Ray
