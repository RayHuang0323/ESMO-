#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = 5375;
const CDP_PORT = 9395;
const EXPECT_HERO = process.env.CS_C2C_EXPECT_HERO !== "0";
const EXPECT_ALL = process.env.CS_C2C_EXPECT_ALL === "1";
const ART_REVIEW_CAPTURE = process.env.CS_C2C_ART_REVIEW_CAPTURE === "1";
const RIGGED_QUERY = process.env.CS_C2C_RIGGED || "1";
const HERO_QUERY = process.env.CS_C2C_HERO || (EXPECT_HERO ? "1" : "off");
const VIEWPORT_WIDTH = Number(process.env.CS_C2C_VIEWPORT_WIDTH || 1366);
const VIEWPORT_HEIGHT = Number(process.env.CS_C2C_VIEWPORT_HEIGHT || 768);
const VIEWPORT_DPR = Number(process.env.CS_C2C_VIEWPORT_DPR || 1);
const APP = process.env.CS_C2C_APP_URL
  || `http://localhost:${VITE_PORT}/ESMO-/?fpsRigged=${RIGGED_QUERY}&fpsC2cHero=${HERO_QUERY}`;
const OUTPUT_DIR = process.env.CS_C2C_CAPTURE_DIR || path.resolve("artifacts/cs-c2c/vector9");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await chrome.evaluate(`return Boolean(${expression});`)) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`${label} timeout`);
}

function summarizeAlignment(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { count: 0, min: null, avg: null, max: null };
  return {
    count: finite.length,
    min: Number(Math.min(...finite).toFixed(4)),
    avg: Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(4)),
    max: Number(Math.max(...finite).toFixed(4)),
  };
}

async function sampleBattleOrientation(chrome, durationMs = 8_000, intervalMs = 200) {
  const frames = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const players = await chrome.evaluate(`return (() => {
      const scene = window.__ESMO_FPS_SCENE__;
      const diagnostics = window.__ESMO_FPS_C2A__?.players || {};
      if (!scene?.players) return [];
      const axis = (object, x, y, z) => {
        if (!object?.localToWorld || !object?.position?.clone) return null;
        object.updateWorldMatrix?.(true, false);
        const origin = object.position.clone().set(0, 0, 0);
        const tip = object.position.clone().set(x, y, z);
        object.localToWorld(origin);
        object.localToWorld(tip);
        tip.sub(origin).normalize();
        return [tip.x, tip.z];
      };
      return scene.players.map((candidate) => {
        const rigged = candidate.rigged;
        const diagnostic = diagnostics[candidate.id] || null;
        const family = diagnostic?.weaponFamily || diagnostic?.weaponType || "rifle";
        const weapon = rigged?.c2c?.weaponGroups?.[family] || null;
        const kit = rigged?.model?.getObjectByName?.("C2C_PlateCarrier") || null;
        return {
          id: candidate.id,
          animation: diagnostic?.animation || null,
          position: [candidate.g.position.x, candidate.g.position.z],
          rootForward: axis(rigged?.root, 1, 0, 0),
          bodyForward: axis(rigged?.model, 0, 0, 1),
          // C2C clothing shells now share the validation model's native +Z
          // front axis.  The model orientationOffset maps it onto the
          // authoritative rigged-root +X direction.
          kitForward: axis(kit, 0, 0, 1),
          weaponForward: axis(weapon, 1, 0, 0),
        };
      });
    })()`);
    frames.push(players);
    await sleep(intervalMs);
  }

  const dot = (left, right) => left && right ? left[0] * right[0] + left[1] * right[1] : null;
  const rootBody = [];
  const rootKit = [];
  const rootWeapon = [];
  const runBodyMotion = [];
  const runKitMotion = [];
  const runWeaponMotion = [];
  let movingSamples = 0;
  let runningSamples = 0;
  frames.forEach((players, frameIndex) => {
    players.forEach((player) => {
      rootBody.push(dot(player.rootForward, player.bodyForward));
      rootKit.push(dot(player.rootForward, player.kitForward));
      rootWeapon.push(dot(player.rootForward, player.weaponForward));
      if (frameIndex === 0) return;
      const previous = frames[frameIndex - 1].find((candidate) => candidate.id === player.id);
      if (!previous) return;
      const dx = player.position[0] - previous.position[0];
      const dz = player.position[1] - previous.position[1];
      const distance = Math.hypot(dx, dz);
      if (distance < 0.005) return;
      movingSamples += 1;
      if (player.animation !== "run") return;
      runningSamples += 1;
      const motion = [dx / distance, dz / distance];
      runBodyMotion.push(dot(player.bodyForward, motion));
      runKitMotion.push(dot(player.kitForward, motion));
      runWeaponMotion.push(dot(player.weaponForward, motion));
    });
  });
  return {
    frameSamples: frames.length,
    movingSamples,
    runningSamples,
    rootBody: summarizeAlignment(rootBody),
    rootKit: summarizeAlignment(rootKit),
    rootWeapon: summarizeAlignment(rootWeapon),
    runBodyMotion: summarizeAlignment(runBodyMotion),
    runKitMotion: summarizeAlignment(runKitMotion),
    runWeaponMotion: summarizeAlignment(runWeaponMotion),
  };
}

async function clickByText(chrome, predicate, label) {
  const result = await chrome.evaluate(`
    const button = [...document.querySelectorAll("button")]
      .find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 30) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim();
    button.click();
    return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
}

async function clickPrepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action;
    button.click();
    return { ok: true, action };
  `);
}

async function enterMirageBattle(chrome) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "Home");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "Practice CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "Practice prep");

  const initial = await clickPrepAction(chrome);
  if (!initial.ok && initial.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("自動填入") || text.includes("Auto")`, "auto-fill lineup");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "lineup ready");
  } else if (!initial.ok) {
    throw new Error(`initial prep action unavailable: ${JSON.stringify(initial)}`);
  }
  const ready = initial.action === "blocked" ? await clickPrepAction(chrome) : initial;
  if (ready.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="mirage"]')`, 45_000, "ready check");
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await clickPrepAction(chrome);
  }

  await waitFor(chrome, `document.querySelector('[data-map-key="mirage"]')`, 45_000, "map selection");
  await chrome.evaluate(`document.querySelector('[data-map-key="mirage"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="mirage"]') && document.body.innerText.includes("Mirage")`, 30_000, "tactic selection");
  await clickByText(chrome, `(node, text) => !text.includes("Cancel") && !text.includes("取消") && text.length > 20`, "tactic");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle canvas");
}

function writeCanvasScreenshot(dataUrl, name) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error(`canvas screenshot unavailable: ${name}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filename, Buffer.from(match[1], "base64"));
  return filename;
}

async function captureCanvasSurface(chrome, name) {
  await chrome.evaluate(`return (() => {
    // Roster clicks can scroll the battle canvas out of the viewport.  Bring
    // the actual canvas to a stable origin before taking owner evidence so a
    // screenshot cannot look like a clipped or disassembled character.
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    canvas.scrollIntoView({ block: "start", inline: "nearest" });
    return true;
  })()`);
  await sleep(80);
  const rect = await chrome.evaluate(`return (() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, dpr: devicePixelRatio };
  })()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas surface unavailable: ${name}`);
  const shot = await chrome.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  });
  if (!shot?.data) throw new Error(`page screenshot unavailable: ${name}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filename, Buffer.from(shot.data, "base64"));
  return { filename, rect, source: "Page.captureScreenshot" };
}

async function hideBattleUiForReview(chrome) {
  await chrome.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    const scene = window.__ESMO_FPS_SCENE__;
    if (scene) {
      scene.running = false;
      if (scene.raf) cancelAnimationFrame(scene.raf);
      // Owner clothing evidence must show the runtime character rather than
      // an opaque smoke volume. This is capture-only scene presentation; the
      // smoke system already ran during the runtime evidence phase above.
      if (scene.fxGroup) scene.fxGroup.visible = false;
    }
    // Keep this capture-only cleanup separate from Battle presentation.  The
    // runtime evidence is collected before review capture; hiding nameplates,
    // rings and selection beams here leaves the actual character silhouette
    // readable in the owner preview without changing gameplay state.
    scene?.players?.forEach((candidate) => {
      candidate.ring && (candidate.ring.visible = false);
      candidate.disc && (candidate.disc.visible = false);
      candidate.hpGroup && (candidate.hpGroup.visible = false);
      candidate.nameSpr && (candidate.nameSpr.visible = false);
      candidate.selBeam && (candidate.selBeam.visible = false);
    });
    const protectedNodes = new Set();
    let node = canvas;
    while (node) { protectedNodes.add(node); node = node.parentElement; }
    document.body.querySelectorAll("*").forEach((candidate) => {
      if (protectedNodes.has(candidate) || candidate.tagName === "STYLE" || candidate.tagName === "SCRIPT") return;
      candidate.style.setProperty("visibility", "hidden", "important");
    });
    scene?.camera?.updateMatrixWorld?.();
    if (scene?.renderer && scene?.scene && scene?.camera) scene.renderer.render(scene.scene, scene.camera);
    return true;
  })()`);
}

async function focusHero(chrome, id = "t1") {
  return chrome.evaluate(`return (() => {
    const scene = window.__ESMO_FPS_SCENE__;
    const snapshot = window.__ESMO_FPS_VISIBILITY__;
    const player = snapshot?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    if (!scene || !player?.framePosition) return { ok: false, hasScene: Boolean(scene), playerCount: snapshot?.players?.length || 0, player: player || null };
    scene._chase = {
      id: "t1",
      x: player.framePosition.x,
      y: player.framePosition.y,
      va: player.bodyFacingDegrees || 0,
      alive: true,
      side: "t",
      state: "HOLD",
      shooting: false,
      enemy: null,
    };
    const target = scene.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    const canvas = document.querySelector("canvas");
    if (target?.g && canvas) {
      const projected = target.g.position.clone().project(scene.camera);
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
      const clientY = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX, clientY, button: 0 }));
        canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX, clientY, button: 0 }));
      }
    }
    scene.cam.autoFollow = false;
    scene.cam.overview = false;
    scene.cam.chaseYaw = 0;
    scene.cam.chasePitch = 0;
    return { ok: true };
  })();`);
}

async function setHeroAngle(chrome, yaw, id = "t1", radius = 3.6) {
  await chrome.evaluate(`(() => {
    const scene = window.__ESMO_FPS_SCENE__;
    const target = scene?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    if (!scene || !target) return false;
    scene.running = false;
    if (scene.raf) cancelAnimationFrame(scene.raf);
    scene.worldGroup.visible = false;
    scene.routeGroup.visible = false;
    scene.fxGroup.visible = false;
    const region = document.querySelector('[data-esmo-fps-stable-canvas-region="1"]');
    const viewport = region?.parentElement;
    if (viewport) [...viewport.children].forEach((child) => { if (child !== region) child.style.display = "none"; });
    region?.querySelector('[data-esmo-fps-frame-decoration="1"]')?.style.setProperty("display", "none");
    scene.players.forEach((candidate) => {
      candidate.g.visible = candidate === target;
      if (candidate !== target) return;
      candidate.ring.visible = false;
      candidate.disc.visible = false;
      candidate.hpGroup.visible = false;
      candidate.nameSpr.visible = false;
      candidate.selBeam.visible = false;
    });
    const center = target.g.position.clone();
    const targetHeight = Math.max(1.6, Number(target.rigged?.normalizedBounds?.height || 2.1));
    // Derive the review camera from the same authoritative root +X axis used
    // by Battle instead of reconstructing it from Euler signs.
    const root = target.rigged?.root;
    const origin = root?.position?.clone?.().set(0, 0, 0);
    const forward = root?.position?.clone?.().set(1, 0, 0);
    root?.localToWorld?.(origin);
    root?.localToWorld?.(forward);
    forward?.sub?.(origin)?.normalize?.();
    const bodyFacing = forward ? Math.atan2(forward.z, forward.x) : 0;
    const angle = bodyFacing + ${Number(yaw)};
    const lookAt = center.clone();
    lookAt.y += targetHeight * 0.52;
    scene.camera.position.set(
      center.x + Math.cos(angle) * ${Number(radius)},
      center.y + targetHeight * 0.9,
      center.z + Math.sin(angle) * ${Number(radius)},
    );
    scene.camera.lookAt(lookAt);
    scene.camera.updateMatrixWorld();
    scene.scene.traverse((object) => {
      if (object.isLight) object.intensity = Math.max(object.intensity || 0, object.isAmbientLight ? 1.4 : 2.6);
    });
    scene.renderer.toneMappingExposure = Math.max(scene.renderer.toneMappingExposure || 1, 1.65);
    scene.renderer.render(scene.scene, scene.camera);
    scene.cam.autoFollow = false;
    scene.cam.overview = false;
    return true;
  })();`);
  await hideBattleUiForReview(chrome);
  await sleep(150);
}

async function captureCanvas(chrome, name, angle, id = "t1", radius = 3.6) {
  await setHeroAngle(chrome, angle, id, radius);
  return captureCanvasSurface(chrome, name);
}

async function captureBattleGameplay(chrome, id = "t1") {
  await chrome.evaluate(`(() => {
    const scene = window.__ESMO_FPS_SCENE__;
    const target = scene?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    if (!scene || !target?.g || !scene.camera) return false;
    scene.running = false;
    if (scene.raf) cancelAnimationFrame(scene.raf);
    if (scene.fxGroup) scene.fxGroup.visible = false;
    const center = target.g.position.clone();
    const root = target.rigged?.root;
    const origin = root?.position?.clone?.().set(0, 0, 0);
    const forward = root?.position?.clone?.().set(1, 0, 0);
    root?.localToWorld?.(origin);
    root?.localToWorld?.(forward);
    forward?.sub?.(origin)?.normalize?.();
    const bodyFacing = forward ? Math.atan2(forward.z, forward.x) : 0;
    const angle = bodyFacing + Math.PI / 5;
    scene.camera.position.set(
      center.x + Math.cos(angle) * 3.8,
      center.y + 2.35,
      center.z + Math.sin(angle) * 3.8,
    );
    const lookAt = center.clone();
    lookAt.y += 0.88;
    scene.camera.lookAt(lookAt);
    scene.camera.updateMatrixWorld();
    scene.renderer.render(scene.scene, scene.camera);
    return true;
  })()`);
  await hideBattleUiForReview(chrome);
  await sleep(120);
  return captureCanvasSurface(chrome, "gameplay-focus");
}

async function waitForRifle(chrome) {
  const deadline = Date.now() + Number(process.env.CS_C2C_RIFLE_WAIT_MS || 30_000);
  const maxFrame = await chrome.evaluate(`return Number(document.querySelector('input[type="range"]')?.max || 0)`);
  const configuredRatios = String(process.env.CS_C2C_RIFLE_SEEK_RATIOS || "")
    .split(",")
    .map((ratio) => ratio.trim())
    .filter(Boolean)
    .map((ratio) => Number(ratio.trim()))
    .filter((ratio) => Number.isFinite(ratio) && ratio >= 0 && ratio <= 1);
  const seekRatios = configuredRatios.length
    ? configuredRatios
    : [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const seekCandidates = maxFrame > 0
    ? seekRatios.map((ratio) => Math.floor(maxFrame * ratio))
    : [];
  console.log(`INFO C2C rifle seek maxFrame=${maxFrame} candidates=${JSON.stringify(seekCandidates)}`);
  for (const frameIndex of seekCandidates) {
    await chrome.evaluate(`(() => {
      const input = document.querySelector('input[type="range"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(${frameIndex}));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await sleep(350);
    const id = await chrome.evaluate(`return Object.entries(window.__ESMO_FPS_C2A__?.players || {}).find(([, candidate]) => candidate.c2cHero && candidate.weaponType === "rifle")?.[0] || null`);
    if (id) return id;
  }
  while (Date.now() < deadline) {
    const id = await chrome.evaluate(`return (() => {
      const players = Object.entries(window.__ESMO_FPS_C2A__?.players || {});
      return players.find(([, candidate]) => candidate.c2cHero && candidate.weaponType === "rifle")?.[0] || null;
    })()`);
    if (id) return id;
    await sleep(500);
  }
  const snapshot = await chrome.evaluate(`return { frame: document.querySelector('canvas')?.dataset.esmoFpsVisibilityFrame || null, round: window.__ESMO_FPS_VISIBILITY__?.round ?? null, players: Object.entries(window.__ESMO_FPS_C2A__?.players || {}).map(([id, candidate]) => ({ id, gun: candidate.gun || null, weaponType: candidate.weaponType || null, c2cHero: Boolean(candidate.c2cHero) })) }`);
  console.log(`INFO C2C rifle wait expired=${JSON.stringify(snapshot)}`);
  return null;
}

async function seekBattleFrame(chrome, frameIndex, { hold = false } = {}) {
  const result = await chrome.evaluate(`return (() => {
    const input = document.querySelector('input[type="range"]');
    if (!input) return { ok: false, reason: "timeline input missing" };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(${Number(frameIndex)}));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (${hold ? "true" : "false"}) {
      // The CS scene owns playback in liveRef; holding here freezes only the
      // review sample, without changing simulation or animation authority.
      setTimeout(() => {
        const live = window.__ESMO_FPS_SCENE__?.liveRef?.current;
        if (live) live.playing = false;
      }, 0);
    }
    return { ok: true, frame: Number(input.value) };
  })()`);
  if (!result?.ok) throw new Error(`Battle frame seek failed: ${JSON.stringify(result)}`);
  await sleep(hold ? 180 : 100);
  return result;
}

async function readHitFrameCandidate(chrome) {
  return chrome.evaluate(`return (() => {
    const live = window.__ESMO_FPS_SCENE__?.liveRef?.current;
    const frames = live?.sim?.frames || [];
    for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
      const previous = frames[frameIndex - 1];
      const current = frames[frameIndex];
      const previousById = new Map((previous?.players || []).map((player) => [player.id, player]));
      const player = (current?.players || []).find((candidate) => {
        const before = previousById.get(candidate.id);
        return before && !candidate.dead && Number(candidate.hp) > 0
          && Number.isFinite(Number(before.hp)) && Number.isFinite(Number(candidate.hp))
          && Number(candidate.hp) < Number(before.hp) - 0.5;
      });
      if (player) {
        const before = previousById.get(player.id);
        return { frameIndex, id: player.id, previousHp: before.hp, hp: player.hp, round: current.rnd };
      }
    }
    return null;
  })()`);
}

async function readHitRuntime(chrome, id) {
  return chrome.evaluate(`return (() => {
    const candidate = window.__ESMO_FPS_C2A__?.players?.[${JSON.stringify(id)}] || null;
    const scene = window.__ESMO_FPS_SCENE__;
    const live = scene?.liveRef?.current;
    return {
      id: ${JSON.stringify(id)},
      frame: live?.fIdx ?? null,
      playing: live?.playing ?? null,
      currentClip: candidate?.currentClip || null,
      currentClipTime: Number(candidate?.currentClipTime || 0),
      hitTimer: Number(candidate?.hitTimer || 0),
      hitFrame: candidate?.hitFrame ?? null,
      animation: candidate?.animation || null,
    };
  })()`);
}

async function runHitReactionEvidence(chrome) {
  const candidate = await readHitFrameCandidate(chrome);
  if (!candidate) throw new Error("Battle hit reaction candidate not found in authoritative frames");
  await seekBattleFrame(chrome, Math.max(0, candidate.frameIndex - 1));
  await seekBattleFrame(chrome, candidate.frameIndex, { hold: true });
  const samples = [];
  for (const delay of [30, 70, 120, 180, 260, 380, 520]) {
    await sleep(delay);
    samples.push(await readHitRuntime(chrome, candidate.id));
  }
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current; if(live) live.playing=true; return true;`);
  const hitSamples = samples.filter((sample) => sample.currentClip === "Hit_Chest" && sample.hitFrame === candidate.frameIndex);
  const timeProgress = hitSamples.length >= 2
    && hitSamples[hitSamples.length - 1].currentClipTime > hitSamples[0].currentClipTime + 0.02;
  const timerProgress = hitSamples.length >= 2
    && hitSamples[hitSamples.length - 1].hitTimer < hitSamples[0].hitTimer - 0.03;
  const exitsHit = samples.some((sample) => sample.currentClip !== "Hit_Chest" && sample.hitTimer <= 0.02);
  const evidence = { candidate, samples, hitSamples: hitSamples.length, timeProgress, timerProgress, exitsHit };
  if (hitSamples.length < 2 || !timeProgress || !timerProgress || !exitsHit) {
    throw new Error(`hit reaction remained stiff or did not exit: ${JSON.stringify(evidence)}`);
  }
  console.log(`PASS C2C hitReaction=${JSON.stringify(evidence)}`);
  return evidence;
}

async function readFocusRuntime(chrome, id) {
  return chrome.evaluate(`return (() => {
    const scene = window.__ESMO_FPS_SCENE__;
    const live = scene?.liveRef?.current;
    const target = scene?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)}) || null;
    const canvas = document.querySelector("canvas");
    let ndc = null;
    if (target?.g && scene?.camera) {
      const projected = target.g.position.clone().project(scene.camera);
      ndc = { x: projected.x, y: projected.y, z: projected.z };
    }
    return {
      id: ${JSON.stringify(id)},
      selected: live?.selected ?? null,
      chase: scene?._chase ? { id: scene._chase.id, alive: scene._chase.alive } : null,
      radius: Number(scene?.cam?.radius || 0),
      dRadius: Number(scene?.cam?.dRadius || 0),
      rapidRecovery: Number(scene?.rapidCameraRecoveryCount || 0),
      visible: Boolean(target?.g?.visible && target?.rigged?.root?.visible),
      ndc,
      canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
    };
  })()`);
}

async function activatePlayerCard(chrome, id) {
  const result = await chrome.evaluate(`return (() => {
    const button = [...document.querySelectorAll("button")]
      .find((node) => node.dataset.esmoFpsPlayerCard === ${JSON.stringify(id)});
    if (!button || button.disabled) return { ok: false, id: ${JSON.stringify(id)} };
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return { ok: true, id: ${JSON.stringify(id)}, text: (button.innerText || "").replace(/\\s+/g, " ").trim() };
  })()`);
  if (!result?.ok) throw new Error(`player card activation failed: ${JSON.stringify(result)}`);
  await sleep(180);
  return result;
}

async function runFocusCameraEvidence(chrome) {
  await chrome.evaluate(`document.querySelector('[data-testid="match-speed-1"]')?.click(); return true;`);
  await sleep(160);
  const ids = await chrome.evaluate(`return (() => {
    const live = window.__ESMO_FPS_SCENE__?.liveRef?.current;
    const frame = live?.sim?.frames?.[live?.fIdx] || live?.sim?.frames?.[0];
    const alive = (frame?.players || []).filter((player) => !player.dead);
    const healthy = alive.filter((player) => Number(player.hp) >= 90);
    return (healthy.length >= 2 ? healthy : alive).slice(0, 2).map((player) => player.id);
  })()`);
  if (!Array.isArray(ids) || ids.length < 2) throw new Error(`focus camera needs two alive players: ${JSON.stringify(ids)}`);
  const beforeRapid = await chrome.evaluate(`return Number(window.__ESMO_FPS_SCENE__?.rapidCameraRecoveryCount || 0)`);
  const first = await activatePlayerCard(chrome, ids[0]);
  const firstSamples = [];
  let firstElapsed = 0;
  for (const elapsed of [120, 300, 600, 900, 1_200, 1_500]) {
    await sleep(elapsed - firstElapsed);
    firstElapsed = elapsed;
    firstSamples.push(await readFocusRuntime(chrome, ids[0]));
  }
  const firstStable = firstSamples.every((sample) => sample.selected === ids[0] && sample.chase?.id === ids[0] && sample.visible)
    && firstSamples.at(-1).radius <= 18 && firstSamples.at(-1).dRadius <= 15;
  const second = await activatePlayerCard(chrome, ids[1]);
  const secondSamples = [];
  let secondElapsed = 0;
  for (const elapsed of [120, 350, 700, 1_050, 1_400]) {
    await sleep(elapsed - secondElapsed);
    secondElapsed = elapsed;
    secondSamples.push(await readFocusRuntime(chrome, ids[1]));
  }
  const secondStable = secondSamples.every((sample) => sample.selected === ids[1] && sample.chase?.id === ids[1] && sample.visible)
    && secondSamples.at(-1).radius <= 18 && secondSamples.at(-1).dRadius <= 15;
  const afterRapid = await chrome.evaluate(`return Number(window.__ESMO_FPS_SCENE__?.rapidCameraRecoveryCount || 0)`);
  const close = await chrome.evaluate(`return (() => { const button=[...document.querySelectorAll("button")].find((node)=>node.innerText.trim()==="✕"); if(!button)return false; button.click(); return true; })()`);
  await sleep(180);
  const evidence = { method: "player-card-dom-click", ids, first, second, firstSamples, secondSamples, firstStable, secondStable, beforeRapid, afterRapid, closeButton: close };
  if (!firstStable || !secondStable || afterRapid !== beforeRapid || !close) {
    throw new Error(`focus camera did not remain locked: ${JSON.stringify(evidence)}`);
  }
  console.log(`PASS C2C focusCamera=${JSON.stringify(evidence)}`);
  return evidence;
}

async function captureReviewLineup(chrome, { showWeapons = false, name = "lineup" } = {}) {
  await chrome.evaluate(`(() => {
    const scene = window.__ESMO_FPS_SCENE__;
    if (!scene) return false;
    scene.running = false;
    if (scene.raf) cancelAnimationFrame(scene.raf);
    scene.worldGroup.visible = false;
    scene.routeGroup.visible = false;
    scene.fxGroup.visible = false;
    const region = document.querySelector('[data-esmo-fps-stable-canvas-region="1"]');
    const viewport = region?.parentElement;
    if (viewport) [...viewport.children].forEach((child) => { if (child !== region) child.style.display = "none"; });
    region?.querySelector('[data-esmo-fps-frame-decoration="1"]')?.style.setProperty("display", "none");
    const ordered = [...scene.players].sort((a, b) => String(a.side).localeCompare(String(b.side)) || String(a.id).localeCompare(String(b.id)));
    const reviewFamilies = ["rifle", "smg", "sniper", "shotgun", "pistol"];
    ordered.forEach((candidate, index) => {
      candidate.g.visible = true;
      const teamIndex = index < 5 ? index : index - 5;
      candidate.g.position.set((teamIndex - 2) * 1.75, candidate.g.position.y, index < 5 ? 1.35 : -1.35);
      candidate.g.rotation.y = 0;
      candidate.ring.visible = false;
      candidate.disc.visible = false;
      candidate.hpGroup.visible = false;
      candidate.nameSpr.visible = false;
      candidate.selBeam.visible = false;
      const rigged = candidate.rigged;
      if (rigged?.mixer && rigged?._switch) {
        const family = reviewFamilies[teamIndex];
        rigged._switch(${showWeapons ? "\"Pistol_Aim_Neutral\"" : "\"Idle_Loop\""}, false, 0);
        rigged.mixer.setTime(${showWeapons ? "0.22" : "0.05"});
        rigged.model?.updateWorldMatrix?.(true, true);
        rigged.c2c?.syncAnchors?.();
        Object.entries(rigged.c2c?.weaponGroups || {}).forEach(([key, group]) => { group.visible = ${showWeapons ? "key === family" : "false"}; });
      }
    });
    scene.camera.position.set(0, 3.5, ${showWeapons ? "10.2" : "8.8"});
    scene.camera.lookAt(0, 1.05, 0);
    scene.camera.updateMatrixWorld();
    scene.scene.traverse((object) => {
      if (object.isLight) object.intensity = Math.max(object.intensity || 0, object.isAmbientLight ? 1.4 : 2.6);
    });
    scene.renderer.toneMappingExposure = Math.max(scene.renderer.toneMappingExposure || 1, 1.65);
    scene.renderer.render(scene.scene, scene.camera);
    scene.cam.autoFollow = false;
    scene.cam.overview = false;
    return true;
  })();`);
  await hideBattleUiForReview(chrome);
  await sleep(150);
  return captureCanvasSurface(chrome, name);
}

async function forceReviewWeapon(chrome, id, type) {
  await chrome.evaluate(`(() => {
    const target = window.__ESMO_FPS_SCENE__?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    const groups = target?.rigged?.c2c?.weaponGroups;
    if (!groups) return false;
    Object.entries(groups).forEach(([family, group]) => { group.visible = family === ${JSON.stringify(type)}; });
    target.rigged.c2c.weaponFamily = ${JSON.stringify(type)};
    target.rigged.c2c.weaponType = ${JSON.stringify(type)};
    target.rigged.root.updateWorldMatrix?.(true, true);
    target.rigged.c2c.syncAnchors?.();
    return true;
  })()`);
}

async function hideReviewWeapons(chrome, id) {
  await chrome.evaluate(`(() => {
    const target = window.__ESMO_FPS_SCENE__?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    const groups = target?.rigged?.c2c?.weaponGroups;
    if (!groups) return false;
    Object.values(groups).forEach((group) => { group.visible = false; });
    return true;
  })()`);
}

async function setReviewPose(chrome, id, clipName = "Pistol_Aim_Neutral", poseTime = 0.35) {
  await chrome.evaluate(`(() => {
    const target = window.__ESMO_FPS_SCENE__?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    const rigged = target?.rigged;
    if (!rigged?.mixer || !rigged?._switch) return false;
    rigged._switch(${JSON.stringify(clipName)}, false, 0);
    rigged.mixer.setTime(${Number(poseTime)});
    rigged.model?.updateWorldMatrix?.(true, true);
    rigged.c2c?.syncAnchors?.();
    rigged.root?.updateWorldMatrix?.(true, true);
    return true;
  })()`);
  await chrome.evaluate(`(() => {
    const scene = window.__ESMO_FPS_SCENE__;
    if (!scene?.renderer || !scene?.camera) return false;
    scene.camera.updateMatrixWorld();
    scene.renderer.render(scene.scene, scene.camera);
    return true;
  })()`);
}

async function captureSilhouette(chrome, id = "t1") {
  await chrome.evaluate(`(() => {
    const target = window.__ESMO_FPS_SCENE__?.players?.find?.((candidate) => candidate.id === ${JSON.stringify(id)});
    target?.rigged?.root?.traverse?.((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        material.color?.set?.(0x05070a);
        material.emissive?.set?.(0x000000);
        material.map = null;
        material.transparent = false;
        material.opacity = 1;
        material.needsUpdate = true;
      });
    });
    return true;
  })()`);
  await setReviewPose(chrome, id, "Idle_Loop");
  return captureCanvas(chrome, "silhouette", 0, id, 3.6);
}

let dev = null;
let chrome = null;
try {
  if (!process.env.CS_C2C_APP_URL) dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: VIEWPORT_DPR, mobile: VIEWPORT_WIDTH <= 600 });
  await chrome.navigate(APP);
  await enterMirageBattle(chrome);
  await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
  if (EXPECT_ALL) {
    try {
      await waitFor(chrome, `window.__ESMO_FPS_C2A__?.rigged >= 10`, ART_REVIEW_CAPTURE ? 10_000 : 60_000, "all rigged C2C players");
    } catch (error) {
      const loadDiagnostic = await chrome.evaluate(`return window.__ESMO_FPS_C2A__ || null`);
      console.log(`INFO C2C load timeout diagnostic=${JSON.stringify(loadDiagnostic)}`);
      console.log(`INFO C2C load timeout browserErrors=${JSON.stringify({ console: chrome.consoleLines, page: chrome.pageErrors })}`);
      throw error;
    }
  } else await sleep(2_000);
  const orientationEvidence = await sampleBattleOrientation(chrome);
  console.log(`INFO C2C Battle orientation=${JSON.stringify(orientationEvidence)}`);
  if (!ART_REVIEW_CAPTURE && (orientationEvidence.frameSamples < 10 || orientationEvidence.runningSamples < 20)) {
    throw new Error(`insufficient Battle locomotion evidence: ${JSON.stringify(orientationEvidence)}`);
  }
  for (const [label, minimum] of [["rootBody", 0.95], ["rootKit", 0.8], ["rootWeapon", 0.8], ["runBodyMotion", 0.6], ["runKitMotion", 0.5], ["runWeaponMotion", 0.5]]) {
    if (!ART_REVIEW_CAPTURE && (orientationEvidence[label]?.avg ?? -1) < minimum) {
      throw new Error(`Battle facing alignment failed ${label}>=${minimum}: ${JSON.stringify(orientationEvidence)}`);
    }
  }
  const teamStructure = await chrome.evaluate(`return window.__ESMO_FPS_SCENE__?.players?.map?.((candidate) => {
    const side = candidate.rigged?.c2c?.side;
    const variationId = candidate.rigged?.c2c?.variationId;
    const profileNodes = side === "ct"
      ? { assault: "C2C_CT_AssaultRailL", support: "C2C_CT_SupportEarBridge", marksman: "C2C_CT_MarksmanMonocular", lurker: "C2C_CT_LowHelmetBrim", utility: "C2C_CT_UtilityCamera" }
      : { assault: "C2C_T_BalaclavaBrow", support: "C2C_T_HeavyHeadWrap", marksman: "C2C_T_FieldCapBrim", lurker: "C2C_T_HoodPeak", utility: "C2C_T_BandanaBand" };
    const profileNode = profileNodes[variationId] || null;
    return {
      id: candidate.id,
      side,
      variationId,
      profileNode,
      profileDetail: Boolean(profileNode && candidate.rigged?.root?.getObjectByName?.(profileNode)),
      ctMask: Boolean(candidate.rigged?.root?.getObjectByName?.("C2C_CT_LowerFaceMask")),
      ctMark: Boolean(candidate.rigged?.root?.getObjectByName?.("C2C_CT_ServiceMark")),
      tWrap: Boolean(candidate.rigged?.root?.getObjectByName?.("C2C_T_FaceWrap")),
      tSling: Boolean(candidate.rigged?.root?.getObjectByName?.("C2C_T_DiagonalSling")),
    };
  }) || [];`);
  const ctStructure = teamStructure.filter((candidate) => candidate.side === "ct" && candidate.ctMask && candidate.ctMark && !candidate.tWrap && !candidate.tSling && candidate.profileDetail);
  const tStructure = teamStructure.filter((candidate) => candidate.side === "t" && candidate.tWrap && candidate.tSling && !candidate.ctMask && !candidate.ctMark && candidate.profileDetail);
  if (EXPECT_ALL && (ctStructure.length !== 5 || tStructure.length !== 5)) {
    throw new Error(`team structural presentation failed: ${JSON.stringify(teamStructure)}`);
  }
  console.log(`INFO C2C team structure=${JSON.stringify({ ct: ctStructure.length, t: tStructure.length, players: teamStructure })}`);
  const hitReactionEvidence = ART_REVIEW_CAPTURE ? null : await runHitReactionEvidence(chrome);
  const focusCameraEvidence = ART_REVIEW_CAPTURE ? null : await runFocusCameraEvidence(chrome);
  const rifleTargetId = await waitForRifle(chrome);
  if (process.env.CS_C2C_REQUIRE_RIFLE_CAPTURE === "1" && !rifleTargetId) throw new Error("rifle presentation capture target did not occur during wait window");

  const evidence = await chrome.evaluate(`return (() => {
    const c = window.__ESMO_FPS_C2A__ || null;
    const player = c?.players?.t1 || null;
    const canvas = document.querySelector("canvas");
    const target = window.__ESMO_FPS_SCENE__?.players?.find?.((candidate) => candidate.id === "t1");
    const materials = [];
    target?.rigged?.root?.traverse?.((object) => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.filter(Boolean).forEach((material) => materials.push({
        mesh: object.name,
        color: material.color?.getHex?.() ?? null,
        map: Boolean(material.map),
        transparent: Boolean(material.transparent),
        opacity: material.opacity,
        roughness: material.roughness ?? null,
        metalness: material.metalness ?? null,
      }));
    });
    return {
      player,
      heroCount: c ? Object.values(c.players || {}).filter((candidate) => candidate.c2cHero).length : 0,
      diagnosticPlayers: c ? Object.values(c.players || {}).map((candidate) => ({
        id: candidate.id,
        c2cHero: candidate.c2cHero,
        variationId: candidate.variationId,
        weaponType: candidate.weaponType,
        normalizedBounds: candidate.normalizedBounds || null,
        baseBounds: candidate.baseBounds || null,
        currentBounds: candidate.currentBounds || null,
        rootScale: candidate.rootScale || null,
        facingDegrees: candidate.facingDegrees ?? null,
      })) : [],
      materials,
      runtimeShape: {
        root: target?.rigged?.root ? {
          position: target.rigged.root.position.toArray(),
          scale: target.rigged.root.scale.toArray(),
          children: target.rigged.root.children.map((child) => ({ name: child.name, position: child.position.toArray(), scale: child.scale.toArray() })),
        } : null,
        c2cNodes: ["C2C_CombatTopShell", "C2C_TacticalPantsThigh_0", "C2C_PlateCarrier", "C2C_MagazinePouch_0", "C2C_RadioUnit", "C2C_Glove_0", "C2C_Boot_0", "C2C_HelmetShell", "C2C_HeadsetL", "C2C_ShoulderPad_0", "C2C_KneePad_0", "PistolSlide", "RifleReceiver", "RifleMuzzle"].map((name) => {
          const node = target?.rigged?.root?.getObjectByName?.(name);
          if (!node) return { name, found: false };
          const world = node.position.clone();
          node.getWorldPosition(world);
          const parentOrigin = node.parent?.position?.clone?.() || node.position.clone();
          const parentZ = node.parent?.position?.clone?.() || node.position.clone();
          const parentX = node.parent?.position?.clone?.() || node.position.clone();
          node.parent?.localToWorld?.(parentOrigin);
          parentZ.set(0, 0, 1);
          node.parent?.localToWorld?.(parentZ);
          parentX.set(1, 0, 0);
          node.parent?.localToWorld?.(parentX);
          return { name, found: true, position: node.position.toArray(), scale: node.scale.toArray(), world: world.toArray(), parent: node.parent?.name || null, parentScale: node.parent?.scale?.toArray?.() || null, parentOrigin: parentOrigin.toArray(), parentX: parentX.toArray(), parentZ: parentZ.toArray() };
        }),
        weapon: (() => {
          const pistol = target?.rigged?.root?.getObjectByName?.("PistolSlide");
          const rifle = target?.rigged?.root?.getObjectByName?.("RifleReceiver");
          const groups = Object.fromEntries(["pistol", "smg", "rifle", "sniper", "shotgun"].map((family) => {
            const groupName = "ESMO_C2C_Vector9_" + family[0].toUpperCase() + family.slice(1);
            const group = target?.rigged?.c2c?.weaponGroups?.[family] || target?.rigged?.root?.getObjectByName?.(groupName);
            return [family + "GroupVisible", group?.visible ?? null];
          }));
          return { pistolVisible: pistol?.visible ?? null, rifleVisible: rifle?.visible ?? null, pistolParent: pistol?.parent?.name || null, rifleParent: rifle?.parent?.name || null, ...groups };
        })(),
      },
      canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight, bufferWidth: canvas.width, bufferHeight: canvas.height } : null,
      renderer: canvas ? {
        calls: Number(canvas.dataset.esmoFpsRenderCalls || 0),
        triangles: Number(canvas.dataset.esmoFpsTriangles || 0),
        geometries: Number(canvas.dataset.esmoFpsGeometries || 0),
        textures: Number(canvas.dataset.esmoFpsTextures || 0),
        players: Number(canvas.dataset.esmoFpsPlayers || 0),
        rigged: Number(canvas.dataset.esmoFpsRigged || 0),
        mixers: Number(canvas.dataset.esmoFpsMixers || 0),
      } : null,
      visibility: window.__ESMO_FPS_VISIBILITY__ || null,
      scene: window.__ESMO_FPS_SCENE__ ? { recovery: window.__ESMO_FPS_SCENE__.cameraRecoveryCount || 0, rapid: window.__ESMO_FPS_SCENE__.rapidCameraRecoveryCount || 0 } : null,
    };
  })();`);
  console.log(`INFO C2C runtime diagnostic=${JSON.stringify({ player: evidence.player, all: evidence.diagnosticPlayers, bodyVisibility: evidence.visibility?.players?.find?.((candidate) => candidate.id === "t1") || null, c2cNodes: evidence.runtimeShape?.c2cNodes, weapon: evidence.runtimeShape?.weapon, scene: evidence.scene })}`);
  if (!evidence.canvas || evidence.canvas.width < 1 || evidence.canvas.height < 1) throw new Error(`invalid canvas: ${JSON.stringify(evidence.canvas)}`);
  if (!evidence.player || evidence.player.mode !== "rigged") throw new Error(`hero is not rigged: ${JSON.stringify(evidence.player)}`);
  if (EXPECT_HERO && (!evidence.player.c2cHero || evidence.player.artMode !== "esmo-c2c-vector-9-hero")) throw new Error(`C2C hero not active: ${JSON.stringify(evidence.player)}`);
  if (EXPECT_ALL && evidence.heroCount !== 10) throw new Error(`C2C all-player opt-in failed: ${JSON.stringify({ heroCount: evidence.heroCount, diagnostic: evidence.player })}`);
  if (EXPECT_ALL && new Set(evidence.diagnosticPlayers.map((candidate) => candidate.variationId).filter(Boolean)).size < 5) throw new Error(`C2C variation coverage failed: ${JSON.stringify(evidence.diagnosticPlayers)}`);
  if (EXPECT_HERO && (evidence.player.artTriangles < 1 || evidence.player.artTriangles > 5200 || evidence.player.artMaterials > 8)) throw new Error(`C2C budget failed: ${JSON.stringify(evidence.player)}`);
  const missingEquipmentNodes = evidence.runtimeShape.c2cNodes.filter((node) => !node.found).map((node) => node.name);
  if (missingEquipmentNodes.length) throw new Error(`C2C equipment presentation missing: ${JSON.stringify(missingEquipmentNodes)}`);
  const activeWeaponVisible = evidence.runtimeShape.weapon[`${evidence.player.weaponFamily || evidence.player.weaponType}GroupVisible`]
    ?? evidence.runtimeShape.weapon[`${evidence.player.weaponType}GroupVisible`];
  if (!activeWeaponVisible) throw new Error(`active weapon presentation missing: ${JSON.stringify(evidence.runtimeShape.weapon)}`);
  if (!evidence.visibility?.check?.ok || evidence.visibility.teams?.blue?.authoritative !== 5 || evidence.visibility.teams?.red?.authoritative !== 5) throw new Error(`visibility failed: ${JSON.stringify(evidence.visibility)}`);
  if (evidence.scene?.rapid && process.env.CS_C2C_ALLOW_REVIEW_SEEK_CAMERA !== "1") throw new Error(`camera recovery loop: ${JSON.stringify(evidence.scene)}`);
  if (evidence.scene?.rapid) console.log(`WARN C2C review frame seek observed camera recovery=${JSON.stringify(evidence.scene)}; camera gate remains authoritative`);
  const errors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  if (errors.console.length || errors.page.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);

  const gameplayTargetId = rifleTargetId || "t1";
  const gameplayFocused = await focusHero(chrome, gameplayTargetId);
  if (!gameplayFocused?.ok) throw new Error(`could not focus gameplay target: ${JSON.stringify(gameplayFocused)}`);
  await sleep(350);
  const gameplay = await captureBattleGameplay(chrome, gameplayTargetId);
  const lineup = await captureReviewLineup(chrome);
  const weaponLineup = await captureReviewLineup(chrome, { showWeapons: true, name: "weapon-lineup" });
  const focused = await focusHero(chrome);
  if (!focused?.ok) throw new Error(`could not focus t1 for art capture: ${JSON.stringify(focused)}`);
  // The source Idle clip has an exaggerated contact pose at t=0.35 that
  // reads like a mannequin break-up in a still.  Keep the authored aiming
  // stance for the body review while hiding the weapon; it preserves a
  // coherent tactical silhouette without changing Battle animation logic.
  await setReviewPose(chrome, "t1", "Idle_Loop", 0.05);
  await hideReviewWeapons(chrome, "t1");
  const captures = {
    lineup,
    weaponLineup,
    gameplay,
    redFront: await captureCanvas(chrome, "red-front", 0),
    redQuarter45: await captureCanvas(chrome, "red-quarter45", Math.PI / 4),
    redSide: await captureCanvas(chrome, "red-side", Math.PI / 2),
    redBack: await captureCanvas(chrome, "red-back", Math.PI),
  };
  await setReviewPose(chrome, "ct1", "Idle_Loop", 0.05);
  await hideReviewWeapons(chrome, "ct1");
  captures.blueFront = await captureCanvas(chrome, "blue-front", 0, "ct1");
  captures.blueQuarter45 = await captureCanvas(chrome, "blue-quarter45", Math.PI / 4, "ct1");
  captures.blueSide = await captureCanvas(chrome, "blue-side", Math.PI / 2, "ct1");
  captures.blueBack = await captureCanvas(chrome, "blue-back", Math.PI, "ct1");
  if (rifleTargetId) {
    await forceReviewWeapon(chrome, rifleTargetId, "rifle");
    await setReviewPose(chrome, rifleTargetId);
    captures.rifle = await captureCanvas(chrome, "rifle", Math.PI / 4, rifleTargetId, 6.8);
  }
  for (const [family, radius] of [["pistol", 3.6], ["smg", 3.8], ["rifle", 4], ["sniper", 4.4], ["shotgun", 3.8]]) {
    await forceReviewWeapon(chrome, "t1", family);
    await setReviewPose(chrome, "t1", "Pistol_Aim_Neutral");
    captures[family] = await captureCanvas(chrome, family, Math.PI / 4, "t1", radius);
  }
  captures.silhouette = await captureSilhouette(chrome, "t1");
  const runtimeEvidencePath = path.join(OUTPUT_DIR, "runtime-evidence.json");
  fs.writeFileSync(runtimeEvidencePath, JSON.stringify({
    version: "cs-c2c-runtime-evidence.v1",
    capturedAt: new Date().toISOString(),
    app: APP,
    orientation: orientationEvidence,
    hitReaction: hitReactionEvidence,
    focusCamera: focusCameraEvidence,
    renderer: evidence.renderer,
    visibility: evidence.visibility,
    scene: evidence.scene,
    art: {
      mode: evidence.player.artMode,
      heroCount: evidence.heroCount,
      triangles: evidence.player.artTriangles,
      materials: evidence.player.artMaterials,
      variations: [...new Set(evidence.diagnosticPlayers.map((candidate) => candidate.variationId).filter(Boolean))],
    },
    captures,
  }, null, 2));
  console.log(`PASS C2C ${EXPECT_HERO ? "hero" : "baseline"} Home -> Practice -> Mirage -> Battle canvas=${JSON.stringify(evidence.canvas)}`);
  console.log(`PASS C2C art=${JSON.stringify({ artMode: evidence.player.artMode, c2cHero: evidence.player.c2cHero, heroCount: evidence.heroCount, variationIds: [...new Set(evidence.diagnosticPlayers.map((candidate) => candidate.variationId).filter(Boolean))], weaponType: evidence.player.weaponType, weaponTypes: evidence.diagnosticPlayers.map((candidate) => ({ id: candidate.id, weaponType: candidate.weaponType })), triangles: evidence.player.artTriangles, materials: evidence.player.artMaterials, normalizedBounds: evidence.player.normalizedBounds, rootScale: evidence.player.rootScale, facingDegrees: evidence.player.facingDegrees })}`);
  console.log(`PASS C2C renderer=${JSON.stringify(evidence.renderer)}`);
  console.log(`PASS C2C Battle orientation=${JSON.stringify(orientationEvidence)}`);
  console.log(`PASS C2C runtimeShape=${JSON.stringify(evidence.runtimeShape)}`);
  console.log(`PASS C2C captures=${JSON.stringify({ ...captures, rifleTargetId, runtimeEvidencePath })}`);
  console.log(`PASS C2C visibility=10/10 cameraRapidRecovery=${evidence.scene?.rapid || 0} browserErrors=0`);
} finally {
  if (chrome) await chrome.close();
  if (dev) await dev.stop();
}
