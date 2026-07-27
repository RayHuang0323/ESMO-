// ============================================================================
//  battle/moba/map/mapShapePrimitives.js — 地形形狀的純幾何工具（Milestone F）
//
//  gameData.js 的地形只有「稀疏折線」（牆 28 點、河 7 點、lane 9~13 點）。直接把
//  相鄰兩點連成一塊 box ⇒ 長方積木感。這裡提供把稀疏折線變成「自然地形形狀」的
//  基礎運算：曲線細分、法線擾動、帶狀外框、環狀開口、折線 → 牆段。
//
//  ⚠ 全部是**決定性**函式（同輸入必同輸出），一律不使用 Math.random()：
//    · verifier check_moba_map 會直接判紅；
//    · 每次 re-render 若形狀會抖動，地圖無法當美術基準。
//  ⚠ 純幾何，無 THREE / React；單位一律「模擬座標」(0..220)，高度除外（見呼叫端）。
// ============================================================================

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapDelta = (a, b) => Math.abs(((a - b + Math.PI) % TAU) - Math.PI);

/** 決定性偽亂數 0..1（取代 Math.random）。 */
export function hash01(i, seed = 0) {
  const s = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** 低頻平滑擾動 -1..1：兩個不同週期的 sin 疊加，讀起來像自然轉折而非雜訊。 */
export function swobble(i, seed = 0, freq = 0.33) {
  return Math.sin(i * freq + seed * 1.7) * 0.62 + Math.sin(i * freq * 2.37 + seed * 3.1) * 0.38;
}

/** 折線總長度（模擬單位）。 */
export function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

/**
 * Catmull-Rom 細分：把稀疏折線補成密集平滑曲線（step = 取樣間距，模擬單位）。
 * 額外屬性 r 以線性內插保留。closed=true 時首尾相接（環狀地形用）。
 */
export function smoothPath(pts, step, { closed = false } = {}) {
  if (!pts || pts.length < 2) return (pts || []).map((p) => ({ ...p }));
  const n = pts.length;
  const P = closed
    ? (i) => pts[((i % n) + n) % n]
    : (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segs = Math.max(1, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < segs; k++) {
      const t = k / segs, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({
        x: cr(p0.x, p1.x, p2.x, p3.x),
        y: cr(p0.y, p1.y, p2.y, p3.y),
        r: p1.r != null ? lerp(p1.r, p2.r ?? p1.r, t) : undefined,
      });
    }
  }
  if (!closed) out.push({ ...pts[n - 1] });
  return out;
}

/**
 * 沿法線做低頻側移 ⇒ 牆/路/河不再是「幾何直線」。
 * 開放折線兩端 taper 回 0，確保不偏離 gameData 的原始座標端點。
 */
export function wobblePath(pts, amp, seed, { closed = false } = {}) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const taper = closed ? 1 : Math.min(1, Math.min(i, n - 1 - i) / Math.max(1, n * 0.18));
    const w = swobble(i, seed) * amp * taper;
    return { ...p, x: p.x - dy * w, y: p.y + dx * w };
  });
}

/**
 * 沿折線的「寬度曲線」：keyframes = [[t, k], ...]（t 0..1 由頭到尾，k = 寬度倍率），
 * 線性內插。用來做「河灣 → 窄河道 → 河口」這種寬窄變化，而不是等寬的長方帶。
 */
export function widthProfile(keys) {
  const K = [...keys].sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (t <= K[0][0]) return K[0][1];
    if (t >= K[K.length - 1][0]) return K[K.length - 1][1];
    for (let i = 1; i < K.length; i++) {
      if (t <= K[i][0]) {
        const [t0, k0] = K[i - 1], [t1, k1] = K[i];
        const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        // smoothstep ⇒ 寬窄轉折是圓滑的河灣，不是折角
        return lerp(k0, k1, f * f * (3 - 2 * f));
      }
    }
    return K[K.length - 1][1];
  };
}

/**
 * 折線的左右外框（帶狀地形）。
 * vary：寬度沿路 ±vary 比例的低頻變化 ⇒ 邊界非等寬硬邊。
 * taper：兩端收窄到 taper 倍寬（0.35 ≈ 河口自然收束，避免帶子被硬切一刀）。
 * profile：(t)=>倍率，沿路的寬度曲線（見 widthProfile）；與 taper/vary 相乘。
 */
export function ribbonOutline(pts, width, { vary = 0, seed = 0, taper = 1, profile = null } = {}) {
  const left = [], right = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const endT = Math.min(1, Math.min(i, n - 1 - i) / Math.max(1, n * 0.14));
    const tp = taper + (1 - taper) * endT;
    const pf = profile ? profile(n > 1 ? i / (n - 1) : 0) : 1;
    const half = (width * tp * pf * (1 + vary * swobble(i, seed, 0.27))) / 2;
    left.push({ x: pts[i].x - dy * half, y: pts[i].y + dx * half });
    right.push({ x: pts[i].x + dy * half, y: pts[i].y - dx * half });
  }
  return { left, right };
}

/** 折線 → 封閉多邊形（左側正走 + 右側反走）。給 ShapeGeometry / rasterizer 共用。 */
export function ribbonPolygon(pts, width, opt) {
  const { left, right } = ribbonOutline(pts, width, opt);
  return [...left, ...right.reverse()];
}

/** 沿法線平移整條折線（做河岸線、通道側邊用）。 */
export function offsetPath(pts, dist) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    return { x: p.x - dy * dist, y: p.y + dx * dist };
  });
}

/** 依 maxGap 把點串切成多條連續段（環狀牆的入口斷口 ⇒ 分段，避免細分時被接回去）。 */
export function splitRuns(pts, maxGap) {
  const runs = []; let cur = [];
  for (const p of pts) {
    if (cur.length && Math.hypot(p.x - cur[cur.length - 1].x, p.y - cur[cur.length - 1].y) > maxGap) {
      runs.push(cur); cur = [];
    }
    cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

/** 有機環形多邊形（半徑帶低頻擾動）⇒ 坑口/空地不是正圓 UI 標記。 */
export function blobRing(cx, cy, r, { n = 26, amp = 0.16, seed = 0, squashX = 1, squashY = 1, rot = 0 } = {}) {
  const out = [];
  const ca = Math.cos(rot), sa = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const rr = r * (1 + amp * swobble(k, seed, (TAU / n) * 3));
    // 先在局部座標做橢圓壓縮，再整體旋轉 rot ⇒ 長軸真的沿 rot 方向
    const ex = Math.cos(a) * rr * squashX, ey = Math.sin(a) * rr * squashY;
    out.push({ x: cx + ex * ca - ey * sa, y: cy + ex * sa + ey * ca });
  }
  return out;
}

/**
 * 環形牆：在 gaps 指定的角度開口（入口），其餘角度輸出為多條連續段。
 * @param gaps [{ angle, half }] half = 開口半角（弧度）
 */
export function ringRuns(cx, cy, r, gaps, { n = 48, amp = 0.06, seed = 0 } = {}) {
  const runs = []; let cur = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    if (gaps.some((g) => wrapDelta(a, g.angle) < g.half)) {
      if (cur.length >= 2) runs.push(cur);
      cur = []; continue;
    }
    const rr = r * (1 + amp * swobble(k, seed, 0.5));
    cur.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/**
 * 折線 → 牆段（每段一塊長方量體）。全部輸出模擬座標；height 為世界高度。
 * height / thick 可傳函式 (i) => number 做逐段起伏。
 * maxGap：超過此距離視為斷口，不連（保留入口）。
 */
export function pathToWallItems(pts, { height, thick, maxGap = Infinity, seed = 0, kind = "wall" }) {
  const items = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3 || len > maxGap) continue;
    items.push({
      kind,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      angle: Math.atan2(b.x - a.x, b.y - a.y),
      len,
      thick: typeof thick === "function" ? thick(i, seed) : thick,
      h: typeof height === "function" ? height(i, seed) : height,
    });
  }
  return items;
}

/**
 * 「自然地形牆」：稀疏折線 → 細分 → 側向擾動 → 逐段厚度/高度起伏的短牆串。
 * 這是把積木感牆體變成弧形岩壁的單一入口，牆/坑壁/基地 rim/崖緣共用。
 */
export function naturalWallRun(chain, {
  seed = 0, step = 2.3, amp = 2.4, height = 9, heightVar = 3.2,
  thick = 8, thickVar = 0.42, closed = false, kind = "wall",
} = {}) {
  const path = wobblePath(smoothPath(chain, step, { closed }), amp, seed, { closed });
  const pts = closed ? [...path, path[0]] : path;
  return pathToWallItems(pts, {
    kind, seed,
    height: (i) => height + swobble(i, seed + 5, 0.55) * heightVar * 0.5 + hash01(i, seed) * heightVar * 0.5,
    thick: (i) => thick * (1 - thickVar / 2 + hash01(i, seed + 11) * thickVar),
  });
}

/** 點是否在多邊形內（ray casting）。verifier / rasterizer 用。 */
export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 折線上離 p 最近的點與其切線角（把坑口接到河道時用）。 */
export function nearestOnPath(pts, p) {
  let best = pts[0], bi = 0, bd = Infinity;
  pts.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; bi = i; }
  });
  const a = pts[Math.max(0, bi - 1)], b = pts[Math.min(pts.length - 1, bi + 1)];
  return { point: best, index: bi, dist: bd, tangent: Math.atan2(b.y - a.y, b.x - a.x) };
}
