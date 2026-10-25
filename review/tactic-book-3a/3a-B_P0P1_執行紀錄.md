# Phase 3a-B 執行紀錄（P0＋P1）

- 日期：2026-10-25　作者：Claude（Owner 指派）　分支：`feature/moba-phase3a`（本機，無上游）
- 依據：Owner 2026-10-25 正式核准 3a-B 開工（八項決策＋額外要求）、`review/tactic-book-3a/3a-B_開工清單.md`
- 範圍：P0 全部、P1 全部、P2 事前登記草案與凍結準備。**沒有**跑正式大型發布量測、**沒有**啟用發布旗標、**沒有** Push／Deploy／整合 main；沒有碰 CS／FPS 或其他 worktree（只在 scratchpad 開過兩個暫時 worktree，見 §8）。

---

## 1. P0-1 證據延續重播（六份歷史研究）——通過

工具 `tools/replay_evidence_carryforward_3a.mjs`；結果 `tools/fixtures/evidence_carryforward_3a.json`（`CARRIED_FORWARD`）。

| 研究 | 臂（含對照） | 重播場數 | 與原始逐場紀錄相同 |
|---|---|---|---|
| 3a-A 追加複驗＋快速模式（seeds 1001–1400） | 39 | 780 | 780 |
| C3-2rev1（18001–18400） | 17 | 340 | 340 |
| C3-3（18401–18800） | 7 | 140 | 140 |
| C4（3401–3800） | 23 | 460 | 460 |
| C5R（8201–8600） | 25 | 500 | 500 |
| C6（4201–4600） | 19 | 380 | 380 |
| **合計** | **130** | **2,600** | **2,600（不同 0）** |

- 比對：原始紀錄的**每一個欄位**都要在重播紀錄裡且逐位元相同（重播可以多出欄位：儀器後來只新增欄位）。
- 罕見路徑：每臂 20 seeds，先挑「原始紀錄裡處理組與對照組在宣稱指標上不同」的 seeds（|差| 最大 3 個＋等距 7 個）。每一臂至少 10 個這種 seed，C5R 後期強邊（n=400 中只有 26–31 場不同）也包含在內。
- 來源核對：用原始紀錄重算每一臂的配對平均，與各結果檔的 meanA／meanB 完全相同，確認原始紀錄就是那份證據的來源。
- ⚠ 重播是在 `02936f55`（指紋 `b37772a2f1777b03`）下跑的。P1 之後指紋改成 `e3acf891023937e9`，**語意凍結後必須在最終指紋下再跑一次**（約 62 分鐘，見 §7）。

## 2. P0-2 tactic24——27/29 → 29/29

- BattleResult 那條改成依正式版本常數 `BATTLE_RESULT_VERSION` 驗證：原本寫死 v2，自 v14（`6d93a973`）起就是過期的版本事實；判準仍是「恰好等於目前版本」，沒有放寬。
- m6／m4 舊宣稱（Gank 次數 ≥ ×1.15）**失效、保留歷史**：v20 改成評分選路後，次數不再由 gankInterval 決定。
- 新宣稱依 v20 機制，**先登記、再量測**：
  - 機制：評分裡的權重項是 (w/max w)×0.2，m6 兩側被扣 0.082；
  - 登記 `3da6b9ff` 在量測之前；新 seeds 19001–19200；判準是中路占比 ×1.15 且 z ≥ 2。
- 結果：中路 Gank 占比 m6 0.452（341/755）vs m4 0.305（285/935），×1.48、z 6.21（以比賽為單位的群集 z 5.89）⇒ **PASS**。
  - 只報告：每場 Gank 數 m6 3.77、m4 4.67，印證舊的次數宣稱確實失效。
  - gate 自己的 40 seeds 是 ×1.49，門檻仍是 ×1.15。

## 3. P0-3 紅藍經濟（第 0 步）與 E1 事前登記草案

**既有逐場紀錄重分析**（`tools/analyze_side_asymmetry_3aB.mjs`，0 場新對局；**不是新證據**）
- 對照組前期金差：巨龍側隊伍領先，藍為巨龍側 +332、紅為巨龍側 +227 ⇒ 佈局效果約 +280，純顏色約藍 +52。
- C6 六個前期有作用的臂都是「紅方效果 > 藍方效果」，但**六臂共用同一個對照組**（側別差裡都含 2×對照組金差），不能算六個獨立觀察。
  - 依巨龍側分層後，紅仍略大（顏色 z 0.2–2.2）；配置效果的 z 在 −0.5 到 1.8 之間。
- 「強邊＋積極 ≈ 2 倍抓人」：組合對單獨強邊是 ×1.006，交互作用 z −0.07／−0.83 ⇒ **翻倍來自強邊本身**，不是疊加暴增。藍方 ×1.99 正好貼在既有 2.0 上限。

**經濟意義**：150 金＝半次擊殺（擊殺 300、助攻分 150）＝對照組前期金差 SD 886 的 0.17＝巨龍側前期優勢的一半。

**檢定能力**：用既有變異估算，n=400 時 ±150 的 TOST 檢定能力只有 0.13–0.42（真實差為 0 時），**大多會判成 INCONCLUSIVE**；要達到 80% 檢定能力，每臂每側需 n≈790–1050。

**E1 登記草案**（`tools/fixtures/e1_registration_3aB.json`，**draft、不可執行**）
- 樣本：主比較（滾雪球、快速下路強邊）n=1200；安全／參考臂 n=400；共 8,400 場，約 3 小時。
- 判準：PASS／STOP／INCONCLUSIVE 都已定義。
- 護欄：己方前期金錢、打野與下路前期死亡、勝率帶 [40, 60]%。抓人上限改成「95% 信賴下界 > 2.0 才 STOP」：點估計已經是 1.99，若用點估計判，約一半樣本會因抽樣誤差 STOP。

## 4. effectiveSeed 與研究 seed 區段

`tools/fixtures/study_seed_plan_3aB.json`＋`tools/check_study_seed_plan_3aB.mjs`（19/19）用**正式程式碼的正規化函式**算出每個研究的實際引擎種子。

| 研究 | 組裝路徑 | 區段 | 規則 | 結果 |
|---|---|---|---|---|
| tactic24 新宣稱 | engine（`new LogicEngine(seed)`，`seed\|0`） | 19001–19200 | 原樣 | 200 個不同種子 |
| E1 | tool（balance runner，seedSource tool） | 21001–22200 | 原樣 | 1,200 個；相鄰偶奇是不同種子 |
| E2 | career（`normalizeLiveSeed` ＝ `(s>>>0)\|1`） | 23001–23799 | **只走奇數** | 400 個；對手 `AI_TEAMS[seed%7]` 每隊 57–58 場 |
| G-A8 | tool | 25001–25400 | 原樣 | 400 個 |
| side bias career.v21 | career | 27001–31999 | 只走奇數，走到兩種配置各 ≥1000 | 停在 31057 |
| side bias challenge.v21 | challenge（`toEngineSeed`） | 33001–37999 | 只走奇數 | 停在 37097 |

- 所有區段彼此不重疊，也不碰任何已用或保留區段；repo 裡 24 個登記區段都在「已用」清單內（漏列會被抓）。
- 只走奇數 seed 時，7 隊的對手輪替仍涵蓋每一隊。

## 5. P0-4／P0-5

- **E2 登記草案** `tools/fixtures/e2_registration_3aB.json`：draft；要等 AI 教練與語意凍結之後才能正式登記。
- **AI 教練事前登記** `tools/fixtures/ai_coach_registration_3aB.json`（**實作前** commit `3da6b9ff`）
  - 預期 v21-A 恰好 6 個 live 案改變（有 AI 對手且藍方有戰術）；與 laneFrame 的 9 個聯集＝14。
  - 實測：career.v21 重跑 v21-A，改變集合**恰好是這 14 個**，其餘 83 案逐位元相同（`check_c3_phase_skeleton` G1c）。
- **v21 黃金缺口**
  - challenge.v21 已補：`check_challenge_golden_v21` 6/6。
  - career.v21 的 v21 專用選擇（每時期、強邊、勝利條件）仍屬 P2-6。

## 6. P1

| 項目 | 內容 | 驗證 |
|---|---|---|
| **T16 challenge.v21** | 規則集照正式架構表：技能／被動／曲線 ON、天賦／裝備 OFF、佈局依 seed、Live 順序、Director core.v1、laneFrame teamRelative（順帶修掉 TD-3A-23 殘留）。雙方只收 legacy／std，**沒有**自訂每時期戰術。<br>**旗標控制**：`mobaTacticalDirectorV21` 與 `heroSkillsV1` 都開才用 v21；每場挑戰的規則集**由它記下的模擬版本凍結**。<br>新挑戰／快照記下 `CHALLENGE_SIMULATION_VERSION`：旗標關＝`moba-sim.v20`，與正式站相同。 | ruleset 51/51、challenge 黃金 6/6（含雙向版本相容：v20 在 v21 下、v21 在 v20 下都明確拒絕）、challenge setup 65/65、slice1 108、slice2 79、slice3 100、slice4 60、slice5 71、slice6 30、slice7 35、slice8 122 |
| **T15 AI 教練 v1** | `platform/tactics/aiCoach.js`：依風格選模板，依自家名單素質決定強邊與輔助任務。<br>只挑戰術書會提供的選項，結果決定性；不讀藍方；賽前決定。<br>career.v21 的 `redTactic` 改成 `aiCoachV1`；career.v20 不變。 | 新 gate `check_ai_coach_3a` 10/10；skeleton 171/171（改變集合＝登記 14）；laneFrame 55/55 |
| **後期強邊改回 design** | C5R 三列由 `REPLICATION_CONFIRMED` 移到 `REPLICATION_WITHHELD`（owner_hold）。證據保留、係數不動；前／中期與快速模式照舊。 | replication 53/53、registry 35/35 |
| **T13 最小完整 UI** | 三步驟（情報／戰術書／確認）、對手情報概要（v21 顯示 AI 教練概要、v20 顯示風格模板名稱，**不含權重**）、確認頁。 | `check_tactic_book_ui_3aB` 8/8；瀏覽器 v21 30/30、static 31/31 |
| **決策 4 提示** | 被過濾的選項清楚列出；另存時顯示「將另存一份不含上述選項的計畫，原計畫保留」。<br>過濾後與別份重複時不另存、不改名；戰術書已滿時事前擋下。<br>開局時，本場未使用的選項會在對戰畫面顯示（可關閉）。 | 瀏覽器 S1–S4；開局提示只有 Node 資料流（U5），**沒有瀏覽器實測** |
| **方案 A 預演批次** | `check_tactic_truth_3a --measure --preview`：只寫 repo 外的 `TacticTruth.preview.v1`；T1 拒收；預演與正式資料夾互不沿用。 | 預演進行中（見 §7） |
| **指紋** | `aiCoach.js` 加入語意檔清單；`moba-sim.v21` 同版號重新登記一次 `e3acf891023937e9`（P1 全部語意變更合併）。 | version gate 83/83 |

**其他 gate**
- match ruleset 51/51、tactical director 97/97、directive 61/61、book view 25/25、career v21 C6 6/6、win condition 11/11、phase choices 24/24、evidence scope 7/7、seed plan 19/19。
- match setup 153/153、assembler 227/227、live setup 118/118。
- verify：tactic24（29/29）與 runtime29 都 PASS；build 成功（built in 17.9s）。

## 7. 未過的 gate 與待 Owner 決定的事

1. **`check_match_golden_v21a` 119/131：12 個 Challenge 案的 resultHash 改變（未事前登記）**
   - digest、streamHash、configure 序列、勝負、比分、時長、執行統計都相同；只有結果裡的**三個身分欄位**不同：`simulationVersion` v21→v20，以及綁快照雜湊的 `challengeId` 與 `draft.hash`。我在舊 commit 開暫時 worktree 逐欄比對確認過。
   - 原因：v21-A 錄到的是舊分支「挑戰記成 v21、實際跑 v20 規則」的誤記狀態；T16 依旗標改記 v20，正好是正式站的值，所以 v20 黃金的 12 案因此重新逐位元相同（challenge setup 65/65）。
   - 依「改動已登記門檻要停下回報」，我**沒有**改 v21-A gate 或重錄 fixture。請 Owner 二選一：
     - ① 登記版本事實例外：這 12 案的 resultHash 允許只差這三個欄位，其他照比；
     - ② 重錄 v21-A 的 12 個 Challenge 案，看得見地改 PINNED 常數。
2. **E1 樣本數與護欄門檻**
   - n=400：約 95 分鐘，但大多會判成 INCONCLUSIVE。
   - n=1200（建議）：約 3 小時。
   - 另需確認打野／下路死亡 +50% 的護欄門檻，以及抓人上限改用信賴下界。
3. **發布順序**（審查 Major 1）。正式真實性表重測後若推導出新的量測排除，提供清單會變，AI 教練的計畫也跟著變。順序定為：
   - ① 預演看排除；
   - ② 語意凍結；
   - ③ **先**重新核對 AI 教練變動集合，必要時重新登記；
   - ④ 正式真實性表；
   - ⑤ 重錄 challenge.v21 黃金並重新釘死；
   - ⑥ 在最終指紋下重跑證據延續重播；
   - ⑦ 再跑 E1／E2／G-A8／side bias。
4. **challenge.v21 受旗標控制**：正式架構「不得強制開啟未上線功能」要求如此。分支自 T3 起「整合即讓正式站 v20 挑戰不可重播」的既有風險，T16 也一併修掉。請 Owner 確認這個做法。
5. **已存或恢復中的 binding 仍會套用後期強邊**：與「被撤下的控圖運營已存計畫照舊解析」同一套規則。從戰術書開局的計畫會先被過濾並提示；恢復進行中的場次則沿用原 binding，不另提示。若 Owner 希望恢復時也拿掉並提示，屬下一步。
6. **AI 教練的規則表**（`STYLE_TEMPLATES`）是呈現與設計數字，請 Owner 過目。例：積極型若打野最強選「野區入侵」，否則「三路壓制」並帶前期滾雪球。

## 8. 流程說明（照實）

- **暫時 worktree**：證據重播約 62 分鐘。這段期間為了不讓 src 的修改影響重播結果檔的依賴檢查，P1 程式在 scratchpad 的暫時 worktree（暫時分支）上開發；重播結果寫入後，8 個 commit 以正式訊息搬回主分支，暫時 worktree 與分支已刪除。node_modules 的 junction 先拆，共用目標確認完好。
- 為了逐欄比對 v21-A 的差異，另在 scratchpad 以 `66f774e4` 開過一個 detached 暫時 worktree。
- **重播 `--report` 的條件**：改成「重播依賴（src、tools/lib、tools/balance）自開跑 commit 起沒有變、而且乾淨，指紋相同」才寫結果檔，原本是 gitHead 完全相同。
- **獨立審查**：APPROVE WITH CHANGES（3 major、8 minor）。採納項目：
  - Major 2：補瀏覽器 gate 並實跑；
  - Major 3：parity 鉤子輸出完整對手隊伍；
  - Minor：另存後的狀態、對手情報改依 `redTactic`、確認頁 fallback、v21 規則集逐字釘死、過時註解。

  Major 1 寫進 §7-3。未改的兩項：`challengeInstance`／`squadSnapshot` 的預設值後備走不到；`bindingForRuleset` 見 §7-5。
- **制度檔備份**：05、08 另建 `_backup_20261025_2_*`，Roadmap 建 `_backup_20261025_04_Roadmap.md`；今天稍早的 `_backup_20261025_*` 沒有覆蓋。
