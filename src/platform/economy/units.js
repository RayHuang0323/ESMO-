// ============================================================================
//  platform/economy/units.js — 金額單位換算（Milestone N）
//
//  Legacy 資料表一律以「萬」計價（選手週薪 8 = 8 萬、贊助 weekly 25 = 25 萬），
//  而 Store 以**元**存放 `finance.funds`。換算常數只能有一份。
//
//  為什麼從 profileStore 搬出來：週結算是純邏輯模組（要能在 Node 直接測），
//  不能 import profileStore（那會拉進 zustand，而且造成循環 import）。
//  profileStore 改為從這裡 re-export，既有 `import { WAN } from profileStore`
//  的呼叫端不受影響。
// ============================================================================

/** 1 萬（Legacy 以「萬」計價，Store 以元存放）。 */
export const WAN = 10_000;
