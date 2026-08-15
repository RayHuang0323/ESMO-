// Historical-view adapter for R14 and older CS evidence after R15 wires
// player-thrown molly zones into the existing damage/death ledger. It never
// writes production files and must restore the byte-exact LF-normalized R14.

import { createHash } from "node:crypto";
import {
  CS_R14_HE_SOURCE_SHA256,
  csR14R13Source,
  csR14EvidenceSources,
  normalizeCsSource,
} from "./cs_r14_legacy_source.mjs";

export {
  CS_R13_PLAYER_SMOKE_LF_SHA256,
  CS_R14_HE_SOURCE_SHA256,
  csR14R13Source,
  normalizeCsSource,
} from "./cs_r14_legacy_source.mjs";
export const CS_R15_MOLLY_SOURCE_SHA256 = "7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89";
export const CS_R19_SEMANTIC_SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
export const CS_R25_ACCURACY_SOURCE_SHA256 = "68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e";
export const CS_R26_DECISION_SOURCE_SHA256 = CS_R25_ACCURACY_SOURCE_SHA256;
export const CS_R27_DECISION_SOURCE_SHA256 = "f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87";
export const CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256 = CS_R27_DECISION_SOURCE_SHA256;
// R43 Accuracy evidence is locked against the pre-R44 Focus semantic patch.
// R44 changes only the live defuse Focus read; historical adapters restore the
// old byte-exact view before running R24/R43 and earlier evidence.
export const CS_R43_ACCURACY_SOURCE_SHA256 = "edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3";
export const CS_R44_FOCUS_SOURCE_SHA256 = "80a6ef4e776c825f602f5b41a8a7d9e6c97546dd157e87de2e6f4e3e69fced5e";
export const CS_R33_RESILIENCE_SOURCE_SHA256 = CS_R44_FOCUS_SOURCE_SHA256;
export const CS_R47_IDENTITY_SOURCE_SHA256 = "d2769a3534a590e7cca5fde95662836731e738bdf78e4ef3b12d1999de1e5339";

const R24_RAW_ACCURACY_HEADSHOT = '          const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const R25_EFFECTIVE_ACCURACY_HEADSHOT = '          const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,"acc"):rawAccuracy;const isHS=rand()<g.hs*(0.72+0.55*(effectiveAccuracy/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const R26_RAW_DECISION_DEFUSE = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+defuser.stats.dec/300):0.7;';
const R27_EFFECTIVE_DECISION_DEFUSE = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+persStat(defuser,"dec")/300):0.7;';
const R33_LAST_ALIVE = '    if(opts.lastAlive)v+=(S("str")-76)*0.22;                      // 殘局主動勝負：由 Clutch 負責';
const R32_LAST_ALIVE = '    if(opts.lastAlive)v+=(S("str")-76)*0.22+(S("res")-76)*0.12; // 殘局（clutch=抗壓 + 韌性）';
const R33_LOW_HP = '    if(opts.lowHP)v-=(100-S("str"))*0.05-(S("res")-76)*0.12;   // 低血量穩定執行：Resilience 減少衰退';
const R32_LOW_HP = '    if(opts.lowHP)v-=(100-S("str"))*0.05;';
const R28_RAW_FOCUS_DEFUSE = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+persStat(defuser,"dec")/300):0.7;';
const R29_EFFECTIVE_FOCUS_DEFUSE = '          defuseProg+=defuser.stats?(0.45+persStat(defuser,"foc")/250+persStat(defuser,"dec")/300):0.7;';
// R48 historical adapter: remove team identity consumers so R47/R36/R18
// evidence continues to inspect its locked pre-R48 source.
const R48_IDENTITY_HELPERS = `const COMMS_HANDOFF_THRESHOLD=88;
function applyCommsHandoff(spotter,enemy,players,walls){
  if(persStat(spotter,"com")<COMMS_HANDOFF_THRESHOLD)return null;
  const candidates=players.filter(p=>p!==spotter&&!p.dead&&!p.reassigned&&p.side===spotter.side&&(dist(p.pos,enemy.pos)<50||dist(p.pos,spotter.pos)<45));
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||dist(a.pos,enemy.pos)-dist(b.pos,enemy.pos));
  const receiver=candidates[0];if(!receiver)return null;
  receiver.route=[{...receiver.pos},{...enemy.pos}];receiver.routeIdx=0;receiver.routeT=0;receiver.state="ROTATE";
  receiver.va=Math.atan2(enemy.pos.y-receiver.pos.y,enemy.pos.x-receiver.pos.x)*180/Math.PI;
  return receiver;
}
const LEADERSHIP_EXECUTION_THRESHOLD=90;
function leadershipRouteKeys(p,tactic,tr,RKF,roster){
  const base=tacticalRouteKeys(p,tactic,tr,RKF);
  if(p.role==="igl")return base;
  const leader=roster.find(q=>q.side===p.side&&q.role==="igl"&&!q.dead);
  return leader&&persStat(leader,"led")>=LEADERSHIP_EXECUTION_THRESHOLD&&tr[leader.role]?tr[leader.role]:base;
}
const SYNERGY_TRADE_THRESHOLD=90;
function synergyTradeCandidate(attacker,victim,players,walls){
  const candidates=players.filter(p=>p!==attacker&&!p.dead&&!p.reassigned&&p.side===attacker.side&&dist(p.pos,attacker.pos)<24&&dist(p.pos,victim.pos)<38&&!lineBlocked(p.pos,victim.pos,walls));
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||dist(a.pos,attacker.pos)-dist(b.pos,attacker.pos));
  return candidates[0]||null;
}
`;
const R48_ROUTE_KEYS = '      const routeKeys=leadershipRouteKeys(c,tactic,tr,RKF,RS);';
const R47_TEAM_ROUTE_KEYS = '      const routeKeys=tacticalRouteKeys(c,tactic,tr,RKF);';
const R48_COMMS_LINE = '          if(!contactCalled){contactCalled=true;const spotter=cp;comms.push({side:spotter.side,name:spotter.name,text:`${nearCO(tp.pos)} 有人，${aliveT.length} 個！`});const handoffReceiver=applyCommsHandoff(spotter,tp,ps,walls);}';
const R47_COMMS_LINE = '          if(!contactCalled){contactCalled=true;const spotter=cp;comms.push({side:spotter.side,name:spotter.name,text:`${nearCO(tp.pos)} 有人，${aliveT.length} 個！`});}';
const R48_SYNERGY_BLOCK = `          const synergyPartner=synergyTradeCandidate(at,df,ps,walls);
          const synergyReady=Boolean(synergyPartner&&Math.max(persStat(at,"coo"),persStat(synergyPartner,"coo"))>=SYNERGY_TRADE_THRESHOLD);
          if(synergyReady){synergyPartner.va=Math.atan2(df.pos.y-synergyPartner.pos.y,df.pos.x-synergyPartner.pos.x)*180/Math.PI;synergyPartner.state="ENGAGE";synergyPartner.shooting=Math.max(synergyPartner.shooting,1);}
`;
// R50 historical adapter: remove the second-layer identity consumers so
// R47/R49 evidence continues to inspect the locked pre-R50 source.
const R50_ADAPT_HELPER = `function adaptivePostPlantGoal(p,planted,c4pos){
  if(!planted||p.side!=="t"||p.hp<48||p._adaptivePostPlant||persStat(p,"adp")<ADAPT_ROUTE_THRESHOLD)return null;
  return c4pos&&dist(p.pos,c4pos)>10?c4pos:null;
}
`;
const R50_TACTICAL_HELPER = `function tacticalRetakeRoute(p,tactic,N,c4pos){
  if(p.side!=="ct"||!c4pos||persStat(p,"tac")<TACTICAL_EXECUTION_THRESHOLD)return null;
  const keys=tactic?.routes?.[p.role]||tactic?.routes?.rifler||tactic?.routes?.entry;if(!Array.isArray(keys)||keys.length<3)return null;
  const staging=keys.slice(1,-1).map(key=>N[key]).find(node=>node&&dist(node,c4pos)>8);
  return staging?[{...p.pos},{...staging},{...c4pos}]:null;
}
`;
const R50_COMMS_HELPER = `function applyCommsBombAwareness(carrier,sitePos,players){
  const candidates=players.filter(p=>p!==carrier&&!p.dead&&!p.reassigned&&dist(p.pos,carrier.pos)<50&&persStat(p,"com")>=COMMS_HANDOFF_THRESHOLD);
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||persStat(b,"com")-persStat(a,"com")||dist(a.pos,sitePos)-dist(b.pos,sitePos));
  const receiver=candidates[0];if(!receiver||!sitePos)return null;
  receiver.route=[{...receiver.pos},{...sitePos}];receiver.routeIdx=0;receiver.routeT=0;receiver.state="ROTATE";
  receiver.va=Math.atan2(sitePos.y-receiver.pos.y,sitePos.x-receiver.pos.x)*180/Math.PI;
  return receiver;
}
`;
const R50_ADAPT_PLANT = '            aliveT.filter(p=>p.id!==carrier.id&&!p.dead&&!p.reassigned).forEach(p=>{const adaptivePostPlant=adaptivePostPlantGoal(p,planted,c4pos);if(adaptivePostPlant){p._adaptivePostPlant=true;p.route=[{...p.pos},{...adaptivePostPlant}];p.routeIdx=0;p.routeT=0;p.state="ROTATE";}});\n';
const R50_TACTICAL_PLANT = '            aliveCT.forEach(cp=>{const tacticalRoute=tacticalRetakeRoute(cp,tacticCT,N,c4pos);cp.reassigned=false;cp.route=tacticalRoute||(appr&&dist(cp.pos,appr)>6?[{...cp.pos},appr,{...c4pos}]:[{...cp.pos},{...c4pos}]);cp.routeIdx=0;cp.routeT=0;cp.state="RETAKE";});';
const R50_TACTICAL_LEGACY = '            aliveCT.forEach(cp=>{cp.reassigned=false;cp.route=appr&&dist(cp.pos,appr)>6?[{...cp.pos},appr,{...c4pos}]:[{...cp.pos},{...c4pos}];cp.routeIdx=0;cp.routeT=0;cp.state="RETAKE";});';
const R50_COMMS_PLANT = '            comms.push({side:"t",name:carrier.name,text:`包下了，${target==="a"?"A":"B"} 點，全員交叉！`});const bombAwareReceiver=applyCommsBombAwareness(carrier,c4pos,aliveT);if(bombAwareReceiver)comms.push({side:"t",name:bombAwareReceiver.name,text:"收到包點資訊，調整路線"});';
const R50_COMMS_LEGACY = '            comms.push({side:"t",name:carrier.name,text:`包下了，${target==="a"?"A":"B"} 點，全員交叉！`});const cov=aliveT.find(x=>x.id!==carrier.id);if(cov)comms.push({side:"t",name:cov.name,text:"收到，我架槍"});';
// R47 historical adapter: remove the three new identity consumers so R18/R34/R35/R37
// continue to inspect their locked pre-R47 source rather than silently rebaseline.
const R47_IDENTITY_HELPERS = `const MAPAWARE_BASE_RANGE=28,MAPAWARE_VIS_RANGE=0.28;
function mapAwareCanReadVisibleCandidate(p,distance,visibleCandidate){
  if(!visibleCandidate)return false;
  return distance<=MAPAWARE_BASE_RANGE+persStat(p,"vis")*MAPAWARE_VIS_RANGE;
}
const ADAPT_ROUTE_THRESHOLD=80;
function adaptiveRouteGoal(p,target,N){
  if(persStat(p,"adp")<ADAPT_ROUTE_THRESHOLD)return null;
  const goal=p.side==="t"?N[target==="a"?"aConn":"car"]:N[target==="a"?"aSite":"bSite"];
  return goal&&dist(p.pos,goal)>6?goal:null;
}
const TACTICAL_EXECUTION_THRESHOLD=90;
function tacticalRouteKeys(p,tactic,tr,RKF){
  const direct=tr[p.role];
  const fallback=tr[RKF[p.role]]||tr.rifler||tr.entry||Object.values(tr)[0]||["tSpawn"];
  return p.role==="igl"&&persStat(p,"tac")>=TACTICAL_EXECUTION_THRESHOLD&&direct?direct:tr[p.role]||fallback;
}
`;
const R47_ROUTE_KEYS = '      const routeKeys=tacticalRouteKeys(c,tactic,tr,RKF);';
const R46_ROUTE_KEYS = '      const routeKeys=tr[c.role]||tr[RKF[c.role]]||tr.rifler||tr.entry||Object.values(tr)[0]||["tSpawn"];';
const R47_ADAPT_ROUTE = `            const adaptiveGoal=adaptiveRouteGoal(p,target,N);
            if(adaptiveGoal){p.route=[{...p.pos},{...adaptiveGoal}];p.routeIdx=0;p.routeT=0;p.state="ROTATE";return;}
`;
const R47_PAIR_ADMISSION = '        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);const visibleCandidate=d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes);const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate);const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate);if(visibleCandidate&&(mapAwareT||mapAwareCT))pairs.push([tp,cp,d,mapAwareT,mapAwareCT]);}));';
const R46_PAIR_ADMISSION = '        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes))pairs.push([tp,cp,d]);}));';
const R47_PAIR_LOOP = '        for(const[tp,cp,d,mapAwareT,mapAwareCT] of ordered){';
const R46_PAIR_LOOP = '        for(const[tp,cp,d] of ordered){';
const R47_MAPAWARE_ACTION = '          const attackerMapAware=tw?mapAwareT:mapAwareCT;if(!attackerMapAware)continue;\n';

const HE_CONSTANT_ANCHOR = "const HE_R=12,HE_MAX_DAMAGE=80,HE_ARMOR_SCALE=0.72;";
const MOLLY_CONSTANT_BLOCK = `${HE_CONSTANT_ANCHOR}
// R15 functional baseline only; balance calibration requires a separate Sprint.
const MOLLY_R=4,MOLLY_TL=8,MOLLY_DAMAGE_PER_TICK=10;`;
const UTIL_R15 = '        if(source==="he"||source==="molly")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;';
const UTIL_R14 = '        if(source==="he")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;';
const CAST_R15 = '        if(weapon==="molly")casts.push(`🔥 ${at.name} 燃燒彈擊殺 ${df.name}`);else if(weapon==="he")casts.push(';
const CAST_R14 = '        if(weapon==="he")casts.push(';
const MOLLY_PROCESSOR = `      mollys.forEach((m,zoneIndex)=>{
        const sourceId=String(m.id).startsWith("mnd")?String(m.id).slice(1):null;if(!sourceId)return;
        const at=ps.find(pl=>pl.id===throwerByNadeId[sourceId]);if(!at)return;
        ps.forEach(df=>{if(df.dead||df.side===at.side)return;const d=dist(df.pos,m.pos);if(d>=MOLLY_R||lineBlocked(m.pos,df.pos,walls))return;const {killed}=applyDamage(at,df,MOLLY_DAMAGE_PER_TICK,"molly",sourceId);if(killed)finalizeKill(at,df,{weapon:"molly",distance:d,sourceId});});
      });`;
const MOLLY_SPAWN = '        if(tw.type==="molly")mollys.push({id:`m${tw.id}`,pos:{...tw.to},tl:MOLLY_TL});';
const KILLFEED_R15 = '{e.gun==="molly"?"🔥":e.gun==="he"?"💥":';
const KILLFEED_R14 = '{e.gun==="he"?"💥":';

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function replaceExact(source, from, to, label) {
  const count = occurrences(source, from);
  if (count !== 1) throw new Error(`[R15_LEGACY_${label}] expected=1 actual=${count}`);
  return source.replace(from, to);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function csR47R46Source(input) {
  let source = csR48R47Source(input);
  if (!source.includes(R47_IDENTITY_HELPERS)) return source;
  source = replaceExact(source, R47_IDENTITY_HELPERS, "", "IDENTITY_HELPERS");
  source = replaceExact(source, R47_ROUTE_KEYS, R46_ROUTE_KEYS, "TACTICAL_ROUTE");
  source = replaceExact(source, R47_ADAPT_ROUTE, "", "ADAPT_ROUTE");
  source = replaceExact(source, R47_PAIR_ADMISSION, R46_PAIR_ADMISSION, "MAPAWARE_PAIR");
  source = replaceExact(source, R47_PAIR_LOOP, R46_PAIR_LOOP, "MAPAWARE_LOOP");
  source = replaceExact(source, R47_MAPAWARE_ACTION, "", "MAPAWARE_ACTION");
  const actual = sha256(source);
  if (actual !== CS_R33_RESILIENCE_SOURCE_SHA256) {
    throw new Error(`[R47_LEGACY_R46_SHA] expected=${CS_R33_RESILIENCE_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

export function csR48R47Source(input) {
  let source = normalizeCsSource(input);
  if (!source.includes(R48_IDENTITY_HELPERS)) return source;
  source = replaceExact(source, R48_IDENTITY_HELPERS, "", "R48_IDENTITY_HELPERS");
  source = replaceExact(source, R48_ROUTE_KEYS, R47_TEAM_ROUTE_KEYS, "R48_LEADERSHIP_ROUTE");
  source = replaceExact(source, R48_COMMS_LINE, R47_COMMS_LINE, "R48_COMMS_HANDOFF");
  source = replaceExact(source, R48_SYNERGY_BLOCK, "", "R48_SYNERGY_TRADE");
  if (source.includes(R50_ADAPT_HELPER)) {
    source = replaceExact(source, R50_ADAPT_HELPER, "", "R50_ADAPT_HELPER");
    source = replaceExact(source, R50_TACTICAL_HELPER, "", "R50_TACTICAL_HELPER");
    source = replaceExact(source, R50_COMMS_HELPER, "", "R50_COMMS_HELPER");
    source = replaceExact(source, R50_ADAPT_PLANT, "", "R50_ADAPT_PLANT");
    source = replaceExact(source, R50_TACTICAL_PLANT, R50_TACTICAL_LEGACY, "R50_TACTICAL_PLANT");
    source = replaceExact(source, R50_COMMS_PLANT, R50_COMMS_LEGACY, "R50_COMMS_PLANT");
  }
  const actual = sha256(source);
  if (actual !== CS_R47_IDENTITY_SOURCE_SHA256) {
    throw new Error(`[R48_LEGACY_R47_SHA] expected=${CS_R47_IDENTITY_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

export function csR15R14Source(input) {
  let source = normalizeCsSource(input);
  if (!source.includes(MOLLY_CONSTANT_BLOCK)) return source;
  source = replaceExact(source, MOLLY_CONSTANT_BLOCK, HE_CONSTANT_ANCHOR, "MOLLY_CONSTANTS");
  source = replaceExact(source, UTIL_R15, UTIL_R14, "UTIL_LEDGER");
  source = replaceExact(source, CAST_R15, CAST_R14, "CAST_SEMANTICS");
  source = replaceExact(source, `${MOLLY_PROCESSOR}\n`, "", "MOLLY_PROCESSOR");
  source = replaceExact(source, `${MOLLY_SPAWN}\n`, "", "MOLLY_SPAWN");
  source = replaceExact(source, KILLFEED_R15, KILLFEED_R14, "KILLFEED");
  return source;
}

// R27 changes only the live defuse Decision read. R26 and older verifiers use
// the byte-exact R26 view; the focused R27 gate separately checks live source.
export function csR27R26Source(input) {
  let source = csR33R32Source(input);
  if (sha256(source) !== CS_R27_DECISION_SOURCE_SHA256) return source;
  source = replaceExact(source, R27_EFFECTIVE_DECISION_DEFUSE, R26_RAW_DECISION_DEFUSE,
    "R27_DECISION_DEFUSE_BOUNDARY");
  const actual = sha256(source);
  if (actual !== CS_R26_DECISION_SOURCE_SHA256) {
    throw new Error(`[R27_LEGACY_R26_SHA] expected=${CS_R26_DECISION_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

// R44 historical adapter: expose the exact pre-R44 source to R43/R28
// evidence. It never writes production and is a no-op for older views.
export function csR44R43Source(input) {
  let source = csR47R46Source(input);
  if (sha256(source) !== CS_R44_FOCUS_SOURCE_SHA256) return source;
  source = replaceExact(source, R29_EFFECTIVE_FOCUS_DEFUSE, R28_RAW_FOCUS_DEFUSE,
    "R44_FOCUS_DEFUSE_BOUNDARY");
  const actual = sha256(source);
  if (actual !== CS_R43_ACCURACY_SOURCE_SHA256) {
    throw new Error(`[R44_LEGACY_R43_SHA] expected=${CS_R43_ACCURACY_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

// R33 historical adapter: expose the exact R32 source to all prior verifiers
// so their locked evidence remains historical rather than silently rebased.
export function csR33R32Source(input) {
  let source = csR44R43Source(input);
  if (sha256(source) !== CS_R43_ACCURACY_SOURCE_SHA256) return source;
  source = replaceExact(source, R33_LAST_ALIVE, R32_LAST_ALIVE, "R33_LAST_ALIVE_BOUNDARY");
  source = replaceExact(source, R33_LOW_HP, R32_LOW_HP, "R33_LOW_HP_BOUNDARY");
  const actual = sha256(source);
  if (actual !== CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256) {
    throw new Error(`[R33_LEGACY_R32_SHA] expected=${CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

// R25 changes only the live headshot Accuracy read. Historical verifiers use
// the byte-exact R24 view; the focused R25 gate separately checks live source.
export function csR25R24Source(input) {
  let source = csR27R26Source(input);
  if (sha256(source) !== CS_R25_ACCURACY_SOURCE_SHA256) return source;
  source = replaceExact(source, R25_EFFECTIVE_ACCURACY_HEADSHOT, R24_RAW_ACCURACY_HEADSHOT,
    "R25_ACCURACY_HEADSHOT_BOUNDARY");
  const actual = sha256(source);
  if (actual !== CS_R19_SEMANTIC_SOURCE_SHA256) {
    throw new Error(`[R25_LEGACY_R24_SHA] expected=${CS_R19_SEMANTIC_SOURCE_SHA256} actual=${actual}`);
  }
  return source;
}

// R19 changes only the reflex semantic boundary. Legacy evidence adapters
// must view the pre-R19 source so R1-R15 historical gameplay digests remain
// byte-stable; the live source hash is still checked by each current gate.
export function csR19R15Source(input) {
  let source = csR25R24Source(input);
  if (sha256(source) !== CS_R19_SEMANTIC_SOURCE_SHA256) return source;
  source = replaceExact(source,
    'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));return t/15;} // role-fit / positioning aptitude；rxn 保留 rawReflex',
    'function posSkill(p){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(s[k]||50)*(5-i));return t/15;} // 與遊戲 posFit 一致',
    "POS_SEMANTIC_BOUNDARY");
  source = replaceExact(source,
    '  const rawReflex=Number(s.rxn??50),effectiveReflex=persStat(p,"rxn");\n  const S=k=>k==="rxn"?effectiveReflex:persStat(p,k); // live combat 使用 effectiveReflex；其他素質維持既有 effective read',
    '  const S=k=>persStat(p,k); // 個性調整後的有效素質',
    "COMBAT_S_READ");
  source = replaceExact(source,
    '  const wpn=cls==="狙擊"?(S("acc")*0.45+S("foc")*0.3+S("pos")*0.25):cls==="手槍"?(S("acc")*0.55+effectiveReflex*0.45):(S("acc")*0.42+S("apm")*0.3+effectiveReflex*0.28);',
    '  const wpn=cls==="狙擊"?(S("acc")*0.45+S("foc")*0.3+S("pos")*0.25):cls==="手槍"?(S("acc")*0.55+S("rxn")*0.45):(S("acc")*0.42+S("apm")*0.3+S("rxn")*0.28);',
    "WEAPON_REFLEX_READ");
  source = replaceExact(source,
    '  const role=posSkill(p,rawReflex); // raw role-fit；live combat 另用 effectiveReflex',
    '  const role=posSkill(p); // 定位契合（用該位置關鍵素質）',
    "POS_CALL");
  source = replaceExact(source,
    '    if(opts.entry)v+=S("cou")*0.06+effectiveReflex*0.02;        // 突破手：首發突進；effectiveReflex',
    '    if(opts.entry)v+=S("cou")*0.06+S("rxn")*0.02;              // 突破手：首發突進',
    "ENTRY_REFLEX_READ");
  return source;
}

export function csR15EvidenceSources(input) {
  const normalized = csR48R47Source(input);
  const r24 = csR25R24Source(normalized);
  const r15 = sha256(r24) === CS_R19_SEMANTIC_SOURCE_SHA256
    ? csR19R15Source(r24) : r24;
  if (sha256(r15) !== CS_R15_MOLLY_SOURCE_SHA256) return null;
  const r14 = csR15R14Source(r15);
  const actualR14 = sha256(r14);
  if (actualR14 !== CS_R14_HE_SOURCE_SHA256) {
    throw new Error(`[R15_LEGACY_R14_SHA] expected=${CS_R14_HE_SOURCE_SHA256} actual=${actualR14}`);
  }
  const legacy = csR14EvidenceSources(r14);
  if (!legacy) throw new Error("[R15_LEGACY_R14_CHAIN]");
  return Object.freeze({ r15, ...legacy });
}
