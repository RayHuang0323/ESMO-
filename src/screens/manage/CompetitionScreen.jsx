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
//
//  ── UI-1：這個畫面是哪一個項目的？由呼叫端決定 ───────────────────────────
//  本檔原本把「MOBA」寫死在畫面層：`competitionView()` 不帶參數 ⇒ 預設 moba，
//  訂閱的又是 `s.competition`（`competitionByMode.moba` 的唯讀別名）。
//  Store 早就是 by-mode 的（`competitionByMode: { moba, cs }`），寫死的只有這裡。
//
//  現在接受 `mode` / `gameMode`（預設 `"moba"`），所有讀取都帶著它走：
//    · `competitionView(gameMode)`          積分榜／賽程／進度／季後賽／歷屆
//    · `competitionByMode[gameMode]`        canonical 切片（moba 時與舊別名同一個參考）
//    · `ensureCompetitionSeason(gameMode)`  **只有 moba 會自動呼叫**，理由見下
//
//  ⚠ 賽季建立只自動做 MOBA 的。`ensureCompetitionSeason("cs")` 真的會建出一整季
//    CS 聯賽，而 CS 的產品契約是「賽季**不自動建立**」——開季按鈕在 CS 賽前頁，
//    由玩家自己按。掛載一個畫面就偷偷開一季，是這裡最糟的失敗模式。
//    ⇒ 非 moba 模式沒有賽季時誠實顯示空狀態，不代玩家開季。
//
//  ⚠ 有三個區塊**目前只對 MOBA 成立**，非 moba 模式刻意不渲染：
//      · `AsiaFinalsPanel` / `SeasonRecap` —— 它們內部自己呼叫 `competitionView()`
//        （moba 預設）。本輪不改那兩個檔 ⇒ 掛在 CS 頁上會顯示 MOBA 的資料。
//      · 賽事切換列 —— `setActiveEvent()` 在 Store 裡讀的是 `get().competition`
//        （moba 別名），在 CS 頁按下去會寫到 MOBA 的賽季。
//      · 歷屆巡迴 `circuitHistory` —— 全域切片，內容是 MOBA 亞洲巡迴賽的結論。
//    要跨項目共用得先把它們 by-mode 化，那屬 UI-2 的殼，不在本輪。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC, MONO, chip } from "../../ui/theme.js";
//  UI-4B：賽事頁的外框改用 Competition 區域共用的 `CompetitionFrame`
//  （不再走經營模組的 `ManageFrame`）——賽事中心兩個分頁要看起來是同一套 UI。
import CompetitionFrame from "../competition/CompetitionFrame.jsx";
import CompetitionPanel from "../competition/CompetitionPanel.jsx";
import AsiaFinalsPanel from "./asiaFinals/AsiaFinalsPanel.jsx";
//  UI-4A：與 CS 賽事中心共用的純呈現元件（不算任何數字，見各檔檔頭）
import StandingsTable from "../competition/StandingsTable.jsx";
import { FixtureRow } from "../competition/FixtureList.jsx";
import RecapNextSeason from "./seasonRecap/RecapNextSeason.jsx";
import SeasonRecap from "./seasonRecap/SeasonRecap.jsx";

//  UI-4B：卡片改用與 CS 共用的 `CompetitionPanel`。
//  簽名一致（title / right / children），所以底下十幾個 `<Panel …>` 呼叫點
//  一行都不用動——共用的是外框，不是把這一頁重寫一遍。
const Panel = CompetitionPanel;

/** 沒有賽季時的標題。moba 維持既有的「聯賽」，不因為多了參數就改文案。 */
const FALLBACK_TITLE = { moba: "聯賽", cs: "CS 聯賽" };

export default function CompetitionScreen({ onBack, onPlay, onResume, mode, gameMode }) {
  //  `gameMode` 與 `mode` 是同一件事的兩個名字（Store 用 gameMode，畫面層習慣 mode）。
  //  兩個都沒給就是 "moba" ⇒ 既有呼叫端 `<CompetitionScreen onBack … />` 行為不變。
  const gm = gameMode ?? mode ?? "moba";
  const isMoba = gm === "moba";

  //  訂閱原始值 ⇒ 賽季一變就重繪（不訂閱函式本身：那是正式驗收踩過的坑）
  //  ⚠ 改讀 canonical 的 `competitionByMode[gm]` 而不是 `s.competition`。
  //    moba 時兩者是**同一個物件參考**（別名就是從 canonical 投影出來的），
  //    所以 zustand 的 Object.is 比較結果一模一樣 ⇒ 重繪時機零變化。
  const competition = useProfileStore((s) => s.competitionByMode?.[gm] ?? null);
  const days = useProfileStore((s) => s.meta?.days ?? 1);
  const ensureCompetitionSeason = useProfileStore((s) => s.ensureCompetitionSeason);

  const [err, setErr] = useState(null);
  const [confirmForfeit, setConfirmForfeit] = useState(null);

  //  沒有賽季就在這裡建（決定性：只由 team.id 與 meta.seasonSeed 決定）。
  //  刻意不在載入存檔時建——那會讓每個舊存檔莫名多出一整季賽程。
  //  ⚠ 只有 MOBA。CS 的開季是玩家的明確動作（見檔頭），畫面掛載不得代勞。
  useEffect(() => { if (isMoba) ensureCompetitionSeason("moba"); }, [ensureCompetitionSeason, isMoba]);

  const view = useProfileStore.getState().competitionView(gm);
  if (!view.hasSeason) {
    return (
      <CompetitionFrame eyebrow="COMPETITION" title={FALLBACK_TITLE[gm] ?? "聯賽"} accent={GC.purp} onBack={onBack}>
        <Panel title="賽季">
          <div className="esmo-comp__empty">尚未建立賽季。</div>
        </Panel>
      </CompetitionFrame>
    );
  }

  const { standings, next, nextDay, today, progress, participants, live, final } = view;
  //  ── Q7a-3f.1：生涯成績與賽季封存物件是**兩件事** ──────────────────────
  //  `final` 是**賽季**封存物件：單 Event 時是 FinalStandings，
  //  多 Event 時是 `SeasonSeal.v1`（**沒有** rows／playerRank／championTeamId）。
  //  玩家要看的「我這一季第幾名」在**生涯主要賽事**的封存名次裡（`view.careerFinal`）。
  //  ⚠ Q7f 起那份資料與名次獎金收據（`view.award`）都由 `SeasonRecap` 自己從
  //    同一個 `competitionView()` 讀，本檔不再轉手——轉手只會多出一條會漂移的路徑。
  //    這裡留 `final` 是因為本檔仍要用它判斷「賽季是否已封存」。
  //  Q5：賽季進度改用**賽季相對天數**（`seasonDay`），不再拿絕對遊戲日對 84
  const { seasonDay, seasonDays, history, canRoll, playoff } = view;
  //  Q7a-3b.5：同季多個 Event。**只有兩個以上才出現切換列**——
  //  單一 Event（所有既有存檔）的畫面與先前逐格相同。
  const eventViews = view.eventViews ?? [];
  const multiEvent = eventViews.length > 1;
  const focusedEventId = view.activeEventId ?? null;
  //  三種狀態各給一個顏色，讓「已封存／進行中／未開始」一眼分得出來
  const STATUS_TONE = { sealed: GC.gray, running: GC.gold, upcoming: GC.blueL };
  const MATCH_LABEL = { sf1: "準決賽 ①", sf2: "準決賽 ②", bronze: "季軍戰", final: "決賽" };

  //  ── Q7a-3e：巡迴積分（唯讀）──────────────────────────────────────────
  //  ⚠ 這一段**一分都不算**：名次、分數、晉級名單全部來自
  //    `competitionView().circuitPoints`（底下是 3c 的純函式）。畫面只做兩件事：
  //    挑出要顯示的資料、把它畫出來。
  //  ⚠ **只顯示「有積分政策」的巡迴賽**。legacy 聯賽那條巡迴賽沒有政策
  //    （也永遠不會有），把它畫成「未結算」只是噪音——舊存檔的畫面因此
  //    與先前逐格相同，整個區塊根本不會出現。
  const cp = view.circuitPoints ?? null;
  const pointCircuits = Object.values(view.circuits ?? {}).filter((c) => c?.pointsPolicy);
  //  歷屆巡迴摘要：換季時封存的結論（Store 切片，不是重算出來的）
  //  ⚠ `circuitHistory` 是全域切片、內容是 MOBA 亞洲巡迴賽 ⇒ 只給 moba 讀。
  const circuitHistory = isMoba ? (useProfileStore.getState().circuitHistory ?? []) : [];
  const POINTS_TONE = { settled: GC.green, not_started: GC.gray, policy_required: GC.red };
  const POINTS_LABEL = { settled: "已結算", not_started: "未結算", policy_required: "缺積分政策" };

  //  換季：兩個項目各有自己的 rollover（賽季編號、參賽者、封存物件都不同）。
  //  能不能換季仍由 Store 的 `canRoll` 判定，這裡只負責選對那一支。
  const rollSeason = () => {
    setErr(null);
    const store = useProfileStore.getState();
    const r = isMoba ? store.rollToNextCompetitionSeason() : store.rollToNextCsSeason();
    if (!r.ok) setErr(r.reason ?? "無法開始下一賽季");
  };
  const myId = useProfileStore.getState().competitionByMode?.[gm]?.playerTeamId;
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
    <CompetitionFrame
      eyebrow="COMPETITION"
      title={view.focusedEventName ?? "聯賽"}
      subtitle={`S${view.season} · 第 ${seasonDay} / ${seasonDays} 天`}
      accent={GC.purp}
      onBack={onBack}
      right={<>{progress.playerCompleted}/{progress.playerTotal} 場</>}
    >
      {/*  ⚠ 亞洲年度總決賽是 MOBA 的 Q7a 內容，而且 `AsiaFinalsPanel` 內部自己
           呼叫 `competitionView()`（moba 預設）⇒ 掛在 CS 頁上會顯示 MOBA 的資料。 */}
      {isMoba && <AsiaFinalsPanel />}
      {/* ── Q7a-3b.5：同季多個 Event 的切換列 ────────────────────────────
           ⚠ 切換**只影響畫面聚焦**（`setActiveEvent`），不參與任何規則：
             積分榜、季後賽排定、封存與獎金都不讀 `activeEventId`。
           ⚠ 只有兩個以上 Event 才渲染；單一 Event 時整段不存在，
             legacy 畫面維持現況。
           ⚠ 橫向捲動 ＋ 每張卡最小寬度 ⇒ 手機上也點得到、看得完。
           ⚠ 只給 moba：`setActiveEvent()` 在 Store 裡讀的是 `get().competition`
             （moba 別名），在 CS 頁按下去會把聚焦寫到 MOBA 的賽季。要跨項目
             得先讓那支 action 接受 gameMode——屬 UI-2，不在本輪。 */}
      {isMoba && multiEvent && (
        <Panel
          title="本季賽事 EVENTS"
          right={<span style={{ fontSize: 9, fontWeight: 800, color: GC.gray }}>{eventViews.length} 項</span>}
        >
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 1px 4px", WebkitOverflowScrolling: "touch" }}>
            {eventViews.map((ev) => {
              const on = ev.id === focusedEventId;
              const tone = STATUS_TONE[ev.status];
              const pct = ev.mineTotal > 0 ? Math.round((ev.mineDone / ev.mineTotal) * 100) : 0;
              return (
                <button
                  key={ev.id}
                  onClick={() => { setErr(null); useProfileStore.getState().setActiveEvent(ev.id); }}
                  style={{
                    position: "relative", flex: "0 0 auto", width: 158, textAlign: "left",
                    background: on
                      ? `linear-gradient(160deg, rgba(167,139,250,0.20), rgba(167,139,250,0.05))`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${on ? GC.purp + "aa" : GC.line}`,
                    borderRadius: 12, padding: "9px 11px 10px", cursor: "pointer", color: "#e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  {/*  左側狀態色條：不用讀字也分得出三種狀態 */}
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: tone, opacity: on ? 1 : 0.55 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <span style={chip(tone)}>{ev.statusLabel}</span>
                    {ev.isToday && <span style={chip(GC.gold)}>今天</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.3, minHeight: 31 }}>{ev.name}</div>

                  {/*  我方進度條——比純數字更快讀懂「這個賽事我打到哪」 */}
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", margin: "7px 0 5px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: tone, opacity: 0.85 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: GC.gray, fontFamily: MONO }}>
                    <span>{ev.stageLabel}</span>
                    <span>{ev.mineDone}/{ev.mineTotal}</span>
                  </div>

                  {ev.playerRank != null && (
                    <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: 800, color: ev.playerRankIsFinal ? GC.gold : "#e5e7eb" }}>
                      {ev.playerRankIsFinal && ev.playerRank === 1 ? "🏆 " : ""}
                      第 {ev.playerRank} 名
                      <span style={{ fontSize: 8.5, color: GC.gray, fontWeight: 700 }}>
                        {ev.playerRankIsFinal ? "　最終" : "　暫定"}
                      </span>
                    </div>
                  )}
                  {/*  誠實顯示：沒有獎金的賽事就不寫獎金，不寫 $0 假裝有 */}
                  {ev.awardAmount > 0 && (
                    <div style={{ marginTop: 3, fontSize: 9.5, color: GC.green, fontFamily: MONO, fontWeight: 800 }}>
                      +${ev.awardAmount}萬
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: GC.gray, marginTop: 6, lineHeight: 1.5 }}>
            切換只改變這一頁看哪一個賽事，不影響賽程、積分與獎金結算。
          </div>
        </Panel>
      )}

      {err && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${GC.red}55`, borderRadius: 10, padding: "8px 11px", marginBottom: 10, fontSize: 11.5, color: GC.redL }}>
          {err}
        </div>
      )}

      {/*  ── 巡迴積分（Q7a-3e）────────────────────────────────────────────
           三站分開打、積分跨站累積、前四名拿年度總決賽資格——這些先前只存在
           資料裡，玩家完全看不到。這個區塊把它變成看得見的東西。
           ⚠ 全部唯讀：一個數字都不是這裡算的。 */}
      {cp && pointCircuits.map((circuit) => {
        const table = cp.standings?.[circuit.id] ?? { rows: [] };
        const rowsC = table.rows ?? [];
        const meRow = rowsC.find((r) => r.teamId === myId) ?? null;
        const qual = (cp.qualifications ?? []).find((q) => q.circuitId === circuit.id) ?? null;
        const slots = cp.slots ?? 0;
        const stops = eventViews.filter((ev) => ev.circuitId === circuit.id);
        const settledCount = stops.filter((ev) => cp.eventStatus?.[ev.id]?.status === "settled").length;
        //  晉級狀態：已核發就是定局；還沒核發就只能說「暫定」——
        //  ⚠ 不可以把暫定講成已晉級，那是最容易讓玩家記恨的一種錯。
        const inZone = meRow && slots > 0 && meRow.rank <= slots;
        const qualified = qual ? (qual.qualified ?? []).some((x) => x.teamId === myId) : null;
        const cutRow = slots > 0 ? rowsC[slots - 1] ?? null : null;
        const gap = meRow && cutRow && meRow.rank > slots ? cutRow.points - meRow.points : null;

        return (
          <Panel
            key={circuit.id}
            title="巡迴積分 CIRCUIT POINTS"
            right={<span style={{ fontSize: 9, fontWeight: 800, color: GC.gray }}>{settledCount}/{stops.length} 站結算</span>}
          >
            <div style={{ fontSize: 11.5, fontWeight: 900, color: GC.purp, marginBottom: 8 }}>{circuit.name}</div>

            {/*  我的名次：這一頁最重要的一個數字，給它應有的體積 */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 9,
              background: `linear-gradient(135deg, ${inZone ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.04)"}, rgba(255,255,255,0.02))`,
              border: `1px solid ${inZone ? GC.gold + "55" : GC.line}`, borderRadius: 12,
            }}>
              <div style={{ textAlign: "center", minWidth: 62 }}>
                <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, fontFamily: MONO, color: inZone ? GC.gold : "#e5e7eb" }}>
                  {meRow ? meRow.rank : "—"}
                </div>
                <div style={{ fontSize: 8.5, color: GC.gray, marginTop: 3 }}>／ {rowsC.length || "—"} 隊</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#e5e7eb", fontFamily: MONO }}>
                  {meRow ? meRow.points : 0}<span style={{ fontSize: 10, color: GC.gray, fontWeight: 700 }}> 分</span>
                </div>
                <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 2 }}>
                  {meRow ? `${meRow.events} 站出賽　冠軍 ${meRow.championships}　前三 ${meRow.podiums}` : "尚未取得積分"}
                </div>
                <div style={{ marginTop: 6 }}>
                  {qual
                    ? <span style={chip(qualified ? GC.gold : GC.gray)}>{qualified ? "✓ 已取得年度總決賽資格" : "未取得資格"}</span>
                    : <span style={chip(inZone ? GC.gold : GC.blueL)}>
                        {inZone ? `暫居晉級區（前 ${slots}）` : gap != null ? `距晉級線 ${gap} 分` : "尚未進入晉級區"}
                      </span>}
                </div>
              </div>
            </div>

            {/*  三站狀態：一站一張卡，橫向捲動 ⇒ 手機也看得完 */}
            <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "1px 1px 5px", WebkitOverflowScrolling: "touch", marginBottom: 4 }}>
              {stops.map((ev) => {
                const ps = cp.eventStatus?.[ev.id] ?? { status: "not_started" };
                const mine = (cp.playerEntries ?? []).find((e) => e.eventId === ev.id) ?? null;
                const tone = POINTS_TONE[ps.status] ?? GC.gray;
                return (
                  <div key={ev.id} style={{
                    position: "relative", flex: "0 0 auto", width: 132, padding: "8px 10px 9px",
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${GC.line}`, borderRadius: 11, overflow: "hidden",
                  }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: tone, opacity: 0.8 }} />
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#e5e7eb", lineHeight: 1.3, minHeight: 29 }}>{ev.name}</div>
                    <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={chip(tone)}>{POINTS_LABEL[ps.status] ?? ps.status}</span>
                      {mine?.tierMultiplier > 1 && <span style={chip(GC.purp)}>×{mine.tierMultiplier}</span>}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, fontFamily: MONO, color: mine ? GC.green : GC.gray }}>
                      {mine ? `+${mine.points}` : "—"}
                      {mine && <span style={{ fontSize: 8.5, color: GC.gray, fontWeight: 700 }}>　第 {mine.rank} 名</span>}
                    </div>
                    {/*  ⚠ 缺政策要**寫出原因**。只寫「未結算」會讓玩家（和我自己）
                         以為只是還沒打完，而不是這一站根本給不了分。 */}
                    {ps.status === "policy_required" && (
                      <div style={{ marginTop: 4, fontSize: 8.5, color: GC.redL, lineHeight: 1.4 }}>{ps.reason}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/*  巡迴榜：前 N 名畫成晉級區，第 N 名之後拉一條線 */}
            {rowsC.map((r, i) => {
              const isMe = r.teamId === myId;
              const inCut = slots > 0 && r.rank <= slots;
              return (
                <div key={r.teamId} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, padding: "4px 6px",
                  borderTop: i === 0 ? "none" : `1px solid ${GC.line}`,
                  borderBottom: slots > 0 && r.rank === slots ? `1px dashed ${GC.gold}77` : undefined,
                  background: isMe ? "rgba(167,139,250,0.10)" : undefined,
                  borderRadius: isMe ? 6 : undefined,
                }}>
                  <span style={{ width: 18, textAlign: "right", fontFamily: MONO, fontWeight: 900, color: inCut ? GC.gold : GC.gray }}>{r.rank}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isMe ? 900 : 600, color: isMe ? "#fff" : "rgba(255,255,255,0.82)" }}>
                    {r.name ?? nameOf(r.teamId)}{r.championships > 0 ? ` 🏆${r.championships}` : ""}
                  </span>
                  <span style={{ fontFamily: MONO, fontWeight: 900, color: isMe ? GC.purp : "rgba(255,255,255,0.7)" }}>{r.points}</span>
                </div>
              );
            })}
            {rowsC.length === 0 && (
              <div style={{ fontSize: 11, color: GC.gray, padding: "6px 0" }}>
                還沒有任何一站結算，巡迴榜要等賽事封存後才會出現。
              </div>
            )}

            {/*  已核發的資格名單——正式資料，不是預測 */}
            {qual && (
              <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${GC.line}` }}>
                <div style={{ fontSize: 9, letterSpacing: "0.16em", color: GC.gold, fontWeight: 900, marginBottom: 5 }}>
                  年度總決賽晉級名單
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(qual.qualified ?? []).map((q) => (
                    <span key={q.teamId} style={{
                      fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 7,
                      background: q.teamId === myId ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${q.teamId === myId ? GC.gold + "88" : GC.line}`,
                      color: q.teamId === myId ? GC.gold : "rgba(255,255,255,0.8)",
                    }}>
                      {q.seed}. {q.name ?? nameOf(q.teamId)}
                      <span style={{ fontFamily: MONO, color: GC.gray, fontWeight: 700 }}> {q.points}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: 9, color: GC.gray, marginTop: 7, lineHeight: 1.5 }}>
              每一站封存後依最終名次給分，跨站累積；全部結算完才核發晉級資格。
            </div>
          </Panel>
        );
      })}

      {/*  ── 歷屆巡迴（Q7a-3e）──────────────────────────────────────────
           換季會把當季積分歸零，但摘要在換季前就封存進 `circuitHistory`。
           這裡只把結論顯示出來，不重算任何名次。 */}
      {circuitHistory.length > 0 && (
        <Panel title="歷屆巡迴 CIRCUIT HISTORY" right={<span style={{ fontSize: 9, color: GC.gray }}>{circuitHistory.length} 季</span>}>
          {circuitHistory.map((h) => {
            const mineQual = (h.qualification?.qualified ?? []).some((x) => x.teamId === h.playerTeamId);
            return (
              <div key={`${h.id}:${h.season}`} style={{ padding: "6px 0", borderTop: `1px solid ${GC.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                  <span style={{ color: GC.gray, fontFamily: MONO }}>S{h.season}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.8)" }}>
                    🏆 {h.standings?.[0]?.name ?? "—"}
                  </span>
                  <span style={{ fontWeight: 900, fontFamily: MONO, color: h.playerRank <= (h.qualification?.slots ?? 4) ? GC.gold : GC.gray }}>
                    我 第 {h.playerRank} 名 · {h.playerPoints} 分
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                  {mineQual && <span style={chip(GC.gold)}>當季晉級</span>}
                  {(h.events ?? []).map((e) => {
                    const mine = (e.rows ?? []).find((r) => r.teamId === h.playerTeamId) ?? null;
                    return (
                      <span key={e.eventId} style={{ fontSize: 9, color: GC.gray, fontFamily: MONO }}>
                        {e.name}<b style={{ color: "rgba(255,255,255,0.7)" }}> {mine ? `${mine.rank}名/${mine.points}分` : "—"}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Panel>
      )}

      {/*  Q7f：賽季完成後只在既有 canRoll.ok 允許時顯示 Recap（判斷在元件內）。
           ⚠ 第二輪起 CTA **不在 Recap 內**——它移到本頁最後（見檔尾），
              讓「開始下一賽季」成為整頁真正最後一個主要操作。
              rollover 規則與 handler 不變，DOM 仍只有一顆 CTA。 */}
      {/*  ⚠ 只給 moba：`SeasonRecap` 內部自己從 `competitionView()`（moba 預設）
           讀生涯名次與獎金收據。CS 的賽季成績單是既有的 `CsSeasonRecapScreen`，
           入口仍在 CS 賽前頁，本輪不搬。 */}
      {isMoba && final && <SeasonRecap />}

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
              {/*  ⚠ 舊存檔可能留著沒有 rows 的賽季封存物件（多 Event 的 SeasonSeal）。
                   那時候寫「—」，不寫「第 undefined 名」。 */}
              <span style={{ fontWeight: 800, color: h.playerRank != null && h.playerRank <= 4 ? GC.gold : GC.gray, fontFamily: MONO }}>
                {h.playerRank != null ? `我 第 ${h.playerRank} 名` : "我 —"}
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
      {/*  ⚠ Q7f 第二輪：賽季已封存且沒有任何待打場次時，這個面板只會顯示
           「本季你的比賽都打完了。」——那是賽季**進行中**才有意義的提示，
           在成績單旁邊出現只會稀釋「這一季結束了」。⇒ 該狀態下整塊隱藏。
           仍有待打場次時照常顯示（封存後理論上不該有，但不替 Store 假設）。 */}
      {!(final && canRoll?.ok && rows.length === 0) && (
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
          const isLive = live?.fixtureId === focus.id;
          return (
          <div key={focus.id} style={idx > 0 ? { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${GC.line}` } : undefined}>
            {/*  UI-4A：對戰卡改用與 CS 共用的 `FixtureRow`（versus 版面）。
                 對手是誰、主場還客場由它從 `sideA/sideB` 與 `myId` 讀出來；
                 出賽／棄權那組按鈕仍留在本檔——那是 MOBA 這一頁的動作，不是共用呈現。 */}
            <FixtureRow
              layout="versus"
              fixture={focus}
              myTeamId={myId}
              nameOf={nameOf}
              accent={GC.purp}
              testIdPrefix="moba-competition-fixture"
            />
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
      )}

      {/* ── 積分榜 ─────────────────────────────────────────────────── */}
      <Panel title={final ? "最終積分榜 STANDINGS" : "積分榜 STANDINGS"} right={<span style={{ fontSize: 9, color: GC.gray }}>{standings.rule.label}</span>}>
        {/*  UI-4A：改用與 CS 共用的 `StandingsTable`。名次／勝敗／積分／淨勝分
             全部是 `competitionView("moba").standings.rows` 原樣傳進去的，
             **這裡與元件裡都不重算**。MOBA 的特色（表頭、淨勝分欄、隊伍 tag、
             金色高亮、來源分佈註腳）由 props 表達，不是把 CS 的樣子套過來。
             ⚠ 季後賽晉級線目前**刻意不畫**：季後賽名額是由 `playoff.qualified`
               在常規賽結束後才產生的事實，不是積分榜上的即時規則。要畫的話得先
               有一個「現在前幾名進得去」的 canonical 來源，那不在本輪範圍。 */}
        <StandingsTable
          rows={standings.rows}
          myTeamId={myId}
          accent={GC.purp}
          showHeader
          showScoreDiff
          tagOf={tagOf}
          testIdPrefix="moba-competition-standing"
          footer={(() => {
            //  誠實標示：有多少場不是玩家實打的
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
        />
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

      {/*  ── 開始下一賽季（Q7f 第二輪）─────────────────────────────────
           ⚠ **整頁最後一個主要操作**。玩家要按到它，必須先捲過成績單與本季
              全部補充資訊（季後賽對戰表／最終積分榜／賽季進度）——這才是
              「Season Report 的句點」，不是只在 Recap 元件內部排最後。
           ⚠ 條件與 `SeasonRecap` 內部完全一致（`final` ＋ `canRoll.ok`），
              DOM 裡只會有這一顆 rollover CTA。
           ⚠ Q5 規則不變：能不能換季由 Store 的 `canRoll` 判定，畫面不自己判；
              `rollSeason` 仍是同一個 handler，不自動 rollover。 */}
      {final && canRoll?.ok && (
        <RecapNextSeason canRoll={canRoll} onClick={rollSeason} />
      )}
    </CompetitionFrame>
  );
}
