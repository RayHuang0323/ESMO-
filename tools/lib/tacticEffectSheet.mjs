// ============================================================================
//  tools/lib/tacticEffectSheet.mjs — 戰術「效果表」（Phase 3a T8 fix 3）
//
//  玩家看得到的模板文案（desc／cons）只能轉述「旋鈕對中性模板的直接效果」。這支把一份戰術設定
//  解析成一張效果表：每個效果一列，列出模板值、中性（std）值、方向（higher／lower／same）。
//  門檻以下一律 `same`——**不得提到**。文案、gate、日後的 UI 說明（Task 13）都從同一張表出發。
//
//  效果詞彙（完整清單，其餘一律不許寫）：
//    lane.*       三路站位前後（laneOffset）
//    gank.freq    打野抓人的頻率（gankInterval × gankIntervalK 的倒數）
//    gank.lean.*  抓人較偏向哪一路（gankWeights 的占比；弱偏向）
//    invade.*     開局入侵的機率、中路是否跟進（只影響開局約 50 秒）
//    support.*    輔助先救誰（protectRole）、多早出手（protectHp）、有效遊走率（supportRoamRate × roamK）
//    join.*       參與團戰／龍／巴龍的程度（joinFight／dragonJoin／baronJoin；是參與的機率，不是時序或站位）
//    retreat      多早撤退（retreatAt ＋ retreatFloorShift）；commit 是否願意投入團戰（-commitShift）
//    engage.*     各階段淨接戰偏移（engageBias ＋ phaseEngage[階段]）
//    split        帶線者留在線上、略過團戰 ⇒ 隊伍少一人打團
//  ⚠ siegeBias／towerPriority 刻意不在詞彙內：它只平移擊殺後的血量門檻（約 3 個百分點），太薄，不描述。
//
//  門檻（每個都附理由；`dir` 的規則是 |值 − 中性| 達門檻才算 higher／lower）：
//    lane 0.02       一階姿態（aggressive／defensive）差 0.05；0.02 以下是 aggression 疊加的雜訊
//    gank.freq ×1.1  抓人間隔差 10% 以內不會被玩家感覺到（標準 45 秒 → 差 4.5 秒）
//    gank.lean 0.05  三路均分是 0.333；權重 1.7:1:1 時偏向路占比 0.459（+0.126）才算有偏向
//    invade 0.06     中性 0.10；一個 priority 階梯是 0.05，只差一階（0.15）不構成可描述的差異
//    protectHp 0.1   0.55 → 0.70（protect）才算「更早出手」
//    roam ×1.25      有效遊走率 0.30；±25% 以內（例如 0.25）視為相同
//    join.fight 0.04 joinFight 每個 grouping 階梯 0.015；差 0.04 約三階，才算更願意／較不願意
//    dragon/baron 0.05 priority→join 斜率 0.4，0.05 ≈ priority 差 0.125
//    retreat 0.02    撤退門檻（retreatAt）加上保底平移的合計
//    commit 0.03     commitShift 範圍 ±0.1
//    engage 0.03     淨接戰偏移（分數單位）；中性 0。0.03 約為 aggression 一階的 engageBias 的 2/3
//  純函式；只 import 戰術契約。
// ============================================================================
import { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC } from "../../src/platform/contracts/MobaTacticConfig.js";

export const THRESHOLDS = Object.freeze({
  lane: 0.02, gankFreqRatio: 1.1, gankLean: 0.05, invade: 0.06, protectHp: 0.1, roamRatio: 1.25,
  joinFight: 0.04, joinObjective: 0.05, retreat: 0.02, commit: 0.03, engage: 0.03,
});
const LANES = ["top", "mid", "bot"];
const PHASES = ["early", "mid", "late"];

const share = (w, lane) => w[lane] / (w.top + w.mid + w.bot);
function raw(config) {
  const k = toEngineTactic(config), i = toEngineTacticIdentity(config);
  const r = {};
  for (const l of LANES) r[`lane.${l}`] = k.laneOffset[l];
  r["gank.freq"] = 1 / (k.gankInterval * i.gankIntervalK);
  for (const l of LANES) r[`gank.lean.${l}`] = share(k.gankWeights, l);
  r["invade.chance"] = k.invadeChance;
  r["invade.mid"] = k.invadeWithMid;
  r["support.target"] = i.protectRole;
  r["support.protectHp"] = i.protectHp;
  r["support.roam"] = k.roamRate * i.roamK;
  r["join.fight"] = k.joinFight;
  r["join.dragon"] = k.dragonJoin;
  r["join.baron"] = k.baronJoin;
  r["retreat"] = k.retreatAt + i.retreatFloorShift;
  r["commit"] = -i.commitShift;
  PHASES.forEach((p, n) => { r[`engage.${p}`] = i.engageBias + i.phaseEngage[n]; });
  r["split"] = k.splitLane;
  r["split.push"] = k.splitPush;
  return r;
}
const NEUTRAL = raw(STANDARD_OPP_TACTIC);

function dirOf(id, v, n) {
  if (typeof v === "boolean") return v === n ? "same" : v ? "higher" : "lower";
  if (id === "support.target" || id === "split") return v === n ? "same" : "differs";
  if (id === "split.push") return "same";
  if (id === "gank.freq") { const r = v / n; return r >= THRESHOLDS.gankFreqRatio ? "higher" : r <= 1 / THRESHOLDS.gankFreqRatio ? "lower" : "same"; }
  if (id === "support.roam") { const r = v / n; return r >= THRESHOLDS.roamRatio ? "higher" : r <= 1 / THRESHOLDS.roamRatio ? "lower" : "same"; }
  const t = id.startsWith("lane.") ? THRESHOLDS.lane : id.startsWith("gank.lean.") ? THRESHOLDS.gankLean : id === "invade.chance" ? THRESHOLDS.invade
    : id === "support.protectHp" ? THRESHOLDS.protectHp : id === "join.fight" ? THRESHOLDS.joinFight : id === "join.dragon" || id === "join.baron" ? THRESHOLDS.joinObjective
    : id === "retreat" ? THRESHOLDS.retreat : id === "commit" ? THRESHOLDS.commit : THRESHOLDS.engage;
  const d = v - n;
  return d >= t - 1e-9 ? "higher" : d <= -t + 1e-9 ? "lower" : "same";
}

/** 一份戰術設定 → 效果表：{ [rowId]: { value, neutral, dir } }。 */
export function effectSheet(config) {
  const r = raw(config), out = {};
  for (const id of Object.keys(r)) out[id] = { value: r[id], neutral: NEUTRAL[id], dir: dirOf(id, r[id], NEUTRAL[id]) };
  return out;
}
/** 方向不是 same 的列（＝文案允許提到的效果）。 */
export const mentionable = (sheet) => Object.entries(sheet).filter(([, row]) => row.dir !== "same").map(([id, row]) => [id, row.dir]);
// ── 文案審查：句子 → 效果主張 → 對照效果表 ────────────────────────────────────────────
//  規則：玩家文案的每一句都必須對應效果表的至少一列（或是「適合…」的使用情境、或總結句），
//  主張的方向必須等於該列的方向；方向是 same 的列不得被提到；強度詞（很多／遠比／明顯…）要求幅度 ≥ 2 倍門檻。
//  這支只認得詞彙內的說法——認不得的句子會被判「沒有對應的效果列」，而不是放行。
const LANE_OF = { 上: "top", 中: "mid", 下: "bot" };
function lanesIn(clause) {
  if (/三路/.test(clause)) return ["top", "mid", "bot"];
  const out = [];
  for (const m of clause.matchAll(/(上|中|下)路/g)) {
    if (clause.slice(Math.max(0, m.index - 2), m.index) === "離開") continue;
    out.push(LANE_OF[m[1]]);
  }
  return out;
}
const STRONG = /很多|遠比|明顯|非常|大幅|極/;
const PHASE_ROWS = (seg) => {
  if (/整場/.test(seg)) return ["early", "mid", "late"];
  const p = [];
  if (/前期|前、中期/.test(seg)) p.push("early");
  if (/中期/.test(seg)) p.push("mid");
  if (/後期/.test(seg)) p.push("late");
  return p;
};
const RETURN_NORMAL = /(回到|恢復)[^，。；]{0,4}(正常|一般|平常|標準|普通)/;

/** 一個句子（以。結尾）→ 主張清單 [{ row, dir, strong }]；dir 為 higher／lower／same／max／=值／split／fewDiff。 */
export function claimsOf(sentence) {
  const claims = [];
  const add = (row, dir, strong = false) => claims.push({ row, dir, strong });
  for (const c of sentence.split(/[，；。]/).filter(Boolean)) {
    const strong = STRONG.test(c);
    //  站位前後（離開下路不算站位）
    if (/站位|推得|退後|靠後|往後|往前|更前面/.test(c) && !/離開/.test(c)) {
      const fwd = /更前面|往前|推得比平常/.test(c), back = /退後|靠後|往後/.test(c);
      for (const l of lanesIn(c)) { if (fwd && !back) add(`lane.${l}`, "higher", strong); else if (back && !fwd) add(`lane.${l}`, "lower", strong); }
    }
    //  抓人頻率與偏向
    if (/打野[^，。；]{0,8}(更勤快|比較勤)/.test(c)) add("gank.freq", "higher", strong);
    if (/抓人的次數(明顯)?比平常少|抓人[^，。；]{0,4}(變少|比較少)/.test(c)) add("gank.freq", "lower", strong);
    for (const m of c.matchAll(/較偏向(上|中|下)路/g)) add(`gank.lean.${LANE_OF[m[1]]}`, "higher");
    const lo = c.match(/較少偏向((?:上|中|下)路(?:和|與)?)+/);
    if (lo) for (const m of lo[0].matchAll(/(上|中|下)路/g)) add(`gank.lean.${LANE_OF[m[1]]}`, "lower");
    //  開局入侵
    if (/(很可能|比較可能)[^，。；]{0,8}入侵/.test(c)) add("invade.chance", "higher", strong);
    if (/更不會去?入侵/.test(c)) add("invade.chance", "lower", strong);
    if (/中單也會跟著/.test(c)) add("invade.mid", "higher");
    //  輔助
    const tgt = c.match(/優先(救|照顧)(射手|中單)/); if (tgt) add("support.target", tgt[2] === "射手" ? "=adc" : "=mid");
    if (/出手救人的時機(也)?(比較|更)早/.test(c)) add("support.protectHp", "higher");
    if (/遊走的次數比平常多|(比較|更)常(離開下路|不在下路)|離開下路的次數比平常多/.test(c)) add("support.roam", "higher", strong);
    if (/(比較|更)少離開下路|(留|待)在下路的時間比平常(長|久)/.test(c)) add("support.roam", "lower", strong);
    //  參與度
    if (/加入團戰的程度[^，。；]{0,4}(高|略高)|(比較|更)願意加入團戰|團戰也比較願意加入/.test(c)) add("join.fight", "higher", strong);
    if (/對龍和巴龍的爭奪[^，。；]{0,6}更願意參與/.test(c)) { add("join.dragon", "higher", strong); add("join.baron", "higher", strong); }
    else {
      if (/(?<!巴)龍的爭奪[^，。；]{0,6}更願意參與/.test(c)) add("join.dragon", "higher", strong);
      if (/巴龍的爭奪[^，。；]{0,6}更願意參與/.test(c)) add("join.baron", "higher", strong);
    }
    if (/(?<!巴)龍的爭奪[^，。；]{0,4}比較少參與/.test(c)) add("join.dragon", "lower", strong);
    if (/巴龍的爭奪[^，。；]{0,4}比較少參與/.test(c)) add("join.baron", "lower", strong);
    //  撤退與投入
    if (/撤退的時機(又|也)?(比平常)?晚/.test(c)) add("retreat", "lower", strong);
    if (/撤退的時機(比較|比平常|也比較)早/.test(c)) add("retreat", "higher", strong);
    if (/投入團戰的門檻(也|又)?比較低/.test(c)) add("commit", "higher", strong);
    if (/投入團戰的門檻(也|又)?比較高/.test(c)) add("commit", "lower", strong);
    //  帶線
    if (/上路單獨/.test(c)) add("split", "=top");
    if (/中單單獨/.test(c)) add("split", "=mid");
    if (/多半也不離開|不參加團戰|少一個人/.test(c)) add("split", "split");
    if (/只在少數地方和標準打法不同|其餘方面和標準打法沒有明顯差別/.test(c)) add("*", "fewDiff");
  }
  //  接戰傾向：以「。；」切段，段內的階段詞決定要查哪幾個階段
  for (const seg of sentence.split(/[；。]/).filter(Boolean)) {
    const strong = STRONG.test(seg.replace(/(前|中|後)期(尤其|最)明顯|尤其是(前|中|後)期/g, ""));
    const ph = PHASE_ROWS(seg);
    const hi = /(比較|更)敢主動(接戰|找團)|偏好主動接戰|轉為偏積極|再積極起來|恢復積極/.test(seg);
    const lo = /不太主動接戰|接戰的傾向偏低|接戰傾向偏低/.test(seg);
    const back = RETURN_NORMAL.test(seg) && /接戰|打法/.test(seg);
    const rows = ph.length ? ph : ["early", "mid", "late"];
    if (hi) for (const p of rows) add(`engage.${p}`, "higher", strong);
    if (lo) for (const p of rows) add(`engage.${p}`, "lower", strong);
    //  「回到平常／正常」：沒有階段詞時預設指中期與後期（＝前期之後）
    if (back) {
      const after = /前期之後/.test(seg) ? ["mid", "late"] : /中期之後/.test(seg) ? ["late"] : null;
      for (const p of (after ?? (ph.length ? ph : ["mid", "late"]))) add(`engage.${p}`, "same");
    }
    const mx = seg.match(/(前|中|後)期(尤其|最)明顯|尤其是(前|中|後)期/); if (mx) add(`engage.${{ 前: "early", 中: "mid", 後: "late" }[mx[1] ?? mx[3]]}`, "max");
  }
  return claims;
}

const magnitudeOk = (id, row) => {   // 強度詞：幅度至少 2 倍門檻
  if (id === "gank.freq") { const r = row.value / row.neutral; return r >= 1.4 || r <= 1 / 1.4; }
  if (id === "support.roam") { const r = row.value / row.neutral; return r >= 2 || r <= 0.5; }
  if (typeof row.value !== "number") return true;
  const t = id.startsWith("lane.") ? THRESHOLDS.lane : id.startsWith("gank.lean.") ? THRESHOLDS.gankLean : id === "invade.chance" ? THRESHOLDS.invade
    : id === "join.fight" ? THRESHOLDS.joinFight : id.startsWith("join.") ? THRESHOLDS.joinObjective : id === "retreat" ? THRESHOLDS.retreat
    : id === "commit" ? THRESHOLDS.commit : id.startsWith("engage.") ? THRESHOLDS.engage : id === "support.protectHp" ? THRESHOLDS.protectHp : Infinity;
  return Math.abs(row.value - row.neutral) >= 2 * t - 1e-9;
};

/** 一個主張對照效果表 ⇒ 違規訊息或 null。 */
export function checkClaim(cl, sheet) {
  if (cl.dir === "fewDiff") return Object.values(sheet).filter((r) => r.dir !== "same").length <= 4 ? null : "說「只有少數地方不同」，但效果表有超過 4 列不同";
  const row = sheet[cl.row];
  if (!row) return `沒有這個效果列：${cl.row}`;
  if (cl.dir === "higher" || cl.dir === "lower" || cl.dir === "same") {
    if (row.dir !== cl.dir) return `${cl.row} 主張 ${cl.dir}，效果表是 ${row.dir}`;
    if (cl.strong && cl.dir !== "same" && !magnitudeOk(cl.row, row)) return `${cl.row} 用了強度詞，但幅度不到門檻的兩倍`;
    return null;
  }
  if (cl.dir === "max") {
    const nets = ["early", "mid", "late"].map((p) => sheet[`engage.${p}`].value);
    return sheet[cl.row].value >= Math.max(...nets) - 1e-9 ? null : `${cl.row} 說最明顯，但不是三個階段中最大的`;
  }
  if (cl.dir === "split") return sheet.split.value !== null ? null : "說帶線者不參加團戰，但這份設定沒有帶線";
  if (cl.dir.startsWith("=")) return row.value === cl.dir.slice(1) ? null : `${cl.row} 主張 ${cl.dir}，效果表是 ${row.value}`;
  return `未知主張 ${cl.dir}`;
}

/**
 * 引擎沒有的機制：這些說法無論旋鈕為何都是過度承諾。每條註明「缺哪個機制」（不是「我們曾經寫過這句」）。
 * 不放 /每次/、/坦克/ 這類不是機制的詞；要擋絕對語氣用 ABSOLUTES 這條有針對性的規則。
 */
export const IMPOSSIBLE = Object.freeze([
  [/塔/, "塔的交換／暴露：siegeBias 只平移擊殺後的血量門檻（約 3 個百分點），沒有可描述的推塔效果；不提推塔"],
  [/轉點|輪轉|轉線|支援其他路|各路之間/, "沒有換線／輪轉機制：遊走只是輔助往有隊友的路移動，不是全隊輪轉"],
  [/逼對手|讓對手|對手(會|得|可以|必須|就|被|反|不)|被看穿|反蹲|蹲到|分神/, "文案不得描述對手的反應：引擎沒有對手模型，對手行為不是旋鈕效果"],
  [/發育|補刀|經濟|資源|金幣|裝備|丟線|虧線|白送|人頭|滾雪球|滾大|野怪|營地|剝奪|壓縮|封鎖/, "沒有資源／經濟／發育結果可以由旋鈕直接保證；打野只拿己方營地，入侵只是開局走向入侵點（LogicEngine ~3349／~6630）"],
  [/河道|地圖主導|控圖|視野|迷霧/, "沒有河道／地圖控制／視野機制（vision.* 未映射，戰爭迷霧只是呈現層）"],
  [/伏擊|埋伏|保護|貼身|peel/i, "沒有伏擊或貼身保護機制：輔助只是依 protectHp／protectRole 去救低血量隊友"],
  [/早到|趕回|來不及|提早|預先|刷新前|抵達|先一步/, "沒有行進時間或物件刷新前的行動：dragonJoin 只是物件出現後的參與擲骰（LogicEngine ~6411）"],
  [/集結|靠在一起|隊伍中央|先手|開團手|站位中央/, "沒有陣型或先手選擇：joinFight 只是加入團戰的機率；teamfight.engager 是 design"],
  [/兵線|清線|推線|換線|搶線/, "沒有兵線控制旋鈕：laneOffset 只決定站位前後"],
  [/人數優勢|人數差|搶龍|拿龍|團滅|崩盤|翻盤|拿不到/, "結果（人數差、拿到龍、團滅）取決於整場模擬，不是旋鈕的直接效果"],
  [/離開中路時|中塔|帶線與支援|兩邊都要顧|帶線.{0,6}(離開|遊走|支援)/, "帶線者留在自己的線上並略過團戰（skipFight，LogicEngine ~6620）；沒有離線／遊走／同時支援的機制"],
  [/必定|一定會|絕對|永遠|百分之百/, "沒有任何旋鈕是確定性的（參戰、遊走、入侵都是機率或偏移）；絕對語氣必為假"],
]);

/** 整段文案（desc＋cons）對照效果表 ⇒ 違規清單（空陣列＝通過）。 */
export function copyViolationsOf(text, sheet) {
  const out = [];
  for (const [re, why] of IMPOSSIBLE) if (re.test(text)) out.push(`引擎沒有的機制：${why}`);
  for (const s of text.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean)) {
    if (/^適合/.test(s)) continue;                                   // 使用情境建議：不描述引擎效果
    const cl = claimsOf(s);
    if (cl.length === 0) { out.push(`沒有對應效果列的句子：「${s}」`); continue; }
    for (const c of cl) { const v = checkClaim(c, sheet); if (v) out.push(`${v}（「${s.slice(0, 24)}…」）`); }
  }
  return out;
}

/** 印成一行一列的文字（給報告用）。 */
export function formatSheet(sheet) {
  const f = (x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x);
  return Object.entries(sheet).filter(([id]) => id !== "split.push").map(([id, r]) => `${id}=${f(r.value)}(${f(r.neutral)})${r.dir === "same" ? "" : ` ${r.dir}`}`).join("; ");
}
