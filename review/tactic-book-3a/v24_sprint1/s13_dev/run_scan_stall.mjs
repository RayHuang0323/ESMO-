// Sequential, one child at a time. Tool configs inv, AB, BA on 100 development seeds each (120001..120199 odd).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const dir = "C:/Users/ifikn/esmo-measure/v24-s13", CFGS = ["inv", "AB", "BA"], TOTAL = 100, t0 = Date.now();
const count = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).length : 0);
for (const cfg of CFGS) {
  const out = `${dir}/scan_stall_${cfg}.jsonl`;
  while (count(out) < TOTAL) {
    const d = count(out), n = Math.min(20, TOTAL - d);
    const r = spawnSync(process.execPath, ["--max-old-space-size=1536", `${dir}/scan_stall.mjs`, String(120001 + d * 2), String(n), "2", cfg, out], { stdio: ["ignore", "ignore", "inherit"], cwd: "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0" });
    if (r.status !== 0) { console.log(`child failed ${r.status}`); process.exit(1); }
    const now = CFGS.reduce((a, c) => a + count(`${dir}/scan_stall_${c}.jsonl`), 0), el = (Date.now() - t0) / 60000, fill = Math.round(20 * now / 300);
    console.log(`[${"█".repeat(fill)}${"░".repeat(20 - fill)}] ${now}/300 (${cfg}) ${el.toFixed(1)} min, ETA ${(el / now * (300 - now)).toFixed(1)} min`);
  }
}
console.log("ALLDONE");
