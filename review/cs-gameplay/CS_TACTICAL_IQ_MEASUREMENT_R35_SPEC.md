# R35 CS「戰術理解（TacticalIQ）」量測／語意準備度規格

日期：2026-08-14
範圍：CS 原本 16 項素質；只讀 measurement / semantic readiness，不修改 production gameplay、balance、RNG、scenario 或 historical baseline。

## Production read-chain

| 層次 | 目前證據 | 結論 |
|---|---|---|
| raw TacticalIQ | `player.stats.tac`；`POS_PROFILE` 只有 IGL 與 Support profile 讀取 `tac` | role-fit aptitude，非 tactic AI |
| effective TacticalIQ | `persStat(player,"tac")` 可依 personality 計算並 clamp 1–99 | 沒有 direct live consumer |
| state-adjusted | 沒有 tac-specific morale／condition adjustment；`formMul()` 只縮放整體 combat 結果 | 不能稱為 TacticalIQ state read |
| role-fit | `posSkill()` 的 IGL 第 4 項、Support 第 2 項使用 raw tac | 是目前最明確的 consumer |
| live tactic | `tacticEdge()` 讀固定 tactic 的 `type`／`site`，`simulateFps()` 讀固定 route / smoke / molly 配置 | tactic 由輸入資料與模擬器規則決定，不讀玩家 `tac` |
| combat | `combatSkill()` 只間接接收 raw role-fit，沒有 `S("tac")` 或 `persStat(p,"tac")` | 非獨立戰術戰鬥 consumer |

`csPrepData.js` 中 f6 metadata 具有 `boost: ["decision", "adaptability"]`，但 production source 沒有 import/use；因此不是 live read-chain。

## R22 measurement

- 固定 `inferno / t_aexec / c_std`，五個 T-side role：Entry、Rifler、AWP、Lurker、IGL。
- low / baseline / high 為目標玩家 `stats.tac` ±10，其餘 roster 與輸入不變。
- 16 fixed seeds，seed-set SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- 512 simulator executions（每個 treatment 重複 deterministic run）；suite digest `9a8669ae4b23af24ebe4c7c3bfaeee883b28fcb343719ec5b15e03b6a3950215`。

Level 1 只能證明 IGL／Support profile 的直接公式作用；本五 role sweep 中 IGL 具 applicable role-fit，Entry／Rifler／AWP／Lurker 沒有 tac role-fit。Level 2／3 的 tactic switch、site/route selection、rotation、utility、bomb-state response、target/engagement selection 均沒有 TacticalIQ-owned event，coverage 為 0。Level 4 kills、damage、survival、winner 僅 secondary。

沒有 tac-specific clamp 或 threshold；`aggr()` 不讀 tac。主要 readiness boundary 是 semantic/gameplay gap，而非公式單調性。

## Responsibility boundary

- TacticalIQ：看懂局勢、戰術與既定計畫；目前只落在 IGL／Support role-fit。
- Decision：在資訊基礎上選擇並承諾行動；目前不可由 TacticalIQ metadata 推論為實際選擇 consumer。
- Adaptability：情況改變後調整原本做法；目前沒有 action consumer。
- MapAware／視野意識：掌握空間、位置與視線；目前由 `vis`／position 相關路徑負責，非 `tac`。

目前沒有實際 double-counting live consumer；風險是 TacticalIQ 名稱與實際資料／固定 tactic 行為不一致。

## Gate boundary

本輪不新增 tactic AI、不接 raw/effective tac 到新 gameplay、不改 balance/RNG/scenario、不 rebaseline history。結論：**measurement Go / PASS；TacticalIQ calibration No-Go / Deferred（Revise）**。若產品要真正戰術理解，另開 gameplay Sprint，先定義一個可觀測 tactic execution / rotation / utility action，再做 attribution。
