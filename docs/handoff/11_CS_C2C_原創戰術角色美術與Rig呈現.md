# CS-C2C 原創戰術角色美術與 Rig 呈現交接

> 狀態：`C2C_READY_FOR_FINAL_OWNER_ACCEPTANCE`（crash recovery final check complete；尚未 merge / push / deploy）
> 更新：2026-08-25

## 1. Background

CS P0 visual stability 已在 `07a86c740ac9302b9ec2e2ba3889a06684a7e2c0` 基線完成 Owner Android 驗收。
C2C 只處理 FPS character 的 presentation，不改 simulation、weapon stats、playback timing 或 result contract。

本輪採 one-character vertical slice：`Vector-9 / Signalbreaker`。未一次替換 10 人，也未建立第二套 skeleton、mixer 或 animation authority。

## 2. Hero Character：Vector-9 / Signalbreaker

### Art direction

- ESMO original stylized-realistic esports tactical operator。
- neutral graphite／polymer／fabric／metal 主體；Team Blue / Team Red 只出現在 shoulder patch、signal bars、comms light、equipment accents。
- tactical silhouette 元件：plate carrier、lower carrier、helmet shell、visor、headset、comms boom、gloves、boots、utility pouches、pistol／rifle presentation。
- 不是現實軍警單位複製品，不使用 Valve／CS2 ripped asset。

### Presentation architecture

```text
authoritative simulation
  → fpsAnimationState
  → FpsCharacterRenderer
  → existing 65-bone SkinnedMesh + AnimationMixer
  → C2C bone-mounted presentation kit
```

C2C kit 只新增掛件與材質；既有 `Idle / Walk / Run / Sprint / Aim / Fire / Hit / Death` clips 仍由原 controller 選擇與 mixer 播放。

## 3. Asset / License

| Item | Source | License / rule |
|---|---|---|
| base mesh + skeleton | existing `public/assets/fps/c2a/esmo-fps-character.glb` | Quaternius Universal Base Characters，CC0 1.0；修改允許，見 `public/assets/fps/c2a/LICENSE.md` |
| animation library | existing `public/assets/fps/c2a/esmo-fps-animation-library.glb` | 同上，既有合法 repo dependency |
| Vector-9 attachments | `src/battle/fps/presentation/fpsC2cHero.js` procedural geometry/materials | Original ESMO code-generated presentation kit；沒有外部 mesh、texture 或付費 asset dependency |

本輪沒有加入 Mixamo、新 binary model、來源不明 texture 或外部 URL。

## 4. Technical Contract

- skeleton：沿用 C2A verified 65 bones。
- animation：沿用一個既有 `AnimationMixer`；C2C 不讀寫 `fIdx`、simulation state 或 match result。
- attachment mount：`spine_03 / spine_02 / pelvis / Head / clavicle / hand / foot`，依 runtime model scale 自動 normalization，避免既有 GLB normalized scale 造成掛件放大。
- weapon mode：authoritative `player.gun` 只決定 rifle / pistol presentation；不改 weapon stats 或 gameplay。
- C2C 啟用：query opt-in，`fpsC2cHero=1` 只啟用 `t1`，`fpsC2cHero=all` 才啟用全 roster；未帶 flag 維持 C2A base presentation。
- disposal：新增 geometry/material 以 `esmoC2cOwned` 標記，由既有 controller lifecycle 回收。

## 5. Budget / Evidence

Hero runtime diagnostic：

- added triangles：`824`（budget `≤ 1800`）
- C2C materials：`8`（budget `≤ 8`）
- shared skeleton：`65 bones`
- 10-player opt-in renderer snapshot：`10` players、`10` rigged、`10` mixers、`706` render calls、`155232` triangles、`792` geometries、`70` textures。
- C2C screenshot capture：`artifacts/cs-c2c/vector9/front.png`、`quarter45.png`、`side.png`、`back.png`
- capture method：CDP `Page.captureScreenshot` canvas surface clip；不使用 headless WebGL `canvas.toDataURL` 作視覺證據，因該 path 可能產生假黑圖。

Browser vertical slice 已自動走：Home → Practice → Mirage → Battle，並確認 t1 rigged、C2C art mode、10/10 visibility、兩隊 5v5、camera rapid recovery `0`、browser/page errors `0`。

10-player desktop long-run：`180000 ms`、StableCanvasRegion shifts `0`、stale fIdx mismatch `0`、duplicate RAF `0`、duplicate render `0`、rapid camera recovery `0`、browser/page errors `0`。

## 6. P0 Regression Protection

C2C 不能破壞下列四條長期契約，且 static C2C gate 會檢查其 source markers：

1. `PLAYER_IDENTITY_VISIBILITY`：effectiveRoster identity 仍為 authoritative source；identity miss 不等於死亡。
2. `CAMERA_RECOVERY`：只有整隊 alive players 全部離開 viewport 才 recovery。
3. `STABLE_CANVAS_GEOMETRY`：HUD／roster 不得改變 StableCanvasRegion geometry。
4. `RAF_FIDX_FRAME_COHERENCE`：playback transition 先同步 `liveRef.current.fIdx`，再 commit React state。

Required gates：Renderer visibility、CS-A2 identity、C2A、C2B、CS23、Camera recovery、RAF coherence、StableCanvas geometry、production build。

## 7. Previously Avoided Scope

本輪沒有做：C3 map overhaul、veto、Competition UI、gameplay balance、weapon stat redesign、networking、Training、MOBA、R63 fast-finish、大型 `EsportsFPS3D` refactor。

## 8. Known Limitations / Next Owner Decision

- One hero uses the shared base mesh plus procedural presentation attachments；它是正式方向的 technical/art slice，不是 10 個獨立原創 sculpt。
- 10-player productization 已用 query opt-in path 保留，但在 Owner art direction acceptance 前不切換預設，也不替換全 roster。
- Node/browser gate 可驗證 geometry、identity、animation wiring、budget 與 browser errors；Android 真機 FPS／觸控與最終美術風格仍需 Owner 最終確認。

## 9. AI Handoff Rules

未來 Claude / Codex 修改 `EsportsFPS3D`、FPS playback、camera recovery、roster/player identity、Battle viewport layout 前，必須先讀：

- `docs/handoff/10_CS_P0_視覺穩定性與防回歸契約.md`
- 本文件

禁止用 freeze fIdx、skip simulation、disable PlayerRow、disable HUD 或另建 animation authority 來掩蓋問題。任何 C2C 擴張先通過 one-hero budget、animation compatibility 與四條 P0 contracts，再談 10-player productization。

## 10. C2C Phase 2：Tactical Equipment Polish + 10-Player Productization（2026-08-25）

### Owner direction

- `C2C_ART_DIRECTION = ACCEPTED_WITH_REVISION`：人體比例、人形、基礎 silhouette、Blue／Red readability 與整體 tactical esports 方向保留。
- 本階段不重做人體、不建立第二套 skeleton／animation authority；只補 clothing、equipment、weapon presentation 與可維護的 10-player variation。
- 退出狀態：`C2C_10_PLAYER_READY_FOR_OWNER_ACCEPTANCE`。美術最終 PASS 仍由 Owner 決定，本文件不自行宣稱 art pass。

### Clothing system

`fpsC2cHero.js` 在既有 65-bone model 上建立 bone-mounted layers：combat top panel、neckline／collar、torso seam、sleeve separation、tactical pants／waist、thigh／calf panels、knee structure、boots 與 gloves。這些 geometry 都以 `esmoC2cOwned` 標記，由既有 controller dispose 回收；沒有重建 base body 或改變 animation clip。

### Reusable equipment library

目前 library modules：plate carrier／lower carrier、helmet shell／visor／rail、headset／comms boom、shoulder patch／arm accent、magazine pouch、utility／grenade slot、pistol holster、radio／antenna、light／long rear pack、knee pad、gloves、boots。五個 visual-only profile 透過既有 player id／role 做 deterministic selection：`assault`、`support`、`marksman`、`lurker`、`utility`。它們不是 gameplay role system，不寫入 simulation、economy、weapon stats 或 result。

### Weapon presentation

- Rifle：stock、receiver、handguard、barrel、muzzle、magazine、foregrip、sight、ESMO signal mark。
- Pistol：slide、barrel、frame、grip、trigger guard、sight、ESMO signal mark。
- 兩者共用既有 `rightHand`／`lowerarm_r` mount 與最小 presentation transform correction；visible weapon 由 authoritative `current.gun` 對應 `rifle`／`pistol` group。
- `fpsC2cHero.js` 不修改 gameplay weapon stats，也不新增 weapon state。Review capture 可以固定 camera／pose 以檢查 geometry；live Battle 仍只接受 authoritative playback state。

### 10-player composition

- `fpsRigged=all&fpsC2cHero=all`：Blue 5／Red 5、10/10 rigged、10/10 mixer、identity 仍由 effectiveRoster／renderer pool 管理。
- t1～t5／ct1～ct5 共享 base skeleton、animation clips、C2C material system 與 equipment builder；差異來自 helmet、rear equipment、pouch／knee layout、headset、patch 與 neutral material accents。
- Team identity 維持 neutral graphite／fabric／polymer／metal base，只在 shoulder／vest／headset／equipment 放 Blue／Red accent，不整身染色。

### Budget / validation record

- `1244`：C2C 新增 clothing／equipment／weapon geometry 的 triangles，不包含完整 character base mesh。
- `8`：C2C materials，分類為 armor、polymer、metal、fabric、helmet、visor、accent、accentGlow。
- 10-player full-buy browser sample：`1075` render calls、`165876` triangles、`1199` geometries、`79` textures、10 players／10 rigged／10 mixers；數值會隨 map frame／asset cache 改變，static C2C cap 為 `3600` added triangles、`8` materials。
- 390×844 DPR2 mobile viewport smoke：canvas `370×437` CSS／`740×874` buffer，10/10 visibility，browser errors 0；這不是 Android 真機 FPS acceptance。
- 180 秒 long-run（C2C all-player candidate）：1063 geometry samples、StableCanvasRegion shifts 0、stale fIdx mismatch 0、duplicate RAF 0、duplicate render 0、rapid camera recovery 0、browser errors 0。

### Asset / license

- Existing base character／animation：Quaternius Universal Base Characters／Superhero Male FullBody，repo asset，`CC0 1.0 Universal`。
- Phase 1／Phase 2 clothing、equipment、weapon geometry 與 materials：ESMO original procedural presentation code，無外部 mesh、texture、paid asset、Mixamo 或 Valve／CS2 asset。

### Known limitations before Owner acceptance

- C2C 仍使用 CC0 validation mesh 作 shared skinned base；本階段是可 productize 的 stylized tactical presentation，不是獨立高模 sculpt。
- Desktop／Node／mobile viewport gates 已通過；Phase 2 新 equipment 的 Android 真機 FPS、握持觀感與最終 art direction 仍待 Owner 單一 HTTPS preview 上做 1～2 分鐘 Battle acceptance。
- Review artifact 的 rifle／pistol 靜態頁面用來放大檢查 presentation geometry；live preview 仍應以 Practice → Mirage → Battle 的實際 weapon state 為準。

## 11. C2C Revision：Owner acceptance revisions（2026-08-25）

Owner 回饋為 `C2C_ACCEPTED_WITH_REQUIRED_REVISIONS`：人體比例與整體方向保留，但需要修正世界比例、跑動朝向、10 人差異、Blue／Red 陣營服裝語言與武器族群呈現。本次 revision 不重做 base body，也不新增 gameplay role 或 animation authority。

### Root cause and fix

- Scale：原 GLB 的 bind-space `Box3` 高度約 1.82m，但 skinned runtime vertices 曾因 skeleton bind transform 被量成約 6m；`FpsCharacterRenderer` 現在以 `measureSkinnedBindBounds()` 取樣骨骼變形後頂點，再依 `targetHeight=1.82m` 正規化。這個修正作用在正式 Battle renderer，不是 review-only scale。
- Equipment scale：先前 mount scale 在 kit 建立末段被重設為 `1`，覆蓋 normalization；已移除該重設，equipment geometry 使用與 model 相同的 normalized scale。
- Locomotion：simulation 的 `va` 與既有 `-va` riggedRoot yaw contract 保持不變。GLB 在既有 `orientationOffset=-PI/2` 後以 model-local `-Z` 為正面；C2C authored geometry 使用 `+X`，因此 presentation mount 統一加 `-PI/2` 軸轉換。這只修正 presentation 軸，不修改 gameplay movement、simulation timing 或 weapon stats。
- Attachments：不直接把 rigid equipment parent 到帶非均勻 bind scale 的 bone。mount 只同步 bone world position、忽略 bone rotation／scale，並保留在同一 model root；這避免 equipment scale explosion，同時讓 helmet／plate／pouch 隨 locomotion anchor 位置更新。

### Revision result

- 五種 visual archetype：`assault`、`support`、`marksman`、`lurker`、`utility`；10-player composition 為 Blue 5／Red 5，variation 只改視覺裝備組合。
- Team language：Blue 使用較整齊的 slate／police-counter-terror equipment；Red 使用 olive／brown、asymmetric irregular-raider equipment；兩邊保留 neutral tactical base，不整身染色，也不複製 Valve／CS2 asset 或 faction design。
- Weapon family：`pistol`、`smg`、`rifle`、`sniper`、`shotgun` 五個 presentation groups，依 authoritative `player.gun` family map 切換；不改 weapon stats 或 economy。
- Scale evidence：base skinned body 約 1.82m；full C2C normalized presentation 約 1.91m，符合 Mirage 建築／掩體的角色相對比例。
- Previous revision desktop sample：10/10 rigged、10/10 mixers、5 variations、1,616 C2C triangles／8 materials；latest readability refinement sample 見 §13。

### Revision regression boundary

`tools/check_cs_c2c_character_art.mjs` 新增 scale／locomotion source gate：必須存在 skinned-bounds normalization、bone-position-and-rotation-only attachment、GLB front-axis correction、centralized `setFacingDegrees()`，且 caller 不得直接改 rigged root rotation。先前 direct bone-parent／skin-proxy attachment isolation 已證明會造成 scale／offset explosion，不得重跑同一方案；若未來要達成真正 per-limb deformation，應另開 authoring-time skinned-equipment task。

## 12. Visual readability refinement — 2026-08-26

Owner observed that the first revision read as a dark bare mannequin with floating equipment. The refinement keeps the accepted base body, skeleton, clips, team identity contract, and gameplay state authority intact.

- Procedural equipment materials now use normal depth testing and depth writing; attachments no longer draw through the body.
- Bone-mounted modules inherit bone position and rotation only. They never inherit the source rig's non-uniform scale.
- Mount offsets are local offsets from the actual bone position; absolute bone-height offsets were removed because they double-counted the anchor and made the kit float.
- Clothing and equipment use softened edges, smaller plate carriers/backpacks, clearer helmet/headset shapes, and brighter neutral fabric/polymer separation.
- `tools/browser_check_cs_c2c_vertical_slice.mjs` captures a closer Owner review framing. The artifact remains DEV/review-only.

The visual refinement must continue to pass the same C2C and P0 gates. It must not be “fixed” by disabling the HUD, freezing playback, changing simulation state, or replacing the shared rig.

### Required continuation rules

未來擴展角色 variation 前，先讀本文件與 `docs/handoff/10_CS_P0_視覺穩定性與防回歸契約.md`。任何修改 `EsportsFPS3D`、`FpsCharacterRenderer`、FPS playback、camera recovery、roster identity 或 Battle viewport layout，都必須重跑四條 P0 contracts 與 C2A／C2B／CS23／build；不得用 freeze fIdx、skip simulation、disable HUD／PlayerRow 或第二套 animation state 掩蓋視覺問題。

## 13. Visual readability refinement — latest（2026-08-26）

Owner 回饋「像生化人的裸體、色系太深」後，本輪完成最後一輪局部 presentation polish；不重做 Owner 已接受的人體基礎，也不新增第二套 rig／animation authority。

### Changes

- `C2C_CombatTopShell` 與 `C2C_TacticalPantsWaist` 先提供連續衣物底層，vest／plate／pouch 形成第二層；rounded edge 降低 primitive slab 感。
- `makeMaterial()` 保留正常 `depthTest`／`depthWrite`；每個 mount 以實際 bone position 加 local offset，同步 bone rotation，但不繼承 GLB 非均勻 bone scale。
- helmet shell、visor、headset 使用較明亮的 neutral tactical palette；validation mesh 的飽和 face／eye presentation 不再覆蓋 C2C helmet／visor，避免遠距讀成 zombie／biochemical face。
- 仍保留 localized Blue／Red accents、五種 visual archetype 與五類 weapon family；不改 team contract、authoritative `player.gun`、simulation 或 weapon stats。

### Latest evidence

- C2C static：`9/9 PASS`。
- Browser vertical slice：`Home → Practice → Mirage → Battle`、10/10 rigged、10/10 mixers、5 variations、1,648 C2C triangles、8 materials、browser errors 0；最新 renderer sample 1,086 calls、148,958 triangles、1,227 geometries、55 textures。
- P0／CS gates：Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、CS23 `28/28`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`；production build PASS。
- 180 秒 P0 long-run：`979` samples、StableCanvas shifts `0`、stale fIdx mismatch `0`、duplicate RAF `0`、duplicate render `0`、rapid camera recovery `0`、browser errors `0`。
- Production preview HTML：`artifacts/cs-c2c/vector9/owner-review.html`；它只提供 review surface，不改 production IA。Android 最終 art／smoothness acceptance 仍由 Owner 決定。

### Boundary

本 candidate 仍未 commit、未 merge、未 push、未 deploy；不得開始 C3。未來若要再提高 mesh／texture fidelity，另開 art asset task，先重跑 10-player budget 與四條 P0 contracts。

## 14. Crash recovery final check（2026-08-26）

### Recovery result

- Worktree 內 C2C source、clothing／equipment modules、glove／boot mounts、review captures 與 verifiers 都完整存在；沒有當機造成的修改遺失。本輪沿用已完成內容，只補 facing 與 faction readability。
- 先前文件所寫「GLB local `-Z` front」不正確。GLB JSON 中 Eyes／Eyebrows 的 position bounds 位於原生 `+Z`，因此正式 body front axis 是 `+Z`。

### Final implementation

- `FPS_CHARACTER_ASSET_MANIFEST.orientationOffset` 由 `-PI/2` 改為 `+PI/2`，讓 native body `+Z` 對齊 renderer authoritative `+X`。
- C2C authored modules／weapons 以 `+X` 為 front，bone mount 維持 `-PI/2` 對齊 body-native `+Z`；`setFacingDegrees(-va)` 與 simulation 不變。
- Blue：低輪廓 hard helmet、窄 visor、lower-face mask、雙耳 headset、制式 service mark、對稱 carrier／pouches。
- Red：cloth head／face wrap、單耳 comms、diagonal sling、lighter asymmetric carrier、loose utility bag、單側 knee／cargo treatment。差異是 geometry structure，不只是改色。
- 兩隊都有 fabric-tone skinned underlayer、combat top、完整 tactical pants、vest／plate、gloves、boots、pouches，並按五種 profile 配 radio／pack／long pack；最終 t1 sample 1,580 added triangles／8 materials。

### Final evidence

- Battle smoke：Home → Practice → Mirage → Battle；10/10 rigged、10/10 mixers、Blue 5／Red 5 structural nodes PASS、camera rapid recovery `0`、browser errors `0`。
- Facing：17 frame samples、158 moving samples、34 running samples；root body→movement avg `0.8859`、kit→movement avg `0.7487`、weapon→movement avg `0.7487`。倒著跑已在實際 Battle runtime 驗證修正。
- Gates：C2C `9/9`、Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、CS23 `28/28`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`、production build PASS。
- 180 秒 long-run：1,456 samples、417 fIdx transitions；StableCanvas shifts、stale fIdx、duplicate RAF、duplicate render、rapid camera recovery、browser errors 全 `0`。
- Owner review：`artifacts/cs-c2c/vector9/owner-review.html`；未 merge、未 push、未 deploy，不開始 C3。Android 真機 art／smoothness 仍待 Owner acceptance。
## 15. Final polish continuation after interruption（2026-08-26）

### Recovery / art completeness

- Crash recovery：沒有修改遺失。authoritative worktree 仍保留 source、C2C equipment builder、verifiers、review captures 與 runtime evidence；本輪沒有重做整個 C2C。
- Clothing／equipment：已完成 combat top、tactical pants、vest／plate carrier、pouches、radio／antenna、backpack／utility bag、gloves、boots、helmet／headset、five weapon families。Blue 是 police／special-unit PPE；Red 是 cloth wrap、face wrap、single-ear comms、diagonal sling、asymmetric irregular rig，差異不是單純 hue swap。
- Visual polish：減少厚重科幻 slab 與亮色眼／臉材質，保留 original ESMO low-poly language；用 neutral fabric／polymer／armor 層次避免裸體、生化人與測試模型讀感。

### Runtime fixes

- Hit reaction root cause：同一 `fIdx` 被每個 RAF 重複視為 hit event，使 `LoopOnce` action 每幀 reset，畫面停在第一個 hurt pose。修法是 `frameIndex + hp/shooting transition` signature latch；runtime evidence 看到 `Hit_Chest` time `0.05 → 0.15 → 0.30`、timer `0.32 → 0.07`，之後退出至 `Walk_Loop`。
- Close-up lock root cause：`resumeFrameIndex` persistence 更新觸發 `[sim,resumeFrameIndex]` initializer，initializer 的 `setSelected(null)` 清掉 PlayerRow selection。修法是依賴 `[sim]`；focus chase 改為 torso-height、短距離 `dRadius=7.5/9.5` 與 `fwd=1.7/2.2`，不改 recovery predicate。DOM click evidence 兩個角色在 1.5 秒 window 內 selection/chase id 穩定、visible、close button true、rapid recovery 0。

### Final evidence / status

- Battle vertical smoke：Home → Practice → Mirage → Battle、10/10 rigged、10/10 mixers、5 visual profiles、Blue 5／Red 5、C2C `1512` added triangles、`8` materials、hit/focus evidence PASS、camera rapid recovery 0、browser errors 0。
- Static gates：C2C `9/9`、Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、CS23 `28/28`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`；production build PASS。
- Long-run：`exit=0`、`180000ms`、`1688` samples、StableCanvasRegion shifts 0、stale fIdx 0、duplicate RAF/render 0、camera recovery 9、rapid recovery 0、browser errors 0。
- Owner preview：`http://127.0.0.1:5385/ESMO-/artifacts/cs-c2c/vector9/owner-review.html`。狀態鎖定為 `C2C_READY_FOR_FINAL_OWNER_ACCEPTANCE`；未 merge、未 push、未 deploy、未開始 C3。Android 真機視覺／FPS／觸控仍是 Owner acceptance boundary。

## 16. Clothing silhouette correction and final verification（2026-08-27）

### Root cause / implementation

- 原本的 CC0 validation superhero skinned surface 仍參與 render，腹肌、胸肌與四肢肌肉輪廓直接可見；舊 clothing 又是局部 rigid boxes，無法形成連續袖子與褲裝，所以看起來像裸體灰模掛裝備。
- 正式修法是隱藏原始 render meshes，但保留 skeleton、bone hierarchy、AnimationMixer、clip selection 與 renderer lifecycle。新 clothing 使用 root-local bone-endpoint segments、joint shells 與 tapered shells，完整覆蓋 combat top、sleeves、pants、waist、knees、cuffs、gloves 與 boots。
- carrier 是貼合胸腹的 tapered wrap；pouches、belt、radio／antenna、backpack、utility bag、helmet／hood、headset 都掛在合理 torso／head 子層。沒有重做 rig／skeleton／animation system。
- Blue：深藍／teal 警察特勤制服、硬式低輪廓頭盔、雙耳 headset、對稱 straps／carrier／pouches 與 service markings。Red：棕色 overshirt、深色 tactical pants、soft hood／face wrap、單耳 headset、斜背帶、不對稱 chest rig 與 utility bag。

### Owner evidence / runtime

- Owner review 包含 `blue-front.png`、`blue-quarter45.png`、`blue-side.png`、`blue-back.png`、`red-front.png`、`red-quarter45.png`、`red-side.png`、`red-back.png`、`lineup.png`、`gameplay-focus.png`。
- Formal Battle gate（非 review capture mode）：10/10 rigged、Blue 5／Red 5、5 profiles、35 frame samples、339 moving／174 running samples；rootBody avg `1`、rootKit／rootWeapon avg `0.9064`、runBodyMotion avg `0.9354`、runKit／runWeapon avg `0.7741`。
- Hit reaction：`Hit_Chest` time 持續前進，timer 下降後退出至 `Walk_Loop`；focus camera 兩次 DOM PlayerRow click 都維持 selection／chase id、visible、close button true，`dRadius=9.5/7.5`，rapid recovery 0。
- C2C art budget：`1952` added triangles、`8` materials。Static gates：C2C `9/9`、Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、CS23 `28/28`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`；production build PASS。
- 180 秒 long-run：`exit=0`、`1750` samples、StableCanvasRegion shifts 0、fIdx transitions 351、stale mismatch 0、duplicate RAF/render 0、camera recovery 9、rapid recovery 0、browser errors 0。

### Final status

- 視覺判定：現在是穿著完整服裝的現代戰術人物，不再是可見肌肉的裸體／生化人／灰模掛方塊；仍保留 ESMO stylized low-poly 原創風格，不宣稱直接複製或達到 photoreal Counter-Strike 官方資產。
- Owner preview：`http://127.0.0.1:5385/ESMO-/artifacts/cs-c2c/vector9/owner-review.html`。
- 狀態：`C2C_READY_FOR_FINAL_OWNER_ACCEPTANCE`。未 merge、未 push、未 deploy、未開始 C3；Android 真機視覺／FPS／觸控保留為 Owner acceptance boundary。

## 17. Final tactical readability polish（2026-08-27）

### Weapon readability

- Pistol：短 slide、明顯 angled grip、muzzle block 與 front／rear sight。
- SMG：wire stock、tall receiver、long straight magazine、short suppressor。
- Rifle：service stock、stepped receiver、upper rail、two-part curved magazine、front／rear sight。
- Sniper：cheek rest、large scope bells、bolt handle、long thin barrel、split bipod。
- Shotgun：heavy receiver、ribbed pump、barrel／magazine tube、muzzle ring、visible side-saddle shells。
- Root cause 是 weapon geometry 同時過度 box-like 且繼承 clothing mount 約 0.4 的 bone-length scale；正式改用同一 animated torso orientation 的 fixed-scale weapon mount。authoritative family map、weapon stats、animation controller 都不變。

### 10-player variation / faction language

- Blue：assault rail、support comms bridge、marksman monocular／visor、lurker low helmet brim、utility helmet camera；另依 profile 改 full carrier depth、side pouches、admin panel、harness、utility tubes、sleeve cuffs、packs、knees。
- Red：assault balaclava、support heavy head wrap、marksman field cap／scarf、lurker hood peak／long tail、utility bandana；另使用 satchel、ammo wrap、improvised chest strap、asymmetric utility pouches 與不同 sleeve／knee／rear combinations。
- 所有人仍使用完整 combat top、sleeves、pants、gloves、boots；原肌肉 render mesh 保持 hidden。未加入 Valve／CS ripped asset、外部 mesh／texture 或新 rig。

### Final evidence

- Owner artifacts 新增 `weapon-lineup.png` 並保留五類 `pistol.png`／`smg.png`／`rifle.png`／`sniper.png`／`shotgun.png`、Blue／Red 四視圖、10-player clothing lineup、Battle gameplay。
- Formal Battle runtime：10/10 rigged、五 profile、Blue 5／Red 5 profile-specific nodes、35 frame samples、339 moving／173 running；root body avg 1、root kit avg 0.9078、root weapon avg 0.8761、run body avg 0.9313、run kit avg 0.7726、run weapon avg 0.7288。
- Hit reaction 與 focus camera PASS；camera rapid recovery 0、browser errors 0。C2C budget `2560` triangles／`8` materials；10-player renderer sample約 `1098` calls／`30234` triangles。
- Static gates：C2C 9/9、Renderer 24/24、CS-A2 10/10、C2A 13/13、C2B 14/14、CS23 28/28、Camera 8/8、RAF 7/7、StableCanvas 5/5；production build 與 production Battle smoke PASS。
- 180 秒 long-run：1544 samples、324 fIdx transitions、StableCanvas shifts 0、stale mismatch 0、duplicate RAF/render 0、camera recovery 9、rapid recovery 0、browser errors 0。
- Owner preview：`http://127.0.0.1:5385/ESMO-/artifacts/cs-c2c/vector9/owner-review.html`。狀態：`C2C_READY_FOR_FINAL_OWNER_ACCEPTANCE`；未 merge、未 push、未 deploy、未開始 C3。
