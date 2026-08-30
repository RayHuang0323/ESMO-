// ============================================================================
//  screens/fps/CsPrepScreen.jsx — CS 賽前準備（Sprint23 → 集中驗收修正包）
//
//  Legacy 規格：EsportsGame.jsx MatchPrep({mode:"fps"})（line 7026-）。
//  與 Legacy 的差異（誠實）：
//    · 「📅 賽程」分頁需要 AI_TEAMS 對手聯賽領域（主幹尚無）→ 未做。
//    · 歷史分頁改讀 profileStore.csHistory（CsMatchResult.v1 真實紀錄）。
//
//  ── 集中驗收修正（項目四）────────────────────────────────────────────────
//  改用與 MOBA **同一個** `MatchPrepFrame` ＋ `SquadSeatRow`。
//
//  修掉的具體問題：舊版把 `starters` 用 `.filter(Boolean)` 濾過再 map，
//  **缺人的席位整列消失**——五席缺三人時畫面只剩兩列，加一個大紅框說
//  「未通過驗證」，玩家看不出是哪一席缺人、也沒有地方可以指派。
//  現在五個席位一定都在，缺員該席標紅並顯示「未指派」，右側有 🔁 可直接指派。
//
//  Architecture：資料全部來自 profileStore.players + playerModel（無第二套資料）。
//  流程沿用既有 validateSquad / MatchEntryRequest / MatchmakingTicket / MatchRoom。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { CS_SEATS, CS_SEAT_LANE_ZH } from "../../platform/contracts/matchSquad.js";
import MatchPrepFrame, { SquadSeatRow } from "../common/MatchPrepFrame.jsx";
import { calcPower, bestPositions, personalityById } from "../../data/playerModel.js";
import { MOBA2FPS, FPS_ROLE_ZH } from "../../battle/fps/fpsRoster.js";
import PlayerFace from "../../ui/PlayerFace.jsx";
import { GC } from "../../ui/theme.js";
import { CS_MAPS } from "../../battle/fps/csPrepData.js";

const ACC = "#fb923c"; // Legacy CS 主色
const COND_C = { "精神飽滿": GC.green, "正常": "#d4d4d8", "疲勞": GC.gold, "低潮": GC.red };
const MONO = "'Courier New',monospace";

//  五個 CS 席位的呈現差異（**只允許到這裡為止**：名稱、圖示、色彩）
const SEAT_STYLE = {
  f1: { code: "ENTRY", emoji: "⚔️", color: "#f97316" },
  f2: { code: "LURKER", emoji: "🕶", color: "#22c55e" },
  f3: { code: "RIFLER", emoji: "🔫", color: "#a855f7" },
  f4: { code: "AWP", emoji: "🎯", color: "#eab308" },
  f5: { code: "IGL", emoji: "🧠", color: "#14b8a6" },
};

/** 指派先發（與 MOBA 的 BenchSheet 同一個 store action，不另建流程）。 */
function CsBenchSheet({ seat, players, lineup, onClose }) {
  const setCsSeat = useProfileStore((s) => s.setCsSeat);
  const list = (players ?? []).filter((p) => p && typeof p.id === "string");
  const want = CS_SEAT_LANE_ZH[seat];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 45 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "76%", overflowY: "auto", borderRadius: "24px 24px 0 0", background: "#16131c", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", boxShadow: "0 -8px 60px rgba(0,0,0,0.8)", paddingBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}><div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.12)" }} /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px 12px" }}>
          <div>
            <div style={{ color: "white", fontSize: 15, fontWeight: 900 }}>指派先發 · {SEAT_STYLE[seat]?.code}</div>
            <div style={{ color: "#52525b", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginTop: 2 }}>{want} · 席位 {seat}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: GC.gray, fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map((p) => {
            const at = CS_SEATS.find((x) => lineup?.[x] === p.id) ?? null;
            const isHere = at === seat;
            return (
              <button key={p.id} onClick={() => { setCsSeat(seat, p.id); onClose(); }} disabled={isHere}
                style={{
                  display: "flex", alignItems: "center", gap: 9, textAlign: "left", width: "100%",
                  background: isHere ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isHere ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 10, padding: "9px 11px", cursor: isHere ? "default" : "pointer",
                }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}><PlayerFace player={p} size={30} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: "#e5e7eb", fontFamily: MONO }}>
                    {p.name}
                    <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: "#93c5fd", background: "rgba(59,130,246,0.14)", borderRadius: 5, padding: "1px 5px", fontFamily: "system-ui" }}>Lv.{p.lv ?? 1}</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}>
                    {FPS_ROLE_ZH[MOBA2FPS[p.role]] ?? "步槍手"} · CS 戰力 {calcPower(p, "fps")}
                    {at && at !== seat && <span style={{ color: "#fbbf24" }}> · 目前 {SEAT_STYLE[at]?.code}（點擊將互換）</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: isHere ? GC.green : GC.gray, flexShrink: 0 }}>{isHere ? "先發中" : "指派"}</span>
              </button>
            );
          })}
          {!list.length && <div style={{ color: GC.gray, fontSize: 11, padding: "12px 4px" }}>名單為空。</div>}
        </div>
      </div>
    </div>
  );
}

//  UI-3：CS 賽季的責任（開季／今日賽程出戰／賽事中心導航）已經搬到
//  `CsCompetitionHubScreen`（首頁「賽事」→ CS 分頁）。M2 當初就把這個區塊
//  標成「暫用入口…完整的 CS 賽事頁上線之後應該被它取代，而不是兩個入口並存」，
//  這裡執行的就是那句話。本檔回歸單場 CS 賽前責任：陣容、戰力、歷史。

export default function CsPrepScreen({ onNext, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const csHistory = useProfileStore((s) => s.csHistory) ?? [];
  const csLineup = useProfileStore((s) => s.csLineup);
  const autoFillLineup = useProfileStore((s) => s.autoFillLineup);
  const mapPreferences = useProfileStore((s) => s.csMapPreferences);
  const fixtureId = useProfileStore((s) => s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null);
  const setCsAcceptedMapPool = useProfileStore((s) => s.setCsAcceptedMapPool);
  const setCsPracticeMap = useProfileStore((s) => s.setCsPracticeMap);
  const [tab, setTab] = useState("prep");
  const [bench, setBench] = useState(null);

  const byId = new Map(players.map((p) => [p.id, p]));
  const seated = CS_SEATS.map((seat) => byId.get(csLineup?.[seat])).filter(Boolean);
  const myPow = seated.length ? Math.round(seated.reduce((t, p) => t + calcPower(p, "fps"), 0) / seated.length) : 0;
  const acceptedPool = mapPreferences?.acceptedPool ?? CS_MAPS.map((map) => map.key);
  const practiceMapKey = mapPreferences?.practiceMapKey ?? "mirage";

  const toggleAcceptedMap = (mapKey) => {
    const next = acceptedPool.includes(mapKey)
      ? acceptedPool.filter((key) => key !== mapKey)
      : [...acceptedPool, mapKey];
    if (next.length) setCsAcceptedMapPool(next);
  };

  //  ⚠ 五個席位一定都算進來（**不 filter**）——缺員要看得見是哪一席。
  const seats = CS_SEATS.map((seat) => {
    const st = SEAT_STYLE[seat];
    const p = byId.get(csLineup?.[seat]) ?? null;
    const pow = p ? calcPower(p, "fps") : null;
    const cond = p?.condition || "正常";
    const cc = COND_C[cond] || "#d4d4d8";
    const pers = p ? personalityById(p.personality) : null;
    return (
      <SquadSeatRow
        key={seat}
        code={st.code} label={`${st.code} · ${CS_SEAT_LANE_ZH[seat]}`} emoji={st.emoji} color={st.color}
        seated={!!p} playerName={p?.name} playerLv={p?.lv}
        onSwap={() => setBench(seat)}
        avatar={p ? (
          <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: `2px solid ${cc}`, flexShrink: 0 }}><PlayerFace player={p} size={30} /></div>
        ) : null}
        subLine={p ? (
          <div style={{ display: "flex", gap: 5, marginTop: 2, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>{FPS_ROLE_ZH[MOBA2FPS[p.role]] || "步槍手"}</span>
            <span style={{ color: GC.gray, fontSize: 8, whiteSpace: "nowrap" }}>適配 {bestPositions(p).fps.fit}</span>
            <span style={{ color: cc, fontSize: 8, whiteSpace: "nowrap" }}>{cond}</span>
            {pers && <span style={{ fontSize: 8 }}>{pers.emoji}</span>}
          </div>
        ) : null}
        right={(
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: ACC, fontSize: 16, fontWeight: 900 }}>{pow ?? "—"}</div>
            <div style={{ color: GC.gray, fontSize: 7 }}>戰力</div>
          </div>
        )}
      />
    );
  });

  if (tab === "history") {
    return (
      <div style={{ height: "100%", overflow: "auto", background: GC.bg, padding: "12px 12px 30px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <CsTabs tab={tab} setTab={setTab} onBack={onBack} />
          {csHistory.length === 0 ? (
            <div style={{ textAlign: "center", color: GC.gray, fontSize: 12, padding: "40px 0" }}>尚無 CS 對戰紀錄<br /><span style={{ fontSize: 10 }}>完成比賽後會顯示在這裡</span></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {csHistory.map((h) => {
                const win = h.winner === "us";
                return (
                  <div key={h.matchId} style={{ display: "flex", alignItems: "center", gap: 10, background: GC.card, borderRadius: 11, padding: "11px 13px", borderLeft: `3px solid ${win ? GC.green : GC.red}`, minWidth: 0 }}>
                    <span style={{ color: win ? GC.green : GC.red, fontSize: 14, fontWeight: 900 }}>{win ? "勝" : "負"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "white", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.mapName ?? h.mapId} <span style={{ color: GC.gray, fontWeight: 600, fontFamily: "monospace" }}>{h.ourScore}:{h.enemyScore}</span></div>
                      <div style={{ color: GC.gray, fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.tacticName ?? "—"}{h.mvp ? ` · MVP ${h.mvp.playerName}` : ""}</div>
                    </div>
                    <span style={{ color: GC.gold, fontSize: 10, whiteSpace: "nowrap" }}>+${Math.round((h.rewards?.money ?? 0) / 10000)}萬</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <MatchPrepFrame
        mode="cs" title="CS 賽前準備" subtitle="攻防戰術模擬 · 訓練賽"
        icon="🎯" accent={ACC}
        onBack={onBack} onEnterBattle={onNext}
        onAutoFill={() => autoFillLineup("cs")}
        aboveSeats={(
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[{ k: "prep", l: "⚙️ 出戰" }, { k: "history", l: "📜 歷史" }].map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "8px", borderRadius: 9, border: "none", cursor: "pointer", background: tab === t.k ? ACC : GC.card, color: tab === t.k ? "#fff" : GC.gray, fontSize: 11, fontWeight: 700 }}>{t.l}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6, minWidth: 0 }}>
              <span style={{ color: GC.gray, fontSize: 11, fontWeight: 700 }}>出戰陣容（主力 5 人）</span>
              <span style={{ color: ACC, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>隊伍戰力 {myPow}</span>
            </div>
            {fixtureId ? (
              <div data-testid="cs-official-veto-notice" style={{ marginBottom: 10, padding: "9px 10px", borderRadius: 10, background: `${ACC}12`, border: `1px solid ${ACC}44`, color: "#fed7aa", fontSize: 9.5, lineHeight: 1.6 }}>
                <strong style={{ color: ACC }}>正式賽事 Map Veto</strong><br />
                雙方確認後依本場 BO1／BO3 賽制進行 Ban／Pick；地圖結果會寫入同一個 MatchSession。
              </div>
            ) : (
              <div data-testid="cs-map-preferences" style={{ marginBottom: 10, padding: 10, borderRadius: 11, background: "rgba(255,255,255,0.035)", border: `1px solid ${GC.line}` }}>
                <div style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 900, marginBottom: 6 }}>一般對戰 · 願意玩的地圖池</div>
                <div style={{ color: GC.gray, fontSize: 8.5, marginBottom: 7 }}>配對只會從雙方都接受的地圖中決定（至少勾選一張）</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6, marginBottom: 10 }}>
                  {CS_MAPS.map((map) => {
                    const active = acceptedPool.includes(map.key);
                    return (
                      <button key={`pool-${map.key}`} type="button" data-testid={`cs-map-pool-${map.key}`} aria-pressed={active} onClick={() => toggleAcceptedMap(map.key)}
                        style={{ minWidth: 0, padding: "7px 4px", borderRadius: 8, border: `1px solid ${active ? ACC : GC.line}`, background: active ? `${ACC}20` : "rgba(255,255,255,0.025)", color: active ? "#fed7aa" : GC.gray, fontSize: 9, fontWeight: 800, cursor: "pointer" }}>
                        {active ? "✓ " : ""}{map.name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 900, marginBottom: 6 }}>快速練習 · 直接選圖</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}>
                  {CS_MAPS.map((map) => {
                    const active = practiceMapKey === map.key;
                    return (
                      <button key={`practice-${map.key}`} type="button" data-testid={`cs-practice-map-${map.key}`} aria-pressed={active} onClick={() => setCsPracticeMap(map.key)}
                        style={{ minWidth: 0, padding: "7px 4px", borderRadius: 8, border: `1px solid ${active ? GC.green : GC.line}`, background: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.025)", color: active ? "#a7f3d0" : GC.gray, fontSize: 9, fontWeight: 800, cursor: "pointer" }}>
                        {active ? "● " : "○ "}{map.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        seats={seats}
        belowSeats={(
          <div style={{ color: GC.gray, fontSize: 9, marginTop: 4, marginBottom: 8, lineHeight: 1.7 }}>
            數字為該選手 CS 戰力 · 定位由路線對應（無英雄、無技能）· 🔁 指派先發（持久化）
          </div>
        )}
      />
      {bench && <CsBenchSheet seat={bench} players={players} lineup={csLineup} onClose={() => setBench(null)} />}
    </div>
  );
}

/** 歷史分頁的頁首（與出戰分頁同一組分頁鈕）。 */
function CsTabs({ tab, setTab, onBack }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>←</button>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ACC}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${ACC}`, flexShrink: 0 }}>🎯</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "white", fontSize: 17, fontWeight: 900 }}>CS 賽前準備</div>
          <div style={{ color: GC.gray, fontSize: 10 }}>攻防戰術模擬 · 訓練賽</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[{ k: "prep", l: "⚙️ 出戰" }, { k: "history", l: "📜 歷史" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "8px", borderRadius: 9, border: "none", cursor: "pointer", background: tab === t.k ? ACC : GC.card, color: tab === t.k ? "#fff" : GC.gray, fontSize: 11, fontWeight: 700 }}>{t.l}</button>
        ))}
      </div>
    </>
  );
}
