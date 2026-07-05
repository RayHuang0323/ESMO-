# Sprint — ESMO Platform Data Layer 完成報告

> 目標：Battle 結束後建立完整 Platform Data Layer。**未修改** LogicEngine／Battle／AI／Tick／Formula／FPS／R3F／Router／Flow。

---

## 實作前盤點

**recordMatch 已更新（11 塊）**：record(勝負/連勝)、seasonWins、fanCount、budget、xp(+升級給天賦點)、roster(CS KDA/lastMatch、MOBA lastMatchMoba、stats 成長、士氣、體力、condition)、heroStats(games/wins/losses)、matchHistory、notifications。

**真資料 Dashboard**：DashModule（勝率/戰力/士氣/體力，讀 game.record/roster）。**假資料**：PostMatchDashboard（`genMatch(seed)` CS BO5 展示，未接真實）。

**已存在但沒真正使用**：matchHistory 存了卻只在 MatchPrep 過濾顯示；heroStats 僅 3 欄；lastMatchMoba 無檢視。

**需拆分**：recordMatch 單一函式約 75 行、混合 6 種職責。**GameState 過大**：GameProvider value 超過 50 個鍵。

---

## 1. 資料流 Diagram

```
Battle 結束 → BattleResult(含 lineup)
        │
        ▼
recordMatch(result)  ── 協調器（只做流程調度）──
  ├─ deriveMatchContext          → ctx{win,isCS,marginF,streakBefore}
  ├─ updateEconomy               → fanCount / budget / xp / talentPoints
  ├─ updateSeason                → record(戰績) / seasonWins
  ├─ updatePlayerProgress        → roster：KDA/成長/士氣/體力 ＋ Player Career
  ├─ updateHeroProgress          → heroStats（正式 14 欄 Schema）
  ├─ updateMatchHistory          → matchHistory
  └─ buildMatchNotification      → notifications
        │
        ▼
Platform State（record / roster.career / heroStats / matchHistory …）
        │
        ▼   analytics.js（純衍生 selectors，零假資料）
  ├─ getDashboardData   → 近十場/勝率/連勝/連敗/英雄使用率/玩家成長
  ├─ getHeroAnalytics   → pickRate/winRate/favoritePlayer/lastUsed
  └─ getMatchAnalytics  → matchSummary/teamStats/heroStats/economyStats/timeline
        │
        ▼
Dashboard（DashModule 接 getDashboardData/getHeroAnalytics）→ Home
```

## 2. 修改檔案
| 檔案 | 改動 |
|------|------|
| `EsportsGame.jsx` | recordMatch 內聯邏輯 → 協調器（呼叫 6 純函式）；import Data Layer；DashModule 接 getDashboardData/getHeroAnalytics 並顯示近況+英雄使用；CodexModule 仍用 heroStats（Sprint 02） |

## 3. 新增檔案
| 檔案 | 內容 |
|------|------|
| `platform/data/matchRecorder.js` | 6 個 update 純函式 ＋ `createHeroProgress()` / `createPlayerCareer()` Schema 工廠 |
| `platform/data/analytics.js` | `getDashboardData` / `getHeroAnalytics` / `getMatchAnalytics` selectors |

## 4. 已模組化的函式
`deriveMatchContext`、`updateEconomy`、`updateSeason`、`updatePlayerProgress`、`updateHeroProgress`、`updateMatchHistory`、`buildMatchNotification` — 全為純函式、可 Node 測試、可被 Sprint 03/04/05 重用。recordMatch 從 75 行內聯縮為 ~20 行協調。

## 5. 正式建立的資料模型
| 模型 | 欄位 | 現況 |
|------|------|------|
| **Hero Progress** | games/wins/losses/pickCount/lastPlayed/masteryExp/masteryLevel/mvp/kills/deaths/assists/damage/tower/healing | 前 8 項有資料；kills…healing 預留（無逐英雄來源） |
| **Player Career** | games/wins/losses/winRate/favoriteHero/totalMvp/kills/deaths/assists/damage/heroCounts | 全部有資料；damage 預留 |
| **Match Analytics** | matchSummary/teamStats/heroStats/economyStats/timeline | 格式立起；timeline 預留空陣列 |

## 6. 完全沒修改
LogicEngine（兩版）、App.jsx、applyRoster、buildEngineSlots、公式、MobaBattleAdapter、snapshotToBattleResult、R3F/MobaView3D、**FPS 全線**、GameRouter/matchFlows/stages、BattleConfig/BattleResult 合約、賽季結算 effect、FinanceModule、SponsorModule、TrainingModule。

## 7. 回歸驗證（Node）
- ✓ **重構等價**：MOBA勝/敗、CS勝三場景，重構後純函式輸出與重構前內聯邏輯**逐欄位完全一致**（economy/season/player/history/notif）。
- ✓ Hero Progress 14 欄 Schema 齊備；累計正確（ironclad 3場2勝 mastery Lv.2、gambler MVP=1）。
- ✓ Player Career 齊備（Kratos 3場 勝率67% 常用英雄=ironclad MVP=1）。
- ✓ Dashboard Data（勝率90%/連勝2/近十場75%/英雄使用2隻）。
- ✓ Hero Analytics（ironclad pickRate50% winRate67% 愛用者=Kratos）。
- ✓ Match Analytics 五區格式齊備（timeline 預留空）。
- ✓ 向下相容：CS/無 lineup 不動 Hero Progress。
- ✓ Sprint 01 Router 6 組、Sprint 02 資料流全綠回歸；EsportsGame 括號嚴格掃描平衡。

**本機驗證**：打幾場 MOBA → 經營儀表板（戰隊管理→經營儀表板）應見「近況」近十場勝敗格、連勝/連敗、「英雄使用率·熟練」清單（Lv/場次/勝率）；英雄圖鑑徽章持續累加；CS 流程與本 Sprint 前完全相同。

## 8. 技術債
| 類型 | 項目 | 說明 |
|------|------|------|
| 技術債 | Hero/Career 的 kills/deaths/assists/damage/tower/healing 預留空 | LogicEngine 快照無逐英雄數據；Schema 已備，待 Battle 層補即自動填 |
| 技術債 | timeline 空 | 需引擎輸出事件序列（禁改，延後） |
| 技術債 | Data Layer 未持久化 | heroStats/career 為記憶體 state，重整清空（待存檔系統統一） |
| 技術債 | PostMatchDashboard 仍用 genMatch 假資料 | CS BO5 展示元件；真實儀表板為 DashModule。可未來收斂 |
| 技術債 | GameProvider value 過大（>50 鍵） | 本 Sprint 未拆 context（避免動到大量讀取端）；建議未來按領域拆 context 或改 store |
| 技術債 | standings 排名公式三處重複 | rule of two 已超，下個 League Sprint 順手抽 util |
| 技術債 | Data Layer 尚無獨立 selector 快取 | 目前每 render 重算，資料量小無感；量大再 memoize |

---

## 給後續 Sprint 的地基
- **Sprint 03（Schedule）**：`updateSeason` 已獨立，可接賽程觸發；matchHistory 為賽程結果來源。
- **Sprint 04（League）**：`getDashboardData`/standings 已有勝率/排名素材；heroStats 可做聯賽 meta 分析。
- **Sprint 05（Management）**：Player Career（favoriteHero/winRate/totalMvp）為轉會/續約決策資料源。

**完成即停。不開始 Battle Balance／Replay／Multiplayer／Hero Skills。**
