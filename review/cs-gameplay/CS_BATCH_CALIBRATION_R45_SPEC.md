# R45 CS 四項批次 Calibration Pilot 規格

本 Sprint 只量測 CS 16 項素質中的 Focus、Decision、Clutch（沿用 legacy `str`）與 Resilience（`res`）。不修改 production balance，不碰 Season / Circuit / Event / competition，不新增 RNG、不改 scenario、不重建 historical evidence。

## 固定量測邊界

- 場景：`inferno / t_aexec / c_std`
- fixed seeds：沿用 R22 `CsMeasurementSeedSet.v1` 的 16 seeds
- sweep：raw stat `60 / 70 / 80 / 90 / 100`
- T-side role：Entry、Rifler、AWP、Lurker、IGL
- Focus / Decision 另以 CT-side 五角色量測拆彈 consumer；T-side role 結果仍獨立保存
- memory-only Vite hooks：effective read、role-fit、combat flags、local pair opportunity / conversion、defuse progress、retreat threshold

## Canonical 名稱與產品映射

Production source 的 canonical label 是 `str = 抗壓`、`res = 韌性`。既有產品盤點把 legacy `str` 作為 Clutch／殘局能力使用；本 Sprint 不改欄位名、不改角色資料、不自行重新命名。`res` 維持韌性。

## 四層 evidence

1. Level 1：raw / effective、role-fit、combatSkill、holding、lastAlive、low-HP、defuse direct formula。
2. Level 2：真實 pair、lastAlive、low-HP、CT defuse opportunity。
3. Level 3：local Pt / pair conversion、defuse progress。
4. Level 4：round / kills / damage / survival 僅作 secondary observation。

Verifier 要求 treatment 只改 target stat，memory transform 可逆，RNG token sequence 不變，input 不被 mutate；代表 arm 另做 off/on 與 repeated event digest 檢查。

## Read-chain assertions

- Focus：raw role-fit（Rifler / AWP）＋effective combat / holding / CT defuse。
- Decision：raw role-fit（Lurker / IGL）＋effective combat / CT defuse；不宣稱 target、route、utility、tactic 或 aggr consumer。
- Clutch：legacy `str` 的 mechanics、role-fit、`lastAlive` 主動戰鬥與既有 low-HP / aggr path。
- Resilience：`res` 只接既有 low-HP 穩定保留；不把它再算成 lastAlive direct bonus，也沒有 role-fit。

## 判定原則

Local direct monotonicity、opportunity coverage、每 +10 的 slope、clamp / threshold 另列；下游 path amplification 不得被當成公式反轉。沒有 opportunity 的角色是 control，不視為 stat 失效。四項本輪只做 readiness pilot，不調係數。
