// ============================================================================
//  battle/useBattleFeed.js — 核心快照流 → Battle Presentation store 的接線
//  - 呈現層唯一與核心 store 的接觸點：只讀 useGameStore.snapshot，不回寫核心
//  - 用 zustand subscribe：每次換幀（pushFrame 更新 snapshot）觸發一次 ingest
//  - 掛在 <BattlePresentationLayer/>；卸載時取消訂閱
// ============================================================================

import { useEffect, useRef } from "react";
import { useGameStore } from "../useGameStore.js";
import { useBattleStore } from "./battleStore.js";
import { useHeroProgressStore } from "../hero/heroProgressStore.js";
import { useSeasonStore } from "../platform/seasonStore.js";
import { useProfileStore } from "../platform/profileStore.js";
import { selectTeamName, selectOpponentName } from "../platform/matchTeamNames.js";
import { TEAMS } from "../data/roster.js";
import { snapshotToBattleResult } from "./battleResult.js";
import { draftHeroAssign } from "./moba/draftRoster.js";
import { mobaResultToTransaction, mobaMatchId } from "../platform/progress/adapters/mobaProgressAdapter.js";
import { settleMatchThroughSession, outcomeFromBattleResult } from "../platform/progress/settleMatchBoundary.js";
import { captureReplayFrame, finalizeReplay } from "./moba/replay/replayBuffer.js";

/**
 * @param {object|null} draft  Ban/Pick 結果 {picks,bans}（AppShell → GameView → 本 hook）。
 *   Sprint20【E】：只用來決定 BattleResult.players[].heroId（英雄身分），
 *   走 snapshotToBattleResult 既有的 heroAssign 選項；統計/結算規則完全不變。
 *   無 draft → heroAssign 退回 roster.js 的 HERO_ASSIGN（行為與 Sprint19 相同）。
 */
export function useBattleFeed(draft = null, { roster = null, tacticId = null } = {}) {
  const draftRef = useRef(draft);
  draftRef.current = draft;              // 終局那一幀讀最新 draft（訂閱只掛一次）
  useEffect(() => {
    const ingest = useBattleStore.getState().ingest;
    const reset = useBattleStore.getState().reset;
    // S29：開局初始化戰術播報（我方＝藍隊；roster 提供名字/個性 ⇒ 誰在講話）
    useBattleStore.getState().initComms({ roster, tacticId, side: "blue" });
    // 首幀先灌一次現況
    ingest(useGameStore.getState().snapshot);
    // 只在 snapshot 參照改變時 ingest（pushFrame 每幀換新物件）
    const unsub = useGameStore.subscribe((state, prev) => {
      const snap = state.snapshot;
      if (!prev || snap === prev.snapshot) return;
      if (prev.snapshot && snap.ts < prev.snapshot.ts) reset();  // 新對局：先重置
      ingest(snap);
      captureReplayFrame(snap);   // S26：重播取樣（純讀 snapshot；未 begin / 達上限 = no-op）
      // Sprint09：唯一計算點 — 終局只在此產出一份 BattleResult，分送所有消費者
      const bs = useBattleStore.getState();
      if (snap.over && !bs.result) {
        //  Q3.5 驗收：終局畫面的「○○ 獲勝」讀的是 BattleResult.teams[].name，
        //  不是 HUD 那組 props ⇒ 不在這裡接線，同一個畫面就會 HUD 寫「烈焰鳳凰」、
        //  橫幅寫 roster.js 的預設「赤焰軍團」。隊名的唯一來源仍是
        //  `platform/matchTeamNames.js`（HUD／記分板／終局吃同一組值）。
        //  ⚠ 只覆蓋 name：id／tag 等識別欄位維持 roster.js，結算與統計規則不變。
        //  ⚠ 查不到（debug harness、單獨掛 GameView）⇒ 不覆蓋 ⇒ 退回既有預設。
        const ps = useProfileStore.getState();
        const blueName = selectTeamName(ps);
        const redName = selectOpponentName(ps);
        const result = snapshotToBattleResult(snap, bs.log, {
          heroAssign: draftHeroAssign(draftRef.current),
          teams: {
            blue: { ...TEAMS.blue, ...(blueName ? { name: blueName } : {}) },
            red: { ...TEAMS.red, ...(redName ? { name: redName } : {}) },
          },
        });
        bs.setResult(result);                                        // → EndScreen（禁止重新統計）
        //  ── V0D：快速練習是純測試場 ────────────────────────────────────
        //  ⚠ 判斷只讀 `MatchOrigin`（`matchPracticeContext`），**不看畫面也不看路由**。
        //  練習不寫任何永久紀錄：不進英雄熟練度、不進賽季戰績。
        //  Replay **刻意不跳過**——能回看剛剛試的陣容正是快速練習的用途。
        const isPractice = useProfileStore.getState().matchPracticeContext().inPractice;
        if (!isPractice) {
          useHeroProgressStore.getState().recordBattleResult(result);  // → Hero Progress
        }

        // ── Sprint25：賽後結算（此處＝比賽完成邊界，不是 Result Screen 掛載）──
        //    刻意放在引擎終局而不是 BattleEndScreen：玩家就算直接離開 Result 畫面，
        //    獎勵也不會漏發。冪等由 transactionId 保證，重進 Result 不會重複發。
        //    §10 順序：Result → 建 Transaction → Apply → receipt → 才寫 history。
        const profile = useProfileStore.getState();
        const season = useSeasonStore.getState();
        const tx = mobaResultToTransaction(result, {
          players: profile.players ?? [],
          // Milestone E：席位 → 實際上場選手（新秀在 b3 時，XP 要發給新秀而不是板凳）
          lineup: profile.lineup ?? null,
          streak: blueWinStreak(season.history ?? []),   // MOBA 自己的連勝（不讀 CS）
          fansNow: profile.meta?.fans ?? 0,
          //  F1 粉絲來源權重：origin 取自**現役場次**（MatchOrigin.v1）。
          //  沒有場次（debug harness / 舊流程）⇒ null ⇒ 當練習賽算，不會多發。
          origin: profile.matchmaking?.session?.origin ?? null,
        });
        //  ── Milestone O7.1：改走**唯一結算邊界** ────────────────────────
        //  有場次 ⇒ reportMatchResult（場次綁定／防重送／防衝突／追蹤鏈）；
        //  沒有場次（debug harness）⇒ 仍入帳但標記未經權威驗證。
        //  ⚠ 實際入帳一律還是 S25 的 applyMatchProgress，沒有第二套結算。
        if (tx) {
          settleMatchThroughSession({
            mode: "moba",
            outcome: outcomeFromBattleResult(result, mobaMatchId(result)),
            transaction: tx,
          });
        }

        // S26：重播定稿（matchId 與結算同源 → Result 可比對「這場」的重播；
        //      只組裝已擷取的 frames，不觸發任何發獎 / 入史）
        finalizeReplay({
          matchId: mobaMatchId(result),
          events: bs.log,
          // S29：把**本場實際產生的**播報原封存進 Replay（Replay 不重新生成對話）
          comms: useBattleStore.getState().comms,
          resultSummary: { winner: result.winner, score: { ...result.score }, duration: result.duration, mvpId: result.mvpId },
          tacticMeta: result.tactic ?? null,
        });

        //  V0D：練習不計戰績（同上，判斷來自 `matchPracticeContext`）。
        if (!isPractice) {
          useSeasonStore.getState().recordResult(result);            // → Season / History / Analytics
        }
      }
    });
    return () => unsub();
  }, []);
}

/** 我方（藍隊）MOBA 連勝數：從最近一場往回數（history 為時間順序，最新在尾端）。 */
function blueWinStreak(history) {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.winner === "blue") n++;
    else break;
  }
  return n;
}
