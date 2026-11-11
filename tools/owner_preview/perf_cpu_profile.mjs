#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_cpu_profile.mjs — 對戰主執行緒 CPU 取樣（2026-11-11；量測工具，不是 gate；不改任何程式）
//  CDP Profiler 取樣 4× 導播 15 秒，依函式（self time）與檔案彙總。dev server 上函式名未壓縮，最好讀。
//  執行：ESMO_EXTERNAL_URL=... ESMO_REVIEW_OUT=<資料夾> ESMO_PERF_LABEL=... node tools/browser/run-gate.mjs tools/owner_preview/perf_cpu_profile.mjs --timeout 900000 -- --headed
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";
import { flowOf } from "./lib_battle_flow.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-cpu-profile";
const WARM_MS = Number(process.env.ESMO_PROFILE_WARM_MS ?? 30000);
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: `MOBA CPU profile（${LABEL}）`, timeoutMs: 850_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const { click, toBattle } = flowOf({ chrome, url, sleep });
    await chrome.send("Emulation.setDeviceMetricsOverride", { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const ok = await toBattle();
    ck("進入 MOBA 戰鬥", ok);
    if (!ok) return;
    await click('[data-testid="match-speed-4"]');
    await sleep(WARM_MS);
    await chrome.send("Profiler.enable");
    await chrome.send("Profiler.setSamplingInterval", { interval: 200 });
    await chrome.send("Profiler.start");
    await sleep(15000);
    const { profile } = await chrome.send("Profiler.stop");
    const dts = profile.timeDeltas; const ids = profile.samples;
    const self = new Map();
    for (let i = 0; i < ids.length; i++) self.set(ids[i], (self.get(ids[i]) ?? 0) + dts[i]);
    const total = dts.reduce((a, b) => a + b, 0);
    const byFn = new Map(); const byFile = new Map();
    for (const n of profile.nodes) {
      const t = self.get(n.id) ?? 0; if (!t) continue;
      const file = (n.callFrame.url || "(native)").split("/").pop().split("?")[0];
      const k = `${n.callFrame.functionName || "(anon)"} @ ${file}:${n.callFrame.lineNumber}`;
      byFn.set(k, (byFn.get(k) ?? 0) + t); byFile.set(file, (byFile.get(file) ?? 0) + t);
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, ms: +(v / 1000).toFixed(0), pct: +(100 * v / total).toFixed(1) }));
    const res = { label: LABEL, url, totalMs: +(total / 1000).toFixed(0), byFile: top(byFile, 25), byFn: top(byFn, 60) };
    writeFileSync(`${OUT}/${LABEL}-cpuprofile.json`, JSON.stringify(res, null, 1));
    console.log("FILES"); for (const r of res.byFile) console.log(String(r.pct).padStart(5), r.k);
    console.log("FNS"); for (const r of res.byFn.slice(0, 45)) console.log(String(r.pct).padStart(5), r.k);
    ck("有取樣", ids.length > 1000);
  },
});
await finishGate(result);
