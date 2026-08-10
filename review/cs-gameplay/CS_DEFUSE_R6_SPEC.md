# CS Defuse Instrumentation R6 — 封版規格與嚴格審查

日期：2026-08-10
狀態：**Reviewed / Go**
Calibration：**No-Go**

## 1. 目的

R3 已確認 `focus`／`decision` 直接進拆彈進度，但正式 result 只留下回合 `how`，無法分辨：

```text
bomb planted tick
  → CT proximity opportunity
  → contested gate
  → progress increment
  → pause / owner switch
  → complete
  → round result
```

R6 只建立這條 action chain；不把 defuse 次數當素質效果，不比較 treatment，不修改 gameplay。

## 2. 先釘住正式語意

來源：`src/battle/fps/EsportsFPS3D.jsx` 的同一支 `simulateFps`。

- Gameplay loop 是 `sec += 2`，所以每個 defuse tick 代表 2 秒，不是 0.1 秒。
- 炸彈設為 `c4t=20`，同一 plant tick 後段先執行 `c4t--`；畫面顯示 `c4t * 2` 秒。
- production 選 `aliveCT.find(distance < 6)` 的第一人，不是最近者，也沒有 defuse kit 系統。
- contested：選到 defuser 後，既有 `aliveT.some(distance < 9 && LOS)` 為真。
- progress delta：`0.45 + focus/250 + decision/300`；累計門檻 `3.5`。
- `defuseProg` 是 round-global accumulator；離開、被壓制、死亡或換人都**不會 reset**。
- `aliveT`／`aliveCT` 在 tick 開頭建立，但 combat 在 defuse 之前發生；陣列成員可能已
  `dead=true`。R6 必須同時記 production stale view 與 fresh post-combat view，不能偷偷改用
  fresh array 取代正式 branch。
- post-plant `how:"bomb"` 不只代表 timer 歸零；CT 全滅也使用同一標籤。報告不得把所有
  bomb results 都稱為爆炸。

## 3. 硬邊界

允許：

- 新增 `tools/check_cs_defuse_instrumentation_r6.mjs`；
- `tools/verify.mjs` 只新增 `cs_defuse_r6` segment；
- 新增完成報告並更新必要 handoff。

禁止：

- 修改 `EsportsFPS3D.jsx`、CS23、R1–R5 verifier；
- 修改 gameplay/result/contract/Store/UI/roster adapter；
- 新增 dependency、正式 helper/export 或第二套 `simulateFps`；
- 新增 RNG、改 RNG 消耗順序或 gameplay branch；
- 修改 `c4t`、距離 6/9、progress 公式/門檻、tick、地圖、武器、經濟或戰術；
- 修 stale array、加入 kit、重設進度、改 winner/how；
- calibration、stat treatment、p-value、換/加 seed、自動 rebaseline。

正式 FPS source SHA-256：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 4. Event schema 與遞增條件

Schema：`CsDefuseInstrumentation.v1`。

### 4.1 `defuse_plant`

每個正式 plant branch 恰一筆：round、sec、site、carrier、`c4t=20`。它只標記 planted round。

### 4.2 `defuse_tick`

每個 `planted && c4t !== null` tick 恰一筆，位置在 production 已算出 `defuser`／`contested`
之後、progress branch 之前。記錄：

- `c4t`（已執行本 tick 的 `--`）與 `defuseProg` before；
- production candidate IDs、selected defuser、production contestant IDs；
- fresh post-combat candidate/contestant IDs；
- selected defuser 是否已 dead、production contested、是否通過 progress gate；
- fresh alive T/CT counts。

`defuse_tick` 是 team-tick opportunity；proximity、uncontested 與 progress 是不同層。

### 4.3 `defuse_progress`

只在正式 `defuser && !contested` branch 真正增量後記錄：player、focus、decision、before、
delta、after、`c4t`、player dead flag。delta 必須精確對回正式公式。

Pause 不新增 event：同 round 中 `progressBefore > 0` 且該 tick 無 progress event 即為 retained
pause。Owner switch 由相鄰 progress events 的 player ID 改變推導，避免建立第二套 state。

### 4.4 `defuse_complete`

只在正式 `defuseProg >= 3.5` 設定 `roundEnd={winner:"ct",how:"defuse"}` 後記一次，並記
completion player、進度、`c4t`、player dead 與 fresh alive counts。

### 4.5 `defuse_round_result`

每個 planted round 恰一筆：final progress、defuseCalled、winner/how、final c4t、fresh survivor
counts。與 sim `roundHist` 和 final frame 交叉驗證。

## 5. 固定輸入

- `CsMeasurementSeedSet.v1` 原固定 16 seeds／hash；
- Inferno、T `t_aexec`、CT `c_std`、既有 ROSTER；
- 每 seed collector off/on-1/on-2，共 48 simulations；
- baseline only，無 stat treatment。

Candidate event suite 必須人工檢查後以 literal 鎖定；無 update/rebaseline CLI。

## 6. PASS / FAIL

1. 無 CLI flag；source SHA、markers、seed generation/hash 精確一致。
2. memory transform 精確可逆；21 個 `rand()` 與全部 RNG token 序列不變。
3. off/on-1/on-2 完整 sim JSON 逐 seed相同；on-1/on-2 events 逐 seed相同。
4. input simulate 前後 hash 不變。
5. 每個 planted frame tick 恰有一筆 tick event；plant／round-result 每 planted round 各一筆。
6. production candidate、selected defuser、contestants、contested 與 progress gate identities 閉合。
7. 每個 progress event 對到同 tick gate；before/delta/after 與 focus/decision 公式閉合。
8. progress 單調不減；pause 保留、owner switch 與 multi-defuser round 只由 event chain 推導。
9. complete 恰對到 crossing progress event；complete iff round result `how=defuse`。
10. round result winner/how/final c4t/survivors 對回 sim；`how=bomb` 不強制等於 c4t 0。
11. fixed suite 至少有 plant、tick、proximity、progress 與 complete；pause／owner-switch 使用同一
    純推導函式的 synthetic self-check，fixed baseline 為 0 時如實保留，不換 seed。
12. expected event suite digest 匹配人工鎖定 literal；禁止自動更新。

以下不是 FAIL：

- 沒有 proximity defuser；
- contested 或 progress pause；
- progress 換人且保留；
- fixed baseline 沒有 pause 或 owner switch；
- production 選到 stale dead defuser／stale contestant；
- planted round 由 elimination 或 timer 結束；
- 結果方向與直覺不同。

## 7. 嚴格審查

| 高風險假設 | 修正版 |
|---|---|
| 一個 defuse event 就能代表拆彈效果 | 拆成 bomb tick／proximity／gate／progress／complete／result |
| 每 tick 是連續時間或 0.1 秒 | 明確以正式 `sec += 2` 解讀，每筆是 2 秒離散 tick |
| `aliveCT` 名稱保證成員仍活著 | 同時記 stale production view 與 fresh post-combat view |
| 沒進度就表示 progress 歸零 | 正式 accumulator 不 reset；pause 必須量 retained progress |
| 換人後是新拆彈 | round-global progress 會轉移；另量 owner switch，不偽造 restart |
| `how=bomb` 全是 timer 爆炸 | 分開 final c4t／fresh survivors；不從標籤推論原因 |
| 可以順便修死者拆彈或加 kit | 這會改 gameplay digest，R6 只留證據 |
| focus/decision 有公式就可 calibration | 先證明 opportunity 分布與 conversion sample；R6 不做 treatment |

## 8. 判定與下一階段准入

審查結論：**Go**。所需 markers 位於單一既有 plant/defuse/round state machine，可用一支
test-only verifier 完成，不需正式 helper、dependency 或 source 修改。

R6 PASS 只關閉 focus/decision 的 defuse baseline instrumentation 缺口。若量到 stale actor、
retained progress 或 owner transfer，先分類 A/B/C 並提出 contract-aware 修正 Sprint；不得在
本輪直接修。Calibration 仍需 stat-specific treatment、固定 sample plan、ADR overkill 隔離與
明確 outcome，R6 本身不授權進入 calibration。

### Fixed-seed coverage 修正（實作審查）

第一次固定 16-seed 執行有 20 個 planted rounds、16 個 progress ticks與 4 次 complete，
但四個開始進度的回合都連續完成，pause／owner-switch 均為 0。這是可重現的 sample 結果，
不是 collector 漏量。原「pause 必須 >0」gate 會逼迫換 seed，違反固定 sample 原則，故改為：

- fixed baseline 的零值保留；
- pause／owner-switch 仍由 production events 推導；
- 同一推導函式以 start→pause→owner switch synthetic chain 自我驗證；
- 不追加 seed、不變更正式 gameplay、不把零值寫成已觀察 coverage。
