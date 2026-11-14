// ============================================================================
//  tools/lib/shadowDecideV24.mjs — v24 影子決策的共用版本（2026-11-15，診斷 Sprint；只讀紀錄，不跑對局）
//
//  decide()／ejPrior()／priorKnownMask() 逐字取自 tools/owner_preview/analyze_shadow_v24_s05.mjs
//  （Sprint 0.5 登記的分析器，commit ece70408；那支檔案本身不改）。
//  唯一的新增是 opts.partyOrder：
//    "role"（預設）＝與登記分析器相同：成員依紀錄順序 jungle → mid → sup → top 取前 n 名。
//    "eta"         ＝診斷用的反事實：打野之外的成員依到場時間由近到遠排序後取前 n 名
//                     （同秒時依原順序，排序穩定 ⇒ 決定性）。
//  check_v24_diag_sprint.mjs 會用 "role" 重算 Sprint 0.5 的驗證結果，逐值比對登記的
//  validation_analysis.json，證明這份複本與登記分析器一致。
// ============================================================================

export const popcount = (m) => { let c = 0; m = m >>> 0; while (m) { c += m & 1; m >>>= 1; } return c; };
export const EJ_NEAR_ETA = 15, EJ_MEM_FRESH = 10, JG_BIT = 2;
export const ENEMY_BITS = ["top", "jungle", "mid", "adc", "sup"];   // bit0＝top

export function ejPrior(ev) {
  const j = ev.ej; if (!j) return 0;
  const [dead, seen, etaNow, age, memEta] = j;
  if (dead) return 0;
  if (seen) return etaNow <= EJ_NEAR_ETA ? JG_BIT : 0;
  if (age != null && age <= EJ_MEM_FRESH && memEta - age > EJ_NEAR_ETA) return 0;
  return JG_BIT;
}
export const priorKnownMask = (ev) => ((((ev.nowKnown ?? 0) | (ev.apprNearKnown ?? 0)) & ~JG_BIT) | ejPrior(ev));

/** 成員名單（打野在第一位）。partyOrder 見檔頭。 */
export function membersOf(ev, P, partyOrder = "role") {
  const cands = ev.cands ?? [];
  const jc = cands.find((c) => c[0] === "jungle");
  const members = [jc ?? ["jungle", 1, ev.etaJ, ev.jHp, ev.jLv, 0]];
  const rest = [];
  for (const c of cands) {
    if (c[0] === "jungle") continue;
    const [, baseAvail, eta, hpFrac] = c;
    if (baseAvail === 1 && hpFrac >= P.memberHpMin && eta <= ev.etaJ + P.partyEtaSlack) rest.push(c);
  }
  if (partyOrder === "eta") rest.sort((a, b) => a[2] - b[2]);   // Array.prototype.sort 穩定
  return members.concat(rest);
}

export function threatCount(ev, P, maskMode = "known") {
  const aF = P.threat === "all" ? ev.apprFull : ev.apprNearFull, aK = P.threat === "all" ? ev.apprKnown : ev.apprNearKnown;
  return maskMode === "full" ? popcount((ev.nowFull ?? 0) | (aF ?? 0)) : P.threat === "prior" ? popcount(priorKnownMask(ev)) : popcount((ev.nowKnown ?? 0) | (aK ?? 0));
}

export function decide(ev, P, maskMode = "known", opts = {}) {
  if (ev.noTarget) return { d: "declined:no_target" };
  if (ev.jAvail !== 1 || !(ev.jHp >= P.jHpMin)) return { d: "declined:no_leader" };
  if (!(ev.etaJ <= P.etaMax)) return { d: "declined:too_far" };
  const members = membersOf(ev, P, opts.partyOrder ?? "role");
  if (members.length < P.sizeMin) return { d: "declined:no_party" };
  const T = threatCount(ev, P, maskMode);
  let marginOk = false;
  for (let n = P.sizeMin; n <= Math.min(P.sizeMax, members.length); n++) {
    if (n - T < P.marginMin) continue;
    marginOk = true;
    const lc = members.slice(0, n).reduce((s, c) => s + (c[5] ?? 0), 0);
    if (lc <= P.laneCostMax) return { d: "go", n, roles: members.slice(0, n).map((c) => c[0]) };
  }
  return { d: marginOk ? "declined:lane_cost" : "declined:threat" };
}

//  ---- 統計（與登記分析器相同的 t 分布 95% 區間）----
const T_TABLE = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
export const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);
export function tCrit(df) {
  if (df < 1) return null;
  if (df <= 30) return T_TABLE[df];
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}
export function summ(xs) {
  xs = xs.filter((x) => x != null && Number.isFinite(x));
  const n = xs.length;
  if (!n) return { mean: null, sd: null, n: 0, ci: null };
  const m = xs.reduce((s, x) => s + x, 0) / n;
  if (n < 2) return { mean: r3(m), sd: null, n, ci: null };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  const hw = tCrit(n - 1) * sd / Math.sqrt(n);
  return { mean: r3(m), sd: r3(sd), n, ci: [r3(m - hw), r3(m + hw)] };
}
export const excludes0 = (s) => (s.ci ? s.ci[0] > 0 || s.ci[1] < 0 : null);

/** 讀一個資料夾下所有影子批次（*.json，每檔 rows[]）。group 與登記分析器相同。 */
export async function loadRows(dir) {
  const fs = await import("node:fs"), path = await import("node:path");
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".json")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(j?.rows)) continue;
    for (const r of j.rows) rows.push({ ...r, _file: f, group: r.path === "career" ? `career_${r.tier}` : r.path });
  }
  return rows;
}
