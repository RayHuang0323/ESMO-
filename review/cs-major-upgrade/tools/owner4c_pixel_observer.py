from pathlib import Path
def write(p,s):
 with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
p=Path('tools/browser_measure_cs_major_upgrade.mjs');s=p.read_text(encoding='utf-8')
marker='  let instrumented=0;'
hook="  const worldPointHook=\"\\n    stateRef.current.readonlyWorldPointRayProbe=(xyz)=>{const st=stateRef.current,point=new THREE.Vector3(...xyz),origin=st.camera.position.clone(),delta=point.clone().sub(origin),distance=delta.length(),ray=new THREE.Raycaster(origin,delta.normalize(),0,distance);st.scene.updateMatrixWorld(true);return{distance,hits:ray.intersectObject(st.worldGroup,true).filter(h=>{const m=h.object.material;return !Array.isArray(m)&&m?.visible&&(!m.transparent||m.opacity>.99);}).slice(0,8).map(h=>({name:h.object.name,distance:h.distance,point:h.point.toArray()}))};};\\n\";\n"
assert s.count(marker)==1;s=s.replace(marker,hook+marker).replace('hook+fadeProgramHook+animationPoseHook','hook+fadeProgramHook+animationPoseHook+worldPointHook');write(p,s)
p=Path('tools/browser_check_cs_owner4c_he_pixels.mjs');s=p.read_text(encoding='utf-8');s=s.replace('position:v.toArray(),screen,distance','position:v.toArray(),floor:st.sampleGroundHeight(v.x,v.z),ray:st.readonlyWorldPointRayProbe?.(v.toArray()),screen,distance')
s=s.replace("if(!contact){row.status=", "if(!contact){row.status=")
needle='    const clip={x:Math.round(contact.screen.x-48)'
insert="    check(map+' HE rendered contact above actual surface',contact.position[1]>contact.floor,{position:contact.position,floor:contact.floor});\n    if(!contact.ray)throw new HarnessError('Readonly real occlusion observer missing');\n    if(contact.ray.hits.some(h=>h.distance<contact.distance-.1)){row.status='OPAQUE_OCCLUDED_NOT_COLOR_ACCEPTED';fs.writeFileSync(path.join(out,'he-pixels.json'),JSON.stringify(evidence,null,2));continue;}\n"
assert s.count(needle)==1;s=s.replace(needle,insert+needle)
s=s.replace("scope:'Actual native HE crop; pixels may include background/other meshes, not causally isolated by scene mutation'","scope:'Actual native HE contact center above floor, opaque world ray clear; no scene mutation. Pixels outside center may contain background.'")
write(p,s)
