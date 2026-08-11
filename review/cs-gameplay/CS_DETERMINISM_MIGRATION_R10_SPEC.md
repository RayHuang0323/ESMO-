# CS Determinism Migration R10

Status: GO / implemented locally
Date: 2026-08-11

## Scope

R10 migrates determinism evidence after the CS stale-defuse gameplay bug is repaired.
The production repair uses fresh post-combat alive views only inside the defuse decision:

```js
const defuseAliveCT=ps.filter(p=>p.side==="ct"&&!p.dead),defuseAliveT=ps.filter(p=>p.side==="t"&&!p.dead);
const defuser=defuseAliveCT.find(cp=>dist(cp.pos,c4pos)<6);
const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));
```

R10 does not change `CsMatchResult.v1`, Store, Progress, runtime contracts, balance, calibration, utility, `how:bomb`, learning, or synergy behavior by design.

## Migration contract

1. `CsGameplayDigest.v1` and `CsGameplayDigest.v2`, their source provenance, and their expected constants remain immutable historical evidence.
2. R10 establishes `CsGameplayDigest.v3` as a new determinism evidence baseline.
3. Before the first fresh-defuse decision difference, legacy and repaired frames must be identical.
4. After that boundary, trajectory and RNG consumption may differ only when caused by the repaired early round termination.
5. No dummy RNG, delayed completion, digest masking, or automatic rebaseline is allowed.
6. The source must retain 21 `rand()` call tokens and the repaired arm may not consume more RNG than legacy.
7. A failure before the boundary, a non-defuse RNG site, an extra RNG draw, or nondeterministic rerun is No-Go.

## Frozen evidence

| Evidence | Value |
|---|---|
| historical R8 source SHA | `870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b` |
| R10 repaired source SHA | `ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d` |
| fixed matrix | 16 R3 treatments × 16 seeds = 256 paired runs |
| legacy paired evidence suite | `cce868c91d0c901899cf9df93d07b0af11706da81266ca92a8f807d895fec8ba` |
| repaired v3 baseline suite | `7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb` |

The R1-R8 verifiers use `tools/cs_r10_legacy_source.mjs` to reconstruct the old defuse semantics in memory. This preserves their old constants without changing production or rebaselining them.

## Causal result

- 14/256 paired trajectories changed.
- 1/256 changed RNG consumption: `clutch`, seed `4200255727`, `2005 -> 2004`.
- The only missing draw is `idle_aim_jitter`, player `ct3`, round 12, `sec=64`, call index 2005.
- The repaired run ends the defuse round before that tick; the defuse branch itself adds no RNG.
- The RNG boundary remains a single seeded stream. Per-round and subsystem RNG are deferred.

## Verifier gates

`tools/check_cs_determinism_migration_r10.mjs` runs both legacy and repaired memory variants, checks deterministic reruns, compares pre-boundary frames, records compact RNG traces, identifies missing call sites, and locks both suite digests. It has no capture, update, or rebaseline CLI.

The R10 segment is registered in `tools/verify.mjs`. Calibration remains No-Go and is outside this Sprint.
