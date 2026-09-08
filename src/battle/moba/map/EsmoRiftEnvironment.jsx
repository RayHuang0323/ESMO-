import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { WORLD_SCALE } from '../../../gameData.js';

const asset = `${import.meta.env.BASE_URL}assets/moba/rift-v1/esmo-rift.glb?rev=330-corridor-v3`;
function RiftAsset({ quality }) {
  const { scene } = useGLTF(asset);
  const environment = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      // Bushes remain visible even at low quality: they convey real vision cover.
      if (quality === 'low' && /Rift_(pine|leaf|wood)_/.test(o.name)) o.visible = false;
    });
    return copy;
  }, [scene, quality]);
  return <primitive object={environment} scale={WORLD_SCALE} dispose={null} />;
}
class AssetBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function EsmoRiftEnvironment({ quality, fallback }) {
  return <AssetBoundary fallback={fallback}>
    <Suspense fallback={fallback}><RiftAsset quality={quality} /></Suspense>
  </AssetBoundary>;
}
