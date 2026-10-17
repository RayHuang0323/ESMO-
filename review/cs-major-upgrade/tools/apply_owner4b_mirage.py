import json
from pathlib import Path
report=json.loads(Path('review/cs-major-upgrade/evidence/owner4b-he-vfx-audit-20261014/mirage-corner-proposals.json').read_text(encoding='utf-8'))
r=next(r for r in report['rows'] if r['variant']['name']=='topbelt30mm-plus-outline-caps')
p=Path('src/battle/fps/presentation/fpsMajorMapEnvironment.js');s=p.read_text(encoding='utf-8')
for key in ['belt','outerCaps']:
 patch=r['patches'][key];assert s.count(patch['before'])==1;s=s.replace(patch['before'],patch['after'])
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
