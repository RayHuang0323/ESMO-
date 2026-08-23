// ============================================================================
//  tools/check_fan_system.mjs — Fan System contract 驗證（F1 起）
//
//  執行：`node tools/check_fan_system.mjs`
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  粉絲系統的產品紅線與結構不變式。它守的是**方向與職責**，不是絕對數值：
//    · 粉絲不得碰戰力（紅線 10）、不得繞 perk 迂迴（裁決 A）
//    · 結算冪等、資格集中、畫面只讀
//    · 來源權重的**順序**（練習 < 聯賽 < Major）
//
//  ⚠ **刻意不斷言絕對數值。** `reqFans` 與來源倍率都是 calibration target
//    （裁決 B）；把它們寫死進 gate，等於每次調數值都要改 gate，
//    gate 就從保護變成阻力。數值的可達性由 `tools/fan_calibration.mjs` 負責。
//
//  ⚠ **靜態掃描一律先剝註解。** 這個 repo 的註解裡本來就大量出現
//    「fans」「perk」「reputation」——不剝註解的 grep 會掃到說明文字，
//    然後把「我們刻意不做這件事」的註解判成「做了這件事」。
//    （這個坑之前踩過，見 `check_progress25` §240 的既有註記。）
//
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗 → 一律用絕對 file:// URL import。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const raw = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/**
 * 剝掉註解與字串字面值，只留**會執行的程式碼**。
 * 順序很重要：先字串再註解會把註解裡的引號誤判成字串開頭，所以一次掃過去。
 */
function codeOnly(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; out += q + q; continue;                      // 字串換成空字串，保留語法形狀
    }
    out += c; i++;
  }
  return out;
}

const A = [];
const ck = (name, cond, detail = "") => A.push([name, !!cond, detail]);

// ── 待驗模組 ───────────────────────────────────────────────────────────────
const fsw = await import(u("src/platform/progress/fanSourceWeight.js"));
const { teamRewardsFor } = await import(u("src/platform/progress/rewardFormulas.js"));
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { makeTransactionId, MATCH_PROGRESS_TX_VERSION } = await import(u("src/platform/contracts/matchProgressTransaction.js"));
const { SPONSORS } = await import(u("src/data/playerModel.js"));
const { sponsorEligibility } = await import(u("src/platform/economy/sponsors.js"));
const { createCompetition } = await import(u("src/platform/contracts/competition.js"));

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
const { useProfileStore } = await import(u("src/platform/profileStore.js"));
const START_FANS = useProfileStore.getState().meta.fans;

// ══ §1 粉絲不進 stats / 戰力 / 勝率 / 引擎 ════════════════════════════════
{
  const engines = [
    "src/LogicEngine.js",
    "src/battle/moba/LogicEngine.js",
    "src/battle/battleResult.js",
    "src/battle/moba/matchProgression.js",
    "src/battle/battleReducer.js",
  ].filter((p) => fs.existsSync(path.join(ROOT, p)));
  const dirty = engines.filter((p) => /\bfans\b/i.test(codeOnly(raw(p))));
  ck("1a) 引擎 / 戰力 / BattleResult 的**程式碼**沒有 fans（註解不算）",
    dirty.length === 0, dirty.join(", ") || `已掃 ${engines.length} 檔，乾淨`);

  //  唯一允許的例外：賽後把現有粉絲數餵給獎勵公式。它讀 fans，但算的是獎勵不是戰力。
  const feed = codeOnly(raw("src/battle/useBattleFeed.js"));
  ck("1b) `useBattleFeed` 只把 fans 當獎勵輸入（fansNow），不進模擬",
    /fansNow:\s*profile\.meta\?\.fans/.test(feed) &&
    !/configurePlayers|configureMatch/.test(feed.split("fansNow")[1] ?? ""),
    "fansNow → teamRewardsFor");

  //  行為面：同樣的比賽、不同的粉絲數，選手 XP 與勝負不得改變
  const mk = (fansNow) => teamRewardsFor({ win: true, marginF: 0.5, streak: 1, fansNow, fanSourceWeight: 1 });
  const a = mk(0), b = mk(9_000_000);
  ck("1c) 粉絲數不影響獎金（fans 只影響 fans）",
    a.money === b.money && a.prizeWan === b.prizeWan,
    `money ${a.money} vs ${b.money}`);
}

// ══ §2 重複結算不重複加 fans ══════════════════════════════════════════════
{
  const tx = {
    version: MATCH_PROGRESS_TX_VERSION,
    transactionId: makeTransactionId("moba", "fs-1"),
    matchId: "fs-1", mode: "moba",
    sourceResultVersion: "BattleResult.v2", recordedAt: 1_700_000_000_000,
    teamRewards: { money: 1000, fans: 300, reputation: 0 },
    playerProgress: [], unlocks: [], metadata: { winner: "blue" },
  };
  const s0 = {
    players: [], finance: { funds: 1_000_000, transactions: [] },
    meta: { fans: 1_000, reputation: 40, days: 8 }, processedMatchTransactions: {},
  };
  const first = applyProgressToState(s0, tx);
  const s1 = { ...s0, ...first.nextState };
  const second = applyProgressToState(s1, tx);
  ck("2) 同一場重複結算不重複加 fans",
    s1.meta.fans === 1_300 && second.nextState === null && second.receipt.alreadyApplied === true,
    `一次後 ${s1.meta.fans}，二次 nextState=${second.nextState}`);
}

// ══ §3 來源權重順序：Practice < League < Major ════════════════════════════
{
  const W = fsw.FAN_SOURCE_WEIGHT;
  const p = W[fsw.FAN_SOURCE.practice], l = W[fsw.FAN_SOURCE.league], m = W[fsw.FAN_SOURCE.major];
  ck("3a) 權重順序 practice < league < major（不驗絕對值）",
    p < l && l < m, `${p} < ${l} < ${m}`);

  //  端到端：同一場比賽，只換 origin，粉絲必須照順序增加
  const fansOf = (origin) => teamRewardsFor({
    win: true, marginF: 0.5, streak: 0, fansNow: START_FANS,
    fanSourceWeight: fsw.fanWeightForOrigin(origin),
  }).fans;
  const practice = fansOf({ kind: "ticket", competitionId: null });
  const league = fansOf({ kind: "fixture", competitionId: createCompetition({ gameMode: "cs", season: 1, tier: "regular" }).competition.id });
  const major = fansOf({ kind: "fixture", competitionId: createCompetition({ gameMode: "cs", season: 1, tier: "major" }).competition.id });
  ck("3b) 端到端：練習 < 聯賽 < Major（同一場比賽只換 origin）",
    practice < league && league < major, `${practice} < ${league} < ${major}`);

  ck("3c) 沒有 origin ⇒ 練習賽倍率（保守，不是當大賽算）",
    fsw.fanWeightForOrigin(null) === p && fsw.fanWeightForOrigin(undefined) === p);

  //  competition.id 的 tier 位置是本模組的推導依據 ⇒ 格式若改，這裡要紅
  const cid = createCompetition({ gameMode: "moba", season: 3, organizerId: "official", tier: "major" }).competition.id;
  ck("3d) `createCompetition` 的 id 仍以 tier 結尾（權重推導依賴這個慣例）",
    fsw.tierFromCompetitionId(cid) === "major", cid);

  //  championship 併進 major 桶（F1 不發明第四級）
  const champ = createCompetition({ gameMode: "moba", season: 1, tier: "championship" }).competition.id;
  ck("3e) championship 併進 major 桶，不另開第四級",
    fsw.fanSourceFromOrigin({ kind: "fixture", competitionId: champ }) === fsw.FAN_SOURCE.major);

  //  MOBA / CS 必須是同一支公式：同參數同來源 ⇒ 逐值相同
  const one = (mode) => teamRewardsFor({
    win: true, marginF: 0.5, streak: 2, fansNow: START_FANS,
    fanSourceWeight: fsw.fanWeightForOrigin({ kind: "fixture", competitionId: createCompetition({ gameMode: mode, season: 1, tier: "regular" }).competition.id }),
  }).fans;
  ck("3f) MOBA 與 CS 共用同一支粉絲公式（沒有第二套）",
    one("moba") === one("cs"), `${one("moba")} vs ${one("cs")}`);
}

// ══ §4 hard constraint：第二個可用 Sponsor 的 reqFans ≤ 起始 fans ═════════
{
  const ladder = [...SPONSORS].sort((a, b) => a.reqFans - b.reqFans);
  const second = ladder[1];
  ck("4) 🔒 第二個可用 Sponsor 的 reqFans ≤ 起始 fans（否則開局死亡螺旋）",
    !!second && second.reqFans <= START_FANS,
    `${second?.name} reqFans ${second?.reqFans?.toLocaleString()} ≤ 起始 ${START_FANS.toLocaleString()}`);

  //  這一條同時保護「開局有可維持財務的贊助」：第二階不能只是最低週收那一檔
  const lowest = ladder[0];
  ck("4b) 第二階的週收高於入門階（開局有真正的財務出路）",
    !!second && second.weekly > lowest.weekly, `${lowest.weekly}萬 → ${second.weekly}萬`);
}

// ══ §5 perk 不得被任何 gameplay / training / progression 邏輯讀取 ═════════
{
  const scanDirs = ["src/platform", "src/battle", "src/screens", "src/ui", "src/data"];
  const files = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name) && !/EsportsGame\.jsx|App\.jsx/.test(e.name)) files.push(p);
    }
  };
  scanDirs.forEach(walk);

  //  允許：畫面把 perk 字串印出來（F4 會移除文案，但那是 F4 的事）。
  //  禁止：任何**邏輯**讀它——尤其是 training / stats / progression 路徑。
  const LOGIC = /(training|applyCourse|calculateTrainingResult|stats|potential|xp|progress|reward|multiplier|bonus)/i;
  const offenders = [];
  for (const p of files) {
    const code = codeOnly(raw(p));
    if (!/\.perk\b|\bperk\s*:/.test(code)) continue;
    if (/screens\/manage\/SponsorScreen\.jsx$/.test(p)) continue;   // 純顯示，已知且允許
    if (/data\/playerModel\.js$|economy\/sponsors\.js$/.test(p)) continue; // 資料定義本身
    //  出現在含邏輯關鍵字的行 ⇒ 疑似被接進 gameplay
    for (const ln of code.split("\n")) {
      if (/\.perk\b/.test(ln) && LOGIC.test(ln)) { offenders.push(`${p}: ${ln.trim().slice(0, 60)}`); break; }
    }
  }
  ck("5) `SPONSORS[].perk` 沒有被任何 gameplay / training / progression 邏輯讀取（裁決 A）",
    offenders.length === 0, offenders.join(" | ") || `已掃 ${files.length} 檔，只有畫面在印`);
}

// ══ §6 reputation 不得重新成為新功能依賴 ═════════════════════════════════
{
  //  F0 已把它 deprecated：settlement 不寫、收據不帶、UI 不顯示。這裡防它復活。
  const apply = codeOnly(raw("src/platform/progress/applyMatchProgress.js"));
  ck("6a) settlement 的程式碼不再寫入 reputation",
    !/reputation/.test(apply), "applyMatchProgress");

  const fanFiles = [
    "src/platform/progress/fanSourceWeight.js",
    "src/platform/economy/sponsors.js",
  ];
  const revived = fanFiles.filter((p) => /reputation/i.test(codeOnly(raw(p))));
  ck("6b) F1 新增／改動的粉絲程式碼完全不碰 reputation",
    revived.length === 0, revived.join(", ") || "(乾淨)");

  //  Hype 不得以新欄位形式落盤（Fan Contract Addendum §2 C 層）
  const store = codeOnly(raw("src/platform/profileStore.js"));
  ck("6c) Store 沒有新增 hype / form 之類的永久聲望欄位",
    !/\bhype\b|\bformScore\b|\bpopularity\b/i.test(store), "profileStore");
}

// ══ §7 Sponsor eligibility 使用 canonical meta.fans ═══════════════════════
{
  const screen = codeOnly(raw("src/screens/manage/SponsorScreen.jsx"));
  ck("7a) SponsorScreen 的 fans 取自 meta.fans（不自算第二份粉絲數）",
    /meta\.fans/.test(screen), "meta.fans");

  //  資格函式本身只吃傳入的 fans，不從別處撈
  const sp = SPONSORS.find((s) => s.reqFans > 0);
  const low = sponsorEligibility(sp, { fans: sp.reqFans - 1, wins: 999 });
  const exact = sponsorEligibility(sp, { fans: sp.reqFans, wins: 999 });
  ck("7b) 資格判定以 fans 為準且邊界正確（>= 而不是 >）",
    low.ok === false && exact.ok === true && low.fansShort === 1,
    `差 1 ⇒ ${low.ok}／剛好 ⇒ ${exact.ok}`);

  ck("7c) reqWins 仍是獨立閘門（F1 未動）",
    sponsorEligibility(sp, { fans: 9_999_999, wins: 0 }).ok === false ||
    sp.reqWins === 0, `reqWins=${sp.reqWins}`);
}

// ══ §8 UI 不自己計算 Sponsor eligibility ═════════════════════════════════
{
  const screen = codeOnly(raw("src/screens/manage/SponsorScreen.jsx"));
  ck("8a) 畫面不自己比對 reqFans / reqWins（改用 sponsorEligibility）",
    !/>=\s*\w*\.?reqFans|reqFans\s*<=|>=\s*\w*\.?reqWins/.test(screen) &&
    /sponsorEligibility\s*\(/.test(screen),
    "SponsorScreen");

  const store = codeOnly(raw("src/platform/profileStore.js"));
  ck("8b) Store 的 signSponsor 也走同一支資格函式（規則只有一份）",
    /sponsorEligibility\s*\(/.test(store) && !/<\s*sp\.reqFans/.test(store),
    "profileStore.signSponsor");
}

// ══ §9 賽季獎勵：層級順序（冠軍 > Major 名次 > 一般名次）════════════════
const { seasonFanAwardOf, SEASON_FAN_AWARD } = await import(u("src/platform/economy/seasonFanAward.js"));
const { settleCompetitionAwardInState } = await import(u("src/platform/economy/competitionAward.js"));

/** 造一份最小但合法的 FinalStandings.v1（不經賽程產生器，測的是 award 本身）。 */
function mkFinal({ tier = "regular", rank = 1, teams = 8, champion = false, season = 1, mode = "moba" } = {}) {
  const rows = [];
  for (let i = 1; i <= teams; i++) {
    rows.push({ teamId: i === rank ? "t-me" : `t-ai${i}`, name: `T${i}`, rank: i,
                wins: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, diff: 0, played: 0 });
  }
  const competitionId = `comp:${mode}:s${season}:official:${tier}`;
  return {
    schema: "FinalStandings.v1",
    id: `final:${competitionId}`,
    competitionId, stageId: `stage:${competitionId}`, gameMode: mode, season,
    sealedAtDay: 84, rule: null, tiebreakers: [], rows, played: 0, sourceMix: null,
    playerTeamId: "t-me", playerRank: rank,
    rankSource: "regular",
    championTeamId: champion ? "t-me" : "t-ai1",
    playoffStageId: null, playerRegularRank: rank,
  };
}

{
  const leagueMid = seasonFanAwardOf(mkFinal({ tier: "regular", rank: 5 })).fans;
  const leagueTop = seasonFanAwardOf(mkFinal({ tier: "regular", rank: 1 })).fans;
  const majorTop = seasonFanAwardOf(mkFinal({ tier: "major", rank: 1 })).fans;
  const leagueChamp = seasonFanAwardOf(mkFinal({ tier: "regular", rank: 1, champion: true })).fans;
  const majorChamp = seasonFanAwardOf(mkFinal({ tier: "major", rank: 1, champion: true })).fans;

  ck("9a) 高名次 > 一般名次（同一層級內名次要有感）",
    leagueTop > leagueMid, `第 1 名 ${leagueTop} > 第 5 名 ${leagueMid}`);
  ck("9b) Major 名次 > 一般聯賽名次",
    majorTop > leagueTop, `Major ${majorTop} > 聯賽 ${leagueTop}`);
  ck("9c) 冠軍 > 同層級的純名次（冠軍要有跳升）",
    leagueChamp > leagueTop && majorChamp > majorTop,
    `聯賽 ${leagueTop}→${leagueChamp}／Major ${majorTop}→${majorChamp}`);
  ck("9d) 冠軍 > Major 名次 > 一般名次（三級全序）",
    leagueChamp > majorTop && majorTop > leagueMid,
    `${leagueMid} < ${majorTop} < ${leagueChamp}`);
  ck("9e) 名次表逐級遞減（不會出現「名次越差給越多」）", (() => {
    for (const t of Object.values(SEASON_FAN_AWARD)) {
      for (let i = 1; i < t.placement.length; i++) if (t.placement[i] > t.placement[i - 1]) return false;
    }
    return true;
  })());
  ck("9f) 玩家不在名次裡 ⇒ 不發（AI 專屬賽事）",
    seasonFanAwardOf({ ...mkFinal({}), playerTeamId: null, playerRank: null }).fans === 0);
  ck("9g) 一般名次不得壓過整季比賽的 fanGain（名次是點綴不是主餐）",
    leagueMid < 6000, `第 5 名 ${leagueMid} < 保守情境一季比賽 ~6,433`);
}

// ══ §10 MOBA / CS 共用同一支 award calculator ════════════════════════════
{
  const a = seasonFanAwardOf(mkFinal({ mode: "moba", tier: "regular", rank: 2, champion: true }));
  const b = seasonFanAwardOf(mkFinal({ mode: "cs", tier: "regular", rank: 2, champion: true }));
  ck("10a) 同名次同層級，MOBA 與 CS 逐值相同（沒有 CS 專用賽季粉絲邏輯）",
    a.fans === b.fans && a.tier === b.tier, `${a.fans} vs ${b.fans}`);

  const code = codeOnly(raw("src/platform/economy/seasonFanAward.js"));
  ck("10b) award calculator 不知道 CS 的地圖細節（不碰 map / series internals）",
    !/\bmap\b|series|scoreT|scoreCT|CS_MAPS/i.test(code));
  ck("10c) award calculator 是純函式（不 import Store / React / 亂數）",
    !/zustand|profileStore|react|Math\.random|Date\.now/i.test(code));
}

// ══ §11 賽季結算：冪等、單一帳本、只動粉絲不動戰力 ═══════════════════
{
  const base = {
    finance: { funds: 1_000_000, transactions: [] },
    meta: { fans: 128_000, days: 84 },
    processedCompetitionAwards: {},
  };
  const final = mkFinal({ tier: "regular", rank: 1, champion: true });
  const first = settleCompetitionAwardInState(base, { final, day: 84 });
  ck("11a) 賽季粉絲真的入帳",
    !!first.nextState && first.nextState.meta.fans === 128_000 + first.receipt.fans,
    `+${first.receipt.fans} ⇒ ${first.nextState?.meta?.fans}`);

  const after = { ...base, ...first.nextState };
  const second = settleCompetitionAwardInState(after, { final, day: 84 });
  ck("11b) 同一份 FinalStandings 重複結算不重複加粉絲",
    second.nextState === null && second.receipt.alreadySettled === true,
    `nextState=${second.nextState}`);

  //  reload：把狀態序列化再吃回來（模擬存檔往返），仍不得重發
  const reloaded = JSON.parse(JSON.stringify(after));
  const third = settleCompetitionAwardInState(reloaded, { final, day: 84 });
  ck("11c) reload（序列化往返）之後仍不重複發",
    third.nextState === null && third.receipt.alreadySettled === true);

  ck("11d) 冪等鍵仍是 FinalStandings.id，帳本仍是 processedCompetitionAwards",
    Object.keys(first.nextState.processedCompetitionAwards)[0] === final.id,
    Object.keys(first.nextState.processedCompetitionAwards).join(","));

  ck("11e) 賽季結算不碰選手、不碰戰力（nextState 只有 finance / meta / 帳本）",
    Object.keys(first.nextState).every((k) => ["finance", "meta", "processedCompetitionAwards"].includes(k)),
    Object.keys(first.nextState).join(","));

  const lastPlace = settleCompetitionAwardInState(
    { ...base, processedCompetitionAwards: {} },
    { final: mkFinal({ tier: "regular", rank: 8 }), day: 84 });
  ck("11f) 有名次就有粉絲（後段班也給下限，不是 0）",
    lastPlace.receipt.fans > 0, `第 8 名 ${lastPlace.receipt.fans}`);

  ck("11g) 粉絲不變成獎金：receipt 的 amount 與 fans 是兩個獨立欄位",
    typeof first.receipt.amount === "number" && typeof first.receipt.fans === "number"
    && first.receipt.amount !== first.receipt.fans);
}

// ══ §12 fans 寫入點仍只有兩個 ════════════════════════════════════════════
{
  const scan = ["src/platform", "src/battle", "src/screens", "src/ui", "src/data"];
  const files = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (/\.(js|jsx)$/.test(e.name) && !/EsportsGame\.jsx|App\.jsx/.test(e.name)) files.push(q);
    }
  };
  scan.forEach(walk);

  const flat = (q) => codeOnly(raw(q)).split("\n").join(" ");
  const writers = files.filter((q) => /meta\s*:\s*\{[^}]*\bfans\s*:/.test(flat(q)));

  //  ⚠ 「寫入」不等於「發放」。profileStore 有兩處合法的**非發放**寫入：
  //     · `DEFAULT.meta` 的種子值（宣告）
  //     · 載入路徑的 `sanitizeFans()`（F0 壞值清洗；只會讓數字變合法，不會變多）
  //    所以真正要守的是「沒有第三處會讓粉絲**增加**」，不是「沒有第三處提到 fans」。
  const AWARD_WRITERS = [
    "src/platform/progress/applyMatchProgress.js",   // ① 單場
    "src/platform/economy/competitionAward.js",      // ② 賽季名次
  ];
  const NON_AWARD_OK = ["src/platform/profileStore.js"];   // 種子 ＋ 清洗

  const extra = writers.filter((q) => !AWARD_WRITERS.includes(q) && !NON_AWARD_OK.includes(q));
  ck("12a) `meta.fans` 沒有第三處寫入點", extra.length === 0, extra.join(", ") || writers.join(" ＋ "));
  ck("12b) 兩個發放點都在（沒有被誤刪）",
    AWARD_WRITERS.every((q) => writers.includes(q)), writers.join(" ＋ "));

  //  發放 = 在既有值上做加法。這一條才是真正的「不得有第三個 fan write path」。
  const adders = files.filter((q) => /fansAfter|fansBefore\s*\+/.test(flat(q)));
  const extraAdders = adders.filter((q) => !AWARD_WRITERS.includes(q));
  ck("12b-2) 只有那兩個發放點會**增加**粉絲（第三條加法路徑會被抓到）",
    extraAdders.length === 0, extraAdders.join(", ") || adders.join(" ＋ "));

  //  profileStore 必須維持「非發放」性質
  ck("12b-3) profileStore 只有種子與清洗，沒有粉絲加法",
    !/fansAfter|fansBefore/.test(flat("src/platform/profileStore.js"))
    && /sanitizeFans/.test(flat("src/platform/profileStore.js")),
    "DEFAULT 種子 ＋ sanitizeFans");

  const screenWriters = files.filter((q) => /^src\/(screens|ui)\//.test(q))
    .filter((q) => /setState\s*\([^)]*fans|meta\.fans\s*=/.test(flat(q)));
  ck("12c) 畫面 / Recap 不寫 fans", screenWriters.length === 0, screenWriters.join(", ") || "(乾淨)");
}

// ══ §13 fansAtSeasonStart 快照 ═══════════════════════════════════════════
{
  const seasonSrc = codeOnly(raw("src/platform/competition/seasonState.js")).replace(/\n/g, " ");
  ck("13a) 快照建立在唯一的建季原語 `createSeasonState` 裡",
    /fansAtSeasonStart/.test(seasonSrc) && /createSeasonState\(\{[^)]*fansAtStart/.test(seasonSrc),
    "seasonState.js");
  ck("13b) `rollToNextSeason` 轉傳 ⇒ 換季會建立新快照",
    /rollToNextSeason\(\{[^)]*fansAtStart/.test(seasonSrc));

  const storeSrc = codeOnly(raw("src/platform/profileStore.js"));
  const wired = (storeSrc.match(/fansAtStart\s*:/g) ?? []).length;
  ck("13c) 四條建季／換季路徑都傳了快照（2 建季 ＋ 2 換季）",
    wired === 4, `${wired} 處`);

  ck("13d) 沒有另建 fan history log",
    !/fanHistory|fansLog|fanLedger/i.test(storeSrc) && !/fanHistory|fansLog|fanLedger/i.test(seasonSrc));

  const uiFiles = [];
  const walkUI = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walkUI(q);
      else if (/\.jsx?$/.test(e.name)) uiFiles.push(q);
    }
  };
  ["src/screens", "src/ui"].forEach(walkUI);
  const snapWriters = uiFiles.filter((q) => /fansAtSeasonStart\s*[:=]/.test(codeOnly(raw(q))));
  ck("13e) view / recap 不修改快照", snapWriters.length === 0, snapWriters.join(", ") || "(乾淨)");
}

// ── 輸出 ───────────────────────────────────────────────────────────────────
let pass = 0;
for (const [name, ok, detail] of A) {
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`);
}
console.log(`\n${pass}/${A.length} 通過`);
process.exit(pass === A.length ? 0 : 1);
