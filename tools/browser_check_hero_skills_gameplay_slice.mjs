import { mkdirSync, writeFileSync } from 'node:fs';
import { runGate, finishGate } from './browser/harness.mjs';

mkdirSync('tmp/hero-skills', { recursive: true });
const result = await runGate({ name: 'Hero Skills authoritative cast browser', timeoutMs: 360000,
  async run({ chrome, url, ck, sleep }) {
    await chrome.navigate(`${url}?debug=moba-runtime-battle&mapPresentation=runtime-v2&heroSkillsDev=1&shot=hero-skills-q&waitTs=1&quality=low`);
    for (let i = 0; i < 100; i++) {
      if (await chrome.evaluate('return !!window.__BATTLE_STATS?.b1Q && !!window.__HERO_VFX_DIAG;')) break;
      await sleep(250);
    }
    const initial = await chrome.evaluate('return window.__BATTLE_STATS;');
    ck('canonical roster enabled authored Q in GameView', initial?.heroes === 10 && initial?.b1Q?.ready === true, JSON.stringify(initial));
    await chrome.evaluate(`document.querySelector('[data-testid="observer-hero"][data-seat="b1"]')?.click();`);
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click();`);
    let found = null;
    const observed = { ts: 0, authoredCastSeen: 0,
      namedFrames: 0, namedDrawnFrames: 0, samples: 0, ids: [] };
    for (let i = 0; i < 440; i++) {
      const d = await chrome.evaluate('return { battle:window.__BATTLE_STATS, vfx:window.__HERO_VFX_DIAG?.() };');
      observed.samples++;
      observed.ts = Math.max(observed.ts, d?.battle?.ts ?? 0);
      observed.authoredCastSeen = Math.max(observed.authoredCastSeen, d?.battle?.authoredCastSeen ?? 0);
      if (d?.battle?.namedSkillIds?.length) observed.ids = d.battle.namedSkillIds;
      observed.namedFrames = Math.max(observed.namedFrames, d?.vfx?.namedFrames ?? 0);
      observed.namedDrawnFrames = Math.max(observed.namedDrawnFrames, d?.vfx?.namedDrawnFrames ?? 0);
      if (d?.battle?.authoredCastSeen > 0 && d?.vfx?.namedDrawnFrames > 0) { found = d; break; }
      await sleep(250);
    }
    ck('engine cast drives cooldown and pooled VFX in formal renderer', !!found, JSON.stringify(found ?? observed));
    let authoredE = null;
    for (let i = 0; i < 500; i++) {
      const d = await chrome.evaluate('return window.__BATTLE_STATS;');
      // The formal battle uses the canonical roster and deterministic AI, but it
      // does not promise that one particular hero will cast one particular slot
      // before the match ends. Assert the current authority path by observing an
      // authored E cast from the live roster instead of pinning the fixture to
      // cinderfist:E.
      if (d?.authoredSkillIds?.some((id) => /:E$/.test(id))) { authoredE = d; break; }
      if (d?.over) break;
      await sleep(250);
    }
    ck('authored E reaches the formal Battle authority path', !!authoredE, JSON.stringify(authoredE ?? observed));
    let steelGuard = authoredE?.authoredSkillIds?.some((id) => /:W$/.test(id)) ? authoredE : null;
    for (let i = 0; !steelGuard && i < 500; i++) {
      const d = await chrome.evaluate('return window.__BATTLE_STATS;');
      if (d?.authoredSkillIds?.some((id) => /:W$/.test(id))) { steelGuard = d; break; }
      if (d?.over) break;
      await sleep(250);
    }
    ck('authored W reaches the formal Battle authority path', !!steelGuard,
      JSON.stringify(steelGuard ?? observed));
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tmp/hero-skills/authority-named-skill.png', Buffer.from(shot.data, 'base64'));
    ck('no page errors', chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors));
    const errors = chrome.consoleLines.filter(l => /shader error|VALIDATE_STATUS|Error:|WebGL.*error/i.test(JSON.stringify(l)));
    ck('no shader errors', errors.length === 0, JSON.stringify(errors));
  }
});
await finishGate(result);
