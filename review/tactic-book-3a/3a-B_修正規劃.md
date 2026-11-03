# Phase 3a-B 修正規劃（G-A8 方案 C、Challenge 側偏與陣容平衡）

- 日期：2026-10-28（設計與必要診斷；未改模擬語意、未重跑 P2）
- 分支：`feature/moba-phase3a`（本機；未 push／deploy／整合 main，發布旗標未啟用，未碰 CS）
- 依據：Owner 2026-10-28 裁定（方案 C 原則核准、B 暫不採用；Challenge 另立工作項目；兩項 STOP 保留、門檻不放寬）
- 語意凍結仍是 `176ccac0`，v21 候選指紋 `0578fa882d74b205`；本輪 `src/` 未改

## 1. tacticTemplates.js 是否由 v20／v21 共用？版本化修正怎麼做

### 1.1 查證結果

| 問題 | 結果（從程式碼與 git 查證） |
|---|---|
| v20 正式版（main `1d0e219`）有沒有模板檔？ | **沒有**。`src/platform/tactics/tacticTemplates.js` 不在 `1d0e219`；戰術書（Phase 3a）尚未上線。正式站的 m1–m8 戰術來自 `MobaTacticConfig.js` 的 `MOBA_TACTICS`（legacy 路徑）。 |
| 經典模板 classic.m1–m8 的數值從哪來？ | 由 `MOBA_TACTICS` **程式派生**（`tacticTemplates.js:34-56`，gate 禁止在這段寫數字字面值）。改 `MOBA_TACTICS` ＝同時改到 v20 正式戰術、v20 黃金與歷史挑戰。 |
| 在本分支上 v20 規則集會不會讀到模板？ | **會**。`career.v20`、`balanceTool.v20` 都接受 `binding` 輸入（`matchRuleset.js` 的 `TACTIC_KINDS_BY_RULESET`），戰術書畫面在旗標關閉時也會送出 binding（`TacticScreen.jsx` → `liveMatchSetup.js:197`）。也就是說：3a 一旦合併，**即使 v21 旗標關閉**，v20 規則集的玩家也會經 binding 用到模板資料。 |
| Challenge 的戰術從哪來？ | 快照只存 `standingOrders.tacticId`；開打時 `challengeRunner.js:134` 用 `mobaTacticById(tacticId)` 取 legacy 設定。**不經過模板**。 |
| 指紋怎麼算？ | `tacticTemplates.js` 在語意清單（`simulationVersion.js:209`），不在文字雜湊豁免清單。v20 的指紋 `050b3f66620f0f57` 是歷史紀錄、永不變更；gate 只比對「目前版本」（v21 候選）那一格。 |
| UI 呈現 | 戰術書的指標條由設定值計算（`tacticIndicators.js:71-77, 250`）；模板文案 `desc`／`cons` 有一致性 gate（`check_tactic_plan_3a` V2k6）。 |

結論：**不能直接改模板或 `MOBA_TACTICS` 的數值**——前者會讓（合併後）旗標關閉的 v20 玩家行為改變，後者會改到 v20 正式戰術與黃金。

### 1.2 建議的最小版本化修正（設計，尚未實作）

把「平衡修正」做成**只存在 v21 規則集的一層資料**，比照已上線的 `laneFrame` 先例（「v20 三份規則集永不加這個鍵」）：

1. **資料**：在 `tacticTemplates.js` 新增一張凍結的修正表 `TEMPLATE_BALANCE["v21.b1"] = { "classic.m3": { "macro.aggression": …, … }, … }`。模板本身（`tacticTemplates.v1`）與 `MOBA_TACTICS` **一個字都不改**。
2. **規則集**：`career.v21`、`balanceTool.v21`、`challenge.v21` 新增層 `templateBalance: "v21.b1"`；三份 v20 規則集**永不加這個鍵** ⇒ v20 的 setup 雜湊、v20 黃金 39 案逐位元不變。
3. **解析**：Resolver 解析 binding 時，在模板設定之後、覆蓋層與玩家選擇之前，依本場規則集的 `templateBalance` 套用修正表（以 `templateId` 為鍵）。binding 的格式與 `templatesVersion` 不變 ⇒ 玩家存好的戰術書、planHash 都不受影響。
4. **AI 對手**：career.v21 的 AI 教練走 binding ⇒ 自動套用（AI 選 m3／m7 時同樣變弱，這是預期）。
5. **Challenge**：challenge.v21 的 builder 在規則集帶 `templateBalance` 時，把快照的 `tacticId` 經同一張修正表取設定（只套用在未覆蓋的經典設定）；challenge.v20 與歷史挑戰不變（它們由記下的模擬版本凍結規則集）。
6. **呈現**：戰術書的指標條與能力說明在 v21 規則集下要用修正後的設定計算；若選了內容欄位的候選（例如打野改成抓人），對應模板的 `desc`／`cons` 要出 v21 版文案。
7. **gate**：新增檢查：v20 三份規則集沒有 `templateBalance`；`MOBA_TACTICS` 與模板 v1 逐位元不變；修正表每一項落在已出貨的範圍內、修正後旋鈕組兩兩不同（同 V4／V6 規則）；v20 黃金 39 案逐位元相同。

影響範圍（要改的檔）：`tacticTemplates.js`（修正表）、`matchRuleset.js`（三份 v21 規則集加層）、`tacticResolver.js`（套用點）、`challengeMatchSetup.js` 或 `challengeRunner.js`（challenge.v21 取設定）、`tacticIndicators.js`／戰術書畫面（呈現）、必要時文案。全部是語意檔 ⇒ **重新登記 v21 候選指紋**（v20 指紋不動）。

不採用的做法：
- 改 `MOBA_TACTICS`：改到 v20 正式行為與歷史，違反 Owner 第 2 點。
- 開 `tacticTemplates.v2` 讓 binding 換版本：所有已存的戰術書 binding 會因 `templatesVersion` 不符被拒，牽動存檔與 UI，不是最小修正。

## 2. G-A8 各問題模板的修正方案

資料：`tools/fixtures/ga8_fix_screen_result_3aB.json`（commit `a0a00956`；23 臂 × 400 個全新 seeds 41001–41400 ＝ 9,200 場、錯誤 0；驗證 4/4 PASS——登記的 V1、V2、V3 中 V3 分為設定探針 V3a 與引擎 t＝0 探針 V3b，見 `ga8-fix-screen-validate/VALIDATION.json`；std 對照 51.75%，在 0.50 ± 0.05 內）。區間皆為未校正 95%（23 臂）。登記：`tools/fixtures/ga8_fix_screen_registration_3aB.json`（事前登記，選擇規則：0.43 < 勝率 < 0.57；0.45–0.55 為 SELECTED、其餘為 SELECTED_BORDERLINE；依登記順序取改動最小者）。
⚠ 篩選是**開發期**資料：選出的候選必須在凍結後用**另一批保留 seeds（43001–43400）**做確認，不得拿篩選勝率當確認證據（贏家詛咒）。

### 2.1 先看一件事：原 G-A8 數字在新 seeds 上普遍往 50% 回落

| 模板 | 原 G-A8 | 篩選 BASE（新 seeds） | 是否重現原判定 |
|---|---|---|---|
| classic.m3 | 68.3 STOP | 63.0（58.3..67.7）STOP | 重現 |
| classic.m7 | 67.3 STOP | 61.5（56.7..66.3）STOP | 重現 |
| classic.m1 | 60.3 STOP | 54.0（49.1..58.9） | **未重現** |
| v2.three_lane_pressure | 60.3 STOP | 57.3（52.4..62.1）WARN 強 | 部分（降為 WARN） |
| v2.mid_jungle_sync | 60.3 STOP | 56.5（51.6..61.4） | **未重現** |
| v2.defensive_hold | 28.5 WARN 弱 | 32.8（28.1..37.4）WARN 弱 | 重現 |
| classic.m8 | 36.3 WARN 弱 | 41.0（36.2..45.8）WARN 弱 | 重現 |
| v2.mid_solo_split | 42.3 WARN 弱 | 46.0（41.1..50.9） | **未重現** |

8 個模板的絕對勝率都往 50% 移動 3.0–6.3pp，但 **std 控制組本身也從 54.75% 降到 51.75%（約 −3pp）**，所以有一部分是 seed 區塊的整體差異。改用相對 std 的成對差看：m1 從 +5.5 降到 +2.3，屬於明顯回落；mid_jungle_sync（+5.5 → +4.8）與 three_lane_pressure（+5.5 → +5.5）**幾乎沒有回落**——這兩個模板「未重現／降為 WARN」只是絕對勝率剛好跨過門檻，**不代表它們不強**，要由確認性 G-A8 判定。這正是 Owner 要求「依證據分別處置、不得盲目調係數」的理由。（審查 #1）

### 2.2 逐模板處置

| 模板 | 證據 | 處置建議 | 修正值（`TEMPLATE_BALANCE["v21.b1"]`） | 篩選預期影響 |
|---|---|---|---|---|
| **classic.m3** | 重現 STOP；旋鈕研究 KNOB_DRIVEN（兩旋鈕無法分開） | **修**（SELECTED M3_C） | `macro.aggression` 0.6、`macro.riskTolerance` 0.5 | 63.0 → 54.0（對 BASE −9.0，−15.7..−2.3）；vsStd +2.3（−4.2..+8.7）。⚠ M3_C 是三個候選中的最佳者，−9.0 會偏大（贏家詛咒）；上界 58.9，確認時落入 WARN 強（≥ 57）是可能的 |
| **classic.m7** | 重現 STOP 61.5；三個候選 57.8／60.3／58.3，與 BASE 的差都含 0（−3.8／−1.3／−3.3），彼此無法區分 | **本輪不修**（NO_CANDIDATE）。旋鈕研究判 risk 主導、內容效應未偵測到；但 aggression 0.6＋risk 0.5 只降 3.3pp。**第二輪篩選（凍結前，待核准）事前登記**：M7_D（0.5／0.5）、M7_E「姿態中性」（earlyGame／midGame 姿態改回 std，旋鈕不動）、M7_F（M7_D＋姿態中性）；新開發 seed 區塊 | 無（待第二輪） | — |
| classic.m1 | 新 seeds 未重現（54.0；vsStd +2.3） | **不修**；由確認性 G-A8（43001–43400）重驗。M1_A 對 BASE +1.3（方向相反），不列備案 | 無 | — |
| v2.three_lane_pressure | 降為 WARN 強 57.3，但 vsStd +5.5 與原 G-A8 相同；旋鈕研究 CONTENT_DRIVEN；未登記候選 | **本輪不修**；確認性 G-A8 仍 STOP 時，由 Owner 決定是否做內容研究 | 無 | — |
| v2.mid_jungle_sync | 新 seeds 未過 STOP（56.5），但 vsStd +4.8 幾乎沒回落 | **本輪不修**；MJS_B（aggression 0.5，54.8，對 BASE −1.8，−8.5..5.0）列為備案，若要預防性處理可併入第二輪篩選 | 無 | — |
| **v2.defensive_hold** | 重現 WARN 弱；三個候選都沒有改善，打野改抓人、提高龍優先反而更弱（DH_A −4.3、DH_B −6.8；未校正區間不含 0，23 臂，z ≈ 2.2，不過多重比較） | **本輪不修**；看起來是內容層的弱（防守模板本身的設計），不是旋鈕；建議另立「防守型模板」設計題 | 無 | — |
| **classic.m8** | 重現 WARN 弱 41.0；M8_A 42.5，對 BASE 只有 +1.5（−5.4..8.4），旋鈕這一步沒有效果 | **本輪不修**（NO_CANDIDATE）；不放寬門檻。第二輪若要修，需新登記更大一步的候選（例如 aggression／risk 0.5／0.5）與新 seeds | 無 | — |
| v2.mid_solo_split | 新 seeds 未重現（46.0） | **不修** | 無 | — |

**結論：本輪篩選下，`v21.b1` 修正表只有一項——classic.m3。** m7（優先項，仍 STOP）與 m8 需要第二輪篩選；defensive_hold、three_lane_pressure 需要內容研究；m1、mid_jungle_sync、mid_solo_split 交由確認性 G-A8 重驗。⚠ **只修 m3 不能解除 G-A8 STOP**（m7 BASE 61.5% 重現），見 §4.3。
m5、m6、hard_engage_stack（原 G-A8 WARN 強）不在本輪範圍，由確認性 G-A8 的 21 模板一併重驗。

### 2.3 m3 修正的連帶影響

- 規則檢查：0.6／0.5 都在已出貨範圍內（aggression 0.25–0.85、risk 0.2–0.85，V4）；與其他 20 個模板的旋鈕組不同（篩選 V2 已驗）。
- 呈現：戰術書指標條（`tacticIndicators.js`）在 v21 規則集下改用修正後的值；m3 的 `desc`／`cons` 若寫到「高侵略／高風險」需出 v21 版文案（`check_tactic_plan_3a` V2k6 會擋不一致）。
- AI 教練：career.v21 的 AI 選 m3 時同樣套用（預期）。
- Challenge：練習 fixture 不用 m3，但 challenge.v21 下選 m3 的**玩家快照**會套用修正（§1.2 第 5 點）；challenge.v20 與歷史挑戰不受影響。（審查 #4）
- v20：不受影響（v20 規則集不帶 `templateBalance`）。

### 2.4 確認性研究（凍結後，事前登記草稿）

`tools/fixtures/ga8_fix_confirm_registration_3aB.json`（DRAFT，不可執行）：與原 G-A8 相同設計，seeds 43001–43400（已預留、未使用），21 模板全測，門檻不變（STOP＝勝率 ≥ 0.60 且 95% 下界 > 0.55；WARN ≥ 0.57 或 ≤ 0.43；std 0.50 ± 0.05）。凍結後填入新指紋才能執行。8,400 場，約 3–3.5 小時。

## 3. Challenge 側偏與陣容翻轉的根因診斷

資料：`tools/fixtures/challenge_ladder_result_3aB.json`（commit `e7da437a`；18,392 場、錯誤 0、2,049 seeds；指紋 `0578fa882d74b205`）。登記：`tools/fixtures/challenge_ladder_registration_3aB.json`。
做法：從正式 v20 setup 出發，**整組複製** v21 的層，一次加一組，量「抵銷強弱後的藍方優勢 S」每一步變多少（成對、同 seed）。兩端（v20、v21）重用已提交的雙向研究，V1 驗證兩端逐場重現。

### 3.1 側偏：每一步的變化（pp，括號為未校正 95% 區間）

| 步驟 | STANDARD（S：−2.7 → +0.8） | SWAPPED（S：−1.2 → +3.1，這是惡化的那一層） |
|---|---|---|
| 加 frame（Director＋laneFrame，在 v20 端） | **+2.3（0.9..3.8）← 唯一過 Bonferroni 的步驟** | +0.7（−0.8..2.2） |
| 加 skills（含組裝順序） | +0.1（−2.0..2.2） | +1.7（−0.6..4.0） |
| 加 growth（被動＋強度曲線） | +1.0（−1.0..3.0） | +0.2（−1.9..2.3） |
| 加 layout（v21 端） | 0.0（STANDARD 本來就固定坑位，設計上必為 0 ✔） | +1.7（−0.3..3.8） |
| 移除 frame（在 v21 端） | −0.4（−1.7..0.8） | −0.1（−1.5..1.3） |
| 加 layout（在 v20＋frame 端，低端） | — | +0.5（−1.8..2.8） |
| **總變化** | +3.4（1.3..5.6） | +4.4（2.2..6.6） |

加總檢查三層皆通過。判定 **ATTRIBUTED**（只有 STANDARD 的 frame 一步過 Bonferroni 門檻）；SWAPPED 判為 **DIFFUSE_OR_UNDERPOWERED**：沒有任何一步過門檻；點估計較大的是 skills（+1.7）與 layout（+1.7），但兩者的未校正區間都含 0，且都低於單步可偵測下限（MDE 約 3.0pp，Bonferroni 下 3.6pp）。依登記，這**不是**「某一組沒有效果」的證據。（審查 #5）

白話解讀（皆為點估計，未過門檻者不當結論）：
1. **地圖配置（layout）**：v21 端 +1.7pp、低端（只有 frame）+0.5pp，差 1.2pp，未檢定 ⇒ **無法判斷**地圖配置是否和技能有交互作用。雙向研究的「純藍方 +2.0、巨龍側 −1.2」也沒有指出單一的地圖側優勢可以直接修。
2. **技能／成長**：skills 這一步 SWAPPED +1.7pp（區間含 0），是側偏惡化點估計最大的來源之一。growth 步驟的區間（STANDARD −1.0..3.0、SWAPPED −1.9..2.3）**無法排除**最多約 3pp 的影響。
3. **引擎順序**：組裝順序（assemblyOrder）在沒有技能時是空轉（驗證 V2：L2＝L1 逐場相同），有技能時與技能**無法拆開**（`challengeV20` 順序拒絕技能）。同一 tick 內藍方先結算的「迭代順序」不在任何層上，本研究量不到。⚠ 迭代順序在 v20／v21 **相同**，而 v20 合併側偏是紅方 −2.0pp ⇒ 它**不能解釋** v20 → v21 的惡化（SWAPPED +4.4pp），最多只能解釋 v21 的殘留水準。（審查 #6）
4. **Tactical Director／laneFrame**：在 v20 脈絡下加上 frame，STANDARD +2.3pp（|S| 從 2.7 變 0.4）；但在 v21 脈絡中拿掉 frame 幾乎沒差（−0.4／−0.1），交互作用約 −2.7pp（未檢定）⇒ **拿掉 frame 不能修 v21 的側偏**。依登記的解讀表，FRAME 標籤應重新檢查 **TD-3A-23**（列入 §5.3）。（審查 #9）
5. **隊伍強弱**：見 3.2，影響量級（±20–33pp）比側偏（約 2–4pp）大一個數量級。

### 3.2 兩組陣容強弱翻轉：根因（每組配對為描述性，未做多重比較校正）

| 配對（前者勝率） | v20 → v21 | 主要來自哪一步 |
|---|---|---|
| drill_mirror > drill_topheavy | 71.3 → 48.2（−23.0） | **growth −19.3（−23.9..−14.8）**；skills −1.8、frame −1.9／−3.3 皆不顯著 |
| drill_rotation > drill_balanced | 65.2 → 95.4（+30.3） | **skills（含順序）+33.2（29.4..36.9）**；frame@v20 −5.8、growth +2.4 |
| drill_topheavy > drill_rotation（參考） | 9.4 → 10.6 | skills +8.2、growth −4.2，互相抵銷 |

根因判讀（程式碼查證＋階梯資料；**沒有逐英雄量測**）：
- 技能等級**只看本場等級**（`heroSkillLevels.js`，HeroSkillLevel.v2），不看熟練；強度曲線是**每名英雄一張表**（`heroPowerCurve.js:15,24-27`：曲線分數每偏離 1 分 ±4%，三段平均倍率恆為 1）。
- 翻轉發生在 growth（mirror／topheavy）與 skills（rotation／balanced）這兩步，**與選角及英雄內容一致**：
  - `drill_rotation`（m2，優先選 chichuan，b4 leiting、b5 dadi）在開技能後從 65% 變 95%；`drill_balanced`（m1，禁 ironclad／lieyan，優先 bingshuang、leiting）。
  - `drill_topheavy`（m4，優先 cinderfist、lieyan、chichuan）在開被動／強度曲線後追上 `drill_mirror`。
- 但**能力值分布**（topheavy 前兩席 +22、其餘 −13）與**熟練**（各 fixture 4–12 級）和技能／成長的交互作用**還未排除**。
- 另外，drill_mirror > drill_topheavy 在 skills 步驟的側偏 **S +9.5pp（5.1..13.9，z 4.2，描述性）**、layout@low S +8.9（z 2.9）⇒ 技能的側別效應可能**集中在特定陣容**，這也是 C2 要先做的理由。（審查 #7）
- 這兩組配對是挑戰的**練習用 fixture**，數值是 v20 時代（沒有技能／成長）實測校出來的（`fixtureOpponents.js` 註解：`drill_mirror` 的 base 70 是「實測校到」）。v21 加入技能與成長後，原本的校準前提就不成立了。

### 3.3 修正方案（不加紅藍數值補償）

| 編號 | 對象 | 方案 | 是否改語意 | 影響 v20 |
|---|---|---|---|---|
| C2（先做） | 陣容翻轉＋技能側別 | **逐英雄／逐陣容診斷**（工具臂，不改 `src/`）：對 rotation／balanced、mirror／topheavy 兩組做「換一名英雄」「能力值拉平（spread 0）」「熟練拉平」的拆解臂，量 skills／growth 步驟的翻轉與 S 由誰帶動。理由：技能也影響 career，若先校 fixture 會把英雄失衡掩蓋掉。本輪不動英雄數值。 | 否（診斷）；後續修正視結果 | 否 |
| C1 | 陣容翻轉 | **重新校準 v21 的練習 fixture**：challenge.v21 規則集下，fixture 的 `base`／`draft` 偏好另立 v21 版（比照 §1.2 的版本化表），以開技能＋成長後的實測重新校準；v20 fixture 定義一字不改（歷史挑戰重播需要）。篩選使用**新預留的開發 seed 區塊**（需加入 seed plan，與 45001–49999 不重疊），**事前登記**每組配對的目標區間與選擇規則；要回到 v20 的強弱順序，還是重新定義難度階梯，由 Owner 決定。（審查 #8） | 是（`fixtureOpponents.js` 與快照雜湊；需 Owner 決定快照版本如何標示） | 否 |
| C3 | 側偏 | **不加紅藍補償**。側偏惡化的點估計主要在 skills ⇒ **先做 skills 的側別審計**（技能的目標選擇、命中、地形假設在紅藍兩側是否對稱；可從 C2 的拆解臂順帶取得）。同 tick 迭代順序的診斷（需在引擎加工具專用旗標）排在其後——它在 v20／v21 相同，只能解釋殘留水準，不能解釋惡化。若最後證實是順序，修正方向是**同時結算或交替先手**（結構修正，不是數值補償）。 | 審計本身否；順序旗標會進語意檔 ⇒ 需 Owner 核准 | 旗標預設關閉、v20 規則集不帶 ⇒ 否 |
| C4 | 側偏（地圖） | layout 的效應**未偵測到**（兩端都不顯著）⇒ 不改坑位數值；若 C3 後仍殘留，再看技能在不同坑位側的命中／目標選擇。 | 視結果 | 否 |

側偏的確認性驗證用已預留的新 seeds：`sideBias.challenge.fixConfirm`（45001–49999，雙向）與 `sideBias.career.fixConfirm`（51001–55999）。門檻沿用原 STOP，不放寬。

## 4. 能否在同一次語意凍結後統一重新驗證

**結論：可以，但前提是「開發期篩選」與「凍結後驗證」分開，且所有語意改動在凍結前一次做完。**

### 4.1 為什麼可以合併

- G-A8 方案 C（§1.2 的 `templateBalance`）與 Challenge C1（v21 練習 fixture 重新校準）都只動 v21 規則集讀得到的資料；兩者改的檔都在語意清單裡 ⇒ 不論分開或合併，**都要換一次 v21 候選指紋**。分兩次做＝付兩次整輪重驗；合併＝付一次。
- 兩者互相影響：career.v21 的 AI 教練會選到修正後的模板、challenge.v21 的 fixture 戰術也是 m1／m2／m4／m6 ⇒ **分開驗證反而會讓先驗的那份結果過期**。
- v20 不受影響（三份 v20 規則集不帶新鍵、`MOBA_TACTICS` 與 v20 fixture 不改）⇒ v20 黃金 39 案應逐位元相同，這一條可以在凍結前就先驗。

### 4.2 建議流程（三段）

| 段 | 內容 | 是否換指紋 | 單線成本（估） |
|---|---|---|---|
| A 開發期篩選（不凍結） | 已完成：G-A8 候選篩選（9,200 場）、Challenge 階梯（18,392 場）。待核准：① **G-A8 第二輪**（m7 三臂＋m8 一臂＋STD＋兩個 BASE ≈ 7 臂 × 400 ＝ 2,800 場，約 1–1.2 小時）；② **C2 逐英雄／逐陣容診斷**（約 6–8 臂 × 2 組配對 × 雙向，約 4,000–6,000 場，約 1.5–2.5 小時）；③ **C1 fixture 校準篩選**（5 組 fixture × 3–4 個候選 × 400 seeds；單向約 6,000–8,000 場、2.5–3 小時；若要雙向抵銷側偏則加倍為 12,000–16,000 場、4.5–7 小時，建議雙向）；④ 若核准，同 tick 結算順序診斷（約 4,098 場雙向，約 1.5 小時） | ④ 會（旗標進語意檔） | 約 9–12 小時（全做、雙向） |
| B 實作＋凍結 | `templateBalance` 表與套用點、v21 fixture 表、指標／文案、新 gate；**C3 的結構修正若需要也在這裡一起做**；v20 黃金 39 案、`check_match_setup_3a` 先跑 | 是（一次） | 實作另計；gate 約 45 分 |
| C 凍結後一次性重驗 | 真實性表整輪（約 70 分）、證據重播 2,600、E1 8,400、E2 1,600、G-A8 確認（新 seeds 43001–43400，21 模板 8,400）、career 側偏確認（約 4,058）、challenge 側偏確認（45001–49999 雙向，約 4,098）、v21a／career／challenge 黃金重錄（需 Owner 同意）、42 支 gate、verify 全套（90–120 分）、瀏覽器 gate | 否 | **約 16–19 小時**（見下方拆解） |

C 段拆解：對局合計 2,600＋8,400＋1,600＋8,400＋4,058＋4,098 ＝ 29,156 場，以 1.3–1.6 秒／場（workers=3）約 10.5–13.0 小時；真實性表約 1.2 小時；42 支 gate 約 0.75 小時；verify 全套 1.5–2 小時；黃金重錄與瀏覽器 gate 約 1–1.5 小時 ⇒ 合計約 15–18.5 小時，取整為 16–19 小時（含中斷續跑的餘裕）。（審查 #12）

### 4.3 什麼情況下無法合併

- **m7 若在凍結前沒有選出候選**，C 段的 G-A8 確認預期仍為 STOP（m7 BASE 61.5% 重現），這次凍結**無法解除 G-A8**。⇒ 建議先完成 m7（以及 m8／defensive_hold 是否處理）的第二輪篩選再凍結，否則會多付一次 C 段（約 16–19 小時）。（審查 #3）

- C3 診斷結果顯示需要**引擎結算順序**的結構修正，而該修正在凍結前來不及完成 ⇒ 建議先凍結 A+C1（G-A8 與 fixture），C3 另開下一輪；側偏 STOP 在那之前維持不變。這會多付一次 C 段（約 16–19 小時）。
- G-A8 確認性研究（C 段）若仍有模板 STOP ⇒ 依原規則維持 STOP，不在同一次凍結內調第二次係數（避免用確認 seeds 調參）。

## 5. 待 Owner 核准事項

### 5.1 變更範圍（若核准，實作時）

| 項目 | 檔案 | v20 影響 |
|---|---|---|
| G-A8：修正表 `v21.b1`（目前只有 m3；第二輪若選出 m7／m8 候選一併加入） | `tacticTemplates.js`、`matchRuleset.js`（三份 v21 規則集加 `templateBalance`）、`tacticResolver.js`、`challengeRunner.js`／`challengeMatchSetup.js`（challenge.v21 取設定）、`tacticIndicators.js`／文案、新 gate | 無（v20 規則集不帶鍵；`MOBA_TACTICS`、模板 v1 不改） |
| Challenge C1：v21 練習 fixture 重新校準 | `fixtureOpponents.js`（新增 v21 版表）、challenge.v21 builder | 無（v20 fixture 一字不改，歷史挑戰可重播） |
| Challenge C3（選擇性）：同 tick 結算順序診斷旗標 | `LogicEngine.js`（工具專用、預設關閉） | 無（預設關閉；但檔案在語意清單 ⇒ 換 v21 候選指紋） |

### 5.2 驗證成本

- 開發期篩選（凍結前）：全做且 C1 雙向約 9–12 小時（G-A8 第二輪 1–1.2、C2 1.5–2.5、C1 4.5–7、順序診斷 1.5）。
- 凍結後一次性重驗：約 16–19 小時單線（拆解見 §4.2）。

### 5.3 待 Owner 核准事項

1. **G-A8 m3 修正**：classic.m3 aggression 0.6／risk 0.5，版本化為 `v21.b1`（只在 v21 規則集生效）。
2. **G-A8 第二輪篩選**（凍結前）：m7 三個新候選（M7_D 0.5／0.5、M7_E 姿態中性、M7_F 兩者合併）與 m8 一個更大步候選，使用新的開發 seed 區塊（需加入 seed plan）。不做的話，凍結後 G-A8 預期仍 STOP。
3. v2.defensive_hold（及確認後仍 STOP 的 three_lane_pressure）**另立內容研究／模板設計題**，不在本次平衡修正內；m1、mid_jungle_sync、mid_solo_split 交由確認性 G-A8 判定。
4. **Challenge C2**：核准逐英雄／逐陣容診斷（工具臂，不改 `src/`），排在 C1 之前。
5. **Challenge C1**：核准 v21 練習 fixture 校準篩選（建議雙向），新開發 seed 區塊；並決定**校準目標**（回到 v20 的強弱順序，或重新定義難度階梯）與 v21 fixture 表的版本化方式（快照版本如何標示）。
6. **Challenge C3**：先做 skills 側別審計（不改 `src/`）；是否核准在引擎加入工具專用的「同 tick 結算順序」旗標（會換 v21 候選指紋）。
7. **TD-3A-23 重新檢查**：依階梯登記的解讀表，FRAME 標籤（STANDARD frame@v20 +2.3pp）要回頭檢查。
8. **統一驗證流程**：核准「開發期篩選 → 一次凍結 → 一次性重驗（約 16–19 小時）」，以及凍結後 v21a／career／challenge 黃金重錄。
9. **確認性 seeds**：G-A8 43001–43400、challenge 45001–49999 已預留；career 51001–55999 在 seed plan 中標為「若 Owner 選擇新 seeds」，**是否改用新 seeds 待 Owner 決定**。

本輪未修改任何模擬語意、未啟動全套 P2；兩項 STOP 維持；發布旗標未啟用；未 push／deploy／整合 main；未碰 CS。

## 6. 獨立審查紀錄

- 2026-10-29 獨立 Reviewer（唯讀，逐一核對 fixtures 與程式碼行號）：**APPROVE WITH CHANGES**（8 Major／4 minor），全部採納：
  - Major：#1 std 控制組漂移（改用 vsStd 判讀回落）；#2 m7 的「內容來源」與旋鈕研究矛盾、候選差異都含 0（改為第二輪登記 M7_D／E／F）；#3 只修 m3 無法解除 G-A8（§4.3）；#4 challenge.v21 玩家快照也會套用 m3 修正（§2.3、§5.1）；#5 階梯不顯著的估計不當結論（DIFFUSE_OR_UNDERPOWERED）；#6 迭代順序在 v20／v21 相同，不能解釋惡化（C3 排序）；#7 根因未逐英雄量測、補上 mirror／topheavy skills 步驟 S +9.5（C2 先做）；#8 C1 需事前登記與新開發 seed 區塊。
  - minor：#9 frame 解讀與 TD-3A-23；#10 M3_C 贏家詛咒與 vsStd；#11 數字與用語（51.75%、3.0–6.3pp、驗證出處、多重比較、M8_A、M1_A、career seeds 待核准）；#12 C 段成本拆解與 C1 雙向成本。
- 程式碼宣稱經審查核實：`tacticTemplates.js:34-44`、`simulationVersion.js:209`、`challengeRunner.js:133-134`、`matchRuleset.js:17,29`、`liveMatchSetup.js:197`、`1d0e219` 無模板檔。
