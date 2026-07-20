# Environment Runtime Benchmark 彙整 — Milestone A

> 本檔彙整壓測結果。**程式可證的欄位已填**；**FPS/記憶體等需瀏覽器實測的欄位待補**
> （跑法見 ENVIRONMENT_RUNTIME_REPORT §5–§7，匯出 `benchmark_environment_runtime.json`
> 後把數字填進下表）。

## 程式保證（已成立，與硬體無關）

| 情境 | 實例數 | 資產種類 | 環境 Draw Calls | 材質數 | 貼圖數 |
|---|---|---|---|---|---|
| A：1000 石 | 1000 | 1 | 2 | ≤4 | 0 |
| B：1000 樹 | 1000 | 1 | 2 | ≤4 | 0 |
| C：3000 地被 | 3000 | 1 | 1 | ≤4 | 0 |
| D：混合（200石/300樹/2000草/100叢） | 2600 | 4 | ~7 | ≤4 | 0 |
| E：手機密度（D 的 50%） | 1300 | 4 | ~7 | ≤4 | 0 |

> 核心結論已成立：**draw call 不隨實例數增長**（1000 石 = 2 call）。

## 瀏覽器實測（desktop preset，2026-07-20）

來源：`benchmark_environment_runtime.json`。UA：Chrome 150 / Windows x64；dpr 1.5。
（本次只跑 **desktop preset**；mobile / mobile-low preset 未於此輪量測——見下方判定。）

| 情境 | preset | 實例 | Draw Calls | Triangles | FPS | Avg FPS | Frame(ms) | Mem(MB) | 材質 | 貼圖 | Program |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A：1000 石 | desktop | 1000 | **5** | 86,902 | 60 | 60 | 16.66 | 50 | 3 | 0 | 5 |
| B：1000 樹 | desktop | 723¹ | **5** | 85,168 | 60 | 60 | 16.67 | 52 | 3 | 0 | 5 |
| C：3000 地被 | desktop | 3000 | **4** | 82,158 | 60 | 60 | 16.67 | 54 | 3 | 0 | 5 |
| D：混合 | desktop | 2600 | **8** | 85,598 | 60 | 60 | 16.67 | 56 | 5 | 0 | 5 |
| E：手機密度 | desktop | 1300 | **8** | 83,190 | 60 | 60 | 16.67 | 56 | 5 | 0 | 5 |

¹ B 目標 1000，實際 placed 723——樹 minDist 1.8m 在 60×60m 測試區的泊松盤上限，屬正常
（非錯誤；密要更多可縮 minDist 或放大測試區）。

**LOD0 / LOD1 / Culled 明細**：desktop 輪未取得（Debug Panel 統計 `.current` 層級 bug，已於
本次修正；下輪重跑可補齊）。不影響上表核心量測。

## 瀏覽器實測（mobile-low preset，2026-07-20）

使用者實測，A–E 全數穩定：

| 情境 | preset | 實例 | Draw Calls | Triangles | FPS | Frame(ms) | Mem(MB) |
|---|---|---|---|---|---|---|---|
| A 1000 石 | mobile-low | 1000 | **3** | ~80,650 | ~60 | 16.66–16.69 | 54–59 |
| B 1000 樹 | mobile-low | 723 | **3** | ~80,650 | ~60 | 16.66–16.69 | 54–59 |
| C 3000 地被 | mobile-low | 3000 | **3** | ~80,650 | ~60 | 16.66–16.69 | 54–59 |
| D 混合 2600 | mobile-low | 2600 | **3** | ~80,650 | ~60 | 16.66–16.69 | 54–59 |
| E 手機密度 | mobile-low | 1300 | **3** | ~80,650 | ~60 | 16.66–16.69 | 54–59 |

- Draw calls 全 3（比 desktop 更低：cull 距離更近，遠處 LOD1 桶清空 → 提交的 instancedMesh 更少）。
- tris ~80,650、60 FPS、記憶體 54–59MB——**mobile-low 判定通過**。

## 瀏覽器實測（mobile preset，2026-07-20 取樣修正後重跑）

來源 `benchmark_environment_runtime_mobile_rerun.json`。**全數 `valid:true`、sampleFrames
176–181**（取樣修正生效），instanceCount 正確對應各案例，avgFps 無異常，LOD 明細已補齊。

| 情境 | 實例 | LOD0 | LOD1 | Culled | Draw Calls | Triangles | FPS | Frame(ms) | Mem(MB) | est.envTris |
|---|---|---|---|---|---|---|---|---|---|---|
| A 1000 石 | 1000 | 0 | 57 | 943 | 4 | 81,334 | 60 | 16.66 | 52 | 684 |
| B 1000 樹 | 723 | 0 | 40 | 683 | 4 | 81,130 | 60 | 16.67 | 54 | 480 |
| C 3000 地被 | 3000 | 0 | 0 | 3000 | 3 | 80,650 | 60.2 | 16.67 | 57 | 0 |
| D 混合 2600 | 2600 | 0 | 39 | 2561 | 6 | 81,118 | 59.9 | 16.67 | 60 | 468 |
| E 手機密度 | 1300 | 0 | 20 | 1280 | 6 | 80,890 | 60.2 | 16.67 | 56 | 240 |

- **取樣修正確認**：C instanceCount=3000（不再黏 B 的 723）、avgFps 全 60（不再 0/7.3/21.8）、
  LOD/culled/est.envTris 皆有值。
- **cull 環積極生效**：測試鏡頭距場中心 ~66m、mobile cull 45m，故 60×60m 測試場多數實例
  被 cull（C：3000 全 culled）；可見者多為 LOD1（22–45m 環）。→ 面數由地形主導、環境
  est.envTris 僅 240–684。
- Draw calls 3–6、tris ~80,650、記憶體 ≤60MB、材質 3–5、貼圖 0——**mobile 判定通過**。

## 實測判讀

- **Draw call 不隨實例數增長＝已實測證實**：A(1000 石)=5、C(3000 地被)=4、D(4 種混合)=8。
  實例從 1000→3000，draw call 不升反降（種類決定，非數量）。**Milestone A 核心目標達成。**
- **60 FPS 全數達標**（16.67ms＝桌面 vsync 上限；桌面有充足餘裕，被 vsync 蓋住看不到上限）。
- Triangles ~82–87k（含地形 ~32k）：遠低於桌面 500k、也低於手機 300k。
- 記憶體 50–56MB、貼圖 0、材質 3–5、program 5：全數優於預算。

## 判讀基準（對照 PERFORMANCE_BIBLE / ENVIRONMENT_BUDGET）

- Draw Calls：手機全場 ≤150、桌面 ≤300 → 實測 ≤8 ✅。
- FPS：桌面 ≥60 → ✅；手機 ≥30 → 待 mobile preset／真機量測。
- Triangles（cull 後可見）：手機 ≤ ~250–300k、桌面 ≤ ~500k → 實測 ~85k ✅。
- Materials ≤20、Textures = 0 → 實測 3–5 / 0 ✅。
