import type {
  StudioGenerationInput,
  StudioWorldAnimationKind,
  StudioWorldAssetDraft,
  StudioWorldAssetKind,
  StudioWorldBiome,
  StudioWorldDraft,
  StudioWorldPalette,
  StudioWorldScale,
  StudioWorldStyle,
} from "@/lib/studio-world/types";

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)] ?? items[0];

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizePrompt = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);

const STYLE_PALETTES: Record<StudioWorldStyle, StudioWorldPalette> = {
  stylized: {
    ground: "#395b4b",
    structure: "#85b6ff",
    prop: "#d6c38f",
    accent: "#ff8c61",
    glow: "#7be7ff",
    fog: "#7aa7ff",
    sky: "#14233c",
  },
  realistic: {
    ground: "#4f5e46",
    structure: "#9c9388",
    prop: "#726556",
    accent: "#d9974f",
    glow: "#efe4b8",
    fog: "#b0b7c8",
    sky: "#7893b5",
  },
  cinematic: {
    ground: "#2b3146",
    structure: "#6c78a8",
    prop: "#b38d71",
    accent: "#ff5e7a",
    glow: "#8fd9ff",
    fog: "#7568d8",
    sky: "#090d18",
  },
  "low-poly": {
    ground: "#4c6d56",
    structure: "#7bb2a6",
    prop: "#d7a36a",
    accent: "#ffcf5d",
    glow: "#fff1a3",
    fog: "#b9d8ff",
    sky: "#203247",
  },
};

const BIOME_NOTES: Record<StudioWorldBiome, string[]> = {
  creative_plaza: [
    "Central plaza layout supports showcase scenes and collaborative props.",
    "Sight lines stay open so exported assets remain easy to stage in Claw3D.",
  ],
  forest: [
    "Organic prop spacing creates a traversal loop with layered silhouettes.",
    "Trees and rocks remain modular so they can be reused as asset packs.",
  ],
  desert: [
    "Large negative space preserves readability for vehicles and hero props.",
    "Beacon accents define landmarks and work as navigation anchors.",
  ],
  coast: [
    "Shoreline composition balances broad terrain planes with landmark structures.",
    "Accent lighting suggests a path from beach props toward a hub space.",
  ],
  neo_city: [
    "Vertical massing creates skyline depth and supports cinematic camera moves.",
    "Repeated modular towers and portals form a reusable sci-fi kit.",
  ],
  fantasy: [
    "Arches and beacons imply traversal goals and magical interaction points.",
    "Pulse-driven accents help animation previews read at a glance.",
  ],
};

const scaleToBounds = (scale: StudioWorldScale) => {
  if (scale === "small") {
    return { width: 28, depth: 28, assetCount: 12 };
  }
  if (scale === "large") {
    return { width: 58, depth: 58, assetCount: 28 };
  }
  return { width: 40, depth: 40, assetCount: 18 };
};

const detectBiome = (prompt: string, style: StudioWorldStyle): StudioWorldBiome => {
  const normalized = prompt.toLowerCase();
  if (/\bforest|wood|tree|grove|nature\b/.test(normalized)) return "forest";
  if (/\bdesert|dune|sand|canyon\b/.test(normalized)) return "desert";
  if (/\bcoast|beach|ocean|harbor|shore\b/.test(normalized)) return "coast";
  if (/\bcity|cyber|neon|urban|street\b/.test(normalized)) return "neo_city";
  if (/\bfantasy|magic|ruin|temple|myth\b/.test(normalized)) return "fantasy";
  if (style === "cinematic") return "neo_city";
  return "creative_plaza";
};

const buildAssetKindSet = (
  biome: StudioWorldBiome,
  focus: StudioGenerationInput["focus"],
): StudioWorldAssetKind[] => {
  const base: StudioWorldAssetKind[] = ["platform", "arch", "crate", "beacon"];
  if (biome === "forest") base.push("tree", "rock", "tree");
  if (biome === "desert") base.push("rock", "tower", "arch");
  if (biome === "coast") base.push("rock", "portal", "platform");
  if (biome === "neo_city") base.push("tower", "portal", "tower");
  if (biome === "fantasy") base.push("arch", "portal", "beacon");
  if (focus === "assets") base.push("crate", "tree", "rock", "arch");
  if (focus === "animation") base.push("beacon", "portal", "tower");
  if (focus === "world") base.push("platform", "tower", "arch");
  return base;
};

const resolveAnimation = (
  kind: StudioWorldAssetKind,
  focus: StudioGenerationInput["focus"],
  random: () => number,
): StudioWorldAnimationKind => {
  if (focus === "animation") {
    if (kind === "portal" || kind === "beacon") return "pulse";
    return random() > 0.45 ? "bob" : "spin";
  }
  if (kind === "portal") return "spin";
  if (kind === "beacon") return "pulse";
  return random() > 0.82 ? "bob" : "none";
};

const buildAssetName = (kind: StudioWorldAssetKind, index: number) =>
  `${kind.replace(/_/g, " ")} ${index + 1}`;

const buildAssetColor = (
  kind: StudioWorldAssetKind,
  palette: StudioWorldPalette,
  random: () => number,
) => {
  if (kind === "platform" || kind === "tower" || kind === "arch") return palette.structure;
  if (kind === "portal" || kind === "beacon") return random() > 0.5 ? palette.accent : palette.glow;
  return palette.prop;
};

const buildAssetScale = (kind: StudioWorldAssetKind, random: () => number): [number, number, number] => {
  if (kind === "platform") return [3 + random() * 4, 0.6 + random() * 0.4, 3 + random() * 4];
  if (kind === "tower") return [1.2 + random() * 1.6, 4 + random() * 5, 1.2 + random() * 1.6];
  if (kind === "arch") return [2.4 + random() * 1.8, 2 + random() * 1.3, 0.8 + random() * 0.5];
  if (kind === "tree") return [0.9 + random() * 1.5, 2.8 + random() * 2.8, 0.9 + random() * 1.5];
  if (kind === "rock") return [0.8 + random() * 2.2, 0.6 + random() * 1.4, 0.8 + random() * 2.2];
  if (kind === "beacon") return [0.7 + random() * 0.6, 2 + random() * 1.4, 0.7 + random() * 0.6];
  if (kind === "portal") return [1.6 + random() * 1.2, 2.8 + random() * 1.4, 0.45 + random() * 0.35];
  return [0.9 + random() * 1.2, 0.9 + random() * 1.2, 0.9 + random() * 1.2];
};

const buildAssetPosition = (
  index: number,
  total: number,
  bounds: { width: number; depth: number },
  random: () => number,
): [number, number, number] => {
  const radius = Math.min(bounds.width, bounds.depth) * (0.16 + 0.34 * (index / Math.max(total - 1, 1)));
  const angle = index * 0.74 + random() * 0.9;
  const x = Math.cos(angle) * radius + (random() - 0.5) * 4;
  const z = Math.sin(angle) * radius + (random() - 0.5) * 4;
  return [round2(x), 0, round2(z)];
};

const buildSceneAssets = (params: {
  biome: StudioWorldBiome;
  focus: StudioGenerationInput["focus"];
  palette: StudioWorldPalette;
  bounds: { width: number; depth: number; assetCount: number };
  random: () => number;
}) => {
  const kindSet = buildAssetKindSet(params.biome, params.focus);
  const assets: StudioWorldAssetDraft[] = [];
  for (let index = 0; index < params.bounds.assetCount; index += 1) {
    const kind = pick(kindSet, params.random);
    const animation = resolveAnimation(kind, params.focus, params.random);
    const color = buildAssetColor(kind, params.palette, params.random);
    assets.push({
      id: `asset_${index + 1}`,
      name: buildAssetName(kind, index),
      kind,
      position: buildAssetPosition(index, params.bounds.assetCount, params.bounds, params.random),
      scale: buildAssetScale(kind, params.random),
      rotationY: round2(params.random() * Math.PI * 2),
      color,
      emissive:
        kind === "portal" || kind === "beacon"
          ? (params.random() > 0.5 ? params.palette.glow : params.palette.accent)
          : null,
      animation,
    });
  }
  return assets;
};

export const resolveGenerationSeed = (input: StudioGenerationInput) => {
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) {
    return Math.floor(Math.abs(input.seed));
  }
  return hashString(`${input.name}:${input.prompt}:${input.style}:${input.scale}:${input.focus}`);
};

export const buildStudioWorldDraft = (input: StudioGenerationInput): StudioWorldDraft => {
  const seed = resolveGenerationSeed(input);
  const random = createSeededRandom(seed);
  const biome = detectBiome(input.prompt, input.style);
  const bounds = scaleToBounds(input.scale);
  const palette = STYLE_PALETTES[input.style];
  const assets = buildSceneAssets({
    biome,
    focus: input.focus,
    palette,
    bounds,
    random,
  });
  const normalizedPrompt = normalizePrompt(input.prompt);
  const promptSummary = normalizedPrompt || "Untitled generated scene";
  const notes = [
    ...BIOME_NOTES[biome],
    `Primary focus: ${input.focus}.`,
    `Generated with ${input.style} styling and seed ${seed}.`,
  ];

  return {
    biome,
    palette,
    worldBounds: {
      width: bounds.width,
      depth: bounds.depth,
    },
    camera: {
      position: [bounds.width * 0.65, clamp(bounds.width * 0.7, 18, 40), bounds.depth * 0.65],
      target: [0, 0, 0],
    },
    promptSummary,
    notes,
    assets,
  };
};
