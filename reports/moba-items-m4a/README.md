# MOBA Item System M4a — Balance Baseline evidence

Measurement only. No value in the game was changed to produce these files.

## Reproduce

```
node tools/balance/moba_items_balance_runner.mjs --seeds=200 --workers=8 --out=reports/moba-items-m4a
```

- 6 configs × 200 seeds (seed 1–200) = 1200 matches, about 14 minutes with 8 workers on a 12-thread laptop.
- Deterministic: every match depends only on (config, seed). Worker count and completion order do not change the output (rows are sorted by config, seed). Spot re-runs of off/7, standard/1, early/42, survival/199 in a single process reproduced the CSV rows field for field.
- Cap 3600 simulated seconds (60 min); matches not finished by then have `over=0`.

## Configs

| config | items | strategies |
|---|---|---|
| `off` | itemsV1 off | – |
| `standard` | on | both sides standard (mirror ⇒ side bias) |
| `early` / `scaling` / `counter` / `survival` | on | that strategy on blue for even seeds, on red for odd seeds; the other side standard |

Every seed uses one mirrored roster (same five heroes on both sides), picked by a seeded LCG that never touches the engine RNG. Engine setup matches `useLocalServer`: heroes, archetypes, summoner spells, standard tactic on both sides, then items.

## Files

| file | content |
|---|---|
| `summary.json` | per-config aggregates (duration distribution, side bias, kills, T3 timing by role/arch, completed items, unspent gold, income by source, purchases, counter items, duration buckets, long matches, ledger checks) |
| `matches.csv` | one row per match (1200) |
| `players.csv` | one row per player per match (12000); `taken_approx` is the sum of per-tick HP drops (the engine does not record damage taken) |
| `item_purchases.csv` | purchase counts per item per config |
| `side_bias_diagnostic.txt` | extra side-bias runs: bare engine 100 seeds; M2 fixed roster normal vs swapped 60 seeds each |

Notes:
- `gold` / `goldPerMin` for `off` is the legacy per-player gold field and is **not comparable** with the itemsV1 personal ledger used by the other configs.
- Report: `docs/design/MOBA_裝備平衡基線_M4a_v1.md`.
