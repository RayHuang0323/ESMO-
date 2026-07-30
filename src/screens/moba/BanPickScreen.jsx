// ============================================================================
//  screens/moba/BanPickScreen.jsx — Legacy DraftModule 完整恢復（Sprint18【A】）
//  Presentation：逐字對齊 Legacy DraftModule（line 7147–7348）——
//    14 步輪選 SEQ（4 ban → 10 pick 蛇形）、狀態 badge、當前行動條、
//    禁用區（各2格 32px 灰階）、已選英雄（各5格 40px ARCH_COLOR 邊框）、
//    選擇器（定位tab/5列網格/ⓘ鈕）、選角動態 log、✓ 完成 1200ms 後 onComplete。
//  AI：Legacy analyzeChamp + archCounterScore 逐字移植；ban 60%、pick 50% counter。
//  Adapter：英雄唯一來源 heroDatabase；onComplete({picks,bans}) 交 AppShell（不建 Store）；
//    ⓘ 開 HeroCodexDetail。Sprint20：ChampFace 已接回 Legacy HERO_IMG 真實英雄圖
//    （經 heroDatabase.heroImage()），缺圖才退回程序化色塊。
// ============================================================================
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { seatPlayers as seatPlayersOf } from "../../platform/contracts/matchLineup.js";
import { heroTags } from "../../data/heroClassification.js";
import { assignDraft, assignmentToHeroIds } from "../../battle/moba/mobaDraftAssignment.js";
import { buildLoadout, SUMMONER_SPELLS } from "../../battle/moba/mobaHeroLoadout.js";

/** assignment → buildLoadout 需要的 `{seat:{heroId}}` 形狀。 */
const assignmentToRoster = (a = {}) =>
  Object.fromEntries(Object.entries(a).map(([seat, v]) => [seat, { heroId: v.heroId }]));

/**
 * Milestone I：出戰配置面板。
 * 明確顯示「哪位選手、去哪一路、開哪隻英雄、適性多少、有沒有衝突、帶什麼技能」。
 * 全部來自 assignDraft / buildLoadout 的計算結果，不編造。
 */
function DraftPlanPanel({ plan, loadout }) {
  const rows = Object.entries(plan.assignment);
  return (
    <div style={{ background: GC2.card, borderRadius: 12, padding: "10px 12px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ color: GC2.blue, fontSize: 11, fontWeight: 800 }}>出戰配置（自動分配）</span>
        <span style={{ color: plan.conflicts.length ? "#fbbf24" : GC2.green, fontSize: 10, fontWeight: 700 }}>
          {plan.conflicts.length ? `⚠ ${plan.conflicts.length} 項衝突` : "✓ 無衝突"}
        </span>
      </div>
      {rows.map(([seat, a]) => {
        const sp = loadout[seat]?.spells ?? [];
        const fitColor = a.heroFit >= 1 ? GC2.green : a.heroFit >= 0.5 ? "#fbbf24" : GC2.red;
        return (
          <div key={seat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ width: 30, color: GC2.gray, fontSize: 9, fontWeight: 800 }}>{a.lane}</span>
            <span style={{ width: 54, color: "#e5e7eb", fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.player?.name ?? seat.toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: a.hero ? "#fff" : "#52525b", fontSize: 10.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.hero?.zh ?? "尚未選角"}
            </span>
            <span title={`英雄位置適性 ${Math.round(a.heroFit * 100)}%／選手位置熟練 ${Math.round(a.playerFit * 100)}%`}
              style={{ color: fitColor, fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
              適性 {Math.round(a.heroFit * 100)}%
            </span>
            <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              {sp.map((id) => (
                <span key={id} title={`${SUMMONER_SPELLS[id]?.zh}${SUMMONER_SPELLS[id]?.engine ? "" : "（配置用，引擎未模擬效果）"}`}
                  style={{ fontSize: 10, opacity: SUMMONER_SPELLS[id]?.engine ? 1 : 0.55 }}>
                  {SUMMONER_SPELLS[id]?.icon ?? "?"}
                </span>
              ))}
            </span>
          </div>
        );
      })}
      {plan.conflicts.map((c) => (
        <div key={c.seat} style={{ color: "#fbbf24", fontSize: 9, marginTop: 3 }}>⚠ {c.lane}：{c.note}</div>
      ))}
    </div>
  );
}
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import HeroCodexDetail from "./HeroCodexDetail.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";

const GC2 = { bg: "#0a0b0f", card: "#13151c", card2: "#1a1d26", gray: "#71717a", gold: "#fbbf24", green: "#34d399", red: "#ef4444", blue: "#3b82f6", purp: "#a78bfa" };
const ARCH_COLOR = { 坦克: "#60a5fa", 戰士: "#f97316", 刺客: "#ef4444", 法師: "#a855f7", 射手: "#22c55e", 輔助: "#14b8a6" };

// ════ Legacy 英雄特性分析（技能類型碼 D/C/B/M/O + 描述關鍵字）— 逐字移植 ════
function analyzeChamp(champ) {
  const skills = ["P", "Q", "W", "E", "R"].map((k) => champ.skills?.[k]).filter(Boolean);
  const types = skills.map((s) => (s.tier || "").trim());
  const allDesc = skills.map((s) => s.desc || "").join(" ");
  const cnt = (t) => types.filter((x) => x === t).length;
  const has = (kw) => allDesc.includes(kw);
  const tags = new Set();
  if (cnt("C") >= 2) tags.add("控制");
  if (cnt("D") >= 3 || champ.arch === "刺客") tags.add("爆發");
  if (cnt("M") >= 1 || has("衝") || has("突進") || has("閃") || has("位移") || has("躍")) tags.add("機動");
  if (has("護盾") || has("減傷") || has("格擋") || champ.arch === "坦克") tags.add("肉盾");
  if (has("真實傷害") || has("最大生命") || has("百分比")) tags.add("真傷");
  if (has("免疫") || has("霸體") || has("淨化") || has("不可被") || has("解除控制")) tags.add("免控");
  if (champ.arch === "射手" || champ.arch === "法師") tags.add("遠程");
  if (champ.arch === "戰士" || (champ.lane === "上路" && champ.diff <= 2)) tags.add("強壓");
  if (champ.arch === "射手") tags.add("需發育");
  if (champ.arch === "射手" || champ.arch === "法師") tags.add("後排核心");
  return tags;
}

// ════ Legacy 克制規則（7 條）— 逐字移植 ════
export function archCounterScore(a, b) {
  const ta = analyzeChamp(a), tb = analyzeChamp(b);
  const h = (s, v) => s.has(v);
  let score = 0;
  if (h(ta, "免控") && h(tb, "控制")) score += 3;
  if ((h(ta, "真傷") || h(ta, "爆發")) && h(tb, "肉盾")) score += 2;
  if (h(ta, "機動") && h(ta, "爆發") && h(tb, "後排核心") && !h(tb, "機動")) score += 3;
  if (h(ta, "控制") && (h(tb, "機動") || h(tb, "爆發")) && !h(tb, "免控")) score += 2;
  if (h(ta, "肉盾") && h(tb, "爆發") && !h(tb, "真傷")) score += 2;
  if (h(ta, "強壓") && h(tb, "需發育")) score += 2;
  if (h(ta, "遠程") && h(ta, "機動") && h(tb, "強壓") && !h(tb, "機動")) score += 1;
  return score;
}

// Legacy SEQ：14 步輪選（4 ban → 10 pick 蛇形）
const SEQ = [
  { team: "blue", act: "ban" }, { team: "red", act: "ban" }, { team: "blue", act: "ban" }, { team: "red", act: "ban" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" }, { team: "red", act: "pick" }, { team: "blue", act: "pick" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" }, { team: "red", act: "pick" }, { team: "blue", act: "pick" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" },
];

// ════ ChampFace — Legacy HERO_IMG 英雄圖（Sprint20 B 接回）════
//  圖片一律經 heroDatabase.heroImage()（HeroPortrait 內部呼叫）；
//  缺圖 / 載入失敗 → 退回 Sprint18 的程序化色塊頭像（不得破圖）。
export function ChampFace({ champ, size = 44 }) {
  const c = champ;
  const accent = c.color || "#8aa0b8";
  let h = 0;
  for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) & 0xffffff;
  const hue = h % 360;
  const swatch = (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1.5px solid ${accent}`, background: `linear-gradient(135deg, hsl(${hue},45%,32%), #0a0a10)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: size * 0.42, fontWeight: 900, color: "rgba(255,255,255,0.88)" }}>{c.zh.slice(0, 1)}</span>
    </div>
  );
  return <HeroPortrait heroId={c.id} size={size} radius="50%" border={`1.5px solid ${accent}`} alt={c.zh} fallback={swatch} />;
}

export default function BanPickScreen({ onNext, onBack, onCodex, onComplete }) {
  //  ── Milestone I：選手／英雄／五路的自動分配 ─────────────────────────────
  //    舊版是「picks[i] → 席位 b(i+1)」的順序硬對位：選到兩隻中路照樣塞，
  //    玩家看不出衝突。現在改用可解釋評分 + 窮舉最佳解（5! = 120 種，決定性）。
  const storePlayers = useProfileStore((s) => s.players);
  const storeLineup = useProfileStore((s) => s.lineup);
  const [step, setStep] = useState(0);
  const [bans, setBans] = useState({ blue: [], red: [] });
  const [picks, setPicks] = useState({ blue: [], red: [] });
  const [log, setLog] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickFilter, setPickFilter] = useState("全部");
  const [detailId, setDetailId] = useState(null);
  const usedRef = useRef(new Set());

  //  席位 → 實際上場選手（沿用 Milestone E 的先發指派，不另建一套）
  const seatPlayers = useMemo(() => seatPlayersOf(storeLineup, storePlayers ?? []), [storeLineup, storePlayers]);
  //  每次我方選角變動就重算分配 ⇒ 面板隨時反映「目前這批英雄會怎麼排」
  const draftPlan = useMemo(
    () => assignDraft({ picks: picks.blue, seatPlayers, tagsOf: heroTags }),
    [picks.blue, seatPlayers],
  );
  const planLoadout = useMemo(
    () => buildLoadout(assignmentToRoster(draftPlan.assignment), heroById),
    [draftPlan],
  );

  const cur = step < SEQ.length ? SEQ[step] : null;
  const done = step >= SEQ.length;
  const isMyTurn = cur && cur.team === "blue";
  const pool = CHAMPIONS_100.filter((c) => !usedRef.current.has(c.id));

  // Legacy AI：ban 60% 針對性 / pick 50% counter — 逐字移植
  const aiPick = (team, action) => {
    const p = pool;
    if (p.length === 0) return null;
    const enemyPicks = picks.blue;
    if (action === "ban") {
      if (Math.random() < 0.6 && enemyPicks.length > 0) {
        const scored = p.map((c) => ({ c, s: picks.red.reduce((sum, rc) => sum + archCounterScore(c, rc), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        if (scored.length > 0) return scored[Math.floor(Math.random() * Math.min(3, scored.length))].c;
      }
      return p[Math.floor(Math.random() * Math.min(12, p.length))];
    } else {
      if (Math.random() < 0.5 && enemyPicks.length > 0) {
        const scored = p.map((c) => ({ c, s: enemyPicks.reduce((sum, bc) => sum + archCounterScore(c, bc), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        if (scored.length > 0) return scored[Math.floor(Math.random() * Math.min(3, scored.length))].c;
      }
      return p[Math.floor(Math.random() * Math.min(8, p.length))];
    }
  };

  const playerChoose = (champ) => {
    if (!isMyTurn) return;
    usedRef.current.add(champ.id);
    if (cur.act === "ban") { setBans((b) => ({ ...b, blue: [...b.blue, champ] })); setLog((l) => [`🔵 你 禁用 ${champ.zh}`, ...l].slice(0, 8)); }
    else { setPicks((p) => ({ ...p, blue: [...p.blue, champ] })); setLog((l) => [`🔵 你 選擇 ${champ.zh}（${champ.arch}）`, ...l].slice(0, 8)); }
    setShowPicker(false);
    setStep((s) => s + 1);
  };

  useEffect(() => {
    if (done) {
      //  Milestone I：把分配結果與召喚師技能一併往下傳（純附加欄位；
      //    下游沒有讀 assignment 的舊路徑仍可用 picks 的順序對位）。
      const payload = {
        picks, bans,
        assignment: { blue: assignmentToHeroIds(draftPlan.assignment) },
        loadout: { blue: planLoadout },
      };
      const t = setTimeout(() => { if (onComplete) onComplete(payload); if (onNext) onNext(payload); }, 1200);
      return () => clearTimeout(t);
    }
    if (isMyTurn) { setShowPicker(true); return; }
    const t = setTimeout(() => {
      const champ = aiPick(cur.team, cur.act);
      if (!champ) { setStep((s) => s + 1); return; }
      usedRef.current.add(champ.id);
      let counterNote = "";
      if (cur.act === "pick" && picks.blue.length > 0) {
        const best = picks.blue.map((bc) => ({ bc, s: archCounterScore(champ, bc) })).sort((a, b) => b.s - a.s)[0];
        if (best && best.s >= 2) counterNote = `（克制你的${best.bc.zh}）`;
      }
      if (cur.act === "ban") { setBans((b) => ({ ...b, red: [...b.red, champ] })); setLog((l) => [`🔴 對手 禁用 ${champ.zh}`, ...l].slice(0, 8)); }
      else { setPicks((p) => ({ ...p, red: [...p.red, champ] })); setLog((l) => [`🔴 對手 選擇 ${champ.zh}${counterNote}`, ...l].slice(0, 8)); }
      setStep((s) => s + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div style={{ minHeight: "100%", background: GC2.bg, fontFamily: "system-ui", padding: "12px 12px 30px", overflow: "auto" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: GC2.gray, fontSize: 14, cursor: "pointer", padding: 0 }}>←</button>}
            <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>選角階段</h2>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {onCodex && <button onClick={onCodex} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "4px 10px", color: "#e5e7eb", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📖 圖鑑</button>}
            <span style={{ background: done ? "rgba(52,211,153,0.15)" : isMyTurn ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)", color: done ? GC2.green : isMyTurn ? GC2.blue : GC2.red, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px" }}>{done ? "完成" : isMyTurn ? "輪到你" : "對手選擇中…"}</span>
          </div>
        </div>

        {cur && <div style={{ background: GC2.card, borderRadius: 10, padding: "10px 14px", marginBottom: 12, borderLeft: `3px solid ${cur.team === "blue" ? GC2.blue : GC2.red}` }}><span style={{ color: cur.team === "blue" ? GC2.blue : GC2.red, fontSize: 12, fontWeight: 700 }}>{cur.team === "blue" ? "🔵 我方" : "🔴 對手"}</span><span style={{ color: "white", fontSize: 11, marginLeft: 8 }}>{cur.act === "ban" ? "禁用英雄" : "選擇英雄"}{isMyTurn ? " — 點下方選擇" : ""}</span></div>}

        <div style={{ marginBottom: 14 }}>
          <div style={{ color: GC2.gray, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>禁用</div>
          <div style={{ display: "flex", gap: 12 }}>
            {["blue", "red"].map((t) => (
              <div key={t} style={{ flex: 1 }}>
                <div style={{ color: t === "blue" ? GC2.blue : GC2.red, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>{t === "blue" ? "🔵 我方" : "🔴 對手"}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {bans[t].map((c) => (<div key={c.id} style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden", opacity: 0.5, filter: "grayscale(1)" }}><ChampFace champ={c} size={32} /></div>))}
                  {Array.from({ length: 2 - bans[t].length }).map((_, i) => (<div key={i} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.15)" }} />))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ color: GC2.gray, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>已選英雄</div>
          <div style={{ display: "flex", gap: 12 }}>
            {["blue", "red"].map((t) => (
              <div key={t} style={{ flex: 1 }}>
                <div style={{ color: t === "blue" ? GC2.blue : GC2.red, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>{t === "blue" ? "🔵 我方" : "🔴 對手"}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {picks[t].map((c) => (<button key={c.id} onClick={() => setDetailId(c.id)} style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", border: `2px solid ${ARCH_COLOR[c.arch] || (t === "blue" ? GC2.blue : GC2.red)}`, padding: 0, background: "none", cursor: "pointer" }}><ChampFace champ={c} size={36} /></button>))}
                  {Array.from({ length: 5 - picks[t].length }).map((_, i) => (<div key={i} style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }} />))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isMyTurn && showPicker && (
          <div style={{ background: GC2.card, borderRadius: 12, padding: "12px", marginBottom: 12, border: `1px solid ${GC2.blue}` }}>
            <div style={{ color: GC2.blue, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{cur.act === "ban" ? "選擇要禁用的英雄" : "選擇你的英雄"}</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
              {["全部", "坦克", "戰士", "刺客", "法師", "射手", "輔助"].map((f) => (<button key={f} onClick={() => setPickFilter(f)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 99, border: "none", cursor: "pointer", background: pickFilter === f ? (ARCH_COLOR[f] || GC2.blue) : "rgba(255,255,255,0.06)", color: pickFilter === f ? "#fff" : GC2.gray, fontSize: 10, fontWeight: 700 }}>{f}</button>))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {pool.filter((c) => pickFilter === "全部" || c.arch === pickFilter).map((c) => (
                <div key={c.id} style={{ background: GC2.card2, border: "1.5px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
                  <button onClick={() => setDetailId(c.id)} style={{ position: "absolute", top: 2, right: 2, width: 15, height: 15, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", cursor: "pointer", color: "#a1a1aa", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>ⓘ</button>
                  <button onClick={() => playerChoose(c)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%", padding: 0 }}>
                    <ChampFace champ={c} size={34} />
                    <span style={{ color: "white", fontSize: 7, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{c.zh}</span>
                    <span style={{ color: ARCH_COLOR[c.arch], fontSize: 6.5 }}>{c.arch}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestone I：出戰配置（自動分配）——我方一有選角就顯示 */}
        {picks.blue.length > 0 && <DraftPlanPanel plan={draftPlan} loadout={planLoadout} />}

        <div style={{ background: GC2.card, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ color: GC2.gray, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>選角動態</div>
          {log.length === 0 && <div style={{ color: GC2.gray, fontSize: 10, textAlign: "center", padding: "8px 0" }}>準備開始…</div>}
          {log.map((l, i) => (<div key={i} style={{ color: i === 0 ? "white" : GC2.gray, fontSize: 10, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{l}</div>))}
        </div>

        {done && <div style={{ textAlign: "center", color: GC2.green, fontSize: 13, fontWeight: 800, marginTop: 14 }}>✓ 選角完成，即將進入對戰</div>}
      </div>
      {detailId && <HeroCodexDetail heroId={detailId} onClose={() => setDetailId(null)} />}
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
