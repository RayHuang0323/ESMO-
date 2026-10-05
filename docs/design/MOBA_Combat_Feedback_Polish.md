# MOBA Combat Feedback Polish

> 日期：2026-10-05～06　基準：`origin/main` = `a9bdfda`　分支：`feature/moba-combat-feedback-polish`
> 性質：**純呈現層**。`LogicEngine.js`、規則、items runtime、Replay 契約一行未改 ⇒ **不升 sim version**（`check_simulation_version_gate` 61/61，與 main 相同）。
> 驗證：`tools/check_moba_combat_feedback.mjs`（真引擎兩整場，39/39）＋ `tools/browser_check_moba_combat_feedback.mjs`（桌機 1366＋手機 390，18/18）。

## 0. 摘要

| 項目 | 做了什麼 | 資料來源（引擎既有輸出） |
|---|---|---|
| 1 Floating Combat Text | 傷害／補血／護盾數字；英雄、野怪、龍／巴龍、塔；重要傷害放大轉橘；同目標 0.6 秒合併、碎片門檻 | 相鄰兩格 snapshot 的差：英雄 `hp × mhp`＋`statusEffects.shield.amount`；中立 `objectives[].hp × maxHp`、`members[]`；塔 `towers[].hp ×` 引擎同一組常數 |
| 2 Recall VFX | 引導中：地面符文環＋12 格進度刻度＋光柱（末段收束）；完成：起點光環＋光柱；取消：紅色碎環 | `players[].rc`（剩餘秒）＋`recallEvents`（start／cancel／done，done 帶 from）；進度 = 1 − rc／`rules.recallChannelT` |
| 3 Gold Gain | `+N`（金幣圖示）浮在英雄頭上，1.2 秒合併，零頭留到下一筆 | **正式帳本** `items.players[id].gold.earnedMilliBySource`（§8）非被動來源累計的差；顯示總額 ＝ ⌊帳本⌋（逐英雄精確） |
| 4 Hero Overhead UI | 名牌改「隊伍色等級徽章＋英雄短名」（英雄資料庫 `zh`，≤4 字）；預設開、手機也開；血條＋名牌依鏡頭維持畫面像素 | `mlv`、`heroById(championId).zh`、`hp`、`statusEffects.shield.amount`（既有 Shield 段） |

## 1. 數字為什麼可信

- 不讀任何傷害公式：數字 = **state 的差**。gate F7 逐筆對照引擎**內部**絕對血量（含護盾），兩場 32,637 筆原始事件全部吻合（誤差只來自 `mhp` 取整，≤2%）。
- 護盾自然到期（`shieldUntil` 到了）不算傷害；被打破才算（F15）。
- 最後一擊：上一格活著、這一格死了 ⇒ 剩餘血＋護盾。塔被打爆時內部 hp 會是負數（溢傷），顯示的是**實際剩下的血**。
- +Gold：每位英雄顯示總和 ＝ ⌊帳本非被動收入⌋，**逐英雄精確相等**（G1；舊算法為 1.037／1.048，見 §8）。UI 沒有寫死任何獎勵數字、不自行計算被動收入（G4）。
- 迷霧：看不見的敵方英雄、看不見位置的野怪／塔不跳字、不畫回城。

## 2. 資料缺口（照實不做，不猜）

1. **小兵數字**：snapshot 只有 hp 比例、沒有絕對最大血量 ⇒ 不顯示。要做得在引擎 `_snapLane` 輸出 `maxHp`（改引擎 ⇒ 需另評估 sim version 判斷，雖然只是輸出欄位）。
2. **金錢來源標籤**：帳本有來源累計（§8），但沒有逐筆事件 ⇒ 只顯示 `+N`，不標「擊殺／小兵／塔」。裝備系統關閉（沒有帳本）⇒ 不顯示 +Gold。
3. **Replay**：frame 沒有 `mhp`／護盾量／`rc`／`recallEvents` ⇒ 四項都只在現場對戰（`source` 非 null 時元件 return null）。
4. **基地守衛塔**最大血量來自 `rulesFor().nexusGuardHp`（現場規則集），與引擎建塔同一個值；若未來現場改用別的規則集要一起看。

## 3. 尺寸（瀏覽器實測後修正兩次）

- 第一版用世界尺寸：總覽鏡頭（zoom≈3.4）下血條 ≈ 20×2.4 px、名牌 ≈ 4 px、數字 ≈ 6 px，讀不出（截圖實測）。
- 修正：`render/overheadScale.js` 依鏡頭換算「每世界單位像素」：
  血條至少 48 px 寬（手機 40，最多 3.2×）；名牌另有下限 15 px 高（手機 14，最多 5×）；
  數字 17 px（重要 25 px），手機 ×0.9。鏡頭拉近時回到世界尺寸，不會大到遮角色。

## 4. 規格變更（兩支既有 gate 跟著改）

- `check_battle_condition_ux` N1：原守「一般對戰預設**不**顯示名牌」⇒ 改守新規格（Owner 2026-10-05 指定：預設開、內容是等級＋英雄短名）。
- `check_moba_milestone_d`：名牌貼圖呼叫從 `hero.displayName` 改為 `shortHeroName(hero)`。
- 其他守門意圖不變。

## 5. Gate（基線 = main `a9bdfda`，同一台機器並行跑）

25 支相關 gate 逐支與基線相同；既有紅燈（`hero_presentation_l` 43a、`hero_skills_phase1`、`milestone_b1／b_fix／c／c_fix／d_fix3／g`、`minions_h3`、`nav_chrome_h2close`、`runtime_map_h1`、`camera_replay29b6` 逾時）在 main 上就紅，非本輪造成。regress 15/15、regress2 8/8 數值逐項相同。

## 6. 已知可優化（非阻擋）

- 同一英雄同時拿到傷害與金錢時，兩個字會靠得近（可再錯開金錢的高度）。
- 桌機回城光柱在塔座／植被旁偏淡（手機清楚）；可再提高亮度或加地面粒子。
- 名牌 15 px 在 1366 總覽距離屬「看得出但偏小」，要再大只改 `NAMEPLATE_PX`。

## 7. 與 Codex 的交集

Codex 的 `feature/cs-fps-major-upgrade` 正在改 `docs/handoff/00／05／06／08`、`AGENTS.md`、`tools/verify.mjs` ⇒ 本輪**沒有**追加 `05_Sprint紀錄.md`，紀錄暫存本文件；CS／FPS 檔案完全未碰（gate X4）。

## 8. +Gold 對齊正式帳本（2026-10-06，Owner 核准的單一唯讀例外）

**Audit**：沒有 canonical reward／transaction／gold event。正式帳本 `ledger.earnedMilli[source]` 只在 `itemsEngineRuntime` 內部；snapshot 只有累計總收入。

**4–5% 誤差來源（場次 A 實測）**：跳字那一格順帶算進的被動收入 **+1,266（3.79%，幾乎全部）**；門檻以下丟掉的非被動 −9；四捨五入 +11。根因＝累計收入裡被動與獎勵混在一起，UI 分不開。

**修法**：`itemsEngineRuntime.snapshot()` 的 `gold` 物件加 **唯讀** `earnedMilliBySource: { ...s.ledger.earnedMilli }`（既有 ledger 原值，整數 milli-gold）。
- 不改任何收入／購買／屬性／被動效果／balance；UI 只排除帳本自己的來源名 `passive`／`tithe`，不重算、不扣被動。
- 顯示以 milli 累加、取整後零頭留到下一筆 ⇒ 每位英雄顯示總和 ＝ ⌊帳本非被動⌋（A：33,411／33,414.368；B：28,569／28,572.063）。
- 不影響模擬：simulation version gate 61/61 不變；同 seed snapshot 串流（去掉此欄位）逐字相同；Replay 擷取與 BattleResult 有／無此欄位逐字相同（gate L4–L6，含「同輸入跑兩次」自檢，排除的只有牆鐘時刻與隨機 id）。

**凍結守門（items M3 G6）**：由「相對 HEAD 無改動」（commit 後即失效）改為 **釘在基準 `a9bdfda` 逐字比對 12 個 M1／M2 裝備規則檔**（`tools/lib/itemsFreeze.mjs`）。唯一例外以逐字區塊＋位置定義；改字、搬位置、重複出現都不算例外。
- 突變 8 種（收入／被動計算／購買／屬性／效果、例外改成計算值、搬到別處、重複）全部讓 freeze 紅（gate L2）；實檔突變 `itemEconomy` 小兵收入 20→21 ⇒ items M3 G6 紅（已還原）。

⚠ **順帶發現（技術債，本輪不處理）**：上述實檔突變時 simulation version gate 仍綠——items 經濟檔不在 `SIMULATION_SEMANTICS_FILES`，改收入不會被要求升 sim version。
