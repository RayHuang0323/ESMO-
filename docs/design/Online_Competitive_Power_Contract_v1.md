# Online Competitive Power Contract v1

> 建立日期：2026-09-05　基線：`origin/main` = `3c3f836`
> 性質：**Audit ＋ 產品契約 ＋ 架構邊界**。未修改 CBR／Rating／battle runtime。
> 驗證器：`tools/check_online_power_contract_v1.mjs`（**51/51 PASS**，含 §8 免費戰力實測）
> 前置：`docs/design/Season_vNext_生涯與線上競技公平架構.md`（既有 FINAL 架構）

---

## 0. 一頁摘要

| 問題 | 結論 |
|---|---|
| 目前 canonical 線上契約 | **`MatchEntryRequest.v1`**（`contracts/matchEntry.js`），委派 `MatchSquad.v1` 做合法性 |
| `SquadSnapshot` | **不存在於程式**。只是設計文件的名字 ＋ 2 處註解 ＋ 3 條把 `matchSquad.js` 當代理掃描的斷言 |
| CBR / Cap / Bracket / Rating | **全部不存在於 `main`**。在 `v7/fast-calibration` 那條線上 |
| MatchSquad vs SquadSnapshot | **兩個不同概念，兩個都要保留**。不 rename |
| 推薦模型 | **C（保守版）**：raw stats 當**輸入**，server 權威定價，加 effective-power guardrail。**見 §11（本輪內被 Owner Review 推翻並更正）** |
| Career stats 直接用於 Online | **PARTIAL**：raw stats 是輸入，但**不是**最終 online power |
| `RAW_CAREER_STATS_ALWAYS_FINAL` | **NO** —— 在 `teamStrength` 定價被證明夠準之前，不得寫成不可逆的 FINAL |
| 本輪要不要動 CBR／Rating | **NO** |

> ⚠ **本檔 §3 的原始結論（推薦 Model A）已於同一輪被 Owner Review 推翻。**
> §3 保留原文作為推理脈絡，**結論以 §11 為準**。

---

## 1. Audit：現在到底有什麼

⚠ **不以文件為準，以程式為準。** 逐檔確認結果：

### 1.1 真的存在

| 檔案 | 契約 | 責任 |
|---|---|---|
| `contracts/matchEntry.js` | **`MatchEntryRequest.v1`** | 出賽申請單：誰、坐哪、名單版本、決定性 id。**canonical** |
| `contracts/matchSquad.js` | **`MatchSquad.v1`** | 陣容**合法性**＋提交單形狀（席位、分層、資格） |
| `contracts/matchmaking.js` | 票券狀態機 | 排隊 / 配對 / 取消 |
| `contracts/matchRoom.js`、`matchSession.js` | 房間、場次 | 進場生命週期 |
| `matchmaking/mockGateway.js` | 本機決定性 stub | **不是後端**；等待時間／對手／種子由 ticketId 雜湊推導 |
| `competition/teamStrength.js` | `teamStrength.v1` | 五人合成戰力。**目前只被 `simulateFixture.js`（AI 賽季模擬）使用** |

### 1.2 **不存在**（只是名字或註解）

| 名稱 | 實際狀況 |
|---|---|
| `SquadSnapshot` | 全庫只有 `coachCatalog.js` 一處註解、`check_club_assets_v1` 三條斷言（掃 `matchSquad.js` 當代理）、以及 Season vNext 設計文件 |
| `squadSnapshot.js` / `onlineCbr.js` / `onlineValuation.js` / `matchmakingPolicy.js` / `cbrDecisionGate.js` | **五個檔案都不存在**於 `main` |
| `starExcess` / `MATCH_BAND` / CBR / Bracket / Cap | `src/` 全庫 **0 命中** |
| Rating | `src/` 有 `rating`，但那是 **BattleResult 裡的單場表現評分**，與配對 Rating 是完全不同的東西 —— 不要混用這個字 |

⇒ 驗證器 §1 **刻意斷言這五個檔案「不存在」**：日後有人把它們加進來卻沒更新契約文件，gate 會紅，逼出一次同步。

### 1.3 client 送什麼 / server 該自己取什麼

實測 `createMatchEntryRequest()` 的完整輸出（驗證器 §2）：

```jsonc
{
  "schema": "MatchEntryRequest.v1", "squadSchema": "MatchSquad.v1",
  "transactionId": "entry:moba:9ad586ca:db8873d2:s1w2d8",
  "mode": "moba", "teamId": "t1", "teamName": null,
  "rosterVersion": "9ad586ca",
  "squad": [{ "seat": "b1", "playerId": "b1", "role": "top", "seatRole": "上路", "tier": "active" }, ...],
  "submittedAt": { "day": 8, "week": 2, "season": 1 }
}
```

- **陣容條目完全不含數值型別**（實測 `[]`）。
- 整張申請單**唯一的數字是時間座標**（實測 `[8,2,1]`）。
- `FORBIDDEN_VALUE_KEYS`（15 個鍵）**遞迴掃描**，夾帶 `stats`／`power`／`rating`／`ovr`／`derived`
  一律被拒；**巢狀夾帶也被拒**（實測）。

⇒ **server 應自己取得**：能力值、體力、士氣、等級、戰力、任何 career modifier 的結果。
client 只提供**身分與編制**。

### 1.4 Career stat 會在哪一層進入 Online power

**唯一的入口是「伺服器拿 `playerId` 回查」那一步**，而**那一步今天不存在**
（沒有伺服器、沒有 SquadSnapshot、沒有定價層）。

```
career players[] ──(訓練加速/球探等級把能力養高)──▶ 能力 88
        │
        │  ✗ 不經過 MatchEntryRequest（實測 0 數值）
        ▼
   playerId ──────▶ ［伺服器回查］◀── **這裡就是 GAP-2 的位置，目前是空的**
                          │
                          ▼
                    線上戰力
```

⇒ GAP-2 不是漏洞，是**尚未建造的一層**。要插入正規化／定價，位置就是這裡。

---

## 2. Canonical Naming：`MatchSquad` 與 `SquadSnapshot`

**結論：兩個不同概念，兩個都保留，不 rename。**

| | `MatchSquad.v1`（**已存在**） | `SquadSnapshot.v1`（**待建**） |
|---|---|---|
| 在邊界的哪一側 | client → server | server 內部 |
| 回答什麼 | 「這份陣容**合法嗎**？誰坐哪？」 | 「這場比賽**吃什麼值**？」 |
| 內容 | 身分：playerId、seat、role、tier | 值：五名選手的能力**值**、正規化後的狀態 |
| 可信度 | **不可信**（client 產生） | **權威**（server 由 playerId 自行組出） |
| 生命週期 | 每次送單產生 | 進場即凍結，賽事期間不可變（I10） |

它們**不是同一個東西的兩個名字**：一個是申請，一個是裁決依據。
把它們合併會直接毀掉 identity-only 的安全性 —— 那正是目前唯一真正成立的保護。

### Migration-safe 建議

1. **不動任何現有名稱**（零 rename 風險）。
2. `SquadSnapshot.v1` 作為**新契約**建立，不改 `MatchSquad.v1` 一行。
3. 清掉「把 `matchSquad.js` 當 SquadSnapshot 掃」的**代理斷言**：
   `check_club_assets_v1` 有三條寫著 SquadSnapshot 但實際掃 `matchSquad.js`。
   在真正的 SquadSnapshot 出現前，**把註解改成講 `MatchSquad.v1`**，
   避免製造「這個契約已經存在」的錯覺。（本輪未改，列為待辦，見 §9。）
4. `rating` 這個字在 BattleResult 已被用作單場表現評分 ⇒ 配對用的評分**必須另取名**
   （建議 `LadderRating`），否則兩者會在 grep 與對話裡永久互相污染。

---

## 3. Competitive Power Model：三案比較

⚠ **既有 `Season_vNext` 已將 CBR 三層標為 FINAL（結構）。** 本節不是重開設計，
而是拿 Owner 的三個選項去壓測那個既有結論是否仍然成立。

| | A. Career stats 直接進 Online，靠 Cap/Bracket/Rating 配對 | B. 對 stats 做 normalization / effective stats | C. Hybrid：cap 內保留差異，超出部分正規化 |
|---|---|---|---|
| **公平性** | 高 —— 但公平的定義是「你只會碰到同價位的隊」，不是「大家一樣強」 | 最高（表面） —— 但把「養成」抹平 | 中 —— cap 邊界附近會出現斷崖 |
| **Career 養成價值** | **完整保留**：養得好 ⇒ 進更高級、有更多選擇 | **被摧毀**：練到 88 上線變 82，玩家會問「那我練什麼」 | 部分保留，但玩家只認得 cap 那條線 |
| **玩家理解成本** | **低**：薪資帽是職業運動常識，一句話講完 | 中：要解釋「你的 88 在線上不是 88」 | **高**：要同時理解 cap ＋ 兩段不同規則 |
| **Matchmaking 壓力** | 中：級別要夠多、每級要有人 | 低：所有人可互打 | 中高：cap 附近的人被切成兩群 |
| **smurf / 沙包** | 有風險，但由 **I13** 結構性封死（見下） | 低 | 中：可以卡在 cap 下緣吃正規化紅利 |
| **whale / grind** | **買到入場資格，買不到同級碾壓** | 無意義（練了也沒用） | 邊界處可套利 |
| **實作複雜度** | 中：Cap 定價 ＋ Bracket ＋ Rating | 高：要維護第二套 effective stats，且必須與模擬同源 | **最高**：A ＋ B 全做，再加一條邊界規則 |
| **長期 / Steam** | 適合：可加級別、可調上限，不動玩家既有能力 | 不適合：養成型玩家會流失 | 可行但難維護 |

### ~~推薦~~：**A ＋ 波動狀態正規化**（⚠ 已被 §11 推翻，保留為脈絡）

即 Season vNext 的 **Cap → Bracket → Rating**：

- **能力值原樣進入**（career 88 就是 88）。不做能力正規化。
- **只正規化波動狀態**：`condition` / `morale` 一律寫成基準值。
- 公平性由**定價**產生：能力高 ⇒ 陣容貴 ⇒ 級別高 ⇒ 對手也貴。

~~**這解決了 GAP-2 而不需要 effective stats**~~：⚠ **這句話是錯的，見 §11。**
它成立的前提是「定價看得到所有影響模擬的東西」，而實測**目前看不到**
（天賦加成就有 5.8% 的差距，且那只是五個未定價向度之一）。

### 為什麼不是 B

B 直接與遊戲類型衝突。ESMO 是**經營養成**遊戲；把養成成果在線上抹平，
等於告訴玩家「線上與你的生涯無關」。那不是公平，那是把兩個產品切開。

### 為什麼不是 C

C 的複雜度是 A 與 B 相加，而它多換到的東西，A 已經用**更好懂的方式**給了：
「你不能帶這個陣容來這一級」比「你的能力超過 cap 的部分會被打折」直觀得多。

### A 的殘留風險（誠實列出）

| 風險 | 現況 |
|---|---|
| **沙包**：故意讓體力見底壓低定價，但線上正規化後滿血開打 | 由 **I13**（定價與模擬吃同一份快照、同一組正規化）結構性封死 |
| **未定價的能力 = 免費戰力**：模擬吃了但定價沒吃的欄位 | 由 **I12**（快照雜湊涵蓋所有影響模擬的欄位）＋「定價委派 `teamStrength.v1`」封死。⚠ `teamStrength` 目前**未與 LogicEngine 校準**（該檔自己註明），這是已知且已記錄的取捨 |
| **級別人口稀薄**：高級沒人 | 這是營運問題不是公平問題；LATER |
| **換人沙包**：把明星放板凳壓低定價 | 定價低 ⇒ 實際也弱 ⇒ 不構成套利 |

---

## 4. 責任分工（避免互相做同一件事）

```
CAP                  = 「你能帶什麼？」
                       陣容定價 ≤ 該級上限。定價**委派** teamStrength.v1，
                       不得自建第二套戰力公式。**不修改任何 stat**。

BRACKET              = 「你會碰到誰？」
                       由你的陣容定價決定**最低**能進哪一級。可以往上打，
                       不能往下沙包。**不看 careerYear、不看 meta.days**（I4）。

RATING（LadderRating）= 「同級裡誰比較強？」
                       只由**結果**產生，只在級內有效。
                       ⚠ **絕不作為進場條件**——否則退化成肝度榜。
                       ⚠ 與 BattleResult 的單場 `rating` 是不同東西，需另取名。

MATCHMAKING          = 「現在配誰？」
                       在**同一級內**依 LadderRating ＋ 佇列條件配對。
                       **不計算戰力、不定價、不決定級別**。

ONLINE_EFFECTIVE_STATS = 快照裡**正規化後的波動狀態**（condition / morale → 基準值）。
                       **不是能力的重新縮放**。能力值原樣使用。

ROSTER_OWNERSHIP     = Career 單獨擁有（`profileStore.players`）。
                       線上**只讀不寫**：不得寫 stats／finance／粉絲／energy（I2、I3、I14）。

CAREER_PLAYER_STATS  = Career 是唯一權威。線上經 SquadSnapshot **取值**，
                       取完即凍結，賽事期間生涯側的變動不影響已產生的快照（I10）。
```

**一句話界線**：Cap 決定「能不能來」，Bracket 決定「跟誰打」，Rating 決定「誰贏得多」。
三者都**不改變選手能力**；唯一會被改寫的是波動狀態，而且改寫發生在快照產生的那一刻。

---

## 5. Career Provenance（最小契約）

目標：能回答「這個 88 是 Career 88，還是 Online effective 82？」
**不建龐大 schema** —— 只要能回答來源、版本、動過什麼。

```jsonc
// 附在 SquadSnapshot 的每一名選手上
{
  "playerId": "b3",
  "source": "career",              // career | seeded | ai
  "rosterVersion": "9ad586ca",     // 沿用既有 rosterVersionOf()，不新造
  "values": { "reflex": 88, ... }, // 取自 career 的**原樣**能力值
  "normalized": ["condition", "morale"],   // 這場被改寫成基準值的欄位；能力不在其中
  "snapshotVersion": "SquadSnapshot.v1",
  "pricingVersion": "teamStrength.v1"      // 定價用哪一版公式
}
```

五個欄位就夠：
`source`（哪來的）、`rosterVersion`（哪一份名單）、`values`（用了什麼值）、
`normalized`（動過什麼）、兩個 `version`（用哪一版規則）。

⇒ 事後查帳時，「88 是 career 值、`normalized` 不含能力 ⇒ 線上也是 88，
只是它在定價裡值多少錢」是一句話能回答的。

⚠ **本段已依 §11 更正**：原本寫「不要放 effective 欄位，因為模型不重算能力」。
既然改採 guardrail（§11），provenance **必須**能表達「這一場實際採用的值」，
否則 guardrail 一旦作用就查不出帳。修正後的形狀：

```jsonc
  "values":    { "reflex": 88, ... },   // career raw（輸入）
  "effective": { "reflex": 88, ... },   // 本場實際採用（guardrail 未作用時逐值相等）
  "guardrail": { "applied": false, "policy": "none", "version": "v1" }
```

⚠ `effective` 在 guardrail 未啟用時**逐值等於** `values` —— 這不是冗餘，
而是讓「這個 88 是不是原值」變成一個**可以直接讀出來**的事實，
而不是靠讀規則文件推論。

---

## 6. Security / Trust Boundary（現況已成立）

**client 不得提交**（實測全部成立，驗證器 §2、§3）：

| 項目 | 現況 |
|---|---|
| final player stats | ✅ 陣容條目 0 個數值型別 |
| capability modifier | ✅ 七個邊界檔案對 14 個 modifier 名稱 **0 命中** |
| Coach modifier | ✅ 同上（`headCoachId`／`clubAssets` 0 命中） |
| Team Development modifier | ✅ 同上（含六個新旗標） |
| Facilities modifier | ✅ 尚不存在；名稱已納入掃描清單，日後洩漏會紅 |
| final Online power | ✅ 配對閘道**不自己算戰力**（`calcPower`／`teamStrength` 0 命中） |

**server 應自行計算或查詢**：由 `playerId` 回查 career 值 → 組 SquadSnapshot →
正規化波動狀態 → 定價 → 分級 → 配對。

⇒ **保留目前 `MatchEntryRequest.v1` 的 identity-only 方向。**
這是整個線上架構裡**唯一已經真正成立**的保護，不得為了方便而放寬。

---

## 7. CBR / Rating：本輪只定義責任

**本輪不做任何數值校準**（Owner 明文）。未動：
`starExcess`、`MATCH_BAND`、Rating formula、舊 AWP quarantined evidence、
先前失敗的 calibration。

⚠ 事實上**這些在 `main` 根本不存在**（§1.2）—— 所以「不動」在本輪是自然成立的，
驗證器 §7 把它釘住：線上契約層出現任何 CBR／Rating 數值就紅。

數值（級別數、各級上限、絕對值 vs 百分位、是否隨季浮動、Elo/Glicko）
一律 **LATER**：沒有線上樣本之前寫死等於瞎猜。

---

## 8. CS / MOBA 共用

- **契約共用**：`MatchEntryRequest.v1` 對兩個模式是同一份（驗證器 §6 實測 CS 走同一份、
  同樣不帶數值、席位表不同但 schema 相同）。
- **評分與配額不共用**（Season vNext **I9**）：MOBA / CS 不共用線上評分、獎勵、配額，
  否則雙開可繞過限制。
- **mode policy 可以不同**：例如 CS 的定價權重可能與 MOBA 不同
  （`teamStrength(roster, mode)` 已經吃 mode）。這屬於**契約參數**，
  不需要、也不得因此修改 battle runtime。
- 本輪**未修改** Codex-owned CS runtime（`src/battle/fps/`、`CsPrepScreen`、
  `CsLoadingScreen`、camera／POV／C4／audio／locomotion／route）。

---

## 9. 本輪明確不做（以及為什麼）

| 項目 | 決定 | 理由 |
|---|---|---|
| 建立 `squadSnapshot.js` prototype | **不做** | 沒有伺服器、沒有定價層 ⇒ 會是一個**沒有消費端的契約**。那正是 TD-56 花一整輪修掉的反模式（8 個沒有讀取點的節點）。等真的要接伺服器時一次做對 |
| 改 `check_club_assets_v1` 裡「SquadSnapshot」的代理註解 | **列待辦** | 低風險但屬於別的 gate；本輪已動過該檔一次（CS 邊界），不再連續改同一支 |
| Cap／Bracket／Rating 實作 | **不做** | 需要伺服器與樣本 |
| 任何數值 | **不做** | Owner 明文 |

---

## 10. 驗證

`tools/check_online_power_contract_v1.mjs` —— **44/44 PASS**。

| 節 | 守什麼 |
|---|---|
| §1 | canonical 契約存在；CBR／SquadSnapshot 五個檔案**仍不存在**（加進來未同步文件就紅） |
| §2 | client 送不出數值：陣容 0 個數值型別、唯一數字是時間座標、15 個禁鍵遞迴擋下、巢狀夾帶也擋 |
| §3 | 七個邊界檔案對 14 個 career modifier **0 命中**；閘道不自算戰力 |
| §4 | roster identity 穩定：練功／體力／士氣**不改**版本；換人／改分層／改席位**會改**；MOBA 與 CS 版本不互通 |
| §5 | 冪等與版本語意：同陣容同日 ⇒ 同 id；JSON 往返不變；練功不變；換人改變；跨日改變；舊名單被拒 |
| §6 | MOBA／CS 共用同一份契約 |
| §7 | 線上契約層沒有任何 CBR／Rating 數值 |
| §8 | **定價 ≠ 模擬**：實測天賦加成進得了引擎、進不了定價（69 vs 73），並釘住其餘未定價向度的存在 |

⚠ §8 的斷言方向是**「差異存在」**，不是「差異要消失」。它守的是
「這件事還沒被解決」這個事實不會被默默遺忘 —— 真的把定價與模擬對齊之後，
這一條會紅，逼出一次契約文件的同步更新。

⚠ §4 的「練功不改變 rosterVersion」是本輪最值得留意的一條：
它保證「名單有沒有換人」這件事**不會被練功污染** —— 伺服器可以用版本判斷
「這張申請單是不是基於過期名單」，而不會因為玩家練了一場就誤判。

---

## 11. Contract Reconciliation（Owner Review，2026-09-05）

**本節推翻本檔 §3 的原始推薦，並取代它成為本檔的正式結論。**

### 11.1 兩套規則的正式來源與時序

| | A | B |
|---|---|---|
| 文件 | `docs/design/Season_vNext_生涯與線上競技公平架構.md` §6 | `docs/design/TeamDevelopment_Expansion_v1.md` §10.2＋`04_Roadmap.md`＋`08_目前待辦與風險.md` |
| commit | `91ec289` | `bf996b6` |
| 日期 | **2026-08-26** | **2026-09-05**（**新 10 天**） |
| 性質 | 設計文件自己的推薦 | **Owner Review 正式裁示** |
| 原文語意 | 「推薦的線上公平模型：**CBR 三層**（**FINAL 為結構，LATER 為數值**）」 | 「**未來的 Online Competitive 必須自行建立 effective competitive power，不可無條件把 Career accumulated power 直接視為最終 Online power**」 |

**較新的 Owner decision = B。**

### 11.2 衝突確認：`POLICY_CONFLICT_CONFIRMED = YES`

但衝突的位置要講精確 —— **A 與 B 其實並不直接衝突**：

- A 只把 **結構**（Cap → Bracket → Rating）標為 FINAL，**數值標為 LATER**。
  它從未寫「raw career stats 永遠原樣進線上、永不加 guardrail」。
- B 明文列出的機制是「MatchSquad ／ snapshot ／ Cap ／ Bracket ／ Rating ／
  **normalization**」—— **normalization 本來就在 B 的清單裡**。

⇒ **真正與 B 衝突的是本檔 §3 的結論**，不是 A。
是我把 A 留下的空間（「數值 LATER」）擅自收斂成
「`CAREER_STATS_DIRECTLY_USED_ONLINE = YES`、不需要 effective stats」。
那一步既沒有 Owner 授權，也**沒有證據支持**（見 §11.3）。

⚠ **舊文件的 FINAL 不得覆蓋較新的 Owner 裁示** —— 而本案更簡單：
舊文件根本沒有做出那個 FINAL，是本檔越權替它做了。

### 11.3 決定性證據：Model A 目前**無法**避免免費戰力

Owner 的問題是「如果 `teamStrength` 定價不準，Model A 怎麼避免免費戰力？」
實測答案是：**避免不了**，而且不是理論風險，是現在就量得到的差距。

**定價路徑**（`simulateFixture.js:142`）：
```js
const sA = teamStrength(rosters?.[fixture.sideA], fixture.gameMode);   // 原始 players[]
```

**引擎路徑**（`mobaRosterAdapter.js:360,365`）：
```js
const rosterBlue = (cfg.roster ?? []).map(withDerivedStats);           // base + 天賦加成
```

⇒ 天賦加成**進得了引擎，進不了定價**。實測（驗證器 §8，可重跑）：

```
天賦全滿的能力加成: reflex+3 accuracy+3 apm+6 positioning+6 decision+6
                    courage+6 leadership+6 adaptability+6 …
定價路徑 teamStrength(players[])        = 69
引擎路徑 teamStrength(withDerivedStats) = 73
未定價的免費戰力 = 4.00（5.8%）
```

而天賦只是**五個未定價向度之一**。`calcPower` 定價的是
「16 項能力的加權平均 × 個性 × 士氣 × 狀態」；模擬另外還吃：

| 未定價的向度 | 證據 |
|---|---|
| **選手天賦**（derived stats） | `mobaRosterAdapter.js:360` 套 `withDerivedStats`；定價路徑沒有 |
| **英雄熟練**（heroProgress → power/tough） | `mobaRosterAdapter.js:115` 註明「英雄熟練 → power/tough 由 heroProgressStore」 |
| **英雄 arch/diff × 角色基準** | 同檔檔頭：power 由「英雄定位 × 選手能力 × 角色基準」推導 |
| **召喚師技能** | `spellsFor()` 隨對戰名單注入 |
| **位置適配 `posFit`** | `POSITION_PROFILE` 用前 5 項能力加權 5/4/3/2/1；`calcPower` 用的是**平坦的 mode 權重** ⇒ 「把對的人放對位置」不被定價 |
| **戰術／流派變體** | `MOBA_TACTICS` ＋ Club Mastery `tacticVariant` |
| **CS 地圖適配 `mapFit`** | 真實計算，`CsTacticScreen` / `csMapVeto` 都在用 |

⇒ Season vNext 的 **I12／I13**（「快照雜湊涵蓋所有影響模擬的欄位」「定價與模擬吃同一份輸入」）
在目前架構下**尚不可滿足**。把 Model A 寫成 FINAL，等於把上面每一項都變成
**可以用生涯進度換取、而且不用付定價代價**的線上戰力 —— 其中天賦與英雄熟練
正是 career progression 本身。**這正是 GAP-2 的實體。**

### 11.4 修正後的推薦：**C（保守版）**

不是「所有能力統一變成 80」。Owner 沒有要求那個，本檔也不建議。
建議的是一個**保守、可逆、暫不實作**的契約形狀：

```
① Raw Stats as Input
   career raw stats 是 SquadSnapshot 的**輸入**，不是最終 online power。
   （不做全域正規化，養成成果保留。）

② Server-Authoritative Pricing
   定價只在 server 端進行，委派 teamStrength.v1，
   client 永遠不提交任何數值（現況已成立，見 §6）。

③ Effective-Power Guardrail  ←── 本輪新增，取代原 §3 的「不需要」
   在 pricing 與 simulation 之間放一個**具名的可插拔點**。
   預設 `policy: "none"`（effective 逐值等於 raw）⇒ **今天行為與 A 完全相同**，
   但契約上留下「這裡可以介入」以及「介入了要記帳」（§5 的 provenance）。

④ Mode-Specific Normalization Hook
   MOBA 與 CS 的未定價向度不同（CS 有 mapFit，MOBA 有英雄熟練／召喚師技能）
   ⇒ guardrail policy **按 mode 設定**，不強迫兩邊用同一條規則。
   ⚠ 這是**契約參數**，不是修改 battle runtime。
```

**為什麼是「保守版 C」而不是完整 C**：完整 C 要現在就決定 cap 線與折算規則，
那需要 `teamStrength` 校準樣本 —— 而本輪明文不做校準。
保守版只要求**留下介入點與記帳欄位**，數值與政策全部 LATER。

### 11.5 這樣做付出什麼、換到什麼

| | |
|---|---|
| **付出** | 契約多兩個欄位（`effective`、`guardrail`）與一個 hook；預設關閉時零行為差異 |
| **換到** | 不把「raw stats 永遠是最終 online power」寫成**不可逆**的 FINAL。日後若校準顯示定價夠準，只要讓 policy 保持 `none` 即可 —— **A 仍然是 C 的一個特例**，不需要改契約 |

⇒ 這是**單向門與雙向門**的差別：寫 A 是單向門（拆掉要動契約），
寫保守 C 是雙向門（不用就不啟用）。在證據不足時選雙向門。

### 11.6 前置條件

`TEAMSTRENGTH_CALIBRATION_REQUIRED_BEFORE_MODEL_A_FINAL = YES`。

要把 policy 永久設成 `none`（＝等價於 Model A），必須先證明：
**模擬吃的每一個影響勝負的向度，定價都吃得到**（I12／I13）。
今天至少差七項（§11.3 表）。校準本身不在本輪範圍。
