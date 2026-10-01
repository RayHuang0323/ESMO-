// ============================================================================
//  check_tactical_identity_v17.mjs — Tactical Identity v1（moba-sim.v17）
//
//   A 契約：toEngineTacticIdentity 對 8 套戰術＋std 都有值；std 完全中性；每套非 std 至少一項非中性；
//           原本「只有 UI／對應到無效果」的欄位現在都有決策投影
//   B 關閉路徑：規則關閉 ⇒ 不接線、串流與沒傳 identity 逐位元相同；std 對 std（規則開）也逐位元相同
//   C 行為（同 seed 配對：同一套戰術「接線 vs 不接線」，藍方＝戰術、紅方＝std）：
//      C1 jungle＝farm ⇒ 抓人次數下降          C2 support＝roam ⇒ 遊走次數上升；protect ⇒ 下降
//      C3 高 aggression ⇒ ENGAGE 決策比例上升；低 ⇒ 下降
//      C4 riskTolerance 高 ⇒ 緊急撤退（RETREAT）比例下降；低 ⇒ 上升
//      C5 carryPriority ⇒ 護人時確實優先保護指定那一路（protectCarry > 0）
//   D 決定性：同 seed 兩次逐位元相同
//   E 同一個 builder：useLocalServer（Live）與 challengeRunner（Challenge）都用 toEngineTacticIdentity 傳 identity
//
//  跑法：node tools/check_tactical_identity_v17.mjs（約 3–6 分鐘）
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
const TC = await imp('src/platform/contracts/MobaTacticConfig.js');
const { rulesFor } = await imp('src/battle/moba/matchProgression.js');

// ── A 契約 ───────────────────────────────────────────────────────────────
const all = [...TC.MOBA_TACTICS, TC.STANDARD_OPP_TACTIC];
const ids = all.map((t) => [t.tacticId, TC.toEngineTacticIdentity(t)]);
ck('A1 8 套戰術＋std 都產生 identity（版本 TacticIdentity.v1）', ids.every(([, I]) => I.version === TC.TACTIC_IDENTITY_VERSION));
ck('A2 std 完全中性（對手預設行為不變）', TC.isNeutralTacticIdentity(TC.toEngineTacticIdentity(TC.STANDARD_OPP_TACTIC)));
const neutralPresets = ids.filter(([id, I]) => id !== 'std' && TC.isNeutralTacticIdentity(I)).map(([id]) => id);
ck('A3 每套非 std 戰術至少一項決策投影非中性', neutralPresets.length === 0, neutralPresets.join(',') || '8/8');
const noDamage = ids.every(([, I]) => Object.keys(I).every((k) => !/dmg|damage|power|win/i.test(k)));
ck('A4 identity 沒有任何傷害／勝率欄位（只有門檻／機率／偏好）', noDamage, Object.keys(ids[0][1]).join(','));
const m4 = TC.toEngineTacticIdentity(TC.mobaTacticById('m4'));
const m3 = TC.toEngineTacticIdentity(TC.mobaTacticById('m3'));
const m8 = TC.toEngineTacticIdentity(TC.mobaTacticById('m8'));
const m5 = TC.toEngineTacticIdentity(TC.mobaTacticById('m5'));
ck('A5 原本無效的選擇現在有投影：jungle farm／support roam／support protect／carryPriority',
  m4.gankIntervalK > 1 && m3.roamK > 1 && m8.roamK < 1 && m8.protectHp > 0.55 && m5.protectRole === 'adc',
  `m4 gankK ${m4.gankIntervalK}、m3 roamK ${m3.roamK}、m8 roamK ${m8.roamK}／protectHp ${m8.protectHp}、m5 protect ${m5.protectRole}`);
ck('A6 v3 正式規則集 tacticIdentityV1＝on', rulesFor('v3').tacticIdentityV1 === true);

// ── 共用：同 seed 配對 ──────────────────────────────────────────────────
const fnv = (str, h = 0x811c9dc5) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
function play(seed, tactic, { identity = true, rules = null, maxT = 1200 } = {}) {
  const savedLE = M.LE;
  if (rules) M.LE = { LogicEngine: class extends savedLE.LogicEngine { constructor(...a) { super(...a); this.rules = { ...this.rules, ...rules }; } } };
  let built;
  try { built = runner.configure(seed, 'off', M); } finally { M.LE = savedLE; }
  const { e } = built;
  //  runner 已以 std 對 std configureMatch；這裡依正式順序重新設定藍方戰術（configureMatch 重建 tactic 狀態）。
  const std = TC.STANDARD_OPP_TACTIC;
  e.configureMatch({ blue: TC.toEngineTactic(tactic), red: TC.toEngineTactic(std), meta: null,
    identity: identity ? { blue: TC.toEngineTacticIdentity(tactic), red: TC.toEngineTacticIdentity(std) } : null });
  const obs = { ticks: 0, engage: 0, retreat: 0, blueDecisions: 0 };
  let t = 0, h = 0x811c9dc5, n = 0;
  while (!e.winner && t < maxT) {
    e.tick(0.5); t += 0.5; n += 1;
    for (const p of e.players) {
      if (p.side !== 'blue' || p.dead) continue;
      obs.blueDecisions += 1;
      if (p.decisionAction === 'ENGAGE') obs.engage += 1;
      if (p.decisionAction === 'RETREAT') obs.retreat += 1;
    }
    if (n % 20 === 0) h = fnv(JSON.stringify(e.players.map((p) => [p.pos.x, p.pos.y, p.hp, p.k, p.d])), h);
  }
  const ex = e.exec?.blue ?? {};
  return { hash: h.toString(16), ganks: (ex.topGanks ?? 0) + (ex.midGanks ?? 0) + (ex.botGanks ?? 0), roams: ex.supportRoams ?? 0,
    engage: obs.engage / Math.max(1, obs.blueDecisions), retreat: obs.retreat / Math.max(1, obs.blueDecisions),
    protectCarry: e.tidObs?.blue?.protectCarry ?? 0, e };
}
const SEEDS = [3, 7, 11, 19, 23, 29];
const pair = (tacticId, opts = {}) => {
  const t = TC.mobaTacticById(tacticId);
  const on = SEEDS.map((s) => play(s, t, opts)), off = SEEDS.map((s) => play(s, t, { ...opts, identity: false }));
  const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
  return { on, off, sum };
};

// ── B 關閉路徑 ───────────────────────────────────────────────────────────
{
  const t = TC.mobaTacticById('m7');
  const offRule = play(5, t, { rules: { tacticIdentityV1: false } });
  const noId = play(5, t, { identity: false });
  ck('B1 規則關閉 ⇒ 不接線、串流與沒傳 identity 逐位元相同', !offRule.e.tid && offRule.hash === noId.hash, `${offRule.hash} vs ${noId.hash}`);
  const stdOn = play(5, TC.STANDARD_OPP_TACTIC), stdOff = play(5, TC.STANDARD_OPP_TACTIC, { identity: false });
  ck('B2 std 對 std（規則開）⇒ 與不接線逐位元相同（中性＝零影響）', stdOn.hash === stdOff.hash, `${stdOn.hash} vs ${stdOff.hash}`);
}

// ── C 行為 ───────────────────────────────────────────────────────────────
{
  const farm = pair('m8');
  ck('C1 jungle＝farm（m8）⇒ 抓人次數下降', farm.sum(farm.on, 'ganks') < farm.sum(farm.off, 'ganks'),
    `接線 ${farm.sum(farm.on, 'ganks')} vs 不接線 ${farm.sum(farm.off, 'ganks')}（${SEEDS.length} 場合計）`);
  const roam = pair('m3');
  ck('C2a support＝roam（m3）⇒ 遊走次數上升', roam.sum(roam.on, 'roams') > roam.sum(roam.off, 'roams'),
    `接線 ${roam.sum(roam.on, 'roams')} vs 不接線 ${roam.sum(roam.off, 'roams')}`);
  ck('C2b support＝protect（m8）⇒ 遊走次數下降', farm.sum(farm.on, 'roams') < farm.sum(farm.off, 'roams'),
    `接線 ${farm.sum(farm.on, 'roams')} vs 不接線 ${farm.sum(farm.off, 'roams')}`);
  const agg = pair('m7');
  const avg = (arr, k) => arr.reduce((a, r) => a + r[k], 0) / arr.length;
  ck('C3a 高 aggression（m7）⇒ ENGAGE 比例上升', avg(agg.on, 'engage') > avg(agg.off, 'engage'),
    `${(100 * avg(agg.on, 'engage')).toFixed(2)}% vs ${(100 * avg(agg.off, 'engage')).toFixed(2)}%`);
  ck('C3b 低 aggression（m8）⇒ ENGAGE 比例下降', avg(farm.on, 'engage') < avg(farm.off, 'engage'),
    `${(100 * avg(farm.on, 'engage')).toFixed(2)}% vs ${(100 * avg(farm.off, 'engage')).toFixed(2)}%`);
  ck('C4a 高 riskTolerance（m7）⇒ 撤退決策比例下降', avg(agg.on, 'retreat') < avg(agg.off, 'retreat'),
    `${(100 * avg(agg.on, 'retreat')).toFixed(2)}% vs ${(100 * avg(agg.off, 'retreat')).toFixed(2)}%`);
  ck('C4b 低 riskTolerance（m8）⇒ 撤退決策比例上升', avg(farm.on, 'retreat') > avg(farm.off, 'retreat'),
    `${(100 * avg(farm.on, 'retreat')).toFixed(2)}% vs ${(100 * avg(farm.off, 'retreat')).toFixed(2)}%`);
  const carry = pair('m5');
  ck('C5 carryPriority＝adc（m5）⇒ 護人時優先保護下路（protectCarry > 0）', carry.sum(carry.on, 'protectCarry') > 0,
    `${carry.sum(carry.on, 'protectCarry')} 次`);
}

// ── D 決定性 ─────────────────────────────────────────────────────────────
{
  const t = TC.mobaTacticById('m6');
  const a = play(41, t), b = play(41, t);
  ck('D1 同 seed 兩次 ⇒ 串流逐位元相同', a.hash === b.hash, a.hash);
}

// ── E 同一個 builder ─────────────────────────────────────────────────────
{
  const uls = fs.readFileSync(path.join(ROOT, 'src/useLocalServer.js'), 'utf8');
  const chr = fs.readFileSync(path.join(ROOT, 'src/platform/challenge/challengeRunner.js'), 'utf8');
  ck('E1 Live（useLocalServer）與 Challenge（challengeRunner）都以 toEngineTacticIdentity 傳 identity',
    /identity:\s*\{\s*blue:\s*toEngineTacticIdentity\(/.test(uls) && /identity:\s*\{\s*blue:\s*toEngineTacticIdentity\(/.test(chr));
  //  TD-HI5：紅方戰術來自對手隊伍自己的設定（AI 聯賽隊伍 style），查不到 ⇒ std。
  const { TEAM_STYLES, AI_TEAMS } = await imp('src/platform/competition/aiTeams.js');
  const styleIds = TEAM_STYLES.map((st) => TC.mobaTacticForTeamStyle(st).tacticId);
  ck('E3 每一種隊伍 style 都對應到既有戰術（含 balanced＝std）；未知 style ⇒ std',
    TEAM_STYLES.every((st) => TC.TEAM_STYLE_TACTIC[st]) && TC.mobaTacticForTeamStyle('unknown').tacticId === 'std'
      && styleIds.every((id) => id === 'std' || TC.mobaTacticById(id)),
    TEAM_STYLES.map((st, i) => `${st}→${styleIds[i]}`).join('、'));
  ck('E4 7 支 AI 聯賽隊伍都有 style ⇒ 都取得自己的戰術', AI_TEAMS.every((t) => TEAM_STYLES.includes(t.style)),
    AI_TEAMS.map((t) => `${t.name}:${TC.mobaTacticForTeamStyle(t.style).tacticId}`).join('、'));
  ck('E5 一般對戰紅方：useLocalServer 由 opponentId → aiTeamById → style 取戰術，雙方同一個 builder；查不到 ⇒ STANDARD',
    /aiTeamById\(opts\.opponentId\)/.test(uls) && /mobaTacticForTeamStyle\(oppTeam\.style\)\s*:\s*STANDARD_OPP_TACTIC/.test(uls)
      && /red:\s*toEngineTactic\(redTactic\)/.test(uls) && /red:\s*toEngineTacticIdentity\(redTactic\)/.test(uls)
      && /opponentTacticId:\s*redTactic\.tacticId/.test(uls));
  const le = fs.readFileSync(path.join(ROOT, 'src/LogicEngine.js'), 'utf8');
  ck('E2 引擎不認得任何戰術 id（沒有第二套 AI／沒有依 tacticId 分支）', !/tacticId\s*===\s*['"]m\d/.test(le));
}

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}　${r.detail}`);
console.log(`\nTactical Identity v17：${pass}/${results.length}　RESULT=${pass === results.length ? 'PASS' : 'FAIL'}　耗時 ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(pass === results.length ? 0 : 1);
