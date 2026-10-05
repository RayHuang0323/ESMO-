# Online Foundation v2A（Generic／MOBA contract only）

> 日期：2026-10-05　基準：`origin/main` = `1cf6472`（moba-sim.v17 RELEASED）　分支：`feature/online-foundation-v2a`
> 前置：`Online_Foundation_v1.md`、`Online_Backend_Foundation_Resync_Audit.md` §14
> 性質：**資料契約＋純函式＋本地 skeleton**。沒有正式 server、沒有 migration、沒有 deploy。
> 驗證器：`tools/check_online_foundation_v2a.mjs`（**92/92**；5 個突變測試都會紅，見 §8）
> ⚠ 沒有 Supabase 憑證 ⇒ **REMOTE_E2E_NOT_RUN**。伺服器一律由 verifier 裡的 `node:crypto` 扮演。
> ⚠ `COMPETITIVE_ENABLED` 仍為 `false`。v2A 契約**沒有任何畫面或 Store import**。

本輪**不做**：CS Online Snapshot、CS 模擬版本（TD-58）、真 matchmaking、Ranked UI、Rating／MMR、
Edge Function 部署、DB migration、WebSocket。

---

## 0. 一頁摘要

| # | 項目 | 產物 | 狀態 |
|---|---|---|---|
| 1 | Ranked／Online Match Ticket | `online/matchTicket.js`（`OnlineMatchTicket.v1`／`OnlineMatchTicketRequest.v1`） | ✅ 契約＋客戶端驗票；簽發只在伺服器（skeleton） |
| 2 | Battle Talent | `online/battleTalentBinding.js`（`BattleTalentBinding.v1`） | ✅ MOBA 完整；CS 一律拒（不猜） |
| 3 | Signed Snapshot／Authority 邊界 | `signedSnapshot.verifyEnvelopeSignature`（唯一驗章路徑） | ✅ 快照、票券、結果共用；src／bundle 無私鑰 |
| 4 | Match／Result authority | `online/matchAdjudication.js`（`MatchAdjudicationInputs.v1`／`AdjudicatedMatchResult.v1`）＋ `matchResult.js` 收緊 | ✅ 最小介面；客戶端組不出 server 結果 |
| 5 | Supabase 下一階段 | `supabase/drafts/0003_…draft.sql`、`supabase/functions/ranked-authority/index.ts` | 📝 設計＋skeleton，**未執行、未部署** |
| 6 | Gate | `tools/check_online_foundation_v2a.mjs` | ✅ 92/92 |

---

## 1. Ranked／Online Match Ticket（`OnlineMatchTicket.v1`）

v1 的 `requestRatedEntry` 回的是 `rk:moba:<day>:<seq>`：流水號，客戶端照抄得出來，也沒綁本場天賦。

```
客戶端                                         │  伺服器（Edge Function，持私鑰）
createTicketRequest({ entry, battleTalents })  │
  → OnlineMatchTicketRequest.v1                │
    { schema, mode, entry:{snapshotHash,       │  validateTicketRequest（拒伺服器欄位與數值）
      powerHash}, battleTalents }   ─────────▶ │  以 auth.uid() 重新權威取值，比對 powerHash
                                               │  以本場名單重算天賦
                                               │  server_day() → 原子扣配額
                                               │  nonce（16 bytes 隨機）、ticketId、簽章
verifyMatchTicket(ticket, {trustedKeys,  ◀──── │  OnlineMatchTicket.v1
  verify, serverNowMs, subject})               │
```

票券欄位：`ticketId`（`tk_…`）、`nonce`（≥128 bit base64url）、`subject`（= auth uid，伺服器填）、
`mode`、`matchSource:"ranked"`、`serverDay`、`issuedAtServerMs`／`expiresAtServerMs`（最長 15 分）、
`simulationVersion`（必須已登記）、`entry:{snapshotHash, powerHash}`、`battleTalents`（全文）、
`issuedBy`、`signature:{alg:"Ed25519", keyId, value}`。

**客戶端不能偽造權威票券**：
- 請求單出現 `ticketId／nonce／serverDay／issuedAt／expiresAt／issuedBy／signature／subject／userId／seed／
  trusted／outcome／winner／score／resultSource／rating／ladderRating／careerDay／days／stats／power／effectivePower`
  任何一個 ⇒ 拒（深層掃描）；契約外欄位也拒。
- `src/` 沒有私鑰、沒有簽章函式。客戶端可以呼叫 `createUnsignedTicket` 組出形狀，但簽不出有效的 `signature.value`
  （gate T12：自建未簽、亂填簽章都驗不過）。
- 驗票需要**同步後的伺服器時刻**；沒有就 `server_time_unavailable`，**不退回 `Date.now()`**（T14、T18）。
- nonce 防重放的**權威在 DB**（draft 的 unique index）；客戶端 `seenNonces` 只是提早發現。
- CS ⇒ `cs_ticket_deferred`（TD-58）。

---

## 2. Battle Talent 怎麼進 Online contract（`BattleTalentBinding.v1`）

**為什麼不放進 `SquadSnapshot.v1`**：天賦綁的是**本場選到的英雄**，選角之前不存在 ⇒ 它是「這一場」的輸入，
不是「這支隊伍」的輸入。而且改 `SquadSnapshot.v1` 會讓已上線 Player Challenge 的防守快照雜湊全部變動。
所以天賦住在**票券**與**裁決輸入**，快照不動（gate X4、X6）。

```
本場名單（選角後）＋ 玩家選擇 { b1: "ironclad:breach-horn", … }
        │  createBattleTalentBinding
        │    ① 只准己方席位；值必須是 ID 字串（送物件／數值 ⇒ value_not_id）
        │    ② 天賦必須屬於該席位本場英雄（否則 talent_hero_mismatch，不替玩家改）
        │    ③ 解析只走引擎那一支 selectBattleTalents(roster, requested)
        ▼
BattleTalentBinding.v1 { mode:"moba", contract:"HeroBattleTalent.v1", simulationVersion, side,
                         seats:{ b1..r5: { heroId, talentId, source:"player"|"ai" } }, bindingHash }
        │
        ├─▶ OnlineMatchTicketRequest.battleTalents ─▶ OnlineMatchTicket.battleTalents（簽章涵蓋）
        └─▶ MatchAdjudicationInputs.attacker.{battleTalents, battleTalentsHash}
                 ─▶ AdjudicatedMatchResult.battleTalentsHash（客戶端比對必須等於票券的）
```

- 十個席位全記：玩家選的標 `player`，其餘由引擎同一支 AI 決定性補位標 `ai`（K2、K3）。
  防守方離線 ⇒ `defenderTalentPolicy:"engine-ai"`（與 Player Challenge 現況相同）。
- `bindingHash` 只涵蓋影響模擬的欄位：席位、英雄、天賦 ID、天賦契約版本、模擬版本。
- 伺服器裁決前用 `revalidateTicketTalents(ticket, roster)` 以本場名單重算，名單換了英雄 ⇒ 不一致（K15）。
- 100 隻英雄 × 200 個選項全部可綁、可驗、可重算，200 個雜湊互不相同（K18、K19）。
- **CS**：`cs_talent_unsupported`。CS 沒有戰鬥天賦契約，也沒有登記的模擬版本，不為它猜或補資料（K17）。

---

## 3. Signed Snapshot／Authority 邊界（延續 v1）

- v1 的 `verifySignedSnapshot` 拆成「形狀檢查」＋ **`verifyEnvelopeSignature`**（唯一驗章路徑）。
  票券與裁決結果**都 import 這一支**：同一份 `trustedKeys`、同一種 `signingBytes`（`stableStringify`、排除 `signature.value`）、
  只准 Ed25519。`src/platform/online` 只有一個 `importKey(`（S2、S4）。沒有第二套 authority。
- v1 行為不變：`check_online_foundation_v1` 仍綠、S3 端到端（簽→驗、竄改→拒）。
- 私鑰：`src/`、`supabase/` 掃 PEM／JWK `d`／JWT 皆無（S6）；**build 後的 `dist/` bundle** 也掃過：
  無私鑰材料、無 `ESMO_SIGNING_KEY_JWK`、無 `subtle.sign(`、無 skeleton 內容（S7、S8）。
- `SNAPSHOT_AUTHORITY.trusted` 仍 `false`、`LOCAL_UNSIGNED` 不變（S5）；mock authority 仍只在 `tools/lib`（R22）。

---

## 4. Match／Result authority

### 4.1 現況盤點（不改行為）

| 契約 | 現在誰決定 | 對 Ranked 的意義 |
|---|---|---|
| `MatchSession.v1`（`contracts/matchSession.js`） | client；`launchToken = lt_ + hash8(sessionId:seed:assignmentId)` | 決定性、算得出來 ⇒ **不是秘密**，不能當權威憑證。Ranked 改用簽章票券 |
| `MatchResult.v1`（`contracts/matchResult.js`） | client 引擎；`resultSource:"engine"`；內容雜湊防重送／衝突 | 生涯（Career／Challenge／一般對戰）唯一結果契約，照舊 |
| `MobaReplay.v1`（`contracts/mobaReplay.js`、`replay/replayBuffer.js`） | client 擷取，module 記憶體 | **呈現**，不是裁決依據；簽章結果不涵蓋 replay（R16） |
| `SquadSnapshot.v1`／`snapshotAuthority` | client 權威層（`trusted:false`） | 伺服器之後用同一支取值、再簽成 `SignedSquadSnapshot.v1` |

### 4.2 v2A 唯一的行為收緊：`resultSource:"server"`

之前 `RESULT_SOURCES.server` 只是一個字串：任何人把 `resultSource` 改成 `"server"` 就會被 `createMatchResult`／
`validateMatchResult` 當成可信。v2A 起兩者都回 `server_requires_adjudication`。
全 repo 沒有任何呼叫端用過 `server`（`reportMatchResult` 預設 `engine`、`settleMatchBoundary` 不帶 source），
⇒ **Career／Challenge／一般對戰行為不變**（R2、R4；O7／O6／slice1–8／V7A／V0D 全綠）。

### 4.3 伺服器裁決最小介面

```
SERVER_AUTHORITY_INTERFACE（ServerMatchAuthority.v1）
  serverOnly: issueMatchTicket, signSquadSnapshot, adjudicateMatch, settleRatedMatch
  seedPolicy: "server-at-adjudication"   ← 客戶端永遠不提供 seed
  idempotencyKey: "ticketId"
  defenderTalentPolicy: "engine-ai"

MatchAdjudicationInputs.v1  { ticketId, mode, simulationVersion, seed,
                              attacker:{snapshotHash, powerHash, battleTalentsHash, battleTalents},
                              defender:{snapshotHash, powerHash, battleTalentPolicy}, inputsHash }
AdjudicatedMatchResult.v1   { ticketId, mode, simulationVersion, inputsHash, battleTalentsHash,
                              outcome:{winner:attacker|defender|draw, score, durationSec},
                              battleResultVersion, resultSource:"server", adjudicatedAtServerMs,
                              issuedBy, signature }
```

- `serverOnly` 四個方法全部在客戶端閘道禁用清單（`FORBIDDEN_CLIENT_METHODS` 追加 3 個；`settleRatedMatch` v1 已在）。
  閘道仍只有 v1 的 4 個方法（R18–R20）。
- `verifyAdjudicatedResult` 必須同時成立：形狀、簽章、`ticketId`／模式／模擬版本／天賦雜湊都等於**我的票**（R8–R15）。
- 結果出現任何 `CAREER_WRITE_KEYS`／`SEASON_LEDGER_KEYS` ⇒ `career_leak`，**即使簽了也拒**（R14）。
- `competitiveOutcomeOf` 把 attacker／defender／draw 對到 ranked 帳本的 win／loss／draw（R17）。

---

## 5. Supabase Backend 下一階段（設計＋本地 skeleton）

| 檔案 | 內容 | 狀態 |
|---|---|---|
| `supabase/drafts/0003_online_match_authority.draft.sql` | `signing_keys`（只存公鑰，可輪替）；`ranked_tickets` 加 nonce（unique）、expires_at、simulation_version、snapshot_hash、`battle_talents_json`＋`battle_talents_hash`、key_id、ticket_envelope_json；`match_adjudications`（ticket_id 主鍵＝冪等、seed 只存伺服器、result_envelope_json） | **刻意不在 `migrations/`**（`db push` 讀不到）；從未執行 |
| `supabase/functions/ranked-authority/index.ts` | `/ticket`、`/adjudicate` 兩條路由，**全部回 501**；註解列出伺服器依序要做的事與環境變數**名稱** | **未部署**；不讀 env、不連 DB |

邊界原則與 0002 相同、一條不放寬：RLS force、先收回 anon／authenticated 權限再只給 select、
**沒有任何 insert／update／delete policy**；寫入者只有 Edge Function（service_role）；私鑰不在 DB。
`deploy.yml` 沒有 `functions deploy`／`db push`（B9）；`src/` 不 import `supabase/functions`／`drafts`（B10）。

---

## 6. Career／ServerTime 與 Challenge／Replay 邊界

- 票券只有 `serverDay`（伺服器時刻推得），沒有 `careerDay`；票券與結果都沒有生涯／賽季欄位（T9、X1、R14）。
- `SquadSnapshot.v1`、`snapshotAuthority`、`mobaReplay`、`replayBuffer`、`matchSession`、`heroBattleTalents`、
  `LogicEngine`、`useLocalServer`、`profileStore`、`simulationVersion` **全部未動**（X6 以 git diff 檢查）。
  ⇒ Challenge 防守快照雜湊、Replay 形狀、`moba-sim.v17` 指紋都不變。

---

## 7. 與 Codex CS 工作的交集（本輪停手的檔案）

Codex 在 `feature/cs-fps-major-upgrade`（`worktrees/cs-fps-major-upgrade`）同時改：`src/battle/fps/**`、
`src/screens/fps/CsMatchScreen.jsx`、`AGENTS.md`、`tools/verify.mjs`、**`docs/handoff/00／05／06／08`**。
- CS／FPS 程式：本輪本來就不碰（X5）。
- **`docs/handoff/05_Sprint紀錄.md` 與 `08_目前待辦與風險.md`**：專案收尾協議要求追加，但 Codex 正在改同一份檔
  ⇒ **依指示停手**，紀錄改寫在本文件 §9；兩邊都合進 main 後再補一節（X7 守住本分支沒動這些檔）。
- 我也沒有借用 Codex worktree 的 `node_modules`（在本 worktree 自己 `npm ci`）。

---

## 8. 驗證

- `tools/check_online_foundation_v2a.mjs`：A 4／K 21／T 19／R 22／S 8／B 11／X 7 ⇒ **92/92**（無 dist 時 S7、S8 標 SKIP 不計入）。
- 突變測試（改壞 → 跑 → 還原），每一個都會紅：
  ① `createMatchResult` 不擋 server → R1；② 驗票跳過簽章 → T10／T11／T12；③ 天賦不檢查英雄 → K7；
  ④ 結果不比對天賦 → R12；⑤ `COMPETITIVE_ENABLED = true` → A1／A2。
- 寫 gate 時抓到自己的假綠：A2 原本的時鐘 fixture 根本不可用，「進不去」其實是因為沒有伺服器時間。已改成先證明時鐘可用、且唯一理由是 `competitive_disabled`。

## 9. Sprint 紀錄（暫存於此；見 §7）

**完成**：§1–§5 契約與 skeleton、`matchResult` server 來源收緊、v1 驗章抽出共用、gate 92/92、build、對照 gate（見提交訊息與回報）。
**未完成／刻意不做**：Edge Function 實作與部署、migration、Supabase 轉接層、CS 票券／天賦／快照（TD-58）、Ranked UI、Rating。
**已知風險**：
1. seed 目前是「伺服器在裁決時產生」——伺服器可以挑 seed。要防伺服器端作弊需 commit-reveal（票券帶 `seedCommitment` = SHA-256），v2A 未做，列為 Backend Authority 的設計題。
2. 天賦 AI 補位依賴敵方英雄（`selectBattleTalents` 看雙方陣容），所以票券必須在**選角之後**簽發；若 Ranked 流程要在選角前發票，需要兩段式（entry ticket → draft lock）。
3. 0003 draft 從未在真 Postgres 執行；`alter table … add column` 對已上線的 0002 是否需要 backfill，要在 Owner 開通後實測。
