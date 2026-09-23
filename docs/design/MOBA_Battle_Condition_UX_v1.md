# MOBA Battle Condition UX v1

分支：`feature/moba-battle-condition-ux`（自 `origin/main` = `e7f7cb6` 開出）。Competitive 維持 disabled，只做 local commit。

一輪處理五件事：角色呈現、體力規則、常駐名牌、技能標籤、休息入口。

---

## 1. 英雄／野怪腳下的圓圈

**Audit：每一種圓圈原本在做什麼**

| 圓圈 | 位置 | 原本的用途 | 判定 |
|---|---|---|---|
| 隊伍選取環 | 英雄腳下（`hero-ring`） | 藍／紅陣營辨識 | 裝飾／身分 ⇒ 改成本體光效 |
| Buff 環 ×4 | 英雄腳下（紅／藍 Buff、巨龍、巴龍） | Buff 狀態 | 狀態顯示 ⇒ 改成本體光效 |
| 陣亡標記 | 英雄腳下（四邊形外框） | 「這裡有人陣亡」 | **保留**（短暫、資訊性） |
| 地面符文環 | 野怪營地（`buff-ground-rune`） | 這是藍／紅 Buff 營 | 裝飾 ⇒ 改成營地柔光 |
| 拉回環 | 野怪營地（`leash`） | 營地正在返回重置 | 狀態顯示 ⇒ 改成營地柔光（琥珀色、呼吸更快） |
| 塔環／坑環 | 建築與目標 | 建築歸屬與目標區 | **保留**（不是角色腳下） |
| 技能地面指示 | HeroVfxRuntime | 技能範圍／命中 | **保留**（有 gameplay 意義、短暫） |

**做法**（`render/auraSprite.js` 為共用工廠，英雄與野怪不各做一套）

- `hero-contact-shadow`：中性色接地陰影（不帶隊色），讓角色踩在地上而不是浮著。
- `hero-aura`：面向鏡頭的徑向漸層柔光，平時是隊色、帶 Buff 時換成 Buff 色（Baron > 巨龍 > 紅 > 藍）。
- `hero-buff-motes`：三顆繞著角色轉的光點，只有帶 Buff 時出現。
- `neutral-aura`：營地柔光，Buff 營是該 Buff 色；返回重置時換琥珀色並呼吸加快。

**不動戰鬥邏輯**：這四項都只讀 frame、不讀 snapshot、不寫 store；引擎完全沒碰。

⚠ 地圖上的**野怪營地地坪**與塔基座是地形美術（`MobaMapBlockout`），不在本輪範圍。

---

## 2. 體力：從「擋出賽」改成「降能力」

**Audit**

- `matchFitness()` 在體力 < 15 時回 `ok:false`，`matchSquad` 的名單閘門據此擋人，`autoFillSquad` 也把人排除在候選池外。
- 體力對**實際比賽**幾乎沒有影響：MOBA 引擎吃的是能力 slots 與熟練 loadout，兩條都沒有體力；只有顯示用的 `calcPower` 會查 `CONDITION_EFFECT` 文字表。

**新規則（單一事實來源：`platform/condition/playerCondition.js`）**

- **體力永遠不阻擋出賽**。`matchFitness` 只剩「選手不存在」一種 not-ok，低體力改回報 `fatigue` 與提醒文字；名單閘門把它降成 `low_energy` 警告。
- **疲勞曲線 `fatigueFactor(energy)`**（三段折線，連續、單調、無門檻斷崖）：

| 體力 | 100 | 70 | 60 | 50 | 40 | 30 | 20 | 10 | 0 |
|---|---|---|---|---|---|---|---|---|---|
| 行為層倍率 | 1.000 | 1.000 | 0.985 | 0.970 | 0.955 | 0.940 | 0.913 | 0.887 | 0.860 |
| 發揮層倍率 | 1.000 | 1.000 | 0.996 | 0.993 | 0.989 | 0.985 | 0.978 | 0.972 | 0.965 |

- **套用點（三個，全部讀同一條曲線）**
  1. MOBA 能力 slots（`buildPlayerStatSlots` → 行為層：撤退門檻、推線深度、參團、Gank 節奏…）
  2. MOBA 熟練 loadout 的 `powerMult`／`toughMult`（發揮層，只吃 1/4 的疲勞）
  3. CS 引擎 stats（`fpsRoster`，行為與命中同一份 stats）
  顯示戰力（`calcPower`）也改讀這條曲線，不再用 condition 文字查表。
- **為什麼發揮層只吃 1/4**：`powerMult` 直接乘進傷害且在推塔／團戰複利放大。實測（60 seeds，雙方同 loadout）全額套用時，體力 40 就讓勝率 60% → 26.7%、體力 0 只剩 6.7% ⇒ 那是「低體力＝直接輸」。打 1/4 之後：

| 全隊體力 | 100 | 40 | 20 | 0 |
|---|---|---|---|---|
| 勝率（對上滿體力對手，60 seeds） | 60.0% | 60.0% | 40.0% | 31.7% |

  明顯的劣勢，但撐得住；輕度疲勞（40）幾乎沒有代價。
- 提醒門檻 `CONDITION.lowEnergyBelow = 40`（原 `unfitBelow = 15` 已移除）。

**對 MOBA／CS／simulation／replay 的影響**

- MOBA 與 CS 的比賽結果：**低體力時會不同**（這正是需求）。體力 ≥ 70 時所有套用點逐鍵不變 ⇒ 滿體力的比賽逐位元與先前相同。
- **模擬版本不需要 bump**：LogicEngine 與規則集（`matchProgression`）完全沒動，`check_simulation_version_gate` 51/51 且指紋維持 `moba-sim.v9 / 4d7cf571c8122219`。變的是**輸入**（誰上場、狀態多好），不是**語意**。
- **Replay 不受影響**：重播是播放既有 frames，不重算。
- 自動填入不再排除低體力選手，但同分層／同定位時優先挑體力高的 ⇒ 輪換仍是預設行為。

---

## 3. 戰鬥中的常駐英雄名稱

一般對戰與重播都**不再顯示**頭上的名稱／等級（`MobaRuntimeView3D` 的 `heroNameplates` 預設 `false`）。
身分資訊留在 HUD 十人列、Hero Detail、Scoreboard。名牌實作保留，觀戰／除錯要看時把 prop 打開即可。

---

## 4. 技能施放標籤

- 字級再縮一級：R 10px、其餘 9px（原本 11／10）。
- 依欄位給不同的入場動畫（可重用的 keyframes，只注入一次）：Q 斜切、W 柔和脈動、E 側移、R 重擊落下＋金色光暈。
- 全部 ≤ 0.42 秒、只做位移／縮放／透明度 ⇒ 不會蓋過技能特效本身。
- 同時顯示上限 4 → **3**（2×／4× 時不會整片都是字），R 優先。
- 尊重 `prefers-reduced-motion`。

---

## 5. 首頁體力提醒 → 直接安排休息

- 首頁待辦從「選手體力過低／點了跳名單」改成「**安排選手休息**／點了直接開體力管理面板」。
- 面板（`screens/dashboard/RestPlannerPanel.jsx`）：列出低體力選手（體力、出賽能力 %、是否已排訓練），支援單選／多選／全選，一次安排。
- Player Detail 的狀態欄也顯示「出賽能力 N%」，低體力時就地給一顆「安排休息」。
- **只呼叫既有的正式動作** `assignTraining(playerId, "rest")`（1 天、免費、由 `applyCourse` 回體力）。不直接改 `energy`、不建立第二套恢復系統。
- **不會偷偷推進日期**：面板明寫「推進 1 天後生效」，瀏覽器 gate 逐項比對安排前後的 `meta.days`。
- 待辦順序排在資金之後：手機首頁只渲染前 4 個待辦，排在最後時 390px 上看不到（瀏覽器實測抓到）。

---

## 驗證

`tools/check_battle_condition_ux.mjs`（38 項，純函式與契約）＋
`tools/browser_check_battle_condition_ux.mjs`（28 項，桌機 1366×900 與 390×844；體力 0–20 全隊出賽、休息批次安排、日期不變、MOBA 1×／2×／4×）。
其餘既有 gate 的實測結果見 `docs/handoff/05_Sprint紀錄.md`。
