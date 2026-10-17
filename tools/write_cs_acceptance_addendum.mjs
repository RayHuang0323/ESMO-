#!/usr/bin/env node
// Presentation addendum from the saved narrow correction; no simulation/report fan-out.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const input = process.argv[2];
assert.ok(input);
const review = JSON.parse(fs.readFileSync(input,'utf8'));
assert.equal(review.fakeCorrection.eventArrivalErrors,0);
assert.equal(review.causalErrors.length,0);
assert.equal(review.assessment.acceptance,'OWNER_REVIEW_WITH_OPEN_ITEMS');
const oldMD = review.source.path.replace(/\.json$/,'.md');
let text = fs.readFileSync(oldMD,'utf8');
text = text.replace('判定：**PRODUCT_FAIL**','判定：**OWNER_REVIEW_WITH_OPEN_ITEMS**');
text = text.replace('因果錯誤 20；','因果錯誤 0（原20件為採樣時間誤差，見下方校正證據）；');
text = text.replace('因果：PRODUCT_FAIL','因果：PASS');
text = text.replace('Pick/Eco???UI???????Lurk/Rotate?','Pick／Eco 另列為 UI 選擇；Lurk 依真角色路線，Rotate 依真情報轉點。');
text = text.replace('| ???? | ????? | episodes |','| 額外選擇 | 真物理觀測 | episodes |');
text = text.replace('| ?UI selector | ?? | episodes |','| 真 UI selector | 真物理觀測 | episodes |');
text += '\n校正證據：'+review.fakeCorrection.eventsChecked+' 件真 fake-reached 全部使用事件當下保存的 event.pos／event.fakeGoal 驗證 <6m，0 件失敗；原20件紅燈是轉向真攻後的同tick frame位置已離開假攻節點。缺事件位置與6m等界仍拒絕，3個工具反例已通過。既有真execute與全部原native／來源守門保留，沒有重跑模擬。\n\n';
text += '原紅摘要與20件原錯誤未覆寫：'+review.source.path+'，SHA256 '+review.source.sha256+'；完整校正與具名live counter：'+input+'。\n\n';
text += '反覆買入零用仍有45列，不能以死亡或未受攻為由預設放行。角色欄為玩家既有角色；換邊後須看逐回合 actualSide，不能把 CT 購買 HE／molly 誤認為 T lurker kit 迴歸。購入時的 plannedPurpose 未保存，仍 UNKNOWN；真投擲 purpose／起訖位置及每回合死亡／路線可由原JSON索引核對。\n';
const target = input.replace(/\.json$/,'.md');
fs.writeFileSync(target,text,{flag:'wx'});
console.log(JSON.stringify({markdown:target,assessment:review.assessment,eventsChecked:review.fakeCorrection.eventsChecked,originalFalseErrors:review.fakeCorrection.originalErrors.length,causalErrors:0,repeatedPurchaseZeroUse:review.repeatedPurchaseZeroUse,newSimulationInvoked:false},null,2));
