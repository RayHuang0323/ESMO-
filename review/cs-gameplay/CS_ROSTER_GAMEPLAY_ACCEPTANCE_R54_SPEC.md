# CS 第一版 Roster / Gameplay Balance Acceptance R54

日期：2026-08-16

## 目的

驗收目前 15 項可用 CS stat 與 R46 role distribution 組成的第一版 roster，確認 role identity、stat stacking、threshold / clamp incidence、team strength ordering 與 deterministic gameplay sanity。Learning 不在本輪 scope，維持 `Lifecycle`。

## 固定邊界

- fixed scenario：`inferno / t_aexec / c_std`
- fixed seeds：`3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147`
- production simulator：`src/battle/fps/EsportsFPS3D.jsx` 的既有 `simulateFps`
- variants：`baseline`、T-side active stats `+8` 的 `stronger`、`-8` 的 `weaker`，以及 Entry / Rifler / AWP / Lurker / IGL 各一個 role-focused `+8` signature treatment
- 既有 roster、fixed scenario、seeds、RNG、consumer、balance coefficient 均不修改；treatment 只存在 verifier memory 中

## Acceptance gates

1. 10 人 roster、15 active stat keys、五 role 與 source API shape 完整。
2. 同一 roster / seed 重跑 digest 一致，且 simulator 不 mutate input。
3. stronger 對 T-side 的 aggregate score / round differential 優於 weaker。
4. baseline 與所有 role-focused variants 沒有單一選手 kill-share collapse；不以 kills / winner 單獨作 gate。
5. IGL strategic composite（TacticalIQ / Decision / Comms / Leadership）明顯高於 combat composite；AWP signature 不形成全 roster clamp / threshold mass trigger；Entry、Lurker 沒有因多重 exposure 形成異常 outlier。
6. baseline 高端、99 clamp 與 threshold incidence 可解釋，ready-limited consumers 沒有不合理的跨 role 副作用。

Verifier：`tools/check_cs_roster_acceptance_r54.mjs`。此 verifier 使用 Vite memory transform 只讀取既有 simulator，不能作為 production source 修改的替代品。
