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

const R24_RAW_ACCURACY_HEADSHOT = '          const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const R25_EFFECTIVE_ACCURACY_HEADSHOT = '          const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,"acc"):rawAccuracy;const isHS=rand()<g.hs*(0.72+0.55*(effectiveAccuracy/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';

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

// R25 changes only the live headshot Accuracy read. Historical verifiers use
// the byte-exact R24 view; the focused R25 gate separately checks live source.
export function csR25R24Source(input) {
  let source = normalizeCsSource(input);
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
  const normalized = normalizeCsSource(input);
  const r24 = sha256(normalized) === CS_R25_ACCURACY_SOURCE_SHA256
    ? csR25R24Source(normalized) : normalized;
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
