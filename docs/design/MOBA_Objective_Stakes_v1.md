# MOBA Objective Stakes v1 ＋ TD-CS1（moba-sim.v16 Release Candidate）

> 2026-09-30，分支 `feature/moba-objective-stakes-v16`（worktree `.sprints/moba-objective-v16`，基準 main `356630b`／moba-sim.v15）。
> 狀態：**Release Candidate，未 push、未 deploy、未 merge**，等 Owner Review。

## 1. 目標

讓後期「搶大型物件」成為真正有價值的戰略決策；同時修正 TD-CS1（技能宣告的減速沒有套用）。
兩者都改變模擬結果 ⇒ 一起升為 **moba-sim.v16**（只在 hero skills 開啟時生效；skill-off／Challenge 串流與 v15 逐位元相同）。

## 2. TD-CS1

- **根因**：`LogicEngine._heroSkillStep` 的命中處理 `hit()` 把減速寫死成 `rule.mechanic === 'projectile'`；
  `split-projectile`（liuxing:Q、miwu:E）的規則也宣告 `slowFactor`／`slowDuration`，卻從未走到。
- **修正**：條件納入 `split-projectile`（規則旗標 `splitProjectileSlowV16`，v16 起開啟）。主目標與濺射目標同一條規則，都會被減速。
  技能描述、規則數值都沒改。
- **驗證**：受控支援矩陣 **273/273（100%）**（v15 為 271/273）；liuxing:Q 產生 `hero-slow` 1.2 秒、miwu:E 1.0 秒，與規則相同；
  現場 snapshot、Replay 同一份 CombatState（`hero-slow`）。
- **影響**：screening 200 場只 3% 對局勝方改變，時長不變。

## 3. Objective Stakes v1 最終規則

| 項目 | 規則 | 權威來源 |
|---|---|---|
| 龍層 | 每層英雄戰力 +1.8%（v15 為 1.2%），最多 4 層，本場永久、死亡保留 | `fsm3[side].dragonStacks` → `_dragonPowerK` |
| 龍魂（4 層） | 戰力再 ×1.03、該隊兵線永久 fightK ×1.15 | 同上＋`_waveModifiers` |
| 巴龍 | 70 秒：英雄戰力 ×1.15（原候選 1.10）＋既有兵線攻城 ×2.2／兵線戰鬥 ×1.7／英雄攻城 ×1.22 | `fsm3[side].baronBuffUntil` |
| 逆轉賞金 | 擊殺方領完基本獎勵（龍 200／巴龍 400）後團隊金錢仍落後 ≥1500 ⇒ 追加「落後額 × 20%」，上限 500 | 擊殺結算 |
| AI 龍魂攻防 | 敵方已達或差一層龍魂、我方未龍魂 ⇒ 出擊機率 +0.2；自己差一層 ⇒ +0.1（同一次擲骰、rng 次數不變） | `_objectiveUrgency` |
| 自然成長 | 時間成長（`_phaseScale`／`lateFactor`）與物件增益仍是兩套規則，沒有合併 | — |

故意落後不是最優策略：賞金只補落後額的 20%、上限 500，拿到賞金的隊伍 n=1000 勝率約 31%。

## 4. 設計過程（screening，各 200 場，同 runner／seed／名單／Items ON）

| 組 | 藍方勝率 | 說明 |
|---|---|---|
| A v15 基準 | 48% | — |
| B 只 TD-CS1 | 49% | 翻轉 3% |
| C 原候選物件 | **57.5%** | 結構問題 |
| F1 只開 AI（後期 +0.15、人數、血量、守家…） | **56.5%** | 主因 |
| F2 只開巴龍 | 51% | — |
| F3 只開逆轉賞金 | 49% | 中性 |
| F1b AI＋坑邊控制權 | 55.5% | 無效 |
| G1 數值、AI 維持 v15 | 51.5% | 公平 |
| G2 數值＋只做龍魂攻防 | 51.5% | **採用** |
| G3 數值＋人數優勢 AI | 59.5% | 放大偏差 |

**結論**：巨龍在藍方下路雙人附近（v15 就是巨龍 632:233、巴龍 146:310），任何「讓 AI 普遍更積極搶物件」的規則
都會把交戰推向對藍方有利的區域 ⇒ 鏡像陣容藍方勝率 +7〜11pp。這屬於既有地圖／分路不對稱（與 Blue side bias 同一類），
**本輪不處理**；因此 AI 只保留中性的「龍魂攻防」，其他情境項目（後期加成、人數、血量、坑邊控制權、經濟領先打巴龍、守家）
已實測後移除，列為與藍方偏差一起處理的設計債。

## 5. 正式 n=1000 A/B

同一 runner（`tools/balance/moba_items_balance_runner.mjs`，`ESMO_BALANCE_SKILLS=on`、`ESMO_BALANCE_TALENTS=on`）、
seed 1–1000、鏡像名單、Items ON（standard）、dt 0.5、上限 3600 秒。v15 從乾淨的 `356630b` 原始碼樹載入（`ESMO_BALANCE_ROOT`）。
摘要工具 `tools/balance/summarize_objective_ab.mjs`；原始資料 `review/moba-objective-v16/ab/`。

| 指標 | v15 | **v16 候選（巴龍 1.10）** | 試驗：巴龍 1.15（已還原） |
|---|---|---|---|
| 結束／未結束 | 1000／0 | 1000／0 | 1000／0 |
| 藍／紅 | 53.1／46.9 | **55.5／44.5** | 57.9／42.1 |
| 擊殺比（藍÷紅） | 1.088 | 1.084 | 1.067 |
| 時長 中位／P90／最大（分） | 17.07／24.0／30.97 | 17.05／23.8／**52.32** | 16.97／23.57／34.28 |
| > 45 分長局 | 0 | **1**（seed 133，雙方 11 塔全倒的對峙，52 分正常結束） | 0 |
| 逐 seed 勝方翻轉 | — | 454（45.4%） | 450 |
| 每場塔數／主堡被拆中位秒 | 12.87／7 | 12.82／7 | 12.76／7 |
| 每場巨龍／巴龍 | 4.31／2.30 | 4.32／2.27 | 4.30／2.28 |
| 龍魂發生率／龍魂方勝率 | 39.7%／58.4% | 38.7%／**69.3%** | 37.2%／71.2% |
| 龍層領先方勝率 | 56.6% | 61.9% | 60.7% |
| 第一條巴龍方勝率 | 56.2% | 54.2% | 55.4% |
| 14 分後物件→勝利轉換 | 58.6% | **62.1%** | 61.7% |
| 逆轉賞金局／拿到賞金方勝率／每次金額 | — | 35.6%／30.9%／431 | 34.3%／30.0%／430 |

判讀：
- **物件價值**：後期物件轉換 +3.5pp、龍魂方勝率 +10.9pp、龍層領先方 +5.3pp ⇒ 搶物件確實更影響勝負；
  逆轉賞金讓落後方有回來的機會，但拿到賞金的一方只贏 31%（不會變成落後必翻盤）。
- **公平性**：鏡像陣容藍方 +2.4pp（差的標準誤約 2.2pp ⇒ 約 1.1σ，統計上不顯著，但方向與 screening 一致）。
- **唯一一輪保守調整**：巴龍 1.10 → 1.15（假設加強多由紅方拿的巴龍可平衡）⇒ 藍方反而 +4.8pp。
  依規則不再往下調，取公平性較好的 1.10 為候選並還原。
- **長尾**：候選有 1/1000 場 52 分的長局（雙方 11 塔全倒、基地互推）；v15 最長 31 分。屬於「正常結束的對峙」，非 60 分上限未結束。
- 最終程式碼與 n=1000 候選的逐場結果（seed 1–40）完全相同（生命期追蹤器位置調整不影響模擬）。

## 6. UI／Presentation（只讀正式狀態）

- `src/battle/ui/ObjectivePanel.jsx`：桌機／手機同一個精簡面板——兩隊龍層圓點、龍魂徽章、巴龍徽章（剩餘秒數環）、
  龍／巴龍刷新倒數、擊殺提示（含「逆轉賞金 +N」、龍魂取得）。資料：`snapshot.teamBuffs`、`snapshot.objectives`、`snapshot.objectiveLog`。
- 強化小兵：`MobaRuntimeMinions` 在持有巴龍（金環）／龍魂（紫環）的隊伍小兵腳下畫光環（讀 `frame.teamBuffs`）。
- 英雄身上的巴龍／龍層光暈沿用既有 `buffs`。

## 7. CombatState／Replay

- 追蹤器（`_combatStateStep`，v16 起移到 tick 最末端）新增團隊狀態：`team-dragon`（value＝層數，本場永久 ⇒ until＝`CS_PERMANENT` 99999）、
  `team-soul`、`team-baron`（until＝`baronBuffUntil`）。
- `snapshot.objectiveLog`：最近 10 筆大型物件擊殺事件（seq、時間、隊伍、賞金、層數、是否龍魂）。
- Replay（optional additive，MobaReplay.v1 不升版）：`replay.combatStates.sides`（每列隊伍；順帶修正重播領域沒有隊伍色）、
  `replay.objectiveEvents`。重播 seek(t) 由區間表還原 `teamBuffs` 與事件。
- BattleResult 契約未變。

## 8. 仍關閉／未開始

- `nexusSiegeCapV1`（主堡 cap 6／8／10 比較）：**仍關閉**。
- `heroPassivesV1`（Passive P）：**仍關閉，100 英雄擴充未開始**。
- Tactical Identity：**未開始**。
- Blue side bias、flicker：未處理。
