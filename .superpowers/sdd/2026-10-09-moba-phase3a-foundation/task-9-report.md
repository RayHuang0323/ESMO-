# Task 9 report — tacticResolver.v1

## Files
- NEW `src/battle/moba/tactics/tacticResolver.js` — resolver, CHOICE_MAPPING, offeredChoices, `makeResolver({mapping})` (lets the gate plant a doctored mapping).
- NEW `tools/check_tactic_resolver_3a.mjs` — 104 checks.
- `src/battle/moba/matchAssembler.js` — `binding` branch via `deps.engineAdapters.resolveTacticBinding`; error `tactic_binding_rejected` (field `tactic.<side>[.sub]`, message `[resolverCode] ...`); `deps_missing` if the adapter is absent and a binding is present. Projection still uses the injected `toEngineTactic/Identity`.
- `src/battle/moba/matchAssemblerDepsCore.js` — canonical adapters `resolveTacticBinding`, `TACTIC_RESOLVER_VERSION`; manifest gets `engineAdapters.resolveTacticBinding` and `tacticResolverVersion` (so depsFingerprint changes; not pinned anywhere).
- `src/platform/contracts/matchRuleset.js` — `TACTIC_KINDS_BY_RULESET` (outside the hashed ruleset object). `matchSetup.js` — enforces it (`tactic_kind_not_allowed`).
- `src/platform/contracts/simulationVersion.js` — semantics list + tacticResolver/Templates/Plan/Registry; v21 re-registered.
- `tools/check_tactic_plan_3a.mjs` — probe re-pointed to `Resolver.applyChoice` (private mapping deleted; R3e now sets `macro.lateGame` directly). 219/219 before and after.
- `tools/check_match_assembler_3a.mjs` — A4/A4b/A4c re-pointed (placeholder binding was `tactic_binding_unsupported`/"Task 9"; now `tactic_binding_rejected`, zero configure calls, message carries resolver cause). Same strictness.

## Mapping table (dimension, choice -> knob = value; source)
- phases.early/mid.stance: aggressive|standard|defensive|scaling -> macro.earlyGame/midGame = same enum (PHASE_ENUM). phases.late.stance: standard|defensive|scaling -> macro.lateGame.
- jungle.tempo: slow|standard|fast -> macro.tempo (TEMPO_ENUM).
- jungle.focus: gank|farm|invade -> lanePlan.jungle; plus onLeaveInvade: if base jungle is invade and choice is not, objectives.invadePriority = min(current, std value 0.1 read from the std template — not a literal).
- lanes.top/mid.stance: aggressive|standard|defensive|split -> lanePlan.top/mid; lanes.bot.stance (no split) -> lanePlan.adc.
- seats.b5.mission: roam|protect|standard -> lanePlan.support.
- seats.b1/b3/b4.priority: core -> economy.carryPriority = top/mid/adc; normal -> balanced only if carry is currently that lane.
- risk.tolerance -> macro.riskTolerance: cautious 0.3 (classic.m4), balanced 0.5 (std), bold 0.8 (classic.m3). Only numeric row.
Every target equals the Registry `basis` (gate M1c).

## offeredChoices exceptions (only 3 of 273 template x dimension cells, plus 3 overlay contexts)
`split` withheld on: classic.m2 lanes.mid, v2.top_solo_split lanes.mid, v2.mid_solo_split lanes.top (a second split lane is partly inert). No collision or no-effect exceptions exist; the m7 fix means gank != invade != farm. API: `offeredChoices(templateId, dim, overlayIds=[], otherChoices={})`; `offeredChoiceDetail` gives reasons. Gate pins the exception list and has 3 planted-mapping negative controls.

## Rulings
- A done (single table, plan gate consumes it, values pre-existing).
- B: m7 jungle.focus resolved by onLeaveInvade (invadePriority 0.8 -> 0.1, invadeChance 0.1, invadeWithMid false). Resolver rejects non-offered (`choice_not_offered`, or `multiple_split_lanes`). createTacticPlan itself is NOT changed (it lives in platform and cannot import the battle-layer resolver without a cycle) — rejection happens at resolve time.
- C: `multiple_split_lanes` post-merge; plan {m2, top: aggressive, mid: split} is accepted (offered check is evaluated against the other choices).
- D finding: only TacticScreen calls `applyVariant`, with variants filtered by `baseTacticId === selected tactic`, one variant at a time. So only the 3 original (classic.mN, overlay) pairs are reachable; applyVariant itself does not check the base and yields a mixed config otherwise. Resolver uses applyVariant for reachable pairs and rejects all other 60 template x overlay pairs with `overlay_base_mismatch` (incl. std and v2 donors, two overlays at once).
- E: binding re-validated via createTacticPlan (its codes pass through), canonical-form check, planHash recomputed, legacyTacticId check, strict field set; hostile inputs (Proxy/getter throw, cycles, 300-deep) never throw.
- F: three version fields each -> `*_version_mismatch`; assembler surfaces as error result.
- G: binding(classic.m4) and legacy(m4) setup hashes DIFFER (different input encodings: plan+versions vs full config) but produce bit-identical matches (calls, digest, streamHash, tacticMeta; tested). Same for `{kind:"std"}` vs binding(std). Only one encoding of a given plan is accepted (non-canonical forms rejected); the whole binding is in the setup hash. Accepted as the pair is a deliberate migration boundary, not a duplicate within a kind.
- H: matchRuleset has no existing tactic-kind governance (redTactic is informational). Spec §4.4 says Challenge history becomes binding (legacyMigrated) but does not say under which ruleset; conservative: challenge.v20 = legacy|std, career.v20 and balanceTool.v20 also accept binding (tool: my decision, spec silent; needed for G-A7 runs). Live NOT switched to bindings.

## RED -> GREEN
RED: with the resolver file removed, `check_tactic_resolver_3a` = `0/1 FAIL` (module not found). (Honest note: I drafted the resolver before writing the gate, so the RED was produced by temporarily moving the file away.) First GREEN attempt: 100/104 — four real defects fixed (prototype-key in rowOf, unfrozen binding result, a mis-planted control, D1 expected-callers list), plus M5 awaiting the plan-gate re-point. Final 104/104.

## Results (before -> after)
- check_tactic_resolver_3a: RED -> 104/104
- check_tactic_plan_3a 219/219 -> 219/219
- check_match_assembler_3a 215/215 -> 215/215 (39 goldens bit-identical)
- check_match_setup_contract_3a 85/85 -> 85/85; check_match_ruleset_3a 20/20 -> 20/20
- check_match_setup_3a 153/153 -> 153/153; check_live_setup_3a 119/119; check_challenge_setup_3a 62/62; check_balance_runner_setup_3a 121/121
- check_simulation_version_gate 79/80 (fingerprint stale) -> 80/80 (76 + 4 file-exists rows)
- check_tactical_identity_v17 22/22 (740 s); check_player_challenge_slice1 108/108; slice8 122/122
- 9 Live goldens with both tactics as bindings: all bit-identical (Z section).

## v21 candidate fingerprint
`e695aa910251481a` -> `048375d5ab576f18` (v1–v20 untouched).

## Spec/brief conflicts and concerns
- Brief's "30/30" corrected to 215/215. Slice8 is 122 (CLAUDE.md says 121).
- Concern: `split` on a template whose splitPush is ~0.05 (m1, m7, ...) changes `splitLane` but the split probability stays tiny; basis rule forbids touching macro.splitPush, so the option is nearly inert in play (knobs differ, so the gate passes). Task 10's reality gate should look at it.
- Concern: createTacticPlan/bindTacticPlan still accept non-offered choices; only the resolver rejects. UI must use offeredChoices.
- Cross-tree balance A/B (ESMO_BALANCE_ROOT) does not override the resolver; a tree lacking it gives `deps_missing` only when bindings are used.
- Files were CRLF in the working tree; Edit wrote LF, but git diff stays small (autocrlf normalization).
- Unrelated modified PNGs under review/ are not staged.
