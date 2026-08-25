#!/usr/bin/env node
// ============================================================================
//  tools/foundation_calibration.mjs — Foundation Calibration 量測報告（不是 gate）
//
//  執行：repo 根目錄 `node tools/foundation_calibration.mjs`
//
//  ── 這支存在的理由 ────────────────────────────────────────────────────────
//  `check_foundation_calibration.mjs`（gate）只回答「有沒有踩線」，
//  但要**調**參數需要看形狀：Year 0–4 的曲線、來源分帳、流派對決、職業差距。
//  兩支共用 `tools/lib/careerSim.mjs` 的同一個模擬器 ⇒ gate 綠而報告難看
//  （或反過來）這種對不起來的情況不會發生。
//
//  ⚠ **本檔不是 gate**：沒有 exit 1，不進 CI，不改任何產品碼。
//  ⚠ 模擬器有已知簡化（見 careerSim.mjs 檔頭）：勝率固定、升級年底結算、
//    體力不含 streak 加乘。結論對「來源比例」與「關閉率」不敏感，
//    但**不可**拿這裡的絕對數字當存檔預期值。
// ============================================================================
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as sim from "./lib/careerSim.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const W = await sim.loadWorld(ROOT);
const r1 = sim.round1;
const pct = (v) => `${r1(v * 100)}%`;
const line = (s = "") => console.log(s);

line("══════════════════════════════════════════════════════════════════");
line("  ESMO Season vNext — Foundation Calibration 量測");
line(`  曲線 gamma=${W.space.POTENTIAL_SPACE.gamma}｜Training ${W.training.TRAINING_FORMULA_VERSION}`);
line(`  來源 base ${Object.entries(W.career.PCGM_PARAMS.sourceBase).map(([k, v]) => `${k}=${v}`).join(" ")}`);
line("══════════════════════════════════════════════════════════════════");

const pool = sim.prospectPool(W);
const ARCH = ["developmental", "standard", "readymade", "superstar"];
const ZH = { developmental: "養成型", standard: "一般新人", readymade: "即戰力", superstar: "超新星" };

// ── ① 根因量測：改動前的五個問題現在各長什麼樣 ─────────────────────────────
line("\n【① 根因量測】");
{
  const keys = pool.map((p) => p.potential - sim.mainAvgOf(W, p)).sort((a, b) => a - b);
  const q = (t) => r1(keys[Math.floor(keys.length * t)]);
  line(`  RC1 新秀主能力成長空間：p10=${q(0.1)} 中位=${q(0.5)} p90=${q(0.9)}（Training 參考值 ${W.space.POTENTIAL_SPACE.trainingRef}）`);
  const f = (room) => pct(W.space.potentialSpaceFactor(room, W.space.POTENTIAL_SPACE.trainingRef));
  line(`      入行當下的節流閥：${f(q(0.5))}（線性時只有 ${pct(Math.min(1, q(0.5) / 40))}）`);

  //  RC2：反覆上同一門課，看空間是不是真的會走完（而不是逼近）。
  const course = W.playerModel.courseById("tactics");
  const p = { age: 22, potential: 80, energy: 100, stats: { tacticalIQ: 60, decision: 60, learning: 70 } };
  let steps = 0;
  for (; steps < 500; steps++) {
    const res = W.training.calculateTrainingResult(p, course);
    if (!res.completed) break;
    for (const [k, ch] of Object.entries(res.statChanges)) p.stats[k] = ch.after;
    p.energy = 100;
    if (p.stats.tacticalIQ >= p.potential) break;
  }
  line(`  RC2 潛力漸近線（TD-33）：從 60 練到上限 80 需 ${steps + 1} 次課程 ⇒ ${p.stats.tacticalIQ >= 80 ? "有限時間收斂 ✅" : "仍未走完 ❌"}`);

  let xp = 0, lv = 1;
  const perYear = 7 * W.rewards.BASE_XP_WIN + 7 * W.rewards.BASE_XP_LOSS;
  const freq = [];
  for (let y = 1; y <= 6; y++) { xp += perYear; const n = W.playerLevel.levelFromTotalXp(xp); freq.push(n - lv); lv = n; }
  line(`  RC3 升級頻率（每年 14 場正式賽）：Y1–Y6 各升 ${freq.join(" / ")} 級 ⇒ 比賽這條路自己會枯掉`);

  const covered = new Set(W.playerModel.TRAINING_COURSES.flatMap((c) => c.stats ?? []));
  const missing = W.playerModel.STAT_DEF.map((s) => s.key).filter((k) => !covered.has(k));
  line(`  RC4 課程練不到的能力：${missing.length ? missing.join(", ") : "無 ✅"}`);
}

// ── ② Year 0–4 產品驗收 ────────────────────────────────────────────────────
line("\n【② Year 0–4 潛力空間關閉率（照定位排課、勝率 50%）】");
const careers = {};
for (const p of pool) (careers[p.archetype] ??= []).push(sim.simulateCareer(W, p, 4));
line("  原型          n    起始   空間     Y1      Y2      Y3      Y4");
for (const a of ARCH) {
  const cs = careers[a] ?? [];
  if (!cs.length) continue;
  const avg = (f) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
  line(`  ${ZH[a].padEnd(9)} ${String(cs.length).padStart(4)}  ${String(r1(avg((c) => c.startMain))).padStart(5)}  `
    + `${String(r1(avg((c) => c.space))).padStart(5)}  `
    + [0, 1, 2, 3].map((y) => pct(avg((c) => c.rows[y].closure)).padStart(6)).join("  "));
}
line("  產品目標：Y1 明顯成長可進輪換｜Y2 好新人成為穩定主力｜Y3–4 優秀人才接近成熟");

// ── ③ 成長來源分帳 ─────────────────────────────────────────────────────────
line("\n【③ 成長來源分帳（四年累計）】");
{
  const t = Object.values(careers).flat().reduce((s, c) => {
    s.training += c.total.training; s.official += c.total.official; s.competitive += c.total.competitive; return s;
  }, { training: 0, official: 0, competitive: 0 });
  const sum = t.training + t.official + t.competitive || 1;
  line(`  Training（訓練課程）      ${String(r1(t.training)).padStart(8)} 點   ${pct(t.training / sum)}`);
  line(`  正式季賽                  ${String(r1(t.official)).padStart(8)} 點   ${pct(t.official / sum)}`);
  line(`  一般／競技比賽            ${String(r1(t.competitive)).padStart(8)} 點   ${pct(t.competitive / sum)}   ← 這一列是「不主動去打」的基準`);
  line("  快速練習                         0 點        0%   ← 入口尚未實作（契約已就緒）");
  line(`  改動前的基準：訓練 85.1%／正式 14.9%（訓練 : 正式 ≈ 6 : 1）`);
}

// ── ④ 流派對決：刷比賽會不會變成最佳養成法 ─────────────────────────────────
line("\n【④ 流派對決（一般新人，四年後）】");
{
  const std = pool.filter((p) => p.archetype === "standard");
  const run = (label, opts) => {
    let closure = 0, played = 0;
    const t = { training: 0, official: 0, competitive: 0 };
    for (const p of std) {
      const c = sim.simulateCareer(W, p, 4, opts);
      closure += c.rows[3].closure; played += c.competitivePlayed / 4;
      for (const k of Object.keys(t)) t[k] += c.total[k];
    }
    const n = std.length, sum = (t.training + t.official + t.competitive) || 1;
    line(`  ${label.padEnd(14)} Y4 ${pct(closure / n).padStart(6)}   競技 ${String(r1(played / n)).padStart(4)} 場/年   `
      + `訓 ${pct(t.training / sum)}／正 ${pct(t.official / sum)}／競 ${pct(t.competitive / sum)}`);
  };
  run("認真訓練", {});
  run("訓練＋競技", { competitive: 30 });
  run("無腦連打", { competitive: 30, competitiveMinEnergy: 0 });
  run("純刷競技", { competitive: 200, trainRatio: 0, competitiveMinEnergy: 0 });
  line("  ⇒ 競技比賽的體力天花板約 21 場/年；base 1.0 時純刷明顯輸給認真訓練，");
  line("     base 1.5 時純刷會反超（實測 81% vs 75%）⇒ 1.0 是分界線，不是隨手填的中性值。");
  line("  ⚠ 「無腦連打」與「訓練＋競技」的差距不是倍率造成的，是**體力**：");
  line("     `conditionEfficiency` 用體力乘所有訓練成長，連打把體力打到 28 之後，");
  line("     接下來整年的訓練都在打折。這條防刷線本來就存在，比倍率更硬。");
  line("  ⚠⚠ 本輪最重要的**未解**發現：認真訓練的選手幾乎排不進競技賽（0.8 場/年）——");
  line("     訓練與比賽搶的是同一份資源（選手日 ＋ 體力），而訓練在純養成上贏。");
  line("     ⇒ 「競技比賽有實戰價值」目前**在成長面不成立**，它的價值是錢／粉絲／戰績。");
  line("     ⇒ 修法**不是**把 competitive 倍率調高（1.5 就會變成最佳刷法），");
  line("       而是體力經濟（出賽扣多少／每日恢復多少）。那會動到輪換與疲勞設計，");
  line("       不在本輪範圍——列為後續議題，見 ⑦。");
}

// ── ⑤ 職業公平 ─────────────────────────────────────────────────────────────
line("\n【⑤ 職業公平（四年絕對主能力成長點數；不用關閉率，那會被空間大小干擾）】");
{
  const covered = new Set(W.playerModel.TRAINING_COURSES.flatMap((c) => c.stats ?? []));
  const byRole = {};
  for (const p of pool) {
    const c = sim.simulateCareer(W, p, 4);
    (byRole[p.role] ??= []).push({ gain: c.rows[3].mainAvg - c.startMain, closure: c.rows[3].closure, space: c.space });
  }
  const rows = Object.entries(byRole).map(([role, v]) => {
    const keys = W.levelGrowth.growthKeysFor({ role }) ?? [];
    const avg = (f) => v.reduce((s, x) => s + f(x), 0) / v.length;
    return { role, n: v.length, gain: r1(avg((x) => x.gain)), closure: avg((x) => x.closure), space: r1(avg((x) => x.space)),
      cov: `${keys.filter((k) => covered.has(k)).length}/${keys.length || 5}` };
  }).sort((a, b) => a.gain - b.gain);
  line("  定位    n    四年成長   空間    關閉率   課程覆蓋");
  for (const x of rows) {
    line(`  ${x.role.padEnd(5)} ${String(x.n).padStart(4)}   ${String(x.gain).padStart(6)}   ${String(x.space).padStart(5)}   ${pct(x.closure).padStart(6)}   ${x.cov}`);
  }
  line(`  ⇒ 最差 / 最佳 = ${pct(rows[0].gain / rows.at(-1).gain)}`);
  line("  ⚠ 關閉率的排序會與成長點數不同，那是**指標**造成的，不是不公平：");
  line("     空間小的定位（輔助）天生容易關閉，空間大的定位（上路）絕對成長反而最多。");
}

// ── ⑥ 年齡 / learning / potential 的差異是否仍看得見 ───────────────────────
line("\n【⑥ 差異度（合成選手，只變動一個變數）】");
{
  const c4 = (o) => sim.simulateCareer(W, sim.syntheticPlayer(W, o), 8);
  line("  年齡      Y1      Y2      Y4      Y8     ｜ 年齡係數");
  for (const age of [17, 20, 24, 28, 31, 34, 37]) {
    const c = c4({ age });
    line(`  ${String(age).padStart(4)}   ` + [0, 1, 3, 7].map((y) => pct(c.rows[y].closure).padStart(6)).join("  ")
      + `　｜ ${W.training.ageEfficiency(age)}`);
  }
  line("\n  learning   Y1      Y4     ｜ 學習係數");
  for (const L of [25, 45, 65, 85, 95]) {
    const c = c4({ learning: L });
    line(`  ${String(L).padStart(6)}   ` + [0, 3].map((y) => pct(c.rows[y].closure).padStart(6)).join("  ")
      + `　｜ ${W.training.learningEfficiency(L)}`);
  }
  line("\n  潛力（起始 45）  空間   Y2      Y4      Y8     ｜ Y8 主能力");
  for (const pot of [60, 75, 90, 96]) {
    const c = c4({ potential: pot, start: 45 });
    line(`  ${String(pot).padStart(10)}   ${String(pot - 45).padStart(5)}  `
      + [1, 3, 7].map((y) => pct(c.rows[y].closure).padStart(6)).join("  ") + `　｜ ${c.rows[7].mainAvg}`);
  }
  line("  ⇒ 潛力決定**能長多少**（絕對值分得很開）；年齡與 learning 決定**多快長完**。");
}

// ── ⑦ 仍未解決 ─────────────────────────────────────────────────────────────
line("\n【⑦ 本輪未解決（不是遺漏，是刻意留給後續）】");
line("  · 老將長期仍能磨到上限：本輪只把 34 歲的成長效率壓到 20 歲的 29%，");
line("    但沒有 aging / decline / retirement ⇒ 玩家仍可長期持有老將慢慢練。");
line("    根本解法是 Season vNext V1，不是再把年齡係數調更陡。");
line("  · 快速練習沒有 explicit origin：目前 practice 只是「拿不到來源」的退路，");
line("    所以它的倍率必須維持中性（TD-36）。");
line("  · 訓練仍是最大宗（約 78%）。那是產品定位（Training = 穩定培養），");
line("    不是失衡——但如果之後要再降，槓桿是課程頻率／體力成本，不是把訓練成長調小。");
line("  · **競技比賽在成長面幾乎進不了場**（認真訓練的選手 0.8 場/年）：");
line("    訓練與比賽搶同一份選手日與體力。這是體力經濟的問題，不是倍率的問題——");
line("    倍率調高會直接做出刷分最佳解。要讓「打比賽也能練人」成立，");
line("    需要重新設計出賽體力成本／恢復速率，會連動輪換與疲勞，屬另一輪。");

line("\n══════════════════════════════════════════════════════════════════");
line("  ⚠ 本檔不是 gate。判定請跑 `node tools/check_foundation_calibration.mjs`。");
line("══════════════════════════════════════════════════════════════════");
