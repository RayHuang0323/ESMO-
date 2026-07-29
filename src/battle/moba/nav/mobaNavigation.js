// ============================================================================
//  battle/moba/nav/mobaNavigation.js — MOBA 移動與碰撞的**唯一真實來源**（Milestone H.2）
//
//  【H.2 之前的問題】專案裡同時存在兩套互相衝突的「哪裡不能走」：
//     ① `gameData.WALLS`：28 個手寫圓，LogicEngine 用它做圓形推開（`p.pos` 被推出圓外）
//     ② `mapPassability`：由**真實地圖牆體**柵格化出來的 1.0 格點距離場，只有 verifier 在用
//   結果就是「畫面上是牆、模擬裡不是牆」：英雄穿基地牆、穿岩壁、穿塔、穿主堡、穿坑壁。
//
//  H.2 起 **① 退役**，本檔成為唯一來源。LogicEngine 只呼叫本檔，不再自己算碰撞。
//
//  ── 阻擋來源（全部由地圖資料推導，不另建第二套幾何）────────────────────────
//   靜態（烘進距離場，來自 `T.wallItems`）：
//     base_rim / base_gate / base_keep / fountain_rim   基地牆與主堡量體
//     cliff / cliff_mass                                 競技場外緣崖
//     rock / jungle_struct                               野區岩壁與大型石頭
//     pit_wall                                           龍坑／巴龍坑牆段
//     entrance_taper / river_stone                       出入口收口、河岸石
//   動態（每次查詢時判斷，因為會被摧毀）：
//     18 座防禦塔 + 2 座主堡本體
//
//  ── 明確不算障礙（使用者指定）──────────────────────────────────────────
//   · **草叢**：`mapTerrainShapes` 本來就不把 bushClusters 放進 wallItems（可穿越的視野遮蔽）
//   · **河道水面**：河是 groundLayer，不是 wallItem ⇒ 可涉水通過
//   · **純裝飾**：裝飾草木不進 wallItems
//   （`river_stone` 是河岸的**實體石塊**，不是河面，維持阻擋。）
//
//  ── 已摧毀塔的碰撞規則（明確定義）────────────────────────────────────────
//   **塔一旦 hp ≤ 0，碰撞完全解除，原地變成可走。**
//   理由：與畫面一致（MobaRuntimeStructures 會把塔身塌成 0.3 倍殘骸樁、塔冠隱藏），
//   也符合 MOBA 慣例（推掉的塔不再擋路）。呼叫端負責傳入「還活著的結構」清單。
//
//  ⚠ 純資料 / 純函式：無 THREE、無 React、不讀 store、不用 Math.random。
//  ⚠ 座標一律是**模擬座標**（0–220），與 gameData 同一個空間。
// ============================================================================
import { buildField, HERO_RADIUS } from "../map/mapPassability.js";
import { buildMobaLayout } from "../map/mobaMapLayout.js";
import { buildTerrainShapes } from "../map/mapTerrainShapes.js";

export { HERO_RADIUS };

/**
 * 主堡水晶本體的碰撞半徑（模擬單位）。
 *
 * 基地的**牆**（base_keep / base_rim / fountain_rim）本來就在 wallItems 裡，
 * 本值只補「水晶量體」——避免英雄直接站到主堡上面。
 *
 * ⚠ 為什麼只有 1.5：實測（`tools/check_moba_nav_h2.mjs` 的連通性掃描）
 *   泉水的唯一出口就貼著主堡中心，碰撞圓一旦 ≥ 2.0，
 *   `NEXUS_CORE_R + HERO_RADIUS` 就會把泉水整個封死
 *   （可達格數從 34,718 崩到 36 ⇒ 英雄一出生就卡在泉水裡）。
 *   1.5 是「擋得住水晶、又不會關住自己人」的實測上限。
 *   要讓主堡有更大的實體佔地，得先把基地內庭拓寬 ⇒ 那是地圖幾何的改動，不在 H.2 範圍。
 */
const NEXUS_CORE_R = 1.5;

/** 子步進的最大步長（模擬單位）。步長 > 碰撞半徑就可能高速穿透薄牆。 */
const SUBSTEP = 0.8;

/**
 * 投影搜尋用的 8 個單位方向；另外 8 個由 `-1 ×` 得到 ⇒ **精確**反向。
 * （直接算 cos(π+a) 會有 ulp 級誤差，鏡像兩側就會挑到不同的格。）
 */
const DIR16 = (() => {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 16) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
})();

let _cache = null;

/** 建圖（只做一次；約 100ms）。 */
function nav() {
  if (_cache) return _cache;
  const L = buildMobaLayout();
  const T = buildTerrainShapes(L);
  //  ⚠ mirrorSymmetric 必開：地圖的裝飾岩石／崖體不是嚴格鏡像的，
  //  不對稱化就會變成藍紅不公平（實測藍方勝率會掉到 20%）。細節見 buildField 註解。
  const F = buildField(T, { mirrorSymmetric: true });

  //  結構碰撞圓：id 與引擎的 towers key 相同，座標用**呈現座標**
  //  （畫面上塔畫在哪裡，就在哪裡擋人；G.15 把塔的呈現座標對齊到城門軸線，
  //   和 snapshot 的 sim 座標不同 ⇒ 用 sim 會出現「撞到看不見的東西」）。
  const structures = new Map();
  for (const t of T.towers) {
    structures.set(t.id, { id: t.id, x: t.x, y: t.y, r: t.tiers?.[0]?.r ?? 2.5, kind: "tower" });
  }
  // D-fix3：門牙塔的可攻擊狀態進入引擎後，碰撞也必須沿用同一組正式地圖錨點。
  // classifyStructureBlocking 會照既有規則避免兩座塔合力封死基地出口。
  for (const t of T.nexusTurrets ?? []) {
    structures.set(t.id, {
      id: t.id, x: t.x, y: t.y, r: t.tiers?.[0]?.r ?? 2.5, kind: "nexus_guard",
    });
  }
  for (const n of T.meta.nexus ?? []) {
    if (!n.side) continue;
    structures.set(`${n.side}_nexus`, { id: `${n.side}_nexus`, x: n.x, y: n.y, r: NEXUS_CORE_R, kind: "nexus" });
  }

  _cache = { L, T, F, structures };
  //  ⚠ 必須在 _cache 設好之後才能跑（下面用到 clearanceAt / nav()）
  classifyStructureBlocking(F, structures);
  return _cache;
}

/**
 * 判定每個結構「擋不擋人」——**塔不得把通道塞死**。
 *
 * 【為什麼需要】ESMO 的基地出口與高地通道實測淨寬只有 9.66–10 單位。
 * 一座半徑 2.5 的塔站在通道中線上時，英雄圓心必須離塔心 ≥ 2.5+2.4 = 4.9，
 * 又必須離牆 ≥ 2.4（也就是只能在中線 ±2.6 內）⇒ **幾何上無解，通道 100% 被塞死**。
 * 後果實測：18 座塔有 4 座（門牙塔 mid_2 與一座 tier1 塔）從泉水根本走不到，
 * 拆不掉就結束不了，結束率從 40/40 掉到 26/40。
 *
 * 【判準（純幾何、無亂數、與比賽狀態無關）】
 * 取結構周圍 16 個方向、半徑 r+HERO_RADIUS+1 的環點，只留靜態可走的。
 * 若這些環點在全圖 BFS 下**分裂成兩個以上連通群**，表示本結構切斷了通道
 * ⇒ `blocks = false`（畫面照畫，碰撞放行）。通道夠寬、繞得過去的塔維持 `blocks = true`。
 *
 * 判定在**最壞情況（所有結構都還活著）**下做，並**迭代到收斂**：
 *   · 只單獨測自己會漏掉「城門兩座門牙塔聯手把出口塞死」這種**合力封路**
 *     （實測：單獨測時 20 座塔全部判定可繞，但泉水仍走不到 4 座塔）。
 *   · 用最壞情況判定的好處：塔被拆掉只會讓通道**變寬**
 *     ⇒ 在全活狀態下繞得過，任何中途狀態都繞得過，不必逐狀態驗。
 *   · 每輪把「已判定放行」的結構移出障礙，因此可能讓別的塔重新繞得過 ⇒ 迭代。
 *
 * 【為什麼不改地圖幾何】把出口拓寬到 ≥ 13.2 才容得下「繞塔」，那是 G 系列地圖改動
 * （會動到 base blueprint 的 3553 條驗收），不在 H.2 範圍。H.2 只負責讓碰撞與畫面一致
 * 且藍紅公平——而本判準在鏡像地圖上會給鏡像塔**相同**結論，公平性不受影響。
 */
function classifyStructureBlocking(F, structures) {
  const { nx, ny, idx, gx, gy, dist, cellToSim } = F;
  const need = HERO_RADIUS;
  const staticOk = (i) => dist[i] * cellToSim >= need;

  const all = [...structures.values()];
  for (const s of all) { s.blocks = true; s.blockNote = ""; }

  const cellXY = (i) => [F.B.minX + (i % nx) * cellToSim, F.B.minY + ((i / nx) | 0) * cellToSim];
  //  一個格被「目前仍擋人的結構（自己以外可指定排除）」擋住嗎
  const blockedBy = (i, list) => {
    const [wx, wy] = cellXY(i);
    for (const s of list) {
      const dx = wx - s.x, dy = wy - s.y;
      if (dx * dx + dy * dy < (s.r + need) * (s.r + need)) return true;
    }
    return false;
  };

  const ringOf = (s) => {
    const ring = [];
    const R = s.r + HERO_RADIUS + 1;
    for (let k = 0; k < 16; k++) {
      const half = DIR16[k % 8], sgn = k < 8 ? 1 : -1;
      const px = s.x + sgn * half[0] * R, py = s.y + sgn * half[1] * R;
      const ix = gx(px), iy = gy(py);
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      const id = idx(ix, iy);
      if (staticOk(id)) ring.push(id);
    }
    return ring;
  };

  //  ⚠ 迭代：每輪只針對「目前還宣稱擋人」的結構重測，直到沒有新的放行為止。
  //  最多跑 all.length 輪（每輪至少放行一個，否則就收斂了）⇒ 一定終止。
  for (let round = 0; round <= all.length; round++) {
    const obstacles = all.filter((s) => s.blocks);
    let changed = false;

    for (const s of obstacles) {
      const ring = ringOf(s);
      if (ring.length <= 1) { s.blockNote = "無環點可分裂"; continue; }
      const others = obstacles;               // 最壞情況：其他仍擋人的結構也一起擋
      const seen = new Int32Array(nx * ny).fill(-1);
      let groups = 0;
      for (const start of ring) {
        if (seen[start] >= 0 || blockedBy(start, others)) continue;
        const g = groups++;
        const q = [start]; seen[start] = g;
        let head = 0;
        while (head < q.length) {
          const id = q[head++];
          const ix = id % nx, iy = (id / nx) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const jx = ix + dx, jy = iy + dy;
            if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
            const jid = idx(jx, jy);
            if (seen[jid] >= 0 || !staticOk(jid) || blockedBy(jid, others)) continue;
            seen[jid] = g; q.push(jid);
          }
        }
      }
      const reachableRing = ring.filter((i) => seen[i] >= 0);
      if (!reachableRing.length) {
        s.blocks = false; s.blockNote = "環點全被封住 ⇒ 放行"; changed = true; continue;
      }
      const distinct = new Set(reachableRing.map((i) => seen[i])).size;
      if (distinct > 1) {
        s.blocks = false; s.blockNote = `與鄰近結構合力切斷通道（${distinct} 群）⇒ 放行`; changed = true;
      } else {
        s.blockNote = `繞得過（1 群 / ${reachableRing.length} 環點）`;
      }
    }
    if (!changed) break;
  }
}

/** 靜態淨距（離最近牆體的距離，模擬單位）。地圖外回 -1。 */
export function clearanceAt(x, y) {
  const { F } = nav();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  const ix = F.gx(x), iy = F.gy(y);
  if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) return -1;
  return F.dist[F.idx(ix, iy)] * F.cellToSim;
}

/**
 * 動態結構是否擋住 (x,y)？
 * @param alive Set/陣列，內含「還活著」的結構 id；沒傳 = 全部視為活著
 * @returns 擋住的結構物件，或 null
 */
export function structureAt(x, y, radius = HERO_RADIUS, alive = null) {
  const { structures } = nav();
  const has = alive == null ? null : (alive instanceof Set ? alive : new Set(alive));
  for (const s of structures.values()) {
    if (has && !has.has(s.id)) continue;         // 已摧毀 ⇒ 不擋
    if (s.blocks === false) continue;            // 會把通道塞死的結構 ⇒ 不擋（見 classifyStructureBlocking）
    const dx = x - s.x, dy = y - s.y;
    if (dx * dx + dy * dy < (s.r + radius) * (s.r + radius)) return s;
  }
  return null;
}

/**
 * 這個點站得下一個半徑 radius 的英雄嗎？
 *
 * 兩段式：
 *   ① 靜態牆體：查距離場（格點取樣）
 *   ② 結構（塔／主堡）：先查**快取遮罩**快速排除，落在結構附近時再算**精確圓**
 *
 * ⚠ 為什麼第 ② 段不能只查遮罩：遮罩是以**格心**是否落在碰撞圓內來蓋章的，
 * 而英雄的座標是連續的 ⇒ 格心在圓外、英雄實際在圓內的情況最多會差半個格對角
 * （0.71 單位）。H.2-close 的真實 Chrome 驗收就抓到這個：英雄侵入塔的碰撞圓 0.48
 * 單位、`isWalkable` 卻回 true（畫面上就是英雄的膠囊啃進塔基）。
 * 精確圓只在「遮罩的鄰域」內才算 ⇒ 絕大多數查詢仍是 O(1) 查表，效能沒有回到優化前。
 */
export function isWalkable(x, y, radius = HERO_RADIUS, alive = null) {
  const { F } = nav();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const ix = F.gx(x), iy = F.gy(y);
  if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) return false;
  const id = F.idx(ix, iy);
  if (F.dist[id] * F.cellToSim < radius) return false;
  const m = maskFor(radius, alive);
  if (m[id]) return false;                          // 格心就在圓內 ⇒ 一定不可走
  if (!m.near[id]) return true;                     // 離所有結構都夠遠 ⇒ 一定可走
  return !structureAt(x, y, radius, alive);         // 邊界帶：用精確圓判定
}

/**
 * 把不可走的目標點投影到**最近的可走點**（螺旋搜尋，確定性、不用亂數）。
 * 找不到就回原點（呼叫端仍會被子步進擋住，不會穿牆）。
 */
export function projectToWalkable(x, y, radius = HERO_RADIUS, alive = null, maxR = 24) {
  if (isWalkable(x, y, radius, alive)) return { x, y };
  const { F } = nav();
  const cx = F.B.centerX, cy = F.B.centerY;
  //  由地圖中心指向本點的方向（180° 旋轉時會整個反向，和候選位移一起反向）
  const vx = x - cx, vy = y - cy;
  const step = 0.75;
  for (let r = step; r <= maxR; r += step) {
    //  ⚠ 這一圈的 16 個候選必須用**旋轉等變**的準則挑，不能「先找到先用」。
    //  舊寫法是從角度 0 開始掃、第一個可走就回傳：對於鏡像點 p′，
    //  對應候選在角度 +π，掃描順序卻一樣從 0 開始 ⇒ 兩邊挑到不對應的落點。
    //  實測 32.4% 的投影不是鏡像的，直接變成藍紅不公平。
    //
    //  下面三個評分在 180° 旋轉下都不變（距離場已對稱、離地圖中心距離不變、
    //  外向向量與位移同時反號 ⇒ 內積不變）⇒ 鏡像輸入必得鏡像輸出。
    let best = null, bestScore = null;
    for (let k = 0; k < 16; k++) {
      //  ⚠ 用「精確反向」的偏移表，不要直接算 cos(π+a)：
      //  IEEE 下 Math.cos(Math.PI + a) !== -Math.cos(a)，差幾個 ulp 就可能落到隔壁格，
      //  鏡像兩側因此挑到不同候選（殘留 9% 不對稱就是這樣來的）。
      const half = DIR16[k % 8];
      const sgn = k < 8 ? 1 : -1;
      const dx = sgn * half[0] * r, dy = sgn * half[1] * r;
      const nx2 = x + dx, ny2 = y + dy;
      if (!isWalkable(nx2, ny2, radius, alive)) continue;
      const score = [
        clearanceAt(nx2, ny2),                       // 1) 越開闊越好
        (vx * dx + vy * dy) / r,                     // 2) 偏向遠離地圖中心的方向
        -Math.hypot(nx2 - cx, ny2 - cy),             // 3) 越靠近地圖中心越好
      ];
      if (!bestScore || cmpScore(score, bestScore) > 0) { bestScore = score; best = { x: nx2, y: ny2 }; }
    }
    if (best) return best;
  }
  return { x, y };
}

/** 逐項比較（含容差，避免浮點雜訊在鏡像兩側挑到不同候選）。 */
function cmpScore(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] - b[i] > 1e-9) return 1;
    if (b[i] - a[i] > 1e-9) return -1;
  }
  return 0;
}

/**
 * 把目標點**推回通道中心**（沿淨距場梯度爬坡）。
 *
 * 【為什麼需要】lane 折線是手繪的，實測 101 個取樣點裡有 ~20% 落在牆內或貼著牆
 * （淨距 < 英雄半徑）。`projectToWalkable` 只保證「站得下」，所以會回一個**貼著牆**的點；
 * 英雄於是整場把身體壓在牆上前進，每 tick 都在沿牆滑動 ⇒ 實測 27.6% 的時間淨距 < 3.2、
 * 有效移動只剩 0.76，比賽因此拉長 2.3 分、前 5 分等級從 4.2 掉到 3.85。
 *
 * 【怎麼做】沿梯度往「離牆更遠」的方向爬，最多位移 `maxShift`（預設 3 單位，
 * 小於英雄直徑 ⇒ 不改變「要去哪」的戰術語意），爬到淨距 ≥ want 就停。
 *
 * ⚠ 決定性且鏡像等變：距離場已 180° 對稱 ⇒ 梯度在鏡像點恰好反號 ⇒ 位移互為鏡像。
 */
export function recenterToCorridor(x, y, radius = HERO_RADIUS, alive = null, maxShift = 3, want = null) {
  const target = want ?? radius + 1.6;
  let cx = x, cy = y, spent = 0;
  const STEP = 0.5;
  for (let i = 0; i < 12 && spent < maxShift; i++) {
    if (clearanceAt(cx, cy) >= target) break;
    const g = gradientAt(cx, cy);
    if (!g) break;
    const nx2 = cx + g.x * STEP, ny2 = cy + g.y * STEP;
    if (clearanceAt(nx2, ny2) <= clearanceAt(cx, cy)) break;   // 爬不上去就停（避免抖動）
    cx = nx2; cy = ny2; spent += STEP;
  }
  //  結構（塔／主堡）擋住時仍要交給投影處理
  return isWalkable(cx, cy, radius, alive) ? { x: cx, y: cy } : projectToWalkable(x, y, radius, alive);
}

/**
 * 靜態淨距場在 (x,y) 的單位梯度（指向「離牆更遠」的方向 ⇒ 可當牆的法線）。
 * 用中央差分；梯度為 0（開闊地或格外）回 null。
 *
 * ⚠ 只用**靜態**距離場，不含塔：塔是圓，法線本來就可以由 (p − 圓心) 直接得到，
 *   而且把塔混進梯度會讓法線在塔邊緣抖動。塔邊的滑動由下面的拆軸退路處理。
 */
function gradientAt(x, y) {
  const { F } = nav();
  const ix = F.gx(x), iy = F.gy(y);
  if (ix <= 0 || iy <= 0 || ix >= F.nx - 1 || iy >= F.ny - 1) return null;
  const d = F.dist;
  const gxv = d[F.idx(ix + 1, iy)] - d[F.idx(ix - 1, iy)];
  const gyv = d[F.idx(ix, iy + 1)] - d[F.idx(ix, iy - 1)];
  const len = Math.hypot(gxv, gyv);
  if (len < 1e-9) return null;
  return { x: gxv / len, y: gyv / len };
}

/**
 * 從 from 朝 to 走最多 maxDist，**子步進 + 碰到牆沿牆滑動**。
 *
 * @returns { x, y, moved, blocked }
 *   moved   實際前進的距離
 *   blocked 是否曾被擋（呼叫端可據此決定要不要重新尋路）
 */
export function moveTowards(from, to, maxDist, radius = HERO_RADIUS, alive = null) {
  let cx = from.x, cy = from.y;
  let remain = maxDist, moved = 0, blocked = false;
  if (!(maxDist > 0)) return { x: cx, y: cy, moved: 0, blocked: false };

  //  起點若已經卡在牆裡（例如上一版存檔、或塔剛蓋好），先推回可走區再走
  if (!isWalkable(cx, cy, radius, alive)) {
    const p = projectToWalkable(cx, cy, radius, alive);
    cx = p.x; cy = p.y;
  }

  let guard = 0;
  while (remain > 1e-6 && guard++ < 64) {
    const dx = to.x - cx, dy = to.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) break;
    const step = Math.min(SUBSTEP, remain, d);
    const ux = dx / d, uy = dy / d;
    const nx2 = cx + ux * step, ny2 = cy + uy * step;

    if (isWalkable(nx2, ny2, radius, alive)) {
      cx = nx2; cy = ny2; moved += step; remain -= step;
      continue;
    }
    blocked = true;
    //  ① 沿**牆面切線**滑動（優先）：把想走的方向投影到牆的切線上，然後走**完整步長**。
    //  ⚠ 為什麼不只用下面的拆軸法：拆軸只走 x 或 y 其中一軸的分量，
    //  斜著擦牆時每步只剩 |ux|·step 或 |uy|·step ⇒ 系統性吃掉移速
    //  （實測有效移動只有 0.775，比賽因此拖長、結束率從 40/40 掉到 27/40）。
    //  牆的法線取自距離場梯度（距離場是 180° 對稱的 ⇒ 梯度在鏡像點恰好反號 ⇒ 藍紅等價）。
    const g = gradientAt(cx, cy);
    if (g) {
      const dot = ux * g.x + uy * g.y;
      let tx2 = ux - dot * g.x, ty2 = uy - dot * g.y;
      const tl = Math.hypot(tx2, ty2);
      if (tl > 1e-6) {
        tx2 /= tl; ty2 /= tl;
        const sxp = cx + tx2 * step, syp = cy + ty2 * step;
        if (isWalkable(sxp, syp, radius, alive)) {
          cx = sxp; cy = syp; moved += step; remain -= step;
          continue;
        }
      }
    }
    //  ② 退路：拆軸滑動（切線也走不通時，例如牆角）
    const ax = cx + ux * step, ay = cy;
    const bx = cx, by = cy + uy * step;
    const okA = isWalkable(ax, ay, radius, alive);
    const okB = isWalkable(bx, by, radius, alive);
    if (okA && !okB) { cx = ax; moved += Math.abs(ux * step); remain -= step; }
    else if (okB && !okA) { cy = by; moved += Math.abs(uy * step); remain -= step; }
    else if (okA && okB) {
      //  兩個軸都能走：選比較接近目標的那個
      const da = Math.hypot(to.x - ax, to.y - ay), db = Math.hypot(to.x - bx, to.y - by);
      if (da <= db) { cx = ax; moved += Math.abs(ux * step); } else { cy = by; moved += Math.abs(uy * step); }
      remain -= step;
    } else break;                                  // 死角：這一 tick 走不動，交給上層重新尋路
  }
  return { x: cx, y: cy, moved, blocked };
}

// ── A* 尋路 ─────────────────────────────────────────────────────────────────
//  在 1.0 格點上跑。單次搜尋節點上限 NODE_BUDGET，超過就放棄（回 null），
//  呼叫端退回「直接朝目標推進 + 滑動」——寧可走得笨，也不要卡住整個 tick。

const NODE_BUDGET = 30000;

/**
 * 加權 A*（ε-weighted）：f = g + EPS × h。
 *
 * ⚠ 為什麼不用 EPS = 1（最佳解）：可走區有 34,481 格，跨半張地圖的搜尋在 EPS=1 下
 * 會展開上萬格（實測泉水→敵方門牙塔展開超過 9,000 格、28ms 仍找不到終點就撞上預算）。
 * 一撞預算就回 null ⇒ 呼叫端只能直線硬推，看起來就是「英雄卡在牆邊抖」。
 * EPS = 1.7 之下路徑最壞只比最短路長 70%（實測 20 條航段平均只有 1.053 倍直線距離，
 * 因為地圖走廊本來就窄、可繞的空間有限），但展開量降一個量級：
 * 單次搜尋從 25–56ms 降到約 1.3ms，模擬成本從 0.664ms/tick 降到 0.556ms/tick，
 * 而有效移動幾乎不變（0.9111 → 0.9086）。
 *
 * ⚠ 仍是**決定性**的：權重是常數，鄰居順序固定，且搜尋前已正規化到同一半邊
 *   ⇒ 鏡像輸入得到鏡像路徑。
 */
const HEURISTIC_WEIGHT = 1.7;

/** 最小二元堆（避免每次 shift 造成 O(n²)）。 */
class Heap {
  constructor() { this.a = []; }
  push(node, f) {
    const a = this.a; a.push({ node, f });
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; if (!a.length) return null;
    const top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top.node;
  }
  get size() { return this.a.length; }
}

/**
 * A* 路徑（模擬座標的折線；含終點，不含起點）。
 * 走不到或超出預算回 null。
 */
export function findPath(from, to, radius = HERO_RADIUS, alive = null) {
  //  ⚠ A* 的鄰居展開順序與堆疊 tie-break 不是旋轉等變的：同一條路走藍方或紅方
  //  會得到長度略微不同的折線 ⇒ 直接變成藍紅不公平（實測 3 條測試路線有 2 條不對稱）。
  //  解法：把問題**正規化**到同一半邊再解，然後把結果鏡射回去。
  //  地圖的可走性已經是 180° 對稱的（見 buildField 的 mirrorSymmetric），
  //  所以鏡射後的問題與原problem 完全等價，這樣做不會改變路徑品質，只是消除方向偏差。
  const { F } = nav();
  const cxx = F.B.centerX, cyy = F.B.centerY;
  const key = (from.x - cxx) + (from.y - cyy);
  if (key > 0 || (key === 0 && (to.x - cxx) + (to.y - cyy) > 0)) {
    const mir = (p) => ({ x: 2 * cxx - p.x, y: 2 * cyy - p.y });
    const path = findPathCanonical(mir(from), mir(to), radius, mirrorAlive(alive));
    return path ? path.map(mir) : null;
  }
  return findPathCanonical(from, to, radius, alive);
}

/**
 * 把「還活著的結構」集合鏡射到對側（正規化求解時要用對側的阻擋狀態）。
 *
 * ⚠ 地圖的 180° 旋轉**會交換上下路**：`blue_top_0` 的鏡像是 `red_bot_0`，不是 `red_top_0`
 * （同一件事在 mobaTowerPlacement 也有註記，實測塔位鏡像誤差 0 就是照這個配對量的）。
 * 只換隊色前綴會讓正規化後的查詢帶著**錯位的阻擋狀態**去尋路：
 * 藍方的查詢被鏡射時用到紅方另一條路的塔存活狀態 ⇒ 兩邊得到不等價的路。
 * 實測（80 seeds、上限放寬到 45 分鐘避免截斷汙染）：修正前藍方勝率 61.3%，
 * 修正後回到接近對稱。
 */
const MIRROR_LANE_ID = { top: "bot", bot: "top", mid: "mid" };
function mirrorAlive(alive) {
  if (alive == null) return null;
  const src = alive instanceof Set ? alive : new Set(alive);
  const out = new Set();
  for (const id of src) {
    const m = /^(blue|red)_(top|mid|bot)_(\d+)$/.exec(id);
    if (m) {
      const side = m[1] === "blue" ? "red" : "blue";
      out.add(`${side}_${MIRROR_LANE_ID[m[2]]}_${m[3]}`);
      continue;
    }
    out.add(id === "blue_nexus" ? "red_nexus" : id === "red_nexus" ? "blue_nexus" : id);
  }
  return out;
}

/**
 * 每個結構在指定英雄半徑下佔用的格 id（只算一次，依 radius 快取）。
 * 半徑固定 ⇒ 佔用格固定；比賽中變的只有「哪些結構還活著」。
 */
const _cellsByRadius = new Map();
/**
 * @returns Map(id → { inside, near })
 *   inside 格心落在碰撞圓內的格（一定不可走）
 *   near   格心落在「圓 + 一個格對角」內的格（**邊界帶**：格點判定不可信，
 *          必須改用精確圓；見 isWalkable 的說明）
 */
function structureCells(radius) {
  let m = _cellsByRadius.get(radius);
  if (m) return m;
  const { F, structures } = nav();
  //  一個格心與格內任一點的最大距離 = 半個格對角。邊界帶取這個寬度就足以涵蓋
  //  「格心在圓外、但格內某點在圓內」的所有情況。
  const HALF_DIAG = F.cellToSim * Math.SQRT1_2;
  m = new Map();
  for (const s of structures.values()) {
    const rr = s.r + radius;
    const rn = rr + HALF_DIAG;
    const inside = [], near = [];
    const i0 = F.gx(s.x - rn), i1 = F.gx(s.x + rn), j0 = F.gy(s.y - rn), j1 = F.gy(s.y + rn);
    for (let iy = Math.max(0, j0); iy <= Math.min(F.ny - 1, j1); iy++) {
      for (let ix = Math.max(0, i0); ix <= Math.min(F.nx - 1, i1); ix++) {
        const wx = F.B.minX + ix * F.cellToSim, wy = F.B.minY + iy * F.cellToSim;
        const d2 = (wx - s.x) ** 2 + (wy - s.y) ** 2;
        const id = F.idx(ix, iy);
        if (d2 < rr * rr) inside.push(id);
        if (d2 < rn * rn) near.push(id);
      }
    }
    m.set(s.id, { inside, near });
  }
  _cellsByRadius.set(radius, m);
  return m;
}

/**
 * 把「還活著且會擋人」的結構蓋章到一張遮罩上。
 * `mask[id]`：格心在圓內 ⇒ 直接不可走。
 * `mask.near[id]`：格心在圓的一個格對角以內 ⇒ 邊界帶，呼叫端必須改用精確圓判定。
 */
function stampStructures(radius, alive) {
  const { F, structures } = nav();
  const cells = structureCells(radius);
  const mask = new Uint8Array(F.nx * F.ny);
  const near = new Uint8Array(F.nx * F.ny);
  const has = alive == null ? null : (alive instanceof Set ? alive : new Set(alive));
  for (const s of structures.values()) {
    if (s.blocks === false) continue;
    if (has && !has.has(s.id)) continue;
    const c = cells.get(s.id);
    for (const id of c.inside) mask[id] = 1;
    for (const id of c.near) near[id] = 1;
  }
  mask.near = near;
  return mask;
}

/**
 * 遮罩快取：一場比賽裡「還活著的結構」最多只會變 20 次（每拆一座塔一次），
 * 所以同一張遮罩可以重複用到下一次有東西被拆掉為止。
 *
 * ⚠ 為什麼要做這個快取：不做的話 `isWalkable` 每次都要對 20 個結構算圓，
 * 而近場預判（`lineWalkable`）每 tick 每名英雄要取樣約 35 點
 * ⇒ 實測模擬成本從 0.100ms/tick 漲到 0.683ms/tick（6.8×），
 * 連 verifier 全套時間都跟著漲。改成查表後降回 §效能 一節的數字。
 *
 * key 用「結構固定順序的 bitmask + 半徑」，完全對應一組存活狀態 ⇒ 不會拿到過期遮罩。
 */
let _order = null;
const _maskCache = new Map();          // `${radius}|${bits}` → Uint8Array
const MASK_CACHE_MAX = 6;
function structOrder() {
  if (!_order) _order = [...nav().structures.keys()].sort();
  return _order;
}
function aliveBits(alive) {
  const order = structOrder();
  if (alive == null) return -1;                    // 全部活著
  const has = alive instanceof Set ? alive : new Set(alive);
  let bits = 0;
  for (let i = 0; i < order.length; i++) if (has.has(order[i])) bits |= (1 << i);
  return bits;
}
function maskFor(radius, alive) {
  const key = `${radius}|${aliveBits(alive)}`;
  const hit = _maskCache.get(key);
  if (hit) return hit;
  const mask = stampStructures(radius, alive);
  if (_maskCache.size >= MASK_CACHE_MAX) _maskCache.delete(_maskCache.keys().next().value);
  _maskCache.set(key, mask);
  return mask;
}

/**
 * A* 的重用暫存表（世代戳記制）。
 * `stamp[i] !== gen` 就代表 g/prev/closed[i] 是上一次搜尋留下的垃圾、視同未訪問
 * ⇒ 不必每次清空 48,841 格。
 */
let _scratch = null;
function scratch(n) {
  if (!_scratch || _scratch.g.length !== n) {
    _scratch = {
      g: new Float32Array(n), prev: new Int32Array(n),
      closed: new Uint8Array(n), stamp: new Int32Array(n), gen: 0,
    };
  }
  return _scratch;
}

function findPathCanonical(from, to, radius, alive) {
  const { F } = nav();
  const need = radius;
  const start = projectToWalkable(from.x, from.y, radius, alive);
  const goal = projectToWalkable(to.x, to.y, radius, alive);
  let sx = F.gx(start.x), sy = F.gy(start.y), tx = F.gx(goal.x), ty = F.gy(goal.y);
  if (sx < 0 || sy < 0 || sx >= F.nx || sy >= F.ny) return null;
  if (tx < 0 || ty < 0 || tx >= F.nx || ty >= F.ny) return null;

  //  結構阻擋先**蓋章成遮罩**再搜尋。
  //  ⚠ 舊寫法是每個候選格現算 `structureAt`（20 個結構的圓判定）。A* 一次會展開上萬格
  //  × 8 個鄰居 ⇒ 每次搜尋要做數百萬次圓判定，實測 56ms 還撞不到終點就用完預算。
  //  改成蓋章後：每次搜尋只蓋約 20 × 60 = 1,200 格，之後查表是 O(1)。
  const blockedCells = maskFor(radius, alive);
  const aliveSet = alive == null ? null : (alive instanceof Set ? alive : new Set(alive));
  //  ⚠ 座標→格點是**取整**的：投影過的點（離塔 4.5，剛好在碰撞圓外）取整後可能落回
  //  被蓋章的格裡（格心離塔只有 3.96 < 4.3）⇒ A* 的終點自己就不可走，於是把整張圖
  //  展開完才回 null。這正是「泉水走不到門牙塔、比賽拆不完」的真因。
  //  修法：終點（與起點）若落在被結構佔用的格，沿**離該結構圓心的徑向**往外推格，
  //  推到可走為止。徑向推移在 180° 旋轉下等變 ⇒ 藍紅得到鏡像結果。
  const nudge = (ix, iy) => {
    if (!blockedCells[F.idx(ix, iy)]) return [ix, iy];
    const wx = F.B.minX + ix * F.cellToSim, wy = F.B.minY + iy * F.cellToSim;
    //  找出蓋住這格、且圓心最近的結構（決定性：距離相同時取 id 字典序小的）
    let best = null;
    for (const s of nav().structures.values()) {
      if (s.blocks === false) continue;
      if (aliveSet && !aliveSet.has(s.id)) continue;
      const d = Math.hypot(wx - s.x, wy - s.y);
      if (d >= s.r + radius) continue;
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && s.id < best.s.id)) best = { s, d };
    }
    if (!best) return [ix, iy];
    const { s } = best;
    const len = Math.hypot(wx - s.x, wy - s.y) || 1;
    const ux = (wx - s.x) / len, uy = (wy - s.y) / len;
    for (let k = 1; k <= 12; k++) {
      const px = s.x + ux * (s.r + radius + k * F.cellToSim);
      const py = s.y + uy * (s.r + radius + k * F.cellToSim);
      const jx = F.gx(px), jy = F.gy(py);
      if (jx < 0 || jy < 0 || jx >= F.nx || jy >= F.ny) break;
      const jid = F.idx(jx, jy);
      if (!blockedCells[jid] && F.dist[jid] * F.cellToSim >= need) return [jx, jy];
    }
    return [ix, iy];
  };
  [sx, sy] = nudge(sx, sy);
  [tx, ty] = nudge(tx, ty);

  const sId = F.idx(sx, sy), tId = F.idx(tx, ty);
  if (sId === tId) return [{ x: goal.x, y: goal.y }];

  const cellOk = (ix, iy) => {
    const id = F.idx(ix, iy);
    return F.dist[id] * F.cellToSim >= need && !blockedCells[id];
  };

  //  ⚠ 這三張表**重用**（見 scratch）：每次搜尋重新配置 3 × 48,841 格
  //  （Float32 + Int32 + Uint8，約 0.4 MB）並填初值，光這一項一場就要配置 900 次。
  //  改用「世代戳記」判斷資料是否屬於本次搜尋 ⇒ 免配置、免清空。
  const S = scratch(F.nx * F.ny);
  const gen = ++S.gen;
  const { g, prev, closed, stamp } = S;
  const h = (ix, iy) => HEURISTIC_WEIGHT * Math.hypot(ix - tx, iy - ty);
  const open = new Heap();
  g[sId] = 0; stamp[sId] = gen; prev[sId] = -1; closed[sId] = 0;
  open.push(sId, h(sx, sy));

  let expanded = 0, found = false;
  while (open.size) {
    const id = open.pop();
    if (stamp[id] === gen && closed[id]) continue;
    closed[id] = 1;
    if (id === tId) { found = true; break; }
    if (++expanded > NODE_BUDGET) break;
    const ix = id % F.nx, iy = (id / F.nx) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= F.nx || jy >= F.ny) continue;
      const jid = F.idx(jx, jy);
      const fresh = stamp[jid] !== gen;
      if (!fresh && closed[jid]) continue;
      if (!cellOk(jx, jy)) continue;
      const cost = (dx && dy) ? Math.SQRT2 : 1;
      const ng = g[id] + cost;
      if (fresh || ng < g[jid]) {
        if (fresh) { stamp[jid] = gen; closed[jid] = 0; }
        g[jid] = ng; prev[jid] = id; open.push(jid, ng + h(jx, jy));
      }
    }
  }
  if (!found) return null;

  //  回溯 → 折線；再做一次「看得到就直走」的簡化，避免走成鋸齒
  const cells = [];
  for (let cur = tId; cur !== -1; cur = prev[cur]) cells.push(cur);   // prev 只在 stamp === gen 的格上寫過
  cells.reverse();
  const pts = cells.map((id) => ({
    x: F.B.minX + (id % F.nx) * F.cellToSim,
    y: F.B.minY + (((id / F.nx) | 0)) * F.cellToSim,
  }));
  return simplify(pts, radius, alive).slice(1);
}

/**
 * 視線可達就跳過中間點（減少折線點數，走起來自然）。
 *
 * ⚠ 回掃**限制在 SIMPLIFY_WINDOW 格以內**：原本每次都從路徑最末端往回試，
 * 一條 200 格的路徑最壞要做 2 萬次 `lineWalkable`（每次又取樣數十點）
 * ⇒ 長途尋路的成本大半花在這裡，而不是 A* 本身。
 * 視窗化之後折線點會多一點（走起來完全一樣，因為子步進本來就沿著折線走），
 * 但成本從 O(n²) 降成 O(n × 視窗)。
 */
const SIMPLIFY_WINDOW = 24;
function simplify(pts, radius, alive) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + SIMPLIFY_WINDOW);
    for (; j > i + 1; j--) if (lineWalkable(pts[i], pts[j], radius, alive)) break;
    out.push(pts[j]); i = j;
  }
  return out;
}

/** a→b 這條直線整段都站得下英雄嗎（等距取樣）。 */
export function lineWalkable(a, b, radius = HERO_RADIUS, alive = null) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / (SUBSTEP * 0.9)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isWalkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius, alive)) return false;
  }
  return true;
}

/** 供 verifier / 除錯用：目前的結構碰撞清單。 */
export function structureList() {
  return [...nav().structures.values()].map((s) => ({ ...s }));
}

/** 供 verifier 用：格點基本資訊。 */
export function navInfo() {
  const { F, structures } = nav();
  return {
    cells: F.nx * F.ny, nx: F.nx, ny: F.ny, cellSize: F.cellToSim,
    bounds: F.B, structures: structures.size, heroRadius: HERO_RADIUS, substep: SUBSTEP,
    nexusCoreR: NEXUS_CORE_R,
    blocking: [...structures.values()].map((s) => ({ id: s.id, blocks: s.blocks !== false, note: s.blockNote })),
  };
}
