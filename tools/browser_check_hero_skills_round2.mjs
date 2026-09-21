import { mkdirSync, writeFileSync } from 'node:fs';
import { runGate, finishGate } from './browser/harness.mjs';
const out = 'tmp/hero-skills/round2'; mkdirSync(out, { recursive: true });
// The workshop now exercises 105 authored visuals (three phases plus comparison
// and mobile checks). Keep the assertions unchanged; only give the browser
// harness enough wall-clock budget for the larger evidence set on Windows.
// 400 authored skills × three timeline stages × exact-time comparison is a
// deliberately exhaustive visual gate; keep assertions unchanged and budget
// enough wall-clock time for the full browser evidence run.
const result = await runGate({ name: 'Hero Skills Round 2 browser', timeoutMs: 600000,
  async run({ chrome, url, ck, sleep }) {
    await chrome.navigate(`${url}?debug=hero-skills`);
    for (let i = 0; i < 160; i++) {
      if (await chrome.evaluate('return !!window.__HERO_SKILLS_PREVIEW__;')) break;
      await sleep(250);
    }
    const read = () => chrome.evaluate('return window.__HERO_SKILLS_PREVIEW__;');
    const click = text => chrome.evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent===${JSON.stringify(text)})b.click()});`);
    const select = (name, value) => chrome.evaluate(`const e=document.querySelector('select[aria-label="${name}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`);
    const shot = async name => { const s = await chrome.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(s.data, 'base64')); };
    const initial = await read(); ck('Round 2 ready', initial?.visualRevision === 2);
    if (!initial) { console.log(chrome.pageErrors, chrome.consoleLines); return; }
    const options = await chrome.evaluate(`return [...document.querySelector('select[aria-label="技能"]').options].map(o=>o.value);`);
    const evidence = {};
    for (const id of options) {
      await select('技能', id); await sleep(100);
      const stages = [];
      for (const [label, name] of [['前搖', 'windup'], ['主爆發', 'burst'], ['餘波', 'afterglow']]) {
        await click(label); await sleep(100); stages.push(await read());
        if (id === 'dawnstrike:Q') ck('Dawnstrike screenshot is labeled Round 2 in the DOM',
          (await chrome.evaluate('return document.querySelector("section > div > span")?.textContent;'))?.includes('第二輪'));
        await shot(`${id.replace(':', '-')}-${name}`);
        if (id === 'dawnstrike:Q' && name === 'burst') await shot('dawnstrike-Q-verified-round2');
      }
      ck(`${id} visible in all three stages with bounded fusion`, stages.every(d => d.counts.some(n => n > 0)
        && d.counts.every((n, i) => n <= (i === 1 ? d.shieldCap : i === 4 ? d.flameCap : d.cap))));
      if (id.endsWith(':R')) ck(`${id} windup / burst / aftermath contract`, stages.map(d => d.phase).join() === 'windup,burst,afterglow');
      if (['ironclad:Q', 'chichuan:E'].includes(id)) ck(`${id} actor traverses with effect`, stages[0].pose.x === -3 && stages[2].pose.x === 3);
      if (id === 'cinderfist:E') ck(`${id} fast dash leaves a persistent wall`, stages[0].pose.x > -3 && stages[2].pose.x === 3 && stages[2].counts[4] > 0);
      const before = await read(); await click('比較第一輪'); await sleep(120);
      ck(`${id} exact-time Round 1 comparison`, (await read()).round1 === true && (await read()).time === before.time);
      await click('查看第二輪'); await sleep(120);
      ck(`${id} returns to same new frame`, (await read()).round1 === false && (await read()).time === before.time);
      evidence[id] = stages;
    }
    await click('主爆發'); await sleep(100);
    const paused = await read(); await sleep(200); ck('pause freezes actor and effect', JSON.stringify((await read()).pose) === JSON.stringify(paused.pose) && (await read()).time === paused.time);
    const resources = await read();
    for (let i = 0; i < 5; i++) { await click('比較第一輪'); await sleep(80); await click('查看第二輪'); await sleep(80); }
    ck('comparison does not leak GPU resources', (await read()).geometries === resources.geometries && (await read()).textures === resources.textures);
    await click('比較舊效果'); await sleep(80); ck('original legacy comparison retained', (await read()).legacy === true); await click('查看新效果');
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[1].click();`);
    for (const id of ['leiting:R', 'cinderfist:W', 'cinderfist:E', 'dadi:Q', 'dadi:E', 'bingshuang:E', 'chichuan:W', 'dawnstrike:Q', 'ironclad:W']) {
      await select('技能', id); await sleep(80); await click('主爆發'); await sleep(100);
      for (const q of ['low', 'high']) {
        await select('畫質', q); await sleep(150); const d = await read();
        ck(`${id} 40 overlaps ${q} bounded`, d.counts.some(n => n > 0) && d.counts.every((n, i) => n <= (i === 4 ? d.flameCap : d.cap)) && d.calls <= 13, JSON.stringify({ calls: d.calls, counts: d.counts, triangles: d.triangles }));
        evidence[`${id}-${q}-stress`] = d;
      }
    }
    await select('技能', 'chichuan:E'); await sleep(80); await click('主爆發');
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[0].click();`); await sleep(100);
    const reduced = await read(); ck('reduced motion holds actor and suppresses flame volume', reduced.pose.x === -3 && reduced.counts[4] === 0);
    await click('餘波'); await sleep(100); ck('reduced motion footprint stays static', JSON.stringify((await read()).pose) === JSON.stringify(reduced.pose));
    for (const width of [320, 360, 390, 430]) {
      await chrome.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true }); await sleep(150);
      ck(`no overflow ${width}`, await chrome.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
    }
    await chrome.evaluate(`document.querySelectorAll('input[type=checkbox]')[0].click();document.querySelectorAll('input[type=checkbox]')[1].click();`);
    await select('技能', 'leiting:R'); await sleep(80); await click('主爆發'); await sleep(100); await shot('mobile-lightning');
    await select('畫質', 'low'); await select('技能', 'cinderfist:E'); await sleep(80);
    await click('主爆發'); await sleep(100);
    const mobileFire = await read();
    ck('mobile fire wall readable without extra draw passes', mobileFire.counts[3] > 0 && mobileFire.counts[4] > 0 && mobileFire.calls <= 13,
      JSON.stringify({ calls: mobileFire.calls, counts: mobileFire.counts, triangles: mobileFire.triangles }));
    await shot('mobile-cinderfist-E');
    await select('技能', 'dawnstrike:Q'); await sleep(80); await click('主爆發'); await sleep(100);
    const mobileArrow = await read();
    ck('mobile solar arrow readable under low quality', mobileArrow.counts[3] > 0 && mobileArrow.calls <= 13,
      JSON.stringify({ calls: mobileArrow.calls, counts: mobileArrow.counts }));
    await shot('mobile-dawnstrike-Q');
    await select('技能', 'ironclad:W'); await sleep(80); await click('主爆發'); await sleep(100);
    const mobileGuard = await read();
    ck('mobile steel guard shows three slabs under low quality', mobileGuard.counts[3] >= 3 && mobileGuard.calls <= 13,
      JSON.stringify({ calls: mobileGuard.calls, counts: mobileGuard.counts }));
    await shot('mobile-ironclad-W');
    writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
    ck('no page errors', chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors));
    const errors = chrome.consoleLines.filter(l => /shader error|VALIDATE_STATUS|Error:|WebGL.*error/i.test(JSON.stringify(l)));
    ck('no shader errors', errors.length === 0, JSON.stringify(errors));
  }
});
await finishGate(result);
