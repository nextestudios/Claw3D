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
  createStudioProject,
  deleteStudioProject,
  getStudioProject,
  listStudioProjects,
} from "@/lib/studio-world/store";
import type {
  StudioGenerationInput,
  StudioWorldFocus,
  StudioWorldScale,
  StudioWorldStyle,
} from "@/lib/studio-world/types";

export const runtime = "nodejs";

const WORKSPACE_ID = "default";
const OFFICE_ID = "studio-world";

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

const parseGenerationInput = (value: unknown): StudioGenerationInput | null => {
  if (!isRecord(value)) return null;
  const name = asString(value.name) || "Untitled Studio World";
  const prompt = asString(value.prompt);
  if (!prompt) return null;
  const rawSeed = value.seed;
  const seed =
    typeof rawSeed === "number" && Number.isFinite(rawSeed) ? rawSeed : null;
  return {
    name,
    prompt,
    style: parseStyle(value.style),
    scale: parseScale(value.scale),
    focus: parseFocus(value.focus),
    seed,
  };
};

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
    return NextResponse.json(
      { projects: listStudioProjects() },
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
      return NextResponse.json(
        { project: createStudioProject(input) },
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
