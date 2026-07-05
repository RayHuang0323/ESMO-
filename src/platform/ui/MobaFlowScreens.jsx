// ============================================================================
//  MobaFlowScreens.jsx — Sprint 01：MOBA 完整流程的三個平台級畫面
//
//  1. MobaLoadingScreen   — tactic → battle 的過場「對戰卡」（自動前進）
//  2. MobaMatchReport     — 平台級 MOBA 戰報（沿用 BattleResult / matchHistory[0]）
//  3. PlatformUpdateScreen— 賽後平台更新（戰績 / 財務 / 人氣 / 排名，全為真實回寫值）
//
//  設計原則：
//  - 純呈現元件：所有資料由 props 傳入（BattleConfig / matchHistory[0] / game 快照），
//    不 import EsportsGame、不觸碰 Battle / LogicEngine / Router 內部。
//  - 視覺沿用平台 GC 設計語言（深色卡片、MOBA 紫 #a78bfa），不引入新視覺系統。
//  - 不製造假資料：畫面上每個數字都來自 recordMatch 已回寫的真實狀態或 delta。
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";

const C = {
  bg: "#0a0b0f", card: "#13151c", card2: "#1a1d26", line: "#26293a",
  gray: "#71717a", purp: "#a78bfa", gold: "#fbbf24", green: "#34d399",
  red: "#ef4444", blue: "#3b82f6",
};

const wrap = { minHeight: "calc(100vh - 46px)", background: C.bg, fontFamily: "system-ui,-apple-system,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 14px 40px" };
const cardBase = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 };

/** 英雄小徽章（有圖用圖，無圖退化為色塊＋名） */
function ChampBadge({ champ, heroImg, side }) {
  if (!champ) return <div style={{ width: 40, height: 40, borderRadius: 10, background: C.card2, border: `1px dashed ${C.line}` }} />;
  const img = heroImg && heroImg[champ.id];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 52 }}>
      {img
        ? <img src={img} alt={champ.zh} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", border: `1.5px solid ${side === "red" ? C.red : C.purp}55` }} />
        : <div style={{ width: 40, height: 40, borderRadius: 10, background: (champ.color || C.card2) + "33", border: `1.5px solid ${champ.color || C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: champ.color || "white" }}>{(champ.zh || "?").slice(0, 1)}</div>}
      <span style={{ color: "#d4d4d8", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 52 }}>{champ.zh || champ.id}</span>
    </div>
  );
}

// ============================================================================
//  1) MobaLoadingScreen — 對戰卡過場
//     顯示雙方隊伍與 picks，進度條跑滿自動 onDone()（宿主呼叫 router.next()）。
// ============================================================================
export function MobaLoadingScreen({ battleConfig, heroImg, durationMs = 2400, onDone }) {
  const [pct, setPct] = useState(0);
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone; // 每次渲染更新 ref，但不重啟計時器
  useEffect(() => {
    const t0 = performance.now();
    let raf, fired = false;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / durationMs);
      setPct(p);
      if (p >= 1) { if (!fired) { fired = true; onDoneRef.current && onDoneRef.current(); } return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  const cfg = battleConfig || {};
  const picks = (cfg.draft && cfg.draft.picks) || {};
  const blue = Array.isArray(picks.blue) ? picks.blue.slice(0, 5) : [];
  const red = Array.isArray(picks.red) ? picks.red.slice(0, 5) : [];
  const tactic = cfg.tactic;

  return (
    <div style={wrap}>
      <div style={{ ...cardBase, width: "100%", maxWidth: 460, padding: "22px 16px", textAlign: "center" }}>
        <div style={{ color: C.gray, fontSize: 10, fontWeight: 800, letterSpacing: 3, marginBottom: 14 }}>MATCH LOADING</div>
        {/* VS 對戰卡 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 30 }}>🐺</div>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{cfg.teamName || "德國海豹"}</div>
            <div style={{ color: C.purp, fontSize: 9, fontWeight: 700 }}>BLUE SIDE</div>
          </div>
          <div style={{ color: C.gold, fontSize: 22, fontWeight: 900, padding: "0 10px" }}>VS</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 30 }}>🔥</div>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{cfg.oppName || "對手"}</div>
            <div style={{ color: C.red, fontSize: 9, fontWeight: 700 }}>RED SIDE</div>
          </div>
        </div>
        {/* 雙方 picks */}
        {(blue.length > 0 || red.length > 0) && (
          <div style={{ background: C.card2, borderRadius: 12, padding: "10px 8px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: red.length ? 8 : 0 }}>
              {blue.map((ch, i) => <ChampBadge key={"b" + i} champ={ch} heroImg={heroImg} side="blue" />)}
            </div>
            {red.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                {red.map((ch, i) => <ChampBadge key={"r" + i} champ={ch} heroImg={heroImg} side="red" />)}
              </div>
            )}
          </div>
        )}
        {tactic && <div style={{ color: C.gray, fontSize: 11, marginBottom: 12 }}>戰術指示：<span style={{ color: "white", fontWeight: 700 }}>{String(tactic)}</span></div>}
        {/* 進度條 */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(pct * 100)}%`, background: `linear-gradient(90deg,${C.purp},${C.blue})`, transition: "width 80ms linear" }} />
        </div>
        <div style={{ color: C.gray, fontSize: 10, marginTop: 8 }}>正在進入戰場… {Math.round(pct * 100)}%</div>
      </div>
    </div>
  );
}

// ============================================================================
//  2) MobaMatchReport — 平台級 MOBA 戰報
//     result 來源＝game.matchHistory[0]（recordMatch 已寫入 fanGain/prizeGain/xpGain
//     ＋ BattleResult 原欄位 win/scoreT/scoreCT/durationSec），沿用不重造。
// ============================================================================
export function MobaMatchReport({ result, battleConfig, heroImg, onNext, onRematch, onHome }) {
  const r = result || {};
  const win = !!r.win;
  const cfg = battleConfig || {};
  const picks = (cfg.draft && cfg.draft.picks) || {};
  const blue = Array.isArray(picks.blue) ? picks.blue.slice(0, 5) : [];
  const dur = Number.isFinite(r.durationSec) ? `${Math.floor(r.durationSec / 60)}:${String(Math.floor(r.durationSec % 60)).padStart(2, "0")}` : null;

  return (
    <div style={wrap}>
      <div style={{ ...cardBase, width: "100%", maxWidth: 460, overflow: "hidden" }}>
        {/* 勝敗橫幅 */}
        <div style={{ background: win ? "linear-gradient(135deg,#065f46,#13151c)" : "linear-gradient(135deg,#7f1d1d,#13151c)", padding: "22px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>{win ? "🏆" : "💔"}</div>
          <div style={{ color: win ? C.green : C.red, fontSize: 24, fontWeight: 900, letterSpacing: 2 }}>{win ? "勝利" : "敗北"}</div>
          <div style={{ color: C.gray, fontSize: 11, marginTop: 4 }}>{cfg.teamName || "德國海豹"} vs {cfg.oppName || "對手"}</div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          {/* 擊殺比分 ＋ 時長 */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <span style={{ color: C.purp, fontSize: 30, fontWeight: 900 }}>{r.scoreT ?? "–"}</span>
            <span style={{ color: C.gray, fontSize: 13 }}>擊殺</span>
            <span style={{ color: C.red, fontSize: 30, fontWeight: 900 }}>{r.scoreCT ?? "–"}</span>
          </div>
          {dur && <div style={{ textAlign: "center", color: C.gray, fontSize: 11, marginBottom: 12 }}>比賽時長 {dur}</div>}
          {/* 我方陣容 */}
          {blue.length > 0 && (
            <div style={{ background: C.card2, borderRadius: 12, padding: "10px 8px", marginBottom: 12 }}>
              <div style={{ color: C.gray, fontSize: 10, fontWeight: 800, marginBottom: 6, textAlign: "center" }}>我方出戰陣容</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                {blue.map((ch, i) => <ChampBadge key={i} champ={ch} heroImg={heroImg} side="blue" />)}
              </div>
            </div>
          )}
          {/* 賽後收益（recordMatch 真實值） */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["聲望", r.fanGain != null ? `+${r.fanGain}` : "–", C.purp], ["獎金", r.prizeGain != null ? `+$${r.prizeGain}萬` : "–", C.green], ["經驗", r.xpGain != null ? `+${r.xpGain}` : "–", C.gold]].map(([label, val, color]) => (
              <div key={label} style={{ flex: 1, background: C.card2, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ color, fontSize: 15, fontWeight: 900 }}>{val}</div>
                <div style={{ color: C.gray, fontSize: 9, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          {/* 動作 */}
          <button onClick={onNext} style={{ width: "100%", background: `linear-gradient(90deg,${C.purp},${C.blue})`, border: "none", borderRadius: 10, padding: "12px 0", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>查看平台更新 →</button>
          <div style={{ display: "flex", gap: 8 }}>
            {onRematch && <button onClick={onRematch} style={{ flex: 1, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 0", color: "#d4d4d8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>再戰一場</button>}
            <button onClick={onHome} style={{ flex: 1, background: C.card2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 0", color: C.gray, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>返回首頁</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
//  3) PlatformUpdateScreen — 賽後平台更新
//     全部讀 recordMatch 已回寫的真實狀態：record / fanCount / budget / xp /
//     seasonWins / standings 排名。deltas 來自 matchHistory[0]。
// ============================================================================
export function PlatformUpdateScreen({ record, fanCount, budget, xp, seasonWins, seasonGoal, rank, totalTeams, lastMatch, onDone }) {
  const r = lastMatch || {};
  const rows = useMemo(() => ([
    { icon: "⚔️", label: "戰績", value: `${record?.wins ?? 0} 勝 ${record?.losses ?? 0} 敗`, delta: r.win != null ? (r.win ? "+1 勝" : "+1 敗") : null, deltaColor: r.win ? C.green : C.red, sub: (record?.streak ?? 0) >= 2 ? `🔥 ${record.streak} 連勝` : null },
    { icon: "🏆", label: "聯賽排名", value: rank ? `第 ${rank} 名` : "–", delta: null, sub: totalTeams ? `共 ${totalTeams} 隊` : null },
    { icon: "📣", label: "人氣", value: (fanCount ?? 0).toLocaleString(), delta: r.fanGain != null ? `+${r.fanGain}` : null, deltaColor: C.purp, sub: null },
    { icon: "💰", label: "財務", value: `$${budget ?? 0}萬`, delta: r.prizeGain != null ? `+$${r.prizeGain}萬` : null, deltaColor: C.green, sub: null },
    { icon: "⭐", label: "戰隊經驗", value: xp ? `Lv.${xp.lv}` : "–", delta: r.xpGain != null ? `+${r.xpGain} XP` : null, deltaColor: C.gold, sub: xp ? `${xp.cur}/${xp.max}` : null },
    ...(seasonGoal ? [{ icon: "🎯", label: "賽季目標", value: `${seasonWins ?? 0}/${seasonGoal.wins ?? "?"} 勝`, delta: null, sub: seasonGoal.name || null }] : []),
  ]), [record, fanCount, budget, xp, seasonWins, seasonGoal, rank, totalTeams, r]);

  return (
    <div style={wrap}>
      <div style={{ ...cardBase, width: "100%", maxWidth: 460, padding: "18px 16px" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ color: C.gray, fontSize: 10, fontWeight: 800, letterSpacing: 3 }}>PLATFORM UPDATE</div>
          <div style={{ color: "white", fontSize: 17, fontWeight: 900, marginTop: 4 }}>賽後平台更新</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {rows.map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card2, borderRadius: 10, padding: "10px 12px" }}>
              <span style={{ fontSize: 17 }}>{row.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.gray, fontSize: 10, fontWeight: 700 }}>{row.label}</div>
                <div style={{ color: "white", fontSize: 14, fontWeight: 800 }}>{row.value}{row.sub && <span style={{ color: C.gray, fontSize: 10, fontWeight: 600, marginLeft: 6 }}>{row.sub}</span>}</div>
              </div>
              {row.delta && <span style={{ color: row.deltaColor || C.green, fontSize: 12, fontWeight: 900 }}>{row.delta}</span>}
            </div>
          ))}
        </div>
        <button onClick={onDone} style={{ width: "100%", background: `linear-gradient(90deg,${C.purp},${C.blue})`, border: "none", borderRadius: 10, padding: "12px 0", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>返回首頁</button>
      </div>
    </div>
  );
}
