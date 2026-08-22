// ============================================================================
//  screens/competition/CompetitionPanel.jsx — 賽事頁的共用卡片（UI-4B）
//
//  兩頁本來各有一種卡片：MOBA 的 `Panel`（inline style）與 CS 的
//  `recapStyles.section`。兩者的背景、邊框、圓角、內距、標題字級本來就幾乎一樣，
//  只是各寫各的——所以會慢慢漂移。這裡收成一個。
//
//  `accent` 版本（左緣一條強調色）是 CS 那兩塊本來就有的做法，
//  現在 MOBA 也用得到（例如「今日賽事」想要更醒目時）。
//
//  ⚠ 純呈現：沒有狀態、不讀 Store。
// ============================================================================
import React from "react";
import "./competition.css";

/**
 * @param {object}  p
 * @param {Node}    [p.title]    卡片小標（沿用既有的 eyebrow 字級）
 * @param {Node}    [p.right]    小標右側的附註
 * @param {boolean} [p.accent]   左緣是否加一條強調色
 * @param {string}  [p.testId]
 * @param {object}  [p.style]    少數需要微調的情況（例如 marginTop）
 */
export default function CompetitionPanel({
  title = null,
  right = null,
  accent = false,
  testId = null,
  style = null,
  children,
}) {
  return (
    <section
      className={`esmo-comp__panel${accent ? " esmo-comp__panel--accent" : ""}`}
      data-testid={testId ?? undefined}
      style={style ?? undefined}
    >
      {(title || right) && (
        <div className="esmo-comp__panel-head">
          <div className="esmo-comp__panel-title">{title}</div>
          {right && <div className="esmo-comp__panel-right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
