# MOBA 裝備矩陣 v1（草稿）

> 狀態：**M0 草稿**。名稱為 ESMO 原創草案（需文案／美術定稿）；價格與屬性為**預算草案**，M3 校準前不得視為定案。
> 單位定義見 `docs/architecture/MOBA_戰鬥屬性契約_v1.md` §2。
> 批次：**1.0** = v1.0 上線（68 件）；**1.1** = v1.1 補齊（20 件完成裝）。

## 0. 屬性縮寫

| 縮寫 | 屬性 | 單位 |
|---|---|---|
| HP | 最大生命 | 引擎生命值（英雄 Lv1 約 480–960） |
| AD | 攻擊力 | 點（每 100 點 ≈ 攻擊通道 +100%） |
| AP | 法術強度 | 點（每 150 點 ≈ 技能通道 +100%） |
| AR／MR | 護甲／魔抗 | 點（減傷 = 100 ÷ (100 + 有效抗性)） |
| AS | 攻速 | ％（攻擊通道期望輸出） |
| CR | 暴擊率 | ％（期望值，不擲骰） |
| AH | 技能加速 | 點（技能通道 × (1 + AH／100)，上限 60） |
| MS | 移速 | ％ |
| APen／MPen | 平面穿透 | 點 |
| %APen／%MPen | 百分比穿透 | ％ |
| LS／OV | 吸血／全能吸血 | ％ |
| HSP | 治療與護盾強度 | ％ |
| RG | 脫戰回復 | 每秒最大生命％（加在 `R.regen.outOfCombatPctPerSec` 上） |

---

## 1. T1 基礎組件（18）

| # | id | 名稱 | 價格 | 屬性 | 批次 |
|---:|---|---|---:|---|---|
| 1 | `t1_ad_s` | 鍛鐵刃片 | 300 | AD 8 | 1.0 |
| 2 | `t1_ad_l` | 重鍛刀胚 | 480 | AD 14 | 1.0 |
| 3 | `t1_ap_s` | 微光晶屑 | 300 | AP 15 | 1.0 |
| 4 | `t1_ap_l` | 奧光晶塊 | 480 | AP 25 | 1.0 |
| 5 | `t1_hp_s` | 活力石 | 300 | HP 120 | 1.0 |
| 6 | `t1_hp_l` | 厚實心石 | 480 | HP 190 | 1.0 |
| 7 | `t1_ar_s` | 鱗甲片 | 300 | AR 15 | 1.0 |
| 8 | `t1_ar_l` | 重鱗甲片 | 480 | AR 25 | 1.0 |
| 9 | `t1_mr_s` | 靜紋布 | 280 | MR 15 | 1.0 |
| 10 | `t1_mr_l` | 厚靜紋布 | 460 | MR 25 | 1.0 |
| 11 | `t1_as` | 輕羽匕首 | 300 | AS 12% | 1.0 |
| 12 | `t1_crit` | 準星石 | 320 | CR 8% | 1.0 |
| 13 | `t1_ah` | 沉思符文 | 300 | AH 6 | 1.0 |
| 14 | `t1_ls` | 吸血獠牙 | 300 | LS 6% | 1.0 |
| 15 | `t1_apen` | 穿甲釘 | 300 | AD 4、APen 3 | 1.0 |
| 16 | `t1_mpen` | 虛紋針 | 300 | AP 8、MPen 4 | 1.0 |
| 17 | `t1_hsp` | 祈光花瓣 | 300 | HSP 5% | 1.0 |
| 18 | `t1_regen` | 回春藤 | 250 | RG 0.15% | 1.0 |

## 2. T2 中階組件（16）

| # | id | 名稱 | 價格 | 合成（組件 ＋ 合成費） | 屬性 | 效果 | 批次 |
|---:|---|---|---:|---|---|---|---|
| 1 | `t2_rend` | 裂鋒刃 | 950 | 鍛鐵刃片 ＋ 穿甲釘 ＋ 350 | AD 18、APen 8 | — | 1.0 |
| 2 | `t2_gale` | 疾風弩機 | 900 | 輕羽匕首 ＋ 鍛鐵刃片 ＋ 300 | AS 22%、AD 8 | — | 1.0 |
| 3 | `t2_scope` | 精準瞄鏡 | 950 | 準星石 ＋ 輕羽匕首 ＋ 330 | CR 15%、AS 10% | — | 1.0 |
| 4 | `t2_fang` | 嗜紅牙 | 900 | 鍛鐵刃片 ＋ 吸血獠牙 ＋ 300 | AD 12、LS 8% | LIFESTEAL | 1.0 |
| 5 | `t2_core` | 奧術晶核 | 1050 | 奧光晶塊 ＋ 微光晶屑 ＋ 270 | AP 50 | — | 1.0 |
| 6 | `t2_echo` | 迴響法典 | 950 | 微光晶屑 ＋ 沉思符文 ＋ 350 | AP 25、AH 10 | — | 1.0 |
| 7 | `t2_rift` | 虛紋尖晶 | 900 | 微光晶屑 ＋ 虛紋針 ＋ 300 | AP 22、MPen 10 | — | 1.0 |
| 8 | `t2_heart` | 生命護符 | 900 | 厚實心石 ＋ 活力石 ＋ 120 | HP 320 | — | 1.0 |
| 9 | `t2_mail` | 鎖環胸甲 | 900 | 鱗甲片 ＋ 活力石 ＋ 300 | AR 30、HP 120 | — | 1.0 |
| 10 | `t2_veil` | 靜默斗篷 | 880 | 靜紋布 ＋ 活力石 ＋ 300 | MR 30、HP 120 | — | 1.0 |
| 11 | `t2_belt` | 戰士腰帶 | 900 | 活力石 ＋ 鍛鐵刃片 ＋ 300 | HP 220、AD 10 | — | 1.0 |
| 12 | `t2_sigil` | 冷卻徽記 | 900 | 沉思符文 ＋ 活力石 ＋ 300 | AH 12、HP 120 | — | 1.0 |
| 13 | `t2_ember` | 灼痕燃石 | 1000 | 微光晶屑 ＋ 活力石 ＋ 400 | AP 20、HP 150 | （v1.1 起 BURN 小） | 1.0 |
| 14 | `t2_scythe` | 重創鐮 | 900 | 鍛鐵刃片 ×2 ＋ 300 | AD 15 | GRIEVOUS（攻擊通道，40%，3s） | 1.0 |
| 15 | `t2_vial` | 衰敗之瓶 | 900 | 微光晶屑 ×2 ＋ 300 | AP 20 | GRIEVOUS（技能通道，40%，3s） | 1.0 |
| 16 | `t2_halo` | 守護聖徽 | 850 | 祈光花瓣 ＋ 沉思符文 ＋ 250 | HSP 8%、AH 8、HP 100 | — | 1.0 |

> 灼痕燃石在 v1.0 只提供屬性（BURN 屬 v1.1 primitive）；v1.1 上線時一併啟用小型燃燒並重跑 gate。

## 3. T3 完成裝（44）

欄位：價格 ＝ 組件原價總和 ＋ 合成費。完成裝屬性不必等於組件總和。

### A 暴擊／射手（6，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_dawnbow` | 破曉長弓 | 3100 | 精準瞄鏡 ＋ 重鍛刀胚 ×2 ＋ 1190 | AD 45、CR 25% | STAT：暴擊傷害 +35% | `critAmp` | 1.0 |
| `t3_hunter` | 追獵者之瞳 | 2800 | 精準瞄鏡 ＋ 疾風弩機 ＋ 950 | AD 30、CR 20%、AS 25%、MS 5% | — | — | 1.1 |
| `t3_reaper` | 收割連弩 | 2900 | 精準瞄鏡 ＋ 重鍛刀胚 ＋ 鍛鐵刃片 ＋ 1170 | AD 40、CR 20% | EXECUTE：目標 < 35% 時輸出 +12% | `execute` | 1.1 |
| `t3_pierce` | 穿雲破甲弓 | 3000 | 精準瞄鏡 ＋ 裂鋒刃 ＋ 1100 | AD 35、CR 20% | STAT：%APen 30% | `armorPenPct` | 1.0 |
| `t3_bloodoath` | 血誓長弓 | 3100 | 精準瞄鏡 ＋ 嗜紅牙 ＋ 1250 | AD 40、CR 20%、LS 10% | LOW_HP_SHIELD（自身 < 30%，護盾 = 最大生命 18%，CD 60s） | `lifeline` | 1.1 |
| `t3_rendspear` | 裂傷刺矛 | 2700 | 精準瞄鏡 ＋ 重創鐮 ＋ 850 | AD 30、CR 20% | GRIEVOUS（攻擊通道，40%，3s） | `grievous` | 1.0 |

### B 攻速／On-hit（5，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_stormfork` | 風暴三叉 | 3000 | 疾風弩機 ＋ 輕羽匕首 ＋ 重鍛刀胚 ＋ 1320 | AS 35%、AD 20 | ON_HIT：目標當前生命 4%／攻擊秒（物理） | `onHitCurrent` | 1.0 |
| `t3_thunderfist` | 雷鳴手套 | 2600 | 疾風弩機 ＋ 輕羽匕首 ＋ 虛紋針 ＋ 1100 | AS 40% | ON_HIT：18／攻擊秒（法術） | — | 1.1 |
| `t3_torrent` | 奔流護腕 | 2900 | 疾風弩機 ＋ 奧術晶核 ＋ 950 | AS 30%、AP 45 | ON_HIT：14 ＋ 12% AP／攻擊秒（法術） | — | 1.0 |
| `t3_serpent` | 蛇鱗短劍 | 2700 | 疾風弩機 ＋ 重鍛刀胚 ＋ 1320 | AS 30%、AD 25 | RAMPING_STAT：接觸每秒 AS +4%，上限 +24% | `ramping` | 1.1 |
| `t3_shieldbreaker` | 碎盾重錘 | 2900 | 疾風弩機 ＋ 生命護符 ＋ 1100 | AS 25%、HP 250 | ON_HIT：目標最大生命 2%／攻擊秒（物理） | `onHitMax` | 1.0 |

### C 刺客／穿透（6，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_shadowblade` | 暗影刃 | 3000 | 裂鋒刃 ＋ 重鍛刀胚 ＋ 鍛鐵刃片 ＋ 1270 | AD 45、APen 15 | EXECUTE：目標 < 40% 時輸出 +10% | `execute` | 1.0 |
| `t3_nightscythe` | 夜幕鐮刀 | 2800 | 裂鋒刃 ＋ 沉思符文 ＋ 重鍛刀胚 ＋ 1070 | AD 40、APen 12、AH 15 | — | — | 1.0 |
| `t3_headsman` | 斷首短刃 | 3200 | 裂鋒刃 ＋ 重鍛刀胚 ＋ 鍛鐵刃片 ＋ 1470 | AD 50、APen 10 | EXECUTE：目標 < 30% 時輸出 +16% | `execute` | 1.1 |
| `t3_ghostcloak` | 幽影披風 | 2700 | 裂鋒刃 ＋ 重鍛刀胚 ＋ 1270 | AD 35、APen 12、MS 6% | — | — | 1.1 |
| `t3_finalstring` | 絕殺弦 | 2800 | 裂鋒刃 ＋ 重鍛刀胚 ＋ 1370 | AD 40 | STAT：%APen 25% | `armorPenPct` | 1.0 |
| `t3_heartpierce` | 碎心匕 | 2700 | 裂鋒刃 ＋ 重創鐮 ＋ 850 | AD 40、APen 10 | GRIEVOUS（攻擊通道，40%，3s） | `grievous` | 1.1 |

### D 戰士／鬥士（6，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_warbringer` | 戰慄巨斧 | 2900 | 戰士腰帶 ＋ 冷卻徽記 ＋ 1100 | AD 35、HP 350、AH 15 | — | — | 1.0 |
| `t3_unbroken` | 不屈戰旗 | 3000 | 戰士腰帶 ＋ 厚實心石 ＋ 鍛鐵刃片 ＋ 1320 | AD 30、HP 300 | LOW_HP_SHIELD（自身 < 30%，護盾 = 最大生命 20%，CD 60s） | `lifeline` | 1.0 |
| `t3_bloodforge` | 血鑄戰甲 | 3000 | 戰士腰帶 ＋ 嗜紅牙 ＋ 1200 | AD 30、HP 400 | OMNIVAMP 8% | `vamp` | 1.1 |
| `t3_ragemaul` | 狂怒巨槌 | 2800 | 戰士腰帶 ＋ 重鍛刀胚 ＋ 1420 | AD 40、HP 250 | RAMPING_STAT：接觸每秒 AD +2，上限 +16 | `ramping` | 1.1 |
| `t3_twinaxe` | 雙刃旋斧 | 2800 | 戰士腰帶 ＋ 疾風弩機 ＋ 1000 | AD 30、HP 300、AS 20% | — | — | 1.1 |
| `t3_bloodplate` | 淬血重甲 | 2800 | 戰士腰帶 ＋ 鎖環胸甲 ＋ 1000 | AD 25、HP 300、AR 35 | — | — | 1.0 |

### E 法術爆發（6，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_starcrown` | 星隕法冠 | 3600 | 奧術晶核 ＋ 奧光晶塊 ×2 ＋ 1590 | AP 110 | STAT：AP +20% | `apAmp` | 1.0 |
| `t3_voidstaff` | 虛空裂杖 | 3000 | 虛紋尖晶 ＋ 奧術晶核 ＋ 1050 | AP 70 | STAT：%MPen 35% | `magicPenPct` | 1.0 |
| `t3_scorchtome` | 灼焰法典 | 3000 | 灼痕燃石 ＋ 奧光晶塊 ＋ 微光晶屑 ＋ 1220 | AP 75、HP 200 | BURN：技能通道命中，目標最大生命 1.5%／秒 × 3s（法術） | `burn` | 1.1 |
| `t3_thunderorb` | 雷殛法珠 | 2900 | 迴響法典 ＋ 奧光晶塊 ＋ 1470 | AP 80、AH 20 | EXECUTE：目標 < 35% 時輸出 +10% | `execute` | 1.1 |
| `t3_tideedge` | 暗潮法刃 | 2800 | 虛紋尖晶 ＋ 奧光晶塊 ＋ 1420 | AP 75、MPen 15、MS 5% | — | — | 1.1 |
| `t3_soulrend` | 裂魂法杖 | 2700 | 衰敗之瓶 ＋ 奧光晶塊 ＋ 1320 | AP 65 | GRIEVOUS（技能通道，40%，3s） | `grievous` | 1.0 |

### F 法術續戰／功能（5，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_lifespring` | 生命法泉 | 3000 | 迴響法典 ＋ 生命護符 ＋ 1150 | AP 55、HP 300、AH 15 | OMNIVAMP 7% | `vamp` | 1.0 |
| `t3_frostcrown` | 冰霜法冠 | 2800 | 奧術晶核 ＋ 厚實心石 ＋ 1270 | AP 60、HP 250 | SLOW_ON_HIT：技能通道，目標 MS −15%、1.5s | `slow` | 1.0 |
| `t3_hourglass` | 時序沙漏 | 2800 | 奧術晶核 ＋ 重鱗甲片 ＋ 1270 | AP 65、AR 40 | （主動靜滯延後 v1.2；v1.1 只有屬性） | — | 1.1 |
| `t3_orbitring` | 迴旋法戒 | 2600 | 迴響法典 ＋ 沉思符文 ＋ 1350 | AP 50、AH 25、MS 5% | — | — | 1.1 |
| `t3_psyward` | 靈能護符 | 2800 | 靜默斗篷 ＋ 奧術晶核 ＋ 870 | AP 45、MR 40 | LOW_HP_SHIELD（自身 < 30%，只擋法傷，最大生命 20%，CD 60s） | `lifeline` | 1.0 |

### G 坦克／防禦（6，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_thornmail` | 棘刺鎧 | 2700 | 鎖環胸甲 ＋ 重鱗甲片 ＋ 1320 | AR 60、HP 250 | GRIEVOUS（被攻擊通道擊中時，對攻擊者 40%，3s） | `grievous` | 1.0 |
| `t3_colossus` | 巨像心核 | 3000 | 生命護符 ＋ 厚實心石 ×2 ＋ 1140 | HP 650 | SUSTAIN_REGEN：RG +0.5%、脫戰延遲 −2s | `regen` | 1.1 |
| `t3_bulwark` | 堅壁重盾 | 2700 | 鎖環胸甲 ＋ 厚實心石 ＋ 1320 | AR 55、HP 300 | ANTI_CRIT：受到暴擊期望加成 −25% | `antiCrit` | 1.0 |
| `t3_calmveil` | 靜海披風 | 2700 | 靜默斗篷 ＋ 厚靜紋布 ＋ 1360 | MR 60、HP 300 | LOW_HP_SHIELD（自身 < 30%，只擋法傷，最大生命 18%，CD 60s） | `lifeline` | 1.0 |
| `t3_magmacore` | 熔核護甲 | 2700 | 鎖環胸甲 ＋ 灼痕燃石 ＋ 800 | AR 40、HP 350 | BURN（光環：4 單位內敵人 12 ＋ 1% 額外生命／秒，法術） | `burn` | 1.1 |
| `t3_statue` | 不動石像 | 2900 | 鎖環胸甲 ＋ 靜默斗篷 ＋ 1120 | AR 35、MR 35、HP 250 | RAMPING_RESIST：接觸每秒 AR／MR +3，上限 +18，脫戰 5s 衰減 | `ramping` | 1.1 |

### H 輔助／團隊功能（4，v1.0 = 3）

| id | 名稱 | 價格 | 合成 | 屬性 | 效果 | Unique | 批次 |
|---|---|---:|---|---|---|---|---|
| `t3_wardaltar` | 守望聖壇 | 2300 | 冷卻徽記 ＋ 守護聖徽 ＋ 550 | HP 250、AH 15 | AURA：8 單位內友軍 AR ＋8、MR ＋8 | `aura:resist` | 1.0 |
| `t3_redemption` | 救贖之環 | 2300 | 守護聖徽 ＋ 祈光花瓣 ＋ 厚實心石 ＋ 670 | HSP 15%、AH 15、HP 200 | — | — | 1.0 |
| `t3_warhorn` | 鼓舞號角 | 2300 | 迴響法典 ＋ 沉思符文 ＋ 1050 | AP 35、AH 20 | AURA：10 單位內友軍 MS ＋4% | `aura:ms` | 1.1 |
| `t3_vowshield` | 聖盾誓約 | 2300 | 鎖環胸甲 ＋ 靜默斗篷 ＋ 520 | AR 25、MR 25、HP 200 | LOW_HP_SHIELD（8 單位內最近友軍 < 30%，護盾 = 其最大生命 15%，CD 45s） | `lifeline:ally` | 1.0 |

## 4. Boots（6）

| id | 名稱 | 價格 | 合成 | 屬性 | 批次 |
|---|---|---:|---|---|---|
| `bt_base` | 輕步靴 | 300 | — | MS 6% | 1.0 |
| `bt_iron` | 鐵步靴 | 1000 | 輕步靴 ＋ 700 | MS 8%、AR 25 | 1.0 |
| `bt_quiet` | 靜步靴 | 950 | 輕步靴 ＋ 650 | MS 8%、MR 25 | 1.0 |
| `bt_swift` | 迅擊靴 | 950 | 輕步靴 ＋ 650 | MS 8%、AS 25% | 1.0 |
| `bt_arcane` | 奧術靴 | 1000 | 輕步靴 ＋ 700 | MS 8%、MPen 12 | 1.0 |
| `bt_focus` | 沉思靴 | 900 | 輕步靴 ＋ 600 | MS 8%、AH 12 | 1.0 |

## 5. Role／Starter（4）

| id | 名稱 | 價格 | 限制 | 屬性／效果 | 批次 |
|---|---|---:|---|---|---|
| `st_blade` | 鬥志補給刃 | 450 | 任一 | AD 7、HP 70、LS 3% | 1.0 |
| `st_tome` | 啟蒙法卷 | 450 | 任一 | AP 12、HP 70、RG 0.1% | 1.0 |
| `st_hunter` | 獵人護符 | 400 | 席位 = 打野（持有懲戒） | 對野怪營地輸出 +20%（不作用於龍／巴龍／英雄） | 1.0 |
| `st_tithe` | 守護徽章 | 400 | 席位 = 輔助 | 被動收入 +1.2／秒；自身小兵分成的 50% 轉給最近的己方英雄（帳本守恆） | 1.0 |

> Starter 在需要格子時自動丟棄、不退款；帳本記為已花費。

---

## 6. 六定位出裝路線（v1.0 可用裝備；括號為 v1.1 替代）

出裝依英雄主定位（`correctedArch`）；starter 依席位。

| 定位 | Starter | 核心 1 → 2 → 3 | 替代路線 | 靴子規則 | 情境槽（優先序） |
|---|---|---|---|---|---|
| 坦克 | 上路 `st_blade`；輔助席 `st_tithe`；打野席 `st_hunter` | 抗性 1（敵 AD 重 ⇒ `t3_bulwark`；否則 `t3_calmveil`）→ `t3_wardaltar` → 另一抗性 | （`t3_statue`、`t3_colossus`） | 敵 AD 重 ⇒ `bt_iron`；AP 重 ⇒ `bt_quiet`；否則 `bt_focus` | 敵治療 ≥ 2 ⇒ `t3_thornmail`；敵爆發 ≥ 2 ⇒ `t3_calmveil` |
| 戰士 | `st_blade`（打野席 `st_hunter`） | `t3_warbringer` → `t3_unbroken` → 抗性（AD 重 `t3_bloodplate`／AP 重 `t3_calmveil`） | （`t3_bloodforge`、`t3_twinaxe`、`t3_ragemaul`） | AD 重 `bt_iron`／AP 重 `bt_quiet`／否則 `bt_swift` | 敵坦克 ≥ 2 ⇒ `t3_finalstring` 或 `t3_shieldbreaker`；敵治療 ≥ 2 ⇒ `t2_scythe` →（`t3_heartpierce`） |
| 刺客 | `st_blade`（打野席 `st_hunter`） | `t3_shadowblade` → `t3_nightscythe` → `t3_unbroken` | （`t3_headsman`、`t3_ghostcloak`） | AD 重 `bt_iron`；否則 `bt_swift` | 敵坦克 ≥ 2 ⇒ `t3_finalstring` 取代核心 2；敵治療 ≥ 2 ⇒ `t2_scythe` →（`t3_heartpierce`） |
| 法師 | `st_tome` | `t3_starcrown` → `t3_voidstaff` → `t3_lifespring` | `t3_frostcrown` 取代核心 3（控制型）；（`t3_scorchtome`、`t3_thunderorb`） | AP 重 `bt_quiet`；否則 `bt_arcane` | 敵治療 ≥ 2 ⇒ `t3_soulrend`；敵爆發 ≥ 2 ⇒ `t3_psyward`；（敵 AD 突進 ≥ 2 ⇒ `t3_hourglass`） |
| 射手 | `st_blade` | `t3_dawnbow` → `t3_stormfork` → `t3_pierce` | `t3_torrent`（混傷英雄）；（`t3_hunter`、`t3_reaper`） | `bt_swift`；敵 AD 突進 ≥ 3 ⇒ `bt_iron` | 敵治療 ≥ 2 ⇒ `t3_rendspear`；敵坦克 ≥ 2 ⇒ `t3_shieldbreaker` 提前；（敵爆發 ≥ 2 ⇒ `t3_bloodoath`） |
| 輔助 | `st_tithe` | `t3_vowshield` → `t3_wardaltar` → `t3_redemption` | `t3_frostcrown`（法術型輔助）；（`t3_warhorn`） | `bt_focus`；敵 AD 重 ⇒ `bt_iron` | 敵治療 ≥ 2 ⇒ `t3_thornmail`；敵爆發 ≥ 2 ⇒ `t3_calmveil` |

Build Strategy 對路線的影響（草案）：

| 預設 | 改變 |
|---|---|
| `standard` | 上表 |
| `early` | 核心 1 前先完成一件 T2 輸出組件；靴子延後到第三次開窗 |
| `scaling` | 射手／法師把奢侈裝（`t3_dawnbow`／`t3_starcrown`）固定在核心 1；戰士改先 `t3_warbringer` 不變 |
| `counter` | 情境門檻 −1（治療、坦克、爆發 ≥ 1 即觸發），情境槽可取代核心 2 |
| `survival` | `lifeline` 群組（`t3_unbroken`／`t3_psyward`／`t3_calmveil`）提前到核心 2 |

## 7. 反制矩陣

| 敵方狀況 | 物理方回應 | 法術方回應 | 坦克／輔助回應 |
|---|---|---|---|
| 大量治療／吸血 | `t2_scythe`、`t3_rendspear`、（`t3_heartpierce`） | `t2_vial`、`t3_soulrend` | `t3_thornmail` |
| 高護甲坦克 | `t3_pierce`、`t3_finalstring`、`t3_shieldbreaker` | —（護甲不擋法傷） | — |
| 高魔抗 | — | `t3_voidstaff`、`bt_arcane`、`t2_rift` | — |
| 暴擊射手 | — | — | `t3_bulwark`、`bt_iron` |
| 物理突進／刺客 | `t3_unbroken`、（`t3_bloodoath`） | （`t3_hourglass`） | `t3_vowshield`、`bt_iron` |
| 法術爆發 | `t2_veil` 組件 | `t3_psyward` | `t3_calmveil`、`t3_wardaltar`、`bt_quiet` |
| 高機動風箏 | — | `t3_frostcrown` | `t3_frostcrown`（法術型輔助） |

> 反制不得形成硬剋：Gate 10 要求任何一組反制在對戰夾具中造成的擊殺時間差 ≤ 2 倍。
