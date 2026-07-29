# Milestone D 正式 GameView 證據索引

所有圖片均由正式 Dashboard → MOBA → Draft → Tactic → GameView 流程取得；
`diag` 只顯示 runtime 已有事件與狀態，不切換 debug battle harness。

| 檔案 | 尺寸／內容 | 對應驗收 |
|---|---|---|
| `01-desktop-level-sync.png` | 1440×900 正式實戰 | 世界名牌與隊伍面板等級一致 |
| `02-director-on-desktop.png` | 桌機，導播 ON | 自動追焦已啟用 |
| `03-baron-hud-and-combat.png` | Baron 場景 | BARON 3000/3000 HUD、正式模型與戰鬥狀態 |
| `04-buff-and-level-panel.png` | 世界＋面板 | 紅 Buff timeline、頭頂 Buff 與等級資料 |
| `05-director-off.png` | 桌機，導播 OFF | 按鈕可操作並回到自由視角 |
| `06-mobile-390x844-gameview.png` | 390×844 正式實戰 | 手機 viewport、頭頂資訊與 HUD 無水平溢出 |
| `07-replay-level-buff-consistency.png` | Result → Watch Replay | Replay 等級／Buff state 與正式 frame 一致 |
| `08-tower-projectile-travel-impact.png` | 正式實戰＋FX 診斷 | tower cast／travel／impact 同時可追溯 |
| `09a-skill-cast-travel.png` | 正式實戰＋FX 診斷 | mage/support skill cast／travel |
| `09b-skill-impact-hit.png` | 正式實戰＋FX 診斷 | support impact/hit 與 marksman cast／travel |

## 截圖當下事件摘要

`08-tower-projectile-travel-impact.png`：

```text
tower fx impact@0.055:blue_mid_2>r3
travel@0.725 / 0.419 / 0.113:blue_mid_2>r3
cast@0.613 / 0:blue_mid_2>r3
```

`09a-skill-cast-travel.png`：

```text
support/nova:travel@0.492
mage/nova:travel@0.244
mage/bolt:travel@0.244
mage/nova:cast@0.496
```

`09b-skill-impact-hit.png`：

```text
support/twinSlash:impact@0.405
marksman/bolt:travel@0.74
marksman/bolt:cast@0
```

## 限制

- 截圖能證明正式 renderer 已收到並顯示各 phase，但無法取代 1× 動態手感驗收。
- 390×844 為桌面瀏覽器 viewport 模擬，不是 Android 真機。
- Android FPS、熱降頻、觸控、safe area、WebGL driver 與 H.2 閃爍仍待人工實測。
