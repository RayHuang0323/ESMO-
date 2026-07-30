// ============================================================================
//  battle/ui/BattleHeroSheet.jsx — 戰鬥中的英雄面板（Milestone G）
//
//  問題（Ray 回報）：在戰鬥中點英雄開的是 `HeroDetailPanel`，那是**生涯／熟練
//  ／Mastery** 面板 —— 戰鬥中資訊太少、個人資訊太多。
//
//  本檔把優先序倒過來：
//    1) 技能（英雄 P/Q/W/E/R ＋ 召喚師技能的**即時冷卻**）
//    2) 目前戰鬥資訊（血量、狀態與秒數、KDA、經濟、輸出／治療／推塔、Buff）
//    3) 生涯／完整能力 → 收到底部的一顆按鈕，需要才開 `HeroDetailPanel`
//
//  資料來源：`useGameStore.snapshot`（引擎唯一真實來源）＋ `heroDatabase`
//  （技能文字是英雄靜態資料）。**不重新統計、不寫任何 Store。**
//  沒有的資料一律不顯示或標明「無資料」，不編造。
// ============================================================================
import React, { useState } from "react";
import { useGameStore } from "../../useGameStore.js";
import { heroById } from "../../data/heroDatabase.js";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import HeroDetailPanel from "./HeroDetailPanel.jsx";
import { SUMMONER_SPELLS } from "../moba/mobaHeroLoadout.js";
import { GC } from "../../ui/theme.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { Z } from "./battleLayout.js";

const MONO = "ui-monospace,Menlo,monospace";

/**
 * Milestone I-close：技能名稱／圖示改讀 `SUMMONER_SPELLS`（賽前配置的唯一表），
 * 不再是這裡自己維護的兩筆對照——否則面板永遠只認得引擎的閃現與懲戒。
 */
const SPELL_META = SUMMONER_SPELLS;

/**
 * 賽前配置的兩個技能 × 引擎的即時狀態 → 面板要畫的兩格。
 *
 * · 引擎目前只模擬閃現與懲戒。配置到的其他技能**沒有**引擎冷卻可讀，
 *   所以標成「配置」而不是給一個假的 CD（面板寧可少說，不能亂說）。
 * · 沒有配置資料（單獨掛載、舊路徑）⇒ 完全退回引擎的 `sp`，行為與 G 相同。
 */
function mergeSpells(configured, live) {
  const ids = Array.isArray(configured) && configured.length ? configured : null;
  if (!ids) return Array.isArray(live) ? live : [];
  const byId = new Map((live ?? []).filter((s) => s?.id).map((s) => [s.id, s]));
  return ids.map((id) => {
    const engine = byId.get(id);
    if (engine) return { ...engine, configured: true, hasEngine: true };
    return { id, configured: true, hasEngine: false, ready: null, cd: 0 };
  });
}
/** 引擎行為狀態 → 玩家看得懂的說明（沒有對應就原樣顯示，不硬翻）。 */
const STATE_TEXT = {
  "對線": "在線上發育", "團戰!": "團戰中", "接戰": "接戰中", "拉扯": "拉扯走位",
  "撤退": "撤退中", "脫戰": "脫離戰鬥", "追擊": "追擊敵人", "支援": "支援隊友",
  "回防": "回防守塔", "避塔": "避開敵塔", "圍攻": "推進敵塔", "攻門牙塔": "攻門牙塔",
  "圍攻主堡": "圍攻主堡", "打野": "清野區", "抓人": "Gank 中", "入侵": "入侵野區",
  "回城": "回城中", "回城中": "回城引導中", "游走": "游走", "遊走": "游走",
};

const Row = ({ l, v, c = "#e5e7eb", title }) => (
  <div title={title} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, padding: "2.5px 0" }}>
    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span>
    <span style={{ fontFamily: MONO, fontWeight: 800, color: c, textAlign: "right" }}>{v}</span>
  </div>
);
const SectionTitle = ({ children }) => (
  <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "12px 0 4px" }}>{children}</div>
);

export default function BattleHeroSheet({ heroId, heroName, playerName, playerId, side = "blue", spells = [], lane = null, onClose }) {
  const [career, setCareer] = useState(false);
  const isMobile = useIsMobile();
  //  只訂閱這一名英雄的即時狀態（引擎唯一資料源）
  const p = useGameStore((s) => (s.snapshot?.players ?? []).find((x) => x.id === playerId) ?? null);
  const db = heroById(heroId) || {};
  const sideC = side === "blue" ? GC.blueL : GC.redL;

  if (career) {
    return (
      <HeroDetailPanel heroId={heroId} heroName={heroName} playerName={playerName}
        playerId={playerId} side={side} onClose={() => setCareer(false)} />
    );
  }

  //  賽前配置（roster.spells，與 Ban/Pick／Loading／Replay 同源）× 引擎即時冷卻
  const shownSpells = mergeSpells(spells, p?.sp);
  const hpPct = p ? Math.max(0, Math.min(100, (p.hp ?? 0) * 100)) : 0;
  const hpColor = p?.dead ? "#f87171" : hpPct > 55 ? "#86efac" : hpPct > 25 ? "#fbbf24" : "#fca5a5";
  const stateText = p ? (STATE_TEXT[p.state] ?? p.state ?? "—") : "—";

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: Z.sheet, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", background: "rgba(4,8,16,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: isMobile ? "100%" : 340, maxWidth: "100%",
        maxHeight: isMobile ? "100%" : "84%",
        display: "flex", flexDirection: "column",
        background: "rgba(10,16,28,0.97)", border: isMobile ? "none" : `1px solid ${sideC}55`,
        borderRadius: isMobile ? 0 : 14, fontFamily: "system-ui,sans-serif", overflow: "hidden",
      }}>
        {/* 固定頂部列 */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.75)", letterSpacing: "0.1em" }}>戰鬥資訊</span>
          <button onClick={onClose} aria-label="關閉" style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "12px 16px 16px", paddingBottom: isMobile ? "calc(16px + env(safe-area-inset-bottom))" : 16 }}>
          {/* 身分列：英雄圖 + 英雄／選手 + 本場等級 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <HeroPortrait heroId={heroId} size={44} radius={10} border={`2px solid ${sideC}66`} alt={db.zh || heroName || ""} fallback={null} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{db.zh || heroName}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>{playerName}{db.arch ? ` · ${db.arch}` : ""}{db.lane ? ` · ${db.lane}` : ""}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 8, color: "#52525b", letterSpacing: "0.1em" }}>本場等級</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fde047", fontFamily: MONO, lineHeight: 1 }}>{p?.mlv ?? "—"}</div>
            </div>
          </div>

          {/* 血量 + 狀態（戰鬥中最需要的兩件事，放最上面） */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{p?.dead ? "陣亡" : "血量"}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: hpColor }}>
                {p?.dead ? `復活 ${Math.max(0, p.respawn ?? 0).toFixed(0)}s` : `${hpPct.toFixed(0)}%`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden", border: "1px solid rgba(0,0,0,0.45)" }}>
              <div style={{ width: `${p?.dead ? 0 : hpPct}%`, height: "100%", background: hpPct > 55 ? "linear-gradient(90deg,#4ade80,#16a34a)" : hpPct > 25 ? "linear-gradient(90deg,#fbbf24,#d97706)" : "linear-gradient(90deg,#f87171,#dc2626)", transition: "width .18s linear" }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#cbd5e1", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "2px 7px" }}>{stateText}</span>
              {p?.rc > 0 && <span style={{ fontSize: 10, color: "#67e8f9", border: "1px solid #67e8f955", borderRadius: 6, padding: "2px 7px" }}>回城引導 {Math.ceil(p.rc)}s</span>}
              {(p?.statusEffects ?? []).map((e) => (
                <span key={e.id} style={{ fontSize: 10, color: "#fda4af", border: "1px solid #fda4af55", borderRadius: 6, padding: "2px 7px" }}>
                  {e.id === "slow" ? "減速" : e.id} {Math.ceil(e.remaining)}s
                </span>
              ))}
              {(p?.buffs ?? []).map((b) => {
                const label = b.id === "red" ? "紅 Buff" : b.id === "blue" ? "藍 Buff" : b.id === "dragon" ? "巨龍" : "巴龍";
                const val = b.id === "dragon" ? `×${b.stacks ?? 0}` : `${Math.ceil(b.remaining ?? 0)}s`;
                const c = b.id === "red" ? "#ff735e" : b.id === "blue" ? "#68b5ff" : b.id === "dragon" ? "#caa2ff" : "#f4c16f";
                return <span key={b.id} style={{ fontSize: 10, color: c, border: "1px solid currentColor", borderRadius: 6, padding: "2px 7px" }}>{label} {val}</span>;
              })}
            </div>
          </div>

          {/* ── 技能（本面板的主角）───────────────────────────────────── */}
          <SectionTitle>召喚師技能{lane ? ` · ${lane}` : ""}</SectionTitle>
          {shownSpells.length ? (
            <div data-testid="sheet-spells" data-spells={shownSpells.map((s) => s.id ?? "").join(",")}
              style={{ display: "flex", gap: 8 }}>
              {shownSpells.map((s, i) => {
                if (!s?.id) {
                  return (
                    <div key={i} title="此位置尚未配置第二召喚師技能（reserved）"
                      style={{ flex: 1, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)", padding: "6px 8px", color: "#3f3f46", fontSize: 10, textAlign: "center" }}>
                      未配置
                    </div>
                  );
                }
                const meta = SPELL_META[s.id] ?? { icon: "?", zh: s.id };
                //  引擎沒有模擬這個技能 ⇒ 不畫冷卻，標「配置」。給假 CD 比不給更糟。
                const noEngine = s.configured && s.hasEngine === false;
                return (
                  <div key={i} title={noEngine ? `${meta.zh}：賽前配置（本引擎未模擬其效果，故不顯示冷卻）` : `${meta.zh}：${meta.desc ?? ""}`}
                    style={{
                      flex: 1, borderRadius: 8, padding: "6px 8px", textAlign: "center",
                      background: noEngine ? "rgba(255,255,255,0.04)" : s.ready ? "rgba(74,222,128,0.10)" : "rgba(0,0,0,0.4)",
                      border: `1px solid ${noEngine ? "rgba(255,255,255,0.14)" : s.ready ? "rgba(74,222,128,0.45)" : "rgba(255,255,255,0.12)"}`,
                      filter: noEngine || s.ready ? "none" : "grayscale(0.7)",
                      opacity: noEngine ? 0.75 : 1,
                    }}>
                    <div style={{ fontSize: 15 }}>{meta.icon}</div>
                    <div style={{ fontSize: 10, color: "#e5e7eb", fontWeight: 800 }}>{meta.zh}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: noEngine ? "#71717a" : s.ready ? "#86efac" : "#a1a1aa" }}>
                      {noEngine ? "配置" : s.ready ? "可用" : `${Math.ceil(s.cd)}s`}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>本規則集無召喚師技能資料</div>
          )}

          <SectionTitle>英雄技能</SectionTitle>
          {db.P || db.Q ? (
            [["P", db.P], ["Q", db.Q], ["W", db.W], ["E", db.E], ["R", db.R]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, padding: "2px 0" }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: k === "R" ? "rgba(250,204,21,0.25)" : "rgba(255,255,255,0.1)", color: k === "R" ? "#fde047" : "#cbd5e1", fontWeight: 900, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{k}</span>
                <span style={{ color: "#e5e7eb" }}>{v}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>此英雄無技能資料</div>
          )}
          <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            英雄技能為 CHAMPIONS_100 的靜態資料；引擎目前不模擬個別技能冷卻，故不顯示假 CD。
          </div>

          {/* ── 目前戰鬥資訊 ────────────────────────────────────────── */}
          <SectionTitle>本場數據</SectionTitle>
          <Row l="KDA" v={p ? `${p.k}/${p.d}/${p.a ?? 0}` : "—"} />
          <Row l="金錢" v={p ? p.gold.toLocaleString() : "—"} c="#fbbf24" />
          <Row l="英雄傷害" v={p ? p.dmg.toLocaleString() : "—"} c="#fda4af" />
          <Row l="治療量" v={p ? p.heal.toLocaleString() : "—"} c="#86efac" />
          <Row l="推塔傷害" v={p ? p.twrDmg.toLocaleString() : "—"} c="#a5b4fc" />
          {Number.isFinite(p?.mxpNext) && p.mxpNext > 0 && (
            <Row l="本場經驗" v={`${p.mxp} / ${p.mxpNext}`} c="#fde047" />
          )}
          {p?.decision?.action && (
            <Row l="目前意圖" v={p.decision.action} c="#c4b5fd"
              title={`引擎的可解釋決策（Milestone D-fix2）：${(p.decision.reasons ?? []).join(" · ")}`} />
          )}

          {/* 生涯／完整能力：需要才開，不佔戰鬥中的版面 */}
          <button onClick={() => setCareer(true)} style={{
            marginTop: 14, width: "100%", padding: "9px 12px", borderRadius: 10, cursor: "pointer",
            background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.4)",
            color: "#c4b5fd", fontSize: 12, fontWeight: 800,
          }}>
            英雄生涯 · 熟練與完整能力 →
          </button>
        </div>
      </div>
    </div>
  );
}
