# MOBA Gameplay／Presentation／UI Audit（2026-09-29）

分支 `feature/moba-gameplay-presentation-audit`（基於 `f285f5f` = main `d9d9d88` ＋ Mobile UI P1 checkpoint）。
A/B 工具：`tools/balance/moba_objective_ab.mjs`（正式設定：hero skills＋定位＋原型＋召喚師技能＋標準戰術＋裝備，v3 規則）。

## 1. 技能 Gameplay ↔ VFX 對齊

**現況**：400 條技能規則中 298 條帶持續時間。74 條技能的持續時間 > 4.2 秒，另約 72 條（定身／控制／護盾爆發／投射物減速）施放特效不讀規則時長（固定 1.6 秒）。

**Root cause**：引擎 `pushFx` 對技能特效的 snapshot 保留窗固定 4.2 秒（且上限 60 筆時直接丟最舊）；引擎其實已經把 `life = 規則持續時間 + 0.25` 算好，但事件在 4.2 秒就從 snapshot 消失 ⇒ 4–10 秒的護盾／領域／DoT／增益演出一瞬間收掉。

**本輪修正**（同一正式事件，不做假效果）：
- `pushFx`：具名技能的保留窗 = max(原值, life + 0.3)；超過 60 筆先丟短命特效，長效技能最後才丟。`fx` 從不被模擬讀取 ⇒ 結果不變（40 場逐場相同）。
- 被控制方（定身、暈眩、減速、標記…）本來就由 `statusEffects.remaining` 驅動 `HeroStatusFx`，持續到 gameplay 結束；施放特效不需要跟著拉長。
- **隱身**（6 條技能：yeiren W、wuxing W/R、youming W/E、guihuo W）：以前只有頭頂小圖示。現在角色本體換成隊色半透明＋閃動材質，HUD 狀態列有「◌ 隱身 Ns」且會脈動。
- 引擎沒有 untargetable／conceal 類 mechanic（全庫 grep 無）。

**未做**：DoT／領域在 snapshot 沒有獨立條目（只存在 `heroSkillPending`），受害者身上沒有「持續燃燒」狀態；Replay frame 不存 shield／guard／stealth。見 §8 P1。

## 2. 血條與升級成長

**現況（有真的變強）**：本場等級 1→18，`maxHp × (1 + 0.06×(L−1))`（Lv18 ×2.02）、`power × (1 + 0.11×(L−1))`（Lv18 ×2.87），升級只補「新增的那段血」。防禦沒有等級成長（護甲／魔抗只來自裝備）。坦克：射手最大血量固定 2:1（960 vs 480 → 1939 vs 970）。

**Root cause（視覺無差異）**：snapshot 只有 0–1 比例 `hp`，沒有絕對最大血量；3D 與 HUD 血條同寬、無刻度；沒有任何升級特效（名牌預設關閉，連 Lv 字樣都看不到）。

**本輪修正**：
- snapshot 加 `mhp`（只在 hero skills 開啟時輸出，skill-off 串流逐位元不變）。
- 3D 血條與底欄血條：**細刻度每 250 HP、粗刻度每 1000 HP**（坦克 7 細 1 粗，射手 3 細），護盾以白色段接在血量後面。
- 升級：腳下金環外擴＋短光柱（1.15 秒）；底欄頭像等級閃金光＋「升級」角標（2.5 遊戲秒）。reduced-motion 時關掉動畫。
- Replay 精簡 frame 沒有 `mhp` ⇒ 重播不畫刻度（不猜）；升級特效在重播照常（`lv` 有存）。

## 3. Mobile Hero Info 技能 icon

**Root cause**：不是 tunnel、不是 asset path（500 張 svg 都在、`BASE_URL` 正確、戰鬥底欄與「英雄資訊」本來就有圖）。缺圖的是兩個**從來沒接圖示**的面板：
- 戰鬥中「英雄生涯・熟練與完整能力」（`HeroDetailPanel.jsx`，手機是全螢幕）— 只有字母方塊。
- 英雄圖鑑技能分頁（`HeroCodexDetail.jsx`）— 只有字母／「被動」字樣。

**本輪修正**：新增 `HeroSkillIcon`（同一個 `heroSkillIconUrl()`，與 Battle HUD 同源；圖片載入失敗時退回字母方塊），兩個面板都換上。瀏覽器 gate 驗 5/5 圖真的載入。

## 4. 大型物件與後期決策

**現況**：只有巨龍（1400 HP，240s 出、150s 重生）與巴龍（3000 HP，480s／210s）。獎勵：團隊金 200／400、XP、龍層（每層 +1.2% 戰力，最多 4）、巴龍 70 秒小兵攻城 ×2.2／英雄攻城 ×1.22。沒有龍魂、遠古龍、目標賞金、逆轉機制。

**基準數據（80 場）**：拿第一條巴龍的隊伍勝率 53.7%、14 分鐘後大型目標 → 勝利轉換 54.1% ⇒ 搶目標幾乎不改變勝負。

**v1 候選（`objectiveStakesV1`，預設關閉，只走既有修正路徑）**：
| 項目 | 內容 |
|---|---|
| 龍層 | 每層 +2.5% 戰力（原 1.2%） |
| 龍魂 | 滿 4 層：戰力再 ×1.05，且該隊兵線永久 fightK ×1.2（兵線壓力） |
| 巴龍 | buff 期間英雄戰力 ×1.08（原本只強化小兵／攻城） |
| 逆轉賞金 | 擊殺方團隊金錢落後 ≥ 1500 ⇒ 追加落後額 20%（上限 500） |
| 後期決策 | 14 分鐘後目標窗出擊機率 +0.2（同一次擲骰，rng 次數不變） |

**A/B（80 場）**：後期目標轉換 **54.1% → 67.0%**、第一巴龍方勝率 53.7% → 57.5%；平均時長 18.58 → 18.24 分、中位 17.05 → 16.60；擊殺 21.5 → 21.5；逆轉局 16 → 14。

## 5. Passive P

**真正原因**：P 從來沒有機器契約（只有截斷散文）、編譯器只收 QWER、引擎沒有觸發點、snapshot/Replay 都是 QWER 形狀、而 heroDatabase 不在語意指紋內。細節與擴充計畫：`docs/design/Passive_P_Framework_v1.md`。

**本輪**：framework ＋ 4 名 pilot（tiemu／tixue／luminary／sting），`heroPassivesV1` 預設關閉。pilot 名單 60 場 A/B：時長 18.75 → 18.52 分、擊殺 21.4 → 19.9（護盾讓擊殺略降）；每場觸發 tiemu 15、sting 44、luminary 135、tixue 21。沒有 pilot 英雄的 P 仍顯示「未實裝」。擴到 100/100：v1 語彙可再覆蓋 ~19 名，其餘需要 onSkillHit 事件、攻擊節拍、永久疊層、視野系統（分批，見設計文件）。

## 6. 英雄定位 × 戰術系統

| 輸入 | 進模擬？ | 說明 |
|---|---|---|
| 前／中／後期曲線 | **否** | 資料庫沒有曲線欄位；所有英雄吃同一條等級成長 |
| QWER／技能等級／天賦 | 是 | 天賦只在賽前改一個規則欄位 ×0.9–1.1 |
| 定位（arch）／原型 | 是（只影響行為） | 站位、參團、撤退、集火；不乘傷害 |
| 英雄 stats（hp/ad/armor） | 幾乎否 | 只有 ally-shield 讀 armor；戰力由席位 ＋ 熟練決定 |
| 被動 P | 否（本輪 pilot 除外） | |
| 賽前戰術 | 部分 | 12 個 knob 進引擎；`earlyGame/midGame/lateGame`、`carryPriority`、`jungleResourceShare`、`vision`、`heraldPriority` 只驗證不使用；紅方永遠是標準戰術；Challenge runner 沒有 QWER 與裝備 |

**下一階段架構（不建第二套戰鬥邏輯）**：在既有 `MobaTacticConfig → toEngineTactic → this.tk[side]` 管線上擴充一個 **TeamTacticProfile**，只餵既有決策點：
- `phasePlan{early,mid,late}` → `_joinChance`、撤退門檻、`laneOffset`（取代寫死的 `decisionEarlyT`）
- `objectiveOrder`／物件優先 → 目標窗機率（本輪 §4 的後期加成就是它的第一個消費點）
- `safeFarm` → 對線深度／打野 farm 分支；`gankSides`（已有 `gankWeights`）；`splitPlan`（4-1）→ `splitLane/splitPush` ＋ 指定分推者
- `protectCarry` → `protectAdj` 與輔助遊走目標；`jungleRoute` → 營地選擇與入侵點
- 規則：knob 只改門檻／機率、不改傷害、rng 次數不變；Live 與 Challenge 用同一個 builder；先給紅方 AI 戰術來源再評平衡。
- 英雄曲線：在受指紋保護的檔案加 `powerCurve{early,mid,late}` → 乘在 `_applyMatchLevel` 的等級倍率上（需平衡，v16 之後）。

## 7. Nexus／主堡

**現況**：7200 HP、無護甲；與所有塔同一射擊迴圈（每 0.5 秒、`25 × 時間係數(≤2.6) × 連續鎖定(≤1.5)`，只打英雄，對攻擊隊友的英雄有 3 秒仇恨優先）；硬性兵線閘門（沒有己方兵線在基地 ⇒ 英雄打不動）。

**問題**：英雄攻城傷害 × `lateFactor × structureFactor` 在 20 分鐘可達 ×40 以上 ⇒ **主堡第一次掉血到爆掉中位數 7 秒**，主堡反擊根本來不及。真正保護主堡的是兵線閘門，不是血量。

**最小候選（`nexusSiegeCapV1`，預設關閉）**：只對主堡本身把兩個加速係數的乘積封頂（英雄與小兵同一上限），外塔／門牙塔、主堡射擊不動。
| 上限 K | 主堡被拆秒數（中位） | 平均／中位時長 | 擊殺 |
|---|---|---|---|
| 基準 | 7 | 18.58 / 17.05 | 21.5 |
| 10 | 18 | 18.72 / 17.15 | 21.9 |
| **6（建議）** | 30 | 18.88 / 17.28 | 22.4 |
| 6 ＋ Objective v1 | 27 | 18.54 / 16.82 | 22.6 |

## 8. UI/UX 缺口

見本輪回報的 P0／P1／P2 表（同步於 `docs/handoff/05_Sprint紀錄.md`）。

## 開啟候選的前提（Owner 決定）

三個候選旗標都在 v3 規則集、預設 `false`。開任何一個 = 模擬語意變更 ⇒ `moba-sim.v16`、新指紋、歷史挑戰不可重播（`canReplay` 拒絕），並重跑 regress2／verify 全套。
