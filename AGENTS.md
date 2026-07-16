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
  （`runtime29` 已巢狀包含 S23–S28 + regress + regress2 + build ⇒ 跑它=跑完全部，約 10–15 分。）
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
