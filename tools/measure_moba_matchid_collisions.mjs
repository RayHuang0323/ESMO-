#!/usr/bin/env node
// ============================================================================
//  tools/measure_moba_matchid_collisions.mjs — `mobaMatchId` 碰撞率量測
//
//  執行：`node tools/measure_moba_matchid_collisions.mjs [--matches 10000]`
//
//  ── 為什麼需要這個數字 ────────────────────────────────────────────────────
//  賽果完整性 hotfix 之後，`mobaMatchId` 碰撞的後果從「默默完成場次」變成
//  **fail-closed 拒絕結算**（`foreign_result`）。誤拒的機率＝碰撞率，所以上線
//  前要有實測數字，不能靠感覺。
//
//  ── 三種「同一個 matchId」必須分開算 ─────────────────────────────────────
//  `mobaMatchId` 是對 BattleResult 的**有損投影**再取 FNV-1a 32bit：
//      winner | duration | score | gold | towers | mvp | 每位選手 k/d/a/gold/dmg
//  因此同一個 id 有三種來源，風險完全不同：
//
//    ① **預期相同**：同一個 seed ⇒ 同一場對戰 ⇒ 投影逐字元相同。
//       這是決定性，不是缺陷（重送同一場本來就該拿到同一個 id）。
//    ② **投影碰撞**：不同 seed、真的是兩場不同對戰，但**被雜湊的那些欄位
//       剛好逐字元相同**（例如兩場的比分／經濟／推塔／十個人的 KDA 全一樣）。
//       雜湊再長也擋不掉——是投影本身丟資訊。
//    ③ **雜湊碰撞**：投影不同，但 FNV-1a 32bit 撞在一起。真正的雜湊碰撞。
//
//  ②③ 合起來才是「不同對戰卻得到相同 matchId」＝ 會造成誤拒的那種。
//
//  ⚠ 本檔**不改任何 production 程式**，也不改 settlement／match identity。
//    只讀 `mobaMatchId` 與 `snapshotToBattleResult`，跑既有的 LogicEngine。
//
//  ⚠ 投影字串是本檔**自行重建**的（`mobaProgressAdapter` 沒有匯出它）。
//    為了防止兩邊漂移，跑完會做一致性自檢：**同一投影必然同一 matchId**。
//    這條若不成立就代表重建錯了，本檔會直接 exit 1，不輸出可疑數字。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { snapshotToBattleResult } from "../src/battle/battleResult.js";
import { mobaMatchId } from "../src/platform/progress/adapters/mobaProgressAdapter.js";
import { fork } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const MATCHES = arg("matches", 10000);
const RECHECK = arg("recheck", 100);      // 決定性對照組（同 seed 重跑）
//  一場完整對戰約 1.8 秒 ⇒ 一萬場單行程要五小時。分片跑，結果完全等價
//  （每場都是獨立的決定性模擬，沒有共享狀態）。
const SHARDS = arg("shards", Math.max(1, Math.min(12, cpus().length - 1)));
const SHARD = arg("shard", -1);

//  與 mobaProgressAdapter.mobaMatchId 相同的投影（見檔頭警告）
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
function projectionOf(br) {
  return [
    br.winner,
    round3(br.duration),
    br.score?.blue, br.score?.red,
    round3(br.gold?.blue), round3(br.gold?.red),
    br.towers?.blue, br.towers?.red,
    br.mvpId ?? "-",
    ...(br.players ?? []).map((p) => `${p.id}:${p.k}/${p.d}/${p.a}:${round3(p.gold)}:${round3(p.dmg)}`),
  ].join("|");
}

//  引擎 seed 的推導與正式流程一致（`(seed >>> 0) | 1`）
//  ⚠ 因此偶數與其後的奇數會得到同一個引擎 seed ⇒ 只取奇數，確保每場都是不同對戰
const engineSeedFor = (i) => ((2 * i + 1) >>> 0) | 1;

function playOne(engineSeed) {
  const e = new LogicEngine(engineSeed);
  for (let i = 0; i < 40000 && !e.over; i++) e.tick(0.5);
  if (!e.over) return null;
  return snapshotToBattleResult(e.snapshot(), []);
}

// ── 分片子行程：只跑自己那一份，把 (seed, id, 投影) 回傳給父行程 ──────────
if (SHARD >= 0) {
  const rows = [];
  for (let i = SHARD; i < MATCHES; i += SHARDS) {
    const seed = engineSeedFor(i);
    const br = playOne(seed);
    rows.push(br ? { seed, id: mobaMatchId(br), proj: projectionOf(br) } : { seed, unfinished: true });
  }
  process.send({ rows });
  process.exit(0);
}

console.log("══ mobaMatchId 碰撞率量測 ══\n");
console.log(`   場數 ${MATCHES}（不同 seed，皆為不同對戰）＋ 決定性對照 ${RECHECK} 場`);
console.log(`   分片 ${SHARDS} 個行程（每場獨立決定性模擬，分片不影響結果）\n`);

const byMatchId = new Map();      // matchId → Set(projection)
const byProjection = new Map();   // projection → Set(matchId)
const seedOfProjection = new Map();
let played = 0, unfinished = 0;
const t0 = Date.now();

const self = fileURLToPath(import.meta.url);
const shardResults = await Promise.all(
  Array.from({ length: SHARDS }, (_, k) => new Promise((resolve, reject) => {
    const child = fork(self, ["--matches", String(MATCHES), "--shards", String(SHARDS), "--shard", String(k)], { stdio: "inherit" });
    let got = null;
    child.on("message", (m) => { got = m; });
    child.on("exit", (code) => {
      if (code !== 0 || !got) return reject(new Error(`分片 ${k} 失敗（exit ${code}）`));
      console.log(`   … 分片 ${k} 完成（${got.rows.length} 場，累計 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
      resolve(got.rows);
    });
    child.on("error", reject);
  })),
);

for (const rows of shardResults) {
  for (const r of rows) {
    if (r.unfinished) { unfinished++; continue; }
    played++;
    if (!byMatchId.has(r.id)) byMatchId.set(r.id, new Set());
    byMatchId.get(r.id).add(r.proj);
    if (!byProjection.has(r.proj)) byProjection.set(r.proj, new Set());
    byProjection.get(r.proj).add(r.id);
    if (!seedOfProjection.has(r.proj)) seedOfProjection.set(r.proj, r.seed);
  }
}

// ── 一致性自檢：同一投影必然同一 matchId ────────────────────────────────
const brokenMirror = [...byProjection.entries()].filter(([, ids]) => ids.size > 1);
if (brokenMirror.length) {
  console.log(`\n❌ 自檢失敗：有 ${brokenMirror.length} 個投影對應到多個 matchId`);
  console.log("   代表本檔重建的投影與 mobaMatchId 不一致，數字不可信。");
  process.exit(1);
}

// ── 決定性對照組：同一個 seed 重跑，必須拿到同一個 matchId ──────────────
let deterministicOk = 0, deterministicBad = 0;
for (let i = 0; i < Math.min(RECHECK, MATCHES); i++) {
  const seed = engineSeedFor(i);
  const br = playOne(seed);
  if (!br) continue;
  const proj = projectionOf(br);
  (byProjection.has(proj) && seedOfProjection.get(proj) === seed) ? deterministicOk++ : deterministicBad++;
}

// ── 統計 ────────────────────────────────────────────────────────────────
const uniqueIds = byMatchId.size;
const uniqueProjections = byProjection.size;
//  同一個 matchId 被多於一場「不同對戰」共用 ⇒ 真碰撞
const collidingIds = [...byMatchId.entries()].filter(([, projs]) => projs.size > 1);
const trueCollisionPairs = collidingIds.reduce((s, [, projs]) => s + (projs.size - 1), 0);
//  投影碰撞：不同 seed 卻投影相同（雜湊擋不掉的那種）
const projectionCollisions = played - uniqueProjections;
const duplicateIds = played - uniqueIds;

console.log("\n── 結果 ──────────────────────────────────────────────────────");
console.log(`   總場數（成功終局）        ${played}${unfinished ? `（未終局 ${unfinished}）` : ""}`);
console.log(`   unique matchId            ${uniqueIds}`);
console.log(`   unique 投影（不同對戰）   ${uniqueProjections}`);
console.log(`   duplicate matchId 總數    ${duplicateIds}`);
console.log(`     ├ ① 預期相同（同 seed） 0（本輪每場 seed 皆不同，故為 0）`);
console.log(`     ├ ② 投影碰撞           ${projectionCollisions}`);
console.log(`     └ ③ 雜湊碰撞           ${trueCollisionPairs}`);
console.log(`   **真碰撞（②＋③）**        ${duplicateIds}`);
console.log(`   碰撞率                    ${played ? (duplicateIds / played * 100).toFixed(4) : "0"}%  (${duplicateIds}/${played})`);
console.log(`   決定性對照（同 seed 重跑） ${deterministicOk} 相同 / ${deterministicBad} 不同`);

if (collidingIds.length) {
  console.log("\n── 可重現案例（雜湊碰撞：投影不同卻同 id）──────────────────");
  const [id, projs] = collidingIds[0];
  console.log(`   matchId ${id}`);
  [...projs].slice(0, 2).forEach((p, n) => {
    console.log(`   #${n + 1} seed=${seedOfProjection.get(p)}`);
    console.log(`      ${p.slice(0, 220)}${p.length > 220 ? " …" : ""}`);
  });
}
if (projectionCollisions > 0) {
  const dupProj = [...byProjection.keys()].length;
  console.log(`\n   ⚠ 投影碰撞 ${projectionCollisions} 筆（不同 seed 但被雜湊的欄位完全相同）`);
  console.log(`     這種靠換雜湊函式擋不掉——是投影丟資訊，需改 match identity 來源。`);
}

console.log(`\n   耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(deterministicBad === 0 ? 0 : 1);
