import { GC, MONO } from "../../../ui/theme.js";

// Visual-only alpha variants reuse the existing GC/white semantic colors for
// the seal line, the restrained champion wash, and report-style leaders.
const SEAL_LINE = "rgba(255,255,255,0.14)";
const HONOR_WASH = "rgba(251,191,36,0.08)";

export const recapStyles = {
  shell: {
    width: "100%",
    maxWidth: 560,
    minWidth: 0,
    boxSizing: "border-box",
    margin: "0 auto 10px",
    overflow: "hidden",
  },
  header: {
    minWidth: 0,
    padding: "16px 0 0",
  },
  kicker: {
    color: GC.gray,
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.28em",
  },
  headerMeta: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 12,
    minWidth: 0,
    marginTop: 9,
    color: GC.gray,
    fontSize: 10.5,
    fontFamily: MONO,
  },
  headerSeason: {
    color: "rgba(255,255,255,0.96)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
  sealStamp: {
    display: "inline-flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 7,
    minWidth: 0,
    color: GC.gray,
    fontFamily: MONO,
    fontSize: 10.5,
    lineHeight: 1.3,
  },
  team: {
    minWidth: 0,
    marginTop: 11,
    color: "rgba(255,255,255,1)",
    fontWeight: 900,
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  sealLine: {
    width: "100%",
    height: 2,
    marginTop: 12,
    background: SEAL_LINE,
  },
  summary: {
    minWidth: 0,
    marginTop: 11,
    color: "rgba(255,255,255,0.86)",
    fontWeight: 800,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  summaryChampion: {
    color: GC.gold,
  },
  section: {
    minWidth: 0,
    boxSizing: "border-box",
  },
  honorSection: {
    minWidth: 0,
    boxSizing: "border-box",
    marginTop: 26,
    padding: "12px 12px 13px",
    borderLeft: `3px solid ${GC.gold}`,
    background: HONOR_WASH,
  },
  finalsSection: {
    marginTop: 22,
    paddingLeft: 12,
    borderLeft: `2px solid ${SEAL_LINE}`,
  },
  circuitSection: {
    marginTop: 20,
    paddingLeft: 12,
    borderLeft: `1px solid ${GC.line}`,
  },
  leagueSection: {
    marginTop: 20,
    paddingLeft: 12,
    borderLeft: `1px solid ${GC.line}`,
  },
  prizeSection: {
    marginTop: 16,
  },
  nextSeasonSection: {
    marginTop: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    minWidth: 0,
    color: "rgba(255,255,255,0.94)",
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  honorSectionTitle: {
    color: GC.gold,
    fontSize: 15,
  },
  smallSectionTitle: {
    minWidth: 0,
    color: "rgba(255,255,255,0.94)",
    fontSize: 11.5,
    fontWeight: 900,
    lineHeight: 1.3,
  },
  honorTitle: {
    minWidth: 0,
    marginTop: 11,
    color: GC.gold,
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  honorTeam: {
    minWidth: 0,
    marginTop: 4,
    color: GC.gold,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, auto)",
    alignItems: "start",
    gap: 12,
    minWidth: 0,
    padding: "7px 0",
    borderBottom: `1px solid ${GC.line}`,
  },
  rowLast: {
    borderBottom: "none",
  },
  label: {
    minWidth: 0,
    color: GC.gray,
    fontSize: 11,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  value: {
    minWidth: 0,
    color: "rgba(255,255,255,0.9)",
    fontSize: 11.5,
    fontWeight: 800,
    lineHeight: 1.4,
    textAlign: "right",
    overflowWrap: "anywhere",
  },
  monoValue: {
    fontFamily: MONO,
  },
  mutedValue: {
    color: GC.gray,
  },
  positive: {
    color: GC.green,
  },
  quiet: {
    marginTop: 9,
    color: GC.gray,
    fontSize: 11,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  stops: {
    display: "grid",
    gap: 0,
    marginTop: 7,
    minWidth: 0,
  },
  stop: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(60px,auto) minmax(52px,auto)",
    alignItems: "start",
    gap: 8,
    minWidth: 0,
    padding: "8px 0",
    borderTop: `1px solid ${GC.line}`,
  },
  stopName: {
    minWidth: 0,
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  stopCell: {
    minWidth: 0,
    color: GC.gray,
    fontSize: 10.5,
    lineHeight: 1.35,
    textAlign: "right",
    overflowWrap: "anywhere",
  },
  stopPoints: {
    color: GC.green,
    fontFamily: MONO,
    fontWeight: 900,
  },
  cta: {
    width: "100%",
    boxSizing: "border-box",
    margin: 0,
    background: GC.purp,
    border: "none",
    borderRadius: 8,
    padding: "12px 10px",
    color: GC.bg,
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
};

// ── CS Season M4-B2：CS Recap 專屬樣式 ───────────────────────────────────────
//
//  ⚠ 放在**同一份樣式表**裡，不另開 csRecapStyles.js：Recap 是一種版面，
//    CS 只是它的一個變體。分兩份之後，改了共用的 row／label 就得記得改兩邊。
//  ⚠ 版面 token（row / label / value / sectionTitle / quiet…）全部沿用上面那組。
//    下面只有**對戰表**是新的 —— 那是 CS 唯一真正需要新版面的東西。
const CS_ACC = "#fb923c";                    // 與 CS 賽前流程同一個強調色
const CS_WASH = "rgba(251,146,60,0.08)";

export const csRecapStyles = {
  majorSection: {
    minWidth: 0,
    boxSizing: "border-box",
    marginTop: 22,
    paddingLeft: 12,
    borderLeft: `2px solid ${CS_ACC}`,
  },
  majorTitleRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  },
  seriesTag: {
    background: CS_WASH,
    border: `1px solid ${CS_ACC}55`,
    borderRadius: 4,
    padding: "1px 6px",
    color: CS_ACC,
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.08em",
  },
  //  ── 對戰表（本頁的 signature）────────────────────────────────────────
  //  兩欄：左邊兩場準決賽，右邊決賽與季軍戰。窄螢幕改單欄堆疊（見 CSS）。
  bracket: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    minWidth: 0,
  },
  bracketCol: {
    display: "grid",
    gap: 8,
    minWidth: 0,
    alignContent: "center",
  },
  tie: {
    minWidth: 0,
    border: `1px solid ${GC.line}`,
    borderRadius: 8,
    overflow: "hidden",
    background: "rgba(255,255,255,0.02)",
  },
  tieFinal: {
    borderColor: `${CS_ACC}66`,
  },
  tieHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    padding: "4px 8px",
    background: "rgba(255,255,255,0.03)",
    color: GC.gray,
    fontSize: 8.5,
    fontWeight: 900,
    letterSpacing: "0.14em",
  },
  side: {
    display: "grid",
    gridTemplateColumns: "14px minmax(0,1fr) 20px",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    minWidth: 0,
  },
  sideDivider: {
    borderTop: `1px solid ${GC.line}`,
  },
  seed: {
    color: GC.gray,
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 900,
    textAlign: "center",
  },
  sideName: {
    minWidth: 0,
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sideNameWon: {
    color: "rgba(255,255,255,0.98)",
  },
  //  ⚠ 這裡顯示的是**地圖數**（2 / 1 / 0），不是回合數。CS 單圖的回合比分
  //    是 Codex 的責任區，Recap 一個字都不碰（規格 D4 ／ ownership lock）。
  maps: {
    color: GC.gray,
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 900,
    textAlign: "right",
  },
  mapsWon: {
    color: CS_ACC,
  },
  championLine: {
    marginTop: 10,
    padding: "8px 10px",
    borderRadius: 8,
    background: CS_WASH,
    border: `1px solid ${CS_ACC}44`,
    color: CS_ACC,
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
};

const SCOPES = '[data-testid="season-recap"], [data-testid="cs-season-recap"]';

export const recapCssText = `
@keyframes recap-seal-line-in {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

${SCOPES} .recap-seal-line {
  transform: scaleX(0);
  transform-origin: left;
  animation: recap-seal-line-in 240ms ease-out forwards;
}

${SCOPES} .recap-header-season { font-size: 30px; }
${SCOPES} .recap-team-name { font-size: 23px; }
${SCOPES} .recap-summary { font-size: 15px; }

${SCOPES} .recap-stop-name {
  border-bottom: 1px dotted ${GC.line};
  padding-bottom: 2px;
}

@media (max-width: 767px) {
  ${SCOPES} .recap-header-season { font-size: 26px; }
  ${SCOPES} .recap-team-name { font-size: 20px; }
  ${SCOPES} .recap-summary { font-size: 14px; }
  ${SCOPES} .recap-stop-name {
    border-bottom: none;
    padding-bottom: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  ${SCOPES} .recap-seal-line {
    animation: none;
    transform: scaleX(1);
  }
}

/*  CS Season M4-B2：對戰表在窄螢幕改單欄堆疊。
    ⚠ 兩欄是為了讀出「準決賽 → 決賽」的流向；欄寬不夠時流向讀不出來，
      堆疊反而清楚，所以是換版面而不是縮小字。 */
@media (max-width: 520px) {
  [data-testid="cs-recap-bracket"] {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

export const mergeStyles = (...styles) => Object.assign({}, ...styles);
