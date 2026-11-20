#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_escort_mirror.mjs — Sprint 2 Preflight B：終局護線的紅藍鏡射測試（決定性；只讀；2026-11-20）
//
//  只在「已用過」的壓力 Seeds（140001 起，本輪兩臂都有注入的組）上重跑 v1.3 的人工終局；不是驗證，不產生 PASS／FAIL。
//  ① 地圖幾何：路線、塔、主堡、營地、物件坑在 180° 旋轉（x→W−x、y→W−y）＋上下路互換之下是否重合（數值最大誤差）
//  ② 真實狀態鏡射：注入後每個 tick，用目前的真實狀態做一個鏡像視圖（紅藍、上下路、塔、兵線 t→1−t 對調），比對：
//     a. 主堡是否暴露（frontStructure）  b. 主堡有沒有己方兵線（_hasWaveAtStructure）
//     c. 護線計時（endgameTick13：同一串狀態分別餵給原圖與鏡像圖的影子計時器）
//     d. 選路（endgameEscortLane，每個 tick 重新選）  e. 護送站位點（_laneWaveHoldT，每名英雄 × 每條已暴露的路）
//  ③ 行為計數：護送中的英雄 tick 數、選到的路，紅藍分開
//  所有比對都在 e.tick() 之後讀狀態；不寫入引擎。整場結果與本輪已記錄的壓力列（勝方、結束時間）逐值相同才代表沒有擾動。
//  用法：node tools/owner_preview/diag_te24_s15_escort_mirror.mjs --stress=<140001 stress 資料夾> --per=15 --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const P = await imp("tools/owner_preview/pin_v20_v23_stream.mjs");
const TE = await imp("src/battle/moba/tactics/tacticExecV24.js");
const G = await imp("src/gameData.js");
const { LogicEngine } = await imp("src/LogicEngine.js");
const STRESS = arg("stress"), PER = Number(arg("per", "15")), OUT = arg("out");
const W = G.WORLD_SIZE, INJECT = [840, 960, 1080, 1200], CAP = 3000;
const rot = (p) => ({ x: W - p.x, y: W - p.y });
const sw = (s) => (s === "blue" ? "red" : s === "red" ? "blue" : s);
const swLane = (l) => (l === "top" ? "bot" : l === "bot" ? "top" : l);
const swId = (id) => (/^b\d$/.test(id) ? "r" + id.slice(1) : /^r\d$/.test(id) ? "b" + id.slice(1) : id);
const swTowerKey = (k) => k.replace(/^(blue|red)_(top|mid|bot|nexus)/, (_, s, l) => `${sw(s)}_${swLane(l)}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const J = { note: "deterministic mirror test on used stress seeds (140001 round); read-only", geometry: {} };

// ① 地圖幾何
{
  let laneErr = 0;
  for (const ln of ["top", "mid", "bot"]) for (let i = 0; i <= 200; i++) { const t = i / 200; laneErr = Math.max(laneErr, dist(rot(G.posOnLane(ln, t)), G.posOnLane(swLane(ln), 1 - t))); }
  const e = P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 140001, null);
  let towerErr = 0, towerMissing = 0;
  for (const [k, tw] of Object.entries(e.towers)) { const m = e.towers[swTowerKey(k)]; if (!m) { towerMissing++; continue; } towerErr = Math.max(towerErr, dist(rot(tw.pos), m.pos), Math.abs((typeof tw.t === "number" ? 1 - tw.t : 0) - (typeof m.t === "number" ? m.t : 0))); }
  let campErr = 0;
  for (const c of e.neutrals.camps) { const m = e.neutrals.camps.find((x) => x.id === String(c.id).replace(/_(blue|red)_/, (_, s) => `_${sw(s)}_`)); campErr = Math.max(campErr, m ? dist(rot(c.pos), m.pos) : Infinity); }
  const pits = { dragon: e.neutrals.dragon?.pos ?? null, baron: e.neutrals.baron?.pos ?? null };
  J.geometry = { W, laneMaxErr: laneErr, laneLength: Object.fromEntries(["top", "mid", "bot"].map((l) => [l, G.laneLength(l)])), towerMaxErr: towerErr, towerMissing, campMaxErr: campErr,
    pits, pitsRotateOntoEachOther: pits.dragon && pits.baron ? dist(rot(pits.dragon), pits.baron) : null,
    note: "the two objective pits are different objectives (dragon vs baron); a 180-degree rotation maps one pit onto the other, so the map is rule-symmetric but objective-asymmetric by layout" };
}

// ② 真實狀態鏡射
function mirrorView(E1) {
  const E2 = Object.create(LogicEngine.prototype);
  E2.t = E1.t; E2.rules = E1.rules;
  E2.players = E1.players.map((p) => ({ ...p, id: swId(p.id), side: sw(p.side), lane: swLane(p.lane), pos: rot(p.pos) }));
  //  戰鬥原型（_engageRange 讀 this.arch[p.id]）：鍵是英雄 id ⇒ 跟著紅藍對調。
  //  ⚠ 第一版漏了這兩欄，鏡像那一側全部退回預設交戰距離 8，護送站位點出現 0.4%～0.9% 的假差異（2026-11-20 重跑修正）。
  E2.archOn = E1.archOn;
  E2.arch = Object.fromEntries(Object.entries(E1.arch ?? {}).map(([id, a]) => [swId(id), a]));
  E2.towers = {};
  for (const [k, tw] of Object.entries(E1.towers)) E2.towers[swTowerKey(k)] = { ...tw, side: sw(tw.side), lane: swLane(tw.lane), pos: rot(tw.pos), t: typeof tw.t === "number" ? 1 - tw.t : tw.t };
  E2.lanes = {};
  for (const l of ["top", "mid", "bot"]) { const L = E1.lanes[l]; E2.lanes[swLane(l)] = { ...L, bm: L.rm.map((m) => ({ ...m, t: 1 - m.t, latN: m.latN ? -m.latN : m.latN })), rm: L.bm.map((m) => ({ ...m, t: 1 - m.t, latN: m.latN ? -m.latN : m.latN })) }; }
  return E2;
}
const towerSig = (tw) => (tw ? `${tw.side}|${tw.lane}|${tw.pos.x.toFixed(6)},${tw.pos.y.toFixed(6)}` : "null");
const towerSigRot = (tw) => (tw ? `${sw(tw.side)}|${swLane(tw.lane)}|${rot(tw.pos).x.toFixed(6)},${rot(tw.pos).y.toFixed(6)}` : "null");
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const C = { matches: 0, outcomeSame: 0, outcomeDiff: [], ticks: 0, front: [0, 0], wave: [0, 0], timer: [0, 0], lane: [0, 0], hold: [0, 0], holdMaxErr: 0, examples: [],
  shadowOnAtVsEngine: { same: 0, diff: 0, diffs: [] }, escortHeroTicks: { blue: 0, red: 0 }, laneChosen: { blue: {}, red: {} }, escortOn: { both: 0, sameTick: 0, onlyBlue: 0, onlyRed: 0, none: 0 } };
const bad = (k, ex) => { C[k][1]++; if (C.examples.length < 12) C.examples.push({ kind: k, ...ex }); };
for (const cfg of ["inv", "AB", "BA"]) {
  const s13 = jsonl(path.join(STRESS, `tool_${cfg}_s13.jsonl`)), s12 = new Map(jsonl(path.join(STRESS, `tool_${cfg}_s12.jsonl`)).map((r) => [r.seed, r]));
  const picks = s13.filter((r) => r.injected && s12.get(r.seed)?.injected && (r.escortOn?.blue != null || r.escortOn?.red != null)).slice(0, PER);
  for (const ref of picks) {
    const seed = ref.seed, tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length];
    const e = P.build("balanceTool.v24", T[cfg][0], T[cfg][1], seed, null);
    while (!e.over && e.t < tInject) e.tick(0.5);
    for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
    const Xa = { v13: true }, Xb = { v13: true };
    while (!e.over && e.t < CAP) {
      e.tick(0.5); C.ticks++;
      const E2 = mirrorView(e);
      for (const S of ["blue", "red"]) {
        //  a. 暴露
        for (const ln of ["top", "mid", "bot"]) { C.front[0]++; const a = e.frontStructure(S, ln), b = E2.frontStructure(sw(S), swLane(ln)); if (towerSigRot(a) !== towerSig(b)) bad("front", { seed, t: e.t, S, ln, a: towerSig(a), b: towerSig(b) }); }
        //  b. 主堡有沒有兵線
        C.wave[0]++; const wa = e._hasWaveAtStructure(S, e.towers[`${sw(S)}_nexus`]), wb = E2._hasWaveAtStructure(sw(S), E2.towers[`${S}_nexus`]); if (wa !== wb) bad("wave", { seed, t: e.t, S, wa, wb });
        //  d. 選路（每個 tick 重新選）
        const fresh = () => ({ eg: { blue: { on: true, until: -Infinity }, red: { on: true, until: -Infinity } } });
        C.lane[0]++; const la = TE.endgameEscortLane(e, fresh(), S), lb = TE.endgameEscortLane(E2, fresh(), sw(S)); if ((la == null ? null : swLane(la)) !== lb) bad("lane", { seed, t: e.t, S, la, lb });
        //  e. 護送站位點：每名活著的英雄 × 每條路
        for (const p of e.players) {
          if (p.dead || p.side !== S) continue;
          const p2 = E2.players.find((q) => q.id === swId(p.id));
          for (const ln of ["top", "mid", "bot"]) {
            C.hold[0]++;
            const ha = e._laneWaveHoldT(p, ln, 1), hb = E2._laneWaveHoldT(p2, swLane(ln), 1);
            const err = ha == null || hb == null ? (ha == null && hb == null ? 0 : Infinity) : Math.abs(1 - ha - hb);
            C.holdMaxErr = Math.max(C.holdMaxErr, Number.isFinite(err) ? err : C.holdMaxErr);
            if (err > 1e-9) bad("hold", { seed, t: e.t, S, id: p.id, ln, ha, hb });
          }
          if (p.intent === "護送兵線進基地") C.escortHeroTicks[S]++;
        }
        const g = e.tacExec.eg?.[S];
        if (g?.on && g.lane) C.laneChosen[S][g.lane] = (C.laneChosen[S][g.lane] ?? 0) + 1;
      }
      //  c. 影子計時器：同一串狀態分別餵原圖與鏡像圖
      TE.endgameTick13(e, Xa); TE.endgameTick13(E2, Xb);
      for (const S of ["blue", "red"]) { C.timer[0]++; const A = Xa.eg[S], B = Xb.eg[sw(S)]; if (A.since !== B.since || A.on !== B.on || A.onAt !== B.onAt) bad("timer", { seed, t: e.t, S, A: { since: A.since, on: A.on }, B: { since: B.since, on: B.on } }); }
    }
    C.matches++;
    if (e.over === ref.over && e.winner === ref.winner && e.t === ref.end) C.outcomeSame++; else C.outcomeDiff.push({ seed, cfg, got: [e.over, e.winner, e.t], ref: [ref.over, ref.winner, ref.end] });
    for (const S of ["blue", "red"]) { const a = Xa.eg?.[S]?.onAt ?? null, b = e.tacExec.eg?.[S]?.onAt ?? null; if (a === b) C.shadowOnAtVsEngine.same++; else { C.shadowOnAtVsEngine.diff++; if (C.shadowOnAtVsEngine.diffs.length < 6) C.shadowOnAtVsEngine.diffs.push({ seed, S, shadow: a, engine: b }); } }
    const ob = e.tacExec.eg?.blue?.onAt ?? null, orr = e.tacExec.eg?.red?.onAt ?? null;
    if (ob != null && orr != null) { C.escortOn.both++; if (ob === orr) C.escortOn.sameTick++; } else if (ob != null) C.escortOn.onlyBlue++; else if (orr != null) C.escortOn.onlyRed++; else C.escortOn.none++;
    console.log(`${cfg} ${seed} done (${C.matches}) outcome ${e.winner}@${e.t} ref ${ref.winner}@${ref.end}`);
  }
}
J.mirror = C;
J.summary = { matches: C.matches, outcomeSameAsRecorded: `${C.outcomeSame}/${C.matches}`, ticks: C.ticks,
  compared: { front: C.front[0], wave: C.wave[0], timer: C.timer[0], lane: C.lane[0], hold: C.hold[0] },
  mismatches: { front: C.front[1], wave: C.wave[1], timer: C.timer[1], lane: C.lane[1], hold: C.hold[1] }, holdMaxErr: C.holdMaxErr, geometry: J.geometry };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
console.log(JSON.stringify(J.summary, null, 1));
