# H.4 英雄視覺與技能表現整合報告

日期：2026-07-29
狀態：待人工驗收；已建立本機 commit，未 push、未部署。

## 結果摘要

- 10 名現役英雄現在以穩定 `heroId` 對應個別低面數視覺 recipe，不再只有四種完全相同的膠囊剪影。
- 視覺 recipe 只屬於呈現層，`LogicEngine`、碰撞、尋路、經濟、天賦、地圖幾何、BattleResult 與 Replay frame schema 沒有改動。
- FX 仍使用固定 line/ring/orb InstancedMesh 池；新增 cast、travel、impact 階段，以及依職業／basic-power 的色彩、寬度與命中落點回饋。
- 未加入外部模型、貼圖或受版權保護資產。

## 架構與修改檔案

1. `src/battle/moba/presentation/heroArchetypes.js`
   - 新增 `hero-visual.v1` schema、10 個現役 hero id 的顯式 recipe。
   - `heroVisualFor()` 為未來 100 名英雄提供 deterministic family/palette/badge fallback。
   - `skillVisualFor()` 提供 presentation-only cast/impact shape 與色彩。
2. `src/battle/moba/map/mobaRuntimeMapAdapter.js`
   - 從既有 roster `heroId` 取出 stable id，輸出 `heroId`/`visual`。
   - 不改 snapshot 數值；FX 由既有 `ability`、時間與 target 推導 phase/skillVisual。
3. `src/battle/moba/render/MobaRuntimeHeroes.jsx`
   - 固定 geometry/material pool 新增 crest/badge 與每英雄 accent material。
   - 所有 geometry 仍在 `useMemo` 建立，`useFrame` 只更新 transform/visible/material。
   - 延續 H.2 `frustumCulled=false`、ground layer、ring polygonOffset 與 lifecycle 保護。
4. `src/battle/moba/render/MobaRuntimeEffects.jsx`
   - 固定三池呈現 cast ring、travel line、impact orb/ring；不關閉 depthTest、不改傷害判定。
5. `tools/check_moba_hero_visual_h4.mjs`
   - 驗證 schema、10 名 recipe、deterministic fallback、adapter heroId/visual 與 FX phase。

## 參數

- 10 個顯式 id：`ironclad`, `cinderfist`, `duskblade`, `chichuan`, `bingshuang`, `lieyan`, `leiting`, `yanfeng`, `dadi`, `stoneguard`。
- fallback 以 hero id hash 決定 accent/trim/badge；同 id 每次結果一致，可擴充至 100+ 英雄。
- power FX：`ring` cast、較寬 travel/impact；basic FX：`orb` cast、較窄 travel/impact。
- geometry/material 仍為固定池；沒有逐幀 new geometry/material，也沒有新增 renderer branch 到 legacy。

## 驗證

- `npm.cmd run build`：PASS。
- `node tools/check_moba_hero_visual_h4.mjs`：PASS（schema、10 heroes、adapter、FX）。
- `node tools/check_moba_minions_h3.mjs`：22/22 PASS。
- `node tools/check_moba_nav_h2.mjs`：14/14 PASS。
- `SKIP_NESTED=1 node tools/check_moba_presentation29b2.mjs`：12/12 PASS。
- `SKIP_NESTED=1 node tools/check_moba_controls29b3.mjs`：18/18 PASS。
- `SKIP_NESTED=1 node tools/check_moba_camera_replay29b6.mjs`：16/16 PASS。
- `node tools/regress.mjs`：15/15 場完成；`node tools/regress2.mjs`：20/20、平衡度 0.10。
- 瀏覽器 viewport：桌機 `1440×900`、手機 `390×844`；截圖：
  - [H4_DESKTOP_1440x900.png](./H4_DESKTOP_1440x900.png)
  - [H4_MOBILE_390x844.png](./H4_MOBILE_390x844.png)
  - [H4_MOBILE_390x844_SCENE.png](./H4_MOBILE_390x844_SCENE.png)
- 瀏覽器診斷：WebGL2、`DEPTH_BITS=24`、`depth=true`、camera `near=35/far=1000`、desktop buffer `1440×900`、mobile buffer `390×844`。本機 Chrome extension 觀測約 1–2 FPS/1017ms frame，屬測試環境限制，不能代替 Android 真機量測。
- 瀏覽器 console 未見專案來源 error；只見 Chrome extension 自身 EventEmitter warning。

## 已知限制與人工驗收

- 截圖以程序化低面數 recipe 驗證辨識度，尚未接入最終商用角色模型；後續可維持 `heroVisualFor()` 契約逐批替換。
- Node 與桌面瀏覽器無法證明 Android 真機的 FPS、熱量、觸控、WebGL driver 差異、Replay 長時間播放穩定性。
- 請人工確認 10 名英雄在正式 GameView 近景下的個體辨識、技能 cast→travel→命中回饋、手機 320/360/390/430px 不跑版，以及真機不閃爍／不掉幀／不過熱。

## 回退

本階段 commit 前一個穩定基線為 `082371b`（H.3 Pages deployment docs）。回退時只回退本階段明確檔案，不動工作區既有未追蹤舊產物。
