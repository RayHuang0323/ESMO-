# Milestone E 正式流程驗收證據

擷取工具：`tools/shot_milestone_e.mjs`（真實 Chrome + CDP，非 headless）
統計與逐條斷言：`shot_stats.json`

入口是**正式流程**，不是 debug harness：
`Dashboard →（➕ 招募簽下新秀）→ Lineup（🔁 換人）→ Matchmaking → Ban/Pick
→ Tactic → Loading → GameView → Result → Replay`。
除了比賽以測試模式的「⏩ 快速完成」推進到終局之外，每一步都是真的點畫面上的控制項。

本輪簽下的新秀：**Zywuu**（中路、`heroId = null` 未綁定英雄、Lv.1），指派到 **MID（席位 b3）**，
把種子選手 Frost 換下。

## 桌機 1600×1000（28/28 斷言通過）

| 檔案 | 內容 |
|---|---|
| `01-desktop-lineup-before.png` | 換人前：MID 是 Frost |
| `02-desktop-bench-sheet.png` | 🔁 換人面板：列出全部五人＋板凳新秀，標示「先發中／非本位／目前 TOP（點擊將互換）」 |
| `03-desktop-lineup-after.png` | 換人後：MID = Zywuu Lv.1，英雄沿用席位預設「冰霜術士」（新秀無綁定英雄） |
| `04-desktop-loading.png` | Loading 顯示的是 Zywuu，不是靜態名單 |
| `05-desktop-gameview.png` | 正式 GameView（掛載信標「ESMO 主幹」、無 debug 地圖 UI）；隊伍面板中路 = Zywuu |
| `06-desktop-talent-in-battle.png` | HeroDetailPanel 的「本場行為（天賦生效證據）」：撤退／參團／目標駐留＋注入說明 |
| `07-desktop-result.png` | 賽後戰報：Zywuu 在成長欄；「能力／天賦執行」與「戰術執行」兩個面板 |
| `08-desktop-replay.png` | Replay 拉到 21:34／29:47：標頭 `龍×1`／`龍×3`（新的 `tb` 欄）＋兩行本場播報（`replay.comms`） |

## 手機 390×844（21/21 斷言通過）

`01`–`07` 同上（不含 Replay；Replay 已在桌機驗過，避免重複負載）。
`05-mobile390-gameview.png` 為隊伍面板上滑展開後的狀態，中路列 = Zywuu。

## 本工具**不能**證明的事（誠實揭露）

1. **3D 名牌上的文字**：D-fix3 起名牌是 WebGL CanvasTexture，DOM 讀不到、
   `__ESMO_RUNTIME_DIAG` 也沒有這個欄位 ⇒ 只能由人眼看截圖確認。
   本輪兩張 GameView 截圖分別在比賽鐘 0:15／1:03，英雄多半還在泉水附近，
   名牌不夠大 —— **「新秀姓名出現在 3D 名牌」這一項仍需 Ray 目視確認**。
   （隊伍面板、Loading、賽後戰報三處已由斷言證明。）
2. Android 真機的 FPS、熱降頻、觸控手感、WebGL driver。
3. `__ESMO_RUNTIME_DIAG` 只在 `?diag=1` 掛載；正式流程沒有它是預期行為，
   本工具不為了湊數字而在驗收流程強加 diag 旗標。

## 順帶記錄到的既有現象（非 Milestone E 造成，未修）

- **Replay 的戰場呈現預設仍是 legacy**：`MobaReplayScreen` 走
  `loadMapPresentation()`（預設 `legacy`），而正式 GameView 自 H.1 起固定
  runtime-v2 ⇒ 同一場比賽的「現場」與「重播」不是同一套戰場外觀
  （`08-desktop-replay.png` 的地圖與 `05-desktop-gameview.png` 明顯不同）。
  Milestone E 新增的團隊 Buff 與播報列在兩種模式下都會顯示。
- **世界標籤會蓋在英雄詳情面板上**：`06-desktop-talent-in-battle.png` 可看到
  「BLUE BUFF · 藍」「首次刷新 11s」壓在面板上方。屬既有的疊層順序問題。
