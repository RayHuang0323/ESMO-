// ============================================================================
//  tools/lib/p6Contradiction.mjs — step 4 的 CONTRADICTION 判準（Owner Review 2026-11-02，登記 stage1_formal_acceptance_registration_3aB.json stopRules.contradiction）
//
//  P6 已提供的選擇（第一階段 pass 或第二階段 confirmed），在真實性表上同一個（模板, 維度, 選擇）的列出現反向效果（z ≤ −2，verdict reversed）⇒ CONTRADICTION，停止並調查。
//  無效果與邊際不算矛盾。與 G-A8 STOP 分開記錄。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const key = (x) => `${x.template}|${x.dimension}|${x.choice}`;

/** P6 提供的選擇（兩份結果檔推出；與 step 4b 的清單同一條規則）。 */
export function p6OfferedKeys(root = ROOT) {
  const R = (f) => JSON.parse(fs.readFileSync(path.join(root, "tools/fixtures", f), "utf8")).rows;
  const r1 = R("exclusion_v21b1_result_3aB.json"), r2 = R("exclusion_v21b1_stage2_result_3aB.json");
  return new Set(r1.filter((r) => r.verdict === "pass" || (r.verdict === "marginal" && r2.find((x) => key(x) === key(r))?.verdict === "confirmed")).map(key));
}

/** 真實性表的列裡，屬於 P6 提供的選擇的列（只有模板本身的列算；std 的主要列不是同一個模板）。 */
export const truthRowsOfOffered = (rows, offered) => rows.filter((r) => r.template && r.dimension && offered.has(key(r)));

/** @returns 矛盾的列（空陣列＝沒有矛盾）。 */
export const contradictionsOf = (rows, offered) => truthRowsOfOffered(rows, offered).filter((r) => r.verdict === "reversed").map((r) => ({ key: r.key, z: r.z, metric: r.metric, direction: r.direction, n: r.n }));
