import React from "react";
import { recapStyles, csRecapStyles } from "./recapStyles.js";

// ============================================================================
//  CsRecapBracket — CS 年度 Major 的對戰表（CS Season M4-B2）
//
//  ── 為什麼整份 Recap 只有這一塊是新版面 ──────────────────────────────────
//  其他每一段（標頭、榮耀、聯賽名次、獎金）在 MOBA Recap 都已經有對應的
//  呈現方式，CS 直接沿用。**只有淘汰賽對戰表沒有** —— MOBA 那邊的季後賽
//  在 Recap 裡只是一行「已進入／未進入」。而對戰表正是 CS 賽事真正的樣子：
//  誰在哪一輪淘汰了誰、以幾比幾。所以版面的力氣全部花在這裡。
//
//  ── ⛔ 只顯示地圖數 ───────────────────────────────────────────────────────
//  `2 : 1` 指的是**拿下幾張地圖**。CS 單圖的回合／半場／加時比分是 Codex 的
//  責任區（規格 D4 ／ ownership lock），本檔不讀、不算、不顯示。
//
//  ⚠ 純呈現：資料全部來自 `competitionView("cs").csMajor`（Store 的唯讀投影，
//    底下是 `playoffBracket` / `playoffOrder` 那組既有純函式）。
//    本檔不判斷晉級、不決定勝方、不排名次。
// ============================================================================

/** 對戰表的四場，以及它們在版面上的位置。 */
const TIE_LABELS = { sf1: "準決賽 1", sf2: "準決賽 2", final: "決賽", bronze: "季軍戰" };

function TieSide({ seed, name, maps, won, divider }) {
  return (
    <div style={{ ...csRecapStyles.side, ...(divider ? csRecapStyles.sideDivider : {}) }}>
      <span style={csRecapStyles.seed}>{seed ?? "—"}</span>
      <span style={{ ...csRecapStyles.sideName, ...(won ? csRecapStyles.sideNameWon : {}) }}>{name}</span>
      <span style={{ ...csRecapStyles.maps, ...(won ? csRecapStyles.mapsWon : {}) }}>
        {maps == null ? "—" : maps}
      </span>
    </div>
  );
}

function Tie({ tie, seedOf, isFinal }) {
  //  ⚠ 沒排出來的場次**照實顯示為未排定**，不留空白也不假裝有比賽。
  if (!tie?.exists) {
    return (
      <div data-testid="cs-recap-tie" data-key={tie?.key ?? ""} data-exists="false" style={csRecapStyles.tie}>
        <div style={csRecapStyles.tieHead}>
          <span>{TIE_LABELS[tie?.key] ?? tie?.key ?? "—"}</span>
          <span>未排定</span>
        </div>
      </div>
    );
  }
  //  ⚠ 地圖數直接讀 `score`（賽程賽果的 a/b 對應 sideA/sideB）。
  //    沒打完 ⇒ score 為 null ⇒ 兩邊都顯示「—」，不補 0。
  const a = tie.score ? tie.score.a : null;
  const b = tie.score ? tie.score.b : null;
  return (
    <div
      data-testid="cs-recap-tie"
      data-key={tie.key}
      data-exists="true"
      data-done={tie.done ? "true" : "false"}
      data-score={tie.score ? `${a}:${b}` : ""}
      data-winner={tie.winner ?? ""}
      style={{ ...csRecapStyles.tie, ...(isFinal ? csRecapStyles.tieFinal : {}) }}
    >
      <div style={csRecapStyles.tieHead}>
        <span>{TIE_LABELS[tie.key] ?? tie.key}</span>
        <span>{tie.done ? "完賽" : "未完賽"}</span>
      </div>
      <TieSide seed={seedOf(tie.sideA)} name={tie.nameA} maps={a} won={tie.winner === tie.sideA} />
      <TieSide seed={seedOf(tie.sideB)} name={tie.nameB} maps={b} won={tie.winner === tie.sideB} divider />
    </div>
  );
}

export default function CsRecapBracket({ csMajor }) {
  if (!csMajor?.exists) return null;
  const bracket = Array.isArray(csMajor.bracket) ? csMajor.bracket : [];
  const byKey = (k) => bracket.find((t) => t?.key === k) ?? { key: k, exists: false };
  //  種子由晉級名單決定（＝聯賽名次）。畫面不自己排種子。
  const seedOf = (teamId) =>
    (csMajor.qualified ?? []).find((q) => q?.teamId === teamId)?.seed ?? null;
  const series = csMajor.matchFormat?.series ?? null;
  const championName = byKey("final").winnerName ?? null;

  return (
    <section data-testid="cs-recap-major" data-done={csMajor.done ? "true" : "false"} style={csRecapStyles.majorSection}>
      <div style={csRecapStyles.majorTitleRow}>
        <span style={recapStyles.sectionTitle}>年度 Major</span>
        {/*  ⚠ 賽制標籤讀 fixture 的 `matchFormat`，不寫死 "BO3"。 */}
        {series && <span data-testid="cs-recap-series-tag" style={csRecapStyles.seriesTag}>{String(series).toUpperCase()}</span>}
      </div>

      <div data-testid="cs-recap-bracket" style={csRecapStyles.bracket}>
        <div style={csRecapStyles.bracketCol}>
          <Tie tie={byKey("sf1")} seedOf={seedOf} />
          <Tie tie={byKey("sf2")} seedOf={seedOf} />
        </div>
        <div style={csRecapStyles.bracketCol}>
          <Tie tie={byKey("final")} seedOf={seedOf} isFinal />
          <Tie tie={byKey("bronze")} seedOf={seedOf} />
        </div>
      </div>

      {championName && (
        <div data-testid="cs-recap-champion" data-team-id={csMajor.championTeamId ?? ""} style={csRecapStyles.championLine}>
          🏆 {championName} 奪下年度 Major
        </div>
      )}
      {/*  ⚠ 地圖數的說明只寫一次，放在對戰表底下。玩家看到的每個數字都是地圖數，
           不必在每一列重複標註。 */}
      <div style={{ ...recapStyles.quiet, fontSize: 9 }}>
        比分為拿下的地圖數 · {series ? String(series).toUpperCase() : "系列賽"} 先拿 2 張者勝
      </div>
    </section>
  );
}
