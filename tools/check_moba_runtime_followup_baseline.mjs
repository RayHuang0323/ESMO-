#!/usr/bin/env node
// Read-only same-seed skill-off trajectory comparison against an explicit clean v12 root.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { modules as candidateModules, configure as candidateConfigure } from "./balance/moba_items_balance_runner.mjs";

if (process.env.ESMO_BALANCE_SKILLS === "on") throw new Error("skill-off audit requires ESMO_BALANCE_SKILLS unset");
const arg = process.argv.find((x) => x.startsWith("--baseline-root="));
if (!arg) throw new Error("provide --baseline-root=<clean main worktree>");
const root = resolve(arg.slice("--baseline-root=".length));
const baseline = await import(pathToFileURL(resolve(root, "tools/balance/moba_items_balance_runner.mjs")).href);
const [BM, CM] = await Promise.all([baseline.modules(), candidateModules()]);
for (const seed of [1, 7, 42, 715, 1000, 2024, 8080, 9091, 1337, 2718]) {
  const a = baseline.configure(seed, "standard", BM).e;
  const b = candidateConfigure(seed, "standard", CM).e;
  for (let step = 0; step < 7200 && (!a.over || !b.over); step++) {
    a.tick(.5); b.tick(.5);
    if (step % 20 === 0 || a.over || b.over) assert.deepEqual(b.snapshot(), a.snapshot(), `seed ${seed} step ${step}`);
  }
  assert.equal(a.over, b.over, `seed ${seed} finished`);
  assert.equal(a.winner, b.winner, `seed ${seed} winner`);
  console.log(`PASS skill-off seed ${seed}: trajectory, winner, finished identical`);
}
console.log("MOBA v13 skill-off vs clean v12: 10/10 per-seed diff 0");
