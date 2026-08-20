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

export const recapCssText = `
@keyframes recap-seal-line-in {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

[data-testid="season-recap"] .recap-seal-line {
  transform: scaleX(0);
  transform-origin: left;
  animation: recap-seal-line-in 240ms ease-out forwards;
}

[data-testid="season-recap"] .recap-header-season { font-size: 30px; }
[data-testid="season-recap"] .recap-team-name { font-size: 23px; }
[data-testid="season-recap"] .recap-summary { font-size: 15px; }

[data-testid="season-recap"] .recap-stop-name {
  border-bottom: 1px dotted ${GC.line};
  padding-bottom: 2px;
}

@media (max-width: 767px) {
  [data-testid="season-recap"] .recap-header-season { font-size: 26px; }
  [data-testid="season-recap"] .recap-team-name { font-size: 20px; }
  [data-testid="season-recap"] .recap-summary { font-size: 14px; }
  [data-testid="season-recap"] .recap-stop-name {
    border-bottom: none;
    padding-bottom: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-testid="season-recap"] .recap-seal-line {
    animation: none;
    transform: scaleX(1);
  }
}
`;

export const mergeStyles = (...styles) => Object.assign({}, ...styles);
