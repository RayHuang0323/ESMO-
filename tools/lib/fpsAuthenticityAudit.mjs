// Read-only measurements from actual saved frames. No gameplay decisions.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const round = n => Number(n.toFixed(4));
const TYPES = ["flash", "smoke", "he", "molly"];
const counts = () => Object.fromEntries(TYPES.map(type => [type, 0]));
const REGION_NODES = {
  mirage: { A: ["palace", "ramp", "aRamp", "aSite"], B: ["apps", "connector", "bSite"], Mid: ["mid", "topMid", "window"], Spawn: ["tSpawn", "ctSpawn"] },
  dust2: { A: ["longEntry", "long", "longCorner", "aRamp", "aSite", "pit", "shortA", "catwalk"], B: ["lower", "bTunnel", "bDoors", "bSite"], Mid: ["mid", "midDoors", "xbox", "ctMid"], Spawn: ["tSpawn", "ctSpawn"] },
  inferno: { A: ["apps", "boiler", "secondMid", "aConn", "aRamp", "aSite", "arch", "library", "libIn", "pit"], B: ["tRamp", "banana", "car", "bSite", "bTop"], Mid: ["mid", "sewer"], Spawn: ["tSpawn", "ctSpawn"] },
};
export function auditFpsAuthenticity(sim, map, configuration = {}) {
  const regionNodes = REGION_NODES[sim.mapKey];
  if (!regionNodes) throw new Error(`UNKNOWN map region definition ${sim.mapKey}`);
  const anchors = Object.entries(regionNodes).flatMap(([region, keys]) => keys.map(key => ({ region, key, pos: map.nodes[key] })));
  if (anchors.some(a => !finite(a.pos))) throw new Error("Authored node changed: region definition must be reviewed");
  const classify = pos => anchors.reduce((best, node) => {
    const d = dist(pos, node.pos); return d < best.distance || d === best.distance && node.key < best.key ? { ...node, distance: d } : best;
  }, { distance: Infinity, key: "~" }).region;
  const records = new Map(), throws = [], unknown = [];
  let previous = null;
  for (const frame of sim.frames) {
    let record = records.get(frame.rnd);
    if (!record) {
      record = { round: frame.rnd + 1, target: frame.target, startSec: frame.roundSec, endSec: null, samples: 0, regionSamples: { A: 0, B: 0, Mid: 0, Spawn: 0 }, grid: {}, initialInventory: counts(), unused: counts(), utilityPurchased: counts(), utilityCarried: counts(), utilityCost: 0, utilityPurchaseLedgerKnown: true, players: {}, carrierIds: new Set(), reachedIds: new Set(), carrierReachedIds: new Set(), firstShot: null, firstIntel: null, firstKill: null, plant: null, ctRotations: {}, kills: [], carrierDeaths: [], carrierMinSiteDistance: null };
      records.set(frame.rnd, record);
      const buy = sim.buyAudit?.rounds?.find(row => row.round === record.round);
      for (const p of frame.players) {
        record.players[p.id] = { id: p.id, name: p.name, role: p.role, side: p.side, teamId: p.teamId, initialInventory: counts(), used: counts(), unused: counts() };
        for (const type of p.nades || []) if (TYPES.includes(type)) { record.initialInventory[type]++; record.players[p.id].initialInventory[type]++; }
        const ledger = buy?.players?.find(row => row.id === p.id);
        record.players[p.id].utilityNoUseReasons = ledger?.utilityNoUseReasons ?? null;
        if (Array.isArray(ledger?.utilityPurchased) && Array.isArray(ledger?.utilityCarried) && Number.isFinite(ledger?.utilityCost)) {
          const row = record.players[p.id]; row.utilityPurchased = counts(); row.utilityCarried = counts(); row.utilityCost = ledger.utilityCost;
          for (const type of ledger.utilityPurchased) if (TYPES.includes(type)) { record.utilityPurchased[type]++; row.utilityPurchased[type]++; }
          for (const type of ledger.utilityCarried) if (TYPES.includes(type)) { record.utilityCarried[type]++; row.utilityCarried[type]++; }
          record.utilityCost += ledger.utilityCost;
        } else record.utilityPurchaseLedgerKnown = false;
      }
    }
    const sameRound = previous?.rnd === frame.rnd;
    const before = new Map((sameRound ? previous.players : []).map(p => [p.id, p]));
    for (const p of frame.players) {
      if (!p.dead && p.side === "t" && finite(p.pos) && !frame.buyP) {
        const region = classify(p.pos); record.regionSamples[region]++; record.samples++;
        record.tSpawnRadius10Samples = (record.tSpawnRadius10Samples || 0) + Number(dist(p.pos, map.spawns.t) < 10);
        const cell = `${Math.floor(p.pos.x / 5)},${Math.floor(p.pos.y / 5)}`; record.grid[cell] = (record.grid[cell] || 0) + 1;
        const d = dist(p.pos, map.sites[record.target]);
        if (d < 9) record.reachedIds.add(p.id);
        if (p.hasBomb) {
          record.carrierIds.add(p.id);
          record.carrierMinSiteDistance = Math.min(record.carrierMinSiteDistance ?? Infinity, d);
          if (d < 9) record.carrierReachedIds.add(p.id);
        }
      }
      if (p.hasBomb && p.side === "t") record.carrierIds.add(p.id);
      if (!record.firstIntel) {
        const observation = (frame.teamIntel || []).find(i => i.observedAtSec === frame.roundSec);
        if (observation) record.firstIntel = { roundSec: observation.observedAtSec, side: observation.side, observerId: observation.observerId, targetId: observation.targetId, pos: observation.pos };
      }
      if (frame.planted && !p.dead && p.side === "ct" && finite(frame.c4pos)) {
        const rotation = record.ctRotations[p.id] || (record.ctRotations[p.id] = { playerId: p.id, atPlantPos: p.pos, plantDistance: round(dist(p.pos, frame.c4pos)), assignedAtSec: null, firstMotionAtSec: null, firstCloserAtSec: null, arrivedAtSec: null, saveAtSec: null });
        if (p._routePlan?.kind === "retake" && rotation.assignedAtSec == null) rotation.assignedAtSec = p._routePlan.roundSec;
        if (p.tacticalIntent?.kind === "save" && rotation.saveAtSec == null) rotation.saveAtSec = frame.roundSec;
        const prior = before.get(p.id);
        if (prior && dist(prior.pos, p.pos) > .05) {
          if (rotation.firstMotionAtSec == null) rotation.firstMotionAtSec = frame.roundSec;
          if (dist(prior.pos, frame.c4pos) - dist(p.pos, frame.c4pos) > .05 && rotation.firstCloserAtSec == null) rotation.firstCloserAtSec = frame.roundSec;
        }
        if (dist(p.pos, frame.c4pos) < 6 && rotation.arrivedAtSec == null) rotation.arrivedAtSec = frame.roundSec;
      }
    }
    for (const muzzle of frame.muzzles || []) {
      const atSec = Number(muzzle.shotAtMs) / 1000;
      if (Number.isFinite(atSec) && (!record.firstShot || atSec < record.firstShot.roundSec)) record.firstShot = { roundSec: atSec, attackerId: muzzle.attackerId, targetId: muzzle.targetId ?? null, pos: muzzle.pos, weaponFamily: muzzle.weaponFamily };
    }
    for (const event of frame.events || []) {
      if (event.type === "kill") {
        record.kills.push({ roundSec: event.roundSec, killerId: event.killerId, victimId: event.victimId, victimSide: event.victimSide, pos: event.pos });
        if (!record.firstKill) record.firstKill = record.kills.at(-1);
        if (before.get(event.victimId)?.hasBomb) record.carrierDeaths.push(record.kills.at(-1));
      }
      if (event.type === "bomb-planted") {
        const carrier = frame.players.find(p => p.id === event.playerId);
        record.plant = { roundSec: event.roundSec, site: event.site, carrierId: event.playerId, pos: event.position || event.pos, carrierPos: carrier?.pos ?? null };
        // Plant clears hasBomb before the saved frame. The actual actor position
        // at the plant event is still evidence of arrival on this same tick.
        if (carrier && finite(carrier.pos) && dist(carrier.pos, map.sites[event.site]) < 9) record.carrierReachedIds.add(carrier.id);
      }
      if (event.type === "utility-throw") {
        const projectile = (frame.throwables || []).find(t => t.id === event.throwableId);
        const type = event.utility || projectile?.type;
        const actor = frame.players.find(p => p.id === event.playerId);
        const row = { round: frame.rnd + 1, roundSec: event.roundSec, playerId: event.playerId, side: actor?.side ?? null, type, purpose: event.intent || projectile?.intent || "UNKNOWN", from: event.pos || projectile?.from || null, to: event.to || projectile?.to || null };
        row.fromRegion = finite(row.from) ? classify(row.from) : "UNKNOWN"; row.toRegion = finite(row.to) ? classify(row.to) : "UNKNOWN";
        throws.push(row); if (record.players[event.playerId] && TYPES.includes(type)) record.players[event.playerId].used[type]++;
      }
    }
    record.endSec = frame.roundSec; record.last = frame;
    previous = frame;
  }
  const rounds = [...records.values()].map(record => {
    const last = record.last, history = sim.roundHist[record.round - 1]; delete record.last;
    for (const p of last.players) for (const type of p.nades || []) if (TYPES.includes(type)) { record.unused[type]++; record.players[p.id].unused[type]++; }
    const alive = side => last.players.filter(p => p.side === side && !p.dead).length;
    const terminal = { how: history?.how ?? "UNKNOWN", winnerSide: history?.winnerSide ?? "UNKNOWN", aliveT: alive("t"), aliveCT: alive("ct") };
    const noPlantElimination = !record.plant && terminal.how === "elim" ? { terminal, carrierDeaths: record.carrierDeaths, carrierEverReachedSite: record.carrierReachedIds.size > 0, carrierMinSiteDistance: record.carrierMinSiteDistance, factualReason: terminal.aliveT === 0 ? "T全滅且尚未安包" : terminal.aliveCT === 0 ? "CT全滅且尚未安包" : "UNKNOWN：終局存活不符合全滅", strategicReason: "UNKNOWN：真frame只能證位置/死亡鏈，未保存決策不安包理由" } : null;
    const fraction = Object.fromEntries(Object.entries(record.regionSamples).map(([k, n]) => [k, record.samples ? round(n / record.samples) : null]));
    for (const rotation of Object.values(record.ctRotations)) for (const field of ["assignedAtSec", "firstMotionAtSec", "firstCloserAtSec", "arrivedAtSec", "saveAtSec"]) rotation[`${field}AfterPlant`] = rotation[field] != null && record.plant ? round(rotation[field] - record.plant.roundSec) : null;
    return { ...record, terminal, regionFraction: fraction, grid: Object.entries(record.grid).map(([cell, samples]) => ({ cell: cell.split(",").map(Number), samples })), carrierIds: [...record.carrierIds], reachedIds: [...record.reachedIds], carrierReachedIds: [...record.carrierReachedIds], noPlantElimination };
  });
  const sum = field => Object.fromEntries(TYPES.map(type => [type, rounds.reduce((n, r) => n + r[field][type], 0)]));
  const used = counts(), purposeCounts = {}, sideCounts = {}, positionCounts = {};
  for (const row of throws) { if (TYPES.includes(row.type)) used[row.type]++; const add = (obj, key) => obj[key] = (obj[key] || 0) + 1; add(purposeCounts, `${row.type}/${row.purpose}`); add(sideCounts, `${row.side}/${row.type}`); add(positionCounts, `${row.type}/${row.purpose}/${row.fromRegion}>${row.toRegion}`); }
  const purchaseLedgerKnown = rounds.every(r => r.utilityPurchaseLedgerKnown);
  if (!purchaseLedgerKnown) unknown.push("獨立utility逐筆購買ledger或花費未保存；first-frame nades只證初始持有，不能直接宣稱purchase-to-use率");
  if (throws.some(row => ["UNKNOWN", "tactic", "opportunistic"].includes(row.purpose))) unknown.push("部分intent只保存tactic/opportunistic；掩護進場/清角/回防延緩等更細purpose未保存，不能從落點杜撰");
  unknown.push("地圖沒有canonical A/B/Mid polygon；本報告使用正式node派生Voronoi統計分區，不能当引擎區域規則");
  const initial = sum("initialInventory"), unused = sum("unused");
  const purchaseToUse = purchaseLedgerKnown ? Object.fromEntries(TYPES.map(type => {
    let purchased = 0, carried = 0, minPurchasedUsed = 0, maxPurchasedUsed = 0;
    for (const r of rounds) for (const p of Object.values(r.players)) { purchased += p.utilityPurchased[type]; carried += p.utilityCarried[type]; minPurchasedUsed += Math.max(0, p.used[type] - p.utilityCarried[type]); maxPurchasedUsed += Math.min(p.used[type], p.utilityPurchased[type]); }
    return [type, { purchased, carried, minPurchasedUsed, maxPurchasedUsed, minRate: purchased ? round(minPurchasedUsed / purchased) : null, maxRate: purchased ? round(maxPurchasedUsed / purchased) : null, attribution: minPurchasedUsed === maxPurchasedUsed ? "EXACT" : "UNKNOWN同類carry與new沒有投擲單顆來源標記，保留界限不虛構FIFO" }];
  })) : "UNKNOWN：無完整utility purchase ledger";
  return { schema: "cs-gameplay-authenticity-audit.v1", configuration, mapKey: sim.mapKey, sceneVersion: sim.sceneVersion, completed: sim.completed, frameCount: sim.frames.length, roundCount: sim.roundHist.length, score: { us: sim.tScore, enemy: sim.ctScore }, measurement: { regionMethod: "正式map.nodes最近node Voronoi；同距離以node key排序；節點分類如下；A/B/Mid比例分母包含Spawn", regionNodes, anchors, samples: "每0.5s保存tick的存活T位置、排除buyP；cell=floor(x/5),floor(y/5)，5x5單位；各round按frame.rnd/currentSide", firstContact: "firstShot=最早權威muzzle.shotAtMs；firstIntel與firstKill另列；不以近距離猜LOS接觸", carrierArrival: "真持包且存活T距round.target正式site<9（canonical plant半徑）或真plant同tick actorPos<9；統計ever，不等於保證安包", ctRotate: "安包後retake實際route metadata、第一真位移/向包點接近/距<6抵達，均保存時間及相對plant延遲" }, summary: { plants: rounds.filter(r => r.plant).length, carrierReachedRounds: rounds.filter(r => r.carrierReachedIds.length).length, carrierReachedRoundRate: round(rounds.filter(r => r.carrierReachedIds.length).length / rounds.length), noPlantEliminationRounds: rounds.filter(r => r.noPlantElimination).length, initialInventory: initial, thrown: used, unused, initialInventoryToUseRate: Object.fromEntries(TYPES.map(type => [type, initial[type] ? round(used[type] / initial[type]) : null])), utilityPurchased: purchaseLedgerKnown ? sum("utilityPurchased") : "UNKNOWN", utilityCarried: purchaseLedgerKnown ? sum("utilityCarried") : "UNKNOWN", utilityCost: purchaseLedgerKnown ? rounds.reduce((n, r) => n + r.utilityCost, 0) : "UNKNOWN", purchaseToUse, purposeCounts, sideCounts, positionCounts }, unknown, rounds, utilityThrows: throws };
}

export function summarizeFpsAuthenticityAudit(audit) {
  const regionCounts = { A: 0, B: 0, Mid: 0, Spawn: 0 };
  for (const r of audit.rounds) for (const key of Object.keys(regionCounts)) regionCounts[key] += r.regionSamples[key];
  const samples = Object.values(regionCounts).reduce((a, b) => a + b, 0);
  audit.summary.regionSamples = regionCounts;
  audit.summary.regionFraction = Object.fromEntries(Object.entries(regionCounts).map(([key, n]) => [key, samples ? round(n / samples) : null]));
  if (audit.rounds.every(r => Number.isFinite(r.tSpawnRadius10Samples))) {
    audit.summary.tSpawnRadius10Samples = audit.rounds.reduce((n, r) => n + r.tSpawnRadius10Samples, 0);
    audit.summary.tSpawnRadius10Fraction = samples ? round(audit.summary.tSpawnRadius10Samples / samples) : null;
  } else audit.summary.tSpawnRadius10Fraction = "UNKNOWN：原compact extraction未保存精確distance；不可拿派生Spawn分區冒充10半徑";
  audit.summary.plantSites = Object.fromEntries(["a", "b"].map(site => [site, audit.rounds.filter(r => r.plant?.site === site).length]));
  audit.summary.roundTargets = Object.fromEntries(["a", "b"].map(site => [site, audit.rounds.filter(r => r.target === site).length]));
  audit.summary.firstShotSecByRound = audit.rounds.map(r => ({ round: r.round, sec: r.firstShot?.roundSec ?? null }));
  audit.summary.noPlantEliminationReasons = audit.rounds.filter(r => r.noPlantElimination).reduce((totals, r) => { const reason = r.noPlantElimination.factualReason; totals[reason] = (totals[reason] || 0) + 1; return totals; }, {});
  audit.summary.ctRotations = audit.rounds.filter(r => r.plant).map(r => ({ round: r.round, plantSec: r.plant.roundSec, players: Object.values(r.ctRotations) }));
  audit.summary.utilityInventoryConservationErrors = audit.rounds.flatMap(r => Object.values(r.players).flatMap(p => TYPES.filter(type => p.initialInventory[type] - p.used[type] !== p.unused[type]).map(type => ({ round: r.round, playerId: p.id, type, initial: p.initialInventory[type], used: p.used[type], unused: p.unused[type] }))));
  audit.summary.utilityPurchaseConservationErrors = audit.rounds.filter(r => r.utilityPurchaseLedgerKnown).flatMap(r => Object.values(r.players).flatMap(p => TYPES.filter(type => p.utilityPurchased[type] + p.utilityCarried[type] !== p.initialInventory[type]).map(type => ({ round: r.round, playerId: p.id, type, purchased: p.utilityPurchased[type], carried: p.utilityCarried[type], initial: p.initialInventory[type] }))));
  const purchasedPlayers = new Map();
  audit.unusedPurchasedByPlayerRound = audit.rounds.filter(r => r.utilityPurchaseLedgerKnown).flatMap(r => Object.values(r.players).flatMap(p => {
    let aggregate = purchasedPlayers.get(p.id);
    if (!aggregate) { aggregate = { playerId: p.id, name: p.name, role: p.role, purchased: counts(), thrown: counts(), unused: counts(), purchasedRounds: counts(), noUseReasons: {} }; purchasedPlayers.set(p.id, aggregate); }
    for (const type of TYPES) { aggregate.purchased[type] += p.utilityPurchased[type]; aggregate.thrown[type] += p.used[type]; aggregate.unused[type] += p.unused[type]; aggregate.purchasedRounds[type] += Number(p.utilityPurchased[type] > 0); const reasons=p.utilityNoUseReasons?.[type];if(reasons){aggregate.noUseReasons[type]??={};for(const[reason,n]of Object.entries(reasons))aggregate.noUseReasons[type][reason]=(aggregate.noUseReasons[type][reason]||0)+n;} }
    return TYPES.filter(type => p.utilityPurchased[type] > 0 && p.used[type] === 0).map(type => ({ round: r.round, playerId: p.id, name: p.name, role: p.role, side: p.side, type, purchased: p.utilityPurchased[type], thrown: 0, terminalUnusedInventory: p.unused[type], deathEvents: r.kills.filter(k => k.victimId === p.id), observedTerminal: r.terminal, reason: "UNKNOWN: canonical has no did-not-throw decision reason ledger; death/terminal facts are recorded without inventing motive" }));
  }));
  audit.utilityNeverUsedPurchases = [...purchasedPlayers.values()].flatMap(p => TYPES.filter(type => p.purchased[type] > 0 && p.thrown[type] === 0).map(type => ({ playerId: p.playerId, name: p.name, role: p.role, type, purchasedAcrossMatch: p.purchased[type], thrownAcrossMatch: 0, unusedInventoryAcrossRounds: p.unused[type], reason: "UNKNOWN: no canonical did-not-throw reason ledger; proven all purchased instances of this type were not thrown by this player in this match" })));
  for(const row of audit.unusedPurchasedByPlayerRound){const player=audit.rounds.find(round=>round.round===row.round).players[row.playerId];row.liveNoUseReasons=player.utilityNoUseReasons?.[row.type]??null;if(row.liveNoUseReasons)row.reason='canonical live onSkip counters per held type; not an item-specific purchase attribution or duration';}
  for(const row of audit.utilityNeverUsedPurchases){const player=purchasedPlayers.get(row.playerId);row.purchasedRounds=player.purchasedRounds[row.type];row.liveNoUseReasons=player.noUseReasons[row.type]??null;row.reviewFlag=row.purchasedRounds>1?'REPEATED_BOUGHT_ZERO_USE':'ONE_ROUND_UNUSED';if(row.liveNoUseReasons){row.reason='observed canonical onSkip reason counters; no inferred motive';row.mostRecordedReason=Object.entries(row.liveNoUseReasons).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]??null;}row.assessment='REVIEW_REQUIRED: recurring purchase/use gap is reported; observed dead/blind/save context is not automatically a gameplay bug';}
  audit.utilityNoUseCounterMethod='canonical chooseContextUtility onSkip callback; increment once for each currently carried item of that type when this actor call returns null. Counts are observations, not seconds, unique items, or proof of why a purchased instance was never used. Dead/buy-phase/cooldown and other reasons remain separately named.';
  return audit;
}

export function authenticityHeatmapHtml(audit) {
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sections = audit.rounds.map(r => {
    const max = Math.max(1, ...r.grid.map(g => g.samples));
    const cells = r.grid.map(g => `<rect x="${g.cell[0] * 5}" y="${g.cell[1] * 5}" width="5" height="5" fill="rgb(250,120,45)" opacity="${.1 + .9 * g.samples / max}"><title>${g.samples} alive-T samples</title></rect>`).join("");
    const nodes = audit.measurement.anchors.map(n => `<circle cx="${n.pos.x}" cy="${n.pos.y}" r=".8" fill="${n.region === "A" ? "#55aaff" : n.region === "B" ? "#77ee99" : "#ddd"}"/><text x="${n.pos.x + 1}" y="${n.pos.y}" font-size="2.5" fill="#ddd">${esc(n.key)}</text>`).join("");
    return `<article><h2>R${r.round} · target ${esc(r.target)} · ${esc(r.terminal.how)} · plant ${r.plant?.roundSec ?? "NONE"}s</h2><svg viewBox="0 0 100 100" aria-label="Round ${r.round} alive T position heatmap"><rect width="100" height="100" fill="#111923"/>${cells}${nodes}</svg><p>${esc(JSON.stringify(r.regionFraction))}</p></article>`;
  }).join("");
  return `<!doctype html><meta charset="utf-8"><title>CS Before actual saved T position heatmap</title><style>body{background:#090e15;color:#ddd;font:14px system-ui;margin:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}svg{width:100%;max-width:500px}h2{font-size:15px}</style><h1>${esc(audit.mapKey)} · actual saved frames</h1><p>5x5 unit grid; alive T after buy; per-round intensity normalized. Derived authored-node Voronoi region labels, not canonical polygons. JSON is authoritative audit output.</p><div class="grid">${sections}</div>`;
}
