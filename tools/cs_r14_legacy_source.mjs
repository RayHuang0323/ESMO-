// Historical-view adapter for R13 and older CS evidence after R14 wires HE
// detonation into the existing damage/death ledger. It never writes production
// files and must restore the byte-exact LF-normalized R13 source.

import { createHash } from "node:crypto";
import {
  CS_R12_LF_SHA256,
  CS_R13_PLAYER_SMOKE_LF_SHA256,
  csR13R12Source,
} from "./cs_r13_legacy_source.mjs";
import { CS_R10_LF_SHA256, csR11R10Source } from "./cs_r11_legacy_source.mjs";
import { CS_R8_LEGACY_LF_SHA256, csR10LegacySource } from "./cs_r10_legacy_source.mjs";

// Keep the historical working-tree hash in cs_r13_legacy_source.mjs. R14 uses
// the canonical LF Git blob so verification is not coupled to autocrlf state.
export { CS_R13_PLAYER_SMOKE_LF_SHA256 } from "./cs_r13_legacy_source.mjs";
export const CS_R14_HE_SOURCE_SHA256 = "943cd562019f966d43bde9aa7aa05bc41cbcc2cda25a32a2556fe08bdf470720";

const HE_CONSTANT_BLOCK = `const SMOKE_R=6;
// R14 functional baseline only; balance calibration requires a separate Sprint.
const HE_R=12,HE_MAX_DAMAGE=80,HE_ARMOR_SCALE=0.72;`;
const HE_CONSTANT_ANCHOR = "const SMOKE_R=6;";
const AGG_R14 = "  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,utilDmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});";
const AGG_R13 = "  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});";
const ROUND_STATE_R14 = "    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundUtilDmg={},roundDeaths={},roundAst={},throwerByNadeId={},doorStates={};";
const ROUND_STATE_R13 = "    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundDeaths={},roundAst={},doorStates={};";
const THROW_R14 = `          const nadeId=\`nd\${fi}\${p.id}\`;
          throwables.push({id:nadeId,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});throwerByNadeId[nadeId]=p.id;`;
const THROW_R13 = '          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});';
const DAMAGE_R14 = `          const {killed}=applyDamage(at,df,dmg);
          at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=killed?1:2;`;
const DAMAGE_R13 = `          if(!df._hitters)df._hitters=[];if(!df._hitters.includes(at.id))df._hitters.push(at.id);
          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);
          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;`;
const KILL_R14 = `          if(killed)finalizeKill(at,df,{weapon:at.gun,isHS,distance:d});else if(df.hp<35&&rand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}`;
const HE_BRANCH = `        if(tw.type==="he"){const at=ps.find(pl=>pl.id===throwerByNadeId[tw.id]);if(at)ps.forEach(df=>{if(df.dead||df.side===tw.side)return;const d=dist(df.pos,tw.to);if(d>=HE_R||lineBlocked(tw.to,df.pos,walls))return;const rawDamage=Math.max(0,Math.round(HE_MAX_DAMAGE*(1-d/HE_R)));const damage=Math.round(rawDamage*(df.armor?HE_ARMOR_SCALE:1));if(damage<=0)return;const {killed}=applyDamage(at,df,damage,"he",tw.id);if(killed)finalizeKill(at,df,{weapon:"he",distance:d,sourceId:tw.id});});}`;
const AGG_DAMAGE_R14 = "        A.dmg+=Math.round(roundDmg[c.id]||0);A.utilDmg+=Math.round(roundUtilDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;";
const AGG_DAMAGE_R13 = "        A.dmg+=Math.round(roundDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;";
const RESULT_R14 = "      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:Math.round(A.utilDmg),rating};";
const RESULT_R13 = "      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:0,rating};";
const KILLFEED_R14 = '<span style={{color:e.hs?C.gold:"#aeb4be",fontSize:10}}>{e.gun==="he"?"💥":GUNS[e.gun]?.cls==="狙擊"?"🎯":GUNS[e.gun]?.cls==="衝鋒"?"🧨":"🔫"}</span>';
const KILLFEED_R13 = '<span style={{color:e.hs?C.gold:"#aeb4be",fontSize:10}}>{GUNS[e.gun]?.cls==="狙擊"?"🎯":GUNS[e.gun]?.cls==="衝鋒"?"🧨":"🔫"}</span>';

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function replaceExact(source, from, to, label) {
  const count = occurrences(source, from);
  if (count !== 1) throw new Error(`[R14_LEGACY_${label}] expected=1 actual=${count}`);
  return source.replace(from, to);
}

function restoreInlineFirearmKill(source) {
  const header = '      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{\n';
  const endMarker = "\n      };\n      if(sec===12){";
  const start = source.indexOf(header);
  const end = source.indexOf(endMarker, start + header.length);
  if (start < 0 || end < 0) throw new Error("[R14_LEGACY_KILL_HELPER]");

  const lines = source.slice(start + header.length, end).split("\n").map((line) => {
    if (!line.startsWith("        ")) throw new Error("[R14_LEGACY_KILL_INDENT]");
    return line.slice(8);
  });
  lines[0] = lines[0].replace("killReward(weapon)", "killReward(at.gun)");
  const assistLine = lines.findIndex((line) => line.startsWith("(df._hitters||[])"));
  if (assistLine < 0) throw new Error("[R14_LEGACY_ASSIST_LINE]");
  lines[assistLine] += " // 助攻";
  const eventLine = lines.findIndex((line) => line.includes('events.push({type:"kill"'));
  if (eventLine < 0) throw new Error("[R14_LEGACY_EVENT_LINE]");
  lines[eventLine] = lines[eventLine].replace("gun:weapon", "gun:at.gun");
  const castLine = lines.findIndex((line) => line.startsWith('if(weapon==="he")'));
  if (castLine < 0) throw new Error("[R14_LEGACY_CAST_LINE]");
  const firearmCast = lines[castLine].indexOf("else if(isHS)");
  if (firearmCast < 0) throw new Error("[R14_LEGACY_FIREARM_CAST]");
  lines[castLine] = `if(isHS)${lines[castLine].slice(firearmCast + "else if(isHS)".length)}`
    .replace("distance<12", "d<12")
    .replace("GUNS[weapon]?.cls", "g.cls");

  const inline = [
    `          if(df.hp<=0){${lines[0]}`,
    ...lines.slice(1).map((line) => `            ${line}`),
    '          }else if(df.hp<35&&rand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}',
  ].join("\n");
  return replaceExact(source, KILL_R14, inline, "KILL_CALL");
}

function removeSharedHelpers(source) {
  const alive = '      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);';
  const startMarker = "\n      const applyDamage=";
  const endMarker = "\n      if(sec===12){";
  const aliveIndex = source.indexOf(alive);
  const start = source.indexOf(startMarker, aliveIndex + alive.length);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (aliveIndex < 0 || start < 0 || end < 0) throw new Error("[R14_LEGACY_SHARED_HELPERS]");
  return source.slice(0, start) + source.slice(end);
}

export function normalizeCsSource(source) {
  return source.replace(/\r\n/g, "\n");
}

export function csR14R13Source(input) {
  let source = normalizeCsSource(input);
  if (!source.includes(HE_CONSTANT_BLOCK)) return source;

  source = restoreInlineFirearmKill(source);
  source = replaceExact(source, HE_CONSTANT_BLOCK, HE_CONSTANT_ANCHOR, "HE_CONSTANTS");
  source = replaceExact(source, AGG_R14, AGG_R13, "AGG");
  source = replaceExact(source, ROUND_STATE_R14, ROUND_STATE_R13, "ROUND_STATE");
  source = replaceExact(source, THROW_R14, THROW_R13, "THROW_OWNER");
  source = replaceExact(source, DAMAGE_R14, DAMAGE_R13, "DAMAGE_CALL");
  source = replaceExact(source, `${HE_BRANCH}\n`, "", "HE_BRANCH");
  source = replaceExact(source, AGG_DAMAGE_R14, AGG_DAMAGE_R13, "UTIL_AGGREGATE");
  source = replaceExact(source, RESULT_R14, RESULT_R13, "RAW_RESULT");
  source = replaceExact(source, KILLFEED_R14, KILLFEED_R13, "KILLFEED");
  return removeSharedHelpers(source);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function csR14EvidenceSources(input) {
  const r14 = normalizeCsSource(input);
  if (sha256(r14) !== CS_R14_HE_SOURCE_SHA256) return null;
  const r13 = csR14R13Source(r14);
  const r12 = csR13R12Source(r13);
  const r10 = csR11R10Source(r12);
  const r8 = csR10LegacySource(r10);
  const stages = [
    ["R13", r13, CS_R13_PLAYER_SMOKE_LF_SHA256],
    ["R12", r12, CS_R12_LF_SHA256],
    ["R10", r10, CS_R10_LF_SHA256],
    ["R8", r8, CS_R8_LEGACY_LF_SHA256],
  ];
  for (const [label, source, expected] of stages) {
    const actual = sha256(source);
    if (actual !== expected) {
      throw new Error(`[R14_LEGACY_${label}_SHA] expected=${expected} actual=${actual}`);
    }
  }
  return Object.freeze({ r14, r13, r12, r10, r8 });
}
