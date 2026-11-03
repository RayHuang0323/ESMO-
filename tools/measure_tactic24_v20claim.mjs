// ============================================================================
//  tools/measure_tactic24_v20claim.mjs — Phase 3a-B P0-2：tactic24 m6／m4 新宣稱的新 seeds 證據（事前登記 tools/fixtures/tactic24_v20claim_registration.json）
//
//  執行：node tools/measure_tactic24_v20claim.mjs --run       （約 400 場、單行程；結果檔已存在就拒跑：這些 seeds 只能看一次）
//        node tools/measure_tactic24_v20claim.mjs --selftest  （純函式＋登記檔形狀；不跑對局）
//
//  路徑與 check_moba_tactic24 相同（new LogicEngine(seed) ＋ configureMatch，藍方 m6 或 m4、紅方 std、上限 1800 秒、dt 0.5），
//  在 tick 迴圈外側只讀 exec 計數，不改引擎。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const REG_REL = "tools/fixtures/tactic24_v20claim_registration.json", OUT_REL = "tools/fixtures/tactic24_v20claim_result.json";
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, REG_REL), "utf8"));
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);

/** 兩比例 z（合併比例的標準誤）。 */
export function twoPropZ(x1, n1, x2, n2) {
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}
export function verdictOf(m6, m4) {
  const s6 = m6.mid / m6.total, s4 = m4.mid / m4.total, ratio = s6 / s4, z = twoPropZ(m6.mid, m6.total, m4.mid, m4.total);
  return { share: { m6: s6, m4: s4 }, ratio, z, pass: ratio >= 1.15 && z >= 2 };
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  ck("S1 登記檔：seeds 19001–19200、門檻 ×1.15 且 z ≥ 2", REG.seeds.range === "19001-19200" && /1\.15/.test(REG.claim.pass) && /z.*>= 2/.test(REG.claim.pass));
  ck("S2 相同比例 ⇒ z 0、ratio 1、不通過", (() => { const v = verdictOf({ mid: 50, total: 150 }, { mid: 50, total: 150 }); return v.z === 0 && v.ratio === 1 && !v.pass; })());
  ck("S3 ratio 夠但 z 不夠 ⇒ 不通過；兩者都夠 ⇒ 通過", !verdictOf({ mid: 6, total: 15 }, { mid: 5, total: 15 }).pass && verdictOf({ mid: 300, total: 600 }, { mid: 200, total: 600 }).pass);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}
if (!flag("run")) { console.error("用法：--run／--selftest"); process.exit(2); }
if (fs.existsSync(path.join(ROOT, OUT_REL))) { console.error("結果檔已存在：這些 seeds 已觀察過，不得再跑。"); process.exit(2); }
const dirty = execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length;
if (dirty) { console.error(`src／tools 有 ${dirty} 個未提交變更：必須在已 commit 的程式上跑（事前登記要先 commit）。`); process.exit(2); }

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { STANDARD_OPP_TACTIC, toEngineTactic, mobaTacticById, MOBA_TACTIC_VERSION } = await imp("src/platform/contracts/MobaTacticConfig.js");
const { LogicEngine } = await imp("src/LogicEngine.js");
const SV = await imp("src/platform/contracts/simulationVersion.js");
function run(seed, tacticId) {
  const e = new LogicEngine(seed), t = mobaTacticById(tacticId);
  e.configureMatch({ blue: toEngineTactic(t), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: { tacticId: t.tacticId, tacticName: t.name, version: MOBA_TACTIC_VERSION, opponentTacticId: "std" } });
  const starts = [];
  let prev = 0;
  for (let tt = 0.5; tt <= 1800 && !e.over; tt += 0.5) {
    e.tick(0.5);
    const x = e.exec.blue, n = x.topGanks + x.midGanks + x.botGanks;
    if (n > prev) { starts.push(e.t); prev = n; }
  }
  const x = e.exec.blue;
  return { top: x.topGanks, mid: x.midGanks, bot: x.botGanks, starts };
}
const t0 = Date.now(), per = { m6: [], m4: [] };
for (const [i, seed] of SEEDS.entries()) {
  for (const id of ["m6", "m4"]) per[id].push({ seed, ...run(seed, id) });
  if ((i + 1) % 20 === 0) { const k = Math.round(((i + 1) / SEEDS.length) * 20); console.log(`[${"█".repeat(k)}${"░".repeat(20 - k)}] ${i + 1}/${SEEDS.length} seeds，已 ${((Date.now() - t0) / 60000).toFixed(1)} 分`); }
}
const agg = (rows) => { const mid = rows.reduce((s, r) => s + r.mid, 0), total = rows.reduce((s, r) => s + r.top + r.mid + r.bot, 0); return { mid, total, perMatch: total / rows.length }; };
const minGap = (rows) => Math.min(...rows.flatMap((r) => r.starts.slice(1).map((t, j) => t - r.starts[j])));
const A6 = agg(per.m6), A4 = agg(per.m4), v = verdictOf(A6, A4);
const out = {
  schema: "esmo.tactic24-claim-result.v1", registration: REG_REL, reportedAt: new Date().toISOString(),
  gitHead: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(), simulationVersion: SV.MOBA_SIMULATION_VERSION, fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION],
  seeds: REG.seeds.range, m6: A6, m4: A4, share: v.share, ratio: v.ratio, z: v.z, verdict: v.pass ? "PASS" : "NO_CLAIM",
  reportOnly: { ganksPerMatch: { m6: A6.perMatch, m4: A4.perMatch }, minGapSec: { m6: minGap(per.m6), m4: minGap(per.m4) } },
  perSeed: Object.fromEntries(["m6", "m4"].map((id) => [id, per[id].map((r) => [r.seed, r.top, r.mid, r.bot])])),
};
fs.writeFileSync(path.join(ROOT, OUT_REL), `${JSON.stringify(out, null, 1)}\n`);
console.log(`中路占比 m6 ${v.share.m6.toFixed(3)}（${A6.mid}/${A6.total}） vs m4 ${v.share.m4.toFixed(3)}（${A4.mid}/${A4.total}） = ×${v.ratio.toFixed(3)}，z ${v.z.toFixed(2)} ⇒ ${out.verdict}`);
console.log(`只報告：每場 Gank m6 ${A6.perMatch.toFixed(2)} vs m4 ${A4.perMatch.toFixed(2)}；最短連續出發間隔 m6 ${out.reportOnly.minGapSec.m6}s、m4 ${out.reportOnly.minGapSec.m4}s`);
