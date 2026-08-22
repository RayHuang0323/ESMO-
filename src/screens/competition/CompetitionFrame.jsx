// ============================================================================
//  screens/competition/CompetitionFrame.jsx — 賽事頁的共用外框（UI-4B）
//
//  ── 它給的是「這一區長什麼樣」，不是「這一頁有什麼」 ──────────────────────
//  捲動容器、寬度上限、頁首（返回鍵／eyebrow／標題／賽季副標／右側資訊）、
//  以及整區的 accent 變數。內容完全由呼叫端決定。
//
//  ── 項目差異只有一個變數 ──────────────────────────────────────────────────
//  `accent` 會被寫成 CSS 變數 `--comp-accent`，底下所有需要強調色的地方都讀它。
//  換一個項目＝換一個顏色與幾個字串，不是換一套版面。
//
//  ── 為什麼賽季標頭收在這裡 ────────────────────────────────────────────────
//  兩頁本來各自寫「S1 · 第 12 / 84 天」：MOBA 在 `ManageFrame` 的 subtitle，
//  CS 在內文自己排一組 kicker + 大字 + 印章。同一個事實兩種長相，而且兩邊都
//  可能各自漂移。收成一個 slot 之後，玩家在兩個分頁看到的是同一個東西。
//
//  ⚠ 純呈現：不讀 Store、不算任何東西。
// ============================================================================
import React from "react";
import "./competition.css";

/**
 * @param {object} p
 * @param {string} p.accent           項目強調色 → `--comp-accent`
 * @param {string} [p.eyebrow]        小標（COMPETITION / CS COMPETITION）
 * @param {string} p.title            頁面標題
 * @param {Node}   [p.subtitle]       賽季副標（`S1 · 第 12 / 84 天`）
 * @param {string} [p.subtitleTestId] 副標的 data-testid（既有標記要傳進來）
 * @param {Node}   [p.right]          頁首右側資訊（MOBA 的出賽場次進度）
 * @param {Function} [p.onBack]
 * @param {string} [p.testId]         整頁容器的 data-testid
 * @param {Node}   [p.head]           頁首與內容之間的額外插槽（分頁列之類）
 */
export default function CompetitionFrame({
  accent,
  eyebrow = null,
  title,
  subtitle = null,
  subtitleTestId = null,
  right = null,
  onBack = null,
  testId = null,
  head = null,
  children,
}) {
  return (
    <div
      className="esmo-comp"
      data-testid={testId ?? undefined}
      style={accent ? { "--comp-accent": accent } : undefined}
    >
      <div className="esmo-comp__inner">
        <header className="esmo-comp__header">
          {onBack && (
            <button type="button" className="esmo-comp__back" onClick={onBack} aria-label="返回">←</button>
          )}
          <div className="esmo-comp__head-copy">
            {eyebrow && <div className="esmo-comp__eyebrow">{eyebrow}</div>}
            <h2 className="esmo-comp__title">{title}</h2>
            {subtitle && (
              <div className="esmo-comp__subtitle" data-testid={subtitleTestId ?? undefined}>{subtitle}</div>
            )}
          </div>
          {right && <div className="esmo-comp__head-right">{right}</div>}
        </header>
        {head}
        {children}
      </div>
    </div>
  );
}
