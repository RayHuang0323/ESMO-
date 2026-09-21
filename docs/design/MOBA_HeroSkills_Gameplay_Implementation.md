# MOBA 100 英雄技能正式實作：進行中

本文件追蹤實際權威施法完成度。正式 `main` 與目前 `heroSkillsV1` 開關仍為 OFF；本 worktree 是候選實作。最新進度見文末；不得把 Workshop 的 17 個視覺預覽計作 17 招已完成技能。

## Contract 與第一個實作切片

玩家承諾：選出的英雄在正式對戰中，以自身 Q/W/E/R 改變命中、位置、狀態與戰術決策；畫面只播放引擎已確認的事件。首個切片測鋼鐵衛士 Q 的近距離衝鋒對位與擊退。未完成內容詳列下方。

`heroDatabase.skills[slot].gameplay → toEngineHeroSkills(roster) → LogicEngine.configureHeroSkills → frozen-position cast collection → damage/displacement/cooldown → snapshot.fx / player.heroSkills → adapter → HeroVfxRuntime / BattleObserverHUD / Replay`

- 只有 `gameplay` 明確著作的技能可進引擎；舊 `skillData` 四套重複陣列及最多 38 字的截斷描述，不能自動推算完整技能語意。
- 目前 100 英雄 × Q/W/E/R = 400 項，**6 項已有權威切片**：鋼鐵 Q（突進、擊退、路徑減速）、冰霜 Q（飛行後命中／可閃避／緩速）與 E（固定落點、0.7 秒後範圍命中）、大地 Q（線形多目標擊飛）與 E（單體傷害／根植、禁止位移但保留普攻）、炎拳 W（低血量觸發護盾、延遲爆發）。皆由引擎判定傷害、控制、冷卻，VFX 不自行決定結果。數值與自動施放門檻暫屬開發候選，仍須產品審核與 balance gate；冰霜 E 層數、炎拳 W 吸收倍率及大地 E 截斷後附加語意尚未完成，不能把六招稱作完整產品規格。
- 引擎只收 adapter 編譯的規則，不 import 英雄資料庫；VFX 只讀 `skillId` 與已保存座標，不判命中／傷害。
- 引擎 post-combat 在凍結位置先收集雙方施法，才套用傷害與位移；無 random、同 seed 可重現。這是實作起點，非大樣本 Fairness 結論。
- snapshot 僅對已配置席位附 `heroSkills` 冷卻。Replay v1 原 12 欄 tuple 保留 `hero:Q/W/E/R` ability；播放時依保存名單還原技能外觀，不重算引擎。舊 Replay 不保存技能冷卻，HUD 不填假值。
- 正式流程由 `useLocalServer` 接入；目前 `heroSkillsV1=false`，DEV 可用 `?heroSkillsDev=1` 在正式入口驗證。不能在 100 英雄／平衡／Replay／Fairness gates 完成前開正式旗標。

## 視覺技術方向

第一輪乾淨的攻擊 primitive 與第二輪的方向、裂地、位移語彙在單一 `HeroVfxRuntime` 合流。鋼鐵衛士 Q 權威事件採 `charge-stomp` motif。場景使用固定 instanced pools；shader 以輪廓／法線／alpha 表達材質，不靠全屏發光。`threejs-postprocessing` 的全屏 bloom／DOF 都會加 render pass 並可能遮 HUD，現階段 0 pass；後續只在高畫質、可量測、可關閉且真機確認有增益時採選擇性後製。

技術美術預算沿用現有固定 pool：low 96、高 384 instances；flame low 48／high 128。後續每批紀錄實際 draw calls、triangles、geometries、textures、DPR、手機 FPS 與重疊可讀性。英雄獨有形狀／動作優先於換色模板；材質 shader／後製不能替代技能輪廓。

五個 skills 的本輪用法：`threejs-gameplay-systems` 管權威更新順序與施法回饋、`create-game-vfx` 管 trigger／清理／容量、`threejs-shaders` 管共用材質語彙、`threejs-postprocessing` 管全屏成本與是否啟用、`threejs-aaa-graphics-builder` 的 technical-art／render budget 管可讀性與效能。已讀 Gameplay workflows、game-design-level-design、physics-engine-selection、game-feel；AAA implementation-blueprint、technical-art、render-recipes、performance-safe-visual-detail。此次沒有新模型／材質／post pass，AAA 模型／視覺 scorecard 阶段尚未完成。

## 實際驗證與剩餘工作

唯讀全量 Audit：100 英雄的 QWER 400 欄皆存在，但 374/400 描述固定 38 字、常在半句終止；`skillData` 實際僅四套依槽位重複的 signature，不能當完成的 hero-specific gameplay spec。可觀測語意至少涵蓋傷害 222、AoE 84、投射／線形 61、位移 44、護盾 45、減傷／免疫 81、召喚／分身 28；分類可重疊且只算描述前綴的下限。時間回溯、地形阻擋、反射／複製、全隊連結等高風險招式需要各自明確狀態與 deterministic／Replay 規則，不能直接套四個現成 mechanic。

`check_hero_skills_gameplay_slice.mjs` 10/10：4/400 覆蓋、雙方同時施法、突進／擊退、冰彈命中與閃避、線形多目標擊飛、護盾吸傷與延遲爆發、權威事件 VFX、Replay Q/W tuple、同 seed。冰霜 Q 的 0.5s 命中原被舊 `pushFx` 最短 1.6s 視覺壽命拖慢；現在 authored 事件可用 0.72s（冰矛接觸約 0.5s），Legacy FX 最短 1.6s 不變，Replay 保存 0.72s。Phase1 10/10、Round2 17/17、L compatibility 80/80、build PASS。正式 Battle DEV browser 新 gate 前兩次及視覺同步後各 4/4：在 `ts=144.5` 觀測冰霜 Q 權威事件、對應施法者冷卻、池化 VFX 已畫出（`namedDrawnFrames>0`）、無 page/shader errors；截圖 `tmp/hero-skills/authority-named-skill.png`。舊測試只等 b1 鋼鐵 Q，可能在固定 440 次輪詢內未施放而假紅；新 gate 仍要求 authored event 與 cooldown／VFX 成立，並未改引擎 seed 或放寬產品條件。P0-A～D、presentation／controls scoped 6/6、runtime29 flat 35/35、regress 15/15、regress2 節奏 8/8 本輪複驗通過。舊 scoped runner 10/11 中 `simulation_version` **50/51 FAIL**：LogicEngine 文字新增 opt-in 技能，仍用 v7 指紋。這是正式發布阻擋，沒有修改指紋／放寬 gate；完成 100 英雄定義與平衡後必須一併做 simulation version closure。

待完成：394 項 QWER 欄位與已著作六招的完整語意審核、P 被動定義、更多 Gameplay primitives（錐形／持續區域／治療／召喚）、AI 施法時機、正式 HUD 全技能狀態、Replay 舊檔相容與新能力保存、100 英雄視覺身份、完整平衡與 n=1000 Fairness、手機真機效能、sim version 審核、正式旗標與正式流程 browser gate。任何缺漏都不能當已完成。

啟用阻擋 HS-100-G2：已著作技能有顯式物理／魔法類型，Items ON 已接既有減傷與盾的共用管線；但 AD/AP 比例、技能急速、專屬 proc、完整反制與全量平衡尚未完成。六招是可測的架構驗證，**不是**完整平衡候選。正式技能 ON 與 100 英雄閉環前仍需修正並重跑 Items ON gates。

### 最新增量（以此節覆蓋上文較早的 4/400 驗證數）

大地 E 納入後 authored gameplay 為 **5/400**，Workshop authored 視覺為 13 項。Gameplay slice **14/14**、Round2 pure **18/18**、Round2 browser **66/66**；Phase1 **10/10**、正式 Battle browser **4/4**、L compatibility **80/80**。flat runner 的 runtime29／presentation29b2／controls29b3／P0-A～D／build **8/8**，regress **15/15**、regress2 節奏 **8/8**，全部 exit 0；`simulation_version` 舊指紋 **50/51 FAIL** 未解除。前述原來 4/400 與 10/10 是歷史切片，勿視為現況。大地 E 完整語意仍待補，手機真機性能未驗。

### Items ON 傷害契約增量

五項 authored 技能新增顯式 `damageType`；技能已自行套 `damage + power × powerRatio`，故 Items ON 使用 `resolveAbilityHit` 僅做對應物理／魔法抗性、穿透／光環，再沿 Item 現有 `applyDamage` 的魔法盾→一般盾→血量與 `afterDamage` 的吸血／重傷觸發，不重跑普攻 profile 倍率。真實傷害保有獨立通道，不受抗性或魔法專屬盾抵擋；Items OFF 仍走既有 `_damageHero`。新 failing test 先證明原技能無 `damageType`，後測實際大地 E 魔抗／魔法盾、真實傷害與 Items ON＋技能 420 tick 逐幀 same-seed：slice **17/17 PASS**。M1 **69/69 PASS**；M2 **52/53 FAIL** 只剩既知 simulation-version 指紋；M3a **64/66 FAIL** 為歷史「LogicEngine／Items runtime 不得相對 HEAD 修改」靜態斷言及既知版本指紋。此項只修部分 HS-100-G2：AD/AP 比例、急速、技能專屬 proc、剩餘 395 欄與 Items ON 平衡未完成，正式啟用仍禁止。

### 延遲落點 AoE primitive（6/400）

冰霜 E 明確著作 `delayed-area`：施放時凍結落點，0.7 秒後依爆發時敵方英雄位置判圓形範圍；可離開閃避，也可走入受擊。魔法傷害走上一節 Items ON 共用管線，Replay 保留原 `hero:E` tuple 並依保存 roster 還原，不讓呈現層決定命中。描述在「積累 2」處截斷，所以冰霜層數未實作，不宣稱此招規格完成。冰晶演出改用菱形預警、升起晶簇、碎片餘波；不增加全屏後處理。預警 `radius = gameplay.radius × WORLD_SCALE = 3 × 1.7 = 5.1`，時間 `1.4s × windup 0.5 = 0.7s`，避免視覺安全範圍小於實際命中。這是 `create-game-vfx` 可讀性與 `threejs-aaa-graphics-builder` 技術美術門檻促成的修正；沿用 `threejs-shaders` 共用池化材質，`threejs-postprocessing` 評估後仍為 0 pass，`threejs-gameplay-systems` 約束施法→延遲→判定順序。視覺仍是候選，未經真機效能驗證。

### 友方護盾 primitive（最新 7/400）

大地 W 的完整來源描述明訂「目標友方或自身、護盾為自身護甲 3 倍、持續 3 秒」。新增 `ally-shield` 規則：低血量可及隊友（含自己）中選 HP 比最低者，施法者權威護甲以英雄基礎／等級成長加上 Items ON 護甲／光環，再乘 3 與既有 Item 治療護盾強度；Items OFF 不讀 Item state。候選 AI 門檻 80% HP、範圍 8、冷卻 11 秒仍須平衡審核。命中與護盾由引擎決定，`snapshot.fx`／Replay 保留 `dadi:W` 與來源／目標；原 Workshop 石壁在施法者附近，先以失敗測試定位，再移到真正受保護者，低動態模式一致。沒有新增 shader、pool 或 post pass。`check_hero_skills_gameplay_slice` 21/21、Round2 pure 21/21；其餘 393 欄、100 英雄閉環、全量平衡及真機驗證尚未完成。

Item v1 原契約 `docs/architecture/MOBA_戰鬥屬性契約_v1.md` 指出 Ability Haste 只影響技能通道期望輸出，**不縮短任何冷卻**。因此本輪沒有以 Haste 改寫 QWER 冷卻；後續若需轉成可縮短的技能冷卻，須先正式變更 Item 契約與對應 gate，不能視為目前缺陷的隨手修補。

唯讀來源複查：400 欄皆有描述；26 欄不足 38 字且有完整句號，374 欄是 38 字 cap-risk（372 欄連句末標點都沒有）。搜尋 `src`／`docs`／`.sprints`、其他 worktree 的資料副本及 Git 引入紀錄，未找到這批截斷描述的完整權威版本。下一個小批次優先評估描述完整的 `ironclad:W`、`cinderfist:E`、`thornwall:Q/E`、`ravager:E`、`auralith:W`；即使句子完整，未載明的傷害量、距離、AI 決策仍是待審候選，不因模板已有數字而變成正式規格。其餘截斷招式先要求完整語意來源，再逐 mechanic 擴充，不一次宣稱 100 英雄完成。

### 持續線形區域 primitive（最新 8/400）

完整描述的炎拳 E 著作為 `dash-wall`：向最近敵人方向穿透衝刺至 8 sim 單位，權威落點經既有導航投影；來源與落點之間留下 2 秒、半寬 1.2 sim 單位的火牆。每 0.5 秒從當下敵方位置檢查是否踩入，離開可避、進入可受擊；魔法 tick 傷害走同一 Items ON 減傷／護盾管線。18＋power×0.16／tick、冷卻 14 秒為候選，非已平衡數值。跳過時間區間時已過期的火牆不得補打傷害。`snapshot.fx` 保存來源、實際落點與 `cinderfist:E`，Replay 不重算火牆命中，HUD 讀權威冷卻。

新 `magma-wake` 視覺是線形雙側熔岩脊與落地碎板，標示實際牆寬 `1.2 × WORLD_SCALE`；Workshop 角色衝到落點，正式角色仍只由 snapshot 位移。共用 shader／instanced pool，無新增全屏 pass；低動態模式保留靜態雙邊界。桌面截圖曾顯示第一版牆過細，已加強兩側高度／亮度而不改權威碰撞寬。未經手機真機 FPS 實測。其餘 392 欄與完整 100 英雄平衡仍未完成。

### 高速穿透線 primitive（最新 9/400）

曙光 Q 的完整描述明訂高速穿透箭矢、路徑上所有目標、依次遞減物理傷害。新增 `piercing-line`：凍結施放方向及 10 sim 單位路徑，0.3 秒後以當下敵人位置計算沿線距離及側向寬度；沿路徑距離與 ID 穩定排序，第一名起以 0.75 倍逐目標衰減。可在命中前離開或進入箭道。基傷 75、power ratio 0.5、半寬 1、冷卻 8 秒均屬候選，尚未平衡。權威引擎獨占命中／減傷／冷卻；Replay 保留原 `hero:Q` tuple。新 `sun-pierce` 使用獨立箭頭、斷續日光尾跡與薄線餘波，完全不使用圈形；箭頭到達時間約對齊 0.3 秒命中，沿用 shader／instanced pools 且不加全屏 post pass。Workshop 現有 7 英雄 16 演出，其中僅 9 招有 gameplay，另 391 欄未著作。

唯讀 review 證實炎拳 W/E 可在同一 tick 同時啟動（低血量時兩個 pending effect）；新增 failing regression 後以 per-hero deterministic slot 順序仲裁，每 tick 最多一招，下一 tick 仍可施放未用槽位。火牆死亡後持續與 tick 邊界、投影落點穿越障礙屬待明確化契約，未藉此擴大改動。驗證：gameplay slice 30/30、Phase1 10/10、Round2 pure 25/25、Round2 browser 84/84、L 80/80、正式 Battle 5/5（既有 roster）、runtime29 flat 35/35、presentation flat 12/12、controls flat 18/18、P0-A～D、regress 15/15、regress2 8/8、Item M1 69/69、build PASS；40 重疊 Dawn Q low/high 分別 11 calls / 2012 triangles 與 11 calls / 4732 triangles，mobile low 截圖與 320–430px overflow gate 通過，但手機真機 FPS 未測。截圖 `tmp/hero-skills/round2/dawnstrike-Q-burst.png`、`mobile-dawnstrike-Q.png`。正式 `heroSkillsV1=false`，未 push／deploy。simulation-version 50/51 FAIL 指紋仍是正式啟用阻擋，不改 baseline。

補充：browser gate 現以 DOM「第二輪」標籤交叉確認畫面，87/87 PASS，另存 `dawnstrike-Q-verified-round2.png`。相同 S29B1 40 seed/tactic rows 對 `dc520f1` 正式基準逐列一致，既存 pacing g3 `6 < 7` 不當作本輪新回歸，也未放寬 gate。

### 範圍嘲諷／限時減傷 primitive（最新 10/400）

鋼鐵 W 的完整來源描述為「範圍嘲諷周圍所有敵方英雄 1.2–2 秒，自身減傷 25–45%」。著作 `area-taunt-guard`：施法者附近 3.5 sim 範圍內的敵方英雄被嘲諷 1.5 秒，移動意圖與普攻目標指向存活的施法者；失效或施法者死亡立即恢復正常選敵。嘲諷不是擊飛／昏迷，允許普攻但阻止技能施放。施法者獲 1.5 秒 35% 全來源減傷；英雄／召喚師／塔／野怪走同一 guard factor，Items ON 在抗性結算後、護盾吸收前按物理／魔法／真傷通道縮放，後續吸血與統計讀同一個縮放後 hit。範圍、冷卻 12 秒、1.5 秒／35% 是待審候選，不是完整等級曲線或已平衡規格。多來源嘲諷優先序另列未完成契約。

`bastion-command` 視覺用三片鋼壁、向外的指令箭角與少量鋼屑；不以球罩或多層圈表示減傷。方位使用權威施法者→最近目標，範圍標示 `3.5 × WORLD_SCALE`；低動態只留固定板與指向標記。沿用共用 pool／shader，無新增 post pass；`threejs-shaders` 與 `threejs-postprocessing` 的本輪決策是避免額外透明 overdraw／全屏模糊，`create-game-vfx` 管觸發與 reduced-motion，`threejs-gameplay-systems` 管嘲諷狀態與結算順序，AAA technical-art 管 mobile 上限。Workshop 現有 7 英雄 17 演出，其中 10 招有 gameplay，另 390 欄未著作。

TDD 先紅後綠：Gameplay slice 36/36（多敵／範圍外、移動與選敵、施法者死亡／到期、Items OFF／ON 及三種傷害通道、鏡像、Replay）、Phase1 10/10、Round2 pure 27/27、Workshop browser 93/93（含 40 重疊 low/high、mobile low、四手機寬、shader/page errors 0）、正式 Battle browser 6/6（實測 `ironclad:W` 權威事件）、P0-A～D、runtime29 flat 35/35、presentation flat 12/12、controls flat 18/18、regress 15/15、regress2 8/8、Item M1 69/69、build PASS。截圖 `tmp/hero-skills/round2/ironclad-W-burst.png`、`mobile-ironclad-W.png`。手機真機 FPS 與技能 ON 大樣本未測；正式 `heroSkillsV1=false`，simulation-version 指紋仍為發版阻擋。
## Latest implementation slice — Thornwall / Gambler (2026-09-20)

- Authoritative progress: **13/400 QWER**, **9 heroes**, **20 visual motifs**.
- Thornwall Q uses `dash-control-strike`: first-target physical hit + 0.75s stun + path slow.
- Thornwall E uses `root-dot`: 1.5s root plus three deterministic magic ticks at 0.5s intervals.
- Gambler W uses `blink-shield`: 3.5 sim-unit blink toward the selected threat and an HP-based shield.
- VFX motifs are `thorn-charge`, `thorn-chain`, and `luck-blink`; all use the shared instanced shader pools, capped low-quality counts, reduced-motion footprints, and no fullscreen post pass.
- Verified: gameplay 39/39, pure visual 30/30, Workshop browser 102/102, formal authored-cast browser 6/6, build PASS.
- Not release-ready: 387 skills remain, full skill-ON balance is absent, simulation-version is 50/51 FAIL, and real-device FPS is unmeasured.
## Latest implementation slice — shared primitive expansion (2026-09-20)

- Authoritative progress: **27/400 QWER slots**, **15 heroes**, **34 visual motifs**. `heroDatabase` remains the only hero/skill source; `heroSkillsV1=false` remains OFF.
- New reusable gameplay primitives: `dash-knockup-strike`, `dash-blast`, and `blink-strike`.
- Newly authored gameplay: Ravager Q/E, Sting Q/E, Greymantle Q/E, Embercoil Q/E/R, Auralith Q/E, and Razorwing Q/W/E.
- New visual language: ember cleaves/craters, venom flash/afterimages, beast pounce/maul leap, serpent bind/wake/shackle, aurora ice spike/field, and wing-slice/redline/guard. No new fullscreen post pass, dynamic lights, or per-frame allocations.
- Verification: gameplay **41/41**, Phase 1 **10/10**, Round 2 pure **44/44**, Workshop browser **145/145**, formal authored-cast browser **6/6**, runtime29/regress/regress2 **3/3**, presentation/controls **2/2**, P0-A to P0-D **6/6**, build PASS.
- Known blockers remain unchanged: pacing29b1 **24/25** baseline (`g3` p50 kills `6 < 7`), simulation fingerprint **50/51**, full skill-ON balance and real-device FPS are not complete. No push/deploy.
## Latest implementation slice: shared control/formation primitives (2026-09-20)

Current implementation is **43/400 QWER slots across 21 heroes**. The third slice adds five reusable primitives: `cone-strike` (deterministic angular hit ordering), delayed `area-root` (impact-time occupancy), `control-target` (explicit stun control), `targeted-ally-shield` (canonical lowest-HP reachable ally), and `team-shield` (canonical living allies within radius). Each primitive is validated before it can enter `heroDatabase`; the engine owns timing, target selection, damage/control/shield state, and Replay identity.

New authored slots are Phantom Q/E, Mirrorshot Q/E, Mantra Q/W/E/R, Luminary Q/E/R, Stoneguard Q/R, and Hexweave Q/W/R. These are a minimal explicit gameplay slice, not an inference that all source descriptions are complete. The formal flag stays off until the full 100-hero contract, balance, compatibility, and product review are complete.

Tests after this slice: gameplay 43/43; Phase 1 10/10; Round 2 pure 60/60; Workshop browser 197/197; formal cast browser 6/6; runtime29/regress/regress2 3/3; presentation/controls/P0-A/B/C/D 6/6; build PASS. Pacing29b1 24/25 and simulation fingerprint 50/51 remain known baseline blockers.

## Latest implementation slice: taunt and delayed area-control (2026-09-20)

The current implementation is **62/400 QWER slots across 27 heroes**. `area-taunt` is a non-damaging, range-bounded taunt that preserves existing movement/target ownership. `area-control` is a delayed, impact-time occupancy query that applies one explicit control kind (`stun`, `knockup`, or `root`) and typed damage. Both are compiled only from authored `heroDatabase.skills[slot].gameplay` data.

The new authored set is Suishan Q/W/E/R, Tixue Q/W/E, Rongyan Q/W/E, Kuangfeng Q/W/R, Yueying Q/E/R, and Dianguang Q/W/E. The contract deliberately leaves unmodeled stateful/terrain parts un-authored rather than manufacturing behavior. Tests: gameplay 45/45; Phase 1 10/10; Round2 pure 79/79; Workshop browser 257/257; formal cast 6/6; runtime/regression 3/3; presentation/controls/Fairness 6/6; build PASS.

## Latest implementation slice: multi-strike / silence and six more heroes (2026-09-20)

The authoritative surface is now **84/400 QWER slots across 32 heroes**. The new shared contracts are `multi-strike` and `silence-target`; `area-taunt` and delayed `area-control` remain available to later authors. `multi-strike` owns a locked target, deterministic hit interval, and falloff. `silence-target` owns a bounded source-aware status that gates only authored skill casts. Both are compiled only from explicit `heroDatabase.skills[slot].gameplay` data.

The new authored set is Duskblade, Voidrift, Anye, Jiansheng, Xingchen, and Leiting. The Leiting Q formal browser failure was traced to an incomplete projectile contract and fixed by adding its required slow fields. No damage tuning, seed/baseline change, simulation-version bump, Item change, or Fairness change was made.

The Golden Set now contains **89 authored visual motifs** across **32 heroes**. Shadow, void, night, sword, stardust, and thunder recipes use distinct silhouettes and actions; R recipes expose separate windup/burst/aftermath phases. Gameplay remains the only source of hit, damage, control, cooldown, target, status, and Replay identity; VFX only presents resulting events.

Verification: gameplay **47/47**; Phase 1 **10/10**; Round2 pure **99/99**; Workshop browser **321/321**; formal authored-cast browser **6/6**; `runtime29/regress/regress2` **3/3**; `presentation/controls/P0-A/B/C/D` **6/6**; build **PASS**. The official pacing rerun remains the unchanged baseline **24/25 FAIL** and simulation fingerprint remains **50/51**. The formal flag is still OFF; full skill-ON balance and real-device performance remain open.

All five requested skills were used: `threejs-gameplay-systems` for deterministic contracts and authority; `create-game-vfx` for readable pooled effects and caps; `threejs-shaders` for reused analytic instancing; `threejs-postprocessing` for a no-fullscreen-pass performance budget; and `threejs-aaa-graphics-builder` for distinct, non-template hero language.

## Eighth slice contract additions（2026-09-20）

The eighth slice moves the opt-in compiler/runtime to **132/400 explicit QWER slots across 55 gameplay-authored heroes**. Langwang, Chichuan, Hunpo, Leiming, Ronghuo, Miwu, Jingxiang, Yanfeng, Hanbing, and Dujian use already validated shared mechanics: dash-strike, cone-strike, projectile, delayed-area, multi-strike, self-shield, blink-strike, and piercing-line.

The slice intentionally adds no new authority primitive. `LogicEngine` remains responsible for timing, target selection, damage, control, movement, and snapshot events. The pooled choreography layer supplies the 16 new wolf/flame/soul/thunder/magma/mist/mirror/phoenix/frost/toxin silhouettes, with reduced-motion and quality caps. Chichuan E changes its current preview recipe to `flame-crash`; its prior `flame-dash` motif remains only for DEV comparison.

Pure/browser/protected gates are green: gameplay 52/52, Phase1 10/10, Round2 146/146, Workshop 467/467, formal cast 6/6, protected 9/9, build PASS, and diff check PASS. The formal flag remains OFF and the known pacing/simulation baseline waivers remain unchanged.

## Sixth slice contract additions（2026-09-20）

The sixth slice moves the opt-in compiler/runtime to **100/400 explicit QWER slots** without inventing semantics for missing hero descriptions.

- `self-shield`: a self-owned shield status with authored max-HP percentage and bounded duration; it never selects an enemy target and never lets VFX decide mitigation.
- `blink-shield.direction`: `away` is resolved by the authoritative engine using the canonical side-relative direction, while presentation only renders the retreat motion and shield silhouette.
- `multi-strike.finalMultiplier`: a bounded final-hit multiplier is applied only to the final deterministic hit in the authored sequence; interval, hit count, target lock, and damage channel remain runtime-owned.

The sixth authored set is Maestro W/R, Fengbao Q/W, Shikong Q/W, Liuxing E/R, Longji Q/W/E/R, and Binghe Q/W/E/R. Unsupported clauses and unassigned slots remain absent rather than being silently mapped to class fallback. This keeps the shared primitive vocabulary honest while the remaining 63 gameplay heroes are authored.

## Seventh slice contract additions（2026-09-20）

The seventh slice adds 16 explicit slots without introducing a new mechanic family. Huanying uses deterministic multi-strike and cone selection; Shengguang/Tianshi use canonical ally shield selection; Fuwenbianzhi and Dushe use target root contracts; Xueyue uses self-shield plus dash-blast; Tiemu uses target stun plus delayed area-root; Yingsi uses targeted blink-strike plus delayed area-root.

All eight heroes remain opt-in and compile only from `heroDatabase.skills[slot].gameplay`. Summons, clones, revive, cleanse, global buffs, and true invulnerability are intentionally not represented by a look-alike primitive. This keeps gameplay semantics reviewable before the remaining roster is authored.

## Ninth slice contract additions（2026-09-20）

The ninth slice moves the opt-in compiler/runtime to **148/400 explicit QWER slots across 62 gameplay-authored heroes**. Liangzi, Zhanchang, Shiqiang, Fengshen, Mingyun, Xukong, and Longyi use validated piercing, blink, ally-shield, control, dash-knockup, area-control, delayed-area, team-shield, shield-burst, and cone mechanics.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; the renderer receives only named effect events and presentation metadata. The 16 new motifs use quantum lanes, medical pulses, stone rectangles, wind diagonals, fate grids, void gates, and dragon fans. They reuse pooled shader commands and the no-fullscreen-pass mobile budget.

Pure/browser/protected gates are green: gameplay 53/53, Phase1 10/10, Round2 162/162, Workshop 518/518, formal battle 5/5, protected 9/9, build PASS, and diff check PASS. Unsupported global reveal, cleanse, invulnerability, and structure-wall semantics remain un-authored rather than being silently mapped.

## Tenth slice contract additions (2026-09-20)

The tenth slice moves the opt-in compiler/runtime to **164/400 explicit QWER slots across 67 gameplay-authored heroes**. Leisuhunter Q/W, Jingci Q/W/E/R, AnliuyouXia Q/W/E, Xingjie Q/W/E, and Lieyan Q/W/E/R reuse projectile, blink-strike, root-dot, area-root, self-shield, shield-burst, delayed-area, area-control, dash-wall, and existing dash contracts.

The TDD finite audit found four shield contracts without the required common `range` field and a presentation-only `firewall` dash pose omission. These were fixed in the canonical data/choreography paths. No new authority family, balance number, seed, baseline, simulation version, Item, Fairness, BattleResult, or Replay contract was changed.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; the renderer receives only named effect events and presentation metadata. The new lightning, bramble, undertow, astral/gravity, and prophet-fire motifs reuse pooled analytic shader/material commands with no fullscreen post pass. Pure/browser/protected gates are green: gameplay 54/54, Phase1 10/10, Round2 178/178, Workshop 568/568, formal battle 5/5, protected 9/9, build PASS, and diff check PASS.

## Eleventh slice contract additions (2026-09-20)

The eleventh slice moves the opt-in compiler/runtime to **180/400 explicit QWER slots across 72 gameplay-authored heroes**. Shengdun Q/W/E/R, Guangsu Q/W/E, Siwang Q/W/E, Xuanfeng Q/W/E, and Tiebi Q/W/E reuse dash-knockup, shield-burst, taunt-guard, team-shield, multi-strike, blink-shield, piercing-line, projectile, cone, delayed-area, dash-control, targeted-ally-shield, and area-root contracts.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; the renderer receives only named effect events and presentation metadata. Sanctum, prism, deathmark, cyclone, and bulwark motifs reuse pooled analytic shader/material commands with no fullscreen post pass. Unsupported invisibility, random swap, global targeting, and true-invulnerability semantics remain un-authored. Pure/browser/protected gates are green: gameplay 55/55, Phase1 10/10, Round2 194/194, Workshop 617/617, formal battle 5/5, protected 9/9, build PASS, and diff check PASS.

## Twelfth slice contract additions (2026-09-20)

The twelfth slice moves the opt-in compiler/runtime to **196/400 explicit QWER slots across 80 gameplay-authored heroes**. Tielian Q/W, Yeiren Q, Wuxing Q/E, Hundun Q/E, Shensheng Q/W/E/R, Shiguang Q/W, Huanjing Q/W, and Xuemai Q reuse root-target, self-shield, multi-strike, control-target, blink-strike, delayed-area, projectile, blink-shield, targeted-ally-shield, and root-dot contracts.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; the renderer receives only named effect events and presentation metadata. Chainsteel, nightblade, phasevoid, chaos, sanctilight, chronos, dream, and bloodline motifs reuse pooled analytic shader/material commands with no fullscreen post pass. Unsupported invisibility, global time stop, random swap, ally rewind, shared-health, and clone semantics remain un-authored. Pure/browser/protected gates are green: gameplay 56/56, Phase1 10/10, Round2 210/210, Workshop 666/666, formal battle 5/5, protected 9/9, build PASS, and diff check PASS.

## Thirteenth slice contract additions (2026-09-20)

The thirteenth slice moves the opt-in compiler/runtime to **212/400 explicit QWER slots across 85 gameplay-authored heroes**. Tiankong Q/R, Ronggang Q/W/R, Bingshouweis Q/W/E/R, Jufeng Q/E/R, and Leimingcf Q/W/E/R reuse dash-knockup, delayed-area, control-target, self-shield, area-control, dash-control, area-taunt-guard, cone-strike, dash-strike, multi-strike, and dash-blast contracts.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; the renderer receives only named effect events and presentation metadata. Skyknight, moltensteel, frostguard, cycloneiron, and stormfist motifs reuse pooled analytic shader/material commands with no fullscreen post pass. Unsupported permanent freeze, immunity, and true multi-target traversal semantics remain un-authored. Pure/browser/protected gates are green: gameplay 57/57, Phase1 10/10, Round2 226/226, Workshop 719/719, formal battle 5/5, protected 9/9, and build PASS.

## Fourteenth–fifteenth slice contract additions (2026-09-20)

The opt-in compiler/runtime now covers **244/400 explicit QWER slots across 99 gameplay-authored heroes**. The two slices add Youming, Shanying, Dadi2, Mingyun2, Haixiao, Jueying, Tianfa, Shengyan, Liangzicz, Mori, Shengming, Tieshixin, Mingyunyindao, and Linghun. They reuse validated silence, blink-strike, dash-wall, area-control, root-target, root-dot, projectile, line, multi-strike, control-target, self-shield, and targeted-ally-shield contracts; no new balance or simulation version was introduced.

The authority boundary is unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot events; `HeroVfxRuntime` receives named events and never decides gameplay. Unsupported penetration bypass, stealth/random movement, full-field maze, stat-mirroring link, immunity, and other global clauses remain explicit non-authoritative gaps rather than inferred behavior. Pure/browser/protected gates are green: gameplay 59/59, Phase1 10/10, Round2 258/258, Workshop 816/816, formal Battle 5/5, protected 9/9, build PASS. `heroSkillsV1=false` remains OFF.

## Sixteenth slice contract additions (2026-09-20)

The opt-in compiler/runtime now covers **260/400 explicit QWER slots across 99 gameplay-authored heroes**. This slice adds Ironclad R; Thornwall W/R; Ravager W; Cinderfist Q/R; Sting W; Embercoil W; Gambler Q/E; Razorwing R; Phantom R; Dawnstrike W/R; Luminary W; and Kuangfeng E. All compile through existing validated area-control, area-root, self-shield, delayed-area, multi-strike, dash-control-strike, blink-shield, piercing-line, targeted-ally-shield, and related primitives.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot/Replay tuples; `HeroVfxRuntime` receives named events and never decides gameplay. Two presentation slots (Ironclad R and Cinderfist Q) replace prior preview motifs; the other 14 authored visual additions use pooled line/part/crack/shard commands and no fullscreen post pass. Unsupported stealth/random movement, persistent link/stat mirroring, maze, immunity, and other global clauses remain explicit gaps.

TDD first observed the expected gameplay count red (`244 !== 260`), then the dash actor symmetry invariant caught the missing `razorwing-hunt4` pose registration; adding it restored the generic dash contract without changing gameplay authority. Verification is green: gameplay **60/60**, Phase1 **10/10**, Round2 **272/272**, Workshop **863/863**, formal Battle **5/5**, protected **9/9**, build PASS, and diff check PASS. `heroSkillsV1=false` remains OFF; no commit, push, or deploy.

## Seventeenth implementation slice: marks, heals, and ally movement (2026-09-20)

The opt-in compiler/runtime now covers **271/400 explicit QWER slots across 99 gameplay-authored heroes**. This slice adds `target-mark` (Dawnstrike E, Yueying W, Maestro E, Hanbing E), `target-heal` (Shengguang Q, Zhanchang Q), `area-heal` (Shengguang E), and `ally-blink` (Hexweave E, Anliuyouxia R, Zhanchang R, Huanjing E). Mark state is expiring, source-aware, snapshot-visible, and affects later authored damage; healing uses the existing hp/heal accounting; movement mode is explicit rather than inferred from VFX.

The Golden Set is **273 motifs across 99 visual heroes**. New presentation uses sun/moon/sonic/frost marks, radiant and medic mends, a radiant lattice field, hexweave/undertow gates, medic charge, and dreamstep trails. All use the existing pooled line/part/crack/shard path; no fullscreen post pass, per-frame material allocation, balance change, simulation version change, or VFX-owned gameplay was introduced.

TDD first observed the expected red count (`260 !== 271`); behavior tests then locked mark status/damage factor/snapshot, target and area heal accounting, and both ally movement directions. Verification: gameplay **64/64**, Phase 1 **10/10**, Round2 **283/283**, Workshop browser **898/898**, formal Battle **5/5**, protected MOBA gates **9/9**, build PASS, and diff check PASS. `heroSkillsV1=false` remains OFF; no commit, push, or deploy. Remaining scope is **129 slots**; full skill-ON balance, Replay compatibility closure, old-VFX replacement audit, unsupported global semantics, and real-device performance remain open.

## Eighteenth implementation slice: empowered basic-attack primitive (2026-09-20)

The opt-in compiler/runtime now covers **281/400 explicit QWER slots across 99 gameplay-authored heroes**. This slice adds `empowered-strike` for ten slots. It stores an expiring, source skill-aware one-shot on the caster; the next valid basic attack consumes the bonus damage/power ratio in the authoritative combat path. Snapshot exposes the remaining status and the named FX event, while VFX never owns damage, target selection, or consumption.

The Golden Set is **283 motifs across 99 visual heroes**. The new visuals use steel wedges, rage spikes, shadow needle, execution cross, sonic staff, chance diamond, lightning forks, fate constellation, bastion panels, and judgment spear. All reuse pooled line/part/crack/shard commands and analytic shader/material pools; no fullscreen post pass, per-frame material allocation, balance change, simulation version change, or fallback promotion was introduced.

TDD first observed the expected count red (`271 !== 281`); behavior tests then locked expiry, snapshot visibility, one-shot consumption, and damage ownership. Verification: gameplay **66/66**, Phase 1 **10/10**, Round2 **293/293**, Workshop browser **936/936**, formal Battle **5/5**, protected MOBA gates **9/9**, build PASS, and diff check PASS. `heroSkillsV1=false` remains OFF; no commit, push, or deploy. Remaining scope is **119 Gameplay slots**; full skill-ON balance, Replay compatibility closure, old-VFX replacement audit, unsupported global semantics, and real-device performance remain open.

## Nineteenth / completion slice: all 100 heroes (2026-09-21)

The opt-in compiler/runtime now covers **400/400 explicit QWER slots across all 100 heroes**, with **400/400 authored presentation motifs**. Batches 20–24 complete the remaining contracts using existing shared primitives and authored shape/action language; no second Hero/Skill database was introduced. The final motifs include orbit, veil, null, chaos, overdrive, decree, skywheel, rewind, stasis, rally, dreamcourt, transfusion, resonance, molten, armor, phase, harvest, mirror, breach, tide, avatar, maze, catalyst, accelerator, and fusion families.

The authority boundary remains unchanged: `LogicEngine` owns target selection, timing, damage, control, movement, and snapshot/Replay identity; the runtime compiler consumes explicit `heroDatabase.skills[slot].gameplay`; `HeroVfxRuntime` receives named events and never decides gameplay. `heroSkillsV1=false` remains OFF, so the formal production battle still uses the existing path. Legacy `role:basic` / `role:power` and positional fallback effects were not mass-deleted; they remain compatibility/comparison paths pending the separate replacement audit.

The five required skills were applied together: `threejs-gameplay-systems` for deterministic contracts and ownership, `create-game-vfx` for readable pooled effects and spawn/cleanup caps, `threejs-shaders` for reused instanced analytic materials, `threejs-postprocessing` for the bounded existing composer budget, and `threejs-aaa-graphics-builder` for authored silhouette/material/action language. No new fullscreen pass or per-frame material allocation was added.

Current evidence: all batch gates are green, full gameplay slice **68/68**, Phase 1 **10/10**, Round2 pure **410/410**, Workshop browser **1339/1339**, formal Battle browser **5/5**, regress **15/15**, regress2 **20/20**, and build PASS. Flat `runtime29` main assertions are **35/35 PASS**; its 9 nested verifier entries are explicitly SKIP/delegated by flat-mode design. `presentation29b2` is **12/12 PASS**, `controls29b3` is **18/18 PASS**, and pacing remains the known **24/25** baseline waiver. Real-device FPS/touch/thermal remains unmeasured; full skill-ON balance, Replay closure, and legacy replacement audit remain follow-up work.
