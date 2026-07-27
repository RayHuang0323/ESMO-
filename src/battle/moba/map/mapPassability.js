// ============================================================================
//  battle/moba/map/mapPassability.js — 英雄通行驗證（Milestone G.7）
//
//  【要解決的問題】前幾輪的「可走性」只檢查「牆段中心線有沒有直接穿牆」，那是
//    **點**的判斷。真正的英雄有碰撞半徑（1.2），一個看起來有縫的入口，膨脹半徑後
//    可能其實過不去。本檔用**格點 + 距離場（distance transform）** 做真正的通行驗證：
//
//    1. 把所有牆體（草叢除外，草叢可穿越）柵格化成障礙格。
//    2. 算每一個空地格「離最近牆的淨距」（chamfer 距離場）。
//    3. 一條路線 s→t 在「淨距 ≥ w/2」的子圖裡若連通，代表這條路**淨寬 ≥ w**。
//       用二分搜尋求最大可通過淨寬 ⇒ 這就是「路線最窄處的淨寬」。
//    4. 英雄可達 = 最窄淨寬 ≥ HERO_DIAMETER（2.4）。符合規格 = 最窄淨寬 ≥ 該類下限。
//
//  ⚠ 純資料 / 純函式，無 THREE/React，不使用 Math.random()。
//  ⚠ 不改 gameData.js、不改模擬。草叢（bushClusters）**不算障礙**（可穿越視野遮蔽）。
// ============================================================================
import { pointInPoly } from "./mapShapePrimitives.js";

/** 英雄碰撞尺寸（模擬單位）。G.9：以英雄半徑 2.4 作為驗證基準（比 G.7/G.8 的 1.2 更嚴）。 */
export const HERO_RADIUS = 2.4;
export const HERO_DIAMETER = 4.8;

/** 各類通道的最低淨寬（模擬單位）。verifier 以此把關（G.9 門檻）。 */
export const CORRIDOR_MIN = Object.freeze({
  jungleMain: 7.2,   // 主要道路 / 野區幹道
  campLink: 6.0,     // 一般野區通道 / 營地連接道
  shortcut: 6.0,     // 次要捷徑（G.9 提高到 6.0）
  baseExit: 8.0,     // 基地出口
  riverMouth: 7.0,   // 河口 / 坑口
});

const CELL = 1.0;   // 格點解析度（模擬單位）；1.0 對 220×220 = 48,400 格，足夠量測淨寬

/**
 * 把地圖柵格化，算出「離最近牆的淨距場」D（模擬單位）。
 * 障礙 = 所有 wallItems（草叢除外）＋ 競技場外。
 */
function buildField(T) {
  const B = T.meta.bounds;
  const nx = Math.ceil((B.maxX - B.minX) / CELL) + 1;
  const ny = Math.ceil((B.maxY - B.minY) / CELL) + 1;
  const gx = (x) => Math.round((x - B.minX) / CELL);
  const gy = (y) => Math.round((y - B.minY) / CELL);
  const idx = (ix, iy) => iy * nx + ix;
  const INF = 1e9;
  // dist（以「格」為單位的 chamfer 值，最後 ×CELL 換回模擬單位）
  const dist = new Float32Array(nx * ny).fill(INF);
  const wall = new Uint8Array(nx * ny);       // 1 = 障礙格
  const wallId = new Int32Array(nx * ny).fill(-1); // 最近障礙來源的 wallItems 索引（供回報阻擋牆）

  const arena = T.meta.arenaSmooth;
  // 競技場外 = 障礙（避免把「地圖外」當成可走）
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = B.minX + ix * CELL, y = B.minY + iy * CELL;
    if (!pointInPoly(x, y, arena)) { wall[idx(ix, iy)] = 1; dist[idx(ix, iy)] = 0; }
  }
  // 牆段柵格化（不膨脹；膨脹留給「淨距 ≥ HERO_RADIUS」的判斷）
  T.wallItems.forEach((w, wi) => {
    const half = w.len / 2, ux = Math.sin(w.angle), uy = Math.cos(w.angle), rad = w.thick / 2;
    const steps = Math.max(1, Math.ceil(w.len / CELL));
    for (let s = 0; s <= steps; s++) {
      const t = -half + (w.len * s) / steps, bx = w.x + ux * t, by = w.y + uy * t;
      const rc = Math.ceil(rad / CELL);
      for (let dyc = -rc; dyc <= rc; dyc++) for (let dxc = -rc; dxc <= rc; dxc++) {
        if (Math.hypot(dxc * CELL, dyc * CELL) > rad) continue;
        const ix = gx(bx) + dxc, iy = gy(by) + dyc;
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
        const id = idx(ix, iy);
        wall[id] = 1; dist[id] = 0; if (wallId[id] < 0) wallId[id] = wi;
      }
    }
  });

  // Chamfer 距離變換（兩趟；a=1, b=√2 近似歐氏），並傳播 wallId
  const A = 1, Bd = Math.SQRT2;
  const relax = (id, nid, cost) => {
    if (dist[nid] + cost < dist[id]) { dist[id] = dist[nid] + cost; wallId[id] = wallId[nid]; }
  };
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const id = idx(ix, iy); if (wall[id]) continue;
    if (ix > 0) relax(id, idx(ix - 1, iy), A);
    if (iy > 0) relax(id, idx(ix, iy - 1), A);
    if (ix > 0 && iy > 0) relax(id, idx(ix - 1, iy - 1), Bd);
    if (ix < nx - 1 && iy > 0) relax(id, idx(ix + 1, iy - 1), Bd);
  }
  for (let iy = ny - 1; iy >= 0; iy--) for (let ix = nx - 1; ix >= 0; ix--) {
    const id = idx(ix, iy); if (wall[id]) continue;
    if (ix < nx - 1) relax(id, idx(ix + 1, iy), A);
    if (iy < ny - 1) relax(id, idx(ix, iy + 1), A);
    if (ix < nx - 1 && iy < ny - 1) relax(id, idx(ix + 1, iy + 1), Bd);
    if (ix > 0 && iy < ny - 1) relax(id, idx(ix - 1, iy + 1), Bd);
  }
  return { B, nx, ny, gx, gy, idx, dist, wall, wallId, cellToSim: CELL };
}

/** 把 (x,y) 吸附到最近的可走格（淨距 ≥ minClear），找不到回傳 null。 */
function snap(F, x, y, minClear) {
  const { nx, ny, gx, gy, idx, dist } = F;
  const cx = gx(x), cy = gy(y);
  for (let r = 0; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const ix = cx + dx, iy = cy + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      if (dist[idx(ix, iy)] * F.cellToSim >= minClear) return [ix, iy];
    }
  }
  return null;
}

/** s,t 在「淨距 ≥ clear」子圖是否連通（BFS）。回傳 { ok, path }。 */
function connectedAt(F, s, t, clear) {
  const { nx, ny, idx, dist, cellToSim } = F;
  const need = clear / cellToSim;
  const sId = idx(s[0], s[1]), tId = idx(t[0], t[1]);
  if (dist[sId] < need || dist[tId] < need) return { ok: false, path: null };
  const seen = new Uint8Array(nx * ny), prev = new Int32Array(nx * ny).fill(-1);
  const q = [sId]; seen[sId] = 1;
  let head = 0;
  while (head < q.length) {
    const id = q[head++]; if (id === tId) break;
    const ix = id % nx, iy = (id / nx) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const jid = idx(jx, jy);
      if (seen[jid] || dist[jid] < need) continue;
      seen[jid] = 1; prev[jid] = id; q.push(jid);
    }
  }
  if (!seen[tId]) return { ok: false, path: null };
  const path = []; let cur = tId;
  while (cur !== -1) { path.push([cur % nx, (cur / nx) | 0]); cur = prev[cur]; }
  return { ok: true, path: path.reverse() };
}

/** 對一條路線求最大可通過淨寬（二分），並回傳路徑長度與最窄處。 */
function evalRoute(F, s, t, maxWidth = 18) {
  // 先確認英雄半徑下可達
  const base = connectedAt(F, s, t, HERO_RADIUS);
  if (!base.ok) return { reachable: false, narrowest: 0, length: Infinity, pinch: null, path: null };
  // 二分最大淨寬
  let lo = HERO_DIAMETER, hi = maxWidth, bestPath = base.path;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    const r = connectedAt(F, s, t, mid / 2);
    if (r.ok) { lo = mid; bestPath = r.path; } else hi = mid;
  }
  const narrowest = lo;
  // 路徑長度（模擬單位）＋ 最窄處格（淨距最小的路徑格）
  let length = 0, pinch = null, minD = Infinity;
  const { dist, cellToSim, B } = F;
  for (let i = 0; i < bestPath.length; i++) {
    const [ix, iy] = bestPath[i];
    if (i > 0) {
      const [px, py] = bestPath[i - 1];
      length += Math.hypot(ix - px, iy - py) * cellToSim;
    }
    const d = dist[F.idx(ix, iy)];
    if (d < minD) { minD = d; pinch = { x: B.minX + ix * cellToSim, y: B.minY + iy * cellToSim, clear: d * cellToSim }; }
  }
  return { reachable: true, narrowest, length, pinch, path: bestPath };
}

/** 找出「最窄處」附近的阻擋牆（回傳 kind / struct / 位置），供回報 blockingChains。 */
function blockersNear(F, T, pinch, radius = 4) {
  if (!pinch) return [];
  const out = new Map();
  for (const w of T.wallItems) {
    const d = Math.hypot(w.x - pinch.x, w.y - pinch.y);
    if (d <= radius + w.thick / 2 + w.len / 2) {
      const key = w.struct ?? w.kind;
      if (!out.has(key)) out.set(key, { id: key, kind: w.kind, x: w.x, y: w.y });
    }
  }
  return [...out.values()].slice(0, 6);
}

/** 距離 p 最近的 lane 中心點（回傳 {x,y}）。 */
function nearestLanePoint(lanePts, p) {
  let best = lanePts[0], bd = Infinity;
  for (const q of lanePts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
  return best;
}

/**
 * 建立「必要路線清單」（座標取自 L / T）。每條 { id, label, type, from, to }。
 */
export function buildRequiredRoutes(L, T) {
  const routes = [];
  const B = T.meta.bounds, cx = B.centerX, cy = B.centerY;
  const camps = T.camps;
  const buffs = camps.filter((c) => c.type === "buff");
  const lanes = { top: L.lanes.top, mid: L.lanes.mid, bot: L.lanes.bot };

  // 1) 雙方基地 → 三路（測基地出口）
  for (const side of ["blue", "red"]) {
    const base = L.bases[side];
    for (const ln of ["top", "mid", "bot"]) {
      const pts = lanes[ln];
      const frac = side === "blue" ? 0.35 : 0.65;
      const to = pts[Math.round(frac * (pts.length - 1))];
      routes.push({ id: `${side}_base_${ln}`, label: `${side === "blue" ? "藍" : "紅"}方基地→${ln === "top" ? "上路" : ln === "mid" ? "中路" : "下路"}`, type: "baseExit", from: base, to });
    }
  }

  // 2) 四野區營地互通（每個營地連到最近的 1~2 個其它營地）
  const seenPair = new Set();
  for (const c of camps) {
    const others = camps.filter((o) => o.id !== c.id).map((o) => ({ o, d: Math.hypot(o.x - c.x, o.y - c.y) })).sort((a, b) => a.d - b.d);
    for (const { o } of others.slice(0, 2)) {
      const key = [c.id, o.id].sort().join("|");
      if (seenPair.has(key)) continue; seenPair.add(key);
      routes.push({ id: `camp_${key}`, label: `營地互通 ${c.label}↔${o.label}`, type: "campLink", from: c, to: o });
    }
  }

  // 3) 每個 Buff → 最近河口（坑口）
  for (const bf of buffs) {
    const pit = [L.pits.dragon, L.pits.baron].map((p) => ({ p, d: Math.hypot(p.x - bf.x, p.y - bf.y) })).sort((a, b) => a.d - b.d)[0].p;
    routes.push({ id: `buff_river_${bf.id}`, label: `${bf.label}→最近河口`, type: "riverMouth", from: bf, to: pit });
  }

  // 4) 每個 Buff → 最近兩條兵線
  for (const bf of buffs) {
    const nearest2 = ["top", "mid", "bot"].map((ln) => ({ ln, p: nearestLanePoint(lanes[ln], bf) }))
      .map((o) => ({ ...o, d: Math.hypot(o.p.x - bf.x, o.p.y - bf.y) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { ln, p } of nearest2) {
      routes.push({ id: `buff_lane_${bf.id}_${ln}`, label: `${bf.label}→${ln === "top" ? "上路" : ln === "mid" ? "中路" : "下路"}`, type: "campLink", from: bf, to: p });
    }
  }

  // 5) Dragon / Baron Pit：至少兩個方向可進出（用兩個入口節點作終點）
  for (const [id, pit] of [["dragon", L.pits.dragon], ["baron", L.pits.baron]]) {
    const ents = T.entrances.filter((e) => e.kind === "pit" && e.key.startsWith(`ent_${id}`));
    ents.slice(0, 2).forEach((e, i) => {
      // 終點取入口外一小段的野區點
      const to = { x: e.x + Math.cos(e.angle) * 8, y: e.y + Math.sin(e.angle) * 8 };
      routes.push({ id: `pit_${id}_${i}`, label: `${id === "dragon" ? "小龍" : "巴龍"}坑出入口${i + 1}`, type: "riverMouth", from: pit, to });
    });
  }

  // 6) 河道上下兩端連通（巴龍河口 ↔ 小龍河口）
  routes.push({ id: "river_span", label: "河道上下連通（巴龍↔小龍）", type: "jungleMain", from: L.pits.baron, to: L.pits.dragon });

  // 7) 中路兩側野區互通（藍上野 ↔ 藍下野；紅上野 ↔ 紅下野）。
  //    用「離該象限最近的營地口袋」當端點（營地天生可走），避免象限名目中心點落在牆/坑裡。
  const q = Object.fromEntries(L.quadrants.map((x) => [x.id, x]));
  const nearestCamp = (qq) => camps.map((c) => ({ c, d: Math.hypot(c.x - qq.x, c.y - qq.y) })).sort((a, b) => a.d - b.d)[0].c;
  routes.push({ id: "jungle_blue_cross", label: "藍側上野↔下野互通", type: "jungleMain", from: nearestCamp(q.blue_top), to: nearestCamp(q.blue_bot) });
  routes.push({ id: "jungle_red_cross", label: "紅側上野↔下野互通", type: "jungleMain", from: nearestCamp(q.red_top), to: nearestCamp(q.red_bot) });

  return routes;
}

/**
 * 主入口：驗證所有必要路線。
 * @returns {{ field, routes: [{ id,label,type,minWidth,reachable,narrowest,length,blockingChains }] }}
 */
export function buildPassability(L, T) {
  const F = buildField(T);
  const required = buildRequiredRoutes(L, T);
  const routes = required.map((r) => {
    const minWidth = CORRIDOR_MIN[r.type];
    const s = snap(F, r.from.x, r.from.y, HERO_RADIUS);
    const t = snap(F, r.to.x, r.to.y, HERO_RADIUS);
    if (!s || !t) {
      return { ...r, minWidth, reachable: false, narrowest: 0, length: Infinity, blockingChains: [], pinch: null };
    }
    const ev = evalRoute(F, s, t);
    return {
      ...r, minWidth,
      reachable: ev.reachable,
      meetsSpec: ev.reachable && ev.narrowest >= minWidth,
      narrowest: Math.round(ev.narrowest * 100) / 100,
      length: ev.reachable ? Math.round(ev.length * 10) / 10 : Infinity,
      pinch: ev.pinch,
      blockingChains: ev.reachable && ev.narrowest >= minWidth ? [] : blockersNear(F, T, ev.pinch),
      path: ev.path,
    };
  });
  return { field: F, routes };
}
