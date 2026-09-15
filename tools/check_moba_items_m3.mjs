// ============================================================================
//  tools/check_moba_items_m3.mjs — MOBA Item System v1 M3a（UI 基礎＋視覺樣張）驗證器
//
//   G1 itemsV1 開關：production 預設 OFF、DEV 才讀 ?itemsDev=1；實際 vite build 產物不含 DEV 開啟路徑與樣張頁
//   G2 itemsUiSelectors：與 itemsViewModel 同值、純函式、戰術卡預覽＝buildPolicy 真實目標序列
//   G3 UI 隔離：裝備 UI 元件不 import 規則模組、不碰帳本、不自訂色碼、不自寫寬度判斷
//   G4 動效：reduced-motion 共用 hook、GSAP 只在回饋 hook、單次 ≤ 0.6s
//   G5 樣張頁：DEV-only 路由、九個必備區塊
//   G6 M2 未動：引擎、裝備規則模組、contracts 相對 HEAD 無改動；模擬版本閘門綠
//
//  用法：node tools/check_moba_items_m3.mjs   （G1 會跑一次 vite build 到暫存目錄，約 30 秒）
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const stripComments = (code) => code.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

const results = [];
const ck = (gate, name, pass, detail = "") => results.push({ gate, name, pass: !!pass, detail: pass ? "" : String(detail) });
const tryLoad = async (rel) => { try { return await load(rel); } catch (err) { return { __error: err.message }; } };

const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];

// ── G1 itemsV1 開關 ────────────────────────────────────────────────────────────
{
  const flags = await tryLoad("src/featureFlags.js");
  const dev = await tryLoad("src/ui/itemsDevFlag.js");
  ck("G1", "FEATURE_FLAGS.itemsV1 存在且預設 false（production OFF）", flags.FEATURE_FLAGS && "itemsV1" in flags.FEATURE_FLAGS && flags.FEATURE_FLAGS.itemsV1 === false, flags.__error ?? "");
  ck("G1", "itemsDevRequested 只認 ?itemsDev=1", !dev.__error && dev.ITEMS_DEV_QUERY === "itemsDev"
    && dev.itemsDevRequested("?itemsDev=1") === true && dev.itemsDevRequested("?itemsDev=0") === false
    && dev.itemsDevRequested("") === false && dev.itemsDevRequested("?items=1") === false && dev.itemsDevRequested("?debug=1") === false, dev.__error ?? "");
  const uls = read("src/useLocalServer.js");
  const calls = (stripComments(uls).match(/configureItems\(/g) ?? []).length;
  ck("G1", "useLocalServer 只有一個 configureItems 呼叫，且受 featureEnabled(\"itemsV1\") || (import.meta.env.DEV && itemsDevRequested()) 保護",
    calls === 1 && /featureEnabled\("itemsV1"\)\s*\|\|\s*\(import\.meta\.env\.DEV && itemsDevRequested\(\)\)/.test(uls), `calls=${calls}`);
  ck("G1", "出裝策略由 opts.buildStrategy 傳入（預設 standard）", /defaultStrategy:\s*opts\.buildStrategy \?\? "standard"/.test(uls));

  //  實際 build 一次，確認 DEV 開啟路徑與樣張頁不在正式產物裡
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-m3-dist-"));
  let buildOk = true, buildErr = "", hits = [];
  try {
    execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, stdio: "pipe", maxBuffer: 64 << 20 });
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const js = walk(out).filter((f) => /\.(js|html)$/.test(f));
    const FORBIDDEN = ["itemsDev", "ItemsUiGallery", "ItemInspector", "items-ui"];
    for (const f of js) {
      const text = fs.readFileSync(f, "utf8");
      for (const word of FORBIDDEN) if (text.includes(word)) hits.push(`${path.basename(f)}:${word}`);
    }
  } catch (err) {
    buildOk = false; buildErr = String(err.stderr ?? err.message).slice(0, 300);
  } finally {
    if (path.basename(out).startsWith("esmo-m3-dist-") && out.startsWith(os.tmpdir())) fs.rmSync(out, { recursive: true, force: true });
  }
  ck("G1", "vite build 成功", buildOk, buildErr);
  ck("G1", "正式產物不含 itemsDev／ItemsUiGallery／ItemInspector／items-ui（正式站無法用 query 開啟）", buildOk && hits.length === 0, hits.slice(0, 6).join(","));
}

// ── G2 itemsUiSelectors ────────────────────────────────────────────────────────
{
  const sel = await tryLoad("src/battle/moba/items/itemsUiSelectors.js");
  if (sel.__error) {
    ck("G2", "itemsUiSelectors 可載入", false, sel.__error);
  } else {
    const { LogicEngine } = await load("src/LogicEngine.js");
    const { CHAMPIONS_100, heroById } = await load("src/data/heroDatabase.js");
    const { toEngineHeroMods } = await load("src/battle/moba/mobaHeroProfile.js");
    const { toEngineArchetypes } = await load("src/data/heroCombatArchetypes.js");
    const { buildLoadout, toEngineSpells } = await load("src/battle/moba/mobaHeroLoadout.js");
    const { toEngineTactic, STANDARD_OPP_TACTIC } = await load("src/platform/contracts/MobaTacticConfig.js");
    const { toEngineItems } = await load("src/battle/moba/items/itemsEngineAdapter.js");
    const { ITEM_IDS, getItem } = await load("src/battle/moba/items/itemCatalog.js");
    const { BUILD_STRATEGIES, buildTargets } = await load("src/battle/moba/items/buildPolicy.js");
    const { ARCHETYPES } = await load("src/battle/moba/items/combatStatsV1.js");
    const { selectPlayerItemsView, STRATEGY_LABELS } = await load("src/battle/moba/items/itemsViewModel.js");

    const COMP = { b: ["坦克", "刺客", "法師", "射手", "輔助"], r: ["戰士", "戰士", "法師", "射手", "坦克"] };
    const used = new Set(), roster = {};
    for (const seat of SEATS) {
      const hero = CHAMPIONS_100.find((h) => h.arch === COMP[seat[0]][Number(seat[1]) - 1] && !used.has(h.id));
      used.add(hero.id); roster[seat] = { heroId: hero.id };
    }
    for (const [seat, e] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = e.spells;
    const engine = (items) => {
      const e = new LogicEngine(7);
      e.configureHeroes(toEngineHeroMods(roster, heroById));
      const blue = {}, red = {};
      for (const [pid, m] of Object.entries(toEngineArchetypes(roster))) (pid[0] === "r" ? red : blue)[pid] = m;
      e.configureArchetypes({ blue, red, meta: null });
      e.configureSpells(toEngineSpells(roster));
      e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
      if (items) e.configureItems(toEngineItems({ roster, heroLookup: heroById }));
      for (let i = 0; i < 1440 && !e.over; i++) e.tick(0.5);
      return e;
    };

    const badVisual = ITEM_IDS.filter((id) => {
      const v = sel.itemVisual(id);
      const it = getItem(id);
      return !v || v.itemId !== id || v.name !== it.name || v.price !== it.price || !sel.GLYPH_KEYS.includes(v.glyph)
        || !sel.SLOT_STATES.includes(v.state) || (it.tier === "T3" && (v.state !== "completed" || v.glyph !== `family:${it.family}`));
    });
    ck("G2", `itemVisual：88 件的圖紋與格子狀態都在語彙內，T3 一律 completed＋流派圖紋`, ITEM_IDS.length === 88 && badVisual.length === 0 && sel.itemVisual(null) === null, badVisual.slice(0, 5).join(","));

    const snap = engine(true).snapshot();
    const frozen = JSON.stringify(snap);
    const hud = sel.selectHudItems(snap);
    const mismatch = SEATS.filter((id) => {
      const v = selectPlayerItemsView(snap, id), h = hud?.[id];
      if (!h) return true;
      const cost = v.nextItem?.remainingCost ?? null;
      const progress = v.nextItem ? (cost > 0 ? Math.round(Math.min(1, v.gold.unspent / cost) * 100) / 100 : 1) : null;
      return h.side !== v.side || h.unspent !== v.gold.unspent
        || JSON.stringify(h.slots.map((s) => s.itemId)) !== JSON.stringify(v.slots.map((s) => s.itemId))
        || h.slots.some((s, i) => s.index !== i || s.state !== (s.itemId ? sel.itemVisual(s.itemId).state : "empty"))
        || h.completedCount !== v.currentItems.filter((c) => c.tier === "T3").length
        || h.nextItemId !== (v.nextItem?.itemId ?? null) || h.nextRemainingCost !== cost || h.nextProgress !== progress
        || h.nextShortfall !== (v.nextItem ? Math.max(0, (cost ?? 0) - v.gold.unspent) : null)
        || (v.nextItem && (h.nextShortfall === 0) !== v.nextItem.affordable);
    });
    ck("G2", "selectHudItems 與 selectPlayerItemsView 逐席位同值（可用金、6 格、完成數、下一件、差價、還差多少、進度）", hud && mismatch.length === 0, mismatch.join(","));
    ck("G2", "selectHudItems 純函式；OFF snapshot 回 null", JSON.stringify(snap) === frozen && sel.selectHudItems(engine(false).snapshot()) === null);

    const notesBad = SEATS.filter((id) => {
      const v = selectPlayerItemsView(snap, id);
      const n = sel.coachNotes(v);
      return !Array.isArray(n) || n.length > 2 || n.some((x) => !v.decision.text.includes(x.text) || typeof x.code !== "string");
    });
    ck("G2", "coachNotes：每人最多 2 句，文字都來自 view-model 的中文理由", notesBad.length === 0, notesBad.join(","));

    const meta = sel.BUILD_STRATEGY_META;
    const metaOk = meta && JSON.stringify(Object.keys(meta)) === JSON.stringify([...BUILD_STRATEGIES])
      && BUILD_STRATEGIES.every((s) => meta[s].id === s && meta[s].label === STRATEGY_LABELS[s] && typeof meta[s].pitch === "string" && meta[s].pitch.length > 0
        && ["early", "late", "survive", "counter"].every((k) => Number.isInteger(meta[s].traits[k]) && meta[s].traits[k] >= 0 && meta[s].traits[k] <= 5));
    ck("G2", "BUILD_STRATEGY_META：五種策略、名稱與 view-model 一致、四項特性為 0–5 整數", metaOk);

    const SEAT_OF = { 坦克: "top", 戰士: "top", 刺客: "jungle", 法師: "mid", 射手: "adc", 輔助: "sup" };
    const enemies = ["戰士", "刺客", "法師", "射手", "輔助"].map((arch) => ({ arch, healer: arch === "輔助", items: [] }));
    const previewBad = [];
    for (const arch of ARCHETYPES) {
      for (const strategy of BUILD_STRATEGIES) {
        const p = sel.previewStrategy({ arch, seatRole: SEAT_OF[arch], strategy, enemies });
        const t = buildTargets({ arch, seatRole: SEAT_OF[arch], strategy, enemies });
        const core = t.targets.filter((id) => getItem(id).tier === "T3").slice(0, 3);
        const boots = t.targets.find((id) => getItem(id).tier === "BOOTS" && id !== "bt_base") ?? null;
        if (JSON.stringify(p.core) !== JSON.stringify(core) || p.boots !== boots || p.early !== t.earlyComponent || p.strategy !== strategy || p.arch !== arch) previewBad.push(`${arch}/${strategy}`);
      }
    }
    ck("G2", "previewStrategy：六定位 × 五策略的核心 3 件、鞋、前期組件＝buildTargets 真實目標序列", previewBad.length === 0, previewBad.slice(0, 5).join(","));
    const adcScaling = sel.previewStrategy({ arch: "射手", seatRole: "adc", strategy: "scaling", enemies });
    const adcEarly = sel.previewStrategy({ arch: "射手", seatRole: "adc", strategy: "early", enemies });
    ck("G2", "預覽確實反映策略差異（射手：後期成型核心 1＝破曉長弓、前期壓制先做疾風弩機）", adcScaling.core[0] === "t3_dawnbow" && adcEarly.early === "t2_gale");
  }
}

// ── G3 UI 隔離 ─────────────────────────────────────────────────────────────────
const UI_DIR = "src/battle/ui/items";
const REQUIRED_UI = ["itemsTheme.js", "ItemGlyphs.jsx", "ItemSlot.jsx", "GoldChip.jsx", "PurchaseToast.jsx", "NextItemCard.jsx",
  "BuildPathTrack.jsx", "CoachNote.jsx", "BuildStrategyCards.jsx", "HeroItemDetail.jsx", "useItemFeedbackMotion.js"];
{
  const missing = REQUIRED_UI.filter((f) => !exists(`${UI_DIR}/${f}`));
  ck("G3", `裝備 UI 元件齊全（${REQUIRED_UI.length} 支）`, missing.length === 0, missing.join(","));
  const files = exists(UI_DIR) ? fs.readdirSync(path.join(ROOT, UI_DIR)).filter((f) => /\.(jsx?|mjs)$/.test(f)) : [];
  const offenders = [];
  for (const f of files) {
    const code = stripComments(read(`${UI_DIR}/${f}`));
    if (/from\s+["'][^"']*\/(LogicEngine|itemEconomy|combatStatsV1|buildPolicy|itemRecipes|itemsEngineRuntime|itemCatalog|itemInventory)(\.js)?["']/.test(code)) offenders.push(`${f}:import`);
    if (/\bledger\b|\bMILLI\b|computeCombatStats|nextStep\(|purchaseCost\(|Math\.random|Date\.now/.test(code)) offenders.push(`${f}:recompute`);
    if (f !== "itemsTheme.js" && /["'`]#[0-9a-fA-F]{3,8}\b/.test(code)) offenders.push(`${f}:hex`);
    if (/innerWidth|matchMedia\(/.test(code) && f !== "useItemFeedbackMotion.js") offenders.push(`${f}:viewport`);
  }
  ck("G3", "元件不 import 規則模組／引擎、不碰帳本或重算、不寫色碼、不自寫寬度判斷", files.length >= REQUIRED_UI.length && offenders.length === 0, offenders.join(","));
  const theme = exists(`${UI_DIR}/itemsTheme.js`) ? read(`${UI_DIR}/itemsTheme.js`) : "";
  ck("G3", "itemsTheme 以 GC 為基底並說明專用色理由", /from\s+["'][^"']*ui\/theme\.js["']/.test(theme) && /專用色/.test(theme));
}

// ── G4 動效 ────────────────────────────────────────────────────────────────────
{
  const rm = exists("src/ui/useReducedMotion.js") ? read("src/ui/useReducedMotion.js") : "";
  ck("G4", "src/ui/useReducedMotion.js 存在，匯出 prefersReducedMotion／useReducedMotion，讀 (prefers-reduced-motion: reduce)",
    /export function prefersReducedMotion/.test(rm) && /export function useReducedMotion/.test(rm) && /\(prefers-reduced-motion: reduce\)/.test(rm));
  const scan = [UI_DIR, "src/debug/ItemsUiGallery"].filter(exists).flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(jsx?|mjs)$/.test(f)).map((f) => `${d}/${f}`));
  const gsapUsers = scan.filter((f) => /from\s+["']gsap["']/.test(read(f)));
  ck("G4", "GSAP 只在 useItemFeedbackMotion.js", gsapUsers.length === 1 && gsapUsers[0].endsWith("useItemFeedbackMotion.js"), gsapUsers.join(","));
  const motion = exists(`${UI_DIR}/useItemFeedbackMotion.js`) ? read(`${UI_DIR}/useItemFeedbackMotion.js`) : "";
  const durations = [...motion.matchAll(/duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  ck("G4", "回饋動效有 reduced-motion 分支，三個 hook 齊全，每段 ≤ 0.6s", /\(prefers-reduced-motion: reduce\)/.test(motion)
    && ["useToastMotion", "useSlotAcquireMotion", "useCardSelectMotion"].every((h) => new RegExp(`export function ${h}`).test(motion))
    && durations.length > 0 && durations.every((d) => d <= 0.6), `durations=${durations.join("/")}`);
  const layoutProps = /\b(width|height|top|left|margin|padding):\s*["'\d]/.test([...motion.matchAll(/gsap\.(?:to|from|fromTo|set)\([^)]*\)/g)].map((m) => m[0]).join("\n"));
  ck("G4", "動效只動 transform／opacity（不動版面屬性）", motion && !layoutProps);
}

// ── G5 樣張頁 ──────────────────────────────────────────────────────────────────
{
  const main = read("src/main.jsx");
  ck("G5", "main.jsx：?debug=items-ui 只在 import.meta.env.DEV 掛載", /import\.meta\.env\.DEV && debugMode === "items-ui"/.test(main));
  const g = exists("src/debug/ItemsUiGallery/ItemsUiGallery.jsx") ? read("src/debug/ItemsUiGallery/ItemsUiGallery.jsx") : "";
  const SECTIONS = ["icons", "slots", "gold", "toast", "next-item", "build-path", "coach-note", "strategy-cards", "hero-detail"];
  const missing = SECTIONS.filter((s) => !g.includes(`"${s}"`));
  ck("G5", "樣張頁含九個必備區塊與 data-gallery-ready", g && missing.length === 0 && /data-gallery-ready/.test(g), missing.join(","));
  ck("G5", "樣張頁讀真實引擎 snapshot（configureItems），不手寫假金錢", /configureItems\(/.test(g) && /selectPlayerItemsView/.test(g) && /selectHudItems/.test(g));
}

// ── G6 M2 未動 ─────────────────────────────────────────────────────────────────
{
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const RULE_FILES = ["itemCatalog", "itemRecipes", "itemInventory", "itemEconomy", "combatStatsV1", "itemEffects", "itemEffectKeys", "buildPolicy", "itemsEngineRuntime", "itemsEngineAdapter", "itemsViewModel", "offlinePurchaseSim"]
    .map((f) => `src/battle/moba/items/${f}.js`);
  const diff = git(["diff", "--name-only", "HEAD", "--", "src/LogicEngine.js", "src/battle/moba/matchProgression.js", "src/platform/contracts", ...RULE_FILES]).trim();
  ck("G6", "LogicEngine、規則集、contracts、M1／M2 裝備模組相對 HEAD 無改動", diff === "", diff);
  let gateOk = true, gateOut = "";
  try { gateOut = execFileSync(process.execPath, ["tools/check_simulation_version_gate.mjs"], { cwd: ROOT, encoding: "utf8" }); } catch (err) { gateOk = false; gateOut = String(err.stdout ?? err.message); }
  ck("G6", "模擬版本閘門綠（仍是 moba-sim.v4）", gateOk, gateOut.split("\n").slice(-3).join(" "));
}

// ── G7 M3b：戰鬥購買回饋的篩選 ─────────────────────────────────────────────────
{
  const sel = await tryLoad("src/battle/moba/items/itemsUiSelectors.js");
  if (typeof sel.selectPurchaseToasts !== "function") {
    ck("G7", "selectPurchaseToasts 存在", false, sel.__error ?? "missing export");
  } else {
    const { LogicEngine } = await load("src/LogicEngine.js");
    const { ROSTER } = await load("src/data/roster.js");
    const { heroById } = await load("src/data/heroDatabase.js");
    const { toEngineItems } = await load("src/battle/moba/items/itemsEngineAdapter.js");
    const { getItem } = await load("src/battle/moba/items/itemCatalog.js");
    const e = new LogicEngine(42);
    e.configureItems(toEngineItems({ roster: ROSTER, heroLookup: heroById }));
    const all = new Map();
    for (let i = 0; i < 2400 && !e.over; i++) {
      e.tick(0.5);
      if (i % 10 === 0) for (const ev of e.snapshot().items.purchases) all.set(ev.seq, ev);
    }
    const events = [...all.values()].sort((a, b) => a.seq - b.seq);
    const fake = { items: { purchases: events } };
    const frozen = JSON.stringify(fake);
    const toasts = sel.selectPurchaseToasts(fake);
    const expected = events.filter((ev) => ev.action !== "dropStarter" && (getItem(ev.itemId).tier === "T3" || (getItem(ev.itemId).tier === "BOOTS" && ev.itemId !== "bt_base")));
    ck("G7", `只挑完成裝與鞋子升級（整場 ${events.length} 筆事件 → ${toasts.length} 則通知）`,
      toasts.length > 0 && toasts.length === expected.length && toasts.every((t, i) => t.seq === expected[i].seq && typeof t.actionLabel === "string" && t.actionLabel.length > 0)
      && toasts.some((t) => getItem(t.itemId).tier === "T3") && toasts.some((t) => getItem(t.itemId).tier === "BOOTS"),
      `expected=${expected.length}`);
    const mid = toasts[Math.floor(toasts.length / 2)].seq;
    ck("G7", "afterSeq 之後的才回傳（HUD 掛載時不補跳舊事件）", sel.selectPurchaseToasts(fake, { afterSeq: mid }).every((t) => t.seq > mid)
      && sel.selectPurchaseToasts(fake, { afterSeq: events.at(-1).seq }).length === 0);
    ck("G7", "純函式；OFF snapshot 回 null", JSON.stringify(fake) === frozen && sel.selectPurchaseToasts({}) === null && sel.selectPurchaseToasts({ items: null }) === null);
  }
}

// ── G8 M3b：戰鬥 HUD 接線 ─────────────────────────────────────────────────────
{
  const hudFile = "src/battle/ui/BattleObserverHUD.jsx";
  const hud = read(hudFile);
  const code = stripComments(hud);
  ck("G8", "戰鬥底層只讀 selector 與裝備元件（不 import 規則模組／引擎、不碰帳本）",
    !/from\s+['"][^'"]*\/(LogicEngine|itemEconomy|combatStatsV1|buildPolicy|itemRecipes|itemsEngineRuntime|itemCatalog|itemInventory)(\.js)?['"]/.test(code)
    && !/\bledger\b|\bMILLI\b|computeCombatStats|nextStep\(|purchaseCost\(/.test(code)
    && /selectHudItems/.test(code));
  ck("G8", "重播不讀裝備（replay ? null : selectHudItems(snapshot)）；itemsV1 OFF 時保留原本「裝備 · 未提供」佔位",
    /const hudItems = replay \? null : selectHudItems\(snapshot\)/.test(code) && /裝備 · 未提供/.test(code) && /本場尚未提供裝備與魔力資訊/.test(code));
  const toasts = exists("src/battle/ui/items/BattlePurchaseToasts.jsx") ? read("src/battle/ui/items/BattlePurchaseToasts.jsx") : "";
  ck("G8", "購買通知：2.5 秒、最多 2 則、pointer-events: none、只用 selectPurchaseToasts 篩選",
    /TOAST_LIFETIME_MS = 2500/.test(toasts) && /MAX_VISIBLE = 2/.test(toasts) && /pointerEvents: "none"/.test(toasts) && /selectPurchaseToasts\(/.test(toasts));
  const layout = read("src/battle/ui/battleLayout.js");
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const untouched = git(["diff", "--name-only", "HEAD", "--",
    "src/screens/moba/MobaReplayScreen.jsx", "src/battle/moba/replay", "src/platform/contracts/mobaReplay.js",
    "src/screens/moba/TacticScreen.jsx", "src/battle/ui/hudStore.js", "src/battle/ui/BattleHUD.jsx", "src/battle/ui/BattleHeroSheet.jsx"]).trim();
  ck("G8", "Replay、TacticScreen、記分板（BattleHUD／hudStore 高度表）、英雄面板（M3c）相對 HEAD 無改動；HUD_H 仍 126",
    untouched === "" && /export const HUD_H = 126;/.test(layout), untouched);
  const css = read("src/battle/ui/battleObserver.css");
  const m3bCss = css.slice(css.indexOf("Item System M3b"));
  ck("G8", "M3b 樣式全部掛在 .items-on／items chip 底下（OFF 版面不受影響），且不改底欄與席位高度",
    css.includes("Item System M3b") && m3bCss.split("\n").filter((l) => l.trim().startsWith(".")).every((l) => /items-on|observer-items-chip|observer-equipment\.items/.test(l))
    && !/min-height:112px|height:52px/.test(m3bCss));
}

const byGate = {};
for (const r of results) {
  byGate[r.gate] ??= { pass: 0, total: 0 };
  byGate[r.gate].total++; if (r.pass) byGate[r.gate].pass++;
  console.log(`${r.pass ? "✅" : "❌"} [${r.gate}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const passed = results.filter((r) => r.pass).length;
console.log("\n" + Object.entries(byGate).map(([g, v]) => `${g} ${v.pass}/${v.total}`).join("  "));
const ok = passed === results.length;
console.log(`MOBA Items M3a: ${passed}/${results.length} ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
