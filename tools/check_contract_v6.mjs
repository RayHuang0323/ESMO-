#!/usr/bin/env node
// ============================================================================
//  tools/check_contract_v6.mjs — V6-2：合約生命週期
//
//  執行：repo 根目錄 `node tools/check_contract_v6.mjs`；失敗 exit 1。
//
//  ── 紅線 ──────────────────────────────────────────────────────────────────
//  · `players[].contract` 真的隨 Career Time 倒數（快轉與逐日一致）
//  · 到期前要有預告
//  · **不得突然讓選手消失**
//  · 退休與合約到期要有**明確優先順序**
//  · 防止 roster < 5 soft-lock
//  · 不做複雜談判 AI
//
//  ── 本輪的關鍵裁決：到期只在年度邊界生效 ─────────────────────────────────
//  合約**每天倒數**（玩家看得到、看得到預告），但**到期只在生涯年度邊界結算**。
//  理由：日中生效等於「選手在某個星期三突然不見」，正是紅線要擋的事；
//  而且退休本來就只在年度邊界發生，兩件事放同一個點才能定義先後。
//  ⇒ **優先順序：退休先於合約到期。** 已經退役的人不會再「因為合約到期離隊」。
//
//  §C 契約　§T 倒數　§W 預告　§X 到期　§P 優先順序　§R 續約
//  §F 名單地板　§S 15 年長跑　§N 邊界　§M sentinel
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

const P_C = "src/platform/progress/contract.js";
const P_STORE = "src/platform/profileStore.js";
const c = await soft(P_C);
const model = await imp("src/data/playerModel.js");

const mk = ({ id = "p", age = 24, contract = 365, at = 70 } = {}) => ({
  id, name: id, role: "中路", age, potential: 88, lv: 40, energy: 100, contract,
  stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, at])),
});
const squad = (n, o = {}) => Array.from({ length: n }, (_, i) => mk({ id: `s${i}`, ...o }));
const st = (players) => ({ meta: { days: 100 }, players });

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 契約】");

ck("C1) 有獨立的合約純模組 `progress/contract.js`", !!c, c ? "" : "模組不存在");
ck("C2) 純模組", !!c && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_C))));
ck("C3) 有版本字串與 frozen 常數",
  !!c && typeof c.CONTRACT_VERSION === "string" && Object.isFrozen(c.CONTRACT));
ck("C4) 入口齊全：`tickContracts` / `resolveContractExpiries` / `renewContract` / `contractStatusOf`",
  !!c && ["tickContracts", "resolveContractExpiries", "renewContract", "contractStatusOf"].every((f) => typeof c[f] === "function"));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§T 倒數】");

ck("T1) 推進 N 天 ⇒ 合約剩餘 −N",
  !!c && c.tickContracts(st(squad(3, { contract: 300 })), { days: 40 }).state.players[0].contract === 260);

ck("T2) **快轉與逐日一致**（一次 40 天 = 逐日 40 次）",
  !!c && (() => {
    const jump = c.tickContracts(st(squad(3, { contract: 300 })), { days: 40 }).state;
    let cur = st(squad(3, { contract: 300 }));
    for (let i = 0; i < 40; i++) cur = c.tickContracts(cur, { days: 1 }).state;
    return JSON.stringify(cur.players.map((p) => p.contract)) === JSON.stringify(jump.players.map((p) => p.contract));
  })());

ck("T3) **不會變成負數**（到 0 就停）",
  !!c && c.tickContracts(st(squad(2, { contract: 10 })), { days: 500 }).state.players[0].contract === 0);

ck("T4) 舊存檔沒有 `contract` 欄位 ⇒ **不炸、也不憑空給一份合約**",
  !!c && (() => {
    const s = { meta: { days: 1 }, players: [{ id: "old", age: 25, stats: {} }] };
    const r = c.tickContracts(s, { days: 30 });
    return r.state.players[0].contract === undefined;
  })());

ck("T5) 0 天推進 ⇒ 回傳同一個 state 參考",
  !!c && (() => { const s = st(squad(2)); return c.tickContracts(s, { days: 0 }).state === s; })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§W 預告】");

ck("W1) 狀態分級：`active` / `expiring` / `expired`",
  !!c && c.contractStatusOf(mk({ contract: 300 })) === "active"
  && c.contractStatusOf(mk({ contract: 10 })) === "expiring"
  && c.contractStatusOf(mk({ contract: 0 })) === "expired");

ck("W2) 預告窗口**至少一個生涯年度**（玩家有整整一年可以決定）",
  !!c && c.CONTRACT.warnWithinDays >= 84,
  !!c ? `${c.CONTRACT.warnWithinDays} 天` : "");

ck("W3) 沒有合約欄位的舊選手 ⇒ `none`（不謊報即將到期）",
  !!c && c.contractStatusOf({ id: "x" }) === "none");

ck("W4) `contractViewOf` 列得出即將到期的人",
  !!c && typeof c.contractViewOf === "function"
  && c.contractViewOf(st([mk({ id: "a", contract: 20 }), mk({ id: "b", contract: 300 })])).expiring.length === 1);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§X 到期：不得突然消失】");

ck("X1) **合約歸零不會當場移除選手**（倒數本身不動名單）",
  !!c && c.tickContracts(st(squad(6, { contract: 5 })), { days: 100 }).state.players.length === 6);

ck("X2) 到期**只在年度邊界結算**（`resolveContractExpiries` 才會讓人離隊）",
  !!c && (() => {
    const ticked = c.tickContracts(st(squad(8, { contract: 5 })), { days: 100 }).state;
    return c.resolveContractExpiries(ticked, { careerYear: 3 }).departed.length > 0;
  })());

ck("X3) 合約還有效的人**不會**被結算掉",
  !!c && c.resolveContractExpiries(st(squad(8, { contract: 300 })), { careerYear: 3 }).departed.length === 0);

ck("X4) 同一年重跑 ⇒ **不會離隊兩批**（冪等）",
  !!c && (() => {
    const ticked = c.tickContracts(st(squad(8, { contract: 5 })), { days: 100 }).state;
    const r1 = c.resolveContractExpiries(ticked, { careerYear: 3 });
    return c.resolveContractExpiries(r1.state, { careerYear: 3 }).departed.length === 0;
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 退休 vs 合約：優先順序明確】");

ck("P1) 已宣布退休意向的人**不得被續約**（他要離開這個運動，不只是這支隊）",
  !!c && (() => {
    const s = st([{ ...mk({ id: "r", contract: 10 }), retirement: { intentYear: 2 } }, ...squad(5)]);
    const r = c.renewContract(s, "r", { careerYear: 3 });
    return r.ok === false;
  })(),
  !!c ? JSON.stringify(c.renewContract(st([{ ...mk({ id: "r", contract: 10 }), retirement: { intentYear: 2 } }]), "r", { careerYear: 3 }).reason ?? null) : "");

ck("P2) **退休先於合約到期**：Store 裡退休的呼叫在合約結算之前",
  (() => {
    const src = codeOnly(read(P_STORE));
    const iR = src.indexOf("resolveRetirements(");
    const iC = src.indexOf("resolveContractExpiries(");
    return iR > 0 && iC > 0 && iR < iC;
  })());

ck("P3) 已經退役的人不會再被合約結算一次（他已經不在名單裡）",
  !!c && (() => {
    const s = st(squad(6, { contract: 0 }));
    const r1 = c.resolveContractExpiries(s, { careerYear: 3 });
    return r1.departed.every((id) => !r1.state.players.some((p) => p.id === id));
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 續約】");

ck("R1) 續約會延長合約",
  !!c && (() => {
    const s = st([mk({ id: "a", contract: 10 }), ...squad(5)]);
    const r = c.renewContract(s, "a", { careerYear: 3 });
    return r.ok && r.state.players.find((p) => p.id === "a").contract > 10;
  })(),
  !!c ? `續約後 ${c.renewContract(st([mk({ id: "a", contract: 10 })]), "a", { careerYear: 3 }).state?.players?.[0]?.contract} 天` : "");

ck("R2) 續約**有成本**，且與 V4 市場價值接軌",
  !!c && typeof c.renewCostOf === "function"
  && c.renewCostOf(mk({ id: "a", age: 22 })) > c.renewCostOf(mk({ id: "a", age: 36 })),
  !!c ? `22 歲 ${c.renewCostOf(mk({ id: "a", age: 22 }))}｜36 歲 ${c.renewCostOf(mk({ id: "a", age: 36 }))}` : "");

ck("R3) 找不到人 ⇒ 據實回 `ok:false`，不悄悄成功",
  !!c && c.renewContract(st(squad(3)), "nobody", { careerYear: 3 }).ok === false);

ck("R4) **沒有談判 AI**（模組裡沒有出價／還價／議價的痕跡）",
  !!c && !/negotiat|counterOffer|bargain|議價|還價/i.test(codeOnly(read(P_C))));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 名單地板】");

ck("F1) 到期離隊後低於地板 ⇒ **補位把人數補回地板**",
  !!c && (() => {
    const ticked = c.tickContracts(st(squad(5, { contract: 5 })), { days: 100 }).state;
    const r = c.resolveContractExpiries(ticked, { careerYear: 3 });
    return r.state.players.length >= c.CONTRACT.rosterFloor;
  })(),
  !!c ? (() => {
    const t = c.tickContracts(st(squad(5, { contract: 5 })), { days: 100 }).state;
    const r = c.resolveContractExpiries(t, { careerYear: 3 });
    return `離隊 ${r.departed.length}｜補位 ${r.promoted.length}｜最終 ${r.state.players.length} 人`;
  })() : "");

ck("F2) 補位**免費**（模組裡沒有花費欄位）",
  !!c && !/funds|扣款/.test(codeOnly(read(P_C))));

//  ⚠ 這裡要造的是「有人到期、但剩下的人仍然夠」——
//    整隊 12 人合約全部到期的話，走完之後當然缺人，那不是「人數充足」。
ck("F3) 有人到期但剩下的人仍然夠 ⇒ **不補人**",
  !!c && (() => {
    const roster = [...squad(2, { contract: 5 }), ...squad(10, { contract: 900 }).map((p, i) => ({ ...p, id: `L${i}` }))];
    const t = c.tickContracts(st(roster), { days: 100 }).state;
    const r = c.resolveContractExpiries(t, { careerYear: 3 });
    return r.departed.length === 2 && r.promoted.length === 0 && r.state.players.length === 10;
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 15 年長跑】");

ck("S1) 15 年逐年推進，**任何一年都不得低於地板**",
  !!c && (() => {
    let s = st(squad(5, { contract: 400 }));
    for (let y = 1; y <= 15; y++) {
      s = c.tickContracts(s, { days: 84 }).state;
      s = c.resolveContractExpiries(s, { careerYear: y }).state;
      if (s.players.length < c.CONTRACT.rosterFloor) return false;
    }
    return true;
  })());

ck("S2) 15 年裡**真的有人因為合約到期離隊**（保護沒有把到期擋掉）",
  !!c && (() => {
    let s = st(squad(5, { contract: 400 })); let t = 0;
    for (let y = 1; y <= 15; y++) {
      s = c.tickContracts(s, { days: 84 }).state;
      const r = c.resolveContractExpiries(s, { careerYear: y });
      s = r.state; t += r.departed.length;
    }
    return t > 0;
  })(),
  !!c ? (() => {
    let s = st(squad(5, { contract: 400 })); let t = 0, pr = 0;
    for (let y = 1; y <= 15; y++) {
      s = c.tickContracts(s, { days: 84 }).state;
      const r = c.resolveContractExpiries(s, { careerYear: y });
      s = r.state; t += r.departed.length; pr += r.promoted.length;
    }
    return `15 年到期離隊 ${t} 人｜補位 ${pr} 人｜最終 ${s.players.length} 人`;
  })() : "");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E Store 接線】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const store = await imp(P_STORE);
const S = () => store.useProfileStore.getState();

ck("E1) Store 有 `contractView()` 與 `renewPlayerContract()`",
  typeof S().contractView === "function" && typeof S().renewPlayerContract === "function");

ck("E2) 推進世界時間會讓合約真的倒數",
  (() => {
    const before = (S().players ?? []).map((p) => p.contract);
    S().advanceWorldDays(10, { reason: "rest" });
    const after = (S().players ?? []).map((p) => p.contract);
    return before.length > 0 && after.every((v, i) => Number(v) <= Number(before[i]));
  })(),
  `${(S().players ?? []).map((p) => p.contract).join(",")}`);

ck("E3) `tickContracts` 在 Store 裡只有**一個**呼叫點",
  (codeOnly(read(P_STORE)).match(/tickContracts\(/g) ?? []).length === 1);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 邊界】");
const cSrc = c ? codeOnly(read(P_C)) : "";
ck("N1) 沒有做轉會市場（V6-3）", !!c && !/transferMarket|買入|賣出/i.test(cSrc));
ck("N2) 沒有動 Training / PCGM", !!c && !/trainingCalculator|careerGrowth/.test(cSrc));
//  ⚠ 禁的是「改**既有選手**的能力」。生成補位新人時當然要寫他自己的 stats，
//    用「檔案裡不准出現 stats[...] =」會把那個也一起擋掉（同 V5-1 §N2 的教訓）。
ck("N3) **不改既有選手的能力**（能力只有在生成新人時被寫入）",
  !!c && (() => {
    const before = squad(4, { contract: 5 });
    const snap = JSON.stringify(before.map((p) => p.stats));
    const t = c.tickContracts(st(before), { days: 100 }).state;
    const r = c.resolveContractExpiries(t, { careerYear: 3 });
    const survivors = r.state.players.filter((p) => !p.fromAcademy);
    return JSON.stringify(t.players.map((p) => p.stats)) === snap
      && survivors.every((p) => before.some((b) => b.id === p.id && JSON.stringify(b.stats) === JSON.stringify(p.stats)));
  })());
ck("N4) 模組很小", !!c && cSrc.split("\n").length <= 95, !!c ? `${cSrc.split("\n").length} 行實碼` : "");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v62-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (c) {
    //  A：讓倒數順手把人移除 ⇒ §X1 變紅（選手會在星期三突然消失）
    const A = await mutated(P_C, (s) => s.replace(/return \{ state: \{ \.\.\.state, players \}, ticked: true \};/,
      "return { state: { ...state, players: players.filter((p) => Number(p.contract) !== 0) }, ticked: true };"), "A-vanish");
    ck("M-A) 讓倒數順手移除到期選手 ⇒ §X1 變紅",
      A.tickContracts(st(squad(6, { contract: 5 })), { days: 100 }).state.players.length !== 6);

    //  B：把地板設成 0 ⇒ §F1 變紅
    const B = await mutated(P_C, (s) => s.replace(/rosterFloor:\s*\d+/, "rosterFloor: 0"), "B-nofloor");
    ck("M-B) 把名單地板設成 0 ⇒ §F1 變紅",
      (() => {
        const t = B.tickContracts(st(squad(5, { contract: 5 })), { days: 100 }).state;
        return B.resolveContractExpiries(t, { careerYear: 3 }).state.players.length < 5;
      })());
  } else {
    ck("M-A) 讓倒數順手移除到期選手 ⇒ §X1 變紅", false, "模組不存在");
    ck("M-B) 把名單地板設成 0 ⇒ §F1 變紅", false, "模組不存在");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_contract_v6：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   合約每天倒數、到期只在年度邊界結算 ⇒ 選手不會在星期三突然消失。");
  console.log("   退休先於合約到期；宣布退役的人不得續約；名單地板由免費補位守住。");
  console.log("   ⚠ 本輪不做：轉會市場（V6-3）、談判 AI。");
}
process.exit(fail === 0 ? 0 : 1);
