import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";

// 唯讀記憶體 transform；不改正式元件／磁碟上的模擬程式。
export async function loadFpsMajorTestApi(source, root=process.cwd()) {
  const stagePrefix=process.env.ESMO_CS_API_STAGE_PREFIX;
  const stage=name=>{if(stagePrefix){if(!stagePrefix.startsWith('review/cs-major-upgrade/evidence/'))throw Error('API stage path outside CS evidence');fs.appendFileSync(stagePrefix+'.ndjson',JSON.stringify({stage:name,at:new Date().toISOString(),memory:process.memoryUsage()})+'\n');}};
  stage('api-enter');
  const file=path.resolve(root,"src/battle/fps/EsportsFPS3D.jsx");
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"esmo-cs-major-api-"));
  let server;
  try{
    // This read-only simulation loader has no project CSS pipeline. Explicit
    // empty PostCSS config prevents a new component CSS import from scanning
    // ancestor/OneDrive folders during SSR. Real CSS is verified by Vite build.
    server=await createServer({root,configFile:false,envFile:false,css:{postcss:{plugins:[]}},appType:"custom",logLevel:"error",cacheDir:path.join(temp,"cache"),optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},plugins:[{
      name:"cs-major-read-only-api",enforce:"pre",
      transform(_code,id){
        if(path.resolve(id.split("?")[0]).toLowerCase()!==file.toLowerCase())return null;
        const marker="return { EsportsFPS3D, buildMatchResult };";
        const exportMarker="export { EsportsFPS3D, buildMatchResult };";
        if(source.split(marker).length!==2||source.split(exportMarker).length!==2)throw new Error("CS API marker 格式改變");
        // 驗證 watchdog 只報錯，絕不替正式比賽指定勝負或修改規則。
        const code=source.replace("while(!ruleState.completed){", "while(!ruleState.completed){ if(ruleState.roundsPlayed>=96)throw new Error('對戰驗證超過 96 回合：'+JSON.stringify({mapKey,score:ruleState.score,recent:roundHist.slice(-6).map(r=>({round:r.round,how:r.how,winnerSide:r.winnerSide})),blockedPositions:movementAudit.blockedPositions,wallSegmentCrossings:movementAudit.wallSegmentCrossings}));")
          .replace(marker,"return { EsportsFPS3D, buildMatchResult, simulateFps, MAPS, ROSTER, TACTICS_DB, c5a2SolidObstacles, blocked, lineBlocked, buildNavigableRoute, PLAYER_R, persStat, canEngage, csTargetInFov, weaponAuthority, weaponInRange, smokeBlocks, mapAwareCanReadVisibleCandidate, C5A2_SIM_STEP_SEC };")
          .replace(exportMarker,"const __CS_MAJOR_TEST_API__=__FPS3D_MODULE;export { EsportsFPS3D, buildMatchResult, __CS_MAJOR_TEST_API__ };");
        return{code,map:null};
      },
    }]});
    stage('server-created');
    const mod=await server.ssrLoadModule("/src/battle/fps/EsportsFPS3D.jsx");
    stage('module-loaded');
    return mod.__CS_MAJOR_TEST_API__;
  }finally{
    stage('close-before');await server?.close();stage('close-after');
    // 只刪本函式建立的明確子目錄；禁止擴大到 tmp 根目錄。
    if(path.dirname(path.resolve(temp)).toLowerCase()!==path.resolve(os.tmpdir()).toLowerCase()||!path.basename(temp).startsWith("esmo-cs-major-api-"))throw new Error("暫存清理範圍錯誤");
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
