# Phase 3a-C3-2 Phase Stance — Plan

Owner approval 2026-10-21: C3-1 accepted; C3-2 only (no C3-3, C4–C6; no push/deploy/main).
Sources: `review/tactic-book-3a/C3_開工清單.md` §3.2 / §3.4 / §4, `review/tactic-book-3a/C3-C6_行為契約草案.md` §1.3 / §2, `review/tactic-book-3a/C3_Owner決策表.md` D-18 / D-19.

## Fixed inputs (approved before this plan)
- Posture fields and direction unchanged (`identity.phaseEngage` / `phaseJoin`, `PHASE_ENGAGE` values not touched). Only the metric is re-registered (C7 class 4).
- Metrics: `engageDecisionsPerMin.<p>` and `engageStartsPerMin.<p>` (start-only, required). Direction by Registry rank: early/mid `defensive < scaling < standard < aggressive`; late `defensive < standard < scaling`.
- Seeds 3001–3400, n = 400 per side, red and blue each measured; late valid pairs n ≥ 200 (shortfall ⇒ stop, Owner opens a new range).
- Pass per side: direction matches, paired z ≥ 3, |Δ| ≥ 5 %, for both metrics; both sides required.
- Instrument self-check (D-19): per match, the three phase buckets sum to the whole-match count; per-minute rates recomputed from each bucket's own seconds; a phase shorter than 60 s ⇒ null.
- Not passed ⇒ option stays excluded (design), no coefficient change, no metric/seed change after results. The redesign range 7001–7400 is an Owner decision (D-18), not used here.

## Tasks
- **T1 prerequisite (src)**: `identityOfKnobs` current-phase lookup then construction-time map; director gate C section (no knobs/identity caching in engine state; `this.t` writers; tick reads Director only after `this.t += dt`). Re-register v21 candidate fingerprint (behaviour unchanged). Gates: director, simversion, golden v21a, match_setup, skeleton, laneframe. Reviewer → commit.
- **T2 instrument (tools only)**: `tools/lib/phaseBucketSim.mjs` (per-phase engages / engageStarts / exec snapshots at the Director's boundaries, independent whole-match counters) + deterministic self-check gate `tools/check_phase_bucket_c3.mjs`. Reviewer → commit before any measurement.
- **T3 registration + measurement tool**: `tools/fixtures/phase_stance_registration_c3_2.json` + zh-TW md; `tools/measure_phase_stance_c3.mjs` (resumable, STOP file, single line, write-once result). Excluded options are run through the legacy-config path (std template + one phase choice via the Resolver's `mergeTacticConfig`), control = std template through the same path. Reviewer → commit. Then run.
- **T4 report**: result fixture (write once) → commit raw evidence. Any failing option stays excluded; no promotion of passing options without Owner (Registry/truth-table change is a separate step).
- **T5 regression**: truth table re-measure under the new fingerprint (rows must be bit-identical), all registered gates, build. 05/08/ledger. Final reviewer. Commit. Stop for Owner.
