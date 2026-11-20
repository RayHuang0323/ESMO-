// Records adaptive.v1.2 full-match stream hashes on the pre-Sprint-1.3 commit (8ae1f5f6), including the stalemate seed.
import fs from "node:fs";
import { execSync } from "node:child_process";
const ROOT = "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const P = await import("file:///" + encodeURI(`${ROOT}/tools/owner_preview/pin_v20_v23_stream.mjs`));
const CASES = [
  ["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null],
  ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null],
  ["career.v24", "v2.jungle_invasion", null, 93001, "mid"],
  ["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 120159, null],
];
const rows = CASES.map((c) => { const r = P.streamHash(P.build(...c)); console.log(P.caseKey(c), JSON.stringify(r)); return { key: P.caseKey(c), ...r }; });
fs.writeFileSync("C:/Users/ifikn/esmo-measure/v24-s13/pin_v12_baseline.json", JSON.stringify({ gitHead: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(), variant: "adaptive.v1.2", rows }, null, 1));
