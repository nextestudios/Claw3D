"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeaderBar } from "@/features/agents/components/HeaderBar";
import { exportStudioProjectGlb } from "@/features/studio-world/export/exportGlb";
import { StudioWorldPreview } from "@/features/studio-world/preview/StudioWorldPreview";
import type {
  StudioProjectRecord,
  StudioSourceImageRecord,
  StudioWorldFocus,
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

type ExportManifestResponse = {
  exportManifest?: unknown;
  error?: string;
};

type StudioWorldResponse = {
  projects?: StudioProjectRecord[];
  project?: StudioProjectRecord;
  sourceImage?: StudioSourceImageRecord;
  office?: {
    workspaceId: string;
    officeId: string;
    officeVersionId: string;
    publishedAt: string;
  };
  deleted?: boolean;
  error?: string;
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
  const [uploadedImage, setUploadedImage] = useState<StudioSourceImageRecord | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((entry) => entry.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

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
    setUploadedImage(selectedProject.sourceImages[0] ?? null);
  }, [selectedProject]);

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
      setUploadedImage(body.sourceImage);
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

  const handleGenerate = async () => {
    setBusy(true);
    setStatusLine(
      uploadedImage
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
            sourceImage: uploadedImage,
          },
        }),
      });
      const body = (await response.json()) as StudioWorldResponse;
      if (!response.ok || !body.project) {
        throw new Error(body.error || "Failed to generate studio project.");
      }
      setProjects((current) => [body.project!, ...current.filter((entry) => entry.id !== body.project!.id)]);
      setSelectedProjectId(body.project.id);
      setError(null);
      setStatusLine(`Generated ${body.project.name}.`);
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
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-border/60 bg-surface-1/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Reference image</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Upload a PNG, JPEG, or WEBP to generate a stylized 3D avatar proxy inspired by that image.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ui-btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={busy || uploadingImage}
                    >
                      {uploadingImage ? "Uploading..." : uploadedImage ? "Replace image" : "Upload image"}
                    </button>
                  </div>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void handleImageUpload(file);
                    }}
                  />
                  {uploadedImage ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <div className="overflow-hidden rounded-xl border border-border/60 bg-black/10">
                        <Image
                          src={uploadedImage.dataUrl}
                          alt={uploadedImage.fileName}
                          width={120}
                          height={120}
                          className="h-[120px] w-full object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{uploadedImage.fileName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {uploadedImage.width} x {uploadedImage.height} • {Math.round(uploadedImage.sizeBytes / 1024)} KB
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {uploadedImage.palette.map((color) => (
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
                    </div>
                  ) : null}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">Project name</span>
                  <input
                    className="ui-input w-full"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Studio Prototype"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">Generation brief</span>
                  <textarea
                    className="ui-input min-h-36 w-full resize-y"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the world, hero assets, camera mood, and export intent."
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Style</span>
                    <select className="ui-input w-full" value={style} onChange={(event) => setStyle(event.target.value as StudioWorldStyle)}>
                      {STYLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Scale</span>
                    <select className="ui-input w-full" value={scale} onChange={(event) => setScale(event.target.value as StudioWorldScale)}>
                      {SCALE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">Focus</span>
                    <select className="ui-input w-full" value={focus} onChange={(event) => setFocus(event.target.value as StudioWorldFocus)}>
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
                      className="ui-input w-full"
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
                      : uploadedImage
                        ? "Generate from image"
                        : "Generate scene"}
                  </button>
                  <button type="button" className="ui-btn-secondary px-4 py-2 text-sm" onClick={() => void refreshProjects()} disabled={busy || uploadingImage}>
                    Refresh library
                  </button>
                  {uploadedImage ? (
                    <button
                      type="button"
                      className="ui-btn-secondary px-4 py-2 text-sm"
                      onClick={() => setUploadedImage(null)}
                      disabled={busy || uploadingImage}
                    >
                      Clear image
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="ui-panel ui-depth-workspace min-h-0 overflow-hidden p-3">
              {selectedProject ? (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <StudioWorldPreview sceneDraft={selectedProject.sceneDraft} />
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
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">GLB manifest download.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">Publish to Claw3D office layout.</div>
                        <div className="rounded-lg border border-border/50 bg-surface-1/50 px-3 py-2">Future provider seam for remote model workers.</div>
                      </div>
                    </div>
                  </div>
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
                    Generated drafts persist locally in Studio.
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
                            {project.mode === "image_avatar" ? "image avatar" : "text scene"}
                          </span>
                        </div>
                      </button>
                      <div className="mt-3 text-[11px] text-muted-foreground">
                        Updated {formatTimestamp(project.updatedAt)}.
                      </div>
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
                        <button
                          type="button"
                          className="ui-btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => void handleExportGlb(project)}
                          disabled={busy}
                        >
                          Export GLB
                        </button>
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
