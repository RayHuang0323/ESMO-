// Major-only intent. Authored nodes/navigation own geometry; combat owns outcomes.
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
import {fpsObjectiveTimePressure} from './fpsObjectiveDiscipline.js';
export function fpsAssignTacticalDuties({players}) {
  const result={};
  for(const side of ['t','ct']){
    const team=players.filter(p=>p.side===side).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const carrier=team.find(p=>p.hasBomb)||team.find(p=>p.role==='support')||team.find(p=>p.role==='igl')||team.find(p=>p.role==='rifler')||team[0];
    const entry=team.find(p=>p!==carrier&&p.role==='entry')||team.find(p=>p!==carrier);
    const flank=team.find(p=>p!==carrier&&p!==entry&&p.role==='lurker')||team.filter(p=>p!==carrier&&p!==entry).at(-1);
    const information=team.find(p=>p.role==='awp')||team.find(p=>p.role==='igl')||team.at(-1);
    const anchors=team.filter(p=>p!==information);
    for(const p of team){
      const ordinal=anchors.indexOf(p);
      result[p.id]={attackDuty:p===carrier?'carrier':p===entry?'entry':p===flank?'flank':p.role==='awp'?'overwatch':'trade',
        defenseDuty:p===information?'information':ordinal%2?'rotator':'anchor',deploymentSite:p===information?null:ordinal<2?'a':'b'};
    }
  }
  return result;
}

export function fpsAttackStage({player,players,mode,roundSec,planted,sites,target,intel=[]}){
  if(planted)return{stage:'post-plant',canAdvance:false,reason:'bomb-planted'};
  if(mode==='rush')return{stage:'entry',canAdvance:true,reason:'called-rush'};
  if(player.tacticalStage==='entry')return{stage:'entry',canAdvance:true,reason:'committed-entry'};
  const team=players.filter(p=>!p.dead&&p.side===player.side),enemy=players.filter(p=>!p.dead&&p.side!==player.side);
  const site=sites?.[target],known=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3);
  const carrier=team.find(p=>p.hasBomb)||player;
  const pressure=roundSec>=85||fpsObjectiveTimePressure({player:carrier,site,roundSec}),advantage=players.some(p=>p.side!==player.side)&&team.length>enemy.length;
  const committed=['regroup','utility'].includes(player.tacticalStage);
  if(mode==='pick'&&!committed&&!pressure&&!advantage)return{stage:'pick',canAdvance:false,reason:known.length?'hold-reported-angle':'await-information-or-opening'};
  const controlled=team.filter(p=>Number.isFinite(p.controlledSinceSec)).length>=Math.min(3,team.length)&&roundSec>=30;
  const siteIntel=site&&known.some(i=>distance(i.pos,site)<=24);
  if((mode==='default'||mode==='fake')&&!committed&&!pressure&&!advantage&&!controlled&&!siteIntel&&
    team.filter(p=>site&&distance(p.pos,site)<=24).length<2)return{stage:'control',canAdvance:false,reason:'control-unconfirmed'};
  const grouped=team.filter(p=>site&&distance(p.pos,site)<=24&&p.tacticalDuty?.attackDuty!=='flank');
  if(!pressure&&grouped.length<Math.min(2,team.filter(p=>p.tacticalDuty?.attackDuty!=='flank').length))return{stage:'regroup',canAdvance:false,reason:'support-wave-not-in-position'};
  const holders=grouped.filter(p=>p.nades?.some(n=>n==='smoke'||n==='flash'));
  const screen=grouped.some(p=>['smoke','flash'].includes(p.lastUtilityType)&&['execute-screen','entry-flash'].includes(p.lastUtilityIntent)&&Number.isFinite(p.lastUtilityAtSec)&&roundSec-p.lastUtilityAtSec<=5);
  const waited=roundSec-(player.utilityStageSinceSec??roundSec);
  if(!pressure&&holders.length&&!screen&&waited<5)return{stage:'utility',canAdvance:false,reason:'cover-before-entry'};
  return{stage:'entry',canAdvance:true,reason:pressure?'round-time-pressure':screen?'utility-released':holders.length?'bounded-utility-window':'no-live-utility-holder'};
}

export function planFpsBombRoute({ player, players, tactic, library, target, phase, selectionId, nodes }) {
  const team = players.filter(p => p.side === player.side).sort((a,b) => String(a.id).localeCompare(String(b.id)));
  const index = team.findIndex(p => p.id === player.id);
  const clean = keys => keys.filter(k => nodes[k]);
  const duty=player.tacticalDuty||fpsAssignTacticalDuties({players})[player.id];
  if (player.side === 'ct') {
    // Two site pairs and one information anchor. Aggression never abandons both sites.
    const site = tactic.type === 'stack' ? tactic.site : duty?.deploymentSite;
    const information=!site,forward=tactic.type==='aggro'&&(information||duty?.defenseDuty==='rotator'&&index===1);
    const authored=tactic.routes?.[player.role]||tactic.routes?.awp||['ctSpawn','mid'];
    const anchors=site&&nodes[`${site}Site`]?Object.entries(nodes).filter(([key,p])=>!key.endsWith('Spawn')&&distance(p,nodes[`${site}Site`])<=24&&distance(p,nodes[`${site}Site`])>4)
      .sort((a,b)=>distance(a[1],nodes.ctSpawn)-distance(b[1],nodes.ctSpawn)||a[0].localeCompare(b[0])):[];
    const peers=team.filter(p=>(p.tacticalDuty||fpsAssignTacticalDuties({players})[p.id])?.deploymentSite===site),slot=Math.max(0,peers.findIndex(p=>p.id===player.id));
    const anchor=anchors[slot%Math.max(1,anchors.length)]?.[0]||`${site}Site`;
    const keys=forward?authored:information?['ctSpawn',...(authored.filter(k=>!k.endsWith('Spawn')).slice(0,1))]:['ctSpawn',anchor];
    player.deploymentSite=site;player.informationRotator=['rotator','information'].includes(duty?.defenseDuty);
    return { kind: forward?'information-peek':site?`hold-${site}`:'information', keys: clean(keys), objective: forward?'limited-information':'hold-information' };
  }
  const mode = ({f1:'default', f2:'rush', f3:'split', f4:'pick', f5:'execute', f6:'fake', f7:'default', f8:'default'})[selectionId] || tactic.type;
  const primary = tactic.site===target&&tactic.type==='execute'?tactic:library.find(t => t.site === target && t.type === 'execute') || library.find(t => t.site === target) || tactic;
  const role = player.hasBomb ? 'support' : duty?.attackDuty==='flank'?'lurker':player.role;
  let lane = primary.routes?.[role] || primary.routes?.rifler || primary.routes?.entry || ['tSpawn',`${target}Site`];
  // Some support lanes are diversions (Inferno B's support ends at A-side mid).
  // The carrier follows a real site entry with the support wave, never that diversion.
  if(player.hasBomb && lane.at(-1)!==`${target}Site`)lane=primary.routes?.entry || ['tSpawn',`${target}Site`];
  const opposite = library.find(t => t.site === (target === 'a' ? 'b' : 'a'));
  const control = tactic.routes?.[role] || lane;
  const stage=player.tacticalStage||({default:'control',pick:'pick',fake:'control',rush:'entry'}[mode]||'regroup');
  let keys = [...lane], kind = mode || 'execute';
  if (mode === 'fake' && !player.hasBomb && (player.role === 'entry' || player.role === 'lurker') && phase === 'opening' && player.fakeStage !== 'complete') {
    keys = [...(opposite?.routes?.entry || ['tSpawn', 'mid'])].filter(k => !k.endsWith('Site'));
    player.fakeStage = 'approach'; player.fakeSite = target === 'a' ? 'b' : 'a';
    player.fakeNodeKey = keys.at(-1); player.fakeGoal = { ...nodes[player.fakeNodeKey] };
    kind = 'fake-approach';
  } else if (mode === 'rotate' && phase === 'opening') {
    keys = (opposite?.routes?.[role] || opposite?.routes?.entry || ['tSpawn','mid']).filter(k => !k.endsWith('Site'));
    kind = 'rotate-control';
  } else if (['control','pick'].includes(stage)) {
    // Keep independent lanes, then commit on the mid-round clock, even after contact.
    keys = player.hasBomb ? lane.slice(0,-1) : control.filter(k => !k.endsWith('Site'));
    if (!keys.length) keys = ['tSpawn', 'mid'];
    if(stage==='pick'&&role==='awp')keys=control.slice(0,Math.max(2,control.length-1));
    kind = stage==='pick'?'pick-angle':'route-control';
  } else if (mode === 'rush') {
    keys = [...(primary.routes?.entry || lane)]; kind = 'rush-entry';
  } else if (mode === 'split' && !player.hasBomb && index % 2 === 0) {
    keys = ['tSpawn', 'mid', nodes.connector ? 'connector' : nodes.shortA ? 'shortA' : 'aConn', `${target}Site`];
    kind = 'split-mid';
  } else if (role === 'lurker' && !player.hasBomb && phase === 'opening') {
    // Entry commitment may append the site below. Never mutate an authored
    // library lane shared by later rounds or matches.
    keys = [...(primary.routes?.lurker || control)]; kind = 'lurk';
  }
  if(['regroup','utility'].includes(stage)&&kind!=='fake-approach'&&role!=='lurker'){
    keys=keys.filter(k=>k!==`${target}Site`);kind=stage==='utility'?'utility-stage':'regroup';
  }
  if(stage==='entry'&&!keys.includes(`${target}Site`))keys.push(`${target}Site`);
  return { kind, keys: clean(keys), objective: player.hasBomb ? 'plant' : kind,canAdvance:stage==='entry' };
}

export function planFpsUtilityLoadout({player,duty,nodes,target,tactic,round,buyType}) {
  const ownSite=player.side==='ct'?(tactic?.type==='stack'?tactic.site:duty.deploymentSite):target;
  const siteKey=ownSite?`${ownSite}Site`:null;
  const dutyName=player.side==='ct'?duty.defenseDuty:duty.attackDuty;
  const kit=player.side==='ct' ? dutyName==='information'?['smoke','flash']:dutyName==='rotator'?['flash','smoke','he']:['molly','smoke','he']
    : dutyName==='flank'?['smoke','flash','he']:dutyName==='overwatch'?['smoke','flash']:dutyName==='carrier'?['smoke','flash','molly']:dutyName==='entry'?['flash','he','smoke']:['flash','he','molly'];
  const lane=Object.values(tactic?.routes||{}).flat().filter(key=>nodes[key]);
  return [...new Set([...kit,'smoke','flash','he','molly'])].map((type,priority)=>({id:`utility-plan-${round}-${player.id}-${type}`,type,priority,duty:dutyName,
    purpose:player.side==='ct'?(type==='smoke'?'hold-or-retake-screen':type==='molly'?'observed-approach-delay':type==='he'?'observed-enemy':'information-or-retake-flash')
      :dutyName==='flank'?(type==='smoke'?'escape-or-join-screen':type==='flash'?'flank-peek':'observed-enemy'):type==='smoke'?'execute-screen':type==='flash'?'entry-flash':'clear-site',
    trigger:type==='he'?(player.side==='ct'?'safe-observed-enemy':'safe-observed-enemy-or-clear-called-site'):player.side==='ct'?'observed-approach-or-public-bomb':dutyName==='flank'?'actual-flank-lane-or-observed-threat':'actual-entry-lane-or-site-window',
    windowNodeKey:siteKey,targetSource:player.side==='ct'?'own-deployment-or-team-intel-or-public-bomb':'called-site-or-own-route-or-team-intel',teamAuthoredLaneKeys:[...new Set(lane)],
    purchaseEligible:buyType!=='eco'&&kit.includes(type)&&(buyType!=='pistol'||type===(dutyName==='carrier'||dutyName==='information'?'smoke':'flash'))}));
}

// Each inventory type gets its own eligibility observation. A skip on a smoke
// no longer pretends to describe HE/flash/molly windows at the same instant.
export function chooseFpsContextUtility(args) {
  const {player,intel=[],onSkip=()=>{},onWindow=()=>{}}=args;
  const order=player.utilityPlans?.map(p=>p.type)||player.nades||[];
  let chosen=null;
  for(const type of [...new Set([...order,...(player.nades||[])])]){
    if(!player.nades?.includes(type))continue;
    const plan=player.utilityPlans?.find(p=>p.type===type);
    const reports=intel.filter(i=>i.side===player.side&&args.roundSec>=i.observedAtSec&&args.roundSec-i.observedAtSec<=3)
      .sort((a,b)=>distance(player.pos,a.pos)-distance(player.pos,b.pos));
    let reason='no-information',candidate=null;
    for(const report of reports.length?reports:[null]){
      candidate=chooseFpsUtilityForType({...args,player:{...player,nades:[type]},intel:report?[report]:[],onSkip:r=>{reason=r;}});
      if(candidate)break;
    }
    if(candidate){onWindow(type,chosen?'eligible-deferred-priority':'eligible',plan);if(!chosen)chosen={...candidate,planId:plan?.id||null,purchasePurpose:plan?.purpose||null};continue;}
    onSkip(reason,type);onWindow(type,reason,plan);
  }
  return chosen;
}

function chooseFpsUtilityForType({ player, players=[], intel, nodes, target, planted, bombPos, roundSec, smokes=[], throwables=[], walls=[],lineBlocked=()=>false,onSkip=()=>{} }) {
  const skip=reason=>{onSkip(reason);return null;};
  const attackDuty=player.tacticalDuty?.attackDuty||player.attackDuty;
  if(player.dead)return skip('dead');
  if(player.blindSec>0)return skip('blinded');
  if(roundSec<12)return skip('buy-phase');
  if(player.tacticalIntent?.kind==='save')return skip('save');
  if(roundSec-(player.lastUtilityAtSec??-Infinity)<3)return skip('throw-cooldown');
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  // A long sightline is still real team information. Smoke screens our own
  // approach 14m ahead, so it must not discard observed enemies beyond 48m.
  const known = intel.filter(i => i.side === player.side && roundSec-i.observedAtSec <= 3)
    .sort((a,b) => distance(player.pos,a.pos)-distance(player.pos,b.pos))[0];
  const site = planted ? bombPos : nodes[player.side==='ct'?`${player.deploymentSite}Site`:`${target}Site`];
  const has = type => player.nades.includes(type);
  const covered = (type,to) => throwables.some(t=>t.type===type&&distance(t.to,to)<7) || type==='smoke'&&smokes.some(s=>distance(s.pos,to)<7);
  const flashSafe = to => players.every(p=>p.dead||p.side!==player.side||distance(p.pos,to)>=8||lineBlocked(p.pos,to,walls));
  if(known&&has('smoke')&&distance(player.pos,known.pos)>18){
    const d=distance(player.pos,known.pos),to={x:player.pos.x+(known.pos.x-player.pos.x)*14/d,y:player.pos.y+(known.pos.y-player.pos.y)*14/d};
    if(!covered('smoke',to))return {type:'smoke',to,intent:player.side==='ct'?'hold-delay':'execute-screen'};
  }
  if(known&&player.side==='ct'&&distance(player.pos,known.pos)>24&&distance(player.pos,known.pos)<48){
    // Hold utility delays an observed approach, rather than waiting until a
    // rifle duel is already within lethal range. Target follows real team intel.
    const d=distance(player.pos,known.pos),to={x:player.pos.x+(known.pos.x-player.pos.x)*16/d,y:player.pos.y+(known.pos.y-player.pos.y)*16/d};
    if(has('molly')&&flashSafe(to)&&!covered('molly',to))return{type:'molly',to,intent:'hold-delay'};
    if(has('flash')&&flashSafe(to)&&!covered('flash',to))return{type:'flash',to,intent:planted?'retake-flash':'hold-delay'};
  }
  if (known && distance(player.pos,known.pos)<36 && has('he')&&flashSafe(known.pos)) return { type:'he', to:{...known.pos}, intent:'observed-enemy' };
  if (known && distance(player.pos,known.pos)<30 && has('molly')&&flashSafe(known.pos)&&!covered('molly',known.pos)) return { type:'molly', to:{...known.pos}, intent: planted && player.side === 't' ? 'deny-defuse' : player.side === 'ct' ? 'hold-delay' : 'clear-site' };
  if (known && has('flash') && distance(player.pos,known.pos)<24 && flashSafe(known.pos)&&!covered('flash',known.pos)) return { type:'flash', to:{...known.pos}, intent:player.side === 'ct' && planted ? 'retake-flash' : 'entry-flash' };
  if(player.side==='t'&&!planted&&has('flash')&&(attackDuty?['entry','trade','carrier','flank'].includes(attackDuty):['entry','support','igl'].includes(player.role))&&(!player._routePlan?.kind?.includes('control')||attackDuty==='flank')&&roundSec>=14&&distance(player.pos,nodes.tSpawn)>10){
    // A called entry flash follows the actual remaining navigable lane ahead.
    const nextWaypoint=player.route[player.routeIdx+1];
    const endpoint=nextWaypoint&&distance(player.pos,nextWaypoint)>=12&&!lineBlocked(player.pos,nextWaypoint,walls)?nextWaypoint:null;
    const ahead=endpoint?{x:player.pos.x+(endpoint.x-player.pos.x)*Math.min(16,distance(player.pos,endpoint))/distance(player.pos,endpoint),y:player.pos.y+(endpoint.y-player.pos.y)*Math.min(16,distance(player.pos,endpoint))/distance(player.pos,endpoint)}:null;
    if(ahead&&flashSafe(ahead)&&!covered('flash',ahead))return{type:'flash',to:{...ahead},intent:'entry-flash'};
  }
  if (!site || distance(player.pos,site) > 24 || distance(player.pos,site) < 8) return skip(known?'outside-site-utility-window':'no-intel-outside-site-window');
  if(player.side==='t'&&!planted&&has('he')&&players.every(p=>p.dead||p.side!==player.side||distance(p.pos,site)>=8)&&!covered('he',site))return{type:'he',to:{...site},intent:'clear-site'};
  if (player.side === 't' && !planted && has('smoke')) {
    // Screen the defender approach, not the plant platform or the carrier's route.
    const approach = Object.entries(nodes).filter(([k,p]) => !k.endsWith('Spawn') && distance(p,site)>7 && distance(p,site)<22)
      .sort((a,b) => distance(a[1],nodes.ctSpawn)-distance(b[1],nodes.ctSpawn))[0]?.[1];
    if (approach&&!covered('smoke',approach)) return { type:'smoke', to:{...approach}, intent:'execute-screen' };
  }
  if (player.side === 't' && !planted && has('molly')&&flashSafe(site)&&!covered('molly',site)) return { type:'molly', to:{...site}, intent:'clear-site' };
  if (player.side === 'ct' && planted && has('smoke')&&!covered('smoke',site)) return { type:'smoke', to:{...site}, intent:'retake-screen' };
  return skip(known?'no-safe-uncovered-purpose':player.side==='ct'&&!planted?'hold-awaiting-intel':'no-safe-site-purpose');
}
