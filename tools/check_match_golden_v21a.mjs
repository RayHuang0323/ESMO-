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
//   I   資訊（不計入通過數）：F4i 提供清單差異、simVersion／指紋與 fixture 的差異。C2 改到語意檔時指紋會變，那不是這支 gate 要判的事（版本 gate 另有）。
// ============================================================================
import fs from "node:fs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const progress = (s) => process.stderr.write(`  ${s}\n`);

const L = await import("./lib/matchGoldenV21a.mjs");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../src/platform/contracts/simulationVersion.js");

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
const observedForCmp = observed.map((o) => {
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
  ck(`C ${c.id}　digest＋streamHash＋resultHash＋configure 序列＝fixture${corrById.has(c.id) ? "（resultHash 依版本事實修正表：只差三個身分欄位）" : ""}`, mine.length === 0 && cp.length === 0 && !run, run ?? [...mine, ...cp].join("; "));
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
