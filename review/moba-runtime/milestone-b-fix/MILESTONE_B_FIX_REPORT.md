# Milestone B-fix：MOBA 戰鬥視覺可讀性驗收報告

日期：2026-07-29

狀態：**實作完成，待人工／Android 真機驗收；未 push、未部署。**

起點／rollback baseline：`51d97e2`

## 1. 結論

本輪只延伸既有 `snapshot → runtime-v2 adapter → renderer` 呈現鏈，沒有修改
`LogicEngine`、地圖結構、導航／碰撞、勝負與公平性數值，也沒有改 Replay contract。

- 十名出戰英雄改用各自的主色、次色、比例、結構剪影、頭部 motif 與戰鬥特效語彙；
  頭部 motif 與主色依專案現有選角頭像重新對齊。
- 藍／紅陣營由腰帶、腳下陣營環、血條旁菱形隊標與「藍方／紅方」名牌共同辨識，
  不再把整隻英雄塗成隊伍色；即使低階模式關閉 DOM 名牌，幾何隊標仍保留。
- cast／travel／impact、普攻、小兵攻擊與命中改用五個固定 pool，依英雄
  `combatStyle` 呈現不同形狀；live 與 Replay 都讀同一個 adapter effects 來源。
- 小兵與所有可攻擊建築使用 camera-facing 黑底血槽與連續 HP 填充，放在角色／地圖之上。
- 防禦塔具鎖定、彈體、命中與拆除回饋。人工指出塔攻擊像音波後，最後修正為
  「塔冠蓄能 → 單一弧線追蹤彈體＋短尾跡 → 小型命中爆點」；塔分支不再畫全長光束或
  大面積同心圓。

## 2. 根因與修正

### 英雄仍像同一隻

H.4／Milestone B 已有結構 recipe，但正式遠景仍由藍／紅隊伍色支配，英雄本體的材質、
比例與技能語彙差距不夠。`hero-visual.v2` 為十名現役英雄明定：

- 十組 `primary / secondary / accent`
- 十種 `silhouette`
- 個別 `scale`
- 十種 `combatStyle`：
  `shieldwave / fist / twinSlash / dash / shard / flameOrb / rail / wingBolt / quake / hammer`
- 十種 `headFeature`：
  `hornedHelm / flameHair / hood / infernoHorns / iceCrown / emberCrown /
  lightningHalo / phoenixCrown / barkAntlers / stoneHorns`

未來英雄仍由 stable hero id hash 取得 deterministic fallback，不需為第 11 名起複製
renderer 分支。

選角頭像不是直接貼到 3D 角色，也沒有複製外部模型；renderer 把頭像中最容易辨認的
角盔、火焰髮冠、兜帽、冰晶冠、雷電環、鳳翼冠、樹甲角與石角轉成 ESMO 自有低模
recipe。赤炎武神、烈焰先知、炎鳳射手、雷霆神射等原本偏離頭像的主色也已校正。

### 技能、普攻與受擊不易看見

原本三個池只涵蓋 line／ring／orb，且多數事件共用同一條線與擴散圈。現在固定 pool 為：

| Pool | 容量 | 用途 |
|---|---:|---|
| line | 64 | 遠程軌跡、rail、地裂方向 |
| ring | 72 | cast／範圍技與非塔命中 |
| orb | 72 | 彈體、蓄力核心、爆點 |
| slash | 72 | 近戰揮擊、斬擊命中 |
| lock | 48 | 塔與鎖定提示 |

geometry／material 只建立一次，`useFrame` 只更新 instance matrix／color。角色在 adapter
收到實際 HP 下降時取得短暫 hit progress，renderer 顯示 emissive flash 與輕微抖動。

### 小兵血條與攻擊

舊血條容易因透明排序、共面位置與視角看似空槽。現在：

- 黑色不透明感底槽；
- 綠色實際 HP fill，依 `displayHpRatio` 連續插值並由左向右縮短；
- 每幀複製 camera quaternion；
- 背景／填充值沿 camera forward 分離，避免共面；
- `depthTest=false`、`depthWrite=false`、renderOrder 46／47。

小兵攻擊特效不是新傷害來源；adapter 只從 prev→snapshot 的真實 HP drop 推導
`minionBolt`／`minionSlash`，因此畫面不會改寫戰鬥結果，Replay 也走同一路徑。

### 塔攻擊曾像音波

根因是 tower event 落入共用 ground ring／line 語彙。塔現在使用獨立分支：

1. cast：塔冠亮起，目標腳下只有小型旋轉鎖定菱形；
2. travel：高處起飛的單一追蹤 orb，以 flight progress 沿弧線下降，附一顆短尾跡；
3. impact：小型點狀爆光、斬弧與短暫鎖定，不產生擴散音波圈。

這是純 renderer 修正；塔傷害、鎖定規則、攻速、射程與拆塔結果未變。

## 3. 修改檔案

正式程式：

- `src/battle/moba/presentation/heroArchetypes.js`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeMinions.jsx`
- `src/battle/moba/render/MobaRuntimeStructures.jsx`

驗證／文件：

- `tools/check_moba_hero_visual_h4.mjs`
- `tools/check_moba_milestone_b1.mjs`
- `tools/check_moba_milestone_b2.mjs`
- `tools/check_moba_milestone_b4.mjs`
- `tools/check_moba_milestone_b_fix.mjs`
- `docs/handoff/05_Sprint紀錄.md`
- 本報告與 `evidence/` 八張正式 GameView 截圖

## 4. 正式 GameView 視覺證據

測試路徑：

`?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1`

- [桌機英雄辨識](./evidence/01_desktop_hero_roster.png)
- [桌機塔與小兵血量](./evidence/02_desktop_tower_minion_hp.png)
- [桌機塔拆除](./evidence/03_desktop_tower_destroyed.png)
- [手機 390×844 戰鬥](./evidence/04_mobile_390x844_combat.png)
- [手機 390×844 技能](./evidence/05_mobile_390x844_skill.png)
- [手機 390×844 小兵血量](./evidence/06_mobile_390x844_minion_hp.png)
- [桌機選角特徵與藍／紅隊標](./evidence/07_desktop_team_portrait_alignment.png)
- [手機 390×844 藍／紅隊標](./evidence/08_mobile_390x844_team_portrait_alignment.png)

桌機使用 1280×720，手機使用 Chrome 390×844 viewport。畫面可見跨鏡頭的十組英雄
配色／輪廓、藍／紅隊標與名牌、小兵局部 HP、技能範圍圈、塔血條與拆除後殘骸；
390×844 的 `scrollWidth === innerWidth`，未見水平溢出。
診斷當時為 WebGL2、`DEPTH_BITS=24`、camera near/far `35/1000`、desktop DPR 1.5。

最後的「塔彈由音波改為單一追蹤彈體」是在上述截圖後依人工意見完成，已由程式分支與
回歸 verifier 證明不再進入 tower ground-wave／full-beam 路徑，但仍需人工觀看動態畫面，
不能用靜態程式斷言取代主觀驗收。

## 5. 驗證

已通過：

- `check_moba_milestone_b_fix`
- H.4 hero visual
- Milestone B.1／B.2／B.3／B.4
- H.3 minion／Replay：22/22
- presentation29b2：12/12（`SKIP_NESTED=1`，本體完整）
- controls29b3：18/18（`SKIP_NESTED=1`，本體完整）
- camera/replay29b6：16/16（`SKIP_NESTED=1`，本體完整）
- `check:mobamap`：3553/0
- H.2 navigation／collision：14/0
- `regress`：exit 0；14/15 於 30 分鐘上限內結束，符合現役 script 門檻
- `regress2`：20/20 結束、節奏門檻 8/8
- production `npm run build`
- `git diff --check`

完整 `runtime29` 曾啟動，但使用者在它進入 `stats28` 長模擬後追加選角／陣營識別要求；
為避免用舊 source state 的執行結果混充，已停止該次程序。`runtime29` 原始碼明記
`stats28` 單跑可能需 87 分鐘，H.3 實測亦曾需 51 分鐘且有既存 v2 順序抽樣紅燈；
本輪因此改跑所有直接受影響 verifier、regress、regress2 與 build，不修改
`runtime29`／`stats28` 門檻來製造綠燈。所有上述子程序均以實際 exit code 與輸出形狀
判定，不以「有印出文字」視為通過。

## 6. 已知限制與人工驗收

- 390×844 是桌面 Chrome viewport，不是 Android 真機；Android FPS、熱降頻、觸控、
  safe area、WebGL driver 與 H.2 閃爍仍未實測。
- 正式導播不會在同一張近景同時容納十名英雄；八張跨時間畫面與 schema verifier
  可證明十名 recipe 進入正式資料流，但仍需人工逐一辨識。
- 技能是否「清楚但不干擾」、塔的新追蹤彈體是否符合 MOBA 體感、拆塔 burst 動態，
  都需在 1× 正式 GameView／Replay 人工觀看。
- 截圖 03 可見拆塔公告與殘骸，不等於捕捉到 1.4 秒 destruction burst 的每一幀。
- 自動化瀏覽器診斷曾約 24–30 FPS，受工具控制與 HUD 影響，不列為產品 FPS 通過。
- 未 push、未部署；未開始下一階段；未納入既有 terrain／bug／backup 舊產物。

## 7. 回退

整個 Milestone B-fix 的 rollback baseline 為 `51d97e2`。若人工驗收不接受本輪，
使用新 commit 的 `git revert <commit>` 回復；禁止 `git reset --hard`。
