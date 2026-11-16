// Same read-only coaching model as the report UI; no separate advice rules.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildCsCoachingAdvice} from '../src/battle/fps/csCoachingAdvice.js';
const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('Unique output required');
const save=JSON.parse(fs.readFileSync(input,'utf8')),before=JSON.stringify(save);
const result=(save.csHistory||[]).find(result=>buildCsCoachingAdvice({result,history:save.csHistory,players:save.players}).cards.length)||(save.csHistory||[])[0];
const advice=buildCsCoachingAdvice({result,history:save.csHistory,players:save.players});
assert.equal(JSON.stringify(save),before,'No player/progress/save mutation');
fs.writeFileSync(output,JSON.stringify({status:'PASS',source:'same buildCsCoachingAdvice as professional report; existing analytics and calculateCourse',advice},null,2),{flag:'wx'});
console.log(`CS_TRAINING_FOLLOWUP RESULT=PASS proposals=${advice.cards.length} inputUnchanged=true`);
