#!/usr/bin/env node
// ============================================================================
//  tools/check_cal_parity_v24.mjs — v24 Calibration Sprint（2026-11-20）的守門（約 1～2 分鐘）
//
//  C1 Career-Parity 環境的宣告與驗證：無技能引擎宣告 parity ⇒ 丟錯；parity 引擎宣告 noskills ⇒ 丟錯；同一個行程換環境 ⇒ 丟錯；
//     生涯一律要求技能／被動／成長／天賦／選手能力全開
//  C2 v1.3 可重現：910792ac 上錄的整場雜湊（No-Skills 4 場、Career-Parity 2 場；cal_results/pin_v13_*.json），在目前的程式上逐值相同
//  C3 候選 adaptive.v1.4 沒有併入 src/（src 與 910792ac 相同、v24 規則集仍是 adaptive.v1.3），補丁仍能乾淨套用到目前的 src（供 Owner 審閱）
//  C4 判定工具的登記常數＝S16_REGISTRATION.md（自然對局每層的場數、E7 的有效 Seed 數、注入時刻）
//  C5 E7 有效 Seed 的規則：8 場齊而且都有注入才算（構造資料）
//  C6 v24／v23 指紋不變；src/ 沒有 import 量測工具
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const results = [], J = JSON.stringify, t0 = Date.now();
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const git = (...a) => execSync(`git ${a.join(" ")}`, { cwd: ROOT, encoding: "utf8" });
const child = (code, env = {}) => { const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ROOT, env: { ...process.env, ESMO_BALANCE_SKILLS: "", ESMO_BALANCE_TALENTS: "", ...env }, encoding: "utf8" }); try { return JSON.parse(r.stdout.trim().split("\n").at(-1)); } catch { return { error: (r.stderr || r.stdout).slice(0, 400) }; } };
const LIB = J(pathToFileURL(path.join(ROOT, "tools/owner_preview/lib_parity_env_v24.mjs")).href), PIN = J(pathToFileURL(path.join(ROOT, "tools/owner_preview/pin_v20_v23_stream.mjs")).href);

// ── C1 ──
{
  const probe = (envName, assertAs, path_ = "tool", rs = "balanceTool.v24") => child(`const L=await import(${LIB});L.applyEnv(${J(envName)});const P=await import(${PIN});
    const e=${rs.startsWith("career") ? `P.build("career.v24","v2.jungle_invasion",null,143001,"mid")` : `P.build("balanceTool.v24","v2.jungle_invasion","v2.jungle_invasion",142201,null)`};
    let threw=null;try{L.assertEnv(L.describeEngine(e,${J(rs)}),${J(assertAs)},${J(path_)});}catch(x){threw=x.message;}
    let sw=null;try{L.applyEnv(${J(envName === "parity" ? "noskills" : "parity")});}catch(x){sw=x.message;}
    console.log(JSON.stringify({desc:L.describeEngine(e,${J(rs)}),threw,sw}));`);
  const a = probe("noskills", "parity"), b = probe("parity", "noskills"), c = probe("parity", "parity"), d = probe("parity", "parity", "career", "career.v24");
  ck("C1 環境驗證：無技能宣告成 parity ⇒ 丟錯；parity 宣告成 noskills ⇒ 丟錯；宣告正確 ⇒ 通過；同一行程換環境 ⇒ 丟錯；生涯全開",
    /parity_env_mismatch/.test(a.threw ?? "") && /parity_env_mismatch/.test(b.threw ?? "") && c.threw === null && d.threw === null && /parity_env_switch/.test(a.sw ?? "") && /parity_env_switch/.test(c.sw ?? "")
    && c.desc?.skills && c.desc?.passives && c.desc?.curve && !c.desc?.talents && d.desc?.talents && d.desc?.playerStats,
    J({ noskillsAsParity: a.threw?.slice(0, 80), parityAsNoskills: b.threw?.slice(0, 80), parityOk: c.threw, careerOk: d.threw, switch: c.sw?.slice(0, 60), parityDesc: c.desc, careerDesc: d.desc }));
}
// ── C2 ──
{
  const R = path.join(ROOT, "review/tactic-book-3a/v24_calibration/cal_results");
  const rec = { noskills: JSON.parse(fs.readFileSync(path.join(R, "pin_v13_noskills.json"), "utf8")).pins, parity: JSON.parse(fs.readFileSync(path.join(R, "pin_v13_parity.json"), "utf8")).pins };
  const got = {};
  for (const env of ["noskills", "parity"]) got[env] = child(`const L=await import(${LIB});L.applyEnv(${J(env)});const P=await import(${PIN});const out={};
    for (const k of ${J(Object.keys(rec[env]))}) { const [rs,tb,tr,seed,tier]=k.split("|"); const e=rs.startsWith("career")?P.build(rs,tb,null,Number(seed),tier==="-"?null:tier):P.build(rs,tb,tr,Number(seed),null); out[k]=P.streamHash(e).hash; }
    console.log(JSON.stringify(out));`);
  const same = (env) => Object.keys(rec[env]).every((k) => got[env]?.[k] === rec[env][k]);
  ck("C2 adaptive.v1.3 可重現：910792ac 錄的整場雜湊（No-Skills 4 場含僵局 120159、Career-Parity 2 場）逐值相同", same("noskills") && same("parity"), J({ noskills: same("noskills"), parity: same("parity"), got }));
}
// ── C3 ──
{
  const srcSame = git("diff", "--name-only", "910792ac", "--", "src").trim() === "" && git("status", "--porcelain", "--", "src").trim() === "";
  const { MATCH_RULESETS, TACTIC_EXECS } = await imp("src/platform/contracts/matchRuleset.js");
  const patch = "review/tactic-book-3a/v24_calibration/candidate_adaptive_v1_4.patch";
  let applies = false; try { execSync(`git apply --check "${patch}"`, { cwd: ROOT, stdio: "ignore" }); applies = true; } catch { applies = false; }
  ck("C3 候選 adaptive.v1.4 沒有併入：src/ 與 910792ac 相同、v24 規則集仍是 adaptive.v1.3、合法值清單沒有 v1.4；補丁仍能套用到目前的 src（只檢查，不套用）",
    srcSame && MATCH_RULESETS["career.v24"].layers.tacticExec === "adaptive.v1.3" && MATCH_RULESETS["balanceTool.v24"].layers.tacticExec === "adaptive.v1.3" && !TACTIC_EXECS.includes("adaptive.v1.4") && applies,
    J({ srcSame, career: MATCH_RULESETS["career.v24"].layers.tacticExec, tool: MATCH_RULESETS["balanceTool.v24"].layers.tacticExec, patchApplies: applies }));
}
// ── C4 ──
{
  //  判定工具被 import 時只會多印一行登記路徑（沒有 --natural／--stress 就不讀任何資料），不影響這裡
  const JG = await imp("tools/owner_preview/judge_cal_parity_v24.mjs"), ST = await imp("tools/owner_preview/stress_parity_e7_v24.mjs");
  const reg = fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v24_calibration/S16_REGISTRATION.md"), "utf8");
  const ok = JG.NATURAL_STRATA.tool.expected === 150 && JG.NATURAL_STRATA.tool_talents.expected === 50 && JG.NATURAL_STRATA.career.expected === 240 && JG.STRESS_TARGET === 75
    && J(ST.INJECT) === J([600, 640, 680, 720]) && /75 個有效 Seed/.test(reg) && /600／640／680／720 秒/.test(reg) && /50 × 3 × 2 = 300/.test(reg) && /80 × 3 × 2 = 480/.test(reg) && /50 × 2 = 100/.test(reg);
  ck("C4 判定工具的登記常數＝S16_REGISTRATION.md（工具 150／天賦層 50／生涯 240 場、E7 75 個有效 Seed、注入 600／640／680／720 秒）", ok, J({ strata: JG.NATURAL_STRATA, target: JG.STRESS_TARGET, inject: ST.INJECT }));
}
// ── C5 ──
{
  const { COMBOS, effectiveSeeds } = await imp("tools/owner_preview/stress_parity_e7_v24.mjs");
  const full = (seed, inj = true) => COMBOS.map((c) => ({ seed, ...c, injected: inj }));
  const rows = [...full(1), ...full(3).map((r, i) => (i === 5 ? { ...r, injected: false } : r)), ...full(5).slice(0, 7)];
  const eff = effectiveSeeds(rows);
  ck("C5 E7 有效 Seed：8 場齊而且都注入才算（一場沒注入、少一場 ⇒ 不算）", COMBOS.length === 8 && J(eff) === J([1]), J({ combos: COMBOS.length, effective: eff }));
}
// ── C6 ──
{
  const { SIMULATION_SEMANTICS_FINGERPRINTS: F } = await imp("src/platform/contracts/simulationVersion.js");
  const importRe = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`][^"'`]*(?:owner_preview|lib_parity_env|diag_te24_cal|stress_parity_e7|judge_cal_parity|cal_fit_|cal_report_)[^"'`]*["'`]/;
  const offenders = git("ls-files", "src").trim().split("\n").filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith("heroImages.js")).filter((f) => importRe.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  ck("C6 v24 指紋 9727c0b4ae8beb3d、v23 69237cce78edf2be 不變；src/ 沒有 import 量測工具", F["moba-sim.v24"] === "9727c0b4ae8beb3d" && F["moba-sim.v23"] === "69237cce78edf2be" && offenders.length === 0, J({ v24: F["moba-sim.v24"], v23: F["moba-sim.v23"], offenders }));
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} PASS（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
process.exit(pass === results.length ? 0 : 1);
