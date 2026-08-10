# CS ADR Overkill / Result Metrics Repair R8

日期：2026-08-10
狀態：**PASS**
Calibration：**No-Go**

## 1. 結論

- 正式 simulator 的 HP、death、kill、winner、score、RNG 與 branch 完全保留原本的
  rolled damage；只有 `dmgDealt` 與 `roundDmg` 改記
  `effectiveDamage = Math.min(dmg, hpBefore)`。
- ADR 因此不再計入 overkill damage；rating 公式與係數沒有修改，只自然使用修正後 ADR。
- `CsMatchResult.js`、Store、UI、Progress、reward formula 與 settlement 全部零修改。
- R8 exact-path allowlist、effective-damage 重算、Progress integration 與 R1–R6 migration
  全部 PASS。這是 result metric repair，不是 gameplay calibration。

## 2. 正式修改

唯一 production 行為修改位於 `src/battle/fps/EsportsFPS3D.jsx` 的 firearm damage accounting：

```js
const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);
df.hp-=dmg;
at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;
roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;
```

`df.hp -= dmg`、死亡判斷、kill/headshot、round winner 與 RNG 消耗維持原式。沒有新增
gameplay branch、RNG call、平衡值或 dependency。

## 3. v1 → v2 migration 證據

- legacy source SHA：
  `5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`
- repaired source SHA：
  `870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b`
- legacy `CsGameplayDigest.v1` suite：
  `546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`
- repaired `CsGameplayDigest.v2` suite：
  `5e39e463148d2cd43bbd30b97c485858d75a5edf7f42a035f8f49e1d473293e9`
- seed generation：`CsMeasurementSeedSet.v1`；seed-set SHA：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- 16/16 v1 gameplay digests 因 result metrics 合法改變；每 seed 的 legacy v1 digest、
  baseline trajectory 與 treatment trajectory 均永久鎖在 R8 verifier，不由新版輸出覆蓋。
- v2 schema 明示 `damageAccounting: effectiveHpDamage.v1` 與
  `ratingFormula: CsRating.v1`；沒有 update/rebaseline CLI。

R8 只允許以下 JSON paths 改變：

```text
/result/players/*/adr
/result/players/*/mvpRounds
/result/players/*/rating
/frames/*/players/*/dmgDealt
```

每個 changed value 都由 damage events 的 `hpBefore` 與 rolled damage 重算；未忽略整個
player、frame 或 result 物件。任一非白名單差異立即 FAIL。固定 suite 的 final MVP 身分沒有
改變；round MVP rows 與 `mvpRounds` 逐回合由 effective damage 重建驗證。

## 4. R1–R6 migration

| Gate | 舊證據 | 修正後證據 | 不變保護 |
|---|---|---|---|
| R1 | gameplay v1 `546a3e57…95c2` | gameplay v2 `5e39e463…93e9` | fixed seeds、determinism、treatment integrity |
| R2 | full diagnostic `5720e45f…0089` | full diagnostic `11a20460…8d9d` | event-only `1b4b139c…836f` |
| R3 | wiring v1 `fe6b16dc…343e` | wiring v2 `6501b46d…9e00` | 16-case trajectory `00fa99fe…f2f0` |
| R4 | full v1 `1a0e78c1…6d3` | full v2 `e3a32ac8…0b0d` | event-only `4d8b0820…053c` |
| R5 | full v1 `4e94fc5c…6f20` | full v2 `42a78366…e49f` | event-only `210af817…2196` |
| R6 | full v1 `9c33c3c2…7368` | full v2 `3181fb1e…f2c3` | event-only `3f8a0b32…2196` |

R2/R4/R5/R6 的 opportunity／trigger／conversion events 與 R3 全 16 treatment 的
metric-neutral trajectory 仍精確等於舊版。新版 full suites 只反映合法 result metric 變化。

## 5. Progress integration gate

R8 以真實 chain 執行：

```text
engine result → toCsMatchResult → csResultToTransaction
```

- `CsMatchResult.v1`、adapter、reward formula 與 player-level source SHA 全部固定。
- adapter 輸入 deep-freeze，呼叫前後 hash 相同；不得 mutate engine result 或 roster。
- 每名玩家 `xpGained` 重新以未修改的 `csPerfFactor` 與 `playerXpFor` 計算並逐項相等。
- winner、score、team rewards（money／fans）與 KAST 的 legacy neutral suite 保持：
  `3fa9eda398d984f61158defdb7c9f65382b29db3f72c3a7710f18f25d8b548ac`。
- fixed suite 的 MVP 身分不變，所以 MVP bonus 不變；XP 的合法變化只來自新 rating。
- verifier 只跑 pure contract/progress adapters；沒有呼叫 settlement、重發獎或歷史 migration。

## 6. 驗證與未處理範圍

`cs_measure_r1`、`cs_instrument_r2`、`cs_stat_wiring_r3`、`cs_clutch_r4`、
`cs_retreat_r5`、`cs_defuse_r6`、`cs_result_metrics_r8` 聯合 **7/7 PASS**。

最終 runner 另加入 `cs23`、`progress25` 與 production `build`，共 **10/10 PASS**；
`git diff --check` PASS。runner 尚未執行的其他非本 Sprint segments 不宣稱通過。

本 Sprint 不處理 defuse stale arrays、`how:bomb`、utility、learning、synergy、balance 或
calibration；這些證據與風險維持原狀。
