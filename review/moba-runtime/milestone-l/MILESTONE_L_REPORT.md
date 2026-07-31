# Milestone L — Hero Combat Identity Presentation v1

日期：2026-07-31　起點 commit：`78d2395`（Milestone K）
rollback tag：`milestone-l-baseline` → `78d2395`

---

## 一句話

英雄在 Ban/Pick、Loading、Codex、Result、Replay 都有身分，唯獨**打起來全都長一樣**。
本輪建立一層「英雄戰鬥呈現」——顏色、形狀、八個共用演出模板——
並且**一個戰鬥數值都沒改**。

---

## 1. Audit 結論（先看這一節，本輪所有設計都是它推出來的）

### 1.1 引擎給得出什麼

實測（seed 42 跑 1200 tick，統計 `snapshot.fx`）：

| `fx.ability` | 次數 |
|---|---|
| `jungle:basic` / `sup:basic` / `adc:basic` / `mid:basic` / `top:basic` | 6,937 |
| `tower:basic` | 1,542 |
| `sup:power` / `top:power` / `adc:power` / `mid:power` / `jungle:power` | 2,091 |
| `neutral:basic` / `neutral:defeated` | 699 |
| `boss:dragon` / `boss:baron` | 375 |
| `buff:redBuff` / `buff:blueBuff` | 56 |
| `null` | 392 |

`fx` 的欄位是
`{ type, pos, target, color, sourceId, targetId, ability, feedback, id, at, exp, life }`。

**三個關鍵事實：**

1. **沒有任何欄位代表 Q/W/E/R。** `ability` 只有 `{role}:basic` 與 `{role}:power`
   兩種變體（`LogicEngine.js:1523` 的 `const power = this.rng() < 0.2`）。
   引擎**不模擬技能施放**。
2. **`sourceId` 是 playerId（`b1`–`b5` / `r1`–`r5`），不是 heroId。**
   heroId 要靠 `roster[playerId].heroId` 解析——那份 roster 是
   `buildBattleRoster()` 產出的，Loading／對戰／Result／Replay 共用同一份。
3. `type` / `feedback` 有 `line/attack`、`ult/skill`、`tower/attack`、`neutral/attack`
   四種組合，可以區分「普攻 vs 大動作」，但區分不到技能等級。

### 1.2 現有的消費端

| 消費者 | 吃什麼 | 現況 |
|---|---|---|
| `MobaRuntimeEffects.jsx` | `frame.effects` | 依 `combatClass` ＋ `style` 給六職業配色與形狀 |
| `BattleTimeline.jsx` | `battleStore.events` | 純文字戰報，**沒有英雄頭像** |
| `BattleHeroStrip.jsx` | snapshot players | 有英雄名與 buff |
| Replay | `replayPresentationSource` → 同一個 `MobaView3D` | 與現場共用呈現源 |

### 1.3 最小接線點

**`mobaRuntimeMapAdapter.adaptEffects()`（`map/mobaRuntimeMapAdapter.js:549`）。**

它**已經**是 fx → 呈現的轉換點：讀 `opts.roster[f.sourceId]` 解析 heroId、
呼叫 `heroVisualFor` / `skillVisualFor`、輸出 phase / world / color。
本輪只在它的輸出**新增一個 `presentation` 欄位**，既有欄位一個都沒動。

### 1.4 已經存在的東西（所以不建第二套）

`battle/moba/presentation/heroArchetypes.js`（H.3/H.4）**已經**有 10 位英雄的
3D 剪影與主色（`HERO_VISUALS`）。本輪的呈現契約**不重新定義顏色**，
而是用 `heroVisualFor()` 讀出來 ⇒ 同一隻英雄在模型與特效上永遠同一組色。

### 1.5 由 Audit 推出的三個設計決定

1. **不改引擎。** 要有 Q/W/E/R 就得動 LogicEngine ⇒ 動了就改 RNG ⇒ 改了所有數值。
   本輪只做呈現，映射只有兩條：`basic → basicAttack`、`power → signatureSlot`。
2. **文案一律寫「演出分類」。** 每一筆輸出帶 `basis: "engine:basic|power"` 與
   `isActualSkillCast: false`；HUD 寫「突進演出」不寫「他放了 E」。
3. **八個模板要能被驗證**，但實戰只出得來 basic/power 兩種事件、還要看 RNG
   ⇒ 另開一個**固定 fixture 的演出畫廊**（`?debug=hero-presentation`），
   八個模板同時擺出來，驗收不靠運氣。

---

## 2. 修改與新增的檔案

| 檔案 | 動作 | 內容 |
|---|---|---|
| `src/data/heroCombatPresentation.js` | **新增** | 呈現契約 v1、10 位英雄、fallback、4 支純函式、驗證函式 |
| `src/battle/moba/heroPresentationAdapter.js` | **新增** | 唯一翻譯點（純 JS，Node 可直接測） |
| `src/battle/moba/presentation/HeroSkillEffects.jsx` | **新增** | 八個共用視覺模板（固定 pool） |
| `src/battle/moba/presentation/HeroSkillCallout.jsx` | **新增** | HUD 演出播報（頭像 ＋ 演出分類 ＋ 聲明） |
| `src/debug/HeroPresentation/HeroPresentationGallery.jsx` | **新增** | 固定 fixture 畫廊（lazy debug 路由） |
| `src/battle/moba/map/mobaRuntimeMapAdapter.js` | 修改 | **只新增** `presentation` 欄位（2 行 ＋ 1 個 import） |
| `src/battle/moba/render/MobaRuntimeView3D.jsx` | 修改 | 掛上 `HeroSkillEffects`（2 行 ＋ 1 個 import） |
| `src/battle/ui/BattlePresentationLayer.jsx` | 修改 | 掛上 `HeroSkillCallout`（1 行 ＋ 1 個 import） |
| `src/battle/ui/BattleTimeline.jsx` | 修改 | 主角頭像 ＋ 大場面標記 ＋ 驗收錨點 |
| `src/main.jsx` | 修改 | 多一個 lazy debug 路由（4 行） |
| `tools/check_hero_presentation_l.mjs` | **新增** | 資料層／Adapter 安全網 |
| `tools/shot_hero_presentation_l.mjs` | **新增** | 六尺寸瀏覽器驗收 |

**禁改清單全部未動**：LogicEngine、戰鬥傷害、命中判定、RNG、勝率、擊殺節奏、
Reward、BattleResult Contract、Replay Contract、assignment、laneByHero、
`configureMatch` / `configurePlayers` / `configureHeroes` / `configureSpells`、
Ban/Pick、Hero Matchup Contract、J-close Hotfix 2 捲動結構、其他經營畫面。

---

## 3. 10 位代表英雄

上路 2／打野 2／中路 2／下路 2／輔助 2（用 Hero Database 的 `lane` 實際核對）：

| 路線 | 英雄 | 定位 | 演出風格 | 為什麼選它 |
|---|---|---|---|---|
| 上路 | 鋼鐵衛士 `ironclad` | 坦克 | 近戰貫穿 → 範圍控場 | 技能組全是護盾層疊與範圍嘲諷／擊飛，控場語彙最清楚 |
| 上路 | 炎拳 `cinderfist` | 戰士 | 近戰貫穿 → 蓄力爆發 | 同路但完全不同風格：蓄力、引爆燃燒、護盾自爆 |
| 打野 | 暮刃 `duskblade` | 刺客 | 暗影貫穿 → 分身突進 | 沉默＋分身突入，切入語彙明確 |
| 打野 | 赤炎武神 `chichuan` | 戰士 | 火焰貫穿 → 衝鋒引爆 | 同路對照組：正面衝鋒＋燃燒引爆，和暮刃的偷襲相反 |
| 中路 | 冰霜術士 `bingshuang` | 法師 | 冰霜彈道 → 全域凍結 | 彈道消耗＋護壁＋大範圍控制，冷色系 |
| 中路 | 烈焰先知 `lieyan` | 法師 | 火焰彈道 → 延遲引爆 | 同路對照組：延遲引爆與地牆封路，暖色系 |
| 下路 | 雷霆神射 `leiting` | 射手 | 雷電彈道 → 穿甲直線 | 穿甲彈道＋落雷覆蓋，直線語彙 |
| 下路 | 炎鳳射手 `yanfeng` | 射手 | 火焰彈道 → 火雨壓制 | 同路對照組：飛躍走位＋區域火雨，**唯一有回復被動的一位** |
| 輔助 | 大地守衛 `dadi` | 坦克 | 大地貫穿 → 擊飛開團 | 開團型：衝擊波、群體護甲 |
| 輔助 | 石衛 `stoneguard` | 坦克 | 大地貫穿 → 抓取反制 | 反制型：抓鉤拉回、擋投射物，和大地守衛的主動開團相反 |

**選擇標準與實際依據：**

1. **Hero Database 資料完整** —— 這 10 位的 P/Q/W/E/R 技能描述都具體到可以直接
   對應視覺（「阻擋所有投射物」「向前衝鋒」「擊飛 1.75 秒」）。
2. **每一路兩種不同風格** —— verifier 第 6 條**實際比對**每一路兩位的
   `basicAttack/signature/effect` 三元組不得相同，不是嘴上說不同。
3. **這 10 位已經有 3D 剪影與主色**（`heroArchetypes.HERO_VISUALS`）
   ⇒ 本輪不必新增第二套視覺身分，只是把演出接到同一組色上。
4. **沒有新增英雄、沒有修改任何英雄的名稱或技能文字。**

---

## 4. 資料 Contract v1

```
heroCombatPresentation[heroId] = {
  heroId, source: "authored" | "fallback",
  theme: { primaryColor, secondaryColor, accentColor, symbol, shapeLanguage },
  basicAttack: { archetype, effect },
  signatureSlot: "P"|"Q"|"W"|"E"|"R",
  skills: { P|Q|W|E|R: { archetype, effect, emphasis, label } },
  audioProfile, cameraEmphasis, performanceTier,
}
archetype  ∈ projectile | line | area | dash | shield | heal | control | ultimate
effect     ∈ physical | fire | frost | thunder | earth | shadow | holy | arcane | wind
emphasis   ∈ passive | normal | signature | ultimate
camera     ∈ none | subtle | punch          tier ∈ light | standard | heavy
```

四支純函式：`getHeroCombatPresentation` / `getHeroSkillPresentation` /
`getHeroPresentationTheme` / `getFallbackHeroPresentation`。
原始表**沒有 export**；回傳全部深凍結；找不到／非法輸入（含 `__proto__`、`constructor`、
`null`、數字）一律回穩定 fallback，**不 throw**；同一 heroId **連參考都相同**。

**沒有平衡數值**：verifier 遞迴掃整棵資料，禁止欄位（damage/cd/winrate/hp/ad…）
與**任何裸數字**都會紅燈。顏色是字串色碼，不是數字。

**fallback 規則**：依 Hero Database 的 `arch` 推導（法師走彈道、坦克走近戰貫穿、
刺客走突進…），完全決定性、不用亂數。90 位沒有專屬設定的英雄全部走這條，
畫面不會空白。

---

## 5. Adapter 資料流

```
LogicEngine.snapshot().fx        ← 唯讀，本輪一個位元都沒改
        │
        ├─ adaptEffects(snapshot, t, { roster })      ← 唯一接線點
        │     └─ describeFxPresentation(fx, roster)   ← 新增 presentation 欄位
        │            roster[sourceId].heroId → 英雄
        │            ability "role:basic"  → basicAttack 演出
        │            ability "role:power"  → signatureSlot 演出
        │            tower/neutral/boss/buff → 非英雄演出（heroId = null）
        │
        ├─→ HeroSkillEffects.jsx   （3D，八個模板）
        ├─→ HeroSkillCallout.jsx   （HUD，頭像＋演出分類）
        └─→ BattleTimeline.jsx     （describeTimelinePresentation：主角頭像＋大場面標記）
```

**保證**（verifier §4 逐條驗）：不修改原始 event、不改 timestamp、不改順序、
不決定傷害或命中、不寫回 Replay 原始資料、決定性、批次轉換長度與順序不變。

---

## 6. 八個共用視覺模板

`HeroSkillEffects.jsx` 只認得八個字，**不認得英雄**——加第 101 位英雄不需要動它一行。

| 模板 | primitive | 演出 |
|---|---|---|
| `projectile` | bolt | A→B 依 progress 內插的單顆彈體 |
| `line` | bar | 起點到終點的貫穿柱 |
| `area` | halo | 落點擴散地環 |
| `dash` | bar + bolt | 拖尾 ＋ 前端彈體 |
| `shield` | guard | 圍在施法者身上的立環 |
| `heal` | guard + halo | 上飄護環 ＋ 腳下淡環 |
| `control` | halo + guard | 目標腳下環 ＋ 低位束縛環 |
| `ultimate` | halo×2 + guard + bolt | 雙環 ＋ 立環 ＋ 核心，**半徑硬上限 3.2×S** |

**資源規則**：geometry / material / instanced pool **一次建立**，`useFrame` 內不配置資源；
每幀從 `frame.effects` 重算 count ⇒ 事件過期自然歸零；卸載時 dispose 全部。
一律 `NormalBlending`（additive 疊層正是 D-fix2 把畫面燒成白塊的原因，
而這一層又疊在既有特效之上）。

**池容量依畫質分級**：

| | halo | bar | bolt | guard |
|---|---|---|---|---|
| low（手機） | 10 | 10 | 14 | 8 |
| medium | 18 | 18 | 24 | 14 |
| high（桌機） | 28 | 28 | 40 | 22 |

---

## 7. HUD / Timeline / Replay

- **HUD callout**：頭像 ＋ 英雄中文名 ＋ **演出分類**（不是技能名）＋ 來源標記。
  同時顯示上限：桌機 3、手機 2。區塊底部固定帶一行誠實聲明。
- **Timeline**：擊殺／首殺／連殺／召喚師技能掛**主角英雄頭像**；
  團隊級事件（拆塔／目標刷新）**刻意不掛**——那沒有單一主角，掛了就是編造。
  大場面（連殺／ACE／大小龍／勝利）左緣加粗 ＋ 琥珀底色。
- **Replay**：沒有第二條流程。Replay 與現場都吃 `snapshot.fx` → 同一支 Adapter；
  `HeroSkillCallout` 的 `source` prop 沿用 `MobaView3D` 既有的唯讀 adapter 慣例。
- **fallback**：找不到專屬設定的英雄照樣有演出與頭像，callout 標「・通用」，
  **不留空白**。
- **BattleResult / Replay Contract 未改**（verifier 第 57 條檢查呈現層沒有滲進契約檔）。

---

## 8. 誠實邊界（本輪最容易出錯的地方）

| 事實 | 呈現層怎麼處理 |
|---|---|
| 引擎不模擬 Q/W/E/R | 每筆輸出帶 `isActualSkillCast: false` ＋ `basis: engine:*`；UI 寫「演出分類」 |
| 資料裡的 P/Q/W/E/R 表 | 標示為「技能演出對照」，畫廊上方明寫「不代表實際施放」 |
| 沒有音效檔 | `audioProfile` 只先定義分類，本輪不播任何音效 |
| 90 位英雄沒有專屬設定 | 走 fallback 並在 callout 標「・通用」，不假裝有專屬演出 |

畫廊與 HUD 共用同一句聲明（資料層常數，UI 不另寫一份）：
**「以下為技能演出分類，依英雄風格對應共用模板，不代表引擎實際施放了該技能。」**

---

## 9. 測試結果

| 腳本 | 結果 |
|---|---|
| `check_hero_presentation_l` | ✅ **59/59** |
| `shot_hero_presentation_l --stage=gallery` | ✅ **116/116**（六尺寸） |
| `shot_hero_presentation_l --stage=battle` | ✅ **18/18**（三尺寸接線煙霧測試） |
| `shot_hero_presentation_l --stage=replay` | ✅ **16/16**（1920 / 390 完整流程到 Replay） |

回歸（全綠）：

| 腳本 | 結果 |
|---|---|
| `check_hero_matchups_k` | ✅ **47/47** |
| `shot_hero_matchups_k` | ✅ **348/348** |
| `check_moba_milestone_j_close` | ✅ **35/35** |
| `shot_banpick_hotfix2` | ✅ **251/251** |
| `regress` | ✅ **15/15**，平均 **23.5 分** ／ **29.8 擊殺** —— **與 J-close／Milestone K 逐值相同** |
| `regress2` | ✅ **20/20**，節奏門檻 **8/8** |
| `npm run build` | ✅ exit 0 |

### 六尺寸驗收（畫廊段，決定性 fixture 走 production 程式碼路徑）

| 尺寸 | callout 顯示／上限 | 池容量（halo/bar/bolt/guard） | fixture live | 橫向溢出 |
|---|---|---|---|---|
| 1920×1080 | 3／3 | 28/28/40/22 | 9 | 0px |
| 1366×768 | 3／3 | 28/28/40/22 | 9 | 0px |
| 430×932 | 2／2 | 10/10/14/8 | 9 | 0px |
| 412×915 | 2／2 | 10/10/14/8 | 9 | 0px |
| 390×844 | 2／2 | 10/10/14/8 | 9 | 0px |
| 360×800 | 2／2 | 10/10/14/8 | 9 | 0px |

八個模板每一個都由指名的示範英雄畫出 instance（halo 5 / bar 3 / bolt 3 / guard 4，
`live=9` ＝ 八個模板 ＋ 一個 fallback 英雄全部被 renderer 認得）。
10 位代表英雄的主題色**互不相同**（實測 10 個相異色碼）。

### 效能與資源

| 項目 | 實測 |
|---|---|
| mobile preset（low） | halo 10 / bar 10 / bolt 14 / guard 8 |
| desktop preset（high） | halo 28 / bar 28 / bolt 40 / guard 22 |
| 兩者差異 | 每一個池 low 都**嚴格小於** high，且 low 仍畫得出東西（不是把手機特效關掉） |
| 池容量突破 | **0 次**（每次取樣都在上限內） |
| geometry / material | 一次建立、卸載時 dispose；`useFrame` 內零配置（原始碼與行為雙重驗證） |
| live 對戰套用的 preset | 三個尺寸實測都是 low 的 10/10/14/8 |

⚠ **FPS 沒有列成通過門檻。** headless Chrome 走 SwiftShader **軟體渲染**，
整個 3D 場景本來就只有個位數 fps，和本輪加不加演出層無關。
寫一個絕對門檻只會逼自己去調一個假數字。真正的效能保證是「池容量沒被突破 ＋
資源一次建立 ＋ 卸載 dispose」，真機 FPS 列為未驗項目。

---

## 10. 未驗項目

1. **live 對戰的英雄特效與 HUD callout「肉眼觀察」未驗。** 這是本輪最重要的一條，
   要講清楚：
   - 引擎的 `power` 事件是 `rng() < 0.2` 且**只在英雄互毆時**才出現，
     而英雄互毆要到 ts≈60+ 才穩定發生。
   - headless SwiftShader 軟體渲染下模擬推進只有 **0.14 模擬秒／真實秒**
     （1366×768 + low preset + 4× 加速，240 秒只到 ts≈32）⇒
     **在這個環境裡不可能靠 live 對戰驗到它們**，硬等就是靠運氣。
   - 所以 callout 與八個模板改用**決定性 fixture 走 production 程式碼路徑**
     驗證（正式的 `useGameStore` → 正式的 `HeroSkillCallout` → 正式的
     `HeroSkillEffects`），live 對戰段只驗「這條路接得通、版面沒壞、資源沒失控」。
   - **請 Ray 在真實瀏覽器打一場，確認打起來真的看得出英雄差異。**
     這是本輪唯一需要人眼確認的東西。
2. **真機未測**（Android / iOS）。六尺寸都是桌面 Chrome 的 device metrics 模擬，
   且 headless 走軟體渲染 ⇒ **量到的 FPS 不代表真機 GPU 表現**。
2. **沒有音效**。`audioProfile` 只是分類欄位，本輪沒有接任何音檔。
3. **`cameraEmphasis` 尚未接相機**。欄位已定義（none/subtle/punch），
   但本輪沒有讓大招真的推鏡——相機是 S29B6 的單一控制來源，
   要動得另開一輪並重驗 flicker。
4. **只有 10/100 位英雄有專屬演出**，其餘走 fallback（刻意）。
5. **`check_moba_runtime29` 全套未跑**（10–15 分鐘、巢狀深）。
   既有紅燈 TD-21 / TD-19 未受本輪影響。

---

## 11. 下一輪如何擴充

1. **加英雄**：只需要在 `heroCombatPresentation.js` 加一筆
   （theme 會自動讀 heroArchetypes 的既有色）。**不必動 renderer、不必動 Adapter。**
   若該英雄在 `heroArchetypes.HERO_VISUALS` 沒有專屬視覺，會自動走程序化配色，
   仍然是決定性的。
2. **加模板**：`PRESENTATION_ARCHETYPES` 加一個字 ＋ `HeroSkillEffects` 的
   `switch` 加一個 case ＋ 畫廊自動多一張卡。verifier 第 9 條會強制
   「每個模板至少被一位英雄使用」，避免加了沒人用的模板。
3. **要真的區分 Q/W/E/R**：那是**引擎工作**，不是呈現層。
   必須讓 LogicEngine 發出帶 slot 的事件；那會改 RNG 流 ⇒ 所有數值重新校準
   ⇒ 必須獨立一輪做，且與本輪的呈現層改動分開，才分得清是誰造成的。
4. **接音效**：`audioProfile` 已就位，接的時候一樣走 Adapter，不要讓元件各自查表。
