"use client";

import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";

import type { StudioWorldAssetDraft, StudioWorldDraft } from "@/lib/studio-world/types";
import { buildAssetGeometry, buildAssetMaterial, buildGlowMaterial } from "@/features/studio-world/preview/scene-utils";

type AssetMeshProps = {
  asset: StudioWorldAssetDraft;
};

const AssetMesh = ({ asset }: AssetMeshProps) => {
  const groupRef = useRef<Group>(null);
  const geometry = useMemo(() => buildAssetGeometry(asset.kind, asset.scale), [asset.kind, asset.scale]);
  const material = useMemo(
    () => buildAssetMaterial(asset.color, asset.emissive ?? null),
    [asset.color, asset.emissive],
  );
  const glowMaterial = useMemo(
    () => (asset.emissive ? buildGlowMaterial(asset.emissive) : null),
    [asset.emissive],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const elapsed = clock.elapsedTime;
    const [x, y, z] = asset.position;
    if (asset.animation === "bob") {
      groupRef.current.position.set(x, y + Math.sin(elapsed * 1.8 + x) * 0.22, z);
    } else if (asset.animation === "pulse") {
      const scale = 1 + Math.sin(elapsed * 2.4 + z) * 0.06;
      groupRef.current.position.set(x, y, z);
      groupRef.current.scale.setScalar(scale);
    } else {
      groupRef.current.position.set(x, y, z);
      groupRef.current.scale.setScalar(1);
    }
    groupRef.current.rotation.y =
      asset.rotationY + (asset.animation === "spin" ? elapsed * 0.75 : 0);
  });

  return (
    <group ref={groupRef} position={asset.position}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {glowMaterial ? (
        <mesh
          position={[0, Math.max(asset.scale[1] * 0.6, 0.8), 0]}
          material={glowMaterial}
        >
          <sphereGeometry args={[Math.max(asset.scale[0] * 0.28, 0.35), 18, 18]} />
        </mesh>
      ) : null}
    </group>
  );
};

const SceneContents = ({ sceneDraft }: { sceneDraft: StudioWorldDraft }) => {
  const fogColor = sceneDraft.palette.fog;
  return (
    <>
      <color attach="background" args={[sceneDraft.palette.sky]} />
      <fog attach="fog" args={[fogColor, 18, 78]} />
      <ambientLight intensity={0.8} color="#f4f7ff" />
      <directionalLight
        castShadow
        position={[14, 18, 12]}
        intensity={1.1}
        color="#fff3dd"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-12, 10, -6]} intensity={0.45} color={sceneDraft.palette.glow} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[sceneDraft.worldBounds.width * 2.2, sceneDraft.worldBounds.depth * 2.2]} />
        <meshStandardMaterial color={sceneDraft.palette.ground} roughness={0.95} metalness={0.02} />
      </mesh>
      <gridHelper
        args={[
          Math.max(sceneDraft.worldBounds.width, sceneDraft.worldBounds.depth) * 2,
          24,
          new THREE.Color(sceneDraft.palette.glow),
          new THREE.Color(sceneDraft.palette.structure),
        ]}
        position={[0, 0.02, 0]}
      />
      {sceneDraft.assets.map((asset) => (
        <AssetMesh key={asset.id} asset={asset} />
      ))}
      <Environment preset="city" />
      <OrbitControls
        enablePan={false}
        minDistance={10}
        maxDistance={72}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        target={sceneDraft.camera.target}
      />
    </>
  );
};

type StudioWorldPreviewProps = {
  sceneDraft: StudioWorldDraft;
};

export function StudioWorldPreview({ sceneDraft }: StudioWorldPreviewProps) {
  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-border/60 bg-black/70">
      <Canvas
        shadows
        camera={{
          position: sceneDraft.camera.position,
          fov: 42,
        }}
      >
        <SceneContents sceneDraft={sceneDraft} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">
            Claw3D Studio Preview
          </p>
          <p className="mt-1 text-sm text-white/90">{sceneDraft.promptSummary}</p>
        </div>
        <div className="rounded-full border border-white/15 bg-black/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/75">
          {sceneDraft.assets.length} assets
        </div>
      </div>
    </div>
  );
}
