# Phase 3a-B 旗標關閉：測試性整合驗證報告

- 日期：2026-11-04。依 Owner Review（第三次 G-A8 STOP 之後）第 A–D 項。
- **這是測試性整合，不是合併 main。** 沒有 Push、Deploy，沒有啟用 v21，沒有改 CS，沒有重錄 Golden，沒有用保留 Seeds。
- 合併樹：`integration/moba-3aB-flags-off-test`，合併 commit `29cdf9dc`（父：`origin/main` `b4f8e0c3`、`feature/moba-phase3a-stage1` `e11f0e4f`），真 merge、`--no-ff`。
- 對照樹：`.sprints/moba-3aB-main-baseline`，分離 HEAD 在 `b4f8e0c3`。
- 原分支維持在 `e11f0e4f`，沒有動。**這輪的紀錄與新 Gate 只 commit 在整合分支。** 真正合併時這些 commit 要一起決定。

## 1. 結論

| 問題 | 答案 |
|---|---|
| 新增回歸 | **沒有找到。** 合併樹所有紅燈都能對到 main 或原分支上的同一個紅燈，或是可解釋的預期變化。限制見 §8 |
| 旗標關閉是否安全 | Node 26/26、打包後瀏覽器 25/25。玩家看不到戰術書，存檔沒有 v21 標記，帶計畫的舊存檔不會被改寫 |
| 能不能宣稱全綠 | **不能。** 有 Golden 紅燈、main 帶來的 verify 紅燈，33 段 CS verify 沒跑，**CS 瀏覽器正式流程也沒有跑成** |
| 是否建議合併 main | **建議，但有條件**（§9）。現在還不應該合併 |

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
| 瀏覽器 | 13 支 | **12 支全綠，CS 正式流程沒有跑成**（見下表） |

**各系統的 Node 證據：**

| 系統 | Gate |
|---|---|
| MOBA v20 | `check_match_setup_3a` 153/153、`check_live_setup_3a` 119/119、`check_stage1_split_3aB` 75/75、`check_stage1_rollback_drill_3aB` 15/15、`tactic24`、`runtime29`、`regress`、`regress2` |
| Training | `check_training_competition_integration` 13/13 |
| Competition Hub | `check_competition_release_gate` failed 0/11、`check_competition_shared_ui` 28/28、`check_competition_visual_shell` 22/22、`check_cs_competition_hub` 31/31、`check_r63_competition_integration` 19/19 |
| 存檔 | `check_save_bundle_b1b`、`check_save_hardening_b1c`、`check_cloud_save_b1d`、S1–S8（跨樹） |
| Replay | `check_battle_result_v3_replay`、`check_replay_display_text` 22、`check_replay_team_buff_scrub` 3/3 |
| Challenge | slice 1、2、4–8 全綠；C1–C6（跨樹：同 Seed 同結果，兩邊互相重播成功） |
| CS（Node） | `cs23`、`cs_major_utility_rules`、`cs_major_tactical_coordinator`、`cs_bounds_sampler`、`cs_identity_gap_r38`、`cs_roster_v1_r56` 綠；紅的段與 main 相同（§5）；33 段沒跑 |
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
| `browser_check_cs_major_formal_flow` | **沒有跑成**：`HARNESS_FAIL` 0/0。這棵樹沒有 `review/cs-major-upgrade/evidence`，Gate 在開瀏覽器前就停了。**不是產品失敗，也不算通過** | 打包結果，1366 |

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

1. **版本常數。** 合併樹的 `MOBA_SIMULATION_VERSION` 是 `moba-sim.v21`（main 是 v20）。逐一查過讀取者：只進 manifest 或作預設值，實際路徑都傳 Challenge 的 v20，存檔沒有 v21 標記。**行為安全，但名字不對。** 改它會動到語意檔與指紋登記，要真實性表整輪重測。要改或保留由 Owner 決定（§9 第 1 項）。
2. **v21 的程式和文字會進公開 bundle。** dist 的主 bundle 有 20 處「戰術書」、6 處 `moba-sim.v21`。玩家介面看不到，但有人讀 JS 就看得到模板與文案。Bundle 是 5.06 MB，沒有量和 main 的差距。
3. **回滾。** 合併後多一個 `tacticBook` 切片（加進 `CLOUD_PROFILE_KEYS`）。退回 main 之後，存檔時這個欄位會被丟掉。旗標關閉時玩家做不出計畫，所以實際沒有資料會損失。

## 8. 沒有驗證到的

| 項目 | 原因 |
|---|---|
| 33 段 CS verify 沒跑：`cs_owner4f_side_audit`、`cs_owner4e_closure`、`cs_awareness_steering`、`cs_owner4_contact_runtime`、`cs_owner4d_closure`、`cs_utility_purchase_named30`、`cs_utility_purchase_plan_runtime`、`cs_owner5_runtime`、`cs_gameplay_legacy_exact_equivalence`、`cs_gameplay_authenticity_diagnostic`、`cs_gameplay_authenticity_fixture_retry`、`cs_gameplay_authenticity_matrix`、`cs_visibility_bounds`、`cs_major_navigation_cache`、`cs_major_room_fixtures`、`cs_major_shader_warmup`、`cs_major_scene_v1`、`cs_major_camera_framing`、`cs_camera_recovery`、`cs_major_character_v1`、`cs_major_weapon_sockets`、`cs_major_support_grip`、`cs_major_gunplay_sockets`、`cs_major_animation_lifecycle`、`cs_major_weapon_pose_layers`、`cs_major_weapon_handling`、`cs_major_pov_weapon`、`cs_major_tailored_clothing`、`cs_major_audio_pool`、`cs_major_ambient_audio`、`cs_major_audio_playback`、`cs_major_tactical_runtime`、`cs_major_tactical_edge_runtime` | 重型矩陣；靜態閉包推論碰不到，但沒有實跑 |
| **CS 瀏覽器正式流程** | Gate 沒有跑成（見 §3）。CS 只有 Hub 殼層的瀏覽器證據（`competition_hub_shell` 27/27），**沒有打過一場 CS**。要跑得先建 evidence 資料夾；因為批次剛被記憶體保護停掉，依規定等 Owner 開口才跑 |
| verify 的盲區 | 已經紅的段如果多一條新紅，只有失敗行比對看得到；47 段停在第一步，看不到行為 |
| 手機真機 FPS、觸控 | 這台機器做不到；瀏覽器 390 不等於真機 |
| 正式站 smoke | 沒有部署 |
| 真 Supabase | `REMOTE_E2E_NOT_RUN`，沒有憑證 |
| Training 的瀏覽器流程 | 沒有專屬瀏覽器 Gate，只有 Node |
| 比賽內 Quick Finish 以外的自然跑完 | 這輪瀏覽器用快速完成 |
| 整季連續遊玩 | 沒有這種 Gate |
| 合併之後 main 又前進 | 真正合併前要重新 fetch 再跑一次 |

**瀏覽器環境：** 跑到第 11 支後，Claude Code 的記憶體保護停掉了批次外層與防休眠任務（約 03:10）。批次腳本以孤兒狀態跑完 Replay（25/25），接著 CS 正式流程在開瀏覽器前就停了。我沒有重啟任何東西；事後查過，已經沒有殘留行程。

## 9. 合併 main 的建議

**建議安全合併，但不是現在。** 程式面沒有阻擋。合併前要做完：

1. **Owner 決定版本常數：** 建議保留 `moba-sim.v21` 不動，因為改它要重測真實性表，而且行為已證實安全；另外在紀錄裡寫明「常數是候選標籤」。如果 Owner 要 main 上的名字絕對正確，就要排一輪重測。
2. **Owner 接受 v21 程式與文字進公開 bundle**（§7 第 2 項）。不接受就要多做一層建置時排除，那是新工作。
3. **跑 CS 瀏覽器正式流程**（這輪沒有跑成），並**補跑 33 段 CS verify**，放在 main 對照的同一輪，或由 Owner 明確接受不跑。
4. **已知紅燈帳**一起合併（§6），B1 用看得見的 commit 重新登記。
5. **重新 fetch**，main 有新 commit 就重跑這份報告的 Gate；受監看的語意檔被碰到就停下來回報。
6. **合併的方式：** 真 merge，不 Rebase、不 Squash，保留 304 個 commit 的歷史。**Push main 會觸發部署**，所以要連同正式站 smoke 一起排，先確認正式站 `moba-sim.v20` 相關的 smoke 期待值。

**不合併的代價：** main 和分支會繼續分岔。CS 線每動一次，下次整合要重驗的範圍就更大。

## 10. Phase 3a-B 暫停後的下一個里程碑

**建議：「全賽季玩家閉環」。** 玩家從開局打完整季，MOBA v20、CS Major、Training、Competition Hub、休賽期接起來沒有斷點，桌機和手機都能走完。

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
