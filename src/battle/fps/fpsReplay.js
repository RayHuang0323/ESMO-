// Saved authoritative frames only. This module never runs a match.
import {CS_PLAYER_POOL_ENCODING,packCsReplayPlayers,unpackCsReplayPlayers} from './fpsReplayPlayerPool.js';
export const CS_REPLAY_SCHEMA = "CsReplay.v1";
const MAPS = new Set(["mirage", "dust2", "inferno"]);
const SCENES = new Set(["legacy", "major.v1"]);
const finitePosition = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const fail = errors => { throw new Error(`無法讀取重播：${errors.slice(0, 3).join("；")}`); };

export function createCsReplay(simulation, { seed, mapKey = simulation?.mapKey, sceneVersion = simulation?.sceneVersion, teamName, opponentName, rawResult } = {}) {
  const simulationCopy = structuredClone(simulation);
  if (Array.isArray(simulationCopy?.frames)) {
    // Preserve one shared immutable round record graph and only expose history
    // that was available at each cursor. No future round leaks on rewind.
    const history = simulationCopy.roundHist || [];
    simulationCopy.frames = simulationCopy.frames.map(frame => ({ ...frame, roundHist: history.slice(0, frame.roundHistCount ?? frame.roundHist?.length ?? 0) }));
  }
  const replay = { schema: CS_REPLAY_SCHEMA, metadata: { seed, mapKey, sceneVersion, teamName: teamName ?? rawResult?.tName ?? "我方", opponentName: opponentName ?? rawResult?.ctName ?? "對手" }, simulation: simulationCopy, rawResult: structuredClone(rawResult) };
  const validation = validateCsReplay(replay);
  if (!validation.ok) fail(validation.errors);
  return replay;
}

export function validateCsReplay(replay) {
  const errors = [];
  const reject = message => { if (errors.length < 8) errors.push(message); };
  if (!replay || typeof replay !== "object") return { ok: false, errors: ["重播檔內容不完整"] };
  if (replay.schema !== CS_REPLAY_SCHEMA) reject("重播檔版本不支援");
  if (replay.encoding != null && !["round-prefix.v1",CS_PLAYER_POOL_ENCODING].includes(replay.encoding)) reject("重播檔編碼不支援");
  const metadata = replay.metadata, sim = replay.simulation, result = replay.rawResult;
  if (!metadata || !MAPS.has(metadata.mapKey) || !SCENES.has(metadata.sceneVersion) || !Number.isSafeInteger(metadata.seed) || [metadata.teamName, metadata.opponentName].some(name => typeof name !== "string" || !name.length || name.length > 120)) reject("地圖、場景或比賽識別資料不完整");
  if (!sim || sim.mapKey !== metadata?.mapKey || sim.sceneVersion !== metadata?.sceneVersion) reject("重播場景資料不一致");
  if (!result || result.mode !== "CS" || !result.id || result.completed !== true || sim?.completed !== true || !["us", "enemy"].includes(sim?.winner) || result.winner !== sim?.winner || result.scoreT !== sim?.tScore || result.scoreCT !== sim?.ctScore || !Number.isFinite(sim?.tScore) || !Number.isFinite(sim?.ctScore)) reject("賽後結果與保存比分不一致");
  if (result && result.win !== (sim?.winner === "us")) reject("賽後勝負資料不一致");
  if (!Array.isArray(sim?.roundHist) || !sim.roundHist.length || sim.roundHist.some(row => !row || typeof row !== "object" || Array.isArray(row))) reject("缺少回合紀錄");
  if (!Array.isArray(sim?.frames) || !sim.frames.length || sim.frames.length > 200000) reject("缺少保存畫面或畫面數量過多");
  if (errors.length) return { ok: false, errors };
  let previousTime = -Infinity, previousRound = -1;
  const historyJSON = sim.roundHist.map(row => JSON.stringify(row));
  for (const frame of sim.frames) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) { reject("保存畫面資料不完整"); break; }
    if (!Number.isFinite(frame.ts) || !Number.isFinite(frame.roundSec) || frame.roundSec < 0 || !Number.isSafeInteger(frame.rnd) || frame.rnd < 0 || frame.rnd < previousRound || frame.ts < previousTime) reject("保存畫面時間不合法");
    previousTime = frame.ts; previousRound = frame.rnd;
    if (!Array.isArray(frame.players) || frame.players.length !== 10 || new Set(frame.players.map(p => p?.id)).size !== 10 || frame.players.some(p => typeof p?.id !== "string" || !p.id || typeof p.name !== "string" || !finitePosition(p.pos) || p.nades != null && !Array.isArray(p.nades))) reject("保存選手或位置資料不完整");
    if (["events", "casts", "comms", "smokes", "mollys", "tracers", "muzzles", "throwables", "droppedGuns", "reactionEvents"].some(key => frame[key] != null && !Array.isArray(frame[key]))) reject("保存事件或訊息資料不完整");
    if (Array.isArray(frame.events) && frame.events.some(event => !event || typeof event !== "object" || typeof event.type !== "string") || Array.isArray(frame.casts) && frame.casts.some(text => typeof text !== "string") || Array.isArray(frame.comms) && frame.comms.some(message => !message || typeof message.name !== "string" || typeof message.text !== "string")) reject("保存事件或訊息內容不完整");
    const count = frame.roundHistCount ?? frame.roundHist?.length;
    const ended = frame.roundEnd?.type === "round-end" && frame.roundEnd.round === frame.rnd + 1 || frame.completed === true && frame === sim.frames.at(-1);
    if (!Number.isSafeInteger(count) || count < 0 || count > sim.roundHist.length || count > frame.rnd + (ended ? 1 : 0) || !Array.isArray(frame.roundHist) || frame.roundHist.length !== count || frame.roundHist.some((row, index) => row !== sim.roundHist[index] && JSON.stringify(row) !== historyJSON[index])) reject("回合紀錄游標不合法");
    if (errors.length) break;
  }
  const last = sim.frames.at(-1);
  if (last?.tScore !== sim.tScore || last?.ctScore !== sim.ctScore) reject("最後畫面與賽後比分不一致");
  return { ok: errors.length === 0, errors };
}

export function readCsReplay(input) {
  let replay;
  try { replay = typeof input === "string" ? JSON.parse(input) : structuredClone(input); }
  catch { fail(["檔案不是有效的重播資料"]); }
  if(replay?.encoding===CS_PLAYER_POOL_ENCODING){
    try{unpackCsReplayPlayers(replay.simulation,replay.playerValuePool);}catch(error){fail([error.message]);}
    delete replay.playerValuePool;
  }
  if (["round-prefix.v1",CS_PLAYER_POOL_ENCODING].includes(replay?.encoding) && Array.isArray(replay.simulation?.frames) && Array.isArray(replay.simulation.roundHist)) {
    const history = replay.simulation.roundHist;
    for (const frame of replay.simulation.frames) {
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) fail(["保存畫面資料不完整"]);
      if (!Number.isSafeInteger(frame.roundHistCount) || frame.roundHistCount < 0 || frame.roundHistCount > history.length) fail(["回合紀錄游標不合法"]);
      frame.roundHist = history.slice(0, frame.roundHistCount);
    }
    delete replay.encoding;
  }
  const validation = validateCsReplay(replay);
  if (!validation.ok) fail(validation.errors);
  return replay;
}

export function serializeCsReplay(replay) {
  const validation = validateCsReplay(replay);
  if (!validation.ok) fail(validation.errors);
  const compact=packCsReplayPlayers(replay.simulation.frames);
  return JSON.stringify({ ...replay, encoding: CS_PLAYER_POOL_ENCODING, playerValuePool:compact.pool, simulation: { ...replay.simulation, frames: compact.frames.map(({ roundHist, ...frame }) => ({ ...frame, roundHistCount: frame.roundHistCount ?? roundHist.length })) } });
}
