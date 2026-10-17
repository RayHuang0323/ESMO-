"""作者頂點修改回傳：保留來源ID／拓撲，不直接寫產品。"""
import bpy,json,hashlib,math,os

def collect_runtime_edits(packet_path,collection_name,output_path):
    raw=open(packet_path,'rb').read();packet=json.loads(raw);sha=hashlib.sha256(raw).hexdigest()
    collection=bpy.data.collections[collection_name]
    if collection['packet_sha256']!=sha:raise ValueError('作者來源已變')
    edits=[]
    for obj in collection.objects:
        if obj.type!='MESH':continue
        index=obj['packet_mesh_index'];source=packet['meshes'][index]
        if obj['packet_sha256']!=sha or len(obj.data.vertices)!=len(source['positions']):raise ValueError('頂點數或來源不符')
        ids=obj.data.attributes.get('esmo_source_vertex')
        if ids is None or [v.value for v in ids.data]!=list(range(len(source['positions']))):raise ValueError('原頂點順序遺失，不猜映射')
        actual=[v for p in obj.data.polygons for v in p.vertices]
        if actual!=source['indices']:raise ValueError('拓撲已改，不能走稀疏bind位移管線')
        if tuple(obj.location)!=(0,0,0) or tuple(obj.scale)!=(1,1,1) or any(abs(x)>1e-8 for x in obj.rotation_euler):raise ValueError('作者object transform已改，不猜回傳座標')
        rows=[]
        for vertex,p in zip(obj.data.vertices,source['positions']):
            q=[float(vertex.co.x),float(vertex.co.z),-float(vertex.co.y)]
            distance=math.sqrt(sum((q[k]-p[k])**2 for k in range(3)))
            if distance>1e-6:rows.append([vertex.index,*q])
        if rows:
            if source['name']!='ESMO_Major_ContinuousClothing':raise ValueError('目前回寫只支援既有服裝，武器／rig需獨立作者管線')
            edits.append({'meshIndex':index,'meshName':source['name'],'rows':rows})
    result={'version':'cs-runtime-author-edits.v1','status':'AUTHOR_EDITS_NOT_INTEGRATED_NOT_PASS','packetSha256':sha,'edits':edits,'changedVertices':sum(len(e['rows']) for e in edits)}
    if os.path.exists(output_path):raise ValueError('作者修改檔已存在，不覆寫')
    with open(output_path,'x',encoding='utf8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
    return {'status':result['status'],'changedVertices':result['changedVertices'],'file':output_path}
