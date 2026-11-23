#!/usr/bin/env node
// ============================================================================
//  tools/c1/explore_det_math_edge.mjs — exploratory: DetMath.v1 vectors in headless Microsoft Edge (C1, 2026-11-23).
//
//  Edge is Chromium/V8 like Chrome, so this is NOT a second browser engine; it is a separately built browser whose V8 version may differ.
//  Same input generator and result hashing as tools/check_det_math_c1.mjs M5/M6. Reports, never gates.
//  Usage: node tools/c1/explore_det_math_edge.mjs [--port=9481] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../src/battle/moba/sim/detMath.js";
import { VECTOR_PLAN, vectorsFor, chunkHashes, resultKey } from "../lib/det_math_vectors_c1.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const EXE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", PORT = Number(arg("port", "9481"));
if (!fs.existsSync(EXE)) { console.log(JSON.stringify({ edge: "not installed" })); process.exit(0); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-edge-c1-"));
const proc = spawn(EXE, [`--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--headless=new", "--disable-gpu",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync", "about:blank"], { stdio: "ignore", windowsHide: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page" && t.webSocketDebuggerUrl); } catch {} }
  if (!target) throw new Error("Edge did not expose a page target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws")), { once: true }); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const evaluate = (expression) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, (m) => (m.error || m.result?.exceptionDetails ? reject(new Error(JSON.stringify(m.error ?? m.result.exceptionDetails).slice(0, 400))) : resolve(m.result.result.value)));
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true } })); });
  const b64 = (p) => Buffer.from(fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)))).toString("base64");
  const DM = b64("../../src/battle/moba/sim/detMath.js"), VE = b64("../lib/det_math_vectors_c1.mjs");
  const ua = await evaluate("return navigator.userAgent;");
  const page = await evaluate(`const D = await import("data:text/javascript;base64,${DM}"), V = await import("data:text/javascript;base64,${VE}");
    const FN = { sin: D.detSin, cos: D.detCos, atan2: D.detAtan2, acos: D.detAcos, asin: D.detAsin, powInt: D.detPowInt }; const out = {};
    for (const f of Object.keys(V.VECTOR_PLAN)) out[f] = V.chunkHashes(V.vectorsFor(f).map((a) => FN[f](...a))); return out;`);
  const FN = { sin: D.detSin, cos: D.detCos, atan2: D.detAtan2, acos: D.detAcos, asin: D.detAsin, powInt: D.detPowInt };
  const same = {}; let total = 0;
  for (const f of Object.keys(VECTOR_PLAN)) { const vs = vectorsFor(f); total += vs.length; const h = chunkHashes(vs.map((a) => FN[f](...a))); same[f] = h.length === page[f].length && h.every((x, i) => x === page[f][i]); }
  const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../fixtures/det_math_divergent_inputs_c1.json", import.meta.url)), "utf8")).inputs;
  const nat = await evaluate(`const V = await import("data:text/javascript;base64,${VE}"); const P = ${JSON.stringify(fixture.map((it) => [it.fn, it.args]))}; return P.map(([f, a]) => V.resultKey(Math[f](...a.map(Number))));`);
  let edgeVsNode = 0, edgeVsChrome = 0;
  fixture.forEach((it, i) => { if (nat[i] !== resultKey(Math[it.fn](...it.args.map(Number)))) edgeVsNode++; if (nat[i] !== resultKey(Number(it.chromeNative))) edgeVsChrome++; });
  const out = { edge: ua, node: process.version, vectors: total, detIdenticalToNode: same, allIdentical: Object.values(same).every(Boolean),
    sprint2aDivergentInputs: { n: fixture.length, edgeNativeDiffersFromNodeNative: edgeVsNode, edgeNativeDiffersFromChrome157Native: edgeVsChrome } };
  console.log(JSON.stringify(out, null, 1));
  if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(out, null, 1));
} finally {
  try { ws?.send(JSON.stringify({ id: ++seq, method: "Browser.close", params: {} })); } catch {}
  await sleep(1500); try { proc.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
