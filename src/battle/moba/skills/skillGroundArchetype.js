// ============================================================================
//  battle/moba/skills/skillGroundArchetype.js — 技能「階段層」的地面語彙（MOBA Mobile & Presentation Polish）
//
//  Audit：HeroVfxRuntime 的 Combat Quality v1 階段層對**每一招**技能都畫
//    施放：施放者腳下 1 個地面圓環（R 再加 1 個金環）
//    命中：目標處 1–3 個擴散圓環
//  ⇒ 400 招裡只有 burst／ground（89 招，22%）真的是範圍技，其餘 311 招（直線 beam 96、
//    衝刺 dash 81、護盾 65、彈道 36、光環 33）也全部是「一圈圈地面環，只換顏色」。
//    這就是看久會重複的來源（authored 的 motif 編舞本身已經各不相同）。
//
//  現在：階段層依技能**正式資料**（heroDatabase 的 gameplay.mechanic ＋ presentation.primitive）
//    換成不同的地面語彙。只有真正的範圍控制（ring）保留圓環：
//      strip     直線：地面長條＋兩側導線（piercing-line／line／一般 beam）
//      fan       扇形：從施放者放射的扇面（cone-strike）
//      wall      牆：沿路徑立起的一排石板（barrier-line／dash-wall）
//      crescent  連斬：目標處交錯的新月弧（multi-strike）
//      chain     鎖鏈／閃電：施放者到目標的鋸齒鏈（root／control／pull／mark／silence 類）
//      dash      衝刺：路徑上的斷續拖痕＋落點新月（dash／blink）
//      fracture  地裂：目標處放射狀裂痕＋一圈淡環（delayed-area／area-* 地面技）
//      orbit     環繞：繞著施放者轉的碎片（shield／self／team 增益、aura）
//      cross     重擊：目標處 X 形斬痕（execute／empowered-strike）
//      trail     彈道：路徑上的拖尾點＋命中星芒（projectile）
//      ring      範圍控制：沿用原本的擴散圓環（burst）
//
//  ⚠ 純呈現、決定性：只依 progress／origin／target／radius 計算，不讀亂數、不回寫戰鬥狀態。
//    只用 HeroVfxRuntime 既有的 5 個 instanced 池（0 地面環、1 球、2 八面體、3 方塊、4 平面），
//    不新增材質、幾何或 draw call ⇒ 手機成本與原本同級（每招每幀的 emit 數有上限，見 gate）。
// ============================================================================
import { heroById } from "../../../data/heroDatabase.js";

export const GROUND_ARCHETYPES = Object.freeze(["strip", "fan", "wall", "crescent", "chain", "dash", "fracture", "orbit", "cross", "trail", "ring"]);

const CHAIN_MECH = /^(root-|control-target|pull-target|target-mark|silence-target|area-silence)/;
const ORBIT_MECH = /(shield|guard|buff|haste|empower|cdr|heal|revive|cleanse|stealth|taunt)/;

/** 由 mechanic ＋ primitive 決定語彙（純函式；gate 直接列表比對）。 */
export function groundArchetypeFor(mechanic = "", primitive = "") {
  const m = String(mechanic ?? "");
  if (m === "cone-strike") return "fan";
  if (m === "barrier-line" || m === "dash-wall") return "wall";
  if (m === "multi-strike" || m === "split-projectile") return "crescent";
  if (m === "execute-strike" || m === "empowered-strike") return "cross";
  if (CHAIN_MECH.test(m)) return "chain";
  if (primitive === "dash" || /^(dash|blink|ally-blink)/.test(m)) return "dash";
  if (primitive === "burst") return "ring";
  if (primitive === "ground" || /^(delayed-area|area-)/.test(m)) return "fracture";
  if (primitive === "shield" || primitive === "aura" || ORBIT_MECH.test(m)) return "orbit";
  if (primitive === "projectile") return "trail";
  if (primitive === "beam" || m === "piercing-line" || m === "line") return "strip";
  return "ring";
}

const cache = new Map();
/** skillId（`heroId:Q`）→ 語彙。查不到英雄或技能 ⇒ ring（與改版前相同，不猜）。 */
export function groundArchetypeOf(skillId) {
  if (!skillId) return "ring";
  if (cache.has(skillId)) return cache.get(skillId);
  const i = String(skillId).lastIndexOf(":");
  const skill = heroById(String(skillId).slice(0, i))?.skills?.[String(skillId).slice(i + 1)];
  const a = skill ? groundArchetypeFor(skill.gameplay?.mechanic, skill.presentation?.primitive) : "ring";
  cache.set(skillId, a);
  return a;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const GOLD = "#fbbf24";

/**
 * 發出一招技能的階段層。
 * @param e       HeroVfxRuntime 的技能事件（progress／radius／origin／target／color）
 * @param slot    Q／W／E／R
 * @param arche   groundArchetypeOf(e.skillId)
 * @param emit    (pool, x, y, z, sx, sy, sz, opacity, hex, rotation, pitch, roll) — 與 HeroVfxRuntime 同簽名
 *   pool 0 的 rotation 是「地面平面上的轉角」；其他池 rotation 是 yaw。
 */
export function emitGroundArchetype(e, slot, arche, emit) {
  const t = e.progress, r = e.radius, o = e.origin, b = e.target ?? e.origin, c = e.color;
  const ult = slot === "R";
  const rim = ult ? GOLD : c;
  const dx = b.x - o.x, dz = b.z - o.z, len = Math.hypot(dx, dz) || 0.001;
  const ux = dx / len, uz = dz / len, yaw = Math.atan2(dx, dz);
  const cast = t < 0.3 ? 1 - t / 0.3 : 0;              // 施放段強度（1 → 0）
  const hitK = t > 0.62 ? (t - 0.62) / 0.38 : -1;       // 命中段進度（0 → 1）
  const hit = hitK >= 0 ? 1 - hitK : 0;
  const y0 = o.y + 0.05, y1 = b.y + 0.06;
  // 沿路徑的點：f＝前進距離、s＝側向偏移
  const at = (f, s) => [o.x + ux * f - uz * s, o.z + uz * f + ux * s];
  // 地面扁條（pool 3 方塊）：中心 (x,z)、長 L、寬 W、方向 yaw
  const bar = (x, z, y, L, W, a, hex, ang = yaw, h = 0.04) => emit(3, x, y, z, W, h, L, a, hex, ang, 0, 0);
  // 立起的板（pool 3）
  const slab = (x, z, y, L, W, H, a, hex, ang = yaw) => emit(3, x, y + H / 2, z, W, H, L, a, hex, ang, 0, 0);

  switch (arche) {
    case "strip": {
      // 施放：地面長條從施放者往目標鋪過去；兩側細導線
      const reach = Math.min(1, t / 0.45) * len;
      if (t < 0.7) {
        const a = 0.55 * (t < 0.45 ? 1 : 1 - (t - 0.45) / 0.25);
        const [mx, mz] = at(reach / 2, 0);
        bar(mx, mz, y0, reach, r * 0.55, a * 0.5, c);
        for (const s of [-1, 1]) { const [lx, lz] = at(reach / 2, s * r * 0.34); bar(lx, lz, y0 + 0.01, reach, 0.07, a, rim); }
      }
      if (hit > 0) { // 命中：橫向切痕
        bar(b.x, b.z, y1, r * (0.9 + hitK * 0.8), 0.14, hit * 0.8, "#ffffff", yaw + Math.PI / 2);
        bar(b.x, b.z, y1, r * (0.5 + hitK * 0.5), 0.1, hit * 0.7, rim, yaw);
      }
      break;
    }
    case "fan": {
      // 5 道放射扇骨＋外緣弧，展開角 ±40°
      const open = clamp01(t / 0.35), a = t < 0.75 ? 0.62 : (1 - t) / 0.25 * 0.62;
      const spread = 0.7 * open, R = Math.max(r * 1.8, Math.min(len, r * 3));
      for (let j = -2; j <= 2; j++) {
        const ang = yaw + (j / 2) * spread;
        const L = R * (0.55 + 0.45 * open);
        bar(o.x + Math.sin(ang) * L / 2, o.z + Math.cos(ang) * L / 2, y0, L, j === 0 ? 0.16 : 0.09, a * (j === 0 ? 1 : 0.75), j === 0 ? "#ffffff" : c, ang);
      }
      for (let j = -3; j <= 3; j++) { // 外緣弧（短段拼成）
        const ang = yaw + (j / 3) * spread;
        const L = R * (0.55 + 0.45 * open);
        bar(o.x + Math.sin(ang) * L, o.z + Math.cos(ang) * L, y0 + 0.01, R * spread / 3.2 + 0.1, 0.12, a, rim, ang + Math.PI / 2);
      }
      break;
    }
    case "wall": {
      // 沿路徑依序升起 5 片石板，命中後下沉
      const n = 5;
      for (let j = 0; j < n; j++) {
        const rise = clamp01((t - 0.08 - j * 0.06) / 0.18);
        const sink = t > 0.78 ? 1 - (t - 0.78) / 0.22 : 1;
        if (rise <= 0) continue;
        const [x, z] = at(len * (0.25 + 0.75 * j / (n - 1)), (j % 2 ? 0.12 : -0.12));
        slab(x, z, b.y, r * 0.42, 0.28, (0.6 + (ult ? 0.5 : 0.3)) * rise * sink, 0.72 * sink, j % 2 ? c : rim, yaw + Math.PI / 2);
      }
      break;
    }
    case "crescent": {
      // 目標處 3 道交錯新月（由短段拼成的弧），依序劃過
      for (let k = 0; k < 3; k++) {
        const u = clamp01((t - 0.35 - k * 0.1) / 0.25);
        if (u <= 0 || u >= 1) continue;
        const base = yaw + (k - 1) * 0.9, R = r * (0.7 + k * 0.12);
        for (let j = 0; j < 5; j++) {
          const ang = base - 0.9 + (j / 4) * 1.8 * u;
          bar(b.x + Math.sin(ang) * R, b.z + Math.cos(ang) * R, y1 + 0.3 + k * 0.08, R * 0.42, 0.1, (1 - u) * 0.9, j === 4 ? "#ffffff" : c, ang + Math.PI / 2, 0.06);
        }
      }
      if (cast > 0) bar(o.x, o.z, y0, r * 0.6, 0.1, cast * 0.5, rim, yaw);
      break;
    }
    case "chain": {
      // 施放者 → 目標的鋸齒鏈（6 節），命中時在目標處收束成鎖扣
      const reach = clamp01(t / 0.4);
      const a = t < 0.8 ? 0.85 : (1 - t) / 0.2 * 0.85;
      const n = 6;
      let pf = 0, ps = 0;
      for (let j = 1; j <= n; j++) {
        const f = len * reach * j / n, s = j === n ? 0 : (j % 2 ? 0.45 : -0.45) * Math.min(1, r * 0.5);
        const [x1, z1] = at(pf, ps), [x2, z2] = at(f, s);
        const L = Math.hypot(x2 - x1, z2 - z1);
        emit(3, (x1 + x2) / 2, o.y + 0.55, (z1 + z2) / 2, 0.07, 0.07, L, a, j % 2 ? "#ffffff" : c, Math.atan2(x2 - x1, z2 - z1), 0, 0);
        pf = f; ps = s;
      }
      if (hit > 0) for (let j = 0; j < 3; j++) {
        const ang = j * 2.094 + hitK * 1.5;
        emit(2, b.x + Math.sin(ang) * r * 0.45, b.y + 0.6, b.z + Math.cos(ang) * r * 0.45, 0.12, 0.12, 0.2, hit, rim, ang, 0.6, 0);
      }
      break;
    }
    case "dash": {
      // 路徑上的斷續拖痕（依序出現、依序淡出）＋落點新月
      const n = 6;
      for (let j = 0; j < n; j++) {
        const show = clamp01((t - j * 0.05) / 0.12), gone = clamp01((t - 0.35 - j * 0.05) / 0.3);
        const a = show * (1 - gone) * 0.7;
        if (a <= 0.01) continue;
        const [x, z] = at(len * (j + 0.5) / n, 0);
        bar(x, z, y0, len / n * 0.62, r * (0.22 + j * 0.02), a, j % 2 ? c : rim);
      }
      if (hit > 0) for (let j = 0; j < 5; j++) { // 落點新月（面向前進方向的弧）
        const ang = yaw - 1.1 + j * 0.55, R = r * (0.55 + hitK * 0.45);
        bar(b.x + Math.sin(ang) * R, b.z + Math.cos(ang) * R, y1, R * 0.62, 0.12, hit * 0.8, j === 2 ? "#ffffff" : c, ang + Math.PI / 2);
      }
      break;
    }
    case "fracture": {
      // 預告：目標處一圈淡環；落下：6 道放射裂痕（每道兩節折線）
      if (t < 0.62) {
        const k = t / 0.62;
        emit(0, b.x, y1, b.z, r * 1.6, r * 1.6, 1, 0.32 + k * 0.3, c, k * 0.4);
      }
      if (hit > 0) for (let j = 0; j < 6; j++) {
        const ang = j * 1.047 + 0.3, L1 = r * (0.45 + hitK * 0.5), bend = (j % 2 ? 0.35 : -0.3);
        bar(b.x + Math.sin(ang) * L1 / 2, b.z + Math.cos(ang) * L1 / 2, y1, L1, 0.12, hit * 0.85, j % 2 ? "#ffffff" : c, ang);
        const a2 = ang + bend, L2 = L1 * 0.6;
        const ex = b.x + Math.sin(ang) * L1, ez = b.z + Math.cos(ang) * L1;
        bar(ex + Math.sin(a2) * L2 / 2, ez + Math.cos(a2) * L2 / 2, y1, L2, 0.08, hit * 0.7, rim, a2);
      }
      break;
    }
    case "orbit": {
      // 繞著施放者旋轉的 4 片碎片（R 6 片），前段升起、後段收合
      const n = ult ? 6 : 4, a = Math.min(1, t * 6) * (t > 0.8 ? (1 - t) / 0.2 : 1);
      const R = r * (0.75 + 0.15 * Math.sin(t * Math.PI));
      for (let j = 0; j < n; j++) {
        const ang = j * (Math.PI * 2 / n) + t * 5.5;
        emit(2, o.x + Math.sin(ang) * R, o.y + 0.5 + Math.sin(t * 6 + j) * 0.12, o.z + Math.cos(ang) * R,
          0.14, 0.14, 0.3, a * 0.9, j % 2 ? rim : c, ang, 0.4, 0);
      }
      break;
    }
    case "cross": {
      // 施放：短前衝線；命中：X 形斬痕＋中心亮點
      if (cast > 0) { const [x, z] = at(Math.min(len, r) / 2, 0); bar(x, z, y0, Math.min(len, r), 0.1, cast * 0.5, rim); }
      if (hit > 0) {
        for (const s of [-1, 1]) bar(b.x, b.z, y1 + 0.35, r * (0.9 + hitK * 0.6), 0.16, hit * 0.9, s > 0 ? "#ffffff" : c, yaw + s * 0.785, 0.06);
        emit(2, b.x, b.y + 0.4, b.z, 0.22 * hit, 0.22 * hit, 0.22 * hit, hit, rim, 0, 0, 0);
      }
      break;
    }
    case "trail": {
      // 彈道拖尾：4 個遞減的點沿路徑追著走；命中：4 芒星
      const u = clamp01(t / 0.62);
      for (let j = 0; j < 4; j++) {
        const f = Math.max(0, u - j * 0.06) * len;
        const [x, z] = at(f, 0);
        if (t < 0.62) emit(2, x, o.y + 0.55, z, 0.14 - j * 0.025, 0.14 - j * 0.025, 0.3, (1 - j * 0.22) * 0.8, j ? c : "#ffffff", yaw, 1.57, 0);
      }
      if (hit > 0) for (let j = 0; j < 4; j++) bar(b.x, b.z, y1 + 0.3, r * (0.5 + hitK * 0.6), 0.09, hit * 0.85, j % 2 ? c : "#ffffff", yaw + j * 0.785, 0.05);
      break;
    }
    default: { // ring：保留原本的範圍語言（施放環＋命中擴散環；R 加金環）
      if (t < 0.3) {
        const k = t / 0.3, a = (1 - k) * 0.85, cr = r * (0.7 + 0.3 * k) * 2;
        emit(0, o.x, o.y + 0.05, o.z, cr, cr, 1, a, c, k * 0.6);
        if (ult) emit(0, o.x, o.y + 0.06, o.z, r * 2.7, r * 2.7, 1, a * 0.8, GOLD, -k * 0.4);
      }
      if (t > 0.65) {
        const k = (t - 0.65) / 0.35, a = 1 - k;
        const rings = ult ? 3 : (slot === "E" || slot === "W") ? 2 : 1;
        const grow = ult ? 2.2 : 1.6;
        for (let i = 0; i < rings; i++) {
          const kk = Math.max(0, k - i * 0.18);
          const rr = r * (0.5 + kk * grow) * 2;
          emit(0, b.x, b.y + 0.07 + i * 0.01, b.z, rr, rr, 1, a * (1 - i * 0.2), ult && i === rings - 1 ? GOLD : c, kk);
        }
        if (slot === "W") emit(0, b.x, b.y + 0.06, b.z, r * 0.9, r * 0.9, 1, a * 0.7, "#ffffff", 0);
      }
    }
  }
  // R：非圓環語彙也要看得出是大絕 ⇒ 施放段在施放者腳下加一道金色短弧（不是整圈）
  if (ult && arche !== "ring" && cast > 0) {
    for (let j = 0; j < 3; j++) {
      const ang = yaw + Math.PI + (j - 1) * 0.5, R = r * 1.1;
      bar(o.x + Math.sin(ang) * R, o.z + Math.cos(ang) * R, y0 + 0.02, R * 0.5, 0.12, cast * 0.85, GOLD, ang + Math.PI / 2);
    }
  }
}
