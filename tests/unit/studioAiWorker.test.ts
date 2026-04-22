import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const makeTempDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
const restoreEnv = (name: string, value: string | undefined) => {
  if (typeof value === "string") {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
};

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAElEQVR4nGNgAAAAAgAB5SfUogAAAABJRU5ErkJggg==",
  "base64",
);

describe("studio AI worker contract", () => {
  const priorStateDir = process.env.OPENCLAW_STATE_DIR;
  const priorPort = process.env.CLAW3D_STUDIO_PROVIDER_PORT;
  const priorWorkerMode = process.env.CLAW3D_STUDIO_WORKER_MODE;
  const priorUpstreamUrl = process.env.CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL;
  const priorUpstreamApiKey = process.env.CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY;
  const priorPublicBaseUrl = process.env.CLAW3D_STUDIO_PROVIDER_PUBLIC_URL;
  let tempDir: string | null = null;

  afterEach(() => {
    restoreEnv("OPENCLAW_STATE_DIR", priorStateDir);
    restoreEnv("CLAW3D_STUDIO_PROVIDER_PORT", priorPort);
    restoreEnv("CLAW3D_STUDIO_WORKER_MODE", priorWorkerMode);
    restoreEnv("CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL", priorUpstreamUrl);
    restoreEnv("CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY", priorUpstreamApiKey);
    restoreEnv("CLAW3D_STUDIO_PROVIDER_PUBLIC_URL", priorPublicBaseUrl);
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
          image_urls: [
            `data:image/png;base64,${ONE_BY_ONE_PNG.toString("base64")}`,
            `data:image/png;base64,${ONE_BY_ONE_PNG.toString("base64")}`,
          ],
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
        depth_preview_url?: string;
        normal_preview_url?: string;
        adapter_id?: string;
        width?: number;
        height?: number;
        palette?: string[];
      } = {};
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const taskResponse = await fetch(`http://127.0.0.1:3345/openapi/v1/image-to-3d/${taskId}`);
        expect(taskResponse.status).toBe(200);
        taskBody = (await taskResponse.json()) as typeof taskBody;
        if (taskBody.status === "SUCCEEDED") break;
      }

      expect(taskBody.status).toBe("SUCCEEDED");
      expect(taskBody.adapter_id).toBe("portrait_volume");
      expect(taskBody.thumbnail_url).toMatch(/thumbnail\.png$/);
      expect(taskBody.depth_preview_url).toMatch(/depth\.png$/);
      expect(taskBody.normal_preview_url).toMatch(/normal\.png$/);
      expect(taskBody.model_urls?.glb).toMatch(/model\.glb$/);
      expect(taskBody.width).toBeGreaterThan(0);
      expect(taskBody.height).toBeGreaterThan(0);
      expect((taskBody.palette ?? []).length).toBeGreaterThan(0);

      const thumbnailResponse = await fetch(taskBody.thumbnail_url!);
      expect(thumbnailResponse.status).toBe(200);
      expect(thumbnailResponse.headers.get("content-type")).toBe("image/png");

      const depthResponse = await fetch(taskBody.depth_preview_url!);
      expect(depthResponse.status).toBe(200);
      expect(depthResponse.headers.get("content-type")).toBe("image/png");

      const normalResponse = await fetch(taskBody.normal_preview_url!);
      expect(normalResponse.status).toBe(200);
      expect(normalResponse.headers.get("content-type")).toBe("image/png");

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

  it("delegates to an upstream provider and serves downloaded artifacts", async () => {
    tempDir = makeTempDir("studio-ai-worker-upstream");
    process.env.OPENCLAW_STATE_DIR = tempDir;
    process.env.CLAW3D_STUDIO_PROVIDER_PORT = "3346";
    process.env.CLAW3D_STUDIO_WORKER_MODE = "upstream_openapi";
    process.env.CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL = "http://127.0.0.1:4455/openapi/v1";

    let pollCount = 0;
    const upstreamServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1:4455");
      const pathname = url.pathname;
      if (req.method === "POST" && pathname === "/openapi/v1/image-to-3d") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: "provider-task-123" }));
        return;
      }
      if (req.method === "GET" && pathname === "/openapi/v1/image-to-3d/provider-task-123") {
        pollCount += 1;
        const status = pollCount >= 2 ? "SUCCEEDED" : "IN_PROGRESS";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "provider-task-123",
            adapter_id: "heightfield-relief",
            status,
            progress: status === "SUCCEEDED" ? 100 : 45,
            model_urls:
              status === "SUCCEEDED"
                ? { glb: "http://127.0.0.1:4455/files/model.glb" }
                : {},
            thumbnail_url:
              status === "SUCCEEDED"
                ? "http://127.0.0.1:4455/files/thumbnail.png"
                : "",
            depth_preview_url:
              status === "SUCCEEDED" ? "http://127.0.0.1:4455/files/depth.png" : "",
            normal_preview_url:
              status === "SUCCEEDED" ? "http://127.0.0.1:4455/files/normal.png" : "",
            width: 768,
            height: 1024,
            palette: ["#111111", "#222222", "#333333", "#444444"],
          }),
        );
        return;
      }
      if (req.method === "GET" && pathname === "/files/model.glb") {
        res.writeHead(200, { "Content-Type": "model/gltf-binary" });
        res.end(Buffer.from("glTFprovider-model"));
        return;
      }
      if (req.method === "GET" && pathname === "/files/thumbnail.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(ONE_BY_ONE_PNG);
        return;
      }
      if (req.method === "GET" && pathname === "/files/depth.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(ONE_BY_ONE_PNG);
        return;
      }
      if (req.method === "GET" && pathname === "/files/normal.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(ONE_BY_ONE_PNG);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    await new Promise<void>((resolve, reject) => {
      upstreamServer.once("error", reject);
      upstreamServer.listen(4455, "127.0.0.1", () => resolve());
    });

    const { createStudioAiWorkerServer } = await import("../../server/studio-ai-worker.js");
    const worker = createStudioAiWorkerServer({
      host: "127.0.0.1",
      port: 3346,
    });

    await worker.start();
    try {
      const createResponse = await fetch("http://127.0.0.1:3346/openapi/v1/image-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: `data:image/png;base64,${ONE_BY_ONE_PNG.toString("base64")}`,
          model_type: "standard",
          adapter_id: "portrait-volume",
          texture_prompt: "person likeness",
        }),
      });
      expect(createResponse.status).toBe(200);
      const createBody = (await createResponse.json()) as { result?: string };
      const taskId = createBody.result ?? "";
      expect(taskId.length).toBeGreaterThan(0);

      let taskBody: {
        status?: string;
        adapter_id?: string;
        model_urls?: { glb?: string };
        thumbnail_url?: string;
        depth_preview_url?: string;
        normal_preview_url?: string;
        width?: number;
        height?: number;
        palette?: string[];
      } = {};
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const taskResponse = await fetch(`http://127.0.0.1:3346/openapi/v1/image-to-3d/${taskId}`);
        expect(taskResponse.status).toBe(200);
        taskBody = (await taskResponse.json()) as typeof taskBody;
        if (taskBody.status === "SUCCEEDED") break;
      }

      expect(taskBody.status).toBe("SUCCEEDED");
      expect(taskBody.adapter_id).toBe("heightfield_relief");
      expect(taskBody.model_urls?.glb).toMatch(/model\.glb$/);
      expect(taskBody.thumbnail_url).toMatch(/thumbnail\.png$/);
      expect(taskBody.depth_preview_url).toMatch(/depth\.png$/);
      expect(taskBody.normal_preview_url).toMatch(/normal\.png$/);
      expect(taskBody.width).toBe(768);
      expect(taskBody.height).toBe(1024);
      expect(taskBody.palette).toEqual(["#111111", "#222222", "#333333", "#444444"]);

      const modelResponse = await fetch(taskBody.model_urls!.glb!);
      expect(modelResponse.status).toBe(200);
      expect(modelResponse.headers.get("content-type")).toBe("model/gltf-binary");
      const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
      expect(modelBuffer.toString("utf8")).toBe("glTFprovider-model");
    } finally {
      await worker.close();
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });
});
