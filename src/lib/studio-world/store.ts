import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "@/lib/clawdbot/paths";
import {
  buildStudioWorldDraft,
  resolveGenerationSeed,
} from "@/lib/studio-world/generator";
import {
  buildImagePaletteFromBuffer,
  buildImageIntensitySamples,
  resolveImageSize,
} from "@/lib/studio-world/image-analysis";
import type {
  StudioGenerationInput,
  StudioGenerationJobRecord,
  StudioExternalModelRecord,
  StudioWorldGenerationProvider,
  StudioProjectRecord,
  StudioProjectsStore,
  StudioSourceImageRecord,
} from "@/lib/studio-world/types";

const STORE_DIR = "claw3d";
const STORE_FILE = "studio-world-projects.json";
const IMAGE_DIR = "studio-world-images";
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

const resolveImageDirectory = () => {
  const stateDir = resolveStateDir();
  const dir = path.join(stateDir, STORE_DIR, IMAGE_DIR);
  ensureDirectory(dir);
  return dir;
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
        mode:
          entry.mode === "image_avatar" ||
          entry.mode === "image_mesh"
            ? entry.mode
            : "text_scene",
        provider:
          entry.provider === "self_hosted" ? "self_hosted" : "local",
        createdAt,
        updatedAt,
        latestJob: {
          id: asString(entry.latestJob.id, "job"),
          provider:
            entry.latestJob.provider === "self_hosted"
              ? "self_hosted"
              : "local",
          status:
            entry.latestJob.status === "pending" ||
            entry.latestJob.status === "in_progress" ||
            entry.latestJob.status === "failed"
              ? entry.latestJob.status
              : "completed",
          createdAt: asString(entry.latestJob.createdAt, createdAt),
          finishedAt: asString(entry.latestJob.finishedAt, updatedAt),
          summary: asString(entry.latestJob.summary, ""),
          assetCount: asNumber(entry.latestJob.assetCount, 0),
          mode:
            entry.latestJob.mode === "image_avatar" ||
            entry.latestJob.mode === "image_mesh"
              ? entry.latestJob.mode
              : "text_scene",
          progress:
            typeof entry.latestJob.progress === "number" &&
            Number.isFinite(entry.latestJob.progress)
              ? entry.latestJob.progress
              : undefined,
          providerTaskId: asString(entry.latestJob.providerTaskId, "").trim() || null,
          errorMessage: asString(entry.latestJob.errorMessage, "").trim() || null,
        },
        sourceImages: Array.isArray(entry.sourceImages)
          ? entry.sourceImages.filter((image): image is StudioSourceImageRecord => {
              if (!isRecord(image)) return false;
              return (
                typeof image.id === "string" &&
                typeof image.fileName === "string" &&
                typeof image.mimeType === "string" &&
                typeof image.width === "number" &&
                typeof image.height === "number" &&
                typeof image.sizeBytes === "number" &&
                typeof image.storagePath === "string" &&
                typeof image.dataUrl === "string" &&
                Array.isArray(image.palette)
              );
            })
          : [],
        sceneDraft: entry.sceneDraft as StudioProjectRecord["sceneDraft"],
        externalModel: isRecord(entry.externalModel)
          ? ({
              provider:
                entry.externalModel.provider === "self_hosted"
                  ? "self_hosted"
                  : "local",
              taskId: asString(entry.externalModel.taskId),
              status:
                entry.externalModel.status === "pending" ||
                entry.externalModel.status === "in_progress" ||
                entry.externalModel.status === "failed"
                  ? entry.externalModel.status
                  : "completed",
              progress: asNumber(entry.externalModel.progress, 0),
              adapterId:
                entry.externalModel.adapterId === "portrait_volume" ||
                entry.externalModel.adapterId === "heightfield_relief"
                  ? entry.externalModel.adapterId
                  : null,
              glbUrl: asString(entry.externalModel.glbUrl, "").trim() || null,
              thumbnailUrl:
                asString(entry.externalModel.thumbnailUrl, "").trim() || null,
              depthPreviewUrl:
                asString(entry.externalModel.depthPreviewUrl, "").trim() || null,
              normalPreviewUrl:
                asString(entry.externalModel.normalPreviewUrl, "").trim() || null,
              width:
                typeof entry.externalModel.width === "number" &&
                Number.isFinite(entry.externalModel.width)
                  ? entry.externalModel.width
                  : null,
              height:
                typeof entry.externalModel.height === "number" &&
                Number.isFinite(entry.externalModel.height)
                  ? entry.externalModel.height
                  : null,
              palette: Array.isArray(entry.externalModel.palette)
                ? entry.externalModel.palette.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              textureUrls: Array.isArray(entry.externalModel.textureUrls)
                ? entry.externalModel.textureUrls.filter((item): item is Record<string, string> =>
                    Boolean(item && typeof item === "object" && !Array.isArray(item)),
                  )
                : [],
              errorMessage:
                asString(entry.externalModel.errorMessage, "").trim() || null,
              usingTestMode: entry.externalModel.usingTestMode === true,
            } satisfies StudioExternalModelRecord)
          : null,
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

const slugify = (value: string) => {
  const input = value.trim().toLowerCase();
  let result = "";
  let pendingDash = false;
  for (const char of input) {
    const isAlphaNumeric =
      (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAlphaNumeric) {
      if (pendingDash && result) {
        result += "-";
      }
      result += char;
      if (result.length >= 48) {
        break;
      }
      pendingDash = false;
      continue;
    }
    pendingDash = result.length > 0;
  }
  return result || "studio-world";
};

const createProjectId = (name: string) =>
  `${slugify(name)}-${Date.now().toString(36)}`;

const createJobId = () => `job-${Date.now().toString(36)}`;

const createImageId = () => `image-${Date.now().toString(36)}`;

const buildSummary = (params: {
  input: StudioGenerationInput;
  assetCount: number;
}) =>
  `${params.input.style} ${params.input.focus} draft with ${params.assetCount} assets for ${params.input.scale} scope.`;

const extFromMimeType = (mimeType: string) => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "bin";
};

export const listStudioProjects = () => readStore().projects;

export const getStudioProject = (projectId: string) =>
  readStore().projects.find((entry) => entry.id === projectId) ?? null;

export const createStudioSourceImage = (params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  role?: "front" | "side" | "back" | "detail";
}): StudioSourceImageRecord => {
  const imageId = createImageId();
  const extension = extFromMimeType(params.mimeType);
  const storagePath = path.join(resolveImageDirectory(), `${imageId}.${extension}`);
  fs.writeFileSync(storagePath, params.buffer);
  const { width, height } = resolveImageSize(params.buffer);
  const palette = buildImagePaletteFromBuffer(params.buffer);
  return {
    id: imageId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    width,
    height,
    sizeBytes: params.buffer.byteLength,
    storagePath,
    dataUrl: `data:${params.mimeType};base64,${params.buffer.toString("base64")}`,
    palette,
    intensitySamples: buildImageIntensitySamples(params.buffer),
    role: params.role,
  };
};

export const createStudioProject = (input: StudioGenerationInput) => {
  const store = readStore();
  const createdAt = new Date().toISOString();
  const seed = resolveGenerationSeed(input);
  const sceneDraft = buildStudioWorldDraft(input);
  const provider: StudioWorldGenerationProvider =
    input.provider === "self_hosted" ? "self_hosted" : "local";
  const latestJob: StudioGenerationJobRecord = {
    id: createJobId(),
    provider,
    status: "completed",
    createdAt,
    finishedAt: createdAt,
    summary: buildSummary({ input, assetCount: sceneDraft.assets.length }),
    assetCount: sceneDraft.assets.length,
    mode: sceneDraft.mode,
  };
  const project: StudioProjectRecord = {
    id: createProjectId(input.name),
    name: input.name.trim() || "Untitled Studio World",
    prompt: input.prompt.trim(),
    style: input.style,
    scale: input.scale,
    focus: input.focus,
    seed,
    mode: sceneDraft.mode,
    provider,
    createdAt,
    updatedAt: createdAt,
    latestJob,
    sourceImages: Array.isArray(input.sourceImages)
      ? input.sourceImages
      : input.sourceImage
        ? [input.sourceImage]
        : [],
    sceneDraft,
    externalModel: null,
  };
  store.projects = [project, ...store.projects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  writeStore(store);
  return project;
};

export const createStudioPendingProject = (params: {
  input: StudioGenerationInput;
  providerTaskId: string;
  usingTestMode?: boolean;
}) => {
  const store = readStore();
  const createdAt = new Date().toISOString();
  const seed = resolveGenerationSeed(params.input);
  const sceneDraft = buildStudioWorldDraft({
    ...params.input,
    sourceImage: params.input.sourceImage,
    imageMode: params.input.imageMode === "mesh" ? "mesh" : "avatar",
  });
  const mode = "image_mesh";
  const provider: StudioWorldGenerationProvider = "self_hosted";
  const latestJob: StudioGenerationJobRecord = {
    id: createJobId(),
    provider,
    status: "pending",
    createdAt,
    finishedAt: createdAt,
    summary: "Submitted self-hosted image-to-3D task.",
    assetCount: 0,
    mode,
    progress: 0,
    providerTaskId: params.providerTaskId,
    errorMessage: null,
  };
  const project: StudioProjectRecord = {
    id: createProjectId(params.input.name),
    name: params.input.name.trim() || "Untitled AI Studio World",
    prompt: params.input.prompt.trim(),
    style: params.input.style,
    scale: params.input.scale,
    focus: params.input.focus,
    seed,
    mode,
    provider,
    createdAt,
    updatedAt: createdAt,
    latestJob,
    sourceImages: Array.isArray(params.input.sourceImages)
      ? params.input.sourceImages
      : params.input.sourceImage
        ? [params.input.sourceImage]
        : [],
    sceneDraft: {
      ...sceneDraft,
      mode,
      notes: [
        `Real AI image-to-3D task submitted to ${provider}.`,
        `Provider task id: ${params.providerTaskId}.`,
      ],
    },
    externalModel: {
      provider,
      taskId: params.providerTaskId,
      status: "pending",
      progress: 0,
      adapterId: params.input.adapterId ?? "portrait_volume",
      glbUrl: null,
      thumbnailUrl: null,
      depthPreviewUrl: null,
      normalPreviewUrl: null,
      width: null,
      height: null,
      palette: [],
      textureUrls: [],
      errorMessage: null,
      usingTestMode: params.usingTestMode === true,
    },
  };
  store.projects = [project, ...store.projects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  writeStore(store);
  return project;
};

export const updateStudioProjectExternalModel = (
  projectId: string,
  externalModel: StudioExternalModelRecord,
) => {
  const store = readStore();
  const target = store.projects.find((entry) => entry.id === projectId);
  if (!target) {
    throw new Error("Studio project not found.");
  }
  target.externalModel = externalModel;
  target.provider = externalModel.provider;
  target.latestJob = {
    ...target.latestJob,
    provider: externalModel.provider,
    status:
      externalModel.status === "pending" || externalModel.status === "in_progress"
        ? externalModel.status
        : externalModel.status === "failed"
          ? "failed"
          : "completed",
    progress: externalModel.progress,
    providerTaskId: externalModel.taskId,
    errorMessage: externalModel.errorMessage ?? null,
    finishedAt: new Date().toISOString(),
    summary:
      externalModel.status === "completed"
        ? "Real AI image-to-3D task completed."
        : externalModel.status === "failed"
          ? externalModel.errorMessage ?? "Real AI image-to-3D task failed."
          : "Real AI image-to-3D task in progress.",
  };
  target.updatedAt = new Date().toISOString();
  store.projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  writeStore(store);
  return target;
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
