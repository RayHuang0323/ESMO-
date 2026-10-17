from pathlib import Path
p=Path('tools/browser_check_cs_owner4b_ground.mjs');s=p.read_text(encoding='utf-8')
s=s.replace('let minBody=Infinity,minFoot=Infinity,vertices=0,feet=0;', 'const meshRows=[];let minBody=Infinity,minFoot=Infinity,vertices=0,feet=0;')
s=s.replace('const a=mesh.geometry.attributes.position,si=', 'let meshMin=Infinity;const a=mesh.geometry.attributes.position,si=')
s=s.replace('minBody=Math.min(minBody,gap);vertices++;', 'meshMin=Math.min(meshMin,gap);minBody=Math.min(minBody,gap);vertices++;')
s=s.replace('minFoot=Math.min(minFoot,gap);feet++;}}});return', 'minFoot=Math.min(minFoot,gap);feet++;}}meshRows.push({name:mesh.name,gap:meshMin,skinned:mesh.isSkinnedMesh||false,importedWeapon:!!mesh.userData?.esmoMajorImportedWeapon});});return')
s=s.replace('minBody,minFoot,vertices,feet,groundOffset:', 'minBody,minFoot,vertices,feet,meshRows,groundOffset:')
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
