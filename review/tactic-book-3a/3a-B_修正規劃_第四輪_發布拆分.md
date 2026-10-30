# Phase 3a-B 第四輪：mid_jungle_sync 有界篩選與分階段發布可行性

- 日期：2026-10-30（開發期篩選與可行性審查；未改 `src/`、未凍結、未啟動 17–20 小時 P2 重驗）
- 分支：`feature/moba-phase3a`（本機；未 push／deploy／整合 main，旗標未啟用，未碰 CS）
- 依據：Owner 2026-10-30 第二次裁定（接受 D5／D8 研究成果；五項決策＋優先評估分階段發布）
- 語意凍結仍是 `176ccac0`，v21 候選指紋 `0578fa882d74b205`；兩項 STOP（G-A8、Challenge 側偏）維持
- 前一份：`3a-B_修正規劃_第三輪.md`

## 0. Owner 裁定與本輪對應

| # | 裁定 | 本輪處理 | 章節 |
|---|---|---|---|
| 1 | m3 M3_C、m8 M8_C、m7 M7_M 接受為 v21 修正候選，尚未正式放行；m7 須保留前期入侵定位並調整中文文案 | 核對 M7_M 是否保留入侵；起草 v21 文案（提案，凍結時實作並過文案 gate） | §1 |
| 2 | three_lane_pressure 不接受失去三路壓制特色的改法；m1 暫不修，保留確認風險 | 記錄；兩者維持原設定進確認 | §1.3 |
| 3 | mid_jungle_sync 一次有界限的候選篩選；新 seeds、事前登記、獨立審查；沒有合理候選就停止 | 登記（審查 2 Major／5 minor 全部採納，含窮舉的停止規則）、實跑 2,400 場：原版未重現（52.3%）⇒ **STOP_NO_REASONABLE_CANDIDATE，最後一輪** | §2 |
| 4 | Challenge veteran 保留 Boss 定位；練習難度新手友善、逐步增加挑戰；側偏 STOP 不解除 | 記錄為 C1 校準的設計原則；分階段發布下 C1 移到第二階段 | §4.4 |
| 5 | 不修改共用引擎，不加紅藍數值補償 | 照做；拆分方案不碰引擎 | §3 |
| — | 優先評估：戰術書／AI 教練 v21 與 Challenge v21 分階段發布，Challenge 暫留 v20 | 程式碼審查（旗標、規則集、存檔、重播、AI 對手、驗收範圍），提出最小安全方案 | §3–§5 |

本輪 commit：`ad98ff2f`（mid_jungle_sync 登記與 seed 規劃）、`eb115578`（結果）、本文件與交接紀錄。

## 1. 已接受的 v21 修正候選

| 模板 | 候選 | 改動 | 篩選結果 | 狀態 |
|---|---|---|---|---|
| classic.m3 | M3_C | aggression 0.6、riskTolerance 0.5 | 第一輪選出；新 seeds 描述性複驗 55.8 | v21 候選（未放行） |
| classic.m8 | M8_C | aggression 0.5、riskTolerance 0.5 | 第二輪 SELECTED 47.3 | v21 候選（未放行） |
| classic.m7 | M7_M | 旋鈕 0.5／0.5＋節奏 standard＋三路 standard | 第三輪 SELECTED 47.8 | v21 候選（未放行） |

### 1.1 m7 M7_M 保留了前期入侵定位

依 `src/platform/contracts/MobaTacticConfig.js:148-160`（m7 原設定）與 `:233-262`（`toEngineTactic`）逐項核對：

| 項目 | 原版 m7 | M7_M | 入侵定位 |
|---|---|---|---|
| `lanePlan.jungle` | invade | invade（未改） | 保留 |
| `objectives.invadePriority` | 0.8 | 0.8（未改） | 保留 |
| 引擎 `invadeChance` | max(0.7, 0.8)＝0.8 | 0.8 | **保留** |
| `macro.earlyGame` | aggressive | aggressive（未改） | 保留（前期 `phaseEngage` +0.08） |
| `engageBias`（全時期接戰偏移，`:281`） | +0.084 | 0 | 減弱 |
| `commitShift`（團戰投入門檻） | −0.07 | 0 | 減弱 |
| `retreatAt`（撤退門檻） | 0.208 | 0.25 | 撤退回到標準 |
| `vision.enemyJungle` | 0.7 | 0.7（未改） | 保留 |
| 引擎 `invadeWithMid`（中路跟進入侵） | true（tempo fast 且 invadePriority ≥ 0.3） | **false**（tempo 改 standard） | 減弱：中路不再跟進 |
| `gankInterval` | 32 秒 | 45 秒 | 抓人節奏回到標準 |
| 三路站位 | aggressive ×3 | standard ×3 | 「全線壓制」不成立 |
| 旋鈕 | 0.85／0.85 | 0.5／0.5 | 風險「高」不成立 |

⇒ **M7_M 本身就保留了「前期入侵」**：打野開局入侵機率 0.8、前期姿態 aggressive 都不變。但前期接戰的總偏移約從 +0.164（engageBias 0.084＋phaseEngage 0.08）降到 +0.08，**約減半**；入侵相關連帶減弱的是「中路跟進入侵」，原因是節奏從 fast 改成 standard。證據目標「野區入侵 1」「入侵擊殺 1」的觸發條件不變；「推塔波次 6」可能因三路回到 standard 而較難達成（laneOffset 約 0.067→0.003），凍結後的證據重播會實測。

### 1.2 m7 v21 文案提案（Owner 定稿；只在 v21 規則集顯示，v20 文案不動）

| 欄位 | 原版（v20，保留） | v21 提案 | 理由 |
|---|---|---|---|
| 名稱 | 前期壓制 | 前期壓制（不變） | 前期接戰姿態與入侵都保留 |
| 定位（archetype） | 前期入侵 | 前期入侵（不變） | Owner 第 1 點 |
| 風險 | 高 | **中** | 旋鈕回到 0.5／0.5 |
| 重點（focus） | 上路 | **打野** | 上路不再前壓；主軸是打野入侵（「打野」是既有值，m4／m6 已用） |
| 描述（desc） | 前期強勢全線壓制不給發育 | **打野開局入侵對方野區；前期比平常更願意接戰** | 「全線壓制」不成立；只寫直接效果（入侵機率、前期姿態相對 std），不寫「帶頭」「帶起節奏」這類推論 |
| 細節（detail） | 利用前期強英雄全線壓制，速戰速決 | **開局入侵對方野區，前期比平常更願意接戰** | 「速戰速決」減弱（節奏 standard） |
| 缺點（cons） | 入侵翻車直接送節奏；拖入後期全面劣勢 | **入侵翻車直接送節奏**；後半句待 Owner 決定 | 「拖入後期全面劣勢」在 M7_M 下沒有量測證據支持，也沒有反證；提案先刪，Owner 可保留 |

- 實作要求（凍結時）：文案以 v21 覆寫表呈現（與 `TEMPLATE_BALANCE["v21.b1"]` 同一份版本鍵），v20 規則集照舊顯示原文案；指標條由數值自動計算。
- ⚠ 文案 gate `templateCopyViolations` 目前只套用在 `v2.*` 模板（`tools/check_tactic_plan_3a.mjs:481`），效果表也沒有經典模板的列 ⇒ F4 要先把 gate 擴充到經典模板，經典模板的 v21 文案才有機械檢查。
- m3 M3_C、m8 M8_C 的文案影響已在第一、二輪登記寫明（m3：缺點「撤退門檻極低」在 risk 0.5 下不成立、風險「高→中」；m8：風險「低→中」），凍結前一併由 Owner 定稿。
- `TEAM_STYLE_TACTIC`（更正）：AI 教練不可用時，風格模板的退路走 `mobaTacticForTeamStyle`，拿的是 legacy 設定（`liveMatchSetup.js:180, 212`；`MobaTacticConfig.js:194-203`），**不經過模板解析，F3 改不到它**；受影響的風格是 aggressive→m7、defensive→m8、skirmish→m3。要不要讓這條退路也套 v21 修正，需在凍結時明確決定並加斷言（**待 Owner**）。

### 1.3 three_lane_pressure、m1（Owner 第 2 點）

- three_lane_pressure：不接受 TLP_C0／C／D（失去三路壓制）。維持原設定進確認性 G-A8；第四輪三個區塊合計 59.2%，單一確認區塊判 STOP 約 27–36%（第三輪 §3.3）。
- m1：暫不修，保留確認風險（約 12–22%）。

## 2. mid_jungle_sync 有界篩選（Owner 第 3 點）

- 登記：`tools/fixtures/ga8_fix_screen5_registration_3aB.json`（`ad98ff2f`）；工具 `measure_ga8_fix_screen_3aB.mjs` 未改；seeds 58201–58600（新區塊 `G-A8.fixScreen5`）。
- 候選只放**保留「中野聯動」定位**的臂：中路前壓、打野 gank 偏中、輔助遊走、carry 中路、中期龍坑優先全部不動（比照 Owner 第 2 點）。審查實測：每一臂都需要 v21 文案修改（「中期隊伍更敢主動接戰」等要加「稍微」或刪除）。
- 結果：`tools/fixtures/ga8_fix_screen5_result_3aB.json`（`eb115578`），6 臂 × 400＝2,400 場，**錯誤 0、遺失 0**，59 分鐘。對照 STD 53.3%（0.50±0.05 內）。

| 臂 | 改動 | 勝率（95%） | 對 BASE（配對 95%） | 確認風險 ≥57 |
|---|---|---|---|---|
| **BASE** | 原版 | **52.3**（47.3..57.2） | — | — |
| MJS_A | aggression 0.6→0.5 | 52.0（47.1..56.9） | −0.3（−6.8..+6.3） | 2.3% |
| MJS_B | 中期 aggressive→standard | 56.3（51.4..61.1） | +4.0（−2.2..+10.2） | 38.1% |
| MJS_C | A＋B | 54.0（49.1..58.9） | +1.8（−4.9..+8.4） | 11.4% |
| MJS_D | C＋grouping 0.5＋supportRoamRate 0.3 | 52.3（47.3..57.2） | 0.0（−6.6..+6.6） | 2.9% |

- **原版沒有重現**：新 seeds 上 52.3%，低於 0.57 ⇒ 工具判定 **NOT_REPRODUCED**（`selected` 為 null；MJS_A 只是描述性的 screenedCandidate）。四個候選都沒有和原版分開：vsBase 上界 +6.3／+10.2／+8.4／+6.6 皆 > 0 ⇒ 沒有 SHOWS_IMPROVEMENT、沒有 FIRST_DISTINGUISHED；Bonferroni 標籤（|z| ≥ 2.50）也沒有，最大 |z|＝1.26。就算原版有重現，MJS_A 也只會判 IN_BAND_NOT_DISTINGUISHED_FROM_BASE，結論同樣是停止。
- **依事前登記的停止規則：STOP_NO_REASONABLE_CANDIDATE。這是 mid_jungle_sync 的最後一輪**，模板維持原設定、保留確認風險，不再追加研究。
- 判讀（描述性）：
  - G-A8 的 60.25 是讓它從 21 個模板中被挑出來的那個區塊。兩個區塊合計 56.25%（450／800；含觸發區塊，偏高），單看新區塊 52.3%。兩區塊差 8 pp（差值 se 約 3.5 pp，z 約 2.3），**與 winner's curse 相容**，但這是推論，不是觀察到的事實。
  - 旋鈕研究在 G-A8 seeds 上的 K +8.5（aggression 0.6→0.5）同樣**沒有重現**（MJS_A −0.3）。但機制和 m7 不同：m7 是旋鈕臂在新區塊移動了；這裡是**原版回落**（60.25→52.25），MJS_A 幾乎沒動（51.75→52.0）。
  - 確認時判 STOP 的機率（精確二項，n＝400，STOP＝至少 240 勝）：點估計（真值 52.3%）約 0.1%；兩區塊合計情境（56.25%）約 7%；以新區塊 95% 上界 57.2% 計約 13%。都低於第三輪假設的 50%。
- ⚠ 檢定力：MDE 約 9–10 pp（登記時以第四輪 sd 估 9.3–9.9；本輪 sd 換算約 8.9–9.5），這一輪的停止可能是偽陰性。

## 3. 分階段發布的可行性審查（唯讀程式碼審查）

目標：第一階段發布 MOBA 戰術書＋AI 教練 v21（career.v21），Challenge 暫留 v20；第二階段再發布 Challenge v21。

### 3.1 旗標與規則集：目前**無法**只靠開關拆開

- 正式旗標只有一個 `mobaTacticalDirectorV21`（`src/featureFlags.js:101`，預設 false）。
- `resolveRulesetForMode`（`src/platform/contracts/matchRuleset.js:89-106`）：
  - Live：旗標開 ⇒ `career.v21`，關 ⇒ `career.v20`。
  - **Challenge：同一個旗標＋`heroSkillsV1` 都開 ⇒ `challenge.v21`**（`:91`）。
- ⇒ 打開旗標會**同時**讓 Live 與 Challenge 進 v21。要讓 Challenge 停在 v20，必須改程式。
- `matchRuleset.js` 與 `liveMatchSetup.js` 都在 `SIMULATION_SEMANTICS_FILES` 內 ⇒ 拆分改動會換指紋，只能放進那**一次**語意凍結（本輪不改）。`featureFlags.js` 不在清單內。
- Challenge 路徑另有幾個以 `MOBA_SIMULATION_VERSION`（v21）為預設的參數：`challengeInstance.js:168`、`squadSnapshot.js:176`、`canReplay`（`simulationVersion.js:648`）。目前每個呼叫端都有明確傳入 Challenge 版本（`snapshotAuthority.js:146, 255`、`fixtureOpponents.js:180`、`challengeRunner.js:71, 83`），所以 F1 成立；但拆分 gate 要加斷言，防止日後新呼叫端漏傳而把 v21 帶進 Challenge。

### 3.2 Challenge 停在 v20 時：存檔、重播、對手都安全

| 面向 | 現況（程式碼依據） | Challenge 留 v20 時 |
|---|---|---|
| 新挑戰記下的版本 | `CHALLENGE_SIMULATION_VERSION`＝依旗標解析的 challenge 規則集的 simVersion（`src/platform/challenge/challengeVersion.js:14`） | 記 `moba-sim.v20`，與正式站相同 |
| 既有挑戰重播 | 每場依記下的版本選規則集（`matchRuleset.js:110-111`）；版本不符由 `canReplay` 拒絕（`challengeInstance.js:221`） | 正式站既有的 v20 挑戰**全部照常可重播**。⚠ 反之，若照現況直接開旗標，新挑戰改記 v21，舊挑戰在新版本下重播會被拒絕（`challengeVersion.js:6` 已記載） |
| 防守快照 | 快照只存 `tacticId`（`snapshotAuthority.js:247`），Challenge 以 legacy 設定開打（`challengeMatchSetup.js:100`；`challenge.v20` 只收 legacy／std，`matchRuleset.js:77`） | 用的是出貨版 m1–m8 設定；**凍結時 v21 模板修正（`TEMPLATE_BALANCE`）不得寫進快照或 challenge.v20 路徑** |
| 練習對手（C1 階梯） | v20 數值：mirror 48.3／topheavy 19.3／balanced 20.8／rotation 11.5／veteran 2.3（C1 M0） | 維持正式站現況；veteran 2.3 與 Owner 第 4 點「Boss 定位」一致；新手友善的 v21 校準移到第二階段 |
| Challenge 側偏 | STOP（v21） | 不在第一階段範圍；**STOP 不解除**，仍是第二階段的阻擋 |

### 3.3 Live（戰術書／AI 教練）

| 面向 | 現況 | 第一階段的含意 |
|---|---|---|
| 規則集落盤 | 進行中的比賽把當局規則集寫進 `activeMatch.config.ruleset`，恢復時沿用；`usablePersistedRuleset` **不看旗標**，旗標關閉後仍接受已落盤的 `career.v21`（`liveMatchSetup.js:102-107, 132-137`） | 以旗標回退時，進行中的比賽照 v21＋AI 教練打完。⚠ F2 若依目前旗標決定「不送綁定」，恢復時會拿掉落盤的藍方綁定、賽果改變 ⇒ F2 必須依**本場的規則集**判斷，不看旗標 |
| 戰術書存檔 | `tacticBook` 是雲端存檔切片（`saveBundle.js:69`）；計畫是零數值的 TacticPlan.v2，讀不懂的項目原樣留在 `unreadable`（`tacticBook.js` 檔頭） | 不需新切片、不換鍵 |
| 規則集不支援的選擇 | `bindingForRuleset` 只從**這一場**的綁定拿掉，存檔裡的計畫不動（`liveMatchSetup.js:45-63`）；畫面以 `offeredChoicesOnly` 隱藏（`TacticScreen.jsx:164`） | 旗標關閉時 v21 每時期選擇自動退出、不毀存檔 |
| Live 重播 | 只存在本次 session 記憶體的畫面擷取，不重新模擬、不持久化（`replayBuffer.js` 檔頭） | 與版本無關 |
| AI 對手 | `career.v21` 的紅方＝AI 教練（`aiCoachV1`），排不出來退回風格模板（`liveMatchSetup.js:140-145`）；`career.v20`＝風格模板 | E2 驗收範圍 |
| **程式回退（重新部署舊 bundle）** | 正式站的 `load()` 是明列欄位、沒有 `tacticBook`（`origin/main` `profileStore.js:701` 起）；舊版 `useLocalServer` 不讀 `activeMatch.config.ruleset` | **下一次存檔就會刪掉玩家的戰術書**，進行中的 v21 比賽會改用 v20 繼續 ⇒ 第一階段**只允許以旗標回退**；若要保留程式回退，必須先補保留戰術書的步驟並納入回退演練 |

### 3.4 ⚠ 新發現：旗標關閉 ≠ 正式站 v20

- 正式站（`origin/main`，v20 發布 `1d0e219`）**沒有**戰術書與模板：`tacticTemplates.js`、`tacticBook/` 都是本分支新增（`git show origin/main:` 查無此檔）。
- 本分支的戰術畫面**不看旗標**：模板列 `TemplateStrip` 無條件顯示全部 21 套模板（含 v2，`TacticScreen.jsx:66, 262`），Live 一律優先送戰術書綁定（`liveMatchSetup.js:209-212`，`career.v20` 接受 binding）。
- 旗標全關時玩家還看得到的其他新東西：三步驟導覽與 `OpponentIntelPanel`（`TacticScreen.jsx:210, 244-250`）、`ChoicePanel` 的 static 選擇（在 career.v20 上以綁定改變引擎行為）、`IndicatorPanel`、`ConfirmPanel`、`saveTacticPlan`／`deleteTacticPlan`、GameView 的拿掉／沿用提示，以及雲端存檔信封多出的 `tacticBook`。
- 基準：正式站目前是 `origin/main` `b4f8e0c3`，比本分支的分岔點 `1d0e219` 多 7 個 commit（含 CS Major v1.0 `a8438c9a`，也動到 `playerModel.js`、`matchSquad.js`、`PlayerDetail`／`Roster` 畫面）。比對基準要用**目前的 origin/main**，合併整合另列驗證步驟（CS 是 Codex 的工作線，本線只驗證）。
- ⇒ **只要合併進 main，即使旗標全關，玩家就會看到戰術書（含 three_lane_pressure、mid_jungle_sync 等 v2 模板），在 v20 規則下開打**。而 G-A8 的 v20 對照（`f7abd883`）顯示同一批 STOP 模板在 v20 規則下逐位元相同。
- 這有兩個後果：
  1. 「合併但不開旗標」本身就是一次發布，不是無害的整合。
  2. 發布後若要回退（關旗標），玩家回到的是「戰術書＋v20 規則」，**不是**正式站 v20，而這個狀態從未驗收過，也已知有 STOP。
- 所以最小安全方案必須讓旗標成為真正的**總開關**（見 §4.1 F2）。

## 4. 最小安全方案（提案；實作放在唯一一次語意凍結，Owner 核准後才做）

### 4.1 程式改動（全部在凍結內，v20 規則集物件一個欄位都不改）

| # | 改動 | 檔案 | 語意 | 守門 |
|---|---|---|---|---|
| F1 | 新增正式旗標 `mobaChallengeV21`（預設 false）。**只在 `resolveRulesetForMode` 的 challenge 分支**多要求它：`mobaTacticalDirectorV21 && heroSkillsV1 && mobaChallengeV21` 三者都開才解析成 `challenge.v21`。`challenge.v21` 規則集物件**保持逐位元相同**（setup 雜湊涵蓋整份規則集，`matchSetup.js:377-378`；改 releaseRequirements 會讓 `check_challenge_golden_v21.mjs:47, 75` 與 `check_match_ruleset_3a.mjs:72, 83` 的字面值紅）。RS-1 只要求列出層與 Director 的旗標（`matchRuleset.js:128-143`），不要求這一項 | `featureFlags.js`（非語意檔）、`matchRuleset.js`（語意檔，換指紋，隨凍結） | 旗標全關、或只開 v21 旗標 ⇒ challenge 與現況相同的 `challenge.v20` | `check_match_ruleset_3a` 擴充：旗標全關時輸出逐字不變（R16／R17）；第一階段旗標組合下 challenge 解析為 `challenge.v20`、`CHALLENGE_SIMULATION_VERSION`＝`moba-sim.v20`；Challenge 路徑上以 v21 為預設的參數全部有明確傳入（新斷言） |
| F2 | 總開關：`mobaTacticalDirectorV21` 關閉時，戰術畫面與 Live 開局回到正式站的行為。要藏起來的逐項清單：模板列（含 v2）、三步驟導覽、`OpponentIntelPanel`、`ChoicePanel`、`IndicatorPanel`、`ConfirmPanel`、存／刪戰術書計畫、GameView 的拿掉／沿用提示；不送綁定，走 v20 的戰術物件路徑。**判斷依本場的規則集（新開局＝依旗標解析；恢復＝依落盤的規則集），不直接看旗標**；`tacticBook` 切片照常讀寫、不刪 | `TacticScreen.jsx`、`GameView.jsx`、`liveMatchSetup.js`（語意檔） | 旗標關 ⇒ 與正式站**行為／黃金等價**（不是 metadata 相同：`matchAssemblerDepsCore.js:83` 在旗標關閉的 build 也把 manifest 標成 v21） | v20 黃金 39 案＋瀏覽器比對旗標關閉的戰術畫面與目前的 `origin/main`；回退演練：恢復進行中的 v21 比賽**逐位元相同**、戰術書計畫保留 |
| F3 | `TEMPLATE_BALANCE["v21.b1"]`（m3、m7、m8；mid_jungle_sync 沒有候選，§2）只在 `career.v21`／`balanceTool.v21` 解析時套用 | 模板解析處 | 語意檔 | 快照與 `challenge.v20` 路徑讀到的仍是出貨設定（新斷言）；風格模板退路（§1.2）是否套用要明確決定並加斷言 |
| F4 | v21 文案覆寫表（m3、m7、m8 等），只在 v21 規則集顯示 | 文案資料＋戰術書畫面 | UI | 文案 gate 先擴充到經典模板（目前只套 `v2.*`）＋v20 文案不變 |

- 不加旗標以外的分支、不改共用引擎、不加紅藍補償（Owner 第 5 點）。
- ⚠ 與第一輪設計的差異：第一輪的 `challenge.v21` 也帶 `templateBalance`（`3a-B_修正規劃.md:28`）。照 F3 只套在 career／tool v21，第二階段的 Challenge v21 會用**未修正**的 m3／m7／m8；第二階段要不要套，屬第二階段的決定（見 §4.3 第 6 步的版本限制）。
- 替代方案：把 Challenge 寫死在 v20（移除 v21 解析）。同樣要改 `matchRuleset.js`；第二階段要再改程式。但因為第二階段很可能本來就需要再凍結一次（§4.3 第 6 步），兩者在這一點上的差別不大；F1 的好處是開關不必改程式、可以回退。

### 4.2 第一階段的獨立正式驗收規格（草案；需另行事前登記與獨立審查）

這是**新的**驗收規格，不是原 P2 驗收拿掉幾項；它的通過也不代表原 G-A8 或 Challenge 側偏通過。

| 類別 | 項目 | 第一階段 | 說明 |
|---|---|---|---|
| G-A8 | 確認性重跑（43001–43400，21 模板，原門檻） | **必要** | 戰術書提供全部模板 ⇒ 原 G-A8 照用，不排除任何模板 |
| 行為 | E1、E2（career.v21＋AI 教練） | 必要 | |
| 側偏 | career 側偏確認（51001–55999） | 必要 | |
| 證據 | 證據重播、真實性表整輪重測、v21a 黃金重錄（Owner 同意）、career 黃金、v20 黃金 39 案不變 | 必要 | |
| 拆分專屬（新） | ① 第一階段旗標組合下 Challenge 全部走 v20：挑戰黃金 v20、player challenge slice 1–8（slice3 §③ 是已登記的 flaky 統計 gate，**不得放寬門檻**）、瀏覽器挑戰 gate 全綠；② 正式站既有 v20 挑戰可重播；③ F2 總開關：旗標關閉＝目前 origin/main 的行為（黃金＋瀏覽器）；④ 回退演練（只以旗標回退）：第一階段建立的存檔（含 v21 戰術書計畫、進行中比賽）在旗標關閉時載入不損毀、進行中比賽恢復後**逐位元相同**、戰術書計畫保留；⑤ 快照不帶 v21 模板修正；⑥ Challenge 路徑沒有漏傳版本 | 必要 | 新 gate，凍結時一起寫 |
| Phase 3a gate | `check_match_golden_v21a`、`check_match_setup_3a`（含 v20 黃金 39 案）、`check_tactical_director_3c`、`check_tactical_directive_3c`、`check_match_ruleset_3a`、`check_tactic_truth_3a`、`check_tactic_replication_3a`、`verify --only=tactic24,runtime29`、42 支 Node gate、verify 全套 | 必要 | |
| 存檔 | `check_save_bundle_b1b`、`check_save_hardening_b1c`、`check_cloud_save_b1d`、瀏覽器 `browser_check_cloud_save_ui`、`browser_check_exit_flush` | 必要 | `tacticBook` 是新的雲端切片，並新增會自己存檔的公開動作 |
| UI | 戰術書 v21 在真實 build 開旗標的瀏覽器實測（桌機＋390px） | 必要 | 目前從未在真實旗標下實測 |
| 合併整合 | 與目前 origin/main（含 CS Major v1.0）合併後的 build、gate 與瀏覽器 smoke | 必要 | CS 只驗證不修 |
| 部署後 | `browser_check_prod_b1b`／`b1c`／`b1d`、`browser_check_prod_season_vnext`、`browser_check_prod_slice7`／`slice8` | 必要（部署後） | |
| Challenge | Challenge 側偏確認（45001–49999）、C1 S1／CF 校準、`challenge.v21` 黃金 | **第二階段** | 第一階段不跑；Challenge 側偏 STOP 維持 |

- 預估成本：原 31,100 場扣掉 Challenge 側偏約 4,098 場與 C1 CF 約 2,000 場 ⇒ 約 25,000 場（以每場 1.3–1.6 秒計約 9.0–11.1 小時）；加上第二輪 §9.3 的其他開銷（真實性表、gate、verify、黃金、瀏覽器，約 4.5–5.5 小時），已是 13.5–16.6 小時，再加拆分專屬 gate 與合併整合 ⇒ **約 15–18 小時**（原估 17–20 小時）。

### 4.3 最短發布路線

1. **Owner 決定**：確認 §2 的停止結果；m3／m7／m8 的 v21 文案定稿；風格模板退路是否套 v21 修正（§1.2）；核准 F1–F4 與 §4.2 的驗收規格方向；預先決定「確認性 G-A8 若仍 STOP 時第一階段怎麼辦」（§5 B1）。
2. 登記第一階段驗收規格（事前登記＋獨立審查）。
3. **一次語意凍結**：`TEMPLATE_BALANCE["v21.b1"]`＋F1–F4＋v21 文案；實作審查；重新登記指紋。
4. **一次性重驗**（第一階段範圍，約 15–18 小時）。
5. 全部通過 ⇒ Owner 決定發布：合併 main、部署、開 `mobaTacticalDirectorV21`、`mobaChallengeV21` 維持關閉。回退只能關旗標，不能重新部署舊 bundle（§3.3）。
6. 第二階段（之後）：C1 校準（依 Owner 第 4 點原則）、Challenge 側偏的處理；過了第二階段的驗收規格才開 `mobaChallengeV21`。
   - ⚠ **版本限制**：career.v21 一旦以 `moba-sim.v21` 發布，`challenge.v21` 就必須沿用同一份語意。`challengeRunner.js`、`challengeMatchSetup.js`、`draftPolicy.js`、`matchRuleset.js` 都是語意檔：為了 Challenge 側偏改其中任何一支都要升 **v22**，而且 Live 也要整輪重驗。C1 校準只有放在非語意檔（例如 `fixtureOpponents.js`）時才不必升版。⇒ 第二階段很可能需要第二次語意凍結。

### 4.4 Challenge 練習難度原則（Owner 第 4 點，記錄給第二階段）

- veteran 保留 Boss 定位（目前 v20／v21 都是 2.3%）。
- 其餘練習對手以新手友善、逐步增加挑戰為原則；第二輪 §3 的目標區間與順序在第二階段依此原則重新登記，才跑 C1 S1。
- Challenge 側偏 STOP 不因校準解除。

## 5. 剩餘阻擋

| # | 阻擋 | 影響 | 解法／需要的決定 |
|---|---|---|---|
| B1 | **確認性 G-A8 仍可能是 STOP**：three_lane_pressure（不改，27–36%）、m1（不修，12–22%）、mid_jungle_sync（未修，點估計約 0.1%，上方情境 7–13%，§2）；至少一個 STOP 約**四成到接近六成**（36–57%；常態近似、假設獨立，僅供量級參考；m3／m7／m8 修正後的殘餘風險與其他 WARN 模板未計入）| 第一階段在原規則下若 STOP 就無法發布 | Owner 事前決定 STOP 時的處理；**不得**以排除未通過模板當成原 G-A8 PASS。若要以「不提供某些模板」發布，必須是另行登記、明示「非 G-A8 PASS」的獨立驗收規格，由 Owner 核准 |
| B2 | 旗標關閉 ≠ 正式站（§3.4） | 合併本身就是發布；回退狀態未驗收 | F2 總開關＋拆分專屬 gate ③④ |
| B3 | Live／Challenge 共用同一個旗標（§3.1） | 無法只發布戰術書 | F1 |
| B4 | 程式回退會刪掉玩家的戰術書（§3.3） | 回退只能靠旗標 | 發布手冊寫明；或補保留步驟並演練 |
| B5 | 戰術書 v21 從未在真實 build 開旗標下做瀏覽器實測 | UI 風險未知 | 第一階段驗收的 UI 項 |
| B6 | 與目前 origin/main（多 7 個 commit，含 CS Major v1.0）尚未合併驗證 | 合併衝突與回歸未知 | 第一階段驗收的合併整合項（CS 只驗證） |
| B7 | Challenge 側偏 STOP | 只擋第二階段 | 維持 STOP；位置成分的處理另案（第三輪 §2.4）。⚠ 第二階段若要改 Challenge 語意檔就要升 v22、Live 也要重驗（§4.3 第 6 步） |

## 6. 獨立審查

- mid_jungle_sync 登記（量測前）：APPROVE WITH CHANGES（2 Major／5 minor），全部採納，見登記 `review` 欄位（`ad98ff2f`）。
- 本文件 §0、§1、§3–§5（2026-10-30，獨立 Reviewer，唯讀，逐行核對程式碼）：**APPROVE WITH CHANGES，5 Major／7 minor，全部採納**。引用行號全部正確；「同一個旗標」與 F1 可把 Challenge 留在 v20 都成立；成本算式一致。
  - M1 F1 改 `challenge.v21` 物件會打紅 v21 挑戰黃金與規則集字面值 ⇒ 改為只在解析分支加旗標、物件逐位元不變。
  - M2 回退：旗標回退時落盤的 career.v21 仍被沿用，F2 必須依本場規則集判斷、恢復要逐位元相同；程式回退會刪戰術書 ⇒ 只允許旗標回退。
  - M3 第二階段的版本限制（改 Challenge 語意檔要升 v22、Live 重驗）⇒ §4.3 第 6 步與 B7。
  - M4 F2 要藏的項目逐項列出；基準改為目前的 origin/main（含 CS Major v1.0）；合併整合另列。
  - M5 驗收規格補上存檔、Phase 3a、部署後 gate 與 slice3 flaky 註記。
  - §2 與 B1 是在上述審查之後才補上，另經獨立核對（唯讀、精確二項重算）：APPROVE WITH CHANGES，數字全部吻合、停止規則判對；採納 5 項措辭修正（明列無 SHOWS_IMPROVEMENT／FIRST_DISTINGUISHED、winner's curse 改為「相容」、K 未重現的機制與 m7 不同、STOP 機率補上 CI 上界約 13%、刪掉「不修的代價變小」）。
  - minor：m7 表格補 engageBias／commitShift／retreatAt（前期接戰約減半）；m7 文案只寫直接效果；文案 gate 要擴充到經典模板；`TEAM_STYLE_TACTIC` 退路走 legacy、F3 改不到（含 skirmish→m3）；F3 與第一輪 `challenge.v21` 帶 templateBalance 的差異；Challenge 路徑以 v21 為預設的參數要加斷言、F2 定義為行為等價；`featureFlags.js` 非語意檔；成本改 15–18 小時。
