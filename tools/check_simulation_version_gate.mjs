#!/usr/bin/env node
// ============================================================================
//  simulationVersion Gate（Player Challenge Slice 2）
//
//  執行：`node tools/check_simulation_version_gate.mjs`
//  更新指紋：`node tools/check_simulation_version_gate.mjs --print`
//
//  ── 這支要防的是什麼 ─────────────────────────────────────────────────────
//  `MOBA_SIMULATION_VERSION` 是**人宣告**的。人會忘記。
//  忘記的後果不是報錯，而是**歷史挑戰默默重播出不同的結果**——
//  沒有程式會發現，玩家也不會發現，直到有人去比對舊紀錄。
//
//  ⇒ 對 `SIMULATION_SEMANTICS_FILES` 取內容指紋，與契約裡釘住的值比對。
//    改了卻沒更新 ⇒ 紅，逼人做一次判斷（會不會改變結果？會就 bump 版本）。
//
//  ⚠ 它**不判斷**「這次改動有沒有改變語意」——沒有任何程式判得出來。
//    它只保證**沒有人能默默略過那個判斷**。假裝判得出來只會給虛假的安全感。
//  ⚠ 它也**不是** migration framework：舊版挑戰一律不可重播，不做轉換。
// ============================================================================
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MOBA_SIMULATION_VERSION, KNOWN_SIMULATION_VERSIONS,
  SIMULATION_SEMANTICS_FILES, SIMULATION_SEMANTICS_FINGERPRINT,
} from "../src/platform/contracts/simulationVersion.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * 指紋：逐檔內容雜湊再合併。
 *
 * ⚠ **不做任何正規化**（不剝註解、不去空白）。理由是誠實：
 *   「只改了註解」與「改了數值」在這一層分不出來，也**不該**分——
 *   分得出來就代表有人在替我們判斷「這個改動不影響語意」，
 *   而那正是這支驗證器存在的原因。註解改動也要更新指紋，一次 15 秒。
 */
function fingerprint() {
  const h = createHash("sha256");
  for (const f of SIMULATION_SEMANTICS_FILES) {
    h.update(f);
    h.update("\0");
    //  逐檔先算一次，避免「A 尾巴 + B 開頭」與「A + B」碰撞。
    h.update(createHash("sha256").update(read(f)).digest("hex"));
    h.update("\n");
  }
  return h.digest("hex").slice(0, 16);
}

const actual = fingerprint();

if (process.argv.includes("--print")) {
  console.log(`\n目前指紋：${actual}\n`);
  console.log("把 src/platform/contracts/simulationVersion.js 的");
  console.log(`  export const SIMULATION_SEMANTICS_FINGERPRINT = "${SIMULATION_SEMANTICS_FINGERPRINT}";`);
  console.log("改成");
  console.log(`  export const SIMULATION_SEMANTICS_FINGERPRINT = "${actual}";`);
  console.log("\n⚠ 更新之前先回答：這次改動會讓同一份輸入跑出不同結果嗎？");
  console.log("   會   ⇒ 同時 bump MOBA_SIMULATION_VERSION（並把舊版留在 KNOWN_SIMULATION_VERSIONS）");
  console.log("   不會 ⇒ 只更新指紋\n");
  process.exit(0);
}

console.log("\n── simulationVersion Gate ──");

ck("版本字串存在且格式正確",
  typeof MOBA_SIMULATION_VERSION === "string" && /^moba-sim\.v\d+$/.test(MOBA_SIMULATION_VERSION),
  MOBA_SIMULATION_VERSION);
ck("目前版本在已知清單裡", KNOWN_SIMULATION_VERSIONS.includes(MOBA_SIMULATION_VERSION));

//  清單完整性：漏了檔案，閘門對那支檔案就完全無效。
ck("語意檔案清單非空", SIMULATION_SEMANTICS_FILES.length > 0, `${SIMULATION_SEMANTICS_FILES.length} 支`);
for (const f of SIMULATION_SEMANTICS_FILES) {
  let ok = true;
  try { read(f); } catch { ok = false; }
  ck(`語意檔案存在：${f}`, ok);
}
//  ⚠ 這幾支是最容易被漏掉的：引擎本體與三個「輸入 → 引擎」的轉換點。
for (const must of [
  "src/LogicEngine.js",
  "src/battle/moba/mobaPlayerStats.js",
  "src/platform/contracts/MobaTacticConfig.js",
  "src/hero/heroProgress.js",
  "src/platform/challenge/challengeRunner.js",
]) {
  ck(`清單涵蓋 ${must.split("/").pop()}`, SIMULATION_SEMANTICS_FILES.includes(must));
}

//  核心閘門。
const matched = SIMULATION_SEMANTICS_FINGERPRINT === actual;
ck("模擬語意指紋與契約一致（改了引擎就必須做一次版本判斷）", matched,
  matched ? actual : `契約 ${SIMULATION_SEMANTICS_FINGERPRINT} ≠ 實際 ${actual}`);

if (!matched) {
  console.log("\n⚠ 上面這條紅的意思是：**有人改了會影響模擬語意的檔案**。");
  console.log("   請先回答：這次改動會讓同一份輸入跑出不同的結果嗎？");
  console.log("     會   ⇒ bump MOBA_SIMULATION_VERSION，舊版留在 KNOWN_SIMULATION_VERSIONS，再更新指紋");
  console.log("     不會 ⇒ 只更新指紋");
  console.log("   取得新指紋：node tools/check_simulation_version_gate.mjs --print");
  console.log("   ⚠ 不要為了讓它變綠而直接複製貼上——那等於把這個閘門關掉。\n");
}

//  ChallengeInstance 一定帶版本（欄位存在性）。
const inst = read("src/platform/contracts/challengeInstance.js");
ck("ChallengeInstance 會記錄 simulationVersion", /simulationVersion:/.test(inst));
ck("雙方快照版本不一致時拒絕建立 challenge", /simulationVersion !== defender\.simulationVersion/.test(inst));
ck("跨版本一律拒絕重播（不做相容性推測）",
  /不做相容性推測/.test(read("src/platform/contracts/simulationVersion.js")));

console.log(`\nsimulationVersion Gate：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
