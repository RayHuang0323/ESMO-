// Focused reproduction of the unchanged S29B1 g3 failure, not a replacement gate.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.argv.find(a => a.startsWith('--baseline-root='))?.split('=').slice(1).join('=');
assert(base, '--baseline-root must be an existing read-only official worktree');
assert(execFileSync('git', ['-C', base, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).startsWith('dc520f1'));
assert.equal(execFileSync('git', ['-C', base, 'diff', 'HEAD', '--', 'src'], { encoding: 'utf8' }).trim(), '');
const source = readFileSync('tools/check_moba_pacing29b1.mjs', 'utf8');
const seeds = JSON.parse(source.match(/const SEEDS = (\[[^;]+\]);/)[1]);
async function run(root) {
  const { LogicEngine } = await import(pathToFileURL(resolve(root, 'src/LogicEngine.js')));
  const { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTICS } = await import(pathToFileURL(resolve(root, 'src/platform/contracts/MobaTacticConfig.js')));
  const rows = [];
  for (const tactic of [false, true]) for (const seed of seeds) {
    const e = new LogicEngine(seed, null, { rules: 'v3' });
    if (tactic) e.configureMatch({ blue: toEngineTactic(MOBA_TACTICS[0]), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
    let kills = 0; const original = e._resolveKill.bind(e);
    e._resolveKill = (p, foe) => { kills++; original(p, foe); };
    for (let t = 0.5; t <= 900 && !e.over; t += 0.5) e.tick(0.5);
    rows.push({ seed, tactic, kills });
  }
  const k = rows.map(r => r.kills).sort((a, b) => a - b);
  return { rows, k15p50: k[Math.floor(k.length / 2)] };
}
console.log('Reproducing identical S29B1 seeds, v3, DT=0.5, with/without tactic; baseline first.');
const baseline = await run(base);
console.log('baseline k15p50', baseline.k15p50);
const candidate = await run(process.cwd());
assert.deepEqual(candidate, baseline);
assert.equal(baseline.k15p50, 6);
mkdirSync('tmp/hero-skills', { recursive: true });
writeFileSync('tmp/hero-skills/pacing-baseline.json', JSON.stringify({ baseline, candidate, unchangedGate: '7 <= k15p50 <= 18', gatePass: false }, null, 2));
console.log('Baseline reproduction: PASS, all 40 seed/tactic rows identical; existing pacing g3 remains FAIL (6 < 7).');
