#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/measure_s2_opportunity_v24.mjs — S2-B「有效入侵機會」獨立判定器（影子量測；v24 Sprint 1.3，2026-11-19）
//
//  【狀態】契約草案的量測工具，未經 Owner 核准前不取代任何正式判準；舊 S2 維持 FAIL。不改引擎、不影響決策（只讀 tick 之後的狀態）。
//  【獨立性】判定器不呼叫 tacticExecV24 的任何函式，也不讀它的經濟、信念或威脅估計；用的是真實狀態（量測專用，決策層看不到）與下面固定的門檻。
//  【一次機會】每 5 秒檢查一次；對某一邊 S 與某座敵方營地 c，下面 O1～O6 全部成立就記一個檢查點，同一座營地相隔 ≤ 10 秒的檢查點合併成一段機會：
//    O1 營地活著：c 現在活著，而且到場時（現在＋到場秒數）實際還活著，或是被 S 自己清掉
//    O2 打野能出發：S 的打野活著、血量 ≥ 60%、沒有回城、12 單位內沒有敵方英雄、沒有正在入侵
//    O3 到得了：直線距離 × 1.17 ÷ 移速 ≤ 25 秒
//    O4 沒人攔得到（用真實位置）：沒有任何存活敵方英雄能在「到場秒數＋清營秒數」內抵達營地 14 單位內
//    O5 沒有物件衝突：S 這一隊目前不在打龍／巴龍的團隊窗內
//    O6 值得：營地金錢 ÷（到場秒數＋清營秒數）≥ 3 金／秒（Buff 90 金、一般營 60 金；清營 12／8 秒）
//  【分母不因沒出發而縮小】沒出發的邊×場只要有機會段，就算進分母（判定為錯失）；整場沒有任何機會段的邊×場另外報告比例，不會被藏起來。
//  用法：node tools/owner_preview/measure_s2_opportunity_v24.mjs --seeds=120001,120003 --arms=s11,s12 --out=<repo 外 json> [--cfg=inv]
//        arms：s11＝adaptive.v1.1、s12＝adaptive.v1.2、s13＝規則集預設（工具路徑）；--path=career 時藍方為入侵戰術，素質用 --tier=low|mid|high
// ============================================================================
import fs from "node:fs";
const P = await import("./pin_v20_v23_stream.mjs");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEEDS = arg("seeds", "").split(",").filter(Boolean).map(Number), ARMS = arg("arms", "s12").split(","), OUT = arg("out", null), CFG = arg("cfg", "inv"), PATH = arg("path", "tool"), TIER = arg("tier", "mid");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const O = Object.freeze({ everySec: 5, mergeGap: 10, hpMin: 0.6, foeNear: 12, etaMax: 25, detour: 1.17, reachR: 14, rateMin: 3, value: { buff: 90, camp: 60 }, clear: { buff: 12, camp: 8 } });
const VARIANT = { s11: "adaptive.v1.1", s12: "adaptive.v1.2" };
function build(seed, arm) {
  if (PATH === "career") {
    const e = P.build("career.v24", "v2.jungle_invasion", null, seed, TIER);
    if (arm === "s12") { e._tacExecVariant = "adaptive.v1.2"; e.tacExec.v13 = false; }
    if (arm === "s11") { e._tacExecVariant = "adaptive.v1.1"; e.tacExec.v13 = false; e.tacExec.v12 = false; }
    return e;
  }
  const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] }[CFG];
  if (VARIANT[arm]) process.env.ESMO_BALANCE_TACTICEXEC = VARIANT[arm];
  try { return P.build("balanceTool.v24", T[0], T[1], seed, null); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
}
function runOne(seed, arm) {
  const e = build(seed, arm), speed = Math.max(1e-6, e.rules.moveSpeed ?? 5.6), pending = [], points = { blue: [], red: [] };
  let next = O.everySec;
  while (!e.over && e.t < 3000) {
    e.tick(0.5);
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i];
      if (e.t < c.resolveAt) continue;
      const camp = e.neutrals.camps.find((x) => x.id === c.camp);
      if (camp.alive || camp.killerTeam === c.side) points[c.side].push(c);   // O1 的後半：到場時還活著，或被自己清掉
      pending.splice(i, 1);
    }
    if (e.t < next) continue;
    next += O.everySec;
    const alive = e.players.filter((p) => !p.dead);
    for (const S of ["blue", "red"]) {
      const J = alive.find((p) => p.side === S && p.role === "jungle");
      if (!J || J.hp / J.maxHp < O.hpMin || (J.recallT ?? 0) > 0 || J._invV2 && !J._invV2.done) continue;                  // O2
      if (alive.some((q) => q.side !== S && dist(q.pos, J.pos) <= O.foeNear)) continue;                                      // O2
      if (e.fsm3?.[S]?.objGo) continue;                                                                                     // O5
      for (const c of e.neutrals.camps) {
        if (c.side === S || !c.alive) continue;                                                                             // O1
        const type = c.type === "buff" ? "buff" : "camp", eta = dist(J.pos, c.pos) * O.detour / speed, clear = O.clear[type];
        if (eta > O.etaMax || O.value[type] / (eta + clear) < O.rateMin) continue;                                          // O3、O6
        if (alive.some((q) => q.side !== S && Math.max(0, dist(q.pos, c.pos) - O.reachR) * O.detour / speed <= eta + clear)) continue;  // O4
        pending.push({ t: e.t, side: S, camp: c.id, type, resolveAt: e.t + eta });
      }
    }
  }
  const go = (e.tacExec?.log ?? []).filter((r) => r.kind === "invade" && r.d === "go").map((r) => ({ t: r.t, side: r.side, target: r.target }));
  const out = {};
  for (const S of ["blue", "red"]) {
    const eps = [], byCamp = new Map();
    for (const p of points[S].sort((a, b) => a.t - b.t)) { const cur = byCamp.get(p.camp); if (cur && p.t - cur.end <= O.mergeGap) cur.end = p.t; else { const ep = { camp: p.camp, type: p.type, start: p.t, end: p.t }; byCamp.set(p.camp, ep); eps.push(ep); } }
    const mine = go.filter((g) => g.side === S);
    const takenAny = eps.filter((ep) => mine.some((g) => g.t >= ep.start - 5 && g.t <= ep.end + 10)).length;
    const takenSame = eps.filter((ep) => mine.some((g) => g.target === ep.camp && g.t >= ep.start - 5 && g.t <= ep.end + 10)).length;
    const goInOpp = mine.filter((g) => eps.some((ep) => g.target === ep.camp && g.t >= ep.start - 5 && g.t <= ep.end + 10)).length;
    out[S] = { episodes: eps.length, buffEpisodes: eps.filter((x) => x.type === "buff").length, takenAny, takenSame, starts: mine.length, startsInOpportunity: goInOpp };
  }
  return { seed, arm, path: PATH, cfg: PATH === "career" ? TIER : CFG, duration: e.t, over: e.over, sides: out };
}
const rows = [];
for (const seed of SEEDS) for (const arm of ARMS) { rows.push(runOne(seed, arm)); }
const sum = (arm) => {
  const s = rows.filter((r) => r.arm === arm).flatMap((r) => [r.sides.blue, r.sides.red]), t = (k) => s.reduce((a, x) => a + x[k], 0);
  return { sides: s.length, oppPerSide: +(t("episodes") / s.length).toFixed(2), sidesWithoutOpp: +(s.filter((x) => x.episodes === 0).length / s.length).toFixed(3), utilisationAnyTarget: +(t("takenAny") / Math.max(1, t("episodes"))).toFixed(3), utilisationSameTarget: +(t("takenSame") / Math.max(1, t("episodes"))).toFixed(3), startsPerSide: +(t("starts") / s.length).toFixed(2), precision: +(t("startsInOpportunity") / Math.max(1, t("starts"))).toFixed(3) };
};
const summary = Object.fromEntries(ARMS.map((a) => [a, sum(a)]));
console.log(JSON.stringify(summary, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "measure_s2_opportunity_v24", params: O, seeds: SEEDS, arms: ARMS, path: PATH, cfg: CFG, summary, rows }, null, 1));
