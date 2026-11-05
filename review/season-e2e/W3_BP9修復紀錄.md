# W3 BP-9 修復紀錄（P0-A 資料一致性）

**狀態：** 本機分支 `fix/bp9-save-consistency`，從 main `435f8c6d`。**P0-A 發布中**：Push、Deploy 與正式站 Smoke 的結果寫在本檔最後一節。

**Owner 指示：** 2026-11-05 Owner Review 核准 P0 緊急修復，分兩階段。P0-A 處理資料一致性，可單獨發布；P0-B 做存檔瘦身與舊存檔恢復，完成後交 Owner Review，不自行部署。2026-11-06 Owner 裁定 F5：P0-A 有條件單獨上線（條件見下面「Owner 的 F5 條件」）。

W2 的原始證據沒有改動，在 `review/season-e2e/W2_瀏覽器驗收.md` 與 `W2_證據/`。

---

## P0-A 宣稱的範圍

**只宣稱：** 阻止新增的資料不一致。存檔寫不進去時，同一場比賽不會重複入帳、重複熟練，也不會產生互相矛盾的賽果。

**不宣稱：**
- 沒有解決容量。存檔頂到上限的玩家會被停住，直到 P0-B。
- 沒有恢復遊玩。
- 沒有自動修復舊資料。已經產生的重複熟練或矛盾賽果，只做偵測與記錄（見「異常偵測與可審查的修復方案」）。

## 權威來源與寫入順序

| 資料 | 鍵 | 權威 |
|---|---|---|
| 入帳、資金、賽程結果、`csHistory` | `esmo.profile.v1` | **唯一權威**。帳本 `processedMatchTransactions` 有這筆交易，就代表這場已算 |
| 英雄熟練 | `esmo.heroProgress.v2` | 衍生資料，由帳本推導 |
| Season 歷史 | `esmo.season.v1` | 衍生資料，只在本機 |

**MOBA：** 寫日誌 `esmo.commit.journal.v1` → profile 一次寫入（結算與賽程回寫）→ 熟練 `applyCommitted`、Season `recordCommitted` → 刪日誌。
**CS：** 結算與 `csHistory` 在同一次 profile 寫入，不需要日誌。

**提交點是 profile 的單次 `setItem`。** 單純調換寫入順序不算完成（Owner 指示），所以：
- profile 寫入失敗時，記憶體還原到寫入前（`runAtomicCommit`），帳沒進就什麼都沒變。
- 帳已入但熟練或 Season 沒寫完時，日誌留著，下一次開機、重試或推進前會補完；兩邊都用穩定識別防重。
- 日誌有帳本證據時不得被新的比賽覆蓋：先補完，補不完就拒絕開賽與推進。

**穩定識別 `commitKey`：** 賽程 `${fixtureId}:s${season}`（BO3 加 `:m${已打張數}`）；一般對戰 `s:${sessionId}:${launchedAt}`；沒有場次時用比賽 ID。`sessionId` 會重複（取消排隊會把 attempt 歸零），所以加上開賽時間。

## 存檔失敗時

- 相關進度安全停止：開賽、排隊、重新排隊、練習、推進日曆都會被拒，並說明原因。
- 警示存在 `esmo.commit.alert.v1` 與 sessionStorage，重新整理不會消失。
- 審查紀錄 `esmo.commit.audit.v1` 只記錄，不修復；同一格裡的紀錄改成追加，不互相覆蓋。
- **頂到上限時（Owner F5 條件 1）：** 提示改說「存檔空間已滿，進度先暫停保護。存檔完好，沒有遺失……下一版更新會整理空間後恢復。請不要清除瀏覽器資料，也不要開新局。」拒絕原因也用同一套說法。判斷門檻 4,900,000 字元，只影響文案，不影響能不能存。
- **遊戲內沒有存檔匯出功能**（已查 `src`）。P0-B 會在轉換前提供可匯出的備份。

## 獨立 Review

| 輪 | 對象 | 判定 | 主要內容 |
|---|---|---|---|
| 1 | `74261905` | REJECT | 舊重試讓熟練加倍；`sessionId` 重複時成長被吃掉；衍生資料失敗沒有擋住進度；Gate 沒有兩場連打 |
| 2 | `3793cedd` | APPROVE WITH CHANGES | 日誌佔住空間讓日曆被 Season 卡住；開賽前執行到錯的重試 |
| 3 | `785b0d87` | APPROVE | 修正範圍正確 |
| 4 | `f9850d7c` | APPROVE WITH CHANGES | 日誌算不完時玩家卡住且看不到；兩支掃描可繞過；F5 要 Owner 決定 |
| 5 | `8c178fe1` | APPROVE WITH CHANGES | 拒絕文案與橫幅矛盾；Gate 一條假綠；新橫幅沒在 Chrome 畫過；舊提示階段可能誤導 |
| 6 | `8c178fe1` 之後 | 見最後一節 | R1–R5 修正、Owner F5 文案、正式站模式、W2 merge、本紀錄 |

**我自己抓到的 Gate 問題：** `check_bp9_commit_p0a` 的 `brief()` 會丟掉 `threw`，所以「沒有丟例外」的斷言過去全部恆真。修好後沒有浮出被藏住的例外。

## 驗證（最終程式碼 `c18b0eaf`；之後只多 W2 merge `5a769bca` 與紀錄，沒有再動 `src`）

| 項目 | 結果 |
|---|---|
| Build | 通過 |
| `check_bp9_commit_p0a`：配額不足、每個寫入邊界失敗、中途重新整理、同場重試、兩場連打、壞日誌、沒有 localStorage | **1454/1454** |
| 存檔 B1B／B1C／B1D | 86/86、76/76、128/128 |
| Replay：`check_battle_result_v3_replay`、`check_replay_display_text` | 通過 |
| Node 批次 50 支 | 41 綠；8 紅都與 main 相同，或是分支範圍檢查 `check_online_foundation_v2a` |
| `verify`：tactic24、runtime29、cs23、progress25、experience26、talent27、regress、regress2 | 7/8；`progress25` 第 13 條 main 也紅 |
| 提到被改模組的 Node Gate 128 支，紅的對照 main | 91 綠；32 支失敗訊號與 main 相同（14 支兩邊都中途當掉）；2 支補上存檔環境後通過；`pacing29b1` 沒有結果 |
| 旗標 OFF 整合、版本標記 | 27/27、30/30 |
| 真 Chrome：配額實測 | 4/4（上限 5,242,880；全滿時同大小覆寫成功，多 2 字元失敗） |
| 真 Chrome：壞日誌橫幅（含 390） | 13/13 |
| 真 Chrome：正常、故障注入 | 11/11、28/28 |
| 真 Chrome：第 254 天 MOBA 超限、第 228 天 CS 超限 | 30/30、19/19 |
| 真 Chrome：離開頁面存檔、雲端存檔畫面、世界時間、休賽期 | 12/12、29/29、21/21、18/18 |
| 真 Chrome：一般對戰、BP-1、賽事中心、旗標 OFF 打包流程 | 全數通過、78/78、27/27、25/25 |
| 真 Chrome：CS 正式流程 1366／390 | 63/63、63/63 |

**突變測試：** 故意改壞修好的程式 6 種，全部被 `check_bp9_commit_p0a` 抓到（第一次漏 1 種，補案例後抓到）。兩支掃描的突變 17/17。

**改動的既有 Gate（都沒有放寬，交 Reviewer 審過）：**
- `check_result_flow_o71` §1、`check_practice_match_v0d` H1：邏輯搬到 `commitMatch.js`，兩段都查，條件比原本嚴。
- `check_cs23`、`check_matchmaking_flow_acceptance`：裸 Node 沒有 `localStorage`，存不下去的比賽不再算，所以補一份記憶體版。只新增，斷言沒動。

## Owner 的 F5 條件與對應

| 條件 | 對應 |
|---|---|
| 1 超限玩家要知道是暫時保護、等下一版；不得引導清資料或開新局；有安全匯出要保留 | 文案已改，真 Chrome 超限案例驗過；沒有匯出功能 |
| 2 只宣稱阻止新增不一致 | 本紀錄「P0-A 宣稱的範圍」 |
| 3 CS 超限後重打能否安全入帳未驗證，不得當 PASS | **未驗證**。「返回進行中的對戰」按鈕存在，但 Gate 沒能走到結算。資料面：CS 一次寫入，Node 每個寫入邊界與配額都驗過不會多算 |
| 4 正式站用隔離 Profile 驗正常與超限 | 見最後一節 |
| 5 有新回歸或 Reviewer 重大問題就停 | 最終回歸沒有新回歸；Reviewer 結論見最後一節 |
| 6 不用未驗證的舊 Bundle 回滾 | 照辦 |

## 超限時 main 與 P0-A 的差別（真 Chrome）

| 項目 | main | P0-A |
|---|---|---|
| MOBA 打完 | 帳沒進；熟練與 Season 已寫入 | 帳、熟練、Season 都不動 |
| MOBA 重打 | 每次熟練 +10（780→810），Season 多出矛盾紀錄 | 都不動 |
| 重新整理 | 提示消失 | 提示還在 |
| MOBA 棄權後推進 | 第 256 → 257 天 | 停在第 256 天，提示存檔已滿、暫時保護 |
| CS 超限那場 | 入帳；`csHistory` 與戰報遺失 | 都不動，賽程留在進行中，日曆停在第 239 天 |

## 異常偵測與可審查的修復方案（不自動執行）

開機時 `detectCommitAnomalies` 只偵測、寫進審查紀錄：

| 代碼 | 意思 | 建議的人工修復（要 Owner 核准才做） |
|---|---|---|
| `hero_ahead_of_ledger` | 熟練場數比帳本裡的場數多（W2 重打造成） | 以帳本為準重算熟練，或保留現狀只標記。重算會讓玩家看到數字變小，需要文案 |
| `launched_without_session` | 賽程是進行中，但沒有對應場次 | 提供棄權或重開這場的入口；不自動判勝負 |
| `season_duplicate_commit` | Season 同一場出現兩筆 | 保留第一筆、標記第二筆；Season 不影響生涯數值 |
| `journal_unfinishable` | 已入帳但日誌內容算不完 | 由 Owner 決定是否丟棄日誌解鎖（最多少一筆熟練或 Season） |
| `recovery_failed`、`retry_failed` | 恢復或重試本身丟例外 | 只看紀錄，查原因 |

**沒有偵測的：** 熟練比帳本少（TD-BP9-7）。

## 技術債（新增）

- **TD-BP9-1 超限即停：** P0-B 之前沒有遊戲內出口。MOBA 棄權後日曆仍停住；CS 分頁沒有棄權（BP-2）。
- **TD-BP9-2 日誌佔空間：** 剩餘空間介於 P 與 P+J（約 5 KB）時，profile 會因為日誌而寫不進去。安全，但會提早停住。
- **TD-BP9-3 取消排隊讓 `sessionId` 重複：** 靠 `launchedAt` 繞過，根因沒修。
- **TD-BP9-4 沒有場次時的結算路徑仍會入帳**（`viaSession:false`，只有 debug 用）。
- **TD-BP9-5 雲端信封落後熟練成長：** 開雲端存檔前必修。
- **TD-BP9-6 多分頁沒有鎖：** 舊分頁會蓋掉新資料，要加 `storage` 事件保護。
- **TD-BP9-7 沒有「熟練比帳本少」的偵測。**
- **TD-BP9-8 日誌讓位時被強制關閉：** 可能少一筆 Season，沒有標記。
- **TD-BP9-9 棄權可能暫時清掉已入帳提示：** 下一次推進會再掛回來。
- **TD-BP9-10 非 BattleResult 的日誌會被靜默丟棄：** 與「不丟日誌」並存，Owner 決定丟棄規則時要一起看。
- **TD-BP9-11 審查紀錄沒有畫面：** 玩家回報時拿不出來。
- **TD-BP9-12 Node Gate 的假 `localStorage` 沒有配額，也沒有 Season 的存檔環境**（`canLS` 在匯入時決定）。

## 沒有驗到

- CS 超限後從「返回進行中的對戰」重打能否入帳（Owner 條件 3：不算 PASS）。
- BO3 真 UI、休賽期帶著待補日誌、兩個分頁、手機真機、真 Supabase。
- `check_moba_pacing29b1` 兩邊都逾時，沒有結果。
- 14 支 Node Gate 在 main 與本分支都是中途當掉，與 main 相同只代表沒有新增的當掉訊號。

---

## 發布結果

（Push、Deploy 與正式站 Smoke 之後補上。）
