# Hero Skills Workshop 第二輪（2026-09-20，本機未發布）

承接 [Phase 1](MOBA_HeroSkills_Phase1.md)，同一開發 worktree；僅視覺／Workshop 動作，不改引擎、Fairness、Item、Replay wire format 或 simulation version。以下覆蓋第一輪的視覺設計與預算描述，不改歷史驗證紀錄。

## 六英雄十二演出

| 英雄 | 技能形狀／動作 |
|---|---|
| 鋼鐵衛士 | Q 重型衝鋒、履跡、落點碎片；R 躍起／落劍／十字裂痕 |
| 炎拳 | Q 蓄拳後扇錐烈焰；W 分片熔岩甲、裂隙餘燼 |
| 冰霜術士 | Q 狹長冰槍；R 聚晶、落冰、向外冰稜 |
| 雷霆神射 | Q 折線電弧；R 定位角標、垂直雷擊、分岔電痕 |
| 大地守衛 | Q 逐段裂地／突岩；W 依序升起的岩石壁壘 |
| 赤炎武神 | E 前衝、殘影、火尾與落點；W 雙側鳳凰焰翼 |

第二輪十二招不使用 ring／sphere pool；Q/W/E 使用清楚單一方向或輪廓，R 有前搖、主爆發、餘波。英雄元素色與 motif 仍存於唯一 `heroDatabase` presentation metadata；`visualRevision=2` 不是 simulation 版本。

## 共用架構與比較

- `skillChoreography.js`：pure absolute-time emitter，共用線段、裂痕、碎片、火焰 primitive；無 hero ID 分支、simulation RNG 或 Store 寫入。同時輸出 Workshop actor pose，移動與特效取相同事件時間。
- `HeroVfxRuntime`：同一正式 renderer，新增 slab 與 analytic flame pools。`adaptHeroAttack` 明確清除 preview visual metadata，正式匿名攻擊不冒充 QWER。
- `Round1Vfx` 僅 DEV 比較；`HeroSkillEffects` 仍只供更早定位效果比較。不是兩套正式 Battle renderer。
- 「比較第一輪」保持同技能／同時間；「比較舊效果」是原定位演出，語意不同，不能當作同一技能的 gameplay 證據。
- 「前搖／主爆發／餘波」可固定觀察；位移角色是 Workshop 測試模型，不是修改權威英雄座標。真正 QWER gameplay executor 仍未啟用。

## 效能及可及性

固定五 pools，第二輪只用其中三個。普通 instance 每池 low=96／high=384；flame 獨立 low=48／high=128；歷史 sphere 仍為 8／24。火焰雙面 single-pass；不加 bloom、動態燈、每幀 geometry/material 或 simulation 負擔。超額只丟視覺。

40 重疊四類效果、兩畫質：含測試角色／場景共 10–12 draw calls，最高 7,764 triangles。反覆切換資源不累積；不是手機 FPS 認證。減少動態保留靜態 slab/線標記，停用 actor 位移及 flame。320/360/390/430px 無水平溢出；真機 FPS／耗電／觸控與團戰可讀性未實測。

## 驗證

- `check_hero_skills_round2` 17/17：12招可見階段、容量、有限值、重複採樣一致、mirror、pose、減少動態、正式 adapter 隔離。
- `browser_check_hero_skills_round2` 61/61：12×3 階段、同時間比較、位移、40重疊、資源釋放、手機寬度、console/shader。
- 第一輪比較 browser 重跑 27/27；正式 Battle browser 5/5（真引擎事件、新 renderer、無舊 identity 掛載、無 page/shader errors）。預覽 HTTP 200、git diff --check PASS。
- flat runner 本輪 14/14 區段 PASS：Round2、Phase1、L、regress、regress2、runtime29、presentation29b2、controls29b3、P0-A/B/C/D、simulation_version、build。不是整份 runner 全數通過；未重跑 n=1000。
- 第一輪已確認的 `pacing29b1` 24/25 baseline FAIL（HS-P1-G1）仍有效，未豁免、未調整門檻，本輪不重跑該長統計。
- 初次 Round2 browser 揭露 charge-stomp／fault-line／flame-dash 前搖無可見 effect；先加 pure failing assertion，再補短裂線／方向碎片，重跑 17/17、61/61。
- 第一輪 stress harness 原本依 wall-clock 觀察，技能已到期，讀到零 instances；改用固定「主爆發」時間，不移除非零與容量斷言。場景新增測試角色後，draw ceiling 12→13，與場景幾何改動對應；不改 gameplay gate。

本機：`http://127.0.0.1:5481/ESMO-/?debug=hero-skills`。
36 張階段實際截圖、手機截圖及 evidence：`tmp/hero-skills/round2/`（ignored，不 commit）。

## Skills 紀錄

`create-game-vfx` 用於容量／清理／readability；`threejs-gameplay-systems` 的 gameplay-workflows、game-feel、checklists/game-feel 用於前搖、位移、落點與權威隔離；`threejs-shaders` 用於 analytic flame。`debugging-and-error-recovery` 用於三招前搖缺口及 harness 時間問題。沒有新增 physics、audio、hitstop 或 camera shake，不宣稱完整 game-feel checklist 已通過。

未 commit／push／deploy，未開始下一批英雄。
## Latest visual continuation (2026-09-20)

The Workshop now covers **34** motifs across **15** heroes. The new batch uses asymmetrical cleaves, landing cracks, afterimage steps, serpent chains, ice lattice/spike silhouettes, and feather guard lines; it adds no ring/sphere templates or fullscreen post pass. Round2 pure is **44/44** and browser is **145/145**; low-quality/reduced-motion paths remain bounded. Real-device FPS is still unmeasured.
## Latest visual continuation: six-hero shape-language slice (2026-09-20)

The Workshop now covers **50 motifs across 21 heroes** and **43/400 authored QWER slots**. This slice deliberately avoids another ring template: Phantom uses ghost blink/volley cuts; Mirrorshot uses a piercing lane and fan; Mantra uses halo beam/link, sanctum break, and a grid; Luminary uses starbind, starfall, and constellation guard; Stoneguard uses granite fist and fault bloom; Hexweave uses a snare, ward, and domain. Q/W/E remain readable; R has separate windup, burst, and aftermath silhouettes where authored.

All motifs reuse the pooled instanced shader/material path, low-quality caps, reduced-motion footprints, and no fullscreen post-processing pass. `threejs-shaders` informs the analytic/instanced materials, `create-game-vfx` the readability/pooling rules, `threejs-postprocessing` the explicit pass budget, and `threejs-aaa-graphics-builder` the distinct shape/action language. `threejs-gameplay-systems` keeps visual timing driven by authoritative gameplay events. Browser Workshop: **197/197**; pure Round2: **60/60**. Images are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Latest visual continuation: six elemental/action languages (2026-09-20)

The Workshop now covers **69 motifs across 27 heroes** and **62/400 authored QWER slots**. New motifs are `mountain-charge`, `stone-roar`, `earth-lift`, `mountain-impact`, `cavalry-lance`, `iron-rebound`, `shield-push`, `lava-fist`, `molten-shell`, `magma-eruption`, `cyclone-sweep`, `gale-dash`, `vortex-domain`, `crescent-cut`, `moonstep`, `lunar-hunt`, `volt-stab`, `arc-retreat`, and `afterimage-flash`. The shapes use charge lanes, slab/plate silhouettes, rising eruption shards, moving gust lines, crescent cuts, and voltage afterimages instead of another circular template.

They reuse the pooled shader/material path, reduced-motion footprint, low-quality caps, and no fullscreen post pass. The five-skill workflow remains explicit: gameplay systems own event timing, create-game-vfx owns readability/caps, shaders own analytic instancing, postprocessing owns the pass budget, and AAA graphics guidance owns the per-hero shape/action language. Pure Round2: **79/79**; Workshop browser: **257/257**. Preview images are in `tmp/hero-skills/round2/`; real-device FPS remains unmeasured.

## Latest visual continuation: shadow / void / night / sword / stardust / thunder (2026-09-20)

The Workshop now covers **89 authored motifs across 32 heroes** and the authoritative gameplay surface is **84/400 QWER slots**. Duskblade uses flurry/bind/clone-dive silhouettes; Voidrift uses cleave/pulse/phase-cross/rend; Anye uses night blades and a verdict strike; Jiansheng uses sword arcs, parry slabs, and a world-edge cut; Xingchen uses starlance/rain/guard/astral arrow; Leiting uses thunder round/dash/skyfall. These are shape/action languages rather than recolored ring templates.

## Sixth workshop slice（2026-09-20）

The workshop now covers 105 authored motifs. The sixth slice keeps Q/W/E readable and directional, while giving R skills explicit windup → main burst → aftermath where their recipe requires it. New motifs intentionally use slabs, cross-lines, prisms, falling streaks, segmented trails, angular cages, and crack lines instead of another generic circular stack.

Browser evidence: **373/373 PASS**, with no page or shader errors, no overflow at 320/360/390/430px, reduced-motion footprint stability, and unchanged low/high overlap caps. The larger screenshot evidence set required a 360s harness wall-clock budget; assertion and performance thresholds were not changed. Representative captures are in `tmp/hero-skills/round2/`.

## Seventh workshop slice（2026-09-20）

The Workshop now covers **121 motifs**. The new batch uses phantom bullet lines, fan scatter, slab wards, rune chains, iron cracks, venom arcs, and silk cages; `silk-cage` also passed the finite/deterministic audit after correcting a missing width argument in its line emitter. Browser evidence is **422/422 PASS**, with unchanged caps, reduced-motion behavior, mobile overflow checks, and no page/shader errors.

Q/W/E remain short and legible; R recipes expose windup, burst, and aftermath. All motifs reuse the pooled instanced analytic shader/material path, low-quality caps, reduced-motion footprints, and no fullscreen post-processing pass. The five-skill workflow remains explicit: `threejs-gameplay-systems` drives authoritative timing, `create-game-vfx` governs readability and caps, `threejs-shaders` supplies analytic instancing, `threejs-postprocessing` keeps the pass budget explicit, and `threejs-aaa-graphics-builder` governs distinct technical-art language. Pure Round2 is **99/99** and Workshop browser is **321/321**. Preview images remain in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Eighth workshop slice（2026-09-20）

The Workshop now covers **136 authored motifs across 55 visual heroes**. The new recipes use wolf bite, flame arc/crash, soul ward, thunder mark/oracle delay, magma shot, mist sting/field, mirror cut, phoenix arrow/dive/rain, frost pierce, and toxin volley/sting. They add directional, marked, delayed, and impact silhouettes instead of another ring recolor.

Browser evidence is **467/467 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **146/146** and formal authored cast is **6/6**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Preview images remain in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Ninth workshop slice（2026-09-20）

The Workshop now covers **152 authored motifs across 62 visual heroes**. The new recipes use quantum lance/blink, medical pulse, stone fist/break/fortress, wind bind/halo, fate bind/ward/field, void grasp/burst/rift/gate, and dragon sweep. They deliberately mix line, cross, rectangle, grid, gate, and fan silhouettes instead of reusing one circular template.

Browser evidence is **518/518 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **162/162** and formal battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Preview images remain in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Tenth workshop slice (2026-09-20)

The Workshop now covers **168 authored motifs across 67 visual heroes**. The new recipes use lightning slash/blink, bramble strike/armor/root/forest, undertow charge/shield/vortex, gravity well/astral guard/step, and oracle flare/flameguard/firewall/doomsday rain. They mix angular strikes, roots, fans, converging lines, dash walls, and falling impact streaks instead of another generic circular template.

Browser evidence is **568/568 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **178/178** and formal battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Eleventh workshop slice (2026-09-20)

The Workshop now covers **184 authored motifs across 72 visual heroes**. The new recipes use sanctified charge and crown geometry, prism volleys and railbursts, deathmark rounds and execution flurries, cyclone fans and vortex shots, and iron intercept/bulwark walls. They mix crosses, rails, fans, retreat vectors, target marks, slabs, and cracks instead of another generic circular template.

Browser evidence is **617/617 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **194/194** and formal battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Twelfth workshop slice (2026-09-20)

The Workshop now covers **200 authored motifs across 80 visual heroes**. The new recipes use chain links and iron shells, night flurries, phase pierces, chaos bursts, sanctilight rain, time wards, dream bindings, and blood tethers. They mix segmented chains, diagonal slashes, phase trails, burst lines, falling streaks, cross-locks, ally wards, and tethers instead of another generic circular template.

Browser evidence is **666/666 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **210/210** and formal battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Thirteenth workshop slice (2026-09-20)

The Workshop now covers **216 authored motifs across 85 visual heroes**. The new recipes use sky dive/judgment, molten strike/armor/cyclone, frost charge/bulwark/taunt/permafrost, cyclone sweep/dash/assault, and storm fist/shell/charge/run. They mix aerial lanes, falling streaks, angular armor, ice columns, fan cones, repeated slashes, and lightning zigzags instead of another generic circular template.

Browser evidence is **719/719 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **226/226** and formal battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Fourteenth–fifteenth workshop slices (2026-09-20)

The Workshop now covers **248 authored motifs across 99 visual heroes**. The two batches add spectral silence, shadow flurries, earth cracks, fate/undertow tethers, judgment recoil, sanctifire pierces, quantum rails, doomsday volleys, lifeline drains, ironheart anchors, fate-guide wards, and soul links. They mix lanes, cracks, tethers, retreat trails, multi-shot fans, slabs, and support lattices rather than another generic circular template.

Browser evidence is **816/816 PASS** with no page/shader errors, unchanged low/high overlap caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **258/258** and formal Battle is **5/5**. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance keeps shape/action language distinct. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS is still unmeasured.

## Sixteenth workshop slice (2026-09-20)

The Workshop now covers **262 authored motifs across 99 visual heroes**. The new visual work uses steel cross-cracks, a flame linear punch, radial trap spokes, hunter dual rails, shadow rain, recoil trails, solar judgment rails, and armor lattices. Ironclad R and Cinderfist Q replace prior preview motifs; the remaining 14 visuals are new authored slots. No ring/sphere recipe or fullscreen post-processing pass was added.

TDD found a missing `razorwing-hunt4` dash pose registration after the new recipes were added; the failing dash actor invariant was fixed by registering the motif in the shared Workshop pose path. Browser evidence is **863/863 PASS** with no page/shader errors, unchanged overlap/draw caps, reduced-motion behavior, and 320/360/390/430px overflow checks. Pure Round2 is **272/272**, formal Battle is **5/5**, protected MOBA gates are **9/9**, and build passes. The five-skill workflow remains explicit: Gameplay Systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance owns distinct shape/action language. Representative captures are in `tmp/hero-skills/round2/`; real-device FPS remains unmeasured.

## Seventeenth workshop slice (2026-09-20)

The Workshop now covers **273 authored motifs across 99 visual heroes**. The new batch avoids circle-template repetition with target marks, curved moon segments, waveform lines, frost shards, radiant/medic stitching, a lattice field, a six-sided hex gate, tide waves, a charge cross, and dreamstep echoes. Q/W/E remain readable and bounded; no fullscreen post-processing pass was added.

Browser evidence is **898/898 PASS**: no page/shader errors, 320/360/390/430px overflow checks, reduced-motion footprint stability, low/high overlap caps, and mobile draw limits. Pure Round2 is **283/283**, formal Battle is **5/5**, protected MOBA gates are **9/9**, and build/diff checks pass. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance owns distinct shape/action language. Evidence is in `tmp/hero-skills/round2/`; real-device FPS remains unmeasured.

## Eighteenth workshop slice (2026-09-20)

The Workshop now covers **283 authored motifs across 99 visual heroes**. The new batch uses steel valor wedges, ravager rage spikes, shadow needles, execution crosses, sonic staff lines, chance diamonds, lightning forks, fate constellations, bastion panels, and descending judgment spears. These are distinct action silhouettes rather than recolored circle templates; no fullscreen post-processing pass was added.

Browser evidence is **936/936 PASS**: no page/shader errors, 320/360/390/430px overflow checks, reduced-motion footprint stability, low/high overlap caps, and mobile draw limits. Pure Round2 is **293/293**, formal Battle is **5/5**, protected MOBA gates are **9/9**, and build/diff checks pass. The five-skill workflow remains explicit: gameplay systems owns authority, create-game-vfx owns readability/caps, shaders owns pooled analytic instancing, postprocessing keeps the no-fullscreen pass budget, and AAA guidance owns distinct shape/action language. Evidence remains in `tmp/hero-skills/round2/`; real-device FPS remains unmeasured.

## Full-roster visual completion (2026-09-21)

The Workshop now covers **400 authored motifs for all 100 heroes and all Q/W/E/R slots**. Batches 20–24 finish the roster with distinct orbit, null, chaos, overdrive, rewind, molten, phase, harvest, breach, tide, avatar, maze, and fusion vocabularies. The recipes continue to prefer lines, fans, cracks, slabs, tethers, gates, landing marks, and directional trails over stacked circles; R recipes retain windup/burst/aftermath where the contract calls for it.

The exhaustive browser gate is **1339/1339 PASS**, including all 400 motifs at exact-time stages, overlap/draw caps, reduced motion, mobile widths, and no page/shader/console errors. Pure Round2 is **410/410**; formal Battle is **5/5**. The five-skill workflow remains explicit, and no new fullscreen post pass or per-frame material allocation was added. `heroSkillsV1=false` remains OFF; preview remains `http://127.0.0.1:5481/ESMO-/?debug=hero-skills`, with representative captures under `tmp/hero-skills/round2/`.
