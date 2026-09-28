#!/usr/bin/env node
// ============================================================================
//  Online Foundation v1 — 驗證
//
//  執行：`node tools/check_online_foundation_v1.mjs`（純函式＋node:crypto，約 1–3 秒）
//
//  守四件事（對應 docs/design/Online_Foundation_v1.md）：
//    T 權威 ServerTime：同步取樣（NTP 中點）、單調時鐘、RTT／過期即 unavailable、
//      伺服器日不倒退、**不讀裝置時間**、客戶端時間只是參考
//    P Ranked record / quota 的後端持久化邊界：客戶端閘道**沒有寫入面**、
//      SQL migration 的 RLS 只准讀自己、寫入只給伺服器、`server_time()` 用 DB now()
//    S 伺服器簽章快照：Ed25519 端到端、竄改／未知金鑰／alg none 一律拒、
//      客戶端原始碼沒有私鑰
//    C CS 快照 parity：與 MOBA 同一份信封／正規化／簽章；**涵蓋 CS 引擎實際讀的每一個欄位**，
//      正規化值對 CS 引擎是中性的
//  ＋ X 邊界不回退：CareerTime／ServerTime 分離、ranked 不寫生涯與賽季
//
//  ⚠ 本檔**不驗**配對、即時 PvP、排行榜、Live Tournament、CBR 數值 —— 本輪不做。
//  ⚠ 沒有 Supabase 憑證 ⇒ 遠端 E2E 從未跑過（REMOTE_E2E_NOT_RUN），這裡只驗邊界形狀。
// ============================================================================
import fs from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(url(p), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const sqlCode = (t) => t.replace(/--.*$/gm, "");

const FILES = [
  "src/platform/online/serverTimeAuthority.js",
  "src/platform/online/rankedAuthorityGateway.js",
  "src/platform/online/signedSnapshot.js",
  "src/platform/online/index.js",
  "supabase/migrations/0002_ranked_authority.sql",
];
console.log("── 0 檔案 ──");
for (const f of FILES) ck(`${f} 存在`, existsSync(url(f)));
if (FILES.some((f) => !existsSync(url(f)))) {
  console.log(`\nOnline Foundation v1：${pass}/${pass + fail} PASS（缺檔，後續各節無法執行）`);
  process.exit(1);
}

const ST = await import("../src/platform/online/serverTimeAuthority.js");
const GW = await import("../src/platform/online/rankedAuthorityGateway.js");
//  Online Backend Foundation v1：mock authority 已移出 src/（只在 tools/lib，不進正式 bundle）
const MOCK = await import("./lib/localRankedAuthority.mjs");
const SV = await import("../src/platform/contracts/simulationVersion.js");
const MS = await import("../src/platform/progress/matchSource.js");
const RF = await import("../src/platform/progress/rewardFormulas.js");
const SG = await import("../src/platform/online/signedSnapshot.js");
const OI = await import("../src/platform/online/index.js");
const SC = await import("../src/platform/time/serverClock.js");
const RQ = await import("../src/platform/competitive/ratedQuota.js");
const CR = await import("../src/platform/competitive/competitiveRecord.js");
const RB = await import("../src/platform/competitive/rosterBridge.js");
const SS = await import("../src/platform/contracts/squadSnapshot.js");
const FR = await import("../src/battle/fps/fpsRoster.js");
const P = await import("../src/platform/progress/applyMatchProgress.js");
const TX = await import("../src/platform/contracts/matchProgressTransaction.js");
const SB = await import("../src/platform/persistence/saveBundle.js");
const { STAT_DEF } = await import("../src/data/playerModel.js");
const LG = await import("../src/platform/progress/learningGrowth.js");

const ONLINE_SRC = FILES.filter((f) => f.endsWith(".js")).map((f) => code(read(f))).join("\n");
const DAY = 86400000;
const T0 = Date.UTC(2026, 8, 22, 23, 59, 0);   // 固定：伺服器日邊界前 1 分鐘

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── T 權威 ServerTime ──");
{
  ck("T1 契約版本", ST.SERVER_TIME_SAMPLE_VERSION === "ServerTimeSample.v1");
  //  單調時鐘：測試注入（瀏覽器端是 performance.now）
  let mono = 1000;
  const monotonicNow = () => mono;
  const sample = ST.createServerTimeSample({ serverEpochMs: T0, sentAtMono: 900, receivedAtMono: 1000, issuedBy: "db:now()" });
  ck("T2 取樣合法", sample.ok, JSON.stringify(sample.errors));
  const synced = ST.createSyncedServerClock({ sample: sample.sample, monotonicNow });
  ck("T3 同步時鐘可用，形狀相容 serverClock provider", synced.available && typeof synced.provider.now === "function"
    && SC.createServerClock(synced.provider).available);
  ck("T4 NTP 中點：伺服器時刻 + 半個 RTT", synced.provider.now() === T0 + 50, `now=${synced.provider.now() - T0}`);
  mono += 60_000;
  const clock = SC.createServerClock(synced.provider);
  ck("T5 以單調時鐘前進（+60s 跨過伺服器日邊界）", clock.serverDay() === SC.serverDayOf(T0) + 1);
  ck("T6 RTT 過大 ⇒ 取樣拒收（不可信的量測）",
    !ST.createServerTimeSample({ serverEpochMs: T0, sentAtMono: 0, receivedAtMono: ST.SERVER_TIME_POLICY.maxRttMs + 1, issuedBy: "db:now()" }).ok);
  ck("T7 缺 issuedBy ⇒ 拒收", !ST.createServerTimeSample({ serverEpochMs: T0, sentAtMono: 0, receivedAtMono: 10 }).ok);
  ck("T8 receivedAt < sentAt ⇒ 拒收", !ST.createServerTimeSample({ serverEpochMs: T0, sentAtMono: 10, receivedAtMono: 5, issuedBy: "x" }).ok);
  //  過期：超過 maxAgeMs 沒重新同步 ⇒ unavailable（而不是繼續外推）
  mono = 1000 + ST.SERVER_TIME_POLICY.maxAgeMs + 1;
  ck("T9 同步過期 ⇒ now() 為 null（入口自動關）", synced.provider.now() === null && clock.serverDay() === null);
  ck("T10 單調時鐘倒退 ⇒ null（不信任）", (() => {
    let m = 500; const s = ST.createSyncedServerClock({ sample: sample.sample, monotonicNow: () => m });
    return s.provider.now() === null;
  })());
  //  伺服器日不倒退：重新同步到較早的時間，不得讓 serverDay 變小（否則能重置配額）
  const g = ST.createServerDayGuard();
  ck("T11 伺服器日守衛：前進可以", g.observe(100) === 100 && g.observe(101) === 101);
  ck("T12 伺服器日守衛：倒退被夾住（配額不可因重新同步而重置）", g.observe(99) === 101 && g.rejectedRegressions === 1);
  ck("T13 線上模組**不讀裝置時間**（無 Date.now / new Date()）", !/Date\.now|new Date\(\s*\)/.test(ONLINE_SRC));
  ck("T14 線上模組不讀生涯時鐘", !/worldClock|meta\.days|advanceDay|careerYearOf/.test(ONLINE_SRC));
  ck("T15 權威宣告：客戶端同步時鐘只是參考，寫入時由伺服器重驗",
    ST.SERVER_TIME_POLICY.clientClockIsAdvisory === true && ST.SERVER_TIME_POLICY.authoritativeCheck === "server-side-at-write");
  ck("T16 未同步 ⇒ unavailable", ST.createSyncedServerClock({ sample: null, monotonicNow }).available === false);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── P Ranked 後端持久化邊界 ──");
{
  ck("P1 閘道契約版本", GW.RANKED_GATEWAY_VERSION === "RankedAuthorityGateway.v1");
  ck("P2 客戶端閘道只有讀取與請求（沒有任何直接寫入方法）",
    JSON.stringify([...GW.RANKED_GATEWAY_METHODS].sort()) === JSON.stringify(["getQuota", "getRecord", "getServerTimeSample", "requestRatedEntry"]));
  ck("P3 禁止的寫入方法名清單涵蓋 setRecord/applyResult/writeQuota/submitResult",
    ["setRecord", "applyResult", "writeQuota", "submitResult", "resetQuota"].every((m) => GW.FORBIDDEN_CLIENT_METHODS.includes(m)));
  const bad = GW.validateRankedGateway({ getServerTimeSample() {}, getRecord() {}, getQuota() {}, requestRatedEntry() {}, setRecord() {} });
  ck("P4 帶寫入方法的閘道被拒", !bad.ok && bad.errors.some((e) => e.code === "write_surface"));
  ck("P5 缺方法的閘道被拒", !GW.validateRankedGateway({ getRecord() {} }).ok);

  //  本機 mock authority：用伺服器側純函式實作，trusted:false
  let mono = 0;
  const auth = MOCK.createLocalRankedAuthority({ serverNowMs: () => T0 + mono });
  ck("P6 本機 authority 標記 untrusted", auth.descriptor.trusted === false && auth.descriptor.kind === "mock-authority");
  const client = auth.client;
  ck("P7 本機 authority 的 client 通過閘道契約", GW.validateRankedGateway(client).ok);
  const q0 = await client.getQuota("moba");
  ck("P8 讀取配額（伺服器日由 authority 決定）", q0.ok && q0.quota.remaining === RQ.RATED_QUOTA.ratedPerServerDay
    && q0.quota.serverDay === SC.serverDayOf(T0));
  const tickets = [];
  for (let i = 0; i < 4; i++) tickets.push(await client.requestRatedEntry({ mode: "moba", entryPowerHash: `h${i}` }));
  ck("P9 前三次請求成功、第四次被 authority 拒絕", tickets.slice(0, 3).every((t) => t.ok) && !tickets[3].ok
    && tickets[3].error?.code === "rated_quota_exhausted");
  ck("P10 票券由 authority 簽發（含伺服器日，不含生涯時間）",
    tickets[0].ticket.serverDay === SC.serverDayOf(T0) && SC.findCareerTimeKeys(tickets[0].ticket).length === 0);
  ck("P11 MOBA 用完不影響 CS", (await client.getQuota("cs")).quota.remaining === 3);
  //  結果只能由 authority 自己寫（server 端函式），客戶端 API 沒有這個入口
  ck("P12 client 物件上沒有 applyResult／setRecord", !("applyResult" in client) && !("setRecord" in client));
  const settled = auth.server.settleRatedMatch({ ticketId: tickets[0].ticket.ticketId, outcome: "win",
    opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, bracketId: "open" });
  ck("P13 authority 結算已簽發票券", settled.ok && (await client.getRecord("moba")).record.wins === 1, JSON.stringify(settled.errors));
  ck("P14 同一張票券不能結算兩次", !auth.server.settleRatedMatch({ ticketId: tickets[0].ticket.ticketId, outcome: "win",
    opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, bracketId: "open" }).ok);
  ck("P15 未簽發的票券不能結算", !auth.server.settleRatedMatch({ ticketId: "forged", outcome: "win",
    opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, bracketId: "open" }).ok);
  mono = DAY;
  ck("P16 authority 換日後配額恢復（只由伺服器日重置）", (await client.getQuota("moba")).quota.remaining === 3);
  const rec = (await client.getRecord("moba")).record;
  ck("P17 讀回的紀錄是副本（改它不影響 authority）", (() => { rec.wins = 99; return true; })()
    && true);
  ck("P17b …authority 內部仍是 1 勝", (await client.getRecord("moba")).record.wins === 1);

  //  SQL 邊界
  const sql = read("supabase/migrations/0002_ranked_authority.sql");
  const s = sqlCode(sql).toLowerCase();
  const tables = ["ranked_records", "ranked_quota", "ranked_tickets", "signed_snapshots"];
  for (const t of tables) {
    ck(`P18 ${t}：建立且啟用 RLS`, s.includes(`create table if not exists public.${t}`)
      && s.includes(`alter table public.${t} enable row level security`));
  }
  ck("P19 沒有任何給 anon/authenticated 的 insert/update/delete policy（客戶端無寫入面）",
    !/create policy[\s\S]*?for\s+(insert|update|delete|all)/.test(s), (s.match(/for\s+(insert|update|delete|all)/g) || []).join(","));
  ck("P20 讀取 policy 只准讀自己（auth.uid() = user_id）",
    (s.match(/for select[\s\S]*?using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/g) || []).length >= 3);
  ck("P21 server_time() 由資料庫 now() 提供", /function public\.server_time\(\)[\s\S]*?now\(\)/.test(s));
  ck("P22 server_time() 開放給 anon/authenticated 呼叫（唯讀）",
    /grant execute on function public\.server_time\(\) to anon, authenticated/.test(s));
  //  Online Backend Foundation v1：server_day() 與 server_time() 同為唯讀時間函式（audit 缺口：原本沒有 grant）。
  //  白名單只放這兩支，且兩支都必須是 `stable` 的純 select SQL ⇒ 仍然沒有任何寫入函式開放給客戶端。
  const readOnlyTimeFns = ["server_time", "server_day"].every((fn) =>
    new RegExp(`create or replace function public\\.${fn}\\(\\)[\\s\\S]*?language sql\\s+stable[\\s\\S]*?as \\$\\$\\s*select [^;]+;\\s*\\$\\$`).test(s));
  ck("P23 沒有 security definer 的寫入函式開放給客戶端（只開放唯讀時間函式 server_time／server_day）",
    readOnlyTimeFns && !/grant execute on function public\.(?!server_time\(|server_day\()[a-z_]+\([^)]*\) to [^;]*(anon|authenticated)/.test(s));
  ck("P24 migration 不含 service_role 金鑰或 JWT", !/eyj[a-z0-9_-]{10,}\./i.test(sql));
  ck("P25 伺服器日換日時刻與 serverClock 一致（UTC 0 點）",
    SC.SERVER_DAY.resetUtcHour === 0 && /at time zone 'utc'/.test(s));

  //  生涯存檔不承擔 ranked 帳本
  const allKeys = [...SB.CLOUD_PROFILE_KEYS, ...SB.LOCAL_PROFILE_KEYS, ...SB.TRANSIENT_KEYS].join(",");
  ck("P26 SaveBundle 三份清單都沒有 ranked／competitive 帳本", !/ranked|competitiveRecord|ladder|ratedQuota/i.test(allKeys));
  ck("P27 authority 的伺服器側不讀裝置時間（時間由注入的伺服器時刻提供）",
    !/Date\.now/.test(code(read("src/platform/online/rankedAuthorityGateway.js"))));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── S 伺服器簽章快照 ──");
{
  ck("S1 契約版本", SG.SIGNED_SNAPSHOT_VERSION === "SignedSquadSnapshot.v1");
  ck("S2 只允許 Ed25519", JSON.stringify(SG.SIGNATURE_ALGS) === JSON.stringify(["Ed25519"]));
  //  測試扮演伺服器：node:crypto 產生金鑰並簽章（src/ 裡不得有任何私鑰或簽章程式）
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubRaw = publicKey.export({ format: "jwk" }).x;
  const trustedKeys = { "esmo-server-2026-09": { alg: "Ed25519", publicKeyJwkX: pubRaw } };

  const KEYS = STAT_DEF.map((x) => x.key);
  const players = SS.SNAPSHOT_SEATS.map((seat, i) => ({ id: seat, name: `P${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i],
    status: "主力", rosterTier: "active", stats: Object.fromEntries(KEYS.map((k, j) => [k, 60 + i + (j % 5)])), morale: 12, condition: "疲勞", energy: 3 }));
  const careerState = {
    players, lineup: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s) => [s, s])),
    heroProgress: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s, i) => [`hero_${s}`, { level: 3 + i }])),
    heroAssign: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s) => [s, `hero_${s}`])),
    team: { teamId: "team:alpha", teamName: "A", tag: "A" }, careerDay: 5,
  };
  const entry = RB.buildCompetitiveEntry({ request: { teamId: "team:alpha", tacticId: "m1" }, careerState, now: 1, mode: "moba" }).entry;
  const env = SG.createUnsignedEnvelope({ snapshot: entry.snapshot, issuedBy: "esmo-server", issuedAtServerMs: T0, keyId: "esmo-server-2026-09" });
  ck("S3 信封建立", env.ok, JSON.stringify(env.errors));
  const bytes = SG.signingBytes(env.envelope);
  ck("S4 簽章位元組是決定性的（同信封同位元組）", Buffer.from(bytes).equals(Buffer.from(SG.signingBytes(JSON.parse(JSON.stringify(env.envelope))))));
  const sigB64 = nodeSign(null, Buffer.from(bytes), privateKey).toString("base64");
  const signed = SG.attachSignature(env.envelope, sigB64);
  const verify = SG.webCryptoEd25519Verifier(globalThis.crypto?.subtle);
  const ok = await SG.verifySignedSnapshot(signed, { trustedKeys, verify });
  ck("S5 端到端：伺服器簽、客戶端用公鑰驗，通過", ok.ok, JSON.stringify(ok.errors));
  const tampered = JSON.parse(JSON.stringify(signed)); tampered.payload.combat.stats.b1.reflex += 1;
  ck("S6 竄改能力值 ⇒ 拒絕", !(await SG.verifySignedSnapshot(tampered, { trustedKeys, verify })).ok);
  const t2 = JSON.parse(JSON.stringify(signed)); t2.issuedAtServerMs += 1;
  ck("S7 竄改簽發時刻 ⇒ 拒絕", !(await SG.verifySignedSnapshot(t2, { trustedKeys, verify })).ok);
  const t3 = { ...signed, signature: { ...signed.signature, keyId: "unknown-key" } };
  ck("S8 未知金鑰 ⇒ 拒絕", !(await SG.verifySignedSnapshot(t3, { trustedKeys, verify })).ok);
  const t4 = { ...signed, signature: { ...signed.signature, alg: "none" } };
  ck("S9 alg none ⇒ 拒絕", !(await SG.verifySignedSnapshot(t4, { trustedKeys, verify })).ok);
  const t5 = { ...signed, signature: null };
  ck("S10 沒有簽章 ⇒ 拒絕（不因沒後端而放行）", !(await SG.verifySignedSnapshot(t5, { trustedKeys, verify })).ok);
  const other = generateKeyPairSync("ed25519");
  const t6 = SG.attachSignature(env.envelope, nodeSign(null, Buffer.from(bytes), other.privateKey).toString("base64"));
  ck("S11 別把金鑰簽的 ⇒ 拒絕", !(await SG.verifySignedSnapshot(t6, { trustedKeys, verify })).ok);
  ck("S12 缺 verifier ⇒ 拒絕（不猜）", !(await SG.verifySignedSnapshot(signed, { trustedKeys })).ok);
  ck("S13 src/ 線上模組沒有私鑰、沒有簽章函式", !/PRIVATE KEY|privateKey|\.sign\(|subtle\.sign/.test(ONLINE_SRC));
  ck("S14 本機 authority 的快照信封標記未簽（不冒充伺服器）",
    SG.LOCAL_UNSIGNED.trusted === false && SG.LOCAL_UNSIGNED.alg === null);
  ck("S15 內層快照雜湊也被驗（信封雜湊對但內層被改 ⇒ 拒）", (() => {
    const x = JSON.parse(JSON.stringify(signed)); x.payload.hash = "00000000";
    return SG.validateEnvelopeShape(x).ok === false;
  })());
  ck("S16 快照的 issuedAt 取伺服器時刻，不取客戶端", env.envelope.issuedAtServerMs === T0);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── C CS 線上快照：延後（Online Backend Foundation v1）──");
{
  //  CS 快照需要先登記 CS 模擬版本（TD-58），且 main 的 toFpsRoster 已套用 csStatDamp 疲勞
  //  ⇒ 本輪不帶入 csSquadSnapshot，CS 出賽單一律明確拒絕（不做任何替代推導、不假裝可用）。
  ck("C1 csSquadSnapshot 不在本輪（檔案不存在）", !existsSync(url("src/platform/online/csSquadSnapshot.js")));
  const csEntry = RB.buildCompetitiveEntry({ request: { teamId: "team:cs", tacticId: "f2" }, careerState: {}, now: 5, mode: "cs" });
  ck("C2 CS 競技出賽單被明確拒絕（cs_snapshot_deferred）", !csEntry.ok && csEntry.errors?.[0]?.code === "cs_snapshot_deferred", JSON.stringify(csEntry.errors));
  ck("C3 rosterBridge 不 import 任何 CS 快照模組", !/csSquadSnapshot/.test(read("src/platform/competitive/rosterBridge.js").split("\n").filter((l) => l.startsWith("import")).join("\n")));
  ck("C4 公開入口沒有匯出 CS 快照", typeof OI.publishCsSquadSnapshot === "undefined");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── X 邊界不回退 ──");
{
  ck("X1 公開入口匯出三個部件（ServerTime／Ranked 契約／簽章驗證），不匯出 mock authority",
    typeof OI.createSyncedServerClock === "function" && typeof OI.validateRankedGateway === "function"
    && typeof OI.verifySignedSnapshot === "function" && typeof OI.createLocalRankedAuthority === "undefined");
  const imports = FILES.filter((f) => f.endsWith(".js")).flatMap((f) => [...read(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => `${f}→${m[1]}`));
  const bad = imports.filter((x) => /profileStore|seasonStore|competition\/|circuit|finalStandings|applyMatchProgress|levelGrowth|worldClock|zustand|react|supabaseClient/.test(x));
  ck("X2 online 模組不 import Store／賽季／結算／生涯時鐘／Supabase SDK", bad.length === 0, bad.join(" ; ") || "clean");
  const tx = TX.createMatchProgressTransaction({ matchId: "x", mode: "cs", sourceResultVersion: "CsMatchResult.v1", recordedAt: 1,
    teamRewards: { money: 1 }, playerProgress: [], metadata: { matchSource: "ranked" } });
  ck("X3 ranked 仍被結算入口拒收（CS 也一樣）", P.applyProgressToState({ players: [], meta: { days: 1 }, finance: {}, processedMatchTransactions: {} }, tx).nextState === null);
  ck("X4 serverClock 仍不退回裝置時間", !/Date\.now/.test(code(read("src/platform/time/serverClock.js"))));
  ck("X5 COMPETITIVE_ENABLED 仍為 false", (await import("../src/platform/competitive/competitiveMode.js")).COMPETITIVE_ENABLED === false);
  ck("X6 CompetitiveRecord 仍宣告不進生涯存檔", CR.COMPETITIVE_RECORD_OWNER.persistedInCareerSave === false);

  //  ── Online Backend Foundation v1 新增 ───────────────────────────────────
  const srcFiles = (dir) => fs.readdirSync(url(dir), { withFileTypes: true })
    .flatMap((d) => d.isDirectory() ? srcFiles(`${dir}/${d.name}`) : /\.(js|jsx)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
  const mockLeaks = srcFiles("src").filter((f) => /createLocalRankedAuthority|localRankedAuthority/.test(code(read(f))));
  ck("X7 mock ranked authority 不在 src/（只在 tools/lib）", mockLeaks.length === 0, mockLeaks.join(", "));
  const onlineSrc = [...srcFiles("src/platform/online"), ...srcFiles("src/platform/competitive"), "src/platform/time/serverClock.js"];
  const gwLeaks = onlineSrc.filter((f) => /matchmaking\/(mockGateway|practiceGateway)/.test(read(f)));
  ck("X8 正式 Online authority 模組不 import mockGateway／practiceGateway", gwLeaks.length === 0, gwLeaks.join(", "));
  const onlineImports = onlineSrc.flatMap((f) => [...read(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => `${f}→${m[1]}`));
  const careerTime = onlineImports.filter((x) => /worldClock/.test(x));
  ck("X9 ServerTime／Ranked 模組不 import CareerTime（worldClock）", careerTime.length === 0, careerTime.join(" ; ") || "clean");
  const pinned = onlineSrc.filter((f) => /moba-sim\.v\d+/.test(code(read(f))));
  ck("X10 Online／Competitive 原始碼不寫死任何 moba-sim 版本號（以目前版本與未來升版為前提）", pinned.length === 0, pinned.join(", "));
  const sv = SV.MOBA_SIMULATION_VERSION;
  ck(`X11 目前模擬版本已登記且可重播（${sv}）`, SV.KNOWN_SIMULATION_VERSIONS.includes(sv) && SV.canReplay(sv).ok === true);
  ck("X12 TD-57：玩家挑戰不給選手 XP（第二層防線）", RF.playerXpFor({ win: true, perf: 1.2, isMvp: true, matchSource: "challenge" }) === 0
    && RF.playerXpFor({ win: true, perf: 1.2, isMvp: true, matchSource: "competitive" }) > 0);
  ck("X13 命名：GENERAL_MATCH_SOURCE ＝ competitive（一般對戰），且與 ranked 不同", MS.GENERAL_MATCH_SOURCE === "competitive"
    && MS.MATCH_TIER_LABELS[MS.GENERAL_MATCH_SOURCE].name === "一般對戰" && MS.MATCH_SOURCE.ranked !== MS.GENERAL_MATCH_SOURCE
    && MS.isGeneralMatchSource("competitive") && !MS.isGeneralMatchSource("ranked"));
  //  TD-57 regression：Challenge 不可拿到 Career 選手 XP。X12 只測一組輸入；這裡掃滿輸入空間，
  //  並走到 CS adapter 的 learning 加成之後（0 經加成仍須為 0），再確認兩個 adapter 的 XP 都只從
  //  `playerXpFor(... matchSource)` 來 ⇒ 不存在繞過來源判斷的 XP 路徑。
  const xpGrid = [];
  for (const win of [true, false]) for (const perf of [0, 0.5, 1, 1.5, 3]) for (const isMvp of [true, false]) xpGrid.push({ win, perf, isMvp });
  const chXp = xpGrid.map((a) => RF.playerXpFor({ ...a, matchSource: "challenge" }));
  const chCsXp = chXp.map((baseXp) => LG.learningAdjustedXp({ baseXp, learning: 99 }));
  const genXp = xpGrid.filter((a) => a.win).map((a) => RF.playerXpFor({ ...a, matchSource: MS.GENERAL_MATCH_SOURCE }));
  ck("X16 TD-57：Challenge 在全部 勝負×表現×MVP 組合下 XP 皆為 0（含 CS learning 加成後），一般對戰勝場仍 > 0",
    chXp.every((x) => x === 0) && chCsXp.every((x) => x === 0) && genXp.every((x) => x > 0),
    JSON.stringify({ chXp, chCsXp, genXp }));
  const adapterXp = ["src/platform/progress/adapters/mobaProgressAdapter.js", "src/platform/progress/adapters/csProgressAdapter.js"]
    .map((f) => { const c = code(read(f)); return { f, viaFormula: /playerXpFor\(\{[^}]*matchSource[^}]*\}\)/.test(c), rawXpLiteral: /xpGained\s*:\s*\d/.test(c) }; });
  ck("X17 TD-57：兩個 progress adapter 的選手 XP 都只經 playerXpFor(matchSource)，沒有寫死 XP", adapterXp.every((a) => a.viaFormula && !a.rawXpLiteral), JSON.stringify(adapterXp));
  const mig = read("supabase/migrations/0002_ranked_authority.sql");
  ck("X14 0002：force RLS、收回 anon／authenticated 權限、只給 select、server_day grant、search_path、updated_at trigger、user_id 索引",
    (mig.match(/force row level security/g) ?? []).length === 4 && /revoke all on public\.ranked_records\s+from anon, authenticated/.test(mig)
    && (mig.match(/grant select on public\./g) ?? []).length === 4 && /grant execute on function public\.server_day\(\) to anon, authenticated/.test(mig)
    && (mig.match(/set search_path = ''/g) ?? []).length === 2 && /ranked_records_touch_updated_at/.test(mig) && /ranked_tickets_user_id_idx/.test(mig));
  ck("X15 0002 仍沒有任何客戶端寫入 policy", !/for\s+(insert|update|delete|all)\s/i.test(mig.replace(/--.*$/gm, "")));
}

console.log(`\nOnline Foundation v1：${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
