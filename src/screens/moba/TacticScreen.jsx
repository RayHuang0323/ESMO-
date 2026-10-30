// ============================================================================
//  screens/moba/TacticScreen.jsx — MOBA 戰術（Sprint12 建 → Sprint24 全面升級）
//
//  Sprint24 三件事：
//  1. 跑版根因修復：舊版內容根節點是固定 width:560 的 flex 列＋固定 200px 詳解欄
//     → 360px 手機直接溢出、1920 桌機永遠窄條。改為 width:100% + maxWidth +
//     grid auto-fill（手機單欄 / 平板 2-3 欄 / 桌機多欄），詳解全寬自然換行，
//     無固定高度、無水平捲軸。
//  2. 資料來源改為正式契約 platform/contracts/MobaTacticConfig.js（MOBA_TACTICS，
//     Legacy m1–m8 名稱與文案逐字保留）——資料不再散落本 component。
//  3. 適性 = 真實資料：tactic.fit（角色×能力鍵）對 profileStore.players 的 16 項
//     能力取平均（無硬編碼百分比）；引擎效果 = describeEngineEffects（由 knobs
//     與中性值比較自動生成，與引擎實際吃到的參數同源，不會漂移）。
//
//  戰術自 Sprint24 起「真的」進引擎：onNext(cur) → AppShell → GameView →
//  useLocalServer.start({tactic}) → engine.configureMatch。
//
//  Item System M3d：出裝策略區（itemsV1 開啟時才出現；閘門與 useLocalServer 相同）。
//    五張卡＝BUILD_STRATEGY_META＋selectStrategyPrepView（預覽＝引擎開局 buildTargets 的同一份輸入，
//    本畫面不算出裝）。選卡當下由 AppShell 存進本場設定（重新整理／返回都接得回來）；
//    onNext(applied, buildStrategy) 的第二參數在 OFF 時是 null。
// ============================================================================
import React, { useMemo, useState } from "react";
import { featureEnabled, FEATURE_FLAGS } from "../../featureFlags.js";
import { resolveRulesetForMode, tacticalDirectorModeOf, templateBalanceOf } from "../../platform/contracts/matchRuleset.js";
import { LIVE_RULESET_MODE } from "../../battle/moba/liveMatchSetup.js";
import { itemsDevRequested } from "../../ui/itemsDevFlag.js";
import { heroById } from "../../data/heroDatabase.js";
import { draftRoster } from "../../battle/moba/draftRoster.js";
import { normalizeBuildStrategy, selectStrategyPrepView } from "../../battle/moba/items/buildStrategyPrep.js";
import { BuildStrategyCards } from "../../battle/ui/items/BuildStrategyCards.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { useIsMobile } from "../../ui/useViewport.js";
import { Frame } from "./LineupScreen.jsx";
import { MOBA_TACTICS, toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC } from "../../platform/contracts/MobaTacticConfig.js";
//  Expansion v1 N2/N3：只讀既有計數，不產生新事實（見 ui/DevelopmentInsights.jsx 檔頭）。
import { TacticInsightPanel, MatchOverviewPanel } from "../../ui/DevelopmentInsights.jsx";
import { useProfileStore } from "../../platform/profileStore.js";
import HeroBattleTalentPicker from './HeroBattleTalentPicker.jsx';
//  Meta Progression v1：戰術變體。
//  ⚠ 本畫面**不判斷**解鎖／流派／資格——那些規則全住在 `mastery/` 底下，
//    這裡只把 `variantsAvailableForTactic()` 已經算好的結果畫出來。
//    UI 只要自己判斷一次，規則就有兩份，而被修的永遠是另外那一份。
import { variantsAvailableForTactic } from "../../platform/mastery/clubMastery.js";
import { applyVariant, variantById } from "../../platform/mastery/tacticVariant.js";
import { statZh } from "../../data/playerModel.js";
import { fitScore, fitGrade } from "./tacticFit.js";
import { GC } from "../../ui/theme.js";
//  Phase 3a T13：戰術書。模板、可調選項與指標全部由 view-model（tacticBookOptions.js）轉述 Registry／resolver／指標模組，
//  本畫面只保存「選了哪個模板、疊了哪個變體、調了哪些選項」三個狀態，送出時交出 binding。
import { templateById, templateConfigFor, TEMPLATE_COPY } from "../../platform/tactics/tacticTemplates.js";
import { buildPlayerStatSlots } from "../../battle/moba/mobaRosterAdapter.js";
import { getHeroCombatArchetype } from "../../data/heroCombatArchetypes.js";
import { templateGroups, tacticBookView, withChoice, offeredChoicesOnly, dimensionLabel, choiceLabel } from "./tacticBook/tacticBookOptions.js";
import TemplateStrip from "./tacticBook/TemplateStrip.jsx";
import ChoicePanel from "./tacticBook/ChoicePanel.jsx";
import IndicatorPanel from "./tacticBook/IndicatorPanel.jsx";
//  Phase 3a-B T13（Owner 2026-10-25 決策 8）：三步驟（情報／戰術書／確認）、確認頁、對手情報概要。沿用既有 Router 與戰術書資料契約：
//  本畫面只多一個「目前在哪一步」的狀態；對手情報用 AI 教練的概要（v21）或風格模板名稱（v20），都不含權重。
import { TACTIC_BOOK_MAX } from "../../platform/tactics/tacticBook.js";
import { aiTeamById } from "../../platform/competition/aiTeams.js";
import { opponentIntelOf, tacticBookSaveState } from "./tacticBook/tacticBookOptions.js";
import OpponentIntelPanel from "./tacticBook/OpponentIntelPanel.jsx";
import ConfirmPanel from "./tacticBook/ConfirmPanel.jsx";

const DEFAULT_TEMPLATE_ID = `classic.${MOBA_TACTICS[0].tacticId}`;

const riskC = (r) => (r === "高" ? GC.red : r === "中" ? GC.gold : GC.green);
// S27：適性抽至 tacticFit.js（純函式、Node 可測），並改讀 derived stats（含天賦）。

/** 引擎效果摘要：knobs 與中性（對手 standard）比較，自動生成（與引擎輸入同源） */
function engineEffects(t) {
  const k = toEngineTactic(t), n = toEngineTactic(STANDARD_OPP_TACTIC);
  const out = [];
  const d = (a, b) => a - b;
  if (Math.abs(d(k.joinFight, n.joinFight)) >= 0.03) out.push(`團戰參與 ${k.joinFight > n.joinFight ? "↑" : "↓"}`);
  if (Math.abs(d(k.dragonJoin, n.dragonJoin)) >= 0.04) out.push(`Dragon 集結 ${k.dragonJoin > n.dragonJoin ? "↑" : "↓"}`);
  if (Math.abs(d(k.baronJoin, n.baronJoin)) >= 0.04) out.push(`Baron 集結 ${k.baronJoin > n.baronJoin ? "↑" : "↓"}`);
  if (Math.abs(d(k.retreatAt, n.retreatAt)) >= 0.02) out.push(k.retreatAt < n.retreatAt ? "撤退更晚（高風險）" : "撤退更早（保守）");
  const off = Object.entries(k.laneOffset).filter(([, v]) => Math.abs(v) >= 0.03);
  if (off.length) out.push(`推線深度 ${off.map(([l, v]) => `${{ top: "上", mid: "中", bot: "下" }[l]}${v > 0 ? "↑" : "↓"}`).join("")}`);
  if (k.splitLane) out.push(`${{ top: "上路", mid: "中路", bot: "下路" }[k.splitLane]}帶線分推（${Math.round(k.splitPush * 100)}%）`);
  if (k.gankInterval < n.gankInterval) out.push("Gank 節奏加快"); else if (k.gankInterval > n.gankInterval) out.push("Gank 節奏放慢");
  const gw = Object.entries(k.gankWeights).filter(([, v]) => v > 1.2);
  if (gw.length) out.push(`Gank 偏重${gw.map(([l]) => ({ top: "上", mid: "中", bot: "下" }[l])).join("/")}路`);
  if (k.invadeChance >= 0.3) out.push(`開局入侵（${Math.round(k.invadeChance * 100)}%${k.invadeWithMid ? "，中路跟進" : ""}）`);
  if (k.roamRate >= 0.45) out.push("輔助頻繁遊走");
  //  Tactical Identity v1：同一份契約的決策投影（與引擎 configureMatch.identity 同源）。
  const I = toEngineTacticIdentity(t);
  if (I.engageBias >= 0.03) out.push("接戰意願 ↑"); else if (I.engageBias <= -0.03) out.push("接戰意願 ↓");
  const PH = ["前期", "中期", "後期"];
  const ph = I.phaseEngage.map((v, i) => (v > 0 ? `${PH[i]}↑` : v < 0 ? `${PH[i]}↓` : null)).filter(Boolean);
  if (ph.length) out.push(`分階段主動性 ${ph.join(" ")}`);
  if (I.retreatFloorShift <= -0.02) out.push("殘血仍願意多拚一下"); else if (I.retreatFloorShift >= 0.02) out.push("殘血更早脫離");
  if (I.gankIntervalK > 1) out.push("打野以刷野發育為主（抓人變少）");
  if (I.roamK > 1) out.push("輔助主動遊走"); else if (I.roamK < 1) out.push("輔助留在後排保護");
  if (I.protectRole) out.push(`優先保護${{ top: "上路", mid: "中路", adc: "下路" }[I.protectRole]}`);
  if (I.siegeBias >= 0.2) out.push("打贏後優先推塔"); else if (I.siegeBias <= -0.1) out.push("打贏後不急著推塔");
  return out;
}

export default function TacticScreen({ onNext, onBack, roster = null, draft = null, onBuildStrategyChange = null }) {
  //  Phase 3a T13：選的是「模板」（經典八套＋標準＋v2）。`sel` 仍是經典戰術 id——變體資格、歷史表現、熟練度都以它為鍵。
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [choices, setChoices] = useState({});
  //  T13：三步驟。預設停在「戰術書」（主要工作的那一步；情報與確認隨時可切換，「開始載入」在每一步都可按）。
  const [step, setStep] = useState("book");
  //  Owner 2026-10-25 決策 4：從戰術書載入的那一份（用來判斷「另存副本」與「重複」）。
  const [loadedEntryId, setLoadedEntryId] = useState(null);
  const template = templateById(templateId) ?? templateById(DEFAULT_TEMPLATE_ID);
  const sel = template.legacyTacticId;
  //  Phase 3a-C／3a-B 第一階段：與開局時 liveMatchSetup 用同一個解析函式。本畫面只在 Director core.v1（career.v21）下出現（AppShell 的總開關）；
  //  templateBalance＝這個規則集的模板修正表：模板起點、提供清單、指標與文案都用它（畫面＝引擎打的那一份）。
  const liveRuleset = useMemo(() => resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags: FEATURE_FLAGS }), []);
  const tacticalDirector = tacticalDirectorModeOf(liveRuleset);
  const templateBalance = templateBalanceOf(liveRuleset);
  const templateGroupsView = useMemo(() => templateGroups(templateBalance), [templateBalance]);
  //  修正表下有修正文案的模板 ⇒ 顯示欄位（名稱、風險、重點、描述、優勢、缺點）換成修正文案；只給畫面看，引擎設定不帶它（I1）。
  const copyOver = templateBalance ? TEMPLATE_COPY[templateBalance]?.[template.templateId] ?? null : null;
  const withCopy = (cfg) => (copyOver && cfg ? { ...cfg, ...copyOver } : cfg);
  const allPlayers = useProfileStore((s) => s.players) ?? [];
  const lineup = useProfileStore((s) => s.lineup) ?? null;
  //  Club Assets v1：讀合併權威（發展樹 ＋ 總教練），不自己合併。
  const developmentEffects = useProfileStore((s) => s.clubCapabilities()).total;
  const starters = useMemo(() => allPlayers.filter((p) => p.status === "主力"), [allPlayers]);
  //  模板的設定就是一份 MobaTacticConfig（經典模板＝MOBA_TACTICS 的那一筆，逐欄相同）。
  const cur = useMemo(() => withCopy(templateConfigFor(template.templateId, templateBalance)), [template.templateId, templateBalance]);

  //  ── 變體選擇 ────────────────────────────────────────────────────────
  //  `null` = 基礎戰術。m1–m8 永遠可選，這個狀態只決定「要不要疊一層變體」。
  const [variantSel, setVariantSel] = useState(null);
  const clubMastery = useProfileStore((s) => s.clubMastery);
  //  ── Expansion v1 N2：戰術歷史表現 ────────────────────────────────────
  //  ⚠ 資料來源是 Club Mastery 已經在累積的計數，這裡不新增任何事件流，
  //    也不解鎖任何戰術（那是 tacticVariant 的責任）。
  const tacticInsightRows = useMemo(() => MOBA_TACTICS.map((t) => ({
    id: t.tacticId,
    name: (templateBalance ? TEMPLATE_COPY[templateBalance]?.[`classic.${t.tacticId}`]?.name : null) ?? t.name ?? t.tacticId,
    games: clubMastery?.tacticUsage?.moba?.[t.tacticId] ?? 0,
    intent: clubMastery?.tacticIntent?.moba?.[t.tacticId] ?? 0,
  })), [clubMastery, templateBalance]);
  //  變體（覆蓋層）只屬於它的經典模板：v2／標準模板沒有變體列。
  const variantInfo = useMemo(
    () => (template.kind === "classic" ? variantsAvailableForTactic(clubMastery, sel) : { variants: [] }),
    [clubMastery, sel, template.kind],
  );
  //  ⚠ 資格由 domain 決定，這裡只是「選到的那個現在還能不能用」。
  //    換基礎戰術或切換流派之後，原本選的變體若不再 equippable 就自動回到基礎，
  //    所以不需要 effect 去清狀態——也就不會出現「畫面顯示變體、送出去卻是基礎」。
  const activeVariant = useMemo(() => {
    if (!variantSel) return null;
    const row = variantInfo.variants.find((v) => v.variantId === variantSel);
    return row?.equippable ? variantById(variantSel) : null;
  }, [variantSel, variantInfo]);

  //  真正要送進引擎的那一份。基礎戰術時就是 `cur` 本身（行為與變體上線前完全相同）。
  const baseApplied = useMemo(() => (activeVariant ? applyVariant(cur, activeVariant) : cur), [cur, activeVariant]);

  //  ── Phase 3a T13：戰術書 ──────────────────────────────────────────────
  //  席位選手素質與英雄原型只用來算「適性／配合度」這兩個參考指標，不進計畫本身。
  const talentRosterForBook = useMemo(() => (roster ? draftRoster(roster, draft) : null), [roster, draft]);
  const seatPlayers = useMemo(() => buildPlayerStatSlots(allPlayers, "blue", lineup), [allPlayers, lineup]);
  //  Phase 3a-C：每時期的選擇（集結、物件優先）只在 v21 規則集（Director core.v1）可用——與開局時 liveMatchSetup 用同一個解析函式，
  //  旗標關閉（v20）⇒ 戰術書不畫這些維度，舊計畫裡帶著的也先拿掉（否則組裝器會拒絕整份戰術）。
  const book = useMemo(() => {
    const heroLookup = (seat) => { const id = talentRosterForBook?.[seat]?.heroId; return id ? getHeroCombatArchetype(id) : null; };
    const overlayIds = activeVariant ? [activeVariant.variantId] : [];
    //  先拿掉目前不提供的選擇（從戰術書載入的舊計畫可能帶著後來被量測排除的選項；換變體後也可能有選項不再提供）
    //  ⇒ 送出去的計畫永遠與畫面上看得到的選項一致。
    const kept = offeredChoicesOnly(template.templateId, overlayIds, choices, { tacticalDirector, templateBalance });
    const view = tacticBookView({ templateId: template.templateId, overlayIds, choices: kept.choices, seatPlayers, heroLookup, tacticalDirector, templateBalance });
    //  仍不合法 ⇒ 退回「模板＋變體、沒有額外選擇」，不送出不合法的計畫。
    return view.ok ? { view, choices: kept.choices, dropped: kept.dropped }
      : { view: tacticBookView({ templateId: template.templateId, overlayIds, choices: {}, seatPlayers, heroLookup, tacticalDirector, templateBalance }), choices: {}, dropped: kept.dropped };
  }, [template.templateId, activeVariant, choices, seatPlayers, talentRosterForBook, tacticalDirector, templateBalance]);
  const bookView = book.view.ok ? book.view : null;
  //  真正生效的那一份：有戰術書的解析結果就用它（模板＋變體＋選擇，與引擎吃到的同一個合併函式）；否則是 v20 的基礎路徑。
  //  顯示用的欄位（LoadingScreen／HUD 讀 tactic.name／desc／detail）換成修正文案；數值欄位不動（開局走 binding；legacy 退路由 id 重建）。
  const applied = bookView ? withCopy(bookView.config) : baseApplied;
  const binding = bookView ? bookView.binding : null;
  const changedCount = bookView ? bookView.dimensions.filter((d) => d.explicit && !d.quick).length : 0;
  const chooseTemplate = (id) => { setTemplateId(id); setChoices({}); setVariantSel(null); setBookNote(null); setLoadedEntryId(null); };
  const choose = (dimension, value, own) => { setChoices(withChoice(book.choices, dimension, value, own)); setBookNote(null); };

  //  我的戰術書（存檔切片在 profileStore；這裡只呼叫公開動作）
  const savedBook = useProfileStore((s) => s.tacticBook?.plans) ?? [];
  const [bookName, setBookName] = useState("");
  const [bookNote, setBookNote] = useState(null);
  const activeBookId = binding ? (savedBook.find((e) => e.id === binding.planHash)?.id ?? null) : null;
  const saveToBook = () => {
    if (!bookView || saveBlocked) return;
    //  沒輸入名稱 ⇒ 用畫面上的模板名稱（修正表下是 v21 文案；審查：存檔預設名稱與 placeholder 一致）。
    const r = useProfileStore.getState().saveTacticPlan(bookView.plan, { name: bookName.trim() || cur.name });
    setBookNote(r.ok ? { ok: true, text: r.replaced ? `已更新「${r.entry.name}」` : `已存成「${r.entry.name}」` } : { ok: false, text: r.errors[0]?.message ?? "存不進去" });
    //  Phase 3a-B（審查）：存好之後，目前這份就是剛存的那一份（另存的副本可以照常改名，不會被當成「與別份重複」）。
    if (r.ok) { setBookName(""); setLoadedEntryId(r.entry.id); }
  };
  const loadFromBook = (entry) => {
    setLoadedEntryId(entry.id);
    setTemplateId(entry.plan.templateId);
    setChoices(entry.plan.choices ?? {});
    //  變體資格仍由俱樂部專精決定：存的時候有、現在不能用 ⇒ activeVariant 會是 null，計畫退回沒有變體的版本。
    setVariantSel(entry.plan.overlayIds?.[0] ?? null);
    setBookNote(null);
  };
  const deleteFromBook = (entry) => {
    const r = useProfileStore.getState().deleteTacticPlan(entry.id);
    setBookNote(r.ok ? { ok: true, text: `已刪除「${entry.name}」` } : { ok: false, text: r.errors[0]?.message ?? "刪除失敗" });
  };
  //  Owner 2026-10-25 決策 4：存檔前就講清楚會發生什麼。
  //   · 載入的那一份有選項不提供（被過濾）⇒ 存下去是**另一份**不含那些選項的計畫，原計畫保留。
  //   · 過濾後剛好等於另一份已存的計畫 ⇒ 已經在戰術書裡，不另存、也不幫那一份改名。
  //   · 戰術書已滿、這又是新的一份 ⇒ 先刪一份才存得進去（不等按了才報錯）。
  const saveState = tacticBookSaveState({ loadedEntryId, droppedCount: book.dropped.length, currentPlanId: binding?.planHash ?? null, saved: savedBook, max: TACTIC_BOOK_MAX });
  const filteredCopy = saveState.copy, dupEntry = saveState.duplicate, bookFull = saveState.full, saveBlocked = saveState.blocked;
  //  T13：對手情報（賽前、合法資訊）。v21（Director core.v1）＝AI 教練賽前排的計畫概要；v20＝風格模板名稱。沒有對手 ⇒ 標準運營。
  const opponentId = useProfileStore((s) => s.matchmaking?.launch?.opponentId ?? null);
  const intel = useMemo(() => opponentIntelOf({ team: opponentId ? aiTeamById(opponentId) : null, tacticalDirector, redTactic: liveRuleset.layers.redTactic, templateBalance }), [opponentId, tacticalDirector, liveRuleset, templateBalance]);
  const fitOf = (id) => fitGrade(fitScore(templateById(id).config, starters));

  const curFit = fitScore(cur, starters);
  const curFG = fitGrade(curFit);
  //  ⚠ 引擎效果讀的是**套用後**的 config —— 玩家看到的就是引擎真的會吃到的東西。
  const effects = engineEffects(applied);

  //  ── Item System M3d：出裝策略 ──────────────────────────────────────────
  //  正式站 itemsV1=false；DEV 才讀 ?itemsDev=1（正式 build 時後半段整段折疊，itemsDev 字串不進產物）。
  const itemsOn = useMemo(() => featureEnabled("itemsV1") || (import.meta.env.DEV && itemsDevRequested()), []);
  const isMobile = useIsMobile();
  //  本場已存的選擇（重新整理、返回戰術頁時接回來）；沒有場次時才只靠本畫面的暫存。
  const savedStrategy = useProfileStore((s) => s.matchmaking?.session?.activeMatch?.config?.buildStrategy ?? null);
  const [pickedStrategy, setPickedStrategy] = useState(null);
  const savedTalentSelections = useProfileStore((s) => s.matchmaking?.session?.activeMatch?.config?.talentSelections ?? null);
  const [pickedTalentSelections, setPickedTalentSelections] = useState(null);
  const talentSelections = pickedTalentSelections ?? savedTalentSelections ?? {};
  const talentRoster = useMemo(() => roster ? draftRoster(roster, draft) : null, [roster, draft]);
  const buildStrategy = normalizeBuildStrategy(pickedStrategy ?? savedStrategy);
  const [focusSeat, setFocusSeat] = useState(null);
  //  與 LoadingScreen／GameView 同一個 adapter（draftRoster）⇒ 預覽的英雄＝實際上場的英雄。
  const prep = useMemo(
    () => (itemsOn && roster ? selectStrategyPrepView({ roster: draftRoster(roster, draft), heroLookup: heroById, focusSeat }) : null),
    [itemsOn, roster, draft, focusSeat],
  );
  const pickStrategy = (id) => { setPickedStrategy(id); onBuildStrategyChange?.(id); };
  const focusHero = prep ? heroById(prep.seats.find((s) => s.seat === prep.focusSeat)?.heroId) : null;

  return (
    <Frame title="戰術" sub="TEAM STRATEGY · 戰術書 · 實際影響對戰" onBack={onBack} onNext={() => onNext && onNext(applied, prep ? buildStrategy : null, talentSelections, binding)} nextLabel="開始載入 →">
      <div style={{ width: "100%", maxWidth: 940, padding: "0 14px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {/* T13：步驟條（情報／戰術書／確認）。三步都可直接切換；不改 Router，不另建畫面。 */}
        <nav data-testid="tb-steps" aria-label="戰術準備步驟" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["intel", "① 情報"], ["book", "② 戰術書"], ["confirm", "③ 確認"]].map(([id, label]) => (
            <button key={id} type="button" data-testid={`tb-step-${id}`} aria-current={step === id ? "step" : undefined} onClick={() => setStep(id)}
              style={{ flex: "1 1 90px", minWidth: 0, minHeight: 38, background: step === id ? `${GC.blueL}22` : GC.card2, border: `1px solid ${step === id ? GC.blueL : GC.line}`,
                borderRadius: 8, color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>{label}</button>
          ))}
        </nav>
        {step === "intel" && <OpponentIntelPanel intel={intel} onNext={() => setStep("book")} />}
        {step === "confirm" && !bookView && (
          <div data-testid="tb-confirm-empty" role="status" style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "12px 14px", fontSize: 12, color: GC.gray }}>
            這份戰術目前無法整理成確認頁（請回戰術書重新選擇模板）；底部「開始載入」仍會以模板的基礎設定開打。
          </div>
        )}
        {step === "confirm" && bookView && (
          <ConfirmPanel templateName={copyOver?.name ?? template.name} variantName={activeVariant?.name ?? null} dimensions={bookView.dimensions} dropped={book.dropped}
            profile={bookView.profile} intel={intel} onEdit={() => setStep("book")} onGo={() => onNext && onNext(applied, prep ? buildStrategy : null, talentSelections, binding)} />
        )}
        {step === "book" && (<>
        {/* 模板列：auto-fill 響應式（手機 1 欄 / 平板 2-3 欄 / 桌機 4 欄），高度隨內容；上方是「我的戰術書」 */}
        <TemplateStrip groups={templateGroupsView} selectedId={template.templateId} onSelect={chooseTemplate} fitOf={fitOf}
          columns="repeat(auto-fill,minmax(min(190px,100%),1fr))"
          book={savedBook} activeBookId={activeBookId} onLoadBook={loadFromBook} onDeleteBook={deleteFromBook} />

        {developmentEffects.unlocks.mobaTacticInsight && (
          <TacticInsightPanel rows={tacticInsightRows} testId="moba-tactic-insight" />
        )}

        {developmentEffects.unlocks.dataAnalysis && (
          <div data-testid="moba-data-analysis" style={{ background: GC.card, border: `1px solid ${GC.green}44`, borderRadius: 10, padding: "9px 11px", color: GC.gray, fontSize: 9, lineHeight: 1.5 }}>
            <div style={{ color: GC.green, fontSize: 10, fontWeight: 900 }}>數據分析摘要</div>
            <div style={{ marginTop: 3 }}>目前戰術適配：{curFG.g}{curFit != null ? `（${curFit}）` : ""} · 先發人數 {starters.length}</div>
            <div>已選戰術的引擎效果與適配資料會沿用既有唯一計算來源。</div>
          </div>
        )}

        {/* 詳解：全寬、自然換行、無固定高度 */}
        <div style={{ background: GC.card, border: `1px solid ${GC.blueL}44`, borderRadius: 12, padding: "12px 16px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24 }}>{cur.emoji}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: GC.blueL }}>{cur.name}</span>
            <span style={{ fontSize: 9, color: GC.purp, border: `1px solid ${GC.purp}55`, borderRadius: 5, padding: "1px 6px" }}>{cur.archetype}</span>
            <span style={{ fontSize: 9, color: riskC(cur.risk), border: `1px solid ${riskC(cur.risk)}55`, borderRadius: 5, padding: "1px 6px" }}>{cur.risk}風險</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: curFG.c, border: `1px solid ${curFG.c}55`, borderRadius: 5, padding: "1px 6px" }}>我隊適性 {curFG.g}{curFit != null ? `（${curFit}）` : ""}</span>
          </div>
          {/* 打法：基礎 ＋ 已解鎖的變體。基礎永遠在第一個且永遠可選。 */}
          {variantInfo.variants.length > 0 && (
            <div data-testid="moba-variant-row" style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${GC.line}` }}>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 5 }}>打法</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  data-testid="moba-variant-basic"
                  onClick={() => setVariantSel(null)}
                  style={{
                    minWidth: 0, background: activeVariant ? GC.card2 : `${GC.blueL}22`,
                    border: `1px solid ${activeVariant ? GC.line : GC.blueL}`, borderRadius: 8,
                    padding: "5px 10px", color: "#fff", cursor: "pointer", fontSize: 10.5, fontWeight: 800,
                  }}
                >基礎</button>
                {variantInfo.variants.map((row) => {
                  const isSel = activeVariant?.variantId === row.variantId;
                  //  ⚠ 三種狀態都要看得懂「為什麼不能用」，不只是變灰。
                  const label = row.equippable ? null : (row.unlocked ? "其他流派" : "未解鎖");
                  return (
                    <button
                      key={row.variantId}
                      data-testid={`moba-variant-${row.variantId}`}
                      disabled={!row.equippable}
                      title={row.equippable ? "" : (row.unlocked ? "已擁有，但目前流派不同，切換流派後可用" : "尚未解鎖")}
                      onClick={() => row.equippable && setVariantSel(row.variantId)}
                      style={{
                        minWidth: 0, background: isSel ? `${GC.blueL}22` : GC.card2,
                        border: `1px solid ${isSel ? GC.blueL : GC.line}`, borderRadius: 8,
                        padding: "5px 10px", color: row.equippable ? "#fff" : GC.gray2,
                        cursor: row.equippable ? "pointer" : "not-allowed",
                        fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>{row.name}</span>
                      {label && (
                        <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 800, color: GC.gray2, border: `1px solid ${GC.line}`, borderRadius: 4, padding: "0 4px" }}>{label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* 選中的變體：一行講清楚買到什麼、付出什麼 */}
              {activeVariant && (
                <div data-testid="moba-variant-tradeoff" style={{ marginTop: 6, fontSize: 9.5, lineHeight: 1.6, color: GC.gray, overflowWrap: "break-word" }}>
                  <span style={{ color: GC.green, fontWeight: 800 }}>換得 </span>
                  {activeVariant.benefitAxes.map((a) => a.label).join("、")}
                  <span style={{ color: GC.red, fontWeight: 800 }}>　付出 </span>
                  {activeVariant.costAxes.map((a) => a.label).join("、")}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, marginTop: 8, overflowWrap: "break-word" }}>
            <span style={{ color: GC.green, fontWeight: 800 }}>優勢：</span>{cur.detail}
          </div>
          {cur.cons && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginTop: 4, overflowWrap: "break-word" }}>
              <span style={{ color: GC.red, fontWeight: 800 }}>缺點：</span>{cur.cons}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 4 }}>引擎效果（行為權重，非加傷）</div>
              <div data-testid="moba-tactic-effects" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {effects.map((e, i) => (
                  <span key={i} style={{ fontSize: 9.5, color: "#c4b5fd", background: "rgba(124,58,237,0.14)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 6, padding: "2px 8px" }}>{e}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 4 }}>適性依據（{cur.fit.roles.join("、") || "—"} 的真實能力）</div>
              <div style={{ fontSize: 9.5, color: GC.gray, lineHeight: 1.6, overflowWrap: "break-word" }}>
                {cur.fit.stats.map(statZh).join("、") || "—"}
                <span style={{ color: "#5a606e" }}>　·　適性僅供建議，不直接決定勝負</span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3a T13：戰術書——可調選項（Registry live 且量得到效果的）＋指標＋存成我的戰術書 */}
        {bookView && (
          <>
            {book.dropped.length > 0 && (
              <div data-testid="tb-dropped-note" role="status" style={{ fontSize: 11, lineHeight: 1.6, color: "#fde68a", background: "rgba(251,191,36,0.08)", border: `1px solid ${GC.gold}44`, borderRadius: 8, padding: "6px 10px", overflowWrap: "anywhere" }}>
                這份計畫裡有 {book.dropped.length} 個選項目前不提供，已改回模板的設定：{book.dropped.map((d) => `${dimensionLabel(d.dimension)}＝${choiceLabel(d.dimension, d.choice)}`).join("、")}
              </div>
            )}
            <ChoicePanel groups={bookView.groups} onChoose={choose} onReset={() => { setChoices({}); setBookNote(null); }} changedCount={changedCount} />
            <IndicatorPanel profile={bookView.profile} seats={bookView.seats} load={bookView.load} contradictions={bookView.contradictions} />
            <section data-testid="tb-save-row" aria-label="存成我的戰術書" style={{ background: GC.card, border: `1px solid ${GC.gold}33`, borderRadius: 12, padding: "10px 14px", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: GC.gold }}>📘 我的戰術書</span>
              <input data-testid="tb-save-name" aria-label="戰術書名稱" value={bookName} maxLength={20} placeholder={cur.name}
                onChange={(e) => setBookName(e.target.value)}
                style={{ flex: "1 1 140px", minWidth: 0, minHeight: 36, boxSizing: "border-box", background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 12 }} />
              <button type="button" data-testid="tb-save" onClick={saveToBook} disabled={saveBlocked}
                style={{ minHeight: 36, background: `${GC.gold}22`, border: `1px solid ${GC.gold}88`, borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: saveBlocked ? "not-allowed" : "pointer", opacity: saveBlocked ? 0.5 : 1, fontSize: 12, fontWeight: 900 }}>
                {saveState.label}
              </button>
              {filteredCopy && !dupEntry && !bookFull && (
                <span data-testid="tb-save-copy-note" role="note" style={{ flexBasis: "100%", fontSize: 11, color: "#fde68a" }}>將另存一份不含上述選項的計畫，原計畫保留。</span>
              )}
              {dupEntry && (
                <span data-testid="tb-save-dup-note" role="note" style={{ flexBasis: "100%", fontSize: 11, color: "#fde68a" }}>不含上述選項的這份計畫已經在戰術書裡（「{dupEntry.name}」），不需另存；原計畫保留。</span>
              )}
              {bookFull && (
                <span data-testid="tb-save-full-note" role="note" style={{ flexBasis: "100%", fontSize: 11, color: GC.redL }}>戰術書已滿 {TACTIC_BOOK_MAX} 份：請先在上方「我的戰術書」刪除一份，才能{filteredCopy ? "另存這一份" : "存起來"}。</span>
              )}
              {bookNote && <span data-testid="tb-save-note" data-ok={bookNote.ok ? "1" : "0"} role="status" style={{ flexBasis: "100%", fontSize: 11, color: bookNote.ok ? GC.green : GC.redL }}>{bookNote.text}</span>}
            </section>
          </>
        )}

        {/* Item System M3d：出裝策略（全隊同一策略，對手固定標準）。itemsV1 OFF ⇒ prep 為 null ⇒ 整塊不渲染 */}
        {prep && (
          <section data-build-strategy-prep aria-label="出裝策略" style={{ background: GC.card, border: `1px solid ${GC.gold}40`, borderRadius: 12, padding: "12px 14px 14px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: GC.gold }}>出裝策略</span>
              <span style={{ fontSize: 11, color: GC.gray }}>全隊五人套用同一策略，對手固定「標準」</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <div role="radiogroup" aria-label="預覽哪位英雄的出裝" style={{ display: "flex", gap: 6 }}>
                {prep.seats.map((s) => {
                  const on = s.seat === prep.focusSeat;
                  const hero = heroById(s.heroId);
                  return (
                    <button key={s.seat} type="button" role="radio" aria-checked={on} aria-label={`預覽${hero?.zh ?? s.seat}（${s.arch}）`}
                      data-touch data-focus-seat={s.seat} onClick={() => setFocusSeat(s.seat)}
                      style={{ width: 44, height: 44, padding: 0, border: 0, borderRadius: 10, cursor: "pointer", background: GC.card2, flexShrink: 0, overflow: "hidden",
                        boxShadow: on ? `0 0 0 2px ${GC.gold}` : `0 0 0 1px ${GC.line}`, opacity: on ? 1 : 0.72 }}>
                      <HeroPortrait heroId={s.heroId} size={44} radius={10} alt=""
                        fallback={<span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>{(hero?.zh ?? "?").slice(0, 1)}</span>} />
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 11.5, color: GC.gray, minWidth: 0, lineHeight: 1.5 }}>
                預覽 <b style={{ color: "#fff" }}>{focusHero?.zh ?? prep.focusSeat}</b>（{prep.previews.standard.arch}）開局的前三件核心
                {isMobile && <span style={{ display: "block" }}>左右滑動看五種策略</span>}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <BuildStrategyCards layout="prep" selected={buildStrategy} onSelect={pickStrategy} previews={prep.previews} previewLabel="開局核心" />
            </div>
          </section>
        )}
        <HeroBattleTalentPicker roster={talentRoster} selected={talentSelections} onChange={setPickedTalentSelections} />
        </>)}
      </div>
    </Frame>
  );
}
