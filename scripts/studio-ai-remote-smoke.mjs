/* eslint-env node */
/* global console, process, fetch, setTimeout, URL, Buffer */
import fs from "node:fs";
import path from "node:path";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = "true";
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return values;
};

const guessMimeType = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withAuthHeaders = (apiKey) =>
  apiKey
    ? {
        Authorization: `Bearer ${apiKey}`,
      }
    : {};

const ensureOk = async (response, context) => {
  if (response.ok) return;
  const message = (await response.text()).trim();
  throw new Error(`${context} failed (${response.status}): ${message || "no body"}`);
};

const parseBoolean = (value, fallback) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const main = async () => {
  const options = parseArgs();
  const baseUrl = (options["base-url"] || process.env.CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL || "").trim();
  const apiKey = (options["api-key"] || process.env.CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY || "").trim();
  const imagePath = path.resolve(options.image || "tests/fixtures/studio-ai/sample-input.png");
  const outputPath = path.resolve(options.output || "tmp/studio-ai-remote-smoke-model.glb");
  const pollMs = Number.parseInt(options["poll-ms"] || "1200", 10);
  const timeoutMs = Number.parseInt(options["timeout-ms"] || "900000", 10);
  const shouldTexture = parseBoolean(options["should-texture"], true);

  if (!baseUrl) {
    throw new Error("Missing --base-url (or CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL).");
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Input image not found: ${imagePath}`);
  }

  const upstreamBase = baseUrl.replace(/\/$/, "");
  const origin = new URL(upstreamBase).origin;
  const imageBuffer = fs.readFileSync(imagePath);
  const imageMime = guessMimeType(imagePath);
  const imageDataUri = `data:${imageMime};base64,${imageBuffer.toString("base64")}`;

  console.log(`Smoke test upstream: ${upstreamBase}`);
  console.log(`Input image: ${imagePath}`);
  console.log(`Texturing enabled: ${shouldTexture}`);

  const healthResponse = await fetch(`${origin}/health`, {
    headers: withAuthHeaders(apiKey),
  });
  await ensureOk(healthResponse, "Health check");
  const healthBody = await healthResponse.text();
  console.log(`Health response: ${healthBody}`);

  const createResponse = await fetch(`${upstreamBase}/image-to-3d`, {
    method: "POST",
    headers: {
      ...withAuthHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageDataUri,
      image_role: "front",
      target_formats: ["glb"],
      should_texture: shouldTexture,
      ai_model: "latest",
    }),
  });
  await ensureOk(createResponse, "Create task");
  const createBody = await createResponse.json();
  const taskId = typeof createBody.result === "string" ? createBody.result.trim() : "";
  if (!taskId) {
    throw new Error(`Create task returned no task id: ${JSON.stringify(createBody)}`);
  }
  const debugLogUrl = `${upstreamBase}/image-to-3d/${encodeURIComponent(taskId)}/debug-log`;
  console.log(`Task id: ${taskId}`);
  console.log(`Debug log URL: ${debugLogUrl}`);

  const startedAt = Date.now();
  let finalTask = null;
  while (!finalTask) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Polling timed out after ${timeoutMs}ms.`);
    }
    const taskResponse = await fetch(`${upstreamBase}/image-to-3d/${encodeURIComponent(taskId)}`, {
      headers: withAuthHeaders(apiKey),
      cache: "no-store",
    });
    await ensureOk(taskResponse, "Poll task");
    const task = await taskResponse.json();
    const status = String(task.status || "");
    const progress = Number(task.progress || 0);
    console.log(`Task status: ${status} (${progress}%).`);
    if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED") {
      finalTask = task;
      break;
    }
    await sleep(pollMs);
  }

  if (finalTask.status !== "SUCCEEDED") {
    const errorMessage = finalTask?.task_error?.message || "unknown upstream error";
    try {
      const debugResponse = await fetch(debugLogUrl, {
        headers: withAuthHeaders(apiKey),
        cache: "no-store",
      });
      if (debugResponse.ok) {
        const debugBody = await debugResponse.json();
        const debugLog = typeof debugBody?.log === "string" ? debugBody.log.trim() : "";
        if (debugLog) {
          console.log("Debug log:");
          console.log(debugLog);
        }
      }
    } catch {
      // Ignore debug-log retrieval failures and keep the original task error.
    }
    throw new Error(`Task did not succeed. Status=${finalTask.status}. Error=${errorMessage}`);
  }

  const modelUrl =
    typeof finalTask?.model_urls?.glb === "string" && finalTask.model_urls.glb.trim()
      ? finalTask.model_urls.glb.trim()
      : `${upstreamBase}/image-to-3d/${encodeURIComponent(taskId)}/output/model.glb`;
  const modelResponse = await fetch(modelUrl, {
    headers: withAuthHeaders(apiKey),
  });
  await ensureOk(modelResponse, "Download GLB");
  const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, modelBuffer);
  console.log(`Downloaded GLB: ${outputPath}`);
  console.log("Remote smoke test succeeded.");
};

main().catch((error) => {
  console.error(`Remote smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
