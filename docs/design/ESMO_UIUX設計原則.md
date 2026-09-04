# ESMO UI/UX 設計原則（全域）

> 建立日期：2026-09-04
> 適用範圍：**所有玩家端畫面**（首頁、經營、育成、賽事、對戰 HUD、結算、商店…）。
> 位階：本檔是 ESMO 的**全域 UI/UX 通則**，AGENTS.md §UI 呈現原則只放一行引用，
> 詳細規則一律以本檔為準。

---

## 0. 一句話原則

**ESMO 是遊戲，不是企業後台。**

玩家打開任何一個畫面，第一眼要知道「現在的狀況」和「我要做什麼」，
而不是被迫先讀完一段規則說明。

未來所有玩家端 UI 必須優先：**輕、簡潔、易讀、有遊戲感、有資訊層級、
有適度動態、行動清楚、手機與桌機都容易操作。**

**禁止用大量說明文字填滿畫面。**

---

## 1. Progressive Disclosure（漸進揭露）

主畫面只顯示玩家**當下真正需要**的資訊。

詳細規則優先放到第二層：

- tooltip
- info icon（ⓘ）
- drawer / bottom sheet
- modal
- expandable detail（可展開區塊）
- help / rule section（規則頁）

**不要把完整系統規則直接塞在主卡片內。**

### 1.1 玩家端不得出現工程語言

除非是開發者模式（`src/ui/debugMode.js` 判定為 debug），否則玩家看到的必須是遊戲語言。

| 禁止出現（工程語言） | 玩家端該說 |
|---|---|
| authority / writer / canonical | 直接不提；顯示結果即可 |
| derived | 直接不提；顯示結果即可 |
| settlement | 「週結算」「賽後結算」 |
| persistence / schema / migration | 「存檔」「已儲存」 |
| contract / transaction | 「紀錄」「這場成績」 |
| 任何內部縮寫代號（CBR、v2、BO3 以外的內部代號） | 用完整中文名稱 |
| 錯誤碼、例外訊息 | 可讀中文（例：「這場成績已經結算過了」） |

判準：**如果一個詞只有寫程式的人看得懂，它就不該出現在玩家畫面上。**

---

## 2. Information Hierarchy（資訊層級）

每個畫面至少建立三層：

**第一層（一眼可見）**
- 核心數字
- 核心狀態
- 核心 CTA
- 「玩家現在要做什麼」

**第二層（同畫面，但視覺權重較低）**
- 一句短說明
- 進度（progress bar / milestone）
- 輕量提示（badge、tag、icon）

**第三層（預設收合）**
- 詳細規則
- 條件 / 門檻
- 數值來源與公式
- 補充說明

**第三層預設不要全部展開。**

---

## 3. 文字密度

### 避免

- 長段落
- 大量同權重文字（整片同字級同顏色）
- 一張卡塞 5～10 行說明
- 每個系統都在主畫面附完整規則

### 優先

- 短標題
- 1 行說明
- icon + 數值
- badge / tag
- progress bar
- tooltip
- detail drawer

**經驗法則：一張卡若需要超過 2～3 行說明，先評估是否應把說明拆到 detail layer，
而不是把卡變高。**

---

## 4. 一畫面一重點

每個主要頁面優先突出：

**1 個主要目標 + 1～2 個主要行動。**

不要同時要求玩家理解太多系統。

### 範例：Team Development

| 層級 | 內容 |
|---|---|
| 主畫面 | Available Points（可用點數）、Next Point Milestone（下一個里程碑）、Nodes（可投資節點） |
| detail layer | capability 公式、online policy、完整成長曲線說明 |

同樣邏輯套用到其他畫面：**先讓玩家能行動，想深入的人自己點開。**

---

## 5. Game UI Feel（遊戲感）

UI 不要只靠大量矩形卡片和文字堆疊。可適度使用：

- hierarchy（層級）
- depth（景深 / 陰影 / 疊層）
- glow（重點發光）
- ambient background（氛圍背景）
- iconography（圖示語言）
- motion（轉場與數值變化）
- selection feedback（選取回饋）
- purchase / upgrade animation（購買 / 升級動畫）
- hover / press feedback
- contextual panels（情境面板）

### 但必須

- **不影響可讀性**（特效不得壓過文字對比度）
- **不影響效能**（不得掉幀；對戰畫面尤其嚴格）
- **支援 reduced-motion**（`prefers-reduced-motion: reduce` 時退化為無動畫版本）
- **不大量常駐粒子**（背景粒子只做氛圍，不得長時間高密度運行）
- **不得影響功能邏輯**：特效不擋互動、不延遲狀態更新、不改變 state 形狀或 Store 寫入

---

## 6. UX Depth（互動深度）

**UX 深度應來自互動層次，不是文字量。**

每個重要功能都要考慮這些狀態：

`hover` / `press` / `selected` / `locked` / `unlocked` / `empty` / `loading` /
`success` / `error` / `purchase` / `upgrade` / `compare` / `inspect` / `detail`

實作時的最低要求：

- **locked**：要說明「為什麼鎖住」與「怎麼解鎖」（一句話，不是一段）
- **empty**：空狀態要給下一步行動，不是只印「無資料」
- **error**：可讀中文，並提供可行的下一步
- **selected**：必須有明確視覺差異，不能只靠邊框色（顏色須配形狀或文字）

---

## 7. Mobile（手機）

**手機不能只是把 Desktop 壓窄。**

- 主要 CTA 易觸控（建議觸控目標 ≥ 44×44px）
- 長文字減少
- 詳細資訊改用 bottom sheet
- **不用 hover 才能取得重要資訊**（手機沒有 hover ⇒ 重要資訊必須另有觸控入口）
- 避免多層 nested scroll
- 頁面可自然 touch scroll
- **不水平 overflow**（320 / 360 / 390 / 430px 都要檢查）

響應式判斷唯一來源：`src/ui/useViewport.js`（`useIsMobile()` / `MOBILE_MAX = 700`）。
不得在各畫面自寫寬度判斷。

### 驗收環境

Owner 的手機預覽環境以 **4G external HTTPS** 為主（部署後在手機上開）。
**不要再把 LAN IP／區網位址當主要驗收流程**。

Node verifier **無法**證明手機 UX / FPS / 觸控手勢 / 視覺體感 ⇒
交付時一律附「未經真機實測」清單交使用者驗收。

---

## 8. Skills 使用原則

UI / UX 工作可優先使用：

- `frontend-design`
- GSAP

以及 Skill Atlas 中適合的：game UI、UI motion、micro-interaction、interaction design、
information hierarchy、responsive UI、accessibility、visual effects。

**每個 Sprint 最多挑真正需要的少數 Skills。不要為了使用 Skill 而增加不必要效果。**

---

## 9. AI 開發規則（建立新 UI 前的九問）

Claude / Codex 在建立任何新 UI 前，先自問並在交付說明中回答：

1. 玩家現在最需要**看到**什麼？
2. 玩家現在最需要**做**什麼？
3. 哪些資訊可以藏到第二層？
4. 是否用了工程術語？
5. 是否文字過多？
6. 是否可以用視覺／進度／圖示替代文字？
7. Desktop / Mobile 是否都有良好操作？
8. 是否有適當 motion / feedback？
9. 是否看起來像遊戲，而不是 SaaS 管理後台？

**若答案不理想，先改善 UX hierarchy，不要直接增加更多文字。**

---

## 10. 既有 UI 的處理

**不要因為建立這份規範就一次大改所有舊頁面。**

- **新功能：立即遵守本檔。**
- **舊頁面：** 在未來修改該產品線時順便 modernization。
- **避免大規模 UI rewrite。**（大改動難以回溯，且容易把呈現層改動混進功能 commit）

既有畫面的統一列為獨立工作項，不夾帶在功能 Milestone 裡改。

---

## 11. 與既有規範的關係

本檔**疊在**下列規範之上，不覆蓋它們：

| 既有規範 | 關係 |
|---|---|
| `CLAUDE.md` 最高原則（Legacy Experience + Modern Architecture） | Legacy 決定**要有哪些資訊與流程**；本檔決定**怎麼呈現與分層**。資訊不可因為「簡潔」而消失，只能移到第二／三層。 |
| `AGENTS.md` §手機優先原則 | 手機優先**優先於**視覺華麗度。特效不得讓 320px 溢出或掉幀。 |
| `AGENTS.md` §UI 呈現原則（一致性） | 數字格式、顏色語意、用詞、色票來源（`src/ui/theme.js` 的 `GC`）仍然有效，本檔不放寬。 |
| `AGENTS.md` §4 Protected Systems | 為了「做得漂亮」**不得**動 LogicEngine / 契約 / Balance / Store 形狀。 |
| `docs/design/MOBA對戰HUD與手機版.md` | 對戰 HUD 的具體規格以該檔為準；本檔是通則。 |

**硬底線（重申）：不得為了顯示另算一套數字。** 畫面顯示的值必須來自邏輯用的同一份計算。
第二套計算＝第二套真相，等同新增假資料。

---

## 12. 現況備註（實作者請先看）

- **色票**：`src/ui/theme.js` 匯出 `GC`（唯一色票來源）、`card()`、`chip()`、`btn()`、`label`。
  畫面專用色必須在檔頭說明為何需要。
- **響應式**：`src/ui/useViewport.js`。
- **reduced-motion：目前主幹尚無共用實作。** 第一個做動態效果的 Sprint 應建立
  `src/ui/useReducedMotion.js`（讀 `matchMedia('(prefers-reduced-motion: reduce)')`），
  之後所有動效統一走它，不要各自 inline 判斷。
- **開發者模式**：`src/ui/debugMode.js`；工程術語只能出現在 debug 分支。
