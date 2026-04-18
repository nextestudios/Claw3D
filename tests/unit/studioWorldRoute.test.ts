import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "@/app/api/studio-world/route";

const makeTempDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe("studio world route", () => {
  const priorStateDir = process.env.OPENCLAW_STATE_DIR;
  let tempDir: string | null = null;

  afterEach(() => {
    process.env.OPENCLAW_STATE_DIR = priorStateDir;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates, lists, exports, applies, and deletes a studio project", async () => {
    tempDir = makeTempDir("studio-world-route");
    process.env.OPENCLAW_STATE_DIR = tempDir;

    const createResponse = await POST({
      text: async () =>
        JSON.stringify({
          action: "generate",
          input: {
            name: "Forest Lab",
            prompt: "A stylized forest lab with modular props and export-ready landmarks.",
            style: "stylized",
            scale: "medium",
            focus: "world",
            seed: 42,
          },
        }),
    } as unknown as Request);
    const createBody = (await createResponse.json()) as {
      project?: {
        id: string;
        name: string;
        sceneDraft: { assets: Array<unknown> };
      };
    };

    expect(createResponse.status).toBe(200);
    expect(createBody.project?.name).toBe("Forest Lab");
    expect(createBody.project?.sceneDraft.assets.length).toBeGreaterThan(0);

    const projectId = createBody.project?.id ?? "";
    expect(projectId.length).toBeGreaterThan(0);

    const listResponse = await GET(
      new Request("http://localhost/api/studio-world"),
    );
    const listBody = (await listResponse.json()) as {
      projects?: Array<{ id: string }>;
    };
    expect(listResponse.status).toBe(200);
    expect(listBody.projects?.some((project) => project.id === projectId)).toBe(true);

    const exportResponse = await GET(
      new Request(`http://localhost/api/studio-world?action=export&projectId=${encodeURIComponent(projectId)}`),
    );
    const exportBody = (await exportResponse.json()) as {
      exportManifest?: {
        project?: { id?: string };
        export?: { format?: string };
      };
    };
    expect(exportResponse.status).toBe(200);
    expect(exportBody.exportManifest?.project?.id).toBe(projectId);
    expect(exportBody.exportManifest?.export?.format).toBe("glb_manifest");

    const applyResponse = await POST({
      text: async () =>
        JSON.stringify({
          action: "apply_to_office",
          projectId,
        }),
    } as unknown as Request);
    const applyBody = (await applyResponse.json()) as {
      office?: { officeId?: string; officeVersionId?: string };
    };
    expect(applyResponse.status).toBe(200);
    expect(applyBody.office?.officeId).toBe("studio-world");
    expect((applyBody.office?.officeVersionId ?? "").length).toBeGreaterThan(0);

    const deleteResponse = await DELETE(
      new Request(`http://localhost/api/studio-world?projectId=${encodeURIComponent(projectId)}`),
    );
    const deleteBody = (await deleteResponse.json()) as { deleted?: boolean };
    expect(deleteResponse.status).toBe(200);
    expect(deleteBody.deleted).toBe(true);
  });
});
