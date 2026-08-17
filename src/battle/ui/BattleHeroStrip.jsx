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
//  互動：點英雄開 BattleHeroSheet（Milestone G：技能＋目前戰鬥資訊為主；
//    生涯／熟練移到該面板底部的入口）。
//  契約：唯一資料源 useGameStore.snapshot；不重新統計。
// ============================================================================
import React, { useState, useRef } from "react";
import { useGameStore } from "../../useGameStore.js";
import { ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import BattleHeroSheet from "./BattleHeroSheet.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { computeFocus } from "../battleFocus.js";
import { SUMMONER_SPELLS } from "../moba/mobaHeroLoadout.js";
import { useIsMobile, isMobileViewport } from "../../ui/useViewport.js";
import { PANEL_MAX_W, Z } from "./battleLayout.js";

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

/**
 * Milestone G：可讀的**水平血條**。
 *
 * 舊版沿用 Legacy 的 `StatBars`：3px 寬的垂直細條 —— 資料是對的，但在 390px
 * 手機上根本看不出來是血條（Ray 的回報就是「沒有英雄的血條」）。
 * 這裡改成有寬度、有顏色分級、有數字的橫條，並在陣亡時直接顯示復活倒數。
 * 資料仍只讀 `snapshot.players[].hp`（0–1），不新增任何統計。
 */
function HpBar({ hp, dead, respawn, wide }) {
  const pct = Math.max(0, Math.min(100, (hp ?? 0) * 100));
  const color = dead ? "#52525b"
    : pct > 55 ? "linear-gradient(90deg,#4ade80,#16a34a)"
      : pct > 25 ? "linear-gradient(90deg,#fbbf24,#d97706)"
        : "linear-gradient(90deg,#f87171,#dc2626)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, width: "100%" }}>
      <div title={dead ? `陣亡，復活倒數 ${Math.max(0, respawn ?? 0).toFixed(0)}s` : `HP ${pct.toFixed(0)}%`}
        style={{
          position: "relative", flex: 1, minWidth: wide ? 56 : 40, height: 5,
          borderRadius: 99, background: "rgba(255,255,255,0.10)", overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.45)",
        }}>
        <div style={{ width: `${dead ? 0 : pct}%`, height: "100%", background: color, transition: "width .18s linear" }} />
      </div>
      <span style={{ font: `800 8px ${MONO}`, color: dead ? "#f87171" : pct > 25 ? "#d4d4d8" : "#fca5a5", flexShrink: 0, minWidth: 20, textAlign: "right" }}>
        {dead ? `${Math.max(0, respawn ?? 0).toFixed(0)}s` : `${pct.toFixed(0)}%`}
      </span>
    </div>
  );
}

/**
 * Milestone G：戰鬥狀態與重要秒數。
 * 全部來自 snapshot 既有欄位：`dead`/`respawn`（陣亡與復活倒數）、
 * `rc`（回城引導剩餘秒）、`state`（引擎的行為狀態）、`statusEffects`（減速）。
 * 沒有資料就不顯示，不編造。
 */
const STATE_CHIP = {
  "團戰!": { t: "團戰", c: "#fca5a5" }, "接戰": { t: "接戰", c: "#fca5a5" },
  "撤退": { t: "撤退", c: "#fbbf24" }, "脫戰": { t: "脫戰", c: "#fbbf24" },
  "追擊": { t: "追擊", c: "#f9a8d4" }, "拉扯": { t: "拉扯", c: "#a5b4fc" },
  "回防": { t: "回防", c: "#93c5fd" }, "避塔": { t: "避塔", c: "#93c5fd" },
  "圍攻": { t: "推塔", c: "#86efac" }, "攻門牙塔": { t: "推塔", c: "#86efac" },
  "圍攻主堡": { t: "推主堡", c: "#86efac" }, "支援": { t: "支援", c: "#a5b4fc" },
  "打野": { t: "打野", c: "#a3e635" }, "抓人": { t: "抓人", c: "#f9a8d4" },
  "入侵": { t: "入侵", c: "#f9a8d4" },
};
function StatusChips({ p, align }) {
  const chips = [];
  if (p.dead) chips.push({ key: "dead", t: `☠ ${Math.max(0, p.respawn ?? 0).toFixed(0)}s`, c: "#f87171" });
  else {
    if (p.rc > 0) chips.push({ key: "rc", t: `回城 ${Math.ceil(p.rc)}s`, c: "#67e8f9" });
    const s = STATE_CHIP[p.state];
    if (s && !(p.rc > 0)) chips.push({ key: "state", t: s.t, c: s.c });
    for (const e of p.statusEffects ?? []) {
      if (e.id === "slow") chips.push({ key: "slow", t: `緩 ${Math.ceil(e.remaining)}s`, c: "#fda4af" });
    }
  }
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", justifyContent: align, gap: 2, marginTop: 1, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <span key={c.key} style={{
          font: "800 6.5px ui-monospace,monospace", color: c.c, border: "1px solid currentColor",
          borderRadius: 2, padding: "0 2px", background: "rgba(0,0,0,.45)", whiteSpace: "nowrap",
        }}>{c.t}</span>
      ))}
    </div>
  );
}

// Legacy SpellSquare：14px 方格。S29B1 接上引擎真實資料（snapshot.players[].sp）：
//   F = Flash（⚡；全員）、D = Smite（🎯；只有打野）或 reserved（其他位置尚無
//   可靠引擎作用點 ⇒ 顯示明確的保留狀態，不虛構技能）。
//   冷卻中 ⇒ 顯示剩餘秒數 + 暗化；可用 ⇒ 亮色。無 sp 資料（舊 replay/舊規則）⇒ 原佔位。
//  Milestone J：技能名稱／圖示改讀技能表（唯一來源）。舊碼只認得閃現與懲戒，
//  第二格接上八個技能之後，其餘六個會全部畫成「?」。
const SPELL_COLOR = {
  flash: "#fde047", smite: "#4ade80", teleport: "#38bdf8", heal: "#4ade80",
  barrier: "#93c5fd", ignite: "#fb923c", ghost: "#c4b5fd", cleanse: "#67e8f9",
};
const SPELL_META = Object.fromEntries(Object.entries(SUMMONER_SPELLS).map(([id, s]) => [
  id, { icon: s.icon, zh: s.zh, color: SPELL_COLOR[id] ?? "#a1a1aa" },
]));
function SpellSquare({ label, spell }) {
  if (!spell) {
    return <div data-testid="spell-square" data-spell="" style={{ width: 16, height: 16,  borderRadius: 3, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#52525b" }}>{label}</div>;
  }
  if (!spell.id) {
    return <div data-testid="spell-square" data-spell="" title="此位置尚未配置第二召喚師技能（reserved）" style={{ width: 16, height: 16,  borderRadius: 3, background: "rgba(0,0,0,0.35)", border: "1px dashed rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#3f3f46" }}>—</div>;
  }
  const meta = SPELL_META[spell.id] ?? { icon: "?", zh: spell.id, color: "#a1a1aa" };
  const onCd = !spell.ready;
  const title = `${meta.zh}${onCd ? `：冷卻中 ${Math.ceil(spell.cd)}s` : "：可使用"}${spell.uses ? `（本場已用 ${spell.uses} 次）` : ""}${spell.reason ? `（上次：${spell.reason}）` : ""}`;
  //  J-close：16px（原 14px）。並排之後只多佔 4px，但圖示與冷卻數字在 390px
  //  寬的手機上才真的讀得出來——這一格的重點是「一眼看到帶什麼、好了沒」。
  return (
    <div data-testid="spell-square" data-spell={spell.id} data-ready={onCd ? "0" : "1"}
      title={title} style={{ position: "relative", width: 16, height: 16, borderRadius: 3, background: onCd ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.08)", border: `1px solid ${onCd ? "rgba(255,255,255,0.1)" : meta.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, lineHeight: 1, filter: onCd ? "grayscale(0.9)" : "none", opacity: onCd ? 0.75 : 1 }}>
      <span>{meta.icon}</span>
      {onCd && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", borderRadius: 2, fontSize: 7, fontWeight: 900, color: "#e4e4e7", fontFamily: MONO }}>
          {Math.ceil(spell.cd)}
        </span>
      )}
    </div>
  );
}

function SideCell({ p, hero, roster, side, onOpen }) {
  const idColor = side === "blue" ? BLUE : RED;
  const rev = side === "red";
  //  data-seat：手機版十人面板收合時只渲染目前這一路，驗收腳本不能靠索引猜席位
  return (
    <div onClick={onOpen} data-testid="hero-cell" data-side={side} data-seat={p.id} style={{ flex: 1, display: "flex", flexDirection: rev ? "row-reverse" : "row", alignItems: "center", gap: 3, minWidth: 0, cursor: "pointer" }}>
      <div style={{ display: "flex", flexDirection: rev ? "row-reverse" : "row", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
        {/* Milestone D：隊伍面板與世界／Replay 都讀本場 mlv；lv 是跨場熟練度。 */}
        <HeroAvatar hero={hero} level={p.mlv ?? p.lv ?? 1} dead={p.dead} respawn={p.respawn ?? 0} />
      </div>
      {/*  J-close：兩個召喚師技能改成**並排**。
          舊版是 14px 方格上下疊在頭像旁邊的窄欄裡，第二格在手機上幾乎讀不出來
          （Ray 回報「只看得到第一個」）。並排之後兩顆一樣大、一樣亮，
          而且這一欄是 flexShrink:0 的獨立區塊 ⇒ 不會去擠名字、血條或狀態標籤。 */}
      <div data-testid="cell-spells"
        data-spells={(p.sp ?? []).map((s) => s?.id ?? "").join(",")}
        style={{ display: "flex", flexDirection: rev ? "row-reverse" : "row", gap: 2, flexShrink: 0 }}>
        {/* S29B1：F/D 讀 snapshot.players[].sp（引擎唯一資料源；無資料 ⇒ 舊佔位） */}
        <SpellSquare label="F" spell={p.sp?.[0] ?? null} />
        <SpellSquare label="D" spell={p.sp?.[1] ?? null} />
      </div>
      <div style={{ minWidth: 0, flex: 1, textAlign: rev ? "right" : "left" }}>
        <div style={{ color: idColor, fontSize: 8.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roster.player || p.id}</div>
        {/* Milestone G：可讀的水平血條（舊版是 3px 直條，手機上看不出來） */}
        <div style={{ display: "flex", flexDirection: rev ? "row-reverse" : "row" }}>
          <HpBar hp={p.hp} dead={p.dead} respawn={p.respawn} />
        </div>
        <div style={{ color: "#71717a", fontSize: 8, fontFamily: MONO }}>{p.k}/{p.d}/{p.a ?? 0}</div>
        <StatusChips p={p} align={rev ? "flex-end" : "flex-start"} />
        {!!p.buffs?.length && (
          <div style={{ display: "flex", justifyContent: rev ? "flex-end" : "flex-start", gap: 2, marginTop: 1 }}>
            {p.buffs.map((buff) => {
              const permanent = buff.id === "dragon";
              const value = permanent ? `×${buff.stacks ?? 0}` : `${Math.ceil(buff.remaining ?? 0)}`;
              const label = buff.id === "red" ? "紅"
                : buff.id === "blue" ? "藍"
                  : buff.id === "dragon" ? "龍" : "巴";
              const title = buff.id === "red" ? `紅 Buff：${Math.ceil(buff.remaining ?? 0)}s`
                : buff.id === "blue" ? `藍 Buff：${Math.ceil(buff.remaining ?? 0)}s`
                  : permanent
                    ? `Dragon 團隊成長：${buff.stacks ?? 0} 層（本場永久、死亡保留）`
                    : `Baron 限時攻城 Buff：${Math.ceil(buff.remaining ?? 0)}s`;
              return (
              <span key={buff.id} title={title} style={{
                font: "800 6px ui-monospace,monospace", borderRadius: 2, padding: "0 2px",
                color: buff.id === "red" ? "#ff735e"
                  : buff.id === "blue" ? "#68b5ff"
                    : buff.id === "dragon" ? "#caa2ff" : "#f4c16f",
                border: "1px solid currentColor", background: "rgba(0,0,0,.45)",
              }}>{label}{value}</span>
            );})}
          </div>
        )}
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
  //  Milestone I-close：**名單優先**。舊碼先看 `draft.picks[side][i]`（選取順序對位），
  //    但 Milestone I 起 Ban/Pick 會另外算出席位分配，兩者不一定同序 ⇒ 十人面板會
  //    顯示成別人的英雄。roster 已經是 draftRoster/buildBattleRoster 解析過的結果，
  //    以它為準；沒有 roster 資料（單獨掛載）才退回 picks。
  const heroOf = (side, i, pid) => {
    const fromRoster = heroById((roster[pid] || {}).heroId);
    if (fromRoster) return fromRoster;
    const pk = draft?.picks?.[side]?.[i];
    return pk?.id ? pk : null;
  };
  // 保留與既有 HeroDetail verifier 相容的 identity mapping；其餘 battle-only 欄位仍在 mk 補上。
  const heroDetailIdentity = (p, r, h) => {
    return { heroId: h?.id ?? r.heroId, heroName: h?.zh ?? p.id, playerName: r.player ?? p.id.toUpperCase(), side: p.side };
  };
  // 【F】點擊 → HeroDetailPanel（戰中表現：KDA/Gold/Lv/HeroProgress），英雄身分同樣取自 draft
  const mk = (p, side, i) => {
    const r = roster[p.id] || {};
    const h = heroOf(side, i, p.id);
    // Milestone E【E2】：帶上引擎席位 id，讓 HeroDetailPanel 能顯示本場的
    //   playerStatsExec（天賦真的改變了什麼行為）。純呈現參數，不影響統計。
    //  Milestone I-close：把**賽前配置的**召喚師技能一起交給面板。引擎只實作
    //    閃現與懲戒，其餘技能沒有 CD 可讀 ⇒ 面板要能分辨「引擎技能」與「配置技能」，
    //    才不會顯示假冷卻，也不會再出現非打野的第二格「未配置」。
    return {
      ...heroDetailIdentity(p, r, h), playerId: p.id,
      spells: r.spells ?? [], lane: r.lane ?? null,
    };
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
      {/* 背幕只在 bottom sheet 展開時存在（＝使用者正在操作面板）⇒ 平時不吃地圖手勢 */}
      {isMobile && expand && (
        <div onClick={() => setExpand(false)} style={{ position: "absolute", inset: 0, zIndex: Z.controls, background: "rgba(0,0,0,0.35)" }} />
      )}
      <div style={{ position: "absolute", bottom: "max(8px, env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: Z.strip, width: `min(96%, ${PANEL_MAX_W}px)`, background: "rgba(13,11,18,0.94)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", pointerEvents: "auto", boxShadow: "0 -4px 24px rgba(0,0,0,0.5)" }}>
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
      {open && <BattleHeroSheet {...open} onClose={() => setOpen(null)} />}
    </>
  );
}
