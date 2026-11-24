# check_match_golden_v21a 97/137（40 案）處置證據　交 Owner 核准

2026-11-25，C1＋C2 Release Blocker Closure。**本文件只整理證據，沒有新增任何豁免、沒有重錄 Golden、沒有改判準、沒有刪除案例。** 這條在本輪所有 Release Gate 中仍如實回報 FAIL。

## 結論

- 這 40 案是 **2026-11-04 Phase 3a-B 已登記的「預期變化」**，不是 C1／C2 造成，也不是新的回歸。
- 從登記時（3a-B）、main `053fd582`、整合候選 `9f4902a3` 三處逐案比對：**同一組 40 個案例 id，完全一致**。
- 處置需要 Owner 決定（下方選項），本輪不自行處理。

## 40 案是什麼

| 類別 | 案數 | 內容 |
|---|---|---|
| C `bind-template:v2.*` | 24 | 12 個 v2 模板（藍方 binding）× 2 seeds |
| C `bind-choice:*` | 16 | 8 個選項（jungle.focus farm／invade、lanes.mid.stance split、objectives.tower high、seats.b5.mission protect／roam、teamfight.posture aggressive／passive）× 2 seeds |

全部的失敗形態相同：digest／streamHash／resultHash 與 fixture 不同，`configure` 呼叫序列從第 8 次開始不同；同一個 seed 的不同模板跑出相同結果（例如 s3 的四個模板都是 `892.0:red:7:6:23674:25538`）。

## 來源與版本歸屬

- Golden fixture 錄製於 `0e3c022426f8869f88668c73997a7dca719b4b08`，指紋 `29140fe0cb5a4c86`（釘在 `tools/check_match_golden_v21a.mjs` 的 `PINNED_GIT_HEAD`／`PINNED_FINGERPRINT`）。錄製時 `mobaTacticalDirectorV21` 等 v21 旗標為開（`3a-B_整合_golden_v21a分類.json` 的 `summary.recordedAt.flagsAtRecording`）。
- Phase 3a-B 以「旗標關閉」合併進 main（`bd063ac7`，2026-11-04）。旗標關閉時正式站解析出 `career.v20`，binding 不生效 ⇒ 這 40 個 binding 案例的結果等於標準運營，與 v21 開啟時錄的 fixture 不同。這是設計上的預期。
- 登記紀錄：`review/tactic-book-3a/3a-B_已知紅燈帳.md` 第 11 行（「預期變化（旗標關閉時等於標準運營）｜v21 重啟時改到 `career.v21` 路徑重錄，要 Owner 核准。**不要在 v20 路徑重錄**」），commit `08dc1686`、`57df97a9`；逐案分類 `review/tactic-book-3a/3a-B_整合_golden_v21a分類.json`（total 40、expected 40、review 0）。
- v20 的 39 案、紅方 binding 等其餘 97 案在三處都通過。

## 逐案比對（2026-11-25 實測）

| 來源 | 失敗案數 | 與 3a-B 分類同一組 id |
|---|---|---|
| 3a-B 分類（`0e3c0224` fixture，11-04 登記） | 40 | — |
| main `053fd582`（`esmo-measure\c1c2-integration-20261124\base-match_golden_v21a.log`） | 40 | ✅ |
| 整合候選 `9f4902a3`（同次 active 組 verify log） | 40 | ✅ |

最終候選 SHA 上也會再跑一次並逐案比對，結果追加在 Closure 報告。

## 既有正式程序允許的處置（需 Owner 決定，本輪未執行）

1. **維持現狀**：照 3a-B 帳，v21 重啟時在 `career.v21` 路徑重錄（要 Owner 核准）。在那之前，這條會一直是 Release Gate FAIL ⇒ 依 Owner 規則，本輪不能宣稱正式發布 GO，除非 Owner 依既有程序核准例外。
2. **核准版本化預期變化**：Owner 依本證據核准「旗標關閉時這 40 案以 v20 行為為準」的版本化紀錄（需要看得見地改 Gate 常數或新增 flags-off 期望值，屬 Golden 判準變更，必須 Owner 明確核准，且要另一輪審查）。
3. **提前做 v21 重錄**：違反 3a-B 帳「v21 重啟時才做」的時序，不建議。
