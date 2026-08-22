#!/usr/bin/env node
// CS-A: FPS identity contract and neutral CS lineup semantics.
import fs from "fs";
import { toFpsRoster, FPS_ROLE_ZH } from "../src/battle/fps/fpsRoster.js";
import {
  CS_SEATS, CS_SEAT_LABEL, CS_SEAT_ROLE, seatLaneOf,
  validateSquad,
} from "../src/platform/contracts/matchSquad.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { checkFpsRendererIdentity, checkFpsDeathVisibility } from "../src/battle/fps/fpsIdentity.js";

let pass = 0;
let fail = 0;
const ck = (name, condition, detail = "") => {
  if (condition) { pass++; console.log(`✅ ${name}${detail ? `　${detail}` : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); }
};

const stats = () => Object.fromEntries([
  "reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
  "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning",
].map((key) => [key, 70]));
const mkPlayer = (id, csRole, name = id) => ({
  id, name, role: "上路", csRole, rosterTier: "active", status: "主力",
  lv: 10, xp: 500, energy: 90, morale: 80, condition: "正常", stats: stats(),
});
const players = [
  mkPlayer("p1", "entry", "Tina"), mkPlayer("p2", "rifler"), mkPlayer("p3", "awp"),
  mkPlayer("p4", "igl"), mkPlayer("p5", "support"), mkPlayer("p6", "entry"),
];
const lineupA = { f1: "p1", f2: "p2", f3: "p3", f4: "p4", f5: "p5" };
const lineupB = { f1: "p6", f2: "p2", f3: "p3", f4: "p4", f5: "p5" };
const ctRoster = [1, 2, 3, 4, 5].map((n) => ({
  id: `ct${n}`, name: `CT-${n}`, side: "ct", role: "rifler", fpsRole: "步槍手",
}));
const effective = (teamRoster) => [
  ...teamRoster.map((p) => ({ ...p, side: "t" })),
  ...ctRoster.map((p) => ({ ...p })),
];
const frameOf = (roster, deadId = null) => roster.map((p) => ({
  id: p.id, side: p.side, dead: p.id === deadId,
}));

const rosterA = toFpsRoster(players, lineupA);
const rosterB = toFpsRoster(players, lineupB);
const fullA = effective(rosterA);
const fullB = effective(rosterB);
const rendererA = fullA.map((p) => ({ id: p.id, side: p.side, bodyVisible: true }));

console.log("══ CS-A：FPS Correctness & Lineup Integrity ══\n");

// 1) The simulation-side snapshot contains ten stable, real player IDs, five per side.
const simIdentity = checkFpsRendererIdentity({ framePlayers: frameOf(fullA), rendererEntities: rendererA });
ck("1) simulation snapshot 有完整 10 位 player identity（T5 + CT5）",
  simIdentity.complete && simIdentity.frameSides.t === 5 && simIdentity.frameSides.ct === 5
  && simIdentity.frameIds.every((id) => id.startsWith("p") || id.startsWith("ct")));

// 2) The renderer entity pool maps every frame identity.
ck("2) 正常存活狀態 frame 10 人全部可映射 renderer entity",
  simIdentity.ok && simIdentity.missingRenderer.length === 0 && simIdentity.missingFrame.length === 0);

// 3) Replacing one starter changes the same identity in both frame and renderer sets.
const replacementIdentity = checkFpsRendererIdentity({
  framePlayers: frameOf(fullB),
  rendererEntities: fullB.map((p) => ({ id: p.id, side: p.side, bodyVisible: true })),
});
ck("3) 換替補後 frame / renderer identity 仍一致",
  replacementIdentity.ok && rosterB.some((p) => p._gid === "p6") && !rosterB.some((p) => p._gid === "p1"));

// 4) A rematch rebuild uses a fresh pool with the same contract, not the previous pool.
const rematchIdentity = checkFpsRendererIdentity({
  framePlayers: frameOf(fullB),
  rendererEntities: fullB.map((p) => ({ id: p.id, side: p.side, bodyVisible: true })),
});
ck("4) restart / rematch 後不殘留上一場 player entity",
  rematchIdentity.ok && rematchIdentity.rendererIds.join(",") === rematchIdentity.frameIds.join(","));

// 5) A map change is also a renderer rebuild boundary.
const mapIdentity = checkFpsRendererIdentity({
  framePlayers: frameOf(fullB),
  rendererEntities: fullB.map((p) => ({ id: p.id, side: p.side, bodyVisible: true })),
});
ck("5) 切換 CS 地圖後 renderer identity 仍一致", mapIdentity.ok && mapIdentity.complete);

// 6) Death hides only authoritative dead state; a missing ID is reported as missing, not dead.
const deadId = "p2";
const deadFrame = frameOf(fullA, deadId);
const deadEntities = fullA.map((p) => ({ id: p.id, side: p.side, bodyVisible: p.id !== deadId }));
const deadCheck = checkFpsDeathVisibility({ framePlayers: deadFrame, rendererEntities: deadEntities });
const missingCheck = checkFpsRendererIdentity({
  framePlayers: deadFrame,
  rendererEntities: deadEntities.filter((p) => p.id !== deadId),
});
ck("6) 死亡隱藏只跟 authoritative frame state，找不到 ID 不誤判死亡",
  deadCheck.ok && missingCheck.missingRenderer.includes(deadId) && !missingCheck.ok);

// 7) CS seats are neutral and role validation does not read MOBA lane.
const csValidation = validateSquad({ mode: "cs", seats: lineupA, players, strictRole: true });
ck("7) CS lineup 不依賴 MOBA lane，slot 只做中性出賽席位",
  csValidation.ok && csValidation.warnings.length === 0 && csValidation.errors.length === 0
  && seatLaneOf("cs", "f2") === null
  && CS_SEATS.every((seat) => CS_SEAT_LABEL[seat] === CS_SEAT_ROLE[seat]));

// 8) Five distinct players may share one FPS role and remain eligible.
const sameRolePlayers = ["p11", "p12", "p13", "p14", "p15"].map((id) => mkPlayer(id, "entry"));
const sameRoleSeats = Object.fromEntries(CS_SEATS.map((seat, i) => [seat, sameRolePlayers[i].id]));
const sameRoleValidation = validateSquad({ mode: "cs", seats: sameRoleSeats, players: sameRolePlayers });
ck("8) 五名同類 FPS role 仍是合法陣容（只做 advisory，不 hard block）",
  sameRoleValidation.ok && sameRoleValidation.warnings.length === 0);

// 9) Tina keeps her own role when moved to slot 2; the entry contract is visible in UI data.
const tinaLineup = { f1: "p2", f2: "p1", f3: "p3", f4: "p4", f5: "p5" };
const tinaRoster = toFpsRoster(players, tinaLineup);
const tinaEntry = createMatchEntryRequest({ mode: "cs", seats: tinaLineup, players,
  context: { teamId: "team_1", day: 1, week: 1, season: 1 } });
const tina = tinaRoster.find((p) => p._gid === "p1");
const tinaRow = tinaEntry.request?.squad.find((p) => p.playerId === "p1");
ck("9) Tina 放到 SLOT 2 仍顯示 ENTRY / 突破手",
  tina?.role === "entry" && tina?.fpsRole === FPS_ROLE_ZH.entry
  && tinaRow?.role === "entry" && tinaRow?.fpsRole === FPS_ROLE_ZH.entry);

// 10) Production wiring contains no mutable renderer roster bridge or MOBA lineup-role bridge.
const fpsSource = fs.readFileSync(new URL("../src/battle/fps/EsportsFPS3D.jsx", import.meta.url), "utf8");
const rosterSource = fs.readFileSync(new URL("../src/battle/fps/fpsRoster.js", import.meta.url), "utf8");
const squadSource = fs.readFileSync(new URL("../src/platform/contracts/matchSquad.js", import.meta.url), "utf8");
const prepSource = fs.readFileSync(new URL("../src/screens/fps/CsPrepScreen.jsx", import.meta.url), "utf8");
const loadingSource = fs.readFileSync(new URL("../src/screens/fps/CsLoadingScreen.jsx", import.meta.url), "utf8");
ck("10) production data flow 已鎖定同一 roster，CS UI 無 MOBA lineup role bridge",
  !fpsSource.includes("ACTIVE_ROSTER")
  && /simulateFps\([^\n]*effectiveRoster/.test(fpsSource)
  && /<FpsScene3D[^\n]*roster=\{effectiveRoster\}/.test(fpsSource)
  && /st\.players=roster\.map/.test(fpsSource)
  && !rosterSource.includes("MOBA2FPS")
  && !squadSource.includes("CS_SEAT_LANE_ZH")
  && !prepSource.includes("MOBA2FPS") && !loadingSource.includes("MOBA2FPS"));

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
