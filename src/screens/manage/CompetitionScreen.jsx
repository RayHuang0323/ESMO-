// ============================================================================
//  screens/manage/CompetitionScreen.jsx — 聯賽（Milestone Q3.5）
//
//  Q3 把賽事管線做完了，但沒有畫面 ⇒ 玩家在瀏覽器裡到不了。本檔是**最小可用**
//  的賽事入口：看得到賽程與積分榜、按得到出賽與棄權。刻意不做完整賽事中心
//  （賽程總表、對手戰力、歷史賽果）——那些留給後續。
//
//  ── 這個畫面不做任何判斷 ─────────────────────────────────────────────────
//  積分榜、下一場、今天有沒有比賽，全部來自 `competitionView()`（Store 的唯一
//  出口，底下是 Q2b/Q3 的純函式）。畫面**不自己算勝場、不自己排名次、
//  不自己判斷能不能出賽**——那是本專案明令禁止的「畫面自己判規則」。
//
//  ── 出賽之後就交還給既有流程 ─────────────────────────────────────────────
//  按「出賽」＝ `startFixtureMatch()`（簽指派單 ＋ 開房 ＋ 場次轉 launched），
//  然後跳到既有的賽前頁。從那一刻起，雙方確認 → 場次 → Ban/Pick → 對戰 →
//  結算，走的都是既有的 `useMatchFlow`，這裡沒有第二條流程。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC, MONO } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const Panel = ({ title, right, children }) => (
  <div style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "11px 13px", marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

export default function CompetitionScreen({ onBack, onPlay }) {
  //  訂閱原始值 ⇒ 賽季一變就重繪（不訂閱函式本身：那是正式驗收踩過的坑）
  const competition = useProfileStore((s) => s.competition);
  const days = useProfileStore((s) => s.meta?.days ?? 1);
  const ensureCompetitionSeason = useProfileStore((s) => s.ensureCompetitionSeason);

  const [err, setErr] = useState(null);
  const [confirmForfeit, setConfirmForfeit] = useState(null);

  //  沒有賽季就在這裡建（決定性：只由 team.id 與 meta.seasonSeed 決定）。
  //  刻意不在載入存檔時建——那會讓每個舊存檔莫名多出一整季賽程。
  useEffect(() => { ensureCompetitionSeason(); }, [ensureCompetitionSeason]);

  const view = useProfileStore.getState().competitionView();
  if (!view.hasSeason) {
    return (
      <ManageFrame title="聯賽" subtitle="COMPETITION" onBack={onBack}>
        <Panel title="賽季">
          <div style={{ fontSize: 12, color: GC.gray }}>尚未建立賽季。</div>
        </Panel>
      </ManageFrame>
    );
  }

  const { standings, next, nextDay, today, progress, participants } = view;
  const myId = useProfileStore.getState().competition?.playerTeamId;
  const nameOf = (id) => participants.find((p) => p.id === id)?.name ?? id;
  const tagOf = (id) => participants.find((p) => p.id === id)?.tag ?? "";

  const play = (fixtureId) => {
    setErr(null);
    const r = useProfileStore.getState().startFixtureMatch(fixtureId);
    if (!r.ok) { setErr(r.reason ?? "無法出賽"); return; }
    onPlay?.();
  };
  const forfeit = (fixtureId) => {
    setErr(null);
    const r = useProfileStore.getState().forfeitFixture(fixtureId);
    if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法棄權");
    setConfirmForfeit(null);
  };

  //  今天的比賽優先；沒有就顯示下一場
  const focus = today ?? next;
  const isToday = !!today;
  const oppId = focus ? (focus.sideA === myId ? focus.sideB : focus.sideA) : null;
  const home = focus ? focus.sideA === myId : false;

  return (
    <ManageFrame
      title="聯賽"
      subtitle={`S${view.season} · 第 ${days} / ${progress.seasonDays} 天`}
      onBack={onBack}
      right={<span style={{ ...{ fontSize: 9, fontWeight: 800, color: GC.gray } }}>{progress.playerCompleted}/{progress.playerTotal} 場</span>}
    >
      {err && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${GC.red}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 10, fontSize: 11.5, color: GC.redL }}>
          {err}
        </div>
      )}

      {/* ── 我的下一場 ─────────────────────────────────────────────── */}
      <Panel
        title={isToday ? "今日賽事" : "下一場賽事"}
        right={focus && <span style={{ fontSize: 9, fontWeight: 800, color: isToday ? GC.gold : GC.gray }}>{isToday ? "今天" : `第 ${nextDay} 天`}</span>}
      >
        {!focus && <div style={{ fontSize: 12, color: GC.gray }}>本季你的比賽都打完了。</div>}
        {focus && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "6px 0 10px" }}>
              <div style={{ textAlign: "right", flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#e5e7eb" }}>{nameOf(myId)}</div>
                <div style={{ fontSize: 9, color: GC.gray }}>{home ? "主場" : "客場"}</div>
              </div>
              <div style={{ fontSize: 11, color: GC.gray, fontFamily: MONO }}>VS</div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#e5e7eb" }}>{nameOf(oppId)}</div>
                <div style={{ fontSize: 9, color: GC.gray }}>{home ? "客場" : "主場"}</div>
              </div>
            </div>
            {isToday ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => play(focus.id)}
                  style={{ flex: 1, background: `linear-gradient(135deg,${GC.purp},#7c3aed)`, border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}
                >
                  ⚔️ 出賽
                </button>
                {confirmForfeit === focus.id ? (
                  <button
                    onClick={() => forfeit(focus.id)}
                    style={{ background: GC.red, border: "none", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                  >
                    確定棄權？
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmForfeit(focus.id)}
                    style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 10, padding: "11px 14px", color: GC.gray, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    棄權
                  </button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: GC.gray, textAlign: "center" }}>
                推進天數到第 {nextDay} 天就能出賽（推進會自動停在比賽日）
              </div>
            )}
          </>
        )}
      </Panel>

      {/* ── 積分榜 ─────────────────────────────────────────────────── */}
      <Panel title="積分榜 STANDINGS" right={<span style={{ fontSize: 9, color: GC.gray }}>{standings.rule.label}</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 46px 30px 34px", fontSize: 8.5, color: GC.gray, fontWeight: 800, paddingBottom: 4, borderBottom: `1px solid ${GC.line}` }}>
          <span>#</span><span>隊伍</span><span style={{ textAlign: "center" }}>勝敗</span><span style={{ textAlign: "center" }}>分</span><span style={{ textAlign: "right" }}>淨勝</span>
        </div>
        {standings.rows.map((r) => (
          <div
            key={r.teamId}
            style={{
              display: "grid", gridTemplateColumns: "18px 1fr 46px 30px 34px", fontSize: 11.5,
              padding: "4px 0", alignItems: "center",
              color: r.teamId === myId ? GC.gold : "rgba(255,255,255,0.82)",
              fontWeight: r.teamId === myId ? 900 : 600,
            }}
          >
            <span style={{ fontFamily: MONO, color: GC.gray }}>{r.rank}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}{tagOf(r.teamId) && <span style={{ fontSize: 8.5, color: GC.gray, marginLeft: 4 }}>{tagOf(r.teamId)}</span>}
            </span>
            <span style={{ fontFamily: MONO, textAlign: "center" }}>{r.wins}-{r.losses}</span>
            <span style={{ fontFamily: MONO, textAlign: "center" }}>{r.points}</span>
            <span style={{ fontFamily: MONO, textAlign: "right", color: r.scoreDiff > 0 ? GC.green : r.scoreDiff < 0 ? GC.redL : GC.gray }}>
              {r.scoreDiff > 0 ? "+" : ""}{r.scoreDiff}
            </span>
          </div>
        ))}
        {/* 誠實標示：有多少場不是玩家實打的 */}
        {(() => {
          const me = standings.rows.find((r) => r.teamId === myId);
          if (!me || !me.played) return null;
          return (
            <div style={{ fontSize: 9, color: GC.gray, marginTop: 7, paddingTop: 6, borderTop: `1px solid ${GC.line}` }}>
              你已出賽 {me.played} 場：實際對戰 {me.engineGames}
              {me.forfeitedGames ? ` · 棄權 ${me.forfeitedGames}` : ""}
              {me.simulatedGames ? ` · 模擬 ${me.simulatedGames}` : ""}
            </div>
          );
        })()}
      </Panel>

      {/* ── 賽季進度 ───────────────────────────────────────────────── */}
      <Panel title="賽季進度">
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)" }}>
          全聯盟 {progress.completed} / {progress.total} 場已完成
        </div>
        <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 3 }}>
          AI 之間的比賽會在你推進天數時自動模擬。
        </div>
      </Panel>
    </ManageFrame>
  );
}
