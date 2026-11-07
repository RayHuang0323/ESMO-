import {majorRoomWalls} from './fpsMajorArchitecture.js';

// ESMO original confluence station. Versioned separately: never substitute this
// layout while rendering major.v1 or legacy frames. Coordinates are the same
// public truth for navigation, LOS, environment and the tactical radar.
const rooms=[
 {id:'v2-west-service',x:33,y:46,w:10,h:18,height:7,label:'西側檢修廊',roof:'vault',entryAxis:'y',doorWidth:5.6,authored:true,compact:true,processKind:'pump-hall',fixtures:[{id:'v2-west-service-bank',x:33.8,y:51,w:1.5,h:4,hgt:2.6,form:'pump-bank',asset:'factory-kit/machine-fortified',rotation:Math.PI/2}]},
 {id:'v2-east-pump',x:59,y:47,w:10,h:17,height:7,label:'東側泵房',roof:'clerestory',entryAxis:'x',doorWidth:5.6,authored:true,compact:true,processKind:'pump-hall',fixtures:[{id:'v2-east-pump-bank',x:59.8,y:48.2,w:4,h:1.5,hgt:2.6,form:'pump-bank',asset:'factory-kit/machine-fortified'}]},
];
export const FPS_ORIGINAL_CONFLUENCE_V2={
 name:'匯流站 · 戰術原型',layoutId:'esmo-confluence.v2.4',floor:'#89918b',accent:'#d5c6ab',accent2:'#688d8b',
 walls:[
  {x:2,y:2,w:5,h:96,hgt:6},{x:93,y:2,w:5,h:96,hgt:6},
  {x:7,y:2,w:86,h:5,hgt:6},{x:7,y:95,w:86,h:3,hgt:5},
  {x:34,y:78,w:32,h:5,hgt:5},
  ...rooms.flatMap(majorRoomWalls),
  {x:31,y:29,w:12,h:10,hgt:6},{x:61,y:29,w:11,h:10,hgt:6},
  {x:47,y:48,w:6,h:5,hgt:5},
  {x:21,y:55,w:5,h:5,hgt:4.5},{x:77,y:55,w:5,h:5,hgt:4.5},
  {x:7,y:45,w:8,h:5,hgt:5},{x:84,y:48,w:9,h:6,hgt:5},
  {x:10,y:12,w:7,h:16,hgt:7},{x:85,y:10,w:8,h:20,hgt:7},
  {x:39,y:14,w:8,h:8,hgt:6},{x:57,y:14,w:8,h:8,hgt:6},
 ],
 crates:[{x:20,y:33},{x:33,y:23},{x:72,y:34},{x:83,y:23},{x:21,y:58},{x:78,y:59},{x:48,y:69},{x:55,y:34}],
 props:[{t:'barrel',x:18,y:38},{t:'barrel',x:87,y:39},{t:'sandbag',x:51,y:29,a:0}],
 rooms,doors:[],
 sites:{a:{x:78,y:24},b:{x:26,y:26}},spawns:{t:{x:50,y:90},ct:{x:50,y:10}},
 nodes:{tSpawn:{x:50,y:90},ctSpawn:{x:50,y:10},palace:{x:79,y:75},ramp:{x:79,y:63},aRamp:{x:79,y:40},aSite:{x:78,y:24},
  apps:{x:23,y:65},connector:{x:25,y:43},bSite:{x:26,y:26},mid:{x:50,y:59},topMid:{x:50,y:39},window:{x:57,y:28},
  westLink:{x:27,y:41},eastLink:{x:77,y:41},defenseLink:{x:51,y:25},
  serviceSouth:{x:38,y:68},serviceNorth:{x:38,y:42},pumpSouth:{x:56,y:55.5},pumpNorth:{x:72,y:55.5},
  'room-v2-west-service':{x:38,y:55},'room-v2-east-pump':{x:64,y:55.5}},
 callouts:[{x:78,y:24,l:'A區 · 調壓庭院',priority:1},{x:26,y:26,l:'B區 · 濾池庭院',priority:1},
  {x:50,y:59,l:'中路 · 匯流中庭',priority:1},{x:23,y:65,l:'西側主通道',priority:2},{x:79,y:63,l:'東側主通道',priority:2},
  {x:37,y:55,l:'側道 · 檢修廊',priority:2},{x:51,y:25,l:'防守轉點道',priority:2},{x:50,y:90,l:'進攻集結',priority:2}],
 radarRoutes:[['tSpawn','apps','connector','bSite'],['tSpawn','palace','ramp','aRamp','aSite'],['tSpawn','mid','topMid','window','aSite'],['connector','westLink','topMid','eastLink','aRamp'],['bSite','defenseLink','aSite'],['ctSpawn','defenseLink'],['serviceSouth','room-v2-west-service','serviceNorth'],['pumpSouth','room-v2-east-pump','pumpNorth']],
};
const lanes={
 t_apalace:{
  entry:['tSpawn','palace','ramp','aRamp','aSite'],
  support:['tSpawn','pumpSouth','room-v2-east-pump','pumpNorth','eastLink','aRamp','aSite'],
  awp:['tSpawn','mid','topMid','window','aSite'],
  igl:['tSpawn','mid','topMid','window','aSite'],
  lurker:['tSpawn','apps','westLink','topMid','window','aSite'],
 },
 t_bapps:{
  entry:['tSpawn','apps','connector','bSite'],
  support:['tSpawn','serviceSouth','room-v2-west-service','serviceNorth','westLink','connector','bSite'],
  awp:['tSpawn','mid','topMid','defenseLink','bSite'],
  igl:['tSpawn','mid','topMid','westLink','bSite'],
  lurker:['tSpawn','palace','ramp','eastLink','defenseLink','bSite'],
 },
 t_midsplit:{
  entry:['tSpawn','mid','topMid','eastLink','aRamp','aSite'],
  support:['tSpawn','pumpSouth','room-v2-east-pump','pumpNorth','eastLink','aRamp','aSite'],
  awp:['tSpawn','mid','topMid','window','aSite'],
  igl:['tSpawn','mid','topMid','window','aSite'],
  lurker:['tSpawn','palace','ramp','aRamp','aSite'],
 },
};
export function fpsSceneTactic(tactic,side,sceneVersion){
 if(sceneVersion!=='major.v2'||side!=='t'||!lanes[tactic?.id])return tactic;
 return {...tactic,routes:{...tactic.routes,...lanes[tactic.id],rifler:lanes[tactic.id].entry}};
}
export function fpsSceneMap(mapKey,sceneVersion,majorMaps,legacyMaps){
 if(sceneVersion==='major.v2'){
  if(mapKey!=='mirage')throw new Error('此原型僅支援匯流站');
  return FPS_ORIGINAL_CONFLUENCE_V2;
 }
 return (sceneVersion==='legacy'?legacyMaps:majorMaps)[mapKey];
}
