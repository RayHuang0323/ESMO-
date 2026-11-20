#!/usr/bin/env node
// ============================================================================
//  tools/check_s15_preflight_v24.mjs — Sprint 2 Preflight（2026-11-20）的證據守門（約 1 分鐘）
//
//  這輪沒有改 src/；這支只守「診斷結論能被重現」與「診斷工具不擾動對局」：
//   P1 入侵診斷工具（diag_te24_s15_invade）在已用過的 Seeds 上，整場雜湊等於 S14 已記錄的值；決策當下的經濟複本與引擎自己寫的數值逐筆相同
//   P2 平衡工具（工具路徑）預設不載入英雄技能；ESMO_BALANCE_SKILLS=on 才載入。生涯（career.v24）一律開。這是 Preflight A 的根因，守住它不被悄悄改掉
//   P3 地圖幾何在 180° 旋轉＋上下路互換之下重合；終局護線的真實狀態鏡射（1 個壓力 Seed，注入後每個 tick）沒有任何不一致，結果等於已記錄的壓力列
//   P4 E7 唯讀分析的佈局分層用的是引擎同一個函式（objectiveLayoutForSeed），已知 Seed 的佈局值固定
//   P5 src/ 與 feed38c1 相同；v24／v23 指紋不變；src/ 沒有 import 任何診斷工具
// ============================================================================
import fs from "node:fs";
import {inspectMobaIntegrationScope} from './lib/mobaIntegrationScope.mjs';
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify, t0 = Date.now();

// ── P1 ──（S14 自然對局已記錄的雜湊；lib_closure_natural_v24 同格式）
{
  const P = await imp("tools/owner_preview/pin_v20_v23_stream.mjs");
  const D = await imp("tools/owner_preview/diag_te24_s15_invade.mjs");
  const T = { ...(await imp("src/battle/moba/tactics/tacticExecV24.js")), ...(await imp("src/battle/moba/nav/mobaNavigation.js")) };
  const CASES = [["career", "mid", null, 143001, "ba4bc5e33792238c98e5"], ["tool", null, "inv", 142201, "429b01041969e39ff4e2"]];
  const rows = [];
  for (const [p, tier, cfg, seed, want] of CASES) {
    const e = p === "career" ? P.build("career.v24", "v2.jungle_invasion", null, seed, tier) : P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", seed, null);
    const r = await D.runDiag(e, { seed, path: p }, T);
    const ev = [...r.evals.blue, ...r.evals.red], chk = ev.filter((v) => v.econCheckFail != null || v.econCheckGo != null);
    rows.push({ seed, hash: r.hash, want, same: r.hash === want, evals: ev.length, checked: chk.length, mismatch: chk.filter((v) => v.econCheckFail === false || v.econCheckGo === false).length });
  }
  ck("P1 入侵診斷工具不擾動對局：已用過的 Seeds 整場雜湊＝S14 記錄值；決策當下的經濟複本與引擎數值逐筆相同", rows.every((x) => x.same && x.checked > 0 && x.mismatch === 0), J(rows));
}
// ── P2 ──（子行程：balance runner 在載入時讀環境變數）
{
  const probe = (env) => {
    const code = `const P=await import(${J(pathToFileURL(path.join(ROOT, "tools/owner_preview/pin_v20_v23_stream.mjs")).href)});const e=P.build("balanceTool.v24","v2.jungle_invasion","v2.jungle_invasion",142201,null);const c=P.build("career.v24","v2.jungle_invasion",null,143001,"mid");console.log(JSON.stringify({tool:{skills:!!e.heroSkillsOn,passives:!!e.heroPassivesOn,curve:!!e.powerCurveOn,stats:!!e.playerStatsOn},career:{skills:!!c.heroSkillsOn,passives:!!c.heroPassivesOn,curve:!!c.powerCurveOn,stats:!!c.playerStatsOn}}));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ROOT, env: { ...process.env, ESMO_BALANCE_SKILLS: "", ESMO_BALANCE_TALENTS: "", ...env }, encoding: "utf8" });
    try { return JSON.parse(r.stdout.trim().split("\n").at(-1)); } catch { return { error: r.stderr.slice(0, 300) }; }
  };
  const off = probe({}), on = probe({ ESMO_BALANCE_SKILLS: "on" });
  ck("P2 工具路徑預設沒有英雄技能／被動／成長曲線（ESMO_BALANCE_SKILLS=on 才有）；生涯一律有（Preflight A 的根因）",
    off.tool && !off.tool.skills && !off.tool.passives && !off.tool.curve && on.tool?.skills && on.tool?.passives && on.tool?.curve && off.career?.skills && off.career?.passives && off.career?.curve, J({ default: off, skillsOn: on }));
}
// ── P3 ──（1 個本輪壓力 Seed 的夾具：140001 inv，已記錄 blue@1194，兩臂都有注入）
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s15-mirror-"));
  fs.writeFileSync(path.join(dir, "tool_inv_s13.jsonl"), J({ seed: 140001, path: "tool", cfg: "inv", arm: "s13", tInject: 840, injected: true, over: true, winner: "blue", end: 1194, escortOn: { blue: 1080.5, red: 1080.5 } }) + "\n");
  fs.writeFileSync(path.join(dir, "tool_inv_s12.jsonl"), J({ seed: 140001, path: "tool", cfg: "inv", arm: "s12", tInject: 840, injected: true }) + "\n");
  const out = path.join(dir, "mirror.json");
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/owner_preview/diag_te24_s15_escort_mirror.mjs"), `--stress=${dir}`, "--per=1", `--out=${out}`], { cwd: ROOT, encoding: "utf8" });
  const M = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null, S = M?.summary;
  const mism = S ? Object.values(S.mismatches).reduce((a, b) => a + b, 0) : -1, cmp = S ? Object.values(S.compared).reduce((a, b) => a + b, 0) : 0;
  ck("P3 地圖幾何旋轉重合；終局護線真實狀態鏡射（暴露、兵線、計時、選路、護送站位）逐 tick 一致；結果＝已記錄的壓力列",
    r.status === 0 && S && S.geometry.laneMaxErr < 1e-9 && S.geometry.towerMaxErr < 1e-9 && S.geometry.campMaxErr < 1e-9 && S.geometry.towerMissing === 0 && mism === 0 && cmp > 1000 && S.outcomeSameAsRecorded === "1/1",
    J({ exit: r.status, compared: S?.compared, mismatches: S?.mismatches, outcome: S?.outcomeSameAsRecorded, geometry: S ? { lane: S.geometry.laneMaxErr, tower: S.geometry.towerMaxErr, camp: S.geometry.campMaxErr } : null, err: r.status ? r.stderr.slice(0, 300) : "" }));
  fs.rmSync(dir, { recursive: true, force: true });
}
// ── P4 ──
{
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const src = fs.readFileSync(path.join(ROOT, "tools/owner_preview/diag_te24_s15_e7.mjs"), "utf8");
  const usesEngineFn = /import \{ objectiveLayoutForSeed \} from "\.\.\/\.\.\/src\/platform\/contracts\/objectiveLayout\.js";/.test(src);
  const known = { 140001: objectiveLayoutForSeed(140001), 142201: objectiveLayoutForSeed(142201), 143001: objectiveLayoutForSeed(143001) };
  ck("P4 E7 佈局分層用引擎同一個 objectiveLayoutForSeed；已知 Seed 的佈局固定（142201＝SWAPPED、143001＝STANDARD）", usesEngineFn && known[142201] === "SWAPPED" && known[143001] === "STANDARD", J(known));
}
// ── P5 ──
{
  const git = (...a) => execSync(`git ${a.join(" ")}`, { cwd: ROOT, encoding: "utf8" });
  const scope=inspectMobaIntegrationScope('feed38c1',ROOT),srcSame=scope.ok;
  const { SIMULATION_SEMANTICS_FINGERPRINTS: F } = await imp("src/platform/contracts/simulationVersion.js");
  const fp = { v24: F["moba-sim.v24"], v23: F["moba-sim.v23"] };
  //  只擋 import：src/ 的註解可以正當地提到 owner_preview 底下的量測工具
  const importRe = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`][^"'`]*(?:owner_preview|diag_te24_s15|report_te24_s15)[^"'`]*["'`]/;
  const offenders = git("ls-files", "src").trim().split("\n").filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith("heroImages.js")).filter((f) => importRe.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  ck("P5 MOBA保護範圍與feed38c1相同、明確CS面可整合且src乾淨；v24／v23指紋不變；src沒有import診斷工具",
    srcSame && fp.v24 === "9727c0b4ae8beb3d" && fp.v23 === "69237cce78edf2be" && offenders.length === 0, J({ srcSame, scope, fp, offenders }));
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} PASS（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
process.exit(pass === results.length ? 0 : 1);
