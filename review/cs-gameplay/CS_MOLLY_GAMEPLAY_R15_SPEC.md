# CS Molly Gameplay Integration R15

日期：2026-08-11
狀態：**Go / Complete（local only，未 push）**

## 1. 封版範圍

R15 只把既有 player-thrown molly 的 visual detonation 接入最小真實 zone DoT：

- `MOLLY_R=4`
- `MOLLY_TL=8`
- 每個既有 2 秒 tick 固定 `10 damage`
- 無 falloff，不套 armor modifier
- 牆體阻擋，只傷敵人
- detonation 後下一個既有 tick 才開始判定 damage
- 多個 player molly 依既有 `mollys` array order deterministic additive
- 不新增 RNG，不補 dummy RNG

以上數值是 **R15 functional baseline**，不代表完成 balance calibration。Radius、lifetime、
damage、stacking 或 purchase/throw rate 的調整都必須另開 Sprint，重新評估 causal migration。
Calibration 維持 No-Go。

R15 **不讓 tactic molly 造成傷害**。Tactic molly 沒有 player owner，維持既有 fire-zone frame／
renderer；禁止虛構 owner 或 team-level damage semantics。

不在本 Sprint：route avoidance、繞路、主動撤離、stacking balance、HE 調整、learning、synergy、
balance/calibration、RNG stream 重構，以及 `CsMatchResult.v1`／Store／Progress／`csHistory`／
賽後 UI 擴充。

## 2. Production read-chain

```text
既有購買／player throw
  → round-local throwerByNadeId[nadeId]
  → 既有 throwable flight / detonation
  → mollys.push({ id: `m${nadeId}`, pos, tl: 8 })
  → 下一個既有 tick 起，依 mollys array order 掃描
       ├─ 只接受 id 以 mnd 開頭的 player zone
       ├─ sourceId → throwerByNadeId → player owner
       └─ live enemy + d < 4 + wall-clear
  → shared applyDamage(10, "molly")
       ├─ _hitters / effectiveDamage / roundDmg
       └─ roundUtilDmg（HE + molly utility subset）
  → shared finalizeKill()（若死亡）
       ├─ kill / death / assist / first kill / multikill
       ├─ dropped gun / bomb drop / KAST inputs
       └─ existing default utility kill economy（$300）
  → engine raw result players[].utilDmg
```

Player zone 與 tactic visual zone 共用既有 `mollys` lifetime、frames 與 renderer，沒有第二套
zone collection。Owner 只由 round-local throwable map 還原，不新增 frame、runtime 或 result
contract 欄位。Live killfeed 對 `gun:"molly"` 顯示 fire icon。

`utilDmg` 現在是 engine raw result 中 HE + player-molly 的 effective damage；
`CsMatchResult.v1` 仍依既有 schema 過濾該欄，Store、Progress、reward、`csHistory` 與賽後 UI
不讀取，也不回算歷史資料。

## 3. Tick、damage 與 overlap semantics

Player molly 在 detonation tick 的 frame 以 `tl=8` 出現。因 zone processor 位於既有 throwable
detonation phase 之前，同一 tick 不會傷人；下一個 2 秒 tick 以 `tl=8` 首次判定，之後沿用既有
aging 逐 tick `8→1`，round 提早結束時自然截斷。

每個存活敵人：

```text
d >= 4 或 lineBlocked → 0
damage = 10
effectiveDamage = min(10, hpBefore)
```

Armor 不改變 `damage=10`。只有 effective damage 寫入共用 `roundDmg` 與 utility subset，因此
overkill 不灌高 ADR／utilDmg。多 zone 同 tick 依 `mollys.forEach` 與 player array order 逐筆套用；
若第一筆已造成死亡，後續 zone 依既有 dead gate 不再重複傷害。沒有 path denial 或移動決策。

固定矩陣本次沒有自然產生同 target／同 tick 的 overlap damage（coverage=0）；verifier 仍鎖定
array-order source shape、每筆 event 的 zone/target order 與 deterministic rerun。此結果不能解讀為
stacking 已 balance-tested。

## 4. 雙邊界 causal determinism migration

R15 使用兩層 boundary：

1. 第一個 player molly spawn 前，gameplay frames、detonation state、result 與 RNG 完整 exact。
2. Spawn 後至第一筆正值 player-molly effective damage 前，只允許 player-molly lifecycle／frame
   entry；移除該 entry 後的 non-molly phase、frames、damage ledger 與 RNG 必須 exact。
3. 第一筆有效 DoT 後，才允許可追溯至該 damage 的 HP、death、combat state、result、trajectory
   與後續 RNG consumption 差異。
4. 有 detonation 但無有效 damage 的 run，移除 player-molly lifecycle/frame 後，non-molly
   gameplay/result/RNG 必須整場 exact。
5. 無 player detonation 的 run，整場 sim/result/RNG 完整 exact。
6. Production 與 historical source 的靜態 `rand()` call sites 都必須為 `21`；任一新 RNG、
   pre-boundary gameplay diff、tactic-molly damage 或無法歸因差異立即 No-Go。

固定沿用 16 seeds × R3 16 treatments，共 256 paired runs，不擴大 scenario scope。

## 5. Verifier-first 與 locked evidence

`tools/check_cs_molly_gameplay_r15.mjs` 先在 canonical R14 production 上建 memory candidate，完整跑完
256 pairs 與 causal/accounting gates，最後只以 `PRODUCTION_MOLLY_NOT_INTEGRATED` 預期紅燈停止。
Production patch 的 canonical LF source SHA 與該 candidate byte-exact 相同，才人工鎖定 evidence；
沒有 capture/update/rebaseline CLI。

| Evidence | Locked value |
|---|---:|
| R15 canonical source | `7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89` |
| `CsMollyGameplay.v1` | `362d1095dcd3e06d7fcc79b26e920a444c22a50976c5cd03e5eec1771a5a54c9` |
| `CsGameplayDigest.v6` | `e0622480e1b1a833098c8186b0dcef00fd7cf69ee880b1b4ac3b45189f97a8ae` |
| Matrix paired runs | 256 |
| Runs without player detonation | 137 |
| Detonation but no effective damage | 98 |
| Runs with effective molly damage | 21 |

Matrix coverage：164 throws、153 detonations/spawns、1,205 player-zone ticks、78 damage events、
774 effective damage、1 kill、1 assist；另觀測 20,761 tactic visual-zone ticks且全部保持 non-gameplay。
Coverage 只證明 functional read-chain 與 ledger 被走到，不是 balance KPI。

## 6. Historical evidence protection

R15 新增唯讀 `tools/cs_r15_legacy_source.mjs`，只接受固定 R15 source SHA，精確移除六個 R15
integration 片段後必須還原 canonical R14 SHA：
`943cd562019f966d43bde9aa7aa05bc41cbcc2cda25a32a2556fe08bdf470720`。
之後才串既有 R14→R13→R12→R10→R8 adapters。任何 source shape 或 SHA 不符立即停止。

R1～R14 expected constants/digests 完全未修改。代表性重驗：

- R8 v1：`546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`
- R10 v3：`7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb`
- R11 semantics：`64a16a36092976b2e433fa5e276e03f2987ec35508b658bf5ec17c41b032ed28`
- R12 flash：`265c9f3b79324e395004a726f996772bbba2b4033979ac6ec91600cfb68702a0`
- R13 v4：`01ef345a70a3c3ae274b65c54cc19a68b80907fb2fd81495ff7855096d8d2289`
- R14 v5：`46952997a395f76980da25273e67d7f1e03b912247c2d5593fcfba205cd3f545`

## 7. 驗證結果與判定

- Verifier-first red：完整 gates 後只報 `PRODUCTION_MOLLY_NOT_INTEGRATED`（約 258 秒）。
- R15 direct locked run：PASS（256 paired，約 243 秒）。
- Central runner `--only=cs_molly_gameplay_r15`：1/1 PASS（exit code/output shape，約 212 秒）。
- R13 direct：PASS，v4 constants 原值命中（約 488 秒）。
- R14 direct：PASS，v5 constants 原值命中（約 464 秒）。
- R10 direct：PASS，v3 constants 原值命中（約 337 秒）。
- R1～R6、R8、R11、R12：全部 exit 0 / PASS；CS23：28/28 PASS。
- `npm run build`：PASS（2643 modules；只有既有 large-chunk warning）。
- `node --check` 與 `git diff --check`：PASS。

曾嘗試並行執行 R13/R14，但兩個 middleware Vite instance 發生 WebSocket port conflict 且 timeout；
該次沒有計為成功。兩支之後各自序列重跑並以 exit 0 / 完整 output shape PASS。

判定：**Go / Complete**。R15 以最小 shared-ledger integration 完成 player molly DoT，所有觀察到的
trajectory migration 均通過雙邊界 causal gates；沒有證據需要 per-round/subsystem RNG 重構。

本 Sprint 沒有新增賽後 UI；live killfeed fire icon、既有 fire-zone WebGL renderer、手機視覺／FPS／
觸控均未人工真機驗收。完成後只建立 local commit，不 push。
