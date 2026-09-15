# MOBA 裝備 UI M3a（基礎＋視覺樣張）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 本輪由 Owner 指定在同一 session inline 執行（不派 subagent）。

**Goal:** 建好裝備 UI 的資料出口、開關、視覺元件與 DEV 樣張頁，產出 320／390／768／1366 截圖交 Owner Review，然後停止。

**Architecture:**
- 資料：`snapshot.items` → `itemsViewModel`（M2）＋新 `itemsUiSelectors`（純函式）。
- 呈現：`src/battle/ui/items/` 的無狀態元件＋一支 GSAP 回饋 hook。
- 樣張：`?debug=items-ui`（DEV only）在頁內跑真實引擎，渲染全部元件。
- 開關：production 恆 OFF，DEV 用 `?itemsDev=1` 才讓 `useLocalServer` 呼叫 `configureItems`。

**Tech Stack:** React 18（inline style）、Vite 5、gsap＋@gsap/react（既有）、Node 驗證器（無測試框架）、CDP browser harness（`tools/browser/harness.mjs`）。

**Spec:** `docs/design/MOBA_裝備UI_M3規格_v1.md`

## Global Constraints

- 不改 `src/LogicEngine.js`、裝備規則模組的行為（`itemCatalog／itemRecipes／itemInventory／itemEconomy／combatStatsV1／itemEffects／buildPolicy／itemsEngineRuntime`）、`dmgK`、收入。
- `FEATURE_FLAGS.itemsV1 = false`；DEV opt-in query 名稱固定為 `itemsDev`，值 `"1"`。
- UI 元件不得 import `itemEconomy`／`combatStatsV1`／`buildPolicy`／`itemRecipes`／`itemsEngineRuntime`／`itemCatalog`／`LogicEngine`；只讀 `itemsViewModel`、`itemsUiSelectors`、`itemsTheme`。
- 元件檔不寫十六進位色碼；裝備專用色只在 `itemsTheme.js`。
- 響應式只用 `useIsMobile()`；手機可點元素 ≥ 44×44（`data-touch` 標記）。
- 動效只在 `useItemFeedbackMotion.js`，必走 reduced-motion 分支，單次 ≤ 0.6s，只動 transform／opacity。
- 截圖寬度：320、390、768、1366；輸出 `review/moba-items-m3a/`。
- 本地 commit；不 push、不 deploy；M3a 完成後停止。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/featureFlags.js` | 改 | 新增 `itemsV1: false` 與說明 |
| `src/ui/itemsDevFlag.js` | 新 | `ITEMS_DEV_QUERY`、`itemsDevRequested(search)` |
| `src/useLocalServer.js` | 改 | 受開關保護的 `configureItems` ＋ `opts.buildStrategy` |
| `src/battle/moba/items/itemsUiSelectors.js` | 新 | `SLOT_STATES`、`GLYPH_KEYS`、`itemVisual`、`selectHudItems`、`coachNotes`、`BUILD_STRATEGY_META`、`previewStrategy` |
| `src/ui/useReducedMotion.js` | 新 | `prefersReducedMotion()`、`useReducedMotion()` |
| `src/battle/ui/items/itemsTheme.js` | 新 | 階級／流派色、插槽尺寸、切角 clip-path |
| `src/battle/ui/items/ItemGlyphs.jsx` | 新 | 圖紋 SVG path 表＋`ItemIcon`、`StrategyEmblem`、`CoinIcon`、`HeadsetIcon` |
| `src/battle/ui/items/ItemSlot.jsx` | 新 | `ItemSlot`、`InventoryBar` |
| `src/battle/ui/items/GoldChip.jsx` | 新 | `GoldChip` |
| `src/battle/ui/items/PurchaseToast.jsx` | 新 | `PurchaseToast` |
| `src/battle/ui/items/NextItemCard.jsx` | 新 | `NextItemCard` |
| `src/battle/ui/items/BuildPathTrack.jsx` | 新 | `BuildPathTrack` |
| `src/battle/ui/items/CoachNote.jsx` | 新 | `CoachNote` |
| `src/battle/ui/items/BuildStrategyCards.jsx` | 新 | `BuildStrategyCards` |
| `src/battle/ui/items/HeroItemDetail.jsx` | 新 | `HeroItemDetail`（組合前述元件） |
| `src/battle/ui/items/useItemFeedbackMotion.js` | 新 | `useToastMotion`、`useSlotAcquireMotion`、`useCardSelectMotion` |
| `src/debug/ItemsUiGallery/ItemsUiGallery.jsx` | 新 | DEV 樣張頁 |
| `src/main.jsx` | 改 | `import.meta.env.DEV && debugMode === "items-ui"` 路由 |
| `tools/check_moba_items_m3.mjs` | 新 | M3a 驗證器 |
| `tools/browser_review_moba_items_m3a.mjs` | 新 | 四寬度截圖＋版面量測 |
| `tools/check_moba_items_m2.mjs`、`tools/check_moba_items_m1.mjs` | 改 | 呼叫點／importer 白名單放寬為「受開關保護」 |

---

### Task 1：itemsV1 開關（production OFF、DEV opt-in）

**Files:** Modify `src/featureFlags.js`、`src/useLocalServer.js:207-224`、`tools/check_moba_items_m2.mjs`（G8）、`tools/check_moba_items_m1.mjs`（G13）；Create `src/ui/itemsDevFlag.js`、`tools/check_moba_items_m3.mjs`（G1 區段）。

**Interfaces:**
- Produces: `FEATURE_FLAGS.itemsV1: false`；`ITEMS_DEV_QUERY = "itemsDev"`；`itemsDevRequested(search?: string): boolean`；`useLocalServer.start(opts)` 讀 `opts.buildStrategy`。

- [ ] **Step 1：寫 M3 驗證器 G1（先紅）**

```js
// tools/check_moba_items_m3.mjs（G1 節錄）
const { FEATURE_FLAGS } = await load("src/featureFlags.js");
const { ITEMS_DEV_QUERY, itemsDevRequested } = await load("src/ui/itemsDevFlag.js");
ck("G1", "FEATURE_FLAGS.itemsV1 預設 false", FEATURE_FLAGS.itemsV1 === false);
ck("G1", "itemsDevRequested 只認 ?itemsDev=1", ITEMS_DEV_QUERY === "itemsDev"
  && itemsDevRequested("?itemsDev=1") && !itemsDevRequested("?itemsDev=0") && !itemsDevRequested("") && !itemsDevRequested("?items=1"));
const uls = read("src/useLocalServer.js");
ck("G1", "useLocalServer 的 configureItems 只在 featureEnabled(itemsV1) || (import.meta.env.DEV && itemsDevRequested()) 時呼叫",
  /featureEnabled\("itemsV1"\)\s*\|\|\s*\(import\.meta\.env\.DEV && itemsDevRequested\(\)\)/.test(uls) && (uls.match(/configureItems\(/g) ?? []).length === 1);
```

- [ ] **Step 2：跑 `node tools/check_moba_items_m3.mjs`，預期 FAIL（模組不存在）**

- [ ] **Step 3：實作**

```js
// src/ui/itemsDevFlag.js
export const ITEMS_DEV_QUERY = "itemsDev";
export function itemsDevRequested(search = typeof window !== "undefined" ? window.location.search : "") {
  try { return new URLSearchParams(search).get(ITEMS_DEV_QUERY) === "1"; } catch { return false; }
}
```

```js
// src/featureFlags.js（FEATURE_FLAGS 內新增）
  /** MOBA 裝備系統 v1。正式站預設 OFF；Balance Closure 才改。DEV 用 `?itemsDev=1`（見 useLocalServer）。 */
  itemsV1: false,
```

```js
// src/useLocalServer.js（configureMatch 區塊之後）
    const itemsOn = featureEnabled("itemsV1") || (import.meta.env.DEV && itemsDevRequested());
    if (itemsOn && opts.roster) {
      const itemsCfg = toEngineItems({ roster: opts.roster, heroLookup: heroById, defaultStrategy: opts.buildStrategy ?? "standard" });
      if (itemsCfg) eng.configureItems(itemsCfg);
    }
```

M2 G8／M1 G13：呼叫者白名單加入 `src/useLocalServer.js`（必須同時符合上面的保護 regex）；importer 白名單加入 `src/useLocalServer.js`、`src/debug/`、`src/battle/ui/items/`。

- [ ] **Step 4：G1 綠、`check_moba_items_m1` 69/69、`check_moba_items_m2` 53/53**

### Task 2：`itemsUiSelectors`

**Files:** Create `src/battle/moba/items/itemsUiSelectors.js`；Test `tools/check_moba_items_m3.mjs` G2。

**Interfaces:**
- Consumes: `getItem`、`ITEM_IDS`（catalog）、`buildTargets`、`BUILD_STRATEGIES`（buildPolicy）、`STRATEGY_LABELS`（viewModel）。
- Produces:

```js
SLOT_STATES: readonly string[]
GLYPH_KEYS: readonly string[]
itemVisual(itemId: string|null): { itemId, name, tier, family, price, state, glyph } | null
selectHudItems(snapshot): { [seat]: { side, unspent, completedCount, slots: {index,itemId,state}[6], nextItemId, nextRemainingCost, nextProgress } } | null
coachNotes(view, max = 2): { code, text }[]
BUILD_STRATEGY_META: { [id]: { id, label, pitch, traits: { early, late, survive, counter }, emblem } }
previewStrategy({ arch, seatRole, strategy, enemies = [] }): { strategy, arch, early: string|null, boots: string|null, core: string[] }
```

- [ ] **Step 1：G2 檢查（先紅）**
  - 88 件 `itemVisual` 的 glyph 都在 `GLYPH_KEYS`、state 都在 `SLOT_STATES`，T3 一律 `completed`。
  - 真引擎 seed 7 推進 1440 tick：`selectHudItems` 與 `selectPlayerItemsView` 的 unspent、inventory、完成數、下一件逐席位相同。
  - OFF snapshot 回 null；呼叫前後 snapshot 逐位元相同。
  - `BUILD_STRATEGY_META` 的 key 等於 `BUILD_STRATEGIES`，label 等於 `STRATEGY_LABELS`，traits 為 0–5 整數。
  - `previewStrategy` 六定位 × 五策略：core 等於 `buildTargets` 目標序列裡前 3 件 T3。
  - 射手：scaling 的 core[0] 是 `t3_dawnbow`，early 的 `early` 是 `t2_gale`。
  - `coachNotes` ≤ 2 且文字都出現在 `view.decision.text`。
- [ ] **Step 2：確認 FAIL**
- [ ] **Step 3：實作（glyph 規則）**
  - T3 → `family:<A–H>`；BOOTS → `boots`；STARTER → `starter`。
  - T1／T2 → 該物品自己的 `stats` 物件中，第一個屬於可辨識集合的屬性 `stat:<key>`。
    可辨識集合：`ad, ap, attackSpeed, critChance, armor, mr, hp, abilityHaste, lifesteal, healShieldPower, regenPctPerSec, moveSpeed`。
    （實作時修正：用物品自己的屬性順序，守護聖徽才會是治療強度而不是生命。）
- [ ] **Step 4：`coachNotes` 排除規則**
  - 略過 `arch:`、`strategy:`、`adShare:` 開頭；其餘依原順序取前 `max` 句。
  - 若剩 0 句且有 `strategy:` ⇒ 回策略那句。
- [ ] **Step 5：G2 綠**

### Task 3：Token、圖紋、插槽、金錢、reduced motion

**Files:** Create `src/ui/useReducedMotion.js`、`itemsTheme.js`、`ItemGlyphs.jsx`、`ItemSlot.jsx`、`GoldChip.jsx`；Test G3（靜態隔離掃描）、G4（動效規則）。

**Interfaces:**
- Produces:
  - `prefersReducedMotion(): boolean`、`useReducedMotion(): boolean`
  - `TIER_RIM`、`FAMILY_TINT`、`SLOT_SIZE = { xs:20, sm:30, md:40, lg:48 }`、`chamfer(pct)`、`TEXT`
  - `ItemIcon({ glyph, size })`、`StrategyEmblem({ id, size })`、`CoinIcon({ size })`、`HeadsetIcon({ size })`
  - `ItemSlot({ visual, size, highlight, selected, onSelect, acquireKey })`、`InventoryBar({ slots, size, onSelect, selectedIndex })`
  - `GoldChip({ amount, size })`

- [ ] **Step 1：G3 靜態掃描（先紅）**
  - `src/battle/ui/items/**`：不得 import 禁用模組；不得出現 `ledger`、`MILLI`、`computeCombatStats`、`nextStep(`、`purchaseCost(`、`Math.random`、`Date.now`。
  - 十六進位色碼只允許在 `itemsTheme.js`。
  - `useIsMobile` 以外不得出現 `innerWidth`／`matchMedia(`（`useReducedMotion.js` 除外）。
- [ ] **Step 2：G4**
  - `gsap` 只被 `useItemFeedbackMotion.js` import，且含 `(prefers-reduced-motion: reduce)` 分支。
  - 所有 `duration:` ≤ 0.6。
  - `useReducedMotion.js` 讀 `(prefers-reduced-motion: reduce)`。
- [ ] **Step 3：實作元件**
  - 插槽：`clip-path: chamfer(22)` 外框層＋內層兩層 div。
  - completed：金色外框＋`boxShadow inset` 金光。
  - empty：`rgba(255,255,255,0.05)` 底＋虛線（用 SVG 描邊，clip-path 會吃掉 border）。
- [ ] **Step 4：G3／G4 綠**

### Task 4：NextItemCard／BuildPathTrack／CoachNote／HeroItemDetail

**Files:** Create 四個元件檔。

**Interfaces:**
- Consumes: Task 2 selectors、Task 3 元件。
- Produces:
  - `NextItemCard({ nextItem, unspent, progress })`
  - `BuildPathTrack({ buildPath })`
  - `CoachNote({ notes })`
  - `HeroItemDetail({ view, notes, progress, heroId, heroName, side, expanded, onToggle, layout: "panel"|"sheet" })`

- [ ] **Step 1：實作**
  - 屬性格只列非 0，順序固定：生命、攻擊、法強、護甲、魔抗、攻速（%）、暴擊（%）、護甲穿透、魔法穿透、吸血（%）、全能吸血（%）、技能急速。
  - 百分比欄位顯示 `Math.round(v*100)%`。這是呈現格式，不是重算：值已由 view-model 提供。
- [ ] **Step 2：G3 綠（新檔也受掃描）**

### Task 5：BuildStrategyCards、PurchaseToast、GSAP 回饋

**Files:** Create `BuildStrategyCards.jsx`、`PurchaseToast.jsx`、`useItemFeedbackMotion.js`。

**Interfaces:**
- Produces:
  - `BuildStrategyCards({ selected, onSelect, previews })`（previews: `{ [strategy]: previewStrategy() 回傳 }`）
  - `PurchaseToast({ event, heroName, visual, replayKey })`
  - `useToastMotion(ref, { completed, replayKey })`、`useSlotAcquireMotion(ref, acquireKey)`、`useCardSelectMotion(ref, selected)`

- [ ] **Step 1：motion hook（範例：toast）**

```js
export function useToastMotion(rootRef, { completed, replayKey }) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const shine = root.querySelector("[data-toast-shine]");
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(root, { autoAlpha: 1, x: 0 });
      if (shine) gsap.set(shine, { autoAlpha: 0 });
    });
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.fromTo(root, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.36 });
      if (completed && shine) tl.fromTo(shine, { xPercent: -120, autoAlpha: 0.9 }, { xPercent: 220, autoAlpha: 0, duration: 0.5, ease: "power1.inOut" }, "-=0.1");
      return () => tl.kill();
    });
    return () => media.revert();
  }, { scope: rootRef, dependencies: [replayKey, completed], revertOnUpdate: true });
}
```

- [ ] **Step 2：戰術卡**
  - 整張 `<button aria-pressed>`，`data-touch`。
  - 選中顯示勾徽章與「已選擇」。
  - 刻度 5 段 div，亮段數 = trait。
- [ ] **Step 3：G3／G4 綠**

### Task 6：DEV 樣張頁

**Files:** Create `src/debug/ItemsUiGallery/ItemsUiGallery.jsx`；Modify `src/main.jsx`。

**Interfaces:**
- Consumes: LogicEngine＋configure 流程（同 `ItemInspector.jsx` 的 `createEngine`）、全部 items UI 元件、selectors。
- Produces: DOM `data-gallery-section="icons|slots|gold|toast|next-item|build-path|coach-note|strategy-cards|hero-detail"`、`data-gallery-ready="1"`。

- [ ] **Step 1：G5（先紅）**
  - `main.jsx` 含 `import.meta.env.DEV && debugMode === "items-ui"`。
  - 樣張檔含九個 section id。
- [ ] **Step 2：實作**
  - 首次 render 顯示「正在產生真實對局樣張…」。
  - `setTimeout(0)` 後同步推進 1440 tick 並 `setState`。
  - 樣張來源：
    - toast：購買事件中最新的 T3 合成、鞋升級、一般組件各一筆。
    - 詳情：`b4`。
    - 戰術卡預覽：`b4` 定位對紅方陣容。
- [ ] **Step 3：G5 綠；`npm run build` 通過；build 產物無 `ItemsUiGallery`／`itemsDev`（G1 build 掃描）**

### Task 7：四寬度截圖與版面量測

**Files:** Create `tools/browser_review_moba_items_m3a.mjs`。

- [ ] **Step 1：實作**
  - `runGate` 起 vite dev，依序 `Emulation.setDeviceMetricsOverride` 320×720、390×844、768×1024、1366×900。
  - 每個寬度：navigate `?debug=items-ui`，等 `data-gallery-ready`。
  - 量測：九區塊、無水平溢出、≤700 時 `[data-touch]` ≥ 44×44、console／page 錯誤 0。
  - 輸出：整頁截圖 `gallery-<w>.png`；320 與 1366 另存 `hero-detail-<w>.png`、`strategy-cards-<w>.png` 近拍（clip = 區塊 rect）。
  - 390 寬再以 `Emulation.setEmulatedMedia` 設 `prefers-reduced-motion: reduce` 重載，確認 toast `opacity` 為 1。
- [ ] **Step 2：`node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3a.mjs --timeout 600000` PASS**
- [ ] **Step 3：人工看截圖自我檢查**
  - 對照 §5「修正 1–3」與 frontend-design 自評：拿掉一個多餘裝飾。
  - 必要時調整後重跑。

### Task 8：收尾

- [ ] 備份後追加 `05_Sprint紀錄.md`、`08_目前待辦與風險.md`。
- [ ] 跑：`npm run build`、`check_moba_items_m1`、`check_moba_items_m2`、`check_moba_items_m3`、browser review。
- [ ] `git add` 明確檔案（含 `review/moba-items-m3a/*.png`）→ local commit。
- [ ] 回報（繁中）＋未經真機實測清單 → **停止，等 Owner Review**。
