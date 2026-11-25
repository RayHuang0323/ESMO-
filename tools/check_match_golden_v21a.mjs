#!/usr/bin/env node
// ============================================================================
//  tools/check_match_golden_v21a.mjs — Phase 3a-C1 Task 7：v21-A golden baseline 的 check mode（gate G-AC1）
//
//  執行：node tools/check_match_golden_v21a.mjs          （109 案重跑，數分鐘；一律走 tools/verify.mjs 的 match_golden_v21a 段）
//
//  CHECK mode 的案例清單完全由 fixture 內存的 params 重建（L.specsFromFixture），不依賴戰術書現在的提供清單；
//  capture 工具仍用 buildCaseList 推導（錄製時）。
//  把 tools/fixtures/match_golden_v21a.json（在 C2 之前的最終樹上錄的）逐案重跑，要求 digest／streamHash／resultHash／
//  configure 序列（方法＋引數雜湊）全部相同，而且案例清單沒有多也沒有少。C2（LogicEngine 改成經過 Tactical Director 讀戰術資料）
//  之後再跑一次：全綠＝逐位元相同。
//
//   P   出處釘死：fixture.gitHead 與 fixture.fingerprint 必須等於本檔的字面常數（PINNED_*）。重錄基準線是刻意行為，
//       必須在 PR 中看得見地改這兩個常數（Owner 可見），不能只重跑 capture 就悄悄換掉基準。
//   F   fixture 結構：schema、案例數（v20 39＋模板 42＋提供的選擇 16＋紅方 binding 12＝109）、21 模板各 2 案、fixture 內存的提供清單
//       與其 binding-choice 案自洽（8 個非本來選擇各 2 案）。「戰術書現在的提供清單 vs 錄製時」只是資訊行（F4i），不計入通過數：
//       戰術書日後正當地改了提供清單，不應讓這支 gate 假紅。
//   N   負向自檢（合成資料）：竄改一案的雜湊／少一案／多一案／順序改變／calls 改變，比對函式都要報出來
//   C   逐案重跑，與 fixture 逐欄相同（每案一條檢查）；案例清單（缺／多）一條
//   K   版本事實修正表（Phase 3a-B；Owner 2026-10-25 **事後核准**的更正，不是事前登記）：tools/fixtures/match_golden_v21a_corrections.json
//       釘住 12 個 Challenge 案的 simulationVersion／challengeId／draft.hash 舊值、新值與新舊 resultHash。那 12 案：digest／streamHash／
//       configure 序列／params 仍要與 fixture 逐位元相同；結果的三欄必須＝新值、resultHash＝新值、三欄換回舊值後的雜湊＝原 fixture；
//       表外的案照舊逐欄比對。原始 fixture 不重錄。反向測試：竄改表的新值／舊值、結果多差一欄、表多列一個沒變的案 ⇒ 都抓得到。
//   V   旗標關閉的版本化預期（Owner 2026-11-25 核准選項 2）：3a-B 已登記的 40 個 binding 案，只在 mobaTacticalDirectorV21===false 且
//       live 解析出 career.v20 時，改與 tools/fixtures/match_golden_v21a_flagsoff_v20.json（main 053fd582 基準，內容雜湊釘死）四欄全比；
//       預期值必須通過三項獨立證據（3a-B 79cc4276 的旗標關閉 digest、fixture 的 std 紀錄、同 seed 所有變體全同）。其他旗標狀態一律原 fixture。
//       反向測試：旗標錯誤、未知案例、真正結果差異、未登記變更、白名單式假表、fixture 副本被改 ⇒ 都抓得到。v21 啟用驗證不在本段範圍。
//   I   資訊（不計入通過數）：F4i 提供清單差異、simVersion／指紋與 fixture 的差異。C2 改到語意檔時指紋會變，那不是這支 gate 要判的事（版本 gate 另有）。
// ============================================================================
import fs from "node:fs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const progress = (s) => process.stderr.write(`  ${s}\n`);

const L = await import("./lib/matchGoldenV21a.mjs");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../src/platform/contracts/simulationVersion.js");
const { FEATURE_FLAGS } = await import("../src/featureFlags.js");
const { resolveRulesetForMode } = await import("../src/platform/contracts/matchRuleset.js");
const { LIVE_RULESET_MODE } = await import("../src/battle/moba/liveMatchSetup.js");
const { createHash } = await import("node:crypto");

ck("P0 runner 載入的引擎類別＝src/LogicEngine.js 的同一個類別（探針三條路徑量到同一棵樹）", L.PROBE_SHARES_RUNNER_ENGINE);

const fixture = JSON.parse(fs.readFileSync(L.FIXTURE_V21A, "utf8"));
const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
const cases = L.specsFromFixture(fixture);

// ── P：出處釘死（重錄基準線＝刻意行為，要改這兩個常數）────────────────────────────
const PINNED_GIT_HEAD = "0e3c022426f8869f88668c73997a7dca719b4b08";
const PINNED_FINGERPRINT = "29140fe0cb5a4c86";
const provenanceProblems = (fx) => [
  ...(fx.gitHead === PINNED_GIT_HEAD ? [] : [`gitHead ${fx.gitHead} != pinned ${PINNED_GIT_HEAD}`]),
  ...(fx.fingerprint === PINNED_FINGERPRINT ? [] : [`fingerprint ${fx.fingerprint} != pinned ${PINNED_FINGERPRINT}`]),
];
const REREC = "重錄基準線是刻意行為：必須在 PR 中看得見地修改本檔的 PINNED_GIT_HEAD／PINNED_FINGERPRINT（Owner 可見）";
ck("P1 fixture.gitHead＝本檔釘死的字面常數", fixture.gitHead === PINNED_GIT_HEAD, fixture.gitHead === PINNED_GIT_HEAD ? fixture.gitHead.slice(0, 8) : `${fixture.gitHead} ≠ ${PINNED_GIT_HEAD}。${REREC}`);
ck("P2 fixture.fingerprint＝本檔釘死的字面常數", fixture.fingerprint === PINNED_FINGERPRINT, fixture.fingerprint === PINNED_FINGERPRINT ? fixture.fingerprint : `${fixture.fingerprint} ≠ ${PINNED_FINGERPRINT}。${REREC}`);

// ── F：fixture 結構 ─────────────────────────────────────────────────────────
const nOf = (g) => fixture.cases.filter((c) => c.group === g).length;
ck("F1 schema＝match_golden_v21a.v1", fixture.schema === L.SCHEMA, fixture.schema);
ck("F2 案例數：v20 39（live 9、challenge 12、runner 18）＋模板 42＋提供的選擇 16＋紅方 binding 12＝109",
  fixture.cases.length === 109 && nOf("v20") === 39 && nOf("binding-template") === 42 && nOf("binding-choice") === 16 && nOf("binding-red") === 12
  && ["live", "challenge", "runner"].every((p, i) => fixture.cases.filter((c) => c.group === "v20" && c.path === p).length === [9, 12, 18][i]),
  `v20 ${nOf("v20")}、template ${nOf("binding-template")}、choice ${nOf("binding-choice")}`);
const tplIds = [...new Set(fixture.cases.filter((c) => c.group === "binding-template").map((c) => c.params.templateId))];
ck("F3 21 個模板（含 std）各有 2 個 seed 的案例", tplIds.length === 21 && tplIds.includes("std")
  && tplIds.every((t) => new Set(fixture.cases.filter((c) => c.group === "binding-template" && c.params.templateId === t).map((c) => c.seed)).size === 2));
const offeredFx = fixture.offeredOnStd ?? [];
ck(`F4 fixture 內存的提供清單與其 binding-choice 案自洽（${L.EXPECT_OFFERED_ON_STD} 個非本來選擇，每個 2 個 seed；不比對戰術書現況）`,
  offeredFx.length === L.EXPECT_OFFERED_ON_STD
  && offeredFx.every((o) => fixture.cases.filter((c) => c.group === "binding-choice" && c.params.dimension === o.dimension && c.params.choice === o.choice).length === 2),
  offeredFx.map((o) => `${o.dimension}=${o.choice}`).join(" "));
ck("F5 binding 案都是 live 路徑、紅方＝標準對手；每案有 bindingHash", fixture.cases.filter((c) => c.group === "binding-template" || c.group === "binding-choice").every((c) => c.path === "live" && c.params.redTactic === "std" && /^[0-9a-f]{1,8}$/.test(c.bindingHash)));
ck("F6 每案都有 digest／streamHash／resultHash／configure 序列", fixture.cases.every((c) => c.digest && /^[0-9a-f]{1,8}$/.test(c.streamHash) && /^[0-9a-f]{1,8}$/.test(c.resultHash) && c.calls.length > 0));
ck("F8 紅方 binding 案（runner 路徑，紅方帶 splitLane/protectRole）的 streamHash 都與同 seed 紅方 std 的對照案（v20:runner-standard-<seed>）不同＝真的讀到了",
  fixture.cases.filter((c) => c.group === "binding-red").length === 12
  && fixture.cases.filter((c) => c.group === "binding-red").every((c) => c.path === "runner" && c.params.red && fixture.cases.find((x) => x.id === `v20:runner-standard-${c.seed}`)?.streamHash !== c.streamHash));
ck("F7 v20 fixture 沒變（案例數與 gitHead 同錄製時）", fixture.v20Fixture.cases === v20.cases.length && fixture.v20Fixture.gitHead === v20.gitHead);

// ── N：負向自檢 ─────────────────────────────────────────────────────────────
const clone = (x) => JSON.parse(JSON.stringify(x));
const asObserved = () => clone(fixture.cases);
{
  const same = L.compareToFixture(fixture, asObserved());
  ck("N0 原樣比對＝0 差異", same.problems.length === 0 && same.matched === fixture.cases.length);
  const t1 = asObserved(); t1[5].streamHash = t1[5].streamHash === "00000000" ? "00000001" : "00000000";
  const r1 = L.compareToFixture(fixture, t1);
  ck("N1 竄改一案的 streamHash ⇒ 報出該案", r1.problems.length === 1 && r1.problems[0].startsWith(`${fixture.cases[5].id}:`) && r1.problems[0].includes("streamHash"), r1.problems[0] ?? "");
  const t2 = asObserved(); t2[7].resultHash = "deadbeef"; t2[9].digest = "0.0:x:0:0:0:0";
  const r2 = L.compareToFixture(fixture, t2);
  ck("N2 竄改 resultHash 與 digest ⇒ 兩案都報出", r2.problems.length === 2 && r2.matched === fixture.cases.length - 2);
  const t3 = asObserved(); const dropped = t3.splice(50, 1)[0];
  const r3 = L.compareToFixture(fixture, t3);
  ck("N3 少一案（fixture 有、現在沒跑到）⇒ 報 missing", r3.problems.some((p) => p.startsWith("missing case") && p.endsWith(dropped.id)), r3.problems[0] ?? "");
  const t4 = asObserved(); t4.push({ ...clone(t4[0]), id: "extra:case" });
  const r4 = L.compareToFixture(fixture, t4);
  ck("N4 多一案 ⇒ 報 extra", r4.problems.some((p) => p.startsWith("extra case") && p.endsWith("extra:case")), r4.problems[0] ?? "");
  const t5 = asObserved(); t5[20].calls[0].h = "ffffffff";
  const r5 = L.compareToFixture(fixture, t5);
  ck("N5 configure 引數雜湊不同 ⇒ 報 calls 差異", r5.problems.length === 1 && r5.problems[0].includes("configure calls differ at #0"), r5.problems[0] ?? "");
  const t6 = asObserved(); [t6[1], t6[2]] = [t6[2], t6[1]];
  const r6 = L.compareToFixture(fixture, t6);
  ck("N6 案例順序改變 ⇒ 報 order", r6.problems.includes("case order differs"));
  const fxBadHead = { ...fixture, gitHead: "1".repeat(40) };
  ck("N8 fixture.gitHead 與釘死值不同 ⇒ provenance 檢查報出", provenanceProblems(fxBadHead).length === 1 && provenanceProblems(fxBadHead)[0].startsWith("gitHead") && provenanceProblems(fixture).length === 0);
  const fxBadFp = { ...fixture, fingerprint: "0000000000000000" };
  ck("N9 fixture.fingerprint 與釘死值不同 ⇒ provenance 檢查報出", provenanceProblems(fxBadFp).length === 1 && provenanceProblems(fxBadFp)[0].startsWith("fingerprint"));
  const t7 = asObserved(); t7[40].params = { ...t7[40].params, choices: { x: 1 } };
  ck("N7 案例輸入（params）改變 ⇒ 報出", L.compareToFixture(fixture, t7).problems.some((p) => p.includes("params differ")));
}

// ── K：版本事實修正表（結構）──────────────────────────────────────────────
const CORR = JSON.parse(fs.readFileSync(new URL("./fixtures/match_golden_v21a_corrections.json", import.meta.url), "utf8"));
const CORR_FIELDS = ["simulationVersion", "challengeId", "draft.hash"];
const corrById = new Map(CORR.cases.map((c) => [c.id, c]));
const fxById = new Map(fixture.cases.map((c) => [c.id, c]));
ck("K0 修正表：schema、指向這份 fixture（gitHead／指紋相同）、恰好 12 案且全部是 Challenge 案、三欄、舊 resultHash＝fixture、標明是事後核准",
  CORR.schema === "esmo.golden-version-fact-corrections.v1" && CORR.fixtureGitHead === fixture.gitHead && CORR.fixtureFingerprint === fixture.fingerprint
  && CORR.cases.length === 12 && corrById.size === 12 && CORR.cases.every((c) => fxById.get(c.id)?.path === "challenge" && fxById.get(c.id).resultHash === c.oldResultHash)
  && JSON.stringify(CORR.fields) === JSON.stringify(CORR_FIELDS) && /post-hoc correction, NOT a pre-registration/.test(CORR.approval)
  && CORR.cases.every((c) => c.old.simulationVersion === "moba-sim.v21" && c.new.simulationVersion === "moba-sim.v20"));
const getF = (r, f) => (f === "draft.hash" ? r?.draft?.hash ?? null : r?.[f]);
const setF = (r, f, v) => (f === "draft.hash" ? (r.draft ? { ...r, draft: { ...r.draft, hash: v } } : r) : { ...r, [f]: v });
/** 修正表一列 × 目前結果 ⇒ 問題清單（空＝成立）。只看結果；引擎欄位由 compareToFixture 照常比。 */
function correctionProblems(entry, fxCase, rec) {
  const out = [], r = rec?.challengeResult;
  if (!r) return ["no challenge result"];
  for (const f of CORR_FIELDS) if (JSON.stringify(getF(r, f)) !== JSON.stringify(entry.new[f])) out.push(`${f} ${getF(r, f)} != new ${entry.new[f]}`);
  if (rec.resultHash !== entry.newResultHash) out.push(`resultHash ${rec.resultHash} != new ${entry.newResultHash}`);
  let back = r; for (const f of CORR_FIELDS) back = setF(back, f, entry.old[f]);
  if (L.resultHashOf(back) !== fxCase.resultHash) out.push(`old-value reconstruction ${L.resultHashOf(back)} != fixture ${fxCase.resultHash} (another field differs)`);
  return out;
}

// ── V：旗標關閉的版本化預期（Owner 2026-11-25 核准選項 2；3a-B 已登記的 40 個 binding 案）──────────────
//  v21 fixture 是 v21 旗標開啟時錄的（0e3c0224）。正式站旗標關閉時 live 解析出 career.v20，binding 不生效 ⇒ 這 40 案改與
//  tools/fixtures/match_golden_v21a_flagsoff_v20.json 的預期值逐欄比對（digest／streamHash／resultHash／configure 序列）。
//  預期值在 main 053fd582（已發布、C1／C2 之前）上由 tools/capture_golden_v21a_flagsoff.mjs 產生，並且必須通過三項獨立證據：
//  3a-B 逐案分類（79cc4276）的旗標關閉 digest、fixture 自己錄的 std 紀錄（同 seed 四項全同）、同 seed 所有變體四項全同。
//  只在「旗標確實為 false 且 live 確實解析出 career.v20」時套用；其他狀態（包括旗標開啟、旗標缺漏）一律回到原 fixture 比對＝原契約。
//  ⚠ 這不是 v21 啟用驗證：v21 開啟時的契約仍是原 fixture，本次執行沒有在旗標開啟下重跑。
//  ⚠ 重錄＝刻意行為：必須看得見地改 PINNED_FLAGSOFF_TABLE_SHA256。原 fixture、指紋、PINNED_* 與 K 段都不動。
const PINNED_FLAGSOFF_TABLE_SHA256 = "d79fde83c85f9ebc73a75c58b0af1c81cdd1443ca6fc5ba7fe1af8ec813d072e";
const PINNED_FLAGSOFF_BASELINE = "053fd5823522aad2cb07a4c91609020475e31a26";
const FLAGSOFF_PATH = new URL("./fixtures/match_golden_v21a_flagsoff_v20.json", import.meta.url);
const CLASSIFICATION = JSON.parse(fs.readFileSync(new URL("../review/tactic-book-3a/3a-B_整合_golden_v21a分類.json", import.meta.url), "utf8"));
const FLAGSOFF_TEXT = fs.readFileSync(FLAGSOFF_PATH, "utf8");
const FLAGSOFF = JSON.parse(FLAGSOFF_TEXT);
const callsHashOf = (calls) => createHash("sha256").update(JSON.stringify((calls ?? []).map(({ m, h }) => ({ m, h })))).digest("hex").slice(0, 16);
const tupleOf = (r) => ({ digest: r.digest, streamHash: r.streamHash, resultHash: r.resultHash, callsHash: callsHashOf(r.calls) });
/** 旗標狀態 ⇒ 是否套用旗標關閉的預期。缺漏或任何非 false 的值都不套用（fail closed）。 */
const flagsOffApplies = (flags) => flags?.mobaTacticalDirectorV21 === false && resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags }).rulesetId === "career.v20";
/** 表的結構與出處 ⇒ 問題清單。 */
function vStructureProblems(t, fx, cls) {
  const out = [];
  if (t.schema !== "esmo.golden-versioned-expectation.v1") out.push("schema");
  if (t.fixture?.gitHead !== fx.gitHead || t.fixture?.fingerprint !== fx.fingerprint) out.push("table does not point at this fixture");
  if (t.condition?.flag !== "mobaTacticalDirectorV21" || t.condition?.flagValue !== false || t.condition?.liveRuleset !== "career.v20") out.push("condition");
  if (t.baseline?.gitHead !== PINNED_FLAGSOFF_BASELINE) out.push(`baseline ${t.baseline?.gitHead} != pinned ${PINNED_FLAGSOFF_BASELINE}`);
  const ids = (t.cases ?? []).map((c) => c.id), clsIds = cls.rows.map((r) => r.id);
  if (ids.length !== 40 || new Set(ids).size !== 40) out.push(`case count ${ids.length}`);
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...clsIds].sort())) out.push("case ids != the 40 ids registered in 3a-B");
  const byId = new Map(fx.cases.map((c) => [c.id, c]));
  for (const c of t.cases ?? []) {
    const f = byId.get(c.id);
    if (!f) { out.push(`${c.id}: not a fixture case`); continue; }
    if (!["binding-template", "binding-choice"].includes(f.group) || f.path !== "live" || f.seed !== c.seed) out.push(`${c.id}: not a live binding case of seed ${c.seed}`);
    if (JSON.stringify(c.fixture) !== JSON.stringify(tupleOf(f))) out.push(`${c.id}: table's copy of the fixture record differs from the fixture`);
  }
  return out;
}
/** 表的預期值 × 三項獨立證據 ⇒ 問題清單。 */
function vEvidenceProblems(t, fx, cls) {
  const out = [], seedKey = new Map(), byId = new Map(fx.cases.map((c) => [c.id, c]));
  for (const c of t.cases ?? []) {
    const e = c.expected ?? {}, key = JSON.stringify(tupleOf(e));
    const row = cls.rows.find((r) => r.id === c.id);
    if (!row || row.nowDigest !== e.digest) out.push(`${c.id}: expected digest ${e.digest} != 3a-B flags-off digest ${row?.nowDigest}`);
    if (!seedKey.has(c.seed)) seedKey.set(c.seed, key); else if (seedKey.get(c.seed) !== key) out.push(`${c.id}: differs from another variant of seed ${c.seed}`);
    const std = byId.get(`bind-template:std:s${c.seed}`);
    if (std && JSON.stringify(tupleOf(std)) !== key) out.push(`${c.id}: != fixture std:s${c.seed}`);
  }
  return out;
}
/** 一案的實際結果 × 表的預期 ⇒ 問題清單（四欄全比）。 */
function vCaseProblems(entry, rec) {
  if (!rec) return ["not run"];
  const e = entry.expected, out = [];
  for (const k of ["digest", "streamHash", "resultHash"]) if (rec[k] !== e[k]) out.push(`${k} ${rec[k]} != expected ${e[k]}`);
  if (JSON.stringify(rec.calls.map(({ m, h }) => ({ m, h }))) !== JSON.stringify(e.calls)) out.push("configure calls != expected");
  return out;
}
const VAPPLY = flagsOffApplies(FEATURE_FLAGS);
const vById = new Map(FLAGSOFF.cases.map((c) => [c.id, c]));
const tableSha = createHash("sha256").update(FLAGSOFF_TEXT).digest("hex");
ck("V0 旗標關閉預期表：schema、指向這份 fixture、條件＝mobaTacticalDirectorV21 false／career.v20、基準＝main 053fd582、恰好 40 案＝3a-B 登記的 40 個 id、每案是 live binding 案且表內的 fixture 副本＝fixture",
  vStructureProblems(FLAGSOFF, fixture, CLASSIFICATION).length === 0, vStructureProblems(FLAGSOFF, fixture, CLASSIFICATION).slice(0, 3).join(" | "));
ck("V1 預期表內容雜湊＝本檔釘死的 PINNED_FLAGSOFF_TABLE_SHA256（任何改動都要看得見地改常數）", tableSha === PINNED_FLAGSOFF_TABLE_SHA256, tableSha);
ck("V2 預期值的三項獨立證據：40 案 digest＝3a-B 旗標關閉紀錄（79cc4276）、同 seed 所有變體四項全同、有 std 紀錄的 seed 四項＝fixture std 紀錄",
  vEvidenceProblems(FLAGSOFF, fixture, CLASSIFICATION).length === 0, vEvidenceProblems(FLAGSOFF, fixture, CLASSIFICATION).slice(0, 3).join(" | "));
console.log(`ℹ V 狀態：mobaTacticalDirectorV21=${FEATURE_FLAGS.mobaTacticalDirectorV21}、live 規則集=${resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags: FEATURE_FLAGS }).rulesetId} ⇒ ${VAPPLY ? "40 案依旗標關閉預期比對" : "旗標不是關閉狀態：40 案依原 fixture 比對（原契約）"}。v21 啟用驗證：本次未執行。`);

// ── C：逐案重跑 ─────────────────────────────────────────────────────────────
const observed = [];
const failedRun = new Map();
const t0 = Date.now();
for (const [n, spec] of cases.entries()) {
  try { observed.push(L.recordOf(spec, v20)); } catch (e) { failedRun.set(spec.id, String(e.message ?? e)); }
  progress(`${n + 1}/${cases.length} ${spec.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
//  修正表內的案：resultHash 的差異改由 correctionProblems 嚴格判定（其他欄位照 compareToFixture）。
const corrResults = new Map();
//  V 段：旗標關閉時，表上的 40 案改與表的預期值四欄全比；全部成立才視同 fixture（交給 compareToFixture 的只剩 params／bindingHash 等輸入欄位），
//  任何一欄不同就保留原樣 ⇒ compareToFixture 照常報出、V 結果也報出。旗標不是關閉狀態 ⇒ 完全不碰（原契約）。
const vResults = new Map();
const vSubstitute = (applies, o) => {
  const entry = applies ? vById.get(o.id) : null;
  if (!entry) return o;
  const p = vCaseProblems(entry, o);
  vResults.set(o.id, p);
  const f = fxById.get(o.id);
  return p.length === 0 ? { ...o, digest: f.digest, streamHash: f.streamHash, resultHash: f.resultHash, calls: f.calls } : o;
};
const observedForCmp = observed.map((o0) => {
  const o = vSubstitute(VAPPLY, o0);
  const e = corrById.get(o.id);
  if (!e) return o;
  corrResults.set(o.id, correctionProblems(e, fxById.get(o.id), o));
  return corrResults.get(o.id).length === 0 ? { ...o, resultHash: fxById.get(o.id).resultHash } : o;
});
const cmp = L.compareToFixture(fixture, observedForCmp);
const listProblems = cmp.problems.filter((p) => /^(missing|extra) case|^case order/.test(p));
ck("C0 案例清單＝fixture（沒有缺、沒有多、順序相同）", listProblems.length === 0 && failedRun.size === 0, [...listProblems, ...[...failedRun].map(([i, m]) => `${i}: ${m}`)].join(" | "));
for (const c of fixture.cases) {
  const mine = cmp.problems.filter((p) => p.startsWith(`${c.id}:`));
  const run = failedRun.get(c.id);
  const cp = corrResults.get(c.id) ?? [];
  const vp = vResults.get(c.id) ?? [];
  const vNote = VAPPLY && vById.has(c.id) ? "（旗標關閉：依版本化預期＝v20 標準運營，main 053fd582 基準＋三項獨立證據）" : "";
  ck(`C ${c.id}　digest＋streamHash＋resultHash＋configure 序列＝fixture${corrById.has(c.id) ? "（resultHash 依版本事實修正表：只差三個身分欄位）" : ""}${vNote}`, mine.length === 0 && cp.length === 0 && vp.length === 0 && !run, run ?? [...mine, ...cp, ...vp].join("; "));
}
ck(`V3 ${VAPPLY ? "旗標關閉：表上 40 案的實際結果全部＝版本化預期（四欄）" : "旗標不是關閉狀態：表未套用，40 案依原 fixture 比對"}`,
  VAPPLY ? FLAGSOFF.cases.every((e) => (vResults.get(e.id) ?? ["not run"]).length === 0) : vResults.size === 0,
  VAPPLY ? FLAGSOFF.cases.filter((e) => (vResults.get(e.id) ?? ["x"]).length).map((e) => e.id).join(" ") : "");
// ── V：反向測試（用真的重跑結果）────────────────────────────────────────────
{
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const recOf = (id) => observed.find((o) => o.id === id);
  const v0 = FLAGSOFF.cases[0], rec0 = recOf(v0.id);
  //  ① 旗標錯誤：V21 開啟、旗標缺漏、旗標是字串 "false" ⇒ 不套用；V21 開啟時用真的結果走原契約 ⇒ 40 案會被報出
  const onApplies = flagsOffApplies({ ...FEATURE_FLAGS, mobaTacticalDirectorV21: true });
  const missing = { ...FEATURE_FLAGS }; delete missing.mobaTacticalDirectorV21;
  const cmpOn = L.compareToFixture(fixture, observed.map((o) => vSubstitute(false, o)));
  const flaggedOn = FLAGSOFF.cases.filter((e) => cmpOn.problems.some((p) => p.startsWith(`${e.id}:`))).length;
  ck("VN1 反向：旗標錯誤（V21 開、旗標缺漏、字串 \"false\"）⇒ 不套用；V21 開時以原 fixture 比對，40 案全部被擋",
    !onApplies && !flagsOffApplies(missing) && !flagsOffApplies({ ...FEATURE_FLAGS, mobaTacticalDirectorV21: "false" }) && flaggedOn === 40, `擋下 ${flaggedOn}/40`);
  //  ② 未知案例：表外的案結果不同 ⇒ 照樣報出；表多列一個未登記的案 ⇒ 結構不成立
  const outsider = fixture.cases.find((c) => c.group === "v20" && c.path === "live");
  const tamperedOutsider = observed.map((o) => (o.id === outsider.id ? { ...o, digest: "0.0:x:0:0:0:0" } : o)).map((o) => vSubstitute(true, o));
  const planted = clone(FLAGSOFF); planted.cases.push({ ...clone(v0), id: outsider.id, seed: outsider.seed });
  ck("VN2 反向：未知案例——表外案結果不同仍被報出；表多列一個未登記案 ⇒ V0 不成立",
    L.compareToFixture(fixture, tamperedOutsider).problems.some((p) => p.startsWith(`${outsider.id}:`)) && vStructureProblems(planted, fixture, CLASSIFICATION).length > 0);
  //  ③ 真正結果差異：表上的案實際 streamHash／resultHash／configure 序列任何一項不同 ⇒ 抓到
  const r1 = { ...rec0, streamHash: rec0.streamHash === "00000000" ? "00000001" : "00000000" };
  const r2 = { ...rec0, resultHash: "deadbeef" };
  const r3 = { ...rec0, calls: rec0.calls.map((c, i) => (i === 0 ? { ...c, h: "ffffffff" } : c)) };
  ck("VN3 反向：表上案的實際結果真的不同（streamHash／resultHash／configure 序列）⇒ 抓到",
    !!rec0 && vCaseProblems(v0, r1).some((x) => x.startsWith("streamHash")) && vCaseProblems(v0, r2).some((x) => x.startsWith("resultHash")) && vCaseProblems(v0, r3).includes("configure calls != expected"));
  //  ④ 未登記變更：改表的預期值（不論 digest 或只改 streamHash）⇒ 獨立證據不成立；改了任何位元組 ⇒ 內容雜湊不符
  const badDigest = clone(FLAGSOFF); badDigest.cases[0].expected.digest = rec0?.digest === "1.0:x:0:0:0:0" ? "2.0:x:0:0:0:0" : "1.0:x:0:0:0:0";
  const badStream = clone(FLAGSOFF); badStream.cases[0].expected.streamHash = "0badf00d";
  const editedText = JSON.stringify(badStream, null, 1) + "\n";
  ck("VN4 反向：未登記變更——改預期 digest ⇒ 與 3a-B 紀錄不符；只改 streamHash ⇒ 同 seed／std 證據不符；改任何位元組 ⇒ 內容雜湊≠釘死值",
    vEvidenceProblems(badDigest, fixture, CLASSIFICATION).some((x) => x.includes("3a-B")) && vEvidenceProblems(badStream, fixture, CLASSIFICATION).length > 0
    && createHash("sha256").update(editedText).digest("hex") !== PINNED_FLAGSOFF_TABLE_SHA256);
  //  ⑤ 不是只靠 id 白名單：把預期改成「剛好等於這次跑出來的值」的假表（白名單式），若與證據不符一樣不成立；表內 fixture 副本被改 ⇒ V0 不成立
  const whitelist = clone(FLAGSOFF); whitelist.cases = whitelist.cases.map((c) => ({ ...c, expected: { ...c.expected, digest: fixture.cases.find((f) => f.id === c.id).digest } }));
  const badCopy = clone(FLAGSOFF); badCopy.cases[0].fixture.digest = "9.9:x:0:0:0:0";
  ck("VN5 反向：不是 id 白名單——把預期改成任意值（例：原 fixture 的 v21 值）⇒ 證據不成立；表內 fixture 副本被改 ⇒ V0 不成立",
    vEvidenceProblems(whitelist, fixture, CLASSIFICATION).length >= 40 && vStructureProblems(badCopy, fixture, CLASSIFICATION).some((x) => x.includes("copy of the fixture")));
}
ck("K1 修正表的 12 案全部成立（三欄＝新值、resultHash＝新值、換回舊值＝原 fixture）", CORR.cases.every((e) => (corrResults.get(e.id) ?? ["not run"]).length === 0),
  CORR.cases.filter((e) => (corrResults.get(e.id) ?? ["x"]).length).map((e) => e.id).join(" "));
// ── K：反向測試（用真的重跑結果）────────────────────────────────────────────
{
  const e0 = CORR.cases[0], rec0 = observed.find((o) => o.id === e0.id), fx0 = fxById.get(e0.id);
  const badNew = { ...e0, new: { ...e0.new, challengeId: "chal:00000000:00000000" } };
  const badOld = { ...e0, old: { ...e0.old, "draft.hash": "deadbeef" } };
  const recMore = rec0 ? Object.defineProperty({ ...rec0 }, "challengeResult", { value: { ...rec0.challengeResult, durationSec: rec0.challengeResult.durationSec + 1 }, enumerable: false }) : null;
  ck("K2 反向：竄改表的新值 ⇒ 抓到", !!rec0 && correctionProblems(badNew, fx0, rec0).some((x) => x.startsWith("challengeId")));
  ck("K3 反向：竄改表的舊值 ⇒ 舊值重建對不上原 fixture ⇒ 抓到", !!rec0 && correctionProblems(badOld, fx0, rec0).some((x) => x.startsWith("old-value reconstruction")));
  ck("K4 反向：結果多差一個表外欄位（時長 +1）⇒ 抓到", !!recMore && correctionProblems(e0, fx0, recMore).some((x) => x.startsWith("old-value reconstruction")));
  const liveId = fixture.cases.find((c) => c.path === "live").id;
  const plantedTable = [...CORR.cases, { ...e0, id: liveId }];
  const liveRec = observed.find((o) => o.id === liveId);
  ck("K5 反向：表多列一個非 Challenge 案 ⇒ K0 的結構規則不成立，而且走 correctionProblems 也不會被原諒（沒有挑戰結果）",
    !plantedTable.every((c) => fxById.get(c.id)?.path === "challenge") && !!liveRec && correctionProblems({ ...e0, id: liveId }, fxById.get(liveId), liveRec).length > 0);
}

// ── I：資訊 ─────────────────────────────────────────────────────────────────
{
  const offeredNow = L.offeredNonOwnOnStd();
  const same = JSON.stringify(fixture.offeredOnStd) === JSON.stringify(offeredNow);
  console.log(`ℹ F4i（資訊，不計入通過數）戰術書目前提供清單 ${same ? "＝錄製時" : "≠ 錄製時（正當變動不算紅；要把新選項納入基準需刻意重錄並改 PINNED_*）"}：現在 ${offeredNow.map((o) => `${o.dimension}=${o.choice}`).join(" ")}`);
}
const fpNow = SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION];
console.log(`ℹ 錄製時：${fixture.simVersion} ／ 指紋 ${fixture.fingerprint} ／ gitHead ${fixture.gitHead.slice(0, 8)}`);
console.log(`ℹ 目前：${MOBA_SIMULATION_VERSION} ／ 指紋 ${fpNow}${fpNow === fixture.fingerprint && MOBA_SIMULATION_VERSION === fixture.simVersion ? "（同錄製時）" : "（與錄製時不同——C2 改到語意檔時預期如此，不計入判定）"}`);

console.log(`\nMatch Golden v21-A：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
