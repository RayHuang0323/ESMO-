# R51 CS Gameplay Identity 第二階段報告

日期：2026-08-16

## 結論

R51 Go。Leadership 升為 Calibration Ready-Limited；Synergy 有真正第二層 production action，但維持 Measurement Ready / Deferred。沒有新增 RNG，fixed scenario、九項 calibration 與 Learning lifecycle 均未改。

## Leadership

- Consumer：隊友倒下後，存活高 led IGL 透過既有 route anchor 讓一名隊友執行 follow-up route／ROTATE。
- Scenario：inferno / t_aexec / c_std；16 fixed seeds；RNG call sites 21。
- Primary：ct1 / igl；raw/effective low-baseline-high = 82/88、90/96、98/99。
- Baseline Level 2 / Level 3 = 148 / 25；low action = 0/16 seeds；baseline/high action = 13/16 strict-majority。
- Role coverage：ct1 opportunity/action = 148/25，teammate roles = awp/entry/rifler/support；t5 亦觀測到 lurker/awp/entry action。
- Threshold：led 90 crossed；effective high 99 clamp 1/3，保留 high-end saturation boundary。
- Primary digest：a40958b64b212c72a7ce8824bf718abb174dbdde6d1e1d330cd52fef330cc082
- Role digest：9c97d726477da2f8634d7f041ab947215d35e7203035322903447d5b0841f8e
- Suite digest：8842526895b703e60b89de4b000925d21632e2baf236c5bce4d7ef8430cf4880
- Verdict：Calibration Ready-Limited。

## Synergy

- Consumer：既有 trade partner ENGAGE 後，attacker 依 partner／victim 幾何立即走 cover follow-up route。
- Scenario：inferno / t_aexec / c_std；16 fixed seeds；RNG call sites 21。
- Primary：ct5 / support；raw/effective low-baseline-high = 82/82、90/90、98/98。
- Baseline Level 2 / Level 3 = 279 / 260；low action = 0/16 seeds；baseline/high action = 16/16 strict-majority。
- Role coverage：ct5 有 awp/entry/igl/rifler/support partner roles；t2 opportunity 24、t4 opportunity 7，但兩者 action 均 0。
- Boundary：Level 2 opportunity local monotonicity 8/16，stat-target role coverage 不足；threshold 90 crossed，effective clamp 0/3。
- Primary digest：c8d0137eea4bd9a01e2bf5c0935abf8df789fdc482350b072f799f7bca167e53
- Role digest：c92b1e070c72bfff54a76e8a4bbc7bbb7c9d152067150e5d96343f3ccc59938b
- Suite digest：5f671608b201e8f2c3eb0807e2c32b449d9741b0f99f03dcb94a7ce27fab508e
- Verdict：Measurement Ready / Deferred；需要 coverage closure，不調 coefficient。

## Regression evidence

- R16-A Synergy：PASS，digest db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022。
- R36 Leadership／Synergy：PASS，digests 768d6ae1 / a27d7f9d。
- R47 historical：PASS，suite e3a90541。
- R48 current-source regression：PASS，suite f9e51bbeb7e755774e2a036f7d5ad0eb3edfa0097d8d914028fe831a20bf6519。
- R49 Leadership／Synergy：PASS，suites 3878b9399ab2e316c64d650e1b3e87e014aa8e45b401fe1cee49ff7574390a34 / 59f57381e0c0c35a775a1328d7d740b75d6cf033315418d3953fc5429e0680f6。
- Historical adapter、input immutability、deterministic digest、git diff check：PASS。

## CS 16 項狀態

- Calibration Ready：4
- Calibration Ready-Limited：7
- Measurement Ready / Deferred：4
- Learning lifecycle-only：1

下一步先處理剩餘 Gameplay Identity coverage closure，尤其 Synergy 的跨 stat-target role coverage；Learning 維持 lifecycle-only。
