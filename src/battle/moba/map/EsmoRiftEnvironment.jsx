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
// `owner` keeps a battle canvas still rendering under the Replay overlay out of
// the Replay's tally.
function MapFrameProbe({ mode, reason = null, owner }) {
  useFrame(() => noteMapFrame(mode, reason, performance.now(), owner));
  return null;
}
export default function EsmoRiftEnvironment({ quality, fallback }) {
  const { decision, gltf } = useSyncExternalStore(subscribeRiftAsset, getRiftMapSnapshot, getRiftMapSnapshot);
  const probe = useMemo(() => diagnosticsEnabled(), []);
  const owner = useMemo(() => ({}), []);
  useLayoutEffect(() => {
    if (probe) beginMapFrameTally(performance.now(), owner);
    // Entries that skip the gates (debug harness) still start the download and
    // share the same deadline.
    preloadRiftAsset({ source: 'map' });
    armRiftGate({ by: 'map' });
  }, [probe, owner]);
  if (decision.mode === 'rift') {
    return <AssetBoundary fallback={<>{fallback}{probe && <MapFrameProbe mode="blockout" reason="error" owner={owner} />}</>}>
      <RiftAsset gltf={gltf} quality={quality} />
      {probe && <MapFrameProbe mode="rift" owner={owner} />}
    </AssetBoundary>;
  }
  if (decision.mode === 'blockout') {
    return <>{fallback}{probe && <MapFrameProbe mode="blockout" reason={decision.reason} owner={owner} />}</>;
  }
  return probe ? <MapFrameProbe mode="loading" owner={owner} /> : null;
}
