import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import { recapStyles, csRecapStyles, recapCssText } from "../manage/seasonRecap/recapStyles.js";
import CsRecapBracket from "../manage/seasonRecap/CsRecapBracket.jsx";

// ============================================================================
//  CsCompetitionHubScreen — CS 賽事中心（CS Season M4-C）
//
//  ── 這一頁要回答的六個問題 ────────────────────────────────────────────────
//  賽季**進行中**玩家看不到自己在哪裡：M4-B 的成績單只在封存後出現。
//  這一頁補的就是那段空白：目前排名、在不在晉級線內、下一場打誰、
//  Major 產生了沒、對戰表打到哪、整季走到哪一段。
//
//  ── ⚠ 全唯讀 ─────────────────────────────────────────────────────────────
//  本檔**沒有任何 action**：不出賽、不棄權、不換季、不建賽季。
//  出賽仍走 CS 賽前頁（`startFixtureMatch`），成績單仍走 `csRecap`。
//  多一個入口就多一條會漂移的路徑。
//
//  ── ⚠ 不建立第二套計算 ───────────────────────────────────────────────────
//  排名／勝敗／積分  ← `view.standings`（`computeStandings` 的輸出）
//  晉級線與名單      ← `view.csMajorLine`（`csMajorQualifiers`，與 Major 真正
//                       產生時同一支）
//  對戰表            ← `view.csMajor` ＋ **重用 M4-B 的 `CsRecapBracket`**
//  階段              ← `view.csStage`（既有判定推導）
//  本檔只做排版與文案。
//
//  ── 版面 ────────────────────────────────────────────────────────────────
//  約七成沿用 Recap 的 token（section / row / label / value / quiet）；
//  CS 特色集中在兩處：**階段條**與**積分榜上的晉級線**——兩者都是
//  賽事轉播才有的資訊裝置，而且各自編碼了真實規則（賽季結構、晉級名額）。
// ============================================================================

const ACC = "#fb923c";

const STAGE_STEPS = [
  { key: "league", label: "聯賽" },
  { key: "major", label: "年度 Major" },
  { key: "sealed", label: "賽季結算" },
];

/** 目前階段對應到進度條的第幾格（唯讀對照，不是第二套判定）。 */
const STEP_INDEX = {
  league: 0, major_pending: 0, major: 1, major_done: 1, sealed: 2,
};

function StageBar({ stage }) {
  const at = STEP_INDEX[stage?.phase] ?? 0;
  return (
    <section data-testid="cs-hub-stage" data-phase={stage?.phase ?? ""} style={{ marginTop: 12 }}>
      <div className="cs-hub-stage-row" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
        {STAGE_STEPS.map((step, i) => {
          const done = i < at;
          const now = i === at;
          const color = now ? ACC : done ? "rgba(255,255,255,0.55)" : GC.gray;
          return (
            <React.Fragment key={step.key}>
              {i > 0 && <span aria-hidden="true" style={{ flex: "1 1 12px", minWidth: 12, height: 1, background: done || now ? "rgba(255,255,255,0.22)" : GC.line }} />}
              <span data-testid="cs-hub-stage-step" data-step={step.key} data-state={now ? "current" : done ? "done" : "todo"}
                style={{ color, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                {now ? "● " : done ? "✓ " : "○ "}{step.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ ...recapStyles.quiet, marginTop: 6, color: ACC }}>{stage?.label ?? "—"}</div>
    </section>
  );
}

/** 一列積分榜。晉級線由呼叫端插在正確的位置，不由這裡判斷。 */
function StandingRow({ row, isMe, inLine }) {
  return (
    <div
      data-testid="cs-hub-standing-row"
      data-team-id={row.teamId}
      data-rank={row.rank}
      data-me={isMe ? "true" : "false"}
      data-qualified={inLine ? "true" : "false"}
      style={{
        display: "grid",
        gridTemplateColumns: "18px minmax(0,1fr) minmax(52px,auto) minmax(30px,auto)",
        alignItems: "center",
        gap: 8,
        padding: "6px 6px",
        minWidth: 0,
        background: isMe ? "rgba(251,146,60,0.10)" : "transparent",
        borderRadius: isMe ? 6 : 0,
      }}
    >
      <span style={{ color: inLine ? ACC : GC.gray, fontFamily: MONO, fontSize: 10, fontWeight: 900, textAlign: "center" }}>{row.rank}</span>
      <span style={{ minWidth: 0, color: isMe ? "#fff" : "rgba(255,255,255,0.82)", fontSize: 11.5, fontWeight: isMe ? 900 : 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.name ?? row.teamId}{isMe && <span style={{ color: ACC, fontSize: 9, marginLeft: 5 }}>我</span>}
      </span>
      <span style={{ color: GC.gray, fontFamily: MONO, fontSize: 10.5, textAlign: "right" }}>{row.wins}-{row.losses}</span>
      <span style={{ color: "rgba(255,255,255,0.9)", fontFamily: MONO, fontSize: 11, fontWeight: 900, textAlign: "right" }}>{row.points}</span>
    </div>
  );
}

export default function CsCompetitionHubScreen({ onBack, onRecap }) {
  //  訂閱 canonical 切片，再取一份一致的唯讀快照（同 Recap 的做法）
  const byMode = useProfileStore((s) => s.competitionByMode);
  void byMode;
  const view = useProfileStore.getState().competitionView("cs");

  const frame = (children) => (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <style>{recapCssText}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>CS 賽事中心</h2>
        </div>
        {children}
      </div>
    </div>
  );

  if (!view.hasSeason) {
    return frame(
      <div data-testid="cs-hub-no-season" style={{ ...recapStyles.quiet, marginTop: 14 }}>
        還沒有 CS 賽季。到 CS 賽前準備頁開啟本季聯賽。
      </div>,
    );
  }

  const rows = view.standings?.rows ?? [];
  const myTeamId = view.participants?.find?.((p) => !p.isAi)?.id
    ?? view.honorsView?.myTeamId ?? null;
  const me = rows.find((r) => r.teamId === myTeamId) ?? null;
  const topN = view.csMajorLine?.topN ?? 0;
  const inLine = me != null && topN > 0 && me.rank <= topN;
  const major = view.csMajor ?? { exists: false };
  const path = major.playerPath ?? { inMajor: false, next: null, eliminated: false };

  //  下一場對手：`next` 是 Fixture，對手 = 不是我的那一側
  const nextFixture = view.next ?? null;
  const oppId = nextFixture ? (nextFixture.sideA === myTeamId ? nextFixture.sideB : nextFixture.sideA) : null;
  const oppName = oppId ? (view.participants.find((p) => p.id === oppId)?.name ?? oppId) : null;
  const homeAway = nextFixture ? (nextFixture.sideA === myTeamId ? "主場" : "客場") : null;

  return frame(
    <div data-testid="cs-competition-hub" data-season={view.season} data-phase={view.csStage?.phase ?? ""}>
      {/*  標頭：賽季與賽季日（沿用 Recap 的 kicker / mono 語言）*/}
      <div style={recapStyles.kicker}>CS COMPETITION</div>
      <div style={{ ...recapStyles.headerMeta, marginTop: 7 }}>
        <span style={{ ...recapStyles.headerSeason, fontFamily: MONO, fontSize: 24 }}>S{view.season}</span>
        <span data-testid="cs-hub-day" style={recapStyles.sealStamp}>
          第 {view.seasonDay ?? "—"} / {view.seasonDays ?? "—"} 天
        </span>
      </div>

      <StageBar stage={view.csStage} />

      {/* ── CS 官方聯賽 ─────────────────────────────────────────────── */}
      <section data-testid="cs-hub-league" style={{ ...recapStyles.section, marginTop: 22, paddingLeft: 12, borderLeft: `2px solid ${ACC}` }}>
        <div style={recapStyles.sectionTitle}>CS 官方聯賽</div>

        <div data-testid="cs-hub-my-rank" data-rank={me?.rank ?? ""} data-qualified={inLine ? "true" : "false"} style={recapStyles.row}>
          <span style={recapStyles.label}>我的排名</span>
          <span style={{ ...recapStyles.value, ...recapStyles.monoValue, ...(inLine ? { color: ACC } : {}) }}>
            第 {me?.rank ?? "—"} 名 / {rows.length} 隊{inLine ? " · 晉級線內" : ""}
          </span>
        </div>
        <div data-testid="cs-hub-my-record" style={recapStyles.row}>
          <span style={recapStyles.label}>戰績</span>
          <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
            {me ? `${me.wins} 勝 ${me.losses} 敗 · ${me.points} 分` : "—"}
          </span>
        </div>
        <div data-testid="cs-hub-next" data-fixture-id={nextFixture?.id ?? ""} style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
          <span style={recapStyles.label}>下一場</span>
          <span style={recapStyles.value}>
            {nextFixture ? `第 ${view.nextDay} 天 · ${oppName}（${homeAway}）` : "本季已無賽程"}
          </span>
        </div>

        {/*  積分榜。⚠ 晉級線是**規則**（`csMajorLine.topN`），不是畫面寫死的 4。 */}
        <div data-testid="cs-hub-standings" style={{ marginTop: 10 }}>
          {rows.map((row, i) => (
            <React.Fragment key={row.teamId}>
              <StandingRow row={row} isMe={row.teamId === myTeamId} inLine={row.rank <= topN} />
              {row.rank === topN && i < rows.length - 1 && (
                <div data-testid="cs-hub-qualify-line" style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}>
                  <span style={{ flex: 1, height: 1, background: `${ACC}66` }} />
                  <span style={{ color: ACC, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.14em", whiteSpace: "nowrap" }}>
                    MAJOR 晉級線 · 前 {topN}
                  </span>
                  <span style={{ flex: 1, height: 1, background: `${ACC}66` }} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ── 年度 Major ─────────────────────────────────────────────── */}
      {major.exists ? (
        <>
          {/*  ⚠ 重用 M4-B 的對戰表元件，不做第二個 bracket。 */}
          <CsRecapBracket csMajor={major} />
          <section data-testid="cs-hub-my-major" style={{ ...recapStyles.section, marginTop: 12 }}>
            <div style={{ ...recapStyles.row, ...recapStyles.rowLast, paddingTop: 0 }}>
              <span style={recapStyles.label}>我在 Major</span>
              <span data-testid="cs-hub-my-major-status"
                data-in-major={path.inMajor ? "true" : "false"}
                data-eliminated={path.eliminated ? "true" : "false"}
                style={recapStyles.value}>
                {!path.inMajor ? "未取得參賽資格"
                  : path.next ? `下一場 · ${path.next.nameA} vs ${path.next.nameB}`
                    : path.eliminated ? "已遭淘汰" : "已完賽"}
              </span>
            </div>
          </section>
        </>
      ) : (
        <section data-testid="cs-hub-major-pending" style={{ ...csRecapStyles.majorSection }}>
          <div style={csRecapStyles.majorTitleRow}>
            <span style={recapStyles.sectionTitle}>年度 Major</span>
            <span style={csRecapStyles.seriesTag}>尚未產生</span>
          </div>
          <div style={{ ...recapStyles.quiet, marginTop: 8 }}>
            聯賽結束後，積分榜前 {topN} 名晉級年度 Major（單淘汰 · BO3）。
          </div>
          {/*  目前的前四預覽：讀 `csMajorLine.qualifiers`，與真正產生時同一支規則。 */}
          <div data-testid="cs-hub-line-preview" style={{ marginTop: 8 }}>
            {(view.csMajorLine?.qualifiers ?? []).map((q) => {
              const row = rows.find((r) => r.teamId === q.teamId);
              return (
                <div key={q.teamId} style={{ ...recapStyles.row, padding: "5px 0" }}>
                  <span style={recapStyles.label}>
                    <span style={{ color: ACC, fontFamily: MONO, fontWeight: 900 }}>{q.seed}</span>
                    {"  "}{row?.name ?? q.teamId}
                    {q.teamId === myTeamId && <span style={{ color: ACC, fontSize: 9, marginLeft: 5 }}>我</span>}
                  </span>
                  <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>{row ? `${row.wins}-${row.losses}` : "—"}</span>
                </div>
              );
            })}
          </div>
          <div style={{ ...recapStyles.quiet, fontSize: 9 }}>
            目前名次僅供參考，聯賽打完才定案。
          </div>
        </section>
      )}

      {/* ── 賽季結算入口（封存後才出現；成績單本身在 csRecap） ────────── */}
      {view.final && (
        <section data-testid="cs-hub-recap-entry" style={{ ...recapStyles.section, ...recapStyles.nextSeasonSection }}>
          <button data-testid="cs-hub-recap-btn" onClick={() => onRecap?.()} style={recapStyles.cta}>
            查看 CS 第 {view.season} 賽季成績單
          </button>
        </section>
      )}
    </div>,
  );
}
