"""
Sprint 30A Phase 2A.5 — Terrain Sculpt.

Takes the Phase 2A blockout masses and makes them read as NATURAL terrain instead of
CAD geometry. Only the SHAPE of Cliff / Plateau / River / terrain flow is changed:
  - Plateau: organic meandering footprint + gently undulating top (not a flat rectangle)
  - Cliff  : variable width + eased (rounded) top/base, wandering edge (not a clean slab)
  - River  : curved meandering centreline, varying width, irregular objective basin
  - Flow   : whole ground gently undulates and slopes toward the river valley; a light
             smoothing pass removes the stair-stepping so masses flow into each other

Still NO new assets, NO materials, NO textures, NO trees, NO scene lights.
Preview shading = Workbench clay (viewport visualization only).

Output (to <out_dir>, default review/terrain-prototype/):
  terrain_sculpt.blend, terrain_sculpt.glb, preview_top.png, preview_45.png,
  preview_player.png  (previews overwrite the blockout ones — latest state)

Run headless:
  blender --background --python tools/blender_scripts/gen_terrain_sculpt.py -- <out_dir>
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector
from mathutils import noise as bnoise

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
OUT_DIR = argv[0] if argv else "review/terrain-prototype"
os.makedirs(OUT_DIR, exist_ok=True)

# ---- design constants (metres) -------------------------------------------- #
SIZE = 20.0
CELL = 0.25
BASE_Z = -2.0

PLATEAU_H = 3.0
PX, PY = 13.0, 12.0
CLIFF_W = 0.9

WATER_Z = -1.0
CORE_HW = 1.0
BANK_TOTAL = 3.6              # wide eased bank/valley so ground flows into the river
BASIN_C = Vector((15.6, 4.1))
BASIN_R = 2.6

# curved, meandering river centreline (NW -> SE)
RIVER_PTS = [Vector(p) for p in [
    (7.8, 12.3), (9.6, 10.4), (11.3, 8.7), (13.0, 6.9),
    (14.9, 5.3), (16.8, 3.6), (18.6, 2.2)]]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def smoother(x):
    x = clamp(x, 0.0, 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)


def nz(x, y, freq, seed):
    return bnoise.noise(Vector((x * freq + seed * 11.7,
                                y * freq - seed * 7.3,
                                seed * 3.1)))


def fbm(x, y, freq, seed, octaves=3):
    v, a, f = 0.0, 0.5, freq
    for o in range(octaves):
        v += a * nz(x, y, f, seed + o * 5)
        f *= 2.0
        a *= 0.5
    return v


def seg_dist(p, a, b):
    ab = b - a
    t = clamp((p - a).dot(ab) / ab.dot(ab), 0.0, 1.0)
    return (p - (a + ab * t)).length


def river_dist(p):
    d = min(seg_dist(p, RIVER_PTS[i], RIVER_PTS[i + 1])
            for i in range(len(RIVER_PTS) - 1))
    # irregular basin (noisy radius)
    br = BASIN_R + nz(p.x, p.y, 0.5, 21) * 0.6
    db = (p - BASIN_C).length - br
    return min(d, db)


def height(x, y):
    # domain warp so nothing follows a straight machine line
    wx = x + nz(x, y, 0.20, 31) * 0.9
    wy = y + nz(x, y, 0.20, 32) * 0.9

    # --- plateau with wavy edge + variable cliff width + eased profile ---
    ex = PX + nz(wx, wy, 0.16, 1) * 1.4      # wandering west edge
    ey = PY + nz(wx, wy, 0.16, 2) * 1.4      # wandering south edge
    inside = min(wx - ex, wy - ey)
    wc = CLIFF_W + nz(wx, wy, 0.30, 3) * 0.45
    t = smoother(inside / max(wc, 0.3) + 0.5)   # eased 0..1 (rounded cliff)

    field_z = fbm(x, y, 0.13, 7) * 0.18          # gentle rolling ground
    plateau_top = PLATEAU_H + fbm(x, y, 0.22, 9) * 0.28
    z = t * plateau_top + (1.0 - t) * field_z

    # --- river valley + channel, only on the field side (t small) ---
    if t < 0.18:
        p = Vector((x, y))
        d = river_dist(p) + nz(x, y, 0.45, 41) * 0.35   # noisy banks
        if d <= 0.0:
            zr = WATER_Z + fbm(x, y, 0.5, 51) * 0.06     # slightly uneven bed
        else:
            zr = WATER_Z + smoother(d / BANK_TOTAL) * (-WATER_Z)  # eased bank -1->0
        z = min(z, zr)
    return z


def build_terrain():
    n = int(round(SIZE / CELL))
    row = n + 1
    # height grid
    zg = [[height(i * CELL, j * CELL) for i in range(row)] for j in range(row)]

    # light smoothing to remove stair-stepping (keep outer ring fixed)
    for _ in range(2):
        ng = [r[:] for r in zg]
        for j in range(1, n):
            for i in range(1, n):
                ng[j][i] = (zg[j][i] * 0.4 +
                            (zg[j][i - 1] + zg[j][i + 1] +
                             zg[j - 1][i] + zg[j + 1][i]) * 0.15)
        zg = ng

    verts = [(i * CELL, j * CELL, zg[j][i]) for j in range(row) for i in range(row)]
    faces = []
    for j in range(n):
        for i in range(n):
            a = j * row + i
            faces.append((a, a + 1, a + 1 + row, a + row))

    me = bpy.data.meshes.new("terrain_sculpt")
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new("terrain_sculpt", me)
    bpy.context.scene.collection.objects.link(obj)

    # solid skirt down to BASE_Z
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

    # shade smooth so the sculpted flow reads as terrain, not facets
    for p in me.polygons:
        p.use_smooth = True
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
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    path = os.path.join(OUT_DIR, f"preview_{name}.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ---- main ----------------------------------------------------------------- #
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

obj = build_terrain()
zmin = min(v.co.z for v in obj.data.vertices)
zmax = max(v.co.z for v in obj.data.vertices)

setup_workbench_clay()
C = (SIZE / 2, SIZE / 2)
render_view("top", (C[0], C[1], 40), (C[0], C[1], 0),
            ortho=True, ortho_scale=22.0, res=(1400, 1400))
render_view("45", (C[0] + 17, C[1] - 17, 20), (C[0], C[1], 1.0), res=(1600, 1000))
render_view("player", (C[0] - 1.0, C[1] - 9.0, 15.0), (C[0] + 1.0, C[1] + 5.0, 0.0),
            res=(1600, 1000))

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
glb = os.path.join(OUT_DIR, "terrain_sculpt.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                          use_selection=True, export_apply=True)
blend = os.path.join(OUT_DIR, "terrain_sculpt.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)

tris = sum((len(p.vertices) - 2) for p in obj.data.polygons)
print("\n===== TERRAIN SCULPT SUMMARY =====")
print(f"verts={len(obj.data.vertices)}  faces={len(obj.data.polygons)}  tris~{tris}")
print(f"elevation range: {zmin:.2f} .. {zmax:.2f} m")
print(f"blend : {blend}")
print(f"glb   : {glb}")
print("previews: preview_top.png / preview_45.png / preview_player.png")
print("===== DONE =====")
