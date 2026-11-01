// ============================================================================
//  tools/lib/formalRegistration.mjs — 正式驗收的 --reg（Phase 3a-B 第一階段；登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json）
//
//  量測工具預設讀自己原本的登記檔、寫原本的結果檔（行為不變）。帶 --reg 時讀那份確認登記，結果路徑也由登記決定。
//  確認登記的 --run 有額外條件：status 開頭是 registered、fingerprint 等於目前模擬指紋（且程式真的算得出這個指紋）、結果檔不存在、
//  登記要求的前置結果已提交且判定相符（G-A8 先跑；STOP 就停止其他正式量測）、登記之後程式沒有變。
//  凍結之前確認登記是 READY_FOR_FREEZE、fingerprint 是 TBD_AT_FREEZE ⇒ 一定拒跑。--preflight 走同一段檢查但絕不開跑（gate 只用它，不得用 --run）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, provenance, sha16 } from "./studyRunner.mjs";

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

export function regRelOf(args, defaultRel) {
  const a = args.find((x) => x.startsWith("--reg="));
  const rel = a ? a.slice("--reg=".length) : defaultRel;
  if (!/^tools\/fixtures\/[\w.-]+\.json$/.test(rel)) { console.error(`--reg 必須是 tools/fixtures/ 底下的 json：${rel}`); process.exit(2); }
  return rel;
}

/** 確認登記的結果路徑：一定在登記裡寫明，不落回原本的結果檔。 */
export function formalResultOf(REG, regRel) {
  if (typeof REG.result !== "string" || !/^tools\/fixtures\/[\w.-]+\.json$/.test(REG.result)) { console.error(`${regRel} 沒有 result 路徑：不得使用`); process.exit(2); }
  return REG.result;
}

/** 登記要求先完成的研究（stopRules.ga8：G-A8 先跑，STOP 就停止其他正式量測）：結果已提交、同一個指紋、判定相符。 */
function prerequisiteRefusal(REG, fingerprint) {
  const pre = REG.requiresResult;
  if (!pre) return [];
  const file = path.join(ROOT, pre.file);
  if (!fs.existsSync(file)) return [`前置結果不存在：${pre.file}`];
  if (git("status", "--porcelain", "--", pre.file)) return [`前置結果還沒提交：${pre.file}`];
  const r = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  if (r.fingerprint !== fingerprint) out.push(`前置結果的指紋 ${r.fingerprint} ≠ 目前 ${fingerprint}`);
  if (r.registration !== pre.registration || r.registrationHash !== sha16(fs.readFileSync(path.join(ROOT, pre.registration), "utf8"))) out.push(`前置結果不是這份登記產生的：${pre.registration}`);
  if (r.verdict !== pre.verdict) out.push(`前置結果判定 ${r.verdict}，要 ${pre.verdict}：其他正式量測不得開始，交 Owner`);
  return out;
}

/** 這份確認登記現在可以開跑嗎？回傳拒絕的原因（空陣列＝可以）。 */
export function formalRunRefusal(REG, { fingerprint, resultRel, regRel = null, toolRel = null }) {
  const out = [];
  if (!/^registered/.test(REG.status ?? "")) out.push(`status 不是 registered（${String(REG.status).slice(0, 40)}）`);
  if (REG.fingerprint !== fingerprint) out.push(`fingerprint ${REG.fingerprint} ≠ 目前 ${fingerprint}`);
  if (fs.existsSync(path.join(ROOT, resultRel))) out.push(`結果檔已存在：${resultRel}`);
  out.push(...prerequisiteRefusal(REG, fingerprint));
  //  登記的指紋只是常數：程式與它對不對得上要實算（check_simulation_version_gate），否則改了語意檔忘記重新登記也能開跑。
  if (!out.length) { try { execFileSync(process.execPath, ["tools/check_simulation_version_gate.mjs"], { cwd: ROOT, stdio: "ignore" }); } catch { out.push("check_simulation_version_gate 沒過：程式與登記的指紋不一致"); } }
  //  工具與量測函式庫不在指紋裡：登記之後它們變了就不是登記時的量法。
  if (!out.length && regRel && toolRel) {
    const moved = git("diff", "--name-only", git("log", "-1", "--format=%H", "--", regRel), "HEAD", "--", "src", "tools/lib", "tools/balance", toolRel);
    if (moved) out.push(`登記之後程式變了：${moved.replace(/\n/g, ", ")}`);
  }
  return out;
}

/** 報告時：工作區乾淨、開跑以來程式沒有變（資料夾的 meta.gitHead）。 */
export function formalReportRefusal(meta, toolRel) {
  const out = [];
  if (provenance().dirtyFilesUnderSrcTools) out.push("src／tools 有未提交變更");
  if (!meta?.gitHead) return [...out, "資料夾沒有記錄開跑時的 commit"];
  const moved = git("diff", "--name-only", meta.gitHead, "HEAD", "--", "src", "tools/lib", "tools/balance", toolRel);
  if (moved) out.push(`開跑之後程式變了：${moved.replace(/\n/g, ", ")}`);
  return out;
}

/** 資料夾的 meta 與這份登記相同嗎（確認登記的 meta 另外多記開跑時的 gitHead）。 */
export function sameStudyMeta(stored, want, formal) {
  if (!formal) return JSON.stringify(stored) === JSON.stringify(want);
  return Object.entries(want).every(([k, v]) => JSON.stringify(stored?.[k]) === JSON.stringify(v));
}
