#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_combat_state_matrix.mjs — CombatState.v1 正式支援矩陣（400 技能）
//
//  執行：node tools/check_moba_combat_state_matrix.mjs [--json=<path>]
//  受控情境：每個技能單獨測——施放者 b1、敵人 r1（距 3）、隊友 b2（距 2）站在中路中央（165,165）；
//  r1／b2 的移動在本工具的引擎實例上凍結（覆寫 _navMove，引擎原始碼不動）——
//  否則 AI 會在施放後同一 tick 走開，量到的是「閃避」而不是「命中後效果有沒有套用」。
//  其他英雄在各自泉水；所有技能冷卻鎖住，只有受測欄位可放；不開裝備／召喚師技能／戰術。
//  因為只有 b1 會放技能，窗內所有英雄技能狀態都確定來自這一招（歸因精確，不靠猜）。
//  對每個規則宣告的持續欄位（controlDuration、shieldDuration…）檢查：
//    是否出現對應種類的 CombatState，且 (until − 套用時刻) ≈ 宣告值（技能 Lv1，±5%＋一個 tick）。
//  判定：OK／NO_CAST（情境沒觸發施放）／NOT_APPLIED（有施放、宣告的持續效果沒出現）／MISMATCH（時長不符）
//  ⚠ 只讀：不改規則、不改引擎；這支是「支援率」的量尺，不是平衡測試。
// ============================================================================
import { writeFileSync } from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { CHAMPIONS_100 } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills, compileGameplaySkill } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { FOUNTAIN } from "../src/gameData.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
//  宣告欄位 → 預期的 CombatState 種類
const FIELD_KINDS = {
  controlDuration: ["stun", "knockup", "taunt", "root", "silence"], rootDuration: ["root"], silenceDuration: ["silence"],
  tauntDuration: ["taunt"], slowDuration: ["hero-slow"], shieldDuration: ["shield"], guardDuration: ["guard"],
  dotDuration: ["dot", "zone-dot"], wallDuration: ["zone-wall", "zone-dashwall"],
  duration: ["hero-haste", "hero-power", "stealth", "empowered-strike", "hero-cdr", "control-immune", "guard", "shield"],
  markDuration: ["mark", "hero-slow"],
};
const C = { x: 165, y: 165 };
const FILLER = CHAMPIONS_100.map((h) => h.id);

function runSkill(heroId, slot) {
  const rule = compileGameplaySkill(heroId, slot);
  if (!rule) return null;
  const others = FILLER.filter((id) => id !== heroId);
  const roster = { b1: { heroId } };
  ["b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"].forEach((seat, i) => { roster[seat] = { heroId: others[i] }; });
  const e = new LogicEngine(7, null);
  e.configureHeroSkills(toEngineHeroSkills(roster, null));
  const P = Object.fromEntries(e.players.map((p) => [p.id, p]));
  const nav = e._navMove.bind(e);
  e._navMove = (q, t, sp) => ((q.id === "r1" || q.id === "b2") ? undefined : nav(q, t, sp));
  const pin = (p, x, y) => { p.pos = { x, y }; p.hp = p.maxHp; };
  const lockAll = () => { for (const p of e.players) for (const s of ["Q", "W", "E", "R"]) if (!(p.id === "b1" && s === slot)) p.heroSkillReadyAt[s] = 1e9; };
  lockAll();
  P.b1.heroSkillReadyAt[slot] = 0;
  for (const p of e.players) if (!["b1", "b2", "r1"].includes(p.id)) pin(p, FOUNTAIN[p.side].x, FOUNTAIN[p.side].y);
  const seenFx = new Set(e.fx.map((f) => f.id));
  let castAt = null;
  const lastUntil = new Map();
  const touches = [];
  const window = (rule.travel ?? 0) + (rule.delay ?? 0) + 1.2;
  for (let i = 0; i < 40; i++) {
    if (castAt === null) {
      pin(P.b1, C.x, C.y); pin(P.r1, C.x + 2.1, C.y - 2.1); pin(P.b2, C.x - 1.4, C.y + 1.4); P.b1.heroSkillReadyAt[slot] = 0;
      //  低血量觸發（shield-burst：自己；ally-shield：隊友）——情境要先滿足規則的 triggerHpRatio 才會施放
      if (rule.triggerHpRatio) (rule.mechanic === "ally-shield" ? P.b2 : P.b1).hp = (rule.mechanic === "ally-shield" ? P.b2 : P.b1).maxHp * rule.triggerHpRatio * 0.5;
    }
    e.tick(0.5);
    if (castAt === null) {
      const f = e.fx.find((x) => !seenFx.has(x.id) && x.skillId === `${heroId}:${slot}`);
      e.fx.forEach((x) => seenFx.add(x.id));
      if (f) castAt = e.t - 0.5;
    }
    for (const r of e._snapCombatStates().active) {
      const prev = lastUntil.get(r.id);
      if (castAt !== null && (prev === undefined || r.until > prev + 0.05)) touches.push({ kind: r.kind, t: e.t, until: r.until, startedAt: r.startedAt, targetId: r.targetId });
      lastUntil.set(r.id, r.until);
    }
    if (castAt !== null && e.t > castAt + window) break;
  }
  const fields = Object.keys(FIELD_KINDS).filter((f) => rule[f] > 0);
  const verdicts = fields.map((field) => {
    const d = rule[field] + (field === "dotDuration" && rule.mechanic === "area-dot" ? (rule.delay ?? 0) : 0);
    const kinds = FIELD_KINDS[field];
    const obs = touches.filter((x) => kinds.includes(x.kind));
    if (castAt === null) return { field, d, verdict: "NO_CAST" };
    if (!obs.length) return { field, d, verdict: "NOT_APPLIED" };
    //  套用時刻：領域用施放時刻（castAt，startedAt 精確）；其餘用第一次觀察到的 tick（最多晚 0.5 秒）
    const lens = obs.map((x) => Math.round((x.until - (x.kind.startsWith("zone") ? x.startedAt : x.t)) * 100) / 100);
    const ok = lens.some((len) => len >= d * 0.95 - 0.55 && len <= d * 1.05 + 0.05);
    return { field, d, verdict: ok ? "OK" : "MISMATCH", observed: [...new Set(obs.map((x) => x.kind))], lens: [...new Set(lens)].slice(0, 4) };
  });
  return { skillId: `${heroId}:${slot}`, mechanic: rule.mechanic, cast: castAt !== null, fields: verdicts,
    produced: [...new Set(touches.map((x) => x.kind))] };
}

const t0 = Date.now();
const rows = [];
for (const h of CHAMPIONS_100) for (const slot of ["Q", "W", "E", "R"]) { const r = runSkill(h.id, slot); if (r) rows.push(r); }
const timed = rows.filter((r) => r.fields.length);
const tally = {};
for (const r of timed) for (const f of r.fields) tally[f.verdict] = (tally[f.verdict] ?? 0) + 1;
const skillOk = timed.filter((r) => r.fields.every((f) => f.verdict === "OK")).length;
const byMech = {};
for (const r of timed) {
  const m = byMech[r.mechanic] ?? (byMech[r.mechanic] = { skills: 0, ok: 0, verdicts: {} });
  m.skills++; if (r.fields.every((f) => f.verdict === "OK")) m.ok++;
  for (const f of r.fields) m.verdicts[`${f.field}:${f.verdict}`] = (m.verdicts[`${f.field}:${f.verdict}`] ?? 0) + 1;
}
console.log(`技能 ${rows.length}（有施放 ${rows.filter((r) => r.cast).length}）；有持續欄位 ${timed.length}；耗時 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log(`欄位判定：${JSON.stringify(tally)}`);
console.log(`技能層完整支援（每個宣告的持續欄位都 OK）：${skillOk}/${timed.length}（${(skillOk / timed.length * 100).toFixed(1)}%）`);
for (const [m, v] of Object.entries(byMech).sort((a, b) => a[1].ok / a[1].skills - b[1].ok / b[1].skills)) {
  console.log(`  ${m.padEnd(22)} ${v.ok}/${v.skills}  ${JSON.stringify(v.verdicts)}`);
}
const bad = timed.filter((r) => r.fields.some((f) => f.verdict !== "OK"));
console.log(`\n非 OK 技能（前 40）：`);
for (const r of bad.slice(0, 40)) console.log(`  ${r.skillId} ${r.mechanic} ${r.fields.filter((f) => f.verdict !== "OK").map((f) => `${f.field}=${f.d}:${f.verdict}${f.lens ? `(${f.observed?.join("/")} ${f.lens.join("/")})` : ""}`).join(" ")}｜產生 ${r.produced.join(",") || "無"}`);
const json = arg("json", null);
if (json) writeFileSync(json, JSON.stringify({ tally, skillOk, timed: timed.length, rows }, null, 1));
