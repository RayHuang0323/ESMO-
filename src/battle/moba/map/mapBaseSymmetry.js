// ============================================================================
//  battle/moba/map/mapBaseSymmetry.js — 基地鏡射 / 層級 / 出口的判準（Milestone G.14）
//
//  【為什麼要獨立一支】G.12 已經讓 buildBasePlan 只生成藍方、紅方純鏡射，但
//    「兩方基地到底對不對稱」這件事在 G.13 之前只有 verifier 裡零散幾條斷言，
//    而且**渲染層的隨機種子**（牆體擾動 seed、石板角度、底座 blob）可以在幾何
//    已經鏡射的情況下，把畫面做成不對稱——實測 G.13 的 base_rim 藍 25 段 / 紅 26 段。
//
//  ⇒ 這支把判準集中成一份純資料報告，讓
//       tools/check_moba_map.mjs（CI 把關）
//       src/debug/MobaMapBlockout/MobaMapPreview.jsx（畫面上的「基地鏡射檢查」）
//     用**完全同一組數字**，不會出現「驗證器綠、畫面歪」的情況。
//
//  三份報告：
//    buildBaseSymmetryReport()  藍紅基地逐項鏡射差異（點 / 多邊形 / 牆段 / 地面層）
//    buildBaseHierarchyReport() 主堡區的閱讀層級（泉水→主堡→門牙塔→平台→高地塔→…）
//    buildBaseExitReport()      三路出口沿中心線的實際可走淨寬（吃 passability 距離場）
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()。不讀寫 gameData。
// ============================================================================
import { MIRROR_LANE, HIGHGROUND_BAND, NEXUS_TURRET_GEO, TOWER_ORDER } from "./mapTowerLayoutStyle.js";
import { BASE_GEO } from "./mapBaseLayoutStyle.js";
import { HERO_RADIUS } from "./mapPassability.js";

/** 判為「鏡射相等」的容差（模擬單位）。幾何是純算術鏡射，理論值 0，留浮點餘裕。 */
export const SYM_TOL = Object.freeze({
  point: 0.02,     // 單點 / 多邊形頂點
  wall: 0.05,      // 牆段中心（經過 smoothPath 再細分，誤差略大）
  angle: 0.01,     // 牆段角度（mod π）
  size: 0.01,      // 牆段長 / 厚 / 高
});

/** 三路出口的可走淨寬下限（模擬單位）。英雄半徑 2.4 ⇒ 直徑 4.8 是硬底線。 */
export const EXIT_MIN_WIDTH = 8.0;

const LANES3 = ["top", "mid", "bot"];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 「基地結構件」地面層的 id 樣式（與 tools/lib/baseSymmetryRaster.mjs 同一份定義）。
 * 結構件＝決定基地輪廓與可走性的東西；裝飾件（路斑 / 地表斑 / 岩影 / 草叢）不在內。
 */
export const STRUCT_LAYER_RE = /^(base|slab|fountain|ramp|highland|towerpad|plaza)_/;

/** 圖層 id 的鏡射：blue→red，且 180° 旋轉把上路↔下路互換。 */
export const mirrorLayerId = (id) => id.replace("blue", "red")
  .replace(/(^|_)(top|bot)(_|$)/, (m, a, ln, b) => `${a}${ln === "top" ? "bot" : "top"}${b}`);

/** 繞地圖中心的 180° 鏡射。 */
const mirror = (p, cx, cy) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });

/** 角度差（mod π）：牆段是無向長方體，a 與 a+π 是同一塊牆。 */
function angleDiffModPi(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** 逐點比較兩條多邊形是否互為鏡射（同長度、同順序）。回傳最大誤差，長度不符回 Infinity。 */
function polyMirrorErr(bluePoly, redPoly, cx, cy) {
  if (!bluePoly || !redPoly || bluePoly.length !== redPoly.length) return Infinity;
  let mx = 0;
  for (let i = 0; i < bluePoly.length; i++) {
    mx = Math.max(mx, d2(mirror(bluePoly[i], cx, cy), redPoly[i]));
  }
  return mx;
}

/**
 * 牆段集合的鏡射比對：對每一段藍方牆，找最近的紅方牆（貪婪一對一），
 * 比對中心位置、長度、厚度、高度、角度（mod π）。
 * @returns { ok, count: {blue,red}, maxPosErr, maxSizeErr, maxAngErr, worst }
 */
function wallMirrorErr(blueWalls, redWalls, cx, cy) {
  const out = {
    count: { blue: blueWalls.length, red: redWalls.length },
    maxPosErr: 0, maxSizeErr: 0, maxAngErr: 0, worst: null, ok: false,
  };
  if (blueWalls.length !== redWalls.length) { out.maxPosErr = Infinity; return out; }
  const used = new Uint8Array(redWalls.length);
  for (const w of blueWalls) {
    const m = mirror(w, cx, cy);
    let bi = -1, bd = Infinity;
    for (let i = 0; i < redWalls.length; i++) {
      if (used[i]) continue;
      const d = d2(m, redWalls[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) { out.maxPosErr = Infinity; return out; }
    used[bi] = 1;
    const r = redWalls[bi];
    const sizeErr = Math.max(Math.abs(w.len - r.len), Math.abs(w.thick - r.thick), Math.abs(w.h - r.h));
    const angErr = angleDiffModPi(w.angle, r.angle);
    if (bd > out.maxPosErr) { out.maxPosErr = bd; out.worst = { blue: { x: w.x, y: w.y }, red: { x: r.x, y: r.y }, err: bd }; }
    out.maxSizeErr = Math.max(out.maxSizeErr, sizeErr);
    out.maxAngErr = Math.max(out.maxAngErr, angErr);
  }
  out.ok = out.maxPosErr <= SYM_TOL.wall && out.maxSizeErr <= SYM_TOL.size && out.maxAngErr <= SYM_TOL.angle;
  return out;
}

/**
 * 藍紅基地鏡射差異報告。
 * @param L buildMobaLayout() 輸出
 * @param T buildTerrainShapes(L) 輸出
 * @returns {{ ok, maxErr, checks: [{ id, label, ok, err, detail }] }}
 */
export function buildBaseSymmetryReport(L, T) {
  const cx = T.meta.bounds.centerX, cy = T.meta.bounds.centerY;
  const B = T.meta.bases;
  const checks = [];
  const add = (id, label, err, detail = "", tol = SYM_TOL.point) =>
    checks.push({ id, label, ok: err <= tol, err: Number.isFinite(err) ? +err.toFixed(4) : Infinity, detail });

  // ── ① 關鍵單點：主堡 / 泉水 / 平台中心 ────────────────────────────────
  add("nexus", "主堡座標", d2(mirror(L.bases.blue, cx, cy), L.bases.red));
  add("fountain", "泉水座標", d2(mirror(L.fountains.blue, cx, cy), L.fountains.red));
  add("apron_center", "主堡平台中心", d2(mirror(B.blue.center, cx, cy), B.red.center));

  // ── ② 門牙塔：每方 2 座、逐座鏡射 ─────────────────────────────────────
  {
    const nb = T.nexusTurrets.filter((t) => t.side === "blue");
    const nr = T.nexusTurrets.filter((t) => t.side === "red");
    let err = nb.length === 2 && nr.length === 2 ? 0 : Infinity;
    if (Number.isFinite(err)) {
      for (const t of nb) {
        const m = mirror(t, cx, cy);
        err = Math.max(err, Math.min(...nr.map((r) => d2(m, r))));
      }
    }
    add("nexus_turret", "門牙塔（每方 2 座）", err, `藍 ${nb.length} / 紅 ${nr.length}`);
  }

  // ── ③ 兵線塔：18 座逐座鏡射（lane 依 MIRROR_LANE 配對）─────────────────
  {
    let hgErr = 0, allErr = 0, hgCount = { blue: 0, red: 0 };
    for (const lane of LANES3) {
      for (let tier = 0; tier < 3; tier++) {
        const b = T.towers.find((t) => t.side === "blue" && t.lane === lane && t.tier === tier);
        const r = T.towers.find((t) => t.side === "red" && t.lane === MIRROR_LANE[lane] && t.tier === tier);
        if (!b || !r) { allErr = Infinity; continue; }
        const e = d2(mirror(b, cx, cy), r);
        allErr = Math.max(allErr, e);
        if (b.kind === "highground") hgErr = Math.max(hgErr, e);
      }
    }
    for (const t of T.towers) if (t.kind === "highground") hgCount[t.side]++;
    add("highground_tower", "高地塔（每方 3 座）", hgErr, `藍 ${hgCount.blue} / 紅 ${hgCount.red}`);
    add("lane_tower", "兵線塔 18 座", allErr);
  }

  // ── ④ 基地多邊形：平台 / 內庭 / 主堡台 / 高地草地 ──────────────────────
  add("apron_poly", "高地平台外型", polyMirrorErr(B.blue.apronPoly, B.red.apronPoly, cx, cy));
  add("court_poly", "內庭鋪面外型", polyMirrorErr(B.blue.courtPoly, B.red.courtPoly, cx, cy));
  add("keep_poly", "主堡台外型", polyMirrorErr(B.blue.keepPoly, B.red.keepPoly, cx, cy));
  add("highland_poly", "高地草地外型", polyMirrorErr(B.blue.highlandPoly, B.red.highlandPoly, cx, cy));

  // ── ⑤ 三路出口通道 / 坡道（180° 旋轉把 top↔bot 互換 ⇒ 紅[i] 配 藍[2−i]）──
  {
    let ec = 0, rp = 0;
    for (let i = 0; i < 3; i++) {
      ec = Math.max(ec, polyMirrorErr(B.blue.exitCorridors[i].poly, B.red.exitCorridors[2 - i].poly, cx, cy));
      rp = Math.max(rp, polyMirrorErr(B.blue.ramps[i].poly, B.red.ramps[2 - i].poly, cx, cy));
    }
    add("exit_corridor", "三路出口淨空通道", ec);
    add("exit_ramp", "三路出口坡道", rp);
  }

  // ── ⑥ 高地牆體 / 主堡內牆 / 城門墩 / 池緣：逐段鏡射（含段數）────────────
  const sideOf = (w) => (d2(w, L.bases.blue) < d2(w, L.bases.red) ? "blue" : "red");
  for (const [kind, label] of [
    ["base_rim", "高地外牆段"], ["base_keep", "主堡內牆段"],
    ["base_gate", "城門墩／稜堡段"], ["fountain_rim", "泉水池緣段"],
  ]) {
    const all = T.wallItems.filter((w) => w.kind === kind);
    const bw = all.filter((w) => sideOf(w) === "blue"), rw = all.filter((w) => sideOf(w) === "red");
    const r = wallMirrorErr(bw, rw, cx, cy);
    checks.push({
      id: `wall_${kind}`, label, ok: r.ok,
      err: Number.isFinite(r.maxPosErr) ? +r.maxPosErr.toFixed(4) : Infinity,
      detail: `藍 ${r.count.blue} 段 / 紅 ${r.count.red} 段｜尺寸差 ${r.maxSizeErr.toFixed(3)}｜角度差 ${r.maxAngErr.toFixed(4)}`,
    });
  }

  // ── ⑦ 基地地面層：兩方層數相同、逐層頂點鏡射 ──────────────────────────
  //  ⚠ G.14-fix：這條原本的正則只涵蓋 base/slab/fountain/ramp/highland，
  //    **塔基座 towerpad_ 與塔前廣場 plaza_ 完全沒被驗到**，結果 plaza 的 blobRing
  //    外形兩方不同（畫面不對稱率 16.8%）卻一路綠燈。清單一律用 STRUCT_LAYER_RE，
  //    而且真正的把關在 tools/lib/baseSymmetryRaster.mjs 的逐像素比對
  //    ——那支不需要事先知道有哪些圖層，新增物件也躲不掉。
  {
    const pick = (side) => T.groundLayers
      .filter((g) => STRUCT_LAYER_RE.test(g.id) && g.id.includes(side));
    const bl = pick("blue"), rl = pick("red");
    let err = bl.length === rl.length ? 0 : Infinity;
    if (Number.isFinite(err)) {
      const rMap = new Map(rl.map((g) => [g.id, g]));
      for (const g of bl) {
        const r = rMap.get(mirrorLayerId(g.id));
        if (!r) { err = Infinity; break; }
        err = Math.max(err, polyMirrorErr(g.poly, r.poly, cx, cy));
      }
    }
    add("ground_layers", "基地地面層（平台/石板/泉水/坡道/高地）", err, `藍 ${bl.length} 層 / 紅 ${rl.length} 層`);
  }

  // ── ⑧ 地表色：兩方平台不得再用不同的隊色（G.14 要求收斂成中性石板灰）──────
  {
    const c = (side, part) => T.groundLayers.find((g) => g.id === `base_${side}_${part}`)?.color;
    const same = ["apron", "court", "keep"].every((p) => c("blue", p) === c("red", p));
    checks.push({
      id: "platform_color", label: "基地平台色（兩方應同色、中性石材）", ok: same, err: same ? 0 : Infinity,
      detail: same ? `#${(c("blue", "apron") ?? 0).toString(16).padStart(6, "0")}` : "藍紅平台色不同",
    });
  }

  const maxErr = Math.max(...checks.map((c) => (Number.isFinite(c.err) ? c.err : Infinity)));
  return { ok: checks.every((c) => c.ok), maxErr, checks };
}

/**
 * 主堡區的閱讀層級：泉水 → 主堡 → 門牙塔 → 主堡平台 → 三路出口 → 三座高地塔 → 內塔 → 外塔。
 * @returns {{ ok, sides: { blue: sideReport, red: sideReport } }}
 */
export function buildBaseHierarchyReport(L, T) {
  const cx = T.meta.bounds.centerX, cy = T.meta.bounds.centerY;
  const sides = {};
  for (const side of ["blue", "red"]) {
    const b = L.bases[side], f = L.fountains[side];
    const nt = T.nexusTurrets.filter((t) => t.side === side);
    const dist = (kind) => T.towers.filter((t) => t.side === side && t.kind === kind).map((t) => t.distToOwnBase);
    const hg = dist("highground"), inn = dist("inner"), out = dist("outer");
    const ntD = nt.map((t) => t.distToOwnBase);
    const dc = (p) => Math.hypot(p.x - cx, p.y - cy);
    const rows = [
      { id: "fountain", label: "泉水區", value: d2(f, b), note: "距主堡" },
      { id: "nexus", label: "主堡 / Nexus", value: 0, note: "層級原點" },
      { id: "nexus_turret", label: "門牙塔 ×2", value: Math.min(...ntD), note: `距主堡 ${Math.min(...ntD).toFixed(1)}` },
      { id: "keep_wall", label: "主堡內牆", value: BASE_GEO.keepWallR, note: "主堡台邊界" },
      { id: "apron", label: "主堡平台", value: BASE_GEO.apronR, note: "高地平台半徑" },
      { id: "highground", label: "高地塔 ×3", value: Math.min(...hg), note: `${Math.min(...hg).toFixed(1)}~${Math.max(...hg).toFixed(1)}` },
      { id: "inner", label: "內塔 ×3", value: Math.min(...inn), note: `${Math.min(...inn).toFixed(1)}~${Math.max(...inn).toFixed(1)}` },
      { id: "outer", label: "外塔 ×3", value: Math.min(...out), note: `${Math.min(...out).toFixed(1)}~${Math.max(...out).toFixed(1)}` },
    ];
    const checks = [
      { id: "fountain_behind", label: "泉水在主堡後方（離地圖中心更遠）", ok: dc(f) > dc(b) },
      { id: "turret_count", label: "門牙塔 = 2 座", ok: nt.length === 2 },
      { id: "highground_count", label: "高地塔 = 3 座", ok: hg.length === 3 },
      { id: "turret_on_keep", label: "門牙塔站在主堡台上（距主堡 < keepR）", ok: Math.max(...ntD) < BASE_GEO.keepR },
      { id: "turret_lr", label: "兩座門牙塔左右分立（間距 > 12）", ok: nt.length === 2 && d2(nt[0], nt[1]) > 12 },
      { id: "hg_band", label: `高地塔在 ${HIGHGROUND_BAND.min}~${HIGHGROUND_BAND.max} 環帶（不貼主堡、不跑到路中段）`, ok: Math.min(...hg) >= HIGHGROUND_BAND.min && Math.max(...hg) <= HIGHGROUND_BAND.max },
      { id: "hg_gap", label: "高地塔與門牙塔有層級距離（> 18）", ok: Math.min(...hg) - Math.max(...ntD) > 18 },
      { id: "hg_outside_wall", label: "高地塔在高地外牆之外（> apronR）", ok: Math.min(...hg) > BASE_GEO.apronR },
      { id: "order", label: "由主堡往外遞增：門牙 < 高地 < 內塔 < 外塔", ok: Math.max(...ntD) < Math.min(...hg) && Math.max(...hg) < Math.min(...inn) && Math.max(...inn) < Math.min(...out) },
    ];
    sides[side] = { rows, checks, ok: checks.every((c) => c.ok), order: TOWER_ORDER };
  }
  return { ok: sides.blue.ok && sides.red.ok, sides };
}

/**
 * 出口通道中心線（G.15-fix4）：blueprint 的 `zone_*_exit_*` item 自己帶的 `line`
 * ＝「主堡 → 內庭轉折點 → 城門 → 平台外 → 高地塔 → 再往外」的折線。
 *
 * ⚠ G.15-fix4 起**不能**再拿「主堡 → 高地塔」的直線來量。三個城門改成等角配置
 *   （三個方向共用同一份牆體模組的前提，見 mapBaseBlueprint 檔頭），門心與那條
 *   直線最多差 4.7 單位 ⇒ 沿直線取樣量到的是門柱側面，不是門的淨寬。
 *   英雄真正走的是這條折線：坡道、淨空通道、城門開口全部以它為中心線生成。
 */
function exitLineOf(T, side, lane) {
  const z = T.baseBlueprint[side].find((i) => i.kind === "exit_corridor" && i.lane === lane);
  return z?.line ?? [];
}

/**
 * 三路出口的實際可走淨寬：沿出口通道中心線取樣，用 passability 距離場量每一點的
 * 最近牆淨距，最窄處 ×2 就是該出口的可走淨寬。
 *
 * ⚠ 這是「肉眼看得到的那條路真的走得過去嗎」的直接量測，不是繞遠路的連通性證明：
 *   buildPassability 的 baseExit 路線允許繞路，出口被牆堵死時它可能改走別條路仍判綠。
 *
 * @param field buildPassability(L, T).field
 * @returns {{ ok, exits: [{ side, lane, minClear, width, ok, pinch }] }}
 */
export function buildBaseExitReport(L, T, field) {
  const clearAt = (x, y) => {
    const ix = field.gx(x), iy = field.gy(y);
    if (ix < 0 || iy < 0 || ix >= field.nx || iy >= field.ny) return 0;
    return field.dist[field.idx(ix, iy)] * field.cellToSim;
  };
  const exits = [];
  for (const side of ["blue", "red"]) {
    LANES3.forEach((lane) => {
      const line = exitLineOf(T, side, lane);
      let minClear = Infinity, pinch = null;
      for (let s = 0; s + 1 < line.length; s++) {
        const a = line[s], b2 = line[s + 1];
        const n = Math.max(2, Math.ceil(d2(a, b2) / 1.0));
        for (let i = 0; i <= n; i++) {
          const p = { x: a.x + (b2.x - a.x) * (i / n), y: a.y + (b2.y - a.y) * (i / n) };
          const c = clearAt(p.x, p.y);
          if (c < minClear) { minClear = c; pinch = { x: p.x, y: p.y, clear: c }; }
        }
      }
      exits.push({
        id: `${side}_${lane}`, side, lane,
        minClear: +minClear.toFixed(2), width: +(minClear * 2).toFixed(2),
        heroOk: minClear >= HERO_RADIUS,
        ok: minClear * 2 >= EXIT_MIN_WIDTH,
        pinch,
      });
    });
  }
  return { ok: exits.every((e) => e.ok), exits, minWidth: Math.min(...exits.map((e) => e.width)) };
}

/** 出口通道中心線（對外；verifier 的「出口不被牆堵住」也吃這條）。 */
export const baseExitLine = exitLineOf;

/** 門牙塔的擺法常數（給 verifier / debug 面板顯示用）。 */
export const NEXUS_TURRET_INFO = NEXUS_TURRET_GEO;

// ════════════════════════════════════════════════════════════════════════════
//  G.15：base blueprint 逐件對照
//
//  【為什麼還要一份】G.14 的報告比的是「結果」（多邊形、牆段），G.14-fix 的光柵比的
//   是「畫面」。兩者都能證明「看起來一樣」，但都證明不了**紅方是不是真的由藍方
//   blueprint 長出來的** —— 兩邊各自生成、碰巧長得一樣，也會全綠。
//   這份報告比的是「來源」：逐件 stable id 對照，紅方每一件都必須找得到藍方的來源件，
//   而且 position / rotation / scale / kind / height / thickness 全部符合 180° 變換。
// ════════════════════════════════════════════════════════════════════════════

/**
 * blueprint id 的鏡射（與 mapBaseBlueprint.mirrorBaseId 同一條規則）。
 * 這條規則是**對合**的（做兩次回到原本），所以藍→紅、紅→藍共用一支。
 */
export const mirrorBlueprintId = (id) => id
  .replace(/blue|red/, (s) => (s === "blue" ? "red" : "blue"))
  .replace(/(^|_)(top|bot)(?=_|$)/g, (m, a, ln) => `${a}${ln === "top" ? "bot" : "top"}`);

/** 角度差（mod 2π）取絕對值。 */
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * 藍紅 blueprint 的逐件對照報告。
 * @param T buildTerrainShapes(L) 輸出（需要 T.baseBlueprint 與 T.meta.bounds）
 */
export function buildBaseBlueprintReport(T) {
  const cx = T.meta.bounds.centerX, cy = T.meta.bounds.centerY;
  const BP = T.baseBlueprint;
  const rows = [];
  const add = (id, label, ok, detail = "") => rows.push({ id, label, ok, detail });

  add("count", "藍紅 blueprint 件數相同", BP.blue.length === BP.red.length,
    `藍 ${BP.blue.length} 件 / 紅 ${BP.red.length} 件`);

  // ── 每一件都要有 stable id，且不得重複 ──────────────────────────────────
  const blueIds = BP.blue.map((i) => i.id);
  add("stable_id", "每個結構件都有唯一 stable id",
    blueIds.every((s) => typeof s === "string" && s.length > 0) &&
    new Set(blueIds).size === blueIds.length,
    `${new Set(blueIds).size}/${blueIds.length} 個唯一 id`);

  // ── 紅方每一件都必須來自藍方某一件的鏡射（id 對得上 + 逐欄位符合）──────────
  const rMap = new Map(BP.red.map((i) => [i.id, i]));
  const bMap = new Map(BP.blue.map((i) => [i.id, i]));
  let miss = 0, posErr = 0, rotErr = 0, sizeErr = 0, kindBad = 0, polyErr = 0, orphan = 0;
  for (const it of BP.blue) {
    const r = rMap.get(mirrorBlueprintId(it.id));
    if (!r) { miss++; continue; }
    if (r.kind !== it.kind || r.role !== it.role) kindBad++;
    posErr = Math.max(posErr, d2({ x: 2 * cx - it.x, y: 2 * cy - it.y }, r));
    rotErr = Math.max(rotErr, angDiff(r.rot, it.rot + Math.PI));
    sizeErr = Math.max(sizeErr,
      Math.abs((r.len ?? 0) - (it.len ?? 0)),
      Math.abs((r.thick ?? 0) - (it.thick ?? 0)),
      Math.abs((r.h ?? 0) - (it.h ?? 0)));
    if (it.poly) {
      if (!r.poly || r.poly.length !== it.poly.length) polyErr = Infinity;
      else for (let k = 0; k < it.poly.length; k++) {
        polyErr = Math.max(polyErr, d2({ x: 2 * cx - it.poly[k].x, y: 2 * cy - it.poly[k].y }, r.poly[k]));
      }
    }
  }
  for (const it of BP.red) if (!bMap.has(mirrorBlueprintId(it.id))) orphan++;

  add("mirror_pair", "紅方每一件都對得上藍方的 id", miss === 0, `缺 ${miss} 件`);
  add("no_orphan", "紅方沒有「自己長出來」的孤兒件（unmatched item）", orphan === 0, `孤兒 ${orphan} 件`);
  add("kind", "配對件的 kind / role 相同", kindBad === 0, `不符 ${kindBad} 件`);
  add("position", "配對件的 position 精確鏡射", posErr < 1e-9, `最大誤差 ${posErr.toExponential(2)}`);
  add("rotation", "配對件的 rotation 精確鏡射（+π）", rotErr < 1e-9, `最大誤差 ${rotErr.toExponential(2)}`);
  add("scale", "配對件的 scale（長 / 厚 / 高）完全相同", sizeErr < 1e-9, `最大誤差 ${sizeErr.toExponential(2)}`);
  add("poly", "配對件的多邊形逐頂點鏡射", polyErr < 1e-9,
    Number.isFinite(polyErr) ? `最大誤差 ${polyErr.toExponential(2)}` : "頂點數不符");

  // ── 基地核心結構不得有 jitter：同一種牆的 len / thick / h 只能有一組值 ────────
  {
    const bad = [];
    for (const kind of ["base_rim", "base_keep", "base_gate", "fountain_rim"]) {
      const ws = BP.blue.filter((i) => i.kind === kind);
      if (!ws.length) continue;
      for (const f of ["len", "thick", "h"]) {
        const vals = new Set(ws.map((w) => +w[f].toFixed(9)));
        if (vals.size > 1) bad.push(`${kind}.${f}×${vals.size}`);
      }
    }
    add("no_jitter", "基地結構牆的 len / thick / height 沒有 jitter（各只有一種值）",
      bad.length === 0, bad.length ? bad.join("／") : "全部收斂");
  }

  // ══ G.15-fix4：三個出口是否**真的**由同一份模組旋轉而來 ═══════════════════
  //
  //  【這一條才是本輪的驗收核心】G.14／G.15 的報告驗的都是「藍紅對不對稱」與
  //   「每個門自己左右對不對稱」——三個方向**同樣**破碎、或三個方向各自左右對稱
  //   但彼此完全不同，這些判準一律全綠。使用者在瀏覽器看到的正是後者。
  //
  //  這裡改成驗「來源」：把三個出口的每一件牆體轉回**模組局部座標**
  //  （繞高地平台中心 C 旋轉 −bearing），要求三個方向逐件重合到 1e-9。
  //  ⇒ 牆段數／門柱數／翼牆長／肩牆長／牆高／牆厚／出口寬，任何一項不同都會被抓到。
  //
  //  ⚠ 這是**必要條件不是充分條件**。最終驗收仍以瀏覽器 3D 固定截圖為準
  //    （review/moba-map/g15-fix4/）。數字全綠但畫面不合格時，以畫面為準。
  const EXIT_ID_RE = /^wall_(?:blue|red)_exit_(top|mid|bot)_(.+)$/;
  const normAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /** 某一方三個出口的牆體 → 模組局部座標（lane → part → 局部欄位）。 */
  const exitLocals = (side) => {
    const C = BP[side].find((i) => i.kind === "apron_center");
    const bearing = new Map(BP[side].filter((i) => i.kind === "gate").map((g) => [g.lane, g.rot]));
    const out = new Map();
    for (const it of BP[side]) {
      const m = EXIT_ID_RE.exec(it.id || "");
      if (!m) continue;
      const [, lane, part] = m;
      const th = bearing.get(lane);
      if (th === undefined) continue;
      //  世界 → 局部：繞 C 轉 −th。rot 用 atan2(dx,dy) 慣例 ⇒ 局部 rot = rot + th。
      const c = Math.cos(th), s = Math.sin(th);
      const dx = it.x - C.x, dy = it.y - C.y;
      if (!out.has(lane)) out.set(lane, new Map());
      out.get(lane).set(part, {
        lx: dx * c + dy * s, ly: -dx * s + dy * c,
        lrot: normAng(it.rot + th),
        len: it.len, thick: it.thick, h: it.h, kind: it.kind,
      });
    }
    return out;
  };

  const localsBySide = { blue: exitLocals("blue"), red: exitLocals("red") };

  // ① 三個出口逐件重合：同一份模組、同樣的元件、同樣的局部座標
  {
    const bad = [];
    let worst = 0, partCount = 0;
    for (const side of ["blue", "red"]) {
      const byLane = localsBySide[side];
      const lanes = [...byLane.keys()];
      if (lanes.length !== 3) { bad.push(`${side} 只有 ${lanes.length} 個出口牆組`); continue; }
      const ref = byLane.get(lanes[0]);
      partCount = ref.size;
      for (const lane of lanes.slice(1)) {
        const cur = byLane.get(lane);
        if (cur.size !== ref.size) { bad.push(`${side} ${lane} 元件數 ${cur.size} ≠ ${ref.size}`); continue; }
        for (const [part, a] of ref) {
          const c = cur.get(part);
          if (!c) { bad.push(`${side} ${lane} 缺元件 ${part}`); continue; }
          if (c.kind !== a.kind) { bad.push(`${side} ${lane} ${part} kind 不同`); continue; }
          const e = Math.max(
            Math.abs(c.lx - a.lx), Math.abs(c.ly - a.ly),
            Math.abs(normAng(c.lrot - a.lrot)),
            Math.abs(c.len - a.len), Math.abs(c.thick - a.thick), Math.abs(c.h - a.h));
          worst = Math.max(worst, e);
          if (e > 1e-9) bad.push(`${side} ${lane} ${part} 偏差 ${e.toExponential(2)}`);
        }
      }
    }
    add("module_congruent",
      "三個出口的牆體逐件由同一份模組旋轉而來（轉回局部座標後完全重合）",
      bad.length === 0, bad.length ? bad.slice(0, 4).join("／")
        : `每個出口 ${partCount} 件，最大偏差 ${worst.toExponential(2)}`);
  }

  // ② 模組必須含使用者指定的七個元件（翼牆 / 門柱 / 出口 / 肩牆）
  {
    const REQUIRED = ["flankLeft", "pierLeft", "pierRight", "flankRight", "shoulderLeft", "shoulderRight"];
    const bad = [];
    for (const side of ["blue", "red"]) {
      for (const [lane, parts] of localsBySide[side]) {
        const names = new Set([...parts.keys()].map((k) => k.replace(/_\d+$/, "")));
        for (const r of REQUIRED) if (!names.has(r)) bad.push(`${side} ${lane} 缺 ${r}`);
      }
    }
    add("module_parts",
      "每個出口都有 flankLeft／pierLeft／gate／pierRight／flankRight／shoulderLeft／shoulderRight",
      bad.length === 0, bad.length ? bad.slice(0, 4).join("／") : "六個實體元件 + 中央出口開口");
  }

  // ③ 模組自身左右鏡射：左右翼牆、左右門柱、左右肩牆對局部 x 軸互為鏡射
  {
    const bad = [];
    let worst = 0;
    for (const side of ["blue", "red"]) {
      for (const [lane, parts] of localsBySide[side]) {
        for (const [l, r] of [["flankLeft", "flankRight"], ["pierLeft", "pierRight"], ["shoulderLeft", "shoulderRight"]]) {
          const ls = [...parts].filter(([k]) => k === l || k.startsWith(`${l}_`));
          const rs = [...parts].filter(([k]) => k === r || k.startsWith(`${r}_`));
          if (ls.length !== rs.length) { bad.push(`${side} ${lane} ${l}/${r} 段數 ${ls.length}/${rs.length}`); continue; }
          for (let i = 0; i < ls.length; i++) {
            const a = ls[i][1], c = rs[i][1];
            const e = Math.max(Math.abs(a.lx - c.lx), Math.abs(a.ly + c.ly),
              Math.abs(a.len - c.len), Math.abs(a.thick - c.thick), Math.abs(a.h - c.h));
            worst = Math.max(worst, e);
            if (e > 1e-9) bad.push(`${side} ${lane} ${l}[${i}] 與 ${r}[${i}] 不鏡射（${e.toExponential(2)}）`);
          }
        }
      }
    }
    add("module_lr_mirror", "模組自身左右鏡射（左右翼牆／門柱／肩牆對出口中軸互為鏡射）",
      bad.length === 0, bad.length ? bad.slice(0, 4).join("／") : `最大偏差 ${worst.toExponential(2)}`);
  }

  // ④ 出口淨寬：兩根門柱內緣的側向距離，三個方向一律 = gateClear
  {
    const widths = [];
    for (const side of ["blue", "red"]) {
      for (const [, parts] of localsBySide[side]) {
        const pl = parts.get("pierLeft"), pr = parts.get("pierRight");
        if (!pl || !pr) { widths.push(NaN); continue; }
        widths.push(Math.abs(pl.ly - pr.ly) - (pl.thick + pr.thick) / 2);
      }
    }
    const worst = Math.max(...widths.map((w) => Math.abs(w - BASE_GEO.gateClear)));
    add("gate_clear",
      `六個出口的門柱淨開口都 = gateClear（${BASE_GEO.gateClear}）`,
      Number.isFinite(worst) && worst < 1e-9,
      `${widths.length} 個出口，${Math.min(...widths).toFixed(3)}~${Math.max(...widths).toFixed(3)}`);
  }

  // ⑤ 【本輪最關鍵的一條】基地牆體**只有**模組這一個來源
  //
  //  Codex 第一輪視覺審查的 FAIL 就是踩在這裡：模組本體逐件相同，但模組**之外**
  //  還有兩段後翼牆（只接在扇形最外兩端）與一圈主堡內牆（三路共用一個開口），
  //  於是外側兩個出口各有一側接長弧牆、中間的出口兩側都接鄰居 ⇒ 可見牆廓不同。
  //  現在整個拿掉：城牆長度由模組的 flankSegs 決定、內牆由 shoulderSegs 決定。
  //  ⇒ 每一段基地牆都能指名「屬於哪個出口模組的哪一個元件」。
  //  （泉水池緣 fountain_rim 不在此列：它是泉水的設施，位於城牆之外、基地後方。）
  {
    const OK_RE = /^wall_(?:blue|red)_(?:exit_(?:top|mid|bot)_|fountainrim_)/;
    const stray = [];
    for (const side of ["blue", "red"]) {
      for (const it of BP[side]) if (it.role === "wall" && !OK_RE.test(it.id)) stray.push(it.id);
    }
    add("wall_single_source",
      "基地牆體只有一個來源：每一段都屬於三個出口模組之一（沒有後翼牆、沒有另一圈共用內牆、沒有補丁牆）",
      stray.length === 0,
      stray.length ? `模組以外的牆 ${stray.length} 段：${stray.slice(0, 3).join(",")}` : "全部出自模組");
  }

  // ⑥ 整道城牆對「出口扇形中軸」左右鏡射
  //
  //  【為什麼要這一條，以及它為什麼是能做到的極限】
  //   三個模組首尾相接之後，整道城牆必然有兩個端點（牆不可能繞成一整圈：外牆圓
  //   在基地後方正好穿過泉水，繼續繞會切進泉水平台）。所以「最外側兩個出口的外側
  //   是牆的盡頭、中間那個出口兩側都是鄰居」這件事是幾何上避不掉的。
  //   能保證、也應該保證的是：**這兩個端點對出口扇形中軸完全鏡射** ⇒ top 與 bot
  //   互為鏡像、mid 自身左右對稱，沒有任何一個方向「多一塊」或「少一塊」。
  //
  //   這條檢查把每一段基地牆對中軸鏡射後，要求在原集合裡找得到完全相同的一段
  //   （位置 / 長 / 厚 / 高 / 角度 mod π）⇒ 用整體對稱性補上「單一模組相同」之外
  //   的另一半保證。
  {
    const bad = [];
    let worst = 0, n = 0;
    for (const side of ["blue", "red"]) {
      const C = BP[side].find((i) => i.kind === "apron_center");
      const c = Math.cos(C.rot), s = Math.sin(C.rot);
      const walls = BP[side].filter((i) => i.role === "wall" && i.kind !== "fountain_rim");
      n = walls.length;
      //  世界 → 中軸局部（+x = 中軸）；牆是無向長方體 ⇒ 角度比 mod π
      const local = walls.map((w) => {
        const dx = w.x - C.x, dy = w.y - C.y;
        let a = (w.rot + C.rot) % Math.PI; if (a < 0) a += Math.PI;
        return { x: dx * c + dy * s, y: -dx * s + dy * c, a, len: w.len, thick: w.thick, h: w.h, id: w.id };
      });
      for (const p of local) {
        //  對 x 軸鏡射：y → −y、角度 → π − a（再 mod π）
        let ma = (Math.PI - p.a) % Math.PI; if (ma < 0) ma += Math.PI;
        let best = Infinity;
        for (const q of local) {
          if (Math.abs(q.len - p.len) > 1e-9 || Math.abs(q.thick - p.thick) > 1e-9 || Math.abs(q.h - p.h) > 1e-9) continue;
          const da = Math.min(Math.abs(q.a - ma), Math.PI - Math.abs(q.a - ma));
          best = Math.min(best, Math.max(Math.hypot(q.x - p.x, q.y + p.y), da));
        }
        worst = Math.max(worst, best);
        if (best > 1e-6) bad.push(`${p.id} 找不到鏡射對應段（最小誤差 ${best.toFixed(3)}）`);
      }
    }
    add("wall_fan_mirror",
      "整道城牆對出口扇形中軸完全鏡射（top 與 bot 互為鏡像、mid 自身左右對稱；兩個牆端等長對稱）",
      bad.length === 0,
      bad.length ? bad.slice(0, 3).join("／") : `每方 ${n} 段，最大鏡射誤差 ${worst.toExponential(2)}`);
  }

  // ── 三路出口：資訊欄位（供 debug 面板顯示；判準在 buildBaseExitReport）────────
  const exits = [];
  for (const side of ["blue", "red"]) {
    const items = BP[side];
    const base = items.find((i) => i.kind === "keep");
    for (const g of items.filter((i) => i.kind === "gate")) {
      const ux = Math.cos(g.rot), uy = Math.sin(g.rot);
      let left = Infinity, right = Infinity;
      for (const w of items.filter((i) => i.role === "wall" && (i.kind === "base_rim" || i.kind === "base_gate"))) {
        const rx = w.x - base.x, ry = w.y - base.y;
        if (rx * ux + ry * uy < 0) continue;
        const off = -rx * uy + ry * ux;
        const clear = Math.abs(off) - w.thick / 2;
        if (off >= 0) left = Math.min(left, clear); else right = Math.min(right, clear);
      }
      exits.push({
        side, lane: g.lane,
        left: Number.isFinite(left) ? +left.toFixed(3) : null,
        right: Number.isFinite(right) ? +right.toFixed(3) : null,
      });
    }
  }
  {
    //  藍 lane ↔ 紅 MIRROR_LANE 的左右淨距必須一模一樣
    let mErr = 0;
    for (const e of exits.filter((x) => x.side === "blue")) {
      const r = exits.find((x) => x.side === "red" && x.lane === MIRROR_LANE[e.lane]);
      mErr = Math.max(mErr, Math.abs((e.left ?? -1) - (r.left ?? -1)), Math.abs((e.right ?? -1) - (r.right ?? -1)));
    }
    add("exit_lr_mirror", "藍 lane ↔ 紅 lane 的出口左右淨距完全相同",
      mErr < 1e-9, `最大差 ${mErr.toExponential(2)}`);
  }

  // ── 門牙塔 / 高地塔到主堡中心的距離：兩方逐座一致 ───────────────────────────
  {
    const distOf = (side, kind) => BP[side].filter((i) => i.kind === kind)
      .map((i) => {
        const k = BP[side].find((x) => x.kind === "keep");
        return +Math.hypot(i.x - k.x, i.y - k.y).toFixed(6);
      }).sort((a, b) => a - b);
    for (const [kind, label] of [["nexus_turret", "門牙塔"], ["highground_tower", "高地塔"]]) {
      const b = distOf("blue", kind), r = distOf("red", kind);
      add(`dist_${kind}`, `${label}距主堡中心：兩方逐座相同`,
        b.length === r.length && b.every((v, i) => Math.abs(v - r[i]) < 1e-9),
        `藍 ${b.map((v) => v.toFixed(1)).join("/")}｜紅 ${r.map((v) => v.toFixed(1)).join("/")}`);
    }
  }

  return { ok: rows.every((r) => r.ok), rows, exits, count: BP.blue.length };
}
