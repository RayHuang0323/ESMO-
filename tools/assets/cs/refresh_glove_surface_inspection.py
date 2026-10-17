"""重用本任務自己的可變作者預覽；不匯入新場景、不修改使用者 Scene、不存 blend/GLB。"""
import bpy, json, hashlib, os

def refresh_glove_surface_inspection(packet_path, patch_path):
    scene_name='ESMO_CS_GLOVE_INSPECTION_20261011'
    collection_name='ESMO_CS_GLOVE_PATCH_20261011'
    scene=bpy.data.scenes.get(scene_name)
    collection=bpy.data.collections.get(collection_name)
    if not scene or not collection or bpy.context.scene!=scene:
        raise ValueError('僅更新既有本任務私有作者preview，不接管其他場景')
    raw=open(packet_path,'rb').read(); packet=json.loads(raw)
    patch_raw=open(patch_path,'rb').read(); patch=json.loads(patch_raw)
    if patch['version']!='cs-glove-surface-patch.v1' or patch['packetSha256']!=hashlib.sha256(raw).hexdigest():
        raise ValueError('作者稀疏patch與真幀來源不一致')
    if patch['maximumReconstructionErrorMetres']>1e-6:
        raise ValueError('真幀反算超出原守門')
    by_index={o.get('packet_mesh_index'):o for o in collection.objects if o.type=='MESH'}
    if len(by_index)!=len(packet['meshes']):raise ValueError('作者預覽mesh集合與來源不符')
    body=by_index[patch['meshIndex']]
    old_attr=body.data.color_attributes.get('esmo_glove_colors')
    if old_attr and old_attr.domain!='POINT':raise ValueError('手皮色層domain不符')
    if any(mat.users!=1 for mat in body.data.materials):raise ValueError('作者材質被其他物件共享，不修改')
    # 全部前提先驗，避免驗到中途才修改了一半preview。
    for i,row in enumerate(packet['meshes']):
        obj=by_index[i]; mesh=obj.data
        if mesh.users!=1 or len(obj.users_collection)!=1 or obj.users_collection[0]!=collection:
            raise ValueError('作者mesh被其他場景共享，不修改')
        if len(mesh.vertices)!=len(row['positions']) or len(mesh.polygons)*3!=len(row['indices']):
            raise ValueError('作者預覽拓撲改變')
        if [v for p in mesh.polygons for v in p.vertices]!=row['indices']:
            raise ValueError('作者來源索引改變')
        if [a.value for a in mesh.attributes['esmo_source_vertex'].data]!=list(range(len(mesh.vertices))):
            raise ValueError('作者來源vertex ID不完整')
    convert=lambda p:(p[0],-p[2],p[1])
    packet_sha=hashlib.sha256(raw).hexdigest()
    for i,row in enumerate(packet['meshes']):
        obj=by_index[i];obj.data.vertices.foreach_set('co',[v for p in row['positions'] for v in convert(p)])
        obj['packet_sha256']=packet_sha;obj.data.update()
    for i,x,y,z in patch['posedRows']:body.data.vertices[i].co=convert((x,y,z))
    attr=body.data.color_attributes.get('esmo_glove_colors')
    if not attr:attr=body.data.color_attributes.new(name='esmo_glove_colors',type='FLOAT_COLOR',domain='POINT')
    for i,r,g,b in patch['colorRows']:attr.data[i].color=(r,g,b,1)
    for mat in body.data.materials:
        if not mat.use_nodes:continue
        tree=mat.node_tree;bsdf=tree.nodes.get('Principled BSDF')
        if not bsdf:continue
        color=next((n for n in tree.nodes if n.type=='VERTEX_COLOR' and n.layer_name==attr.name),None)
        if not color:color=tree.nodes.new('ShaderNodeVertexColor');color.layer_name=attr.name
        tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
    body.data.update();collection['packet_path']=os.path.abspath(packet_path);collection['packet_sha256']=packet_sha
    collection['patch_sha256']=hashlib.sha256(patch_raw).hexdigest()
    scene['author_preview_status']=patch['status']
    scene['geometry_module_sha256']=patch['geometryModuleSha256']
    return {'status':scene['author_preview_status'],'scene':scene_name,'collection':collection_name,'meshes':len(by_index),'newScenes':0,'newMeshes':0,'packetSha256':packet_sha,'patchSha256':collection['patch_sha256'],'posedRows':len(patch['posedRows']),'colorRows':len(patch['colorRows'])}
