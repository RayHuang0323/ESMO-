from pathlib import Path
import json,gzip,base64,hashlib
p=Path('src/battle/fps/presentation/fpsMajorMapEnvironment.js');b=p.read_bytes();s=b.decode('utf-8')
r=json.loads(Path('review/cs-major-upgrade/evidence/owner4b-review-20261014/owner4c-pump-terminal-proposal.json').read_text(encoding='utf-8'))
out=Path('review/cs-major-upgrade/evidence/owner4c-review-20261014/room-port-before.json.gz');assert not out.exists();out.write_bytes(gzip.compress(json.dumps({'path':p.as_posix(),'sha256':hashlib.sha256(b).hexdigest(),'base64':base64.b64encode(b).decode()}).encode()))
changes=r['rows'][1]['changes'];assert len(changes)==12
for old,new in changes:
 assert s.count(old)==1,old
 s=s.replace(old,new)
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
