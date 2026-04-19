const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const THREE = require("three");
const { PNG } = require("pngjs");
const jpeg = require("jpeg-js");

const DEFAULT_PORT = Number.parseInt(process.env.CLAW3D_STUDIO_PROVIDER_PORT || "3333", 10);
const DEFAULT_HOST = process.env.CLAW3D_STUDIO_PROVIDER_HOST || "127.0.0.1";
const TASK_TIMEOUT_MS = 1_200;
const TASK_METADATA_FILENAME = "task.json";

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

const writeTaskMetadata = (taskDir, task) => {
  const metadata = {
    id: task.id,
    adapterId: task.adapterId,
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    modelPath: task.modelPath ? path.basename(task.modelPath) : null,
    thumbnailPath: task.thumbnailPath ? path.basename(task.thumbnailPath) : null,
    errorMessage: task.errorMessage,
    sourceImagePath: task.sourceImagePath ? path.basename(task.sourceImagePath) : null,
    additionalImages: Array.isArray(task.additionalImages)
      ? task.additionalImages.map((image) => ({
          fileName: typeof image.fileName === "string" ? image.fileName : "",
          mimeType: typeof image.mimeType === "string" ? image.mimeType : "",
          role: typeof image.role === "string" ? image.role : "detail",
        }))
      : [],
    palette: task.palette,
    size: task.size,
  };
  fs.writeFileSync(
    path.join(taskDir, TASK_METADATA_FILENAME),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
};

const loadTaskMetadata = (rootDir, taskId) => {
  const taskDir = path.join(rootDir, taskId);
  const metadataPath = path.join(taskDir, TASK_METADATA_FILENAME);
  if (!fs.existsSync(metadataPath)) return null;
  const raw = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const revivePath = (fileName) => (typeof fileName === "string" && fileName ? path.join(taskDir, fileName) : null);
  const task = {
    id: typeof raw.id === "string" ? raw.id : taskId,
    adapterId: typeof raw.adapterId === "string" && raw.adapterId ? raw.adapterId : "heightfield-relief",
    status:
      raw.status === "PENDING" ||
      raw.status === "IN_PROGRESS" ||
      raw.status === "SUCCEEDED" ||
      raw.status === "FAILED" ||
      raw.status === "CANCELED"
        ? raw.status
        : "FAILED",
    progress: Number.isFinite(raw.progress) ? raw.progress : 0,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : 0,
    finishedAt: Number.isFinite(raw.finishedAt) ? raw.finishedAt : 0,
    modelPath: revivePath(raw.modelPath),
    thumbnailPath: revivePath(raw.thumbnailPath),
    errorMessage: typeof raw.errorMessage === "string" ? raw.errorMessage : "",
    sourceImagePath: revivePath(raw.sourceImagePath),
    additionalImages: Array.isArray(raw.additionalImages) ? raw.additionalImages : [],
    palette: Array.isArray(raw.palette) ? raw.palette : [],
    size:
      raw.size && typeof raw.size === "object"
        ? {
            width: Number.isFinite(raw.size.width) ? raw.size.width : 1024,
            height: Number.isFinite(raw.size.height) ? raw.size.height : 1024,
          }
        : { width: 1024, height: 1024 },
  };
  if (task.status === "PENDING" || task.status === "IN_PROGRESS") {
    task.status = "FAILED";
    task.progress = 100;
    task.finishedAt = Date.now();
    task.errorMessage = "Worker restarted before task completion.";
    writeTaskMetadata(taskDir, task);
  }
  return task;
};

const hex = (value) => value.toString(16).padStart(2, "0");
const rgbToHex = (red, green, blue) => `#${hex(red)}${hex(green)}${hex(blue)}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

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

const decodeRasterImage = (buffer, mimeType) => {
  const normalized = (mimeType || "").trim().toLowerCase();
  if (normalized === "image/png") {
    try {
      const png = PNG.sync.read(buffer);
      return {
        width: png.width,
        height: png.height,
        channels: 4,
        data: png.data,
      };
    } catch {
      const { width, height } = parsePngSize(buffer);
      return {
        width,
        height,
        channels: 0,
        data: null,
      };
    }
  }
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    try {
      const decoded = jpeg.decode(buffer, { useTArray: true });
      return {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
        data: decoded.data,
      };
    } catch {
      const { width, height } = parsePngSize(buffer);
      return {
        width,
        height,
        channels: 0,
        data: null,
      };
    }
  }
  const { width, height } = parsePngSize(buffer);
  return {
    width,
    height,
    channels: 0,
    data: null,
  };
};

const sampleIntensityGrid = (params, cells = 20) => {
  const { raster, buffer } = params;
  const grid = [];
  if (raster?.data && raster.width > 0 && raster.height > 0) {
    const data = raster.data;
    for (let row = 0; row < cells; row += 1) {
      const values = [];
      const y0 = Math.floor((row / cells) * raster.height);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / cells) * raster.height));
      for (let col = 0; col < cells; col += 1) {
        const x0 = Math.floor((col / cells) * raster.width);
        const x1 = Math.max(x0 + 1, Math.floor(((col + 1) / cells) * raster.width));
        let total = 0;
        let count = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const index = (y * raster.width + x) * 4;
            const red = data[index] ?? 0;
            const green = data[index + 1] ?? red;
            const blue = data[index + 2] ?? green;
            const alpha = data[index + 3] ?? 255;
            const luminance = ((red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255) * (alpha / 255);
            total += luminance;
            count += 1;
          }
        }
        values.push(clamp(Math.round((total / Math.max(count, 1)) * 1000) / 1000, 0, 1));
      }
      grid.push(values);
    }
    return grid;
  }
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

const sampleColorGrid = (params, cells = 20) => {
  const { raster, buffer } = params;
  const grid = [];
  if (raster?.data && raster.width > 0 && raster.height > 0) {
    const data = raster.data;
    for (let row = 0; row < cells; row += 1) {
      const values = [];
      const y0 = Math.floor((row / cells) * raster.height);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / cells) * raster.height));
      for (let col = 0; col < cells; col += 1) {
        const x0 = Math.floor((col / cells) * raster.width);
        const x1 = Math.max(x0 + 1, Math.floor(((col + 1) / cells) * raster.width));
        let redTotal = 0;
        let greenTotal = 0;
        let blueTotal = 0;
        let count = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const index = (y * raster.width + x) * 4;
            redTotal += data[index] ?? 0;
            greenTotal += data[index + 1] ?? data[index] ?? 0;
            blueTotal += data[index + 2] ?? data[index + 1] ?? 0;
            count += 1;
          }
        }
        values.push([
          Math.round(redTotal / Math.max(count, 1)),
          Math.round(greenTotal / Math.max(count, 1)),
          Math.round(blueTotal / Math.max(count, 1)),
        ]);
      }
      grid.push(values);
    }
    return grid;
  }
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

const averageColor = (values) => {
  if (!Array.isArray(values) || values.length === 0) return [127, 127, 127];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const value of values) {
    red += value?.[0] ?? 127;
    green += value?.[1] ?? 127;
    blue += value?.[2] ?? 127;
  }
  return [
    Math.round(red / values.length),
    Math.round(green / values.length),
    Math.round(blue / values.length),
  ];
};

const smoothGrid = (grid, iterations = 1) => {
  let current = grid.map((row) => row.slice());
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = current.map((row) => row.slice());
    for (let row = 0; row < current.length; row += 1) {
      for (let col = 0; col < current[row].length; col += 1) {
        let total = 0;
        let count = 0;
        for (let y = Math.max(0, row - 1); y <= Math.min(current.length - 1, row + 1); y += 1) {
          for (let x = Math.max(0, col - 1); x <= Math.min(current[row].length - 1, col + 1); x += 1) {
            total += current[y][x];
            count += 1;
          }
        }
        next[row][col] = total / Math.max(count, 1);
      }
    }
    current = next;
  }
  return current;
};

const buildPortraitMask = (rows, cols) => {
  const mask = [];
  for (let row = 0; row < rows; row += 1) {
    const y = rows <= 1 ? 0 : row / (rows - 1);
    const rowValues = [];
    for (let col = 0; col < cols; col += 1) {
      const x = cols <= 1 ? 0 : col / (cols - 1);
      const dx = (x - 0.5) / 0.36;
      const dy = (y - 0.44) / 0.54;
      const oval = 1 - clamp(dx * dx + dy * dy, 0, 1.8);
      const shoulders = 1 - clamp(Math.abs(x - 0.5) / 0.6, 0, 1);
      const shoulderWeight = smoothstep(0.58, 0.9, y) * shoulders * 0.55;
      const headWeight = smoothstep(0.02, 0.18, y) * (1 - smoothstep(0.68, 0.95, y));
      rowValues.push(clamp(oval * headWeight + shoulderWeight, 0, 1));
    }
    mask.push(rowValues);
  }
  return mask;
};

const applyPortraitRelief = (intensityGrid) => {
  const rows = intensityGrid.length;
  const cols = intensityGrid[0]?.length ?? 0;
  const smoothed = smoothGrid(intensityGrid, 2);
  const portraitMask = buildPortraitMask(rows, cols);
  const refined = smoothed.map((row, rowIndex) =>
    row.map((value, colIndex) => {
      const mask = portraitMask[rowIndex]?.[colIndex] ?? 0;
      const centered = value - 0.5;
      const sculpted =
        0.38 +
        mask * 0.72 +
        centered * 0.42 +
        Math.max(0, mask - 0.45) * 0.25;
      return clamp(sculpted, 0, 1);
    }),
  );
  return smoothGrid(refined, 1);
};

const samplePalette = (params) => {
  const { raster, buffer } = params;
  const buckets = new Map();
  if (raster?.data && raster.width > 0 && raster.height > 0) {
    const data = raster.data;
    const step = Math.max(1, Math.floor((raster.width * raster.height) / 1800));
    for (let pixel = 0; pixel < raster.width * raster.height; pixel += step) {
      const index = pixel * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
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
  } else {
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

class NodeFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        if (typeof this.onloadend === "function") {
          this.onloadend();
        }
      })
      .catch((error) => {
        throw error;
      });
  }
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = NodeFileReader;
}

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
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const { colorGrid, intensityGrid, palette, width, height } = params;
  const refinedIntensity = applyPortraitRelief(intensityGrid);
  const rows = refinedIntensity.length;
  const cols = refinedIntensity[0]?.length ?? 0;

  const scene = new THREE.Scene();
  const panelWidth = clamp((width / Math.max(height, 1)) * 5.8, 2.8, 7.2);
  const panelHeight = clamp((height / Math.max(width, 1)) * 7.2, 4.2, 8.4);

  const root = new THREE.Group();
  root.name = "self_hosted_heightfield_relief";

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth * 1.08, panelHeight * 1.08, 0.18),
    new THREE.MeshStandardMaterial({ color: palette[1] || "#666", roughness: 0.8 }),
  );
  frame.position.set(0, panelHeight * 0.5, -0.12);
  root.add(frame);

  const plane = new THREE.PlaneGeometry(panelWidth, panelHeight, cols - 1, rows - 1);
  const positions = plane.attributes.position;
  const colors = new Float32Array(rows * cols * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const intensity = refinedIntensity[row]?.[col] ?? 0.5;
      const xNormalized = cols <= 1 ? 0 : col / (cols - 1);
      const yNormalized = rows <= 1 ? 0 : row / (rows - 1);
      const edgeFadeX = smoothstep(0, 0.12, xNormalized) * (1 - smoothstep(0.88, 1, xNormalized));
      const edgeFadeY = smoothstep(0, 0.08, yNormalized) * (1 - smoothstep(0.92, 1, yNormalized));
      const edgeFade = clamp(edgeFadeX * edgeFadeY, 0, 1);
      positions.setZ(index, intensity * edgeFade * 1.25);
      const rgb = colorGrid[row]?.[col] ?? [127, 127, 127];
      colors[index * 3] = (rgb[0] ?? 127) / 255;
      colors[index * 3 + 1] = (rgb[1] ?? 127) / 255;
      colors[index * 3 + 2] = (rgb[2] ?? 127) / 255;
    }
  }
  plane.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  positions.needsUpdate = true;
  plane.computeVertexNormals();

  const relief = new THREE.Mesh(
    plane,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.76,
      metalness: 0.04,
      flatShading: false,
    }),
  );
  relief.position.set(0, panelHeight * 0.5, 0.02);
  root.add(relief);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth * 1.14, 0.22, panelHeight * 1.14),
    new THREE.MeshStandardMaterial({ color: palette[3] || "#222", roughness: 0.9 }),
  );
  base.position.set(0, -0.35, 0);
  root.add(base);

  const accent = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62, 0),
    new THREE.MeshStandardMaterial({
      color: palette[2] || palette[0] || "#fff",
      emissive: palette[2] || "#000",
      emissiveIntensity: 0.65,
      roughness: 0.16,
      metalness: 0.22,
    }),
  );
  accent.position.set(panelWidth * 0.42, panelHeight * 0.82, -0.8);
  root.add(accent);

  scene.add(root);

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
          return;
        }
        reject(new Error("Expected binary GLB output."));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true, trs: false },
    );
  });
  return glb;
};

const createHeightfieldAdapter = () => ({
  id: "heightfield-relief",
  async generate(params) {
    const raster = decodeRasterImage(params.buffer, params.mimeType);
    const size = {
      width: raster.width || parsePngSize(params.buffer).width,
      height: raster.height || parsePngSize(params.buffer).height,
    };
    const sampleParams = { raster, buffer: params.buffer };
    const palette = samplePalette(sampleParams);
    const intensityGrid = Array.isArray(params.fusedIntensityGrid) && params.fusedIntensityGrid.length > 0
      ? params.fusedIntensityGrid
      : sampleIntensityGrid(sampleParams, 24);
    const colorGrid = Array.isArray(params.fusedColorGrid) && params.fusedColorGrid.length > 0
      ? params.fusedColorGrid
      : sampleColorGrid(sampleParams, 24);
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

const createPortraitVolumeScene = async (params) => {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const { colorGrid, intensityGrid, palette, width, height } = params;
  const refinedIntensity = applyPortraitRelief(intensityGrid);
  const rows = refinedIntensity.length;
  const cols = refinedIntensity[0]?.length ?? 0;

  const scene = new THREE.Scene();
  const panelWidth = clamp((width / Math.max(height, 1)) * 6.2, 3.1, 7.8);
  const panelHeight = clamp((height / Math.max(width, 1)) * 8.1, 4.8, 9.2);
  const portraitMask = buildPortraitMask(rows, cols);
  const cellWidth = panelWidth / Math.max(cols, 1);
  const cellHeight = panelHeight / Math.max(rows, 1);

  const root = new THREE.Group();
  root.name = "self_hosted_portrait_volume";

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(panelWidth * 0.52, panelWidth * 0.58, 0.42, 24),
    new THREE.MeshStandardMaterial({
      color: palette[3] || "#171717",
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  pedestal.position.set(0, -0.4, 0);
  root.add(pedestal);

  const backPlate = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth * 1.02, panelHeight * 1.02, 0.14),
    new THREE.MeshStandardMaterial({
      color: palette[1] || "#4b5563",
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  backPlate.position.set(0, panelHeight * 0.48, -0.18);
  root.add(backPlate);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const mask = portraitMask[row]?.[col] ?? 0;
      if (mask < 0.06) continue;

      const intensity = refinedIntensity[row]?.[col] ?? 0.5;
      const rgb = colorGrid[row]?.[col] ?? [127, 127, 127];
      const xNormalized = cols <= 1 ? 0.5 : col / (cols - 1);
      const yNormalized = rows <= 1 ? 0.5 : row / (rows - 1);
      const hairBias = smoothstep(0.04, 0.22, yNormalized) * (1 - smoothstep(0.38, 0.5, yNormalized));
      const shoulderBias = smoothstep(0.62, 0.9, yNormalized) * 0.4;
      const depth = 0.16 + intensity * 0.9 * mask + hairBias * 0.32 + shoulderBias * 0.22;
      const centeredX = -panelWidth / 2 + cellWidth * col + cellWidth / 2;
      const centeredY = panelHeight - (panelHeight / rows) * row - cellHeight / 2;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(cellWidth * 0.96, cellHeight * 0.96, depth),
        new THREE.MeshStandardMaterial({
          color: rgbToHex(rgb[0] ?? 127, rgb[1] ?? 127, rgb[2] ?? 127),
          roughness: 0.72,
          metalness: 0.05,
        }),
      );
      box.position.set(centeredX, centeredY, depth * 0.5 - 0.04);
      box.rotation.y = (xNormalized - 0.5) * 0.08;
      root.add(box);
    }
  }

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(panelWidth * 0.18, 0.08, 12, 36),
    new THREE.MeshStandardMaterial({
      color: palette[2] || palette[0] || "#ffffff",
      emissive: palette[2] || "#000000",
      emissiveIntensity: 0.18,
      roughness: 0.18,
      metalness: 0.42,
    }),
  );
  collar.position.set(0, panelHeight * 0.18, 0.46);
  collar.rotation.x = Math.PI / 2;
  root.add(collar);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(panelWidth * 0.42, 0.04, 12, 48),
    new THREE.MeshStandardMaterial({
      color: palette[2] || palette[0] || "#ffffff",
      emissive: palette[2] || "#000000",
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.24,
    }),
  );
  halo.position.set(0, panelHeight * 0.58, -0.42);
  halo.rotation.x = Math.PI / 2;
  root.add(halo);

  scene.add(root);

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
          return;
        }
        reject(new Error("Expected binary GLB output."));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true, trs: false },
    );
  });

  return glb;
};

const createPortraitVolumeAdapter = () => ({
  id: "portrait-volume",
  async generate(params) {
    const raster = decodeRasterImage(params.buffer, params.mimeType);
    const size = {
      width: raster.width || parsePngSize(params.buffer).width,
      height: raster.height || parsePngSize(params.buffer).height,
    };
    const sampleParams = { raster, buffer: params.buffer };
    const palette = samplePalette(sampleParams);
    const intensityGrid = Array.isArray(params.fusedIntensityGrid) && params.fusedIntensityGrid.length > 0
      ? params.fusedIntensityGrid
      : sampleIntensityGrid(sampleParams, 18);
    const colorGrid = Array.isArray(params.fusedColorGrid) && params.fusedColorGrid.length > 0
      ? params.fusedColorGrid
      : sampleColorGrid(sampleParams, 18);
    const glb = await createPortraitVolumeScene({
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
  const heightfieldAdapter = createHeightfieldAdapter();
  const portraitVolumeAdapter = createPortraitVolumeAdapter();
  adapters.set(heightfieldAdapter.id, heightfieldAdapter);
  adapters.set(portraitVolumeAdapter.id, portraitVolumeAdapter);
  return {
    getAdapter(adapterId) {
      return adapters.get(adapterId) || portraitVolumeAdapter;
    },
    defaultAdapterId: portraitVolumeAdapter.id,
  };
};

const mergeRasterViews = (rasters) => {
  const available = rasters.filter(
    (raster) => raster && raster.data && raster.width > 0 && raster.height > 0,
  );
  if (available.length === 0) {
    return null;
  }
  const width = Math.max(...available.map((raster) => raster.width));
  const height = Math.max(...available.map((raster) => raster.height));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      for (const raster of available) {
        const sx = Math.min(
          raster.width - 1,
          Math.max(0, Math.round((x / Math.max(width - 1, 1)) * (raster.width - 1))),
        );
        const sy = Math.min(
          raster.height - 1,
          Math.max(0, Math.round((y / Math.max(height - 1, 1)) * (raster.height - 1))),
        );
        const index = (sy * raster.width + sx) * 4;
        red += raster.data[index] ?? 0;
        green += raster.data[index + 1] ?? red;
        blue += raster.data[index + 2] ?? green;
        alpha += raster.data[index + 3] ?? 255;
        count += 1;
      }
      const out = (y * width + x) * 4;
      data[out] = Math.round(red / Math.max(count, 1));
      data[out + 1] = Math.round(green / Math.max(count, 1));
      data[out + 2] = Math.round(blue / Math.max(count, 1));
      data[out + 3] = Math.round(alpha / Math.max(count, 1));
    }
  }

  return {
    width,
    height,
    channels: 4,
    data,
  };
};

const roleWeight = (role) => {
  if (role === "front") return 1;
  if (role === "side") return 0.72;
  if (role === "back") return 0.35;
  if (role === "detail") return 0.55;
  return 0.6;
};

const fuseIntensityViews = (views) => {
  if (!Array.isArray(views) || views.length === 0) return [];
  const baseGrid = views[0]?.intensityGrid ?? [];
  return baseGrid.map((row, rowIndex) =>
    row.map((_, colIndex) => {
      let total = 0;
      let weightTotal = 0;
      for (const view of views) {
        const value = view?.intensityGrid?.[rowIndex]?.[colIndex];
        if (typeof value !== "number") continue;
        const weight = roleWeight(view.role);
        total += value * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? total / weightTotal : 0.5;
    }),
  );
};

const fuseColorViews = (views) => {
  if (!Array.isArray(views) || views.length === 0) return [];
  const baseGrid = views[0]?.colorGrid ?? [];
  return baseGrid.map((row, rowIndex) =>
    row.map((_, colIndex) => {
      const palette = [];
      for (const view of views) {
        const color = view?.colorGrid?.[rowIndex]?.[colIndex];
        if (!Array.isArray(color)) continue;
        const copies = Math.max(1, Math.round(roleWeight(view.role) * 2));
        for (let i = 0; i < copies; i += 1) {
          palette.push(color);
        }
      }
      return averageColor(palette);
    }),
  );
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
    adapter_id: task.adapterId,
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
    writeTaskMetadata(taskDir, task);

    setTimeout(async () => {
      task.status = "IN_PROGRESS";
      task.progress = 18;
      task.startedAt = Date.now();
      writeTaskMetadata(taskDir, task);
      try {
        const baseRaster = decodeRasterImage(params.buffer, params.mimeType || "image/png");
        const baseSampleParams = { raster: baseRaster, buffer: params.buffer };
        const viewSamples = [
          {
            role: params.role || "front",
            intensityGrid: sampleIntensityGrid(baseSampleParams, 18),
            colorGrid: sampleColorGrid(baseSampleParams, 18),
          },
          ...(Array.isArray(params.additionalImages)
            ? params.additionalImages.map((image) => {
                const raster = decodeRasterImage(image.buffer, image.mimeType || "image/png");
                const sampleParams = { raster, buffer: image.buffer };
                return {
                  role: image.role || "detail",
                  intensityGrid: sampleIntensityGrid(sampleParams, 18),
                  colorGrid: sampleColorGrid(sampleParams, 18),
                };
              })
            : []),
        ];
        const mergedRaster = mergeRasterViews([
          baseRaster,
          ...(Array.isArray(params.additionalImages)
            ? params.additionalImages.map((image) =>
                decodeRasterImage(image.buffer, image.mimeType || "image/png"),
              )
            : []),
        ]);
        const result = await adapter.generate({
          buffer: params.buffer,
          raster: mergedRaster,
          mimeType: params.mimeType || "image/png",
          sourceImagePath,
          prompt: params.prompt || "",
          mode: params.mode || "image_mesh",
          fusedIntensityGrid: fuseIntensityViews(viewSamples),
          fusedColorGrid: fuseColorViews(viewSamples),
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
        writeTaskMetadata(taskDir, task);
      } catch (error) {
        task.status = "FAILED";
        task.progress = 100;
        task.finishedAt = Date.now();
        task.errorMessage = error instanceof Error ? error.message : String(error);
        writeTaskMetadata(taskDir, task);
      }
    }, TASK_TIMEOUT_MS);

    return { result: taskId, task: toTaskObject(task, baseUrl) };
  };

  return {
    listAdapters() {
      return adapterRegistry.listAdapters();
    },
    initialize() {
      for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const task = loadTaskMetadata(rootDir, entry.name);
        if (!task) continue;
        tasks.set(task.id, task);
      }
    },
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
  taskStore.initialize();

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

      if (req.method === "GET" && pathname === "/openapi/v1/image-to-3d/adapters") {
        respondJson(res, 200, {
          adapters: taskStore.listAdapters(),
        });
        return;
      }

      if (req.method === "POST" && pathname === "/openapi/v1/image-to-3d") {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody.toString("utf8"));
        const { buffer, mimeType } = await decodeImageUrl(body.image_url);
        const additionalImages = [];
        if (Array.isArray(body.image_urls)) {
          for (const imageUrl of body.image_urls) {
            if (typeof imageUrl !== "string" || !imageUrl.trim()) continue;
            additionalImages.push(await decodeImageUrl(imageUrl));
          }
        }
        const created = await taskStore.createTask(
          {
            buffer,
            additionalImages,
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
            mimeType,
            role:
              body.image_role === "front" || body.image_role === "side" || body.image_role === "back" || body.image_role === "detail"
                ? body.image_role
                : "front",
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
