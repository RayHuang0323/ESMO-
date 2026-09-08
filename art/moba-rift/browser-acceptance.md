# corridor-v3 Browser acceptance / 2026-09-08

Local own worktree, Vite 5188, Chrome, no publish.

## Completed before creature integration

- Formal resumed Battle → natural finish 22:50 → Result → credited settlement → Replay → Result → Dashboard.
- Old saved layout correctly uses 2D replay. Fixed misleading fallback text (layout mismatch was described as missing metadata).
- Desktop 1440×900: orthographic tactical map, drag exits director, scroll zoom, director can re-enable.
- Viewport 320/360/390/430: document width equals viewport, mobile team panel opens/closes, minimap remains visible. Browser emulation only, no Android physical-device claim.
- Fresh formal Lineup → Matchmaking → Ban/Pick → Tactic (Dragon strategy) → Loading → Battle from time zero. Normal 4× playback, no skip-result or injected battle state.
- Existing source gates remain corridor-v3 PASS; no geometry, world-size, speed, or simulation changes during browser acceptance.

## Fresh formal Battle and Replay completed

- Fresh game finished naturally at 24:07, 4:10. runtime-v2 3D Replay verified pause, +10s, next event, seek-to-end (matching 4:10), 390px viewport, and zero console errors.
- Browser found Replay inherited Result scroll clipping. Fixed presentation overlay with a body portal and fixed viewport bounds; added top close button. Desktop and 390px rechecked. One paused foreground Replay sample: 59.8 FPS / 589 calls / 107319 triangles; not a live combat FPS guarantee.
- Creature integration completed; second real Battle ran naturally to 25:39, 8:18. Dragon HP/death/respawn and Baron HP/death/countdown observed. Post-integration Replay seeks to 25:39 with matching 8:18, no console errors. Exact two-second Death pose was not captured by browser sampling; real-engine animation-policy gate covers its timing.
- Stable foreground FPS measurement: tool-driven samples include browser throttling (~1 FPS), unsuitable as device performance claims. Fresh Battle early sample 37.8 FPS / 495 calls / 137949 triangles; later active combat sample 624 calls / 161087 triangles. Different camera/units, not a controlled A/B.

## Animation source audit

- Live runtime adapter exposes objective/member attackAt, hitAt, deathAt, alive, HP, position, targetId, respawn state.
- Existing replay retains objective/member HP and respawn data but omits per-member movement and attack/hit timestamps. Do not fabricate old-recording attacks or run simulation to reconstruct them.
- Cosmetic clips must sample simulation time, keep snapshot position authoritative, and never apply root-motion movement or write Battle state.

## Post-integration performance and limits

- Final culled Replay sample: 482 calls / 94459 triangles at the end, 466 calls / 73307 triangles near start. Different framing from prior samples; not an A/B performance claim. Browser throttling makes sampled 2–42 FPS unsuitable for a stable device benchmark.
- Six original Blender rigged species exported, 5 material primitives per creature, about 11.3 MB total GLB downloads. Real-time skinning and added geometry have a performance cost; no physical Android FPS or touch acceptance claimed.
- Diagnostic overlays can intercept bottom Result buttons at 390px with `?diag=1`; desktop restored to open the final replay. This developer-only overlay is not the normal player UI.
- Existing replay event text includes an undefined lane label for a nexus guard; no engine/event-contract rewrite included in this presentation asset task.
