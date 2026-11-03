#!/usr/bin/env node
// ============================================================================
//  tools/measure_challenge_c1_3aB.mjs — Phase 3a-B 修正規劃 C1：練習對手難度階梯的基準量測（M0）
//  （登記 tools/fixtures/challenge_c1_calibration_registration_3aB.json）
//
//  node tools/measure_challenge_c1_3aB.mjs --plan
//  node tools/measure_challenge_c1_3aB.mjs --selftest
//  node tools/measure_challenge_c1_3aB.mjs --validate --vdir=<repo 外新資料夾>
//  node tools/measure_challenge_c1_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_challenge_c1_3aB.mjs --report --dir=<同一個>        寫 tools/fixtures/challenge_c1_m0_result_3aB.json
//
//  只做 M0（量測，不改任何對手）：參考挑戰者 R0（新存檔、全英雄熟練 Lv.1、戰術 m1、自動選角）對五個練習對手，
//  challenge.v20 與 challenge.v21 各一次。src/ 不動；對局走正式的 runChallenge（與 check_player_challenge_slice3 同一條路），
//  只有 matchSeed 由登記的 seed 給（createChallengeInstance 的 seedSource），快照的 now 固定。
//  S1（候選篩選）與 CF（確認）要 Owner 先確認目標區間，不在本工具。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/challenge_c1_calibration_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const OUT_REL = "tools/fixtures/challenge_c1_m0_result_3aB.json";
export const VERSIONS = Object.freeze(["moba-sim.v20", "moba-sim.v21"]);
const FIXED_NOW = 1757000000000;
export const R0_TACTIC = "m1";

// ── 純函式（selftest 涵蓋）────────────────────────────────────────────────
/** 挑戰方視角：勝 1、敗 0、未分勝負 0.5（與其他研究相同）。 */
export const winOf = (outcome) => (outcome === "challengerWin" ? 1 : outcome === "defenderWin" ? 0 : 0.5);
//  審查 #m4：Wilson 區間（勝率接近 0 時常態近似會出現負值）；未分勝負算 0.5，區間用同一個比例。
export function rateCI(ws, z = 1.96) {
  const n = ws.length, p = ws.reduce((a, b) => a + b, 0) / Math.max(1, n);
  if (!n) return { n, rate: p, lo: null, hi: null };
  const d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { n, rate: p, lo: c - h, hi: c + h };
}
/** 審查 #m4：slice3 的口徑（只算 challengerWin，未分算輸）。 */
export const strictWinOf = (outcome) => (outcome === "challengerWin" ? 1 : 0);
export const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/** 登記的 M0 seeds："59001-59799" 奇數。 */
export function seedsOfRange(range, step = 2) { const [a, b] = range.split("-").map(Number); const out = []; for (let s = a; s <= b; s += step) out.push(s); return out; }
/** 審查 #M1：規則集把佈局固定成 "standard"（challenge.v20）⇒ 每場都是 STANDARD；否則依 seed。 */
export const layoutOf = (rulesetLayout, seed, perSeed) => (rulesetLayout === "standard" ? "STANDARD" : perSeed(seed));
/** 目標區間（只描述，M0 不判定）：rate 是否落在 "0.35-0.55"。 */
export const inBand = (rate, band) => { const m = /^(\d*\.?\d+)-(\d*\.?\d+)/.exec(band ?? ""); return m ? rate >= Number(m[1]) && rate <= Number(m[2]) : null; };

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  ck("S1 winOf：挑戰方勝 1、敗 0、未分 0.5", winOf("challengerWin") === 1 && winOf("defenderWin") === 0 && winOf("unresolved") === 0.5);
  ck("S2 rateCI（Wilson）：10 場 7 勝 ⇒ 0.7，區間包住 0.7；0／20 下界 0、上界 > 0", (() => { const r = rateCI([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]), z = rateCI(Array(20).fill(0)); return Math.abs(r.rate - 0.7) < 1e-12 && r.lo < 0.7 && r.hi > 0.7 && r.n === 10 && Math.abs(z.lo) < 1e-12 && z.hi > 0 && Math.abs(r.lo - 0.3968) < 1e-3; })());
  ck("S6 strictWinOf：只有 challengerWin 算 1", strictWinOf("challengerWin") === 1 && strictWinOf("unresolved") === 0 && strictWinOf("defenderWin") === 0);
  ck("S7 layoutOf：規則集固定 standard ⇒ STANDARD；否則依 seed", layoutOf("standard", 1, () => "SWAPPED") === "STANDARD" && layoutOf("perSeed", 1, () => "SWAPPED") === "SWAPPED");
  ck("S3 median：奇偶數", median([3, 1, 2]) === 2 && median([4, 1, 2, 3]) === 2.5 && median([]) === null);
  ck("S4 seedsOfRange：59001-59799 步長 2 ⇒ 400 個奇數", (() => { const s = seedsOfRange("59001-59799"); return s.length === 400 && s.every((x) => x % 2 === 1) && s[0] === 59001 && s.at(-1) === 59799; })());
  ck("S5 inBand：0.4 在 0.35-0.55、0.6 不在、無區間 ⇒ null", inBand(0.4, "0.35-0.55 (text)") === true && inBand(0.6, "0.35-0.55") === false && inBand(0.4, null) === null);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 對局（worker 與 --validate 共用）──────────────────────────────────────────
//  profileStore 會碰 localStorage：worker 與主行程都裝一個記憶體版（與 check_player_challenge_slice3 相同做法）。
const LS = new Map();
globalThis.localStorage = { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => { LS.set(k, String(v)); }, removeItem: (k) => { LS.delete(k); } };
let LIB = null;
async function lib() {
  LIB ??= {
    P: await imp("src/platform/profileStore.js"), SA: await imp("src/platform/challenge/snapshotAuthority.js"), F: await imp("src/platform/challenge/fixtureOpponents.js"),
    CI: await imp("src/platform/contracts/challengeInstance.js"), DR: await imp("src/platform/challenge/draftResult.js"), R: await imp("src/platform/challenge/challengeRunner.js"),
    RS: await imp("src/platform/contracts/matchRuleset.js"), H: await imp("src/data/heroDatabase.js"), HC: await imp("src/data/heroClassification.js"),
    MA: await imp("src/battle/moba/mobaDraftAssignment.js"), RO: await imp("src/data/roster.js"), OL: await imp("src/platform/contracts/objectiveLayout.js"),
  };
  return LIB;
}
const R0 = new Map();
/** R0：新存檔（startNewGame("elite")，與 slice3 相同）、全英雄 Lv.1、戰術 m1；與 profileStore._issueEntrySnapshot 相同的 careerState，只有 now 與 simulationVersion 由工具給。 */
export async function r0Snapshot(simulationVersion) {
  if (R0.has(simulationVersion)) return R0.get(simulationVersion);
  const { P, SA, RO } = await lib();
  const store = () => P.useProfileStore.getState();
  store().startNewGame("elite");
  const st = store();
  const FRESH = Object.fromEntries([...new Set(Object.values(RO.HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
  const r = SA.publishDefensiveSnapshot({
    request: { teamId: st.team?.id ?? "team", tacticId: R0_TACTIC, reason: SA.PUBLISH_REASONS.manual },
    careerState: { players: st.players ?? [], lineup: st.lineup ?? null, heroProgress: FRESH, heroAssign: RO.HERO_ASSIGN,
      team: { teamId: st.team?.id ?? "team", teamName: st.team?.name ?? null, tag: st.team?.tag ?? null }, careerDay: Number(st.meta?.days) || 1, lastPublishedCareerDay: null },
    now: FIXED_NOW, intent: SA.SNAPSHOT_INTENT.entry, simulationVersion,
  });
  if (!r.ok) throw new Error(`R0 snapshot: ${JSON.stringify(r.errors).slice(0, 200)}`);
  R0.set(simulationVersion, r.snapshot);
  return r.snapshot;
}
/** 一場：R0（藍）對 fixture（紅），matchSeed＝toEngineSeed(seed)，與 profileStore.startFixtureChallenge 同樣的 draft／instance，正式 runChallenge。 */
export async function playOne(key, seed, simulationVersion) {
  const { SA, F, CI, DR, R, H, HC, MA } = await lib();
  const challenger = await r0Snapshot(simulationVersion);
  const fx = F.fixtureSnapshot(key, { playerMasteryLevel: 1, simulationVersion });
  if (!fx.ok) throw new Error(`fixture ${key}: ${JSON.stringify(fx.errors).slice(0, 200)}`);
  const defender = fx.snapshot;
  const dr = DR.createDraftResult({ challengerActions: [], defenderPolicy: defender?.standingOrders?.draftPolicy ?? null, challengerPolicy: challenger?.standingOrders?.draftPolicy ?? null,
    pool: H.CHAMPIONS_100.map((h) => h.id).filter(Boolean).sort(), challengerSnapshot: challenger, defenderSnapshot: defender, assign: MA.assignDraft, tagsOf: HC.heroTags,
    heroOf: (id) => H.heroById(id), laneOf: (id) => H.heroById(id)?.lane ?? null });
  if (!dr.ok) throw new Error(`draft: ${JSON.stringify(dr.errors).slice(0, 200)}`);
  const built = CI.createChallengeInstance({ challenger, defender, draftResult: dr.draft, challengerTacticId: challenger.standingOrders.tacticId, seedSource: seed, createdAt: FIXED_NOW,
    issuedBy: SA.SNAPSHOT_AUTHORITY.id, nonce: `c1-${key}-${seed}`, opponentKey: key, kind: CI.CHALLENGE_KINDS.formal });
  if (!built.ok) throw new Error(`instance: ${JSON.stringify(built.errors).slice(0, 200)}`);
  const r = R.runChallenge({ challenge: built.challenge, challengerSnapshot: challenger, defenderSnapshot: defender, currentSimulationVersion: simulationVersion, draftResult: dr.draft, heroOf: (id) => H.heroById(id) });
  if (!r.ok) throw new Error(`run: ${JSON.stringify(r.errors).slice(0, 200)}`);
  return { result: r.result, r0Hash: challenger.hash, defenderHash: defender.hash, draft: dr.draft.assignment, challengerTactic: built.challenge.challengerTacticId, defenderTactic: built.challenge.defenderTacticId };
}

if (flag("c1-worker")) {
  process.on("message", async (t) => {
    try {
      const { RS, F, OL } = await lib();
      const g = await playOne(t.fixture, t.seed, t.version);
      const def = F.fixtureOpponentByKey(t.fixture);
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, arm: t.arm, fixture: t.fixture, version: t.version, simulationVersion: g.result.simulationVersion, ruleset: RS.challengeRulesetForVersion(g.result.simulationVersion)?.rulesetId ?? null,
        matchSeed: g.result.matchSeed, layout: layoutOf(RS.challengeRulesetForVersion(g.result.simulationVersion)?.layers?.objectiveLayout, g.result.matchSeed, OL.objectiveLayoutForSeed), outcome: g.result.outcome, finished: g.result.finished, durationSec: g.result.durationSec, score: g.result.score,
        r0Hash: g.r0Hash, defenderHash: g.defenderHash, challengerTactic: g.challengerTactic, defenderTactic: g.defenderTactic, fixtureParams: { base: def.base, mastery: def.mastery, spread: def.spread, masteryEven: !!def.masteryEven }, draft: g.draft } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 臂與 seeds ────────────────────────────────────────────────────────────────
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, part: "M0", registration: sha16(REG_TEXT), fingerprint: FP };
const { FIXTURE_OPPONENTS } = await imp("src/platform/challenge/fixtureOpponents.js");
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const FIXTURES = FIXTURE_OPPONENTS.map((o) => o.key);
const SEEDS = seedsOfRange(REG.parts.M0.seeds.match(/(\d+-\d+)/)[1]);
const ARMS = VERSIONS.flatMap((version) => FIXTURES.map((fixture) => ({ arm: `${version === "moba-sim.v21" ? "v21" : "v20"}.${fixture}`, version, fixture })));
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
const taskOf = (x, seed) => ({ id: `${x.arm}#${seed}`, key: x.arm, seed, arm: x.arm, version: x.version, fixture: x.fixture });
const tasks = ARMS.flatMap((x) => SEEDS.map((s) => taskOf(x, s)));
if (flag("plan")) {
  console.log(`M0：${ARMS.length} 臂 × ${SEEDS.length} seeds（${SEEDS[0]}–${SEEDS.at(-1)} 奇數）＝ ${tasks.length} 場；R0＝新存檔、全英雄 Lv.1、戰術 ${R0_TACTIC}、自動選角`);
  for (const x of ARMS) { const d = FIXTURE_OPPONENTS.find((o) => o.key === x.fixture); console.log(`  ${x.arm.padEnd(22)} ${x.version}　base ${d.base}　mastery ${d.mastery}${d.masteryEven ? "（even）" : ""}　spread ${d.spread}　戰術 ${d.tacticId}`); }
  process.exit(0);
}
if (!String(REG.fingerprint).includes(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }

//  審查 #m6：--run 時把 validate 記下的 R0／對手快照雜湊釘住，跨 worker 漂移即時 HALT。
let PIN = null;
const recCheck = (r, t) => {
  const p = [], x = ARM[t?.arm ?? r.arm];
  if (PIN && x && (r.r0Hash !== PIN.r0Hash?.[x.version] || r.defenderHash !== PIN.defenderHash?.[x.arm])) p.push("snapshot hash drift");
  if (!x) return ["unknown arm"];
  if (t && (r.arm !== t.arm || r.seed !== t.seed || r.fixture !== t.fixture || r.version !== t.version)) p.push("identity mismatch");
  if (r.simulationVersion !== x.version) p.push(`simVersion ${r.simulationVersion}`);
  if (r.ruleset !== (x.version === "moba-sim.v21" ? "challenge.v21" : "challenge.v20")) p.push(`ruleset ${r.ruleset}`);
  if (r.matchSeed !== r.seed) p.push("matchSeed");
  if (r.layout !== (x.version === "moba-sim.v20" ? "STANDARD" : objectiveLayoutForSeed(r.seed))) p.push(`layout ${r.layout}`);
  if (r.challengerTactic !== R0_TACTIC) p.push("challenger tactic");
  const d = FIXTURE_OPPONENTS.find((o) => o.key === x.fixture);
  if (r.defenderTactic !== d.tacticId || r.fixtureParams?.base !== d.base || r.fixtureParams?.mastery !== d.mastery || r.fixtureParams?.spread !== d.spread) p.push("fixture params");
  return p;
};

if (flag("validate")) {
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  ck(`V0 臂數 10、seeds 400、場數 4000`, ARMS.length === 10 && SEEDS.length === 400 && tasks.length === 4000, `${ARMS.length}／${SEEDS.length}／${tasks.length}`);
  //  V1：重建＝store 正式路徑。store 的 seed 是 Math.random，取它凍結的 matchSeed 當 seedSource（toEngineSeed 對奇數是恆等）。
  const { P, CI } = await lib();
  const store = () => P.useProfileStore.getState();
  const v1 = [];
  for (const key of FIXTURES) {
    store().startNewGame("elite");
    const { HERO_ASSIGN } = await imp("src/data/roster.js");
    const FRESH = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
    const s = store().startFixtureChallenge(key, { tacticId: R0_TACTIC, heroProgress: FRESH });
    if (!s.ok) { v1.push(`${key}: start ${JSON.stringify(s.errors).slice(0, 80)}`); continue; }
    const inst = store().challenge.instances[s.challengeId];
    const run = store().runChallengeById(s.challengeId);
    const res = run?.result;
    const mine = await playOne(key, inst.matchSeed, inst.simulationVersion);
    const same = res && res.outcome === mine.result.outcome && res.durationSec === mine.result.durationSec && JSON.stringify(res.score) === JSON.stringify(mine.result.score)
      && JSON.stringify(inst.draftResult?.assignment ?? res.draft?.heroes) === JSON.stringify(mine.draft) && CI.toEngineSeed(inst.matchSeed) === inst.matchSeed;
    if (!same) v1.push(`${key}@${inst.simulationVersion}#${inst.matchSeed}: store ${res?.outcome}/${res?.durationSec} tool ${mine.result.outcome}/${mine.result.durationSec}`);
  }
  ck("V1 工具重建＝store 正式路徑（startFixtureChallenge＋runChallengeById；每個 fixture 一場，比 outcome／duration／score／draft；只驗得到旗標預設的版本）", v1.length === 0, v1.join(" ; "));
  //  審查 #m1：v21 無法與 store 比（旗標是常數）⇒ 改證「v21 快照扣掉版本、雜湊、時間後與 v20 逐欄相同」；v21 對局的等價由 instance／runner 從快照取版本推得。
  const { F } = await lib();
  const strip = (x) => { const o = structuredClone(x); for (const k of ["simulationVersion", "hash"]) delete o[k]; return JSON.stringify(o); };
  const v1b = [];
  if (strip(await r0Snapshot("moba-sim.v20")) !== strip(await r0Snapshot("moba-sim.v21"))) v1b.push("R0");
  for (const key of FIXTURES) if (strip(F.fixtureSnapshot(key, { playerMasteryLevel: 1, simulationVersion: "moba-sim.v20" }).snapshot) !== strip(F.fixtureSnapshot(key, { playerMasteryLevel: 1, simulationVersion: "moba-sim.v21" }).snapshot)) v1b.push(key);
  ck("V1b R0 與五個對手的 v21 快照扣掉 simulationVersion／hash 後與 v20 逐欄相同", v1b.length === 0, v1b.join(","));
  const vTasks = ARMS.flatMap((x) => SEEDS.slice(0, 3).map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: vTasks, workerFile: SELF, workerArgs: ["--c1-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "C1 M0 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const recs = vTasks.map((t) => readKey(VDIR, t.key).get(t.id));
  const bad = vTasks.map((t, i) => (recs[i] ? (recCheck(recs[i], t).length ? `${t.id}:${recCheck(recs[i], t).join("|")}` : null) : `${t.id}:missing`)).filter(Boolean);
  ck(`V2 每場：規則集＝版本、matchSeed＝seed、挑戰方戰術 m1、對手參數＝登記（${vTasks.length} 場）`, bad.length === 0, bad.slice(0, 4).join(" ; "));
  const hashes = Object.fromEntries(VERSIONS.map((v) => [v, new Set(recs.filter((r) => r?.version === v).map((r) => r.r0Hash))]));
  ck("V3 同一版本的每場 R0 快照雜湊相同（跨 worker 決定性）", VERSIONS.every((v) => hashes[v].size === 1), VERSIONS.map((v) => `${v}:${[...hashes[v]].join("/")}`).join(" "));
  const dh = Object.fromEntries(ARMS.map((x) => [x.arm, new Set(recs.filter((r) => r?.arm === x.arm).map((r) => r.defenderHash))]));
  ck("V3b 同一臂每場的對手快照雜湊相同", ARMS.every((x) => dh[x.arm].size === 1), ARMS.filter((x) => dh[x.arm].size !== 1).map((x) => x.arm).join(","));
  const out = { at: new Date().toISOString(), gitHead: provenance().gitHead, registrationHash: META.registration, pass, fail, r0Hash: Object.fromEntries(VERSIONS.map((v) => [v, [...hashes[v]][0] ?? null])),
    defenderHash: Object.fromEntries(ARMS.map((x) => [x.arm, [...dh[x.arm]][0] ?? null])) };
  fs.writeFileSync(path.join(VDIR, "VALIDATION.json"), JSON.stringify(out, null, 1));
  console.log(`\nvalidate：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}（${VDIR}/VALIDATION.json）`);
  process.exit(fail ? 1 : 0);
}

const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!REG.review?.reviewedAt || !/^APPROVE( WITH CHANGES)?\b/.test(REG.review?.verdict ?? "")) { console.error("登記未經審查通過"); process.exit(2); }
  if (insideRepo(DIR)) { console.error("--dir 必須在 repo 外"); process.exit(2); }
  const VDIR = val("vdir");
  const vj = VDIR && fs.existsSync(path.join(VDIR, "VALIDATION.json")) ? JSON.parse(fs.readFileSync(path.join(VDIR, "VALIDATION.json"), "utf8")) : null;
  if (!vj || vj.fail !== 0 || vj.registrationHash !== META.registration) { console.error("需要 --vdir 指向本登記通過的 --validate 結果"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  PIN = { registrationHash: META.registration, validateGitHead: vj.gitHead, validateAt: vj.at, r0Hash: vj.r0Hash, defenderHash: vj.defenderHash };
  fs.mkdirSync(DIR, { recursive: true });
  const pinFile = path.join(DIR, "PIN.json");
  if (fs.existsSync(pinFile) && fs.readFileSync(pinFile, "utf8") !== JSON.stringify(PIN, null, 1)) { console.error("資料夾已有不同出處的 PIN.json：拒跑"); process.exit(2); }
  fs.writeFileSync(pinFile, JSON.stringify(PIN, null, 1));
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--c1-worker"], meta: META, workers: Number(val("workers", 3)), label: "C1 M0", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場`); process.exit(6); }
  if (fs.existsSync(path.join(DIR, "PIN.json"))) { PIN = JSON.parse(fs.readFileSync(path.join(DIR, "PIN.json"), "utf8")); if (PIN.registrationHash !== META.registration) PIN = null; }
  const audit2 = PIN ? auditStudy(DIR, tasks, recCheck) : audit;
  const er = errorRule(audit2.errored.length, tasks.length);
  const recs = Object.fromEntries(ARMS.map((x) => [x.arm, readKey(DIR, x.arm)]));
  const R = (arm, s) => recs[arm].get(`${arm}#${s}`);
  const hashes = Object.fromEntries(VERSIONS.map((v) => [v, [...new Set(ARMS.filter((x) => x.version === v).flatMap((x) => SEEDS.map((s) => R(x.arm, s)?.r0Hash).filter(Boolean)))]]));
  const r0Deterministic = VERSIONS.every((v) => hashes[v].length === 1);
  //  審查 #M2：紀錄沒過即時檢查、錯誤超過 1%、或 R0 不決定 ⇒ INSTRUMENT，不排名、不寫結果。
  if (audit2.instrument.length || er === "STOP" || !r0Deterministic || !PIN) {
    console.error(`⛔ INSTRUMENT：即時檢查 ${audit2.instrument.length}、錯誤規則 ${er ?? "—"}、R0 決定性 ${r0Deterministic}、PIN ${PIN ? "有" : "無"}（不排名、不寫結果）`);
    for (const x of audit2.instrument.slice(0, 5)) console.error(`  ${x}`);
    process.exit(5);
  }
  const rows = ARMS.map((x) => {
    const rs = SEEDS.map((s) => R(x.arm, s)).filter(Boolean), ci = rateCI(rs.map((r) => winOf(r.outcome)));
    const fixedLayout = x.version === "moba-sim.v20";
    const half = (lay) => { if (fixedLayout) return null; const h = rs.filter((r) => r.layout === lay); return h.length ? rateCI(h.map((r) => winOf(r.outcome))) : null; };
    const strict = rateCI(rs.map((r) => strictWinOf(r.outcome)));
    return { arm: x.arm, version: x.version, fixture: x.fixture, ...ci, strictWin: { rate: strict.rate, lo: strict.lo, hi: strict.hi }, layoutNote: fixedLayout ? "layout fixed STANDARD (challenge.v20)" : null, unresolved: rs.filter((r) => r.outcome === "unresolved").length, medianDurationSec: median(rs.map((r) => r.durationSec)),
      standard: half("STANDARD"), swapped: half("SWAPPED"), targetBand: REG.targets?.bands?.[x.fixture] ?? null, inProposedBand: x.version === "moba-sim.v21" ? inBand(strict.rate, REG.targets?.bands?.[x.fixture]) : null };
  });
  const diffs = FIXTURES.map((f) => ({ fixture: f, v21MinusV20: pairedStats(SEEDS.filter((s) => R(`v21.${f}`, s) && R(`v20.${f}`, s)).map((s) => winOf(R(`v21.${f}`, s).outcome) - winOf(R(`v20.${f}`, s).outcome))) }));
  const byV = (v) => rows.filter((r) => r.version === v);
  const order = (v) => byV(v).slice().sort((a, b) => b.rate - a.rate).map((r) => r.fixture);
  const spread = (v) => Math.max(...byV(v).map((r) => r.rate)) - Math.min(...byV(v).map((r) => r.rate));
  const strictSpread = (v) => Math.max(...byV(v).map((r) => r.strictWin.rate)) - Math.min(...byV(v).map((r) => r.strictWin.rate));
  const out = { schema: "esmo.challenge-c1-m0-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    statsNote: "challenger (R0) win rate, unresolved = 0.5, Wilson 95% intervals, unadjusted; strictWin = challengerWin only (the slice3 scoring). challenge.v20 has a fixed STANDARD layout, so its halves are null and the paired v21 - v20 difference includes the layout change. Descriptive baseline, no verdict",
    outcome: er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "BASELINE", matches: tasks.length, errored: audit2.errored, errorRule: er,
    r0Hash: hashes, r0Deterministic, rows, v21MinusV20: diffs,
    ladder: Object.fromEntries(VERSIONS.map((v) => [v, { easiestToHardest: order(v), spread: spread(v), strictSpread: strictSpread(v), slice3Gradient: strictSpread(v) >= 0.2 }])) };
  const OUT = path.join(ROOT, OUT_REL);
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1));
  for (const v of VERSIONS) {
    console.log(`${v}：由易到難 ${order(v).join(" > ")}，最易－最難 ${pp(spread(v))}pp`);
    for (const r of byV(v)) console.log(`  ${r.fixture.padEnd(16)} ${pp(r.rate)}（${pp(r.lo)}..${pp(r.hi)}）　未分 ${r.unresolved}　只算勝 ${pp(r.strictWin.rate)}　中位 ${r.medianDurationSec}s　${r.layoutNote ? "佈局固定 STANDARD" : `STANDARD ${pp(r.standard?.rate)}／SWAPPED ${pp(r.swapped?.rate)}`}${r.inProposedBand == null ? "" : `　提案區間 ${r.targetBand?.split(" ")[0]} ${r.inProposedBand ? "內" : "外"}`}`);
  }
  for (const d of diffs) console.log(`v21－v20 ${d.fixture.padEnd(16)} ${pp(d.v21MinusV20?.mean)}（${pp(d.v21MinusV20?.lo)}..${pp(d.v21MinusV20?.hi)}）`);
  console.log(`結果 ${out.outcome}；錯誤 ${audit2.errored.length}${er ? `（${er}）` : ""}；R0 決定性 是`);
}
