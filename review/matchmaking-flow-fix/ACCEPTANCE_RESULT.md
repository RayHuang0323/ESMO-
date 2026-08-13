# 正式環境驗收修正：MOBA 賽前配對流程 ＋ 英雄資產接線（2026-08-07）

分支 `fix/matchmaking-flow`（自 `origin/milestone-n-finance` @ `7bd858c`）。
在獨立 worktree `ESMO-mmfix` 執行，主工作區與其他 worktree 全程未更動。

## 一、配對流程：五個問題，同一個根因

`MatchPrepFrame` 這樣訂閱 store：

```js
const view = useProfileStore((s) => s.matchmakingView)();
```

訂閱的是**選擇器函式本身**，函式身分永不改變 ⇒ **zustand 從來不通知它** ⇒
底部主按鈕凍結在第一次算出來的樣子。上一輪（集中驗收修正包）把「我方確認」
「進入對戰」「重新配對」全搬到那顆凍結的按鈕上，整條流程因此斷掉。

⚠ **這是我上一輪造成的回歸**，不是既有問題。

| 驗收回報 | 根因 |
|---|---|
| 找到對手後永遠等待中、進不了 Ban/Pick | 按鈕凍結，「我方確認」按不到 |
| 逾時後「重新配對」沒反應 | 同上；且 `resetMatchmaking` 只回到 idle，沒有重新排隊 |
| 配對中底部仍顯示「確認陣容 → 開始配對」 | 同上 |
| 多個入口可推進相同流程 | 狀態卡與底部按鈕各自維護狀態 |
| 出賽申請與線上配對的關係難以理解 | 內部流程詞彙直接暴露給玩家 |

## 二、修法

**`useMatchFlow`（新增）＝單一狀態來源**
只訂閱原始值（字串／布林／數字）保證重繪；**獨佔輪詢**（元件內 `setInterval` 歸零）；
負責開房、簽發場次、自動進場。

**`matchPrepAction.js`＝主按鈕唯一純函式判定**
玩家只需理解四步：確認出賽陣容 → 尋找對手 → 雙方確認 → 進入 Ban/Pick。
按鈕隨流程改變身分，文案不出現票券／房間／場次等內部詞彙。

**`requeueMatch`（新增 store action）**
「重新配對」＝作廢舊房間與票券（含雙方確認）＋ 重新排隊，一個動作完成。
連按不會產生第二張票券。

**契約加入 `attempt`**
`ticketId = hash8(transactionId)`，而 `transactionId` 由陣容與週次決定 ⇒
**同一套陣容重新配對必然得到同一個 id**，`assignmentId`／`roomId` 跟著相同，
資料上幾乎等於什麼都沒發生。加入 `attempt` 後是可分辨的新票券，
仍然完全決定性（伺服器給定 `(申請單, attempt)` 可自行重算），
且 `attempt = 0` 的 id 與加入前**逐位元相同**。

**正式 UI 簡化**
只顯示：陣容是否完整、目前流程狀態、對手名稱、雙方確認、倒數、唯一可執行操作、
中文失敗原因。隊伍版本／申請識別／ticketId／roomId／seed／issuedBy／追蹤鏈
一律只在 `?debug=1` 出現且預設收合。「出賽申請」這個內部詞彙改為「出賽陣容」。

## 三、追加修正：進了 Ban/Pick 又離開會永久卡死

離開時場次停在 `launched`，回到賽前頁命中停用分支「進入 Ban/Pick…」，
而一次性 `launchToken` 早已消耗 ⇒ **按鈕永久按不動**。與線上連線無關。

O6 其實早就備好 `resumeSession` / `abandonSession`，**UI 從來沒接**。已接上：

| 狀況 | 主按鈕 |
|---|---|
| 場次 `launched` | **「返回進行中的對戰」**（可按）→ `resumeMatchSession`，seed／陣容／對手不變 |
| 不想打完 | 狀態卡的**「放棄本場」** → `abandonMatchSession` |
| 場次終局（放棄／打完／取消／逾期） | **「重新配對」** |

⚠ 驗證器抓到**第二層卡死**：放棄後 room 仍是 `confirmed`，按鈕會落到
「雙方已確認，準備進場…」的停用分支——還是動不了。已補「場次終局 ⇒ 可重新配對」，
終局清單直接取自契約的 `SESSION_TERMINAL`，不另維護第二份。

## 四、英雄資產接線：大地守衛回退成旗子

**根因：那些檔案從來沒有進版控。** 只存在於主工作區的未提交狀態
（`DadiHeroProxy.jsx` / `ChichuanHeroProxy.jsx` untracked，
`MobaRuntimeHeroes.jsx` / `featureFlags.js` modified，GLB untracked）。
任何乾淨 worktree 都沒有 ⇒ 走 fallback ⇒ 旗子占位物。正式站台同理。

| 英雄 | heroId | 接線 |
|---|---|---|
| 大地守衛 | `dadi` | `DadiHeroProxy` → `assets/heroes/dadi/dadi_final_texture.glb`（無旗標保護） |
| 赤川 | `chichuan` | `ChichuanHeroProxy`，受 `heroProxyChichuan` 與 `?heroProxy=0` 控制 |
| 鋼鐵衛士 | `ironclad` | **本來就沒有 GLB proxy**，走程序化外觀，未受影響 |

Fallback 保留：載入失敗 ⇒ `onReady(false)` ⇒ 占位物照舊出現。

**順手修掉一個附帶回歸**：帶進來的程式有 `body.visible = placeholderVisible`
（＝`alive && !proxyReady`），但上一行才剛指定屍體材質 ⇒
**所有英雄死亡後屍體直接消失**，不只 proxy 英雄。已改為 `h.alive ? !proxyReady : true`。

**只帶必要檔案**：未帶 terrain、`review/` 截圖、`docs/hero-proxy/`、
`MobaRuntimeBattleHarness.jsx`（debug 用）、`00_目前專案狀態.md`。

## 五、驗證

| 驗證 | 結果 |
|---|---|
| `check_matchmaking_flow_acceptance`（新增） | **97/97** |
| `check_acceptance_fix_p1` | 81/81 |
| `check_matchmaking_o4` | 47/47 |
| `check_match_room_o5` / `o6` / `o7` / `o71` | 45 / 36 / 48 / 27 |
| `check_moba_experience26` | 35/35 |
| `check_growth_ui_p1` | 62/62 |
| `regress` / `regress2` | 15/15 · 8/8 |
| `npm run build` | EXIT=0 |

完整 stdout/stderr 保留在本目錄 `*.log`，**不入版控**（見 `.gitignore`）。

### 兩支既有驗證改了斷言，都不是放寬

1. **`check_matchmaking_o4` §1c**：票券欄位 allowlist 補登 `attempt`（維持精確比對）。
2. **`check_acceptance_fix_p1`**：19 條在描述已被取代的舊實作（`statusOnly` 開關、
   `reset` key、舊版展開區）。改寫成描述新機制——新版**更嚴格**：
   狀態卡現在根本不含任何推進按鈕、也不呼叫任何 store action，
   而不是靠一個開關把它們關掉。

## 六、人工驗收

配對流程已由使用者在瀏覽器實測通過（含逾時 → 重新配對 → 再次確認 → 進 Ban/Pick）。
大地守衛模型與「返回進行中的對戰／放棄本場」由使用者確認後提交。

## 七、待決事項

`dadi_final_texture.glb` **32 MB**。目前 Pages artifact 是 1.6 MB，加入後約 34 MB。
會永久留在 git 歷史、拖慢 clone 與 CI，並可能讓本來就容易逾時的 Pages 部署更難完成。
**尚未壓縮**（可考慮貼圖降解析度或 Draco）。
