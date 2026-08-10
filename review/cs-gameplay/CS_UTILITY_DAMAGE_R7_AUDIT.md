# CS Utility Damage Audit R7 — 唯讀 read-chain 結論

日期：2026-08-10
狀態：**Audit complete／Instrumentation No-Go**
Calibration：**No-Go**

## 1. 問題

正式 CS player result 固定輸出 `utilDmg:0`。R7 要判斷這是：

- A. 真實 utility damage 已存在，但 result 漏收；或
- B/C. 根本沒有可歸因的 utility damage gameplay branch。

本輪只讀 `EsportsFPS3D.jsx`、`CsMatchResult.v1` adapter 與現行 UI；未修改任何程式、
verifier、RNG、數值、契約或 expected digest。

## 2. 權威寫入點

### Damage

`roundDmg[playerId]`、`player.dmgDealt` 與 `defender.hp -= damage` 都只有 firearm duel
同一個寫入點。HE、molly、flash、smoke 的 throw/detonate branch 都沒有寫入任何一項。

因此：

- ADR/rating 的 damage 全是現行 duel rolled damage；
- `utilDmg:0` 沒有漏掉某個既有 utility damage accumulator；
- 若只補 collector 或把視覺爆炸次數換算成 damage，會創造第二套假 gameplay。

### Result / contract / UI

- engine player row 硬寫 `utilDmg:0`；
- `CsMatchResult.v1` adapter 不轉出 `utilDmg`；
-現行 `CsResultScreen` 也不顯示它。

所以目前沒有玩家可見的「utility damage = 0」假數字，但 engine 欄位仍容易讓後續開發者誤以為
utility damage 已實作。

## 3. 四類 utility 真實狀態

| Utility | 購買/投擲/呈現 | 真 gameplay | Damage / attribution | 分類 |
|---|---|---|---|---|
| flash | 會買、會投擲、飛行/爆閃呈現 | 立即指定 enemy + detonation AoE 都會寫 `p.flash`；`flashPen` 改 Pt | 無 thrower attribution、無 flash assist、無 damage | **B** attribution instrumentation 缺口；另有 state conflation |
| smoke | 會買、會投擲、會呈現 throwable | player-thrown smoke detonation沒有 `smokes.push`，不阻 LOS；只有 tactic 在 sec 18 直接建立 smoke，會進 `smokeBlocks` | tactic smoke 無 player source；無 damage | **C** player smoke gameplay 未接；**E** tactic smoke 窄但有效 |
| HE | 會買、會投擲、顯示 cast/爆閃 | detonation 沒有 HE branch | 無 HP/roundDmg/utilDmg | **C** gameplay/design 缺口 |
| molly | 會買、會投擲、顯示爆閃；tactic 在 sec 24 建火焰 | player/tactic molly 都只老化與 render，沒有 damage、zone gate 或 path effect | 無 HP/roundDmg/utilDmg | **C** gameplay/design 缺口 |

### `p.flash` 不是乾淨的 flashbang state

同一欄位有三種寫入來源：

1. flash 投擲時立即指定 nearby enemy；
2. flash detonation AoE；
3. **每一次 firearm duel 後，attacker 與 defender 都被設為 `flash=3`**。

`flashPen` 下一 tick 只看 `p.flash>0`，沒有 source/type。故即使新增 flash opportunity counter，
也無法把 Pt 變化可靠歸因給 grenade。這是 **A/C 類 gameplay-state 語意混用**；若原意是
suppression，應拆成獨立欄位；若不是，就是 gun hit 污染 flash gameplay。兩種修法都會改
gameplay digest，本輪不決定、不修改。

## 4. 與 16 項素質的關係

- grenade 購買與 throw gate 只讀經濟、state、距離與 RNG；沒有讀 16 項素質。
- flash 的 Pt effect 只讀被污染的 `p.flash` boolean；沒有 thrower skill 或 utility conversion stat。
- tactic smoke 是 tactic config 的固定 sec 18 event，沒有 player attribution。

所以 `utilDmg` 不是任何一項素質目前可 calibration 的作用點。不得把 `tacticalIQ`、`comms`、
`decision` 等名稱直覺映成 utility 效果；實作沒有該 read-chain。

## 5. 問題分類

| 項目 | 分類 | 結論 |
|---|---|---|
| `utilDmg:0` | **C** gameplay/design 缺口；非 A 漏收 | 沒有 utility damage branch，0 是硬寫 placeholder |
| HE/molly | **C** | presentation/economy 存在，damage/zone gameplay 不存在 |
| player smoke | **C** | 投擲物存在，但不建立阻 LOS smoke |
| tactic smoke | **E** | 真正阻 LOS，但情境固定、無 player attribution |
| flash attribution | **B** | 有 gameplay effect，缺 opportunity/source/conversion KPI |
| gun hit 與 flash 共用 state | **A/C** | 真實 state conflation；產品語意需先決定，禁止直接改 |
| 把固定 0 稱 measurement bug | **D** | R7 更正：不是少收既有 damage，而是不存在 damage gameplay |

## 6. Instrumentation 判定

**No-Go。** 目前新增 `utilDmg` instrumentation 只能量：購買、throw、視覺 detonation，不能量
不存在的 damage conversion。這會重蹈「summary counter ≠ gameplay outcome」。

安全可量的下一步只有 flash/smoke opportunity audit，但必須先把 `p.flash` source conflation
與 tactic-vs-player attribution 的產品語意決定清楚；否則 KPI 本身無法成立。

## 7. 建議後續順序

1. 保持 `utilDmg` 不進 UI、不用於 rating/calibration。
2. 若產品要 utility gameplay，先封版 Utility Gameplay Contract：thrower、type、detonation、
   affected target、effect source、effective damage/zone outcome；再另開 digest-breaking Sprint。
3. 若產品不打算做 utility damage，另案決定 engine placeholder 應維持 0、改 null 或移除；
   這牽涉 result/contract 相容，不在本輪處理。
4. 在任何 gameplay calibration 前，優先處理已普遍污染 outcome 的 ADR overkill；utility
   不應搶先成為 calibration pilot。

## 8. 驗證證據

- 正式 FPS source SHA-256：
  `5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。
- `roundDmg`／`dmgDealt`／HP damage 寫入：只存在 firearm duel 一處。
- throwable detonation gameplay switch：只有 flash branch。
- player smoke 對 `smokes` 的寫入：0；tactic smoke 寫入：1。
- molly damage/zone branch：0；只有 tactic list aging/render。
- 本輪 source/tools/contract/UI git diff：0；`git diff --check` PASS。

R7 是唯讀 audit，沒有新增 verifier，也沒有以「沒有程式改動」冒充 runtime test。
