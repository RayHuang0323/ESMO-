# Sprint 02 — ESMO Match System 完成報告

> 目標：Battle 打完後真正影響平台。**未修改** LogicEngine／Battle 演算法／AI／tick／R3F／FPS／applyRoster／任何戰鬥或英雄公式。

---

## 現況分析（實作前完整盤點）

**Battle 後已存在、已在運作的（recordMatch 共用管線，MOBA/CS 皆觸發）**：
- **Match Economy**：獎金已進 `budget`（勝 25–45／敗 8）。
- **Player Progress**：`stats` 成長（rating×年齡×潛力驅動）、士氣、體力、condition 都在更新；CS 另累計 KDA/lastMatch。
- **Match History**：`matchHistory` 存 20 筆；MatchPrep 內已有依 MOBA/FPS 過濾的檢視。
- **Dashboard**：`DashModule`（經營儀表板）已接真實資料（勝率/戰力/士氣/體力）。
- **Home 更新**：Sprint 01 已真實化（戰績/排名/人氣/財務/XP）。
- **賽事結算**：賽季交替閉環完整——達標發 `reward`+`fan`、選手老化、目標晉級、發通知。
- **賽季資訊**：`season`/`seasonWins`/`seasonGoalIdx`/standings 排名皆在。

**真缺口（本 Sprint 補齊）**：
1. **Hero Progress 完全不存在** — 英雄打再多場毫無累積（唯一全新正式資料模型）。
2. **MOBA result 貧血** — LogicEngine 快照無逐選手數據，MOBA 場次的個人記錄與英雄使用都無來源（不可改引擎，故從 BattleConfig 衍生「出戰陣容」）。

> 結論：Ray 列的 8 項中 **6 項已存在且運作**，故本 Sprint 不重造，只補真缺口＋讓既有系統對 MOBA 生效。**未新增任何展示假資料。**

---

## 1. Flow Diagram

```
Battle 結束（MobaBattleAdapter 偵測 over）
  │ 從 BattleConfig 組「我方出戰陣容」lineup（選手×英雄，依 role 對位）
  ▼
snapshotToBattleResult(snap, {…, lineup})  ← 帶 lineup（純平台資料）
  ▼ BattleResult（含 lineup）
Router.completeBattle → BATTLE_COMPLETE → game.recordMatch(result)
  ├─▶ Match Economy   budget += prizeGain（既有）
  ├─▶ 戰績/賽季       record / seasonWins（既有）
  ├─▶ 人氣/XP        fanCount / xp（既有）
  ├─▶ Player Progress stats 成長・士氣・體力（既有）
  │                   ＋MOBA 選手 lastMatchMoba{heroId,win}（★新）
  ├─▶ Hero Progress   heroStats[heroId] += {games,wins,losses}（★新模型）
  └─▶ Match History   matchHistory[0] 含 lineup（★明細）
  ▼
Home / DashModule / CodexModule 讀真實 state 呈現
  └─ CodexModule 每個英雄顯示「N 場 · 勝率%」（★Hero Progress 可見）
```

## 2. 新增資料流
- **BattleConfig → lineup**：MobaBattleAdapter `buildLineup(cfg)` 依 lane/role 把 `roster` 選手與 `draft.picks.blue` 英雄對位成 `[{role,playerName,heroId,heroZh}]`。
- **lineup → BattleResult.lineup**：snapshotToBattleResult 透傳。
- **BattleResult.lineup → heroStats**：recordMatch 累計每英雄 games/wins/losses。
- **BattleResult.lineup → roster[i].lastMatchMoba**：MOBA 選手本場英雄+勝負。

## 3. 修改檔案
| 檔案 | 改動 |
|------|------|
| `platform/contracts/BattleResult.js` | ＋`lineup` 欄位（新增非改名，透傳） |
| `battle/moba/snapshotToBattleResult.js` | result 帶 `meta.lineup` |
| `battle/moba/MobaBattleAdapter.jsx` | ＋`buildLineup(cfg)`；onComplete 組 lineup 傳入 |
| `EsportsGame.jsx` | ＋`heroStats` state＋setter＋context；recordMatch 累計 heroStats＋MOBA lastMatchMoba；CodexModule 顯示 Hero Progress 徽章 |

## 4. 新增檔案
無。**全部在既有檔案內以最小改動完成**（Hero Progress 是 state 模型，不需獨立檔）。

## 5. 完全沒修改的模組
LogicEngine（兩版）、App.jsx、applyRoster、buildEngineSlots、mobaRosterAdapter 公式、MobaView3D／R3F、**FPS 全線**（EsportsFPS3D、FPS flow、CSMatchReport）、GameRouter／matchFlows／stages、DashModule、FinanceModule、賽季結算邏輯、SponsorModule、TrainingModule、所有戰鬥/英雄公式。CS 的 recordMatch 路徑邏輯完全不變（lineup 分支僅在 `!isCS` 觸發）。

## 6. 回歸驗證（Node）
- ✓ `buildLineup`：5 人選手×英雄依 role 正確對位。
- ✓ `snapshotToBattleResult`：MOBA result 帶完整 lineup。
- ✓ **Hero Progress**：3 場（勝勝敗）累計 → 賭徒 3場2勝1敗，勝率 67%。
- ✓ **向下相容**：CS／無 lineup 的 result → heroStats 完全不變。
- ✓ MOBA 選手可回查本場英雄（lastMatchMoba 資料源就緒）。
- ✓ EsportsGame.jsx 嚴格括號掃描（處理字串/模板/註解）＝完全平衡；三個純 JS 檔 `node --check` 通過。

**本機驗證**：打一場 MOBA → 英雄圖鑑（資料庫→英雄圖鑑）該場 5 隻英雄應各顯示「1 場 · 100%/0%」；再打幾場觀察場次/勝率累加；選手詳情可見 lastMatchMoba；Match History（比賽中心→MOBA→賽前歷史）該場含出戰英雄。CS 流程與 Sprint 前完全相同。

## 7. 下一個 Sprint 建議
**Sprint 03＝賽程系統（Schedule/Season Loop）**：目前 `season` 何時 +1 依賴 `advanceDay`，但賽程（`schedule`）與比賽觸發未閉環——玩家仍是「手動點 MOBA」而非「照賽程打聯賽」。把 schedule → 觸發對戰 → 賽季推進串成循環，會讓 Match System 的所有回寫真正嵌進賽季敘事。地基（standings/SEASON_GOALS/seasonWins）已備。

## 8. 技術債
| 類型 | 項目 | 說明 |
|------|------|------|
| 技術債 | MOBA 無逐選手 KDA | LogicEngine 快照貧血；本 Sprint 用 lineup 補「英雄使用/勝負」，但個人 K/D/A 仍無（需引擎補個人統計，屬 Battle 層，延後） |
| 技術債 | Hero Progress 未持久化 | heroStats 為記憶體 state，重整清空（全平台 state 皆如此，待存檔系統統一處理） |
| 技術債 | PostMatchDashboard 仍用 genMatch 假資料 | 它是 CS BO5 展示元件，未接真實；本 Sprint 的真實 Dashboard 是 DashModule。兩者並存，未來可擇一收斂 |
| 技術債 | standings 排名公式三處重複 | MainMenu／update 階段／LeagueModule（rule of two 已超，下個碰到時抽 util） |
| 技術債 | lineup 對位假設 starters 順序 | buildLineup 依中文 role 對位，若選手無 role 欄位會漏；目前 INITIAL_ROSTER 皆有 role，安全 |
| 可延後 | Hero Progress 深化 | 目前只有 games/wins/losses；未來可加 KDA、平均表現、常用搭配 |
| 不建議現在做 | 改 LogicEngine 產個人 KDA | 屬 Battle 層、在禁改清單，且 Balance 未做前無意義 |

**完成即停。不開始 Battle Balance／Replay／多人／Hero Skill。**
