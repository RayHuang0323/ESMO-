# ESMO Battle Data Architecture（Sprint09 制定）

## 一、資料流總圖（Battle Data Flow）
```
LogicEngine.tick()（純 JS，Node 可驗，唯一模擬來源）
   ↓ snapshot（對戰期間的唯一真相）
useLocalServer → useGameStore.pushFrame
   ↓（單向）
useBattleFeed.ingest
   ├─ BattleEventTracker → events(UI截斷) / log(完整)   ← 純推導自快照流
   ├─ ingestReducer     → derived / series(15s取樣) / mvp ← 純推導自快照
   └─ 終局(over) 且 result 尚未存在時【唯一計算點】：
        result = snapshotToBattleResult(snap, log)   ← 全對局只執行一次
        ├→ battleStore.result       → BattleEndScreen（賽後真相）
        ├→ heroProgressStore.record → Hero Progress（成長閉環）
        └→ seasonStore.record       → Season / History / Ranking / Analytics
```

## 二、唯一來源（Single Sources of Truth）
| 資料 | 唯一來源 | 檔案 |
|---|---|---|
| 對戰即時狀態 | Engine snapshot | LogicEngine.js |
| 賽後結果 | BattleResult v2（唯一計算點產出） | battle/battleResult.js |
| 英雄資料（MOBA） | CHAMPIONS_100 | data/heroDatabase.js（抽自 Legacy line 1770，逐字） |
| 名單/指派 | ROSTER / HERO_ASSIGN | data/roster.js |
| 英雄成長 | heroProgress 模型 | hero/heroProgress.js（唯一 EXP/等級/Mastery） |
| 賽季史 | seasonStore.history（BattleResult[]） | platform/seasonStore.js |

## 三、衍生資料（皆為上述來源的純推導，可隨時重建）
events / log / series / derived / spectatorFocus（快照流推導）；
standings / playerRanking / analytics（BattleResult 推導，platform/seasonData.js）；
HUD / Timeline / MiniMap / Floating / Overlay（快照即時呈現）。

## 四、禁止重新統計（Hard Rules）
1. `snapshotToBattleResult` 只允許在 useBattleFeed 終局處呼叫一次。
2. EndScreen / Hero Page / Season 各畫面禁止從 snapshot 重算賽後數據，一律讀 BattleResult。
3. `playerRating()` / `participation()` 是**共用純公式**：對戰中記分板以快照即時代入、終局由唯一計算點代入——同一公式同一來源，非重複統計（check_flow09 驗證兩者一致）。
4. 不得建立第二套 BattleResult / Hero State / EXP / History。

## 五、Hero / Player 關係
```
MOBA：Player(選手, roster.js) ──操作──▶ Hero(CHAMPIONS_100, heroDatabase.js)
        └ heroId 為 Hero Progress 主鍵（跨場成長）
CS  ：Player ──操作──▶ Weapon（Legacy EsportsGame.jsx 內聯，未整合主幹；
        禁止在 CS 模式引入 Hero/QWER 概念）
```

## 六、BattleResult v2 Schema
```
{ schema:"BattleResult.v2", mode:"moba",
  teams:{blue:{name,emoji},red:{...}}, winner, duration,
  score:{blue,red}, gold:{blue,red}, towers:{blue,red},
  dragon:{blue,red}, baron:{blue,red},
  timeline:[{t,type,side,text,data}],   // 完整事件（type 見 battleEvents.js）
  mvpId,
  players:[{id,side,role,heroId,lv,k,d,a,gold,dmg,heal,twrDmg,
            participation,rating,won,mvp}] }
```

## 七、Snapshot Schema（引擎契約，Sprint05–08 累積）
```
{ ts, over, winner, bK,rK, bGold,rGold, winProb,
  players:[{id,side,role,pos,hp,dead,respawn,state,k,d,a,gold,dmg,heal,twrDmg,lv}],
  towers:[{side,lane,tier,t,pos,hp}], dragon:{alive,respawn}, baron:{...},
  feed:[{killer,victim,side,assists,vpos}] }
```

## 八、Battle Detail 擴充路徑（不改 Engine 契約、不改資料結構）
新增英雄細節（技能/裝備/符文/Buff）時：
1. 引擎在 players 內**附加**新欄位（如 items:[]、buffs:[]）——既有欄位不動；
2. BattleEventTracker **附加**新事件 type（如 ITEM_BOUGHT）——timeline 自動涵蓋；
3. BattleResult 版本升 v3，消費者以 schema 欄位辨識；v2 消費邏輯不受影響。
