# v21 Sprint 0：Owner 裁定、本機預覽與後續範圍

- 日期：2026-11-10。分支 `feature/moba-v21-sprint0`（本機，未 Push，未合併 main）。
- **狀態：v21 發布 BLOCKED / NOT APPROVED。**

## 1. Owner 裁定（2026-11-10）

1. Sprint 0 停止正確。
2. **原方案三的發布判準不予核准。**
3. 不開 Sprint 1、不放寬 G-A8、不直接發布 v21。
4. 保存本輪規劃、分析、Reviewer 結論與 Gate 紀錄，標記 BLOCKED / NOT APPROVED；可建立本機文件 commit，不 Push、不合併 main。
5. 不動 Codex 的 handoff、CS、Release Gate 與其他現役工作目錄。
6. 評估並（若能安全隔離）提供本機 Owner Preview；正式旗標保持 false，不修改正式版本；優先不改 `src`。
7. 不做新的大規模平衡研究、不消耗正式保留 Seeds、不重錄 Golden。

## 2. 本輪保存的紀錄

| 檔案 | 內容 |
|---|---|
| `v21_發布解鎖規劃.md` | 三個方案的比較與原推薦（已標 NOT APPROVED） |
| `v21_Sprint0_可行性與判準草案.md` | 可行性、統計分析、判準草案（已標 NOT APPROVED）、§9 獨立 Reviewer 結論與逐項核對 |
| `v21_sprint0/simver_gate.log` | 指紋 gate 實跑輸出（83/83，`620196ccea5a8249`） |
| `v21_sprint0/power.mjs`、`power.out.txt` | 樣本數與檢定力計算 |
| `v21_sprint0/rho.mjs`、`rho.out.json` | 既有 G-A8 原始紀錄的 v20／v21 配對分析（唯讀既有資料） |
| `v21_sprint0/gate_tactic_book_v21.log` | 預覽前實跑的 v21 戰術書瀏覽器 gate 輸出 |
| `tools/owner_preview/vite.v21-preview.config.mjs` | 本機 Owner Preview 的 dev server 設定（不是 `src`，正式 build 不讀它） |

仍然有效的事實：`v21.b2` 凍結有效；9 個模板的分批顯示可以不改語意檔；三次 G-A8 STOP 與 Challenge STOP 都不改判。

## 3. 本機 Owner Preview

### 3.1 做法

沿用 `tools/browser_check_tactic_book_v21.mjs` 的手法，搬到 dev server 端：dev server 送出 `src/featureFlags.js` 時，把 `mobaTacticalDirectorV21: false,` 換成 true。必須恰好一處，否則拒絕啟動。**`src` 沒有任何修改，正式旗標在檔案裡仍是 false。**

### 3.2 隔離

| 風險 | 處理 |
|---|---|
| 寫到正式玩家存檔 | 存檔在瀏覽器 localStorage，依網址分開。預覽網址是 `http://127.0.0.1:5621`，與正式站（github.io）互不相通 |
| 與其他本機預覽混用存檔 | 固定 port 5621，被占用就啟動失敗，不自動換 port |
| 雲端存檔 | `envDir` 指向空資料夾、`VITE_SUPABASE_*` 強制空字串 ⇒ 雲端維持未設定 |
| 影響正式版本 | 設定檔在 `tools/owner_preview/`；`npm run build` 與 `deploy.yml` 用的是根目錄的 `vite.config.js`，不讀它 |
| 影響其他工作區 | vite 快取放在系統暫存目錄，不寫進共用的 `node_modules` |
| Challenge | `mobaChallengeV21` 沒動，仍是 `challenge.v20` |
| 區網存取 | 只綁 `127.0.0.1` |

**限制（照實）：**
- 這是 dev 模式，不是正式 bundle；效能與正式站不同，畫面左下角有黃色「OWNER PREVIEW」標示。
- 只能在這台電腦的瀏覽器開，手機開不了。
- 預覽裡的生涯是 `127.0.0.1:5621` 這個網址下的獨立存檔，第一次開是全新的。要完全不留資料，用無痕視窗開。
- 預覽裡看到的 21 套模板、所有選項都是**未核准發布**的內容。看得到不代表通過驗收。
- AI 教練只在有 AI 對手的場次出現；沒有對手隊伍的場次，紅方是標準運營。

### 3.3 啟動與停止

```
cd D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0
node node_modules/vite/bin/vite.js --config tools/owner_preview/vite.v21-preview.config.mjs
```

網址：`http://127.0.0.1:5621/ESMO-/`。停止：在那個終端機按 Ctrl+C。

### 3.4 實際驗證（2026-11-10，程式 SHA `7cf1cebc`＝origin/main；本分支只多文件與 `tools/owner_preview/`）

| 檢查 | 結果 |
|---|---|
| `node tools/browser_check_tactic_book_v21.mjs`（既有 gate，自己的 dev server 與隔離 Chrome；桌機 1366＋390） | **30/30 PASS**，66.6 秒，page error 0、console error 0（log：`v21_sprint0/gate_tactic_book_v21.log`） |
| 預覽伺服器啟動 | `VITE v5.4.21 ready`，`http://127.0.0.1:5621/ESMO-/` 回 200 |
| 預覽送出的 `featureFlags.js` | `mobaTacticalDirectorV21: true`、`mobaChallengeV21: false` |
| 磁碟上的 `src/featureFlags.js` | 兩個都是 `false`；`git status -- src` 0 個變更 |
| 綁定位址 | 只有 `127.0.0.1:5621` 在 LISTENING |
| 預覽標示 | 首頁 HTML 含 `data-owner-preview="v21"` |

**沒有驗的：** 我沒有在預覽網址上實際點過完整對戰流程（選角 → 戰術書 → 對戰 → 結算），也沒有在預覽裡開雲端存檔頁確認顯示「未開放」。對戰行為、AI 教練對手、賽後畫面在預覽下都未經瀏覽器實測，由 Owner 查看。

## 4. v21 值得保留的能力

依據都是既有量測；「行為 confirmed」只代表行為真的改變，**不代表勝率合理**。

| 能力 | 保留理由 | 證據 |
|---|---|---|
| Tactical Director core.v1（前／中／後期骨架） | 所有每時期戰術的地基 | C3-1；v20 黃金逐位元不變 |
| 紅方上下路修正（laneFrame） | 修掉真實的錯誤：m2 在 v20 是 61.5%，修正後 54.8% | 行為研究 29,000 場 PASS；v20 對照 p 0.008 |
| 每時期選擇：姿態 6、集結 3、物件優先 6、強邊 12 | 玩家選了，比賽真的不一樣 | 各 n=400 新 Seeds、紅藍皆 confirmed |
| 勝利條件「前期滾雪球」 | 同上 | C6 |
| 戰術書存檔（TacticPlan.v2、`tacticBook` 切片）、總開關、Live／Challenge 分開的旗標、只靠旗標回滾 | 已在正式站 Bundle、旗標關閉下驗過 | 正式站 Smoke 90/90 |
| 版本化修正表機制；m3、m7 的修正 | m3 68.3→55.0、m7 67.3→48.0 | 第三次正式 G-A8 |
| AI 教練的機制（決定性、只讀對手自己的資料） | 機制本身沒問題 | E2 PASS（舊凍結） |
| 量測與登記基礎建設、指紋 gate | 之後任何方案都要用 | — |

## 5. 需要重新設計的範圍

1. **發布判準本身。** 「21 個模板各 400 場、絕對 60%、一個 STOP 全擋」沒有緩衝帶，多個模板貼線時幾乎不可能一次通過；而且它不看選項、不看相剋、不看陷阱選項。新判準必須先由 Owner 定義要保護什麼，再談門檻。
2. **選項層與模板的交互（Sprint 0 的 BLOCKER）。** 靜態選項可以把修正表拿掉的東西加回來，例如 m7 修正後是 0.5，但「團戰姿態：積極」＝0.85。模板單獨驗收沒有意義，要驗的是「模板＋選項」。兩條路：選項的幅度改成相對於模板並設上限；或把選項組合納入驗收。
3. **積極／風險旋鈕的根本問題。** 旋鈕診斷顯示高積極、高風險在 std 上也偏強（61–62%）。這是「收益大於代價」，調模板資料只是把它壓到看不見。要不要動引擎的代價，是 Owner 之前擱置的方案 B（引擎）。
4. **模板名單。** 貼線的強勢模板（m5、m1、`hard_engage`、`three_lane`）、陷阱選項（`defensive_hold` 27.5%、m8、`support_roamer`）、以及修正後越來越像的問題（多個模板都變成 0.5／0.5）。模板相剋從來沒量過。
5. **AI 教練選模板的規則。** 防守型 AI 用 `defensive_hold` 讓玩家勝率明顯上升（寒冰守衛 +10.7pp，舊凍結資料）；而且任何分批方案下 AI 都會用到玩家選不到的模板，違反登記的「同一份提供清單」原則。
6. **Challenge v21。** 側偏與陣容強弱翻轉要動語意檔，屬於 v22 的另一個專案。
7. **未完成的三個勝利條件**（控圖運營、中路分推、後期團戰）維持 design。

## 6. 本輪沒有做

沒有改 `src`、沒有跑比賽、沒有用任何 Seeds、沒有改判準或登記、沒有重錄 Golden、沒有改正式旗標、沒有改任何既有 handoff、沒有 Push、Deploy、合併 main、清理 Worktree。
