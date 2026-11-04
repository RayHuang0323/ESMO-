#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_lineup_required_bp1.mjs — Season E2E BP-1：CS 先發不足時出戰
//
//  執行：repo 根目錄 `node tools/check_cs_lineup_required_bp1.mjs`；失敗 exit 1。秒級。
//
//  ── 這一支在守什麼（Owner 2026-11-04）──────────────────────────────
//  玩家開了 CS 賽季、先發還是空的，走到比賽日按「出戰」，以前只看到內部錯誤
//  「申請單不是物件」。修正是**畫面**先看出賽申請單，給看得懂的提示與賽前頁入口。
//    ① 判定只有一個來源：`matchEntry("cs")`，就是 `startFixtureMatch` 用的那一張
//    ② **不得偷偷填人**：新局 csLineup 全空是 Milestone O1 的決定，只有玩家按「自動填入」才會填
//    ③ Store 的規則沒有放寬：先發不足時 `startFixtureMatch` 仍然拒絕，且賽程狀態不動
//    ④ 查看賽事中心不得寫存檔、不得開季（既有紅線）
//  ⚠ 掃原始碼前先剝註解：說明文字裡正好會提到「自動填入」與 autoFillLineup。
// ============================================================================
import fs from "node:fs";

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  key: (i) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const SS = await import("../src/platform/competition/seasonState.js");
const st = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const code = (f) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const filled = () => Object.values(st().csLineup ?? {}).filter(Boolean).length;

// ── §1 新局：先發是空的，申請單不成立 ──
st().reset?.();
st().startNewGame("standard");
ck("新局 CS 先發全空（不得自動填）", filled() === 0, `${filled()} 席`);
const e0 = st().matchEntry("cs");
ck("先發全空時出賽申請單不成立", e0.ok === false && e0.request === null);
ck("MOBA 先發不受影響，申請單成立", st().matchEntry("moba").ok === true);

// ── §2 Store 規則沒有放寬 ──
const opened = st().ensureCompetitionSeason("cs");
ck("開 CS 賽季", opened.ok === true);
ck("開季不會順便填人", filled() === 0);
const fixtureToday = () => {
  for (let i = 0; i < 40; i++) {
    const v = st().competitionView("cs");
    if (v.today) return v.today;
    if (!(st().advanceDay(1).daysAdvanced > 0)) return null;
  }
  return null;
};
const fx = fixtureToday();
ck("走到有 CS 賽程的比賽日", !!fx, fx ? `第 ${st().meta.days} 天` : "");
const statusBefore = fx && SS.fixtureById(st().competitionByMode.cs, fx.id).status;
const refused = fx ? st().startFixtureMatch(fx.id, 1700000000000) : { ok: true };
ck("先發全空時 startFixtureMatch 仍然拒絕（規則沒有放寬）", refused.ok === false, refused.reason ?? "");
ck("被拒絕時賽程狀態不動、沒有開房", fx && SS.fixtureById(st().competitionByMode.cs, fx.id).status === statusBefore && !st().matchmaking?.fixtureAssignment);
ck("被拒絕時也沒有偷偷填人", filled() === 0);

// ── §3 不足的幾種形狀都會被判定 ──
const ids = (st().players ?? []).map((p) => p.id);
const seats = Object.keys(st().csLineup ?? {});
ck("CS 有五個席位", seats.length === 5, seats.join(","));
for (let i = 0; i < 3; i++) st().setCsSeat(seats[i], ids[i]);
ck("只排 3 人：申請單仍不成立", filled() === 3 && st().matchEntry("cs").ok === false);
st().autoFillLineup("cs");
ck("玩家按自動填入後五席都有人", filled() === 5);
ck("排滿後申請單成立", st().matchEntry("cs").ok === true);

// ── §4 排好之後真的出得了戰 ──
const started = st().startFixtureMatch(fx.id, 1700000000000);
ck("排好之後 startFixtureMatch 成功", started.ok === true, started.reason ?? "");
ck("賽程進入 launched、有指派單", SS.fixtureById(st().competitionByMode.cs, fx.id).status === "launched" && !!st().matchmaking?.fixtureAssignment);

// ── §5 讀判定不寫存檔 ──
st().reset?.();
st().startNewGame("standard");
st().save();
const rawBefore = storage.get("esmo.profile.v1");
for (let i = 0; i < 5; i++) { st().matchEntry("cs"); st().competitionView("cs"); }
ck("判定與讀賽事中心不改存檔、不開季", storage.get("esmo.profile.v1") === rawBefore && !st().competitionByMode?.cs?.schema);

// ── §6 原始碼 ──
const hub = code("src/screens/fps/CsCompetitionHubScreen.jsx");
const prep = code("src/screens/fps/CsPrepScreen.jsx");
const shell = code("src/AppShell.jsx");
const tabs = code("src/screens/manage/CompetitionHubScreen.jsx");
ck("賽事中心用 matchEntry 判定，沒有自己算席位規則", /getState\(\)\.matchEntry\("cs"\)\.ok/.test(hub));
ck("賽事中心沒有呼叫填人動作", !/autoFillLineup|setCsSeat/.test(hub));
ck("賽事中心仍然沒有 useEffect（開季不得在掛載時發生）", !/useEffect/.test(hub));
ck("先發不足時不渲染出戰按鈕，改渲染提示與賽前頁入口", /csEntryReady \? \(\s*<button data-testid="cs-league-play"/.test(hub) && hub.includes('data-testid="cs-hub-lineup-required"') && hub.includes('data-testid="cs-hub-open-prep"'));
ck("提示是玩家看得懂的話，不是內部錯誤", hub.includes("CS 先發還沒排好") && !hub.includes("申請單"));
ck("賽前頁的自動填入仍然只掛在玩家按下去（onAutoFill）", /onAutoFill=\{\(\) => autoFillLineup\("cs"\)\}/.test(prep));
ck("賽前頁沒有因為這次修改而開賽或開季", !/startFixtureMatch|ensureCompetitionSeason/.test(prep));
ck("AppShell 接上入口與返回", shell.includes('onCsPrep={() => { setCsPrepFromHub(true); setScreen("csPrep"); }}') && shell.includes("onReturnToHub={csPrepFromHub ? backToHub : null}"));
ck("賽事中心分頁可以回到 CS", /useState\(initialMode\)/.test(tabs) && tabs.includes("onOpenPrep={onCsPrep}"));
const semantic = fs.readFileSync("src/platform/contracts/simulationVersion.js", "utf8");
ck("這次改的畫面都不是語意檔", !["CsCompetitionHubScreen", "CsPrepScreen", "CompetitionHubScreen", "AppShell"].some((n) => semantic.includes(`${n}.jsx`)));

console.log(`\nCS Lineup Required BP-1：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
