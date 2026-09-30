// ============================================================================
//  check_hero_passive_runtime_v17.mjs — Hero Passive P Runtime v2（moba-sim.v17）
//
//   A 契約：100/100 英雄都有規則；tier＝full／approx／info；語彙只用已知的觸發／效果；
//           info 類不進引擎；LogicEngine 沒有任何 heroId 分支（不是 100 套 hard-code）
//   B 關閉路徑：規則關閉 ⇒ configure 拒絕、串流與「從未 configure」逐位元相同；skill-off 同樣拒絕
//   C 決定性：同 seed 兩次 ⇒ 串流逐位元相同（不耗 rng、固定順序）
//   D 覆蓋：每一名戰鬥被動英雄在真實對局中都至少觸發／加成一次；每一種效果都真的發生過
//   E snapshot／Replay：heroPassive 欄位；info 英雄沒有；frame.pp → 重播還原出同一組值
//   F UI 文字模型：生效中／資訊類／本場未生效三種狀態由同一個來源給出
//
//  跑法：node tools/check_hero_passive_runtime_v17.mjs   （約 3–5 分鐘，單一行程）
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
process.env.ESMO_BALANCE_SKILLS = 'on';
process.env.ESMO_BALANCE_TALENTS = 'on';

const t0 = Date.now();
const results = [];
const ck = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const runner = await imp('tools/balance/moba_items_balance_runner.mjs');
const M = await runner.modules();
const PG = await imp('src/battle/moba/skills/heroPassiveGameplay.js');
const { CHAMPIONS_100 } = await imp('src/data/heroDatabase.js');
const { snapshotToFrame } = await imp('src/platform/contracts/mobaReplay.js');
const detail = await imp('src/battle/moba/skills/heroSkillDetail.js');
const { rulesFor } = await imp('src/battle/moba/matchProgression.js');

const ids = CHAMPIONS_100.map((h) => h.id);
const rules = ids.map((id) => PG.passiveRuleOf(id));

// ── A 契約 ───────────────────────────────────────────────────────────────
const cov = PG.passiveCoverage(ids);
ck('A1 100/100 英雄都有被動規則（沒有遺漏）', cov.total === 100 && cov.missing.length === 0, JSON.stringify(cov));
ck('A2 tier 只有 full／approx／info，且資訊類 ≤ 10', rules.every((r) => ['full', 'approx', 'info'].includes(r?.tier)) && cov.info <= 10,
  `full ${cov.full}／approx ${cov.approx}／info ${cov.info}`);
const TRIGGERS = new Set(['burst-damage', 'damage-accum', 'damaged', 'low-hp', 'periodic', 'out-of-combat', 'stationary', 'moving',
  'in-zone', 'takedown', 'kill', 'ally-low-hp', 'ally-burst', 'attack-beat', 'skill-hit', 'hit-by-skill', 'skill-cast', 'ally-cast']);
const EFFECTS = new Set(['shield', 'team-shield', 'team-guard', 'guard', 'heal', 'haste', 'power', 'stealth', 'cdr', 'strike', 'burn',
  'slow', 'stun', 'mark', 'reflect', 'stack', 'arm', 'transfer']);
const MODS = new Set(['dmg', 'taken', 'speed']);
const badVocab = rules.filter((r) => (r.trigger && !TRIGGERS.has(r.trigger.kind))
  || [...r.effects, ...(r.release?.effects ?? [])].some((fx) => !EFFECTS.has(fx.kind))
  || r.mods.some((m) => !MODS.has(m.kind))).map((r) => r.heroId);
ck('A3 規則只使用引擎已知的觸發／效果／修正語彙', badVocab.length === 0, badVocab.join(',') || 'ok');
const infoLeak = rules.filter((r) => r.tier === 'info' && (r.trigger || r.effects.length || r.mods.length)).map((r) => r.heroId);
ck('A4 資訊類被動沒有任何戰鬥效果（不硬編效果湊數）', infoLeak.length === 0, infoLeak.join(',') || 'ok');
const approxNoNote = rules.filter((r) => r.tier !== 'full' && !r.note).map((r) => r.heroId);
ck('A5 近似／資訊類都寫明差異（note）', approxNoNote.length === 0, approxNoNote.join(',') || 'ok');
const fullRoster = Object.fromEntries(ids.map((id, i) => [`s${i}`, { heroId: id }]));
const cfgAll = PG.toEngineHeroPassives(fullRoster);
ck('A6 toEngineHeroPassives 只輸出戰鬥被動（info 不進引擎）', Object.keys(cfgAll.players).length === cov.full + cov.approx,
  `${Object.keys(cfgAll.players).length} 名`);
const leSrc = fs.readFileSync(path.join(ROOT, 'src/LogicEngine.js'), 'utf8');
const idInEngine = ids.filter((id) => new RegExp(`['"\`]${id}['"\`]`).test(leSrc));
ck('A7 LogicEngine 沒有任何英雄 id 字面值（沒有 100 套獨立 hard-code）', idInEngine.length === 0, idInEngine.join(',') || 'ok');

// ── 共用：跑一場、串流雜湊 ─────────────────────────────────────────────────
const fnv = (str, h = 0x811c9dc5) => {
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
};
function play(seed, { passives = true, maxT = 3600, every = 20, onSnap = null, roster: rosterIn = null } = {}) {
  const saved = M.passives;
  if (!passives) M.passives = null;
  let built;
  try { built = runner.configure(seed, 'off', M, 1, rosterIn); } finally { M.passives = saved; }
  const { e, roster } = built;
  let t = 0, h = 0x811c9dc5, n = 0;
  while (!e.winner && t < maxT) {
    e.tick(0.5); t += 0.5; n += 1;
    if (n % every === 0) {
      const snap = e.snapshot();
      h = fnv(JSON.stringify({ ts: snap.ts, players: snap.players.map((p) => [p.pos, p.hp, p.k, p.d, p.gold]), bK: snap.bK, rK: snap.rK }), h);
      onSnap?.(snap, e, roster);
    }
  }
  return { e, roster, hash: h.toString(16), winner: e.winner, t };
}
/** 以指定規則集 configure（與正式順序相同，只是 rules 先被覆寫）。 */
function playWithRules(seed, over, opts = {}) {
  const LE = M.LE.LogicEngine;
  const Orig = LE.prototype.constructor;
  const saved = M.LE;
  M.LE = { LogicEngine: class extends Orig { constructor(...a) { super(...a); this.rules = { ...this.rules, ...over }; } } };
  try { return play(seed, opts); } finally { M.LE = saved; }
}

// ── B 關閉路徑 ───────────────────────────────────────────────────────────
{
  const seed = 7;
  const offRule = playWithRules(seed, { heroPassivesV1: false }, { maxT: 900 });
  const never = play(seed, { passives: false, maxT: 900 });
  ck('B1 規則關閉 ⇒ configureHeroPassives 拒絕（heroPassivesOn 不成立）', !offRule.e.heroPassivesOn);
  ck('B2 規則關閉 ⇒ 串流與「從未 configure」逐位元相同', offRule.hash === never.hash, `${offRule.hash} vs ${never.hash}`);
  const onRun = play(seed, { maxT: 900 });
  ck('B3 規則開啟 ⇒ 串流確實不同（被動真的改變對局）', onRun.e.heroPassivesOn && onRun.hash !== never.hash, `${onRun.hash} vs ${never.hash}`);
  const LE = new M.LE.LogicEngine(3);
  ck('B4 hero skills 關閉（Challenge 路徑）⇒ 被動拒絕', LE.configureHeroPassives(cfgAll) === false && !LE.heroPassivesOn);
  ck('B5 v3 正式規則集 heroPassivesV1＝on（moba-sim.v17）', rulesFor("v3").heroPassivesV1 === true);
}

// ── C 決定性 ─────────────────────────────────────────────────────────────
{
  const a = play(11, { maxT: 1500 }), b = play(11, { maxT: 1500 });
  ck('C1 同 seed 兩次 ⇒ 串流逐位元相同', a.hash === b.hash, a.hash);
}

// ── D 覆蓋（真實對局）＋ E snapshot／Replay ──────────────────────────────
const combatIds = new Set(Object.values(cfgAll.players).map((r) => r.heroId));
const active = new Map();   // heroId → procs+boosted
const seen = new Set();
const effects = {};
let snapOk = true, infoSnapLeak = [], replayMismatch = [], seeds = 0;
//  固定陣容：依英雄主路線分 5 路、每路 20 名 ⇒ 20 組鏡像陣容剛好讓 100 名英雄各上場一次（不靠 seed 運氣）。
const LANE_ROLE = { 上路: 0, 打野: 1, 中路: 2, 下路: 3, 輔助: 4 };
const byLane = [[], [], [], [], []];
for (const h of CHAMPIONS_100) byLane[LANE_ROLE[h.lane]].push(h.id);
const rosters = Array.from({ length: Math.max(...byLane.map((l) => l.length)) }, (_, i) => {
  const r = {};
  byLane.forEach((list, role) => { const id = list[i % list.length]; r[`b${role + 1}`] = { heroId: id }; r[`r${role + 1}`] = { heroId: id }; });
  for (const [seat, e] of Object.entries(M.loadout.buildLoadout(r, M.heroes.heroById))) r[seat].spells = e.spells;
  return r;
});
//  擊殺／助攻才觸發的被動在單一場可能剛好沒拿到人頭 ⇒ 仍未觸發的陣容換 seed 重跑（每組最多 3 場）。
const jobs = rosters.map((fixed, ri) => ({ fixed, seed: 101 + ri, tries: 0 }));
while (jobs.length) {
  const { fixed, seed, tries } = jobs.shift();
  seeds += 1;
  const res = play(seed, { roster: fixed,
    every: 40,
    onSnap: (snap, e, roster) => {
      const frame = snapshotToFrame(snap);
      snap.players.forEach((p, i) => {
        const heroId = roster[p.id].heroId;
        if (PG.passiveRuleOf(heroId)?.tier === 'info' && p.heroPassive) infoSnapLeak.push(heroId);
        if (combatIds.has(heroId)) {
          if (!p.heroPassive || typeof p.heroPassive.procs !== 'number' || !p.heroPassive.tier) snapOk = false;
          const row = frame.pp?.[i];
          if (!row || row[0] !== p.heroPassive.procs || row[1] !== p.heroPassive.stacks || row[2] !== p.heroPassive.armed) replayMismatch.push(heroId);
        }
      });
    },
  });
  for (const p of res.e.players) {
    const heroId = res.roster[p.id].heroId;
    seen.add(heroId);
    if (p.passive) active.set(heroId, (active.get(heroId) ?? 0) + p.passive.procs + p.passive.boosted);
  }
  for (const [k, v] of Object.entries(res.e.passiveStats ?? {})) effects[k] = (effects[k] ?? 0) + v;
  const pending = Object.values(fixed).some((row) => combatIds.has(row.heroId) && !(active.get(row.heroId) > 0));
  if (pending && tries < 2) jobs.push({ fixed, seed: seed + 1000, tries: tries + 1 });
}
const dead = [...combatIds].filter((id) => !(active.get(id) > 0));
ck(`D1 每一名戰鬥被動英雄（${combatIds.size} 名）在真實對局中都觸發／加成過`, dead.length === 0,
  dead.length ? `未觸發：${dead.join(',')}` : `${seeds} 場涵蓋全部`);
const usedEffects = new Set(rules.flatMap((r) => [...r.effects, ...(r.release?.effects ?? [])].map((fx) => fx.kind)));
const neverApplied = [...usedEffects].filter((k) => !(effects[k] > 0));
ck('D2 規則表用到的每一種效果都真的套用過', neverApplied.length === 0, neverApplied.join(',') || JSON.stringify(effects));
ck('E1 戰鬥被動英雄的 snapshot 都帶 heroPassive（procs／tier）', snapOk);
ck('E2 資訊類英雄的 snapshot 沒有 heroPassive', infoSnapLeak.length === 0, [...new Set(infoSnapLeak)].join(',') || 'ok');
ck('E3 frame.pp 與現場 heroPassive 逐值相同（procs／stacks／armed）', replayMismatch.length === 0, [...new Set(replayMismatch)].slice(0, 8).join(',') || 'ok');

// Replay 還原：用 replayPresentationSource 讀回
{
  const src = await imp('src/battle/moba/replay/replayPresentationSource.js');
  const res = play(3, { maxT: 600, every: 4 });
  const snap = res.e.snapshot();
  const frame = snapshotToFrame(snap);
  const meta = Object.fromEntries(snap.players.filter((p) => p.heroPassive).map((p) => [p.id, { trigger: p.heroPassive.trigger, icd: p.heroPassive.icd, tier: p.heroPassive.tier }]));
  const replay = { config: { heroPassiveMeta: meta }, frames: [frame], playersMeta: snap.players.map((p) => ({ id: p.id, side: p.side, role: p.role, heroId: res.roster[p.id].heroId })), towersMeta: {}, objectivesMeta: [], events: [] };
  let restored = null;
  try {
    const s = src.createReplaySource(replay);
    restored = s.getState().snapshot?.players ?? null;
  } catch (err) { restored = { error: String(err.message ?? err) }; }
  const livePassive = snap.players.find((p) => p.heroPassive);
  const back = Array.isArray(restored) ? restored.find((p) => p.id === livePassive.id)?.heroPassive : null;
  ck('E4 重播 presentation 從 frame 還原出 heroPassive（procs／tier 與現場相同）',
    back && back.procs === livePassive.heroPassive.procs && back.tier === livePassive.heroPassive.tier,
    back ? JSON.stringify(back) : JSON.stringify(restored)?.slice(0, 160));
}

// ── F UI 文字模型 ────────────────────────────────────────────────────────
{
  const infoId = rules.find((r) => r.tier === 'info').heroId;
  const d1 = detail.buildHeroSkillDetail(infoId, 'P', null);
  ck('F1 資訊類被動 ⇒「資訊類被動 · 不影響戰鬥」', d1.passiveInfo && d1.availability === detail.PASSIVE_STATUS.infoAvailability, d1.availability);
  const liveId = 'maestro';
  const d2 = detail.buildHeroSkillDetail(liveId, 'P', { trigger: 'attack-beat', icd: 0, ready: true, cd: 0, procs: 5, tier: 'full', stacks: 0, armed: 0, boosted: 0 });
  ck('F2 生效中的被動 ⇒ 顯示已實裝與觸發次數', d2.passiveLive && /已實裝/.test(d2.availability) && /5 次/.test(d2.availability), d2.availability);
  const d3 = detail.buildHeroSkillDetail('embercoil', 'P', { trigger: 'burst-damage', icd: 3, ready: false, cd: 1.2, procs: 2, tier: 'approx' });
  ck('F3 近似實作 ⇒ 標示（近似）並帶實作說明', /近似/.test(d3.availability) && !!d3.passiveNote, d3.availability);
  const d4 = detail.buildHeroSkillDetail(liveId, 'P', null);
  ck('F4 沒有即時狀態（規則關閉或舊重播）⇒「本場未生效」，不冒充生效', !d4.passiveLive && d4.availability === detail.PASSIVE_STATUS.availability, d4.availability);
}

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}　${r.detail}`);
console.log(`\nHero Passive Runtime v17：${pass}/${results.length}　RESULT=${pass === results.length ? 'PASS' : 'FAIL'}　耗時 ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(pass === results.length ? 0 : 1);
