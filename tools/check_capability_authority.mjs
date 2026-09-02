#!/usr/bin/env node
// ============================================================================
//  tools/check_capability_authority.mjs — 俱樂部能力的唯一權威守門員
//
//  執行：`node tools/check_capability_authority.mjs`；失敗 exit 1。
//
//  ── 這支在守什麼 ────────────────────────────────────────────────────────
//  `clubCapabilities()` 是「俱樂部能提供什麼」的**唯一**權威（發展樹 ＋ 總教練）。
//  它現在是乾淨的——但**沒有任何機制阻止下一個人繞過它**：
//  隨手 `import { teamDevelopmentEffects }` 就能拿到只有半邊的答案，
//  而且不會有任何錯誤，只會安靜地少算教練那一份。
//
//  這支把那條規則變成硬斷言：**production consumer 不得自己合併能力。**
//
//  ⚠ 白名單不是「例外清單」，是**有理由的清單**。加一筆就要寫清楚為什麼，
//    否則這支 verifier 會隨時間退化成裝飾。
// ============================================================================
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

/**
 * 允許直接讀單一來源的檔案，**每一筆都要有理由**。
 * 這裡讀的是「發展樹自己的值」或「教練自己的值」，而不是繞過權威去自行合併。
 */
const ALLOWED = new Map([
  ["src/platform/assets/clubCapabilities.js",
    "權威本身：它就是負責把兩個來源合併起來的那一支"],
  ["src/platform/profileStore.js",
    "唯一 orchestration：`clubCapabilities()` 在這裡組裝；`advanceDay` 的逐日 callback "
    + "必須讀 `cur` 而不是 `get()`，所以直接呼叫 `clubCapabilitiesOf`"],
  ["src/screens/manage/TeamDevelopmentScreen.jsx",
    "它是發展樹的編輯器：必須顯示**這棵樹自己**買到什麼，不能顯示被教練灌水後的合併值"],
  ["src/screens/fps/CsTacticScreen.jsx",
    "CS owner 邊界，本線不得修改該檔。語意上等同 `sources.teamDevelopment`，"
    + "且由下方 §3「型錄不得授予 CS 能力」保證等價"],
  ["src/screens/manage/RecruitScreen.jsx",
    "唯一需要分流的消費端：球探天數讀 `total`、人才池只讀 `sources.teamDevelopment`。"
    + "它讀的是權威回傳的 provenance，不是自己合併"],
]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};

const rel = (p) => relative(ROOT, p).split("\\").join("/");
const files = [...walk(join(ROOT, "src/platform")), ...walk(join(ROOT, "src/screens"))];

// ── §1 沒有人繞過權威去讀發展樹 ──────────────────────────────────────────
console.log("\n── §1 沒有人繞過 clubCapabilities ──");
const bypass = [];
for (const p of files) {
  const r = rel(p);
  if (ALLOWED.has(r)) continue;
  const src = readFileSync(p, "utf8");
  //  只抓**真的 import**，不抓註解裡提到名字。
  if (/^\s*import[\s\S]{0,200}?teamDevelopmentEffects[\s\S]{0,200}?from\s+["'][^"']*teamDevelopment\.js["']/m.test(src)) {
    bypass.push(`${r}（直接 import teamDevelopmentEffects）`);
  }
  if (/from\s+["'][^"']*assets\/coachCatalog\.js["']/.test(src) && /\.capability\b/.test(src)) {
    bypass.push(`${r}（自己從型錄讀 capability）`);
  }
}
ck("production code 沒有繞過權威自行取得能力", bypass.length === 0, bypass.join(" / ") || "clean");

// ── §2 白名單每一筆都存在、且有理由 ──────────────────────────────────────
console.log("\n── §2 白名單 ──");
for (const [file, reason] of ALLOWED) {
  let exists = true;
  try { statSync(join(ROOT, file)); } catch { exists = false; }
  ck(`白名單檔案存在：${file}`, exists);
  ck(`白名單有理由：${file}`, typeof reason === "string" && reason.length >= 12, reason.slice(0, 40) + "…");
}
//  白名單只能縮不能無故變長：新增一筆就要有人看見。
ck("白名單維持在 5 筆以內（要加就要有人看見）", ALLOWED.size <= 5, `目前 ${ALLOWED.size} 筆`);

// ── §3 CS 邊界：型錄不得授予 CS 能力（§2 那條白名單的前提）────────────────
console.log("\n── §3 CS 邊界 ──");
const { COACH_CATALOG, CS_OWNED_FLAGS } = await import(
  new URL("../src/platform/assets/coachCatalog.js", import.meta.url).href);
const granted = COACH_CATALOG.flatMap((a) => Object.keys(a.capability?.unlocks ?? {}));
ck("型錄不授予任何 CS 旗標（CsTacticScreen 的白名單才成立）",
  granted.every((f) => !CS_OWNED_FLAGS.includes(f)), granted.join(",") || "無旗標");

// ── §4 合併政策仍是單一 source of truth ──────────────────────────────────
console.log("\n── §4 合併政策 ──");
const capSrc = readFileSync(join(ROOT, "src/platform/assets/clubCapabilities.js"), "utf8");
ck("policy 表存在且是唯一的合併規則來源", /export const CAPABILITY_POLICY\s*=/.test(capSrc));
//  合併只能發生在權威裡：其他檔案不得出現 mergeCapabilities 的呼叫。
const merger = files.filter((p) => rel(p) !== "src/platform/assets/clubCapabilities.js")
  .filter((p) => /\bmergeCapabilities\s*\(/.test(readFileSync(p, "utf8")))
  .map(rel);
ck("只有權威自己呼叫 mergeCapabilities", merger.length === 0, merger.join(" / ") || "clean");

console.log(`\nCapability Authority：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
