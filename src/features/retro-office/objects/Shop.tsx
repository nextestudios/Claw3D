"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { SCALE } from "@/features/retro-office/core/constants";
import {
  getItemBaseSize,
  getItemRotationRadians,
  toWorld,
} from "@/features/retro-office/core/geometry";
import type { InteractiveFurnitureModelProps } from "@/features/retro-office/objects/types";

export type ShopModelProps = InteractiveFurnitureModelProps & {
  active?: boolean;
  enabled?: boolean;
};

const COLORS = {
  awning: "#f59e0b",
  awningDark: "#c2410c",
  counter: "#7c3aed",
  counterDark: "#581c87",
  accent: "#38bdf8",
  shelf: "#f8fafc",
  shelfDark: "#94a3b8",
  bag: "#22c55e",
};

export function ShopModel({
  item,
  isSelected,
  isHovered,
  active = false,
  enabled = true,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onClick,
}: ShopModelProps) {
  const [localHovered, setLocalHovered] = useState(false);
  const glowRef = useRef<THREE.PointLight>(null);
  const [wx, , wz] = toWorld(item.x, item.y);
  const { width, height } = getItemBaseSize(item);
  const rotY = getItemRotationRadians(item);
  const widthWorld = width * SCALE;
  const depthWorld = height * SCALE;
  const scaleX = (width * SCALE) / 1.15;
  const scaleZ = (height * SCALE) / 0.95;
  const highlighted = isSelected || isHovered;
  const open = active && enabled;
  const tint = (enabledColor: string, disabledColor: string) =>
    enabled ? enabledColor : disabledColor;

  useFrame((state) => {
    if (!glowRef.current || !open) return;
    glowRef.current.intensity =
      (Math.sin(state.clock.elapsedTime * 3.6) * 0.28 + 0.72) * 1.8;
  });

  return (
    <group
      position={[wx, 0, wz]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(item._uid);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setLocalHovered(true);
        onPointerOver(item._uid);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setLocalHovered(false);
        onPointerOut();
        document.body.style.cursor = "";
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(item._uid);
      }}
    >
      <group
        position={[widthWorld / 2, 0, depthWorld / 2]}
        rotation={[0, rotY, 0]}
        scale={[scaleX, 1, scaleZ]}
      >
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <boxGeometry args={[1.15, 0.12, 0.95]} />
          <meshStandardMaterial
            color={tint(COLORS.counterDark, "#262626")}
            roughness={0.82}
            metalness={0.1}
          />
        </mesh>

        <mesh position={[0, 0.44, -0.18]} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.7, 0.38]} />
          <meshStandardMaterial
            color={tint(
              highlighted ? "#6d28d9" : COLORS.counter,
              highlighted ? "#585858" : "#444444",
            )}
            roughness={0.55}
            metalness={0.14}
          />
        </mesh>

        <mesh position={[0, 0.98, -0.16]} castShadow receiveShadow>
          <boxGeometry args={[1.08, 0.08, 0.82]} />
          <meshStandardMaterial
            color={tint(COLORS.shelf, "#5a5a5a")}
            roughness={0.35}
            metalness={0.3}
          />
        </mesh>

        <mesh position={[0, 1.28, 0]} castShadow>
          <boxGeometry args={[1.1, 0.18, 0.92]} />
          <meshStandardMaterial
            color={tint(COLORS.awningDark, "#353535")}
            roughness={0.48}
            metalness={0.16}
          />
        </mesh>

        <mesh position={[0, 1.18, 0.38]} castShadow>
          <boxGeometry args={[1.0, 0.16, 0.1]} />
          <meshStandardMaterial
            color={tint(COLORS.awning, "#4d4d4d")}
            roughness={0.4}
            metalness={0.08}
          />
        </mesh>

        {[-0.34, -0.1, 0.14, 0.38].map((offset, index) => (
          <mesh key={offset} position={[offset, 0.92, 0.2]} castShadow>
            <boxGeometry args={[0.16, 0.18 + index * 0.02, 0.12]} />
            <meshStandardMaterial
              color={tint(index % 2 === 0 ? COLORS.accent : COLORS.bag, "#555555")}
              roughness={0.48}
              metalness={0.18}
            />
          </mesh>
        ))}

        <mesh position={[0, 0.62, 0.33]}>
          <planeGeometry args={[0.82, 0.26]} />
          <meshStandardMaterial
            color={tint("#111827", "#202020")}
            emissive={enabled ? (open ? "#60a5fa" : COLORS.accent) : "#353535"}
            emissiveIntensity={enabled ? (open ? 0.95 : 0.28) : 0.08}
          />
        </mesh>
        <Billboard position={[0, 0.62, 0.34]} follow={false}>
          <Text
            fontSize={0.09}
            color={enabled ? "#f8fafc" : "#787878"}
            anchorX="center"
            anchorY="middle"
            maxWidth={0.72}
            textAlign="center"
          >
            {enabled ? (open ? "AMAZON LIVE" : "AMAZON SHOP") : "NOT INSTALLED"}
          </Text>
        </Billboard>

        <Billboard position={[0, 1.98, 0]} follow={false}>
          <Text
            fontSize={0.11}
            color={enabled ? "#fde68a" : "#facc15"}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
            renderOrder={100000}
            depthOffset={-10}
            material-depthTest={false}
            material-depthWrite={false}
          >
            SHOP
          </Text>
        </Billboard>

        <Billboard position={[0, 1.76, 0]} follow={false}>
          <Text
            fontSize={0.11}
            color={enabled ? "#fde68a" : "#b0b0b0"}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
            maxWidth={0.9}
            textAlign="center"
            renderOrder={100000}
            depthOffset={-10}
            material-depthTest={false}
            material-depthWrite={false}
          >
            SHOP
          </Text>
        </Billboard>

        {[-0.42, 0.42].map((offset) => (
          <mesh key={offset} position={[offset, 0.66, -0.12]} castShadow>
            <boxGeometry args={[0.08, 1.1, 0.08]} />
            <meshStandardMaterial
              color={tint(COLORS.shelfDark, "#4a4a4a")}
              roughness={0.5}
              metalness={0.25}
            />
          </mesh>
        ))}

        {!enabled && (localHovered || isHovered) ? (
          <Billboard position={[0, 1.78, 0]} follow={false}>
            <Text
              fontSize={0.07}
              color="#facc15"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor="#000000"
            >
              Click to install AMAZON
            </Text>
          </Billboard>
        ) : null}

        {open ? (
          <pointLight
            ref={glowRef}
            position={[0, 1.05, 0.5]}
            color="#60a5fa"
            intensity={1}
            distance={3.5}
          />
        ) : null}

        {(localHovered || isHovered) ? (
          <mesh position={[0, 1.62, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial
              color="#60a5fa"
              emissive="#60a5fa"
              emissiveIntensity={1.1}
            />
          </mesh>
        ) : null}

        {isSelected ? (
          <mesh position={[0, 0.08, 0]}>
            <torusGeometry args={[0.62, 0.03, 12, 48]} />
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#fbbf24"
              emissiveIntensity={1}
            />
          </mesh>
        ) : null}
      </group>
    </group>
  );
}
