// ============================================================================
//  useLocalServer.js  —  驅動水管（Local Server Pattern 的「伺服器」端）
//  - start()：建 MatchSetup → 唯一組裝器組出 LogicEngine，每 TICK_MS tick 一次並把 snapshot 推進 store
//  - 另一條 rAF 依「距上次 tick 的時間」更新 subTRef（0→1）→ 渲染端平滑內插
//  - stop()：停止
//  多人版：把 setInterval 那段換成 socket.on("snapshot", f => pushFrame(f))，
//          其餘（subTRef 內插、view）完全不動。見檔尾。
//
//  Phase 3a T4：引擎的建構與 configure* 全部交給 `assembleMatch`（battle/moba/matchAssembler.js），
//  輸入由純函式 `buildLiveMatchSetup`（battle/moba/liveMatchSetup.js）從 opts＋store 快照建成 MatchSetup。
//  本檔只留：讀快照、決定 seed（時鐘 fallback）、規則集壽命、Replay 擷取、呈現層 debug、節拍／追趕／存檔。
//  v20 golden 的 9 個 live 案經這條路逐位元重現（tools/check_live_setup_3a.mjs）。
// ============================================================================

import { useRef, useState, useCallback, useEffect } from "react";
import { useGameStore } from "./useGameStore.js";
import { useHeroProgressStore } from "./hero/heroProgressStore.js";
import { useProfileStore } from "./platform/profileStore.js";
import { aiTeamById } from "./platform/competition/aiTeams.js";
import { beginReplayCapture } from "./battle/moba/replay/replayBuffer.js";
import { assembleMatch } from "./battle/moba/matchAssembler.js";
import { sharedMatchAssemblerDeps } from "./battle/moba/matchAssemblerDeps.js";
import { buildLiveMatchSetup, resolveLiveRuleset, persistedLiveConfigOf } from "./battle/moba/liveMatchSetup.js";
import { matchSetupHash } from "./platform/contracts/matchSetup.js";
//  旗標只在開局時讀一次（resolveLiveRuleset → resolveRulesetForMode），結果隨本場設定落盤。
import { FEATURE_FLAGS } from "./featureFlags.js";
//  DEV 才讀 ?itemsDev=1（見 start() 內；正式 build 由 import.meta.env.DEV 折疊掉）
import { itemsDevRequested } from "./ui/itemsDevFlag.js";
//  ?shot= 對等鉤子：與 golden 相同的逐 tick 取樣（tools/browser_check_live_assembly_parity_3a.mjs）
import { createStreamHasher, engineStreamHash } from "../tools/lib/matchGolden.mjs";

/** 開局失敗一律大聲失敗：setup／組裝被拒代表 app 自己的狀態有問題，不得默默換一套規則開打。 */
const liveStartError = (stage, errors) => {
  const detail = (errors ?? []).map((e) => `${e.code}@${e.field}`).join(", ");
  console.error(`[useLocalServer] ${stage} rejected the live match`, errors);
  return new Error(`Live match could not start (${stage}: ${detail})`);
};

// ============================================================================
//  S29：simTime / presentationTime / playbackRate 明確分離
//
//    simTime          引擎世界時間。**每 tick 固定推進 DT_SIM 模擬秒**，與真實時間、
//                     與瀏覽器 FPS、與 playbackRate 全部無關 ⇒ 同 seed 必得同結果。
//    playbackRate     只改「兩次 tick 之間的真實毫秒數」，不改 dt ⇒ 1×/2×/4×
//                     **不可能**改變模擬結果（S29 §九測試 9、10）。
//    presentationTime 真實牆鐘時間；rAF 只用它算子幀進度 subT（0→1）做內插。
//                     渲染幀率高低只影響「內插得多平滑」，不影響英雄的世界移動速度
//                     （S29 §11 紅線：禁止用 FPS 綁定遊戲速度）。
//
//  tickMs(rate) = DT_SIM × 1000 / rate ⇒ 1× 500ms、2× 250ms、4× 125ms。
//  舊版寫死 TICK_MS=130 + DT_SIM=0.5 ⇒ 固定 3.85 倍速且無法調整。
// ============================================================================
const DT_SIM = 0.5;              // 每個模擬步固定推進 0.5 模擬秒（**永遠不隨倍速改變**）
export const PLAYBACK_RATES = [1, 2, 4];
export const DEFAULT_RATE = 2;   // 22.5 模擬分 ⇒ 約 11 真實分；觀感移速 9 單位/真實秒
export const tickMsFor = (rate) => (DT_SIM * 1000) / rate;
//  恢復追趕每塊最多占用主執行緒的毫秒數（其餘時間讓瀏覽器畫進度條、回應輸入）。只影響追趕的切法，不影響結果。
const CATCH_UP_BUDGET_MS = 60;

export function useLocalServer() {
  const engineRef = useRef(null);
  const intervalRef = useRef(null);
  const rafRef = useRef(null);
  const ffRef = useRef(null);          // S29B3：fastForward 的分塊排程
  const catchUpRef = useRef(null);     // 恢復進行中比賽：分塊追上保存時間的排程
  const lastTick = useRef(0);
  const rateRef = useRef(DEFAULT_RATE);
  const activeMatchRef = useRef(null);
  const lastPersistAt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(DEFAULT_RATE);
  const [fastForwarding, setFastForwarding] = useState(false);
  //  恢復進度（null = 沒有在追趕）{ doneSec, totalSec }。只給畫面顯示，不進引擎、不進存檔。
  const [resumeProgress, setResumeProgress] = useState(null);

  const persistActiveSnapshot = useCallback(({ status = "active", force = false } = {}) => {
    const eng = engineRef.current;
    const info = activeMatchRef.current;
    if (!eng || !info?.sessionId) return;
    const now = Date.now();
    if (!force && now - lastPersistAt.current < 1400) return;
    lastPersistAt.current = now;
    const st = useProfileStore.getState();
    const payload = {
      mode: info.mode,
      snapshot: eng.snapshot(),
      simulationTimeSec: eng.t,
      phase: "battle",
      config: info.config,
      status,
      now,
    };
    if (status === "paused") st.pauseActiveMatch(payload);
    else st.saveActiveMatchSnapshot(payload);
  }, []);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current); cancelAnimationFrame(rafRef.current);
    clearTimeout(ffRef.current); clearTimeout(catchUpRef.current);
    intervalRef.current = null; rafRef.current = null; ffRef.current = null; catchUpRef.current = null;
    setPlaying(false); setResumeProgress(null);
  }, []);

  /**
   * S29B3：Debug「快速完成比賽」——把**同一顆引擎**安全推進到終局。
   *  - 分塊（每個 macrotask 20 模擬秒）+ 每 2 模擬秒 push 一幀
   *    ⇒ Replay 取樣（FRAME_INTERVAL_S=2）與 Timeline 事件流完整，不是跳幀作弊。
   *  - 終局幀走既有 useBattleFeed 流程 ⇒ BattleResult / 發獎（transactionId 冪等）/
   *    Replay 定稿與正常對局**同一條路** ⇒ 不可能重複發獎、不像重新開始。
   *  - 不 new 引擎、不改 dt、不碰 rng ⇒ 結果與讓它自然跑完逐位元相同。
   *  僅供單機測試（UI 由 isDebugMode() 閘門控制；本函式自身不做 UI 判斷）。
   */
  const fastForward = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || eng.over || ffRef.current) return;
    setFastForwarding(true);
    clearInterval(intervalRef.current); intervalRef.current = null;   // 停正常節拍
    const step = () => {
      let sincePush = 0;
      for (let i = 0; i < 40 && !eng.over; i++) {          // 40 tick = 20 模擬秒/塊
        eng.tick(DT_SIM);
        sincePush += DT_SIM;
        if (sincePush >= 2 && !eng.over) { useGameStore.getState().pushFrame(eng.snapshot()); sincePush = 0; }
      }
      useGameStore.getState().pushFrame(eng.snapshot());
      persistActiveSnapshot({ status: "active", force: true });
      lastTick.current = performance.now();
      if (eng.over || eng.t > 5400) { ffRef.current = null; setFastForwarding(false); stop(); return; }   // 5400s = 安全上限
      ffRef.current = setTimeout(step, 0);
    };
    step();
  }, [persistActiveSnapshot, stop]);

  /** 切換播放倍率：只重排 setInterval 的間隔，**不碰引擎、不碰 dt** ⇒ 結果不變。 */
  const setRate = useCallback((next) => {
    const r = PLAYBACK_RATES.includes(next) ? next : DEFAULT_RATE;
    rateRef.current = r; setRateState(r);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      const eng = engineRef.current;
      intervalRef.current = setInterval(() => {
        eng.tick(DT_SIM);                       // ⚠ dt 恆為 DT_SIM
        useGameStore.getState().pushFrame(eng.snapshot());
        //  與 start() 的節拍相同：換倍率後仍要定期保存進度，否則重新整理後會從換倍率那一刻重來
        persistActiveSnapshot({ status: "active" });
        lastTick.current = performance.now();
        if (eng.over) stop();
      }, tickMsFor(r));
    }
  }, [persistActiveSnapshot, stop]);

  const start = useCallback((opts = {}) => {
    stop();
    setFastForwarding(false);
    const { pushFrame, subTRef } = useGameStore.getState();
    //  ── Milestone O7：權威 seed ─────────────────────────────────────────
    //  seed 一律優先取自 **MatchSession**（gateway 在配對時決定、經一次性令牌
    //  啟動後存進 `matchmaking.launch`）。同一個 session 恢復或重播 ⇒ 同一個
    //  引擎 seed ⇒ 同一份初始戰鬥狀態。
    //  ⚠ 引擎要求奇數 seed（既有慣例），因此做一次**決定性**正規化 `| 1`，
    //    同一個 session seed 永遠映射到同一個引擎 seed。
    //  沒有 session 時（debug harness / 舊路徑）才退回舊行為，並標記來源，
    //  讓驗證器與追蹤鏈看得出這一場不是權威場次。
    //  ⚠ 時鐘 fallback 只在這裡讀；builder 是純函式，seed 由這裡傳進去。
    const authoritative = Number.isFinite(opts.seed);
    const seed = authoritative ? ((opts.seed >>> 0) | 1) : ((Date.now() & 0xffff) | 1);

    //  ── Phase 3a T4：規則集壽命 ─────────────────────────────────────────
    //  開局時解析一次（旗標 → resolveRulesetForMode），寫進本場設定（activeMatch.config.ruleset）；
    //  恢復同一個 session 時沿用落盤值、不重讀旗標（正式站中途換 bundle 也不會改變同一場的規則）。
    //  舊存檔沒有 ruleset ⇒ 依目前旗標（＝v20 每次開局讀旗標的行為）。
    //  DEV 網址開關（?heroSkillsDev=1／?itemsDev=1）只在 DEV build 讀，且只會變成 kind:"tool" 規則集；
    //  正式 build 的 import.meta.env.DEV 是常數 false ⇒ 整段與 itemsDevRequested 一起被移除。
    const profileState = useProfileStore.getState();
    const persisted = persistedLiveConfigOf(profileState.matchmaking?.session ?? null, opts.sessionId ?? null);
    const devSwitches = import.meta.env.DEV
      ? { heroSkills: new URLSearchParams(window.location.search).get("heroSkillsDev") === "1", items: itemsDevRequested() }
      : null;
    const { ruleset } = resolveLiveRuleset({
      flags: FEATURE_FLAGS, persisted: persisted?.ruleset ?? null, dev: devSwitches, allowTool: import.meta.env.DEV === true,
    });

    //  ── MatchSetup（純函式 builder）→ 唯一組裝器 ─────────────────────────
    //  疲勞 loadout（Battle Condition UX）、選手素質 slots（Sprint28／Milestone E）、名單（Milestone H／J／M1）、
    //  天賦（heroBattleTalentsV1）、出裝（Item System M3d；沒選 ⇒ standard）、紅方戰術（TD-HI5：對手隊伍 style）、
    //  Objective Layout（v16：恢復時沿用存檔值）全部在 liveMatchSetup.js 推導；呼叫順序與短路在 matchAssembler.js。
    //  heroDatabase 只經共用 deps 注入，不進組裝器。
    const liveInputs = {
      opts, ruleset, seed, seedSource: authoritative ? "session" : "local",
      profile: { players: profileState.players ?? [], lineup: profileState.lineup ?? null },
      heroProgress: { loadout: useHeroProgressStore.getState().getLoadout() },
      opponentTeam: opts.opponentId ? aiTeamById(opts.opponentId) : null,
    };
    const built = buildLiveMatchSetup(liveInputs);
    if (!built.ok) throw liveStartError("MatchSetup", built.errors);
    for (const note of built.notes) console.warn(`[useLocalServer] ${note}`);
    const assembled = assembleMatch(built.setup, sharedMatchAssemblerDeps());
    if (!assembled.ok) throw liveStartError("assembleMatch", assembled.errors);
    const eng = assembled.engine;
    const { objectiveLayout, talentSelection, replayConfig } = assembled.applied;
    const setupHash = matchSetupHash(built.setup);

    const replayRoster = talentSelection ? Object.fromEntries(Object.entries(opts.roster).map(([seat, row]) => [seat, {
      ...row, ...(talentSelection.players[seat] ? { battleTalentId: talentSelection.players[seat].id } : {}),
    }])) : opts.roster;
    // Sprint26：開始重播擷取（seed / 戰術只有這裡拿得到；frames 由 useBattleFeed 取樣）
    // Milestone I-close：連同**本場生效名單**一起交出去。舊 replay 只有 {id,side,role}，
    //   重播時完全不知道誰用哪隻英雄、帶什麼召喚師技能 ⇒ 同一場比賽「現場」與「重播」
    //   是兩份不同的資訊。roster 只有十筆，容量影響可忽略（frames 才是大宗）。
    //   config（tacticId／tacticName／battleTalentIds）由組裝器回傳，形狀與 v20 相同。
    beginReplayCapture({
      seed,
      //  O7：這一場是不是權威場次（由 MatchSession 指定 seed）
      sessionId: opts.sessionId ?? null,
      seedSource: built.setup.meta.seedSource,
      objectiveLayout,
      config: replayConfig,
      roster: replayRoster ?? null,
    });

    //  ── Milestone M1.6：戰鬥判定 Debug（呈現層，留在 hook）────────────────
    //  只有 `?diag=1` / `?shot=` 時開啟。不開 ⇒ 引擎不輸出 `debug` 區塊
    //  ⇒ snapshot 形狀與既有契約逐位元相同（Replay / BattleResult 不受影響）。
    //  debugOn 只是觀測旗標（不改模擬）⇒ 在組裝之後才開與 v20 的位置等價。
    if (typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("diag") === "1" || qs.has("shot")) eng.enableCombatDebug(true);
      //  Phase 3a T4 瀏覽器對等鉤子（只有 ?shot= 才掛，同 __ESMO_COMBAT_FEEDBACK 模式）：
      //  頁面 setup 雜湊、builder 輸入、與 golden 相同的逐 tick 串流雜湊 ⇒ Node 可在同一個 tick 重算比對。
      if (qs.has("shot")) {
        const stream = engineStreamHash(eng, 20);
        const { draft: _draft, ...setupOpts } = opts;
        window.__ESMO_MATCH_SETUP_HASH = setupHash;
        window.__ESMO_MATCH_SETUP = JSON.parse(JSON.stringify(built.setup));
        window.__ESMO_LIVE_SETUP_INPUTS = JSON.parse(JSON.stringify({ ...liveInputs, opts: setupOpts,
          opponentTeam: liveInputs.opponentTeam ? { id: liveInputs.opponentTeam.id, style: liveInputs.opponentTeam.style } : null }));
        window.__ESMO_ENGINE_STREAM_HASH = () => {
          const now = createStreamHasher(1); now.sample(eng);
          return { setupHash, ticks: stream.ticks, t: eng.t, streamHash: stream.hex, stateHash: now.hex, depsFingerprint: assembled.applied.depsFingerprint };
        };
      }
    }

    const activeConfig = {
      phase: "battle",
      draft: opts.draft ?? null,
      tactic: opts.tactic ?? null,
      ...(talentSelection && opts.talentSelections ? { talentSelections: opts.talentSelections } : {}),
      //  M3d：裝備系統真的開著才寫進本場設定（OFF 時存檔形狀與 M3d 之前相同）
      ...(built.buildStrategy ? { buildStrategy: built.buildStrategy } : {}),
      //  v16：本場 Objective Layout（恢復時由 GameView 帶回 opts.objectiveLayout，整場不換）
      objectiveLayout,
      //  Phase 3a T4：本場規則集（恢復時沿用）與 setup 身分雜湊（追蹤／對等用）
      ruleset: built.setup.ruleset,
      matchSetupHash: setupHash,
    };
    activeMatchRef.current = {
      sessionId: opts.sessionId ?? null,
      mode: opts.mode ?? null,
      config: activeConfig,
    };
    if (opts.sessionId) {
      useProfileStore.getState().setActiveMatchContext({ phase: "battle", config: activeConfig });
    }
    // R63：恢復不是重開新局。以同一 seed／同一正式設定 deterministic replay 到
    // 上次保存的模擬時間，再由同一顆 engine 繼續 tick。
    // 恢復卡頓修正：原本整段在主執行緒一次跑完（20 分鐘的比賽 = 2400 tick，慢機器上數十秒完全無回應）。
    // 改成分塊：每塊最多佔主執行緒 CATCH_UP_BUDGET_MS，塊與塊之間讓出給瀏覽器畫進度條。
    // tick 序列（次數、dt、順序）與原本完全相同 ⇒ 決定性不變、結果逐位元相同。
    // ⚠ 追趕期間 engineRef 保持 null：此時離開畫面的 persistActiveSnapshot 會是 no-op，
    //   不會把「還沒追上」的較早時間寫回存檔、害下次恢復倒退。
    const resumeTimeSec = Math.max(0, Number(opts.resumeTimeSec) || 0);
    const beginLive = () => {
      catchUpRef.current = null;
      setResumeProgress(null);
      engineRef.current = eng;
      const boot = eng.snapshot(); pushFrame(boot); pushFrame(boot); // prev == snapshot
      lastTick.current = performance.now();
      intervalRef.current = setInterval(() => {
        eng.tick(DT_SIM);                    // ⚠ dt 恆為 DT_SIM，與 playbackRate 無關
        useGameStore.getState().pushFrame(eng.snapshot());
        persistActiveSnapshot({ status: "active" });
        lastTick.current = performance.now();
        if (eng.over) stop();
      }, tickMsFor(rateRef.current));

      // presentationTime：只用來算子幀進度（0→1）供渲染內插。
      //   渲染 FPS 高低 ⇒ 只影響內插取樣密度，**不影響英雄的世界移動速度**。
      const loop = () => {
        subTRef.current = Math.min(1, (performance.now() - lastTick.current) / tickMsFor(rateRef.current));
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      setPlaying(true);
    };
    engineRef.current = null;   // 上一場／上一次的引擎不得在追趕期間被存檔或快轉碰到
    let replayGuard = 0;
    const needsCatchUp = () => !eng.over && eng.t < resumeTimeSec && replayGuard < 12000;
    if (!needsCatchUp()) { beginLive(); return; }
    setResumeProgress({ doneSec: 0, totalSec: resumeTimeSec });
    const catchUp = () => {
      const until = performance.now() + CATCH_UP_BUDGET_MS;
      while (needsCatchUp() && performance.now() < until) { eng.tick(DT_SIM); replayGuard += 1; }
      if (!needsCatchUp()) { beginLive(); return; }
      setResumeProgress({ doneSec: eng.t, totalSec: resumeTimeSec });
      catchUpRef.current = setTimeout(catchUp, 0);
    };
    catchUpRef.current = setTimeout(catchUp, 0);
  }, [persistActiveSnapshot, stop]);

  const pause = useCallback(() => {
    persistActiveSnapshot({ status: "paused", force: true });
    stop();
  }, [persistActiveSnapshot, stop]);

  useEffect(() => () => {
    // Battle view 卸載＝玩家離開或 refresh；完成後 session 已是 terminal，
    // 這個寫入會自然 no-op，不會覆蓋 finished result。
    persistActiveSnapshot({ status: "paused", force: true });
    stop();
  }, [persistActiveSnapshot, stop]);
  return { playing, start, stop, pause, fastForward, fastForwarding, engineRef, rate, setRate, rates: PLAYBACK_RATES, resumeProgress };
}

// ── 多人版（示意）──────────────────────────────────────────────────────────
// export function useRemoteServer(socket) {
//   useEffect(() => {
//     const { pushFrame, subTRef } = useGameStore.getState();
//     socket.on("snapshot", (frame) => { pushFrame(frame); /* 重置由 pushFrame 處理 */ });
//     let last = performance.now(), raf;
//     const loop = (now) => { subTRef.current = Math.min(1, (now - last) / SERVER_TICK_MS); raf = requestAnimationFrame(loop); };
//     socket.on("snapshot", () => { last = performance.now(); });
//     raf = requestAnimationFrame(loop);
//     return () => { socket.off("snapshot"); cancelAnimationFrame(raf); };
//   }, [socket]);
// }
