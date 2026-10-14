#!/usr/bin/env node
// CS Major Upgrade：相同種子、1×、實際 GPU，逐階段重測。
// DEV Battle 共用正式元件；正式玩家流程另跑，不將此入口當流程驗收。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, build, preview } from 'vite';
import { runGate, finishGate, HarnessError } from './browser/harness.mjs';
import { installFpsAudioNativeProbe, enableFpsAudioWhilePaused, verifyFpsAudioLifecycle, verifyFpsAmbientLifecycle } from './browser/fpsAudioPoolProbe.mjs';
import { FPS_MAJOR_WEAPON_TRIANGLE_BUDGET } from '../src/battle/fps/presentation/fpsMajorWeaponAssets.js';
import { captureFpsWeaponArtGallery } from './browser/fpsWeaponArtProbe.mjs';
import { captureFpsOperatorArtGallery } from './browser/fpsOperatorArtProbe.mjs';
import { captureFpsRuntimeAuthoring } from './browser/fpsRuntimeAuthoringProbe.mjs';
import { verifyFpsMajorHudLayout } from './browser/fpsMajorHudProbe.mjs';
import { measureFpsStaticMatrixCost } from './browser/fpsStaticMatrixProbe.mjs';
import { instrumentFpsDCallbacks } from './browser/fpsReplayUiProbe.mjs';
import { archiveCsPublicAssets, CS_PUBLIC_CACHE_NAME } from './browser/csPublicArtifactStore.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.includes('=')).map(a => a.replace(/^--/, '').split('=')));
if(process.argv.slice(2).some(a=>!a.startsWith('--')||!a.includes('=')))throw new Error('量測參數必須使用 --phase=名稱 --width=寬度，禁止默默覆寫 baseline');
if(!args.phase)throw new Error('必須明確提供 --phase=名稱；省略 phase 不得寫入 baseline');
const phase = args.phase;
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(phase))throw new Error('phase 必須是單一安全目錄名稱');
if(phase.startsWith('baseline')&&!args.baselineSha)throw new Error('baseline 必須提供正式 --baselineSha；禁止候選場景冒充正式基線');
const width = Number(args.width || 1366), height = width < 600 ? 844 : 900;
const measurementMs = Number(args.durationMs || 10000);
if(!Number.isInteger(measurementMs)||measurementMs<10000||measurementMs>60000)throw new Error('durationMs須為10000–60000的整數；預設原10秒量測不變');
const maps = (args.maps || 'mirage,dust2,inferno').split(',');
const out = path.resolve('review/cs-major-upgrade/evidence', phase, String(width));
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('證據目錄已有檔案，請使用新的 phase；禁止覆蓋既有 baseline 或量測');
fs.mkdirSync(out, { recursive: true });
const rows = [];
const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
const sourceHash=createHash('sha256'),runtimeAuthoringSourceHashes={};for(const file of sourceFiles){const bytes=fs.readFileSync(file);sourceHash.update(file+'\0');sourceHash.update(bytes);sourceHash.update('\0');if(args.runtimeAuthoring==='true')runtimeAuthoringSourceHashes[file]=createHash('sha256').update(bytes).digest('hex');}
let sourceFingerprint=args.baselineSha?{kind:'formal-commit',sha:args.baselineSha}:{kind:'worktree-fps-source-and-assets',sha256:sourceHash.digest('hex'),files:sourceFiles.length};
// 正式 baseline 使用唯讀 source overlay；不 checkout、不修改另一個 worktree。
// 唯讀覆蓋全部已修改的既有 src 檔，避免後續呈現層改動滲入 baseline。
let baselineServer;
let productionServer;
const production=args.production==='true';
const diagnosticUnminified=args.diagnosticMinify==='false';
if(args.diagnosticMinify!==undefined&&(!diagnosticUnminified||!phase.startsWith('diagnostic-')||!args.diagnosticBuildReason))throw new Error('取消minify只允許具名原因的diagnostic建置，不改正式設定');
const probeVersion='cs-major-readonly-scene.v2';
// 局部衣袖診斷保留全部產品斷言，只保存四張直接相關的人物圖。
const localOperatorCapture=args.operatorFocus==='support';
if(args.runtimeAuthoring&&(args.runtimeAuthoring!=='true'||!production||args.captureMode!=='metrics'||!phase.startsWith('diagnostic-')||maps.length!==1||args.operatorGallery))throw new Error('runtimeAuthoring僅單圖production diagnostic metrics零PNG作者補證，不代完整驗收');
if(args.captureMode&&(args.captureMode!=='metrics'||!phase.startsWith('diagnostic-')||['operatorGallery','characterViews','weaponGallery','weaponReloadGallery','weaponHandling'].some(key=>args[key]==='true')))throw new Error('captureMode=metrics只允許diagnostic-效能診斷，不得縮減視覺／動作圖庫驗收');
const saveSceneCaptures=!localOperatorCapture&&args.captureMode!=='metrics';
if(args.angleBackend&&!['gl','d3d11'].includes(args.angleBackend))throw new Error('angleBackend只允許gl／d3d11，預設不改');
if(args.buildOnly&&(args.buildOnly!=='true'||!production||args.baselineSha||args.referencePhase||args.reuseCurrentPhase))throw new Error('buildOnly只允許目前production新建置，不代表browser PASS');
if(args.prepareOnly&&(args.prepareOnly!=='true'||!production||args.baselineSha||args.buildOnly))throw new Error('prepareOnly僅production artifact準備，不是browser PASS');
if(production&&args.baselineSha)throw new Error('production probe不可混用DEV正式baseline overlay，需獨立取證');
if(args.production&&args.production!=='true')throw new Error('production只接受明確true');
if(args.trace&&args.trace!=='true')throw new Error('trace只接受明確true');
if(args.frameTiming&&args.frameTiming!=='true')throw new Error('frameTiming只接受明確true');
if(args.matrixDiagnostic&&(args.matrixDiagnostic!=='true'||!production||args.baselineSha||args.referencePhase||args.state!=='combat'))throw new Error('matrixDiagnostic僅允許目前production combat的隔離診斷');
if(args.matrixTarget&&(args.matrixDiagnostic!=='true'||!['static','shadow'].includes(args.matrixTarget)))throw new Error('matrixTarget須搭配matrixDiagnostic且為static／shadow');
if(args.audioEnabled&&(args.audioEnabled!=='true'||!production||args.baselineSha||args.state!=='combat'))throw new Error('audioEnabled須production combat，僅用既有UI與只讀原生聲音診斷');
if(args.traceScheduling&&(args.traceScheduling!=='true'||args.trace!=='true'))throw new Error('traceScheduling須搭配trace明確true');
if(args.weaponSockets&&(args.weaponSockets!=='true'||args.baselineSha))throw new Error('weaponSockets只接受major候選明確true，不套用舊baseline');
if(args.supportGrip&&(args.supportGrip!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('supportGrip須目前major production與details，驗真骨掌到真socket，不套舊參考');
if(args.animationLifecycle&&(args.animationLifecycle!=='true'||!production||args.baselineSha||args.details!=='true'||measurementMs!==10000))throw new Error('animationLifecycle須major production＋details與原10秒屍體情境；跨回合長量測另跑，不放寬屍體斷言');
if(args.contactSinglePass&&(args.contactSinglePass!=='true'||!production||args.baselineSha||args.details!=='true'))throw new Error('contactSinglePass須major production＋details明確true');
if(args.utilityWarmup&&(args.utilityWarmup!=='true'||!production||args.baselineSha||args.referencePhase))throw new Error('utilityWarmup須目前major production，不套舊參考build');
if(args.audioLifecycle&&(args.audioLifecycle!=='true'||!production||args.baselineSha||args.referencePhase||args.state!=='combat'||args.details!=='true'))throw new Error('audioLifecycle須目前major production、combat與details，不套baseline或舊參考');
if(args.weaponPoseLayers&&(args.weaponPoseLayers!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('weaponPoseLayers須目前major production與details，不套baseline或舊參考');
if(args.povWeapon&&(args.povWeapon!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('povWeapon須目前major production與details，不套baseline或舊參考');
if(args.tailoredClothing&&(args.tailoredClothing!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('tailoredClothing須目前major production與details，不套舊參考');
if(args.weaponHandling&&(args.weaponHandling!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('weaponHandling須目前major production與details，不套舊參考');
if(args.weaponArt&&(args.weaponArt!=='true'||args.povWeapon!=='true'||!production||args.baselineSha||args.referencePhase))throw new Error('weaponArt須目前major真POV模型，不套舊參考');
if(args.weaponGallery&&(args.weaponGallery!=='true'||args.weaponArt!=='true'||args.details!=='true'))throw new Error('weaponGallery須真POV武器驗證與details');
if(args.weaponReloadGallery&&(args.weaponReloadGallery!=='true'||args.weaponGallery!=='true'))throw new Error('weaponReloadGallery須搭配真武器圖庫');
if(args.ambientLifecycle&&(args.ambientLifecycle!=='true'||args.audioEnabled!=='true'||args.details!=='true'))throw new Error('ambientLifecycle須production真手勢開聲與details');
if(args.characterViews&&(args.characterViews!=='true'||!production||args.baselineSha||args.details!=='true'))throw new Error('characterViews須production details，只用原生拖曳／縮放操作');
if(args.operatorGallery&&(args.operatorGallery!=='true'||!production||args.baselineSha||args.referencePhase||args.details!=='true'))throw new Error('operatorGallery須目前production details，僅原生UI與真保存幀');
if(args.operatorThreeQuarter&&(args.operatorThreeQuarter!=='true'||args.operatorGallery!=='true'))throw new Error('operatorThreeQuarter須完整operatorGallery，不取代原正背視圖');
if(args.operatorFrontQuarter&&(args.operatorFrontQuarter!=='true'||args.operatorGallery!=='true'||args.operatorFocus))throw new Error('operatorFrontQuarter須完整六身份operatorGallery，不能只補挑選角色或取代既有角度');
if(args.operatorFocus&&(args.operatorFocus!=='support'||args.operatorGallery!=='true'||!phase.startsWith('diagnostic-')))throw new Error('operatorFocus只允許diagnostic- phase的support局部診斷，不是完整驗收');
if(args.operatorCuffViews&&(args.operatorCuffViews!=='true'||args.operatorFocus!=='support'))throw new Error('operatorCuffViews僅允許support袖口遮擋補證，不替代完整驗收');
if(args.operatorHandClose&&(args.operatorHandClose!=='true'||args.operatorFocus!=='support'||args.operatorCuffViews))throw new Error('operatorHandClose須獨立support局部近拍，不能混成全身圖庫');
if(args.operatorHandFamily&&(args.operatorHandFamily!=='sniper'||args.operatorHandClose!=='true'))throw new Error('operatorHandFamily只允許真狙擊槍近拍，不改保存幀');
if(args.operatorTriggerClose&&(args.operatorTriggerClose!=='true'||args.operatorHandClose!=='true'||args.operatorHandFamily!=='sniper'))throw new Error('operatorTriggerClose須真狙擊手部局部兩圖補證');
let archivedProductionArtifact=null;
// 新建置附探針版本；自動重用只接受同來源、同trace與同探針版本。
// 舊manifest仍可明確指定並走既有逐byte守門，不猜舊探針是否相容。
if(production&&!args.referencePhase&&!args.reuseCurrentPhase&&!args.buildOnly){
  const archiveRoot=path.resolve('review/cs-major-upgrade/profile-builds');
  const candidates=fs.existsSync(archiveRoot)?fs.readdirSync(archiveRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>{
    const file=path.join(archiveRoot,e.name,'build-manifest.json');
    if(!fs.existsSync(file))return null;
    try{const m=JSON.parse(fs.readFileSync(file,'utf8'));return m.version===1&&m.probeVersion===probeVersion&&(m.buildOptions?.minify===false)===diagnosticUnminified&&m.sourceFingerprint?.sha256===sourceFingerprint.sha256&&m.sourceFingerprint?.files===sourceFingerprint.files&&Boolean(m.trace)===(args.trace==='true')?{manifest:m,at:fs.statSync(file).mtimeMs}:null;}catch{return null;}
  }).filter(Boolean).sort((a,b)=>b.at-a.at):[];
  if(candidates.length){args.reuseCurrentPhase=candidates[0].manifest.phase;args.reuseWidth=String(candidates[0].manifest.width);console.log(`自動重用同源production建置：${args.reuseCurrentPhase}/${args.reuseWidth}；仍核對bundle與public資產，不沿用browser結果`);}
}
const buildReference=args.referencePhase||args.reuseCurrentPhase;
if(args.referenceEvidencePhase&&(!args.referencePhase||! /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(args.referenceEvidencePhase)))throw new Error('referenceEvidencePhase只允許明確封存build對照，且必須是安全phase名稱');
if(args.referencePhase&&args.reuseCurrentPhase)throw new Error('舊參考與目前build重用不得混用');
if(args.reuseWidth&&!args.reuseCurrentPhase)throw new Error('reuseWidth須搭配目前build重用');
if(buildReference){
  const currentReuse=Boolean(args.reuseCurrentPhase),sourceWidth=currentReuse?Number(args.reuseWidth||width):width;
  if(!production||args.baselineSha||(!currentReuse&&(args.trace==='true'||args.animationLifecycle==='true'||args.contactSinglePass==='true'))||! /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(buildReference)||!Number.isInteger(sourceWidth)||sourceWidth<320||sourceWidth>4096)throw new Error('封存build僅允許已記錄production唯讀對照，不混用baseline／trace');
  const directory=path.resolve('review/cs-major-upgrade/profile-builds',`${buildReference}-${sourceWidth}`),evidence=path.resolve('review/cs-major-upgrade/evidence',args.referenceEvidencePhase||buildReference,String(sourceWidth),'metrics.json');
  const manifestPath=path.join(directory,'build-manifest.json');
  const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
  // 目前來源仍逐byte核對；trace只能重用已含相同trace標記的build。
  // 普通效能量測不能借trace build，舊版對照仍禁止trace。
  if(manifest&&(manifest.version!==1||manifest.phase!==buildReference||manifest.width!==sourceWidth||Boolean(manifest.trace)!==(args.trace==='true'))||(!manifest&&args.trace==='true'))throw new Error('封存build manifest或trace標記不符，不套目前probe');
  const original=fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):currentReuse&&manifest?[{viewport:{width:sourceWidth},build:'production preview build only (browser NOT RUN)',sourceFingerprint:manifest.sourceFingerprint}]:[];
  if(!original.length||original.some(row=>row.viewport?.width!==sourceWidth||!row.build.startsWith('production preview')||row.sourceFingerprint?.sha256!==original[0].sourceFingerprint?.sha256)||(!currentReuse&&!maps.every(map=>original.some(row=>row.map===map))))throw new Error('既有production對照缺完整地圖／來源紀錄，不猜build');
  if(args.referenceEvidencePhase&&(!manifest||original.some(row=>row.sourceFingerprint?.sha256!==manifest.sourceFingerprint.sha256||row.archivedProductionArtifact?.referencePhase!==buildReference||row.archivedProductionArtifact?.bundleSha256!==manifest.bundleSha256)))throw new Error('對照取證未連結此封存source/bundle，不借另一phase指紋');
  if(currentReuse){
    if(original[0].sourceFingerprint?.sha256!==sourceFingerprint.sha256||original[0].sourceFingerprint?.files!==sourceFingerprint.files)throw new Error('目前來源與封存build指紋不同，必須重新建置');
    for(const file of sourceFiles.filter(file=>file.startsWith('public/'))){
      const archived=path.join(directory,file.slice('public/'.length));
      if(!fs.existsSync(archived)||!fs.readFileSync(archived).equals(fs.readFileSync(file)))throw new Error('封存public資產與目前來源不同：'+file);
    }
  }
  const assets=path.join(directory,'assets'),files=fs.readdirSync(assets).filter(file=>file.endsWith('.js')).sort(),artifactHash=createHash('sha256');
  if(!fs.existsSync(path.join(directory,'index.html'))||!files.some(file=>file.startsWith('fpsSim.worker-'))||!files.some(file=>file.startsWith('index-')))throw new Error('既有production對照缺真實bundle');
  for(const file of files){artifactHash.update(file+'\0');artifactHash.update(fs.readFileSync(path.join(assets,file)));}
  const bundleSha256=artifactHash.digest('hex');
  if(manifest&&manifest.bundleSha256!==bundleSha256)throw new Error('封存bundle已變更，拒絕重用');
  archivedProductionArtifact={referencePhase:buildReference,sourceWidth,bundleSha256,jsFiles:files.length,sourceAssociation:currentReuse?'目前sourceFingerprint及全部public資產逐byte相同，重用同一build；原browser verdict不被覆寫':'沿用該build首次實跑的sourceFingerprint，不由目前source重建'};
  sourceFingerprint={...original[0].sourceFingerprint,kind:currentReuse?'verified-current-production-reuse':'archived-production-reference'};
  if(args.prepareOnly==='true'){console.log('ARTIFACT_PREPARED_ONLY：同源archive與public逐byte核對完成；browser NOT RUN，不是RESULT=PASS');process.exit(0);}
  productionServer=await preview({build:{outDir:directory},preview:{host:'127.0.0.1',port:0,open:false}});
}
if(production&&!buildReference){
  // 只在隔離驗證建置增加一次性唯讀scene handle；產品source／正式dist不變。
  // 不打開DEV分支，不逐幀生成visibility snapshot；測完RAF才按需取原產品snapshot。
  const probeDir=path.resolve('review/cs-major-upgrade/profile-builds',`${phase}-${width}`);
  if(fs.existsSync(probeDir))throw new Error('production probe建置目錄已存在，請用新phase保留證據');
  const marker='    const own=(label,fn)=>{stateRef.current.disposables.push({label,fn});};';
  const hook=`${marker}\n    window.__ESMO_FPS_SCENE__=stateRef.current;\n    Object.defineProperty(stateRef.current,'visibilitySnapshot',{get(){const live=stateRef.current.liveRef.current;return buildFpsVisibilitySnapshot(stateRef.current,live.sim.frames[live.fIdx],live.fIdx);}});\n    stateRef.current.readonlyOcclusionProbe=()=>{const st=stateRef.current,selected=st.liveRef.current.selected,actor=st.players.find(p=>p.id===selected);if(!actor?.g)return null;st.scene.updateMatrixWorld(true);const target=new THREE.Vector3().setFromMatrixPosition(actor.g.matrixWorld);target.y+=1.2;const origin=st.camera.position.clone(),direction=target.clone().sub(origin),distance=direction.length(),ray=new THREE.Raycaster(origin,direction.normalize(),0,distance);return{selected,chase:st._chase,origin:origin.toArray(),target:target.toArray(),distance,hits:ray.intersectObject(st.c3Environment.group,true).slice(0,20).map(hit=>{const material=hit.object.material,program=st.renderer.properties.get(material).currentProgram,shader=program?.fragmentShader?st.renderer.getContext().getShaderSource(program.fragmentShader):null;return{name:hit.object.name,distance:hit.distance,point:hit.point.toArray(),opacity:material?.opacity,transparent:material?.transparent,visible:hit.object.visible,version:material?.version,compiledOpaque:shader==null?null:/^#define OPAQUE$/m.test(shader)};})};};`;
  const worldPointHook="\n    stateRef.current.readonlyWorldPointRayProbe=(xyz)=>{const st=stateRef.current,point=new THREE.Vector3(...xyz),origin=st.camera.position.clone(),delta=point.clone().sub(origin),distance=delta.length(),ray=new THREE.Raycaster(origin,delta.normalize(),0,distance);st.scene.updateMatrixWorld(true);return{distance,hits:ray.intersectObject(st.worldGroup,true).filter(h=>{const m=h.object.material;return !Array.isArray(m)&&m?.visible&&(!m.transparent||m.opacity>.99);}).slice(0,8).map(h=>({name:h.object.name,distance:h.distance,point:h.point.toArray()}))};};\n";
  let instrumented=0;
  const fadeProgramHook=`\n    stateRef.current.readonlyFadeProgramProbe=()=>{const st=stateRef.current,materials=[];st.c3Environment.group.traverse(object=>{const m=object.material;if(!object.isMesh||Array.isArray(m)||!m?.transparent||m.opacity>=.99)return;const program=st.renderer.properties.get(m).currentProgram,shader=program?.fragmentShader?st.renderer.getContext().getShaderSource(program.fragmentShader):null;materials.push({name:object.name,opacity:m.opacity,version:m.version,compiledOpaque:shader==null?null:/^#define OPAQUE$/m.test(shader)});});const actor=st.players.find(p=>p.id===st.liveRef.current.selected),bounds=actor?.rigged?.root?new THREE.Box3().setFromObject(actor.rigged.root):null;return{materials,bodyBounds:bounds?{min:bounds.min.toArray(),max:bounds.max.toArray()}:null};};\n`;
  const animationPoseHook=`\n    stateRef.current.readonlyAnimationPoseProbe=()=>{const st=stateRef.current,frame=st.liveRef.current.sim.frames[st.liveRef.current.fIdx];return st.players.map(p=>{const c=p.rigged,player=frame.players.find(actor=>actor.id===p.id),floor=c.root.getWorldPosition(new THREE.Vector3()).y,bounds=new THREE.Box3().setFromObject(c.root),socket=c.getMuzzleWorldPosition(c.muzzleDiagnosticPosition);return{id:p.id,dead:Boolean(player?.dead),action:c.currentAction,time:c.actions.get(c.currentAction)?.time,mixerTime:c.mixer?.time,modelPosition:c.model?.position.toArray(),handRotation:c.model?.getObjectByName('hand_r')?.quaternion.toArray(),muzzle:socket?.toArray()||null,floorWorldY:floor,minWorldY:bounds.min.y,groundContactY:c.deathGroundContactY};});};\n`;
  // 隔離CS probe只封存其runtime public資產，不在每轮拷貝整個
  // MOBA／heroes／artifacts資料庫；正式npm build與部署設定不變。
  await build({build:{outDir:probeDir,emptyOutDir:false,copyPublicDir:false,...(diagnosticUnminified?{minify:false}:{})},plugins:[{name:'cs-production-readonly-probe',enforce:'pre',transform(code,id){
    if(!id.replace(/\\/g,'/').split('?')[0].endsWith('/src/battle/fps/EsportsFPS3D.jsx'))return null;
    if(code.split(marker).length!==2)throw new Error('production probe唯一scene marker不存在，不猜位置');
    instrumented++;let measured=code.replace(marker,hook+fadeProgramHook+animationPoseHook+worldPointHook);
    if(args.trace==='true'){
      // 僅診斷取證建置標記各階段；不是產品效能最佳化，也不改呼叫順序或輸入。
      for(const [label,statement] of [
        ['dynamic','updateDynamic(st,frame,nf,pf,sub,live,W,dt,fIdx,wallDt);'],
        ['camera','updateCamera(st,frame,sub,dt,W,live.cameraMode);'],
        ['labels','layoutFpsWorldLabels(st,frame,live);'],
        ['pov','updateFpsPovWeapon(st,frame,st._chase,Boolean(live.cameraMode==="pov"),dt);'],
        ['render','renderer.render(scene,camera);'],
      ]){
        if(!measured.includes(statement))throw new Error(`production trace缺少${label}呼叫，不猜位置`);
        const marked=`{performance.mark('esmo-${label}-start');${statement}performance.mark('esmo-${label}-end');performance.measure('esmo-${label}','esmo-${label}-start','esmo-${label}-end');}`;
        measured=measured.replaceAll(statement,marked);
      }
      const glHook=`\n    stateRef.current.productionShaderProbe=[];\n    for(const method of ['shaderSource','compileShader','linkProgram','getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog','getActiveUniform','getUniformLocation']){const gl=renderer.getContext(),original=gl[method];gl[method]=function(...args){if(method==='shaderSource')stateRef.current.productionShaderProbe.push({at:performance.now(),defines:args[1].split('\\n').filter(line=>/^#define/.test(line)).slice(0,60)});performance.mark('esmo-gl-'+method+'-start');try{return original.apply(gl,args);}finally{performance.mark('esmo-gl-'+method+'-end');performance.measure('esmo-gl-'+method,'esmo-gl-'+method+'-start','esmo-gl-'+method+'-end');}};}\n`;
      measured=measured.replace(hook,hook+glHook);
    }
    // D callback counters are a readonly production-archive probe only.
    // Keep all existing scene/trace handlers and instrument actual calls last.
    measured=instrumentFpsDCallbacks(measured);
    return{code:measured,map:null};
  }}]});
  if(!instrumented)throw new Error('production probe未接到正式CS元件');
  const publicStorage=await archiveCsPublicAssets({publicRoot:path.resolve('public'),archiveRoot:probeDir,cacheRoot:path.resolve('review/cs-major-upgrade/profile-builds',CS_PUBLIC_CACHE_NAME)});
  console.log(`CS public封存：${publicStorage.files}檔／${publicStorage.logicalBytes}logical bytes；內容快取新增${publicStorage.newCacheBytes}bytes；硬連結${publicStorage.linkedFiles}／獨立複製${publicStorage.copiedFiles}，不連結原public來源`);
  const builtAssets=path.join(probeDir,'assets'),builtScripts=fs.readdirSync(builtAssets).filter(file=>file.endsWith('.js')).sort(),builtHash=createHash('sha256');
  for(const file of builtScripts){builtHash.update(file+'\0');builtHash.update(fs.readFileSync(path.join(builtAssets,file)));}
  fs.writeFileSync(path.join(probeDir,'build-manifest.json'),JSON.stringify({version:1,probeVersion,publicScope:'CS_RUNTIME_ONLY',publicStorage,phase,width,trace:args.trace==='true',buildOptions:{minify:diagnosticUnminified?false:'configured-default',diagnosticReason:diagnosticUnminified?args.diagnosticBuildReason:null},sourceFingerprint,bundleSha256:builtHash.digest('hex')},null,2));
  if(args.buildOnly==='true'){console.log('BUILD_ONLY 完成：browser NOT RUN；已保存來源／bundle manifest，不是RESULT=PASS');process.exit(0);}
  if(args.prepareOnly==='true'){console.log('ARTIFACT_PREPARED_ONLY：新production建置與manifest已保存；browser NOT RUN，不是RESULT=PASS');process.exit(0);}
  productionServer=await preview({build:{outDir:probeDir},preview:{host:'127.0.0.1',port:0,open:false}});
}
if(args.baselineSha){
  if(!phase.startsWith('baseline'))throw new Error('baselineSha 只允許搭配 baseline 標籤');
  const files=execFileSync('git',['diff','--name-only','--','src'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(file=>file.startsWith('src/'));
  const sources=new Map(files.map(file=>[path.resolve(file).toLowerCase(),execFileSync('git',['show',`${args.baselineSha}:${file}`],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:15000,windowsHide:true})]));
  baselineServer=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'cs-formal-baseline-read-only',enforce:'pre',transform(code,id){const before=sources.get(path.resolve(id.split('?')[0]).toLowerCase());return before?{code:before,map:null}:null;}}]});
  await baselineServer.listen();
}
let result;
try{
result = await runGate({
  name: `CS Major Upgrade ${phase} ${width}`, headless: false, timeoutMs: 650000, workspaceOnly: true, angleBackend:args.angleBackend||null,
  externalUrl:productionServer?`http://127.0.0.1:${productionServer.httpServer.address().port}/ESMO-/`:baselineServer?`http://127.0.0.1:${baselineServer.httpServer.address().port}/ESMO-/`:null,
  async run({ chrome, url, ck, sleep }) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 600 ? 2 : 1, mobile: width < 600 });
    if(args.audioLifecycle==='true'||args.audioEnabled==='true')await installFpsAudioNativeProbe(chrome);
    for (const map of maps) {
      const captureRects={},captureCamera={};
      let audioEnabled;
      const rememberCanvasRect=async state=>{captureRects[state]=await chrome.evaluate(`const r=document.querySelector('canvas')?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;`);};
      const started = Date.now();
      await chrome.navigate(`${url}?c5c=battle&map=${map}&seed=505001`);
      let ready = false, nextReport = Date.now()+15000;
      while (Date.now() - started < 150000) {
        ready = await chrome.evaluate(`return Boolean(document.querySelector('canvas') && window.__ESMO_FPS_SCENE__?.players?.length===10 && window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged'));`);
        if (ready && !phase.startsWith('baseline')) ready = await chrome.evaluate(`return window.__ESMO_FPS_SCENE__?.c3Environment?.summary?.atlasLoaded===true;`);
        if (ready) break;
        if(Date.now()>nextReport){console.log('WAIT',map,JSON.stringify(await chrome.evaluate(`return {text:document.body.innerText.slice(0,350),scene:!!window.__ESMO_FPS_SCENE__,players:window.__ESMO_FPS_SCENE__?.players?.map(p=>p.rigged?.mode),errors:window.__ESMO_FPS_C2A__};`)),JSON.stringify(chrome.pageErrors),JSON.stringify(chrome.consoleLines.filter(x=>x.startsWith('[error]')))); nextReport=Date.now()+15000;}
        await sleep(250);
      }
      if (!ready) { const shot=await chrome.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${map}-timeout.png`),Buffer.from(shot.data,'base64'));throw new HarnessError(`${map} 十名 rigged 人物未就緒`);}
      const coldReadyMs = Date.now() - started;
      await chrome.evaluate(`document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);
      if(args.state==='combat'){
        const control=await chrome.evaluate(`const controls=document.querySelector('[data-testid="cs-playback-controls"]');[...(controls?.querySelectorAll('button')||[])].find(b=>b.textContent==='❚❚')?.click();const sim=window.__ESMO_FPS_SCENE__.liveRef.current.sim;const index=sim.frames.findIndex(f=>f.muzzles?.length&&f.players.filter(p=>!p.dead).length>=8);const slider=document.querySelector('input[type="range"]');if(index<0||!slider)return null;slider.scrollIntoView({block:'center'});const r=slider.getBoundingClientRect();return{index,max:sim.frames.length-1,fromX:r.x+7+(r.width-14)*Number(slider.value)/(sim.frames.length-1),x:r.x+7+(r.width-14)*index/(sim.frames.length-1),y:r.y+r.height/2};`);
        if(!control)throw new HarnessError('找不到真實交戰 frame／回放拖曳條');
        // 必須拖曳真實thumb；手機短軌道的目標點可能仍在原thumb內，單擊不會seek。
        await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:control.fromX,y:control.y,button:'left',clickCount:1});
        await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:control.x,y:control.y,buttons:1});
        await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:control.x,y:control.y,button:'left',clickCount:1});
        await sleep(120);
        let cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]')?.value);`);
        if(!Number.isFinite(cursor)||!await chrome.evaluate(`return document.activeElement===document.querySelector('input[type="range"]');`))throw new HarnessError('真實拖曳未聚焦回放slider：'+JSON.stringify({cursor,control}));
        // Home 是原生 range 鍵盤操作；窄軌道／長比賽不依賴像素近似的落點。
        await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});
        await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
        cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]')?.value);`);
        if(cursor!==0)throw new HarnessError('真實Home操作未重置range游標：'+cursor);
        for(let n=0;n<=control.index&&cursor!==control.index;n++){
          const key=cursor<control.index?'ArrowRight':'ArrowLeft';
          const keyCode=key==='ArrowRight'?39:37;
          await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:keyCode});
          await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:keyCode});
          cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]')?.value);`);
        }
        await sleep(120);
        const condition=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,f=st.liveRef.current.sim.frames[st.liveRef.current.fIdx];return{cursor:st.liveRef.current.fIdx,muzzles:f.muzzles.length,alive:f.players.filter(p=>!p.dead).length,playing:st.liveRef.current.playing,roundSec:f.roundSec};`);
        if(condition.cursor!==control.index||condition.muzzles<1||condition.alive<8||condition.playing)throw new HarnessError('受測遊戲未成立交戰seek前提：'+JSON.stringify(condition));
        ck(`${map} 真實交戰seek前提`,true,JSON.stringify(condition));
        if(args.audioLifecycle==='true'||args.audioEnabled==='true')audioEnabled=await enableFpsAudioWhilePaused({chrome,sleep,ck,map});
        await chrome.evaluate(`const controls=document.querySelector('[data-testid="cs-playback-controls"]');const play=[...(controls?.querySelectorAll('button')||[])].find(b=>b.textContent==='▶');if(!play)throw new Error('找不到實際播放按鈕');play.click();return true;`);
        await chrome.evaluate(`document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);
      }
      await sleep(2000);
      if(args.profile==='true'){
        await chrome.send('Profiler.enable');
        await chrome.send('Profiler.setSamplingInterval',{interval:1000});
        await chrome.send('Profiler.start');
      }
      let traceCompletion;
      if(args.trace==='true'){
        traceCompletion=new Promise(resolve=>chrome.on('Tracing.tracingComplete',resolve));
        const categories=['devtools.timeline','v8','disabled-by-default-v8.gc','blink.user_timing'];
        if(args.traceScheduling==='true')categories.push('gpu','cc','toplevel','renderer.scheduler','disabled-by-default-devtools.timeline.frame');
        await chrome.send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',traceConfig:{includedCategories:categories,recordMode:'recordUntilFull',traceBufferSizeInKb:32768}});
      }
      // RAF 與 renderer.info 唯讀量測：量測器不修改 gameplay／鏡頭／frame。
      const sample = await chrome.evaluate(`return await new Promise(resolve=>{
        const st=window.__ESMO_FPS_SCENE__, times=[], counts=[], frames=[], start=performance.now(); let last=start;
        const recordTiming=${args.trace==='true'||args.frameTiming==='true'},longTasks=[];
        const taskObserver=recordTiming?new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push({startMs:entry.startTime,durationMs:entry.duration,name:entry.name,attribution:entry.attribution.map(a=>({name:a.name,containerType:a.containerType,containerName:a.containerName}))});}):null;
        taskObserver?.observe({type:'longtask',buffered:false});
        const weaponFx=${args.weaponSockets==='true'}?{muzzleSocketsMax:0,muzzleDirectionsMax:0,tracerSocketsMax:0,muzzleFallbacksMax:0}:null;
        if(${args.trace==='true'})performance.mark('esmo-cs-measure-start');
        const collect=now=>{
          times.push(now-last);last=now; const r=st.renderer;
          counts.push({calls:r.info.render.calls,triangles:r.info.render.triangles,geometries:r.info.memory.geometries,textures:r.info.memory.textures});
          frames.push(st.liveRef.current?.fIdx ?? st.liveRef.current?.frameIndex ?? null);
          if(weaponFx){const e=st.c5aFxEvidence;for(const key of ['muzzleSockets','muzzleDirections','tracerSockets','muzzleFallbacks'])weaponFx[key+'Max']=Math.max(weaponFx[key+'Max'],e?.[key]||0);}
          if(now-start<${measurementMs}){requestAnimationFrame(collect);return;}
          if(taskObserver){for(const entry of taskObserver.takeRecords())longTasks.push({startMs:entry.startTime,durationMs:entry.duration,name:entry.name,attribution:entry.attribution.map(a=>({name:a.name,containerType:a.containerType,containerName:a.containerName}))});taskObserver.disconnect();}
          const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
          const resources=new Set(), materials=new Set(), geometries=new Set();let textureBytes=0,meshes=0,instanced=0,activePointAndSpot=0;
          st.scene.traverseVisible(o=>{if((o.isPointLight||o.isSpotLight)&&o.intensity>0)activePointAndSpot++;});
          st.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.isInstancedMesh)instanced++;}if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
          for(const t of resources){const im=t.image;if(im?.width&&im?.height)textureBytes+=im.width*im.height*4*(t.generateMipmaps?4/3:1);}
          const gl=r.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
          const cursor=st.liveRef.current.fIdx,frame=st.liveRef.current.sim.frames[cursor];
          if(${args.trace==='true'})performance.mark('esmo-cs-measure-end');
          resolve({durationMs:now-start,frames:times.length,fps:times.length*1000/(now-start),frameMs:{p50:percentile(times,.5),p95:percentile(times,.95),p99:percentile(times,.99),max:Math.max(...times)},weaponFx,traceTiming:recordTiming?{startMs:start,intervalsMs:times,frameIndices:frames,longTasks}:null,render:{callsP50:percentile(counts.map(x=>x.calls),.5),callsP95:percentile(counts.map(x=>x.calls),.95),trianglesP95:percentile(counts.map(x=>x.triangles),.95),geometries:r.info.memory.geometries,textures:r.info.memory.textures,materials:materials.size,meshes,instanced},lighting:{activePointAndSpot},textureMemoryEstimateMB:textureBytes/1048576,jsHeapMB:performance.memory?performance.memory.usedJSHeapSize/1048576:null,players:st.players.length,rigged:st.players.filter(p=>p.rigged?.mode==='rigged').length,playback:{cursor,round:frame.rnd,roundSec:frame.roundSec,alive:frame.players.filter(p=>!p.dead).length,muzzleEvents:frame.muzzles.length},quality:{dpr:r.getPixelRatio(),shadowSize:st.sun.shadow.mapSize.x,shadows:r.shadowMap.enabled},gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,canvas:{width:r.domElement.width,height:r.domElement.height},environment:st.c3Environment?.summary||null,load:window.__ESMO_CS_LOAD_TIMING__?.entries||[],visibility:st.visibilitySnapshot?.check||null});
        };requestAnimationFrame(collect);
      });`);
      if(args.trace==='true'){
        await chrome.send('Tracing.end');
        let timer;
        const completed=await Promise.race([traceCompletion,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new HarnessError('Tracing結束逾時，不假造資料')),30000);})]).finally(()=>clearTimeout(timer));
        if(completed.dataLossOccurred||!completed.stream)throw new HarnessError('Tracing資料遺失或stream缺少，不作完整診斷');
        const parts=[];let bytes=0;
        try{while(true){const chunk=await chrome.send('IO.read',{handle:completed.stream,size:1048576}),part=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');bytes+=part.length;if(bytes>67108864)throw new HarnessError('Tracing超過64MB取證上限');parts.push(part);if(chunk.eof)break;}}finally{await chrome.send('IO.close',{handle:completed.stream});}
        const payload=Buffer.concat(parts),file=`${map}-timeline-trace.json`;
        JSON.parse(payload.toString('utf8'));fs.writeFileSync(path.join(out,file),payload);sample.tracing={file,bytes,dataLossOccurred:false};
        sample.shaderCompilation=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.productionShaderProbe||[];`);
      }
      if(args.profile==='true'){
        const {profile}=await chrome.send('Profiler.stop');
        fs.writeFileSync(path.join(out,`${map}-cpu-profile.json`),JSON.stringify(profile));
        await chrome.send('Profiler.disable');
        sample.profiling=true;
      }
      sample.shaderWarmup=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.roofShaderWarmup?.result||null;`);
      sample.audioState=await chrome.evaluate(`const diag=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__;return{ui:document.querySelector('[data-testid="cs-audio-toggle"]')?.dataset.csAudioState??null,context:diag?.contextState??null,voicePool:diag?.voicePool??null};`);
      if(args.utilityWarmup==='true'){
        sample.shaderWarmupActualEffectMaterials=await chrome.evaluate(`const materials=new Set();window.__ESMO_FPS_SCENE__.fxGroup.traverse(object=>{if(object.isMesh&&!Array.isArray(object.material)&&object.material?.isMeshStandardMaterial&&object.material.transparent)materials.add(object.material);});return materials.size;`);
        ck(`${map} 真透明Standard特效完成準備期預熱`,sample.shaderWarmup?.status==='ready'&&sample.shaderWarmup.effectMaterialCount===sample.shaderWarmupActualEffectMaterials&&sample.shaderWarmupActualEffectMaterials>0,JSON.stringify({warmup:sample.shaderWarmup,actual:sample.shaderWarmupActualEffectMaterials}));
      }
      if(args.weaponSockets==='true'){
        // 量測完成後才取10名角色的真socket，避免bounds／探針工作混入frame-time。
        sample.weaponSockets=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__;return st.players.map(p=>{const c=p.rigged,family=c.c2c?.weaponFamily,target=c.muzzleDiagnosticPosition,direction=c.muzzleDiagnosticDirection,position=c.getMuzzleWorldPosition(target,family),heading=c.getMuzzleWorldDirection(direction,family);return{id:p.id,family,pose:c.c2c?.weaponPose,position:position?.toArray()||null,direction:heading?.toArray()||null};});`);
        ck(`${map} 10名產品人物使用手骨真槍口`,sample.weaponSockets.length===10&&sample.weaponSockets.every(p=>p.pose==='hand_r'&&p.position?.length===3&&p.position.every(Number.isFinite)&&p.direction?.length===3&&p.direction.every(Number.isFinite)),JSON.stringify(sample.weaponSockets));
        ck(`${map} 交戰FX實際讀取槍口與方向`,sample.weaponFx.muzzleSocketsMax>0&&sample.weaponFx.muzzleDirectionsMax>0&&sample.weaponFx.tracerSocketsMax>0&&sample.weaponFx.muzzleFallbacksMax===0,JSON.stringify(sample.weaponFx));
      }
      if(saveSceneCaptures){
        const shot = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(out, `${map}-active.png`), Buffer.from(shot.data, 'base64'));
        await rememberCanvasRect('active');
      }
      // 活動情境量完才切換玩家端鏡頭，避免改變 performance sample。
      await chrome.evaluate(`document.querySelector('[data-testid="cs-camera-preset-overview"]')?.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);
      await sleep(1400);
      if(saveSceneCaptures){
        const overview = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(out, `${map}-overview.png`), Buffer.from(overview.data, 'base64'));
        await rememberCanvasRect('overview');
      }
      if(args.details==='true'){
        const actor=await chrome.evaluate(`const controls=document.querySelector('[data-testid="cs-playback-controls"]');const pause=[...(controls?.querySelectorAll('button')||[])].find(b=>b.textContent==='❚❚');pause?.click();const st=window.__ESMO_FPS_SCENE__,f=st.liveRef.current.sim.frames[st.liveRef.current.fIdx],p=f.players.find(p=>!p.dead);if(!p)return null;document.querySelector('[data-esmo-fps-player-card="'+p.id+'"]')?.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return p.id;`);
        if(!actor)throw new HarnessError('近鏡頭驗收缺少存活角色');
        if(args.weaponPoseLayers==='true') {
          await sleep(100);
          sample.weaponPoseLayers={before:await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,frame=st.liveRef.current.sim.frames[st.liveRef.current.fIdx],diagnostics=window.__ESMO_FPS_C2A__?.players||{};return frame.players.map(p=>({id:p.id,dead:p.dead,stance:p.stance,reloading:p.reloading,hitTimer:diagnostics[p.id]?.hitTimer,pose:diagnostics[p.id]?.poseLayers,currentClip:diagnostics[p.id]?.currentClip}));`)};
        }
        if(args.animationLifecycle==='true'){
          await sleep(100);
          sample.animationPause={before:await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.readonlyAnimationPoseProbe();`)};
        }
        await sleep(1300);
        if(args.weaponPoseLayers==='true') {
          sample.weaponPoseLayers.after=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,frame=st.liveRef.current.sim.frames[st.liveRef.current.fIdx],diagnostics=window.__ESMO_FPS_C2A__?.players||{};return frame.players.map(p=>({id:p.id,dead:p.dead,stance:p.stance,reloading:p.reloading,hitTimer:diagnostics[p.id]?.hitTimer,pose:diagnostics[p.id]?.poseLayers,currentClip:diagnostics[p.id]?.currentClip}));`);
          const {before,after}=sample.weaponPoseLayers;
          ck(`${map} 真GPU十名角色雙層與原hit/death互斥`,after.length===10&&after.some(p=>p.pose)&&after.every(p=>p.dead?p.pose===null&&p.currentClip==='Death01':p.hitTimer>0?p.pose===null&&p.currentClip==='Hit_Chest':p.pose?.upperBones===53&&(p.stance==='crouched'?['Crouch_Idle_Loop','Crouch_Fwd_Loop'].includes(p.pose.lowerClip):['Idle_Loop','Walk_Loop','Sprint_Loop'].includes(p.pose.lowerClip))&&(['Pistol_Idle_Loop','Pistol_Aim_Neutral','Pistol_Shoot'].includes(p.pose.upperClip)||(p.reloading===true&&p.pose.upperClip==='Pistol_Reload'))),JSON.stringify(after));
          ck(`${map} 真GPU暫停凍結上下層及淡出`,JSON.stringify(before)===JSON.stringify(after),JSON.stringify(after));
          ck(`${map} 雙層時間均為有限真action時間`,after.filter(p=>p.pose).every(p=>Number.isFinite(p.pose.lowerTime)&&Number.isFinite(p.pose.upperTime)),JSON.stringify(after.filter(p=>p.pose).map(p=>({id:p.id,...p.pose}))));
        }
        if(args.animationLifecycle==='true'){
          sample.animationPause.after=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.readonlyAnimationPoseProbe();`);
          const before=sample.animationPause.before,after=sample.animationPause.after;
          const frozen=before.length===10&&after.length===10&&before.every((p,i)=>['id','action','time','mixerTime','modelPosition','handRotation','muzzle'].every(key=>JSON.stringify(p[key])===JSON.stringify(after[i][key])));
          ck(`${map} 真實暫停保持10名動畫及槍口`,frozen,JSON.stringify(after.map(p=>({id:p.id,action:p.action,time:p.time,mixerTime:p.mixerTime}))));
          const corpses=after.filter(p=>p.dead);
          ck(`${map} 已死角色真bounds貼原地形`,corpses.length>0&&corpses.every(p=>Number.isFinite(p.minWorldY)&&Math.abs(p.minWorldY-p.floorWorldY)<.0001&&Math.abs(p.groundContactY-p.floorWorldY)<.0001),JSON.stringify(corpses.map(p=>({id:p.id,floor:p.floorWorldY,min:p.minWorldY,contact:p.groundContactY}))));
        }
        if(saveSceneCaptures){
          const detail=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${map}-detail.png`),Buffer.from(detail.data,'base64'));
          await rememberCanvasRect('detail');
        }
        if(production){
          captureCamera.detail=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.readonlyOcclusionProbe();`);captureCamera.fadePrograms=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.readonlyFadeProgramProbe();`);
          const programs=captureCamera.fadePrograms?.materials;
          ck(`${map} 淡出材質實際shader不強制不透明`,Array.isArray(programs)&&programs.every(p=>p.compiledOpaque===false),JSON.stringify(programs));
          if(args.contactSinglePass==='true'){
            sample.contactShadow=await chrome.evaluate(`const material=window.__ESMO_FPS_SCENE__.c3Environment.group.getObjectByName('Contact-shading_single-batch')?.material;return material?{forceSinglePass:material.forceSinglePass,side:material.side,version:material.version,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite}:null;`);
            const contact=sample.contactShadow;
            ck(`${map} 真地面陰影單pass不逐幀切shader`,contact?.forceSinglePass===true&&contact.side===2&&contact.version<=1&&contact.opacity===.38&&contact.transparent===true&&contact.depthWrite===false,JSON.stringify(contact));
          }
        }
        if(args.characterViews==='true') {
          const rect=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};`);
          const x=rect.x+rect.width*.8,y=rect.y+rect.height*.35,step=Math.min(262,rect.width*.72),directory=path.join(out,'character-views');
          fs.mkdirSync(directory,{recursive:true});sample.characterViews=[];
          const drag=async delta=>{await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+delta,y,button:'left',buttons:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+delta,y,button:'left',buttons:0,clickCount:1});await sleep(1000);};
          const capture=async(view,expectedActor)=>{const file='character-views/'+map+'-'+view+'.png',shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,file),Buffer.from(shot.data,'base64'));sample.characterViews.push({view,file,expectedActor,camera:await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__;return{selected:s.liveRef.current.selected,frame:s.liveRef.current.fIdx,playing:s.liveRef.current.playing,yaw:s.cam.chaseYaw,radius:s.cam.manualRadius};`)});};
          const other=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,p=s.liveRef.current.sim.frames[s.liveRef.current.fIdx].players,selected=p.find(p=>p.id===s.liveRef.current.selected);return p.find(p=>!p.dead&&p.side!==selected.side)?.id||null;`);
          if(!other)throw new HarnessError('兩隊人物近鏡頭缺少另一隊存活角色');
          for(const [id,label] of [[actor,'selected'],[other,'opponent']]){
            if(id!==actor){await chrome.evaluate(`document.querySelector('[data-esmo-fps-player-card="${id}"]')?.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);await sleep(1000);}
            // Wheel handler intentionally consumes direction, not magnitude;
            // use repeated real events to reach a genuine close spectator view.
            for(let i=0;i<20;i++){await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:-60});await sleep(50);}await sleep(1200);
            await capture(label+'-rear',id);await drag(-step);await capture(label+'-side',id);await drag(-step);await capture(label+'-front',id);
            await drag(step);await drag(step);
          }
          // Restore selected actor through the same UI before the POV gate.
          await chrome.evaluate(`document.querySelector('[data-esmo-fps-player-card="${actor}"]')?.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);await sleep(1000);
          ck(`${map} 兩隊真近鏡頭六視角保持暫停幀`,sample.characterViews.length===6&&sample.characterViews.every(v=>v.camera.selected===v.expectedActor&&v.camera.playing===false&&v.camera.frame===sample.characterViews[0].camera.frame&&v.camera.radius<=3)&&Math.abs(sample.characterViews[2].camera.yaw-sample.characterViews[0].camera.yaw)>.5,JSON.stringify(sample.characterViews));
        }
        if(args.tailoredClothing==='true') {
          sample.tailoredClothing=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.players.map(p=>{const c=p.rigged,t=c?.c2c?.tailored,m=t?.mesh,s=c?.model?.getObjectByName('SuperHero_Male');let visibleTriangles=0;c?.model?.traverseVisible(o=>{if(o.isMesh&&o.geometry)visibleTriangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;});return {id:p.id,mesh:m?.name,geometry:m?.geometry.uuid,skeleton:m?.skeleton.uuid,bones:m?.skeleton.bones.length,sourceSkeleton:m?.skeleton===s?.skeleton,borrowedSourceGeometry:m?.geometry===s?.geometry,sourceHidden:s?.visible===false,groups:m?.geometry.groups.length,bodyTriangles:t?.triangles,seams:m?.geometry.userData.esmoSeams,sleeveRows:m?.geometry.userData.esmoSleeveRows,cuffRoll:m?.geometry.userData.esmoCuffRoll,removedProxies:t?.removedProxies,visibleTriangles,weaponFamily:c?.c2c?.weaponFamily,weaponTriangles:c?.c2c?.weaponSourceTriangles?.[c?.c2c?.weaponFamily]||0,castShadow:m?.castShadow,boneTextureBytes:m?.skeleton.boneTexture?.image?.data?.byteLength||0,finite:m?.geometry.attributes.position.array.every(Number.isFinite)};});`);
          const clothes=sample.tailoredClothing;
          ck(`${map} 十人真65骨連續服裝替換proxy`,clothes.length===10&&clothes.every(c=>c.mesh==='ESMO_Major_ContinuousClothing'&&c.bones===65&&c.sourceSkeleton&&!c.borrowedSourceGeometry&&c.sourceHidden&&c.removedProxies===26&&c.finite),JSON.stringify(clothes));
          ck(`${map} 服裝geometry共用、actor骨架獨立`,new Set(clothes.map(c=>c.geometry)).size===1&&new Set(clothes.map(c=>c.skeleton)).size===10,JSON.stringify(clothes));
          ck(`${map} 真可見蒙皮與新來源武器成本分列`,clothes.every(c=>c.bodyTriangles===13286&&c.sleeveRows?.addedTriangles===188&&c.sleeveRows?.addedVertices===94&&c.cuffRoll?.addedTriangles===236&&c.cuffRoll?.ventSegmentCount===2&&c.cuffRoll?.addedVertices===280&&c.cuffRoll?.profileRows===10&&c.cuffRoll?.returnLength===.030&&c.cuffRoll?.uvSpace==='measured-surface-arclength'&&c.cuffRoll?.sourceWeights==='per-profile-row'&&c.cuffRoll?.thickness===.002&&c.cuffRoll?.extraDraws===0&&c.sleeveRows?.crossingTriangles===0&&c.sleeveRows?.hangingEdges===0&&c.sleeveRows?.conformingEdges>10&&c.sleeveRows?.maxCoverageError<1e-8&&c.sleeveRows?.maxDroppedWeight===0&&c.seams?.originalTriangles===12566&&c.seams?.addedTriangles===296&&c.seams?.crossingTriangles===0&&c.seams?.maxCoverageError<1e-8&&c.visibleTriangles-c.weaponTriangles>=13286&&c.visibleTriangles-c.weaponTriangles<17000&&c.visibleTriangles<=22000&&c.weaponTriangles<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[c.weaponFamily]&&c.groups===4&&(width>=600||c.castShadow===false)),JSON.stringify(clothes));
          sample.wovenSurfaces=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,gl=s.renderer.getContext();return s.players.map(p=>{const c=p.rigged.c2c,g=c.tailored.geometry,materials=[c.materials.fabric,c.materials.pants,...c.tailored.mesh.material.slice(0,2)];return{id:p.id,blend:g.userData.esmoHandBlend,colours:g.attributes.color?.count,positions:g.attributes.position.count,materials:materials.map(m=>{const program=s.renderer.properties.get(m).currentProgram?.program,location=program?gl.getUniformLocation(program,'esmoClothColourGain'):null,toneLocation=program?gl.getUniformLocation(program,'esmoClothToneStrength'):null,detailLocation=program?gl.getUniformLocation(program,'esmoClothDetailStrength'):null;return{tone:toneLocation===null?null:gl.getUniform(program,toneLocation),detail:detailLocation===null?null:gl.getUniform(program,detailLocation),colour:m.map?.name,normal:m.normalMap?.name,colourId:m.map?.uuid,normalId:m.normalMap?.uuid,width:m.map?.image?.width,height:m.map?.image?.height,gain:location===null?null:Array.from(gl.getUniform(program,location)||[])};})};});`);
          ck(`${map} 十人rigid與skinned借用真布料、GPU校色及私有連續腕口`,sample.wovenSurfaces.length===10&&sample.wovenSurfaces.every(row=>row.colours===row.positions&&row.blend?.sourcePaintReused===false&&row.blend?.gloveVertices>100&&row.materials.length===4&&row.materials.every((m,materialIndex)=>m.colour?.includes('terlenka-colour-1k.jpg')&&m.normal?.includes('terlenka-normal-1k.jpg')&&m.width===1024&&m.height===1026&&Math.abs(m.detail-[.0016,.0016,.0032,.0016][materialIndex])<1e-9&&Math.abs(m.tone-[.04,.04,.08,.04][materialIndex])<1e-8&&m.gain?.length===3&&m.gain.every((v,i)=>Math.abs(v-[1.7857399024,2.3367278146,3.1404382655][i])<1e-4)))&&new Set(sample.wovenSurfaces.flatMap(row=>row.materials.map(m=>m.colourId))).size===1&&new Set(sample.wovenSurfaces.flatMap(row=>row.materials.map(m=>m.normalId))).size===1,JSON.stringify(sample.wovenSurfaces));
        }
        await chrome.evaluate(`const pov=document.querySelector('[data-testid="cs-camera-preset-pov"]');if(!pov||pov.disabled)throw new Error('第一人稱入口不可用');pov.click();return true;`);
        await sleep(1300);
        if(saveSceneCaptures){
          const pov=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${map}-pov.png`),Buffer.from(pov.data,'base64'));
        }
        if(args.povWeapon==='true') {
          const snapshot=()=>chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,w=st.povWeapon,source=st.players.find(p=>p.id===st._chase?.id)?.rigged?.c2c?.weaponGroups?.[w.family],variant=w.group.getObjectByName('ESMO_FPS_POV_'+w.family),originals=new Map();source?.traverse(o=>{if(o.isMesh)originals.set(o.name,o)});let shared=0,meshes=0;variant?.traverse(o=>{if(!o.isMesh)return;meshes++;const source=originals.get(o.name);if(source&&source.geometry===o.geometry&&source.material===o.material)shared++;});let sceneAttached=false,ancestorsVisible=true;for(let p=w.group;p;p=p.parent){ancestorsVisible=ancestorsVisible&&p.visible;if(p===st.scene)sceneAttached=true;}return {diagnostics:st.povWeaponDiagnostics,shared,meshes,sceneAttached,ancestorsVisible,cameraAttached:st.camera.parent===st.scene,flash:w.flash.visible,position:w.group.position.toArray(),rotation:w.group.quaternion.toArray(),major:w.major};`);
          sample.povWeapon={before:await snapshot()}; await sleep(350); sample.povWeapon.after=await snapshot();
          const {before,after}=sample.povWeapon,d=after.diagnostics;
          ck(`${map} 真POV模型接到角色資產且在可渲染scene內`,after.major===true&&d?.ready===true&&d.visible===true&&d.weaponParts>0&&after.meshes===after.shared&&d.weaponParts===after.meshes&&after.sceneAttached&&after.ancestorsVisible&&after.cameraAttached,JSON.stringify(after));
          ck(`${map} POV合批成本不高於舊12部件`,d?.weaponParts+d?.ownedParts<=12,JSON.stringify({weapon:d?.weaponParts,owned:d?.ownedParts}));
          if(args.weaponArt==='true') {
            const support=d?.supportLocal,hand=d?.supportHandLocal;
            const distance=support?.length===3&&hand?.length===3?Math.hypot(...support.map((v,i)=>v-hand[i])):Infinity;
            ck(`${map} 真POV支撐手依來源socket且真解剖手部已接線`,d?.authoredGloves===true&&d.anatomicalHands===true&&distance<.05&&d.weaponTriangles<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[d?.family],JSON.stringify({family:d?.family,support,hand,distance,triangles:d?.weaponTriangles,budget:FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[d?.family],anatomicalHands:d?.anatomicalHands}));
            sample.povTextiles=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,rows=[],maps=new Set(),colourMaps=new Set();let triangles=0;s.povWeapon.group.traverse(o=>{if(!o.isMesh||o.userData.esmoPovBorrowed)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const m=o.material,n=m.normalMap,c=m.map,gl=s.renderer.getContext(),program=s.renderer.properties.get(m).currentProgram?.program,detailLocation=program?gl.getUniformLocation(program,'esmoClothDetailStrength'):null;if(m.name==='ESMO_POV_LeatherGlove'||m.name==='ESMO_POV_WovenSleeve'){maps.add(n);colourMaps.add(c);rows.push({role:m.name,clothDetail:detailLocation===null?null:gl.getUniform(program,detailLocation),tailoring:program&&gl.getUniformLocation(program,'esmoSleeveTailoring')!==null?gl.getUniform(program,gl.getUniformLocation(program,'esmoSleeveTailoring')):null,meshScale:o.scale.toArray(),normal:n?.name,width:n?.image?.width,height:n?.image?.height,colorSpace:n?.colorSpace,colour:{name:c?.name,width:c?.image?.width,height:c?.image?.height,colorSpace:c?.colorSpace},normalScale:m.normalScale.toArray(),bumpDisabled:m.bumpMap===null});}});const estimate=set=>[...set].reduce((sum,t)=>sum+(t?.image?.width||0)*(t?.image?.height||0)*4*(t?.generateMipmaps?4/3:1),0)/1048576;return{rows,ownedTriangles:triangles,enabled:s.povWeaponDiagnostics.textileNormals,borrowedNormalMaps:maps.size,borrowedColourMaps:colourMaps.size,normalTextureEstimateMiB:estimate(maps),colourTextureEstimateMiB:estimate(colourMaps),rendererMemory:{...s.renderer.info.memory}};`);
            ck(`${map} 真POV皮革與織物法線已解碼且原私有成本保留`,sample.povTextiles.enabled===true&&sample.povTextiles.rows.length===4&&sample.povTextiles.rows.every(row=>{const woven=row.role==='ESMO_POV_WovenSleeve',normal=woven?'ESMO_CC0_terlenka-normal-1k.jpg':'ESMO_CC0_leather-white-normal-1k.jpg',colour=woven?'ESMO_CC0_terlenka-colour-1k.jpg':'ESMO_CC0_leather-white-colour-1k.jpg',height=woven?1026:1024;return row.normal===normal&&row.width===1024&&row.height===height&&row.colorSpace===''&&row.bumpDisabled&&row.normalScale.every(n=>n>0&&n<=.5)&&row.colour.name===colour&&row.colour.width===1024&&row.colour.height===height&&row.colour.colorSpace==='srgb';})&&sample.povTextiles.borrowedNormalMaps===2&&sample.povTextiles.borrowedColourMaps===2&&sample.povTextiles.ownedTriangles<=5200,JSON.stringify(sample.povTextiles));
            sample.povGloveSeams=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,gl=s.renderer.getContext(),rows=[];s.povWeapon.group.traverse(o=>{if(!o.isMesh||o.material.name!=='ESMO_POV_LeatherGlove')return;const m=o.material,t=m.userData.esmoPovDetailMap,program=s.renderer.properties.get(m).currentProgram?.program;rows.push({uuid:t?.uuid,width:t?.image?.width,height:t?.image?.height,bytes:t?.image?.data?.byteLength,rgba:t?.format===1023,linear:t?.colorSpace==='',mipmaps:t?.generateMipmaps,uniformActive:Boolean(program&&gl.getUniformLocation(program,'esmoGloveSeams')!==null)});});return rows;`);
            ck(`${map} 真shader原創車線共享一份私有64KiB遮罩`,sample.povGloveSeams.length===2&&new Set(sample.povGloveSeams.map(row=>row.uuid)).size===1&&sample.povGloveSeams.every(row=>row.width===128&&row.height===128&&row.bytes===65536&&row.rgba&&row.linear&&row.mipmaps===false&&row.uniformActive),JSON.stringify(sample.povGloveSeams));
            sample.povPanel=await chrome.evaluate(`const panel=document.querySelector('[data-testid="cs-pov-player-panel"]'),canvas=document.querySelector('canvas');if(!panel||!canvas)return null;const p=panel.getBoundingClientRect(),c=canvas.getBoundingClientRect();return{panel:{top:p.top,bottom:p.bottom,left:p.left,right:p.right},canvas:{top:c.top,bottom:c.bottom,left:c.left,right:c.right},intersects:p.top<c.bottom&&p.bottom>c.top&&p.left<c.right&&p.right>c.left,controls:[...panel.querySelectorAll('button,summary')].map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};`);
            ck(`${map} 真POV選手資訊在戰場外且控制44px不水平溢出`,sample.povPanel&&!sample.povPanel.intersects&&!sample.povPanel.overflow&&sample.povPanel.controls.every(control=>control.width>=44&&control.height>=44),JSON.stringify(sample.povPanel));
          }
          ck(`${map} 暫停進入POV不補歷史且clock及槍姿凍結`,d?.fireCount===0&&after.flash===false&&d.recoil===0&&JSON.stringify(before)===JSON.stringify(after),JSON.stringify(after));
          // Separate raster-cost sample: playback remains paused. This is not
          // an active-combat simulation FPS or a real-phone measurement.
          sample.povWeapon.pausedRender=await chrome.evaluate(`return await new Promise(resolve=>{const st=window.__ESMO_FPS_SCENE__,start=performance.now(),times=[],calls=[],triangles=[];let last=start;const collect=now=>{times.push(now-last);last=now;calls.push(st.renderer.info.render.calls);triangles.push(st.renderer.info.render.triangles);if(now-start<3000){requestAnimationFrame(collect);return;}const pct=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];resolve({state:'paused-pov-raster-only',fps:times.length*1000/(now-start),frameMs:{p95:pct(times,.95),p99:pct(times,.99),max:Math.max(...times)},callsP95:pct(calls,.95),trianglesP95:pct(triangles,.95),frames:times.length,playing:st.liveRef.current.playing});};requestAnimationFrame(collect);});`);
        }
        await rememberCanvasRect('pov');
        captureCamera.pov=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__;return{mode:st.liveRef.current.cameraMode,selected:st.liveRef.current.selected,chase:st._chase?.id,fov:st.camera.fov,eyeY:st.camera.position.y,groundY:st._chase?.elevation||0,fadedWalls:[...(st.fadeWalls||[]),...(st.c3Environment?.fadeDetails||[])].filter(w=>w.cur<.999).length,fadedRoofs:(st.c3Environment?.fadeRoofs||[]).filter(r=>r.cur<.999).length};`);
        const camera=captureCamera.pov;
        ck(`${map} 第一人稱沿用選手與地形高度`,camera.mode==='pov'&&camera.selected===actor&&camera.chase===actor&&camera.fov===(args.baselineSha?42:72)&&Math.abs(camera.eyeY-camera.groundY-1.56)<.12,JSON.stringify(camera));
        ck(`${map} 第一人稱保留實體牆與屋頂`,Boolean(args.baselineSha)||(camera.fadedWalls===0&&camera.fadedRoofs===0),JSON.stringify({fadedWalls:camera.fadedWalls,fadedRoofs:camera.fadedRoofs,legacy:Boolean(args.baselineSha)}));
      }
      if(args.weaponHandling==='true'){
        // Read recorded authority; move the cursor and choose actors through
        // native UI only. No frame/state patching or diagnostic seek API.
        const targets=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,frames=s.liveRef.current.sim.frames;const find=kind=>{for(let i=1;i<frames.length-1;i++){const f=frames[i],before=frames[i-1];if(f.rnd!==before.rnd)continue;const p=f.players.find(p=>!p.dead&&p.weaponHandlingVersion===1&&p.hp===before.players.find(q=>q.id===p.id)?.hp&&(kind==='reload'?p.reloading&&f.roundSec*1000-p.reloadStartedAtMs>=500&&p.reloadEndsAtMs-f.roundSec*1000>=1000:p.stance==='crouched'&&!p.reloading));if(p)return{index:i,id:p.id,round:f.rnd};}return null;};const reloading=frames.flatMap(f=>f.players.filter(p=>p.reloading&&!p.dead).map(p=>({index:f.fi,id:p.id,gun:p.gun,hp:p.hp,round:f.rnd,ms:f.roundSec*1000,start:p.reloadStartedAtMs,end:p.reloadEndsAtMs})));return{reload:find('reload'),crouch:find('crouch'),coverage:{frames:frames.length,reloadFrames:reloading.length,examples:reloading.slice(0,12)}};`);
        if(!targets.reload||!targets.crouch)throw new HarnessError('真保存frame缺少換彈／蹲姿前置條件：'+JSON.stringify(targets));
        const seekNative=async index=>{
          const slider=await chrome.evaluate(`const e=document.querySelector('input[type="range"]');if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),max=Number(e.max);return{from:r.x+7+(r.width-14)*Number(e.value)/max,to:r.x+7+(r.width-14)*${index}/max,y:r.y+r.height/2};`);
          if(!slider)throw new HarnessError('換彈驗收缺少真slider');
          await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:slider.from,y:slider.y,button:'left',clickCount:1});
          await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:slider.to,y:slider.y,buttons:1});
          await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:slider.to,y:slider.y,button:'left',clickCount:1});
          await sleep(120);
          let cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]').value);`);
          if(!Number.isFinite(cursor)||Math.abs(cursor-index)>64)throw new HarnessError('換彈真slider拖曳未到目標附近：'+JSON.stringify({index,cursor}));
          for(let n=0;n<65&&cursor!==index;n++){
            const key=cursor<index?'ArrowRight':'ArrowLeft';await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='ArrowRight'?39:37});await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='ArrowRight'?39:37});
            cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]').value);`);
          }
          await sleep(150);
          if(cursor!==index)throw new HarnessError('換彈真slider游標未到精確frame：'+JSON.stringify({index,cursor}));
        };
        const choose=async target=>{
          await seekNative(target.index);
          await chrome.evaluate(`const buttons=document.querySelector('[data-testid="cs-camera-presets"]'),preset=[...(buttons?.querySelectorAll('button')||[])].find(b=>b.textContent==='高位上帝');if(!preset)throw new Error('換彈驗收缺少真camera控制');preset.click();return true;`);
          // Preset transitions own camera composition for 900ms. Let the real
          // transition end, then select and zoom through UI for visible poses.
          await sleep(1100);
          await chrome.evaluate(`const actor=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');if(!actor)throw new Error('換彈驗收缺少真actor控制');actor.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);await sleep(1300);
          const rect=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+r.width*.8,y:r.y+r.height*.35};`);
          for(let n=0;n<20;n++){await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.x,y:rect.y,deltaX:0,deltaY:-60});await sleep(50);}await sleep(400);
        };
        const snapshot=()=>chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx],p=f.players.find(p=>p.id===s.liveRef.current.selected),d=window.__ESMO_FPS_C2A__?.players[p?.id];return{frame:s.liveRef.current.fIdx,round:f.rnd,roundSec:f.roundSec,playing:s.liveRef.current.playing,cameraMode:s.liveRef.current.cameraMode,id:p?.id,ammo:p?.ammo,reserve:p?.reserveAmmo,stance:p?.stance,reloading:p?.reloading,start:p?.reloadStartedAtMs,end:p?.reloadEndsAtMs,hitTimer:d?.hitTimer,pose:d?.poseLayers};`);
        await choose(targets.reload);const before=await snapshot();await sleep(350);const paused=await snapshot();
        ck(`${map} 真UI換彈前提與真GLB進度`,before.frame===targets.reload.index&&before.id===targets.reload.id&&!before.playing&&before.cameraMode==='tactical'&&before.reloading&&before.ammo===0&&before.pose?.upperClip==='Pistol_Reload'&&before.pose.upperTime>0,JSON.stringify(before));
        ck(`${map} 換彈pause保持真動畫與彈量`,JSON.stringify(before)===JSON.stringify(paused),JSON.stringify(paused));
        await seekNative(targets.reload.index+1);const forward=await snapshot();await seekNative(targets.reload.index);const restored=await snapshot();
        ck(`${map} 換彈seek按保存時刻還原`,forward.id===before.id&&forward.pose?.upperClip==='Pistol_Reload'&&forward.pose.upperTime>before.pose.upperTime&&restored.frame===before.frame&&restored.ammo===before.ammo&&Math.abs(restored.pose?.upperTime-before.pose.upperTime)<1e-5,JSON.stringify({forward,restored}));
        await chrome.evaluate(`document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);
        const reloadShot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${map}-handling-reload.png`),Buffer.from(reloadShot.data,'base64'));await rememberCanvasRect('handling-reload');
        await chrome.evaluate(`document.querySelector('[data-testid="cs-camera-preset-pov"]').click();return true;`);await sleep(1200);
        const povReloadSnapshot=()=>chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx],p=f.players.find(p=>p.id===s.liveRef.current.selected),d=s.povWeaponDiagnostics;return{index:s.liveRef.current.fIdx,id:p?.id,playing:s.liveRef.current.playing,reloading:p?.reloading,start:p?.reloadStartedAtMs,end:p?.reloadEndsAtMs,roundMs:f.roundSec*1000+Math.max(0,s.subT||0)*(s.liveRef.current.playbackFrameSec||.5)*1000,diagnostics:d,position:s.povWeapon.group.position.toArray(),rotation:s.povWeapon.group.quaternion.toArray(),flash:s.povWeapon.flash.visible};`);
        const povReload=await povReloadSnapshot();await sleep(300);const povReloadPaused=await povReloadSnapshot();
        ck(`${map} 真POV換彈讀權威時間且pause保持`,povReload.reloading&&povReload.diagnostics?.reloading&&!povReload.playing&&!povReload.flash&&Math.abs(povReload.diagnostics.reloadProgress-(povReload.roundMs-povReload.start)/(povReload.end-povReload.start))<1e-5&&JSON.stringify(povReload)===JSON.stringify(povReloadPaused),JSON.stringify(povReload));
        await seekNative(targets.reload.index+1);const povReloadForward=await povReloadSnapshot();await seekNative(targets.reload.index);const povReloadRestored=await povReloadSnapshot();
        ck(`${map} 真POV換彈前後seek還原姿態`,povReloadForward.diagnostics?.reloadProgress>povReload.diagnostics.reloadProgress&&povReloadRestored.diagnostics?.reloadProgress===povReload.diagnostics.reloadProgress&&JSON.stringify(povReloadRestored.position)===JSON.stringify(povReload.position)&&JSON.stringify(povReloadRestored.rotation)===JSON.stringify(povReload.rotation),JSON.stringify({forward:povReloadForward,restored:povReloadRestored}));
        await chrome.evaluate(`document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);const povReloadShot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${map}-handling-pov-reload.png`),Buffer.from(povReloadShot.data,'base64'));await rememberCanvasRect('handling-pov-reload');
        await choose(targets.crouch);const crouch=await snapshot();
        ck(`${map} 真UI蹲姿來自保存frame且雙層互斥`,crouch.frame===targets.crouch.index&&crouch.id===targets.crouch.id&&!crouch.playing&&crouch.stance==='crouched'&&!crouch.reloading&&crouch.pose?.lowerClip==='Crouch_Idle_Loop'&&crouch.pose.upperBones===53,JSON.stringify(crouch));
        const crouchShot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${map}-handling-crouch.png`),Buffer.from(crouchShot.data,'base64'));await rememberCanvasRect('handling-crouch');
        sample.weaponHandling={targets,before,paused,forward,restored,crouch,povReload,povReloadPaused,povReloadForward,povReloadRestored};
      }
      if(args.weaponGallery==='true')sample.majorHud=await verifyFpsMajorHudLayout({chrome,sleep,ck,map});
      if(args.weaponGallery==='true')sample.weaponGallery=await captureFpsWeaponArtGallery({chrome,sleep,ck,map,out});
      if(args.weaponReloadGallery==='true')sample.weaponReloadGallery=await captureFpsWeaponArtGallery({chrome,sleep,ck,map,out,reload:true});
      if(args.operatorGallery==='true'){
        sample.operatorCaptureScope=args.operatorHandClose==='true'?'DIAGNOSTIC_ONLY_WRISTS_AND_FINGERS_NOT_FULL_BODY':args.operatorFocus?(args.operatorCuffViews==='true'?'DIAGNOSTIC_ONLY_SUPPORT_FRONT_RIGHT_RIGHT':'DIAGNOSTIC_ONLY_SUPPORT_FRONT_FRONT_LEFT'):'FULL_SIX_IDENTITIES';
        if(args.operatorTriggerClose==='true')sample.operatorCaptureScope='DIAGNOSTIC_ONLY_TRIGGER_SIDE_TWO_PNG_NOT_FULL_BODY';
        sample.operatorGallery=await captureFpsOperatorArtGallery({chrome,sleep,ck,map,out,threeQuarter:args.operatorThreeQuarter==='true',frontQuarter:args.operatorFrontQuarter==='true',focusVariation:args.operatorFocus||null,cuffViews:args.operatorCuffViews==='true',handClose:args.operatorHandClose==='true',handFamily:args.operatorHandFamily||null,triggerClose:args.operatorTriggerClose==='true'});
        fs.writeFileSync(path.join(out,`${map}-operator-gallery.json`),JSON.stringify({sourceFingerprint,archivedProductionArtifact,viewport:{width,height},captures:sample.operatorGallery},null,2));
      }
      if(args.runtimeAuthoring==='true')sample.runtimeAuthoring=await captureFpsRuntimeAuthoring({chrome,sleep,map,out,ck,sourceFingerprint,archivedProductionArtifact,sourceHashes:runtimeAuthoringSourceHashes});
      if(args.supportGrip==='true'){
        sample.supportGrip=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,V=s.camera.position.constructor;return s.players.filter(a=>a.rigged?.gripPose?.diagnostics().applied).map(a=>{const c=a.rigged.c2c,l=a.rigged.model.getObjectByName('hand_l'),r=a.rigged.model.getObjectByName('hand_r'),sockets=c.weaponSockets[c.weaponFamily];const support=sockets.support.getWorldPosition(new V()),left=l.localToWorld(new V(0,.055,.015)),grip=sockets.grip.getWorldPosition(new V()),right=r.localToWorld(new V(0,.055,.015));return{id:a.id,family:c.weaponFamily,leftDistance:left.distanceTo(support),rightDistance:right.distanceTo(grip),diag:a.rigged.gripPose.diagnostics()};});`);
        if(!sample.supportGrip.length)throw new HarnessError('真第三人稱握槍取證無活躍握姿，不能以空陣列PASS');
        ck(`${map} 真第三人稱双掌接觸來源socket`,sample.supportGrip.every(r=>r.leftDistance<1e-4&&r.rightDistance<1e-4&&r.diag.status==='contact'),JSON.stringify(sample.supportGrip));
      }
      if(args.audioLifecycle==='true')sample.audioLifecycle=await verifyFpsAudioLifecycle({chrome,sleep,ck,map,mobile:width<600,before:audioEnabled});
      if(args.ambientLifecycle==='true')sample.ambientLifecycle=await verifyFpsAmbientLifecycle({chrome,sleep,ck,map});
      if(args.matrixDiagnostic==='true')sample.staticMatrixDiagnostic=await measureFpsStaticMatrixCost({chrome,map,out,target:args.matrixTarget||'static'});
      if(production&&!args.referencePhase)sample.weaponHandlingCoverage=await chrome.evaluate(`const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,reloading=frames.flatMap(f=>f.players.filter(p=>p.weaponHandlingVersion===1&&p.reloading&&!p.dead).map(p=>({index:f.fi,id:p.id,gun:p.gun,round:f.rnd,ms:f.roundSec*1000,start:p.reloadStartedAtMs,end:p.reloadEndsAtMs})));return{runtime:'actual-browser-recorded-simulation',frames:frames.length,reloadFrames:reloading.length,examples:reloading.slice(0,12)};`);
      const errors = { page: [...chrome.pageErrors], console: chrome.consoleLines.filter(x=>x.startsWith('[error]')) };
      rows.push({ phase, map, seed:505001, state:args.state||'opening',sourceSha:args.baselineSha||null,sourceFingerprint,archivedProductionArtifact, viewport:{width,height}, build:production?'production preview (僅一次性唯讀scene probe，DEV關閉)':'development (正式元件診斷入口)', coldReadyMs, ...sample, captureRects,captureCamera, errors });
      rows.at(-1).angleBackendRequested=args.angleBackend||'default';
      rows.at(-1).evidenceCaptureScope=localOperatorCapture?(args.operatorHandClose==='true'?'DIAGNOSTIC_ONLY_WRISTS_AND_FINGERS_NOT_FULL_BODY':args.operatorCuffViews==='true'?'DIAGNOSTIC_ONLY_SUPPORT_FRONT_RIGHT_RIGHT':'DIAGNOSTIC_ONLY_SUPPORT_FRONT_FRONT_LEFT'):args.captureMode==='metrics'?'DIAGNOSTIC_METRICS_ONLY':'FULL_REQUESTED_STATES';
      if(args.operatorTriggerClose==='true')rows.at(-1).evidenceCaptureScope='DIAGNOSTIC_ONLY_TRIGGER_SIDE_TWO_PNG_NOT_FULL_BODY';
      fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(rows,null,2));
      ck(`${map} 實際 GPU 量測`, sample.frames>0 && sample.fps>0 && !/swiftshader|llvmpipe|software/i.test(sample.gpu||'unknown'), `GPU=${sample.gpu}; FPS=${sample.fps.toFixed(1)}; p95=${sample.frameMs.p95.toFixed(2)}ms; calls=${sample.render.callsP95}; triangles=${sample.render.trianglesP95}`);
      if(args.angleBackend==='gl')ck(`${map} 指定OpenGL後端確實成立`,/OpenGL/i.test(sample.gpu||''),String(sample.gpu));
      ck(`${map} 10/10 rigged`,sample.players===10&&sample.rigged===10);
      if(!args.baselineSha)ck(`${map} 交戰不新增PointLight／SpotLight`,sample.lighting.activePointAndSpot===0,JSON.stringify(sample.lighting));
      ck(`${map} 自動取景沒有整隊消失`,sample.visibility!=null&&sample.visibility.wholeTeamOffCamera.length===0&&sample.visibility.aliveBodyHidden.length===0&&sample.visibility.nonFiniteBodyTransforms.length===0,JSON.stringify({wholeTeamOffCamera:sample.visibility?.wholeTeamOffCamera,aliveBodyHidden:sample.visibility?.aliveBodyHidden}));
       ck(`${map} console/page error 0`,errors.page.length===0&&errors.console.length===0,JSON.stringify(errors));
    }
  },
});
fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(result,null,2));
}finally{await baselineServer?.close();if(productionServer)await new Promise(resolve=>productionServer.httpServer.close(resolve));}
await finishGate(result);
