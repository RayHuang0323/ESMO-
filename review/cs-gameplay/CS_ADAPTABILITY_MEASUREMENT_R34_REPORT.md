# R34 CS「應變力（Adaptability）」量測報告

日期：2026-08-14
verifier：`tools/check_cs_adaptability_measurement_r34.mjs`
suite：`CsAdaptabilityMeasurementSuite.v1`
framework：`R22-local-causal-v1`

## 結論

Adaptability 目前不是完整的戰術應變系統。它實際上只在 IGL／Lurker 的 raw role-fit 公式中出現；`persStat(adp)` 的 personality-adjusted 值可以計算，但目前沒有 live gameplay consumer。雖然 `FPS_W` 宣告了 `adp` 權重，`_mechKeys` 與 `ovr()` 都沒有讀它，因此不形成額外 consumer。它沒有直接控制戰術切換、攻守轉換、敵方行為調整、route/reposition、retreat/re-engage、utility、bomb-state、target selection 或 `aggr`。

所以本輪量測本身 **Go / PASS**，但進入 Adaptability balance calibration 為 **No-Go / Deferred（Revise）**。原因是缺少可歸因的 Level 2／Level 3 應變行為，不是數值尚未調好。

## 五個 role

| role | raw role-fit | effective / personality | live action | readiness |
|---|---|---|---|---|
| Entry | 無 `adp` profile 項 | 可計算，但無 consumer | 無 | Deferred |
| Rifler | 無 `adp` profile 項 | 可計算，但無 consumer | 無 | Deferred |
| AWP | 無 `adp` profile 項 | 可計算，但無 consumer | 無 | Deferred |
| Lurker | `adp` 為 profile 第 4 項，間接進 role-fit/combat | effective 可計算，但 combat 沒有直接 effective `adp` 讀取 | 無 | Deferred |
| IGL | `adp` 為 profile 第 5 項，間接進 role-fit/combat | effective 可計算，但 combat 沒有直接 effective `adp` 讀取 | 無 | Deferred |

目前 baseline roster 的五名 target personality 不會改動 `adp`；production 仍保留 `grinder -4`、`creative +6` 的 generic personality rule，但它沒有因此變成 live 應變行為。

## R22 量測結果

- 16 fixed seeds；seed-set SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- low / baseline / high；五 role；總計 512 simulator executions（含 repeated run）。
- repeated deterministic digest：PASS；suite digest `0d58819fb3cd79f0518c8e7925ae12758913a58c82707ffb1227f34c15b0ffdb`。
- Level 1 direct role-fit：IGL／Lurker 有直接單調公式證據；其他 role 為 not applicable。
- Level 2 local opportunity、Level 3 immediate conversion：沒有 Adaptability-owned action，coverage 為 0；不能把一般交火或整場結果冒充應變證據。
- Level 4：kills／damage／survival／winner 只作 secondary observation。
- clamp／saturation：本 treatment band 未觸發 adp-specific clamp；沒有 adp-driven `aggr` threshold crossing。

## `/review`

Blocking：無。
Non-blocking：IGL／Lurker 才有 role-fit coverage；沒有 CT-side 或真正情境變化下的應變 action；目前不能進 balance calibration。
建議的後續 Sprint（若產品要完整應變）：另立 feature／gameplay Sprint，選一個既有可觀測狀態與一個 action（例如 tactic switch 或 route/reposition response），先做 verifier-first attribution；不要在 R34 補新 AI 或調 balance。

## 變更範圍與 provenance

本輪只新增 verifier、規格與報告、aggregate registration 及 handoff 紀錄；沒有修改 `src/battle/fps/EsportsFPS3D.jsx`、RNG、scenario、role mapping、contracts、歷史基線或賽事系統。R17／R3 evidence 與 R33 production source provenance 均保留。
