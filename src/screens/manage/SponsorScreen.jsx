// ============================================================================
//  screens/manage/SponsorScreen.jsx — 贊助商（Sprint21）
//  Legacy 來源：EsportsGame.jsx SponsorModule(line5935) Component 化。
//  Presentation 逐項保留：合作中大卡（漸層底/特殊加成條）/ 可簽約清單
//    （達標亮起、未達標降透明度）/ 詳情 Modal（簽約金・週收入・合約期・總收益・
//    特殊加成）/ 條件未達標紅字。
//  Adapter（不造假）：
//    · 贊助商目錄＝playerModel.SPONSORS（Legacy 逐字，唯一來源）
//    · 粉絲＝profileStore.meta.fans；勝場＝seasonStore 推導（不重算戰績）
//    · 簽約寫入 profileStore.activeSponsor + 入帳簽約金 + 發收件匣
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { useSeasonStore } from "../../platform/seasonStore.js";
import { standings } from "../../platform/seasonData.js";
import { SPONSORS } from "../../data/playerModel.js";
//  N3.1：目前合作中的贊助可能是**開局扶持方案**（不在市集目錄裡），
//  所以解析要用統一入口；下方市集列表仍然只列 SPONSORS。
import { resolveSponsor, sponsorEligibility } from "../../platform/economy/sponsors.js";
import { sponsorRequirementView } from "../../platform/fans/fanPresentation.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

export default function SponsorScreen({ onBack }) {
  const activeRef = useProfileStore((s) => s.activeSponsor);
  const meta = useProfileStore((s) => s.meta);
  const signSponsor = useProfileStore((s) => s.signSponsor);
  const history = useSeasonStore((s) => s.history);
  const [sel, setSel] = useState(null);

  // 戰績只讀 seasonStore 推導，不在經營層重算
  const blue = standings(history).find((t) => t.side === "blue") || { wins: 0 };
  const fans = meta.fans ?? 0;
  const wins = blue.wins ?? 0;

  const active = activeRef ? { ...resolveSponsor(activeRef.id), ...activeRef } : null;
  //  F1：資格**不在畫面計算**——與 `signSponsor` 共用同一份規則，
  //  避免畫面說「條件達標」而 Store 拒簽（見 `economy/sponsors.js`）。
  //  ⚠ 資格判定**完全**交給 `sponsorEligibility()`；畫面只排版，不重算。
  //    `sponsorRequirementView()` 也只是把它的結果整理成「差在哪」的形狀。
  const reqViewOf = (sp) => sponsorRequirementView(sp, sponsorEligibility(sp, { fans, wins }));
  const qualifies = (sp) => reqViewOf(sp).ok;

  return (
    <ManageFrame title="贊助商" subtitle="SPONSORS" onBack={onBack}>
      <div style={{ color: GC.gray, fontSize: 10, marginBottom: 14 }}>
        目前粉絲 <strong style={{ color: "white" }}>{fans.toLocaleString()}</strong> · 戰績 {wins} 勝 · 粉絲與勝場都達標才能簽約
      </div>

      {active ? (
        <div style={{ background: `linear-gradient(135deg,${active.color}22,${GC.card})`, border: `1px solid ${active.color}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: `radial-gradient(circle,${active.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `2px solid ${active.color}` }}>{active.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontSize: 15, fontWeight: 900 }}>{active.name}</div>
              <div style={{ color: active.color, fontSize: 10, fontWeight: 700 }}>{active.tier}贊助商 · 合作中</div>
              <div style={{ color: GC.gray, fontSize: 9, marginTop: 2 }}>每週收入 +${active.weekly}萬 · 剩 {active.weeksLeft} 週</div>
            </div>
          </div>
          {/*  Fan System F4：移除「特殊加成」。`SPONSORS[].perk` 從來沒有 gameplay
               實作（「訓練效果 +15%」等全是純文案），留著等於對玩家承諾不存在的效果。
               裁決 A 已凍結：**F4 移除文案、v1 不補實作**。
               ⚠ schema 上的 `perk` 欄位**沒有刪**，只是畫面不再 consume。 */}
          <div style={{ marginTop: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "7px 10px" }}>
            <div style={{ color: GC.gray, fontSize: 8 }}>合約狀態</div>
            <div style={{ color: GC.green, fontSize: 10, fontWeight: 700 }}>
              合作中 · 剩 {active.weeksLeft} 週 · 每週 +${active.weekly}萬
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", color: GC.gray, fontSize: 11, padding: 14, background: GC.card, borderRadius: 12, marginBottom: 16 }}>尚無贊助商，從下方選擇簽約</div>
      )}

      <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
        {active ? "其他贊助商（合約期滿後可換約）" : "可簽約贊助商"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SPONSORS.map((sp) => {
          //  F4：一次算好，卡片與狀態列共用（不要對同一個 sponsor 算兩次）
          const rq = reqViewOf(sp);
          const ok = rq.ok;
          const isActive = active?.id === sp.id;
          return (
            <button key={sp.id} onClick={() => setSel(sp)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: GC.card, border: `1px solid ${isActive ? GC.green : ok ? sp.color + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", textAlign: "left", opacity: ok || isActive ? 1 : 0.6 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `radial-gradient(circle,${sp.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: `1px solid ${sp.color}66` }}>{sp.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{sp.name}</span>
                  <span style={{ background: `${sp.color}22`, color: sp.color, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>{sp.tier}</span>
                  {isActive && <span style={{ color: GC.green, fontSize: 8 }}>合作中</span>}
                </div>
                <div style={{ color: GC.gray, fontSize: 9, marginTop: 2 }}>每週 +${sp.weekly}萬 · 簽約金 ${sp.signBonus}萬 · {sp.weeks}週</div>
                {/*  F4：不要只說「鎖定」——玩家要看得出**差在哪**。
                     粉絲與勝場各一條，達標打勾、未達標寫還差多少。
                     ⚠ 全部取自 `sponsorEligibility()` 的結果，畫面不重算。 */}
                <div data-testid="sponsor-req" data-sponsor={sp.id}
                  data-fans-ok={rq.fansOk ? "true" : "false"} data-wins-ok={rq.winsOk ? "true" : "false"}
                  data-blocked-by={rq.blockedBy}
                  style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", marginTop: 3 }}>
                  <span style={{ color: rq.fansOk ? GC.green : GC.red, fontSize: 8, fontWeight: 700 }}>
                    {rq.fansOk
                      ? `粉絲 ✓ ${rq.reqFans.toLocaleString()}`
                      : `粉絲 還差 ${rq.fansShort.toLocaleString()}`}
                  </span>
                  <span style={{ color: rq.winsOk ? GC.green : GC.red, fontSize: 8, fontWeight: 700 }}>
                    {rq.winsOk ? `勝場 ✓ ${rq.reqWins}` : `勝場 還差 ${rq.winsShort}`}
                  </span>
                  <span style={{ color: rq.ok ? GC.green : GC.gray, fontSize: 8 }}>
                    {rq.ok ? "· 可簽約" : "· 尚未解鎖"}
                  </span>
                </div>
              </div>
              <span style={{ color: GC.gold, fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>${sp.weekly}/週</span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, width: "100%", background: GC.card2, borderRadius: 16, padding: 18, border: `1px solid ${sel.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `radial-gradient(circle,${sel.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `2px solid ${sel.color}` }}>{sel.emoji}</div>
              <div>
                <div style={{ color: "white", fontSize: 16, fontWeight: 900 }}>{sel.name}</div>
                <div style={{ color: sel.color, fontSize: 10 }}>{sel.tier}贊助商</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {[["簽約金", `$${sel.signBonus}萬`], ["每週收入", `$${sel.weekly}萬`], ["合約期", `${sel.weeks} 週`],
                ["總收益", `約 $${sel.signBonus + sel.weekly * sel.weeks}萬`],
                //  F4：原本這裡是 `sel.perk`（假效果）。換成真實的門檻資訊。
                ["粉絲門檻", sel.reqFans.toLocaleString()],
                ["勝場門檻", `${sel.reqWins} 勝`]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: GC.gray }}>{k}</span><span style={{ color: "white", fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            {active ? (
              <div style={{ textAlign: "center", color: GC.gray, fontSize: 11, padding: 8 }}>已有合作中贊助商，需等合約期滿</div>
            ) : qualifies(sel) ? (
              <button onClick={() => { signSponsor(sel.id, { fans, wins }); setSel(null); }}
                style={{ width: "100%", background: `linear-gradient(135deg,${sel.color},${sel.color}aa)`, border: "none", borderRadius: 11, padding: 12, cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 800 }}>
                簽約 · 立即獲得 ${sel.signBonus}萬
              </button>
            ) : (
              <div style={{ textAlign: "center", color: GC.red, fontSize: 11, padding: 8 }}>條件未達標（需 {sel.reqFans.toLocaleString()} 粉絲 / {sel.reqWins} 勝）</div>
            )}
          </div>
        </div>
      )}
    </ManageFrame>
  );
}
