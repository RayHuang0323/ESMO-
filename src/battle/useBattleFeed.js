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
import { snapshotToBattleResult } from "./battleResult.js";
import { draftHeroAssign } from "./moba/draftRoster.js";
import { mobaResultToTransaction } from "../platform/progress/adapters/mobaProgressAdapter.js";

/**
 * @param {object|null} draft  Ban/Pick 結果 {picks,bans}（AppShell → GameView → 本 hook）。
 *   Sprint20【E】：只用來決定 BattleResult.players[].heroId（英雄身分），
 *   走 snapshotToBattleResult 既有的 heroAssign 選項；統計/結算規則完全不變。
 *   無 draft → heroAssign 退回 roster.js 的 HERO_ASSIGN（行為與 Sprint19 相同）。
 */
export function useBattleFeed(draft = null) {
  const draftRef = useRef(draft);
  draftRef.current = draft;              // 終局那一幀讀最新 draft（訂閱只掛一次）
  useEffect(() => {
    const ingest = useBattleStore.getState().ingest;
    const reset = useBattleStore.getState().reset;
    // 首幀先灌一次現況
    ingest(useGameStore.getState().snapshot);
    // 只在 snapshot 參照改變時 ingest（pushFrame 每幀換新物件）
    const unsub = useGameStore.subscribe((state, prev) => {
      const snap = state.snapshot;
      if (!prev || snap === prev.snapshot) return;
      if (prev.snapshot && snap.ts < prev.snapshot.ts) reset();  // 新對局：先重置
      ingest(snap);
      // Sprint09：唯一計算點 — 終局只在此產出一份 BattleResult，分送所有消費者
      const bs = useBattleStore.getState();
      if (snap.over && !bs.result) {
        const result = snapshotToBattleResult(snap, bs.log, { heroAssign: draftHeroAssign(draftRef.current) });
        bs.setResult(result);                                        // → EndScreen（禁止重新統計）
        useHeroProgressStore.getState().recordBattleResult(result);  // → Hero Progress

        // ── Sprint25：賽後結算（此處＝比賽完成邊界，不是 Result Screen 掛載）──
        //    刻意放在引擎終局而不是 BattleEndScreen：玩家就算直接離開 Result 畫面，
        //    獎勵也不會漏發。冪等由 transactionId 保證，重進 Result 不會重複發。
        //    §10 順序：Result → 建 Transaction → Apply → receipt → 才寫 history。
        const profile = useProfileStore.getState();
        const season = useSeasonStore.getState();
        const tx = mobaResultToTransaction(result, {
          players: profile.players ?? [],
          streak: blueWinStreak(season.history ?? []),   // MOBA 自己的連勝（不讀 CS）
          fansNow: profile.meta?.fans ?? 0,
        });
        if (tx) profile.applyMatchProgress(tx);

        useSeasonStore.getState().recordResult(result);              // → Season / History / Analytics
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
