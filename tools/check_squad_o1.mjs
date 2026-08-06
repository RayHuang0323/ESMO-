#!/usr/bin/env node
// ============================================================================
//  tools/check_squad_o1.mjs — Milestone O1：隊伍名單與出賽陣容閉環
//
//  執行：repo 根目錄 `node tools/check_squad_o1.mjs`；**失敗時 exit 1**。
//
//  驗的是這個閉環的五個要害：
//    ① 名單分層：一隊／替補可出賽，未登錄不可
//    ② 陣容合法性：缺人／重複／不存在／未登錄／位置不符，各自有可顯示的理由
//    ③ MOBA 與 CS 各有明確陣容，且**不是第二套選手資料**（都指回 players[]）
//    ④ 結果回寫到**實際出賽的 playerId**（不是席位 id）
//    ⑤ 提交契約：只含 playerId 與席位，**不得夾帶任何數值**
// ============================================================================
import {
  MATCH_SQUAD_VERSION, ROSTER_TIERS, tierOf, isEligible, CS_SEATS, CS_SEAT_ROLE,
  validateSquad, createSquadSubmission, validateSquadSubmission,
  normalizeCsLineup, autoFillSquad, seatsOf,
} from "../src/platform/contracts/matchSquad.js";
import { ENGINE_SEATS, SEAT_LANE_ZH, normalizeLineup, assignSeat, seatPlayers } from "../src/platform/contracts/matchLineup.js";
import { toFpsRoster } from "../src/battle/fps/fpsRoster.js";
import { mobaResultToTransaction } from "../src/platform/progress/adapters/mobaProgressAdapter.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const stats = () => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, 70]));
const mkPlayer = (id, role, over = {}) => ({
  id, name: `P-${id}`, role, lv: 10, xp: 500, energy: 90, morale: 80,
  personality: "steady", condition: "正常", stats: stats(), ...over,
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const ROSTER = LANES.map((lane, i) => mkPlayer(`p${i + 1}`, lane, { rosterTier: i < 5 ? "active" : "bench" }));
const FULL = [...ROSTER, mkPlayer("p6", "中路", { rosterTier: "bench" }), mkPlayer("p7", "上路", { rosterTier: "unlisted" })];
const mobaSeats = Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, ROSTER[i].id]));
const csSeats = Object.fromEntries(CS_SEATS.map((s, i) => [s, ROSTER[i].id]));

console.log("══ Milestone O1：隊伍名單與出賽陣容 ══\n");

// ── 1) 名單分層 ──────────────────────────────────────────────────────────
{
  ck("1) 三層名單齊全（一隊／替補／未登錄）",
    Object.keys(ROSTER_TIERS).join(",") === "active,bench,unlisted",
    Object.values(ROSTER_TIERS).map((t) => t.label).join("／"));
  ck("1b) 一隊與替補可出賽，未登錄不可",
    isEligible(mkPlayer("a", "上路", { rosterTier: "active" })) &&
    isEligible(mkPlayer("b", "上路", { rosterTier: "bench" })) &&
    !isEligible(mkPlayer("c", "上路", { rosterTier: "unlisted" })));
  //  舊存檔沒有 rosterTier ⇒ 由 Legacy status 推導，不把人踢出名單
  ck("1c) 舊存檔以 status 推導分層（主力→一隊，其餘→替補）",
    tierOf({ status: "主力" }) === "active" && tierOf({ status: "預備隊" }) === "bench" && tierOf({}) === "bench");
  ck("1d) 未知分層值不會讓人變成未登錄（回退替補）",
    tierOf({ rosterTier: "???" }) === "bench");
}

// ── 2) 陣容合法性：每種錯誤都要有可顯示的理由 ────────────────────────────
{
  const ok = validateSquad({ mode: "moba", seats: mobaSeats, players: ROSTER });
  ck("2) 完整且定位相符的陣容 → 通過且無警告",
    ok.ok && ok.errors.length === 0 && ok.warnings.length === 0 && ok.filled === 5);

  const empty = validateSquad({ mode: "moba", seats: { ...mobaSeats, b3: null }, players: ROSTER });
  ck("2b) 缺人 → 阻擋並指出是哪一路",
    !empty.ok && empty.errors[0].code === "empty_seat" && empty.errors[0].message.includes("中路"),
    empty.errors[0].message);

  const dup = validateSquad({ mode: "moba", seats: { ...mobaSeats, b4: ROSTER[0].id }, players: ROSTER });
  ck("2c) 同一人佔兩席 → 阻擋並指出兩個席位",
    !dup.ok && dup.errors.some((e) => e.code === "duplicate_player"),
    dup.errors.find((e) => e.code === "duplicate_player")?.message);

  const ghost = validateSquad({ mode: "moba", seats: { ...mobaSeats, b2: "nobody" }, players: ROSTER });
  ck("2d) 指到不存在的選手 → 阻擋",
    !ghost.ok && ghost.errors.some((e) => e.code === "unknown_player"),
    ghost.errors.find((e) => e.code === "unknown_player")?.message);

  const un = validateSquad({ mode: "moba", seats: { ...mobaSeats, b1: "p7" }, players: FULL });
  ck("2e) 未登錄選手 → 阻擋",
    !un.ok && un.errors.some((e) => e.code === "ineligible"),
    un.errors.find((e) => e.code === "ineligible")?.message);

  //  位置不符：預設警告、strictRole 時阻擋
  const swapped = { ...mobaSeats, b1: ROSTER[2].id, b3: ROSTER[0].id };
  const warn = validateSquad({ mode: "moba", seats: swapped, players: ROSTER });
  const strict = validateSquad({ mode: "moba", seats: swapped, players: ROSTER, strictRole: true });
  ck("2f) 位置不符：預設可出賽但有警告",
    warn.ok && warn.warnings.length === 2, `${warn.warnings.length} 則警告`);
  ck("2g) 位置不符：strictRole 時阻擋", !strict.ok && strict.errors.every((e) => e.code === "role_mismatch"));
  ck("2h) 錯誤訊息是可直接顯示的中文（不是錯誤碼）",
    empty.errors.every((e) => typeof e.message === "string" && e.message.length > 4 && !/^[a-z_]+$/.test(e.message)));
}

// ── 3) MOBA 與 CS 各有明確陣容 ──────────────────────────────────────────
{
  ck("3) MOBA 與 CS 席位不同且各 5 席",
    seatsOf("moba").join() === ENGINE_SEATS.join() && seatsOf("cs").join() === CS_SEATS.join() &&
    CS_SEATS.length === 5);
  ck("3b) CS 陣容清洗：無重複、鍵齊全",
    (() => {
      const n = normalizeCsLineup({ f1: "p1", f2: "p1", f3: "p2" }, ROSTER);
      return Object.keys(n).join() === CS_SEATS.join() && n.f1 === "p1" && n.f2 === null;
    })());
  const csOk = validateSquad({ mode: "cs", seats: csSeats, players: ROSTER });
  ck("3c) CS 陣容可獨立驗證", csOk.ok && csOk.filled === 5);
  //  兩份陣容互不干擾
  ck("3d) MOBA 與 CS 陣容彼此獨立（同一人可同時在兩份陣容）",
    validateSquad({ mode: "moba", seats: mobaSeats, players: ROSTER }).ok && csOk.ok);
  //  ⭐ CS 引擎名單真的按陣容取人，而不是陣列順序
  const shuffled = { f1: "p5", f2: "p4", f3: "p3", f4: "p2", f5: "p1" };
  const roster = toFpsRoster(ROSTER, shuffled);
  ck("3e) CS 引擎名單依陣容取人（不是靠 players 陣列順序）",
    roster && roster.map((r) => r._gid).join() === "p5,p4,p3,p2,p1",
    roster ? roster.map((r) => r._gid).join() : "null");
  ck("3f) CS 陣容缺人 → 引擎名單回 null（呼叫端會擋下，不虛構陣容）",
    toFpsRoster(ROSTER, { ...shuffled, f3: null }) === null);
  ck("3g) 沒有陣容時退回舊行為（舊存檔／fixture 不受影響）",
    Array.isArray(toFpsRoster(ROSTER.map((p) => ({ ...p, status: "主力" })), null)));
  //  不是第二套選手資料：引擎名單的每個人都能在 players[] 找到
  ck("3h) 引擎名單全部指回 players[]（不是第二套選手資料）",
    roster.every((r) => ROSTER.some((p) => p.id === r._gid)));
}

// ── 4) 同一人不得重複佔席（指派層就擋掉）──────────────────────────────
{
  const swap = assignSeat(mobaSeats, "b1", ROSTER[1].id, ROSTER);
  ck("4) MOBA 指派已在他席的人 → 兩席互換，不產生重複",
    swap.b1 === "p2" && swap.b2 === "p1" && new Set(Object.values(swap)).size === 5,
    JSON.stringify(swap));
  ck("4b) normalizeLineup 會清掉重複指派",
    (() => {
      const n = normalizeLineup({ b1: "p1", b2: "p1", b3: "p3", b4: "p4", b5: "p5" }, ROSTER);
      return n.b1 === "p1" && n.b2 === null;
    })());
}

// ── 5) 結果回寫到實際出賽的 playerId ────────────────────────────────────
{
  //  席位換人：b1 由 p1 換成替補 p6 ⇒ XP 必須寫到 p6，不是 p1、也不是席位 id
  const lineup = { ...mobaSeats, b1: "p6" };
  const seated = seatPlayers(lineup, FULL);
  ck("5) seatPlayers 解析出實際出賽的人", seated.b1.id === "p6");
  const br = {
    schema: "BattleResult.v2", winner: "blue", durationSec: 1500, mvpId: "b1",
    players: ENGINE_SEATS.map((s, i) => ({
      id: s, side: "blue", k: 5, d: 2, a: 7, rating: 6.5, participation: 0.6, gold: 10000, dmg: 20000,
    })).concat([{ id: "r1", side: "red", k: 3, d: 5, a: 4, rating: 5, participation: 0.5, gold: 8000, dmg: 15000 }]),
  };
  const tx = mobaResultToTransaction(br, { players: FULL, lineup });
  const ids = (tx?.playerProgress ?? []).map((x) => x.playerId);
  ck("5b) 賽後 XP 寫到實際出賽的 playerId（不是席位 id）",
    ids.includes("p6") && !ids.includes("b1") && !ids.includes("p1"),
    ids.join(","));
  ck("5c) 五個席位都有回寫", ids.length === 5 && new Set(ids).size === 5);
  ck("5d) 回寫對象全部存在於 players[]（不虛構選手）",
    ids.every((id) => FULL.some((p) => p.id === id)));
}

// ── 6) 提交契約：只有身分，沒有數值 ────────────────────────────────────
{
  const sub = createSquadSubmission({ mode: "moba", seats: mobaSeats, players: ROSTER, submittedAt: { day: 1, week: 1, season: 1 } });
  ck("6) 合法陣容 → 產生提交單", !!sub && sub.schema === MATCH_SQUAD_VERSION && sub.mode === "moba");
  ck("6b) 提交單只含席位映射，沒有任何數值欄位",
    Object.keys(sub).sort().join() === "mode,schema,seats,submittedAt" &&
    Object.values(sub.seats).every((v) => typeof v === "string"),
    Object.keys(sub).join(","));
  const serialized = JSON.stringify(sub);
  ck("6c) 序列化後不含能力／戰力字樣（伺服器不必信任前端數值）",
    !/stats|power|tough|rating|"lv"/.test(serialized));
  ck("6d) 陣容不合法 → 不產生提交單（不送半套陣容）",
    createSquadSubmission({ mode: "moba", seats: { ...mobaSeats, b2: null }, players: ROSTER }) === null);
  //  伺服器端驗證
  ck("6e) 提交單可被獨立驗證（伺服器會做的事）",
    validateSquadSubmission(sub, ROSTER).ok);
  ck("6f) 夾帶數值的提交單一律拒絕",
    !validateSquadSubmission({ ...sub, stats: { p1: 99 } }, ROSTER).ok &&
    validateSquadSubmission({ ...sub, power: 999 }, ROSTER).errors.some((e) => e.code === "value_leak"));
  ck("6g) 提交單指到未登錄選手 → 伺服器端也會擋",
    !validateSquadSubmission({ ...sub, seats: { ...sub.seats, b1: "p7" } }, FULL).ok);
  ck("6h) 竄改 schema / mode 會被擋",
    !validateSquadSubmission({ ...sub, schema: "x" }, ROSTER).ok &&
    !validateSquadSubmission({ ...sub, mode: "pvp" }, ROSTER).ok);
}

// ── 7) 自動填入 ─────────────────────────────────────────────────────────
{
  const filled = autoFillSquad({ mode: "moba", seats: {}, players: FULL });
  ck("7) 自動填滿五席", ENGINE_SEATS.every((s) => !!filled[s]));
  ck("7b) 不會填入未登錄選手", !Object.values(filled).includes("p7"));
  ck("7c) 一隊優先於替補",
    ENGINE_SEATS.filter((s) => tierOf(FULL.find((p) => p.id === filled[s])) === "active").length === 5);
  ck("7d) 已指派的席位不被覆寫",
    autoFillSquad({ mode: "moba", seats: { b1: "p6" }, players: FULL }).b1 === "p6");
  ck("7e) 定位相符優先（自動填入後零位置警告）",
    validateSquad({ mode: "moba", seats: filled, players: FULL }).warnings.length === 0);
  const csFill = autoFillSquad({ mode: "cs", seats: {}, players: FULL });
  ck("7f) CS 也能自動填入且驗證通過",
    validateSquad({ mode: "cs", seats: csFill, players: FULL }).ok);
}

console.log("\n── 陣容概況 ──────────────────────────────────────────────────");
console.log(`   MOBA 席位 ${ENGINE_SEATS.join("/")} → ${ENGINE_SEATS.map((s) => SEAT_LANE_ZH[s]).join("/")}`);
console.log(`   CS   席位 ${CS_SEATS.join("/")} → ${CS_SEATS.map((s) => CS_SEAT_ROLE[s]).join("/")}`);
console.log(`   提交單欄位：${Object.keys(createSquadSubmission({ mode: "cs", seats: csSeats, players: ROSTER }) ?? {}).join(", ")}（無數值）`);

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
