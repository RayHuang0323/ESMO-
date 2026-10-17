"""袖口周向平順作者候選；原縫根／通風裁口／折厚度保持，不寫產品。"""
import bpy,json,hashlib,math
from mathutils import Vector

def sculpt_cuff_rim(packet_path,collection_name,arm=0,amount=.35,maximum_metres=.002):
    if arm not in (0,1) or not (0<amount<=.5) or not (0<maximum_metres<=.002):
        raise ValueError('只允許局部輕量平順；最大2mm，不放大整體袖形')
    raw=open(packet_path,'rb').read(); packet=json.loads(raw); sha=hashlib.sha256(raw).hexdigest()
    collection=bpy.data.collections[collection_name]
    if collection['packet_sha256']!=sha: raise ValueError('來源不符')
    index=next(i for i,r in enumerate(packet['meshes']) if r['name']=='ESMO_Major_ContinuousClothing')
    source=packet['meshes'][index]; cuff=source['cuff']
    if not cuff or cuff['profileRows']!=10 or cuff['ringPoints']!=14 or abs(cuff['thickness']-.006)>1e-8:
        raise ValueError('不是已驗6mm袖口，拒絕猜profile映射')
    obj=next(o for o in collection.objects if o.type=='MESH' and o['packet_mesh_index']==index)
    convert=lambda p: Vector((p[0],-p[2],p[1]))
    if len(obj.data.vertices)!=len(source['positions']): raise ValueError('頂點數不符')
    if [v for p in obj.data.polygons for v in p.vertices]!=source['indices']: raise ValueError('拓撲不符')
    if max((v.co-convert(p)).length for v,p in zip(obj.data.vertices,source['positions']))>1e-6:
        raise ValueError('已有未記錄修改，不能重複套用')
    ring=cuff['ringPoints'];segments=cuff['radialSegments']; rows=cuff['profileRows']
    base=len(source['positions'])-cuff['addedVertices']+arm*cuff['verticesPerArm']
    original=[v.co.copy() for v in obj.data.vertices]
    point=lambda r,j: original[base+r*ring+j]
    # 所有profile層共用同一周向位移，保持既有外／內層向量；不以獨立縮放改折厚。
    protected=set(range(cuff['ventSegment'],cuff['ventSegment']+cuff['ventSegmentCount']+1))
    shifts={};clamped=0
    for j in range(segments):
        if j in protected: continue
        prev=(j-1)%segments;nxt=(j+1)%segments
        if prev in protected or nxt in protected: continue
        delta=((point(cuff['outerRow'],prev)+point(cuff['outerRow'],nxt))*.5-point(cuff['outerRow'],j))*amount
        if delta.length>maximum_metres: delta=delta.normalized()*maximum_metres;clamped+=1
        if delta.length>1e-7: shifts[j]=delta
    for r in range(1,rows):
        for j,delta in shifts.items():
            obj.data.vertices[base+r*ring+j].co=point(r,j)+delta
            if j==0: obj.data.vertices[base+r*ring+segments].co=point(r,segments)+delta
    obj.data.update()
    difference=lambda a,b:(obj.data.vertices[base+a*ring].co-obj.data.vertices[base+b*ring].co)
    maximum_root=max((obj.data.vertices[base+j].co-original[base+j]).length for j in range(ring))
    maximum_profile=max(((obj.data.vertices[base+r*ring+j].co-obj.data.vertices[base+(r-1)*ring+j].co)-(point(r,j)-point(r-1,j))).length
                        for r in range(2,rows) for j in range(ring))
    duplicate_gap=max((obj.data.vertices[base+a*ring+j].co-obj.data.vertices[base+b*ring+j].co).length
                      for a,b in ((1,2),(3,4),(5,6),(7,8)) for j in range(ring))
    vent_movement=max((obj.data.vertices[base+r*ring+j].co-original[base+r*ring+j]).length for r in range(rows) for j in protected)
    changed=[v.index for v in obj.data.vertices if (v.co-original[v.index]).length>1e-7]
    def bend(points):
        return max((points[(j-1)%segments]-points[j]*2+points[(j+1)%segments]).length for j in shifts)
    before=[point(cuff['outerRow'],j) for j in range(segments)]
    after=[obj.data.vertices[base+cuff['outerRow']*ring+j].co for j in range(segments)]
    if maximum_root>1e-7 or maximum_profile>1e-6 or duplicate_gap>1e-6 or vent_movement>1e-7:
        # fail closed並還原自己這次的作者候選；不處理其他使用者場景。
        for i in changed:obj.data.vertices[i].co=original[i]
        obj.data.update(); raise ValueError('局部作者約束失敗，已還原候選')
    return {'status':'AUTHOR_CUFF_RIM_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS','packetSha256':sha,
            'arm':arm,'amount':amount,'maximumAllowedDeltaMetres':maximum_metres,
            'movedRingPoints':sorted(shifts),'clampedRingPoints':clamped,'changedVertices':len(changed),
            'maximumRootMovementMetres':maximum_root,'maximumVentMovementMetres':vent_movement,
            'maximumProfileDifferenceMetres':maximum_profile,'maximumDuplicateGapMetres':duplicate_gap,
            'circumferentialSecondDifferenceBeforeMetres':bend(before),'circumferentialSecondDifferenceAfterMetres':bend(after),
            'caveat':'周向二階差只是幾何診斷，不是藝術評分。fold內外層保持；縫根到第一profile之間須後續UV／AO／動作驗證，不能直接放行B7。'}
