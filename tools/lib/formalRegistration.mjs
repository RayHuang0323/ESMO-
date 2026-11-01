// ============================================================================
//  tools/lib/formalRegistration.mjs — 正式驗收的 --reg（Phase 3a-B 第一階段；登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json）
//
//  量測工具預設讀自己原本的登記檔、寫原本的結果檔（行為不變）。帶 --reg 時讀那份確認登記，結果路徑也由登記決定。
//  確認登記的 --run 有額外條件：status 開頭是 registered、fingerprint 等於目前模擬指紋、結果檔不存在。
//  凍結之前確認登記是 READY_FOR_FREEZE、fingerprint 是 TBD_AT_FREEZE ⇒ 一定拒跑（check_formal_acceptance_3aB 實測）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./studyRunner.mjs";

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

/** 這份確認登記現在可以開跑嗎？回傳拒絕的原因（空陣列＝可以）。 */
export function formalRunRefusal(REG, { fingerprint, resultRel }) {
  const out = [];
  if (!/^registered/.test(REG.status ?? "")) out.push(`status 不是 registered（${String(REG.status).slice(0, 40)}）`);
  if (REG.fingerprint !== fingerprint) out.push(`fingerprint ${REG.fingerprint} ≠ 目前 ${fingerprint}`);
  if (fs.existsSync(path.join(ROOT, resultRel))) out.push(`結果檔已存在：${resultRel}`);
  //  登記的指紋只是常數：程式與它對不對得上要實算（check_simulation_version_gate），否則改了語意檔忘記重新登記也能開跑。
  if (!out.length) { try { execFileSync(process.execPath, ["tools/check_simulation_version_gate.mjs"], { cwd: ROOT, stdio: "ignore" }); } catch { out.push("check_simulation_version_gate 沒過：程式與登記的指紋不一致"); } }
  return out;
}
