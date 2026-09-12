import assert from 'node:assert/strict';
import { replayDisplayText, replayPlayerName, replayEventText, replayStartTime } from '../src/battle/moba/replay/replayDisplayText.js';
const replay = { playersMeta: [{id:'b2',playerName:'Nacht'},{id:'r3',playerName:'Pyre'}] };
const before = JSON.stringify(replay);
const cases = [
 ['B2 使用懲戒（camp_red_buff）','Nacht 使用懲戒（紅 Buff）'],
 ['FIRST BLOOD! R3 擊殺 B2（助攻 B4）','首殺！ Pyre 擊殺 Nacht（助攻 藍方第 4 席）'],
 ['Dragon 被紅方擊殺','巨龍 被紅方擊殺'],
 ['Baron 已刷新','巴龍 已刷新'],
 ['camp_blue_a / camp_red_b','藍方狼營 / 紅方石甲蟲'],
 ['camp_future / nexus_guard','野怪營地 / 門牙塔'],
 ['Double Kill! R3','雙殺！ Pyre'],
 ['VICTORY!','勝利！'],
 ['B20 / AB2 / B2hero','藍方第 20 席 / AB2 / B2hero'],
 [null,''],
];
for (const [input, expected] of cases) assert.equal(replayDisplayText(input,replay),expected);
assert.equal(replayPlayerName('b2'), '藍方第 2 席');
assert.equal(replayPlayerName(null), '選手');
assert.equal(replayDisplayText('B2',{playersMeta:[{id:'b2',playerName:'R3 main'}]}),'R3 main');
assert.equal(JSON.stringify(replay),before);
assert.equal(replayEventText({type:'TOWER_DESTROYED',data:{victimSide:'blue',lane:'nexus_guard',tier:1}}), '藍方門牙塔 被摧毀');
assert.equal(replayEventText({type:'TOWER_DESTROYED',data:{victimSide:'red',lane:'bot',tier:2}}), '紅方下路 1 塔 被摧毀');
assert.equal(replayEventText({type:'TOWER_DESTROYED',data:{victimSide:'red',isNexus:true}}), '紅方主堡 被摧毀');
assert.equal(replayEventText({text:'B2 使用懲戒（camp_blue_buff）'},replay), 'Nacht 使用懲戒（藍 Buff）');
assert.equal(replayStartTime({frames:[{t:951}]}),951);
assert.equal(replayStartTime({frames:[{t:0}]}),0);
assert.equal(replayStartTime({frames:[]}),0);
assert.equal(replayStartTime({frames:[{t:NaN}]}),0);
console.log('REPLAY_DISPLAY_TEXT: 22 PASS / 0 FAIL');
