// ============================================================================
//  screens/fps/CsResultScreen.jsx — CS 賽後戰報（Sprint23）
//
//  Legacy 規格：EsportsGame.jsx CSMatchReport（line 7488-7567）版面逐節對位：
//    比分頭欄（地圖·勝負 / 兩隊名 / 大比分 / 戰術行）→ 獎勵三格（聲望/獎金/戰隊經驗）
//    → 本隊 MVP 卡 → 本隊數據表（K/D/A · ADR · 爆頭 · KAST · 評分）→ 回合走勢。
//  Architecture：
//    · 只讀 CsMatchResult.v1（不碰 MOBA BattleResult；無 Hero/Dragon/Baron/Tower/QWER）。
//    · Sprint25：本畫面**不再結算**。S23 時是「掛載時 useEffect 發獎」，
//      玩家若沒進 Result 就永久漏獎；現在結算已移到比賽完成邊界
//      （AppShell → settleCsMatch）。本畫面只讀 receipt 顯示，UI 不重算獎勵。
//    · 「再戰一場」屬 rematch 領域（需重置 seed/流程）→ 本 Sprint 不做，只回 Dashboard。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { makeTransactionId } from "../../platform/contracts/matchProgressTransaction.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import RewardReceiptPanel from "../../ui/RewardReceiptPanel.jsx";

const K = { t: "#fb923c", tL: "#fed7aa", ct: "#38bdf8", ctL: "#a7e0ff" };
const ratingCol = (r) => (r >= 1.2 ? GC.gold : r >= 1.0 ? GC.green : r >= 0.85 ? K.tL : GC.gray);

export default function CsResultScreen({ result, onDone }) {
  // S25：本畫面**不結算**（結算已在 AppShell 的比賽完成邊界做掉），只讀 receipt。
  //   → 沒有 useEffect 發獎、沒有重算獎勵；重整 / 返回再進來都不會重複發放。
  const txId = result?.matchId ? makeTransactionId("cs", result.matchId) : null;
  const receipt = useProfileStore((s) => (txId ? (s.processedMatchTransactions ?? {})[txId] : null));
  const recorded = useProfileStore((s) => (s.csHistory ?? []).find((h) => h.matchId === result?.matchId));
  const r = recorded ?? result;

  if (!r || r.mode !== "cs") {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: GC.gray, fontFamily: FONT }}>
        <div style={{ fontSize: 13 }}>尚無賽後資料</div>
        <button onClick={onDone} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: K.t, color: "#1a1205", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>返回 Dashboard</button>
      </div>
    );
  }

  const win = r.winner === "us";
  const sorted = [...(r.players ?? [])].sort((a, b) => b.rating - a.rating || b.kills - a.kills);
  const mvp = r.mvp;
  const rounds = r.summaryEvents ?? [];


  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 12px 28px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* 比分頭欄（Legacy） */}
        <div style={{ background: `linear-gradient(135deg,${GC.card2},${GC.card})`, borderRadius: 14, padding: "16px", border: `1px solid ${win ? K.t + "55" : GC.line}` }}>
          <div style={{ textAlign: "center", color: "#5a606e", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>{r.mapName ?? r.mapId} · {win ? "勝利" : "落敗"} · CS 訓練賽</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ color: K.tL, fontSize: 13, fontWeight: 800 }}>{r.teamName ?? "德國海豹"}</div>
              {win && <div style={{ color: GC.gold, fontSize: 9, fontWeight: 700, marginTop: 3 }}>🏆 勝</div>}
            </div>
            <div style={{ textAlign: "center", padding: "0 14px", fontFamily: MONO }}>
              <span style={{ fontSize: 34, fontWeight: 900, color: win ? K.t : "white" }}>{r.ourScore}</span>
              <span style={{ color: "#5a606e", fontSize: 26 }}> : </span>
              <span style={{ fontSize: 34, fontWeight: 900, color: !win ? K.ct : "white" }}>{r.enemyScore}</span>
            </div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ color: K.ctL, fontSize: 13, fontWeight: 800 }}>{r.oppName ?? "Compulsary"}</div>
              {!win && <div style={{ color: GC.gold, fontSize: 9, fontWeight: 700, marginTop: 3 }}>🏆 勝</div>}
            </div>
          </div>
          <div style={{ textAlign: "center", color: GC.gray, fontSize: 9, marginTop: 10 }}>
            部署：<span style={{ color: K.tL }}>{r.tacticName ?? "—"}</span>
            {r.engineTactic?.ours && <>　執行：<span style={{ color: K.tL }}>{r.engineTactic.ours}</span></>}
            {r.engineTactic?.theirs && <>　對手：<span style={{ color: K.ctL }}>{r.engineTactic.theirs}</span></>}
          </div>
        </div>

        {/* S25：賽後結算收據（= applyMatchProgress 實際入帳值，MOBA/CS 共用元件，UI 不重算） */}
        <RewardReceiptPanel receipt={receipt} accent={K.t} />
        <div style={{ textAlign: "center", color: "#5a606e", fontSize: 8 }}>
          {recorded ? "✅ 已寫入 CS 對戰紀錄（csHistory）· 已發收件匣通知" : "⏳ 寫入中…"}
        </div>

        {/* 本隊 MVP（Legacy） */}
        {mvp && (
          <div style={{ background: `linear-gradient(135deg,${GC.gold}22,${GC.card})`, borderRadius: 12, padding: "11px 14px", border: `1px solid ${GC.gold}44`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 24 }}>⭐</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: GC.gold, fontSize: 9, fontWeight: 800 }}>本隊 MVP</div>
              <div style={{ color: "white", fontSize: 14, fontWeight: 800 }}>{mvp.playerName} <span style={{ color: GC.gray, fontSize: 10, fontWeight: 600 }}>{mvp.role}</span></div>
            </div>
            <div style={{ textAlign: "right", fontFamily: MONO }}>
              <div style={{ color: ratingCol(mvp.rating), fontSize: 16, fontWeight: 900 }}>{Number(mvp.rating).toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* 本隊數據表（Legacy：K/D/A · ADR · 爆頭 · KAST · 評分） */}
        <div style={{ background: GC.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${GC.line}` }}>
          <div style={{ color: K.tL, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>本隊數據</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 0.6fr 0.6fr 0.6fr 0.7fr", gap: 4, color: "#5a606e", fontSize: 8, fontWeight: 700, paddingBottom: 5, borderBottom: `1px solid ${GC.line}` }}>
            <span>選手</span><span style={{ textAlign: "center" }}>K/D/A</span><span style={{ textAlign: "center" }}>ADR</span><span style={{ textAlign: "center" }}>爆頭</span><span style={{ textAlign: "center" }}>KAST</span><span style={{ textAlign: "right" }}>評分</span>
          </div>
          {sorted.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.9fr 0.6fr 0.6fr 0.6fr 0.7fr", gap: 4, alignItems: "center", padding: "6px 0", borderBottom: i < sorted.length - 1 ? `1px solid ${GC.line}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>{p.playerName}</span>
                {mvp && p.playerName === mvp.playerName && <span style={{ color: GC.gold, fontSize: 9 }}> ⭐</span>}
                <div style={{ color: "#5a606e", fontSize: 8 }}>{p.role}</div>
              </div>
              <span style={{ textAlign: "center", color: "white", fontSize: 10, fontFamily: MONO }}>{p.kills}/{p.deaths}/{p.assists}</span>
              <span style={{ textAlign: "center", color: GC.gray, fontSize: 10, fontFamily: MONO }}>{p.adr ?? "—"}</span>
              <span style={{ textAlign: "center", color: GC.gray, fontSize: 10, fontFamily: MONO }}>{p.hsPct != null ? `${p.hsPct}%` : "—"}</span>
              <span style={{ textAlign: "center", color: GC.gray, fontSize: 10, fontFamily: MONO }}>{p.kast != null ? `${p.kast}%` : "—"}</span>
              <span style={{ textAlign: "right", color: ratingCol(p.rating), fontSize: 11, fontWeight: 800, fontFamily: MONO }}>{Number(p.rating).toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* 回合走勢（Legacy） */}
        {rounds.length > 0 && (
          <div style={{ background: GC.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${GC.line}` }}>
            <div style={{ color: K.tL, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>回合走勢（{rounds.length} 回合）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {rounds.map((rd) => (
                <div key={rd.round} title={`R${rd.round} ${rd.winner === "us" ? (r.teamName || "我方") : (r.oppName || "對手")}${rd.how ? `（${rd.how}）` : ""}`} style={{ width: 16, height: 16, borderRadius: 4, background: rd.winner === "us" ? K.t : K.ct, display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0d14", fontSize: 7, fontWeight: 800, fontFamily: MONO }}>{rd.round}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 8, color: GC.gray }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: K.t, marginRight: 4 }} />{r.teamName || "我方"} 勝回合</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: K.ct, marginRight: 4 }} />{r.oppName || "對手"} 勝回合</span>
            </div>
          </div>
        )}

        <button onClick={onDone} style={{ width: "100%", marginTop: 4, padding: "12px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${K.t},#f97316)`, color: "#1a1205", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>返回 Dashboard</button>
      </div>
    </div>
  );
}
