# Team Development Expansion & Online Boundary v1

> 建立日期：2026-09-04　基線：`origin/main` = `cd08f7c`（TD-56 released）
> 性質：**Audit ＋ Design ＋ Architecture decision**。本輪未實作任何產品功能。
> UI 判準：`docs/design/ESMO_UIUX設計原則.md`
> 前置：`docs/design/TeamDevelopment_Progression_v1.md`（TD-56 供給表）

---

## 0. 一頁摘要

| 問題 | 結論 |
|---|---|
| 8 個 future node **候選**怎麼辦 | **ADOPTED = 6**（unlock／information）、**REJECTED = 2**。⚠ 8 是**候選數**，不是將實作數 |
| 要不要新增 capability kind | **不要**。六個倖存者全部走既有的 `unlocks`（聯集、無上限） |
| 要不要提高既有 cap | **不要**。前三個 kind 已被 TD＋Coach 超供，提高上限只是把兩個既有系統一起放大 |
| 啟用幾階 | **每個節點 1 階**（`activeLevelCap: 1`），與既有 live 資訊節點同形 |
| 對供給曲線的影響 | 可購買 18 → **24**（採用案 6 節點）；全樹 S6–S7 → **S9**。**S1／S3／S5 完全不變** |
| Online fairness | 契約**結構上已經成立**（能力從不跨越邊界），但缺 named contract、缺 verifier、缺 roster provenance 政策 |
| Club Facilities | **DEFER** |

---

## 1. Audit：8 個 future node **候選**

> ⚠ **命名約定（Owner 裁示 2026-09-05）**：`8` 永遠指**候選數**，
> `ADOPTED_NODES = 6` 才是本次要實作的數量，`REJECTED = 2`。
> 文件中出現 8 的地方一律指「當初表裡有 8 個 `future` 節點」這個事實，
> **不代表 8 個都會實作**。**不為了湊回 8 個而補新節點。**

全部共同點：`maxRank: 3`、`costPerRank: 1`、`activeLevelCap: 0`、`effect: null`
⇒ 目前可購買點數 **0**，在畫面上顯示「規劃中」。

| # | ID | 名稱 | category | tier | 原 intended effect（三階） | prerequisites | 既有 consumer | 與誰重複 | roster power | match power | 保留？ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `general_growth_support` | 成長支援 | general | advanced | 成長規劃提示／擴充培養建議／長期成長報告 | `general_recovery`≥1 | ❌ 無（但**資料全在**：`growthLog` `careerGrowthBreakdown` `potentialSpaceFactor` `careerStage` `retirement`） | 🟠 `coach_tactical` 的 `dataAnalysis`（那是**比賽**摘要，這是**成長**前瞻） | 否 | 否 | ✅ 保留 |
| 2 | `general_scout_support` | 球探支援 | general | specialty | 擴充球探報告／提升人才比較深度／長期招募規劃 | `general_data_analysis`≥1 ＋ `general_growth_support`≥1 | ❌ 無 | 🔴 `management_scout_network`＋`coach_scouting`，且 scope「球探」放在 general 線是分類錯置 | **是**（「提升人才比較深度」會滑向改人才池） | 間接 | ❌ **REJECT** |
| 3 | `moba_tactical_prep` | 戰術準備 | moba | advanced | 戰術準備摘要／擴充戰術選項／戰術配對 | `moba_draft_intel`≥1 | ❌ 無（`TacticScreen` 可掛） | 🔴 **Club Mastery**（`tacticVariant.js` 已經在解鎖戰術變體） | 否 | ⚠ 「擴充戰術選項」會 | ✅ 保留（**改為 information-only**） |
| 4 | `moba_match_analysis` | 賽前分析 | moba | specialty | 賽前總覽／情境比較／完整準備報告 | `moba_opponent_research`≥1 ＋ `moba_tactical_prep`≥1 | ❌ 無（來源資料**已被三個 live 節點解鎖**，只是散在各畫面） | 🟢 低 | 否 | 否 | ✅ 保留 |
| 5 | `cs_tactical_prep` | 戰術準備 | cs | advanced | 同 #3 | `cs_team_drill`≥1 | ❌ 無（`CsTacticScreen` 可掛） | 🔴 同 #3 | 否 | ⚠ 同 #3 | ✅ 保留（**information-only**） |
| 6 | `cs_match_intel` | 賽前情報 | cs | specialty | 同 #4 | `cs_demo_analysis`≥1 ＋ `cs_tactical_prep`≥1 | ❌ 無 | 🟢 低 | 否 | 否 | ✅ 保留 |
| 7 | `management_sponsorship` | 贊助拓展 | management | advanced | 贊助機會摘要／擴充合作選項／贊助規劃 | `management_contracts`≥1 | ❌ 無（`SPONSORS`、`sponsors.js`、`activeSponsor`、`FinanceScreen` 都在） | 🟠 未來 Facilities 最想 claim 的題目 | 否 | 否 | ✅ 保留（**information-only**） |
| 8 | `management_finance` | 財務規劃 | management | specialty | 財務摘要／資源預測／長期預算 | `management_sponsorship`≥1 | ⚠ **已存在且免費**：`forecast.js` 的 `cashForecast()` 已在首頁無條件顯示資金警告與破產週 | 🔴 與**現有免費功能**重複 | 否 | 否 | ❌ **REJECT** |

### 分類彙整

| 類型 | 節點 |
|---|---|
| information / QoL | #1 #4 #6 #7（＋ #3 #5 降級後） |
| unlock | 全部六個倖存者（`effect.kind = "unlock"`） |
| training | #1（唯讀資訊，不加速） |
| scouting | #2 ❌ |
| economy | #7 ✅ / #8 ❌ |
| MOBA | #3 #4 |
| CS | #5 #6 |
| management | #7 #8 |
| generic | #1 #2 |

### 兩個 REJECT 的理由

**#2 `general_scout_support`** —— 球探線已經有 `management_scout_network`（3 階，
`scoutDaysReduction`）＋ `coach_scouting`，而該 kind 的 cap 是 2、兩個來源合計已達 4。
它剩下能做的只有「人才比較深度」，而那正是**會滑向改變人才池**的方向
（`genProspects({ scoutNetworkRank })` 已經是一稿兩用的前例）。
加上它掛在 `general` 線卻宣告 scope「球探」，分類本身就是錯的。
⇒ **移除節點**；若日後真要做新秀比較 UI，掛在 management 線並且明文只做並排顯示。

**#8 `management_finance`** —— 現金預測（`cashForecast()` / `forecastWeeks()`）
**已經是免費且無條件顯示**的功能：首頁的資金提醒卡就是它，破產週數也在。
把玩家現在免費看得到的東西改成要花發展點解鎖，是**功能倒退**，不是新內容。
⇒ **移除節點**。真正缺的是「錢的出口」，那是 Facilities 的題目（§6），不是解鎖。

---

## 2. Capability Saturation Review

### 現況（四個 kind，兩個來源，前三個已超供）

| kind | policy cap | Team Development 最大 | Coach 最大 | 合計 | 狀態 |
|---|---|---|---|---|---|
| `trainingDaysReduction` | **2** | 3 | 1 | 4 | 🔴 超供 200% |
| `dailyRecoveryBonus` | **8** | 12 | 4 | 16 | 🔴 超供 200% |
| `scoutDaysReduction` | **2** | 3 | 1 | 4 | 🔴 超供 200% |
| `unlocks` | 無（union） | 6 旗標 | 2 旗標 | 8 | 🟢 冪等，天然無衝突 |

### 四個選項的評估

| 選項 | 評估 |
|---|---|
| **A. 保持 cap，future nodes 改為 unlock / sidegrade / information** | ✅ **採用**。`unlocks` 是聯集、冪等、無上限——天生就是「多一個來源不會壞」的欄位。六個倖存者全部走這條，**不需要動 policy 一個字**。 |
| B. 新增 capability kind | ❌ 本輪不需要。新增 kind 的真實成本不在型別，而在**新的消費端**（沒有讀取點的能力＝假效果，正是 TD-56 之前那 8 個 future node 候選的狀態）。留給 Facilities 的容量題（§6）。 |
| C. 重設既有節點 effect | ❌ 會改變已發布玩家的既有投資語意。TD-56 才剛讓玩家第一次真的能買，立刻改掉效果是最糟的時機。 |
| D. 部分 future nodes 不應啟用 | ✅ **部分採用**：#2 與 #8 REJECT（理由見 §1）。 |

### 為什麼堅持「不是純數值疊加」

發展樹要提供的是**選擇**，不是「把所有加成堆滿」。目前的結構已經證明這件事：

- 前三個 kind 都被 cap 夾住 ⇒ 投第 3 階的邊際效益是 **0**。
- 玩家真正的選擇其實發生在 `unlocks`：要先看到對手選角，還是先看到合約到期？
- ⇒ 擴充應該加深**選擇**，不是加高**數字**。六個 unlock 節點正好各自回答
  一個不同的問題（成長前瞻／戰術傾向／賽前總覽／贊助機會）。

---

## 3. Online Fairness Contract

### Audit：能力到底有沒有跨越邊界

| 檔案 | 提到 capability／teamDevelopment 的次數 |
|---|---|
| `contracts/matchEntry.js`（`MatchEntryRequest.v1`） | **0** |
| `contracts/matchSquad.js`（`MatchSquad.v1`） | **0** |
| `contracts/matchmaking.js` | **0** |
| `matchmaking/mockGateway.js` | **0** |

而 `MatchEntryRequest.v1` 的檔頭已經明文寫著同一條原則：

> ① **只送身分，不送數值**。送出：playerId / seat / role / 名單分層 / 隊伍版本。
> 不送：能力值、體力、傷害、戰力、等級、評分。**伺服器拿 playerId 自己查真實資料。**

而且它是**被強制的**，不只是註解：`FORBIDDEN_VALUE_KEYS` 會遞迴掃描整張申請單，
出現 `stats / power / rating / lv / xp / energy / morale / condition / damage / derived / ovr / score`
任何一個就拒絕。`rosterVersionOf()` 的雜湊也刻意**只含身分與編制**，
不含能力數值 ⇒ 練功、升級、狀態變化都不會改變版本。

### 推薦的 Online Policy（本輪只定義，不實作）

**`ONLINE_FAIRNESS_CONTRACT = CAREER_OWNS_ROSTER, ONLINE_OWNS_MATCH`**

1. **Career 決定玩家擁有什麼**：roster 成員、選手能力、club progression、
   已解鎖的資訊。這些是生涯成果，線上比賽照常使用。
2. **Career-only passive modifier 不得作為 Online Match modifier。**
   `trainingDaysReduction`／`dailyRecoveryBonus`／`scoutDaysReduction`／未來的設施容量
   一律 `careerOnly` —— 它們影響「你怎麼把隊伍養起來」，**不影響單場比賽的結算**。
3. **線上最終戰力只由出賽名單快照 ＋ online fairness rules 決定**，
   由伺服器以 playerId 自行查證，客戶端提交的任何數值一律拒收。
4. 純外觀資產一律 `cosmeticNeutral`，永遠與戰力無關。

### 此原則是否符合目前架構

**符合，而且大部分已經被強制。** 逐條核對：

| 原則 | 現況 | 判定 |
|---|---|---|
| 能力不得跨越邊界 | 四個邊界檔案 0 引用；`FORBIDDEN_VALUE_KEYS` 遞迴擋下 | ✅ 已成立且已強制 |
| 有 capability 的資產必須 careerOnly | `coachCatalog` validator 硬規則：「有 capability 就必須是 careerOnly」 | ✅ 已成立 |
| 純外觀 = cosmeticNeutral | `identityCatalog` 全部標註 | ✅ 已成立 |
| 名單版本不受能力影響 | `rosterVersionOf()` 只含 id ＋ tier ＋ 席位 | ✅ 已成立 |

### ⚠ Architecture gaps（**列出，不自行修改**）

**GAP-1：`SquadSnapshot` 不是一個實作出來的契約。**
全庫只有 `coachCatalog.js` 的註解提到這個名字。實際存在的是
`MatchSquad.v1`（陣容合法性）與 `MatchEntryRequest.v1`（出賽申請＋快照欄位）。
⇒ 要嘛把 `SquadSnapshot` 正式定義成那個快照的名字，要嘛統一改用既有名稱。
**現在兩邊都在講同一件事卻沒有同一個名字，是未來最容易接錯的地方。**

**GAP-2：能力不跨邊界，但能力的「後果」已經烘進 roster。**
這是唯一一個原則擋不住的路徑：

```
trainingDaysReduction → 選手成長更快 ─┐
scoutDaysReduction    → 更好的新秀池 ─┴→ roster 本身變強 → 線上戰力
```

伺服器查 playerId 拿到的是**已經被生涯加成養大的**能力值。契約沒有被違反
（沒有任何 modifier 被送出），但「生涯養成的名單在線上算不算公平」
**這個產品問題還沒有答案**。可能的政策方向（本輪不裁示）：
① 接受（career-progression 遊戲的常態）② 線上分級／配對帶入 roster 強度
③ 線上使用標準化名單。

**GAP-3：沒有 verifier 守這條線。**
`FORBIDDEN_VALUE_KEYS` 守的是「申請單裡不能有數值」，但**沒有任何測試**
斷言「capability 不得出現在邊界檔案」。今天是 0 引用，明天有人加一行就破了，
而且不會有紅燈。⇒ 建議加一支 `check_online_fairness_boundary.mjs`（純靜態掃描，
不動 CBR／Rating／MatchBand）。

---

## 4. Adopted Node Proposal（**ADOPTED_NODES = 6**）

共同規格：`costPerRank: 1`、`maxRank: 3`（保留三階外觀）、**`activeLevelCap: 1`**
（只開放第一階，與既有 live 資訊節點同形；二三階維持「未來」，誠實標示）。
`effect.kind` 一律 `unlock` ⇒ **不新增 capability kind、不動 policy cap**。

---

### N1

```
NAME                 = 成長支援
CATEGORY             = general / advanced（information・training）
COST                 = 1 點（開放第 1 階）
PREREQUISITE         = general_recovery ≥ 1（維持原圖，不改前置）
PLAYER_FACING_EFFECT = 解鎖「選手成長空間」：每位選手還能成長多少、
                       目前處於生涯哪個階段、誰接近退役
TECHNICAL_EFFECT     = unlock 旗標 growthPlanning；讀取端組合既有純函式
                       potentialSpaceFactor() / careerStage / retirement intent /
                       growthLogOf()——不新增任何計算
ONLINE_EFFECT        = 無。純資訊，careerOnly
OVERLAP_RISK         = 🟠 與 coach_tactical 的 dataAnalysis 相鄰。
                       分界：dataAnalysis = 比賽**回顧**；本節點 = 成長**前瞻**。
                       兩者不得顯示同一組數字
IMPLEMENTATION_STATUS= NEEDS_CONSUMER（資料 100% 齊備，缺一個面板）
```

### N2

```
NAME                 = MOBA 戰術傾向
CATEGORY             = moba / advanced（information）
COST                 = 1 點
PREREQUISITE         = moba_draft_intel ≥ 1
PLAYER_FACING_EFFECT = 賽前顯示「這套戰術過去打這類對手的表現」
TECHNICAL_EFFECT     = unlock 旗標 mobaTacticInsight；讀取端讀既有
                       seasonData.analytics() 與 clubMastery 的 tacticUsage 計數
ONLINE_EFFECT        = 無
OVERLAP_RISK         = 🔴→🟢 **原設計「擴充戰術選項」必須放棄**——解鎖戰術
                       是 Club Mastery（tacticVariant）的責任，兩個系統都能
                       解鎖戰術會直接製造第二套 authority。改為只做**歷史表現顯示**
IMPLEMENTATION_STATUS= NEEDS_CONSUMER
```

### N3

```
NAME                 = MOBA 賽前總覽
CATEGORY             = moba / specialty（information capstone）
COST                 = 1 點
PREREQUISITE         = moba_opponent_research ≥ 1 ＋ moba_tactical_prep ≥ 1
PLAYER_FACING_EFFECT = 一頁看完：對手選角傾向 ＋ 我方戰術傾向 ＋ 陣容狀態
TECHNICAL_EFFECT     = unlock 旗標 mobaMatchOverview；**不引入新資料**，
                       只把三個已解鎖節點的既有資訊聚合成一個面板
ONLINE_EFFECT        = 無
OVERLAP_RISK         = 🟢 低。它的價值就是「聚合」，本身不產生新事實
IMPLEMENTATION_STATUS= NEEDS_CONSUMER
```

### N4 / N5 —— CS 對稱

```
NAME                 = CS 戰術傾向 ／ CS 賽前總覽
CATEGORY             = cs / advanced ／ cs / specialty
COST                 = 各 1 點
PREREQUISITE         = cs_team_drill ≥ 1 ／ cs_demo_analysis ≥ 1 ＋ cs_tactical_prep ≥ 1
PLAYER_FACING_EFFECT = 地圖別的戰術歷史表現 ／ 一頁看完地圖＋對手＋團隊狀態
TECHNICAL_EFFECT     = unlock 旗標 csTacticInsight ／ csMatchOverview；
                       讀取端掛 CsTacticScreen，資料源為既有 csHistory 與 mapFit
ONLINE_EFFECT        = 無
OVERLAP_RISK         = 同 N2 / N3。CS 特色在**地圖維度**（MOBA 沒有），
                       這正是兩條線該有的差異，不是重複
IMPLEMENTATION_STATUS= NEEDS_CONSUMER
```

### N6

```
NAME                 = 贊助拓展
CATEGORY             = management / advanced（information・economy）
COST                 = 1 點
PREREQUISITE         = management_contracts ≥ 1
PLAYER_FACING_EFFECT = 簽約前看得到各贊助商的週收入、簽約金與合約長度比較
TECHNICAL_EFFECT     = unlock 旗標 sponsorInsight；讀既有 SPONSORS 型錄與
                       activeSponsor。**不改任何贊助條件、不提高收入**
ONLINE_EFFECT        = 無
OVERLAP_RISK         = 🟠 Facilities 若日後做「贊助等級」會撞號。
                       分界寫死：本節點只做**比較顯示**，任何改變贊助條件的
                       設計都不屬於 Team Development
IMPLEMENTATION_STATUS= NEEDS_CONSUMER
```

### 被 REJECT 的兩個

```
general_scout_support   REJECT — 球探線已飽和；「人才比較深度」會滑向改人才池
management_finance      REJECT — 現金預測已是免費且無條件顯示，改成付費解鎖是倒退
```

⇒ 建議把這兩個節點**從節點表移除**，而不是留著標「規劃中」——
留著會讓玩家以為還有東西可買，也會讓下一個人再問一次同樣的問題。
移除後 `general` 與 `management` 兩條線各剩 4 個節點（目前是 5 個），
路線圖 stepper 需相應調整（UI 已支援任意節點數）。

---

## 5. Progression Projection（實跑，未改供給表）

供給表沿用 TD-56 已發布的版本：種子 1 ＋ 等級里程碑 8（Lv 4/6/8/10/13/16/19/22）
＋ 每個生涯賽季 2 點，累計夾在 `TEAM_DEVELOPMENT_TOTAL_BUYABLE`（由節點表推導）。

| 方案 | 可購買總點數 | S1 | S3 | S5 | S7 | S10 | 全樹達成 |
|---|---|---|---|---|---|---|---|
| **現況**（8 個候選都未啟用） | 18 | 4／5 | 9／11 | 14／16 | 18／18 | 18／18 | **S7／S6** |
| **採用案**：6 個 ×1 階 | **24** | 4／5 | 9／11 | 14／16 | 19／21 | 24／24 | **S9／S9** |
| 8 個 ×1 階 | 26 | 4／5 | 9／11 | 14／16 | 19／21 | 26／26 | S10／S10 |
| 8 個 ×2 階 | 34 | 4／5 | 9／11 | 14／16 | 19／21 | 26／27 | S14 ❌ |
| 8 個 ×3 階（滿階） | 42 | 4／5 | 9／11 | 14／16 | 19／21 | 26／27 | S18 ❌ |

（每格「A／B」= 單項休閒 14 官方賽/季 ／ 雙項主線 28 官方賽/季，勝率 50%）

### 對照判準

| 判準 | 採用案結果 |
|---|---|
| 第一季仍有 meaningful choices | ✅ **S1 = 4／5 點，與現況一字不差** |
| 不會太快全滿 | ✅ S5 仍只有 14／16 ／ 24 |
| 不會 10+ 季仍走不完 | ✅ **S9**（滿階方案的 S14／S18 正是因此被否決） |
| 不破壞既有供給曲線 | ✅ **S1／S3／S5 三個數字完全不變**——上限只在後段才咬得到 |
| 不先改 Development Point source | ✅ 供給表一個常數都沒動 |

**關鍵觀察**：因為上限是**由節點表推導**的（TD-56 刻意這樣設計），
啟用採用的 6 個節點**不需要動供給表的任何一行**，上限自己就會變大。
早期曲線完全不受影響，只是把 S6–S10 的內容真空填掉。

---

## 6. Facilities Decision

```
FACILITIES_NEXT = DEFER
```

| 問題 | 回答 |
|---|---|
| 是否仍有獨立產品價值 | **有，但不是現在。** 唯一無法被 Team Development 取代的價值是「**Funds 的出口**」與「**容量**（同時訓練人數、名單／青訓席位、每日競技容量）」——這兩件事發展樹確實都不做 |
| 是否只是 Team Development 重複 | **若做成加速／加成就是重複**（前三個 kind 已超供）。做成容量與經營成本才不是 |
| 是否應使用 Funds | **是。** Funds 目前唯一的出口只有續約與簽新秀，sink 缺口明確；Club Points 已是教練＋識別的貨幣，再加大 sink 會稀釋既有選擇 |
| 是否適合有 weekly operating cost | **是，而且這正是它的核心機制**——「蓋了就要養」是目前經濟層完全缺席的負回饋，也是讓 Funds 真正變成資源的方式 |
| 是否需要新 capability | **是。** 容量類效果（`concurrentTrainingSlots`、`rosterCapBonus`、`competitiveBlockBonus`）目前**一個都不存在**，而且每一個都要有新的消費端。這是 Facilities 真正的工作量所在 |
| 是否應等 Online Fairness implementation 後再做 | **是。** 容量會讓 GAP-2 那條「生涯加成 → roster 變強」的路徑變粗（同時訓練更多人＝養得更快）。在沒有 roster provenance 政策之前先蓋設施，等於在未定案的地基上疊一層 |

**DEFER 的具體條件**（滿足後重新評估）：
1. Team Development Expansion v1 已上線（本檔的 6 個節點）——先確認 S6–S10 的內容真空被填掉。
2. Online Fairness Contract 已有 named contract ＋ verifier（GAP-1、GAP-3 關閉）。
3. Owner 對 GAP-2（生涯養成名單在線上是否公平）做出裁示。

---

## 7. UI / UX

依 `docs/design/ESMO_UIUX設計原則.md`：

- **不建第三棵樹。** 六個節點**沿用現有 Team Development 畫面**——它們本來就在
  節點表裡、本來就在路線 stepper 上，只是從「規劃中」變成「可投入」。
  UI 層**零新結構**。
- 六個 unlock 各自對應一個**資訊面板**，形式沿用既有的
  `dataAnalysis` 面板（`team-development-data-analysis` 那一塊）——同一種卡片、
  同一種標題、同一種留白。
- **Progressive disclosure**（§1）：面板預設收合，標題一行說明它給什麼；
  詳細數字點開才看。**不得**因為多了六個面板就讓戰隊發展主畫面變成長清單。
- ⚠ Owner Review 已 DEFER 的 ③（Available Points 字級）④（節點卡密度）
  **在本輪仍然 DEFER**。但要注意：六個新面板會讓 ④ 的密度問題更明顯，
  ⇒ **實作 Expansion 時應把 ④ 一起排進去**，否則會把已知問題放大。
- 玩家端一律遊戲語言：講「成長空間」「戰術傾向」「賽前總覽」「贊助比較」，
  不出現 unlock / flag / consumer / capability。

---

## 8. Scope（本輪未做，也不應做）

未修改：CS runtime、CBR、Rating、MatchBand、Retention economy、Club XP curve、
Development Point supply、Codex worktree、節點表本身。

**沒有任何一個節點達到 `READY`**（＝消費端已存在、只差 wiring）：六個倖存者
的資料都齊備，但**讀取點（面板）一個都還不存在**，所以全部是 `NEEDS_CONSUMER`。
依 §8 規則，本輪不開始實作。

---

## 9. 建議的下一個實作 Sprint

**`Team Development Expansion v1` 實作**，範圍：

1. 節點表：6 個 future → `activeLevelCap: 1` ＋ `effect: { kind: "unlock", flag: ... }`；
   移除 REJECT 的 2 個。
2. 六個資訊面板（沿用既有面板形式，progressive disclosure）。
3. 一併處理 Owner Review ④（節點卡密度）——見 §7。
4. **附帶一支小 verifier `check_online_fairness_boundary.mjs`**（純靜態掃描：
   capability 不得出現在四個邊界檔案），關閉 GAP-3。它不動 CBR／Rating／MatchBand，
   風險極低，但把本檔 §3 的契約從「文件」變成「會紅燈的規則」。

預估：節點表與供給上限**零風險**（上限自動推導、早期曲線實測不變），
工作量集中在六個面板的 UI 與各自的資料聚合。

---

## 10. Owner Review 裁示（2026-09-05）—— GO

本節是 Owner 的正式裁示紀錄。**與前文衝突時以本節為準。**

### 10.1 命名與採用範圍

```
FUTURE_NODE_CANDIDATES            = 8   ← 候選數（歷史事實）
ADOPTED_NODES                     = 6   ← 本次要實作的數量
REJECTED_NODES                    = 2
TEAM_DEVELOPMENT_FULL_TREE_POINTS = 24
FULL_TREE_ETA                     = 約 Season 9
```

兩個 REJECT 已接受：`general_scout_support`、`management_finance`。

⚠ **不得為了維持 8 個而補新的節點。** 發展樹縮成 18 個節點是刻意的結果，
不是待補的缺口。`general` 與 `management` 兩條線各剩 4 個節點。

### 10.2 Online Fairness —— 產品原則已裁示

```
ONLINE_FAIRNESS_PRODUCT_POLICY          = DECIDED
ONLINE_FAIRNESS_ARCHITECTURE_IMPLEMENTATION = PENDING
```

**正式產品原則：`CAREER_OWNS_ROSTER` ／ `ONLINE_OWNS_MATCH`。**

Career **可以**決定：roster ownership、player development history、
club progression、roster composition。

Career-only passive modifiers —— Team Development、Coach、Facilities、
training／recovery／scouting modifiers —— **不得直接作為 Online Match modifier**。

**GAP-2 已被 Owner 正式確認並接受**：Career progression 已經會改變
player accumulated stats，因此**未來的 Online Competitive 必須自行建立
effective competitive power，不可無條件把 Career accumulated power
直接視為最終 Online power**。

該問題交由未來的 Online architecture 處理
（MatchSquad ／ snapshot ／ Cap ／ Bracket ／ Rating ／ normalization 等）。
**本輪不修改 CBR ／ Rating ／ MatchBand。**

GAP-1（`SquadSnapshot` 只有名字沒有實作）與 GAP-3（沒有 verifier 守邊界）
維持開放，GAP-3 建議在 Expansion Sprint 內以靜態掃描 verifier 關閉（§9）。

### 10.3 Facilities

```
FACILITIES_NEXT = DEFER
```

Owner 接受的理由：Facilities 真正的獨立價值應該是未來的
**Funds sink ／ weekly operating cost ／ infrastructure・capacity**，
而**不是再提供一套 Training ／ Scouting 數值加成**。本輪不開始 Facilities。

### 10.4 UI／UX 範圍

| Owner Review 項目 | 本輪狀態 |
|---|---|
| ③ Available Points hierarchy | **維持 DEFERRED** |
| ④ Node card density | **改為 IN SCOPE** |

④ 進入範圍的原因：節點卡已達 **11–13 行**，再加 6 個節點會放大既有的資訊密度問題。

⚠ 界線寫死：依 `docs/design/ESMO_UIUX設計原則.md`，
**只做 progressive disclosure ／ detail hierarchy，不要重新設計整個
Team Development 頁**。③ 不在範圍內，不得順手一起改。

---

## 11. Phase 0 — Consumer Feasibility Gate（Expansion Sprint 的進入條件）

Expansion Sprint **必須先通過本 Gate**，才可以開始 implementation。
逐一確認六個 adopted node，並分類。

**只有 `READY_TO_IMPLEMENT` 與 `CLAUDE_SAFE` 可以進入本 Sprint 的 implementation。**
若某個節點需要修改 Codex-owned CS runtime ⇒ **不實作，只記 dependency**。
其餘節點等 Expansion 完成後再重新評估。

### 分類定義

| 分類 | 意義 |
|---|---|
| `READY_TO_IMPLEMENT` | 消費端已存在，只差 wiring |
| `CLAUDE_SAFE` | 需要新讀取點，但完全落在 Claude 可安全修改的範圍 |
| `CODEX_DEPENDENCY` | 需要動 Codex-owned CS runtime ⇒ 只記依賴，不實作 |
| `ARCHITECTURE_REQUIRED` | 需要新 state／新 authority／migration |
| `REJECT` | 不做 |

### 逐節點評估

| 節點 | consumer 在哪 | 已有 authority | 需新增 state | 碰 CS runtime | 碰 Online | 碰 Finance/Training/Scouting | 需 migration | 可 deterministic verify | **分類** |
|---|---|---|---|---|---|---|---|---|---|
| **N1 成長支援** | `TeamDevelopmentScreen`（沿用 `dataAnalysis` 面板形式）或 PlayerDetail | ✅ `potentialSpaceFactor` `careerStage` `retirement` `growthLogOf` 皆為既有純函式 | ❌ | ❌ | ❌ | 讀 Training 結果，**不改** | ❌ | ✅ 純函式可 node 驗 | **CLAUDE_SAFE** |
| **N2 MOBA 戰術傾向** | `TacticScreen` | ✅ `seasonData.analytics()`、`clubMastery` tacticUsage | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **CLAUDE_SAFE** |
| **N3 MOBA 賽前總覽** | `BanPickScreen` 或 `TacticScreen` | ✅ 三個 live 節點的資料已解鎖，只是散落 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **CLAUDE_SAFE** |
| **N4 CS 戰術傾向** | `CsTacticScreen` | ✅ 既有 `csHistory`、`mapFit`；該檔**已經是 TD 消費端**（`csDemoAnalysis`） | ❌ | ⚠ **否**——`CsTacticScreen` 不在 Codex 的 CS runtime 禁區（禁區是 `EsportsFPS3D` / `fpsRoster` / `CsPrepScreen` / `CsLoadingScreen` / camera・POV・C4・audio・locomotion・route） | ❌ | ❌ | ❌ | ✅ | **CLAUDE_SAFE**（⚠ 見下方協調註記） |
| **N5 CS 賽前總覽** | `CsTacticScreen` | ✅ 同上 | ❌ | ⚠ 同上 | ❌ | ❌ | ❌ | ✅ | **CLAUDE_SAFE**（⚠ 同上） |
| **N6 贊助拓展** | `FinanceScreen`（已 import `resolveSponsor`）或戰隊發展面板 | ✅ `SPONSORS` 型錄、`activeSponsor`、`sponsors.js` | ❌ | ❌ | ❌ | 讀 Finance，**不改任何贊助條件或收入** | ❌ | ✅ | **CLAUDE_SAFE** |

### Gate 結論

```
READY_TO_IMPLEMENT    = 0
CLAUDE_SAFE           = 6
CODEX_DEPENDENCY      = 0
ARCHITECTURE_REQUIRED = 0
REJECT                = 2（已在 §1 排除，不計入 6）
```

- **沒有任何節點需要新增 state、新增 authority 或 migration。**
  六個都是 `unlock` 旗標 ＋ 讀既有純函式，發展點帳本、供給表、契約一律不動。
- **沒有任何節點需要修改 Codex-owned CS runtime** ⇒ `CODEX_DEPENDENCY = 0`。
- 六個都可 deterministic verify（純函式輸入輸出 ＋ 靜態掃描 ＋ browser gate）。

⚠ **N4／N5 的協調註記**：`CsTacticScreen.jsx` 不在 Codex 的禁區清單內
（禁區是 `EsportsFPS3D` / `fpsRoster` / `CsPrepScreen` / `CsLoadingScreen`
與 camera・POV・C4・audio・locomotion・route），而且它**本來就已經是
Team Development 的消費端**（`csDemoAnalysis` 旗標的讀取點在這支檔案裡）。

2026-09-05 的協調檢查（**只讀 commit metadata，未讀取檔案內容、未整合任何東西**）：
`cs/android-owner-review-v2` 上最後一個碰到這支檔案的 commit 是 `9646786`，
**與 main 相同** ⇒ Codex 在它未發布的工作裡**沒有改過** `CsTacticScreen.jsx`。

⇒ N4／N5 維持 `CLAUDE_SAFE`。但依 `AGENTS.md` §10「不得讓多個 agent 同時改同一區」，
**開工當下仍應重跑一次這個檢查**（Codex 隨時可能新增 commit）。
若屆時撞期 ⇒ 把 N4／N5 降級為 `CODEX_DEPENDENCY` 並延到下一輪，
N1／N2／N3／N6 不受影響、可獨立完成。

### Sprint 進入條件（全部滿足才開工）

1. ✅ Owner Review 裁示已記錄（本檔 §10）。
2. ✅ Phase 0 Gate 已完成分類（本節）。
3. ⬜ 開工當下再確認一次 Codex 是否正在改 `CsTacticScreen.jsx`。
4. ⬜ `git fetch origin` 確認基線。
