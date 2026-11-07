import {clickFpsDNative} from './fpsReplayUiProbe.mjs';

// Practice deliberately persists no career result. Its Browser oracle reads
// the genuine terminal score and rendered report; contract/data equality is
// independently covered by the actual-match three-source and Replay gates.
export async function probeOwner2PracticeReport({chrome,check,sleep,terminalScore}){
 const native=selector=>clickFpsDNative({chrome,sleep,selector});
 const first=await chrome.evaluate(`const p=JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}'),root=document.querySelector('[data-testid="cs-professional-report"]');return {history:p.csHistory?.length||0,rows:root.querySelectorAll('[data-testid="cs-ten-player-table"] tbody tr').length,text:root.innerText};`);
 check('練習有完整十人真戰報且不要求職業入史',first.history===0&&first.rows===10&&first.text.includes(terminalScore.ours+':'+terminalScore.enemy),first);
 for(const tab of ['team','player','round','overview']){
  await native(`[data-testid="cs-report-tab-${tab}"]`);await sleep(120);
  const state=await chrome.evaluate(`const r=document.querySelector('[data-testid="cs-professional-report"]');return {overflow:document.documentElement.scrollWidth>innerWidth+1,text:r.innerText,bad:[...r.querySelectorAll('svg polyline,svg circle')].some(e=>/NaN|Infinity/.test(e.outerHTML)),rounds:document.querySelector('[data-testid="cs-report-round-select"]')?.options.length};`);
  check('練習 '+tab+' 真分析資料及排版',!state.overflow&&!state.bad&&state.text.length>200&&(tab!=='round'||state.rounds===terminalScore.ours+terminalScore.enemy),state);
 }
 await native('[data-testid="cs-report-rewards"] > summary');
 check('練習明細明示不列入職業紀錄',await chrome.evaluate(`return document.body.innerText.includes('快速練習不列入對戰紀錄');`));
}
