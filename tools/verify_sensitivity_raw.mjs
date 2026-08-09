//  交叉驗證 measure_stat_sensitivity 的四種輸出是否一致：
//    <TAG>.json（摘要）／<TAG>.csv／<TAG>.raw.json（逐場）／log（人工看）
//
//  為什麼需要：摘要是「每格平均」，raw 是「逐場」。兩者由同一批列算出，
//  理論上恆等——但續跑、覆蓋、情境不符等狀況都可能讓它們漂移，
//  而漂移了不會有任何錯誤訊息。這支腳本就是把「恆等」變成可執行的斷言。
//
//  用法：node tools/verify_sensitivity_raw.mjs r2_split [r3_neutral ...]
//
//  ⚠ 這支腳本只讀檔、不跑模擬、不改任何東西。

import fs from "fs";

const DIR = "review/moba-combat";
const TAGS = process.argv.slice(2);
if (!TAGS.length) { console.error("用法：node tools/verify_sensitivity_raw.mjs <tag> [tag...]"); process.exit(1); }

const EPS = 1e-9;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); } };
const near = (a, b) => (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < EPS);

//  摘要欄位 → 如何由 raw 重算。與工具裡 measure() 的定義必須一字不差。
const avgOf = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
const rateOf = (rows, num, den) => { const d = avgOf(rows, den); return d > 0 ? avgOf(rows, num) / d : null; };

const RECOMPUTE = {
  n: (rows) => rows.length,
  winRate: (rows) => { const d = rows.filter((r) => r.decided); return d.length ? d.filter((r) => r.win).length / d.length : null; },
  decidedRate: (rows) => rows.filter((r) => r.decided).length / rows.length,
  minutes: (rows) => avgOf(rows, (r) => r.minutes),
  k: (rows) => avgOf(rows, (r) => r.k),
  d: (rows) => avgOf(rows, (r) => r.d),
  a: (rows) => avgOf(rows, (r) => r.a),
  retreats: (rows) => avgOf(rows, (r) => r.retreats),
  returns: (rows) => avgOf(rows, (r) => r.returns),
  towerPushes: (rows) => avgOf(rows, (r) => r.towerPushes),
  splitPush: (rows) => avgOf(rows, (r) => r.splitPush),
  groupedFights: (rows) => avgOf(rows, (r) => r.groupedFights),
  mlv: (rows) => avgOf(rows, (r) => r.mlv),
  ganks: (rows) => avgOf(rows, (r) => r.ganks),
  roams: (rows) => avgOf(rows, (r) => r.roams),
  invades: (rows) => avgOf(rows, (r) => r.invades),
  diveTry: (rows) => avgOf(rows, (r) => r.diveTry),
  diveOk: (rows) => avgOf(rows, (r) => r.diveOk),
  chaseDropped: (rows) => avgOf(rows, (r) => r.chaseDropped),
  focusSwap: (rows) => avgOf(rows, (r) => r.focusSwap),
  objKills: (rows) => avgOf(rows, (r) => r.objKills),
  objSpawns: (rows) => avgOf(rows, (r) => r.objSpawns),
  objRallies: (rows) => avgOf(rows, (r) => r.objRallies),
  tfEpisodes: (rows) => avgOf(rows, (r) => r.tfEpisodes),
  tfRolls: (rows) => avgOf(rows, (r) => r.tfRolls),
  fightUptime: (rows) => avgOf(rows, (r) => r.fightUptime ?? 0),
  csRate: (rows) => rateOf(rows, (r) => r.csHit, (r) => r.csAttempt) ?? 1,
  wasteRate: (rows) => rateOf(rows, (r) => r.atkWasted, (r) => r.atkTicks) ?? 0,
  gankRate: (rows) => rateOf(rows, (r) => r.gankKills, (r) => r.ganks),
  objRallyRate: (rows) => rateOf(rows, (r) => r.objRallies, (r) => r.objSpawns),
  objKillRate: (rows) => rateOf(rows, (r) => r.objKills, (r) => r.objSpawns),
  tfGoRate: (rows) => rateOf(rows, (r) => r.tfGo, (r) => r.tfRolls),
  tfWonRate: (rows) => rateOf(rows, (r) => r.tfWon, (r) => r.tfEpisodes),
  retreatAtMean: (rows) => rateOf(rows, (r) => r.retreatAtSum, (r) => r.retreatAtTicks),
  roamEpisodes: (rows) => avgOf(rows, (r) => r.roamEpisodes),
  roamDeclined: (rows) => avgOf(rows, (r) => r.roamDeclined),
  roamAborted: (rows) => avgOf(rows, (r) => r.roamAborted),
  roamRetargeted: (rows) => avgOf(rows, (r) => r.roamRetargeted),
  roamDeclineRate: (rows) => rateOf(rows, (r) => r.roamDeclined, (r) => r.roamDeclined + r.roams),
  roamEngageRate: (rows) => rateOf(rows, (r) => r.roamEngaged, (r) => r.roamEpisodes),
  roamPaidRate: (rows) => rateOf(rows, (r) => r.roamPaid, (r) => r.roamEpisodes),
};

for (const tag of TAGS) {
  console.log(`\n=== ${tag} ===`);
  let sum, raw, csv;
  try {
    sum = JSON.parse(fs.readFileSync(`${DIR}/${tag}.json`, "utf8"));
    raw = JSON.parse(fs.readFileSync(`${DIR}/${tag}.raw.json`, "utf8"));
    csv = fs.readFileSync(`${DIR}/${tag}.csv`, "utf8").split("\n").filter(Boolean);
  } catch (err) { fail++; console.log(`  ✗ 讀檔失敗：${err.message}`); continue; }

  //  1. metadata 必須一致
  ok(sum.scenario === raw.scenario, `scenario 不一致：摘要 ${sum.scenario} vs raw ${raw.scenario}`);
  ok(sum.seeds.length === raw.seeds.length, `seed 數不一致：${sum.seeds.length} vs ${raw.seeds.length}`);
  ok(sum.matchesPerCell === raw.matchesPerCell, `每格場數不一致`);
  ok(JSON.stringify(sum.seeds) === JSON.stringify(raw.seeds), `seed 池內容不一致`);

  //  2. 摘要裡的每一項，raw 都要有對應的列；反之亦然（不得單邊漂移）
  //  ⚠ 70 分那一格全 16 項共用同一個中性基準物件，raw 裡標為 `__baseline__`。
  const sumKeys = sum.stats.map((s) => s.key).sort();
  const rawKeys = [...new Set(raw.rows.map((r) => r.stat))].filter((k) => k !== "__baseline__").sort();
  ok(JSON.stringify(sumKeys) === JSON.stringify(rawKeys),
    `摘要有 [${sumKeys}] 但 raw 有 [${rawKeys}]`);
  ok(raw.rows.some((r) => r.stat === "__baseline__"), `raw 缺中性基準（__baseline__）的列`);

  //  3. 逐格：場數正確、seed 集合正確、藍紅各半
  for (const st of sum.stats) {
    for (const v of [40, 70, 90]) {
      //  70 分一律比對共用的 baseline 列——這正是「所有素質的 at70 必須相同」
      //  這條不變量的可執行版本。
      const rows = v === 70
        ? raw.rows.filter((r) => r.stat === "__baseline__")
        : raw.rows.filter((r) => r.stat === st.key && r.value === v);
      ok(rows.length === sum.matchesPerCell,
        `${st.key}@${v}: raw 只有 ${rows.length} 場，應為 ${sum.matchesPerCell}`);
      const blue = rows.filter((r) => r.side === "blue").length;
      ok(blue * 2 === rows.length, `${st.key}@${v}: 藍紅不對稱（藍 ${blue} / 共 ${rows.length}）`);
      const seeds = [...new Set(rows.map((r) => r.seed))].sort((a, b) => a - b);
      ok(seeds.length === sum.seeds.length, `${st.key}@${v}: 出現 ${seeds.length} 個相異 seed`);

      //  4. 核心：由 raw 重算摘要，逐鍵比對
      const cell = v === 40 ? st.at40 : v === 70 ? st.at70 : st.at90;
      if (!cell || !rows.length) { fail++; console.log(`  ✗ ${st.key}@${v}: 缺格`); continue; }
      for (const [field, fn] of Object.entries(RECOMPUTE)) {
        if (!(field in cell)) continue;
        const want = cell[field], got = fn(rows);
        ok(near(want, got), `${st.key}@${v}.${field}: 摘要 ${want} vs raw 重算 ${got}`);
      }
    }
  }

  //  5. CSV 的每一列都要在摘要裡找得到同樣的值
  const head = csv[0].split(",");
  const cols = head.slice(4);
  let csvChecked = 0;
  for (const line of csv.slice(1)) {
    const cell0 = line.split(",");
    const [key, , , vStr] = cell0;
    const v = Number(vStr);
    const st = sum.stats.find((s) => s.key === key);
    if (!st) { fail++; console.log(`  ✗ CSV 有摘要沒有的項：${key}`); continue; }
    const m = v === 40 ? st.at40 : v === 70 ? st.at70 : st.at90;
    cols.forEach((c, i) => {
      const cellStr = cell0[4 + i];
      const want = m?.[c];
      if (cellStr === "") { ok(want == null, `CSV ${key}@${v}.${c} 為空但摘要有值 ${want}`); return; }
      ok(near(Number(cellStr), want), `CSV ${key}@${v}.${c}: ${cellStr} vs 摘要 ${want}`);
      csvChecked++;
    });
  }
  console.log(`  （CSV 比對 ${csvChecked} 個數值）`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} 通過 / ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
