# 技術債／後續 Sprint：Multi-Event SeasonState v2 Sealing Completion

> 建立：2026-08-19（SeasonState v2 runtime 修復 Stage 5.3 停下時）
> 狀態：**未開始。** 本文件只記錄缺口與已知約束，不含設計方案。
>
> ⚠ 本輪**刻意不實作** —— 多 Event 的 sealing 語意從未被正式定義，
> 硬接等於在沒有契約的情況下發明行為，而那正是這次整起事故的成因。

## 目前 v2 的正式定位

> **讀取／runtime scope projection 已正式恢復；
> sealing write boundary 仍暫時使用 legacy path，
> 等待獨立 Multi-Event Sealing Sprint。**

- **讀取側**（`competitionView`、fixture lifecycle、rollover）已恢復經由
  `activeCompetitionEvent().legacyState`，scope safety 生效、fail-closed 完好。
- **寫入側**的 `_sealSeasonIfFinished` 仍走 Q4/Q5/Q6 的 legacy 封存實作。

## 缺口（皆為實測，非推論）

### 1. `seasonSealingV2.js:196` 仍讀已淘汰的 `legacyState.competition.id`

```js
if (!legacyState?.competition?.id || event.competitionRef?.id !== legacyState.competition.id) {
  return { ok: false, reason: "competition_scope_mismatch", … };
}
```

Q7a-3b 之後賽季狀態沒有頂層 `competition` 屬性（改為 `competitions{}` map）。
**實測**：多 Event 賽季逐一呼叫 `sealCompetitionEvent()`，四個 Event
**全部** `competition_scope_mismatch`。

⇒ 與 `wrapLegacySeasonState`／`activeEventAdapter`／`migrateSeasonStateV2`
**完全同源**，是同一個 root cause 的第四個現場。先前 v2 是空骨架，
這條路徑從來沒被執行過，所以沒被發現。

### 2. fixture scope 比對拿單一 Event 的 ids 對整季 fixtures

同一函式下一行：

```js
if (!sameIds(event.fixtureIds, ids(legacyState.fixtures)) || !sameIds(event.outcomeIds, ids(legacyState.outcomes, "id"))) {
  return { ok: false, reason: "legacy_index_mismatch", … };
}
```

修好後的 v2 Event 的 `fixtureIds` 是**該 Event 自己的**（依 stage 過濾），
而 `legacyState.fixtures` 是**整季全部**。多 Event 時兩者必然不等。

### 3. `_sealSeasonIfFinished()` 只封 active 那一個 Event

```js
const event2 = get().activeCompetitionEvent().event;      // 只有 active
const boundary2 = get().sealCompetitionEvent({ eventId: event2?.id ?? null, … });
const season2 = get().sealCompetitionSeason();            // 要求全部
```

沒有任何地方去封其他 Event。

### 4. `sealCompetitionSeason()` 要求全部 Event 已封存

程式碼自身註解說明了意圖（是對的）：

> The Season boundary owns the complete Event set. Do not narrow the
> requirement to whichever Event happened to be active: that would let
> a future multi-Event Season seal while another Event is still open.

**實測**：多 Event 賽季全部 fixture 打完後仍回 `events_not_sealed`。
3 與 4 合起來 ⇒ 多 Event 賽季**永遠封不了**。

### 5. 多 Event sealing 的 ownership 與 settlement ordering 尚未定義

這是**產品／架構問題，不是實作缺陷**，必須先有答案才能動手：

- 誰負責封非 active 的 Event？`_sealSeasonIfFinished` 逐一封？還是各 Event
  在自己最後一場結束時各自封？
- 巡迴站與年度總決賽的封存順序是否影響 Circuit Points 結算與晉級資格？
- 獎金結算（目前只有官方聯賽有 prize policy）在多 Event 下的觸發點與冪等鍵？
- 年度總決賽的 Event 必須在巡迴三站都封存後才能建立——封存順序是否有前置約束？
- Season boundary 的「required Events」如何定義？是全部，還是只有必要的？

⇒ Codex 交接 §7 已標記：「多 sealed Event 下 active adapter 與所有舊 caller
的完整組合未見獨立 browser gate」；§8-2.5 亦記錄多 sealed Event 的 fallback
刻意不處理。**這一塊從一開始就是留白，不是壞掉。**

### 6. `P0_V2_SEALING_BOUNDARY` 必須保留 `false`

`profileStore.js` 的 `_sealSeasonIfFinished()` 內：

```js
const P0_V2_SEALING_BOUNDARY = false;
```

在 1–5 全部解決之前**不得改成 `true`**。改成 `true` 會讓多 Event 賽季
無法封存（實測 `events_not_sealed`），連帶 `canRoll` 永遠 false、玩家卡在季末。

⚠ 這個旗標同時是**現成的 mutation 測試點**：翻成 `true` 應該讓
`browser_check_q6` 與 `browser_check_career_final_ui` 轉紅。

## 開工前的建議順序

1. **先定義**第 5 項的產品語意（ownership／ordering／required set），寫成契約文件
2. 依契約補 verifier（多 Event 逐一封存、混合狀態、順序約束、冪等）
3. 才修 1–3 的實作
4. 最後把旗標翻成 `true`，並確認全套 gate 仍綠
5. 移除本文件與 `_sealSeasonIfFinished` 內的停用註解

## 相關文件

- `review/mainline-defects/SEASONSTATE_V2_LEGACY_CUTOFF_DIAGNOSIS.md` —— root cause 與 P0
- `review/mainline-defects/SEASONSTATE_V2_RUNTIME_CONTRACT.md` —— C1–C12 契約
- `review/mainline-defects/SEASONSTATE_V2_CODEX_HANDOFF.md` —— 原始設計意圖與歷史
