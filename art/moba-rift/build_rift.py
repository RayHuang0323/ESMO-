"""Run with Blender MCP. Original ESMO meshes/textures; no downloaded assets.
Coordinates: Blender X east, Y north, Z up; glTF exports X east, Y up, Z south.
The scene is separate from the artist's active character scene.
"""
import bpy, json, math, random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'moba' / 'rift-v1'
OUT.mkdir(parents=True, exist_ok=True)
DATA = json.loads((Path(__file__).parent / 'source.json').read_text(encoding='utf-8'))
SPAN = DATA['WORLD_BOUNDS']['width']
HALF = SPAN / 2
RNG = random.Random(93017)
prior = bpy.data.scenes.get('ESMO_Rift_330_v1')
if prior: bpy.data.scenes.remove(prior)
scene = bpy.data.scenes.new('ESMO_Rift_330_v1')
bpy.context.window.scene = scene
scene['mapVersion'] = 'esmo-rift-330-corridor-v3'
scene['worldExtentRatio'] = 1.5
scene['coreDistanceRatio'] = 1.0
scene['source'] = 'Original ESMO procedural Blender authoring; no official game assets'
scene['units'] = '330 logical units; renderer WORLD_SCALE applied at load'

def material(name, color, roughness=.86, metallic=0):
    m = bpy.data.materials.new('Rift_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m

mats = {
 'rock': material('Basalt', (.16,.205,.19)),
 'moss': material('Moss', (.17,.25,.115)),
 'wood': material('CedarBark', (.15,.105,.065)),
 'pine': material('CedarNeedles', (.055,.16,.105)),
 'leaf': material('CanopyTips', (.12,.235,.125)),
 'reed': material('TacticalGrass', (.255,.34,.115)),
 'stone': material('WeatheredLimestone', (.34,.365,.32)),
 'bronze': material('AgedBronze', (.31,.235,.11), .56, .45),
 'blue': material('AzureInlay', (.07,.44,.54), .35, .2),
 'red': material('EmberInlay', (.52,.13,.07), .35, .2),
}
# Terrain atlas is baked from authoritative polygons into one opaque surface.
# This eliminates coplanar layered surfaces and their mobile depth flicker.
N = 2048
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
sx, sy = xx / (N-1) * SPAN, SPAN - yy / (N-1) * SPAN
noise = np.random.default_rng(93017).random((N,N), dtype=np.float32)
def value_noise(cells, seed):
    grid=np.random.default_rng(seed).random((cells+1,cells+1),dtype=np.float32)
    u=xx/(N-1)*(cells-.001); v=yy/(N-1)*(cells-.001)
    ix=u.astype(np.int32); iy=v.astype(np.int32); fx=u-ix; fy=v-iy
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    return (grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy
grain = .78 + .20*value_noise(55,10) + .13*value_noise(240,11) + .07*noise
rgb = np.zeros((N,N,3), dtype=np.float32)
rgb[:] = (.12,.185,.12)
region = np.zeros((N,N), dtype=np.uint8)
def paint(poly, color, tag):
    if len(poly) < 3: return
    xs = [p['x'] for p in poly]; ys = [p['y'] for p in poly]
    x0 = max(0,int(min(xs)/SPAN*(N-1))); x1 = min(N,int(max(xs)/SPAN*(N-1))+2)
    y0 = max(0,int((SPAN-max(ys))/SPAN*(N-1))); y1 = min(N,int((SPAN-min(ys))/SPAN*(N-1))+2)
    X=sx[y0:y1,x0:x1]; Y=sy[y0:y1,x0:x1]
    inside=np.zeros(X.shape,dtype=bool)
    j=len(poly)-1
    for i,p in enumerate(poly):
        q=poly[j]
        inside ^= ((p['y']>Y)!=(q['y']>Y)) & (X < (q['x']-p['x'])*(Y-p['y'])/(q['y']-p['y']+1e-12)+p['x'])
        j=i
    rgb[y0:y1,x0:x1][inside]=color
    region[y0:y1,x0:x1][inside]=tag

for g in DATA['ground']:
    key=g.get('colorKey',''); kind=g.get('kind','')
    c=g['color']; color=np.array([(c>>16&255)/255,(c>>8&255)/255,(c&255)/255])
    tag=0
    if any(t in key for t in ('water','river','ford')):
        color=color*.55+np.array([.025,.13,.145]); tag=2
    elif any(t in key for t in ('lane','slab','base','plaza','path','ramp','camp')):
        color=color*.58+np.array([.15,.14,.10]); tag=1
    else: color=color*.72+np.array([.035,.075,.018])
    paint(g['poly'],color,tag)
rgb *= grain[:,:,None]
# Worn coursed stones follow the ground, rather than floating decal meshes.
joint=(np.abs(np.sin((sx+1.1*np.sin(sy*.12))*.9))<.045) | (np.abs(np.sin(sy*1.28))<.04)
rgb[(region==1)&joint]*=.70
# Broad directional flow, with irregular bed colour; avoid a crossing-sine grid.
river_bed = value_noise(36, 812)
flow = np.sin(sy*.72 + sx*.15 + 2.4*value_noise(17, 813))
rgb[region==2] *= (.93 + .12*river_bed[region==2,None] + .025*flow[region==2,None])
rgba=np.ones((N,N,4),dtype=np.float32); rgba[:,:,:3]=np.clip(rgb,0,1)
atlas=bpy.data.images.new('ESMO_Rift_Original_Atlas',width=N,height=N,alpha=False)
atlas.pixels.foreach_set(rgba.ravel())
atlas.filepath_raw=str(OUT/'rift-albedo.png'); atlas.file_format='PNG'; atlas.save(); atlas.pack()
groundmat=material('GroundAtlas',(1,1,1))
tex=groundmat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=atlas
groundmat.node_tree.links.new(tex.outputs['Color'],groundmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
mats['ground']=groundmat

# Batch by material and 4×4 world tiles: bounded draw calls, frustum culling.
batches={}
def emit(name, vertices, faces, cx, cy):
    tile=(min(3,max(0,int(cx/SPAN*4))),min(3,max(0,int(cy/SPAN*4))))
    key=(name,tile); v,f=batches.setdefault(key,([],[])); off=len(v)
    v.extend([(x-HALF,HALF-y,z) for x,y,z in vertices]); f.extend([tuple(off+i for i in face) for face in faces])

def column(name,x,y,z,r,h,n=7,top=.75,angle=0):
    verts=[]
    for dz,rad in ((0,r),(h*.48,r*.98),(h,r*top)):
        for i in range(n):
            a=angle+i*math.tau/n; verts.append((x+math.cos(a)*rad,y+math.sin(a)*rad,z+dz))
    faces=[tuple(reversed(range(n))),tuple(range(2*n,3*n))]
    for k in range(2):
        for i in range(n): faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
    emit(name,verts,faces,x,y)

def stone(x,y,length,width,h,angle):
    # Three weathered strata, kept within the authoritative wall footprint.
    # mapPassability measures wall heading from +Y: direction=(sin(a),cos(a)).
    # The authored ellipse uses an angle from +X, so convert the basis once.
    angle=math.pi/2-angle
    verts=[]; n=8
    for z,k in ((-.3,1),(h*.38,.99),(h*.78,.83),(h,.53)):
        for i in range(n):
            a=math.tau*i/n; u=math.cos(a)*length*.49*k; v=math.sin(a)*width*.49*k
            verts.append((x+u*math.cos(angle)-v*math.sin(angle),y+u*math.sin(angle)+v*math.cos(angle),z))
    faces=[tuple(range(3*n,4*n))]
    for level in range(3):
        for i in range(n): faces.append((level*n+i,level*n+(i+1)%n,(level+1)*n+(i+1)%n,(level+1)*n+i))
    emit('rock',verts,faces,x,y)
    if length>2 and width>2: column('moss',x,y,h-.15,min(length,width)*.24,.24,7,.94)

def tree(x,y,z,r,h):
    column('wood',x,y,z,r*.14,h*.7,5,.55)
    for j in range(4):
        column('pine' if j%2==0 else 'leaf',x,y,z+h*(.25+j*.16),r*(1-j*.20),h*.34,7,.015,j*.7)

# Single UV mapped ground; all walkable areas remain at unit feet plane z=0.
G=1; verts=[]; faces=[]
for j in range(G+1):
    for i in range(G+1): verts.append((i/G*SPAN-HALF,HALF-j/G*SPAN,-.045))
for j in range(G):
    for i in range(G):
        a=j*(G+1)+i; faces.append((a,a+G+1,a+G+2,a+1))
mesh=bpy.data.meshes.new('Rift_Ground'); mesh.from_pydata(verts,[],faces); mesh.update()
obj=bpy.data.objects.new('Rift_Ground',mesh); scene.collection.objects.link(obj); mesh.materials.append(groundmat)
uv=mesh.uv_layers.new(name='TerrainUV')
for poly in mesh.polygons:
    for li in poly.loop_indices:
        p=mesh.vertices[mesh.loops[li].vertex_index].co
        uv.data[li].uv=((p.x+HALF)/SPAN,(p.y+HALF)/SPAN)

for i,w in enumerate(DATA['walls']):
    h=w.get('h',6)/DATA['WORLD_SCALE']
    stone(w['x'],w['y'],w['len'],w['thick'],h,w.get('angle',0))
    # Forest only atop blocking footprints; no decorative trees in walkable gaps.
    if (i%3==0 or w.get('kind')=='outer_ridge') and min(w['len'],w['thick'])>1.4 and 'base' not in w.get('kind',''):
        # Trunk stays inside the wall; elevated canopy can overhang its cliff.
        tree(w['x'],w['y'],h*.82,min(w['len'],w['thick'])*1.1,RNG.uniform(7,12))

# Dense low reeds mark only real, traversable vision bushes, never fake camps.
for b in DATA['BUSHES']:
    for i in range(65):
        a=RNG.random()*math.tau; r=math.sqrt(RNG.random())*b['r']*.87
        x=b['x']+math.cos(a)*r; y=b['y']+math.sin(a)*r
        column('reed',x,y,0,RNG.uniform(.22,.43),RNG.uniform(.65,1.3),4,.02,a)

# Original fortress podiums: neutral limestone and bronze with team inlays.
# No static tower or monster bodies: runtime snapshot retains alive/hp authority.
for side,p in DATA['BASE'].items():
    x,y=p['x'],p['y']
    column('stone',x,y,-.08,7.8,.42,16,.97)
    column('bronze',x,y,.34,5.8,.25,12,.97)
    column('stone',x,y,.59,4.7,.28,12,.96)
    column('stone',x,y,.87,2.6,7.3,8,.7)
    column('bronze',x,y,8.17,2.8,.45,8,1.1)
    for i in range(4):
        a=i*math.tau/4+math.pi/4
        column('stone',x+math.cos(a)*2.7,y+math.sin(a)*2.7,.65,.62,7.8,5,.6,a)
    for i in range(8):
        a=i*math.tau/8
        column(side,x+math.cos(a)*6.6,y+math.sin(a)*6.6,.35,.42,.16,4,.9,a)
for side,p in DATA['FOUNTAIN'].items():
    column('stone',p['x'],p['y'],-.07,5.5,.14,20,1)
    column(side,p['x'],p['y'],.07,4.2,.025,24,1)
for key,p in DATA['PITS'].items():
    # Low worn threshold markers preserve every opening in nav geometry.
    for i in range(6):
        a=i*math.tau/6
        column('bronze',p['x']+math.cos(a)*5,p['y']+math.sin(a)*5,-.025,.45,.055,5,.9)
for c in DATA['CAMPS']:
    if c['type']=='buff':
        for i in range(4):
            a=i*math.tau/4
            column(c['side'],c['x']+math.cos(a)*3.6,c['y']+math.sin(a)*3.6,-.025,.3,.05,4,.9)

for (name,tile),(v,f) in batches.items():
    mesh=bpy.data.meshes.new(f'Rift_{name}_{tile}'); mesh.from_pydata(v,[],f); mesh.update()
    obj=bpy.data.objects.new(mesh.name,mesh); scene.collection.objects.link(obj); mesh.materials.append(mats[name])
    obj['role']='presentation-only'; obj['tile']=str(tile)

# Authoring preview rig; excluded from runtime glTF export.
world=bpy.data.worlds.new('Rift_Daylight'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.48,.60,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5; scene.world=world
light=bpy.data.lights.new('Rift_Sun','SUN'); light.energy=2.4; light.angle=.16
sun=bpy.data.objects.new('Rift_Sun',light); scene.collection.objects.link(sun); sun.rotation_euler=(.5,-.6,-.4)
camera=bpy.data.cameras.new('Rift_Ortho'); camera.type='ORTHO'; camera.ortho_scale=SPAN*1.16; camera.clip_end=1500
cam=bpy.data.objects.new('Rift_Ortho',camera); scene.collection.objects.link(cam); cam.location=(0,-SPAN*.85,SPAN*1.2)
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler(); scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1600; scene.render.resolution_y=1300; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'rift-preview.png')
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type=='MESH': obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'esmo-rift.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_cameras=False,export_lights=False)
bpy.data.libraries.write(str(Path(__file__).parent/'esmo-rift.blend'),{scene},fake_user=True)
stats={'mapVersion':scene['mapVersion'],'span':SPAN,'meshes':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),'glbBytes':(OUT/'esmo-rift.glb').stat().st_size,'source':'Original ESMO Blender meshes and baked procedural texture'}
(OUT/'manifest.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats))
