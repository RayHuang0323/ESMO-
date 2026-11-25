# TD-62：純文件 Commit 的證據沿用方案（提案，未實作）

- 狀態：**提案**（2026-11-26）。由 Owner 在 C1＋C2 結案時指示設計。**本輪不改 Release Gate 核心**：`tools/lib/releaseGate.mjs`、`tools/release_gate.mjs`、`.github/workflows/deploy.yml` 都沒動。
- 背景：收據綁「完整 SHA＋tree＋環境＋24 小時」。在已驗證的 `93655403` 之上，就算只加一個文件 Commit（例如 `a7321afe`），它也是沒有收據的新 SHA，`assert` 會 BLOCKED。現在只剩三條路：
  1. 重跑全部 Gate（約 6～8 小時，含四引擎與 P2v2）
  2. Owner 書面例外
  3. 文件不發布

## 1. 原則

1. **不轉移、不修改、不重簽原收據。** 原 SHA（B）的收據原封不動。沿用時要另外產生一張**新收據**，綁新 SHA（D）。這張新收據只證明一件事：D 和 B 的差異都是可以忽略的文件。
2. **預設拒絕。** 只有明確列入白名單的檔案可以算「純文件」。白名單外的任何變更，包括未知檔案、二進位、權限位元、符號連結、submodule，一律 FAIL。
3. **沿用不延長效期。** 新收據的效期是「B 的收據裡最早到期的那張」和「沿用收據自己的效期」兩者取早。
4. **可以重算、可以反證。** 每項檢查都只用 git 物件與本機 build 重算。結果寫進收據，第三方可以照著重跑。

## 2. 新 Gate：`docs-carry`（建議名稱）

```
node tools/release_gate.mjs carry --repo <D 的 worktree> --target-sha <D> --base-sha <B> \
     --require-gate <B 的每個 gate 名稱>...
```

### 檢查項目（全部 PASS 才寫 PASS 收據；任何一項 BLOCKED 就 BLOCKED）

| # | 檢查 | 判定 |
|---|---|---|
| C1 | B 是 D 的祖先，B..D 都是一般 Commit（沒有 merge）；D 的 worktree 乾淨，HEAD 就是 D | 不是 ⇒ FAIL |
| C2 | B 的每個 `--require-gate` 都有 PASS 收據，用現行 `verifyReceipt` 對 **B** 的 SHA 與 tree 驗證（不改驗法）；收據 digest 全部記到新收據 | 缺、過期、digest 不符 ⇒ BLOCKED／FAIL |
| C3 | `git diff --raw --no-renames B D`：每一列都是一般檔（mode 100644）而且路徑在白名單；不能有 mode 變更、符號連結、submodule | 任一列不符 ⇒ FAIL，列出路徑 |
| C4 | **白名單外的 tree 完全相同**：把兩邊的白名單路徑拿掉，D 的 tree 等於 B 的 tree（逐路徑比 blob id） | 不同 ⇒ FAIL |
| C5 | **被讀取的文件不算文件**：靜態掃 `src/`、`tools/`、`scripts/`、`vite.config.*`、`index.html`、`.github/`，只要有任何字串引用到這次變更的 `.md` 路徑或檔名（含 `?raw` import、`readFileSync`、`fetch`），那個檔案就不算純文件 | 有引用 ⇒ FAIL |
| C6 | 依賴與環境相同：`package.json`、`package-lock.json` 的 blob 和 B 相同（C4 已涵蓋）；目前環境的 `depsDigest`、`lockfileBlob`、`nodeMajor` 和 B 的收據相同 | 不同 ⇒ BLOCKED |
| C7 | **產品 bundle 相同**：在 D 用正式模式 build（`npm run build`），算 dist 全部檔案的雜湊（路徑＋內容），要等於 B 的 production 收據記錄的 bundle 雜湊 | 不同 ⇒ FAIL |
| C8 | 測試工具相同：`tools/**`、`tools/fixtures/**` 都在白名單外，C4 已涵蓋；另外把 B 收據裡每個 `--cmd` 用到的腳本 blob 記進新收據 | C4 不過 ⇒ FAIL |

### 白名單（建議初版，越小越好）

- `docs/**/*.md`
- `review/**/*.md`，前提是 C5 確認沒有工具讀它
- 根目錄的 `AGENTS.md`、`CLAUDE.md`、`README*.md`

**不在白名單**（就算副檔名是 `.md` 也一樣）：
- `public/**`：會被複製進 dist，例如 `public/assets/fps/major-weapons-v1/SOURCES.md`
- `src/**`、`tools/**`、`.github/**`、`scripts/**`
- `review/**` 的非 `.md` 檔：`.json`、`.patch`、`cal_results`、圖片等。例如 `check_cal_parity_v24.mjs` 會讀 `review/tactic-book-3a/v24_calibration/…`
- `package*`、`index.html`、`vite.config.*`
- `.claude/**`、`.agents/**`：會改變 AI 工具行為，不算文件

> 實測：218 支 `tools/*.mjs` 引用 `review/` 路徑。所以「`review/` 都是文件」這個假設不成立，C5 不能省。

### 收據內容（新 schema 欄位）

`kind: "docs-carry"`、`baseSha`、`baseTree`、每個 base 收據的 `{gate, file, digest, finishedAt, expiresAt}`、`diff`（路徑＋舊/新 blob）、`bundleSha256`（D 的 build）、`baseBundleSha256`、`whitelistVersion`、`expiresAt = min(各 base 收據到期, 本收據 finishedAt＋24h)`。

### `assert` 的變更

對 D 的每個 `--require-gate`，接受下列任一情況：
- (a) D 自己有 PASS 收據（現行規則），或
- (b) D 有 PASS 的 `docs-carry` 收據，而且它引用的 base 收據**仍有效**（重新驗證 digest 與效期）。

輸出要清楚標示「沿用自 B」。

### 現行收據要補的欄位

目前 production 收據沒有記 bundle 雜湊，C7 無從比對。實作時要讓 production gate 把 dist 雜湊寫進收據。舊收據沒有這個欄位，就不能被沿用（BLOCKED，不推定）。

### 必要的反向測試（實作 Sprint 的驗收）

以下每一項都必須 FAIL 或 BLOCKED：
1. 改一行 `src`
2. 改 `review/**/x.json`
3. 改 `tools/*.mjs`
4. 改 `package-lock.json`
5. 只改檔案權限位元
6. 新增符號連結
7. 改一個被工具讀取的 `.md`
8. 改 `public/**/SOURCES.md`
9. 中間夾 merge Commit
10. base 收據過期
11. base 收據 digest 被竄改
12. base 收據是 FAIL
13. B 不是 D 的祖先
14. dist 雜湊不同（例如注入一個環境變數）

正向測試：只改 `docs/**/*.md` ⇒ PASS，而且到期時間等於 base 最早到期。

## 3. 避免純文件更新觸發 Pages 部署

目前 `deploy.yml` 在 push main 時一律部署。建議做法：

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - 'review/**/*.md'
      - '*.md'
  workflow_dispatch:
```

- **效果**：一次 push 如果只含白名單路徑，就不會觸發部署。正式站繼續提供 B 的 bundle，而 B 的產品和 D 相同，所以沒有差異。只要 push 裡任何一個檔案不在這些路徑，就照常部署。
- **限制一**：`paths-ignore` 比白名單寬。它不做 C5，被工具讀取的 `.md` 也會被略過部署。但那種情況 C5 會讓 `docs-carry` FAIL，發布流程本來就會被擋下。部署過濾只省 CI，**不能取代** `docs-carry`。
- **限制二**：main 的 SHA 和正式站的建置來源 SHA 會不同。發布報告要寫「正式站建置來源 = B」。驗證正式站時，比對的是 bundle 雜湊（第 2 節的清單），不是 main SHA。
- **限制三**：改 `deploy.yml` 本身不是純文件，需要走完整 Gate。建議和 `docs-carry` 一起，放在同一個工具 Sprint。
- **另一個發現**：CI 用 `npm install --legacy-peer-deps`，不是 `npm ci`。CI 的依賴沒有完全被 lockfile 鎖住，正式站 bundle 可能和本機驗證的不同。建議另立技術債：改成 `npm ci --legacy-peer-deps`，並在 CI 印出 dist 雜湊。

## 4. 收據效期與長時間測試

現況：所有收據一律 24 小時，從 `finishedAt` 起算。C1＋C2 最早的收據（`c1c2-moba`，07:01Z）到最後一張（P2v2，16:01Z）相差 9 小時。只要一次休眠、一次 Pages 500，發布窗口就很緊。

建議**分兩級**：

| 等級 | Gate | 效期建議 | 理由 |
|---|---|---|---|
| 純函數 | moba、det、platform、active、v21a、Golden、Node 端回歸 | 72 小時；只要 tree、`depsDigest`、`nodeMajor` 不變 | 結果只取決於 tree、依賴、Node 版本，這三項收據裡都有，時間本身不會讓它失效 |
| 環境敏感 | browser、P1／P2v2、四引擎、production preview | 維持 24 小時，另外記錄瀏覽器版本（Chrome／Firefox／WebKit build）；`assert` 時版本不同就失效 | Chrome 會自動更新；效能與引擎行為和瀏覽器版本有關 |

其他建議：
- **排程**：長時間的環境敏感 Gate 排在最後跑，純函數 Gate 先跑。發布窗口由最早到期的那張決定。
- **重跑**：收據過期時只重跑過期的那張，不必全部重跑。現行 `assert` 已經是逐張驗，不需要改。
- **不採用**：「從 `startedAt` 起算」或「延長所有效期」。前者讓長測試更吃虧；後者等於放寬全部 Gate。

## 5. 影響評估

| 範圍 | 影響 |
|---|---|
| 程式 | `tools/lib/releaseGate.mjs`：新增 `verifyDocsCarry`，`assertReceipts` 接受 carry；`tools/release_gate.mjs`：新增 `carry` 子命令；production gate 記錄 dist 雜湊；`deploy.yml` 加 `paths-ignore`（可選）。`src/` 零變更 |
| 文件 | `docs/ai/Release_Gate_SHA驗證.md`、`AGENTS.md` 的發布規則、`09` TD-62 |
| 風險 | 白名單太寬會讓產品輸入被當成文件，所以以 C4、C5、C7 三重擋下；C7 要求 B 有 bundle 雜湊，舊收據都不能沿用 |
| 工作量 | 約 1 個工具 Sprint：實作、14 組反向測試、自我測試，再用 Release Gate 驗它自己（Gate 工具本身不在白名單） |
| 第一個實際受益者 | 本輪文件 Commit（`a7321afe` 之上的收尾）。不過 `93655403` 的收據在 2026-11-26T07:01Z 起陸續到期，而且舊收據沒有 bundle 雜湊。所以**本輪文件不能用這個機制發布**，仍需 Owner 書面例外，或等下一次產品發布時一起帶上 |

## 6. 本輪文件 Commit 的建議處置

這個文件 Commit 疊在 `a7321afe` 上。`93655403..HEAD` 只動白名單路徑，可以用 `git diff --stat 93655403 HEAD` 與 `git diff --raw` 驗證。

建議**先不推送**，下列兩條擇一：
1. **Owner 書面例外，立即推送。** 推送前提：附上 C3、C4 的手動檢查輸出（`git diff --raw`，只有 docs、review 的 `.md`、AGENTS.md），以及 Workflow 跑完後的正式站 bundle 雜湊，證明和本報告第 2 節相同。這次推送**會**觸發 Pages 重新建置，因為還沒有 `paths-ignore`。
2. **等 TD-62 實作後，或下一次產品發布時，一起帶上。** AGENTS.md §12 的 PID 安全規則在這段期間只存在本機分支，其他 AI 看不到。這是這條路的代價。

建議選 **1**：
- 文件只有 `.md`，風險可以用手動 C3、C4 完全排除。
- PID 安全規則需要盡快讓 Codex、GPT 看到。

## 7. 補充：實測發現有文件本身就是測試輸入（2026-11-26，寫本方案時）

用本輪的文件 Commit 試做 C3／C5：
- **C3**：`git diff --raw 93655403 HEAD` 共 12 列，全部是 mode 100644 的 `.md`（9 個修改、3 個新增）。產品輸入（`src`、`public`、`tools`、`package*`、`index.html`、`vite.config.js`、`.github`）的差異是 0 個檔。
- **C5**：有工具讀到其中的文件。
  - `tools/check_cs_season_contract.mjs`、`tools/check_home_team_contract.mjs` 會讀 `docs/ai/跨模型交接流程.md` 的內容做 `has()` 斷言，也就是說「交接文件是契約的一部分」。
  - `tools/check_online_foundation_v2a.mjs` X7 把 `AGENTS.md`、`docs/handoff/*` 視為共用檔。這是看 git diff，不讀內容。
- **本輪實跑**（文件追加後）：
  - `check_cs_season_contract`：exit 0
  - `check_home_team_contract`：讀交接文件的 3 條全部 PASS；另外 4 條 FAIL 是 `src` 路由與標記檢查（`src` 和 `93655403` 相同；05 早有紀錄這支在 main 上就是紅的）⇒ 36/40，和文件無關

**對方案的修正**：C5 不能只是「有引用就 FAIL」，否則連交接文件都不能改。改成兩段：
- **C5a**：找出讀取這次變更檔案的工具，用靜態掃描找路徑字串。
- **C5b**：在 D 上只重跑這些工具，結果要和 B 上的結果**逐條相同**。所以 B 的收據要記錄每條檢查的結果，不能只記 exit code。不同 ⇒ FAIL。

成本很低：通常只有幾支輕量的契約檢查。這也代表 `has()` 型契約斷言，在文件被「刪改」時會紅，「追加」時不會。所以要強制文件只能追加，正好由 C5b 自動把關。
