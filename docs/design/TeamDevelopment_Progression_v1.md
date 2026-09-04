# Team Development Progression v1（TD-56）

> 建立日期：2026-09-04
> 基線：`origin/main` = `7cb202d3201cd0f27279bec6310e5c46286b237a`
> 分支：`feature/team-development-progression-v1`（**未 push、未部署**）
> 驗證器：`tools/check_team_development_progression_v1.mjs`
>
> 本檔是 TD-56 的產品設計與實測紀錄。handoff 文件（`00/05/06/08`）本輪
> **刻意不動**——Codex 的 CS Android Owner Review V2 很可能也會改它們，
> 正式 Release 整合最新 main 之後再補 handoff final state。

---

## 1. 根因：發展點沒有來源

Audit 的結論只有一句話：

> 全庫唯一會寫 `teamDevelopment.availablePoints` 的地方是
> `purchaseTeamDevelopment()`，而它**只會減**。

| 項目 | TD-56 之前的事實 | 位置 |
|---|---|---|
| 唯一的點數入口 | `sanitizeTeamDevelopment(null, 1)` ⇒ **一份存檔一輩子 1 點** | `profileStore.js` `DEFAULT.teamDevelopment` |
| 舊存檔的入口 | `saved.meta?.talentPending ?? 1`（一次性回退） | `profileStore.js` load |
| 發放路徑 | **不存在**。沒有任何比賽／賽季／里程碑會給點 | — |
| 發展樹可購買總量 | **18 點**（12 個已接讀取點的節點；8 個 `future` 節點目前價值 0） | `teamDevelopment.js` |

⇒ 玩家能拿到 1 點，樹要 18 點。**發展樹在主幹上等於沒有開放。**

節點明細（`activeLevelCap` 之內才算得到）：

| 分類 | 節點 | 可買點數 |
|---|---|---|
| 通用 | 訓練流程優化 3、恢復中心 3、數據分析室 1、成長支援 0*、球探支援 0* | 7 |
| MOBA | 英雄研究室 1、Ban/Pick 情報 1、對手研究 1、戰術準備 0*、賽前分析 0* | 3 |
| CS | 地圖研究室 1、團隊磨合 1、Demo／對手分析 1、戰術準備 0*、賽前情報 0* | 3 |
| 經營 | 球探網絡 3、青訓資料庫 1、合約管理 1、贊助拓展 0*、財務規劃 0* | 5 |
| | **合計** | **18** |

`*` = `future: true`，尚未接上讀取點。發點給它們等於發花不掉的點。

---

## 2. 供給表（實測後選定：混合模式 C）

```
發展點 = 生涯起始 1 點
       ＋ 俱樂部等級里程碑 Lv 4/6/8/10/13/16/19/22（各 1 點，上限 8 點）
       ＋ 每完成 1 個生涯賽季 2 點
       （累計發放夾在「發展樹目前能吸收的量」以內）
```

住在 `src/platform/development/developmentPoints.js`。

### 為什麼不是單一來源

先各自實跑投影，再決定（原始數據見 §3）：

| 候選 | 早期節奏 | 全樹 ETA | 致命問題 |
|---|---|---|---|
| **A 純 Club Level** | 好（第 2–3 週就有第一點） | 主線玩家 **10 季內走不完** | 里程碑密度要拉高才走得完，一拉高就**擋不住刷分**：重度玩家一季 Lv19 |
| **B 純賽季 milestone** | 差（第一點要等第一季結束＝84 天） | 6 季（每季 3 點） | 前 84 天玩家看不到任何進度 |
| **C 混合（採用）** | 好 | 6–7 季 | — |

三個來源各守一件事：

- **起始 1 點** — 沿用既有種子值 ⇒ **新存檔開局行為一個字都沒變**。
- **等級里程碑（有上限 8 點）** — 負責早期節奏。刷分能讓你**早**拿到這 8 點，
  但拿不到第 9 點。上限就是防刷的機制本身。
- **賽季 2 點／季** — 負責長期骨幹，而且**刷不動**：一個賽季是 84 個世界日，
  世界日只由訓練／休整／賽程推進（`time/worldClock.js` `WORLD_TIME_COST`），
  比賽本身一天都不加。⇒ 節奏由日曆決定，不由場次決定。

### 快速練習 = 0 點（結構保證，不是特例判斷）

沒有任何 `if (practice)`。練習拿不到點是因為兩個來源都動不了它：

| 來源 | 練習的值 | 出處 |
|---|---|---|
| Club XP | `practice: 0` | `clubProgression.CLUB_XP_AWARD` |
| 世界日 | `practice: 0` | `worldClock.WORLD_TIME_COST` |

驗證器 §8 實跑 500 場快速練習，發出 0 點，並斷言供給表原始碼裡沒有
`practice` 這個字——**這樣它不會在未來被某個人忘記維護**。

---

## 3. 投影（實跑，非估算）

賽程供給以真實 `buildRegularSeason()` 產出量測：**每個項目每季 14 場**
玩家自己的常規賽（8 隊雙循環 = 56 場賽程，玩家佔 14 場），第一場在第 6 天，
之後約每 6 天一場。Club XP：正式賽 150、一般對戰 60，勝利 ×1.5（勝率取 50%）。

### 每季累計發展點

| 玩法檔案 | 第一個賺到的點 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | 全樹 18 |
|---|---|---|---|---|---|---|---|---|---|
| A 單項休閒（MOBA 聯賽，不打一般對戰） | 第 18 天 / **W3** | 4 | 7 | 9 | 12 | 14 | 17 | 18 | **S7** |
| B 雙項主線（MOBA+CS 聯賽） | 第 12 天 / **W2** | 5 | 8 | 11 | 13 | 16 | 18 | 18 | **S6** |
| C 雙項＋輕度一般對戰（每週 3 場） | 第 6 天 / W1 | 5 | 9 | 12 | 14 | 17 | 18 | 18 | **S6** |
| D 重度刷分（每日打滿 3 場一般對戰） | 第 3 天 / W1 | 8 | 11 | 13 | 15 | 17 | 18 | 18 | **S6** |

### 對照目標

| 目標 | 結果 | |
|---|---|---|
| 第一個 meaningful upgrade 約 Career Week 2–4 | 起始點 **第 1 天**即可投入（既有行為）；第一個**賺到的**點 W2–W3 | ⚠ 見 §7 |
| 第一季有數次真正選擇 | S1 = **4–8 點** | ✅ |
| 完整 tree 不可一季畢業 | 最重度刷分 S1 = **8 / 18** | ✅ |
| 完整 progression 約 4–8 seasons | **S6–S7** | ✅ |
| 刷分不得明顯超車 | D 在 S1 領先主線 3 點，S6 完全收斂 | ✅ |

---

## 4. Development Points 的邊界

明文與既有資源分離，四者互不換算：

| 資源 | 權威 | 與發展點的關係 |
|---|---|---|
| **Development Points** | `teamDevelopment.availablePoints` ＋ `grants` 帳本 | 本檔 |
| Club Points（可花餘額） | `retention.clubPoints` | **無關**。發展點不消耗它、不由它產生 |
| Club Points Lifetime | `retention.clubPointsLifetime` | **無關**（那是 Prestige Tier／購買資格） |
| Club XP | `clubProgression.xp` | **單向讀取**：發展點讀它推導等級，**絕不寫它** |
| Funds（資金） | `finance.funds` | **無關**。發展點不可用錢購買 |

- 不可用真實貨幣購買（沒有任何付費入口）。
- 快速練習 0 點。
- **不每場比賽直接發**：比賽只推 Club XP，發點的是里程碑。

---

## 5. 實作：為什麼是帳本，不是「重算餘額」

餘額**會被花掉**。所以它不可能由 Club Level 反推——玩家一買節點，重算就會
把花掉的再發一次。因此存的是「**哪一筆已經發過**」：

```jsonc
teamDevelopment.grants = {
  "seed": 1,
  "level:4": 1, "level:6": 1,
  "season:1": 2, "season:2": 2
}
```

- **冪等鍵 = 里程碑本身** ⇒ 同一筆不可能發兩次。
- 重讀存檔、重整、重複呼叫 ⇒ 帳本已有該鍵 ⇒ 什麼都不做。
- 因此可以在多個入口安全呼叫：**多呼叫沒有代價，漏呼叫才有**。

### 對帳入口（四處，全部冪等）

| 入口 | 位置 | 為什麼在這裡 |
|---|---|---|
| 載入／開新局／reset | `profileStore.js` `withDevelopmentPoints()` | 舊存檔一次補齊整段生涯應得的點 |
| 賽後結算 | `progress/applyMatchProgress.js` | 這一場推過等級里程碑時立刻入帳；**繼承既有的 `processedMatchTransactions` 冪等** |
| 推進世界日 | `profileStore.js` `advanceDay()` | 跨賽季邊界時賽季獎勵到期 |
| 投入前安全網 | `profileStore.js` `purchaseTeamDevelopment()` | 萬一漏了一個寫入點，玩家不會看到「點數不足」而其實已經賺到 |

### 舊存檔遷移：不加也不減

TD-56 之前的存檔把已發總量記在餘額裡（`availablePoints + spentPoints`）。
遷移只是把那筆總量**拆進帳本認列**：

- 前 1 點認列成 `seed`（不先認列的話，對帳時會再發一次 ⇒ 每個老存檔平白多一點）
- 超出的部分認列成 `legacy`（例如舊 `meta.talentPending` 給過 3 點的存檔）
  ⇒ **老玩家一點都不會被收回**

之後才進入正常對帳，把整段生涯應得的點一次補齊。

### 上限：不發花不掉的點

累計發放夾在 `TEAM_DEVELOPMENT_TOTAL_BUYABLE` 以內，而那個值**由節點表推導**，
不是手寫常數 ⇒ 8 個 `future` 節點日後接上讀取點時，上限自己就會變大。

⚠ 取捨：最後一筆會被削到剛好（樹只剩 1 格時，賽季的 2 點只發 1 點），
被削掉的那一點**不會回來**。這比讓玩家看到「可用 1 點但沒東西可買」好，
而且不影響任何人走完整棵樹（賽季獎勵每季都還會來）。

---

## 6. UI（依 `docs/design/ESMO_UIUX設計原則.md`）

戰隊發展主畫面的三層：

| 層 | 內容 |
|---|---|
| 第一層 | 可用發展點、已投入點數、四條路線的節點（＝玩家現在要做什麼） |
| 第二層 | **下一個發展點**：兩張小卡（「俱樂部升到 Lv.N，還差 X 級 → +1 點」／「打完第 N 賽季，還有 X 天 → +2 點」） |
| 第三層 | 「發展點怎麼拿到的？」**預設收合**——完整規則、各來源累計、`累計獲得 N / 18` |

玩家端一律遊戲語言：講「俱樂部等級」「賽季」「發展點」，
不出現 grant / ledger / reconcile / authority / canonical。
驗證器 §11 以正則守住這一條。

---

## 7. 驗證

| 驗證 | 結果 |
|---|---|
| `tools/check_team_development_progression_v1.mjs`（新增） | **74/74 PASS** |
| `tools/browser_check_team_development_progression.mjs`（新增，桌機 1366px ＋ 手機 390px） | **51/51 PASS** |
| `npm run build` | ✅ built |
| `check_progress25` | ✅ PASS（Progress／Reward 是本輪動到的 Protected System） |
| `check_capability_authority` | ✅ 15/15 PASS |
| `check_club_assets_v1` | ✅ 105/105 PASS |
| `check_r61_ui_fixture` / `regress` / `regress2` / `check_flow09` / `check_dash10` | ✅ PASS |
| `check_team_development_v1` | ⬆ **RED → PASS**（修了三條過時斷言，見 §7.1） |
| `check_home_team_contract` | ❌ 3 條 FAIL —— **基線就是紅的**（在乾淨的 `7cb202d` worktree 重跑，同樣 3 條失敗），與 TD-56 無關 |

### 7.1 順手修好的既有紅燈：`check_team_development_v1`

這支在基線就是紅的（TD-56 之前即如此）。三條斷言都被後續 Sprint 的重構
淘汰掉了，判準本身是錯的，不是產品壞掉：

| 過時斷言 | 事實 | 改法 |
|---|---|---|
| `PROFILE_SCHEMA_VERSION = 10` | CS Season M0 已升到 11 | 改成下限比對 `>= 10`（與 `check_home_team_contract` 對齊）。schema 每升一版就要回頭改一次戰隊發展的驗證器，本身就是錯的判準 |
| 首頁必須有 `talent: "talentPick"` | 入口搬到 PlayerDetail →「天賦」，路由仍註冊在 `AppShell.jsx` | 改成在 AppShell 找路由註冊點。路由住哪是 IA 決定，不是本契約的範圍 |
| 訓練頁必須呼叫 `advanceTrainingDay` | Season vNext V1 之後改走 `advanceWorldDays(1, { reason: training })` | 兩個名字都接受。契約守的是「訓練仍推得動同一個時鐘」，不是舊名字 |

**沒有放寬任何一條的意圖**，只是把「認名字」改成「認契約」。

---

## 8. 已知取捨與待決事項

### 8.1 起始 1 點 = Onboarding 發展點（Owner 已裁示，2026-09-04）

**裁示結果：保留** fresh save 的初始 1 點，並把它的產品定義寫死為
**「初始／Onboarding 發展點」——它不是生涯 earned progression 的一部分**。

因此本檔對兩個 ETA 的定義是分開的，兩者都不算偏差：

| 指標 | 值 | 定義 |
|---|---|---|
| 第一次可投入 | 生涯第 1 天 | Onboarding 點：讓新玩家一進戰隊發展就有一個真的選擇可做，不是空畫面 |
| **第一個 earned 發展點** | **生涯第 2–3 週** | 這才是 pacing 目標所指的那一個，維持不變 |

⇒ 供給演算法與點數曲線（§2 的混合模式 C）**不調整**。

### 8.2 ONLINE_FAIRNESS_REVIEW_REQUIRED = YES

目前主幹**沒有線上競技場**：`matchmaking/mockGateway.js` 是本機決定性 stub，
沒有 rating、沒有 CBR、沒有天梯。所以 TD-56 是純 **Career progression
entitlement**，本輪也**沒有動** CBR / Rating / CS runtime（一行都沒有）。

但必須留紀錄，因為 TD-56 讓兩個**原本幾乎拿不到**的能力變成真的拿得到：

| 能力 | 讀取點 | 為什麼是公平性議題 |
|---|---|---|
| `scoutDaysReduction` | `RecruitScreen` → `genProspects({ scoutNetworkRank })` | **一稿兩用**：除了縮短球探天數，還會改變新秀分布（超新星權重 5 → 8.6、特殊個體 26% → 35%）⇒ 影響**簽得到多好的人** ⇒ 名單強度 |
| `trainingDaysReduction` | `profileStore` 訓練排程 | 加快選手能力成長 ⇒ 名單強度 |

兩者都經 `clubCapabilities.CAPABILITY_POLICY` 夾上限（各 cap 2），
而且人才池只吃 `sources.teamDevelopment`（買教練不會讓你抽到更好的人）。

⇒ **線上競技上線前，必須先決定 Career capability 是否計入線上戰力。**
本輪不做這個決定，只把它標記出來。

### 8.3 本輪未做

- 未擴充發展樹節點內容（8 個 `future` 節點仍是 0 點）。
- 未動 handoff 文件（見檔頭）。
- 未 push、未部署。
- CS runtime / `EsportsFPS3D.jsx` / `fpsRoster.js` / `CsPrepScreen.jsx` /
  `CsLoadingScreen.jsx` / camera / POV / C4 / audio / locomotion / route
  —— **一行都沒有動**。
