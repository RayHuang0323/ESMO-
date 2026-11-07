import {majorRoomWalls} from './fpsMajorArchitecture.js';
import {FPS_ORIGINAL_CONFLUENCE_V2 as before} from './fpsOriginalMapV2.js';

// A new scene revision preserves the shipped prototype's saved Replay geometry.
// Route keys are shared by tactics, the review diagram and navigation audits.
const underpass={id:'confluence-underpass',x:45,y:61,w:10,h:13,height:4.2,label:'下層檢修道',roof:'vault',entryAxis:'y',doorWidth:6,authored:true,compact:true,fixtures:[]};
const gallery={id:'confluence-gallery',x:74,y:43,w:10,h:12,height:6,label:'東側高廊',roof:'clerestory',entryAxis:'y',doorWidth:6,authored:true,compact:true,fixtures:[]};
const connectorRoom={id:'confluence-connector',x:61,y:29,w:11,h:10,height:6,label:'東連接室',roof:'vault',entryAxis:'y',doorWidth:6,authored:true,compact:true,fixtures:[]};
const nodes={...before.nodes,
 mid:{x:50,y:58},underpassSouth:{x:50,y:77},underpass:{x:50,y:67.5},underpassNorth:{x:50,y:58},
 midGap:{x:45.5,y:56.5},midElbow:{x:45.5,y:44.5},aConnector:{x:68,y:25},bConnector:{x:44,y:26},
 gallerySouth:{x:79,y:59},gallery:{x:79,y:49},galleryNorth:{x:79,y:39},pumpNorth:{x:71.5,y:55.5},pumpLink:{x:71.5,y:42},
 eastFlankSouth:{x:90,y:75},eastFlank:{x:90,y:58},eastFlankNorth:{x:90.5,y:36},aEast:{x:81,y:34},
 westFlankSouth:{x:10,y:72},westFlank:{x:10,y:54},westFlankNorth:{x:10,y:37},bWest:{x:20,y:29},
 aRear:{x:76,y:14},bRear:{x:26,y:15},
 connectorSouth:{x:66.5,y:42},connectorRoom:{x:66.5,y:34},connectorNorth:{x:66.5,y:26},
};
export const CONFLUENCE_ROUTES=[
 {id:'a-main',label:'A 高廊主攻',site:'a',keys:['tSpawn','palace','ramp','gallerySouth','gallery','galleryNorth','aSite'],use:'正面夾攻；室內先清近角，北門展開進點。',risk:'高廊北門集中交火，需煙閃配合。'},
 {id:'a-pump',label:'A 泵房協同',site:'a',keys:['tSpawn','pumpSouth','room-v2-east-pump','pumpNorth','pumpLink','connectorSouth','connectorRoom','connectorNorth','aConnector','aSite'],use:'穿越泵房與連接室，和高廊主攻形成兩側同步進點。',risk:'雙門近戰，連接室北口橫越防守轉點線。'},
 {id:'a-mid',label:'中路接 A 連接道',site:'a',keys:['tSpawn','underpassSouth','underpass','underpassNorth','midGap','midElbow','topMid','window','aConnector','aSite'],use:'爭奪中路後從西側夾 A；失去中路就不能安全轉點。',risk:'屏障西口暴露，連接道橫越防守轉點線。'},
 {id:'a-flank',label:'A 東側外繞',site:'a',keys:['tSpawn','eastFlankSouth','eastFlank','eastFlankNorth','aEast','aSite'],use:'長時間側翼，懲罰只盯高廊與中路的守方。',risk:'外側長視線且撤回慢，最後轉角必須清點。'},
 {id:'b-main',label:'B 西側主攻',site:'b',keys:['tSpawn','apps','connector','bSite'],use:'穩定雙人進場，與檢修廊或中路同步。',risk:'西側掩體交錯，進口容易被交叉火力封鎖。'},
 {id:'b-service',label:'B 室內檢修廊',site:'b',keys:['tSpawn','serviceSouth','room-v2-west-service','serviceNorth','westLink','bSite'],use:'遮蔽轉移與近距離換槍，北門支援 B 主攻。',risk:'單門不可多人擠住；室外出口需隊友接應。'},
 {id:'b-mid',label:'中路接 B 連接道',site:'b',keys:['tSpawn','underpassSouth','underpass','underpassNorth','midGap','midElbow','topMid','bConnector','bSite'],use:'中路控制轉 B，亦可中途轉 A 或壓防守轉點道。',risk:'中路爭奪後仍需清 B 東側角落。'},
 {id:'b-flank',label:'B 西側排水外繞',site:'b',keys:['tSpawn','westFlankSouth','westFlank','westFlankNorth','bWest','bSite'],use:'延後西側包夾，與檢修廊構成不同進口。',risk:'路遠且外側缺少撤退掩護。'},
 {id:'ct-a-rear',label:'A 後側回防',site:'a',side:'ct',keys:['ctSpawn','aRear','aSite'],use:'守方後側入口；可與連接道回防夾擊。',risk:'北側拐角及安包後反拆角度。'},
 {id:'ct-a-mid',label:'A 中路回防',site:'a',side:'ct',keys:['ctSpawn','defenseLink','window','aConnector','aSite'],use:'回收中路後從西側入點，支援後側回防。',risk:'暴露於中路與安包後守槍。'},
 {id:'ct-b-rear',label:'B 後側回防',site:'b',side:'ct',keys:['ctSpawn','bRear','bSite'],use:'B 北側回防，與東連接道形成雙向壓力。',risk:'入點前需清濾池掩體。'},
 {id:'ct-b-mid',label:'B 中路回防',site:'b',side:'ct',keys:['ctSpawn','defenseLink','bConnector','bSite'],use:'經中央回防，牽制 B 東側守點。',risk:'轉點道被截斷時必須走後側。'},
 {id:'rotate',label:'防守轉點道',side:'ct',keys:['bSite','bConnector','defenseLink','window','aConnector','aSite'],use:'兩點回防與轉點；中路控制可攔截此通道。',risk:'連接道交會，不能同時安全照看兩點。'},
];
export const FPS_CONFLUENCE_STATION_V3_2={...before,name:'Confluence Station',layoutId:'esmo-confluence.v3.2',
 walls:[...before.walls.filter(w=>!(w.x===34&&w.y===78)&&!(w.x===7&&w.y===45)&&!(w.x===84&&w.y===48)&&!(w.x===77&&w.y===55)&&!(w.x===61&&w.y===29)&&!(w.x===47&&w.y===48)),
  {x:34,y:78,w:10,h:5,hgt:5},{x:56,y:78,w:10,h:5,hgt:5},
  {x:13,y:45,w:3,h:5,hgt:5},{x:84,y:48,w:3,h:6,hgt:5},
  {x:83,y:56,w:2,h:4,hgt:4.5},
  {x:48,y:48,w:5,h:5,hgt:5},{x:53.5,y:40,w:8,h:4,hgt:5},
  ...majorRoomWalls(underpass),...majorRoomWalls(gallery),...majorRoomWalls(connectorRoom),
  {x:74,y:29,w:2,h:5,hgt:3.2},{x:23,y:20,w:4,h:2,hgt:3.2},
 ],crates:before.crates.filter(c=>!(c.x===55&&c.y===34)&&!(c.x===33&&c.y===23)).map(c=>c.x===48&&c.y===69?{x:42,y:72}:c.x===78&&c.y===59?{x:86,y:60}:c),rooms:[...before.rooms,underpass,gallery,connectorRoom],nodes,
 callouts:[
  {x:78,y:24,l:'A區・調壓庭院',short:'調壓庭院',priority:1},
  {x:26,y:26,l:'B區・濾池庭院',short:'濾池庭院',priority:1},
  {x:50,y:39,l:'中路・匯流中庭',short:'中庭',priority:1},
  {x:50,y:68,l:'下層檢修道',short:'下層道',priority:2},
  {x:38,y:55,l:'西側檢修廊',short:'檢修廊',priority:2},
  {x:64,y:55.5,l:'東側泵房',short:'泵房',priority:2},
  {x:79,y:49,l:'東側高廊',short:'高廊',priority:2},
  {x:66.5,y:34,l:'東連接室',short:'連接',priority:2},
  {x:10,y:58,l:'排水側道',short:'排水道',priority:2},
  {x:90,y:58,l:'東側外環',short:'外環',priority:2},
  {x:51,y:25,l:'防守轉點道',short:'轉點道',priority:2},
  {x:50,y:90,l:'進攻集結',short:'進攻集結',priority:2},
 ],tacticalRoutes:CONFLUENCE_ROUTES,radarRoutes:CONFLUENCE_ROUTES.map(r=>r.keys),
 retakeEntries:{a:['aRear','aConnector','galleryNorth','aEast'],b:['bRear','bConnector','connector','bWest']},
};
// Two existing screen edges left sub-unit oblique spawn-to-spawn sight lines.
// Keep the old geometry for saved frames; new matches close only those edges.
export const CONFLUENCE_CURRENT_LAYOUT='esmo-confluence.v3.3';
export const FPS_CONFLUENCE_STATION={...FPS_CONFLUENCE_STATION_V3_2,layoutId:CONFLUENCE_CURRENT_LAYOUT,
 walls:FPS_CONFLUENCE_STATION_V3_2.walls.map(w=>w.x===39&&w.y===14?{...w,w:10.5}:w.x===53.5&&w.y===40?{...w,x:53,w:8.5}:w),
};
const route=id=>CONFLUENCE_ROUTES.find(r=>r.id===id).keys;
export function confluenceTactic(tactic,side){
 if(side==='t'){
  const b=tactic?.site==='b'||tactic?.id==='t_bapps';
  const routes=b?{entry:route('b-main'),support:route('b-service'),awp:route('b-mid'),igl:route('b-mid'),lurker:route('b-flank')}:
   {entry:route('a-main'),support:route('a-pump'),awp:route('a-mid'),igl:route('a-mid'),lurker:route('a-flank')};
  return {...tactic,routes:{...tactic.routes,...routes,rifler:routes.entry}};
 }
 return tactic;
}
