# 更新日誌 — Sprint 04：Battle Presentation Layer

## 新增
- **Battle Presentation Layer**（`src/battle/`）：把 Battle Engine 的真實輸出接上畫面，零假資料。
  - `battleEvents.js`：快照差分推導 Timeline 事件（First Blood / KILL / 連殺 / ACE / Tower / Dragon / Baron / Victory）與即時 MVP 候選。
  - `battleReducer.js`：純函數狀態轉換（事件累積、浮動佇列、龍/巴龍計數、推塔數）。
  - `battleStore.js`：獨立 zustand store（核心 `useGameStore` 一行未改）。
  - `battleFocus.js`：鏡頭焦點推導（資源坑 / 交戰聚類 / 我方重心）。
  - `useBattleFeed.js`：核心快照流 → 呈現層的唯一單向接線。
  - `ui/`：BattleHUD、BattleTimeline、BattleFloatingText、BattleScoreboard、BattleCameraController、BattlePresentationLayer。

## 變更
- `LogicEngine.js`：**唯一引擎觸碰**——3 處純附加儀器化（player `k`/`d` 累計 + snapshot 附加 `k`/`d`/`gold`）。跨 5 seed 逐幀快照等價驗證，數值/行為零改變；個人 K/D 總和守恆於團隊比分。

## HUD 正式化
- 雙方比分、Battle Timer、推塔數、Dragon、Baron、Gold 差、Win Probability、即時 MVP 候選，全部直接讀 snapshot。

## 已知阻塞（未於本 Sprint 處理，屬 Battle 演算法範疇）
- **對局平衡崩壞**：10 seed 全數 timeout（60 模擬分未分勝負），平均 0.3 kills/場。根因初判：小兵/lateFactor 使外塔開局即崩，主堡（NEXUS_HP=2600）無對應破壞力；英雄一旦 <25% HP 進入「撤退」後泉水不回血，全隊卡撤退死循環。呈現層雖已就緒，但在此平衡下畫面為空洞死局。→ 下一步 `/balance`。
