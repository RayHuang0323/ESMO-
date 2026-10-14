#!/usr/bin/env node
// Narrow D repair gate. Synthetic malformed inputs are not match outcomes.
// Read the existing canonical saved replay once; never simulate or roundtrip it.
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { validateCsReplay, readCsReplay } from "../src/battle/fps/fpsReplay.js";

let pass = 0, fail = 0;
const checks = [];
function ck(name, run) {
  try { run(); pass++; checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { fail++; checks.push({ name, result: "FAIL", reason: error.message }); console.error(`FAIL ${name}: ${error.stack}`); }
}
const players = Array.from({ length: 10 }, (_, i) => ({ id: `synthetic-input-${i}`, name: `synthetic-${i}`, side: i < 5 ? "t" : "ct", teamId: i < 5 ? "us" : "enemy", pos: { x: 20 + i, y: 30 }, nades: [] }));
const history = [{ round: 1, winnerTeam: "us" }, { round: 2, winnerTeam: "us" }];
const base = {
  schema: "CsReplay.v1", metadata: { seed: 505001, mapKey: "mirage", sceneVersion: "major.v1", teamName: "合成輸入甲", opponentName: "合成輸入乙" },
  simulation: { mapKey: "mirage", sceneVersion: "major.v1", completed: true, winner: "us", tScore: 2, ctScore: 0, roundHist: history, frames: [
    { fi: 0, ts: 0, rnd: 0, roundSec: 0, players, roundHistCount: 0, roundHist: [], events: [], casts: [], comms: [], tScore: 0, ctScore: 0 },
    { fi: 1, ts: 120, rnd: 1, roundSec: 10, players, roundHistCount: 2, roundHist: history, completed: true, events: [], casts: [], comms: [], tScore: 2, ctScore: 0 },
  ] },
  rawResult: { id: "synthetic-input-only", mode: "CS", completed: true, winner: "us", win: true, scoreT: 2, scoreCT: 0 },
};
const mutate = fn => { const value = structuredClone(base); fn(value); return value; };
function rejected(value) {
  const validation = validateCsReplay(value);
  assert.equal(validation.ok, false, "損壞輸入不得通過");
  assert.ok(validation.errors.length > 0);
  assert.throws(() => readCsReplay(value), error => error instanceof Error && /^無法讀取重播：/.test(error.message) && !/TypeError|not a function|Cannot read/.test(error.message));
}

ck("合成輸入前提合法，與真sim來源明確分開", () => assert.equal(validateCsReplay(base).ok, true));
ck("原casts物件.map崩潰反例在匯入前以中文拒絕", () => rejected(mutate(value => { value.simulation.frames[0].casts = {}; })));
ck("原events物件.forEach崩潰反例在匯入前以中文拒絕", () => rejected(mutate(value => { value.simulation.frames[1].events = {}; })));
ck("comms非陣列在訊息消費前拒絕", () => rejected(mutate(value => { value.simulation.frames[0].comms = {}; })));
ck("其餘renderer消費陣列損壞不接受", () => {
  for (const field of ["smokes", "mollys", "tracers", "muzzles", "throwables", "droppedGuns", "reactionEvents"]) rejected(mutate(value => { value.simulation.frames[0][field] = {}; }));
});
ck("casts文字、comms內容與event基本形狀損壞拒絕", () => {
  for (const [field, content] of [["casts", [3]], ["comms", [{ name: "p" }]], ["events", [null]], ["events", [{ type: 3 }]]]) rejected(mutate(value => { value.simulation.frames[0][field] = content; }));
});
ck("選手nades非陣列在PlayerRow.filter前拒絕", () => rejected(mutate(value => { value.simulation.frames[0].players[0].nades = {}; })));
ck("null、scalar或陣列frame以中文拒絕", () => {
  for (const frame of [null, 3, []]) rejected(mutate(value => { value.simulation.frames[0] = frame; }));
});
ck("compact null frame不在解碼階段丟TypeError", () => {
  const value = mutate(replay => { replay.encoding = "round-prefix.v1"; replay.simulation.frames[0] = null; });
  assert.throws(() => readCsReplay(value), /^Error: 無法讀取重播：保存畫面資料不完整/);
});
ck("null、scalar或陣列round row在render前拒絕", () => {
  for (const row of [null, 3, []]) rejected(mutate(value => { value.simulation.roundHist[0] = row; value.simulation.frames[1].roundHist[0] = row; }));
});
ck("負round游標拒絕", () => rejected(mutate(value => { value.simulation.frames[0].rnd = -1; })));
ck("原rnd0起始count2未來歷史曝光反例拒絕", () => rejected(mutate(value => { value.simulation.frames[0].roundHistCount = 2; value.simulation.frames[0].roundHist = structuredClone(history); })));
ck("錯roundEnd與非末幀completed不能偽造可見歷史", () => {
  for (const patch of [{ roundEnd: { type: "round-end", round: 2 } }, { roundEnd: { type: "wrong", round: 1 } }, { completed: true }]) rejected(mutate(value => { Object.assign(value.simulation.frames[0], patch, { roundHistCount: 1, roundHist: [structuredClone(history[0])] }); }));
});
ck("真同回合roundEnd或唯一completed末幀允許已結算prefix", () => {
  const value = mutate(replay => { Object.assign(replay.simulation.frames[0], { roundEnd: { type: "round-end", round: 1 }, roundHistCount: 1, roundHist: [structuredClone(history[0])] }); });
  assert.equal(validateCsReplay(value).ok, true);
  assert.equal(readCsReplay(value).simulation.frames[1].roundHistCount, 2);
});

const fixturePath = process.env.ESMO_CS_D_INPUT_FIXTURE || "review/cs-major-upgrade/evidence/retention-policy-20261011/d-canonical-replay.json.gz";
let canonical;
ck("唯一現成真Replay全部1111frames與21round仍被接納", () => {
  const gzip = fs.readFileSync(fixturePath);
  const loaded = readCsReplay(gunzipSync(gzip).toString("utf8"));
  assert.equal(loaded.simulation.frames.length, 1111);
  assert.equal(loaded.simulation.roundHist.length, 21);
  assert.equal(loaded.simulation.completed, true);
  canonical = { fixturePath, gzipBytes: gzip.length, gzipSHA256: createHash("sha256").update(gzip).digest("hex"), frameCount: loaded.simulation.frames.length, roundCount: loaded.simulation.roundHist.length, accepted: true };
});
if (process.env.ESMO_CS_D_INPUT_REPORT) fs.writeFileSync(process.env.ESMO_CS_D_INPUT_REPORT, JSON.stringify({ schema: "cs-major-replay-input.v1", authority: "合成壞輸入＋一次唯讀真保存幀；未重模擬或重播完整既有gate", pass, fail, checks, canonical }, null, 2));
console.log(`CS Major Replay Input D: ${pass}/${pass + fail} PASS`);
if (fail) process.exitCode = 1;
