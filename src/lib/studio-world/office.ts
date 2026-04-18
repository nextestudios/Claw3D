import {
  createEmptyOfficeMap,
  type OfficeCollision,
  type OfficeMap,
  type OfficeMapObject,
  type OfficeZone,
} from "@/lib/office/schema";
import type { StudioProjectRecord, StudioWorldAssetDraft } from "@/lib/studio-world/types";

const WORLD_SCALE_TO_CANVAS = 28;
const HALF_PADDING = 120;

const clampRotationToQuarterTurns = (rotationY: number) =>
  (((Math.round(rotationY / (Math.PI / 2)) % 4) + 4) % 4) * 90;

const toCanvasX = (worldX: number, width: number) =>
  Math.round(width / 2 + worldX * WORLD_SCALE_TO_CANVAS);

const toCanvasY = (worldZ: number, height: number) =>
  Math.round(height / 2 + worldZ * WORLD_SCALE_TO_CANVAS);

const resolveObjectAssetId = (asset: StudioWorldAssetDraft): OfficeMapObject["assetId"] => {
  if (asset.kind === "platform") return "floor_tile";
  if (asset.kind === "tower") return "arcade_machine";
  if (asset.kind === "portal") return "tv_wall";
  if (asset.kind === "crate") return "coffee_station";
  if (asset.kind === "beacon") return "arcade_machine";
  if (asset.kind === "arch") return "meeting_table";
  if (asset.kind === "tree") return "coffee_station";
  if (asset.kind === "rock") return "desk_modern";
  return "desk_modern";
};

const resolveLayerId = (asset: StudioWorldAssetDraft): OfficeMapObject["layerId"] => {
  if (asset.kind === "platform") return "floor";
  if (asset.kind === "portal" || asset.kind === "beacon") return "decor";
  return "furniture";
};

const createCollisionForAsset = (
  asset: StudioWorldAssetDraft,
  mapWidth: number,
  mapHeight: number,
): OfficeCollision | null => {
  if (asset.kind === "platform") return null;
  const width = Math.max(20, Math.round(asset.scale[0] * WORLD_SCALE_TO_CANVAS));
  const depth = Math.max(20, Math.round(asset.scale[2] * WORLD_SCALE_TO_CANVAS));
  const cx = toCanvasX(asset.position[0], mapWidth);
  const cy = toCanvasY(asset.position[2], mapHeight);
  return {
    id: `collision_${asset.id}`,
    blocked: true,
    shape: {
      points: [
        { x: cx - width / 2, y: cy - depth / 2 },
        { x: cx + width / 2, y: cy - depth / 2 },
        { x: cx + width / 2, y: cy + depth / 2 },
        { x: cx - width / 2, y: cy + depth / 2 },
      ],
    },
  };
};

const buildObjects = (
  project: StudioProjectRecord,
  width: number,
  height: number,
): OfficeMapObject[] =>
  project.sceneDraft.assets.map((asset, index) => ({
    id: asset.id,
    assetId: resolveObjectAssetId(asset),
    layerId: resolveLayerId(asset),
    x: toCanvasX(asset.position[0], width),
    y: toCanvasY(asset.position[2], height),
    rotation: clampRotationToQuarterTurns(asset.rotationY),
    flipX: false,
    flipY: false,
    zIndex: 100 + index,
    tags: [
      "studio-generated",
      `studio-kind:${asset.kind}`,
      `studio-project:${project.id}`,
    ],
  }));

const buildZone = (project: StudioProjectRecord, width: number, height: number): OfficeZone => {
  const halfWidth = Math.round(project.sceneDraft.worldBounds.width * WORLD_SCALE_TO_CANVAS * 0.5);
  const halfDepth = Math.round(project.sceneDraft.worldBounds.depth * WORLD_SCALE_TO_CANVAS * 0.5);
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  return {
    id: "zone_studio_generated",
    type: "hallway",
    name: project.name,
    ambienceTags: [project.style, project.focus],
    shape: {
      points: [
        { x: centerX - halfWidth, y: centerY - halfDepth },
        { x: centerX + halfWidth, y: centerY - halfDepth },
        { x: centerX + halfWidth, y: centerY + halfDepth },
        { x: centerX - halfWidth, y: centerY + halfDepth },
      ],
    },
  };
};

export const buildOfficeMapFromStudioProject = (
  project: StudioProjectRecord,
  officeVersionId: string,
): OfficeMap => {
  const width =
    Math.round(project.sceneDraft.worldBounds.width * WORLD_SCALE_TO_CANVAS + HALF_PADDING * 2);
  const height =
    Math.round(project.sceneDraft.worldBounds.depth * WORLD_SCALE_TO_CANVAS + HALF_PADDING * 2);
  const map = createEmptyOfficeMap({
    workspaceId: "default",
    officeVersionId,
    width,
    height,
  });
  map.canvas.backgroundColor = project.sceneDraft.palette.sky;
  map.theme = {
    mood: project.style === "cinematic" ? "night" : project.style === "realistic" ? "focus" : "cozy",
    enableThoughtBubbles: true,
  };
  map.objects = buildObjects(project, width, height);
  map.zones = [buildZone(project, width, height)];
  map.collisions = project.sceneDraft.assets
    .map((asset) => createCollisionForAsset(asset, width, height))
    .filter((entry): entry is OfficeCollision => Boolean(entry));
  map.spawnPoints = [{ id: "spawn-main", x: Math.round(width / 2), y: Math.round(height / 2) }];
  map.lightingOverlay = {
    enabled: true,
    baseDarkness: project.style === "cinematic" ? 0.34 : 0.18,
    roomDarkness: {},
  };
  return map;
};
