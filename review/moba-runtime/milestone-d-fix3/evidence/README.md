# Milestone D-fix3 視覺證據索引

## 正式完整流程

- `01-desktop-formal-gameview-1x.png`
  - Dashboard → MOBA → Lineup → Matchmaking → Ban/Pick → Tactic → 正式 GameView。
  - 桌面、正常 1×；現行版本已移除英雄頭頂 Buff 文字。
- `05-desktop-formal-nameplate-no-overhead-buff-text.png`
  - WebGL 名稱／本場等級與完整 HP bar；Buff 僅以低干擾環繞效果顯示。
- `06-formal-replay-runtime-v2.png`
  - 同場 Result → Watch Replay；正式 runtime-v2 3D 戰場與 1×／播放控制。

## 補充正式 GameView 元件證據

- `02-desktop-formal-1x-fx-frame-a.png`
- `03-desktop-formal-1x-fx-frame-b.png`
- `04-desktop-formal-1x-fx-frame-c.png`
  - 正常 1×、約 150ms 間隔；可見青色 travel 與白熱／隊色 impact 的位置變化。
  - 使用專案既有 `?debug=moba-runtime-battle` 直接掛載同一正式 `<GameView autoStart>`
    入口，以便穩定抓連續影格；只作補充，不取代上一節完整流程證據。

## 390×844

- `mobile-390/07_runtime_mobile.png` — medium
- `mobile-390/08_runtime_mobile_low.png` — low
- `mobile-390/shot_stats.json`
- `mobile-390/runtime_performance.json`

`shot_stats.json` 實測：

- viewport：390×844
- `isFormalGameView: true`
- heroCount：10
- debug map UI：0
- minimap 與 team panel overlap：false
- minimap 位於 viewport 內：true

兩張手機圖使用正式 GameView 截圖入口，並非 Android 真機。SwiftShader 效能數字不可當作
正式 FPS；只驗版面與元件存在。完整手機賽前流程、觸控、safe area、FPS、熱降頻與
WebGL driver 仍由部署版 Android 人工驗收。

## 動態／數值補充

- D-fix3 verifier 固定塔彈 phase：
  `cast → travel(0.156) → travel(0.500) → travel(0.844) → impact`。
- 截圖可證外觀與位置，不用事件數量冒充動態手感；塔彈的長時間 1× 觀感仍列 Android
  人工驗收。
