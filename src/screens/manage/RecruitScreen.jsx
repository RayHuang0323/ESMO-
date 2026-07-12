// ============================================================================
//  screens/manage/RecruitScreen.jsx — 球探招募（Sprint21）
//  Legacy 來源：EsportsGame.jsx RecruitModule(line5643) Component 化。
//  Presentation 逐項保留：預算徽章 / 球探出勤中橫幅（推進偵查日）/ 搜尋列 /
//    路線篩選（金）＋等級篩選（紫）＋換一批 / 候選列（分級色塊、潛力依偵查
//    等級遮蔽為 ??? → 區間 → 精確值、競爭中標記、簽約金）/ 詳情 Modal
//    （淺層 2 天・深度 4 天偵查、個性、最適位置、16 項能力、簽約鈕）。
//  Adapter（不造假）：
//    · 新秀池＝data/recruitPool.genProspects(seed)（Legacy 逐字、決定性亂數）
//    · 預算＝profileStore.finance.funds（以「萬」顯示）；偵查進度＝profileStore.scouted
//    · 簽約＝profileStore.signProspect（扣款 → 進 players[] → 發收件匣）
//  誠實差異：Legacy 的「轉會市場 / 我的報價」分頁屬 NegotiationModule 領域
//    （母隊報價・還價・合約談判），不在 Sprint21 八模組清單內 → 本頁只做自由選手。
// ============================================================================
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useProfileStore, WAN } from "../../platform/profileStore.js";
import { genProspects, TIERS, SCOUT_DAYS } from "../../data/recruitPool.js";
import { STAT_DEF, STAT_CATS, MOBA_ROLES, ROSTER_CAP, bestPositions, personalityById } from "../../data/playerModel.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const GRADES = ["全部", "S+", "S", "A+", "A", "B+", "B", "C", "D"];

export default function RecruitScreen({ onBack }) {
  const funds = useProfileStore((s) => s.finance.funds);
  const players = useProfileStore((s) => s.players) ?? [];
  const scouted = useProfileStore((s) => s.scouted) ?? {};
  const setScouted = useProfileStore((s) => s.setScouted);
  const signProspect = useProfileStore((s) => s.signProspect);

  const [seed, setSeed] = useState(7);
  const [roleF, setRoleF] = useState("全部");
  const [tierF, setTierF] = useState("全部");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [scoutQueue, setScoutQueue] = useState({});   // {id:{level,daysLeft,totalDays}} 出勤中的球探

  const prospects = useMemo(() => genProspects(seed), [seed]);
  const budgetWan = Math.floor(funds / WAN);
  const signedNames = new Set(players.map((p) => p.name));
  const full = players.length >= ROSTER_CAP;

  const scoutOf = (p) => Math.max(p.scoutLv, scouted[p.id] ?? 0);
  const list = prospects.filter((p) =>
    (roleF === "全部" || p.role === roleF) &&
    (tierF === "全部" || p.tier.grade === tierF) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()))
  );
  const sel = prospects.find((p) => p.id === selId) || null;

  const dispatchScout = (p, depth) => {
    if (scoutQueue[p.id] || scoutOf(p) >= 2) return;
    setScoutQueue((s) => ({ ...s, [p.id]: { level: depth, daysLeft: SCOUT_DAYS[depth], totalDays: SCOUT_DAYS[depth] } }));
  };
  const advanceScoutDay = () => {
    setScoutQueue((queue) => {
      const next = {};
      for (const [id, info] of Object.entries(queue)) {
        const daysLeft = info.daysLeft - 1;
        if (daysLeft <= 0) setScouted(id, info.level);
        else next[id] = { ...info, daysLeft };
      }
      return next;
    });
  };

  return (
    <ManageFrame
      title="球探招募" subtitle="SCOUTING" onBack={onBack}
      right={<span style={{ background: "rgba(251,191,36,0.15)", color: GC.gold, fontSize: 12, fontWeight: 800, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>預算 ${budgetWan}萬</span>}
    >
      <div style={{ color: GC.gray, fontSize: 10, marginBottom: 10 }}>
        {prospects.length} 名潛力新秀 · 派球探偵查（免費，需時間）才能看清能力 · 名單 {players.length}/{ROSTER_CAP}
      </div>

      {/* 球探出勤中 */}
      {Object.keys(scoutQueue).length > 0 && (
        <div style={{ background: `linear-gradient(135deg,rgba(52,211,153,0.12),${GC.card})`, border: `1px solid ${GC.green}44`, borderRadius: 12, padding: "11px 13px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: GC.green, fontSize: 11, fontWeight: 700 }}>🔍 {Object.keys(scoutQueue).length} 名球探出勤中</div>
              <div style={{ color: GC.gray, fontSize: 9, marginTop: 2 }}>推進日數讓球探回報</div>
            </div>
            <button onClick={advanceScoutDay} style={{ background: GC.green, border: "none", borderRadius: 9, padding: "8px 16px", cursor: "pointer", color: "#0a0b0f", fontSize: 12, fontWeight: 800 }}>⏭️ 推進偵查日</button>
          </div>
        </div>
      )}

      {/* 搜尋 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: GC.card, borderRadius: 10, padding: "7px 11px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
        <Search size={13} style={{ color: GC.gray }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋選手名…"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "white", fontSize: 12 }} />
      </div>

      {/* 路線篩選 */}
      <div style={{ display: "flex", gap: 5, marginBottom: 6, overflowX: "auto" }}>
        {["全部", ...MOBA_ROLES].map((r) => (
          <button key={r} onClick={() => setRoleF(r)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", background: roleF === r ? GC.gold : "rgba(255,255,255,0.06)", color: roleF === r ? "#0a0b0f" : GC.gray, fontSize: 11, fontWeight: 700 }}>{r}</button>
        ))}
      </div>

      {/* 等級篩選 + 換一批 */}
      <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto" }}>
        {GRADES.map((t) => (
          <button key={t} onClick={() => setTierF(t)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 99, border: "none", cursor: "pointer", background: tierF === t ? GC.purp : "rgba(255,255,255,0.06)", color: tierF === t ? "#fff" : GC.gray, fontSize: 10, fontWeight: 700 }}>{t}</button>
        ))}
        <button onClick={() => setSeed((s) => s + 1)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 99, border: `1px solid ${GC.green}`, cursor: "pointer", background: "transparent", color: GC.green, fontSize: 10, fontWeight: 700 }}>🔄 換一批</button>
      </div>

      {/* 候選列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((p) => {
          const sc = scoutOf(p);
          const bp = bestPositions(p);
          const isSigned = signedNames.has(p.name);
          const afford = budgetWan >= p.cost;
          const decade = Math.floor(p.potential / 10) * 10;
          const potShow = sc >= 2 ? p.potential : sc >= 1 ? `${decade}~${decade + 9}` : "???";
          const tierShow = sc >= 1 ? p.tier.grade : "?";
          return (
            <button key={p.id} onClick={() => setSelId(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 11, background: GC.card, border: `1px solid ${sc >= 1 ? p.tier.color + "33" : "rgba(255,255,255,0.06)"}`, borderRadius: 13, padding: "11px 13px", cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: sc >= 1 ? `linear-gradient(135deg,${p.tier.color},#0a0b0f)` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 900, color: "#fff" }}>{tierShow}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                  <span style={{ color: GC.gray, fontSize: 9 }}>{p.role} · {p.age}歲</span>
                  {p.competing && <span style={{ color: "#fb923c", fontSize: 8, fontWeight: 700 }}>🔥 競爭中</span>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 8 }}>
                  <span style={{ color: GC.gray }}>潛力 <span style={{ color: sc >= 1 ? p.tier.color : GC.gray, fontWeight: 700 }}>{potShow}</span></span>
                  {sc >= 2 ? (
                    <span style={{ color: GC.gray }}>適 <span style={{ color: GC.purp, fontWeight: 700 }}>{bp.moba.pos.replace("MOBA", "")}</span>/<span style={{ color: "#fb923c", fontWeight: 700 }}>{bp.fps.pos.replace("FPS", "")}</span></span>
                  ) : (
                    <span style={{ color: GC.gray }}>偵查 {sc}/2</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: afford ? GC.gold : GC.red, fontSize: 13, fontWeight: 800 }}>${p.cost}萬</div>
                <div style={{ color: isSigned ? GC.green : GC.gray, fontSize: 8 }}>{isSigned ? "已簽約" : afford ? "可簽約" : "預算不足"}</div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && <div style={{ textAlign: "center", color: GC.gray, fontSize: 12, padding: 30 }}>找不到符合的選手</div>}
      </div>

      {/* 詳情 Modal */}
      {sel && (() => {
        const sc = scoutOf(sel);
        const bp = bestPositions(sel);
        const pers = personalityById(sel.personality);
        const isSigned = signedNames.has(sel.name);
        const afford = budgetWan >= sel.cost;
        const inQueue = Boolean(scoutQueue[sel.id]);
        const decade = Math.floor(sel.potential / 10) * 10;
        return (
          <div onClick={() => setSelId(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: "100%", background: GC.card2, borderRadius: 16, padding: 18, border: `1px solid ${sc >= 1 ? sel.tier.color : GC.line}`, maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 50, height: 50, borderRadius: 13, background: sc >= 1 ? `linear-gradient(135deg,${sel.tier.color},#0a0b0f)` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" }}>{sc >= 1 ? sel.tier.grade : "?"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "white", fontSize: 16, fontWeight: 900 }}>{sel.name}</div>
                  <div style={{ color: GC.gray, fontSize: 10 }}>{sel.role} · {sel.age}歲 · 潛力 {sc >= 2 ? sel.potential : sc >= 1 ? `${decade}~${decade + 9}` : "???"}</div>
                  {sc >= 1 && <div style={{ color: sel.tier.color, fontSize: 9, fontWeight: 700, marginTop: 2 }}>{sel.tier.label}</div>}
                </div>
                <button onClick={() => setSelId(null)} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "#a1a1aa", fontSize: 14 }}>✕</button>
              </div>

              {/* 球探派遣 */}
              <div style={{ background: GC.card, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                {sc >= 2 ? (
                  <div style={{ textAlign: "center", color: GC.green, fontSize: 11, fontWeight: 700, padding: 4 }}>✓ 已完全掌握</div>
                ) : inQueue ? (
                  <div style={{ textAlign: "center", color: GC.blue, fontSize: 11, fontWeight: 700, padding: 4 }}>🔍 球探出勤中 · 剩 {scoutQueue[sel.id].daysLeft} 天</div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => dispatchScout(sel, 1)} style={{ flex: 1, background: "rgba(96,165,250,0.15)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: GC.blue, fontSize: 10, fontWeight: 700 }}>淺層偵查 · {SCOUT_DAYS[1]} 天</button>
                    <button onClick={() => dispatchScout(sel, 2)} style={{ flex: 1, background: "rgba(52,211,153,0.15)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: GC.green, fontSize: 10, fontWeight: 700 }}>深度偵查 · {SCOUT_DAYS[2]} 天</button>
                  </div>
                )}
                <div style={{ color: GC.gray, fontSize: 8, marginTop: 6 }}>
                  {sc === 0 ? "派球探偵查可揭露能力（偵查越久揭露越多）" : sc === 1 ? "已知潛力，深度偵查可見完整能力" : "已完全掌握"}
                </div>
              </div>

              {sc >= 1 && pers && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px" }}>
                  <span style={{ fontSize: 14 }}>{pers.emoji}</span>
                  <span style={{ color: GC.purp, fontSize: 11, fontWeight: 700 }}>{pers.zh}</span>
                  <span style={{ color: GC.gray, fontSize: 9 }}>{pers.desc}</span>
                </div>
              )}

              {sc >= 1 && sel.traits?.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                  {sel.traits.map((t) => (
                    <span key={t} style={{ background: "rgba(251,191,36,0.12)", color: GC.gold, fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "3px 8px" }}>{t}</span>
                  ))}
                </div>
              )}

              {sc >= 2 ? (
                <>
                  <div style={{ background: GC.card, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ color: GC.gray, fontSize: 9, fontWeight: 700, marginBottom: 6 }}>最適合位置（MOBA / FPS）</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, background: "rgba(167,139,250,0.12)", borderRadius: 8, padding: "6px 9px" }}>
                        <div style={{ color: GC.purp, fontSize: 8 }}>MOBA</div>
                        <div style={{ color: "white", fontSize: 11, fontWeight: 700 }}>{bp.moba.pos.replace("MOBA", "")} · 適配 {bp.moba.fit}</div>
                      </div>
                      <div style={{ flex: 1, background: "rgba(251,146,60,0.12)", borderRadius: 8, padding: "6px 9px" }}>
                        <div style={{ color: "#fb923c", fontSize: 8 }}>FPS</div>
                        <div style={{ color: "white", fontSize: 11, fontWeight: 700 }}>{bp.fps.pos.replace("FPS", "")} · 適配 {bp.fps.fit}</div>
                      </div>
                    </div>
                  </div>
                  {STAT_CATS.map((cat) => (
                    <div key={cat} style={{ marginBottom: 7 }}>
                      <div style={{ color: GC.gray, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>{cat}</div>
                      {STAT_DEF.filter((s) => s.cat === cat).map((s) => {
                        const v = sel.stats?.[s.key] ?? 50;
                        const b = pers?.boost?.includes(s.key), n = pers?.nerf?.includes(s.key);
                        return (
                          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: b ? GC.gold : n ? GC.red : "#a1a1aa", fontSize: 9, width: 52, flexShrink: 0 }}>{s.zh}{b ? "↑" : n ? "↓" : ""}</span>
                            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${v}%`, background: v >= 80 ? GC.gold : v >= 65 ? GC.green : "#60a5fa" }} />
                            </div>
                            <span style={{ color: "white", fontSize: 9, fontFamily: "monospace", width: 20, textAlign: "right" }}>{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ textAlign: "center", color: GC.gray, fontSize: 10, padding: "16px 0" }}>完整能力需偵查至 2/2 才會顯示</div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ color: GC.gray, fontSize: 9 }}>簽約金</div>
                  <div style={{ color: afford ? GC.gold : GC.red, fontSize: 18, fontWeight: 900 }}>${sel.cost}萬</div>
                </div>
                {isSigned ? (
                  <div style={{ color: GC.green, fontSize: 12, fontWeight: 700 }}>✓ 已簽約</div>
                ) : full ? (
                  <div style={{ color: GC.red, fontSize: 11, fontWeight: 700 }}>名單已滿 {ROSTER_CAP} 人</div>
                ) : (
                  <button onClick={() => { if (signProspect(sel)) setSelId(null); }} disabled={!afford}
                    style={{ padding: "11px 22px", borderRadius: 11, border: "none", cursor: afford ? "pointer" : "not-allowed", background: afford ? `linear-gradient(135deg,${GC.green},#059669)` : "rgba(255,255,255,0.06)", color: afford ? "#fff" : GC.gray, fontSize: 13, fontWeight: 800 }}>
                    {afford ? "簽約" : "預算不足"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </ManageFrame>
  );
}
