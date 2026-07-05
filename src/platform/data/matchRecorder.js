// ============================================================================
//  matchRecorder.js — Platform Data Layer 核心（純函式，不 import React）
//
//  recordMatch 的職責拆分：每個 update 函式只負責一件事，recordMatch 只做協調。
//  全部為純函式（輸入 state 片段 → 輸出新值），可 Node 測試、可被未來
//  Sprint 03（Schedule）/04（League）/05（Management）直接重用。
//
//  ⚠ 行為等價原則：本模組逐行對照重構前 recordMatch 的內聯邏輯，數值/順序
//    完全一致。已用 Node 對照測試鎖定（見 /tmp 測試）。
//
//  不觸碰：LogicEngine / Battle / AI / Tick / Formula / FPS / R3F / Router / Flow。
// ============================================================================

// ── 正式資料模型 Schema（工廠函式，預留完整欄位；無資料者為 0/null）──

/** Hero Progress 正式 Schema。目前可填：games/wins/losses/pickCount/lastPlayed/
 *  mvp/masteryExp/masteryLevel；kills/deaths/assists/damage/tower/healing 預留
 *  （MOBA 引擎快照無逐英雄數據，待 Battle 層補上後自動填入，Schema 不需再改）。 */
export function createHeroProgress() {
  return {
    games: 0, wins: 0, losses: 0,
    pickCount: 0, lastPlayed: null,
    masteryExp: 0, masteryLevel: 0,
    mvp: 0,
    kills: 0, deaths: 0, assists: 0,   // 預留（無逐英雄 KDA 來源）
    damage: 0, tower: 0, healing: 0,    // 預留
  };
}

/** Player Career 正式 Schema。favoriteHero 由 heroCounts 導出；careerKDA/Damage 預留。 */
export function createPlayerCareer() {
  return {
    games: 0, wins: 0, losses: 0, winRate: 0,
    favoriteHero: null, totalMvp: 0,
    kills: 0, deaths: 0, assists: 0, damage: 0, // 預留（僅 CS 有 per-player 來源）
    heroCounts: {}, // { heroId: 次數 } → 導出 favoriteHero
  };
}

/** masteryLevel 由累積 exp 導出（每 100 exp 一級的平方根曲線，成長遞減）。 */
function masteryLevelFromExp(exp) {
  return Math.floor(Math.sqrt(Math.max(0, exp) / 50));
}

// ── 共用衍生（一次算出，供各 update 使用；等同重構前 recordMatch 開頭）──
export function deriveMatchContext(result, { record }) {
  const win = !!result.win;
  const isCS = result.mode === "CS" && Array.isArray(result.players);
  const margin = isCS ? Math.abs((result.scoreT ?? 0) - (result.scoreCT ?? 0)) : (win ? 3 : 0);
  const marginF = Math.min(margin / 8, 1); // 0~1
  const streakBefore = (record && record.streak) || 0;
  return { win, isCS, margin, marginF, streakBefore };
}

// ── 1) updateEconomy：財務 / 人氣 / 戰隊經驗（含升級給天賦點）──
export function updateEconomy({ record, fanCount, budget, xp }, ctx) {
  const { win, marginF } = ctx;
  const streak = (record && record.streak) || 0;
  const fanGain = win ? Math.round(120 + marginF * 140 + streak * 25) : Math.round(15 + (1 - marginF) * 30);
  const prizeGain = win ? Math.round(25 + marginF * 20) : 8;
  const xpGain = win ? 50 : 20;
  let cur = xp.cur + xpGain, lv = xp.lv, max = xp.max, levelsGained = 0;
  while (cur >= max) { cur -= max; lv++; levelsGained++; max = Math.round(max * 1.25); }
  return {
    fanGain, prizeGain, xpGain,
    fanCount: fanCount + fanGain,
    budget: budget + prizeGain,
    xp: { lv, cur, max, levelsGained },
    talentPointsAdd: levelsGained,
  };
}

// ── 2) updateSeason：總戰績 record + 賽季勝場 seasonWins ──
export function updateSeason({ record, seasonWins }, ctx) {
  const { win } = ctx;
  return {
    record: { wins: record.wins + (win ? 1 : 0), losses: record.losses + (win ? 0 : 1), streak: win ? record.streak + 1 : 0 },
    seasonWins: seasonWins + (win ? 1 : 0),
  };
}

// ── 3) updatePlayerProgress：roster 每人 KDA/lastMatch/成長/士氣/體力 + Career ──
//    完整保留重構前的 CS/MOBA 分支與成長公式；額外累計 Player Career（正式模型）。
export function updatePlayerProgress(roster, result, ctx, deps) {
  const { win, isCS, marginF } = ctx;
  const PERSONALITY = (deps && deps.PERSONALITY) || [];
  const lineup = Array.isArray(result.lineup) ? result.lineup : null;
  const mvpName = result.ourMvp && result.ourMvp.name;

  return roster.map((p) => {
    const ps = isCS ? result.ourPlayers.find((x) => x.name === p.name) : null;
    let next = { ...p };

    // 生涯 KDA（CS 本場 k/d/a；MOBA 維持）
    if (ps) {
      const [ck, cd, ca] = (p.kda || "0/0/0").split("/").map((n) => parseInt(n) || 0);
      next.kda = `${ck + ps.k}/${cd + ps.d}/${ca + ps.a}`;
      next.lastMatch = { k: ps.k, d: ps.d, a: ps.a, adr: ps.adr, rating: ps.rating, kast: ps.kast, mvpRounds: ps.mvpRounds, clutches: ps.clutches };
    }
    // MOBA 本場英雄
    let myHeroId = null;
    if (!isCS && lineup) {
      const mine = lineup.find((s) => s && s.playerName === p.name);
      if (mine && mine.heroId) { myHeroId = mine.heroId; next.lastMatchMoba = { heroId: mine.heroId, heroZh: mine.heroZh, win, at: Date.now() }; }
    }
    // 成長（rating×年齡×潛力；MOBA 用勝負近似 rating）— 公式與重構前完全一致
    const rating = ps ? ps.rating : (win ? 1.05 : 0.9);
    const avg = Object.values(p.stats || {}).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(p.stats || {}).length);
    const potRoom = Math.max(0, Math.min(1, ((p.potential || 85) - avg) / 30));
    const ageF = Math.max(0.2, Math.min(1.4, (26 - (p.age || 23)) / 8 + 0.2));
    const perfF = Math.max(0, rating - 1.0);
    const growPower = perfF * ageF * potRoom;
    if (growPower > 0.12) {
      const pers = PERSONALITY.find((x) => x.id === p.personality);
      const cand = ((pers && pers.boost) || []).concat(Object.keys(p.stats || {})).filter(Boolean);
      const grown = { ...p.stats }; let bumps = growPower > 0.45 ? 2 : 1;
      for (const k of cand) { if (bumps <= 0) break; const cur = grown[k] ?? 50; if (cur < (p.potential || 99)) { grown[k] = Math.min(p.potential || 99, cur + 1); bumps--; } }
      next.stats = grown;
    }
    // 士氣 / 體力 / condition — 與重構前一致
    let dM = win ? (4 + Math.round(marginF * 4)) : -(4 + Math.round(marginF * 4));
    if (ps && mvpName === p.name) dM += 3;
    if (ps && ps.rating < 0.85) dM -= 2;
    next.morale = Math.max(0, Math.min(100, (p.morale ?? 75) + dM));
    next.energy = Math.max(0, Math.min(100, (p.energy ?? 90) - (6 + Math.round(marginF * 4))));
    if (next.energy < 35 && next.condition !== "低潮") next.condition = "疲勞";

    // ── Player Career 累計（正式模型）──
    const isStarter = isCS ? !!ps : !!(lineup && lineup.some((s) => s && s.playerName === p.name));
    if (isStarter) {
      const c0 = p.career || createPlayerCareer();
      const heroCounts = { ...(c0.heroCounts || {}) };
      if (myHeroId) heroCounts[myHeroId] = (heroCounts[myHeroId] || 0) + 1;
      const games = c0.games + 1;
      const wins = c0.wins + (win ? 1 : 0);
      const losses = c0.losses + (win ? 0 : 1);
      const isMvp = mvpName === p.name;
      // favoriteHero＝出場最多的英雄（CS 無英雄則維持既有）
      let favoriteHero = c0.favoriteHero;
      let maxN = -1;
      for (const [hid, n] of Object.entries(heroCounts)) if (n > maxN) { maxN = n; favoriteHero = hid; }
      next.career = {
        ...c0,
        games, wins, losses,
        winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
        favoriteHero,
        totalMvp: c0.totalMvp + (isMvp ? 1 : 0),
        kills: c0.kills + (ps ? ps.k : 0),
        deaths: c0.deaths + (ps ? ps.d : 0),
        assists: c0.assists + (ps ? ps.a : 0),
        damage: c0.damage, // 預留（無來源）
        heroCounts,
      };
    }
    return next;
  });
}

// ── 4) updateHeroProgress：heroStats 正式 Schema 累計 ──
export function updateHeroProgress(heroStats, result, ctx) {
  const { win } = ctx;
  const lineup = Array.isArray(result.lineup) ? result.lineup : null;
  if (!lineup) return heroStats; // 無出戰陣容（CS/舊 result）→ 不動（向下相容）

  const mvpName = result.ourMvp && result.ourMvp.name;
  const next = { ...heroStats };
  for (const slot of lineup) {
    if (!slot || !slot.heroId) continue;
    const cur = next[slot.heroId] ? { ...createHeroProgress(), ...next[slot.heroId] } : createHeroProgress();
    const masteryExp = cur.masteryExp + (win ? 100 : 40);
    next[slot.heroId] = {
      ...cur,
      games: cur.games + 1,
      wins: cur.wins + (win ? 1 : 0),
      losses: cur.losses + (win ? 0 : 1),
      pickCount: cur.pickCount + 1,
      lastPlayed: Date.now(),
      masteryExp,
      masteryLevel: masteryLevelFromExp(masteryExp),
      mvp: cur.mvp + (mvpName && slot.playerName === mvpName ? 1 : 0),
      // kills/deaths/assists/damage/tower/healing：無逐英雄來源 → 保留（Schema 預留）
    };
  }
  return next;
}

// ── 5) updateMatchHistory：歷史清單（含賽後增量與出戰陣容）──
export function updateMatchHistory(matchHistory, result, deltas) {
  const entry = { id: Date.now(), win: !!result.win, fanGain: deltas.fanGain, prizeGain: deltas.prizeGain, xpGain: deltas.xpGain, ...result };
  return [entry, ...matchHistory].slice(0, 20);
}

// ── 6) buildMatchNotification：賽後一則通知（純資料，套用端負責 setNotifications）──
export function buildMatchNotification(result, deltas, ctx) {
  const { win, isCS } = ctx;
  const scoreStr = isCS ? ` ${result.scoreT}:${result.scoreCT}` : "";
  return { id: Date.now(), type: "match", text: (win ? "比賽勝利" : "比賽失利") + scoreStr + `　聲望 +${deltas.fanGain}、獎金 +$${deltas.prizeGain}萬`, time: "剛剛" };
}
