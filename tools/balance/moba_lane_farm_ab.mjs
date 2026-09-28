// ============================================================================
//  tools/balance/moba_lane_farm_ab.mjs — 英雄對兵線行為 A/B（MOBA Mobile & Presentation Polish C 段）
//
//  用法：
//    node tools/balance/moba_lane_farm_ab.mjs --seeds=60 --workers=3 [--cand='{"heroLaneFarmPrepK":3}'] [--out=reports/moba-lane-farm]
//
//  設定：沿用 moba_items_balance_runner 的 configure(seed, "standard")（與 useLocalServer 同序：
//    heroes → hero skills → archetypes → spells → match(STANDARD) → items）。
//    A＝引擎現行規則；B＝同一份程式碼，只把 --cand 的規則覆寫到「這一場引擎的 rules 副本」上。
//  決定性：每場只由 (arm, seed) 決定；worker 數量與完成順序不影響輸出。
//
//  量測（逐 tick 讀引擎內部狀態，只讀不寫）：
//    farm     對線英雄（top／mid／adc）在「有敵兵在攻擊距離內、這個 tick 沒打英雄、沒撤退／回城／陣亡」時，
//             真的在打兵的 tick 比例（0–5 分、0–10 分）
//    cs       各定位 5／10 分鐘補刀（lastHits）
//    steal    打野／輔助的打兵傷害佔全隊打兵傷害比例（不該因新規則搶線）
//    tempo    首殺、首塔、首龍時間；比賽時長；藍方勝率
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DT = 0.5, CAP_S = 3600;
const LANERS = new Set(["top", "mid", "adc"]);
let MODS = null;
//  正式 v14 流程：Hero Skills ＋ 戰鬥天賦都開（runner 預設關，這裡強制與正式相同）。
process.env.ESMO_BALANCE_SKILLS = "on";
process.env.ESMO_BALANCE_TALENTS = "on";

async function runOne(arm, seed, cand) {
  const R = await load("tools/balance/moba_items_balance_runner.mjs");
  MODS ??= await R.modules();
  const { e } = R.configure(seed, "standard", MODS);
  if (arm === "B" && cand) e.rules = { ...e.rules, ...cand };
  const roleOf = Object.fromEntries(e.players.map((p) => [p.id, p.role]));
  const acc = { opp5: 0, hit5: 0, opp10: 0, hit10: 0 };
  const role10 = {};   // role → { alive, near, hit }（0–10 分，陣亡／回城不計）
  const minionDmgByRole = {};
  let firstKill = null, firstTower = null, firstDragon = null;
  const cs = { 300: {}, 600: {} };
  const prev = new Map(e.players.map((p) => [p.id, { md: p.minionDmg ?? 0, hd: p.dmg ?? 0 }]));
  const alive0 = () => Object.values(e.towers).filter((t) => t.hp > 0).length;
  const towers0 = alive0();
  let dragonAlive = e.dragon.alive;
  while (!e.over && e.t < CAP_S) {
    e.tick(DT);
    const t = e.t;
    for (const p of e.players) {
      const pv = prev.get(p.id);
      const md = (p.minionDmg ?? 0) - pv.md, hd = (p.dmg ?? 0) - pv.hd;
      pv.md = p.minionDmg ?? 0; pv.hd = p.dmg ?? 0;
      minionDmgByRole[p.role] = (minionDmgByRole[p.role] ?? 0) + md;
      if (t > 600 || p.dead || (p.recallT ?? 0) > 0) continue;
      const range = e._engageRange(p);
      const key = p.side === "blue" ? "rm" : "bm";
      let near = false;
      for (const ln of ["top", "mid", "bot"]) {
        for (const m of e.lanes[ln][key]) { if (m.hp > 0 && Math.hypot(e._minionPos(ln, m).x - p.pos.x, e._minionPos(ln, m).y - p.pos.y) < range) { near = true; break; } }
        if (near) break;
      }
      const rr = (role10[p.role] ??= { alive: 0, near: 0, hit: 0 });
      rr.alive++; if (near) rr.near++; if (md > 0) rr.hit++;
      if (!LANERS.has(p.role) || p.retreating || hd > 0) continue;
      if (!near) continue;
      acc.opp10++; if (md > 0) acc.hit10++;
      if (t <= 300) { acc.opp5++; if (md > 0) acc.hit5++; }
    }
    if (firstKill == null && (e.bK + e.rK) > 0) firstKill = t;
    if (firstTower == null && alive0() < towers0) firstTower = t;
    if (firstDragon == null && dragonAlive && !e.dragon.alive) firstDragon = t;
    dragonAlive = e.dragon.alive;
    for (const mark of [300, 600]) if (Math.abs(t - mark) < DT / 2) for (const p of e.players) cs[mark][p.role] = (cs[mark][p.role] ?? 0) + (p.lastHits ?? 0) / 2;
  }
  const totalMd = Object.values(minionDmgByRole).reduce((s, v) => s + v, 0) || 1;
  return {
    arm, seed, over: e.over ? 1 : 0, duration: e.t, winner: e.winner ?? null,
    farm5: acc.opp5 ? acc.hit5 / acc.opp5 : null, farm10: acc.opp10 ? acc.hit10 / acc.opp10 : null,
    cs5: cs[300], cs10: cs[600], firstKill, firstTower, firstDragon,
    stealJungle: (minionDmgByRole.jungle ?? 0) / totalMd, stealSup: (minionDmgByRole.sup ?? 0) / totalMd,
    laneSkillCasts: e.laneSkillStats?.casts ?? 0, role10,
  };
}

// ── worker ──────────────────────────────────────────────────────────────────
if (process.env.LANE_AB_WORKER === "1") {
  process.on("message", async ({ jobs, cand }) => {
    for (const [arm, seed] of jobs) process.send({ row: await runOne(arm, seed, cand) });
    process.send({ done: true });
  });
} else {
  const seeds = Number(arg("seeds", "40"));
  const workers = Math.max(1, Math.min(Number(arg("workers", "3")), os.cpus().length));
  const cand = JSON.parse(arg("cand", "null"));
  const out = arg("out", null);
  const arms = cand ? ["A", "B"] : ["A"];
  const jobs = arms.flatMap((a) => Array.from({ length: seeds }, (_, i) => [a, 1000 + i]));
  const rows = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((res) => {
    const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), { env: { ...process.env, LANE_AB_WORKER: "1" } });
    child.on("message", (m) => {
      if (m.row) { rows.push(m.row); if (rows.length % 10 === 0) process.stderr.write(`  ${rows.length}/${jobs.length}  ${((Date.now() - t0) / 60000).toFixed(1)} 分\n`); }
      if (m.done) { child.kill(); res(); }
    });
    child.send({ jobs: jobs.filter((_, i) => i % workers === w), cand });
  })));
  rows.sort((a, b) => (a.arm < b.arm ? -1 : a.arm > b.arm ? 1 : a.seed - b.seed));
  const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const f = (x, d = 2) => (x == null ? "—" : x.toFixed(d));
  const summary = {};
  for (const a of arms) {
    const L = rows.filter((r) => r.arm === a);
    const roleCs = (mark, role) => mean(L.map((r) => r[`cs${mark}`]?.[role]));
    summary[a] = {
      n: L.length, finished: L.filter((r) => r.over).length,
      farm5: mean(L.map((r) => r.farm5)), farm10: mean(L.map((r) => r.farm10)),
      cs5: Object.fromEntries(["top", "jungle", "mid", "adc", "sup"].map((r) => [r, roleCs(5, r)])),
      cs10: Object.fromEntries(["top", "jungle", "mid", "adc", "sup"].map((r) => [r, roleCs(10, r)])),
      firstKill: mean(L.map((r) => r.firstKill)), firstTower: mean(L.map((r) => r.firstTower)), firstDragon: mean(L.map((r) => r.firstDragon)),
      durationMin: mean(L.map((r) => r.duration / 60)), blueWin: mean(L.filter((r) => r.winner).map((r) => (r.winner === "blue" ? 1 : 0))),
      presence10: Object.fromEntries(["top", "jungle", "mid", "adc", "sup"].map((ro) => [ro, mean(L.map((r) => r.role10?.[ro] ? r.role10[ro].near / r.role10[ro].alive : null))])),
      hitShare10: Object.fromEntries(["top", "jungle", "mid", "adc", "sup"].map((ro) => [ro, mean(L.map((r) => r.role10?.[ro] ? r.role10[ro].hit / r.role10[ro].alive : null))])),
      stealJungle: mean(L.map((r) => r.stealJungle)), stealSup: mean(L.map((r) => r.stealSup)), laneSkillCasts: mean(L.map((r) => r.laneSkillCasts)),
    };
  }
  for (const a of arms) {
    const s = summary[a];
    console.log(`[${a}] n=${s.n} 完賽 ${s.finished}｜打兵率 0-5分 ${f(s.farm5)} 0-10分 ${f(s.farm10)}｜補刀@10 top ${f(s.cs10.top, 1)} mid ${f(s.cs10.mid, 1)} adc ${f(s.cs10.adc, 1)} jg ${f(s.cs10.jungle, 1)} sup ${f(s.cs10.sup, 1)}`
      + `｜首殺 ${f(s.firstKill, 0)}s 首塔 ${f(s.firstTower, 0)}s 首龍 ${f(s.firstDragon, 0)}s｜時長 ${f(s.durationMin, 1)} 分｜藍勝 ${f(s.blueWin)}｜打野/輔助打兵佔比 ${f(s.stealJungle)}/${f(s.stealSup)}｜技能清兵 ${f(s.laneSkillCasts, 0)}`);
    console.log(`    0-10 分 在兵旁比例 top ${f(s.presence10.top)} mid ${f(s.presence10.mid)} adc ${f(s.presence10.adc)} jg ${f(s.presence10.jungle)} sup ${f(s.presence10.sup)}｜打兵 tick 比例 top ${f(s.hitShare10.top)} mid ${f(s.hitShare10.mid)} adc ${f(s.hitShare10.adc)} jg ${f(s.hitShare10.jungle)} sup ${f(s.hitShare10.sup)}`);
  }
  if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, `lane-farm-ab-${cand ? "AB" : "A"}.json`), JSON.stringify({ cand, seeds, summary, rows }, null, 2)); }
  console.log(`完成 ${rows.length} 場，${((Date.now() - t0) / 60000).toFixed(1)} 分`);
}
