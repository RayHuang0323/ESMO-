# H.3 Runtime 對戰呈現報告

> 日期：2026-07-29  
> 狀態：本機實作完成，待 Android 真機與人工 Replay 視覺驗收；未 push、未部署。  
> 起點：`09ce36c`（H.2-flicker）  
> 程式 commits：`759bae7`、`a87e379`

## 1. 結論

H.3 沿用 `LogicEngine → snapshot → runtime-v2 adapter → renderer` 與既有 Replay，
沒有建立第二套小兵／技能／地圖或戰鬥引擎：

- 三路雙方小兵已在正式 `GameView + runtime-v2` 顯示波次、三近戰一遠程隊形、
  接線、受傷、死亡、塔前停止與 Replay。
- v3 首波由 60s 提前到 25s；英雄一般／交戰移速由 5.90/7.07 小幅降至
  5.60/6.71。首波週期、傷害、經濟、塔血與勝率公式未改。
- 既有英雄交戰 tick 附加 `role:basic|power` 技能事件；傷害、CD 與 RNG 次數不變。
  runtime-v2 使用固定三池 InstancedMesh 顯示彈道、爆發環與核心光體。
- 英雄由單一膠囊原型提升為四種可重用職業剪影：
  `guardian`、`skirmisher`、`arcanist`、`marksman`；沒有逐英雄完整模型或外部素材。
- 新 Replay frame 以可選 `mn` 與 `fx` 保存小兵／技能真值；舊
  `MobaReplay.v1` 無欄位時誠實顯示空兵線／空特效，不重跑 `LogicEngine`。
- H.2 的 map geometry、英雄導航、near/far、polygonOffset、depth/culling 修正均保留。

## 2. 架構與資料流

```text
LogicEngine v3
  ├─ lanes.top/mid/bot.{bm,rm}  → snapshot.lanes
  └─ pushFx(id/at/life/ability) → snapshot.fx
          ↓
mobaRuntimeMapAdapter
  ├─ adaptMinions（lane t 插值＋隊形＋H.2 isWalkable/projectToWalkable）
  ├─ adaptEffects（事件時刻／生命期／職業寬度）
  └─ adaptHeroes（role → archetype）
          ↓
MobaRuntimeView3D
  ├─ MobaRuntimeMinions（4×48 unit instances＋2×96 HP-bar instances）
  ├─ MobaRuntimeEffects（32 line＋16 ring＋16 orb instances）
  └─ MobaRuntimeHeroes（10 名，共用 geometry/material＋職業配件）
```

Replay 擷取仍由 `useBattleFeed` 每個 snapshot 呼叫 `captureReplayFrame`。位置主 frame
維持 2 秒間隔；短命技能事件先收進取樣窗，再寫入下一個 frame，播放時依事件 `at`
顯示，避免 0.65 秒事件落在兩個主 frame 間而遺失。

## 3. 參數與行為

| 項目 | H.2 | H.3 | 影響 |
|---|---:|---:|---|
| v3 `waveFirst` | 60s | **25s** | 英雄先到線，首波較早進場 |
| `wavePeriod` | 30s | **30s（不變）** | 不增加經濟／波次密度 |
| 每路每方每波 | 4 | **4（3 melee＋1 caster）** | 只增加呈現 metadata |
| v3 `moveSpeed` | 5.90 | **5.60** | 約慢 5% |
| v3 `fightSpeed` | 7.07 | **6.71** | 保留追擊／撤退速度差 |
| 小兵接觸距離 | 無停止 | **lane t 0.035** | 接線後不互穿 |
| 塔前停止 | 無停止 | **塔 t 外 0.046** | 仍落在既有 `<0.05` 塔反擊帶內 |
| FX 生命期 | 最短 0.35s | **最短 0.65s** | `DT_SIM=0.5` 下至少進一次 snapshot |

240-seed（30 分上限）結果：

| 指標 | H.2 定案 | H.3 |
|---|---:|---:|
| 結束率 | 231/240 | **226/240** |
| 藍／紅勝 | 48.8% / 47.5% | **47.9% / 46.3%** |
| 順序偏差 | 2.1pp | **1.7pp** |
| 平均／中位時長 | 25.05 / 24.85 分 | **24.67 / 24.60 分** |

結束率下降 5 場（2.1pp），但平均／中位沒有拖長，公平性沒有惡化。本輪不針對
勝率再調參，也沒有加入傷害、經濟或收尾倍率。

## 4. Replay 契約

- `MobaReplay.v1` 版本字串不變；新增欄位全部 optional，舊資料可讀。
- `mn`：六個固定群組（top/mid/bot × blue/red），每列
  `[numericId,t,hp,kind,slot,wave]`。
- `fx`：每列 `[kind,x,y,targetX,targetY,color,at,life,ability]`。
- 播放端只解碼保存資料；零 `LogicEngine` import、零 `.tick()`、零 Store／發獎寫入。
- seed 42 完整 26.3 分鐘實測：791 frames、1,687,797 bytes、平均 2,127
  bytes/frame、最大 3,677 bytes/frame、3,317 個 FX 事件，契約驗證通過。

## 5. 修改檔案

核心與節奏：

- `src/LogicEngine.js`
- `src/battle/moba/matchProgression.js`

runtime-v2 adapter／呈現：

- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/presentation/heroArchetypes.js`
- `src/battle/moba/render/MobaRuntimeMinions.jsx`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/runtimeDiagnostics.js`
- `src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx`

Replay：

- `src/platform/contracts/mobaReplay.js`
- `src/battle/moba/replay/replayBuffer.js`
- `src/battle/moba/replay/replayPresentationSource.js`

驗證／文件：

- `tools/check_moba_minions_h3.mjs`
- `review/moba-runtime/h3-runtime-presentation/*`
- `docs/handoff/05_Sprint紀錄.md`

未修改 `BattleResult.v2`、Progress/Reward、正式地圖結構、天賦、經濟或 route flow。

## 6. 自動驗證

| 驗證 | 結果 |
|---|---|
| `node tools/check_moba_minions_h3.mjs` | **22/22** |
| `node tools/check_moba_nav_h2.mjs` | **14 PASS / 0 FAIL** |
| `SKIP_NESTED=1 check_moba_presentation29b2` | **12/12** |
| `SKIP_NESTED=1 check_moba_controls29b3` | **18/18** |
| `SKIP_NESTED=1 check_moba_camera_replay29b6` | **16/16** |
| `node tools/regress.mjs` | **15/15**，平均 24.9 分 |
| `node tools/regress2.mjs` | **8/8**，20/20 結束 |
| `node tools/bench_moba_baseline.mjs --seeds 240` | exit 0；結果見 §3 |
| `npm run build` | exit 0 |
| `git diff --check` | exit 0 |

### `runtime29` 完整執行

完整巢狀執行 51 分 8 秒後為 **42/44**：

- S23–S27、regress、regress2、build 全部 exit 0。
- 唯一失敗為既有 Sprint28 §29：v2 40-seed 藍勝正序 55%／反序 35%，位移
  20pp，超過 ≤15pp 門檻；§30 因巢狀 `stats28` 同一失敗而連帶紅燈。
- 這不是 H.3 v3 回歸。將 `pushFx` 動態還原為 `09ce36c` 舊實作後，同組正反序
  160 場逐 seed winner 完全一致（0 場改變），仍為 55%／35%。
- H.2 報告已將「v2 RNG 抽樣順序跟 players 迭代順序走」列為 P1，且 H.2 當時
  完整 `runtime29` 本來就是未完成。本輪不修改歷史 v2、不放寬 verifier。

## 7. 正式 GameView 視覺／裝置診斷

網址：

`http://127.0.0.1:5173/ESMO-/?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1`

證據：

- [桌機 1440×900](./desktop_runtime_1440x900.png)
- [手機 390×844](./mobile_runtime_390x844.png)
- [手機診斷 430×844](./mobile_runtime_diag_430x844.png)

觀察：

- 正式 HUD、runtime-v2 地圖、英雄、小兵、塔、小地圖皆同場出現。
- 手機 320／360／390／430px 穩態 `scrollWidth === innerWidth`，Canvas 寬度同步，
  沒有水平溢出；手機隊伍面板維持焦點對位列。
- 乾淨新分頁沒有應用程式 console error；只有瀏覽器錢包 extension 自身 warning。
- WebGL2、`DEPTH_BITS=24`、camera near/far `35/1000`、depth=true、
  antialias=true、preserveDrawingBuffer=false。
- 桌機／手機尺寸約 210–228 draw calls、59k–77k triangles。
- 診斷取樣曾同時看到 10 heroes、64 minions、4 active FX，累積 21 FX events。

瀏覽器自動化分頁的 rAF 會被背景節流，面板 FPS 在 1–4 間跳動，**不得拿來當產品
FPS**。本輪只把 draw calls／triangles／物件數當結構證據；真機 FPS 仍待人工量測。

## 8. 已知限制與人工驗收

- 未在 Android 真機測 FPS、熱降頻、觸控 pan/pinch、safe area 或 GPU 特效辨識度。
- 未人工完整播放終局 Replay；Node 已驗證 frame、seek、舊格式 fallback 與不重算。
- 技能目前是職業級 `basic/power` 事件與程序化低面數特效，不是完整 Q/W/E/R 系統。
- 四種英雄外觀是可替換原型，不是最終英雄資產。
- 小兵隊形是呈現層展開；模擬仍以既有 lane `t` 為真值，避免改經濟／尋路契約。
- 30 分鐘結束率 226/240，較 H.2 少 5 場；45 分上限未重跑。
- H.2-flicker 的 Android 真機站點驗收狀態不因本輪桌面瀏覽器結果而變更。

## 9. Commit／回退

- `759bae7` — 小兵、節奏、runtime-v2 與 Replay `mn`
- `a87e379` — 職業原型、池化技能特效與 Replay `fx`
- 文件／診斷 commit：見本輪最終回報

整階段回退請由新到舊逐一 `git revert` 文件 commit、`a87e379`、`759bae7`。
若只回退技能／英雄原型，revert `a87e379`；若只回退兵線與節奏，需先處理後續 commit
相依，再 revert `759bae7`。禁止 `reset --hard`。

## 10. 下一步

1. Android 正式站人工驗收 FPS、技能辨識、小兵接線／死亡、觸控與 safe area。
2. 完整打一場並人工播放 Replay，確認技能事件時間感與小兵死亡轉場。
3. 另開專項處理 H.2 已知 v2 per-player RNG／迭代順序 P1；不可混入 H.3 收尾。
4. 驗收通過後再決定是否 push／部署；本輪依指示停在本機 commits。

## 11. H.3 桌機／手機人工視覺驗收（2026-07-29）

驗收基準：`HEAD f1f811b`。正式 GameView 測試網址：

- 桌機（建議 1440×900）：`http://127.0.0.1:5173/ESMO-/?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1`
- 手機（同網址，以 390×844 viewport 開啟）：`http://127.0.0.1:5173/ESMO-/?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1`

本次以正式 `GameView → runtime-v2` 進行短段 4× 觀察，沒有使用桌面手機尺寸模擬來宣稱 Android 通過：

- 桌機首波／交戰：診斷先看到 `48 minions`，10 秒後降至 `40 minions`，同時出現
  `2 active fx / 115 fx seen`；畫面可見雙方小兵沿中路與下路接線、在塔前停住，未見穿越塔、河道牆或主堡，亦未見長時間卡死。隊形為前後錯列的近戰／遠程小兵，移動方向一致。
- 手機首波／交戰：診斷由 `64 minions` 降至 `46 minions`，並看到
  `2 active fx / 76 fx seen`；390×844 畫面沒有水平溢出，HUD、地圖、塔、小地圖與焦點隊伍面板仍可辨識。
- 英雄原型：guardian 的盾、skirmisher 的雙刃、arcanist 的法杖／焦點、marksman 的發射器在中距離可由輪廓與標籤辨認；未看到原型互相錯配。
- 技能特效：畫面取樣時 FX 池確實有活動事件，且診斷累積計數持續增加；特效只在交戰附近短暫出現，未覆蓋 HUD 或造成明顯視覺干擾。瀏覽器畫面未能穩定捕捉每一種 FX 的單幀細節，故辨識度仍列真機人工確認。
- 閃爍／WebGL：桌機與手機 viewport 皆回報 `DEPTH_BITS=24`、`WebGL 2`、`depth=true`、camera `near/far=35/1000`；本次瀏覽器觀察未見 H.2 地面／牆體閃爍。
- Replay：`check_moba_minions_h3` 與 Replay verifier 已確認 frame 內含 `mn` 小兵與 `fx` 技能事件、seek 與舊格式 fallback；本次尚未人工完整播放終局 Replay，因此不把 Replay 視覺辨識列為完全通過。

結論：桌機與 390px 手機 viewport 的 H.3 呈現驗收通過，沒有發現需要立即修正的 H.3 UI／碰撞問題；未宣稱 Android 真機 FPS、熱降頻、觸控或完整 Replay 視覺已通過。瀏覽器自動化 FPS 受背景 rAF 節流影響，不能替代 Android 真機量測。等待使用者確認是否進行 push／正式部署。

## 12. H.3 push／Pages 部署（2026-07-29）

- H.3 驗收 commit `9e754fe` 已推送 `main`。
- GitHub Actions run `30414201468`：build、deploy jobs 均 `success`。
- GitHub Pages deployment `5650235527`：`success`；正式網址：<https://rayhuang0323.github.io/ESMO-/>。
- 本次只同步本文件與 Sprint 紀錄，未加入任何既有未追蹤舊產物；Android 真機項目仍見 §11。
