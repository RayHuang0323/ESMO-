# R25 CS Accuracy Semantic Audit / Minimal Correction 規格

日期：2026-08-13
範圍：只定義 Accuracy 產品語意、審核 raw/effective consumer，並在證據充分時做最小 headshot 修正。

## 1. 產品語意

Accuracy（精準度）代表選手的射擊準度與命中部位品質。它在目前 simulator 內有兩個層次：

- raw Accuracy：球員資料中的穩定基礎值；用於經營端顯示及 `posSkill()` 的職位契合度。
- effective Accuracy：raw 值套用 personality boost / nerf，再 `clamp(1,99)`；用於當下 live combat execution。

現有產品證據一致指向此定義：Accuracy 是操作類素質、FPS 全域權重最高（1.4）、
「精準射擊訓練」提升 Accuracy / Reflex，步槍手與狙擊手都把 Accuracy 列為第一職位素質，
「狙擊架點」與 Dust II 也明確偏好 Accuracy。

## 2. Consumer boundary

| consumer | 正式語意 |
|---|---|
| `posSkill()` | raw Accuracy；表示穩定的 role-fit aptitude |
| `combatSkill()` mechanics / weapon fit | effective Accuracy；表示 live execution |
| headshot chance | effective Accuracy；同屬 live firearm execution |
| `aggr()` / `fireChance` / retreat | 不讀 Accuracy |
| hit / miss | 目前不存在，不能由現況假設 Accuracy 已控制命中率 |

R24 的 headshot formula 直接讀 raw `at.stats.acc`，但同一場 live combat 的
`combatSkill()` 已讀 effective Accuracy。Personality 明確對 Accuracy 有 `+6`（grinder）與
`-4`（shotcaller），所以 raw headshot 會略過已宣告的對戰有效值，判定為 semantic inconsistency。

## 3. 最小 production patch

只改 `src/battle/fps/EsportsFPS3D.jsx` 的單一 headshot 行：

- 保留既有 fallback `at.stats?.acc || 80`。
- 有 Accuracy 資料時以 `persStat(at,"acc")` 取得 effective Accuracy。
- headshot coefficient、damage、armor、role mapping、scenario 皆不變。
- 不增加、刪除或搬動任何 `rand()`；static call sites 保持 21。
- 不新增 miss branch，不改 `tracers.hit`、result contract、Store、Progress 或 Replay。

## 4. Focused evidence contract

`tools/check_cs_accuracy_semantics_r25.mjs` 必須驗證：

1. live source SHA 與 R25→R24 byte-exact adapter；R24 view SHA 固定為
   `57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`。
2. production diff 只有 headshot 所在的一行；RNG token sequence 完全相同。
3. raw role-fit、effective `combatSkill()`、effective headshot 與 no-miss pipeline 的 source boundary。
4. 16 fixed seeds、`inferno / t_aexec / c_std` 下，各自跑 uninstrumented / instrumented /
   repeated-instrumented 的 R24 historical view 與 R25 live view，共 96 次 simulation。
5. 每個 admitted exchange 都必須依序產生 exchange → headshot roll → firearm damage，證明本 Sprint
   沒有偷偷加入 miss。
6. live / historical 第一個 semantic boundary 前，attacker、defender、weapon、raw/effective Accuracy
   與 headshot roll 必須相同；差異方向必須符合 grinder 加成或 shotcaller 扣減。
7. 未遇到 headshot decision flip 的 seed，完整 simulation 必須 zero-diff。
8. suite digest 鎖定為
   `26ef0739e8ec2c110aeba4ad063727770dad4886d45df70a041e21dcf17892c8`。

## 5. 未來 hit / miss branch（本 Sprint 不實作）

若要讓 Accuracy 控制實際命中率，必須另開 Sprint，先決定命中語意與設計範圍。預期影響：

- gameplay：admitted exchange 不再必然傷害；damage、kill、assist、economy、KAST、ADR、round
  winner、score、survival、動畫、tracer 與音效都可能改變。
- RNG：若新增獨立 hit roll，至少多一個 RNG draw，會位移同一 stream 的後續結果；需要明確
  RNG migration 與 first-boundary causal gate，不能用 dummy RNG 或 rebaseline 掩蓋。
- digest / instrumentation：R2/R24 的 exchange→damage 假設與 `CsGameplayDigest.v6` 必須版本化；
  historical R1～R25 保持 byte-stable view。
- contract：若只內部計算 miss，`CsMatchResult.v1` 可不變；若要顯示 shots/hits/accuracy，需另做
  contract、adapter、persistence 與 UI migration。

因此 miss branch 值得作為產品設計候選，但不屬於 raw/effective semantic correction，也不能與本 patch 綁定。

## 6. Gate

- R25 semantic audit：Go。
- minimal headshot correction：Go。
- Accuracy balance calibration：Deferred / Revise。
- hit / miss implementation：No-Go in R25；若產品批准，另開 verifier-first Sprint。
