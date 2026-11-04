# Phase 3a-B 決策紀錄

- 建立：2026-11-04，依 Owner Review（整合最後一輪）第 D 項。
- **為什麼有這份：** 流程帳本 `.superpowers/sdd/2026-10-22-moba-phase3a-c-long/progress.md` 沒有進版控，換機器或清工作區就不見了。這裡把會影響後續工作的決策記進版控。
- 只記決策與結果，細節看「紀錄」欄的文件；帳本本身不搬進來。
- `commit` 都在 `feature/moba-phase3a-stage1` 的歷史裡，整合分支也包含。

## 目前有效的決策

| # | 決策 | 影響 |
|---|---|---|
| 1 | 第三次 G-A8 STOP 正式接受，不改判；停止第七輪平衡研究 | `classic.m5` 62.75%（下界 58.0%）永遠是那個結果 |
| 2 | v21 發布暫停，`mobaTacticalDirectorV21`、`mobaChallengeV21` 維持關閉，正式站維持 v20 | 不得開旗標 |
| 3 | 暫時保留內部常數 `moba-sim.v21`；正式 v20 對局、存檔、Replay 必須維持 v20；版本差異記為技術債（TD-3aB-3） | 不改常數，不重測真實性表；由 `check_release_markers_3aB` 釘住 |
| 4 | 接受 v21 程式留在公開 Bundle，旗標關閉；要檢查敏感資訊與大小 | 不做建置時排除 |
| 5 | 下一個產品里程碑：**全賽季玩家閉環** | `docs/design/全賽季玩家閉環_MVP提案.md` |
| 6 | 方案 B（MOBA 平衡重設）暫緩，只有規劃 | `3a-B_下一階段B_前瞻驗收規劃.md`；不跑量測 |
| 7 | 整合只在獨立 worktree，**未核准合併 main**；不 Rebase、不 Squash、不 Force Push | `3a-B_整合驗證報告.md` |
| 8 | Golden 紅燈不重錄、不放寬、不宣稱 PASS，逐案登記 | 報告 §4、§6 |
| 9 | CS 線只驗證與記錄，不在 MOBA 分支修 | TD-3aB-1、TD-3aB-2、TD-3aB-7 |

## 時間線（只列 Owner 裁定與關鍵結果）

| 日期 | Owner 裁定或事件 | 結果 | 紀錄 |
|---|---|---|---|
| 10-27 | G-A8 第一次 STOP（m3 68.3、m7 67.3 等）；Owner 選 (b)+(c)：跑 v20 對照 | 五個 STOP 模板在 v20 就存在、逐位元相同；`classic.m2` 只在 v20 STOP | `f7abd883`、`3a-B_P2_執行紀錄.md` |
| 10-27 | Challenge 側偏：維持 STOP，另做雙向研究 | 4,098 場 `SIDE_CONFIRMED`，STOP 維持 | `6a805453` |
| 10-28 | G-A8 旋鈕診斷 | 18,400 場 `DIAGNOSED`，STOP 維持 | `85f173a2` |
| 10-29、10-30 | 修正規劃第一、二輪 | m3、m7、m8 候選；藍方技能層副作用 +6.9pp 只在真鏡像 | `3a-B_修正規劃.md`、`3a-B_修正規劃_第二輪.md` |
| 10-30 | 核准 D5、D8 | 順序診斷 `INCONCLUSIVE`；建議不改引擎結算順序 | `3a-B_修正規劃_第三輪.md` |
| 10-30 | **M3_C、M8_C、M7_M 列為 v21 候選；不改引擎、不補償側偏；`veteran` 維持 Boss；`m1` 不修；`three_lane_pressure` 要保留三線身分；評估分階段發布** | `mid_jungle_sync` 停止搜尋（`STOP_NO_REASONABLE_CANDIDATE`）；發布拆成兩階段，Challenge 留 v20 | `3a-B_修正規劃_第四輪_發布拆分.md` |
| 11-01 | 第一階段最小實作 | `v21.b1`、`mobaChallengeV21`、總開關 | `3a-B_第一階段_最小實作.md` |
| 11-02 | 凍結就緒與凍結前診斷 | 就緒報告；建議凍結 | `3a-B_最終凍結就緒報告.md`、`3a-B_最終凍結建議.md` |
| 11-03 | 凍結 `7a6e9736`，第二次 G-A8 | STOP：`hard_engage_stack`、`three_lane_pressure`、`classic.m6` | `84ad5014`、`3a-B_正式驗收紀錄.md` |
| 11-03 | 有界平衡研究 | `PRODUCT_DECISION_NEEDED`；凍結與門檻都沒動 | `aaa5954b`、`3a-B_平衡修正研究.md` |
| 11-03 | **Owner r3：有條件核准 `v21.b2` 凍結與正式驗收；STOP 就提產品調整，不自動開第七輪** | 凍結 `78ccc817`，指紋 `620196ccea5a8249` | `tools/fixtures/stage1r2_release_registration_3aB.json` 的 `ownerReviewR3` |
| 11-03 | 第三次 G-A8 | STOP：`classic.m5` 62.75%；獨立重算 0 差異 | `9ff121ed`、`e11f0e4f` |
| 11-04 | **接受 STOP，方案 A 只限獨立 worktree 測試性整合** | 合併 `29cdf9dc`，紀錄 `79cc4276`，沒有新回歸 | `3a-B_整合驗證報告.md` |
| 11-04 | **接受整合成果，核准最後一輪；上面決策 3、4、5、6** | 見報告 §11 | `3a-B_整合驗證報告.md` |

## 只在帳本裡、這裡補上的工程細節

- `tacticTemplates.js` 是語意檔，改它就會動指紋（10-28）。
- 一個旗標同時驅動 `career.v21` 與 `challenge.v21`（`matchRuleset.js`），所以才新增 `mobaChallengeV21`，只在解析分支生效（10-30）。
- 戰術書沒有旗標保護，合併就等於發布，所以有總開關，`TacticScreenV20` 是 v20 畫面的逐字副本（10-30、11-01）。
- 程式回滾會丟掉 `tacticBook` 欄位，因此回滾只靠旗標（10-30）。
- `04_Roadmap.md` 的換行混用，要用保留位元組的方式改，不能用 Edit 工具（10-27）。
- 帳本明確記到已觀察、不得當新資料用的 Seeds：`43001–43400`、`4601–5000`、`57801–58600`、`69001–69900`。**這不是完整清單**（更早的篩選另有區段）；下一輪開始前要對 `stage1r2_formal_acceptance_registration_3aB.json` 與各輪紀錄。
- 第二階段 Challenge 語意變更要走 v22（10-30）。

## 不算決策、不要讀成結論

- 「PASS」的 CS 矩陣只代表對局跑完。該 Gate 固定輸出 `GAMEPLAY_ACCEPTANCE=NOT_ASSESSED`。
- 方案 B 的門檻都是提案，沒有核准。
- 全賽季閉環的範圍是提案，等 Owner 核准。
