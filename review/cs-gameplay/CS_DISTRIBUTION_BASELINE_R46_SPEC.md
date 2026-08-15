# R46 CS 已成熟素質整合＋第一版能力分布基準規格

## Scope

本 Sprint 只整合既有 R39–R45 evidence，並把九項已達 Calibration Ready / Limited 的正式 key 接到既有 `genProspects()` 新秀生成流程：

`reflex`（反應速度）、`accuracy`（精準度）、`apm`（操作速度）、`positioning`（走位）、`decision`（決策力）、`courage`（勇氣）、`clutch`（抗壓）、`focus`（專注力）、`resilience`（韌性）。

CS 引擎 adapter 的 legacy `str` 是正式 `clutch` 的短鍵，不新增或改名正式欄位。

## Generation boundary

- 沿用 `data/recruitPool.js` 的 deterministic 40 人新秀池、`potential/current`、personality、recruitment transaction 與既有 `players[]`。
- `playerModel.js` 集中保存 MOBA route → CS role mapping 與五個 CS role profile。
- 九項成熟素質改用 role-specific bias + upper cap；baseline 仍由既有 `potential/current` 決定，且不把所有值推到 80–90。生成 cap 保留至少 2 點 potential room，讓既有 training producer 仍可作用。
- 七項 gameplay-gap 素質（視野意識、戰術理解、應變力、溝通、領導力、配合度、學習力）保留既有 producer；本 Sprint 不用它們主導 CS generation。
- 不修改 battle formula、RNG token call sites、scenario、contract、Store persistence、historical evidence 或 training/reward flow。

## Gates

`tools/check_cs_distribution_r46.mjs` 必須檢查：canonical key/name、deterministic repeated pool、五 role coverage/profile difference、potential/range、90+ 比例、99 clamp 比例、threshold band、role identity 與 production aggr source markers。

既有 recruitment、progress/reward、historical/Q7a、build gates 仍須以原 verifier 逐支執行；不重跑 R39–R45 大型 sweep。
