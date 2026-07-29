# Milestone D-fix3 Report

日期：2026-07-30

範圍：Runtime 戰鬥視覺、野區資源、基地結構與 D-fix2 決策保護

狀態：本機實作／驗證／證據完成；依使用者最新指示 push 與 GitHub Pages 部署後停止。

## 1. 版本與禁改邊界

- 開工 HEAD／rollback tag：`279829f`／`milestone-d-fix3-baseline`
- 階段 1：`8c576ff` — individual objectives、Dragon／Baron buffs、nexus guards
- 階段 2：`76dcca4` — formal live FX、彩色彈體、WebGL 名牌、小兵繞塔
- 未改地圖幾何、公平門檻、核心碰撞資料、BattleResult、Progress／Reward、
  profile persistence 或 Replay 重新模擬規則。
- D-fix2 的 `ENGAGE／KITE／PURSUE／RETREAT／SUPPORT／FALLBACK` 保留；本階段沒有
  再調決策權重或勝負分布。

## 2. 真正根因與修正

### 塔彈與技能曾只剩圈／黑點

1. 正式 `RuntimeFrameFeeder` 在 snapshot 間把 FX 時間固定為 `snapshot.ts`；
   0.5 秒內 cast 停住，下一 tick 直接跳 travel／impact。
2. additive + vertex/instance color 在正式 WebGL、Bloom 與遠景下只剩無方向黑點／白點。
3. 舊 ring 對比高於實心彈體，視覺上被誤認為塔的主攻擊。

修正：

- live 以 `extrapolateLiveEffectTime(prev.ts,snapshot.ts,subT)` 逐幀推進；
  Replay 維持保存 frame time。
- 塔有藍／紅 normal-blended 炮彈外殼、白熱核心、短尾跡與 compact impact。
- 六職業固定色與輪廓：
  tank 琥珀、fighter 紅橘、assassin 紫、mage 青、marksman 金、support 薄荷。
- ring opacity 降到 0.14，只是短提示；塔 hit ring 改實心 octahedron hit core。
- 所有 damage、target、phase 仍來自正式 `snapshot.fx`。

### 姓名遮住血條

姓名原為 drei `<Html>`，屬 canvas 上方 DOM；Three.js `renderOrder` 無法讓 WebGL 血條
蓋過 DOM。改為 CanvasTexture + WebGL Plane，名稱 order 69、血條 70–72；名稱群組
獨立反轉 hero facing，避免父 root 被錯誤旋轉成 edge-on。手機由 `useIsMobile()` 傳入
compact label。

依最後人工回饋，英雄頭頂不再放 `D×1`／Buff 秒數；Buff 數值只在隊伍面板，
角色以紅／藍／紫／金低透明環繞效果表示。

### 小兵穿過／撞塔

敵塔攻擊停位原本正常；真正重現的是 outgoing minion 的 lane center `t` 穿過友軍塔心。
舊 adapter 每幀取最近 walkable projection，塔心前後的最近側切換時造成跳邊／穿塔。
現在對每座友軍塔以正式 `findPath`／navigation field 建局部快取折線，再沿相同 `t`
連續取樣。這是 presentation adapter 修正：不改 `t`、抵達時間、攻擊距離、傷害或幾何。

## 3. 野區資源、Boss 與基地

- 每個 camp member 獨立 HP、alive、hit/death/respawn、仇恨、攻擊 CD、participants；
  90 秒個體重生，主怪死亡才給紅／藍 Buff。
- Dragon：150 秒重生；每層輸出 +1.2%、防護 +0.8%，最多四層，本場永久、死亡保留。
- Baron：210 秒重生；70 秒英雄攻城 ×1.22、兵線拆塔 ×2.2、兵對兵 ×1.7；
  到期移除，英雄死亡不提前移除。
- 藍紅各兩座正式 `nexus_guard`；兩座未倒前 nexus 不可成為攻擊目標。
- snapshot、adapter、Replay、地圖、Boss HUD、隊伍面板使用同一正式資料。

## 4. 修改檔案

### 階段 1（commit `8c576ff`）

- `src/LogicEngine.js`
- `src/battle/moba/matchProgression.js`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/map/mobaTowerPlacement.js`
- `src/battle/moba/nav/mobaNavigation.js`
- `src/battle/moba/render/MobaRuntimeNeutrals.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/replay/replayBuffer.js`
- `src/battle/moba/replay/replayPresentationSource.js`
- `src/battle/ui/BattleHUD.jsx`
- `src/battle/ui/BattleHeroStrip.jsx`
- `src/platform/contracts/mobaReplay.js`
- `tools/check_moba_milestone_{c_fix,d,d_fix2,d_fix3}.mjs`
- `tools/check_moba_minions_h3.mjs`

### 階段 2（commit `76dcca4`）

- `src/GameView.jsx`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeStructures.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/ui/BattleHUD.jsx`
- `src/battle/ui/BattleHeroStrip.jsx`
- `tools/check_moba_milestone_{c_fix,d,d_fix2,d_fix3}.mjs`
- `tools/shot_moba_runtime.mjs`

文件與證據另由包含本報告的交接 commit 保存。

## 5. 驗證結果

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_d_fix3` | PASS；live cast→travel→travel→impact；route clearance 1.049 |
| D-fix2／D／C-fix verifier | 全 PASS |
| `check_moba_nav_h2` | 14 PASS / 0 FAIL |
| `check_moba_minions_h3` | 22/22 |
| presentation29b2 direct | 12/12 |
| camera/replay29b6 direct | 16/16 |
| `regress` | 15/15；平均 24.5 分、31.9 kills |
| `regress2` | 20/20；節奏 8/8；藍 13／紅 7 |
| production build | 2595 modules，exit 0；只有既有 chunk warning |
| `git diff --check` | exit 0；無 whitespace error |

完整 presentation 巢狀鏈曾在 300 秒無輸出後停止；依任務規則沒有無限等待，並以
直接 presentation、navigation、兩支 regress 與 build 補齊本輪直接風險。

## 6. 肉眼證據

索引：`review/moba-runtime/milestone-d-fix3/evidence/README.md`

- 桌面：完整 Dashboard→Draft→Tactic→GameView，正常 1×。
- 三張 1× 連續影格：補充正式 GameView 元件內的彩色 travel／impact。
- 姓名／血條：WebGL 名牌、完整 HP，沒有頭頂 Buff 文字。
- Replay：正式 runtime-v2 3D Replay controls／map。
- 390×844：medium／low 兩張；`shot_stats.json` 記錄 formal GameView=true、
  10 heroes、viewport 390×844、debug map UI 0、minimap overlap=false。

桌面完整流程是正式人工證據；mobile-only 與三連圖使用專案既有直接正式 GameView
截圖入口作補充，不冒充完整賽前流程。Android 真機仍未驗證。

## 7. 回退、部署與 Claude Code 交接

- 只退最後視覺／小兵繞塔：`git revert 76dcca4`
- 連同 D-fix3 中立資源／基地結構退回：再 `git revert 8c576ff`
- 比對基準：`git show milestone-d-fix3-baseline`
- 禁止用 `git reset --hard`。
- 正式 URL：`https://rayhuang0323.github.io/ESMO-/`
- Claude Code 接手：先讀 `AGENTS.md`、`docs/ai/跨模型交接流程.md`、
  `docs/handoff/05_Sprint紀錄.md` 最後一節與本報告，再看 `git status --short`。

## 8. Android 真機待確認

1. 正常 1× 塔彈逐幀、六職業色彩／華麗度、impact 與扣血同步。
2. 多英雄疊在一起時姓名／等級與血條可讀性。
3. 三路小兵繞友軍塔與敵塔停位。
4. 紅／藍／Dragon／Baron 環繞效果、面板層數／秒數及 Replay。
5. 導播、單指 pan、雙指 zoom、safe area、FPS、熱降頻與 WebGL driver。

未經上述真機驗收，不宣稱 Android 體驗完成。
