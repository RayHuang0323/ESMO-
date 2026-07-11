# 02 Legacy Recovery 規格

## 最高產品原則

**Legacy Experience + Modern Architecture**

Legacy Prototype 是正式產品規格。

不是參考，不是靈感，不是舊版。

## Presentation 規則

以下項目以 Legacy 為準：

- UI 版面
- UX 流程
- 卡片順序
- 資訊密度
- 動畫
- 操作節奏
- 顏色與視覺階層
- Hero Detail 四分頁
- Ban/Pick 輪選體驗
- Dashboard 經營首頁密度

## Architecture 規則

以下項目以目前主幹為準：

- Router / AppShell
- Store
- BattleResult
- HeroProgress
- SeasonStore
- battleStore
- LogicEngine
- 3D Battle
- heroDatabase 單一資料來源

## 唯一例外

MOBA Battle 場景保持目前 Three.js / React Three Fiber 3D。

不得恢復 Legacy 2D Battle。

但 Battle 的資訊層要恢復 Legacy：

- HUD
- Hero Strip
- Hero Detail
- Timeline
- Scoreboard
- Overlay
- 播放控制
- 隊伍資訊

## Recovery 正確方式

正確：

Legacy UI  
→ Component 化  
→ Adapter  
→ New Store

錯誤：

New UI  
→ 接 Store  
→ 聲稱 Legacy 已恢復

## EsportsGame.jsx 身分

`EsportsGame.jsx` 是 Legacy Prototype 規格來源。

可以讀：

- UI / UX
- Hero image / base64
- Hero data
- Legacy 模組
- Legacy 動畫
- Legacy 資訊密度

不可做：

- 不可當成目前主幹。
- 不可覆蓋新架構。
- 不可恢復舊 Store。
- 不可恢復舊 Router。
- 不可恢復舊 Battle Engine。

## 驗收標準

每次交付都必須包含 Legacy Diff Checklist：

1. 哪些已與 Legacy 一致。
2. 哪些仍不一致。
3. 不一致原因：
   - 尚未恢復
   - 技術限制
   - 資料尚未接上
   - 產品刻意升級
4. 下一步如何修。
