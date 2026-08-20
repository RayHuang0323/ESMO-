#!/usr/bin/env node
// CS MR12 / first-to-13 completion regression guard.
//
// The rule fixtures use the same production rule-state helpers that drive the
// FPS simulator. The live simulator is also loaded once through Vite to verify
// halftime metadata, team identity/currentSide separation, result completion,
// and same-seed determinism without changing gameplay balance.
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const TEST_API_NAME = "__CS_MR12_COMPLETION_TEST_API__";

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`✅ ${name}${detail ? `　${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`❌ ${name}${detail ? `　${detail}` : ""}`);
  }
};
const repeat = (value, count) => Array.from({ length: count }, () => value);
const all800 = (money) => Object.values(money ?? {}).every((value) => value === 800);
const allMoney = (money, expected) => Object.values(money ?? {}).every((value) => value === expected);
const teamIds = (record) => Object.keys(record ?? {}).sort().join(",");

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}

async function loadApi(source) {
  let seen = 0;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-mr12-completion-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT,
      configFile: false,
      envFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-mr12-completion-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          seen += 1;
          gate(code === source, "VITE_SOURCE_MISMATCH");
          const returned = source.replace(
            RETURN_MARKER,
            "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, createCsRuleState, beginCsRound, finishCsRound, csEconomyResetMoney, csIsPistolReset };",
          );
          gate(returned !== source, "RETURN_MARKER_MISSING");
          const transformed = returned.replace(
            EXPORT_MARKER,
            `const ${TEST_API_NAME} = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  buildMatchResult: __FPS3D_MODULE.buildMatchResult,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
  createCsRuleState: __FPS3D_MODULE.createCsRuleState,
  beginCsRound: __FPS3D_MODULE.beginCsRound,
  finishCsRound: __FPS3D_MODULE.finishCsRound,
  csEconomyResetMoney: __FPS3D_MODULE.csEconomyResetMoney,
  csIsPistolReset: __FPS3D_MODULE.csIsPistolReset,
});
export { EsportsFPS3D, buildMatchResult, ${TEST_API_NAME} };`,
          );
          gate(transformed !== returned, "EXPORT_MARKER_MISSING");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-mr12=completion`);
    gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen));
    gate(loaded[TEST_API_NAME], "TEST_API_MISSING");
    return loaded[TEST_API_NAME];
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function playSchedule(api, winners, captureNext = false) {
  const state = api.createCsRuleState();
  const starts = [];
  for (const winner of winners) {
    const start = api.beginCsRound(state);
    if (!start.legal) break;
    starts.push({ ...start, round: state.roundsPlayed + 1 });
    api.finishCsRound(state, winner);
    if (state.completed) break;
  }
  let nextStart = null;
  if (captureNext && !state.completed) {
    nextStart = api.beginCsRound(state);
    if (nextStart.legal) starts.push({ ...nextStart, round: state.roundsPlayed + 1 });
  }
  return { state, starts, nextStart };
}

function sourceChecks(source) {
  ck("production constants are MR12 / first-to-13 / OT MR3 with split economy",
    source.includes("CS_REGULATION_ROUNDS_PER_HALF=12")
    && source.includes("CS_REGULATION_WIN_SCORE=13")
    && source.includes("CS_REGULATION_START_MONEY=800")
    && source.includes("CS_OT_GROUP_ROUNDS=6")
    && source.includes("CS_OT_GROUP_WIN_ROUNDS=4")
    && source.includes("CS_OT_START_MONEY=12500")
    && source.includes("const resetMoney=csEconomyResetMoney(reason);")
    && source.includes("const pistolRound=csIsPistolReset(roundPlan.economyResetReason);"));
  ck("team identity and currentSide are separate production fields",
    source.includes("teamId") && source.includes("currentSideByTeam") && source.includes("teamIdentityByPlayer"));
  ck("legal completion is simulator.completed plus final frame",
    source.includes("const matchOver=Boolean(sim.completed)&&fIdx>=total-1;"));
  ck("Quick Finish seeks the same final frame",
    source.includes("setQuickFinishing(true);setPlaying(false);setFIdx(total-1)") && source.includes("setFIdx(total-1)"));
  ck("onComplete is exactly-once guarded",
    source.includes("completedRef.current!==matchResult.id") && source.includes("completedRef.current=matchResult.id;onComplete(matchResult)"));
  ck("raw MatchResult exposes completed and stable winner",
    source.includes("completed:sim.completed,winner:sim.winner") && source.includes("winner:sim.winner"));
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  const api = await loadApi(source);
  ck("production simulator test API loads", typeof api.simulateFps === "function" && typeof api.buildMatchResult === "function");

  const us = "us";
  const enemy = "enemy";
  const regulationTwelveZero = playSchedule(api, repeat(us, 12), true);
  const regulationThirteenZero = playSchedule(api, repeat(us, 13));
  const regulationThirteenEleven = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 11), us]);
  const regulationTwelveTwelve = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 12)], true);
  const otThreeThree = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 12), ...repeat(us, 3), ...repeat(enemy, 3)], true);
  const otSixteenThirteen = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 12), us, enemy, us, us, us]);
  const otSixteenFourteen = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 12), us, enemy, us, enemy, us, us]);
  const otNextGroup = playSchedule(api, [...repeat(us, 12), ...repeat(enemy, 12), ...repeat(us, 3), ...repeat(enemy, 3), ...repeat(us, 4)]);

  ck("12:0 does not complete", !regulationTwelveZero.state.completed && regulationTwelveZero.state.roundsPlayed === 12);
  ck("13:0 completes normally", regulationThirteenZero.state.completed && regulationThirteenZero.state.winner === us && regulationThirteenZero.state.roundsPlayed === 13);
  ck("12:11 reaches 13:11", regulationThirteenEleven.state.completed && regulationThirteenEleven.state.score[us] === 13 && regulationThirteenEleven.state.score[enemy] === 11);
  ck("regulation opening starts at $800", api.csEconomyResetMoney("match-start") === 800 && api.csIsPistolReset("match-start"));
  const halftimeBefore = regulationTwelveZero.starts.find((start) => start.round === 1);
  const halftimeAfter = regulationTwelveZero.nextStart;
  ck("halftime preserves stable team identity", halftimeBefore?.currentSideByTeam[us] === "t" && halftimeAfter?.currentSideByTeam[us] === "ct" && teamIds(halftimeBefore?.currentSideByTeam) === teamIds(halftimeAfter?.currentSideByTeam));
  ck("halftime swaps T / CT currentSide", halftimeAfter?.economyResetReason === "halftime" && halftimeAfter.currentSideByTeam[us] === "ct" && halftimeAfter.currentSideByTeam[enemy] === "t");
  ck("12:12 enters overtime", !regulationTwelveTwelve.state.completed && regulationTwelveTwelve.state.score[us] === 12 && regulationTwelveTwelve.state.score[enemy] === 12 && regulationTwelveTwelve.nextStart?.phase === "overtime");
  ck("first OT group starts at $12,500 without pistol", regulationTwelveTwelve.nextStart?.otGroup === 1 && regulationTwelveTwelve.nextStart?.economyResetReason === "ot-group-1" && api.csEconomyResetMoney(regulationTwelveTwelve.nextStart.economyResetReason) === 12500 && !api.csIsPistolReset(regulationTwelveTwelve.nextStart.economyResetReason));
  const otRoundFour = otThreeThree.starts.find((start) => start.phase === "overtime" && start.otGroup === 1 && start.roundInPhase === 4);
  ck("OT swaps side after 3 rounds and keeps OT economy", otRoundFour?.currentSideByTeam[us] === "t" && otRoundFour?.currentSideByTeam[enemy] === "ct" && api.csEconomyResetMoney("ot-group-1") === 12500 && !api.csIsPistolReset("ot-group-1"));
  ck("OT 3:3 does not complete the match", !otThreeThree.state.completed && otThreeThree.state.score[us] === 15 && otThreeThree.state.score[enemy] === 15 && otThreeThree.state.otGroup === 2);
  ck("next OT group resets to $12,500 without pistol", otThreeThree.nextStart?.otGroup === 2 && otThreeThree.nextStart?.economyResetReason === "ot-group-2" && api.csEconomyResetMoney(otThreeThree.nextStart.economyResetReason) === 12500 && !api.csIsPistolReset(otThreeThree.nextStart.economyResetReason));
  ck("16:13 is a legal OT result", otSixteenThirteen.state.completed && otSixteenThirteen.state.score[us] === 16 && otSixteenThirteen.state.score[enemy] === 13 && otSixteenThirteen.state.winner === us);
  ck("16:14 is a legal OT result", otSixteenFourteen.state.completed && otSixteenFourteen.state.score[us] === 16 && otSixteenFourteen.state.score[enemy] === 14 && otSixteenFourteen.state.winner === us);
  ck("15:15 starts the next OT group", !otThreeThree.state.completed && otThreeThree.nextStart?.otGroup === 2 && otThreeThree.nextStart?.roundInPhase === 1);
  ck("next OT group can produce the stable winner", otNextGroup.state.completed && otNextGroup.state.score[us] === 19 && otNextGroup.state.score[enemy] === 15 && otNextGroup.state.winner === us);

  const map = api.TACTICS_DB.inferno;
  const tTactic = map.t.find((item) => item.id === "t_aexec");
  const ctTactic = map.ct.find((item) => item.id === "c_std");
  const simA = api.simulateFps("inferno", tTactic, ctTactic, 424242, api.ROSTER);
  const simB = api.simulateFps("inferno", tTactic, ctTactic, 424242, api.ROSTER);
  const firstRound = simA.roundHist[0];
  const secondHalfRound = simA.roundHist.find((round) => round.phase === "regulation" && round.half === "second");
  const finalFrame = simA.frames.at(-1);
  ck("production simulator returns completed / winner", simA.completed === true && (simA.winner === us || simA.winner === enemy));
  ck("production players carry stable team identity", simA.players.length === 10 && simA.players.every((player) => player.teamId === us || player.teamId === enemy));
  ck("production halftime swaps currentSide without changing identity", firstRound?.teamIdentityByPlayer && secondHalfRound?.teamIdentityByPlayer && JSON.stringify(firstRound.teamIdentityByPlayer) === JSON.stringify(secondHalfRound.teamIdentityByPlayer) && firstRound.currentSideByTeam[us] !== secondHalfRound.currentSideByTeam[us]);
  ck("production halftime resets economy to $800", secondHalfRound?.economyResetReason === "halftime" && secondHalfRound.economyResetMoney === 800 && all800(secondHalfRound.startMoneyByPlayer));
  ck("production second half starts pistol round", secondHalfRound?.buyTypeByTeam?.[us] === "pistol" && secondHalfRound?.buyTypeByTeam?.[enemy] === "pistol");
  ck("tactic ownership remains stable across halftime", firstRound?.tacticOwnerByTeam?.[us] === secondHalfRound?.tacticOwnerByTeam?.[us] && firstRound?.tacticOwnerByTeam?.[enemy] === secondHalfRound?.tacticOwnerByTeam?.[enemy]);
  let liveOt=null;
  for(let seed=1;seed<=256&&!liveOt;seed++){
    const candidate=api.simulateFps("inferno",tTactic,ctTactic,seed,api.ROSTER);
    if(candidate.roundHist.some((round)=>round.economyResetReason === "ot-group-1"))liveOt=candidate;
  }
  const liveOtStart=liveOt?.roundHist.find((round)=>round.economyResetReason === "ot-group-1");
  const liveOtAfterSwap=liveOt?.roundHist.find((round)=>round.phase === "overtime" && round.otGroup === 1 && round.roundInPhase === 4);
  ck("production OT starts at $12,500 without pistol", liveOtStart?.economyResetMoney === 12500 && allMoney(liveOtStart.startMoneyByPlayer,12500) && liveOtStart.pistolRound === false);
  ck("production OT remains non-pistol after 3-round swap", liveOtAfterSwap?.pistolRound === false && liveOtAfterSwap?.economyResetMoney === null);
  ck("final frame is a legal completed terminal", finalFrame?.completed === true && finalFrame?.winner === simA.winner && finalFrame.tScore === simA.tScore && finalFrame.ctScore === simA.ctScore && Math.max(simA.tScore, simA.ctScore) >= 13);
  ck("same seed produces identical simulation", JSON.stringify(simA) === JSON.stringify(simB));
  const resultA = api.buildMatchResult(simA, { tacticT: tTactic, tacticCT: ctTactic, seed: 424242 });
  const resultB = api.buildMatchResult(simB, { tacticT: tTactic, tacticCT: ctTactic, seed: 424242 });
  ck("MatchResult winner mapping is stable-team based and deterministic", resultA.winner === simA.winner && resultA.win === (simA.winner === us) && resultA.id === resultB.id && resultA.scoreT === simA.tScore && resultA.scoreCT === simA.ctScore);

  sourceChecks(source);
  const csScreen = readFileSync(resolve(ROOT, "src/screens/fps/CsMatchScreen.jsx"), "utf8");
  const appShell = readFileSync(resolve(ROOT, "src/AppShell.jsx"), "utf8");
  const contract = readFileSync(resolve(ROOT, "src/platform/contracts/CsMatchResult.js"), "utf8");
  const settle = readFileSync(resolve(ROOT, "src/platform/progress/settleCsMatch.js"), "utf8");
  ck("Replay / MatchResult / CsMatchResult keep one legal completion path", csScreen.includes("toCsMatchResult") && contract.includes("CS_RESULT_SCHEMA") && appShell.includes("settleCsMatch(r)") && settle.includes("settleCsMatch"));

  console.log(`\nCS MR12 completion: ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
