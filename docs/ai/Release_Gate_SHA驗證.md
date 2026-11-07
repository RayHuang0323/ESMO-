# Release Gate：SHA 守門與驗證收據

> 適用：Claude、Codex、其他 AI，以及未來的 CI。
> 工具：`tools/release_gate.mjs`（CLI）、`tools/lib/releaseGate.mjs`（共用庫）、`tools/check_release_gate_guard.mjs`（自我測試）。
> 只依賴 Node 內建模組；可以從**任何一份**有這支檔案的 checkout，指向**任何一個** worktree 執行。

## 0. 為什麼要有這個（一段話）

2026-11-08 盤點發現：記憶裡寫的「乾淨基線 worktree」`ESMO-acceptance`，實際停在 `feature/fan-f4-ui`、
**落後 `origin/main` 689 個 commit**，而且**沒有 `node_modules`**。拿它去跑 Release Gate，不是驗到 689 個 commit
之前的程式，就是一開始就壞掉；而紅綠燈本身分辨不出來。再加上 `main` 會移動、worktree 名稱會誤導、過去的測試紀錄會過期，
所以規則改成：**驗證之前，把「要驗的 commit SHA」明確指定成參數；工具從工作目錄實際讀 HEAD 比對；不一致就是 FAIL。**
這個規則同時適用 CS／MOBA 的 Release Candidate 以及後續的 main 整合，不綁任何 worktree 名稱或單一 commit。

## 1. 三種結果（與 `AGENTS.md` §7 同一套 exit code）

| 結果 | exit | 意思 | 該怎麼做 |
|---|---|---|---|
| `PASS` | 0 | 所有檢查通過；`run` 時所有被包的指令也都 exit 0 | 才可以說「這個 SHA 在這個環境驗過了」 |
| `FAIL` | 1 | **驗的東西不是指定的東西**，或指令本身失敗：SHA 不符、工作目錄被改、`HEAD` 在驗證中被推進、指令 exit 非 0、遠端 main 已移動… | 修正對象／程式，不要調鬆 gate |
| `BLOCKED` | 2 | **無法完成驗證**：沒有 `node_modules`、依賴與 lock 不符、Node 版本不對、vite 跑不起來、指令逾時、查不到遠端、**沒有這個 SHA 的收據** | 修環境；**不得**當成產品問題回報，也不得當成通過 |
| 用法錯誤 | 64 | 命令列寫錯（不是驗證結果） | 照訊息改指令 |

- **優先序：`FAIL` ＞ `BLOCKED` ＞ `PASS`。** 只要有一項 FAIL 就是 FAIL；任何 FAIL／BLOCKED 都**不會**產生 PASS 收據。
- 被包的指令的 exit code 對應：`0`＝過；`2`＝`BLOCKED`（既有慣例：`run-gate.mjs` 的 `HARNESS_FAIL`、`verify.mjs` 的「沒跑完」都是 2）；逾時或起不來＝`BLOCKED`；其他非 0＝`FAIL`。
- 最後一行永遠是可 grep 的：`RELEASE_GATE RESULT=<PASS|FAIL|BLOCKED> exit=<n> version=… gate=… target=<sha12> actual=<sha12> receipt=…`。**回報時把這一行貼出來。**

## 2. 指令速查（PowerShell）

```powershell
# 工具位置：合入 main 之前，用這個分支 worktree 裡的路徑；合入後用任一 checkout 的 tools\release_gate.mjs
$GATE = "D:\OneDrive\文件\GitHub\ESMO\.sprints\release-gate-sha-guard\tools\release_gate.mjs"
$WT   = "<要驗的 worktree 根目錄>"            # 例如 Codex 的 CS 候選 worktree；必須是根目錄，不接受子資料夾
$SHA  = "<要驗的 commit SHA>"                  # 7–40 位十六進位；見 §3 如何取得

node $GATE preflight    --repo $WT --target-sha $SHA                         # 只預檢（不跑指令）
node $GATE run          --repo $WT --target-sha $SHA --gate build --cmd "npm run build"   # 預檢→執行→收據
node $GATE assert       --repo $WT --target-sha $SHA --require-gate build --require-gate regress   # 整合前查驗收據
node $GATE resolve-main --repo $WT                                           # 查遠端 main「現在」的真實 SHA
```

選項：`--cmd` 可重複（依序執行，第一個失敗就停）｜`--require-gate` 可重複｜`--require-ancestor <sha>`（目標必須包含它，例如目前 main）｜
`--expect-remote-main <sha>`（遠端 main 必須正是它）｜`--require-browser`（也要有 Chrome）｜`--max-age-hours <n>`（預設 24）｜
`--timeout-min <n>`（每個 `--cmd`，預設 120）｜`--receipts-dir <路徑>`｜`--json`｜`--allow-preflight-only`（assert 接受只有預檢的收據，**不建議**）。

## 3. Target SHA：怎麼取得、指定、確認

**取得（每次執行都重新取，不要沿用記憶、文件裡寫的 SHA、或上一次的輸出）：**

| 要驗的是 | 怎麼取得 Target SHA |
|---|---|
| Release Candidate（CS／MOBA 候選） | `git -C <候選 worktree> rev-parse HEAD`（在**候選自己的 worktree** 裡讀） |
| 目前的 main | `node $GATE resolve-main --repo <任一 worktree>`（= `git ls-remote origin refs/heads/main`，**遠端的真值**）。不要用本機的 `origin/main`（可能過期）或本機 `main`（`main` 常被別的 worktree 佔用，而且落後） |
| 整合（合併／推送）之後的 main | 推完再跑一次 `resolve-main`；若不是 fast-forward，合併後的 SHA 與候選不同，**必須對新的 SHA 重新驗證** |

**指定：** 一律用 `--target-sha <sha>`。工具**拒絕**分支名、tag、`HEAD`、`origin/main`（它們會移動）；縮寫至少 7 碼，而且必須解析成唯一的 commit，
長得像 SHA 的分支名也不行。沒給 `--target-sha` 本身就是 FAIL。

**確認：** 工具在 `--repo` 目錄實際執行 `git rev-parse HEAD`，與 Target SHA 比對（`sha_match`）；輸出裡的 `target=` 與 `actual=` 兩欄必須相同。
**不能**用分支名稱、worktree 資料夾名稱、或過去的測試紀錄代替這個比對。

## 4. 執行前的必要條件與環境

預檢（`preflight`，`run`／`assert` 也會先做）檢查下列項目；括號是不通過時的結果：

| 檢查 id | 要求 | 不通過 |
|---|---|---|
| `target_sha_specified`／`target_sha_format` | 有明確的 SHA（7–40 位十六進位） | FAIL |
| `repo_is_worktree_root` | `--repo` 是 worktree **根目錄** | FAIL（子資料夾）／BLOCKED（不是 git） |
| `sha_match` | 工作目錄的 `HEAD` ＝ Target SHA | **FAIL** |
| `no_git_operation_in_progress` | 沒有進行中的 merge／rebase／cherry-pick | FAIL |
| `working_tree_clean` | 追蹤檔沒有任何修改；`src/`、`public/`、`index.html`、`vite.config.*`、`package*.json` 內沒有未追蹤檔（會被打包）。其他未追蹤檔只警告 | FAIL |
| `node_version` | 符合 `package.json` 的 `engines.node`；沒寫則 ≥ 20（`deploy.yml` 用 Node 20） | BLOCKED |
| `node_modules_present` | 存在、非空、不是失效的 junction | BLOCKED |
| `deps_installed`／`deps_match_lockfile` | `package.json` 每個頂層依賴都安裝了，版本等於 `package-lock.json` | BLOCKED |
| `build_prerequisites` | 有 `scripts.build`、`index.html`、`vite.config.*`，且 `vite --version` 跑得起來 | BLOCKED |
| `disk_space` | 可用空間 ≥ 512 MB | BLOCKED |
| `receipt_dir_writable` | 收據目錄可寫 | BLOCKED |
| `target_descends_from`（選用） | 目標包含 `--require-ancestor` 指定的 commit | FAIL |
| `remote_main_unchanged`（選用） | 遠端 main ＝ `--expect-remote-main` | FAIL（已移動）／BLOCKED（連不上） |
| `browser_available`（選用） | 找得到 Chrome | BLOCKED |

**環境備註**

- 新建的 worktree 沒有 `node_modules`。目前專案慣例是用 junction 指向共用目錄（見 `docs/handoff/08_目前待辦與風險.md` 的 `ESMO-acceptance` 待辦與記憶 `esmo-worktrees-need-own-node-modules`）；junction 失效就會是 `BLOCKED`。
- **被包的指令在 `--repo` 目錄內執行**，所以請用 repo 相對路徑（`node tools/regress.mjs`），讓「gate 程式」與「被驗的程式」是**同一個 SHA**。不要用別的 checkout 的 `tools\…` 去驗這個 worktree。
- 工具只檢查頂層依賴，不驗整棵依賴樹；也不簽章（見 §6）。
- 長 verifier 仍然走 `tools/verify.mjs`，可以包起來：`--cmd "node tools/verify.mjs --resume" --timeout-min 150`。

## 5. 判讀與處理

| 你看到 | 意思 | 怎麼辦 |
|---|---|---|
| `FAIL sha_match` | 驗到的不是指定的 commit | 確認 `--repo` 指對 worktree；要驗的 commit 沒有 checkout 就先 checkout（detached 即可），**不要**改 Target SHA 來配合工作目錄 |
| `FAIL target_sha_format` | 給的是分支名／`HEAD`／縮寫太短 | 先用 `git rev-parse` 或 `resolve-main` 拿到 SHA |
| `FAIL working_tree_clean` | 有未提交修改，驗到的程式 ≠ commit | commit 或還原後，**重新取得 Target SHA**（commit 之後 SHA 會變） |
| `FAIL target_descends_from` | 候選不包含目前 main | 先 rebase／merge main，取得新 SHA，**重新驗證** |
| `FAIL remote_main_unchanged` | main 在你驗證期間移動了 | 重新 `resolve-main`，依新 main 重新整合與驗證 |
| `FAIL post_head_unchanged`／`post_tracked_files_unchanged` | 被包的指令把 HEAD 推進或改了追蹤檔 | 那支指令不該改程式；修好後重跑 |
| `FAIL command: …` | 被包的指令本身失敗 | 這才是要看產品／gate 輸出的情況 |
| `BLOCKED node_modules_present`／`deps_*`／`build_prerequisites` | 環境無法驗證 | 修環境；**不要**改 gate、不要把 BLOCKED 說成通過或說成產品問題 |
| `BLOCKED gate:<名稱>` | 這個 SHA 沒有該 gate 的收據 | 先 `run` |
| assert 的 `FAIL receipt_*` | 收據過期／被改／環境不同／Gate 版本舊／SHA 鏈不一致 | 重新 `run`，不要編輯收據 |

## 6. 驗證收據

- **位置**：`<git common dir>/esmo-release-gate/receipts/`（預設）。所有 worktree 共用同一份、不在工作目錄內、**不會進版控**；`--receipts-dir` 可改。
- **內容**：`gateVersion`、`gate` 名稱、`status`、`requestedTarget`／`targetSha`（完整 40 位）／`actualSha`／`actualShaAfter`／`treeSha`、分支（僅供參考）、`startedAt`／`finishedAt`、
  驗證環境（Node、平台、架構、git 版本、`node_modules` 型態、**已安裝頂層依賴的摘要**、lockfile 在目標 commit 的 blob）、每項預檢的結果、每個指令的 exit code／耗時／輸出尾巴，以及 SHA-256 `digest`。
- **失敗與被擋也會寫收據**（留紀錄），但它們永遠不是 PASS。
- **`assert` 只採用「該 SHA＋該 gate 的最新一張」**：之後重驗失敗，會蓋掉較舊的 PASS。
- **下列任何一項不成立，收據就不能冒充通過**：摘要相符、Gate 版本＝現行、`status=PASS`、`targetSha＝actualSha＝actualShaAfter＝現在要驗的 SHA`、
  `treeSha` 相符、收據在有效期內（預設 24 小時，且不在未來）、Node 大版本／平台／架構／依賴摘要／lockfile 與現在相同、至少跑過一個指令且全部 exit 0、內部沒有 FAIL／BLOCKED 檢查。
  另外 `assert` 會先**重新預檢**：現在的 HEAD 必須仍是目標、工作目錄乾淨、環境可用——收據原本有效，但 `node_modules` 現在不見了，結果是 `BLOCKED`。
- **限制**：收據只有 SHA-256 摘要，沒有簽章。它擋得住誤改、拿錯、過期、拿舊環境冒充；擋不住有心人重算摘要。要防有心人需要 CI 簽章（見 §9）。

## 7. Codex 正式整合 CS：交付流程與交接範例

**原則：不要假設 main 的 SHA 永遠不變。** 每一次都重新 `resolve-main`；候選要先包含當下的 main；整合前後各驗一次。

```powershell
$GATE = "<含有 tools\release_gate.mjs 的 checkout>\tools\release_gate.mjs"
$WT   = "<Codex 的 CS 候選 worktree 根目錄>"

# ① 取得 Target SHA（候選）與目前 main 的真值，並寫進交接單
$RC   = (git -C $WT rev-parse HEAD).Trim()
$MAIN = (node $GATE resolve-main --repo $WT).Trim()
"RC=$RC  MAIN=$MAIN"

# ② 預檢：候選必須包含目前 main；遠端 main 必須正是剛查到的那個
node $GATE preflight --repo $WT --target-sha $RC --require-ancestor $MAIN --expect-remote-main $MAIN --require-browser

# ③ 對候選逐項驗證（指令在 $WT 內執行；用候選自己的 tools\）
node $GATE run --repo $WT --target-sha $RC --gate build    --cmd "npm run build"
node $GATE run --repo $WT --target-sha $RC --gate regress   --cmd "node tools/regress.mjs"
node $GATE run --repo $WT --target-sha $RC --gate regress2  --cmd "node tools/regress2.mjs"
# 再加上 CS 自己要求的 gate（名稱自訂，assert 時要用同樣名稱），例如：
# node $GATE run --repo $WT --target-sha $RC --gate cs-gates --cmd "node tools/check_cs23.mjs" --timeout-min 60

# ④ 整合前最後查驗（會重新預檢，並確認 main 仍沒動）
node $GATE assert --repo $WT --target-sha $RC --require-gate build --require-gate regress --require-gate regress2 `
     --require-ancestor $MAIN --expect-remote-main $MAIN
#    exit 0 才可以整合。1／2 一律不整合。

# ⑤ 整合（fast-forward）→ 推送 → 再查一次遠端 main
$NOW = (node $GATE resolve-main --repo $WT).Trim()
if ($NOW -eq $RC) { "fast-forward：main 就是已驗證的 $RC，收據仍然有效" } else { "main 的 SHA 是 $NOW，不是 $RC ⇒ 在 $NOW 上重新驗證（見 ⑥）" }

# ⑥ 若整合結果不是 $RC（例如 merge commit、或別人先推了）：對新 SHA 另開 worktree 重新驗證
git -C $WT worktree add --detach "<新路徑>" $NOW
#    再依 ③④ 對 $NOW 跑一遍（新 worktree 要有可用的 node_modules）
```

**簡短交接單（貼在回報裡，缺一欄就是不完整）**

```
Release Gate 交接單
- 候選 worktree : <路徑>
- Target SHA    : <40 位>   取得：git -C <路徑> rev-parse HEAD   時間：<ISO>
- 當下 main     : <40 位>   取得：resolve-main                    時間：<ISO>
- 候選包含 main : 是（--require-ancestor 通過）
- 要求的 gate   : build, regress, regress2, <CS gate…>
- 結果          : 貼 RELEASE_GATE RESULT=… 那幾行（preflight、每個 run、assert）
- 收據          : <git common dir>\esmo-release-gate\receipts\（檔名含 SHA 前 12 碼）
- 未驗證項目    : <逐條列出，例如手機真機、未跑的 browser gate>
```

**常見錯誤（這個機制要擋的）**

- 用 `ESMO-acceptance`（或任何「記得是乾淨基線」的 worktree）當驗證環境：它的 HEAD 是什麼就驗什麼；`target=` 與 `actual=` 不同就是 FAIL。
- 拿昨天的測試結果當今天的：收據綁 SHA、環境、時間，過期或環境不同都不算。
- 在候選 worktree 裡改了東西再驗：`working_tree_clean` 會 FAIL；要先 commit 並重新取得 SHA。
- 驗完才 rebase：SHA 變了，收據作廢，要重驗。
- 用分支名當目標：直接 FAIL。

## 8. 與其他機制的關係

- **不取代** `tools/verify.mjs`、`regress`、`browser gate`：它不定義任何產品斷言，只負責「驗的是對的 commit、環境可驗、留下收據」。包住它們即可。
- **不改任何既有 gate 的通過標準。** 既有的已知紅燈（見 `CLAUDE.md`）照舊如實回報，不得為了拿到 PASS 收據而放寬。
- 自我測試：`node tools/check_release_gate_guard.mjs`（目前 118 項：SHA 不符、分支名當目標、髒工作目錄、缺 `node_modules`／失效 junction／依賴版本不符、Node 版本不符、指令失敗／逾時／改 HEAD、收據被改／過期／舊 Gate 版本／舊環境／舊 SHA、多個 worktree、遠端 main 移動、用法錯誤…）。改這個工具之後必跑。

## 9. 尚未做的事（需要 Owner 決定才做）

- **接進正式 CI（`deploy.yml`）**：未實作。若要接，最小方案是在 build 之前加一步 `node tools/release_gate.mjs preflight --repo . --target-sha ${{ github.sha }}`（CI 上 HEAD 必然等於 `github.sha`，主要把關依賴與 lock 一致）。
  依 Owner 2026-11-08 裁定（TD-DEPLOY 追蹤期間不改 `deploy.yml`），**目前不動**。
- 簽章（防有心人偽造收據）：未做。
- 全依賴樹驗證：未做（只驗頂層依賴）。
- 把 `verify.mjs`／各 browser gate 內建收據：未做（目前用 `run --cmd` 包住即可，不改它們）。
