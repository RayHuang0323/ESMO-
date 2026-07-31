# Milestone K0 Report — J-close 部署紀錄同步 ＋ TD-17 驗證工具整理

日期：2026-07-31
狀態：**兩項任務都完成。** 過程中發現一筆**既有但先前看不見**的公平性紅燈（TD-21）。
未 push、未部署。

rollback tag：`milestone-k0-baseline` → `3038945`（＝ J-close 已部署的狀態；本輪建立，未覆蓋既有 tag）

## 0. 版本狀態（開工前確認）

| 項目 | 值 |
|---|---|
| HEAD | `3038945` |
| origin/main | `3038945`（同步） |
| 未追蹤產物 | 88 筆（與長期基準相同） |
| J-close 部署 commit | **`3038945`**，GitHub Pages 成功 |

## 1. 文件同步：J-close 改為「已 push、已部署，待人工驗收」

`docs/handoff/08_目前待辦與風險.md`、`docs/handoff/05_Sprint紀錄.md`、
`docs/04_更新日誌.md` 皆已標記 J-close 的部署 commit `3038945`，
狀態由「已完成，未 push」改為「**已部署，待 Ray 線上與 Android 真機驗收**」。

## 2. TD-17：不是「太大太慢」，是重複執行

### 根因量化

之前四次嘗試都被時間上限中止，判斷是「這兩支很大很慢」。實際把巢狀呼叫圖
展開之後，數字完全不是那個故事：

```
一次 check_moba_runtime29 ＝ 63 個子行程
  tactic24 ×16   cs23 ×8      progress25 ×8   regress ×8
  regress2 ×8    flow09 ×6    experience26 ×4  talent27 ×2
  build ×2       stats28 ×1
```

`regress` 單跑要 23 秒、`tactic24` 要 226 秒——`tactic24` 跑 16 遍就是一小時。
**斷言本身沒有問題，是同一份斷言被重跑很多次。**
呼叫鏈：runtime29 → stats28 → talent27 → experience26 → progress25 → tactic24，
而 runtime29 又直接再跑一次 talent27／experience26／…，於是變成指數式膨脹。

### 修法（最小改動，沒有第二套框架）

**A. 新增 `tools/verify.mjs`——驅動器，不是驗證框架。**
它不定義任何新斷言、不改任何判準，只負責「把既有腳本各跑一次、記住結果、可以續跑」：

```
node tools/verify.mjs --list                    列出 18 個區段與上次結果
node tools/verify.mjs --only=regress2           單段
node tools/verify.mjs --only=tactic24,regress   多段
node tools/verify.mjs                           全部（依序，快的先跑）
node tools/verify.mjs --resume                  只跑還沒通過的
```

每段跑完就寫 `tools/.verify-state.json`，**中途被砍也不會丟掉已完成的部分**。

**B. 5 支會 fan-out 的腳本加上 `ESMO_VERIFY_FLAT=1` 閘門**
（`runtime29` / `stats28` / `talent27` / `experience26` / `progress25`）。
runner 會把這個環境變數傳給子行程，於是它們跳過自己的巢狀子驗證——
因為那些子項目 runner 已經各跑一次了，覆蓋率相同。

⚠ **被跳過的檢查標成 `⏭ SKIP`，明確排除在分母外，不算通過。**
例如 `stats28` 在 flat 模式印的是
`21/21 通過　+ 8 段委派給 runner（未計入分母）`。

### 效果

| | 修改前 | 修改後 |
|---|---|---|
| `check_moba_stats28` | 87 分鐘（實測）／常被中止 | **158 秒**，21/21 |
| `check_moba_runtime29` | 四次嘗試全部跑不完 | **28 秒**，34/35 |
| 全套 18 段 | 從來沒有跑完過 | **556 秒（9.3 分鐘）**，16/18 |

### 沒有做的事

- **沒有刪任何斷言**：flat 模式只是把「由誰執行」換了地方，判準一字未改。
- **沒有放寬門檻**：runner 登記的 `shape` 填的是各支**健康時的完整數字**，
  所以真正紅的兩段照樣回報 FAIL。
- **沒有強制 exit 0**：FAIL ⇒ exit 1；逾時 ⇒ exit 2；跑全部但有區段沒結果 ⇒ exit 2。

## 3. 全套跑完之後看見的兩個紅燈

這是本輪最重要的產出——**先前它們是被時間上限蓋住的**。

### (1) `experience26 §17`：Replay 單場 2492KB > 2MB —— 既有已知（TD-19）

Ray 先前已裁決保留。數字與 I-close、J 相同（836 frames · 2492KB），沒有變差。

### (2) `runtime29 §29`：陣列順序影響勝負分佈 —— **新看見的既有紅燈（TD-21）**

```
藍勝 正序 55% / 反序 35% ⇒ 位移 20pp（門檻 ≤15pp）
```

把 `players` 陣列反轉（同一批物件、只換擺放順序）之後，藍方勝率掉 20 個百分點。

**這不是 K0 造成的，也不是 E～J 任何一輪造成的。** 我把 §29 的計算抽出來，
在七個版本各跑一次 40 seeds：

| 版本 | 位移 |
|---|---|
| `milestone-e-baseline` | 20pp |
| `milestone-f-baseline` | 20pp |
| `milestone-g-baseline` | 20pp |
| `milestone-h-baseline` | 20pp |
| `milestone-i-baseline` | 20pp |
| `milestone-j-baseline` | 20pp |
| HEAD（J-close） | 20pp |

**七處完全相同**（連正序/反序的 55%/35% 都一模一樣）⇒ 至少在 Milestone E 之前就存在。
本輪 `src/` 一行未改（`git diff 3038945 -- src/` 為空），也不可能是 K0 引入的。

### 但這是**回歸**，不是「一直都這樣」

`docs/handoff/08_目前待辦與風險.md` 的
「【P0・已修，長期釘住】players 陣列順序決定勝負」一節記載：Sprint 29A 修掉五個根因後，
位移從 **48pp** 降下來，並把 §29 的 ≤15pp 訂為長期防線。現在是 20pp
⇒ **S29A 之後、Milestone E 之前有東西把它推回門檻之上**。

最可疑的區間是 S29B5／Milestone C–D 的世界幾何與導航改動——runtime29 §28 上方的既有註記
剛好寫著「S29B5 世界幾何改變後，v1 整場勝率位移不再是穩定 detector」，
顯示當時就注意到這條指標的行為變了。**這只是線索，我沒有進一步二分定位**
（那需要更多歷史 tag 與更多次 40-seed 跑分），列為 TD-21 的下一步。

runtime29 檔內 §29 下方的既有註記已指出方向：`fx` 型別骰與參戰骰跟著 players
迭代順序抽 rng ⇒ 反轉後隨機序列不同。要判定這是**混沌**（同一場的隨機序列不同）
還是**偏差**（某一方系統性佔便宜），需要加大 seed 數並分側統計。

**我沒有動這個門檻，也沒有動引擎。** 已登記為 **TD-21**，需要獨立一輪處理
——那會動到 rng 流，必然改變所有數值並需要重新校準全部 verifier，
和「整理驗證工具」混在一起就分不清是誰造成的。

## 4. 驗證

| 驗證 | 結果 |
|---|---|
| `npm run build` | ✅ exit 0（runner 的 `build` 區段，11s） |
| runner `--list` | ✅ 列出 18 段與上次結果／耗時 |
| runner 單段（`--only=regress2`） | ✅ PASS，exit 0 |
| runner 多段（`--only=tactic24,progress25`） | ✅ 兩段皆 PASS |
| runner 失敗 exit code | ✅ FAIL ⇒ **exit 1**；未知區段 ⇒ **exit 2**；全綠子集 ⇒ exit 0 |
| runner `--resume` | ✅ 略過 16 個已通過區段，只重跑 2 個未過的 |
| runner 結果彙整 | ✅ 本次 / 累計兩層，並列出尚未執行的區段 |
| `check_moba_milestone_j_close` | ✅ 32/32 |
| `regress2` | ✅ 節奏門檻 8/8 |
| **全套 18 段** | **16/18**（見 §3 的兩個紅燈；exit 1） |

### 誠實聲明

**全套不是全綠，本報告不宣稱全綠。**
16 段通過、2 段失敗（`experience26` TD-19、`runtime29` TD-21），兩者都是既有問題，
都不是本輪造成，也都沒有被隱藏或放寬。runner 的 exit code 是 **1**。

## 5. 是否碰到禁改範圍

**沒有。** 逐項確認：

| 禁改項目 | 本輪是否碰到 |
|---|---|
| Ban/Pick、GameView、Battle UI、手機手勢、featureFlags | ❌ 未碰（`git diff 3038945 -- src/` 為空） |
| LogicEngine、configureMatch/Players/Heroes/Spells | ❌ 未碰（同上） |
| 戰鬥數值、Reward、Replay、BattleResult | ❌ 未碰（同上） |
| 刪斷言／放寬標準／強制 exit 0 | ❌ 未做（見 §2「沒有做的事」） |
| 順手重構／刪除不確定用途的檔案 | ❌ 未做 |

本輪修改**只集中在 `tools/`、`docs/` 與 `.gitignore`**。

## 6. 修改檔案

| 檔案 | 改動 |
|---|---|
| `tools/verify.mjs` | **新增**：分段驅動器 |
| `tools/check_moba_runtime29.mjs` | flat 閘門 ＋ SKIP 報告（不刪斷言） |
| `tools/check_moba_stats28.mjs` | 同上 |
| `tools/check_talent27.mjs` | 同上 |
| `tools/check_moba_experience26.mjs` | 同上 |
| `tools/check_progress25.mjs` | 同上（`t24` 在 flat 模式為 null，加保護） |
| `.gitignore` | 忽略 `tools/.verify-state.json`（本機狀態檔） |
| `docs/09_技術債務清單.md` | TD-17 標為已解決；**新增 TD-21** |
| `docs/04_更新日誌.md`、`docs/handoff/05_Sprint紀錄.md`、`docs/handoff/08_目前待辦與風險.md` | J-close 部署狀態 ＋ K0 紀錄 |

## 7. 未完成／待辦

1. **TD-21（順序公平性 20pp）** —— 本輪只做到「發現、量化、確認非近期造成」，
   沒有修。修它要動 rng 流，需獨立一輪並重新校準。
2. **TD-19（Replay 2492KB）** —— 維持 Ray 的裁決，未處理。
3. **Android 真機與線上驗收** —— Ray 稍後自行進行（K0 未改任何畫面）。
4. `check_dash10`（TD-18）本輪未納入 runner 區段——它是既有紅燈且與本次目標無關，
   刻意不順手處理。

## 8. 回退

- 只退文件：revert 文件那個 commit
- 連同 flat 閘門與 runner：再 revert 前一個
- 比對基準：`git show milestone-k0-baseline`（＝`3038945`）
- ⚠ 回退後 `runtime29`／`stats28` 會恢復成跑不完的狀態（TD-17 重新出現）
