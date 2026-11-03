# MOBA Phase 3a-C3 Pre-work Plan (no new tactic behaviour)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Everything C3 needs before its first behaviour change: Owner decision table for D-1..D-20, a fix proposal for TD-3A-23 (red top/bot knob mirror), tools reading tactic data only through the Director, CLAUDE.md gate rules for C0–C2, a conservative evaluation of the simulationVersion.js staleness cost, and a C3 start checklist with gates.

**Authority:** Owner 2026-10-15 10:40 request. Safe tool/doc work may be done, verified, independently reviewed and committed locally. No C3–C6 behaviour, no red-mirror semantics fix, no push/deploy/main.

## Global Constraints
- HEAD at start `47a2708`. Local commits only.
- No simulation-semantics change: no edit under `src/` in this round. v20 golden (`check_match_setup_3a` 153/153) and the C2 Director equivalence (`check_match_golden_v21a` 131/131) must hold at every commit.
- Gates may not be weakened; count changes must be explained.
- Tool changes that touch measured files (`tools/lib/tacticTruthSim.mjs`) stale the truth table ⇒ re-measure with the 91-row identity check before acceptance.
- `CLAUDE.md` is an institution file: backup `_backup_YYYYMMDD_CLAUDE.md` first; it is CRLF — byte-level insert only.
- CS worktree isolation; do not touch other uncommitted data (6 PNGs, `review/moba-combat-feedback/`). Single-line long runs.

## Tasks
1. **Tools read through the Director** — `tools/lib/tacticTruthSim.mjs`: replace `e.tk?.[side]` (line ~116) with the Director API and remove the duplicated `PHASE_EDGES` (line ~39) in favour of the Director's phase function; `tools/check_tactical_identity_v17.mjs:98`: replace `e.tid` with the Director API. No `src/` change: if the Director lacks a needed export, STOP and propose. Prove equivalence: identity_v17 22/22, truth gate stale only by `harnessHash`, then Task 2.
2. **Truth re-measure** (controller) — 91 rows + all non-meta identical.
3. **Owner decision table** (doc) — `review/tactic-book-3a/C3_Owner決策表.md`: D-1..D-20, each with recommendation, in-game effect, risk, recommended option, needs-Owner-approval flag; win conditions first.
4. **TD-3A-23 fix proposal + simulationVersion.js evaluation** (doc) — `review/tactic-book-3a/TD-3A-23_紅方路線對調修正方案.md`: full investigation, unified team-relative ↔ world lane mapping, v21 ruleset isolation, red/blue symmetry gate; separate section evaluating the simulationVersion.js staleness cost with a conservative recommendation (no exclusion).
5. **CLAUDE.md gates** (controller) — add the C0–C2 gates and rules to the 現役 gate list.
6. **C3–C6 draft remaining minors + C3 start checklist** (doc, after 3 and 4) — `review/tactic-book-3a/C3_開工清單.md` and consistency edits to the DRAFT.
7. **Acceptance + records** (controller) — gate run, 05/08, commits.
