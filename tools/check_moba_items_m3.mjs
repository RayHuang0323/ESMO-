// ============================================================================
//  tools/check_moba_items_m3.mjs — MOBA Item System v1 M3a（UI 基礎＋視覺樣張）驗證器
//
//   G1 itemsV1 開關：production 預設 OFF、DEV 才讀 ?itemsDev=1；實際 vite build 產物不含 DEV 開啟路徑與樣張頁
//   G2 itemsUiSelectors：與 itemsViewModel 同值、純函式、戰術卡預覽＝buildPolicy 真實目標序列
//   G3 UI 隔離：裝備 UI 元件不 import 規則模組、不碰帳本、不自訂色碼、不自寫寬度判斷
//   G4 動效：reduced-motion 共用 hook、GSAP 只在回饋 hook、單次 ≤ 0.6s
//   G5 樣張頁：DEV-only 路由、九個必備區塊
//   G6 M2 未動：引擎、裝備規則模組、contracts 相對 HEAD 無改動；模擬版本閘門綠
//   G7／G8 M3b 戰鬥 HUD；G9／G10 M3c 英雄裝備詳情
//   G11 M3d 出裝策略輸入：五策略 match input、對手固定標準、同 seed 同策略逐位元相同、策略真的改變出裝、預覽＝開局計畫
//   G12 M3d 接線：戰術頁 itemsV1 閘門、選卡存進本場設定、恢復／載入鎖定／GameView 傳入、不用 select
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
  //  M3d：出裝策略經 buildStrategyPrep.matchItemsConfig（我方＝所選、對手＝標準；沒選／非法 ⇒ 標準），且在開關內才計算
  ck("G1", "出裝策略由 opts.buildStrategy 傳入（normalize ⇒ 預設 standard），經 matchItemsConfig 進 configureItems",
    /const buildStrategy = itemsOn && opts\.roster \? normalizeBuildStrategy\(opts\.buildStrategy\) : null;/.test(uls)
    && /matchItemsConfig\(\{ roster: opts\.roster, heroLookup: heroById, buildStrategy \}\)/.test(uls)
    && !/toEngineItems\(/.test(stripComments(uls)));

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
  //  M3c 起英雄面板（BattleHeroSheet）是合法接點，改由 G10 檢查；M3d 起戰術頁（TacticScreen）是合法接點，改由 G12 檢查。
  const untouched = git(["diff", "--name-only", "HEAD", "--",
    "src/screens/moba/MobaReplayScreen.jsx", "src/battle/moba/replay", "src/platform/contracts/mobaReplay.js",
    "src/battle/ui/hudStore.js", "src/battle/ui/BattleHUD.jsx"]).trim();
  ck("G8", "Replay、記分板（BattleHUD／hudStore 高度表）相對 HEAD 無改動；HUD_H 仍 126",
    untouched === "" && /export const HUD_H = 126;/.test(layout), untouched);
  const css = read("src/battle/ui/battleObserver.css");
  const m3bCss = css.slice(css.indexOf("Item System M3b"));
  ck("G8", "M3b 樣式全部掛在 .items-on／items chip 底下（OFF 版面不受影響），且不改底欄與席位高度",
    css.includes("Item System M3b") && m3bCss.split("\n").filter((l) => l.trim().startsWith(".")).every((l) => /items-on|observer-items-chip|observer-equipment\.items/.test(l))
    && !/min-height:112px|height:52px/.test(m3bCss));
}

// ── G9 M3c：教練戰術分析與特效 selector ────────────────────────────────────────
{
  const sel = await tryLoad("src/battle/moba/items/itemsUiSelectors.js");
  if (typeof sel.coachAnalysis !== "function" || typeof sel.selectActiveEffects !== "function") {
    ck("G9", "coachAnalysis／selectActiveEffects 存在", false, sel.__error ?? "missing export");
  } else {
    const view = { decision: { reasons: ["arch:射手", "strategy:counter", "adShare:0.7", "enemyTanks:2>=1→core2", "enemyHeal:1>=1", "counter:situational→core2", "lock:t3_dawnbow", "insufficient:t3_dawnbow", "skip:t3_pierce:unique_conflict"] } };
    const hud = { nextItemId: "t3_dawnbow", nextShortfall: 680 };
    const frozen = JSON.stringify([view, hud]);
    const texts = sel.coachAnalysis(view, hud).map((r) => r.text);
    const expected = ["還差 680 Gold → 破曉長弓", "敵方雙前排 → 優先穿甲", "敵方 1 名回復型 → 補重傷", "反制策略 → 情境裝提前到第 2 件", "敵方物理傷害 70%"];
    ck("G9", "教練分析：理由碼 → 原因 → 行動（經濟→敵情→調整→局勢；同一目標不重複講「繼續合成」；背景句不列）",
      JSON.stringify(texts) === JSON.stringify(expected), texts.join(" | "));
    ck("G9", "沒有 hud 時不編造差價（存錢中）；沒有 view 回空陣列；純函式",
      sel.coachAnalysis(view, null)[0]?.text === "存錢中 → 破曉長弓" && sel.coachAnalysis(null).length === 0 && JSON.stringify([view, hud]) === frozen);
    const fx = sel.selectActiveEffects({ stats: { effects: ["LOW_HP_SHIELD", "ON_HIT", "LOW_HP_SHIELD"] }, status: { grievous: 2.4, slow: 0, magicShield: 120, aura: { armor: 8, mr: 8, moveSpeed: 0 } } });
    ck("G9", "特效去重並翻成中文；狀態只列有值的（被重傷 3 秒、法傷護盾 120、光環抗性）",
      JSON.stringify(fx.effects.map((e) => e.label)) === JSON.stringify(["低血護盾", "攻擊附加傷害"])
      && JSON.stringify(fx.status.map((s) => `${s.label} ${s.value}`)) === JSON.stringify(["被重傷 3 秒", "法傷護盾 120", "光環抗性 +8 甲／+8 魔抗"])
      && sel.selectActiveEffects(null) === null, JSON.stringify(fx));
    const { PRIMITIVES } = await load("src/battle/moba/items/itemEffects.js");
    const unlabeled = Object.entries(PRIMITIVES).filter(([, p]) => !p.statBased).map(([k]) => k).filter((k) => !sel.EFFECT_LABELS[k]);
    ck("G9", "每個效果 primitive 都有中文名稱與說明", unlabeled.length === 0, unlabeled.join(","));

    const { LogicEngine } = await load("src/LogicEngine.js");
    const { ROSTER } = await load("src/data/roster.js");
    const { heroById } = await load("src/data/heroDatabase.js");
    const { toEngineItems } = await load("src/battle/moba/items/itemsEngineAdapter.js");
    const { selectPlayerItemsView } = await load("src/battle/moba/items/itemsViewModel.js");
    const e = new LogicEngine(42);
    e.configureItems(toEngineItems({ roster: ROSTER, heroLookup: heroById }));
    for (let i = 0; i < 1600 && !e.over; i++) e.tick(0.5);
    const snap = e.snapshot();
    const hudAll = sel.selectHudItems(snap);
    const bad = [];
    let rows = 0;
    for (const id of Object.keys(hudAll)) {
      const v = selectPlayerItemsView(snap, id);
      const a = sel.coachAnalysis(v, hudAll[id]);
      rows += a.length;
      for (const r of a) {
        if (!v.decision.reasons.includes(r.code)) bad.push(`${id}:${r.code}`);
        if (r.code.startsWith("insufficient:") && hudAll[id].nextItemId === r.code.slice(13) && hudAll[id].nextShortfall > 0
          && !r.text.includes(hudAll[id].nextShortfall.toLocaleString("en-US"))) bad.push(`${id}:shortfall`);
      }
      if (sel.selectActiveEffects(v).effects.length !== new Set(v.stats.effects).size) bad.push(`${id}:effects`);
    }
    ck("G9", `真實對局 10 人：${rows} 條分析都來自自己的理由碼、差價＝selectHudItems、特效數＝去重後的效果`, rows > 0 && bad.length === 0, bad.slice(0, 5).join(","));
  }
}

// ── G10 M3c：英雄面板接線 ─────────────────────────────────────────────────────
{
  const sheet = stripComments(read("src/battle/ui/BattleHeroSheet.jsx"));
  ck("G10", "英雄面板只讀 view-model／selector（不 import 規則模組、不碰帳本）",
    !/from\s+["'][^"']*\/(LogicEngine|itemEconomy|combatStatsV1|buildPolicy|itemRecipes|itemsEngineRuntime|itemCatalog|itemInventory)(\.js)?["']/.test(sheet)
    && !/\bledger\b|\bMILLI\b|computeCombatStats|nextStep\(|purchaseCost\(/.test(sheet)
    && /selectPlayerItemsView\(snapshot, playerId\)/.test(sheet));
  ck("G10", "「裝備」分頁以 itemsView 閘門；OFF 時原本技能說明原文與面板寬度 340 保留",
    /\{itemsView && \(/.test(sheet) && /itemsView && tab === "items"/.test(sheet) && /本場尚未提供個別技能冷卻、裝備與魔力資訊/.test(sheet)
    && /itemsView \? 380 : 340/.test(sheet) && /layout="embedded"/.test(sheet));
  const obs = stripComments(read("src/battle/ui/BattleObserverHUD.jsx"));
  ck("G10", "入口：手機裝備 sheet 可直達裝備分頁；重播不開英雄面板",
    /onOpenDetail=/.test(obs) && /initialTab=\{detail === 'items' && hudItems \? 'items' : 'battle'\}/.test(obs) && /detail && !replay && <BattleHeroSheet/.test(obs));
  const detail = read("src/battle/ui/items/HeroItemDetail.jsx");
  ck("G10", "詳情分層：三個第二層（出裝路徑／屬性與特效／戰術分析）、一次只開一層、分層鈕 ≥ 44",
    /\["path", "出裝路徑"\], \["stats", "屬性與特效"\], \["analysis", "戰術分析"\]/.test(detail) && /setLayer\(on \? null : id\)/.test(detail) && /minHeight: 44/.test(detail));
}

// ── G11 M3d：出裝策略輸入（match input、determinism、預覽＝開局計畫）──────────────
{
  const prep = await tryLoad("src/battle/moba/items/buildStrategyPrep.js");
  if (typeof prep.matchItemsConfig !== "function" || typeof prep.selectStrategyPrepView !== "function" || typeof prep.normalizeBuildStrategy !== "function") {
    ck("G11", "buildStrategyPrep 匯出 normalizeBuildStrategy／matchItemsConfig／selectStrategyPrepView", false, prep.__error ?? "missing export");
  } else {
    const { LogicEngine } = await load("src/LogicEngine.js");
    const { ROSTER } = await load("src/data/roster.js");
    const { heroById } = await load("src/data/heroDatabase.js");
    const { toEngineItems } = await load("src/battle/moba/items/itemsEngineAdapter.js");
    const { BUILD_STRATEGIES } = await load("src/battle/moba/items/buildPolicy.js");
    const { getItem } = await load("src/battle/moba/items/itemCatalog.js");
    const vm = await load("src/battle/moba/items/itemsViewModel.js");
    const sel = await load("src/battle/moba/items/itemsUiSelectors.js");
    const S = BUILD_STRATEGIES;
    const BLUE = SEATS.slice(0, 5), RED = SEATS.slice(5);
    const rosterFrozen = JSON.stringify(ROSTER);

    ck("G11", "normalizeBuildStrategy：五種原樣；null／空字串／打錯字／大小寫不同 ⇒ standard",
      S.every((s) => prep.normalizeBuildStrategy(s) === s)
      && [null, undefined, "", "Scaling", "aggressive", 3].every((v) => prep.normalizeBuildStrategy(v) === "standard"));

    const inputBad = [];
    for (const s of S) {
      const cfg = prep.matchItemsConfig({ roster: ROSTER, heroLookup: heroById, buildStrategy: s });
      if (!BLUE.every((id) => cfg.players[id].strategy === s)) inputBad.push(`${s}:blue`);
      if (!RED.every((id) => cfg.players[id].strategy === "standard")) inputBad.push(`${s}:red`);
    }
    const none = prep.matchItemsConfig({ roster: ROSTER, heroLookup: heroById });
    ck("G11", "五策略 match input：我方五人＝所選、紅方五人＝standard；沒選 ⇒ 全部 standard 且與 toEngineItems 預設逐欄相同（M2 指紋不變）；沒有名單 ⇒ null",
      inputBad.length === 0 && SEATS.every((id) => none.players[id].strategy === "standard")
      && JSON.stringify(none) === JSON.stringify(toEngineItems({ roster: ROSTER, heroLookup: heroById }))
      && prep.matchItemsConfig({ roster: null, heroLookup: heroById }) === null, inputBad.join(","));

    const TICKS = 2400;
    const run = (strategy) => {
      const e = new LogicEngine(42);
      e.configureItems(prep.matchItemsConfig({ roster: ROSTER, heroLookup: heroById, buildStrategy: strategy }));
      e.tick(0.5);
      const opening = e.snapshot();
      const events = new Map();
      for (let i = 1; i < TICKS && !e.over; i++) {
        e.tick(0.5);
        if (i % 10 === 0) for (const ev of e.snapshot().items.purchases) events.set(ev.seq, ev);
      }
      const last = e.snapshot();
      for (const ev of last.items.purchases) events.set(ev.seq, ev);
      const evs = [...events.values()].sort((a, b) => a.seq - b.seq);
      return {
        opening, final: JSON.stringify(last),
        blue: evs.filter((ev) => ev.playerId[0] === "b").map((ev) => `${ev.playerId}:${ev.action}:${ev.itemId}@${ev.t}`).join(","),
        plan: BLUE.map((id) => opening.items.players[id].plan.buildPath.join(">")).join("|"),
        strategies: Object.fromEntries(SEATS.map((id) => [id, last.items.players[id].strategy])),
      };
    };
    const runs = Object.fromEntries(S.map((s) => [s, [run(s), run(s)]]));
    const nondet = S.filter((s) => runs[s][0].final !== runs[s][1].final || runs[s][0].blue !== runs[s][1].blue);
    ck("G11", `同 seed＋同策略：五種策略各跑兩次 ${TICKS} tick，最終 snapshot 與整場購買紀錄逐位元相同`, nondet.length === 0, nondet.join(","));
    const liveBad = S.filter((s) => !BLUE.every((id) => runs[s][0].strategies[id] === s) || !RED.every((id) => runs[s][0].strategies[id] === "standard")
      || !BLUE.every((id) => vm.selectPlayerItemsView(runs[s][0].opening, id).strategyLabel === sel.BUILD_STRATEGY_META[s].label));
    ck("G11", "引擎 snapshot 的 AI 策略＝match input（我方所選、紅方標準）；view-model 策略名稱＝戰術卡名稱", liveBad.length === 0, liveBad.join(","));
    const purchasesSame = S.filter((s) => s !== "standard" && runs[s][0].blue === runs.standard[0].blue);
    const planSame = S.filter((s) => s !== "standard" && runs[s][0].plan === runs.standard[0].plan);
    ck("G11", "策略真的改變 AI：四種非標準策略的我方開局出裝路徑與整場購買紀錄都和標準不同",
      purchasesSame.length === 0 && planSame.length === 0, `purchasesSame=${purchasesSame} planSame=${planSame}`);

    const t3 = (ids) => ids.filter((id) => getItem(id).tier === "T3").slice(0, 3).join(",");
    const bootsOf = (ids) => ids.find((id) => getItem(id).tier === "BOOTS" && id !== "bt_base") ?? null;
    const previewBad = [];
    for (const s of S) {
      for (const seat of BLUE) {
        const v = prep.selectStrategyPrepView({ roster: ROSTER, heroLookup: heroById, focusSeat: seat });
        const p = runs[s][0].opening.items.players[seat];
        if (v.focusSeat !== seat || v.previews[s].core.join(",") !== t3(p.plan.buildPath) || v.previews[s].boots !== bootsOf(p.plan.buildPath)) previewBad.push(`${s}/${seat}`);
        const vs = v.seats.find((x) => x.seat === seat);
        if (!vs || vs.arch !== p.arch || vs.seatRole !== p.seatRole || vs.heroId !== p.heroId) previewBad.push(`${s}/${seat}:seat`);
      }
    }
    ck("G11", "戰術卡預覽＝引擎開局計畫：五策略 × 我方五席的核心 3 件、升級鞋、英雄、定位、席位角色逐一相同", previewBad.length === 0, previewBad.slice(0, 5).join(","));

    const broken = { ...ROSTER, b2: { ...ROSTER.b2, heroId: "no_such_hero" }, r3: { ...ROSTER.r3, heroId: null } };
    const e2 = new LogicEngine(7);
    e2.configureItems(prep.matchItemsConfig({ roster: broken, heroLookup: heroById, buildStrategy: "counter" }));
    e2.tick(0.5);
    const bp = e2.snapshot().items.players;
    const bv = prep.selectStrategyPrepView({ roster: broken, heroLookup: heroById, focusSeat: "b2" });
    //  預設預覽＝核心預覽差異最多的我方英雄（同分：射手席 → 中路席 → 席位順序）。
    //  M3d 瀏覽器實測：選角後射手席是戰士，五種策略核心三件完全相同 ⇒ 另外以「射手席換成戰士」的名單驗一次。
    const ROLE_RANK = { adc: 0, mid: 1 };
    const expectedFocus = (roster) => {
      const seats = prep.selectStrategyPrepView({ roster, heroLookup: heroById }).seats;
      const spread = (seat) => new Set(S.map((s) => prep.selectStrategyPrepView({ roster, heroLookup: heroById, focusSeat: seat }).previews[s].core.join(","))).size;
      return seats.map((x, i) => ({ seat: x.seat, n: spread(x.seat), rank: ROLE_RANK[x.seatRole] ?? 2, i }))
        .sort((a, b) => b.n - a.n || a.rank - b.rank || a.i - b.i)[0];
    };
    const warriorAdc = { ...ROSTER, b4: { ...ROSTER.b4, heroId: ROSTER.r1.heroId } };
    const dflt = prep.selectStrategyPrepView({ roster: ROSTER, heroLookup: heroById });
    const dflt2 = prep.selectStrategyPrepView({ roster: warriorAdc, heroLookup: heroById });
    const exp1 = expectedFocus(ROSTER), exp2 = expectedFocus(warriorAdc);
    ck("G11", "預設預覽＝核心預覽差異最多的我方英雄（同分射手→中路→席位；射手席換成戰士時不會停在五張一樣的預覽）、指定紅方席位無效；缺英雄資料的席位（b2、敵方 r3）定位退路與引擎相同、預覽仍＝引擎開局計畫；不改輸入",
      dflt.focusSeat === exp1.seat && dflt.spread === exp1.n && exp1.n >= 2
      && dflt2.focusSeat === exp2.seat && dflt2.spread === exp2.n && exp2.n >= 2
      && dflt.seats.length === 5 && dflt.opponentStrategy === "standard"
      && prep.selectStrategyPrepView({ roster: ROSTER, heroLookup: heroById, focusSeat: "r1" }).focusSeat === dflt.focusSeat
      && bp.b2.archSource === "seatFallback" && bv.seats.find((x) => x.seat === "b2").arch === bp.b2.arch
      && bv.previews.counter.core.join(",") === t3(bp.b2.plan.buildPath)
      && prep.selectStrategyPrepView({ roster: null, heroLookup: heroById }) === null && JSON.stringify(ROSTER) === rosterFrozen,
      JSON.stringify({ focus: dflt.focusSeat, b2: [bp.b2.archSource, bp.b2.arch, bv.seats.find((x) => x.seat === "b2")?.arch] }));
  }
}

// ── G12 M3d：戰術頁接線 ─────────────────────────────────────────────────────────
{
  const tcode = stripComments(read("src/screens/moba/TacticScreen.jsx"));
  ck("G12", "戰術頁出裝策略區受 itemsV1 閘門（與 useLocalServer 同式）；OFF ⇒ prep 為 null ⇒ 不渲染、onNext 第二參數為 null",
    /featureEnabled\("itemsV1"\) \|\| \(import\.meta\.env\.DEV && itemsDevRequested\(\)\)/.test(tcode)
    && /itemsOn && roster \? selectStrategyPrepView\(/.test(tcode) && /\{prep && \(/.test(tcode) && /onNext\(applied, prep \? buildStrategy : null\)/.test(tcode));
  ck("G12", "戰術頁只讀 selector 與卡片元件（不 import 規則模組／引擎、不自己算出裝）、名單與 Loading／GameView 同一個 draftRoster；沒有 select；預覽英雄鈕 44×44",
    !/from\s+["'][^"']*\/(LogicEngine|itemEconomy|combatStatsV1|buildPolicy|itemRecipes|itemsEngineRuntime|itemCatalog|itemInventory|itemsEngineAdapter)(\.js)?["']/.test(tcode)
    && !/buildTargets\(|previewStrategy\(|nextStep\(|toEngineItems\(/.test(tcode) && !/<select\b/.test(tcode)
    && /draftRoster\(roster, draft\)/.test(tcode) && /width: 44, height: 44/.test(tcode) && /layout="prep"/.test(tcode));
  const shell = read("src/AppShell.jsx");
  ck("G12", "AppShell：選卡當下存進本場設定、開始載入寫入 tactic＋buildStrategy（OFF 只寫 tactic）、恢復時接回、Loading／GameView 拿同一個值",
    shell.includes("onBuildStrategyChange={(s) => useProfileStore.getState().setActiveMatchContext({ config: { buildStrategy: s } })}")
    && shell.includes("config: s ? { tactic: t, buildStrategy: s } : { tactic: t }")
    && shell.includes("setBuildStrategy(config.buildStrategy ?? null);")
    && shell.includes("<TacticScreen roster={battleRoster} draft={draft}")
    && shell.includes("<LoadingScreen draft={draft} tactic={tactic} buildStrategy={buildStrategy}")
    && shell.includes("<GameView autoStart draft={draft} tactic={tactic} buildStrategy={buildStrategy}"));
  const gv = stripComments(read("src/GameView.jsx"));
  const ulsCode = stripComments(read("src/useLocalServer.js"));
  ck("G12", "GameView 把 buildStrategy 交給 start()；useLocalServer 只在開關內把策略寫進本場設定（OFF 存檔形狀不變）",
    /tactic = null, buildStrategy = null \}\)/.test(gv) && /start\(\{\s*tactic,\s*buildStrategy,/.test(gv)
    && /\.\.\.\(buildStrategy \? \{ buildStrategy \} : \{\}\)/.test(ulsCode));
  const cards = stripComments(read("src/battle/ui/items/BuildStrategyCards.jsx"));
  const loading = stripComments(read("src/screens/moba/LoadingScreen.jsx"));
  ck("G12", "卡片：桌機一排五張、手機橫向滑動（scroll-snap）、locked 不可點且顯示「本場已鎖定」；載入頁只在有策略時顯示鎖定",
    /repeat\(\$\{metas\.length\}, minmax\(0, 1fr\)\)/.test(cards) && /scrollSnapType: "x mandatory"/.test(cards) && /disabled=\{locked\}/.test(cards)
    && /本場已鎖定/.test(cards) && /\{buildStrategy && \(/.test(loading) && /<BuildStrategyLockedChip strategy=\{buildStrategy\} \/>/.test(loading));
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
