"use client";

import Image from "next/image";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";

import type {
  StudioProjectRecord,
  StudioSourceImageRecord,
  StudioWorldAssetDraft,
  StudioWorldDraft,
} from "@/lib/studio-world/types";
import { buildAssetGeometry, buildAssetMaterial, buildGlowMaterial } from "@/features/studio-world/preview/scene-utils";

type AssetMeshProps = {
  asset: StudioWorldAssetDraft;
};

const AssetMesh = ({ asset }: AssetMeshProps) => {
  const groupRef = useRef<Group>(null);
  const geometry = useMemo(() => buildAssetGeometry(asset.kind), [asset.kind]);
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

const RemoteGlbContents = ({ glbUrl }: { glbUrl: string }) => {
  const { scene } = useGLTF(glbUrl);
  const preparedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const targetSize = 6;
    const scale = targetSize / maxDimension;

    clone.position.sub(center);
    clone.scale.setScalar(scale);
    clone.position.y += Math.max(size.y * scale * 0.5, 1.2);

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [scene]);

  return (
    <>
      <color attach="background" args={["#090d12"]} />
      <fog attach="fog" args={["#111827", 14, 60]} />
      <ambientLight intensity={0.9} color="#f4f7ff" />
      <directionalLight
        castShadow
        position={[14, 18, 12]}
        intensity={1.15}
        color="#fff3dd"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-12, 10, -6]} intensity={0.4} color="#8bd6ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#121a22" roughness={0.96} metalness={0.01} />
      </mesh>
      <gridHelper
        args={[24, 24, new THREE.Color("#3b82f6"), new THREE.Color("#334155")]}
        position={[0, 0.02, 0]}
      />
      <primitive object={preparedScene} />
      <Environment preset="city" />
      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={28}
        minPolarAngle={0.25}
        maxPolarAngle={1.45}
        target={[0, 2.2, 0]}
      />
    </>
  );
};

type StudioWorldPreviewProps = {
  sceneDraft: StudioWorldDraft;
  referenceImage?: StudioSourceImageRecord | null;
  project?: Pick<StudioProjectRecord, "mode" | "provider" | "externalModel"> | null;
};

export function StudioWorldPreview({
  sceneDraft,
  referenceImage = null,
  project = null,
}: StudioWorldPreviewProps) {
  const isRemoteAiProject = project?.provider === "self_hosted";
  const remoteReady = Boolean(project?.externalModel?.glbUrl);
  const remoteGlbUrl = project?.externalModel?.glbUrl ?? null;
  const remoteThumbnailUrl = project?.externalModel?.thumbnailUrl ?? null;
  const previewLabel = isRemoteAiProject
    ? remoteReady
      ? "Remote AI result available"
      : "Remote AI task in progress"
    : "Local Studio preview";
  const previewSubLabel = isRemoteAiProject
    ? remoteReady
      ? "Showing local fallback scene while provider GLB and thumbnail are ready."
      : "Showing local fallback scene until the provider finishes."
    : project?.mode === "image_avatar"
      ? "Image-guided avatar proxy."
      : project?.mode === "image_mesh"
        ? "Image-guided mesh draft."
        : "Local world draft.";
  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-border/60 bg-black/70">
      <Canvas
        shadows
        camera={{
          position: sceneDraft.camera.position,
          fov: 42,
        }}
      >
        {remoteReady && remoteGlbUrl ? (
          <Suspense fallback={<SceneContents sceneDraft={sceneDraft} />}>
            <RemoteGlbContents glbUrl={remoteGlbUrl} />
          </Suspense>
        ) : (
          <SceneContents sceneDraft={sceneDraft} />
        )}
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">
            Claw3D Studio Preview
          </p>
          <p className="mt-1 text-sm text-white/90">{sceneDraft.promptSummary}</p>
          <p className="mt-1 text-[11px] text-white/65">{previewLabel}</p>
        </div>
        <div className="rounded-full border border-white/15 bg-black/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/75">
          {sceneDraft.assets.length} assets
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-16 px-4">
        <div className="inline-flex rounded-full border border-white/10 bg-black/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">
          {previewSubLabel}
        </div>
      </div>
      {referenceImage ? (
        <div className="pointer-events-none absolute bottom-4 left-4 w-36 overflow-hidden rounded-2xl border border-white/15 bg-black/45 shadow-2xl backdrop-blur">
          <Image
            src={referenceImage.dataUrl}
            alt={referenceImage.fileName}
            width={144}
            height={144}
            className="h-28 w-full object-cover"
            unoptimized
          />
          <div className="px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100/80">
              Reference
            </div>
            <div className="mt-1 truncate text-xs text-white/85">{referenceImage.fileName}</div>
            <div className="mt-1 text-[11px] text-white/60">
              {project?.mode === "image_avatar"
                ? "Image-guided avatar proxy."
                : project?.mode === "image_mesh"
                  ? "Image-guided mesh draft."
                  : "Reference image attached."}
            </div>
          </div>
        </div>
      ) : null}
      {remoteThumbnailUrl ? (
        <div className="pointer-events-none absolute bottom-4 right-4 w-40 overflow-hidden rounded-2xl border border-white/15 bg-black/45 shadow-2xl backdrop-blur">
          <Image
            src={remoteThumbnailUrl}
            alt="Remote AI thumbnail"
            width={160}
            height={160}
            className="h-28 w-full object-cover"
            unoptimized
          />
          <div className="px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100/80">
              Provider result
            </div>
            <div className="mt-1 text-[11px] text-white/60">
              Remote thumbnail returned by the AI provider.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
