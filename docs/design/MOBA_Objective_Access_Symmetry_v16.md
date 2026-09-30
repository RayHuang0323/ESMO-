# MOBA Objective Access Symmetry ＋ Objective Layout（moba-sim.v16 候選）

分支：`feature/moba-objective-layout-v16`（worktree `.sprints/moba-objective-access`），基準 main `356630b`（moba-sim.v15）。
上游：`feature/moba-objective-stakes-v16` @ `36251d0`（保留不動）＋ closure 證據 `evidence/moba-objective-v16-closure` @ `0019987`。
狀態：**local，未 push、未 deploy、未 merge main。READY_TO_RELEASE＝NO（ART_COLLISION_ALIGNMENT_BLOCKER）。**

## 1. 根因（Objective Access Audit）

| 事實 | 證據 |
|---|---|
| 地圖是 **180° 旋轉對稱**（路線、牆、坑、基地、泉水） | `gameData.js`（H.2／S29 註解）、導航場 `mirrorSymmetric` |
| P0-A 起路線是**己方視角**：紅方雙人組走 world top、紅方上路走 world bot | `ROLE_LANE`＋`worldLaneForSide`；回退 P0-A ⇒ 藍方 24.5%（不可回退） |
| 巨龍坑緊鄰 world bot 轉角（藍方雙人 20.7、紅方上路 20.0、紅方雙人 158.1） | `tools/audit_objective_access.mjs` 靜態 findPath |
| 「藍→巨龍」與「紅→巴龍」逐項相等（路徑、牆、坑口） | 同上 |
| 只開巨龍：藍方拿下 79%、先到 88%；只開巴龍（同時刻）：紅方 73%、先到 83% | 鏡像情境 n=100 |
| AI 決策對稱：遠端隊伍開窗率同樣高（96%），坑邊人數相近；差別只在晚到 11 秒 | 同上 |

⇒ **根因＝兩個鏡像坑放的是不同物件**：每一方天生「擁有」不同的物件類型。A（路徑）已精確對稱、B（AI）改不了 11 秒距離差，只能從 C（物件配置）處理。
在 180° 旋轉地圖上，同時對兩基地等距、又對兩雙人組等距的點只有地圖正中心。

另一個獨立發現：**兩坑的 gameplay 腳印不同**（巨龍 R17／坑口 0.82／壁厚 5.2、巴龍 R14／0.66／6.2），導航場 `mirrorSymmetric` 取聯集 ⇒ 兩坑都疊了對方的隱形牆（巨龍坑內 10 格）、可走面積 390 vs 321 格、坑口淨寬不同。

## 2. 實際修改

1. **坑位 gameplay 幾何統一**（`fc82068`）：`PIT_FOOTPRINT` R 15.5／坑口 0.74／壁厚 5.7；巴龍坑牆段＝巨龍坑的精確 180° 鏡射；壁高、坑色、光暈、模型屬視覺仍分開。
   `check_objective_pit_symmetry` 修正前 1/7 → 7/7（隱形牆 10→0、可走 489/489、坑口 18.07/12.69 兩坑相同）。
2. **Objective Layout Variant 契約**（`0c7851a`）：`platform/contracts/objectiveLayout.js`，STANDARD／SWAPPED。
   - 推導只在 `useLocalServer.start()` 一處（seed 雜湊取一個位元；正式引擎 seed 一律奇數，**不能**用奇偶）；恢復場次沿用存檔值。
   - 流向：Match config → `LogicEngine.configureObjectiveLayout`（第一個 tick 後呼叫無效）→ `snapshot.objectiveLayout` → 小地圖／導播（battleFocus）／戰報（battleEvents）／戰術播報／runtime frame／blockout 坑色／`ObjectivePitMarkers` → `replay.objectiveLayout`（optional additive）。
   - AI 一律經 `LogicEngine._pitOf()`。未設定＝STANDARD，與舊版逐位元相同；舊 snapshot／replay／存檔缺欄位＝STANDARD。
3. **v16 Objective Stakes＋TD-CS1 疊上**（`3b327f9`）：獎勵數值一個都沒改。balance runner 與正式流程同序設定 layout。
4. **模擬版本**：v16（未發布）重新登記指紋；坑位幾何改變**所有模式**（含 skill-off／Challenge）的碰撞。
   指紋清單補上 `mapTerrainShapes`／`mobaMapLayout`／`objectiveLayout`（導航幾何的洞）。

## 3. 驗證（詳見 Sprint 紀錄）

- Node：layout 契約 11/11、坑位對稱 7/7、版本 59/59、objective_stakes_v16 16/16、combat_state 16/16、matrix、hero_skills_release PASS、
  skill_levels 400/400、talents、base_assault、skill_detail 500/500、mobile_hud_polish 60/60、combat_quality 28/28、spectacle 21/21、lane_jungle 20/20。
- items_m2 52/53：G1 串流與基準 `fc82068` 逐位元相同（證明 v16 與 layout 對 skill-off 中性）；「每場都有擊殺」的健全性檢查紅
  （bare seed 99 在新幾何下 0–0 推塔結束），依規則不放寬，如實回報。
- 幾何回歸：nav_h2 14/14、navigation_mirror_p0b 14/14、side_relative_p0a 8/8、rift_mesh PASS、check_moba_map 與基準同一組既有紅燈（0 新增）。
- verify：regress、regress2、runtime29、fairness_p0a〜p0d、simulation_version 8/8。
- 瀏覽器（依序、不平行）：objective_layout 9/9、objective_v16 12/12、龍魂＋巴龍 11/11（seed 3）、combat_state 13/13；page／console／shader error 0。

### 3.1 鏡像存取 gate（100 場／組）

| 情境 | 拿下 藍／紅 | 先到 藍／紅 |
|---|---|---|
| 強制 STANDARD，只開巨龍 | 78／22 | 88／11 |
| 強制 SWAPPED，只開巨龍 | 24／76 | 20／77 |
| 依 seed 推導（正式），只開巨龍 | 53／47 | 58／40 |
| 依 seed 推導，整場第一條巨龍／巴龍 | 53／47、49／51 | — |

殘留：下方坑近側先到 88%、上方坑近側 77%（拿下 78 vs 76，雜訊內），疑為 P0-B 記錄的 A* 方向性殘差，列觀察。

### 3.2 正式 n=1000（seed 1–1000、鏡像名單、Items ON；v15 為乾淨 `356630b` 既有資料；layout 依 seed：STANDARD 479／SWAPPED 521）

| 指標 | v15 | 舊 v16（36251d0） | **新 v16** |
|---|---|---|---|
| 藍／紅 | 53.1／46.9 | 55.5／44.5 | **49.6／50.4** |
| 配對 v15→（淨，z） | — | +24，1.13 | −35，−1.57 |
| 第一條巨龍 藍／紅 | 79.3／20.7 | 79.0／21.0 | **49.5／50.5** |
| 第一條巴龍 藍／紅 | 23.5／76.5 | 23.7／76.3 | **52.2／47.8** |
| 巨龍總控制 藍／紅 | 73.7／26.3 | 72.8／27.2 | **48.5／51.5** |
| 龍魂取得率（合計） | 39.7% | 38.7% | **39.9%** |
| 龍魂方勝率 | 58.4% | 69.3% | 71.7% |
| 第一條巴龍方勝率 | 56.2% | 54.2% | 54.0% |
| 後期物件轉換 | 58.6% | 62.1% | 60.3% |
| 龍層領先方勝率 | 56.6% | 61.9% | 62.1% |
| 逆轉賞金方勝率 | — | 30.9% | 24.3% |
| 時長中位／P90／最長（分） | 17.07／24.0／31.0 | 17.05／23.8／52.3 | 17.07／23.8／41.3 |
| 未結束／> 45 分 | 0／0 | 0／1 | **0／0** |

**依 layout 拆解（新 v16）**：STANDARD 藍勝 58.0%、SWAPPED 藍勝 41.8% ⇒ 純藍方地利 **−0.1 ± 1.6pp**；
**巨龍側單場優勢 8.1 ± 1.6pp**。診斷（同一棵樹關閉 Objective Stakes＋TD-CS1）：巨龍側優勢 3.3 ± 1.6pp
⇒ **Objective Stakes 淨貢獻 +4.8 ± 2.2pp（約 2.2σ）**。龍魂幾乎全由巨龍側取得（近側約 36%、遠側 3–5%）。

## 4. ART_COLLISION_ALIGNMENT_BLOCKER（上線前必須解除）

正式 Rift GLB（`public/assets/moba/rift-v1`）的坑是用舊腳印建的，也烘焙了物件身分色：

| | GLB 坑壁與碰撞逐段一致 | 巨龍坑 半徑／壁厚（GLB → 碰撞） | 巴龍坑 半徑／壁厚（GLB → 碰撞） |
|---|---|---|---|
| v15 幾何 | 95/95 | 16.95／4.54 → 16.95／4.54 | 13.94／5.62 → 13.94／5.62 |
| v16 對稱幾何 | **0/96** | 16.95／4.54 → **15.47／5.07** | 13.94／5.62 → **15.47／5.07** |

- 巨龍坑：碰撞比畫面牆**往內**約 1.5（看不見的牆）；巴龍坑：碰撞**往外**約 1.5（英雄走進畫面岩壁約 2 單位）。
- 坑光暈烘焙紫／金身分色；SWAPPED 時與 runtime 坑位標記同時出現、互相矛盾（`review/moba-objective-v16/owner/12-objective-layout-swapped-replay-desktop.png`）。
- 驗收 gate：`tools/check_objective_pit_art_alignment.mjs`，**目前 0/4 BLOCKED**；轉綠＝解除。runtime 光環**不算**解決。

### 最小資產修正方案（只修兩個坑，不重做整張 Rift）

1. `node tools/export_esmo_rift_source.mjs` 重新匯出 `art/moba-rift/source.json`（坑壁牆段即為新的對稱腳印，96 段）。
2. Blender（`art/moba-rift/build_rift.py`，Blender MCP）**只重建**兩坑的 `pit_wall`／`entrance_taper`／坑底網格；其餘 97 個網格不動。
3. 兩坑光暈改為**中性**材質（不帶紫／金）；Dragon／Baron 身分完全由 runtime `ObjectivePitMarkers` 表示。
4. 重新匯出 `esmo-rift.glb` 與小地圖 `rift-albedo.png`（坑色也烘在小地圖貼圖裡），更新 manifest／小地圖快取 revision。
5. 驗收：`check_objective_pit_art_alignment` 4/4、`check_esmo_rift_v1`（其既有的 jungle_struct 不同步是另一筆 main 技術債）、
   `browser_check_objective_layout_v16` 與 STANDARD／SWAPPED 各一張 Owner 截圖（坑上只剩一種物件色）。

## 5. 尚未處理（刻意）

- Challenge（`challengeRunner`）未設定 layout ⇒ 永遠 STANDARD。
- 舊版 `MobaView3D`（無 mapMeta 的舊 replay 退路）仍畫 STANDARD——這些 replay 依契約本來就是 STANDARD。
- Nexus cap、Passive、Competitive、Online Backend、其他 Blue bias：未碰。
