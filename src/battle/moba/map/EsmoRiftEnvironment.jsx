import React, { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { WORLD_SCALE } from '../../../gameData.js';
import { armRiftGate, getRiftMapSnapshot, preloadRiftAsset, subscribeRiftAsset } from './riftAsset.js';
import { beginMapFrameTally, noteMapFrame } from './riftMapGate.js';
import { diagnosticsEnabled } from '../render/runtimeDiagnostics.js';

// Normal path: Loading waited for the Rift (riftAsset.js), so the first battle
// frame already draws it. The blockout fallback only appears when the asset
// failed or the wait timed out; while still inside the wait nothing is drawn.
function RiftAsset({ gltf, quality }) {
  const environment = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      // Bushes remain visible even at low quality: they convey real vision cover.
      if (quality === 'low' && /Rift_(pine|leaf|wood)_/.test(o.name)) o.visible = false;
    });
    return copy;
  }, [gltf, quality]);
  return <primitive object={environment} scale={WORLD_SCALE} dispose={null} />;
}
class AssetBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
// Diagnostics only (?diag=1): records what this component drew on each frame.
function MapFrameProbe({ mode, reason = null }) {
  useFrame(() => noteMapFrame(mode, reason, performance.now()));
  return null;
}
export default function EsmoRiftEnvironment({ quality, fallback }) {
  const { decision, gltf } = useSyncExternalStore(subscribeRiftAsset, getRiftMapSnapshot, getRiftMapSnapshot);
  const probe = useMemo(() => diagnosticsEnabled(), []);
  useLayoutEffect(() => {
    if (probe) beginMapFrameTally(performance.now());
    // Entries that skip Loading (resumed battle, Replay, debug harness) still
    // start the download and share the same deadline.
    preloadRiftAsset({ source: 'map' });
    armRiftGate({ by: 'map' });
  }, [probe]);
  if (decision.mode === 'rift') {
    return <AssetBoundary fallback={<>{fallback}{probe && <MapFrameProbe mode="blockout" reason="error" />}</>}>
      <RiftAsset gltf={gltf} quality={quality} />
      {probe && <MapFrameProbe mode="rift" />}
    </AssetBoundary>;
  }
  if (decision.mode === 'blockout') {
    return <>{fallback}{probe && <MapFrameProbe mode="blockout" reason={decision.reason} />}</>;
  }
  return probe ? <MapFrameProbe mode="loading" /> : null;
}
