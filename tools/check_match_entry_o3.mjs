#!/usr/bin/env node
// ============================================================================
//  tools/check_match_entry_o3.mjs — Milestone O3：線上出賽提交與驗證契約
//
//  執行：repo 根目錄 `node tools/check_match_entry_o3.mjs`；**失敗時 exit 1**。
//
//  驗的是「這張申請單能不能交給伺服器」的五件事：
//    ① 由既有陣容產生，MOBA 與 CS 都能產
//    ② **只送身分，不送數值**——遞迴掃描整張單，任何能力／體力／傷害欄位都要被拒
//    ③ 驗證涵蓋：存在／重複／位置／未登錄／體力／陣容完整
//      ⚠ 舊版還有一條「傷停」。**選手隨機受傷／傷停已被產品取消**，因此這裡改成
//        反向斷言：帶著舊存檔傷停資料的選手照樣通過驗證。守門見
//        `tools/check_no_player_injury.mjs`。
//    ④ 失敗時**不產生申請單**，且理由可直接顯示
//    ⑤ 成功時 transactionId 與陣容快照**決定性**，可供伺服器去重與重播
// ============================================================================
import {
  MATCH_ENTRY_VERSION, FORBIDDEN_VALUE_KEYS, createMatchEntryRequest,
  validateMatchEntryRequest, rosterVersionOf, stableHash,
} from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { CS_SEATS } from "../src/platform/contracts/matchSquad.js";
import { CONDITION } from "../src/platform/condition/playerCondition.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const mkPlayer = (id, role, over = {}) => ({
  id, name: `P-${id}`, role, lv: 8, xp: 900, energy: 90, morale: 80,
  personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active", ...over,
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const STARTERS = LANES.map((lane, i) => mkPlayer(`s${i + 1}`, lane));
const EXTRA = [
  mkPlayer("bench1", "中路", { rosterTier: "bench" }),
  mkPlayer("unl1", "上路", { rosterTier: "unlisted" }),
  //  舊存檔殘留的傷停資料。留在 fixture 裡是刻意的：它必須**不**影響任何驗證結果。
  mkPlayer("legacyhurt1", "打野", { injuryDays: 3, injured: true }),
  mkPlayer("tired1", "下路", { energy: CONDITION.unfitBelow - 1 }),
];
const ALL = [...STARTERS, ...EXTRA];
const mobaSeats = Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, STARTERS[i].id]));
const csSeats = Object.fromEntries(CS_SEATS.map((s, i) => [s, STARTERS[i].id]));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const make = (mode, seats, players = ALL) =>
  createMatchEntryRequest({ mode, seats, players, context: CTX });

console.log("══ Milestone O3：出賽申請與驗證契約 ══\n");

// ── 1) 由既有陣容產生（兩種模式） ───────────────────────────────────────
{
  const m = make("moba", mobaSeats);
  const c = make("cs", csSeats);
  ck("1) MOBA 陣容可產生申請單", m.ok && m.request.schema === MATCH_ENTRY_VERSION, m.request?.transactionId);
  ck("1b) CS 陣容可產生申請單", c.ok && c.request.mode === "cs");
  ck("1c) 申請單帶必要識別（隊伍、時間、隊伍版本）",
    m.request.teamId === "GSEAL" && m.request.rosterVersion.length === 8 &&
    m.request.submittedAt.week === 2 && m.request.submittedAt.season === 1);
  ck("1d) 陣容快照涵蓋全部席位，且帶 seat / playerId / 位置 / 分層",
    m.request.squad.length === 5 &&
    m.request.squad.every((r) => r.seat && r.playerId && r.role && r.seatRole && r.tier),
    m.request.squad.map((r) => `${r.seat}=${r.playerId}`).join(" "));
  ck("1e) MOBA 與 CS 的申請單彼此獨立（id 不同）",
    m.request.transactionId !== c.request.transactionId);
}

// ── 2) 只送身分，不送數值 ───────────────────────────────────────────────
{
  const m = make("moba", mobaSeats);
  const json = JSON.stringify(m.request);
  ck("2) 申請單序列化後不含任何能力／體力／傷害數值",
    !/"stats"|"power"|"tough"|"energy"|"morale"|"rating"|"lv"|"xp"|"dmg"/.test(json));
  ck("2b) 頂層欄位只有身分與編制",
    Object.keys(m.request).sort().join() === "mode,rosterVersion,schema,squad,squadSchema,submittedAt,teamId,teamName,transactionId",
    Object.keys(m.request).join(","));
  ck("2c) 陣容每一列只有 seat/playerId/role/seatRole/tier",
    m.request.squad.every((r) => Object.keys(r).sort().join() === "playerId,role,seat,seatRole,tier"));
  //  夾帶數值一律拒絕（頂層與巢狀都要抓）
  ck("2d) 頂層夾帶數值 → 拒絕",
    !validateMatchEntryRequest({ ...m.request, power: 999 }, ALL).ok);
  const nested = JSON.parse(JSON.stringify(m.request));
  nested.squad[0].stats = statsAll(99);
  const nv = validateMatchEntryRequest(nested, ALL);
  ck("2e) 巢狀夾帶數值也會被抓出來（遞迴掃描）",
    !nv.ok && nv.errors.some((e) => e.code === "value_leak"),
    nv.errors.find((e) => e.code === "value_leak")?.message);
  ck("2f) 禁止欄位清單涵蓋能力／體力／傷害／評分",
    ["stats", "power", "energy", "dmg", "rating", "lv", "xp"].every((k) => FORBIDDEN_VALUE_KEYS.includes(k)));
}

// ── 3) 驗證涵蓋各種阻擋情況 ─────────────────────────────────────────────
{
  const cases = [
    ["缺人（陣容不完整）", { ...mobaSeats, b3: null }, "empty_seat"],
    ["選手不存在", { ...mobaSeats, b2: "ghost" }, "unknown_player"],
    ["同一人重複佔席", { ...mobaSeats, b4: "s1" }, "duplicate_player"],
    ["未登錄名單", { ...mobaSeats, b1: "unl1" }, "ineligible"],
    ["體力不足", { ...mobaSeats, b4: "tired1" }, "exhausted"],
  ];
  for (const [label, seats, code] of cases) {
    const r = make("moba", seats);
    ck(`3) 阻擋：${label}`,
      !r.ok && r.request === null && r.errors.some((e) => e.code === code),
      r.errors.find((e) => e.code === code)?.message ?? r.errors[0]?.message);
  }
  //  位置不符：預設可出賽但有警告（仍會產生申請單）
  const swapped = { ...mobaSeats, b1: "s3", b3: "s1" };
  const w = make("moba", swapped);
  ck("3b) 位置不符 → 仍可提交但帶警告",
    w.ok && w.warnings.length === 2 && w.request.squad.some((r) => r.role !== r.seatRole),
    w.warnings[0]?.message);
}

// ── 4) 失敗時不產生申請單，理由可顯示 ───────────────────────────────────
{
  const r = make("moba", { ...mobaSeats, b3: null, b4: "ghost" });
  ck("4) 驗證失敗 → request 為 null（不送半套申請）", r.request === null && r.ok === false);
  ck("4b) 理由是可直接顯示的中文，不是錯誤碼",
    r.errors.length >= 2 && r.errors.every((e) => typeof e.message === "string" && !/^[a-z_]+$/.test(e.message)),
    r.errors.map((e) => e.message).join("；"));
}

// ── 5) 決定性：可去重、可重播 ───────────────────────────────────────────
{
  const a = make("moba", mobaSeats).request;
  const b = make("moba", mobaSeats).request;
  ck("5) 同一份陣容、同一天 → 同一個 transactionId（伺服器天然去重）",
    a.transactionId === b.transactionId, a.transactionId);
  ck("5b) 整張申請單逐欄相同（無亂數、無時鐘）", JSON.stringify(a) === JSON.stringify(b));
  //  換人 ⇒ id 改變
  const swapped = make("moba", { ...mobaSeats, b3: "bench1" }).request;
  ck("5c) 換人 → transactionId 改變", swapped.transactionId !== a.transactionId);
  //  換日 ⇒ id 改變（不同場次）
  const nextDay = createMatchEntryRequest({ mode: "moba", seats: mobaSeats, players: ALL, context: { ...CTX, day: 9, week: 2 } }).request;
  ck("5d) 換一天 → transactionId 改變（不同場次不會被誤判為重送）",
    nextDay.transactionId !== a.transactionId);

  //  隊伍版本：練功不改、換人才改
  const trained = ALL.map((p) => (p.id === "s1" ? { ...p, xp: 99999, lv: 40, energy: 20, stats: statsAll(99) } : p));
  ck("5e) 隊伍版本不受能力／經驗／體力影響（練功不會讓版本失效）",
    rosterVersionOf(trained, mobaSeats, "moba") === rosterVersionOf(ALL, mobaSeats, "moba"));
  const retiered = ALL.map((p) => (p.id === "bench1" ? { ...p, rosterTier: "unlisted" } : p));
  ck("5f) 改名單分層 → 隊伍版本改變",
    rosterVersionOf(retiered, mobaSeats, "moba") !== rosterVersionOf(ALL, mobaSeats, "moba"));
  ck("5g) 改陣容指派 → 隊伍版本改變",
    rosterVersionOf(ALL, { ...mobaSeats, b3: "bench1" }, "moba") !== rosterVersionOf(ALL, mobaSeats, "moba"));
  ck("5h) 雜湊本身是決定性的", stableHash("abc") === stableHash("abc") && stableHash("abc") !== stableHash("abd"));
}

// ── 6) 伺服器端驗證（模擬） ─────────────────────────────────────────────
{
  const req = make("moba", mobaSeats).request;
  ck("6) 合法申請單通過伺服器端驗證", validateMatchEntryRequest(req, ALL).ok);
  //  名單漂移：伺服器手上的名單已經變了
  const drifted = ALL.map((p) => (p.id === "s5" ? { ...p, rosterTier: "unlisted" } : p));
  const dv = validateMatchEntryRequest(req, drifted);
  ck("6b) 名單已變更（隊伍版本不符）→ 拒絕並要求重新提交",
    !dv.ok && dv.errors.some((e) => e.code === "roster_version" || e.code === "ineligible"),
    dv.errors[0]?.message);
  //  竄改 transactionId
  ck("6c) 竄改 transactionId → 拒絕（必須可由內容重算）",
    !validateMatchEntryRequest({ ...req, transactionId: "entry:moba:deadbeef:x:s1w1d1" }, ALL).ok);
  //  竄改陣容內容但沿用舊 id
  const tampered = JSON.parse(JSON.stringify(req));
  tampered.squad[0].playerId = "bench1";
  ck("6d) 換掉陣容卻沿用舊 id → 拒絕",
    !validateMatchEntryRequest(tampered, ALL).ok);
  //  伺服器以自己的名單重驗出賽資格（客戶端說可以不算數）。
  //  ⚠ 這裡用「排隊後體力掉下去」當情境——舊版用的是「排隊後受傷」，
  //    但受傷已被產品取消，拿它當情境等於驗一個不存在的規則。
  const nowTired = ALL.map((p) => (p.id === "s2" ? { ...p, energy: CONDITION.unfitBelow - 1 } : p));
  const hv = validateMatchEntryRequest(req, nowTired);
  ck("6e) 伺服器以自己的資料重驗資格（客戶端送單時還健康也擋得下）",
    !hv.ok && hv.errors.some((e) => e.code === "exhausted"),
    hv.errors.find((e) => e.code === "exhausted")?.message);
  //  反向：帶著舊傷停資料的名單**不得**被擋
  const legacyRoster = ALL.map((p) => (p.id === "s2" ? { ...p, injuryDays: 5, injured: true } : p));
  ck("6e2) 舊存檔的傷停資料不會讓已送出的申請失效",
    validateMatchEntryRequest(req, legacyRoster).ok);
  ck("6f) schema / mode 竄改會被擋",
    !validateMatchEntryRequest({ ...req, schema: "x" }, ALL).ok &&
    !validateMatchEntryRequest({ ...req, mode: "pvp" }, ALL).ok);
  ck("6g) 席位數不符會被擋",
    !validateMatchEntryRequest({ ...req, squad: req.squad.slice(0, 3) }, ALL).ok);
}

console.log("\n── 申請單摘要 ────────────────────────────────────────────────");
{
  const req = make("moba", mobaSeats).request;
  console.log(`   ${req.transactionId}`);
  console.log(`   隊伍版本 ${req.rosterVersion}｜席位 ${req.squad.map((r) => `${r.seat}:${r.playerId}`).join(" ")}`);
  console.log(`   欄位：${Object.keys(req).join(", ")}（無任何數值）`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
