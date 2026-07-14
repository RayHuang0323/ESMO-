// ============================================================================
//  useLocalServer.js  —  驅動水管（Local Server Pattern 的「伺服器」端）
//  - start()：建立 LogicEngine，每 TICK_MS tick 一次並把 snapshot 推進 store
//  - 另一條 rAF 依「距上次 tick 的時間」更新 subTRef（0→1）→ 渲染端平滑內插
//  - stop()：停止
//  多人版：把 setInterval 那段換成 socket.on("snapshot", f => pushFrame(f))，
//          其餘（subTRef 內插、view）完全不動。見檔尾。
// ============================================================================

import { useRef, useState, useCallback, useEffect } from "react";
import { LogicEngine } from "./LogicEngine.js";
import { useGameStore } from "./useGameStore.js";
import { useHeroProgressStore } from "./hero/heroProgressStore.js";
import { useProfileStore } from "./platform/profileStore.js";
import { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION } from "./platform/contracts/MobaTacticConfig.js";
import { beginReplayCapture } from "./battle/moba/replay/replayBuffer.js";
import { buildPlayerStatSlots } from "./battle/moba/mobaRosterAdapter.js";
import { toEnginePlayerMods } from "./battle/moba/mobaPlayerStats.js";

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

export function useLocalServer() {
  const engineRef = useRef(null);
  const intervalRef = useRef(null);
  const rafRef = useRef(null);
  const lastTick = useRef(0);
  const rateRef = useRef(DEFAULT_RATE);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(DEFAULT_RATE);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current); cancelAnimationFrame(rafRef.current);
    intervalRef.current = null; rafRef.current = null; setPlaying(false);
  }, []);

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
        lastTick.current = performance.now();
        if (eng.over) stop();
      }, tickMsFor(r));
    }
  }, [stop]);

  const start = useCallback((opts = {}) => {
    stop();
    const { pushFrame, subTRef } = useGameStore.getState();
    const loadout = useHeroProgressStore.getState().getLoadout();   // Sprint08：下場沿用
    const seed = (Date.now() & 0xffff) | 1;
    const eng = new LogicEngine(seed, loadout);
    // Sprint26：開始重播擷取（seed / 戰術只有這裡拿得到；frames 由 useBattleFeed 取樣）
    beginReplayCapture({ seed, config: opts.tactic?.tacticId ? { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name ?? null } : {} });

    // ── Sprint28：選手能力進引擎（唯一計算點）────────────────────────────
    //   profileStore.players（最新，含天賦）→ getPlayerDerivedStats → 能力 slots
    //   → toEnginePlayerMods → engine.configurePlayers。
    //   對位靠 playerId（b1–b5），不靠名字、不靠索引；TacticScreen / Battle 不各算一份。
    //   ⚠ 必須在 configureMatch **之前**：開局野區入侵在 configureMatch 當下擲骰，
    //     需要打野的 invadeAdj。
    //   紅方＝ AI 對手，無 profileStore 選手 ⇒ 不注入 ⇒ 全隊中性（baseline 行為，
    //     天然對照組）。無先發選手 / 空名單 ⇒ mods 為 null ⇒ 完全不呼叫 ⇒ S27 baseline。
    const players = useProfileStore.getState().players ?? [];
    const playerMods = toEnginePlayerMods({ blue: buildPlayerStatSlots(players, "blue"), red: [] });
    if (playerMods) eng.configurePlayers(playerMods);

    // Sprint24：戰術進引擎（TacticScreen 的 MobaTacticConfig → 行為權重 knobs）。
    //   對手戰術目前固定 STANDARD_OPP_TACTIC（無對手戰術來源，不虛構 AI）。
    //   無 opts.tactic ⇒ 不呼叫 configureMatch，引擎行為與舊版位元一致。
    if (opts.tactic?.tacticId) {
      eng.configureMatch({
        blue: toEngineTactic(opts.tactic),
        red: toEngineTactic(STANDARD_OPP_TACTIC),
        meta: { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name, version: MOBA_TACTIC_VERSION, opponentTacticId: STANDARD_OPP_TACTIC.tacticId },
      });
    }
    engineRef.current = eng;
    const boot = eng.snapshot(); pushFrame(boot); pushFrame(boot); // prev == snapshot
    lastTick.current = performance.now();

    intervalRef.current = setInterval(() => {
      eng.tick(DT_SIM);                    // ⚠ dt 恆為 DT_SIM，與 playbackRate 無關
      useGameStore.getState().pushFrame(eng.snapshot());
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
  }, [stop]);

  useEffect(() => () => stop(), [stop]);
  return { playing, start, stop, engineRef, rate, setRate, rates: PLAYBACK_RATES };
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
