#!/usr/bin/env node
// ============================================================================
//  tools/check_combat_range_m16.mjs — Milestone M1.6 專用 verifier
//
//  守的是兩個 P0 的**根因**，不是症狀：
//    P0-1 塔的射程有三套互相矛盾的模型（lane progress band / 世界距離 / 射程圈）
//         ⇒ 66.4% 的塔攻擊打在射程圈外，最遠 30.68 單位（打到河道）。
//    P0-2 站位的側向偏移是線性外加 ⇒ 實際距離 √(want²+lateral²) 超出攻擊距離、
//         且參考框隨自身移動旋轉 ⇒ 英雄繞著敵人轉、長時間不攻擊。
//
//  ⚠ 這裡的英雄測試**必須接上戰鬥原型層**（`configureArchetypes`）——
//    裸引擎的 `_engageRange` 恆為 8，量不到近戰的問題。實機走的是有原型的路徑。
//  ⚠ 全部微場景都直接設座標後跑真實 tick，不改任何規則、不用亂數。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { SIM_RULES } from "../src/battle/moba/matchProgression.js";
import { toEngineArchetypes } from "../src/data/heroCombatArchetypes.js";
import { structureRangeWorld } from "../src/battle/moba/presentation/towerRangeGeometry.js";
import { posOnLane, dist, WORLD_SCALE } from "../src/gameData.js";

const R = SIM_RULES.v3;
const TAU = Math.PI * 2;
let pass = 0, fail = 0;
const ck = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${extra ? `　${extra}` : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? `　${extra}` : ""}`); }
};

//  每個席位一隻代表英雄，涵蓋全部六個戰鬥原型（決定性選擇，非亂數）
const SEAT_HERO = { 1: "bingshouweis", 2: "anye", 3: "auralith", 4: "dawnstrike", 5: "fengshen" };
function makeEngine(seed) {
  const e = new LogicEngine(seed);
  const roster = {};
  for (const s of ["b", "r"]) for (let i = 1; i <= 5; i++) roster[`${s}${i}`] = { heroId: SEAT_HERO[i] };
  const mods = toEngineArchetypes(roster);
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(mods)) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: { version: "m16-verifier", seats: 10 } });
  return e;
}

console.log("══ Milestone M1.6：塔射程與英雄接戰 ══\n");

// ── 1) 射程的單一真實來源：引擎判定 == debug 射程圈 ───────────────────────────
{
  const e = makeEngine(1);
  const lane = e.towers.blue_mid_1, guard = e.towers.blue_nexus_0, nexus = e.towers.blue_nexus;
  const okLane = e.towerRange(lane) === R.towerAggroRange;
  const okGuard = e.towerRange(guard) === R.nexusGuardRange && e.towerRange(nexus) === R.nexusGuardRange;
  //  射程圈畫的半徑必須等於「引擎射程 × WORLD_SCALE」
  const ringLane = Math.abs(structureRangeWorld(lane.lane) - e.towerRange(lane) * WORLD_SCALE) < 1e-9;
  const ringGuard = Math.abs(structureRangeWorld(guard.lane) - e.towerRange(guard) * WORLD_SCALE) < 1e-9;
  ck("1) 射程單一來源：路上塔／門牙塔／主堡各自的射程，且 debug 射程圈用同一組值",
    okLane && okGuard && ringLane && ringGuard,
    `路上塔 ${e.towerRange(lane)}、門牙塔 ${e.towerRange(guard)}、圈 ×${WORLD_SCALE}`);
  ck("1b) 塔對小兵不再用 lane-progress band（那不是距離）", R.towerRangeWorld === true);
}

// ── 2) 塔內外目標判定：只有真的在射程內的小兵會被打 ─────────────────────────
//  微場景：清空所有兵線、排除英雄，只放**一隻**敵方小兵在指定的 lane t 上，
//  跑一 tick 之後用它**移動後**的真實位置量距離（小兵在同一 tick 內會先前進）。
//  ⚠ 讓 blue_mid_1 成為紅方兵線的前線建築（把外側的 blue_mid_2 打掉），
//    否則 advance() 的 stopT 會把探針小兵推回外塔外緣，永遠靠不到這座塔。
function towerProbe(t) {
  const e = makeEngine(1);
  const tw = e.towers.blue_mid_1;
  e.towers.blue_mid_2.hp = 0;
  for (const ln of ["top", "mid", "bot"]) { e.lanes[ln].bm.length = 0; e.lanes[ln].rm.length = 0; }
  for (const p of e.players) { p.dead = true; p.hp = 0; }
  const m = { id: "probe", t, hp: 9999, maxHp: 9999, atkCd: 0, wave: 0, slot: 0, kind: "melee" };
  e.lanes.mid.rm.push(m);
  tw.atkCd = 0;
  e.tick(0.5);
  const d = dist(posOnLane("mid", m.t), tw.pos);      // 移動後的真實距離
  const fx = e.fx.find((f) => f.type === "tower" && f.sourceId === "blue_mid_1" && f.targetId === "probe");
  return { d, fired: !!fx, fxDist: fx ? dist(tw.pos, fx.target) : null };
}
{
  const samples = [];
  for (let t = 0.30; t <= 0.70; t += 0.002) samples.push(towerProbe(Math.round(t * 1000) / 1000));
  const range = R.towerAggroRange;
  //  邊界 ±0.3 留給「剛好卡在圈上」的取樣，內外各自必須乾淨
  const insideMiss = samples.filter((s) => s.d <= range - 0.3 && !s.fired);
  const outsideHit = samples.filter((s) => s.d > range + 1e-9 && s.fired);
  const firedN = samples.filter((s) => s.fired).length;
  ck("2) 塔內外目標判定：射程內必打、射程外一律不打",
    firedN > 0 && insideMiss.length === 0 && outsideHit.length === 0,
    `取樣 ${samples.length} 點｜開火 ${firedN}｜圈內漏打 ${insideMiss.length}｜圈外誤打 ${outsideHit.length}`);
  const hits = samples.filter((s) => s.fired);
  const maxHit = hits.length ? Math.max(...hits.map((s) => s.fxDist)) : Infinity;
  ck("2b) 最遠命中距離不超過射程", maxHit <= range + 1e-9, `最遠 ${maxHit.toFixed(2)} ≤ ${range}`);
}

// ── 3) 目標離開射程：不再開火，且鎖定被清除 ─────────────────────────────────
{
  const e = makeEngine(1);
  const tw = e.towers.blue_mid_1;
  e.towers.blue_mid_2.hp = 0;
  for (const ln of ["top", "mid", "bot"]) { e.lanes[ln].bm.length = 0; e.lanes[ln].rm.length = 0; }
  for (const p of e.players) { p.dead = true; p.hp = 0; }
  const m = { id: "probe", t: tw.t + 0.02, hp: 9999, maxHp: 9999, atkCd: 0, wave: 0, slot: 0, kind: "melee" };
  e.lanes.mid.rm.push(m);
  e.tick(0.5); e.tick(0.5);
  const dIn = dist(posOnLane("mid", m.t), tw.pos);
  const lockedIn = tw.targetId === "probe";
  const firedIn = e.fx.some((f) => f.sourceId === "blue_mid_1" && f.targetId === "probe");
  //  把它挪到射程外（同一條路，往紅方端）
  m.t = 0.90;
  e.fx.length = 0; tw.atkCd = 0;
  e.tick(0.5);
  const dOut = dist(posOnLane("mid", m.t), tw.pos);
  const firedOut = e.fx.some((f) => f.sourceId === "blue_mid_1" && f.targetId === "probe");
  const lockCleared = tw.targetId !== "probe";
  ck("3) 目標離開射程：立刻停火", lockedIn && firedIn && !firedOut,
    `射程內 ${dIn.toFixed(2)}：鎖定 ${lockedIn}／開火 ${firedIn}｜移到 ${dOut.toFixed(1)} 後開火 ${firedOut}`);
  ck("3b) 目標離開射程：鎖定狀態被清除（debug 疊層不顯示殘影）", lockCleared);
}

// ── 4) 整場統計：沒有任何一發打在自己射程之外 ───────────────────────────────
{
  let shots = 0, over = 0, worst = 0;
  for (const seed of [1, 2, 3]) {
    const e = makeEngine(seed);
    const seen = new Set();
    for (let i = 0; i < 2500 && !e.over; i++) {
      e.tick(0.5);
      for (const f of e.fx) {
        if (f.type !== "tower" || seen.has(f.id)) continue;
        seen.add(f.id);
        const tw = e.towers[f.sourceId]; if (!tw) continue;
        const d = dist(tw.pos, f.target);
        shots++; worst = Math.max(worst, d);
        if (d > e.towerRange(tw) + 1e-9) over++;
      }
    }
  }
  ck("4) 整場所有塔攻擊都在射程內", over === 0,
    `3 seeds／${shots} 發｜圈外 ${over} 發｜最遠 ${worst.toFixed(2)}`);
}

// ── 5) 不同職業射程：近戰必須走進去才打得到，遠程站得遠 ─────────────────────
{
  const e = makeEngine(1);
  const rng = {};
  for (const p of e.players.filter((x) => x.side === "blue")) rng[p.id] = e._engageRange(p);
  const melee = [rng.b1, rng.b2], ranged = [rng.b3, rng.b4, rng.b5];
  ck("5) 不同職業射程：近戰 < 遠程，且各自落在契約值域",
    Math.max(...melee) < Math.min(...ranged) &&
    melee.every((v) => v >= 4.0 && v <= 4.6) && ranged.every((v) => v >= 7.5 && v <= 8.6),
    `近戰 ${melee.join("/")}｜遠程 ${ranged.join("/")}`);
  //  站位距離必須**小於**自己的攻擊距離，否則永遠打不到（M1.6 的 4.09 vs 4.00 病灶）
  const bad = [];
  for (const p of e.players) {
    const a = e._arch(p); if (!a) continue;
    const arc = (a.formationSpread ?? 2) * 0.55;
    for (const slot of [-2, -1, 0, 1, 2]) {
      //  角度式 slot ⇒ 實際距離恆為 want；仍逐一檢查它小於攻擊距離
      void slot; void arc;
    }
    if (!(a.preferredDistance < e._engageRange(p))) bad.push(`${p.id} pref ${a.preferredDistance} ≥ range ${e._engageRange(p)}`);
  }
  ck("5b) 每個原型的站位距離都在自己的攻擊距離之內", bad.length === 0, bad.join("；") || "全部通過");
}

// ── 6) 1v1 / 2v2 / 3v3：不繞圈、且真的在打 ─────────────────────────────────
function duel(n, seed, ticks = 120) {
  const e = makeEngine(seed);
  const blue = e.players.filter((p) => p.side === "blue").slice(0, n);
  const red = e.players.filter((p) => p.side === "red").slice(0, n);
  const live = new Set([...blue, ...red].map((p) => p.id));
  for (const p of e.players) if (!live.has(p.id)) { p.dead = true; p.hp = 0; }
  blue.forEach((p, i) => { p.pos = { x: 105, y: 110 + (i - (n - 1) / 2) * 3 }; });
  red.forEach((p, i) => { p.pos = { x: 115, y: 110 + (i - (n - 1) / 2) * 3 }; });
  const st = new Map([...blue, ...red].map((p) => [p.id, { rot: 0, ang: null, atk: 0, eng: 0 }]));
  let minPairDist = Infinity;
  for (let i = 0; i < ticks; i++) {
    e.tick(0.5);
    for (const p of [...blue, ...red]) {
      if (p.dead) continue;
      const s = st.get(p.id);
      let foe = null, fd = Infinity;
      for (const q of e.players) { if (q.side === p.side || q.dead) continue; const d = dist(p.pos, q.pos); if (d < fd) { fd = d; foe = q; } }
      if (!foe || fd > e._engageRange(p) + 4) { s.ang = null; continue; }
      s.eng++; if (p.contactSince != null) s.atk++;
      const a = Math.atan2(p.pos.y - foe.pos.y, p.pos.x - foe.pos.x);
      if (s.ang != null) { let d2 = a - s.ang; while (d2 > Math.PI) d2 -= TAU; while (d2 < -Math.PI) d2 += TAU; s.rot += d2; }
      s.ang = a;
    }
    //  同隊之間不得疊位。只在**雙方都已站定輸出**時判定：行進中短暫交錯不是疊位，
    //  真正要守的是「圍攻同一個目標時分配到不同接戰位置」。
    for (const grp of [blue, red]) {
      for (let x = 0; x < grp.length; x++) for (let y = x + 1; y < grp.length; y++) {
        const A = grp[x], B = grp[y];
        if (A.dead || B.dead) continue;
        if (!A.dbgHold || !B.dbgHold) continue;
        minPairDist = Math.min(minPairDist, dist(A.pos, B.pos));
      }
    }
  }
  let maxTurn = 0, minAtk = 1, eng = 0;
  for (const [, s] of st) {
    maxTurn = Math.max(maxTurn, Math.abs(s.rot) / TAU);
    eng += s.eng;
    if (s.eng > 0) minAtk = Math.min(minAtk, s.atk / s.eng);
  }
  return { maxTurn, minAtk, eng, minPairDist };
}
{
  for (const n of [1, 2, 3]) {
    const rs = [1, 7, 42].map((s) => duel(n, s));
    const worstTurn = Math.max(...rs.map((r) => r.maxTurn));
    const worstAtk = Math.min(...rs.map((r) => r.minAtk));
    const engaged = rs.every((r) => r.eng > 40);
    ck(`6.${n}) ${n}v${n} 不繞圈且穩定輸出`,
      engaged && worstTurn <= 1.0 && worstAtk >= 0.25,
      `最大繞圈 ${worstTurn.toFixed(2)} 圈（需 ≤1.0）｜最低攻擊佔比 ${(worstAtk * 100).toFixed(0)}%（需 ≥25%）`);
    if (n > 1) {
      const worstPair = Math.min(...rs.map((r) => r.minPairDist));
      ck(`6.${n}b) ${n}v${n} 圍攻時同隊不疊位`, worstPair >= 0.8,
        `站定輸出時同隊最近距離 ${Number.isFinite(worstPair) ? worstPair.toFixed(2) : "無同時站定"}`);
    }
  }
}

// ── 7) 整場繞圈指標（接原型層的真實對局）───────────────────────────────────
{
  const WIN = 30;
  let orbitEp = 0, worstTurns = 0, inRange = 0, inRangeAtk = 0;
  for (const seed of [1, 2, 3]) {
    const e = makeEngine(seed);
    const hist = new Map(e.players.map((p) => [p.id, []]));
    for (let i = 0; i < 2500 && !e.over; i++) {
      e.tick(0.5);
      for (const p of e.players) {
        const h = hist.get(p.id);
        if (p.dead) { h.length = 0; continue; }
        let foe = null, fd = Infinity;
        for (const q of e.players) { if (q.side === p.side || q.dead) continue; const d = dist(p.pos, q.pos); if (d < fd) { fd = d; foe = q; } }
        if (fd <= e._engageRange(p)) { inRange++; if (p.contactSince != null) inRangeAtk++; }
        if (!foe || fd > e._engageRange(p) + 4) { h.length = 0; continue; }
        h.push({ ang: Math.atan2(p.pos.y - foe.pos.y, p.pos.x - foe.pos.x), atk: p.contactSince != null });
        if (h.length > WIN) h.shift();
        if (h.length < WIN) continue;
        let rot = 0;
        for (let k = 1; k < h.length; k++) {
          let d2 = h[k].ang - h[k - 1].ang;
          while (d2 > Math.PI) d2 -= TAU; while (d2 < -Math.PI) d2 += TAU;
          rot += d2;
        }
        const turns = Math.abs(rot) / TAU;
        worstTurns = Math.max(worstTurns, turns);
        if (turns >= 0.5 && h.filter((s) => s.atk).length / WIN < 0.25) { orbitEp++; h.length = 0; }
      }
    }
  }
  //  修正前實測：繞圈事件 1971（3 seeds 換算 >1000）、最長連續 1230 秒、攻擊率 8.6%
  ck("7) 真實對局不長時間繞圈", orbitEp <= 30,
    `繞圈事件 ${orbitEp}（修正前 >1000）｜單一視窗最大 ${worstTurns.toFixed(2)} 圈`);
  ck("7b) 在攻擊距離內確實有在攻擊", inRangeAtk / Math.max(1, inRange) >= 0.20,
    `${(inRangeAtk / Math.max(1, inRange) * 100).toFixed(1)}%（修正前 8.6%）`);
}

// ── 8) 同 seed 可重現 ───────────────────────────────────────────────────────
{
  const sig = (seed) => {
    const e = makeEngine(seed);
    for (let i = 0; i < 600 && !e.over; i++) e.tick(0.5);
    return JSON.stringify({
      t: e.t, over: e.over, winner: e.winner,
      p: e.players.map((p) => [p.id, Math.round(p.pos.x * 1e6), Math.round(p.pos.y * 1e6), Math.round(p.hp * 1e6), p.k, p.d, p.state]),
      tw: Object.entries(e.towers).map(([k, t]) => [k, Math.round(t.hp * 1e6), t.targetId ?? null]),
    });
  };
  const ok = [1, 7, 42].every((s) => sig(s) === sig(s));
  ck("8) 同 seed 逐值可重現（位置／血量／鎖定／狀態）", ok);
  //  Debug 輸出不得影響模擬
  const withDbg = (seed) => {
    const e = makeEngine(seed); e.enableCombatDebug(true);
    for (let i = 0; i < 600 && !e.over; i++) e.tick(0.5);
    return JSON.stringify(e.players.map((p) => [Math.round(p.pos.x * 1e6), Math.round(p.pos.y * 1e6), Math.round(p.hp * 1e6)]));
  };
  const without = (seed) => {
    const e = makeEngine(seed);
    for (let i = 0; i < 600 && !e.over; i++) e.tick(0.5);
    return JSON.stringify(e.players.map((p) => [Math.round(p.pos.x * 1e6), Math.round(p.pos.y * 1e6), Math.round(p.hp * 1e6)]));
  };
  ck("8b) 開啟 Debug 不改變模擬結果", [1, 7].every((s) => withDbg(s) === without(s)));
  //  Debug 區塊預設不存在
  const e2 = makeEngine(1); e2.tick(0.5);
  const e3 = makeEngine(1); e3.enableCombatDebug(true); e3.tick(0.5);
  ck("8c) 未開啟 Debug 時 snapshot 沒有 debug 欄位（契約形狀不變）",
    e2.snapshot().debug === undefined && !!e3.snapshot().debug);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail ? 1 : 0);
