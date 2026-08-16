# CS Bomb Result Semantics Repair R11

Status: GO / Grill approved
Date: 2026-08-11

## Root cause

The simulator uses `how:"bomb"` for three different post-plant endings:

1. C4 timer reaches zero;
2. every CT is eliminated while the bomb is planted;
3. the round clock reaches its limit while the bomb is planted.

`roundHist → buildMatchResult → CsMatchResult.v1.summaryEvents` forwards `how` unchanged.
The live round overlay, score pips, and audio then treat every `bomb` value as an explosion.

## Approved semantics

| Round-end cause | `how` |
|---|---|
| C4 timer reaches zero | `bomb` |
| CT eliminated after plant | `elim` |
| post-plant round clock limit | `time` |
| defuse completes | `defuse` |

The existing enum and `CsMatchResult.v1` schema remain unchanged. Existing `csHistory` cannot be
reconstructed because it does not retain C4 timer/survivor evidence, so no history migration is allowed.

## Production boundary

Only the two overloaded `roundEnd.how` assignments may change. Branch order, winner, score, economy,
frames, player state, RNG calls, Store, Progress, runtime contracts, UI calculation, and gameplay rules
must remain unchanged. Existing UI consumers already map `elim` and `time` correctly; no gameplay or UI
rewrite is required.

## Evidence contract

`CsBombResultSemantics.v1` uses the fixed R1 16 seeds with the existing Inferno `t_aexec` / `c_std`
scenario. It runs paired R10-overloaded and R11-repaired memory variants and requires:

- deterministic reruns in both arms;
- all RNG values and consumption counts exactly equal;
- every simulation difference restricted to `roundHist[].how` or frame snapshots of that field;
- coverage of real explosion, defuse, elimination, and time semantics;
- at least one post-plant CT elimination and one post-plant timeout migrating from `bomb`;
- `bomb` exclusively associated with C4 timer zero;
- intact producer → raw result → `CsMatchResult.v1` → live UI / Result UI read-chain.

There is no capture/update/rebaseline CLI. `CsGameplayDigest.v3` remains immutable historical R10
evidence and is re-run through an exact R11→R10 memory adapter. R11 does not create
`CsGameplayDigest.v4` and does not expand treatment scope.

## Out of scope

- utility;
- learning or synergy;
- balance or calibration;
- gameplay rule changes, including post-plant clock behavior;
- RNG architecture changes;
- contract, Store, Progress, reward, or history migration.
