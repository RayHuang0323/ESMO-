# CS Combat Instrumentation R2 — 封版規格與安全審查

日期：2026-08-10
判定：**Go（test-only／fail-closed）**
Calibration：**No-Go**

## 目標

建立第一條可驗證的因果量測鏈：

`combat opportunity → fire trigger → duel／damage conversion → headshot result`

本 Sprint 只涵蓋同一個 combat inner loop，不擴到 retreat、clutch、defuse 或 16 項素質
全面校準。它要先證明量測入口可靠，並暴露既有 fire／duel／headshot probability 與 clamp。

## 最低侵入入口

R2 沿用 R1 的 Vite test-only memory transform，不寫回
`src/battle/fps/EsportsFPS3D.jsx`。原始檔必須維持 R1 provenance SHA：

`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`

只允許下列精確、各一次的 transform：

1. 在記憶體內替 `simulateFps` 加第六個 optional collector 參數。
2. 在既有 `if(rand()>=fireChance)continue;` 前記錄 opportunity，通過後記錄 trigger。
3. 在既有 `Pt` 計算後補 trigger probability／clamp 欄位。
4. 在既有傷害扣除後記錄 conversion、headshot 與 overkill 診斷。
5. 注入測試 export；正式 export 不變。

每個 replacement 必須恰好命中一次；把 replacement 逆轉後必須逐字等於原始來源。
任何 marker 漂移、來源 SHA 漂移或 Vite 載入形狀不符都直接 FAIL，不提供 fallback。

## 不變量

- 正式原始碼的 `rand()` 呼叫點目前是 21 個；transform 前後 token 序列必須相同。
- 不移動、不包裝、不重用任何既有 RNG call；fire、duel、headshot、damage roll 原句保留。
- 不改 `if`／`continue`／`break`、`usedT/usedCT`、`maxEngage` 或傷害／勝負寫入。
- collector 只接收新的 primitive-only event object；回傳值完全忽略。
- collector 不持有／修改 player、map、tactic、ROSTER 或 sim output reference。
- 無 collector、collector run 1、collector run 2 的完整 sim JSON 必須逐 seed 完全一致。
- 事件 canonical digest 在兩次 collector run 必須相同。
- R1 expected baseline、seed set 與 `CsGameplayDigest.v1` 不得更新。

## Event schema：`CsCombatInstrumentation.v1`

### `combat_opportunity`

一筆代表「一組 T／CT pair 已通過本 tick 的 gameplay eligibility，準備消耗既有 fire roll」。

欄位：

- round、sec、T／CT player id 與 role
- distance、sniperInvolved
- fireChance
- pairCount、maxEngage、generalEngagements

### `combat_trigger`

一筆代表既有 fire roll 已通過，且 pair 被加入 `usedT/usedCT`。

欄位：

- opportunity identity（round／sec／雙方 id）
- fireChance
- T／CT `combatSkill`
- `Pt`
- mapEdge、ecoEdge、flashPen、tacEdge
- atLowerClamp／atUpperClamp

### `combat_conversion`

一筆代表 trigger 已執行既有 duel roll、headshot roll、damage roll 與傷害扣除。

欄位：

- trigger identity
- T 是否贏得 duel roll、attacker／defender id、side、role
- `Pt`
- headshotChance、headshot
- rolledDamage、effectiveDamage、overkillDamage、kill

每一筆 conversion 同時就是一次 headshot opportunity；`headshot` 是其 result。

## KPI 語意

| KPI | 層級 | 遞增條件 | 節流／上限 |
|---|---|---|---|
| combat opportunities | pair／2 秒 tick | range < 55、LOS、無 smoke，通過 cap／alive／used filter 後抵達 fire roll | 2 秒 tick；成功 trigger 後同玩家本 tick 被 used set 擋；fire 失敗不會占 used set |
| fire triggers | pair／2 秒 tick | 既有 `rand() < fireChance` | 非 sniper 一般 trigger 受 `maxEngage`；sniper 不占一般名額，但仍受 used set |
| duel conversions | trigger | 既有 `rand() < Pt` 選出 attacker，完成一次傷害 | 與 trigger 1:1 |
| kill conversions | trigger | 扣血後 defender HP ≤ 0 | 無額外量測門檻 |
| headshot opportunities | trigger | 每次既有 attacker shot | 與 trigger 1:1 |
| headshot results | trigger | 既有 headshot roll 成功 | probability 來自 gun HS × raw accuracy |

這些是 gameplay action-point KPI，不是 summary counter。未通過 range／LOS／smoke／cap
的 pair 不算 opportunity；因此它不是「所有可能敵人組合」。

## Verifier 最小邊界

新增：

- `tools/check_cs_instrumentation_r2.mjs`
- `tools/verify.mjs` 的 `cs_instrument_r2` segment

不修改：

- `EsportsFPS3D.jsx`
- `check_cs23.mjs`
- R1 expected baseline／digest schema／fixed seeds
- gameplay／contract／Store／UI／dependency

R2 使用與 R1 相同的 16 fixed seeds、Inferno、`t_aexec`、`c_std` 與既有 ROSTER。
每 seed 跑 off／on-1／on-2，共 48 simulations；不計 p-value、不因結果換 seed。

## PASS hard gates

1. 來源 SHA、所有 marker count、逆轉 transform 與測試 API 正確。
2. transform 前後 21 個 `rand()` call tokens 完全相同。
3. seed generation version、完整 16 seeds 與 seedSetSha256 正確並印到 stdout。
4. off／on-1／on-2 的完整 sim JSON 逐 seed完全相同。
5. on-1／on-2 event digest 逐 seed相同。
6. opportunity > 0、trigger > 0，且 opportunity ≥ trigger。
7. trigger 與 conversion 1:1；每個 trigger 必須對應較早的同 identity opportunity。
8. fireChance、Pt、headshotChance 有限且在 [0,1]；Pt 只在 [0.07,0.93]。
9. clamp flags、rolled／effective／overkill damage 與 kill invariant 一致。
10. 目標 `t2` 至少有 opportunity 與 conversion，確保能支援 R1 accuracy pilot。
11. temp cache 必須在 `finally` 清除；任何例外、漏事件或輸出形狀不符皆 FAIL。

正式 release gate 仍必須同時執行：

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,build --timeout=600000
```

R2 自己只證明 instrumentation 等價性；正式 gameplay baseline 由 R1 segment 負責。

## 嚴格審查

### 最嚴重假設

「collector callback 不會改變 gameplay」不能只靠口頭保證。處置是同 seed 的完整 sim
off/on byte-equivalence；不是只比 KDA 或 summary。

### 量測漏洞

- Opportunity 定義位於既有 eligibility/cap 後，不能解讀成全場可見接觸。
- Fire 失敗不占 used set，單一玩家同 tick 可能產生多筆 opportunity。
- Conversion 目前是一發傷害，不等於整場 duel 最終勝負；kill 另以 boolean 表示。
- Headshot 使用 raw `stats.acc`，未經 `persStat`；R2 只忠實揭露，不在本輪修公式。
- Pt clamp 只暴露是否命中上下限；不改公式去新增 raw probability。

### 範圍風險

把 retreat／clutch／defuse 同輪加入會跨三個不同 state machine，難以定位任何 digest
回歸，因此明確排除。R2 穩定後再各自拆 Sprint。

### 基準風險

只比 instrumentation on/off 仍不足以證明沒有共同漂移，所以 R1
`CsGameplayDigest.v1` 必須和 R2 一起跑；禁止用更新 expected digest 掩蓋失敗。

## Go / No-Go

**Go。** 原因是正式 gameplay 檔維持零修改、transform 可完全逆轉、RNG token 不變，
且 off/on 完整輸出與 R1 formal baseline 形成兩層 gate。

若任一 marker 需要模糊 regex、需要第三個 helper／額外 dependency、或無法讓
off/on 完整 sim 相同，立即判 **No-Go**，不擴大範圍、不改 expected。
