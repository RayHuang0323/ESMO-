"""匯出作者檢查GLB，不能作正式rig／動畫素材替換。"""
import bpy,os,json,hashlib,struct,math
from mathutils import Vector

def export_runtime_inspection(packet_path,collection_name,output_path):
    raw=open(packet_path,'rb').read();packet=json.loads(raw);sha=hashlib.sha256(raw).hexdigest()
    collection=bpy.data.collections[collection_name]
    if collection['packet_sha256']!=sha:raise ValueError('作者來源SHA不符')
    output_path=os.path.abspath(output_path)
    if os.path.exists(output_path):raise ValueError('檢查GLB已存在，不覆寫')
    objects=[o for o in collection.objects if o.type=='MESH'];maximum=0;triangles=0
    if len(objects)!=len(packet['meshes']):raise ValueError('作者mesh數與來源不符')
    for obj in objects:
        row=packet['meshes'][obj['packet_mesh_index']]
        if len(obj.data.vertices)!=len(row['positions']):raise ValueError('作者拓撲已改，不冒充無修改快照')
        for vertex,p in zip(obj.data.vertices,row['positions']):
            expected=(p[0],-p[2],p[1]);maximum=max(maximum,math.sqrt(sum((float(vertex.co[k])-expected[k])**2 for k in range(3))))
        triangles+=sum(len(poly.vertices)-2 for poly in obj.data.polygons)
    if maximum>1e-6:raise ValueError('作者頂點已修改，需另外的候選回寫管線，不冒充精確快照')
    for obj in bpy.context.selected_objects:obj.select_set(False)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=output_path,export_format='GLB',use_selection=True,use_active_scene=True,collection=collection_name,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_materials='EXPORT',export_apply=False)
    data=open(output_path,'rb').read()
    if data[:4]!=b'glTF' or struct.unpack_from('<I',data,8)[0]!=len(data):raise ValueError('匯出GLB格式或長度無效')
    header=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    actual_meshes=len(header.get('meshes',[]));actual_scenes=len(header.get('scenes',[]))
    if actual_meshes!=len(objects) or actual_scenes!=1 or header.get('skins') or header.get('animations'):raise ValueError('實際GLB混入其他場景或非檢查幾何，不以選取設定推論PASS')
    report={'status':'INSPECTION_STATIC_POSE_GLB_NOT_PRODUCTION_RIG_NOT_ART_PASS','packetSha256':sha,'glbSha256':hashlib.sha256(data).hexdigest(),'file':output_path,'bytes':len(data),'meshes':actual_meshes,'scenes':actual_scenes,'triangles':triangles,'maximumImportPositionErrorMetres':maximum,'blenderVersion':bpy.app.version_string,'exportSettings':{'format':'GLB','selectionOnly':True,'activeSceneOnly':True,'collection':collection_name,'animations':False,'cameras':False,'lights':False,'extras':True,'materials':'EXPORT','apply':False},'caveat':'原bind／skin／骨姿與來源SHA在packet保存；此GLB只供靜態作者檢查，不含正式rig動畫及runtime shader／貼圖，不整合進產品。'}
    with open(output_path+'.manifest.json','x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    return report
