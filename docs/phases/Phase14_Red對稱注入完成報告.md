# Phase 14 — Red Team 對稱注入完成報告

> **未修改**：Battle 演算法、tick、AI、傷害、Router、platformToMobaConfig。FPS 零接觸。
> 修改檔案（3 處、全在既有注入路徑上）：
> 1. `battle/moba/mobaRosterAdapter.js` — buildEngineSlots 對稱化＋缺資料中性化
> 2. `App.jsx` 內聯 LogicEngine.applyRoster — (side|role) 對位（僅此方法，Phase 10 新增的注入口）
> 3. `LogicEngine.js`（獨立版）— 同步相同改動

---

## 改動內容

### buildEngineSlots：Blue / Red 走同一段程式碼
抽出 `buildSideSlots(picks, roster, side)`，**藍紅雙方呼叫完全相同的函式**，差別僅在資料來源：

| | picks | roster |
|--|-------|--------|
| Blue | `cfg.draft.picks.blue` | `cfg.roster` |
| Red | `cfg.draft.picks.red` | `cfg.opponent`（僅當元素含 `stats` 才視為選手） |

輸出由 5 slot → **10 slot**（前 5 blue、後 5 red），每個 slot 新增 `side` 欄位。

### applyRoster：(side|role) 對位
原 Phase 10 為 blue-only（`p.side !== "blue"` 跳過）。改為依 `(slot.side|role)` 對位覆蓋；**slot 未帶 side 時預設 "blue"**——舊格式 slots 行為與 Phase 10/13 完全相同。

### 缺資料中性化（對稱前提）
`calcPlayerMobaPower`：整個 player 或 stats 不存在 → 回 **ANCHOR(70)** → playerScale=1.0。AI 對手沒有 16 維資料時**不受懲罰也不憑空得利**，只吃英雄 arch/diff 定位。（原退化值 50 會讓無資料側被扣 14%，違反對稱原則。）

資料流達成：`BattleConfig → buildEngineSlots → applyRoster → LogicEngine`，**Blue / Red 完全一致**。

---

## 驗證結果

### 1. Blue / Red 有效戰力是否一致 → ✅ 完全相等
相同輸入（同英雄＋同選手餵兩側）→ 逐 role 的 power/tough 完全相等；有效戰力 **blue=189.69 ＝ red=189.69**（誤差 <1e-9）。**Phase 13 揭露的 +14.3% 我方憑空優勢已消除。**

### 2. 相同輸入下 Battle 是否對稱 → ✅ 注入端完全對稱
10 seeds 統計：blue勝0／red勝0／未分10，總擊殺 blue=9 vs red=11。
- 數值注入端已證完全對稱（戰力逐 role 相等）。
- 擊殺 9 vs 11 的微小差與 10 場皆未分勝負，源自 **LogicEngine 既有**的地圖幾何/AI 行為與「近零擊殺」技術債——不在本 Phase 範圍（不改 AI/tick/傷害），留待 `/balance`。

### 3. 是否向下相容 → ✅ 三路徑皆證
| 路徑 | 結果 |
|------|------|
| 舊格式 slots（無 side） | 預設 blue，Phase 13 行為不變；紅方不受影響 |
| 無 draft → 10 slot 全 null | 4 seeds **逐幀 snapshot ＝ Phase 10**（未注入）完全一致 |
| 紅方無選手資料 | playerScale=1.0 中性（mid＝36×1.06＝38.16），playerName=null |

---

## 後續（不在本 Phase）
- **LogicEngine 近零擊殺／600 秒未分勝負**：Battle 層平衡，`/balance` 專項。
- 紅方英雄身份完整化：待 DraftModule 產出紅方 picks（資料流已就緒，有 pick 即自動注入）。
- 未來 AI 對手若建 16 維資料（AI_TEAMS 強度→等效 stats），走同一條線即生效，零改接線。

**完成即停。不開始 Battle Balance。**
