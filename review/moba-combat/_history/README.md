# 方法學歷史

| 檔案 | 狀態 |
|---|---|
| `sensitivity.*`（第一輪 512 場） | ❌ **確實無效**：`configureMatch` 在 `configurePlayers` **之前** ⇒ `invadeAdj` 完全失效 |
| `r2gen*`（第二輪首跑，30 seeds） | ✅ **其實有效**（見下方更正） |

正式 runtime 順序（`useLocalServer.js`）：
`configurePlayers(143) → configureHeroes(152，無 roster 時不呼叫) → configureSpells(186) → configureMatch(192)`

---

## ⚠ 更正（2026-08-09）：技能層順序**不是**瑕疵

本檔原本寫：`r2gen*` 首跑的瑕疵是「`configureSpells` 排在 `configureMatch` 之後，
與正式 runtime 不一致」，並據此把那批數字判為不得採用。

**這個判定是錯的。** 實驗證據：

1. **`configureSpells` 不消耗任何 rng**（`LogicEngine.js:configureSpells`）——
   它只做純賦值：設 `spellsOn` / `spellMeta`、清理技能表、補打野的懲戒。
2. **`configureMatch` 不讀技能狀態** —— 它當下唯一會讀能力層的是打野的 `invadeAdj`。
3. **逐位元實測**：同 seed、技能層排在 `configureMatch` **之前 vs 之後**，
   8 個 seed × courage 40/90 全部**逐位元相同**（終局時間／勝負／金錢／入侵次數）。
4. **檔案交叉印證**：`_history/r2gen.json`（修正前）與 `r2gen.json`（修正後）
   在共同的 8 項上**每一個數字都相同**。

⇒ **真正有影響的順序只有一條：`configurePlayers` 必須在 `configureMatch` 之前**
（開局入侵在 `configureMatch` 當下擲骰並讀打野的 `invadeAdj`）。
技能層放哪裡都一樣；`configureHeroes` 在無 roster 時是 `if (!blue && !red) return;`
的逐位元 no-op。

⇒ `r2gen_run1.log` 與 `_history/r2gen.*` **不是因為順序而無效**，
它們與 `r2gen.*` 是同一組數字。保留在此僅因為 `r2gen.*` 是同內容的較完整版本
（多了 focus 一項）。

⚠ **但這些檔案現在仍不應作為現行基準** —— 理由不是順序，而是
**引擎已於其後改變**（Combat Decision C 的遊走模型、B 的團戰投入決策）。
現行的一般組基準是 `r9gen.*`（後 B/C）。
