"""同一私有手套場景的必要CPU近檢；不改共享作者相機、不複製模型。"""
import bpy, json, os, hashlib
from mathutils import Vector

def inspect_left_glove_close(output_path):
    scene=bpy.context.scene
    if scene.name!='ESMO_CS_GLOVE_INSPECTION_20261011':raise ValueError('不是本任務私有場景')
    collection=bpy.data.collections['ESMO_CS_GLOVE_PATCH_20261011']
    packet=json.load(open(collection['packet_path'],encoding='utf8'));row=packet['meshes'][2]
    body=next(o for o in collection.objects if o.get('packet_mesh_index')==2)
    points=[]
    for i in range(len(row['positions'])):
        indices=row['skinIndex'][i*4:i*4+4];weights=row['skinWeight'][i*4:i*4+4]
        influence=sum(w for j,w in zip(indices,weights) if row['boneNames'][j].endswith('_l') and row['boneNames'][j].split('_')[0] in ['hand','index','middle','ring','pinky','thumb'])
        if influence>.7:points.append(body.matrix_world@body.data.vertices[i].co)
    if len(points)<500:raise ValueError('真左手樣本不足')
    lo=Vector(tuple(min(v[k] for v in points) for k in range(3)));hi=Vector(tuple(max(v[k] for v in points) for k in range(3)));target=(lo+hi)/2
    report_path=os.path.splitext(output_path)[0]+'.json'
    if os.path.exists(output_path) or os.path.exists(report_path):raise ValueError('不覆寫作者結果')
    name='CS_GLOVE_CLOSE_AUTHOR_CAMERA_20261011';camera=bpy.data.objects.get(name);created=0
    if camera is None:
        camera=bpy.data.objects.new(name,bpy.data.cameras.new(name));scene.collection.objects.link(camera);created=1
    if camera.type!='CAMERA' or camera.data.users!=1 or len(camera.users_scene)!=1 or camera.users_scene[0]!=scene:raise ValueError('近檢相機共享，不修改')
    old=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath,scene.render.engine,scene.render.threads_mode,scene.render.threads,scene.cycles.device,scene.cycles.samples)
    try:
        camera.location=target+Vector((-.25,.30,.12));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=55;scene.camera=camera
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=2
        scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.render.filepath=output_path
        bpy.ops.render.render(write_still=True)
        raw=open(output_path,'rb').read()
        report={'status':'PRIVATE_PHALANGES_CPU_AUTHOR_CLOSEUP_NOT_PRODUCT_SHADER_GPU_OR_ART_PASS','png':output_path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'patchSha256':collection['patch_sha256'],'leftHandVertices':len(points),'bounds':[list(lo),list(hi)],'newScene':0,'newMesh':0,'newPacket':0,'newGlb':0,'newReusableCamera':created,'device':'CPU','samples':8,'threads':2,'sharedCameraUntouched':True,'sceneSettingsRestored':True}
    finally:
        scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath,scene.render.engine,scene.render.threads_mode,scene.render.threads,scene.cycles.device,scene.cycles.samples=old
    with open(report_path,'x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    return report
