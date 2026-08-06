# 集中驗收修正包 · 驗收結果（2026-08-06）

分支 `acceptance-fix/p1-ui`（自 `origin/milestone-n-finance` @ `d00396b` 建立）。
在獨立修正 worktree `ESMO-acceptance-fix` 完成，**主工作區與 `ESMO-acceptance`
對照環境全程未被更動**。

## 五項修正 · 人工瀏覽器實機驗收 **全部通過**

| # | 問題 | 修正前 | 修正後 | 實機 |
|---|---|---|---|---|
| 一 | MOBA 重複配對入口 | 中間「線上配對」卡有「開始配對」，底部又有「確認陣容 → 配對」，兩顆都推進流程 | 底部為**唯一**主按鈕，隨流程改身分：開始配對 → 我方確認 → 進入對戰 →（失敗）重新配對；中間卡只剩狀態與取消 | ✅ |
| 二 | 工程資訊外洩到主畫面 | 主畫面直接顯示隊伍版本、申請識別、`S3・W6`，排隊時另顯示票券後八碼 | 主畫面只留**出賽申請狀態／陣容 n/5／模式名稱**；其餘移入「查看提交內容」展開區與 `?debug=1` | ✅ |
| 三 | 驗收資金不足 | 無任何補充入口 | 財務頁 debug-only「補充測試資金至 $100,000,000」，同一個 `set()` 寫資金與帳本 | ✅ |
| 四 | MOBA／CS 賽前頁不一致 | CS 用 `.filter(Boolean)`，**缺人的席位整列消失**，只剩大紅框說未通過驗證 | 兩邊共用 `MatchPrepFrame` + `SquadSeatRow`；CS 五席恆在，缺員標紅「未指派」並可直接 🔁 指派 | ✅ |
| 五 | 天賦入口斷在名單 | `NAV.talent = "roster"`，點進去只是普通名單，沒有任何天賦入口 | 導向 `talentPick`：標題「選擇要培養的選手」、顯示可用天賦點、每張卡「查看天賦 · N點」直達天賦樹 | ✅ |

版面：桌面與 **320 / 360 / 390 / 430px** 實機確認**無水平溢出**。

## 自動驗證（16 支，零紅燈）

| 驗證 | 結果 |
|---|---|
| `check_acceptance_fix_p1`（本包新增） | **81/81** |
| `check_growth_ui_p1` | 62/62 |
| `check_moba_experience26` | 35/35 |
| `check_squad_o1` | 40/40 |
| `check_match_entry_o3` | 35/35 |
| `check_matchmaking_o4` | 47/47 |
| `check_match_room_o5` | 45/45 |
| `check_match_session_o6` | 36/36 |
| `check_authoritative_o7` | 48/48 |
| `check_result_flow_o71` | 27/27 |
| `check_finance_n` / `n2` / `n3` / `n31` | 32 / 35 / 40 / 31 |
| `check_talent27` | 44/44 |
| `regress` | 結束率 15/15、撤退鎖死 0 |
| `regress2` | 節奏門檻 8/8 |
| `npm run build` | EXIT=0，`✓ built in 12.14s` |

完整 stdout/stderr 保留在本目錄的 `*.log`（18 檔）。
**刻意不入版控**（見 `.gitignore`）——上表即結論，log 是過程產物，重跑命令即可再生。

## 驗證器抓到的兩個真缺失（已修，非放寬門檻）

1. **項目二漏做一半**：配對狀態卡排隊時仍在顯示隊伍版本與票券。
   已改為只留「模式」，其餘併入既有的 debug 追蹤鏈。
2. **主按鈕邏輯寫在 `.jsx` 裡，Node 匯入不了 ⇒ 等於沒驗到**。
   已抽成純函式 `src/screens/common/matchPrepAction.js`，
   現在九種狀態（idle／未通過／queued／matched／ready_check 兩態／confirmed／
   cancelled／rejected／expired）逐條驗過。

## 我自己的一個檢查誤判（已修）

`§2f` 第一版直接對原始碼 `includes("隊伍版本")`，結果抓到**我自己寫的說明註解**
（「隊伍版本…移到展開區」）——與 P1 `§7a` 同一種錯。已改為去註解後比對。
**註解不是畫面。**

## 未做（刻意）

未 merge `main`、未部署 Pages、未開始 P2、未碰商店／轉會市場。
未改戰鬥平衡、契約欄位、驗證邏輯與 Store 資料形狀
（`check_acceptance_fix_p1` §8 以原始碼指紋釘住）。
未碰 `ESMO-hero-models`、terrain 與未提交的 hero proxy 工作。
