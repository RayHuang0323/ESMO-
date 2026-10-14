from pathlib import Path
p=Path('tools/browser_check_cs_owner5_utility_motion.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("blasts=after.filter(o=>o.isSprite&&o.material.map===st.tex.glow).slice(0,caps.heBursts*3)","heSlots=after.filter(o=>o.isGroup&&/^fps-he-vfx-slot-/.test(o.name)),blasts=heSlots.map(o=>o.children.find(c=>c.name.startsWith('fps-he-dust-')))")
s=s.replace('blasts.length!==caps.heBursts*3','heSlots.length!==caps.heBursts||heSlots.some(o=>o.children.length!==11)')
s=s.replace('shape(blasts[heRank*3])','shape(blasts[heRank])')
s=s.replace("heBlastSprites:blasts.length","heSlots:heSlots.length,heVisibleLeaves:heSlots.flatMap(o=>o.children).filter(o=>o.visible).length")
s=s.replace("binding:'C5B.2 named Groups and actual texture segments'","binding:'C5B.2 utility roots and named bounded warm HE slots; actual texture smoke/flash segments'")
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
