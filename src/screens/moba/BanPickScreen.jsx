// ============================================================================
//  screens/moba/BanPickScreen.jsx — Legacy DraftModule 完整恢復（Sprint18【A】）
//  Presentation：逐字對齊 Legacy DraftModule（line 7147–7348）——
//    14 步輪選 SEQ（4 ban → 10 pick 蛇形）、狀態 badge、當前行動條、
//    禁用區（各2格 32px 灰階）、已選英雄（各5格 40px ARCH_COLOR 邊框）、
//    選擇器（定位tab/5列網格/ⓘ鈕）、選角動態 log、✓ 完成 1200ms 後 onComplete。
//  AI：Legacy analyzeChamp + archCounterScore 逐字移植；ban 60%、pick 50% counter。
//  Adapter：英雄唯一來源 heroDatabase；onComplete({picks,bans}) 交 AppShell（不建 Store）；
//    ⓘ 開 HeroCodexDetail。Sprint20：ChampFace 已接回 Legacy HERO_IMG 真實英雄圖
//    （經 heroDatabase.heroImage()），缺圖才退回程序化色塊。
// ============================================================================
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { selectOpponentName, selectTeamName } from "../../platform/matchTeamNames.js";
import { seatPlayers as seatPlayersOf, SEAT_CODE } from "../../platform/contracts/matchLineup.js";
import { heroTags } from "../../data/heroClassification.js";
import { assignDraft, assignmentToHeroIds } from "../../battle/moba/mobaDraftAssignment.js";
import { buildLoadout, SUMMONER_SPELLS } from "../../battle/moba/mobaHeroLoadout.js";

/** assignment → buildLoadout 需要的 `{seat:{heroId}}` 形狀。 */
const assignmentToRoster = (a = {}) =>
  Object.fromEntries(Object.entries(a).map(([seat, v]) => [seat, { heroId: v.heroId }]));

/**
 * Milestone I：出戰配置面板。
 * 明確顯示「哪位選手、去哪一路、開哪隻英雄、適性多少、有沒有衝突、帶什麼技能」。
 * 全部來自 assignDraft / buildLoadout 的計算結果，不編造。
 */
/**
 * J-close：出戰配置摘要。
 *
 * 兩個改動的理由（Ray 回報「選完角色只閃現不到 1 秒」）：
 *  1. 這個面板現在**從一開始就在**，而且排在選角格之上——舊版排在 260px 高的
 *     選角捲動格**下面**，輪到你選人時它根本被推出畫面外，等於選的時候看不到
 *     自己會被排到哪一路。
 *  2. 尚未選的席位顯示「等待選角」，不是整塊消失，玩家才知道還缺幾個。
 *
 * Hotfix2：**移除「被壓制」欄**（J-close 加的克制關係顯示）。
 *  Ray 的判斷是：選角當下真正要決策的是「這一路誰去、適不適合、有沒有衝突、
 *  五路補齊了沒」，克制相性是另一個層級的資訊，混在同一列只會稀釋前四項。
 *  底層 `archCounterScore` **沒有刪**（AI 選角仍在用，仍是 export 的純函式），
 *  只是不再有任何 Ban/Pick UI 去呈現它的結果。
 *  未來要做對位資訊，建議另開 Hero Codex 的「對位」頁籤，見
 *  `docs/handoff/08_目前待辦與風險.md` 的 Hotfix2 一節。
 */
function DraftPlanPanel({ plan, loadout, open, onToggle, needs, laneByHero = {}, picks = [] }) {
  const rows = Object.entries(plan.assignment);
  const filled = rows.filter(([, a]) => a.hero).length;
  const warn = plan.conflicts.length;
  return (
    <div data-testid="draft-plan" data-filled={filled} data-open={open ? "1" : "0"}
      style={{ background: GC2.card, borderRadius: 10, marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
      {/*  ── Hotfix1：預設收合的一行摘要 ────────────────────────────────────
          J-close 把這塊常駐展開放在選角格**之上**，五列 ＋ 衝突說明約 150px，
          加上禁用區與已選英雄區，把「選擇你的英雄」推到 390×844 的 66% 位置，
          英雄格幾乎全在摺線下 ⇒ 選不完角、進不了戰鬥（Ray 回報的阻斷問題）。
          現在預設只佔一行；詳細內容按需展開，資料一筆都沒有拿掉。 */}
      <button data-testid="draft-plan-toggle" aria-expanded={open} onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
          padding: "8px 11px", cursor: "pointer", textAlign: "left", color: "inherit" }}>
        <span style={{ color: "#cbd5e1", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>出戰配置 {filled}/5</span>
        {/*  收合時把最關鍵的兩件事留在這一行：還缺哪幾路、有沒有衝突。 */}
        <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: GC2.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {needs?.need?.length ? `尚缺 ${needs.need.join("·")}` : filled === 5 ? "五路到齊" : ""}
        </span>
        <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: warn ? WARN : GC2.gray }}>
          {warn ? `${WARN_ICON} ${warn}` : filled === 5 ? "無衝突" : ""}
        </span>
        <span style={{ flexShrink: 0, color: "#52525b", fontSize: 10 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
      <div style={{ padding: "0 11px 9px" }}>
      {rows.map(([seat, a]) => {
        const sp = loadout[seat]?.spells ?? [];
        const fitColor = a.heroFit >= 1 ? GC2.green : a.heroFit >= 0.5 ? "#fbbf24" : GC2.red;
        return (
          <div key={seat} data-testid="draft-plan-row" data-seat={seat} data-lane={a.lane}
            data-hero={a.heroId ?? ""} data-spells={sp.join(",")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ width: 30, color: GC2.gray, fontSize: 9, fontWeight: 800 }}>{a.lane}</span>
            <span style={{ width: 54, color: "#e5e7eb", fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.player?.name ?? seat.toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: a.hero ? "#fff" : "#52525b", fontSize: 10.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.hero?.zh ?? "等待選角"}
            </span>
            {/*  Hotfix2：原本這裡有一欄「⚠被 XXX」（被壓制風險）。已整欄移除，
                理由與底層資料的去向見本檔 DraftPlanPanel 上方註解。 */}
            <span title={`英雄位置適性 ${Math.round(a.heroFit * 100)}%／選手位置熟練 ${Math.round(a.playerFit * 100)}%`}
              style={{ color: a.hero ? fitColor : "#3f3f46", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
              適性 {a.hero ? `${Math.round(a.heroFit * 100)}%` : "—"}
            </span>
            <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              {sp.map((id) => (
                <span key={id} title={SUMMONER_SPELLS[id]?.zh}
                  style={{ fontSize: 10 }}>
                  {SUMMONER_SPELLS[id]?.icon ?? "?"}
                </span>
              ))}
            </span>
          </div>
        );
      })}
      {plan.conflicts.map((c) => (
        <div key={c.seat} style={{ color: WARN, fontSize: 9, marginTop: 3 }}>{WARN_ICON} {c.lane}：{c.note}</div>
      ))}
      {/*  Hotfix1：低適性／衝突的逐項說明從「已選英雄」區搬進來（按需展開）。
          資料完全相同，只是不再常駐佔用選角當下的垂直空間。 */}
      {picks.some((c) => laneByHero[c.id]?.lowFit || laneByHero[c.id]?.conflict) && (
        <div data-testid="pick-warnings" style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
          {picks.map((c) => {
            const at = laneByHero[c.id];
            if (!at || (!at.lowFit && !at.conflict)) return null;
            return (
              <span key={c.id} style={{ color: WARN, fontSize: 8.5, lineHeight: 1.4 }}>
                {WARN_ICON} {c.zh} → {at.lane}{at.lowFit ? "：適性低" : ""}{at.conflict ? `：${at.conflict}` : ""}
              </span>
            );
          })}
        </div>
      )}
      {/*  陣容需求完整版（收合時只在標題列顯示「尚缺 …」）。 */}
      <div style={{ marginTop: 5, fontSize: 9, color: GC2.gray }}>
        已有 {needs?.have?.join("·") || "—"}　｜
        <span style={{ color: needs?.need?.length ? WARN : GC2.green }}>
          {needs?.need?.length ? `尚缺 ${needs.need.join("·")}` : "五路到齊"}
        </span>
      </div>
      </div>
      )}
    </div>
  );
}
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import HeroCodexDetail from "./HeroCodexDetail.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";

const GC2 = { bg: "#0a0b0f", card: "#13151c", card2: "#1a1d26", gray: "#71717a", gold: "#fbbf24", green: "#34d399", red: "#ef4444", blue: "#3b82f6", purp: "#a78bfa" };
const ARCH_COLOR = { 坦克: "#60a5fa", 戰士: "#f97316", 刺客: "#ef4444", 法師: "#a855f7", 射手: "#22c55e", 輔助: "#14b8a6" };
//  Hotfix1 視覺整理：警告只有**一種**顏色與**一個**圖示。
//  先前同一頁上「非本位」「被壓制」「衝突」各自用了 #fbbf24 / #fb7185 / #ef4444
//  三種紅黃，玩家分不出哪個比較嚴重——其實它們都只是「提醒」，不是錯誤。
const WARN = "#e0a458";        // 低飽和琥珀；取代原本的 #fbbf24 / #fb7185
const WARN_ICON = "⚠";
//  定位色降飽和後用於小面積標示（頭像邊框、標籤底），避免整頁像調色盤。
//  原色仍保留給英雄卡本身，這裡只影響輔助性標示。
const ARCH_DIM = {
  坦克: "#4a7bb0", 戰士: "#b06a3a", 刺客: "#a85050", 法師: "#7a5aa8", 射手: "#3f8a52", 輔助: "#2f7a72",
};

// ════ Legacy 英雄特性分析（技能類型碼 D/C/B/M/O + 描述關鍵字）— 逐字移植 ════
function analyzeChamp(champ) {
  const skills = ["P", "Q", "W", "E", "R"].map((k) => champ.skills?.[k]).filter(Boolean);
  const types = skills.map((s) => (s.tier || "").trim());
  const allDesc = skills.map((s) => s.desc || "").join(" ");
  const cnt = (t) => types.filter((x) => x === t).length;
  const has = (kw) => allDesc.includes(kw);
  const tags = new Set();
  if (cnt("C") >= 2) tags.add("控制");
  if (cnt("D") >= 3 || champ.arch === "刺客") tags.add("爆發");
  if (cnt("M") >= 1 || has("衝") || has("突進") || has("閃") || has("位移") || has("躍")) tags.add("機動");
  if (has("護盾") || has("減傷") || has("格擋") || champ.arch === "坦克") tags.add("肉盾");
  if (has("真實傷害") || has("最大生命") || has("百分比")) tags.add("真傷");
  if (has("免疫") || has("霸體") || has("淨化") || has("不可被") || has("解除控制")) tags.add("免控");
  if (champ.arch === "射手" || champ.arch === "法師") tags.add("遠程");
  if (champ.arch === "戰士" || (champ.lane === "上路" && champ.diff <= 2)) tags.add("強壓");
  if (champ.arch === "射手") tags.add("需發育");
  if (champ.arch === "射手" || champ.arch === "法師") tags.add("後排核心");
  return tags;
}

// ════ Legacy 克制規則（7 條）— 逐字移植 ════
export function archCounterScore(a, b) {
  const ta = analyzeChamp(a), tb = analyzeChamp(b);
  const h = (s, v) => s.has(v);
  let score = 0;
  if (h(ta, "免控") && h(tb, "控制")) score += 3;
  if ((h(ta, "真傷") || h(ta, "爆發")) && h(tb, "肉盾")) score += 2;
  if (h(ta, "機動") && h(ta, "爆發") && h(tb, "後排核心") && !h(tb, "機動")) score += 3;
  if (h(ta, "控制") && (h(tb, "機動") || h(tb, "爆發")) && !h(tb, "免控")) score += 2;
  if (h(ta, "肉盾") && h(tb, "爆發") && !h(tb, "真傷")) score += 2;
  if (h(ta, "強壓") && h(tb, "需發育")) score += 2;
  if (h(ta, "遠程") && h(ta, "機動") && h(tb, "強壓") && !h(tb, "機動")) score += 1;
  return score;
}

// Legacy SEQ：14 步輪選（4 ban → 10 pick 蛇形）
const SEQ = [
  { team: "blue", act: "ban" }, { team: "red", act: "ban" }, { team: "blue", act: "ban" }, { team: "red", act: "ban" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" }, { team: "red", act: "pick" }, { team: "blue", act: "pick" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" }, { team: "red", act: "pick" }, { team: "blue", act: "pick" },
  { team: "blue", act: "pick" }, { team: "red", act: "pick" },
];

// ════ ChampFace — Legacy HERO_IMG 英雄圖（Sprint20 B 接回）════
//  圖片一律經 heroDatabase.heroImage()（HeroPortrait 內部呼叫）；
//  缺圖 / 載入失敗 → 退回 Sprint18 的程序化色塊頭像（不得破圖）。
export function ChampFace({ champ, size = 44 }) {
  const c = champ;
  const accent = c.color || "#8aa0b8";
  let h = 0;
  for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) & 0xffffff;
  const hue = h % 360;
  const swatch = (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1.5px solid ${accent}`, background: `linear-gradient(135deg, hsl(${hue},45%,32%), #0a0a10)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: size * 0.42, fontWeight: 900, color: "rgba(255,255,255,0.88)" }}>{c.zh.slice(0, 1)}</span>
    </div>
  );
  return <HeroPortrait heroId={c.id} size={size} radius="50%" border={`1.5px solid ${accent}`} alt={c.zh} fallback={swatch} />;
}

export default function BanPickScreen({ onNext, onBack, onCodex, onComplete }) {
  //  ── Milestone I：選手／英雄／五路的自動分配 ─────────────────────────────
  //    舊版是「picks[i] → 席位 b(i+1)」的順序硬對位：選到兩隻中路照樣塞，
  //    玩家看不出衝突。現在改用可解釋評分 + 窮舉最佳解（5! = 120 種，決定性）。
  const storePlayers = useProfileStore((s) => s.players);
  const storeLineup = useProfileStore((s) => s.lineup);
  //  Club Assets v1：能力來源不只發展樹（戰術教練也會解鎖情報面板）⇒
  //  一律讀合併權威，不要自己再合併一次。
  const developmentEffects = useProfileStore((s) => s.clubCapabilities()).total;
  //  Q3.5-fix：選角階段要指名道姓——玩家從賽事頁看到的是「某某戰隊」，
  //  進來卻只寫「對手」，中間斷了一截。名字來自本場指派單（唯一來源見
  //  `platform/matchTeamNames.js`），沒有場次就退回中性的「對手／我方」。
  const oppName = useProfileStore(selectOpponentName);
  const teamName = useProfileStore(selectTeamName);
  const sideLabel = (side) => (side === "blue" ? (teamName ?? "我方") : (oppName ?? "對手"));
  const [step, setStep] = useState(0);
  const [bans, setBans] = useState({ blue: [], red: [] });
  const [picks, setPicks] = useState({ blue: [], red: [] });
  const [log, setLog] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickFilter, setPickFilter] = useState("全部");
  //  Hotfix2：關鍵字搜尋。英雄池 100 隻 ＝ 20 列，只靠定位頁籤最少也還有 3–4 列；
  //    想拿特定一隻仍得一路滑。搜尋是把「找特定英雄」從捲動問題變成輸入問題。
  const [pickQuery, setPickQuery] = useState("");
  const [detailId, setDetailId] = useState(null);
  //  Hotfix1：出戰配置與陣容細節**預設收合**。阻斷問題的主因就是垂直空間被吃光，
  //    而這兩塊在選角當下並不需要一直攤開。收合只影響呈現，資料一筆都沒少。
  const [planOpen, setPlanOpen] = useState(false);
  //  Hotfix2：英雄格捲到底了沒（決定要不要畫底部漸層提示）。純呈現狀態。
  const [gridAtEnd, setGridAtEnd] = useState(true);
  const usedRef = useRef(new Set());
  const gridRef = useRef(null);
  //  Hotfix2：分辨「點選」與「滑動」。手指在英雄卡上往下滑要捲動，不可以選到英雄。
  //    瀏覽器在捲動後本來就會抑制 click，但那是各家實作；這裡自己記一份手勢狀態，
  //    行為才可被驗收腳本重現（見 tools/shot_banpick_hotfix2.mjs §5）。
  const dragRef = useRef({ y: 0, moved: false });
  const suppressTapRef = useRef(false);

  //  席位 → 實際上場選手（沿用 Milestone E 的先發指派，不另建一套）
  const seatPlayers = useMemo(() => seatPlayersOf(storeLineup, storePlayers ?? []), [storeLineup, storePlayers]);
  //  每次我方選角變動就重算分配 ⇒ 面板隨時反映「目前這批英雄會怎麼排」
  const draftPlan = useMemo(
    () => assignDraft({ picks: picks.blue, seatPlayers, tagsOf: heroTags }),
    [picks.blue, seatPlayers],
  );
  const planLoadout = useMemo(
    () => buildLoadout(assignmentToRoster(draftPlan.assignment), heroById),
    [draftPlan],
  );
  /**
   * J-close 追加：英雄 → 它被分到哪一路。
   *
   * ⚠ 關鍵約束（Ray 明講）：頭像上的位置標示與下方摘要**必須用同一份
   * assignment**，不可以各自判定一次——兩套判定遲早會不一致，而且不一致時
   * 玩家不知道該信哪一個。所以這裡就是把 `draftPlan.assignment` 轉成
   * 「heroId → { code, fit, conflict }」的索引，沒有第二次計算。
   */
  const laneByHero = useMemo(() => {
    const conflictBySeat = Object.fromEntries(draftPlan.conflicts.map((c) => [c.seat, c.note]));
    const out = {};
    for (const [seat, a] of Object.entries(draftPlan.assignment)) {
      if (!a.heroId) continue;
      out[a.heroId] = {
        code: SEAT_CODE[seat] ?? seat.toUpperCase(),
        lane: a.lane,
        fit: a.heroFit,
        lowFit: a.heroFit < 0.5,          // 不擅長（heroLaneFit 的 0.15 檔）
        offRole: a.heroFit < 1,           // 非本位但可勝任（0.55 檔）
        conflict: conflictBySeat[seat] ?? null,
      };
    }
    return out;
  }, [draftPlan]);

  /**
   * 陣容需求：已有哪幾路、還缺哪幾路（同一份 assignment 推導）。
   * 顯示用中文路名；英文碼另存一份供驗收腳本比對，不進畫面。
   */
  const compNeeds = useMemo(() => {
    const have = [], need = [], haveCode = [], needCode = [];
    for (const [seat, a] of Object.entries(draftPlan.assignment)) {
      (a.heroId ? have : need).push(a.lane);
      (a.heroId ? haveCode : needCode).push(SEAT_CODE[seat] ?? seat.toUpperCase());
    }
    return { have, need, haveCode, needCode };
  }, [draftPlan]);

  const cur = step < SEQ.length ? SEQ[step] : null;
  const done = step >= SEQ.length;
  const isMyTurn = cur && cur.team === "blue";
  const opponentReport = useMemo(() => {
    const picksByArchetype = picks.red.reduce((counts, champ) => {
      counts[champ.arch] = (counts[champ.arch] ?? 0) + 1;
      return counts;
    }, {});
    const tags = [...new Set(picks.red.flatMap((champ) => [...analyzeChamp(champ)]))];
    return {
      picks: picks.red,
      bans: bans.red,
      archetypes: Object.entries(picksByArchetype).sort((a, b) => b[1] - a[1]),
      tags,
    };
  }, [bans.red, picks.red]);
  const pool = CHAMPIONS_100.filter((c) => !usedRef.current.has(c.id));
  //  Hotfix2：畫面上實際列出的英雄 ＝ 定位頁籤 ∩ 關鍵字。
  //    關鍵字比對中文名、英文名、id、稱號與預設路線——玩家記得哪個就打哪個。
  const query = pickQuery.trim().toLowerCase();
  const shownPool = pool.filter((c) =>
    (pickFilter === "全部" || c.arch === pickFilter)
    && (!query
      || c.zh.includes(query)
      || (c.en ?? "").toLowerCase().includes(query)
      || c.id.includes(query)
      || (c.title ?? "").includes(query)
      || (c.lane ?? "").includes(query)));

  // Legacy AI：ban 60% 針對性 / pick 50% counter — 逐字移植
  const aiPick = (team, action) => {
    const p = pool;
    if (p.length === 0) return null;
    const enemyPicks = picks.blue;
    if (action === "ban") {
      if (Math.random() < 0.6 && enemyPicks.length > 0) {
        const scored = p.map((c) => ({ c, s: picks.red.reduce((sum, rc) => sum + archCounterScore(c, rc), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        if (scored.length > 0) return scored[Math.floor(Math.random() * Math.min(3, scored.length))].c;
      }
      return p[Math.floor(Math.random() * Math.min(12, p.length))];
    } else {
      if (Math.random() < 0.5 && enemyPicks.length > 0) {
        const scored = p.map((c) => ({ c, s: enemyPicks.reduce((sum, bc) => sum + archCounterScore(c, bc), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        if (scored.length > 0) return scored[Math.floor(Math.random() * Math.min(3, scored.length))].c;
      }
      return p[Math.floor(Math.random() * Math.min(8, p.length))];
    }
  };

  //  ── Hotfix2：英雄格的手勢與捲動 ────────────────────────────────────────
  //    捲動區只有一個（英雄格本身）。這裡三件事：
  //      1. 記住這次手勢有沒有位移 ⇒ 滑動不會誤選英雄。
  //      2. 捲到底就把底部漸層提示收掉 ⇒ 提示只在「還有東西沒看到」時出現。
  //      3. 換篩選／換關鍵字／輪到下一次選人 ⇒ 回到第一列。
  const syncGridEdge = () => {
    const el = gridRef.current;
    if (!el) return;
    setGridAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight <= 4);
  };
  const onGridPointerDown = (e) => { dragRef.current = { y: e.clientY, moved: false }; suppressTapRef.current = false; };
  const onGridPointerMove = (e) => { if (Math.abs(e.clientY - dragRef.current.y) > 8) dragRef.current.moved = true; };
  const onGridPointerUp = () => { suppressTapRef.current = dragRef.current.moved; };
  const onGridScroll = () => { dragRef.current.moved = true; syncGridEdge(); };
  /** 這一次 click 是真的點擊，還是一段捲動手勢的尾巴？ */
  const isRealTap = () => {
    if (!suppressTapRef.current) return true;
    suppressTapRef.current = false;
    return false;
  };

  useEffect(() => {
    const el = gridRef.current;
    if (el) el.scrollTop = 0;
    syncGridEdge();
  }, [pickFilter, pickQuery, step, showPicker]);

  const playerChoose = (champ) => {
    if (!isMyTurn) return;
    usedRef.current.add(champ.id);
    if (cur.act === "ban") { setBans((b) => ({ ...b, blue: [...b.blue, champ] })); setLog((l) => [`🔵 你 禁用 ${champ.zh}`, ...l].slice(0, 8)); }
    else { setPicks((p) => ({ ...p, blue: [...p.blue, champ] })); setLog((l) => [`🔵 你 選擇 ${champ.zh}（${champ.arch}）`, ...l].slice(0, 8)); }
    setShowPicker(false);
    setStep((s) => s + 1);
  };

  //  Milestone I：把分配結果與召喚師技能一併往下傳（純附加欄位；
  //    下游沒有讀 assignment 的舊路徑仍可用 picks 的順序對位）。
  const confirmDraft = () => {
    const payload = {
      picks, bans,
      assignment: { blue: assignmentToHeroIds(draftPlan.assignment) },
      loadout: { blue: planLoadout },
    };
    if (onComplete) onComplete(payload);
    if (onNext) onNext(payload);
  };

  useEffect(() => {
    //  J-close：選角完成後**不再自動跳頁**。舊版是 1.2 秒的 setTimeout，
    //    最終分路結果只閃現不到一秒就換到戰術頁（Ray 的原話）。
    //    現在停在這裡，由玩家自己按「確認出戰配置」——要看多久看多久。
    if (done) return;
    if (isMyTurn) { setShowPicker(true); return; }
    const t = setTimeout(() => {
      const champ = aiPick(cur.team, cur.act);
      if (!champ) { setStep((s) => s + 1); return; }
      usedRef.current.add(champ.id);
      //  Hotfix2：對手選角的播報原本會附「（克制你的 XXX）」。那是 Ban/Pick 裡
      //    另一處克制關係顯示，本輪一併移除；AI 的選角行為（aiPick）一行未動，
      //    這裡也沒有動到任何隨機抽樣，所以同 seed 的選角結果不變。
      //  Q3.5-fix：播報要指名對手。本 effect 的 deps 只有 [step]，所以**不能**
      //    用外層閉包的 oppName（會是舊值）——這裡當場向 Store 讀一次。
      const opp = selectOpponentName(useProfileStore.getState()) ?? "對手";
      if (cur.act === "ban") { setBans((b) => ({ ...b, red: [...b.red, champ] })); setLog((l) => [`🔴 ${opp} 禁用 ${champ.zh}`, ...l].slice(0, 8)); }
      else { setPicks((p) => ({ ...p, red: [...p.red, champ] })); setLog((l) => [`🔴 ${opp} 選擇 ${champ.zh}`, ...l].slice(0, 8)); }
      setStep((s) => s + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [step]);

  return (
    /*  ── Hotfix2：整頁改成「固定框 ＋ 一個捲動區」 ────────────────────────────
        根因（量出來的，不是猜的）：AppShell 的外框是
        `height: min(88vh,760px); overflow: hidden` 的**固定高度盒**，而本畫面的根
        元素只寫了 `minHeight:100%` 沒有 `height:100%` ⇒ 它會長到內容那麼高
        （390×844 實測 2015px），自己的 `overflow:auto` 因此永遠不會生效，
        超出 743px 的部分**被外框直接裁掉且沒有任何祖先能捲**。
        實測：英雄格 top 314、bottom 1928，最後一張卡在 y=1853；
        `window.scrollBy`、`scrollingElement.scrollTop`、單指觸控拖曳三種方式
        都動不了它一格 ⇒ 第六列以後的英雄看得到規則、選不到人。

        Hotfix1 把英雄格的 `maxHeight:260` 巢狀捲動拿掉時，假設「整頁是單一捲動軸」
        ——但這一頁**當時根本沒有任何捲動軸**，所以拿掉之後從「難捲」變成「不能捲」。

        修法不是把頁面拉高，也不是把上方面板砍掉，而是讓根元素真的被高度框住
        （`height:100%` ＋ flex column），把捲動責任交給一個**明確的**捲動區。 */
    <div style={{
      height: "100%", boxSizing: "border-box", background: GC2.bg, fontFamily: "system-ui",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        maxWidth: 460, width: "100%", margin: "0 auto", flex: 1, minHeight: 0, boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        //  最後一列不能被 home indicator／瀏覽器工具列蓋住 ⇒ 底部留安全區。
        padding: "12px 12px calc(env(safe-area-inset-bottom, 0px) + 10px)",
      }}>
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: GC2.gray, fontSize: 14, cursor: "pointer", padding: 0, flexShrink: 0 }}>←</button>}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>選角階段</h2>
              {/*  Q3.5-fix：對手是誰要**全程看得到**，不能只在「換對手行動」時才出現
                   ——玩家從賽事頁一路走過來，這裡斷名字就等於斷了脈絡。
                   長隊名以 ellipsis 收掉，不把右側的圖鑑／狀態擠出畫面。 */}
              {oppName && (
                <div style={{ color: GC2.gray, fontSize: 10.5, fontWeight: 700, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  vs <span style={{ color: GC2.red }}>{oppName}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {onCodex && <button onClick={onCodex} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "4px 10px", color: "#e5e7eb", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📖 圖鑑</button>}
            <span style={{ background: done ? "rgba(52,211,153,0.15)" : isMyTurn ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)", color: done ? GC2.green : isMyTurn ? GC2.blue : GC2.red, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px" }}>{done ? "完成" : isMyTurn ? "輪到你" : "對手選擇中…"}</span>
          </div>
        </div>

        {cur && <div style={{ flexShrink: 0, background: GC2.card, borderRadius: 10, padding: "10px 14px", marginBottom: 12, borderLeft: `3px solid ${cur.team === "blue" ? GC2.blue : GC2.red}` }}><span style={{ color: cur.team === "blue" ? GC2.blue : GC2.red, fontSize: 12, fontWeight: 700 }}>{cur.team === "blue" ? `🔵 ${sideLabel("blue")}` : `🔴 ${sideLabel("red")}`}</span><span style={{ color: "white", fontSize: 11, marginLeft: 8 }}>{cur.act === "ban" ? "禁用英雄" : "選擇英雄"}{isMyTurn ? " — 點下方選擇" : ""}</span></div>}

        {/*  ── Hotfix1：禁用與已選英雄合併成一個精簡區塊 ────────────────────
            原本是兩個獨立段落（各有標題列與雙欄小標），加上警告清單約 260px。
            這裡壓成「一行標題 ＋ 一列頭像」×2，警告清單移進出戰配置的展開區，
            省下的垂直空間直接還給下方的英雄選擇格。資料一筆都沒有拿掉。 */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ color: GC2.gray, fontSize: 10, fontWeight: 700 }}>已選英雄</span>
            <span data-testid="comp-needs" data-have={compNeeds.haveCode.join(",")} data-need={compNeeds.needCode.join(",")}
              style={{ fontSize: 9, fontWeight: 700, color: compNeeds.need.length ? WARN : GC2.green }}>
              {compNeeds.need.length ? `尚缺 ${compNeeds.need.join("·")}` : "五路到齊"}
            </span>
          </div>
          {["blue", "red"].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 26, flexShrink: 0, color: t === "blue" ? GC2.blue : "#c2703f", fontSize: 9, fontWeight: 800 }}>
                {t === "blue" ? "我方" : "對手"}
              </span>
              <div style={{ display: "flex", gap: 3, flex: 1, minWidth: 0 }}>
                {picks[t].map((c) => {
                  //  只有我方才有分路資料（assignment 只算我方）。對手不標，
                  //  不是留白偷懶——我們本來就不知道對手怎麼分路，標了就是編造。
                  const at = t === "blue" ? (laneByHero[c.id] ?? null) : null;
                  const warn = at && (at.conflict || at.lowFit);
                  return (
                    <button key={c.id} onClick={() => setDetailId(c.id)}
                      data-testid={t === "blue" ? "pick-avatar" : undefined}
                      data-hero={c.id} data-code={at?.code ?? ""} data-lane={at?.lane ?? ""} data-lowfit={at?.lowFit ? "1" : "0"}
                      title={at ? `${at.lane}（適性 ${Math.round(at.fit * 100)}%）${at.conflict ? `／${at.conflict}` : ""}` : undefined}
                      style={{ position: "relative", width: 34, height: t === "blue" ? 45 : 34, borderRadius: 8, padding: 0, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", border: `1px solid ${ARCH_DIM[c.arch] ?? "rgba(255,255,255,0.18)"}`, boxSizing: "border-box" }}>
                        <ChampFace champ={c} size={32} />
                      </div>
                      {/*  位置放在頭像**下方**，不疊在臉上；顯示中文路名（介面一律繁中），
                          英文碼只留在 data-code 當驗收錨點。警示統一用一個 ⚠。 */}
                      {t === "blue" && (
                        <div style={{
                          marginTop: 1, height: 10, lineHeight: "10px", borderRadius: 2,
                          font: "800 7px system-ui",
                          color: at ? (warn ? WARN : "#c7d2de") : "#52525b",
                          background: at ? (warn ? "rgba(224,164,88,0.14)" : "rgba(255,255,255,0.06)") : "transparent",
                          overflow: "hidden", whiteSpace: "nowrap", boxSizing: "border-box",
                        }}>
                          {at ? `${warn ? WARN_ICON : ""}${at.lane}` : "待分配"}
                        </div>
                      )}
                    </button>
                  );
                })}
                {Array.from({ length: 5 - picks[t].length }).map((_, i) => (
                  <div key={i} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.035)", border: "1px dashed rgba(255,255,255,0.10)", flexShrink: 0 }} />
                ))}
              </div>
              {/*  禁用縮到同一列的最右側（原本自成一段，含標題共約 90px）。 */}
              <div style={{ display: "flex", gap: 2, flexShrink: 0, paddingLeft: 4, borderLeft: "1px solid rgba(255,255,255,0.07)" }} title="禁用">
                {bans[t].map((c) => (
                  <div key={c.id} style={{ width: 20, height: 20, borderRadius: 5, overflow: "hidden", opacity: 0.42, filter: "grayscale(1)" }}><ChampFace champ={c} size={20} /></div>
                ))}
                {Array.from({ length: 2 - bans[t].length }).map((_, i) => (
                  <div key={i} style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.035)", border: "1px dashed rgba(255,255,255,0.10)" }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/*  J-close：出戰配置**常駐**，而且排在選角格之上。
            舊版排在下面 ⇒ 輪到你選人時，260px 高的選角格會把它推出畫面外，
            等於「選的時候看不到自己會被排到哪一路」，選完又只閃 1.2 秒就換頁。 */}
        {/*  ── Hotfix1：收合後的出戰配置只有 33px，放在英雄格上方 ──────────────
            量測發現：把它移到英雄格**下面**之後，它會被沒有高度上限的英雄格推到
            y≈1910——技術上捲得到，實際上要滑過上百隻英雄才看得到，等於沒有。
            收合狀態成本極低，放回上方讓它一直在首屏，英雄格仍從首屏開始。 */}
        <DraftPlanPanel plan={draftPlan} loadout={planLoadout}
          open={planOpen} onToggle={() => setPlanOpen((v) => !v)} needs={compNeeds} laneByHero={laneByHero} picks={picks.blue} />

        {developmentEffects.unlocks.mobaOpponentResearch && (
          <div data-testid="moba-opponent-research" style={{ background: GC2.card, border: "1px solid rgba(96,165,250,0.35)", borderRadius: 10, padding: "9px 11px", marginBottom: 10 }}>
            <div style={{ color: GC2.blue, fontSize: 10, fontWeight: 900 }}>對手研究 · {oppName ?? "對手"}</div>
            {opponentReport.picks.length > 0 ? (
              <>
                <div style={{ color: "#e5e7eb", fontSize: 9, marginTop: 4 }}>
                  已選英雄：{opponentReport.picks.map((champ) => champ.zh).join("、")}
                </div>
                <div style={{ color: GC2.gray, fontSize: 8.5, lineHeight: 1.5, marginTop: 3 }}>
                  類型：{opponentReport.archetypes.map(([name, count]) => name + " ×" + count).join("、") || "尚未形成"}
                  {opponentReport.tags.length > 0 ? " · 特徵：" + opponentReport.tags.join("、") : ""}
                  {opponentReport.bans.length > 0 ? " · 禁用 " + opponentReport.bans.length + " 名" : ""}
                </div>
              </>
            ) : (
              <div style={{ color: GC2.gray, fontSize: 8.5, lineHeight: 1.5, marginTop: 4 }}>對手完成選角後，這裡會顯示本局實際資料。</div>
            )}
          </div>
        )}

        {/*  ── Hotfix1：輪到你選人時，英雄格排在最前面 ──────────────────────
            「選擇你的英雄」不可以被上方資訊推走——它是這一頁唯一需要操作的東西。
            ── Hotfix2：這張卡改成**撐滿剩餘高度**的框（flex:1 ＋ minHeight:0）。
            標題／篩選／搜尋釘在框頂不動，只有英雄格自己捲 ⇒ 全頁只有一個捲動軸，
            而且它是**真的**捲得動的那一個（根元素已被 height:100% 框住）。 */}
        {isMyTurn && showPicker ? (
          <>
            <div data-testid="hero-picker" style={{
              flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative",
              background: GC2.card, borderRadius: 12, padding: 12, marginBottom: 8,
              border: "1px solid rgba(120,160,220,0.28)",
            }}>
              <div style={{ flexShrink: 0, color: "#cbd5e1", fontSize: 11, fontWeight: 800, marginBottom: 8 }}>{cur.act === "ban" ? "選擇要禁用的英雄" : "選擇你的英雄"}</div>
              <div style={{ flexShrink: 0, display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
                {["全部", "坦克", "戰士", "刺客", "法師", "射手", "輔助"].map((f) => (<button key={f} data-testid="pick-filter" data-filter={f} data-active={pickFilter === f ? "1" : "0"} onClick={() => setPickFilter(f)} style={{ flexShrink: 0, padding: "4px 10px", border: "none", cursor: "pointer", background: pickFilter === f ? "rgba(255,255,255,0.14)" : "transparent", color: pickFilter === f ? "#e8eef6" : GC2.gray, fontSize: 10, fontWeight: 700, borderBottom: pickFilter === f ? `2px solid ${ARCH_DIM[f] ?? GC2.blue}` : "2px solid transparent", borderRadius: 6 }}>{f}</button>))}
              </div>
              {/*  Hotfix2：搜尋。位置篩選之後仍有 3–4 列，要拿特定一隻還是得滑；
                  打兩個字就到位比捲動快，也比把格子縮小塞更多隻好讀。 */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, marginBottom: 8, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "0 8px" }}>
                <span style={{ color: "#52525b", fontSize: 10, flexShrink: 0 }}>🔍</span>
                <input data-testid="hero-search" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)}
                  placeholder="搜尋英雄名稱" aria-label="搜尋英雄名稱"
                  style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: "#e8eef6", fontSize: 11, padding: "6px 0", fontFamily: "inherit" }} />
                {pickQuery && (
                  <button data-testid="hero-search-clear" aria-label="清除搜尋" onClick={() => setPickQuery("")}
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: GC2.gray, fontSize: 11, padding: 0 }}>✕</button>
                )}
                <span data-testid="pick-count" data-count={shownPool.length} style={{ flexShrink: 0, color: GC2.gray, fontSize: 9, fontWeight: 700 }}>{shownPool.length} 位</span>
              </div>
              {/*  ★ 全頁唯一的捲動區。min-height:0 是關鍵：沒有它，flex 子元素的
                  最小高度是內容高度 ⇒ 又會長回去把父框撐破（就是 Hotfix1 的處境）。
                  overscroll-behavior:contain 讓捲到底不會把外層一起帶走；
                  touch-action:pan-y 明確只吃垂直手勢。 */}
              <div ref={gridRef} data-testid="hero-grid-scroll"
                onScroll={onGridScroll}
                onPointerDownCapture={onGridPointerDown}
                onPointerMoveCapture={onGridPointerMove}
                onPointerUpCapture={onGridPointerUp}
                onPointerCancelCapture={onGridPointerUp}
                style={{
                  flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
                  overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: "pan-y",
                  scrollbarWidth: "thin", paddingRight: 2,
                }}>
                <div data-testid="hero-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, alignContent: "start" }}>
                  {shownPool.map((c) => (
                    <div key={c.id} data-testid="hero-card" data-hero={c.id} style={{ background: GC2.card2, border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
                      <button onClick={() => { if (isRealTap()) setDetailId(c.id); }} style={{ position: "absolute", top: 2, right: 2, width: 15, height: 15, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", cursor: "pointer", color: "#a1a1aa", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>ⓘ</button>
                      <button data-testid="hero-choose" data-hero={c.id} onClick={() => { if (isRealTap()) playerChoose(c); }} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%", padding: 0 }}>
                        <ChampFace champ={c} size={34} />
                        <span style={{ color: "white", fontSize: 7, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{c.zh}</span>
                        <span style={{ color: ARCH_DIM[c.arch] ?? GC2.gray, fontSize: 6.5 }}>{c.arch}</span>
                      </button>
                    </div>
                  ))}
                </div>
                {shownPool.length === 0 && (
                  <div style={{ color: GC2.gray, fontSize: 10, textAlign: "center", padding: "18px 0" }}>沒有符合的英雄</div>
                )}
                {/*  捲到最底時，最後一列仍要離框底有一點餘裕（別貼著邊）。 */}
                <div style={{ height: 6 }} />
              </div>
              {/*  可捲動提示：只在「下面還有東西」時出現的一道細漸層。
                  不擋卡片（pointerEvents:none）、不是浮動大字塊。 */}
              {!gridAtEnd && (
                <div data-testid="hero-grid-more" aria-hidden="true" style={{
                  position: "absolute", left: 12, right: 12, bottom: 12, height: 18, borderRadius: "0 0 10px 10px",
                  background: `linear-gradient(to top, ${GC2.card}, rgba(19,21,28,0))`, pointerEvents: "none",
                }} />
              )}
            </div>
            {/*  選角動態在選人當下壓成一行（最新一則）。整份紀錄在「對手選擇中…」
                與選角完成後都會完整攤開——那時候才是真的會去讀它的時機。
                這是為了把垂直空間讓給英雄格，資料一筆都沒有拿掉。 */}
            <div data-testid="draft-log" data-compact="1" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, background: GC2.card, borderRadius: 8, padding: "5px 10px" }}>
              <span style={{ flexShrink: 0, color: GC2.gray, fontSize: 9, fontWeight: 700 }}>選角動態</span>
              <span style={{ flex: 1, minWidth: 0, color: "#e5e7eb", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log[0] ?? "準備開始…"}</span>
            </div>
          </>
        ) : (
          /*  不是你在選人的時候（對手選擇中／選角完成）：剩餘高度讓給完整的
              選角動態與確認區，而且這一段自己可捲，短螢幕也不會被裁掉。 */
          <div data-testid="draft-tail-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
            <div data-testid="draft-log" data-compact="0" style={{ background: GC2.card, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ color: GC2.gray, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>選角動態</div>
              {log.length === 0 && <div style={{ color: GC2.gray, fontSize: 10, textAlign: "center", padding: "8px 0" }}>準備開始…</div>}
              {log.map((l, i) => (<div key={i} style={{ color: i === 0 ? "white" : GC2.gray, fontSize: 10, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{l}</div>))}
            </div>

            {done && (
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <div style={{ color: GC2.green, fontSize: 13, fontWeight: 800, marginBottom: 8 }}>✓ 選角完成 —— 上方是本場最終分路</div>
                <div style={{ color: GC2.gray, fontSize: 10, marginBottom: 10, lineHeight: 1.6 }}>
                  確認每一路的選手、英雄、適性與衝突提示之後再繼續。<br />
                  這份配置就是接下來 Loading、對戰、戰報與重播看到的同一份。
                </div>
                <button data-testid="confirm-draft" onClick={confirmDraft}
                  style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 10, padding: "10px 26px", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
                  確認出戰配置 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {/*  Milestone K（Ray 裁決）：ⓘ 開的就是 Hero Codex 本身，五頁都要有。
           `showMatchups` 是**呼叫端的選擇**，不是元件的全域預設——
           元件預設仍是 false，其他呼叫端不會被這行影響。
           ⚠ 這只影響「英雄詳情彈窗裡有第五頁」。Ban/Pick **主畫面**
           （分路摘要、選角動態、英雄卡）依然沒有任何「誰克制誰」的呈現，
           J-close Hotfix 2 移除的兩處一個都沒有回來。 */}
      {detailId && <HeroCodexDetail heroId={detailId} showMatchups onClose={() => setDetailId(null)} />}
      {/*  Hotfix2：捲軸不再是「全部藏起來」。英雄格是這一頁唯一要捲的東西，
          給它一條 4px 細軌當可捲動的靜態暗示（另有底部漸層當動態暗示）。 */}
      <style>{`
        *::-webkit-scrollbar{display:none}
        [data-testid="hero-grid-scroll"]::-webkit-scrollbar{display:block;width:4px}
        [data-testid="hero-grid-scroll"]::-webkit-scrollbar-track{background:transparent}
        [data-testid="hero-grid-scroll"]::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.22);border-radius:2px}
      `}</style>
    </div>
  );
}
