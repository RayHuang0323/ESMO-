#!/usr/bin/env node
// ============================================================================
//  tools/check_roster_unlisted_lineup.mjs — 移出名單的選手不得留在先發
//
//  執行：repo 根目錄 `node tools/check_roster_unlisted_lineup.mjs`；**失敗時 exit 1**。
//
//  ── 這一支為什麼存在 ──────────────────────────────────────────────────────
//  `setRosterTier` 一直帶著一個 missing import，執行必拋 `ReferenceError`
//  ⇒ 這條路徑**從來沒有真的跑過**。import 補上之後才第一次看得到它的行為：
//  `drop()` 把席位清空了，但 `normalizeLineup` 的 pass-2 會把**同名選手**
//  補回空席位，而預設名單的 id 正好就是 `b1..b5` ⇒ 剛移出的人立刻被補回原位。
//
//  ── pass-2 不能直接拿掉 ───────────────────────────────────────────────────
//  它是**舊存檔的遷移回填**：沒有 `lineup` 欄位的存檔靠它得到等同
//  `DEFAULT_LINEUP` 的結果（Milestone E 之前的行為）。拿掉會讓那些存檔一載入
//  就變成空先發。
//
//  ⇒ 要分辨的是兩件事，而不是二選一：
//     ① 舊存檔缺 `lineup` 的遷移回填        —— 必須保留
//     ② 玩家**明確**把人設成 `unlisted`     —— 不得被回填
//
//  守的五組：
//    §1  純函式層：normalizeLineup 對「明確 unlisted」與「舊存檔」的分辨
//    §2  Store 層：starter → unlisted → 真的離開先發
//    §3  reload 後仍然離開先發
//    §4  bench / active 不受影響
//    §5  legacy 存檔遷移沒有回歸
//    §6  mutation sentinel
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { normalizeLineup, ENGINE_SEATS, DEFAULT_LINEUP } =
  await import("../src/platform/contracts/matchLineup.js");
const { tierOf } = await import("../src/platform/contracts/matchSquad.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

// ── §1 純函式層 ───────────────────────────────────────────────────────────
console.log("\n§1 normalizeLineup 分辨「明確 unlisted」與「舊存檔」");
const mk = (id, extra = {}) => ({ id, name: id, status: "主力", ...extra });
const five = ENGINE_SEATS.map((s) => mk(s));

//  ① 舊存檔：完全沒有 lineup，也沒有 rosterTier ⇒ 必須回填成 DEFAULT_LINEUP
ck("舊存檔（無 lineup、無 rosterTier）仍回填成預設先發",
  eq(normalizeLineup(null, five), DEFAULT_LINEUP),
  JSON.stringify(normalizeLineup(null, five)));
ck("舊存檔的選手 tierOf 不會是 unlisted（遷移語義沒被改動）",
  five.every((p) => tierOf(p) !== "unlisted"), five.map((p) => tierOf(p)).join(","));

//  ② 明確 unlisted：席位空著時**不得**被回填
const withUnlisted = five.map((p) => (p.id === "b1" ? { ...p, rosterTier: "unlisted" } : p));
const dropped = { ...DEFAULT_LINEUP, b1: null };
const afterDrop = normalizeLineup(dropped, withUnlisted);
ck("明確 unlisted 的選手不會被回填到自己原本的席位",
  afterDrop.b1 === null, `b1=${afterDrop.b1}`);
ck("其他席位不受影響",
  ENGINE_SEATS.filter((s) => s !== "b1").every((s) => afterDrop[s] === s),
  JSON.stringify(afterDrop));
//  ③ 明確 unlisted 也不得被回填到**別的**空席位
const allEmpty = Object.fromEntries(ENGINE_SEATS.map((s) => [s, null]));
const onlyUnlisted = normalizeLineup(allEmpty, withUnlisted);
ck("明確 unlisted 的選手不會被回填到任何席位",
  Object.values(onlyUnlisted).every((v) => v !== "b1"), JSON.stringify(onlyUnlisted));
ck("同一份名單裡未被移出的人照樣回填",
  ENGINE_SEATS.filter((s) => s !== "b1").every((s) => onlyUnlisted[s] === s));
//  ④ bench 不是 unlisted ⇒ 仍照舊回填
const withBench = five.map((p) => (p.id === "b2" ? { ...p, rosterTier: "bench" } : p));
ck("bench 的選手仍照舊回填（只有 unlisted 被排除）",
  normalizeLineup({ ...DEFAULT_LINEUP, b2: null }, withBench).b2 === "b2");

// ── §2 Store 層 ───────────────────────────────────────────────────────────
console.log("\n§2 starter → unlisted 真的離開先發");
const store = await freshStore();
const st = () => store.getState();
const starter = st().players.find((p) => Object.values(st().lineup).includes(p.id));
ck("前置：找得到一位先發", !!starter, starter?.id);
const seatOf = (id) => Object.entries(st().lineup).find(([, v]) => v === id)?.[0] ?? null;
ck("前置：他確實佔著席位", !!seatOf(starter.id), seatOf(starter.id));

const ok = st().setRosterTier(starter.id, "unlisted");
ck("setRosterTier 執行成功（不再 ReferenceError）", ok === true);
ck("tier 已變成 unlisted", st().players.find((p) => p.id === starter.id)?.rosterTier === "unlisted");
ck("⛔ 他已經不在任何先發席位上", seatOf(starter.id) === null,
  JSON.stringify(st().lineup));
ck("其他先發沒有被牽動",
  Object.entries(st().lineup).filter(([, v]) => v && v !== starter.id).length === 4,
  JSON.stringify(st().lineup));

// ── §3 reload ─────────────────────────────────────────────────────────────
console.log("\n§3 reload 後仍然離開先發");
st().save();
const persisted = JSON.parse(LS);
ck("持久化的 lineup 已經沒有他",
  !Object.values(persisted.lineup ?? {}).includes(starter.id),
  JSON.stringify(persisted.lineup));
const mod2 = await import(`../src/platform/profileStore.js?boot=reload${++bootSeq}`);
const st2 = () => mod2.useProfileStore.getState();
ck("重載後他仍然不在先發",
  !Object.values(st2().lineup ?? {}).includes(starter.id),
  JSON.stringify(st2().lineup));
ck("重載後他的 tier 仍是 unlisted",
  st2().players.find((p) => p.id === starter.id)?.rosterTier === "unlisted");

// ── §4 bench / active 正常 ────────────────────────────────────────────────
console.log("\n§4 bench / active 行為正常");
const store4 = await freshStore();
const s4 = () => store4.getState();
const p4 = s4().players.find((p) => Object.values(s4().lineup).includes(p.id));
const seat4 = Object.entries(s4().lineup).find(([, v]) => v === p4.id)?.[0];
s4().setRosterTier(p4.id, "bench");
ck("設成 bench 之後仍留在先發（bench 是可出賽分層）",
  s4().lineup[seat4] === p4.id, `${seat4}=${s4().lineup[seat4]}`);
s4().setRosterTier(p4.id, "unlisted");
ck("再設成 unlisted 之後離開先發", s4().lineup[seat4] !== p4.id);
s4().setRosterTier(p4.id, "active");
ck("設回 active 之後 tier 正確",
  s4().players.find((p) => p.id === p4.id)?.rosterTier === "active");
//  ⚠ 設回 active **不保證**自動回到先發——那是玩家自己指派的事，不由 tier 決定。
//    這裡只確認「不再被排除」：手動指派得回去。
const back = s4().setLineupSeat ? s4().setLineupSeat(seat4, p4.id) : null;
ck("設回 active 之後可以手動指派回先發",
  back === null || s4().lineup[seat4] === p4.id, `${seat4}=${s4().lineup[seat4]}`);

// ── §5 legacy 存檔遷移 ────────────────────────────────────────────────────
console.log("\n§5 legacy 存檔遷移沒有回歸");
//  舊存檔：有 players、**沒有 lineup**、**沒有 rosterTier**
const legacy = {
  ...persisted,
  lineup: undefined,
  players: (persisted.players ?? []).map(({ rosterTier, ...rest }) => ({ ...rest, status: "主力" })),
};
delete legacy.lineup;
LS = JSON.stringify(legacy);
const mod5 = await import(`../src/platform/profileStore.js?boot=legacy${++bootSeq}`);
const s5 = () => mod5.useProfileStore.getState();
const legacyIds = new Set((legacy.players ?? []).map((p) => p.id));
ck("舊存檔載入後先發被回填（不是空的）",
  Object.values(s5().lineup ?? {}).filter(Boolean).length > 0,
  JSON.stringify(s5().lineup));
ck("回填的都是這份存檔裡真實存在的選手",
  Object.values(s5().lineup ?? {}).filter(Boolean).every((id) => legacyIds.has(id)));
ck("舊存檔沒有任何人被誤判成 unlisted",
  (s5().players ?? []).every((p) => tierOf(p) !== "unlisted"));

// ── §6 mutation sentinel ─────────────────────────────────────────────────
console.log("\n§6 Mutation sentinel");
ck("mutation sentinel：若 pass-2 不看 rosterTier，§1② 會失敗",
  normalizeLineup({ ...DEFAULT_LINEUP, b1: null }, five).b1 === "b1",
  "同一份輸入、但沒有標 unlisted ⇒ 仍然回填 ⇒ 證明排除條件真的來自 rosterTier");
ck("mutation sentinel：若 pass-2 整個拿掉，§5 的遷移回填會變空",
  eq(normalizeLineup(null, five), DEFAULT_LINEUP),
  "遷移回填仍在（拿掉就會是全 null）");

console.log(`\nRoster unlisted lineup integrity: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
