// Foundry專用readiness；保留舊圖adapter不變。
import fs from 'node:fs';import path from 'node:path';
import {HarnessError} from './harness.mjs';
import {clickFpsDNative,uploadFpsDNativeFile} from './fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './fpsNativeTimeline.mjs';
export {networkArchive,networkFixture,networkStartVideo,networkStopVideo} from './fpsNetworkReview.mjs';
export class FoundryReplayImportError extends Error {}
// Separate adapter: legacy readiness gates are preserved byte-for-byte.
export async function foundryReviewImport({chrome,sleep,archive,fixture,width=1366,beforeImport}){
 const restoreView=()=>chrome.evaluate('window.__ESMO_FPS_SCENE__?.renderer.domElement.scrollIntoView({block:"center"});return true;');
 const native=async selector=>{await clickFpsDNative({chrome,sleep,selector});await restoreView();};
 await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:width<600?844:900,deviceScaleFactor:1,mobile:width<600});
 await chrome.navigate(archive.url+'?c5c=battle&map='+fixture.replay.metadata.mapKey+'&seed=505001&scene='+fixture.replay.metadata.sceneVersion);
 const wait=async(fn,what)=>{const end=Date.now()+150000;while(Date.now()<end){if(await chrome.evaluate(fn))return;const mapFailure=await chrome.evaluate('return document.querySelector("[data-testid=fps-map-preparing]")?.textContent?.includes("失敗")||false;');if(mapFailure)throw new FoundryReplayImportError("地圖資源載入失敗，3D尚未渲染");if(what==='Native saved Replay import'){const error=await chrome.evaluate('return document.querySelector("[data-testid=cs-replay-error]")?.textContent||null;');if(error){fs.writeFileSync(path.join(path.dirname(fixture.nativeFile),'import-rejection.json'),JSON.stringify({error,nativeFile:fixture.nativeFile,bytes:fs.statSync(fixture.nativeFile).size},null,2),{flag:'wx'});const shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(path.dirname(fixture.nativeFile),'import-rejection.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});throw new FoundryReplayImportError(what+': '+error);}}await sleep(200);}throw new HarnessError(what);};
 const ready='return Boolean(window.__ESMO_FPS_SCENE__?.presentationAssetsReady&&window.__ESMO_FPS_SCENE__?.presentationReady&&window.__ESMO_FPS_SCENE__?.renderer?.info.render.frame>0&&!document.querySelector("[data-testid=fps-map-preparing]")&&window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==="rigged")&&(window.__ESMO_FPS_SCENE__.c3Environment?.summary.atlasLoaded||(window.__ESMO_FPS_SCENE__.sceneVersion==="major.v5"&&window.__ESMO_FPS_SCENE__.c3Environment?.summary.phase==="greybox"&&window.__ESMO_FPS_SCENE__.c3Environment?.summary.assetsReady===true&&window.__ESMO_FPS_SCENE__.c3Environment?.summary.usesTextureAtlas===false)));';
 await wait(ready,'Native battle mount/real assets readiness');
 if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');
 if(!await chrome.evaluate('return document.querySelector(".fps-major-replay").open;'))await native('.fps-major-replay > summary');
 if(beforeImport)await beforeImport();
 await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type="file"]',filePath:fixture.nativeFile});
 await wait('return Boolean(document.querySelector("[data-testid=cs-replay-mode]"));','Native saved Replay import');await wait(ready,'Imported assets readiness');
 if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');
 await native('[data-testid="match-speed-1"]');await native('[data-testid="cs-camera-preset-overview"]');
 await restoreView();
 return {native,async seek(index){await seekFpsNativeTimeline({chrome,sleep,index});await restoreView();await sleep(120);},async pause(){if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');}};
}
