import {majorRoomWalls} from './fpsMajorArchitecture.js';

// 原創鑄造工廠；導航、實體、雷達及路線圖共用本資料。
export const FOUNDRY_CIRCUIT_LAYOUT='esmo-foundry-circuit.v5.2';
export const FOUNDRY_CIRCUIT_SCENE='major.v5';
const rooms=[
 {id:'foundry-control',label:'中路・機控室',x:42,y:44,w:20,h:22,roof:'clerestory',fixtures:[{id:'control-machine',x:45.5,y:49,w:7.5,h:10,hgt:2.5}]},
 {id:'foundry-feed',label:'送料工房',x:75,y:60,w:17,h:16,roof:'shed',fixtures:[{id:'feed-machine',x:78.5,y:65,w:6,h:5.5,hgt:2.4}]},
 {id:'foundry-cast',label:'下沉澆鑄廊',x:59,y:59,w:10,h:18,roof:'vault',fixtures:[{id:'cast-channel',x:60.5,y:64,w:1.5,h:7,hgt:2.2}]},
 {id:'foundry-maint',label:'維修工房',x:15,y:60,w:18,h:16,roof:'shed',fixtures:[{id:'maint-machine',x:18,y:65,w:7,h:5,hgt:2.3}]},
 {id:'foundry-high',label:'西側高廊',x:9,y:34,w:11,h:20,roof:'shed',fixtures:[{id:'high-machine',x:10.6,y:39,w:1.6,h:7,hgt:2.1}]},
].map(r=>({...r,entryAxis:'y',doorWidth:6,height:6,authored:true,compact:true,smokeRoof:true}));
const raw={
 tSpawn:[50,91],ctSpawn:[50,10],aSite:[80,43],bSite:[24,34],eastExit:[65,85],westExit:[34,86],midTurn:[36,74],controlSouth:[52,69],controlDoorS:[52,63],controlBendS:[56,61],controlBendN:[56,47],controlDoorN:[52,47],controlNorth:[52,41],midEast:[65,41],midWest:[37,42],aWestGate:[71,43],aLowerGate:[72,48],castSouth:[64,80],castDoorS:[64,74],castCore:[65,67],castDoorN:[64,62],castNorth:[64,56],castExit:[70,56],feedSouth:[83.5,79],feedDoorS:[83.5,73],feedBendS:[87.5,73],feedBendN:[87.5,63],feedDoorN:[83.5,63],feedNorth:[83.5,57],aFeedGate:[86,53],aSouthGate:[84,49],eastFlankSouth:[94,83],eastFlankMid:[94,55],eastFlankNorth:[94,29],aRear:[80,30],aRearBend:[87,33],aNorthGate:[87,43],maintSouth:[24,79],maintDoorS:[24,73],maintBendS:[29,73],maintBendN:[29,63],maintDoorN:[24,63],maintNorth:[24,57],bMainGate:[24,44],bEastGate:[32,37],westOuterSouth:[10,80],westOuterMid:[10,57],highSouth:[14.5,57],highDoorS:[14.5,51],highCore:[14.5,43],highDoorN:[14.5,37],highNorth:[14.5,31],bHighGate:[22,29],bNorthGate:[22,34],westFlank:[5.5,57],westFlankNorth:[5.5,26],bRear:[21,24],ctWestOuter:[20,13],ctEastOuter:[80,13],ctRearJunction:[50,13],ctInnerWest:[36,14],ctWestGate:[36,35],ctInnerEast:[61,14],ctEastGate:[61,34],westService:[37,52],controlWestSouth:[38,70],
};
const nodes=Object.fromEntries(Object.entries(raw).map(([k,[x,y]])=>[k,{x,y}]));
// 中路西側服務縫需要實體折角；避免出出生擋板後立即看穿整張圖。
nodes.westService={x:37,y:48};
Object.assign(nodes,{controlWestBaffleNorth:{x:29.5,y:49},controlWestBaffleWest:{x:29.5,y:57},controlWestBaffleSouth:{x:38,y:57}});
nodes.midEast={x:65,y:42.5};
nodes.aLowerGate={x:69.5,y:48};
Object.assign(nodes,{ctEastBaffleNorth:{x:69,y:34},ctEastBaffleSouth:{x:69,y:42.5}});
// 舊角色名稱只作相容查詢；真正戰術輸出一律使用上列可列舉節點。
const aliases={mid:'controlBendN',topMid:'controlNorth',window:'midEast',arch:'midEast',library:'ctEastGate',aConn:'aWestGate',bTop:'bEastGate',tRamp:'eastExit',banana:'maintSouth',car:'bMainGate',apps:'feedSouth',boiler:'feedNorth',sewer:'castCore',connector:'controlNorth',palace:'feedSouth',ramp:'aSouthGate',aRamp:'aSouthGate',bDoor:'bMainGate',bTunnel:'highSouth',defenseLink:'ctRearJunction'};
for(const [k,target]of Object.entries(aliases))Object.defineProperty(nodes,k,{value:nodes[target],enumerable:false});
for(const room of rooms)Object.defineProperty(nodes,'room-'+room.id,{value:nodes[room.id==='foundry-control'?'controlBendS':room.id==='foundry-feed'?'feedBendN':room.id==='foundry-cast'?'castCore':room.id==='foundry-maint'?'maintBendN':'highCore'],enumerable:false});
const route=(id,label,site,keys,use,risk,side='t')=>({id,label,site,keys,use,risk,side});
const mid=['westExit','midTurn','controlSouth','controlDoorS','controlBendS','controlBendN','controlDoorN','controlNorth'];
const feed=['feedSouth','feedDoorS','feedBendS','feedBendN','feedDoorN','feedNorth'];
const cast=['castSouth','castDoorS','castCore','castDoorN','castNorth','castExit'];
const maint=['maintSouth','maintDoorS','maintBendS','maintBendN','maintDoorN','maintNorth'];
const high=['highSouth','highDoorS','highCore','highDoorN','highNorth'];
export const FOUNDRY_CIRCUIT_ROUTES=[
 route('a-feed','A 送料工房','a',['tSpawn','eastExit',...feed,'aFeedGate','aSouthGate','aSite'],'由工房掩護接近南入口，適合雙人換槍。','設備迫使折線清角，北門受側射。'),
 route('a-casting','A 下沉澆鑄廊','a',['tSpawn','eastExit',...cast,'aLowerGate','aWestGate','aSite'],'低位室內接近西南口，與送料線同步。','出口爬坡受點內交叉火力。'),
 route('a-mid','機控室夾 A','a',['tSpawn',...mid,'midEast','aWestGate','aSite'],'先爭中路，切斷 A 中路回防。','長工房雙門與東側橫越暴露。'),
 route('a-flank','A 東側外環','a',['tSpawn','eastExit','eastFlankSouth','eastFlankMid','eastFlankNorth','aRear','aRearBend','aNorthGate','aSite'],'最長延遲側擊，威脅 CT 後門。','繞行成本高，需清後門機台折角。'),
 route('b-maint','B 維修工房','b',['tSpawn','westExit',...maint,'bMainGate','bSite'],'沿雙門設備房推進 B 南口。','房內折角與出門長線，宜協同煙霧。'),
 route('b-high','B 西側高廊','b',['tSpawn','westExit','westOuterSouth','westOuterMid',...high,'bHighGate','bNorthGate','bSite'],'室內高位壓迫庭院，再下坡入點。','進廊與下坡無法同時受掩護。'),
 route('b-mid','機控室夾 B','b',['tSpawn',...mid,'midWest','bEastGate','bSite'],'中路轉西入口，和工房夾攻。','北連接道可能被 CT 中線攔截。'),
 route('b-flank','B 西側維護外環','b',['tSpawn','westExit','westOuterSouth','westOuterMid','westFlank','westFlankNorth','bRear','bHighGate','bNorthGate','bSite'],'慢速迂迴高廊背後，切斷後勤。','外牆狹線與北折角，回撤較慢。'),
 route('ct-a-rear','A 後門回防','a',['ctSpawn','ctEastOuter','aRear','aRearBend','aNorthGate','aSite'],'後勤繞到機台東側，與西門交叉入點。','後門必清近角，不可隔機台假架槍。','ct'),
 route('ct-a-mid','A 中路回防','a',['ctSpawn','ctInnerEast','ctEastGate','ctEastBaffleNorth','ctEastBaffleSouth','midEast','aWestGate','aSite'],'較短路線收復西入口。','受機控室與下沉廊側線威脅。','ct'),
 route('ct-b-rear','B 後勤回防','b',['ctSpawn','ctWestOuter','bRear','bHighGate','bNorthGate','bSite'],'北後勤與高廊同步清庭院。','高廊下坡反拆槍線。','ct'),
 route('ct-b-mid','B 中路回防','b',['ctSpawn','ctInnerWest','ctWestGate','bEastGate','bSite'],'東入口快速接近 C4。','機控室橫射與鑄件近角。','ct'),
 route('rotate-inner','防守內環輪轉',null,['bSite','bEastGate','midWest','controlNorth','midEast','aWestGate','aSite'],'最短轉點，以暴露換時間。','機控室北門直接制約輪轉。','ct'),
 route('rotate-rear','防守後勤輪轉',null,['bSite','bNorthGate','bHighGate','bRear','ctWestOuter','ctRearJunction','ctEastOuter','aRear','aRearBend','aNorthGate','aSite'],'較安全長繞，避免中路控制。','外環側翼可切斷後勤。','ct'),
 route('rotate-control','防守機控室輪轉',null,['bSite','bEastGate','westService','controlWestBaffleNorth','controlWestBaffleWest','controlWestBaffleSouth','controlWestSouth','controlSouth','controlDoorS','controlBendS','controlBendN','controlDoorN','controlNorth','midEast','aWestGate','aSite'],'奪回室內再轉點，同時清後排。','繞行時間長且需逐角清設備。','ct'),
 route('ct-b-counterflank','B 高廊反側翼','b',['ctSpawn','ctWestOuter','bRear','bHighGate','highNorth','highDoorN','highCore','highDoorS','highSouth','maintNorth','bMainGate','bSite'],'反向清高廊，再從南口回防。','時間成本最大，不能每次拆彈都繞。','ct'),
];
export const FPS_FOUNDRY_CIRCUIT={
 name:'Foundry Circuit',layoutId:FOUNDRY_CIRCUIT_LAYOUT,floor:'#8f9891',accent:'#d5b46e',accent2:'#638c89',
 walls:[
  {x:1,y:1,w:2,h:98,hgt:6},{x:97,y:1,w:2,h:98,hgt:6},{x:3,y:1,w:94,h:2,hgt:6},{x:3,y:97,w:94,h:2,hgt:6},
  {x:39,y:76,w:22,h:4,hgt:6},{x:42,y:17,w:16,h:4,hgt:6},
  {x:25,y:15,w:9,h:17,hgt:6},{x:64,y:17,w:10,h:15,hgt:6},
  {x:42,y:29,w:14,h:8,hgt:6},
  {x:32,y:51,w:8.5,h:3,hgt:6},
  {x:58.5,y:37,w:8,h:3,hgt:6},
  {x:72,y:46,w:4.5,h:7,hgt:6},
  {x:76,y:37,w:8,h:3,hgt:3.2},{x:27.5,y:29,w:6,h:3,hgt:3.2},
  ...rooms.flatMap(majorRoomWalls),
 ],
 crates:[{x:74,y:56},{x:90,y:47},{x:29,y:45}],props:[],rooms,doors:[],nodes,
 sites:{a:nodes.aSite,b:nodes.bSite},spawns:{t:nodes.tSpawn,ct:nodes.ctSpawn},
 plantZones:{a:{x:77,y:41,w:9,h:8,maxGroundDelta:.6},b:{x:23,y:33,w:6,h:7,maxGroundDelta:.6}},
 callouts:[
  {x:80,y:44,l:'A 區・調節工位',short:'調節工位',priority:1},{x:24,y:34,l:'B 區・鑄件庭院',short:'鑄件庭院',priority:1},
  {x:52,y:54,l:'中路・機控室',short:'機控室',priority:1},{x:84,y:68,l:'送料工房',short:'送料',priority:2},
  {x:65,y:68,l:'下沉澆鑄廊',short:'澆鑄廊',priority:2},{x:24,y:68,l:'維修工房',short:'維修',priority:2},
  {x:14.5,y:43,l:'西側高廊',short:'高廊',priority:2},{x:94,y:57,l:'東側外環',short:'東外環',priority:2},
  {x:5.5,y:45,l:'西側維護道',short:'維護道',priority:2},{x:65,y:41,l:'東連接道',short:'東連接',priority:2},
  {x:37,y:42,l:'西連接道',short:'西連接',priority:2},{x:50,y:13,l:'後勤輪轉',short:'後勤',priority:2},
  {x:50,y:91,l:'進攻集結',short:'進攻集結',priority:2},{x:50,y:9,l:'防守勤務場',short:'勤務場',priority:2},
 ],
 tacticalRoutes:FOUNDRY_CIRCUIT_ROUTES,radarRoutes:FOUNDRY_CIRCUIT_ROUTES.map(r=>r.keys),
 retakeEntries:{a:['aWestGate','aLowerGate','aNorthGate','aSouthGate'],b:['bEastGate','bMainGate','bHighGate']},
 defenseAnchors:{a:['aWestGate','aNorthGate'],b:['bEastGate','bHighGate']},
};
const keys=id=>FOUNDRY_CIRCUIT_ROUTES.find(r=>r.id===id).keys;
export function foundryCircuitTactic(tactic,side){
 if(side==='t'){
  const site=tactic?.site==='b'||tactic?.id==='t_bapps'?'b':'a';
  const routes={entry:keys(site==='a'?'a-feed':'b-maint'),support:keys(site==='a'?'a-casting':'b-high'),awp:keys(site+'-mid'),igl:keys(site+'-mid'),lurker:keys(site+'-flank')};
  return {...tactic,routes:{...tactic?.routes,...routes,rifler:routes.entry}};
 }
 const bInformation=tactic?.type==='aggro'&&tactic?.site==='b';
 return {...tactic,routes:{...tactic?.routes,entry:keys('ct-a-rear'),support:keys('ct-b-rear'),awp:keys(bInformation?'ct-b-counterflank':'ct-a-mid'),igl:keys('ct-b-mid'),lurker:keys('ct-b-counterflank'),rifler:keys('ct-b-rear')}};
}
