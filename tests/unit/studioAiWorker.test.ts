import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const makeTempDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAElEQVR4nGNgAAAAAgAB5SfUogAAAABJRU5ErkJggg==",
  "base64",
);

describe("studio AI worker contract", () => {
  const priorStateDir = process.env.OPENCLAW_STATE_DIR;
  const priorPort = process.env.CLAW3D_STUDIO_PROVIDER_PORT;
  let tempDir: string | null = null;

  afterEach(() => {
    process.env.OPENCLAW_STATE_DIR = priorStateDir;
    process.env.CLAW3D_STUDIO_PROVIDER_PORT = priorPort;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates a task and serves thumbnail plus glb artifact", async () => {
    tempDir = makeTempDir("studio-ai-worker");
    process.env.OPENCLAW_STATE_DIR = tempDir;
    process.env.CLAW3D_STUDIO_PROVIDER_PORT = "3345";

    const { createStudioAiWorkerServer } = await import("../../server/studio-ai-worker.js");
    const worker = createStudioAiWorkerServer({
      host: "127.0.0.1",
      port: 3345,
    });

    await worker.start();
    try {
      const healthResponse = await fetch("http://127.0.0.1:3345/health");
      expect(healthResponse.status).toBe(200);

      const createResponse = await fetch("http://127.0.0.1:3345/openapi/v1/image-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: `data:image/png;base64,${ONE_BY_ONE_PNG.toString("base64")}`,
          model_type: "standard",
          adapter_id: "portrait-volume",
          texture_prompt: "portrait",
        }),
      });
      expect(createResponse.status).toBe(200);
      const createBody = (await createResponse.json()) as { result?: string };
      const taskId = createBody.result ?? "";
      expect(taskId.length).toBeGreaterThan(0);

      let taskBody: {
        status?: string;
        model_urls?: { glb?: string };
        thumbnail_url?: string;
      } = {};
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const taskResponse = await fetch(`http://127.0.0.1:3345/openapi/v1/image-to-3d/${taskId}`);
        expect(taskResponse.status).toBe(200);
        taskBody = (await taskResponse.json()) as typeof taskBody;
        if (taskBody.status === "SUCCEEDED") break;
      }

      expect(taskBody.status).toBe("SUCCEEDED");
      expect(taskBody.thumbnail_url).toMatch(/thumbnail\.png$/);
      expect(taskBody.model_urls?.glb).toMatch(/model\.glb$/);

      const thumbnailResponse = await fetch(taskBody.thumbnail_url!);
      expect(thumbnailResponse.status).toBe(200);
      expect(thumbnailResponse.headers.get("content-type")).toBe("image/png");

      const modelResponse = await fetch(taskBody.model_urls!.glb!);
      expect(modelResponse.status).toBe(200);
      expect(modelResponse.headers.get("content-type")).toBe("model/gltf-binary");
      const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
      expect(modelBuffer.length).toBeGreaterThan(64);
      expect(modelBuffer.subarray(0, 4).toString("ascii")).toBe("glTF");
    } finally {
      await worker.close();
    }
  });
});
