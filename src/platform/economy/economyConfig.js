// ============================================================================
//  platform/economy/economyConfig.js — 經濟平衡的**唯一**設定來源（Milestone N2）
//
//  ── 為什麼要有這一支 ──────────────────────────────────────────────────────
//  N1 的機制是對的，但數值散落在三個地方：種子 `finance.weeklyIncome` /
//  `weeklyCost`、Legacy 選手表的 `salary`、SPONSORS 的 `weekly`。
//  結果是誰也說不出「這隊每週到底該賺多少」——實測 N1：就算簽下最高階贊助，
//  每週淨額仍是 −24.7 萬，數週見底。
//
//  N2 把所有費率集中到本檔。要調平衡**只改這裡**，不必碰結算邏輯。
//  金額單位一律「萬／週」（換算成元由 units.WAN 負責）。
//
//  ⚠ 這裡的數字是**平衡參數**，不是 Legacy 規格。Legacy 只定義了
//    「salary 是週薪（萬）」這件事（EsportsGame.jsx:559 / :5822），
//    沒有定義該給多少。下方的公式與費率是 N2 的設計，可調。
// ============================================================================

/** 薪資公式參數。薪資由**能力**決定，不再是選手表寫死的數字。 */
export const SALARY = Object.freeze({
  //  身價 = 綜合能力 + 等級 + 潛力（潛力只有超過門檻才加價，避免新秀虛胖）
  base: 0.8,             // 底薪（萬／週）
  perOverall: 0.06,      // 綜合能力每高 1 點
  overallFloor: 60,      // 低於此不再扣（避免負薪）
  perLevel: 0.08,        // 等級每高 1 級
  levelFloor: 30,
  perPotential: 0.04,    // 潛力超過門檻的部分
  potentialFloor: 85,
  min: 1.0,              // 每人週薪下限
  max: 8.0,              // 每人週薪上限（避免極端值把帳算爆）
});

/** 贊助收入拆成三塊（比例相加 = 1，對 SPONSORS[].weekly 分配）。 */
export const SPONSOR_SPLIT = Object.freeze({
  //  固定收入：合約保證，不看成績 ⇒ 這是經營的地板
  fixed: 0.5,
  //  績效獎金：依近期戰績縮放（0 → 完全拿不到）⇒ 成績差會痛
  performance: 0.5,
  //  ⚠ 賽事獎金**不在這裡發**。比賽獎金由既有的 applyMatchProgress（S25）
  //    在賽後發放，週結算若再算一次就是雙重入帳。現金預測會用帳本裡的
  //    真實獎金紀錄去估未來幾週的賽事收入，見 forecast.js。
});

/** 近期戰績（form）的取樣方式。 */
export const FORM = Object.freeze({
  window: 6,        // 取最近幾場（csHistory）
  neutral: 0.5,     // 沒有比賽紀錄時的中性值
  min: 0,
  max: 1,
});

/**
 * 三種隊伍財務情境。差別在**營收規模與營運成本**，不在薪資公式
 * （薪資由選手能力決定，頂級隊自然貴）。
 *
 * 設計意圖：
 *   · rookie   勉強打平，一次失誤就見底 ⇒ 有壓力但活得下去
 *   · standard 正常經營可維持小幅盈餘 ⇒ 這是基準線
 *   · elite    盈餘明顯，但薪資基數大，贊助斷掉時跌得最重
 */
export const SCENARIOS = Object.freeze({
  rookie: Object.freeze({
    id: "rookie", name: "新手戰隊",
    baselineWeekly: 6,        // 基礎營收（直播分潤・周邊）萬／週
    operatingBase: 3,         // 固定營運成本 萬／週
    operatingPerPlayer: 0.5,  // 每名選手的營運成本 萬／週
    startingFunds: 60,        // 起始資金 萬
    //  N3.1：開局自動附帶的扶持贊助（定義在 economy/sponsors.js，不進贊助市集）。
    //  沒有它的話新手每週淨額 −11.7 萬、約 5 週見底，開局壓力來得太早。
    //  有了它是 −1.2 萬／週（戰績 50%），8 週到期後才回到原本的壓力。
    starterSponsor: "rookie_grant",
  }),
  standard: Object.freeze({
    id: "standard", name: "一般戰隊",
    baselineWeekly: 12,
    operatingBase: 5,
    operatingPerPlayer: 0.5,
    startingFunds: 120,
  }),
  elite: Object.freeze({
    id: "elite", name: "頂級戰隊",
    baselineWeekly: 22,
    operatingBase: 8,
    operatingPerPlayer: 0.5,
    startingFunds: 300,
  }),
});

/** 預設情境（新存檔與缺欄的舊存檔都用它）。 */
export const DEFAULT_SCENARIO = "standard";

export const scenarioById = (id) => SCENARIOS[id] ?? SCENARIOS[DEFAULT_SCENARIO];

/** 資金警告門檻。 */
export const WARN = Object.freeze({
  //  現金預測的展望週數（Dashboard 顯示未來幾週）
  forecastWeeks: 4,
  //  預測期內會見底 ⇒ 紅色警告
  //  淨額為負但還撐得過展望期 ⇒ 黃色提醒
  dangerWeeks: 4,
});
