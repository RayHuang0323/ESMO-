// Intent only: canonical navigation and combat own movement and damage.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
export function fpsTacticalPlanningTarget({ player, tactic, planted, target, sceneVersion }) {
  // The defender's selected deployment is known. The attacker's secret site
  // is not a pre-plant input to defender route selection.
  return sceneVersion !== "legacy" && player.side === "ct" && !planted ? (tactic?.site === "a" || tactic?.site === "b" ? tactic.site : null) : target;
}
export function collectFpsTeamIntel({ players, previous = [], roundSec, walls, canSee, ttlSec = 3 }) {
  const alive = players.filter(p => !p.dead);
  const memory = new Map(previous.filter(i => finite(i.pos) && roundSec >= i.observedAtSec && roundSec - i.observedAtSec <= ttlSec && alive.some(p => p.id === i.targetId && p.side !== i.side))
    .map(i => [`${i.side}:${i.targetId}`, { ...i, visibleTo: [], pos: { ...i.pos }, ...(i.observerPos ? { observerPos: { ...i.observerPos } } : {}) }]));
  for (const observer of alive) for (const target of alive) {
    if (!finite(observer.pos) || !finite(target.pos) || observer.side === target.side || !canSee(observer, target, walls)) continue;
    const key = `${observer.side}:${target.id}`;
    const visibleTo = [...(memory.get(key)?.visibleTo || []), observer.id];
    memory.set(key, { side: observer.side, targetId: target.id, pos: { ...target.pos }, observerPos: { ...observer.pos }, observedAtSec: roundSec, observerId: observer.id, visibleTo });
  }
  return [...memory.values()];
}

export function decideFpsTacticalIntent({ player, intel, roundSec, planted, sites, bombPos, bombTimeSec, spawn, defuseDurationSec = 10, travelDurationSec, recentKills = [] }) {
  const losses = recentKills.filter(k => k.victimSide === player.side && k.killerSide !== player.side && k.victimId !== player.id && roundSec >= k.roundSec && roundSec - k.roundSec <= 5);
  const validIntel = intel.filter(i => i.side === player.side && roundSec >= i.observedAtSec && roundSec - i.observedAtSec <= 3);
  const visible = i => i.observedAtSec === roundSec && (i.visibleTo?.includes(player.id) || i.observerId === player.id);
  // Trades are local opportunities. A death across the map must not pull an
  // anchor away from its assignment; current direct contact wins over reports.
  const tradeIntel = validIntel.find(i => dist(player.pos, i.pos) <= 26 && losses.some(k => k.killerId === i.targetId));
  const known = validIntel.filter(visible).sort((a,b)=>dist(player.pos,a.pos)-dist(player.pos,b.pos))[0] || tradeIntel || validIntel
    .sort((a, b) => dist(player.pos, a.pos) - dist(player.pos, b.pos) || String(a.targetId).localeCompare(String(b.targetId)))[0];
  const cue=player.perceptionCue;
  const base = { kind: "hold", aim: known ? { ...known.pos } : cue ? {...cue.pos} : null, routeTarget: null, source: known ? (visible(known) ? "visible" : known.observerId === player.id ? "memory" : "team-intel") : cue?.source || "none", targetId: known?.targetId ?? null, observedAtSec: known?.observedAtSec ?? cue?.observedAtSec ?? null, pace: 1 };
  if (player.dead) return { ...base, aim: null, targetId: null, source: "none", pace: 0 };
  // Travel lower bound plus this actor's authoritative defuse duration. Saving
  // follows a real navigation route; it never grants a survivor or a weapon.
  if (planted && player.side === "ct" && finite(bombPos) && finite(spawn) && bombTimeSec < (Number.isFinite(travelDurationSec) ? Math.max(0, travelDurationSec) : dist(player.pos, bombPos) / 4.8) + defuseDurationSec) return { ...base, kind: "save", routeTarget: { ...spawn }, pace: 1 };
  if (known && (player.hp < 35 || player.blindSec > 0)) {
    const dx = player.pos.x - known.pos.x, dy = player.pos.y - known.pos.y, length = Math.hypot(dx, dy) || 1;
    return { ...base, kind: "retreat", routeTarget: { x: player.pos.x + dx / length * 7, y: player.pos.y + dy / length * 7 }, pace: 1 };
  }
  if (!planted && player.side==='ct' && player.informationRotator && sites) {
    const pressured=Object.entries(sites).find(([site,pos])=>site!==player.deploymentSite&&finite(pos)&&validIntel.filter(i=>dist(i.pos,pos)<20).length>=2);
    if(pressured&&dist(player.pos,pressured[1])>16)return {...base,kind:'rotate',routeTarget:{...pressured[1]},pace:1};
  }
  // A bomb carrier supports the execute rather than chasing every reported kill.
  if (tradeIntel && !player.hasBomb && base.source !== 'visible') return { ...base, kind: "trade", routeTarget: { ...tradeIntel.pos }, pace: 1 };
  const inRange=known&&dist(player.pos,known.pos)<=(player.engagementRange||55);
  // Keep the remaining navigation cursor while firing. A carrier may cross a
  // distant reported angle; a visible opponent in range warrants a real stop.
  const stopMovement=Boolean(inRange&&player.blindSec<=0&&(!player.hasBomb||dist(player.pos,known.pos)<24)&&base.source==='visible');
  if(known)return{...base,kind:player.role==='entry'?'peek':'hold',pace:stopMovement?0:1,stopMovement};
  const deployed=player.side==='ct'&&!planted&&player.route?.length>1&&player.routeIdx>=player.route.length-1;
  return{...base,pace:deployed?0:1,stopMovement:Boolean(deployed)};
}

export function selectFpsCrossfireAnchor({ player, players, nodes, target }) {
  const site = nodes[`${target}Site`];
  if (!site) return null;
  // Mirage has only one authored node inside 20 units of either site. Use
  // the next nearby authored lanes as well, nearest first, so crossfire can
  // actually allocate distinct angles. Canonical navigation owns reachability.
  const anchors = Object.entries(nodes).filter(([key, p]) => !key.endsWith("Spawn") && finite(p) && dist(p, site) <= 32 && dist(p, site) > 4)
    .sort(([a, ap], [b, bp]) => dist(ap, site) - dist(bp, site) || a.localeCompare(b));
  const team = players.filter(p => !p.dead && p.side === player.side).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const index = team.findIndex(p => p.id === player.id);
  return index >= 0 && anchors[index] ? { ...anchors[index][1] } : null;
}

export function getFpsRoundOutcomeMetrics({ players, kills, clutchEpisodes, winnerTeam }) {
  const traded = new Set();
  for (const loss of kills) if (loss.killerSide !== loss.victimSide && kills.some(revenge => revenge.victimId === loss.killerId && revenge.killerSide === loss.victimSide && revenge.victimSide !== revenge.killerSide && revenge.roundSec > loss.roundSec && revenge.roundSec - loss.roundSec <= 5)) traded.add(loss.victimId);
  const clutch = clutchEpisodes.find(e => e.opponentCount > 0 && players.some(p => p.id === e.playerId && p.teamId === winnerTeam && !p.dead));
  return { tradedIds: [...traded], clutchId: clutch?.playerId ?? null };
}
