// ============================================================================
//  presentation/heroStatusMeta.js — 英雄持續狀態的**唯一**呈現對照表
//
//  feature/moba-spectacle-vision：引擎 snapshot 早就有完整的 `statusEffects`
//  （護盾、減傷、加速、強化、減速、標記、定身、暈眩、擊飛、沉默、嘲諷…），但畫面上
//  幾乎只有「施放那一下」的共用環，HUD 也只認得減速等 4 種、其餘顯示英文 id。
//  這張表把每個狀態分到四個類別，並決定它在英雄身上用哪一種**造型**：
//
//    shield   護盾類  ─ 冷藍：包覆型（多面體護殼／環繞護甲板）
//    buff     增益    ─ 綠／金：往上、往後的動態（上升火星、速度拖尾、頭頂圖示）
//    debuff   減益    ─ 粉紅／紫：貼著腳下或瞄準（冰晶、準星、火焰）
//    control  控制    ─ 橘黃：頭頂最醒目（旋轉星星、禁言、驚嘆號）＋腳下尖刺
//
//  ⚠ 純呈現：只讀 snapshot，不寫任何戰鬥狀態。HUD（BattleHeroStrip／BattleHeroSheet）與
//    3D（HeroStatusFx）都讀這一份，不各自維護一套文案或配色。
// ============================================================================

export const STATUS_CATEGORY = Object.freeze({
  shield: Object.freeze({ zh: "護盾", color: "#60a5fa" }),
  buff: Object.freeze({ zh: "增益", color: "#34d399" }),
  debuff: Object.freeze({ zh: "減益", color: "#f472b6" }),
  control: Object.freeze({ zh: "控制", color: "#f59e0b" }),
});

//  fx：3D 造型（HeroStatusFx 的 pool）；icon：頭頂／HUD 圖示（atlas cell 名）；
//  glyph：HUD 用的文字圖示（不依賴字型的 emoji）；priority：頭頂同時顯示時的排序（大者優先）。
const M = (cat, zh, color, fx, icon, glyph, priority) => Object.freeze({ cat, zh, color, fx, icon, glyph, priority });

export const STATUS_META = Object.freeze({
  shield: M("shield", "護盾", "#60a5fa", "bubble", null, "◈", 40),
  guard: M("shield", "減傷", "#93c5fd", "plates", null, "▣", 38),
  "control-immune": M("buff", "免控", "#fde047", "icon", "immune", "✦", 55),
  haste: M("buff", "加速", "#6ee7b7", "streaks", null, "»", 20),
  "hero-haste": M("buff", "加速", "#6ee7b7", "streaks", null, "»", 20),
  "hero-power": M("buff", "強化", "#fb923c", "embers", null, "▲", 24),
  "empowered-strike": M("buff", "強化普攻", "#fbbf24", "embers", null, "▲", 26),
  "hero-cdr": M("buff", "冷卻縮減", "#38bdf8", "icon", "clock", "◷", 22),
  stealth: M("buff", "隱身", "#c4b5fd", "icon", "stealth", "◌", 30),
  slow: M("debuff", "減速", "#67e8f9", "frost", null, "❄", 34),
  "hero-slow": M("debuff", "減速", "#67e8f9", "frost", null, "❄", 34),
  mark: M("debuff", "標記", "#f43f5e", "icon", "mark", "◎", 48),
  ignite: M("debuff", "點燃", "#f97316", "flames", null, "✹", 36),
  root: M("control", "定身", "#84cc16", "spikes", "root", "⌇", 70),
  stun: M("control", "暈眩", "#facc15", "stars", "stun", "✶", 90),
  knockup: M("control", "擊飛", "#fbbf24", "stars", "stun", "⇡", 92),
  silence: M("control", "沉默", "#a855f7", "icon", "silence", "⊘", 80),
  taunt: M("control", "嘲諷", "#ef4444", "icon", "taunt", "!", 85),
});

const FALLBACK = Object.freeze({ cat: "debuff", zh: null, color: "#f472b6", fx: null, icon: null, glyph: "•", priority: 0 });

/** 狀態 id → 呈現資料（未知 id 仍給一個安全的預設，zh 退回 id 本身）。 */
export function statusMetaOf(id) {
  const meta = STATUS_META[id];
  return meta ?? { ...FALLBACK, zh: String(id) };
}

/** 依優先序排好的狀態（HUD 與頭頂圖示共用同一個順序）。 */
export function sortedStatuses(effects = []) {
  return [...effects]
    .filter((e) => e && e.id && (e.remaining ?? 1) > 0)
    .sort((a, b) => statusMetaOf(b.id).priority - statusMetaOf(a.id).priority || String(a.id).localeCompare(String(b.id)));
}
