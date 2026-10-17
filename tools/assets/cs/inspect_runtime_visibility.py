"""只讀真作者幾何的遮擋診斷；可重跑，不改角色／姿勢／產品相機。"""
import json,math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def inspect_runtime_visibility(packet_path,collection_name='ESMO_CS_RUNTIME_ACCESSOR',side='r'):
    packet=json.load(open(packet_path,encoding='utf8'));collection=bpy.data.collections[collection_name]
    convert=lambda p:Vector((p[0],-p[2],p[1]))
    row=next(r for r in packet['meshes'] if r['name']=='ESMO_Major_ContinuousClothing')
    targets=[]
    names=row['boneNames'];bone_map={b['name']:convert(b['position']) for b in packet['bones']}
    for i,p in enumerate(row['positions']):
        right=sum(row['skinWeight'][i*4+j] for j in range(4) if names[int(row['skinIndex'][i*4+j])].endswith('_'+side) and names[int(row['skinIndex'][i*4+j])].split('_')[0] in ['hand','index','thumb','middle','ring','pinky'])
        if right>.7 and (convert(p)-bone_map['hand_'+side]).length<.20:targets.append((i,convert(p)))
    if len(targets)<20:raise ValueError('缺真扳機手蒙皮樣本，不猜')
    # 均勻頂點序抽樣；只作觀察方向診斷，不作掌面接觸或藝術PASS。
    samples=targets[::max(1,len(targets)//100)]
    vertices=[];faces=[];owners=[]
    for obj in collection.objects:
        if obj.type!='MESH' or obj.hide_get():continue
        offset=len(vertices);vertices.extend([obj.matrix_world@v.co for v in obj.data.vertices])
        faces.extend([tuple(offset+i for i in poly.vertices) for poly in obj.data.polygons])
        owners.extend([obj.name for poly in obj.data.polygons])
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
    center=sum((p for _,p in samples),Vector())/len(samples);ranked=[]
    for elevation in [-20,0,20,40,60]:
        el=math.radians(elevation)
        for azimuth in range(0,360,15):
            az=math.radians(azimuth);direction=Vector((math.sin(az)*math.cos(el),math.cos(az)*math.cos(el),math.sin(el)))
            eye=center+direction*1.2;visible=[];blockers={};nearest_gap=None
            for i,target in samples:
                ray=target-eye;distance=ray.length
                hit,normal,face,dist=tree.ray_cast(eye,ray.normalized(),distance+.004)
                if hit is not None and (hit-target).length<.004:visible.append(i)
                elif hit is not None:
                    key=owners[face];blockers[key]=blockers.get(key,0)+1
                    gap=(hit-target).length;nearest_gap=gap if nearest_gap is None else min(nearest_gap,gap)
            ranked.append({'azimuth':azimuth,'elevation':elevation,'visibleSamples':len(visible),'totalSamples':len(samples),'eye':list(eye),'direction':list(direction),'blockedBy':blockers,'minimumBlockedGapMetres':nearest_gap})
    ranked.sort(key=lambda r:r['visibleSamples'],reverse=True)
    nearest=[tree.find_nearest(p)[3] for _,p in samples]
    return {'status':'AUTHOR_FIXTURE_VISIBILITY_DIAGNOSIS_NOT_BROWSER_PASS','side':side,'collection':collection_name,'center':list(center),'handVertices':len(targets),'targetMaxNearestSurfaceMetres':max(nearest),'testedViews':len(ranked),'maximumVisibleSamples':ranked[0]['visibleSamples'],'topViews':ranked[:6],'caveat':'4mm端點近接只找可觀察方向，不能證明握把接觸、穿模消除或掌面藝術。作者fixture不是browser保存frame。'}
