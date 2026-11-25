# match_golden_v21a 40 案：旗標關閉的版本化預期（Owner 2026-11-25 核准選項 2）

## 做了什麼

- `check_match_golden_v21a` 新增 **V 段**。3a-B 已登記的 40 個 binding 案（24 個 `bind-template`、16 個 `bind-choice`），在「`mobaTacticalDirectorV21 === false` 且 live 模式確實解析出 `career.v20`」時，改與 `tools/fixtures/match_golden_v21a_flagsoff_v20.json` 的預期值比對 digest、streamHash、resultHash、configure 序列四欄。
- **其他旗標狀態一律回到原 fixture**（原契約）：V21 開啟、旗標缺漏、旗標不是布林 `false`，都不套用。
- 原 v21 fixture（`0e3c0224`／指紋 `29140fe0cb5a4c86`）、`PINNED_*`、K 段版本事實修正表、所有歷史收據：**都沒動**。沒有重錄 Golden、沒有改 `src/`、沒有開正式旗標。
- 這**不是** v21 啟用驗證。v21 開啟時的契約仍是原 fixture；本輪沒有在旗標開啟下重跑，也不宣稱通過。

## 預期值從哪裡來（不是候選的輸出）

由 `tools/capture_golden_v21a_flagsoff.mjs` 在 **main `053fd582`**（已發布、C1／C2 之前的 tree）的乾淨 worktree 上，用 main 自己的 `tools/lib/matchGoldenV21a.mjs` 與 `src/` 重跑這 40 案。工具先確認 main 的 HEAD 與 src 乾淨、旗標關閉、live 解析出 `career.v20`，並要求 fixture、v20 fixture、3a-B 分類在 main 與候選上是同一個 blob。

預期值寫出之前必須通過三項獨立證據（任何一項不符就拒絕寫出；Gate 的 V2 每次重驗）：

| 證據 | 涵蓋 | 結果 |
|---|---|---|
| A　fixture 在 `0e3c0224` 錄的 `bind-template:std:s11`、`std:s29`（std 模板＝標準運營；旗標關閉時本身也通過） | seed 11、29 的 12 案，四欄 | 全同 |
| B　3a-B 逐案分類 `review/tactic-book-3a/3a-B_整合_golden_v21a分類.json`（commit `79cc4276`，2026-11-04）記下的旗標關閉 digest | 40 案 digest | 全同 |
| D　同一個 seed 的所有 binding 變體必須四欄全同（binding 不生效的邏輯必然） | 6 個 seed | 全同 |

表的內容雜湊釘在 Gate 常數 `PINNED_FLAGSOFF_TABLE_SHA256 = d79fde83c85f9ebc73a75c58b0af1c81cdd1443ca6fc5ba7fe1af8ec813d072e`，基準 tree 釘在 `PINNED_FLAGSOFF_BASELINE = 053fd582…`。重錄必須看得見地改這兩個常數。

## 反向測試（Gate 內，用真的重跑結果）

| 檢查 | 內容 |
|---|---|
| VN1 旗標錯誤 | V21 開、旗標缺漏、字串 `"false"` ⇒ 不套用；V21 開時以原 fixture 比對，40/40 被擋 |
| VN2 未知案例 | 表外案的結果不同仍被報出；表多列一個未登記的案 ⇒ V0 不成立 |
| VN3 真正結果差異 | 表上案的 streamHash、resultHash、configure 序列任何一項不同 ⇒ 抓到 |
| VN4 未登記變更 | 改預期 digest ⇒ 與 3a-B 不符；只改 streamHash ⇒ 同 seed／std 證據不符；改任何位元組 ⇒ 內容雜湊不符 |
| VN5 不是 id 白名單 | 把預期改成任意值（例如原 fixture 的 v21 值）⇒ 證據不成立；表內 fixture 副本被改 ⇒ V0 不成立 |

## 結果

`Match Golden v21-A：146/146 PASS`（原 137 項＋V0～V3＋VN1～VN5）；109 個逐案比對全部通過，其中 40 案依版本化預期。

## 仍然開放

- **v21 啟用時的 Golden**：v21 重啟時，仍要在 `career.v21` 路徑重錄（照 3a-B 帳，要 Owner 核准）。在那之前，v21 開啟的結果沒有被驗證。登記為 TD-61。
