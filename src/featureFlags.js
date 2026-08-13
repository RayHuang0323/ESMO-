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
   * 亞洲巡迴賽（Q7a-3d）：新賽季會多出一條巡迴賽、三站 Event、巡迴積分與晉級資格。
   *
   * **預設關閉**，理由要講清楚：
   *   · 打開之後，**新賽季**的賽程會從 56 場變成 56 + 3×28 場，玩家每季多打 21 場。
   *     那是產品層級的改變，不該由一次技術上線順手決定。
   *   · Q3 §5c／§5s 與 Q5 §2b 三條既有斷言明文寫著「新賽季 56 場」。
   *     預設打開會讓它們變紅，而那些斷言描述的正是**預設行為** ⇒ 要改它們，
   *     得先有人決定「新賽季本來就該有巡迴賽」。
   *   · 舊存檔任何情況下都不受影響：已經建好的賽季不會被插入新 Event。
   *
   * 開啟方式：把這一行改成 `true`，或用網址 `?asiaCircuit=1` 單次試玩。
   */
  asiaCircuit: false,

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
