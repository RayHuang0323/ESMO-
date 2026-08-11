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

export function csR15EvidenceSources(input) {
  const r15 = normalizeCsSource(input);
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
