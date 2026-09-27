# MOBA 技能圖示與英雄戰鬥天賦 v1（Owner Review 候選）

此文件描述候選版，不代表 production 已發布。正式基線為 `5c9b414`／`moba-sim.v13`；候選因 10 位英雄的技能演算會變，宣告 `moba-sim.v14`。不修改選手成長天賦、Tower、Smite、Competitive、Online Backend 或 legacy battle。

## 技能圖示與詳情

- `src/data/heroDatabase.js` 仍是 100 位英雄 P/Q/W/E/R 的唯一資料權威；每招只增加 `iconKey`。`heroSkillIconUrl()` 使用 Vite `BASE_URL` 指向 `public/assets/skill-icons/v1/<hero>/<slot>.svg`，支援 Pages 子路徑。
- `tools/generate_hero_skill_icons.mjs` 從英雄名稱、元素、正式技能 mechanic／slot，以固定種子生成 500 個可重現的 SVG。共用元素材質語彙，但各招結合不同語意圖形、構圖、刻痕及外圈；不是第二套技能資料庫。`--check` 驗證檔案與產生器一致。
- Battle HUD 與英雄面板顯示五格圖示、即時 ready／cooldown／unavailable、技能等級狀態。桌面 hover／click，手機 tap 開第二層詳情；不把完整數值塞進主 HUD。
- 詳情的當前正式數值由 `snapshot.players[].heroSkills[slot].rule` 讀取；Replay 舊資料缺此欄位時，依 `heroDatabase` 的正式技能規則及已記錄的本場天賦 ID 重建唯讀說明。適用目標能力與引擎共用 `heroSkillTargetCapabilities.js` 的 eligibility 集合；它表示可能命中，並非保證命中。Boss 仍有正式 hard CC／slow 免疫。
- 既有 `heroDatabase.skills[].desc` 是英雄設定文案，有少數條件（例如擊殺後減少冷卻）不在目前正式 QWER 規則內。詳情面板將它明確標為「英雄設定描述」，並註明實戰以正式規則／快照數值為準；後續應逐招校正文案，不能把未實作效果當成正式 gameplay。
- `P` 是 100/100 資料／描述與圖示、0/100 正式 gameplay。Q/W/E/R 為 400/400 正式 gameplay。現行 Q/W/E/R 沒有完整技能升級演算；詳情誠實顯示「未分級／尚無下一級數值」，不從 legacy `skillData` 編造升級收益。

## Hero Battle Talent v1 契約

`src/battle/moba/talents/heroBattleTalents.js` 定義 `HeroBattleTalent.v1`。全部 100 位英雄按既有職能及 QWER mechanic 分類，只有 10 位 pilot 各有兩個可選天賦。天賦是本場英雄能力選擇；與 `src/platform/talents/` 的選手成長天賦、Training／player development 資料及點數完全分開。

正式接線：戰術頁選擇（可留給 AI）→ `selectBattleTalents()` 依雙方名單確定性選擇並驗證席位／英雄 ID → `toEngineHeroSkills()` 以受限 primitive 編譯到同一份正式 QWER rule → `LogicEngine.configureHeroSkills()` → snapshot／HUD → Replay 保存天賦 ID、英雄名單及正式幀。沒有由 presentation 計算 gameplay，也沒有第二套 simulation。`heroBattleTalentsV1` 只在 Hero Skills 啟用時生效；非 pilot 英雄不新增天賦效果。

v1 的實作範圍是賽前技能規則乘數，欄位白名單分為 damage、cooldown、range、duration、area、shield、heal、timing、ultimate，倍率限制 0.9–1.1。`trigger`／`condition` 已是資料契約欄位，但 on-hit、on-cast、stat、stack、threshold、reset、動態 ultimate modifier 尚未接事件鉤子；不得宣稱已實作。後續須沿 `LogicEngine` 正式事件、狀態序列化與 Replay 契約擴充，不能只做 UI。

| 英雄 | 定位 | 天賦 A | 天賦 B |
| --- | --- | --- | --- |
| 鋼鐵衛士 `ironclad` | 坦克／護衛 | 鋼誓守陣（W 護衛時間） | 破陣撞角（Q 射程） |
| 炎拳 `cinderfist` | 戰士／盾 | 熔心護體（W 盾量） | 灼痕（E 持續） |
| 冰霜術士 `bingshuang` | 法師／範圍 | 凝霜銳晶（Q 傷害） | 寒域擴張（E 半徑） |
| 雷霆神射 `leiting` | 射手／爆發 | 疾弧（Q 飛行時間） | 雷冠（R 傷害） |
| 毒刺 `sting` | 刺客／位移 | 毒鋒（Q 傷害） | 影步（E 冷卻） |
| 生命守護 `shengming` | 輔助／治療 | 生命繫線（W 盾量） | 群生回響（R 治療） |
| 大地守衛 `dadi` | 坦克／控制 | 裂地脈（Q 寬度） | 磐石守護（W 護甲） |
| 賭徒 `gambler` | 法師／位移 | 滿手好牌（Q 傷害） | 命運閃步（W 冷卻） |
| 寒冰弓神 `hanbing` | 射手／範圍大招 | 霜矢貫穿（Q 傷害） | 凜冬展翼（R 角度） |
| 赤炎武神 `chichuan` | 戰士／範圍大招 | 焚天弧（Q 角度） | 赤炎戰旗（R 持續） |

## 擴到 100 位英雄

先審 90 位英雄的現有 mechanic／能力分類，逐批各定義兩個有主題性的天賦（約 180 個資料定義），每批跑欄位存在性、同種子、Replay、Items ON、side／mirror、pacing 與 balance A/B；不要一次開啟全部。需要 on-hit、on-cast、stack 等動態效果的英雄另作事件 primitive 與序列化設計，先以少量 pilot 驗證再擴大。任何新效果都須由正式引擎事件驅動，且更新 `moba-sim` 語意版本與 release 閘門。

## 候選驗證與既有紅燈

- 同 runner、1–1000 seeds、roster、Hero Skills ON、Items ON：乾淨 `5c9b414` 與候選 Blue 勝率 54.3%／54.2%，均 1000/1000 finished、pathological 0；175 場 winner 變更（88 Blue→Red、87 Red→Blue）。median 21.06／20.85 分，P90 均 25.29 分，max 41.81／46.83 分；最長候選場正常結束且有持續交戰／推進，不是 deadlock。沒有以此修改既有 Blue bias baseline。
- pacing 在乾淨 baseline 與候選均 23/25、完全相同兩條 `BASELINE_KNOWN_FAILURE`，首殺 p50 都是 589 秒。runtime29 使用正式 flat 委派方式：核心 35/35，巢狀子驗證另逐支執行；不能把 SKIP 當 PASS。Hero Skills、Items ON、Replay、regress／regress2、side／mirror、build、desktop／mobile browser 已通過；手機真機觸控與 FPS 未測。
