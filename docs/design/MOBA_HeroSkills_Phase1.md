# Hero Skill / VFX Phase 1（本機候選，未發布）

## Baseline 與範圍

- 分支 `feature/moba-hero-skills-phase1`，worktree `worktrees/moba-hero-skills-phase1`，起點 `dc520f1`。
- 本機 main `d5311b1` 是 P0-A；origin/main `dc520f1` 含其後七筆 P0-B/C/D 與發布提交，沒有分叉。原工作目錄 `milestone-n-finance` 的使用者 WIP 完全保留。
- 不改引擎、傷害、命中、CC、Balance、Item、Fairness、simulation version、BattleResult、Replay wire format、Competitive flag；不 push/deploy。

## Audit 裁決

`heroDatabase` 已有 100 英雄、技能文字及 skillData，但 skillData 是相同模板，不是 100 套經驗證玩法。現行引擎以 role:basic/power 表達攻擊演出；不是完整 QWER 施法結果。因此本階段不將 power 冒充指定技能，也不據文字推算傷害。

既有正式 VFX 是 `MobaRuntimeEffects` + 疊加 `HeroSkillEffects`。新正式英雄攻擊只走 `HeroVfxRuntime`；舊格式仍由最小 adapter 接受，匿名攻擊只用中性攻擊視覺，不走定位 fallback。無有效座標的資料不渲染，不猜命中。

## 唯一資料流

`heroDatabase.skills[slot].presentation → compileHeroSkill → immutable HeroSkill.v1 → preview event → sampleSkillEvent → HeroVfxRuntime`

正式 Battle / Replay：`既有 snapshot.fx → adaptEffects → adaptHeroAttack → HeroVfxRuntime`。

- Contract：stable heroId:slot、canonical skill name、version、readiness、primitive、視覺 duration/radius。`gameplayEnabled=false`。
- Runtime：absolute-time sample，可倒帶、暫停、到期；不累积粒子 history，不呼叫 simulation RNG，不寫 Store。
- 未來 gameplay runtime 應由引擎解析 cast / travel / resolved-hit / status 的權威事件再交給 renderer；本階段**尚未實作或啟用 QWER gameplay executor**。
- 不另建 hero/skill database；generic primitive code 不依 hero ID 分支。

## Golden Set / 共用 primitives

| 英雄 | 演出 | 覆蓋 |
|---|---|---|
| 鋼鐵衛士 ironclad | Q / R | dash / ground |
| 炎拳 cinderfist | Q / W | burst / shield |
| 冰霜術士 bingshuang | Q / R | projectile / aura |
| 雷霆神射 leiting | Q / R | beam / burst |
| 大地守衛 dadi | Q / W | ground / shield |
| 赤炎武神 chichuan | W / E | aura / dash |

三個固定 instanced pools：地面符紋、Fresnel shield、facet trail/shard。符紋／碎片高畫質每 pool 384、省電 96；透明護盾獨立上限 24／8，避免 overdraw。超額丟棄視覺，不改 gameplay。資源由 R3F 卸載釋放。減少動態只保留靜態地面標記。duration/radius 僅視覺單位，不是遊戲施法／範圍參數。

產品補充：絢麗但克制。靠主體輪廓、分段拖尾、護盾 rim 與刻紋產生層次，不用全場 Bloom／動態燈／螢幕震動。三個 front-side instanced mesh 讓新 VFX 最多三個 draw submissions；粒子密度與 instance 數有固定上限。這是資源預算，不是「手機 FPS 已達標」的宣告。

每個效果：owner=事件來源、trigger=已解析事件或明示 preview、cleanup=事件 duration 到期／unmount、meaning=演出而非命中宣告。輪廓：projectile/beam/dash 方向性 trail；burst 擴散；ground 升起碎片；shield 包覆；aura 持續地面圖樣。未知攻擊只呈現移動與抵達，不宣告傷害或控制成功。

## 舊系統 replacement audit

- **已移除正式掛載**：`MobaRuntimeView3D → HeroSkillEffects` 疊加層。
- **已停止正式英雄消費**：`MobaRuntimeEffects` 對 role:basic/power 的分流，exclusive ownership 由同一 predicate 保證。
- **暫不能整檔刪**：MobaRuntimeEffects 還負責塔／小兵／中立／召喚師；skillVisualFor 舊欄位仍供這些既有消費端與相容 verifier 使用。
- `HeroSkillEffects` 目前僅由 debug 比較頁使用；移除比較頁後可一併刪除。沒有兩套正式英雄 VFX renderer。
- `heroPresentationAdapter`／heroCombatPresentation 尚供舊 Replay 描述、HUD 演出分類與 debug 使用；不能直接刪。HUD 原有聲明維持不宣稱真實 QWER。
- 引擎 `rng()<0.2` 的 power 產生順序不能因視覺淘汰而刪除，避免改变 deterministic sequence。

## 預覽與驗證

開發：`npm ci --legacy-peer-deps`（沿用部署方式，不變更 lockfile），`npm run dev -- --host 127.0.0.1 --port 5481 --strictPort`。

網址：`http://127.0.0.1:5481/ESMO-/?debug=hero-skills`。僅 DEV route；新舊比較是「舊定位演出 vs 新技能 preview」，不是假裝同技能同語意。模型是測試標記，不是已完成英雄 art。

驗證工具：`check_hero_skills_phase1.mjs`、`browser_check_hero_skills_phase1.mjs`、`browser_check_hero_skills_battle.mjs`。截圖 `tmp/hero-skills/`；flat runner 完整 stdout/stderr `tmp/verify-logs/`、checkpoint `tools/.verify-state.json`。禁止 commit 這些 artifacts。

真機觸控、FPS/耗電、實機高密度團戰可讀性未驗收；headless 不代表真機。未重跑 n=1000；使用 P0 invariants、seed608、regress、deterministic/version gates，且 protected simulation 檔案與正式 baseline 完全相同。

## 後續分批（本輪不實作）

### 驗證收尾（2026-09-20）

| 檢查 | 結果 |
|---|---|
| 新 Contract / replacement / immutable / replay tuple | 10/10 PASS |
| Golden Set browser（含釋放、40重疊、透明體上限、四種手機寬度） | 27/27 PASS |
| 正式 GameView：真引擎事件、新 VFX、無舊 identity layer | 5/5 PASS |
| L compatibility / same-seed | 80/80 PASS（過時 §71 修為真正換算函式測試） |
| regress / regress2 / runtime29 flat | 15/15、8/8、35/35 PASS |
| presentation29b2 / controls29b3 flat | 12/12、18/18 PASS |
| P0-A / P0-B / P0-C / P0-D | 8/8、14/14、PASS、PASS；seed608 2568s 自然結束 |
| simulationVersion | 51/51 PASS，未 bump |
| build / git diff --check | PASS |
| pacing29b1 | **24/25 FAIL，既有 baseline 問題，不視為綠燈或已豁免** |

Pacing g3 要求 15 分鐘 kills p50 ≥7，實測 6。`check_hero_skills_pacing_baseline.mjs` 對 dc520f1 唯讀正式 worktree 與候選使用同一組 20 seeds × 有／無戰術、DT=0.5、rules=v3，比對到失敗觀測點（900 秒）：40 組逐筆完全相同，兩邊 p50 都為 6。沒有更換 seed、規則或放寬 gate。這不是全 n=1000 重新公平統計；本輪沒有宣告發布全綠。

效能證據：40 個 dash 重疊，測試場景（含標記與 grid）仍 7 draw calls；low 1,584 triangles／high 3,888，geometry 8／texture 0。反覆新舊切換後數量不累積。這是桌機 headless 資源量，不等同手機 FPS。完整資料與截圖保存在 ignored `tmp/hero-skills/`。

### 下一批建議

先補 support 的 heal/status 與 assassin 的 target/arc，再加入 persistent zone、chain、summon；依 mechanic contract 分批，不逐英雄建立獨立系統。建議下一批 `shengming`（heal／shield）、`duskblade`（刺客方向性）、`lieyan`（持續區域）、`yanfeng`（遠程攻擊），先 audit 完整技能語意與 authoritative event，再啟用 gameplay。

## Skills 使用紀錄

`create-game-vfx`：容量、清理、減少動態、重疊驗證；`threejs-gameplay-systems` + `references/gameplay-workflows.md`：唯讀呈現／權威邊界；`threejs-shaders`：analytic sigil/Fresnel shader；`debugging-and-error-recovery`：區分缺依賴／測試 fixture 與產品錯誤。未做新遊戲、physics、combat feel 或全場後製，其他 reference 不適用。
## Latest continuation note (2026-09-20)

The phase1 contract remains unchanged, but the authored surface is now **27/400** across **15 heroes** with **34** bounded motifs. The latest six-hero expansion adds `dash-knockup-strike`, `dash-blast`, and `blink-strike`; formal `heroSkillsV1` remains OFF. Latest scoped verification is gameplay 41/41, Workshop 145/145, protected MOBA gates green, and build PASS. Existing pacing29b1 24/25 and simulation-version 50/51 blockers remain documented and unwaived.
## Current continuation: third authored slice (2026-09-20)

The Phase 1 branch now contains **43/400 authored QWER slots**, **21 heroes**, and **50 visual motifs**. The new six-hero set is Phantom, Mirrorshot, Mantra, Luminary, Stoneguard, and Hexweave. The shared runtime uses `cone-strike`, `area-root`, `control-target`, `targeted-ally-shield`, and `team-shield`; all remain behind `heroSkillsV1=false`.

Workshop evidence remains local under `tmp/hero-skills/round2/`, with preview at `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`. Pure checks are 43/43, 10/10, and 60/60; browser Workshop is 197/197; formal cast is 6/6; protected MOBA/Fairness gates are 3/3 and 6/6; build passes. Real mobile FPS is not measured. No commit, push, or deploy.

## Latest continuation: six more heroes (2026-09-20)

The branch now carries **62/400 authored QWER slots**, **27 heroes**, and **69 visual motifs**. `area-taunt` and delayed `area-control` are explicit shared primitives. Suishan, Tixue, Rongyan, Kuangfeng, Yueying, and Dianguang have authored slots where the current primitives are semantically honest; remaining stateful/terrain skills stay absent until their contracts are implemented.

Latest evidence: gameplay 45/45; Phase 1 10/10; pure Round2 79/79; Workshop browser 257/257; formal cast browser 6/6; protected runtime/regress 3/3; presentation/controls/P0-A/B/C/D 6/6; build PASS. `heroSkillsV1=false`; no commit/push/deploy; real-device performance remains unmeasured.

## Latest continuation: multi-strike / silence slice (2026-09-20)

The branch now carries **84/400 authored QWER slots**, **32 heroes**, and **89 authored visual motifs**. Duskblade, Voidrift, Anye, Jiansheng, Xingchen, and Leiting extend the explicit contract surface. `multi-strike` and `silence-target` are shared, validated mechanics; the engine owns deterministic hit scheduling and skill-only silence while VFX stays presentation-only.

## Sixth slice delivery note（2026-09-20）

The Golden Set is now **105 visual motifs across 38 visual heroes**, with the authoritative compile/runtime at **100/400 slots across 37 gameplay-authored heroes**. The new visuals deliberately separate the six heroes by action language: Maestro recoil and sonic lanes; Fengbao forged plates and charge; Shikong rectangular time prisms; Liuxing falling meteor lines; Longji segmented dragon charge/scales/tail/dive; and Binghe lances, slide trail, angular freeze cage, and diagonal glacier crash.

The renderer still uses bounded pooled commands and shared analytic shader materials. No fullscreen pass, per-frame material allocation, ring/sphere fallback, or VFX-owned gameplay decision was added. Workshop browser evidence is 373/373 PASS including mobile low-quality and reduced motion.

## Seventh slice delivery note（2026-09-20）

The Golden Set is now **121 motifs across 46 visual heroes**, while the authoritative compile/runtime covers **116/400 slots across 45 gameplay-authored heroes**. The new batch separates phantom salvos, radiant wards, angel wings, rune chains, bloodmoon leaps, iron fissures, venom spray, and silk cages instead of recoloring a shared circle.

All five requested skills remain active in their intended concerns: deterministic gameplay contracts, readable pooled VFX, reused analytic shader materials, explicit no-fullscreen post budget, and distinct bounded technical-art language. Browser evidence is 422/422 PASS; real-device FPS remains unmeasured.

Pure checks are gameplay **47/47**, Phase 1 **10/10**, and Round2 **99/99**. Workshop browser is **321/321** and formal authored cast is **6/6** after completing the Leiting Q projectile slow contract. Protected runtime/regress/regress2 is **3/3**, presentation/controls/P0-A/B/C/D is **6/6**, and build passes. `heroSkillsV1=false`; no commit, push, or deploy. Pacing29b1 remains the unchanged **24/25** baseline waiver and simulation fingerprint remains **50/51**. Real-device FPS/touch remains unmeasured.

## Eighth slice delivery note（2026-09-20）

The authoritative surface is now **132/400 QWER slots across 55 gameplay-authored heroes** and the Golden Set is **136 motifs across 55 visual heroes**. The new batch covers Langwang, Chichuan, Hunpo, Leiming, Ronghuo, Miwu, Jingxiang, Yanfeng, Hanbing, and Dujian. Their visual languages use directional bites, flame arcs/crashes, soul plating, marked thunder, mist fields, mirror cuts, phoenix dives/rain, frost pierce, and toxin volleys rather than generic layered circles.

The batch passed gameplay 52/52, Phase1 10/10, pure Round2 146/146, Workshop browser 467/467, formal cast 6/6, protected runtime/regression/presentation/controls/Fairness 9/9, and build. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Ninth slice delivery note（2026-09-20）

The authoritative surface is now **148/400 QWER slots across 62 gameplay-authored heroes** and the Golden Set is **152 motifs across 62 visual heroes**. The new batch covers Liangzi, Zhanchang, Shiqiang, Fengshen, Mingyun, Xukong, and Longyi. Its visual language ranges from quantum lances and medical crosses to stone fortresses, wind wings, fate grids, void gates, and dragon sweep fans.

The batch passed gameplay 53/53, Phase1 10/10, pure Round2 162/162, Workshop browser 518/518, formal battle 5/5, protected runtime/regression/presentation/controls/Fairness 9/9, and build. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Tenth slice delivery note (2026-09-20)

The Golden Set is now **168 motifs across 67 visual heroes**, while the authoritative compile/runtime covers **164/400 slots across 67 gameplay-authored heroes**. The new batch covers Leisuhunter, Jingci, AnliuyouXia, Xingjie, and Lieyan. Its visual language uses lightning slash/blink, bramble roots/forest, undertow charge/vortex, gravity well/astral step, and firewall/doomsday rain rather than a recolored circle stack.

TDD first observed the expected red count (`148 !== 164`, `152 !== 168`), then the finite audit corrected four missing shield `range` fields and the `firewall` dash pose registration. Pure gameplay is **54/54**, Phase 1 **10/10**, and Round2 **178/178**. Workshop browser is **568/568**, formal battle is **5/5**, protected runtime/regress/presentation/controls/Fairness is **9/9**, and build/diff checks pass. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Eleventh slice delivery note (2026-09-20)

The Golden Set is now **184 motifs across 72 visual heroes**, while the authoritative compile/runtime covers **180/400 slots across 72 gameplay-authored heroes**. The new batch covers Shengdun, Guangsu, Siwang, Xuanfeng, and Tiebi. Its visual language uses sanctum geometry, prism rails, deathmark slashes, cyclone fans, and iron bulwarks rather than a recolored circle stack.

TDD first observed the expected red count (`164 !== 180`, `168 !== 184`), then all five heroes compiled through existing validated primitives. Pure gameplay is **55/55**, Phase 1 **10/10**, and Round2 **194/194**. Workshop browser is **617/617**, formal battle is **5/5**, protected runtime/regress/presentation/controls/Fairness is **9/9**, and build/diff checks pass. Unsupported invisibility, random swap, global targeting, and true-invulnerability semantics remain un-authored. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Twelfth slice delivery note (2026-09-20)

The Golden Set is now **200 motifs across 80 visual heroes**, while the authoritative compile/runtime covers **196/400 slots across 80 gameplay-authored heroes**. The new batch covers Tielian, Yeiren, Wuxing, Hundun, Shensheng, Shiguang, Huanjing, and Xuemai. Its visual language uses chainsteel, nightblade, phasevoid, chaos, sanctilight, chronos, dream, and bloodline rather than a recolored circle stack.

TDD first observed the expected red count (`180 !== 196`, `184 !== 200`), then all eight heroes compiled through existing validated primitives. Pure gameplay is **56/56**, Phase 1 **10/10**, and Round2 **210/210**. Workshop browser is **666/666**, formal battle is **5/5**, protected runtime/regress/presentation/controls/Fairness is **9/9**, and build/diff checks pass. Unsupported invisibility, global time stop, random swap, ally rewind, shared-health, and clone semantics remain un-authored. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Thirteenth slice delivery note (2026-09-20)

The Golden Set is now **216 motifs across 85 visual heroes**, while the authoritative compile/runtime covers **212/400 slots across 85 gameplay-authored heroes**. The new batch covers Tiankong, Ronggang, Bingshouweis, Jufeng, and Leimingcf. Its visual language uses aerial dive/judgment, molten armor/cyclone, ice bulwark/permafrost, wind fan/assault, and lightning fist/run rather than a recolored circle stack.

TDD first observed the expected red count (`196 !== 212`, `200 !== 216`), then all five heroes compiled through existing validated primitives. Pure gameplay is **57/57**, Phase 1 **10/10**, and Round2 **226/226**. Workshop browser is **719/719**, formal battle is **5/5**, protected runtime/regress/presentation/controls/Fairness is **9/9**, and build passes. Permanent freeze, immunity, and true multi-target traversal semantics remain un-authored. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full balance, Replay compatibility, and legacy VFX replacement remain open.

## Fourteenth–fifteenth slice delivery note (2026-09-20)

The Golden Set is now **248 motifs across 99 visual heroes**, while authoritative compile/runtime covers **244/400 slots across 99 gameplay-authored heroes**. The two slices use spectral/shadow/earth/fate/tide/judgment/sanctifire, then quantum/doomsday/lifeline/ironheart/fate-guide/soul-resonance shape languages. They mix piercing rails, retreat trails, cracked ground, tether lines, multi-shot fans, anchored slabs, and support wards instead of another generic circular template.

TDD first observed the expected red count (`228 !== 244`), then all 14 heroes compiled through validated shared primitives. Pure gameplay is **59/59**, Phase 1 **10/10**, and Round2 **258/258**. Workshop browser is **816/816**, formal Battle is **5/5**, protected runtime/regress/presentation/controls/Fairness is **9/9**, and build passes. `guihuo` remains intentionally un-authored for unsupported stealth/random-movement/link/maze semantics. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch remains unmeasured; full skill-ON balance, Replay compatibility, and legacy VFX replacement remain open.

## Sixteenth slice delivery note (2026-09-20)

The Golden Set is now **262 authored motifs across 99 visual heroes**, while authoritative compile/runtime covers **260/400 slots across 99 gameplay-authored heroes**. The 16-slot gameplay batch reuses validated shared contracts; two existing preview slots were replaced visually, so the visual count increases by 14. New silhouettes emphasize steel cross-cracks, flame linear impact, radial trap spokes, hunter dual rails, shadow rain, recoil afterimages, judgment rails, and armor lattices rather than another circular template.

TDD first observed `244 !== 260`; after implementation, the dash actor test found and fixed the missing `razorwing-hunt4` pose registration. Pure gameplay is **60/60**, Phase1 **10/10**, and Round2 **272/272**. Workshop browser is **863/863**, formal Battle **5/5**, protected MOBA gates **9/9**, and build/diff checks pass. Preview remains `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`; representative captures are in `tmp/hero-skills/round2/`. `heroSkillsV1=false`; no commit, push, or deploy. Real-device FPS/touch/thermal, full skill-ON balance, Replay compatibility, and legacy VFX replacement remain open.

## Seventeenth slice status (2026-09-20)

Coverage is now **271/400 gameplay slots** and **273/400 presentation motifs**, each across 99 heroes. The shared runtime families are `target-mark`, `target-heal`, `area-heal`, and `ally-blink`; `guihuo` remains deliberately un-authored instead of receiving a role fallback. The formal flag is still OFF.

The Workshop preview remains at `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`; new evidence includes `dawnstrike-E-burst.png`, `shengguang-E-burst.png`, `hexweave-E-burst.png`, and `anliuyouXia-R-burst.png` under `tmp/hero-skills/round2/`. Gameplay 64/64, Phase1 10/10, Round2 283/283, browser 898/898, formal Battle 5/5, protected 9/9, build and diff checks pass. Real-device FPS/touch/thermal and full skill-ON balance remain unmeasured/open.

## Eighteenth slice status (2026-09-20)

Coverage is now **281/400 gameplay slots** and **283/400 presentation motifs**, each across 99 heroes. `empowered-strike` is the new shared primitive: an expiring one-shot basic-attack empowerment consumed by the authoritative engine, with snapshot status and passive named-event VFX; `guihuo` remains deliberately un-authored.

The Workshop preview remains at `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`. Gameplay 66/66, Phase1 10/10, Round2 293/293, browser 936/936, formal Battle 5/5, protected 9/9, build and diff checks pass. The five-skill workflow remains active; no fullscreen post pass or per-frame material allocation was added. Real-device FPS/touch/thermal and full skill-ON balance remain unmeasured/open.

## Full-roster completion status (2026-09-21)

The phase-one implementation now covers **400/400 authoritative Q/W/E/R contracts and 400/400 authored presentation motifs for all 100 heroes**. Batches 20–24 complete the remaining roster without creating a second hero database, changing Item v1/Fairness contracts, or enabling the formal flag. All five required skills were used across the contract, pooled VFX, shader, post budget, and AAA technical-art concerns.

Evidence is **68/68 gameplay**, **10/10 Phase 1**, **410/410 pure Round2**, **1339/1339 Workshop browser**, **5/5 formal Battle browser**, **15/15 regress**, **20/20 regress2**, and build PASS. `heroSkillsV1=false` remains OFF. The preview is `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`; representative captures are under `tmp/hero-skills/round2/`. Real-device FPS/touch/thermal, full skill-ON balance, Replay closure, unsupported global semantics, and old-VFX replacement audit remain open.
