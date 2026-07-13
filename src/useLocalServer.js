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
import { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION } from "./platform/contracts/MobaTacticConfig.js";
import { beginReplayCapture } from "./battle/moba/replay/replayBuffer.js";

const TICK_MS = 130;   // 每 130ms 一個模擬步
const DT_SIM = 0.5;    // 每步推進 0.5 模擬秒（約 3.8x 速度；要即時就設成 TICK_MS/1000）

export function useLocalServer() {
  const engineRef = useRef(null);
  const intervalRef = useRef(null);
  const rafRef = useRef(null);
  const lastTick = useRef(0);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current); cancelAnimationFrame(rafRef.current);
    intervalRef.current = null; rafRef.current = null; setPlaying(false);
  }, []);

  const start = useCallback((opts = {}) => {
    stop();
    const { pushFrame, subTRef } = useGameStore.getState();
    const loadout = useHeroProgressStore.getState().getLoadout();   // Sprint08：下場沿用
    const seed = (Date.now() & 0xffff) | 1;
    const eng = new LogicEngine(seed, loadout);
    // Sprint26：開始重播擷取（seed / 戰術只有這裡拿得到；frames 由 useBattleFeed 取樣）
    beginReplayCapture({ seed, config: opts.tactic?.tacticId ? { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name ?? null } : {} });
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
      eng.tick(DT_SIM);
      useGameStore.getState().pushFrame(eng.snapshot());
      lastTick.current = performance.now();
      if (eng.over) stop();
    }, TICK_MS);

    const loop = () => {
      subTRef.current = Math.min(1, (performance.now() - lastTick.current) / TICK_MS);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    setPlaying(true);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);
  return { playing, start, stop, engineRef };
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
