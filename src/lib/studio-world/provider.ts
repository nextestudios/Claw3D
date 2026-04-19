import type {
  StudioProjectRecord,
  StudioSourceImageRecord,
  StudioProviderAvailability,
  StudioWorldGenerationMode,
} from "@/lib/studio-world/types";

export type StudioAiProviderKind = "none" | "self_hosted";

export type StudioAiTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export type StudioAiTaskRecord = {
  id: string;
  provider: StudioAiProviderKind;
  mode: StudioWorldGenerationMode;
  status: StudioAiTaskStatus;
  progress: number;
  modelGlbUrl: string | null;
  thumbnailUrl: string | null;
  taskErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type SelfHostedCreateResponse = {
  result?: string;
};

type SelfHostedTaskResponse = {
  id?: string;
  status?: string;
  progress?: number;
  thumbnail_url?: string;
  model_urls?: {
    glb?: string;
  };
  task_error?: {
    message?: string;
  };
};

const SELF_HOSTED_API_BASE_URL = "http://127.0.0.1:3333/openapi/v1";

const isEnabled = (value: string | undefined) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const resolveStudioAiProvider = (): StudioAiProviderKind => {
  if (
    process.env.CLAW3D_STUDIO_PROVIDER_URL?.trim() ||
    isEnabled(process.env.CLAW3D_STUDIO_ENABLE_REAL_AI)
  ) {
    return "self_hosted";
  }
  return "none";
};

export const isRealStudioAiEnabled = () =>
  isEnabled(process.env.CLAW3D_STUDIO_ENABLE_REAL_AI) &&
  resolveStudioAiProvider() !== "none";

export const buildStudioAiProviderAvailability = (): StudioProviderAvailability => {
  const provider = resolveStudioAiProvider();
  if (provider === "self_hosted") {
    const enabled = isRealStudioAiEnabled();
    const providerUrl = process.env.CLAW3D_STUDIO_PROVIDER_URL?.trim() ?? "";
    return {
      provider: "self_hosted",
      available: enabled,
      configured: Boolean(providerUrl) || enabled,
      usingTestMode: false,
      message: enabled
        ? providerUrl
          ? "Self-hosted AI image-to-3D is enabled."
          : "Self-hosted AI image-to-3D is enabled using the default local worker endpoint."
        : "A self-hosted provider is configured but disabled until CLAW3D_STUDIO_ENABLE_REAL_AI is enabled.",
    };
  }
  return {
    provider: "local",
    available: false,
    configured: false,
    usingTestMode: false,
    message: "No self-hosted AI provider is configured. Studio will use local generators.",
  };
};

export const checkSelfHostedProviderHealth = async () => {
  const { baseUrl } = resolveSelfHostedProviderConfig();
  const healthUrl = new URL("/health", baseUrl);
  const response = await fetch(healthUrl, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}.`);
  }
  const body = (await response.json()) as { ok?: boolean };
  if (!body?.ok) {
    throw new Error("Health check did not return ok=true.");
  }
  return true;
};

export const getStudioAiProviderAvailability = async (): Promise<StudioProviderAvailability> => {
  const provider = resolveStudioAiProvider();
  if (provider !== "self_hosted") {
    return buildStudioAiProviderAvailability();
  }
  const baseAvailability = buildStudioAiProviderAvailability();
  try {
    await checkSelfHostedProviderHealth();
    return {
      ...baseAvailability,
      available: true,
      message: "Self-hosted AI worker is reachable and ready.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker health check failed.";
    return {
      ...baseAvailability,
      available: false,
      message: `Self-hosted AI worker is not reachable. ${message}`,
    };
  }
};

const resolveSelfHostedProviderConfig = () => {
  const baseUrl = process.env.CLAW3D_STUDIO_PROVIDER_URL?.trim() || SELF_HOSTED_API_BASE_URL;
  const apiKey = process.env.CLAW3D_STUDIO_PROVIDER_API_KEY?.trim() ?? "";
  if (!baseUrl) {
    throw new Error("CLAW3D_STUDIO_PROVIDER_URL is not configured.");
  }
  return { baseUrl, apiKey };
};

export const getDefaultSelfHostedProviderUrl = () =>
  process.env.CLAW3D_STUDIO_PROVIDER_URL?.trim() || SELF_HOSTED_API_BASE_URL;

const mapStatus = (status: string | undefined): StudioAiTaskStatus => {
  if (
    status === "PENDING" ||
    status === "IN_PROGRESS" ||
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "CANCELED"
  ) {
    return status;
  }
  return "FAILED";
};

const buildDataUri = (image: StudioSourceImageRecord) => image.dataUrl;

export const createSelfHostedImageTo3dTask = async (params: {
  sourceImages: StudioSourceImageRecord[];
  prompt: string;
  mode: StudioWorldGenerationMode;
  adapterId?: string | null;
}) => {
  const { baseUrl, apiKey } = resolveSelfHostedProviderConfig();
  const primaryImage = params.sourceImages[0];
  if (!primaryImage) {
    throw new Error("At least one source image is required.");
  }
  const payload = {
    image_url: buildDataUri(primaryImage),
    image_urls: params.sourceImages.slice(1).map((image) => ({
      image_url: buildDataUri(image),
      role: image.role ?? "detail",
    })),
    image_role: primaryImage.role ?? "front",
    model_type: params.mode === "image_mesh" ? "standard" : "lowpoly",
    ai_model: "latest",
    should_texture: true,
    enable_pbr: false,
    remove_lighting: true,
    image_enhancement: true,
    target_formats: ["glb"],
    should_remesh: params.mode === "image_mesh",
    ...(params.mode === "image_mesh"
      ? {
          topology: "triangle",
          target_polycount: 30000,
        }
      : {}),
    ...(params.prompt.trim()
      ? {
          texture_prompt: params.prompt.trim().slice(0, 600),
        }
      : {}),
    ...(params.adapterId?.trim()
      ? {
          adapter_id: params.adapterId.trim(),
        }
      : {}),
  };
  const response = await fetch(`${baseUrl}/image-to-3d`, {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const rawBody = await response.text();
  let body: SelfHostedCreateResponse = {};
  try {
    body = JSON.parse(rawBody) as SelfHostedCreateResponse;
  } catch {
    body = {};
  }
  if (!response.ok || !body.result) {
    const diagnostic = rawBody.trim() || `${response.status} ${response.statusText}`;
    throw new Error(`Failed to create self-hosted image-to-3D task. ${diagnostic}`);
  }
  return body.result;
};

export const getSelfHostedImageTo3dTask = async (
  taskId: string,
): Promise<StudioAiTaskRecord> => {
  const { baseUrl, apiKey } = resolveSelfHostedProviderConfig();
  const response = await fetch(`${baseUrl}/image-to-3d/${encodeURIComponent(taskId)}`, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    cache: "no-store",
  });
  const body = (await response.json()) as SelfHostedTaskResponse;
  if (!response.ok || !body.id) {
    throw new Error("Failed to fetch self-hosted provider task.");
  }
  const now = new Date().toISOString();
  return {
    id: body.id,
    provider: "self_hosted",
    mode: body.model_urls?.glb ? "image_mesh" : "image_avatar",
    status: mapStatus(body.status),
    progress:
      typeof body.progress === "number" && Number.isFinite(body.progress)
        ? body.progress
        : 0,
    modelGlbUrl: body.model_urls?.glb ?? null,
    thumbnailUrl: body.thumbnail_url ?? null,
    taskErrorMessage: body.task_error?.message?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
};

export const waitForSelfHostedImageTo3dTask = async (params: {
  taskId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}) => {
  const timeoutAt = Date.now() + (params.timeoutMs ?? 10 * 60_000);
  const pollIntervalMs = params.pollIntervalMs ?? 5000;
  while (Date.now() < timeoutAt) {
    const task = await getSelfHostedImageTo3dTask(params.taskId);
    if (
      task.status === "SUCCEEDED" ||
      task.status === "FAILED" ||
      task.status === "CANCELED"
    ) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Timed out waiting for self-hosted image-to-3D task.");
};

export const buildRealAiSummary = (params: {
  project: StudioProjectRecord;
  task: StudioAiTaskRecord;
}) =>
  `${params.task.provider} ${params.project.mode} task ${params.task.status.toLowerCase()} at ${params.task.progress}% progress.`;
