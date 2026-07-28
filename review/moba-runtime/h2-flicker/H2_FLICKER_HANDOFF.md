# H.2-flicker 交接紀錄

日期：2026-07-29｜狀態：**根因修正完成、待正式站 Android 真機驗收**｜下一棒：Ray 真機驗收

## 1. 現況（一句話）

已從 Android 影片定位到「主要物件坑坑壁 InstancedMesh 被重掛、矩陣晚一幀上傳」，
並完成根因修正與診斷面板；修正版尚未在 Android 真機重測，現在改由正式站驗收，所以
H.2-flicker **仍未驗收通過**，不得宣稱修復、不得 push、不得部署。最新結論見 §8。

| 環境 | 結果 |
|---|---|
| 桌面 Chrome 1600×1000 | 逐幀診斷 23 PASS / 0 FAIL；肉眼幾乎無閃爍 |
| 桌面 Chrome 模擬 Android 412×915 @2.625x | 逐幀診斷 23 PASS / 0 FAIL |
| **真實 Android 裝置** | 舊版影片仍可見閃爍；§8 新根因修正版**待正式站重測** |

## 2. 根因假設與已完成的修正

### 2.1 假設（部分成立，但不足以解釋真機現象）

深度緩衝精度不足導致**共面貼花 z-fighting**：
`Δz ≈ z²(far−near)/(far·near·2^bits)`。舊值 `near=1 / far=4000`：

- 桌機 **24-bit** ⇒ Δz 0.0018（分得開）
- Android 常見 **16-bit** ⇒ Δz **0.467**，比場景裡所有高度差都大
  （地面鋪層間距 0.02–0.04、選取環 0.35、塔環 0.11、目標環 0.09）

支持證據：把 `near` 暫降到 0.01（在 24-bit 桌機上模擬精度崩潰）可**可控重現**——
scene graph 統計仍全 0，但畫面像素振盪 0.036% → 4.59%（128×），
熱區正好落在岩塊地面投影與選取環（`heatmaps/01`、`02` 前後對照）。

⚠ **但真機修正後仍在閃** ⇒ 這個假設要嘛只是其中一個成因，要嘛真機另有主因。

### 2.2 已完成的修正（4 項）

| # | 修正 | 檔案 |
|---|---|---|
| 1 | 相機 `near 1→35`、`far 4000→1000`（比值 4000→28.6）⇒ 16-bit 下 Δz 0.467→0.0129 | `MobaRuntimeView3D.jsx` |
| 2 | **移除 `RuntimeCamera` 每幀硬寫 `camera.near=1/far=4000` 的覆蓋** ⇒ 不修這行，改 `CAM` 完全不生效 | `MobaRuntimeView3D.jsx` |
| 3 | 地面貼花（選取環／陣亡標記／塔環／目標環）改用 **polygonOffset**（單位是深度緩衝的最小可解析差，與位元深度無關）。⚠ 刻意**未關** `depthTest` | `MobaRuntimeHeroes.jsx`、`MobaRuntimeStructures.jsx` |
| 4 | 內插退路改為「維持上一幀已驗證位置」，不再跳到 snapshot ⇒ 修掉 H.2-close 自己引入的英雄抖動 | `MobaRuntimeView3D.jsx` |

### 2.3 修改檔案與 commit

- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeStructures.jsx`
- `src/battle/moba/render/runtimeDiagnostics.js`（逐幀閃爍記錄器＋mount 計數，純唯讀）
- `tools/check_moba_runtime_flicker_h2.mjs`（新增，閃爍專用 verifier）

**commit：`dfa900f`**（WIP，本機，**未 push**）

## 3. 已執行的驗證與其限制

### 3.1 已跑過（輸出在 `mobile/` `desktop/` 的 `flicker_report.json`）

- flicker verifier：手機尺寸 **23/0**、桌面 **23/0**，各連續 60 秒、3,600+ 幀逐幀統計
  （消失/重現 0、數量無跳動、NaN 0、context lost 0、mount 各 1 次無重掛、
  geometry/draw call 軌跡 60 秒平坦）
- `npm run build` ✅｜`check:mobamap` 3553/0｜`check_moba_nav_h2` 14/0
- `regress` 15/15｜`regress2` 節奏門檻 8/8
- 依指示**未執行** `check_moba_runtime29`

### 3.2 限制（這是本輪最重要的一句）

**桌面 Chrome 的「手機尺寸模擬」不等於真實手機。**
`Emulation.setDeviceMetricsOverride` 只改視窗尺寸與 DPR，**GPU、驅動、WebGL context
的 depth buffer 位元數完全沒變**——本機實測 `DEPTH_BITS = 24`，
而假設中的問題發生在 16-bit 裝置上。所以：

- 本輪所有「手機」數據，實際上都是 24-bit 桌機 GPU 跑出來的
- 真機的 16-bit（或其他 driver 行為）**無法在本機重現**
- ⇒ 逐幀 23/0 只能證明「邏輯層與桌機渲染沒問題」，**不能證明真機不閃**

另外，像素級指標（靜止相機下逐像素比對）**只當診斷、未列入通過條件**：
它無法乾淨區分缺陷與「塔冠旋轉浮動、英雄移動、HUD 更新、JPEG 量化」，
最大熱點甚至出現在畫面左上角 y=0 的 HUD 邊緣。詳細理由見
`H2_FLICKER_ROOT_CAUSE.md` §5。

## 4. 交給 Codex：待查來源與禁止事項

### 4.1 建議優先查的方向（依優先序）

1. **先取真機的實際數據**，不要再從桌機推論：
   在該 Android 裝置上開 `?debug=moba-runtime-battle&diag=1&mapPresentation=runtime-v2`，
   讀 `gl.getParameter(gl.DEPTH_BITS)`、`gl.getContextAttributes()`、
   `window.__ESMO_RUNTIME_DIAG().performance.renderer / vendor`。
   報告 JSON 的 `depthProbe` 已有對應欄位可直接比對。
2. **`antialias: true` 與 MSAA**：部分 Adreno/Mali driver 在 MSAA + 半透明疊層下
   會有 resolve 階段的閃爍。可在真機上試 `antialias: false` 對照。
3. **DPR 與 framebuffer 尺寸**：手機 DPR 2.625 × `dpr=[1,2]` ⇒ 大量填色；
   記憶體壓力下瀏覽器可能降規格或丟 context（本機 context lost = 0，真機需另外量）。
4. **地圖地面鋪層本身**：`MobaMapBlockout` 把各層 Y 烘進**合併幾何**
   （層距僅 0.02–0.04，見 `mapVisualStyle.js` 的 `LAYER_Y`），
   只靠深度緩衝分層。本輪只對 Runtime 貼花加了 polygonOffset，
   **地圖合併層沒有動**——真機若仍閃，這裡是下一個嫌疑點。
5. **`Html` 名牌（drei）**：DOM 疊層，不在 three 的 scene graph 統計內，本輪未涵蓋。

### 4.2 禁止重做／覆蓋（會白費工或製造回歸）

- ❌ **不要只加 `frustumCulled={false}` 當解法**：H.2-close 已經加過，真機照樣閃；
  逐幀統計顯示 visible 從未跳動，culling 不是成因。
- ❌ **不要用「每 N 毫秒取樣 visible」當驗收**：H.2-close 就是這樣得出假結論的
  （600ms 取樣抓不到單幀事件）。要驗必須逐幀。
- ❌ **不要關 `depthTest` 或把所有物件改常駐**來遮蓋問題（使用者明令禁止）。
- ❌ **不要回復 `camera.near=1 / far=4000` 的硬寫**（`MobaRuntimeView3D.jsx`
  `RuntimeCamera` 內），那行會把相機設定整個蓋掉，讓任何深度修正失效。
- ❌ **不要改 `LAYER_Y` 的絕對數值**：`GROUND_Y`、`RING_Y`、塔基高度都由它推導，
  等比放大會讓地面鋪層穿出高地平台（`HEIGHT.base_platform = 3.6`）。
- ❌ **不要重寫 `tools/check_moba_runtime_flicker_h2.mjs` 的逐幀統計**：
  統計刻意做在頁面內（每個 rAF 累計），工具只讀彙總，這樣才不會漏幀。
- ⚠ 本輪修的**第 4 項（內插退路）是真缺陷**，與深度無關，請保留。

## 5. 真機問題證據

- 檔案：**`10976.mp4`**（使用者提供的真實 Android 螢幕錄影）
- ⚠ 撰寫本文件時，該檔案**尚未放入 repo**。建議放置路徑：
  `review/bug/10976.mp4`，並在此處補上時間戳與可見閃爍的秒數區間。
- 既有的手機版問題標記另見 `review/bug/202607282101ChatGPT Image.png`
  與 `review/bug/MOBILE_BUG_MARKUP_202607282101_TRIAGE.md`。

## 6. 目前 git 狀態與回退點

- **分支**：`main`
- **HEAD**：`dfa900f`（WIP：H.2-flicker 根因與修正，待真機確認）
- **尚未 push 的 commit**：`dfa900f` 一個（`origin/main` 仍停在 `9faa319`）
- **git status**：`src/`、`tools/`、`docs/` 皆乾淨；工作區只剩本次工作前就存在的
  舊未追蹤產物（terrain-prototype 截圖差異、moba-map 預覽圖、blender 腳本等）

### 回退點

| 目的 | commit | 說明 |
|---|---|---|
| 退回 H.2-flicker 之前 | `9faa319` | H.2-close 完成、已 push、線上正式站就是這個版本 |
| 退回 H.2 碰撞收斂前 | `1950b00` | 碰撞已收斂到 v3、成本已壓 |
| 退回 H.1 | `15b5abb` | Runtime map H.1 整合完成 |

⚠ 線上正式站（GitHub Pages）目前是 `9faa319`，**不含**本輪的四項修正。

## 7. 本輪未做的動作

未 `git add`、未 commit（`dfa900f` 是上一輪就建立的）、未 push、未部署，
也未開始小兵 / 技能特效 / 英雄模型。

---

## 8. Codex 續查結論（2026-07-29）

### 8.1 Android 影片逐幀結果

來源：`review/bug/20260729_022915地圖閃爍bug.mp4`，27.460 秒、720×1600、
約 59.60 fps。以瀏覽器原生 decoder + `requestVideoFrameCallback` 解碼並比對
相鄰影格，共取得 1,611 次 presented-frame callback；主要事件前後影格均有取得。

| 畫面物件／區域 | 時間點（消失 → 下一幀恢復，秒） | 判讀 |
|---|---|---|
| 左上方主要物件坑的整圈立體坑壁 | 14.383→14.400、14.886→14.903、15.641→15.658、16.129→16.145、16.883→16.901 | 整批不透明幾何單幀消失 |
| 同一批坑壁 | 19.384→19.401、19.636→19.652、19.887→19.904、20.139→20.156、21.397→21.415、21.884→21.901、22.136→22.153、26.868→26.884 | 同型事件反覆出現 |
| 瀏覽器／Android UI | 6.162 附近 | 狀態列、導覽列與 viewport 同時重排，屬錄影／browser compositor 事件，與場景幾何分開處理 |

每次坑壁事件約影響縮小分析影格的 1.57–1.64%，持續約 16.7ms。英雄、塔、其他結構、
selection ring、shadow decal 在這些影格都仍存在；灰色圓圈是 Android「顯示觸控位置」，
不是遊戲物件。整個不透明坑壁批次直接 on/off，也不符合局部共面面片互相搶深度的
z-fighting 形狀。

另須注意：影片網址列是 GitHub Pages 正式站；影片當時的正式站仍在 `origin/main@9faa319`，
不含本機 `dfa900f` 的 near/far 等修正。因此影片能證明可見物件與舊版病灶，但不能
用來判定 `dfa900f` 已在真機失敗；本次新修正必須使用部署後正式網址重測。

### 8.2 真正來源與修正

真正來源在 `MobaMapBlockout.jsx`：

1. `BpWrap` 原本宣告在 `MobaMapBlockout` function 內。每次 render 都產生新的
   component type identity，React 因此卸載並重掛 wrapper 下的靜態地圖 subtree。
2. 動態 snapshot 的英雄等級／生死等結構簽章改變時，`MobaRuntimeView3D` 會
   `setFrame`，進而讓靜態地圖一起 render。主要物件坑坑壁是 face/cap
   `InstancedMesh`；每次就被整批重建。
3. `WallInstances` 原本在 `useEffect` 才填 instance matrices，時間點晚於 browser
   paint。Android 會真實顯示一幀「新 InstancedMesh 已掛上、矩陣尚未上傳」的空白；
   下一幀矩陣就緒後整批恢復。桌面 compositor 較容易把這一幀藏掉。

修正採三層防線：

- `BpWrap` 移到 module scope 並改名 `BlueprintWrap`，固定 React type identity。
- `MobaRuntimeMap` 用 `React.memo` 隔開「靜態地圖」與「動態 snapshot」更新邊界。
- instance matrices 改在 `useLayoutEffect` 寫入，保證 commit 後、paint 前完成。

修正前的 35 秒直接探針：坑壁消失／恢復各 **148** 次、四批坑壁 UUID 共更換
**596** 次；hero / structure / objective / healthbar / ring 消失均為 0，NaN 0、
context lost 0。修正後 60 秒：坑壁消失／恢復 **0/0**、UUID 更換 **0**。

這次沒有關閉 `depthTest`、沒有隱藏物件、沒有拉高幾何，也沒有改碰撞、尋路、正式地圖
資料、戰鬥 snapshot、Replay 或發獎契約。`dfa900f` 的 near/far、polygonOffset 與
內插退路修正仍保留：它們處理深度精度與貼花／英雄抖動，但不是影片中「整批坑壁消失」
的主因。

### 8.3 本次修改檔案

- `src/battle/moba/map/MobaMapBlockout.jsx`
- `src/battle/moba/map/MobaRuntimeMap.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx`（新增）
- `src/battle/moba/render/runtimeDiagnostics.js`
- `tools/check_moba_runtime_flicker_h2.mjs`
- 本文件
- `docs/handoff/05_Sprint紀錄.md`

`runtimeDiagnostics` / verifier 新增 `mapWall` 逐幀 render-ready 與 UUID 穩定性檢查，
避免舊版只看動態物件而漏掉靜態坑壁。`?diag=1` 的畫面面板可直接顯示、複製或下載：

- `DEPTH_BITS`
- WebGL version / renderer / vendor
- context attributes
- camera near / far
- device DPR / renderer pixel ratio
- drawing buffer / CSS canvas 尺寸
- context lost 次數

### 8.4 驗證結果

| 檢查 | 結果 |
|---|---|
| flicker verifier，412×915 @2.625，60 秒 | **31/31**；3,624 幀、坑壁 4→4、所有消失 0、UUID 更換 0、NaN/context lost 0 |
| flicker verifier，1600×1000，60 秒 | **31/31**；2,881 幀、坑壁穩定、所有消失 0、UUID 更換 0、NaN/context lost 0 |
| `npm run build` | exit 0；2,590 modules（僅既有 chunk size warning） |
| `npm run check:mobamap` | 3,553/3,553 |
| `node tools/check_moba_nav_h2.mjs` | 14/14 |
| `node tools/regress.mjs` | 15/15 |
| `node tools/regress2.mjs` | 節奏門檻 8/8 |
| presentation29b2（`SKIP_NESTED=1`） | 12/12 |
| controls29b3（`SKIP_NESTED=1`） | 18/18 |
| camera/replay29b6（`SKIP_NESTED=1`） | 16/16 |
| `git diff --check` | exit 0 |

完整 `node tools/check_moba_runtime29.mjs` 已實際啟動，但外層 20 分鐘後 timeout
（exit 124），沒有取得最終輸出形狀，**不可列為通過**。現行腳本內部 child timeout
是 5,400 秒，並註明單一 `check_moba_stats28` 實測可達約 87 分鐘；timeout 後已確認
沒有殘留 verifier 子行程。這是本輪唯一未完成的自動驗證。

### 8.5 正式站 Android 真機驗收入口與待確認項目

部署完成後，正式站入口為：

`https://rayhuang0323.github.io/ESMO-/?debug=moba-runtime-battle&diag=1&waitTs=1&mapPresentation=runtime-v2`

真機仍須人工完成：

1. 連續觀看至少 60 秒，固定盯左上主要物件坑的 face/cap 坑壁；錄影保留逐幀複查。
2. 在英雄升級、死亡與物件被摧毀前後確認坑壁不再單幀消失。
3. 從診斷面板複製／下載 JSON，保留真機的 `DEPTH_BITS`、renderer、context attributes、
   camera near/far、DPR；確認 context lost = 0。
4. 確認 hero、tower、structure、ground overlay、selection ring、shadow decal
   沒有新閃爍，並確認桌面外觀無回歸。
5. 手機的 FPS、觸控、視覺體感仍是 Node／桌面 emulation 無法證明的人工項目。

未取得這次修正版的 Android 真機確認前，狀態仍是**待正式站 Android 真機驗收**，
也不得開始小兵、技能特效或英雄模型。

### 8.6 Git 與回退 commit

- 目前基準是前一個未推送的 H.2 commit `dfa900f`；本次根因修正將與既有 H.2 變更合併成單一 commit 推送 `main`。
- 本輪不開始小兵、技能特效或英雄模型；正式站部署完成後仍須 Android 真機確認。
- 僅回退本次新修正：回到 `dfa900f`（目前尚無新 commit SHA；須保留工作樹其他人的改動，
  不可用 `reset --hard`）。
- 回退整個 H.2-flicker：`9faa319`（目前 `origin/main`／正式站版本）。
