# ESMO 專案守則

React 18 + Vite 5 + Three.js/R3F + zustand 的電競經營遊戲。部署到 GitHub Pages（push main 後由 GitHub Actions 建置）。沒有測試框架：驗證 = `npm run build` + `tools/*.mjs` 腳本 + 流程清單。

## 最高原則（完整版在 docs/handoff/README_給Claude先讀.md）

Legacy Experience + Modern Architecture：UI/UX/流程/資訊密度以 `src/EsportsGame.jsx`（Legacy）為規格；架構（Store/Router/LogicEngine/BattleResult/HeroProgress/SeasonStore/battleStore）以目前主幹為準。不可建第二套 Store、第二套 Hero Database，不可重寫 LogicEngine，不可用 Legacy 覆蓋主幹。

**與 README 的一個衝突，以本檔為準**：README 要求「先讀完全部 9 份 handoff 文件再動工」。不要這樣做——按下面的路由表，只讀當次任務需要的文件。

## 危險巨檔（先看這張表再讀任何檔）

| 檔案 | 大小 | 規則 |
|---|---|---|
| `src/EsportsGame.jsx` | 1.4 MB | 絕對禁止整檔 Read。已知 key／符號名 → 自己 Grep 定位＋Read offset/limit ≤300 行；開放式找規格、不知關鍵字 → 派 Explore subagent |
| `src/data/heroImages.js` | 396 KB | 全是 data URI。永遠不讀內容，只 Grep key 名 |
| `src/App.jsx` | 378 KB | 同 EsportsGame 規則 |

## 任務 → 文件路由表（取代「全部讀完」）

| 任務類型 | 先讀 |
|---|---|
| 接手新 sprint / 不知道現在做到哪 | `docs/handoff/05_Sprint紀錄.md` 最後一節 + `08_目前待辦與風險.md` |
| 動主幹架構（Store/Router/Battle 流程） | `docs/handoff/06_目前主幹架構.md` |
| 恢復 Legacy 功能或 UI | `docs/handoff/02_Legacy_Recovery_規格.md`，規格細節派 Explore 查 EsportsGame.jsx |
| 不確定編碼風格 / 命名 / 禁區 | `docs/handoff/03_開發規範.md` |
| 規劃下一步 / 排優先序 | `docs/handoff/04_Roadmap.md` |

## 驗證命令（宣稱完成前必跑，輸出貼回報）

```
npm run build           # 必跑，看到 "built in" 才算過
node tools/regress.mjs  # 一律跑（若存在）
node tools/regress2.mjs # 一律跑（若存在）
```
`tools/check_*.mjs` 現役清單（2026-07-14 於 S29A 逐支實跑確認）：

- **現役（必跑，全綠）**：`check_moba_runtime29` `check_moba_stats28` `check_talent27`
  `check_moba_experience26` `check_progress25` `check_moba_tactic24` `check_cs23`
  `check_flow09` `check_dash10`

- **Season vNext 時間線（2026-08-26 V3 起；動到世界時間／快轉／週結算就必跑）**：
  `check_world_time_v1`（46）`check_time_block_v2`（47）**`check_time_block_v3`（69）**
  ＋瀏覽器 **`browser_check_time_controls`**（21）
  ⚠ `check_time_block_v3` 是**快轉**的守門，釘住三件很容易被「順手」改壞的事：
  ① 競技每日容量**不得跨日累積**（掃 1–90 天）② 多週推進的**結算冪等**
  （跳 3 週＝恰好 3 次，且與跳 21 次一天在天數／資金／`lastSettledWeek` 逐值相同）
  ③ 規劃器不得自己掃賽程（否則會出現第二套賽程邏輯）。
  ⚠ `browser_check_time_controls` 驗**桌面＋390px 真 media query**與「比賽日必須擋住、
  不得自動棄權」。手機沒有世界時間入口的缺陷就是它抓到的。
  ⚠ 這幾支都是**秒級**，不走 `verify.mjs`，直接 `node tools/<name>.mjs` 即可。

- **Season vNext 生涯線（2026-08-27 V6 結案；動到年齡／衰退／退休／合約／休賽期就必跑）**：
  `check_player_lifecycle_v4`（44）`check_offseason_v5`（45）`check_age_drift_v5`（48）
  `check_retirement_v5`（39）`check_cs_ai_lifecycle_v6`（32）`check_contract_v6`（38）
  `check_offseason_session_v6`（39）＋瀏覽器 **`browser_check_offseason`**（18）
  ⚠ 這條線的共同紅線是**推導不落盤**：`careerYearOf` `careerStageOf` `marketValueOf`
  `aiRosterAt` `csAiRosterAt` 全是純推導，`players[]` 不得存第二份。
  ⚠ 老化時鐘是 **raw age ＋ 由 `player.id` hash 出來的固定個體偏移**，
  **不得**改用 V4 的 `effectiveAge`——那會讓「能力衰退 → 時鐘變年輕」形成迴圈。
  ⚠ 退休一律**兩段式**：第 N 年宣告意向、第 N+1 年才結算；沒有意向就永遠不會退休。
  ⚠ 休賽期會**擋住世界時間**，所以 `completeOffSeason()` 必須永遠成功、永遠免費，
  否則存檔會被卡死。

- **對戰層級與 Retention（2026-08-27 V7A/V7B；動到比賽來源、每日容量、目標系統就必跑）**：
  `check_general_match_v7a`（55）`check_retention_v7b`（58）
  ＋瀏覽器 **`browser_check_general_match_and_objectives`**（30）
  ⚠ 三個對戰層級的**名稱與分類同源**，都住在 `progress/matchSource.js`
  （`MATCH_TIER_LABELS` / `matchTierOf`）。畫面不得自己寫一份文案。
  ⚠ **一般對戰不得寫進賽季任何帳本**（排名／巡迴積分／晉級／冠軍／賽季獎金／榮譽）。
  賽程回寫唯一的呼叫點被 `isFixtureSession` 守住，別處不得再開一個。
  ⚠ **快速練習是零永久影響**，包含延後生效的那條：不得進 `economy.formLog`
  （formLog → `recentForm()` → 週結算的贊助績效獎金）。
  ⚠ Retention 的日／週／年一律綁**世界時間**（`meta.days`），**永久排除 ServerTime**；
  目標清單是決定性推導，**不落盤**；日常目標**不得**給任何永久戰力。

- **Player Challenge（動到挑戰／對手來源／快照就必跑）**：
  `check_player_challenge_slice1`（108）`slice2`（79）`slice3`（100，§③ flaky 見下）
  `slice4`（60）`slice5`（71）`slice6`（30）`slice7`（35）**`slice8`（121）**
  ＋瀏覽器 `browser_check_challenge_lifecycle`（21）
  `browser_check_challenge_manual_draft`（27）
  `browser_check_player_challenge_slice3`（99，2026-09-10 補上手動選角後恢復）
  **`browser_check_player_challenge_slice8`（50，桌機＋390）**
  ＋**正式站**（部署後才跑）`browser_check_prod_slice7`（29）
  **`browser_check_prod_slice8`（43）**
  ⚠ 正式站 gate **注入不了 provider**（打包後沒有 `/src/`，TD-31）
  ⇒ loading／empty／error 三態只能在**本地** gate 驗，正式站只驗正常路徑。
  這個分界寫在 `browser_check_prod_slice8` 的 `notCoveredHere`，不要讀成
  「三態在正式站驗過了」。
  ⚠ **對手資料只有一個入口**：`challenge/opponentDirectory.js` 的註冊點。
  `challengeBoard.js` / `PlayerChallengeScreen.jsx` / `profileStore` 都**不得**
  再 import `fixtureOpponents.js` —— slice8 §① 會直接掃原始碼。
  ⚠ `opponentDirectory` 在 store state 裡但 **`save()` 剔掉它**（是快取不是存檔）。
  ⚠ **identity 只有三個**（快照身分／配對身分／資格判定），全部走
  `challengeEligibility.squadIdentityOf`；provider 的 `opponentId` 只是路由鍵。
  ⚠ 已知紅：`check_player_challenge_slice3` §③ 首局勝率是 **flaky 統計 gate**
  （13–21% 之間跳，整支在 97–100 浮動），已登記技術債
  （`docs/handoff/08_目前待辦與風險.md`），**不得為了變綠放寬門檻**。
  ⚠ 一支 gate 紅成「一條逾時＋後面一整串跟著紅」時，**先查流程有沒有多一段**，
  不要先動逾時值——`browser_check_player_challenge_slice3` 就是這樣紅了兩個
  Slice（辨識法寫在 `08_目前待辦與風險.md`）。

- **存檔 / 持久化（動到 save/load、New Game、任何 store 切片就必跑）**：
  **`check_save_bundle_b1b`（86）**
  **`check_save_hardening_b1c`（76）**
  ＋瀏覽器 **`browser_check_exit_flush`（12）**
  ＋**正式站**（部署後才跑）**`browser_check_prod_b1c`（38）**
  ⚠ 正式站**製造不出「內部改了 state 但沒存」**（公開動作都會自己存檔，
  而 `_patchPlayerNoSave` 是 store 內部）⇒ 那條路只能在本地 gate 驗。
  正式站改用**故障注入**（暫時讓 `setItem` 對 profile 鍵丟例外）間接走同一條路，
  **不得**改用塞爆配額的方式。
  ＋量測工具 `measure_season_size`（不是 gate，跑 50 場真對局，1–3 分鐘）
  ⚠ **公開動作寫了 state 就必須自己存檔**（`check_save_hardening_b1c` §① 掃原始碼
  ＋逐個動作跑「改了 → 直接讀磁碟」的行為驗證）。靠別的動作順便存＝靠運氣。
  ⚠ **讀不懂的存檔一律先隔離**（`<key>.corrupt`）再開新局，**不准**讓下一次
  `save()` 把原始 bytes 蓋掉。這條踩過一次，代價是玩家的存檔無聲消失。
  ⚠ 保底 flush 只掛 `visibilitychange(hidden)` ＋ `pagehide`，
  **不得**改用 `beforeunload` 當唯一機制（行動裝置上經常不觸發）。
  ⚠ `save()` 永遠無條件執行；dirty 判斷只在 `flushIfDirty()` 裡。
  要製造「未存的變更」來測順序，請用 `_patchPlayerNoSave()` —— 
  `pushInbox` / `renamePlayer` 都會自己存檔，拿它們測永遠假綠。
  ＋**正式站**（部署後才跑）**`browser_check_prod_b1b`（42）**
  ⚠ 正式站**看不到 `SaveBundle`**：打包後沒有 `/src/`，而且本專案沒有把 store
  掛到 window ⇒ 雲端信封的內容邊界只能在本地 `check_save_bundle_b1b` 驗。
  ⚠ 寫 browser gate 的 UI 導航**一律用 testid，或用從程式碼讀到的字串**
  （課名 `TRAINING_COURSES`、情境名 `economyConfig.SCENARIOS`）。
  憑印象寫中文關鍵字已經連續害這支 gate 假紅三次。
  ⚠ **存檔只有一個出口**：`platform/persistence/saveGateway.js`。
  `profileStore.save()` 的名字與 84 個呼叫端**不得更動**，它裡面呼叫 gateway。
  ⚠ **新增 store 切片時要決定它屬哪一類**（`saveBundle.js` 的
  `CLOUD_PROFILE_KEYS` / `LOCAL_PROFILE_KEYS` / `TRANSIENT_KEYS`）——
  漏了就是「換裝置後那塊不見了」，那份清單是唯一的事實來源。
  ⚠ **三個 localStorage 鍵名不得更改**（`esmo.profile.v1` /
  `esmo.heroProgress.v2` / `esmo.season.v1`）：換鍵＝所有玩家存檔歸零。
  版本化靠**信封 ＋ 形狀偵測**，不靠換鍵。
  ⚠ **persistence 層不准空的 `catch {}`**（§⑨ 有斷言掃原始碼）。
  存檔失敗必須變成 `saveState = error`，玩家看得到。
  ⚠ Challenge 的 core/evidence 分離用**黑名單**（core = 整筆扣掉 `draftResult`）。
  改成白名單會在契約長新欄位時靜默丟掉整筆場次——已經踩過一次。
  ⚠ `esmo.season.v1` 實測 ~854,650 B（比 profile 大 7 倍）⇒ **不進雲端信封**。

- **正式站 smoke（部署後才跑）**：**`browser_check_prod_season_vnext`**（30）
  ⚠ 打的是**線上網址**，不是 dev server。因此**只能走 UI ＋ localStorage**（TD-31）：
  `RESOLVE_APP_MODULES` 匯入 `/src/...`，打包後的 bundle 沒有那些路徑。
  ⚠ 要在正式站佈置情境，記住兩件事：① **首次載入時 localStorage 是全空的**，
  存檔要推進過天數才寫得出來 ② **`finance.funds` 的單位是「元」不是「萬」**。

  ### ⚠⚠ 長 verifier 一律走 `tools/verify.mjs`，**禁止直接執行巢狀腳本**

  **本段先前的敘述是錯的**（原文：「跑 runtime29 一支就等於跑完全部，44/44，單跑約
  10–15 分鐘」）。實際情形，依 `tools/verify.mjs` 與 `check_moba_runtime29.mjs:428`
  的實測註解：

  - `check_moba_runtime29` 直接跑會展開 **63 個子行程**
    （tactic24 ×16、cs23 ×8、progress25 ×8、regress ×8、regress2 ×8、flow09 ×6、
    experience26 ×4、talent27 ×2、build ×2、stats28 ×1）⇒ **跑不完**。
    不是斷言太多，是同一份斷言被重跑很多次。
  - `check_moba_stats28` **單跑約 87 分鐘**。舊逾時值會把還在正常跑的子驗證器砍掉，
    回報成 `exit=-1` ＋空 stdout，**看起來像斷言失敗**——這是已知誤判陷阱。
  - 這些腳本的 `ck()` 是「累積到最後才一次印出」⇒ **執行中 log 是 0 bytes 屬正常**，
    不得用 stdout byte 數判斷是否卡住。

  **正確跑法**：

  ```
  node tools/verify.mjs --list                    # 區段清單與目前狀態
  node tools/verify.mjs --only=experience26       # 單段
  node tools/verify.mjs --resume                  # 只跑還沒通過的
  node tools/verify.mjs                           # 全部（約 90–120 分鐘）
  ```

  runner 會對每個子行程設 `ESMO_VERIFY_FLAT=1`，讓會 fan-out 的腳本跳過巢狀子驗證
  （那些子項目 runner 已各跑一次）。被跳過的標成 **SKIP 且排除在分母外**，不假裝通過。
  每段跑完即寫 `tools/.verify-state.json` ⇒ 中斷可 `--resume` 續跑。
  預設逾時 45 分/段（`--timeout=<ms>` 可調）。

- **各支的檢查數**：⚠ **FLAT 模式（走 runner）與直接跑的分母不同**，
  因為巢狀子驗證被委派出去了。以 `tools/verify.mjs` 的 `SEGMENTS` 表為唯一事實來源：
  flat 下 `runtime29` 35/35、`stats28` 21/21、`experience26` 29/29、`progress25` 33/33、
  `talent27` 37/37、`tactic24` 29、`cs23` 28、`regress` 結束率 15/15、
  `regress2` 節奏門檻 8/8。
- **既有紅燈（技術債，非回歸訊號）**：`experience26` §17 replay 容量（**TD-19**）、
  `runtime29` §29 順序公平性（**TD-21**，HEAD `3adf8f7` 即存在）。
  這兩支會如實回報 FAIL，**不得為了讓它們變綠而放寬門檻**。
- **已失效（S27 起即紅，非本次改動所致，勿當回歸訊號）**：`check_equiv06/07/08`
  （import 不存在的 `tools/src/LogicEngine.s05.js` fixture）、`check_hero08`、
  `check_mount09`（斷言 S09 時代的 AppShell 畫面清單）、`check_loop08`、`check_ux07`、
  `check_final06`、`check_s4integration`。要復用需先修（列為技術債）。
UI 流程改動：build 過之後，仍要在回報中列出「未經瀏覽器實測」的項目，交給使用者或 verifier 檢查，不可宣稱流程正確。

## Sprint 收尾協議（每次 commit 前做）

1. 把本次完成項、未完成項、已知風險，追加到 `docs/handoff/05_Sprint紀錄.md`（追加新節，不改舊內容）。
2. 先 `git status` 核對：清單裡出現本次沒動過的檔案（OneDrive 暫存、log、scratch）→ 先查明，不加入。然後 `git add <明確檔案清單>`（不用 `git add .`）→ `git commit -m "Sprint NN: <內容>"` → `git push origin main`（只在使用者要求 push 時）。
3. 禁止 `git reset --hard`、`git clean`、`rm -rf`（全域 CLAUDE.md 已規定，這裡再提醒一次）。

## 派工與驗收

派 subagent、選 model、驗收規則：讀 `~/.claude/playbook/10_DISPATCH.md`。

## 跨模型協作（Claude / Codex / 其他 AI）

- **跨模型共用規範在 `AGENTS.md`**（Claude、Codex、GPT 都應優先閱讀）。本檔（CLAUDE.md）保留 **Claude 專用**規則。
- **Codex 專用規則在 `docs/ai/CODEX使用規範.md`**。
- **若 Claude token 不足**，依 `docs/ai/跨模型交接流程.md` 產生交接（先 `git status --short` + `git diff --stat`，回報已完成/未完成/未驗證項，不亂 commit）。
- Claude **hooks 仍是強制檢查機制**，不因 Codex 協作而移除。多個 agent 不得同時改 `LogicEngine` / Store / Replay / contracts。
