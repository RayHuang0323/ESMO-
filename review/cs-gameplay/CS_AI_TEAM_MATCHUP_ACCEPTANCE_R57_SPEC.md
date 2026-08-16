# CS AI Team Matchup Acceptance R57 Spec

日期：2026-08-16

## 目的

驗收 R56 的 8 支正式 CS AI 隊伍在既有 deterministic simulator 中的實戰差異。R57 不新增 gameplay、role constraint、tactic adapter、RNG、scenario 或 balance coefficient。

## 固定 treatment

- map：`inferno`
- T tactic：既有 `t_aexec`
- CT tactic：既有 `c_std`
- seeds：`3978742910`、`4200255727`、`541349949`、`1011896540`、`44863398`、`1878380147`
- matchup：10 類代表性 pair，雙向 side orientation，共 120 場；另做 1 場 deterministic repeat
- input：R56 `CS_AI_TEAMS` 經既有 `toFpsRoster()` adapter，角色由 player identity 讀取，允許重複 role

Production 目前沒有 style-to-tactic adapter，因此 verifier 不自行發明風格戰術映射；team style 以既有 team metadata、role composition、stat profile 與完整比賽結果觀察。

## Observability

verifier 以 Vite memory transform 暴露既有 `simulateFps()`，只在測試模組內收集：

- round score、round winner、kills、ADR×rounds damage proxy
- role K / Kpm / ADR / entry / clutch
- AWP／Entry share、Neon upset、team win ordering
- route state transitions、comms、Adaptability、TacticalIQ、Leadership、Synergy function triggers
- source RNG call sites、fixed scenario、input immutability、repeat digest

所有 route/consumer collector 都只存在 verifier transform，不會進入 production bundle。

## Acceptance gates

- deterministic repeat digest 相同
- 8 隊均有實戰勝場，不得出現全套 sample 的 0% 或 100% suppression
- Iron Vanguard 對 Neon Comets 保有明顯但非絕對優勢；Neon 必須保有合理勝機
- AWP／Entry 不得形成全隊 systemic kill share collapse
- route/team consumers 在完整 match 中有真實 runtime triggers
- raw/effective 90+、99 clamp、threshold-sensitive stat 維持受控
- 不修改 R56 roster、16 stat formula、scenario、seed、RNG 或 balance
