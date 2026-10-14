import * as THREE from 'three';
// Original deterministic support textures, generated locally. No downloaded
// bitmap, generator/API/billing, wall-time animation or new gameplay authority.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
function hash(x,y,seed){let h=(Math.imul(x,374761393)^Math.imul(y,668265263)^seed)>>>0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);return(a+(b-a)*s)*(1-t)+(c+(d-c)*s)*t;}
export function makeOriginalUtilityTextureData(kind,{size=64,seed=0x43534845}={}){
 if(!['smoke','fire'].includes(kind)||![32,64,128].includes(size))throw Error('Explicit smoke/fire and 32/64/128 size required');
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size,v=(y+.5)/size,px=u*2-1,py=v*2-1,n=.55*noise(u*5,v*5,seed)+.30*noise(u*11,v*11,seed^0x6d6f6261)+.15*noise(u*23,v*23,seed^0x7a21);let alpha,r,g,b;
  if(kind==='smoke'){
   const radius=Math.hypot(px*(1.04+.1*n),py*(.96+.1*n)),edge=clamp((1-radius)/.25),billow=clamp(.4+.6*n),density=Math.exp(-(px*px+py*py)*1.4);
   alpha=edge*edge*density*billow*.93;const tone=139+48*n;r=tone;g=tone-3;b=tone-8;
  }else{
   const bend=.11*Math.sin(v*9+(seed%31)),width=.70*Math.pow(1-v,.74)+.045,body=clamp(1-Math.abs(px-bend)/width),foot=clamp(v/.055),tip=clamp((1-v)/.08);
   alpha=Math.pow(body,1.65)*foot*tip*(.52+.45*n);r=216-v*75+12*n;g=139-v*82+8*n;b=45-v*23+5*n;
  }
  // Fully transparent pixel RGB remains zero, avoiding bright filtering fringes.
  const a=Math.round(clamp(alpha)*255),at=(y*size+x)*4;data[at]=a?Math.round(clamp(r,0,255)):0;data[at+1]=a?Math.round(clamp(g,0,255)):0;data[at+2]=a?Math.round(clamp(b,0,255)):0;data[at+3]=a;
 }
 return{kind,size,data,bytes:data.byteLength,seed,origin:'ESMO original deterministic noise/billow/flame raster',visualAcceptance:'NOT_RENDERED'};
}
export function createOriginalUtilityTextures(options={}){
 const records=['smoke','fire'].map(kind=>makeOriginalUtilityTextureData(kind,options)),textures=records.map(r=>{const t=new THREE.DataTexture(r.data,r.size,r.size,THREE.RGBAFormat);t.name='ESMO_original_'+r.kind;t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.generateMipmaps=false;t.needsUpdate=true;return t;});let disposed=false;
 return{smoke:textures[0],fire:textures[1],records,bytes:records.reduce((n,r)=>n+r.bytes,0),dispose(){if(disposed)return;disposed=true;textures.forEach(t=>t.dispose());}};
}
