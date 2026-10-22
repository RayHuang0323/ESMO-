// ============================================================================
//  tools/check_phase_options_arms_3c.mjs — deterministic arm probe for the C3-3/C4/C5 phase-option registrations (no ticks).
//  For each registered option and side: the knob/identity fields that differ from control at t=100/600/1200 must be non-empty exactly
//  in the option's phase(s) and empty elsewhere; the other side must be unchanged. Usage: node tools/check_phase_options_arms_3c.mjs <reg.json>...
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.ESMO_BALANCE_SKILLS = "on";
delete process.env.ESMO_BALANCE_TALENTS;
const ROOT = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const PS = await imp("tools/lib/phaseStudySim.mjs");
const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
const M = await modules();
const ctrl = await PS.studyInput();
const flat = (o, pre = "", out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { if (v && typeof v === "object" && !Array.isArray(v)) flat(v, `${pre}${k}.`, out); else out[`${pre}${k}`] = Array.isArray(v) ? JSON.stringify(v) : v; } return out; };
const snap = (e, side, t) => { e.t = t; return { ...flat(e.director.knobs(side), "k."), ...flat(e.director.identity(side), "i.") }; };
const T = { early: 100, mid: 600, late: 1200 };
const base = configure(44, "standard", M, 1, null, { blue: ctrl, red: ctrl }, "balanceTool.v21").e;
const baseSnap = { blue: {}, red: {} };
for (const s of ["blue", "red"]) for (const [p, t] of Object.entries(T)) baseSnap[s][p] = snap(base, s, t);
let bad = 0;
for (const reg of process.argv.slice(2)) {
  const R = JSON.parse(fs.readFileSync(reg, "utf8"));
  console.log(`== ${R.studyId}`);
  for (const o of R.options) {
    const arm = await PS.studyInput(o.input?.choices ?? {}, o.input?.phaseChoices ?? null);
    const line = [];
    for (const s of ["blue", "red"]) {
      const e = configure(44, "standard", M, 1, null, { blue: s === "blue" ? arm : ctrl, red: s === "red" ? arm : ctrl }, "balanceTool.v21").e;
      const other = s === "blue" ? "red" : "blue";
      const per = {};
      for (const [p, t] of Object.entries(T)) {
        const a = snap(e, s, t), b = baseSnap[s][p];
        per[p] = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k}:${b[k]}->${a[k]}`);
        const ao = snap(e, other, t), bo = baseSnap[other][p];
        if (Object.keys({ ...ao, ...bo }).some((k) => ao[k] !== bo[k])) { per[p].push("!!OTHER_SIDE_CHANGED"); bad++; }
      }
      const expectPh = o.phase ? o.phase.split("+") : ["early", "mid", "late"];
      const okPh = Object.entries(per).every(([p, d]) => (expectPh.includes(p) ? d.length > 0 : d.length === 0));   // whole-match options (phase null) must change all three phases
      if (!okPh) bad++;
      line.push(`${s}${okPh ? "" : " !!PHASE"} ${Object.entries(per).map(([p, d]) => `${p}[${d.join(" ")}]`).join(" ")}`);
    }
    console.log(`${o.id}\n   ${line.join("\n   ")}`);
  }
}
console.log(bad ? `PROBLEMS ${bad}` : "probe OK");
process.exit(bad ? 1 : 0);
