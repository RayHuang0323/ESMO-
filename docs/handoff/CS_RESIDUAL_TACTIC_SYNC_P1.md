# CS RESIDUAL_TACTIC_SYNC_P1 — handoff

## Scope and boundary

- Branch: `fix/cs-residual-tactic-sync-p1`
- Worktree: `worktrees/cs-residual-tactic-sync-p1`
- Runtime baseline used by this worktree: `origin/main @ dc9809976689daefddc1dc6ae5210ab601843e71`.
- The previously stated `a3c2d9a` baseline is an ancestor; current `origin/main` already contains the Meta progression / Club Assets commits. The Meta worktree was not checked out, edited, cherry-picked, rebased, or otherwise mutated.
- C5C and C6C worktrees were not modified. No AWP balance, CBR, Rating, `MATCH_BAND`, `starExcess`, tactic-sync design, or new feature was added.

## Root cause

`stable team identity` and `currentSideByTeam` were already separate in the CS rule state, but the selected tactic object was not projected to the side-specific tactic library after halftime / overtime side changes. A stable T tactic such as `t_apalace`, `t_long`, or `t_banana` could therefore be passed to a CT route planner while the planner was reading `routeLibraryBySide.ct`. The resulting route / formation authority was stale or illegal for the actual side. This is `RESIDUAL_TACTIC_SYNC_P1`, not an AWP balance issue.

## Final authority design

1. `teamId` remains the stable strategy owner (`us` / `enemy`).
2. `currentSideByTeam` remains the only authoritative actual-side state and is swapped by the existing halftime / overtime rule transition.
3. At every tactical phase selection, `projectCsTacticToSide(ownerTactic, { mapKey, side, phase })` deterministically maps the stable owner's semantic intent onto the current-side tactic library. Exact same-side IDs win; then same site + type, same type, same site, and finally a deterministic library fallback.
4. `tacticalRoutePlan` receives the projected current-side tactic together with `routeLibraryBySide[currentSide]`; it cannot receive T-only route nodes on CT or CT-only nodes on T.
5. `tacticOwnerByTeam` records stable ownership; `tacticBySide` plus tactical audit fields record the actual-side projection. There is no second writable tactic state.

## Files changed

Product runtime:

- `src/battle/fps/EsportsFPS3D.jsx` — deterministic side projection, actual-side tactic metadata, and diagnostic audit fields.

Verification / evidence:

- `tools/check_cs_residual_tactic_sync_p1.mjs` — same-seed natural completion and side-authority guard.
- `artifacts/cs-residual-tactic-sync-p1/authority-evidence.json` — Mirage / Dust II / Inferno seed-13 evidence.

No shared flow files changed: `AppShell.jsx`, `profileStore.js`, `DashboardScreen.jsx`, MatchSession contracts, Season / Competition, MOBA runtime, C5C presentation, and C6C progress are untouched.

## Focused evidence

`node tools/check_cs_residual_tactic_sync_p1.mjs`: **4/4 PASS**.

- Mirage: natural completion `13:6`, owner `t_apalace` remains stable, post-swap US side is CT with `c_std`; route samples begin with `ctSpawn`.
- Dust II: natural completion `35:37` after deterministic overtime, owner `t_long` remains stable, post-swap CT `c_astack` and T `t_midctrl`; every side swap used the correct spawn schema.
- Inferno: natural completion `4:13`, owner `t_banana` remains stable, post-swap CT `c_btop` and T `t_midctrl`; route samples begin with `ctSpawn` / `tSpawn` as appropriate.
- All three maps: actual-side tactic IDs are in the current-side library; wrong-spawn route count is zero; no stuck route was observed.

## Regression evidence

- CS Match completion: `36/36 PASS`.
- CS23: `28/28 PASS`.
- Series: `46/46 PASS`.
- Playable Series: `99/99 PASS`.
- MatchSession: `36/36 PASS`.
- C5V map / veto: `35/35 PASS`; browser `24/24 PASS`.
- C5A.2 final combat: `39/39 PASS`; C5A gunplay presentation `11/11 PASS`.
- C5B utility FX: `55/55 PASS`.
- C5B combat tactical audit: all assertions PASS against current-valid desktop / 390px evidence reused from the C6A/C6B audit line.
- C5C presentation browser: desktop and 390px three-map Battle evidence PASS; owner and Battle HTTP `200`; console / page errors `0`.
- C6C progress browser: `16/16 PASS`, including Practice, BO3 Map 1 → Map 2, reload / resume, 390px, and errors `0`. The standalone C6C static gate remains `12/12 PASS` on the unchanged C6C worktree; its intentional “C5C engine untouched” assertion is not applicable inside this P1 branch because this P1 necessarily changes the CS engine file.
- Camera recovery `8/8`, RAF/FIDX `7/7`, StableCanvas `5/5`, renderer visibility `24/24`, Training × Competition `13/13`, Season contract `73/73` PASS.
- Production build run directly with `npm.cmd run build`: **PASS**, Vite transformed `2777` modules. Existing warning remains: one minified JS chunk is about `3.2 MB` and exceeds the `500 kB` warning threshold.

## Existing verifier debt / interpretation

- `check_competition_release_gate.mjs`: product sections `10/10` PASS. Its build child printed `built in 9.45s` but the Node 24 Windows wrapper ended with `0xC0000409` after output generation. Direct build is PASS; this is a harness / process-exit issue, not a Rollup resolution failure.
- `check_cs_c5b_route_interrupt.mjs`: one existing timing assertion is red on the P1 runtime (`Inferno` p90 `2249ms`). The same assertion was reproduced on the pre-P1 AWP worktree as a timing debt; that pre-P1 run also had no post-plant-retake observations. The P1 fix restores correct post-swap route authority and must not be weakened to preserve stale-route timing.
- `check_cs_c5b_route_delay_audit.mjs`: the pre-P1 AWP worktree also reports existing unreasonable waits (`5`), so this is not a newly introduced gate rule and was not changed.
- Old AWP calibration rows remain quarantined; fresh AWP calibration is a separate follow-up after this authority fix.
- Android real-device GPU / FPS / touch / audio / thermal acceptance remains pending.

## Release decision

The runtime root cause is fixed and the authority guard is green. Before pushing `main`, the owner should decide whether the two existing C5B timing-verifier debts are accepted as non-blocking evidence debt or require a separate, explicitly scoped timing sprint. No gameplay timing or verifier threshold was changed in this P1.

## Marker

`RESIDUAL_TACTIC_SYNC_P1 = FIXED; RELEASE_PENDING_TIMING_DEBT_REVIEW`

## Release closeout — 2026-09-03

- `RESIDUAL_TACTIC_SYNC_P1 = CLOSED`。
- P1 runtime commit: `ef9f50e14d42dcf5fd50734a6d453c0b748022e9`。
- Integrated production `main`: `e3d2ee1fc2f53001d11d0bb090ffffd097b50285`。
- GitHub Pages workflow `33668856155` completed with `success`; production smoke passed.
- Production smoke coverage: V7 release `44/44 PASS`, Meta release `67/67 PASS`; direct CS Battle smoke covered Mirage / Dust II / Inferno at desktop and 390px, C5C HUD, C6C progress, reload shell, HTTP 200 and console/page errors clean. The first desktop Inferno attempt had a transient CDP disconnect; an isolated rerun passed `5/5`.
- Existing C5B timing-verifier long-tail and Node 24 gate-wrapper exit remain verification/tooling debt. They were reproduced before P1 and were not changed by this release.
