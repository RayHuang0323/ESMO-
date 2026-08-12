# 04 Roadmap

## MOBA Combat AI 封版（2026-08-10）

**狀態：✅ 已封版。** Release Gate 8/8 全綠（首次），combat credibility 45/45。

| 封版識別 | 值 |
|---|---|
| Branch | `release/moba-combat-closure` |
| Commits | `6efac04`（closure）／`22daf6b`（紀錄） |
| **Tag** | **`moba-combat-closure`** |
| Merge to main | ⏳ 待人工執行（安全機制阻擋，未繞過） |

**四項已知未完成（撤退僵硬／comms／synergy／TD-19）均不阻擋封版**，
明細見 `08_目前待辦與風險.md` 的封版紀錄節。
報告：`review/moba-combat/STAT_IMPACT_FINAL_R10.md`（16 項素質最終分類，含 §7 R11 更正）、
`RETREAT_REEVAL.md`（撤退根因與四組實驗）、`RETREAT_CHAIN_FIX.md`（失敗實驗記錄）、
`METHOD_CAVEAT.md`（兩條工程規則）。

### 本輪解決

| 項目 | 結果 |
|---|---|
| 16 項素質影響盤點 | 完成。分類：A 0／B 5／C 6／D 2／E 1／**F 2**（comms、synergy） |
| `towerPushes` 指標誤讀 | 更正。推進強度改用 `p.twrDmg` ＋推掉的塔＋主堡傷害 |
| **TD-21**（`runtime29` §29 順序公平性） | ✅ **解決**——根因是**檢定力不足不是引擎偏差**。`ORDER_SEEDS` 40→160，**門檻未動**。`runtime29` 首次 35/35 |
| 長 verifier 跑法 | 一律走 `tools/verify.mjs`（直跑 runtime29 會 fan-out 63 子行程） |

### 後續（低優先）

1. **撤退僵硬體驗** — `retreatReevalV1` 已實作但**未出貨**（撞破 `quality_p03` 能力放大護欄）。
   下一輪把取消改成**引擎預設行為（雙方等值）**。詳見 `08_目前待辦與風險.md`。
2. **F 類兩項** — `comms` 的 `roamInfoAdj`（全表最大權重之一卻不通電）、
   `synergy` 的分布飽和（40 分與 70 分逐位元相同）。
3. **TD-19** — `experience26` §17 replay 容量，目前 PASS 但貼近上限（670 frames／1974KB）。
4. 另外 8 項素質尚未用真實 KPI 在 standard 條件重測（判定不依賴已失效指標，補測僅為一致性）。

### 下一階段交接

**CS Measurement／16 項素質盤點**（Codex，2026-08-10 更新）。

`CS Measurement Pilot R1` 已完成：`cs23` 28/28、`cs_measure_r1`、build 均 PASS；
`CsGameplayDigest.v1` 已用固定 16 seeds 鎖定。R1 未修改正式 `EsportsFPS3D.jsx`，
也未進入 calibration。完整證據見
`review/cs-gameplay/CS_MEASUREMENT_PILOT_R1.md`。

`CS Combat Instrumentation R2` 也已完成：test-only memory hooks 量到
opportunity→trigger→conversion，off／on 完整 sim 逐 seed 相同，21 個 `rand()`
call sites 不變；正式 FPS source 未修改。報告：
`review/cs-gameplay/CS_INSTRUMENTATION_R2_REPORT.md`。

`CS 16 Stat Wiring R3` 已完成：固定 16 seeds、16 個單一 treatment、每 arm 重跑兩次，
共 544 simulations；13/16 項觀察到 output-only gameplay 差異。`resilience` 是
lastAlive 情境未觀察到，player-side `synergy` 不可達，`learning` 無 gameplay read。
完整矩陣：`review/cs-gameplay/CS_16_STAT_AUDIT_R3.md`。

`CS True Clutch R4` 亦已完成：158 lastAlive player opportunities（140 次 1v2+）已可連到
combat 與 round conversion；legacy 27 次只是真實 32 次勝利的 kill-involved subset。
報告：`review/cs-gameplay/CS_TRUE_CLUTCH_R4_REPORT.md`。

`CS Retreat R5` 已完成：1,492 player-tick opportunities 可連到 895 threshold triggers／
actual displacements、261 round-player episodes、94 recontacts、74 fire re-engages 與 round result。
固定 roster 沒有 0.82–0.87 近門檻 exposure，不能由 trigger count推論效果或直接 calibration。
報告：`review/cs-gameplay/CS_RETREAT_R5_REPORT.md`。

`CS Defuse R6` 已完成：20 planted rounds／140 bomb ticks 可連到 27 proximity、16 progress
ticks 與 4 completes。量到 1 次 stale dead T 阻擋 live CT 的 gate bug；`how:bomb` 也過載
CT 全滅／round timeout／timer zero。報告：`review/cs-gameplay/CS_DEFUSE_R6_REPORT.md`。

`CS Utility Damage R7` 唯讀 audit 已完成：HE/molly 無 damage branch，player smoke 無 LOS
gameplay，flash 有 Pt effect 但與 gun hit 共用 `p.flash` 且無 attribution。`utilDmg:0` 是
gameplay/design placeholder，不是少收既有 damage。報告：
`review/cs-gameplay/CS_UTILITY_DAMAGE_R7_AUDIT.md`。

**下一步（依序）**：

1. 持續遵守 `review/moba-combat/METHOD_CAVEAT.md` 開頭兩條工程規則——尤其
   **「summary counter ≠ gameplay outcome」**。CS 盤點若拿 `exec.*` 計數器當效果指標，
   會重蹈 `towerPushes` 的覆轍（那讓整輪結論作廢）。
2. R3 已沿用 `STAT_IMPACT_FINAL_R10.md` §7 的六種病因完成 16 項矩陣；不得用
   13/16 observed 或 changed-seed count 比較素質強弱。
3. R4 已解除 true clutch/lastAlive baseline coverage；`resilience` 對 t2 只有 1 次 state／
   2 次 combat opportunities，仍不足以 calibration。
4. R5 retreat measurement 已完成；沒有修改 `0.82` threshold、公式或 gameplay branch。
5. R6 defuse baseline measurement 已完成；stale-array 與 `how:bomb` 真 bug 只留證據，
   未修改 gameplay/result/UI。
6. R7 utility read-chain 已完成；禁止為固定 0 新增假 collector 或 UI 數字。
7. 目前安全 measurement Sprint 已收斂。下一步優先建議另案審查 ADR overkill/result semantics；
   它會改 result/rating 與 digest，沒有新授權不得實作。
8. **動手量測前**仍先讀作用點遞增條件（層級／節流／上限），
   確認 KPI 量得到它宣稱要量的東西。本輪最貴的教訓就是這個順序搞反了。
9. learning／synergy 接線、權重、公式、新 branch、角色定位只做證據與建議；
   不直接修改。Calibration 維持 No-Go，直到 measurement coverage 足以辨識病因。

---


## 目前階段

ESMO 目前處於：

**Legacy Recovery + 主幹整合階段**

不是新功能擴張階段。

## 現況（2026-08-04 更新）

⚠ 下方「近期 Roadmap」的 Sprint 19–27 段落停在 2026-07-14，僅供歷史參考。
S28–S29 與 Milestone A–N 之後的實際進度以本節與
`05_Sprint紀錄.md`、`08_目前待辦與風險.md` 為準。

### 對戰（MOBA）

- **Milestone M1.7 RC1**（tag `milestone-m1.7-rc1`，已在 main）——
  英雄決策與撤退。狀態：**程式與自動驗證完成，待瀏覽器實機驗收**。
- 驗證入口是 `node tools/verify.mjs`（flat runner），不是直接跑 runtime29。
- 既有紅燈：runtime29 §29（TD-21）、milestone_j §26/§31（HEAD 即紅）。

### 經營（非對戰）

- **Milestone N1**（分支 `milestone-n-finance`，commit `8c3c8e2`，未 merge）——
  經營時間軸與財務閉環。統一時鐘、週結算、合約倒數、交易帳本。
  驗證 `tools/check_finance_n.mjs` 32/32。
- **Milestone N2**（同分支，未 merge）——經濟平衡。費率集中到
  `economy/economyConfig.js`、薪資由能力推導、贊助拆固定＋績效、
  三種隊伍情境、四週現金預測與資金警告。
  驗證 `tools/check_finance_n2.mjs` 35/35。
  平衡結果：薪資 42 → 12.2 萬/週；一般情境 −24.7 → **+3.5 萬/週**。
  ⚠ 仍待決策：薪資與贊助數值是**第一版平衡基準**，待轉會與合約系統完成後再校正。
- **Milestone N3**（同分支，未 merge）——補完 N2 的兩個缺口。
  ① **開新局入口**：`startNewGame(scenarioId)` ＋ `NewGameScreen`，
     三種情境的起始資金（60／120／300 萬）真的會套用。
  ② **統一賽績**：`economy/formLog.js` 掛在 S25 唯一發獎點，
     MOBA 與 CS 一視同仁地影響贊助績效獎金。
  驗證 `tools/check_finance_n3.mjs` 40/40。
  ⚠ 新發現的平衡決策：新局尚未簽贊助時三種情境都是負現金流
  （−11.7／−7.7／−0.7 萬/週），新手約 5 週見底。是否為預期的開局壓力待定。

- **Milestone O**（同分支，未 merge）——選手招募與隊伍養成基礎閉環。
  `RecruitmentTransaction.v1` 契約（冪等鍵可決定性推導、自帶選手快照）、
  招募純 reducer（名額／餘額／重複三道保護）、招募帳本、圖形化招募狀態列。
  修掉三個實際缺口：沒有 `save()`、沒有重複保護、用亂數與時鐘。
  驗證 `tools/check_recruit_o.mjs` 40/40。
  ⚠ 已知特性：低潛力新秀練到頂週薪仍在下限，養成沒有經濟回饋（Balance 決策）。

### 產品方向（2026-08-04 確認）

**ESMO 未來以線上連線對戰為核心**；新開局與單機財務不再深入擴充。
Milestone O 起的資料契約都以「日後由伺服器接管」為前提設計
（決定性冪等鍵、交易單自帶快照、純 reducer 可重播）。

### 賽季與賽事系統（Q1–Q6 **全部已部署**）

> **2026-08-12 更新。** 下面那一段（「Q1／Q2a／Q2b 已部署；Q3 已完成未部署」起）
> 停在 2026-08-11 的狀態，僅供歷史參考；**現況以本節為準**。

| Milestone | 內容 | 狀態 | verifier |
|---|---|---|---|
| Q1 | `team.id` ＋ `meta.seasonSeed` ＋ `MatchOrigin.v1` | ✅ 已部署 | `q1` 93/93 |
| Q2a | 7 支 AI 隊伍 ＋ Competition/Stage/Fixture 契約 ＋ 賽程產生器 | ✅ 已部署 | `q2a` 112/112 |
| Q2b | `FixtureOutcome` ＋ `teamStrength` ＋ 決定性模擬 ＋ Standings | ✅ 已部署 | `q2b` 92/92 |
| Q3 | 接 `advanceDay` ＋ `competitionGateway` ＋ 出賽 ＋ resume／forfeit | ✅ 已部署 | `q3` 90/90 |
| Q3.5 | 最小賽事 UI ＋ 賽果回寫 | ✅ 已部署 | `q35` 65/65 |
| Q3.6 | 流程安全 hotfix（逾時不換對手、賽事頁返回比賽） | ✅ 已部署 | 併入 q35／o4 |
| **Q4** | `FinalStandings` ＋ `settleCompetitionAward` ＋ 賽季封存 | ✅ **已部署**（main `28e5005`） | `q4` 68/68 |
| **Q5** | **跨賽季換季**（S1 → S2 → S3…） | ✅ **已部署**（main `e34d8a9`） | `q5` 66/66 |
| **Q6** | **季後賽**（Top 4 晉級 ＋ 4 隊單淘汰含季軍戰） | ✅ **已部署**（main `c3a5ba4`） | `q6` 57/57 ＋ 瀏覽器 20/20 ＋ 正式站 14/14 |

**MVP（五個 Milestone）已全部完成並部署。** Q5 是 MVP 之後的第一個延伸，
把「一個賽季」變成「可以一直打下去的賽季序列」。
Q5 部署驗證：Actions run `31566276535`（build ✅／deploy ✅）、正式站 HTTP 200、
線上 bundle `assets/index-CBU6FsAl.js` 與本機 build **逐位元相同**、
正式站實跑 S1 封存 → 開 S2 → 七項驗收全過（細節見 `05_Sprint紀錄.md`）。

Q6 部署驗證：Actions run `31603291866`（build ✅／deploy ✅）、正式站 HTTP 200、
線上 bundle `assets/index-D8fgZrD9.js` 與本機 build **逐位元相同**、
正式站自動 smoke test **14/14**（Top 4 晉級、季後賽 4 場、前四由季後賽決定、
`regularRank` 保留、換季後歷史保留季後賽結果）。

**自 Q6 起瀏覽器驗收全自動**：`tools/browser_check_q6.mjs`（dev）與
`tools/browser_check_q6_prod.mjs`（正式站）各自起一個**獨立 Chrome**
（獨立 user-data-dir／CDP port／headless、關閉背景節流），用 CDP 驅動。
⇒ 不碰日常 Chrome、**不碰正式站存檔**（獨立 profile 下那個 origin 是全新的）、
不需要人工把視窗點到前景。只用 Node 內建 `fetch`／`WebSocket`，未新增相依。

**Q5 的兩個邊界**（與 Ray 確認）：
① 賽事賽季是全案唯一顯示的「賽季」，`meta.season` 降級為經濟層內部週期；
② **只換容器**——不做選手老化、不做贊助換約。

---

#### 🔒 保留項目：正式 Season Boundary / Off-season / 選手世代更替

**後續獨立規劃，明確不在 Q5 擴 scope。**

Q5 只做「賽季容器」的換季。以下整包是**另一個題目**，需要自己的設計文件與 Milestone：

- **Season Boundary**：賽季之間的正式邊界事件（結算儀式、獎項、聲望、升降級）。
- **Off-season（休賽期）**：轉會窗、續約談判、訓練營、選手要求加薪／離隊。
- **選手世代更替**：年齡曲線、巔峰與衰退、退休、新秀梯隊補進。
  ⚠ 主幹**沒有** `agePlayerOneSeason`（只有 `aiTeams.js` 一句「Legacy 有可參考」的註解），
  等於要新建一個養成系統。
- **AI 隊伍隨賽季演進**：七支 AI 目前每季 roster 完全相同，強度不會變。

⚠ **為什麼特別標記**：這四項彼此高度耦合（老化 → 續約 → 轉會 → AI 強度 → 平衡），
任何一項單獨做都會留下半套狀態。要做就整包規劃，**不要在別的 Milestone 裡順手做一半**。

---

**下一個題目（尚未開始，依建議優先序）**：

1. **上面那個保留項目**（Season Boundary／Off-season／世代更替）——
   沒有它，賽季序列在「經營」意義上還是靜態的。
1b. Q6 之後的賽事延伸（依需求再開）：季後賽 BO3、名額／賽制參數化（6／8 隊）、
   `double_elim`、季後賽獨立獎金表。**都不是必要的，缺了也能玩完整賽季。**
2. 既有技術債：舊賽果重送可能寫進別的 fixture（一行修法候選已記錄於 08）。
3. 第二階段（設計文件 §10）：正式「模擬出賽」、模擬器與 LogicEngine 勝率校準、
   Stage Graph 完整（季後賽）、CS 賽事、MMR／牌位、Shop。

### （歷史）賽季與賽事系統（Q1／Q2a／Q2b 已部署；Q3 已完成未部署）

長期架構規格：**`docs/design/賽季與賽事系統架構.md`**（Competition / Ranking / Shop）。
規格於 2026-08-10 定案，Q1／Q2a／Q2b 於 2026-08-11 收尾並 fast-forward 併入
main（`f21d18a`），已部署到正式站。**Q3**（出賽閘道／日曆停止／棄權）同日完成，
`check_competition_q3` 90/90，已 fast-forward 併入 main（**`98a439f`**）並部署。

**Q3.5**（最小賽事 UI ＋ `MatchResult.v1 → FixtureOutcome` 回寫）同日完成，
在分支 `milestone-q35-competition-ui`，`check_competition_q35` 65/65，
**瀏覽器端到端全項通過**（進賽事 → 出賽 → 打完 → 回寫 → Standings → 棄權，0 JS 錯誤），
**未 merge、未部署**。

⚠ 已知缺口：對戰畫面的對手名字仍是寫死的「赤焰軍團」（賽果資料正確，只有顯示名稱錯）。
**Q4 尚未開始**——等 Q3.5 部署與驗收後再開。

已定案的 18 項決策摘要：

- **Competition 採 Stage Graph 抽象**——賽事＝Stage 有向圖，邊是晉級資格。
  MOBA 聯賽與 CS Major 是兩張圖，不是兩套系統。項目差異收在 `formats/*.js`。
- **賽事系統是既有七層比賽契約的「上游排程器」與「下游記分器」**，不是第二條比賽路徑。
  接法是 `MatchOrigin.v1`：assignment 的來源抽象成 ticket / fixture 兩種，
  **不造假 ticket、不建第二條進場流程**。
- **錢的入口從兩個變三個**：新增 `settleCompetitionAward`（賽事名次獎金），
  `cat: "award"` 與單場 `cat: "prize"` 分開，`forecast` 不外推一次性 award。
- **兩條 ladder 分開計分**：`career`（AI 聯賽）／`competitive`（線上），互不換算。
  `RankingKey = (subjectType, subjectId, gameMode, ladderId)`，
  `subjectType` 是日後 PlayerRanking 的擴充點。
- **Shop 設計凍結、第二階段實作**：Product / Shop / Purchase / Entitlement /
  Inventory / Effect 五層分離；雙貨幣 `funds` / `tokens`，`tokens → funds` 永久禁止；
  P2W 防線是有版本的 `CompetitivePolicy`（可驗證、可演進），不是硬編白名單。
- **AI 選手共用 `playerModel.js` 但不進 `profileStore.players[]`**——
  `players[]` 的定義是「會被經營系統寫入的人」。

**MVP 定義**：玩家能完成一個 MOBA 常規賽賽季（玩家 + 7 AI = 8 隊，雙循環 56 場）
→ AI 背景賽快速模擬 → 玩家比賽日走既有 Battle Pipeline 親自出賽
→ Standings → 最終名次 → 名次獎金。

**MVP 切成五個 Milestone**（Q1 / Q2a / Q2b / Q3 / Q4，各附一支 verifier）：

| | 內容 |
|---|---|
| Q1 | `team.id` + `meta.seasonSeed` + `MatchOrigin.v1` |
| Q2a | 7 支 AI 隊伍 + Competition/Stage/Fixture 契約 + `round_robin` + 賽程產生器 |
| Q2b | `FixtureOutcome` + `teamStrength` + 決定性模擬 + Standings 推導 |
| Q3 | 接 `advanceDay` + `competitionGateway` + 玩家出賽 + resume / forfeit |
| Q4 | `FinalStandings` + `settleCompetitionAward` + 賽季封存 |

**Q1 驗收基線已實跑（2026-08-10）**：六支 match verifier **238/238、exit 全 0**
（`match_entry_o3` 35、`matchmaking_o4` 47、`match_room_o5` 45、`match_session_o6` 36、
`authoritative_o7` 48、`result_flow_o71` 27）。都與 TD-19／TD-21 無關。

⚠ **明確不進 MVP**：MMR／牌位、Circuit Points、Qualification 邊、季後賽、
Shop 實作、雙貨幣實作、CS 賽事、`lineups[gameMode]`、`SEATS_BY_MODE`、第三款遊戲抽象。

⚠ **三個要先知道的風險**：
① TD-21（順序公平性 20pp）會被聯賽場數放大，建議在第二階段前解決；
② `advanceDay` 遇玩家賽事日要停止推進，這是全案唯一會修改既有 verifier 斷言的地方（Q3 單獨處理）；
③ MVP 模擬勝率與 LogicEngine 不保證一致，這是刻意取捨，校準列第二階段。

### 建議的下一步（依優先序）

1. **N1–N3 的瀏覽器實機驗收**——三者都還沒在畫面上看過。
2. **開局現金流的平衡決策**——新局未簽贊助時三種情境都是負的（見上）。
   確認是否為預期壓力，或調整 `economyConfig.js`。
3. **商店（equip）與經營儀表板（dash）**——Dashboard 僅剩的兩個誠實佔位。
   有了週期性支出與現金預測，商店的取捨才有意義。
4. **轉會市場／合約談判**（Legacy NegotiationModule）——完成後要回頭重新校正
   N2 的薪資與贊助費率（身價／簽約金／違約金會進同一個經濟迴圈）。
5. **AI 對手隊伍 + 賽程聯賽化**——紅方目前全隊中性能力，
   Prep 的「賽程」分頁因此未恢復。這是讓賽季有結構的前提。
   ⇒ **已於 2026-08-10 完成規劃**，見上節與 `docs/design/賽季與賽事系統架構.md`；
   對應 Milestone Q1 → Q2a → Q2b → Q3 → Q4。
6. 技術債清理：`src/platform/DashboardScreen.jsx` 死碼、`team.lv/xp` 刻度、
   `meta.reputation` 靜態值、重播持久化（IndexedDB）、bundle 瘦身（2.4 MB）。

## 近期 Roadmap（歷史，停在 2026-07-14）

### Sprint 19：MOBA 主流程修復 + Draft Presentation 串接

目標：

Dashboard  
→ 5 人賽前配置  
→ 配對  
→ Ban/Pick  
→ 戰術  
→ Loading  
→ Battle  
→ Result

重點：

- 修正首頁 MOBA 入口錯接單一選手詳細頁。
- 5 人配置頁恢復。
- Ban/Pick 選誰，Loading 顯示誰。
- Loading 顯示誰，Battle Hero Strip 顯示誰。
- 戰術選擇顯示到 Loading / Battle HUD。
- HeroCodexDetail 與 HeroDetailPanel 分工。
- 英雄圖片 Audit。

### Sprint 20：Hero Images + PostMatch Result Recovery（已完成）

目標：
- 抽取 Legacy HERO_IMG。
- 接到 Codex / HeroDetail / BanPick / Loading / BattleHeroStrip。
- Result / PostMatch 改讀 BattleResult。
- 隔離 genMatch 假資料。

結果：
- HERO_IMG 100 張全數抽出（heroImages.js 資源表 + heroDatabase.heroImage() 唯一入口）。
- 上述 5 個 UI 加上 BattleEndScreen（MVP 卡 / 成長欄）皆已接圖，缺圖有 fallback。
- genMatch / PostMatchDashboard 主幹本來就沒有；BattleEndScreen 早已只讀 BattleResult。
- 補上真正缺口：draftRoster Adapter → BattleResult.players[].heroId = Ban/Pick 選角，
  Draft / Loading / Battle / Result 英雄一致。引擎與 Balance 未動。

### Sprint 21：Management Modules Recovery（已完成）

目標恢復：Recruit / Finance / Inbox / Sponsor / Training / Player Detail / Team / Roster。

原則：先 Component 化 Legacy UI → 再接 Adapter → 不重畫 UI。

結果：

- 八個模組全數 Component 化，接進 `src/screens/manage/`，Dashboard 不再開假 Modal。
- 補上主幹缺的「選手領域模型」（本 Sprint 的真正缺口）：
  `data/playerModel.js`（16 項能力 × 個性 × 士氣 × 位置適配 × 訓練課程 × 贊助商，
  Legacy 逐字）+ `data/players.js`（身分仍讀 ROSTER）+ `data/recruitPool.js`（決定性新秀池）。
- `profileStore` 擴充（非第二套 Store）：players / activeSponsor / scouted /
  finance 四張表 / 收件匣正規化 + 11 個經營行為，全部向下相容 localStorage。
- 引擎、Balance、BattleResult、HeroProgress、SeasonStore、roster、heroDatabase
  git diff 零改變；20 seed 回歸不變。

仍不一致（見 05_Sprint紀錄 Legacy Diff Checklist）：
轉會市場/我的報價（Negotiation 領域）、逐項潛力（需 Contract 擴充）、
CS 分部名單（Sprint22）、賽後獎金回寫財務。

### Sprint 22：CS / FPS Recovery Audit + Minimal Integration（已完成）

目標：確認 `EsportsFPS3D.jsx` 是否仍被主幹使用，並完成可安全完成的最小接線。

結果：

- Audit：孤立 Legacy Presentation（只被 Legacy EsportsGame.jsx import，主幹不可達）；
  BattleResult / SeasonStore / Player Stats / 16 項能力全部未接。
- 接線：Dashboard CS 磚 → CsMatchScreen；名單接 profileStore 真實選手
  （fpsRoster Adapter，Legacy STAT_L2S 逐字）；引擎 Presentation 原封。
- 刻意未接：CS 結果入史（無 CS BattleResult 契約，不偽造 → Sprint 23 提案）。
- 詳見 05_Sprint紀錄 Sprint 22 節。

### Sprint 23：CS Full Match Loop Recovery（已完成）

目標：CS 從「可進入的訓練賽」推進成完整流程
Dashboard → Prep → 選圖 → 戰術 → Loading → 3D FPS → CS Result → 回寫 → Dashboard。

結果：

- CS 賽前流程六段畫面接進 AppShell（Prep / MapSelect / Tactic / Loading / Match / Result）。
- 新契約 `platform/contracts/CsMatchResult.js`（CsMatchResult.v1）：CS 專屬結果格式，
  與 MOBA BattleResult.v2 平行、互不相通；缺值（duration）誠實為 null。
- 回寫：`profileStore.recordCsMatch`（冪等唯一入史口）→ csHistory / finance.funds /
  transactions / meta.fans / 收件匣；公式重用 matchRecorder.updateEconomy（Legacy 逐字）。
- XP 只記錄不回寫 team.lv/xp（刻度不符）；SeasonStore 不接（MOBA 專用，避免污染戰績）。
- 引擎 EsportsFPS3D 零修改（只傳既有 tactic/tacticType props）；MOBA 全域零改變。

### Sprint 24：MOBA 戰術系統（已完成）

目標：把 Sprint19 以來一直是 Presentation 級的 MOBA 戰術，真正接進 LogicEngine。

結果：

- 新增正式契約 `MobaTacticConfig.v1`（八卡 m1–m8，Legacy 文案逐字 + 數值欄位）。
- `LogicEngine.configureMatch()` 嚴格附加；不呼叫 ⇒ 與 S23 逐位元相同
  （獨立 rng2 不污染主 rng）。20 seeds 逐 tick 指紋實測一致 → **Balance 凍結**。
- 戰術只改行為權重，不加傷害/勝率/金錢係數、不寫死勝負
  （m3/m8 跨 16 seeds 勝負皆有出現）。
- 引擎真實計數 → `BattleResult.tacticExecution` → 賽後「戰術執行」面板。
- TacticScreen 修好固定寬度跑版根因、資料改讀契約、適性改用真實 16 項能力。
- `tools/check_moba_tactic24.mjs` 27/27；映射表見 `docs/design/MOBA戰術系統.md`。

未映射（引擎無對應系統，誠實保留不假裝）：heraldPriority / carryPriority /
jungleResourceShare / vision.*。對手戰術無來源 → 固定中性 standard。

### Sprint 25：Unified Match Rewards & Player Progress（已完成）

目標：統一 MOBA / CS 的賽後獎勵、選手 XP、等級與天賦點回寫。

結果：

- 新增回寫交易層 `MatchProgressTransaction.v1` + 單一 Progress Service
  `applyMatchProgress`（唯一發獎點）+ Receipt。
- **不合併** BattleResult.v2 / CsMatchResult.v1，**不合併** MOBA history / csHistory。
- 冪等（transactionId + 帳本）→ StrictMode / 重整 / 返回再進 Result 都不重複發獎。
- 結算移到比賽完成邊界 → 跳過 Result Screen 也不會漏發獎。
- 選手 XP / 等級 / 天賦點閉環成立；persistence migration 安全升級舊存檔。
- 驗證 34/34 + 既有腳本全綠（全部檢查 exit code）。

資料流與公式：`docs/design/賽後結算與選手成長系統.md`

### Sprint 26：MOBA Match Experience Recovery（已完成）

修復四個線上實際發現的問題（既有流程修復，非新功能）：

1. Progress 單一真實來源——所有畫面選手 Lv/XP 讀 profileStore；
   英雄熟練等級分軸標示（根因：LineupScreen 把英雄等級標成「Lv」+ 靜態 ROSTER 名字）。
2. 手機戰術頁——共用 Frame 寬度防護 + sticky footer（確認鈕永遠可點）+
   Lineup/Codex 拔除固定 380px + grid min() 護欄。
3. Player/Hero 語意分離——PlayerAvatar 靜態英雄徽章移除；
   英雄只在 MOBA 情境顯示。
4. MOBA Replay MVP——MobaReplay.v1 + session 擷取緩衝 + 2D 播放器
   （播放/暫停/±10s/事件/0.5–4×/slider）；播已存 frames，零引擎、零 Store。

驗證 35/35；同 seed 擷取前後 BattleResult 位元一致。
設計文件：docs/design/MOBA重播系統.md

### Sprint 27 候選（依優先序建議）

1. **天賦系統（TalentModule）**：天賦點目前**只進不出**——S25 已把點數發到選手身上，
   但花費介面還是 Legacy 佔位。這是最直接的缺口。
2. **CS 賽制與聯賽化**：BO3、對手多樣化（目前只有引擎內建 Compulsary）、
   CS 賽程／AI_TEAMS 領域（Prep 的「賽程」分頁因此未恢復）。
2. **XP / 等級刻度統一**：team.lv/xp（萬 XP 展示刻度）與 Legacy xpGain（50/20）對齊後，
   讓 CS/MOBA 賽後 XP 真正回寫等級（含升級給天賦點）。
3. **MOBA 賽後回寫對齊 CS**：MOBA Result 目前只入 seasonStore，
   獎金/粉絲仍未回寫 finance（matchRecorder 已有公式，缺接線）。
4. Battle Data Extension Proposal 其餘項目（mana / 召喚師技能 / 技能 CD / buff / item /
   chat / caster event）——需 Ray 核准後才能改 Contract。
5. 轉會市場 / 合約談判（NegotiationModule）、天賦 / 商店 / 經營儀表板。
6. bundle 瘦身：動態 import 切分 CS 路徑 + 英雄圖改 public/ 靜態檔（已 1.9MB）。
