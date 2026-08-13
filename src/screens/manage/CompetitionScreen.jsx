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

export default function CompetitionScreen({ onBack, onPlay, onResume }) {
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

  const { standings, next, nextDay, today, progress, participants, live, final, award } = view;
  //  Q5：賽季進度改用**賽季相對天數**（`seasonDay`），不再拿絕對遊戲日對 84
  const { seasonDay, seasonDays, history, canRoll, playoff } = view;
  const MATCH_LABEL = { sf1: "準決賽 ①", sf2: "準決賽 ②", bronze: "季軍戰", final: "決賽" };

  const rollSeason = () => {
    setErr(null);
    const r = useProfileStore.getState().rollToNextCompetitionSeason();
    if (!r.ok) setErr(r.reason ?? "無法開始下一賽季");
  };
  const myId = useProfileStore.getState().competition?.playerTeamId;
  const nameOf = (id) => participants.find((p) => p.id === id)?.name ?? id;
  const tagOf = (id) => participants.find((p) => p.id === id)?.tag ?? "";

  const play = (fixtureId) => {
    setErr(null);
    const r = useProfileStore.getState().startFixtureMatch(fixtureId);
    if (!r.ok) { setErr(r.reason ?? "無法出賽"); return; }
    onPlay?.();
  };
  //  Q3.6：進行中的賽程對戰，從這裡直接回去。
  //  舊行為是賽事頁只寫「你有一場進行中的對戰，請直接返回那一場」卻**沒有按鈕**，
  //  玩家得繞 主畫面 → MOBA 磚 → 賽前配置 才回得去。
  //  ⚠ 用的是既有的 `resumeMatchSession()`（賽前頁那顆「返回進行中的對戰」同一支），
  //    導向也是同一個目的地 ⇒ 沒有第二條進場流程。能不能 resume 由 Store 判，
  //    這裡只負責把失敗原因顯示出來。
  const resume = () => {
    setErr(null);
    const r = useProfileStore.getState().resumeMatchSession();
    if (!r.ok) { setErr(r.errors?.[0]?.message ?? "無法返回比賽"); return; }
    onResume?.();
  };
  const forfeit = (fixtureId) => {
    setErr(null);
    const r = useProfileStore.getState().forfeitFixture(fixtureId);
    if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法棄權");
    setConfirmForfeit(null);
  };

  //  今天的比賽優先；沒有就顯示下一場
  const isToday = !!today;
  //  ── Q7a：同一天可能有多場 ────────────────────────────────────────────
  //  多個 Event 並存之後，今天不一定只有一場。`todayPending` 是 Store 給的
  //  **當天全部未收尾**的玩家賽事；以前這裡只畫 `today`（清單第一場），
  //  第二場就變成「看不見卻走不出今天」。
  //  ⚠ 舊存檔或舊 Store 沒有這個欄位 ⇒ 退回單筆，畫面不會壞。
  const todayList = view.todayPending ?? (today ? [today] : []);
  const rows = isToday ? todayList : (next ? [next] : []);

  return (
    <ManageFrame
      title="聯賽"
      subtitle={`S${view.season} · 第 ${seasonDay} / ${seasonDays} 天`}
      onBack={onBack}
      right={<span style={{ ...{ fontSize: 9, fontWeight: 800, color: GC.gray } }}>{progress.playerCompleted}/{progress.playerTotal} 場</span>}
    >
      {err && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${GC.red}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 10, fontSize: 11.5, color: GC.redL }}>
          {err}
        </div>
      )}

      {/*  ── 賽季結束：最終名次 ＋ 名次獎金（Milestone Q4）──────────────
           賽季封存後才出現。**畫面不判斷賽季結不結束、也不算名次與獎金**——
           `final` 是 Store 封存好的不可變快照，`award` 是既有的獎金收據，
           這裡只是把兩份既有資料顯示出來。 */}
      {final && (
        <Panel
          title="最終名次 FINAL STANDINGS"
          right={<span style={{ fontSize: 9, fontWeight: 800, color: GC.gold }}>第 {final.season} 賽季 · 已封存</span>}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, padding: "4px 0 8px" }}>
            <span style={{ fontSize: 11, color: GC.gray }}>你的最終名次</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: GC.gold, fontFamily: MONO, lineHeight: 1 }}>{final.playerRank}</span>
            <span style={{ fontSize: 11, color: GC.gray }}>／ {final.rows.length} 隊</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "3px 0", borderTop: `1px solid ${GC.line}` }}>
            <span style={{ color: GC.gray }}>🏆 冠軍</span>
            <span style={{ fontWeight: 800, color: "#e5e7eb" }}>{nameOf(final.championTeamId ?? final.rows[0]?.teamId)}</span>
          </div>
          {/*  Q6：名次由季後賽決定時，同時標出常規賽名次——兩個都是事實，
               只顯示一個會讓「常規賽第 1 但季後賽輸了」看起來像資料錯誤。 */}
          {final.rankSource === "playoff" && final.playerRegularRank && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "3px 0" }}>
              <span style={{ color: GC.gray }}>📋 常規賽名次</span>
              <span style={{ fontWeight: 800, color: GC.gray2 ?? "#a1a1aa", fontFamily: MONO }}>第 {final.playerRegularRank} 名</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "3px 0" }}>
            <span style={{ color: GC.gray }}>💰 名次獎金</span>
            {/*  誠實顯示：沒有獎金的名次就寫「無」，不寫 $0 假裝有發 */}
            <span style={{ fontWeight: 800, color: award?.amount > 0 ? GC.green : GC.gray, fontFamily: MONO }}>
              {award ? (award.amount > 0 ? `+$${award.amount}萬` : "無（前四名才有）") : "—"}
            </span>
          </div>
          {final.sourceMix && (
            <div style={{ fontSize: 9, color: GC.gray, marginTop: 7, paddingTop: 6, borderTop: `1px solid ${GC.line}` }}>
              本季 {final.sourceMix.total} 場：實際對戰 {final.sourceMix.engine}
              {final.sourceMix.simulated ? ` · 模擬 ${final.sourceMix.simulated}` : ""}
              {final.sourceMix.forfeited ? ` · 棄權 ${final.sourceMix.forfeited}` : ""}
              　·　第 {final.sealedAtDay} 天封存
            </div>
          )}
          {/*  Q5：換季是**玩家自己按**的。封存與發獎自動（漏發是災難），
               但換季會把這一頁換成新賽季的空賽程——玩家還沒看到成績就被收走不合理。
               能不能換由 Store 的 `canRoll` 決定，畫面不自己判。 */}
          {canRoll?.ok && (
            <button
              onClick={rollSeason}
              style={{ width: "100%", marginTop: 10, background: `linear-gradient(135deg,${GC.purp},#7c3aed)`, border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
            >
              ▶ 開始第 {canRoll.nextSeason} 賽季
            </button>
          )}
        </Panel>
      )}

      {/*  ── 歷屆成績（Q5）──────────────────────────────────────────────
           換季之後上一季的最終名次仍然查得到。這裡只讀已封存的快照，
           不重算任何名次——那些數字在封存那一刻就固定了。 */}
      {history?.length > 0 && (
        <Panel title="歷屆成績 HISTORY" right={<span style={{ fontSize: 9, color: GC.gray }}>{history.length} 季</span>}>
          {history.map((h) => (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, padding: "4px 0", borderTop: `1px solid ${GC.line}` }}>
              <span style={{ color: GC.gray, fontFamily: MONO }}>S{h.season}</span>
              <span style={{ flex: 1, textAlign: "left", marginLeft: 10, color: "rgba(255,255,255,0.8)" }}>
                🏆 {h.rows?.[0]?.name ?? "—"}
              </span>
              <span style={{ fontWeight: 800, color: h.playerRank <= 4 ? GC.gold : GC.gray, fontFamily: MONO }}>
                我 第 {h.playerRank} 名
              </span>
            </div>
          ))}
        </Panel>
      )}

      {/*  ── 季後賽對戰表（Milestone Q6）────────────────────────────────
           常規賽結束後才出現。畫面**不判斷誰晉級、不算勝負**——晉級名單與
           對戰表都是 Store 依常規賽積分榜產生好的。 */}
      {playoff && (
        <Panel
          title="季後賽 PLAYOFFS"
          right={<span style={{ fontSize: 9, fontWeight: 800, color: playoff.done ? GC.gold : GC.gray }}>
            {playoff.done ? "已結束" : "進行中"}
          </span>}
        >
          <div style={{ fontSize: 9, color: GC.gray, marginBottom: 7 }}>
            常規賽前四名晉級：{playoff.qualified.map((q) => `${q.seed}. ${q.name}`).join("　")}
          </div>
          {playoff.bracket.filter((m) => m.exists).map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0", borderTop: `1px solid ${GC.line}` }}>
              <span style={{ color: GC.gray, width: 62, flexShrink: 0 }}>{MATCH_LABEL[m.key]}</span>
              <span style={{ flex: 1, textAlign: "center", color: "rgba(255,255,255,0.85)" }}>
                <b style={{ color: m.winner === m.sideA ? GC.gold : "inherit" }}>{m.nameA}</b>
                <span style={{ color: GC.gray, margin: "0 6px", fontFamily: MONO }}>
                  {m.score ? `${m.score.a}:${m.score.b}` : "vs"}
                </span>
                <b style={{ color: m.winner === m.sideB ? GC.gold : "inherit" }}>{m.nameB}</b>
              </span>
              <span style={{ width: 44, textAlign: "right", fontSize: 9, color: m.done ? GC.green : GC.gray }}>
                {m.done ? "已完成" : `第 ${m.day} 天`}
              </span>
            </div>
          ))}
          {/*  誠實顯示：決賽與季軍戰要等準決賽打完才排得出來，不畫假的空格子 */}
          {playoff.bracket.some((m) => !m.exists) && (
            <div style={{ fontSize: 9, color: GC.gray, marginTop: 6 }}>
              決賽與季軍戰的對手要等準決賽結束才確定。
            </div>
          )}
        </Panel>
      )}

      {/* ── 我的下一場 ─────────────────────────────────────────────── */}
      <Panel
        title={isToday ? "今日賽事" : "下一場賽事"}
        right={rows.length > 0 && (
          <span style={{ fontSize: 9, fontWeight: 800, color: isToday ? GC.gold : GC.gray }}>
            {isToday ? (rows.length > 1 ? `今天 · ${rows.length} 場` : "今天") : `第 ${nextDay} 天`}
          </span>
        )}
      >
        {rows.length === 0 && <div style={{ fontSize: 12, color: GC.gray }}>本季你的比賽都打完了。</div>}
        {/*  ⚠ 一天多場時，每一場都自己一列、自己一組按鈕。棄權確認本來就以
             fixture id 為 key，所以天然是「棄哪一場就確認哪一場」。
             ⚠ 有進行中場次時，其他場的「出賽」**刻意仍然可按**——能不能開下一場
             由 Store 判（會回「請先打完或放棄那一場」並顯示在上方錯誤列），
             畫面不自己判規則。 */}
        {rows.map((focus, idx) => {
          const oppId = focus.sideA === myId ? focus.sideB : focus.sideA;
          const home = focus.sideA === myId;
          const isLive = live?.fixtureId === focus.id;
          return (
          <div key={focus.id} style={idx > 0 ? { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${GC.line}` } : undefined}>
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
              //  UI 修正：棄權是**不可逆**的（fixture 進 forfeited 就是終局，
              //  Q3 的 issueFor 永遠不會再簽發）。舊版的二次確認就地把「棄權」
              //  換成「確定棄權？」——**同一個座標**，手機上連點兩下就直接丟掉一場。
              //  現在確認態換成一整列：「取消」放回原本棄權鈕的位置（誤觸的第二下
              //  打在取消上），確定鍵移到左邊並寫明後果，且一定給得起退路。
              confirmForfeit === focus.id ? (
                <>
                  <div style={{ fontSize: 11, color: GC.redL, marginBottom: 7, lineHeight: 1.45 }}>
                    棄權後本場直接記為敗場，<b>不能再打、也不能還原</b>。確定嗎？
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => forfeit(focus.id)}
                      style={{ flex: 1, background: GC.red, border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
                    >
                      確定棄權
                    </button>
                    <button
                      onClick={() => setConfirmForfeit(null)}
                      style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 10, padding: "11px 20px", color: "#e5e7eb", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
                    >
                      取消
                    </button>
                  </div>
                </>
              ) : (
              <div style={{ display: "flex", gap: 8 }}>
                {/*  Q3.6：已經有一場進行中的賽程對戰 ⇒ 這顆改成「返回比賽」。
                     維持原本的位置與樣式，玩家的主要動作永遠是同一顆。
                     `live` 是 Store 給的事實（有沒有沒打完的賽程場次），
                     畫面不自己判斷「能不能回去」——那由 `resumeMatchSession()` 決定。 */}
                <button
                  onClick={() => (isLive ? resume() : play(focus.id))}
                  style={{ flex: 1, background: `linear-gradient(135deg,${GC.purp},#7c3aed)`, border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}
                >
                  {isLive ? "⚔️ 返回比賽" : "⚔️ 出賽"}
                </button>
                <button
                  onClick={() => setConfirmForfeit(focus.id)}
                  style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 10, padding: "11px 14px", color: GC.gray, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  棄權
                </button>
              </div>
              )
            ) : (
              <div style={{ fontSize: 11, color: GC.gray, textAlign: "center" }}>
                推進天數到第 {nextDay} 天就能出賽（推進會自動停在比賽日）
              </div>
            )}
          </div>
          );
        })}
      </Panel>

      {/* ── 積分榜 ─────────────────────────────────────────────────── */}
      <Panel title={final ? "最終積分榜 STANDINGS" : "積分榜 STANDINGS"} right={<span style={{ fontSize: 9, color: GC.gray }}>{standings.rule.label}</span>}>
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
