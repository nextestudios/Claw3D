const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const THREE = require("three");

const DEFAULT_PORT = Number.parseInt(process.env.CLAW3D_STUDIO_PROVIDER_PORT || "3333", 10);
const DEFAULT_HOST = process.env.CLAW3D_STUDIO_PROVIDER_HOST || "127.0.0.1";
const TASK_TIMEOUT_MS = 1_200;

const respondJson = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
};

const respondFile = (res, statusCode, filePath, contentType) => {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  fs.createReadStream(filePath).pipe(res);
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const resolveStateDir = () => {
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".openclaw");
};

const resolveWorkerDir = () => {
  const dir = path.join(resolveStateDir(), "claw3d", "studio-ai-worker");
  ensureDirectory(dir);
  return dir;
};

const hex = (value) => value.toString(16).padStart(2, "0");
const rgbToHex = (red, green, blue) => `#${hex(red)}${hex(green)}${hex(blue)}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parsePngSize = (buffer) => {
  if (buffer.length < 24) return { width: 1024, height: 1024 };
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(expected)) return { width: 1024, height: 1024 };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const sampleIntensityGrid = (buffer, cells = 20) => {
  const grid = [];
  const length = Math.max(buffer.length, 3);
  for (let row = 0; row < cells; row += 1) {
    const values = [];
    for (let col = 0; col < cells; col += 1) {
      const normalizedIndex = (row * cells + col) / Math.max(cells * cells - 1, 1);
      const offset = Math.min(Math.floor(normalizedIndex * (length - 3)), length - 3);
      const red = buffer[offset] ?? 0;
      const green = buffer[offset + 1] ?? red;
      const blue = buffer[offset + 2] ?? green;
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      values.push(clamp(Math.round(luminance * 1000) / 1000, 0, 1));
    }
    grid.push(values);
  }
  return grid;
};

const sampleColorGrid = (buffer, cells = 20) => {
  const grid = [];
  const length = Math.max(buffer.length, 3);
  for (let row = 0; row < cells; row += 1) {
    const values = [];
    for (let col = 0; col < cells; col += 1) {
      const normalizedIndex = (row * cells + col) / Math.max(cells * cells - 1, 1);
      const offset = Math.min(Math.floor(normalizedIndex * (length - 3)), length - 3);
      values.push([
        buffer[offset] ?? 0,
        buffer[offset + 1] ?? buffer[offset] ?? 0,
        buffer[offset + 2] ?? buffer[offset + 1] ?? 0,
      ]);
    }
    grid.push(values);
  }
  return grid;
};

const samplePalette = (buffer) => {
  const buckets = new Map();
  const step = Math.max(3, Math.floor(buffer.length / 1800));
  for (let index = 0; index + 2 < buffer.length; index += step) {
    const red = buffer[index] ?? 0;
    const green = buffer[index + 1] ?? 0;
    const blue = buffer[index + 2] ?? 0;
    const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      current.red += red;
      current.green += green;
      current.blue += blue;
    } else {
      buckets.set(key, { count: 1, red, green, blue });
    }
  }
  const colors = Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, 4)
    .map((bucket) =>
      rgbToHex(
        Math.round(bucket.red / bucket.count),
        Math.round(bucket.green / bucket.count),
        Math.round(bucket.blue / bucket.count),
      ),
    );
  while (colors.length < 4) {
    colors.push(colors[colors.length - 1] || "#8b5cf6");
  }
  return colors;
};

const decodeImageUrl = async (imageUrl) => {
  const trimmed = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!trimmed) {
    throw new Error("image_url is required.");
  }
  if (trimmed.startsWith("data:")) {
    const idx = trimmed.indexOf(",");
    if (idx === -1) throw new Error("Invalid data URI.");
    const meta = trimmed.slice(5, idx);
    const mimeType = meta.split(";")[0] || "image/png";
    return {
      buffer: Buffer.from(trimmed.slice(idx + 1), "base64"),
      mimeType,
    };
  }
  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error(`Failed to download image_url (${response.status}).`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "image/png",
  };
};

const createHeightfieldScene = async (params) => {
  const {
    colorGrid,
    intensityGrid,
    palette,
    width,
    height,
  } = params;
  const rows = intensityGrid.length;
  const cols = intensityGrid[0]?.length ?? 0;

  const panelWidth = clamp((width / Math.max(height, 1)) * 5.8, 2.8, 7.2);
  const panelHeight = clamp((height / Math.max(width, 1)) * 7.2, 4.2, 8.4);
  const summary = {
    generator: "self-hosted-heightfield-relief",
    dimensions: { width, height },
    panel: { width: panelWidth, height: panelHeight },
    rows,
    cols,
    palette,
    intensityPreview: intensityGrid.slice(0, 4).map((row) => row.slice(0, 4)),
    colorPreview: colorGrid.slice(0, 2).map((row) => row.slice(0, 2)),
    note:
      "Placeholder binary artifact emitted by the self-hosted worker scaffold. Replace this with a real mesh serializer/model backend.",
  };
  return Buffer.from(JSON.stringify(summary, null, 2), "utf8");
};

const createHeightfieldAdapter = () => ({
  id: "heightfield-relief",
  async generate(params) {
    const size = parsePngSize(params.buffer);
    const palette = samplePalette(params.buffer);
    const intensityGrid = sampleIntensityGrid(params.buffer, 20);
    const colorGrid = sampleColorGrid(params.buffer, 20);
    const glb = await createHeightfieldScene({
      colorGrid,
      intensityGrid,
      palette,
      width: size.width,
      height: size.height,
    });
    return {
      palette,
      size,
      glb,
      thumbnailSourcePath: params.sourceImagePath,
    };
  },
});

const createAdapterRegistry = () => {
  const adapters = new Map();
  const defaultAdapter = createHeightfieldAdapter();
  adapters.set(defaultAdapter.id, defaultAdapter);
  return {
    getAdapter(adapterId) {
      return adapters.get(adapterId) || defaultAdapter;
    },
    defaultAdapterId: defaultAdapter.id,
  };
};

const createTaskStore = () => {
  const tasks = new Map();
  const rootDir = resolveWorkerDir();
  const adapterRegistry = createAdapterRegistry();

  const getTaskDir = (taskId) => {
    const dir = path.join(rootDir, taskId);
    ensureDirectory(dir);
    return dir;
  };

  const toTaskObject = (task, baseUrl) => ({
    id: task.id,
    type: "image-to-3d",
    model_urls: task.modelPath
      ? {
          glb: `${baseUrl}/openapi/v1/image-to-3d/${task.id}/output/model.glb`,
        }
      : {},
    thumbnail_url: task.thumbnailPath
      ? `${baseUrl}/openapi/v1/image-to-3d/${task.id}/output/thumbnail.png`
      : "",
    progress: task.progress,
    created_at: task.createdAt,
    started_at: task.startedAt,
    finished_at: task.finishedAt,
    status: task.status,
    texture_urls: [],
    task_error: {
      message: task.errorMessage || "",
    },
  });

  const createTask = async (params, baseUrl) => {
    const taskId = randomUUID();
    const taskDir = getTaskDir(taskId);
    const sourceImagePath = path.join(taskDir, "source.png");
    fs.writeFileSync(sourceImagePath, params.buffer);
    const adapterId = params.adapterId || adapterRegistry.defaultAdapterId;
    const adapter = adapterRegistry.getAdapter(adapterId);

    const task = {
      id: taskId,
      adapterId,
      status: "PENDING",
      progress: 0,
      createdAt: Date.now(),
      startedAt: 0,
      finishedAt: 0,
      modelPath: null,
      thumbnailPath: sourceImagePath,
      errorMessage: "",
      sourceImagePath,
      palette: [],
      size: { width: 1024, height: 1024 },
    };
    tasks.set(taskId, task);

    setTimeout(async () => {
      task.status = "IN_PROGRESS";
      task.progress = 18;
      task.startedAt = Date.now();
      try {
        const result = await adapter.generate({
          buffer: params.buffer,
          sourceImagePath,
          prompt: params.prompt || "",
          mode: params.mode || "image_mesh",
        });
        const modelPath = path.join(taskDir, "model.glb");
        fs.writeFileSync(modelPath, result.glb);
        task.modelPath = modelPath;
        task.thumbnailPath = result.thumbnailSourcePath || sourceImagePath;
        task.palette = result.palette || [];
        task.size = result.size || task.size;
        task.progress = 100;
        task.status = "SUCCEEDED";
        task.finishedAt = Date.now();
      } catch (error) {
        task.status = "FAILED";
        task.progress = 100;
        task.finishedAt = Date.now();
        task.errorMessage = error instanceof Error ? error.message : String(error);
      }
    }, TASK_TIMEOUT_MS);

    return { result: taskId, task: toTaskObject(task, baseUrl) };
  };

  return {
    createTask,
    getTask(taskId, baseUrl) {
      const task = tasks.get(taskId);
      if (!task) return null;
      return toTaskObject(task, baseUrl);
    },
    getTaskFile(taskId, kind) {
      const task = tasks.get(taskId);
      if (!task) return null;
      if (kind === "thumbnail") return task.thumbnailPath;
      if (kind === "model") return task.modelPath;
      return null;
    },
  };
};

const createStudioAiWorkerServer = (params = {}) => {
  const host = params.host || DEFAULT_HOST;
  const port = Number.isFinite(params.port) ? params.port : DEFAULT_PORT;
  const taskStore = createTaskStore();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      respondJson(res, 404, { error: "Not found." });
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${host}:${port}`);
    const pathname = url.pathname;
    const baseUrl = `http://${host}:${port}`;

    try {
      if (req.method === "GET" && pathname === "/health") {
        respondJson(res, 200, { ok: true, service: "studio-ai-worker" });
        return;
      }

      if (req.method === "POST" && pathname === "/openapi/v1/image-to-3d") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody.toString("utf8"));
        const { buffer } = await decodeImageUrl(body.image_url);
        const created = await taskStore.createTask(
          {
            buffer,
            adapterId:
              typeof body.adapter_id === "string" && body.adapter_id.trim()
                ? body.adapter_id.trim()
                : undefined,
            prompt:
              typeof body.texture_prompt === "string"
                ? body.texture_prompt
                : "",
            mode:
              body.model_type === "lowpoly" ? "image_avatar" : "image_mesh",
          },
          baseUrl,
        );
        respondJson(res, 200, { result: created.result });
        return;
      }

      const taskMatch = pathname.match(/^\/openapi\/v1\/image-to-3d\/([^/]+)$/);
      if (req.method === "GET" && taskMatch) {
        const task = taskStore.getTask(taskMatch[1], baseUrl);
        if (!task) {
          respondJson(res, 404, { error: "Task not found." });
          return;
        }
        respondJson(res, 200, task);
        return;
      }

      const modelMatch = pathname.match(/^\/openapi\/v1\/image-to-3d\/([^/]+)\/output\/model\.glb$/);
      if (req.method === "GET" && modelMatch) {
        const filePath = taskStore.getTaskFile(modelMatch[1], "model");
        if (!filePath || !fs.existsSync(filePath)) {
          respondJson(res, 404, { error: "Model not ready." });
          return;
        }
        respondFile(res, 200, filePath, "model/gltf-binary");
        return;
      }

      const thumbnailMatch = pathname.match(/^\/openapi\/v1\/image-to-3d\/([^/]+)\/output\/thumbnail\.png$/);
      if (req.method === "GET" && thumbnailMatch) {
        const filePath = taskStore.getTaskFile(thumbnailMatch[1], "thumbnail");
        if (!filePath || !fs.existsSync(filePath)) {
          respondJson(res, 404, { error: "Thumbnail not ready." });
          return;
        }
        respondFile(res, 200, filePath, "image/png");
        return;
      }

      respondJson(res, 404, { error: "Not found." });
    } catch (error) {
      respondJson(res, 500, {
        error: error instanceof Error ? error.message : "Worker failure.",
      });
    }
  });

  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
    host,
    port,
  };
};

async function main() {
  const worker = createStudioAiWorkerServer();
  await worker.start();
  console.info(`[studio-ai-worker] Listening on http://${worker.host}:${worker.port}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createStudioAiWorkerServer,
};
