// C6C focused gate: long-match progress must stay a read-only outer-shell view.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (label, condition, detail = "") => {
  checks.push({ label, ok: !!condition, detail });
};

const progress = read("src/screens/fps/CsLongMatchProgress.jsx");
const match = read("src/screens/fps/CsMatchScreen.jsx");
const loading = read("src/screens/fps/CsLoadingScreen.jsx");
const integrationMode = process.argv.includes("--integration");

check("progress component exists", progress.includes("data-testid=\"cs-long-match-progress\""));
check("reads MatchSession activeMatch", progress.includes("session?.activeMatch") && progress.includes("activeMatch?.simulation"));
check("reads authoritative BO3 series", progress.includes("session?.series") && progress.includes("series?.mapPool") && progress.includes("series?.wins"));
check("round and score come from snapshot", progress.includes("snapshot?.rnd") && progress.includes("snapshot?.tScore") && progress.includes("snapshot?.ctScore"));
check("frame bar uses formal snapshot", progress.includes("snapshot?.frameIndex") && progress.includes("snapshot?.totalFrames") && progress.includes("aria-valuenow={progress.frameNumber}"));
check("no ETA or synthetic match percentage", !/estimatedSeconds|etaSeconds|完成百分比|預估秒數/i.test(progress) && !progress.includes("setInterval"));
check("no second gameplay state writer", !progress.includes("saveActiveMatchSnapshot") && !progress.includes("useProfileStore"));
check("liveness watchdog is explicitly UI-only", progress.includes("UI-only liveness watchdog") && progress.includes("不推進 match"));
check("outer-shell integration only", match.includes("CsLongMatchProgress") && !match.includes("onPlaybackState"));
check("resume does not persist mount-time frame zero", match.includes("initialResumeFrame") && match.includes("ignoredInitialResumeFrame"));
check("pre-battle loading has no fake percent", !loading.includes("const [pct") && !loading.includes("${pct}%") && loading.includes("cs-loading-state"));

if (integrationMode) {
  const engine = read("src/battle/fps/EsportsFPS3D.jsx");
  check("C6C remains outer-only beside integrated C5C engine", engine.includes("createFpsMatchPresentation") && !engine.includes("CsLongMatchProgress") && !/import\s+.*EsportsFPS3D/.test(progress));
} else {
  const protectedDiff = spawnSync("git", ["diff", "--name-only", "--", "src/battle/fps/EsportsFPS3D.jsx"], { encoding: "utf8" });
  check("C5C high-conflict engine file untouched", protectedDiff.status === 0 && protectedDiff.stdout.trim() === "", protectedDiff.stdout.trim());
}

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
if (failed.length) {
  console.error(`C6C_PROGRESS_GATE ${checks.length - failed.length}/${checks.length} FAIL`);
  process.exit(1);
}
console.log(`C6C_PROGRESS_GATE ${checks.length}/${checks.length} PASS`);
