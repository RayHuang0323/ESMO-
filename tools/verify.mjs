#!/usr/bin/env node
// ============================================================================
//  tools/verify.mjs — 驗證分段執行器（Milestone K0）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  `check_moba_runtime29` 與 `check_moba_stats28` 自 I-close 起就跑不完
//  （四次嘗試全部逾時，見 TD-17）。之前的判斷是「它們很大、很慢」。
//  實際展開巢狀呼叫圖之後，根因是**重複執行**：
//
//      一次 runtime29 = 63 個子行程
//      tactic24 ×16、cs23 ×8、progress25 ×8、regress ×8、regress2 ×8、
//      flow09 ×6、experience26 ×4、talent27 ×2、build ×2、stats28 ×1
//
//  regress 單跑就要好幾分鐘，跑八遍當然跑不完。斷言本身沒有問題，
//  問題是同一份斷言被重跑了八次。
//
//  ── 這支做什麼 ────────────────────────────────────────────────────────────
//  **不是第二套驗證框架**，是一個驅動器：它不定義任何新斷言、不改任何判準，
//  只負責「把既有的腳本各跑一次、記住結果、可以續跑」。
//
//    node tools/verify.mjs --list                 列出所有區段
//    node tools/verify.mjs --only=regress,regress2   跑指定區段（單段／多段）
//    node tools/verify.mjs                        跑全部（依序）
//    node tools/verify.mjs --resume               只跑「還沒通過」的區段
//    node tools/verify.mjs --resume --only=a,b    兩者可併用
//
//  搭配 `ESMO_VERIFY_FLAT=1`（本檔會自動設給子行程）讓會 fan-out 的腳本
//  跳過它們的巢狀子驗證——因為那些子項目本 runner 已經各跑一次了。
//  被跳過的區段會**明確標成 SKIP 並排除在分母外**，不會假裝通過。
//
//  ── 誠實規則（不可妥協）──────────────────────────────────────────────────
//   · 只要有任何區段 FAIL ⇒ exit 1
//   · 跑全部時只要有區段沒跑完／被中斷 ⇒ exit 2（**不允許 exit 0**）
//   · 狀態檔記錄每段的 exit code 與輸出尾巴，未完成就是未完成
// ============================================================================
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const STATE = resolve(ROOT, "tools/.verify-state.json");

/**
 * 區段登記表。
 *
 * `shape` 是「這支腳本跑成功時的輸出長相」——沿用各腳本原本就在用的判準，
 * 本 runner **不新增也不放寬任何斷言**。exit code 與 shape 兩者都要成立。
 *
 * 順序＝由快到慢、由基礎到整合，讓失敗盡早出現。
 */
const SEGMENTS = [
  { id: "cs_clutch_measurement_r30", script: "tools/check_cs_clutch_measurement_r30.mjs", shape: /CS Clutch Measurement \/ Calibration Readiness R30: PASS/, note: "CS Clutch read-chain deterministic calibration-readiness measurement" },
  { id: "cs_resilience_measurement_r31", script: "tools/check_cs_resilience_measurement_r31.mjs", shape: /CS Resilience Measurement \/ Calibration Readiness R31: PASS/, note: "CS Resilience read-chain deterministic calibration-readiness measurement" },
  { id: "cs_clutch_resilience_semantics_r32", script: "tools/check_cs_clutch_resilience_semantics_r32.mjs", shape: /CS Clutch × Resilience Semantic Boundary Audit R32: PASS/, note: "CS Clutch／Resilience semantic ownership boundary audit" },
  { id: "cs_adaptability_measurement_r34", script: "tools/check_cs_adaptability_measurement_r34.mjs", shape: /CS Adaptability Measurement \/ Calibration Readiness R34: PASS/, note: "CS Adaptability read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_tactical_iq_measurement_r35", script: "tools/check_cs_tactical_iq_measurement_r35.mjs", shape: /CS TacticalIQ Measurement \/ Semantic Readiness R35: PASS/, note: "CS TacticalIQ read-chain／semantic-readiness measurement" },
  { id: "milestone_b4", script: "tools/check_moba_milestone_b4.mjs", shape: /Milestone B\.4 verifier: PASS/, note: "B.4：小兵離散攻擊／並行選敵／Replay" },
  { id: "milestone_j_close", script: "tools/check_moba_milestone_j_close.mjs", shape: /✅ PASS/, note: "J-close" },
  { id: "milestone_j", script: "tools/check_moba_milestone_j.mjs", shape: /✅ PASS/, note: "J：召喚師技能引擎效果" },
  { id: "milestone_i_close", script: "tools/check_moba_milestone_i_close.mjs", shape: /✅ PASS/, note: "I-close" },
  { id: "milestone_i", script: "tools/check_moba_milestone_i.mjs", shape: /31\/31 通過/, note: "I" },
  { id: "milestone_h", script: "tools/check_moba_milestone_h.mjs", shape: /31\/31 通過/, note: "H：英雄定位" },
  { id: "milestone_g", script: "tools/check_moba_milestone_g.mjs", shape: /30\/30 通過/, note: "G" },
  { id: "milestone_f", script: "tools/check_moba_milestone_f.mjs", shape: /30\/30 通過/, note: "F" },
  { id: "milestone_e", script: "tools/check_moba_milestone_e.mjs", shape: /49\/49 通過/, note: "E" },
  { id: "tactic24", script: "tools/check_moba_tactic24.mjs", shape: /29\/29 通過/, note: "S24 戰術" },
  { id: "cs23", script: "tools/check_cs23.mjs", shape: /28\/28 通過/, note: "S23 CS 流程" },
  { id: "cs_measure_r1", script: "tools/check_cs_measurement_r1.mjs", shape: /CS Measurement R1: PASS/, note: "CS gameplay 決定性量測 pilot" },
  { id: "cs_instrument_r2", script: "tools/check_cs_instrumentation_r2.mjs", shape: /CS Instrumentation R2: PASS/, note: "CS combat opportunity→conversion 旁路量測" },
  { id: "cs_stat_wiring_r3", script: "tools/check_cs_stat_wiring_r3.mjs", shape: /CS Stat Wiring R3: PASS/, note: "CS 16 項素質 paired wiring measurement" },
  { id: "cs_clutch_r4", script: "tools/check_cs_clutch_instrumentation_r4.mjs", shape: /CS True Clutch R4: PASS/, note: "CS lastAlive／1vN opportunity→round conversion" },
  { id: "cs_retreat_r5", script: "tools/check_cs_retreat_instrumentation_r5.mjs", shape: /CS Retreat R5: PASS/, note: "CS retreat opportunity→displacement→re-engage" },
  { id: "cs_defuse_r6", script: "tools/check_cs_defuse_instrumentation_r6.mjs", shape: /CS Defuse R6: PASS/, note: "CS defuse opportunity→progress→round conversion" },
  { id: "cs_result_metrics_r8", script: "tools/check_cs_result_metrics_r8.mjs", shape: /CS Result Metrics R8(?: Legacy Evidence)?: PASS/, note: "CS ADR overkill／result metrics migration" },
  { id: "cs_determinism_migration_r10", script: "tools/check_cs_determinism_migration_r10.mjs", shape: /CS Determinism Migration R10: PASS/, note: "CS defuse stale-state determinism migration" },
  { id: "cs_bomb_result_semantics_r11", script: "tools/check_cs_bomb_result_semantics_r11.mjs", shape: /CS Bomb Result Semantics R11: PASS/, note: "CS bomb round-end result semantics" },
  { id: "cs_flash_attribution_r12", script: "tools/check_cs_flash_attribution_r12.mjs", shape: /CS Flash Attribution R12: PASS/, note: "CS flash source attribution／same-roll counterfactual" },
  { id: "cs_player_smoke_los_r13", script: "tools/check_cs_player_smoke_los_r13.mjs", shape: /CS Player Smoke LOS R13: PASS/, note: "CS player-smoke LOS causal migration／lifetime attribution" },
  { id: "cs_he_gameplay_r14", script: "tools/check_cs_he_gameplay_r14.mjs", shape: /CS HE Gameplay R14: PASS/, note: "CS deterministic HE damage／utilDmg causal migration" },
  { id: "cs_molly_gameplay_r15", script: "tools/check_cs_molly_gameplay_r15.mjs", shape: /CS Molly Gameplay R15: PASS/, note: "CS player-molly deterministic DoT／utilDmg causal migration" },
  { id: "cs_calibration_readiness_r17", script: "tools/check_cs_calibration_readiness_r17.mjs", shape: /CS 16-Stat Calibration Readiness Audit R17: PASS/, note: "CS 16-stat calibration readiness gate" },
  { id: "cs_positioning_measurement_r20", script: "tools/check_cs_positioning_measurement_r20.mjs", shape: /CS Positioning Measurement Completion R20: PASS/, note: "CS positioning read-chain／retreat measurement" },
  { id: "cs_apm_measurement_r21", script: "tools/check_cs_apm_measurement_r21.mjs", shape: /CS APM Measurement \/ Calibration Readiness R21: PASS/, note: "CS APM read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_local_causal_framework_r22", script: "tools/check_cs_local_causal_framework_r22.mjs", shape: /CS Local Causal Calibration Framework R22: PASS/, note: "CS local causal calibration measurement layers／readiness gate" },
  { id: "cs_courage_measurement_r23", script: "tools/check_cs_courage_measurement_r23.mjs", shape: /CS Courage Measurement \/ Calibration Readiness R23: PASS/, note: "CS Courage read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_accuracy_measurement_r24", script: "tools/check_cs_accuracy_measurement_r24.mjs", shape: /CS Accuracy Measurement \/ Calibration Readiness R24: PASS/, note: "CS Accuracy read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_accuracy_semantics_r25", script: "tools/check_cs_accuracy_semantics_r25.mjs", shape: /CS Accuracy Semantic Audit \/ Minimal Correction R25: PASS/, note: "CS Accuracy product semantics／minimal raw-effective headshot correction" },
  { id: "cs_decision_measurement_r26", script: "tools/check_cs_decision_measurement_r26.mjs", shape: /CS Decision Measurement \/ Calibration Readiness R26: PASS/, note: "CS Decision read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_decision_semantics_r27", script: "tools/check_cs_decision_semantics_r27.mjs", shape: /CS Decision Semantic Audit \/ Minimal Correction R27: PASS/, note: "CS Decision product semantics／minimal raw-effective defuse correction" },
  { id: "cs_focus_measurement_r28", script: "tools/check_cs_focus_measurement_r28.mjs", shape: /CS Focus Measurement \/ Calibration Readiness R28: PASS/, note: "CS Focus read-chain／deterministic calibration-readiness measurement" },
  //  ⚠ 下面五支在 flat 模式下的分母會變小（巢狀子驗證改由本 runner 各跑一次）。
  //    這裡填的是**該支自己健康時的完整數字**，不是遷就現況——所以
  //    experience26（§17 replay 容量，TD-19）與 runtime29（§29 順序公平性，TD-21）
  //    會如實回報 FAIL。**沒有放寬任何門檻。**
  { id: "progress25", script: "tools/check_progress25.mjs", shape: /33\/33 通過/, note: "S25 結算（flat：1 段委派）" },
  { id: "experience26", script: "tools/check_moba_experience26.mjs", shape: /29\/29 通過/, note: "S26 體驗（flat：6 段委派；§17 replay 容量既有紅燈 TD-19）" },
  { id: "talent27", script: "tools/check_talent27.mjs", shape: /37\/37 通過/, note: "S27 天賦（flat：7 段委派）" },
  { id: "stats28", script: "tools/check_moba_stats28.mjs", shape: /21\/21 通過/, note: "S28 選手能力（flat：8 段委派）" },
  //  P 系列：選手成長 → MOBA 戰鬥品質。三支都是純邏輯、秒級。
  { id: "growth_p0", script: "tools/check_growth_loop_p0.mjs", shape: /25\/25 通過/, note: "P0 等級→能力成長" },
  { id: "ability_p02", script: "tools/check_moba_ability_p02.mjs", shape: /20\/20 通過/, note: "P0-2 能力→本場經驗速率" },
  { id: "quality_p03", script: "tools/check_moba_quality_p03.mjs", shape: /53\/53 通過/, note: "P0-3 能力→戰鬥品質（A/B 雙方皆真實能力）" },
  { id: "growth_ui_p1", script: "tools/check_growth_ui_p1.mjs", shape: /62\/62 通過/, note: "P1 成長可視化（含 UI 未定義識別字掃描）" },
  { id: "regress", script: "tools/regress.mjs", shape: /結束率 15\/15/, note: "回歸：15 seeds" },
  { id: "regress2", script: "tools/regress2.mjs", shape: /節奏門檻 8\/8 通過/, note: "節奏門檻" },
  { id: "runtime29", script: "tools/check_moba_runtime29.mjs", shape: /35\/35 通過/, note: "S29 執行期（flat：9 段委派；§29 順序公平性既有紅燈 TD-21）" },
  { id: "q4_history", script: "tools/check_competition_q4.mjs", shape: /68\/68 通過/, note: "Q4 FinalStandings / award historical gate" },
  { id: "q5_history", script: "tools/check_competition_q5.mjs", shape: /66\/66 通過/, note: "Q5 cross-season history gate" },
  { id: "q6_playoffs", script: "tools/check_competition_q6.mjs", shape: /57\/57 通過/, note: "Q6 stage/playoff historical gate" },
  { id: "q7a_safety", script: "tools/check_q7a_safety.mjs", shape: /18\/18/, note: "Q7a single live session / same-day fixture safety" },
  { id: "q7b_season_state_v2", script: "tools/check_season_state_v2_migration_q7b.mjs", shape: /SeasonState v2 Q7b: 35\/35 PASS/, note: "Q7b/3b-M1 SeasonState.v2 migration-safe foundation" },
  { id: "m2_season_state_v2_sealing", script: "tools/check_season_state_v2_sealing_m2.mjs", shape: /SeasonState v2 M2 sealing: 24\/24 PASS/, note: "3b-M2 Event / Season sealing boundaries" },
  { id: "build", script: "node_modules/vite/bin/vite.js", args: ["build"], shape: /built in/, note: "production build" },
];

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const loadState = () => {
  if (!existsSync(STATE)) return { runs: {} };
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return { runs: {} }; }
};
const saveState = (s) => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2), "utf8");
};

if (flag("list")) {
  const st = loadState();
  console.log("區段清單（--only=<id>[,<id>...] 可指定單段或多段）\n");
  for (const s of SEGMENTS) {
    const r = st.runs?.[s.id];
    const mark = !r ? "  未執行" : r.status === "PASS" ? "✅ PASS " : r.status === "SKIP" ? "⏭ SKIP " : "❌ FAIL ";
    const when = r?.finishedAt ? `　${r.finishedAt.slice(0, 19).replace("T", " ")}　${(r.ms / 1000).toFixed(0)}s` : "";
    console.log(`${mark} ${s.id.padEnd(20)} ${s.note}${when}`);
  }
  console.log(`\n狀態檔：${STATE}`);
  process.exit(0);
}

const only = val("only");
const wanted = only ? only.split(",").map((x) => x.trim()).filter(Boolean) : null;
if (wanted) {
  const unknown = wanted.filter((w) => !SEGMENTS.some((s) => s.id === w));
  if (unknown.length) {
    console.error(`❌ 未知區段：${unknown.join(", ")}\n   可用區段：${SEGMENTS.map((s) => s.id).join(", ")}`);
    process.exit(2);
  }
}

const state = loadState();
const resume = flag("resume");
const timeoutMs = Number(val("timeout") ?? 0) || 45 * 60 * 1000;

let queue = SEGMENTS.filter((s) => !wanted || wanted.includes(s.id));
if (resume) {
  const before = queue.length;
  queue = queue.filter((s) => state.runs?.[s.id]?.status !== "PASS");
  console.log(`--resume：略過 ${before - queue.length} 個已通過的區段\n`);
}

if (!queue.length) {
  console.log("沒有需要執行的區段（--resume 之下代表全部已通過）。");
  process.exit(0);
}

/** 跑一個區段；回傳結果物件。子行程帶 ESMO_VERIFY_FLAT=1 以避免巢狀重跑。 */
function runSegment(seg) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, [resolve(ROOT, seg.script), ...(seg.args ?? [])], {
      cwd: ROOT,
      env: { ...process.env, ESMO_VERIFY_FLAT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      const killed = signal === "SIGKILL";
      const ok = code === 0 && seg.shape.test(out);
      done({
        id: seg.id,
        status: killed ? "TIMEOUT" : ok ? "PASS" : "FAIL",
        exitCode: code, signal: signal ?? null, ms,
        finishedAt: new Date().toISOString(),
        //  留下輸出尾巴：失敗時要看得出是斷言紅了還是被砍了
        tail: (out || err).split("\n").filter(Boolean).slice(-6).join("\n"),
      });
    });
  });
}

console.log(`執行 ${queue.length} 個區段（逾時 ${(timeoutMs / 60000).toFixed(0)} 分／段）\n`);
const results = [];
for (const seg of queue) {
  process.stdout.write(`▶ ${seg.id.padEnd(20)} ${seg.note} … `);
  const r = await runSegment(seg);
  results.push(r);
  state.runs[seg.id] = r;
  saveState(state);                 // 每段跑完就寫，中斷也不會丟掉已完成的部分
  const mark = r.status === "PASS" ? "✅" : r.status === "TIMEOUT" ? "⏱" : "❌";
  console.log(`${mark} ${r.status}　${(r.ms / 1000).toFixed(0)}s`);
  if (r.status !== "PASS") console.log(r.tail.split("\n").map((l) => `      ${l}`).join("\n"));
}

// ── 彙整 ────────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
const timedOut = results.filter((r) => r.status === "TIMEOUT");
console.log(`\n${"═".repeat(64)}`);
console.log(`本次：${pass}/${results.length} 通過` +
  (failed.length ? `　❌ 失敗 ${failed.length}（${failed.map((r) => r.id).join(", ")}）` : "") +
  (timedOut.length ? `　⏱ 逾時 ${timedOut.length}（${timedOut.map((r) => r.id).join(", ")}）` : ""));

//  全域狀態：把沒跑過的區段也算進來，避免「只跑兩段全綠」被讀成「全部通過」
const notRun = SEGMENTS.filter((s) => !state.runs?.[s.id]);
const globalPass = SEGMENTS.filter((s) => state.runs?.[s.id]?.status === "PASS").length;
console.log(`累計：${globalPass}/${SEGMENTS.length} 區段通過` +
  (notRun.length ? `　（尚未執行 ${notRun.length}：${notRun.map((s) => s.id).join(", ")}）` : ""));
console.log(`狀態檔：${STATE}　（--resume 續跑、--list 查看）`);

//  ⚠ 不允許把「沒跑完」粉飾成通過
if (failed.length) process.exit(1);
if (timedOut.length) process.exit(2);
if (!wanted && notRun.length) {
  console.log(`\n⚠ 仍有 ${notRun.length} 個區段沒有結果 ⇒ 不得宣稱全綠`);
  process.exit(2);
}
process.exit(0);
