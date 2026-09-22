// ============================================================================
//  battle/ui/items/HeroItemDetail.jsx — 英雄裝備詳情（Item System M3a 樣張；M3c 接進 BattleHeroSheet）
//
//  漸進揭露（M3c）：
//   常駐第一層：英雄＋可用金、6 格背包（點格子看名稱與階級）、下一件（還差多少）、教練重點 2 條
//   分段控制（一次只開一層，再點一次收起）：
//     出裝路徑   出裝路徑鏈＋下一件的多層合成樹
//     屬性與特效 戰鬥屬性（只列非 0）＋裝備特效＋目前狀態
//     戰術分析   全部教練分析
//  版型：panel＝桌機 360px 面板；sheet＝手機 bottom sheet；embedded＝放進既有面板（BattleHeroSheet）內，不另畫外框。
//  資料：view＝selectPlayerItemsView、hud＝selectHudItems()[seat]、analysis＝coachAnalysis、effects＝selectActiveEffects。
//  ⚠ 屬性數值直接讀 view.stats；百分比欄位只做「×100 取整」的顯示格式。
//  相容：M3a 樣張頁的 expanded（⇒ 預設開「出裝路徑」）與 notes（沒有 analysis 時退回教練筆記）。
// ============================================================================
import React, { useState } from "react";
import HeroPortrait from "../../../ui/HeroPortrait.jsx";
import { ActiveEffects } from "./ActiveEffects.jsx";
import { BuildPathTrack } from "./BuildPathTrack.jsx";
import { CoachAnalysis } from "./CoachAnalysis.jsx";
import { CoachNote } from "./CoachNote.jsx";
import { GoldChip } from "./GoldChip.jsx";
import { ItemIcon } from "./ItemGlyphs.jsx";
import { InventoryBar } from "./ItemSlot.jsx";
import { NextItemCard } from "./NextItemCard.jsx";
import { RecipeTree } from "./RecipeTree.jsx";
import { itemInfo } from "../../moba/itemInfo.js";
import { COACH_TEXT, GOLD, GOLD_TEXT, ITEM_FONT, NUM, SIDE_TINT, SURFACE, TEXT, TIER_LABEL, alpha, cornerCut } from "./itemsTheme.js";

export const STAT_ROWS = Object.freeze([
  ["hp", "生命", "stat:hp", false], ["ad", "攻擊", "stat:ad", false], ["ap", "法強", "stat:ap", false],
  ["armor", "護甲", "stat:armor", false], ["mr", "魔抗", "stat:mr", false],
  ["attackSpeed", "攻速", "stat:attackSpeed", true], ["critChance", "暴擊", "stat:critChance", true],
  ["armorPenFlat", "護甲穿透", "stat:ad", false], ["armorPenPct", "護甲穿透", "stat:ad", true],
  ["magicPenFlat", "魔法穿透", "stat:ap", false], ["magicPenPct", "魔法穿透", "stat:ap", true],
  ["lifesteal", "吸血", "stat:lifesteal", true], ["omnivamp", "全能吸血", "stat:lifesteal", true],
  ["abilityHaste", "技能急速", "stat:abilityHaste", false], ["moveSpeed", "移速", "stat:moveSpeed", true],
  ["healShieldPower", "治療強度", "stat:healShieldPower", true],
]);

const LAYERS = Object.freeze([["path", "出裝路徑"], ["stats", "屬性與特效"], ["analysis", "戰術分析"]]);

const STAT_META = Object.freeze(Object.fromEntries(STAT_ROWS.map(([k, label, , pct]) => [k, { label, pct }])));
const shownStat = (k, v) => (STAT_META[k]?.pct ? `${Math.round(v * 100)}%` : String(v));

/**
 * 單件裝備資訊卡（Battle UX hotfix）：名稱、階級、價格、主要屬性、特效摘要。
 * 資料只來自 `itemInfo()` selector（catalog 靜態值），桌面 hover／點選與手機點格子共用。
 * `compact`：只列前 4 項屬性、特效只給標籤（給浮動提示用）。
 */
export function ItemInfoCard({ itemId, compact = false }) {
  const info = itemInfo(itemId);
  if (!info) return null;
  const stats = compact ? info.stats.slice(0, 4) : info.stats;
  return (
    <div data-item-info={info.itemId} style={{ display: "grid", gap: 6, fontFamily: ITEM_FONT, color: TEXT.primary }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: compact ? 13 : 14 }}>{info.name}</strong>
        <Chip tint={info.tier === "T3" ? GOLD_TEXT : undefined}>{TIER_LABEL[info.tier]}</Chip>
        <span style={{ marginLeft: "auto", color: GOLD_TEXT, fontSize: 12, ...NUM }}>{info.price.toLocaleString("en-US")}</span>
      </div>
      {stats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {stats.map(([k, v]) => (
            <span key={k} data-item-stat={k} style={{ fontSize: 11, color: TEXT.secondary, padding: "2px 7px", clipPath: cornerCut(4), background: SURFACE.raised, whiteSpace: "nowrap" }}>
              {STAT_META[k]?.label ?? k} <b style={{ color: TEXT.primary, ...NUM }}>+{shownStat(k, v)}</b>
            </span>
          ))}
        </div>
      )}
      {info.effects.map((e) => (
        <div key={e.type} data-item-effect={e.type} style={{ fontSize: 11.5, color: COACH_TEXT }}>
          ◆ {e.label}{!compact && e.hint ? <span style={{ color: TEXT.secondary }}>　{e.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}

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
      {rows.map(([k, label, glyph, pct]) => {
        const shown = pct ? `${Math.round(stats[k] * 100)}%` : String(stats[k]);
        return (
          <div key={k} data-stat-key={k} data-stat-shown={shown} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", clipPath: cornerCut(6), background: SURFACE.raised, minWidth: 0 }}>
            <span style={{ color: TEXT.secondary }}><ItemIcon glyph={glyph} size={15} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 10.5, color: TEXT.faint, whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ display: "block", fontSize: 15, color: TEXT.primary, ...NUM, lineHeight: 1.15 }}>{shown}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function HeroItemDetail({
  view, hud, analysis = null, effects = null, notes = null, heroId, heroName,
  layout = "panel", expanded = false, initialLayer = null, ts = null,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [layer, setLayer] = useState(initialLayer ?? (expanded ? "path" : null));
  if (!view) return null;
  const sheet = layout === "sheet";
  const embedded = layout === "embedded";
  const sideTint = SIDE_TINT[view.side];
  const picked = selectedIndex != null ? view.slots[selectedIndex] : null;
  const hasAnalysis = Array.isArray(analysis) && analysis.length > 0;

  const frame = embedded
    ? { width: "100%", boxSizing: "border-box", fontFamily: ITEM_FONT, color: TEXT.primary }
    : {
      width: sheet ? "100%" : 360, maxWidth: "100%", boxSizing: "border-box", fontFamily: ITEM_FONT, color: TEXT.primary,
      background: `linear-gradient(180deg, ${SURFACE.panelTop}, ${SURFACE.panel} 38%)`,
      clipPath: sheet ? "none" : cornerCut(18), borderRadius: sheet ? "18px 18px 0 0" : 0,
      boxShadow: `inset 0 3px 0 ${sideTint}`,
      padding: sheet ? "8px 12px calc(16px + env(safe-area-inset-bottom))" : "16px 16px 14px",
    };

  return (
    <section data-hero-item-detail={layout} data-player-id={view.playerId} data-items-ts={ts ?? undefined}
      aria-label={`${heroName}的裝備`} style={frame}>
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
      <div aria-live="polite" data-picked-slot={picked ? picked.itemId ?? "" : undefined}
        style={{ minHeight: 22, marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
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

      {/* Battle UX hotfix：點格子除了名稱，也看得到價格／主要屬性／特效。 */}
      {picked?.itemId && <div style={{ marginTop: 6, padding: "8px 10px", clipPath: cornerCut(8), background: SURFACE.raised }}><ItemInfoCard itemId={picked.itemId} /></div>}

      <SectionTitle>下一件</SectionTitle>
      <NextItemCard nextItem={view.nextItem} hud={hud} buildComplete={view.buildComplete} />

      {/*  開著「戰術分析」層時不重複顯示教練重點（分析只有 1–2 條時，兩塊會一字不差地重複；M3c 截圖抓到） */}
      {layer !== "analysis" && (
        <div style={{ marginTop: 10 }}>
          {hasAnalysis ? <CoachAnalysis rows={analysis} limit={2} title="教練重點" /> : notes?.length > 0 && <CoachNote notes={notes} />}
        </div>
      )}

      <div role="tablist" aria-label="更多裝備資訊" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {LAYERS.map(([id, label]) => {
          const on = layer === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} data-touch data-detail-layer-tab={id}
              onClick={() => setLayer(on ? null : id)}
              style={{
                minHeight: 44, padding: "0 4px", border: 0, cursor: "pointer", fontFamily: ITEM_FONT, fontSize: 12.5, fontWeight: 800,
                color: on ? GOLD_TEXT : TEXT.primary, clipPath: cornerCut(8),
                background: on ? alpha(GOLD, 0.16) : SURFACE.raised,
                boxShadow: on ? `inset 0 -2px 0 ${GOLD}, inset 0 0 0 1px ${alpha(GOLD, 0.35)}` : `inset 0 0 0 1px ${SURFACE.line2}`,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {layer === "path" && (
        <div role="tabpanel" data-detail-layer="path">
          <SectionTitle>出裝路徑</SectionTitle>
          <BuildPathTrack buildPath={view.buildPath} />
          <SectionTitle>下一件合成樹</SectionTitle>
          {view.nextItem?.recipe
            ? <RecipeTree recipe={view.nextItem.recipe} />
            : <div style={{ fontSize: 12.5, color: TEXT.faint }}>{view.buildComplete ? "六件出裝已完成，沒有下一件。" : "目前沒有計畫中的下一件。"}</div>}
        </div>
      )}
      {layer === "stats" && (
        <div role="tabpanel" data-detail-layer="stats">
          <SectionTitle>戰鬥屬性</SectionTitle>
          <StatGrid stats={view.stats} />
          <SectionTitle>裝備特效與目前狀態</SectionTitle>
          <ActiveEffects data={effects} />
        </div>
      )}
      {layer === "analysis" && (
        <div role="tabpanel" data-detail-layer="analysis" style={{ marginTop: 12 }}>
          {hasAnalysis
            ? <CoachAnalysis rows={analysis} title="教練戰術分析" />
            : notes?.length > 0 ? <CoachNote notes={notes} /> : <div style={{ fontSize: 12.5, color: TEXT.faint }}>目前沒有新的判斷。</div>}
        </div>
      )}
    </section>
  );
}
