// ============================================================================
//  featureFlags.js — 開發／驗收用的功能開關（Milestone J-close）
//
//  為什麼要有這一檔：像「快速完成戰鬥」這種**只服務開發與驗收**的按鈕，
//  過去只靠 `isDebugMode()` 一道閘門。那道閘門的語意是「現在是不是測試模式」，
//  不是「這個功能還要不要留著」——兩件事混在一起，正式上線前就得去翻每一個
//  使用點才知道要拿掉什麼。
//
//  現在分成兩層，兩層都成立才顯示：
//    1. `isDebugMode()`  —— 現在是不是測試模式（?debug=1 / localStorage / vite dev）
//    2. 本檔的旗標       —— 這個開發工具還在不在
//
//  ⚠ 移除時機：這些都是**暫時的**。正式上線前把對應旗標改成 `false`
//    （單一位置、不必動任何畫面程式碼），確認驗收腳本改用其他方式推進比賽之後，
//    再把功能本體與旗標一起刪掉。用途與移除條件記錄在
//    `docs/handoff/08_目前待辦與風險.md`。
// ============================================================================

export const FEATURE_FLAGS = Object.freeze({
  /**
   * 戰鬥畫面的「⏩ 快速完成比賽」按鈕。
   *
   * 用途：驗收與手動測試時，不必真的等 20–30 分鐘的模擬跑完。
   * 行為：把**同一顆引擎**安全推進到終局（不 new 引擎、不改 dt、不碰 rng）
   *   ⇒ 結果與自然跑完逐位元相同，並且走**既有**的
   *   useBattleFeed 終局 → BattleResult → 發獎（transactionId 冪等）→ Replay 定稿
   *   同一條路。所以它不是「跳頁」，賽後結算、經驗、比賽紀錄、重播都照常產生。
   *
   * 關閉方式：把這一行改成 `false`。
   */
  devFastForward: true,

  /**
   * 訓練中心的「🛠 DEV 快速恢復／快速推進」面板。
   *
   * 用途：**開發測試便利功能，不是正式遊戲設計。** 手測與驗收時不必一天一天
   * 按過去，也不必為了讓某人可出賽而繞一圈指派休息課。
   *
   * 行為：推進 1／3 天走**既有的** `profileStore.advanceDay()`——同一個時鐘、
   *   同一套週結算與賽季日曆規則；推不動時（例如今天有還沒收尾的比賽）
   *   **照實顯示原因，不強推**。「全隊恢復至可出賽」的目標體力由
   *   `platform/condition` 的 `CONDITION.restPerDay` 反覆疊加、以
   *   `isMatchFit()` 判定何時停 ⇒ **沒有硬寫任何體力數字，也沒有第二套恢復公式**。
   *
   * ⚠ 正式玩法**沒有**因此被放寬：condition / fatigue / exhausted / 輪休規則
   *   一律照舊，這個面板只是同一組規則的快轉鍵。
   *
   * 關閉方式：把這一行改成 `false`（單一位置，畫面不必動）。
   * 移除方式：刪掉 `src/debug/DevQuickRecovery.jsx`、`TrainingScreen` 的一個
   *   import 與一行 JSX，再刪這個旗標。**正式商業上線前必須做**
   *   （release checklist 見 `docs/handoff/08_目前待辦與風險.md`）。
   */
  devQuickRecovery: true,

  /**
   * 亞洲巡迴賽（Q7a-3d）：新賽季會多出一條巡迴賽、三站 Event、巡迴積分與晉級資格。
   *
   * **預設開啟（Q7a-3f.2）**。翻面之前先做完四件事，不是直接改一行：
   *   · **賽季基線重新定義**（3f）：不變式是「**官方聯賽** 56 場」，
   *     不是「整季總共 56 場」。全域場次數已經退場。
   *   · **生涯成績相容層**（3f.1）：多 Event 時 `state.final` 是 `SeasonSeal.v1`，
   *     生涯名次改由 `careerEventId` ＋ `careerFinalStandingsOf()` 提供。
   *     少了這一層，賽季結算頁會顯示「第 undefined 名」。
   *   · **效能量測**（3f）：換日 P95 Node 1.75ms／Chrome 2.2ms（基線 0.84／1.3），
   *     整季 130／165ms。離「有感」的 100ms 還有數十倍餘裕。
   *   · **舊存檔政策**：進行中的賽季**永遠不會**被插入巡迴賽；
   *     玩家自然換季之後，下一季才進新制。
   *
   * ⚠ **`?asiaCircuit=0` 是逃生口**：明確關閉，建出完整的舊制新局（56 場、
   *   單一賽事）。回退不需要改程式碼，也不需要重新部署。
   */
  asiaCircuit: true,

  /** 單英雄戰場替身測試；可用 `?heroProxy=0` 暫時關閉比較。 */
  heroProxyChichuan: true,
  /** Hero Proxy A/B 版本；可用 `?heroProxyVariant=desktop-v002` 切換。 */
  heroProxyVariant: "cli-v003",
});

/** 單一查詢出口（呼叫端不直接讀物件，日後要改成遠端旗標也只動這裡）。 */
export const featureEnabled = (name) => FEATURE_FLAGS[name] === true;

/**
 * 亞洲巡迴賽開關。網址參數優先（`?asiaCircuit=1` / `=0`），否則看旗標。
 *
 * ⚠ 只在**建立新賽季那一刻**被讀到。中途打開不會把巡迴賽補進已經開始的賽季——
 *   那等於在賽季中途插入 84 場比賽，玩家的行程會整個變形。
 */
export const asiaCircuitEnabled = () => {
  if (typeof window !== "undefined") {
    const value = new URLSearchParams(window.location.search).get("asiaCircuit");
    if (value === "0") return false;
    if (value === "1") return true;
  }
  return featureEnabled("asiaCircuit");
};

export const heroProxyEnabled = () => {
  if (typeof window !== "undefined") {
    const value = new URLSearchParams(window.location.search).get("heroProxy");
    if (value === "0") return false;
    if (value === "1") return true;
  }
  return featureEnabled("heroProxyChichuan");
};

export const heroProxyVariant = () => {
  if (typeof window !== "undefined") {
    const value = new URLSearchParams(window.location.search).get("heroProxyVariant");
    if (value === "desktop-v002" || value === "cli-v003") return value;
  }
  return FEATURE_FLAGS.heroProxyVariant;
};
