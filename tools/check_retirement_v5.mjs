#!/usr/bin/env node
// ============================================================================
//  tools/check_retirement_v5.mjs — Season vNext V5-3：退休意向 × 退休 × 青訓補位
//
//  執行：repo 根目錄 `node tools/check_retirement_v5.mjs`；失敗 exit 1。
//
//  ── 紅線（使用者指定）─────────────────────────────────────────────────────
//  · **沒有退休意向不得突然退休**（預告是結構保證，不是善意期待）
//  · 出賽率只能**小幅**影響，**不得靠刷出賽永遠免疫**
//  · **退休不能因人數不足被取消**（延後退休可被反向利用：永遠不補人就永遠沒人走）
//  · 人數不足時用**較弱的免費青訓補位**
//  · **不得讓玩家永久卡死**
//
//  §C 契約　§I 意向　§R 退休與延役　§F 名單地板與青訓補位
//  §S 15 年 soft-lock 實跑　§D 決定性／冪等　§N 本輪邊界　§M sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const soft = async (p) => { try { return await imp(p); } catch { return null; } };

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_RET = "src/platform/progress/retirement.js";
const P_STORE = "src/platform/profileStore.js";
const P_OFF = "src/platform/time/offSeason.js";

const ret = await soft(P_RET);
const model = await imp("src/data/playerModel.js");
const drift = await imp("src/platform/progress/ageDrift.js");

const mk = ({ id = "p", age = 33, at = 70, potential = 88 } = {}) => ({
  id, role: "中路", age, potential, lv: 40, energy: 100,
  stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, at])),
});
const squad = (n, opts = {}) => Array.from({ length: n }, (_, i) => mk({ id: `s${i}`, ...opts }));
const stateOf = (players, extra = {}) => ({ meta: { days: 84, ...extra }, players });

// ════════════════════════════════════════════════════════════════════════════
//  §C 契約
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 契約】");

ck("C1) 有獨立的退休純模組 `progress/retirement.js`", !!ret, ret ? "" : "模組不存在");

ck("C2) 純模組（不 import Store / React / localStorage）",
  !!ret && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_RET))));

ck("C3) 有版本字串與 frozen 常數",
  !!ret && typeof ret.RETIREMENT_VERSION === "string" && Object.isFrozen(ret.RETIREMENT));

ck("C4) 老化時鐘沿用 V5-2 的 `agingAgeOf`（不另立第二個年齡概念）",
  !!ret && /ageDrift/.test(codeOnly(read(P_RET))) && /agingAgeOf/.test(codeOnly(read(P_RET))));

ck("C5) 三支入口都在：`intentChanceOf` / `evaluateIntents` / `resolveRetirements`",
  !!ret && ["intentChanceOf", "evaluateIntents", "resolveRetirements"].every((f) => typeof ret[f] === "function"));

// ════════════════════════════════════════════════════════════════════════════
//  §I 意向
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§I 退休意向】");

ck("I1) 年輕人機率恆為 0（沒有年齡牆，但年輕人不會宣布）",
  !!ret && [20, 24, 27].every((age) => ret.intentChanceOf(mk({ id: "y", age })) === 0),
  !!ret ? [20, 24, 27].map((a) => `${a}歲 ${ret.intentChanceOf(mk({ id: "y", age: a }))}`).join(" ") : "");

ck("I2) 機率隨年齡**單調不遞減**",
  !!ret && (() => {
    let last = -1;
    for (let a = 25; a <= 45; a++) {
      const c = ret.intentChanceOf(mk({ id: "m", age: a }));
      if (c < last) return false;
      last = c;
    }
    return true;
  })());

ck("I3) **長期能力下滑會提高機率**（同齡，能力掉得多的比較高）",
  !!ret && ret.intentChanceOf(mk({ id: "d", age: 34, at: 55 })) > ret.intentChanceOf(mk({ id: "d", age: 34, at: 85 })),
  !!ret ? `能力 55 ⇒ ${ret.intentChanceOf(mk({ id: "d", age: 34, at: 55 })).toFixed(3)}｜85 ⇒ ${ret.intentChanceOf(mk({ id: "d", age: 34, at: 85 })).toFixed(3)}` : "");

ck("I4) 出賽率只能**小幅**修正（全勤 vs 全板凳的差距 ≤ 上限的兩倍）",
  !!ret && (() => {
    const hi = ret.intentChanceOf(mk({ id: "a", age: 35 }), { appearanceRatio: 1 });
    const lo = ret.intentChanceOf(mk({ id: "a", age: 35 }), { appearanceRatio: 0 });
    return Math.abs(lo - hi) <= RETIRE_MOD(ret) * 2 + 1e-9;
  })(),
  !!ret ? `全勤 ${ret.intentChanceOf(mk({ id: "a", age: 35 }), { appearanceRatio: 1 }).toFixed(3)}｜全板凳 ${ret.intentChanceOf(mk({ id: "a", age: 35 }), { appearanceRatio: 0 }).toFixed(3)}` : "");

ck("I5) **不得靠刷出賽永遠免疫**：全勤時機率仍隨年齡上升且恆 > 0",
  !!ret && (() => {
    let last = -1;
    for (let a = 33; a <= 45; a++) {
      const c = ret.intentChanceOf(mk({ id: "im", age: a }), { appearanceRatio: 1 });
      if (c <= 0 || c < last) return false;
      last = c;
    }
    return true;
  })(),
  !!ret ? `全勤 40 歲 ⇒ ${ret.intentChanceOf(mk({ id: "im", age: 40 }), { appearanceRatio: 1 }).toFixed(3)}` : "");

ck("I6) `evaluateIntents` 是**決定性**的（同一年跑兩次結果相同）",
  !!ret && (() => {
    const s = stateOf(squad(8, { age: 36 }));
    const a = ret.evaluateIntents(s, { careerYear: 5 });
    const b = ret.evaluateIntents(s, { careerYear: 5 });
    return JSON.stringify(a.declared) === JSON.stringify(b.declared);
  })());

ck("I7) 已宣布過的人**不會重複宣布**",
  !!ret && (() => {
    const s = stateOf(squad(8, { age: 38 }));
    const a = ret.evaluateIntents(s, { careerYear: 5 });
    const b = ret.evaluateIntents(a.state, { careerYear: 6 });
    return b.declared.every((id) => !a.declared.includes(id));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §R 退休與延役
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 退休與延役】");

ck("R1) **沒有宣布過意向的人，永遠不會退休**（紅線）",
  !!ret && (() => {
    const s = stateOf(squad(10, { age: 44 }));   // 全隊超齡，但沒有人宣布過
    for (let y = 1; y <= 20; y++) {
      const r = ret.resolveRetirements(s, { careerYear: y });
      if (r.retired.length > 0) return false;
    }
    return true;
  })());

ck("R2) **同一年宣布、同一年退休** 也不允許（一定要隔一個年度）",
  !!ret && (() => {
    const s = stateOf(squad(8, { age: 40 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    const r = ret.resolveRetirements(e.state, { careerYear: 5 });
    return r.retired.length === 0;
  })(),
  !!ret ? `同年宣布 ${ret.evaluateIntents(stateOf(squad(8, { age: 40 })), { careerYear: 5 }).declared.length} 人，同年退休 0 人` : "");

ck("R3) 隔一個年度後，宣布過的人**會**退休（預告真的會兌現）",
  !!ret && (() => {
    const s = stateOf(squad(8, { age: 40 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    if (!e.declared.length) return false;
    const r = ret.resolveRetirements(e.state, { careerYear: 6 });
    return r.retired.length > 0;
  })());

ck("R4) **延役**：部分宣布過的人會撤回意向而不是退休",
  !!ret && (() => {
    let withdrew = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = stateOf(squad(6, { age: 39 }).map((p, i) => ({ ...p, id: `w${seed}-${i}` })));
      const e = ret.evaluateIntents(s, { careerYear: 5 });
      const r = ret.resolveRetirements(e.state, { careerYear: 6 });
      withdrew += r.withdrew.length;
    }
    return withdrew > 0;
  })());

ck("R5) 撤回意向的人**沒有被移除**，且意向真的清掉了",
  !!ret && (() => {
    for (let seed = 0; seed < 60; seed++) {
      const s = stateOf(squad(6, { age: 39 }).map((p, i) => ({ ...p, id: `x${seed}-${i}` })));
      const e = ret.evaluateIntents(s, { careerYear: 5 });
      const r = ret.resolveRetirements(e.state, { careerYear: 6 });
      if (!r.withdrew.length) continue;
      const id = r.withdrew[0];
      const p = r.state.players.find((q) => q.id === id);
      return !!p && !p.retirement?.intentYear;
    }
    return false;
  })());

ck("R6) **每年退休人數有上限**（不會一年掉半隊）",
  !!ret && (() => {
    const s = stateOf(squad(12, { age: 42 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    const r = ret.resolveRetirements(e.state, { careerYear: 6 });
    return r.retired.length <= ret.RETIREMENT.maxRetirementsPerYear;
  })(),
  !!ret ? `上限 ${ret.RETIREMENT.maxRetirementsPerYear} 人／年` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §F 名單地板與青訓補位
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 名單地板】");

ck("F1) **退休不因人數不足被取消**（紅線：剛好 5 人時仍然會走）",
  !!ret && (() => {
    const s = stateOf(squad(5, { age: 41 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    const r = ret.resolveRetirements(e.state, { careerYear: 6 });
    return r.retired.length > 0;
  })(),
  !!ret ? `5 人隊仍退休 ${ret.resolveRetirements(ret.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 }).state, { careerYear: 6 }).retired.length} 人` : "");

ck("F2) 退休後低於地板 ⇒ **青訓補位**把人數補回地板",
  !!ret && (() => {
    const s = stateOf(squad(5, { age: 41 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    const r = ret.resolveRetirements(e.state, { careerYear: 6 });
    return r.state.players.length >= ret.RETIREMENT.rosterFloor;
  })(),
  !!ret ? (() => {
    const r = ret.resolveRetirements(ret.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 }).state, { careerYear: 6 });
    return `退休 ${r.retired.length}｜補位 ${r.promoted.length}｜最終 ${r.state.players.length} 人`;
  })() : "");

ck("F3) 青訓補位是**免費**的（沒有花費欄位，破產也補得到）",
  !!ret && !/funds|cost|現金|扣款/.test(codeOnly(read(P_RET))));

ck("F4) 青訓補位**明顯較弱**（綜合能力低於一般新秀水準）",
  !!ret && (() => {
    const r = ret.resolveRetirements(ret.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 }).state, { careerYear: 6 });
    if (!r.promoted.length) return false;
    const rookie = r.state.players.find((p) => r.promoted.includes(p.id));
    const ov = Object.values(rookie.stats).reduce((s, v) => s + v, 0) / 16;
    return ov < 55;
  })(),
  !!ret ? (() => {
    const r = ret.resolveRetirements(ret.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 }).state, { careerYear: 6 });
    const p = r.promoted.length ? r.state.players.find((q) => r.promoted.includes(q.id)) : null;
    return p ? `青訓綜合 ${(Object.values(p.stats).reduce((s, v) => s + v, 0) / 16).toFixed(1)}｜${p.age} 歲` : "";
  })() : "");

ck("F5) 青訓補位是**年輕人**（不是又一個老將）",
  !!ret && (() => {
    const r = ret.resolveRetirements(ret.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 }).state, { careerYear: 6 });
    if (!r.promoted.length) return false;
    return r.state.players.filter((p) => r.promoted.includes(p.id)).every((p) => p.age <= 20);
  })());

ck("F6) 人數充足時**不會**亂補人",
  !!ret && (() => {
    const s = stateOf(squad(12, { age: 41 }));
    const e = ret.evaluateIntents(s, { careerYear: 5 });
    const r = ret.resolveRetirements(e.state, { careerYear: 6 });
    return r.promoted.length === 0;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §S 15 年 soft-lock 實跑
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 15 年 soft-lock 實跑】");

ck("S1) **15 年逐年推進，任何一年都不得低於名單地板**",
  !!ret && (() => {
    let s = stateOf(squad(5, { age: 26 }));
    for (let y = 1; y <= 15; y++) {
      s = { ...s, players: s.players.map((p) => drift.applyAgeDrift({ ...p, age: p.age + 1 })) };
      const e = ret.evaluateIntents(s, { careerYear: y });
      const r = ret.resolveRetirements(e.state, { careerYear: y });
      s = r.state;
      if (s.players.length < ret.RETIREMENT.rosterFloor) return false;
    }
    return true;
  })());

ck("S2) 15 年裡**真的有人退休**（保護沒有把退休擋掉）",
  !!ret && (() => {
    let s = stateOf(squad(5, { age: 26 }));
    let total = 0;
    for (let y = 1; y <= 15; y++) {
      s = { ...s, players: s.players.map((p) => drift.applyAgeDrift({ ...p, age: p.age + 1 })) };
      const e = ret.evaluateIntents(s, { careerYear: y });
      const r = ret.resolveRetirements(e.state, { careerYear: y });
      s = r.state; total += r.retired.length;
    }
    return total > 0;
  })(),
  !!ret ? (() => {
    let s = stateOf(squad(5, { age: 26 })); let t = 0, pr = 0;
    for (let y = 1; y <= 15; y++) {
      s = { ...s, players: s.players.map((p) => drift.applyAgeDrift({ ...p, age: p.age + 1 })) };
      const e = ret.evaluateIntents(s, { careerYear: y });
      const r = ret.resolveRetirements(e.state, { careerYear: y });
      s = r.state; t += r.retired.length; pr += r.promoted.length;
    }
    return `15 年退休 ${t} 人｜青訓補位 ${pr} 人｜最終 ${s.players.length} 人`;
  })() : "");

ck("S3) 15 年後**世代真的換過**（不是原班人馬）",
  !!ret && (() => {
    let s = stateOf(squad(5, { age: 26 }));
    const orig = new Set(s.players.map((p) => p.id));
    for (let y = 1; y <= 15; y++) {
      s = { ...s, players: s.players.map((p) => drift.applyAgeDrift({ ...p, age: p.age + 1 })) };
      const e = ret.evaluateIntents(s, { careerYear: y });
      s = ret.resolveRetirements(e.state, { careerYear: y }).state;
    }
    return s.players.some((p) => !orig.has(p.id));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §D 決定性與冪等
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§D 決定性／冪等】");

ck("D1) `resolveRetirements` 同一年跑兩次**不會退休兩批**",
  !!ret && (() => {
    const e = ret.evaluateIntents(stateOf(squad(8, { age: 41 })), { careerYear: 5 });
    const r1 = ret.resolveRetirements(e.state, { careerYear: 6 });
    const r2 = ret.resolveRetirements(r1.state, { careerYear: 6 });
    return r2.retired.length === 0;
  })());

ck("D2) 缺年齡的舊存檔**不會被退休**（不編造年齡）",
  !!ret && (() => {
    const s = stateOf([{ id: "noage", stats: {}, potential: 80 }, ...squad(5, { age: 24 })]);
    const e = ret.evaluateIntents(s, { careerYear: 9 });
    return !e.declared.includes("noage");
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §E Store 端到端
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E Store 端到端】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const store = await imp(P_STORE);
const S = () => store.useProfileStore.getState();

ck("E1) Store 有 `retirementView()` 給畫面讀",
  typeof S().retirementView === "function",
  (() => { try { return JSON.stringify(S().retirementView()); } catch { return ""; } })());

ck("E2) Off-season 契約已把離隊兩步列為已實作",
  await (async () => {
    const off = await imp(P_OFF);
    return off.IMPLEMENTED_STEPS.includes("departureIntent") && off.IMPLEMENTED_STEPS.includes("departureResolve");
  })());

ck("E3) 退休在 Store 裡只有**一個**觸發點（`advanceDay` 的年度邊界）",
  (codeOnly(read(P_STORE)).match(/resolveRetirements\(/g) ?? []).length === 1,
  `${(codeOnly(read(P_STORE)).match(/resolveRetirements\(/g) ?? []).length} 次`);

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

const retSrc = ret ? codeOnly(read(P_RET)) : "";
ck("N1) 沒有做合約／續約／談判", !!ret && !/contract|negotiat|續約|談判/i.test(retSrc));
ck("N2) 沒有做轉會市場", !!ret && !/transfer|market|轉會/i.test(retSrc));
ck("N3) 沒有動 CS AI", !!ret && !/csAiTeams|CS_AI_TEAMS/.test(retSrc));
//  ⚠ 上限 115 而不是 90：這支模組帶四個責任（意向機率、意向評估、青訓補位、
//    退休結算），四個都在同一個年度邊界上發生、共用同一組常數與決定性抽籤。
//    拆開會讓「同一個邊界的一段序列」散成四個檔，反而更難驗。
ck("N4) 模組很小", !!ret && retSrc.split("\n").length <= 115,
  !!ret ? `${retSrc.split("\n").length} 行實碼` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §M sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v53-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (ret) {
    //  A：讓沒有宣布過的人也能退休 ⇒ §R1 變紅
    const A = await mutated(P_RET, (s) => s.replace(/const declaredYear = Number\(p\?\.retirement\?\.intentYear\);/, "const declaredYear = 1;"), "A-nointent");
    ck("M-A) 讓沒宣布過的人也能退休 ⇒ §R1 變紅",
      (() => {
        const s = stateOf(squad(10, { age: 44 }));
        return A.resolveRetirements(s, { careerYear: 9 }).retired.length > 0;
      })());

    //  B：把出賽率修正放大 ⇒ §I5 變紅（全勤就免疫）
    const B = await mutated(P_RET, (s) => s.replace(/appearanceModifier:\s*[\d.]+/, "appearanceModifier: 9"), "B-immune");
    ck("M-B) 放大出賽率修正 ⇒ §I5 變紅（刷出賽就免疫）",
      B.intentChanceOf(mk({ id: "im", age: 40 }), { appearanceRatio: 1 }) <= 0);

    //  C：拿掉青訓補位 ⇒ §F2 變紅（人數會低於地板）
    const C = await mutated(P_RET, (s) => s.replace(/rosterFloor:\s*\d+/, "rosterFloor: 0"), "C-nofloor");
    ck("M-C) 把名單地板設成 0 ⇒ §F2 變紅（不再補位）",
      (() => {
        const e = C.evaluateIntents(stateOf(squad(5, { age: 41 })), { careerYear: 5 });
        const r = C.resolveRetirements(e.state, { careerYear: 6 });
        return r.promoted.length === 0 && r.state.players.length < 5;
      })());
  } else {
    for (const t of ["M-A", "M-B", "M-C"]) ck(`${t}) sentinel`, false, "模組不存在");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

function RETIRE_MOD(m) { return m?.RETIREMENT?.appearanceModifier ?? 0; }

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_retirement_v5：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   沒有宣布過意向的人永遠不會退休；預告至少一整個生涯年度。");
  console.log("   出賽率只是小幅修正——全勤也擋不住年齡，機率仍隨年齡上升。");
  console.log("   退休照常發生；低於名單地板時由**免費但明顯較弱**的青訓補位頂上 ⇒ 不會卡死。");
  console.log("   ⚠ 本輪不做：合約／續約／談判／轉會市場／CS AI。");
}
process.exit(fail === 0 ? 0 : 1);
