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
import { TOWER_HP, NEXUS_HP, ROLE_NAME, posOnLane } from "../../../gameData.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildCampPlan } from "./mapCampLayout.js";
import { isWalkable, projectToWalkable } from "../nav/mobaNavigation.js";
import { archetypeForRole, archetypeData, heroVisualFor, skillVisualFor } from "../presentation/heroArchetypes.js";

/** 呈現用高度（世界單位）：英雄站在地面上，結構的血條掛在頭頂。 */
export const RUNTIME_Y = Object.freeze({ hero: 0, structure: 0 });
export const MINION_RADIUS = 0.68;

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
    const championId = entry?.hero?.id ?? entry?.heroId ?? entry?.id ?? null;
    const visual = heroVisualFor(championId, p.role, entry?.hero?.id ? entry.hero : null);
    const hpRatio = ratio01(p.hp);          // snapshot 的 hp 已是 0–1
    return {
      id: String(p.id),
      team,
      role: p.role ?? null,
      archetype: visual.family ?? archetypeForRole(p.role),
      playerId: String(p.id),
      championId,
      heroId: championId,
      visual,
      displayName: entry?.player?.name ?? (typeof entry?.player === "string" ? entry.player : null) ?? entry?.hero?.zh ?? entry?.hero ?? ROLE_NAME[p.role] ?? String(p.id),
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
export function adaptStructures(snapshot, opts = {}) {
  const towers = snapshot?.towers ?? {};
  const previous = opts.prev?.towers ?? {};
  const alpha = ratio01(opts.interpolation ?? 1);
  return Object.entries(towers).map(([id, t]) => {
    const team = t.side === "red" ? "red" : "blue";
    const type = t.lane === "nexus" ? "nexus" : "tower";
    const { sim, clamped } = safePos(t.pos, baseSim(team));
    const maxHp = STRUCT_MAX_HP(t.lane);
    const hpRatio = ratio01(t.hp);
    const previousHpRatio = ratio01(previous[id]?.hp ?? hpRatio);
    const wasAlive = previousHpRatio > 0;
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
      displayHpRatio: previousHpRatio + (hpRatio - previousHpRatio) * alpha,
      alive: hpRatio > 0,
      previousHpRatio,
      damageDelta: Math.max(0, previousHpRatio - hpRatio),
      damageProgress: alpha,
      destroyProgress: hpRatio <= 0 && wasAlive ? alpha : 0,
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

const MINION_GROUPS = Object.freeze([
  ["top", "bm", "blue"], ["top", "rm", "red"],
  ["mid", "bm", "blue"], ["mid", "rm", "red"],
  ["bot", "bm", "blue"], ["bot", "rm", "red"],
]);
const FORMATION_LATERAL = Object.freeze([-1.05, 0, 1.05, 0]);

function minionById(lanes) {
  const out = new Map();
  for (const [lane, key, team] of MINION_GROUPS) {
    for (const m of lanes?.[lane]?.[key] ?? []) out.set(m.id, { ...m, lane, key, team });
  }
  return out;
}

function minionPosition(lane, team, t, slot, aliveStructures) {
  const center = posOnLane(lane, t);
  const d = 0.002;
  const a = posOnLane(lane, Math.max(0, t - d));
  const b = posOnLane(lane, Math.min(1, t + d));
  const len = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y));
  const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
  const nx = -ty, ny = tx;
  const lateral = FORMATION_LATERAL[slot % FORMATION_LATERAL.length] ?? 0;
  const trail = slot === 3 ? (team === "blue" ? -1.45 : 1.45) : 0;
  const candidate = {
    x: center.x + nx * lateral + tx * trail,
    y: center.y + ny * lateral + ty * trail,
  };
  const sim = isWalkable(candidate.x, candidate.y, MINION_RADIUS, aliveStructures)
    ? candidate
    : projectToWalkable(center.x, center.y, MINION_RADIUS, aliveStructures, 7);
  return { sim, facing: Math.atan2(tx * (team === "blue" ? 1 : -1), ty * (team === "blue" ? 1 : -1)) };
}

/**
 * 三路小兵呈現資料。真值是 snapshot.lanes；隊形只是同一個 lane t 周圍的小幅視覺展開。
 * 候選位置必須通過 H.2 同一份 map geometry + 存活結構碰撞，否則投影回可走區。
 */
export function adaptMinions(snapshot, opts = {}, structures = adaptStructures(snapshot, opts)) {
  const alpha = ratio01(opts.interpolation ?? 1);
  const cur = minionById(snapshot?.lanes);
  const prev = minionById(opts.prev?.lanes);
  const aliveStructures = new Set(structures.filter((s) => s.alive).map((s) => s.id));
  const out = [];
  const add = (m, dying = false) => {
    const q = prev.get(m.id);
    const t = q && !dying ? num(q.t) + (num(m.t) - num(q.t)) * alpha : num(m.t);
    const { sim, facing } = minionPosition(m.lane, m.team, t, m.slot ?? 0, aliveStructures);
    const previousHpRatio = ratio01(q?.hp ?? m.hp);
    const hpRatio = dying ? 0 : ratio01(m.hp);
    out.push({
      id: String(m.id), team: m.team, lane: m.lane,
      kind: m.kind === "caster" ? "caster" : "melee",
      slot: num(m.slot, 0), wave: num(m.wave, 0),
      position: sim, world: simToWorld(sim, 0), facing,
      hpRatio,
      displayHpRatio: previousHpRatio + (hpRatio - previousHpRatio) * alpha,
      previousHpRatio,
      damageDelta: Math.max(0, previousHpRatio - hpRatio),
      hitProgress: alpha,
      alive: !dying,
      spawnProgress: q ? 1 : alpha,
      deathProgress: dying ? alpha : 0,
    });
  };
  for (const m of cur.values()) add(m, false);
  if (alpha < 0.999) {
    for (const m of prev.values()) if (!cur.has(m.id)) add(m, true);
  }
  return out;
}

function phaseAt(progress) {
  const p = ratio01(progress);
  return {
    phase: p < 0.3 ? "cast" : (p < 0.76 ? "travel" : "impact"),
    phaseProgress: p < 0.3 ? p / 0.3 : (p < 0.76 ? (p - 0.3) / 0.46 : (p - 0.76) / 0.24),
  };
}

/** 由相鄰 snapshot 的真實 HP 下降衍生小兵攻擊呈現；live / Replay 共用。 */
export function adaptMinionCombatEffects(minions = [], structures = [], interpolation = 1) {
  const out = [];
  for (const target of minions) {
    if ((target.damageDelta ?? 0) <= 1e-6) continue;
    let towerSource = null, towerBest = 22;
    for (const structure of structures) {
      if (!structure.alive || structure.team === target.team || structure.lane !== target.lane) continue;
      const d = Math.hypot(structure.world.x - target.world.x, structure.world.z - target.world.z);
      if (d < towerBest) { towerBest = d; towerSource = structure; }
    }
    let source = null, best = Infinity;
    if (!towerSource) {
      for (const candidate of minions) {
        if (!candidate.alive || candidate.team === target.team || candidate.lane !== target.lane) continue;
        const d = Math.hypot(candidate.world.x - target.world.x, candidate.world.z - target.world.z);
        if (d < best) { best = d; source = candidate; }
      }
    }
    source = towerSource ?? source;
    if (!source) continue;
    const phase = phaseAt(interpolation);
    const towerHit = !!towerSource;
    out.push({
      id: `minion-hit:${source.id}:${target.id}`,
      type: towerHit ? "tower" : "minion",
      ability: towerHit ? "tower:basic" : `minion:${source.kind}`,
      variant: "basic", feedback: "attack",
      sourceId: source.id, targetId: target.id, archetype: "minion",
      style: towerHit ? "tower" : (source.kind === "caster" ? "minionBolt" : "minionSlash"),
      width: towerHit ? 1.25 : (source.kind === "caster" ? 0.8 : 0.95),
      color: source.team === "blue" ? 0x79c7ff : 0xff8b78,
      ...phase, progress: ratio01(interpolation),
      world: source.world, targetWorld: target.world, lifeRatio: 1 - ratio01(interpolation),
    });
  }
  return out;
}

/** 結構 HP 的真實下降衍生攻城命中；不新增傷害，也不改 snapshot。 */
export function adaptStructureDamageEffects(structures = [], heroes = [], minions = [], interpolation = 1) {
  const out = [];
  for (const target of structures) {
    if ((target.damageDelta ?? 0) <= 1e-7) continue;
    let source = null, best = Infinity;
    for (const candidate of [...heroes, ...minions]) {
      if (!candidate.alive || candidate.team === target.team) continue;
      const d = Math.hypot(candidate.world.x - target.world.x, candidate.world.z - target.world.z);
      if (d < best) { best = d; source = candidate; }
    }
    if (!source) continue;
    out.push({
      id: `structure-hit:${source.id}:${target.id}`,
      type: "siege", ability: "siege:basic", variant: "basic", feedback: "attack",
      sourceId: source.id, targetId: target.id, archetype: "siege", style: "siege",
      width: 1.05, color: source.team === "blue" ? 0x72b7ff : 0xff7568,
      ...phaseAt(interpolation), progress: ratio01(interpolation),
      world: source.world, targetWorld: target.world, lifeRatio: 1 - ratio01(interpolation),
    });
  }
  return out;
}

/** snapshot.fx → runtime-v2 固定池特效資料。未到事件時間或已過期的一律不畫。 */
export function adaptEffects(snapshot, effectTime = snapshot?.ts, opts = {}) {
  const now = num(effectTime, num(snapshot?.ts, 0));
  const out = [];
  for (const f of snapshot?.fx ?? []) {
    if (!f?.pos || !Number.isFinite(f.pos.x) || !Number.isFinite(f.pos.y)) continue;
    const life = Math.max(0.05, num(f.life, f.type === "ult" ? 0.6 : 0.35));
    const age = Number.isFinite(f.at) ? now - f.at : life - num(f.exp, 0);
    if (age < 0 || age >= life) continue;
    const start = simToWorld(clampSim(f.pos), 0);
    const target = f.target && Number.isFinite(f.target.x) && Number.isFinite(f.target.y)
      ? simToWorld(clampSim(f.target), 0)
      : null;
    const splitAt = typeof f.ability === "string" ? f.ability.indexOf(":") : -1;
    const role = splitAt >= 0 ? f.ability.slice(0, splitAt) : null;
    const archetype = archetypeForRole(role);
    const variant = splitAt >= 0 ? f.ability.slice(splitAt + 1) : "basic";
    const rosterEntry = opts.roster?.[f.sourceId] ?? null;
    const heroId = rosterEntry?.hero?.id ?? rosterEntry?.heroId ?? rosterEntry?.id ?? null;
    const heroVisual = heroId ? heroVisualFor(heroId, role, rosterEntry?.hero ?? null) : null;
    const skillVisual = skillVisualFor({
      ability: variant, family: archetype, heroId, visual: heroVisual,
      color: heroVisual?.accent ?? (Number.isFinite(f.color) ? f.color : null),
    });
    const progress = ratio01(age / life);
    let targetId = f.targetId ?? null;
    if (!targetId && f.type === "tower" && f.target) {
      let nearest = null, best = 0.75;
      for (const p of snapshot?.players ?? []) {
        if (p.dead || !p.pos) continue;
        const d = Math.hypot(p.pos.x - f.target.x, p.pos.y - f.target.y);
        if (d < best) { best = d; nearest = p; }
      }
      targetId = nearest?.id ?? null;
    }
    out.push({
      id: String(f.id ?? `${f.at ?? now}:${f.type ?? "orb"}`),
      type: f.type ?? "orb",
      ability: f.ability ?? null,
      variant,
      feedback: f.feedback ?? (variant === "basic" ? "attack" : "skill"),
      sourceId: f.sourceId ?? null,
      targetId,
      archetype,
      width: archetypeData(archetype).effectWidth,
      color: skillVisual.color,
      skillVisual,
      style: f.type === "tower" ? "tower" : skillVisual.style,
      phase: progress < 0.24 ? "cast" : (progress < 0.72 ? "travel" : "impact"),
      phaseProgress: progress < 0.24 ? progress / 0.24
        : (progress < 0.72 ? (progress - 0.24) / 0.48 : (progress - 0.72) / 0.28),
      progress,
      world: start,
      targetWorld: target,
      lifeRatio: ratio01(1 - age / life),
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
  const structures = adaptStructures(snapshot, opts);
  const objectives = adaptObjectives(snapshot);
  const minions = adaptMinions(snapshot, opts, structures);
  const effects = [
    ...adaptEffects(snapshot, opts.effectTime, opts),
    ...adaptMinionCombatEffects(minions, structures, opts.interpolation ?? 1),
    ...adaptStructureDamageEffects(structures, heroes, minions, opts.interpolation ?? 1),
  ];
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
    minions,
    effects,
    teams: { blue, red },
    lanes: LANE_IDS,
    warnings,
  };
}

export default adaptRuntimeMapFrame;
