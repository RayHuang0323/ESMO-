# ESMO Design System v1

> 第一個正式落地畫面：Home / Team Command Center。這份文件定義視覺與互動語言，
> 不改遊戲流程、資料契約、Store schema 或戰鬥邏輯。

## 1. 品牌方向

ESMO 是 **Modern Esports Management / Team Command Center**：玩家不是在看一般
SaaS 報表，而是在管理一支準備上場的戰隊。

本版採「midnight arena command deck」作為 Home 的第一個 scene：深色是場景基底，
不是品牌唯一答案。未來可以在同一套 tokens 上建立較亮的 roster、player profile 或
tournament surface；辨識度來自資訊層級、arena ring、signal rail、mode accent 與
遊戲狀態，而不是每個元件都加 neon glow。

全遊戲遵守：

- 70% ESMO Global：字體階層、spacing、surface、border、button、badge、motion。
- 20% Game Mode Accent：MOBA 使用紫、CS 使用暖金、Tournament 使用金色系。
- 10% Scene-specific Effects：Home 的 command ring、環境光與局部 ambient motion。

## 2. Token source

`src/ui/theme.js` 的 `GC` 是現有色票來源；`src/ui/designSystem.js` 以 GC 建立
可共用的 Design System token，不改動舊畫面的既有 token 行為。

| Token | 角色 | v1 來源 |
| --- | --- | --- |
| `ink` | app / scene background | `GC.bg` |
| `surface` | 基礎卡片 | `GC.card` |
| `surfaceRaised` | hover / selected surface | `GC.card2` |
| `line` | 邊界與分隔 | `GC.line` |
| `signal` | 可用、進行中、正向狀態 | `GC.green` |
| `info` | Inbox / roster / navigation information | `GC.blue` |
| `moba` | MOBA mode accent | `GC.purp` |
| `tactical` | CS / warning / finance highlight | `GC.gold` |
| `danger` | negative / blocking state | `GC.red` |

## 3. Typography and layout

- Display、body 使用既有 `FONT` stack；utility / labels 使用 `MONO`。
- 一個畫面只保留一個主要 thesis；Home 的第一標題是戰隊身份，不是「Dashboard」。
- Hero 使用大標題、短說明與一條 XP rail；數值保留 context，不單獨漂浮。
- Card radius：hero 28px、card 18px、control 12px、pill 999px。
- 寬螢幕採 Hero → priority / next actions / club status → compete / utility。
- 900px 以下改為單欄主流程；520px 以下 action / mode / utility 重新排版，不能只縮小。
- 所有 card / grid child 必須允許 `min-width: 0`；Home 不應出現 horizontal overflow。

## 4. Icon and asset rules

`src/ui/EsmoIcon.jsx` 是 v1 的 stroke icon primitive：統一 stroke weight、尺寸與
navigation / status icon 語意。

- Navigation、status、CTA 優先使用 `lucide-react` icon，不使用 Emoji 當主要 UI icon。
- 戰隊隊徽、贊助商品牌或未來選手內容可以保留資料本身的 Emoji / artwork；它們是
  content identity，不是 navigation chrome。
- 本 Sprint 沒有引入大型 icon dependency，也沒有一次改造所有戰鬥／管理畫面資產。

## 5. Motion language v1

`src/screens/dashboard/useDashboardMotion.js` 使用 scoped `useGSAP`：

- Page entrance：同一方向的小幅 `opacity + y` stagger。
- XP rail：只 transform scale，不改 layout。
- Active signal：低頻率 pulse，提示狀態但不閃爍搶焦點。
- Ambient ring：極慢、低幅度漂移，建立場景生命力。
- Card hover / press：CSS elevation；touch 不依賴 hover。
- 所有 timeline 綁定 Dashboard root，離開畫面由 `useGSAP` / matchMedia cleanup。

`prefers-reduced-motion: reduce` 時直接呈現完成狀態、移除 movement 與 pulse，保留
顏色與文字狀態。瀏覽器若無法強制模擬該媒體偏好，交付時仍須以程式碼路徑與支援
標記誠實回報，不宣稱已完成真機體感驗收。

### 5.1 兩種實作路徑（2026-09-02 補）

**GSAP 只在需要 timeline 編排時才用。** 單純的進場、hover、pulse、一次性回饋用
純 CSS 就夠，不必為此加依賴：

| 情境 | 作法 | 參考 |
| --- | --- | --- |
| 多元素依序編排、需要 cleanup 的 timeline | scoped `useGSAP` | `src/screens/dashboard/useDashboardMotion.js` |
| 進場 stagger、hover／press、狀態 pulse、一次性完成回饋 | 畫面自己的 CSS 檔 + `@keyframes` | `src/screens/manage/clubMastery.css` |

CSS 路徑的 stagger 用 `animation-delay: var(--cm-delay)`，延遲值由 React 以 inline
custom property 帶入；`prefers-reduced-motion` 用一個 `@media` 區塊統一關掉。

**Accent 換色可以 transition。** CSS 自訂屬性本身不能 transition，但**用到它的
具體屬性**（`color` / `background` / `border-color`）可以——所以像 Club Mastery
那樣「切換流派 ⇒ 整頁換色」是順的，不是硬跳。

### 5.2 規則出處

Motion 的**允許／禁止清單**是全專案規則，住在 `AGENTS.md` §Motion Policy
（跨模型共用），不在本檔重複。本節只講在 ESMO 裡怎麼實作。

## 6. Data honesty and architecture boundary

Home 只讀現有 `profileStore` 資料與 `currentWeekPreview()` / `cashForecast()`，不在
呈現層重算財務、成長、配對或戰鬥結果。原有 `onMoba`、`onSeason`、`onNav` callback
維持不變；Active Match 只顯示既有 matchmaking/session 狀態，不建立第二條 resume
流程。

本版不得因此修改：

- GameRouter / AppShell screen state
- profile / persistence schema
- platform contracts / competition / season architecture
- matchmaking、battle simulation、replay、LogicEngine
- CS 亞洲賽季資料架構

## 7. Home v1 implementation map

| Surface | Home v1 treatment |
| --- | --- |
| Team Command Hero | team identity、season/week、level、XP、funds、achievement |
| Priority Action | existing matchmaking/session read-only summary |
| Next Actions | inbox、finance alert、talent、roster、training、recruit callbacks |
| Club Status | current week finance、9-week rhythm、roster、sponsor |
| Compete | MOBA / CS / 賽事 mode cards，共用 card language、各自 accent |
| Utility | team、training、recruit、new game、shop、dashboard、sponsor entrances |

這個文件與 Home component 是 v1；Team / Roster / Player / MOBA / CS / Tournament
後續只沿用語言，不在本 Sprint 擴大修改範圍。
