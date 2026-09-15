// ============================================================================
//  tools/check_moba_items_m2.mjs — MOBA Item System v1 M2（Engine Integration）驗證器
//
//  兩條主線：
//   ① itemsV1 OFF ⇒ legacy 模擬逐位元不變（對 M1 基準 commit 逐場比對指紋）
//   ② itemsV1 ON  ⇒ 裝備真正進 Battle（每個掛點都用引擎物件實測，不掃關鍵字）
//
//   G1 legacy 不變：不呼叫／傳 null 的 configureItems 與 M1 基準 commit 逐場相同
//   G2 opt-in 契約：回傳值、只能在開局呼叫、snapshot key 只多一個 items
//   G3 整場：購買合法、帳本守恆、隊伍金 = Σ 個人帳本、比賽結束、KDA 一致、結果確實改變
//   G4 戰鬥掛點：生命、輸出／減傷、護盾出口、法傷護盾、吸血、重傷、緩速、移速、光環、野怪、回復、治療強度
//   G5 收入歸屬與購買窗：擊殺／助攻、塔、小兵、復活窗、走路進泉水窗
//   G6 決定性：同 seed 兩次整場 snapshot 串流相同
//   G7 M3 UI 資料契約：snapshot.items 與 view-model 欄位齊全、純函式、OFF 回 null
//   G8 隔離：正式流程未啟用、DEV Inspector 只在 DEV、模擬版本閘門綠
//
//  用法：node tools/check_moba_items_m2.mjs   （約 1–2 分鐘）
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** M1 完成、引擎尚未接入裝備的 commit（legacy 基準）。 */
const BASE_COMMIT = "6a7d40a";
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const { LogicEngine } = await load("src/LogicEngine.js");
const { CHAMPIONS_100, heroById } = await load("src/data/heroDatabase.js");
const { toEngineHeroMods } = await load("src/battle/moba/mobaHeroProfile.js");
const { toEngineArchetypes } = await load("src/data/heroCombatArchetypes.js");
const { buildLoadout, toEngineSpells } = await load("src/battle/moba/mobaHeroLoadout.js");
const { toEngineTactic, STANDARD_OPP_TACTIC } = await load("src/platform/contracts/MobaTacticConfig.js");
const { hpMultFor } = await load("src/battle/moba/matchProgression.js");
const { toEngineItems } = await load("src/battle/moba/items/itemsEngineAdapter.js");
const { SHOP_WINDOWS, MILLI, checkConservation, totalEarnedMilli } = await load("src/battle/moba/items/itemEconomy.js");
const { validateInventory } = await load("src/battle/moba/items/itemInventory.js");
const { ITEMS_SNAPSHOT_SCHEMA } = await load("src/battle/moba/items/itemsEngineRuntime.js");
const { selectPlayerItemsView, selectPurchaseFeed, selectTeamItemsSummary, reasonText } = await load("src/battle/moba/items/itemsViewModel.js");

const results = [];
const ck = (gate, name, pass, detail = "") => results.push({ gate, name, pass: !!pass, detail: pass ? "" : String(detail) });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const COMP = { b: ["坦克", "刺客", "法師", "射手", "輔助"], r: ["戰士", "戰士", "法師", "射手", "坦克"] };
function fixedRoster() {
  const used = new Set(), roster = {};
  for (const seat of SEATS) {
    const hero = CHAMPIONS_100.find((h) => h.arch === COMP[seat[0]][Number(seat[1]) - 1] && !used.has(h.id));
    used.add(hero.id);
    roster[seat] = { heroId: hero.id };
  }
  for (const [seat, e] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = e.spells;
  return roster;
}
const ROSTER = fixedRoster();
const itemsCfg = (opts = {}) => toEngineItems({ roster: ROSTER, heroLookup: heroById, ...opts });

/** 照 useLocalServer 的順序配置（英雄／原型／技能／戰術）；items=true 再加裝備層。 */
function configured(seed, { items = false, itemOpts = {} } = {}) {
  const e = new LogicEngine(seed);
  e.configureHeroes(toEngineHeroMods(ROSTER, heroById));
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(toEngineArchetypes(ROSTER))) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: null });
  e.configureSpells(toEngineSpells(ROSTER));
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  if (items) e.configureItems(itemsCfg(itemOpts));
  return e;
}
const P = (e, id) => e.players.find((p) => p.id === id);
const lvl = (e) => (q) => e._applyMatchLevel(q);
const setInv = (e, id, items) => e.items.debugSetInventory(P(e, id), items, lvl(e));

// ── G1 legacy 不變 ──────────────────────────────────────────────────────────────
{
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-m2-base-"));
  let ok = true, detail = "";
  try {
    const tar = execFileSync("git", ["archive", "--format=tar", BASE_COMMIT, "src", "package.json"], { cwd: ROOT, maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-f", "-"], { cwd: base, input: tar, maxBuffer: 1 << 30 });
    const tool = path.join(ROOT, "tools/moba_items_legacy_fingerprint.mjs");
    const run = (args) => promisify(execFile)(process.execPath, [tool, ...args], { cwd: ROOT, maxBuffer: 64 << 20 }).then((r) => JSON.parse(r.stdout));
    const [b, off, nul] = await Promise.all([run([`--root=${base}`]), run([`--root=${ROOT}`]), run([`--root=${ROOT}`, "--items=null"])]);
    const diffOf = (x) => b.runs.flatMap((r, i) => Object.keys(r).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(x.runs[i]?.[k])).map((k) => `${r.seed}/${r.mode}:${k}`));
    const dOff = diffOf(off), dNull = diffOf(nul);
    ck("G1", `基準 ${BASE_COMMIT} 共 ${b.runs.length} 場（3 seed × bare／configured）全部跑完且有真實對局`,
      b.runs.length === 6 && b.runs.every((r) => r.over && r.bK + r.rK > 0) && b.runs.filter((r) => r.mode === "configured").every((r) => r.rngCalls.rng2 > 0 && r.rngCalls.rng3 > 0));
    ck("G1", "不呼叫 configureItems：snapshot 串流、終局、rng／rng2／rng3 次數、key 集合逐場與基準相同", dOff.length === 0, dOff.join(" "));
    ck("G1", "configureItems(null)：同上逐場相同（null 是 no-op）", dNull.length === 0, dNull.join(" "));
  } catch (err) {
    ok = false; detail = err.message;
    ck("G1", "legacy 指紋比對可執行", ok, detail);
  } finally {
    //  只刪本驗證器自己剛建立的暫存目錄
    if (path.basename(base).startsWith("esmo-m2-base-") && base.startsWith(os.tmpdir())) fs.rmSync(base, { recursive: true, force: true });
  }
}

// ── G2 opt-in 契約 ─────────────────────────────────────────────────────────────
{
  const off = configured(7);
  const on = configured(7);
  const r1 = on.configureItems(itemsCfg());
  const r2 = on.configureItems(itemsCfg());
  ck("G2", "預設 itemsOn=false；configureItems(null)／{} 回 false 且不啟用",
    off.itemsOn === false && off.configureItems(null) === false && off.configureItems({}) === false && off.itemsOn === false && off.items === null);
  ck("G2", "第一次 configureItems 回 true；重複呼叫回 false", r1 === true && r2 === false && on.itemsOn === true);
  const late = configured(7);
  late.tick(0.5);
  ck("G2", "開局後（t>0）呼叫被拒絕（出生購買窗只在 tick 0）", late.configureItems(itemsCfg()) === false && late.itemsOn === false);
  const sOff = off.snapshot(), sOn = on.snapshot();
  const keysOff = Object.keys(sOff), keysOn = Object.keys(sOn);
  ck("G2", "OFF snapshot 沒有 items key；ON 只多一個 items key（其餘頂層 key 順序相同）",
    !("items" in sOff) && JSON.stringify(keysOn.filter((k) => k !== "items")) === JSON.stringify(keysOff) && "items" in sOn, keysOn.join(","));
  ck("G2", "ON 英雄層 snapshot key 與 OFF 相同（裝備資料只在 items 底下）",
    JSON.stringify(Object.keys(sOn.players[0])) === JSON.stringify(Object.keys(sOff.players[0])));
  const spawnEvents = sOn.items.purchases.filter((ev) => ev.window === "spawn" && ev.t === 0);
  ck("G2", "開局 tick 0 出生窗：10 名英雄都買到起始裝，且未扣到負數",
    SEATS.every((id) => spawnEvents.some((ev) => ev.playerId === id)) && SEATS.every((id) => sOn.items.players[id].gold.unspent >= 0), spawnEvents.length);
}

// ── G3 整場 ──────────────────────────────────────────────────────────────────
const G3_RUNS = [
  { seed: 7, itemOpts: {} },
  { seed: 99, itemOpts: {} },
  { seed: 2024, itemOpts: { defaultStrategy: "counter" } },
  { seed: 123, itemOpts: { strategies: { b1: "survival", b2: "early", b3: "scaling", b4: "counter", b5: "standard", r1: "early", r2: "survival", r3: "counter", r4: "scaling", r5: "standard" } } },
];
let lastOnSnapshot = null;
{
  const windows = {};
  let violations = [], goldMismatch = 0, hpMismatch = 0, finished = 0, kda = true, rejected = 0, changed = 0, perPlayerBought = true, t3Total = 0;
  const counters = { hits: 0, mitigatedHits: 0, lifestealHeal: 0, lowHpShields: 0 };
  for (const { seed, itemOpts } of G3_RUNS) {
    const off = configured(seed);
    for (let i = 0; i < 7200 && !off.over; i++) off.tick(0.5);
    const e = configured(seed, { items: true, itemOpts });
    const orig = e.items.shopWindow.bind(e.items);
    e.items.shopWindow = (p, kind, ...rest) => { windows[kind] = (windows[kind] ?? 0) + 1; return orig(p, kind, ...rest); };
    let lastSeq = -1;
    for (let i = 0; i < 7200 && !e.over; i++) {
      e.tick(0.5);
      if (i % 10 !== 0) continue;
      for (const p of e.players) {
        const s = e.items.stateOf(p.id);
        const c = checkConservation(s.ledger), v = validateInventory(s.inventory);
        if (!c.ok || !v.ok || s.ledger.unspentMilli < 0) violations.push(`${seed}/${p.id}@${e.t}`);
        if (!near(p.gold, totalEarnedMilli(s.ledger) / MILLI)) goldMismatch++;
        if (!near(p.maxHp, p.baseMaxHp * hpMultFor(p.mlv) + s.cs.hp, 1e-9)) hpMismatch++;
      }
      if (!near(e.bGold, e.items.teamGold("blue")) || !near(e.rGold, e.items.teamGold("red"))) goldMismatch++;
      const it = e.snapshot().items;
      if (it.purchases.some((ev, k) => k > 0 && ev.seq <= it.purchases[k - 1].seq) || it.lastSeq < lastSeq) violations.push(`${seed}:seq`);
      lastSeq = it.lastSeq;
      if (it.purchases.some((ev) => !SHOP_WINDOWS.includes(ev.window) || !(ev.cost >= 0))) violations.push(`${seed}:event`);
    }
    if (e.over) finished++;
    if (e.players.reduce((a, p) => a + p.k, 0) !== e.players.reduce((a, p) => a + p.d, 0) || e.bK + e.rK !== e.players.reduce((a, p) => a + p.k, 0)) kda = false;
    const snap = e.snapshot();
    lastOnSnapshot = snap;
    rejected += snap.items.counters.rejected;
    for (const k of Object.keys(counters)) counters[k] += snap.items.counters[k];
    for (const id of SEATS) {
      if (snap.items.players[id].gold.spent <= 0) perPlayerBought = false;
      t3Total += snap.items.players[id].inventory.filter((x) => x?.startsWith("t3_")).length;
    }
    const strip = (s) => JSON.stringify({ ...s, items: undefined });
    if (strip(snap) !== strip(off.snapshot())) changed++;
  }
  ck("G3", `${G3_RUNS.length} 場整場：每 10 tick 檢查帳本守恆、背包合法、未花費 ≥ 0、事件 seq 遞增、窗合法`, violations.length === 0, violations.slice(0, 5).join(" "));
  ck("G3", "隊伍金錢 = Σ 個人帳本；英雄 gold 統計 = 個人累計收入", goldMismatch === 0, goldMismatch);
  ck("G3", "裝備生命真的進 maxHp：maxHp = baseMaxHp × 等級倍率 ＋ 裝備生命（每 10 tick、每人）", hpMismatch === 0, hpMismatch);
  ck("G3", `全部比賽在 60 分鐘內結束（${finished}/${G3_RUNS.length}）；總擊殺 = Σk = Σd`, finished === G3_RUNS.length && kda);
  ck("G3", `AI 購買 0 次被帳本拒絕；每位英雄都有花錢；共完成 ${t3Total} 件 T3`, rejected === 0 && perPlayerBought && t3Total >= G3_RUNS.length * 5, `rejected=${rejected}`);
  ck("G3", `出生／復活／回城三種窗在整場中都真的開過（${JSON.stringify(windows)}）`, windows.respawn > 0 && windows.recallArrive > 0);
  ck("G3", `英雄交戰全部走裝備結算（hits ${counters.hits}、減傷 ${counters.mitigatedHits}、吸血 ${Math.round(counters.lifestealHeal)}、低血護盾 ${counters.lowHpShields}）`,
    counters.hits > 0 && counters.mitigatedHits > 0 && counters.lifestealHeal > 0 && counters.lowHpShields > 0);
  ck("G3", `裝備真的改變戰局：${changed}/${G3_RUNS.length} 場與同 seed OFF 的非 items snapshot 不同`, changed === G3_RUNS.length);
}

// ── G4 戰鬥掛點 ────────────────────────────────────────────────────────────────
{
  const e = configured(7, { items: true });
  const t = e.t;
  //  E5 生命
  setInv(e, "b1", []);
  const m0 = P(e, "b1").maxHp;
  setInv(e, "b1", ["t2_heart"]);
  ck("G4", "E5 最大生命：買生命護符 ⇒ maxHp +320（經 _applyMatchLevel，不是另寫一套）", near(P(e, "b1").maxHp, m0 + 320));

  //  E1／E2 輸出與減傷
  setInv(e, "b4", []); setInv(e, "r4", []);
  const h0 = e.items.resolveHit(P(e, "b4"), P(e, "r4"), 100, 0.5, 1);
  setInv(e, "r4", ["t1_ar_l"]);
  const h1 = e.items.resolveHit(P(e, "b4"), P(e, "r4"), 100, 0.5, 1);
  setInv(e, "r4", []); setInv(e, "b4", ["t3_dawnbow"]);
  const h2 = e.items.resolveHit(P(e, "b4"), P(e, "r4"), 100, 0.5, 1);
  ck("G4", "E1 零裝備：D0 只拆物理／魔法，總量不變（100）", near(h0.total, 100));
  ck("G4", "E2 護甲 25 ⇒ 物理承受 × 100/125，魔法不變", near(h1.physTaken, h0.physTaken * 100 / 125) && near(h1.magicTaken, h0.magicTaken));
  ck("G4", "E1 攻擊裝（破曉長弓）⇒ 輸出高於零裝備", h2.total > h0.total * 1.3, h2.total);

  //  E3 護盾出口
  {
    const bare = new LogicEngine(7);
    bare.configureItems(itemsCfg());
    const p = bare.players[0];
    p.shield = 100; p.shieldUntil = bare.t + 5;
    const hp0 = p.hp;
    bare._damageHero(p, 30);
    const legacy = new LogicEngine(7);
    const q = legacy.players[0];
    q.shield = 100; q.shieldUntil = legacy.t + 5;
    const qhp0 = q.hp;
    legacy._damageHero(q, 30);
    ck("G4", "E3 itemsOn 而未啟用技能層：_damageHero 仍先扣護盾（legacy 未啟用時照舊直接扣血）",
      p.shield === 70 && p.hp === hp0 && q.hp === qhp0 - 30);
  }
  //  法傷護盾（靈能護符，低血觸發）
  {
    setInv(e, "r3", ["t3_psyward"]);
    const r3 = P(e, "r3");
    r3.hp = r3.maxHp * 0.2;
    e.items.afterDamage([], e.players, t);
    const ms = e.items.stateOf("r3").magicShield.amount;
    const hpA = r3.hp;
    e.items.applyDamage(r3, { physTaken: 0, magicTaken: 50, total: 50 }, t);
    const hpB = r3.hp;
    e.items.applyDamage(r3, { physTaken: 50, magicTaken: 0, total: 50 }, t);
    ck("G4", "低血護盾（只擋法傷）：< 30% 觸發；法傷被吸收、物理照扣",
      near(ms, r3.maxHp * 0.2) && hpB === hpA && near(r3.hp, hpA - 50), `ms=${ms}`);
  }
  //  吸血與重傷
  {
    const f = configured(7, { items: true });
    setInv(f, "b4", ["t2_fang"]); setInv(f, "r4", []);
    const atk = P(f, "b4"), foe = P(f, "r4");
    atk.hp = atk.maxHp * 0.5;
    const hit = f.items.resolveHit(atk, foe, 100, 0.5, 1);
    const before = atk.hp;
    f.items.afterDamage([[atk, foe, 100, hit]], f.players, f.t);
    const healed = atk.hp - before;
    ck("G4", "吸血：回復 = 物理攻擊通道承受量 × 8%", healed > 0 && near(healed, hit.physAttackTaken * 0.08), healed);
    atk.hp = atk.maxHp * 0.5;
    f.items.stateOf("b4").grievous = { cut: 0.4, until: f.t + 3 };
    f.items.afterDamage([[atk, foe, 100, hit]], f.players, f.t);
    ck("G4", "被重傷時吸血 × 0.6", near(atk.hp - atk.maxHp * 0.5, hit.physAttackTaken * 0.08 * 0.6));
    f.items.stateOf("b4").grievous = { cut: 0, until: 0 };
    atk.hp = atk.maxHp * 0.5;
    f.items.afterDamage([[atk, foe, 100, hit]], f.players, f.t, () => 0.5);
    ck("G4", "點燃減療（既有技能層）與重傷取較強者：吸血 × 0.5", near(atk.hp - atk.maxHp * 0.5, hit.physAttackTaken * 0.08 * 0.5));

    setInv(f, "b4", ["t2_scythe"]);
    const hit2 = f.items.resolveHit(atk, foe, 100, 0.5, 1);
    f.items.afterDamage([[atk, foe, 100, hit2]], f.players, f.t);
    const g = f.items.stateOf("r4").grievous;
    ck("G4", "重傷鐮（攻擊觸發）命中 ⇒ 目標重傷 40%、3 秒；回復倍率 min(點燃, 0.6)",
      g.cut === 0.4 && near(g.until, f.t + 3) && near(f.items.healK(foe, f.t, 1), 0.6) && near(f.items.healK(foe, f.t, 0.5), 0.5));
    f.items.stateOf("r4").grievous = { cut: 0, until: 0 };
    setInv(f, "b4", []);
    setInv(f, "r4", ["t3_thornmail"]);
    const hit3 = f.items.resolveHit(atk, foe, 100, 0.5, 1);
    f.items.afterDamage([[atk, foe, 100, hit3]], f.players, f.t);
    ck("G4", "棘刺鎧（被攻擊觸發）⇒ 攻擊者被重傷", f.items.stateOf("b4").grievous.cut === 0.4);
  }
  //  緩速與移速
  {
    const f = configured(7, { items: true });
    setInv(f, "b3", ["t3_frostcrown"]); setInv(f, "r3", []);
    const hit = f.items.resolveHit(P(f, "b3"), P(f, "r3"), 100, 0.5, 1);
    f.items.afterDamage([[P(f, "b3"), P(f, "r3"), 100, hit]], f.players, f.t);
    ck("G4", "冰霜法冠（技能觸發）⇒ 目標移速 × 0.85；與紅 Buff 緩速取較強者（不相乘）",
      near(f.items.moveK(P(f, "r3"), f.t, false, 0.7), 0.85) && near(f.items.moveK(P(f, "r3"), f.t, true, 0.7), 1));
    setInv(f, "r1", ["bt_base"]);
    ck("G4", "E6 輕步靴 ⇒ 移速倍率 1.06", near(f.items.moveK(P(f, "r1"), f.t, false, 0.7), 1.06));
    setInv(f, "b5", ["t3_wardaltar"]); setInv(f, "b4", []); setInv(f, "r4", []);
    P(f, "b4").pos = { ...P(f, "b5").pos };
    f.items.beginTick(f.players);
    const aura = { ...f.items.stateOf("b4").aura };
    const withAura = f.items.resolveHit(P(f, "r4"), P(f, "b4"), 100, 0.5, 1);
    f.items.stateOf("b4").aura = { armor: 0, mr: 0, moveSpeed: 0 };
    const noAura = f.items.resolveHit(P(f, "r4"), P(f, "b4"), 100, 0.5, 1);
    ck("G4", "守望聖壇光環 ⇒ 身旁友軍 +8 護甲／+8 魔抗，並真的進減傷（物理、魔法各 × 100/108）",
      aura.armor === 8 && aura.mr === 8 && near(withAura.physTaken, noAura.physTaken * 100 / 108) && near(withAura.magicTaken, noAura.magicTaken * 100 / 108), JSON.stringify(aura));
  }
  //  野怪、回復、治療強度
  {
    const f = configured(7, { items: true });
    setInv(f, "b2", ["st_hunter"]); setInv(f, "b1", ["t1_regen"]); setInv(f, "b5", ["t1_hsp"]);
    ck("G4", "獵人護符 ⇒ 野怪傷害 × 1.2；回春藤 ⇒ 每秒回復 +0.15%；祈光花瓣 ⇒ 治療／護盾 × 1.05",
      near(f.items.campDamageK(P(f, "b2")), 1.2) && near(f.items.regenBonus(P(f, "b1")), 0.0015) && near(f.items.hspK(P(f, "b5")), 1.05));
  }
}

// ── G5 收入歸屬與購買窗 ──────────────────────────────────────────────────────────
{
  const e = configured(7, { items: true });
  const earned = (id) => totalEarnedMilli(e.items.stateOf(id).ledger);
  const snapshotEarned = () => Object.fromEntries(SEATS.map((id) => [id, earned(id)]));
  let before = snapshotEarned();
  e.items.earnKill(P(e, "b1"), ["b3", "b2"]);
  let after = snapshotEarned();
  ck("G5", "擊殺 300 給擊殺者、助攻 150 均分（milli 整數）", after.b1 - before.b1 === 300 * MILLI && after.b2 - before.b2 === 75 * MILLI && after.b3 - before.b3 === 75 * MILLI);
  before = after;
  e.items.earnTower("blue", { x: 99999, y: 99999 }, e.players);
  after = snapshotEarned();
  ck("G5", "拆塔 250：範圍內無人 ⇒ 全隊均分 50", ["b1", "b2", "b3", "b4", "b5"].every((id) => after[id] - before[id] === 50 * MILLI));
  before = after;
  e.items.earnMinion("blue", { x: 99999, y: 99999 }, e.players);
  after = snapshotEarned();
  const noMinion = SEATS.every((id) => after[id] === before[id]);
  e.items.earnMinion("blue", { ...P(e, "b1").pos }, e.players);
  const afterNear = snapshotEarned();
  const blueDelta = ["b1", "b2", "b3", "b4", "b5"].reduce((a, id) => a + afterNear[id] - after[id], 0);
  ck("G5", "小兵 20：無人在範圍 ⇒ 流失；有人 ⇒ 範圍內均分，總量恰好 20", noMinion && blueDelta === 20 * MILLI, blueDelta);
  e._itemsSyncGold();
  ck("G5", "同步後隊伍金錢 = Σ 個人帳本（起始金 ＋ 收入）", near(e.bGold, e.items.teamGold("blue")) && e.bGold === (5 * 500 * MILLI + ["b1", "b2", "b3", "b4", "b5"].reduce((a, id) => a + earned(id), 0)) / MILLI);

  //  復活窗（引擎實際路徑）
  const r = configured(42, { items: true });
  for (let i = 0; i < 600; i++) r.tick(0.5);
  const p = P(r, "b4");
  p.dead = true; p.hp = 0; p.respawn = 0.1;
  const seqBefore = r.items.seq;
  r.tick(0.5);
  const lw = r.items.stateOf("b4").lastWindow;
  ck("G5", "復活落地 ⇒ 開 respawn 窗（當 tick；緊接的走路進泉水不重複開）", !p.dead && lw?.kind === "respawn" && near(lw.t, Math.round(r.t * 10) / 10), JSON.stringify(lw) + ` seq ${seqBefore}->${r.items.seq}`);
  //  走路進泉水窗（Q3）
  const s = r.items.stateOf("b4");
  s.inFountain = false;
  r.items.fountainEdge(p, true, r.t, lvl(r));
  const k1 = s.lastWindow.kind;
  s.lastWindow = { kind: "marker", t: 0 };
  r.items.fountainEdge(p, true, r.t, lvl(r));
  ck("G5", "Q3 走路進泉水：離開 → 進入那一 tick 開 fountain 窗；待在泉水裡不重複開", k1 === "fountain" && s.lastWindow.kind === "marker" && SHOP_WINDOWS.includes("fountain"));
}

// ── G6 決定性 ──────────────────────────────────────────────────────────────────
{
  const stream = () => {
    const e = configured(99, { items: true });
    const h = crypto.createHash("sha1");
    for (let i = 0; i < 7200 && !e.over; i++) { e.tick(0.5); if (i % 25 === 0) h.update(JSON.stringify(e.snapshot())); }
    h.update(JSON.stringify(e.snapshot()));
    return h.digest("hex");
  };
  const a = stream(), b = stream();
  ck("G6", "同 seed、同配置兩次整場：snapshot 串流（含 items）逐位元相同", a === b, `${a.slice(0, 12)} vs ${b.slice(0, 12)}`);
}

// ── G7 M3 UI 資料契約 ────────────────────────────────────────────────────────────
{
  const snap = lastOnSnapshot;
  const it = snap.items;
  const frozen = JSON.stringify(snap);
  ck("G7", `snapshot.items 頂層欄位齊全（schema ${it.schema}）`,
    it.schema === ITEMS_SNAPSHOT_SCHEMA && ["runtimeVersion", "catalogVersion", "policyVersion", "batch", "lastSeq", "purchases", "counters", "players"].every((k) => k in it)
    && JSON.stringify(Object.keys(it.players)) === JSON.stringify(SEATS));
  const PLAYER_KEYS = ["side", "seatRole", "arch", "archSource", "heroId", "strategy", "gold", "inventory", "plan", "reasons", "lastWindow", "stats", "status"];
  const STAT_KEYS = ["hp", "ad", "ap", "armor", "mr", "attackSpeed", "critChance", "critDamage", "abilityHaste", "moveSpeed", "armorPenFlat", "armorPenPct", "magicPenFlat", "magicPenPct", "lifesteal", "omnivamp", "healShieldPower", "effects"];
  const bad = [];
  for (const id of SEATS) {
    const p = it.players[id];
    if (!PLAYER_KEYS.every((k) => k in p)) bad.push(`${id}:keys`);
    if (p.inventory.length !== 6) bad.push(`${id}:slots`);
    if (p.gold.start + p.gold.earned < p.gold.spent + p.gold.unspent - 1 || p.gold.start + p.gold.earned > p.gold.spent + p.gold.unspent + 1) bad.push(`${id}:gold`);
    if (!STAT_KEYS.every((k) => k in p.stats)) bad.push(`${id}:stats`);
    if (!p.plan || !Array.isArray(p.plan.buildPath) || !("targetRemainingCost" in p.plan)) bad.push(`${id}:plan`);
  }
  ck("G7", "10 名英雄：金錢四欄（恆等式 ±1 取整誤差）、6 格背包、計畫、策略、理由、最近購買窗、CombatStats、狀態", bad.length === 0, bad.join(","));
  const EV_KEYS = ["seq", "t", "playerId", "window", "action", "itemId", "cost", "consumed", "unspentAfter", "targetId"];
  ck("G7", `購買事件（${it.purchases.length} 筆，上限 40）欄位齊全`, it.purchases.length > 0 && it.purchases.length <= 40 && it.purchases.every((ev) => EV_KEYS.every((k) => k in ev)));

  const viewBad = [];
  for (const id of SEATS) {
    const v = selectPlayerItemsView(snap, id);
    if (!v) { viewBad.push(`${id}:null`); continue; }
    if (v.slots.length !== 6 || !v.slots.every((s, i) => s.index === i)) viewBad.push(`${id}:slots`);
    if (v.currentItems.length !== it.players[id].inventory.filter(Boolean).length || !v.currentItems.every((c) => c.name)) viewBad.push(`${id}:current`);
    if (!v.strategyLabel || !v.gold || !v.stats || !v.status) viewBad.push(`${id}:basic`);
    if (v.decision.text.length !== v.decision.reasons.length || v.decision.text.some((x) => typeof x !== "string" || !x)) viewBad.push(`${id}:decision`);
    if (v.nextItem ? !(v.nextItem.recipe && typeof v.nextItem.remainingCost === "number" && typeof v.nextItem.affordable === "boolean") : !v.buildComplete) viewBad.push(`${id}:next`);
    if (!v.buildPath.length || !v.buildPath.every((b) => b.name && typeof b.owned === "boolean")) viewBad.push(`${id}:path`);
    if (!v.purchases.every((ev) => ev.playerId === id && ev.name && ev.actionLabel && ev.windowLabel)) viewBad.push(`${id}:feed`);
  }
  ck("G7", "view-model：10 人都有 slots／目前裝備／下一件（含合成樹、差價、買得起）／出裝路徑／決策中文／個人購買流", viewBad.length === 0, viewBad.join(","));
  const feed = selectPurchaseFeed(snap, { limit: 5 });
  ck("G7", "全場購買流：新 → 舊、筆數上限", feed.length === Math.min(5, it.purchases.length) && feed.every((ev, k) => k === 0 || ev.seq < feed[k - 1].seq));
  const team = selectTeamItemsSummary(snap, "red");
  ck("G7", "全隊摘要：5 人、每人 6 格", team.length === 5 && team.every((m) => m.items.length === 6));
  ck("G7", "理由碼全部翻得出中文（沒有落回原碼）", SEATS.every((id) => it.players[id].reasons.every((r) => reasonText(r) !== r)), SEATS.flatMap((id) => it.players[id].reasons.filter((r) => reasonText(r) === r)).join(","));
  ck("G7", "selector 是純函式：呼叫後 snapshot 逐位元不變", JSON.stringify(snap) === frozen);
  const offSnap = configured(7).snapshot();
  ck("G7", "OFF：selectPlayerItemsView／selectTeamItemsSummary 回 null、購買流為空（UI 不得造假）",
    selectPlayerItemsView(offSnap, "b1") === null && selectTeamItemsSummary(offSnap, "blue") === null && selectPurchaseFeed(offSnap).length === 0);
  ck("G7", "契約文件存在且列出 M3 需求對照", /M3 需求 → 欄位對照/.test(read("docs/architecture/MOBA_裝備UI資料契約_v1.md")));
}

// ── G8 隔離 ──────────────────────────────────────────────────────────────────
{
  const callers = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${ent.name}`;
      if (ent.isDirectory()) { if (!["src/battle/moba/items", "src/debug"].includes(rel)) walk(rel); }
      //  註解行不算呼叫（例如 simulationVersion.js 的版本判定說明）
      else if (/\.(jsx?|mjs)$/.test(ent.name) && rel !== "src/LogicEngine.js"
        && /configureItems\s*\(|toEngineItems\s*\(|debugSetInventory\s*\(/.test(read(rel).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"))) callers.push(rel);
    }
  };
  walk("src");
  //  M3a（Owner D1）：useLocalServer 可以呼叫，但必須受 itemsV1 開關保護，且正式開關預設 false。
  const uls = read("src/useLocalServer.js");
  const { FEATURE_FLAGS } = await load("src/featureFlags.js");
  const guarded = FEATURE_FLAGS.itemsV1 === false && !/debugSetInventory/.test(uls)
    && /featureEnabled\("itemsV1"\)\s*\|\|\s*\(import\.meta\.env\.DEV && itemsDevRequested\(\)\)/.test(uls);
  const unguarded = callers.filter((f) => !(f === "src/useLocalServer.js" && guarded));
  ck("G8", "正式流程只有 useLocalServer 呼叫 configureItems，且受 itemsV1 開關保護（正式站預設 OFF）；沒有人呼叫 debugSetInventory", unguarded.length === 0, unguarded.join(","));
  const main = read("src/main.jsx");
  ck("G8", "DEV Item Inspector 只掛在 import.meta.env.DEV && ?debug=items（正式 build 被移除）",
    /import\.meta\.env\.DEV && debugMode === "items"/.test(main) && !/ItemInspector/.test(read("src/AppShell.jsx")));
  const runtime = read("src/battle/moba/items/itemsEngineRuntime.js").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ck("G8", "裝備 runtime 不用亂數／時間（決定性）", !/Math\.random|Date\.now|performance\.now|\brng\d?\s*\(/.test(runtime));
  let gateOk = true, gateOut = "";
  try { gateOut = execFileSync(process.execPath, ["tools/check_simulation_version_gate.mjs"], { cwd: ROOT, encoding: "utf8" }); } catch (err) { gateOk = false; gateOut = (err.stdout ?? "") + err.message; }
  ck("G8", "模擬版本閘門綠（moba-sim.v5：M4b.5 塔規則是語意變化；正式輸入仍不經過裝備層，G1 已證明關閉裝備時結果不變）", gateOk && /moba-sim\.v5"/.test(read("src/platform/contracts/simulationVersion.js").match(/MOBA_SIMULATION_VERSION = "[^"]+"/)?.[0] ?? ""), gateOut.split("\n").slice(-4).join(" "));
}

const byGate = {};
for (const r of results) {
  byGate[r.gate] ??= { pass: 0, total: 0 };
  byGate[r.gate].total++; if (r.pass) byGate[r.gate].pass++;
  console.log(`${r.pass ? "✅" : "❌"} [${r.gate}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const passed = results.filter((r) => r.pass).length;
console.log("\n" + Object.entries(byGate).map(([g, v]) => `${g} ${v.pass}/${v.total}`).join("  "));
const ok = passed === results.length;
console.log(`MOBA Items M2: ${passed}/${results.length} ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
