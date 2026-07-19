"""
Sprint 30A Phase 2A — Terrain Blockout (ESMO Terrain Foundation).

Builds ONLY terrain masses to validate world scale, terrain structure and MOBA
readability — no decoration, no materials, no textures, no scene lights, no effects.

Masses built (per TERRAIN_CONCEPT.md):
  - Field    : walkable base plane, Z = 0
  - Plateau  : raised jungle shelf, Z = +3, in the NE
  - Cliff    : steep faceted step between field and plateau
  - River    : recessed channel, water floor Z = -1, sweeping the SE + objective basin
  - Riverbank: 1 m sloped shelf between field (0) and water (-1)

Output (to <out_dir>, default review/terrain-prototype/):
  - terrain_blockout.blend
  - terrain_blockout.glb
  - preview_top.png     (top-down orthographic)
  - preview_45.png      (45deg three-quarter)
  - preview_player.png  (MOBA player-ish camera)

Preview shading: Blender Workbench clay (built-in studio matcap + cavity + shadow).
This is viewport visualization only — NO materials/textures/lamps are added to the asset.

Run headless:
  blender --background --python tools/blender_scripts/gen_terrain_blockout.py -- <out_dir>
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
OUT_DIR = argv[0] if argv else "review/terrain-prototype"
os.makedirs(OUT_DIR, exist_ok=True)

# ---- design constants (metres; 1 unit = 1 m) ------------------------------ #
SIZE = 20.0            # 20 x 20 m tile
CELL = 0.25           # grid resolution (m) -> 80 x 80 cells
BASE_Z = -2.0         # bottom of the solid skirt

# Plateau (NE): flat top +3, cliff band on its S & W edges
PLATEAU_H = 3.0
PX, PY = 13.0, 12.0   # plateau footprint starts at x>=PX, y>=PY
CLIFF_W = 0.9         # horizontal width of the cliff ramp (=> ~73deg)

# River (SE diagonal) + objective basin
WATER_Z = -1.0
A = Vector((9.0, 11.0))     # river centreline start
B = Vector((18.5, 2.5))     # river centreline end
CORE_HW = 1.0               # half-width of flat water core
BANK_W = 1.6                # riverbank slope width (water -> field)
BASIN_C = Vector((15.5, 4.0))
BASIN_R = 2.6


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def seg_dist(p, a, b):
    ab = b - a
    t = clamp((p - a).dot(ab) / ab.dot(ab), 0.0, 1.0)
    return (p - (a + ab * t)).length


def height(x, y):
    p = Vector((x, y))
    # plateau + cliff ramp (min of the two edge penetrations => rounded inner corner)
    inside = min(x - PX, y - PY)
    t = clamp(inside / CLIFF_W + 0.5, 0.0, 1.0)
    z = PLATEAU_H * t
    # carve river only into genuine field (z ~ 0), never the cliff/plateau
    if z < 0.05:
        d = min(seg_dist(p, A, B) - CORE_HW, (p - BASIN_C).length - BASIN_R)
        if d <= 0.0:
            zr = WATER_Z
        elif d < BANK_W:
            zr = WATER_Z + (d / BANK_W) * (-WATER_Z)   # -1 -> 0
        else:
            zr = 0.0
        z = min(z, zr)
    return z


def build_terrain():
    n = int(round(SIZE / CELL))          # cells per side
    verts = []
    for j in range(n + 1):
        y = j * CELL
        for i in range(n + 1):
            x = i * CELL
            verts.append((x, y, height(x, y)))
    faces = []
    row = n + 1
    for j in range(n):
        for i in range(n):
            a = j * row + i
            faces.append((a, a + 1, a + 1 + row, a + row))

    me = bpy.data.meshes.new("terrain_blockout")
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new("terrain_blockout", me)
    bpy.context.scene.collection.objects.link(obj)

    # solid skirt: extrude the border straight down to BASE_Z (so it reads as ground)
    bm = bmesh.new()
    bm.from_mesh(me)
    boundary = [e for e in bm.edges if e.is_boundary]
    ret = bmesh.ops.extrude_edge_only(bm, edges=boundary)
    for el in ret["geom"]:
        if isinstance(el, bmesh.types.BMVert):
            el.co.z = BASE_Z
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return obj


def setup_workbench_clay():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "SINGLE"
    sh.single_color = (0.62, 0.62, 0.62)
    sh.show_shadows = True
    sh.shadow_intensity = 0.5
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def aim(cam, target):
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_view(name, location, target, ortho=False, ortho_scale=22.0,
                res=(1600, 1000)):
    cam_data = bpy.data.cameras.new(name)
    if ortho:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
    else:
        cam_data.lens = 50
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(location)
    aim(cam, Vector(target))
    bpy.context.scene.camera = cam
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = res
    path = os.path.join(OUT_DIR, f"preview_{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ---- main ----------------------------------------------------------------- #
# clean slate
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

obj = build_terrain()

zmin = min(v.co.z for v in obj.data.vertices)
zmax = max(v.co.z for v in obj.data.vertices)

setup_workbench_clay()

C = (SIZE / 2, SIZE / 2)   # tile centre

# 1) top-down orthographic (best for layout / readability check)
render_view("top", (C[0], C[1], 40), (C[0], C[1], 0),
            ortho=True, ortho_scale=22.0, res=(1400, 1400))
# 2) 45deg three-quarter (massing)
render_view("45", (C[0] + 17, C[1] - 17, 20), (C[0], C[1], 1.0),
            res=(1600, 1000))
# 3) MOBA player-ish camera (steep, looking north across the tile)
render_view("player", (C[0] - 1.0, C[1] - 9.0, 15.0), (C[0] + 1.0, C[1] + 5.0, 0.0),
            res=(1600, 1000))

# export GLB (terrain only)
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
glb = os.path.join(OUT_DIR, "terrain_blockout.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                          use_selection=True, export_apply=True)

# save .blend
blend = os.path.join(OUT_DIR, "terrain_blockout.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)

tris = sum((len(p.vertices) - 2) for p in obj.data.polygons)
print("\n===== TERRAIN BLOCKOUT SUMMARY =====")
print(f"verts={len(obj.data.vertices)}  faces={len(obj.data.polygons)}  tris~{tris}")
print(f"elevation range: {zmin:.2f} .. {zmax:.2f} m  (expect ~ -2.00 .. 3.00)")
print(f"blend : {blend}")
print(f"glb   : {glb}")
print("previews: preview_top.png / preview_45.png / preview_player.png")
print("===== DONE =====")
