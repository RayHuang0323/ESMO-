# Cloud Save Boundary Audit（Backend Phase B1A）

> 2026-09-10．**盤點，不是實作。**本輪沒有安裝 Supabase、沒有改任何產品程式。
> 所有數字都是在這個 repo 上實跑量到的，不是估的。

---

## 0. 一句話

目前**只有一條真正的存檔路徑**（`profileStore.save()` → `localStorage["esmo.profile.v1"]`），
但**旁邊還有兩個各自獨立寫入的 store**（英雄熟練、對戰歷史），
三者之間**沒有交易、沒有版本、沒有協調的重置**——
這三件事就是 Cloud Save 真正要先解決的問題，而不是「怎麼接 Supabase」。

---

## 1. CURRENT_SAVE_ARCHITECTURE

### 1.1 全部的持久化出口（實測：只有 localStorage，沒有 IndexedDB / sessionStorage / cookie）

`grep localStorage[?].(get|set|remove)Item` 全域只命中 **8 個鍵、8 個寫入者**：

⚠ 掃的時候要**同時涵蓋 `localStorage.x` 與 `window.localStorage?.x` 兩種寫法** ——
只掃前者會漏掉 `mobaMapPresentation.js` 與 `debugMode.js`（我第一次就漏了）。

| 鍵 | 寫入者 | 內容 | 實測大小 |
|---|---|---|---|
| `esmo.profile.v1` | `platform/profileStore.js` | **生涯主存檔**（36 個 state 欄位） | 新局 **7,049 B**；挑戰紀錄灌滿後 **119,963 B** |
| `esmo.heroProgress.v2` | `hero/heroProgressStore.js` | 英雄熟練（10 隻，xp/level/mastery） | 初始 **1,160 B**（有界） |
| `esmo.season.v1` | `platform/seasonStore.js` | `BattleResult.v2[]`，上限 50 場 | **本輪未實測**（見 §5 風險 R7） |
| `esmo.quality.v1` | `battle/quality.js` | 畫質設定 | 極小 |
| `esmo.hud.mode.v1` | `battle/ui/hudStore.js` | HUD 模式 | 極小 |
| `esmo.timeline.mode.v1` | `battle/ui/BattleTimeline.jsx` | 時間軸顯示模式 | 極小 |
| `esmo.mobaMapPresentation` | `battle/moba/mobaMapPresentation.js` | 地圖呈現偏好 | 極小 |
| `esmo_debug` | `ui/debugMode.js` | 測試模式旗標 | 極小 |

其餘 90+ 個檔案的 `localStorage` 命中**全部是註解**
（「純函式：不 import React / zustand / localStorage」那一行），不是真的呼叫。

⚠ MOBA 重播（`replay/replayBuffer.js`）**刻意只在記憶體**，
理由寫在 `contracts/mobaReplay.js`：完整 frames 放不進 localStorage。

### 1.2 主存檔的形狀

- **寫**：`profileStore.save()` —— `localStorage.setItem(KEY, JSON.stringify({ ...get(), seasonStateV2, opponentDirectory: undefined }))`
  - 直接序列化**整份 store state**（函式會被 `JSON.stringify` 自然丟掉）
  - 檔案內 **84 個呼叫點**，每個動作自己負責呼叫
  - **沒有** autosave、**沒有** `beforeunload`、**沒有** `visibilitychange`
  - 整段包在 `try { } catch {}` ⇒ **寫入失敗會被靜默吞掉**
- **讀**：`load()` —— 一個**明確的白名單**，逐欄位 normalize/migrate（33 個欄位，含 `players`）
  - 白名單外的欄位**讀不回來**（例如 `opponentDirectory`、`competition` 別名）
  - 有 `schemaVersion`（`PROFILE_SCHEMA_VERSION`）與逐切片的 migration 註解

### 1.3 有沒有第二套 persistence？

**沒有第二套 framework，但有三個獨立的寫入者。**

- `challengeState.js` 檔頭已經明說設計原則：「不新增第二套 storage framework，
  也不新增第二個存檔鍵」——Player Challenge 就是照這條做的（切片放進 store）。
- 但 **`heroProgressStore` 與 `seasonStore` 是 Sprint08/09 時代先存在的**，
  各自有自己的 `persist.load/save`、自己的鍵、自己的觸發點
  （`useBattleFeed` 終局時各寫各的）。
- ⇒ 結論：**一套 pattern、三個獨立事務**。這不是「多套 persistence 架構」，
  但對 Cloud Save 來說後果一樣：**沒有一個地方可以原子地存下「玩家的全部進度」**。

---

## 2. CLOUD_SAVE_SCOPE（A：必須進 Cloud Save）

判準：**弄丟就無法重建、且定義「這個玩家是誰」**。

### 2.1 生涯本體

`manager`｜`team`｜`meta`（days / week / season / fans / 身分）｜`lineup`｜`csLineup`

### 2.2 名單與選手成長

`players[]` —— 能力、`xp`、`talentPoints`、`role`、`status`、`age`、
`contract`、`training`、`growthLog`（每人有上限 `GROWTH_LOG_CAP`）

### 2.3 訓練 / 合約 / 招募

`recruitment`（簽約憑證帳本）｜`scouted`｜`teamDevelopment`

### 2.4 俱樂部 / 資產 / 專精

`clubAssets`｜`clubProgression`（Club XP，等級是推導）｜`clubMastery`｜`retention`

### 2.5 經濟

`finance`（含 `transactions`，上限 30）｜`economy`（含 `formLog`，上限 20）｜`activeSponsor`

### 2.6 賽季 / 賽事帳本

`competitionByMode`｜`competitionHistoryByMode`（上限 20）｜`circuitHistory`（上限 20）
｜`circuitPointsLedger`｜`honors`（**無上限**，但一季只加幾筆）｜`csHistory`（上限 30）

### 2.7 ⚠ 冪等帳本（漏掉會導致雲端還原後重複發獎）

`processedMatchTransactions`｜`processedCompetitionAwards`｜`matchmaking.settlements`

> 這三個是**防重複入帳**的鍵。如果只還原「錢與名次」而不還原帳本，
> 玩家在另一台裝置重跑一次結算就能再領一次。**它們比金額本身更重要。**

### 2.8 Player Challenge

`challenge.defense`｜`challenge.lastPublishedCareerDay`｜`challenge.order`
｜`challenge.instances`｜`challenge.snapshots`

⚠ **但這一塊是容量主因**，見 §5 風險 R4 與 §6 的拆法建議。

### 2.9 跨鍵：英雄熟練

`esmo.heroProgress.v2` **必須上雲**。理由不是「它是進度」，而是：
- 熟練等級是**勝負的主要決定者**（271b31d 的實測結論）
- 它會被寫進 `SquadSnapshot.v1` 的 `combat.loadout` ⇒ 直接影響 Challenge 的公平性與重播
- 只有 1.16 KB、有界 ⇒ 上雲成本近乎零

### 2.10 版本

`schemaVersion`（目前**只有 profile 有**，見風險 R6）

---

## 3. LOCAL_ONLY_SCOPE（B：只需 Local Cache）

判準：**弄丟只影響體驗，不影響「我是誰、我練到哪」，或跨裝置本來就不該延續**。

| 項目 | 為什麼不上雲 |
|---|---|
| `esmo.quality.v1` / `esmo.hud.mode.v1` / `esmo.timeline.mode.v1` / `esmo.mobaMapPresentation` | **裝置能力偏好**。手機的畫質設定同步到桌機是幫倒忙 |
| `esmo_debug` | 測試旗標，永遠不該上雲 |
| `esmo.season.v1`（`BattleResult[]`，上限 50） | 展示用歷史。**不參與任何生涯數值**（獎金／排名／成長都各自有帳本）。弄丟＝歷史列表變空，生涯數字一個都不動 |
| `matchmaking.ticket` / `room` / `session` / `launch` / `fixtureAssignment` | **進行中的比賽**。載入時 `normalizeMatchmaking` 本來就會把 `queued`/`validating` 判成 `cancelled`（「沒有伺服器會回應它」）⇒ 跨裝置 resume 在語意上不成立 |
| `inbox` / `notifications` / `events` / `worldNews` | 可重生的提示流。⚠ `inbox` 的**已讀狀態**是弱邊界：不上雲的代價是換裝置後紅點重現，可接受 |
| `csMapPreferences` | 邊界案例。它是玩法偏好但綁存檔語意，**建議跟著 A 走**（極小，不值得為它多開一條規則） |

---

## 4. TRANSIENT_SCOPE（C：Runtime/UI，不能進 Cloud）

| 項目 | 性質 |
|---|---|
| `opponentDirectory` | Slice 8 的對手來源快取。**已經明確排除在 `save()` 之外**，而且 `load()` 白名單也沒有它 |
| `seasonStateV2` | **純推導**（`seasonStateV2For()` 由 `competition` + `competitionHistory` + `processedCompetitionAwards` + `meta` 算出）。存了也會在 `withIdentity()` 載入時被重算覆蓋 |
| `competition` / `competitionHistory` | `competitionByMode` / `competitionHistoryByMode` 的**別名投影**（`routeCompetitionWrite`）。目前會被寫進存檔但 `load()` 不讀 |
| `replayBuffer`（記憶體） | 只保留當前 session 最近一場的完整 frames |
| `battleStore` / `hudStore` runtime / `useGameStore` snapshot | 每 tick 變動的戰鬥狀態 |
| `heroProgressStore.lastDetail` / `lastRecordedKey` | 本場明細與防重複鍵，只有本 session 有意義 |

⚠ **C 類上雲的代價不是浪費，是製造第二個真相來源。**
把推導值存起來，遲早會出現「存檔裡的推導值」與「重算的推導值」不一致，
而那種 bug 沒有人會發現，直到某天畫面對不上為止。

---

## 5. PERSISTENCE_RISKS

### R1 ⚠⚠ 三個 store 各自寫，沒有交易

`profileStore` / `heroProgressStore` / `seasonStore` 各有各的鍵與寫入時機
（`useBattleFeed` 終局時分別呼叫）。
⇒ 雲端還原時如果不是**一起**還原，會得到
「生涯是新的、英雄熟練是舊的」——而熟練直接決定戰力與 Challenge 快照。
**這是 Cloud Save 的第一號問題，不是 Supabase 選型。**

### R2 ⚠⚠ 沒有 autosave，save 時機隱含在每個動作裡

沒有 `beforeunload` / `visibilitychange` / 定時器；84 個呼叫點各自負責。
掃描結果：**8 個動作寫了 state 但同一個函式內沒有 `save()`** ——
`_setCompetitionState`、`_setCompetitionStateFor`、`_syncSeasonStateV2`、
`assignTraining`、`_recordHonors`、`requeueMatch`、`_clearSeriesForFixture`、`signSponsor`。

逐支查證後分兩種：
- **私有 helper**（底線開頭）由公開動作包起來，通常有救。
- **`assignTraining` 是真的有洞**：它先 `_patchPlayer()`（那支會 `save()`），
  **之後**才 `set({ retention })` ⇒ 那次 retention 寫入不在這次存檔裡。
- `signSponsor` 靠後面的 `pushInbox()` 順便存到 —— **靠運氣，不是靠設計**。
- `requeueMatch` 尚未逐行查證，B1B 動手前補查。

### R3 ⚠ `save()` 的 `catch {}` 靜默吞失敗

`challengeState.js` 檔頭已經點名過這件事：寫入失敗玩家不會知道，
「會在某一天發現我的進度不見了」。上雲之後**網路錯誤會遠比 quota 錯誤常見**，
這個 `catch {}` 必須先變成「可觀測」，否則雲端同步會靜靜地不同步。

### R4 ⚠⚠ Challenge 切片佔存檔 94%，而且它是「證據」不是「生涯」

實測（挑戰紀錄灌到上限 `MAX_INSTANCES = 20`）：

```
總存檔          119,963 B
└─ challenge    113,050 B   (94%)
   ├─ snapshots  61,316 B   25 份 × 2,440 B
   └─ instances  50,561 B   20 筆 × 2,507 B（其中 draftResult 1,894 B）
新局（無挑戰）    7,049 B
```

⇒ 生涯本體其實**只有 7 KB**，而挑戰的重播證據把它撐到 17 倍。
這兩者的**保存需求完全不同**：生涯要跨裝置即時一致，重播證據只要「找得回來」。

### R5 ⚠ `startNewGame` 不會清 heroProgress / season

`resetProgress()` 與 `resetSeason()` **在整個 `src/` 裡沒有任何生產呼叫端**
（只有定義本身）。開新局會帶著上一局的英雄熟練與對戰歷史。
證據：browser gate 的 `seed()` 必須自己多寫一行
`localStorage.removeItem("esmo.heroProgress.v2")` —— 測試在替產品補這件事。

### R6 ⚠ 只有 profile 有 schemaVersion

`heroProgress` 與 `season` 沒有版本欄位（`heroProgress` 靠**換鍵名**做過一次遷移：
`v1 → v2`）。雲端存的東西必須能被未來的版本讀懂 ⇒ 這兩個要補版本欄位。

### R7 ⚠ `esmo.season.v1` 大小未實測

`BattleResult.v2` 帶 `rounds`、`players`、`raw` 透傳，上限 50 場。
本輪沒有跑完整生涯賽事，**沒有量到真實大小**。
⇒ 列為 B1B 的前置量測項，不在這裡猜。

### R8 ⚠ 沒有 device / revision，多裝置就是「最後寫入者覆蓋」

目前沒有 `updatedAt`、`revision`、`deviceId` 任何一個。
接雲之後兩台裝置同時玩，後寫的會**無聲覆蓋**前一台的進度。

### R9 ⚪ `load()` 白名單其實是保護（記下來，別誤拆）

雲端傳回多餘或未知欄位會被靜默丟棄 —— 這是**好事**，
它讓「伺服器版本比 client 新」不會炸掉 client。B1B 不要把它換成 `{...saved}`。

---

## 6. RECOMMENDED_B1B_ARCHITECTURE（最小 Cloud Save boundary）

**原則：沿用 Slice 8 剛驗證過的 provider 邊界，不新增第二套架構、不大重構。**

### 6.1 一個信封：`SaveBundle.v1`

新增 `src/platform/persistence/saveBundle.js`（**純函式**，比照 `challengeState.js`）：

```
SaveBundle.v1 {
  schema, revision, updatedAt, deviceId,          // 新增：衝突偵測用
  profile:      <profileStore 的 A 類欄位>,
  heroProgress: <esmo.heroProgress.v2>,
  // ⚠ season / 裝置偏好 **不進 bundle**（B 類）
}
```

- `buildSaveBundle(state)` / `applySaveBundle(bundle)` —— 兩支純函式，可被 verifier 逐值比對
- **A / B / C 的分類寫在這一支裡**，成為唯一的事實來源
- ⚠ C 類（`seasonStateV2`、`opponentDirectory`、別名）在 `buildSaveBundle` 就被剔掉，
  不要靠呼叫端記得

### 6.2 一個邊界：`SaveProvider`（照抄 Slice 8 的 `OpponentProvider`）

```
SaveProvider
  → load()            取回 SaveBundle（或 null）
  → save(bundle)      寫入，回 { ok, revision, errors }
  → describe()        來源身分（診斷用）
```

- **`LocalSaveProvider`**：包住現在的 `localStorage`，**行為與今天完全一樣**
- 未來的 `CloudSaveProvider`：**只換這一個**，store 與畫面一行不用改
- 註冊點比照 `opponentDirectory.js`：`setSaveProvider()` / `activeSaveProvider()`
- ⚠ 三態（`saving` / `synced` / `error`）比照 Slice 8 的 `opponentDirectory`，
  UI 才有位置顯示「儲存失敗」——直接解掉 R3

### 6.3 一個入口：`saveGateway`

`profileStore.save()` 改成**呼叫 gateway**，gateway 一次處理三件事：
組 bundle → 交給 provider → 同時寫回 `heroProgressStore`。

⇒ 直接解掉 **R1（無交易）** 與 **R5（重置不協調）**：
`resetAll()` 也走同一個 gateway，開新局自然會清乾淨。

⚠ **`profileStore.save()` 的名字與 84 個呼叫點都不動**，只換它裡面做的事。
這是「不大重構」的關鍵。

### 6.4 Challenge 證據分層（解 R4）

把 `challenge` 拆成兩段，**不改任何契約、不改判定邏輯**：

| 段 | 內容 | 去哪 |
|---|---|---|
| `challenge.core` | `defense`、`order`、`instances` 的**判定欄位**（id / kind / opponentKey / settlement / identity / 兩個 hash / seed / version / result 摘要） | **上雲**（小，且是「我打過誰、算不算數」） |
| `challenge.evidence` | `snapshots{}` 與 `instances[].draftResult` | **可延後**：先留本機，雲端只存 hash 引用 |

- 缺 evidence 時的行為**已經有先例**：跨模擬版本的舊挑戰本來就**明確拒絕重播**
  （不靜默重算）⇒ 缺證據時走同一條路，說「這場在這台裝置上重播不出來」，
  **不編造結果**。
- 效果：上雲量從 120 KB 降回 **7 KB 等級**。

### 6.5 衝突處理：先偵測，不自動合併

`revision` + `updatedAt` + `deviceId`。B1B 只做：
**偵測到雲端比本機新 ⇒ 停下來問玩家**（沿用 Slice 8 的誠實規則：
不假裝能自動合併兩份都玩過的生涯）。自動合併留到有真實需求再說。

### 6.6 B1B 的前置量測（不做完不要動手）

1. 量 `esmo.season.v1` 在 50 場上限時的真實大小（R7）
2. 修 R2 的 `assignTraining` 存檔順序（一行的事，但會影響「存了什麼」的基準）
3. 給 `heroProgress` / `season` 補 `schemaVersion`（R6）

### 6.7 明確不做

不安裝 Supabase／不選型／不寫 SQL／不做 login／不做多裝置即時同步／
不動 combat / Draft / `simulationVersion`／不碰 Ranked。
