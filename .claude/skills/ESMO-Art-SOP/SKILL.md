---
name: ESMO-Art-SOP
description: The single authoritative standard (Visual Bible + production SOP) for ALL 3D map art in the ESMO esports game. Use this whenever anyone wants to make, generate, add, regenerate, or iterate on ANY map art asset — rocks, trees, bushes, cliffs, rivers, terrain, walls, ruins, buildings, decorations, .glb props, low-poly models, or MOBA-style terrain pieces — even if they don't say "Blender", "art", or "SOP". Covers the full pipeline (procedural Blender generation → GLB export → preview render → review → confirm → import) AND the art canon every asset must obey (references/art-direction.md). Enforces: read the Visual Bible + all references first, design ESMO's own style from the shared MOBA design language (never copy any single image or any Riot asset), ship new asset types as 3–5 variant packs, stage everything in review/ first, and never touch the game project until the user approves. This is the shared standard for Claude, Codex, and any other AI working on ESMO map art.
---

# ESMO Map Art — Visual Bible & Production SOP

This skill is the **one standard** for every 3D map asset in ESMO, shared by all AIs
(Claude, Codex, others). It has two halves:

1. **The Visual Bible** — `references/art-direction.md`. The art canon: art direction,
   palette, per-asset styles, scale, materials, lighting, readability, performance,
   asset-pack rules, review checklist, and the禁止事項. **Every asset must conform to it.**
2. **The production SOP** — this file. How to actually generate assets with Blender and
   route them safely to review before they ever enter the game.

> **The prime directive:** ESMO does not copy League of Legends. We study the *design
> language* of a Summoner's-Rift-class MOBA map and build **ESMO's own consistent
> style** from it. Never model from a single reference image; never use any Riot
> official model, texture, UV, material, layout, building, or shape. Re-design from
> principles. The full reasoning lives in the Visual Bible — read it.

## The hard rules (never break these)

1. **Never import into the live project or edit game code during generation.** Output
   goes ONLY to `review/assets/` (`.glb`) and `review/preview/` (`.png`).
2. **Stop after generating and wait for the user to confirm.** Import is a separate,
   explicit step (see "Importing after approval"), only when the user says so.
3. **New asset *types* ship as Asset Packs (3–5 matching variants), not single meshes**
   — see Visual Bible §18. A lone mesh of a new type is not import-eligible.
4. **Conform to the Visual Bible.** If an asset materially fails its Review Checklist
   (§19), **regenerate/fix it yourself — do not bring off-style work to the user.**
5. **Never overwrite the reference images** in `docs/reference/moba-map/`.
6. Follow the project's big-file and destructive-command rules in `CLAUDE.md`.

## Prerequisites (check once per session)

- **Blender**: this SOP runs Blender headless. Don't assume a path — locate it with
  `scripts/find_blender.ps1`, which prints the `blender.exe` path (it prefers the real
  `blender.exe` over `blender-launcher.exe`, which detaches and breaks `--background`).
  Confirm it runs: `& "<path>" --background --version`.
- **The Visual Bible**: read `references/art-direction.md` — it is required reading,
  not optional. It has a table of contents; at minimum internalize the Mandatory
  Pre-build Process, the Color Palette (§3), the style section for what you're building,
  Scale (§13), Materials (§14), Asset Pack Rules (§18), and the Review Checklist (§19).

## Workflow

### 0. Mandatory pre-build (Visual Bible → "Mandatory pre-build process")

**Before any Blender geometry:** read ALL images in `docs/reference/moba-map/`, analyze
the features *common across all of them* (silhouette, scale, color, material, terrain
language), write down that synthesis, and design an ESMO-original asset from those
principles. Do not build from one image. This step is non-negotiable — it's what keeps
the art ours and cohesive.

### 1. Confirm scope with the user

Which type(s) and how many, plus any size/palette constraints. Remember: a *new type*
means a **3–5 variant Asset Pack** (§18), not one mesh. Keep assets within the §17
performance budget and §13 scale table.

### 2. Ensure the review folders exist

```
review/assets/     # exported .glb (the deliverable candidates)
review/preview/    # 512–768px preview .png per asset (or per pack)
review/README.md   # pipeline doc — keep its asset table current
```

Create if missing. Put nothing else in `review/`.

### 3. Write / adapt the generator script

Start from `scripts/gen_lowpoly_assets.py` (bundled; a working copy also lives at
`tools/blender_scripts/gen_lowpoly_assets.py`). It is the canonical pattern (boulder /
pine / bush) and already encodes the things the Bible requires: fixed seeds, procedural
geometry, two-slot base+accent PBR materials assigned by normal/height, flat/smooth
shading per class, and the standard 3-point EEVEE preview rig (Visual Bible §14–§15).
To add a type, add `build_*` functions and pack variants, following the per-type recipe
in the Bible (§5–§11) and the palette in §3.

### 4. Run Blender headless

```powershell
& "<blender.exe>" --background `
  --python .claude\skills\ESMO-Art-SOP\scripts\gen_lowpoly_assets.py `
  -- review\assets review\preview
```

Args after `--` are the output dirs. Watch the printed `GENERATION SUMMARY` and any
`Error`/`Traceback`.

### 5. Verify every preview against the Visual Bible (auto-reject gate)

Read each `review/preview/*.png` with the Read tool and actually look at it. Run the
**Review Checklist (§19)**: palette, silhouette/readability, scale & grounding,
materials, lighting, performance, pack consistency (§18), overall cohesion, and the
§20 negative checks. **If an asset materially fails, fix the script and re-run — do not
show the user off-style work.** Only surface assets that already conform; bring the user
real judgment calls, not obvious misses.

For a new-type pack, put all 3–5 variants in one preview (or a set) and confirm they
**intercut as siblings** before proceeding.

### 6. Update review/README.md and report

Keep the asset table in `review/README.md` current (asset/pack, glb path, tri count,
description). Then report:
- what was generated (table with tri counts; note pack variants),
- that previews are verified against the Visual Bible and where they are,
- **explicitly** that GLBs are NOT yet verified in a real glTF viewer / R3F (Blender
  export succeeding ≠ in-engine verified — say so),
- that nothing was imported and no game code changed,
- then STOP and wait for confirmation.

## Importing after approval (separate step, only when the user says go)

Only after the user approves a specific asset/pack:
1. Confirm the target directory in the live project with the user (don't guess where
   game assets live — ask or check `docs/handoff/06_目前主幹架構.md`).
2. Copy the approved `.glb`(s) from `review/assets/` into that directory.
3. Wire in per the architecture rules (no second asset system; respect "Legacy spec +
   modern architecture" in `CLAUDE.md`).
4. Run project verification (`npm run build`, relevant `tools/check_*.mjs`) and report
   real output.

## Files in this skill

- `references/art-direction.md` — **the ESMO Visual Bible** (required reading; the art
  canon every asset obeys).
- `scripts/gen_lowpoly_assets.py` — canonical procedural generator (boulder/pine/bush).
  Copy & extend for new types/packs; keep the seed / PBR two-slot / render-rig structure.
- `scripts/find_blender.ps1` — locate the Blender executable on this machine.
