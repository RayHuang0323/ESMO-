# MOBA 重播系統（Sprint26 MVP）

## 鐵律

> **重播 = 播放已保存的 frames。不是重跑 LogicEngine。**

同一個原則 CS 已在用：`EsportsFPS3D` 先把整場算完，再對 frames 做
play / pause / speed / seek。MOBA 重播照同一個思路，只是 frames
來自現場對戰時的取樣，而不是預先模擬。

播放器（`MobaReplayScreen`）**零 LogicEngine import、零 `.tick()` 呼叫、
零 Store import** —— 重播在物理上不可能再次發獎、再次入史、再次改
money / fans / XP（驗證見 `check_moba_experience26` 第 10–12、18 項）。

## MobaReplay.v1 契約

`src/platform/contracts/mobaReplay.js`

```js
{
  version: "MobaReplay.v1",
  replayId,            // "rp-" + matchId
  matchId,             // 與賽後結算同源（mobaMatchId(result)）→ Result 可比對「這一場」
  seed,                // 引擎 seed（useLocalServer.start 唯一拿得到的位置）
  config,              // { tacticId, tacticName, opponentTacticId }
  startedAt, finishedAt,
  duration,            // = 最後一格 frame.t（模擬秒）
  frameInterval,       // 2（取樣間隔，模擬秒）
  frames: [...],       // 見下
  events: [...],       // battleStore.log 摘要 { t, type, side, text }
  playersMeta,         // [{id, side, role}] — frame.p 的固定順序（只存一次）
  towersMeta,          // { towerId: {side, lane, pos} } — 位置只存一次
  resultSummary,       // { winner, score, duration, mvpId }
  truncated,           // 超過 MAX_FRAMES 時尾段未收錄
}
```

### frame（緊湊格式，只存重播必要資料）

```js
{ t,                                      // 模擬秒
  p: [[x,y,hp,dead,k,d,a,gold,lv] ×10],   // 依 playersMeta 固定順序
  tw: { towerId: hpRatio },               // 塔血（位置在 towersMeta）
  dr: 0|1, br: 0|1,                       // 小龍 / 巴龍存活
  s: [bK,rK], g: [bGold,rGold], wp }      // 比分 / 經濟 / 勝率
```

不存 React 元件、Three.js 物件或函式；契約驗證含
「JSON round-trip 後仍合法」。fx / feed 不逐幀存——擊殺等呈現走
events（battleStore.log 本來就有完整事件 + 時間戳）。

## frame capture 策略

```
useLocalServer.start()   → beginReplayCapture({seed, tactic})   ← seed 唯一來源
useBattleFeed（每幀）     → captureReplayFrame(snap)             ← 2 模擬秒取樣一格
useBattleFeed（終局）     → finalizeReplay({matchId, events, resultSummary})
```

- 取樣間隔 2 模擬秒 + 播放時**位置線性插值** → 平順且不重算。
- 終局幀必收（比分 / 塔況收尾正確）。
- 首幀同時記 `playersMeta` / `towersMeta`（不逐幀重複）。
- 擷取只「讀」snapshot——實測同 seed 擷取前後 `BattleResult`
  位元一致（第 18 項），balance baseline 不受影響。

## 容量與持久化邊界

實測（seed 99，17 分鐘場）：**503 frames、345KB、每 frame ≈ 703B**。

- `MAX_FRAMES = 1200`（≈ 40 分鐘）——到頂**停止擷取**並標 `truncated`，
  不無限成長。上限容量 ≈ 0.85MB。
- **不寫 localStorage**：5MB 配額已被 profile / season / heroProgress 佔用，
  塞 0.3–0.9MB/場 的 frames 不合適 → **只保存當前 session 的最近一場
  （模組記憶體，`replayBuffer.js`）**。重整頁面後重播消失，
  Result 顯示「無法重播」，這是明示的第一版邊界。
- replay metadata（matchId / resultSummary）如未來要進 Store 供歷史頁
  顯示「本場曾有重播」，只存 metadata、不存 frames。

## Playback Controls（§7 全數）

| 控制 | 實作 |
|---|---|
| 播放 / 暫停 | 100ms 時鐘：`t += 0.1 × speed × SIM_PER_REAL`（只推時間軸） |
| ±10 秒 | `seek(t ± 10)`，clamp `[0, duration]`（不越界） |
| 上一 / 下一事件 | 以 events 的 `t` 跳轉 |
| 0.5× / 1× / 2× / 4× | `REPLAY_SPEEDS`；1× = 現場對戰節奏（0.5 sim-s / 130ms） |
| timeline slider | `<input type=range>` 0..duration，step 0.5 |
| 時間 | `fmtT(t) / fmtT(duration)` |
| 返回 Result | 關閉 overlay |

frame 定位用二分搜尋；空 frames 安全回 null（無重播不白畫面）。

## Result 入口

`BattleEndScreen`：

- `canReplay = replay 存在 && replay.matchId === mobaMatchId(result)`
  —— matchId 與結算**同源**，不會播到別場。
- 可重播 → 「▶ 觀看重播」；不可 → 顯示「無法重播」（不可點、
  不白畫面、**不重新模擬另一場**）。
- 重播以 **overlay** 開啟（不走 AppShell 路由）。原因：AppShell 離開
  `battle` 畫面再回來會重掛載 GameView，`autoStart` effect 會**直接開新的
  一場**——這是路由方案的真實坑，overlay 是刻意的架構決定。

## 不重複結算保證

| 層 | 保證 |
|---|---|
| 播放器 | 零 LogicEngine / profileStore / seasonStore import（靜態驗證） |
| 緩衝 | 只讀 snapshot；零結算呼叫 |
| 結算本身 | S25 冪等（transactionId 帳本）——就算有人手滑重觸發也不重複發 |
| 實測 | 掃全 frames 播放前後，結算 state JSON 位元一致 |

## 未來（本 Sprint 不做）

- **事件導播**：以 events 加權（ACE / BARON / 多殺）自動跳「精彩片段」；
  frames 已含事件時間戳，只需在播放器加 chapter 清單。
- **精彩片段（Highlights）**：事件前後 ±8s 的 frame 區段清單化。
- **持久化多場**：改 IndexedDB（配額大）存最近 N 場 + delta 壓縮
  （相鄰 frame 只存變化欄位，估可再省 ~60%）。
- **3D 重播**：把 frames 餵回 MobaView3D 的呈現層。前提：播放管線與
  live 管線（useGameStore/useBattleFeed）完全隔離，否則會誤觸發終局結算。
