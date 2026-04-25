import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "public", "office-assets", "pixel");

const writePngFromDataUrl = async (filePath, dataUrl) => {
  const payload = dataUrl.replace(/^data:image\/png;base64,/, "");
  await writeFile(filePath, Buffer.from(payload, "base64"));
};

const generateCanvasPng = async (page, spec) =>
  page.evaluate(async ({ height, renderSource, width }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.imageSmoothingEnabled = false;
    const render = new Function("ctx", renderSource);
    render(ctx);
    return canvas.toDataURL("image/png");
  }, spec);

const commonSource = String.raw`
const px = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const strokeRect = (ctx, x, y, w, h, color, size = 2) => {
  px(ctx, x, y, w, size, color);
  px(ctx, x, y + h - size, w, size, color);
  px(ctx, x, y, size, h, color);
  px(ctx, x + w - size, y, size, h, color);
};
const drawAgent = (ctx, ox, oy, jacket, hair, skin, hat = null) => {
  px(ctx, ox + 17, oy + 7, 14, 8, hair);
  px(ctx, ox + 14, oy + 13, 20, 20, "#17120e");
  px(ctx, ox + 16, oy + 15, 16, 16, skin);
  px(ctx, ox + 15, oy + 10, 18, 8, hair);
  if (hat) {
    px(ctx, ox + 12, oy + 5, 24, 7, "#17120e");
    px(ctx, ox + 14, oy + 3, 18, 7, hat);
  }
  px(ctx, ox + 19, oy + 22, 3, 3, "#17120e");
  px(ctx, ox + 27, oy + 22, 3, 3, "#17120e");
  px(ctx, ox + 21, oy + 29, 8, 2, "#8a4a3f");
  px(ctx, ox + 11, oy + 33, 26, 19, "#17120e");
  px(ctx, ox + 13, oy + 35, 22, 15, jacket);
  px(ctx, ox + 8, oy + 36, 6, 17, "#17120e");
  px(ctx, ox + 34, oy + 36, 6, 17, "#17120e");
  px(ctx, ox + 9, oy + 38, 4, 13, jacket);
  px(ctx, ox + 35, oy + 38, 4, 13, jacket);
  px(ctx, ox + 15, oy + 51, 8, 9, "#17120e");
  px(ctx, ox + 26, oy + 51, 8, 9, "#17120e");
  px(ctx, ox + 16, oy + 52, 6, 7, "#1f3040");
  px(ctx, ox + 27, oy + 52, 6, 7, "#1f3040");
};
const drawDesk = (ctx, ox, oy) => {
  px(ctx, ox + 8, oy + 24, 80, 44, "#332214");
  px(ctx, ox + 12, oy + 20, 72, 42, "#9a6b36");
  px(ctx, ox + 16, oy + 24, 64, 6, "#bd8748");
  px(ctx, ox + 58, oy + 13, 20, 32, "#111820");
  px(ctx, ox + 61, oy + 16, 14, 20, "#284657");
  px(ctx, ox + 20, oy + 31, 28, 16, "#15191f");
  px(ctx, ox + 23, oy + 34, 22, 10, "#263b4c");
  px(ctx, ox + 23, oy + 53, 28, 5, "#2c2018");
  px(ctx, ox + 17, oy + 62, 10, 18, "#3d2a18");
  px(ctx, ox + 69, oy + 62, 10, 18, "#3d2a18");
};
const drawPlant = (ctx, ox, oy) => {
  px(ctx, ox + 36, oy + 60, 24, 20, "#3b2515");
  px(ctx, ox + 39, oy + 56, 18, 22, "#8a6134");
  px(ctx, ox + 27, oy + 30, 24, 24, "#2e7433");
  px(ctx, ox + 44, oy + 18, 26, 26, "#57a852");
  px(ctx, ox + 31, oy + 15, 22, 22, "#6ac45e");
  px(ctx, ox + 20, oy + 39, 28, 26, "#3f8f3e");
  px(ctx, ox + 55, oy + 36, 24, 25, "#2f7b35");
};
const drawBookshelf = (ctx, ox, oy) => {
  px(ctx, ox + 9, oy + 17, 78, 60, "#342215");
  px(ctx, ox + 13, oy + 13, 70, 60, "#8b5c31");
  px(ctx, ox + 18, oy + 20, 16, 11, "#4e89bf");
  px(ctx, ox + 36, oy + 20, 8, 11, "#db8a4c");
  px(ctx, ox + 47, oy + 20, 22, 11, "#7bc86c");
  px(ctx, ox + 18, oy + 43, 22, 11, "#d9c15d");
  px(ctx, ox + 45, oy + 43, 17, 11, "#cb5f8d");
  px(ctx, ox + 14, oy + 36, 68, 5, "#3a2414");
  px(ctx, ox + 14, oy + 60, 68, 5, "#3a2414");
};
`;

const agentsRender = `${commonSource}
drawAgent(ctx, 0, 0, "#2d7ecb", "#1c1714", "#d99562");
drawAgent(ctx, 48, 0, "#3a8f4f", "#352016", "#d99562", "#2367d1");
drawAgent(ctx, 96, 0, "#b74b86", "#71314e", "#d99562");
drawAgent(ctx, 144, 0, "#20304a", "#2b1d16", "#d99562");
`;

const objectsRender = `${commonSource}
drawDesk(ctx, 0, 0);
drawPlant(ctx, 96, 0);
drawBookshelf(ctx, 192, 0);
px(ctx, 299, 10, 58, 75, "#17384d");
px(ctx, 305, 16, 46, 55, "#69c6ee");
px(ctx, 310, 22, 36, 8, "#aeeaff");
px(ctx, 310, 34, 36, 8, "#4aa7d1");
px(ctx, 310, 47, 36, 8, "#4aa7d1");
px(ctx, 313, 73, 30, 7, "#273a45");
px(ctx, 391, 6, 82, 80, "#152234");
px(ctx, 397, 12, 70, 54, "#6aa7d3");
px(ctx, 404, 49, 10, 10, "#355d8a");
px(ctx, 420, 41, 10, 18, "#355d8a");
px(ctx, 436, 31, 10, 28, "#355d8a");
px(ctx, 452, 20, 10, 39, "#355d8a");
px(ctx, 484, 17, 80, 70, "#442817");
px(ctx, 490, 12, 68, 70, "#c84f3c");
px(ctx, 499, 25, 14, 12, "#23364a");
px(ctx, 519, 25, 14, 12, "#23364a");
px(ctx, 539, 25, 9, 12, "#23364a");
px(ctx, 503, 51, 40, 6, "#28170f");
px(ctx, 593, 8, 78, 82, "#2d1d12");
px(ctx, 599, 13, 66, 72, "#8b5b2c");
px(ctx, 604, 18, 56, 62, "#b8854d");
px(ctx, 612, 26, 40, 46, "#8b5b2c");
px(ctx, 689, 24, 30, 58, "#3d2615");
px(ctx, 676, 10, 56, 58, "#23642d");
px(ctx, 695, 2, 50, 50, "#3d8a3f");
px(ctx, 659, 32, 45, 43, "#1e5227");
`;

const tilesRender = String.raw`
const px = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const tile = (ox, base, line, accent) => {
  px(ctx, ox, 0, 32, 32, base);
  px(ctx, ox, 0, 32, 1, line);
  px(ctx, ox, 31, 32, 1, line);
  px(ctx, ox, 0, 1, 32, line);
  px(ctx, ox + 31, 0, 1, 32, line);
  px(ctx, ox + 3, 4, 6, 2, accent);
  px(ctx, ox + 18, 18, 8, 2, accent);
};
tile(0, "#40783f", "rgba(255,255,255,0.12)", "rgba(0,0,0,0.08)");
tile(32, "#3d6992", "rgba(255,255,255,0.12)", "rgba(0,0,0,0.08)");
tile(64, "#604080", "rgba(255,255,255,0.11)", "rgba(0,0,0,0.1)");
tile(96, "#d6cbb5", "rgba(77,62,42,0.2)", "rgba(255,255,255,0.16)");
tile(128, "#77706a", "rgba(255,255,255,0.1)", "rgba(0,0,0,0.08)");
px(ctx, 160, 0, 32, 32, "#8a5d31");
for (let y = 0; y < 32; y += 8) px(ctx, 160, y, 32, 2, "#6f4624");
px(ctx, 164, 4, 12, 2, "#b9854e");
px(ctx, 180, 20, 10, 2, "#b9854e");
`;

const manifest = {
  generatedBy: "scripts/generate-pixel-assets.mjs",
  tileSize: 32,
  sheets: {
    agents: {
      path: "/office-assets/pixel/agents.png",
      frame: { width: 48, height: 64 },
      frames: ["worker-blue", "worker-green", "worker-pink", "receptionist"],
    },
    objects: {
      path: "/office-assets/pixel/objects.png",
      frame: { width: 96, height: 96 },
      frames: ["desk", "plant", "bookshelf", "water-cooler", "monitor", "vending", "meeting-table", "tree"],
    },
    tiles: {
      path: "/office-assets/pixel/tiles.png",
      frame: { width: 32, height: 32 },
      frames: ["green", "blue", "purple", "beige", "gray", "wood"],
    },
  },
};

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await writePngFromDataUrl(
    path.join(outDir, "agents.png"),
    await generateCanvasPng(page, {
      width: 192,
      height: 64,
      renderSource: agentsRender,
    }),
  );
  await writePngFromDataUrl(
    path.join(outDir, "objects.png"),
    await generateCanvasPng(page, {
      width: 768,
      height: 96,
      renderSource: objectsRender,
    }),
  );
  await writePngFromDataUrl(
    path.join(outDir, "tiles.png"),
    await generateCanvasPng(page, {
      width: 192,
      height: 32,
      renderSource: tilesRender,
    }),
  );
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
} finally {
  await browser.close();
}

console.log(`Generated pixel assets in ${path.relative(rootDir, outDir)}`);
