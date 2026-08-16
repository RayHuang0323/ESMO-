# R19 Reflex Semantic Correction → R18-A Revalidation Report

日期：2026-08-12

## 結論

R19 semantic correction 的 read-chain 修正成功，且沒有引入新的隨機性或 balance 變更；但它沒有消除 R18-A outcome KPI 的 deterministic path amplification。因此 Reflex 仍不可進入 calibration，R18-A 維持 `Revise`。

這份報告是 R19 production patch 後的新 checkpoint，不取代或重寫 R1～R18 historical evidence。

## Production semantic patch

修改範圍只有 `src/battle/fps/EsportsFPS3D.jsx` 的 Reflex boundary：

- `rawReflex = stats.rxn`：保留 raw role-fit 基礎值。
- `effectiveReflex = persStat(p, "rxn")`：建立單一 effective live-combat read。
- `posSkill(p, rawReflex)`：role-fit 明確使用 rawReflex。
- `combatSkill` 的 mechanics、weapon 與 entry contribution：明確使用 effectiveReflex。
- 未修改 balance constant、role mapping、`FPS_W`、`Pt` clamp、RNG、stat formula 結構、contract 或 Store/Progress。

source SHA-256：

- patch 前：`7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- patch 後：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`

R19 focused verifier 也新增 static semantic gates，並以 memory-only instrumentation 驗證 raw/effective attribution；沒有修改 production source。

## R19 focused verifier

- schema：`CsReflexReadChainAuditEvent.v1` / `CsReflexReadChainAuditSuite.v1`
- fixed seeds：16；seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- simulations：176
- post-patch suite digest：`a2b0db3aa6357ba9d551217634e6426f726d1028d0d60428d7544bd6c2f34030`
- R18-A repair evidence reference：`104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b`
- role coverage：entry / rifler / awp / lurker / IGL
- 每次 `combatSkill` 都是 1 次 `effectiveReflex` alias read 與 1 次 `combatSkillRxnRead` attribution；posSkill 的 raw rxn weight 保持 role profile 定義。
- determinism、source provenance、RNG call-site、input immutability、transform reversibility：PASS。

| role | raw rxn | effective rxn | raw posSkill rxn weight | effective reads / combatSkill calls |
|---|---:|---:|---:|---:|
| entry | 78 | 84 | 4 | 359 / 359 |
| rifler | 84 | 90 | 4 | 584 / 584 |
| awp | 82 | 82 | 1 | 253 / 253 |
| lurker | 79 | 85 | 0 | 404 / 404 |
| IGL | 74 | 74 | 0 | 419 / 419 |

## R18-A revalidation

完整 focused deterministic sweep：low / baseline / high、5 roles、16 fixed seeds、target-player-only KPI，共 528 simulations。

- post-patch suite digest：`fa483388aaeb348fc9552381655f2da8ff192a90d736a39838962159bfc43fec`
- accepted focused regression：第二次完整 sweep digest 完全相同：`fa483388aaeb348fc9552381655f2da8ff192a90d736a39838962159bfc43fec`
- monotonicity：`0/15`
- saturation signal：`0/5`；三點 pilot 未觀察到 saturation，不能宣稱 plateau
- target KPI attribution：conversion / kill / damage 僅 target attacker；defender-side hits / deaths / damage taken 分離輸出
- strict-majority：16 seeds 必須 `> 8`；本輪沒有放寬 correctness gate

主要 target-player-only KPI 的 low→baseline / high→baseline mean diff：

| role | conversion | kill | damage |
|---|---:|---:|---:|
| entry | -1.7500 / +1.0000 | -1.1250 / +0.3750 | -53.6250 / +69.1250 |
| rifler | -3.8125 / -0.8125 | -1.7500 / -0.1875 | -215.0625 / -25.4375 |
| awp | -0.8125 / +0.6875 | -0.5625 / +0.5625 | -56.1875 / +67.2500 |
| lurker | +0.5000 / -0.0625 | +0.3125 / +0.2500 | +57.3125 / +9.2500 |
| IGL | +0.5000 / +3.7500 | +0.1250 / +2.2500 | +13.6875 / +213.3125 |

## Before / after interpretation

- semantic boundary：由「raw posSkill + 多處 implicit persStat(rxn)」修正為命名且可驗證的 raw/effective split；R19 root semantic inconsistency 已處理。
- outcome behavior：paired sweep 的數值結果與修正前 R18-A repair evidence 相同，符合本 patch 的最小、behavior-preserving 目標。
- rifler / lurker / IGL 的非單調方向：沒有改善，仍存在。
- deterministic path amplification：仍存在；`Pt` threshold、kill/death、alive/pair、weapon 與 economy/state branch 仍能放大或反轉 outcome KPI。
- calibration readiness：`No-Go`；這次 semantic correction 不能被當成 balance calibration 或 complete 16-stat calibration。

## 分層驗證

- R19 focused verifier：PASS；suite digest `a2b0db3aa6357ba9d551217634e6426f726d1028d0d60428d7544bd6c2f34030`
- R18-A accepted focused regression：PASS；兩次 digest 相同
- historical checkpoint gate：14/14 PASS；R1～R18 historical suite/digest 保留，未 rebaseline gameplay evidence。R17 另建立 current-source readiness checkpoint `34e67a22fd6f9e44463d55cd5f53c3f6d2c9281c6bb88abbbcb00062017b9213`，舊 R17 snapshot `e5838664749625863caa2b35fe6d4b999dbda7fd8c3600fee50523b5415573ad` 保留於歷史紀錄。
- production build：`npm.cmd run build` PASS（Vite 5.4.21；2,643 modules transformed）；只有既有 bundle size warning，未因此變更架構。

## Checkpoint

- schema：`CsReflexSemanticCorrectionCheckpoint.v1`
- checkpoint digest：`c83f2b2efc58454b1c6ce86c857cac262af929b3ad7959a4841731a0a00dae73`
- checkpoint 組成：production source SHA、R19 suite digest、R18-A suite digest、R17 current-source readiness digest，以及 `historicalEvidencePreserved: true`。

## Decision

- semantic correction：`Go`（read-chain 語意修正已完成）
- Reflex calibration：`No-Go` / R18-A `Revise`
- production balance patch：不提出
- R19 後續：仍需要，因 deterministic path amplification 尚未被解釋或拆分；不可用調參掩蓋。

## Review

- blocking findings：無。
- non-blocking findings：production build 保留既有 large-chunk warning；historical verifier 需要維護 R19 current-source allowlist 與 pre-R19 memory adapter，這是 provenance 保護成本，不是 gameplay correctness failure。
- review 結果：`PASS`；未發現新的 production semantic blocking issue、RNG migration 或 contract 變更。
