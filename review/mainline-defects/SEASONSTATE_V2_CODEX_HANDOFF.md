# SeasonState v2 / Competition mainline 技術交接

> 供 Claude Code 接手 Q7f / Competition runtime 稽核使用。這是一份歷史與設計稽核，不是修復方案。

## 0. 稽核基線與方法

- 稽核基線：`main` 的 `03a2fbcfb4a92829fa840bc7bd94e04672d22876`（`Deploy R58.2 to GitHub Pages`）。
- `03a2fbc` 是 merge commit；本文件只採用它可達的 mainline 歷史、程式碼、`docs/handoff/`、`tools/` 與 commit diff。
- 已在以 `03a2fbc` 為 HEAD 的獨立稽核 worktree 中使用 `git log -- <path>`、`git show`、`git blame`、靜態 source trace 與歷史 verifier 文件核對。
- 未修改 production code、workflow、verifier、save 或部署設定；未 push、未 deploy。
- Q7f 後續 branch 上的 commit（例如 `104881e`、`ed8cc84`）不屬於 `03a2fbc` ancestry，因此不列入 mainline 結論。本文不以目前 Claude 的診斷反推歷史答案。

## 1. 結論先行

截至 `03a2fbc`，Competition 不是「SeasonState v2 已完全取代 v1」，而是混合架構：

1. `competition` 內的 SeasonState.v1／Legacy Competition 仍是 gameplay truth。fixtures、outcomes、stage、playoff、FinalStandings、歷史、live session、award 與既有 settlement 仍由 legacy 路徑保存。
2. `seasonStateV2` 是持久化的 metadata / compatibility index，保存 Season → Circuit → Event 的 identity、reference、scope index、status 與 settlement reference；不複製 gameplay rows，也不重跑或重排賽程。
3. `activeCompetitionEvent()` 是舊呼叫者的 compatibility adapter。它只有在 v2 合法、active Event 可找到、且 Event 的 `competitionRef.id` 等於目前 legacy `competition.id` 時，才把 legacy state 交給 caller；scope 不一致時刻意 fail closed，`legacyState` 會是 `null`，不會猜另一個 Competition。
4. 因此 `activeCompetitionEvent().legacyState` 不是單純的 `get().competition` 別名，而是對 v2 sidecar、active pointer 與 legacy scope 一起做 gate。這是當初設計的安全邊界，也是 wiring 不完整時會把整條舊 runtime 擋住的架構耦合。
5. main 仍可見後續 Q7b/Q7a 寫入直接呼叫 `set({ competition: ... })`，沒有全部經過 `_setCompetitionState()`；`save()` 會在存檔時重新計算 v2，但中間的 in-memory legacy/v2 可能不是同一拍更新。這是本次 static audit 找到的 incomplete wiring，不代表本文已替它修復或宣稱某個特定線上症狀的唯一根因。

## 2. 主要 commit 與實際變更

### 2.1 v2 wrapper 與 adapter 的起點

| Commit | 主要內容 | 影響檔案／路徑 |
|---|---|---|
| `a990df3f06b282613da5bb72bccb5ce30869bd3d` | Q7b 初始 SeasonState.v2 wrapper；加入 `seasonStateV2For`、save/load sync、`_setCompetitionState`、`_syncSeasonStateV2`、`activeCompetitionEvent()`。把主要 Competition read path 從 `get().competition` 改走 adapter。 | `seasonStateV2.js`、`profileStore.js`、`check_season_state_v2_migration_q7b.mjs`、`verify.mjs` |
| `5a93309b66f2c0c0547a33b6b311b05e1efd5543` | Q7a-3a identity layer：在既有 legacy Competition 上加入 Circuit/Event identity 與 `idScheme`，不改舊 fixture ID。 | `profileStore.js`、identity verifier |
| `c9eaf3ba7540e88ed24558a49f2319aec131552b` | 多 Competition legacy shape：`competitions{}` 成為唯一 Competition collection；`events{}`／`circuits{}` 與 top-level fixture/outcome 維持 legacy 來源；`activeEventId` 只作 UI focus。 | `profileStore.js`、legacy competition accessors、Q6/UI gates |

`a990df3` 的 diff 明確顯示下列舊讀取點改成 adapter：

- `_advanceCompetition()`
- `startFixtureMatch()`
- `completeFixtureMatch()`
- `forfeitFixture()`
- `_sealSeasonIfFinished()`
- `rollToNextCompetitionSeason()`
- `competitionView()`
- `_writeFixtureResultFromMatch()`

同一個 commit 也把 `ensureCompetitionSeason()` 的新季建立改成 `_setCompetitionState(made.state)`，意圖是建立 legacy state 的同時生成 deterministic v2 wrapper。

### 2.2 migration-safe foundation 與 fail-closed

| Commit | 主要內容 | 實際設計效果 |
|---|---|---|
| `ceb5b6f42a312e51c259db99e97ea9057428f09b` | 3b-M1：加入 v1/v2 schema、normalize、validator、legacy wrapper、indexes、scope lookup、old-v2 normalization。 | v2 只作 representation/reference；不自動修復錯誤 scope、不 rebind 到另一個 Competition。 |
| `3ea60f844dba2c7b350871b397c0f63c5382091a` | sealing scope guard。 | 防止 Event、Competition、Final、points reference 跨 scope 混用。 |
| `1c9d5203185c0ac2c129e895ed337301bb42e1a3` | sealing hardening。 | Final ID conflict 視為 corruption，不由 migration 靜默覆蓋；Season boundary 不只看目前 active Event。 |
| `6f498065bb35c258339b1f83a08ab72a6d606171` | stale index fail closed。 | index 不可信時保留原值，交由 adapter／validator 擋下，不猜測修補。 |

`seasonStateV2.js` 的重要現行契約：

- `wrapLegacySeasonState()` 對 legacy `competition` 建立一個 MOBA career Event reference；Event 內只存 `competitionRef`、fixture/outcome/stage/playoff/final IDs 與狀態。
- `final` 是 reference-only envelope，禁止塞入 `FinalStandings.rows`。
- `migrateSeasonStateV2()`：
  - 沒有 legacy Competition 時建立空 v2 wrapper，不發明 Circuit/Event。
  - 沒有 v2 但有 legacy 時由 legacy wrapper 建立 v2。
  - 同季合法 v2 會 normalize、refresh legacy indexes。
  - 新 legacy season ID 是允許的 rollover 邊界，會重建 wrapper，但不改新季 legacy IDs。
  - active Event 的 Competition ID 不符、stored Final ID 衝突、index 不符或 validator 失敗時，保留現值並讓 adapter fail closed；不會自動 rebind。

### 2.3 sealing boundary

| Commit | 主要內容 | 影響 |
|---|---|---|
| `eb396a50ee9ef39c12d912543a0f88671da5de15` | 先封 Event、再處理 Season；獎金只在有 prize policy 時結算。 | `profileStore` 的 legacy sealing flow 與 Event settlement 順序。 |
| `7397f466f675a51199f604a80aa3e4cceb963d01` | 3b-M2：新增 `seasonSealingV2.js`、`sealCompetitionEvent()`、`sealCompetitionSeason()`，並把 `_sealSeasonIfFinished()` 導到 boundary。 | Event/Season v2 status/ref 由 boundary 更新；legacy Final 仍是真相。 |
| `0be8a8538d3af487b6b91a28f9dbf68ea1956926` | page 顯示多 Event，focus 從 rules 解耦。 | `competitionView()` 傳遞 event collection 與 `activeEventId`。 |
| `4b9ebc13e230058c755352bbe9eb3c2b32303466` | 錯誤 ID fail loudly；UI 依選定 Event 顯示。 | query/focus 不能猜另一個 Event。 |

`seasonSealingV2.js` 的設計是 reducer-like boundary：

- `sealEventBoundary()` 先驗證 v2、Event、legacy Competition scope、fixture/outcome index；所有 fixtures terminal 後重用或產生 legacy Final。
- Event v2 只寫 sealed status、`finalId`、reference envelope、points settlement ref；不把 Final rows 複製進 v2。
- prize policy 已存在才呼叫既有 award settlement；Circuit Points 使用獨立 ledger，沒有 policy 時是 `policy_required`／可依呼叫者選擇 allow unscored。
- `sealSeasonBoundary()` 要求 required Events 全部 sealed，最後把 v2 `active` 設為 `null`；不重算 Final、不再發獎、不建立下一季、不建立 CS Event。

### 2.4 後續 Competition runtime／UI 寫入

以下 commit 雖然主要是 Q7a/Q7b/Q7c/Q7d/Q7e 功能，但直接延伸了同一條 Competition runtime：

- `e7e8a4c7e8ef3f7b8e068a7326a201f2cd78275a`：live session migration、derived index digest。
- `ce594bb465ace787ffe829a727a616cb4c745f61`：circuit points／qualification。
- `fb5596d6025257ecbad3991de00cac76d2765b14`：Asia circuit runtime（flag）。
- `1515e56242059668e6212ad092b602a5168dede4`：points UI projection。
- `c6788d446ef8ce4abab06027ae877b56ea00c275`、`11a4ac18f2fe5042b85186d6f7d5975cb6e95c2a`：career Event identity 與 default scheme。
- `3555314ba1e3c0c0d63b02c3892e5b1f478916ce`：annual final qualification／Event 建立。
- `8cbf794a3aa7e8154fc7218ccccce24e8c9fd101`：annual final UI read-only projection。
- `375b0e717dd7bb54661561e42d9f2e390e157a6c`、`a339bd8be9bbc339e9636adf3782d63f80953711`、`b56c3efcc6ba99863c3e350e6cd3995c400ff9b7`：honors lifecycle/UI 與 subscription fix。
- `03a2fbcfb4a92829fa840bc7bd94e04672d22876`：main deploy baseline；沒有把 v2 轉成另一套 gameplay truth。

## 3. 為什麼從 `get().competition` 改成 `get().activeCompetitionEvent().legacyState`

這個改動的原始理由可由 `a990df3` diff、`seasonStateV2.js` 註解與 3b-M1 文件直接確認：

1. 單純讀 `get().competition` 只知道 legacy state，不知道它是否仍與目前 v2 active Event 的 `competitionRef` 相同。
2. 多 Event 之後，caller 必須先取得一個有 scope 的 active Event，避免把另一個 Event 的 fixture、standings、final 或 settlement 混進來。
3. v2 wrapper 是 compatibility index；舊 runtime 仍要讀原本完整的 legacy state，所以 adapter 回傳的是「Event metadata + exact legacy state」，而不是另造一份 v2 Competition。
4. 若 scope 不一致，設計上寧可沒有 Competition，也不自動選一個看似合理的 Competition。這解釋了 `activeEventAdapter()` 明確回傳 `legacyState: null` 的原因與安全意義。

換句話說，這次替換是「把所有 Competition caller 放進 scope gate」，不是「把 v2 變成新的 gameplay state」。代價是：v2 sidecar 的建立、同步、active pointer 與每個 legacy write path 都變成 runtime 的必要前置條件。

## 4. 當時的 migration 與 active Event 建立流程

### 4.1 load / save

`profileStore.js` 的預期鏈如下：

```text
localStorage saved.competition
  -> upgradeSeasonShape()       (Q7a identity compatibility)
  -> withIdentity()
  -> seasonStateV2For()
  -> syncSeasonStateV2()/migrateSeasonStateV2()
  -> in-memory state.seasonStateV2
```

存檔時：

```text
current legacy competition
  -> seasonStateV2For(current)
  -> state.seasonStateV2 + localStorage sidecar
```

因此 legacy → v2 的預期 migration 是 deterministic、idempotent、reference-preserving；不是把 v1 gameplay data 搬進 v2。既有 v2 會先 normalize/validate；只有新 season ID 才是明確允許重建 wrapper 的 rollover boundary。舊個人／舊 season 的 identity 欄位可能先只存在記憶體，下一次 save 才落盤，這是 Q7a-3a 文件明確記錄的 compatibility 行為。

### 4.2 新賽季／active Event

`ensureCompetitionSeason()` 是新季的實際建立入口：

1. 呼叫既有 `createSeasonState()` 建立 legacy SeasonState.v1 與 Competition。
2. 依現有 pipeline 加上 Asia circuit（若該功能路徑啟用）。
3. 透過 `_setCompetitionState()` 寫回 legacy `competition`，同一拍以 `seasonStateV2For()` 建立 v2 Season/Circuit/Event wrapper。
4. `active` 指向該 wrapper 的 MOBA career Event。

多 Event 的實際 collection／新增仍在 legacy `competition.competitions`、`events`、`circuits` 與 accessor 流程；`activeEventId` 是 UI focus，不是規則 truth。這是 `c9eaf3b` 的設計。v2 compatibility wrapper 並沒有把整套 multi-event gameplay collection 複製成另一份 v2 gameplay model；它服務的是 active/reference boundary。

## 5. 暫時性 wiring / compatibility bridge

以下是程式與當時文件可確認的 bridge，接手時不要把它誤認成已完成的 v2 migration：

### 5.1 Legacy canonical + v2 sidecar

- `seasonStateV2` 存在 profile root，但 `competition` 仍保存全部舊資料。
- `seasonStateV2For()`、`_setCompetitionState()`、`_syncSeasonStateV2()` 是同步橋。
- `activeCompetitionEvent()` 讓 legacy caller 取得原始 v1 object；v2 只提供 Event identity/scope metadata。
- `competitionView()` 是 UI 唯一入口，但先讀 adapter 的 `legacyState`；adapter gate 失敗時會走「沒有賽季」形狀。

### 5.2 sealed active fallback

`7397f46` 對 adapter 加入特例：當 v2 `active === null`，若全 v2 中恰好只有一個 sealed Event，仍可把該 Event 當成舊 caller 的 legacy compatibility Event。這是支援單 Event sealed legacy caller 的 bridge；多個 sealed Event 時不會任意挑一個。

### 5.3 舊與新 sealing path 並存

`_sealSeasonIfFinished()` 在 `7397f46` 引入 boundary route 後，main 仍保留下方原本 Q4/Q5/Q6 的 legacy sealing code。前面的 3b-M2 block 在正常執行會 return，因此後段成為保留的舊 wiring／fallback 形狀，而非一個獨立正式 v2 source。這部分應視為 transition debt，不能只看函式裡仍有舊程式就判斷它與前面的 boundary 同時執行。

### 5.4 尚未全部集中到 `_setCompetitionState()` 的寫入

`git blame` 可追到 main 的下列 raw writes：

| 程式位置 | 引入／延伸 commit | 內容與風險形狀 |
|---|---|---|
| `profileStore.js:1028` | `3555314...` | `ensureAsiaFinals()` 後直接 `set({ competition: state })`，再 save。 |
| `profileStore.js:1045`、`:1056` | `eb396a50...` | Event seal、award receipt 寫回時直接 set legacy competition。 |
| `profileStore.js:1077`、`:1081` | `ce594bb...` | points／qualification state 直接 set legacy competition。 |
| `profileStore.js:1111` | `3555314...` | qualification 後建立年度總決賽時直接 set legacy competition。 |
| `profileStore.js:1847` | `0be8a853...` | `setActiveEvent()` 直接改 legacy `activeEventId`，再靠 save 重算 sidecar。 |

這些路徑有些在同一段隨後呼叫 `save()`，所以磁碟落盤時通常會重新建立 v2；但它們不是 `_setCompetitionState()` 的集中寫入，且 `activeCompetitionEvent()` 若在 save 前被呼叫，讀到的是當下 in-memory 的 v2 sidecar。歷史文件沒有提供「每一條 raw write 後立即呼叫 adapter」的完整 verifier 證據，這是應交給後續 owner 明確補測／整理的 migration debt。

## 6. 歷史上實際跑過的 verifier / browser evidence

以下只列 main ancestry 與 handoff 中可追溯的實際 evidence；不把「有 script 檔」當成已通過，也不把 Node assertion 當成手機／視覺實測。

### 6.1 v2 migration / adapter

`tools/check_season_state_v2_migration_q7b.mjs` 在 `a990df3` 建立、由 `ceb5b6f` 擴充、後由 `6f498065` 更新，實際涵蓋：

- legacy → v2 wrapper；單一 MOBA career route。
- fixture、outcome、stage、playoff、final、history ID preservation。
- final envelope 不含 rows。
- deterministic indexes、scope mismatch fail closed、duplicate binding fail closed、active scope mismatch fail closed、final rows fail closed。
- active `null` 可以是合法 v2 state。
- 不產生 CS Event。
- v2 → v2 idempotence、舊 v2 representation normalization、重複 digest。
- `activeEventAdapter()` 在相容 legacy state 時回傳 exact legacy object；Competition ID mismatch 時回傳 `ok:false` 與 `legacyState:null`。
- empty profile 不虛構 Competition/Circuit/Event。
- 真實 `profileStore` 路徑：`startNewGame()` → `ensureCompetitionSeason()` → fixture match matchmaking/launch → 刪除 save 中的 v2 → reload → v2 wrapper 重建。
- live session 的 ID、seed、fixture binding、history、award receipt、fixture/outcome IDs save/load 後保留；resume 可繼續。
- v2 save/reload 不新增第二個 Event。

文件與 script 的最後記錄為 **35/35 PASS**；同一 script 另 spawn `check_q7a_safety.mjs`，要求 **18/18 PASS**。Q7b handoff 同時記錄 aggregate 6/6、Q4 68/68、Q5 66/66、Q6 57/57 與 build PASS。

### 6.2 Event / Season sealing

`tools/check_season_state_v2_sealing_m2.mjs`（`7397f46` 建立、`1c9d520` 更新）記錄 **24/24 PASS**，實際 assertion 包含：

- fixture 未 terminal 時不能封 Event。
- 正常 Event seal 成功、Final ID 保留、Event final 不複製 rows。
- legacy fixture/outcome IDs 不變。
- award 只結算一次；無 prize policy 不產假收據／財務交易。
- Circuit Points 使用獨立 ledger，Event 只存 reference；重複 points settlement idempotent。
- open Event 會阻擋 Season seal；multi-event 中另一個 open Event 不可被忽略。
- Event seal 後 Season seal 設 `active:null`；Season seal idempotent。
- live session payload 與 history 仍由 legacy/profile side 保有；scope mismatch fail closed。

### 6.3 identity、multi-event、live session、index

- `tools/check_q7a_3a_identity.mjs`：Q7a-3a identity migration；文件記錄 **29/29 PASS**，56 個既有 fixture IDs 不變；舊／新畫面文字保持；production smoke 8/8。另記錄 identity 欄位是在 load memory upgrade，後續 save 才重寫 localStorage。
- `tools/check_q7a_3b_multi_event.mjs`：多 Event branch、無 participant contamination、第一 Event seal 不誤封 Season、policy/no-policy award、reload stability；歷史記錄 verifier **25/25** 或後續 3b-M1/M2 aggregate 中的對應 green gate。重要限制：舊 historical gates 原本只有一個 Event；真正第二 Event 是由 verifier synthesized，不能宣稱既有 production save 已自然跑出完整 multi-event lifecycle。
- `tools/check_q7a_live_session_migration.mjs`：文件記錄 **20/20 PASS**；real path start/launch、save 後剝除 v2、reload、session/fixture/assignment/room/seed/token preservation、resume、finish outcome、重送 3 次不重複錢/XP/outcome。
- `tools/check_q7a_index_digest.mjs`：文件記錄 **13/13 PASS**；derived index 對重算、插入順序、JSON roundtrip、reload、v1 upgrade deterministic，mutation 會改 digest。

### 6.4 Competition page / browser evidence

main ancestry 中可追溯的 browser gates 包含：

- `tools/browser_check_q6.mjs`、`browser_check_q6_prod.mjs`：Q6 playoff / CompetitionScreen 與 production-shaped flow。
- `tools/browser_check_multi_event_ui.mjs`：Node 先注入兩 Event，再由 browser 進 CompetitionScreen；確認事件列表、切換 focus 後 standings follow selected Event、legacy single-event fallback、無 page error。文件記錄 7/7 或後續 smoke 8/8 的 corresponding gates。
- `tools/browser_check_career_final_ui.mjs`、`browser_check_asia_finals_ui.mjs`：Q7b/Q7c annual final UI projection；不得由 UI 自行計算 qualification/bracket/outcome。
- `tools/browser_check_default_scheme.mjs`、`browser_check_circuit_points_ui.mjs`、`browser_check_team_honors_ui.mjs`：Q7a-3f/Q7d/Q7e 的 production UI wiring。

Q7b 的 production smoke 使用 Node 建立真實 profile/save，再注入 browser；後續補測從 **25/25 增到 32/32**，補上首次漏掉的 `Event.final`／`state.final` 視察。文件記錄 default 140/4、三個 circuit events 完成後 qualification、annual final participants exact、第五隊排除、final/seal/no-award 與無 uncaught error。

## 7. 指定情境是否曾實測

| 情境 | 歷史 evidence | 判定與限制 |
|---|---|---|
| 全新遊戲建立賽季 | **有**：Q3/Q3.5/Q6 legacy gates；Q7b migration verifier 的 `startNewGame()` + `ensureCompetitionSeason()`；Q7b/Q7d browser smoke。 | 有實測新遊戲建立與頁面形狀；未證明每個後續 raw write 都立即同步 adapter。 |
| 存檔重載 | **有**：Q5；Q7a identity；Q7b v1 save 剝除 v2 後 reload；v2 save/reload；Q7a live migration。 | 覆蓋 migration preservation 與部分 runtime；不是所有 Competition API 組合的 property test。 |
| multi-event season | **有**：Q7a-3b verifier、multi-event browser、Q7b annual final smoke。 | 第二 Event 主要由 focused verifier/browser fixture 合成；歷史 legacy gates 多數仍是單 Event。 |
| sealed Event / sealed Season | **有**：Q4/Q5/Q6；M2 sealing 24/24；Q7b final smoke。 | 覆蓋 boundary 與 idempotence；多 sealed Event 下 active adapter 與所有舊 caller 的完整組合未見獨立 browser gate。 |
| rollover | **有**：Q5 66/66、Q7b migration 的新 season ID rebuild、Q7d rollover/backfill 文件。 | 有證據支持 deterministic new wrapper；未見針對每個 raw write path 的 rollover 前後 adapter immediate read。 |
| CompetitionScreen | **有**：Q3.5/Q6 browser、multi-event UI、career/annual final UI、Q7e honors UI。 | Browser 多使用 injected/synthesized save 與既有 legacy route；沒有一個歷史 gate 同時覆蓋新遊戲、multi-event、sealed、reload、focus、所有 Q7b adapter callers。 |

## 8. 已知未完成工作與技術債

### 明確記錄於當時文件的部分

1. `seasonStateV2` 是 representation-only compatibility layer，不是完整 gameplay migration；legacy canonical 的狀態沒有第二份 v2 gameplay copy。
2. CS Event 沒有建立；v2 只包目前 MOBA career path。
3. Circuit Points policy 在 M2 時尚未成為正式產品政策；無 policy 時 `policy_required`／allow-unscored 是刻意狀態，不是完成的 points economy。
4. 沒有 v2 scheduler、qualification engine、Season Award、跨 game mode scheduler 或新的 Competition simulator。
5. 舊存檔 identity migration 有「load memory upgrade、later save persists」的時間差。
6. UI focus (`activeEventId`) 與 rules truth 刻意解耦；頁面必須使用 scoped accessors，不能把 focus 當成主賽制。

### 由 main source trace 可確認、但未見完整收口的部分

1. `_setCompetitionState()` 被註明為集中入口，但 Q7b/Q7a 後續仍有多個直接 `set({ competition: ... })`；它們多半隨後 save，然而沒有統一保證 in-memory v2 與 legacy 在每次 mutation 後立刻同步。
2. `_sealSeasonIfFinished()` 同時保留 new boundary route 與舊 Q4/Q5/Q6 sealing body；前者在正常路徑 return，後者是 transition residue，未被抽成單一明確 implementation。
3. `wrapLegacySeasonState()` 的 v2 Event 是對 `legacyState.competition` 的一個 reference envelope；multi-event 的完整 Competition collection 仍在 legacy `competitions{}`。因此「v2 index 是否要代表整個 Event collection，還是只代表 active legacy compatibility Event」在目前 main 不是完全獨立、清楚的 migration contract。
4. `competitionView()` 先要求 `activeCompetitionEvent().legacyState`；adapter fail closed 時 UI 會回 no-season shape。這是設計上避免錯 scope 的結果，但歷史證據沒有覆蓋所有 stale/missing sidecar 與後續 raw write 的即時 UI 行為。
5. sealed fallback 只在 `active === null` 且 v2 恰有一個 sealed Event 時成立；多個 sealed Event 不應任意回傳一個 legacy Competition。需要 caller 以明確 Event scope 讀取，但 main 仍有舊 caller 依賴 active adapter 的相容性。

## 9. 給 Claude Code 的接手注意事項

- 不要把 `activeCompetitionEvent().legacyState === null` 自動改成 fallback `get().competition`；那會移除 `ceb5b6f`／`6f498065` 明確建立的 fail-closed scope safety。
- 先用當下 state 同時記錄：legacy `competition.id`、legacy season ID、v2 schema/version、v2 `active`、indexed Event ID、Event `competitionRef.id`、validator errors、Event count/status；不要只印 `competitionView()` 的 no-season。
- 區分四種狀態：v2 缺失可 migration、v2 invalid/corrupt 應 fail closed、active pointer 無法解析、sealed single-event fallback；不要把它們合成一個「逾期」或「沒有賽季」。
- 若要補 wiring，先建立 verifier 證明每一個 legacy Competition mutation 在 adapter read 前已同步，再考慮集中寫入；不要直接改 fail-closed policy 或回退到第二套 truth。
- 對 multi-event 必須明確指定 Event/Competition scope。`activeEventId` 是 UI focus，不能拿來代替 rules accessor。
- 任何修復都要保留 legacy fixture/outcome/final/session/reward identity 與 existing idempotence verifier；不要把 Final rows、points entries 或 live payload 複製進 v2。

## 10. 最終摘要

- **涉及的核心 commit：** `a990df3f06b282613da5bb72bccb5ce30869bd3d`、`5a93309b66f2c0c0547a33b6b311b05e1efd5543`、`c9eaf3ba7540e88ed24558a49f2319aec131552b`、`ceb5b6f42a312e51c259db99e97ea9057428f09b`、`eb396a50ee9ef39c12d912543a0f88671da5de15`、`7397f466f675a51199f604a80aa3e4cceb963d01`、`3ea60f844dba2c7b350871b397c0f63c5382091a`、`1c9d5203185c0ac2c129e895ed337301bb42e1a3`、`0be8a8538d3af487b6b91a28f9dbf68ea1956926`、`6f498065bb35c258339b1f83a08ab72a6d606171`、`4b9ebc13e230058c755352bbe9eb3c2b32303466`、`e7e8a4c7e8ef3f7b8e068a7326a201f2cd78275a`，以及 Q7a/Q7b/Q7c/Q7d/Q7e 的後續 runtime/UI commits。
- **原始設計意圖：** legacy `competition` 是唯一 gameplay truth；SeasonState.v2 是 metadata/reference projection；adapter 讓舊 runtime 在有明確 scope 時繼續讀 exact legacy state；migration 要 deterministic/idempotent 且不 rebind。
- **當時測試覆蓋缺口：** 新遊戲、save/reload、live migration、multi-event fixture、sealed boundary、rollover、CompetitionScreen 都各自有 evidence，但沒有看到一個端到端 gate 同時涵蓋所有狀態；尤其 raw legacy write → immediate adapter read、missing/stale sidecar、multi-sealed active-null、完整 production multi-event lifecycle 的覆蓋不完整。
- **看起來是 incomplete migration / temporary wiring 的部分：** v2 sidecar 與 legacy canonical 並存；後續 raw `competition` writes 未完全集中；`_sealSeasonIfFinished()` 舊／新 path 並存；active adapter 的 single sealed fallback；multi-event collection 仍由 legacy 所有，而 v2 wrapper 主要承擔 active/reference compatibility。

