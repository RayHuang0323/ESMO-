# Competition 測試存檔（gate fixture）

供 Competition／SeasonState v2 相關 verifier 使用的存檔。
**這些檔案是 gate 的輸入，不是遊戲資產**，不會被 build 打包。

⚠ **不得修改任何 `.json` 的內容。** 它們是既有 gate 的逐值比對基準，
改一個欄位就會讓多支 gate 的期望值失效。要新情境請**新增**檔案，不要改舊的。

## 為什麼放在 repo 內

在此之前這些存檔住在 Windows Temp 的 scratchpad，gate 用 `../../` 相對路徑去外部撈。
後果是：換一個 worktree 就 `ENOENT` 崩潰（2026-08-18 實際發生於
`browser_check_asia_finals_ui` 與 `browser_check_team_honors_ui`），
而且**其他 AI／其他機器拿不到這批資料**，等於無法重跑驗證。

## 檔案與用途

| 檔案 | 內容 | 使用者 |
|---|---|---|
| `s7b_season_sealed.json` | 賽季已封存（多 Event：官方聯賽＋巡迴三站＋年度總決賽），玩家第 8 名、AI 奪冠 | `browser_check_asia_finals_ui`、`check_seasonstate_v2_runtime`、Q7f `browser_check_season_recap_ui` |
| `s7b_finals_ready.json` | 巡迴三站打完、資格已核發、年度總決賽已建立（只有兩場準決賽） | `browser_check_asia_finals_ui` |
| `s7b_finals_semis_done.json` | 同上再把準決賽打完（季軍戰／決賽已排出） | `browser_check_asia_finals_ui` |
| `s7d_incomplete.json` | 年度總決賽已建立但**未完成** ⇒ honors 應為空 | `browser_check_team_honors_ui`、Q7f `browser_check_season_recap_ui` |
| `s7d_s1_champion.json` | 第 1 季冠軍已產生 ⇒ honors 1 筆 | `browser_check_team_honors_ui` |
| `s7e_player_one.json` | **玩家**奪冠、多 Event，聯賽仍進行中而巡迴站已封存（狀態混合） | `check_seasonstate_v2_runtime`、Q7f `browser_check_season_recap_ui` |

## 產生器

存檔由下列腳本以**真實 production 路徑**（`startNewGame` → `ensureCompetitionSeason` →
實際打完賽程 → 封存）在 Node 中造出，**不是手寫 JSON**。
正式站是 minified bundle 叫不到模組，所以存檔必須先在 Node 造好再整包注入 `localStorage`。

| 產生器 | 產出 |
|---|---|
| `make_save7b.mjs` | `s7b_finals_ready` / `s7b_finals_semis_done` |
| `make_save7bc.mjs` | `s7b_season_sealed` |
| `make_save7d.mjs` | `s7d_incomplete` / `s7d_s1_champion` / `s7d_two_seasons` |
| `make_save7e.mjs` | `s7e_player_one` / `s7e_player_multi` |

⚠ 產生器**寫檔到自己所在目錄**（`new URL("./xxx.json", import.meta.url)`），
所以在本目錄執行即可就地重建。重建前請先確認你真的要覆蓋——見上方「不得修改」。

## 刻意未納入

`s7d_two_seasons.json` 與 `s7e_player_multi.json` 目前**沒有任何 gate 使用**，
因此不入庫（產生器仍可造出它們）。哪天有 gate 需要再搬。

## 已知未收口

（目前無。）

### 已收口

- Q7f 的 `browser_check_season_recap_ui` 曾讀 repo 外的 `../../`。
  2026-08-20 隨 Q7f 整合改讀本目錄，並納入 Competition Release Gate（區段 `season_recap`）。
  至此 `tools/` 底下**沒有任何 gate 讀 repo 外的存檔**。
  原記錄於 `docs/ai/跨模型交接流程.md` §9。
