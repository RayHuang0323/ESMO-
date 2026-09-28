# Online Foundation v1

> 日期：2026-09-22　前置：`Competitive_Enablement_v1.md`（`44f2a8f`）
> 性質：**後端權威邊界的契約 ＋ 純函式實作 ＋ SQL migration（未部署）**。
> 驗證器：`tools/check_online_foundation_v1.mjs`（**100/100**，另有 4 個 sentinel 實測會紅）
> ⚠ 沒有 Supabase 憑證 ⇒ **REMOTE_E2E_NOT_RUN**。SQL 只驗形狀，未在真資料庫執行。

本輪**只**處理四件事；配對、即時 PvP、排行榜 UI、Live Tournament、CBR 數值、Competitive enable 都**不做**。
`COMPETITIVE_ENABLED` 仍為 `false`。

---

## 0. 一頁摘要

| # | 項目 | 產物 | 狀態 |
|---|---|---|---|
| 1 | 權威 ServerTime | `online/serverTimeAuthority.js`（`ServerTimeSample.v1`）＋ SQL `server_time()` / `server_day()` | ✅ 客戶端同步已實作；權威在伺服器寫入時 |
| 2 | Ranked record / quota 後端持久化邊界 | `online/rankedAuthorityGateway.js`（`RankedAuthorityGateway.v1`）＋ SQL 四張表 ＋ RLS | ✅ 邊界＋本機 mock authority；後端寫入者（Edge Function）未建 |
| 3 | 伺服器簽章快照 | `online/signedSnapshot.js`（`SignedSquadSnapshot.v1`，Ed25519） | ✅ 驗章端完整；簽章端只在伺服器（未建） |
| 4 | CS 快照 parity | `online/csSquadSnapshot.js` ＋ `rosterBridge` 支援 CS | ✅ 已實作 |

---

## 1. 權威 ServerTime

**權威不在客戶端。** 真正的權威檢查是「伺服器在寫入當下用資料庫 `now()` 重驗」。
客戶端同步出來的時鐘只用於顯示與預判（`SERVER_TIME_POLICY.clientClockIsAdvisory = true`），
所以就算有人改了前端程式，也只騙得過自己的畫面，騙不過寫入。

客戶端同步（NTP 中點）：
- 用**單調時鐘**（瀏覽器 `performance.now()`），**不用 `Date.now()`** ⇒ 改手機日期無效。
- RTT > 5s ⇒ 量測拒收；同步超過 6 小時 ⇒ `now()` 回 `null`（要重新同步，不無限外推）；單調時鐘倒退 ⇒ `null`。
- `createServerDayGuard()`：重新同步到較早時刻時，伺服器日**不得倒退**（否則能倒回昨天那一格配額）。
- 輸出的 `provider` 直接接 `time/serverClock.js` 的 `createServerClock()`。

🔧 **順帶修掉的 bug（上一輪 `serverClock.js`）**：provider 回 `null` 時，`Number(null) === 0`
會被算成 1970-01-01 的伺服器日，而不是「不可用」。新 gate T9 抓到，已修正並釘住。

SQL：`public.server_time()` = `now()`（開放 anon/authenticated 呼叫，唯讀）；
`public.server_day()` = UTC 日期距 epoch 天數，與 `serverDayOf()` 同一個定義。

---

## 2. Ranked record / quota 的後端持久化邊界

```
客戶端                                │  ranked authority（後端）
getServerTimeSample()   讀            │  資料庫 now()
getQuota(mode)          讀            │  ranked_quota     （RLS：只讀自己）
getRecord(mode)         讀            │  ranked_records   （RLS：只讀自己）
requestRatedEntry(...)  請求          │  用自己的伺服器日判斷 → 原子扣配額 → 簽發 ranked_tickets
                                      │  settleRatedMatch(...)  只有伺服器有；以票券為冪等鍵
```

- 客戶端閘道**只有這四個方法**，`validateRankedGateway` 對 `setRecord / submitResult / resetQuota / consumeQuota / settleRatedMatch …` 等 12 個名字一律拒（`write_surface`），契約外的方法也拒。
- **勝負由伺服器產生**，客戶端沒有回報勝負的 API。
- SQL（`supabase/migrations/0002_ranked_authority.sql`）：`ranked_records`、`ranked_quota`、`ranked_tickets`、`signed_snapshots` 全部啟用 RLS，**只有 `for select … auth.uid() = user_id`**，**沒有任何** insert/update/delete policy，也沒有開放給客戶端的寫入函式 ⇒ 寫入者只有 service_role（伺服器）。
- 本機 `createLocalRankedAuthority()`：用**同一批伺服器側純函式**（`ratedQuota` / `competitiveRecord`）在記憶體模擬後端，`trusted:false`、不落盤。換成真後端只換這一層。
- 這些帳本**不進生涯存檔**：`saveBundle` 的三份清單都沒有它們（gate P26）。

⚠ 本輪沒寫 Supabase 的呼叫轉接層（`client.rpc('server_time')` 等）：沒有憑證就無法驗證，
寫了也只能用 mock 冒充 —— 那違反 B1D 的規則。它是下一步的第一件事（§5）。

---

## 3. 伺服器簽章快照（`SignedSquadSnapshot.v1`）

- 為什麼需要：`SquadSnapshot.hash` 是 FNV-1a（變更偵測），任何人改完值都能重算 ⇒ 擋不住偽造。
- **只允許 Ed25519**。`alg:"none"` / 未知金鑰 / 金鑰演算法不符 / 沒有簽章 / 沒有 verifier ⇒ 一律拒。
- 簽的是**整份正規化信封**（`stableStringify`，排除 `signature.value`）。
  ⚠ **不是**簽 8 位 FNV 雜湊：32-bit FNV 可以輕易造碰撞，簽一個可碰撞的摘要等於沒簽。
- `issuedAtServerMs` 是伺服器時刻，不是客戶端時間、不是生涯日。
- 內層 `SquadSnapshot` 的雜湊也要對（信封完整但內層被改 ⇒ 拒）。
- 驗章器 `webCryptoEd25519Verifier(crypto.subtle)`，瀏覽器與 Node 20+ 共用。
- **`src/` 沒有私鑰、沒有簽章函式**（gate S13）。verifier 用 `node:crypto` 扮演伺服器，端到端實測：
  簽→驗通過；改能力值、改簽發時刻、換金鑰、alg none、拿掉簽章 —— 全部拒。
- 本機 authority 的快照**未簽**（`LOCAL_UNSIGNED`），而且這一層**沒有**「沒後端所以放行」的開關。

---

## 4. CS 快照 parity

**parity = 同一個 schema、同一套信封欄位、同一種雜湊、同一套正規化政策、同一種簽章**；
`combat` 的內容由**各自引擎實際讀什麼**決定。

| CS 引擎讀的（`EsportsFPS3D.jsx`，唯讀查證） | 快照處理 |
|---|---|
| `stats[短鍵]`（derived，含天賦） | ✅ 進 `combat.stats`（直接取自 `toFpsRoster`） |
| `personality`（`persStat` +6／−4） | ✅ 進 `combat.personality` |
| `role` | ✅ 進 `combat.roles` |
| `morale × condition`（`formMul`） | ⚠ **不進快照**；重建時填中性值 70／「正常」（×1.0） |
| `sta`（移速 `4.8 + (sta−82)×0.025`） | ⚠ **不進快照**；重建時填 **82**（修正 0） |
| 戰術 f1–f8、地圖 | ✅ 進 `standingOrders`（選擇，不是數值） |

- **取值只走正式開局那一支**：`toFpsRoster(players, csLineup)`（`CsMatchScreen` 用的就是它）。
  gate C6–C9 實測：由快照重建的引擎名單，與正式開局在能力／定位／個性／id 逐值一致。
- ⚠ **MOBA 與 CS 的關鍵差別**：MOBA 引擎完全不讀 morale／condition／energy，CS 會讀。
  而現行 `ONLINE_NORMALIZATION.energy = 100` 若直接當 CS 的 `sta`，全員移速 +0.45 ——
  雙方一樣仍然公平，但線上 CS 與 PvE CS 手感會不同。所以 CS 另宣告 `csEngine: { sta: 82 }`。
- 沙包無效：把狀態壓到最低，CS 快照雜湊不變（C15）。
- `rosterBridge.buildCompetitiveEntry(mode:"cs")` 已支援；CS 的 `powerHash` 同樣不含生涯日（C23）。
- 🟡 **已知缺口**：CS **沒有模擬版本登記**（MOBA 有 `moba-sim.v7` 與語意指紋）。
  快照照實標記 `cs-sim.unregistered`：**輸入**已完整涵蓋，但 CS 引擎改版後舊快照能不能重播，
  目前沒有機制判斷。登記為 TD，不假造版本號。

---

## 5. 下一步（Online 下一階段的前置）

1. **Supabase 轉接層**：`server_time()` RPC → `createServerTimeSample`；表的唯讀查詢 → `RankedAuthorityGateway`。
   需要 Owner 提供憑證才能跑遠端 E2E（`docs/handoff/SUPABASE_SETUP_OWNER.md`）。
2. **伺服器端寫入者**（Edge Function，持 service_role 與簽章私鑰）：
   `requestRatedEntry` 的原子扣配額、`settleRatedMatch`、快照簽章。私鑰只放伺服器環境變數。
3. **CS 模擬版本登記**（`cs-sim.v1` ＋ 語意指紋），之後 CS 快照才可重播。
4. 跨玩家讀取簽章快照的 policy（挑戰對手需要），屬配對／挑戰讀取面，另立。
5. 以上完成前，`COMPETITIVE_ENABLED` 維持 `false`。
