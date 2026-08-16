# CS MapAware Semantics / Read-Point Design — R18-B Evidence

## Verdict

`CS MapAware Semantics / Read-Point Design R18-B: PASS` means the focused
read-point verifier and its correctness gates passed. It does **not** mean that
MapAware is production-complete or that the current `mapAware -> vis` adapter
is approved for production wiring.

R18-B is a semantics and measurement design pass only. No production gameplay
source was modified, no new RNG was added, and no R18-A sweep was expanded.

## Product semantic

ESMO CS `mapAware` is actor-specific interpretation of spatial/tactical state
that leads to an attributable tactical consequence. It is not equivalent to a
visibility scalar, a HUD aggregate, or a raw map position. The existing
`fpsRoster.js` mapping `mapAware -> vis` remains an adapter path and a combat
weight; it is not evidence of a completed MapAware read-chain.

The current simulator has spatial predicates and tactical state, but no
explicit actor knowledge state or MapAware-specific observation-to-decision
edge. This report therefore keeps the product semantic boundary explicit.

## Read-point inventory and selection

| Candidate | Existing evidence | Decision |
|---|---|---|
| Enemy position | Pair distance and alive positions at combat admission | Include in minimal context probe; not yet actor awareness |
| Teammate position | Teammate count and nearest teammate distance are available at the same tick | Include in minimal context probe |
| LOS | Existing wall `lineBlocked` and smoke `smokeBlocks` predicates; R13 smoke evidence exists | Selected primary read point |
| Utility danger | R14 HE and R15 Molly exposure/damage paths | Measure later; no current danger-response consumer |
| Rotation/reposition timing | Routes, `safeMove`, reassignment, and R5 retreat metrics | Defer; existing behavior is not MapAware attribution |
| Bomb state | Plant, timer, defuse, contest, and retake state | Defer; requires actor-level awareness/response design |

Selected point: `CsMapAwareSpatialReadPoint.v1`, attached in memory to the
existing T/CT combat pair admission. It records pair distance, wall/smoke LOS,
visible-candidate predicate, and both teams' teammate context while preserving
the original pair gate.

## Frozen setup

- simulator source SHA-256: `7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- seed set: 16 fixed seeds, `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- scenario: `inferno / t_aexec / c_std`
- roster: existing baseline roster only
- arms: instrumentation-off / instrumentation-on / repeated-on
- simulations: `48` total
- static `rand()` call sites: `21`
- verifier: `tools/check_cs_mapaware_semantics_r18b.mjs`
- suite digest: `8d3c5bcff1da3fe5fb5795be60d59626054170ff6e57787739d4ba629eacd377`

## Focused evidence

| Metric | Count | Rate of all read points |
|---|---:|---:|
| spatial read points | 52,351 | 100.00% |
| distance-eligible pairs | 49,800 | 95.13% |
| wall-blocked | 41,969 | 80.17% |
| smoke-blocked | 18,248 | 34.86% |
| both wall and smoke blocked | 13,469 | 25.73% |
| visible candidates | 5,603 | 10.70% |
| T teammate context present | 49,005 | 93.61% |
| CT teammate context present | 49,991 | 95.49% |

The evidence confirms that the selected point is populated and can distinguish
distance, wall LOS, smoke LOS, and teammate context in the existing simulator.
It does not measure whether an actor knew the state, communicated it, or
changed a decision because of it.

## Correctness gates

PASS for all 16 seeds:

- source SHA and static RNG token count matched the frozen setup;
- memory transform reversed to the original source byte-for-byte;
- transformed and uninstrumented simulation results were identical;
- repeated instrumentation event streams were deterministic;
- input digest was unchanged;
- event schema, finite values, unique keys, and `visibleCandidate` predicate
  were valid;
- teammate-context and visible-candidate coverage were non-zero.

## Future production wiring

**No-Go now** for direct `mapAware -> vis` production wiring. R18-B does not
propose a production patch.

The appropriate next state is **Revise**: first complete R19's reflex/role and
raw-versus-personality-adjusted stat audit, then run a later focused MapAware
pass that demonstrates an actor-specific observation-to-decision consequence.
Only that later evidence can support a narrowly scoped Go review.

## R19 handoff

Created in `docs/handoff/08_目前待辦與風險.md`:
`R19 — Reflex Read-Chain / Role Interaction Audit`.

R19 covers rifler/lurker/IGL reflex direction reversal, personality-adjusted
versus raw stat mixing, and role-formula effects on reflex causality. It is a
follow-up audit only; R18-B does not implement it.

## Scope boundary

No production gameplay, roster adapter, contract, store, movement, LOS,
utility, bomb, UI, RNG architecture, or verifier aggregate gate was changed.
Node evidence does not establish browser/mobile/WebGL performance or player
experience.
