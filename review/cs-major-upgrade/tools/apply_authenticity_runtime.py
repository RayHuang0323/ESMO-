from pathlib import Path
p=Path('src/battle/fps/EsportsFPS3D.jsx')
s=p.read_text(encoding='utf-8')
def replace(old,new):
    global s
    assert old in s, old[:120]
    s=s.replace(old,new,1)
replace('import { FPS_MAJOR_MAP_ART }', 'import { planFpsBombRoute, chooseFpsContextUtility } from "./fpsBombObjectivePlanning.js";\nimport { FPS_MAJOR_MAP_ART }')
replace('nades=[],boughtWeapon=null;', 'nades=sceneVersion!=="legacy"?[...(e.nades||[])]:[],boughtWeapon=null;\n      const utilityCarried=[...nades],utilityPurchased=[];')
replace('if(money>=NADE.flash&&rand()<0.6)', 'if(sceneVersion==="legacy"&&money>=NADE.flash&&rand()<0.6)')
replace('if(money>=NADE.smoke&&rand()<0.45)', 'if(sceneVersion==="legacy"&&money>=NADE.smoke&&rand()<0.45)')
replace('for(const n of ["flash","smoke","he","molly"]){if(money>=NADE[n]&&rand()<0.7)', 'for(const n of sceneVersion==="legacy"?["flash","smoke","he","molly"]:[]){if(money>=NADE[n]&&rand()<0.7)')
replace('      e.money=money;', '''      if(sceneVersion!=="legacy"){
        // Buy a role's intended kit; retained grenades are not purchased again.
        const kit=buy==="eco"?[]:buy==="pistol"?[c.role==="support"?"smoke":"flash"]:
          c.role==="support"||c.role==="igl"?["smoke","flash","molly"]:c.role==="entry"?["flash","he"]:["he","molly","flash"];
        for(const type of kit)if(!nades.includes(type)&&money>=NADE[type]&&nades.length<4){nades.push(type);utilityPurchased.push(type);money-=NADE[type];}
      }
      e.money=money;''')
replace('const hasBomb=side==="t"&&c.role==="entry";', '''const carrierId=roundRoster.filter(p=>p.side==="t").sort((a,b)=>
        (a.role==="support"?0:a.role==="igl"?1:a.role==="rifler"?2:3)-(b.role==="support"?0:b.role==="igl"?1:b.role==="rifler"?2:3)||String(a.id).localeCompare(String(b.id)))[0]?.id;
      const hasBomb=side==="t"&&(sceneVersion==="legacy"?c.role==="entry":c.id===carrierId);''')
replace('shooting:0,nades,pistol:sp', 'shooting:0,nades,utilityCarried,utilityPurchased,utilityCost:utilityPurchased.reduce((sum,type)=>sum+NADE[type],0),pistol:sp')
a=s.index('      const fake=p.side==='); b=s.index('\n    };',a)
s=s[:a]+'''      return {...plan,...planFpsBombRoute({player:p,players:ps,tactic:phaseTactic,library:routeLibraryBySide[p.side],target,phase,
        selectionId:p.teamId===CS_TEAM_US?preMatchLayout.phases[phase]?.selectionId:null,nodes:N})};'''+s[b:]
replace('purchaseCost:p.purchaseMoney,authority:', 'purchaseCost:p.purchaseMoney,utilityPurchased:[...p.utilityPurchased],utilityCarried:[...p.utilityCarried],utilityCost:p.utilityCost,authority:')
replace('player.nades=player.nades.filter((_,i)=>i!==index);utilityThrownIds.add(player.id);','player.nades=player.nades.filter((_,i)=>i!==index);utilityThrownIds.add(player.id);player.lastUtilityAtSec=sec;')
replace('if(contact){\n          const routeActive=', '''// An entry may stop to fire briefly, but a distant contact cannot freeze
        // the entire execute indefinitely. Retreat/save still use their own route.
        if(contact){if(p._contactId!==contact.id){p._contactId=contact.id;p._contactSinceSec=sec;}}else{p._contactId=null;p._contactSinceSec=null;}
        const stopForContact=contact&&(sceneVersion==="legacy"||dist(p.pos,contact.pos)<12||
          (p.side==="ct"&&!planted)||sec-(p._contactSinceSec??sec)<1);
        if(stopForContact){
          const routeActive=''')
replace('if(p.side==="t"&&!threatNear&&prog>0.4&&!p._pushed', 'if(p.side==="t"&&(sceneVersion==="legacy"?!threatNear&&prog>0.4:!planted&&sec>=26)&&!p._pushed')
replace('p.pos=collideResolve(hp2,walls,PLAYER_R); //', 'if(sceneVersion==="legacy")p.pos=collideResolve(hp2,walls,PLAYER_R); //')
replace('if(p.state==="EXECUTE"&&p.nades?.length>0&&rand()<0.06)', 'if(sceneVersion==="legacy"&&p.state==="EXECUTE"&&p.nades?.length>0&&rand()<0.06)')
a=s.index('        for(const [type,keys] of sec===18?');b=s.index('\n      }',a)
s=s[:a]+'''        for(const player of ps){const utility=chooseFpsContextUtility({player,intel:majorIntel,nodes:N,target,planted,bombPos:c4pos,roundSec:sec});
          if(utility)throwMajorUtility(player,utility.type,utility.to,utility.intent);}
'''+s[b:]
replace('if(!planted&&prog>0.4)', 'if(!planted&&(sceneVersion==="legacy"?prog>0.4:!buyP))')
replace('const canPlant=(ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18);if(canPlant)', '''const safeToPlant=ctNear===0&&carrier.shooting<=0;
            if(sceneVersion!=="legacy")carrier.plantProgressSec=safeToPlant?(carrier.plantProgressSec||0)+C5A2_SIM_STEP_SEC:0;
            const canPlant=sceneVersion==="legacy"?((ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18)):carrier.plantProgressSec>=3;
            if(canPlant)''')
replace('carrierName:carrier.name,score:', 'carrierName:carrier.name,carrierPosition:{...carrier.pos},score:')
replace('if(p&&!p.dead){e.gun=p.gun;', 'if(sceneVersion!=="legacy")e.nades=p&&!p.dead?[...p.nades]:[];\n      if(p&&!p.dead){e.gun=p.gun;')
# Planting is an interruptible stationary action, not a chance roll per snapshot.
replace('if(stopForContact){', 'if(sceneVersion!=="legacy"&&p.hasBomb&&(p.plantProgressSec||0)>0&&!stopForContact){p.state="安裝中";}else if(stopForContact){')
p.write_text(s,encoding='utf-8',newline='\n')
names=Path('src/battle/fps/fpsMapIdentity.js')
t=names.read_text(encoding='utf-8').replace('name:"澄灣水務"','name:"Mirage"').replace('name:"潮汐貨港"','name:"Dust II"').replace('name:"赤脊鑄造"','name:"Inferno"')
names.write_text(t,encoding='utf-8',newline='\n')
