from pathlib import Path
p=Path('src/battle/fps/EsportsFPS3D.jsx')
s=p.read_text(encoding='utf-8')
patch=Path('review/cs-major-upgrade/evidence/retention-policy-20261011/authenticity-owner234-main-20261012.patch').read_text(encoding='utf-8')
for hunk in patch.split('\n@@\n')[1:]:
    lines=hunk.splitlines()
    old='\n'.join(line[1:] for line in lines if line.startswith('-'))
    new='\n'.join(line[1:] for line in lines if line.startswith('+'))
    assert old and s.count(old)==1, repr(old)
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8',newline='\n')
