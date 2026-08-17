# 主線缺陷診斷：SeasonState v2 adapter 切斷既有 legacy competition

> 建立日期：2026-08-18
> 狀態：**已定位現象與可疑機制，尚未定案 root cause。本文件只做診斷與調查計畫，不含修正。**
> 撰寫者：Claude（Q7f 整合驗證時發現）
>
> ⚠ **本文件不修改任何程式碼。** `profileStore.js` / `seasonStateV2.js` 未被更動。

---

## 1. 問題陳述

`SeasonState v2` 遷移把 `competitionView()` 的資料源改成經由 `activeEventAdapter`
取得的 `legacyState`。當 v2 投影找不到對應的 active event 時，adapter 回傳
`legacyState: null`，導致 `competitionView()` 退化成「沒有賽季」的空投影——
**即使 legacy competition 的資料完整存在**。

結果是**整個賽事頁失去資料源**，而不是單一欄位顯示錯誤。

### 1.1 相關程式碼（merge 後 = `origin/main` 版本）

`src/platform/profileStore.js` — `competitionView()`：

```diff
-    const state = get().competition;
+    const adapter = get().activeCompetitionEvent();
+    const state = adapter.legacyState;
     if (!state?.schema) {
       return { hasSeason: false, standings: null, /* … */ final: null,
                canRoll: { ok: false, reason: "目前沒有賽季", nextSeason: null } };
     }
```

`src/platform/profileStore.js` — `activeCompetitionEvent()`：

```js
activeCompetitionEvent() {
  return activeEventAdapter({
    seasonStateV2: get().seasonStateV2,
    legacyState: get().competition,
  });
}
```

`src/platform/competition/seasonStateV2.js:729` — `activeEventAdapter()`：

```js
let event = validation.ok ? activeEventOf(normalized) : null;
if (validation.ok && !event && normalized?.active == null) {
  const sealedEvents = (normalized.gameModes ?? [])
    .flatMap((mode) => (mode.circuits ?? []).flatMap((circuit) => circuit.events ?? []))
    .filter((candidate) => candidate?.status === EVENT_STATUS.sealed);
  if (sealedEvents.length === 1) event = sealedEvents[0];   // ← 只處理「恰好一個」
}
const legacyCompetitionId = legacyState?.competition?.id ?? null;
const compatible = !!event
  && !!event.competitionRef?.id
  && event.competitionRef.id === legacyCompetitionId;
// …
legacyState: compatible ? legacyState : null,   // ← 投影對不上就切斷真相來源
```

### 1.2 ⚠ 與 main 自述設計意圖的矛盾

`docs/handoff/05_Sprint紀錄.md`（`origin/main`）原文：

> `seasonStateV2.js` 是**唯讀投影模型**（legacy 為真相、存檔另存 `seasonStateV2`）

若 legacy 是真相、v2 只是唯讀投影，**投影建立失敗不應該讓真相消失**。
目前的 `legacyState: compatible ? legacyState : null` 讓投影可以否決真相來源，
這與上述設計陳述互相矛盾。**這一點是本案最需要產品／架構層裁決的地方**，
先於任何程式碼修正。

---

## 2. 重現條件

存檔同時滿足：

1. **有 legacy competition**（`state.competition.schema` 存在、賽季已建立）
2. **v2 投影沒有 active event**（`seasonStateV2.active == null` 且
   `activeEventOf()` 找不到，`sealedEvents.length !== 1` 使 fallback 不適用）

⇒ 任何**在 v2 遷移之前建立、且賽季含多個 Event** 的存檔都可能命中。
本專案的多 Event 形態（Q7a-3b 起：官方聯賽＋巡迴三站＋年度總決賽）
天然使 `sealedEvents.length > 1`，fallback 無法補救。

---

## 3. 證據（實測，非推論）

環境：`origin/main` (03a2fbc) merge 進 Q7f 分支後的工作樹，dev bundle，
`?asiaCircuit=1`，headless Chrome，注入存檔後 reload。

| 量測項 | `s7b_season_sealed.json` | `s7e_player_one.json` |
|---|---|---|
| `legacyHasSchema` | **true** | **true** |
| `seasonStateV2` 已生成 | 是（`schema/version/status/season/active/gameModes/history`） | 同左 |
| `adp.ok` / `adp.errors` | `true` / `[]` | `true` / `[]` |
| `adp.hasEvent` | **false** | **false** |
| `adp.activeIsNull` | **true** | **true** |
| `adp.legacyStateIsNull` | **true** | **true** |
| `view.hasSeason` | **false** | **false** |
| `view.finalIsNull` | **true** | **true** |
| `view.canRollOk` | **false** | **false** |

⚠ **`adp.ok === true` 且 `errors === []`** —— 這不是驗證失敗，
而是「驗證通過但找不到 event」的路徑。**失敗是靜默的**，沒有任何錯誤訊息。

### 3.1 gate 表現（同一棵工作樹）

| Gate | merge 前 | merge 後 |
|---|---|---|
| `browser_check_circuit_points_ui` | **21/21** | 全紅 |
| `browser_check_team_honors_ui` | **15/15** | 全紅 |
| `browser_check_career_final_ui` | **12/12** | 5/12（含 `#8 沒有 crash（賽事頁仍然到得了）` 紅） |
| `browser_check_asia_finals_ui` | **15/15** | 全紅 |
| `browser_check_season_recap_ui` | **19/19** | 全紅 |

`#8「賽事頁仍然到得了」`變紅是關鍵訊號：**這是整頁級失效，不是欄位級錯誤。**

---

## 4. 影響範圍

所有讀 `competitionView()` 的畫面同時失去資料：

- `CompetitionScreen`（賽事頁本體：賽程／積分榜／賽季進度）
- Circuit Points（巡迴積分區塊）
- Career Final（最終名次）
- Honors（戰隊榮譽相關讀取）
- Season Recap（Q7f 賽季總結——因為 `final` 為 null 而完全不 render）
- 季後賽對戰表、年度總決賽面板

---

## 5. 因果歸屬：**Q7f 不是來源**

| 判準 | 結果 |
|---|---|
| 失敗的 baseline gate 是否被 Q7f 改過 | **否**。`browser_check_circuit_points_ui` 與 `browser_check_team_honors_ui` 在 `178a956..ed8cc84` 之間零改動 |
| 這兩支 gate 在 main 與 merge 結果是否相同 | **逐位元組相同**（blob `01152cfd` / `f8483c08`） |
| 改動範圍是否重疊 | **否**。Q7f 只動 `seasonRecap/` 八個元件、`CompetitionScreen` 的排列與條件、`browser_check_season_recap_ui.mjs`；`profileStore.js` **一行未改** |
| 失效範圍是否超出 Q7f | **是**。涵蓋巡迴積分、戰隊榮譽等 Q7f 從未接觸的功能 |
| merge 前 Q7f 分支狀態 | 五支 gate 全綠（19/19、12/12、15/15、15/15、21/21）＋ build 通過 |

⇒ 唯一變因是 `origin/main` 的 88 顆 commit。

**main baseline = `03a2fbc` (Deploy R58.2 to GitHub Pages)。**

---

## 6. ⚠ 系統性缺口：`verify.mjs` 不涵蓋 browser competition gates

```
git show origin/main:tools/verify.mjs | grep browser_check
  → 零命中
```

`tools/verify.mjs` 的 29 個區段**沒有任何一支 browser gate**。
⇒ **賽事頁完全空白，main 的全套自動化驗證仍會全綠。**

這解釋了為何 v2 遷移（3b-M1／3b-M2／Q7b）與其後 60+ 個 sprint 都沒有攔截到本問題，
也代表**修好本案之後，若不補上 browser gate，同類缺陷會再次無聲通過**。

---

## 7. Root-cause 調查計畫（尚未執行）

> 原則：**先分辨機制，再談修法。** 每一步都要有可觀察的判別結果，
> 不接受「看起來像」的推論。禁止在本階段修改任何 production code。

### 步驟 0：建立乾淨的 main baseline（**先做，這是所有結論的前提**）

目前所有量測都在「main merge 進 Q7f」的工作樹上。
必須先證明**純 main（不含 Q7f）也會失效**，否則無法完全排除交互作用。

- 從 `origin/main` (03a2fbc) 開一個**獨立 worktree**（不動 q7b2、不動 `ESMO-acceptance`）
- 在該 worktree 跑**未被 Q7f 改過**的 `browser_check_circuit_points_ui.mjs`
- **判別**：
  - 純 main 也紅 ⇒ 確認為 main 缺陷，Q7f 完全除外，進入步驟 1
  - 純 main 綠 ⇒ 存在交互作用，本文件結論需重寫，**立即停止並回報**

### 步驟 1：確認 `syncSeasonStateV2` 對既有存檔產出什麼

- 注入 `s7b_season_sealed`，dump `seasonStateV2` 全文
- **要回答**：`gameModes[].circuits[].events[]` 有幾個？各自 `status` 為何？
  `active` 為何是 null？`competitionRef.id` 是否存在且與 legacy 對得上？
- **判別**：
  - events 為空 ⇒ sync **沒有從 legacy 反向建構** ⇒ 缺陷在 sync
  - events 有值但 `active` 為 null ⇒ 缺陷在「active 指派」或 adapter 的 fallback
  - events 有值且 `competitionRef.id` 與 legacy 不符 ⇒ 缺陷在 id 對應

### 步驟 2：確認 `legacyState?.competition?.id` 這條路徑是否正確

- Q7a-3b 之後 legacy state 是 `competitions` map ＋ `activeEventId`，
  `activeCompetitionOf(state)` 才是取得當前 competition 的正式方式
- **要回答**：`state.competition.competition` 這個屬性在多 Event 存檔中是否存在？
- **判別**：若不存在 ⇒ `legacyCompetitionId` 恆為 `null` ⇒ `compatible` **永遠 false**，
  與 v2 內容無關 —— 那麼缺陷在 adapter 讀錯路徑，而非 sync

### 步驟 3：確認 fallback 的適用範圍

adapter 的 fallback 只在 `sealedEvents.length === 1` 時生效。
- **要回答**：多 Event 賽季封存後有幾個 `sealed` event？
- **判別**：若 > 1 ⇒ fallback 對本專案的主要形態**結構性失效**

### 步驟 4：確認新舊存檔的分界

- 情境 A：`origin/main` 上**全新遊戲**，走完建立賽季 → 賽事頁是否正常？
- 情境 B：同一份存檔存檔後重載 → 是否仍正常？
- 情境 C：v2 遷移**之前**產生的存檔（本文件的兩份 fixture）→ 已知失效
- **判別**：A/B 正常而 C 失效 ⇒ 純粹是**既有存檔遷移**缺陷；
  A 也失效 ⇒ 影響所有玩家，嚴重度升級

### 步驟 5：正式站影響評估（**不修改正式站**）

- 用一份**既有存檔**在正式站（`https://rayhuang0323.github.io/ESMO-/`）重現
- **要回答**：已部署的 R58.2 是否已經讓既有玩家的賽事頁空白？
- ⚠ 這一步只做觀察與紀錄，**不做任何修補或回滾**——那需要獨立裁決

### 步驟 6：設計修正方向（**候選，待裁決，本階段不實作**）

依步驟 1–3 的判別結果，可能的方向（互斥，須擇一並說明理由）：

| 方向 | 內容 | 風險 |
|---|---|---|
| **F1 恢復「legacy 為真相」** | adapter 對不上時**回傳 legacy 本身**而非 `null`（fail-open），與 main 自述的唯讀投影設計一致 | 需確認 v2 消費者不會因此讀到不一致投影 |
| **F2 修 sync** | 讓 `syncSeasonStateV2` 能從既有 legacy competition 反向建構 events 與 active | 遷移邏輯複雜度高，需冪等與多 Event 覆蓋 |
| **F3 修 adapter 路徑** | 若步驟 2 證實讀錯屬性，改用 `activeCompetitionOf(state)` | 若只是路徑錯，這是最小修正 |
| **F4 擴充 fallback** | 讓多個 sealed event 時也能選定 | 治標；沒解決 `active` 為何是 null |

⚠ **F1 與 F2/F3/F4 的差別是產品層的**：
「投影失敗時應該讓功能降級成 legacy，還是應該失效？」
這不是實作細節，**需要使用者裁決**。

### 步驟 7：補上防護（修正後必做）

- 把 `browser_check_*` 系列納入 `tools/verify.mjs`，或建立獨立的 browser gate 區段
- 至少涵蓋：賽事頁可到達、`competitionView().hasSeason` 為真、既有存檔可載入
- **mutation 驗證**：把 `legacyState` 強制設為 `null`，上述 gate 必須紅

---

## 8. 目前狀態

| 項目 | 狀態 |
|---|---|
| Q7f 分支 | `ed8cc84`，**完成且已驗證，暫不部署** |
| `origin/q7a/3b-multi-event` | `ed8cc84`（已 push，成果安全） |
| `origin/main` | `03a2fbc`（**未動**） |
| 整合 merge | **已 `git merge --abort`**，工作樹回到 `ed8cc84` |
| 正式站 | **未部署本次變更** |
| production code | **本次調查未修改任何一行** |

Q7f 不應在主線賽事頁失效的情況下部署上去——那會讓 Q7f 看起來像是壞掉的那一方。
