// ============================================================================
//  screens/competition/StandingsTable.jsx — 積分榜（共用純呈現，UI-4A）
//
//  ── 這裡一個數字都不算 ────────────────────────────────────────────────────
//  `rows` 是 `competitionView(mode).standings.rows` 原樣傳進來的：名次、勝敗、
//  積分、淨勝分全部已經算好。本元件**不排序、不累加、不判斷誰晉級**。
//  這條界線在本專案是明令的——畫面自己算規則，就會出現第二份真相。
//
//  ── 晉級線也是呼叫端決定的 ────────────────────────────────────────────────
//  `qualify.afterRank` 說「線畫在第幾名之後」，`qualify.label` 說線上寫什麼。
//  哪一名進得去是**規則**（CS 讀 `csMajorLine.topN`、MOBA 讀季後賽名額），
//  規則留在畫面層各自的資料來源，本元件只負責把線插在指定位置。
//
//  ── 兩個項目差在哪（刻意保留）────────────────────────────────────────────
//  MOBA：5 欄（名次／隊伍＋tag／勝敗／分／淨勝），有表頭，金色高亮自己
//  CS  ：4 欄（名次／隊伍＋「我」／勝敗／分），無表頭，橘色高亮，有 Major 晉級線
//  共用的是骨架與版面，不是欄位清單——欄位由 props 開關。
// ============================================================================
import React from "react";
import { GC, MONO } from "../../ui/theme.js";

/**
 * @param {object}   p
 * @param {Array}    p.rows            已算好的積分榜列（不得在此重排）
 * @param {string}   [p.myTeamId]      要高亮的隊伍
 * @param {string}   [p.accent]        項目強調色
 * @param {boolean}  [p.showHeader]    是否顯示表頭（MOBA 有、CS 沒有）
 * @param {boolean}  [p.showScoreDiff] 是否顯示淨勝分欄（MOBA 有、CS 沒有）
 * @param {Function} [p.tagOf]         `(teamId) => tag`；回空字串就不顯示
 * @param {boolean}  [p.showMeBadge]   自己那一列是否加「我」標記（CS 有）
 * @param {object}   [p.qualify]       `{ afterRank, label }`；不給就不畫晉級線
 * @param {string}   [p.testIdPrefix]  既有標記要傳進來（例如 `cs-hub-standing`）
 * @param {Node}     [p.footer]        表格下方的補充說明（MOBA 的來源分佈）
 */
export default function StandingsTable({
  rows = [],
  myTeamId = null,
  accent = GC.purp,
  showHeader = false,
  showScoreDiff = false,
  tagOf = null,
  showMeBadge = false,
  qualify = null,
  testIdPrefix = "competition-standing",
  emptyText = "尚無積分榜資料",
  footer = null,
}) {
  if (!rows.length) {
    return <div style={{ fontSize: 11, color: GC.gray, padding: "6px 0" }}>{emptyText}</div>;
  }

  //  欄寬：有淨勝分就多一欄。`minmax(0,1fr)` 讓隊名欄可以被壓縮而不撐破容器。
  const columns = showScoreDiff
    ? "18px minmax(0,1fr) 46px 30px 34px"
    : "18px minmax(0,1fr) minmax(52px,auto) minmax(30px,auto)";

  const lineAfter = Number.isFinite(qualify?.afterRank) ? qualify.afterRank : null;

  return (
    <div data-testid={`${testIdPrefix}s`} style={{ minWidth: 0 }}>
      {showHeader && (
        <div style={{
          display: "grid", gridTemplateColumns: columns, gap: showScoreDiff ? 0 : 8,
          fontSize: 8.5, color: GC.gray, fontWeight: 800,
          paddingBottom: 4, borderBottom: `1px solid ${GC.line}`,
        }}>
          <span>#</span>
          <span>隊伍</span>
          <span style={{ textAlign: "center" }}>勝敗</span>
          <span style={{ textAlign: "center" }}>分</span>
          {showScoreDiff && <span style={{ textAlign: "right" }}>淨勝</span>}
        </div>
      )}

      {rows.map((row, i) => {
        const isMe = myTeamId != null && row.teamId === myTeamId;
        const inLine = lineAfter != null && row.rank <= lineAfter;
        const tag = tagOf ? tagOf(row.teamId) : "";
        return (
          <React.Fragment key={row.teamId}>
            <div
              data-testid={`${testIdPrefix}-row`}
              data-team-id={row.teamId}
              data-rank={row.rank}
              data-me={isMe ? "true" : "false"}
              data-qualified={inLine ? "true" : "false"}
              style={{
                display: "grid", gridTemplateColumns: columns, gap: showScoreDiff ? 0 : 8,
                alignItems: "center", padding: showScoreDiff ? "4px 0" : "6px 6px",
                minWidth: 0, fontSize: 11.5,
                background: isMe && showMeBadge ? `${accent}1a` : "transparent",
                borderRadius: isMe && showMeBadge ? 6 : 0,
                color: isMe && !showMeBadge ? GC.gold : "rgba(255,255,255,0.82)",
                fontWeight: isMe ? 900 : showScoreDiff ? 600 : 800,
              }}
            >
              <span style={{
                fontFamily: MONO, fontSize: showScoreDiff ? undefined : 10, fontWeight: 900,
                color: inLine ? accent : GC.gray,
                textAlign: showScoreDiff ? "left" : "center",
              }}>{row.rank}</span>

              <span style={{
                minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: isMe && showMeBadge ? "#fff" : undefined,
              }}>
                {row.name ?? row.teamId}
                {tag && <span style={{ fontSize: 8.5, color: GC.gray, marginLeft: 4 }}>{tag}</span>}
                {showMeBadge && isMe && <span style={{ color: accent, fontSize: 9, marginLeft: 5 }}>我</span>}
              </span>

              <span style={{
                fontFamily: MONO, fontSize: showScoreDiff ? undefined : 10.5,
                color: showScoreDiff ? undefined : GC.gray,
                textAlign: showScoreDiff ? "center" : "right",
              }}>{row.wins}-{row.losses}</span>

              <span style={{
                fontFamily: MONO, fontSize: showScoreDiff ? undefined : 11, fontWeight: showScoreDiff ? undefined : 900,
                color: showScoreDiff ? undefined : "rgba(255,255,255,0.9)",
                textAlign: showScoreDiff ? "center" : "right",
              }}>{row.points}</span>

              {showScoreDiff && (
                <span style={{
                  fontFamily: MONO, textAlign: "right",
                  color: row.scoreDiff > 0 ? GC.green : row.scoreDiff < 0 ? GC.redL : GC.gray,
                }}>{row.scoreDiff > 0 ? "+" : ""}{row.scoreDiff}</span>
              )}
            </div>

            {/*  晉級線：畫在指定名次之後，且不是最後一列（最後一列之後畫線沒有意義） */}
            {lineAfter != null && row.rank === lineAfter && i < rows.length - 1 && (
              <div
                data-testid={`${testIdPrefix.replace(/-standing$/, "")}-qualify-line`}
                style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}
              >
                <span style={{ flex: 1, height: 1, background: `${accent}66` }} />
                <span style={{
                  color: accent, fontSize: 8.5, fontWeight: 900,
                  letterSpacing: "0.14em", whiteSpace: "nowrap",
                }}>{qualify.label}</span>
                <span style={{ flex: 1, height: 1, background: `${accent}66` }} />
              </div>
            )}
          </React.Fragment>
        );
      })}

      {footer}
    </div>
  );
}
