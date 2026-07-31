// ============================================================================
//  presentation/HeroSkillCallout.jsx — 關鍵演出的 HUD 播報（Milestone L）
//
//  「剛剛那一下是誰、是什麼演出分類」——用頭像 ＋ 英雄名 ＋ 演出分類標籤講清楚。
//
//  ── ⚠ 誠實邊界（本檔存在的主要理由）───────────────────────────────────────
//  引擎**不模擬 Q/W/E/R**（Milestone L Audit：fx.ability 只有 `{role}:basic|power`）。
//  所以這裡永遠只寫「突進演出」「大招演出」這種**演出分類**，
//  絕不寫「他放了 E」。分類是由英雄的 signature 設定推導出來的呈現，不是引擎事實。
//  面板上固定帶一行說明，讓觀眾知道自己在看什麼。
//
//  ── 資料來源與 3D 層完全相同 ──────────────────────────────────────────────
//  兩邊都吃 `snapshot.fx` → `heroPresentationAdapter` ⇒
//  即時 Battle 與 Replay 不可能出現兩套對應。本檔不讀 R3F、不碰 frameRef。
// ============================================================================
import React, { useMemo } from "react";
import { useGameStore } from "../../../useGameStore.js";
import { useIsMobile } from "../../../ui/useViewport.js";
import HeroPortrait from "../../../ui/HeroPortrait.jsx";
import { heroById } from "../../../data/heroDatabase.js";
import { PRESENTATION_DISCLAIMER } from "../../../data/heroCombatPresentation.js";
import { toPresentationEvents, pickCallouts, CALLOUT_LIMIT } from "../heroPresentationAdapter.js";
import { Z } from "../../ui/battleLayout.js";
//  L Hotfix 2：安全區高度跟著記分板的 compact/expanded 走（唯一來源）。
import { useHudMode, hudSafeTop } from "../../ui/hudStore.js";

const EMPHASIS_TONE = { ultimate: 1, signature: 0.82, normal: 0.6, passive: 0.5 };

export default function HeroSkillCallout({ roster = null, source = null }) {
  const isMobile = useIsMobile();
  const safeTop = hudSafeTop(useHudMode(), isMobile);
  //  `source` 讓 Replay 傳唯讀 adapter 進來（和 MobaView3D 同一個慣例）；
  //  沒傳就是現場對戰的 live store ⇒ 現場行為零改變。
  const liveSnapshot = useGameStore((s) => s.snapshot);
  const liveRoster = useGameStore((s) => s.roster);
  const snapshot = source ? source.getState().snapshot : liveSnapshot;
  const effectiveRoster = roster ?? liveRoster;

  const callouts = useMemo(() => {
    const events = toPresentationEvents(snapshot?.fx ?? [], effectiveRoster);
    return pickCallouts(events, { mobile: isMobile });
  }, [snapshot, effectiveRoster, isMobile]);

  if (!callouts.length) return null;

  return (
    <div data-testid="hero-callouts" data-count={callouts.length}
      data-limit={isMobile ? CALLOUT_LIMIT.mobile : CALLOUT_LIMIT.desktop}
      style={{
        position: "absolute", top: safeTop, right: 8, zIndex: Z.feed,
        //  L Hotfix 1 §2：手機收窄到 40vw 以內，避免壓到戰場中央；
        //  高度由 1–2 則決定（桌機上限 2、手機 1），不會長到蓋住 HUD。
        width: isMobile ? 128 : 176, maxWidth: isMobile ? "40vw" : "26vw",
        display: "flex", flexDirection: "column", gap: 4,
        pointerEvents: "none", fontFamily: "system-ui,sans-serif",
      }}>
      {callouts.map((e) => {
        const p = e.presentation;
        const hero = heroById(p.heroId);
        const tone = EMPHASIS_TONE[p.emphasis] ?? 0.6;
        return (
          <div key={e.id} data-testid="hero-callout" data-hero={p.heroId}
            data-archetype={p.archetype} data-emphasis={p.emphasis}
            data-source={p.source} data-basis={p.basis}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(8,14,24,0.74)",
              border: `1px solid ${p.theme.primaryColor}`,
              borderLeft: `3px solid ${p.theme.accentColor ?? p.theme.primaryColor}`,
              borderRadius: 8, padding: isMobile ? "3px 5px" : "4px 7px",
              opacity: 0.55 + tone * 0.45,
            }}>
            <HeroPortrait heroId={p.heroId} size={isMobile ? 20 : 24} radius="50%"
              border={`1px solid ${p.theme.primaryColor}`} alt={hero?.zh ?? p.heroId}
              fallback={<div style={{
                width: isMobile ? 20 : 24, height: isMobile ? 20 : 24, borderRadius: "50%",
                background: p.theme.primaryColor, flexShrink: 0,
              }} />} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div data-testid="callout-name" style={{
                color: "#fff", fontSize: isMobile ? 9.5 : 11, fontWeight: 800,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{hero?.zh ?? p.heroId}</div>
              {/*  ⚠ 這裡永遠是「演出分類」，不是技能名。 */}
              <div data-testid="callout-label" style={{
                color: p.theme.accentColor ?? p.theme.primaryColor,
                fontSize: isMobile ? 8.5 : 9.5, fontWeight: 700,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{p.label}{p.source === "fallback" ? "・通用" : ""}</div>
            </div>
          </div>
        );
      })}
      <div data-testid="callout-disclaimer" style={{
        fontSize: isMobile ? 7.5 : 8.5, lineHeight: 1.4, color: "rgba(255,255,255,0.42)",
        background: "rgba(8,14,24,0.55)", borderRadius: 6, padding: "2px 5px",
      }}>{PRESENTATION_DISCLAIMER}</div>
    </div>
  );
}
