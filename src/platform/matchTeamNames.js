// ============================================================================
//  platform/matchTeamNames.js — 本場比賽「雙方隊名」的唯一讀取點
//
//  ── 為什麼需要這一支 ──────────────────────────────────────────────────────
//  Q3.5 瀏覽器實測抓到：賽事頁顯示的是賽程對手（例如「蒼藍要塞」），
//  但 Ban/Pick 與正式對戰畫面一路寫死「赤焰軍團」——那是 `data/roster.js`
//  的 AI 預設名單，跟這一場的對手無關。玩家看到的是兩個不同的對手。
//
//  對手隊名**早就有正式來源**了，只是沒人接上：
//      competitionGateway.issueFor()  → assignment.opponent.name
//        → createSession()            → session.opponent.name
//        → consumeLaunchToken()       → launch.opponentName   ← 進場時的權威值
//  本檔**不新增任何資料**，只是把這條既有的鏈路收斂成一個定義，
//  避免每個畫面各寫一次 fallback ⇒ 那才會變成第二份真相。
//
//  ── 用法（必須這樣用）────────────────────────────────────────────────────
//      const oppName = useProfileStore(selectOpponentName);
//
//  ⚠ 回傳的是**字串或 null（原始值）**，不是物件、不是函式。這是刻意的：
//    `useMatchFlow.js` 檔頭記錄過的坑——訂閱選擇器函式本身，身分永遠不變，
//    zustand 從此不再通知該元件。原始值才保證「狀態一變就重繪」。
//
//  ⚠ 查不到就回 null，**不編造名字**。沒有場次的情境（debug harness、
//    單獨掛載 GameView）由元件自己的預設值接手 ⇒ 既有行為不變。
// ============================================================================

/**
 * 本場對手隊名。
 *
 * 順序＝可信度由高到低，全部是同一條鏈路上的同一個值：
 *   ① `launch.opponentName`：一次性令牌換來的進場參數（對戰中最權威）
 *   ② `session.opponent.name`：場次已簽發、尚未進場
 *   ③ `ticket.assignment.opponent.name`：還在房間確認階段（**一般配對**用的）
 *   ④ `fixtureAssignment.opponent.name`：同樣是房間確認階段，但**賽程路徑**
 *
 * ⚠ ④ 是 Q3.5 驗收補上的：賽事出賽時 `profileStore.launchFixtureMatch()` 明確
 *   把 `ticket` 設成 null（賽程路徑沒有票券），指派單改放 `fixtureAssignment`。
 *   只列 ③ 的話，賽前房間的「對手」欄在整個確認階段都是「—」。
 *   ③④ 是同一階段的兩種簽發者（mockGateway／competitionGateway），不是兩份真相。
 *
 * @returns {string|null} 查不到回 null（由呼叫端決定預設顯示）
 */
export const selectOpponentName = (s) =>
  s?.matchmaking?.launch?.opponentName
  ?? s?.matchmaking?.session?.opponent?.name
  ?? s?.matchmaking?.ticket?.assignment?.opponent?.name
  ?? s?.matchmaking?.fixtureAssignment?.opponent?.name
  ?? null;

/**
 * 我方隊名。來自 `team.name`（開新局可改名），不是 `data/roster.js` 的預設值。
 *
 * @returns {string|null} 查不到回 null
 */
export const selectTeamName = (s) => s?.team?.name ?? null;
