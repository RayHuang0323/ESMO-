"""作者手皮遮擋分層；不改資產，不把fixture診斷當Browser或藝術驗收。"""
import bpy, json, math, hashlib
from collections import Counter
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def inspect_hand_occlusion(packet_path, collection_name, side='r'):
    if side not in ('r','l'): raise ValueError('手側只允許r/l')
    raw=open(packet_path,'rb').read(); packet=json.loads(raw)
    collection=bpy.data.collections[collection_name]
    sha=hashlib.sha256(raw).hexdigest()
    if collection['packet_sha256']!=sha: raise ValueError('作者collection來源不符')
    convert=lambda p: Vector((p[0],-p[2],p[1]))
    body_index=next(i for i,r in enumerate(packet['meshes']) if r['name']=='ESMO_Major_ContinuousClothing')
    body=packet['meshes'][body_index]
    hand=convert(next(b['position'] for b in packet['bones'] if b['name']=='hand_'+side))
    names=body['boneNames']
    def skin_label(row, ids):
        weights=Counter()
        for i in ids:
            for j in range(4):
                w=row['skinWeight'][i*4+j]
                if w: weights[row['boneNames'][int(row['skinIndex'][i*4+j])]]+=w/len(ids)
        return weights.most_common(1)[0][0] if weights else 'rigid'
    targets=[]; vertices=[]; faces=[]; labels=[]
    for obj in collection.objects:
        if obj.type!='MESH' or obj.hide_get(): continue
        index=obj['packet_mesh_index']; row=packet['meshes'][index]
        if obj['packet_sha256']!=sha: raise ValueError('mesh來源不符')
        points=[obj.matrix_world@v.co for v in obj.data.vertices]
        if len(points)!=len(row['positions']): raise ValueError('頂點數不符')
        if index==body_index:
            for i,p in enumerate(points):
                weight=sum(row['skinWeight'][i*4+j] for j in range(4)
                           if names[int(row['skinIndex'][i*4+j])].endswith('_'+side)
                           and names[int(row['skinIndex'][i*4+j])].split('_')[0] in ('hand','index','thumb','middle','ring','pinky'))
                if weight>.7 and (p-hand).length<.20: targets.append((i,p,skin_label(row,[i])))
        offset=len(vertices); vertices.extend(points)
        for poly in obj.data.polygons:
            faces.append(tuple(offset+i for i in poly.vertices))
            labels.append({'mesh':row['name'],'bone':skin_label(row,list(poly.vertices)) if row['skinWeight'] else 'rigid','material':poly.material_index})
    if len(targets)<20: raise ValueError('缺真手皮樣本')
    samples=targets[::max(1,len(targets)//100)]
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
    center=sum((p for _,p,_ in samples),Vector())/len(samples)
    blocked=Counter(); gaps={}; best=[]
    for elevation in (-20,0,20,40,60):
        el=math.radians(elevation)
        for azimuth in range(0,360,15):
            az=math.radians(azimuth); eye=center+Vector((math.sin(az)*math.cos(el),math.cos(az)*math.cos(el),math.sin(el)))*1.2
            visible=Counter(); blockers=Counter()
            for i,target,bone in samples:
                ray=target-eye
                hit,normal,face,dist=tree.ray_cast(eye,ray.normalized(),ray.length+.004)
                if hit is not None and (hit-target).length<.004: visible[bone]+=1
                elif hit is not None:
                    label=labels[face]; key=f"{label['mesh']}|{label['bone']}|material{label['material']}"
                    blockers[key]+=1; blocked[key]+=1
                    gaps.setdefault(key,[]).append((hit-target).length)
            best.append({'azimuth':azimuth,'elevation':elevation,'visibleSamples':sum(visible.values()),'visibleByTargetBone':dict(visible),'blockers':dict(blockers)})
    best.sort(key=lambda r:r['visibleSamples'],reverse=True)
    return {'status':'AUTHOR_HAND_OCCLUSION_LAYERS_NOT_PRODUCT_FAIL_NOT_ART_PASS',
            'packetSha256':sha,'collection':collection_name,'side':side,'testedViews':120,
            'handVertices':len(targets),'sampleCount':len(samples),
            'sampleBones':dict(Counter(b for _,_,b in samples)),
            'firstBlockers':[{'surface':k,'rays':n,'minimumGapMetres':min(gaps[k]),'maximumGapMetres':max(gaps[k])} for k,n in blocked.most_common()],
            'topViews':best[:3],
            'caveat':'mesh/bone/material是首個遮擋三角形的來源標籤；射線點不是掌面，4mm近接不是接觸或穿模判定。fixture不代替真Browser保存幀。'}
