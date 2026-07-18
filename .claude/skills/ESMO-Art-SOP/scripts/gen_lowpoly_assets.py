"""
Generate MOBA-style map assets (boulder / pine tree / bush) with Blender.

Art direction reference: League of Legends "Summoner's Rift" props
(docs/reference/moba-map/*.png):
  - boulder : angular stratified stone slab, warm-grey, moss on the top faces
  - pine    : dark-green conifer, several jagged stacked layers, tapered trunk
  - bush    : rounded leafy "brush" mound, dark green with lighter crown

Run headless:
  blender --background --python tools/blender_scripts/gen_lowpoly_assets.py -- <assets_dir> <preview_dir>

For each object:
  - build procedurally (fixed seed => reproducible), game-ready mid/low poly
  - PBR-ish Principled materials with a base + accent slot
  - export <name>.glb to <assets_dir>
  - render a 768x768 EEVEE "hero" preview <name>.png to <preview_dir>
    (3-point light rig, soft world light, contact ground + real shadow)

Does NOT touch the game project. Output goes only to review/.
"""

import bpy
import bmesh
import math
import random
import sys
import os
from mathutils import Vector, Euler

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
ASSETS_DIR = argv[0] if len(argv) > 0 else "review/assets"
PREVIEW_DIR = argv[1] if len(argv) > 1 else "review/preview"
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def purge():
    """Wipe everything so each asset renders in isolation."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                 bpy.data.lights, bpy.data.worlds):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def pbr_material(name, color, rough=0.85, spec=0.15):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    mat.diffuse_color = (*color, 1.0)
    return mat


def shade_flat(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def shade_smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


# --------------------------------------------------------------------------- #
# builders
# --------------------------------------------------------------------------- #
def build_boulder():
    """Angular stratified stone slab with mossy top (LoL cliff-rock look)."""
    random.seed(11)
    bpy.ops.mesh.primitive_cube_add(size=2.0)
    obj = bpy.context.active_object
    obj.name = "boulder"
    obj.scale = (1.35, 1.0, 0.95)
    bpy.ops.object.transform_apply(scale=True)

    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    # cut horizontal strata + subdivide for chunky facets
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=2, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()

    # random angular displacement -> boulder silhouette
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:
        n = v.normal
        push = random.uniform(-0.16, 0.34)
        v.co += n * push
        v.co.x += random.uniform(-0.10, 0.10)
        v.co.y += random.uniform(-0.10, 0.10)
        # flatten strata a touch so layers read horizontally
        v.co.z = round(v.co.z * 2.2) / 2.2 + random.uniform(-0.05, 0.05)
    bm.to_mesh(me)
    bm.free()

    # bevel for crisp stone edges, then decimate-free faceting
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = 0.06
    bev.segments = 1
    apply_modifiers(obj)

    # sit on ground
    lowest = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    obj.location.z -= lowest
    bpy.ops.object.transform_apply(location=True)

    stone = pbr_material("boulder_stone", (0.44, 0.43, 0.41), rough=0.9)
    moss = pbr_material("boulder_moss", (0.22, 0.34, 0.15), rough=0.95)
    obj.data.materials.append(stone)
    obj.data.materials.append(moss)  # index 1

    # moss on upward-facing, higher faces
    top_z = max(v.co.z for v in obj.data.vertices)
    for p in obj.data.polygons:
        if p.normal.z > 0.35 and p.center.z > top_z * 0.35:
            if random.random() < 0.85:
                p.material_index = 1
    shade_flat(obj)
    return obj


def one_pine(seed, scale=1.0):
    random.seed(seed)
    trunk_h = 0.9 * scale
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.13 * scale,
                                    radius2=0.07 * scale, depth=trunk_h)
    trunk = bpy.context.active_object
    trunk.location.z = trunk_h / 2.0
    trunk_mat = pbr_material(f"pine_trunk_{seed}", (0.27, 0.17, 0.10), rough=0.95)
    trunk.data.materials.append(trunk_mat)
    shade_flat(trunk)

    needle_mat = pbr_material(f"pine_needle_{seed}", (0.10, 0.26, 0.13),
                              rough=0.9)
    layers = []
    n_layers = 4
    base_z = trunk_h * 0.75
    for i in range(n_layers):
        t = i / (n_layers - 1)
        r = (0.75 - 0.55 * t) * scale
        h = (0.85 - 0.25 * t) * scale
        z = base_z + i * (0.52 * scale)
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=r, radius2=0.0,
                                        depth=h)
        c = bpy.context.active_object
        c.location.z = z
        c.rotation_euler.z = random.uniform(0, math.tau)
        # jag the rim to break the clean cone silhouette
        me = c.data
        bm = bmesh.new()
        bm.from_mesh(me)
        for v in bm.verts:
            if abs(v.co.z + h / 2.0) < 1e-4:  # rim ring
                v.co.x *= random.uniform(0.82, 1.18)
                v.co.y *= random.uniform(0.82, 1.18)
                v.co.z += random.uniform(-0.06, 0.02) * scale
        bm.to_mesh(me)
        bm.free()
        c.data.materials.append(needle_mat)
        shade_flat(c)
        layers.append(c)

    return join([trunk] + layers, f"_pine_{seed}")


def build_pine():
    """A small cluster of conifers (hero tree + two saplings)."""
    main = one_pine(21, scale=1.0)
    s1 = one_pine(22, scale=0.62)
    s1.location += Vector((0.85, 0.35, 0))
    s2 = one_pine(23, scale=0.5)
    s2.location += Vector((-0.7, -0.5, 0))
    obj = join([main, s1, s2], "pine")
    return obj


def build_bush():
    """Rounded leafy brush mound (LoL bush) from clustered flattened blobs."""
    random.seed(31)
    dark = pbr_material("bush_leaf", (0.13, 0.30, 0.14), rough=0.92)
    light = pbr_material("bush_crown", (0.28, 0.46, 0.20), rough=0.9)

    blobs = []
    placements = [
        (0.0, 0.0, 0.45, 0.85),
        (0.5, 0.15, 0.30, 0.60),
        (-0.45, 0.2, 0.32, 0.62),
        (0.15, -0.45, 0.30, 0.58),
        (-0.2, -0.35, 0.28, 0.55),
        (0.3, 0.4, 0.26, 0.52),
    ]
    for i, (x, y, r, sq) in enumerate(placements):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r)
        b = bpy.context.active_object
        b.location = (x, y, r * sq * 0.9)
        b.scale = (1.0, 1.0, sq)
        # irregular leafy surface
        me = b.data
        bm = bmesh.new()
        bm.from_mesh(me)
        for v in bm.verts:
            v.co += v.normal * random.uniform(-0.05, 0.09)
        bm.to_mesh(me)
        bm.free()
        blobs.append(b)

    obj = join(blobs, "bush")
    bpy.ops.object.transform_apply(scale=True)

    # sit on ground
    lowest = min(v.co.z for v in obj.data.vertices)
    obj.location.z -= lowest

    obj.data.materials.append(dark)
    obj.data.materials.append(light)  # index 1
    top_z = max(v.co.z for v in obj.data.vertices)
    for p in obj.data.polygons:
        if p.normal.z > 0.25 and p.center.z > top_z * 0.55:
            if random.random() < 0.7:
                p.material_index = 1
    shade_smooth(obj)
    return obj


# --------------------------------------------------------------------------- #
# render rig
# --------------------------------------------------------------------------- #
def build_world():
    world = bpy.data.worlds.new("preview_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.05, 0.07, 0.09, 1.0)
    bg.inputs["Strength"].default_value = 0.6
    bpy.context.scene.world = world


def add_light(name, ltype, energy, loc, rot=(0, 0, 0), size=3.0,
              color=(1, 1, 1)):
    data = bpy.data.lights.new(name, ltype)
    data.energy = energy
    data.color = color
    if ltype == "AREA":
        data.size = size
    if ltype == "SUN":
        data.angle = math.radians(3)
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def setup_scene(engine="BLENDER_EEVEE"):
    scene = bpy.context.scene
    scene.render.engine = engine
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 64
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    build_world()
    # key (warm sun), fill (cool soft), rim
    add_light("key", "SUN", 3.2, (4, -4, 6),
              rot=(math.radians(52), 0, math.radians(40)),
              color=(1.0, 0.95, 0.86))
    add_light("fill", "AREA", 120, (-4, -2, 3),
              rot=(math.radians(70), 0, math.radians(-60)), size=6,
              color=(0.65, 0.78, 1.0))
    add_light("rim", "AREA", 90, (0, 5, 4),
              rot=(math.radians(120), 0, 0), size=5,
              color=(0.8, 0.9, 1.0))


def add_ground():
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=6, fill_type="NGON")
    g = bpy.context.active_object
    g.name = "_ground"
    mat = pbr_material("_ground_mat", (0.16, 0.19, 0.12), rough=1.0)
    g.data.materials.append(mat)
    shade_smooth(g)
    return g


def frame_and_render(obj, path):
    # object bbox in world space
    coords = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    center = Vector(((min(xs) + max(xs)) / 2,
                     (min(ys) + max(ys)) / 2,
                     (min(zs) + max(zs)) / 2))
    size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 55
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    dist = size * 2.4 + 1.5
    direction = Vector((0.75, -1.0, 0.62)).normalized()
    cam.location = center + direction * dist
    look = center - cam.location
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
BUILDERS = [
    ("boulder", build_boulder),
    ("pine", build_pine),
    ("bush", build_bush),
]

results = []
for name, builder in BUILDERS:
    purge()
    obj = builder()

    # export GLB (object only, no rig/ground)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    glb = os.path.join(ASSETS_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=True, export_apply=True)

    # render preview (add rig + ground around the exported object)
    setup_scene()
    add_ground()
    png = os.path.join(PREVIEW_DIR, f"{name}.png")
    frame_and_render(obj, png)

    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    results.append((name, len(obj.data.polygons), tris, glb, png))

print("\n===== GENERATION SUMMARY =====")
for name, faces, tris, glb, png in results:
    print(f"{name:8s} | faces={faces:4d} tris~{tris:4d} | {glb} | {png}")
print("===== DONE =====")
