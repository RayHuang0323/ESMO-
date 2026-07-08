// Sprint09 掛載鏈驗證：在 repo 根目錄執行 `node tools/check_mount09.mjs`
import fs from "fs";
const A=[];const ck=(n,c)=>A.push([n,c]);
const main=fs.readFileSync('src/main.jsx','utf8');
ck('main.jsx 掛 AppShell', main.includes('<AppShell />') && !main.match(/from "\.\/App\.jsx"/));
const shell=fs.readFileSync('src/AppShell.jsx','utf8');
ck('AppShell 五畫面(home/menu/prematch/battle/season)', ['home','menu','prematch','battle','season'].every(s=>shell.includes('"'+s+'"')));
ck('GameView 信標 S09', fs.readFileSync('src/GameView.jsx','utf8').includes('ESMO 主幹 · S09'));
const feed=fs.readFileSync('src/battle/useBattleFeed.js','utf8');
ck('唯一計算點與三消費者', feed.includes('snapshotToBattleResult(snap, bs.log)') && feed.includes('setResult') && feed.includes('recordResult(result)'));
ck('EndScreen 消費 BattleResult', fs.readFileSync('src/battle/ui/BattleEndScreen.jsx','utf8').includes('s.result'));
ck('heroDatabase 存在(CHAMPIONS_100)', fs.readFileSync('src/data/heroDatabase.js','utf8').includes('export const CHAMPIONS_100'));
let p=0;A.forEach(([n,c])=>{console.log((c?'✅ ':'❌ ')+n);if(c)p++;});
console.log(p+'/'+A.length+' 通過'); process.exit(p===A.length?0:1);
