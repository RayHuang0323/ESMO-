# Phase 3a-B 已知紅燈帳

- 2026-11-04。**這些紅燈不是 PASS，也沒有被改綠。** 沒有重錄 Golden，沒有放寬 Gate。
- 用法：之後看到這些紅燈，先對這張表；不在表上，或失敗內容變了，就當新問題查。
- 詳細證據：`3a-B_整合驗證報告.md`。

## MOBA 與共用（Node）

| Gate | 紅的項目 | 分類 | 誰處理、何時處理 |
|---|---|---|---|
| `check_match_golden_v21a` 97/137 | 40 案 | 預期變化（旗標關閉時等於標準運營） | v21 重啟時改到 `career.v21` 路徑重錄，要 Owner 核准。**不要在 v20 路徑重錄** |
| `check_career_golden_v21` 3/5 | P2 | 指紋差異 | 同一次重錄 |
| 同上 | R 24 案 | 預期變化（只差 `setupHash`） | 同一次重錄 |
| `check_challenge_golden_v21` 5/6 | P2 | 指紋差異 | 同一次重錄 |
| `check_tactic_truth_3a` 36/37 | T2 | 表過期 | 下次語意凍結整輪重測 |
| `check_formal_acceptance_3aB` 59/60（在 `08dc1686`） | B1 | 合併基準不同 | 已於 `66da3df2` 依 Owner 2026-11-04 最終 Review 第 3 項重新登記，另新增 B1a，經 Reviewer 檢查。**基準檔沒有改，這不是放寬**；實跑結果見 `3a-B_整合驗證報告.md` §12 |
| `check_club_mastery_v1` 264/265 | 1 條 | main 既有 | 技術債 |
| `check_player_challenge_slice3` 97–100/100 | §③ | flaky 統計 Gate | 技術債，不放寬 |

## CS（屬 CS 線，只記錄）

全部在乾淨 main `b4f8e0c3` 上同樣紅。

| verify 段 | 結果 | 失敗內容 | 判讀（未深入查，不算結論） |
|---|---|---|---|
| `cs_major_scene_v1` | 118/120 | `dust2/desktop`、`inferno/desktop` 幾何預算（triangles 35258、37436） | 看起來是場景已超出舊預算 |
| `cs_major_support_grip` | 19/21 | 受擊與換彈交還動畫（`contact` 對 `animation-owned`）；跨角色姿態比對 | 待查 |
| `cs_owner4e_closure` | 32/36 | 三圖 `rifler missing actual canonical duty`；Mirage 模擬雜湊不等於 Owner4D 備忘 | 舊基準可能已過期，待查 |
| `cs_major_navigation_cache` | 當掉 | `RangeError: Invalid string length`（`JSON.stringify`） | 工具字串上限，走不到斷言 |
| `cs_major_tactical_edge_runtime` | 8/10 | crossfire 情境未觸發 | 原 CS 工作區 10 月就紅 |
| `cs_gameplay_legacy_exact_equivalence` | 1/3 | Legacy 沒有下包情境；模擬雜湊不同 | 原 CS 工作區 10 月就紅；舊封存與現行來源不再等價 |
| 另外 75 段 | 見 `3a-B_整合_verify對照.json` | 47 段停在來源指紋或標記 | TD-3aB-1 |

## 合併進 main 之後失去保護的舊 Gate（Reviewer 2026-11-04）

這些 Gate 拿會移動的 `origin/main` 當對照。`origin/main` 等於 HEAD 之後，比對會變空。**它們的綠不再是證據，也不是回歸訊號。** 這輪沒有改它們，登記為 TD-3aB-9。

| Gate | 位置 | 失去的保護 |
|---|---|---|
| `check_match_source_v0c` | X2、F2 | 指定檔案對 `origin/main` 沒有差異 |
| `check_fan_ui_f4` | 19、20 | 平衡相關檔案沒有變更 |
| `check_moba_combat_feedback` | X3、X4 | 沒動語意檔 |
| `check_online_foundation_v2a` | X5–X7 | 沒碰戰術 |
| `check_cs_loading_v2_sim_equivalence` | 預設 `--ref origin/main` | 模擬對照變成自己比自己；要比對就明確傳 `--ref` |

`record_verify_baseline_3aB` 合併後不得重錄基準；基準已存在時工具會拒絕，B2 也會擋。
