#!/usr/bin/env node
// ============================================================================
//  tools/check_foundation_calibration.mjs — Season vNext Foundation Calibration
//
//  執行：repo 根目錄 `node tools/check_foundation_calibration.mjs`；失敗 exit 1。
//
//  ── 這一輪要解決什麼 ─────────────────────────────────────────────────────
//  V0A（成長認年齡）／V0B（新秀有成長空間）／V0C（分得出比賽來源）都完成之後，
//  實測仍然是：**優質新人到 Year 3–4 還沒接近成熟**，而且成長 85% 來自訓練。
//  Audit 找到五個彼此獨立的原因（每一個都有對應的 §）：
//
//   RC1 §C 除數與真實空間不匹配
//       training 把剩餘空間除以 40、levelGrowth 除以 25，
//       但 V0B 之後新秀的主能力空間中位數只有 **17.4 點**
//       ⇒ 節流閥從入行第一天就只開到 43%，而且只會再往下掉。
//   RC2 §C 線性收斂 = 指數逼近
//       成長量正比於剩餘空間 ⇒ 每多關 10% 潛力所需努力持續放大
//       （實測 10%→3 步、90%→57 步）。尾巴是漸近線，**永遠走不完**。這就是 TD-33。
//   RC3 §O 升級頻率隨等級衰減
//       比賽成長掛在升級上，而 `xpRequiredForLevel` 隨等級線性增加
//       ⇒ 第 1 年升 3 級，第 8 年升不到 1 級。比賽這條路自己會枯掉。
//   RC4 §P 三項能力**完全練不到**
//       `courage` / `resilience` / `leadership` 不在任何課程裡。
//       上路的定位權重有 **46.7%（w4+w3）** 落在練不到的能力上。
//   RC5 §C 收斂系統會抹平「速率差」
//       年齡與 learning 只乘在成長**速率**上。當所有人終究都會逼近自己的上限，
//       速率差在 4 年尺度上被壓成 6pp（age 17 vs 36）與 4pp（learning 25 vs 95）。
//
//  ── 這一輪改了什麼（每一項都對應上面一個 RC）─────────────────────────────
//   ① §C `potentialSpace.js`：把「剩餘空間 → 係數」抽成**兩條路徑共用的一份定義**，
//      並把形狀從線性改成 `(room/ref)^gamma`（gamma = 0.6 < 1）。
//      gamma < 1 不只是「比較慢才減速」——`dr/dt ∝ r^0.6` 是**有限時間收斂**，
//      數學上會真的走完，所以 TD-33 不需要靠一個平坦的最低成長值蓋掉。
//   ② §S `sourceBase.official = 3.0`：正式季賽的場次由賽程決定（14 場，刷不了），
//      所以可以放心加重；competitive 維持 1.0（玩家自己排隊，能刷）。
//   ③ §A 年齡曲線陡峭化：29 歲以後快速下滑（電競生涯本來就短）。
//      **20–28 歲幾乎不動**（實測 age 24 前後都是 1.04）⇒ 既有陣容不會被打殘。
//   ④ §L learning 幅度加寬：0.90–1.10 → 0.80–1.22。
//   ⑤ §P 新增「心志鍛鍊」課程，補上三項練不到的能力。
//
//  ⚠ **本輪刻意不做**：Career Clock、年齡 +1、衰退、退休、快速練習 UI、
//    Ranked、真人連線。老將「磨到上限」只被壓到 §A3 的程度——真正的解法是
//    aging / decline（V1），不是這裡。
//
//  §C 潛力空間曲線  §S 來源倍率  §A 年齡  §L learning  §P 課程覆蓋
//  §Y Year 0–4 產品驗收  §X 防刷  §F 既有契約不變  §M mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const r1 = (v) => Math.round(v * 10) / 10;

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};

const P_SPACE = "src/platform/progress/potentialSpace.js";
const P_TRAIN = "src/data/trainingCalculator.js";
const P_LEVEL = "src/platform/progress/levelGrowth.js";
const P_CAREER = "src/platform/progress/careerGrowth.js";
const P_MODEL = "src/data/playerModel.js";

let space = null;
try { space = await imp(P_SPACE); } catch { /* 實作之前不存在 ⇒ 照實報紅 */ }
const training = await imp(P_TRAIN);
const levelGrowth = await imp(P_LEVEL);
const career = await imp(P_CAREER);
const playerModel = await imp(P_MODEL);

// ════════════════════════════════════════════════════════════════════════════
//  §C 潛力空間曲線：RC1 + RC2 + RC5
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 潛力空間曲線（RC1 除數不匹配／RC2 漸近線）】");

ck("C1) potentialSpace.js 存在且匯出曲線與參數",
  !!space?.potentialSpaceFactor && !!space?.POTENTIAL_SPACE,
  space ? `gamma=${space.POTENTIAL_SPACE?.gamma}` : "模組不存在");

ck("C2) 它是 leaf：沒有任何 import（不得經由它把 PCGM 拉進 trainingCalculator）",
  (() => { try { return !/^\s*import\s/m.test(read(P_SPACE)); } catch { return false; } })());

ck("C3) 邊界正確：room ≤ 0 ⇒ 0；room ≥ ref ⇒ 1",
  !!space && space.potentialSpaceFactor(0, 40) === 0 && space.potentialSpaceFactor(-5, 40) === 0
  && space.potentialSpaceFactor(40, 40) === 1 && space.potentialSpaceFactor(99, 40) === 1);

ck("C4) 單調遞增：剩餘空間越多，係數越大",
  (() => {
    if (!space) return false;
    let prev = -1;
    for (let room = 0; room <= 40; room += 0.5) {
      const v = space.potentialSpaceFactor(room, 40);
      if (v < prev) return false;
      prev = v;
    }
    return true;
  })());

ck("C5) gamma < 1 ⇒ 比線性更晚減速（RC2 的形狀修正）",
  !!space && space.POTENTIAL_SPACE.gamma > 0 && space.POTENTIAL_SPACE.gamma < 1,
  space ? `gamma=${space.POTENTIAL_SPACE.gamma}` : "");

//  RC1：入行第一天的節流閥。V0B 之後主能力空間中位數約 17 點，
//  線性除以 40 只開到 43%；gamma 修正後必須明顯打開。
ck("C6) 中位新秀（剩餘 17.4 點）的起始係數 > 60%（線性只有 43.5%）",
  (() => {
    if (!space) return false;
    return space.potentialSpaceFactor(17.4, 40) > 0.60;
  })(),
  space ? `${r1(space.potentialSpaceFactor(17.4, 40) * 100)}%（線性 43.5%）` : "");

//  RC2：這是 TD-33 的真正判準。線性收斂永遠到不了；gamma < 1 是有限時間收斂。
//  用**真的 calculateTrainingResult** 反覆上課，看剩餘空間會不會歸零。
ck("C7) TD-33：反覆上課會真的把潛力空間走完（不是漸近線）",
  (() => {
    const course = playerModel.TRAINING_COURSES.find((c) => c.id === "tactics");
    const p = { age: 22, potential: 80, energy: 100, stats: { tacticalIQ: 60, decision: 60, learning: 70 } };
    for (let i = 0; i < 400; i++) {
      const res = training.calculateTrainingResult(p, course);
      if (!res.completed) break;
      for (const [k, ch] of Object.entries(res.statChanges)) p.stats[k] = ch.after;
      p.energy = 100;                                   // 只測曲線，不測體力
      if (p.stats.tacticalIQ >= p.potential) return true;
    }
    return false;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §S 來源倍率：RC3 的產品面解法
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 來源倍率】");
const SB = career.PCGM_PARAMS?.sourceBase ?? {};

ck("S1) 四個來源都有 base（契約完整）",
  ["training", "practice", "competitive", "official"].every((k) => Number.isFinite(SB[k])),
  Object.entries(SB).map(([k, v]) => `${k}=${v}`).join(" "));

ck("S2) 正式季賽 > 競技比賽（場次由賽程決定，刷不了 ⇒ 可以放心加重）",
  SB.official > SB.competitive, `official=${SB.official} competitive=${SB.competitive}`);

ck("S3) 競技比賽維持 1.0：玩家自己排隊能刷，倍率不得高於訓練",
  SB.competitive === 1.0 && SB.competitive <= SB.training);

//  ⚠ 這一條不是「還沒調」。快速練習**入口尚未實作**，
//    目前唯一會落到 practice 的是「交易單沒帶 origin」（舊存檔／debug harness）。
//    現在把 practice 調低 = 把**資料遺失**變成一個看不見的成長懲罰。
//    真正該有 explicit practice origin 之後才能分開，見 TD-36。
ck("S4) practice 仍等於 competitive：目前它是『拿不到來源』的退路，不是產品模式",
  SB.practice === SB.competitive,
  `practice=${SB.practice} —— 快速練習有 explicit origin 之前不得調低（TD-36）`);

ck("S5) careerGrowthFactor 真的把 source base 乘進去",
  (() => {
    const p = { age: 24, stats: { learning: 70 } };
    const o = career.careerGrowthFactor({ source: "official", player: p });
    const c = career.careerGrowthFactor({ source: "competitive", player: p });
    return r1(o / c * 100) === r1(SB.official / SB.competitive * 100);
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §A 年齡：RC5，速率差必須在多年尺度上仍然看得見
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 年齡曲線】");
const ageF = training.ageEfficiency;

ck("A1) 單調不遞增（年紀越大不會突然變好練）",
  (() => { let prev = Infinity; for (let a = 15; a <= 45; a++) { const v = ageF(a); if (v > prev + 1e-9) return false; prev = v; } return true; })());

ck("A2) 20–28 歲幾乎不動：既有陣容（種子與 AI 隊多在 21–26）不被打殘",
  [20, 22, 24, 26, 28].every((a) => Math.abs(ageF(a) - 1.0) <= 0.11),
  [20, 22, 24, 26, 28].map((a) => `${a}:${ageF(a)}`).join(" "));

ck("A3) 34 歲的成長效率不到 20 歲的一半（老將不能輕易磨到上限）",
  ageF(34) < ageF(20) * 0.5, `34歲 ${ageF(34)} vs 20歲 ${ageF(20)}`);

ck("A4) 有下限，不會變成 0 或負數（不是退休、不是衰退）",
  ageF(45) > 0 && ageF(60) > 0, `45歲 ${ageF(45)}`);

ck("A5) 缺 age 的舊存檔仍回中性 1（不得因本輪改動而變慢）",
  ageF(undefined) === 1 && ageF(null) === 1 && ageF(0) === 1);

// ════════════════════════════════════════════════════════════════════════════
//  §L learning
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§L 學習能力】");
const lrnF = training.learningEfficiency;

ck("L1) 高低 learning 的差距 ≥ 1.4×（原本只有 1.22×，四年後被壓成 4pp）",
  lrnF(95) / lrnF(25) >= 1.4, `95:${lrnF(95)} / 25:${lrnF(25)} = ${r1(lrnF(95) / lrnF(25) * 100) / 100}×`);

ck("L2) 仍然有界，不會變成 2–3 倍成長差",
  lrnF(99) <= 1.3 && lrnF(1) >= 0.7);

ck("L3) 缺 learning 的舊存檔回中性附近（不得被當成最低學習能力）",
  lrnF(undefined) >= 0.95 && lrnF(undefined) <= 1.05, `undefined ⇒ ${lrnF(undefined)}`);

// ════════════════════════════════════════════════════════════════════════════
//  §P 課程覆蓋：RC4
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 訓練課程覆蓋（RC4）】");
const covered = new Set(playerModel.TRAINING_COURSES.flatMap((c) => c.stats ?? []));

ck("P1) courage / resilience / leadership 現在練得到",
  ["courage", "resilience", "leadership"].every((k) => covered.has(k)),
  ["courage", "resilience", "leadership"].filter((k) => !covered.has(k)).join(",") || "三項都有課程");

ck("P2) 每個定位的 5 項主能力都至少有一門課練得到（不再有 46.7% 權重練不到的定位）",
  (() => {
    for (const [id, prof] of Object.entries(playerModel.POSITION_PROFILE)) {
      const keys = prof.key ?? [];
      if (keys.some((k) => !covered.has(k))) return false;
    }
    return true;
  })(),
  (() => {
    const bad = Object.entries(playerModel.POSITION_PROFILE)
      .map(([id, prof]) => [id, (prof.key ?? []).filter((k) => !covered.has(k))])
      .filter(([, m]) => m.length);
    return bad.length ? bad.map(([id, m]) => `${id}缺${m.join("/")}`).join(" ") : "10 個定位全覆蓋";
  })());

//  新課程不得變成「排它就對了」的壓倒性最佳解——用每小時能力產出比較，
//  最高的一門不得明顯拋開第二名。
ck("P3) 沒有任何課程的『每小時能力產出』超過第二名的 1.15 倍",
  (() => {
    const rate = (c) => (c.gain * (c.stats?.length ?? 0)) / Math.max(1, c.hours);
    const all = playerModel.TRAINING_COURSES.filter((c) => c.id !== "rest").map(rate).sort((a, b) => b - a);
    return all[0] <= all[1] * 1.15;
  })(),
  playerModel.TRAINING_COURSES.filter((c) => c.id !== "rest")
    .map((c) => `${c.id}:${r1((c.gain * c.stats.length) / Math.max(1, c.hours))}`).join(" "));

// ════════════════════════════════════════════════════════════════════════════
//  §Y 產品驗收：Year 0–4 的體感
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Y Year 0–4 產品驗收（大樣本新秀池）】");
const sim = await imp("tools/lib/careerSim.mjs");
const W = await sim.loadWorld(ROOT);
const pool = sim.prospectPool(W);
const byArch = {};
for (const p of pool) (byArch[p.archetype] ??= []).push(sim.simulateCareer(W, p, 4));
const closureAt = (arch, y) => {
  const cs = byArch[arch] ?? [];
  return cs.length ? cs.reduce((s, c) => s + c.rows[y - 1].closure, 0) / cs.length : 0;
};

ck("Y0) 四種原型都抽得到（樣本足夠）",
  ["developmental", "standard", "readymade", "superstar"].every((a) => (byArch[a] ?? []).length >= 10),
  Object.entries(byArch).map(([a, c]) => `${a}:${c.length}`).join(" "));

ck("Y1) 一般新人 Year 1 明顯成長（關閉 ≥ 35%，原本 20.4%）",
  closureAt("standard", 1) >= 0.35, `${r1(closureAt("standard", 1) * 100)}%`);

ck("Y2) 一般新人 Year 2 已是穩定主力（關閉 ≥ 50%，原本 29.6%）",
  closureAt("standard", 2) >= 0.50, `${r1(closureAt("standard", 2) * 100)}%`);

ck("Y3) 一般新人 Year 4 接近成熟（關閉 ≥ 70%，原本 42.4%）",
  closureAt("standard", 4) >= 0.70, `${r1(closureAt("standard", 4) * 100)}%`);

ck("Y4) 即戰力 Year 4 最接近上限（本來就沒剩多少空間）",
  closureAt("readymade", 4) >= 0.78, `${r1(closureAt("readymade", 4) * 100)}%`);

ck("Y5) 養成型 Year 4 仍未走完：空間大的人本來就該慢（不是所有人同一條曲線）",
  closureAt("developmental", 4) < closureAt("readymade", 4) - 0.08,
  `養成型 ${r1(closureAt("developmental", 4) * 100)}% vs 即戰力 ${r1(closureAt("readymade", 4) * 100)}%`);

ck("Y6) 但養成型 Year 4 也已過半（不能等到第 8 年才有用）",
  closureAt("developmental", 4) >= 0.60, `${r1(closureAt("developmental", 4) * 100)}%`);

ck("Y7) 四種原型的 Year 4 沒有被校準成同一條曲線（最大最小相差 ≥ 10pp）",
  (() => {
    const v = ["developmental", "standard", "readymade", "superstar"].map((a) => closureAt(a, 4));
    return Math.max(...v) - Math.min(...v) >= 0.10;
  })(),
  ["developmental", "standard", "readymade", "superstar"].map((a) => `${a}:${r1(closureAt(a, 4) * 100)}%`).join(" "));

//  來源分帳：訓練仍是主力（穩定培養），但不再是 85% 的壓倒性唯一解。
const totals = Object.values(byArch).flat().reduce((s, c) => {
  s.training += c.total.training; s.official += c.total.official; s.competitive += c.total.competitive; return s;
}, { training: 0, official: 0, competitive: 0 });
const sum = totals.training + totals.official + totals.competitive || 1;
ck("Y8) 正式季賽已是重要來源（≥ 18%，原本 14.9% 且訓練 85.1%）",
  totals.official / sum >= 0.18,
  `訓練 ${r1(totals.training / sum * 100)}%／正式 ${r1(totals.official / sum * 100)}%／競技 ${r1(totals.competitive / sum * 100)}%`);

ck("Y9) 訓練仍是穩定主力但不再壓倒（≤ 82%）",
  totals.training / sum <= 0.82, `${r1(totals.training / sum * 100)}%`);

// ════════════════════════════════════════════════════════════════════════════
//  §X 防刷與公平
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§X 防刷與職業公平】");
const std = pool.filter((p) => p.archetype === "standard");
const avgClosure = (opts) => std.reduce((s, p) => s + sim.simulateCareer(W, p, 4, opts).rows[3].closure, 0) / std.length;
const pureTrain = avgClosure({});
//  ⚠ 防刷測試要打**最壞情況**：完全不訓練、體力一夠就打，不留餘裕。
//    用預設的「精神飽滿才出賽」門檻會讓刷的人自我節制，測出來的天花板偏低。
const pureFarm = avgClosure({ competitive: 200, trainRatio: 0, competitiveMinEnergy: 0 });
ck("X1) 純刷競技比賽**不會**贏過認真訓練（不能靠大量刷比賽成為最佳養成法）",
  pureFarm < pureTrain, `純訓練 ${r1(pureTrain * 100)}% vs 純刷競技 ${r1(pureFarm * 100)}%`);

ck("X2) 但競技比賽仍有實戰價值（純刷也不是完全沒成長）",
  pureFarm > 0.35, `${r1(pureFarm * 100)}%`);

ck("X3) 正式季賽刷不了：場次由賽程決定，與玩家意圖無關",
  (() => {
    const a = sim.simulateYear(W, sim.syntheticPlayer(W), { competitive: 0 });
    const b = sim.simulateYear(W, sim.syntheticPlayer(W), { competitive: 200 });
    return a.bySource.official > 0 && b.competitivePlayed > 0;
  })());

//  職業公平：關閉率會被「空間大小」干擾（空間小的人天生容易關閉），
//  所以這裡看的是**絕對主能力成長點數**，不是關閉率。
const byRole = {};
for (const p of pool) {
  const c = sim.simulateCareer(W, p, 4);
  (byRole[p.role] ??= []).push(c.rows[3].mainAvg - c.startMain);
}
const roleGain = Object.entries(byRole).map(([r, v]) => ({ r, g: r1(v.reduce((a, b) => a + b, 0) / v.length) }))
  .sort((a, b) => a.g - b.g);
ck("X4) 沒有定位因課程覆蓋而明顯吃虧：四年絕對成長最差 ≥ 最佳的 70%",
  roleGain.length > 0 && roleGain[0].g >= roleGain.at(-1).g * 0.70,
  roleGain.map((x) => `${x.r}:${x.g}`).join(" "));

//  年齡與 learning 在**多年尺度**上仍要看得見（RC5 的驗收）。
const closure4 = (o) => sim.simulateCareer(W, sim.syntheticPlayer(W, o), 4).rows[3].closure;
ck("X5) 年齡差異在 Year 4 仍看得見（20 歲 vs 34 歲 ≥ 25pp）",
  closure4({ age: 20 }) - closure4({ age: 34 }) >= 0.25,
  `20歲 ${r1(closure4({ age: 20 }) * 100)}% vs 34歲 ${r1(closure4({ age: 34 }) * 100)}%`);

ck("X6) learning 差異在 Year 4 仍看得見（95 vs 25 ≥ 6pp）",
  closure4({ learning: 95 }) - closure4({ learning: 25 }) >= 0.06,
  `95 ${r1(closure4({ learning: 95 }) * 100)}% vs 25 ${r1(closure4({ learning: 25 }) * 100)}%`);

ck("X7) 高 potential 不會過快滿能力：空間越大，四年後關閉率越低",
  closure4({ potential: 96, start: 45 }) < closure4({ potential: 60, start: 45 }),
  `潛力96 ${r1(closure4({ potential: 96, start: 45 }) * 100)}% < 潛力60 ${r1(closure4({ potential: 60, start: 45 }) * 100)}%`);

// ════════════════════════════════════════════════════════════════════════════
//  §F 既有契約不變
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 既有契約不變】");
ck("F1) LEVEL_GROWTH 的四個既有常數逐字未動（本輪只加曲線形狀，不改費率）",
  /pointsPerLevel:\s*3\.0/.test(read(P_LEVEL)) && /roomFull:\s*25/.test(read(P_LEVEL))
  && /perStatCap:\s*1\.5/.test(read(P_LEVEL)) && /hardCap:\s*99/.test(read(P_LEVEL)));

ck("F2) 成長仍受 perStatCap 保護：PCGM 加重之後單項每級仍不得超過上限",
  (() => {
    const p = { role: "中路", age: 18, potential: 99, stats: { accuracy: 40, apm: 40, decision: 40, adaptability: 40, reflex: 40, learning: 99 } };
    const g = levelGrowth.applyLevelGrowth(p, 1, { source: "official" });
    return Object.values(g.gains).every((v) => v <= levelGrowth.LEVEL_GROWTH.perStatCap);
  })());

//  ⚠ 只檢查**成長目標**那 5 項。`learning` 不在中路的成長鍵裡，
//    它會原樣帶過 ⇒ 把它算進來只會測到「未變動的欄位保持原值」，不是上限保護。
ck("F3) 成長仍不得越過潛力上限（PCGM 加重到 3.0 之後仍然守得住）",
  (() => {
    const p = { role: "中路", age: 18, potential: 62, stats: { accuracy: 61, apm: 61, decision: 61, adaptability: 61, reflex: 61, learning: 99 } };
    const g = levelGrowth.applyLevelGrowth(p, 50, { source: "official" });
    return (levelGrowth.growthKeysFor(p) ?? []).every((k) => g.stats[k] <= 62 + 1e-9);
  })());

//  ⚠ 必須只看 **import 敘述**。本檔的註解裡就寫著「不得 import careerGrowth」，
//    用裸關鍵字掃會掃到那句說明，變成「寫了理由就變紅」的假紅。
ck("F4) trainingCalculator 仍**不得** import PCGM（單向依賴，V0A §G 的規則沒有鬆動）",
  !/^\s*import[^;]*from\s+["'][^"']*careerGrowth[^"']*["']/m.test(read(P_TRAIN)));

ck("F5) 版本字串已推進（曲線改了就不能還叫 v1.1）",
  training.TRAINING_FORMULA_VERSION !== "training-growth.v1.1"
  && /^training-growth\.v/.test(training.TRAINING_FORMULA_VERSION),
  training.TRAINING_FORMULA_VERSION);

ck("F6) PCGM 仍是唯一入口：levelGrowth 不自己放年齡／learning 常數",
  !/ageEfficiency|learningEfficiency|1\.08|0\.0035/.test(read(P_LEVEL)));

ck("F7) 兩條路徑共用同一個空間曲線函式（reference identity，不是各抄一份）",
  (() => {
    try {
      return /potentialSpaceFactor/.test(read(P_TRAIN)) && /potentialSpaceFactor/.test(read(P_LEVEL))
        && !/Math\.min\(1,\s*room\s*\/\s*40\)/.test(read(P_TRAIN));
    } catch { return false; }
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §R Match Source fallback audit
//
//  開始讓不同來源有不同倍率**之前**必須先回答：正常的 MOBA / CS 結算路徑
//  還有沒有可能拿不到 origin？如果有，`official = 3.0` 就會變成一個
//  「偶爾少發 3 倍成長」的隱形 bug。
//
//  結論（本節逐條驗證）：**沒有。** `createSession` 是唯一的場次工廠，
//  兩個生產者（`mockGateway.openSession` 票券路徑／
//  `competitionGateway.openSessionForFixture` 賽程路徑）都經過它，
//  而它在拿不到來源時**硬性拒絕發出場次**。⇒ 只要 session 存在就一定有 origin。
//  剩下唯一會落到 practice 的是**根本沒有 session**的 debug harness。
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R Match Source fallback audit】");
const session = await imp("src/platform/contracts/matchSession.js");
const matchSource = await imp("src/platform/progress/matchSource.js");
const P_FEED = "src/battle/useBattleFeed.js";
const P_CSSETTLE = "src/platform/progress/settleCsMatch.js";
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

ck("R1) 場次工廠是單一扼要點：拿不到來源就**不發場次**（不是發一張沒有來源的）",
  (() => {
    const r = session.createSession({ room: null, ticket: null, origin: null, assignment: null });
    return r.ok === false && r.session === null && r.errors.some((e) => e.code === "ticket");
  })());

ck("R2) 兩個生產者都走 createSession（沒有第二條發場次的路）",
  (() => {
    const mock = read("src/platform/matchmaking/mockGateway.js");
    const comp = read("src/platform/competition/competitionGateway.js");
    return /createSession\(/.test(codeOnly(mock)) && /createSession\(/.test(codeOnly(comp));
  })());

ck("R3) 兩條 authoritative 結算路徑都從 session 讀 origin（不猜畫面／路由）",
  /matchmaking\?\.session\?\.origin/.test(codeOnly(read(P_FEED)))
  && /matchmaking\?\.session\?\.origin/.test(codeOnly(read(P_CSSETTLE))));

ck("R4) 結算不從 route / 畫面名稱 / stage 推來源",
  !/location|window\.location|screenName|routeName|STAGE_/.test(codeOnly(read(P_CSSETTLE))));

//  ⚠ 這一條是 §S4 的另一面。目前 `practice` 唯一的來路是「拿不到 origin」，
//    所以 practice 的倍率必須是中性的——否則資料遺失會變成隱形懲罰。
ck("R5) 殘餘的無 origin 路徑（debug harness）是**行為中性**的，不是隱形懲罰",
  career.PCGM_PARAMS.sourceBase[matchSource.MATCH_SOURCE.practice]
    === career.PCGM_PARAMS.sourceBase[matchSource.MATCH_SOURCE.competitive]);

ck("R6) 無 origin 仍然分類為 practice（保守方向沒有被本輪改掉）",
  matchSource.matchSourceFromOrigin(null) === matchSource.MATCH_SOURCE.practice
  && matchSource.matchSourceFromOrigin(undefined) === matchSource.MATCH_SOURCE.practice);

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel：把改動還原，對應的檢查必須自己變紅
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  //  A：把 gamma 還原成 1（線性）⇒ §C6 的節流閥退回 43%
  const A = await mutated(P_SPACE, (s) => s.replace(/gamma:\s*0\.6/, "gamma: 1"), "A-linear");
  ck("M-A) gamma 還原成線性 ⇒ §C6 起始係數退回 43% 區間",
    A.potentialSpaceFactor(17.4, 40) < 0.50,
    `${r1(A.potentialSpaceFactor(17.4, 40) * 100)}%`);

  //  B：把年齡曲線的老年段還原成原本的緩坡 ⇒ §A3 變紅
  const B = await mutated(P_TRAIN,
    (s) => s.replace(/Math\.max\(0\.20, 0\.98 - \(a - 28\) \* 0\.11\)/, "Math.max(0.82, 1 - (a - 28) * 0.015)"), "B-flatage");
  ck("M-B) 年齡曲線還原成緩坡 ⇒ §A3『老將不能磨到上限』變紅",
    !(B.ageEfficiency(34) < B.ageEfficiency(20) * 0.5),
    `34歲 ${B.ageEfficiency(34)}`);

  //  C：把 official 調回 1.0 ⇒ §S2 與 §Y8 變紅
  const C = await mutated(P_CAREER, (s) => s.replace(/\[GROWTH_SOURCES\.official\]:\s*3\.0/, "[GROWTH_SOURCES.official]: 1.0"), "C-flatsource");
  ck("M-C) official 調回 1.0 ⇒ §S2『正式賽 > 競技賽』變紅",
    !(C.PCGM_PARAMS.sourceBase.official > C.PCGM_PARAMS.sourceBase.competitive));

  //  D：把新課程拿掉 ⇒ §P1 變紅
  //  ⚠ 切片必須從 `export const TRAINING_COURSES` 開始，不能用 indexOf("TRAINING_COURSES")
  //    ——檔頭索引註解裡就有這個字，切出來會連 POSITION_PROFILE 一起包進去，
  //    那三項能力在那裡本來就出現得到，sentinel 會假綠。
  const D = read(P_MODEL).replace(/\{\s*id:\s*"mentality"[^}]*\},\s*\r?\n/, "");
  const table = (s) => s.slice(s.indexOf("export const TRAINING_COURSES"), s.indexOf("export const courseById"));
  ck("M-D) 拿掉心志鍛鍊課程 ⇒ §P1『三項能力練得到』變紅",
    table(D) !== table(read(P_MODEL))
    && !["courage", "resilience", "leadership"].every((k) => new RegExp(`"${k}"`).test(table(D))));
} catch (e) {
  ck("M-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_foundation_calibration：${pass}/${pass + fail} 通過`);
console.log(`   曲線 gamma=${space?.POTENTIAL_SPACE?.gamma ?? "?"}｜來源 base ${Object.entries(SB).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log(`   ⚠ 老將仍能長期磨到上限的**根本**解法是 aging / decline（V1），本輪只把速率壓下來。`);
process.exit(fail === 0 ? 0 : 1);
