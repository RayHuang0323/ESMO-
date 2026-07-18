# ESMO Visual Bible — MOBA Map Art

This is the **single authoritative art standard** for every 3D map asset in ESMO. Any
AI (Claude, Codex, or others) that generates map art MUST conform to this document.
It is meant to be long-lived and maintained: when the canon changes, change it *here*
and everything downstream follows.

> **Core stance — learn the language, do not copy the game.**
> ESMO's goal is NOT to reproduce League of Legends. We study the *design language*
> of a Summoner's-Rift-class MOBA map — how it stays readable, how it layers terrain,
> how it uses silhouette and value — and from that we build **ESMO's own consistent
> style**. We never copy a single reference image, and never use any Riot official
> model, texture, UV, material, map layout, building, or shape. Everything is
> re-designed from the *principles*, not traced from the *pixels*.

## Table of contents

- [Mandatory pre-build process](#mandatory-pre-build-process) — do this every time
- [1. Overall Art Direction](#1-overall-art-direction)
- [2. Visual Keywords](#2-visual-keywords)
- [3. Color Palette](#3-color-palette)
- [4. Terrain Style](#4-terrain-style)
- [5. Cliff Style](#5-cliff-style)
- [6. River Style](#6-river-style)
- [7. Rock Style](#7-rock-style)
- [8. Tree Style](#8-tree-style)
- [9. Bush Style](#9-bush-style)
- [10. Ruins / Wall Style](#10-ruins--wall-style)
- [11. Building Style](#11-building-style)
- [12. Modular Asset Rules](#12-modular-asset-rules)
- [13. Asset Scale Rules](#13-asset-scale-rules)
- [14. Material Rules](#14-material-rules)
- [15. Lighting Rules](#15-lighting-rules)
- [16. Readability Rules](#16-readability-rules)
- [17. Performance Budget (Web + Mobile)](#17-performance-budget-web--mobile)
- [18. Asset Pack Rules](#18-asset-pack-rules)
- [19. Review Checklist](#19-review-checklist)
- [20. Negative Art Direction (禁止事項)](#20-negative-art-direction-禁止事項)

---

## Mandatory pre-build process

**Before writing a single line of Blender geometry, every time**, do this. Skipping it
is how you drift into generic or copied art.

1. **Read ALL references.** Look at every image in `docs/reference/moba-map/`
   (currently: `1265079_0.jpg`, `1265080_0.jpg` — full top-down maps; `lol參考圖1.png`
   … `lol參考圖4.png` — in-world close-ups; plus any `.mp4` for motion/lighting). Do
   not build from one image.
2. **Analyze the common features across all of them**, not the specifics of any one:
   - **Silhouette**: what shapes repeat? (chunky rounded bush walls, jagged pine
     clumps, blocky stratified rock, continuous low stone walls.)
   - **Scale relationships**: how big is a bush vs a tree vs a cliff vs a base
     structure, relative to a hero?
   - **Color**: the recurring value hierarchy and hue families.
   - **Material**: painterly/flat vs textured; where accents (moss, highlights) sit.
   - **Terrain language**: how elevation, paths, water and framing are organized.
3. **Write down the synthesis** (a few lines in your working notes / the report):
   "the shared language is X, Y, Z." This is what you design toward.
4. **Design an ESMO-original asset from that synthesis** — matching the *principles*
   in this Bible, not tracing any reference. Then build in Blender.

If you cannot honestly say the asset came from the shared design language rather than
one picture, start over.

---

## 1. Overall Art Direction

ESMO is an esports-management game; its MOBA map is effectively a **broadcast arena** —
it must read instantly on stream, on desktop web, and on a phone. The style is
**stylized, hand-painted-look low/mid-poly**: chunky readable forms, flat painterly
shading, color and value doing the heavy lifting instead of texture detail.

ESMO's own identity (its deliberate departure from a wild forest look — this is what
makes it *ours*, not a clone):

- **Cultivated arena, not wild jungle.** Cleaner path edges, a slightly more open and
  brighter walkable field, foliage arranged in deliberate clustered "walls" rather
  than scattered wilderness. It should feel *designed for competition*.
- **Graphic clarity over realism.** One clear read per shape. Slightly higher chroma
  and crisper value steps than a photoreal MOBA, so it survives phone-sized zoom.
- **A signature accent language** (cyan objective glow + amber capture/ward, over cool
  team azure/crimson) that is ESMO's, not any other game's.

Everything below is the current canon. It is revisable — but revise it *here*, and keep
the whole map consistent with whatever it says.

## 2. Visual Keywords

Use these as a north star; if an asset doesn't fit these words, it's off-style.

- **Readable** — recognizable as a black silhouette at map zoom.
- **Chunky** — confident, faceted, low/mid-poly forms; no fiddly geometry.
- **Painterly-flat** — flat/soft shading, palette-driven, minimal texture.
- **Cultivated** — arena-clean, intentional layout, tidy path edges.
- **Cohesive** — every asset looks like it came from the same hand.
- **Broadcast-bright** — high value separation, survives small screens.
- **Grounded** — sits believably on the terrain, consistent single light.

Anti-keywords (if you feel these, stop): *realistic, noisy, muddy, generic, asset-store,
sci-fi, cluttered, inconsistent.*

## 3. Color Palette

ESMO's map palette. The **Blender base color** triples are what the generator plugs
into the Principled *Base Color* under the EEVEE **Standard** view transform — they are
hand-tuned to render correctly, not a literal sRGB→linear conversion of the hex. The
**hex** is the human/UI reference. Keep new assets inside this palette; do not invent
one-off colors per asset (that breaks cohesion).

| Role | Name | Hex (ref) | Blender base color (R,G,B) |
|---|---|---|---|
| Walkable field | Grass Field | `#4E7A38` | 0.30, 0.48, 0.22 |
| Field shadow | Grass Shadow | `#2E5228` | 0.18, 0.32, 0.16 |
| Field highlight | Grass Crown | `#6B9A47` | 0.42, 0.60, 0.28 |
| Dirt path | Path Dirt | `#6B5638` | 0.42, 0.34, 0.22 |
| Paved path/plaza | Path Stone | `#8C8C80` | 0.55, 0.55, 0.50 |
| Rock/cliff body | Stone Warm | `#706E69` | 0.44, 0.43, 0.41 |
| Stone shadow | Stone Cool | `#484C54` | 0.28, 0.30, 0.33 |
| Rock/roof accent | Moss | `#38571E` | 0.22, 0.34, 0.15 |
| Wood | Bark | `#452C1A` | 0.27, 0.17, 0.10 |
| Conifer | Pine Needle | `#1A4222` | 0.10, 0.26, 0.13 |
| Bush body | Bush Leaf | `#224E24` | 0.13, 0.30, 0.14 |
| Foliage top | Foliage Crown | `#487534` | 0.28, 0.46, 0.20 |
| Shallow water | Water Shallow | `#2A6B73` | 0.16, 0.42, 0.46 |
| Deep water | Water Deep | `#153348` | 0.08, 0.20, 0.30 |
| **Objective glow (ESMO signature)** | Objective Cyan | `#33C0D9` | 0.20, 0.75, 0.85 |
| **Capture/ward (ESMO signature)** | Capture Amber | `#F29E38` | 0.95, 0.62, 0.22 |
| Order side | Team Azure | `#3373E6` | 0.20, 0.45, 0.90 |
| Chaos side | Team Crimson | `#D93838` | 0.85, 0.22, 0.22 |

Rules:
- Naturals (grass/stone/wood/foliage/water) build 95% of any asset. Accents (cyan,
  amber, azure, crimson) are **emissive highlights only** — small glows, never large
  surfaces. They tell the player *function*, so spend them sparingly.
- Every asset uses a **base + accent** pair from this table (e.g. Stone Warm + Moss,
  Bush Leaf + Foliage Crown). Two slots, not ten.

## 4. Terrain Style

The ground is organized into clear, readable value layers (top-down):

- **Walkable field** (brightest, Grass Field / Path Dirt) at elevation Z=0 — where play
  happens; it must be the lightest large area so units pop against it.
- **Path** (warm Path Dirt / Path Stone) carves clean lanes across the field; edges are
  tidy, often lined with small rocks or bush bases.
- **Obstacle foliage** (darker) sits on the field to shape corridors (see Bush).
- **Water** (Water Shallow/Deep) is *recessed* below Z=0 — see River.
- **Framing** (Stone, dark pines) rings the whole arena as non-playable border.

Ground meshes are low-poly with gentle undulation, flat/soft shaded, colored by the
palette (optionally a subtle vertex-color gradient field→shadow in crevices). No tiling
photo textures. Keep the walkable area visually calm — detail lives in the props, not
the floor.

## 5. Cliff Style

Cliffs are the vertical dividers between elevation layers and the arena's outer frame.

- **Form**: stratified, blocky stone with a strong flat top and near-vertical faceted
  faces. Horizontal strata bands read clearly (snap vertices to coarse Z bands). Warm
  Stone body, Stone Cool in the shadowed vertical faces, Moss on the flat top edges.
- **Scale**: segment height 3–4 units (one elevation step). Border cliffs can stack
  taller.
- **Silhouette**: chunky angular top edge, not a smooth ramp; break the top line so it
  doesn't look extruded.
- **Modular**: design as tiling wall segments (see §12) with matching end profiles so a
  jungle plateau can be walled by repeating/rotating a few pieces.

## 6. River Style

The river is a recessed water channel cutting diagonally through mid-map, a signature
readability device.

- **Form**: a shallow carved trough, water plane at Z ≈ −0.5 to −1.5, banks are low
  rock/dirt shelves. An **objective pit** widens into a rounded basin with a cyan
  glow (Objective Cyan emissive) at its center.
- **Water look**: two-tone (Water Shallow at edges → Water Deep at center), flat/soft
  shaded, gentle. A faint emissive/rim for the objective, never a realistic reflective
  PBR water shader (too heavy for mobile, off-style).
- **Banks**: line with Rock pack pieces and Bush pack pieces so the river edge reads as
  a distinct boundary from above.
- **Readability**: water is the *darkest recessed* value — it must read instantly as
  "different layer / boundary," not blend into shadowed grass.

## 7. Rock Style

- **Role**: outcrops, path liners, cliff debris, camp markers.
- **Form**: angular stratified boulders — chunky faceted slabs, horizontal layering,
  beveled crisp edges, flat shaded. Stone Warm body + Moss on upward high faces.
- **Scale**: small rock 0.5–1.0, boulder 1.5–3.0.
- **Silhouette**: irregular, no clean sphere; snap Z to strata, jitter along normals.
- **Pack**: ship 3–5 variants (small/medium/large + a flat "shelf" + a mossy "capped"),
  all sharing the same facet density and palette so they intercut cleanly.

## 8. Tree Style

- **Role**: jungle canopy, framing forest, sightline blockers.
- **Form**: stylized conifers — a tapered bark trunk + 3–4 stacked jagged cone layers,
  each layer rotated and rim-jittered to break the cone. Deep Pine Needle green, Bark
  trunk. Hero trees come in small **clusters** (one large + 1–2 saplings) — this reads
  as a copse, which is the shared jungle language, not a lone lollipop tree.
- **Scale**: hero pine 4–7, sapling 2–3.
- **Silhouette**: pointed, layered, jagged edge; distinct from the round bush.
- **Pack**: 3–5 variants (tall, squat, leaning, cluster, sapling) that plant together
  believably.

## 9. Bush Style

The bush ("brush") is the dominant space-shaper — dark rounded foliage walls that carve
the jungle into corridors and hide units.

- **Form**: rounded leafy mounds made of clustered flattened blobs, smooth-shaded, Bush
  Leaf body with Foliage Crown on the top. For walls, mounds elongate into
  sausage/kidney shapes that chain together.
- **Scale**: 0.7–1.0 tall; wall clumps 1.5–3 wide, chainable into long brush lines.
- **Silhouette**: round and soft — the deliberate opposite of the jagged pine, so
  players read "bush = brush" at a glance. Edge the base with small rocks.
- **Color**: darker and more saturated than the walkable field so a brush wall reads as
  a distinct obstacle, never as bright open grass.
- **Pack**: 3–5 variants (single round, wall segment, corner, big anchor, sparse) that
  chain into continuous walls without obvious repetition.

## 10. Ruins / Wall Style

- **Role**: perimeter walls, lane edges, decorative old structures that frame the arena.
- **Form**: low stacked-stone / dressed-block walls with a clear coping top; weathered,
  Stone Warm + Stone Cool, Moss in the joints. Ruins add broken pillars and toppled
  blocks. Clean, cultivated masonry (ESMO is an arena) — chipped but not rubble-noisy.
- **Scale**: wall segment 1.5–2.5 tall; pillars 2–4.
- **Modular**: straight segment + corner + end-cap + gate + broken variant, all tiling
  on the same grid (see §12).
- **Silhouette**: continuous horizontal band with rhythmic block coping — reads as a
  boundary line from top-down.

## 11. Building Style

- **Role**: team bases, towers/turrets, objective altars, shops.
- **Form**: chunky stylized stone-and-timber structures with strong readable rooflines
  and a team-colored emissive accent (Azure for Order base/towers, Crimson for Chaos).
  Objective altars use Objective Cyan. Faceted, flat-shaded stone with Bark/Path Stone
  trim. Geometry stays blocky and legible — a tower must read as a tower in silhouette
  from directly above.
- **Scale**: tower 6–10, base core structure 8–12, shop/altar 3–5.
- **Team identity** lives in the *accent glow and banners*, not in the base geometry —
  Order and Chaos buildings share form and differ by accent color, keeping the map
  symmetric and fair-reading.
- **Do not** design any building by referencing a Riot structure; compose from ESMO's
  own module kit (walls §10 + roofs + accent).

## 12. Modular Asset Rules

Reuse is how the map stays cohesive *and* performant. Build kits, not one-offs.

- **Grid**: design connectable pieces (cliffs, walls, paths, river banks) to snap on a
  **1-unit grid** (2-unit for large wall/cliff segments). Widths are whole units.
- **Pivot / orientation**: pivot at the **base-center on the ground** (lowest point at
  Z=0), **+Y = forward/outward face**, real-world scale (1 unit = 1 m). This lets any
  tool place/rotate pieces predictably.
- **Seams**: tiling pieces share identical end profiles so segment A's right edge meets
  segment B's left edge with no gap or overlap. Test by placing two in a row.
- **Kit thinking**: a "cliff kit" = straight + inner corner + outer corner + end + top
  cap. A "wall kit" = straight + corner + end + gate + broken. Compose the map from a
  handful of pieces × rotation × instancing, not unique meshes everywhere.
- **Naming**: `esmo_<category>_<name>_<variant>` (e.g. `esmo_rock_boulder_a`,
  `esmo_cliff_straight_2m`, `esmo_bush_wall_corner`). Lowercase, ASCII, underscores.
- **Shared materials**: pieces in a kit share the same material set so the engine can
  batch/instance them.

## 13. Asset Scale Rules

**1 Blender unit = 1 meter.** Hero reference height ≈ **1.8–2.0 units** — scale
everything against a hero so the map feels consistent.

| Asset | Height (units) | Notes |
|---|---|---|
| Grass tuft | 0.3–0.5 | ground scatter |
| Bush (brush) | 0.7–1.0 | wall clumps 1.5–3 wide |
| Small rock | 0.5–1.0 | path liner |
| Boulder | 1.5–3.0 | landmark |
| Ruins pillar | 2.0–4.0 | |
| Wall segment | 1.5–2.5 | modular |
| Cliff segment | 3.0–4.0 | one elevation step |
| Sapling pine | 2.0–3.0 | |
| Hero pine | 4.0–7.0 | cluster anchor |
| Shop / altar | 3.0–5.0 | |
| Tower | 6.0–10.0 | |
| Base core | 8.0–12.0 | |

Terrain elevation layers: walkable field Z=0; river water Z ≈ −0.5…−1.5; raised jungle
plateau tops +1.5…+4 (reached via one cliff step); outer framing cliffs +4 and up
(non-playable). Every asset's lowest vertex sits on its intended layer — never floating,
never sunk.

## 14. Material Rules

Consistency here is 80% of what makes assets look like one game.

- **Shader**: Principled BSDF, **dielectric** (Metallic = 0) for everything except tiny
  metal trims. Roughness **0.85–0.95**. No clearcoat, no transmission (except stylized
  water, still cheap).
- **No normal maps, no PBR texture stacks.** Silhouette and facets carry the detail.
  Optional: a subtle **vertex-color** darkening in crevices/base for grounding.
- **Two material slots per asset**: a **base** and an **accent** from §3, the accent
  assigned by face **normal.z + height** (moss/crown on upward high faces). This one
  rule gives the whole map its cohesive painterly look.
- **Shading**: **flat** on hard-surface (rock, cliff, wall, building), **smooth** on
  organic blobs (bush, foliage masses). Cones/pines: flat.
- **Emissive**: only the signature accents (§3) emit, and only on small surfaces
  (glows, runes, torch tips). Keep emission strength modest.
- **Shared materials across a kit** (§12) so nothing is a unique snowflake material.

## 15. Lighting Rules

The whole map is lit by **one consistent key direction** so every asset's shadow agrees
and nothing looks pasted in.

- **Key**: warm sun (Capture-warm white, ~`0.98, 0.95, 0.86`), coming from the
  **upper-left**, azimuth ≈ 315°, elevation ≈ 50°. This is *the* map sun — match it in
  every preview and, when the map is assembled, in the scene light.
- **Fill**: cool sky bounce (`0.65, 0.78, 1.0`), low, opposite the key, soft — lifts
  shadow detail without flattening.
- **Rim**: subtle cool back-light to separate silhouettes from the ground.
- **Ambient**: low, neutral-dark; let the key define form. Avoid heavy baked AO that
  eats the silhouette — readability beats contact realism here.
- The **preview render rig** in `scripts/gen_lowpoly_assets.py` already encodes this
  3-point setup (EEVEE, Standard view transform, transparent film, 768²). Preview every
  asset under it so quality is judged consistently.

## 16. Readability Rules

Top-down / 2.5D MOBA readability is the highest priority — above realism, above detail.

- **Value hierarchy** (lightest → darkest): walkable field → paths → foliage/obstacles →
  framing stone → recessed water. Keep these steps distinct so the play space reads at a
  glance.
- **Function by color/shape**: brush = dark saturated round green; path = warm tan;
  wall/cliff = grey masonry; water = teal recessed; objective = cyan glow; capture/ward =
  amber; team = azure/crimson. A player should decode terrain function from color+
  silhouette alone.
- **Silhouette contrast between classes**: round bush vs jagged pine vs blocky rock vs
  linear wall — never let two gameplay-different assets share a silhouette.
- **Calm floor, detailed props**: detail and contrast live in the props at path edges,
  not in busy ground textures.
- **Test at zoom-out**: an asset must still read when the map is shown at full-screen
  (small). If it turns to mush, simplify the silhouette and raise value contrast.

## 17. Performance Budget (Web + Mobile)

ESMO ships to the web (GitHub Pages, R3F/Three.js) and must run on mid-tier phones.
Budget accordingly.

- **Per-asset triangles**:
  - grass/small props: 40–150
  - rock/boulder, wall, cliff segment: 100–300
  - tree/bush cluster: 200–500
  - ruins pillar / shop / altar: 200–600
  - tower / base building: 800–1500
- **Whole map**: aim for < ~250–300k visible triangles on mobile. Reach it with
  **modular kits + instancing** (one bush mesh instanced 200× costs far less than 200
  unique bushes), not by starving individual assets of shape.
- **Textures**: prefer **vertex colors / flat material slots — no per-asset textures.**
  If a texture is ever needed, one **shared atlas** ≤ 512² (mobile) / ≤ 1024² (web).
  Never per-asset 2K maps, never normal/roughness map stacks.
- **Materials / draw calls**: few **shared** materials so the renderer batches. No
  metallic PBR. Single-sided geometry where possible; backface-cull friendly.
- **Export**: GLB, apply modifiers, +Y-up (Blender's default glTF conversion),
  reasonable vertex precision; enable mesh compression only if verified to load in R3F.
- Readability still wins: **never drop below the tri count needed to keep the silhouette
  legible** (see §20). The budget is a ceiling, not a target to bottom out.

## 18. Asset Pack Rules

**Every new asset *type* (Rock, Tree, Bush, Cliff, River, Wall, …) must ship as an
"Asset Pack" before it may be imported** — never a single lonely mesh. This is how the
map gets variety without losing cohesion.

- **A pack = 3–5 variants** of the same type that are **designed to be used together**:
  they share palette, facet density, scale logic, material set, and lighting response,
  but differ in size/shape/pose so a placed group doesn't look copy-pasted.
- **Intercut test**: place the variants side by side in one preview and confirm they
  read as siblings from the same hand — same "style DNA," different individuals. If one
  variant looks like it wandered in from another game, fix or replace it.
- **Consistency gate**: a pack is only eligible for import **after** the whole pack is
  confirmed style-consistent against this Bible and the [Review Checklist](#19-review-checklist).
  A pack that fails consistency is regenerated, not imported.
- **Naming**: variants follow `esmo_<type>_<name>_<a|b|c…>` and live together in
  `review/assets/` with one combined preview (or one preview per variant) in
  `review/preview/`.
- Modular types (cliff, wall, river bank, path) must also satisfy the kit/seam rules in
  §12 — their "variants" include the connective pieces (straight/corner/end).

## 19. Review Checklist

Run this on every asset/pack **before** showing the user. This is also the **auto-reject
gate**: if an asset fails materially on these, **regenerate or fix it yourself and do NOT
bring it to the user** — only surface work that already conforms to this Bible. Only
bring the user genuine judgment calls, not obvious style misses.

- [ ] **Pre-build done**: read all references, analyzed the shared language, designed
      from principles (not one image).
- [ ] **On-palette**: colors come from §3; base+accent two-slot; no invented one-offs.
- [ ] **Silhouette reads** as a distinct black shape at map zoom; class silhouette is
      distinct from other classes (§16).
- [ ] **Scale correct** vs the §13 table and the hero reference; sits on its layer
      (not floating/sunk).
- [ ] **Material rules** met (§14): dielectric, right roughness, flat/smooth per class,
      accent by normal+height, no textures/normal maps, shared kit materials.
- [ ] **Lighting**: previewed under the standard rig/sun (§15); shadows agree with the
      map key direction.
- [ ] **Performance**: within the §17 tri budget for its class; modular where it should
      be; instanceable.
- [ ] **Pack**: if a new type, it's a 3–5 variant pack that intercuts consistently (§18).
- [ ] **Cohesion**: looks like the same game as the existing ESMO assets.
- [ ] **Negative check**: none of §20 is true.
- [ ] **Not verified in-engine** is stated honestly (Blender export ≠ R3F-loaded).

## 20. Negative Art Direction (禁止事項)

Hard "do not". Each is here because it silently destroys cohesion or readability.

- **禁止直接重建 LoL 模型。** No reconstructing any League/Riot model, structure, or map
  region. We learn the language; we don't rebuild the artifact.
- **禁止使用任何官方素材。** No Riot (or any other game's) official model, texture, UV,
  material, or map data — not as source, reference-to-trace, or "temporary" placeholder.
- **禁止 Generic Low Poly 風格。** No flat-shaded rainbow "generic low poly" look
  (untextured pastel facets with no value hierarchy). ESMO is painterly and value-driven,
  not a starter-pack aesthetic.
- **禁止看起來像 Unity Asset Store 免費素材。** No generic marketplace-freebie feel —
  mismatched scale, default materials, no cohesive palette.
- **禁止看起來像 Unreal Marketplace 寫實素材。** No photoreal / heavy-PBR / normal-mapped
  realism. It's off-style and blows the mobile budget.
- **禁止每個資產採用不同美術風格。** No per-asset style drift. Every asset shares this
  Bible's palette, material logic, facet density, and lighting.
- **禁止為了低面數而失去辨識度。** Never sacrifice silhouette/readability just to hit a low
  tri count. Meet readability first, then optimize within the §17 ceiling.
- **禁止單獨參考一張圖片建模。** Never model from a single reference image. Always
  synthesize from the whole reference set and this Bible (see Mandatory pre-build).

---

*When this canon changes, edit this file — it is the one source of truth for ESMO map
art, shared by every AI (Claude, Codex, and others).*
