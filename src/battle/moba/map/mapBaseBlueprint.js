// ============================================================================
//  battle/moba/map/mapBaseBlueprint.js — 基地的**唯一** blueprint（Milestone G.15-fix4）
//
//  【G.15 / fix2 / fix3 為什麼畫面還是三個方向長得不一樣】
//   前三輪的作法都是「先畫一圈牆，再用出口去切它」：
//     外牆 = 繞平台中心 C 的一整圈弧
//     出口 = 把「離出口中心線太近」的取樣點丟掉
//     門柱 = 長在「弧剛好斷掉」的地方
//   於是三個方向的牆長什麼樣子，完全取決於**三條 lane 的方位間距**——而藍方
//   top/mid/bot 從平台中心看出去分別是 −111.6° / −50.0° / −13.7°，兩兩間距
//   61.6° 與 36.3°，差了快一倍。同一條切割規則套下去，必然得到
//     · top 側：一段長弧翼牆 + 一根門柱
//     · top↔mid 之間：一小截塔間牆
//     · mid↔bot 之間：兩個開口重疊 ⇒ 門柱直接被判定「不立」⇒ 幾乎無牆
//   ——正是使用者在瀏覽器裡看到的「長弧牆／方塊／幾乎無牆」。
//   數值驗收（出口淨寬、門柱淨距）全綠，是因為那些判準量的是**每個門自己**的
//   左右對稱，量不到「三個門彼此長得一不一樣」。
//
//  ════════════════════════════════════════════════════════════════════════════
//  【G.15-fix4 的作法：先有模組，再有牆】
//
//  牆不再由弧切出來。改成：
//    ① buildBaseExitWallModule() 定義**唯一一份**出口牆體模組（局部座標）
//    ② 三個出口方向各用一次**剛體旋轉**（繞平台中心 C）把同一份模組放下去
//    ③ 三個門的方位是**等角**的（φ0 − Δ / φ0 / φ0 + Δ），Δ = 模組自己的張角
//       ⇒ 三個模組首尾相接，拼成一道連續城牆，且整道牆對 φ0 軸左右鏡射
//    ④ 城牆的長度就是「3 × 模組張角」（實測覆蓋 ≈188°）；**沒有**任何模組以外的
//       附加牆體：沒有後翼牆、沒有另一圈三路共用的主堡內牆。內牆＝模組的肩牆。
//
//  模組的七個元件（使用者指定的組成，順序即畫面上由左到右）：
//    flankLeft ─ pierLeft ─ gate(開口) ─ pierRight ─ flankRight
//                 └ shoulderLeft / shoulderRight（門內兩側往內庭延伸的肩牆，
//                    六道肩牆一起圍出內庭 ⇒ 「主堡內圈」本身也是模組的一部分）
//
//  【為什麼三個門必須「等角」而不是「各自對準自己的高地塔」】
//   三座高地塔由平台中心看出去的方位約 −108.7° / −49.8° / −15.8°，間距 58.9° 與
//   33.9°（天生不等距，由 lane 座標決定，本輪不得改）。模組自己的張角是 63.83°，
//   比較小的那個間距（33.9°）連一個模組都放不下 ⇒
//     · 若三個門各自對準自己的塔，兩個模組必然互相穿透，只能像前三輪那樣「刪牆」
//       ⇒ 三方向長得不一樣。
//     · 若三個門等角（間距 = 模組張角）⇒ 三個模組剛好首尾相接，一件不刪、一件不加。
//   代價：門的方位與「主堡→高地塔」直線有數度差。這由**出口通道與坡道改走
//   「主堡 → 內庭轉折點 → 門 → 直行 exitRunOut → 高地塔」的折線**吸收；折線本身
//   仍是三方向共用同一條生成規則，通道淨寬沿它實測 ≥ EXIT_MIN_WIDTH。
//   φ0（門扇的中軸）由 minimax 求解：讓三個門偏離自己那條「主堡→塔」直線的
//   側距最大值最小 ⇒ 不是拍腦袋選的數字。
//
//  【做得到與做不到】外牆圓在基地後方正好穿過泉水平台，所以城牆**不可能繞成一整圈**，
//   一定有兩個端點。於是「最外側兩個出口的外側是牆的盡頭、中間那個出口兩側都是鄰居」
//   避不掉。能保證也已經保證的是：兩個端點對 φ0 軸完全鏡射（見 mapBaseSymmetry 的
//   wall_fan_mirror）⇒ top 與 bot 互為鏡像、mid 自身左右對稱，沒有哪個方向多一塊或少一塊。
//
//  【所以本檔保證了什麼】
//   · 三個出口的所有牆體元件，**逐件**來自 placeExitModule() 對同一份
//     buildBaseExitWallModule() 的輸出做旋轉 ⇒ 段數／門柱數／翼牆長／肩牆長／
//     牆高／牆厚／出口寬，由**定義**相同，不是量出來剛好相同。
//   · 基地的每一段牆都指得出「屬於哪個模組的哪一個元件」（泉水池緣除外——那是
//     泉水自己的設施，位於城牆之外、基地後方）。
//   · 紅方不跑任何一行生成程式，一律 mirrorBaseItems() 對藍方清單做 180° 變換。
//   · 每一段牆的**弦長**恆 = rimStep（角步長由 2·asin(step/2r) 反解）
//     ⇒ 不同半徑上的段長也完全一致，no-jitter 由定義成立。
//  ════════════════════════════════════════════════════════════════════════════
//
//  ⚠ 基地核心結構**一律不得有 jitter**：本檔不呼叫 swobble / hash01 / blobRing 的
//    amp，也不吃任何 seed。
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()、不讀寫 gameData。
// ============================================================================
import { smoothPath, ribbonPolygon, TAU } from "./mapShapePrimitives.js";
import { LANES3 } from "./mapLaneStyle.js";
import { MIRROR_LANE } from "./mapTowerLayoutStyle.js";
import { HEIGHT, LAYER_Y, BASE_TOP_Y } from "./mapVisualStyle.js";
import {
  BASE_GEO, buildBaseExitWallModule, buildBaseFan, angStep,
} from "./mapBaseFrame.js";

//  尺寸表與「唯一模組 + 三個門的方位」都住在 mapBaseFrame.js（道路生成也要用同一份）。
//  這裡原樣轉出，既有消費端（mapBaseLayoutStyle / mapBaseSymmetry / verifier）不必改 import。
export { BASE_GEO, buildBaseExitWallModule };

/** 圓弧牆取樣點：自 a0 起朝 dir 走 segs 段，每段弦長 = chord。 */
function arcRunPoints(cx, cy, r, a0, segs, chord, dir = 1) {
  const da = angStep(r, chord) * dir;
  const out = [];
  for (let k = 0; k <= segs; k++) {
    const a = a0 + da * k;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}
/** 多邊形取樣密度（乾淨圓的邊數；夠密才不會看出多邊形邊）。 */
const DISC_N = 72;

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 乾淨圓多邊形（無擾動）。角度由 k/n 決定 ⇒ 180° 鏡射後逐頂點對得上。 */
function disc(cx, cy, r, n = DISC_N) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** 正 n 邊形（石板用），可指定朝向。 */
function ngon(cx, cy, r, n, rot) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/**
 * 兩個圓的聯集外框（從 A 圓心射線取樣；要求 A 圓心在聯集內，兩圓相交或相含）。
 * 用來做「高地平台 ∪ 泉水凹間」：平台是乾淨圓，泉水那一側鼓出一個乾淨圓。
 */
function discUnion(A, rA, B, rB, n = DISC_N) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const ux = Math.cos(a), uy = Math.sin(a);
    const dx = B.x - A.x, dy = B.y - A.y;
    const proj = dx * ux + dy * uy;
    const perp2 = dx * dx + dy * dy - proj * proj;
    let rB2 = 0;
    if (perp2 < rB * rB) rB2 = proj + Math.sqrt(rB * rB - perp2);
    out.push({ x: A.x + ux * Math.max(rA, rB2), y: A.y + uy * Math.max(rA, rB2) });
  }
  return out;
}

/**
 * 環形／弧形牆：沿圓弧等距取樣，扣掉「離任一開口中心線太近」的取樣點（泉水池緣用）。
 * @param openings [{ seg:[a,b], clear }]
 */
function arcRuns(cx, cy, r, a0, a1, step, openings) {
  const n = Math.max(2, Math.round(((a1 - a0) * r) / step));
  const runs = []; let cur = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const p = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    const blocked = openings.some((o) => distToSeg(p, o.seg[0], o.seg[1]) < o.clear);
    if (blocked) { if (cur.length >= 2) runs.push(cur); cur = []; continue; }
    cur.push(p);
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/** 點到「線段 a→b」的距離。 */
function distToSeg(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const L2 = vx * vx + vy * vy || 1;
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/** 折線 → 等長牆段（無擾動；len / thick / h 逐段完全相同）。 */
function arcToWallItems(pts, { thick, h, kind, idPrefix, lane = null }) {
  const items = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = d2(a, b);
    if (len < 1e-6) continue;
    items.push({
      id: `${idPrefix}_${String(i).padStart(2, "0")}`,
      role: "wall", kind, lane,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      rot: Math.atan2(b.x - a.x, b.y - a.y),
      len, thick, h,
    });
  }
  return items;
}


/**
 * 把模組放到某個出口方位上（繞 C 的剛體旋轉）。三個方向呼叫同一支、傳不同 bearing。
 * @returns 該出口的牆體 item 陣列
 */
function placeExitModule(M, C, bearing, lane, G) {
  const ca = Math.cos(bearing), sa = Math.sin(bearing);
  const toWorld = (lx, ly) => ({ x: C.x + lx * ca - ly * sa, y: C.y + lx * sa + ly * ca });
  const P = `wall_blue_exit_${lane}`;
  const items = [];

  //  ① / ⑤ 左右翼牆（外牆圓上的弧牆，左右同段數、同弦長 ⇒ 模組自身左右鏡射）
  for (const [sign, name] of [[+1, "flankLeft"], [-1, "flankRight"]]) {
    const pts = arcRunPoints(C.x, C.y, M.rimR, bearing + sign * M.flankA,
      M.flank.segs, M.flank.chord, sign);
    items.push(...arcToWallItems(pts, {
      thick: M.flank.thick, h: M.flank.h, kind: "base_rim",
      idPrefix: `${P}_${name}`, lane,
    }));
  }

  //  ② / ④ 左右門柱（長軸沿出口方向的門樓；三路同規格）
  for (const [sign, name] of [[+1, "pierLeft"], [-1, "pierRight"]]) {
    const p = toWorld(M.pier.x, sign * M.pier.y);
    items.push({
      id: `${P}_${name}`, role: "wall", kind: "base_gate", lane,
      x: p.x, y: p.y,
      rot: Math.atan2(ca, sa),          // 長軸 = 局部 +x（atan2(dx,dy) 慣例）
      len: M.pier.len, thick: M.pier.thick, h: M.pier.h,
    });
  }

  //  ⑥ / ⑦ 左右肩牆（與出口方向平行，往內庭延伸；與主堡內圈同一個朝向語言）
  for (const [sign, name] of [[+1, "shoulderLeft"], [-1, "shoulderRight"]]) {
    const pts = [];
    for (let k = 0; k <= M.shoulder.segs; k++) {
      pts.push(toWorld(M.shoulder.x0 - k * M.shoulder.step, sign * M.shoulder.y));
    }
    items.push(...arcToWallItems(pts, {
      thick: M.shoulder.thick, h: M.shoulder.h, kind: "base_keep",
      idPrefix: `${P}_${name}`, lane,
    }));
  }

  return items;
}

/**
 * 建立**藍方**基地 blueprint。紅方一律由 mirrorBaseItems() 產生，不得再跑這支。
 *
 * @param L         buildMobaLayout() 輸出
 * @param lanePlan  buildLanePlan() 輸出（高地走廊要沿真正的路走）
 * @param towerPlan buildTowerPlan() 輸出（出口方向以高地塔為準）
 * @returns {{ items, frame }}
 */
export function buildBaseBlueprint(L, lanePlan, towerPlan) {
  const G = BASE_GEO;
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const b = { ...L.bases.blue }, f = { ...L.fountains.blue };
  const A0 = Math.atan2(cy - b.y, cx - b.x);
  const C = { x: b.x + Math.cos(A0) * G.offsetToCenter, y: b.y + Math.sin(A0) * G.offsetToCenter };

  const items = [];
  const G0 = (id, kind, poly, colorKey, y, extra = {}) => {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    const gx = sx / poly.length, gy = sy / poly.length;
    let rr = 0;
    for (const p of poly) rr = Math.max(rr, Math.hypot(p.x - gx, p.y - gy));
    items.push({
      id, role: "ground", kind, lane: extra.lane ?? null,
      x: gx, y: gy, rot: extra.rot ?? 0, len: rr * 2, thick: rr * 2, h: 0,
      poly, colorKey, layerY: y,
    });
  };

  // ══ ⓪ 基地骨架：三個門的方位 + 三座高地塔的站位（mapBaseFrame）══════════════
  //
  //  G.15-final：門的方位、模組張角、高地塔站位全部由 mapBaseFrame.buildBaseFan()
  //  一次算出（三個門等角、塔貼在自己那個門的軸線上、距 C 一律 towerR）。
  //  這裡不再自己解 φ0，也不再讀塔的原始座標 ⇒ 基地、道路、verifier 吃同一份骨架。
  const FR = buildBaseFan(L, towerPlan.laneTowers, G).blue;
  const M = FR.module;
  const phi0 = FR.fanAxis;

  //  三個出口。門心、高地塔、內庭轉折點全部落在同一條「局部 +x 軸」上
  //  ⇒ 通道穿過門與肩牆時恆在正中央，左右淨距由定義相等；
  //    塔也永遠正對門心，三路的「入口 → 塔」關係完全相同。
  const exits = FR.exits.map((e) => ({
    lane: e.lane, bearing: e.bearing, gate: e.gate, bend: e.bend,
    tower: e.tower, outer: e.outer,
    dir: Math.atan2(e.gate.y - b.y, e.gate.x - b.x),
    line: [b, e.bend, e.gate, e.tower, e.outer],
  }));
  //  依 LANES3 的順序輸出（消費端習慣 top/mid/bot）
  const exitOf = (ln) => exits.find((e) => e.lane === ln);
  const exits3 = LANES3.map(exitOf);

  // ══ ① 高地草地 + 三條高地走廊 ═══════════════════════════════════════════
  //  走廊改成**沿出口軸線的直帶**（內庭 → 門 → 塔 → 再往外）⇒ 走廊本身也是模組的
  //  一部分，三路只差旋轉。舊版沿 lane 折線切一段，三路長相各不相同。
  exits3.forEach((e) => {
    const at = (t) => ({ x: C.x + Math.cos(e.bearing) * t, y: C.y + Math.sin(e.bearing) * t });
    G0(`highland_blue_${e.lane}`, "highland",
      ribbonPolygon(smoothPath([at(M.innerX), e.gate, e.tower, at(G.towerR + 12)], 3),
        G.corridorW, { vary: 0, taper: 0.45 }),
      "grass_highland", LAYER_Y.highland, { lane: e.lane, rot: e.bearing });
  });
  G0("highland_blue", "highland", disc(C.x, C.y, G.highlandR), "grass_highland_alt", LAYER_Y.highland + 0.01);

  // ══ ② 高地平台（乾淨圓 ∪ 泉水凹間）+ 內庭 ═══════════════════════════════
  const apronPoly = discUnion(C, G.apronR, f, G.fountainPadR + 0.9);
  G0("base_blue_apron", "apron", apronPoly, "base_apron", LAYER_Y.base_apron);
  G0("base_blue_court", "court", disc(C.x, C.y, G.courtR), "base_court", BASE_TOP_Y.court);

  // ══ ③ 基地牆體：三個模組，**沒有第二種來源** ═══════════════════════════════
  //
  //  【G.15-fix4 第二輪：把「模組以外的牆」全部消滅】第一輪還留了兩段後翼牆
  //   （rearWing，接在整個扇形最外兩端）與一圈主堡內牆（繞主堡、只有一個共同開口）。
  //   Codex 視覺審查抓到的正是它們：外側兩個出口各有一側接到那道長弧後翼牆、
  //   另一側接到鄰居模組，而中間的出口兩側都接鄰居 ⇒ 三個方向的**可見牆廓**不同，
  //   即使模組本體逐件相同。
  //
  //   這一輪把後翼牆與主堡內牆整個拿掉：
  //     · 外牆的「長度」改由模組自己的翼牆段數 flankSegs 決定（左右同值），
  //       三個模組首尾相接 ⇒ 整道城牆 = 3 × 同一份模組，沒有任何附加物。
  //     · 內牆改由模組自己的肩牆負責（每個模組左右各 shoulderSegs 段），
  //       六道肩牆圍出內庭 ⇒ 「主堡內圈」本身也是模組的一部分，不再是共用件。
  //   ⇒ 基地的每一段牆（泉水池緣除外，那是泉水的設施、在城牆之外）都能指名
  //     它屬於哪一個模組的哪一個元件。
  const wallItems = [];
  exits.forEach((e) => wallItems.push(...placeExitModule(M, C, e.bearing, e.lane, G)));

  // ══ ④ 裝飾石板：繞 C 的三環正六角石板（角度 = k/n，無 jitter）══════════════
  const SLAB_RINGS = [[7.0, 14, 1.5], [9.2, 18, 1.6], [11.4, 22, 1.6], [13.6, 26, 1.7], [15.8, 30, 1.7]];
  let slabT = 0;
  SLAB_RINGS.forEach(([rad, n, size], ri) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const p = { x: C.x + Math.cos(a) * rad, y: C.y + Math.sin(a) * rad };
      slabT++;
      if (d2(p, b) < G.keepR + size + 0.6) continue;       // 壓到主堡台
      if (d2(p, C) > G.apronR - size - 1.2) continue;      // 掉出平台
      //  壓到牆體（門柱 / 肩牆 / 翼牆）的石板不鋪：石板是平面裝飾，牆下不需要，
      //  留著只會讓三個出口旁邊各自多出不一樣的碎塊。
      if (wallItems.some((w) => d2(p, w) < size + w.thick / 2 + 0.2)) continue;
      G0(`slab_blue_${ri}_${String(k).padStart(2, "0")}`, "slab",
        ngon(p.x, p.y, size, 6, a), (slabT % 2) ? "base_slab" : "base_slab_alt",
        BASE_TOP_Y.court + 0.03, { rot: a });
    }
  });

  // ══ ⑤ 三路坡道（沿出口軸線：主堡 → 轉折點 → 門 → 平台外緣）══════════════
  exits3.forEach((e) => {
    const inner = { x: b.x + Math.cos(e.dir) * (G.keepWallR - 1), y: b.y + Math.sin(e.dir) * (G.keepWallR - 1) };
    const end = { x: C.x + Math.cos(e.bearing) * (G.apronR - 1.2), y: C.y + Math.sin(e.bearing) * (G.apronR - 1.2) };
    G0(`ramp_blue_${e.lane}`, "ramp",
      ribbonPolygon(smoothPath([inner, e.bend, e.gate, end], 2.5), G.rampW, { vary: 0, taper: 0.7 }),
      "base_ramp", BASE_TOP_Y.ramp, { lane: e.lane, rot: e.bearing });
  });

  // ══ ⑥ 主堡台（乾淨圓，包住主堡 / 泉水 / 兩座門牙塔）════════════════════════
  G0("base_blue_keep", "keep", disc(b.x, b.y, G.keepR), "base_apron_top", BASE_TOP_Y.keep);

  // ══ ⑦ 泉水區（平台 → 走道 → 台階 → 水面，全是乾淨圓）══════════════════════
  const walkPath = [
    { x: f.x * 1.02 - b.x * 0.02, y: f.y * 1.02 - b.y * 0.02 },
    { x: b.x, y: b.y },
    { x: b.x + (b.x - f.x) * 0.28, y: b.y + (b.y - f.y) * 0.28 },
  ];
  G0("fountain_blue_pad", "fountain", disc(f.x, f.y, G.fountainPadR), "fountain_pad", BASE_TOP_Y.fountain_pad);
  G0("fountain_blue_walk", "fountain",
    ribbonPolygon(smoothPath(walkPath, 2.5), G.fountainWalkW, { vary: 0, taper: 0.8 }),
    "base_ramp", BASE_TOP_Y.fountain_walk);
  G0("fountain_blue_step", "fountain", disc(f.x, f.y, G.fountainStepR), "fountain_step", BASE_TOP_Y.fountain_step);
  G0("fountain_blue_pool", "fountain", disc(f.x, f.y, G.fountainPoolR), "fountain_water_blue", BASE_TOP_Y.fountain_pool);

  // ══ ⑧ 門牙塔底座（畫在主堡台頂面上）═══════════════════════════════════════
  const turrets = towerPlan.nexusTurrets.filter((t) => t.side === "blue");
  turrets.forEach((t, i) => {
    G0(`towerpad_blue_nexus_${i}`, "towerpad", ngon(t.x, t.y, t.padR, 8, t.angle),
      t.plinth, BASE_TOP_Y.keep + 0.04, { rot: t.angle });
  });

  // ══ ⑨ 泉水池緣：乾淨圓環，朝主堡留一個開口 ═══════════════════════════════
  const fRimRuns = arcRuns(f.x, f.y, G.fountainRimR, 0, TAU, 1.4, [
    { seg: [f, b], clear: G.fountainRimThick / 2 + 3.2 },
  ]);
  fRimRuns.forEach((pts, ri) => {
    wallItems.push(...arcToWallItems(pts, {
      thick: G.fountainRimThick, h: HEIGHT.fountain_rim, kind: "fountain_rim",
      idPrefix: `wall_blue_fountainrim_${ri}`,
    }));
  });

  items.push(...wallItems);

  // ══ ⑪ 節點：三個出口 / 兩座門牙塔 / 三座高地塔 / 平台圓心 ═══════════════════
  exits3.forEach((e) => {
    const g = { x: C.x + Math.cos(e.bearing) * (G.rimR + G.rimThick / 2 + 1.5),
      y: C.y + Math.sin(e.bearing) * (G.rimR + G.rimThick / 2 + 1.5) };
    items.push({
      id: `gate_blue_${e.lane}`, role: "node", kind: "gate", lane: e.lane,
      x: g.x, y: g.y, rot: e.bearing, len: G.gateClear, thick: 0, h: 0,
    });
  });
  turrets.forEach((t, i) => items.push({
    id: `node_blue_turret_${i}`, role: "node", kind: "nexus_turret", lane: null,
    x: t.x, y: t.y, rot: t.angle, len: t.padR * 2, thick: 0, h: 0,
  }));
  exits3.forEach((e) => items.push({
    id: `node_blue_hgtower_${e.lane}`, role: "node", kind: "highground_tower", lane: e.lane,
    x: e.tower.x, y: e.tower.y, rot: e.dir, len: 0, thick: 0, h: 0,
  }));
  items.push({
    id: "node_blue_center", role: "node", kind: "apron_center", lane: null,
    x: C.x, y: C.y, rot: phi0, len: G.apronR * 2, thick: 0, h: 0,
  });

  // ══ ⑫ 區域：三路出口淨空通道（禁建區，不渲染）═════════════════════════════
  exits3.forEach((e) => {
    const path = smoothPath([
      { x: b.x - Math.cos(e.dir) * 6, y: b.y - Math.sin(e.dir) * 6 },
      ...e.line,
    ], 3);
    items.push({
      id: `zone_blue_exit_${e.lane}`, role: "zone", kind: "exit_corridor", lane: e.lane,
      x: e.tower.x, y: e.tower.y, rot: e.bearing, len: G.exitCorridorW, thick: 0, h: 0,
      poly: ribbonPolygon(path, G.exitCorridorW, { vary: 0 }),
      //  通道中心線：主堡 → 內庭轉折 → 城門 → 高地塔 → 再往外。門心、塔、轉折點
      //  全在同一條軸線上，所以出了內庭之後是一條直線。verifier 與 debug HUD 都吃這條。
      line: e.line.map((p) => ({ x: p.x, y: p.y })),
    });
  });
  items.push({
    id: "zone_blue_keepout", role: "zone", kind: "keep_out", lane: null,
    x: b.x, y: b.y, rot: 0, len: G.keepOutR * 2, thick: 0, h: 0,
    poly: disc(b.x, b.y, G.keepOutR / Math.cos(Math.PI / 48), 48),
  });

  return {
    items,
    frame: { base: b, fountain: f, center: C, axis: A0, fanAxis: phi0, module: M, exits: exits3, turrets },
  };
}

/** blueprint id 的鏡射：blue→red，且 180° 旋轉把上路↔下路互換。 */
export const mirrorBaseId = (id) => id
  .replace("blue", "red")
  .replace(/(^|_)(top|bot)(?=_|$)/g, (m, a, ln) => `${a}${ln === "top" ? "bot" : "top"}`);

/** 少數帶陣營色的圖層（泉水水面）：鏡射時色 key 也要換到紅方。 */
const MIRROR_COLOR_KEY = Object.freeze({ fountain_water_blue: "fountain_water_red" });

/**
 * 單一 blueprint item 的 180° 鏡射。
 *  · 位置繞地圖中心 180°
 *  · rot + π（長方體對 180° 自我重合 ⇒ 長 / 厚 / 高一個字都不能動）
 *  · lane top↔bot（180° 把上路方向映到下路方向），mid 不變
 */
export function mirrorBaseItem(it, cx, cy) {
  const out = {
    ...it,
    id: mirrorBaseId(it.id),
    lane: it.lane ? MIRROR_LANE[it.lane] : null,
    x: 2 * cx - it.x, y: 2 * cy - it.y,
    rot: it.rot + Math.PI,
  };
  if (it.poly) out.poly = it.poly.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y }));
  if (it.line) out.line = it.line.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y }));
  if (it.colorKey && MIRROR_COLOR_KEY[it.colorKey]) out.colorKey = MIRROR_COLOR_KEY[it.colorKey];
  return out;
}

/** 整份 blueprint 的 180° 鏡射（＝紅方基地的唯一來源）。 */
export function mirrorBaseItems(items, cx, cy) {
  return items.map((it) => mirrorBaseItem(it, cx, cy));
}

/** 兩方 blueprint。紅方**只**由 mirrorBaseItems() 產生。 */
export function buildBaseBlueprintPair(L, lanePlan, towerPlan) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const blue = buildBaseBlueprint(L, lanePlan, towerPlan);
  return {
    blue: blue.items,
    red: mirrorBaseItems(blue.items, cx, cy),
    frame: blue.frame,
  };
}
