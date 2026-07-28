// ============================================================================
//  battle/moba/map/mobaRuntimeMapAdapter.js — Runtime Map Adapter（Milestone H.1）
//
//  【職責】把 LogicEngine 的 snapshot 轉成「地圖 Renderer 可以直接畫」的顯示資料。
//   Renderer 因此**不需要**認得 snapshot 的內部形狀，也不需要自己做座標換算。
//
//  【為什麼要這一層】snapshot 是模擬的輸出，欄位是為了模擬與結算設計的：
//     · players[i].hp 是 **0–1 的比例**（不是絕對值），maxHp 根本沒有出現在 snapshot
//     · towers 是一個 **物件**（key → tower），主堡混在裡面（lane === "nexus"）
//     · dragon / baron 是**兩個獨立欄位**，野區營地在 objectives[]（v3 才有）
//     · 位置是模擬座標（0–220），不是世界座標
//   若讓 Renderer 直接讀，這些細節會散進 JSX，之後 snapshot 一改就到處爆。
//
//  【硬規則】
//   · 只讀 snapshot，不 tick、不 import LogicEngine ⇒ 現場對戰與 Replay 共用本檔。
//   · 不新增、不修改任何模擬數值；補洞一律標記 fallback，不假裝是真資料。
//   · 座標換算一律走 coordinateMapping（Runtime Map Coordinate Contract）。
//   · 輸出保證：沒有 NaN / Infinity / undefined position。
//
//  ⚠ 純資料、無 THREE/React。
// ============================================================================
import {
  simToWorld, inBoundsSim, clampSim, baseSim, pitSim, LANE_IDS,
} from "./coordinateMapping.js";
import { TOWER_HP, NEXUS_HP, ROLE_NAME } from "../../../gameData.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildCampPlan } from "./mapCampLayout.js";

/** 呈現用高度（世界單位）：英雄站在地面上，結構的血條掛在頭頂。 */
export const RUNTIME_Y = Object.freeze({ hero: 0, structure: 0 });

/** snapshot 的 hp 欄位是 0–1 比例；還原絕對值時用的每種結構最大血量。 */
const STRUCT_MAX_HP = (lane) => (lane === "nexus" ? NEXUS_HP : TOWER_HP);

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const ratio01 = (v) => Math.min(1, Math.max(0, num(v, 0)));

/**
 * 位置正規化：壞座標一律夾回地圖內並標記，**不**默默丟掉物件
 * （丟掉會讓「10 名英雄」變成 9 名，比畫錯還難查）。
 */
function safePos(pos, fallback) {
  if (inBoundsSim(pos)) return { sim: { x: pos.x, y: pos.y }, clamped: false };
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    return { sim: clampSim(pos), clamped: true };
  }
  return { sim: { ...fallback }, clamped: true };
}

/** 面向：由上一幀到這一幀的位移推出來（snapshot 沒有 facing 欄位）。 */
function facingOf(cur, prev) {
  if (!prev) return 0;
  const dx = cur.x - prev.x, dy = cur.y - prev.y;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return null;   // 沒動就沿用上一次
  return Math.atan2(dx, dy);   // 與地圖其它旋轉同慣例：atan2(dx, dy)
}

/**
 * 英雄顯示資料。
 *
 * @param snapshot LogicEngine.snapshot()
 * @param opts.prev     上一幀 snapshot（推 facing 用；沒有就 facing = null）
 * @param opts.roster   { [playerId]: { player, hero } } 名稱來源（缺就退回 role 名）
 * @returns [{ id, team, role, playerId, championId, displayName, position, world,
 *             facing, hp, maxHp, hpRatio, alive, level, kills, deaths, assists,
 *             targetId, actionState, respawnIn, clamped }]
 */
export function adaptHeroes(snapshot, opts = {}) {
  const prev = opts.prev ?? null;
  const roster = opts.roster ?? {};
  const list = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const prevById = new Map((prev?.players ?? []).map((p) => [p.id, p]));
  return list.map((p) => {
    const team = p.side === "red" ? "red" : "blue";
    const { sim, clamped } = safePos(p.pos, baseSim(team));
    const entry = roster[p.id] ?? null;
    const hpRatio = ratio01(p.hp);          // snapshot 的 hp 已是 0–1
    return {
      id: String(p.id),
      team,
      role: p.role ?? null,
      playerId: String(p.id),
      championId: entry?.hero?.id ?? null,
      displayName: entry?.player?.name ?? entry?.hero?.zh ?? ROLE_NAME[p.role] ?? String(p.id),
      position: sim,
      //  ⚠ 驗收用：呼叫端若有把未內插的引擎座標帶進來（見 MobaRuntimeView3D 的
      //  RuntimeFrameFeeder），原樣傳出去。H.2-close 靠它分辨「碰撞算錯」與「內插切牆角」。
      rawPosition: p.rawPos ? { x: p.rawPos.x, y: p.rawPos.y } : null,
      world: simToWorld(sim, RUNTIME_Y.hero),
      facing: facingOf(sim, prevById.get(p.id)?.pos ?? null),
      //  ⚠ snapshot 不含絕對血量。maxHp 用 1 表示「以比例為單位」，
      //    hp 就是 hpRatio；消費端要畫血條只需要 hpRatio，不會被假的絕對值誤導。
      hp: hpRatio,
      maxHp: 1,
      hpRatio,
      alive: !p.dead,
      //  ⚠ 現場 snapshot 用 `mlv`，Replay frame 攤開後用 `lv`（replayBuffer 的既有欄位名，
      //    H.1-close 不改 schema）⇒ 兩個都收，否則重播時所有英雄都顯示 Lv1。
      level: num(p.mlv ?? p.lv, 1),
      kills: num(p.k, 0),
      deaths: num(p.d, 0),
      assists: num(p.a, 0),
      targetId: p.target ?? null,
      actionState: p.state ?? null,
      respawnIn: num(p.respawn, 0),
      clamped,
    };
  });
}

/**
 * 結構（防禦塔 + 主堡）顯示資料。
 * snapshot.towers 是 { id → {side,lane,tier,pos,hp} }，主堡是 lane === "nexus"。
 * ⚠ 這是**唯一**的塔／主堡來源：Runtime 地圖不得再從 gameData 生成第二套。
 */
export function adaptStructures(snapshot) {
  const towers = snapshot?.towers ?? {};
  return Object.entries(towers).map(([id, t]) => {
    const team = t.side === "red" ? "red" : "blue";
    const type = t.lane === "nexus" ? "nexus" : "tower";
    const { sim, clamped } = safePos(t.pos, baseSim(team));
    const maxHp = STRUCT_MAX_HP(t.lane);
    const hpRatio = ratio01(t.hp);
    return {
      id: String(id),
      type,
      team,
      lane: t.lane ?? null,
      tier: num(t.tier, 0),
      position: sim,
      world: simToWorld(sim, RUNTIME_Y.structure),
      hp: hpRatio * maxHp,
      maxHp,
      hpRatio,
      alive: hpRatio > 0,
      clamped,
    };
  });
}

/**
 * 野區營地的**呈現座標**（bug 修正：見下方 adaptObjectives 說明）。
 * 只計算一次並快取：`buildCampPlan` 是靜態地圖幾何的純函式（與對局無關），
 * 若每次 adaptObjectives 都重建整份 mobaLayout 會很浪費（這支在 60fps 內插下會被頻繁呼叫）。
 */
let _campDisplayById = null;
function campDisplayPos(id) {
  if (!_campDisplayById) {
    const plan = buildCampPlan(buildMobaLayout());
    _campDisplayById = new Map(plan.filter((c) => !c.isPresentation).map((c) => [c.id, { x: c.x, y: c.y }]));
  }
  return _campDisplayById.get(id) ?? null;
}

/**
 * 大型目標與野區營地。
 *   · dragon / baron：snapshot 的獨立欄位；**位置** snapshot 沒有給
 *     ⇒ 用 gameData.PITS 補（presentation fallback，明確標記）。
 *   · objectives[]：v3 規則才有，含營地與大型目標的完整位置與血量。
 *
 *   ⚠ 兩個 Buff 營地（camp_blue_buff / camp_red_buff）的**模擬座標**與**呈現座標**
 *   本來就不同——`mapCampLayout.js`（Milestone G.4）把它們在畫面上位移了 17.1 單位，
 *   理由是原始模擬座標離中路太近，視覺上會變成「怪站在路上」。這個位移**只在呈現層**
 *   生效，LogicEngine 完全不知道（`gameData.js` 與模擬常數都沒有動，Buff 判定距離
 *   仍用原始座標）。
 *   本檔原本直接拿 `o.pos`（模擬座標）當畫面位置，於是「存活狀態環」
 *   （MobaRuntimeStructures 的 objRing）畫在模擬座標，而地圖的野怪剪影（G.4）畫在
 *   位移後的呈現座標 ⇒ 兩者相差 17 個單位，畫面上就是一個孤立的黃圈、旁邊沒有怪
 *   （2026-07-28 手機版問題標記 #1 回報的正是這個）。
 *   修法：野區營地一律改用 `campDisplayPos()` 的呈現座標；沒有位移的營地
 *   （`disp = null`）本來就與模擬座標相同，這裡不會改變它們的畫面位置。
 *   dragon/baron 不受影響（它們不經過 mapCampLayout，維持 PITS 座標）。
 */
export function adaptObjectives(snapshot) {
  const out = [];
  const seen = new Set();

  for (const o of snapshot?.objectives ?? []) {
    const display = campDisplayPos(o.id);
    const { sim, clamped } = safePos(display ?? o.pos, { x: 110, y: 110 });
    seen.add(o.type);
    out.push({
      id: String(o.id),
      type: o.type ?? "camp",
      presentationKey: o.presentationKey ?? o.type ?? "camp",
      team: o.side ?? null,
      position: sim,
      world: simToWorld(sim, RUNTIME_Y.structure),
      hp: ratio01(o.hp) * num(o.maxHp, 1),
      maxHp: num(o.maxHp, 1),
      hpRatio: ratio01(o.hp),
      alive: !!o.alive,
      respawnState: o.alive ? "alive" : (num(o.respawn, 0) > 0 ? "respawning" : "dead"),
      respawnIn: num(o.respawn, 0),
      fallbackPosition: false,
      clamped,
    });
  }

  //  舊規則（沒有 objectives[]）時，dragon / baron 仍要出現在畫面上。
  for (const key of ["dragon", "baron"]) {
    const src = snapshot?.[key];
    if (!src || seen.has(key)) continue;
    const pit = pitSim(key);
    out.push({
      id: key,
      type: key,
      presentationKey: key,
      team: null,
      position: { ...pit },
      world: simToWorld(pit, RUNTIME_Y.structure),
      hp: ratio01(src.hp ?? (src.alive ? 1 : 0)),
      maxHp: 1,
      hpRatio: ratio01(src.hp ?? (src.alive ? 1 : 0)),
      alive: !!src.alive,
      respawnState: src.alive ? "alive" : "respawning",
      respawnIn: num(src.respawn, 0),
      //  ⚠ 位置不是 snapshot 給的，是 gameData 的坑口 ⇒ 明確標記為呈現用補值。
      fallbackPosition: true,
      clamped: false,
    });
  }
  return out;
}

/**
 * 一次把整份 snapshot 轉成 Renderer 需要的資料。
 * @returns {{ ts, over, winner, heroes, structures, objectives, teams, warnings }}
 */
export function adaptRuntimeMapFrame(snapshot, opts = {}) {
  const heroes = adaptHeroes(snapshot, opts);
  const structures = adaptStructures(snapshot);
  const objectives = adaptObjectives(snapshot);
  const warnings = [];
  const blue = heroes.filter((h) => h.team === "blue").length;
  const red = heroes.filter((h) => h.team === "red").length;
  if (blue !== 5 || red !== 5) warnings.push(`英雄人數異常：藍 ${blue} / 紅 ${red}`);
  if (new Set(heroes.map((h) => h.id)).size !== heroes.length) warnings.push("英雄 id 重複");
  const clamped = heroes.filter((h) => h.clamped).length + structures.filter((s) => s.clamped).length;
  if (clamped) warnings.push(`${clamped} 個座標被夾回地圖內（來源資料異常）`);
  return {
    ts: num(snapshot?.ts, 0),
    over: !!snapshot?.over,
    winner: snapshot?.winner ?? null,
    heroes,
    structures,
    objectives,
    teams: { blue, red },
    lanes: LANE_IDS,
    warnings,
  };
}

export default adaptRuntimeMapFrame;
