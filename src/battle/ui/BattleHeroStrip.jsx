// ============================================================================
//  battle/ui/BattleHeroStrip.jsx — Legacy TenManPanel 版型恢復（Sprint18【D】）
//  Presentation：逐字對齊 Legacy LiveModule MatchupRow（line 8479–8560）——
//    五路對位行：路名(8px灰20px) ｜ 藍側[StatBars垂直HP/MP + HeroAvatar28(Lv badge)
//    + SpellSquare×2直排 + ID 8.5px + KDA 8px Courier + CS金9px] ｜ 中央金幣差
//    (箭頭+數字+「金幣差」) ｜ 紅側鏡像。
//  資料（不造假）：
//    · 真資料：hp/lv/k/d/a/gold/dead/respawn（引擎 snapshot）；金幣差 = 對位
//      兩選手 gold 直接相減（衍生非統計）。
//    · 待接（保留位置）：MP（引擎無 mana）、CS（引擎無補兵數）、召喚師技能
//      （SpellSquare 顯示佔位，無 CD 資料）。
//  互動：點英雄開 HeroDetailPanel（Legacy 無此互動，為既有產品升級保留）。
//  契約：唯一資料源 useGameStore.snapshot；不重新統計。
// ============================================================================
import React, { useState, useRef } from "react";
import { useGameStore } from "../../useGameStore.js";
import { ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import HeroDetailPanel from "./HeroDetailPanel.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { computeFocus } from "../battleFocus.js";
import { useIsMobile, isMobileViewport } from "../../ui/useViewport.js";

const BLUE = "#60a5fa", RED = "#fb923c", GOLD = "#fbbf24";
const MONO = "'Courier New',monospace";
const LANES = ["上路", "打野", "中路", "下路", "輔助"];

// Legacy HeroAvatar：英雄圖（Sprint20 接回 HERO_IMG）+ 右下 Lv 圓 badge 14px
//   陣亡 → grayscale + 半透明（沿用 Sprint18 表現）；缺圖 → 程序化色塊縮寫。
function HeroAvatar({ hero, level, dead, respawn }) {
  const h = hero || {};
  let hh = 0; for (let i = 0; i < (h.id || "?").length; i++) hh = (hh * 31 + (h.id || "?").charCodeAt(i)) & 0xffffff;
  const hue = hh % 360;
  const deadFx = { opacity: dead ? 0.45 : 1, filter: dead ? "grayscale(1)" : "none" };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <HeroPortrait heroId={h.id} size={28} radius={6} border="1.5px solid rgba(255,255,255,0.12)" alt={h.zh || ""} style={deadFx}
        fallback={<div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, hsl(${hue},45%,32%), #0a0a10)`, border: "1.5px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.9)", ...deadFx }}>{(h.zh || "?").slice(0, 1)}</div>} />
      <div style={{ position: "absolute", bottom: -3, right: -3, minWidth: 14, height: 14, borderRadius: 99, padding: "0 3px", background: "#1a1820", border: "1.5px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: dead ? "#f87171" : "white", lineHeight: 1, fontFamily: MONO }}>{dead ? `${Math.max(0, respawn).toFixed(0)}` : level}</div>
    </div>
  );
}

// Legacy StatBars：垂直 HP(綠漸層) + MP(靛漸層，待接=空) 寬3px
function StatBars({ hp }) {
  const hpPct = Math.max(0, Math.min(100, hp * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, width: 3 }}>
      <div style={{ flex: 1, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", minHeight: 20, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ height: `${hpPct}%`, width: "100%", borderRadius: 99, background: "linear-gradient(180deg,#4ade80,#16a34a)", boxShadow: "0 0 4px rgba(74,222,128,0.5)" }} />
      </div>
      <div title="MP：引擎目前無 mana 資料，保留位置（待接）" style={{ flex: 1, borderRadius: 99, background: "rgba(129,140,248,0.12)", minHeight: 12 }} />
    </div>
  );
}

// Legacy SpellSquare：14px 方格。S29B1 接上引擎真實資料（snapshot.players[].sp）：
//   F = Flash（⚡；全員）、D = Smite（🎯；只有打野）或 reserved（其他位置尚無
//   可靠引擎作用點 ⇒ 顯示明確的保留狀態，不虛構技能）。
//   冷卻中 ⇒ 顯示剩餘秒數 + 暗化；可用 ⇒ 亮色。無 sp 資料（舊 replay/舊規則）⇒ 原佔位。
const SPELL_META = {
  flash: { icon: "⚡", zh: "閃現", color: "#fde047" },
  smite: { icon: "🎯", zh: "懲戒", color: "#4ade80" },
};
function SpellSquare({ label, spell }) {
  if (!spell) {
    return <div title="召喚師技能：目前無資料，保留位置（待接）" style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#52525b" }}>{label}</div>;
  }
  if (!spell.id) {
    return <div title="此位置尚未配置第二召喚師技能（reserved）" style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(0,0,0,0.35)", border: "1px dashed rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#3f3f46" }}>—</div>;
  }
  const meta = SPELL_META[spell.id] ?? { icon: "?", zh: spell.id, color: "#a1a1aa" };
  const onCd = !spell.ready;
  const title = `${meta.zh}${onCd ? `：冷卻中 ${Math.ceil(spell.cd)}s` : "：可使用"}${spell.reason ? `（上次：${spell.reason}）` : ""}`;
  return (
    <div title={title} style={{ position: "relative", width: 14, height: 14, borderRadius: 3, background: onCd ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.08)", border: `1px solid ${onCd ? "rgba(255,255,255,0.1)" : meta.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, lineHeight: 1, filter: onCd ? "grayscale(0.9)" : "none", opacity: onCd ? 0.75 : 1 }}>
      <span>{meta.icon}</span>
      {onCd && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", borderRadius: 2, fontSize: 6.5, fontWeight: 900, color: "#e4e4e7", fontFamily: MONO }}>
          {Math.ceil(spell.cd)}
        </span>
      )}
    </div>
  );
}

function SideCell({ p, hero, roster, side, onOpen }) {
  const idColor = side === "blue" ? BLUE : RED;
  const rev = side === "red";
  return (
    <div onClick={onOpen} style={{ flex: 1, display: "flex", flexDirection: rev ? "row-reverse" : "row", alignItems: "center", gap: 3, minWidth: 0, cursor: "pointer" }}>
      <div style={{ display: "flex", flexDirection: rev ? "row-reverse" : "row", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
        <StatBars hp={p.hp ?? 0} />
        <HeroAvatar hero={hero} level={p.lv ?? 1} dead={p.dead} respawn={p.respawn ?? 0} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
        {/* S29B1：F/D 讀 snapshot.players[].sp（引擎唯一資料源；無資料 ⇒ 舊佔位） */}
        <SpellSquare label="F" spell={p.sp?.[0] ?? null} />
        <SpellSquare label="D" spell={p.sp?.[1] ?? null} />
      </div>
      <div style={{ minWidth: 0, textAlign: rev ? "right" : "left" }}>
        <div style={{ color: idColor, fontSize: 8.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 52 }}>{roster.player || p.id}</div>
        <div style={{ color: "#71717a", fontSize: 8, fontFamily: MONO }}>{p.k}/{p.d}/{p.a ?? 0}</div>
      </div>
      {/* CS：引擎無補兵數，保留位置顯示「—」（Legacy 位置為金色數字）*/}
      <span title="CS：引擎目前無補兵資料，保留位置（待接）" style={{ color: GOLD, fontSize: 9, fontWeight: 800, [rev ? "marginRight" : "marginLeft"]: "auto", flexShrink: 0, opacity: 0.4 }}>—</span>
    </div>
  );
}

export default function BattleHeroStrip({ roster = ROSTER, draft = null }) {
  const snap = useGameStore((s) => s.snapshot);
  const [open, setOpen] = useState(null);
  // S29B2：十人全表改可收合面板——手機預設**收合成焦點對位列**（bottom sheet 展開），
  //   桌機預設展開但可收合；地圖不再被十人面板長期遮住。
  const isMobile = useIsMobile();
  const [expand, setExpand] = useState(() => !isMobileViewport());
  // S29B3：CS 式手勢——把手上滑展開完整 5v5、下滑收合（觸控閾值 24px）
  const touchY = useRef(null);
  const onTouchStart = (e) => { touchY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (touchY.current == null) return;
    const dy = e.touches[0].clientY - touchY.current;
    if (dy < -24 && !expand) { setExpand(true); touchY.current = null; }
    else if (dy > 24 && expand) { setExpand(false); touchY.current = null; }
  };
  const onTouchEnd = () => { touchY.current = null; };
  if (!snap?.players) return null;
  const blue = snap.players.filter((p) => p.side === "blue");
  const red = snap.players.filter((p) => p.side === "red");
  // 焦點對位列 = 距觀戰焦點最近的藍方英雄所在的 lane 列（純呈現層推導，battleFocus 共用）
  let focusIdx = 2;
  {
    const f = computeFocus(snap);
    let bd = Infinity;
    blue.forEach((p, i) => { const dd = (p.pos.x - f.x) ** 2 + (p.pos.y - f.y) ** 2; if (dd < bd) { bd = dd; focusIdx = i; } });
  }

  // Sprint19【C】Draft Adapter：Ban/Pick 實際選角優先（picks[side][i] 為 heroDatabase 完整物件），
  //   無 draft 時回退 ROSTER 預設英雄。對位序 i 與 LANES 一致 → Loading 顯示誰、Strip 就顯示誰。
  const heroOf = (side, i, pid) => {
    const pk = draft?.picks?.[side]?.[i];
    if (pk?.id) return pk;
    return heroById((roster[pid] || {}).heroId) || null;
  };
  // 【F】點擊 → HeroDetailPanel（戰中表現：KDA/Gold/Lv/HeroProgress），英雄身分同樣取自 draft
  const mk = (p, side, i) => {
    const r = roster[p.id] || {};
    const h = heroOf(side, i, p.id);
    return { heroId: h?.id ?? r.heroId, heroName: h?.zh ?? p.id, playerName: r.player ?? p.id.toUpperCase(), side: p.side };
  };

  const laneRow = (i) => {
    const lane = LANES[i], b = blue[i], r = red[i];
    if (!b || !r) return null;
    const rb = roster[b.id] || {}, rr = roster[r.id] || {};
    const hb = heroOf("blue", i, b.id), hr = heroOf("red", i, r.id);
    const diff = Math.round((b.gold ?? 0) - (r.gold ?? 0));
    const favor = diff > 0 ? "blue" : diff < 0 ? "red" : "none";
    const abs = Math.abs(diff);
    return (
      <div key={lane} style={{ display: "flex", alignItems: "center", padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 4 }}>
        <span style={{ color: i === focusIdx ? "#fbbf24" : "#3f3f46", fontSize: 8, fontWeight: 700, width: 20, textAlign: "center", letterSpacing: "0.06em", flexShrink: 0 }}>{lane}</span>
        <SideCell p={b} hero={hb} roster={rb} side="blue" onOpen={() => setOpen(mk(b, "blue", i))} />
        {/* 金幣差 = 對位選手 gold 相減（真資料衍生）*/}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 36 }}>
          {abs > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                {favor === "blue" && <span style={{ color: BLUE, fontSize: 8 }}>◀</span>}
                <span style={{ color: favor === "blue" ? BLUE : RED, fontSize: 8, fontWeight: 800, fontFamily: MONO }}>{abs}</span>
                {favor === "red" && <span style={{ color: RED, fontSize: 8 }}>▶</span>}
              </div>
              <span style={{ color: "#3f3f46", fontSize: 7, letterSpacing: "0.04em" }}>金幣差</span>
            </>
          ) : (
            <span style={{ color: "#3f3f46", fontSize: 8 }}>—</span>
          )}
        </div>
        <SideCell p={r} hero={hr} roster={rr} side="red" onOpen={() => setOpen(mk(r, "red", i))} />
      </div>
    );
  };

  return (
    <>
      {/* 手機展開 = bottom sheet（點背幕收合）；桌機 = 原底部面板 + 可收合 */}
      {isMobile && expand && (
        <div onClick={() => setExpand(false)} style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(0,0,0,0.35)" }} />
      )}
      <div style={{ position: "absolute", bottom: "max(8px, env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 11, width: "min(96%, 560px)", background: "rgba(13,11,18,0.94)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", pointerEvents: "auto", boxShadow: "0 -4px 24px rgba(0,0,0,0.5)" }}>
        {/* 面板把手：點擊或上/下滑手勢（CS 式）展開/收合完整 5v5；
            手機收合 ⇒ 只留焦點對位列，不遮地圖。觸控區加大（padding 8px + 拖曳杆）。 */}
        <div onClick={() => setExpand((v) => !v)}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ cursor: "pointer", touchAction: "none", padding: isMobile ? "8px 12px" : "3px 10px", background: "rgba(255,255,255,0.04)", fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em" }}>
          {isMobile && <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.25)", margin: "0 auto 5px" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>👥 隊伍面板{expand ? "" : `（焦點：${LANES[focusIdx]}）`}</span>
            <span>{expand ? (isMobile ? "▾ 下滑收合" : "▾ 收合") : (isMobile ? "▴ 上滑展開" : "▴ 展開")}</span>
          </div>
        </div>
        <div style={{ maxHeight: expand ? (isMobile ? "46vh" : "none") : "none", overflowY: expand && isMobile ? "auto" : "visible" }}>
          {expand ? LANES.map((_, i) => laneRow(i)) : laneRow(focusIdx)}
        </div>
      </div>
      {open && <HeroDetailPanel {...open} onClose={() => setOpen(null)} />}
    </>
  );
}
