#!/usr/bin/env node
// tools/owner_preview/diag_preview_hash_v24.mjs — where do the 5644 preview page and Node first differ on the stalemate seed? (v24 Sprint 1.3 diagnostic; read-only)
// Usage: node tools/owner_preview/diag_preview_hash_v24.mjs [outJson]   (needs the 5644 preview running)
import fs from "node:fs";
import { careerContext } from "../lib/careerLiveInputs.mjs";
import { streamTrace } from "./preview_force_hash_v24.js";
import { launchChrome } from "./lib_cdp_chrome.mjs";
import { flowOf } from "./lib_battle_flow.mjs";
const OUT = process.argv[2] ?? null, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const binding = () => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: "v2.jungle_invasion", choices: {} }).plan);
const nodeEngine = () => configure(120159, "standard", M, 1, null, { blue: { kind: "binding", binding: binding() }, red: { kind: "binding", binding: binding() } }, "balanceTool.v24").e;
const url = "http://127.0.0.1:5644/ESMO-/?stalemateSeed=120159", chrome = await launchChrome({}), out = { browser: null };
try {
  const F = flowOf({ chrome, url, sleep });
  if (!(await F.toBattle())) throw new Error("did not reach battle");
  out.browser = await F.ev("return JSON.stringify(navigator.userAgent);");
  const N = streamTrace(nodeEngine(), 3000, -1), B = await F.ev("return JSON.stringify(window.__esmoPreviewForce.trace(-1));");
  out.ticks = { node: N.ticks, page: B.ticks };
  const first = {};
  N.fields.forEach((f, i) => { const hit = N.points.find((p, k) => p[i + 1] !== B.points[k]?.[i + 1]); first[f] = hit ? hit[0] : null; });
  out.firstDifferentCheckpoint = first;
  const hits = Object.values(first).filter((x) => x != null), at = hits.length ? Math.min(...hits) : null;
  out.identicalAllFields = at == null;
  if (at != null) {
    out.rawDiffs = [];
    for (let tick = Math.max(1, at - 9); tick <= at && !out.rawDiffs.length; tick++) {
      const a = streamTrace(nodeEngine(), 3000, tick).raw, b = (await F.ev(`return JSON.stringify(window.__esmoPreviewForce.trace(${tick}));`)).raw;
      a.forEach((p, i) => { for (const k of Object.keys(p)) if (p[k] !== b[i][k]) out.rawDiffs.push({ tick, id: p.id, field: k, node: p[k], page: b[i][k] }); });
    }
  }
} catch (e) { out.error = String(e?.stack ?? e); } finally { try { await chrome.close?.(); } catch { /* closed */ } }
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
