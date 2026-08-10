import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = `${import.meta.env.BASE_URL}assets/heroes/dadi/dadi_final_texture.glb`;
// GLB 的原始高度約 2.13m；Runtime 原型英雄高度約 4.42 世界單位。
// 使用與旗幟／原型英雄相近的戰場讀圖比例，避免正式鏡頭下幾乎看不見。
// 這只改呈現層 transform，不改 GLB 幾何與戰鬥碰撞／數值。
const MODEL_SCALE = 3.9;

/**
 * 大地守衛的隔離 GLB 呈現器。
 * GLB 本身沒有 Armature；這裡只做根節點級待機／移動／盾擊展示，
 * 不改 snapshot、不改戰鬥數值，也不把物件級動作宣稱成 Rig 動畫。
 */
export default function DadiHeroProxy({ heroId, alive, frameRef, onReady }) {
  const groupRef = useRef(null);
  const [scene, setScene] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
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
  }, [onReady]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const effects = frameRef?.current?.effects ?? [];
    const actionFx = effects.find((fx) => String(fx.sourceId ?? "") === String(heroId));
    const phaseProgress = actionFx ? Math.max(0, Math.min(1, actionFx.phaseProgress ?? 0)) : 0;
    const pulse = actionFx ? Math.sin(Math.PI * phaseProgress) : 0;
    const cast = actionFx?.phase === "cast" ? pulse : 0;
    const release = actionFx?.phase === "travel" ? pulse : 0;
    const idle = Math.sin(clock.getElapsedTime() * 1.7) * 0.018;
    group.visible = !!alive;
    group.position.y = -0.08 + idle + cast * 0.05;
    group.rotation.x = -release * 0.16;
    group.rotation.z = idle * 0.55 + cast * 0.06;
  });

  if (!scene) return null;
  return (
    <group
      ref={groupRef}
      name="dadi-hero-proxy"
      scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
      rotation={[0, Math.PI, 0]}
      userData={{ heroId, proxy: true, source: MODEL_URL, animationBoundary: "OBJECT_LEVEL_ONLY_NO_RIG" }}
    >
      <primitive object={scene} />
    </group>
  );
}
