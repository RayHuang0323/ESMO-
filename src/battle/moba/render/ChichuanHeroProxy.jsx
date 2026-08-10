import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const PROXY_SCALE = 0.9;
const PROXY_URLS = Object.freeze({
  "cli-v003": `${import.meta.env.BASE_URL}assets/heroes/chichuan/chichuan_proxy_v001.glb`,
  "desktop-v002": `${import.meta.env.BASE_URL}assets/heroes/chichuan/desktop-v002/chichuan_proxy_desktop_v002.glb`,
});

/** 單英雄 proxy：只載入與呈現，不讀 snapshot、不改戰鬥資料。 */
export default function ChichuanHeroProxy({ heroId, variant = "cli-v003", alive, frameRef, onReady }) {
  const groupRef = useRef(null);
  const [scene, setScene] = useState(null);
  const proxyUrl = PROXY_URLS[variant] ?? PROXY_URLS["cli-v003"];

  useEffect(() => {
    let mounted = true;
    const loader = new GLTFLoader();
    loader.load(
      proxyUrl,
      (gltf) => {
        if (!mounted) return;
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = false;
          node.receiveShadow = false;
          node.frustumCulled = false;
        });
        setScene(gltf.scene.clone(true));
        onReady?.(true);
      },
      undefined,
      () => { if (mounted) onReady?.(false); },
    );
    return () => { mounted = false; };
  }, [onReady, proxyUrl]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const effects = frameRef?.current?.effects ?? [];
    const actionFx = effects.find((fx) => String(fx.sourceId ?? "") === String(heroId));
    const progress = actionFx ? Math.max(0, Math.min(1, actionFx.phaseProgress ?? 0)) : 0;
    const pulse = actionFx ? Math.sin(Math.PI * progress) : 0;
    const cast = actionFx?.phase === "cast" ? pulse : 0;
    const release = actionFx?.phase === "travel" ? pulse : 0;
    group.visible = !!alive;
    group.position.y = -0.1 * PROXY_SCALE + Math.sin(clock.getElapsedTime() * 2.1) * 0.025 + cast * 0.04;
    group.rotation.x = -release * 0.22;
    group.rotation.z = cast * 0.08;
  });

  if (!scene) return null;
  return (
    <group ref={groupRef} name="chichuan-hero-proxy"
      scale={[PROXY_SCALE, PROXY_SCALE, PROXY_SCALE]}
      rotation={[0, Math.PI, 0]}
      userData={{ heroId, proxy: true, variant, source: proxyUrl }}>
      <primitive object={scene} />
    </group>
  );
}
