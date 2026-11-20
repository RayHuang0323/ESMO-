# 附錄 B：版本、Replay 與驗證工具的隔離風險（2026-11-14）

- 基準：`feature/moba-tower-edge-v23` 206383b3。
- 來源：唯讀搜尋代理依程式碼整理。主文件 `MOBA_複雜問題整合審查.md` §五 寫明我抽查了哪些。

## A. Replay 隔離：風險中

- MOBA Replay 只播放已存的 frame，不重跑引擎（`mobaReplay.js:4-5`）。只留在記憶體、只保留最近一場，不寫 localStorage（:24-25）。
- Replay 存的是 version、seed、config（只有戰術 id）、frames、events、resultSummary（`mobaReplay.js:231-251`；`replayBuffer.js:127-149`）。沒有 simVersion、rulesetId、layers、setupHash。
- BattleResult 存 `schema`（BattleResult.v3）、`tactic` 與戰績（`battleResult.js:25-55`）。沒有模擬版本，也沒有規則集。
- 唯一把整份 ruleset（含 safeRoute 的值）與 setupHash 存下來的是**進行中的比賽**：`activeMatch.config.ruleset` 與 `matchSetupHash`（`useLocalServer.js:282-285`），經 `saveActiveMatchSnapshot`（`profileStore.js:3652-3680`）寫進 `esmo.profile.v1`。
- Challenge 只存 `simulationVersion`（`challengeInstance.js:168`）。

**會靜默重算的路徑：恢復進行中的比賽。**
1. 恢復時用同一個 seed 從頭 tick，追到存檔時間（`useLocalServer.js:297-330`）。
2. 規則集由 `resolveLiveRuleset` 決定（`liveMatchSetup.js:195-200`）。落盤的 ruleset 只有通過 `createMatchSetup` 才會沿用，而正式規則集的字串層被釘在登錄值（`matchSetup.js:170`）。
3. 落盤的 safeRoute "v3" 對上現在登錄的 "v5" 會被判不合法，靜默改用旗標解析：旗標開著就變成 career.v23／"v5"；旗標關了會退到 career.v20。
4. 恢復時沒有拿存下的 `matchSetupHash` 比對（`useLocalServer.js:196-234`）。`check_live_setup_3a` L4（:332-335）也證實：落盤值被改過就改依旗標。
5. 這條路徑完全不經過 `canReplay`。

影響：正式站旗標全關，目前碰不到。在開了 v23 旗標的預覽或開發 build 裡，跨 commit 恢復的比賽會在比賽中途靜默換規則，畫面不提示。

## B. Challenge 隔離：風險低

- `challengeRulesetForVersion` 只查表，表裡只有 v20 → challenge.v20、v21 → challenge.v21，其他回 null（`matchRuleset.js:189-190`）。
- 新挑戰記下的版本來自 `challengeSimulationVersionFor(flags)`（:192），只會回 v20 或 v21（:163）。
- 旗標全關記 v20。只有 `mobaTacticalDirectorV21`、`heroSkillsV1`、`mobaChallengeV21` 三個都開才記 v21。v22、v23 的旗標對 Challenge 沒有作用。
- 潛在的後備值：`challengeInstance.js:168` 的 `?? MOBA_SIMULATION_VERSION` 與 `squadSnapshot.js:176` 的預設值都等於 v23。真的走到時 `canReplay` 會拒絕，`challengeRunner.js:83-84` 也會因規則集是 null 拒跑。
- `canReplay` 的預設 current 是 v23（`simulationVersion.js:680`）。呼叫端沒傳 current 時會拒絕 v20 挑戰，屬安全方向的失敗。

## C. 指紋閘門：風險中

- 語意檔案清單共 50 支（`simulationVersion.js:102-239`）。算法是 esbuild 去掉註解與空白後做 sha256，只和目前版號登記的指紋比。
- `matchRuleset.js`（:184）與 `mobaNavigation.js`（:140）都在清單裡。所以層值從 "v3" 改成 "v5" 閘門會紅；但規則允許同版號重新登記，不強制開新版號。
- **引擎會用到、但不在清單裡的檔案**（只讀的 import 走查結果）：
  - `LogicEngine.js:42` 直接 import 的 `items/itemsEngineRuntime.js`，以及 itemCatalog、itemEconomy、itemEffects、itemEffectKeys、combatStatsV1、itemRecipes、itemInventory。這些也沒列在 KNOWN_TRANSITIVE_GAPS。
  - `contracts/tacticalDirective.js`（`tacticalDirector.js:36`；註解寫明刻意不收）。
  - `squadSnapshot.js`。
  - 地圖相關十餘支（mapRiverStyle、mapLaneStyle、mapCampLayout、riftLayoutGeometry、mapBaseBlueprint 等）。
  - `heroDatabase.js`（已知缺口）。
  - `mobaRosterAdapter` 引入的 playerDerivedStats、playerCondition、playerModel、talentDefinitions、trainingCalculator、potentialSpace。
  - `tacticVariant` 引入的 `doctrine.js`。
- `check_match_setup_3a` 的 V4 只檢查組裝入口模組往下一層的 import，不走 LogicEngine 的 import。
- KNOWN_TRANSITIVE_GAPS（:255-275）已經過時：它列的 mapPassability 等檔案現在都已在清單裡。

## D. 依賴式過期判定：風險中

**真實性表的規則**（`tacticMeasureProvenance.mjs:149-161`），任一成立就算過期：
1. simVersion、registryHash、resolvedHash、mappingHash、templatesVersion、harnessHash、harnessVersion 有任何一個不同。
2. `meta.loadedFiles` 記錄的檔案不見了，或去掉註解壓空白後的雜湊變了。
3. 探針場次（balanceTool.v20＋v21）載入了沒記錄的檔案。

- capabilityRegistry、tacticChoiceMapping、tacticResolver 三支不比文字，改用行為雜湊。
- 目前結果表的 simVersion 是 "moba-sim.v21"，載入檔 70 支，包含 LogicEngine.js、matchRuleset.js、**simulationVersion.js**、mobaNavigation.js。所以只是重新登記指紋、或只改 safeRoute，表就會過期。

**`verify.mjs` 完全沒有依賴追蹤**：狀態只記 status、exitCode、tail，不記 commit 或檔案雜湊（:289-301）。`--resume` 只看上次是不是 PASS（:277-280），程式改了之後也可能沿用過時的 PASS。

**每次語意改動都要整套重跑的閘門**（不管改的是哪個層）：
- 真實性表（量的是 balanceTool.v20／v21）：1.5～2 小時。
- `check_match_setup_3a`（golden 39 案）：約 5 分鐘。
- `check_match_golden_v21a`（109 案）：約 7 分鐘。
- `c3_phase_skeleton`、`laneframe_c3`：各約 6 分鐘。

**已經存在、可以支持「這次改動影響不到規則集 X」的證據**：
- 結構面：引擎的新行為只由 `configureMatch` 收到的 safeRoute 開關；組裝器只有層存在時才傳這個鍵（`matchAssembler.js:153、410`）；導航修正只在呼叫端標了 navMirrorV2 時生效。
- `check_safe_route_v23.mjs:72-79`：v20、v21、v22 的開關是關的，新方法被呼叫 0 次。
- `check_tower_edge_v23` E3：v20、v22，以及 v23 的 "v1"、"v2"，各 2 個 seed、10 分鐘的逐 tick 雜湊。**沒有 v21。**
- `check_nav_safety_v23` E2／E3／E4："v2"、"v3"、"v4" 的整場雜湊，以及「關掉新開關＝舊版雜湊」。
- `check_match_setup_3a` 的 v20 golden 39 案；v21 有 `check_match_golden_v21a` 109 案。

## E. 存檔：風險低

- `esmo.season.v1` 存 BattleResult[]，沒有 rulesetId 或 simVersion。
- `esmo.profile.v1` 的 `matchmaking.session.activeMatch.config` 存了 ruleset 與 matchSetupHash，但只在比賽進行中存在。
- 讀回的地方：`useLocalServer.js:203-209` 恢復比賽；`AppShell.jsx:174-175` 顯示戰術。`matchSetupHash` 沒有任何讀者。
- 已結束的比賽不帶 rulesetId 或 simVersion，也不會被重算。
