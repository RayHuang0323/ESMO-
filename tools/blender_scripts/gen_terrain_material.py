"""
Sprint 30B — Terrain Material Pass (ESMO Ground Material Language v1).

Opens the existing terrain_sculpt.blend and assigns the FIRST ESMO ground material
language WITHOUT touching geometry (no shape / height / river / cliff change). Materials
are assigned per-face by height + slope + water-proximity rules, using Visual Bible §3
colors only. Stylized, flat/painterly, large readable colour blocks — NO textures, NO
photo maps, NO decoration, NO asset packs, NO buildings/bridges/effects.

Ground materials:
  - Grass    (Grass Field  0.30,0.48,0.22)  gentle uplands (field + plateau top)
  - Dirt/Path(Path Dirt    0.42,0.34,0.22)  shore / bank band just above the water
  - Rock     (Stone Warm   0.44,0.43,0.41)  steep faces (cliff, steep banks, tile edge)
  - Riverbed (Stone Cool   0.28,0.30,0.33)  submerged channel floor
  - Water    (Water Shallow 0.16,0.42,0.46) stylized semi-transparent surface plane

Preview: EEVEE with the Visual Bible single warm key + cool fill (needed to read the
materials). Output to <out_dir> (review/terrain-prototype/):
  terrain_material.blend, terrain_material.glb, preview_top/45/player.png (overwrite)

Run headless:
  blender --background --python tools/blender_scripts/gen_terrain_material.py -- <out_dir>
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
SCULPT_BLEND = os.path.join(OUT_DIR, "terrain_sculpt.blend")

SIZE = 20.0
WATER_LEVEL = -0.4          # stylized water surface (field=0, bed=-1)

# --- Visual Bible palette (Blender base colour) ---------------------------- #
COL = {
    "grass":    (0.30, 0.48, 0.22),
    "dirt":     (0.42, 0.34, 0.22),
    "rock":     (0.44, 0.43, 0.41),
    "riverbed": (0.28, 0.30, 0.33),
    "water":    (0.14, 0.38, 0.44),
}


def make_mat(name, rgb, rough=0.9, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.15
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    m.diffuse_color = (*rgb, 1.0)
    return m


def nz(x, y):
    return bnoise.noise(Vector((x * 0.6 + 3.1, y * 0.6 - 1.7, 5.0)))


def assign_terrain_materials(obj):
    me = obj.data
    me.materials.clear()
    grass = make_mat("terrain_grass", COL["grass"])
    dirt = make_mat("terrain_dirt", COL["dirt"])
    rock = make_mat("terrain_rock", COL["rock"])
    bed = make_mat("terrain_riverbed", COL["riverbed"])
    for m in (grass, dirt, rock, bed):
        me.materials.append(m)
    GRASS, DIRT, ROCK, BED = 0, 1, 2, 3

    for p in me.polygons:
        c = p.center
        cz = c.z + nz(c.x, c.y) * 0.06   # jitter boundaries -> painterly, not straight
        steep = p.normal.z < 0.70         # ~ >45deg -> whole cliff face reads as rock
        if cz < -0.82:
            idx = BED                     # submerged channel floor
        elif steep:
            idx = ROCK                    # cliff / steep bank / tile edge
        elif cz < -0.12:
            idx = DIRT                    # shore / bank band above the water
        else:
            idx = GRASS                   # gentle uplands
        p.material_index = idx
    return GRASS


def add_water_plane():
    # full-tile plane at WATER_LEVEL; terrain occludes it everywhere except the
    # carved channel, so water shows only in the river (stylized, semi-transparent)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(SIZE / 2, SIZE / 2, WATER_LEVEL))
    w = bpy.context.active_object
    w.name = "terrain_water"
    w.scale = (SIZE / 2, SIZE / 2, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    wm = make_mat("terrain_water", COL["water"], rough=0.35, alpha=0.82)
    w.data.materials.append(wm)
    for pol in w.data.polygons:
        pol.use_smooth = False
    return w


def setup_eevee_lighting():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 64
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("terrain_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.05, 0.06, 0.08, 1.0)
    bg.inputs["Strength"].default_value = 0.7
    scene.world = world

    # single warm key sun from upper-left (Visual Bible §15)
    sdata = bpy.data.lights.new("key", "SUN")
    sdata.energy = 3.2
    sdata.color = (1.0, 0.95, 0.86)
    sdata.angle = math.radians(3)
    sun = bpy.data.objects.new("key", sdata)
    sun.rotation_euler = (math.radians(52), 0, math.radians(40))
    scene.collection.objects.link(sun)

    # soft cool fill
    fdata = bpy.data.lights.new("fill", "AREA")
    fdata.energy = 300
    fdata.size = 30
    fdata.color = (0.7, 0.8, 1.0)
    fill = bpy.data.objects.new("fill", fdata)
    fill.location = (-6, -6, 14)
    fill.rotation_euler = (math.radians(35), 0, math.radians(-45))
    scene.collection.objects.link(fill)


def purge_cams_lights():
    for o in list(bpy.data.objects):
        if o.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(o, do_unlink=True)


def aim(cam, target):
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_view(name, location, target, ortho=False, ortho_scale=22.0,
                res=(1600, 1000)):
    cd = bpy.data.cameras.new(name)
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho_scale
    else:
        cd.lens = 50
    cam = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(location)
    aim(cam, Vector(target))
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    path = os.path.join(OUT_DIR, f"preview_{name}.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---- main ----------------------------------------------------------------- #
# open the untouched sculpt so geometry is byte-identical
bpy.ops.wm.open_mainfile(filepath=SCULPT_BLEND)
purge_cams_lights()

obj = bpy.data.objects.get("terrain_sculpt")
assert obj is not None, "terrain_sculpt not found in blend"

assign_terrain_materials(obj)
water = add_water_plane()
setup_eevee_lighting()

C = (SIZE / 2, SIZE / 2)
render_view("top", (C[0], C[1], 40), (C[0], C[1], 0),
            ortho=True, ortho_scale=22.0, res=(1400, 1400))
render_view("45", (C[0] + 17, C[1] - 17, 20), (C[0], C[1], 1.0), res=(1600, 1000))
render_view("player", (C[0] - 1.0, C[1] - 9.0, 15.0), (C[0] + 1.0, C[1] + 5.0, 0.0),
            res=(1600, 1000))

# export terrain + water as one GLB
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
water.select_set(True)
bpy.context.view_layer.objects.active = obj
glb = os.path.join(OUT_DIR, "terrain_material.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                          use_selection=True, export_apply=True)

blend = os.path.join(OUT_DIR, "terrain_material.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)

# report face distribution
from collections import Counter
cnt = Counter(p.material_index for p in obj.data.polygons)
names = ["grass", "dirt", "rock", "riverbed"]
print("\n===== TERRAIN MATERIAL SUMMARY =====")
tot = sum(cnt.values())
for i, nm in enumerate(names):
    print(f"{nm:9s}: {cnt.get(i,0):5d} faces ({100*cnt.get(i,0)/tot:4.1f}%)")
print(f"water plane: separate object, level Z={WATER_LEVEL}")
print(f"blend : {blend}")
print(f"glb   : {glb}")
print("previews: preview_top.png / preview_45.png / preview_player.png")
print("===== DONE =====")
