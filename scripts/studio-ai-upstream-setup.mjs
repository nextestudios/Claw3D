/* eslint-env node */
/* global console, process */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const venvDir = path.join(repoRoot, ".venv-studio-ai-backend");
const requirementsPath = path.join(repoRoot, "server", "studio-ai-real-backend.requirements.txt");
const hunyuan21Dir =
  process.env.CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT?.trim() ||
  path.join(os.homedir(), ".cache", "claw3d", "Hunyuan3D-2.1");
const requestedPython = process.env.PYTHON?.trim();

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const resolvePythonCommand = () => {
  if (requestedPython) {
    return requestedPython;
  }
  return process.platform === "win32" ? "python" : "python3";
};

const resolveVenvPython = () =>
  process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

if (!fs.existsSync(venvDir)) {
  run(resolvePythonCommand(), ["-m", "venv", ".venv-studio-ai-backend"]);
}

const venvPython = resolveVenvPython();
if (!fs.existsSync(venvPython)) {
  console.error("The Studio AI backend virtual environment is missing its Python executable.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(hunyuan21Dir), { recursive: true });
if (!fs.existsSync(path.join(hunyuan21Dir, ".git"))) {
  run("git", ["clone", "--depth", "1", "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git", hunyuan21Dir]);
}

run(venvPython, ["-m", "pip", "install", "-U", "pip", "setuptools", "wheel"]);
run(venvPython, ["-m", "pip", "install", "-r", requirementsPath]);
