/* eslint-env node */
/* global __dirname, console, module, process, require */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const requestedPython = process.env.CLAW3D_STUDIO_REAL_BACKEND_PYTHON?.trim() || "";

const resolvePythonBinary = () => {
  const candidates = [
    requestedPython,
    path.join(repoRoot, ".venv-studio-ai-backend", "bin", "python"),
    path.join(repoRoot, ".venv-studio-ai-backend", "Scripts", "python.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

async function main() {
  const pythonBinary = resolvePythonBinary();
  if (!pythonBinary) {
    throw new Error(
      "Studio AI backend environment is missing. Run `npm run studio-ai-upstream-setup` first or set CLAW3D_STUDIO_REAL_BACKEND_PYTHON.",
    );
  }

  const scriptPath = path.join(__dirname, "studio_ai_real_backend.py");
  const child = spawn(pythonBinary, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (child.killed) return;
    child.kill(signal);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        process.exitCode = 1;
      } else {
        process.exitCode = code ?? 0;
      }
      resolve();
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
