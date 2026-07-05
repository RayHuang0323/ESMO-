# Sprint 01 — MOBA Game Flow Integration 完成報告

---

## 現況分析（實作前盤點）

**1. 原完整流程**：Home → MOBA(prep) → 配對(matching) → Ban/Pick(draft) → 戰術(tactic) → Battle →（App 內建勝利畫面兼作 result）→ 手動返回 Home。
**2. 缺的 Stage**：Loading（tactic→battle 過場）、正式 Result（平台級戰報）、Update（平台更新展示）。
**3. 已存在只是沒串起來**：Router 的 result 階段（resultOptional 掛空）、recordMatch 完整回寫管線（戰績/財務/人氣/XP/選手成長早已在寫，只是沒有畫面展示）、matchHistory[0]（CSMatchReport 同款資料源）、rematch()。
**4. 可直接重用的 UI**：MatchPrep / MatchmakingScreen / DraftModule / TacticSelect / MobaBattleAdapter / CSMatchReport 的資料模式（matchHistory[0]）/ GC 設計語言。
**5. 已存在的 Router**：GameRouter（next/back/completeBattle/rematch/reset）、useGameRouter、MATCH_FLOWS、BATTLE_START/BATTLE_COMPLETE 事件、recordMatch 訂閱管線——**全部沿用，未建第二套路由**。
**6. 已存在不需重做的資料**：BattleConfig（含 draft）、BattleResult、recordMatch 回寫的 record/fanCount/budget/xp/seasonWins/matchHistory、AI_TEAMS＋standings 排名公式（LeagueModule 同款）、SEASON_GOALS、HERO_IMG。

**額外發現的真缺口**：MainMenu（Home）的 TEAM 物件是**寫死假資料**（lv:93、$40.1萬、fans:"2041"），從未讀 game context——本 Sprint 一併修正。

---

## 1. Flow Diagram（全程 Router 管理）

```
Home(menu)
  │ startMoba() = mobaRouter.reset()
  ▼
prep 賽前準備 ──next()──▶ matching 配對 ──next()──▶ draft Ban/Pick
  ▼ next()
tactic 戰術（組 BattleConfig：starters＋draftResult＋seed）
  ▼ next()
loading 對戰卡 ★新（自動 2.4s → next()，battle 守門在此驗 config）
  ▼ next() → BATTLE_START
battle（MobaBattleAdapter／R3F App）
  ▼ completeBattle(BattleResult) → BATTLE_COMPLETE → recordMatch 回寫
result 賽後戰報 ★新（MobaMatchReport；可 rematch 回 battle）
  ▼ next()
update 平台更新 ★新（PlatformUpdateScreen：戰績/排名/人氣/財務/XP/賽季）
  ▼ 返回首頁 = setView("menu")
Home（MainMenu 讀真實 state，數字已同步）
```

## 2. 修改檔案清單
| 檔案 | 改動 |
|------|------|
| `platform/router/stages.js` | ＋LOADING、UPDATE 常數 |
| `platform/router/matchFlows.js` | MOBA stages 插入 loading/update；resultOptional→false。**FPS 定義未動** |
| `platform/router/GameRouter.js` | 2 處最小修改：completeBattle 的 finished 改為「result 為最後一站時」才設（FPS＝最後一站行為不變）；next() 抵達最後一站補設 finished |
| `EsportsGame.jsx` | import 新畫面；MOBA view 四階段接線（loading/battle/result/update）；header 標籤；mobaBack 補 update；**MainMenu 假資料→真實 game context**＋戰績/排名列 |

## 3. 新增檔案清單
| 檔案 | 內容 |
|------|------|
| `platform/ui/MobaFlowScreens.jsx` | MobaLoadingScreen（VS 對戰卡＋自動前進）、MobaMatchReport（平台級戰報）、PlatformUpdateScreen（賽後更新）。純呈現元件，資料全由 props 進，不觸碰引擎 |

## 4. 重用的 UI
MatchPrep、MatchmakingScreen、DraftModule、TacticSelect、MobaBattleAdapter（原樣）、HERO_IMG（頭像）、GC 深色卡片視覺語言、CSMatchReport 的 matchHistory[0] 資料模式（MOBA 戰報同款來源）。

## 5. 重用的 Router
GameRouter 全部既有 API：next/back/reset/rematch/setBattleConfig/completeBattle、BATTLE_START/BATTLE_COMPLETE 事件、recordMatch 訂閱管線、useGameRouter。**未建立任何第二套路由**；loading/update 只是 flow 陣列裡的兩個新站點，Router 程式碼近乎零改（僅 finished 語意 2 行）。

## 6. 完全沒修改的地方
LogicEngine（兩版）、App.jsx、MobaBattleAdapter.jsx、snapshotToBattleResult、applyRoster、buildEngineSlots、mobaRosterAdapter（公式）、MobaView3D／R3F 渲染、**FPS 全線**（EsportsFPS3D、FPS flow、CSMatchReport、fps view 接線）、BattleResult／BattleConfig 合約、recordMatch、DraftModule、任何數值公式。

## 7. 本機驗證方式
1. `npm run dev` → 首頁：確認頂部顯示**真實** Lv/XP/戰績/排名/連勝，財務籤＝$800萬（初始 budget）、MOBA 卡人氣＝2041（初始 fanCount）。
2. MOBA → 配對 → Ban/Pick → 戰術確認 → 應出現**對戰卡 Loading**（雙方 picks 頭像、進度條 2.4s 自動進戰場）。
3. Battle 打完 → 應自動切到**賽後戰報**（勝敗橫幅、擊殺比、時長、我方陣容、聲望/獎金/經驗真實增量）。
4. 「查看平台更新」→ **平台更新頁**（戰績+1、排名、人氣+Δ、財務+Δ、XP+Δ、賽季進度）→ 返回首頁。
5. 首頁數字應與更新頁一致（勝場+1、人氣/財務已加）。
6. 戰報頁「再戰一場」→ 直接回 Battle（新 seed）。
7. FPS 全流程走一遍：行為應與 Sprint 前完全相同（result 即最後一站）。
8. Node 回歸：`node /tmp/sprint01_flow.mjs`（Router 6 組驗證全綠）。

## 8. 下一個 Sprint 建議
**Sprint 02 = Battle Balance（/balance）**：LogicEngine 近零擊殺、600 秒未分勝負——現在 Flow 完整後，這是玩家體驗最痛的點（打完常是 0:0 未分勝負進戰報）。已具備：對稱注入、逐幀驗證框架、公式錨定。

---

## 技術債與延後事項（只列不做）

| 類型 | 項目 | 說明 | 建議 |
|------|------|------|------|
| 技術債 | LogicEngine 近零擊殺/無勝負 | 戰報常顯示低比分未分勝負 | Sprint 02 /balance |
| 技術債 | seed 未接通 | BattleConfig.seed 已組裝並傳遞，App 仍用內部 seed；決定性重播不成立 | 未來「Replay Sprint」一併做 |
| 技術債 | MainMenu 財務小柱狀圖 finBars 仍為裝飾假數 | 非本 Sprint 範圍（無真實週次財務序列可畫） | 待財務歷史紀錄系統 |
| 技術債 | modes 卡「3 小時內/🌙」badge 為裝飾字串 | 無對應真實排程資料 | 待賽程系統接 schedule |
| 技術債 | standings 排名公式在 LeagueModule 與 MainMenu/update 三處重複 | 皆為同一公式的 inline 副本 | 待第三處出現時抽 util（rule of two 已達，可在下個碰到的 Sprint 順手抽） |
| 技術債 | FPS 雙版本漂移／three r128 vs r160 | 既有記錄 TD 項 | 維持延後 |
| 可延後 | MOBA result 的每人 K/D 明細 | BattleResult.players MOBA 側為空（引擎 snapshot 無個人擊殺欄） | 需引擎補個人統計，屬 Battle 層，延後 |
| 可延後 | Loading 期間預載 R3F 資源 | 目前 loading 純過場，未真的預熱 Canvas | 效能無感前不做 |
| 不建議現在做 | 把 App 內建勝利畫面拆掉 | 它已被流程繞過（battle→result 即離開），拆它要動 App.jsx | 違反本 Sprint 禁區，且無收益 |
| 不建議現在做 | update 階段做成強制動畫結算 | 先驗證流程手感，動畫屬 polish | 待 UX 回饋 |

**完成即停。不開始 Balance／Replay／多人連線／100 Hero／Battle AI。**
