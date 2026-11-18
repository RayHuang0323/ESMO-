#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/export_preview_force_setup_v24.mjs — 匯出僵局 Seed 的工具路徑 MatchSetup，給 5644 預覽重現（v24 Sprint 1.3，2026-11-19）
//
//  Seed 120159 是工具路徑的對局（balanceTool.v24，雙方 v2.jungle_invasion），正常畫面走生涯流程進不去。
//  這支在 Node 上把同一份 MatchSetup 存成 JSON，並記下每個版本的預期結果（勝方、結束時間、整場狀態雜湊）。
//  預覽頁面用同一份 setup 組出引擎，再比對雜湊，證明瀏覽器裡跑的就是同一場。
//  用法：node tools/owner_preview/export_preview_force_setup_v24.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { careerContext } from "../lib/careerLiveInputs.mjs";
import { streamHashFnv } from "./preview_force_hash_v24.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = await careerContext();
const { configure, modules, buildBalanceMatchSetup, mirroredRoster } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const SEED = 120159, TEMPLATE = "v2.jungle_invasion", RULESET = "balanceTool.v24";
const binding = () => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: TEMPLATE, choices: {} }).plan);
const tactic = () => ({ blue: { kind: "binding", binding: binding() }, red: { kind: "binding", binding: binding() } });
const { setup } = buildBalanceMatchSetup(SEED, "standard", M, 1, mirroredRoster(SEED, M), tactic(), RULESET);
const expected = {};
for (const variant of ["adaptive.v1.2", "adaptive.v1.3"]) {
  process.env.ESMO_BALANCE_TACTICEXEC = variant;
  const e = configure(SEED, "standard", M, 1, null, tactic(), RULESET).e;
  delete process.env.ESMO_BALANCE_TACTICEXEC;
  expected[variant] = streamHashFnv(e, 3000);
  console.log(variant, JSON.stringify(expected[variant]));
}
fs.writeFileSync(path.join(HERE, "preview_force_setup_v24.json"), JSON.stringify({ seed: SEED, rulesetId: RULESET, template: TEMPLATE, setup: JSON.parse(JSON.stringify(setup)), expected }));
console.log("written preview_force_setup_v24.json");
