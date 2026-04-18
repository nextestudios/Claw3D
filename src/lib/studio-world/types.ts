export type StudioWorldStyle =
  | "stylized"
  | "realistic"
  | "cinematic"
  | "low-poly";

export type StudioWorldScale = "small" | "medium" | "large";

export type StudioWorldFocus = "world" | "assets" | "animation";

export type StudioWorldBiome =
  | "creative_plaza"
  | "forest"
  | "desert"
  | "coast"
  | "neo_city"
  | "fantasy";

export type StudioWorldAnimationKind = "none" | "bob" | "spin" | "pulse";

export type StudioWorldAssetKind =
  | "platform"
  | "tower"
  | "arch"
  | "tree"
  | "rock"
  | "beacon"
  | "crate"
  | "portal";

export type StudioWorldAssetDraft = {
  id: string;
  name: string;
  kind: StudioWorldAssetKind;
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
  color: string;
  emissive?: string | null;
  animation: StudioWorldAnimationKind;
};

export type StudioWorldPalette = {
  ground: string;
  structure: string;
  prop: string;
  accent: string;
  glow: string;
  fog: string;
  sky: string;
};

export type StudioWorldDraft = {
  biome: StudioWorldBiome;
  palette: StudioWorldPalette;
  worldBounds: {
    width: number;
    depth: number;
  };
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  promptSummary: string;
  notes: string[];
  assets: StudioWorldAssetDraft[];
};

export type StudioGenerationInput = {
  name: string;
  prompt: string;
  style: StudioWorldStyle;
  scale: StudioWorldScale;
  focus: StudioWorldFocus;
  seed?: number | null;
};

export type StudioGenerationJobRecord = {
  id: string;
  provider: string;
  status: "completed";
  createdAt: string;
  finishedAt: string;
  summary: string;
  assetCount: number;
};

export type StudioProjectRecord = {
  id: string;
  name: string;
  prompt: string;
  style: StudioWorldStyle;
  scale: StudioWorldScale;
  focus: StudioWorldFocus;
  seed: number;
  createdAt: string;
  updatedAt: string;
  latestJob: StudioGenerationJobRecord;
  sceneDraft: StudioWorldDraft;
};

export type StudioProjectsStore = {
  schemaVersion: number;
  projects: StudioProjectRecord[];
};
