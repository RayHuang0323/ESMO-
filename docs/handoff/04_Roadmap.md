# 04 Roadmap

## 🚀 CS Season Product MVP 正式上線（2026-08-22）

**狀態：✅ 已部署、已在正式站 smoke 通過、正式 CLOSED。**

| 項目 | 值 |
|---|---|
| production SHA | **`6e07439`**（main，fast-forward 自 `integration/cs-cross-ai` `f91509c`） |
| Actions run | `32576935125` — build ✅／deploy ✅ |
| 正式站 | <https://rayhuang0323.github.io/ESMO-/>（HTTP 200） |
| 部署日 | 2026-08-22 |

| Milestone | 內容 | verifier |
|---|---|---|
| M0 | schema v11 `competitionByMode.{moba,cs}`（`competition` 降為唯讀 alias） | `cs_season_contract` 71/71 |
| M1–M2 | CS 聯賽 lifecycle（賽程／standings／封存） | `cs_season_lifecycle` 53/53 |
| M3-1 | CS 年度 Major：Top 4 晉級 ＋ 4 隊單淘汰 | `cs_major` 74/74 |
| M3-2 | **BO3 series 語義**（先拿 2 張地圖；1 Fixture = 1 FixtureOutcome） | `cs_series` 46/46 |
| M3-3 | CS 年度冠軍 honors ＋ CS 名次獎金政策（`cs_major` prize table） | `cs_major_honors_award` 45/45 |
| M4-A | **可實際遊玩的 BO3**（每張地圖走既有 CS MatchSession；series 掛 fixture-scoped ledger） | `cs_playable_series` 99/99 ＋ 瀏覽器 7/7 |
| M4-B | CS Season Recap ＋ rollover ＋ real-save lifecycle | `cs_season_recap_lifecycle` 64/64 |
| M4-C | CS 賽事中心（Competition Hub，唯讀；手機版可讀） | `cs_competition_hub` 31/31 |

**Release gate：** `check_competition_release_gate` **11/11**、`check_cs_match_completion` **36/36**、
`check_home_team_contract` **40/40**、`check_roster_unlisted_lineup` **25/25**、build exit 0。

**跨模型邊界：** CS 單場 round／half／overtime／scoreboard／`simulateFps`（MR12）屬 Codex ownership，
本產品線完全未修改；Season 層只認 series outcome（地圖勝場數），不解讀單張地圖的 round score。

### 下一階段（尚未開始）

- CS／MOBA 雙賽制的賽季曆整合（同一年度內兩條賽事線的排程與衝突規則）。
- CS Major 之外的次級賽事（Minor／資格賽）——目前 roadmap 上尚未排期。

### C3 正式收尾後的下一個候選階段（尚未開始）

- C3 Mirage vertical slice 已正式 `C3_CLOSED / OWNER_ACCEPTED`；release head `cfd7d68` 的 Pages workflow `33006989567` success，production smoke PASS。

- **C4 — Mirage 全圖環境擴展與多地圖環境品質**：把目前已驗收的 A Site／Mid／Connector environment kit，以逐區 vertical slice 方式延伸到 Mirage 其餘區域，再評估其他地圖；補齊地標、建築立面、材質層次與路線可讀性。
- C4 必須沿用 Player identity、Camera recovery、StableCanvasRegion、RAF_FIDX_COHERENCE、C2C character／animation 與現有 gameplay authority；每個區域都要先跑 renderer／camera／RAF／geometry／C2C gates、Battle smoke、build 與長跑，再進 Owner acceptance。
- **本輪只記錄 roadmap 候選，不實作 C4。**

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

---

## ESMO UI Migration 狀態（2026-08-22）

### 已正式上線

- 首頁／Mobile Home
- 戰隊名單（Roster）
- 選手完整資料（Player Profile）
- UI release main SHA：`fb0c70fe480d633657c7b77154197c4f190b0d38`
- 正式站：<https://rayhuang0323.github.io/ESMO-/>

### Codex UI Migration 暫停

Codex UI Migration 目前暫停開新 Sprint。Claude Code 另一工作線正在處理：

- Command Deck
- Competition Hub
- CS Season 賽事入口／IA 重整

待上述工作正式進入 `main` 並穩定後，再重新 audit 最新 `main`，確認 UI ownership
與下一個 UI Migration Sprint。

本階段不修改 `AppShell`、`GameRouter`、`Store`、`contracts`、CS、Season、Competition，
也不碰 Claude Code 正在處理的 Command Deck／Competition Hub 工作線。

---

## Fan System v1（2026-08-23 產品核准，尚未開工）

**規格：`docs/design/粉絲系統架構.md`（裁決 1–14 已 freeze）。基準 `origin/main @ 9109fe4`。**

定位是**「接通既有設計」**，不是新增第二套系統。repo 裡已經有粉絲數
（`profileStore.js → DEFAULT.meta.fans`，種子 128,000）、公式（`matchRecorder.js → fanGain`）、
門檻（`playerModel.js → SPONSORS[].reqFans`）、共用發放點
（`rewardFormulas.js → teamRewardsFor()` → `applyMatchProgress`）與冪等帳本——
**缺的只有把門檻校準到正確的數量級、來源權重、一條賽季來源**。

目前 `reqFans` 是 0/500/800/1500/2000/3000 而種子是 128,000 ⇒ **粉絲門檻從開局第一秒就全部達標**，
這條玩法是死的。修法不是把 fans 改小（會逼出大規模存檔 migration），而是把 `reqFans` 改大到同一尺度。

### Milestone

| | 內容 | 產出 |
|---|---|---|
| **F0** | `meta.fans` sanitize ＋ `reputation` **deprecated**（非物理刪除） | 前置，不含玩法 |
| **F1** | **Sponsor eligibility** ＋ **fan source weighting** | ✅ **已實作**。`reqFans` 0/100k/150k/170k/185k/200k；權重 練習 1.0 ／ 聯賽 5.0 ／ Major 8.5。`check_fan_system` 21/21、browser smoke 17/17 |
| **F2** | **Season / Major / Champion fan awards** | ✅ **已實作**（branch `feature/fan-f2-season-awards`）。聯賽奪冠 12,000／Major 奪冠 20,000；`check_fan_system` 48/48。⚠ **兩個待決策**：頂階變快（2.4 季）、CS 聯賽拿不到賽季粉絲（見 08） |
| **F2.1** | **Competition Fan Award Policy** | ✅ **已上線**（`main @ e155b27`，2026-08-23 部署成功）。新增 `fanPolicy` 與 `prizePolicy` 平行 ⇒ CS 聯賽、MOBA 巡迴站／年度總決賽都拿得到賽季粉絲且不發現金；policy-less Event 仍 fail-closed。**TD-28 CLOSED**。`check_fan_system` 66/66 |
| **F3** | ⏸ **DEFERRED — Sponsor pricing**（粉絲級距 × `weekly`） | 不在 v1 範圍。**延後理由**：F4 的「還差 N」已把階梯變成持續可見的進度條，粉絲不再只是一次性閘門；且可達性④⑤已貼邊（頂階良好 3.0 對下限 3、一般 7.8 對上限 8），加價碼倍率會直接改變現金流。**等玩家實玩驗證 F1–F4 的存在感之後再決定。** |
| **F4** | 既有 UI 整合 ＋ 移除假 `audience` ＋ 移除 perk 文案 | ✅ **CLOSED**（`main @ 4b01bd4`，已部署）。Home 本季成長／Sponsor 差多少／賽季總結支持者成長／賽季粉絲獎勵；假 audience 與 perk 文案已清除。`check_fan_ui_f4` **35/35**、browser **29/29**。**零 balance 改動**。未建 Fan Center |
| **F5** | `check_fan_system.mjs` | **基礎 contract verifier（含第 8 條）從 F1 同步開始** |

**執行順序：`F0 → F1 → F5 基礎 → F2 → F4 → playtest → 再決定 F3`**

`playtest` 是真的關卡：F3 要不要做，取決於玩家在 F1–F4 之後有沒有真的感覺到粉絲的存在。

### Fan Contract Addendum（2026-08-23 凍結）

長期 Sponsor 關係分三層，**只有 A 層在 Fan v1 落地**：

| 層 | 決定什麼 | 時間性 | 狀態 |
|---|---|---|---|
| **A** Fans | Sponsor 基本品牌資格 / eligibility | 永久累積 | ✅ F1 實作 |
| **B** Season Performance | 續約、特殊 Sponsor 條件、賽季型合作 | 每季重新評估 | ⏸ 記錄方向，不實作 |
| **C** Form / Hype | 短期熱度推導值 | 會消退 | ⏸ 記錄方向，不實作 |

> **「Fans 決定品牌有多大；當季成績決定現在有多值得合作。」**

Fans 是**永久品牌資產**：不歸零、不每日衰退、跨賽季累積。
但**永久 Fans ≠ 永久享有所有 Sponsor 商業利益**——品牌讓你有資格上談判桌，
談到什麼要看當季。

🔒 **F1 不得偷塞 B / C 層**（會讓 playtest 無法歸因）。
🔒 **不得新增永久 reputation 欄位**（`meta.reputation` 已於 F0 deprecated）。
🔒 **比賽獎金仍由競技成績決定**，不得變成「粉絲越多獎金越高」。

完整契約：`docs/design/粉絲系統架構.md` §〇之三。

### F1 的驗收目標（裁決 B）

`0 / 100k / 180k / 300k / 500k / 800k` **只是 calibration baseline，不是最終 balance**。
F1 驗收看的是可達性：

1. 開局 8 週內必須存在**可維持基本財務的正式 Sponsor 路徑**
2. 第一個真正 Fan-gated 的升級，應在**第一季**看得到明顯進度
3. **中階 ≈ 1–2 個成功賽季**
4. **頂階 ≈ 3–5 個表現良好的賽季**
5. **明確不接受**：正常玩法需要 8–15 季才碰到頂階

🔒 **Hard constraint（verifier 守）**：第二個可用 Sponsor 的粉絲要求
**不得高於新局起始 `fans`**，除非另有經驗證的財務生存路徑。

### Sponsor perk（裁決 A）

`SPONSORS[].perk`（「訓練效果 +15%」等）是**無實作的純文案**。

- **F4 移除文案，Fan v1 不補實作。**
- **不允許形成 `fans → sponsor → training / player power` 的間接戰力路徑。**
- 未來若要重做 Sponsor perk，**另開設計題**。

⚠ Training v1.1（`data/trainingCalculator.js`）已進 main，技術上讓「訓練效果 +15%」變得容易接上——
**這正是必須先把裁決寫死的原因**。

### 範圍邊界（本案不動）

Competition Hub、**Training v1.1（`trainingCalculator`）**、Player progression、
MatchSession / ActiveMatch、`reqWins` 閘門、`STARTER_SPONSORS`、`economyConfig` 既有費率。
**不新增第四個金錢入口**（維持 `applyMatchProgress` / `weeklySettlement` / `settleCompetitionAward` 三個）。

若 F1 發現要達成可達性目標必須改動 `economyConfig`，**停下來回報，不要順手改**（風險 R9）。

### 為什麼價碼倍率被切到 v1.1

`economyConfig` 自帶「待轉會與合約系統完成後再校正」註記。把粉絲與現金流平衡同時綁死，
會變成兩個都調不準。**v1 先讓粉絲擋門，看玩家有沒有感覺；有感覺再談價碼。**


---

# 選手健康與生命週期（2026-08-25 產品裁決）

## 已定案並已上線：ESMO 不採用選手隨機受傷／傷停機制

> ✅ **2026-08-25 上線**：`b80e13c` fast-forward 進 main（Actions run #162 success）。
> 正式站 bundle 由 `index-B20kZ-y6.js` 換成 `index-Dmu1wOFE.js`，其中「傷停」出現 **0 次**
> （剩下的 4 個「受傷」是英雄技能描述的戰鬥掉血，不在範圍內）。
> 正式站 smoke **52/52**（Desktop 1366 ＋ Mobile 390）。
> **Player Injury Removal = CLOSED。**

Milestone O2 曾實作一整套受傷（賽後決定性抽籤 → `injuryDays` → 每日 −1 →
傷停中不可出賽 → 名單／首頁／選手頁顯示）。**2026-08-25 裁決取消**，
整套 gameplay 已移除（branch `feature/remove-player-injury`）。

不得再由任何來源產生 `injured` / `injuryDays` / 傷停：
比賽、體力低、連續出賽、隨機 roll、訓練，一律不行。
injury 也不得再成為出賽資格條件。

守門：`tools/check_no_player_injury.mjs`（含 4 個 mutation sentinel）。
舊存檔的欄位相容處置見 `docs/09_技術債務清單.md` TD-29。

## 明確保留（不在移除範圍內）

| 保留 | 為什麼 |
|---|---|
| **年齡 `age`** | Training v1.1 的年齡係數在用；也是 Season vNext 的地基 |
| **體力 / condition** | 輪換策略的唯一來源 |
| **疲勞 / `exhausted`** | 仍是合法的不可出賽原因（體力 < `CONDITION.unfitBelow`） |
| **連續出賽 `matchStreak`** | 仍加重體力消耗 ⇒ 輪換仍有意義 |
| **輪換需求** | 由體力與連續出賽共同構成 |
| **訓練 / Training v1.1** | 成長公式**零語意變更**（含年齡係數） |

⚠ **連續出賽 → 受傷機率** 這條連結已永久移除；
**連續出賽 → 疲勞 → 體力下降 → 需要輪換** 這條保留。

## Season vNext — 設計已裁決（2026-08-25），**READY FOR IMPLEMENTATION**

> 完整設計：`docs/design/Season_vNext_長期生涯與競賽框架.md`
> 量測腳本：`tools/season_vnext_calibration.mjs`
>
> **已裁決（FINAL）**
> · **Q2 Multi-Title Club = Opt-in / Later**——玩家不被迫同時經營 MOBA + CS；
>   第二分部**必須同時帶成本與收益**，不得成為「不開就吃虧」的 mandatory bonus
> · **Q3 Online = Contract only**——不做 server / real matchmaking，
>   **也不做本地 fake Ranked**；但 Career / Growth contract 必須允許未來 AI 與真人 Match 共用
> · **Career Year = 12 週 / 84 天 = MVP baseline**（**不是永久 balance freeze**）
> · **Live Event 不因玩家參與而額外懲罰 Career Time**（Career Calendar 預留 Event Window）
>
> **仍未鎖定**：所有 balance 常數，由 V0A + V0B 的共同 calibration 決定。
> 設計文件只鎖**產品驗收目標**，不鎖公式數值。
>
> 📌 **2026-08-25 更新**：Foundation Calibration 已執行，balance 常數現在**有取值了**
> （gamma 0.6、`sourceBase.official` 3.0、年齡與 learning 曲線）。
> 但它們仍是**校準參數，不是 FINAL freeze**——改任何一個都要連同
> `node tools/foundation_calibration.mjs` 的輸出一起看，並由
> `tools/check_foundation_calibration.mjs` 的產品驗收線（§Y／§X）判定。

### 設計階段翻出來的三件事（會改變優先序）

用主幹真正在跑的函式實跑量測（非估算）發現，**「加上年齡與世代交替」在現行成長模型下會失敗**：

1. **新秀沒有成長空間**——`genProspects` 的中位成長空間只有 **8.4 點**
   （入行時主能力已達潛力的 87.6%）⇒ 「成長期→巔峰期」只是換標籤
2. **成長是漸近線**——12 個 Career Year 後典型新人只關閉 **64.6%** 潛力空間，
   高潛天才更只有 50.3% ⇒ 玩家會看到「潛力 92，一輩子停在 70」
3. **正式賽事只貢獻 10.6% 的成長**（訓練 89.4%）⇒
   「League/Tournament = 正式生涯成果」在數字上是假的

⇒ **Season vNext v1 的第一優先不是 aging，是 Growth Model 重建。**

### Career Year 提案：12 週

不是因為模擬分數最高，而是**對齊既有常數**（`WEEKS_PER_SEASON = 12`、`SEASON_DAYS = 84`）
⇒ 可直接吃現成的賽程間距與週結算冪等鍵。
10 週會讓 3 天的訓練課程塞不進 5 天的場間；14 週讓 17 年生涯多按 80 次推進。

### 已知的結構性缺口（現在就存在）

- **凍齡**：`advanceDay` 只有訓練中心一個入口，且**打比賽完全不推進日曆**
  ⇒ 玩家可以無限打自由對戰刷成長，世界時間一天都不走
- **生涯操作量**：12 週 × 17 年 = 476 次「推進 3 天」⇒ 世代交替體感上到不了

---

### Implementation Roadmap（已裁決）

**Foundation（兩者都完成並共同 calibration 通過才能往下）**

- **V0A** Player Career Growth Model — ✅ **已完成 2026-08-25**
  （`progress/careerGrowth.js` 為 PCGM 單一入口；比賽成長現在認年齡與 learning；
   `trainingCalculator.js` 零 diff；`check_pcgm_v0a` 24/24）
- **V0B** Prospect Growth Space — ✅ **已完成 2026-08-25**
  （原型化生成：養成型／一般／即戰力／超新星；成長空間中位 8.4 → 15.8 點；
   釘住率 41.5% → 0.4%；招募等級只提升資訊品質不讓新人變強；`check_prospect_growth_space_v0b` 31/31）
- **V0C** Match Origin / Growth Source Attribution — ✅ **已完成 2026-08-25**
  （`progress/matchSource.js` 三層來源；`metadata.matchSource` 附加欄位；
   MOBA/CS 共用同一支分類；`check_match_source_v0c` 21/21；TD-35 已解）
- **Foundation Calibration Gate** — ✅ **已完成 2026-08-25**
  （`progress/potentialSpace.js` 共用冪次曲線 gamma = 0.6 ⇒ TD-33 解；
   `sourceBase.official` 3.0、`competitive` 1.0；年齡曲線陡峭化、learning 加寬；
   新增「心志鍛鍊」課程補上三項練不到的能力；`check_foundation_calibration` 57/57）

> ✅ **FOUNDATION_COMPLETE = YES**（2026-08-25）。
> Foundation 路徑：V0A ✅ → V0B ✅ → V0C ✅ → **Foundation Calibration Gate ✅**。
- 🔒 **Foundation Gate**：四者**不得各自宣告完成**。
  成長速度是「公式 × 成長空間 × 來源」的乘積——只修一邊，另一邊會讓結果看起來更糟，
  分開驗收都會得到錯誤結論。這也是實際發生的事：V0A/V0B/V0C 各自綠燈之後，
  一般新人 Year 4 仍只有 42.4%，要到四者一起校準才進到 76.5%。

**成長產品驗收目標**（19–21 歲、正常高潛力新人，正常玩法）

| Career Year | 目標 | 實測（一般新人 / 即戰力 / 養成型） |
|---|---|---|
| Year 1 | 明顯進步，可以進輪換 | ✅ 46.0% / 56.2% / 36.9% |
| Year 2 左右 | 有機會成為穩定主力 | ✅ 59.7% / 69.9% / 50.8% |
| Year 3–4 | 好選手接近成熟／巔峰 | ✅ 76.5% / 83.7% / 69.2% |

（改動前分別是 20.4% / 29.6% / 42.4%。量測：`node tools/foundation_calibration.mjs`）

**年度來源比例**：實測 Training **78.1%** / 正式季賽 **21.9%** / 競技 ≈ 0% / 快速練習 0%。

> ⚠ 原訂 target「Training 40 / Formal 35 / Ranked 15 / Practice 10」**沒有達成，且刻意不追**。
> 那組數字是 Season vNext 設計初稿的早期參考值，前提是四層比賽都已存在。
> 現況：快速練習**刻意 0%**（V0D 已上入口，但它是純測試場，設計上就不給成長），
> Ranked **不做**（Q3 FINAL：契約 only），
> 而競技比賽因為體力經濟幾乎排不進場（**TD-38**）。
> ⇒ 在快速練習與體力經濟落地之前，強行湊比例只能靠把 `competitive` 倍率調高，
> 而實測那會直接做出「刷比賽＝最佳養成法」（base 1.5 時純刷 81% > 認真訓練 75%）。
> **比例是結果，不是目標**；要改比例得先改結構。

**Foundation 之後**

- **V0D** 快速練習模式 ＋ TD-36 — ✅ **已完成 2026-08-26**
  （第三種 `MatchOrigin`：`practice`；第三個生產者 `matchmaking/practiceGateway.js`，
   與另外兩個閘道共用同一條管線；`MATCH_SOURCE.unknown` 把「查不到來源」
   與「明確是練習」分開 ⇒ TD-36 已解、`sourceBase.practice` 可以歸零；
   入口是 MOBA / CS 共用 `MatchPrepFrame` 的一顆次要按鈕；
   `check_practice_match_v0d` 67/67）
  > 快速練習＝**純測試場**：不給成長、不給錢、不給粉絲、不計戰績、不扣體力、
  > 不推進日曆、不碰賽季。它的產品價值是「試新人／試陣容／試位置／試戰術」，
  > **刻意沒有任何可累積的收益**——所以不存在「刷練習比較划算」這種問題。

- **V1** 世界時間基礎 — ✅ **已完成 2026-08-27**
  （`platform/time/worldClock.js` 世界時間契約：推進理由白名單、活動→時間成本表、
   生涯年度邊界；`advanceWorldDays(n,{reason})` 具名入口 ＋ `worldTimeView()` 單一讀取點；
   訓練中心解除「沒人訓練就不能推進」；首頁新增世界時間卡；
   `check_world_time_v1` 46/46）
  > **原本的樣子**：正式 UI 唯一推得動 `meta.days` 的是訓練中心那顆按鈕，
  > 而它第一行就 `if (training.length === 0) return` ⇒ **不指派訓練，世界完全停住**。
  > TD-34 記的是「只靠訓練推進」，實測比記載更嚴重。
  >
  > **生涯年度 = 84 天（7 × 12）已可靠建立**，由 `careerYearOf` 命名、
  > 與 `deriveTime` 同源、且**不受賽事容器影響**（賽季狀態機完全不寫 `meta`）。
  > 這是未來年齡系統可以直接用的邊界——**本輪不動選手年齡**。

- **V2** 時間區塊與年度邊界 — ✅ **已完成 2026-08-26**
  （一般競技改用**每日容量** `COMPETITIVE_BLOCK.matchesPerDay = 3`，
   `WORLD_TIME_COST.competitive` 由 V1 的 `null` 定案為 **0**——不加天；
   `careerYearRollover.js` 建立年度跨越事件，**age +1 已接上**；
   `check_time_block_v2` 47/47）
  > **為什麼不是「打一場 +1 天」**：實跑四種做法（`tools/timeblock_calibration.mjs`），
  > 每場加天與每 N 場加天都讓愛打競技的人一年多老 33–100 天，而且**都要在比賽結算裡
  > 寫時鐘 ⇒ 第二個時間推進者**。每日容量一天都不加，且結構上不可能寫到時鐘。
  > ⇒ 刷 XP 必然要付出世界時間，但競技玩家**不會老得比較快**。
  >
  > **TD-34 兩半皆已解**：世界不會被凍住（V1）＋ 凍齡刷素質的洞補上（V2）。

V3 大顆時間操作 → V4 Lifecycle →
V5 Off-season → V6 AI turnover → V7 Online Event contract

> **NEXT = V4 Lifecycle（年齡與生涯階段）。**
> 年齡現在**真的會動**了（跨 84 天 +1），但目前只影響成長效率
> （`ageEfficiency`）——沒有衰退、沒有巔峰期、沒有退休。
> 「老將可以被長期磨到上限」（Foundation Calibration 未解項）要到那一輪才真正解決。
>
> ⚠ **V3「大顆時間操作」可以往後排。** 它是操作便利性（一次推一週／推到下一場），
> 不是缺口——`advanceWorldDays(n)` 本來就吃任意天數，V3 只是給它更好的入口。
> 而 V4 擋著一個**已知會失效的產品前提**，優先序較高。

---

## Season vNext 實作邊界（一律不做）

下列全部**留待 Season vNext 另行設計**，不得因為「受傷被移除了」而誤以為
選手生命週期也被取消：

- 每年 / 每季的年齡推進
- 成長期 / 巔峰期 / 衰退期曲線
- 退休
- 新人生成
- AI roster turnover（AI 戰隊換血）
- Off-season

這些要站在**現在保留下來的** `age` / `potential` / `learning` / `growthLog` 上，
所以那些欄位與公式在本輪一條都沒有動，並由 `check_no_player_injury` 反向釘住。

---

## Season vNext — 生涯 × 線上競技公平架構（2026-08-26，Design Sprint 已裁決）

完整設計：`docs/design/Season_vNext_生涯與線上競技公平架構.md`（14 節）
本節只放 Roadmap 影響。**docs-only，`src/` 零改動。**

### 這一輪回答的題目

> 生涯可以快轉、選手又會永久成長，怎麼避免玩得快的人在線上天然碾壓其他玩家？

結論一句話：**生涯時間買的是「人才深度與組隊選擇」，不是「線上戰力上限」。**

### 四種玩法的最終責任（取代舊設計 §9）

| | 時鐘 | 永久成長 | 金錢 / 粉絲 | 產出 | 狀態 |
|---|---|---|---|---|---|
| 快速練習 | 都不屬於 | 0 | 0 | 手感、陣容資訊 | ✅ 已實作（V0D） |
| 生涯季賽 | CareerTime | 正式賽最高 | ✅ | 冠軍、獎金、生涯紀錄 | ✅ 已實作 |
| 真人競技 | ServerTime | **0** | **0** | 評分、牌位、排行榜 | 📄 只定契約 |
| 真人定時賽事 | ServerTime | **0** | **0** | 名次、積分、榮譽 | 📄 只定契約 |

⚠ 線上兩層的成長改為 **0**（舊設計是「中 / 中高」）。理由：任何非零值都會讓
「線上能力 = f(玩家有多少現實時間)」，分級與預算擋不住，因為成長會讓人跨級。

### 推薦的公平模型：**CBR 三層**

`Cap（陣容上限）→ Bracket（分級）→ Rating（評分）`
定價**委派既有** `competition/teamStrength.v1`，不新建第二套戰力公式。
**陣容上限只存在於線上，生涯比賽永不套用**（否則養成失去意義）。

### V3 判定：**可以照原計畫繼續（YES）**

V3（大顆時間操作）不碰本輪任何一條不變式，且快轉的代價已經存在
（`ageEfficiency`：34 歲 = 20 歲的 29% 成長效率）。

**但 V3 必須新增兩個 gate**（原計畫沒有）：

| 新增 gate | 內容 |
|---|---|
| `check_time_block_v3` §I7 | **競技容量不得跨日累積**——推 7 天不得拿到 21 場。現況碰巧正確，但沒有測試釘住（TD-42） |
| 多週結算冪等 | 週結算冪等鍵在**一次跳多週**時仍須成立。`check_time_block_v2` §F1 只驗過單週 |

### 後續順序（與原計畫相同，只補註記）

| # | Sprint | 狀態 | 本輪新增的註記 |
|---|---|---|---|
| V0A–V0D / V1 / V2 | Foundation → 世界時間 → 時間區塊 | ✅ 已完成 | — |
| **V3** | 大顆時間操作 | ⏭ **下一個** | 補 I7 sentinel 與多週冪等 gate |
| V4 | Lifecycle（衰退） | 排定 | 關閉 TD-40 的時效缺口——時間才真的有代價 |
| V5 | Off-season（退休 / soft-lock） | 排定 | 同上 |
| V6 | AI turnover | 排定 | — |
| **V7** | **線上契約** | 可與 V3–V6 並行 | **範圍擴大**：由單一 `EventTimeBlock` 擴為七個契約；須先解 TD-39 |

### 明確不做（本輪與可預見的下幾輪）

真人連線 / 伺服器 / 真實 matchmaking / 反作弊、本地 fake Ranked、
定時賽事本體、任何 `online` / `event` 的**生產者**（只定契約形狀）。

### Season vNext V3 — 時間快速推進：**已完成（2026-08-26）**

交付 `src/platform/time/fastForward.js`（規劃器，31 行實碼）、
`profileStore.nextStopView()` / `advanceToNextStop()`、首頁世界時間卡三顆入口。
守門 `tools/check_time_block_v3.mjs` **67/67**（含 4 個 mutation sentinel）。

**核心形狀**：規劃器**提案**（只回答「該推幾天」），V1 的 `advanceWorldDays` **裁決**
（真正推進）。沒有新增第二個時鐘，`meta.days` 的寫入點仍然只有一處。

**Design Sprint 指定的兩個缺口已補**：
- ✅ §I7 競技容量不得跨日累積（**TD-42 已解**）——掃 1–90 天恆等於上限
- ✅ §W 多週結算冪等——一次跳 3 週 = 恰好 3 次，與逐日推進四項逐值相同

**上限 28 天**：一次快轉必須 ≤ 一個生涯年度（84 天），否則可能一次跨兩個年度邊界，
而 age +1 的通知只會出現一次。

⚠ **未經瀏覽器實測**：世界時間卡的三顆按鈕與「下一站」顯示（見 `05_Sprint紀錄.md`）。

### 下一個：V4 Lifecycle

前置條件已齊備：V0A/V0B 的 `closedRatio`、V1 的世界時間、V2 的 age +1、V3 的快轉。
V4 之後 **TD-40 的時效缺口才會關閉**——在那之前，快轉的代價只有「成長變慢」
（`ageEfficiency`），沒有能力下降與選手離隊。

### V3 Closure（2026-08-26）：**V3 = CLOSED**

瀏覽器實測補完，新增 `tools/browser_check_time_controls.mjs`（**21/21**，
桌面 1280 ＋ 真 390px media query ＋ 比賽日必須擋住）。抓到並修掉兩個真缺陷：

1. **手機完全沒有推進世界時間的入口** —— 手機版不渲染 `ClubStatus`，
   TD-34 在手機上一直還活著。修法：`WorldTimeStatus` 放進 `MobileHome` 主要動作之後。
2. **站在比賽日上時「下一站」指向 36 天後的年度邊界** —— 但玩家一步都走不了。
   修法：`nextStopOf` 改為含今天，`daysAway` 0 顯示「就是今天」。

`check_time_block_v3` 由 67 → **69**（新增 §B10／§B11）。
CLAUDE.md 已新增「Season vNext 時間線」現役 verifier 段落。

### V4 Audit / Plan（2026-08-26）：**READY_TO_IMPLEMENT，未實作**

設計：`docs/design/Season_vNext_V4_選手生涯階段與年齡效果.md`

**Audit 的關鍵發現**：年齡在主幹上的足跡**只有一個函式** `ageEfficiency(age)`
（訓練與 PCGM 共用同一支）。它**不影響**比賽表現（`LogicEngine` 讀 `.age` **0 次**）、
不影響週薪、不影響身價；`careerStageOf` 是一個**已接好兩個畫面、但永遠沒有值**的 placeholder。

⇒ 「老將維持高能力」的精確形狀是：35 歲綜合 85 與 22 歲綜合 85 在遊戲**觀察得到的每個面向**
上完全相同，只差在進步比較慢——而那對已經練滿的人等於零影響。**換血沒有驅動力。**

**V4 裁決：改變價值，不改變能力。** 老將 = 貴、練不動、賣不掉，但現在就是強。

| # | 交付 |
|---|---|
| V4-1 | `careerStage` 變成真的（**推導不落盤**，主軸 age，`closedRatio` 只分 rookie/growth） |
| V4-2 | 週薪加入年齡項（持有成本，費率進既有 `economyConfig.SALARY`） |
| V4-3 | 身價（`players[].salary`）加入年齡折舊 |

**明確不做**：能力衰退、退休、Off-season（→ V5）、AI 老化（→ V6）。

⚠ Audit 的反向結論：退休／Off-season／AI 老化**不是 V4 的前置**，
它們是**「做衰退」的前置**——所以 V4 不做衰退就一個都不必碰。
衰退若硬塞進 V4，會連帶把 V5＋V6 一起拉進來，且與剛校準完的 V0A/V0B 成長曲線打架。

### Season vNext V4 — 生涯階段與年齡效果：**已完成（2026-08-26）**

交付 `progress/careerStage.js`（52 行）、`economy/marketValue.js`（24 行）、
UI 接線、`tools/careerstage_calibration.mjs`（量測，不進 CI）。
守門 `tools/check_player_lifecycle_v4.mjs` **44/44**（含 3 個 sentinel）。

**年齡現在有兩個出口，都不碰能力**：既有的 `ageEfficiency`（成長效率）
＋ 新的 `careerStage`（看得見）與 `marketValue`（有代價）。

**核准範圍內的兩點調整都已照做**：
- ❌ **不做**老將週薪溢價——`weeklySalaryOf` 逐值不變（Audit 已證明不需同步調整：
  `weeklySettlement` 自 N2 起不讀 `players[].salary`，兩條路徑不相交）
- ❌ **退役不由 age 推導**——`CAREER_STAGES` 只有五個，不含 `retired`

**仍然不做**：能力衰退、退休、Off-season、AI 老化、選手離隊。

### 下一步：V5 之前，建議先做「退役／離隊」的設計裁決

V4 讓年齡**看得見**也**有代價**，但老將目前仍然：能力不會下降、不會離隊。
⇒ 換血的驅動力只有「市場價值下降 + 練不動」，還缺「他總有一天會走」。

⚠ 順序上的 audit 結論仍然成立：**能力衰退需要 Off-season（不能在週三突然掉）
與 AI 老化（否則只有玩家的世界會老）** ⇒ V5 應該把
「退役事件 + Off-season 階段 + AI turnover」當成**一包**設計，不要拆開做。

## Season vNext V5 Design Sprint（2026-08-26）：**GO**，未實作

設計：`docs/design/Season_vNext_V5_休賽期與世代交替.md`（12 節）

### 三件事是同一個系統

Off-season、老化／退休、AI 世代交替**在同一個時刻發生：生涯年度邊界**。
那個邊界已經存在（V2），目前只做一件事（age +1）。V5 把那一行變成一段**九步序列**。

### Audit 的三個關鍵發現

1. **能力四分類已經在主幹上**：`STAT_DEF[].cat` = 操作／戰術／心理／團隊各 4 項
   ⇒ 衰退方向不必另寫清單。**操作先衰、戰術與團隊緩升** ⇒ 老將換一種強法，不是變廢。
2. **玩家開局剛好 5 人**（`INITIAL_PLAYERS`）⇒ **第一次退休就會 soft-lock**，不是遠期風險。
3. **`AI_TEAMS` 是模組層級凍結常數**（固定 seed、載入時算一次）
   ⇒ 必須改成 **career year 的決定性函式**，不得落盤（否則破壞規格 D9 的邊界）。

### 幾個裁決

- **衰退時鐘用 V4 的 `effectiveAge`**，不用原始 age ⇒ 早熟／晚熟自動有不同衰退時機，**零新欄位**
- **衰退起點錨在巔峰期結束（29 歲）**，不照抄 Legacy 的 26（那會讓人在巔峰期中間變弱）
- **`learning` 排除在漂移之外** —— 它是成長速率輸入，漂移會與 `ageEfficiency` 重複計算
- **退休兩段式**：意向 → 下一個年度才真的走 ⇒ 「玩家有時間找接班人」是**結構保證**
- **soft-lock 用「免費但很弱的青訓補位」守**，不用「人數不足就延後退休」
  （後者可被反向利用：永遠不補人 ⇒ 永遠沒人退休）
- **Off-season 必須有一個會影響下一年的不可逆決策**，做不到就只做背景結算、不做畫面

### Sprint 拆分（V5-2 不得拆開）

| # | 交付 |
|---|---|
| **V5-1** | Off-season 骨架：年度邊界變成序列、年度封存、生涯評估（尚無衰退、無退休） |
| **V5-2** | **能力漂移（對稱）**：`applyAgeDrift` 純函式，玩家與 MOBA AI **同時**套用；AI roster 改為 career year 的決定性函式 |
| **V5-3** | 退休意向 → 退休／延役；青訓補位；每年上限；**實跑 soft-lock 證明** |

⚠ **V5-2 的兩半必須同一個 Sprint 出**——只有玩家會老而 AI 永遠 19–27 歲，
等於單方面懲罰玩家。這正是 V4 audit 把 AI turnover 判為「衰退的前置」的理由。

### 兩個收尾條件（不是選配）

- **重跑 Foundation Calibration**：漂移在年度邊界、成長在日常，疊加後 Year 1–4 的
  產品目標可能失效
- **soft-lock 必須用真的 Store 實跑 15 年證明**，不接受推論

### V6（明確不在 V5）

CS AI 老化（前置：CS AI 目前**沒有年齡欄位**）、合約／續約／慰留談判
（`players[].contract` 目前根本沒在倒數）、轉會市場、老將的機制價值（導師／Coach）。

### V5-1 Off-season / 生涯年度邊界：**已完成（2026-08-27）**

交付 `time/offSeason.js`（64 行）、Store 接線、首頁一行狀態。
守門 `tools/check_offseason_v5.mjs` **44/44**（含 2 個 sentinel）。

年度邊界現在**有紀錄、可冪等、只由 `advanceDay` 觸發**，冪等鍵是**年度編號**
（照抄週結算已驗證的形狀）。封存與 age rollover 折進**同一個 `set()`**。

⚠ **邊界刻意不擋快轉**——V5-1 沒有決策，而設計文件自己的規則是
「多一個沒有決策的畫面比沒有畫面更糟」。V5-3 才會變成真的停下來的地方。

### ⚠ V5-2 開工前必讀：設計文件 §13 的三條前置約束

**第一條推翻了 V5 設計文件 §3.2**：衰退時鐘**不得**用 V4 的 `effectiveAge`。
實測：33 歲選手掉 10 點能力會讓 `effectiveAge` **倒退 2.25 年**（33.09 → 30.84）
⇒ 負回饋迴圈，衰退會自我熄火。V5-2 必須另立以 **raw age** 為基底的 aging clock。

另外兩條：`RetirementIntent` 的出賽比例只能小幅修正（不得免疫）；
`AiGeneration` 必須保證跨年度的 **identity continuity**（不得每年整隊重生成）。

### V5-2 年度能力漂移 × MOBA AI 世代交替：**已完成（2026-08-27）**

交付 `progress/ageDrift.js`（63 行，玩家與 AI **共用**）、`aiTeams.aiRosterAt`、
`seasonState.rostersFor` 接線。守門 `check_age_drift_v5` **46/46**（3 sentinel）。

**老化時鐘 = raw age + 決定性個體 profile**（由 `player.id` 雜湊，±3 年，**不讀能力**）
⇒ 「能力下降不能讓時鐘倒退」是結構保證。**不使用** V4 的 `effectiveAge`。

15 年長跑：玩家操作 −21%、戰術／團隊反升、綜合只掉 1.4，`learning` 逐值不變；
AI 平均年齡 24→30 後開始換血並循環，戰力 −2.2%，identity 每年保 4–5 人。

**開工前自檢修掉 V5-1 一個 bug**：年度封存跑在 age +1 之後，
導致第 1 年度記成 23.0 歲（該年度結束時其實是 22.0）。已改為封存在 rollover 之前。

### ⚠ V5-3 開工前的第一個 calibration 項目

`careerSim` **沒有經過漂移路徑**（引用數 0）⇒ Foundation Calibration 的 58/58
**不能**當成「成長+漂移一起仍達標」的證據。直接量測的結果：

`Y1 38.2→41.9%｜Y2 59.6→66.7%｜Y3 67.9→76.2%｜Y4 73.1→81.4%`

判定為**合理的 lifecycle 變化**（19–21 歲落在緩升區段，目標變容易不是變難）⇒ 未 rebaseline。
但這是真實的平衡位移（Y4 +8.3pp），且**青年期緩升可能與訓練成長重複計算**
（與 `learning` 被排除是同一類問題）⇒ V5-3 開工前先處理。

### V5-3 退休意向 × 退休 × 青訓補位：**已完成（2026-08-27）**，Lifecycle 閉環

含開工前的 Age Drift calibration：青年期正向 drift 確實與訓練**重複計算**
（純 aging 5 年主能力 +2.6～3.2，其中操作 +2～+5，等於訓練成長的 11%）。
**最小調整**：操作正向歸零、其餘三類縮到 0.25／0.15／0.2。
只動 AgeDrift 曲線，**沒碰 Training / PCGM，沒有 rebaseline**。
調整後純 aging 5 年 **+0.69**，Y4 偏移由 +8.3pp 收斂到 **+1.2pp**。

交付 `progress/retirement.js`（101 行）、Store 年度邊界接線、收件匣三則通知、
首頁決策提示。守門 `check_retirement_v5` **39/39**（3 sentinel）。

**兩段式退休**：第 N 年宣布意向 → 第 N+1 年真的走或延役（28%）。
沒宣布過的人永遠不會退休（結構保證）；出賽率只做平移，全勤擋不住年齡。
名單地板由**免費但明顯較弱**（綜合 45.4、18 歲）的青訓補位守，退休不因人數不足取消。

**15 年實跑**：意向 5｜退休 4｜青訓補位 4｜**最低人數 5，從未卡死**；
平均年齡在 24→30→25 循環，世代交替真的在跑。

### Lifecycle 閉環狀態

`V0A/V0B 成長 → V1 世界時間 → V2 年度邊界 → V3 快轉 → V4 生涯階段/市場價值
→ V5-1 年度封存 → V5-2 老化漂移 + AI 世代交替 → V5-3 退休 + 補位` **已閉環**。

### 仍在 V6

CS AI 老化（`csAiTeams` 沒有年齡欄位）、合約／續約／慰留談判、轉會市場、
老將的機制價值（導師／Coach）、Off-season 專屬畫面（等決策夠多再做）。

### V6-1 CS AI Lifecycle parity：**已完成（2026-08-27）**

⚠ 先更正一個 audit 誤判：V5 文件說「CS AI 完全沒有年齡欄位」是**錯的**
（grep 被 `courage`/`damage` 淹沒）。實測 40 名 CS AI **全部都有 age**（18–28，平均 23.1）
⇒ V6-1 只需要接線，不需要建資料。錯註解已同步修掉。

交付 `csAiRosterAt` / `csAiLineupAt`、`seasonState` 接線、`check_cs_ai_lifecycle_v6` **32/32**。

**共用核心**：CS 與 MOBA 共用 `applyAgeDrift` 與 `AI_DEPARTURE`；
gate §C4 反向釘住「CS 檔內不得出現任何漂移曲線常數」⇒ 結構上不可能有第二套引擎。

15 年長跑：兩邊年齡都在 22–29 循環、都有換血（CS 3–5 人）、
**CS lineup 失效 0 年**、全 8 隊戰力最大偏移 **1.8%**（MOBA 最多約 5%）。

### V6-2 合約生命週期：**已完成（2026-08-27）**

`players[].contract` 從 Legacy 就存在、UI 也早就在顯示，但**沒有任何地方讓它倒數**。
V6-2 接上那條線：每天倒數、到期**只在年度邊界結算**（不讓選手在星期三突然消失）。

**優先順序明確**：退休先於合約到期；宣布過退役意向的人不得續約。
續約金 = V4 市場價值 × 0.5（與既有估值接軌，無談判 AI）。
名單地板沿用 V5-3 的免費補位：15 年到期離隊 15 人、補位 15 人、**從未低於 5 人**。

守門 `check_contract_v6` **38/38**（2 sentinel）。

### 下一步：V6-3 轉會市場 + Off-season 正式畫面

到 V6-2 為止，Off-season 已經累積出**三個**真實決策：
① 有人宣布退役 → 要不要現在簽接班人
② 有人合約即將到期 → 續約還是放走
③ 續約要花錢 → 和補強搶預算

⇒ **決策夠多了，V6-3 可以開始做正式的 Off-season 畫面**（不再是空殼頁）。

### V6-3 正式 Off-season 經營流程：**已完成（2026-08-27）** — **V6 結案**

交付 `time/offSeasonSession.js`、`OffSeasonScreen.jsx`（六區塊）、
`releasePlayer` / `completeOffSeason`、快轉停止理由 `offSeason`。
守門 `check_offseason_session_v6` **39/39** ＋ `browser_check_offseason` **18/18**
（桌面 + 真 390px，完整走過「年度結束 → 休賽期 → 續約/放走/補人 → 下一年度」）。

**休賽期是本專案第一個會擋住世界時間的狀態**，所以它有一個永遠成功、永遠免費的
出口（「完成休賽期」），加上共用的 `ensureRosterFloor` ⇒ 破產或全部放走都不會卡死。

**只在真的有決策時才開**（V5 設計 §6 的判準），沒事的年度不會多卡一道空殼畫面。

### Season vNext 全線狀態

```
V0A/V0B 成長 → V1 世界時間 → V2 年度邊界 → V3 快轉 → V4 生涯階段/市場價值
→ V5-1 年度封存 → V5-2 老化漂移 + MOBA AI 世代 → V5-3 退休 + 補位
→ V6-1 CS AI 世代 → V6-2 合約 → V6-3 休賽期經營流程
```

**選手會成長、變老、能力分四類變化、市場價值折舊、宣布退役、合約到期、真的離開；
兩個項目的 AI 都會老化換血；而玩家每年在休賽期用同一份預算做真實取捨。**

### V7 之後仍未做

真人競技 / 定時賽事（V4 已定契約，仍是 Not Now）、Coach / Mentor / 導師加成、
完整 AI 轉會市場與談判、Club DNA / Personality。
## CS-C4B｜兩張地圖環境完成（2026-08-27）

- 狀態：`C4B_TWO_MAPS_READY_FOR_OWNER_ACCEPTANCE`。
- 已把 Mirage C3/C4A 的 environment production framework 延伸到 Dust II 與 Inferno；三張地圖共享 presentation framework，但保留 map-specific visual identity，避免未來把所有地圖做成同一張換色。
- Owner review：`http://127.0.0.1:5412/ESMO-/artifacts/cs-c4b/two-maps/owner-review.html`。
- 下一階段：C5（僅列 roadmap，不在本輪實作）；開始前應先完成 C4B Owner acceptance，並另行定義 C5 範圍。

## CS-C4B / C4 正式關閉

- `C4B_TWO_MAPS = OWNER_ACCEPTED / CLOSED`
- Mirage、Dust II、Inferno 三張地圖已完成共用 environment production framework 的正式整合與部署驗證，同時保留各自 visual identity。
- 下一階段建議：C5（另行定義範圍後開始）；本次不實作 C5。

---

# 🚀 Season vNext = RELEASED（2026-08-27）

**V0A～V6 = CLOSED。** 選手生涯循環全線上線。

⚠ 本檔前面那個「## Season vNext 實作邊界（一律不做）」章節已由本次 release **取代**——
那是受傷移除那一輪留下的邊界宣告，當時 Season vNext 尚未規劃。現在它全部做完了。

### Release Gate 結果

| 群組 | 結果 |
|---|---|
| Season vNext V0A–V6（15 支） | ✅ **663 項全綠** |
| Competition Q1–Q6 + shared UI | ✅ 93／112／92／91／68／69／57 |
| Competition Release Gate | ✅ **11/11** |
| CS / Training / Progress / Finance | ✅ `cs23` 28／`talent27`／`progress25`／`finance_n`~`n31` 32/35/40/31／`recruit_o` 41／`condition_o2` 29／`no_player_injury` 29 |
| regress / regress2 | ✅ 結束率 15/15／節奏門檻 8/8 |
| Browser smoke | ✅ `time_controls` 21/21・`offseason` 18/18・`home_ia` 23/23 |
| production build | ✅ |

⚠ **兩次假紅燈已查明並排除**：
- `check_competition_release_gate` 一度 10/11（`career_final` undici 錯誤）——單獨重跑 **12/12**，
  乾淨重跑整體 **11/11**。成因是背景 verifier 併行搶 CDP port。
- `check_progress25` 一度 33/34（第 16 項「tactic24 仍全綠」）——直接跑 `tactic24` 是 **29/29 exit 0**，
  重跑 `progress25` 也是 exit 0。成因是巢狀子行程逾時。

### 已知 waiver / 技術債（不在本次 release 擴大處理）

| 項目 | 狀態 |
|---|---|
| **TD-37** `check_cs_team_identity_consumers_r48` | 既有永久紅燈。SHA 鎖雜湊 **FPS 引擎**；Season vNext 對 `src/battle/fps/` 改動為 **0**，動它的是 main 的 CS-C2C/C3/C4B 線。依既有技術債規則處理。 |
| **TD-39** 定價／模擬可能吃不同能力 | V7 線上契約之前必須處理 |
| **TD-40** V3–V5 之間快轉代價不足 | V5 落地後已大幅緩解（漂移＋退休），保留追蹤 |
| **TD-41** 快轉＋訓練是通往天花板的主要途徑 | 生涯側平衡，留待 balance 輪次 |
| `check_team_development_recovery` | 既有紅燈（首頁入口磚／talentPick 路由），與 Season vNext 無關 |

### V7 之後（本次不做）

真人競技／定時賽事（V4 已定契約，仍是 Not Now）、Coach / Mentor / 導師加成、
完整 AI 轉會市場與談判、Club DNA / Personality。

---

## V7A / V7B（2026-08-27，本機完成並全數驗證通過，未 push）

> 2026-08-27 補跑：`npm run build` ✅（14.68s）、`browser_check_general_match_and_objectives` ✅ **30/30**。
> **GENERAL_MATCH_CLOSED = YES**、**RETENTION_V1_COMPLETE = YES**。

### V7A 一般對戰收口 — **GENERAL_MATCH_CLOSED = YES**

一般對戰的正式定位 ＝ **日常低壓力實戰**。

| | 保留 | 禁止影響 |
|---|---|---|
| | 少量實戰成長（1.0，官方賽 3.0）| 正式聯賽排名 |
| | 一般生涯收益（錢／粉絲）| 巡迴積分、晉級、Championship |
| | 每日容量 3 場 | 正式賽季獎金、冠軍與正式榮譽 |

Audit 結論：**邏輯側本來就符合**，只補了兩個真缺陷與一組 UI 名稱。
gate：`check_general_match_v7a`（47）＋ `browser_check_general_match_and_objectives`。

- 快速練習曾經**有永久金錢影響**（`formLog` → 贊助績效獎金），已修
- 打完一場之後「快速練習」按鈕會消失，已修
- 一般對戰在 UI 裡本來**沒有名字**，已補層級橫幅與今日容量

### V7B Retention Foundation v1 — **RETENTION_V1_COMPLETE = YES**

設計：`docs/design/Retention_v1_設計.md`。gate：`check_retention_v7b`（58）。

日／週／季三個尺度，綁**世界時間**（永久排除 ServerTime）。獎勵只有俱樂部點數，
出口是純展示的聲望等級。日常目標**不得**直接給永久戰力。

### 下一步的候選（尚未排序，未開工）

| 候選 | 為什麼 |
|---|---|
| **Retention v2：點數兌換出口**（TD-42）| v1 的點數目前只換得到聲望等級 |
| **不同戰術週目標**（TD-43）| 要動被凍結的 `MatchProgressTransaction` metadata 白名單 |
| **Foundation Calibration** | PCGM 數值仍標記 provisional |
| **TD-39 定價／模擬能力來源不一致** | V7 線上契約之前必須處理 |
