# R49 CS 六項 Gameplay Consumer 批次 Measurement 報告

## 結論摘要

六項均完成獨立 16-seed measurement，沒有修改 production。只有視野意識達到 `Calibration Ready - Limited`；應變力、戰術理解、溝通、領導力、配合度維持 `Measurement Ready / Deferred`。五項都有真實 Level 2/3 evidence，但尚不足以宣告可直接 calibration。

Verifier：`tools/check_cs_gameplay_measurement_r49.mjs --item=<item>`；每項獨立 process、固定 `inferno/t_aexec/c_std`、off/on/repeated-on，沒有並行昂貴 Node。

## 六項獨立 evidence

### 1. 視野意識 `vis` — Calibration Ready - Limited

- primary：`t3 / awp`；levels `72 / 82 / 92`，raw/effective direct monotonic `16/16`。
- baseline：aware contact opportunity `843`、immediate actions `116`、conversion `13.76%`。
- Level 2 read-limit local monotonic：`16/16`；low→baseline `-2.8`、high→baseline `+2.8`。
- Level 3 opportunity/action 的 seed direction 只有 `2/16`，保留為 fixed-seed path amplification；沒有用下游 action volume 否決 direct/read-limit evidence。
- applicable roles：Entry `1078/151`、Rifler `1918/150`、AWP `843/116`、Lurker `457/61`、IGL `2350/147`（opportunity/action）。五角色均有 coverage。
- raw/effective clamp：`0/3`；changed seeds：`32/32`。
- primary digest：`17db827b86f93869bebfeed76da8d074d94b052eed55e52e92acd28630cef236`。
- role digest：`3b9f630d43e2c90cfcd36acf196d71f2b55ea666b0b54c108a38e4f72706ff22`。
- suite digest：`8fe48b1b7a44e1b129cea91c0160bbdd4a313a5e49e1a61c3421fc4c77dc2977`。

### 2. 應變力 `adp` — Measurement Ready / Deferred

- primary：`t4 / lurker`；levels `73 / 83 / 93`，direct monotonic `16/16`。
- baseline：low-HP near-enemy opportunity `7`、`ROTATE` adjustments `6`、conversion `85.71%`。
- opportunity direction `1/16`、action direction `2/16`；`adp` threshold `80` crossed，high/baseline action 已飽和。
- applicable roles：Entry `0/0`、Rifler `0/0`、AWP `150/150`、Lurker `7/6`、IGL `57/56`；只有 3/5 role 有 coverage。
- raw/effective clamp：`0/3`；changed seeds：`32/32`。
- primary digest：`046a27c4ae3a1e37385e4ce41f3506db0a110acd3bbcc6802d70b8ab4fd33ea6`。
- role digest：`3b9f630d43e2c90cfcd36acf196d71f2b55ea666b0b54c108a38e4f72706ff22`。
- suite digest：`e2cfc9f1732c1980422a7a9504f182c501953c28a5e125ab3447c626cd38332f`。

### 3. 戰術理解 `tac` — Measurement Ready / Deferred

- primary：`ct1 / igl`；levels `82 / 90 / 98`，direct monotonic `16/16`。
- baseline：IGL tactic opportunity `149`、direct route execution `149`、conversion `100%`。
- action conversion direction `16/16`，但 `tac >= 90` threshold 使 baseline/high 飽和；opportunity 本身與 stat 無關，為 `0/16`。
- applicable role：只有 IGL，coverage `149/149`；尚未覆蓋 CT/T 多角色 tactic execution。
- raw/effective clamp：`0/3`；changed seeds：`32/32`。
- primary digest：`90ad55e1469d8b434968e3523363b792f3870e8947c1b76474615fb9c9be262c`。
- role digest：`e13cb5c9bb9fd06a0efa407451be1ba264804452b9cc860fcb996aee6a9c6abc`。
- suite digest：`ef7f051c5fe8462108c7468d2f03df88ac1849d9513c35b0b94f536658cbf09d`。

### 4. 溝通 `com` — Measurement Ready / Deferred

- primary：`ct5 / support`；levels `82 / 90 / 98`，direct monotonic `16/16`。
- baseline：visible contact opportunity `24`、information handoff `24`、conversion `100%`。
- action conversion direction `15/16`；`com >= 88` threshold crossed，baseline/high handoff 飽和。
- role coverage：CT IGL `0/0`、AWP `103/0`、Rifler `3/0`、Entry `19/0`、Support `24/24`；4/5 target roles 有 contact，但只有 support target 產生 handoff。
- raw/effective clamp：`0/3`；changed seeds：`32/32`。
- primary digest：`716d2a7988d442e94280974c0dcc3eff84f0970daad80342463e4a01eef85dbd`。
- role digest：`e75edc0106cdcf5d0c822652d5acaf689c5d4d91a44ebc596d62a06cfdfcae98`。
- suite digest：`2ab155ce5466c3e6b230e66521e84cd1930572f4968d7779e2ac626bae97b513`。

### 5. 領導力 `led` — Measurement Ready / Deferred

- primary：`ct1 / igl`；raw levels `82 / 90 / 98`，effective `88 / 96 / 99`，direct monotonic `16/16`。
- baseline：IGL leadership opportunity `596`、teammate route adoption `596`、conversion `100%`。
- action conversion direction `16/16`；`led >= 90` threshold dominated。
- teammate role attribution：AWP、Entry、Rifler、Support 均有 route adoption；applicable leader role 只有 IGL。
- effective upper clamp：`1/3`（high `99`）；raw clamp `0/3`；changed seeds：`32/32`。
- primary digest：`bdef2ff1c3601b79148e32075ec073b2e2990daf00b8158329ceba8589e21be8`。
- role digest：`e13cb5c9bb9fd06a0efa407451be1ba264804452b9cc860fcb996aee6a9c6abc`。
- suite digest：`cdbe76284569b32e5678f4d24ea9927fc5adc7571663cddbf5a5a664a88c2125`。

### 6. 配合度 `coo` — Measurement Ready / Deferred

- primary：`ct5 / support`；levels `82 / 90 / 98`，direct monotonic `16/16`。
- baseline：visible trade opportunity `231`、partner aim/`ENGAGE` actions `231`、conversion `100%`。
- action conversion direction `16/16`；`coo >= 90` threshold dominated；opportunity direction `1/16`，受既有 combat path 影響。
- partner role attribution：Entry、IGL、Rifler、Support 均有 partner evidence；AWP 在 broader observed role set 中出現。
- raw/effective clamp：`0/3`；changed seeds：`32/32`。
- primary digest：`fd5801b9a85fa51d8893c26588c8cea3b66dd8e7288373a3102844e6dfc5294b`。
- role digest：`188de313d19f6dadda85a8bc120f67e9f93d4c4bf8844b190ed51631f58a3287`。
- suite digest：`644f0dccc7202a0e8db68e552a914cf0210258f3f997ff14ef1ff132345b0c0b`。

## Overlap / amplification review

- 沒有新增第二 consumer，也沒有跨 stat bonus、重複 damage 或新增 RNG。
- MapAware 的 Level 3 action 只有 `2/16` strict-majority，明確標記 path amplification；只升為 limited local calibration，不宣告完整視野 identity。
- Adaptability 受既有 `aggr < 0.82` 與 `adp >= 80` gate 共同限制；TacticalIQ、Comms、Leadership、Synergy 都是 threshold action saturation。
- Leadership high effective `99` clamp 是 observed boundary，不調 coefficient、不 rebaseline。

## 六項與 CS 16 項狀態

本輪六項：`1` 項 Calibration Ready - Limited（視野意識）、`5` 項 Measurement Ready / Deferred（應變力、戰術理解、溝通、領導力、配合度）。

連同既有九項 calibration baseline：

- Calibration Ready：4（反應力、準確度、APM／操作量、勇氣）。
- Calibration Ready - Limited：6（走位、決策力、Clutch／抗壓、專注力、Resilience／韌性、視野意識）。
- Measurement Ready / Deferred：5（應變力、戰術理解、溝通、領導力、配合度）。
- Learning lifecycle-only：1（學習力）。

## 下一步與 verdict

- 需要第二階段 Gameplay Identity Sprint：應變力、戰術理解、溝通、領導力、配合度；目標是跨 role / 非 threshold action，而不是調現有 coefficient。
- 視野意識可進 limited calibration pilot；若要完整 identity，仍需 utility danger、bomb awareness 或 team shared-awareness consumer。
- 不建議繼續把五項 threshold-only consumer 直接拿去做 balance sweep；下一步優先第二階段 Gameplay Identity Sprint。

R49：**Go（measurement batch completed）**；production calibration patch：**No-Go**；五項 calibration upgrade：**Revise / Deferred**。
