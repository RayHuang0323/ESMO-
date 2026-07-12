// ============================================================================
//  screens/fps/CsLoadingScreen.jsx — CS 進場 Loading（Sprint23）
//
//  Legacy FPS 流程沒有獨立 Loading（prep→matching→tactic→battle 直入）；
//  本畫面依 Sprint23 規格新建，版面語彙沿用主幹 MOBA LoadingScreen 的
//  「兩隊對陣 + VS + 進度條」骨架，但內容是 CS 領域：
//    我方 5 人（PlayerFace + FPS 定位 + 關鍵能力）· 對手 Compulsary ·
//    選定地圖 · 選定戰術 · Loading Bar + 進場文案。
//  資料來源：profileStore.players（唯一選手來源）+ 選圖/戰術 config。
//  對手為引擎內建 Compulsary（不複製名單資料 → 誠實顯示「引擎內建陣容」）。
//  無 MOBA Hero 圖、無 heroDatabase（CS/MOBA 分離）。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { FPS_WEIGHTS, statZh } from "../../data/playerModel.js";
import { MOBA2FPS, FPS_ROLE_ZH } from "../../battle/fps/fpsRoster.js";
import PlayerFace from "../../ui/PlayerFace.jsx";
import { GC, FONT, MONO } from "../../ui/theme.js";

const ACC = "#fb923c";
const CT_C = "#38bdf8";
const LINES = ["連線對戰伺服器…", "載入地圖資源…", "同步戰術部署…", "隊伍語音頻道就緒…", "進入凍結時間…"];

/** 該選手 FPS 權重下最突出的能力（真實 stats × Legacy FPS_WEIGHTS，純展示） */
function keyStat(p) {
  let bk = null, bv = -1;
  for (const k in FPS_WEIGHTS) {
    const v = (p?.stats?.[k] ?? 0) * FPS_WEIGHTS[k];
    if (v > bv) { bv = v; bk = k; }
  }
  return bk ? { key: bk, zh: statZh(bk), val: p?.stats?.[bk] ?? 0 } : null;
}

export default function CsLoadingScreen({ config, onDone }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const team = useProfileStore((s) => s.team);
  const starters = players.filter((p) => p.status === "主力").slice(0, 5);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - t0) / 2600) * 100));
      setPct(p);
      if (p >= 100) { clearInterval(iv); setTimeout(() => onDone && onDone(), 250); }
    }, 60);
    return () => clearInterval(iv);
  }, [onDone]);

  const line = LINES[Math.min(LINES.length - 1, Math.floor(pct / (100 / LINES.length)))];

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#070a10", fontFamily: FONT, padding: "14px 12px 24px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        {/* 對戰資訊列：地圖 + 戰術 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
          <span style={{ background: `${ACC}22`, border: `1px solid ${ACC}66`, color: ACC, fontSize: 10, fontWeight: 800, borderRadius: 7, padding: "3px 10px" }}>🗺 {config?.mapName ?? "—"}</span>
          <span style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, color: "#c8cdd6", fontSize: 10, fontWeight: 800, borderRadius: 7, padding: "3px 10px" }}>{config?.tacticEmoji ?? "🎯"} 戰術「{config?.tacticName ?? "未部署"}」</span>
        </div>

        {/* 我方 5 人 */}
        <div style={{ background: GC.card, border: `1px solid ${ACC}44`, borderRadius: 13, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ color: ACC, fontSize: 11, fontWeight: 900, marginBottom: 8 }}>{team?.name ?? "德國海豹"} <span style={{ color: GC.gray, fontWeight: 600, fontSize: 9 }}>（T 方進攻）</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {starters.map((p) => {
              const ks = keyStat(p);
              const fpsRole = FPS_ROLE_ZH[MOBA2FPS[p.role]] || "步槍手";
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <PlayerFace player={p} size={28} />
                  <span style={{ color: "white", fontSize: 11, fontWeight: 700, minWidth: 52 }}>{p.name}</span>
                  <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>{fpsRole}</span>
                  {ks && <span style={{ marginLeft: "auto", color: GC.gray, fontSize: 9 }}>{ks.zh} <b style={{ color: "#e8ebf0", fontFamily: MONO }}>{ks.val}</b></span>}
                </div>
              );
            })}
            {starters.length < 5 && <div style={{ color: GC.gold, fontSize: 9 }}>⚠ 主力不足 5 人，本場將使用引擎內建示範陣容</div>}
          </div>
        </div>

        {/* VS */}
        <div style={{ textAlign: "center", color: "#5a606e", fontSize: 18, fontWeight: 900, letterSpacing: "0.3em", margin: "2px 0 10px" }}>VS</div>

        {/* 對手 */}
        <div style={{ background: GC.card, border: `1px solid ${CT_C}44`, borderRadius: 13, padding: "10px 12px", marginBottom: 16 }}>
          <div style={{ color: CT_C, fontSize: 11, fontWeight: 900, marginBottom: 4 }}>Compulsary <span style={{ color: GC.gray, fontWeight: 600, fontSize: 9 }}>（CT 方防守）</span></div>
          <div style={{ color: GC.gray, fontSize: 9 }}>引擎內建陣容 · 5 人（指揮 orgaNick / 狙擊 Oniheavy / 步槍 purPeEsw / 突破 b3autiFul / 輔助 GolDenous）</div>
        </div>

        {/* Loading Bar */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${ACC},#f97316)`, transition: "width 0.1s linear" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: GC.gray, fontSize: 9 }}>
          <span>{line}</span>
          <span style={{ fontFamily: MONO }}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}
