#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_combat_quality_v1.mjs — MOBA Combat Quality v1 行為驗證
//
//  執行：node tools/check_moba_combat_quality_v1.mjs            （12 seeds，約 1–2 分鐘）
//        node tools/check_moba_combat_quality_v1.mjs --metrics  （只印量測，不判定）
//
//  對局組裝＝正式流程（balance runner 的 configure：英雄／原型／召喚師技能／戰術＋Hero Skills＋裝備 standard）。
//  守：
//    A  VFX 可讀性純函式（真實時間下限、螢幕空間尺寸、欄位差異）
//    H  英雄會處理兵線；角色差異仍在（輔助／打野少補刀）
//    M  小兵：多列隊形、不重疊、火力分散、即時換目標、會打英雄與反擊
//    W  波次：攻城兵週期加入、超級兵只出現在已破的路、兵線強化接口
//    D  不卡死：全部自然結束；同 seed 決定性；舊規則集不受影響
//    V  模擬版本 v9
// ============================================================================
process.env.ESMO_BALANCE_SKILLS = "on";
const { modules, configure } = await import("./balance/moba_items_balance_runner.mjs");
const RD = await import("../src/battle/moba/skills/skillReadability.js");
const SV = await import("../src/platform/contracts/simulationVersion.js");
const MP = await import("../src/battle/moba/matchProgression.js");
const { dist } = await import("../src/gameData.js");

const METRICS_ONLY = process.argv.includes("--metrics");
const SEEDS = Array.from({ length: Number(process.env.CQ_SEEDS ?? 12) }, (_, i) => i + 1);
const DT = 0.5, CAP_TICKS = 7200;
let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (METRICS_ONLY) { console.log(`   ${label}　${note}`); return; }
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

// ── A VFX 純函式 ─────────────────────────────────────────────────────────────
console.log("── A VFX 可讀性 ──");
{
  ck("A1 真實時間下限：1×＝1.4、2×＝1.7、4×＝3.4 遊戲秒",
    RD.skillMinVisualLife(1) === 1.4 && Math.abs(RD.skillMinVisualLife(2) - 1.7) < 1e-9 && Math.abs(RD.skillMinVisualLife(4) - 3.4) < 1e-9);
  ck("A2 上限 < 引擎 4.2 秒保留窗（8× 也夾在 4.0）", RD.skillMinVisualLife(8) === 4.0);
  const cam = (zoom) => ({ isOrthographicCamera: true, zoom, top: 450, bottom: -450 });
  const far = RD.skillScreenRadius(1.2, "Q", cam(3.4), 746);
  const px = far / RD.worldPerPixel(cam(3.4), 746);
  ck("A3 總覽鏡頭：Q 至少 22px", px >= 21.99, `${px.toFixed(1)}px`);
  const farR = RD.skillScreenRadius(1.2, "R", cam(3.4), 746);
  ck("A4 R 比 Q 大（欄位可辨）", farR > far, `${(farR / RD.worldPerPixel(cam(3.4), 746)).toFixed(1)}px`);
  //  上限夾的是「放大出來的部分」：作者原尺寸永遠保留（契約 radius ≤ 6），放大不得超過畫面高度 16%。
  //  畫面很矮（180px）時 R 的 36px 下限 > 16%（28.8px）⇒ 必須被夾在 28.8px。
  const tiny = RD.skillScreenRadius(0.1, "R", cam(3.4), 180) / RD.worldPerPixel(cam(3.4), 180);
  ck("A5 放大上限：最小像素放大不超過畫面高度 16%", Math.abs(tiny - 0.16 * 180) < 1e-6, `${tiny.toFixed(1)}px`);
  ck("A6 近景不縮小作者原尺寸", RD.skillScreenRadius(1.2, "Q", cam(40), 746) >= 1.2);
  ck("A7 透視鏡頭不調整", RD.skillScreenRadius(1.2, "R", { isPerspectiveCamera: true, zoom: 1 }, 746) === 1.2);
}

// ── 跑對局並量測 ────────────────────────────────────────────────────────────
const M = await modules();
const roleStats = {};
const agg = {
  farmOpp: 0, farmHit: 0, samples: 0, fileOk: 0, fileN: 0, pairs: 0, overlaps: 0,
  allocN: 0, allocShareSum: 0, allOnOne: 0, staleTarget: 0, heroTargetSamples: 0, retaliate: 0,
  minionHeroDmg: 0, siegeSpawned: 0, wavesSpawned: 0, superWrongSide: 0, superSeen: 0,
  finished: 0, unfinished: 0, durations: [], towersAt20: 0, farmMissStates: {},
  laneOpp: 0, laneHit: 0, ignoreStreaks: [],
};
const LANES = ["top", "mid", "bot"];

function runSeed(seed) {
  const { e } = configure(seed, "standard", M, 1);
  let ticks = 0;
  const staleSeen = new Map();
  //  連續「身邊有敵兵、沒有英雄目標、卻沒打兵」的秒數（每名對線英雄一條；機會中斷或打到兵就結算）
  const streak = new Map();
  const closeStreak = (id) => { const v = streak.get(id) ?? 0; if (v > 0) agg.ignoreStreaks.push(v); streak.set(id, 0); };
  const seenSiege = new Set(), seenWave = new Set();
  let towers20 = null;
  while (ticks < CAP_TICKS && !e.over) {
    //  ⚠ tick 是兩階段（全員先移動、再全員交戰）⇒ 「有沒有機會打兵」要用 **tick 後**的狀態判定
    //    （那正是交戰階段看到的位置與 FSM）；只比較這個 tick 的 minionDmg 增量。
    const before = new Map(e.players.map((p) => [p.id, p.minionDmg ?? 0]));
    e.tick(DT);
    ticks++;
    const lanePhase = e.t - DT < e.rules.laneWaveHoldUntil;
    for (const p of e.players) {
      if (!["top", "mid", "adc"].includes(p.role)) continue;
      if (p.dead || p.retreating || (p.recallT ?? 0) > 0 || p.fsm === "DISENGAGE" || p.fsm === "RETURN") { closeStreak(p.id); continue; }
      if (e.heroSkillsOn && e.t - DT < (p.heroSkillControlUntil ?? 0)) { closeStreak(p.id); continue; }
      const range = e._engageRange(p);
      if (e.players.some((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) < range)) { closeStreak(p.id); continue; }
      const key = p.side === "blue" ? "rm" : "bm";
      const minionNear = LANES.some((ln) => e.lanes[ln][key].some((m) => m.hp > -1e9 && dist(e._minionPos(ln, m), p.pos) < range));
      if (!minionNear) { closeStreak(p.id); continue; }
      const hit = (p.minionDmg ?? 0) > before.get(p.id) + 1e-9;
      agg.farmOpp++;
      if (lanePhase) { agg.laneOpp++; if (hit) agg.laneHit++; }
      if (hit) { agg.farmHit++; closeStreak(p.id); continue; }
      agg.farmMissStates[`${p.state}|${p.fsm}`] = (agg.farmMissStates[`${p.state}|${p.fsm}`] ?? 0) + 1;
      if (lanePhase) streak.set(p.id, (streak.get(p.id) ?? 0) + DT); else closeStreak(p.id);
    }
    for (const ln of LANES) for (const key of ["bm", "rm"]) for (const m of e.lanes[ln][key]) {
      seenWave.add(`${key}:${ln}:${m.wave}`);
      if (m.kind === "siege") seenSiege.add(`${key}:${ln}:${m.wave}`);
      if (m.kind === "super") {
        agg.superSeen++;
        if (!e._laneBreached(key === "bm" ? "blue" : "red", ln)) agg.superWrongSide++;
      }
    }
    if (towers20 == null && e.t >= 1200) {
      towers20 = Object.values(e.towers).filter((t) => t.lane !== "nexus" && t.hp <= 0).length;
    }
    //  每 5 秒取樣隊形／分配
    if (ticks % 10 === 0) {
      agg.samples++;
      for (const ln of LANES) for (const key of ["bm", "rm"]) {
        const arr = e.lanes[ln][key].filter((m) => m.hp > 0);
        if (arr.length >= 4) {
          agg.fileN++;
          if (new Set(arr.map((m) => Math.round((m.latN ?? 0) * 10))).size >= 2) agg.fileOk++;
        }
        for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
          agg.pairs++;
          if (dist(e._minionPos(ln, arr[i]), e._minionPos(ln, arr[j])) < 0.8) agg.overlaps++;
        }
        const foes = e.lanes[ln][key === "bm" ? "rm" : "bm"];
        const engaged = arr.filter((m) => m.targetKind === "minion" && foes.some((f) => f.id === m.targetId && f.hp > 0));
        //  「全員打同一隻」只在**真的有得選**時才算問題：交戰範圍內至少 2 隻活著的敵兵。
        const choices = foes.filter((f) => f.hp > 0 && engaged.some((m) => dist(e._minionPos(ln, m), e._minionPos(ln, f)) <= 8)).length;
        if (engaged.length >= 3 && choices >= 2) {
          const cnt = {};
          for (const m of engaged) cnt[m.targetId] = (cnt[m.targetId] ?? 0) + 1;
          const share = Math.max(...Object.values(cnt)) / engaged.length;
          agg.allocN++; agg.allocShareSum += share;
          if (share === 1) agg.allOnOne++;
        }
        for (const m of arr) {
          //  目標在本 tick 結算時死亡、下一個 tick 才換目標是正常的；卡住＝連續兩次取樣（5 秒）都指著同一個已消失的目標。
          const gone = m.targetKind === "minion" && m.targetId && !foes.some((f) => f.id === m.targetId);
          if (gone && staleSeen.get(m.id) === m.targetId) agg.staleTarget++;
          if (gone) staleSeen.set(m.id, m.targetId); else staleSeen.delete(m.id);
          if (m.targetKind === "hero") {
            agg.heroTargetSamples++;
            const h = e.players.find((q) => q.id === m.targetId);
            if (h && e.t - (h.heroAggroAt ?? -Infinity) <= e.rules.minionRetaliateSec) agg.retaliate++;
          }
        }
      }
    }
  }
  if (e.over) { agg.finished++; agg.durations.push(e.t / 60); } else agg.unfinished++;
  agg.towersAt20 += towers20 ?? Object.values(e.towers).filter((t) => t.lane !== "nexus" && t.hp <= 0).length;
  agg.siegeSpawned += seenSiege.size; agg.wavesSpawned += seenWave.size;
  for (const p of e.players) {
    const r = (roleStats[p.role] ??= { n: 0, lastHits: 0, minionDmg: 0, taken: 0 });
    r.n++; r.lastHits += p.lastHits ?? 0; r.minionDmg += p.minionDmg ?? 0; r.taken += p.minionDmgTaken ?? 0;
    agg.minionHeroDmg += p.minionDmgTaken ?? 0;
  }
  return e;
}

const t0 = Date.now();
let lastEngine = null;
for (const s of SEEDS) lastEngine = runSeed(s);
const wall = ((Date.now() - t0) / 1000).toFixed(1);
const per = Object.fromEntries(Object.entries(roleStats).map(([k, v]) => [k, {
  lastHits: +(v.lastHits / v.n).toFixed(1), minionDmg: Math.round(v.minionDmg / v.n), taken: Math.round(v.taken / v.n) }]));
console.log(`\n量測（${SEEDS.length} seeds，${wall}s）：`, JSON.stringify(per));

console.log("\n── H 英雄處理兵線 ──");
const farmRate = agg.farmHit / Math.max(1, agg.farmOpp);
const laneRate = agg.laneHit / Math.max(1, agg.laneOpp);
const st = [...agg.ignoreStreaks].sort((a, b) => a - b);
const pct = (q) => st.length ? st[Math.min(st.length - 1, Math.floor(q * st.length))] : 0;
console.log(`   打兵比例：對線期 ${(laneRate * 100).toFixed(1)}%（${agg.laneHit}/${agg.laneOpp}）、全場 ${(farmRate * 100).toFixed(1)}%；`
  + `對線期連續無視兵線 p50 ${pct(0.5)}s／p95 ${pct(0.95)}s／最長 ${st.at(-1) ?? 0}s（${st.length} 段）`);
if (METRICS_ONLY) console.log("   未打兵時的狀態分布：", JSON.stringify(Object.entries(agg.farmMissStates).sort((a, b) => b[1] - a[1]).slice(0, 8)));
//  ⚠ 不要求 100%：我方兵線已推進到敵方半場時英雄**刻意只補刀**（不幫忙推線，見 LogicEngine 兵線管理）。
//    要擋的是「長時間無視兵線」⇒ 同時看比例與連續無視的長度。
ck("H1a 對線期：有敵兵、沒有英雄目標時打兵比例 ≥ 60%", laneRate >= 0.6, `${(laneRate * 100).toFixed(1)}%`);
ck("H1b 對線期：連續無視身邊兵線 p95 ≤ 8 秒", pct(0.95) <= 8, `p95 ${pct(0.95)}s`);
//  ⚠ P0-A 陣營相對路線：每條邊路都是「單人 vs 雙人」⇒ 上路單人面對兩名英雄，補刀天生少於中路／下路。
//    所以只要求「每個對線角色都真的在補刀」（≥ 5／場），並要求角色差異：ADC 補刀最多。
ck("H2 上／中／下路每場都有補刀（≥ 5），且 ADC 最多", ["top", "mid", "adc"].every((r) => per[r].lastHits >= 5)
  && per.adc.lastHits > Math.max(per.top.lastHits, per.mid.lastHits),
  ["top", "mid", "adc"].map((r) => `${r} ${per[r].lastHits}`).join("、"));
ck("H3 輔助補刀明顯少於 ADC（不搶兵）", per.sup.lastHits * 3 <= per.adc.lastHits, `sup ${per.sup.lastHits} vs adc ${per.adc.lastHits}`);
ck("H4 打野以野區為主（補刀少於任何一條線）", per.jungle.lastHits < Math.min(per.top.lastHits, per.mid.lastHits, per.adc.lastHits),
  `jungle ${per.jungle.lastHits}`);

console.log("\n── M 小兵交戰 ──");
const fileRate = agg.fileOk / Math.max(1, agg.fileN);
ck("M1 ≥4 隻的兵群形成 ≥2 列（不是單一長隊）≥ 95% 取樣", fileRate >= 0.95, `${(fileRate * 100).toFixed(1)}%`);
const overlapRate = agg.overlaps / Math.max(1, agg.pairs);
ck("M2 同側小兵重疊（< 0.8 單位）≤ 2%", overlapRate <= 0.02, `${(overlapRate * 100).toFixed(2)}%（${agg.overlaps}/${agg.pairs}）`);
const meanShare = agg.allocShareSum / Math.max(1, agg.allocN);
ck("M3 火力分散：交戰中最大集火比例平均 ≤ 0.7", meanShare <= 0.7, `平均 ${meanShare.toFixed(2)}（${agg.allocN} 次取樣）`);
const allOnOne = agg.allOnOne / Math.max(1, agg.allocN);
ck("M4 「全員打同一隻」≤ 25% 取樣", allOnOne <= 0.25, `${(allOnOne * 100).toFixed(1)}%`);
ck("M5 即時換目標：沒有小兵連續 5 秒卡在已消失的目標", agg.staleTarget === 0, `${agg.staleTarget}`);
ck("M6 小兵會攻擊英雄（有傷害）", agg.minionHeroDmg > 0, `平均每人承受 ${Math.round(agg.minionHeroDmg / (SEEDS.length * 10))}`);
ck("M7 反擊：有小兵鎖定「剛攻擊我方英雄」的敵方英雄", agg.retaliate > 0, `${agg.retaliate}/${agg.heroTargetSamples} 次鎖英雄取樣`);

console.log("\n── W 波次 ──");
const siegeShare = agg.siegeSpawned / Math.max(1, agg.wavesSpawned);
ck("W1 攻城兵約每 3 波一次（25–40% 的波次）", siegeShare >= 0.25 && siegeShare <= 0.4, `${(siegeShare * 100).toFixed(1)}%`);
ck("W2 超級兵只出現在已破的路", agg.superWrongSide === 0, `${agg.superSeen} 次取樣、錯誤 ${agg.superWrongSide}`);
{
  const e = lastEngine;
  const base = e._waveModifiers("blue", "mid");
  e.waveBuffs = { blue: [{ until: e.t + 60, fightK: 1.5, siegeK: 2 }] };
  const buffed = e._waveModifiers("blue", "mid");
  const other = e._waveModifiers("red", "mid");
  e.waveBuffs = null;
  ck("W3 兵線強化接口：waveBuffs 只影響指定陣營", Math.abs(buffed.fightK - base.fightK * 1.5) < 1e-9 && Math.abs(buffed.siegeK - base.siegeK * 2) < 1e-9
    && other.fightK === e._waveModifiers("red", "mid").fightK);
}

console.log("\n── D 結束性與決定性 ──");
ck("D1 全部自然結束（無卡死）", agg.unfinished === 0, `${agg.finished}/${SEEDS.length}，最長 ${Math.max(...agg.durations).toFixed(1)} 分`);
ck("D2 建築有進展（20 分鐘平均倒塔 ≥ 4）", agg.towersAt20 / SEEDS.length >= 4, `${(agg.towersAt20 / SEEDS.length).toFixed(1)}`);
{
  const a = configure(3, "standard", M, 1).e, b = configure(3, "standard", M, 1).e;
  for (let i = 0; i < 1200; i++) { a.tick(DT); b.tick(DT); }
  const sig = (x) => JSON.stringify({ t: x.t, bK: x.bK, rK: x.rK, lanes: x._snapLane("mid"), hp: x.players.map((p) => Math.round(p.hp)) });
  ck("D3 同 seed 決定性（600 秒逐值相同）", sig(a) === sig(b));
}
ck("D4 舊規則集（v1／v2）沒有新規則鍵 ⇒ 走舊路徑", !MP.SIM_RULES.v1.cqMinionV1 && !MP.SIM_RULES.v2.cqMinionV1 && !MP.SIM_RULES.v2.cqHeroFarmV1);

console.log("\n── V 模擬版本 ──");
ck("V1 模擬版本 bump 到 moba-sim.v9，舊版本保留", SV.MOBA_SIMULATION_VERSION === "moba-sim.v9" && SV.KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v8"));
ck("V2 v8 的歷史重播明確拒絕（不靜默用新語意重算）", SV.canReplay("moba-sim.v8").ok === false);

if (!METRICS_ONLY) console.log(`\nMOBA Combat Quality v1：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail && !METRICS_ONLY ? 1 : 0);
