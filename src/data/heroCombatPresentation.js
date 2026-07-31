// ============================================================================
//  data/heroCombatPresentation.js — Hero Combat Presentation Contract v1
//                                    （Milestone L）
//
//  這一份描述「英雄在戰鬥畫面上長什麼樣、放技能時該播哪個演出模板」。
//  它**只描述呈現**：沒有傷害、沒有冷卻、沒有命中率、沒有勝率，一個數值都不准進來。
//
//  ── 三層責任邊界（本輪最重要的一件事）────────────────────────────────────
//    LogicEngine        決定發生了什麼（誰打誰、傷害、勝負）。本輪一行未改。
//    本檔               決定那件事**看起來**像什麼（顏色、形狀、演出模板）。
//    heroPresentationAdapter  把兩者接起來，且**不修改原始 event**。
//
//  ── ⚠ 引擎沒有 Q/W/E/R（Milestone L Audit 實測結論）───────────────────────
//    引擎 fx 的 `ability` 欄位實測只有這幾種值：
//      `{role}:basic`（top/jungle/mid/adc/sup）、`{role}:power`、`tower:basic`、
//      `neutral:basic` / `neutral:defeated`、`boss:dragon` / `boss:baron`、
//      `buff:redBuff` / `buff:blueBuff`、以及 null。
//    **沒有任何一個欄位代表「這隻英雄放了 Q」。** 所以：
//      · 戰鬥畫面上的演出一律由 `basicAttack`（basic）與 `signatureSlot`（power）
//        推導，UI 只會說「這是什麼**演出分類**」，不會說「他放了 Q」。
//      · 下面 skills 的 P/Q/W/E/R 是**技能演出對照表**——描述「若這個技能被演出，
//        該長什麼樣」，供演出畫廊、未來引擎擴充與 Codex 使用。
//        它**不代表本場真的施放過該技能**。
//    這條界線由 tools/check_hero_presentation_l.mjs 與 UI 文案共同把關。
//
//  ── 與既有 heroArchetypes.js 的關係（不建立第二套英雄資料）────────────────
//    `battle/moba/presentation/heroArchetypes.js`（H.3/H.4）已經是英雄的
//    **3D 剪影與主色**來源。本檔**不重新定義顏色**，而是 `heroVisualFor()` 讀出來，
//    只補上「技能演出語彙」這一層 ⇒ 同一隻英雄在模型與特效上永遠是同一組色。
// ============================================================================
import { CHAMPIONS_100, heroById } from "./heroDatabase.js";
import { heroVisualFor } from "../battle/moba/presentation/heroArchetypes.js";

export const HERO_PRESENTATION_CONTRACT_VERSION = "HeroCombatPresentation.v1";

/** 八個共用視覺模板。renderer 只認得這八個字，不認得英雄。 */
export const PRESENTATION_ARCHETYPES = Object.freeze([
  "projectile", "line", "area", "dash", "shield", "heal", "control", "ultimate",
]);
/** 演出的「材質語彙」。決定粒子色調與衝擊形狀的細節，不決定傷害類型。 */
export const PRESENTATION_EFFECTS = Object.freeze([
  "physical", "fire", "frost", "thunder", "earth", "shadow", "holy", "arcane", "wind",
]);
/** 演出音量：這一下該多大聲。 */
export const PRESENTATION_EMPHASIS = Object.freeze(["passive", "normal", "signature", "ultimate"]);
/** 音效輪廓（本輪不含實際音檔，只先定義分類，避免日後各處自己取名）。 */
export const AUDIO_PROFILES = Object.freeze(["heavy", "blade", "arcane", "fire", "ice", "thunder", "earth", "wing"]);
/** 相機強調程度。ultimate 才允許 punch 以上，且不得遮住戰場。 */
export const CAMERA_EMPHASIS = Object.freeze(["none", "subtle", "punch"]);
/** 效能分級：手機 preset 會依這個降規格。 */
export const PERFORMANCE_TIERS = Object.freeze(["light", "standard", "heavy"]);

export const SKILL_SLOTS = Object.freeze(["P", "Q", "W", "E", "R"]);

//  L Hotfix 1 §4：六職業的 shape language 由 combatClass 決定（形狀／速度／軌跡／
//  貼地方式／出現消失節奏），**不是只換顏色**。這裡只做「英雄 → 職業」的對應，
//  真正的視覺參數在 HeroSkillEffects.CLASS_STYLE。唯一來源是 heroDatabase 的 arch。
export const COMBAT_CLASSES = Object.freeze(["tank", "fighter", "assassin", "mage", "marksman", "support"]);
const ARCH_TO_CLASS = Object.freeze({
  坦克: "tank", 戰士: "fighter", 刺客: "assassin", 法師: "mage", 射手: "marksman", 輔助: "support",
});
export const combatClassOf = (heroId) => ARCH_TO_CLASS[heroById(heroId)?.arch] ?? "fighter";

/** 演出分類的中文文案。⚠ 一律是「演出」，不是「技能」——這是誠實邊界。 */
export const ARCHETYPE_LABEL = Object.freeze({
  projectile: "彈道演出", line: "貫穿演出", area: "範圍演出", dash: "突進演出",
  shield: "護盾演出", heal: "回復演出", control: "控制演出", ultimate: "大招演出",
});
/** 這串會直接出現在 UI，講清楚它是什麼、不是什麼。 */
export const PRESENTATION_DISCLAIMER =
  "以下為技能演出分類，依英雄風格對應共用模板，不代表引擎實際施放了該技能。";

//  ── 展示資料：10 位代表英雄 ────────────────────────────────────────────────
//  選這 10 位的理由（報告 §3 有完整說明）：
//    · 上/打/中/射/輔 各 2 位，剛好每路兩種不同風格；
//    · 這 10 位**已經**在 heroArchetypes.HERO_VISUALS 有 3D 剪影與主色 ⇒
//      本輪不必新增第二套視覺身分，只是把「技能演出」接到同一組色上；
//    · Hero Database 的 P/Q/W/E/R 技能描述都足夠具體，撐得起明確的視覺語彙。
//  每一筆 `effect` / `archetype` 都對得回英雄技能敘述裡寫明的東西。
const RAW = {
  // ── 上路 ──────────────────────────────────────────────────────────────
  ironclad: {                       // 鋼鐵衛士｜坦克：護盾層疊 + 範圍控場
    shapeLanguage: "bulwark", symbol: "shield",
    audioProfile: "heavy", cameraEmphasis: "punch", performanceTier: "standard",
    signatureSlot: "R",
    basicAttack: { archetype: "line", effect: "physical" },
    skills: {
      P: { archetype: "shield", effect: "holy", emphasis: "passive", label: "鑄鐵護層" },
      Q: { archetype: "dash", effect: "physical", emphasis: "normal" },
      W: { archetype: "control", effect: "holy", emphasis: "signature" },
      E: { archetype: "line", effect: "holy", emphasis: "normal" },
      R: { archetype: "area", effect: "holy", emphasis: "ultimate" },
    },
  },
  cinderfist: {                     // 炎拳｜戰士：蓄力爆發 + 燃燒引爆
    shapeLanguage: "bruiser", symbol: "fist",
    audioProfile: "fire", cameraEmphasis: "punch", performanceTier: "standard",
    signatureSlot: "Q",
    basicAttack: { archetype: "line", effect: "fire" },
    skills: {
      P: { archetype: "area", effect: "fire", emphasis: "passive", label: "燃燒烙印" },
      Q: { archetype: "area", effect: "fire", emphasis: "signature" },
      W: { archetype: "shield", effect: "fire", emphasis: "normal" },
      E: { archetype: "dash", effect: "fire", emphasis: "normal" },
      R: { archetype: "ultimate", effect: "fire", emphasis: "ultimate" },
    },
  },
  // ── 打野 ──────────────────────────────────────────────────────────────
  duskblade: {                      // 暮刃｜刺客：沉默切入 + 分身收割
    shapeLanguage: "rogue", symbol: "blades",
    audioProfile: "blade", cameraEmphasis: "subtle", performanceTier: "light",
    signatureSlot: "E",
    basicAttack: { archetype: "line", effect: "shadow" },
    skills: {
      P: { archetype: "line", effect: "shadow", emphasis: "passive", label: "暮光連擊" },
      Q: { archetype: "line", effect: "shadow", emphasis: "normal" },
      W: { archetype: "control", effect: "shadow", emphasis: "signature" },
      E: { archetype: "dash", effect: "shadow", emphasis: "signature" },
      R: { archetype: "ultimate", effect: "shadow", emphasis: "ultimate" },
    },
  },
  chichuan: {                       // 赤炎武神｜戰士打野：衝鋒引爆 + 化身
    shapeLanguage: "striker", symbol: "fist",
    audioProfile: "fire", cameraEmphasis: "punch", performanceTier: "standard",
    signatureSlot: "E",
    basicAttack: { archetype: "line", effect: "fire" },
    skills: {
      P: { archetype: "area", effect: "fire", emphasis: "passive", label: "赤炎燃燒" },
      Q: { archetype: "line", effect: "fire", emphasis: "normal" },
      W: { archetype: "shield", effect: "fire", emphasis: "normal" },
      E: { archetype: "dash", effect: "fire", emphasis: "signature" },
      R: { archetype: "ultimate", effect: "fire", emphasis: "ultimate" },
    },
  },
  // ── 中路 ──────────────────────────────────────────────────────────────
  bingshuang: {                     // 冰霜術士｜法師：彈道消耗 + 全域凍結
    shapeLanguage: "crystal", symbol: "focus",
    audioProfile: "ice", cameraEmphasis: "punch", performanceTier: "standard",
    signatureSlot: "R",
    basicAttack: { archetype: "projectile", effect: "frost" },
    skills: {
      P: { archetype: "control", effect: "frost", emphasis: "passive", label: "冰霜積累" },
      Q: { archetype: "projectile", effect: "frost", emphasis: "normal" },
      W: { archetype: "shield", effect: "frost", emphasis: "signature" },
      E: { archetype: "area", effect: "frost", emphasis: "normal" },
      R: { archetype: "area", effect: "frost", emphasis: "ultimate" },
    },
  },
  lieyan: {                         // 烈焰先知｜法師：延遲引爆 + 地牆封路
    shapeLanguage: "flame", symbol: "flame",
    audioProfile: "fire", cameraEmphasis: "punch", performanceTier: "heavy",
    signatureSlot: "R",
    basicAttack: { archetype: "projectile", effect: "fire" },
    skills: {
      P: { archetype: "area", effect: "arcane", emphasis: "passive", label: "先知之眼" },
      Q: { archetype: "area", effect: "fire", emphasis: "signature" },
      W: { archetype: "shield", effect: "fire", emphasis: "normal" },
      E: { archetype: "line", effect: "fire", emphasis: "normal" },
      R: { archetype: "ultimate", effect: "fire", emphasis: "ultimate" },
    },
  },
  // ── 射手 ──────────────────────────────────────────────────────────────
  leiting: {                        // 雷霆神射｜射手：穿甲直線 + 落雷覆蓋
    shapeLanguage: "ranger", symbol: "launcher",
    audioProfile: "thunder", cameraEmphasis: "subtle", performanceTier: "light",
    signatureSlot: "Q",
    basicAttack: { archetype: "projectile", effect: "thunder" },
    skills: {
      P: { archetype: "projectile", effect: "thunder", emphasis: "passive", label: "雷霆積累" },
      Q: { archetype: "line", effect: "thunder", emphasis: "signature" },
      W: { archetype: "shield", effect: "thunder", emphasis: "normal" },
      E: { archetype: "dash", effect: "thunder", emphasis: "normal" },
      R: { archetype: "area", effect: "thunder", emphasis: "ultimate" },
    },
  },
  yanfeng: {                        // 炎鳳射手｜射手：飛躍走位 + 火雨壓制
    shapeLanguage: "wing", symbol: "launcher",
    audioProfile: "wing", cameraEmphasis: "subtle", performanceTier: "standard",
    signatureSlot: "E",
    basicAttack: { archetype: "projectile", effect: "fire" },
    skills: {
      P: { archetype: "heal", effect: "fire", emphasis: "passive", label: "炎鳳羽翼" },
      Q: { archetype: "projectile", effect: "fire", emphasis: "normal" },
      W: { archetype: "dash", effect: "wind", emphasis: "normal" },
      E: { archetype: "area", effect: "fire", emphasis: "signature" },
      R: { archetype: "ultimate", effect: "fire", emphasis: "ultimate" },
    },
  },
  // ── 輔助 ──────────────────────────────────────────────────────────────
  dadi: {                           // 大地守衛｜開團型輔助：擊飛 + 群體護甲
    shapeLanguage: "sentinel", symbol: "shield",
    audioProfile: "earth", cameraEmphasis: "punch", performanceTier: "standard",
    signatureSlot: "Q",
    basicAttack: { archetype: "line", effect: "earth" },
    skills: {
      P: { archetype: "shield", effect: "earth", emphasis: "passive", label: "大地之力" },
      Q: { archetype: "line", effect: "earth", emphasis: "signature" },
      W: { archetype: "shield", effect: "earth", emphasis: "normal" },
      E: { archetype: "control", effect: "earth", emphasis: "normal" },
      R: { archetype: "ultimate", effect: "earth", emphasis: "ultimate" },
    },
  },
  stoneguard: {                     // 石衛｜反制型輔助：單體硬控 + 擋投射物
    shapeLanguage: "obelisk", symbol: "shield",
    audioProfile: "heavy", cameraEmphasis: "punch", performanceTier: "light",
    signatureSlot: "W",
    basicAttack: { archetype: "line", effect: "earth" },
    skills: {
      P: { archetype: "shield", effect: "earth", emphasis: "passive", label: "岩石之皮" },
      Q: { archetype: "control", effect: "earth", emphasis: "normal" },
      W: { archetype: "projectile", effect: "earth", emphasis: "signature" },
      E: { archetype: "shield", effect: "earth", emphasis: "normal" },
      R: { archetype: "area", effect: "earth", emphasis: "ultimate" },
    },
  },
};

//  角色 → fallback 演出（沒有專屬設定的 90 位英雄走這條，畫面不會空白）。
//  依 Hero Database 的 arch 決定，是**穩定的**推導，不是亂數。
const ARCH_FALLBACK = Object.freeze({
  坦克: { basic: "line", signature: "control", effect: "earth", audio: "heavy", tier: "light", symbol: "shield", shape: "bulwark" },
  戰士: { basic: "line", signature: "dash", effect: "physical", audio: "blade", tier: "light", symbol: "fist", shape: "bruiser" },
  刺客: { basic: "line", signature: "dash", effect: "shadow", audio: "blade", tier: "light", symbol: "blades", shape: "rogue" },
  法師: { basic: "projectile", signature: "area", effect: "arcane", audio: "arcane", tier: "standard", symbol: "focus", shape: "crystal" },
  射手: { basic: "projectile", signature: "line", effect: "physical", audio: "blade", tier: "light", symbol: "launcher", shape: "ranger" },
  輔助: { basic: "line", signature: "shield", effect: "holy", audio: "arcane", tier: "light", symbol: "focus", shape: "sentinel" },
});
const DEFAULT_FALLBACK = ARCH_FALLBACK["戰士"];

const hex = (n) => `#${Number(n ?? 0).toString(16).padStart(6, "0")}`;

/** 顏色只有一個來源：heroArchetypes 的英雄視覺（模型與特效因此永遠同色）。 */
function themeFor(heroId, spec) {
  const hero = heroById(heroId);
  const visual = heroVisualFor(heroId, null, hero);
  const fb = ARCH_FALLBACK[hero?.arch] ?? DEFAULT_FALLBACK;
  return Object.freeze({
    primaryColor: hex(visual.primary),
    secondaryColor: hex(visual.secondary),
    accentColor: hex(visual.accent),
    symbol: spec?.symbol ?? visual.badge ?? fb.symbol,
    shapeLanguage: spec?.shapeLanguage ?? visual.silhouette ?? fb.shape,
  });
}

const freezeSkill = (s) => Object.freeze({
  archetype: s.archetype, effect: s.effect, emphasis: s.emphasis,
  label: s.label ?? null,
});

const build = (heroId, spec) => Object.freeze({
  heroId,
  source: "authored",
  combatClass: combatClassOf(heroId),
  theme: themeFor(heroId, spec),
  basicAttack: Object.freeze({ ...spec.basicAttack }),
  signatureSlot: spec.signatureSlot,
  skills: Object.freeze(Object.fromEntries(SKILL_SLOTS.map((k) => [k, freezeSkill(spec.skills[k])]))),
  audioProfile: spec.audioProfile,
  cameraEmphasis: spec.cameraEmphasis,
  performanceTier: spec.performanceTier,
});

const PRESENTATIONS = Object.freeze(
  Object.fromEntries(Object.entries(RAW).map(([id, spec]) => [id, build(id, spec)])),
);

const own = (id) => (typeof id === "string" && Object.prototype.hasOwnProperty.call(PRESENTATIONS, id));

/**
 * 沒有專屬設定的英雄 ⇒ 依 Hero Database 的定位推導穩定 fallback。
 * 完全決定性（同 heroId 永遠同結果），不使用亂數、不看時間。
 */
export function getFallbackHeroPresentation(heroId) {
  const id = typeof heroId === "string" && heroId ? heroId : "unknown";
  const hero = heroById(id);
  const fb = ARCH_FALLBACK[hero?.arch] ?? DEFAULT_FALLBACK;
  const skill = (archetype, emphasis) => Object.freeze({ archetype, effect: fb.effect, emphasis, label: null });
  return Object.freeze({
    heroId: id,
    source: "fallback",
    combatClass: combatClassOf(id),
    theme: themeFor(id, { symbol: fb.symbol, shapeLanguage: fb.shape }),
    basicAttack: Object.freeze({ archetype: fb.basic, effect: fb.effect }),
    signatureSlot: "R",
    skills: Object.freeze({
      P: skill(fb.signature, "passive"),
      Q: skill(fb.basic, "normal"),
      W: skill(fb.signature, "normal"),
      E: skill(fb.signature, "normal"),
      R: skill("ultimate", "ultimate"),
    }),
    audioProfile: fb.audio,
    cameraEmphasis: "subtle",
    performanceTier: fb.tier,
  });
}

//  fallback 也要**參考穩定**（同一個 id 拿到同一個物件），否則 React 會每幀當成新資料。
const fallbackCache = new Map();
const cachedFallback = (id) => {
  const key = typeof id === "string" ? id : "";
  if (!fallbackCache.has(key)) fallbackCache.set(key, getFallbackHeroPresentation(key));
  return fallbackCache.get(key);
};

/** 取得英雄完整戰鬥呈現。找不到 ⇒ 穩定 fallback，不 throw、不回 null。 */
export function getHeroCombatPresentation(heroId) {
  return own(heroId) ? PRESENTATIONS[heroId] : cachedFallback(heroId);
}

/** 取得單一技能槽的演出。slot 不合法 ⇒ 退回該英雄的 signature 槽。 */
export function getHeroSkillPresentation(heroId, slot) {
  const p = getHeroCombatPresentation(heroId);
  const key = SKILL_SLOTS.includes(slot) ? slot : p.signatureSlot;
  return p.skills[key] ?? p.skills.R;
}

/** 取得英雄主題色與形狀語彙。 */
export const getHeroPresentationTheme = (heroId) => getHeroCombatPresentation(heroId).theme;

/** 有專屬設定（非 fallback）的英雄 id，穩定排序。 */
export const listPresentationHeroIds = () => Object.freeze(Object.keys(PRESENTATIONS).slice().sort());
export const hasAuthoredPresentation = (heroId) => own(heroId);

//  禁止欄位：呈現層不得存任何平衡數值。verifier 會遞迴掃描整棵資料。
export const FORBIDDEN_PRESENTATION_KEYS = Object.freeze([
  "damage", "dmg", "cooldown", "cd", "winrate", "winRate", "accuracy", "hitRate",
  "hp", "ad", "ap", "armor", "mr", "ratio", "range", "ms", "gold", "xp",
]);

/**
 * 資料完整性驗證（verifier 與 dev 用）。
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateHeroCombatPresentation() {
  const errors = [];
  const known = new Set(CHAMPIONS_100.map((c) => c.id));
  const scan = (node, path) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (FORBIDDEN_PRESENTATION_KEYS.includes(k)) errors.push(`${path}.${k}：呈現層不得含平衡數值`);
      if (typeof v === "number" && k !== "primaryColor") { /* 顏色是字串；其餘數字一律可疑 */
        errors.push(`${path}.${k}：呈現層出現裸數值（${v}）`);
      }
      if (v && typeof v === "object") scan(v, `${path}.${k}`);
    }
  };
  for (const heroId of Object.keys(PRESENTATIONS)) {
    const p = PRESENTATIONS[heroId];
    if (!known.has(heroId)) errors.push(`${heroId}：不是 heroDatabase 裡的英雄`);
    if (p.heroId !== heroId) errors.push(`${heroId}：heroId 欄位與 key 不一致`);
    if (!PRESENTATION_ARCHETYPES.includes(p.basicAttack.archetype)) errors.push(`${heroId}.basicAttack.archetype 不合法`);
    if (!PRESENTATION_EFFECTS.includes(p.basicAttack.effect)) errors.push(`${heroId}.basicAttack.effect 不合法`);
    if (!SKILL_SLOTS.includes(p.signatureSlot)) errors.push(`${heroId}.signatureSlot 不合法`);
    if (!AUDIO_PROFILES.includes(p.audioProfile)) errors.push(`${heroId}.audioProfile 不合法`);
    if (!CAMERA_EMPHASIS.includes(p.cameraEmphasis)) errors.push(`${heroId}.cameraEmphasis 不合法`);
    if (!PERFORMANCE_TIERS.includes(p.performanceTier)) errors.push(`${heroId}.performanceTier 不合法`);
    if (!/^#[0-9a-f]{6}$/i.test(p.theme.primaryColor)) errors.push(`${heroId}.theme.primaryColor 不是色碼`);
    if (!/^#[0-9a-f]{6}$/i.test(p.theme.secondaryColor)) errors.push(`${heroId}.theme.secondaryColor 不是色碼`);
    if (!p.theme.symbol || !p.theme.shapeLanguage) errors.push(`${heroId}.theme 缺 symbol / shapeLanguage`);
    for (const slot of SKILL_SLOTS) {
      const s = p.skills[slot];
      const at = `${heroId}.skills.${slot}`;
      if (!s) { errors.push(`${at}：缺少`); continue; }
      if (!PRESENTATION_ARCHETYPES.includes(s.archetype)) errors.push(`${at}.archetype「${s.archetype}」不合法`);
      if (!PRESENTATION_EFFECTS.includes(s.effect)) errors.push(`${at}.effect「${s.effect}」不合法`);
      if (!PRESENTATION_EMPHASIS.includes(s.emphasis)) errors.push(`${at}.emphasis「${s.emphasis}」不合法`);
      if (s.label != null && typeof s.label !== "string") errors.push(`${at}.label 型別錯誤`);
    }
    if (p.skills.R.emphasis !== "ultimate") errors.push(`${heroId}.skills.R.emphasis 應為 ultimate`);
    scan(p, heroId);
  }
  //  八個模板每一個都必須至少被用到一次，否則等於有模板沒人驗得到。
  const used = new Set();
  for (const p of Object.values(PRESENTATIONS)) {
    used.add(p.basicAttack.archetype);
    for (const slot of SKILL_SLOTS) used.add(p.skills[slot].archetype);
  }
  for (const a of PRESENTATION_ARCHETYPES) if (!used.has(a)) errors.push(`模板「${a}」沒有任何英雄使用`);
  return { ok: errors.length === 0, errors };
}
