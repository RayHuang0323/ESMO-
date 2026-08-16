# CS Player Smoke LOS Gameplay Integration R13 — 封版規格與驗證報告

- 日期：2026-08-11
- 狀態：**Go / Complete**
- Sprint：CS Player Smoke LOS Gameplay Integration
- Production 改動：一行，將既有 player smoke detonation 寫入既有 `smokes`
- Calibration：**No-Go**

## 1. 封版決策

R13 只讓玩家投擲的 smoke 接入 tactic smoke 已使用的 LOS gameplay read-chain，不建立第二套
smoke 系統，也不改 simulation phase、timing 或 balance constant。

- player smoke 與 tactic smoke 共用 `SMOKE_R=6`、`tl:18`、`age`、`smokeBlocks`、frames 與 renderer。
- 不新增 RNG、不補 dummy RNG、不拆 per-round/subsystem stream。
- 不修改 `CsMatchResult.v1`、Store、Progress、runtime contract 或 persistence。
- 不處理 HE、molly、learning、synergy、balance/calibration。
- 固定沿用 16 seeds × R3 16 treatments，共 256 paired runs；不擴大 scenario scope。
- R1～R12 constants/digests 永久保留，不自動 rebaseline；R13 另建
  `CsGameplayDigest.v4`。

採 causal migration：第一個 player-smoke blocked opportunity 前，R12 與 R13 的非 smoke
trajectory、result 與 RNG 必須 exact；第一個實際 block 後，只有可追溯到既有
`smokeBlocks` 阻斷交火所造成的後續差異才合法。沒有 blocked opportunity 的 run 必須整場
non-smoke zero-diff。

此處 zero-diff 的精確定義是：只移除 R13 必然新增的 player-smoke frame entries 後，所有
其餘 simulation state、frame/highlight、round history、result 與 RNG 完全相同；新增的 smoke
lifecycle 本身則由獨立逐 tick gate 驗證。不能把預期出現的新 smoke state 偽稱為不存在。

## 2. Production read-chain 與最小修法

```text
既有 player smoke 購買／投擲／飛行／引爆
  → smokes.push({ id, pos, tl:18, age:0 })       [R13 唯一新增 production line]
  → 下一個既有 2 秒 tick 的 smokeBlocks(pair)
  → 既有 LOS candidate 被阻擋
  → 既有 frames.smokes
  → 既有 WebGL smoke renderer
```

新增行位於 throwable detonation transition，只複製既有 smoke 的目標位置並加入同一個
`smokes` array。因 detonation 位於當 tick combat 後方，LOS gameplay 依既有 phase order 從
下一個 tick 開始；R13 沒有搬動 phase，也沒有新增 timing/balance constant。

Production source SHA：

- R12：`b26ec0947c0b569401ec35f85f02e5efae7a4aaf7baa4381d27587ae235c3482`
- R13：`bab6776110eac6181bf7b75250061592e2dfc892d4523ea9817cdb15e1cfe341`
- 靜態 `rand()` call sites：`21 → 21`

## 3. `CsPlayerSmokeLOS.v1` 與 causal verifier

`tools/check_cs_player_smoke_los_r13.mjs` 在 memory 中執行真實 R13 source，並用 exact one-line
adapter 還原 byte-exact R12 source 作 paired baseline。adapter 若無法重建上述 R12 SHA，立即
No-Go。

Verifier-only evidence 定義：

- blocked opportunity：原本可進入 LOS 判斷的 enemy pair，被至少一顆 player smoke 幾何阻擋，
  且不是只有 tactic smoke 已足以阻擋的案例；只代表 blocked LOS candidate。
- blocked episode：同 round、同 player pair、連續 2 秒 tick 的 opportunities 合併為一段。
- attribution：由 throw → throwable → spawned smoke 的 ID chain 重建；不新增 production 欄位。
- lifetime：spawn 必須是 `tl:18 / age:0`，並逐 tick 驗證 aging、frame read-chain、自然到期或
  round-end truncation。
- 不估 prevented kills，也不把 blocked opportunity 當成 prevented kill。

Causal gates：

1. candidate 同 seed/treatment 重跑必須 deterministic。
2. R12/R13 RNG call site 數均為 21，且沒有新增 RNG call site。
3. 第一個 verifier candidate opportunity 必須就是 paired baseline `false` / candidate `true`
   的第一個 smoke block。
4. 有 block 的 run 在 boundary 前，exact-tick non-smoke snapshots、frames、highlights、completed
   round history 與 RNG 必須 exact。
5. 無 block 的 run 在移除 player-smoke frame entries 後，整場 sim/result/RNG 必須 exact；
   player-smoke lifecycle 仍需獨立通過 identity gate。
6. 任一 pre-boundary diff、額外 RNG site、無法還原 R12 source 或無法追溯到 `smokeBlocks`
   都立即 No-Go。

## 4. Root-cause debugging 記錄

第一版 causal verifier 在 `seed=3978742910` 報告 frame 132 的 `_hitters` 長度不同，看似早於
第一個 round 3/sec 36 block。逐 tick 診斷證明這不是 gameplay pre-boundary drift：production
frame 對 player 只做 shallow copy，nested `_hitters` array 仍與 live player 共用；boundary 後的
`push()` 會回頭改寫先前保存的 frame object。

修正只在 verifier hook：每個 tick 當場 deep-clone snapshot，再作完整欄位比較；沒有修改
production，也沒有排除 `_hitters` 或掩蓋 digest 差異。這使 gate 比「模擬結束後再讀舊 frame
reference」更精確。

## 5. Locked evidence

| Evidence | Locked value |
|---|---:|
| `CsPlayerSmokeLOS.v1` | `effe21748fe9e4a31d293332aa0c7f65b2c62a0bcbc653c60167ac9087831d67` |
| `CsGameplayDigest.v4` | `01ef345a70a3c3ae274b65c54cc19a68b80907fb2fd81495ff7855096d8d2289` |
| Matrix paired runs | 256 |
| Runs with blocked opportunities | 205 |
| Zero-block runs | 51 |

Neutral 16-seed coverage：80 smoke throws、79 detonations/spawns、479 blocked opportunities、
96 blocked episodes、66 natural expiries、13 round-end truncations。所有 attribution/lifetime
資料都只存在 verifier evidence，不進 runtime result contract。

## 6. 歷史 evidence 保護

所有 historical verifier 先以 exact R13→R12 adapter 還原舊 source，再串既有
R11→R10→historical adapters。沒有改任何舊 expected constant：

- R3 wiring：`6501b46d7f8c37e78877e9cb9fb17f2e87520a5422f11f2d1880d7078ac29e00`
- R3 trajectory：`00fa99fee39a80d85d6fb713fee65c11081266bbd0c6a4dbd113f1720874f2f0`
- R10 `CsGameplayDigest.v3`：`7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb`
- R11 semantics：`64a16a36092976b2e433fa5e276e03f2987ec35508b658bf5ec17c41b032ed28`
- R12 flash attribution：`265c9f3b79324e395004a726f996772bbba2b4033979ac6ec91600cfb68702a0`

## 7. 驗證結果

- R13 direct：PASS，256 paired matrix、205 block / 51 zero-block，約 653 秒。
- R1/R2/R4/R5/R6/R8/R11/R12 focused historical runner：8/8 PASS。
- R3 direct：544 simulations PASS。一次 wrapper 寫入 `tools/.verify-state.json` 遭 EPERM；child
  assertions 已通過，之後 direct rerun exit 0，不把 wrapper failure 改寫成 PASS。
- R10 direct：256 paired historical migration PASS；既有 14 trajectory changes 與唯一合法
  `2005 → 2004` RNG delta 保持原證據。
- CS23：28/28 PASS。
- Progress25：33/33 PASS；使用 `ESMO_VERIFY_FLAT=1`，未重跑 balance/tactic scope。
- `npm run build`：PASS（2643 modules）。
- `node --check`：R13、新 adapter、十支 historical verifier 與 runner 全部 PASS。

一次誤啟動的 nested tactic child 在發現超出 scope 後立即停止，之後以 flat Progress25 重跑；
沒有修改 balance production 或 evidence。

## 8. Go 判定與邊界

R13 判定 **Go / Complete**：player smoke 已進入既有 LOS gameplay，且所有差異符合已封版的
causal migration rule；不需要 per-round/subsystem RNG 重構。

仍未處理：HE、molly、learning、synergy、balance/calibration、`utilDmg`。Calibration 維持
No-Go。frame/renderer read-chain 已由 source 與 verifier 證明，但本 Sprint 未以 browser 或手機
真機人工驗證 WebGL 視覺效果，不能宣稱視覺／FPS／觸控已實測。

本 Sprint 完成後只建立 local commit，不 push。
