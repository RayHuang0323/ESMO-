from pathlib import Path
import json,gzip,base64,hashlib
files=['src/battle/fps/presentation/fpsUtilityPresentation.js','src/battle/fps/presentation/fpsHeVfx.js','src/battle/fps/EsportsFPS3D.jsx']
out=Path('review/cs-major-upgrade/evidence/owner4c-review-20261014/port-vfx-before.json.gz');assert not out.exists();out.write_bytes(gzip.compress(json.dumps({'files':[{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest(),'base64':base64.b64encode(Path(p).read_bytes()).decode()} for p in files]}).encode()))
def write(p,s):
 with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
write('src/battle/fps/presentation/fpsOriginalUtilityTextures.js',Path('tools/lib/fpsOriginalUtilityTextures.proposal.mjs').read_text(encoding='utf-8'))
p=Path(files[1]);s=p.read_text(encoding='utf-8');s='import {createOriginalUtilityTextures} from "./fpsOriginalUtilityTextures.js";\n'+s
s=s.replace('const geometry=new THREE.OctahedronGeometry(1,0),sparkGeometry=', 'const originalTextures=createOriginalUtilityTextures(),sparkGeometry=')
s=s.replace('map:smokeTexture,color:0x6e6256','map:originalTextures.smoke,color:0x6e6256')
s=s.replace("const contact=[new THREE.Mesh(geometry,mat(0xe28b35)),new THREE.Mesh(geometry,mat(0xad5024))];", "const flame=(color)=>{const m=new THREE.SpriteMaterial({map:originalTextures.fire,color,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.NormalBlending});materials.push(m);return m;};\n  const contact=[new THREE.Sprite(flame(0xeab46f)),new THREE.Sprite(flame(0xde8d45))];")
s=s.replace('sub=0,W})','sub=0,W,sampleGroundHeight=()=>0})')
s=s.replace('const x=W.vx(throwable.to.x),z=W.vz(throwable.to.y);','const x=W.vx(throwable.to.x),z=W.vz(throwable.to.y),floor=sampleGroundHeight(x,z);')
s=s.replace('o.position.set(x,.58+i*.10,z);o.scale.set(.28+k*.18,.38+k*.24,.24+k*.16);','o.position.set(x,floor+.58+i*.10,z);o.scale.set(.85+k*.55,.85+k*.55,1);')
s=s.replace(',.52+age*',',floor+.52+age*').replace(',.44+i*.23+',',floor+.44+i*.23+')
s=s.replace('geometry.dispose();sparkGeometry.dispose();','originalTextures.dispose();sparkGeometry.dispose();');write(p,s)
p=Path(files[0]);s=p.read_text(encoding='utf-8');s=s.replace('createUtilityPresentation({ group, textures, sphereGeometry })','createUtilityPresentation({ group, textures, sphereGeometry, sampleGroundHeight=()=>0, major=true })')
s=s.replace('heVfx.update({frame,nextFrame,sub,W})','heVfx.update({frame,nextFrame,sub,W,sampleGroundHeight})')
needle='      if (throwable.type === "flash" && boom > 0';s=s.replace(needle,'      const visualSec=(frame.roundSec||0)+(sameRound?mix*Math.max(0,nextFrame.roundSec-frame.roundSec):0);\n      const flashAge=Number.isFinite(throwable.detonatedAtRoundSec)?visualSec-throwable.detonatedAtRoundSec:Infinity;\n      const flashWorldStrength=major?clamp(1-flashAge/.12,0,1):boom;\n'+needle)
s=s.replace('&& evidence.flashBursts < MAX_FLASH_BURSTS)', '&& flashWorldStrength>0 && evidence.flashBursts < MAX_FLASH_BURSTS)')
s=s.replace('const phase = 1 - boom;','const phase = major?1-flashWorldStrength:1-boom;')
s=s.replace('1.2, throwable.to.y','sampleGroundHeight(W.vx(throwable.to.x),W.vz(throwable.to.y))+1.2, throwable.to.y').replace('1.15, throwable.to.y','sampleGroundHeight(W.vx(throwable.to.x),W.vz(throwable.to.y))+1.15, throwable.to.y')
s=s.replace('const scale = 1.4 + phase * 7.2;','const scale = major?.7+phase*.25:1.4+phase*7.2;').replace('core.scale.setScalar(0.8 + phase * 3.5);','core.scale.setScalar(major?.4+phase*.15:.8+phase*3.5);')
s=s.replace('0.82 * boom','0.82 * flashWorldStrength').replace('0.68 * boom','0.68 * flashWorldStrength')
s=s.replace('      halo.visible = true;','      halo.visible = !major;');write(p,s)
p=Path(files[2]);s=p.read_text(encoding='utf-8');s=s.replace('createUtilityPresentation({group:fxGroup,textures:tex,sphereGeometry:sphereGeo})','createUtilityPresentation({group:fxGroup,textures:tex,sphereGeometry:sphereGeo,sampleGroundHeight:st.sampleGroundHeight,major:sceneVersion!=="legacy"})');write(p,s)
