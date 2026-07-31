// ============================================================================
//  debug/HeroPresentation/HeroPresentationGallery.jsx — 演出模板畫廊（Milestone L）
//
//  進入：?debug=hero-presentation
//
//  【為什麼需要它】
//   八個共用模板要「各有可驗證範例」。實戰裡引擎只給得出 basic / power 兩種事件，
//   而且什麼時候出現要看 RNG ⇒ 靠實戰截圖驗模板，等於**靠運氣**。
//   這裡用一份**固定 fixture** 把八個模板同時擺出來，
//   驗收腳本可以逐一指名檢查，不必等某個技能剛好發生。
//
//  【它不是什麼】
//   不是第二條 Replay、不是第二套資料。它吃的是**正式的**
//   heroCombatPresentation ＋ heroPresentationAdapter ＋ HeroSkillEffects，
//   只是餵一份寫死的 frame 進去。任何一邊改了，這裡就會跟著變。
//
//  ⚠ 走 lazy import，正式流程完全不載入。
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import HeroSkillCallout from "../../battle/moba/presentation/HeroSkillCallout.jsx";
import { useGameStore } from "../../useGameStore.js";
import HeroSkillEffects, { TEMPLATE_PRIMITIVES, capsFor } from "../../battle/moba/presentation/HeroSkillEffects.jsx";
import {
  PRESENTATION_ARCHETYPES, ARCHETYPE_LABEL, PRESENTATION_DISCLAIMER,
  SKILL_SLOTS, listPresentationHeroIds, getHeroCombatPresentation,
} from "../../data/heroCombatPresentation.js";
import { heroById } from "../../data/heroDatabase.js";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { GC, FONT, MONO } from "../../ui/theme.js";

//  每個模板派一位代表英雄（挑該模板真的用得到的那位），確保色彩也一起被驗到。
const TEMPLATE_DEMO = {
  projectile: "leiting", line: "dadi", area: "bingshuang", dash: "chichuan",
  shield: "stoneguard", heal: "yanfeng", control: "ironclad", ultimate: "cinderfist",
};
//  一隻**沒有**專屬設定的英雄，用來證明 fallback 真的畫得出東西。
const FALLBACK_DEMO = "linghun";

/** 固定 fixture：八個模板 ＋ 一個 fallback，排成一列，座標寫死 ⇒ 完全決定性。 */
function buildFixtureFrame(progress) {
  const ids = [...PRESENTATION_ARCHETYPES, "fallback"];
  const effects = ids.map((key, i) => {
    const archetype = key === "fallback" ? null : key;
    const heroId = key === "fallback" ? FALLBACK_DEMO : TEMPLATE_DEMO[key];
    const p = getHeroCombatPresentation(heroId);
    const spec = archetype
      ? { archetype, effect: p.skills[p.signatureSlot].effect, emphasis: archetype === "ultimate" ? "ultimate" : "signature" }
      : { archetype: p.basicAttack.archetype, effect: p.basicAttack.effect, emphasis: "normal" };
    const x = -60 + i * 15;
    return {
      id: `fixture-${key}`,
      sourceId: `fixture-src-${key}`,
      targetId: `fixture-dst-${key}`,
      world: { x, y: 0, z: 0 },
      targetWorld: { x, y: 0, z: 10 },
      progress, width: 1,
      presentation: Object.freeze({
        heroId, source: p.source, archetype: spec.archetype, effect: spec.effect,
        emphasis: spec.emphasis, label: ARCHETYPE_LABEL[spec.archetype],
        basis: "fixture", isActualSkillCast: false,
        isUltimate: spec.emphasis === "ultimate",
        theme: p.theme, cameraEmphasis: p.cameraEmphasis,
        performanceTier: p.performanceTier, slot: null,
      }),
    };
  });
  return { effects, heroes: [], minions: [], structures: [], objectives: [] };
}

//  ── HUD callout 的決定性 fixture ──────────────────────────────────────────
//  引擎的 `power` 事件很稀疏（`rng() < 0.2` 且只在英雄互毆時），headless 軟體渲染下
//  一個取樣窗常常一個都遇不到 ⇒ 靠實戰驗 callout 等於靠運氣。
//  這裡把一份寫死的 snapshot 推進**正式的 useGameStore**，再掛**正式的**
//  HeroSkillCallout（不傳任何 prop，讓它走 store 那條 production 路徑）。
//  驗到的是真程式碼，只是輸入是固定的。
const CALLOUT_FIXTURE_ROSTER = Object.freeze({
  b1: { heroId: "ironclad" }, b2: { heroId: "duskblade" }, b3: { heroId: "bingshuang" },
  b4: { heroId: "leiting" }, b5: { heroId: FALLBACK_DEMO },
});
function buildCalloutSnapshot() {
  const mk = (id, sourceId, at) => ({
    id, type: "ult", ability: "top:power", feedback: "skill",
    sourceId, targetId: "r1", at, life: 1.6, exp: 4.2,
    pos: { x: 10, y: 10 }, target: { x: 20, y: 20 },
  });
  return {
    ts: 120,
    //  刻意放 5 筆（超過桌機上限 3 / 手機上限 2）⇒ 限流也一起被驗到
    fx: [mk("c1", "b1", 119.6), mk("c2", "b3", 119.4), mk("c3", "b4", 119.2),
      mk("c4", "b2", 119.0), mk("c5", "b5", 118.8)],
    players: [], feed: [], towers: {},
  };
}

export default function HeroPresentationGallery() {
  const q = new URLSearchParams(window.location.search);
  const quality = q.get("quality") ?? "high";
  const [progress] = useState(() => Number(q.get("progress") ?? 0.45));
  const frameRef = useRef(buildFixtureFrame(progress));
  //  推一份固定 snapshot 進正式 store（只在這個 debug 路由，正式流程不受影響）
  useEffect(() => {
    useGameStore.setState({ snapshot: buildCalloutSnapshot(), roster: CALLOUT_FIXTURE_ROSTER });
  }, []);
  const heroes = useMemo(() => listPresentationHeroIds(), []);
  const caps = capsFor(quality);

  //  讓驗收腳本讀得到「這一份 fixture 真的涵蓋八個模板」的事實。
  if (typeof window !== "undefined") {
    window.__PRESENTATION_FIXTURE = {
      quality, caps, progress,
      archetypes: frameRef.current.effects.map((e) => e.presentation.archetype),
      heroes: frameRef.current.effects.map((e) => e.presentation.heroId),
      sources: frameRef.current.effects.map((e) => e.presentation.source),
    };
  }

  return (
    <div data-testid="presentation-gallery" style={{ minHeight: "100vh", background: GC.bg, color: "#e5e7eb", fontFamily: FONT }}>
      <div style={{ padding: "14px 16px 6px" }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.1em" }}>英雄戰鬥演出模板 v1</div>
        <div data-testid="gallery-disclaimer" style={{ fontSize: 11, color: GC.gray, marginTop: 4, lineHeight: 1.6 }}>
          {PRESENTATION_DISCLAIMER}
        </div>
        <div style={{ fontSize: 10.5, color: GC.gray, marginTop: 2, fontFamily: MONO }}>
          quality={quality}　池容量 halo/bar/bolt/guard = {caps.halo}/{caps.bar}/{caps.bolt}/{caps.guard}
        </div>
      </div>

      {/* 3D：八個模板 ＋ fallback 同時演出（固定 fixture，不靠隨機事件）
          右上角掛的是**正式的** HeroSkillCallout（不傳 prop ⇒ 走 store 那條 production 路徑），
          輸入是上面那份固定 snapshot ⇒ 驗得到真元件，又不必等隨機事件發生。 */}
      <div data-testid="gallery-canvas" style={{ position: "relative", height: 300, borderTop: `1px solid ${GC.line}`, borderBottom: `1px solid ${GC.line}` }}>
        <HeroSkillCallout />
        <Canvas orthographic camera={{ position: [0, 60, 42], zoom: 6, near: 1, far: 400 }}
          gl={{ antialias: false }} dpr={1}>
          <ambientLight intensity={1} />
          <HeroSkillEffects frameRef={frameRef} quality={quality} />
        </Canvas>
      </div>

      {/* 模板清單：每一個都指名可驗 */}
      <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {PRESENTATION_ARCHETYPES.map((a) => {
          const heroId = TEMPLATE_DEMO[a];
          const hero = heroById(heroId);
          const theme = getHeroCombatPresentation(heroId).theme;
          return (
            <div key={a} data-testid="template-card" data-archetype={a} data-hero={heroId}
              data-primitives={TEMPLATE_PRIMITIVES[a].join(",")}
              style={{ background: GC.card2, border: `1px solid ${theme.primaryColor}`, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: theme.primaryColor }}>{ARCHETYPE_LABEL[a]}</div>
              <div style={{ fontSize: 9.5, color: GC.gray, fontFamily: MONO }}>{a}</div>
              <div style={{ fontSize: 10.5, color: "#d4d4d8", marginTop: 4 }}>示範：{hero?.zh ?? heroId}</div>
              <div style={{ fontSize: 9, color: GC.gray, marginTop: 2 }}>primitive：{TEMPLATE_PRIMITIVES[a].join(" + ")}</div>
            </div>
          );
        })}
      </div>

      {/* 10 位代表英雄的演出對照表 */}
      <div style={{ padding: "4px 12px 26px" }}>
        <div style={{ fontSize: 13, fontWeight: 900, margin: "8px 0 6px" }}>10 位代表英雄・技能演出對照</div>
        <div style={{ fontSize: 10, color: "#e0a458", marginBottom: 8 }}>
          ⚠ 這是「若該技能被演出，該長什麼樣」的對照表。引擎目前不模擬 Q/W/E/R，
          實戰畫面只依普攻／爆發兩種引擎事件推導演出，不代表實際施放了該技能。
        </div>
        {heroes.map((id) => {
          const p = getHeroCombatPresentation(id);
          const hero = heroById(id);
          return (
            <div key={id} data-testid="gallery-hero" data-hero={id}
              data-primary={p.theme.primaryColor} data-signature={p.signatureSlot}
              data-tier={p.performanceTier}
              style={{ display: "flex", alignItems: "center", gap: 8, background: GC.card2, borderLeft: `3px solid ${p.theme.primaryColor}`, borderRadius: 8, padding: "6px 8px", marginBottom: 5 }}>
              <HeroPortrait heroId={id} size={30} radius="50%" border={`2px solid ${p.theme.primaryColor}`} alt={hero?.zh ?? id}
                fallback={<div style={{ width: 30, height: 30, borderRadius: "50%", background: p.theme.primaryColor }} />} />
              <div style={{ width: 84, flexShrink: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800 }}>{hero?.zh ?? id}</div>
                <div style={{ fontSize: 8.5, color: GC.gray }}>{hero?.arch} · {hero?.lane}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                {SKILL_SLOTS.map((slot) => (
                  <span key={slot} data-testid="gallery-slot" data-slot={slot}
                    data-archetype={p.skills[slot].archetype}
                    style={{ fontSize: 9, fontWeight: 700, color: "#d4d4d8", background: "rgba(255,255,255,0.05)", border: `1px solid ${slot === p.signatureSlot ? p.theme.primaryColor : GC.line}`, borderRadius: 5, padding: "2px 5px" }}>
                    {slot}·{ARCHETYPE_LABEL[p.skills[slot].archetype]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
