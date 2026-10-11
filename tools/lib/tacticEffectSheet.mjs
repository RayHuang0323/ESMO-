// ============================================================================
//  tools/lib/tacticEffectSheet.mjs — 戰術「效果表」（Phase 3a T8 fix 3／fix 4）
//
//  玩家看得到的模板文案（desc／cons）只能轉述「旋鈕對中性模板的直接效果」。這支把一份戰術設定
//  解析成一張效果表：每個效果一列，列出模板值、中性（std）值、方向（higher／lower／same）與幅度帶
//  （band：slight／plain／binary）。門檻以下一律 `same`——**不得提到**（唯一例外見「same 的階段列」）。
//  文案、gate、日後的 UI 說明（Task 13）都從同一張表出發。
//
//  效果詞彙（完整清單，其餘一律不許寫）：
//    lane.*          三路站位前後（laneOffset）
//    gank.freq       打野抓人的頻率（gankInterval × gankIntervalK 的倒數）
//    gank.lean.*     抓人較偏向哪一路（gankWeights 的占比；弱偏向）
//    invade.*        開局入侵的機率、中路是否跟進（只影響開局那一小段，rules.invasionWindow）
//    support.*       輔助先救誰（protectRole）、多早出手（protectHp）、有效遊走率（supportRoamRate × roamK）
//    join.fight.<階段>／join.dragon.<階段>／join.baron.<階段>
//                    參與團戰／龍／巴龍的機率。**逐階段**：引擎的 `_joinChance`（LogicEngine ~418）是
//                    `clamp(joinFight｜dragonJoin｜baronJoin ＋ phaseJoin[階段], 0.05, 0.98)`，
//                    phaseJoin ＝ phaseEngage × 0.5——三個擲骰共用這一支，所以龍與巴龍也吃階段偏移
//                    （fix 3 的表只用 joinFight／dragonJoin／baronJoin 本身，是錯的）。
//                    巴龍 480 秒才出現（rules.baronSpawn），480 秒正是前期的結尾 ⇒ 巴龍沒有「前期」列。
//                    沒指明階段的主張必須在該效果的**每一個**階段都成立。
//    retreat         多早撤退（retreatAt ＋ retreatFloorShift）；commit 是否願意投入團戰（-commitShift）
//    engage.<階段>   各階段淨接戰偏移（engageBias ＋ phaseEngage[階段]）
//    split           帶線者留在線上、略過團戰 ⇒ 隊伍少一人打團。**是機率**：每 6 秒擲一次 splitPush
//                    （LogicEngine ~6622），所以文案必須帶「多半／通常／常常」，不得寫成絕對。
//  ⚠ siegeBias／towerPriority 刻意不在詞彙內：它只平移擊殺後的血量門檻（約 3 個百分點），太薄，不描述。
//
//  門檻（`dir` 的規則是 |值 − 中性| 達門檻才算 higher／lower）。每一條都對照「引擎裡同一個算式旁邊還放了什麼」：
//    lane 0.02       一階姿態（aggressive／defensive）差 0.05；0.02 以下是 aggression 疊加的雜訊
//    gank.freq ×1.1  抓人間隔差 10% 以內不會被玩家感覺到（標準 45 秒 → 差 4.5 秒）
//    gank.lean 0.05  三路均分是 0.333；權重 1.7:1:1 時偏向路占比 0.459（+0.126）才算有偏向
//    invade 0.06     中性 0.10；一個 priority 階梯是 0.05，只差一階（0.15）不構成可描述的差異
//    protectHp 0.1   兩段式旋鈕（0.55／0.70），沒有中間值 ⇒ band 一律 binary（不談幅度）
//    roam ×1.25      有效遊走率 0.30；±25% 以內（例如 0.25）視為相同
//    join.* 0.05     【fix 4：團戰由 0.04 改為 0.05，與龍／巴龍一致】三個擲骰走同一支 `_joinChance`，沒有理由用
//                    兩個門檻。量的是「每 6 秒重擲一次的參與機率」差幾個百分點；同一個算式旁邊是打野／輔助
//                    加成 0.18、劣勢 −0.20、選手能力 joinAdj——5 個百分點已經只有它們的四分之一，再低就不該說。
//                    0.04 還恰好等於一個 phaseJoin 階梯（0.08 × 0.5），會讓「只是把前期設成 aggressive」
//                    剛好壓線變成可描述。
//    retreat 0.04    【fix 4：由 0.02 改為 0.04】這一列是兩個**分開**的門檻的平移量相加：一般撤退門檻
//                    retreatAt（LogicEngine ~6512）與緊急撤退保底 0.28＋retreatFloorShift（~3028）。兩者各只平移
//                    合計的大約一半。舊門檻 0.02 ⇒ 每個門檻只動 1 個百分點的血量，而同一個算式旁邊是選手能力
//                    retreatAdj ±0.10、英雄定位 ±0.05、基礎餘裕 +0.06、隊友支援 −0.05、逃生技 −0.03——
//                    1 個百分點是其中最小一項的三分之一，不該當成一件事來講。0.04 ⇒ 每個門檻約 2 個百分點。
//                    審查量到的 three_lane_pressure −0.022 因此變成 same。
//    commit 0.03     commitShift 範圍 ±0.1；模板實際只會出現 0.02 的倍數，0.03 把 0.02（riskTolerance 差一階）
//                    擋在外面。0.04 屬於輕微帶（必須帶「稍微」）。維持不變。
//    engage 0.05     【fix 4：由 0.03 改為 0.05】淨接戰偏移加在 `_combatDecisionV3` 的分數上（LogicEngine ~3022）。
//                    同一個加總裡的離散項：技能就緒 +0.12／−0.10、開局 −0.14、劣勢 −0.10、席位基準 −0.12…+0.13、
//                    人數差每人 0.42。0.05 ＝ 其中最小離散項（0.10）的一半；再小的偏移（aggression 0.65／0.70
//                    單獨造成的 +0.036／+0.048）會被任何一項蓋過，不該寫成「整場比較敢打」。
//                    審查量到的 jungle_invasion／bot_duo_pressure 中後期 +0.036 因此變成 same。
//  幅度帶（fix 4，適用全部 12 個模板）：
//    slight  達門檻但不到「強度門檻」：文案**必須**帶輕微詞（稍微／略／一些／一點）
//    plain   達強度門檻：可以不帶修飾詞、也可以用強度詞（明顯／很多／遠比平常）；**不得**用輕微詞
//    binary  兩段式或列舉旋鈕：不得帶任何幅度詞
//    強度門檻＝加法列 2 倍門檻；gank.freq ×1.4；有效遊走率 ×2。
//  純函式；只 import 戰術契約。
// ============================================================================
import { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC } from "../../src/platform/contracts/MobaTacticConfig.js";

export const THRESHOLDS = Object.freeze({
  lane: 0.02, gankFreqRatio: 1.1, gankLean: 0.05, invade: 0.06, protectHp: 0.1, roamRatio: 1.25,
  joinFight: 0.05, joinObjective: 0.05, retreat: 0.04, commit: 0.03, engage: 0.05,
});
/** 比例列的強度門檻（加法列一律是 2 倍門檻）。 */
export const PLAIN_FLOORS = Object.freeze({ gankFreqRatio: 1.4, roamRatio: 2 });
const LANES = ["top", "mid", "bot"];
const PHASES = ["early", "mid", "late"];
/** 各個分階段效果有哪些階段（巴龍 480 秒才出現 ⇒ 沒有前期）。 */
export const PHASED = Object.freeze({ "join.fight": PHASES, "join.dragon": PHASES, "join.baron": ["mid", "late"], engage: PHASES });
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const EPS = 1e-9;

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
  //  參與度：與引擎 `_joinChance` 同一個算式（knob ＋ phaseJoin[階段]，夾在 0.05–0.98）
  const join = (base, p) => clamp(base + i.phaseJoin[PHASES.indexOf(p)], 0.05, 0.98);
  for (const p of PHASED["join.fight"]) r[`join.fight.${p}`] = join(k.joinFight, p);
  for (const p of PHASED["join.dragon"]) r[`join.dragon.${p}`] = join(k.dragonJoin, p);
  for (const p of PHASED["join.baron"]) r[`join.baron.${p}`] = join(k.baronJoin, p);
  r["retreat"] = k.retreatAt + i.retreatFloorShift;
  r["commit"] = -i.commitShift;
  PHASES.forEach((p, n) => { r[`engage.${p}`] = i.engageBias + i.phaseEngage[n]; });
  r["split"] = k.splitLane;
  r["split.push"] = k.splitPush;
  return r;
}
const NEUTRAL = raw(STANDARD_OPP_TACTIC);

/** 效果列 id → 效果家族（去掉階段字尾）；例 join.dragon.mid → join.dragon、engage.late → engage。 */
export const familyOf = (id) => id.replace(/\.(early|mid|late)$/, "");

function specOf(id) {
  if (id.startsWith("lane.")) return { t: THRESHOLDS.lane };
  if (id === "gank.freq") return { ratio: THRESHOLDS.gankFreqRatio, floor: PLAIN_FLOORS.gankFreqRatio };
  if (id.startsWith("gank.lean.")) return { t: THRESHOLDS.gankLean };
  if (id === "invade.chance") return { t: THRESHOLDS.invade };
  if (id === "support.protectHp") return { t: THRESHOLDS.protectHp, binary: true };
  if (id === "support.roam") return { ratio: THRESHOLDS.roamRatio, floor: PLAIN_FLOORS.roamRatio };
  if (id.startsWith("join.fight.")) return { t: THRESHOLDS.joinFight };
  if (id.startsWith("join.")) return { t: THRESHOLDS.joinObjective };
  if (id === "retreat") return { t: THRESHOLDS.retreat };
  if (id === "commit") return { t: THRESHOLDS.commit };
  if (id.startsWith("engage.")) return { t: THRESHOLDS.engage };
  return null;
}
function rowOf(id, v, n) {
  const row = (dir, band = null) => ({ value: v, neutral: n, dir, band: dir === "same" ? null : band });
  if (id === "split.push") return row("same");
  if (typeof v === "boolean") return row(v === n ? "same" : v ? "higher" : "lower", "binary");
  if (id === "support.target" || id === "split") return row(v === n ? "same" : "differs", "binary");
  const s = specOf(id);
  if (s.ratio) {
    const r = v / n, mag = Math.max(r, 1 / r);
    return row(mag < s.ratio - EPS ? "same" : r > 1 ? "higher" : "lower", mag >= s.floor - EPS ? "plain" : "slight");
  }
  const d = v - n, a = Math.abs(d);
  return row(a < s.t - EPS ? "same" : d > 0 ? "higher" : "lower", s.binary ? "binary" : a >= 2 * s.t - EPS ? "plain" : "slight");
}

/** 一份戰術設定 → 效果表：{ [rowId]: { value, neutral, dir, band } }。 */
export function effectSheet(config) {
  const r = raw(config), out = {};
  for (const id of Object.keys(r)) out[id] = rowOf(id, r[id], NEUTRAL[id]);
  return out;
}
/** 方向不是 same 的列（＝文案允許提到的效果）。 */
export const mentionable = (sheet) => Object.entries(sheet).filter(([, row]) => row.dir !== "same").map(([id, row]) => [id, row.dir]);
/** 方向不是 same 的效果家族（去掉階段字尾後去重）。 */
export const mentionableFamilies = (sheet) => [...new Set(mentionable(sheet).map(([id]) => familyOf(id)))];

// ── cons 資格：哪些（效果家族, 方向）「字面上就是代價」────────────────────────────────────
//  cons 的每一句都必須是玩家會讀成代價或風險的事，而且仍然要對應一列非 same 的效果。
//  只收「方向本身不利」的列；不收推論（站位靠前只說「站位更靠前」，不說因此更危險）。
//  刻意不收：站位靠後、輔助少離開下路、更早出手救人、先救誰、撤退比較早、投入門檻變高、更敢接戰、更願意參與。
export const CONS_ELIGIBLE = Object.freeze([
  [/^split$/, "differs", "帶線者多半不參加團戰 ⇒ 打團常常少一個人"],
  [/^retreat$/, "lower", "撤退比較晚"],
  [/^lane\.(top|mid|bot)$/, "higher", "站位更靠前"],
  [/^gank\.freq$/, "lower", "打野抓人變少"],
  [/^gank\.lean\.(top|mid|bot)$/, "lower", "抓人較少去這一路"],
  [/^join\.(fight|dragon|baron)$/, "lower", "較少參與團戰／龍／巴龍"],
  [/^support\.roam$/, "higher", "輔助更常離開下路"],
  [/^commit$/, "higher", "投入團戰的門檻比較低"],
  [/^engage$/, "lower", "不太主動接戰"],
]);
export const consEligible = (rowId, dir) => CONS_ELIGIBLE.some(([re, d]) => d === dir && re.test(/^lane\.|^gank\.lean\./.test(rowId) ? rowId : familyOf(rowId)));
/** 這張效果表裡有資格寫進 cons 的列：[[rowId, dir], …]。 */
export const consEligibleRows = (sheet) => mentionable(sheet).filter(([id, dir]) => consEligible(id, dir));
/** 一張表沒有任何代價列時，cons 只能是這一句（而且只有那時才允許）。 */
export const NO_CONS_SENTENCE = "這套打法沒有特別明顯的短處，但也不代表比較強。";

// ── 文案審查：句子 → 子句 → 效果主張 → 對照效果表 ─────────────────────────────────────────
//  規則（fix 4：逐「子句」，不是逐句）：desc／cons 以「。」切句、以「，；：」切子句，每個子句必須是下列之一——
//    (i)   詞彙內的主張，而且效果表的那一列（那幾列）方向相符、幅度帶相符；
//    (ii)  連接／條件子句（CONNECTIVE_CLAUSES，封閉清單，本身沒有內容）或階段範圍子句（「到了後期」）——
//          範圍子句不是放行：它決定後面的主張要查哪幾個階段，而且後面一定要有分階段的主張來接；
//    (iii) 結尾唯一的「適合…」句（suitsViolationsOf：只能講陣容／選手／默契／局面）。
//  其餘一律違規。主張的樣式全部是**整個子句錨定**（^…$）的封閉語法：子句裡多一個認不得的詞就不成立，
//  所以否定（不／沒／不太／較少）只會以詞彙內明列的說法出現（不太主動接戰、比較少離開下路、多半不參加團戰…）。
//  這是一張網，不是自然語言驗證器：它只認得這份詞彙，認不得的一律擋下。
const LANE_OF = { 上: "top", 中: "mid", 下: "bot" };
const LANES_RE = "((?:上、中、下)?三路|(?:[上中下]路?[、和與及])*[上中下]路)";
/** 路線清單 → 點到的**每一路**（「上、中、下三路」「上路和中路」「上、下路」）。 */
export function lanesOf(s) {
  if (s.includes("三路")) return [...LANES];
  return [...new Set([...s].filter((ch) => LANE_OF[ch]).map((ch) => LANE_OF[ch]))];
}
const ADV = "(?:也都|也|則|又|都|還|全部|同樣)?";
const Q = "(稍微|略為|略|稍稍|明顯|遠比平常|大幅)?";
const POST = "(一些|一點|很多)?";
const SLIGHT_WORD = /稍微|略|稍稍|一些|一點/, STRONG_WORD = /明顯|遠比平常|大幅|很多/;
const qOf = (...parts) => {
  const s = parts.filter(Boolean), sl = s.some((x) => SLIGHT_WORD.test(x)), st = s.some((x) => STRONG_WORD.test(x));
  return sl && st ? "conflict" : sl ? "slight" : st ? "strong" : "plain";
};
const HEDGE = "(多半|通常|常常|大多)?";

//  每條樣式：[正規式（錨定整個子句）, (match) => 原型主張清單]。原型主張 { fam | row, dir, q, … }；
//  fam 是分階段的效果家族（由階段範圍展開成列），row 是不分階段的列。
const P = (src, build) => [new RegExp(`^${src}$`), build];
const PATTERNS = [
  //  站位前後
  P(`${LANES_RE}(?:射手)?(?:的)?站位${ADV}(?:比平常)?${Q}(?:更)?(靠前|靠後|退後|往後退|往前推|推得比平常更前面|推得更前面)${POST}`,
    (m) => lanesOf(m[1]).map((l) => ({ row: `lane.${l}`, dir: /前/.test(m[3]) ? "higher" : "lower", q: qOf(m[2], m[4]) }))),
  //  抓人頻率與偏向
  P(`打野(?:出來)?抓人的次數${ADV}${Q}比平常(多|少)${POST}`, (m) => [{ row: "gank.freq", dir: m[2] === "多" ? "higher" : "lower", q: qOf(m[1], m[3]) }]),
  P(`打野(?:抓人)?${ADV}比平常更勤快(?:地出來抓人)?`, () => [{ row: "gank.freq", dir: "higher", q: "plain" }]),
  P(`(?:打野)?抓人${ADV}${Q}(?:比較|較)偏向${LANES_RE}`, (m) => lanesOf(m[2]).map((l) => ({ row: `gank.lean.${l}`, dir: "higher", q: qOf(m[1]) }))),
  P(`(?:打野)?抓人${ADV}${Q}(?:比較少|較少)偏向${LANES_RE}`, (m) => lanesOf(m[2]).map((l) => ({ row: `gank.lean.${l}`, dir: "lower", q: qOf(m[1]) }))),
  P(`(?:打野)?${ADV}${Q}(?:比較少|較少)去${LANES_RE}抓人`, (m) => lanesOf(m[2]).map((l) => ({ row: `gank.lean.${l}`, dir: "lower", q: qOf(m[1]) }))),
  //  開局入侵
  P(`開局(很可能|比較可能)(?:先)?往對方(?:的)?野區入侵`, (m) => [{ row: "invade.chance", dir: "higher", q: "plain", likely: m[1] === "很可能" }]),
  P(`中單也會跟著(?:上去|一起去)`, () => [{ row: "invade.mid", dir: "higher", q: "plain" }]),
  P(`(?:這)?只維持開局那一小段時間`, () => [{ row: "invade.chance", dir: "higher", q: "plain", scopeOnly: true }]),
  P(`開局${ADV}${Q}(?:更|比較)不會去?入侵`, (m) => [{ row: "invade.chance", dir: "lower", q: qOf(m[1]) }]),
  //  輔助
  P(`(?:隊友有危險時)?(?:輔助)?${ADV}優先救(射手|中單)`, (m) => [{ row: "support.target", dir: m[1] === "射手" ? "=adc" : "=mid", q: "plain" }]),
  P(`(?:隊友有危險時)?(?:輔助)?出手救人的時機${ADV}比(?:較|平常)早`, () => [{ row: "support.protectHp", dir: "higher", q: "plain" }]),
  P(`輔助${ADV}(?:比較常|更常)離開下路(?:去遊走)?`, () => [{ row: "support.roam", dir: "higher", q: "plain" }]),
  P(`輔助離開下路(?:去遊走)?的次數${ADV}${Q}比平常多${POST}`, (m) => [{ row: "support.roam", dir: "higher", q: qOf(m[1], m[2]) }]),
  P(`輔助${ADV}(?:比較少|更少)離開下路`, () => [{ row: "support.roam", dir: "lower", q: "plain" }]),
  P(`輔助(?:留|待)在下路的時間${ADV}${Q}比平常(?:長|久)${POST}`, (m) => [{ row: "support.roam", dir: "lower", q: qOf(m[1], m[2]) }]),
  //  參與度（分階段）
  P(`(?:隊伍)?${ADV}${Q}(?:比較|更)願意加入團戰`, (m) => [{ fam: "join.fight", dir: "higher", q: qOf(m[1]) }]),
  P(`(?:隊伍)?加入團戰的程度${ADV}(?:比平常)?${Q}高${POST}`, (m) => [{ fam: "join.fight", dir: "higher", q: qOf(m[1], m[2]) }]),
  P(`(?:隊伍)?${ADV}${Q}比較少加入團戰`, (m) => [{ fam: "join.fight", dir: "lower", q: qOf(m[1]) }]),
  P(`(?:隊伍)?對(龍和巴龍|巴龍|龍)的爭奪${ADV}(?:比平常)?${Q}(?:比平常)?(?:更|比較)願意參與`,
    (m) => (m[1] === "龍和巴龍" ? ["join.dragon", "join.baron"] : [m[1] === "龍" ? "join.dragon" : "join.baron"]).map((fam) => ({ fam, dir: "higher", q: qOf(m[2]) }))),
  P(`(?:隊伍)?對(龍和巴龍|巴龍|龍)的爭奪${ADV}${Q}比較少參與`,
    (m) => (m[1] === "龍和巴龍" ? ["join.dragon", "join.baron"] : [m[1] === "龍" ? "join.dragon" : "join.baron"]).map((fam) => ({ fam, dir: "lower", q: qOf(m[2]) }))),
  //  撤退與投入
  P(`(?:隊伍)?撤退的時機${ADV}${Q}(?:比平常|比較)${Q}(早|晚)${POST}`, (m) => [{ row: "retreat", dir: m[3] === "早" ? "higher" : "lower", q: qOf(m[1], m[2], m[4]) }]),
  P(`投入團戰的門檻${ADV}${Q}(?:比平常|比較)${Q}(低|高)${POST}`, (m) => [{ row: "commit", dir: m[3] === "低" ? "higher" : "lower", q: qOf(m[1], m[2], m[4]) }]),
  //  接戰傾向（分階段）
  P(`(?:隊伍)?${ADV}${Q}(?:比較|更)敢主動接戰`, (m) => [{ fam: "engage", dir: "higher", q: qOf(m[1]) }]),
  P(`(?:隊伍)?${ADV}${Q}(?:不太|比較不)主動接戰`, (m) => [{ fam: "engage", dir: "lower", q: qOf(m[1]) }]),
  P(`(?:隊伍)?接戰的傾向(?:大致)?(?:回到平常的水準|和平常差不多)`, () => [{ fam: "engage", dir: "same", q: "plain", needScope: true }]),
  //  帶線（機率：必須帶「多半／通常／常常」）
  P(`(上路|上單|中路|中單)${HEDGE}(?:會)?(?:單獨)?留在(?:自己的|中路)?線上(?:推進)?`, (m) => [{ row: "split", dir: /上/.test(m[1]) ? "=top" : "=mid", q: "plain", hedged: !!m[2], needHedge: true }]),
  P(`(?:團戰爆發時|打團時)?(?:帶線的人|上路|上單|中單)?${HEDGE}${ADV}不(?:過去)?參加團戰`, (m) => [{ row: "split", dir: "split", q: "plain", hedged: !!m[1], needHedge: true }]),
  P(`(?:團戰爆發時|打團時|打起來)?隊伍(?:就)?${HEDGE}(?:會)?少一個人`, (m) => [{ row: "split", dir: "split", q: "plain", hedged: !!m[1], needHedge: true }]),
  //  總括
  P(`只在少數地方和標準打法不同`, () => [{ row: "*", dir: "fewDiff", q: "plain" }]),
];
/** 連接／條件子句：封閉清單，本身沒有內容（它只是後面那個主張的條件）。 */
export const CONNECTIVE_CLAUSES = Object.freeze([/^隊友有危險時$/, /^團戰爆發時$/, /^打團時$/, /^和標準打法相比$/]);
const CONJ = /^(之後|另外|同時|此外|而且|並且)/;   // 子句開頭的連接詞（沒有內容；不收「所以／因此／但」這類帶推論或轉折的）
const NEGATORS = /沒有|並不|不太|不會|不|沒|未/g;

//  階段範圍：「前期」「前期和中期」「整場比賽」「到了後期」「前期之後」「進入中期之後」。
//   · 沒有「之後」 ⇒ 就是點到的那幾個階段
//   · 「X 之後」   ⇒ 嚴格在 X 之後的階段（前期之後＝中期、後期）
//   · 「進入／到了 X 之後」⇒ 從 X 起算（進入中期之後＝中期、後期）——讀者會把後期算進去，所以要連後期一起查
const SCOPE_RE = /^(到了|進入|在)?(整場比賽|整場|前期和中期|前、中期|中期和後期|中、後期|前期和後期|前期|中期|後期)(之後|以後)?(?:的時候|時)?/;
function scopeOf(clause) {
  const m = clause.match(SCOPE_RE);
  if (!m) return null;
  let ph = /整場/.test(m[2]) ? [...PHASES] : PHASES.filter((p) => m[2].includes({ early: "前", mid: "中", late: "後" }[p]));
  if (m[3]) {
    const idx = ph.map((p) => PHASES.indexOf(p));
    ph = m[1] ? PHASES.slice(Math.min(...idx)) : PHASES.slice(Math.max(...idx) + 1);
  }
  return { phases: ph, rest: clause.slice(m[0].length) };
}
const matchBody = (body) => { for (const [re, build] of PATTERNS) { const m = body.match(re); if (m) return build(m); } return null; };

/**
 * 一個句子 → 逐子句的分析：[{ text, kind, claims, problem }]。
 * kind：claim（主張）／connective（連接、條件）／scope（階段範圍）／unknown（認不得 ⇒ 違規）。
 * 主張 { row, dir, q, clause, … }；dir 為 higher／lower／same／fewDiff／split／=值。
 */
export function analyzeSentence(sentence) {
  const out = [];
  //  scope：範圍子句（「到了後期」）留給**下一個**分階段主張的階段；pending：還沒被接住的範圍子句；
  //  scoped：本段（到「；」或句尾為止）是否已經出現過階段詞——出現過之後，沒帶階段詞的分階段主張會有兩種讀法
  //  （沿用前面的階段／指整場），兩種讀法不一定都成立，所以一律要求它自己帶階段詞。
  let scope = null, pending = null, scoped = false;
  const flush = () => { if (pending) { pending.problem = "階段範圍後面沒有分階段的主張可以接"; pending.kind = "unknown"; } pending = null; scope = null; scoped = false; };
  for (const part of sentence.split(/(?<=[，；：。])/)) {
    const sep = /[，；：。]$/.test(part) ? part.slice(-1) : "";
    const text = part.replace(/[，；：。]$/, "").trim();
    if (!text) { if (sep === "；" || sep === "。") flush(); continue; }
    const rec = { text, kind: "unknown", claims: [], problem: null };
    out.push(rec);
    if (CONNECTIVE_CLAUSES.some((re) => re.test(text))) rec.kind = "connective";
    else {
      const body0 = text.replace(CONJ, "");
      const sc = scopeOf(body0);
      if (sc && sc.rest === "") {                     // 純階段範圍子句
        rec.kind = "scope";
        if (sc.phases.length === 0) { rec.kind = "unknown"; rec.problem = "這個階段範圍之後沒有任何階段"; }
        else { if (pending) { pending.problem = "階段範圍後面沒有分階段的主張可以接"; pending.kind = "unknown"; } scope = sc.phases; pending = rec; }
      } else {
        //  先試整個子句（「前期…」可能本來就是樣式的一部分），再試「階段範圍＋主張」
        let protos = matchBody(body0), own = null;
        if (!protos && sc) { protos = matchBody(sc.rest); own = sc.phases; }
        if (!protos) {
          const bare = (sc ? sc.rest : body0).replace(NEGATORS, "");
          rec.problem = bare !== (sc ? sc.rest : body0) && matchBody(bare) ? "否定了一個效果主張：否定句不等於相反方向，不在詞彙內" : "沒有對應效果列的子句";
        } else {
          rec.kind = "claim";
          if (own && own.length === 0) rec.problem = "這個階段範圍之後沒有任何階段";
          if (own && pending) { pending.problem = "階段範圍後面沒有分階段的主張可以接"; pending.kind = "unknown"; pending = null; scope = null; }
          const given = own ?? scope;   // 這個子句自己的階段詞，或緊接在前的範圍子句
          for (const pr of protos) {
            if (pr.fam) {
              if (pr.needScope && !given) rec.problem = "說「和平常差不多」必須指明是哪個階段";
              else if (!given && scoped) rec.problem = "同一段前面已經指明階段，這個分階段的主張要自己帶階段詞（否則不知道說的是哪個階段）";
              for (const p of given ?? PHASED[pr.fam]) rec.claims.push({ ...pr, row: `${pr.fam}.${p}`, clause: text });
            } else {
              if (own || pending) rec.problem = "這個效果沒有階段之分，不得掛階段詞";
              rec.claims.push({ ...pr, clause: text });
            }
          }
          if (protos.some((pr) => pr.fam) && given) { pending = null; scope = null; scoped = true; }
        }
      }
    }
    if (sep === "；" || sep === "。") flush();
  }
  flush();
  return out;
}
/** 一個句子 → 主張清單（攤平；給報告與對照用）。 */
export const claimsOf = (sentence) => analyzeSentence(sentence).flatMap((c) => c.claims);

/** 一個主張對照效果表 ⇒ 違規訊息或 null。 */
export function checkClaim(cl, sheet) {
  if (cl.q === "conflict") return `${cl.row} 同時用了輕微詞和強度詞`;
  if (cl.dir === "fewDiff") return mentionableFamilies(sheet).length <= 4 ? null : "說「只有少數地方不同」，但效果表有超過 4 個效果不同";
  const row = sheet[cl.row];
  if (!row) return `沒有這個效果列：${cl.row}`;
  if (cl.dir === "same") {
    if (row.dir !== "same") return `${cl.row} 主張 same，效果表是 ${row.dir}`;
    const fam = familyOf(cl.row);
    //  same 的階段列只在「同一個效果的其他階段不是 same」時才可以提（用來說偏向到哪裡為止）
    return Object.entries(sheet).some(([id, r]) => id !== cl.row && familyOf(id) === fam && r.dir !== "same") ? null : `${cl.row} 是 same，而且這個效果在其他階段也都是 same ⇒ 不得提到`;
  }
  if (cl.dir === "higher" || cl.dir === "lower") {
    if (row.dir !== cl.dir) return `${cl.row} 主張 ${cl.dir}，效果表是 ${row.dir}`;
    if (cl.likely && !(row.value >= 0.5)) return `${cl.row} 說「很可能」，但機率不到一半`;
    if (row.band === "binary") return cl.q === "plain" ? null : `${cl.row} 是兩段式旋鈕，不得帶幅度詞`;
    if (row.band === "slight") return cl.q === "slight" ? null : `${cl.row} 的幅度不到強度門檻，必須帶輕微詞（稍微／略／一些）`;
    return cl.q === "slight" ? `${cl.row} 的幅度已達強度門檻，不得說成輕微` : null;
  }
  if (cl.dir === "split" || cl.row === "split") {
    if (sheet.split.value === null) return "說帶線者留在線上／不參加團戰，但這份設定沒有帶線";
    if (cl.dir.startsWith("=") && sheet.split.value !== cl.dir.slice(1)) return `split 主張 ${cl.dir}，效果表是 ${sheet.split.value}`;
    const push = sheet["split.push"].value;
    if (cl.needHedge && push < 1 && !cl.hedged) return "帶線是機率（每 6 秒擲一次 splitPush），不得寫成絕對；要帶「多半／通常／常常」";
    if (cl.hedged && !(push >= 0.5)) return "說「多半」，但帶線機率不到一半";
    return null;
  }
  if (cl.dir.startsWith("=")) return row.value === cl.dir.slice(1) ? null : `${cl.row} 主張 ${cl.dir}，效果表是 ${row.value}`;
  return `未知主張 ${cl.dir}`;
}

/**
 * 引擎沒有的機制：這些說法無論旋鈕為何都是過度承諾。每條註明「缺哪個機制」（不是「我們曾經寫過這句」）。
 * 不放 /每次/、/坦克/ 這類不是機制的詞；要擋絕對語氣用最後一條有針對性的規則。
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
  [/必定|一定|絕對|永遠|百分之百|肯定|保證|必然/, "沒有任何旋鈕是確定性的（參戰、遊走、入侵、帶線都是機率或偏移）；絕對語氣必為假（「一定會」「一定能」都算）"],
]);

// ── 「適合…」句：使用情境建議 ──────────────────────────────────────────────────────────
//  只能描述「這套計畫適合什麼樣的陣容或局面」：陣容強弱、某個位置選手的能力、隊伍默契、對手風格是否明朗。
//  不得夾帶效果主張（單一子句，不得有逗號）、不得講結果或手段（想靠…／一波／結束比賽／贏）、不得有否定（「不確定」除外）。
const SUITS_FORM = /^適合[^，；：。]+(的時候|的隊伍|的陣容|的組合)。$/;
const SUITS_TOPIC = /陣容|射手|輔助|中單|上單|打野|隊員|選手|默契|配合|實力|風格/;
const SUITS_CLAIM_WORD = /站位|抓人|入侵|遊走|下路|救人|優先救|團戰|打團|龍|撤退|門檻|接戰|帶線|線上|參與|加入/;
const SUITS_OUTCOME = /贏|勝|結束|拿下|逆轉|收掉|擊殺|一波|直接|穩住|主導|壓制|想靠|想用|想要|想讓|想把|想先|打算|就能|可以|才能/;
//  「和平常比」的比較詞與頻率詞：適合句講的是陣容本身，不是這套打法相對於標準打法的效果
const SUITS_COMPARATIVE = /比平常|比較|更|稍微|略|多半|通常|常常|可能|次數|時機|程度|傾向|勤快|主動|願意|偏向/;
/** 一句「適合…」⇒ 違規清單。 */
export function suitsViolationsOf(sentence) {
  const out = [];
  if (!SUITS_FORM.test(sentence)) out.push("「適合…」必須是單一子句、以「的時候／的隊伍／的陣容／的組合」結尾（不得用逗號夾帶別的內容）");
  if (!SUITS_TOPIC.test(sentence)) out.push("「適合…」只能講陣容／選手／默契／對手風格");
  if (SUITS_CLAIM_WORD.test(sentence)) out.push(`「適合…」不得夾帶效果主張（${sentence.match(SUITS_CLAIM_WORD)[0]}）`);
  if (SUITS_OUTCOME.test(sentence)) out.push(`「適合…」不得講結果或手段（${sentence.match(SUITS_OUTCOME)[0]}）`);
  if (SUITS_COMPARATIVE.test(sentence)) out.push(`「適合…」不得用和平常比較的說法（${sentence.match(SUITS_COMPARATIVE)[0]}）`);
  if (/[,;:!?．.\s]/.test(sentence)) out.push("「適合…」不得用半形標點或空白夾帶別的內容");
  if (/不(?!確定)|沒|未/.test(sentence)) out.push("「適合…」不得有否定（「不確定」除外）");
  return out;
}

const sentencesOf = (text) => text.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean);
const tag = (msg, where) => `${msg}（「${where.length > 26 ? `${where.slice(0, 26)}…` : where}」）`;
/** 一個一般句子（不是「適合」句）對照效果表 ⇒ { violations, claims }。 */
function sentenceCheck(s, sheet) {
  const violations = [], claims = [];
  for (const c of analyzeSentence(s)) {
    if (c.problem) violations.push(tag(c.problem, c.text));
    else if (c.kind === "unknown") violations.push(tag("沒有對應效果列的子句", c.text));
    for (const cl of c.claims) { claims.push(cl); const v = checkClaim(cl, sheet); if (v) violations.push(tag(v, c.text)); }
  }
  if (claims.length === 0 && violations.length === 0) violations.push(tag("整句沒有任何效果主張", s));
  return { violations, claims };
}

/** 一段文字（任意幾句）對照效果表 ⇒ 違規清單（空陣列＝通過）。不看句子的位置；位置與 cons 資格由 templateCopyViolations 管。 */
export function copyViolationsOf(text, sheet) {
  const out = [];
  for (const [re, why] of IMPOSSIBLE) if (re.test(text)) out.push(`引擎沒有的機制：${why}`);
  for (const s of sentencesOf(text)) {
    if (/^適合/.test(s)) { out.push(...suitsViolationsOf(s).map((m) => tag(m, s))); continue; }
    if (s === NO_CONS_SENTENCE) { if (consEligibleRows(sheet).length > 0) out.push(tag("說沒有明顯短處，但效果表有代價列", s)); continue; }
    out.push(...sentenceCheck(s, sheet).violations);
  }
  return out;
}

/**
 * 一個模板的 desc＋cons 對照效果表 ⇒ 違規清單（空陣列＝通過）。在 copyViolationsOf 之上再加：
 *   · 「適合…」只能是 desc 的最後一句、最多一句、不得出現在 cons；
 *   · cons 的每一句至少有一個主張，而且每個主張都落在 CONS_ELIGIBLE（字面上就是代價）；
 *   · 效果表沒有任何代價列 ⇒ cons 只能是 NO_CONS_SENTENCE；有代價列 ⇒ 不得用那一句。
 */
export function templateCopyViolations({ desc, cons }, sheet) {
  const out = [...copyViolationsOf(desc, sheet).map((m) => `desc：${m}`), ...copyViolationsOf(cons, sheet).map((m) => `cons：${m}`)];
  const ds = sentencesOf(desc), cs = sentencesOf(cons);
  const suitsAt = ds.map((s, i) => (/^適合/.test(s) ? i : -1)).filter((i) => i >= 0);
  if (suitsAt.length > 1) out.push("desc：「適合…」最多一句");
  if (suitsAt.some((i) => i !== ds.length - 1)) out.push("desc：「適合…」只能是最後一句");
  if (ds.includes(NO_CONS_SENTENCE)) out.push("desc：「沒有明顯短處」那一句只能出現在 cons");
  if (cs.some((s) => /^適合/.test(s))) out.push("cons：不得有「適合…」句");
  const eligibleN = consEligibleRows(sheet).length;
  if (eligibleN === 0) { if (cons !== NO_CONS_SENTENCE) out.push(`cons：這個模板沒有任何代價列，cons 只能是「${NO_CONS_SENTENCE}」`); return out; }
  for (const s of cs) {
    if (/^適合/.test(s)) continue;
    if (s === NO_CONS_SENTENCE) { out.push("cons：有代價列的模板不得說沒有明顯短處"); continue; }
    for (const cl of sentenceCheck(s, sheet).claims) {
      const dir = cl.dir === "split" || cl.row === "split" ? "differs" : cl.dir;
      if (!consEligible(cl.row, dir)) out.push(tag(`cons：${cl.row}:${cl.dir} 不是代價（cons 只能寫字面上不利的效果）`, cl.clause));
    }
  }
  return out;
}

/** 印成一行一列的文字（給報告用）。 */
export function formatSheet(sheet) {
  const f = (x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x);
  return Object.entries(sheet).filter(([id]) => id !== "split.push").map(([id, r]) => `${id}=${f(r.value)}(${f(r.neutral)})${r.dir === "same" ? "" : ` ${r.dir}${r.band && r.band !== "binary" ? `/${r.band}` : ""}`}`).join("; ");
}
