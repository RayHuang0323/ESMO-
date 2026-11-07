import {majorRoomWalls} from './fpsMajorArchitecture.js';

// Original dry-port layout. Navigation, radar, route audit and renderer consume
// these same coordinates; no geometry is inherited from an official CS map.
export const DUNE_TERMINAL_LAYOUT='esmo-dune-terminal.v4.2';
export const DUNE_TERMINAL_SCENE='major.v4';
const rooms=[
 {id:'dune-east-repair',x:63,y:52,w:17,h:18,height:6,label:'東維修室',entryAxis:'y',doorWidth:6,authored:true,compact:true,roof:'shed',fixtures:[{id:'east-equipment',x:68.3,y:58,w:7,h:5,hgt:2.1}]},
 {id:'dune-west-repair',x:20,y:53,w:16,h:18,height:6,label:'西修配室',entryAxis:'y',doorWidth:6,authored:true,compact:true,roof:'shed',fixtures:[{id:'west-equipment',x:24,y:60,w:3,h:4,hgt:2.1}]},
 {id:'dune-customs',x:43,y:44,w:14,h:14,height:6,label:'海關控制室',entryAxis:'y',doorWidth:6,authored:true,compact:true,roof:'clerestory',fixtures:[{id:'customs-counter',x:44.2,y:48,w:1.6,h:4,hgt:1.8}]},
];
const nodes={
 tSpawn:{x:50,y:92},ctSpawn:{x:50,y:8},aSite:{x:81,y:26},bSite:{x:23,y:27},
 eastExit:{x:66,y:87},westExit:{x:34,y:87},midEntry:{x:43,y:76},
 eastStaging:{x:76,y:78},eastLane:{x:88,y:64},eastBend:{x:90.8,y:49},eastApproach:{x:91.5,y:38},aSouthGate:{x:84,y:35},aWestGate:{x:74,y:32},
 eastRoomSouth:{x:72,y:73},eastRoomDoor:{x:72,y:67},eastRoomBend:{x:66,y:66},eastRoomClear:{x:66,y:56},eastRoomExit:{x:72,y:55},eastRoomNorth:{x:72,y:50},eastConnector:{x:64,y:35},
 customSouth:{x:50,y:61},customs:{x:50,y:51},customNorth:{x:50,y:41},
 eastFlankSouth:{x:93,y:78},eastFlankMid:{x:93,y:53},eastFlankNorth:{x:93,y:20},aRear:{x:81,y:14},
 westStaging:{x:17,y:78},westLane:{x:16,y:60},westDogleg:{x:10,y:51},westApproach:{x:16,y:39},bSouthGate:{x:23,y:37},bEastGate:{x:31,y:34},
 westRoomSouth:{x:28,y:74},westRoomDoor:{x:28,y:68},westRoomBend:{x:32,y:66.5},westRoomClear:{x:32,y:57},westRoomExit:{x:28,y:56},westRoomNorth:{x:28,y:50},westConnector:{x:39,y:35},
 westFlankSouth:{x:7,y:78},westFlankMid:{x:7,y:52},westFlankNorth:{x:7,y:18},bGantry:{x:14,y:29},bRear:{x:26,y:14},
 rearJunction:{x:50,y:16},ctEastGate:{x:57.5,y:23},ctWestGate:{x:42.5,y:23},
};
// Existing role/objective names remain aliases to public authored route anchors.
const aliases={mid:nodes.customs,topMid:nodes.customNorth,window:nodes.eastConnector,
 palace:nodes.eastStaging,ramp:nodes.eastLane,aRamp:nodes.aSouthGate,aConn:nodes.aWestGate,
 apps:nodes.westStaging,connector:nodes.bSouthGate,bTunnel:nodes.westDogleg,bDoor:nodes.bSouthGate,bTop:nodes.bEastGate,
 defenseLink:nodes.rearJunction,eastLink:nodes.eastConnector,westLink:nodes.westConnector,
 'room-dune-east-repair':{x:66,y:61},'room-dune-west-repair':{x:32,y:62},'room-dune-customs':nodes.customs};
// Alias lookups serve old role keys; public approach/anchor enumeration must not
// count a single physical doorway multiple times under synonymous keys.
for(const [key,value]of Object.entries(aliases))Object.defineProperty(nodes,key,{value,enumerable:false});
const route=(id,label,site,keys,use,risk,side='t')=>({id,label,site,keys,use,risk,side});
const eastRoom=['eastRoomSouth','eastRoomDoor','eastRoomBend','eastRoomClear','eastRoomExit','eastRoomNorth'];
const westRoom=['westRoomSouth','westRoomDoor','westRoomBend','westRoomClear','westRoomExit','westRoomNorth'];
const mid=['westExit','midEntry','customSouth','customs','customNorth'];
export const DUNE_TERMINAL_ROUTES=[
 route('a-main','A 貨運主線','a',['tSpawn','eastExit','eastStaging','eastLane','eastBend','eastApproach','aSouthGate','aSite'],'分段長線正面推進，和維修室同步。','東側長槍線與南門交叉火力。'),
 route('a-repair','A 維修室協同','a',['tSpawn','eastExit',...eastRoom,'eastConnector','aWestGate','aSite'],'穿雙門維修室清設備近角，由西門支援。','北門出室橫越連接道，必須清角。'),
 route('a-mid','海關接 A 西門','a',['tSpawn',...mid,'eastConnector','aWestGate','aSite'],'控制海關後轉 A，攔截回防。','海關雙門及北出口暴露。'),
 route('a-flank','A 東側外環','a',['tSpawn','eastExit','eastFlankSouth','eastFlankMid','eastFlankNorth','aRear','aSite'],'延遲側擊後勤口，牽制正面守方。','路長且撤回慢，後門仍須清點。'),
 route('b-main','B 貨運折線','b',['tSpawn','westExit','westStaging','westLane','westDogleg','westApproach','bSouthGate','bSite'],'兩段清角的正面推進，適合換槍。','貨櫃轉角及南門架槍。'),
 route('b-repair','B 修配室協同','b',['tSpawn','westExit',...westRoom,'bSouthGate','bSite'],'藉設備遮蔽近點，配合正面進入。','出口空間有限，需錯開隊伍。'),
 route('b-mid','海關接 B 東門','b',['tSpawn',...mid,'westConnector','bEastGate','bSite'],'中路夾 B，也可返回海關轉點。','北連接道會被後勤回防側擊。'),
 route('b-flank','B 西側高廊外繞','b',['tSpawn','westExit','westFlankSouth','westFlankMid','westFlankNorth','bGantry','bSite'],'慢速高位側射，壓迫後門。','坡口與高廊外側無法同時掩護。'),
 route('ct-a-rear','A 後勤回防','a',['ctSpawn','aRear','aSite'],'由點後清反拆位，和西門同步。','後門安包後守槍。','ct'),
 route('ct-a-mid','A 中路回防','a',['ctSpawn','rearJunction','ctEastGate','eastConnector','aWestGate','aSite'],'收回連接道再從西門進場。','海關北口與室內出口的側線。','ct'),
 route('ct-b-rear','B 後勤回防','b',['ctSpawn','bRear','bSite'],'由北方接近貨堆，和東門同步。','北貨堆藏角與高廊側射。','ct'),
 route('ct-b-mid','B 中路回防','b',['ctSpawn','rearJunction','ctWestGate','westConnector','bEastGate','bSite'],'清西連接道後從東門回防。','海關槍線與貨堆交叉火力。','ct'),
 route('rotate-mid','防守中路輪轉',null,['bSite','bEastGate','westConnector','customNorth','eastConnector','aWestGate','aSite'],'較短轉點，海關控制能攔截。','暴露於海關北門。','ct'),
 route('rotate-rear','防守後勤輪轉',null,['bSite','bRear','rearJunction','aRear','aSite'],'較慢後勤轉移，以時間換掩護。','繞側翼可切斷後勤口。','ct'),
];
export const FPS_DUNE_TERMINAL={
 name:'Dune Terminal',layoutId:DUNE_TERMINAL_LAYOUT,floor:'#ad9475',accent:'#d7b982',accent2:'#6e8580',
 walls:[
  {x:1,y:1,w:2,h:98,hgt:6},{x:97,y:1,w:2,h:98,hgt:6},{x:3,y:1,w:94,h:2,hgt:6},{x:3,y:97,w:94,h:2,hgt:6},
  {x:38,y:80,w:24,h:5,hgt:6},{x:45,y:22,w:10,h:5,hgt:6},
  {x:57.5,y:73,w:10.5,h:5,hgt:6},{x:32,y:69,w:7.5,h:5,hgt:6},
  {x:30,y:16,w:10,h:13,hgt:6},{x:60,y:15,w:11,h:14,hgt:6},
  {x:20,y:42,w:18,h:5,hgt:6},{x:74,y:43,w:13.5,h:4,hgt:6},
  {x:20,y:19,w:3,h:3,hgt:3},{x:77,y:20,w:2.5,h:3,hgt:3},
  ...rooms.flatMap(majorRoomWalls),
 ],
 crates:[{x:27,y:38},{x:18,y:32},{x:86,y:28},{x:74,y:23}],props:[],rooms,doors:[],
 sites:{a:nodes.aSite,b:nodes.bSite},spawns:{t:nodes.tSpawn,ct:nodes.ctSpawn},nodes,
 callouts:[
  {x:82,y:25,l:'A 區・裝卸坪',short:'裝卸坪',priority:1},{x:23,y:27,l:'B 區・貨櫃庭院',short:'貨櫃庭院',priority:1},
  {x:50,y:51,l:'中路・海關控制室',short:'海關',priority:1},{x:72,y:62,l:'東維修室',short:'東維修',priority:2},
  {x:28,y:63,l:'西修配室',short:'西修配',priority:2},{x:87,y:66,l:'東貨運道',short:'東貨運',priority:2},
  {x:14,y:61,l:'西貨運道',short:'西貨運',priority:2},{x:14,y:28,l:'西側高廊',short:'高廊',priority:2},
  {x:92,y:55,l:'東側外環',short:'東外環',priority:2},{x:64,y:35,l:'東連接道',short:'東連接',priority:2},
  {x:39,y:35,l:'西連接道',short:'西連接',priority:2},{x:50,y:15,l:'後勤輪轉',short:'後勤',priority:2},
  {x:50,y:92,l:'進攻集結',short:'進攻集結',priority:2},{x:50,y:8,l:'防守勤務場',short:'勤務場',priority:2},
 ],
 tacticalRoutes:DUNE_TERMINAL_ROUTES,radarRoutes:DUNE_TERMINAL_ROUTES.map(r=>r.keys),
 retakeEntries:{a:['aRear','aWestGate','aSouthGate','eastApproach'],b:['bRear','bEastGate','bSouthGate','bGantry']},
 defenseAnchors:{a:['aWestGate','aRear'],b:['bEastGate','bRear']},
};
const keys=id=>DUNE_TERMINAL_ROUTES.find(r=>r.id===id).keys;
export function duneTerminalTactic(tactic,side){
 if(side==='t'){
  const site=tactic?.site==='b'||tactic?.id==='t_bapps'?'b':'a';
  const routes={entry:keys(site+'-main'),support:keys(site+'-repair'),awp:keys(site+'-mid'),igl:keys(site+'-mid'),lurker:keys(site+'-flank')};
  return {...tactic,routes:{...tactic.routes,...routes,rifler:routes.entry}};
 }
 return {...tactic,routes:{...tactic.routes,
  entry:keys('ct-a-rear'),support:keys('ct-b-rear'),awp:['ctSpawn','ctEastGate','eastConnector','aWestGate','aSite'],
  igl:keys('ct-b-mid'),lurker:keys('ct-a-mid'),rifler:keys('ct-b-rear')}};
}
