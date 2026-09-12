import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LogicEngine } from '../src/LogicEngine.js';

// Real engine snapshot, rendered read-only. Browser layout evidence is separate.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
try {
  const { ObserverPanel } = await server.ssrLoadModule('/src/battle/ui/BattleObserverHUD.jsx');
  const snapshot = new LogicEngine(4242).snapshot();
  const before = JSON.stringify(snapshot);
  const html = renderToStaticMarkup(React.createElement(ObserverPanel, { snapshot, replay: true }));
  check('all ten real seats rendered', () => assert.equal((html.match(/data-testid="observer-hero"/g) ?? []).length, 10));
  check('selected hero health comes from snapshot', () => assert(html.includes(`生命 ${Math.round(snapshot.players[0].hp * 100)}%`)));
  check('five descriptions, not fabricated cooldowns', () => assert.equal((html.match(/class="observer-ability ability-/g) ?? []).length, 5));
  check('equipment gap is explicit', () => assert(html.includes('裝備 · 未提供')));
  check('render does not mutate input', () => assert.equal(JSON.stringify(snapshot), before));
  check('empty snapshot is safe', () => assert.equal(renderToStaticMarkup(React.createElement(ObserverPanel, {snapshot:null})), ''));
  const replay = fs.readFileSync('src/screens/moba/MobaReplayScreen.jsx', 'utf8');
  check('replay HUD receives saved source', () => assert(replay.includes('snapshot={source?.getState().prev}')));
  check('replay does not start battle or settlement', () => assert(!/new LogicEngine|useBattleFeed\(|applyMatchProgress\(/.test(replay.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))));
  console.log(`BATTLE_OBSERVER_UI: ${checks} PASS / 0 FAIL`);
} finally { await server.close(); }
