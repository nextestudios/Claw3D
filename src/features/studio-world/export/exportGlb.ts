"use client";

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { buildPreviewSceneGroup } from "@/features/studio-world/preview/scene-utils";
import type { StudioProjectRecord } from "@/lib/studio-world/types";

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "claw3d-studio-world";

export const exportStudioProjectGlb = async (project: StudioProjectRecord) => {
  const exporter = new GLTFExporter();
  const sceneGroup = buildPreviewSceneGroup(project.sceneDraft);
  sceneGroup.updateMatrixWorld(true);

  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      sceneGroup,
      (value) => {
        if (value instanceof ArrayBuffer) {
          resolve(value);
          return;
        }
        reject(new Error("GLB export did not return binary output."));
      },
      (error) => {
        reject(error instanceof Error ? error : new Error("Failed to export GLB."));
      },
      {
        binary: true,
        trs: false,
        onlyVisible: true,
      },
    );
  });

  downloadBlob(
    `${sanitizeFilename(project.name)}.glb`,
    new Blob([result], { type: "model/gltf-binary" }),
  );
};
