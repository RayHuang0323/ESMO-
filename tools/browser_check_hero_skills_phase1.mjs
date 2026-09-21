import { mkdirSync, writeFileSync } from 'node:fs';
import { runGate, finishGate } from './browser/harness.mjs';
const out = 'tmp/hero-skills';
mkdirSync(out, { recursive: true });
const result = await runGate({ name: 'Hero Skills Phase 1 browser', timeoutMs: 360000,
  async run({ chrome, url, ck, sleep }) {
    await chrome.navigate(`${url}?debug=hero-skills`);
    for (let i = 0; i < 80; i++) {
      if (await chrome.evaluate('return !!window.__HERO_SKILLS_PREVIEW__;')) break;
      await sleep(250);
    }
    const read = () => chrome.evaluate('return window.__HERO_SKILLS_PREVIEW__;');
    const mounted = await read();
    ck('preview mounted with active instances', mounted?.counts?.some(n => n > 0), JSON.stringify({ errors: chrome.pageErrors, console: chrome.consoleLines }));
    if (!mounted) return;
    const click = text => chrome.evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent===${JSON.stringify(text)})b.click()});`);
    // Phase 1 assertions intentionally exercise the preserved DEV-only comparison.
    await click('比較第一輪'); await sleep(150);
    await click('暫停'); await sleep(150);
    const a = await read(); await sleep(250); const b = await read();
    ck('pause freezes timeline', a?.time === b?.time && b?.playing === false);
    const options = await chrome.evaluate(`return [...document.querySelector('select[aria-label="技能"]').options].map(o=>o.value);`);
    for (const id of options) {
      await chrome.evaluate(`const el=document.querySelector('select[aria-label="技能"]'); el.value=${JSON.stringify(id)}; el.dispatchEvent(new Event('change',{bubbles:true}));`);
      // Observe before the shortest authored preview (dawnstrike:Q = 0.9s) expires.
      await click('播放'); await sleep(450); await click('暫停'); await sleep(100);
      const d = await read();
      ck(`${id} renders bounded instances`, d?.skillId === id && d.counts.some(n => n > 0) && d.counts.every(n => n <= d.cap));
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${out}/${id.replace(':', '-')}.png`, Buffer.from(shot.data, 'base64'));
    }
    await click('比較舊效果'); await sleep(150); ck('explicit legacy comparison', (await read())?.legacy === true);
    await click('查看新效果'); await sleep(150);
    const resources = await read();
    for (let i = 0; i < 5; i++) {
      await click('比較舊效果'); await sleep(100);
      await click('查看新效果'); await sleep(100);
    }
    ck('repeated replacement releases geometry and texture resources',
      (await read()).geometries === resources.geometries && (await read()).textures === resources.textures);
    await click('比較第一輪'); await sleep(150);
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[1].click(); const q=document.querySelector('select[aria-label="畫質"]');q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));`);
    // Fix the observation point; wall-clock playback may pass the event lifetime.
    await click('主爆發'); await sleep(150);
    const stress = await read(); ck('overlap capped at low tier', stress?.cap === 96 && stress.counts.every(n => n <= 96));
    await chrome.evaluate(`const q=document.querySelector('select[aria-label="畫質"]');q.value='high';q.dispatchEvent(new Event('change',{bubbles:true}));`);
    await sleep(400);
    const highStress = await read();
    ck('40 overlapping effects keep draw submissions bounded', highStress?.cap === 384
      && highStress.counts.some(n => n > 0) && highStress.counts.every(n => n <= 384) && highStress.calls <= 13 && stress.calls <= 13,
      JSON.stringify({ low: stress, high: highStress }));
    writeFileSync(`${out}/performance.json`, JSON.stringify({ environment: 'headless desktop, not mobile FPS certification', low: stress, high: highStress }, null, 2));
    await chrome.evaluate(`const el=document.querySelector('select[aria-label="技能"]');el.value='cinderfist:W';el.dispatchEvent(new Event('change',{bubbles:true}));`);
    await click('播放'); await sleep(650); await click('暫停'); await sleep(100);
    const shields = await read();
    ck('transparent shield overdraw has independent high cap', shields.counts[1] === 24 && shields.shieldCap === 24);
    await chrome.evaluate(`const q=document.querySelector('select[aria-label="畫質"]');q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));`);
    await sleep(150);
    ck('transparent shield overdraw has independent low cap', (await read()).counts[1] === 8);
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[0].click();`); await sleep(100);
    // Reduced-motion control returns to Round 2: static slabs, no ring / sphere / flames.
    ck('reduced motion uses static markers without volume', (await read())?.counts?.every((n, i) => [2, 3].includes(i) || n === 0));
    for (const width of [320, 360, 390, 430]) {
      await chrome.send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: true });
      await sleep(150);
      ck(`no overflow ${width}`, await chrome.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
    }
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/mobile.png`, Buffer.from(shot.data, 'base64'));
    ck('no page errors', chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors));
    const shaderErrors = chrome.consoleLines.filter(l => /shader error|VALIDATE_STATUS|Error:|WebGL.*error/i.test(JSON.stringify(l)));
    ck('no shader/console errors', shaderErrors.length === 0, JSON.stringify(shaderErrors));
  }
});
await finishGate(result);
