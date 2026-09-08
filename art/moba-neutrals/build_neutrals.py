"""ESMO original neutral creatures. Run inside Blender through Blender MCP.
Authored lofted anatomy, weighted armatures, authored clips; no combat values.
Blender Z up / -Y forward exports to glTF Y up / +Z forward.
"""
from pathlib import Path
import bpy, math, json
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/moba/neutrals-v1'
OUT.mkdir(parents=True, exist_ok=True)
ART = Path(__file__).resolve().parent
TAU = math.tau

def v(p): return Vector((p[0], -p[1], p[2]))

def texture(name, base):
    n = 1024
    y,x = np.mgrid[0:n,0:n].astype(np.float32) / n
    grain = np.random.default_rng(1943).random((n,n)).astype(np.float32)
    cells = np.sin((x*43 + np.sin(y*TAU*23)*.19)*TAU)*np.sin(y*TAU*37)
    ribs = np.abs(np.sin((y*31 + .22*np.sin(x*TAU*17))*TAU))
    shade = .68 + .21*ribs + .12*cells + .075*grain
    a = np.ones((n,n,4), dtype=np.float32)
    for c in range(3): a[:,:,c] = np.clip(base[c]*shade,0,1)
    im = bpy.data.images.new(name, width=n,height=n,alpha=True)
    im.pixels.foreach_set(a.ravel()); im.pack()
    return im

def material(name, color, rough=.76, tex=False, glow=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    if glow:
        bs.inputs['Emission Color'].default_value=(*color,1)
        bs.inputs['Emission Strength'].default_value=.8
    if tex:
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=texture(name+'_skin',color)
        m.node_tree.links.new(t.outputs['Color'],bs.inputs['Base Color'])
        # glTF needs a tangent-space normal texture, not Blender's height/Bump node.
        n=512; yy,xx=np.mgrid[0:n,0:n].astype(np.float32)/n
        height=np.sin(xx*TAU*32)*np.sin(yy*TAU*29)*.045
        gy,gx=np.gradient(height); normal=np.dstack((-gx*18,-gy*18,np.ones_like(gx)))
        normal/=np.linalg.norm(normal,axis=2,keepdims=True)
        pixels=np.ones((n,n,4),dtype=np.float32); pixels[:,:,:3]=normal*.5+.5
        im=bpy.data.images.new(name+'_normal',width=n,height=n,alpha=True)
        im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(pixels.ravel()); im.pack()
        nt=m.node_tree.nodes.new('ShaderNodeTexImage'); nt.image=im
        nm=m.node_tree.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.35
        m.node_tree.links.new(nt.outputs['Color'],nm.inputs['Color'])
        m.node_tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return m

class Creature:
    def __init__(self,key,colors):
        self.key=key; self.verts=[]; self.faces=[]; self.uv=[]; self.weights=[]; self.mi=[]
        self.bones={}; self.mats=[material(key+'_hide',colors[0],tex=True),
            material(key+'_carapace',colors[1],.58),material(key+'_ivory',(.64,.56,.37),.49),
            material(key+'_mouth',(.07,.016,.024),.4),material(key+'_eyes',colors[2],.3,glow=True)]
    def bone(self,name,a,b,parent=None): self.bones[name]=(a,b,parent); return name
    def tube(self,pts,radii,bone,mat=0,sides=12,detail=.018):
        # Smooth anatomical sections, tapering endpoints; custom topology, no primitive placeholders.
        start=len(self.verts); count=len(pts)
        for j,p in enumerate(pts):
            tangent=(v(pts[min(j+1,count-1)])-v(pts[max(j-1,0)])).normalized()
            ref=Vector((0,0,1)) if abs(tangent.z)<.92 else Vector((0,1,0))
            a=tangent.cross(ref).normalized(); b=tangent.cross(a).normalized()
            rx,ry=radii[j] if isinstance(radii[j],tuple) else (radii[j],radii[j])
            for k in range(sides):
                ang=TAU*k/sides; noise=1+detail*math.sin(k*3.7+j*2.1)
                q=v(p)+a*(math.cos(ang)*rx*noise)+b*(math.sin(ang)*ry*noise)
                self.verts.append(tuple(q)); self.uv.append((k/sides,j/(count-1)))
                if isinstance(bone,str): w={bone:1}
                else:
                    f=j/(count-1)*(len(bone)-1); i=min(int(f),len(bone)-1); blend=f-i
                    w={bone[i]:1-blend}
                    if i+1<len(bone): w[bone[i+1]]=blend
                self.weights.append(w)
        for j in range(count-1):
            for k in range(sides):
                self.faces.append((start+j*sides+k,start+j*sides+(k+1)%sides,
                    start+(j+1)*sides+(k+1)%sides,start+(j+1)*sides+k)); self.mi.append(mat)
        self.faces.extend([tuple(start+k for k in reversed(range(sides))),
            tuple(start+(count-1)*sides+k for k in range(sides))]); self.mi.extend([mat,mat])
    def oval(self,c,r,bone,mat=0,sides=16,rings=10):
        pts=[]; radii=[]
        for j in range(rings+1):
            a=math.pi*j/rings
            pts.append((c[0],c[1]+r[1]*math.cos(a),c[2]))
            radii.append((max(.006,r[0]*math.sin(a)),max(.006,r[2]*math.sin(a))))
        self.tube(pts,radii,bone,mat,sides)
    def horn(self,pts,r,bone,mat=2):
        self.tube(pts,[max(.009,r*(1-i/(len(pts)-1))**.8) for i in range(len(pts))],bone,mat,10)
    def build(self):
        scene=bpy.data.scenes.new('ESMO_Neutral_'+self.key); bpy.context.window.scene=scene
        mesh=bpy.data.meshes.new(self.key+'_anatomy'); mesh.from_pydata(self.verts,[],self.faces); mesh.update()
        obj=bpy.data.objects.new(self.key+'_skin',mesh); scene.collection.objects.link(obj)
        for m in self.mats: mesh.materials.append(m)
        uv=mesh.uv_layers.new(name='SkinUV')
        for poly,mi in zip(mesh.polygons,self.mi):
            poly.material_index=mi; poly.use_smooth=True
            for li in poly.loop_indices: uv.data[li].uv=self.uv[mesh.loops[li].vertex_index]
        arm=bpy.data.armatures.new(self.key+'_skeleton'); rig=bpy.data.objects.new(self.key+'_rig',arm)
        scene.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        for name,(a,b,parent) in self.bones.items():
            eb=arm.edit_bones.new(name); eb.head=v(a); eb.tail=v(b)
            if parent: eb.parent=arm.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        for name in self.bones: obj.vertex_groups.new(name=name)
        for i,w in enumerate(self.weights):
            for name,weight in w.items():
                if weight>0: obj.vertex_groups[name].add([i],weight,'REPLACE')
        mod=obj.modifiers.new('ESMO weighted deformation','ARMATURE'); mod.object=rig; obj.parent=rig
        for name,bone in [('ground','root'),('target','head'),('vfx-hit','body'),('vfx-death','body'),('attack-origin','jaw')]:
            socket=bpy.data.objects.new('socket-'+name,None); scene.collection.objects.link(socket)
            socket.parent=rig; socket.parent_type='BONE'; socket.parent_bone=bone
        self.animate(rig)
        scene.render.fps=24; scene.frame_set(0)
        bpy.ops.object.select_all(action='DESELECT')
        for o in scene.objects: o.select_set(True)
        bpy.context.view_layer.objects.active=rig
        bpy.ops.export_scene.gltf(filepath=str(OUT/(self.key+'.glb')),export_format='GLB',
            use_selection=True,use_active_scene=True,export_animations=True,
            export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,
            export_yup=True,export_apply=False)
        bpy.data.libraries.write(str(ART/(self.key+'.blend')),{scene},fake_user=True)
        mesh.calc_loop_triangles()
        return {'id':self.key,'file':self.key+'.glb','vertices':len(mesh.vertices),
            'triangles':len(mesh.loop_triangles),'bones':len(arm.bones),'materials':len(self.mats),
            'bytes':(OUT/(self.key+'.glb')).stat().st_size,'clips':self.clips,
            'height':max(p[2] for p in self.verts),'provenance':'Original ESMO authored anatomical meshes via Blender MCP; no third-party assets'}
    def animate(self,rig):
        self.clips={'Idle':4,'Move':1.333333,'Attack':1,'Hit':.416667,'Death':2}
        if self.key in ['dragon','baron']: self.clips['Roar']=2.5
        rig.animation_data_create()
        for clip,duration in self.clips.items():
            action=bpy.data.actions.new(self.key+'_'+clip); rig.animation_data.action=action
            end=round(duration*24)
            for frame in sorted(set([0,round(end*.18),round(end*.4),round(end*.65),end])):
                t=frame/end; wave=math.sin(t*TAU)
                for pb in rig.pose.bones:
                    pb.rotation_mode='XYZ'; pb.rotation_euler=(0,0,0); pb.location=(0,0,0); pb.scale=(1,1,1)
                    name=pb.name
                    if clip=='Idle':
                        if name=='body': pb.scale=(1+.018*wave,1+.022*wave,1+.018*wave)
                        if name=='head': pb.rotation_euler.x=.035*wave
                        if 'tail' in name: pb.rotation_euler.z=.08*math.sin(t*TAU+len(name))
                        if 'wing' in name: pb.rotation_euler.y=.05*wave
                    elif clip=='Move':
                        if name=='body': pb.location.z=.09*abs(wave)
                        if 'leg' in name or 'arm' in name: pb.rotation_euler.x=.32*wave*(1 if name.endswith('L') else -1)
                        if 'tail' in name: pb.rotation_euler.z=.14*wave
                    elif clip=='Attack':
                        hit=math.sin(math.pi*min(1,t/.4)) if t<.4 else -.28*math.sin(math.pi*(t-.4)/.6)
                        if name=='body': pb.rotation_euler.x=-.16*hit
                        if name=='neck': pb.rotation_euler.x=.22*hit
                        if name=='head': pb.rotation_euler.x=.35*hit
                        if name=='jaw': pb.rotation_euler.x=-.65*max(0,hit)
                        if 'arm' in name: pb.rotation_euler.x=-.55*hit
                        if 'wing' in name: pb.rotation_euler.y=.22*hit*(1 if name.endswith('L') else -1)
                    elif clip=='Hit':
                        j=math.sin(t*math.pi)
                        if name=='body': pb.rotation_euler.z=.13*j
                        if name=='head': pb.rotation_euler.x=-.2*j
                    elif clip=='Death':
                        f=min(1,t/.65); f=f*f*(3-2*f)
                        if name=='body': pb.location.z=-min(2.3,self.bones['body'][0][2]*.55)*f; pb.rotation_euler.y=1.04*f
                        if name=='neck': pb.rotation_euler.x=.55*f
                        if name=='jaw': pb.rotation_euler.x=-.35*f
                        if 'leg' in name or 'arm' in name: pb.rotation_euler.x=.75*f
                        if 'wing' in name: pb.rotation_euler.y=.65*f*(1 if name.endswith('L') else -1)
                    elif clip=='Roar':
                        j=math.sin(t*math.pi)
                        if name=='neck': pb.rotation_euler.x=-.35*j
                        if name=='jaw': pb.rotation_euler.x=-.8*j
                        if 'wing' in name: pb.rotation_euler.y=.35*j*(1 if name.endswith('L') else -1)
                    pb.keyframe_insert('rotation_euler',frame=frame); pb.keyframe_insert('location',frame=frame); pb.keyframe_insert('scale',frame=frame)
            track=rig.animation_data.nla_tracks.new(); track.name=clip
            strip=track.strips.new(clip,0,action); strip.action_slot=rig.animation_data.action_slot
            strip.extrapolation='NOTHING'
            rig.animation_data.action=None
        for tr in rig.animation_data.nla_tracks: tr.mute=False

PALETTES={
 'dragon':[(.25,.38,.29),(.095,.19,.15),(.95,.53,.07)],
 'baron':[(.28,.16,.36),(.09,.065,.15),(.45,.88,.55)],
 'red-buff':[(.30,.105,.055),(.17,.08,.035),(1,.21,.025)],
 'blue-buff':[(.20,.29,.32),(.065,.135,.17),(.07,.65,1)],
 'wolf':[(.34,.38,.42),(.105,.14,.19),(.65,.86,1)],
 'stone-beetle':[(.31,.28,.17),(.20,.25,.18),(.83,.58,.14)],
}

def make_beetle():
    c=Creature('stone-beetle',PALETTES['stone-beetle'])
    c.bone('root',(0,0,0),(0,0,.3));c.bone('motion',(0,0,.3),(0,0,.6),'root')
    c.bone('body',(0,0,1.8),(0,1,1.8),'motion')
    c.bone('neck',(0,1.2,1.8),(0,2.1,1.8),'body')
    c.bone('head',(0,2.1,1.8),(0,3,1.8),'neck')
    c.bone('jaw',(0,2.5,1.6),(0,3.5,1.6),'head')
    c.oval((0,-.2,1.65),(2.1,2.65,1.1),'body',0,24,14)
    for side,suffix in [(-1,'L'),(1,'R')]:
        c.oval((side*.87,-.45,2.24),(1.15,2.35,1.1),'body',1,24,14)
        for j in range(3):
            y=1.25-j*1.45
            a=(side*1.55,y,1.8);b=(side*(3.1+.22*j),y-.55,1.22);end=(side*(3.5+.18*j),y+.15,.12)
            n='leg-'+str(j)+suffix;f='shin-'+str(j)+suffix
            c.bone(n,a,b,'body');c.bone(f,b,end,n)
            c.tube([a,(side*2.4,y-.24,1.78),b,end],[.33,.24,.19,.045],[n,n,f,f],1,14)
            c.horn([end,(end[0]+side*.18,end[1]+.2,.08),(end[0]+side*.25,end[1]+.38,.02)],.09,f)
        c.oval((side*.48,2.45,2),(.22,.24,.17),'head',4,12,8)
        c.horn([(side*.85,2.65,1.65),(side*1.65,3.4,1.55),(side*1.25,4.25,1.7),(side*.22,4.4,1.8)],.35,'jaw',2)
        n='antenna-'+suffix;c.bone(n,(side*.7,2.7,2.1),(side*1.1,3.6,2.9),'head')
        c.tube([(side*.7,2.7,2.1),(side*1.1,3.6,2.9),(side*1.8,4,3.2)],[.085,.055,.025],n,0,10)
        for j in range(5):
            c.oval((side*1.18,-1.9+j*.75,3.05),(.44,.40,.22),'body',1,12,8)
    c.oval((0,1.8,1.95),(1.2,1, .65),'head',1,20,12)
    c.oval((0,2.9,1.7),(.65,.5,.22),'jaw',3,16,8)
    return c.build()

def make(key):
    if key=='stone-beetle': return make_beetle()
    c=Creature(key,PALETTES[key]); boss=key in ('dragon','baron')
    serpent=key=='baron'; wolf=key=='wolf'; beetle=key=='stone-beetle'
    h=9 if serpent else 3.8 if boss else 2.5 if wolf else 3.1
    length=4 if boss else 2.5 if wolf else 2.1
    width=2.3 if boss else 1.15 if wolf else 2.0
    c.bone('root',(0,0,0),(0,0,.3)); c.bone('motion',(0,0,.3),(0,0,.6),'root')
    c.bone('body',(0,0,h),(0,1,h+.4),'motion')
    neck=(0,length*.65,h+.25); head=(0,length+1,h+.65)
    c.bone('neck',neck,head,'body'); c.bone('head',head,(0,length+2,h+.65),'neck')
    c.bone('jaw',(0,length+.65,h+.15),(0,length+2,h-.1),'head')
    if serpent:
        c.tube([(0,-3,.4),(.6,-2,2.3),(.8,-1,4.6),(.4,0,6.7),(0,1,9),(0,2.7,10)],
            [(2.4,2),(2.4,2.2),(2.1,1.8),(1.8,1.7),(2.1,1.7),(.8,1)],['body','body','neck'],0,24)
    else:
        c.tube([(0,-length-1,h-.35),(0,-length,h),(0,-length*.5,h+.1),(0,0,h+.25),(0,length*.6,h+.2),(0,length,h)],
            [(.1,.15),(width*.62,width*.72),(width,width*.82),(width*1.1,width),(.85*width,.8*width),(.45,.55)],'body',0,24)
        c.oval((0,-.2,h+.3),(width*.85,length*.82,width*.72),'body',1 if beetle else 0,20,12)
    c.tube([neck,(0,length,h+.5),head],[(width*.6,width*.6),(width*.6,width*.65),(.7,.75)],['neck','neck','head'],0,20)
    headw=1.7 if serpent else 1.1 if boss else .7 if wolf else 1.1
    c.oval(head,(headw,1.5 if wolf else 1.25,headw*.76),'head',0,20,12)
    snout=(0,length+2,h+.26)
    c.oval(snout,(headw*.75,.9,.45),'head',1,16)
    c.oval((0,length+1.7,h-.03),(headw*.76,1,.18),'jaw',3,16)
    c.oval((0,length+1.65,h-.23),(headw*.78,.95,.20),'jaw',0,16)
    for side in [-1,1]:
        c.oval((side*headw*.87,length+1.25,h+.85),(.21,.35,.16),'head',4,12,8)
        c.oval((side*headw*.95,length+1.23,h+1.01),(.27,.48,.17),'head',1,12,8)
        c.oval((side*headw*.43,length+2.62,h+.43),(.13,.18,.09),'head',3,10,6)
        for j in range(5 if boss else 3):
            p=(side*headw*.63,length+.95+j*.34,h+.11)
            c.horn([p,(p[0],p[1]+.07,p[2]-.22),(p[0]*.92,p[1]+.13,p[2]-.48)],.13,'head')
        ear=(side*headw*.8,length+.35,h+1)
        if wolf:
            c.horn([ear,(side*headw*1.13,length+.2,h+1.55),(side*headw*1.3,length+.15,h+1.95)],.28,'head',1)
            c.oval((side*.30,length+2.67,h+.36),(.24,.2,.15),'head',3,12,8)
        else:
            c.horn([ear,(side*headw*1.3,length-.15,h+2),(side*headw*1.55,length-.65,h+2.7)],.35,'head',2)
    if not serpent:
        for side,suffix in [(-1,'L'),(1,'R')]:
            for front in [True,False]:
                by=length*.53 if front else -length*.7; bx=side*width*.77
                jname=('arm-' if front else 'leg-')+suffix; lower=('forearm-' if front else 'shin-')+suffix
                a=(bx,by,h); b=(bx*1.15,by-.25,h*.48); foot=(bx*1.2,by+.4,.25)
                c.bone(jname,a,b,'body'); c.bone(lower,b,foot,jname)
                rad=.38 if wolf else .63
                c.tube([a,((a[0]+b[0])/2,by-.14,h*.72),b,foot],
                    [rad*1.35,rad,rad*.7,rad*.48],[jname,jname,lower,lower],0,14)
                c.oval((foot[0],foot[1]+.25,.3),(.36 if wolf else .6,.72,.28),lower,1,14,8)
                for digit in [-1,0,1]:
                    p=(foot[0]+digit*.25,foot[1]+.62,.24)
                    c.horn([p,(p[0],p[1]+.3,.15),(p[0],p[1]+.55,.09)],.14,lower)
    # Individually weighted articulated tail.
    tailpts=[(0,-length,h*.8),(.3,-length-1.6,h*.65),(.8,-length-3,h*.43),(1.1,-length-4.4,.7),(.7,-length-5.3,.35)]
    for j in range(4): c.bone('tail-'+str(j),tailpts[j],tailpts[j+1],'body' if j==0 else 'tail-'+str(j-1))
    c.tube(tailpts,[.9 if boss else .45,.7 if boss else .4,.4,.22,.03],['tail-0','tail-1','tail-2','tail-3'],0,16)
    # Layered dorsal armour / sculpted scale ridges.
    for j in range(8 if boss else 5):
        y=-length+j*(length*1.7)/(7 if boss else 4)
        z=h+width*.8+.12*math.sin(j)
        for side in [-1,0,1]:
            p=(side*width*.55,y,z-.25*abs(side))
            if serpent:
                p=(side*1.3,-3.2+j*.58,2+j*1.12)
                z=p[2]
            if wolf:
                c.horn([p,(p[0]*1.1,y-.25,z+.22),(p[0]*1.15,y-.8,z+.05)],.27,'body',1)
            else:
                c.oval(p,(width*.34,.65,.24 if beetle else .35),'body',1,12,6)
                if side==0: c.horn([p,(0,p[1]-.3,z+.8),(0,p[1]-.65,z+1.35)],.32,'body')
    if key=='dragon':
        for side,suffix in [(-1,'L'),(1,'R')]:
            a=(side*1.65,.8,h+.8); b=(side*4.2,.3,h+3.2); tip=(side*7,-1.5,h+2.5)
            c.bone('wing-'+suffix,a,b,'body'); c.bone('wingtip-'+suffix,b,tip,'wing-'+suffix)
            c.tube([a,b,tip],[.4,.25,.055],['wing-'+suffix,'wingtip-'+suffix],1,12)
            ends=[(side*6,-3,h+.7),(side*4,-4,h-.3),(side*2,-3,h-.8)]
            for end in ends:
                c.tube([b,((b[0]+end[0])/2,(b[1]+end[1])/2,h+1.5),end],[.16,.09,.025],'wing-'+suffix,2,8)
            rim=[tip,*ends,a]
            for j in range(len(rim)-1):
                start=len(c.verts)
                for row in range(9):
                    t=row/8
                    for col in range(9):
                        q=col/8; end=Vector(rim[j]).lerp(Vector(rim[j+1]),q)
                        p=Vector(b).lerp(end,t); p.z-=.32*math.sin(t*math.pi)*math.sin(q*math.pi)
                        c.verts.append(tuple(v(p))); c.uv.append((q,t)); c.weights.append({'wing-'+suffix:1})
                for row in range(8):
                    for col in range(8):
                        i=start+row*9+col; c.faces.append((i,i+1,i+10,i+9)); c.mi.append(0)
        c.mats[0].use_backface_culling=False
    elif serpent:
        for side in [-1,1]:
            for j in range(3):
                a=(side*1.7,1-j*1.25,7-j*.8); b=(side*(4+j*.2),1-j,4-j*.3); end=(side*(3.6+j*.3),3-j,1)
                name='arm-'+str(j)+('L' if side<0 else 'R'); c.bone(name,a,b,'body')
                c.tube([a,b,end],[.55,.32,.06],name,0,14)
            for j in range(3):
                p=(side*(.65+j*.5),length+.6,h+1.1)
                c.horn([p,(p[0]*1.4,length-.1,h+2.4),(p[0]*1.6,length-1,h+3.8-j*.5)],.28,'head')
    elif key=='red-buff':
        for side in [-1,1]:
            a=(side*1.5,.1,h+1); b=(side*2.5,-.5,h+2.6)
            c.horn([a,b,(side*2.7,-1.8,h+3.6)],.4,'body',1)
            c.horn([b,(side*3.4,-.1,h+3),(side*3.8,.3,h+3.4)],.22,'body',1)
            for j in range(4): c.oval((side*(1.6-j*.1),.7-j*.55,h+.7),(.16,.28,.12),'body',4,10,6)
    elif key=='blue-buff':
        for j in range(7):
            a=(math.cos(j*TAU/7)*1.2,math.sin(j*TAU/7)*1.2,h+1)
            c.horn([a,(a[0]*1.18,a[1]*1.1,h+2.3),(a[0]*1.2,a[1]*1.15,h+2.8)],.42,'body',4)
    elif beetle:
        for side in [-1,1]:
            c.oval((side*.7,-.2,h+.9),(.94,2.2,.55),'body',1,20,12)
            p=(side*.8,length+1.7,h-.05)
            c.horn([p,(side*1.4,length+2.3,h+.1),(side*.5,length+2.8,h+.3)],.23,'jaw')
    return c.build()

if __name__=='__main__':
    keys=globals().get('ESMO_KEYS',list(PALETTES))
    old=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))['assets'] if (OUT/'manifest.json').exists() else []
    manifest={'version':'esmo-neutrals-rig-v1','up':'+Y','forward':'+Z','assets':[a for a in old if a['id'] not in keys]+[make(k) for k in keys]}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest))
