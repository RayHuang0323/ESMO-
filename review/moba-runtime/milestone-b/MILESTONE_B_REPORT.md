# Milestone B：MOBA 戰鬥呈現與基礎戰鬥單位整合

日期：2026-07-29
起點：`dfdc826`
狀態：**完成本機實作與桌面 Chrome viewport 驗證；未 push、未部署，待人工與 Android 真機驗收。**

## 1. 結果摘要

Milestone B 沿用正式資料流：

`LogicEngine → snapshot → runtime-v2 adapter → fixed-pool renderer → GameView / Replay`

沒有回退 legacy、建立第二套戰鬥引擎或重算 Replay。四個可獨立回復的本機 commit：

| 階段 | Commit | 結果 |
|---|---|---|
| B.1 英雄辨識 | `592a355` | 修正正式 roster 遺失，十名英雄各有不同結構剪影 |
| B.2 技能／攻擊回饋 | `fe747f2` | cast／travel／impact、普攻／命中回饋與 Replay 同源 |
| B.3 速度一致性 | `adde1aa` | 五職業同速量測，離散傳送不再被插值成暴衝 |
| B.4 小兵戰鬥 | `7b5c2f8` | 8-hit 單挑耐久、明確攻擊間隔、camera-facing 血條 |

整段 rollback baseline：`dfdc826`。回退應由新到舊執行 `git revert`，不可使用
`git reset --hard`。

## 2. B.1 英雄辨識

根因不是 H.4 recipe 不存在，而是正式 `GameView` 的 runtime-v2 分支沒有把
`liveRoster` 傳入 renderer，十名英雄因此全部退回 role fallback。

修正後資料流為：

`GameView.liveRoster → MobaRuntimeView3D → RuntimeFrameFeeder → adaptHeroes`

十名現役英雄使用十種結構剪影：

`bulwark / bruiser / rogue / striker / crystal / flame / ranger / wing / sentinel / obelisk`

差異包含頭盔、盾、雙拳、雙刃、法杖、晶核、火焰冠、發射器、雙翼、重甲與戰鎚，
不是只換顏色。`hero-visual.v1` 與 stable-id hash fallback 保留，可擴充至 100+ 英雄。

## 3. B.2 技能、普攻與命中回饋

H.3 已有真實攻擊事件，但 `0.65 sim-s` 在正式加速播放下過短，且每 phase 只畫一種形狀。
B.2 不改傷害、攻速、CD、目標或 RNG，只延長呈現窗：

- 普攻：`2.2 sim-s`
- power skill：`3.2 sim-s`
- cast：施法圈＋核心
- travel：方向軌跡＋移動彈體
- impact：受擊核心＋擴散圈
- 固定池：48 lines、32 rings、32 orbs；`useFrame` 不建立 geometry/material

`MobaReplay.v1` 版本不變，在 compact FX 列尾端附加可選
`feedback/sourceId/targetId`。舊 Replay 可讀；新 Replay 仍播放保存 frame，不重算命中。

## 4. B.3 英雄速度與 renderer interpolation

正式 v3 所有英雄共用：

- base move speed：`5.60`
- fight speed：`6.71`
- retreat 上限：`6.71 × 1.15 = 7.7165`

role、hero visual、snapshot、adapter 均無個別速度倍率。各路／野區控制路線的五職業
到達時間完全相同：

| 路線 | 五職業到達時間 |
|---|---:|
| 上路 | 24.5s |
| 中路 | 20.5s |
| 下路 | 23.5s |
| 野區 | 32.0s |

人工所見的「部分英雄暴衝」來源是 renderer 將復活、回城與 Flash 的離散位置也做線性
插值。`runtimeMovementPolicy` 現在只對例行步行平滑插值；生死轉場、Flash uses 增加或超過
合理 tick 位移的傳送直接切到權威 snapshot。此策略只作用於畫面，不寫回 LogicEngine。

## 5. B.4 小兵戰鬥與血條

原正式 v3 小兵仍使用寫死的 130 HP／70 DPS，四隻兵共同挑陣列第一目標，會造成集火
快死。血條固定在 world XY 平面，fill 又未明確進 transparent queue，遠景容易像全空。

正式 v3 現在使用：

| 參數 | 值 |
|---|---:|
| HP | 240 |
| 每次攻擊傷害 | 30 |
| 攻擊間隔 | 1.0s |
| 攻速 | 1 APS |
| lane progress 射程 | 0.035 |
| 單挑死亡所需命中 | 8 |

首輪以距離＋slot 配對，仍由同一張 damage table 同時結算，雙方完全對稱。波次、數量、
世界移速、塔傷、金錢、XP 與地圖不變；v1/v2 歷史 baseline 維持舊值。

血條背景與 fill 都使用透明排序、`depthTest=false`、`depthWrite=false`、固定 renderOrder；
每幀複製 camera quaternion，fill 左對齊沿 camera-local right 計算。Replay 保存 partial HP
與死亡移除，使用相同 renderer。

## 6. 修改檔案

正式程式：

- `src/GameView.jsx`
- `src/LogicEngine.js`
- `src/battle/moba/matchProgression.js`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeMinions.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/runtimeMovementPolicy.js`
- `src/battle/moba/replay/replayPresentationSource.js`
- `src/platform/contracts/mobaReplay.js`

驗證／文件：

- `tools/check_moba_milestone_b1.mjs`
- `tools/check_moba_milestone_b2.mjs`
- `tools/check_moba_milestone_b3.mjs`
- `tools/check_moba_milestone_b4.mjs`
- `tools/check_moba_minions_h3.mjs`
- `tools/check_moba_pacing29b1.mjs`
- `docs/handoff/05_Sprint紀錄.md`
- 本報告與本目錄截圖

`check_moba_minions_h3` 只同步固定 FX 池的有意容量 32/16 → 48/32；固定三池要求未放寬。
`check_moba_pacing29b1` 第 5 條改為接受「向泉水移動」或真實 `recallT>0` 回城 channel，
因 S29B3 之後低血英雄會先原地引導，不代表卡住；任意靜止仍不會通過。

## 7. 驗證

全部通過：

- production `npm run build`
- Milestone B.1／B.2／B.3／B.4 verifier
- H.4 hero visual
- H.3 minion／Replay：22/22
- pacing29b1：25/25（`SKIP_NESTED=1`，本體完整）
- presentation29b2：12/12（`SKIP_NESTED=1`，本體完整）
- controls29b3：18/18（`SKIP_NESTED=1`，本體完整）
- camera/replay29b6：16/16（`SKIP_NESTED=1`，本體完整）
- `check:mobamap`：3553/0
- H.2 navigation／collision：14/0
- `regress`：exit 0；15 seeds 中 14 場於 30 分上限內結束，符合既有門檻
- `regress2`：8/8；20/20 結束、平均 23.6 分、藍紅 13/7（平衡差 0.15，門檻內）
- `git diff --check`

完整 `runtime29` 本輪未重跑。H.3 已記錄它需約 51 分鐘且有既存 v2 順序抽樣紅燈
42/44；本輪沒有改 v2，並已逐支跑本次受影響的 v3 pacing、presentation、controls、
Replay、regress、regress2 與 build，不刪除或放寬既存 runtime29 門檻。

## 8. 正式 GameView 畫面

測試網址：

`http://127.0.0.1:5173/ESMO-/?debug=moba-runtime-battle&mapPresentation=runtime-v2`

證據：

- [桌機 1440×900 純戰場](./MILESTONE_B_DESKTOP_SCENE_1440x900.png)
- [桌機 1440×900 戰鬥](./MILESTONE_B_DESKTOP_COMBAT_FX_1440x900.png)
- [桌機 1440×900 英雄群](./MILESTONE_B_DESKTOP_HERO_FOCUS_1440x900.png)
- [桌機 1440×900 診斷](./MILESTONE_B_DESKTOP_1440x900.png)
- [手機 390×844 純戰場](./MILESTONE_B_MOBILE_SCENE_390x844.png)
- [手機 390×844 診斷](./MILESTONE_B_MOBILE_390x844.png)

桌機與手機 viewport 的 `scrollWidth === innerWidth`，沒有水平溢出。正式畫面可見不同英雄
結構、多隻小兵、血條與命中圈。診斷曾同時記錄：

- `DEPTH_BITS=24`
- WebGL2 / ANGLE AMD D3D11
- context attributes：`depth=true`、`antialias=true`
- camera：near 35 / far 1000
- viewport/buffer：390×844
- 10 heroes / 64 minions / 2 active FX / 61 FX seen

Chrome extension 的 rAF／背景節流會扭曲 FPS；本次數字不作產品效能通過依據。

## 9. 已知限制與人工驗收

- 導播相機一次只會近看戰區中的部分英雄；十名 structural recipes 與正式 roster 資料流
  已驗證，但仍需人工逐一切換英雄近景確認十名的實戰辨識度。
- cast／travel／impact 與 active FX 已在正式 GameView 出現；特效「是否夠清楚且不干擾」
  仍是主觀視覺項目，需人工看動態戰鬥與完整 Replay，單張截圖不能取代。
- Android 真機尚未實測：FPS、熱降頻、觸控、safe area、WebGL driver、閃爍與長時間 Replay。
- H.2 flicker CDP 工具在本機專用 Chrome 的 `Page.enable` 連續逾時；沒有修改 verifier
  掩蓋。正式 Chrome GameView 可見 WebGL2／24-bit depth，仍不能替代 Android 真機錄影。
- 沒有 push、沒有部署，沒有開始下一階段，也沒有納入工作區既有 terrain／bug／backup
  舊產物。
