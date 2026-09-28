# Online Backend Foundation — Resync Audit（2026-09-28）

> 基準：`origin/main` = `e6253d0`（MOBA v14 RELEASED＋G4 Hotfix；**moba-sim.v14**，BattleResult.v3）。
> 初稿基準為 `5c9b414`／moba-sim.v13；§1–§13 保留初稿判斷，v14 重新核對結果見 **§14**（以 §14 為準）。
> 舊線：`integrate/online-foundation` = `47bcce6`（基於 `cfa755b`，落後 main 28 個 commit，領先 3 個）、
> `feature/online-foundation` = `df4ddde`（同內容的舊版，落後 32）、`feature/online-competitive-power-contract-v1` 已完全併入 main。
> 本文件只做盤點與設計建議，**不含任何 production 實作**。Codex 進行中的 Skill Icon／Skill Level／Talent／Battle HUD／BattleResult.v3 區域未觸碰。

---

## 1. Match／Session／Result／Replay 的權威（authority）

**今天沒有任何東西是 server-authoritative。** 所有「權威」都是瀏覽器裡的純函式，狀態在 zustand＋localStorage。

| 項目 | 現在誰決定 | 證據 |
|---|---|---|
| Seed（排隊） | `mockGateway.seedFor` = `hash32(ticketId:seed) % 100000` | `src/platform/matchmaking/mockGateway.js:61-63` |
| Seed（練習） | 由 `entryRequest.transactionId` 推導 | `practiceGateway.js` |
| Seed（Challenge） | store 內 `Math.random()` 產生後凍結成 `matchSeed` | `profileStore.js:4288, 4357`；`challengeInstance.js:259` |
| 模擬（MOBA） | client：`useLocalServer.start()` → `new LogicEngine(seed)`；有 session seed 用它，否則 `Date.now()` | `src/useLocalServer.js:152-171` |
| 模擬（CS） | client：`EsportsFPS3D` 的 `simulateFps`（現在可在 Web Worker 算） | `src/battle/fps/EsportsFPS3D.jsx` |
| 結果結算 | `useBattleFeed` → `profileStore.reportMatchResult` → `applyMatchProgress`（唯一寫入點） | `useBattleFeed.js:91-104`；`profileStore.js:3566, 3854` |
| 結果來源 | `RESULT_SOURCES = { engine（現在）, server（未來）}`；sessionId／seed 不符拒收、同 session 不同內容拒收 | `contracts/matchResult.js:26-29, 110-153` |
| 冪等 | `processedMatchTransactions`（transactionId → receipt），重送回 `alreadyApplied` | `profileStore.js:454`；`matchProgressTransaction.js:32` |
| Replay | client 擷取、存在 module 記憶體，`MobaReplay.v1`（2.5 s／幀、上限 1200） | `replay/replayBuffer.js:30,105`；`contracts/mobaReplay.js:29` |

## 2. MatchEntryRequest／MatchSquad／MatchSession 等契約

| 檔案 | Schema | 本機假設 | 未來必須由 server 發的 |
|---|---|---|---|
| `matchEntry.js` | MatchEntryRequest.v1 | 時間用 CareerTime day；`FORBIDDEN_VALUE_KEYS` 已拒收 client 自報數值 | 受理／驗證（程式已寫成「server 會做的事」） |
| `matchSquad.js` | MatchSquad.v1 | 信任本機 roster（main 已改成低體力只警告不擋） | roster／資格查詢 |
| `matchmaking.js` | MatchmakingTicket.v1／MatchAssignment.v1 | `server: "mock-gateway"` | ticketId、assignmentId、對手、seed |
| `matchOrigin.js` | MatchOrigin.v1（ticket／fixture／practice／challenge） | — | ticket／challenge 的 originId |
| `matchRoom.js` | MatchRoom.v1 | 對手 ready 由 mock 延遲模擬 | roomId、deadline、對手確認 |
| `matchSession.js` | MatchSession.v1＋ActiveMatch.v1 | **launchToken 是決定性 hash，client 可自行算出，不是秘密** | sessionId、launchToken（改成隨機＋簽章）、seed、expiry |
| `matchResult.js` | MatchResult.v1 | `source: engine` | 裁決（`source: server`） |
| `squadSnapshot.js` | SquadSnapshot.v1（ONLINE_NORMALIZATION：energy 100／morale 70） | 快照在 profileStore 本機建立 | 快照建立／hash、`issuedBy` |
| `challengeInstance.js` | ChallengeInstance.v1 | seed 由 store 的 `Math.random` 產生 | challengeId、matchSeed、結算 |

⚠ `docs/design/Online_Competitive_Power_Contract_v1.md` §1.2 說 `squadSnapshot.js`「不存在」——**已過時**，它現在存在。

## 3. matchmaking／mockGateway 現況

- `mockGateway.js` 檔頭明寫「不是 backend」。`pollGateway` 每次重驗資格、等 3–9 s（hash）、由 ticketId 決定對手與 seed；對手 2–8 s 後自動 ready；`openSession` 走共用的 `createRoom`／`createSession`。
- `practiceGateway.js`：同一條管線、沒有 ticket。
- profileStore 呼叫點：`enqueueMatch`（:2900）、`pollMatchmaking`（:2945）、`startPracticeMatch`（:3033）、`openMatchRoom`／`pollMatchRoom`／`confirmMatchReady`（:3083-3134）、`createMatchSession`（:3159-3174）、`launchMatchSession`→`consumeLaunchToken`（:3281）、`reportMatchResult`（:3566）。**全部用 client `Date.now()`。**
- 線上 gateway 要取代的：非同步網路版的 poll／room／session、server 產生 seed／sessionId／launchToken、server 持有的 roster／資格快照、真對手的 ready、ServerTime、結果裁決＋server 端收據帳本。

## 4. CareerTime vs 未來 ServerTime

- main 唯一的時鐘是 **CareerTime**（`meta.days`，`worldClock.js`，由 `profileStore.advanceDay` 推進）。
- **main 沒有 ServerTime**：`retentionObjectives.js:10` 明寫「沒有 ServerTime，也不會有」；`serverClock.js` 不存在。
- 每日容量 `COMPETITIVE_BLOCK.matchesPerDay = 3`（`worldClock.js:116`）存在 `meta.competitiveBlock`，是 **CareerTime 的「一般對戰」容量**，不是線上配額。
- 舊線的 `time/serverClock.js`（ServerTime.v1：UTC 00:00 換日、無 provider 時回 unavailable、**不 fallback 到 `Date.now()`**）與 `online/serverTimeAuthority.js`（NTP 式中點同步、round trip > 5 s 拒收、6 h 過期、日期只能前進）**沒有拿 CareerTime 冒充 ServerTime**，可沿用。
- 紅線：Ranked 的日配額、賽季、冷卻一律綁 ServerTime；Career 的一切維持 CareerTime；兩者不得互轉。

## 5. roster／condition／teamStrength／competitive effective power 邊界

- `teamStrength.v2`（`competition/teamStrength.js:34`）只用在 AI 賽程模擬與 challengeBoard。
- 疲勞／狀態：`platform/condition/playerCondition.js:102-126`；套用在 `mobaRosterAdapter.js`、`playerModel.js`、teamStrength v2；**CS 另有 `csStatDamp`（`fpsRoster.js:95`）**。
- Power contract（Model C）：原始數值只當輸入，**線上戰力由 server 定價**；`RAW_CAREER_STATS_ALWAYS_FINAL = NO`。
- 目前落實邊界的程式：`matchEntry` 的 `FORBIDDEN_VALUE_KEYS`、`squadSnapshot` 的 `FORBIDDEN_CLIENT_KEYS`＋`ONLINE_NORMALIZATION`、`coachCatalog` 的 `careerOnly`（能力型資產不得進 Ranked）。
- **本機限定**：Career 數值、condition／fatigue／morale、Team Development、Coach 能力修正。
- **設計上由 server 算**：線上有效戰力／定價（體力 100、士氣 70 正規化）、快照 hash、seed、session、結果裁決——**全部尚未實作**。

## 6. save／identity／cloud 現況

- 存檔：唯一出口 `saveGateway.js:105`；預設 `localSaveProvider`；有 Supabase 設定時 `cloudBootstrap` 換成 `cloudBackedSaveProvider`（本機同步寫、雲端背景合併寫）。
- 衝突：`syncFromCloud` 只比對雲端段落，不同就 `diverged` 並依 bundle 的 `savedAt`（**client 時鐘**）取新者，沒有 merge；DB 的 `revision` 欄位**寫了但沒檢查**（無樂觀鎖）。多裝置衝突（B1E）未做。
- 身分：Supabase Auth（Google OAuth；匿名登入僅 DEV，正式站刻意不開）。`userId = auth.users.id`。**team／profile 與 auth uid 沒有關聯**（team 只是 `save_json` 裡的一段），沒有公開 player id／handle。
- DB：只有 `0001_career_saves.sql`（`profiles`、`career_saves`，RLS 強制、全部 own-row、`anon` 權限全收回）。**沒有任何對戰／結果／排名／配對的表，也沒有 `supabase/functions`。**
- 部署：`deploy.yml` 由 repo Variables 注入 `VITE_SUPABASE_URL／ANON_KEY`；`check_supabase_env.mjs` 擋 service-role key 與只設一半。**正式站目前沒有接 Supabase**（憑證從未提供；`SUPABASE_SETUP_OWNER.md` 7 步都還沒做）。

## 7. Challenge／Ranked／Competitive enable boundary

- ⚠ **名稱撞車（最容易誤導接手者）**：main 的 `MATCH_SOURCE.competitive` 就是畫面上的「**一般對戰**」（對 AI 的排隊賽，`progress/matchSource.js:38,128`），**目前是開放的**。
  Owner 說的「Competitive 維持 disabled」指的是**線上 Ranked／Competitive**——那個在 main 上**根本不存在**（沒有入口、沒有 UI、沒有旗標）。
- `featureFlags.js` **沒有** competitive／ranked／challenge 旗標；`itemsV1` 註解說 Competitive／Challenge／Ranked「維持獨立 disabled 邊界」，但該邊界目前只是「沒有程式」。
- 舊線 `competitive/competitiveMode.js:29` 有 `COMPETITIVE_ENABLED = false`＋可用性閘門＋禁止寫入的帳本清單，且另開 `ranked` match source（不借用 `competitive`）——這是正確的隔離方式。
- Challenge（非同步、Unranked）已上線，對手資料唯一入口 `challenge/opponentDirectory.js` → `activeOpponentProvider()`（本機 provider）。

## 8. 舊 Online Foundation 分類（對照 main `5c9b414`）

main 自 `cfa755b` 起**沒有動過** `contracts/matchOrigin.js`、`progress/*`、`time/*`；也沒有 `src/platform/online/`、`src/platform/competitive/`、`supabase/migrations/0002*` ⇒ **main 沒有任何東西取代這條線**。
（逐檔歷史已查；`git merge-tree` 實際試合併尚待補跑——本輪工具故障，見 §11。）

| 模組 | 用途 | 分類 |
|---|---|---|
| `online/signedSnapshot.js` | SignedSquadSnapshot.v1；只收 Ed25519；**client 不簽章**（沒有私鑰、沒有 sign 函式），只驗 | ✅ 可沿用 |
| `online/serverTimeAuthority.js` | server 時間中點同步 | ✅ 可沿用 |
| `time/serverClock.js` | ServerTime.v1；無 provider ⇒ unavailable，不 fallback | ✅ 可沿用 |
| `online/rankedAuthorityGateway.js` | client 端 Ranked 契約（4 個讀／請求方法＋禁止寫入清單）＋記憶體 mock authority | ✅ 契約可沿用；⚠ mock 必須移到 `tools/`／測試，**絕不接到 UI 或正式流程** |
| `online/csSquadSnapshot.js` | 由 `toFpsRoster` 建 CS 快照 | 🔧 **必須重做**：main 的 `toFpsRoster` 已套用 `csStatDamp` 疲勞（`fpsRoster.js:95`）⇒ 線上數值會帶入當下體力，違反 ONLINE_NORMALIZATION、hash 會隨體力變；且仍標 `cs-sim.unregistered` |
| `competitive/cbrPipeline.js` | Cap／Bracket／Rating 管線（預設皆關閉、pricer 注入） | 🔧 pricer 要改包 main 的 teamStrength v2 |
| `competitive/competitiveMode.js` | `COMPETITIVE_ENABLED = false`、閘門、禁寫帳本清單 | ✅ 可沿用 |
| `competitive/competitiveRecord.js` | CompetitiveRecord／Result.v1（MOBA／CS 分開、冪等） | ✅ 可沿用 |
| `competitive/ratedQuota.js` | 以 **server day** 計的每日 rated 配額 | ✅ 可沿用 |
| `competitive/rosterBridge.js` | 由防守快照建 CompetitiveEntry | 🔧 MOBA 端自動帶 v13；CS 端受上面 csSquadSnapshot 問題影響 |
| `contracts/matchOrigin.js`（+`ranked`）、`progress/matchSource.js`（+`ranked`）、`applyMatchProgress.js`（拒收 ranked）、`careerGrowth.js`（ranked 0.0）、`rewardFormulas.js`（ranked 0 收益）、`time/worldClock.js`（ranked 不耗世界時間） | 多層防線：Ranked 不進 Career | ✅ 可沿用（純新增，與 main 同檔案現況不衝突） |
| `supabase/migrations/0002_ranked_authority.sql` | `server_time()`／`server_day()`、4 張表、RLS 只准讀自己 | ✅ 當起點；需補 `revoke`、`server_day()` grant、`updated_at` trigger、`ranked_tickets(user_id)` index；**真正的扣配額／結算 server 函式不存在** |
| `tools/check_online_foundation_v1.mjs`、`check_competitive_enablement_v1.mjs` 與 5 支小改 tools | 驗收 | 🔧 在 main 重跑；寫死 `moba-sim.v8` 或 CS 數值的斷言會紅 |
| `docs/design/Online_Foundation_v1.md`、`Competitive_Enablement_v1.md` | 設計 | 🔧 提到 v8、需更新 |

**必須放棄的**：沒有任何模組達到「不安全、不能 merge」；唯一不能照搬的是「把 mock authority 當成能用的後端」這件事本身。
**不建議直接 merge 舊 branch**：它落後 28 個 commit、tools 斷言綁舊版本、CS 快照與 main 疲勞規則衝突。建議**從最新 main 開新 branch，逐檔 forward-port** ✅／🔧 項目，重跑它的 verifier。

另外兩筆舊線登記、main 上仍未處理的技術債：
- **TD-57（P2）**：`playerXpFor` 只擋 practice、不擋 challenge（main `rewardFormulas.js:132` 仍是如此）；目前休眠（Challenge 結算不呼叫 `applyMatchProgress`）。
- **TD-58（P2，CS Ranked／CS Challenge 開放前必做）**：**CS 沒有登記的模擬版本**（沒有 `cs-sim.v1`、沒有指紋閘門、沒有 `canReplay`）。main 新增的 `csStatDamp` 正是這種「版本追不到的引擎輸入改動」。

## 9. remote E2E／security／auth／database 真正缺什麼

1. **Supabase 專案本身**：Owner 7 步（`SUPABASE_SETUP_OWNER.md`）全未完成 ⇒ `check_supabase_remote_e2e.mjs` 永遠 `SKIPPED`；RLS 雙帳號互讀測試（check G）**從未在真 DB 驗過**。報告一律 `REMOTE_E2E_NOT_RUN`，不得用 mock 冒充。
2. **沒有任何 server code**：沒有 Edge Function、沒有 server 端模擬或結果驗證。
3. **Ranked 的 DB**：對戰／結果／rating／賽季／排行榜表（client 禁止寫、只有 server role 能寫）——舊 0002 只有 4 張表的骨架。
4. **防偽**：server 發的一次性 match ticket／nonce（現在 launchToken 是 client 可算的 hash）。
5. **server 持有的 Ranked roster／經濟**（現在球員數值來自可編輯的存檔）。
6. **身分**：公開 handle／player id 對應 auth uid＋審核；匿名帳號在正式站保持關閉。
7. **存檔強化**：`revision` 樂觀鎖、多裝置衝突（B1E）、`save_json` 大小／形狀的 DB 端檢查。
8. **rate limit／濫用防護、稽核 log、異常偵測**：目前只有 Supabase 預設。
9. service-role secret 只能放 server／Edge Function 環境（目前連這樣的地方都沒有）。
10. **CS 模擬版本（TD-58）**：沒有它，任何 CS 線上結果都無法做版本一致的重播驗證。

## 10. 最大架構風險

1. **Client 權威**：模擬、結果、經濟全在瀏覽器；RLS 只防「讀寫別人的列」，防不了改自己的存檔。**Ranked 之前必須有 server 端裁決或驗證**，否則任何線上排名都可被偽造。
2. **決定性跨環境**：server 若要重算驗證，必須與 client 在同版本（moba-sim.vN、未來 cs-sim.vN）下逐位元一致。MOBA 有指紋閘門；**CS 沒有**。且 MOBA 版本仍在快速前進（v12 → v13，Codex 的 skill／talent branch 也動到 `LogicEngine`／`simulationVersion`）。
3. **名稱撞車**：`MATCH_SOURCE.competitive`＝一般對戰（已開放），與線上 Competitive（未開放）同名，容易被誤接。
4. **時間**：CareerTime 與 ServerTime 若被混用，會出現可用本機時間繞過的配額或賽季。
5. **launchToken 不是秘密**：現行 session 契約不能直接當線上協定用。

## 11. 建議技術方向（Backend／DB／Auth）

- **沿用 Supabase**（已有 Auth、RLS、migration、部署注入與 service-role 防呆）：Postgres＋RLS 當資料層；**Supabase Edge Functions（Deno）**當第一個 server 權威層（發 ticket／nonce、ServerTime、扣配額、接受並驗證結果、寫入 server-only 表）。
- **簽章**：Ed25519，私鑰只在 Edge Function 環境；client 只持公鑰驗證（舊線 `signedSnapshot.js` 的設計正確）。
- **驗證策略（分階段）**：先「server 發 seed＋nonce、client 回報結果＋輸入摘要、server 記帳並做合理性檢查」；之後再視成本決定 server 端是否以同版本引擎重算（MOBA 引擎是純 JS、可在 Deno 跑，但需先確認依賴與效能）。
- **Auth**：Google OAuth 為主；匿名登入維持 DEV-only；新增公開 handle 表對應 `auth.uid()`。
- **不做**：自建長駐伺服器、WebSocket 即時對戰（目前的對戰是模擬回放，不需要即時連線）。

## 12. 下一個最小可實作 Sprint（建議）

**名稱**：Online Backend Foundation v1 — Server Time ＋ Ranked Isolation（仍不開 Ranked）

範圍（全部 flag 關閉、正式站行為不變）：
1. 從最新 main 開 branch，**forward-port** 舊線 ✅ 項目：`time/serverClock.js`、`online/serverTimeAuthority.js`、`online/signedSnapshot.js`（只驗）、`online/rankedAuthorityGateway.js`（契約；mock 移到 `tools/`）、`competitive/competitiveMode.js`／`competitiveRecord.js`／`ratedQuota.js`、`ranked` origin／source 與 Career 多層防線。
2. 補 TD-57（`playerXpFor` 加 challenge early return＋斷言）。
3. 修正 `0002_ranked_authority.sql` 的缺口（revoke、grant、trigger、index），**只寫進 migrations，不在正式 DB 執行**。
4. 更新舊 verifier 到 v13／teamStrength v2，全綠。
5. 文件：命名撞車說明（`competitive`＝一般對戰 vs 線上 Competitive）、ServerTime／CareerTime 紅線。

**不在範圍**：CS 快照與 TD-58（下一個 Sprint：先登記 `cs-sim.v1`＋指紋閘門，再重做 fatigue-free 的 CS 快照）、Edge Functions、正式 DB、任何 UI 入口、remote E2E（需要 Owner 先完成 Supabase 7 步）。

**建議 branch**：`feature/online-backend-foundation-v1`（從最新 `origin/main` 開）。

## 13. 與 Codex 進行中工作的關係

- Codex 的 `feature/moba-skill-icons-talents-v1` 動到 `src/LogicEngine.js`、`src/platform/contracts/simulationVersion.js`（很可能再 bump 模擬版本）；**Online v1 範圍完全不碰這兩個檔案**。
- Codex 合併回 main 後：Online branch **需要 rebase 到新 main**，並重跑 `check_simulation_version_gate`、`check_online_foundation_v1`、`check_competitive_enablement_v1`（這兩支若斷言目前版本號會連動）。只要 Online 不寫死版本號（改成「≥ 已知版本」），衝突應只在文件。

## 14. v14 重新核對（2026-09-28，基準 `876f657`／moba-sim.v14）

Codex 的 Skill／Talent／Skill Level／BattleResult.v3 已隨 `6d93a97` 正式 RELEASED。§13 的「rebase 到新 main」已不需要：`feature/online-backend-foundation-v1` 直接從 `876f657` 開，復原狀態留底於 WIP commit `8e03322`。

| 初稿假設 | v14 核對結果 |
|---|---|
| Online v1 不碰 `LogicEngine.js`／`simulationVersion.js` | ✅ 仍成立：本分支相對 main 沒有任何 battle／skill／talent／replay／LogicEngine 檔案變更 |
| Online 不寫死模擬版本 | ✅ `src/platform/online`、`competitive`、`0002` 沒有寫死 `moba-sim.vN`；快照一律讀 `MOBA_SIMULATION_VERSION`（現為 v14） |
| BattleResult 版本不影響 Ranked 帳本 | ✅ `sourceResultVersion` 在 `src/` 沒有驗證者；只有 `check_competitive_enablement_v1` fixture 仍寫 `BattleResult.v2`（v2 仍在 `LEGACY_BATTLE_RESULT_VERSIONS`，不會失效，但建議改用常數） |
| 防守快照＝MOBA 完整出賽輸入 | ⚠ **v14 新缺口**：快照不含本場**戰鬥天賦選擇**（`HeroBattleTalent.v1`）。技能等級由場內 `mlv` 決定性推得，不需入快照；但玩家在戰術頁選的天賦會改變模擬。今天 AI 側天賦是 `selectBattleTalents()` 決定性選擇，所以 Challenge 不受影響；**Ranked 開放前**，入場票／快照必須帶天賦 ID，否則伺服器重算不等於玩家實際出賽。登記為開放 Ranked 的前置條件，不在 v1 範圍 |
| MOBA 快照滿足 I13（狀態不進線上數值） | ❌ **main 既有缺陷，非 v14、非本分支造成**：`snapshotAuthority` 把含 `energy` 的原始選手送進 `buildPlayerStatSlots`，而 Battle Condition UX（`6eda6a2`）起它會套 `applyFatigueToStats` ⇒ 體力 3 的選手 reflex 60 進快照成 52。白名單正規化發生在縮放之後，擋不住。`check_competitive_enablement_v1` G4 因此紅。同一路徑也影響已上線的 Player Challenge 防守快照 |

**v1 收尾驗證（2026-09-28）**：`check_competitive_enablement_v1` G11 已改守 `CS_ENTRY_DEFERRED`；TD-57 新增 X16（全輸入空間＋CS learning 加成）與 X17（兩個 adapter 的 XP 只經 `playerXpFor(matchSource)`），並以突變測試確認移除修正時 X12／X16 會紅。G4（上表 fatigue leakage）刻意不在本分支修，已由獨立 hotfix `5d06c02` **RELEASED** 到 main（`snapshotAuthority` 取值前套 `ONLINE_NORMALIZATION`；守門 `check_challenge_snapshot_fatigue_g4` 18/18）。本分支 rebase 到 `e6253d0` 後自然帶入，`check_competitive_enablement_v1` 130/130，**已無產品紅燈**。

**對 Online 架構判斷的影響**：ServerTime、Ranked／Career 隔離、signedSnapshot 驗證邊界、mock 與正式 authority 分離、`0002` 的判斷**都沒有因 v14 失效**。需要追加的只有上表兩個 ⚠／❌。
