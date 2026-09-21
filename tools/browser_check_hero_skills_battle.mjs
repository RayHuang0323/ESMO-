import { mkdirSync, writeFileSync } from 'node:fs';
import { runGate, finishGate } from './browser/harness.mjs';
mkdirSync('tmp/hero-skills', { recursive: true });
const result = await runGate({ name: 'Hero Skills formal battle', timeoutMs: 180000,
  async run({ chrome, url, ck, sleep }) {
    await chrome.navigate(`${url}?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1&shot=hero-skills&waitTs=1&quality=low`);
    for (let i = 0; i < 160; i++) {
      if (await chrome.evaluate('return !!window.__HERO_VFX_DIAG;')) break;
      await sleep(250);
    }
    const mounts = await chrome.evaluate('return window.__ESMO_RUNTIME_MOUNTS;');
    ck('new formal renderer mounted, legacy identity renderer absent', mounts?.['heroVfxRuntime.mount'] === 1 && !mounts?.['heroSkillEffects.mount'], JSON.stringify(mounts));
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click();`);
    let d;
    for (let i = 0; i < 300; i++) {
      d = await chrome.evaluate('return {vfx:window.__HERO_VFX_DIAG?.(),battle:window.__BATTLE_STATS};');
      if (d?.vfx?.activeFrames > 5) break;
      await sleep(250);
    }
    ck('real engine attacks produce new VFX frames', d?.vfx?.activeFrames > 5, JSON.stringify(d));
    ck('battle has ten authoritative heroes and advances', d?.battle?.heroes === 10 && d?.battle?.ts > 0);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tmp/hero-skills/formal-battle.png', Buffer.from(shot.data, 'base64'));
    ck('no runtime page errors', chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors));
    const errors = chrome.consoleLines.filter(l => /shader error|VALIDATE_STATUS|Error:|WebGL.*error/i.test(JSON.stringify(l)));
    ck('no shader/console errors', errors.length === 0, JSON.stringify(errors));
  }
});
await finishGate(result);
