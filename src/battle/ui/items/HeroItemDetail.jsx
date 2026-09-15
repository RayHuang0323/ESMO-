// ============================================================================
//  battle/ui/items/HeroItemDetail.jsx — 英雄裝備詳情（Item System M3a 樣張；M3c 接進 BattleHeroSheet）
//
//  漸進揭露：
//   第一層（常駐）：英雄＋可用金、6 格背包（點格子看名稱）、下一件、教練筆記
//   第二層（「看完整出裝」）：出裝路徑、戰鬥屬性（只列非 0）、戰鬥狀態
//  版型：panel＝桌機 360px 面板；sheet＝手機全寬 bottom sheet。
//  資料：view＝selectPlayerItemsView、hud＝selectHudItems()[seat]、notes＝coachNotes(view)。
//  ⚠ 屬性數值直接讀 view.stats；百分比欄位只做「×100 取整」的顯示格式。
// ============================================================================
import React, { useState } from "react";
import HeroPortrait from "../../../ui/HeroPortrait.jsx";
import { BuildPathTrack } from "./BuildPathTrack.jsx";
import { CoachNote } from "./CoachNote.jsx";
import { GoldChip } from "./GoldChip.jsx";
import { ChevronIcon, ItemIcon } from "./ItemGlyphs.jsx";
import { InventoryBar } from "./ItemSlot.jsx";
import { NextItemCard } from "./NextItemCard.jsx";
import { COACH_TEXT, GOLD_TEXT, ITEM_FONT, NUM, SIDE_TINT, SURFACE, TEXT, TIER_LABEL, alpha, cornerCut } from "./itemsTheme.js";

const STAT_ROWS = [
  ["hp", "生命", "stat:hp", false], ["ad", "攻擊", "stat:ad", false], ["ap", "法強", "stat:ap", false],
  ["armor", "護甲", "stat:armor", false], ["mr", "魔抗", "stat:mr", false],
  ["attackSpeed", "攻速", "stat:attackSpeed", true], ["critChance", "暴擊", "stat:critChance", true],
  ["armorPenFlat", "護甲穿透", "stat:ad", false], ["armorPenPct", "護甲穿透", "stat:ad", true],
  ["magicPenFlat", "魔法穿透", "stat:ap", false], ["magicPenPct", "魔法穿透", "stat:ap", true],
  ["lifesteal", "吸血", "stat:lifesteal", true], ["omnivamp", "全能吸血", "stat:lifesteal", true],
  ["abilityHaste", "技能急速", "stat:abilityHaste", false], ["moveSpeed", "移速", "stat:moveSpeed", true],
  ["healShieldPower", "治療強度", "stat:healShieldPower", true],
];

function SectionTitle({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px", fontSize: 12, fontWeight: 800, color: TEXT.secondary }}>
      <span aria-hidden="true" style={{ width: 3, height: 12, background: SURFACE.line2 }} />
      {children}
    </div>
  );
}

function Chip({ children, tint }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: tint ?? TEXT.secondary, padding: "2px 8px", borderRadius: 999, boxShadow: `inset 0 0 0 1px ${tint ? alpha(tint, 0.45) : SURFACE.line2}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function StatGrid({ stats }) {
  const rows = STAT_ROWS.filter(([k]) => Number(stats?.[k]) > 0);
  if (!rows.length) return <div style={{ fontSize: 12, color: TEXT.faint }}>還沒有提供屬性的裝備</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
      {rows.map(([k, label, glyph, pct]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", clipPath: cornerCut(6), background: SURFACE.raised }}>
          <span style={{ color: TEXT.secondary }}><ItemIcon glyph={glyph} size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 10.5, color: TEXT.faint, whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ display: "block", fontSize: 15, color: TEXT.primary, ...NUM, lineHeight: 1.15 }}>{pct ? `${Math.round(stats[k] * 100)}%` : stats[k]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function HeroItemDetail({ view, hud, notes, heroId, heroName, expanded = false, onToggle, layout = "panel" }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  if (!view) return null;
  const sheet = layout === "sheet";
  const sideTint = SIDE_TINT[view.side];
  const picked = selectedIndex != null ? view.slots[selectedIndex] : null;
  const status = view.status ?? {};

  return (
    <section data-hero-item-detail={layout} aria-label={`${heroName}的裝備`} style={{
      width: sheet ? "100%" : 360, maxWidth: "100%", boxSizing: "border-box", fontFamily: ITEM_FONT, color: TEXT.primary,
      background: `linear-gradient(180deg, ${SURFACE.panelTop}, ${SURFACE.panel} 38%)`,
      clipPath: sheet ? "none" : cornerCut(18), borderRadius: sheet ? "18px 18px 0 0" : 0,
      boxShadow: `inset 0 3px 0 ${sideTint}`,
      padding: sheet ? "8px 12px calc(16px + env(safe-area-inset-bottom))" : "16px 16px 14px",
    }}>
      {sheet && <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 99, background: SURFACE.line2, margin: "0 auto 12px" }} />}

      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
        <HeroPortrait heroId={heroId} size={44} radius={10} border={`2px solid ${alpha(sideTint, 0.7)}`} alt={heroName} fallback={null} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <Chip>{view.arch}</Chip>
            <Chip tint={COACH_TEXT}>{view.strategyLabel}策略</Chip>
          </div>
        </div>
        <GoldChip amount={view.gold.unspent} size="lg" />
      </div>

      <SectionTitle>身上裝備</SectionTitle>
      <InventoryBar slots={view.slots} size="lg" fluid selectedIndex={selectedIndex}
        onSelect={(i) => setSelectedIndex(i === selectedIndex ? null : i)} />
      <div aria-live="polite" style={{ minHeight: 22, marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        {picked?.itemId ? (
          <>
            <span style={{ fontWeight: 800 }}>{picked.name}</span>
            <Chip tint={picked.tier === "T3" ? GOLD_TEXT : undefined}>{TIER_LABEL[picked.tier]}</Chip>
          </>
        ) : picked ? (
          <span style={{ color: TEXT.faint }}>空格：之後回城會依出裝路徑補上</span>
        ) : (
          <span style={{ color: TEXT.faint }}>點裝備看名稱</span>
        )}
      </div>

      <SectionTitle>下一件</SectionTitle>
      <NextItemCard nextItem={view.nextItem} hud={hud} buildComplete={view.buildComplete} />

      {notes?.length > 0 && <div style={{ marginTop: 10 }}><CoachNote notes={notes} /></div>}

      <button type="button" data-touch onClick={onToggle} aria-expanded={expanded} style={{
        marginTop: 14, width: "100%", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        appearance: "none", border: 0, cursor: "pointer", fontFamily: ITEM_FONT, fontSize: 13, fontWeight: 800, color: TEXT.primary,
        background: SURFACE.raised, boxShadow: `inset 0 0 0 1px ${SURFACE.line2}`, clipPath: cornerCut(10),
      }}>
        {expanded ? "收起完整出裝" : "看完整出裝"}
        <ChevronIcon size={16} up={expanded} />
      </button>

      {expanded && (
        <div data-hero-item-detail-expanded>
          <SectionTitle>出裝路徑</SectionTitle>
          <BuildPathTrack buildPath={view.buildPath} />
          <SectionTitle>戰鬥屬性</SectionTitle>
          <StatGrid stats={view.stats} />
          {(status.grievous > 0 || status.slow > 0 || status.magicShield > 0) && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {status.grievous > 0 && <Chip tint={TEXT.primary}>重傷 {Math.ceil(status.grievous)} 秒</Chip>}
              {status.slow > 0 && <Chip tint={TEXT.primary}>緩速 {Math.ceil(status.slow)} 秒</Chip>}
              {status.magicShield > 0 && <Chip tint={TEXT.primary}>法傷護盾 {status.magicShield}</Chip>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
