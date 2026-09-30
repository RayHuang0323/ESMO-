// ============================================================================
//  check_hero_power_curve_v17.mjs — Hero Early／Mid／Late Power Curve v1（moba-sim.v17）
//
//   A 資料：100/100 英雄都有曲線；字面表與推導規則一致（無漂移）；三段倍率平均恆為 1；
//           曲線有真的差異（不同形狀數、三種強勢期都有人）
//   B 關閉路徑：規則關閉 ⇒ configure 拒絕、串流與「從未 configure」逐位元相同；skill-off 拒絕
//   C 引擎：power／最大生命＝原式 × 此刻倍率（Lv1 起就生效、升級後照曲線走）；同 seed 兩次逐位元相同
//   D snapshot／Replay：powerCurve { peak, phase, k }；重播由 heroId＋frame 等級還原同一個 k
//   E 模擬差異：同一場只給藍方曲線 ⇒ 串流不同；前期型與後期型在前後期的戰力差方向正確
//
//  跑法：node tools/check_hero_power_curve_v17.mjs（約 1–2 分鐘）
// ============================================================================
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
const PC = await imp('src/battle/moba/heroPowerCurve.js');
const { CHAMPIONS_100 } = await imp('src/data/heroDatabase.js');
const { powerMultFor, hpMultFor, rulesFor } = await imp('src/battle/moba/matchProgression.js');
const { snapshotToFrame } = await imp('src/platform/contracts/mobaReplay.js');
const { createReplaySource } = await imp('src/battle/moba/replay/replayPresentationSource.js');

// ── A 資料 ───────────────────────────────────────────────────────────────
const ids = CHAMPIONS_100.map((h) => h.id);
const missing = ids.filter((id) => !PC.powerCurveOf(id));
ck('A1 100/100 英雄都有強度曲線', missing.length === 0, missing.join(',') || '100');
const gen = spawnSync(process.execPath, [path.join(ROOT, 'tools/gen_hero_power_curve.mjs'), '--check'], { encoding: 'utf8' });
ck('A2 字面表與推導規則一致（heroDatabase／被動改了卻沒重產 ⇒ 紅）', gen.status === 0, (gen.stdout || gen.stderr).trim());
const means = ids.map((id) => { const k = PC.curveMultipliers(PC.powerCurveOf(id).curve); return [(k.power[0] + k.power[1] + k.power[2]) / 3, (k.hp[0] + k.hp[1] + k.hp[2]) / 3]; });
ck('A3 每名英雄三段倍率平均＝1（只改什麼時候強，不改總量）', means.every(([a, b]) => Math.abs(a - 1) < 1e-9 && Math.abs(b - 1) < 1e-9));
const shapes = new Set(ids.map((id) => PC.powerCurveOf(id).curve.join('/')));
const peaks = [0, 1, 2].map((ph) => ids.filter((id) => PC.peakPhaseOf(PC.powerCurveOf(id).curve) === ph).length);
ck('A4 曲線真的有差異：≥10 種形狀、前／中／後期強勢都有英雄', shapes.size >= 10 && peaks.every((n) => n > 0),
  `${shapes.size} 種；強勢期 前 ${peaks[0]}／中 ${peaks[1]}／後 ${peaks[2]}`);
const range = ids.flatMap((id) => PC.curveMultipliers(PC.powerCurveOf(id).curve).power);
ck('A5 倍率範圍有界（0.85–1.15）', Math.min(...range) >= 0.85 && Math.max(...range) <= 1.15, `${Math.min(...range).toFixed(3)}–${Math.max(...range).toFixed(3)}`);
ck('A6 v3 正式規則集 heroPowerCurveV1＝on', rulesFor('v3').heroPowerCurveV1 === true);

// ── 共用 ────────────────────────────────────────────────────────────────
const fnv = (str, h = 0x811c9dc5) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
function build(seed, { rules = null, curves = true, onlySide = null } = {}) {
  const savedLE = M.LE, savedC = M.curves;
  if (rules) M.LE = { LogicEngine: class extends savedLE.LogicEngine { constructor(...a) { super(...a); this.rules = { ...this.rules, ...rules }; } } };
  if (!curves || onlySide) M.curves = null;
  try {
    const built = runner.configure(seed, 'off', M);
    if (onlySide) {
      const pick = Object.fromEntries(Object.entries(built.roster).filter(([pid]) => pid[0] === onlySide[0]));
      built.e.configureHeroPowerCurve(PC.toEngineHeroPowerCurve(pick));
    }
    return built;
  } finally { M.LE = savedLE; M.curves = savedC; }
}
function run(built, maxT = 1200, every = 20, onSnap = null) {
  const { e } = built;
  let t = 0, n = 0, h = 0x811c9dc5;
  while (!e.winner && t < maxT) {
    e.tick(0.5); t += 0.5; n += 1;
    if (n % every === 0) {
      const snap = e.snapshot();
      h = fnv(JSON.stringify(snap.players.map((p) => [p.pos, p.hp, p.k, p.d, p.gold, p.mlv])), h);
      onSnap?.(snap);
    }
  }
  return h.toString(16);
}

// ── B 關閉路徑 ───────────────────────────────────────────────────────────
{
  const off = build(5, { rules: { heroPowerCurveV1: false } });
  const never = build(5, { curves: false });
  ck('B1 規則關閉 ⇒ configureHeroPowerCurve 拒絕', !off.e.powerCurveOn);
  const h1 = run(off, 900), h2 = run(never, 900);
  ck('B2 規則關閉 ⇒ 串流與「從未 configure」逐位元相同', h1 === h2, `${h1} vs ${h2}`);
  const le = new M.LE.LogicEngine(2);
  ck('B3 hero skills 關閉（Challenge 路徑）⇒ 曲線拒絕', le.configureHeroPowerCurve(PC.toEngineHeroPowerCurve({ b1: { heroId: 'maestro' } })) === false);
}

// ── C 引擎 ───────────────────────────────────────────────────────────────
{
  const b = build(9);
  const p = b.e.players[3];
  const c = b.e.powerCurve[p.id];
  const expect0 = p.basePower * powerMultFor(p.mlv) * PC.curveKAt(c.power, p.mlv);
  ck('C1 開局（Lv1）就套用前期倍率', b.e.powerCurveOn && Math.abs(p.power - expect0) < 1e-9, `power ${p.power.toFixed(3)}＝base ${p.basePower} × ${PC.curveKAt(c.power, p.mlv).toFixed(3)}`);
  run(b, 1500, 40);
  const bad = b.e.players.filter((q) => {
    const cq = b.e.powerCurve[q.id];
    const want = q.basePower * powerMultFor(q.mlv) * PC.curveKAt(cq.power, q.mlv);
    return Math.abs(q.power - want) > 1e-6;
  }).map((q) => q.id);
  ck('C2 升級後 power＝base × 等級倍率 × 曲線倍率（唯一掛點 _applyMatchLevel）', bad.length === 0, bad.join(',') || `mlv ${b.e.players.map((q) => q.mlv).join('/')}`);
  const a1 = run(build(13), 1200), a2 = run(build(13), 1200);
  ck('C3 同 seed 兩次 ⇒ 串流逐位元相同', a1 === a2, a1);
}

// ── D snapshot／Replay ───────────────────────────────────────────────────
{
  const b = build(21);
  let snap = null;
  run(b, 900, 30, (s) => { snap = s; });
  const rows = snap.players.map((p) => p.powerCurve);
  ck('D1 snapshot 每名英雄都有 powerCurve { peak, phase, k }', rows.every((r) => r && Number.isInteger(r.peak) && Number.isInteger(r.phase) && Number.isFinite(r.k)));
  const frame = snapshotToFrame(snap);
  const replay = { config: { heroPowerCurveOn: true }, frames: [frame], towersMeta: {}, objectivesMeta: [], events: [],
    playersMeta: snap.players.map((p) => ({ id: p.id, side: p.side, role: p.role, heroId: b.roster[p.id].heroId })) };
  const back = createReplaySource(replay).getState().snapshot.players;
  const mism = snap.players.filter((p, i) => JSON.stringify(p.powerCurve) !== JSON.stringify(back[i]?.powerCurve)).map((p) => p.id);
  ck('D2 重播由 heroId＋frame 等級還原出與現場相同的 powerCurve', mism.length === 0, mism.join(',') || 'ok');
  const old = createReplaySource({ ...replay, config: {} }).getState().snapshot.players;
  ck('D3 舊重播（沒有 heroPowerCurveOn）不捏造曲線', old.every((p) => !p.powerCurve));
}

// ── E 模擬差異 ───────────────────────────────────────────────────────────
{
  const none = run(build(31, { curves: false }), 1200);
  const blueOnly = run(build(31, { onlySide: 'blue' }), 1200);
  ck('E1 只給藍方曲線 ⇒ 對局確實不同', none !== blueOnly, `${none} vs ${blueOnly}`);
  const early = ids.filter((id) => PC.peakPhaseOf(PC.powerCurveOf(id).curve) === 0);
  const late = ids.filter((id) => PC.peakPhaseOf(PC.powerCurveOf(id).curve) === 2);
  const kAt = (id, lv) => PC.curveKAt(PC.curveMultipliers(PC.powerCurveOf(id).curve).power, lv);
  const avg = (list, lv) => list.reduce((s, id) => s + kAt(id, lv), 0) / list.length;
  ck('E2 前期型 Lv3 倍率 > 後期型；Lv12 反過來', avg(early, 3) > avg(late, 3) && avg(early, 12) < avg(late, 12),
    `Lv3 前期型 ${avg(early, 3).toFixed(3)} vs 後期型 ${avg(late, 3).toFixed(3)}；Lv12 ${avg(early, 12).toFixed(3)} vs ${avg(late, 12).toFixed(3)}`);
}

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}　${r.detail}`);
console.log(`\nHero Power Curve v17：${pass}/${results.length}　RESULT=${pass === results.length ? 'PASS' : 'FAIL'}　耗時 ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(pass === results.length ? 0 : 1);
