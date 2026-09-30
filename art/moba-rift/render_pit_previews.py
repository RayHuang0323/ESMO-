"""Owner Review previews for the v16 objective pit art fix (visual check only; not part of the runtime asset).

Run: blender --background --factory-startup --python art/moba-rift/render_pit_previews.py -- <glb> <source.json> <out_prefix> [overview]
Imports the GLB into an empty scene and renders top-down orthographic close-ups of both pits
(<out_prefix>-dragon-pit.png, <out_prefix>-baron-pit.png) with an identical camera/light rig, so before/after
and Dragon/Baron can be compared side by side. With `overview`, also renders the whole map.
Coordinates: GLB import gives Blender x = sim x - span/2, y = span/2 - sim y (same as build_rift.py authoring).
"""
import bpy, json, sys, math

args = sys.argv[sys.argv.index('--') + 1:]
glb, src_path, prefix = args[:3]
overview = len(args) > 3 and args[3] == 'overview'
src = json.load(open(src_path, encoding='utf-8'))
half = src['WORLD_BOUNDS']['width'] / 2

scene = bpy.context.scene
for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: scene.render.engine = eng; break
    except TypeError: continue
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.new('Preview'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.38, .48, .60, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .55; scene.world = world
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.0; sun.rotation_euler = (.55, -.35, -.5)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = 'ORTHO'; cam.rotation_euler = (0, 0, 0); cam.data.clip_end = 2000

def shot(x, y, scale, path, res=768):
    cam.location = (x - half, half - y, 400); cam.data.ortho_scale = scale
    scene.render.resolution_x = res; scene.render.resolution_y = res; scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

for key in ('dragon', 'baron'):
    p = src['PITS'][key]
    shot(p['x'], p['y'], 58, f'{prefix}-{key}-pit.png')
if overview:
    shot(half, half, half * 2 * 1.02, f'{prefix}-overview.png', 1024)
print('PREVIEW_DONE ' + prefix)
