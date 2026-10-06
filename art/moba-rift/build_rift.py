"""Run with Blender MCP, or headless (reproducible pipeline):
  blender --background --python art/moba-rift/build_rift.py
Optional env overrides (default = the live repo paths below):
  ESMO_RIFT_SOURCE=<source.json>  ESMO_RIFT_OUT=<dir for manifest.json>
  ESMO_RIFT_ASSET_OUT=<dir for esmo-rift.glb + rift-albedo.png>  ESMO_RIFT_BLEND=<.blend path>
Original ESMO meshes/textures; no downloaded assets.
Coordinates: Blender X east, Y north, Z up; glTF exports X east, Y up, Z south.
The scene is separate from the artist's active character scene.
"""
import bpy, json, math, os, random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('ESMO_RIFT_OUT') or ROOT / 'public' / 'assets' / 'moba' / 'rift-v1')
OUT.mkdir(parents=True, exist_ok=True)
# Files the runtime loads go through the Vite asset pipeline (content-hashed URLs);
# manifest.json and the preview render stay in public/. After a rebuild, update
# RIFT_GLB_BYTES in src/battle/moba/map/riftMapGate.js (check_moba_rift_loading guards it).
ASSET_OUT = Path(os.environ.get('ESMO_RIFT_ASSET_OUT') or ROOT / 'src' / 'assets' / 'moba' / 'rift-v1')
ASSET_OUT.mkdir(parents=True, exist_ok=True)
BLEND_OUT = Path(os.environ.get('ESMO_RIFT_BLEND') or Path(__file__).parent / 'esmo-rift.blend')
DATA = json.loads(Path(os.environ.get('ESMO_RIFT_SOURCE') or Path(__file__).parent / 'source.json').read_text(encoding='utf-8'))
SPAN = DATA['WORLD_BOUNDS']['width']
HALF = SPAN / 2
RNG = random.Random(93017)
prior = bpy.data.scenes.get('ESMO_Rift_330_v1')
if prior and bpy.context.window: bpy.data.scenes.remove(prior)
if bpy.context.window:
    scene = bpy.data.scenes.new('ESMO_Rift_330_v1')
    bpy.context.window.scene = scene
else:
    #  Headless (--background): no window to switch scenes on ⇒ build into the active scene, emptied first,
    #  so the glTF exporter's use_active_scene picks exactly these objects.
    scene = bpy.context.scene
    for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
    scene.name = 'ESMO_Rift_330_v1'
scene['mapVersion'] = 'esmo-rift-330-topology-final-v4'
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
 # Topology Final quadrant themes (natural hues only; topology itself is mirrored)
 'pineOlive': material('ShelfPine', (.085,.17,.075)),
 'leafOlive': material('ShelfMoss', (.19,.25,.095)),
 'pineAmber': material('EmberPine', (.11,.13,.06)),
 'leafAmber': material('EmberLeaf', (.36,.2,.07)),
 'pineDusk': material('DuskPine', (.045,.11,.12)),
 'leafDusk': material('DuskCanopy', (.12,.15,.19)),
 'rockWarm': material('EmberBasalt', (.23,.19,.155)),
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
    elif key=='trail':
        color=color*.95+np.array([.03,.024,.012])   # worn jungle trail, warm dirt
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
atlas.filepath_raw=str(ASSET_OUT/'rift-albedo.png'); atlas.file_format='PNG'; atlas.save(); atlas.pack()
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

def stone(x,y,length,width,h,angle,moss=True,mat='rock'):
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
    emit(mat,verts,faces,x,y)
    if moss and length>2 and width>2: column('moss',x,y,h-.15,min(length,width)*.24,.24,7,.94)

def tree(x,y,z,r,h):
    column('wood',x,y,z,r*.14,h*.7,5,.55)
    for j in range(4):
        column('pine' if j%2==0 else 'leaf',x,y,z+h*(.25+j*.16),r*(1-j*.20),h*.34,7,.015,j*.7)

def cone(name,x,y,z,r,h,n=7,angle=0,jag=0):
    # Open-bottom cone (the 52° top-down camera never sees the underside):
    # n side triangles, rim jittered so stacked tiers read as jagged needles.
    verts=[]
    for i in range(n):
        a=angle+i*math.tau/n; rr=r*(1+jag*((i*7919)%5-2)/10)
        verts.append((x+math.cos(a)*rr,y+math.sin(a)*rr,z))
    verts.append((x,y,z+h))
    emit(name,verts,[(i,(i+1)%n,n) for i in range(n)],x,y)

def pine(x,y,z,r,h,seed,trunk=True,mats=('pine','leaf')):
    # Topology Final light conifer: tapered trunk + 3 jagged tiers ≈ 31 triangles
    # (the original tree() is ~178). Dense jungle canopy needs many of these.
    if trunk:
        ring=[]
        for k,(dz,rad) in enumerate(((0,r*.16),(h*.45,r*.09))):
            for i in range(5):
                a=i*math.tau/5; ring.append((x+math.cos(a)*rad,y+math.sin(a)*rad,z+dz))
        emit('wood',ring,[(i,(i+1)%5,5+(i+1)%5,5+i) for i in range(5)],x,y)
    for j in range(3):
        cone(mats[0] if j!=1 else mats[1],x,y,z+h*(.22+j*.22),r*(1-j*.24),h*(.46-j*.06),7,seed*1.3+j*.9,.28)

# ── Topology Final: wall masses (jungle islands + out-of-bounds boundary) ──────
# Every visible rock vertex of a mass lies INSIDE its authoritative polygon
# (the same polygon the navigation field rasterizes): rings are only ever
# offset inward, never outward. Trees are planted with their full canopy
# radius inside the polygon too, so nothing visible overhangs walkable ground.
def _signed_area(poly):
    a=0
    for i in range(len(poly)):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%len(poly)]; a+=x1*y2-x2*y1
    return a/2

def _resample(poly,step):
    out=[]
    for i in range(len(poly)):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%len(poly)]
        n=max(1,int(math.ceil(math.hypot(x2-x1,y2-y1)/step)))
        for k in range(n): out.append((x1+(x2-x1)*k/n,y1+(y2-y1)*k/n))
    return out

def _inward(poly):
    # unit inward normal per vertex (bisector of the two edge normals) and miter factor
    s=1 if _signed_area(poly)>0 else -1
    n=len(poly); out=[]
    for i in range(n):
        (xa,ya),(xb,yb),(xc,yc)=poly[i-1],poly[i],poly[(i+1)%n]
        e1=(xb-xa,yb-ya); e2=(xc-xb,yc-yb)
        l1=math.hypot(*e1) or 1; l2=math.hypot(*e2) or 1
        n1=(-e1[1]/l1*s,e1[0]/l1*s); n2=(-e2[1]/l2*s,e2[0]/l2*s)
        bx,by=n1[0]+n2[0],n1[1]+n2[1]; bl=math.hypot(bx,by)
        if bl<1e-6: bx,by,bl=n1[0],n1[1],1
        bx,by=bx/bl,by/bl
        cosv=max(.45,bx*n1[0]+by*n1[1])
        out.append((bx/cosv,by/cosv))
    return out

def _point_in(px,py,poly):
    inside=False; j=len(poly)-1
    for i in range(len(poly)):
        xi,yi=poly[i]; xj,yj=poly[j]
        if (yi>py)!=(yj>py) and px<(xj-xi)*(py-yi)/(yj-yi+1e-12)+xi: inside=not inside
        j=i
    return inside

def _edge_dist(pts,poly):
    # min distance from each point to the polygon outline (numpy, vectorised over edges)
    P=np.array(pts,dtype=np.float64); A=np.array(poly,dtype=np.float64); B=np.roll(A,-1,axis=0)
    D=B-A; L2=(D*D).sum(1)+1e-12
    best=np.full(len(P),1e9)
    for k in range(0,len(A),256):
        a=A[k:k+256]; d=D[k:k+256]; l2=L2[k:k+256]
        t=np.clip(((P[:,None,:]-a[None])*d[None]).sum(2)/l2[None],0,1)
        q=a[None]+t[...,None]*d[None]
        best=np.minimum(best,np.sqrt(((P[:,None,:]-q)**2).sum(2)).min(1))
    return best

# quad → (canopy materials, rock material, tree spacing, rim stone step, rim height range)
THEMES={
 'blue_top':(('pine','leaf'),'rock',2.35,2.6,(1.2,1.55)),             # 冷杉深林 Deep Grove
 'red_bot':(('pineDusk','leafDusk'),'rock',2.35,2.6,(1.2,1.55)),      # 暮色深林 Dusk Grove
 'blue_bot':(('pineOlive','leafOlive'),'rock',3.0,1.9,(1.35,1.85)),   # 苔石岩台 Moss Shelf
 'red_top':(('pineAmber','leafAmber'),'rockWarm',3.0,1.9,(1.35,1.85)), # 琥珀岩台 Ember Shelf
 'boundary':(('pine','leaf'),'rock',3.5,0,(1,1)),
}

def mass(m,rng):
    cmat,rmat,tstep,rstep,rh=THEMES.get(m.get('quad'),THEMES['boundary'])
    boundary=m['kind']=='boundary_mass'
    poly=[(p['x'],p['y']) for p in m['poly']]
    poly=_resample(poly,1.6 if not boundary else 2.4)
    nrm=_inward(poly)
    H=(5.2 if boundary else 3.4)
    # (inset, height fraction, inward jitter). The TOP ring is the authoritative
    # outline itself (inset 0): an inward-offset top ring self-intersects on the
    # big concave boundary shapes and breaks the cap triangulation. Strata notches
    # only use small inward offsets on the middle rings, so every vertex stays
    # inside the navigation polygon and the cap is always a simple polygon.
    levels=((.02,-.12,0),(.25 if not boundary else .4,.40,.2),(.12 if not boundary else .25,.78,.18),(.0,1.0,0))
    rings=[]
    n=len(poly)
    for li,(ins,hf,jit) in enumerate(levels):
        ring=[]
        for i,((x,y),(nx_,ny_)) in enumerate(zip(poly,nrm)):
            j=jit*(((i*2654435761+li*97+m['_seed'])>>7)%100)/100
            d=ins+j
            z=H*hf if hf>0 else -.35
            if li in (1,2): z+=H*.07*((((i//3)*40503+li*13+m['_seed'])>>5)%3-1)   # strata steps
            if li==3: z=H*(.92+.08*(((i*7+m['_seed'])>>2)%5)/4)
            ring.append((x+nx_*d,y+ny_*d,z))
        rings.append(ring)
    verts=[v for r in rings for v in r]
    faces=[]
    for li in range(len(rings)-1):
        o0,o1=li*n,(li+1)*n
        for i in range(n): faces.append((o0+i,o0+(i+1)%n,o1+(i+1)%n,o1+i))
    cx=sum(p[0] for p in poly)/n; cy=sum(p[1] for p in poly)/n
    emit(rmat,verts,faces,cx,cy)
    top=rings[-1]
    # Dark canopy floor on top: obstacles must read darker than walkable ground
    # (ESMO Visual Bible §16 value hierarchy); trees then break the silhouette.
    emit(cmat[0],top,[tuple(range(n))],cx,cy)
    # Rocky rim (jungle islands): the same weathered stone columns the original
    # Rift walls and pit walls use, standing just inside the outline so each island
    # reads as a cliff wall with forest on top instead of an extruded slab.
    # Every footprint sample is tested against the polygon; a column that would
    # overhang walkable ground is skipped.
    if not boundary:
        acc=0.0; step_r=rstep
        for i in range(n):
            (x1,y1),(x2,y2)=poly[i],poly[(i+1)%n]
            seg=math.hypot(x2-x1,y2-y1)
            if seg<1e-6: continue
            tx,ty=(x2-x1)/seg,(y2-y1)/seg
            s=step_r-acc
            while s<seg:
                px,py=x1+tx*s,y1+ty*s
                # inward unit normal of THIS edge (stone()'s minor axis is the edge
                # normal; the vertex bisector is skewed near corners)
                sgn=1 if _signed_area(poly)>0 else -1
                ux,uy=-ty*sgn,tx*sgn
                L=rng.uniform(2.1,2.9); Wd=rng.uniform(1.4,1.9)
                cx_,cy_=px+ux*(Wd*.5+.15),py+uy*(Wd*.5+.15)
                # footprint ellipse: centre + tangent·cos·L/2 + normal·sin·W/2
                ok=all(_point_in(cx_+tx*math.cos(a)*L*.5+ux*math.sin(a)*Wd*.5,
                                 cy_+ty*math.cos(a)*L*.5+uy*math.sin(a)*Wd*.5,poly)
                       for a in [k*math.pi/8 for k in range(16)])   # covers all 8 octagon vertex directions
                if ok: stone(cx_,cy_,L,Wd,H*rng.uniform(*rh),math.atan2(tx,ty),moss=False,mat=rmat)
                s+=step_r
            acc=(acc+seg)%step_r
    # canopy
    xs=[p[0] for p in poly]; ys=[p[1] for p in poly]
    step=tstep
    cand=[]
    y=min(ys)+step*.5
    row=0
    while y<max(ys):
        x=min(xs)+step*(.5+.5*(row%2))
        while x<max(xs):
            cand.append((x+rng.uniform(-.7,.7),y+rng.uniform(-.7,.7))); x+=step
        y+=step*.87; row+=1
    cand=[c for c in cand if _point_in(c[0],c[1],poly)]
    if not cand: return 0
    ed=_edge_dist(cand,poly)
    planted=0
    for (x,y),d in zip(cand,ed):
        r=rng.uniform(1.35,1.95) if not boundary else rng.uniform(1.4,2.1)
        if d<r+.35: continue               # canopy stays inside the polygon outline
        if boundary and d>13 and rng.random()>.07: continue   # deep out-of-bounds: sparse
        pine(x,y,H*.9,r,rng.uniform(4.6,7.4) if not boundary else rng.uniform(6,9.5),planted+m['_seed'],trunk=not boundary,mats=cmat)
        planted+=1
    return planted

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

#  Tree layout. 'explicit.v1' (freeze_legacy_trees.py, 2026-09-30): each wall carries its own tree height
#  as data, so editing some walls (e.g. the v16 symmetric pits) never shifts trees or reeds elsewhere.
#  Legacy sources (no treeModel) keep the original index/RNG rule, byte for byte.
EXPLICIT_TREES = DATA.get('treeModel') == 'explicit.v1'
for i,w in enumerate(DATA['walls']):
    h=w.get('h',6)/DATA['WORLD_SCALE']
    stone(w['x'],w['y'],w['len'],w['thick'],h,w.get('angle',0))
    # Forest only atop blocking footprints; no decorative trees in walkable gaps.
    # Trunk stays inside the wall; elevated canopy can overhang its cliff.
    if EXPLICIT_TREES:
        if w.get('tree'): tree(w['x'],w['y'],h*.82,min(w['len'],w['thick'])*1.1,w['tree'])
    elif (i%3==0 or w.get('kind')=='outer_ridge') and min(w['len'],w['thick'])>1.4 and 'base' not in w.get('kind',''):
        tree(w['x'],w['y'],h*.82,min(w['len'],w['thick'])*1.1,RNG.uniform(7,12))
if EXPLICIT_TREES:
    #  Keep the reed stream identical to the legacy build: skip the draws the old wall pass consumed.
    for _ in range(int(DATA.get('reedRngSkip',0))): RNG.random()

# Topology Final: jungle islands and the out-of-bounds boundary.
MASS_RNG=random.Random(51023)
mass_trees=0
for k,m in enumerate(DATA.get('masses',[])):
    m['_seed']=k*131+7
    mass_trees+=mass(m,MASS_RNG)
scene['massTrees']=mass_trees

# Dense low reeds mark only real, traversable vision bushes, never fake camps.
for b in DATA['BUSHES']:
    for i in range(46):
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
bpy.ops.export_scene.gltf(filepath=str(ASSET_OUT/'esmo-rift.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_cameras=False,export_lights=False)
bpy.data.libraries.write(str(BLEND_OUT),{scene},fake_user=True)
stats={'mapVersion':scene['mapVersion'],'span':SPAN,'meshes':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),'glbBytes':(ASSET_OUT/'esmo-rift.glb').stat().st_size,'source':'Original ESMO Blender meshes and baked procedural texture'}
(OUT/'manifest.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats))
