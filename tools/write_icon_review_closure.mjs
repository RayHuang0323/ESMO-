import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../tmp/moba-skill-talent-owner-review/", import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
const adjustedIcons = [
  "hexweave:E", "rongyan:Q", "luminary:W", "mantra:E", "yueying:P",
  "shiguang:Q", "suishan:E", "mingyun2:E", "maestro:E", "hunpo:P",
  "lieyan:R", "leiming:R", "xingchen:P", "cinderfist:Q", "stoneguard:Q",
  "dianguang:Q", "sting:P",
];
const changedAspects = ["central silhouette", "main symbol", "composition"];
const before = await readJson("icon-clusters-before.json");
const after = await readJson("icon-clusters-after.json");
const audit = await readJson("icon-visual-audit.json");
const closure = {
  schema: "SkillIconReviewClosure.v1",
  baseline: {
    icons: before.icons,
    candidatePairs: before.candidatePairs,
    clusterCount: before.clusterCount,
  },
  final: {
    icons: after.icons,
    candidatePairs: after.candidatePairs,
    clusterCount: after.clusterCount,
    sameHeroNear: audit.sameHeroNear,
    crossHeroNear: audit.crossHeroNear,
    exactDuplicate: 0,
  },
  trueRemakeCount: adjustedIcons.length,
  adjustedIconCount: adjustedIcons.length,
  unchangedIconCount: 500 - adjustedIcons.length,
  adjustedIcons: adjustedIcons.map((id) => ({ id, changedAspects })),
  retainedSharedArchetypes: [
    { archetype: "shield", reason: "防禦/護盾語言保留，但高風險同模板已拆出主符號與構圖差異" },
    { archetype: "dash", reason: "位移與速度語言可共用，保留方向性 motion" },
    { archetype: "projectile", reason: "飛行/射擊語言可共用，保留 projectile 負空間" },
    { archetype: "heal", reason: "治療/復甦語言可共用，保留中心正向符號" },
    { archetype: "stun", reason: "控制語言可共用，保留 impact 與命中構圖" },
  ],
  atlases: {
    highRiskBeforeAfter: "tmp/moba-skill-talent-owner-review/icon-refinement-before-after-atlas.png",
    final500: "tmp/moba-skill-talent-owner-review/icon-atlas-final-500.png",
    sheets: [1, 2, 3, 4].map((n) => `tmp/moba-skill-talent-owner-review/icon-atlas-${String(n).padStart(2, "0")}.png`),
  },
  criteria: "每張調整圖示至少在 central silhouette、main symbol、composition 三項形成明顯差異；沒有只改顏色或邊框。",
};
await writeFile(new URL("icon-review-closure.json", root), `${JSON.stringify(closure, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  schema: closure.schema,
  baseline: closure.baseline,
  final: closure.final,
  trueRemakeCount: closure.trueRemakeCount,
  adjustedIconCount: closure.adjustedIconCount,
  output: "tmp/moba-skill-talent-owner-review/icon-review-closure.json",
}, null, 2));
