# R41 CS 勇氣 Calibration Pilot

## 範圍

本 Sprint 只量測既有 Courage read-chain，不修改 production source、balance、role mapping、RNG、scenario 或 historical evidence。主要 gate 是 local causal `aggr` 與既有 Entry-specific read；kills、damage、survival、round result 只作 secondary observation。

## 固定量測形狀

- scenario：`inferno / t_aexec / c_std`
- target roles：`entry / rifler / awp / lurker / igl`
- raw Courage levels：`60 / 70 / 80 / 90 / 100`
- 每個 role／level 使用 16 fixed seeds，共 `5 × 5 × 16 = 400` arms
- 每個 arm 依序執行 instrumentation-off、instrumentation-on、repeated-on，確認 memory-only instrumentation 不改結果或 RNG sequence。
- seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`

## R22 四層

1. Level 1：effective Courage、raw role-fit、Entry-specific combat read、`aggr`。
2. Level 2：fire opportunity、retreat opportunity、low/high-aggr state。
3. Level 3：Pt、attacker-side local conversion、retreat threshold crossing。
4. Level 4：kills、damage、survival、round result；不作主要 gate。

## 語意與安全邊界

raw `stats.cou` 只保留既有 Entry `posSkill` role-fit；`persStat(cou)` 是既有 live effective read，直接進 `aggr`，並在 Entry combat bonus 使用。`aggr < 0.82` 與 retreat code 只觀測、不調整。所有 transform 要求唯一 marker、可逆還原、RNG token sequence 不變，且輸入 roster 不可變。
本規格結論：只做 deterministic measurement，不建立新的 Courage gameplay consumer。
