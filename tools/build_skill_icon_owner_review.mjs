import { readFile, writeFile } from 'node:fs/promises';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';

const root = new URL('../', import.meta.url);
const reviewDir = new URL('tmp/moba-skill-talent-owner-review/', root);
const inputUrl = new URL('icon-clusters-after.json', reviewDir);
const outputUrl = new URL('owner-review-ranking.json', reviewDir);

const SLOT_ORDER = ['P', 'Q', 'W', 'E', 'R'];
const TARGET_GROUPS = 40;
const MAX_PER_CLUSTER = 6;
const heroes = new Map(CHAMPIONS_100.map((hero) => [hero.id, hero]));

const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const splitId = (id) => {
  const [heroId, slot] = String(id).split(':');
  return { heroId, slot };
};
const iconSvg = async (heroId, slot) => readFile(
  new URL(`public/assets/skill-icons/v1/${heroId}/${slot.toLowerCase()}.svg`, root),
  'utf8',
);
const sceneCache = new Map();
const sceneOf = async (heroId, slot) => {
  const key = `${heroId}:${slot}`;
  if (!sceneCache.has(key)) {
    const svg = await iconSvg(heroId, slot);
    sceneCache.set(key, svg.match(/data-scene="([^"]+)"/)?.[1] ?? 'unknown');
  }
  return sceneCache.get(key);
};

const keywordFamilies = [
  ['盾', '護', '鎧', '壁', '甲'],
  ['衝', '突', '衝鋒', '衝刺', '疾走', '閃'],
  ['斬', '刃', '劍', '刀', '切'],
  ['拳', '爪', '擊', '打'],
  ['箭', '弓', '射', '彈', '矢'],
  ['火', '炎', '焰', '熔', '燼'],
  ['雷', '電', '霆', '震'],
  ['冰', '霜', '寒'],
  ['鏈', '鎖', '縛', '束'],
  ['光', '聖', '星', '月'],
  ['影', '幻', '夢', '幽'],
  ['爆', '炸', '烈', '轟'],
  ['療', '癒', '生', '治'],
  ['域', '場', '陣', '界'],
  ['審判', '宣判', '裁決'],
];
const keywordFamily = (name) => keywordFamilies.findIndex((family) =>
  family.some((token) => String(name ?? '').includes(token)));

const rankPair = async (pair, cluster) => {
  const left = splitId(pair.a);
  const right = splitId(pair.b);
  const a = heroes.get(left.heroId);
  const b = heroes.get(right.heroId);
  const aSkill = a?.skills?.[left.slot];
  const bSkill = b?.skills?.[right.slot];
  const [sceneA, sceneB] = await Promise.all([
    sceneOf(left.heroId, left.slot),
    sceneOf(right.heroId, right.slot),
  ]);
  const sameScene = sceneA === sceneB && sceneA !== 'unknown';
  const sameSlot = left.slot === right.slot;
  const sameLane = Boolean(a?.lane && a.lane === b?.lane);
  const sameArch = Boolean(a?.arch && a.arch === b?.arch);
  const familyA = keywordFamily(aSkill?.name);
  const familyB = keywordFamily(bSkill?.name);
  const sharedKeyword = familyA >= 0 && familyA === familyB;
  const distance = Number(pair.distance);

  // distance is the existing 16x16 edge-bit audit used for the 999 candidates.
  // The semantic boosts make same archetype / same role collisions review first,
  // while preserving the mathematical distance as the strongest signal.
  const distanceScore = Math.max(0, 36 - distance) * 2;
  const semanticScore = (sameScene ? 14 : 0)
    + (sharedKeyword ? 8 : 0)
    + (sameSlot ? 8 : 0)
    + (sameLane ? 8 : 0)
    + (sameArch ? 6 : 0);
  const riskScore = distanceScore + semanticScore;
  let category = 'C';
  // A is intentionally narrow: the atlas is a review queue, not an automatic
  // redraw list. B keeps the normal shared shield/dash/projectile language in
  // the review without implying that the art is broken.
  if (distance <= 8 && sameScene && (sameSlot || sameLane || sameArch)) category = 'A';
  else if (sameScene && (sameSlot || sameLane || sameArch || sharedKeyword)) category = 'B';

  const reasons = [];
  if (distance <= 12) reasons.push(`HUD 小尺寸輪廓距離 ${distance}`);
  else if (distance <= 20) reasons.push(`HUD 小尺寸輪廓距離 ${distance}`);
  if (sameScene) reasons.push(`中央構圖／motion 同 archetype：${sceneA}`);
  if (sharedKeyword) reasons.push('主符號語意詞彙相近');
  if (sameSlot) reasons.push(`同技能槽 ${left.slot}`);
  if (sameLane) reasons.push(`同 lane：${a.lane}`);
  if (sameArch) reasons.push(`同 role：${a.arch}`);
  if (!reasons.length) reasons.push('數學近似，但 scene、slot 與定位均有差異');

  return {
    group: 0,
    cluster: cluster.cluster,
    clusterSize: cluster.size,
    riskScore,
    category,
    distance,
    sameScene,
    scene: { a: sceneA, b: sceneB },
    sameSlot,
    sameLane,
    sameArch,
    sharedKeyword,
    reasons,
    a: {
      id: pair.a,
      heroId: left.heroId,
      hero: a?.zh ?? left.heroId,
      heroEn: a?.en ?? left.heroId,
      lane: a?.lane ?? null,
      role: a?.arch ?? null,
      slot: left.slot,
      name: aSkill?.name ?? pair.a,
      asset: `public/assets/skill-icons/v1/${left.heroId}/${left.slot.toLowerCase()}.svg`,
    },
    b: {
      id: pair.b,
      heroId: right.heroId,
      hero: b?.zh ?? right.heroId,
      heroEn: b?.en ?? right.heroId,
      lane: b?.lane ?? null,
      role: b?.arch ?? null,
      slot: right.slot,
      name: bSkill?.name ?? pair.b,
      asset: `public/assets/skill-icons/v1/${right.heroId}/${right.slot.toLowerCase()}.svg`,
    },
  };
};

const input = await readJson(inputUrl);
const candidates = [];
const seen = new Set();
for (const cluster of input.clusters ?? []) {
  for (const pair of cluster.pairs ?? []) {
    const key = [pair.a, pair.b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(await rankPair(pair, cluster));
  }
}

candidates.sort((a, b) => b.riskScore - a.riskScore
  || a.distance - b.distance
  || a.cluster - b.cluster
  || a.a.id.localeCompare(b.a.id)
  || a.b.id.localeCompare(b.b.id));

const selected = [];
const clusterCounts = new Map();
for (const row of candidates) {
  if (selected.length >= TARGET_GROUPS) break;
  const used = clusterCounts.get(row.cluster) ?? 0;
  if (used >= MAX_PER_CLUSTER) continue;
  selected.push({ ...row, group: selected.length + 1 });
  clusterCounts.set(row.cluster, used + 1);
}
// The cap is for diversity only. If the input ever has fewer than 40 clusters,
// fill the remaining slots in strict risk order without dropping any candidate.
if (selected.length < TARGET_GROUPS) {
  const selectedIds = new Set(selected.map((row) => `${row.a.id}|${row.b.id}`));
  for (const row of candidates) {
    if (selected.length >= TARGET_GROUPS) break;
    const key = `${row.a.id}|${row.b.id}`;
    if (selectedIds.has(key)) continue;
    selectedIds.add(key);
    selected.push({ ...row, group: selected.length + 1 });
  }
}

const counts = Object.fromEntries(['A', 'B', 'C'].map((category) => [
  category, selected.filter((row) => row.category === category).length,
]));
const output = {
  report: 'MobaSkillIconOwnerReview.v1',
  generatedAt: new Date().toISOString(),
  source: {
    clusterFile: 'icon-clusters-after.json',
    candidatePairs: input.candidatePairs,
    clusterCount: input.clusterCount,
    threshold: input.threshold,
    selectedGroups: selected.length,
  },
  formalHud: {
    desktop: { width: 42, height: 44, selector: '.observer-ability' },
    mobile: { width: 30, height: 40, selector: '.observer-ui.mobile .observer-ability' },
    skillDetail: { width: 52, height: 52, selector: '.observer-skill-detail-head img' },
    sourceFile: 'src/battle/ui/battleObserver.css',
  },
  method: {
    summary: '以既有 16×16 edge-bit distance（中央輪廓／構圖／negative space 的小尺寸代理）為主，疊加 data-scene、技能槽、lane、role 與技能名稱主符號語意；只產生審核排序，不自動修改 icon。',
    criteria: [
      'central silhouette / composition：既有 16×16 edge-bit distance，數值越低風險越高',
      'main symbol / motion：SVG data-scene 與技能名稱共享符號詞彙',
      'same lane / role / slot：提高玩家第一眼混淆風險',
      'negative space / impact：由小尺寸 edge distance 先篩，放大 atlas 交 Owner 人工確認',
    ],
    categoryPolicy: {
      A: '建議重做：小尺寸 distance ≤ 8 且同 scene 並有 slot/lane/role 重疊，等待 Owner 指示後才修改',
      B: '合理共享 archetype：同 scene 且有 slot/lane/role/主符號重疊，可先保留',
      C: '數學近似：scene、定位或槽位有明顯差異，暫不建議重做',
    },
    diversity: `最高風險排序取 ${TARGET_GROUPS} 組；同一 cluster 最多 ${MAX_PER_CLUSTER} 組，避免大型共用 archetype 壟斷 atlas。`,
  },
  summary: {
    highRiskGroups: selected.length,
    suggestedRemake: counts.A,
    reasonableKeep: counts.B,
    mathematicallyNearButDistinct: counts.C,
    selectedClusterCount: new Set(selected.map((row) => row.cluster)).size,
    categoryCounts: counts,
  },
  items: selected,
};

await writeFile(outputUrl, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  candidatePairs: input.candidatePairs,
  clusterCount: input.clusterCount,
  selectedGroups: selected.length,
  highRiskGroups: selected.length,
  suggestedRemake: counts.A,
  reasonableKeep: counts.B,
  mathematicallyNearButDistinct: counts.C,
  output: outputUrl.pathname,
}, null, 2));
