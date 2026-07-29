# Milestone D — Combat Presentation & Runtime Data Integration

日期：2026-07-29  
狀態：本機完成；待人工／Android 真機驗收；未 push、未部署  
rollback：`milestone-d-baseline` →
`cb0dad27233dfed053c3e58434090d96f84d23d5`

## 1. 交付摘要

本輪修復正式 `GameView → runtime-v2` 的戰鬥呈現與 runtime 資料整合，沒有以 debug
harness 或 verifier-only 元件代替正式畫面：

1. 塔攻擊由舊白色範圍圈主導，改為可辨識的蓄能、單體追蹤彈體、飛行尾跡、命中爆點
   與同源扣血／受擊。
2. 英雄普攻與技能的 cast、travel、impact、damage、hit reaction 延長至正常 1×
   可讀窗口；六職業沿用各自武器、輪廓與施法語彙。
3. 世界畫面、隊伍面板、runtime snapshot 與 Replay 統一使用正式 match level。
4. 頭頂資訊重排成名稱／等級、血條、Buff／狀態；手機遠景降低次要文字干擾。
5. Dragon／Baron 具獨立 HP、攻擊、受擊、死亡、重生與同步 Boss HUD。
6. 紅／藍 Buff 由實際擊殺英雄取得、限時生效，且 snapshot／面板／Replay 一致。
7. runtime-v2 接上正式 camera store 與平滑自動導播，可關閉並恢復原自由視角。

## 2. 根因與修正

### 2.1 塔與英雄 FX

`LogicEngine.pushFx` 原先允許事件提供的短 `life` 直接繞過呈現層最低可讀時間；正式
runtime 因此常只看到較醒目的舊白圈，看不到彈體與技能完整階段。現在依事件類型設定：

- tower：3.4 秒
- skill／ult：4.2 秒
- attack／line：2.8 秒

`MobaRuntimeEffects` 仍讀正式事件的 `sourceId`／`targetId`，每幀解析目前位置：
tower cast 顯示塔冠蓄能，travel 顯示單一球形彈體與短尾跡，impact 顯示緊湊爆點。
傷害仍由引擎決定，renderer 沒有另算命中或 HP。

六職業的呈現資料鏈為：

```text
LogicEngine event / hit state
  → snapshot
  → mobaRuntimeMapAdapter / presentation source
  → MobaRuntimeEffects + MobaRuntimeHeroes
  → formal GameView
  → replayBuffer / replayPresentationSource
```

diagnostics 模式在正式 GameView 顯示最近 active effects 的
class／ability／phase／progress／source／target，僅供驗收，不寫回模擬。

### 2.2 等級與頭頂資訊

不同 UI 曾混用初始 roster `lv` 與比賽內 `mlv`，造成世界等級與隊伍面板不同步。
frame 現保存 `mlv ?? lv`；Replay 重建同一欄位；隊伍列與世界名牌也使用同一 fallback。
沒有建立第二套等級公式。

頭頂資訊改為：

```text
名稱／等級
血條
Buff／狀態圖示與剩餘時間
```

手機遠景縮小或省略次要文字，隊伍色仍由腳環、腰帶、血條標記與名牌細邊辨識。

### 2.3 Dragon／Baron

先前地圖上存在靜態 Boss 外觀，但正式 runtime 的互動狀態不足，也容易和動態物件重複。
本輪移除靜態重複來源，讓兩隻 Boss 直接由 runtime snapshot 驅動：

- individual HP／alive／respawn
- target／attackAt／hitAt
- 受擊與攻擊動作
- 死亡、清場及重生
- 地圖模型與頂部 Boss HUD 同源

較高 Boss 傷害曾使 v3 pacing 順序敏感。經模組注入二分定位後，Boss 攻擊採 1 HP
呈現型傷害，保留攻擊與命中回饋，同時不改既有勝負／公平性曲線。

### 2.4 紅／藍 Buff

紅、藍 Buff 保留不同正式模型、顏色與圖示，且由 camp 的實際擊殺者取得：

- Red：攻擊附加效果、1.06 damage multiplier 與 slow。
- Blue：技能冷卻、移動與資源恢復型戰鬥增益。

Buff 有限時效；剩餘時間由 snapshot 傳到英雄頭頂、面板及 Replay。Replay frame 僅新增
optional `bf`，舊 frame 缺欄位時仍可讀，contract 未升版，播放仍為已存 frame 而不是
重跑引擎。

### 2.5 自動導播

根因是 runtime-v2 的 R3F camera 沒有使用正式 `BattleCameraController`，輸入只改
camera store，實際鏡頭由另一條路徑控制。現在：

- `BattleCameraController` 是唯一 camera writer。
- runtime camera input 只寫 store。
- 高價值事件包含多人團戰、Dragon／Baron、推塔與擊殺。
- 導播以平滑 position／zoom 移動，不瞬移。
- 關閉時立即恢復啟用前的自由視角；再次點擊可重新啟用。
- 導播狀態不進戰鬥 snapshot，不影響結果或 Replay contract。

正式驗收另發現導播按鈕雖可見，卻被隊伍列的互動區域覆蓋；本輪加入桌機／手機不同的
底部安全位置後，正式 GameView 已可切換 ON／OFF。

## 3. 修改檔案

### Runtime／引擎／資料

- `src/LogicEngine.js`
- `src/battle/moba/map/MobaMapBlockout.jsx`
- `src/battle/moba/map/mobaRuntimeMapAdapter.js`
- `src/battle/moba/matchProgression.js`
- `src/battle/moba/replay/replayBuffer.js`
- `src/battle/moba/replay/replayPresentationSource.js`
- `src/platform/contracts/mobaReplay.js`

### Renderer／HUD／camera

- `src/GameView.jsx`
- `src/battle/cameraStore.js`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeNeutrals.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx`
- `src/battle/moba/render/runtimeDiagnostics.js`
- `src/battle/ui/BattleCameraController.jsx`
- `src/battle/ui/BattleHeroStrip.jsx`
- `src/battle/ui/BattleHUD.jsx`
- `src/battle/ui/battleLayout.js`
- `src/screens/moba/MobaReplayScreen.jsx`

### Verifier／文件／證據

- `tools/check_moba_milestone_c_fix.mjs`
- `tools/check_moba_milestone_d.mjs`
- `docs/handoff/05_Sprint紀錄.md`
- `review/moba-runtime/milestone-d/MILESTONE_D_REPORT.md`
- `review/moba-runtime/milestone-d/evidence/README.md`
- `review/moba-runtime/milestone-d/evidence/*.png`

## 4. 驗證結果

| 驗證 | 結果 |
|---|---|
| `node tools/check_moba_milestone_d.mjs` | PASS |
| D verifier 摘要 | tower 3.4、skill 4.2、level 5、boss damage 1、buff Replay 75s、camera restore `(42,77)` |
| `node tools/check_moba_milestone_c_fix.mjs` | PASS |
| `SKIP_NESTED=1 node tools/check_moba_pacing29b1.mjs` | 25/25；v3 order shift 0pp |
| `npm.cmd run build` | PASS；2595 modules；只有 chunk size warning |
| `git diff --check` | PASS；無 whitespace error |
| `node tools/check_moba_runtime29.mjs` | 43/44，exit 1 |

### runtime29 唯一紅燈判讀

完整 runtime29 的 Sprint23–28、regress、regress2 與 build 均通過。唯一失敗是 v2
array order：forward 22/40（55%）、reverse 14/40（35%），shift 20pp，大於現役 15pp。

為排除本輪改動造成公平性退化，使用完全相同的 40 seeds 對：

1. Milestone D 現況
2. `milestone-d-baseline` 的獨立 source

進行同一檢查。兩者勝場、百分比、shift 與 changed seeds 完全相同。因此這是 rollback
baseline 已存在的抽樣紅燈；本輪沒有修改 v2、公平性基線、seed、門檻或 verifier
來掩蓋結果。直接受影響的 v3 pacing 為 25/25、正反序 20/40 對 20/40。

## 5. 正式 GameView 驗收

驗收路徑：

```text
Dashboard → MOBA → lineup → matchmaking → Ban/Pick
→ Tactic → GameView → Result → Watch Replay
```

- Desktop：1440×900
- Mobile viewport：390×844
- 手機 viewport `scrollWidth == clientWidth`，未見水平溢出。
- 使用正式 GameView；`?diag=1&debug=1` 只開啟診斷文字，不切換 debug battle harness。
- 圖片與逐張說明：`review/moba-runtime/milestone-d/evidence/README.md`。

## 6. 分階段 commits 與 rollback

- `7b84cbf` — Milestone D1: repair combat presentation data chain
- `448cf6d` — Milestone D2: integrate bosses and combat buffs
- `1afae71` — Milestone D3: connect runtime auto director and verifier
- `eb6f17c` — Milestone D4: close formal GameView acceptance gaps
- 最後文件／證據 commit：以本報告交付時的目前本機 commit 為準。

rollback tag：`milestone-d-baseline`  
baseline commit：`cb0dad27233dfed053c3e58434090d96f84d23d5`

需要回退時應對 Milestone D commits 使用 `git revert`；不可 `git reset --hard`。

## 7. 尚需人工驗收

- 正常 1× 長局中，塔彈的蓄能／飛行／命中手感及連續鎖定節奏。
- 六職業在多人混戰、手機遠景下的 cast／travel／impact 辨識與遮擋程度。
- Dragon／Baron 長時間戰鬥、死亡、重生及 HUD 動態同步。
- 紅／藍 Buff 實際取得、到期、角色死亡與 Replay 時序體感。
- 導播在不同高價值事件間的鏡頭選擇、縮放與恢復自由視角手感。
- Android 真機 FPS、熱降頻、觸控、safe area、WebGL driver 與 H.2 閃爍。

390×844 證據是桌面瀏覽器 viewport 模擬，不宣稱 Android 真機通過。

## 8. 人工入口與範圍邊界

正式入口：

`http://127.0.0.1:5187/ESMO-/`

需要驗收事件資料列：

`http://127.0.0.1:5187/ESMO-/?diag=1&debug=1`

先前的 `?debug=moba-runtime-battle&mapPresentation=runtime-v2` 是 debug harness，可用於
開發定位，但不作 Milestone D 正式驗收。

本輪沒有 push、部署或開始下一階段；既有 terrain、bug、影片、backup、logs、
blend／glb 與 map review 產物均未納入。
