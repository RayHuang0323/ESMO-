import * as THREE from 'three';

export const FPS_MAJOR_MAP_ATLAS_URLS=Object.freeze({
  environment:`${import.meta.env?.BASE_URL||'/'}assets/fps/major-v1/environment-albedo-atlas.png`,
  terrain:`${import.meta.env?.BASE_URL||'/'}assets/fps/major-v1/terrain-albedo-atlas-v1.png`,
});
let state='idle',pending=null,images=null;
export const fpsMajorMapAssetState=()=>state;
export const fpsMajorMapImage=key=>images?.[key]||null;

// Decode in parallel with pre-match preparation. Each scene still owns and
// disposes its GPU textures; only immutable decoded source images are cached.
export function preloadFpsMajorMapImages(){
  if(typeof document==='undefined')return Promise.resolve({status:'not-browser'});
  if(state==='ready')return Promise.resolve({status:'ready'});
  if(pending)return pending;
  state='loading';
  pending=Promise.all(Object.entries(FPS_MAJOR_MAP_ATLAS_URLS).map(([key,url])=>new Promise((resolve,reject)=>{
    new THREE.ImageLoader().load(url,image=>resolve([key,image]),undefined,reject);
  }))).then(entries=>{images=Object.fromEntries(entries);state='ready';return{status:'ready'};})
    .catch(()=>{state='failed';return{status:'failed'};}).finally(()=>{pending=null;});
  return pending;
}
