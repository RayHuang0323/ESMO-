// ============================================================================
//  GameRouter.js — 賽事流程狀態機（純 JavaScript，無 React / 無引擎相依）
//
//  職責（只有這五件事）：
//    GameType     → 由 matchFlows 查表決定流程
//    Match Flow   → prep → matching → (draft) → tactic → battle → result
//    Stage        → 目前階段 + next / back / reset
//    BattleConfig → 持有並驗證（不做資料轉換）
//    BattleResult → 接收並驗證（不做回寫；回寫是宿主 recordMatch 的事）
//
//  比照專業經營模擬遊戲（FM 模式）：
//    Router 純邏輯、可序列化（snapshot()）、可在 Node headless 跑
//    → 未來賽季批次模擬（AI 隊互打）可直接重用，零改動。
//
//  邊界鐵律：本檔永不 import 任何 Battle Engine、React、Zustand、DOM。
//  宿主（EsportsGame，Phase 3 接線）透過 subscribe 監聽事件：
//    BATTLE_START    → 宿主依 gameType 掛載對應引擎元件
//    BATTLE_COMPLETE → 宿主呼叫 game.recordMatch(result) 回寫經營層
//    EXIT            → 宿主返回主選單
// ============================================================================

import { STAGE, ROUTER_EVENT } from "./stages.js";
import { getFlow } from "./matchFlows.js";
import { createBattleConfig, validateBattleConfig } from "../contracts/BattleConfig.js";
import { validateBattleResult } from "../contracts/BattleResult.js";

export class GameRouter {
  /**
   * @param {{ gameType: string }} opts
   */
  constructor({ gameType }) {
    this.flow = getFlow(gameType); // 不合法 gameType 直接 throw（fail fast）
    this.gameType = gameType;
    this.stageIndex = 0;
    this.battleConfig = createBattleConfig({ gameType });
    this.battleResult = null;
    this.finished = false;
    this._listeners = new Set();
  }

  // ── 讀取 ──────────────────────────────────────────────────────────────
  get stage() { return this.flow.stages[this.stageIndex]; }
  get isBattle() { return this.stage === STAGE.BATTLE; }
  get isResult() { return this.stage === STAGE.RESULT; }

  /** 可序列化狀態（比照 tick/snapshot 哲學；供存檔 / 除錯 / 測試比對） */
  snapshot() {
    return {
      gameType: this.gameType,
      stage: this.stage,
      stageIndex: this.stageIndex,
      battleConfig: this.battleConfig,
      battleResult: this.battleResult,
      finished: this.finished,
    };
  }

  // ── 事件 ──────────────────────────────────────────────────────────────
  /** @param {(evt:{type:string, stage:string, payload?:any}) => void} fn */
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(type, payload) { for (const fn of this._listeners) fn({ type, stage: this.stage, payload }); }

  // ── BattleConfig ──────────────────────────────────────────────────────
  /** 合併更新 BattleConfig（不驗證；驗證發生在進入 battle 的當下） */
  setBattleConfig(patch) {
    this.battleConfig = createBattleConfig({ ...this.battleConfig, ...patch, gameType: this.gameType });
    return this.battleConfig;
  }

  // ── 流程推進 ──────────────────────────────────────────────────────────
  /**
   * 前進一個階段。進入 battle 前有兩道守門：
   * 1. placeholder 遊戲（Game3）沒有引擎 → 擋下
   * 2. validateBattleConfig 不通過 → 擋下並回傳原因
   * @returns {{ ok:boolean, stage:string, errors?:string[] }}
   */
  next() {
    if (this.finished) return { ok: false, stage: this.stage, errors: ["流程已結束，請 reset()"] };
    const nextIndex = this.stageIndex + 1;
    if (nextIndex >= this.flow.stages.length) return { ok: false, stage: this.stage, errors: ["已是最後階段"] };

    const nextStage = this.flow.stages[nextIndex];
    if (nextStage === STAGE.BATTLE) {
      if (this.flow.placeholder) return { ok: false, stage: this.stage, errors: [`${this.flow.label} 尚無 Battle Engine`] };
      const v = validateBattleConfig(this.battleConfig);
      if (!v.ok) return { ok: false, stage: this.stage, errors: v.errors };
    }

    this.stageIndex = nextIndex;
    // Sprint 01：battle 完成後續走收尾階段（result→update），抵達最後一站時標記 finished
    if (this.battleResult && nextIndex === this.flow.stages.length - 1) this.finished = true;
    this._emit(ROUTER_EVENT.STAGE_CHANGE);
    if (nextStage === STAGE.BATTLE) this._emit(ROUTER_EVENT.BATTLE_START, this.battleConfig);
    return { ok: true, stage: this.stage };
  }

  /**
   * 後退。行為對照 EsportsGame 現況：
   * - 第一階段再退 → EXIT（回主選單）
   * - result 再退 → EXIT（對照 fpsBack：結算不回到 battle）
   * - battle 中後退 → 允許（棄賽，回 tactic；是否允許由宿主 UI 決定要不要給按鈕）
   */
  back() {
    if (this.isResult || this.stageIndex === 0) {
      this._emit(ROUTER_EVENT.EXIT);
      return { ok: true, stage: this.stage, exited: true };
    }
    this.stageIndex -= 1;
    this._emit(ROUTER_EVENT.STAGE_CHANGE);
    return { ok: true, stage: this.stage, exited: false };
  }

  // ── BattleResult ──────────────────────────────────────────────────────
  /**
   * 引擎打完，由宿主把 onComplete(result) 轉交進來。
   * 只在 battle 階段有效；驗證後前進到 result 階段並發出 BATTLE_COMPLETE。
   * ⚠ Router 不回寫經營層；recordMatch 由宿主在 BATTLE_COMPLETE 事件中呼叫。
   * @param {import("../contracts/BattleResult.js").BattleResult} result
   * @returns {{ ok:boolean, errors?:string[], warnings?:string[] }}
   */
  completeBattle(result) {
    if (!this.isBattle) return { ok: false, errors: [`completeBattle 只能在 battle 階段呼叫（目前: ${this.stage}）`] };
    const v = validateBattleResult(result);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };

    this.battleResult = result;
    const resultIndex = this.flow.stages.indexOf(STAGE.RESULT);
    if (resultIndex >= 0) this.stageIndex = resultIndex;
    // Sprint 01：result 之後可有 update 等收尾階段——僅當 result 為流程最後
    // 一站時才標記 finished（FPS 現況＝最後一站，行為不變）；否則保留
    // next() 續走能力，於 next() 抵達最後一站時補設 finished。
    this.finished = (resultIndex === this.flow.stages.length - 1);
    this._emit(ROUTER_EVENT.BATTLE_COMPLETE, result);
    this._emit(ROUTER_EVENT.STAGE_CHANGE);
    return { ok: true, warnings: v.warnings };
  }

  /**
   * 再戰一場（對照 EsportsGame 現行 onRematch 行為：同地圖、換 seed、直接回 battle）。
   * 只允許在結算後呼叫；重新驗證 config，跳回 battle 並重發 BATTLE_START。
   * @param {Object} patch 併入 BattleConfig 的變更（通常只有 { seed }）
   */
  rematch(patch = {}) {
    const battleIndex = this.flow.stages.indexOf(STAGE.BATTLE);
    if (battleIndex < 0) return { ok: false, errors: ["此流程沒有 battle 階段"] };
    if (!this.isResult && !this.finished) return { ok: false, errors: [`rematch 只能在結算後呼叫（目前: ${this.stage}）`] };
    if (this.flow.placeholder) return { ok: false, errors: [`${this.flow.label} 尚無 Battle Engine`] };
    this.setBattleConfig(patch);
    const v = validateBattleConfig(this.battleConfig);
    if (!v.ok) return { ok: false, errors: v.errors };
    this.battleResult = null;
    this.finished = false;
    this.stageIndex = battleIndex;
    this._emit(ROUTER_EVENT.STAGE_CHANGE);
    this._emit(ROUTER_EVENT.BATTLE_START, this.battleConfig);
    return { ok: true, stage: this.stage };
  }

  // ── 重置（回到第一階段；config 保留，宿主可先 setBattleConfig 換 seed）──
  reset() {
    this.stageIndex = 0;
    this.battleResult = null;
    this.finished = false;
    this._emit(ROUTER_EVENT.RESET);
  }
}
