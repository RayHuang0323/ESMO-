// ============================================================================
//  screens/manage/ClubMasteryScreen.jsx — 俱樂部專精（Meta Progression v1）
//
//  ── 這一頁在回答一個問題：「我的戰隊是什麼流派？」──────────────────────
//  `ObjectivesScreen` 回答「今天做什麼」，`TeamDevelopmentScreen` 回答
//  「俱樂部投資什麼」，這一頁回答**打法認同**。三個是不同的 domain，
//  所以是三頁，不是三個分頁——把它們併在一起，玩家就分不出
//  「我今天該做的事」與「我這支隊伍長成什麼樣子」的差別。
//
//  ⚠ **本頁不算任何進度、不判任何規則。** 目標、進度、可不可領、變體能不能
//    裝備，全部來自 `profile.masteryView()` 與 `profile.variantsForTactic()`。
//    畫面自己算一次，規則就有兩份，而被修的永遠是另外那一份。
//
//  ⚠ **BASIC 永遠可用**這件事要寫在畫面上，不能只寫在程式裡。玩家看到
//    「解鎖」兩個字的直覺是「有東西被鎖住了」——必須當場告訴他不是。
//
//  手機優先：單欄、flex-wrap、minWidth:0，390px 不水平溢出。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { DOCTRINES, doctrineById } from "../../platform/mastery/doctrine.js";
import { variantById, variantsOfDoctrine } from "../../platform/mastery/tacticVariant.js";
import { mobaTacticById } from "../../platform/contracts/MobaTacticConfig.js";
import { GC } from "../../ui/theme.js";

/** 阻擋原因 → 玩家看得懂的一句話。**文案在這裡，判定在 domain。** */
const BLOCKED_ZH = {
  incomplete: "條件還沒完成",
  not_active: "先切換到這個流派才能領取",
  already_claimed: "已領取",
  already_unlocked: "已解鎖",
  unknown_reward: "獎勵無法解析",
  unknown_track: "找不到這條進度",
};

function Bar({ percent, accent, done }) {
  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 7 }}>
      <div style={{
        height: "100%", width: `${Math.max(2, Math.min(100, percent))}%`, borderRadius: 99,
        background: done ? "#34d399" : accent, transition: "width .35s ease",
      }} />
    </div>
  );
}

/** 一個變體的狀態卡：解鎖與否、能不能用、買到什麼付出什麼。 */
function VariantRow({ variantId, unlocked, equippable }) {
  const v = variantById(variantId);
  if (!v) return null;
  const base = mobaTacticById(v.baseTacticId);
  const state = equippable ? "可使用" : unlocked ? "其他流派" : "未解鎖";
  const color = equippable ? "#34d399" : unlocked ? GC.gold : GC.gray2;
  return (
    <div data-testid={`mastery-variant-${variantId}`} data-unlocked={unlocked ? "1" : "0"} data-equippable={equippable ? "1" : "0"}
      style={{
        background: "rgba(255,255,255,0.04)", border: `1px solid ${color}44`,
        borderRadius: 10, padding: "9px 11px", marginTop: 7, minWidth: 0, opacity: unlocked ? 1 : 0.72,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ color: "#fff", fontSize: 12, fontWeight: 900, minWidth: 0 }}>{v.name}</span>
        <span style={{ fontSize: 9, color: GC.gray, whiteSpace: "nowrap" }}>基於 {base?.emoji} {base?.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 800, color, border: `1px solid ${color}55`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>
          {state}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 4, lineHeight: 1.6, overflowWrap: "break-word" }}>
        {v.desc}
      </div>
      {/* 取捨：買到什麼、付出什麼。高階打法不等於更強，這一行就是在說這件事。 */}
      <div style={{ fontSize: 9.5, marginTop: 4, lineHeight: 1.6, overflowWrap: "break-word" }}>
        <span style={{ color: "#34d399", fontWeight: 800 }}>換得 </span>
        <span style={{ color: GC.gray }}>{v.benefitAxes.map((a) => a.label).join("、")}</span>
        <span style={{ color: GC.red, fontWeight: 800 }}>　付出 </span>
        <span style={{ color: GC.gray }}>{v.costAxes.map((a) => a.label).join("、")}</span>
      </div>
      {unlocked && !equippable && (
        <div style={{ fontSize: 9, color: GC.gold, marginTop: 4 }}>
          已擁有——把流派切回「{doctrineById(v.doctrine)?.zh}」就能在賽前選用
        </div>
      )}
    </div>
  );
}

export default function ClubMasteryScreen({ onBack }) {
  const profile = useProfileStore();
  //  ⚠ 兩份 view 都是**推導**出來的，畫面不保存任何一份。
  const view = profile.masteryView();
  const retention = typeof profile.retentionView === "function" ? profile.retentionView() : null;
  const tier = retention?.tier ?? null;

  const setDoctrine = (id) => profile.setActiveDoctrine(id);
  const claim = (trackId) => profile.claimMasteryTrack(trackId);

  return (
    <div data-testid="club-mastery-screen"
      style={{ minHeight: "100%", background: GC.bg ?? "#0a0b0f", color: "#fff", overflowX: "hidden" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "12px 12px 28px", boxSizing: "border-box" }}>

        {/* 頁首 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
          {onBack && (
            <button onClick={onBack} type="button" data-testid="club-mastery-back"
              style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>←</button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 900 }}>俱樂部專精</div>
            <div style={{ color: GC.gray, fontSize: 10 }}>你的戰隊打成什麼樣子</div>
          </div>
        </div>

        {/* 俱樂部等級與點數：累計決定等級，餘額才是能花的 */}
        {tier && (
          <div data-testid="mastery-club-card"
            style={{
              background: "linear-gradient(135deg,rgba(250,204,21,0.13),rgba(255,255,255,0.04))",
              border: `1px solid ${GC.gold}44`, borderRadius: 14, padding: "12px 14px", marginBottom: 14, minWidth: 0,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontSize: 19 }}>{tier.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div data-testid="mastery-club-tier" style={{ color: "#fff", fontSize: 13.5, fontWeight: 900 }}>{tier.name}</div>
                <div style={{ color: "#a1a1aa", fontSize: 9.5 }}>等級看**累計獲得**，花點數不會降級</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right", whiteSpace: "nowrap" }}>
                <div data-testid="mastery-club-balance" style={{ color: GC.gold, fontSize: 17, fontWeight: 900, fontFamily: "'Courier New',monospace" }}>
                  ◆ {retention.clubPoints}
                </div>
                <div style={{ color: "#8b8b95", fontSize: 9 }}>可花點數．累計 {retention.clubPointsLifetime}</div>
              </div>
            </div>
            <Bar percent={tier.percent} accent={GC.gold} done={!tier.next} />
          </div>
        )}

        {/*  ⚠ 這一段是刻意放在最上面的：玩家看到「解鎖」會以為有東西被鎖住。 */}
        <div data-testid="mastery-basic-note"
          style={{ background: "rgba(96,165,250,0.10)", border: `1px solid ${GC.blueL}44`, borderRadius: 12, padding: "9px 12px", marginBottom: 14, minWidth: 0 }}>
          <div style={{ color: GC.blueL, fontSize: 11, fontWeight: 900 }}>八套基礎戰術永遠可用</div>
          <div style={{ color: GC.gray, fontSize: 9.5, marginTop: 3, lineHeight: 1.6 }}>
            專精解鎖的是**玩法特化**，不是把原本的戰術鎖起來。變體會換到某些東西，
            同時也付出代價——它不是更強的版本，是另一種打法。
          </div>
        </div>

        {/* 流派：選一條，只有它會推進 */}
        <div style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 6 }}>戰隊流派</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(160px,100%),1fr))", gap: 8, marginBottom: 8 }}>
          {DOCTRINES.map((d) => {
            const isActive = view.activeDoctrine === d.id;
            return (
              <button key={d.id} type="button"
                data-testid={`doctrine-${d.id}`} data-active={isActive ? "1" : "0"}
                onClick={() => setDoctrine(isActive ? null : d.id)}
                style={{
                  textAlign: "left", minWidth: 0, cursor: "pointer", color: "#fff",
                  background: isActive ? `${GC.blueL}1e` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isActive ? GC.blueL : GC.line}`,
                  borderRadius: 12, padding: "10px 12px",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 15 }}>{d.emoji}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 900, minWidth: 0 }}>{d.zh}</span>
                  {isActive && (
                    <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: GC.blueL, border: `1px solid ${GC.blueL}66`, borderRadius: 4, padding: "0 5px", whiteSpace: "nowrap" }}>
                      進行中
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 4, lineHeight: 1.55, overflowWrap: "break-word" }}>{d.claim}</div>
              </button>
            );
          })}
        </div>
        <div style={{ color: "#8b8b95", fontSize: 9.5, marginBottom: 14, lineHeight: 1.6 }}>
          切換免費、進度永久保留。但**只有進行中的流派會累積專精**，而且只有它的變體能在賽前選用。
        </div>

        {/* 專精進度 */}
        <div style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 6 }}>專精進度</div>
        {view.tracks.map((t) => {
          const d = doctrineById(t.doctrine);
          const pct = t.target > 0 ? Math.round((t.progress / t.target) * 100) : 0;
          const rows = variantsOfDoctrine(t.doctrine).map((v) => {
            const info = profile.variantsForTactic(v.baseTacticId).variants.find((x) => x.variantId === v.variantId);
            return { variantId: v.variantId, unlocked: Boolean(info?.unlocked), equippable: Boolean(info?.equippable) };
          });
          return (
            <div key={t.trackId} data-testid={`mastery-track-${t.trackId}`} data-claimable={t.claimable ? "1" : "0"} data-done={t.done ? "1" : "0"}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${t.claimable ? "#34d39955" : GC.line}`,
                borderRadius: 12, padding: "11px 13px", marginBottom: 9, minWidth: 0,
                opacity: t.claimed ? 0.78 : 1,
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{d?.emoji}</span>
                <span style={{ color: "#fff", fontSize: 12.5, fontWeight: 900, minWidth: 0 }}>{t.name}</span>
                {t.claimed && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#34d399", background: "rgba(52,211,153,0.14)", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>已領取</span>
                )}
                <span style={{ marginLeft: "auto", color: t.done ? "#34d399" : "#a1a1aa", fontSize: 10.5, fontWeight: 800, fontFamily: "'Courier New',monospace", whiteSpace: "nowrap" }}>
                  {t.progress} / {t.target}
                </span>
              </div>
              <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 4, lineHeight: 1.6, overflowWrap: "break-word" }}>{t.desc}</div>
              <Bar percent={pct} accent={GC.blueL} done={t.done} />

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap", minWidth: 0 }}>
                {/* 尚缺什麼：直接用 domain 給的阻擋碼，不自己判斷 */}
                <span style={{ fontSize: 9.5, color: t.claimable ? "#34d399" : GC.gray2, minWidth: 0 }}>
                  {t.claimable ? "條件已達成，可以領取" : (BLOCKED_ZH[t.blockedBy] ?? "尚未完成")}
                </span>
                <button type="button"
                  data-testid={`mastery-claim-${t.trackId}`}
                  disabled={!t.claimable}
                  onClick={() => t.claimable && claim(t.trackId)}
                  style={{
                    marginLeft: "auto", flexShrink: 0,
                    background: t.claimable ? "rgba(52,211,153,0.16)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${t.claimable ? "#34d39988" : GC.line}`,
                    borderRadius: 8, padding: "5px 12px",
                    color: t.claimable ? "#34d399" : GC.gray2,
                    fontSize: 11, fontWeight: 900,
                    cursor: t.claimable ? "pointer" : "not-allowed",
                  }}>
                  {t.claimed ? "已領取" : "領取"}
                </button>
              </div>

              {rows.map((r) => <VariantRow key={r.variantId} {...r} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
