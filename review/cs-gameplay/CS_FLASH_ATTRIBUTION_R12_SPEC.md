# CS Flash Attribution Instrumentation R12 — 封版規格與驗證報告

日期：2026-08-11
狀態：**Complete / Go**
Production gameplay：**未修改**
Calibration：**No-Go**

## 1. 封版決策

R12 只量現行 flash gameplay 的來源與局部 conversion，不加入 player smoke、HE 或 molly
gameplay，也不修 `p.flash` 的 production 語意混用。

- 固定沿用 R1 的 16 seeds、Inferno、`t_aexec` vs `c_std`、現行 `ROSTER`。
- `utilDmg` 維持 **unavailable**；硬寫的 0 不是有效 KPI。
- smoke 未在本輪插 instrumentation；後續只能量 blocked opportunities / episodes，禁止稱
  prevented kills。
- flash counterfactual 重用 production 已抽出的同一顆 duel roll，不新增 RNG、不做 dummy
  consumption，也不重跑「移除 flash 的另一場模擬」。
- 不改 `CsMatchResult.v1`、Store、Progress、runtime/result contract、UI 或 `csHistory`。
- R1～R11 constants / digests 永久保留，不提供 capture / update / rebaseline CLI。

## 2. 現行 flash gameplay read-chain

```text
buy nades[]
  → EXECUTE throw gate
  → immediate target write: enemy.flash = max(enemy.flash, 4)
  → delayed detonation AoE + wall LOS
  → tick decay
  → flashPen = T blinded ? -0.12 : 0 + CT blinded ? +0.12 : 0
  → Pt
  → existing seeded duel roll
```

同時，現行每次 firearm duel 後會直接執行 `attacker.flash=3; defender.flash=3`。這是 R7
已確認的 state conflation；只看 `p.flash>0` 無法知道 penalty 來自 grenade 還是 gun contact。
R12 不改這個 production branch，而是在 memory transform 中重建可驗證的來源 sidecar。

## 3. Instrumentation 架構

`tools/check_cs_flash_attribution_r12.mjs` 以 Vite 建立兩個唯記憶體 variant：

1. **off**：只包裝既有 seeded `rand()` 以記錄 index/value，並匯出真實 simulator。
2. **on**：使用完全相同 RNG wrapper，再加入 round start、decay、throw、flash write、duel、
   gun overwrite 與 round end hooks。

每 seed 跑 `off-1 / off-2 / on-1 / on-2` 四次。完整 sim、完整 RNG stream 與 on event document
都必須逐 seed exact；hook 不容許改變 trajectory。

### Sidecar state

每位選手維持三個 test-only 值：

- `actual`：重建 production `p.flash`；每個 decay/write 都與 production 值做 identity gate。
- `withoutGrenade`：只套用 decay 與 gun overwrite，跳過 immediate/detonation grenade write。
- `sources`：各有效來源及剩餘 tick。

Grenade write 沿用 production `Math.max`；gun branch 是 assignment，不是 max，因此 sidecar 也會
清除舊來源並以 `gun=3` 覆寫。這能精確處理「較長 grenade flash 被後續 gun write 截成 3」的
現行語意，不會把已被 overwrite 的 grenade 錯算成後續 attribution。

### Same-roll counterfactual

在 duel call site 將原本 inline 的 `rand()<Pt` 等價展開為：

```text
roll = rand()       // 同一個既有 call site，仍只抽一次
actual = roll < Pt
counterfactual = roll < Pt_without_grenade
```

`Pt_without_grenade` 由同一個 base Pt 加上 sidecar 的 no-grenade flash penalty，再套原本
`[0.07, 0.93]` clamp。它只回答「這個既有 duel roll 在當下是否翻轉」，不得解讀成移除 flash
後的整場 trajectory、勝率或 balance 結論。

## 4. `CsFlashAttribution.v1`

每 seed 的 evidence 鎖定：

- 完整 trajectory SHA、RNG count / SHA。
- attribution event document SHA。
- flash purchase、throw、write、實際改變 state 的 write。
- duel opportunities、grenade-only opportunities、penalty marginal opportunities。
- same-roll local outcome flips。

事件文件本身包含 purchase、thrower / target、immediate/detonation source、距離、duration、
source class、duel Pt / roll / damage 與 round result。這是 verifier schema，不進 runtime contract。

固定 suite digest：

`265c9f3b79324e395004a726f996772bbba2b4033979ac6ec91600cfb68702a0`

## 5. 固定 16-seed 結果

| 指標 | 數量 | 可安全解讀的語意 |
|---|---:|---|
| flash purchased | 804 | 初始 loadout 中的 flash 數量 |
| flash throws | 196 | 真正進入 throw branch |
| flash writes | 456 | immediate / detonation 進入有效範圍判斷；含 duration 0 或未提高 state |
| effective flash writes | 195 | 實際改變 `p.flash` shadow 值 |
| firearm duel opportunities | 2,133 | 通過 fire gate、讀取 flashPen 的 duel |
| grenade-only opportunities | 62 | 至少一方 `actual>0` 且 no-grenade shadow 為 0 |
| grenade-marginal opportunities | 60 | 移除 grenade 後當下 flash penalty 不同 |
| same-roll outcome flips | 9 | 同一顆既有 roll 對 `Pt` / `Pt_without_grenade` 的局部結果不同 |

Go gate 要求的 non-zero grenade-only coverage 為 **62**，已通過。沒有換 seed、擴大 treatment
或修改 gameplay 來製造 coverage。

## 6. Determinism 與歷史 baseline gates

- Production source SHA：
  `b26ec0947c0b569401ec35f85f02e5efae7a4aaf7baa4381d27587ae235c3482`。
- `rand()` call sites：21，memory off/on 都維持 21。
- off/on 完整 trajectory：16/16 exact。
- off/on RNG count/value stream：16/16 exact。
- on-1/on-2 attribution events：16/16 exact。
- R3 wiring suite：
  `6501b46d7f8c37e78877e9cb9fb17f2e87520a5422f11f2d1880d7078ac29e00`。
- R3 trajectory suite：
  `00fa99fee39a80d85d6fb713fee65c11081266bbd0c6a4dbd113f1720874f2f0`。
- R10 v3 baseline：
  `7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb`；
  仍為 14/256 trajectory changes、1/256 RNG migration、總 delta 1。
- R11 bomb semantics suite與 R1～R8 historical evidence 全部沿用原 constants，未 rebaseline。

## 7. 驗證紀錄

R12 direct verifier：exit 0，輸出 `CS Flash Attribution R12: PASS`。

第一次 13-segment related runner 為 **11/13 PASS**；R10 與 build 都以 exit 134 process abort，
沒有 assertion failure，當時 Windows 約剩 2.7 GB free physical memory，並有 16 個既有 Node
process。這次結果保留為 FAIL，不冒充通過，也未停止可能屬於使用者的 process。

後續隔離與 focused rerun：

- R10 direct：exit 0，完整 256 paired evidence PASS（422 秒）。
- build direct：exit 0，2643 modules transformed（16 秒）。
- focused runner `cs_determinism_migration_r10,build`：2/2 PASS（332 秒）。
- R3 direct：exit 0，544 simulations，兩個固定 digest exact（168 秒）。
- 最新相關 checkpoint：CS23、R1–R6、R8、R10–R12、Progress25、build 共 13/13 PASS。

因此 exit 134 判定為 sequence/environment-dependent process abort；未完全控制其他 Node process，
不宣稱已證明更細的 OS 根因。它沒有導致任何 production 或 verifier gate 放寬。

## 8. Sprint 判定與後續邊界

**R12：Go / Complete。** 現行 flash 已可在不改 trajectory/RNG 的前提下做來源 attribution。

- player smoke LOS integration：**Revise / defer**。若另開 Sprint，必須以 blocked pair
  opportunities / episodes 建立 causal migration gate，預期會合法改變後續 RNG trajectory。
- HE / molly gameplay：**No-Go for R12**；需要 damage/zone、friendly fire、armor、kill/assist
  等產品決策，不能夾帶。
- `utilDmg`：維持 unavailable，不進 UI/rating/calibration。
- learning、synergy、balance/calibration、RNG stream architecture 均未處理。

本 Sprint 沒有 UI 或 production gameplay 改動，因此沒有瀏覽器／手機視覺驗收項。
