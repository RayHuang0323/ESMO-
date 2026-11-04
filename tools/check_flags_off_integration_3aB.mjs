#!/usr/bin/env node
// ============================================================================
//  tools/check_flags_off_integration_3aB.mjs — Phase 3a-B 測試性整合：旗標關閉時，合併後與 origin/main 逐項比對（Owner 2026-11-04 第 D 項）
//
//  執行：node tools/check_flags_off_integration_3aB.mjs --baseline=<origin/main 的乾淨 worktree>
//  同一支腳本以子行程跑在兩棵樹上（cwd 決定載入誰的 src），固定 Date 與 Math.random，存檔用真的 profileStore 寫。
//    F  旗標：main 有的旗標值逐項相同；新增的只有兩個發布旗標，都是 false；bundle 裡也是 false
//    R  規則集：旗標預設值下 Live 與 Challenge 的解析結果兩棵樹相同
//    S  存檔：新局、main 寫的存檔往前讀、合併後寫的存檔往回讀；除 tacticBook 外逐項相同；v21 計畫來回不被改寫
//    M  語意：main 沒有碰語意檔；v20 黃金 fixture 只由分支新增
//  只比對旗標關閉的狀態；對局內容由 check_match_setup_3a（v20 黃金）負責，這支不重跑比賽。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const J = JSON.stringify;
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;

// ── 子行程：只讀 cwd 那棵樹 ───────────────────────────────────────────────
if (arg("child")) {
  const scenario = arg("child");
  const lsIn = arg("in"), lsOut = arg("out");
  const LS = lsIn ? JSON.parse(fs.readFileSync(lsIn, "utf8")) : {};
  globalThis.localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: (k) => { delete LS[k]; } };
  const FIXED = Date.UTC(2026, 10, 4, 0, 0, 0);
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
  let s = 12345;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const load = (rel) => import(pathToFileURL(path.join(process.cwd(), rel)).href);
  const out = { scenario };
  const flagsMod = await load("src/featureFlags.js");
  const flags = Object.values(flagsMod).find((v) => v && typeof v === "object" && "heroSkillsV1" in v) ?? null;
  out.flags = flags ? Object.fromEntries(Object.entries(flags).filter(([, v]) => typeof v !== "function")) : null;
  //  main 沒有規則集層（v20 直接寫在呼叫端）⇒ 只有合併後才有這兩個結果
  out.rulesets = null;
  if (fs.existsSync("src/platform/contracts/matchRuleset.js")) {
    const rs = await load("src/platform/contracts/matchRuleset.js");
    out.rulesets = { career: rs.resolveRulesetForMode({ mode: "career", flags })?.rulesetId ?? null, challenge: rs.resolveRulesetForMode({ mode: "challenge", flags })?.rulesetId ?? null };
  }
  const sv = await load("src/platform/contracts/simulationVersion.js");
  out.simVersion = sv.MOBA_SIMULATION_VERSION ?? null;
  out.challengeVersion = fs.existsSync("src/platform/challenge/challengeVersion.js") ? (await load("src/platform/challenge/challengeVersion.js")).CHALLENGE_SIMULATION_VERSION : sv.MOBA_SIMULATION_VERSION;
  const { useProfileStore } = await load("src/platform/profileStore.js");
  const st = useProfileStore.getState();
  if (scenario === "seed") { st.pushInbox?.({ type: "system", from: "integration", subject: "probe", text: "probe" }); }
  if (scenario === "plans") {
    const plan = (await load("src/platform/tactics/tacticPlan.js")).createTacticPlan;
    const made = [];
    for (const [t, c] of [["classic.m7", { phases: { early: { focusLane: "bot" } } }], ["std", { winCondition: "earlySnowball" }], ["v2.jungle_invasion", {}]]) {
      const p = plan({ templateId: t, choices: c });
      const r = p?.ok === false ? p : st.saveTacticPlan(p?.plan ?? p);
      made.push({ template: t, ok: r.ok, errors: r.errors ?? [] });
    }
    out.plans = made;
  }
  if (scenario === "challenge") {
    const { MOBA_TACTICS } = await load("src/platform/contracts/MobaTacticConfig.js");
    const { HERO_ASSIGN } = await load("src/data/roster.js");
    const { FIXTURE_OPPONENTS } = await load("src/platform/challenge/fixtureOpponents.js");
    const progress = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((id, i) => [id, { level: 3 + (i % 4) }]));
    const store = () => useProfileStore.getState();
    store().startNewGame("elite");
    const pub = store().publishDefenseSnapshot(MOBA_TACTICS[0].tacticId, { heroProgress: progress });
    const started = store().startFixtureChallenge(FIXTURE_OPPONENTS[0].key);
    const ran = started.ok ? store().runChallengeById(started.challengeId) : { ok: false };
    const inst = store().challenge.instances[started.challengeId] ?? null;
    out.challenge = { published: pub.ok, started: started.ok, ran: ran.ok, id: started.challengeId ?? null, snapshotVersion: pub.snapshot?.simulationVersion ?? null, instanceVersion: inst?.simulationVersion ?? null, matchSeed: inst?.matchSeed ?? null, status: inst?.status ?? null, outcome: ran.result?.outcome ?? null, score: ran.result?.score ?? null, resultVersion: ran.result?.simulationVersion ?? null, digest: ran.result?.digest ?? ran.result?.replayDigest ?? null };
  }
  if (scenario === "verifyChallenge") {
    const ids = Object.keys(useProfileStore.getState().challenge?.instances ?? {});
    out.verified = ids.map((id) => { const r = useProfileStore.getState().verifyChallengeReplay(id); return { id, ok: r?.ok === true, matches: r?.matches ?? r?.identical ?? null, reason: r?.reason ?? r?.errors?.[0]?.message ?? null }; });
  }
  useProfileStore.getState().save();
  out.tacticBook = useProfileStore.getState().tacticBook ?? null;
  out.keys = Object.keys(LS).sort();
  fs.writeFileSync(lsOut, J(LS));
  console.log(`CHILD:${J(out)}`);
  process.exit(0);
}

// ── 比對 ───────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = path.resolve(path.dirname(SELF), "..");
const BASE = arg("baseline");
if (!BASE || !fs.existsSync(path.join(BASE, "src/featureFlags.js"))) { console.error("需要 --baseline=<合併前 main（stage1_merge_registration_3aB.json 的 mainParent）的乾淨 worktree>"); process.exit(2); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-flags-off-"));
const tmp = (n) => path.join(TMP, n);
const run = (cwd, scenario, lsIn, lsOut) => JSON.parse(execFileSync(process.execPath, [SELF, `--child=${scenario}`, ...(lsIn ? [`--in=${lsIn}`] : []), `--out=${lsOut}`], { cwd, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).split("\n").find((l) => l.startsWith("CHILD:")).slice(6));
const readLS = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const parseAll = (ls) => Object.fromEntries(Object.entries(ls).map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch { return [k, v]; } }));
//  回傳差異路徑（深度比對；兩邊都是物件才往下）
const diff = (a, b, p = "", o = []) => {
  if (a === b) return o;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p ? `${p}.${k}` : k, o);
    return o;
  }
  o.push(p);
  return o;
};
const onlyTacticBook = (d) => d.filter((x) => !/(^|\.)tacticBook(\.|$)/.test(x));
const git = (...a) => execFileSync("git", ["-c", "core.quotepath=off", ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

// F 旗標
const mainFresh = run(BASE, "fresh", null, tmp("main.fresh.json"));
const intFresh = run(ROOT, "fresh", null, tmp("int.fresh.json"));
ck("F1 main 有的旗標，合併後值逐項相同", !Object.keys(mainFresh.flags).some((k) => mainFresh.flags[k] !== intFresh.flags[k]), J(Object.keys(mainFresh.flags).filter((k) => mainFresh.flags[k] !== intFresh.flags[k])));
const added = Object.keys(intFresh.flags).filter((k) => !(k in mainFresh.flags)).sort();
ck("F2 新增的旗標恰好是兩個發布旗標，都是 false", J(added) === J(["mobaChallengeV21", "mobaTacticalDirectorV21"]) && intFresh.flags.mobaChallengeV21 === false && intFresh.flags.mobaTacticalDirectorV21 === false, J(added));
const distDir = path.join(ROOT, "dist/assets");
if (fs.existsSync(distDir)) {
  const js = fs.readdirSync(distDir).filter((f) => f.endsWith(".js"));
  const texts = js.map((f) => [f, fs.readFileSync(path.join(distDir, f), "utf8")]);
  const off = texts.filter(([, t]) => /mobaTacticalDirectorV21:!1/.test(t) && /mobaChallengeV21:!1/.test(t)).length;
  const on = texts.filter(([, t]) => /mobaTacticalDirectorV21:!0|mobaChallengeV21:!0/.test(t)).length;
  ck("F3 打包結果裡兩個旗標都是 false，沒有任何 true", off >= 1 && on === 0, J({ off, on, chunks: js.length }));
} else ck("F3 打包結果裡兩個旗標都是 false（找不到 dist，要先 build）", false);

// R 規則集
ck("R1 旗標預設值下，Live 解析成 career.v20、Challenge 解析成 challenge.v20", intFresh.rulesets?.career === "career.v20" && intFresh.rulesets?.challenge === "challenge.v20", J(intFresh.rulesets));
ck("R2 Challenge 版本：合併後旗標關＝main 的版本（moba-sim.v20）", intFresh.challengeVersion === "moba-sim.v20" && mainFresh.simVersion === "moba-sim.v20", J([intFresh.challengeVersion, mainFresh.simVersion]));
console.log(`ℹ️ 版本註記：合併後 MOBA_SIMULATION_VERSION＝${intFresh.simVersion}（未發布候選；main＝${mainFresh.simVersion}）。下面的 C 與 L 檢查它有沒有漏進玩家資料`);

// S 存檔
const mf = parseAll(readLS(tmp("main.fresh.json"))), nf = parseAll(readLS(tmp("int.fresh.json")));
const dFresh = diff(mf, nf);
ck("S1 新局：除 tacticBook 外逐項相同", !onlyTacticBook(dFresh).length, J(onlyTacticBook(dFresh).slice(0, 12)));
ck("S2 兩棵樹寫出的 localStorage 鍵名相同", J(mainFresh.keys) === J(intFresh.keys), J([mainFresh.keys, intFresh.keys]));
run(BASE, "seed", tmp("main.fresh.json"), tmp("main.seed.json"));
const fwd = run(ROOT, "load", tmp("main.seed.json"), tmp("int.fwd.json"));
run(BASE, "load", tmp("main.seed.json"), tmp("main.seed2.json"));
const m0 = parseAll(readLS(tmp("main.seed.json"))), m2 = parseAll(readLS(tmp("main.seed2.json"))), f1 = parseAll(readLS(tmp("int.fwd.json")));
const dFwd = diff(m0, f1), dSelf = diff(m2, f1);
ck("S3 main 寫的存檔往前讀再存：除 tacticBook 外逐項相同，舊資料沒有被覆寫（探針訊息還在）", !onlyTacticBook(dFwd).length && f1["esmo.profile.v1"]?.inbox?.[0]?.subject === "probe", J(onlyTacticBook(dFwd).slice(0, 12)));
ck("S3b 同一份存檔由 main 自己讀回再存，與合併後讀回再存：除 tacticBook 外逐項相同", !onlyTacticBook(dSelf).length, J(onlyTacticBook(dSelf).slice(0, 12)));
ck("S4 main 寫的存檔往前讀：沒有隔離（.corrupt）；戰術書是空的", !fwd.keys.some((k) => k.endsWith(".corrupt")) && (fwd.tacticBook?.plans ?? []).length === 0, J(fwd.keys));
const fwd2 = run(ROOT, "load", tmp("int.fwd.json"), tmp("int.fwd2.json"));
ck("S5 再讀再存一次：逐位元相同（冪等）", J(readLS(tmp("int.fwd.json"))) === J(readLS(tmp("int.fwd2.json"))), J(fwd2.keys.length));
const plans = run(ROOT, "plans", tmp("int.fwd.json"), tmp("int.plans.json"));
ck("S6 旗標關時存進 3 份 v21 計畫（模擬旗標開過又關的玩家）都成功", plans.plans?.every((p) => p.ok), J(plans.plans));
const again = run(ROOT, "load", tmp("int.plans.json"), tmp("int.plans2.json"));
ck("S7 帶 v21 計畫的存檔，旗標關讀回：tacticBook 逐位元相同，沒有隔離", J(again.tacticBook) === J(plans.tacticBook) && !again.keys.some((k) => k.endsWith(".corrupt")));
const back = run(BASE, "load", tmp("int.plans.json"), tmp("main.back.json"));
const b1 = parseAll(readLS(tmp("main.back.json"))), p1 = parseAll(readLS(tmp("int.plans.json")));
const dBack = diff(p1, b1);
ck("S8 回滾：合併後寫的存檔給 main 讀：不隔離；除 tacticBook 外逐項相同", !back.keys.some((k) => k.endsWith(".corrupt")) && !onlyTacticBook(dBack).length, J(onlyTacticBook(dBack).slice(0, 12)));
const lost = dBack.filter((x) => /tacticBook/.test(x)).length > 0;
console.log(`ℹ️ 回滾註記：main 不認得 tacticBook，存回去時${lost ? "欄位會消失（旗標關時玩家做不出計畫，實際影響只有測試資料）" : "保留欄位"}`);

// C Challenge 與 Replay：同一份輸入在兩棵樹打一場，互相重播
const mc = run(BASE, "challenge", null, tmp("main.chal.json"));
const nc = run(ROOT, "challenge", null, tmp("int.chal.json"));
ck("C1 兩棵樹都發布、發起、打完一場挑戰", mc.challenge?.ran && nc.challenge?.ran, J([mc.challenge?.status, nc.challenge?.status]));
ck("C2 合併後的快照、場次、結果都記 moba-sim.v20", [nc.challenge?.snapshotVersion, nc.challenge?.instanceVersion].every((v) => v === "moba-sim.v20") && (nc.challenge?.resultVersion ?? "moba-sim.v20") === "moba-sim.v20", J(nc.challenge));
ck("C3 同一份輸入：Seed、賽果、比分兩棵樹相同", J([mc.challenge?.matchSeed, mc.challenge?.outcome, mc.challenge?.score]) === J([nc.challenge?.matchSeed, nc.challenge?.outcome, nc.challenge?.score]), J([mc.challenge, nc.challenge]));
const dChal = onlyTacticBook(diff(parseAll(readLS(tmp("main.chal.json"))), parseAll(readLS(tmp("int.chal.json")))));
ck("C4 打完挑戰後的存檔：除 tacticBook 外逐項相同", !dChal.length, J(dChal.slice(0, 12)));
const fwdV = run(ROOT, "verifyChallenge", tmp("main.chal.json"), tmp("int.fromMain.json"));
ck("C5 main 打的挑戰，合併後重播結果相同", fwdV.verified?.length === 1 && fwdV.verified.every((v) => v.ok), J(fwdV.verified));
const backV = run(BASE, "verifyChallenge", tmp("int.chal.json"), tmp("main.fromInt.json"));
ck("C6 回滾：合併後打的挑戰，main 重播結果相同", backV.verified?.length === 1 && backV.verified.every((v) => v.ok), J(backV.verified));

// L 洩漏：旗標關時玩家資料裡不該出現 v21 的任何標記
const LEAK = /moba-sim\.v21|career\.v21|challenge\.v21|balanceTool\.v21|v21\.b[0-9]|core\.v1/;
const leakIn = (f) => Object.entries(readLS(tmp(f))).filter(([, v]) => LEAK.test(String(v))).map(([k, v]) => [k, String(v).match(LEAK)[0]]);
for (const [n, f] of [["新局", "int.fresh.json"], ["舊存檔往前讀", "int.fwd.json"], ["打完挑戰", "int.chal.json"], ["重播 main 的挑戰", "int.fromMain.json"]]) {
  const hits = leakIn(f);
  ck(`L1 ${n}：存檔沒有任何 v21 標記`, !hits.length, J(hits));
}

// M 語意
//  固定在合併當時的兩個父節點（stage1_merge_registration_3aB.json）：合併進 main 之後 origin/main 就不再代表「合併前的 main」。
const MR = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/stage1_merge_registration_3aB.json"), "utf8"));
const merge = MR.forkPoint;
//  合併之後 origin/main 就是整合內容，拿它當對照樹會變成自己比自己，所以直接擋。
const baseHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: BASE, encoding: "utf8" }).trim();
ck("M0 對照樹就是合併前的 main，不是自己比自己", baseHead === MR.mainParent, baseHead.slice(0, 8));
const mainTouched = new Set(git("diff", "--name-only", merge, MR.mainParent).split("\n").filter(Boolean));
const semText = fs.readFileSync(path.join(ROOT, "src/platform/contracts/simulationVersion.js"), "utf8");
const sem = [...new Set([...semText.matchAll(/"(src\/[^"]+\.(?:js|jsx|mjs))"/g)].map((m) => m[1]))];
const hit = sem.filter((f) => mainTouched.has(f));
ck("M1 main 從合併基準以來沒有碰任何語意檔（v20 黃金對 main 一樣成立）", sem.length >= 40 && !hit.length, J({ semantics: sem.length, hit }));
ck("M2 v20 黃金 fixture 兩邊都沒有改動基準以來的內容（只由分支新增）", git("diff", "--name-only", merge, MR.mainParent, "--", "tools/fixtures/match_golden_v20.json").trim() === "" && git("diff", "--name-only", MR.branchParent, "HEAD", "--", "tools/fixtures/match_golden_v20.json").trim() === "");

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nFlags-Off Integration 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
