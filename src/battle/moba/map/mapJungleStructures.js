// ============================================================================
//  battle/moba/map/mapJungleStructures.js — 野區路線結構節點（Milestone G.6 v2）
//
//  【要解決的問題】人工比對 LoL 真圖後的回饋：野區「主要結構明顯不足」，
//    看起來只有約 10 個可讀的遮蔽 / 分隔 / 路線結構。
//    真相是：G.4 的密度是**程序化同心弧**（330+ 段、每段長 2.1 的細碎牆），
//    俯視下糊成幾團，讀不出「這是一道分隔牆 / 這是一個轉角 / 這是一個切入口」。
//    使用者要的不是「更多細碎牆」，而是**更多可讀的中小型結構節點**：
//    轉角、凹槽、入口、袋狀區、分隔牆、支援 / gank / 反野 / 轉線的路線語言。
//
//  【本檔的角色】在既有的細碎密度**之上**，補一層**刻意佈局的中小型結構**：
//    每一段都比同心弧長、比同心弧高一階，讀成「一道有意義的牆」而不是噪點。
//    全部**錨定在象限中心與營地座標上**（＝天生落在合法野區乾地），再交給
//    mapTerrainShapes 的 filterRuns(blockPolys) 二次過濾（路面／河／基地／出口
//    通道／坑／營地空地一律禁建），所以**不可能堵死主要動線**。
//
//  【四種結構語言】（逐象限都補，四個象限對稱）
//    · camp_wall  營地後側分隔牆：口袋的「另一半」，同時讓出一條繞到營地背後的次路。
//    · divider    象限分隔牆：把象限切成「近路主線」與「近河次線」兩條動線。
//    · lane_cut   三路切入口轉角：象限朝中路 / 河那一側的 L 形轉角，讀成 gank 切入邊界。
//    · river_hook 河道銜接鉤：朝地圖中心再往外一小段的轉折，讀成「野區 → 河」的接點。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random（形狀必須每次相同）。
//  ⚠ 不改 gameData.js、不改任何模擬常數、不新增任何模擬實體。這些牆純粹是**呈現用
//    地形**，和 G.4 的同心弧一樣不影響模擬公平性（模擬層看不到它們）。
// ============================================================================
import { swobble } from "./mapShapePrimitives.js";

/** 一段直短牆（5 點折線，沿 angle 展開 span，帶決定性側向擾動 ⇒ 讀成自然岩壁而非直尺）。 */
function seg(id, quadrant, role, x, y, angle, span, thick, h, seed) {
  const n = 4;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const px = -uy, py = ux; // 側向單位向量
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n - 0.5) * span;
    const j = swobble(i, seed, 0.6) * 1.2;
    pts.push({ x: x + ux * t + px * j, y: y + uy * t + py * j });
  }
  return { id, quadrant, role, thick, h, points: pts, x, y };
}

/** 一個 L 形轉角（兩條腿：一條切向、一條徑向）⇒ 俯視讀得出「轉角 / 凹槽」。 */
function corner(id, quadrant, role, x, y, angle, span, thick, h, seed) {
  const aTan = angle + Math.PI / 2; // 切向腿
  const aRad = angle;               // 徑向腿（朝 angle 方向）
  const pts = [];
  for (let i = 0; i <= 2; i++) {
    const t = (i / 2) * span * 0.62;
    pts.push({ x: x + Math.cos(aTan) * t, y: y + Math.sin(aTan) * t });
  }
  const c0 = pts[pts.length - 1];
  for (let i = 1; i <= 2; i++) {
    const t = (i / 2) * span * 0.5;
    const j = swobble(i, seed, 0.6) * 0.9;
    pts.push({ x: c0.x + Math.cos(aRad) * t - Math.sin(aRad) * j, y: c0.y + Math.sin(aRad) * t + Math.cos(aRad) * j });
  }
  return { id, quadrant, role, thick, h, points: pts, x, y };
}

/**
 * 建立所有野區路線結構節點（未過濾；過濾在 mapTerrainShapes 依 blockPolys 進行）。
 * @param {{ quadrants, camps, cx, cy }} args camps = 呈現座標（buildCampPlan 的輸出）
 * @returns 結構規格陣列 [{ id, quadrant, role, x, y, thick, h, points }]
 */
export function buildJungleStructures({ quadrants, camps, cx, cy }) {
  const out = [];
  //  第二種結構的角色輪替（確保 divider / lane_cut / river_hook 三種語言都出現）：
  //  以「營地相對地圖中心的方位」決定，讓兩側鏡射的營地拿到對稱的角色。
  const SIDE_ROLE = ["divider", "lane_cut", "river_hook"];
  quadrants.forEach((q, qi) => {
    const toC = Math.atan2(cy - q.y, cx - q.x);       // 指向地圖中心（河 / 中路方向）
    // 本象限的營地（含呈現用鳥營 / 蟾蜍）
    const local = camps
      .map((c) => ({ c, d: Math.hypot(c.x - q.x, c.y - q.y) }))
      .filter((o) => o.d < q.r * 2.05)
      .sort((a, b) => a.d - b.d)
      .map((o) => o.c);

    // ── 營地錨定結構（survive 率最高：營地本來就有淨空，天生落在合法乾地）──
    local.forEach((c, ci) => {
      const outward = Math.atan2(c.y - cy, c.x - cx);   // 背向地圖中心
      const R = (c.clearR ?? 9) + 6.0;
      // (1) 營地後側分隔牆：口袋的「另一半」＋ 一條繞到營地背後的次路
      out.push(seg(`js_${q.id}_camp${ci}wall`, q.id, "camp_wall",
        c.x + Math.cos(outward) * R, c.y + Math.sin(outward) * R,
        outward + Math.PI / 2, 13, 3.9, 6.6, qi * 40 + ci * 7 + 1));
      // (2) 營地側翼結構：與營地並列的短牆／轉角，讀成「側向可支援 / 可切入的路線」。
      //     角色輪替，確保四種路線語言在全圖都出現；側向偏移 ⇒ 不朝三路帶，survive 率高。
      const side = outward + Math.PI / 2 * (ci % 2 ? -1 : 1);
      const sx = c.x + Math.cos(side) * R, sy = c.y + Math.sin(side) * R;
      const role = SIDE_ROLE[(qi * 2 + ci) % SIDE_ROLE.length];
      if (role === "divider") {
        out.push(seg(`js_${q.id}_camp${ci}side`, q.id, "divider", sx, sy, outward, 12, 3.4, 6.2, qi * 40 + ci * 7 + 2));
      } else {
        out.push(corner(`js_${q.id}_camp${ci}side`, q.id, role, sx, sy, side, 11, 3.3, 6.0, qi * 40 + ci * 7 + 2));
      }
    });

    // ── 象限分隔牆：象限中心略偏中路一側，垂直於 toC ⇒ 主線 / 次線兩條動線 ──
    {
      const mx = q.x + Math.cos(toC) * (q.r * 0.32);
      const my = q.y + Math.sin(toC) * (q.r * 0.32);
      out.push(seg(`js_${q.id}_divider`, q.id, "divider",
        mx, my, toC + Math.PI / 2, 16, 3.6, 6.8, qi * 40 + 6));
    }

    // ── 三路切入口轉角：朝中路一側的側翼 L 形轉角（讀成 gank 切入邊界）──
    {
      const wing = toC + (qi % 2 ? -0.8 : 0.8);
      out.push(corner(`js_${q.id}_cut`, q.id, "lane_cut",
        q.x + Math.cos(wing) * (q.r * 0.58), q.y + Math.sin(wing) * (q.r * 0.58),
        wing, 12, 3.4, 6.2, qi * 40 + 7));
    }
  });
  return out;
}
