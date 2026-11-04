# Phase 3a-B 旗標關閉：測試性整合驗證報告

- 日期：2026-11-04。依 Owner Review（第三次 G-A8 STOP 之後）第 A–D 項；最後一輪結果見 §11；**正式合併與部署見 §12，下面 §1 的「還沒有合併」是當時的狀態**。
- **§1–§11 是測試性整合的紀錄，當時沒有 Push、Deploy。** 全程沒有啟用 v21，沒有改 CS，沒有重錄 Golden，沒有用保留 Seeds。
- 合併樹：`integration/moba-3aB-flags-off-test`，合併 commit `29cdf9dc`（父：`origin/main` `b4f8e0c3`、`feature/moba-phase3a-stage1` `e11f0e4f`），真 merge、`--no-ff`。
- 對照樹：`.sprints/moba-3aB-main-baseline`，分離 HEAD 在 `b4f8e0c3`。
- 原分支維持在 `e11f0e4f`，沒有動。**這輪的紀錄與新 Gate 只 commit 在整合分支。** 真正合併時這些 commit 要一起決定。

## 1. 結論

| 問題 | 答案 |
|---|---|
| 新增回歸 | **沒有找到。** 159 段 verify 全部跑過；合併樹所有紅燈都能對到 main 或原分支上的同一個紅燈，或是可解釋的預期變化。限制見 §8 |
| 旗標關閉是否安全 | Node 26/26、打包後瀏覽器 25/25。玩家看不到戰術書，存檔沒有 v21 標記，帶計畫的舊存檔不會被改寫 |
| 能不能宣稱全綠 | **不能。** 有 Golden 紅燈，還有 main 帶來的 81 段 verify 紅燈（`3a-B_已知紅燈帳.md`） |
| 是否建議合併 main | **技術條件已具備，等 Owner 最終 Review**（§9）。還沒有合併 |

## 2. 合併本身

- 衝突只有 `docs/handoff/05_Sprint紀錄.md`、`08_目前待辦與風險.md`，都是文件，以位元組方式解決（main 全留，分支尾段接上）。沒有產品程式衝突。
- `tools/verify.mjs` 自動合併，159 段、id 不重複。
- `git diff origin/main HEAD -- src/battle/fps` 是空的。靜態 import 追蹤：`src/battle/fps`（80 個入口，閉包 93 檔）碰不到這次改動的 42 個 `src` 檔。這是正則近似，動態 import 可能漏算。

## 3. Gate 結果

| 類別 | 範圍 | 結果 |
|---|---|---|
| Build | 合併樹 | ✓ `built in 21.26s` |
| Node Gate | 67 支 | 60 綠、7 紅（§4；其中 `slice3` 是 flaky，重跑 8 次全綠） |
| v20 Golden | `check_match_setup_3a` | **153/153** |
| 旗標關閉跨樹 | `check_flags_off_integration_3aB`（新） | **26/26** |
| verify | 選定 118 段（另 8 段已直接跑） | 43 綠、75 紅；**75 段在乾淨 main 上全部同樣紅，失敗行相同**（§5） |
| CS verify 補跑 | 33 段 | **27 綠、6 紅；6 紅在乾淨 main 上失敗行相同**（§11） |
| 瀏覽器 | 13 支 | **13 支全綠**（見下表） |

**各系統的 Node 證據：**

| 系統 | Gate |
|---|---|
| MOBA v20 | `check_match_setup_3a` 153/153、`check_live_setup_3a` 119/119、`check_stage1_split_3aB` 75/75、`check_stage1_rollback_drill_3aB` 15/15、`tactic24`、`runtime29`、`regress`、`regress2` |
| Training | `check_training_competition_integration` 13/13 |
| Competition Hub | `check_competition_release_gate` failed 0/11、`check_competition_shared_ui` 28/28、`check_competition_visual_shell` 22/22、`check_cs_competition_hub` 31/31、`check_r63_competition_integration` 19/19 |
| 存檔 | `check_save_bundle_b1b`、`check_save_hardening_b1c`、`check_cloud_save_b1d`、S1–S8（跨樹） |
| Replay | `check_battle_result_v3_replay`、`check_replay_display_text` 22、`check_replay_team_buff_scrub` 3/3 |
| Challenge | slice 1、2、4–8 全綠；C1–C6（跨樹：同 Seed 同結果，兩邊互相重播成功） |
| CS（Node） | `cs23`、`cs_major_utility_rules`、`cs_major_tactical_coordinator`、`cs_bounds_sampler`、`cs_identity_gap_r38`、`cs_roster_v1_r56` 綠；紅的段與 main 相同（§5、§11）；33 段已補跑 |
| Season、生涯、Retention | world time、time block v2／v3、lifecycle、offseason、age drift、retirement、contract、general match、retention 全綠 |

**瀏覽器 Gate（合併樹，一次一支）：**

| Gate | 結果 | 對象 |
|---|---|---|
| `browser_check_flags_off_release_3aB`（新） | **25/25** | 打包結果，1366 |
| `browser_check_stage1_flows_3aB` | **47/47** | dev server，旗標關／開／確認後再關，賽後面板含 390 |
| `browser_check_time_controls` | **21/21** | dev server |
| `browser_check_offseason` | **18/18** | dev server |
| `browser_check_general_match_and_objectives` | **全綠** | dev server |
| `browser_check_exit_flush` | **12/12** | dev server |
| `browser_check_cloud_save_ui` | **29/29** | dev server；`REMOTE_E2E_NOT_RUN` |
| `browser_check_challenge_lifecycle` | **21/21** | dev server |
| `browser_check_player_challenge_slice8` | **50/50** | dev server，桌機＋390 |
| `browser_check_competition_hub_shell` | **27/27** | dev server |
| `browser_check_competition_shared_ui` | **15/15** | dev server |
| `browser_check_prod_moba_result_replay_release`（指向本機預覽，不是正式站） | **25/25**（批次外層被停之後，以孤兒狀態跑完） | 打包結果，390＋1366 |
| `browser_check_cs_major_formal_flow` | **63/63（1366）、63/63（390）**。第一次因為缺輸出資料夾 `HARNESS_FAIL` 0/0，建資料夾後重跑（§11） | 打包結果 |

## 4. 紅燈逐項分類（Node Gate）

| Gate | 紅的項目 | 分類 | 證據 | 處理 |
|---|---|---|---|---|
| `check_match_golden_v21a` 97/137 | 40 案 | **預期變化** | §6：每案的 digest、streamHash、resultHash、呼叫序列都等於同 Seed 的標準運營。原分支也是同樣 40 行 | 不重錄 |
| `check_career_golden_v21` 3/5 | P2 | **指紋差異** | fixture 釘 `0578fa882d74b205`，目前登記 `620196ccea5a8249` | 不重錄 |
| 同上 | R：24 案 | **預期變化** | 只有 `setupHash` 不同；phases、終局 snapshot、勝方、時長都相同 | 不重錄 |
| `check_challenge_golden_v21` 5/6 | P2 | **指紋差異** | 同上，其餘 5 項綠 | 不重錄 |
| `check_tactic_truth_3a` 36/37 | T2 | **指紋差異／既有債** | 表過期（loaded file changed）。原分支凍結狀態就紅，同一個原因 | 下次凍結才重測 |
| `check_club_mastery_v1` 264/265 | 1 條 | **既有債** | 乾淨 main 上同樣 264/265 | 登記，不動 |
| `check_formal_acceptance_3aB` 59/60 | B1 | **預期（合併基準不同）** | 基準 commit `1d0e219a` 不再是合併後的分支點；整合前就預測到 | 真正合併時要有一個看得見、Owner 核准的 commit |
| `check_player_challenge_slice3` 99/100 | §③ | **既有債（flaky）** | 首跑 19%（門檻 20%）。重跑兩棵樹各 4 次全 100/100：main 50、38、81、50%；合併樹 25、50、31、50% | 不放寬，維持登記 |

**真正回歸：0。**

`slice3` 的判定依據是分布重疊，樣本很小（各 4 次）。挑戰路徑本身在 C3 跨樹逐項相同，所以這不是合併造成的，但也不代表這條統計 Gate 變穩了。

## 5. verify：與 main 逐段對照

做法：把合併樹紅的段全部拿到乾淨 main 上再跑一次，比全部失敗行（抹掉 worktree 路徑與毫秒）。證據：`3a-B_整合_verify對照.json`、`3a-B_整合_verify分類.json`。

| 結果 | 段數 |
|---|---|
| 合併樹紅 | 75 |
| main 上同樣紅、失敗行相同 | 74 |
| main 上同樣紅、只差 log 裡的 worktree 路徑（`cs_major_replay_input`） | 1 |
| **main 綠、合併後紅** | **0** |

**對 v20 基準（`1d0e219a`）的讀法：** 44 段與基準相同；23 段只差一行錯誤碼；8 段不在基準的紅燈名單內。這 31 段全部在 main 上同樣紅，所以來源是 main，不是這個分支。

### main 帶來、Owner 應該知道的事（屬 CS 線，只記錄，沒有修）

- **verify 的訊號很弱。** 75 段紅裡有 **47 段**是第一步就停在來源指紋或標記檢查（`LIVE_SOURCE_SHA256`、`CURRENT_SOURCE_SHA256`、`SOURCE_PROVENANCE_MISMATCH`、`R15_LEGACY_R51_*`、`SIMULATOR_MARKER_MISSING`、`ROLE_MAPPING`）。這些段根本走不到行為斷言，所以「失敗行相同」對它們來說**不能證明行為相同**。
- **在 v20 基準綠、在 main 紅的 3 段：** `cs_distribution_baseline_r46`（`ROLE_MAPPING`，整合前檢查已提過）、`cs_matchup_acceptance_r57`（`SIMULATOR_MARKER_MISSING`）、`cs_match_completion`（`RangeError: Invalid string length`）。
- **`cs_major_simulation_v1`** 在兩棵樹都紅：`mirage 舊比賽逐格／選手／回合與正式 baseline 相同`，後面接 `RangeError: Invalid string length`。還沒有查是字串長度的工具問題還是真的不同。
- **環境或輸入不足：** `cs_owner4f_rules`、`cs_owner4e_pure`（要指定報告路徑）、`cs_major_replay_ui`（要真 fixture）、`cs_major_replay_input`（缺檔案）。

`tactic24`、`q5_history`、`hero_skills_round2` 在 v20 基準紅、這次綠。沒有查原因，不當成修好。

## 6. Golden 紅燈逐案與處理方案

### 為什麼 40 案會變

v21-A Golden 錄製時，binding 會走到引擎。Stage 1 分流之後，`career.v20` 不使用 binding，模板與選項回到標準運營加替換提示。所以旗標關閉時這 40 案**應該**等於標準運營。

### 40 案（`check_match_golden_v21a`）

全部的差異欄位都是 `digest+streamHash+resultHash`，呼叫差異都只有 `configureMatch`。完整雜湊在 `3a-B_整合_golden_v21a分類.json`。

| 類型 | 案例 | Seed | 與同 Seed 標準運營 | 分類 |
|---|---|---|---|---|
| 模板 | `v2.three_lane_pressure` | 19、3 | 相同 | 預期變化 |
| 模板 | `v2.jungle_invasion` | 23、7 | 相同 | 預期變化 |
| 模板 | `v2.bot_duo_pressure` | 29、11 | 相同 | 預期變化 |
| 模板 | `v2.mid_jungle_sync` | 3、19 | 相同 | 預期變化 |
| 模板 | `v2.support_roamer` | 7、23 | 相同 | 預期變化 |
| 模板 | `v2.dragon_pit_macro` | 11、29 | 相同 | 預期變化 |
| 模板 | `v2.top_solo_split` | 19、3 | 相同 | 預期變化 |
| 模板 | `v2.mid_solo_split` | 23、7 | 相同 | 預期變化 |
| 模板 | `v2.hard_engage_stack` | 29、11 | 相同 | 預期變化 |
| 模板 | `v2.protect_core_scaling` | 3、19 | 相同 | 預期變化 |
| 模板 | `v2.standard_macro` | 7、23 | 相同 | 預期變化 |
| 模板 | `v2.defensive_hold` | 11、29 | 相同 | 預期變化 |
| 選項 | `jungle.focus=farm` | 3、19 | 相同 | 預期變化 |
| 選項 | `jungle.focus=invade` | 7、23 | 相同 | 預期變化 |
| 選項 | `lanes.mid.stance=split` | 11、29 | 相同 | 預期變化 |
| 選項 | `seats.b5.mission=roam` | 19、3 | 相同 | 預期變化 |
| 選項 | `seats.b5.mission=protect` | 23、7 | 相同 | 預期變化 |
| 選項 | `teamfight.posture=passive` | 29、11 | 相同 | 預期變化 |
| 選項 | `teamfight.posture=aggressive` | 3、19 | 相同 | 預期變化 |
| 選項 | `objectives.tower=high` | 7、23 | 相同 | 預期變化 |

### 處理方案（現在不做，都要 Owner 核准）

| 項目 | 建議 |
|---|---|
| v21-A 40 案 | **不要在 v20 路徑重錄。** 那樣錄出來 40 案全部等於標準運營，Golden 就失去鑑別力。方案 B 確定候選版本後，改到 `career.v21` 路徑重錄，同時補 skirmish 隊伍的案例 |
| Career R 24 案 | 同一次重錄。差異只有 `setupHash`，要先說清楚為什麼 |
| 兩支 P2 指紋 | 同一次重錄時看得見地更新常數。指紋是這次語意凍結造成的，不是合併造成的 |
| 真實性表 T2 | 下次語意凍結時整輪重測（約 70 分鐘）。不把檔案排除在判定之外 |
| 正式驗收 B1 | 真正合併時，用一個看得見的 commit 重新登記基準 |
| Club Mastery、`slice3 §③` | 維持技術債，不放寬 |

**合併 main 前的做法：** 把上面這些紅燈寫成一份「已知紅燈帳」跟著合併，每條有原因、負責的後續步驟。**不把它們改成綠，也不宣稱 PASS。**

## 7. 旗標關閉的證據

| 問題 | 證據 | 結果 |
|---|---|---|
| 旗標真的關著嗎 | F1–F3：原始碼與 dist 的 `mobaTacticalDirectorV21:!1` | ✓ |
| 玩家看得到 v21 戰術書嗎 | 瀏覽器 N、V：首頁與戰術頁都沒有「戰術書」，沒有步驟與模板列，仍是「8 套戰術」 | 看不到 |
| 玩家做得出計畫嗎 | N10：打完一場，書是空的 | 做不出 |
| 存檔有 v21 標記嗎 | L1、N9：`moba-sim.v21`、`career.v21`、`challenge.v21`、`v21.b*` 都沒有 | 沒有 |
| 覆寫玩家存檔嗎 | S1–S8 前進與回滾；V1、V2、V8、V9：3 份計畫的舊存檔沒有被隔離，打完一場 `tacticBook` 逐位元相同，隊伍與名單都在 | 不會 |
| 影響既有比賽嗎 | C1–C6：同 Seed 同結果同存檔，互相重播成功；v20 Golden 153/153 | 不影響 |
| 對局紀錄版本 | 真實 Challenge 記錄 `moba-sim.v20` | ✓ |

### 要讓 Owner 知道的三件事

1. **版本常數（Owner 決定暫時保留，TD-3aB-3）。** 合併樹的 `MOBA_SIMULATION_VERSION` 是 `moba-sim.v21`（main 是 v20）。逐一查過讀取者：只進 manifest 或作預設值，實際路徑都傳 Challenge 的 v20，存檔沒有 v21 標記。**行為安全，但名字不對。** 改它會動到語意檔與指紋登記，要真實性表整輪重測。
2. **v21 的程式和文字會進公開 bundle（Owner 已接受）。** dist 的主 bundle 有 20 處「戰術書」、6 處 `moba-sim.v21`。玩家介面看不到，但有人讀 JS 就看得到模板與文案。大小與敏感資訊已量（§11）。
3. **回滾。** 合併後多一個 `tacticBook` 切片（加進 `CLOUD_PROFILE_KEYS`）。退回 main 之後，存檔時這個欄位會被丟掉。旗標關閉時玩家做不出計畫，所以實際沒有資料會損失。

## 8. 沒有驗證到的

| 項目 | 原因 |
|---|---|
| CS 玩法驗收 | 矩陣 55 場只證明對局跑完，Gate 固定輸出 `GAMEPLAY_ACCEPTANCE=NOT_ASSESSED`。正式流程用快速完成，只打 Mirage |
| verify 的盲區 | 已經紅的段如果多一條新紅，只有失敗行比對看得到；47 段停在第一步，看不到行為 |
| 手機真機 FPS、觸控 | 這台機器做不到；瀏覽器 390 不等於真機 |
| 正式站 smoke | 沒有部署 |
| 真 Supabase | `REMOTE_E2E_NOT_RUN`，沒有憑證 |
| Training 的瀏覽器流程 | 沒有專屬瀏覽器 Gate，只有 Node |
| 比賽內 Quick Finish 以外的自然跑完 | 瀏覽器都用快速完成；Node 的 CS 矩陣是完整模擬 |
| 整季連續遊玩 | 沒有這種 Gate |
| 合併之後 main 又前進 | 真正合併前要重新 fetch 再跑一次 |

**瀏覽器環境：** 跑到第 11 支後，Claude Code 的記憶體保護停掉了批次外層與防休眠任務（約 03:10）。批次腳本以孤兒狀態跑完 Replay（25/25），接著 CS 正式流程在開瀏覽器前就停了。我沒有重啟任何東西；事後查過，已經沒有殘留行程。

## 9. 合併 main 的建議

**技術條件已具備，建議在 Owner 最終 Review 後合併。** 程式面沒有阻擋。逐項狀態：

1. ✅ **版本常數：** Owner 決定暫時保留，技術債 TD-3aB-3；`check_release_markers_3aB` 釘住正式路徑仍是 v20。
2. ✅ **公開 bundle：** Owner 已接受；敏感資訊沒有比 main 多，主 bundle 多 3.68%（§11）。
3. ✅ **CS 瀏覽器正式流程與 33 段 CS verify 都跑完了**（§11）。
4. **已知紅燈帳**已寫好（`3a-B_已知紅燈帳.md`），跟著合併。⏳ B1 要在真正合併時，用看得見、Owner 核准的 commit 重新登記。
5. ⏳ **合併當下重新 fetch**，main 有新 commit 就重跑這份報告的 Gate；受監看的語意檔被碰到就停下來回報。這輪結束時 `origin/main` 仍是 `b4f8e0c3`。
6. **合併的方式：** 真 merge，不 Rebase、不 Squash，保留原分支的 commit 歷史。⏳ **Push main 會觸發部署**，所以要連同正式站 smoke 一起排，先確認正式站 `moba-sim.v20` 相關的 smoke 期待值。

**不合併的代價：** main 和分支會繼續分岔。CS 線每動一次，下次整合要重驗的範圍就更大。

## 10. Phase 3a-B 暫停後的下一個里程碑

**Owner 已正式採用「全賽季玩家閉環」，方案 B 暫緩。** MVP 範圍見 `docs/design/全賽季玩家閉環_MVP提案.md`（取代下面的工程排序）。玩家從開局打完整季，MOBA v20、CS Major、Training、Competition Hub、休賽期接起來沒有斷點，桌機和手機都能走完。

**為什麼是這個，不是直接做方案 B：**

- v21 暫停後，玩家手上就是 v20 和 CS Major v1.0。現在最大的缺口不在戰術深度，而在這些系統**各自有 Gate、但沒有人驗過連起來打一整季**。
- 方案 B 要先做判準、再跑約 14,000 場開發量測，再正式確認，短期內不會有玩家看得到的東西。
- 這個里程碑做完，方案 B 的「v20 玩家路徑基準」才有真實的玩法資料可以參考。

**範圍（要 Owner 排序）：**

| 順序 | 項目 | 依據 |
|---|---|---|
| 1 | 恢復 verify 訊號：更新過期的來源指紋與標記 | §5：47 段走不到行為斷言。屬 CS 線，要和 Codex 協調 |
| 2 | 整季連續遊玩 Gate（桌機＋390） | 目前沒有 |
| 3 | 手機真機 FPS 與觸控 | 多條線都掛著「待真機」 |
| 4 | 雲端存檔真 E2E | 要 Owner 憑證，`SUPABASE_SETUP_OWNER.md` |
| 5 | 技術債收斂：`TD-19`、`TD-21`、`CSREL-1`、`CSREL-2`、`defensive_hold` 內容重做 | 08 |

**方案 B** 排在這之後或平行，規劃見 `3a-B_下一階段B_前瞻驗收規劃.md`。**Phase 3b** 仍被 3a-B 擋住，不開始。

**需要 Owner 判斷：** 上面只是工程端看到的缺口。這個方向沒有玩家資料支持，如果 Owner 有更優先的產品目標（例如內容或線上），應該以那個為準。

## 11. 最後一輪（Owner 核准的四項決策之後）

### 結論

**具備最終放行的技術條件，等 Owner Review。** 沒有找到新回歸，也沒有需要停下來的情況。仍有的紅燈全部登記在 `3a-B_已知紅燈帳.md`。合併、Push、部署都沒有做。

### A. CS 正式流程

- **evidence 來源：** `review/cs-major-upgrade/evidence` 被 git 忽略（`.gitignore:55`），原始資料在 `worktrees/cs-fps-major-upgrade`（約 6 GB、2,479 項，HEAD 也是 `b4f8e0c3`）。
- **這支 Gate 不讀那些資料。** 程式碼第 31–33 行只把這個資料夾當輸出根目錄，要求新的子資料夾；它引用的 harness 與兩支 probe 也沒有碰。所以建一個空的被忽略資料夾就是正確做法，**沒有假 fixture，沒有放寬**，也沒有搬資料。
- **結果：** 1366 **63/63**（53 秒）、390 **63/63**（49 秒）。`fixtureInjected`、`localStorageCleared`、`localStorageSeeded` 都是 false，console 與 page error 0，自己開的 Chrome 都確認關閉。
- **走了什麼：** 首頁 → 賽前 → 配對 → Mirage → 戰術 → 真比賽 → 快速完成 → 結果（`cs_cf34fe42`，7:13）→ 入帳入史 → 返回首頁，沒有第二次完成。兩個寬度比賽 ID 與比分相同。
- **限制：** 只打一張圖、一般對戰、快速完成。這是 main 既有的 Gate 範圍。

### B. 33 段 CS verify

單線，一次一段，走 `tools/verify.mjs`，每段前有記憶體閘門。合計 38 分鐘，比上一輪說的「重型矩陣」輕得多。

| 結果 | 段數 |
|---|---|
| 合併樹綠 | **27** |
| 合併樹紅 | **6** |
| 紅的段在乾淨 main 同樣紅，失敗行相同 | **6** |
| **main 綠、合併後紅** | **0** |

6 紅裡 5 段連整份 log 都相同，包含模擬雜湊；`cs_major_support_grip` 只差每次隨機的 UUID。CS 矩陣 **55/55，新跑 55 場、重用 0**。證據：`3a-B_整合_CS33段.json`。

**輸入來源。** 有 4 段要讀舊證據或計畫，都從 CS 工作區逐檔複製到兩棵樹被忽略的資料夾，雜湊比對相同，原檔沒動：6 個檔案，雜湊在同一份 JSON 的 `inputs`。環境變數照原始紀錄：矩陣用 `authenticity-ui-v7` 計畫（`authenticity-final55-v11-*`）；診斷與 Mirage 重驗用 `authenticity-before` 計畫與原本的比賽 ID。

**我的一次設定錯誤。** 第一次把 `c-runtime-simulation-new-source.json.gz` 放進去，`cs_major_tactical_runtime` 因此回報「fixture 已存在」而紅。這支是要自己產生 fixture。改成指定新的輸出路徑後 **34/34**。不算回歸，也不算 CS 的紅燈。

**要讓 Owner 知道：** `cs_gameplay_authenticity_*` 每場會呼叫 Codex CLI 做一次唯讀額度查詢（`account/rateLimits/read`），這是這支 Gate 的原始設計。這輪約 59 次，都沒有開對話或額度異動；額度夠，沒有觸發暫停。

### C. 版本、旗標、存檔、Replay、Bundle

`check_release_markers_3aB` **30/30**（新）、`check_flags_off_integration_3aB` **26/26**、`browser_check_flags_off_release_3aB` **25/25**，都是這輪重跑。Replay 25/25 是上一輪的結果，測的是同一份 dist：**重建結果與受測 dist 581 個檔案雜湊全同。**

| 項目 | 合併樹 | main | 結果 |
|---|---|---|---|
| 發布旗標（原始碼、bundle） | false | 沒有這兩個旗標 | ✓ |
| Challenge 新場次與重播版本 | `moba-sim.v20` | `moba-sim.v20` | ✓ |
| `career.v20`、`challenge.v20` 規則集 | `moba-sim.v20` | 同 | ✓ |
| 內部常數 `MOBA_SIMULATION_VERSION` | `moba-sim.v21` | `moba-sim.v20` | Owner 暫留，TD-3aB-3 |
| v20 場次可重播；v21 場次不會被當 v20 重播 | 是 | — | ✓ |
| `mobaReplay.js`、`battleResultVersion.js` | 逐位元相同 | — | ✓ |
| 打完一場後所有 localStorage 的 v21 標記 | 0 | — | ✓ |
| CS 模擬 worker | `fpsSim.worker-CDdfgY2S.js` | 同一個，雜湊相同 | ✓ |

| Bundle | 合併樹 | main | 差距 |
|---|---|---|---|
| 主 bundle | 5,062,134 B（4.828 MiB） | 4.656 MiB | **+175.7 KiB（+3.68%）** |
| 主 bundle gzip | 1.628 MiB | 1.579 MiB | **+50.3 KiB（+3.11%）** |
| 全部 JS／CSS／HTML | 6.748 MiB | 6.576 MiB | +176.3 KiB（+2.62%） |
| 全部 JS／CSS／HTML gzip | 2.218 MiB | 2.168 MiB | +50.7 KiB（+2.28%） |
| dist 全部檔案 | 127.575 MiB | 127.403 MiB | +0.14% |

前面寫的「5.06 MB」是同一個檔案，用十進位算。

**敏感資訊（打包結果，17 類比對，合併樹沒有比 main 多）：** 金鑰、JWT、私鑰、Supabase 專案網址、Windows 使用者路徑、本機 repo 路徑、Owner 帳號都是 0。出現的只有：`service_role` 3 處（防呆偵測器與錯誤文案）、email 3 處（GSAP 授權註解），兩棵樹相同。source map 沒有。比對是模式清單，**不能保證涵蓋所有可能的敏感內容**。

**v21 文字（已接受）：** 「戰術書」20、`moba-sim.v21` 6、`career.v21` 4、`challenge.v21` 6、`balanceTool.v21` 3、`v21.b2` 9；main 都是 0。**內部 Gate 名 `G-A8` 沒有進 bundle。**

**main 帶來的一件事：** `dist/artifacts/cs-final-integration/owner-review.html`（中文內部驗收頁）會公開發布。這不是這個分支造成的，也不是金鑰，但 Owner 可能想知道（TD-3aB-8）。

**Golden 紅燈帳保留，沒有重錄。**

### D. 紀錄

- `3a-B_決策紀錄.md`：SDD 帳本被 git 忽略，重要決策記到這裡。
- `3a-B_已知紅燈帳.md`、`3a-B_整合_CS33段.json`、`3a-B_整合_版本與Bundle.json`。
- `docs/design/全賽季玩家閉環_MVP提案.md`（第 E 項）。

### 放行前還沒做的（都是合併當下才能做）

1. Owner 最終 Review。
2. 重新 fetch，確認 main 沒有前進；有就重跑。
3. B1 用看得見的 commit 重新登記。
4. 排 Push 與正式站 smoke，Push main 會觸發部署。

### 這輪之後仍然沒有驗證到

手機真機、正式站 smoke、真 Supabase、整季連續遊玩、Training 瀏覽器流程。verify 有 47 段停在第一步看不到行為（TD-3aB-1）；這次 CS 的主要證據改靠模擬 worker 雜湊相同、`src/battle/fps` 零差異、正式流程與 55 場矩陣。

## 12. 正式合併與部署（Owner 最終 Review）

### 結論

**已發布。** 旗標關閉的 Phase 3a-B 程式已進 main 並部署，正式站全部 Smoke 通過，沒有新回歸。v21 仍暫停，玩家看到的還是 v20。

| 項目 | 值 |
|---|---|
| 發布前 `origin/main` | `b4f8e0c3`（這段期間沒有前進） |
| 發布 commit | `bd063ac741ae8b5ac1f21773f8e101ed426c8b3c` |
| 方式 | fast-forward，真 merge `29cdf9dc` 保留；沒有 Rebase、Squash、Force Push |
| Deploy Run | `41809170806`，`completed success` |
| 正式站入口 | `index-CODqm6Fg.js` → `index-DfJdspjA.js`，5,062,288 B |
| `src` 與測試性整合 | 相同（`29cdf9dc` 之後沒有動 `src`） |

### B1 登記

- `66da3df2`：新增 `tools/fixtures/stage1_merge_registration_3aB.json`。B1 改從合併 commit 的兩個父節點重算分支點，並新增 B1a 防竄改檢查。**基準檔沒有改**，B2 仍成立。
- `583805c0`：**Owner 只點名 B1，這是我擴大的範圍。** `S9a` 與旗標關閉的 `M1`、`M2` 也比對會移動的 `origin/main`，Push 後會假紅（整合前檢查第 58 行就預測過），所以固定到合併前的 main。比對內容相同，沒有拿掉斷言。
- `57df97a9`：套用 Reviewer 的修改：四個欄位都有竄改測試，旗標關閉 Gate 拒絕不是合併前 main 的對照樹（新增 M0）。
- **獨立 Reviewer：APPROVE WITH CHANGES，沒有 Blocker。** 結論是沒有放寬任何東西。它也指出 5 支舊 Gate 在合併後失去保護，已登記在 `3a-B_已知紅燈帳.md`（TD-3aB-9）。

### Push 前驗證

完整輸出：`3a-B_發布回歸紀錄.txt`。

| 項目 | 結果 |
|---|---|
| Build、重建比對受測 dist | ✓，581 檔雜湊全同 |
| Node Gate | 非綠的只有帳本上的 5 支：v21-A 97/137、Career 3/5、Challenge 5/6、Truth 36/37、Club Mastery 264/265 |
| 正式驗收 | **61/61**（B1 已登記） |
| v20 Golden、分流、回滾 | 153/153、75/75、15/15 |
| verify | `tactic24` 29/29、`runtime29` 通過、`cs23` 28/28 |
| Training、Hub、存檔、Challenge | 全綠；`slice3` 這次 100/100，**仍是登記中的 flaky** |
| 瀏覽器 | 旗標關閉 25/25、stage1 47/47、exit flush 12/12、雲端 UI 29/29、挑戰 21/21、Hub 27/27、共用 UI 15/15、時間 21/21、休賽期 18/18 |
| CS 正式流程（打包版） | 1366 63/63、390 63/63 |
| 本機彩排（舊 Bundle 存檔 → 新 Bundle 讀回） | 89/89 |
| 模擬 Push 後（`origin/main` 等於 HEAD） | 正式驗收 61/61、分流 75/75、旗標關閉 27/27 |
| 推上去的內容 | 金鑰比對 9 類都是 0；最大的檔案是 05（2 MB） |

**彩排第一次 79/81：** `T0 進入 Training` 兩條紅。是新 Gate 少了「先選選手」，`TrainingScreen.jsx` 與 main 沒有差異，不是產品問題。

### 正式站 Smoke（獨立 profile，碰不到玩家存檔）

| Gate | 結果 | 範圍 |
|---|---|---|
| `browser_check_prod_release_3aB`（新） | **90/90** | 1366＋390：首頁、MOBA v20、結算、Replay、存檔、Training、Hub、Console；舊站存檔升級 |
| `browser_check_cs_major_formal_flow --url` | **63/63、63/63** | 1366、390：真比賽、快速完成、結算入帳入史 |
| `browser_check_prod_moba_result_replay_release` | **25/25** | 390、1366 |
| `browser_check_prod_b1c` | **38/38** | 存檔防護 |

**舊存檔：** 部署前從舊正式站打一場存下真存檔，部署後讀回：`manager`、`team`、`lineup`、`players`、`finance`、`processedMatchTransactions`、`competitionByMode`、`csHistory` 逐值相同，沒有欄位被丟掉，沒有隔離檔。再打一場入帳恰好多一筆，沒有 v21 標記。page error 0、console error 0。

**沒有用到回滾。**

### 紅燈與歷史

已知紅燈帳、G-A8 STOP、Challenge STOP、技術債與歷史證據都保留，沒有重錄、沒有改判。

### 仍未驗證

手機真機（只有 390 模擬）、真 Supabase、整季連續遊玩、MOBA 與 CS 比賽自然打完（Smoke 都用快速完成）、CS 只打 Mirage。

### 下一階段

Season End-to-End Audit v1 的 W0：`review/season-e2e/W0_現況盤點.md`。

