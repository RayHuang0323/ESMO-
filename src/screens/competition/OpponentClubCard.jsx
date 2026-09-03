// ============================================================================
//  screens/competition/OpponentClubCard.jsx — 對手俱樂部卡（Social Identity v1）
//
//  ── 這一張卡在回答一個問題：「那是誰的俱樂部？」──────────────────────
//  Club Identity v1 的稱號只有自己看得到，所以它沒有社交價值。這張卡是
//  **識別第一次被別人看見**的地方：點積分榜上任何一列，就看到那間俱樂部的
//  隊徽、稱號、等級、戰績與榮耀。
//
//  ── ⚠ 這張卡不得變成免費偵察 ────────────────────────────────────────
//  資料**只能**來自 `profile.publicClubCard(teamId)`。那支 selector 背後是
//  `platform/identity/publicClubIdentity.js` 的公開契約，裡面有一份禁列：
//  主義／總教練／戰術／賽前準備／先發名單／球探情報一律不得出現。
//
//  **畫面不要自己多讀一個 profile 欄位。** 想加公開欄位，先去改契約。
//
//  ── 純呈現 ──────────────────────────────────────────────────────────────
//  本元件不算任何規則：名次、勝敗、積分、榮耀全部已經算好傳進來。
// ============================================================================
import React from "react";
import { GC, MONO } from "../../ui/theme.js";
import "./opponentClubCard.css";

/**
 * @param {object}   p
 * @param {object}   p.card     `profile.publicClubCard(teamId)` 的結果
 * @param {Function} p.onClose
 */
export default function OpponentClubCard({ card, onClose }) {
  if (!card) return null;

  //  外觀變數只在這張卡的範圍內生效，和 Dashboard 的皮膚互不干擾。
  const style = {
    ...(card.accent ? { "--club-accent": card.accent } : {}),
    ...(card.accent2 ? { "--club-accent-2": card.accent2 } : {}),
    ...(card.crestRing ? { "--club-ring": card.crestRing } : {}),
  };

  return (
    <div className="occ-backdrop" role="presentation" onClick={onClose} data-testid="opponent-club-card-backdrop">
      <div
        className="occ"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} 俱樂部資訊`}
        data-testid="opponent-club-card"
        data-team-id={card.teamId ?? ""}
        data-club-skin={card.skin ?? "none"}
        data-derived={card.derived ? "1" : "0"}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/*  大面積主視覺：橫幅在這裡和首頁 hero 是同一個語意。 */}
        <div className="occ__skin" aria-hidden="true" />
        {card.bannerMotif && (
          <div className="occ__banner" data-motif={card.bannerMotif} data-wash={card.bannerWash ?? undefined}
            data-testid="opponent-club-banner" aria-hidden="true" />
        )}

        <button type="button" className="occ__close" onClick={onClose} aria-label="關閉">✕</button>

        <div className="occ__head">
          <div className="occ__crest" data-crest={card.crestPattern ?? undefined} aria-hidden="true">
            {card.emoji}
          </div>
          <div className="occ__name">
            <div className="occ__tag">{card.tag ?? "CLUB"}</div>
            <h2>
              {card.name}
              {card.titleLabel && (
                <span className="occ__title" data-testid="opponent-club-title">{card.titleLabel}</span>
              )}
            </h2>
            {card.clubLevel?.name && (
              <div className="occ__level" data-testid="opponent-club-level">{card.clubLevel.name}</div>
            )}
          </div>
        </div>

        {card.record && (
          <div className="occ__record" data-testid="opponent-club-record">
            <div><span>名次</span><strong style={{ fontFamily: MONO }}>{card.record.rank ?? "—"}</strong></div>
            <div><span>勝敗</span><strong style={{ fontFamily: MONO }}>{card.record.wins}-{card.record.losses}</strong></div>
            <div><span>積分</span><strong style={{ fontFamily: MONO }}>{card.record.points}</strong></div>
          </div>
        )}

        <div className="occ__honors" data-testid="opponent-club-honors">
          <div className="occ__eyebrow">榮耀</div>
          {card.honors.length === 0
            ? <div className="occ__empty">還沒有年度冠軍紀錄。</div>
            : card.honors.map((h, i) => (
              <div className="occ__honor" key={`${h.label}-${h.season}-${i}`}>
                <span>{h.label}</span>
                <span style={{ fontFamily: MONO, color: GC.gray }}>S{h.season}</span>
              </div>
            ))}
        </div>

        {/*  ⚠ 這句要寫在畫面上：玩家會預期點對手能看到戰術。說清楚看不到，
             比讓他一直找還誠實。 */}
        <div className="occ__note" data-testid="opponent-club-note">
          公開資訊只有識別與戰績。對手的主義、總教練與賽前準備不會顯示——
          那會讓點一下對手變成免費偵察。
        </div>
      </div>
    </div>
  );
}
