// ============================================================================
//  tools/check_study_seed_plan_3aB.mjs — Phase 3a-B：發布研究的 seed 區段與實際引擎種子（effectiveSeed）去重（秒級，不跑對局）
//
//  執行：node tools/check_study_seed_plan_3aB.mjs
//
//  Owner 2026-10-25：E1／E2／G-A8／side bias 登記前，要確認各研究的組裝路徑與 seed 去重規則——Live 曾有 (seed >>> 0) | 1 正規化，
//  重複引擎種子的場次不能算成獨立樣本。計畫檔 tools/fixtures/study_seed_plan_3aB.json 寫死每個研究的區段、步長與組裝路徑；這支用
//  **正式程式碼的正規化函式**算出每個 seed 實際進引擎的種子：
//   engine    ＝ new LogicEngine(seed).seed（check_moba_tactic24 的路徑）
//   tool      ＝ balance runner buildBalanceMatchSetup(...).setup.seed（createMatchSetup，seedSource "tool"）
//   career    ＝ liveMatchSetup.normalizeLiveSeed(seed, "session")（buildLiveMatchSetup 用的就是它）
//   challenge ＝ challengeInstance.toEngineSeed(seed)
//
//  § U  區段：研究之間、與已用／保留區段都不重疊；repo 裡每一份登記／結果檔寫到的 seed 區段都被「已用」清單涵蓋（清單不得漏列）
//  § E  每個研究內 effectiveSeed 不重複、而且就是 seed 本身（強制奇數的路徑只走奇數）；所有研究之間 effectiveSeed 不相交
//  § L  配置（STANDARD／SWAPPED，依 effectiveSeed）：報告每個研究的數量；走 seed 的研究在區段內就能讓兩種配置都達標
//  § O  career 路徑的對手輪替（AI_TEAMS[seed % n]）在只走奇數時仍涵蓋每一隊
//  § N  反向測試：偶數 seed 混進 career 研究、區段重疊、清單漏列 ⇒ 都抓得到
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/study_seed_plan_3aB.json"), "utf8"));
const parse = (r) => r.split("-").map(Number);
const seedsOf = (st) => { const [a, b] = parse(st.range); const out = []; for (let s = a; s <= b; s += st.step) out.push(s); return out; };
const overlaps = (r1, r2) => { const [a, b] = parse(r1), [c, d] = parse(r2); return a <= d && c <= b; };

const { normalizeLiveSeed } = await imp("src/battle/moba/liveMatchSetup.js");
const { toEngineSeed } = await imp("src/platform/contracts/challengeInstance.js");
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const { AI_TEAMS } = await imp("src/platform/competition/aiTeams.js");
const { LogicEngine } = await imp("src/LogicEngine.js");
const Runner = await imp("tools/balance/moba_items_balance_runner.mjs");
const M = await Runner.modules();
const EFFECTIVE = {
  engine: (s) => new LogicEngine(s).seed,
  tool: (s) => Runner.buildBalanceMatchSetup(s, "standard", M, 1, Runner.mirroredRoster(s, M), null, "balanceTool.v21").setup.seed,
  career: (s) => normalizeLiveSeed(s, "session"),
  challenge: (s) => toEngineSeed(s),
};

// ════════════════════════════════════════════════════════════════════════════
console.log("§U 區段");
const studies = PLAN.studies;
const blocked = [...PLAN.usedRanges, ...PLAN.reservedRanges];
const pairHits = [];
for (let i = 0; i < studies.length; i++) for (let j = i + 1; j < studies.length; j++) if (overlaps(studies[i].range, studies[j].range)) pairHits.push(`${studies[i].id}×${studies[j].id}`);
ck("U1 研究之間的區段不重疊", pairHits.length === 0, pairHits.join("、"));
const usedHits = studies.flatMap((st) => blocked.filter((u) => overlaps(st.range, u.range)).map((u) => `${st.id}×${u.range}（${u.source}）`));
ck("U2 研究區段不碰任何已用或保留區段", usedHits.length === 0, usedHits.join("、"));
//  repo 裡寫到的區段：所有 tools/fixtures/*.json 的 "range"／"seeds" 字串（a-b）與 seedsFull 陣列。
function scanRanges() {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, "tools/fixtures")).filter((x) => x.endsWith(".json") && x !== "study_seed_plan_3aB.json")) {
    const text = fs.readFileSync(path.join(ROOT, "tools/fixtures", f), "utf8");
    for (const m of text.matchAll(/"(?:range|seeds|seedsFull)"\s*:\s*(?:"(\d+)-(\d+)"|\[\s*(\d+)\s*,\s*(\d+)\s*\])/g)) out.push({ f, range: `${m[1] ?? m[3]}-${m[2] ?? m[4]}` });
  }
  return out;
}
const within = (r, list) => { const [a, b] = parse(r); return list.some((u) => { const [c, d] = parse(u.range); return c <= a && b <= d; }); };
const scanned = scanRanges(), uncovered = scanned.filter((x) => !within(x.range, [...PLAN.usedRanges, ...PLAN.studies]));
ck(`U3 repo 登記／結果檔寫到的 ${scanned.length} 個區段都在「已用」清單或本計畫的研究區段內（清單沒有漏列）`, scanned.length > 10 && uncovered.length === 0, uncovered.slice(0, 5).map((x) => `${x.f}:${x.range}`).join("、"));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§E effectiveSeed");
const eff = new Map();
for (const st of studies) {
  const fn = EFFECTIVE[st.path];
  if (!fn) { ck(`E0 ${st.id}：認得的組裝路徑`, false, st.path); continue; }
  const seeds = seedsOf(st), effs = seeds.map(fn);
  const notIdentity = seeds.filter((s, i) => effs[i] !== s), dup = effs.length - new Set(effs).size;
  ck(`E1 ${st.id}（${st.path}，${st.range} 步長 ${st.step}，${seeds.length} 個 seed）：effectiveSeed 就是 seed 本身、不重複`, notIdentity.length === 0 && dup === 0, `非恆等 ${notIdentity.length}、重複 ${dup}`);
  eff.set(st.id, effs);
}
const all = [...eff.values()].flat();
ck("E2 所有研究之間 effectiveSeed 不相交", all.length === new Set(all).size, `${all.length} 個／不同 ${new Set(all).size}`);
//  已用區段在強制奇數的路徑下也不得撞到（例：已用的偶數上界 18800 在 career 路徑會變成 18801）。
const usedEff = new Set(PLAN.usedRanges.flatMap((u) => { const [a, b] = parse(u.range); return [EFFECTIVE.career(a), EFFECTIVE.career(b), a, b]; }));
ck("E3 研究的 effectiveSeed 不等於任何已用區段端點的 effectiveSeed", all.every((s) => !usedEff.has(s)));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§L 配置");
for (const st of studies) {
  const effs = eff.get(st.id); if (!effs) continue;
  if (st.walk) {
    let S = 0, W = 0, last = null;
    for (const e of effs) { if (objectiveLayoutForSeed(e) === "STANDARD") S++; else W++; if (S >= st.walk.targetPerLayout && W >= st.walk.targetPerLayout) { last = e; break; } }
    ck(`L1 ${st.id}：依序走到兩種配置各 ≥ ${st.walk.targetPerLayout} 時仍在區段內`, last !== null, last ? `停在 ${last}（STANDARD ${S}／SWAPPED ${W}）` : `區段走完只有 ${S}／${W}`);
  } else {
    const S = effs.filter((e) => objectiveLayoutForSeed(e) === "STANDARD").length;
    console.log(`　${st.id}：STANDARD ${S}／SWAPPED ${effs.length - S}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§O career 對手輪替");
for (const st of studies.filter((x) => x.path === "career")) {
  const cnt = new Array(AI_TEAMS.length).fill(0);
  for (const s of seedsOf(st)) cnt[s % AI_TEAMS.length]++;
  ck(`O1 ${st.id}：AI_TEAMS[seed % ${AI_TEAMS.length}] 只走奇數仍涵蓋每一隊（最少 ${Math.min(...cnt)}、最多 ${Math.max(...cnt)}）`, cnt.every((c) => c > 0) && Math.max(...cnt) - Math.min(...cnt) <= 1);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§N 反向測試");
ck("N1 career 路徑：偶數 seed 2k 的 effectiveSeed 是 2k+1（混進去就會重複）", EFFECTIVE.career(23002) === 23003 && EFFECTIVE.challenge(33002) === 33003);
ck("N2 區段重疊抓得到", overlaps("21001-22200", "22200-22300") && !overlaps("21001-22200", "22201-22300"));
ck("N3 漏列抓得到（拿掉 C6 的 4201-4600 ⇒ 有區段不在清單內）", scanned.some((x) => !within(x.range, PLAN.usedRanges.filter((u) => u.range !== "4201-4600"))));
ck("N4 tool 路徑會把 seed 原樣交給引擎（相鄰的偶數、奇數是兩個不同的引擎種子）", EFFECTIVE.tool(21002) === 21002 && EFFECTIVE.tool(21003) === 21003);

console.log(`\n${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
