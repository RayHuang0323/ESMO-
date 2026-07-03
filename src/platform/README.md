# src/platform/ — Game Router 骨架（Phase 2）

> 狀態：骨架完成，**尚未接線**。本階段零修改：EsportsGame.jsx、App.jsx、
> LogicEngine.js、EsportsFPS3D、MobaView3D 全部原封不動。
> 對標專業經營模擬遊戲（FM 模式）：Router 純邏輯、可序列化、可 Node headless
> 執行 → 未來賽季批次模擬直接重用。

## 目錄結構

```
src/platform/
├── index.js                        對外唯一出口（宿主只 import 這裡）
├── router/
│   ├── stages.js                   Stage / GameType / RouterEvent 常數（單一真實來源）
│   ├── matchFlows.js               各遊戲流程定義（純資料；加新遊戲=加一筆）
│   └── GameRouter.js               狀態機本體（純 JS，零 React / 零引擎相依）
└── contracts/
    ├── BattleConfig.js             引擎唯一輸入（= 現役 FPS 引擎 props 正名）
    ├── BattleResult.js             引擎唯一輸出（= buildMatchResult / recordMatch 現況正名）
    └── BattleEngineInterface.js    邊界規範 + toEngineProps 純映射
```

## Router Flow

```
                 ┌────────────────── back（第一階段再退 → EXIT）
                 ▼
  MOBA: prep → matching → draft → tactic → battle ──→ result
  FPS : prep → matching ─────────→ tactic → battle ──→ result
  Game3: 同 FPS 流程（placeholder；enterBattle 被守門擋下）
                                      │                  │
                        next() 守門：  │                  └ back → EXIT
                        ① placeholder 擋下               （對照現行 fpsBack）
                        ② validateBattleConfig
                                      │
                                      ▼ emit BATTLE_START(battleConfig)
                          宿主依 gameType 掛載引擎元件
                          <Engine {...toEngineProps(cfg, onComplete)} />
                                      │
                          onComplete(result)（引擎唯一輸出）
                                      │
                          router.completeBattle(result)
                                      │ validateBattleResult
                                      ▼ emit BATTLE_COMPLETE(result)
                          宿主 game.recordMatch(result) 回寫經營層
```

邊界鐵律：Router 永不 import 引擎；引擎永不知道 Router 存在（只認識
props + onComplete）。掛哪個引擎（2D/3D 切換）永遠是宿主的決定 → Strangler。

## 合約摘要

**BattleConfig（輸入）**：`gameType / seed / mapKey / roster / opponent /
tactic / tacticType / oppTactic / teamName / oppName / embedded / extra{}`
— 欄位名 = 現役內聯 EsportsFPS3D props，FPS 引擎未來零修改可吃。
seed 為決定性重播鍵（必填）。

**BattleResult（輸出）**：必填只有 `win`＋`mode`（相容 MOBA 現況
`{win, mode:"MOBA"}`）；FPS 欄位 = buildMatchResult 現行輸出
（scoreT/scoreCT/players/ourPlayers/mvp/rounds…，**禁止改名**，
recordMatch 靠這些回寫 KDA 與成長管線）；路由層新增 gameType/engine/
seed/durationSec（recordMatch 自動忽略，零風險）。

## 未來要搬的（之後的 Phase，本次不動）

| 現況位置 | 未來去向 |
|---|---|
| EsportsGameInner 的 mobaStage / fpsStage useState 狀態機 | 改由 GameRouter 驅動（接線，非重寫 UI） |
| toFpsRoster()、CS_MAP_KEYS 隨機、csSeed 隨機 | 平台側 config 組裝 adapter → setBattleConfig() |
| 內聯 __FPS3D_MODULE（EsportsGame 行 10–1760） | src/battle/fps/（單一真實來源；獨立 task） |
| MOBA 結算 recordMatch({win, mode:"MOBA"}) 呼叫點 | resultAdapter：snapshot → 完整 BattleResult |

## 完全不用動的

LogicEngine.js、gameData.js、useGameStore.js、useLocalServer.js、
MobaView3D.jsx、GameView.jsx、App.jsx、EsportsGame.jsx（本次零修改）、
EsportsFPS3D 對戰邏輯、全部 21 個平台模組、GameProvider/GameContext、
2D MobaModule / FpsModule（保留為並行回退模式）。
