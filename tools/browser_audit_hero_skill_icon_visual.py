"""Perceptual edge audit for all 500 rendered SVGs, independent of source colors."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 800, 'height': 600})
    page.goto('http://127.0.0.1:5173/ESMO-/', wait_until='networkidle', timeout=90000)
    result = page.evaluate("""async () => {
      const { CHAMPIONS_100 } = await import('/ESMO-/src/data/heroDatabase.js');
      const rows = [];
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (const hero of CHAMPIONS_100) for (const slot of ['P','Q','W','E','R']) {
        const img = new Image();
        img.src = `/ESMO-/assets/skill-icons/v1/${hero.id}/${slot.toLowerCase()}.svg`;
        await img.decode();
        ctx.clearRect(0,0,32,32); ctx.drawImage(img,16,16,96,96,0,0,32,32);
        const data = ctx.getImageData(0,0,32,32).data;
        const lum = new Float64Array(1024);
        for (let i=0;i<1024;i++) lum[i] = .2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2];
        const edges = [];
        for (let y=0;y<16;y++) for (let x=0;x<16;x++) {
          let v=0;
          for (let yy=0;yy<2;yy++) for(let xx=0;xx<2;xx++) {
            const px=x*2+xx, py=y*2+yy, i=py*32+px;
            v+=Math.abs(lum[i]-lum[py*32+Math.min(31,px+1)])+
              Math.abs(lum[i]-lum[Math.min(31,py+1)*32+px]);
          }
          edges.push(v/4);
        }
        const ranked=edges.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v||a.i-b.i);
        const bits=new Array(256).fill(0);
        for(const row of ranked.slice(0,64)) bits[row.i]=1;
        rows.push({ id:`${hero.id}:${slot}`, hero:hero.zh, arch:hero.arch, slot,
          name:hero.skills[slot].name, bits });
      }
      const pairs=[]; const sameHeroPairs=[]; let sameHeroNear=0, crossHeroNear=0;
      for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
        let distance=0;
        for(let k=0;k<256;k++) distance+=rows[i].bits[k]!==rows[j].bits[k];
        if(distance<=36) {
          if(rows[i].id.split(':')[0]===rows[j].id.split(':')[0]) {
            sameHeroNear++;
            sameHeroPairs.push({distance,a:rows[i].id,b:rows[j].id});
          }
          else crossHeroNear++;
        }
        if(distance<=50) pairs.push({distance,a:rows[i].id,b:rows[j].id,
          aName:rows[i].name,bName:rows[j].name});
      }
      pairs.sort((a,b)=>a.distance-b.distance);
      sameHeroPairs.sort((a,b)=>a.distance-b.distance);
      return {icons:rows.length,sameHeroNear,crossHeroNear,sameHeroPairs,topPairs:pairs.slice(0,15)};
    }""")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    report = Path('tmp/moba-skill-talent-owner-review/icon-visual-audit.json')
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert result['icons'] == 500 and result['sameHeroNear'] == 0, '同英雄圖示在去色輪廓比對中仍過於相近'
    browser.close()
