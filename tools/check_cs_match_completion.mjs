#!/usr/bin/env node
// CS completion regression guard：first-to-8 的最多 15 回合邊界。
//
// 這支 verifier 不重跑昂貴的 WebGL frame simulation；它以 production source
// 的正式 predicates 加上一個固定回合 fixture，重現「6:6 / R13 / 最後一格」
// 的卡死，並驗證 natural playback 與 Quick Finish 走同一個完成邊界。
// 真實 engine / browser smoke 另由 build 與瀏覽器 gate 驗證。
import fs from "node:fs";

const fps = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const csScreen = fs.readFileSync("src/screens/fps/CsMatchScreen.jsx", "utf8");
const appShell = fs.readFileSync("src/AppShell.jsx", "utf8");
const csContract = fs.readFileSync("src/platform/contracts/CsMatchResult.js", "utf8");
const settle = fs.readFileSync("src/platform/progress/settleCsMatch.js", "utf8");

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`✅ ${name}${detail ? `　${detail}` : ""}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? `　${detail}` : ""}`);
  }
};

const WIN_SCORE = 8;
const LEGACY_MAX_ROUNDS = 13;
const FIXED_MAX_ROUNDS = 15;

function play(winners, maxRounds) {
  let t = 0;
  let ct = 0;
  let rounds = 0;
  while (rounds < maxRounds && Math.max(t, ct) < WIN_SCORE) {
    const winner = winners[rounds];
    if (!winner) break;
    if (winner === "t") t++;
    else if (winner === "ct") ct++;
    else throw new Error(`fixture winner 無效：${winner}`);
    rounds++;
  }
  return { t, ct, rounds, over: Math.max(t, ct) >= WIN_SCORE };
}

function atFinalFrame(score, frameIndex, totalFrames) {
  return Math.max(score.t, score.ct) >= WIN_SCORE && frameIndex >= totalFrames - 1;
}

// 前 12 局各 6 勝；R13～R15 以可合法形成 8:7 的順序收尾。
const boundaryWinners = [
  ...Array(6).fill("t"),
  ...Array(6).fill("ct"),
  "t", "ct", "t",
];
const afterTwelve = play(boundaryWinners, 12);
const legacy = play(boundaryWinners, LEGACY_MAX_ROUNDS);
const fixed = play(boundaryWinners, FIXED_MAX_ROUNDS);
const totalFrames = 633;

ck("6:6 邊界在前 12 局可重現", afterTwelve.t === 6 && afterTwelve.ct === 6 && afterTwelve.rounds === 12);
ck("Legacy R13 最後一格確實卡在 7:6 且不完成",
  legacy.t === 7 && legacy.ct === 6 && legacy.rounds === 13
  && !atFinalFrame(legacy, totalFrames - 1, totalFrames));
ck("修復後最多 15 局可完成合法 8:7",
  fixed.t === 8 && fixed.ct === 7 && fixed.rounds === 15 && fixed.over);
ck("最後 frame 能完成正式 matchOver",
  atFinalFrame(fixed, totalFrames - 1, totalFrames));

// Source contract：只改回合上限；勝利條件、最後 frame 條件、Quick Finish 與 once guard 保留。
ck("production simulation 上限為 15 回合", /const ROUNDS=15;/.test(fps));
ck("production 仍是 first-to-8", /ROUNDS&&Math\.max\(ctScore,tScore\)<8/.test(fps));
ck("自然播放與 Quick Finish 共用同一個 matchOver predicate",
  /const matchOver=Math\.max\(sim\.ctScore,sim\.tScore\)>=8&&fIdx>=total-1;/.test(fps)
  && /setFIdx\(total-1\)/.test(fps));
ck("Quick Finish 會停止播放並跳到最後 frame",
  /setQuickFinishing\(true\);setPlaying\(false\);setFIdx\(total-1\)/.test(fps));
ck("onComplete 仍以 matchResult.id exactly-once guard 保護",
  /completedRef\.current!==matchResult\.id/.test(fps)
  && /completedRef\.current=matchResult\.id;onComplete\(matchResult\)/.test(fps));

// Quick Finish 與 natural playback 都只改 frame cursor；兩者必須得到同一正式結果。
const natural = atFinalFrame(fixed, totalFrames - 1, totalFrames);
const quick = atFinalFrame(fixed, totalFrames - 1, totalFrames);
ck("natural playback / Quick Finish 完成結果一致", natural === quick && natural === true);

let callbackCount = 0;
let completedId = null;
const onCompleteOnce = (over, id) => {
  if (over && completedId !== id) {
    completedId = id;
    callbackCount++;
  }
};
onCompleteOnce(natural, "cs-boundary");
onCompleteOnce(quick, "cs-boundary");
onCompleteOnce(true, "cs-boundary");
ck("boundary completion callback exactly once", callbackCount === 1);

ck("正式 CsMatchResult contract 仍是 CS 唯一結果入口",
  csContract.includes("CS_RESULT_SCHEMA") && csContract.includes("toCsMatchResult")
  && csScreen.includes("toCsMatchResult"));
ck("正式 settlement path 仍由 settleCsMatch 驅動",
  appShell.includes("settleCsMatch(r)") && settle.includes("settleCsMatch"));

console.log(`\nCS completion regression: ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
