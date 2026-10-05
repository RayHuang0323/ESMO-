# MOBA Combat Feedback Polish

> 日期：2026-10-05～06　基準：`origin/main` = `a9bdfda`　分支：`feature/moba-combat-feedback-polish`
> 性質：**純呈現層**。`LogicEngine.js`、規則、items runtime、Replay 契約一行未改 ⇒ **不升 sim version**（`check_simulation_version_gate` 61/61，與 main 相同）。
> 驗證：`tools/check_moba_combat_feedback.mjs`（真引擎兩整場，39/39）＋ `tools/browser_check_moba_combat_feedback.mjs`（桌機 1366＋手機 390，18/18）。

## 0. 摘要

| 項目 | 做了什麼 | 資料來源（引擎既有輸出） |
|---|---|---|
| 1 Floating Combat Text | 傷害／補血／護盾數字；英雄、野怪、龍／巴龍、塔；重要傷害放大轉橘；同目標 0.6 秒合併、碎片門檻 | 相鄰兩格 snapshot 的差：英雄 `hp × mhp`＋`statusEffects.shield.amount`；中立 `objectives[].hp × maxHp`、`members[]`；塔 `towers[].hp ×` 引擎同一組常數 |
| 2 Recall VFX | 引導中：地面符文環＋12 格進度刻度＋光柱（末段收束）；完成：起點光環＋光柱；取消：紅色碎環 | `players[].rc`（剩餘秒）＋`recallEvents`（start／cancel／done，done 帶 from）；進度 = 1 − rc／`rules.recallChannelT` |
| 3 Gold Gain | `+N`（金幣圖示）浮在英雄頭上，1.2 秒合併 | `players[].gold`（累計收入）的差；扣掉 `INCOME_V1.passivePerSec × dt` 後殘差 ≥ 4 才跳 |
| 4 Hero Overhead UI | 名牌改「隊伍色等級徽章＋英雄短名」（英雄資料庫 `zh`，≤4 字）；預設開、手機也開；血條＋名牌依鏡頭維持畫面像素 | `mlv`、`heroById(championId).zh`、`hp`、`statusEffects.shield.amount`（既有 Shield 段） |

## 1. 數字為什麼可信

- 不讀任何傷害公式：數字 = **state 的差**。gate F7 逐筆對照引擎**內部**絕對血量（含護盾），兩場 32,637 筆原始事件全部吻合（誤差只來自 `mhp` 取整，≤2%）。
- 護盾自然到期（`shieldUntil` 到了）不算傷害；被打破才算（F15）。
- 最後一擊：上一格活著、這一格死了 ⇒ 剩餘血＋護盾。塔被打爆時內部 hp 會是負數（溢傷），顯示的是**實際剩下的血**。
- +Gold 總和 ÷ 帳本非被動收入 = 1.037／1.048（G1）；UI 沒有寫死任何獎勵數字（G4）。
- 迷霧：看不見的敵方英雄、看不見位置的野怪／塔不跳字、不畫回城。

## 2. 資料缺口（照實不做，不猜）

1. **小兵數字**：snapshot 只有 hp 比例、沒有絕對最大血量 ⇒ 不顯示。要做得在引擎 `_snapLane` 輸出 `maxHp`（改引擎 ⇒ 需另評估 sim version 判斷，雖然只是輸出欄位）。
2. **金錢來源**：只有累計收入、沒有逐筆來源 ⇒ 只顯示 `+N`，不標「擊殺／小兵／塔」。帳本其實有 `earnedMilli[source]`，但只在引擎內部。
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
