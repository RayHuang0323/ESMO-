"""Blender MCP可執行同一script；只建立独立作者collection，不清除既有場景。"""
import bpy,json,hashlib,os
from mathutils import Vector

def import_runtime_authoring(packet_path,collection_name='ESMO_CS_RUNTIME_AUTHORING'):
    raw=open(packet_path,'rb').read();packet=json.loads(raw)
    if packet['version']!='cs-runtime-authoring.v1':raise ValueError('不是受支援的runtime作者packet')
    name=collection_name
    if bpy.data.collections.get(name):raise ValueError('作者collection已存在，不重複匯入')
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    collection['packet_path']=os.path.abspath(packet_path);collection['packet_sha256']=hashlib.sha256(raw).hexdigest()
    collection['status']=packet['status']
    convert=lambda p:(p[0],-p[2],p[1])
    objects=[]
    for ordinal,row in enumerate(packet['meshes']):
        mesh=bpy.data.meshes.new('CS_'+row['name']);indices=row['indices']
        mesh.from_pydata([convert(p) for p in row['positions']],[],[indices[i:i+3] for i in range(0,len(indices),3)]);mesh.update()
        obj=bpy.data.objects.new('CS_'+row['name'],mesh);collection.objects.link(obj)
        obj['packet_mesh_index']=ordinal;obj['packet_sha256']=collection['packet_sha256'];obj['inspection_only']=True
        ids=mesh.attributes.new(name='esmo_source_vertex',type='INT',domain='POINT')
        ids.data.foreach_set('value',range(len(row['positions'])))
        for factor in row['materials']:
            mat=bpy.data.materials.new('CS_author_'+factor['name']);mat.diffuse_color=(*factor['color'],1);mat.use_nodes=True
            bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*factor['color'],1)
            bsdf.inputs['Roughness'].default_value=factor['roughness'];bsdf.inputs['Metallic'].default_value=factor['metalness'];mesh.materials.append(mat)
        for group in row['groups']:
            # Three單一material會忽略BoxGeometry的六個group materialIndex。
            index=0 if len(row['materials'])==1 else group['materialIndex']
            if index>=len(row['materials']):raise ValueError('多材料group索引越界')
            for i in range(group['start']//3,(group['start']+group['count'])//3):mesh.polygons[i].material_index=index
        if row['uv']:
            uv=mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                for li in poly.loop_indices:
                    vi=mesh.loops[li].vertex_index;uv.data[li].uv=row['uv'][vi*2:vi*2+2]
        for poly in mesh.polygons:poly.use_smooth=True
        objects.append(obj)
    # 原骨的真世界位置作作者參考；不是替換runtime rig或可直接回傳的骨架。
    arm=bpy.data.armatures.new('CS_RuntimePoseReference');rig=bpy.data.objects.new(arm.name,arm);collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    by_name={r['name']:r for r in packet['bones']};edit={}
    for row in packet['bones']:
        bone=arm.edit_bones.new(row['name']);bone.head=convert(row['position'])
        children=[b for b in packet['bones'] if b['parent']==row['name']]
        bone.tail=convert(children[0]['position']) if children else bone.head+Vector((0,0,.018))
        if (bone.tail-bone.head).length<1e-5:bone.tail=bone.head+Vector((0,0,.018))
        edit[row['name']]=bone
    for row in packet['bones']:
        if row['parent'] in edit:edit[row['name']].parent=edit[row['parent']]
    bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;rig['inspection_only']=True;rig.hide_set(True)
    for obj in bpy.context.selected_objects:obj.select_set(False)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    return {'collection':name,'packet_sha256':collection['packet_sha256'],'objects':len(objects),'bones':len(edit),'status':packet['status']}

if __name__=='__main__':
    import sys
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args)!=1:raise ValueError('用 -- <packet_path> 或 MCP呼叫函式')
    print(json.dumps(import_runtime_authoring(args[0]),ensure_ascii=False))
