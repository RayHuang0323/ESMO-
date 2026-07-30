#!/usr/bin/env node
// ============================================================================
//  tools/measure_moba_pacing.mjs — 戰鬥節奏與「團戰收益轉化」量測儀器
//
//  Milestone F 的問題陳述（S28 技術債 2）是：「打贏團戰不會轉化成推進收益」。
//  在動任何權重之前，得先有**數字**能證明它、也能證明改完之後真的變好。
//  本工具只讀引擎狀態、不改任何行為，可在任意 commit 上跑出可比較的基準。
//
//  量測項（每場）：
//    · 收尾時間 / 擊殺 / 破塔 / 勝方
//    · 團戰窗：以引擎自己的 `hot3`（v3 交戰熱點）為準，記錄每一段的起訖、
//      參與人數、雙方陣亡數 ⇒ 得到「誰贏了這場團戰」
//    · **轉化率**：團戰結束後 CONV_WINDOW 模擬秒內，勝方是否取得
//      推塔 / 龍 / 巴龍 / 敵方野區營地 其中之一
//    · 零碎碰撞：持續 < SKIRMISH_T 秒且無人陣亡的團戰窗佔比
//    · 空轉：所有人都不在交戰／目標／推塔狀態的 tick 佔比
//
//  用法：
//    node tools/measure_moba_pacing.mjs                 # 20 seeds
//    node tools/measure_moba_pacing.mjs --seeds 40
//    node tools/measure_moba_pacing.mjs --reverse       # 反轉 players 陣列（順序公平性）
//    node tools/measure_moba_pacing.mjs --json out.json
// ============================================================================
import { writeFileSync } from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEngineHeroMods } from "../src/battle/moba/mobaHeroProfile.js";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEEDS = Math.max(1, Number(arg("--seeds", "20")) || 20);
const REVERSE = process.argv.includes("--reverse");
const OUT = arg("--json", "");
//  Milestone H：--heroes 會把「英雄定位 → 行為」注入引擎，用來量它對節奏與
//  勝率分布的影響。定位表以純資料傳入，本工具不 import heroDatabase（396KB data URI）。
const HEROES = process.argv.includes("--heroes");
const ARCH = {
  b1: "坦克", b2: "刺客", b3: "法師", b4: "射手", b5: "輔助",
  r1: "戰士", r2: "戰士", r3: "法師", r4: "射手", r5: "坦克",
};
const heroRoster = Object.fromEntries(Object.entries(ARCH).map(([seat, arch]) => [seat, { heroId: seat, hero: { id: seat, arch } }]));
const DT = 0.5;
const MAX_T = 3600;
const CONV_WINDOW = 25;      // 團戰結束後多久內算「轉化成功」（模擬秒）
const SKIRMISH_T = 3;        // 短於這個秒數且零陣亡 ⇒ 視為零碎碰撞

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r2 = (v) => Math.round(v * 100) / 100;

function towerDeadCount(eng, side) {
  return Object.values(eng.towers)
    .filter((t) => t.side === side && t.lane !== "nexus" && t.hp <= 0).length;
}

function runMatch(seed) {
  const eng = new LogicEngine(seed, null, { rules: "v3" });
  if (HEROES) {
    const mods = toEngineHeroMods(heroRoster, null);
    if (mods) eng.configureHeroes(mods);
  }
  if (REVERSE) eng.players.reverse();

  const fights = [];          // { start, end, dur, size, deaths:{blue,red}, winner, converted, convBy }
  let cur = null;
  // 事件流：破塔 / 中立目標擊殺（含營地）——用來判斷「轉化」
  const gains = [];           // { t, side, kind }
  const opportunities = [];   // { t, side, pos }：擊殺當下對方有現場人數優勢的時刻
  const recalls = [];         // { t, side }：回城（也是正當的戰果運用）
  const purpose = [];         // { t, side, idle, total }：逐 tick 的「有沒有在做事」
  let recallSeen = 0;
  //  有目的的狀態＝推進／目標／交戰／回城；純「對線／游走」視為未轉化的遊走。
  const IDLE_STATES = new Set(["對線", "游走"]);
  let twDead = { blue: towerDeadCount(eng, "blue"), red: towerDeadCount(eng, "red") };
  const objAlive = new Map();
  const deathsSeen = new Map(eng.players.map((p) => [p.id, p.d]));

  while (!eng.over && eng.t < MAX_T) {
    eng.tick(DT);
    const t = eng.t;

    // ── 破塔（塔的 side = 被拆的一方 ⇒ 收益歸另一方）────────────────────
    for (const side of ["blue", "red"]) {
      const n = towerDeadCount(eng, side);
      if (n > twDead[side]) {
        for (let i = 0; i < n - twDead[side]; i++) {
          gains.push({ t, side: side === "blue" ? "red" : "blue", kind: "tower" });
        }
        twDead[side] = n;
      }
    }
    // ── 中立目標（龍／巴龍／野區營地）────────────────────────────────────
    for (const o of eng.neutrals?.list ?? []) {
      const was = objAlive.get(o.id);
      if (was === undefined) { objAlive.set(o.id, o.alive); continue; }
      if (was && !o.alive) {
        const kind = o.type === "dragon" || o.type === "baron" ? o.type
          : (o.side && o.side !== "neutral" ? "camp" : "camp");
        if (o.killerTeam) gains.push({ t, side: o.killerTeam, kind });
      }
      objAlive.set(o.id, o.alive);
    }

    // ── 回城事件（引擎既有的 recallLog）──────────────────────────────────
    for (const e of (eng.recallLog ?? []).slice(recallSeen)) {
      if (e.phase === "start") recalls.push({ t: e.t, side: e.side });
    }
    recallSeen = (eng.recallLog ?? []).length;
    // ── 逐 tick 的「有沒有在做事」（分側統計）──────────────────────────────
    for (const side of ["blue", "red"]) {
      const mine = eng.players.filter((p) => p.side === side && !p.dead);
      if (!mine.length) continue;
      purpose.push({
        t, side,
        idle: mine.filter((p) => IDLE_STATES.has(p.state)).length,
        total: mine.length,
      });
    }

    // ── 團戰窗（以引擎自己的熱點為準）────────────────────────────────────
    const hot = eng.hot3?.pos ?? null;
    if (hot && !cur) {
      cur = { start: t, deaths: { blue: 0, red: 0 }, size: 0, pos: { ...hot } };
    }
    if (cur) {
      const near = eng.players.filter((p) => !p.dead && dist2(p.pos, cur.pos) < 18 * 18);
      cur.size = Math.max(cur.size, near.length);
      cur.pos = hot ?? cur.pos;
    }
    // 本 tick 的陣亡（比對每人的死亡累計）
    for (const p of eng.players) {
      const prev = deathsSeen.get(p.id) ?? 0;
      if (p.d > prev) {
        if (cur) cur.deaths[p.side] += p.d - prev;
        deathsSeen.set(p.id, p.d);
        // ── 「打贏一波」的機會事件（由本工具自己判定，與引擎實作無關）──────
        //  死者倒下的當下，若對方在現場有存活人數優勢，那就是一個**應該**
        //  被換成地圖收益的時刻。這個定義同時涵蓋團戰與抓單，
        //  所以 baseline（沒有主動權窗）與 Milestone F 是同一把尺。
        const winSide = p.side === "blue" ? "red" : "blue";
        const near = (q, d) => dist2(q.pos, p.pos) < d * d;
        const allies = eng.players.filter((q) => q.side === winSide && !q.dead && near(q, 25));
        const foes = eng.players.filter((q) => q.side === p.side && !q.dead && near(q, 18));
        if (allies.length >= 2 && allies.length > foes.length) {
          opportunities.push({ t, side: winSide, pos: { x: p.pos.x, y: p.pos.y } });
        }
      }
    }
    if (!hot && cur) {
      cur.end = t;
      cur.dur = r2(cur.end - cur.start);
      const db = cur.deaths.blue, dr = cur.deaths.red;
      cur.winner = db === dr ? null : (db < dr ? "blue" : "red");
      cur.totalDeaths = db + dr;
      fights.push(cur);
      cur = null;
    }
  }
  if (cur) { cur.end = eng.t; cur.dur = r2(cur.end - cur.start); cur.winner = null; cur.totalDeaths = cur.deaths.blue + cur.deaths.red; fights.push(cur); }

  // ── 轉化判定：團戰結束後 CONV_WINDOW 秒內，勝方是否取得推塔／龍／巴龍／營地 ──
  for (const f of fights) {
    if (!f.winner) { f.converted = null; continue; }
    const g = gains.find((x) => x.side === f.winner && x.t > f.end && x.t <= f.end + CONV_WINDOW);
    f.converted = !!g;
    f.convBy = g?.kind ?? null;
  }

  // ── 機會事件的轉化（★ Milestone F 的主指標）────────────────────────────
  //  同一時間點附近的多次擊殺會產生多個機會事件；用 8 秒去重，避免一波團戰
  //  被灌成五個機會而稀釋分母。
  const dedupOpp = [];
  for (const o of opportunities) {
    const last = dedupOpp[dedupOpp.length - 1];
    if (last && last.side === o.side && o.t - last.t <= 8) continue;
    dedupOpp.push(o);
  }
  //  「轉化」的定義照任務目標寫：推塔／龍／巴龍／野區入侵／**回城補給**都算，
  //  唯一不算的是「什麼都沒做地繼續遊走」。回城是正當選擇，不該被算成失敗。
  for (const o of dedupOpp) {
    const g = gains.find((x) => x.side === o.side && x.t > o.t && x.t <= o.t + CONV_WINDOW);
    const rec = recalls.find((x) => x.side === o.side && x.t > o.t && x.t <= o.t + CONV_WINDOW);
    o.converted = !!(g || rec);
    o.hard = !!g;               // 硬收益（塔／龍／巴龍／野區）——回城不算
    o.by = g?.kind ?? (rec ? "recall" : null);
    //  無目的遊走：窗內勝方的 hero-tick 有多少落在「純對線／遊走」而非
    //  推進／目標／回城／交戰上。
    const w = purpose.filter((s) => s.side === o.side && s.t > o.t && s.t <= o.t + CONV_WINDOW);
    const total = w.reduce((s, x) => s + x.total, 0);
    o.idleRate = total ? r2(w.reduce((s, x) => s + x.idle, 0) / total) : null;
  }
  const oppConverted = dedupOpp.filter((o) => o.converted).length;
  const idleRates = dedupOpp.map((o) => o.idleRate).filter((v) => v != null);

  const decisive = fights.filter((f) => f.winner);
  const skirmish = fights.filter((f) => f.dur < SKIRMISH_T && f.totalDeaths === 0);
  return {
    opportunities: dedupOpp.length,
    oppConverted,
    oppConversionRate: dedupOpp.length ? r2(oppConverted / dedupOpp.length) : 0,
    oppHardRate: dedupOpp.length ? r2(dedupOpp.filter((o) => o.hard).length / dedupOpp.length) : 0,
    oppIdleRate: idleRates.length ? r2(mean(idleRates)) : 0,
    oppKinds: dedupOpp.filter((o) => o.converted)
      .reduce((m, o) => ({ ...m, [o.by]: (m[o.by] ?? 0) + 1 }), {}),
    seed,
    winner: eng.winner,
    minutes: r2(eng.t / 60),
    kills: { blue: eng.bK, red: eng.rK },
    towers: { blue: towerDeadCount(eng, "red"), red: towerDeadCount(eng, "blue") },  // 拆掉對方幾座
    fights: fights.length,
    decisiveFights: decisive.length,
    convertedFights: decisive.filter((f) => f.converted).length,
    conversionRate: decisive.length ? r2(decisive.filter((f) => f.converted).length / decisive.length) : 0,
    convKinds: decisive.filter((f) => f.converted).reduce((m, f) => ({ ...m, [f.convBy]: (m[f.convBy] ?? 0) + 1 }), {}),
    skirmishRate: fights.length ? r2(skirmish.length / fights.length) : 0,
    avgFightDur: r2(mean(fights.map((f) => f.dur))),
    medFightDur: r2(median(fights.map((f) => f.dur))),
    avgFightSize: r2(mean(fights.map((f) => f.size))),
    bigFights: fights.filter((f) => f.size >= 6).length,
    objectives: gains.filter((g) => g.kind === "dragon" || g.kind === "baron").length,
  };
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const rows = [];
for (let i = 0; i < SEEDS; i++) rows.push(runMatch(1000 + i * 137));

const blueWins = rows.filter((r) => r.winner === "blue").length;
const summary = {
  seeds: SEEDS,
  reversed: REVERSE,
  blueWinRate: r2(blueWins / SEEDS),
  blueWins, redWins: rows.filter((r) => r.winner === "red").length,
  unfinished: rows.filter((r) => !r.winner).length,
  avgMinutes: r2(mean(rows.map((r) => r.minutes))),
  medMinutes: r2(median(rows.map((r) => r.minutes))),
  avgKills: r2(mean(rows.map((r) => r.kills.blue + r.kills.red))),
  avgTowers: r2(mean(rows.map((r) => r.towers.blue + r.towers.red))),
  avgFights: r2(mean(rows.map((r) => r.fights))),
  avgDecisive: r2(mean(rows.map((r) => r.decisiveFights))),
  //  ★ Milestone F 的核心指標：打贏一波（團戰或抓單）之後，多常真的換成地圖收益。
  //    分母由本工具自己判定（擊殺當下對方有現場人數優勢），與引擎實作無關
  //    ⇒ baseline 與 F 用同一把尺。
  oppConversionRate: r2(mean(rows.map((r) => r.oppConversionRate))),
  avgOpportunities: r2(mean(rows.map((r) => r.opportunities))),
  //  硬收益轉化（塔／龍／巴龍／野區；不含回城）——這一項才有鑑別力
  oppHardRate: r2(mean(rows.map((r) => r.oppHardRate))),
  //  「無目的遊走」：打贏一波之後的 25 秒內，勝方有多少 hero-tick 只是在對線／游走
  oppIdleRate: r2(mean(rows.map((r) => r.oppIdleRate))),
  //  舊指標（只看熱點型決勝團戰）保留，方便與 E baseline 的紀錄對照
  conversionRate: r2(mean(rows.map((r) => r.conversionRate))),
  skirmishRate: r2(mean(rows.map((r) => r.skirmishRate))),
  avgFightDur: r2(mean(rows.map((r) => r.avgFightDur))),
  medFightDur: r2(median(rows.map((r) => r.medFightDur))),
  avgFightSize: r2(mean(rows.map((r) => r.avgFightSize))),
  avgBigFights: r2(mean(rows.map((r) => r.bigFights))),
  avgObjectives: r2(mean(rows.map((r) => r.objectives))),
};

console.log(JSON.stringify(summary, null, 2));
console.log("\nseed      分  勝  殺  塔  團戰 決勝 轉化  零碎  平均秒 規模");
for (const r of rows) {
  console.log(
    String(r.seed).padEnd(9),
    String(r.minutes).padStart(5),
    (r.winner ?? "—").padStart(4),
    String(r.kills.blue + r.kills.red).padStart(4),
    String(r.towers.blue + r.towers.red).padStart(4),
    String(r.fights).padStart(4),
    String(r.decisiveFights).padStart(4),
    String(r.conversionRate).padStart(5),
    String(r.skirmishRate).padStart(5),
    String(r.avgFightDur).padStart(6),
    String(r.avgFightSize).padStart(5),
  );
}
if (OUT) { writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2)); console.log(`\n→ ${OUT}`); }
