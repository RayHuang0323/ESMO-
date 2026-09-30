// ============================================================================
//  heroPowerCurveDerive.js — Hero Power Curve v1 的**推導規則**（純函式，給產生器與 gate 用）
//
//  正式對戰**不**在執行期呼叫這裡：heroDatabase 不在模擬語意指紋清單內，所以推導結果被
//  產生器寫成字面表（heroPowerCurve.js，受指紋保護）。gate 會重跑這裡、比對字面表沒有漂移。
//
//  三層來源（全部是既有資料，不新增英雄設定）：
//   ① Legacy 規格：EsportsGame.jsx ROLE_PROFILE.curve（前／中／後期 1–5 分，依英雄主路線）
//        上路 [3,4,5]　打野 [4,5,3]　中路 [3,5,4]　下路 [2,3,5]　輔助 [4,4,4]
//   ② 職業微調：刺客前期＋、後期－；戰士中期＋、後期－；坦克後期＋、前期－（法師／射手／輔助不動）
//   ③ 英雄自身：a. 同職業內的屬性成長（ad/adg、asg 推到 18 級）偏高 ⇒ 後期＋、前期－；偏低反之
//               b. 被動型態：永久疊層（擊殺／累傷疊層、無時限）⇒ 後期＋、前期－；
//                  伏擊型（脫戰／靜止／草叢上膛）⇒ 前期＋、後期－
//  分數夾在 [1, 5]；轉成倍率時先扣掉三段平均 ⇒ 整場平均戰力不變，只改變「什麼時候強」。
// ============================================================================

export const LEGACY_LANE_CURVE = Object.freeze({
  上路: [3, 4, 5], 打野: [4, 5, 3], 中路: [3, 5, 4], 下路: [2, 3, 5], 輔助: [4, 4, 4],
});
export const ARCH_SHIFT = Object.freeze({
  刺客: [0.5, 0, -0.5], 戰士: [0, 0.5, -0.5], 坦克: [-0.5, 0, 0.5], 法師: [0, 0, 0], 射手: [0, 0, 0], 輔助: [0, 0, 0],
});

const growthOf = (h) => ((h.stats.ad + 17 * h.stats.adg) / h.stats.ad) * (1 + (17 * h.stats.asg) / 100);

/** 被動型態 → 前後期傾向（+1 後期、−1 前期、0 中性）。 */
export function passiveTempo(rule) {
  if (!rule || rule.tier === 'info') return 0;
  const permanentStack = rule.effects.some((fx) => fx.kind === 'stack' && !fx.duration)
    && ['takedown', 'kill', 'damage-accum'].includes(rule.trigger?.kind);
  if (permanentStack) return 1;
  const ambush = rule.effects.some((fx) => fx.kind === 'arm')
    && ['out-of-combat', 'stationary', 'in-zone'].includes(rule.trigger?.kind);
  return ambush ? -1 : 0;
}

/** heroes：CHAMPIONS_100；passiveRuleOf：heroPassiveGameplay.passiveRuleOf。回傳 { heroId: { curve, reasons } }。 */
export function deriveHeroPowerCurves(heroes, passiveRuleOf) {
  const byArch = {};
  for (const h of heroes) (byArch[h.arch] ??= []).push(growthOf(h));
  const band = Object.fromEntries(Object.entries(byArch).map(([arch, gs]) => {
    const s = [...gs].sort((a, b) => a - b);
    return [arch, { med: s[s.length >> 1], half: Math.max(1e-9, (s[s.length - 1] - s[0]) / 2) }];
  }));
  const out = {};
  for (const h of heroes) {
    const base = LEGACY_LANE_CURVE[h.lane] ?? [3, 4, 4];
    const arch = ARCH_SHIFT[h.arch] ?? [0, 0, 0];
    const reasons = [`主路線 ${h.lane}（Legacy 曲線 ${base.join('/')}）`];
    if (arch.some((v) => v)) reasons.push(`職業 ${h.arch}`);
    const z = (growthOf(h) - band[h.arch].med) / band[h.arch].half;
    const growth = z > 0.5 ? 1 : z < -0.5 ? -1 : 0;
    if (growth) reasons.push(growth > 0 ? '屬性成長偏高（後期）' : '屬性成長偏低（前期）');
    const tempo = passiveTempo(passiveRuleOf(h.id));
    if (tempo) reasons.push(tempo > 0 ? '被動永久疊層（後期）' : '被動伏擊上膛（前期）');
    const lean = (growth + tempo) * 0.5;
    const curve = base.map((v, i) => Math.max(1, Math.min(5, v + arch[i] + (i === 0 ? -lean : i === 2 ? lean : 0))));
    out[h.id] = { curve, reasons };
  }
  return out;
}
