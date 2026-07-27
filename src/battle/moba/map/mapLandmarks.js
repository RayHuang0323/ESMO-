// ============================================================================
//  battle/moba/map/mapLandmarks.js — MOBA 地標資料（Milestone E 建立、G.4 中文化）
//
//  由 layout（座標取自 gameData.js 唯一真相來源）衍生「地標」：坑牆與入口、Buff 標記、
//  基地入口、野區入口、區域名稱標籤。純資料（無 THREE/React），renderer 與 verifier 共用。
//
//  ⚠ G.4：地圖上的文字**一律繁體中文**，不得中英混用。
//    英文只允許出現在程式碼識別字（key / id）裡，那些不會顯示在畫面上。
//  ⚠ G.4：營地標籤改用 mapCampLayout 的**呈現座標**（Buff 已從路上移回野區），
//    否則標籤會留在舊位置、跟怪物本體對不上。
//  ⚠ 不改任何模擬常數；地標為「呈現用」衍生點，keys 唯一。不用 Math.random()。
// ============================================================================

const angTo = (px, py, tx, ty) => Math.atan2(ty - py, tx - px);
const wrapDelta = (a, b) => Math.abs(((a - b + Math.PI) % (2 * Math.PI)) - Math.PI);

/** 畫面上會出現的固定字串（繁體中文，單一來源，verifier 也讀這份）。 */
export const LABEL_TEXT = Object.freeze({
  top: "上路",
  mid: "中路",
  bot: "下路",
  dragon: "小龍",
  baron: "巴龍",
  base_blue: "藍方主堡",
  base_red: "紅方主堡",
  fountain_blue: "藍方泉水",
  fountain_red: "紅方泉水",
});

// 環繞坑的牆體（馬蹄形，留兩個入口：面向地圖中心＋其相反側）
function pitRing(p, R, entA, n = 16, gap = Math.PI / 4.5) {
  const walls = [];
  const entA2 = entA + Math.PI;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (wrapDelta(a, entA) < gap || wrapDelta(a, entA2) < gap) continue;
    walls.push({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R });
  }
  const entrances = [entA, entA2].map((a) => ({
    x: p.x + Math.cos(a) * (R + 1.5), y: p.y + Math.sin(a) * (R + 1.5), angle: a,
  }));
  return { walls, entrances };
}

/**
 * 由 layout 建立所有地標。
 * @param L        buildMobaLayout() 的輸出
 * @param campPlan buildCampPlan() 的輸出（可省略；省略時退回 gameData 的營地座標）
 */
export function buildLandmarks(L, campPlan = null) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const camps = campPlan ?? L.camps.map((c) => ({
    ...c, label: c.type === "buff" ? (c.side === "blue" ? "藍 Buff" : "紅 Buff") : "野怪營地",
    isPresentation: false,
  }));

  // 坑：牆環 + 入口
  const dR = pitRing(L.pits.dragon, 13, angTo(L.pits.dragon.x, L.pits.dragon.y, cx, cy));
  const bR = pitRing(L.pits.baron, 13, angTo(L.pits.baron.x, L.pits.baron.y, cx, cy));
  const pitWalls = { dragon: dR.walls, baron: bR.walls };
  const pitEntrances = [
    ...dR.entrances.map((e, i) => ({ key: `ent_dragon_${i}`, pit: "dragon", ...e })),
    ...bR.entrances.map((e, i) => ({ key: `ent_baron_${i}`, pit: "baron", ...e })),
  ];

  // Buff（取自營地配置的 buff 類型；座標＝呈現座標）
  const buffs = camps.filter((c) => c.type === "buff")
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

  // ── 區域名稱標籤（keys 唯一，文字一律繁體中文）─────────────────────────
  //  標籤高度由 renderer 決定；營地標籤刻意掛在「怪物 headroom 之上」，不會擋住本體。
  const laneMid = (ln) => { const p = L.lanes[ln]; return p[Math.floor(p.length / 2)]; };
  const labels = [
    { key: "lbl_top", kind: "lane", text: LABEL_TEXT.top, x: laneMid("top").x, y: laneMid("top").y },
    { key: "lbl_mid", kind: "lane", text: LABEL_TEXT.mid, x: laneMid("mid").x, y: laneMid("mid").y },
    { key: "lbl_bot", kind: "lane", text: LABEL_TEXT.bot, x: laneMid("bot").x, y: laneMid("bot").y },
    { key: "lbl_dragon", kind: "pit", text: LABEL_TEXT.dragon, x: L.pits.dragon.x, y: L.pits.dragon.y },
    { key: "lbl_baron", kind: "pit", text: LABEL_TEXT.baron, x: L.pits.baron.x, y: L.pits.baron.y },
    { key: "lbl_base_blue", kind: "base", text: LABEL_TEXT.base_blue, x: L.bases.blue.x, y: L.bases.blue.y },
    { key: "lbl_base_red", kind: "base", text: LABEL_TEXT.base_red, x: L.bases.red.x, y: L.bases.red.y },
    { key: "lbl_fountain_blue", kind: "base", text: LABEL_TEXT.fountain_blue, x: L.fountains.blue.x, y: L.fountains.blue.y },
    { key: "lbl_fountain_red", kind: "base", text: LABEL_TEXT.fountain_red, x: L.fountains.red.x, y: L.fountains.red.y },
    ...L.quadrants.map((q) => ({ key: `lbl_${q.id}`, kind: "jungle", text: q.label, x: q.x, y: q.y })),
    // 每個營地（含呈現用營地）都有自己的中文名：藍 Buff／紅 Buff／狼營／石甲蟲／鳥營／蟾蜍
    ...camps.map((c) => ({
      key: `lbl_${c.id}`, kind: c.type === "buff" ? "buff" : "camp",
      text: c.label, x: c.x, y: c.y,
    })),
  ];

  return { pitWalls, pitEntrances, buffs, baseEntrances, jungleEntrances, labels };
}
