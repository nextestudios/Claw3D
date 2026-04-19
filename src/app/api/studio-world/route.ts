import { NextResponse } from "next/server";

import {
  createEmptyOfficeMap,
  normalizeOfficeMap,
} from "@/lib/office/schema";
import {
  publishOfficeVersion,
  saveOfficeVersion,
  upsertOffice,
} from "@/lib/office/store";
import { buildOfficeMapFromStudioProject } from "@/lib/studio-world/office";
import {
  buildRealAiSummary,
  buildStudioAiProviderAvailability,
  createSelfHostedImageTo3dTask,
  getSelfHostedImageTo3dTask,
  isRealStudioAiEnabled,
} from "@/lib/studio-world/provider";
import {
  createStudioProject,
  createStudioPendingProject,
  createStudioSourceImage,
  deleteStudioProject,
  getStudioProject,
  listStudioProjects,
  updateStudioProjectExternalModel,
} from "@/lib/studio-world/store";
import type {
  StudioGenerationInput,
  StudioProviderAvailability,
  StudioWorldFocus,
  StudioWorldGenerationProvider,
  StudioWorldScale,
  StudioWorldStyle,
} from "@/lib/studio-world/types";

export const runtime = "nodejs";

const WORKSPACE_ID = "default";
const OFFICE_ID = "studio-world";
const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parseStyle = (value: unknown): StudioWorldStyle =>
  value === "realistic" || value === "cinematic" || value === "low-poly"
    ? value
    : "stylized";

const parseScale = (value: unknown): StudioWorldScale =>
  value === "small" || value === "large" ? value : "medium";

const parseFocus = (value: unknown): StudioWorldFocus =>
  value === "assets" || value === "animation" ? value : "world";

const parseProvider = (value: unknown): StudioWorldGenerationProvider =>
  value === "self_hosted" ? "self_hosted" : "local";

const parseGenerationInput = (value: unknown): StudioGenerationInput | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name) || "Untitled Studio World";
  const prompt = asString(value.prompt);
  const parseSourceImageRecord = (candidate: unknown): StudioGenerationInput["sourceImage"] => {
    if (!isRecord(candidate)) return null;
    return {
      id: asString(candidate.id),
      fileName: asString(candidate.fileName),
      mimeType: asString(candidate.mimeType),
      width:
        typeof candidate.width === "number" && Number.isFinite(candidate.width)
          ? candidate.width
          : 0,
      height:
        typeof candidate.height === "number" && Number.isFinite(candidate.height)
          ? candidate.height
          : 0,
      sizeBytes:
        typeof candidate.sizeBytes === "number" && Number.isFinite(candidate.sizeBytes)
          ? candidate.sizeBytes
          : 0,
      storagePath: asString(candidate.storagePath),
      dataUrl: asString(candidate.dataUrl),
      palette: Array.isArray(candidate.palette)
        ? candidate.palette.filter((entry): entry is string => typeof entry === "string")
        : [],
      intensitySamples: Array.isArray(candidate.intensitySamples)
        ? candidate.intensitySamples.filter(
            (entry): entry is number => typeof entry === "number" && Number.isFinite(entry),
          )
        : [],
        role:
          candidate.role === "front" ||
          candidate.role === "side" ||
          candidate.role === "back" ||
          candidate.role === "detail"
            ? candidate.role
            : "front",
    };
  };
  const sourceImage = isRecord(value.sourceImage)
    ? parseSourceImageRecord(value.sourceImage)
    : null;
  const sourceImages = Array.isArray(value.sourceImages)
    ? value.sourceImages
        .map(parseSourceImageRecord)
        .filter((entry): entry is NonNullable<ReturnType<typeof parseSourceImageRecord>> => Boolean(entry))
    : sourceImage
      ? [sourceImage]
      : [];
  if (!prompt && sourceImages.length === 0) return null;
  const rawSeed = value.seed;
  const seed =
    typeof rawSeed === "number" && Number.isFinite(rawSeed) ? rawSeed : null;
  return {
    name,
    prompt: prompt || "Image-guided avatar generation",
    style: parseStyle(value.style),
    scale: parseScale(value.scale),
    focus: parseFocus(value.focus),
    seed,
    sourceImage: sourceImages[0] ?? null,
    sourceImages,
    imageMode: value.imageMode === "mesh" ? "mesh" : "avatar",
    provider: parseProvider(value.provider),
    adapterId:
      value.adapterId === "portrait_volume" || value.adapterId === "heightfield_relief"
        ? value.adapterId
        : undefined,
  };
};

const buildProviderAvailability = async (): Promise<StudioProviderAvailability> =>
  buildStudioAiProviderAvailability();

const buildExportManifest = (projectId: string) => {
  const project = getStudioProject(projectId);
  if (!project) {
    throw new Error("Studio project not found.");
  }
  return {
    project: {
      id: project.id,
      name: project.name,
      prompt: project.prompt,
      style: project.style,
      scale: project.scale,
      focus: project.focus,
      seed: project.seed,
      updatedAt: project.updatedAt,
    },
    export: {
      format: "glb_manifest",
      generator: "claw3d-studio-clean-room-v1",
      summary: project.latestJob.summary,
    },
    sceneDraft: project.sceneDraft,
  };
};

const applyProjectToOffice = (projectId: string) => {
  const project = getStudioProject(projectId);
  if (!project) {
    throw new Error("Studio project not found.");
  }
  upsertOffice({
    workspaceId: WORKSPACE_ID,
    officeId: OFFICE_ID,
    name: `Studio Export - ${project.name}`,
  });
  const officeVersionId = `studio-${Date.now().toString(36)}`;
  const fallback = createEmptyOfficeMap({
    workspaceId: WORKSPACE_ID,
    officeVersionId,
    width: 1200,
    height: 900,
  });
  const map = normalizeOfficeMap(
    buildOfficeMapFromStudioProject(project, officeVersionId),
    fallback,
  );
  const version = saveOfficeVersion({
    workspaceId: WORKSPACE_ID,
    officeId: OFFICE_ID,
    versionId: officeVersionId,
    createdBy: "studio-world",
    notes: `Generated from studio project ${project.id}.`,
    map,
  });
  const published = publishOfficeVersion({
    workspaceId: WORKSPACE_ID,
    officeId: OFFICE_ID,
    officeVersionId: version.id,
    publishedBy: "studio-world",
  });
  return {
    office: {
      workspaceId: WORKSPACE_ID,
      officeId: OFFICE_ID,
      officeVersionId: version.id,
      publishedAt: published.publishedAt,
    },
  };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = asString(url.searchParams.get("action"));
    const projectId = asString(url.searchParams.get("projectId"));
    if (action === "export") {
      if (!projectId) {
        return NextResponse.json(
          { error: "projectId is required for export." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { exportManifest: buildExportManifest(projectId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "provider-status") {
      return NextResponse.json(
        { providerAvailability: await buildProviderAvailability() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "task-status") {
      if (!projectId) {
        return NextResponse.json(
          { error: "projectId is required for task status." },
          { status: 400 },
        );
      }
      const project = getStudioProject(projectId);
      if (!project?.externalModel?.taskId) {
        return NextResponse.json(
          { error: "No external model task exists for this project." },
          { status: 400 },
        );
      }
      if (project.externalModel.provider !== "self_hosted") {
        return NextResponse.json(
          { error: "Unsupported provider for task status." },
          { status: 400 },
        );
      }
      const task = await getSelfHostedImageTo3dTask(project.externalModel.taskId);
      const updatedProject = updateStudioProjectExternalModel(projectId, {
        provider: "self_hosted",
        taskId: task.id,
        status:
          task.status === "PENDING"
            ? "pending"
            : task.status === "IN_PROGRESS"
              ? "in_progress"
              : task.status === "FAILED" || task.status === "CANCELED"
                ? "failed"
                : "completed",
        progress: task.progress,
        glbUrl: task.modelGlbUrl,
        thumbnailUrl: task.thumbnailUrl,
        textureUrls: [],
        errorMessage: task.taskErrorMessage,
      });
      return NextResponse.json(
        {
          project: {
            ...updatedProject,
            latestJob: {
              ...updatedProject.latestJob,
              summary: buildRealAiSummary({
                project: updatedProject,
                task,
              }),
            },
          },
          providerTask: task,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        projects: listStudioProjects(),
        providerAvailability: await buildProviderAvailability(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load studio world data.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentType =
      typeof request.headers?.get === "function"
        ? request.headers.get("content-type") ?? ""
        : "";
    if (contentType.includes("multipart/form-data")) {
      const contentLengthHeader = request.headers.get("content-length");
      if (contentLengthHeader !== null) {
        const contentLength = Number(contentLengthHeader);
        if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_UPLOAD_BYTES + 2048) {
          return NextResponse.json(
            {
              error: `Image upload exceeds the ${MAX_IMAGE_UPLOAD_BYTES} byte limit.`,
            },
            { status: 413 },
          );
        }
      }
      const formData = await request.formData();
      const image = formData.get("image");
      if (
        image === null ||
        typeof image !== "object" ||
        typeof (image as File).arrayBuffer !== "function"
      ) {
        return NextResponse.json({ error: "image file is required." }, { status: 400 });
      }
      const imageFile = image as File;
      const mimeType = imageFile.type.trim().toLowerCase();
      if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
        return NextResponse.json(
          { error: "Only PNG, JPEG, and WEBP uploads are supported." },
          { status: 400 },
        );
      }
      const arrayBuffer = await imageFile.arrayBuffer();
      if (arrayBuffer.byteLength <= 0) {
        return NextResponse.json({ error: "Image upload is empty." }, { status: 400 });
      }
      if (arrayBuffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: `Image upload exceeds the ${MAX_IMAGE_UPLOAD_BYTES} byte limit.`,
          },
          { status: 413 },
        );
      }
      const requestedFileName = asString(formData.get("fileName"));
      const sourceImage = createStudioSourceImage({
        fileName: requestedFileName || imageFile.name || "studio-reference",
        mimeType,
        buffer: Buffer.from(arrayBuffer),
      });
      return NextResponse.json(
        { sourceImage },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const body = JSON.parse(rawBody) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const action = asString(body.action) || "generate";
    if (action === "generate") {
      const input = parseGenerationInput(body.input);
      if (!input) {
        return NextResponse.json(
          { error: "Valid generation input is required." },
          { status: 400 },
        );
      }
      if (
        input.provider === "self_hosted" &&
        Array.isArray(input.sourceImages) && input.sourceImages.length > 0 &&
        isRealStudioAiEnabled()
      ) {
        const taskId = await createSelfHostedImageTo3dTask({
          sourceImages: input.sourceImages ?? (input.sourceImage ? [input.sourceImage] : []),
          prompt: input.prompt,
          mode: "image_mesh",
          adapterId: input.adapterId,
        });
        const project = createStudioPendingProject({
          input: {
            ...input,
            provider: "self_hosted",
          },
          providerTaskId: taskId,
        });
        return NextResponse.json(
          {
            project,
            providerAvailability: await buildProviderAvailability(),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        {
          project: createStudioProject(input),
          providerAvailability: await buildProviderAvailability(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "apply_to_office") {
      const projectId = asString(body.projectId);
      if (!projectId) {
        return NextResponse.json(
          { error: "projectId is required for office export." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        applyProjectToOffice(projectId),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "Unsupported studio world action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to handle studio world request.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = asString(url.searchParams.get("projectId"));
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    const deleted = deleteStudioProject(projectId);
    return NextResponse.json(
      { deleted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete studio world project.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
