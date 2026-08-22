// ============================================================================
//  screens/competition/FixtureList.jsx — 賽程列（共用純呈現，UI-4A）
//
//  ── 共用的是「怎麼讀一場賽程」，不是「長什麼樣子」 ──────────────────────
//  兩個項目都要從一筆 fixture 讀出同樣四件事：第幾天、對手是誰、主場還客場、
//  現在什麼狀態。那段推導在兩邊各寫一次就是兩個會漂移的地方，所以收在這裡。
//
//  版面則刻意留兩種：
//    `layout="versus"`  MOBA 今日／下一場的對戰卡（我方 VS 對手，兩邊各標主客）
//    `layout="row"`     CS 賽事中心的單行摘要（第 N 天 · 對手（主場））
//  硬把兩者統一成一種，等於用「共用」的名義把各自的資訊密度抹平。
//
//  ── 不建第二份 fixture state ──────────────────────────────────────────────
//  `fixture` 是 `competitionView(mode)` 給的那一筆，原樣傳進來。
//  狀態字串（scheduled / launched / completed / forfeited）沿用既有資料，
//  本元件只把它對應成中文標籤與顏色——**沒有第二套狀態機**。
//  對手是誰由 `sideA/sideB` 與 `myTeamId` 決定，那是讀法不是規則。
// ============================================================================
import React from "react";
import { GC, MONO } from "../../ui/theme.js";

/** 既有四個狀態的顯示對照。要新增狀態時連同 Fixture 契約一起改，不要只改這裡。 */
export const FIXTURE_STATUS_LABEL = Object.freeze({
  scheduled: "未開打",
  launched: "進行中",
  completed: "已完成",
  forfeited: "已棄權",
});
const STATUS_TONE = Object.freeze({
  scheduled: GC.gray,
  launched: GC.gold,
  completed: GC.green,
  forfeited: GC.red,
});

const chipStyle = (tone) => ({
  fontSize: 8.5, fontWeight: 900, color: tone, border: `1px solid ${tone}66`,
  borderRadius: 5, padding: "1px 6px", letterSpacing: "0.05em", whiteSpace: "nowrap",
});

/**
 * 從一筆 fixture 讀出呈現需要的四件事。**只是讀法，不是規則。**
 * 抽成函式是為了讓兩種版面共用同一份推導，不會一邊改一邊忘。
 */
export function readFixture(fixture, myTeamId, nameOf, dayOverride = undefined) {
  const home = fixture?.sideA === myTeamId;
  const oppId = home ? fixture?.sideB : fixture?.sideA;
  const format = fixture?.matchFormat ?? null;
  //  BO 標記：契約把賽制原樣掛在 `matchFormat` 上，共用層只負責顯示它。
  const seriesTag = format?.series ? String(format.series).toUpperCase()
    : format?.mapsToWin > 1 ? `BO${format.mapsToWin * 2 - 1}` : null;
  return {
    //  ⚠ 要顯示哪一個「天」是 Store 推導出來的，不是本元件能決定的：
    //    `fixture.day` 是賽季相對天，而畫面上寫的通常是 `view.nextDay`
    //    （＝`absoluteDayOf(state, fixture)`，絕對遊戲日）。兩者是不同的數字。
    //    ⇒ 呼叫端傳 `day` 就用它；沒傳才退回 `fixture.day`。
    day: dayOverride !== undefined ? dayOverride : (fixture?.day ?? null),
    home,
    oppId,
    oppName: oppId ? (nameOf ? nameOf(oppId) : oppId) : null,
    status: fixture?.status ?? null,
    seriesTag,
  };
}

/**
 * @param {object}   p
 * @param {object}   p.fixture       `competitionView(mode)` 給的那一筆，不要自己組
 * @param {string}   p.myTeamId
 * @param {Function} [p.nameOf]      `(teamId) => 顯示名`
 * @param {"versus"|"row"} [p.layout]
 * @param {string}   [p.accent]
 * @param {boolean}  [p.showStatus]  是否顯示狀態 chip
 * @param {Node}     [p.action]      右側／下方的動作區（出賽、棄權…由呼叫端給）
 */
export function FixtureRow({
  fixture,
  myTeamId,
  nameOf = null,
  myName = null,
  layout = "row",
  accent = GC.purp,
  showStatus = false,
  dayPrefix = "第",
  day = undefined,
  action = null,
  testIdPrefix = "competition-fixture",
}) {
  if (!fixture) return null;
  const f = readFixture(fixture, myTeamId, nameOf, day);
  const tone = STATUS_TONE[f.status] ?? GC.gray;

  const tags = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
      {f.seriesTag && <span style={chipStyle(accent)}>{f.seriesTag}</span>}
      {showStatus && f.status && <span style={chipStyle(tone)}>{FIXTURE_STATUS_LABEL[f.status] ?? f.status}</span>}
    </span>
  );

  if (layout === "versus") {
    return (
      <div
        data-testid={`${testIdPrefix}-row`}
        data-fixture-id={fixture.id}
        data-status={f.status ?? ""}
        data-home={f.home ? "true" : "false"}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "6px 0 10px", minWidth: 0 }}>
          <div style={{ textAlign: "right", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {myName ?? (nameOf ? nameOf(myTeamId) : myTeamId)}
            </div>
            <div style={{ fontSize: 9, color: GC.gray }}>{f.home ? "主場" : "客場"}</div>
          </div>
          <div style={{ fontSize: 11, color: GC.gray, fontFamily: MONO, flexShrink: 0 }}>VS</div>
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.oppName}
            </div>
            <div style={{ fontSize: 9, color: GC.gray }}>{f.home ? "客場" : "主場"}</div>
          </div>
        </div>
        {(f.seriesTag || showStatus) && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>{tags}</div>
        )}
        {action}
      </div>
    );
  }

  return (
    <div
      data-testid={`${testIdPrefix}-row`}
      data-fixture-id={fixture.id}
      data-status={f.status ?? ""}
      data-home={f.home ? "true" : "false"}
      style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "4px 0" }}
    >
      {f.day != null && (
        <span style={{ color: GC.gray, fontFamily: MONO, fontSize: 10, flexShrink: 0 }}>{dayPrefix} {f.day} 天</span>
      )}
      <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5, color: "rgba(255,255,255,0.85)" }}>
        {f.oppName ?? "—"}
        <span style={{ color: GC.gray, fontSize: 9, marginLeft: 5 }}>{f.home ? "主場" : "客場"}</span>
      </span>
      {tags}
      {action}
    </div>
  );
}

/**
 * 一串賽程。`fixtures` 已經是呼叫端挑好的那一批（今日、下一場、全季…），
 * 本元件**不篩選、不排序**。
 */
export default function FixtureList({
  fixtures = [],
  empty = "目前沒有賽程",
  renderAction = null,
  separator = true,
  ...rowProps
}) {
  if (!fixtures.length) {
    return <div style={{ fontSize: 12, color: GC.gray }}>{empty}</div>;
  }
  return (
    <>
      {fixtures.map((fixture, i) => (
        <div
          key={fixture.id}
          style={separator && i > 0
            ? { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${GC.line}` }
            : undefined}
        >
          <FixtureRow {...rowProps} fixture={fixture} action={renderAction ? renderAction(fixture) : null} />
        </div>
      ))}
    </>
  );
}
