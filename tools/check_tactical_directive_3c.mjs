// Phase 3a-C1 Task 5：TacticalDirective.v1 契約。欄位集合一律從既有投影推導，不手抄。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MOBA_TACTICS, STANDARD_OPP_TACTIC, toEngineTactic, toEngineTacticIdentity } from "../src/platform/contracts/MobaTacticConfig.js";
import * as D from "../src/platform/contracts/tacticalDirective.js";
import { SIMULATION_SEMANTICS_FILES } from "../src/platform/contracts/simulationVersion.js";
import { stripComments } from "./lib/stripComments.mjs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tactics = [...MOBA_TACTICS, STANDARD_OPP_TACTIC];
const sameSet = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
const deepFrozen = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
const mk = (t, side = "blue", phase = 0) => ({ side, phase, knobs: toEngineTactic(t), identity: toEngineTacticIdentity(t) });

ck("D1 版本字串", D.TACTICAL_DIRECTIVE_VERSION === "TacticalDirective.v1");
ck("D2 涵蓋 m1–m8＋std（9 套）", tactics.length === 9 && MOBA_TACTICS.length === 8);
for (const t of tactics) {
  const dir = D.staticDirective(mk(t));
  ck(`D3 ${t.tacticId}：knobs 欄位集合＝toEngineTactic 的欄位`, sameSet(Object.keys(dir.knobs), Object.keys(toEngineTactic(t))));
  ck(`D4 ${t.tacticId}：identity 欄位集合＝toEngineTacticIdentity 的欄位`, sameSet(Object.keys(dir.identity), Object.keys(toEngineTacticIdentity(t))));
  ck(`D5 ${t.tacticId}：static directive 通過驗證，值與投影逐項相同`,
    D.validateTacticalDirective(dir).ok && JSON.stringify(dir.knobs) === JSON.stringify(toEngineTactic(t)) && JSON.stringify(dir.identity) === JSON.stringify(toEngineTacticIdentity(t)));
}
ck("D6 匯出的欄位清單＝投影欄位", sameSet(D.DIRECTIVE_KNOB_FIELDS, Object.keys(toEngineTactic(STANDARD_OPP_TACTIC))) && sameSet(D.DIRECTIVE_IDENTITY_FIELDS, Object.keys(toEngineTacticIdentity(STANDARD_OPP_TACTIC))));
ck("D7 identity 可為 null", D.validateTacticalDirective(D.staticDirective({ ...mk(STANDARD_OPP_TACTIC), identity: null })).ok);
ck("D7b 兩個 side、三個 phase 都收", ["blue", "red"].every((s) => [0, 1, 2].every((p) => D.validateTacticalDirective(D.staticDirective(mk(MOBA_TACTICS[0], s, p))).ok)));

const good = () => JSON.parse(JSON.stringify({ schema: D.TACTICAL_DIRECTIVE_VERSION, ...mk(MOBA_TACTICS[0]) }));
const bad = (label, mutate) => { const d = good(); mutate(d); const r = D.validateTacticalDirective(d); ck(`N ${label} ⇒ 拒絕`, !r.ok && r.errors.length > 0, r.errors.join(";")); };
ck("N0 基準樣本通過（反例只差一處）", D.validateTacticalDirective(good()).ok);
bad("缺 knob 欄位", (d) => { delete d.knobs.joinFight; });
bad("多餘 knob 欄位", (d) => { d.knobs.extra = 1; });
bad("knob 型別錯（數字給字串）", (d) => { d.knobs.joinFight = "0.6"; });
bad("knob 型別錯（NaN）", (d) => { d.knobs.retreatAt = NaN; });
bad("knob 型別錯（布林給數字）", (d) => { d.knobs.invadeWithMid = 1; });
bad("laneOffset 內容非數字", (d) => { d.knobs.laneOffset.top = "x"; });
bad("缺 identity 欄位", (d) => { delete d.identity.engageBias; });
bad("多餘 identity 欄位", (d) => { d.identity.extra = 0; });
bad("identity 型別錯", (d) => { d.identity.phaseEngage = "x"; });
bad("未知 side", (d) => { d.side = "green"; });
bad("未知 phase", (d) => { d.phase = 3; });
bad("phase 為字串", (d) => { d.phase = "0"; });
bad("schema 錯", (d) => { d.schema = "TacticalDirective.v2"; });
bad("頂層多餘欄位", (d) => { d.mode = "static"; });
bad("缺 identity（undefined ≠ null）", (d) => { delete d.identity; });
bad("knobs 非物件", (d) => { d.knobs = []; });
for (const [l, v] of [["null", null], ["陣列", []], ["字串", "x"], ["undefined", undefined], ["class 實例", new (class X {})()]])
  ck(`N 非純物件（${l}）⇒ 拒絕`, !D.validateTacticalDirective(v).ok);
ck("N staticDirective 收到無效輸入 ⇒ 丟錯", (() => { try { D.staticDirective({ ...mk(MOBA_TACTICS[0]), side: "x" }); return false; } catch { return true; } })());

//  輸入不被改動、輸出深凍結且與輸入脫鉤
{
  const input = mk(MOBA_TACTICS[2]);
  const before = JSON.stringify(input);
  const dir = D.staticDirective(input);
  ck("F1 staticDirective 不改輸入", JSON.stringify(input) === before && !Object.isFrozen(input.knobs) && !Object.isFrozen(input.knobs.laneOffset));
  ck("F2 輸出深凍結", deepFrozen(dir) && Object.isFrozen(dir.knobs.gankWeights) && Object.isFrozen(dir.identity.phaseEngage));
  input.knobs.laneOffset.top = 99; input.identity.phaseEngage.push(1);
  ck("F3 輸出與輸入脫鉤（之後改輸入不影響 directive）", dir.knobs.laneOffset.top !== 99 && dir.identity.phaseEngage.length === 3);
  ck("F4 嘗試改輸出無效", (() => { "use strict"; try { dir.knobs.joinFight = 0; return false; } catch { return dir.knobs.joinFight === toEngineTactic(MOBA_TACTICS[2]).joinFight; } })());
}

//  C1 邊界：沒有人 import 它，也不在語意清單
{
  const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { if (n === "node_modules") continue; const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : /\.(js|jsx|mjs)$/.test(n) && out.push(p); } return out; };
  const self = join(ROOT, "src", "platform", "contracts", "tacticalDirective.js");
  const users = walk(join(ROOT, "src")).filter((p) => p !== self).filter((p) => {
    const raw = readFileSync(p, "utf8");
    return raw.includes("tacticalDirective") && /tacticalDirective(\.js)?["']/.test(stripComments(raw));
  });
  ck("B1 src 內沒有任何檔案 import tacticalDirective（C1 尚未接線）", users.length === 0, users.join(","));
  ck("B2 不在 SIMULATION_SEMANTICS_FILES（還沒載入 ⇒ 不改指紋）", !SIMULATION_SEMANTICS_FILES.some((f) => /tacticalDirective/.test(f)));
}

console.log(`\nTactical Directive 3c：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
