# MOBA 裝備 UI M3d 實作計畫 v1 — Build Strategy UI

> 狀態：Owner Review M3c APPROVED 後開始（2026-09-15）。只做 M3d，不開始 M3e Replay。
> 規格來源：`docs/design/MOBA_裝備UI_M3規格_v1.md` §3、§6.9、§9（M3d）；Owner 決策 D4（全隊一種、對手固定標準）。

## 全域限制（Owner 照錄）

- 五種策略：標準／前期壓制／後期成型／反制優先／保命優先，正式接進 Prep／Tactic 流程。
- 沿用 M3a Strategy Card 視覺；桌機一排五張；手機橫向滑動；不用 select／dropdown；觸控 ≥ 44px。
- 每張卡：名稱、一句白話說明、前期／後期／保命／反制傾向、三件核心裝預覽、selected／locked 狀態。
- 資料直接用 buildPolicy／previewStrategy；UI 不另算出裝；全隊同一策略；不做單英雄 override。
- 選了就是本場 itemsV1 的 buildStrategy input；同 seed＋同策略＝deterministic；不選＝標準；production itemsV1 仍 OFF。
- 不動：LogicEngine、dmgK、income、item balance、Replay。
- 驗證：五策略存入 match input、UI 顯示＝實際 AI 策略、refresh／route transition 不丟失、M1／M2／M3、build／regress、320／390／768／1366、console clean。
- local commit，不 push、不 deploy，停止等 Owner Review。

## 資料流

```
TacticScreen（itemsV1 開啟時才顯示出裝策略區）
  └ 選卡 → onBuildStrategyChange → setActiveMatchContext({ config: { buildStrategy } })   ← 當下存檔
  └ 開始載入 → onNext(tactic, buildStrategy) → AppShell state ＋ config（phase loading）
重新整理 → 首頁「返回進行中的比賽」→ resumeActiveMatch → setBuildStrategy(config.buildStrategy)
LoadingScreen：顯示「出裝策略 · 已鎖定」
GameView → start({ buildStrategy }) → useLocalServer（itemsV1 閘門內）
  → matchItemsConfig({ roster, heroLookup, buildStrategy }) → engine.configureItems
     我方 b1–b5 = 所選策略；紅方 r1–r5 = 標準
```

| 新純函式（`src/battle/moba/items/buildStrategyPrep.js`） | 用途 |
|---|---|
| `normalizeBuildStrategy(v)` | 五種之一原樣；其他 ⇒ standard |
| `matchItemsConfig({ roster, heroLookup, buildStrategy })` | useLocalServer 唯一 configureItems 輸入；對手固定 standard |
| `selectStrategyPrepView({ roster, heroLookup, focusSeat })` | 五張卡的預覽（同一位我方英雄）；輸入與引擎開局 buildTargets 相同 |

## 版面

| 寬度 | 卡片 | 預覽英雄切換 |
|---|---|---|
| ≥ 701（桌機，含 768） | 一排五張（`repeat(5, minmax(0,1fr))`），核心裝直列（插槽＋名稱） | 5 顆頭像鈕 44×44 |
| ≤ 700（手機） | 橫向滑動（scroll-snap，卡寬 min(80%, 300px)，露出下一張），下方位置點 | 同上 |

- locked：LoadingScreen 顯示已鎖定的策略（鎖頭＋「本場已鎖定」）；卡片元件支援 `locked`（全部不可點、選中卡顯示鎖定、其餘變淡）。
- itemsV1 OFF：戰術頁逐字原樣，不寫 `buildStrategy` 進存檔；Loading 不顯示。

## 任務

1. `buildStrategyPrep.js`（純函式）＋ M3 驗證器 G11：normalize、五策略 match input（我方＝所選、紅方＝標準）、同 seed 同策略兩次逐位元相同、不同策略出裝真的不同、預覽＝引擎開局計畫、缺英雄資料的席位定位退路與引擎相同。
2. `BuildStrategyCards`：`layout="prep"`（桌機一排五張／手機橫滑）、`locked`、`previewLabel`、`data-strategy-state`；`ItemGlyphs` 加鎖頭；`BuildStrategyLockedChip`。
3. `TacticScreen`：出裝策略區（itemsV1 閘門）、預覽英雄切換、onNext 第二參數。
4. `AppShell`／`LoadingScreen`／`GameView`／`useLocalServer`：存檔、恢復、鎖定顯示、傳入引擎。
5. 驗證器：M3 G1 呼叫式、G8 untouched 清單移除 TacticScreen、新增 G12 靜態接線；M1 G11 模組數 14、G13 允許 TacticScreen。
6. `tools/browser_review_moba_items_m3d.mjs`：真實流程（首頁 → 賽前 → Ban/Pick → 戰術）；OFF 無出裝區；ON 四寬度量測＋截圖；五策略逐一存入；重新整理回戰術頁仍是所選；載入頁鎖定；戰鬥中我方策略＝所選、紅方標準、預覽核心＝開局計畫；戰鬥中重新整理恢復後策略不變、恢復前的購買紀錄逐筆相同；console clean。
7. build、M1／M2／M3、regress；handoff 文件；local commit。
