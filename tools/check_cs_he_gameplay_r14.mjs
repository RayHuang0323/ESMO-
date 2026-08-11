#!/usr/bin/env node
// CS HE Gameplay Integration R14
//
// Verifier-first paired migration:
// - R13 is the byte-exact historical baseline.
// - R14 adds deterministic HE damage through the same damage/death accounting.
// - Before the first positive HE effective damage, trajectory/result/RNG must
//   remain exact. Runs without effective HE damage must remain exact throughout.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R13_PLAYER_SMOKE_LF_SHA256,
  CS_R14_HE_SOURCE_SHA256,
  CS_R15_MOLLY_SOURCE_SHA256,
  csR14R13Source,
  csR15R14Source,
  normalizeCsSource,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const CONTRACT_FILE = resolve(ROOT, "src/platform/contracts/CsMatchResult.js");
const RESULT_UI_FILE = resolve(ROOT, "src/screens/fps/CsResultScreen.jsx");

const HE_SCHEMA = "CsHEGameplay.v1";
const DIGEST_SCHEMA_V5 = "CsGameplayDigest.v5";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_HE_RADIUS = 12;
const EXPECTED_HE_MAX_DAMAGE = 80;
const EXPECTED_HE_ARMOR_SCALE = 0.72;

// Deliberately manual-only. There is no capture/update/rebaseline CLI.
const EXPECTED_HE_SUITE_SHA256 = "97b42b973e9d34cf9dccf1fd53fa3ee6ad5a25345de15051e64674104ef390ab";
const EXPECTED_GAMEPLAY_SUITE_V5_SHA256 = "46952997a395f76980da25273e67d7f1e03b912247c2d5593fcfba205cd3f545";

const STAT_CASES = Object.freeze([
  { id: "reflex", shortKey: "rxn", targetId: "t1", before: 78, after: 58 },
  { id: "accuracy", shortKey: "acc", targetId: "t2", before: 88, after: 68 },
  { id: "apm", shortKey: "apm", targetId: "t1", before: 80, after: 60 },
  { id: "positioning", shortKey: "pos", targetId: "t2", before: 85, after: 65 },
  { id: "mapAware", shortKey: "vis", targetId: "t4", before: 84, after: 64 },
  { id: "tacticalIQ", shortKey: "tac", targetId: "t5", before: 88, after: 68 },
  { id: "decision", shortKey: "dec", targetId: "t4", before: 78, after: 58 },
  { id: "adaptability", shortKey: "adp", targetId: "t4", before: 83, after: 63 },
  { id: "courage", shortKey: "cou", targetId: "t1", before: 88, after: 68 },
  { id: "clutch", shortKey: "str", targetId: "t2", before: 86, after: 66 },
  { id: "focus", shortKey: "foc", targetId: "t3", before: 88, after: 68 },
  { id: "resilience", shortKey: "res", targetId: "t2", before: 84, after: 64 },
  { id: "comms", shortKey: "com", targetId: "t5", before: 90, after: 70 },
  { id: "leadership", shortKey: "led", targetId: "t5", before: 92, after: 72 },
  { id: "synergy", shortKey: "coo", targetId: "t5", before: 88, after: 68 },
  { id: "learning", shortKey: "lrn", targetId: "t2", before: 80, after: 60 },
]);

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const HE_CONSTANT_ANCHOR = "const SMOKE_R=6;";
const HE_CONSTANT_BLOCK = `${HE_CONSTANT_ANCHOR}
// R14 functional baseline only; balance calibration requires a separate Sprint.
const HE_R=12,HE_MAX_DAMAGE=80,HE_ARMOR_SCALE=0.72;`;
const AGG_MARKER = "  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});";
const AGG_REPLACEMENT = "  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,utilDmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});";
const ROUND_STATE_MARKER = "    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundDeaths={},roundAst={},doorStates={};";
const ROUND_STATE_REPLACEMENT = "    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundUtilDmg={},roundDeaths={},roundAst={},throwerByNadeId={},doorStates={};";
const ALIVE_MARKER = '      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);';
const SHARED_HELPERS = `      const applyDamage=(at,df,damage,source="firearm",sourceId=null)=>{
        if(!df._hitters)df._hitters=[];if(!df._hitters.includes(at.id))df._hitters.push(at.id);
        const hpBefore=df.hp,effectiveDamage=Math.min(damage,hpBefore);
        df.hp-=damage;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;
        if(source==="he")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;
        return{hpBefore,effectiveDamage,killed:df.hp<=0};
      };
      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{
        df.dead=true;df.hp=0;at.k++;df.d++;if(isHS)at.hsCount++;at.money+=killReward(weapon);roundKills[at.id]=(roundKills[at.id]||0)+1;roundDeaths[df.id]=1;
        (df._hitters||[]).forEach(id=>{if(id!==at.id){const ap=ps.find(x=>x.id===id);if(ap){ap.a++;roundAst[id]=(roundAst[id]||0)+1;}}});
        if(!["glock","usp"].includes(df.gun))droppedGuns.push({id:\`dg\${fi}\${df.id}\`,gun:df.gun,pos:{...df.pos}});
        if(df.hasBomb&&!planted){df.hasBomb=false;droppedBomb={pos:{...df.pos}};casts.push(\`💣 炸彈掉落！\`);}
        const isFirst=!firstKill;firstKill=true;if(isFirst)openKill={id:at.id,side:at.side};
        events.push({type:"kill",killerId:at.id,killer:at.name,killerSide:at.side,victim:df.name,gun:weapon,hs:isHS,pos:{...df.pos},firstKill:isFirst});
        const rk=roundKills[at.id];
        if(rk>=2){const ml={2:"雙殺",3:"三殺",4:"四殺",5:"團滅"};events.push({type:"multikill",player:at.name,side:at.side,count:rk,label:ml[Math.min(rk,5)]});highlights.push({fi,label:\`\${at.name} \${ml[Math.min(rk,5)]}\`});}
        if(weapon==="he")casts.push(\`💥 \${at.name} 高爆彈擊殺 \${df.name}！\`);else if(isHS)casts.push(\`💀 \${at.name} 爆頭擊殺 \${df.name}！\`);else if(isFirst)casts.push(\`🔫 \${at.name} 取得首殺，拿下開局優勢\`);else if(distance<12)casts.push(\`\${at.name} 近距離擊殺 \${df.name}\`);else if(GUNS[weapon]?.cls==="狙擊")casts.push(\`🎯 \${at.name} 一槍狙掉 \${df.name}\`);else if(rand()<0.4)casts.push(\`\${at.name} 擊殺 \${df.name}\`);
        if(rand()<0.4)comms.push({side:at.side,name:at.name,text:rk>=2?"清掉了，跟上！":isHS?"爆頭收掉":\`收一個，剩 \${df.side==="t"?aliveT.length-1:aliveCT.length-1} 個\`});
        const sameTeam=ps.filter(x=>x.side===df.side&&!x.dead&&!x.reassigned);
        if(sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){taker.route=[taker.pos,goal];taker.routeIdx=0;taker.routeT=0;casts.push(\`🔄 \${taker.name} 接管 \${df.name} 的位置\`);}}
      };`;
const THROW_MARKER = '          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});';
const THROW_REPLACEMENT = `          const nadeId=\`nd\${fi}\${p.id}\`;
          throwables.push({id:nadeId,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});throwerByNadeId[nadeId]=p.id;`;
const DAMAGE_MARKER = `          if(!df._hitters)df._hitters=[];if(!df._hitters.includes(at.id))df._hitters.push(at.id);
          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);
          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;`;
const DAMAGE_REPLACEMENT = `          const {killed}=applyDamage(at,df,dmg);
          at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=killed?1:2;`;
const KILL_MARKER = `          if(df.hp<=0){df.dead=true;df.hp=0;at.k++;df.d++;if(isHS)at.hsCount++;at.money+=killReward(at.gun);roundKills[at.id]=(roundKills[at.id]||0)+1;roundDeaths[df.id]=1;
            (df._hitters||[]).forEach(id=>{if(id!==at.id){const ap=ps.find(x=>x.id===id);if(ap){ap.a++;roundAst[id]=(roundAst[id]||0)+1;}}}); // 助攻
            if(!["glock","usp"].includes(df.gun))droppedGuns.push({id:\`dg\${fi}\${df.id}\`,gun:df.gun,pos:{...df.pos}});
            if(df.hasBomb&&!planted){df.hasBomb=false;droppedBomb={pos:{...df.pos}};casts.push(\`💣 炸彈掉落！\`);}
            const isFirst=!firstKill;firstKill=true;if(isFirst)openKill={id:at.id,side:at.side};
            events.push({type:"kill",killerId:at.id,killer:at.name,killerSide:at.side,victim:df.name,gun:at.gun,hs:isHS,pos:{...df.pos},firstKill:isFirst});
            const rk=roundKills[at.id];
            if(rk>=2){const ml={2:"雙殺",3:"三殺",4:"四殺",5:"團滅"};events.push({type:"multikill",player:at.name,side:at.side,count:rk,label:ml[Math.min(rk,5)]});highlights.push({fi,label:\`\${at.name} \${ml[Math.min(rk,5)]}\`});}
            if(isHS)casts.push(\`💀 \${at.name} 爆頭擊殺 \${df.name}！\`);else if(isFirst)casts.push(\`🔫 \${at.name} 取得首殺，拿下開局優勢\`);else if(d<12)casts.push(\`\${at.name} 近距離擊殺 \${df.name}\`);else if(g.cls==="狙擊")casts.push(\`🎯 \${at.name} 一槍狙掉 \${df.name}\`);else if(rand()<0.4)casts.push(\`\${at.name} 擊殺 \${df.name}\`);
            if(rand()<0.4)comms.push({side:at.side,name:at.name,text:rk>=2?"清掉了，跟上！":isHS?"爆頭收掉":\`收一個，剩 \${df.side==="t"?aliveT.length-1:aliveCT.length-1} 個\`});
            const sameTeam=ps.filter(x=>x.side===df.side&&!x.dead&&!x.reassigned);
            if(sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){taker.route=[taker.pos,goal];taker.routeIdx=0;taker.routeT=0;casts.push(\`🔄 \${taker.name} 接管 \${df.name} 的位置\`);}}
          }else if(df.hp<35&&rand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}`;
const KILL_REPLACEMENT = `          if(killed)finalizeKill(at,df,{weapon:at.gun,isHS,distance:d});else if(df.hp<35&&rand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}`;
const FLASH_MARKER = '        if(tw.type==="flash"){ps.forEach(pl=>{if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;pl.flash=Math.max(pl.flash,enemy?(d<12?6:4):(d<8?3:0));}});}';
const SMOKE_MARKER = '        if(tw.type==="smoke")smokes.push({id:`s${tw.id}`,pos:{...tw.to},tl:18,age:0});';
const HE_BRANCH = `        if(tw.type==="he"){const at=ps.find(pl=>pl.id===throwerByNadeId[tw.id]);if(at)ps.forEach(df=>{if(df.dead||df.side===tw.side)return;const d=dist(df.pos,tw.to);if(d>=HE_R||lineBlocked(tw.to,df.pos,walls))return;const rawDamage=Math.max(0,Math.round(HE_MAX_DAMAGE*(1-d/HE_R)));const damage=Math.round(rawDamage*(df.armor?HE_ARMOR_SCALE:1));if(damage<=0)return;const {killed}=applyDamage(at,df,damage,"he",tw.id);if(killed)finalizeKill(at,df,{weapon:"he",distance:d,sourceId:tw.id});});}`;
const AGG_DAMAGE_MARKER = "        A.dmg+=Math.round(roundDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;";
const AGG_DAMAGE_REPLACEMENT = "        A.dmg+=Math.round(roundDmg[c.id]||0);A.utilDmg+=Math.round(roundUtilDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;";
const RESULT_MARKER = "      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:0,rating};";
const RESULT_REPLACEMENT = "      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:Math.round(A.utilDmg),rating};";
const KILLFEED_MARKER = '<span style={{color:e.hs?C.gold:"#aeb4be",fontSize:10}}>{GUNS[e.gun]?.cls==="狙擊"?"🎯":GUNS[e.gun]?.cls==="衝鋒"?"🧨":"🔫"}</span>';
const KILLFEED_REPLACEMENT = '<span style={{color:e.hs?C.gold:"#aeb4be",fontSize:10}}>{e.gun==="he"?"💥":GUNS[e.gun]?.cls==="狙擊"?"🎯":GUNS[e.gun]?.cls==="衝鋒"?"🧨":"🔫"}</span>';

const FRAME_END_MARKER = "      fi++;if(roundEnd)break;";
const ROUND_ACCOUNT_MARKER = "    const _rnds=rnd+1;";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function normalizeLf(text) {
  return text.replace(/\r\n/g, "\n");
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function replaceOnce(source, marker, replacement, code) {
  gate(occurrences(source, marker) === 1, code, marker.slice(0, 180));
  return source.replace(marker, replacement);
}

function buildCandidateSource(r13Source) {
  let source = normalizeLf(r13Source);
  source = replaceOnce(source, HE_CONSTANT_ANCHOR, HE_CONSTANT_BLOCK, "HE_CONSTANT_ANCHOR");
  source = replaceOnce(source, AGG_MARKER, AGG_REPLACEMENT, "AGG_MARKER");
  source = replaceOnce(source, ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT, "ROUND_STATE_MARKER");
  source = replaceOnce(source, ALIVE_MARKER, `${ALIVE_MARKER}\n${SHARED_HELPERS}`, "ALIVE_MARKER");
  source = replaceOnce(source, THROW_MARKER, THROW_REPLACEMENT, "THROW_MARKER");
  source = replaceOnce(source, DAMAGE_MARKER, DAMAGE_REPLACEMENT, "DAMAGE_MARKER");
  source = replaceOnce(source, KILL_MARKER, KILL_REPLACEMENT, "KILL_MARKER");
  source = replaceOnce(source, SMOKE_MARKER, `${HE_BRANCH}\n${SMOKE_MARKER}`, "SMOKE_MARKER");
  source = replaceOnce(source, AGG_DAMAGE_MARKER, AGG_DAMAGE_REPLACEMENT, "AGG_DAMAGE_MARKER");
  source = replaceOnce(source, RESULT_MARKER, RESULT_REPLACEMENT, "RESULT_MARKER");
  source = replaceOnce(source, KILLFEED_MARKER, KILLFEED_REPLACEMENT, "KILLFEED_MARKER");
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "CANDIDATE_RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(source).length}`);
  gate(occurrences(source, HE_BRANCH) === 1, "CANDIDATE_HE_BRANCH_COUNT");
  return source;
}

function canonicalValue(value, { gameplay = false, rejectUndefined = true } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", key);
    if (Object.is(value, -0)) return 0;
    if (gameplay && ["x", "y", "routeT", "t", "distance"].includes(key)) {
      return Math.round(value * 1e6) / 1e6;
    }
    return value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", key);
    return undefined;
  }
  gate(value && typeof value === "object", "UNSUPPORTED_VALUE", `${key}:${typeof value}`);
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(
      item, { gameplay, rejectUndefined }, `${key}[${index}]`,
    ));
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options) {
  return JSON.stringify(canonicalValue(value, options));
}

function firstDifference(left, right, path = "") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, baseline: left, candidate: right };
    if (left.length !== right.length) {
      return { path: `${path}.length`, baseline: left.length, candidate: right.length };
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const difference = firstDifference(left[key], right[key], path ? `${path}.${key}` : key);
      if (difference) return difference;
    }
    return null;
  }
  return { path, baseline: left, candidate: right };
}

function clonePlain(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

const APPLY_HOOK_MARKER = `        if(source==="he")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;
        return{hpBefore,effectiveDamage,killed:df.hp<=0};`;
const APPLY_HOOK_REPLACEMENT = `        if(source==="he")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;
        __measure?.recordDamage({round:rnd+1,sec,source,sourceId,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,damage,hpBefore,effectiveDamage,hpAfter:df.hp,killed:df.hp<=0,armor:Boolean(df.armor),hitters:[...(df._hitters||[])],rngCount:__r14RngCount});
        return{hpBefore,effectiveDamage,killed:df.hp<=0};`;
const KILL_HOOK_START = `      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{
        df.dead=true;`;
const KILL_HOOK_START_REPLACEMENT = `      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{
        const __r14MoneyBefore=at.money;
        df.dead=true;`;
const KILL_HOOK_END = `        if(sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){taker.route=[taker.pos,goal];taker.routeIdx=0;taker.routeT=0;casts.push(\`🔄 \${taker.name} 接管 \${df.name} 的位置\`);}}
      };`;
const KILL_HOOK_END_REPLACEMENT = `        if(sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){taker.route=[taker.pos,goal];taker.routeIdx=0;taker.routeT=0;casts.push(\`🔄 \${taker.name} 接管 \${df.name} 的位置\`);}}
        __measure?.recordKill({round:rnd+1,sec,sourceId,weapon,attackerId:at.id,defenderId:df.id,isHS,moneyBefore:__r14MoneyBefore,moneyAfter:at.money,attackerKills:roundKills[at.id]||0,defenderDeaths:roundDeaths[df.id]||0,assistIds:(df._hitters||[]).filter(id=>id!==at.id),killEvent:[...events].reverse().find(event=>event.type==="kill")||null,rngCount:__r14RngCount});
      };`;

function instrumentSource(source, variant) {
  let code = normalizeLf(source);
  code = replaceOnce(
    code,
    SIGNATURE_MARKER,
    "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){",
    `SIGNATURE_${variant}`,
  );
  code = replaceOnce(
    code,
    RNG_MARKER,
    "const map=MAPS[mapKey];const __r14RawRand=mkRng(seed);let __r14RngCount=0;const rand=()=>{const value=__r14RawRand();__r14RngCount++;__measure?.recordRng(__r14RngCount,value);return value;};",
    `RNG_${variant}`,
  );

  if (variant === "baseline") {
    code = replaceOnce(
      code,
      THROW_MARKER,
      `${THROW_MARKER}
          if(nt==="he")__measure?.recordThrow({round:rnd+1,sec,throwableId:\`nd\${fi}\${p.id}\`,throwerId:p.id,side:p.side,from:{...p.pos},to:{...land},rngCount:__r14RngCount});`,
      "BASELINE_THROW",
    );
  } else {
    code = replaceOnce(
      code,
      THROW_REPLACEMENT,
      `${THROW_REPLACEMENT}
          if(nt==="he")__measure?.recordThrow({round:rnd+1,sec,throwableId:nadeId,throwerId:p.id,side:p.side,from:{...p.pos},to:{...land},rngCount:__r14RngCount});`,
      "CANDIDATE_THROW",
    );
  }

  const detonationHook = `        if(tw.type==="he")__measure?.recordDetonation({round:rnd+1,sec,throwableId:tw.id,side:tw.side,to:{...tw.to},rngCount:__r14RngCount,players:ps.map(pl=>({id:pl.id,side:pl.side,hp:pl.hp,armor:Boolean(pl.armor),dead:pl.dead,pos:{...pl.pos},dmgDealt:pl.dmgDealt||0,k:pl.k,d:pl.d,a:pl.a,money:pl.money,gun:pl.gun,hasBomb:Boolean(pl.hasBomb),hitters:[...(pl._hitters||[])]})),roundDmg:{...roundDmg},roundKills:{...roundKills},roundDeaths:{...roundDeaths},roundAst:{...roundAst}});`;
  code = replaceOnce(code, FLASH_MARKER, `${FLASH_MARKER}\n${detonationHook}`, `DETONATION_${variant}`);

  code = replaceOnce(
    code,
    FRAME_END_MARKER,
    `      __measure?.recordFrame(frames[frames.length-1]);
${FRAME_END_MARKER}`,
    `FRAME_${variant}`,
  );
  const roundUtil = variant === "candidate" ? "{...roundUtilDmg}" : "{}";
  code = replaceOnce(
    code,
    ROUND_ACCOUNT_MARKER,
    `    __measure?.recordRound({round:rnd+1,roundDmg:{...roundDmg},roundUtilDmg:${roundUtil},roundKills:{...roundKills},roundDeaths:{...roundDeaths},roundAst:{...roundAst},players:ps.map(p=>({id:p.id,hp:p.hp,dead:p.dead,dmgDealt:p.dmgDealt||0,k:p.k,d:p.d,a:p.a,money:p.money}))});
${ROUND_ACCOUNT_MARKER}`,
    `ROUND_${variant}`,
  );

  if (variant === "candidate") {
    code = replaceOnce(code, APPLY_HOOK_MARKER, APPLY_HOOK_REPLACEMENT, "APPLY_HOOK");
    code = replaceOnce(code, KILL_HOOK_START, KILL_HOOK_START_REPLACEMENT, "KILL_HOOK_START");
    code = replaceOnce(code, KILL_HOOK_END, KILL_HOOK_END_REPLACEMENT, "KILL_HOOK_END");
  }

  code = replaceOnce(
    code,
    RETURN_MARKER,
    "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };",
    `RETURN_${variant}`,
  );
  code = replaceOnce(
    code,
    EXPORT_MARKER,
    `const __CS_HE_GAMEPLAY_R14_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});
export { EsportsFPS3D, buildMatchResult, __CS_HE_GAMEPLAY_R14_TEST_API__ };`,
    `EXPORT_${variant}`,
  );
  gate(randTokens(code).length === EXPECTED_RAND_CALLS, "INSTRUMENTED_RAND_COUNT",
    `variant=${variant} actual=${randTokens(code).length}`);
  return code;
}

function createCollector() {
  const data = {
    rng: [],
    throws: [],
    detonations: [],
    damages: [],
    kills: [],
    rounds: [],
    frames: [],
  };
  function record(target, event) {
    canonicalJson(event, { gameplay: true, rejectUndefined: true });
    target.push(structuredClone(event));
  }
  return {
    ...data,
    recordRng(index, value) { record(data.rng, { index, value }); },
    recordThrow(event) { record(data.throws, event); },
    recordDetonation(event) { record(data.detonations, event); },
    recordDamage(event) { record(data.damages, event); },
    recordKill(event) { record(data.kills, event); },
    recordRound(event) { record(data.rounds, event); },
    recordFrame(event) { record(data.frames, event); },
  };
}

function collectorProjection(collector) {
  return {
    rng: collector.rng,
    throws: collector.throws,
    detonations: collector.detonations,
    damages: collector.damages,
    kills: collector.kills,
    rounds: collector.rounds,
    frames: collector.frames,
  };
}

function runOnce(api, scenario) {
  const collector = createCollector();
  const sim = api.simulateFps(
    scenario.mapKey,
    clonePlain(scenario.tTactic),
    clonePlain(scenario.ctTactic),
    scenario.seed,
    clonePlain(scenario.roster),
    collector,
  );
  const simJson = canonicalJson(sim, { gameplay: true, rejectUndefined: true });
  const rngJson = canonicalJson(collector.rng, { gameplay: true, rejectUndefined: true });
  const collectorJson = canonicalJson(collectorProjection(collector), {
    gameplay: true,
    rejectUndefined: true,
  });
  return {
    sim,
    collector,
    simJson,
    rngJson,
    collectorJson,
    simDigest: sha256(simJson),
    rngDigest: sha256(rngJson),
    evidenceDigest: sha256(collectorJson),
  };
}

function runDeterministic(api, scenario, label) {
  const first = runOnce(api, scenario);
  const second = runOnce(api, scenario);
  gate(first.simJson === second.simJson, "CANDIDATE_NONDETERMINISTIC_SIM", label);
  gate(first.rngJson === second.rngJson, "CANDIDATE_NONDETERMINISTIC_RNG", label);
  gate(first.collectorJson === second.collectorJson, "CANDIDATE_NONDETERMINISTIC_EVIDENCE", label);
  return first;
}

function eventKey(event) {
  return `${event.round}|${event.sec}|${event.throwableId}`;
}

function damageKey(event) {
  return `${event.round}|${event.sec}|${event.sourceId}|${event.defenderId}`;
}

function beforeTick(item, boundary) {
  return item.round < boundary.round || (item.round === boundary.round && item.sec < boundary.sec);
}

function upToEvent(events, boundaryEvent) {
  const index = events.findIndex((event) => eventKey(event) === eventKey(boundaryEvent));
  gate(index >= 0, "BOUNDARY_EVENT_MISSING", eventKey(boundaryEvent));
  return events.slice(0, index + 1);
}

function frameBeforeBoundary(frames, boundary) {
  return frames.filter((frame) => frame.rnd + 1 < boundary.round
    || (frame.rnd + 1 === boundary.round && frame.roundSec < boundary.sec));
}

function validateDamageAccounting(run, scenario) {
  const { collector, sim } = run;
  const throwByKey = new Map(collector.throws.map((event) => [
    `${event.round}|${event.throwableId}`,
    event,
  ]));
  const detonationByKey = new Map(collector.detonations.map((event) => [eventKey(event), event]));
  const heDamages = collector.damages.filter((event) => event.source === "he");
  const heKills = collector.kills.filter((event) => event.weapon === "he");
  const label = `case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`;

  for (const event of collector.damages) {
    gate(event.effectiveDamage === Math.min(event.damage, event.hpBefore),
      "EFFECTIVE_DAMAGE_ACCOUNTING", `${label} ${damageKey(event)}`);
    gate(event.hpAfter === event.hpBefore - event.damage,
      "HP_DAMAGE_ACCOUNTING", `${label} ${damageKey(event)}`);
    gate(event.killed === (event.hpAfter <= 0), "DAMAGE_LETHAL_FLAG", `${label} ${damageKey(event)}`);
  }

  for (const event of heDamages) {
    const throwEvent = throwByKey.get(`${event.round}|${event.sourceId}`);
    const detonation = detonationByKey.get(`${event.round}|${event.sec}|${event.sourceId}`);
    gate(Boolean(throwEvent), "HE_THROW_ATTRIBUTION_MISSING", `${label} ${damageKey(event)}`);
    gate(Boolean(detonation), "HE_DETONATION_ATTRIBUTION_MISSING", `${label} ${damageKey(event)}`);
    gate(event.attackerId === throwEvent.throwerId, "HE_THROWER_ATTRIBUTION", `${label} ${damageKey(event)}`);
    gate(event.attackerSide === throwEvent.side && event.defenderSide !== event.attackerSide,
      "HE_ENEMY_ONLY_DAMAGE", `${label} ${damageKey(event)}`);
    const target = detonation.players.find((player) => player.id === event.defenderId);
    gate(target && !target.dead, "HE_TARGET_NOT_LIVE", `${label} ${damageKey(event)}`);
    const distance = Math.hypot(target.pos.x - detonation.to.x, target.pos.y - detonation.to.y);
    gate(distance < EXPECTED_HE_RADIUS, "HE_RADIUS_GATE", `${label} distance=${distance}`);
    gate(target.hp === event.hpBefore, "HE_HP_BEFORE_ATTRIBUTION", `${label} ${damageKey(event)}`);
    gate(target.armor === event.armor, "HE_ARMOR_ATTRIBUTION", `${label} ${damageKey(event)}`);
    const rawDamage = Math.max(0, Math.round(
      EXPECTED_HE_MAX_DAMAGE * (1 - distance / EXPECTED_HE_RADIUS),
    ));
    const expectedDamage = Math.round(
      rawDamage * (target.armor ? EXPECTED_HE_ARMOR_SCALE : 1),
    );
    gate(event.damage === expectedDamage && expectedDamage > 0,
      "HE_DAMAGE_FORMULA", `${label} expected=${expectedDamage} actual=${event.damage}`);
  }

  for (const round of collector.rounds) {
    const ids = round.players.map((player) => player.id);
    for (const id of ids) {
      const totalDamage = collector.damages
        .filter((event) => event.round === round.round && event.attackerId === id)
        .reduce((sum, event) => sum + event.effectiveDamage, 0);
      const utilityDamage = collector.damages
        .filter((event) => event.round === round.round && event.attackerId === id
          && event.source === "he")
        .reduce((sum, event) => sum + event.effectiveDamage, 0);
      const kills = collector.kills
        .filter((event) => event.round === round.round && event.attackerId === id).length;
      const deaths = collector.kills
        .filter((event) => event.round === round.round && event.defenderId === id).length;
      const assists = collector.kills
        .filter((event) => event.round === round.round && event.assistIds.includes(id)).length;
      gate((round.roundDmg[id] ?? 0) === totalDamage,
        "ROUND_DAMAGE_LEDGER", `${label} round=${round.round} player=${id}`);
      gate((round.roundUtilDmg[id] ?? 0) === utilityDamage,
        "ROUND_UTIL_DAMAGE_LEDGER", `${label} round=${round.round} player=${id}`);
      gate((round.roundKills[id] ?? 0) === kills,
        "ROUND_KILL_LEDGER", `${label} round=${round.round} player=${id}`);
      gate((round.roundDeaths[id] ?? 0) === deaths,
        "ROUND_DEATH_LEDGER", `${label} round=${round.round} player=${id}`);
      gate((round.roundAst[id] ?? 0) === assists,
        "ROUND_ASSIST_LEDGER", `${label} round=${round.round} player=${id}`);
    }
  }

  for (const player of sim.players) {
    const allDamage = collector.damages
      .filter((event) => event.attackerId === player.id)
      .reduce((sum, event) => sum + event.effectiveDamage, 0);
    const utilityDamage = heDamages
      .filter((event) => event.attackerId === player.id)
      .reduce((sum, event) => sum + event.effectiveDamage, 0);
    gate(player.adr === Math.round(allDamage / sim.rounds),
      "RESULT_ADR_LEDGER", `${label} player=${player.id}`);
    gate(player.utilDmg === utilityDamage,
      "RESULT_UTIL_DAMAGE_LEDGER", `${label} player=${player.id}`);
  }

  for (const kill of heKills) {
    gate(kill.moneyAfter - kill.moneyBefore === 300,
      "HE_KILL_ECONOMY", `${label} round=${kill.round} defender=${kill.defenderId}`);
    gate(kill.killEvent?.gun === "he" && kill.killEvent?.hs === false,
      "HE_KILL_EVENT_SEMANTICS", `${label} round=${kill.round} defender=${kill.defenderId}`);
    const damage = heDamages.find((event) => event.round === kill.round
      && event.sec === kill.sec && event.sourceId === kill.sourceId
      && event.defenderId === kill.defenderId);
    gate(damage?.killed, "HE_KILL_WITHOUT_LETHAL_DAMAGE",
      `${label} round=${kill.round} defender=${kill.defenderId}`);
  }

  return {
    throws: collector.throws.length,
    detonations: collector.detonations.length,
    damageEvents: heDamages.length,
    effectiveDamage: heDamages.reduce((sum, event) => sum + event.effectiveDamage, 0),
    kills: heKills.length,
    assists: heKills.reduce((sum, event) => sum + event.assistIds.length, 0),
    damageEvidenceSha256: sha256(canonicalJson({
      throws: collector.throws,
      detonations: collector.detonations,
      damages: heDamages,
      kills: heKills,
      rounds: collector.rounds,
    }, { gameplay: true, rejectUndefined: true })),
  };
}

function validateCausalPair(baseline, candidate, scenario) {
  const firstDamage = candidate.collector.damages.find((event) => event.source === "he") ?? null;
  const label = `case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`;
  if (!firstDamage) {
    gate(baseline.simJson === candidate.simJson, "ZERO_HE_DAMAGE_TRAJECTORY_DIFF", label);
    gate(baseline.rngJson === candidate.rngJson, "ZERO_HE_DAMAGE_RNG_DIFF", label);
    gate(canonicalJson(baseline.collector.throws, { gameplay: true })
      === canonicalJson(candidate.collector.throws, { gameplay: true }),
    "ZERO_HE_DAMAGE_THROW_DIFF", label);
    gate(canonicalJson(baseline.collector.detonations, { gameplay: true })
      === canonicalJson(candidate.collector.detonations, { gameplay: true }),
    "ZERO_HE_DAMAGE_DETONATION_DIFF", label);
  } else {
    const candidateDetonation = candidate.collector.detonations.find((event) => (
      event.round === firstDamage.round
      && event.sec === firstDamage.sec
      && event.throwableId === firstDamage.sourceId
    ));
    gate(Boolean(candidateDetonation), "CANDIDATE_BOUNDARY_DETONATION_MISSING", label);
    const baselineDetonation = baseline.collector.detonations.find((event) => (
      eventKey(event) === eventKey(candidateDetonation)
    ));
    gate(Boolean(baselineDetonation), "BASELINE_BOUNDARY_DETONATION_MISSING", label);
    const baselineBoundaryJson = canonicalJson(baselineDetonation, { gameplay: true });
    const candidateBoundaryJson = canonicalJson(candidateDetonation, { gameplay: true });
    gate(baselineBoundaryJson === candidateBoundaryJson,
      "PRE_BOUNDARY_HE_STATE_DIFF",
      `${label}\n${canonicalJson(firstDifference(
        JSON.parse(baselineBoundaryJson),
        JSON.parse(candidateBoundaryJson),
      ))}`);

    const baselineFrames = canonicalJson(
      frameBeforeBoundary(baseline.collector.frames, firstDamage),
      { gameplay: true },
    );
    const candidateFrames = canonicalJson(
      frameBeforeBoundary(candidate.collector.frames, firstDamage),
      { gameplay: true },
    );
    gate(baselineFrames === candidateFrames,
      "PRE_BOUNDARY_FRAME_DIFF",
      `${label}\n${canonicalJson(firstDifference(
        JSON.parse(baselineFrames),
        JSON.parse(candidateFrames),
      ))}`);

    const baselineFrame = baseline.collector.frames.find((frame) => (
      frame.rnd + 1 === firstDamage.round && frame.roundSec === firstDamage.sec
    ));
    const candidateFrame = candidate.collector.frames.find((frame) => (
      frame.rnd + 1 === firstDamage.round && frame.roundSec === firstDamage.sec
    ));
    gate(Boolean(baselineFrame) && Boolean(candidateFrame), "BOUNDARY_FRAME_MISSING", label);
    gate(canonicalJson(
      baseline.sim.roundHist.slice(0, firstDamage.round - 1),
      { gameplay: true },
    ) === canonicalJson(
      candidate.sim.roundHist.slice(0, firstDamage.round - 1),
      { gameplay: true },
    ), "PRE_BOUNDARY_ROUND_HISTORY_DIFF", label);
    gate(canonicalJson(
      baseline.sim.highlights.filter((item) => item.fi < baselineFrame.fi),
      { gameplay: true },
    ) === canonicalJson(
      candidate.sim.highlights.filter((item) => item.fi < candidateFrame.fi),
      { gameplay: true },
    ), "PRE_BOUNDARY_HIGHLIGHT_DIFF", label);

    const boundaryRngCount = candidateDetonation.rngCount;
    gate(canonicalJson(
      baseline.collector.rng.slice(0, boundaryRngCount),
      { gameplay: true },
    ) === canonicalJson(
      candidate.collector.rng.slice(0, boundaryRngCount),
      { gameplay: true },
    ), "PRE_BOUNDARY_RNG_DIFF", label);
    gate(canonicalJson(upToEvent(
      baseline.collector.detonations,
      baselineDetonation,
    ), { gameplay: true }) === canonicalJson(upToEvent(
      candidate.collector.detonations,
      candidateDetonation,
    ), { gameplay: true }), "PRE_BOUNDARY_DETONATION_DIFF", label);
    gate(canonicalJson(
      baseline.collector.throws.filter((event) => beforeTick(event, firstDamage)
        || (event.round === firstDamage.round && event.sec === firstDamage.sec)),
      { gameplay: true },
    ) === canonicalJson(
      candidate.collector.throws.filter((event) => beforeTick(event, firstDamage)
        || (event.round === firstDamage.round && event.sec === firstDamage.sec)),
      { gameplay: true },
    ), "PRE_BOUNDARY_THROW_DIFF", label);
  }

  return {
    firstEffectiveHEDamage: firstDamage ? {
      round: firstDamage.round,
      sec: firstDamage.sec,
      throwableId: firstDamage.sourceId,
      attackerId: firstDamage.attackerId,
      defenderId: firstDamage.defenderId,
      damage: firstDamage.damage,
      effectiveDamage: firstDamage.effectiveDamage,
      rngCount: firstDamage.rngCount,
    } : null,
    baselineGameplayDigest: baseline.simDigest,
    baselineRngCount: baseline.collector.rng.length,
    baselineRngDigest: baseline.rngDigest,
    candidateGameplayDigest: candidate.simDigest,
    candidateRngCount: candidate.collector.rng.length,
    candidateRngDigest: candidate.rngDigest,
    zeroDiffWithoutEffectiveDamage: firstDamage === null,
  };
}

function outcomeProjection(sim) {
  return {
    ctScore: sim.ctScore,
    tScore: sim.tScore,
    rounds: sim.rounds,
    roundHist: sim.roundHist,
    players: sim.players.map((player) => ({
      id: player.id,
      k: player.k,
      d: player.d,
      a: player.a,
      adr: player.adr,
      utilDmg: player.utilDmg,
      rating: player.rating,
    })),
  };
}

function treatmentRoster(api, statCase) {
  const roster = clonePlain(api.ROSTER);
  const target = roster.find((player) => player.id === statCase.targetId);
  gate(target?.stats?.[statCase.shortKey] === statCase.before,
    "TREATMENT_BEFORE_MISMATCH", statCase.id);
  target.stats[statCase.shortKey] = statCase.after;
  deepFreeze(roster);
  return roster;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R14 has no capture, update, rebaseline, seed, treatment, or calibration flags.");
  gate(STAT_CASES.length === 16, "TREATMENT_MATRIX_SIZE", String(STAT_CASES.length));
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  gate(sha256(canonicalJson(FIXED_SEEDS)) === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const normalizedSource = normalizeCsSource(originalSource);
  const sourceSha256 = sha256(normalizedSource);
  const sourceStage = sourceSha256 === CS_R15_MOLLY_SOURCE_SHA256 ? "r15-molly"
    : sourceSha256 === CS_R14_HE_SOURCE_SHA256 ? "r14-he"
    : sourceSha256 === CS_R13_PLAYER_SMOKE_LF_SHA256 ? "r13-verifier-first" : null;
  gate(sourceStage, "SOURCE_PROVENANCE_MISMATCH",
    `expected R13 LF=${CS_R13_PLAYER_SMOKE_LF_SHA256}\nexpected R14=${CS_R14_HE_SOURCE_SHA256}\nexpected R15=${CS_R15_MOLLY_SOURCE_SHA256}\nactual=${sourceSha256}`);
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);

  const r14Source = sourceStage === "r15-molly" ? csR15R14Source(normalizedSource) : normalizedSource;
  const r13Source = sourceStage === "r13-verifier-first" ? normalizedSource : csR14R13Source(r14Source);
  gate(sha256(r13Source) === CS_R13_PLAYER_SMOKE_LF_SHA256, "R14_R13_ADAPTER_MISMATCH",
    `expected=${CS_R13_PLAYER_SMOKE_LF_SHA256}\nactual=${sha256(r13Source)}`);
  const expectedCandidateSource = buildCandidateSource(r13Source);
  if (sourceStage !== "r13-verifier-first") {
    gate(r14Source === expectedCandidateSource, "PRODUCTION_CANDIDATE_MISMATCH");
  }
  const candidateSource = sourceStage === "r13-verifier-first" ? expectedCandidateSource : r14Source;
  const contractSource = readFileSync(CONTRACT_FILE, "utf8");
  const resultUiSource = readFileSync(RESULT_UI_FILE, "utf8");
  gate(!contractSource.includes("utilDmg"), "CS_MATCH_RESULT_CONTRACT_SCOPE_EXPANDED");
  gate(!resultUiSource.includes("utilDmg"), "CS_RESULT_UI_SCOPE_EXPANDED");
  gate(candidateSource.includes("// R14 functional baseline only; balance calibration requires a separate Sprint."),
    "FUNCTIONAL_BASELINE_LABEL_MISSING");
  gate(candidateSource.includes(HE_CONSTANT_BLOCK), "HE_FUNCTIONAL_CONSTANTS");
  gate(candidateSource.includes(RESULT_REPLACEMENT), "RAW_UTIL_DAMAGE_READ_CHAIN");
  gate(candidateSource.includes(KILLFEED_REPLACEMENT), "HE_KILLFEED_SEMANTICS");

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-he-r14-"));
  let vite = null;
  let transformSeen = 0;
  try {
    vite = await createServer({
      root: ROOT,
      configFile: false,
      envFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-he-gameplay-r14-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r14=baseline") ? "baseline"
            : query.includes("cs-r14=candidate") ? "candidate" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          return {
            code: instrumentSource(variant === "baseline" ? r13Source : candidateSource, variant),
            map: null,
          };
        },
      }],
    });

    const baselineModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r14=baseline`);
    const candidateModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r14=candidate`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", String(transformSeen));
    const baselineApi = baselineModule.__CS_HE_GAMEPLAY_R14_TEST_API__;
    const candidateApi = candidateModule.__CS_HE_GAMEPLAY_R14_TEST_API__;
    for (const api of [baselineApi, candidateApi]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(candidateApi.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(candidateApi.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    const neutralRoster = clonePlain(candidateApi.ROSTER);
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);
    deepFreeze(neutralRoster);
    const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, neutralRoster }));

    const heRecords = [];
    for (const seed of FIXED_SEEDS) {
      const scenario = { seed, mapKey, tTactic, ctTactic, roster: neutralRoster };
      const baseline = runOnce(baselineApi, scenario);
      const candidate = runDeterministic(candidateApi, scenario, "neutral-candidate");
      const accounting = validateDamageAccounting(candidate, scenario);
      const migration = validateCausalPair(baseline, candidate, scenario);
      heRecords.push({
        seed,
        trajectorySha256: candidate.simDigest,
        rngCount: candidate.collector.rng.length,
        rngSha256: candidate.rngDigest,
        evidenceSha256: candidate.evidenceDigest,
        accounting,
        migration,
      });
    }
    gate(inputBefore === sha256(canonicalJson({ mapKey, tTactic, ctTactic, neutralRoster })),
      "SIM_MUTATED_NEUTRAL_INPUT");
    const heTotals = heRecords.reduce((totals, record) => {
      for (const key of ["throws", "detonations", "damageEvents", "effectiveDamage", "kills", "assists"]) {
        totals[key] += record.accounting[key];
      }
      return totals;
    }, { throws: 0, detonations: 0, damageEvents: 0, effectiveDamage: 0, kills: 0, assists: 0 });
    gate(heTotals.throws > 0 && heTotals.detonations > 0, "ZERO_HE_LIFECYCLE_COVERAGE");
    gate(heTotals.damageEvents > 0 && heTotals.effectiveDamage > 0, "ZERO_HE_DAMAGE_COVERAGE");
    gate(heTotals.kills > 0, "ZERO_HE_KILL_COVERAGE");

    const gameplayRecords = [];
    for (const statCase of STAT_CASES) {
      const roster = treatmentRoster(candidateApi, statCase);
      for (const seed of FIXED_SEEDS) {
        const scenario = { caseId: statCase.id, seed, mapKey, tTactic, ctTactic, roster };
        const baseline = runOnce(baselineApi, scenario);
        const candidate = runDeterministic(candidateApi, scenario, "matrix-candidate");
        const accounting = validateDamageAccounting(candidate, scenario);
        const migration = validateCausalPair(baseline, candidate, scenario);
        gameplayRecords.push({
          caseId: statCase.id,
          seed,
          gameplayDigestV5: candidate.simDigest,
          rngCount: candidate.collector.rng.length,
          rngSha256: candidate.rngDigest,
          outcome: outcomeProjection(candidate.sim),
          accounting,
          migration,
        });
      }
    }

    const impactedRuns = gameplayRecords.filter((record) => record.migration.firstEffectiveHEDamage);
    const zeroImpactRuns = gameplayRecords.filter((record) => !record.migration.firstEffectiveHEDamage);
    gate(impactedRuns.length > 0, "ZERO_MATRIX_HE_DAMAGE_COVERAGE");
    gate(zeroImpactRuns.every((record) => record.migration.zeroDiffWithoutEffectiveDamage),
      "ZERO_IMPACT_RUN_NOT_ZERO_DIFF");

    const heSuiteSha256 = sha256(canonicalJson({
      schema: HE_SCHEMA,
      functionalBaseline: {
        radius: EXPECTED_HE_RADIUS,
        maxDamage: EXPECTED_HE_MAX_DAMAGE,
        falloff: "linear-to-zero",
        enemyOnly: true,
        wallBlocked: true,
        armorScale: EXPECTED_HE_ARMOR_SCALE,
        calibrated: false,
      },
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      records: heRecords,
    }, { gameplay: true, rejectUndefined: true }));
    const gameplaySuiteV5Sha256 = sha256(canonicalJson({
      schema: DIGEST_SCHEMA_V5,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      treatmentIds: STAT_CASES.map((item) => item.id),
      records: gameplayRecords,
    }, { gameplay: true, rejectUndefined: true }));

    console.log(`sourceStage: ${sourceStage}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`static rand() call sites: ${EXPECTED_RAND_CALLS}->${randTokens(candidateSource).length}`);
    console.log(`functional baseline: R=${EXPECTED_HE_RADIUS} max=${EXPECTED_HE_MAX_DAMAGE} linear armor=${EXPECTED_HE_ARMOR_SCALE} calibrated=false`);
    console.log(`neutral coverage: ${canonicalJson(heTotals)}`);
    console.log(`matrix: ${STAT_CASES.length} treatments x ${FIXED_SEEDS.length} seeds = ${gameplayRecords.length} paired runs`);
    console.log(`causal migration: impacted=${impactedRuns.length} zeroImpact=${zeroImpactRuns.length}`);
    console.log(`${HE_SCHEMA}: ${heSuiteSha256}`);
    console.log(`${DIGEST_SCHEMA_V5}: ${gameplaySuiteV5Sha256}`);

    if (sourceStage === "r13-verifier-first") {
      throw new Error(`[PRODUCTION_HE_NOT_INTEGRATED]\n${HE_SCHEMA}=${heSuiteSha256}\n${DIGEST_SCHEMA_V5}=${gameplaySuiteV5Sha256}`);
    }
    gate(EXPECTED_HE_SUITE_SHA256 !== "__LOCK_AFTER_REVIEW__"
      && EXPECTED_GAMEPLAY_SUITE_V5_SHA256 !== "__LOCK_AFTER_REVIEW__", "R14_BASELINE_NOT_LOCKED",
    `${HE_SCHEMA}=${heSuiteSha256}\n${DIGEST_SCHEMA_V5}=${gameplaySuiteV5Sha256}`);
    gate(heSuiteSha256 === EXPECTED_HE_SUITE_SHA256, "HE_SUITE_HASH_MISMATCH",
      `expected=${EXPECTED_HE_SUITE_SHA256}\nactual=${heSuiteSha256}`);
    gate(gameplaySuiteV5Sha256 === EXPECTED_GAMEPLAY_SUITE_V5_SHA256,
      "GAMEPLAY_SUITE_V5_HASH_MISMATCH",
      `expected=${EXPECTED_GAMEPLAY_SUITE_V5_SHA256}\nactual=${gameplaySuiteV5Sha256}`);
    console.log("CS HE Gameplay R14: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
