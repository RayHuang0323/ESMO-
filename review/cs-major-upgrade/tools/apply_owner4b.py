from pathlib import Path
import json,gzip,hashlib
root=Path('.')
files=list(Path('src/battle/fps').rglob('*.js'))+[Path('src/battle/fps/EsportsFPS3D.jsx')]
snapshot=Path('review/cs-major-upgrade/evidence/owner4b-review-20261014/port-before-source.json.gz')
assert not snapshot.exists()
snapshot.write_bytes(gzip.compress(json.dumps({'files':[{'path':p.as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'base64':__import__('base64').b64encode(p.read_bytes()).decode()} for p in files]}).encode()))
def write(p,s):
 with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
p=Path('src/battle/fps/fpsAwarenessSteering.js');s=p.read_text(encoding='utf-8');tail=s[s.index('export function planFpsCoverPeek'):]
write(p,Path('tools/lib/fpsPublicAwarenessLookProposal.mjs').read_text(encoding='utf-8').replace('// Root-port proposal only.','// Major-only public awareness.')+'\n'+tail)
p=Path('src/battle/fps/EsportsFPS3D.jsx');s=p.read_text(encoding='utf-8');old='roundSec:sec,dtSec:C5A2_SIM_STEP_SEC});p.va=p.awareness.va;';assert old in s;s=s.replace(old,'roundSec:sec,dtSec:C5A2_SIM_STEP_SEC,walls,lineBlocked});p.va=p.awareness.va;');write(p,s)
he=Path('tools/lib/fpsHeVfx.proposal.mjs').read_text(encoding='utf-8').replace('HE_VFX_PROPOSAL_CONTRACT','HE_VFX_CONTRACT').replace('esmo-he-vfx.proposal.v1','esmo-he-vfx.v1').replace('createHeVfxProposal','createHeVfx')
write('src/battle/fps/presentation/fpsHeVfx.js',he)
p=Path('src/battle/fps/presentation/fpsUtilityPresentation.js');s=p.read_text(encoding='utf-8');s='import { createHeVfx } from "./fpsHeVfx.js";\n'+s
s=s.replace('  const point = new THREE.Vector3();','  const heVfx = createHeVfx({group,smokeTexture:textures.smoke,reducedMotion});\n  const point = new THREE.Vector3();',1)
s=s.replace('    evidence.heBursts = 0;','    evidence.heVfx = heVfx.update({frame,nextFrame,sub,W});\n    evidence.heBursts = evidence.heVfx.active;',1)
a=s.index('      if (throwable.type === "he" && boom > 0');b=s.index('throwable.type === "flash" && boom > 0',a)
s=s[:a]+'      if ('+s[b:]
for key in ['blast','dust','blastRing','debris']:
 lines=s.splitlines(True);s=''.join(line for line in lines if not line.strip().startswith(key+': createPool('))
s=s.replace('    utilityModels.dispose();','    heVfx.dispose();\n    utilityModels.dispose();');write(p,s)
