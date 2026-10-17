from pathlib import Path
p=Path('tools/browser_check_cs_owner4b_ground.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("if(!found.death&&p.dead)found.death=", "if(!found.death&&p.dead&&fs[i-1]?.rnd===f.rnd&&fs[i-1].players.find(a=>a.id===p.id)?.dead)found.death=")
s=s.replace("action:c.currentAction,modelY:","action:c.currentAction,actionTime:c.actions.get(c.currentAction)?.time,actionDuration:c.actions.get(c.currentAction)?.getClip()?.duration,modelY:")
s=s.replace("const a=row.observed;check", "const a=row.observed;if(scenario.kind==='death')check(map+'/death paused seek really reaches settled corpse',a.action==='Death01'&&a.actionTime>=a.actionDuration-.00001,{action:a.action,time:a.actionTime,duration:a.actionDuration});check")
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
