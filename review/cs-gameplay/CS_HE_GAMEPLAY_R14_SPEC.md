# CS HE Gameplay Integration R14

日期：2026-08-11
狀態：**Go / Complete（local only，未 push）**

## 1. 封版範圍

R14 只把既有 HE throwable 的 visual detonation 接入真實 HP damage：

- `HE_R=12`
- 中心最大傷害 `80`
- 距離線性衰減至半徑邊界的 `0`
- 只傷敵方，牆體阻擋
- 有 armor 時乘 `0.72`
- 不新增 RNG，不補 dummy RNG

以上數值是 **R14 functional baseline**，只用來封住可驗證的最小 gameplay read-chain；不代表
已完成 balance calibration。任何 radius、damage 或 armor scale 調整都必須另開 Sprint，重新
評估 causal migration 與 evidence。Calibration 仍為 No-Go。

不在本 Sprint：molly、learning、synergy、balance/calibration、RNG stream 重構、
`CsMatchResult.v1`／Store／Progress／`csHistory`／賽後 UI 擴充。

## 2. Production read-chain

```text
既有購買／投擲
  → round-local throwerByNadeId[nadeId]
  → 既有 throwable flight / detonation
  → enemy + d < HE_R + wall-clear
  → deterministic linear raw damage × armor scale
  → shared applyDamage()
       ├─ _hitters / effectiveDamage / roundDmg
       └─ roundUtilDmg（HE subset）
  → shared finalizeKill()（若死亡）
       ├─ kill / death / assist / first kill / multikill
       ├─ dropped gun / bomb drop / KAST inputs
       └─ existing kill economy（HE 使用既有 default $300）
  → engine raw result players[].utilDmg
```

`throwerByNadeId` 與 `roundUtilDmg` 都是 round-local state，不新增 runtime/result contract 欄位。
Firearm 與 HE 共用同一組 damage/death helpers；沒有第二套 HP、kill、assist 或 economy 帳本。
Live killfeed 對 `gun:"he"` 顯示 HE icon；賽後 result screen 沒有新增欄位。

`utilDmg` 在 R14 只於 engine raw result 變成真實 effective HE damage。`CsMatchResult.v1` 仍依原
schema 過濾該欄，Store、Progress、reward、`csHistory` 與賽後 UI 均不讀取它。

## 3. Damage semantics

對每個存活敵人：

```text
d >= 12 或 lineBlocked → 0
rawDamage = round(80 × (1 - d / 12))
damage = armor ? round(rawDamage × 0.72) : rawDamage
effectiveDamage = min(damage, hpBefore)
```

只有正值 `effectiveDamage` 進入 `roundDmg` 與 HE-only `roundUtilDmg`。因此 overkill 不會灌高
ADR 或 utilDmg，沿用 R8 effective-damage accounting。

## 4. Causal determinism migration

R14 的 causal boundary 是 paired candidate 中第一筆正值 HE effective damage：

1. boundary 前，exact-tick gameplay snapshots、frames、highlights、completed round history、
   result projection 與 RNG 必須 exact。
2. 沒有正值 HE effective damage 的 run 必須整場 sim/result/RNG zero-diff。
3. boundary 後只允許可追溯到該 HE damage 的 HP、death、combat state、result、trajectory 與
   後續 RNG consumption 差異。
4. production 與 historical candidate 的靜態 `rand()` call sites 都必須是 `21`；禁止新增 RNG、
   dummy RNG 或為了保 digest 而補抽。
5. 任一 pre-boundary diff、未知 damage source、錯誤 attribution/accounting 或無法重建 R13
   source 都立即 No-Go。

固定沿用 16 seeds × R3 16 treatments，共 256 paired runs，不擴大 scenario scope。

## 5. Verifier-first 與 locked evidence

`tools/check_cs_he_gameplay_r14.mjs` 先在 R13 production 上以 memory candidate 執行完整 gates，
最後刻意以 `PRODUCTION_HE_NOT_INTEGRATED` 紅燈停止；production patch 後再要求 source 與已審核
candidate byte-exact 相同。pre-lock run 只能停在 `R14_BASELINE_NOT_LOCKED`，人工核對與
verifier-first red hashes 相同後才寫入 constants；沒有 capture/update/rebaseline CLI。

| Evidence | Locked value |
|---|---:|
| `CsHEGameplay.v1` | `97b42b973e9d34cf9dccf1fd53fa3ee6ad5a25345de15051e64674104ef390ab` |
| `CsGameplayDigest.v5` | `46952997a395f76980da25273e67d7f1e03b912247c2d5593fcfba205cd3f545` |
| Matrix paired runs | 256 |
| Runs with effective HE damage | 85 |
| Zero-impact runs | 171 |

Neutral 16-seed coverage：29 throws、27 detonations、9 positive damage events、305 effective
damage、2 kills、1 assist。Coverage 只證明 functional read-chain 有被走到，不是 balance 指標。

## 6. Historical evidence protection

R14 新增唯讀 `cs_r14_legacy_source.mjs`，依序還原 canonical LF 的 R13→R12→R10→R8 source，
供 R1～R13 historical verifiers 使用。R13 當時記錄的 mixed-EOL working-tree SHA
`bab6776110eac6181bf7b75250061592e2dfc892d4523ea9817cdb15e1cfe341` 永久保留；另以 Git blob
canonical LF SHA `574c6d419950db6892eca5c76be5cdf1eca59cf380148b7c0779f76d34a2c9ce`
消除 `core.autocrlf` 對 verifier provenance 的環境耦合。R14 canonical source SHA：
`943cd562019f966d43bde9aa7aa05bc41cbcc2cda25a32a2556fe08bdf470720`。

沒有修改任何 R1～R13 historical digest constant。代表性重驗：

- R8 legacy v1：`546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`
- R8 repaired v2：`5e39e463148d2cd43bbd30b97c485858d75a5edf7f42a035f8f49e1d473293e9`
- R10 v3：`7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb`
- R11 semantics：`64a16a36092976b2e433fa5e276e03f2987ec35508b658bf5ec17c41b032ed28`
- R12 flash：`265c9f3b79324e395004a726f996772bbba2b4033979ac6ec91600cfb68702a0`
- R13 v4：`01ef345a70a3c3ae274b65c54cc19a68b80907fb2fd81495ff7855096d8d2289`

## 7. 驗證結果與判定

- Verifier-first red：完整 gates 後只報 `PRODUCTION_HE_NOT_INTEGRATED`。
- Production pre-lock：同一組 hashes，完整 gates 後只報 `R14_BASELINE_NOT_LOCKED`。
- R14 direct locked run：PASS（256 paired，約 465 秒）。
- Central runner `--only=cs_he_gameplay_r14`：1/1 PASS（exit code 與 output shape，約 486 秒）。
- R13 direct：PASS，舊 `CsPlayerSmokeLOS.v1` / `CsGameplayDigest.v4` 原值命中。
- R12、R11、R10、R8 direct：全部 PASS；R1～R6 串行全部 exit 0 / PASS。
- `npm run build`：PASS（2643 modules；只有既有 large-chunk warning）。
- `node --check` 與 `git diff --check`：PASS。

判定：**Go / Complete**。R14 以最小 shared-ledger integration 完成真實 HE damage，所有觀察到的
trajectory migration 均通過封版 causal gates；不需要 per-round/subsystem RNG 重構。

本 Sprint 沒有新增賽後 UI，故沒有 R14 新視覺需要宣稱真機完成；既有 live killfeed 的 HE icon
仍未以 browser／手機人工驗收。完成後只建立 local commit，不 push。
