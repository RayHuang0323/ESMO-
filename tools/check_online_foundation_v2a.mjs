#!/usr/bin/env node
// ============================================================================
//  Online Foundation v2A — 驗證（Generic／MOBA contract only）
//
//  執行：`node tools/check_online_foundation_v2a.mjs`（純函式＋node:crypto，數秒）
//  先跑 `npm run build` 時，§S 另外掃 dist/ bundle；沒有 dist ⇒ 那幾條標 SKIP（不計入分母）。
//
//    A Competitive 仍 disabled、沒有 UI 入口
//    K BattleTalentBinding.v1：Talent ID 完整、與引擎同一支解析、只收選擇不收數值、CS 不猜
//    T OnlineMatchTicket.v1：伺服器簽發、客戶端只驗；偽造／竄改／過期／重放／缺天賦一律拒
//    R Match／Result authority：客戶端組不出 server 結果；裁決結果綁票券與天賦
//    S Signed snapshot 邊界：單一驗章路徑、src／bundle 沒有私鑰
//    B Supabase 下一階段：draft SQL 不在 migrations、Edge Function 只是 skeleton、未部署
//    X 邊界不退步：Career／ServerTime、Challenge／Replay 契約未動、沒碰任何 CS 檔
//
//  ⚠ 沒有 Supabase 憑證 ⇒ REMOTE_E2E_NOT_RUN。伺服器由 node:crypto 扮演，不是遠端 E2E。
// ============================================================================
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign as nodeSign, randomBytes } from "node:crypto";

let pass = 0, fail = 0, skip = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const sk = (label, why) => { skip++; console.log(`⏭  SKIP ${label}　${why}`); };
const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(url(p), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const sqlCode = (t) => t.replace(/--.*$/gm, "");
const errCodes = (r) => (r?.errors ?? []).map((e) => e.code);
const has = (r, c) => errCodes(r).includes(c);

const ON = await import("../src/platform/online/index.js");
const TB = await import("../src/platform/online/battleTalentBinding.js");
const TK = await import("../src/platform/online/matchTicket.js");
const AD = await import("../src/platform/online/matchAdjudication.js");
const SG = await import("../src/platform/online/signedSnapshot.js");
const GW = await import("../src/platform/online/rankedAuthorityGateway.js");
const ST = await import("../src/platform/online/serverTimeAuthority.js");
const HT = await import("../src/battle/moba/talents/heroBattleTalents.js");
const { CHAMPIONS_100 } = await import("../src/data/heroDatabase.js");
const CM = await import("../src/platform/competitive/competitiveMode.js");
const RB = await import("../src/platform/competitive/rosterBridge.js");
const SS = await import("../src/platform/contracts/squadSnapshot.js");
const SV = await import("../src/platform/contracts/simulationVersion.js");
const MR = await import("../src/platform/contracts/matchResult.js");
const SA = await import("../src/platform/challenge/snapshotAuthority.js");
const SC = await import("../src/platform/time/serverClock.js");
const { STAT_DEF } = await import("../src/data/playerModel.js");
const MOCK = await import("./lib/localRankedAuthority.mjs");

// ── 共用 fixture ───────────────────────────────────────────────────────────
const SEATS10 = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const PILOT = HT.BATTLE_TALENT_PILOT_HEROES;
const roster = Object.fromEntries(SEATS10.map((s, i) => [s, { hero: { id: PILOT[i] } }]));
const picks = { b1: HT.battleTalentOptions(PILOT[0])[1].id, b3: HT.battleTalentOptions(PILOT[2])[0].id };

const KEYS = STAT_DEF.map((s) => s.key);
const SNAP_SEATS = SS.SNAPSHOT_SEATS;
const careerState = {
  players: SNAP_SEATS.map((seat, i) => ({
    id: seat, name: `選手${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i], status: "主力", rosterTier: "active",
    stats: Object.fromEntries(KEYS.map((k, j) => [k, 60 + i + (j % 5)])), morale: 70, condition: "正常", energy: 100,
  })),
  lineup: Object.fromEntries(SNAP_SEATS.map((s) => [s, s])),
  heroProgress: Object.fromEntries(SNAP_SEATS.map((s, i) => [`hero_${s}`, { level: 3 + i }])),
  heroAssign: Object.fromEntries(SNAP_SEATS.map((s) => [s, `hero_${s}`])),
  team: { teamId: "team:alpha", teamName: "測試戰隊", tag: "TST" },
  careerDay: 10, lastPublishedCareerDay: null,
};
const built = RB.buildCompetitiveEntry({ request: { teamId: "team:alpha", tacticId: "m1" }, careerState, now: 1000, mode: "moba" });
const entry = built.entry;

//  扮演伺服器：node:crypto 的 Ed25519（私鑰只在這支 verifier 的記憶體裡）
const server = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const xOf = (kp) => kp.publicKey.export({ format: "jwk" }).x;
const trustedKeys = { "srv-1": { alg: "Ed25519", publicKeyJwkX: xOf(server) } };
const verify = SG.webCryptoEd25519Verifier(globalThis.crypto.subtle);
const signWith = (env, kp) => SG.attachSignature(env, nodeSign(null, Buffer.from(SG.signingBytes(env)), kp.privateKey).toString("base64"));
const b64url = (n) => randomBytes(n).toString("base64url");
const T0 = Date.UTC(2026, 9, 5, 3, 0, 0);

// ══════════════════════════════════════════════════════════════════════════
console.log("── A Competitive 仍 disabled ──");
{
  ck("A1 COMPETITIVE_ENABLED === false", CM.COMPETITIVE_ENABLED === false);
  const clock = SC.createServerClock({ kind: "test-server", now: () => T0 });
  const av = CM.competitiveAvailability({ mode: "moba", serverClock: clock, quotaState: null });
  //  ⚠ 必須證明時鐘**真的可用**，否則「進不去」可能只是因為沒有伺服器時間（這條曾經假綠）
  ck("A2 伺服器時間可用、配額未用，唯一的拒絕理由是 competitive_disabled", clock.available === true
    && av.serverDay === SC.serverDayOf(T0) && JSON.stringify(av.reasons.map((r) => r.code)) === JSON.stringify(["competitive_disabled"]),
    JSON.stringify(av.reasons.map((r) => r.code)));
  const screens = [];
  const walk = (d) => { for (const n of readdirSync(url(d))) { const p = `${d}/${n}`; if (statSync(url(p)).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(n)) screens.push(p); } };
  walk("src/screens"); walk("src/battle");
  for (const f of ["src/AppShell.jsx", "src/useLocalServer.js", "src/platform/profileStore.js"]) screens.push(f);
  const importers = screens.filter((f) => /platform\/online\/(matchTicket|matchAdjudication|battleTalentBinding|index)/.test(code(read(f))));
  ck("A3 沒有任何畫面／Store／戰鬥程式 import v2A 線上契約（沒有 Ranked UI 入口）", importers.length === 0, importers.join(", "));
  ck("A4 線上入口沒有任何「啟用」旗標或開關", !Object.keys(ON).some((k) => /enable|ENABLED/i.test(k)));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── K BattleTalentBinding.v1（MOBA）──");
const bound = TB.createBattleTalentBinding({ mode: "moba", roster, requested: picks });
const binding = bound.binding;
//  同一份名單、b1 改選另一個天賦（給 K16／T10／R12 用）
const other1 = TB.createBattleTalentBinding({ roster, requested: { ...picks, b1: HT.battleTalentOptions(PILOT[0])[0].id } }).binding;
{
  ck("K1 建立綁定", bound.ok && binding.schema === "BattleTalentBinding.v1", JSON.stringify(bound.errors));
  const engine = HT.selectBattleTalents(roster, picks);
  const sameAsEngine = SEATS10.every((s) => (engine.players[s]?.id ?? null) === (binding.seats[s]?.talentId ?? null));
  ck("K2 十個席位的 Talent ID 與引擎 selectBattleTalents 逐席位相同（同一支解析）", sameAsEngine && Object.keys(binding.seats).length === 10);
  ck("K3 玩家選的席位標 player，其餘由引擎 AI 決定性補位標 ai",
    binding.seats.b1.source === "player" && binding.seats.b3.source === "player"
    && ["b2", "b4", "b5", "r1", "r2", "r3", "r4", "r5"].every((s) => binding.seats[s].source === "ai"));
  ck("K4 talentSelectionsOf 回推出玩家原本的選擇", JSON.stringify(TB.talentSelectionsOf(binding)) === JSON.stringify(picks));
  ck("K5 綁定帶契約版本與模擬版本", binding.contract === HT.HERO_BATTLE_TALENT_CONTRACT && binding.simulationVersion === SV.MOBA_SIMULATION_VERSION);
  ck("K6 驗證通過（含以本場名單重算）", TB.validateBattleTalentBinding(binding, { roster }).ok);

  const wrongHero = TB.createBattleTalentBinding({ roster, requested: { b1: HT.battleTalentOptions(PILOT[1])[0].id } });
  const foreign = TB.createBattleTalentBinding({ roster, requested: { r1: HT.battleTalentOptions(PILOT[5])[0].id } });
  const numeric = TB.createBattleTalentBinding({ roster, requested: { b1: { id: picks.b1, multiplier: 2 } } });
  const unknown = TB.createBattleTalentBinding({ roster, requested: { b1: `${PILOT[0]}:made-up` } });
  ck("K7 天賦不屬於該席位英雄 ⇒ 拒（不替玩家改）", !wrongHero.ok && has(wrongHero, "talent_hero_mismatch"));
  ck("K8 替對方席位選天賦 ⇒ 拒", !foreign.ok && has(foreign, "foreign_seat"));
  ck("K9 送數值而不是 ID ⇒ 拒", !numeric.ok && has(numeric, "value_not_id"));
  ck("K10 未知天賦 ⇒ 拒", !unknown.ok && has(unknown, "unknown_talent"));
  const noRoster = TB.createBattleTalentBinding({ roster: null, requested: picks });
  ck("K11 選角前（沒有本場名單）不能綁定", !noRoster.ok && has(noRoster, "roster"));

  const tampered = JSON.parse(JSON.stringify(binding));
  tampered.seats.b1.talentId = HT.battleTalentOptions(PILOT[0])[0].id;
  ck("K12 改了 Talent ID 沒重算雜湊 ⇒ binding_hash", has(TB.validateBattleTalentBinding(tampered), "binding_hash"));
  const forged = { ...tampered, seats: { ...tampered.seats, b1: { ...tampered.seats.b1, talentId: HT.battleTalentOptions(PILOT[1])[0].id } } };
  forged.bindingHash = TB.talentBindingHashOf(forged);
  ck("K13 改成別隻英雄的天賦並重算雜湊 ⇒ 仍拒（talent_hero_mismatch）", has(TB.validateBattleTalentBinding(forged), "talent_hero_mismatch"));
  const leaky = JSON.parse(JSON.stringify(binding)); leaky.seats.b2.multiplier = 9; leaky.bindingHash = TB.talentBindingHashOf(leaky);
  ck("K14 席位夾帶數值欄位 ⇒ value_leak", has(TB.validateBattleTalentBinding(leaky), "value_leak"));
  const swapped = { ...roster, b2: { hero: { id: PILOT[3] } }, b4: { hero: { id: PILOT[1] } } };
  ck("K15 名單換了英雄 ⇒ 重算不一致（伺服器裁決前會抓到）", !TB.validateBattleTalentBinding(binding, { roster: swapped }).ok);
  ck("K16 換一個天賦 ⇒ bindingHash 改變", other1.bindingHash !== binding.bindingHash);

  const csB = TB.createBattleTalentBinding({ mode: "cs", roster, requested: picks });
  const csV = TB.validateBattleTalentBinding({ ...binding, mode: "cs" });
  ck("K17 CS ⇒ cs_talent_unsupported（不猜、不補資料）", !csB.ok && has(csB, "cs_talent_unsupported") && has(csV, "cs_talent_unsupported"));

  //  全 100 隻英雄 × 每個選項都能完整綁進契約，且雜湊互不相同
  const hashes = new Set(); let total = 0, okCount = 0;
  for (const hero of CHAMPIONS_100) {
    for (const opt of HT.battleTalentOptions(hero.id)) {
      total++;
      const r = { ...roster, b1: { hero: { id: hero.id } } };
      const b = TB.createBattleTalentBinding({ roster: r, requested: { b1: opt.id } });
      if (b.ok && b.binding.seats.b1.talentId === opt.id && b.binding.seats.b1.source === "player" && TB.validateBattleTalentBinding(b.binding, { roster: r }).ok) okCount++;
      hashes.add(b.binding?.bindingHash);
    }
  }
  ck("K18 100 隻英雄 × 全部天賦選項皆可綁定、驗證、重算一致", total === 200 && okCount === 200, `${okCount}/${total}`);
  ck("K19 200 個選擇的 bindingHash 互不相同", hashes.size === 200, `${hashes.size}`);
  const uls = code(read("src/useLocalServer.js"));
  ck("K20 引擎端仍只有 selectBattleTalents(opts.roster, opts.talentSelections) 一個解析點", /selectBattleTalents\(opts\.roster, opts\.talentSelections\)/.test(uls)
    && (uls.match(/selectBattleTalents\(/g) ?? []).length === 1);
  ck("K21 綁定模組沒有自己的天賦表（只讀 heroBattleTalents）", !/talent\(\s*['"]/.test(code(read("src/platform/online/battleTalentBinding.js"))));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── T OnlineMatchTicket.v1 ──");
const reqMade = TK.createTicketRequest({ mode: "moba", entry, battleTalents: binding });
const request = reqMade.request;
const issue = ({ req = request, nowMs = T0, ttlMs, kp = server, keyId = "srv-1", subject = "user-1", nonce = b64url(16) } = {}) => {
  const u = TK.createUnsignedTicket({
    request: req, ticketId: `tk_${b64url(12)}`, nonce, subject, serverDay: SC.serverDayOf(nowMs),
    issuedAtServerMs: nowMs, ttlMs, simulationVersion: SV.MOBA_SIMULATION_VERSION, issuedBy: "esmo.ranked-authority.test", keyId,
  });
  return u.ok ? signWith(u.ticket, kp) : u;
};
const ticket = issue();
{
  ck("T0 fixture：CompetitiveEntry 建立成功", built.ok, JSON.stringify(built.errors));
  ck("T1 客戶端請求單：只有 schema／mode／陣容雜湊／天賦綁定", reqMade.ok
    && JSON.stringify(Object.keys(request).sort()) === JSON.stringify(["battleTalents", "entry", "mode", "schema"]), JSON.stringify(reqMade.errors));
  ck("T2 請求單沒有任何伺服器欄位", TK.FORBIDDEN_TICKET_REQUEST_KEYS.every((k) => !JSON.stringify(request).includes(`"${k}"`)));
  const forgedKeys = ["ticketId", "nonce", "serverDay", "seed", "outcome", "winner", "signature", "careerDay", "subject"];
  const viaExtra = forgedKeys.filter((k) => TK.createTicketRequest({ entry, battleTalents: binding, extra: { [k]: 1 } }).ok);
  const viaInject = forgedKeys.filter((k) => TK.validateTicketRequest({ ...request, [k]: 1 }).ok);
  ck("T3 客戶端自帶 ticketId／nonce／serverDay／seed／勝負／簽章／生涯日 ⇒ 全部拒", viaExtra.length === 0 && viaInject.length === 0, JSON.stringify({ viaExtra, viaInject }));
  const noTalent = TK.createTicketRequest({ entry, battleTalents: null });
  ck("T4 沒有天賦綁定 ⇒ 拒（Ranked 必須帶 Talent ID）", !noTalent.ok && has(noTalent, "talents"));
  const cs = TK.createTicketRequest({ mode: "cs", entry, battleTalents: binding });
  ck("T5 CS 票券 ⇒ cs_ticket_deferred", !cs.ok && has(cs, "cs_ticket_deferred") && has(TK.validateTicketShape({ ...ticket, mode: "cs" }), "cs_ticket_deferred"));

  const v = await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: T0 + 1000, subject: "user-1" });
  ck("T6 伺服器簽發 → 客戶端驗票通過", v.ok, JSON.stringify(v.errors));
  ck("T7 票券完整帶本場 10 個 Talent ID（與綁定逐字相同）", JSON.stringify(ticket.battleTalents) === JSON.stringify(binding)
    && SEATS10.every((s) => ticket.battleTalents.seats[s].talentId === binding.seats[s].talentId));
  ck("T8 票券綁陣容（snapshotHash＋powerHash）與模擬版本", TK.ticketBindsEntry(ticket, entry) && ticket.simulationVersion === SV.MOBA_SIMULATION_VERSION);
  ck("T9 serverDay 來自伺服器時刻，不是生涯日", ticket.serverDay === SC.serverDayOf(T0) && !("careerDay" in ticket));

  const mut = (f) => { const t = JSON.parse(JSON.stringify(ticket)); f(t); return t; };
  const swapTalent = mut((t) => { t.battleTalents = other1; });
  const cases = {
    "換天賦（綁定本身合法、雜湊也重算）": swapTalent,
    "改 powerHash": mut((t) => { t.entry.powerHash = "deadbeef"; }),
    //  （超過 maxTtl 的延長會先被 ttl 形狀檢查擋下；這裡改在上限內，證明擋它的是簽章）
    "改效期（上限內）": mut((t) => { t.expiresAtServerMs -= 60_000; }),
    "換持有者": mut((t) => { t.subject = "user-2"; }),
    "換 nonce": mut((t) => { t.nonce = b64url(16); }),
  };
  const bad = [];
  for (const [name, t] of Object.entries(cases)) {
    const r = await TK.verifyMatchTicket(t, { trustedKeys, verify, serverNowMs: T0 + 1000 });
    if (r.ok || !has(r, "bad_signature")) bad.push(`${name}:${errCodes(r)}`);
  }
  ck("T10 簽發後竄改任何欄位（含天賦）⇒ bad_signature", bad.length === 0, bad.join(" | "));
  const unsignedT = mut((t) => { t.signature.value = null; });
  const noneAlg = mut((t) => { t.signature.alg = "none"; });
  const unknownKey = mut((t) => { t.signature.keyId = "srv-x"; });
  const otherKey = signWith(mut((t) => { t.signature.value = null; }), other);
  const r1 = await TK.verifyMatchTicket(unsignedT, { trustedKeys, verify, serverNowMs: T0 });
  const r2 = await TK.verifyMatchTicket(noneAlg, { trustedKeys, verify, serverNowMs: T0 });
  const r3 = await TK.verifyMatchTicket(unknownKey, { trustedKeys, verify, serverNowMs: T0 });
  const r4 = await TK.verifyMatchTicket(otherKey, { trustedKeys, verify, serverNowMs: T0 });
  const r5 = await TK.verifyMatchTicket(ticket, { trustedKeys, verify: null, serverNowMs: T0 });
  ck("T11 未簽／alg none／未知金鑰／別把私鑰簽／沒有 verifier ⇒ 全拒",
    has(r1, "unsigned") && has(r2, "signature") && has(r3, "untrusted_key") && has(r4, "bad_signature") && has(r5, "verifier"),
    JSON.stringify([r1, r2, r3, r4, r5].map(errCodes)));

  //  客戶端自己偽造一張：自己生 ticketId／nonce、沒有私鑰
  const fake = TK.createUnsignedTicket({ request, ticketId: `tk_${b64url(12)}`, nonce: b64url(16), subject: "user-1", serverDay: SC.serverDayOf(T0), issuedAtServerMs: T0, simulationVersion: SV.MOBA_SIMULATION_VERSION, issuedBy: "client", keyId: "srv-1" }).ticket;
  const fakeSigned = { ...fake, signature: { ...fake.signature, value: randomBytes(64).toString("base64") } };
  const f1 = await TK.verifyMatchTicket(fake, { trustedKeys, verify, serverNowMs: T0 });
  const f2 = await TK.verifyMatchTicket(fakeSigned, { trustedKeys, verify, serverNowMs: T0 });
  ck("T12 客戶端自建的票券（未簽或亂填簽章）⇒ 驗不過", !f1.ok && !f2.ok && has(f2, "bad_signature"));

  const ex = await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: ticket.expiresAtServerMs + 1 });
  const noTime = await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: null });
  const wrongUser = await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: T0, subject: "user-2" });
  const replay = await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: T0, seenNonces: new Set([ticket.nonce]) });
  ck("T13 過期 ⇒ expired", has(ex, "expired"));
  ck("T14 沒有伺服器時間 ⇒ server_time_unavailable（不退回裝置時間）", has(noTime, "server_time_unavailable"));
  ck("T15 非持有者 ⇒ subject_mismatch；nonce 重放 ⇒ replayed", has(wrongUser, "subject_mismatch") && has(replay, "replayed"));
  const shortNonce = issue({ nonce: "abc" });
  const longTtl = issue({ ttlMs: TK.TICKET_POLICY.maxTtlMs + 1 });
  ck("T16 nonce 太短、效期超過上限 ⇒ 伺服器端就組不出來", shortNonce.ok === false && has(shortNonce, "nonce") && longTtl.ok === false && has(longTtl, "ttl"));
  const unregistered = TK.validateTicketShape({ ...ticket, simulationVersion: "moba-sim.v999" });
  ck("T17 未登記的模擬版本 ⇒ 拒", has(unregistered, "simulation_version"));
  const verifyText = code(read("src/platform/online/matchTicket.js"));
  ck("T18 驗票不讀裝置時鐘", !/Date\.now\(|new Date\(|performance\.now\(/.test(verifyText));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── R Match／Result authority ──");
{
  const session = { schema: "MatchSession.v1", sessionId: "s1", mode: "moba", seed: 7, rosterVersions: { us: 1, opponent: 1 } };
  const outcome = { matchId: "m1", winner: "us", score: { us: 10, opponent: 3 }, durationSec: 1500 };
  const asServer = MR.createMatchResult({ session, outcome, source: MR.RESULT_SOURCES.server });
  ck("R1 客戶端呼叫 createMatchResult(source: server) ⇒ 拒（server_requires_adjudication）", !asServer.ok && has(asServer, "server_requires_adjudication"), JSON.stringify(errCodes(asServer)));
  const asEngine = MR.createMatchResult({ session, outcome });
  ck("R2 生涯路徑（engine）不受影響", asEngine.ok && asEngine.result.resultSource === "engine" && MR.validateMatchResult(asEngine.result, { session }).ok);
  const forgedServer = { ...asEngine.result, resultSource: "server" };
  ck("R3 把 engine 結果改標成 server ⇒ validateMatchResult 拒", !MR.validateMatchResult(forgedServer, { session }).ok
    && has(MR.validateMatchResult(forgedServer, { session }), "server_requires_adjudication"));
  ck("R4 client／manual 仍拒（O7 行為不變）", !MR.validateMatchResult({ ...asEngine.result, resultSource: "client" }, { session }).ok
    && !MR.createMatchResult({ session, outcome, source: "manual" }).ok);

  const defender = { snapshotHash: "a1b2c3d4", powerHash: "0f0f0f0f" };
  const inp = AD.createAdjudicationInputs({ ticket, defender, seed: 424243 });
  ck("R5 裁決輸入：綁票券、雙方陣容、本場天賦、伺服器 seed", inp.ok && inp.inputs.ticketId === ticket.ticketId
    && inp.inputs.attacker.battleTalentsHash === binding.bindingHash
    && SEATS10.every((s) => inp.inputs.attacker.battleTalents[s].talentId === binding.seats[s].talentId)
    && inp.inputs.defender.battleTalentPolicy === "engine-ai" && inp.inputs.seed === 424243, JSON.stringify(inp.errors));
  ck("R6 inputsHash 可重算；換 seed 或換天賦 ⇒ 雜湊不同", inp.inputs.inputsHash === AD.adjudicationInputsHashOf(inp.inputs)
    && AD.createAdjudicationInputs({ ticket, defender, seed: 1 }).inputs.inputsHash !== inp.inputs.inputsHash);
  ck("R7 沒有 seed（或客戶端想給非整數 seed）⇒ 拒", has(AD.createAdjudicationInputs({ ticket, defender }), "seed") && has(AD.createAdjudicationInputs({ ticket, defender, seed: "7" }), "seed"));

  const mkResult = (o = {}, inputs = inp.inputs, kp = server) => {
    const u = AD.createUnsignedAdjudication({ inputs, outcome: { winner: "attacker", score: { attacker: 12, defender: 5 }, durationSec: 1620, ...o }, battleResultVersion: "BattleResult.v3", adjudicatedAtServerMs: T0 + 1_800_000, issuedBy: "esmo.ranked-authority.test", keyId: "srv-1" });
    return u.ok ? signWith(u.result, kp) : u;
  };
  const res = mkResult();
  const rv = await AD.verifyAdjudicatedResult(res, { trustedKeys, verify, ticket });
  ck("R8 伺服器簽的裁決結果 → 客戶端驗證通過", rv.ok, JSON.stringify(rv.errors));
  ck("R9 結果的 ticketId 即冪等鍵；帶本場天賦雜湊", res.ticketId === ticket.ticketId && res.battleTalentsHash === binding.bindingHash && AD.SERVER_AUTHORITY_INTERFACE.idempotencyKey === "ticketId");
  const flip = { ...res, outcome: { ...res.outcome, winner: "defender" } };
  ck("R10 改勝負 ⇒ bad_signature", has(await AD.verifyAdjudicatedResult(flip, { trustedKeys, verify, ticket }), "bad_signature"));
  const otherTicket = issue();
  ck("R11 拿別張票的結果 ⇒ ticket_mismatch", has(await AD.verifyAdjudicatedResult(res, { trustedKeys, verify, ticket: otherTicket }), "ticket_mismatch"));
  const otherTalentTicket = issue({ req: TK.createTicketRequest({ entry, battleTalents: other1 }).request });
  const inp2 = AD.createAdjudicationInputs({ ticket: otherTalentTicket, defender, seed: 424243 }).inputs;
  const res2 = { ...mkResult({}, inp2), ticketId: ticket.ticketId };
  const res2Signed = signWith({ ...res2, signature: { ...res2.signature, value: null } }, server);
  ck("R12 伺服器結果用的天賦與票券不同 ⇒ talents_mismatch", has(await AD.verifyAdjudicatedResult(res2Signed, { trustedKeys, verify, ticket }), "talents_mismatch"));
  const noTicket = await AD.verifyAdjudicatedResult(res, { trustedKeys, verify, ticket: null });
  ck("R13 沒有票券 ⇒ 不承認結果", has(noTicket, "ticket"));
  const careerLeak = signWith({ ...res, xp: 40, standings: [], signature: { ...res.signature, value: null } }, server);
  ck("R14 結果夾帶生涯／賽季欄位（即使簽了）⇒ career_leak", has(await AD.verifyAdjudicatedResult(careerLeak, { trustedKeys, verify, ticket }), "career_leak"));
  const clientSigned = signWith({ ...res, signature: { ...res.signature, value: null } }, other);
  ck("R15 非伺服器金鑰簽的結果 ⇒ bad_signature", has(await AD.verifyAdjudicatedResult(clientSigned, { trustedKeys, verify, ticket }), "bad_signature"));
  ck("R16 結果簽章不涵蓋 replay（呈現層），結果裡沒有 replay 欄位", !("replay" in res) && !("frames" in res));
  ck("R17 ranked outcome 對應：attacker→win、defender→loss、draw→draw",
    AD.competitiveOutcomeOf(res) === "win" && AD.competitiveOutcomeOf(flip) === "loss" && AD.competitiveOutcomeOf({ outcome: { winner: "draw" } }) === "draw");

  const serverOnly = AD.SERVER_AUTHORITY_INTERFACE.serverOnly;
  ck("R18 所有 serverOnly 方法都在客戶端禁用清單", serverOnly.every((m) => GW.FORBIDDEN_CLIENT_METHODS.includes(m)), JSON.stringify(serverOnly));
  const leakyGw = Object.fromEntries([...GW.RANKED_GATEWAY_METHODS, "adjudicateMatch"].map((m) => [m, async () => null]));
  const gwr = GW.validateRankedGateway(leakyGw);
  ck("R19 客戶端閘道多一個 adjudicateMatch ⇒ write_surface", !gwr.ok && has(gwr, "write_surface"));
  ck("R20 客戶端閘道仍只有 4 個方法（v1 契約未擴張）", GW.RANKED_GATEWAY_METHODS.length === 4);
  ck("R21 seed 政策：伺服器在裁決時產生，客戶端沒有入口", AD.SERVER_AUTHORITY_INTERFACE.seedPolicy === "server-at-adjudication" && TK.FORBIDDEN_TICKET_REQUEST_KEYS.includes("seed"));

  //  mock authority（tools/lib）仍可用、仍標 untrusted
  const mock = MOCK.createLocalRankedAuthority({ serverNowMs: () => T0 });
  ck("R22 本機 mock authority 仍是 trusted:false，且 v2A 驗票不認它（沒有簽章）",
    mock.descriptor.trusted === false && !(await TK.verifyMatchTicket((await mock.client.requestRatedEntry({ mode: "moba", entryPowerHash: entry.powerHash })).ticket, { trustedKeys, verify, serverNowMs: T0 })).ok);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── S Signed snapshot／authority 邊界 ──");
{
  const onlineFiles = readdirSync(url("src/platform/online")).filter((f) => f.endsWith(".js")).map((f) => `src/platform/online/${f}`);
  const onlineSrc = onlineFiles.map((f) => code(read(f))).join("\n");
  ck("S1 src/platform/online 沒有私鑰、沒有簽章函式", !/PRIVATE KEY|privateKey|\.sign\(|subtle\.sign|generateKey/.test(onlineSrc), onlineFiles.join(","));
  ck("S2 驗章只有一個實作（signedSnapshot.verifyEnvelopeSignature），票券與裁決都 import 它",
    (onlineSrc.match(/function verifyEnvelopeSignature/g) ?? []).length === 1
    && /import \{[^}]*verifyEnvelopeSignature[^}]*\} from "\.\/signedSnapshot\.js"/.test(read("src/platform/online/matchTicket.js"))
    && /import \{[^}]*verifyEnvelopeSignature[^}]*\} from "\.\/signedSnapshot\.js"/.test(read("src/platform/online/matchAdjudication.js"))
    && (onlineSrc.match(/importKey\(/g) ?? []).length === 1);

  //  同一份信任金鑰表同時驗快照與票券
  const env = SG.createUnsignedEnvelope({ snapshot: entry.snapshot, issuedBy: "esmo.ranked-authority.test", issuedAtServerMs: T0, keyId: "srv-1" }).envelope;
  const signedEnv = signWith(env, server);
  const sv = await SG.verifySignedSnapshot(signedEnv, { trustedKeys, verify });
  const tamperedEnv = JSON.parse(JSON.stringify(signedEnv)); tamperedEnv.issuedAtServerMs += 1;
  ck("S3 SignedSquadSnapshot.v1 端到端仍通過、竄改仍拒（重構後行為不變）", sv.ok && has(await SG.verifySignedSnapshot(tamperedEnv, { trustedKeys, verify }), "bad_signature"));
  ck("S4 快照與票券用同一份 trustedKeys／同一個 verifier", sv.ok && (await TK.verifyMatchTicket(ticket, { trustedKeys, verify, serverNowMs: T0 })).ok);
  ck("S5 本機快照權威仍標 untrusted；LOCAL_UNSIGNED 沒有演算法", SA.SNAPSHOT_AUTHORITY.trusted === false && SG.LOCAL_UNSIGNED.alg === null && SG.LOCAL_UNSIGNED.trusted === false);

  //  整個 src/ 與 supabase/ 不得有私鑰材料（PEM、JWK 的 d 參數、JWT）
  const all = [];
  const walk = (d) => { for (const n of readdirSync(url(d))) { const p = `${d}/${n}`; const s = statSync(url(p)); if (s.isDirectory()) walk(p); else if (/\.(jsx?|mjs|ts|sql|json)$/.test(n) && s.size < 2_000_000) all.push(p); } };
  walk("src"); walk("supabase");
  const material = all.filter((f) => { const t = read(f); return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t) || /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/.test(t) || /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(t); });
  ck("S6 src／supabase 沒有任何私鑰材料或 JWT", material.length === 0, material.join(", "));

  if (existsSync(url("dist"))) {
    const js = [];
    const walkD = (d) => { for (const n of readdirSync(url(d))) { const p = `${d}/${n}`; if (statSync(url(p)).isDirectory()) walkD(p); else if (n.endsWith(".js")) js.push(p); } };
    walkD("dist");
    const bundle = js.map((f) => read(f)).join("\n");
    ck("S7 dist bundle 沒有私鑰材料、沒有簽章私鑰的環境變數名、沒有 subtle.sign",
      !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(bundle) && !/ESMO_SIGNING_KEY_JWK/.test(bundle) && !/subtle\.sign\(/.test(bundle), `${js.length} 個 js`);
    ck("S8 dist bundle 沒有 Edge Function skeleton 的內容", !/ranked-authority is a skeleton/.test(bundle));
  } else {
    sk("S7 dist bundle 掃描", "沒有 dist/（先跑 npm run build）");
    sk("S8 dist bundle 掃描", "沒有 dist/");
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── B Supabase 下一階段（設計＋skeleton，未部署）──");
{
  const migs = readdirSync(url("supabase/migrations")).sort();
  ck("B1 migrations/ 仍只有 0001、0002（v2A 沒有正式 migration）", JSON.stringify(migs) === JSON.stringify(["0001_career_saves.sql", "0002_ranked_authority.sql"]), JSON.stringify(migs));
  const draftPath = "supabase/drafts/0003_online_match_authority.draft.sql";
  ck("B2 0003 只以 draft 存在，且副檔名不是 .sql 結尾的 migration 位置", existsSync(url(draftPath)) && !existsSync(url("supabase/migrations/0003_online_match_authority.sql")));
  const d = sqlCode(read(draftPath));
  ck("B3 draft：沒有任何客戶端寫入 policy", !/for\s+(insert|update|delete|all)\s/i.test(d));
  ck("B4 draft：新表 force RLS、先收回權限再只給 select", (d.match(/force row level security/g) ?? []).length === 2
    && /revoke all on public\.match_adjudications\s+from anon, authenticated/.test(d) && /revoke all on public\.signing_keys\s+from anon, authenticated/.test(d)
    && !/grant\s+(insert|update|delete|all)/i.test(d));
  ck("B5 draft：票券存天賦全文與雜湊；nonce 唯一（防重放的權威在 DB）", /battle_talents_json\s+jsonb/.test(d) && /battle_talents_hash\s+text/.test(d) && /unique index if not exists ranked_tickets_nonce_uidx/.test(d));
  ck("B6 draft：資料庫只存公鑰，沒有私鑰欄位", /public_jwk_x/.test(d) && !/private|secret/i.test(d));
  const fn = read("supabase/functions/ranked-authority/index.ts");
  const fnCode = code(fn);
  ck("B7 Edge Function skeleton：所有路由回 501，標 REMOTE_E2E_NOT_RUN", (fnCode.match(/json\(501, NOT_IMPLEMENTED\)/g) ?? []).length === 2 && /REMOTE_E2E_NOT_RUN/.test(fnCode)
    && !/createClient|from\(["']|\.rpc\(/.test(fnCode));
  ck("B8 skeleton 不含金鑰值（只在註解列出環境變數名）", !/Deno\.env\.get/.test(fnCode) && !/eyJ|BEGIN [A-Z ]*PRIVATE/.test(fn));
  const wf = read(".github/workflows/deploy.yml");
  ck("B9 deploy.yml 沒有部署 Edge Function、沒有 db push", !/functions\s+deploy|db\s+push|supabase\s+link/.test(wf));
  const srcAll = all_src_imports();
  ck("B10 src/ 沒有 import supabase/functions 或 drafts", !srcAll.some((t) => /supabase\/(functions|drafts)/.test(t)));
  ck("B11 REMOTE_E2E_NOT_RUN：遠端 E2E 沒有憑證就 SKIP 的 gate 仍在、沒有被 mock 取代", existsSync(url("tools/check_supabase_remote_e2e.mjs"))
    && !/localRankedAuthority/.test(read("tools/check_supabase_remote_e2e.mjs")));
}
function all_src_imports() {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(url(d))) { const p = `${d}/${n}`; const s = statSync(url(p)); if (s.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(n) && s.size < 2_000_000) out.push((read(p).match(/import[^;]*?from\s*["'][^"']+["']/g) ?? []).join("\n")); } };
  walk("src");
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── X 邊界不退步 ──");
{
  ck("X1 票券沒有生涯欄位、沒有賽季帳本欄位", CM.findCareerWriteKeys(ticket).length === 0 && CM.findSeasonLedgerKeys(ticket).length === 0,
    JSON.stringify([...CM.findCareerWriteKeys(ticket), ...CM.findSeasonLedgerKeys(ticket)]));
  const unsynced = ST.createSyncedServerClock?.();
  ck("X2 沒有同步樣本時伺服器時鐘不可用（不退回裝置時間）", !unsynced || unsynced.available === false || unsynced.now?.() === null);
  ck("X3 CS 出賽單仍 deferred（v2A 沒有替 CS 補任何推導）", !RB.buildCompetitiveEntry({ request: { teamId: "team:alpha", tacticId: "m1" }, careerState, now: 1000, mode: "cs" }).ok);
  ck("X4 SquadSnapshot 沒加天賦欄位（Challenge 快照雜湊不變）", !JSON.stringify(entry.snapshot).includes("battleTalent") && entry.snapshot.schema === "SquadSnapshot.v1");

  let diff = [];
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: new URL("..", import.meta.url), encoding: "utf8" }).trim();
    const committed = execFileSync("git", ["diff", "--name-only", base], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    diff = [...committed.split("\n"), ...untracked.split("\n")].map((s) => s.trim()).filter(Boolean);
  } catch (e) { diff = null; }
  if (diff === null) { sk("X5–X7 改動範圍", "git 不可用"); }
  else {
    const csHit = diff.filter((f) => /src\/battle\/fps\/|fpsRoster|CsMatch|csSquad|\/fps\/|tools\/check_cs|tools\/browser_check_cs|cs_tactic|csTactic|CS_FPS/i.test(f));
    ck("X5 沒有碰任何 CS／FPS 檔（程式、tactics、renderer、fpsRoster、simulation、verifier）", csHit.length === 0, csHit.join(", "));
    const frozen = ["src/platform/contracts/squadSnapshot.js", "src/platform/challenge/snapshotAuthority.js", "src/platform/contracts/mobaReplay.js",
      "src/platform/contracts/matchSession.js", "src/battle/moba/replay/replayBuffer.js", "src/battle/moba/talents/heroBattleTalents.js",
      "src/LogicEngine.js", "src/useLocalServer.js", "src/platform/profileStore.js", "src/platform/contracts/simulationVersion.js"];
    const touched = frozen.filter((f) => diff.includes(f));
    ck("X6 Challenge／Replay／Session／天賦／引擎／Store 檔案未動", touched.length === 0, touched.join(", "));
    const codexShared = ["AGENTS.md", "tools/verify.mjs"].concat(diff.filter((f) => /^docs\/handoff\//.test(f)));
    const sharedHit = codexShared.filter((f) => diff.includes(f));
    ck("X7 沒有動 Codex 同時在改的共用檔（AGENTS.md、tools/verify.mjs、docs/handoff/*）", sharedHit.length === 0, sharedHit.join(", "));
  }
}

const denom = pass + fail;
console.log(`\nREMOTE_E2E_NOT_RUN（沒有 Supabase 憑證；伺服器由 node:crypto 扮演）`);
console.log(`Online Foundation v2A：${pass}/${denom} PASS${skip ? `（另 ${skip} SKIP，不計入）` : ""}`);
process.exit(fail ? 1 : 0);
