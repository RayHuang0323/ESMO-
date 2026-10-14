# MOBA Phase 3a-C0 → C1 → C2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear the measurement-tooling debt that makes engine work expensive (C0), lay the contracts and baselines for the Tactical Director (C1), then move the engine's existing tactic reads behind a Director core with bit-identical results (C2).

**Spec / authority:** `review/tactic-book-3a/Phase3_後續規劃建議.md` (Owner agreed the staging 2026-10-15; §2 Director core, §4.1 C0, §4.2 C1–C2, §6 versions) and `docs/design/MOBA_Tactical_AI_Phase3_正式架構.md` (§3 ruleset, §5 protection list, §7 refactors). Owner's overnight authorisation 2026-10-15 02:15: C0 → C1 → C2 in order; C3–C10 NOT started.

**Architecture:** C0 changes tools only (no simulation semantics). C1 adds a data contract, an optional ruleset layer and a new golden baseline — no behaviour change. C2 is a pure refactor of `LogicEngine` tactic reads behind a Director that, for every existing input, returns exactly the knobs the engine reads today.

**Tech stack:** Node ESM (`node tools/*.mjs`), no test framework; gates are `tools/check_*.mjs`, long ones through `tools/verify.mjs`.

## Global Constraints

- Branch `feature/moba-phase3a`, worktree `.sprints/moba-tactical-ai-p2`. Local commits only. **No push, no deploy, no merge to main.**
- **Strictly sequential:** never modify C0 and C1/C2 code at the same time; never edit `src/` or measured tools while a measurement or long gate is running (workers load files from disk mid-run).
- **No simulation-semantics change in C0, C1 or C2.** v20 golden (`tools/fixtures/match_golden_v20.json`, 39 cases, `check_match_setup_3a`) must stay bit-identical at every commit. C2 additionally must be bit-identical to the v21-A golden captured in C1 (G-AC1).
- **No new tactic behaviour** before C3 (phase switching, win condition, strong side, objective order are C3+ and need Owner contracts).
- v20 rulesets (`career.v20`, `challenge.v20`, `balanceTool.v20`) are frozen objects: not one field may be added or changed (they are hashed into `MatchSetup`).
- Every change to a `SIMULATION_SEMANTICS_FILES` entry re-registers the `moba-sim.v21` candidate fingerprint (existing practice, `check_simulation_version_gate`). v20 fingerprint `050b3f66620f0f57` never changes.
- Gates may not be weakened to pass. Statistical thresholds unchanged. A gate whose count changes must say so in the report with the reason.
- `node_modules` is a junction into Codex's CS worktree: never `npm install`/`npm ci`, never clear `.vite`. Do not touch CS code/evidence (`src/battle/fps/**`, `src/screens/fps/**`, CS gates' evidence files), the map/topology, or any other worktree.
- Long runs single-line, logs to the session scratchpad (never shell-redirect into the OneDrive repo path), measurement data under `C:/Users/ifikn/esmo-measure/` (outside the repo).
- Text: code/commits English; handoff docs zh-TW. Edit tool flattens CRLF in mixed-EOL files: `docs/handoff/05_Sprint紀錄.md` and `08_目前待辦與風險.md` are appended byte-level only.
- Stop and save progress (do not work around a gate) on: a needed semantics change, a new regression, an important design conflict, or resource shortage.

---

## C0 — Measurement tooling (no simulation semantics)

### Task 1: Measurement provenance — shared hashes, dependency-based staleness, follow-up fixtures carry hashes, crashed-worker requeue

**Why:** today the truth table (`tools/fixtures/tactic_truth_3a.json`, gate `check_tactic_truth_3a`) is invalidated by a text hash over all `SIMULATION_SEMANTICS_FILES`, so unrelated semantics files (e.g. `liveMatchSetup.js`, which the truth worker never loads) force a ~1.7 h re-measure, while 31 `src/` files the worker does load are not protected at all (08, "依賴式失效判定" evaluation). The follow-up fixtures (`tactic_followup_3a_{replication,quickmode,templates}.json`) record only `gitHead` (TD-3A-11), and the follow-up runner loses a crashed worker's in-flight match (TD-3A-12).

**Files:**
- Create: `tools/lib/tacticMeasureProvenance.mjs`
- Modify: `tools/check_tactic_truth_3a.mjs` (hash code at lines ~72–105 moves into the lib; staleness check uses the lib; worker records loaded files; new negative checks)
- Modify: `tools/measure_tactic_followup_3a.mjs` (meta carries the same hashes + loaded files; requeue)
- Modify: `tools/check_tactic_replication_3a.mjs` (staleness check when the fixture has hashes; legacy fixtures keep today's check)
- Do NOT modify: `tools/lib/tacticTruthSim.mjs` measurement logic, any `src/` file, any committed fixture (fixtures are rewritten only by Task 2's re-measure).

**Requirements:**
1. Move the existing hash functions (`registryHash`, `resolvedHash`, `mappingHash`, `templatesVersion`, `harnessHash`, `harnessVersion`, `simVersion`) into `tacticMeasureProvenance.mjs` **with identical algorithms** (same normalisation: `stripComments` + whitespace collapse; same `stableHash`/`stableStringify`). `check_tactic_truth_3a.mjs` imports them; behaviour of those hashes must not change (prove: the lib's values equal the values the old inline code produces on the current tree).
2. **Dependency-based staleness replaces `engineHash`:** each measurement worker records every module file it loads that lives under the repo root (use Node's synchronous module hooks, `module.registerHooks`, Node ≥ 22.15; this machine runs v24.18). Store in the fixture meta `loadedFiles: { "<repo-relative posix path>": "<sha16 of normalised content>" }` = union over all matches of the measurement. Staleness = any recorded file missing or with a different normalised hash, plus the other hash fields as today. `engineHash` is removed from new fixtures.
3. **Probe for new dependencies (fast mode):** the gate runs ONE truth match (smallest existing worker entry, `--truth-worker` with a fixed seed/arm) in a child process and checks that the set of repo files it loads ⊆ `Object.keys(meta.loadedFiles)`; a file outside the set ⇒ stale (`new dependency <path>`). Budget: a few seconds.
4. Negative checks in `check_tactic_truth_3a` (alongside the existing N3/N3b/N3c): a recorded loaded file's hash changed ⇒ stale; a recorded file missing ⇒ stale; probe reports an unrecorded file ⇒ stale; a semantics file that is NOT in `loadedFiles` changed ⇒ NOT stale (this is the intended saving — assert it explicitly so it cannot drift silently).
5. Old-format fixture (has `engineHash`, no `loadedFiles`) ⇒ the gate reports stale with the reason `fixture predates dependency-based staleness; re-run --measure`. No compatibility path that would let an old table pass.
6. Follow-up runner: final fixture meta gains the same hash object + `loadedFiles` (union) in addition to `gitHead`. On a worker exit while it holds an in-flight match without a result, put that match back on the queue (at most 2 requeues per match, then count it as failed). Existing CLI, batch files and resume behaviour unchanged.
7. `check_tactic_replication_3a`: if `meta.loadedFiles` exists ⇒ full staleness check via the lib (any stale reason ⇒ fail). If not (the three committed fixtures today) ⇒ keep today's `simVersion` check and print one explicit line `legacy provenance: gitHead only (TD-3A-11) — staleness not mechanically checked`. Do not add a check that the legacy fixtures pass by default.
8. Self-test before reporting: run `node tools/check_tactic_truth_3a.mjs --measure` on a **tiny** sample is not available — instead run the worker once directly (the probe) and print the loaded-file list; run the gate in fast mode and confirm it reports the old fixture as stale with requirement 5's reason (expected red until Task 2) while all other checks still pass; run `node tools/check_tactic_replication_3a.mjs` (must stay green); run `node tools/check_simulation_version_gate.mjs` (must stay green — if it goes red because a touched file is in `SIMULATION_SEMANTICS_FILES`, stop and report, do not re-register).

- [ ] Implement requirements 1–7
- [ ] Self-test (requirement 8), outputs in the report
- [ ] Commit: `Phase 3a-C0: dependency-based staleness for tactic measurements; follow-up fixtures carry provenance hashes; requeue crashed matches`

### Task 2: Truth table re-measure in the new format (controller-run)

- [ ] With nothing else running: `node tools/check_tactic_truth_3a.mjs --measure --workers=3 --dir=C:/Users/ifikn/esmo-measure/truth-3a-c0` (≈1.7–2 h; log to scratchpad; resumable).
- [ ] Compare every row of the new fixture with the previous committed fixture (`git show HEAD~:tools/fixtures/tactic_truth_3a.json` at the pre-Task-2 commit): all 91 rows' statistics, verdicts and n must be identical; only `meta` may differ. Any row difference ⇒ STOP (measurement harness changed behaviour).
- [ ] Gate fast mode green; commit fixture: `Phase 3a-C0: truth table re-measured with loaded-file provenance (91 rows identical)`

### Task 3: tactic24 blind spots and verify shapes

**Files:** Modify `tools/check_moba_tactic24.mjs`, `tools/verify.mjs`.

1. TD-3A-21/22: in the existing assertion "useLocalServer → assembleMatch → engine.configureMatch（含 standard 對手）" (keep it ONE assertion; gate stays 29 checks), replace `/A\.resolveTactic\(/` with a pattern requiring the assembler's own adapters as the 2nd argument (`A.resolveTactic(t, A, …)`), and add a pattern requiring `resolved[side] = snap` (the assignment keyed by the loop's own `side`). Both on the comment-stripped source.
2. TD-3A-16: `verify.mjs` segments `q5_history` (shape `/66\/66 通過/`, gate prints `69/69 通過`) and `hero_skills_round2` (shape `/Hero Skills Round 2: PASS 17\/17/`, gate prints `PASS 410/410`): use a shape that requires passed == total via a back-reference (e.g. `/(\d+)\/\1 通過/`), not a hard-coded count and not a pattern that accepts `68/69`.
3. Verify: `node tools/verify.mjs --only=q5_history,hero_skills_round2` ⇒ both PASS; `node tools/verify.mjs --only=tactic24` ⇒ 27/29 with exactly the two pre-existing reds (`m6 全圖游走 Gank 次數 > m4`, `BattleResult.v2 結構未變`), the wiring assertion ✅. Prove with a scratch mutation script (outside the repo) that the predicate is false for: assembler passes `{}` instead of `A`; assembler stores `resolved[side === "blue" ? "red" : "blue"] = snap`.
- [ ] Commit: `Phase 3a-C0: tactic24 checks the resolver adapters and side keying; verify shapes require passed == total`

### Task 4: C0 acceptance and records (controller)

Safety gates (all must pass to enter C1): `npm run build`; `check_tactic_truth_3a` green on the new fixture; `check_tactic_replication_3a`; `check_tactic_registry_3a`; `check_tactic_indicators_3a`; `check_tactic_book_view_3a`; `check_simulation_version_gate` (no fingerprint change expected); `check_match_setup_3a` (v20 golden 39/39); `verify --only=tactic24,q5_history,hero_skills_round2`. Independent reviewer per task. Records: SDD ledger, `05`/`08` appended (byte-level), commit `Phase 3a-C0: acceptance record`.

---

## C1 — Contracts, ruleset layer, v21-A golden (no behaviour change)

### Task 5: `TacticalDirective.v1` contract

**Files:** Create `src/platform/contracts/tacticalDirective.js`, `tools/check_tactical_directive_3c.mjs`; add a `verify.mjs` segment.

- The directive is the engine-facing "current tactic in effect" for one side: `{ schema: "TacticalDirective.v1", side: "blue"|"red", phase: 0|1|2, knobs, identity }` where `knobs` has **exactly the field set of `toEngineTactic(...)`** and `identity` has exactly the field set of `toEngineTacticIdentity(...)` or is `null`. No new vocabulary, no numbers of its own.
- Exports: `TACTICAL_DIRECTIVE_VERSION`, `validateTacticalDirective(d)` (errors list; rejects missing/extra knob fields, wrong types, unknown side/phase, non-plain objects), `staticDirective({ side, phase, knobs, identity })` (deep-frozen copy, no mutation of inputs).
- Not imported by the engine, assembler or UI in C1 (nothing loads it yet ⇒ no fingerprint change, no truth staleness). Gate: field sets equal the projection field sets for m1–m8 and std; validator negatives; inputs not mutated; frozen output.
- [ ] Commit: `Phase 3a-C1: TacticalDirective.v1 contract (knob/identity field sets of the existing projections)`

### Task 6: Ruleset layer `tacticalDirector`

**Files:** Modify `src/platform/contracts/matchRuleset.js`, `tools/check_match_ruleset_3a.mjs`.

- Optional layer `layers.tacticalDirector`; **absent ≡ `"static"`**. The only accepted value in C1/C2 is `"static"` (Director returns the configured knobs; = today's behaviour). Any other value is rejected by `validateRuleset` (`tacticalDirector`), so nothing can switch on unimplemented behaviour (RS-1 spirit).
- v20 ruleset objects are not modified (assert byte-identical `stableStringify` against the pre-change values captured in the gate as literals or from git) and `resolveRulesetForMode` output for v20 is unchanged (the golden setup hashes depend on it).
- Gate additions: absent ⇒ static; `"static"` accepted; any other string, non-string ⇒ rejected; v20 rulesets unchanged; `resolveRulesetForMode` unchanged for the existing flag combinations.
- `matchRuleset.js` is a semantics file ⇒ re-register the v21 candidate fingerprint per practice; truth table becomes stale (it is loaded) ⇒ Task 8 re-measures.
- [ ] Commit: `Phase 3a-C1: optional ruleset layer tacticalDirector (absent = static; only static accepted)`

### Task 7: v21-A golden baseline (G-AC1 reference)

**Files:** Create `tools/capture_match_golden_v21a.mjs`, `tools/fixtures/match_golden_v21a.json`, `tools/check_match_golden_v21a.mjs`; add a `verify.mjs` segment.

- Same three paths and case mechanics as `capture_match_golden_v20.mjs` (reuse its helpers by import where possible; no copy of its logic), on the current tree, plus binding-based cases: every one of the 21 templates as blue vs `std` through the live path (binding input), and every currently offered non-own choice on `std` (8) — fixed seeds. Records full result hashes (digest, stream hash, result hash) like the v20 golden.
- Check mode re-runs and requires every case identical. Records `simVersion`, `gitHead` and the v21 fingerprint at capture.
- Captured AFTER Task 6 so it reflects the final pre-C2 tree.
- [ ] Commit: `Phase 3a-C1: v21-A golden baseline (v20 cases + 21 templates + offered choices)`

### Task 8: C1 acceptance and records (controller)

Truth re-measure if stale (expected, Task 6) with the 91-row identity check; gates: build, `check_match_ruleset_3a`, `check_tactical_directive_3c`, `check_match_golden_v21a`, `check_match_setup_3a` (v20 39/39), `check_simulation_version_gate`, `check_tactic_truth_3a`, `check_tactic_replication_3a`, `check_match_assembler_3a`, `check_live_setup_3a`, `check_challenge_setup_3a`, `check_balance_runner_setup_3a`, `regress`, `regress2`. Independent reviewers; records; commit.

---

## C2 — Director core and equivalent migration (pure refactor)

### Task 9: Read-point inventory (controller + read-only explorer)

Inventory every place `LogicEngine.js` reads tactic data (`this.tk[...]`, local `K` from it, `this._tac[...]` state seeded from knobs, `this.tid[...]`/`_tidOf`, `_tidPhase`) with line, field, and whether the read is per tick or once. Output: a table in the SDD workspace. The C2 task brief (Task 10) is written from this table; scope = all knob/identity reads (partial migration would leave two read paths and fail G-AC2).

### Task 10: Director core + migration

- `src/battle/moba/tactics/tacticalDirector.js` (added to `SIMULATION_SEMANTICS_FILES`): built in `configureMatch` from the same `blue`/`red` knobs and identity the engine receives; `directive(side)` returns a `TacticalDirective.v1` whose `knobs`/`identity` are the configured ones for every tick (`static` mode). Owns the phase function (`_tidPhase` logic moves here unchanged: 480 / 960 s).
- Every inventoried read goes through the Director. No new rng draws, no change in evaluation order, no float re-association (see memory: flag-off must keep the same float order).
- Gates: **G-AC1** `check_match_golden_v21a` all identical; **G-A2** v20 golden 39/39; **G-AC2** new `tools/check_tactical_director_3c.mjs`: on the comment-stripped engine source, no direct `this.tk[` / `this.tid[` reads outside the Director bridge (allow-list exact, enumerated), plus behaviour checks (Director returns configured knobs; frozen; side isolation).
- Then: fingerprint re-register; truth re-measure with 91-row identity; `regress`, `regress2`, `runtime29` (verify), `tactic24`, `items_m2`-style legacy fingerprint gates if they read engine paths; independent reviewer on the most capable model.
- [ ] Commit(s): `Phase 3a-C2: Tactical Director core (static); engine tactic reads go through the Director (bit-identical)`

### Task 11: C2 acceptance and records (controller)
