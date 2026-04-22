"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeaderBar } from "@/features/agents/components/HeaderBar";
import { exportStudioProjectGlb } from "@/features/studio-world/export/exportGlb";
import { StudioWorldPreview } from "@/features/studio-world/preview/StudioWorldPreview";
import { StudioWorldTaskLogCard } from "@/features/studio-world/screens/StudioWorldTaskLogCard";
import type {
  StudioProviderAvailability,
  StudioProjectRecord,
  StudioSourceImageRecord,
  StudioWorkerAdapterKind,
  StudioWorldFocus,
  StudioWorldGenerationProvider,
  StudioWorldScale,
  StudioWorldStyle,
} from "@/lib/studio-world/types";

const STYLE_OPTIONS: Array<{ value: StudioWorldStyle; label: string }> = [
  { value: "stylized", label: "Stylized" },
  { value: "realistic", label: "Realistic" },
  { value: "cinematic", label: "Cinematic" },
  { value: "low-poly", label: "Low-poly" },
];

const SCALE_OPTIONS: Array<{ value: StudioWorldScale; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const FOCUS_OPTIONS: Array<{ value: StudioWorldFocus; label: string }> = [
  { value: "world", label: "World" },
  { value: "assets", label: "Assets" },
  { value: "animation", label: "Animation" },
];

const IMAGE_ROLE_OPTIONS: Array<NonNullable<StudioSourceImageRecord["role"]>> = [
  "front",
  "side",
  "back",
  "detail",
];

const STUDIO_INPUT_CLASS =
  "ui-input w-full !text-foreground placeholder:!text-muted-foreground";
const STUDIO_TEXTAREA_CLASS = `${STUDIO_INPUT_CLASS} min-h-36 resize-y`;
const STUDIO_SELECT_CLASS = "ui-input w-full !text-foreground";

type ExportManifestResponse = {
  exportManifest?: unknown;
  error?: string;
};

type StudioWorldResponse = {
  projects?: StudioProjectRecord[];
  project?: StudioProjectRecord;
  sourceImage?: StudioSourceImageRecord;
  providerAvailability?: StudioProviderAvailability;
  providerTask?: {
    id: string;
    status: string;
    progress: number;
    modelGlbUrl: string | null;
    thumbnailUrl: string | null;
    depthPreviewUrl: string | null;
    normalPreviewUrl: string | null;
    taskErrorMessage: string | null;
  };
  office?: {
    workspaceId: string;
    officeId: string;
    officeVersionId: string;
    publishedAt: string;
  };
  deleted?: boolean;
  error?: string;
};

type StudioWorldTaskStatusResponse = StudioWorldResponse & {
  project: StudioProjectRecord;
};

const shouldPollExternalModel = (externalModel?: StudioProjectRecord["externalModel"] | null) =>
  externalModel?.status === "pending" ||
  externalModel?.status === "in_progress" ||
  (externalModel?.status === "completed" && !externalModel.glbUrl?.trim());

const fetchProjectTaskStatus = async (
  projectId: string,
): Promise<StudioWorldTaskStatusResponse> => {
  const response = await fetch(
    `/api/studio-world?action=task-status&projectId=${encodeURIComponent(projectId)}`,
    { cache: "no-store" },
  );
  const body = (await response.json()) as StudioWorldResponse;
  if (!response.ok || !body.project) {
    throw new Error(body.error || "Failed to load task status.");
  }
  return {
    ...body,
    project: body.project,
  };
};

const downloadFileFromUrl = async (params: {
  url: string;
  filename: string;
}) => {
  const response = await fetch(params.url);
  if (!response.ok) {
    throw new Error("Failed to download provider GLB.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = params.filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
};

const formatTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export function StudioWorldScreen() {
  const [projects, setProjects] = useState<StudioProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [name, setName] = useState("Studio Prototype");
  const [prompt, setPrompt] = useState(
    "A stylized collaborative 3D studio district with hero props, modular landmarks, and export-ready assets.",
  );
  const [style, setStyle] = useState<StudioWorldStyle>("stylized");
  const [scale, setScale] = useState<StudioWorldScale>("medium");
  const [focus, setFocus] = useState<StudioWorldFocus>("world");
  const [seed, setSeed] = useState("");
  const [uploadedImages, setUploadedImages] = useState<StudioSourceImageRecord[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageMode, setImageMode] = useState<"avatar" | "mesh">("avatar");
  const [provider, setProvider] = useState<StudioWorldGenerationProvider>("local");
  const [workerAdapter, setWorkerAdapter] = useState<StudioWorkerAdapterKind>("portrait_volume");
  const [providerAvailability, setProviderAvailability] = useState<StudioProviderAvailability | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((entry) => entry.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );
  const shouldPollRemoteTask = shouldPollExternalModel(selectedProject?.externalModel);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/studio-world", { cache: "no-store" });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok) {
        throw new Error(body.error || "Failed to load studio projects.");
      }
      const nextProjects = body.projects ?? [];
      setProjects(nextProjects);
      setSelectedProjectId((current) => current ?? nextProjects[0]?.id ?? null);
      setProviderAvailability(body.providerAvailability ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load studio projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProject) return;
    setUploadedImages(selectedProject.sourceImages ?? []);
    setProvider(selectedProject.provider ?? "local");
    setWorkerAdapter(selectedProject.externalModel?.adapterId ?? "portrait_volume");
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) return;
    if (!providerAvailability?.available) return;
    if (providerAvailability.provider !== "self_hosted") return;
    setProvider("self_hosted");
  }, [providerAvailability, selectedProject]);

  useEffect(() => {
    if (!selectedProject?.externalModel?.taskId || !shouldPollRemoteTask) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const body = await fetchProjectTaskStatus(selectedProject.id);
        if (cancelled) return;
        setProjects((current) =>
          current.map((entry) => (entry.id === body.project.id ? body.project : entry)),
        );
        const nextStatusLine =
          body.providerTask?.status === "SUCCEEDED"
            ? body.project.externalModel?.glbUrl
              ? "Real AI image-to-3D task completed."
              : "Real AI image-to-3D task completed. Syncing provider GLB."
            : body.providerTask?.status === "FAILED" || body.providerTask?.status === "CANCELED"
              ? body.providerTask.taskErrorMessage || "Real AI image-to-3D task failed."
              : null;
        if (nextStatusLine) {
          setStatusLine(nextStatusLine);
        }
      } catch {
        // ignore transient poll failures; next interval may succeed
      }
    };
    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedProject?.id, selectedProject?.externalModel?.taskId, shouldPollRemoteTask]);

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    setStatusLine("Uploading reference image.");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/studio-world", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.sourceImage) {
        throw new Error(body.error || "Failed to upload image.");
      }
      setUploadedImages((current) => [...current, body.sourceImage!]);
      setError(null);
      setStatusLine(`Uploaded ${body.sourceImage.fileName}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload image.");
      setStatusLine(null);
    } finally {
      setUploadingImage(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const handleImageRoleChange = (
    imageId: string,
    role: NonNullable<StudioSourceImageRecord["role"]>,
  ) => {
    setUploadedImages((current) =>
      current.map((image) =>
        image.id === imageId
          ? {
              ...image,
              role,
            }
          : image,
      ),
    );
  };

  const handleRemoveImage = (imageId: string) => {
    setUploadedImages((current) => current.filter((image) => image.id !== imageId));
  };

  const handleGenerate = async () => {
    setBusy(true);
    setStatusLine(
      uploadedImages.length > 0
        ? "Generating image-guided 3D proxy."
        : "Generating clean-room studio draft.",
    );
    try {
      const parsedSeed = seed.trim() ? Number.parseInt(seed.trim(), 10) : null;
      const response = await fetch("/api/studio-world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          input: {
            name,
            prompt,
            style,
            scale,
            focus,
            seed: Number.isFinite(parsedSeed) ? parsedSeed : null,
            sourceImage: uploadedImages[0] ?? null,
            sourceImages: uploadedImages,
            imageMode,
            provider,
            adapterId: workerAdapter,
          },
        }),
      });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.project) {
        throw new Error(body.error || "Failed to generate studio project.");
      }
      setProjects((current) => [body.project!, ...current.filter((entry) => entry.id !== body.project!.id)]);
      setSelectedProjectId(body.project.id);
      setProviderAvailability(body.providerAvailability ?? null);
      setError(null);
      setStatusLine(
        body.project.latestJob.status === "pending"
          ? `Submitted ${body.project.name} to self-hosted AI generation.`
          : `Generated ${body.project.name}.`,
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate studio project.",
      );
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncProject = async (projectId: string) => {
    setBusy(true);
    setStatusLine("Syncing self-hosted AI task status.");
    try {
      const response = await fetch(
        `/api/studio-world?action=task-status&projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.project) {
        throw new Error(body.error || "Failed to sync self-hosted AI task.");
      }
      setProjects((current) =>
        current.map((entry) => (entry.id === body.project!.id ? body.project! : entry)),
      );
      setSelectedProjectId(body.project.id);
      setError(null);
      if (body.providerTask?.status === "SUCCEEDED") {
        setStatusLine("AI task synced. Remote GLB is ready.");
      } else if (body.providerTask?.status === "FAILED" || body.providerTask?.status === "CANCELED") {
        setStatusLine(body.providerTask.taskErrorMessage || "AI task failed.");
      } else {
        setStatusLine(`AI task is ${body.providerTask?.status?.toLowerCase() ?? "in progress"}.`);
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync self-hosted AI task.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    setBusy(true);
    setStatusLine("Deleting studio draft.");
    try {
      const response = await fetch(`/api/studio-world?projectId=${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.deleted) {
        throw new Error(body.error || "Failed to delete studio project.");
      }
      const nextProjects = projects.filter((entry) => entry.id !== projectId);
      setProjects(nextProjects);
      setSelectedProjectId(nextProjects[0]?.id ?? null);
      setError(null);
      setStatusLine("Studio draft deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete studio project.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleExportManifest = async (projectId: string) => {
    setBusy(true);
    setStatusLine("Preparing export manifest.");
    try {
      const response = await fetch(
        `/api/studio-world?action=export&projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ExportManifestResponse;
      if (!response.ok || !body.exportManifest) {
        throw new Error(body.error || "Failed to export studio project.");
      }
      downloadJson(`${projectId}.glb.json`, body.exportManifest);
      setError(null);
      setStatusLine("Export manifest downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export studio project.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleExportGlb = async (project: StudioProjectRecord) => {
    setBusy(true);
    setStatusLine("Building GLB export.");
    try {
      await exportStudioProjectGlb(project);
      setError(null);
      setStatusLine("GLB downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export GLB.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleExportProviderGlb = async (project: StudioProjectRecord) => {
    const glbUrl = project.externalModel?.glbUrl?.trim() ?? "";
    if (!glbUrl) {
      setError("AI-generated GLB is not ready yet.");
      return;
    }
    setBusy(true);
    setStatusLine("Downloading AI-generated GLB.");
    try {
      await downloadFileFromUrl({
        url: glbUrl,
        filename: `${project.name.trim().replace(/\s+/g, "-").toLowerCase() || "studio-ai"}.glb`,
      });
      setError(null);
      setStatusLine("AI-generated GLB downloaded.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Failed to download AI-generated GLB.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyToOffice = async (projectId: string) => {
    setBusy(true);
    setStatusLine("Publishing generated layout to Claw3D office.");
    try {
      const response = await fetch("/api/studio-world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_to_office",
          projectId,
        }),
      });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.office) {
        throw new Error(body.error || "Failed to apply studio project to office.");
      }
      setError(null);
      setStatusLine(`Published office version ${body.office.officeVersionId}.`);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Failed to apply studio project to office.");
      setStatusLine(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="relative z-10 flex h-full flex-col">
        <HeaderBar
          status="disconnected"
          currentSection="studio"
          onConnectionSettings={() => {
            setStatusLine(
              "Studio world and asset generation run locally here and do not require a gateway connection.",
            );
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 md:px-5 md:pb-5 md:pt-3">
          {error ? (
            <div className="ui-alert-danger rounded-md px-4 py-2 text-sm">{error}</div>
          ) : null}
          {statusLine ? (
            <div className="ui-card px-4 py-2 font-mono text-[11px] tracking-[0.07em] text-muted-foreground">
              {statusLine}
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
            <section className="ui-panel ui-depth-workspace min-h-0 overflow-auto p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Claw3D Studio
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-foreground">Generate 3D worlds, assets, motion, and image-guided avatars.</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Claw3D Studio runs locally in this app and does not require a gateway connection for world building or
                asset generation.
              </p>
              <div className="mt-3 rounded-2xl border border-border/60 bg-surface-1/35 p-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">AI provider status</div>
                <div className="mt-1">
                  {providerAvailability?.message ??
                    "Local generation is available. Configure a self-hosted AI provider to enable model-backed image-to-3D."}
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-border/60 bg-surface-1/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Reference images</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Upload one or more PNG, JPEG, or WEBP images. Front, side, and back references improve self-hosted reconstruction.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ui-btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={busy || uploadingImage}
                    >
                      {uploadingImage ? "Uploading..." : uploadedImages.length > 0 ? "Add image" : "Upload image"}
                    </button>
                  </div>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length === 0) return;
                      void (async () => {
                        for (const file of files) {
                          await handleImageUpload(file);
                        }
                      })();
                    }}
                  />
                  {uploadedImages.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        {uploadedImages.map((image, index) => (
                          <div
                            key={image.id}
                            className="overflow-hidden rounded-xl border border-border/60 bg-black/10"
                          >
                            <div className="flex items-center justify-end border-b border-border/50 px-3 py-2">
                              <button
                                type="button"
                                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => handleRemoveImage(image.id)}
                                disabled={busy || uploadingImage}
                                aria-label={`Remove ${image.fileName}`}
                              >
                                Remove
                              </button>
                            </div>
                            <Image
                              src={image.dataUrl}
                              alt={image.fileName}
                              width={160}
                              height={160}
                              className="h-[140px] w-full object-cover"
                              unoptimized
                            />
                            <div className="px-3 py-2">
                              <div className="truncate text-sm font-medium text-foreground">{image.fileName}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {image.width} x {image.height} • {Math.round(image.sizeBytes / 1024)} KB
                              </div>
                              <label className="mt-2 block">
                                <span className="mb-1 block text-[11px] font-medium text-foreground">
                                  View role
                                </span>
                                <select
                                  className={STUDIO_SELECT_CLASS}
                                  value={image.role ?? (index === 0 ? "front" : "side")}
                                  onChange={(event) =>
                                    handleImageRoleChange(
                                      image.id,
                                      event.target.value as NonNullable<StudioSourceImageRecord["role"]>,
                                    )
                                  }
                                >
                                  {IMAGE_ROLE_OPTIONS.map((role) => (
                                    <option key={role} value={role}>
                                      {role}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(uploadedImages[0]?.palette ?? []).map((color) => (
                          <div key={color} className="flex items-center gap-2 rounded-full border border-border/60 px-2 py-1">
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-black/15"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {color}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {uploadedImages.length > 0 ? (
                    <div className="mt-3">
                      <div className="mb-1.5 block text-xs font-medium text-foreground">Image generation mode</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            imageMode === "avatar"
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setImageMode("avatar")}
                          disabled={busy || uploadingImage}
                        >
                          <div className="font-medium">Avatar proxy</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Builds a stylized 3D character proxy guided by the reference image.
                          </div>
                        </button>
                        <button
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            imageMode === "mesh"
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setImageMode("mesh")}
                          disabled={busy || uploadingImage}
                        >
                          <div className="font-medium">Image mesh draft</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Builds a relief-style mesh draft from the uploaded portrait silhouette and palette.
                          </div>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">Project name</span>
                  <input
                    className={STUDIO_INPUT_CLASS}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Studio Prototype"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">Generation brief</span>
                  <textarea
                    className={STUDIO_TEXTAREA_CLASS}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the world, hero assets, camera mood, and export intent."
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Generation backend</span>
                    <select
                      className={STUDIO_SELECT_CLASS}
                      value={provider}
                      onChange={(event) => setProvider(event.target.value as StudioWorldGenerationProvider)}
                    >
                      <option value="local">Local Studio</option>
                      <option
                        value="self_hosted"
                        disabled={!providerAvailability?.available}
                      >
                        Self-hosted AI
                      </option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Worker strategy</span>
                    <select
                      className={STUDIO_SELECT_CLASS}
                      value={workerAdapter}
                      onChange={(event) => setWorkerAdapter(event.target.value as StudioWorkerAdapterKind)}
                    >
                      <option value="portrait_volume">Portrait volume</option>
                      <option value="heightfield_relief">Heightfield relief</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Style</span>
                    <select className={STUDIO_SELECT_CLASS} value={style} onChange={(event) => setStyle(event.target.value as StudioWorldStyle)}>
                      {STYLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Scale</span>
                    <select className={STUDIO_SELECT_CLASS} value={scale} onChange={(event) => setScale(event.target.value as StudioWorldScale)}>
                      {SCALE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Focus</span>
                    <select className={STUDIO_SELECT_CLASS} value={focus} onChange={(event) => setFocus(event.target.value as StudioWorldFocus)}>
                      {FOCUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Seed</span>
                    <input
                      className={STUDIO_INPUT_CLASS}
                      value={seed}
                      onChange={(event) => setSeed(event.target.value)}
                      placeholder="Optional deterministic seed"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ui-btn-primary px-4 py-2 text-sm"
                    onClick={() => void handleGenerate()}
                    disabled={busy || uploadingImage}
                  >
                    {busy
                      ? "Working..."
                      : uploadedImages.length > 0
                        ? "Generate from image"
                        : "Generate scene"}
                  </button>
                  <button type="button" className="ui-btn-secondary px-4 py-2 text-sm" onClick={() => void refreshProjects()} disabled={busy || uploadingImage}>
                    Refresh library
                  </button>
                  {uploadedImages.length > 0 ? (
                    <button
                      type="button"
                      className="ui-btn-secondary px-4 py-2 text-sm"
                      onClick={() => setUploadedImages([])}
                      disabled={busy || uploadingImage}
                    >
                      Clear images
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="ui-panel ui-depth-workspace min-h-0 overflow-hidden p-3">
              {selectedProject ? (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <StudioWorldPreview
                    sceneDraft={selectedProject.sceneDraft}
                    referenceImage={selectedProject.sourceImages[0] ?? null}
                    project={selectedProject}
                  />
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="ui-card max-h-52 overflow-auto p-4">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Scene notes
                      </div>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {selectedProject.sceneDraft.notes.map((note) => (
                          <li key={note} className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="ui-card max-h-52 overflow-auto p-4">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Export targets
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">Direct GLB download.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">AI-generated GLB download when the self-hosted job finishes.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">GLB manifest download.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">Publish to Claw3D office layout.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">Manual task sync for self-hosted AI jobs.</div>
                      </div>
                    </div>
                  </div>
                  <StudioWorldTaskLogCard
                    key={selectedProject.externalModel?.taskId ?? selectedProject.id}
                    project={selectedProject}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
                  {loading ? "Loading studio projects..." : "Generate a scene to open the preview."}
                </div>
              )}
            </section>

            <aside className="ui-panel ui-depth-workspace min-h-0 overflow-auto p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Project library
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Generated drafts and worker-backed results persist locally in Studio.
                  </div>
                </div>
                <div className="rounded-full border border-border/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {projects.length}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {projects.map((project) => {
                  const isSelected = project.id === selectedProject?.id;
                  return (
                    <div
                      key={project.id}
                      className={`rounded-2xl border p-3 transition-colors ${
                        isSelected
                          ? "border-primary/50 bg-primary/8"
                          : "border-border/60 bg-surface-1/35"
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{project.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{project.latestJob.summary}</div>
                          </div>
                          <div className="rounded-full border border-border/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            {project.sceneDraft.assets.length}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {project.style}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {project.focus}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {project.scale}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {project.mode === "image_avatar"
                              ? "image avatar"
                              : project.mode === "image_mesh"
                                ? "image mesh"
                                                                : "text scene"}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {project.provider}
                          </span>
                          {project.externalModel?.adapterId ? (
                            <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              {project.externalModel.adapterId}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <div className="mt-3 text-[11px] text-muted-foreground">
                        Updated {formatTimestamp(project.updatedAt)}.
                      </div>
                      {project.externalModel ? (
                        <div className="mt-3 rounded-xl border border-border/60 bg-surface-1/35 p-2 text-xs text-muted-foreground">
                          <div>
                            AI task {project.externalModel.status} • {project.externalModel.progress}%.
                            {project.externalModel.glbUrl ? " GLB ready from self-hosted AI." : ""}
                            {project.externalModel.errorMessage ? ` ${project.externalModel.errorMessage}` : ""}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {project.externalModel.adapterId ? (
                              <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                {project.externalModel.adapterId}
                              </span>
                            ) : null}
                            {project.externalModel.width && project.externalModel.height ? (
                              <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                {project.externalModel.width} x {project.externalModel.height}
                              </span>
                            ) : null}
                            {Array.isArray(project.externalModel.palette)
                              ? project.externalModel.palette.slice(0, 4).map((color) => (
                                  <span
                                    key={color}
                                    className="inline-block h-5 w-5 rounded-full border border-black/15"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  />
                                ))
                              : null}
                          </div>
                          {project.externalModel.glbUrl ? (
                            <div className="mt-2 font-medium text-foreground">
                              Worker result is ready and should be treated as the primary artifact.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {project.externalModel?.thumbnailUrl ? (
                        <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-surface-1/35">
                          <Image
                            src={project.externalModel.thumbnailUrl}
                            alt={`${project.name} AI thumbnail`}
                            width={320}
                            height={180}
                            className="h-32 w-full object-cover"
                            unoptimized
                          />
                        </div>
                      ) : null}
                      {project.externalModel?.depthPreviewUrl || project.externalModel?.normalPreviewUrl ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {project.externalModel.depthPreviewUrl ? (
                            <div className="overflow-hidden rounded-xl border border-border/60 bg-surface-1/35">
                              <Image
                                src={project.externalModel.depthPreviewUrl}
                                alt={`${project.name} depth preview`}
                                width={320}
                                height={180}
                                className="h-24 w-full object-cover"
                                unoptimized
                              />
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                Depth cue preview.
                              </div>
                            </div>
                          ) : null}
                          {project.externalModel.normalPreviewUrl ? (
                            <div className="overflow-hidden rounded-xl border border-border/60 bg-surface-1/35">
                              <Image
                                src={project.externalModel.normalPreviewUrl}
                                alt={`${project.name} normal preview`}
                                width={320}
                                height={180}
                                className="h-24 w-full object-cover"
                                unoptimized
                              />
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                Normal cue preview.
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {project.sourceImages[0] ? (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-surface-1/35 p-2">
                          <Image
                            src={project.sourceImages[0].dataUrl}
                            alt={project.sourceImages[0].fileName}
                            width={52}
                            height={52}
                            className="h-13 w-13 rounded-lg object-cover"
                            unoptimized
                          />
                          <div className="min-w-0 text-xs text-muted-foreground">
                            <div className="truncate text-foreground">{project.sourceImages[0].fileName}</div>
                            <div>
                              {project.sourceImages[0].width} x {project.sourceImages[0].height}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {project.externalModel?.taskId ? (
                          <button
                            type="button"
                            className="ui-btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => void handleSyncProject(project.id)}
                            disabled={busy}
                          >
                            Sync now
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ui-btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => void handleExportGlb(project)}
                          disabled={busy}
                        >
                          Export GLB
                        </button>
                        {project.externalModel?.glbUrl ? (
                          <button
                            type="button"
                            className="ui-btn-primary px-3 py-1.5 text-xs"
                            onClick={() => void handleExportProviderGlb(project)}
                            disabled={busy}
                          >
                            Download AI GLB
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ui-btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => void handleExportManifest(project.id)}
                          disabled={busy}
                        >
                          Export manifest
                        </button>
                        <button
                          type="button"
                          className="ui-btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => void handleApplyToOffice(project.id)}
                          disabled={busy}
                        >
                          Apply to office
                        </button>
                        <button
                          type="button"
                          className="ui-btn-secondary px-3 py-1.5 text-xs text-red-300"
                          onClick={() => void handleDelete(project.id)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!loading && projects.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    No studio drafts yet.
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
