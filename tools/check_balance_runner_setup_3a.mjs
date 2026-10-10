#!/usr/bin/env node
// ============================================================================
//  tools/check_balance_runner_setup_3a.mjs — Phase 3a Task 6：balance runner 的 configure() 改走唯一組裝器的 parity gate
//
//  執行：node tools/check_balance_runner_setup_3a.mjs            （18 場 runner golden，約數分鐘）
//        node tools/check_balance_runner_setup_3a.mjs --only=a,b （只跑指定 golden case；其餘區段照跑）
//
//  與 check_match_assembler_3a 的差別：那支「自己從 golden 輸入編 setup 再丟組裝器」；這支呼叫的是
//  **正式的 runner configure()**（含 M 模組注入、環境變數、incomeK、rosterOverride），所以抓得到 runner 這一層的錯
//  （哪些層被關、ESMO_BALANCE_LAYOUT 的讀取時機、M 缺模組時的行為）。
//
//  核心斷言（18 個 golden case 各一次，探針與 capture_match_golden_v20.mjs 相同）：
//   (a) 引擎上實際發生的 configure* 呼叫順序與每次引數的 8 位雜湊 ＝ golden `calls`
//   (b) 整場 digest 與 streamHash ＝ golden
//  另外（golden 沒有涵蓋的變體，對照 v20 configure() 的原文複本 legacyConfigure）：
//   rosterOverride、incomeK≠1、ESMO_BALANCE_LAYOUT（呼叫當下讀取）、M 模組逐一置空（skills／talents／passives／curves／
//   objectiveLayout／tacticIdentity）、ESMO_BALANCE_RULES（載入時讀取，子行程驗）、錯誤輸入、原始碼不再直接呼叫 e.configure*。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };

//  runner 在載入時讀 ESMO_BALANCE_SKILLS／TALENTS；golden 是用兩者 on 錄的，"off" 模組組由置空衍生（capture 同做法）。
const dirty = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
if (dirty.length) { console.error(`unset these env vars first: ${dirty.join(", ")}`); process.exit(2); }
process.env.ESMO_BALANCE_SKILLS = "on";
process.env.ESMO_BALANCE_TALENTS = "on";

const { stableStringify, stableHash } = await import("../src/platform/contracts/squadSnapshot.js");
const { runAndHash } = await import("./lib/matchGolden.mjs");
const { stripComments } = await import("./lib/stripComments.mjs");
const runner = await import("./balance/moba_items_balance_runner.mjs");
const M_ON = await runner.modules();
const M_OFF = { ...M_ON, skills: null, talents: null, passives: null, curves: null };

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const cases = golden.cases.filter((c) => c.path === "runner" && (!ONLY || ONLY.has(c.id)));

// ── 探針：prototype 上的 pass-through 包裝（與 capture_match_golden_v20.mjs 相同）────────────────
const PROBE = { calls: null };
const LE = M_ON.LE.LogicEngine;
for (const name of Object.getOwnPropertyNames(LE.prototype)) {
  if (!/^configure|^enable/.test(name) || typeof LE.prototype[name] !== "function") continue;
  const orig = LE.prototype[name];
  LE.prototype[name] = function probed(...args) {
    if (PROBE.calls) PROBE.calls.push({ m: name, h: stableHash(stableStringify(args.length <= 1 ? args[0] : args)) });
    return orig.apply(this, args);
  };
}
const probe = (fn) => {
  PROBE.calls = [];
  try { const out = fn(); return { out, calls: PROBE.calls }; } finally { PROBE.calls = null; }
};
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};
const names = (calls) => calls.map((c) => c.m);

// ── v20 configure() 的原文複本（只用來對照 golden 沒有涵蓋的變體；RULE_OVERRIDES 在本行程恆為 null）────────
function legacyConfigure(seed, config, M, incomeK = 1, rosterOverride = null) {
  const roster = rosterOverride ?? runner.mirroredRoster(seed, M);
  const e = new M.LE.LogicEngine(seed);
  if (M.objectiveLayout && typeof e.configureObjectiveLayout === "function") {
    const forced = process.env.ESMO_BALANCE_LAYOUT;
    e.configureObjectiveLayout(forced === "STANDARD" || forced === "SWAPPED" ? forced : M.objectiveLayout.objectiveLayoutForSeed(seed));
  }
  const heroMods = M.profile.toEngineHeroMods(roster, M.heroes.heroById);
  if (heroMods) e.configureHeroes(heroMods);
  if (M.skills) {
    const selected = M.talents?.selectBattleTalents(roster) ?? null;
    const sk = M.skills.toEngineHeroSkills(roster, selected);
    if (sk) e.configureHeroSkills(sk);
    const pv = sk && M.passives ? M.passives.toEngineHeroPassives(roster) : null;
    if (pv && typeof e.configureHeroPassives === "function") e.configureHeroPassives(pv);
    const pc = sk && M.curves ? M.curves.toEngineHeroPowerCurve(roster) : null;
    if (pc && typeof e.configureHeroPowerCurve === "function") e.configureHeroPowerCurve(pc);
  }
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(M.arche.toEngineArchetypes(roster))) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: null });
  e.configureSpells(M.loadout.toEngineSpells(roster));
  const ident = M.tactic.toEngineTacticIdentity ? { blue: M.tactic.toEngineTacticIdentity(M.tactic.STANDARD_OPP_TACTIC), red: M.tactic.toEngineTacticIdentity(M.tactic.STANDARD_OPP_TACTIC) } : null;
  e.configureMatch({ blue: M.tactic.toEngineTactic(M.tactic.STANDARD_OPP_TACTIC), red: M.tactic.toEngineTactic(M.tactic.STANDARD_OPP_TACTIC), meta: null, identity: ident });
  let strategySide = null;
  if (config !== "off") {
    const strategies = {};
    if (config !== "standard") {
      strategySide = seed % 2 === 0 ? "blue" : "red";
      for (const pid of Object.keys(roster)) strategies[pid] = (pid[0] === "b") === (strategySide === "blue") ? config : "standard";
    }
    const itemsCfg = M.adapter.toEngineItems({ roster, heroLookup: M.heroes.heroById, strategies, defaultStrategy: "standard" });
    e.configureItems(itemsCfg);
    if (incomeK !== 1) e.items.incomeK = incomeK;
  }
  return { e, roster, strategySide };
}

// ── G：18 個 golden case，走真實 runner configure() ──────────────────────────────────────────────
const t0 = Date.now();
let sumOk = 0, sumBad = 0;
for (const [n, c] of cases.entries()) {
  const M = c.params.skills ? M_ON : M_OFF;
  const { out, calls } = probe(() => runner.configure(c.seed, c.params.config, M));
  const diff = firstDiff(calls, c.calls);
  ck(`G ${c.id} (a) configure 序列與引數雜湊＝golden（${c.calls.length} 呼叫）`, diff === "", diff);
  const res = runAndHash(out.e, { dt: golden.dt, maxT: golden.maxT.runner, every: golden.streamEvery });
  const same = res.digest === c.digest && res.streamHash === c.streamHash;
  ck(`G ${c.id} (b) digest＋streamHash＝golden`, same, same ? res.digest : `got ${res.digest}/${res.streamHash} want ${c.digest}/${c.streamHash}`);
  const sideOk = out.strategySide === (c.params.config === "off" || c.params.config === "standard" ? null : (c.seed % 2 === 0 ? "blue" : "red"));
  ck(`G ${c.id} (c) 回傳形狀 { e, roster, strategySide }；strategySide 依 config／seed 奇偶`, JSON.stringify(Object.keys(out)) === JSON.stringify(["e", "roster", "strategySide"]) && sideOk);
  (diff === "" && same ? sumOk++ : sumBad++);
  process.stderr.write(`  ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
console.log(`  逐位元重現（經真實 configure()）：${sumOk}/${sumOk + sumBad}`);

// ── V：變體對照（新 configure ≡ v20 複本：呼叫序列＋引數雜湊＋短跑狀態）──────────────────────────
const shortRun = (e) => runAndHash(e, { dt: 0.5, maxT: 300, every: 20 });
function same(label, args, { env = null, M2 = null } = {}) {
  const M = M2 ?? M_ON;
  const saved = {};
  if (env) for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  try {
    const a = probe(() => runner.configure(args.seed, args.config, M, args.incomeK ?? 1, args.roster ?? null));
    const b = probe(() => legacyConfigure(args.seed, args.config, M, args.incomeK ?? 1, args.roster ?? null));
    const d = firstDiff(a.calls, b.calls);
    const ra = shortRun(a.out.e), rb = shortRun(b.out.e);
    const extra = a.out.e.items?.incomeK === b.out.e.items?.incomeK && a.out.strategySide === b.out.strategySide;
    ck(label, d === "" && ra.digest === rb.digest && ra.streamHash === rb.streamHash && extra, d || `${ra.digest} vs ${rb.digest}`);
    return { a, b };
  } finally {
    if (env) for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// rosterOverride：非 seed 挑的陣容（與 mirroredRoster 不同）
const rosterAlt = runner.mirroredRoster(41, M_ON);
const rosterSeed3 = runner.mirroredRoster(3, M_ON);
const vr = same("V1 rosterOverride：陣容用給定的（與 seed 挑的不同）且 ≡ v20", { seed: 3, config: "standard", roster: rosterAlt });
ck("V1b rosterOverride 有效：回傳的 roster 就是給的那份；英雄與 seed 挑的陣容不同（可偵測：換成 seed 陣容雜湊會不同）",
  vr.a.out.roster === rosterAlt && JSON.stringify(rosterAlt) !== JSON.stringify(rosterSeed3)
  && firstDiff(vr.a.calls, probe(() => runner.configure(3, "standard", M_ON)).calls) !== "");

// incomeK
const vk = same("V2 incomeK=1.25（standard）≡ v20；倍率寫進 e.items.incomeK", { seed: 7, config: "standard", incomeK: 1.25 });
ck("V2b incomeK 實際生效：1.25；incomeK=1 ⇒ 不覆寫（維持引擎預設）", vk.a.out.e.items.incomeK === 1.25 && probe(() => runner.configure(7, "standard", M_ON, 1)).out.e.items.incomeK !== 1.25);
same("V2c incomeK=0.8＋策略側（early）≡ v20", { seed: 10, config: "early", incomeK: 0.8 });
{
  let threw = null, out = null;
  try { out = runner.configure(7, "off", M_OFF, 1.25); } catch (e) { threw = e; }
  ck("V2d config=off 時 incomeK 被忽略（v20：只在出裝分支內套用）⇒ 不丟例外、沒有 e.items", !threw && out && !out.e.items, threw ? String(threw) : "");
}

// ESMO_BALANCE_LAYOUT：呼叫當下讀取（不是載入時）
const layoutArg = (calls) => calls.find((c) => c.m === "configureObjectiveLayout")?.h ?? null;
{
  const natural = M_ON.objectiveLayout.objectiveLayoutForSeed(3);
  const other = natural === "STANDARD" ? "SWAPPED" : "STANDARD";
  const base = probe(() => runner.configure(3, "off", M_OFF)).calls;
  const forced = same(`V3 ESMO_BALANCE_LAYOUT=${other}（seed 3 的自然版面是 ${natural}）≡ v20`, { seed: 3, config: "off" }, { env: { ESMO_BALANCE_LAYOUT: other }, M2: M_OFF });
  ck("V3b 強制版面確實改變 configureObjectiveLayout 的引數（可偵測）", layoutArg(forced.a.calls) !== null && layoutArg(forced.a.calls) !== layoutArg(base));
  ck("V3c 環境變數是呼叫當下讀的：同一行程、載入後才設定即生效；還原後回到自然版面", layoutArg(probe(() => runner.configure(3, "off", M_OFF)).calls) === layoutArg(base));
  same("V3d ESMO_BALANCE_LAYOUT=bogus ⇒ 忽略，用自然版面 ≡ v20", { seed: 3, config: "off" }, { env: { ESMO_BALANCE_LAYOUT: "bogus" }, M2: M_OFF });
  const bogus = (() => { process.env.ESMO_BALANCE_LAYOUT = "bogus"; try { return layoutArg(probe(() => runner.configure(3, "off", M_OFF)).calls); } finally { delete process.env.ESMO_BALANCE_LAYOUT; } })();
  ck("V3e bogus 值與未設定產生相同的版面引數", bogus === layoutArg(base));
}

// M 模組逐一置空
{
  const none = (M) => names(probe(() => runner.configure(3, "standard", M)).calls);
  const noSkills = none({ ...M_ON, skills: null });
  ck("V4 M.skills=null ⇒ 沒有 skills／passives／powerCurve 呼叫（talents 單獨存在也不會單獨呼叫）",
    !noSkills.some((m) => /Skills|Passives|PowerCurve/.test(m)) && noSkills.includes("configureHeroes") && noSkills.includes("configureItems"), noSkills.join(","));
  same("V4b M.skills=null ≡ v20（保留 talents）", { seed: 3, config: "standard" }, { M2: { ...M_ON, skills: null } });
  const withSkills = none(M_ON);
  ck("V4c 對照組：skills 開時確實有 skills／passives／powerCurve 呼叫（上一條可以失敗）", ["configureHeroSkills", "configureHeroPassives", "configureHeroPowerCurve"].every((m) => withSkills.includes(m)));
  same("V5 M.talents=null（skills 開）≡ v20：技能不帶天賦", { seed: 7, config: "standard" }, { M2: { ...M_ON, talents: null } });
  const noPass = none({ ...M_ON, passives: null });
  ck("V6 M.passives=null ⇒ 無 configureHeroPassives，其餘不變", !noPass.includes("configureHeroPassives") && noPass.includes("configureHeroSkills") && noPass.includes("configureHeroPowerCurve"), noPass.join(","));
  same("V6b M.passives=null ≡ v20", { seed: 3, config: "standard" }, { M2: { ...M_ON, passives: null } });
  const noCurve = none({ ...M_ON, curves: null });
  ck("V7 M.curves=null ⇒ 無 configureHeroPowerCurve，其餘不變", !noCurve.includes("configureHeroPowerCurve") && noCurve.includes("configureHeroPassives"), noCurve.join(","));
  same("V7b M.curves=null ≡ v20", { seed: 3, config: "standard" }, { M2: { ...M_ON, curves: null } });
  const noLayout = none({ ...M_ON, objectiveLayout: null });
  ck("V8 M.objectiveLayout=null ⇒ 不呼叫 configureObjectiveLayout（舊樹沒有版面契約）", !noLayout.includes("configureObjectiveLayout") && none(M_ON).includes("configureObjectiveLayout"));
  same("V8b M.objectiveLayout=null ≡ v20（引擎維持預設 STANDARD）", { seed: 3, config: "standard" }, { M2: { ...M_ON, objectiveLayout: null } });
  same("V8c M.objectiveLayout=null 即使設了 ESMO_BALANCE_LAYOUT 也不呼叫（v20：整段跳過）", { seed: 3, config: "off" }, { M2: { ...M_OFF, objectiveLayout: null }, env: { ESMO_BALANCE_LAYOUT: "SWAPPED" } });
  const noIdent = { ...M_ON, tactic: { ...M_ON.tactic, toEngineTacticIdentity: undefined } };
  const withIdent = probe(() => runner.configure(3, "standard", M_ON)).calls.find((c) => c.m === "configureMatch").h;
  ck("V9 M.tactic 沒有 toEngineTacticIdentity ⇒ configureMatch 的 identity 為 null（引數與有 identity 時不同）",
    probe(() => runner.configure(3, "standard", noIdent)).calls.find((c) => c.m === "configureMatch").h !== withIdent);
  same("V9b 沒有 toEngineTacticIdentity ≡ v20", { seed: 3, config: "standard" }, { M2: noIdent });
  const m = same("V10 M 全空（skills／talents／passives／curves／objectiveLayout 皆 null）≡ v20", { seed: 11, config: "off" },
    { M2: { ...M_ON, skills: null, talents: null, passives: null, curves: null, objectiveLayout: null } });
  ck("V10b 全空時只剩 heroes→archetypes→spells→match", JSON.stringify(names(m.a.calls)) === JSON.stringify(["configureHeroes", "configureArchetypes", "configureSpells", "configureMatch"]), names(m.a.calls).join(","));
}

// 被替換的引擎類別（tactical_identity_v17 的做法：M.LE 換成子類別）要被真的用到
{
  let ctorSeen = 0;
  const Sub = class extends M_ON.LE.LogicEngine { constructor(...a) { super(...a); ctorSeen++; this.rules = { ...this.rules, towerHp: 4321 }; } };
  const out = runner.configure(5, "off", { ...M_OFF, LE: { LogicEngine: Sub } });
  ck("V11 M.LE.LogicEngine 是組裝器實際使用的引擎類別（子類別被建構、其規則覆寫存活）", ctorSeen === 1 && out.e instanceof Sub && out.e.rules.towerHp === 4321);
}

// 錯誤輸入：不默默近似
{
  let msg = null;
  try { runner.configure(3, "standard", M_ON, 1, { b1: { heroId: rosterSeed3.b1.heroId } }); } catch (e) { msg = String(e.message); }
  ck("V12 陣容席位不齊 ⇒ 丟出帶錯誤碼的例外（不默默組出半套對局）", !!msg && /MatchSetup rejected: roster_invalid/.test(msg), msg ?? "no throw");
  let msg2 = null;
  try { runner.configure(3, "not_a_strategy", M_ON); } catch (e) { msg2 = String(e.message); }
  ck("V12b 未知出裝策略 ⇒ 組裝器拒絕（build_strategy_unknown），不默默改成 standard", !!msg2 && /build_strategy_unknown/.test(msg2), msg2 ?? "no throw");
}

// ── R：ESMO_BALANCE_RULES 是「載入時」讀的模組常數；子行程驗（一次一個行程）───────────────────────
{
  const code = `
    const R = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, "tools/balance/moba_items_balance_runner.mjs")).href)});
    const M = await R.modules();
    const { e } = R.configure(3, "off", M);
    console.log("RESULT " + JSON.stringify({ towerHp: e.rules.towerHp, other: e.rules.minionHp ?? null }));`;
  const childEnv = (rules) => { const env = { ...process.env }; for (const k of Object.keys(env)) if (k.startsWith("ESMO_BALANCE_")) delete env[k]; if (rules) env.ESMO_BALANCE_RULES = rules; return env; };
  const run = (rules) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: childEnv(rules), encoding: "utf8", timeout: 240000 }).split("\n").find((l) => l.startsWith("RESULT ")).slice(7));
  const base = run(null), over = run(JSON.stringify({ towerHp: 4242 }));
  ck("R ESMO_BALANCE_RULES={towerHp:4242} ⇒ 這一場引擎的 rules.towerHp＝4242；未設定時不是（可偵測）", over.towerHp === 4242 && base.towerHp !== 4242, `${base.towerHp} → ${over.towerHp}`);
  ck("R2 規則覆寫只影響該行程的實例（未設定的行程維持原值，且其他欄位不變）", base.other === over.other);
}

// ── S：原始碼——configure() 不再直接呼叫任何 e.configure*；只透過組裝器 ───────────────────────────────
{
  const src = stripComments(fs.readFileSync(path.join(ROOT, "tools/balance/moba_items_balance_runner.mjs"), "utf8"));
  const bodyOf = (text, sig) => { const i = text.indexOf(sig); if (i < 0) return null; const j = text.indexOf("\n}\n", i); return text.slice(i, j < 0 ? undefined : j + 2); };
  const directCall = /\b[A-Za-z_$][\w$]*\s*\.\s*(configure[A-Z]\w*|enable[A-Z]\w*)\s*\(/;
  const cfg = bodyOf(src, "export function configure(");
  const setupFn = bodyOf(src, "export function buildBalanceMatchSetup(");
  ck("S1 找得到 configure() 與 buildBalanceMatchSetup() 本體", !!cfg && !!setupFn);
  ck("S2 configure() 本體沒有任何 .configure*／.enable* 直接呼叫", !!cfg && !directCall.test(cfg), cfg?.match(directCall)?.[0] ?? "");
  ck("S3 整個 runner 檔（剝註解後）沒有 e.configure*／.enable* 直接呼叫", !directCall.test(src), src.match(directCall)?.[0] ?? "");
  ck("S4 configure() 透過 assembleMatch，且 deps 來自共用核心 buildMatchAssemblerDepsFrom（不另拼 adapter 清單）",
    /\bassembleMatch\s*\(/.test(cfg ?? "") && /\bbuildMatchAssemblerDepsFrom\s*\(/.test(cfg ?? "") && !/\bnew\s+(M\.LE\.)?LogicEngine\b/.test(src));
  ck("S5 setup 的 tool 欄位來源：ruleOverrides／forcedLayout／itemsStrategies／incomeK 都在 buildBalanceMatchSetup 裡",
    ["ruleOverrides", "forcedLayout", "itemsStrategies", "incomeK"].every((k) => new RegExp(`tool\\.${k}\\b`).test(setupFn ?? "")));
  ck("S6 偵測器有檢定力：對 v20 原文複本（legacyConfigure）必須判為違規", directCall.test(legacyConfigure.toString()));
  ck("S7 偵測器不會被註解騙：註解裡寫 e.configureHeroes( 不算呼叫", !directCall.test(stripComments("// e.configureHeroes(x)\n/* e.configureItems(y) */\nconst a = 1;\n")));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail}${fail ? `（${fail} 失敗）` : ""}`);
process.exit(fail ? 1 : 0);
