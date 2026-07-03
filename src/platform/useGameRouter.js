// ============================================================================
//  useGameRouter.js — GameRouter 的 React 轉接層（Phase 3 接線用）
//
//  定位：
//  - platform 內「唯一」允許 import React 的檔案；GameRouter 本體保持純淨。
//  - 刻意「不」從 platform/index.js 匯出：index.js 必須維持可在 Node
//    headless 執行（語法檢查、整合測試、未來賽季批次模擬都靠它）。
//    宿主請直接 `import { useGameRouter } from "./platform/useGameRouter.js"`。
//
//  行為：router 實例存 useRef（跨 render 唯一）；訂閱 Router 事件，任何
//  階段變化 → setState 觸發重繪。stage 字串值與原 fpsStage 完全相同
//  （"prep"/"matching"/"tactic"/"battle"/"result"），既有 UI 判斷式零修改。
// ============================================================================

import { useRef, useState, useEffect } from "react";
import { GameRouter } from "./router/GameRouter.js";

/**
 * @param {string} gameType GAME_TYPE 之一
 * @returns {{ router: GameRouter, stage: string }}
 */
export function useGameRouter(gameType) {
  const ref = useRef(null);
  if (!ref.current) ref.current = new GameRouter({ gameType });
  const router = ref.current;
  const [stage, setStage] = useState(router.stage);
  useEffect(() => router.subscribe(() => setStage(router.stage)), [router]);
  return { router, stage };
}
