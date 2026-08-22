import React from "react";
import { EsmoIcon } from "./EsmoIcon.jsx";

const TONES = new Set(["neutral", "positive", "info", "warning", "danger", "tactical"]);

function toneOf(tone) {
  return TONES.has(tone) ? tone : "neutral";
}

/** Pure presentation primitive: no Store reads and no business calculations. */
export function GamePageHeader({ eyebrow, title, detail, icon = "users", actions = null }) {
  return (
    <header className="player-ui-page-header" data-player-ui-header>
      <div className="player-ui-page-header__identity">
        <div className="player-ui-page-header__eyebrow">
          {icon && <EsmoIcon name={icon} size={13} strokeWidth={2} />}
          <span>{eyebrow}</span>
        </div>
        <div className="player-ui-page-header__title">{title}</div>
        {detail && <div className="player-ui-page-header__detail">{detail}</div>}
      </div>
      {actions && <div className="player-ui-page-header__actions">{actions}</div>}
    </header>
  );
}

/** Pure presentation primitive: semantic state is supplied by the screen. */
export function StatusBadge({ label, tone = "neutral", icon = null, className = "" }) {
  return (
    <span className={`player-ui-status player-ui-status--${toneOf(tone)} ${className}`.trim()}>
      {icon && <EsmoIcon name={icon} size={12} strokeWidth={2} />}
      <span>{label}</span>
    </span>
  );
}

/** Pure presentation primitive: value and detail are already derived by the screen. */
export function StatTile({ label, value, detail, tone = "neutral", icon = null, className = "" }) {
  return (
    <div className={`player-ui-stat-tile player-ui-stat-tile--${toneOf(tone)} ${className}`.trim()}>
      <div className="player-ui-stat-tile__label">
        {icon && <EsmoIcon name={icon} size={12} strokeWidth={2} />}
        <span>{label}</span>
      </div>
      <div className="player-ui-stat-tile__value">{value}</div>
      {detail && <div className="player-ui-stat-tile__detail">{detail}</div>}
    </div>
  );
}

/** Pure presentation primitive: only clamps the visual bar, never changes source data. */
export function ProgressBar({ label, value, detail, accent = "var(--esmo-moba)", compact = false, className = "" }) {
  const visualValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`player-ui-progress ${compact ? "player-ui-progress--compact" : ""} ${className}`.trim()} style={{ "--progress-accent": accent }}>
      {(label || detail) && (
        <div className="player-ui-progress__meta">
          {label && <span>{label}</span>}
          {detail && <span>{detail}</span>}
        </div>
      )}
      <div className="player-ui-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={visualValue}>
        <div className="player-ui-progress__fill" style={{ width: `${visualValue}%` }} />
      </div>
    </div>
  );
}

/** Pure presentation primitive: supports a button row or a non-interactive identity row. */
export function PlayerListRow({ avatar, trailing = null, selected = false, as = "button", className = "", children, ...rest }) {
  const Tag = as === "div" ? "div" : "button";
  if (avatar == null && trailing == null) {
    return (
      <Tag
        {...rest}
        type={Tag === "button" ? "button" : undefined}
        className={`player-ui-list-row ${selected ? "is-selected" : ""} ${className}`.trim()}
        data-selected={selected ? "true" : "false"}
        data-player-ui-reveal
      >
        {children}
      </Tag>
    );
  }
  return (
    <Tag
      {...rest}
      type={Tag === "button" ? "button" : undefined}
      className={`player-ui-list-row ${selected ? "is-selected" : ""} ${className}`.trim()}
      data-selected={selected ? "true" : "false"}
      data-player-ui-reveal
    >
      <div className="player-ui-list-row__avatar">{avatar}</div>
      <div className="player-ui-list-row__body">{children}</div>
      {trailing && <div className="player-ui-list-row__trailing">{trailing}</div>}
    </Tag>
  );
}
