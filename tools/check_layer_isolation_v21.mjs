#!/usr/bin/env node
// ============================================================================
//  tools/check_layer_isolation_v21.mjs — v21 規則集的「層隔離證明」（2026-11-14，Owner Review 決策 5 的前置條件）
//
//  問題：真實性表量的是 balanceTool.v21。v22／v23 的改動如果只經由 v21 沒有的規則層生效，v21 的量測就不該過期。
//  要主張這件事，必須同時有三項證據（任何一項不成立 ⇒ 照舊整輪重測）：
//   L1 結構：v21 規則集沒有 jungleCamp／invasion／safeRoute 這三個層；引擎在 v21 對局裡這些開關全是關的。
//   L2 零呼叫：v21 對局裡，v22／v23 才有的引擎方法被呼叫 0 次。
//   L3 雜湊：v21 對局的整場逐 tick 雜湊＝在 **v21 凍結點（commit 78ccc817，指紋 620196ccea5a8249）** 的原始碼上錄下的值。
//      錄法：`git archive 78ccc817 src tools` 匯出到 repo 外，把 tools/owner_preview/pin_v21_stream.mjs 原樣放進去執行。
//      原始輸出保存在 review/tactic-book-3a/v23_freeze/v21_pins_at_78ccc817.json。
//
//  ⚠ 這支 gate **不會**讓任何量測免於重測。它只提供證據；真實性表的過期規則沒有改（那要 Owner 另外核准）。
//  ⚠ 釘點只涵蓋下面 9 個案例（6 個工具路徑、3 個生涯路徑）。它證明的是「這 9 場逐 tick 相同」，不是「所有輸入都相同」。
//
//  用法：node tools/check_layer_isolation_v21.mjs      （約 1～2 分鐘，9 場整場對局，單一行程）
// ============================================================================
import { createHash } from "node:crypto";
import { CASES, build } from "./owner_preview/pin_v21_stream.mjs";
import { MATCH_RULESETS } from "../src/platform/contracts/matchRuleset.js";
import { SIMULATION_SEMANTICS_FINGERPRINTS } from "../src/platform/contracts/simulationVersion.js";

//  在 78ccc817 的原始碼上錄下的值（順序與 CASES 相同）
const PINNED_AT_V21_FREEZE = ["086f9aafe0a2b069", "ec0ddbffa4d37c59", "50ae78f04c98c9ae", "baab52c9a3ac33f0", "d32bf85c63a8527c", "e44ab310eb5ab600", "8bbe3ea955d9bb96", "de8bc10a81b799ca", "d171f0e768a30622"];
//  v22／v23 才有的引擎方法（v21 對局裡必須 0 次呼叫）
const LATER_METHODS = ["_invadeStepV2", "_invadeEndV2", "_safeWaypointV23", "_safeRouteBlockedV23", "_towerExitV23", "_towerEdgeHoldV23", "_towerEdgeAvoidV23", "_towerEdgeRedecideV23",
  "_ownLeadMinionV23", "_ownWaveSoonV23", "_edgeRegroupPosV23", "_crossActiveV23", "_exitLeadsHomeV23", "_retreatCrossV23", "_pocketThreatV23", "_stopShortV23"];
const LAYER_FLAGS = ["_jungleCampV2", "_invasionV2", "_safeRouteV23", "_towerEdgeV23", "_edgeRedecideV23", "_navSafetyV23", "_quietPocketV23"];

const results = [];
const ck = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;

ck("L0 版本表裡 v21 的指紋仍是凍結值 620196ccea5a8249", SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v21"] === "620196ccea5a8249");
for (const rs of ["balanceTool.v21", "career.v21"]) {
  const L = MATCH_RULESETS[rs]?.layers ?? {};
  ck(`L1 結構：${rs} 沒有 jungleCamp／invasion／safeRoute 層`, !("jungleCamp" in L) && !("invasion" in L) && !("safeRoute" in L), J(Object.keys(L)));
}

CASES.forEach(([rs, tb, tr, seed], i) => {
  const e = build(rs, tb, tr, seed), h = createHash("sha1");
  const flagsOn = LAYER_FLAGS.filter((f) => e[f] === true);
  const missing = LATER_METHODS.filter((m) => typeof e[m] !== "function");
  const calls = {};
  //  只在實例上包一層計數（原樣呼叫、原樣回傳）；雜湊在包了之後算，所以 L3 同時證明這層包裝不影響對局
  for (const m of LATER_METHODS) { const o = e[m]; if (typeof o !== "function") continue; e[m] = function (...a) { calls[m] = (calls[m] ?? 0) + 1; return o.apply(this, a); }; }
  while (!e.over && e.t < 3000) { e.tick(0.5); for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); }
  h.update(`|${e.winner ?? "none"}|${e.t.toFixed(1)}`);
  const got = h.digest("hex").slice(0, 16), tag = `${rs} ${tb}${tr ? " 對 " + tr : ""} seed ${seed}`;
  ck(`L1 引擎開關：${tag} 的 v22／v23 層開關全關`, flagsOn.length === 0 && missing.length === 0, J({ flagsOn, missing }));
  ck(`L2 零呼叫：${tag} 整場 ${LATER_METHODS.length} 個 v22／v23 方法 0 次呼叫`, Object.keys(calls).length === 0, J(calls));
  ck(`L3 雜湊：${tag} 整場逐 tick 雜湊＝v21 凍結點錄下的值`, got === PINNED_AT_V21_FREEZE[i], J({ got, want: PINNED_AT_V21_FREEZE[i] }));
});

const pass = results.filter(Boolean).length;
console.log(`\n${pass === results.length ? "PASS" : "FAIL"} ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
