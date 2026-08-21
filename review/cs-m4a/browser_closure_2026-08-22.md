# CS Season M4-A.1 — Browser Closure（2026-08-22）

**分支**：`integration/cs-cross-ai`　**起點**：`a3efdcf`
**方法**：`tools/make_cs_major_save.mjs` 產生起始存檔注入 localStorage，
之後**全部走正式 gameplay action**（推進日曆 → CS 賽前頁出戰 → 房間確認 →
選圖 → 戰術 → Codex CS 引擎實跑 → 賽後戰報 → 返回）。

⚠ 三張地圖**都是 Codex 的 CS 引擎真的跑完的**，不是模擬替代。

## 結果：7 / 7 PASS

| # | 項目 | 結果 |
|---|---|---|
| 1 | Map 1 結束後回 csMap | PASS　`activeMatch.phase = map/active`，畫面落在選圖頁 |
| 2 | series 進度正確 | PASS　1:0 → 1:1 → 2:1（`dust2:us` / `mirage:opponent` / `inferno:us`）|
| 3 | next map 正確 | PASS　1:0→mirage、1:1→inferno |
| 4 | reload 保留 | PASS　重載後仍 1:0、phase 仍 `map`、同一 fixture |
| 5 | re-entry 不洗回 0:0 | PASS　中離→重進仍 1:0，`fx:cs:90b3ba4a` 未變 |
| 6 | 最終收尾 2:1 | PASS　`status=decided winner=us`，fixture `completed` |
| 7 | FixtureOutcome 只寫一次 | PASS　`outcomeCount = 1`，`winner=玩家 score=2:1 src=engine` |

### 附帶確認（同一輪實測）

- **中間地圖不寫賽程**：打完 1、2 兩張後 fixture 仍 `launched`、**0 筆賽果**
- **已完成地圖不可再選**：1:1 時 `dust2[DISABLED]`、`mirage[DISABLED]`，只剩 inferno
- **series banner**：`BO3 1 : 1 · 第 3 / 3 張 · 先拿 2 張者勝`
- **帳本生命週期**：賽程收尾後 `seriesByFixture` 清空（`ledger: []`）
- **⛔ ownership lock**（賽季層實際內容）：
  - 賽季層最大比分 = **2**（沒有任何回合量級數字）
  - 賽果沒有 `rounds/half/overtime/maps` 欄位
  - `matchFormat.mapPool` 之外找不到任何地圖識別碼
  - 賽季狀態裡沒有 `MatchSeries` 也沒有 `seriesByFixture`
- **bracket 推進**：sf1/sf2 `completed` ⇒ bronze/final 已排出 `scheduled`
- 三張圖各自入史與入帳（`csHistory = 3`）

## ⚠ 環境限制（給下一個要做 CS browser gate 的人）

MCP 開的分頁在背景時 `document.visibilityState === "hidden"`，
Chrome 會把 `requestAnimationFrame` **與 `setTimeout` 一起**節流
⇒ CS 引擎完全不動（畫面停在 `1/1214 格`，「快速完成」看起來像凍住）。

本輪試過用 `MessageChannel` 取代 frame pump 想自動化 —— **失敗且有害**：
短地圖（Mirage 956 格）可行，但決勝圖（Inferno 1375 格）會變成不讓出的忙迴圈，
把事件迴圈餓死，連讀狀態都做不到，最後只能關掉分頁。
**結論：必須由人把分頁切到前景。** 不要再嘗試替代 frame pump。

另有一個容易誤判的點：CS 對戰**打完不會自動跳賽後頁**，
要按「📊 查看賽後戰報 · 領取獎勵」才會結算。第一次看到會以為是計時器被節流。
