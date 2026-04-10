"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";
import { AGENT_SCALE } from "@/features/retro-office/core/constants";
import {
  type AgentAvatarProfile,
  createDefaultAgentAvatarProfile,
} from "@/lib/avatars/profile";
import { useClawFC } from "@/lib/clawfc/context";
import type { ClawFCMatchEvent, ClawFCPlayer } from "@/lib/clawfc/types";

const FIELD_WIDTH = 16.6;
const FIELD_DEPTH = 10.4;
const STADIUM_BASE_WIDTH = FIELD_WIDTH + 2.6;
const STADIUM_BASE_DEPTH = FIELD_DEPTH + 1.2;
const CENTER_CIRCLE_INNER_RADIUS = 0.92;
const CENTER_CIRCLE_OUTER_RADIUS = 1.0;
const PENALTY_BOX_WIDTH = 3.2;
const PENALTY_BOX_DEPTH = 2.8;
const GOAL_BOX_WIDTH = 1.6;
const GOAL_BOX_DEPTH = 0.8;
const PENALTY_ARC_INNER_RADIUS = 0.6;
const PENALTY_ARC_OUTER_RADIUS = 0.66;
const GOAL_WIDTH = 1.4;
const GOAL_HEIGHT = 0.96;
const GOAL_NET_DEPTH = 0.6;

const PITCH_SURFACE_Y = 0.018;
const PLAYER_VISUAL_SCALE = (0.66 * AGENT_SCALE) / 0.4495 * 0.72 * 0.9;

// 1 match minute = 1 real minute (90 real minutes for a full match).
const MATCH_REALTIME_SECONDS = 90 * 60;

function getMatchMinute(elapsed: number): number {
  return Math.min(90, Math.floor((elapsed % MATCH_REALTIME_SECONDS) / MATCH_REALTIME_SECONDS * 90) + 1);
}

/**
 * Converts normalized engine position (0-1 range) to 3D field coordinates.
 * Engine uses x=0 as home goal line, x=1 as away goal line;
 * y=0 as one touchline, y=1 as the opposite.
 */
function enginePosToField(
  pos: { x: number; y: number },
  cx: number,
  cz: number,
): { x: number; z: number } {
  return {
    x: cx + (pos.x - 0.5) * FIELD_WIDTH,
    z: cz + (pos.y - 0.5) * FIELD_DEPTH,
  };
}

const EVENT_ICON: Record<string, string> = {
  goal: "\u26BD",
  penalty_goal: "\u26BD",
  own_goal: "\uD83D\uDE31",
  penalty_miss: "\u274C",
  shot_on_target: "\uD83C\uDFAF",
  shot_off_target: "\uD83D\uDCA8",
  shot_blocked: "\uD83D\uDEE1\uFE0F",
  save: "\uD83E\uDDE4",
  goalkeeper_claim: "\u270B",
  tackle_won: "\uD83D\uDC4A",
  tackle_lost: "\uD83D\uDE25",
  interception: "\u2702\uFE0F",
  clearance: "\uD83E\uDD7E",
  corner: "\uD83D\uDEA9",
  free_kick: "\uD83E\uDDB6",
  throw_in: "\uD83D\uDCAA",
  foul: "\u26A0\uFE0F",
  yellow_card: "\uD83D\uDFE8",
  red_card: "\uD83D\uDFE5",
  offside: "\uD83D\uDEA9",
  ball_possession_change: "\uD83D\uDD04",
  pass_completed: "\u2714\uFE0F",
  pass_incomplete: "\u2716\uFE0F",
  substitution: "\uD83D\uDD04",
};

const DEFAULT_FORMATION: ReadonlyArray<{
  x: number;
  z: number;
  goalkeeper: boolean;
}> = [
  { x: -7.6, z: 0, goalkeeper: true },
  { x: -5.8, z: -3.2, goalkeeper: false },
  { x: -5.8, z: -1.0, goalkeeper: false },
  { x: -5.8, z: 1.0, goalkeeper: false },
  { x: -5.8, z: 3.2, goalkeeper: false },
  { x: -2.6, z: -2.0, goalkeeper: false },
  { x: -2.6, z: 0, goalkeeper: false },
  { x: -2.6, z: 2.0, goalkeeper: false },
  { x: -0.6, z: -1.4, goalkeeper: false },
  { x: -0.6, z: 1.4, goalkeeper: false },
  { x: -0.2, z: 0, goalkeeper: false },
];

const DEFAULT_HOME_COLOR = "#2563eb";
const DEFAULT_AWAY_COLOR = "#dc2626";

/** Maps ClawFC positions to formation slot order. */
const POSITION_ORDER: Record<string, number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 5,
  forward: 8,
};

const CROWD_SKIN_TONES = ["#f3d2b4", "#d9a679", "#8d5a36", "#5c3b22"];
const CROWD_HAIR_COLORS = ["#111827", "#3f2d20", "#6b4423", "#94a3b8"];
const CROWD_OUTFIT_COLORS = ["#f8fafc", "#fbbf24", "#1f2937", "#4b5563"];

function SpectatorModel({
  position,
  facing,
  topColor,
  accentColor,
  skinColor,
  hairColor,
  motionSeed,
  isLive,
}: {
  position: [number, number, number];
  facing: number;
  topColor: string;
  accentColor: string;
  skinColor: string;
  hairColor: string;
  motionSeed: number;
  isLive: boolean;
}) {
  const rootRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * (isLive ? 4.6 : 1.8) + motionSeed * 0.7;
    const cheer = Math.sin(t);
    const bounce = Math.abs(Math.sin(t * 1.35));
    const sway = Math.sin(t * 0.8);

    if (rootRef.current) {
      rootRef.current.position.y = bounce * (isLive ? 0.03 : 0.012);
      rootRef.current.rotation.z = sway * 0.08;
      rootRef.current.rotation.x = isLive ? 0.05 : 0.02;
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = -1.1 + bounce * 0.35;
      leftArmRef.current.rotation.z = -0.65 - cheer * 0.45;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = -1.1 + bounce * 0.35;
      rightArmRef.current.rotation.z = 0.65 + cheer * 0.45;
    }
  });

  return (
    <group position={position} rotation={[0, facing, 0]} scale={PLAYER_VISUAL_SCALE}>
      <group ref={rootRef}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.18, 0.24, 0.1]} />
          <meshLambertMaterial color={topColor} />
        </mesh>
        <mesh position={[0, 0.27, 0.055]}>
          <boxGeometry args={[0.09, 0.03, 0.012]} />
          <meshLambertMaterial color={accentColor} />
        </mesh>
        <group position={[-0.05, 0.06, 0]}>
          <mesh>
            <boxGeometry args={[0.06, 0.16, 0.07]} />
            <meshLambertMaterial color="#1f2937" />
          </mesh>
        </group>
        <group position={[0.05, 0.06, 0]}>
          <mesh>
            <boxGeometry args={[0.06, 0.16, 0.07]} />
            <meshLambertMaterial color="#1f2937" />
          </mesh>
        </group>
        <group ref={leftArmRef} position={[-0.12, 0.28, 0]}>
          <mesh position={[0, -0.07, 0]}>
            <boxGeometry args={[0.05, 0.14, 0.05]} />
            <meshLambertMaterial color={topColor} />
          </mesh>
          <mesh position={[0, -0.15, 0]}>
            <boxGeometry args={[0.045, 0.04, 0.045]} />
            <meshLambertMaterial color={skinColor} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.12, 0.28, 0]}>
          <mesh position={[0, -0.07, 0]}>
            <boxGeometry args={[0.05, 0.14, 0.05]} />
            <meshLambertMaterial color={topColor} />
          </mesh>
          <mesh position={[0, -0.15, 0]}>
            <boxGeometry args={[0.045, 0.04, 0.045]} />
            <meshLambertMaterial color={skinColor} />
          </mesh>
        </group>
        <mesh position={[0, 0.39, 0]}>
          <boxGeometry args={[0.07, 0.05, 0.07]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        <mesh position={[0, 0.47, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.14]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        <mesh position={[-0.035, 0.485, 0.076]}>
          <boxGeometry args={[0.02, 0.02, 0.01]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
        <mesh position={[0.035, 0.485, 0.076]}>
          <boxGeometry args={[0.02, 0.02, 0.01]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 0.455, 0.075]}>
          <boxGeometry args={[0.016, 0.03, 0.01]} />
          <meshBasicMaterial color="#c08457" />
        </mesh>
        <mesh position={[0, 0.425, 0.076]}>
          <boxGeometry args={[0.045, 0.012, 0.01]} />
          <meshBasicMaterial color="#8b3a3a" />
        </mesh>
        <mesh position={[0, 0.54, 0]}>
          <boxGeometry args={[0.16, 0.04, 0.14]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
      </group>
    </group>
  );
}

function StandCrowd({
  centerX,
  centerZ,
  dir,
  tier,
  homeColor,
  awayColor,
  isLive,
}: {
  centerX: number;
  centerZ: number;
  dir: -1 | 1;
  tier: number;
  homeColor: string;
  awayColor: string;
  isLive: boolean;
}) {
  const spectators = useMemo(() => {
    const standWidth = FIELD_WIDTH - tier * 1.15;
    const seatCount = Math.max(8, 11 - tier);
    const crowdBaseZ = centerZ + dir * (FIELD_DEPTH / 2 + 0.3 + tier * 0.16);
    const crowdY = 0.26 + tier * 0.09;
    const facing = dir < 0 ? 0 : Math.PI;

    return Array.from({ length: seatCount }, (_, index) => {
      const ratio = seatCount === 1 ? 0.5 : index / (seatCount - 1);
      const x = centerX - standWidth / 2 + 0.45 + ratio * Math.max(standWidth - 0.9, 0.1);
      const z = crowdBaseZ + dir * (index % 2 === 0 ? 0.03 : -0.03);
      const useClubColor = index % 3 !== 1;
      const topColor = useClubColor
        ? dir < 0
          ? homeColor
          : awayColor
        : CROWD_OUTFIT_COLORS[(index + tier) % CROWD_OUTFIT_COLORS.length]!;
      const accentColor =
        index % 4 === 0 ? "#f8fafc" : dir < 0 ? awayColor : homeColor;
      return {
        x,
        y: crowdY,
        z,
        facing,
        topColor,
        accentColor,
        skinColor: CROWD_SKIN_TONES[(index + tier * 2) % CROWD_SKIN_TONES.length]!,
        hairColor: CROWD_HAIR_COLORS[(index + tier) % CROWD_HAIR_COLORS.length]!,
        motionSeed: tier * 20 + index + (dir < 0 ? 0 : 100),
      };
    });
  }, [centerX, centerZ, dir, tier, homeColor, awayColor]);

  return (
    <group>
      {spectators.map((spectator) => (
        <SpectatorModel
          key={`spectator-${dir}-${tier}-${spectator.motionSeed}`}
          position={[spectator.x, spectator.y, spectator.z]}
          facing={spectator.facing}
          topColor={spectator.topColor}
          accentColor={spectator.accentColor}
          skinColor={spectator.skinColor}
          hairColor={spectator.hairColor}
          motionSeed={spectator.motionSeed}
          isLive={isLive}
        />
      ))}
    </group>
  );
}

function buildTeamProfiles(
  teamKey: string,
  color: string,
  players: ClawFCPlayer[] | undefined,
): AgentAvatarProfile[] {
  return DEFAULT_FORMATION.map((_, index) => {
    const playerId = players?.[index]?.id ?? `${teamKey}-${index}`;
    const profile = createDefaultAgentAvatarProfile(playerId);
    profile.clothing.topColor = color;
    profile.clothing.topStyle = "tee";
    profile.clothing.bottomColor = "#1e293b";
    profile.clothing.bottomStyle = "shorts";
    profile.accessories.backpack = false;
    return profile;
  });
}

function sortPlayersToFormation(
  players: ClawFCPlayer[],
): ClawFCPlayer[] {
  return [...players].sort(
    (a, b) =>
      (POSITION_ORDER[a.position] ?? 5) - (POSITION_ORDER[b.position] ?? 5),
  );
}

function SoccerPlayerModel({
  profile,
  facing = 0,
  isLive = false,
  motionSeed = 0,
  isGoalkeeper = false,
  shirtColor,
  shirtNumber,
}: {
  profile: AgentAvatarProfile;
  facing?: number;
  isLive?: boolean;
  motionSeed?: number;
  isGoalkeeper?: boolean;
  shirtColor?: string;
  shirtNumber?: number;
}) {
  const rootRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const skin = profile.body.skinTone;
  const topColor = shirtColor ?? profile.clothing.topColor;
  const bottomColor = profile.clothing.bottomColor;
  const shoeColor = profile.clothing.shoesColor;
  const hairColor = profile.hair.color;
  const sleeveColor = topColor;

  useFrame(({ clock }) => {
    const cadence = isGoalkeeper ? 5.2 : 7.4;
    const t = clock.getElapsedTime() * cadence + motionSeed * 0.83;
    const stride = Math.sin(t);
    const lift = Math.abs(Math.sin(t));
    const sway = Math.sin(t * 2);

    if (rootRef.current) {
      rootRef.current.position.y = isLive ? lift * 0.018 : 0;
      rootRef.current.rotation.x = isLive ? 0.12 : 0;
      rootRef.current.rotation.z = isLive ? sway * 0.025 : 0;
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = isLive ? stride * 0.78 - 0.18 : 0;
      leftArmRef.current.rotation.z = isLive ? -0.1 - lift * 0.05 : 0;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = isLive ? -stride * 0.78 - 0.18 : 0;
      rightArmRef.current.rotation.z = isLive ? 0.1 + lift * 0.05 : 0;
    }
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = isLive ? -stride * 0.92 + lift * 0.08 : 0;
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = isLive ? stride * 0.92 + lift * 0.08 : 0;
    }
  });

  return (
    <group
      ref={rootRef}
      rotation={[0, facing, 0]}
      scale={PLAYER_VISUAL_SCALE}
    >
      {/* Legs. */}
      <group ref={leftLegRef} position={[-0.05, 0.12, 0]}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.07, 0.08, 0.08]} />
          <meshLambertMaterial color={bottomColor} />
        </mesh>
        <mesh position={[0, -0.045, 0]}>
          <boxGeometry args={[0.05, 0.06, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        <mesh position={[0, -0.09, 0]}>
          <boxGeometry args={[0.07, 0.05, 0.12]} />
          <meshLambertMaterial color={shoeColor} />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.05, 0.12, 0]}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.07, 0.08, 0.08]} />
          <meshLambertMaterial color={bottomColor} />
        </mesh>
        <mesh position={[0, -0.045, 0]}>
          <boxGeometry args={[0.05, 0.06, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        <mesh position={[0, -0.09, 0]}>
          <boxGeometry args={[0.07, 0.05, 0.12]} />
          <meshLambertMaterial color={shoeColor} />
        </mesh>
      </group>

      {/* Torso (jersey). */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.22, 0.1]} />
        <meshLambertMaterial color={topColor} />
      </mesh>

      {/* Shirt number on back. */}
      {shirtNumber != null ? (
        <Text
          position={[0, 0.32, -0.052]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.1}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.004}
          outlineColor="#000000"
          fontWeight="bold"
        >
          {String(shirtNumber)}
        </Text>
      ) : null}

      {/* Arms (sleeves same color as jersey). */}
      <group ref={leftArmRef} position={[-0.13, 0.3, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshLambertMaterial color={sleeveColor} />
        </mesh>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.13, 0.3, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshLambertMaterial color={sleeveColor} />
        </mesh>
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
      </group>

      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.07, 0.05, 0.07]} />
        <meshLambertMaterial color={skin} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.17, 0.17, 0.15]} />
        <meshLambertMaterial color={skin} />
      </mesh>

      {profile.hair.style === "short" ? (
        <mesh position={[0, 0.59, 0]}>
          <boxGeometry args={[0.18, 0.05, 0.15]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
      ) : null}
      {profile.hair.style === "parted" ? (
        <>
          <mesh position={[0, 0.585, 0]}>
            <boxGeometry args={[0.18, 0.045, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh
            position={[-0.03, 0.62, 0.01]}
            rotation={[0.1, 0, -0.2]}
          >
            <boxGeometry args={[0.12, 0.03, 0.08]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.hair.style === "bun" ? (
        <>
          <mesh position={[0, 0.59, 0]}>
            <boxGeometry args={[0.18, 0.05, 0.16]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.66, -0.04]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.accessories.glasses ? (
        <>
          <mesh position={[-0.04, 0.505, 0.084]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          <mesh position={[0.04, 0.505, 0.084]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          <mesh position={[0, 0.505, 0.084]}>
            <boxGeometry args={[0.02, 0.008, 0.01]} />
            <meshBasicMaterial color="#111827" />
          </mesh>
        </>
      ) : null}
      <mesh position={[0, 0.46, 0.079]}>
        <boxGeometry args={[0.05, 0.014, 0.01]} />
        <meshBasicMaterial color="#9c4a4a" />
      </mesh>
    </group>
  );
}

function AnimatedPlayerOnPitch({
  homeX,
  homeZ,
  centerX,
  centerZ,
  profile,
  baseFacing,
  isLive,
  playerIndex,
  isGoalkeeper,
  isHomeTeam,
  events,
  onPlayerClick,
  groupRefCallback,
  allPositions,
  shirtColor,
  shirtNumber,
}: {
  homeX: number;
  homeZ: number;
  centerX: number;
  centerZ: number;
  profile: AgentAvatarProfile;
  baseFacing: number;
  isLive: boolean;
  playerIndex: number;
  isGoalkeeper: boolean;
  isHomeTeam: boolean;
  events: ClawFCMatchEvent[];
  onPlayerClick?: () => void;
  groupRefCallback?: (ref: Group | null) => void;
  allPositions?: React.MutableRefObject<{ x: number; z: number }[]>;
  shirtColor?: string;
  shirtNumber?: number;
}) {
  const groupRef = useRef<Group>(null);
  const setGroupRef = useCallback(
    (node: Group | null) => {
      (groupRef as React.MutableRefObject<Group | null>).current = node;
      groupRefCallback?.(node);
    },
    [groupRefCallback],
  );

  const seed = useMemo(
    () => ({
      phaseX: playerIndex * 2.31 + 0.7,
      phaseZ: playerIndex * 1.87 + 1.2,
      speedX: 0.3 + (playerIndex % 5) * 0.08,
      speedZ: 0.25 + (playerIndex % 7) * 0.06,
      rangeX: isGoalkeeper ? 0.3 : 1.2 + (playerIndex % 3) * 0.4,
      rangeZ: isGoalkeeper ? 0.8 : 0.8 + (playerIndex % 4) * 0.3,
    }),
    [playerIndex, isGoalkeeper],
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.minute - b.minute),
    [events],
  );

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;

    if (!isLive) {
      g.position.set(homeX, PITCH_SURFACE_Y, homeZ);
      g.rotation.y = baseFacing;
      return;
    }

    const t = clock.getElapsedTime();
    const matchMinute = getMatchMinute(t);
    const attackDir = isHomeTeam ? 1 : -1;

    // Look back: find most recent event.
    const pastEvents = sortedEvents.filter((e) => e.minute <= matchMinute);
    const lastEvent = pastEvents[pastEvents.length - 1];
    const minutesSinceEvent = lastEvent ? matchMinute - lastEvent.minute : 99;

    // Look ahead: find next upcoming event.
    const nextEvent = sortedEvents.find((e) => e.minute > matchMinute);
    const minutesUntilNext = nextEvent ? nextEvent.minute - matchMinute : 99;

    let xBias = 0;
    let zBias = 0;
    let driftScale = 1;
    let bobScale = 1;
    let speedScale = 1;
    let celebrating = false;
    const myTeam = isHomeTeam ? "home" : "away";

    const GOAL_TYPES = new Set(["goal", "penalty_goal"]);
    const SHOT_TYPES = new Set(["shot_on_target", "shot_off_target", "shot_blocked"]);
    const CARD_TYPES = new Set(["yellow_card", "red_card"]);
    const SET_PIECE_TYPES = new Set(["corner", "free_kick", "throw_in"]);

    // --- LOOK-AHEAD: buildup animations before events ---

    if (nextEvent && GOAL_TYPES.has(nextEvent.type) && minutesUntilNext <= 3) {
      const isMyAttack = nextEvent.team === myTeam;
      const urgency = 1 - minutesUntilNext / 3;
      if (isMyAttack) {
        xBias = attackDir * (isGoalkeeper ? 0.3 : 1.5 + urgency * 2.0);
        zBias = (centerZ - homeZ) * urgency * 0.4;
        driftScale = 0.6 - urgency * 0.3;
        speedScale = 1.2 + urgency * 0.8;
      } else {
        xBias = -attackDir * (isGoalkeeper ? 0.1 : 0.8 * urgency);
        driftScale = 0.7;
        speedScale = 1.1;
      }
    } else if (nextEvent?.type === "own_goal" && minutesUntilNext <= 2) {
      const urgency = 1 - minutesUntilNext / 2;
      const isMyOwnGoal = nextEvent.team === myTeam;
      if (isMyOwnGoal) {
        xBias = -attackDir * urgency * 1.5;
        driftScale = 0.5;
        speedScale = 1.4;
      } else {
        xBias = attackDir * urgency * 0.8;
        driftScale = 0.8;
      }
    } else if (nextEvent?.type === "penalty_miss" && minutesUntilNext <= 1) {
      if (!isGoalkeeper) {
        xBias = (centerX - homeX) * 0.3;
        zBias = (centerZ - homeZ) * 0.4;
      }
      driftScale = 0.2;
      speedScale = 0.5;
    } else if (nextEvent && SHOT_TYPES.has(nextEvent.type) && minutesUntilNext <= 0.5) {
      const isMyShot = nextEvent.team === myTeam;
      const urgency = 1 - minutesUntilNext / 0.5;
      if (isMyShot) {
        xBias = attackDir * (isGoalkeeper ? 0.2 : 1.0 + urgency * 1.2);
        speedScale = 1.3 + urgency * 0.5;
      } else {
        xBias = -attackDir * 0.5 * urgency;
        speedScale = 1.2;
      }
      driftScale = 0.5;
    } else if (nextEvent && CARD_TYPES.has(nextEvent.type) && minutesUntilNext <= 1) {
      xBias = (centerX - homeX) * 0.15;
      zBias = (centerZ - homeZ) * 0.2;
      driftScale = 0.5;
      speedScale = 1.3;
    } else if (nextEvent?.type === "foul" && minutesUntilNext <= 0.5) {
      xBias = (centerX - homeX) * 0.1;
      zBias = (centerZ - homeZ) * 0.15;
      driftScale = 0.6;
      speedScale = 1.4;
    } else if (nextEvent && SET_PIECE_TYPES.has(nextEvent.type) && minutesUntilNext <= 0.5) {
      const isMySetPiece = nextEvent.team === myTeam;
      if (nextEvent.type === "corner") {
        const cornerX = isMySetPiece ? attackDir * (FIELD_WIDTH / 2 - 1) : -attackDir * (FIELD_WIDTH / 2 - 1);
        const cornerZ = playerIndex % 2 === 0 ? -FIELD_DEPTH / 2 + 1 : FIELD_DEPTH / 2 - 1;
        xBias = (cornerX - homeX) * 0.3;
        zBias = (cornerZ - homeZ) * 0.3;
      } else if (nextEvent.type === "throw_in") {
        const sideZ = playerIndex % 2 === 0 ? -FIELD_DEPTH / 2 + 0.5 : FIELD_DEPTH / 2 - 0.5;
        zBias = (sideZ - homeZ) * 0.2;
      }
      driftScale = 0.4;
    } else if (nextEvent?.type === "offside" && minutesUntilNext <= 0.3) {
      if (nextEvent.team === myTeam) {
        xBias = attackDir * 1.5;
        driftScale = 0.2;
        speedScale = 0.3;
      }
    }

    // --- LOOK-BACK: reactions to events that just happened ---

    else if (lastEvent && GOAL_TYPES.has(lastEvent.type) && minutesSinceEvent <= 2) {
      const isMyTeamGoal = lastEvent.team === myTeam;
      if (isMyTeamGoal) {
        xBias = attackDir * (isGoalkeeper ? 0.5 : 2.5);
        zBias = (centerZ - homeZ) * 0.5;
        driftScale = 0.3;
        bobScale = 3;
        celebrating = true;
      } else {
        xBias = -attackDir * 1.0;
        driftScale = 0.5;
      }
    } else if (lastEvent?.type === "own_goal" && minutesSinceEvent <= 2) {
      const isMyOwnGoal = lastEvent.team === myTeam;
      if (isMyOwnGoal) {
        driftScale = 0.3;
        bobScale = 0.5;
      } else {
        bobScale = 2;
        celebrating = true;
        driftScale = 0.4;
      }
    } else if (lastEvent?.type === "penalty_miss" && minutesSinceEvent <= 1) {
      const isMine = lastEvent.team === myTeam;
      if (isMine) {
        driftScale = 0.4;
        bobScale = 0.5;
      } else {
        bobScale = 2;
        celebrating = true;
      }
    } else if (lastEvent && SHOT_TYPES.has(lastEvent.type) && minutesSinceEvent <= 0.5) {
      if (lastEvent.type === "shot_blocked") {
        if (lastEvent.team !== myTeam && !isGoalkeeper) {
          xBias = -attackDir * 0.4;
        }
      }
      driftScale = 0.7;
    } else if (lastEvent?.type === "save" && minutesSinceEvent <= 0.5) {
      if (isGoalkeeper && lastEvent.team !== myTeam) {
        driftScale = 0.2;
        bobScale = 2;
      } else {
        driftScale = 0.6;
      }
    } else if (lastEvent?.type === "goalkeeper_claim" && minutesSinceEvent <= 0.5) {
      driftScale = 0.5;
      speedScale = 0.6;
    } else if (lastEvent && CARD_TYPES.has(lastEvent.type) && minutesSinceEvent <= 2) {
      xBias = (centerX - homeX) * 0.2;
      zBias = (centerZ - homeZ) * 0.3;
      driftScale = 0.3;
      if (lastEvent.type === "red_card") {
        driftScale = 0.2;
      }
    } else if (lastEvent?.type === "foul" && minutesSinceEvent <= 0.5) {
      xBias = (centerX - homeX) * 0.1;
      zBias = (centerZ - homeZ) * 0.15;
      driftScale = 0.4;
    } else if (lastEvent?.type === "offside" && minutesSinceEvent <= 0.5) {
      if (lastEvent.team === myTeam) {
        speedScale = 0.2;
        driftScale = 0.3;
      }
    } else if (lastEvent && (lastEvent.type === "tackle_won" || lastEvent.type === "tackle_lost") && minutesSinceEvent <= 0.3) {
      driftScale = 0.6;
      speedScale = 1.2;
    } else if (lastEvent?.type === "interception" && minutesSinceEvent <= 0.3) {
      if (lastEvent.team === myTeam) {
        speedScale = 1.3;
      } else {
        speedScale = 0.8;
      }
    } else if (lastEvent?.type === "clearance" && minutesSinceEvent <= 0.3) {
      if (lastEvent.team === myTeam) {
        xBias = -attackDir * 0.5;
      }
      driftScale = 0.7;
    } else if (lastEvent && SET_PIECE_TYPES.has(lastEvent.type) && minutesSinceEvent <= 0.5) {
      driftScale = 0.4;
    } else if (lastEvent?.type === "substitution" && minutesSinceEvent <= 1) {
      driftScale = 0.6;
    }

    let dx: number;
    let dz: number;
    if (isGoalkeeper) {
      dx = Math.sin(t * 0.4 + seed.phaseX) * 0.15 * driftScale;
      dz = Math.cos(t * 0.5 + seed.phaseZ) * 1.2 * driftScale;
      xBias *= 0.1;
      zBias = 0;
    } else {
      dx = Math.sin(t * seed.speedX * speedScale + seed.phaseX) * seed.rangeX * driftScale;
      dz = Math.cos(t * seed.speedZ * speedScale + seed.phaseZ) * seed.rangeZ * driftScale;
    }

    let finalX = homeX + xBias + dx;
    let finalZ = homeZ + zBias + dz;

    // Separation: push away from nearby players.
    if (allPositions) {
      const MIN_DIST = 0.45;
      const positions = allPositions.current;
      for (let i = 0; i < positions.length; i++) {
        if (i === playerIndex) continue;
        const other = positions[i];
        const sepX = finalX - other.x;
        const sepZ = finalZ - other.z;
        const dist = Math.sqrt(sepX * sepX + sepZ * sepZ);
        if (dist < MIN_DIST && dist > 0.001) {
          const push = (MIN_DIST - dist) / MIN_DIST * 0.6;
          finalX += (sepX / dist) * push;
          finalZ += (sepZ / dist) * push;
        }
      }
      positions[playerIndex] = { x: finalX, z: finalZ };
    }

    g.position.x = finalX;
    g.position.z = finalZ;

    const bob = Math.abs(Math.sin(t * (celebrating ? 8 : 4) + seed.phaseX)) * 0.015 * bobScale;
    g.position.y = PITCH_SURFACE_Y + bob;

    if (celebrating || isGoalkeeper) {
      g.rotation.y = baseFacing;
    } else {
      const vx =
        Math.cos(t * seed.speedX * speedScale + seed.phaseX) * seed.speedX * seed.rangeX;
      const vz =
        -Math.sin(t * seed.speedZ * speedScale + seed.phaseZ) * seed.speedZ * seed.rangeZ;
      g.rotation.y = Math.atan2(vx, vz);
    }
  });

  return (
    <group
      ref={setGroupRef}
      position={[homeX, PITCH_SURFACE_Y, homeZ]}
      onClick={(e) => {
        e.stopPropagation();
        onPlayerClick?.();
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <SoccerPlayerModel
        profile={profile}
        isLive={isLive}
        motionSeed={playerIndex}
        isGoalkeeper={isGoalkeeper}
        shirtColor={shirtColor}
        shirtNumber={shirtNumber}
      />
    </group>
  );
}

function AnimatedBall({
  centerX,
  centerZ,
  isLive,
  events,
  allPositions,
}: {
  centerX: number;
  centerZ: number;
  isLive: boolean;
  events: ClawFCMatchEvent[];
  allPositions?: React.MutableRefObject<{ x: number; z: number }[]>;
}) {
  const groupRef = useRef<Group>(null);
  const ballPos = useRef({ x: centerX, z: centerZ });
  const targetPlayer = useRef(0);
  const lastKickTime = useRef(0);
  const kickVelX = useRef(0);
  const kickVelZ = useRef(0);
  const inFlight = useRef(false);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.minute - b.minute),
    [events],
  );

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g || !isLive) return;

    const t = clock.getElapsedTime();
    const matchMinute = getMatchMinute(t);
    const dt = 1 / 60;

    const pastEvents = sortedEvents.filter((e) => e.minute <= matchMinute);
    const lastEvent = pastEvents[pastEvents.length - 1];
    const minutesSince = lastEvent ? matchMinute - lastEvent.minute : 99;
    const nextEvent = sortedEvents.find((e) => e.minute > matchMinute);
    const minutesUntilNext = nextEvent ? nextEvent.minute - matchMinute : 99;

    const GOAL_TYPES = new Set(["goal", "penalty_goal"]);
    const goalSide = (team: string | undefined) =>
      team === "home" ? FIELD_WIDTH / 2 - 0.5 : -(FIELD_WIDTH / 2 - 0.5);

    const positions = allPositions?.current;
    let targetX = ballPos.current.x;
    let targetZ = ballPos.current.z;
    let speed = 1.2;
    let bounce = Math.abs(Math.sin(t * 3)) * 0.02;
    let spinSpeed = 1;
    let eventOverride = false;

    // --- Event-driven overrides (goals, shots, set pieces) ---
    // When the event has real position data from the engine, use it.

    const evtPos = (evt: ClawFCMatchEvent | undefined) =>
      evt?.position ? enginePosToField(evt.position, centerX, centerZ) : null;

    if (lastEvent && GOAL_TYPES.has(lastEvent.type) && minutesSince <= 1) {
      const p = evtPos(lastEvent);
      targetX = p ? p.x : centerX + goalSide(lastEvent.team);
      targetZ = p ? p.z : centerZ + Math.sin(t * 2) * 0.3;
      speed = 2.5;
      bounce = 0;
      spinSpeed = 0.2;
      eventOverride = true;
    } else if (lastEvent?.type === "own_goal" && minutesSince <= 1) {
      const ownGoalX = lastEvent.team === "home" ? -(FIELD_WIDTH / 2 - 0.5) : FIELD_WIDTH / 2 - 0.5;
      targetX = centerX + ownGoalX;
      targetZ = centerZ + Math.sin(t * 2) * 0.3;
      speed = 2;
      bounce = 0;
      spinSpeed = 0.2;
      eventOverride = true;
    } else if (lastEvent?.type === "penalty_miss" && minutesSince <= 0.5) {
      targetX = centerX + goalSide(lastEvent.team) + Math.sin(t * 4) * 2;
      targetZ = centerZ + FIELD_DEPTH / 2 * (Math.sin(t * 3) > 0 ? 1 : -1);
      speed = 3;
      bounce = 0.06;
      spinSpeed = 1.5;
      eventOverride = true;
    } else if (lastEvent?.type === "save" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      targetX = p ? p.x : centerX + ballPos.current.x * 0.3 - centerX * 0.3;
      targetZ = p ? p.z + Math.sin(t * 3) * 1 : centerZ + Math.sin(t * 3) * 2;
      speed = 1.8;
      bounce = 0.04;
      spinSpeed = 1;
      eventOverride = true;
    } else if (lastEvent?.type === "clearance" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      } else {
        const clearDir = lastEvent.team === "home" ? -1 : 1;
        targetX = centerX + clearDir * FIELD_WIDTH / 3;
        targetZ = centerZ + Math.sin(t * 2) * 2;
      }
      speed = 2.5;
      bounce = 0.05;
      spinSpeed = 1.2;
      eventOverride = true;
    } else if (lastEvent?.type === "offside" && minutesSince <= 0.5) {
      const p = evtPos(lastEvent);
      targetX = p ? p.x : centerX;
      targetZ = p ? p.z : centerZ;
      speed = 0.8;
      bounce = 0;
      spinSpeed = 0.2;
      eventOverride = true;
    } else if (lastEvent?.type === "corner" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      } else {
        targetX = centerX + goalSide(lastEvent.team);
        targetZ = centerZ + (Math.sin(t) > 0 ? -1 : 1) * (FIELD_DEPTH / 2 - 0.3);
      }
      speed = 1;
      bounce = 0;
      spinSpeed = 0.3;
      eventOverride = true;
    } else if (lastEvent?.type === "free_kick" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      }
      speed = 0.5;
      bounce = 0;
      spinSpeed = 0.2;
      eventOverride = true;
    } else if (lastEvent?.type === "throw_in" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      } else {
        targetZ = centerZ + (Math.sin(t) > 0 ? 1 : -1) * (FIELD_DEPTH / 2 - 0.3);
      }
      speed = 1.5;
      bounce = 0.03;
      spinSpeed = 0.8;
      eventOverride = true;
    } else if (lastEvent && (lastEvent.type === "shot_on_target" || lastEvent.type === "shot_off_target" || lastEvent.type === "shot_blocked") && minutesSince <= 0.5) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      } else {
        targetX = centerX + goalSide(lastEvent.team);
        targetZ = centerZ + Math.sin(t * 2) * 0.5;
      }
      speed = lastEvent.type === "shot_blocked" ? 1.5 : 2.2;
      bounce = lastEvent.type === "shot_off_target" ? 0.04 : 0;
      spinSpeed = 1.5;
      eventOverride = true;
    } else if (lastEvent && (lastEvent.type === "tackle_won" || lastEvent.type === "tackle_lost" || lastEvent.type === "interception") && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      }
      speed = 1;
      bounce = 0.02;
      spinSpeed = 0.8;
      eventOverride = true;
    } else if (lastEvent?.type === "foul" && minutesSince <= 0.3) {
      const p = evtPos(lastEvent);
      if (p) {
        targetX = p.x;
        targetZ = p.z;
      }
      speed = 0.5;
      bounce = 0;
      spinSpeed = 0.2;
      eventOverride = true;
    }

    // Buildup toward goal: ball drifts forward in attacking half.
    if (!eventOverride && nextEvent && GOAL_TYPES.has(nextEvent.type) && minutesUntilNext <= 3) {
      const urgency = 1 - minutesUntilNext / 3;
      const goalX = centerX + goalSide(nextEvent.team);
      targetX = ballPos.current.x * (1 - urgency * 0.3) + goalX * urgency * 0.3;
      targetZ = ballPos.current.z * (1 - urgency * 0.2) + centerZ * urgency * 0.2;
      speed = 1 + urgency * 1.5;
    }

    // Use real pass destination when available from engine data.
    const activePassTarget = (() => {
      if (!lastEvent) return null;
      if (minutesSince > 0.3) return null;
      if (
        (lastEvent.type === "pass_completed" || lastEvent.type === "pass_incomplete") &&
        lastEvent.toPosition
      ) {
        return enginePosToField(lastEvent.toPosition, centerX, centerZ);
      }
      return null;
    })();

    // --- Player-to-player passing (default when no event override) ---

    if (!eventOverride && positions && positions.length > 0 && t > 0.5) {
      const kickInterval = 4.5 + Math.sin(t * 0.3) * 1.5;

      if (t - lastKickTime.current > kickInterval || !inFlight.current) {
        const oldTarget = targetPlayer.current;
        let newTarget = Math.floor(Math.abs(Math.sin(t * 3.7 + oldTarget)) * positions.length) % positions.length;
        if (newTarget === oldTarget) newTarget = (newTarget + 1) % positions.length;
        targetPlayer.current = newTarget;

        const dest = activePassTarget;
        const tp = dest ?? positions[newTarget];
        const dx = tp.x - ballPos.current.x;
        const dz = tp.z - ballPos.current.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        kickVelX.current = (dx / dist) * speed;
        kickVelZ.current = (dz / dist) * speed;
        inFlight.current = true;
        lastKickTime.current = t;
      }

      const dest = activePassTarget;
      const tp = dest ?? positions[targetPlayer.current];
      if (tp) {
        const dx = tp.x - ballPos.current.x;
        const dz = tp.z - ballPos.current.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.4) {
          inFlight.current = false;
          bounce = 0;
        }

        ballPos.current.x += kickVelX.current * dt;
        ballPos.current.z += kickVelZ.current * dt;

        kickVelX.current += (dx * 0.25 - kickVelX.current * 0.15) * dt;
        kickVelZ.current += (dz * 0.25 - kickVelZ.current * 0.15) * dt;
      }
    } else if (eventOverride) {
      ballPos.current.x += (targetX - ballPos.current.x) * speed * dt * 0.08;
      ballPos.current.z += (targetZ - ballPos.current.z) * speed * dt * 0.08;
      inFlight.current = false;
    }

    // Clamp ball to field bounds.
    const halfW = FIELD_WIDTH / 2 + 0.5;
    const halfD = FIELD_DEPTH / 2 + 0.5;
    ballPos.current.x = Math.max(centerX - halfW, Math.min(centerX + halfW, ballPos.current.x));
    ballPos.current.z = Math.max(centerZ - halfD, Math.min(centerZ + halfD, ballPos.current.z));

    g.position.x = ballPos.current.x;
    g.position.z = ballPos.current.z;
    g.position.y = 0.08 + bounce;
    g.rotation.x = t * 3 * spinSpeed;
    g.rotation.z = t * 2 * spinSpeed;
  });

  return (
    <group
      ref={groupRef}
      position={[centerX + 0.28, 0.08, centerZ + 0.04]}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.46}
          metalness={0.05}
        />
      </mesh>
      <mesh>
        <torusGeometry args={[0.082, 0.012, 8, 10]} />
        <meshStandardMaterial
          color="#111827"
          roughness={0.65}
          metalness={0.04}
        />
      </mesh>
    </group>
  );
}

export function SoccerMatchDebugCard() {
  const { matchContext } = useClawFC();
  const events = matchContext?.match.events ?? [];
  const matchStatus = matchContext?.match.status;
  const isLive =
    matchStatus === "live" ||
    matchStatus === "played" ||
    matchStatus === "finished";
  const homeClubName = matchContext?.homeClub.name ?? "Home";
  const awayClubName = matchContext?.awayClub.name ?? "Away";
  const [minute, setMinute] = useState(1);
  const [phase, setPhase] = useState("kickoff");
  const [collapsed, setCollapsed] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.minute - b.minute),
    [events],
  );

  useEffect(() => {
    if (!isLive) return;
    if (!startTimeRef.current) startTimeRef.current = Date.now();
    const start = startTimeRef.current;

    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const m = getMatchMinute(elapsed);
      setMinute(m);

      const past = sortedEvents.filter((e) => e.minute <= m);
      const last = past[past.length - 1];
      const minutesSince = last ? m - last.minute : 99;

      const next = sortedEvents.find((e) => e.minute > m);
      const minutesUntil = next ? next.minute - m : 99;

      const GOAL_TYPES = new Set(["goal", "penalty_goal"]);
      const SHOT_TYPES = new Set(["shot_on_target", "shot_off_target", "shot_blocked"]);
      const CARD_TYPES = new Set(["yellow_card", "red_card"]);
      const SET_PIECE_TYPES = new Set(["corner", "free_kick", "throw_in"]);

      if (next && GOAL_TYPES.has(next.type) && minutesUntil <= 3) {
        setPhase(`buildup \u2192 ${next.type} (${next.team}, ${Math.ceil(minutesUntil)}m)`);
      } else if (next?.type === "own_goal" && minutesUntil <= 2) {
        setPhase(`panic \u2192 own_goal (${next.team}, ${Math.ceil(minutesUntil)}m)`);
      } else if (next?.type === "penalty_miss" && minutesUntil <= 1) {
        setPhase(`tension \u2192 penalty`);
      } else if (next && SHOT_TYPES.has(next.type) && minutesUntil <= 0.5) {
        setPhase(`attack \u2192 ${next.type}`);
      } else if (next && CARD_TYPES.has(next.type) && minutesUntil <= 1) {
        setPhase(`tension \u2192 ${next.type}`);
      } else if (next?.type === "foul" && minutesUntil <= 0.5) {
        setPhase("tension \u2192 foul");
      } else if (next && SET_PIECE_TYPES.has(next.type) && minutesUntil <= 0.5) {
        setPhase(`setup \u2192 ${next.type}`);
      } else if (next?.type === "offside" && minutesUntil <= 0.3) {
        setPhase("offside trap");
      } else if (last && GOAL_TYPES.has(last.type) && minutesSince <= 2) {
        setPhase(`celebration (${last.team} ${last.type})`);
      } else if (last?.type === "own_goal" && minutesSince <= 2) {
        setPhase(`own goal (${last.team})`);
      } else if (last?.type === "penalty_miss" && minutesSince <= 1) {
        setPhase("penalty missed!");
      } else if (last && SHOT_TYPES.has(last.type) && minutesSince <= 0.5) {
        setPhase(last.type.replace(/_/g, " "));
      } else if (last?.type === "save" && minutesSince <= 0.5) {
        setPhase("save!");
      } else if (last?.type === "goalkeeper_claim" && minutesSince <= 0.5) {
        setPhase("keeper claims");
      } else if (last && CARD_TYPES.has(last.type) && minutesSince <= 2) {
        setPhase(`reacting (${last.type})`);
      } else if (last?.type === "foul" && minutesSince <= 0.5) {
        setPhase("foul");
      } else if (last?.type === "offside" && minutesSince <= 0.5) {
        setPhase("offside");
      } else if (last && (last.type === "tackle_won" || last.type === "tackle_lost") && minutesSince <= 0.3) {
        setPhase(last.type.replace(/_/g, " "));
      } else if (last?.type === "interception" && minutesSince <= 0.3) {
        setPhase("interception");
      } else if (last?.type === "clearance" && minutesSince <= 0.3) {
        setPhase("clearance");
      } else if (last && SET_PIECE_TYPES.has(last.type) && minutesSince <= 0.5) {
        setPhase(last.type.replace(/_/g, " "));
      } else if (last?.type === "substitution" && minutesSince <= 1) {
        setPhase("substitution");
      } else {
        setPhase(m <= 45 ? "open_play (1st)" : "open_play (2nd)");
      }
    }, 500);
    return () => clearInterval(id);
  }, [isLive, sortedEvents]);

  if (!isLive) return null;

  const panelWidth = 280;

  return (
    <div
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
      }}
    >
      {/* Toggle tab on the left edge. */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Show debug panel" : "Hide debug panel"}
        style={{
          alignSelf: "flex-start",
          marginTop: 8,
          width: 24,
          height: 64,
          background: "rgba(0, 0, 0, 0.85)",
          border: "1px solid rgba(251, 191, 36, 0.3)",
          borderRight: collapsed ? "1px solid rgba(251, 191, 36, 0.3)" : "none",
          borderRadius: "6px 0 0 6px",
          color: "#fbbf24",
          fontSize: 14,
          cursor: "pointer",
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          flexShrink: 0,
        }}
      >
        {collapsed ? "\u25B6" : "\u25C0"}
      </button>

      {!collapsed ? (
        <div
          style={{
            width: panelWidth,
            maxHeight: "calc(100vh - 220px)",
            background: "rgba(0, 0, 0, 0.92)",
            color: "#f8fafc",
            fontFamily: "monospace",
            fontSize: 11,
            padding: 14,
            borderLeft: "1px solid rgba(251, 191, 36, 0.25)",
            borderBottom: "1px solid rgba(251, 191, 36, 0.25)",
            borderRadius: "0 0 0 8px",
            pointerEvents: "auto",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {/* Header. */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              borderBottom: "1px solid rgba(251, 191, 36, 0.2)",
              paddingBottom: 8,
            }}
          >
            <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 12 }}>
              DEBUG: Match Sim
            </span>
            <span style={{ color: isLive ? "#22c55e" : "#64748b", fontSize: 10 }}>
              {isLive ? "\u25CF LIVE" : "\u25CB IDLE"}
            </span>
          </div>

          {/* Clock. */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <div>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
                {minute}&apos;
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "#94a3b8",
                  marginLeft: 8,
                  textTransform: "uppercase",
                }}
              >
                {minute <= 45 ? "1st Half" : "2nd Half"}
              </span>
            </div>
            <div
              style={{
                fontSize: 9,
                color: "#a78bfa",
                background: "rgba(167, 139, 250, 0.1)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {phase}
            </div>
          </div>

          {/* Teams. */}
          <div
            style={{
              fontSize: 10,
              color: "#94a3b8",
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>{homeClubName}</span>
            <span>vs</span>
            <span>{awayClubName}</span>
          </div>

          {/* Progress bar. */}
          <div
            style={{
              height: 4,
              background: "rgba(71, 85, 105, 0.4)",
              borderRadius: 2,
              marginBottom: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(minute / 90) * 100}%`,
                height: "100%",
                background: "#fbbf24",
                borderRadius: 2,
                transition: "width 0.5s ease",
              }}
            />
          </div>

          {/* Timeline header. */}
          <div
            style={{
              color: "#64748b",
              fontSize: 9,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Event Timeline ({sortedEvents.length} events)
          </div>

          {/* Events. */}
          {sortedEvents.map((event, i) => {
            const isActive = Math.abs(event.minute - minute) <= 1;
            const isPast = event.minute < minute - 1;
            const minsAhead = event.minute - minute;
            const BUILDUP_EVENTS = new Set(["goal", "penalty_goal", "own_goal"]);
            const TENSION_EVENTS = new Set(["yellow_card", "red_card", "foul", "penalty_miss"]);
            const ATTACK_EVENTS = new Set(["shot_on_target", "shot_off_target", "shot_blocked"]);
            const isBuildingUp =
              !isPast &&
              !isActive &&
              BUILDUP_EVENTS.has(event.type) &&
              minsAhead <= 3 &&
              minsAhead > 1;
            const isTensionUp =
              !isPast &&
              !isActive &&
              TENSION_EVENTS.has(event.type) &&
              minsAhead <= 1 &&
              minsAhead > 0;
            const isAttacking =
              !isPast &&
              !isActive &&
              ATTACK_EVENTS.has(event.type) &&
              minsAhead <= 0.5 &&
              minsAhead > 0;
            return (
              <div
                key={`debug-evt-${i}`}
                style={{
                  padding: "5px 8px",
                  background: isActive
                    ? "rgba(251, 191, 36, 0.15)"
                    : isBuildingUp
                      ? "rgba(239, 68, 68, 0.1)"
                      : isTensionUp
                        ? "rgba(249, 115, 22, 0.1)"
                        : isAttacking
                          ? "rgba(59, 130, 246, 0.1)"
                          : "transparent",
                  borderLeft: isActive
                    ? "2px solid #fbbf24"
                    : isBuildingUp
                      ? "2px solid #ef4444"
                      : isTensionUp
                        ? "2px solid #f97316"
                        : isAttacking
                          ? "2px solid #3b82f6"
                          : isPast
                            ? "2px solid rgba(71, 85, 105, 0.4)"
                            : "2px solid rgba(71, 85, 105, 0.15)",
                  marginBottom: 2,
                  borderRadius: 2,
                  opacity: isPast && !isActive ? 0.5 : 1,
                  transition: "all 0.3s",
                }}
              >
                <span style={{ color: "#94a3b8", marginRight: 8, minWidth: 24, display: "inline-block" }}>
                  {event.minute}&apos;
                </span>
                <span style={{ marginRight: 6 }}>
                  {EVENT_ICON[event.type] ?? "\u2022"}
                </span>
                <span style={{ color: isActive ? "#fbbf24" : isBuildingUp ? "#ef4444" : "#e2e8f0" }}>
                  {event.scorer_name ?? event.player ?? "Unknown"}
                </span>
                <span style={{ color: "#64748b", marginLeft: 6, fontSize: 9 }}>
                  {event.team === "home" ? homeClubName : awayClubName}
                </span>
                {isBuildingUp ? (
                  <span style={{ color: "#ef4444", marginLeft: 6, fontSize: 8, fontWeight: 700 }}>
                    BUILDUP
                  </span>
                ) : null}
                {isTensionUp ? (
                  <span style={{ color: "#f97316", marginLeft: 6, fontSize: 8, fontWeight: 700 }}>
                    TENSION
                  </span>
                ) : null}
                {isAttacking ? (
                  <span style={{ color: "#3b82f6", marginLeft: 6, fontSize: 8, fontWeight: 700 }}>
                    ATTACK
                  </span>
                ) : null}
              </div>
            );
          })}

          {sortedEvents.length === 0 && (
            <div style={{ color: "#64748b", textAlign: "center", padding: 12, fontSize: 10 }}>
              No events in match data.
            </div>
          )}

          {/* Raw JSON console. */}
          <div style={{ marginTop: 10, borderTop: "1px solid rgba(71, 85, 105, 0.3)", paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => setRawOpen((o) => !o)}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                fontSize: 9,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 8 }}>{rawOpen ? "\u25BC" : "\u25B6"}</span>
              Raw Supabase JSON
            </button>
            {rawOpen ? (
              <pre
                style={{
                  marginTop: 6,
                  padding: 8,
                  background: "rgba(15, 23, 42, 0.8)",
                  borderRadius: 4,
                  border: "1px solid rgba(71, 85, 105, 0.3)",
                  fontSize: 9,
                  lineHeight: 1.5,
                  color: "#94a3b8",
                  overflowX: "auto",
                  maxHeight: 300,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(sortedEvents, null, 2)}
              </pre>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: "1px solid rgba(71, 85, 105, 0.3)",
              fontSize: 9,
              color: "#64748b",
            }}
          >
            1 match min = 1 real min &middot; 90 min total
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerFirstPersonCam({
  playerRef,
  onExit,
}: {
  playerRef: React.RefObject<Group | null>;
  onExit: () => void;
}) {
  const { camera, set, size } = useThree();
  const fpCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const originalCamRef = useRef<THREE.Camera>(camera);
  const smoothPos = useRef(new THREE.Vector3());
  const smoothLookAt = useRef(new THREE.Vector3());

  useEffect(() => {
    originalCamRef.current = camera;
  }, [camera]);

  useEffect(() => {
    if (!fpCamRef.current) {
      fpCamRef.current = new THREE.PerspectiveCamera(
        75,
        size.width / size.height,
        0.01,
        200,
      );
    }

    const g = playerRef.current;
    if (g) {
      const pos = g.position;
      smoothPos.current.set(pos.x, pos.y + 0.55, pos.z);
      fpCamRef.current.position.copy(smoothPos.current);
    }

    set({ camera: fpCamRef.current });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      set({ camera: originalCamRef.current });
    };
  }, [onExit, playerRef, set, size]);

  useFrame(() => {
    const g = playerRef.current;
    const cam = fpCamRef.current;
    if (!g || !cam) return;

    const eyeY = g.position.y + 0.55;
    const targetPos = new THREE.Vector3(g.position.x, eyeY, g.position.z);
    smoothPos.current.lerp(targetPos, 0.12);
    cam.position.copy(smoothPos.current);

    const facing = g.rotation.y;
    const lookTarget = new THREE.Vector3(
      smoothPos.current.x + Math.sin(facing) * 5,
      eyeY - 0.08,
      smoothPos.current.z + Math.cos(facing) * 5,
    );
    smoothLookAt.current.lerp(lookTarget, 0.1);
    cam.lookAt(smoothLookAt.current);

    cam.aspect = size.width / size.height;
    cam.updateProjectionMatrix();
  });

  return (
    <Html center zIndexRange={[200, 0]} position={[0, 0, 0]}>
      <div
        style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0, 0, 0, 0.75)",
          color: "#fbbf24",
          fontFamily: "monospace",
          fontSize: 13,
          padding: "8px 20px",
          borderRadius: 8,
          border: "1px solid rgba(251, 191, 36, 0.3)",
          pointerEvents: "auto",
          cursor: "pointer",
          userSelect: "none",
          zIndex: 9999,
          whiteSpace: "nowrap",
        }}
        onClick={onExit}
      >
        PLAYER VIEW — Press <span style={{ color: "#f8fafc", fontWeight: 700 }}>ESC</span> or click here to exit
      </div>
    </Html>
  );
}

function GoalFrame({
  position,
  rotY = 0,
}: {
  position: [number, number, number];
  rotY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh
        position={[-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, 0]}
        castShadow
      >
        <boxGeometry args={[0.06, GOAL_HEIGHT, 0.06]} />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.7}
          metalness={0.14}
        />
      </mesh>
      <mesh
        position={[GOAL_WIDTH / 2, GOAL_HEIGHT / 2, 0]}
        castShadow
      >
        <boxGeometry args={[0.06, GOAL_HEIGHT, 0.06]} />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.7}
          metalness={0.14}
        />
      </mesh>
      <mesh position={[0, GOAL_HEIGHT, 0]} castShadow>
        <boxGeometry args={[GOAL_WIDTH + 0.06, 0.06, 0.06]} />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.7}
          metalness={0.14}
        />
      </mesh>
      <mesh
        position={[0, GOAL_HEIGHT * 0.45, -GOAL_NET_DEPTH]}
        receiveShadow
      >
        <boxGeometry
          args={[GOAL_WIDTH - 0.08, GOAL_HEIGHT * 0.9, 0.02]}
        />
        <meshStandardMaterial
          color="#dbeafe"
          transparent
          opacity={0.24}
          roughness={0.95}
        />
      </mesh>
      <mesh
        position={[
          -GOAL_WIDTH / 2 + 0.03,
          GOAL_HEIGHT * 0.45,
          -GOAL_NET_DEPTH / 2,
        ]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <boxGeometry
          args={[GOAL_NET_DEPTH, GOAL_HEIGHT * 0.9, 0.02]}
        />
        <meshStandardMaterial
          color="#dbeafe"
          transparent
          opacity={0.18}
          roughness={0.95}
        />
      </mesh>
      <mesh
        position={[
          GOAL_WIDTH / 2 - 0.03,
          GOAL_HEIGHT * 0.45,
          -GOAL_NET_DEPTH / 2,
        ]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <boxGeometry
          args={[GOAL_NET_DEPTH, GOAL_HEIGHT * 0.9, 0.02]}
        />
        <meshStandardMaterial
          color="#dbeafe"
          transparent
          opacity={0.18}
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}

function Scoreboard({
  homeClubName,
  awayClubName,
  homeGoals,
  awayGoals,
  side = "east",
}: {
  homeClubName: string;
  awayClubName: string;
  homeGoals: number;
  awayGoals: number;
  side?: "east" | "west";
}) {
  const xOffset = side === "east" ? FIELD_WIDTH / 2 + 1.28 : -(FIELD_WIDTH / 2 + 1.28);
  const rotY = side === "east" ? -Math.PI / 2 : Math.PI / 2;
  return (
    <group
      position={[xOffset, 0, 0]}
      rotation={[0, rotY, 0]}
    >
      {/* Support pole. */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.22, 2.04, 0.22]} />
        <meshStandardMaterial
          color="#475569"
          roughness={0.74}
          metalness={0.18}
        />
      </mesh>
      {/* Board body. */}
      <mesh position={[0, 2.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.42, 0.82, 0.18]} />
        <meshStandardMaterial
          color="#111827"
          roughness={0.58}
          metalness={0.22}
        />
      </mesh>
      {/* Screen background. */}
      <mesh position={[0, 2.3, 0.1]}>
        <planeGeometry args={[1.3, 0.58]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      {/* Score display. */}
      <Text
        position={[0, 2.38, 0.11]}
        fontSize={0.18}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {`${homeGoals} - ${awayGoals}`}
      </Text>
      {/* Home club name. */}
      <Text
        position={[-0.36, 2.14, 0.11]}
        fontSize={0.07}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
        maxWidth={0.6}
        font={undefined}
      >
        {homeClubName}
      </Text>
      {/* Away club name. */}
      <Text
        position={[0.36, 2.14, 0.11]}
        fontSize={0.07}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
        maxWidth={0.6}
        font={undefined}
      >
        {awayClubName}
      </Text>
    </group>
  );
}

export interface SoccerStadiumProps {
  centerX: number;
  centerZ: number;
}

export const SoccerStadium = memo(function SoccerStadium({
  centerX,
  centerZ,
}: SoccerStadiumProps) {
  const { matchContext } = useClawFC();

  const matchStatus = matchContext?.match.status;
  const isLive =
    matchStatus === "live" ||
    matchStatus === "played" ||
    matchStatus === "finished";
  const homeColor =
    matchContext?.homeClub.primary_color ?? DEFAULT_HOME_COLOR;
  const awayColor =
    matchContext?.awayClub.primary_color ?? DEFAULT_AWAY_COLOR;
  const homeClubName = matchContext?.homeClub.name ?? "Home";
  const awayClubName = matchContext?.awayClub.name ?? "Away";
  const homeGoals = matchContext?.match.home_goals ?? 0;
  const awayGoals = matchContext?.match.away_goals ?? 0;
  const matchEvents: ClawFCMatchEvent[] = matchContext?.match.events ?? [];

  const sortedHomePlayers = useMemo(
    () =>
      matchContext?.homePlayers
        ? sortPlayersToFormation(matchContext.homePlayers)
        : undefined,
    [matchContext?.homePlayers],
  );
  const sortedAwayPlayers = useMemo(
    () =>
      matchContext?.awayPlayers
        ? sortPlayersToFormation(matchContext.awayPlayers)
        : undefined,
    [matchContext?.awayPlayers],
  );

  const homeProfiles = useMemo(
    () => buildTeamProfiles("home", homeColor, sortedHomePlayers),
    [homeColor, sortedHomePlayers],
  );
  const awayProfiles = useMemo(
    () => buildTeamProfiles("away", awayColor, sortedAwayPlayers),
    [awayColor, sortedAwayPlayers],
  );

  const cx = centerX;
  const cz = centerZ;

  const totalPlayers = DEFAULT_FORMATION.length * 2;
  const [fpPlayerIndex, setFpPlayerIndex] = useState<number | null>(null);
  const playerGroupRefs = useRef<(Group | null)[]>(
    new Array(totalPlayers).fill(null),
  );
  const fpPlayerRef = useRef<Group | null>(null);
  fpPlayerRef.current =
    fpPlayerIndex !== null ? playerGroupRefs.current[fpPlayerIndex] ?? null : null;

  const playerPositions = useRef<{ x: number; z: number }[]>(
    new Array(totalPlayers).fill(null).map(() => ({ x: cx, z: cz })),
  );

  const handlePlayerClick = useCallback(
    (index: number) => {
      setFpPlayerIndex((prev) => (prev === index ? null : index));
    },
    [],
  );

  const handleExitFp = useCallback(() => {
    setFpPlayerIndex(null);
  }, []);

  const makeGroupRefCallback = useCallback(
    (index: number) => (node: Group | null) => {
      playerGroupRefs.current[index] = node;
    },
    [],
  );

  return (
    <group>
      {/* Stadium base (concrete apron). */}
      <mesh
        position={[cx, 0.012, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[STADIUM_BASE_WIDTH, STADIUM_BASE_DEPTH]} />
        <meshStandardMaterial
          color="#4b5563"
          roughness={0.84}
          metalness={0.1}
        />
      </mesh>

      {/* Pitch surface. */}
      <mesh
        position={[cx, 0.016, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[FIELD_WIDTH, FIELD_DEPTH]} />
        <meshStandardMaterial
          color="#2f8f46"
          roughness={0.94}
          metalness={0.02}
        />
      </mesh>

      {/* Alternating grass stripes. */}
      {Array.from({ length: 7 }).map((_, index) => {
        const stripeX =
          cx -
          FIELD_WIDTH / 2 +
          (index + 0.5) * (FIELD_WIDTH / 7);
        return (
          <mesh
            key={`stripe-${index}`}
            position={[stripeX, 0.017, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[FIELD_WIDTH / 7, FIELD_DEPTH]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? "#3c9b50" : "#2d8442"}
            />
          </mesh>
        );
      })}

      {/* Center line. */}
      <mesh
        position={[cx, 0.018, cz]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
      >
        <planeGeometry args={[FIELD_DEPTH, 0.06]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      {/* North touchline. */}
      <mesh
        position={[cx, 0.018, cz - FIELD_DEPTH / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[FIELD_WIDTH, 0.06]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      {/* South touchline. */}
      <mesh
        position={[cx, 0.018, cz + FIELD_DEPTH / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[FIELD_WIDTH, 0.06]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      {/* West sideline. */}
      <mesh
        position={[cx - FIELD_WIDTH / 2, 0.018, cz]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
      >
        <planeGeometry args={[FIELD_DEPTH, 0.06]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      {/* East sideline. */}
      <mesh
        position={[cx + FIELD_WIDTH / 2, 0.018, cz]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
      >
        <planeGeometry args={[FIELD_DEPTH, 0.06]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>

      {/* Center circle. */}
      <mesh
        position={[cx, 0.019, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry
          args={[CENTER_CIRCLE_INNER_RADIUS, CENTER_CIRCLE_OUTER_RADIUS, 40]}
        />
        <meshBasicMaterial color="#f8fafc" side={2} />
      </mesh>
      {/* Center dot. */}
      <mesh position={[cx, 0.019, cz]}>
        <circleGeometry args={[0.07, 18]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>

      {/* Penalty boxes, goal boxes, and goal lines (mirrored). */}
      {[-1, 1].map((dir) => {
        const goalLineX = cx + dir * (FIELD_WIDTH / 2);
        const penaltyFrontX =
          cx + dir * (FIELD_WIDTH / 2 - PENALTY_BOX_DEPTH);
        const penaltySideX =
          cx + dir * (FIELD_WIDTH / 2 - PENALTY_BOX_DEPTH / 2);
        const goalBoxFrontX =
          cx + dir * (FIELD_WIDTH / 2 - GOAL_BOX_DEPTH);
        const goalBoxSideX =
          cx + dir * (FIELD_WIDTH / 2 - GOAL_BOX_DEPTH / 2);
        return (
          <group key={`boxes-${dir}`}>
            <mesh
              position={[penaltyFrontX, 0.019, cz]}
              rotation={[-Math.PI / 2, 0, dir < 0 ? 0 : Math.PI]}
            >
              <ringGeometry
                args={[
                  PENALTY_ARC_INNER_RADIUS,
                  PENALTY_ARC_OUTER_RADIUS,
                  28,
                  1,
                  -Math.PI / 2,
                  Math.PI,
                ]}
              />
              <meshBasicMaterial color="#f8fafc" side={2} />
            </mesh>
            <mesh
              position={[penaltyFrontX, 0.018, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            >
              <planeGeometry args={[PENALTY_BOX_WIDTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[penaltySideX, 0.018, cz - PENALTY_BOX_WIDTH / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[PENALTY_BOX_DEPTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[penaltySideX, 0.018, cz + PENALTY_BOX_WIDTH / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[PENALTY_BOX_DEPTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[goalBoxFrontX, 0.018, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            >
              <planeGeometry args={[GOAL_BOX_WIDTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[goalBoxSideX, 0.018, cz - GOAL_BOX_WIDTH / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[GOAL_BOX_DEPTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[goalBoxSideX, 0.018, cz + GOAL_BOX_WIDTH / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[GOAL_BOX_DEPTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh
              position={[goalLineX, 0.018, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            >
              <planeGeometry args={[GOAL_WIDTH, 0.06]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
          </group>
        );
      })}

      {/* Goals. */}
      <GoalFrame
        position={[cx - FIELD_WIDTH / 2 - 0.02, 0.02, cz]}
        rotY={Math.PI / 2}
      />
      <GoalFrame
        position={[cx + FIELD_WIDTH / 2 + 0.02, 0.02, cz]}
        rotY={-Math.PI / 2}
      />

      {/* Home team (west side, facing east). */}
      {DEFAULT_FORMATION.map((slot, index) => (
        <AnimatedPlayerOnPitch
          key={`home-${index}`}
          homeX={cx + slot.x}
          homeZ={cz + slot.z}
          centerX={cx}
          centerZ={cz}
          profile={homeProfiles[index]!}
          baseFacing={Math.PI / 2}
          isLive={isLive ?? false}
          playerIndex={index}
          isGoalkeeper={slot.goalkeeper}
          isHomeTeam
          events={matchEvents}
          onPlayerClick={() => handlePlayerClick(index)}
          groupRefCallback={makeGroupRefCallback(index)}
          allPositions={playerPositions}
          shirtColor={homeColor}
          shirtNumber={index + 1}
        />
      ))}
      {/* Away team (east side, facing west). */}
      {DEFAULT_FORMATION.map((slot, index) => {
        const globalIndex = index + DEFAULT_FORMATION.length;
        return (
          <AnimatedPlayerOnPitch
            key={`away-${index}`}
            homeX={cx - slot.x}
            homeZ={cz - slot.z}
            centerX={cx}
            centerZ={cz}
            profile={awayProfiles[index]!}
            baseFacing={-Math.PI / 2}
            isLive={isLive ?? false}
            playerIndex={globalIndex}
            isGoalkeeper={slot.goalkeeper}
            isHomeTeam={false}
            events={matchEvents}
            onPlayerClick={() => handlePlayerClick(globalIndex)}
            groupRefCallback={makeGroupRefCallback(globalIndex)}
            allPositions={playerPositions}
            shirtColor={awayColor}
            shirtNumber={index + 1}
          />
        );
      })}

      {/* Ball. */}
      <AnimatedBall centerX={cx} centerZ={cz} isLive={isLive ?? false} events={matchEvents} allPositions={playerPositions} />

      {/* Stands (north and south, tinted with club colors). */}
      {[-1, 1].map((dir) => (
        <group key={`stands-${dir}`}>
          {[0, 1, 2].map((tier) => (
            <group key={`stand-${dir}-${tier}`}>
              <mesh
                position={[
                  cx,
                  0.17 + tier * 0.09,
                  cz + dir * (FIELD_DEPTH / 2 + 0.42 + tier * 0.16),
                ]}
                castShadow
                receiveShadow
              >
                <boxGeometry
                  args={[FIELD_WIDTH - tier * 1.15, 0.08, 0.28]}
                />
                <meshStandardMaterial
                  color={dir < 0 ? homeColor : awayColor}
                  roughness={0.82}
                  metalness={0.12}
                />
              </mesh>
              <StandCrowd
                centerX={cx}
                centerZ={cz}
                dir={dir as -1 | 1}
                tier={tier}
                homeColor={homeColor}
                awayColor={awayColor}
                isLive={Boolean(isLive)}
              />
            </group>
          ))}
        </group>
      ))}

      {/* Corner floodlights. */}
      {[-1, 1].flatMap((zDir) =>
        [-1, 1].map((xDir) => {
          const lx = cx + xDir * (FIELD_WIDTH / 2 + 0.92);
          const lz = cz + zDir * (FIELD_DEPTH / 2 + 0.64);
          return (
            <group
              key={`light-${zDir}-${xDir}`}
              position={[lx, 0, lz]}
            >
              <mesh position={[0, 0.92, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.06, 1.84, 12]} />
                <meshStandardMaterial
                  color="#d1d5db"
                  roughness={0.54}
                  metalness={0.52}
                />
              </mesh>
              <mesh
                position={[0, 1.92, zDir * -0.05]}
                castShadow
              >
                <boxGeometry args={[0.42, 0.16, 0.12]} />
                <meshStandardMaterial
                  color="#fef3c7"
                  emissive="#fde68a"
                  emissiveIntensity={0.58}
                  roughness={0.36}
                  metalness={0.22}
                />
              </mesh>
            </group>
          );
        }),
      )}

      {/* Scoreboards (both ends). */}
      <Scoreboard
        homeClubName={homeClubName}
        awayClubName={awayClubName}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
        side="east"
      />
      <Scoreboard
        homeClubName={homeClubName}
        awayClubName={awayClubName}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
        side="west"
      />

      {/* First-person player camera. */}
      {fpPlayerIndex !== null && fpPlayerRef.current ? (
        <PlayerFirstPersonCam
          playerRef={fpPlayerRef}
          onExit={handleExitFp}
        />
      ) : null}

    </group>
  );
});

export { STADIUM_BASE_WIDTH as SOCCER_STADIUM_BASE_WIDTH };
export { STADIUM_BASE_DEPTH as SOCCER_STADIUM_BASE_DEPTH };
