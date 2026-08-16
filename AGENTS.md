# AGENTS.md — ESMO Cross-Agent Development Rules

> 所有 AI agent（Claude Code、Codex CLI、GPT、其他）動工前的**共用主檔**。
> Claude 專用規則見 `CLAUDE.md`；Codex 專用規則見 `docs/ai/CODEX使用規範.md`；
> 交接流程見 `docs/ai/跨模型交接流程.md`。本檔用繁中，檔名/指令/符號保留英文。

## 1. Project Goal

ESMO 是 **Web MOBA / 電競經營模擬遊戲**。目標不是程式實驗，而是做出
**架構穩定、容易維護、可擴充、具商業潛力**的遊戲。任何改動以「不破壞既有可玩流程、
不累積技術債」為前提；寧可小步慢走，不要大重構賭一把。

## 2. Tech Stack

- React 18 + Vite 5
- React Three Fiber + Three.js（3D 對戰渲染）
- Zustand（狀態管理）
- Node verifier scripts（`tools/*.mjs`，**專案沒有測試框架**，這就是測試）
- GitHub Pages（push main → GitHub Actions 建置部署）

## 3. Current Architecture Summary

新 agent 只需知道「該先看哪」：

- **MOBA battle**：`src/LogicEngine.js`（純邏輯引擎）＋ `src/MobaView3D.jsx`（R3F 渲染）
  ＋ `src/GameView.jsx`（整合殼）＋ `src/battle/`（呈現層、moba 子系統）。
- **CS / FPS battle**：`src/battle/fps/EsportsFPS3D.jsx`（Legacy 獨立模型）。
- **platform router / flow**：`src/platform/router/`、`src/AppShell.jsx`。
- **profile / progress / reward**：`src/platform/profileStore.js`、`src/platform/progress/`。
- **replay**：`src/battle/moba/replay/`、`src/platform/contracts/mobaReplay.js`。
- **verifier tools**：`tools/*.mjs`。
- **docs / handoff**：`docs/handoff/`（現況）、`docs/design/`（設計文件）。

危險巨檔（**禁止整檔 Read**，只 Grep 定位）：`src/EsportsGame.jsx`(1.4MB)、
`src/App.jsx`(378KB)、`src/data/heroImages.js`(396KB，全 data URI)。

## 4. Protected Systems（高風險，改前必說明原因並跑對應 verifier）

- `src/LogicEngine.js` —— 對戰大腦，決定性模擬，禁止重寫。
- Progress / Reward / `src/platform/contracts/matchProgressTransaction.js` —— 發獎冪等。
- `BattleResult.v2`（`src/battle/battleResult.js`）、`CsMatchResult.v1` —— 對外契約。
- Replay（frame 格式、determinism）—— 播放已存 frame，**不重跑引擎**。
- `profileStore` / persistence / localStorage migration —— 玩家資料，遷移易毀檔。
- `GameRouter` / flow —— 畫面流程。
- verifier tools —— 安全網本體。
- GitHub Pages deploy config —— 部署。

## 5. Development Principles

- **Repository-wide language rule**：所有回報、review finding、規劃、handoff 與最終摘要一律使用繁體中文；檔名、指令、程式碼與符號保留原格式。

- **小步修改**，不任意大重構。
- **不寫死**勝負、擊殺數、獎勵、result。
- **不用 UI 假資料**掩蓋引擎缺資料——缺資料就補可靠來源或誠實標記。
- **不為了測試綠燈刪 verifier**；斷言真的壞掉才改，且需在 `05_Sprint紀錄.md` 說明原因。
- **手機是第一級目標**（見 §手機優先）。
- Node **無法**證明手機 UX / FPS / 觸控手勢 / 視覺體感 —— 一律誠實標記「未實測」。

## 6. Sprint Workflow

**先 Audit → 再實作 → 再 verifier → 再文件 → 再 commit / push / Pages**。
完成後**停止**，不自動開始下一 Sprint、不開始使用者未要求的 Season / BO3 / AI Teams / 多人連線。

## 7. Verifier Rules

- 碰 **MOBA battle** 依影響範圍跑：current Sprint verifier、`runtime29`、`pacing29b1`、
  `presentation29b2`、`controls29b3`、`regress` / `regress2`、`build`。

### ⚠⚠ 長 verifier 一律走 `tools/verify.mjs`（2026-08-09 更正）

**本節原本寫「`runtime29` 跑它=跑完全部，約 10–15 分」——那是錯的。**
直接跑 `check_moba_runtime29.mjs` 會展開 **63 個子行程** ⇒ **跑不完**；
`check_moba_stats28.mjs` 直接跑約 **87 分鐘**。實測對照（走 runner 後）：
`experience26` 7 秒、`stats28` 226 秒、`runtime29` 47 秒。

```
node tools/verify.mjs --list              # 區段清單與狀態
node tools/verify.mjs --only=<id>[,<id>]  # 單段／多段
node tools/verify.mjs --resume            # 只跑還沒通過的
node tools/verify.mjs                     # 全部
```

runner 對每個子行程設 `ESMO_VERIFY_FLAT=1` ⇒ fan-out 腳本跳過巢狀子驗證
（那些子項目 runner 已各跑一次）；被跳過的標成 **SKIP 且排除在分母外**。
每段跑完即寫 `tools/.verify-state.json`，中斷可 `--resume`。

**長驗證回報規則（不可妥協）**：
1. **必須保存完整 stdout + stderr log 與 checkpoint**，不得只記最後一行 assertion count。
2. 這些腳本的 `ck()` 累積到最後才印 ⇒ **執行中 log 是 0 bytes 屬正常**，
   不得用 stdout byte 數判斷卡住或失敗。
3. 被 timeout／中止／0 stdout／靠推論得到的結果，一律標
   **NOT RUN / TIMEOUT / SKIP，禁止標 PASS**。
4. 既有紅燈（技術債）必須具名並附編號，不得為了變綠而放寬門檻：
   目前為 `experience26` §17 replay 容量（TD-19）、`runtime29` §29 順序公平性（TD-21）。

### ⚠ 指標規則：exec summary counter 只作診斷，不作 gameplay outcome KPI

`exec[side].*` 這類彙總計數器是為**診斷**寫的。已知陷阱：
`towerPushes`（隊伍層級、每 10 秒最多 +1 ⇒ 是「塔邊責任週期」，**不是推進強度**）、
`splitPushActions`（8 秒節流）、`dragonContests` / `baronContests`（門檻只是「有人到場」）、
`invadeKills`（實測 319 次入侵 0 擊殺）。
**推進強度一律用 `p.twrDmg` ＋ 推掉的塔數 ＋ 主堡傷害。**
使用任何 `exec.*` 前，必須在報告註明：層級（個人/隊伍）、遞增條件、有無節流或上限。
詳見 `review/moba-combat/METHOD_CAVEAT.md` 開頭兩條工程規則。

- 碰 **Progress / Reward** → 跑 `check_progress25`（冪等、不重複發獎）。
- 碰 **Replay** → 跑含 replay 斷言的 verifier（`experience26` / `presentation29b2` / `controls29b3`）。
- **所有子行程必須檢查 exit code 與輸出形狀**（不可只看有沒有印字）。
- 各支檢查數被彼此的輸出形狀正則硬編碼（改一支可能連動）：見 `CLAUDE.md` 現役清單。

## 8. Git Rules

- **不可 commit broken build**；**不可 push 未驗證改動**。
- **不可 commit** scratchpad / `_backup_*` / probe output / logs / OneDrive 暫存檔。
- commit 前必跑 `git status --short` 與 `git diff --stat` 核對清單。
- `git add <明確檔案清單>`（**不用 `git add .`**）。
- commit message：`Sprint XX: description`（跨模型 doc 任務等非 Sprint：清楚描述即可）。
- **禁止** `git reset --hard` / `git clean -f` / `git push --force` / `rm -rf`（scratchpad 除外）。

## 9. Documentation Rules

改架構 / 流程 / 風險 / Sprint 狀態時更新：
`docs/handoff/00_目前專案狀態.md`、`05_Sprint紀錄.md`（**追加新節，不改舊內容**）、
`06_目前主幹架構.md`、`08_目前待辦與風險.md`。設計細節放 `docs/design/`。

### Documentation Reading Strategy

- 新 agent **先讀 `docs/README.md`**（文件索引與導航）。
- **不得預設掃描完整 `docs/`**；按任務選讀 `design/` 文件。
- `AGENTS.md` 只放**硬規則與導航**，不重複詳細設計（設計在 `docs/design/`）。
- 文件衝突依 **`docs/README.md` §五 的優先順序**處理。
- **發現衝突時先回報**，不可自行選擇較舊文件。

## 10. Multi-Agent Rules

- 每個 Sprint **只能有一個 owner agent**。
- 子代理（subagent）**預設唯讀**。
- verifier 子代理**只可改 `tools/`**。
- **只有 owner agent 可 commit / push**。
- **不得讓多個 agent 同時改** `LogicEngine` / Store / Replay / contracts（衝突高風險）。
- Codex 接手時**先讀 AGENTS.md 與 handoff**（見 §11）。

## 11. Codex Takeover Checklist（Codex 接手前必讀，依序）

1. `AGENTS.md`（本檔）
2. `docs/ai/CODEX使用規範.md`
3. `docs/ai/跨模型交接流程.md`
4. `docs/handoff/00_目前專案狀態.md`
5. `docs/handoff/05_Sprint紀錄.md`（最後一節）
6. `docs/handoff/06_目前主幹架構.md`
7. `docs/handoff/08_目前待辦與風險.md`
8. 本次 Sprint 提示詞
9. `git status --short` / `git diff --stat`

## 12. Forbidden Actions

- 不可清除 localStorage，除非明確授權。
- 不可寫死 winner / kill count / result。
- 不可重複發獎。
- 不可破壞 replay determinism。
- 不可刪 verifier 讓測試通過。
- 不可加入未授權 LOL / 傳說（League of Legends）素材。
- 不可未驗證就宣稱手機體驗完成。
- 不可自動開始下一 Sprint。

## 手機優先原則

手機是第一級目標。UI 需在 320 / 360 / 390 / 430px 不水平溢出；面板不長期遮戰場；
關閉鈕固定頂部；小地圖在 safe area。響應式判斷唯一來源 `src/ui/useViewport.js`。
**Node 驗不了視覺 / FPS / 觸控** ⇒ 交付時列「未經真機實測」清單交使用者驗收。

## UI 呈現原則（2026-08-04 起，適用**所有**新功能）

Ray 的長期要求：功能上 UI 時，**優先做成圖形化、好操作的介面**，而不是純數字或表格。
可以有克制的視覺特效。**但特效與版面不得影響功能邏輯。**

### 該做

- 預設選擇視覺化形式：圖表、進度條 / 量表、圖示、色彩化狀態標籤、預測條。
  能用一眼看懂的圖形表達，就不要只丟一個數字。
- 克制的動態：轉場、數值變化時的高亮、狀態切換的漸變。
- 狀態要有顏色語意（正常／警告／危險），並且**同時有文字**，不能只靠顏色。

### 不該做

- **不得為了顯示另算一套數字。** 畫面顯示的值必須來自邏輯用的同一份計算。
  範例（Milestone N）：`buildWeekLines` 同時服務週結算、本週預覽與現金預測 ⇒
  畫面上的數字就是結算會用的數字。第二套計算＝第二套真相，等同新增假資料。
- 特效不得擋住互動、不得延遲狀態更新、不得改變 state 形狀或 Store 寫入。
- 不得因為要「做得漂亮」而動 LogicEngine / 契約 / Balance（見 §4、§12）。

### 一致性（2026-08-04 追加，適用全專案）

文字、數字、顏色是 UI 的一部分，必須**全遊戲一致**。新畫面不得自創寫法。

- **數字**：金額一律「$N.N萬」（Store 存元，顯示換算）；百分比一律整數 `%`；
  時間一律「S{賽季}・第 N 週・第 D/7 天」。同一個量在不同畫面不得有兩種格式。
- **顏色語意**：綠＝正向／收入／可用，紅＝負向／支出／阻擋，
  琥珀＝警告／即將到期，灰＝停用／未知。顏色**必須配文字**，不可只靠顏色辨識。
- **用詞**：同一概念只用一個詞（例：一律「一隊／替補／未登錄」，
  不要混用「主力／先發／正選」）。錯誤訊息用可讀中文，不露出錯誤碼。
- **色票來源**：`src/ui/theme.js` 的 `GC` 是唯一色票來源；
  畫面專用色（如 FinanceScreen 的深紫調）必須在檔頭說明為何需要，不可隨手新增。

⚠ 目前主幹**尚未全面統一**（各畫面是不同 Sprint 陸續恢復的）。
新畫面一律照上述規則；既有畫面的統一列為獨立工作項，不夾帶在功能 Milestone 裡改，
以免把呈現層改動混進功能 commit 而難以回溯。

### 與既有規範的關係

本節是**疊在** Legacy Experience 規格之上的美化層，不覆蓋它：
資訊密度、流程與欄位仍以 `docs/handoff/02_Legacy_Recovery_規格.md` 為準
（見 CLAUDE.md 最高原則）。手機優先原則同樣優先於視覺華麗度——
特效不得讓 320px 溢出或掉幀。

視覺效果一律列入「未經真機實測」清單，交使用者驗收。
