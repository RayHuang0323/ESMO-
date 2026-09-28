# MOBA 技能圖示與英雄戰鬥天賦 v1（Owner Review 候選）

此文件描述候選版，不代表 production 已發布。正式基線為 `5c9b414`／`moba-sim.v13`；100 英雄戰鬥天賦與技能等級改變模擬語意，候選宣告 `moba-sim.v14`。不修改選手成長天賦、Tower、Smite、Competitive、Online Backend 或 legacy battle。`b8cfad7` 是 10 英雄 pilot 的安全 checkpoint；其後擴充尚待 Owner Review，未推送或部署。

## 技能圖示與詳情

- `src/data/heroDatabase.js` 仍是 100 位英雄 P/Q/W/E/R 的唯一資料權威；每招只增加 `iconKey`。`heroSkillIconUrl()` 使用 Vite `BASE_URL` 指向 `public/assets/skill-icons/v1/<hero>/<slot>.svg`，支援 Pages 子路徑。
- `tools/generate_hero_skill_icons.mjs` 由正式 mechanic、VFX motif、元素材質及技能名稱驅動 `skillIconArtwork.mjs`，輸出 500 個可重現 SVG。投射物、突進、護衛、束縛、治療、領域與大招使用不同主體與構圖；冰晶碎片、火舌、分叉雷、岩柱、鋼板、藤蔓等是不同輪廓，不是同一 glyph 換色。代表性的 R 另有技能主題構圖。這仍是共用畫風與有限 archetype，並非 500 張人工逐筆繪製。
- 原 checkpoint 的 500 張只有 21 種中央 silhouette，全部落入重複群、同英雄完全重複 67 對。新圖示經 `audit_hero_skill_icon_similarity.mjs --gate`：500/500 不同中央 SVG 輪廓、完全重複群 0、同英雄重複 0；瀏覽器以去色中央邊緣比對，同英雄近似配對 0。跨英雄仍有合理 archetype 相似，Owner Review 須檢查四張全量 atlas 與高相似配對，不能把 hash 不同當作視覺完成。
- Battle HUD 與英雄面板顯示五格圖示、即時 ready／cooldown／unavailable、技能等級狀態。桌面 hover／click，手機 tap 開第二層詳情；不把完整數值塞進主 HUD。
- 詳情的當前正式數值由 `snapshot.players[].heroSkills[slot].rule` 讀取；下一級由引擎 snapshot 的 `nextRule`，不由 UI 虛構。新 Replay 保存本場天賦後的 Lv1 規則及逐幀等級，唯讀重建技能詳情，不重跑模擬；舊 Replay 缺等級欄位時不猜測。適用目標能力與引擎共用 `heroSkillTargetCapabilities.js` 的 eligibility 集合；它表示可能命中，並非保證命中。Boss 仍有正式 hard CC／slow 免疫。
- 既有 `heroDatabase.skills[].desc` 是英雄設定文案，有少數條件（例如擊殺後減少冷卻）不在目前正式 QWER 規則內。詳情面板將它明確標為「英雄設定描述」，並註明實戰以正式規則／快照數值為準；後續應逐招校正文案，不能把未實作效果當成正式 gameplay。
- `P` 是 100/100 資料／描述與圖示、0/100 正式 gameplay。Q/W/E/R 為 400/400 正式 gameplay，並各有正式等級規則；沒有把 P 偽裝成被動效果，也不從 legacy `skillData` 編造數值。

## Hero Battle Talent v1 契約

`src/battle/moba/talents/heroBattleTalents.js` 定義 `HeroBattleTalent.v1`。100 位英雄各有兩個互斥選項，共 200 個；原 10 位 pilot 保留手工指定，另 90 位從唯一權威 `heroDatabase` 的 QWER mechanic 與正式可用欄位產生攻勢／應變選項。兩個選項分屬不同技能、不同效果軸，不是同招同欄位的 5%／10% 二選一。天賦是本場英雄能力選擇；與 `src/platform/talents/` 的選手成長天賦、Training／player development 資料及點數完全分開。

正式接線：戰術頁選擇（可留給 AI）→ `selectBattleTalents()` 依雙方名單確定性選擇並驗證席位／英雄 ID → `toEngineHeroSkills()` 以受限 primitive 編譯到同一份正式 QWER Lv1 rule → `LogicEngine.configureHeroSkills()` → snapshot／HUD → Replay 保存天賦 ID、英雄名單及正式幀。沒有由 presentation 計算 gameplay，也沒有第二套 simulation。`heroBattleTalentsV1` 只在 Hero Skills 啟用時生效。

v1 的實作範圍是賽前技能規則乘數，白名單 primitive 包含 damage、cooldown、range、duration、area、shield、heal、control、mark、mitigation、haste、timing、ultimate，倍率限制 0.9–1.1。`trigger`／`condition` 已是資料契約欄位，但 on-hit、on-cast、stat、stack、threshold、reset、動態 ultimate modifier 尚未接事件鉤子；不得宣稱已實作。後續須沿 `LogicEngine` 正式事件、狀態序列化與 Replay 契約擴充，不能只做 UI。

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

## HeroSkillLevel.v1

- 既有本場英雄等級 `mlv` 是唯一解鎖來源，不增第二套 XP。開場 Q/W/E/R 均 Lv1，保留 v13 的首波施法能力；Q/W/E 上限 Lv3，R 上限 Lv2。`mlv` 3／5／7 依固定 AI 優先序各升一招 Q/W/E；9 升 R；11／13／15 各升一招 Q/W/E 至 Lv3。已選天賦所屬技能優先，其餘依正式 mechanic 的控制、範圍、傷害與固定 tie-break 排序，不用隨機數。
- 每級在已編譯的天賦後 Lv1 規則上套一個 mechanic 相稱的主效果軸（盾、治療、減傷、印記、位移、範圍、控制、增益或傷害）與小幅冷卻改善；沒有該欄位就只改善冷卻。欄位有明確上限，不累積倍率漂移。400/400 QWER 有正式 Lv1→上限規則，未受影響欄位不顯示虛構升級。
- `LogicEngine` 只在 Hero Skills ON 時保存底規則、rank、升級歷程與下一級規則；Battle Skill Detail、Result、事件及 Replay 讀相同來源。skill-off 不增改原本演算路徑。Replay 儲存等級及 Lv1 規則後唯讀還原，不藉回放重跑戰鬥。

## 候選驗證與既有紅燈

- checkpoint pilot 的舊量測（54.3%／54.2%、175 場 winner 變更）只代表 10 英雄天賦、**不代表**本次 100 英雄／技能等級最終結果；最終同 runner、同 seed／roster、Hero Skills ON、Items ON 的 v13 vs v14 n=1000 A/B 另行量測。
- pacing 在原 checkpoint 時乾淨 baseline 與 pilot 候選均 23/25、同兩條 `BASELINE_KNOWN_FAILURE`；本次 gameplay 擴充需重跑才能判斷是否新增 regression。手機真機觸控與 FPS 仍待 Owner Review。

## Owner approved release boundary（2026-09-28）

- Owner 已接受目前 500 icon 視覺與 23 組 A 類 refinement，批准 v14 正式 Release；共享 shield、dash、projectile、heal、stun、AoE／ultimate 語彙保留。
- 本版本 candidate simulation 為 `moba-sim.v14`，baseline 為 `5c9b414`，checkpoint 為 `b8cfad7`。n=1000 沿用已完成的 v13 `54.3/45.7` → v14 `53.2/46.8`、0 failures。
- Android 真機 FPS／touch／thermal 明確標記 `DEFERRED_BY_OWNER`，不是 PASS，也不阻擋 Release。
