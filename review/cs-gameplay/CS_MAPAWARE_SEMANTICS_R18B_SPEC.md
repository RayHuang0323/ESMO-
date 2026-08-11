# CS MapAware Semantics / Read-Point Design — R18-B

## Scope and decision boundary

R18-B is a read-only semantics and measurement design pass. It does not modify
`src/`, production gameplay, contracts, roster adapters, RNG, or the aggregate
historical gate. The focused verifier instruments the simulator in memory only.

This sprint does not rebaseline R1–R17, does not continue the R18-A reflex
sweep, and does not create a new AI system. The existing `vis` path is treated
as an adapter/consumer path that requires review; it is not evidence that
MapAware is already complete.

## Product semantic

In ESMO CS, `mapAware` means an actor's ability to interpret relevant spatial
and tactical state, then use that interpretation in a context-appropriate
decision. The state includes the relationship between:

- enemy position and distance;
- teammate position and local support context;
- wall and utility LOS boundaries;
- utility danger and safe-space changes;
- rotation/reposition timing; and
- bomb-state transitions that change the tactical objective.

The semantic unit is therefore **state observation plus an attributable
decision consequence**, not a generic visibility scalar. A position/LOS value
can be measured without proving that an actor knew it or responded to it.

Current `fpsRoster.js` maps long-key `mapAware` to short-key `vis`, and the
simulator consumes `vis` inside the broader combat calculation. That is a data
adapter and a combat weight, not a MapAware semantic implementation: there is
no explicit actor knowledge state, no observation gate tied to a role, and no
MapAware-specific decision edge in the existing chain. R18-B must not label
that mapping as “MapAware complete”.

## Existing simulator read-point inventory

| Candidate read point | Existing measurable state | Current decision consequence | R18-B disposition |
|---|---|---|---|
| Enemy positional awareness | `aliveT`/`aliveCT` positions, pair distance, combat-pair admission | Distance gates combat opportunity; no actor-specific knowledge model | Include as context field in the minimal probe; do not call it awareness yet |
| Teammate positional awareness | Alive teammate count and nearest teammate distance can be derived at the same pair context | Retreat uses nearby teammate count indirectly; no MapAware-specific response | Include as context field in the minimal probe |
| LOS awareness | `lineBlocked` wall test and `smokeBlocks` utility LOS test | Current pair admission and several utility effects are LOS-gated; R13 supplies smoke causal evidence | Select as the primary minimal, verifiable read point |
| Utility danger awareness | HE/Molly exposure and effective damage paths exist after R14/R15 | No utility avoidance or danger-driven route decision | Measure only as a future extension; defer production wiring |
| Rotation / reposition timing | Routes, `safeMove`, route reassignment, and R5 retreat timing exist | Existing behavior is route/retreat logic, coupled to other stats; not a MapAware consumer | Defer; avoid relabeling movement behavior as MapAware |
| Bomb-state awareness | `planted`, `c4t`, defuse progress, contest, and retake reassignment exist | Bomb and defuse state change round flow; no individual awareness attribution | Defer; require a separate actor-level read/response design |

## Selected minimal read point

### Spatial Context Read Point v1

The smallest useful probe is the existing combat-context pair admission in
`simulateFps`, before the current `pairs.push([tp, cp, d])` gate. For each
T/CT pair at an existing simulation tick, the memory-only probe records:

```text
CsMapAwareSpatialReadPoint.v1
  round, sec
  tPlayerId, cPlayerId, tRole, cRole
  enemyDistance
  distanceEligible
  wallBlocked, smokeBlocked
  visibleCandidate
  tTeammateCount, ctTeammateCount
  tNearestTeammateDistance, ctNearestTeammateDistance
```

`visibleCandidate` is strictly the existing mechanical predicate:

```text
enemyDistance < 55 && !wallBlocked && !smokeBlocked
```

It is intentionally named `visibleCandidate`, not `mapAware` or `aware`.
The read point observes enemy/teammate spatial context and both existing LOS
boundaries without changing pair admission, combat, movement, or results. It
is minimal because it reuses one existing context boundary and does not add
state ownership, memory, communications, prediction, or a new action policy.

## Focused evidence / verifier design

Verifier: `tools/check_cs_mapaware_semantics_r18b.mjs`

Frozen setup:

- source SHA-256 must remain the R18-A canonical source SHA;
- the existing 16 fixed measurement seeds and `inferno / t_aexec / c_std`;
- baseline roster only; no candidate sweep and no stat treatment;
- 16 seeds × instrumentation-off/on/repeated-on = 48 simulations;
- static `rand()` token count must remain 21.

Correctness gates:

1. Every source transform marker appears exactly once and reverses byte-for-byte.
2. The transformed module keeps the exact `rand()` token sequence.
3. Instrumentation-off, instrumentation-on, and repeated-on simulation results
   are byte-identical for every seed.
4. Event output is deterministic, schema-valid, finite, uniquely keyed, and
   preserves the mechanical `visibleCandidate` predicate.
5. Frozen input digest is unchanged after every simulation arm.
6. Coverage is non-zero and reports distance, wall, smoke, visibility, and
   teammate-context fields without claiming a causal awareness effect.

This is a focused verifier layer. It does not replace the historical R1–R17
checkpoint gate and it does not weaken any correctness gate. A future accepted
production candidate would require focused regression first, then the
historical checkpoint gate.

## Future production wiring decision

**No-Go for current direct wiring.** Do not ship `mapAware -> vis` as proof of
MapAware semantics, and do not add a new production consumer from this
measurement-only result.

The next decision is **Revise** after R19 resolves the reflex/role read-chain
and raw-versus-personality-adjusted stat boundary, and after a later focused
MapAware evidence pass demonstrates an actor-specific observation-to-decision
consequence. Only then can a narrowly scoped production wiring proposal be
reviewed for Go. R18-B itself proposes no production patch.

## Non-goals

- no complete 16-stat calibration;
- no utility avoidance, predictive AI, memory, learning, or synergy system;
- no role rebalance or reflex fix;
- no new RNG or RNG architecture change;
- no route, bomb, LOS, damage, movement, contract, store, or UI change;
- no mobile/WebGL/FPS claim from Node-only evidence.
