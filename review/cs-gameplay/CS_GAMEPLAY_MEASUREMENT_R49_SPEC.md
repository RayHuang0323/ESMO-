# R49 CS 六項 Gameplay Consumer 批次 Measurement 規格

## 目標

R49 沿用 R22 local-causal framework，分開量測 R47/R48 已存在的六個最小 production consumer：視野意識、應變力、戰術理解、溝通、領導力、配合度。六項 evidence 不合併成 team 或 tactical 總分。

## Measurement layers

- Level 1：raw/effective stat、consumer read、threshold / clamp。
- Level 2：固定 scenario 中真正發生的 opportunity，保留 target、role 與 teammate attribution。
- Level 3：immediate action / conversion；action rate 可受 deterministic path amplification 影響，不能直接代替 Level 1/2。
- Level 4：kill、damage、survival、winner 只作 secondary，本 verifier 不把它們當 primary gate。

## 固定輸入與 treatment

- scenario：`inferno / t_aexec / c_std`。
- seeds：R22/R47/R48 同一組 16 fixed seeds。
- 每項 primary target 做 low / baseline / high，單獨修改該 key；`vis` / `adp` 使用 `±10`，`tac` / `com` / `led` / `coo` 使用 `±8`，避免 treatment 自己撞上 `99` raw clamp。
- 每個 primary arm 執行 off、instrumented-on、repeated-on；assert simulator output、event digest、input digest 均相同。
- applicable-role baseline coverage 另行跑，primary baseline row 重用，不降低 primary deterministic gate。

## 六項 KPI

| 項目 | key | primary target | Level 2 | Level 3 |
|---|---|---|---|---|
| 視野意識 | `vis` | `t3/awp` | visible aware contact、read limit、pair admission | aware immediate engage |
| 應變力 | `adp` | `t4/lurker` | low-HP near-enemy opportunity | `ROTATE` route adjustment |
| 戰術理解 | `tac` | `ct1/igl` | IGL tactic route opportunity | direct route execution |
| 溝通 | `com` | `ct5/support` | visible contact | teammate/support handoff |
| 領導力 | `led` | `ct1/igl` | IGL leadership route opportunity | teammate route adoption |
| 配合度 | `coo` | `ct5/support` | visible trade partner | partner aim / `ENGAGE` |

## Readiness policy

- `Calibration Ready - Limited`：Level 1 direct 與可歸因 Level 2 local signal 具 16-seed strict-majority，且 applicable-role coverage 完整；Level 3 path amplification 可保留為 boundary。
- `Measurement Ready / Deferred`：已有真實 L2/L3，但 coverage 不足、threshold dominated、clamp 或 immediate conversion 未達 strict-majority；需第二 consumer 或 threshold-aware pilot 才能升級。
- coverage 為零或 primary 沒有可歸因 action 時為 `Deferred`。

R49 強制一次只執行一項：`node tools/check_cs_gameplay_measurement_r49.mjs --item=<item>`，避免六項昂貴 simulator 同時佔用記憶體。
