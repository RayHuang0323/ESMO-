# MOBA 裝備 UI M3c（Hero Item Detail）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 本輪由 Owner 指定在同一 session inline 執行。

**Goal:** 戰鬥中點開單一英雄時，看得到完整的裝備詳情（背包、金錢、下一件與還差多少、合成樹／出裝路徑、教練戰術分析、戰鬥屬性、裝備特效與狀態），桌機面板＋手機全螢幕 sheet；itemsV1 OFF 時完全不出現，完成後停止等 Owner Review。

**Architecture:**
- 接點是既有的戰鬥英雄面板 `src/battle/ui/BattleHeroSheet.jsx`（底欄頭像開啟）。
  - 有 `snapshot.items` 時多兩個分頁「戰鬥資訊｜裝備」；沒有時面板逐字維持原樣。
  - 手機 M3b 裝備 sheet 加「完整出裝詳情」直達裝備分頁。
- 裝備分頁＝M3a `HeroItemDetail` 的 embedded 版型，改成分層：常駐第一層＋分段控制三層（一次只開一層）。
- 教練分析與特效文字由 selector 從 view-model 翻譯，JSX 不算數字。

**Tech Stack:** React 18、M3a／M3b 元件、CDP browser harness（真實戰鬥頁 `?debug=moba-runtime-battle&itemsDev=1`，同一場戰鬥內 resize 量測）。

**Spec:** `docs/design/MOBA_裝備UI_M3規格_v1.md` §9 M3c＋Owner M3c 指示（2026-09-15）。

## Global Constraints

- 不改 `LogicEngine`、`dmgK`、收入、裝備平衡、Replay、`TacticScreen`；production `FEATURE_FLAGS.itemsV1` 維持 `false`。
- 只聚焦單一英雄；十人資訊不進 Hero Detail。
- JSX 不重算金錢／屬性／AI 決策：
  - 只讀 `selectPlayerItemsView`、`selectHudItems`、`coachAnalysis`、`selectActiveEffects`、`itemVisual`。
  - 百分比欄位只做「×100 取整」的顯示格式。
- 手機 320／390：
  - 可點元素 ≥ 44×44、不靠 hover、無水平溢出。
  - 分層：常駐第一層＋一次只展開一層。
- 沿用「鍛爐插槽」視覺，不重做圖示美術。
- 既有 320px「隊伍」鈕 18px：M3c 不碰底欄，**不修**（避免順手重構手機 HUD）。

## 資料增補（`itemsUiSelectors.js`）

| 出口 | 內容 |
|---|---|
| `coachAnalysis(view, hud)` | 理由碼 → `{ code, kind: economy｜threat｜adjust｜info, cause, action, text }`，依 經濟→敵情→調整→局勢 排序 |
| `EFFECT_LABELS` | 效果 type → 名稱與一句說明 |
| `selectActiveEffects(view)` | `{ effects: [{type,label,hint}], status: [{kind,label,value,tone}] }`；OFF／無 view 回 null |

`coachAnalysis` 對照（數字只來自理由碼與 `hud.nextShortfall`）：

| 理由碼 | 文字 |
|---|---|
| `insufficient:X`（hud 目標＝X） | 還差 N Gold → X 名稱 |
| `lock:X`（無同目標存錢句時） | 繼續合成 → X 名稱 |
| `complete` | 六件出裝已完成 |
| `enemyTanks:n>=t…` | 敵方雙前排（n=2）／敵方 n 名前排 → 優先穿甲 |
| `enemyHeal:n>=t` | 敵方 n 名回復型 → 補重傷 |
| `enemyBurst:n>=t` | 敵方 n 名爆發型 → 補魔抗保命 |
| `counter`／`survival`／`scaling` | 反制／保命／後期策略 → 情境裝提前到第 2 件／保命裝提前到第 2 件／奢侈核心提前到第 1 件 |
| `deathsRecent:n→…` | 近期陣亡 n 次 → 保命裝提前 |
| `behindGold→…` | 經濟落後 → 先補最便宜的核心 |
| `lateKd:k→…` | 表現領先（KD k）→ 衝奢侈裝 |
| `adShare:x`（≥0.62／≤0.45） | 敵方物理傷害 x%／敵方魔法傷害 (1−x)%（局勢，無箭頭） |

（各 action 已對照 `buildPolicy` 的情境裝：前排＝穿甲／破甲、回復＝重傷、爆發＝魔抗保命。）

## 版面

| 層 | 內容 |
|---|---|
| 常駐 | 英雄＋可用金、6 格（點格子看名稱與階級）、下一件卡（還差多少＋進度＋組件）、教練重點 2 條 |
| 出裝路徑 | 出裝路徑鏈＋下一件的多層合成樹（已擁有打勾） |
| 屬性與特效 | 戰鬥屬性格（非 0）＋裝備特效（名稱＋一句說明）＋目前狀態（重傷／緩速／法傷護盾／光環） |
| 戰術分析 | 全部教練分析 |

- 桌機：面板 340→380px（只在有裝備時）。
- 手機：既有全螢幕 sheet，分頁鈕與分層鈕都 ≥ 44。

## Tasks

- [ ] Task 1：selectors ＋ G9 單元檢查（合成假 view 的精確文字、真 snapshot 的來源一致、OFF／純函式）。
- [ ] Task 2：`CoachAnalysis`、`RecipeTree`、`ActiveEffects`、`HeroItemDetail`（embedded＋分層，向下相容樣張頁 props）、`TONE` token、`NextItemCard` data 屬性。
- [ ] Task 3：`BattleHeroSheet` 分頁（`itemsView &&` 閘門、OFF 原文不變）、`BattleObserverHUD` 傳 `initialTab`／`onOpenDetail`、`MobileItemsSheet` 入口；G10 靜態檢查＋G8 untouched 清單移除 `BattleHeroSheet`。
- [ ] Task 4：`tools/browser_review_moba_items_m3c.mjs`：
  - OFF 390／1366：面板沒有分頁、沒有裝備 DOM、原文還在。
  - ON：一場真實戰鬥 4 倍速到有人完成裝，桌機從十人列選該英雄、手機從裝備 sheet 選該英雄。
  - 1366→768→390→320 resize 量測：
    - 金錢／6 格／下一件／還差／教練分析／屬性／特效＝同一 ts 的 selector。
    - 三層逐一開啟且一次只一層。
    - 無溢出、手機 ≥ 44、console 不比 OFF 多、截圖。
- [ ] Task 5：M1／M2／M3、build、regress（一支一支跑）；備份後追加 Sprint／風險；local commit；停止。
