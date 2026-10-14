from pathlib import Path
p=Path('src/battle/fps/fpsMapIdentity.js')
s=p.read_text(encoding='utf-8')
for old,new in [('澄灣水務','Mirage'),('潮汐貨港','Dust II'),('赤脊鑄造','Inferno')]:
    s=s.replace('name: "'+old+'"','name: "'+new+'"')
p.write_text(s,encoding='utf-8',newline='\n')
