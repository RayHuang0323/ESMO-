# R34 CS「應變力（Adaptability）」量測／校準準備度規格

日期：2026-08-14
範圍：CS 原本 16 項素質；只讀量測，不修改 production gameplay、balance、RNG、scenario 或歷史基線。

## 1. 產品語意與 production read-chain

本輪以 production source `src/battle/fps/EsportsFPS3D.jsx` 為唯一程式證據，並以 R22 Local Causal Calibration Framework 分層。

| 層次 | 目前證據 | 邊界 |
|---|---|---|
| raw Adaptability | `player.stats.adp`；`POS_PROFILE` 只有 `igl` 與 `lurker` 讀取 `adp`，作角色適性公式中的一項 | 是角色適性，不是完整的「遇變則改」行為 |
| effective Adaptability | `persStat(player, "adp")` 會套用 personality boost/nerf 並 clamp 到 1–99；目前只有 `grinder -4`、`creative +6` 會改 `adp` | 沒有 live gameplay consumer 讀取這個 effective 值 |
| state-adjusted Adaptability | 未發現 `morale`／`condition` 專門調整 `adp`；`formMul()` 只對整體 `combatSkill` 結果做狀態倍率 | 不能把全局狀態倍率誤稱為 Adaptability consumer |
| role-fit consumer | `posSkill()` 的 IGL／Lurker profile 讀取 raw `adp`；IGL 位於第 5 項、Lurker 位於第 4 項 | 只影響角色適性分數及其間接 combat 輸出 |
| combat consumer | `combatSkill()` 使用 raw `posSkill()` role-fit；機械核心沒有 `S("adp")` 或 `persStat(p,"adp")` | 沒有獨立的應變戰鬥行為 |
| other declarations | `FPS_W.adp=0.8` 雖宣告在全域權重表，但 `adp` 不在 `_mechKeys`，也不在 `ovr()` 的 live read-chain；`csPrepData` 的 tactic metadata 不是 runtime import | 不是 live action read-chain |

靜態 audit 未發現 Adaptability 目前控制 target／engagement choice、戰術切換、攻守轉換、敵方行為回應、route/reposition、retreat/re-engage、utility timing、bomb-state response、直接 `aggr` 或新的 AI branch。

## 2. R22 量測設計

- 固定 map／tactic：`inferno / t_aexec / c_std`。
- 五個 T-side role：`entry / rifler / awp / lurker / igl`。
- 固定 16 seeds：seed-set SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- treatment：只將目標玩家 `stats.adp` 設為 baseline−10、baseline、baseline+10；其餘 roster／輸入不變。
- verifier 執行重複 deterministic run，總計 512 次 simulator executions（5 role × 3 level × 16 seed × 2 repeat，加上 focused IGL 16 seed × 2 repeat）；suite digest `0d58819fb3cd79f0518c8e7925ae12758913a58c82707ffb1227f34c15b0ffdb`。

四層解讀：

1. Level 1：可觀察到 IGL／Lurker raw role-fit 的單調公式差異，也可觀察 personality effective value 的公式差異。
2. Level 2：沒有由 `adp` 歸因的 local action opportunity；模擬中的一般交火 opportunity 不等於應變 opportunity。
3. Level 3：沒有 tactic switch、reposition、retreat/re-engage、utility/bomb response 等 Adaptability action/conversion。
4. Level 4：kills、damage、survival、winner 僅保存為 secondary observation，不作 calibration gate；沒有把整場結果倒推為 Adaptability 因果。

strict-majority 只對存在 role-fit consumer 的 IGL／Lurker 解讀為直接公式證據；Entry／Rifler／AWP 沒有 `adp` role-fit consumer。effective 值雖可計算，因沒有 live consumer，不能宣稱 gameplay strict-majority。±10 treatment 未觸發 adp-specific clamp 或 threshold；`aggr` 不讀 `adp`，所以不存在應變力 threshold crossing。

## 3. 與其他素質的責任邊界

- TacticalIQ：產品概念上偏「看懂局勢與計畫」，但目前沒有與 `adp` 共用的 live consumer；不能由 tactic metadata 推論 runtime 應變行為。
- Decision：偏「做選擇並承諾行動」；目前沒有與 `adp` 共用的 target、retreat、utility 或 bomb consumer。
- MapAware／視野意識：Lurker profile 同時使用 `vis`，屬角色適性鄰接，不是 Adaptability 的直接讀取。
- Learning：跨場成長／適應速度；目前沒有 cross-match learning read-chain 連到 `adp`。

因此目前主要風險不是兩個 stat 在同一公式重複加成，而是 Adaptability 的產品名稱比實際 gameplay read-chain 完整。若未來要加入真正的情境調整，應另開 gameplay Sprint，先定義一個可觀測事件（例如 tactic switch 或 route/reposition response），再建立 action attribution；不得在本量測 Sprint 內偷偷補功能。

## 4. Gate 與限制

`tools/check_cs_adaptability_measurement_r34.mjs` 使用可逆的 memory-only Vite transform 暴露測試 API；production source SHA、RNG call-site 數、輸入 roster 與 scenario 均鎖定。verifier 不寫入 production、scenario、歷史 evidence 或 contracts。

本規格不允許 balance calibration、RNG、scenario 修改、historical rebaseline 或大型 adaptation AI。量測結論為 **Measurement Go / PASS**；完整 Adaptability gameplay calibration 為 **No-Go / Deferred（Revise）**，直到有明確且非重疊的 live action consumer。
