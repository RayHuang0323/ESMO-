<!-- 本檔由 Claude Code 於 H.1-close 產出：內容是 Codex 的原始輸出，未經改寫。 -->
<!-- 呼叫方式：codex exec -m gpt-5.6-sol -c model_reasoning_effort=high -s read-only -i <9 張截圖> -->
<!-- 第一輪判定 FAIL（3 blocking）→ 依規則只做一輪修正 → 本檔為第二輪（最終）判定。 -->

# CODEX RUNTIME MAP REVIEW — H.1 (round 2)

- Model / effort / sandbox: Codex (GPT-5 family) / high / read-only
- Overall verdict: **FAIL**

## 1. Do the shots really show 5 blue + 5 red heroes? — PASS

`01_runtime_full_battle.png` visibly contains five blue and five red capsules. `shot_stats.json` corroborates `blueHeroCount: 5`, `redHeroCount: 5`, and ten on-screen hero IDs.

## 2. Are all 10 heroes identifiable in the full-map shot? — PASS

The ten heroes are spatially distinct, faction-coloured, ringed, and labelled. The measured minimum separation is 4.71% of the viewport diagonal. One blue hero is close to the bottom edge but remains countable and distinct.

This resolves the first-round ten-hero blocker.

## 3. Is any hero still rendered as a flat colour block? — PASS

No. Images 01–05 show shaded capsule bodies with darker shoulder geometry. Image 05 clearly demonstrates volumetric bodies, HP bars, levels, names, and selection rings. Diagnostics identify `CapsuleGeometry` and `MeshStandardMaterial` for all ten bodies.

## 4. Do heroes clip through walls, float, or sink into terrain? — RISK

No obvious wall clipping or floating is visible in the submitted lane/jungle views. However, `MobaRuntimeHeroes.jsx` fixes every hero to `LAYER_Y.lane_surface` and explicitly acknowledges that heroes on the raised base platform can sink by about three world units.

Acceptable as a disclosed H.2 prototype limitation, but not resolved.

## 5. Are towers or the nexus duplicated? — PASS

No visual duplication is apparent. Runtime terrain is mounted with `towers: false`; `MobaRuntimeStructures` supplies the snapshot-driven structures. Diagnostics report 18 towers and two nexuses with unique IDs.

## 6. Are hero positions consistent with lanes and jungle? — PASS

Images 01–04 show plausible three-lane, river, jungle-camp, and objective rotations. Image 02 establishes early lane distribution; images 01 and 04 show later jungle/objective movement without obvious off-map placement.

## 7. Is blue/red faction identification clear? — PASS

Faction identification is clear through body colour, shoulder colour, selection rings, HP treatment, tower crystals, labels, and HUD colour coding.

## 8. Does the HUD cover the main battle area? — PASS

The desktop HUD occupies peripheral regions and leaves the main tactical area readable. The top scoreboard, left event feed, right controls, bottom team strip, and minimap do not materially obscure central engagements in images 01–05.

## 9. Is the mobile screen usable? — PASS

Images 07 and 08 are materially improved:

- The minimap is completely visible above the collapsed team sheet.
- Measured bounds are minimap bottom `804px` versus team-panel top `812px`, with `0px` overlap.
- The screenshot-harness waiting hint is gone.
- The scoreboard, map controls, focused hero, minimap, and team strip remain readable.

This resolves the first-round mobile safe-area blocker at the submitted 430×900 viewport. Narrower widths and physical-phone interaction remain unverified risks.

## 10. Does Replay use the same runtime map? — PASS

Image 09 visibly uses the same terrain, towers, bases, river, pits, heroes, and camera language as runtime-v2.

Source confirms that runtime replay mounts:

`MobaRuntimeView3D quality={qualityId} source={source}`

The coordinate contract now correctly documents this path. Replay pause stability and seek-driven position changes are also recorded as true.

## 11. Is performance good enough to continue to H.2? — PASS

Measured results are sufficient for continued prototype development:

- Desktop: 60 FPS, 220 draw calls, 86,887 triangles.
- Mobile-sized buffer: 60 FPS, 87 draw calls, 59,091 triangles.
- Replay: 58.9 FPS despite the disclosed third canvas.

These are real-Chrome AMD GPU measurements, not physical-phone results, but they are adequate for advancing to H.2.

## 12. Can H.1 be formally declared complete? — FAIL

Two acceptance defects remain:

1. The Sprint record still states that Replay uses the legacy path, directly contradicting the updated coordinate contract, source, and image 09.
2. `03_runtime_midgame.png` does not visually demonstrate its required dead hero. The JSON records one dead hero, but the rendered corpse is lowered, 28% opaque, unlabelled, and visually indistinguishable from the terrain. Supporting telemetry cannot replace the required primary visual evidence.

Therefore H.1 cannot be formally declared complete from this final submission.

## Blocking issues

1. **The original documentation blocker remains in the actual workspace.**

   `docs/handoff/05_Sprint紀錄.md:1482` still says:

   > Replay 畫面（`MobaReplayScreen`）仍走 legacy 呈現路徑

   This contradicts:

   - `docs/architecture/MOBA_RUNTIME_MAP_COORDINATE_CONTRACT.md` §6
   - `src/screens/moba/MobaReplayScreen.jsx`
   - `09_runtime_replay.png`

2. **The required dead-hero state is not visually readable in image 03.**

   `shot_stats.json` records `deadHeroCount: 1`, `capturedDeadHero: true`, and six destroyed towers. The destroyed-tower state is visible, but the dead hero is only a faint, sunken residual body with no label or ring. It cannot be reliably identified by viewing the screenshot alone.

## Non-blocking risks

- Heroes can sink into raised base platforms until terrain-height queries are implemented in H.2.
- Replay keeps the underlying GameView canvas mounted, producing three canvases and avoidable GPU load.
- Mobile evidence covers 430×900 in desktop Chrome, not 320/360/390 widths or a physical phone.
- Mobile FPS does not establish touch responsiveness, thermal behaviour, or sustained physical-device performance.
- Prototype capsules remain acceptable for H.1 but are not final hero assets.
- One blue hero in image 01 is close to the bottom boundary; it is countable, but future acceptance captures should retain more edge margin.
- `docs/handoff/06_目前主幹架構.md` still describes the pre-H.1 Replay renderer arrangement and does not document the conditional runtime-v2 path.

## Missing verifier coverage

- `check_moba_runtime_map_h1.mjs` does not check Sprint-record/coordinate-contract consistency.
- Its Replay check verifies adapter JSON round-trip compatibility, but does not assert that `MobaReplayScreen` actually mounts `MobaRuntimeView3D` in runtime-v2 mode.
- No automated check assesses whether a dead hero is perceptually distinguishable in the required midgame screenshot.
- The screenshot diagnostics treat a projected, scene-visible 28%-opacity corpse as visible even when it is not visually recognizable.
- Mobile safe-area measurements cover only 430×900 and no non-zero device safe-area inset.
- The capture tool labels `activePreset` from the requested filename/preset rather than probing the active `qualityId`. `loadQuality()` does not read the supplied `quality` URL parameter, so medium-versus-low capture provenance is not firmly verified.
- Performance coverage lacks physical-phone results, sustained sampling, frame-time percentiles, and Replay-underlay canvas cost isolation.

## Files inspected

- `AGENTS.md`
- `docs/README.md`
- `docs/ai/CODEX使用規範.md`
- `docs/ai/跨模型交接流程.md`
- `docs/handoff/00_目前專案狀態.md`
- `docs/handoff/05_Sprint紀錄.md`
- `docs/handoff/06_目前主幹架構.md`
- `docs/handoff/08_目前待辦與風險.md`
- `docs/architecture/MOBA_RUNTIME_MAP_COORDINATE_CONTRACT.md`
- All nine `review/moba-runtime/h1/*.png` acceptance images
- `review/moba-runtime/h1/shot_stats.json`
- `review/moba-runtime/h1/runtime_performance.json`
- `src/GameView.jsx`
- `src/battle/quality.js`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/map/MobaRuntimeMap.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeStructures.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/runtimeDiagnostics.js`
- `src/screens/moba/MobaReplayScreen.jsx`
- `tools/check_moba_runtime_map_h1.mjs`
- `tools/shot_moba_runtime.mjs`

No files were modified. No Git write, commit, or push operation was performed.
