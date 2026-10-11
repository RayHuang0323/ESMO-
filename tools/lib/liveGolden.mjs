// ============================================================================
//  tools/lib/liveGolden.mjs — v20 golden 的 Live 輸入重建（Phase 3a Task 7 由 check_live_setup_3a 抽出）
//
//  把 tools/fixtures/match_golden_v20.json 的 live 案例重建成「Live hook 實際會送進 prepareLiveMatch 的東西」：
//  app 形狀的 roster（GameView → draftRoster 的列）、店內快照（players／lineup／loadout）、旗標解析後的規則集、對手隊伍。
//
//  共用者：check_live_setup_3a（逐案驗 Live builder）與 check_match_setup_3a（跨模式一致：Live 包裝 vs 手編 setup）。
// ============================================================================
import { heroById } from "../../src/data/heroDatabase.js";
import { mobaTacticById } from "../../src/platform/contracts/MobaTacticConfig.js";
import { aiTeamById } from "../../src/platform/competition/aiTeams.js";
import { resolveLiveRuleset } from "../../src/battle/moba/liveMatchSetup.js";

/** hook 只決定 seed 的來源並交出**原始值**（session seed 或時鐘值）；正規化在 builder（normalizeLiveSeed）。 */
export const hookSeed = (opts, fallback = 0x1234) => {
  const authoritative = Number.isFinite(opts.seed);
  return { seed: authoritative ? opts.seed : fallback, seedSource: authoritative ? "session" : "local" };
};

/** golden 錄的是 { heroId, spells }；app（GameView → draftRoster）的列另外帶 player／hero（中文名）／lane。 */
export const appRow = (seat, r) => ({ player: `P-${seat}`, heroId: r.heroId, hero: heroById(r.heroId)?.zh ?? r.heroId, lane: null, spells: r.spells });
export const appRoster = (rows) => Object.fromEntries(Object.entries(rows).map(([s, r]) => [s, appRow(s, r)]));

/** golden live 案 → hook 的 opts。sessionId 可覆寫（預設與 check_live_setup_3a 相同）。 */
export const goldenLiveOpts = (c, G, { sessionId = `golden-${c.id}` } = {}) => {
  const p = c.params;
  return {
    seed: c.seed,
    roster: p.noRoster ? undefined : appRoster(G.liveRosters[String(c.seed)]),
    tactic: p.tacticId ? mobaTacticById(p.tacticId) : undefined,
    buildStrategy: p.buildStrategy,
    talentSelections: c.liveOpts.talentSelections ?? undefined,
    opponentId: c.liveOpts.opponentId,
    sessionId, mode: "moba",
  };
};
export const goldenLiveCtx = (c, G) => (c.params.noPlayers ? { players: [], lineup: null } : { players: G.players, lineup: G.lineup });

/**
 * prepareLiveMatch 的入參（＝ useLocalServer.start 交給它的東西）。
 * @param {object} c       golden live 案
 * @param {object} golden  golden 檔（要 inputs 與 featureFlags）
 */
export function goldenLiveInputs(c, golden, { sessionId } = {}) {
  const G = golden.inputs;
  const opts = goldenLiveOpts(c, G, sessionId === undefined ? {} : { sessionId });
  const { seed, seedSource } = hookSeed(opts);
  const ctx = goldenLiveCtx(c, G);
  return {
    opts, seed, seedSource,
    ruleset: resolveLiveRuleset({ flags: Object.freeze({ ...golden.featureFlags }), dev: null, allowTool: false }).ruleset,
    profile: { players: ctx.players, lineup: ctx.lineup }, heroProgress: { loadout: G.defaultLoadout },
    opponentTeam: opts.opponentId ? aiTeamById(opts.opponentId) : null,
  };
}
