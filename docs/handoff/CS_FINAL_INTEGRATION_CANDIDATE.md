# CS Final Integration Candidate Handoff

## Scope

- Baseline: `origin/main @ e86ace1183cc28af16bf24a7df3a1e61c7b294eb`
- Branch: `integration/cs-final-owner-preview`
- Worktree: `worktrees/cs-final-integration-candidate`
- Integrated in order: C5C Match Presentation → C6C outer progress → verified AWP fixes.
- No merge, push, deploy, new feature, balance change, or tactic-sync change.

## Integration decisions

- C5C remains the in-battle HUD / Match Presentation authority.
- C6C remains an outer MatchSession/simulation-state reader. It owns no score, round, timer, speed, or persistence state.
- The one overlapping `CsMatchScreen` edit was merged semantically: C5C owner-review bypass stays intact; C6C's once-only persisted frame-zero guard and outer progress wrapper are added around it.
- AWP runtime hunks are limited to role-wide personal-money buy fallback, T-side route continuation, and sniper acquisition envelope. Stale CBR metadata recalculation remains in the verifier/evidence adapter only.
- `RESIDUAL_TACTIC_SYNC_P1` is intentionally not fixed. `tacticForSidePhase` and side-swap design are unchanged.

## Verification

- C5C gate: 29/29 PASS.
- C6C static integration gate: 12/12 PASS.
- AWP focused verifier: PASS; non-eco pistol fallback 0, direct buy matrix covers full-buy / fallback / true eco, deterministic artifact digest `b9fa65a31b9986225ea094776748e6a867e8a89c1612226ea2298452e3cffd7f`.
- MatchSession: 36/36 PASS.
- Series: 46/46 PASS.
- Playable Series: 99/99 PASS.
- Competition release: 11/11 PASS.
- C5V: 35/35 PASS.
- C5A gunfeel: 17/17 PASS; gunplay presentation: 11/11 PASS.
- C5B utility: 55/55 PASS using current-valid C5B runtime evidence projections with source SHA provenance.
- C5B route interrupt direct simulation: 12/13; only the pre-existing `postPlantRetake mid-route engagement observed` fixture-coverage assertion remains absent on all three fixed maps. Completion, cadence, acquisition, tactical-route families, and navigation pass. No product change was made to chase it.
- Camera recovery: 8/8 PASS; RAF coherence: 7/7 PASS; StableCanvas: 5/5 PASS; renderer visibility: 24/24 PASS.
- CS23: 28/28 PASS.
- Production build: PASS. Existing Vite large-chunk warning remains.
- C5C browser evidence was regenerated on the integrated runtime for Mirage, Dust II, Inferno at desktop and 390px: HTTP 200, completed runs, no product-origin console/page errors, no horizontal overflow, C2C 10/10 rigged, P0 diagnostics clean.
- C6C browser E2E: 16/16 PASS. It covers Practice BO1, 390px, 2.4×, leave/reload/resume, BO3 transitions, Series Result and Competition handoff. The browser fixture accepts either a natural 2:0 or 2:1; it never injects a result.
- C5V browser smoke: 24/24 PASS. Practice covers Mirage, Dust II and Inferno; general matchmaking, BO1 and BO3 veto, 390px overflow, reload/resume and browser errors all pass.

## Owner acceptance boundary

- Android real-device touch, audio, thermal/performance, and long-session behavior remain pending.
- `RESIDUAL_TACTIC_SYNC_P1` remains a known gameplay balance/debt item and must not be inferred as closed by this integration.
- Preview URLs are local-only and are reported when the final Vite server is running.

## Production deployment

- Final main: `fe363d590885baa961de86fd889078af06f7137b`.
- Push: `e86ace1..fe363d5 main -> main`, no force push.
- GitHub Pages workflow `33618417280`: success.
- Production smoke: existing `44/44` plus targeted CS Desktop／390px smoke all PASS; no new page-origin console errors.
- Status: `CS_FINAL_INTEGRATION_DEPLOYED`.
