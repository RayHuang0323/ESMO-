// ============================================================================
//  battle/moba/map/mapLandmarks.js — MOBA 地標資料（Milestone E）
//
//  由 layout（座標取自 gameData.js 唯一真相來源）衍生「地標」：坑牆與入口、Buff 標記、
//  基地入口、野區入口、區域名稱標籤。純資料（無 THREE/React），renderer 與 verifier 共用。
//  ⚠ 不改任何模擬常數；地標為「呈現用」衍生點，keys 唯一。不用 Math.random()。
// ============================================================================

const angTo = (px, py, tx, ty) => Math.atan2(ty - py, tx - px);
const wrapDelta = (a, b) => Math.abs(((a - b + Math.PI) % (2 * Math.PI)) - Math.PI);

// 環繞坑的牆體（馬蹄形，留兩個入口：面向地圖中心＋其相反側）
function pitRing(p, R, entA, n = 16, gap = Math.PI / 4.5) {
  const walls = [];
  const entA2 = entA + Math.PI;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (wrapDelta(a, entA) < gap || wrapDelta(a, entA2) < gap) continue;
    walls.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R });
  }
  const entrances = [entA, entA2].map((a, i) => ({
    x: p.x + Math.cos(a) * (R + 1.5), y: p.y + Math.sin(a) * (R + 1.5), angle: a,
  }));
  return { walls, entrances };
}

/** 由 layout 建立所有地標。@returns 結構化地標（含 keys 唯一的 labels / buffs / entrances）。 */
export function buildLandmarks(L) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;

  // 坑：牆環 + 入口
  const dR = pitRing(L.pits.dragon, 13, angTo(L.pits.dragon.x, L.pits.dragon.y, cx, cy));
  const bR = pitRing(L.pits.baron, 13, angTo(L.pits.baron.x, L.pits.baron.y, cx, cy));
  const pitWalls = { dragon: dR.walls, baron: bR.walls };
  const pitEntrances = [
    ...dR.entrances.map((e, i) => ({ key: `ent_dragon_${i}`, pit: "dragon", ...e })),
    ...bR.entrances.map((e, i) => ({ key: `ent_baron_${i}`, pit: "baron", ...e })),
  ];

  // Buff（取自 camps 的 buff 類型）
  const buffs = L.camps.filter((c) => c.type === "buff")
    .map((c) => ({ key: `buff_${c.side}`, side: c.side, x: c.x, y: c.y }));

  // 基地入口（往地圖中心方向的出口/坡道）
  const baseEntrances = ["blue", "red"].map((side) => {
    const b = L.bases[side]; const a = angTo(b.x, b.y, cx, cy);
    return { key: `baseent_${side}`, side, x: b.x + Math.cos(a) * 24, y: b.y + Math.sin(a) * 24, angle: a };
  });

  // 野區入口（各象限往中心方向）
  const jungleEntrances = L.quadrants.map((q) => {
    const a = angTo(q.x, q.y, cx, cy);
    return { key: `junent_${q.id}`, quad: q.id, x: q.x + Math.cos(a) * (q.r * 0.75), y: q.y + Math.sin(a) * (q.r * 0.75), angle: a };
  });

  // 區域名稱標籤（keys 唯一）
  const laneMid = (ln) => { const p = L.lanes[ln]; return p[Math.floor(p.length / 2)]; };
  const labels = [
    { key: "lbl_top", kind: "lane", text: "Top", x: laneMid("top").x, y: laneMid("top").y },
    { key: "lbl_mid", kind: "lane", text: "Mid", x: laneMid("mid").x, y: laneMid("mid").y },
    { key: "lbl_bot", kind: "lane", text: "Bot", x: laneMid("bot").x, y: laneMid("bot").y },
    { key: "lbl_dragon", kind: "pit", text: "Dragon", x: L.pits.dragon.x, y: L.pits.dragon.y },
    { key: "lbl_baron", kind: "pit", text: "Baron", x: L.pits.baron.x, y: L.pits.baron.y },
    { key: "lbl_base_blue", kind: "base", text: "Blue Base", x: L.bases.blue.x, y: L.bases.blue.y },
    { key: "lbl_base_red", kind: "base", text: "Red Base", x: L.bases.red.x, y: L.bases.red.y },
    ...L.quadrants.map((q) => ({ key: `lbl_${q.id}`, kind: "jungle", text: q.label, x: q.x, y: q.y })),
    ...buffs.map((b) => ({ key: `lbl_${b.key}`, kind: "buff", text: b.side === "blue" ? "Blue Buff" : "Red Buff", x: b.x, y: b.y })),
  ];

  return { pitWalls, pitEntrances, buffs, baseEntrances, jungleEntrances, labels };
}
