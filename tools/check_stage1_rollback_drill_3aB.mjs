#!/usr/bin/env node
// ============================================================================
//  tools/check_stage1_rollback_drill_3aB.mjs — 第一階段旗標回滾演練（Phase 3a-B；登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json step 8）
//
//  回退只能靠旗標（重新部署舊 bundle 會在下一次存檔刪掉 tacticBook，由發布手冊排除，這裡不演練）。守的事：
//    A  存檔：帶戰術書計畫（含修正表下已撤的選擇）的存檔，旗標開關來回載入：一個 byte 都不變；store 不讀發布旗標
//    B  進行中的比賽：落盤的規則集說了算。career.v21 的場次在旗標關閉時恢復，整場逐位元等於沒中斷；career.v20 的場次在旗標開啟時同理
//    C  確認了但還沒開打（矩陣 ②③）：規則集還沒落盤 ⇒ 依旗標解析；來回切換結果一致、本場設定與計畫不被改寫
//    N  負向對照：同一份輸入沒有落盤規則集 ⇒ 真的會變成另一場（否則 B 的相同沒有意義）
//  秒級～一分鐘：每個 B 案各跑完整對局。瀏覽器的同一條路（v2 計畫回退）在 browser_check_stage1_flows_3aB A 段。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");

const childArg = process.argv.find((a) => a.startsWith("--child-load="));
if (childArg) {
  const LSC = JSON.parse(fs.readFileSync(childArg.slice("--child-load=".length), "utf8"));
  globalThis.localStorage = { getItem: (k) => (k in LSC ? LSC[k] : null), setItem: (k, v) => { LSC[k] = String(v); }, removeItem: (k) => { delete LSC[k]; } };
  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const { PROFILE_KEY } = await import("../src/platform/persistence/localSaveProvider.js");
  const st = useProfileStore.getState();
  st.save();
  console.log(`CHILD:${JSON.stringify({ tacticBook: st.tacticBook, disk: JSON.parse(LSC[PROFILE_KEY]).tacticBook ?? JSON.parse(LSC[PROFILE_KEY]).data?.tacticBook ?? null, quarantined: Object.keys(LSC).filter((k) => k.endsWith(".corrupt")).length })}`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const LS = {};
globalThis.localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: (k) => { delete LS[k]; } };

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { PROFILE_KEY } = await import("../src/platform/persistence/localSaveProvider.js");
const { createTacticPlan, tacticPlanHash } = await import("../src/platform/tactics/tacticPlan.js");
const { bindTacticPlanToCurrentVersions } = await import("../src/battle/moba/tactics/tacticResolver.js");
const { offeredChoicesOnly } = await import("../src/screens/moba/tacticBook/tacticBookOptions.js");
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const { resolveLiveRuleset, liveTacticDisplayOf, persistedLiveConfigOf } = await import("../src/battle/moba/liveMatchSetup.js");
const { matchSetupHash } = await import("../src/platform/contracts/matchSetup.js");
const { tacticalDirectorModeOf, templateBalanceOf } = await import("../src/platform/contracts/matchRuleset.js");
const { mobaTacticById } = await import("../src/platform/contracts/MobaTacticConfig.js");
const { templateCopyFor } = await import("../src/platform/tactics/tacticTemplates.js");
const { hookSeed, appRoster } = await import("./lib/liveGolden.mjs");
const { runAndHash, finalDigest, engineStreamHash } = await import("./lib/matchGolden.mjs");
const { stripComments } = await import("./lib/stripComments.mjs");

const SHIPPED = Object.freeze({ heroSkillsV1: true, heroBattleTalentsV1: true, itemsV1: true });
const OFF = SHIPPED, ON = Object.freeze({ ...SHIPPED, mobaTacticalDirectorV21: true });
const TB = "v21.b1";
const RUN = Object.freeze({ dt: 0.5, maxT: 3600, every: 20 });
const RESUME_AT = 300;
const golden = JSON.parse(read("tools/fixtures/match_golden_v20.json")), G = golden.inputs;
const plan = (templateId, choices = {}) => { const r = createTacticPlan({ templateId, choices }); if (!r.ok) throw new Error(`plan ${templateId}: ${J(r.errors)}`); return r.plan; };
const bind = (p) => bindTacticPlanToCurrentVersions(p);
const SEED = 3;
const optsOf = ({ tacticPlanBinding = null, tactic = null, resume = null } = {}) => ({
  seed: SEED, roster: appRoster(G.liveRosters[String(SEED)]), sessionId: "rollback-drill", mode: "moba", buildStrategy: "scaling",
  ...(tacticPlanBinding ? { tacticPlanBinding } : {}), ...(tactic ? { tactic } : {}), ...(resume ?? {}),
});
const start = ({ flags, persisted = null, ...o }) => {
  const opts = optsOf(o);
  const { seed, seedSource } = hookSeed(opts);
  return prepareLiveMatch({ opts, ruleset: resolveLiveRuleset({ flags, persisted }).ruleset, flags, seed, seedSource, profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam: null });
};
/** 與 hook 相同的恢復：同 seed 從頭追趕到存檔時間，再繼續打完。 */
const playResumed = (engine) => {
  const hasher = engineStreamHash(engine, RUN.every);
  let guard = 0;
  while (!engine.over && engine.t < RESUME_AT && guard < 12000) { engine.tick(RUN.dt); guard++; }
  while (!engine.over && engine.t < RUN.maxT) engine.tick(RUN.dt);
  return { digest: finalDigest(engine), streamHash: hasher.hex };
};

// ── A 存檔 ───────────────────────────────────────────────────────────────────
const BOOK_PLANS = [
  plan("classic.m3", { teamfight: { posture: "passive" } }),   // v21.b1 下已撤
  plan("classic.m7", { phases: { early: { focusLane: "bot" } } }),
  plan("classic.m8", { phases: { mid: { grouping: "group" } } }),   // v21.b1 下未站住
  plan("std", { winCondition: "earlySnowball" }),
  plan("v2.jungle_invasion"),
];
{
  for (const p of BOOK_PLANS) { const r = useProfileStore.getState().saveTacticPlan(p); if (!r.ok) throw new Error(J(r.errors)); }
  const before = J(useProfileStore.getState().tacticBook), disk0 = LS[PROFILE_KEY];
  const f = path.join(os.tmpdir(), `esmo-rollback-${process.pid}.json`);
  fs.writeFileSync(f, J(LS));
  const child = () => JSON.parse(execFileSync(process.execPath, [SELF, `--child-load=${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).split("\n").find((l) => l.startsWith("CHILD:")).slice(6));
  const a = child(), b = child();
  fs.rmSync(f, { force: true });
  ck("A1 帶 5 份計畫的存檔重新載入兩次（等同旗標開關來回）：tacticBook 逐位元相同、沒有隔離", J(a.tacticBook) === before && J(b.tacticBook) === before && a.quarantined === 0 && b.quarantined === 0, `${before.length} bytes`);
  ck("A1b 載入後存檔（下一次 save）：磁碟上的 tacticBook 仍逐位元相同", J(a.disk) === before && J(b.disk) === before && !!disk0);
  //  兩個發布旗標只有這兩個檔讀：旗標決定新開局的規則集與 Challenge 版本，不可能碰到存檔（store 讀的 asiaCircuitEnabled 是另一件事）。
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const readers = walk(path.join(ROOT, "src")).filter((f) => !f.endsWith("heroImages.js") && /mobaTacticalDirectorV21|mobaChallengeV21/.test(stripComments(fs.readFileSync(f, "utf8")))).map((f) => path.relative(ROOT, f).replaceAll("\\", "/")).sort();
  ck("A2 兩個發布旗標只有 featureFlags（定義）與 matchRuleset（解析）讀（store 與存檔層讀不到，旗標不可能改動存檔內容）", J(readers) === J(["src/featureFlags.js", "src/platform/contracts/matchRuleset.js"]), readers.join(","));
  const entries = useProfileStore.getState().tacticBook.plans;
  const hashes = J(entries.map((e) => e.id));
  const bad = [];
  for (const e of entries) {
    const b0 = J(e.plan), binding = bind(e.plan);
    const on1 = start({ flags: ON, tacticPlanBinding: binding }), off = start({ flags: OFF, tacticPlanBinding: binding }), on2 = start({ flags: ON, tacticPlanBinding: binding });
    if (!on1.ok || !off.ok || !on2.ok) bad.push(`${e.id} start ${on1.ok}/${off.ok}/${on2.ok}`);
    else if (matchSetupHash(on1.setup) !== matchSetupHash(on2.setup)) bad.push(`${e.id} on/off/on 不一致`);
    if (J(e.plan) !== b0 || tacticPlanHash(e.plan) !== e.id) bad.push(`${e.id} 計畫被改寫`);
  }
  ck("A3 每份計畫都能在旗標開、關、再開下開局；開→關→開結果一致；計畫與 planHash 不被改寫", !bad.length && J(useProfileStore.getState().tacticBook.plans.map((e) => e.id)) === hashes, bad.slice(0, 4).join(" | "));
  const m3 = BOOK_PLANS[0], view = (flagsOn) => offeredChoicesOnly(m3.templateId, [], m3.choices, flagsOn ? { tacticalDirector: "core.v1", templateBalance: TB } : { tacticalDirector: "core.v1" });
  ck("A4 已撤的選擇：修正表下畫面拿掉（dropped），存檔裡的計畫不變；旗標關回出貨版畫面又提供", J(view(true).dropped) === J([{ dimension: "teamfight.posture", choice: "passive" }]) && view(false).dropped.length === 0 && J(useProfileStore.getState().tacticBook.plans.find((e) => e.id === tacticPlanHash(m3)).plan) === J(m3));
}

// ── B 進行中的比賽：落盤的規則集說了算 ──────────────────────────────────────
//  session 走真正的 JSON 落盤＋persistedLiveConfigOf（hook 恢復時讀的就是它）。
const persistRoundTrip = (prepared, extra = {}) => {
  const session = JSON.parse(J({ sessionId: "rollback-drill", activeMatch: { config: { ruleset: prepared.setup.ruleset, objectiveLayout: prepared.setup.objectiveLayout, ...extra }, simulation: { timeSec: RESUME_AT } } }));
  return persistedLiveConfigOf(session, "rollback-drill");
};
const inProgressCase = (id, { flagsAtStart, wantRuleset, wantKind, ...input }) => {
  const first = start({ flags: flagsAtStart, ...input });
  if (!first.ok) { ck(`${id} 開局`, false, J(first.errors)); return; }
  const whole = runAndHash(first.engine, RUN);
  const cfg = persistRoundTrip(first, input.tacticPlanBinding ? { tacticPlanBinding: input.tacticPlanBinding } : { tactic: input.tactic });
  const results = {};
  for (const [name, flags] of [["off", OFF], ["on", ON]]) {
    const resumed = start({ flags, persisted: cfg.ruleset, ...(cfg.tacticPlanBinding ? { tacticPlanBinding: cfg.tacticPlanBinding } : { tactic: cfg.tactic }), resume: { resumeTimeSec: RESUME_AT, objectiveLayout: cfg.objectiveLayout } });
    if (!resumed.ok) { ck(`${id} 恢復（旗標 ${name}）`, false, J(resumed.errors)); return; }
    results[name] = { rs: resumed.setup.rulesetId ?? resumed.setup.ruleset?.rulesetId, kind: resumed.setup.tactic.blue.kind, hash: matchSetupHash(resumed.setup), ...playResumed(resumed.engine) };
  }
  const same = ["off", "on"].every((n) => results[n].digest === whole.digest && results[n].streamHash === whole.streamHash && results[n].hash === matchSetupHash(first.setup) && results[n].rs === wantRuleset && results[n].kind === wantKind);
  ck(`${id} 旗標關／開恢復都沿用 ${wantRuleset}：setup 雜湊、整場 digest＋streamHash 都等於沒中斷`, same, J({ whole: whole.digest, off: results.off.digest, on: results.on.digest, rs: results.off.rs, kind: results.off.kind }));
  return { whole, hash: matchSetupHash(first.setup) };
};
const m7Plan = plan("classic.m7", { phases: { early: { focusLane: "bot" } } });
const m7Binding = bind(m7Plan), v2Binding = bind(plan("v2.jungle_invasion"));
const m7Legacy = JSON.parse(J(mobaTacticById("m7")));
const b1 = inProgressCase("B1 career.v21＋binding（m7＋選擇）", { flagsAtStart: ON, wantRuleset: "career.v21", wantKind: "binding", tacticPlanBinding: m7Binding });
const b2 = inProgressCase("B2 career.v21＋legacy（矩陣 ②，由 id 重建修正後的 m7）", { flagsAtStart: ON, wantRuleset: "career.v21", wantKind: "legacy", tactic: m7Legacy });
const b3 = inProgressCase("B3 career.v20＋legacy（旗標開啟後恢復舊場次）", { flagsAtStart: OFF, wantRuleset: "career.v20", wantKind: "legacy", tactic: m7Legacy });

// ── C 確認了但還沒開打（規則集還沒落盤）──────────────────────────────────────
{
  const snap = (flags, input) => {
    const opts0 = J(optsOf(input));
    const p = start({ flags, ...input });
    return { ok: p.ok, hash: p.ok ? matchSetupHash(p.setup) : null, kind: p.setup?.tactic?.blue?.kind, tb: p.ok ? templateBalanceOf(p.setup.ruleset) : null, mode: p.ok ? tacticalDirectorModeOf(p.setup.ruleset) : null, sub: p.templateSubstitution ?? null, dropped: p.droppedChoices ?? [], mutated: J(optsOf(input)) !== opts0 };
  };
  //  矩陣 ②：core.v1＋沒有 binding（legacy）
  const c2on = snap(ON, { tactic: m7Legacy }), c2off = snap(OFF, { tactic: m7Legacy }), c2on2 = snap(ON, { tactic: m7Legacy });
  ck("C1 矩陣 ② 確認後未開打：旗標開＝career.v21 修正後的 m7；關＝career.v20 正式站的 m7；開→關→開一致；設定不被改寫",
    c2on.ok && c2off.ok && c2on.mode === "core.v1" && c2on.tb === TB && c2off.mode === "static" && c2off.tb === null && c2on.hash !== c2off.hash && c2on.hash === c2on2.hash && !c2on.mutated && !c2off.mutated, J({ c2on, c2off }));
  const d2on = liveTacticDisplayOf({ tactic: m7Legacy, ruleset: resolveLiveRuleset({ flags: ON }).ruleset }), d2off = liveTacticDisplayOf({ tactic: m7Legacy, ruleset: resolveLiveRuleset({ flags: OFF }).ruleset });
  ck("C2 矩陣 ② 顯示跟著本場實際打的：旗標開 v21 名稱、關 v20 名稱", d2on?.name === templateCopyFor("classic.m7", TB).name && d2off?.name === m7Legacy.name, J([d2on?.name, d2off?.name]));
  //  矩陣 ③：static＋有 binding
  const c3on = snap(ON, { tacticPlanBinding: v2Binding }), c3off = snap(OFF, { tacticPlanBinding: v2Binding }), c3on2 = snap(ON, { tacticPlanBinding: v2Binding });
  ck("C3 矩陣 ③ 確認後未開打（v2 計畫）：旗標關＝標準運營＋替換提示；開＝用 binding；開→關→開一致；binding 不被改寫",
    c3off.ok && c3off.kind === "std" && c3off.sub?.fromTemplateId === "v2.jungle_invasion" && c3on.ok && c3on.kind === "binding" && c3on.sub === null && c3on.hash === c3on2.hash && !c3on.mutated && !c3off.mutated, J({ c3on, c3off }));
  const m7on = snap(ON, { tacticPlanBinding: m7Binding }), m7off = snap(OFF, { tacticPlanBinding: m7Binding });
  ck("C4 矩陣 ③ 經典計畫：旗標關＝正式站的經典戰術、本場拿掉的選擇逐項列出；開＝binding", m7off.ok && m7off.kind === "legacy" && J(m7off.dropped) === J([{ dimension: "phases.early.focusLane", choice: "bot" }]) && m7on.ok && m7on.kind === "binding" && m7on.dropped.length === 0, J({ d: m7off.dropped, k: m7off.kind }));
  const legacyOff = start({ flags: OFF, tactic: m7Legacy });
  ck("C5 矩陣 ③ 的經典計畫在旗標關時，與直接選正式站 m7 的設定雜湊相同（回退後就是 v20 那一場）", legacyOff.ok && matchSetupHash(legacyOff.setup) === m7off.hash);

  // ── N 負向對照 ─────────────────────────────────────────────────────────────
  ck("N1 同一份輸入沒有落盤規則集、旗標關 ⇒ 真的是另一場（B1／B2 的相同不是空轉）", !!b1 && !!b2 && !!b3 && c2off.hash !== b2.hash && c2on.hash === b2.hash && c2off.hash === b3.hash && m7on.hash === b1.hash);
  const bogus = resolveLiveRuleset({ flags: OFF, persisted: { rulesetId: "nope", kind: "production" } });
  ck("N2 落盤的規則集認不得 ⇒ 不沿用、依旗標解析（壞掉的存檔不會開出未知規則）", bogus.source === "flags");
}

console.log(`\nStage-1 Rollback Drill 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
