import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "@/lib/clawdbot/paths";
import {
  buildStudioWorldDraft,
  resolveGenerationSeed,
} from "@/lib/studio-world/generator";
import type {
  StudioGenerationInput,
  StudioGenerationJobRecord,
  StudioProjectRecord,
  StudioProjectsStore,
} from "@/lib/studio-world/types";

const STORE_DIR = "claw3d";
const STORE_FILE = "studio-world-projects.json";
const STORE_VERSION = 1;

const ensureDirectory = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const resolveStorePath = () => {
  const stateDir = resolveStateDir();
  const dir = path.join(stateDir, STORE_DIR);
  ensureDirectory(dir);
  return path.join(dir, STORE_FILE);
};

const defaultStore = (): StudioProjectsStore => ({
  schemaVersion: STORE_VERSION,
  projects: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeStore = (value: unknown): StudioProjectsStore => {
  if (!isRecord(value)) {
    return defaultStore();
  }
  const rawProjects = Array.isArray(value.projects) ? value.projects : [];
  const projects = rawProjects
    .map((entry): StudioProjectRecord | null => {
      if (!isRecord(entry)) return null;
      if (!isRecord(entry.latestJob)) return null;
      if (!isRecord(entry.sceneDraft)) return null;
      const id = asString(entry.id).trim();
      const name = asString(entry.name).trim();
      const prompt = asString(entry.prompt).trim();
      const createdAt = asString(entry.createdAt).trim();
      const updatedAt = asString(entry.updatedAt).trim();
      if (!id || !name || !createdAt || !updatedAt) return null;
      return {
        id,
        name,
        prompt,
        style:
          entry.style === "realistic" ||
          entry.style === "cinematic" ||
          entry.style === "low-poly"
            ? entry.style
            : "stylized",
        scale:
          entry.scale === "small" || entry.scale === "large"
            ? entry.scale
            : "medium",
        focus:
          entry.focus === "assets" || entry.focus === "animation"
            ? entry.focus
            : "world",
        seed: asNumber(entry.seed, 0),
        createdAt,
        updatedAt,
        latestJob: {
          id: asString(entry.latestJob.id, "job"),
          provider: asString(entry.latestJob.provider, "clean-room-procedural"),
          status: "completed",
          createdAt: asString(entry.latestJob.createdAt, createdAt),
          finishedAt: asString(entry.latestJob.finishedAt, updatedAt),
          summary: asString(entry.latestJob.summary, ""),
          assetCount: asNumber(entry.latestJob.assetCount, 0),
        },
        sceneDraft: entry.sceneDraft as StudioProjectRecord["sceneDraft"],
      };
    })
    .filter((entry): entry is StudioProjectRecord => Boolean(entry))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    schemaVersion: STORE_VERSION,
    projects,
  };
};

const readStore = (): StudioProjectsStore => {
  const storePath = resolveStorePath();
  if (!fs.existsSync(storePath)) {
    return defaultStore();
  }
  const raw = fs.readFileSync(storePath, "utf8");
  return normalizeStore(JSON.parse(raw));
};

const writeStore = (store: StudioProjectsStore) => {
  const storePath = resolveStorePath();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "studio-world";

const createProjectId = (name: string) =>
  `${slugify(name)}-${Date.now().toString(36)}`;

const createJobId = () => `job-${Date.now().toString(36)}`;

const buildSummary = (params: {
  input: StudioGenerationInput;
  assetCount: number;
}) =>
  `${params.input.style} ${params.input.focus} draft with ${params.assetCount} assets for ${params.input.scale} scope.`;

export const listStudioProjects = () => readStore().projects;

export const getStudioProject = (projectId: string) =>
  readStore().projects.find((entry) => entry.id === projectId) ?? null;

export const createStudioProject = (input: StudioGenerationInput) => {
  const store = readStore();
  const createdAt = new Date().toISOString();
  const seed = resolveGenerationSeed(input);
  const sceneDraft = buildStudioWorldDraft(input);
  const latestJob: StudioGenerationJobRecord = {
    id: createJobId(),
    provider: "clean-room-procedural",
    status: "completed",
    createdAt,
    finishedAt: createdAt,
    summary: buildSummary({ input, assetCount: sceneDraft.assets.length }),
    assetCount: sceneDraft.assets.length,
  };
  const project: StudioProjectRecord = {
    id: createProjectId(input.name),
    name: input.name.trim() || "Untitled Studio World",
    prompt: input.prompt.trim(),
    style: input.style,
    scale: input.scale,
    focus: input.focus,
    seed,
    createdAt,
    updatedAt: createdAt,
    latestJob,
    sceneDraft,
  };
  store.projects = [project, ...store.projects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  writeStore(store);
  return project;
};

export const updateStudioProject = (
  projectId: string,
  patch: Partial<
    Pick<StudioProjectRecord, "name" | "prompt" | "style" | "scale" | "focus" | "sceneDraft">
  >,
) => {
  const store = readStore();
  const target = store.projects.find((entry) => entry.id === projectId);
  if (!target) {
    throw new Error("Studio project not found.");
  }
  if (typeof patch.name === "string") {
    target.name = patch.name.trim() || target.name;
  }
  if (typeof patch.prompt === "string") {
    target.prompt = patch.prompt.trim();
  }
  if (patch.style) {
    target.style = patch.style;
  }
  if (patch.scale) {
    target.scale = patch.scale;
  }
  if (patch.focus) {
    target.focus = patch.focus;
  }
  if (patch.sceneDraft) {
    target.sceneDraft = patch.sceneDraft;
  }
  target.updatedAt = new Date().toISOString();
  store.projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  writeStore(store);
  return target;
};

export const deleteStudioProject = (projectId: string) => {
  const store = readStore();
  const nextProjects = store.projects.filter((entry) => entry.id !== projectId);
  const deleted = nextProjects.length !== store.projects.length;
  if (deleted) {
    store.projects = nextProjects;
    writeStore(store);
  }
  return deleted;
};
