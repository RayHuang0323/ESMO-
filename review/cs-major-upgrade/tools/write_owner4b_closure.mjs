import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='review/cs-major-upgrade/evidence/owner4b-review-20261014/',prefix='review/cs-major-upgrade/evidence/authenticity-closure-20261012/',sha=b=>createHash('sha256').update(b).digest('hex');
const selected=['owner4b-visible-ground-after-bindfix-20261014','owner4b-he-vfx-review-20261014','owner4b-front-wall-after-20261014','owner4b-affected-sim-configured-20261014','owner4b-ground-anchor-runtime-20261014','owner4b-ground-browser-anchor-20261014','owner4b-utility-browser-20261014','owner4b-mirage-temporal-complete-20261014','owner4b-pristine-build-20261014','owner4b-formal-browser-20261014'];
const runs=selected.map(name=>{const p=prefix+name,native=JSON.parse(fs.readFileSync(p+'.exit.json'));if(native.nativeExitCode!==0)throw Error('Selected gate not complete '+name);return{name,native,stdout:p+'.stdout.log',stdoutSha256:sha(fs.readFileSync(p+'.stdout.log')),stderr:p+'.stderr.log',stderrSha256:sha(fs.readFileSync(p+'.stderr.log'))};});
for(const id of ['cs_awareness_steering','cs_major_utility_rules','cs_owner4_contact_runtime','cs_major_tactical_runtime']){const b=fs.readFileSync('tmp/verify-logs/'+id+'.log');fs.writeFileSync(base+id+'.complete.log',b,{flag:'wx'});}
const manifest=JSON.parse(fs.readFileSync('review/cs-major-upgrade/profile-builds/owner4b-pristine-20261014/build-manifest.json'));
const delta=JSON.parse(fs.readFileSync(base+'ground-contact-diagnostic-delta.json')),files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort(),h=createHash('sha256');
for(const file of files){const old=delta.files.find(f=>f.path===file),bytes=old?Buffer.from(old.beforeBase64,'base64'):fs.readFileSync(file);h.update(file+'\0');h.update(bytes);h.update('\0');}
const revertedSha=h.digest('hex'),anchor=JSON.parse(fs.readFileSync('review/cs-major-upgrade/profile-builds/diagnostic-owner4b-anchor-20261014-1366/build-manifest.json'));if(revertedSha!==anchor.sourceFingerprint.sha256)throw Error('Ground/utility reuse source domain mismatch');
const proof=JSON.parse(fs.readFileSync(base+'preview-proof.json'));
const receipt={status:'ENGINEERING_READY_OWNER_REVIEW',completedAt:new Date().toISOString(),preview:{...proof,session:11892},source:manifest.sourceFingerprint,bundle:manifest.bundleSha256,runs,reuse:{anchorSource:revertedSha,finalSource:manifest.sourceFingerprint.sha256,files:files.length,groundBrowser:'22/22 native0',utilityBrowser:'31/31 native0',delta:base+'ground-contact-diagnostic-delta.json',reason:'Only contact-height diagnostic additions since these rendered tests; original model offset and visible poses retained for finite validated surfaces'},limitations:['Owner professional gameplay feel and all locations/all angles remain review work.','Mirage geometry candidate counts are not GPU flicker outcome KPI; 2483 candidates remain, often internal/occluded.','Temporal ROI .35 differs from Before .65 (which was dominated by weapon); do not claim a pixel before/after improvement ratio.','99 CPU animation samples: maximum candidate discrepancy 5.213mm, three exceed diagnostic5mm; original8cm gates pass.','Real mobile device FPS/touch/visual experience not tested; cloudflared absent.','Prior valid unrelated B7/30/55/legacy evidence retained; legacy plant NOT_TRIGGERED still not relabelled PASS.'],failureRetention:['visible-ground-before-visible-root19/27 PRODUCT_FAIL','visible-ground-after22/27 bindMatrixInverse PRODUCT_FAIL','settled-ground-browser19/22 clothing anchor PRODUCT_FAIL','affected-sim first run missing unique paths HARNESS_SETUP_FAIL','all original stdout/stderr/native evidence kept'],scope:'No MOBA/store/reward/router/persistence/contract changes in Owner4B; no commit/push/deploy'};
fs.writeFileSync(base+'owner4b-engineering-complete.json',JSON.stringify(receipt,null,2),{flag:'wx'});
const text=`## Owner4B最新收件：2026-10-14（工程完成，Owner Review）

桌機 Preview：http://localhost:5183/ESMO-/ 。owner4b-pristine-20261014、session11892；已核對舊PID147032/5183為本任務Preview才替換，其他服務/foreign/MOBA不動。正式build無probe、完整public，HTTP200且HTML與全部10個JS逐byte同archive。source ${manifest.sourceFingerprint.sha256}（${files.length}份）、bundle ${manifest.bundleSha256}。

四項產品修正：保留pelvis經父座標轉換後的真世界UP位移；可見鞋底/屍體支撐點對同一份渲染floor triangles接地，死亡服裝先sync→sample/apply→sync，settled corpse快取。公共fallback使用正式LOS/局部clear-ray，保留TTL情報與合法corner預瞄。Mirage外牆內部端蓋/頂部腰線及箱體鋼條有真間距。HE改短暖色接觸/火花、棕灰塵煙，與閃光白屏區分，全部依保存detonation time，無新增scene light或傷害邏輯。

有效守門：真GLB接地27/27、99動態樣本34/34、HE7/7、front-wall5/5與awareness15/15；三圖contact12/12、tactical34/34與同seed JSON SHA一致、utility rules37/37。真Browser settled corpse/crouch22/22、smoke/HE/flash原生1x31/31、正式Dashboard→CS→Battle→Result26/26，皆native0。Mirage temporal140樣本/4 movies；固定POV40樣本像素一致、移動sample10/11人工看牆面紋理，出現的血條另為UI；本輪ROI .35與舊.65不同，不作RGB改善比值。CPU Building6 eye-band16→0、crate100競爭對消除；不是全圖視覺PASS，尚有2483幾何候選（不少內部/遮蔽），Owner仍須驗收全角度/時間。

初次ground整合22/27的SkinnedMesh bindMatrixInverse問題與settled corpse19/22的服裝穿地問題已修，原紅燈/native保留；runner缺唯一路徑的兩項拒跑屬HARNESS_SETUP_FAIL，設定後才真執行。不覆寫/洗綠舊證據。34/34的5mm診斷仍3個5.213mm超值，原8cm守門全過，最大動態可見接地誤差約2.5cm，不宣稱全5mm。死亡contactY現在記真取樣surfaceY，不再以rootY+offset誤報；最後只有診斷欄位差異，22/22與31/31的anchor來源可精確反推一致。

證據與限制總收件：${base}owner4b-engineering-complete.json；完整native/streams與child logs保留。舊B7/30/55/legacy等無關有效證據不重跑；legacy原安包NOT_TRIGGERED維持。手機真機FPS/觸控/視覺未實測，cloudflared未安裝，不給無效區網網址。專業CS體感及所有角度仍由Owner驗收。

每週剩5%（含以下）停工門檻已保存AGENTS.md與官方quota guard，取代3%。■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner/真機驗收；工程剩餘0分鐘。無commit/push/deploy，不開始下一Sprint；完成後僅保留Review Preview服務，沒有宣稱未存在的背景工作。

`;
fs.writeFileSync('review/cs-major-upgrade/OWNER4B_CLOSURE.md','# Owner4B：浮空／看牆／Mirage閃爍／HE修正\n\n'+text,{flag:'wx'});
for(const file of ['review/cs-major-upgrade/RESUME_CHECKPOINT.md','review/cs-major-upgrade/OWNER4_CLOSURE.md','review/cs-major-upgrade/OWNER_REVIEW.md','review/cs-major-upgrade/AUTHENTICITY_CLOSURE.md']){const old=fs.readFileSync(file,'utf8'),n=old.indexOf('\n');fs.writeFileSync(file,old.slice(0,n+1)+'\n'+text+'## 以下為已保留歷史停點\n\n'+old.slice(n+1));}
const handoff=`\n\n### 2026-10-14 Owner4B實戰追加：接地／看牆／Mirage共面／HE（Owner Review）\n\n${text}`;
for(const file of ['docs/handoff/00_目前專案狀態.md','docs/handoff/05_Sprint紀錄.md','docs/handoff/06_目前主幹架構.md','docs/handoff/08_目前待辦與風險.md'])fs.appendFileSync(file,handoff);
console.log(JSON.stringify({status:receipt.status,source:manifest.sourceFingerprint,revertedAnchorMatches:true,receipt:base+'owner4b-engineering-complete.json',receiptSha256:sha(fs.readFileSync(base+'owner4b-engineering-complete.json'))}));
