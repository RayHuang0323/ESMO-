#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_s2_contract_v24.mjs — S2 新契約的判定與 S2-B 判定器驗證（離線、唯讀；2026-11-19）
//
//  正式判定：--natural=<closure_natural 資料夾> --registration=<s14_registration.json>：只有登記檔列出的資料組才會給 PASS／FAIL。
//  回看舊資料：--retro=<驗證的 batches 資料夾> --arm=adaptive：只列數字，判定欄一律是 NOT_JUDGED，不覆寫任何舊結論。
//  工具路徑與生涯永遠分開，輸出裡沒有合併的數字。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { judgePath, validateOracle, S2_CONTRACT_V2 } from "./s2_contract_v2.mjs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const NAT = arg("natural"), RETRO = arg("retro"), REG = arg("registration"), OUT = arg("out"), ARM = arg("arm", "adaptive");
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null), rr = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? r3(v) : v)));
const J = { contract: S2_CONTRACT_V2 };
if (RETRO) {
  const rows = fs.readdirSync(RETRO).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(RETRO, f), "utf8")).rows).filter((r) => r.arm === ARM);
  J.retrospective = { source: RETRO, arm: ARM, note: "reference only; old S2 FAIL stands", tool: judgePath(rows.filter((r) => r.path === "tool"), { registered: false }), career: judgePath(rows.filter((r) => r.path === "career"), { registered: false }) };
}
if (NAT) {
  const reg = JSON.parse(fs.readFileSync(REG, "utf8")).s2Contract;
  const rows = fs.readdirSync(NAT).filter((f) => /^(holdout_tool|career)_.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(NAT, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const of = (g) => rows.filter((r) => r.group === g), startsOf = (list) => list.flatMap((r) => r.starts.map((s) => ({ ...s, cluster: String(r.seed) })));
  const s2b = (list) => { const s = list.flatMap((r) => ["blue", "red"].filter((S) => r.te?.[S]?.posture).map((S) => r.s2b[S])), t = (k) => s.reduce((a, x) => a + x[k], 0); return { sides: s.length, episodesPerSide: t("episodes") / s.length, sidesWithoutOpportunity: s.filter((x) => x.episodes === 0).length / s.length, utilisationSameTarget: t("takenSame") / Math.max(1, t("episodes")), utilisationAnyTarget: t("takenAny") / Math.max(1, t("episodes")), precision: t("startsInOpportunity") / Math.max(1, t("starts")), startsPerSide: t("starts") / s.length }; };
  J.registered = {};
  for (const [label, group] of Object.entries(reg.groups)) {
    const list = of(group), registered = list.length === reg.expectedMatches[label];
    J.registered[label] = { group, expectedMatches: reg.expectedMatches[label], ...judgePath(list, { registered }), byConfig: {} };
    for (const k of [...new Set(list.map((r) => r.cfg ?? r.tier))]) J.registered[label].byConfig[k] = judgePath(list.filter((r) => (r.cfg ?? r.tier) === k), { registered: false });
    J.registered[label].s2bReportOnly = { ...s2b(list), oracleValidation: validateOracle(startsOf(list)) };
    J.registered[label].unfinishedMatches = list.filter((r) => !r.over).length;
  }
}
const out = rr(J);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.registered ?? {})) console.log(`${k} [${v.mode}] matches=${v.matches}  S2-A ${v.A.verdict} ${v.A.arrived}/${v.A.starts}=${v.A.value} CI ${JSON.stringify(v.A.ci)}  S2-C ${v.C.verdict} c1=${v.C.c1} c2=${v.C.c2} sides=${v.C.sides}  oracle ${v.s2bReportOnly.oracleValidation.verdict} (positive ${v.s2bReportOnly.oracleValidation.positive}/${v.s2bReportOnly.oracleValidation.starts}) precision=${v.s2bReportOnly.precision}`);
for (const k of ["tool", "career"]) { const v = out.retrospective?.[k]; if (v) console.log(`retro ${k} [${v.mode}] S2-A ${v.A.arrived}/${v.A.starts}=${v.A.value} CI ${JSON.stringify(v.A.ci)} (${v.A.verdict})  c1=${v.C.c1} c2=${v.C.c2} (${v.C.verdict})`); }
