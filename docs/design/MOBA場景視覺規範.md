# MOBA 場景視覺規範

> **狀態：規格 + Legacy Diff（Sprint 29A 完成）｜美術升級留待 Sprint 29B（E）**
>
> 29A 只動了**效能根因**（不是美術）。以下記錄 29A 實際改了什麼、
> 以及 29B 要做的視覺升級清單。

---

## 1. 29A 已改（效能根因，非美術）

| 項目 | 舊 | 新 | 理由 |
|---|---|---|---|
| **動態 PointLight** | **22 盞**（每座塔 1 盞 + 龍/巴龍） | **2 盞**（只剩主堡） | Three.js `MeshStandardMaterial` 會把每盞燈編進 per-fragment 迴圈 ⇒ 手機直接崩。一般塔改靠 emissive + Bloom 發光，**視覺幾乎不變** |
| **FX** | `useFrame` 內每幀 dispose 全部 + `new Geometry/Material`（60fps × 最多 60 個 ⇒ **每秒最多 3600 次配置**） | **物件池**（unit 幾何 + 重用 mesh），穩態零配置 | 這是「桌機與手機都 LAG」的**最大單一元凶**（材質建立會觸發 shader 查找/編譯） |
| **小兵** | 每隻各 `new` 一份 geometry + material（上限 96 隻），生成/陣亡就 new/dispose | 共享 geometry + 2 個共享材質 + 物件池 | — |
| **草叢** | **每片葉子一個 material**（約 100 個） | 4 個共享材質（顏色本來就只有 4 種） | — |
| **英雄名牌** | 內容一變就 `dispose()` + `new CanvasTexture(新 canvas)`（復活倒數每秒都在變） | 重畫**同一張 canvas** + `needsUpdate` | — |
| **dpr** | 寫死 `[1, 2]` | 依畫質分級（low 1 / medium 1.5 / high 2） | 手機 retina 不鎖會直接 3× 像素量 |
| **後製** | SSAO(24 samples) + Bloom + Vignette + normalPass + MSAA×4，**全裝置一律開** | 分級：**Bloom 三檔都保留**；SSAO + normalPass 只在 high | ⚠ **不是砍光特效**（S29 §11 禁止）——水晶/技能發光是 MOBA 的識別度來源 |
| **陰影** | 2048、幾乎所有物件 castShadow | low 關閉 / medium 1024 / high 2048 | — |

**畫質分級絕不改變模擬結果**（`quality.js` 不 import 引擎/Store；驗證第 22 項）。

## 2. Legacy Diff Checklist（29B 動工前要逐項比對）

比對對象：`src/EsportsGame.jsx`（Legacy）與 `src/App.jsx`（Prototype 沙盒）的 MOBA 呈現。

| 項目 | 主幹現況 | Legacy/Prototype | 29B 待辦 |
|---|---|---|---|
| 地圖比例 | 世界尺度 `S = 1.7`，正交相機 `zoom 3.4` | 待查 | 桌機地圖佔比過小（S29 問題 2） |
| 路線寬度 | 程序化貼圖畫 6.2% 寬的線 | 待查 | 道路需要邊緣過渡與細節 |
| 野區結構 | 只有 46 顆隨機 `DodecahedronGeometry` 灰石 | 待查 | **不要大量重複相同灰色石柱**；加營地與區域地標 |
| 河道 | 7 個藍色半透明圓 | 待查 | 河道與三路需要材質區分 |
| 草叢 | 10 叢錐狀葉片（可進入區未標示） | 待查 | 改成**清楚的可進入區域** |
| 防禦塔 | 3 段圓柱 + 八面體水晶 | 待查 | 塔/兵營/基地要有明確層級 |
| 主堡 | 同塔但 `sc = 1`、水晶 4.6 | 待查 | **修正過曝白光**（`emissiveIntensity 1.9` + Bloom threshold 0.35 + toneMappingExposure 1.35 ⇒ 白到看不見模型） |
| 陣營色 | `SIDE` 直接塗滿模型 + emissive | 待查 | **陣營色保留但不得蓋掉模型細節** |
| 光照 | ambient 1.15 + hemi 0.85 + dir 2.7 | 待查 | 過曝主因之一 |

⚠ **29A 沒有做這張表的比對**（那是 E 的工作，需要 Explore Legacy 巨檔）。
表格右欄的「待查」是誠實的空白，不是已完成。

## 3. 29B 視覺優先序（依 S29 §七）

1. 修正主堡／塔**過曝白光**（最影響辨識度）
2. 陣營色保留但不得蓋掉模型細節
3. 草叢改成清楚的**可進入區域**
4. 障礙物不要大量重複相同灰色石柱
5. 河道與三路增加材質區分
6. 野區加入營地與區域地標
7. 道路增加邊緣過渡與細節
8. 基地／兵營／塔有明確層級
9. **保持手機效能**（不得抵銷 29A 的效能修復）
10. **不得引入未授權的 LOL / 傳說素材** —— 只用自有程序化材質、簡化模型或專案合法資產

## 4. 相機（29B）

目前只有：正交神之視角 + `OrbitControls` + `BattleCameraController`（跟隨）。

29B 要建立正式的 Camera 模式：
1. 全局戰術鏡頭
2. 自動交戰追蹤（避免高頻抖動）
3. 手動拖曳縮放
4. 回到全局
5. 可選鎖定英雄

要求：桌機地圖使用主要可視區域、減少無意義黑色空白、英雄在全局鏡頭仍可辨識、
相機不得穿場景、手機預設聚焦有效戰場（不要求完整地圖一直顯示）。

⚠ **不可只把 Canvas CSS 放大而不處理世界比例與相機**（S29 §五）。

## 5. ⚠ 29A 改動了地圖幾何（會影響視覺，29B 需知道）

為了修公平性 bug（見 `MOBA對戰執行與時間系統.md` §4），29A 改了 `gameData.js`：

- `posOnLane` 改為**弧長參數化** ⇒ 塔沿著同一條路徑曲線移動到**對稱**的位置
  （路徑曲線本身沒變，只是塔的落點變了）。
- `BASE.red` `{87,16}` → `{88,10}`、`FOUNTAIN.red` `{91,12}` → `{91,7}`
  ⇒ 紅方主堡與泉水**位移約 6 單位**。

29B 做美術時要以**新的**塔/基地座標為準。

---

## S29B2 實作紀錄（Map Scale / Combat Visibility / Presentation MVP）

> 狀態更新：**呈現第一版已實作**（29B2，程序化/低模，不含正式美術資產）。

### 地圖比例與相機

- `fitZoomFor(w,h,mobile)`：視窗感知取景（桌機全圖框滿主要可視區、手機聚焦戰場）。
  **真正交相機 zoom，禁止也未使用 CSS scale**。
- 跟隨模式 base/fight zoom 由 fitZoom 派生（桌機 ×1.5 / 手機 ×1.8 交戰拉近）；
  焦點死區 6 邏輯單位防高頻抖動；非跟隨由 `CameraRig` 設定預設取景。
- 英雄 ×1.3、小兵 ×1.25、龍/巴龍 2.6→3.3、營地 1.1/1.5→1.45/1.9（視覺放大，不動座標）。

### Combat Visibility（全部吃真實資料，禁止假動畫）

| 對象 | 資料來源 | 呈現 |
|---|---|---|
| 龍/巴龍/營地 HP | `snapshot.objectives[].hp` | 放大 HP 條 + `shownHp` 插值（0.5s tick 階梯 → 連續下降）|
| 受擊閃光 | prev→next **hp 差分** | 英雄/塔/目標 emissive 脈衝 0.25s；小兵（共享材質）用 per-mesh scale 脈衝 |
| 死亡 | alive→dead 轉場 / 小兵 id 消失 | viewFx 擴散圈（**固定 14 格池**，重用）+ 目標 0.5s 縮小下沉淡出，不瞬間消失 |
| 小兵 hp | `snapshot.lanes[].bm/rm[].hp`（S29B2 新欄位） | 高度隨 hp 縮（0.55–1.0）|
| 小兵交戰 | 雙方前鋒 t 差 < 0.035（與引擎判定同尺度） | 接觸點火花（節流 380ms/路）|
| 攻擊彈道 | 引擎 fx（英雄互打既有；**S29B2 新增打野清怪/打龍每秒節流彈道**，零 rng）| fx 物件池（S29A）|
| Replay | `frame.ob` 由存活位元升級為 **hp 值**（0–1）+ 播放端插值 | 與現場一致的逐步掉血；**不重新模擬** |

### Presentation MVP（程序化底圖 makeRiftTexture 重繪，一次性成本）

河道帶狀水域＋波光、三路亮沙路面＋深色路緣、Dragon/Baron pit 坑面＋色環（紫/金）、
營地菱形標記＋色暈（粉=buff/萊姆=一般，三處視圖同色系）、草叢亮綠＋虛線邊界
（可進入區語意）、營地→最近路點的野徑（野區入口語意）、塔/主堡過曝調降
（crystal emissive 1.9/1.3→1.1/0.8、主堡燈 9→5、水晶受擊時才短暫增亮）。

⚠ **全部未經瀏覽器實測**：FPS/draw calls/外觀體感需 Ray 依 29B2 人工驗收清單實測。
正式美術資產（模型/貼圖）仍未導入——本版是「看得懂地圖」的 MVP，不是 AAA。

---

## S29B3 增補：可讀性標籤 / 塔光收斂 / 回城視覺

- **標籤系統**：地面字（魔龍 DRAGON／凱撒 BARON／泉水／野怪／BUFF）＋常駐 billboard
  標籤（makeLabelSprite ×7）＋泉水圓形平台十字＋基地方界。詳見 `MOBA地圖可讀性規範.md`。
- **塔光效**：常態 emissive 再降（塔 0.55／主堡 0.75、主堡燈 3.5），受擊 +1.6 峰值
  0.25s 衰減、摧毀 viewFx 爆點；Bloom 依畫質 0.7/0.9/1.05。
- **回城/泉水視覺**：引導=藍圈快轉＋「🌀 回城中」badge＋players[].rc；完成=起點爆點
  （recallEvents）＋泉水端引擎 fx；泉水治療=綠圈慢轉（hp 上升差分＋距泉水 <12 才亮，
  真資料非假動畫）；「⛲ 泉水」badge。
- **相機**：模式化（director/objectiveFocus/heroFocus/free），點英雄 zoom-in 4s，
  詳見 `MOBA導播鏡頭與測試控制.md`。

---

## S29B4 增補：移除塔常駐光

- **crystal 常態 idle glow 移除**：emissiveIntensity 常態降到**主堡 0.14 / 塔 0.06**
  （29A 1.9/1.3 → 29B2 1.1/0.8 → 29B3 0.75/0.55 → **29B4 0.14/0.06**，低於 Bloom
  luminanceThreshold 0.35 ⇒ 平時無常駐光暈，靠場景光呈現正常材質、仍可辨識塔位）。
- **只有被攻擊時**才短暫 +1.6 脈衝（hp 差分觸發、0.25s 衰減）；**摧毀時** viewFx 爆點。
- 主堡 PointLight 3.5 → 2.0（一般塔仍僅 high 檔 towerLights 開）；**未新增任何 PointLight**
  （維持 S29A ≤2 盞上限，避免手機效能回退）。
- **Replay 白畫面防護**（`MobaReplayScreen`）：frame/meta 缺欄位一律安全預設，舊格式/
  部分擷取的 replay 不再崩畫面。

---

## S29B5 增補：大世界與中立目標自有輪廓

- 場景 floor 改由 `WORLD_BOUNDS 220×220` 生成，`WORLD_SCALE=1.7` 只負責邏輯→3D 映射，
  不代表遊戲距離；相機、Minimap、Replay 不得自行複製尺度。
- Dragon：寬翼低模；Baron：高直蛇身、環節與冠角；Blue Buff：寬體石像＋雙晶；
  Red Buff：角獸＋背焰；Jungle Camp：三隻小型 creature pack。全部由 Three.js 幾何程序化
  組合，沒有使用第三方官方模型、icon、紋理或截圖。
- 光圈不再是中立目標主模型；Dragon / Baron 的 PointLight 已移除。HP bar 仍讀
  `snapshot.objectives[].hp`，受擊／死亡／重生沿用 29B1/29B2 真實生命週期。
- 塔／主堡常態仍為 0.06/0.14 idle emissive；被攻擊 +1.6 pulse、摧毀 viewFx。
  PointLight 原始碼只剩塔／主堡的畫質 gate（≤1 處），未新增大量動態光。
- 正式可見名稱：Dragon（巨龍）／Baron（巴龍）／Blue Buff／Red Buff／Jungle Camp。

⚠ 程序化輪廓的美術品質、手機辨識度、draw calls/FPS 未經真機驗收。
