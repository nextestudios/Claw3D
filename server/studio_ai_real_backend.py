from __future__ import annotations

import base64
import importlib
import json
import os
import secrets
import sys
import threading
import time
import traceback
import types
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import pymeshlab
import torch
import trimesh
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

HOST = os.environ.get("CLAW3D_STUDIO_LOCAL_UPSTREAM_HOST", "127.0.0.1").strip() or "127.0.0.1"
PORT = int(os.environ.get("CLAW3D_STUDIO_LOCAL_UPSTREAM_PORT", "8080").strip() or "8080")
PUBLIC_BASE_URL = os.environ.get("CLAW3D_STUDIO_LOCAL_UPSTREAM_PUBLIC_URL", "").strip()
BACKEND_API_KEY = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_API_KEY", "").strip()
HY3DGEN_MODELS_ROOT = Path(os.environ.get("HY3DGEN_MODELS", "~/.cache/hy3dgen")).expanduser()
STATE_ROOT = Path(
    os.environ.get(
        "OPENCLAW_STATE_DIR",
        str(Path.home() / ".openclaw"),
    )
).expanduser()
TASK_ROOT = STATE_ROOT / "claw3d" / "studio-ai-real-backend"
HUNYUAN21_SOURCE_ROOT = Path(
    os.environ.get(
        "CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT",
        str(Path.home() / ".cache" / "claw3d" / "Hunyuan3D-2.1"),
    )
).expanduser()
MODEL_ID_SINGLE = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_MODEL_ID_SINGLE", "tencent/Hunyuan3D-2.1").strip()
MODEL_SUBFOLDER_SINGLE = os.environ.get(
    "CLAW3D_STUDIO_REAL_BACKEND_SUBFOLDER_SINGLE",
    "hunyuan3d-dit-v2-1",
).strip()
MODEL_ID_MULTI = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_MODEL_ID_MULTI", "tencent/Hunyuan3D-2mv").strip()
MODEL_SUBFOLDER_MULTI = os.environ.get(
    "CLAW3D_STUDIO_REAL_BACKEND_SUBFOLDER_MULTI",
    "hunyuan3d-dit-v2-mv",
).strip()
USE_SAFETENSORS = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_USE_SAFETENSORS", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
REMOVE_BACKGROUND = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_REMOVE_BACKGROUND", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ENABLE_FLASHVDM = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_ENABLE_FLASHVDM", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PRELOAD_SINGLE = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_PRELOAD_SINGLE", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
NUM_INFERENCE_STEPS = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_NUM_INFERENCE_STEPS", "30").strip() or "30"
)
GUIDANCE_SCALE = float(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_GUIDANCE_SCALE", "5.0").strip() or "5.0"
)
OCTREE_RESOLUTION = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_OCTREE_RESOLUTION", "384").strip() or "384"
)
NUM_CHUNKS = int(os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_NUM_CHUNKS", "20000").strip() or "20000")
MAX_CONCURRENT_TASKS = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_MAX_CONCURRENT_TASKS", "1").strip() or "1"
)
TARGET_IMAGE_SIZE = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_TARGET_IMAGE_SIZE", "1024").strip() or "1024"
)
CONDITION_PADDING_RATIO = float(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_CONDITION_PADDING_RATIO", "0.12").strip() or "0.12"
)
MIN_ALPHA_THRESHOLD = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_MIN_ALPHA_THRESHOLD", "8").strip() or "8"
)
ENABLE_TEXTURE_PIPELINE = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_ENABLE_TEXTURE_PIPELINE", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
TEXTURE_MAX_VIEW_COUNT = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_TEXTURE_MAX_VIEWS", "6").strip() or "6"
)
TEXTURE_RESOLUTION = int(
    os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_TEXTURE_RESOLUTION", "512").strip() or "512"
)
REALESRGAN_CHECKPOINT_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
)

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def resolve_device() -> str:
    requested = os.environ.get("CLAW3D_STUDIO_REAL_BACKEND_DEVICE", "auto").strip().lower()
    if requested in {"cpu", "mps", "cuda"}:
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


PREFERRED_DEVICE = resolve_device()


def dtype_for_device(device: str) -> torch.dtype:
    return torch.float16 if device in {"mps", "cuda"} else torch.float32


def uses_hunyuan21_runtime(model_id: str, subfolder: str) -> bool:
    normalized_model_id = model_id.lower()
    normalized_subfolder = subfolder.lower()
    return "hunyuan3d-2.1" in normalized_model_id or normalized_subfolder == "hunyuan3d-dit-v2-1"


def pretrained_variant_for(model_id: str, subfolder: str, device: str) -> str | None:
    if uses_hunyuan21_runtime(model_id, subfolder) and device in {"mps", "cuda"}:
        return "fp16"
    return None


def ensure_hunyuan21_source_paths() -> tuple[Path, Path]:
    hy3dshape_root = HUNYUAN21_SOURCE_ROOT / "hy3dshape"
    hy3dpaint_root = HUNYUAN21_SOURCE_ROOT / "hy3dpaint"
    if not hy3dshape_root.exists() or not hy3dpaint_root.exists():
        raise RuntimeError(
            "Hunyuan3D 2.1 source tree not found. "
            "Set CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT or run studio-ai-upstream-setup."
        )
    for candidate in (HUNYUAN21_SOURCE_ROOT, hy3dshape_root, hy3dpaint_root):
        candidate_str = str(candidate)
        if candidate.exists() and candidate_str not in sys.path:
            sys.path.insert(0, candidate_str)
    return hy3dshape_root, hy3dpaint_root


def resolve_shape_runtime(model_id: str, subfolder: str) -> tuple[Any, Any]:
    if uses_hunyuan21_runtime(model_id, subfolder):
        ensure_hunyuan21_source_paths()
        try:
            from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline as ShapePipeline
            from hy3dshape.rembg import BackgroundRemover as ShapeBackgroundRemover
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Hunyuan3D 2.1 source tree is present but could not be imported. "
                "Run studio-ai-upstream-setup to refresh the backend environment."
            ) from exc
        return ShapeBackgroundRemover, ShapePipeline

    from hy3dgen.rembg import BackgroundRemover as ShapeBackgroundRemover
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline as ShapePipeline

    return ShapeBackgroundRemover, ShapePipeline


def resolve_texture_runtime() -> tuple[Any, Any, Any]:
    ensure_hunyuan21_source_paths()
    try:
        __import__("bpy")
    except ModuleNotFoundError:
        sys.modules["bpy"] = types.SimpleNamespace()
    try:
        from torchvision_fix import apply_fix as apply_torchvision_fix

        apply_torchvision_fix()
    except Exception:
        pass
    try:
        import textureGenPipeline as texture_gen_pipeline_module
        from textureGenPipeline import Hunyuan3DPaintConfig as PaintConfig
        from textureGenPipeline import Hunyuan3DPaintPipeline as PaintPipeline
        from hy3dpaint.convert_utils import create_glb_with_pbr_materials
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Hunyuan3D 2.1 texture runtime could not be imported. "
            "Refresh the CUDA backend image or rerun studio-ai-upstream-setup."
        ) from exc
    patch_hunyuan_texture_runtime(texture_gen_pipeline_module)
    return PaintConfig, PaintPipeline, create_glb_with_pbr_materials


def patch_hunyuan_texture_runtime(texture_gen_pipeline_module: Any | None = None) -> None:
    try:
        simplify_mesh_utils = importlib.import_module("utils.simplify_mesh_utils")
    except ModuleNotFoundError:
        return

    if getattr(simplify_mesh_utils, "_claw3d_face_count_patch", False):
        return

    def mesh_simplify_trimesh(inputpath: str, outputpath: str, target_count: int = 40000) -> trimesh.Trimesh:
        mesh_set = pymeshlab.MeshSet()
        if inputpath.endswith(".glb"):
            mesh_set.load_new_mesh(inputpath, load_in_a_single_layer=True)
        else:
            mesh_set.load_new_mesh(inputpath)

        intermediate_obj_path = outputpath.replace(".glb", ".obj")
        mesh_set.save_current_mesh(intermediate_obj_path, save_textures=False)

        current_mesh = trimesh.load(intermediate_obj_path, force="mesh")
        face_count = current_mesh.faces.shape[0]
        if face_count > target_count:
            current_mesh = current_mesh.simplify_quadric_decimation(face_count=target_count)
        current_mesh.export(outputpath)
        return current_mesh

    def remesh_mesh(mesh_path: str, remesh_path: str) -> trimesh.Trimesh:
        return mesh_simplify_trimesh(mesh_path, remesh_path)

    simplify_mesh_utils.mesh_simplify_trimesh = mesh_simplify_trimesh
    simplify_mesh_utils.remesh_mesh = remesh_mesh
    if texture_gen_pipeline_module is not None:
        texture_gen_pipeline_module.remesh_mesh = remesh_mesh
    simplify_mesh_utils._claw3d_face_count_patch = True


def ensure_pretrained_model_files(
    *,
    model_id: str,
    subfolder: str,
    use_safetensors: bool,
    variant: str | None,
) -> None:
    model_root = HY3DGEN_MODELS_ROOT / model_id
    model_dir = model_root / subfolder
    suffix = "safetensors" if use_safetensors else "ckpt"
    variant_suffix = "" if not variant else f".{variant}"
    config_path = model_dir / "config.yaml"
    checkpoint_path = model_dir / f"model{variant_suffix}.{suffix}"
    if config_path.exists() and checkpoint_path.exists():
        return

    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:
        raise RuntimeError(
            "huggingface_hub is required to download missing Hunyuan model files."
        ) from exc

    ensure_dir(model_root)
    snapshot_download(
        repo_id=model_id,
        allow_patterns=[f"{subfolder}/*"],
        local_dir=str(model_root),
        local_dir_use_symlinks=False,
    )

    if not config_path.exists() or not checkpoint_path.exists():
        raise RuntimeError(
            f"Missing downloaded model artifacts for {model_id}/{subfolder}. "
            f"Expected {config_path.name} and {checkpoint_path.name} in {model_dir}."
        )


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_file_download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 0:
        return path
    ensure_dir(path.parent)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    with urllib.request.urlopen(url, timeout=300) as response:
        temporary_path.write_bytes(response.read())
    temporary_path.replace(path)
    return path


def ensure_realesrgan_checkpoint() -> Path:
    checkpoint_path = HUNYUAN21_SOURCE_ROOT / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth"
    return ensure_file_download(REALESRGAN_CHECKPOINT_URL, checkpoint_path)


def now_ms() -> int:
    return int(time.time() * 1000)


def sample_palette(image: Image.Image, colors: int = 4) -> list[str]:
    quantized = image.convert("RGB").quantize(colors=colors)
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    result: list[str] = []
    for _, index in counts[:colors]:
        offset = index * 3
        red = palette[offset] if offset < len(palette) else 0
        green = palette[offset + 1] if offset + 1 < len(palette) else 0
        blue = palette[offset + 2] if offset + 2 < len(palette) else 0
        result.append(f"#{red:02x}{green:02x}{blue:02x}")
    return result


def normalize_condition_image(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    alpha_mask = alpha.point(lambda value: 255 if value >= MIN_ALPHA_THRESHOLD else 0)
    bounding_box = alpha_mask.getbbox()
    if bounding_box is None:
        bounding_box = (0, 0, image.width, image.height)

    left, upper, right, lower = bounding_box
    width = max(right - left, 1)
    height = max(lower - upper, 1)
    padding = int(max(width, height) * CONDITION_PADDING_RATIO)
    left = max(0, left - padding)
    upper = max(0, upper - padding)
    right = min(image.width, right + padding)
    lower = min(image.height, lower + padding)
    cropped = image.crop((left, upper, right, lower))

    canvas = Image.new("RGBA", (TARGET_IMAGE_SIZE, TARGET_IMAGE_SIZE), (0, 0, 0, 0))
    inner_size = max(1, int(TARGET_IMAGE_SIZE * (1 - CONDITION_PADDING_RATIO * 2)))
    fitted = cropped.copy()
    fitted.thumbnail((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = (
        (TARGET_IMAGE_SIZE - fitted.width) // 2,
        (TARGET_IMAGE_SIZE - fitted.height) // 2,
    )
    canvas.paste(fitted, offset, fitted)
    return canvas


def build_reference_color_image(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[..., 3:4].astype(np.float32) / 255.0
    opaque = alpha[..., 0] > 0.05
    if opaque.any():
        average_rgb = rgba[..., :3][opaque].mean(axis=0, dtype=np.float32)
    else:
        average_rgb = np.array([214.0, 214.0, 214.0], dtype=np.float32)
    composited = rgba[..., :3].astype(np.float32) * alpha + average_rgb * (1.0 - alpha)
    return np.clip(composited, 0, 255).astype(np.uint8)


def sample_reference_band_color(
    rgba: np.ndarray,
    start_ratio: float,
    end_ratio: float,
    fallback_rgb: np.ndarray,
) -> np.ndarray:
    height = max(int(rgba.shape[0]), 1)
    start = int(np.clip(round(height * start_ratio), 0, max(height - 1, 0)))
    end = int(np.clip(round(height * end_ratio), start + 1, height))
    band = rgba[start:end]
    opaque = band[..., 3] > 12
    if opaque.any():
        return band[..., :3][opaque].mean(axis=0, dtype=np.float32)
    return fallback_rgb.astype(np.float32)


def infer_front_axis_sign(vertices: np.ndarray, normals: np.ndarray | None) -> float:
    if normals is None or normals.shape != vertices.shape or vertices.shape[0] < 8:
        return 1.0
    depth = vertices[:, 2]
    normal_depth = normals[:, 2]
    if float(np.std(depth)) < 1e-6 or float(np.std(normal_depth)) < 1e-6:
        return 1.0
    correlation = float(np.corrcoef(depth, normal_depth)[0, 1])
    if np.isnan(correlation):
        return 1.0
    return -1.0 if correlation < 0.0 else 1.0


def collect_mesh_geometries(mesh: Any) -> list[trimesh.Trimesh]:
    if isinstance(mesh, trimesh.Trimesh):
        return [mesh]
    if isinstance(mesh, trimesh.Scene):
        return [geometry for geometry in mesh.geometry.values() if isinstance(geometry, trimesh.Trimesh)]
    return []


def reduce_single_view_depth(mesh: Any) -> Any:
    geometries = collect_mesh_geometries(mesh)
    if not geometries:
        return mesh

    for geometry in geometries:
        vertices = np.asarray(geometry.vertices, dtype=np.float32).copy()
        if vertices.size == 0:
            continue
        normals = np.asarray(geometry.vertex_normals, dtype=np.float32) if len(geometry.faces) else None
        front_sign = infer_front_axis_sign(vertices, normals)
        minimum = vertices.min(axis=0)
        maximum = vertices.max(axis=0)
        span = np.maximum(maximum - minimum, 1e-6)
        height_ratio = np.clip((vertices[:, 1] - minimum[1]) / span[1], 0.0, 1.0)
        aligned_depth = vertices[:, 2] * front_sign
        center_depth = float((aligned_depth.min() + aligned_depth.max()) * 0.5)
        relative_depth = aligned_depth - center_depth
        back_scale = 0.34 + 0.18 * (1.0 - height_ratio)
        depth_scale = np.where(relative_depth >= 0.0, 0.84, back_scale)
        aligned_depth = center_depth + relative_depth * depth_scale
        vertices[:, 2] = aligned_depth * front_sign
        geometry.vertices = vertices
    return mesh


def apply_reference_texture_fallback(mesh: Any, image: Image.Image) -> Any:
    color_image = build_reference_color_image(image)
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    height, width = color_image.shape[:2]
    overall_rgb = color_image.reshape(-1, 3).mean(axis=0, dtype=np.float32)
    upper_rgb = sample_reference_band_color(rgba, 0.0, 0.42, overall_rgb)
    lower_rgb = sample_reference_band_color(rgba, 0.42, 1.0, overall_rgb)
    geometries = collect_mesh_geometries(mesh)
    if not geometries:
        return mesh

    for geometry in geometries:
        vertices = np.asarray(geometry.vertices, dtype=np.float32)
        if vertices.size == 0:
            continue
        normals = np.asarray(geometry.vertex_normals, dtype=np.float32) if len(geometry.faces) else None
        front_sign = infer_front_axis_sign(vertices, normals)
        minimum = vertices.min(axis=0)
        maximum = vertices.max(axis=0)
        span = np.maximum(maximum - minimum, 1e-6)
        u = np.clip((vertices[:, 0] - minimum[0]) / span[0], 0.0, 1.0)
        v = np.clip((vertices[:, 1] - minimum[1]) / span[1], 0.0, 1.0)
        pixel_x = np.clip(np.rint(u * (width - 1)).astype(np.int32), 0, width - 1)
        pixel_y = np.clip(np.rint((1.0 - v) * (height - 1)).astype(np.int32), 0, height - 1)
        sampled_rgb = color_image[pixel_y, pixel_x].astype(np.float32)
        aligned_depth = vertices[:, 2] * front_sign
        depth_span = max(float(aligned_depth.max() - aligned_depth.min()), 1e-6)
        depth_ratio = np.clip((aligned_depth - aligned_depth.min()) / depth_span, 0.0, 1.0).reshape(-1, 1)
        if normals is not None:
            normal_frontness = np.clip((normals[:, 2] * front_sign - 0.05) / 0.95, 0.0, 1.0).reshape(-1, 1)
        else:
            normal_frontness = np.ones((vertices.shape[0], 1), dtype=np.float32)
        front_weight = np.clip((depth_ratio - 0.35) / 0.65, 0.0, 1.0) * (0.2 + 0.8 * normal_frontness)
        fallback_rgb = lower_rgb * (1.0 - v.reshape(-1, 1)) + upper_rgb * v.reshape(-1, 1)
        final_rgb = np.clip(sampled_rgb * front_weight + fallback_rgb * (1.0 - front_weight), 0, 255).astype(
            np.uint8
        )
        alpha = np.full((final_rgb.shape[0], 1), 255, dtype=np.uint8)
        geometry.visual = trimesh.visual.ColorVisuals(
            mesh=geometry,
            vertex_colors=np.concatenate([final_rgb, alpha], axis=1),
        )
    return mesh


def guess_extension(mime_type: str) -> str:
    normalized = mime_type.strip().lower()
    if normalized == "image/jpeg":
        return ".jpg"
    if normalized == "image/webp":
        return ".webp"
    return ".png"


def decode_data_uri(value: str) -> tuple[bytes, str]:
    header, encoded = value.split(",", 1)
    mime_type = "image/png"
    if ";" in header and ":" in header:
        mime_type = header.split(":", 1)[1].split(";", 1)[0].strip() or mime_type
    return base64.b64decode(encoded), mime_type


def download_url(value: str) -> tuple[bytes, str]:
    with urllib.request.urlopen(value) as response:
        body = response.read()
        mime_type = response.headers.get_content_type() or "image/png"
    return body, mime_type


def load_image_bytes(value: str) -> tuple[bytes, str]:
    trimmed = value.strip()
    if trimmed.startswith("data:"):
        return decode_data_uri(trimmed)
    if trimmed.startswith("http://") or trimmed.startswith("https://"):
        return download_url(trimmed)
    raise ValueError("Only data URIs and http(s) image URLs are supported.")


def unwrap_mesh(candidate: Any) -> Any:
    value = candidate
    while isinstance(value, list) and value:
        value = value[0]
    return value


def resolve_request_base_url(request: Request) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL.rstrip("/")
    base = str(request.base_url).rstrip("/")
    return base


def file_response_or_404(path: str | None, media_type: str) -> FileResponse:
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(path, media_type=media_type)


def require_authorization(request: Request) -> None:
    if not BACKEND_API_KEY:
        return
    received = request.headers.get("authorization", "").strip()
    expected = f"Bearer {BACKEND_API_KEY}"
    if not secrets.compare_digest(received, expected):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def normalize_role(value: str | None) -> str:
    if value in {"front", "side", "back", "detail"}:
        return value
    return "detail"


def assign_multiview_key(role: str, used: set[str]) -> str | None:
    if role == "front" and "front" not in used:
        return "front"
    if role == "back" and "back" not in used:
        return "back"
    if role == "side":
        for candidate in ("left", "right"):
            if candidate not in used:
                return candidate
    if role == "detail":
        for candidate in ("left", "right", "back"):
            if candidate not in used:
                return candidate
    if "front" not in used:
        return "front"
    return None


@dataclass
class TaskImage:
    file_name: str
    mime_type: str
    role: str
    path: str


@dataclass
class TaskRecord:
    id: str
    status: str
    progress: int
    created_at: int
    started_at: int
    finished_at: int
    adapter_id: str
    width: int | None
    height: int | None
    palette: list[str] = field(default_factory=list)
    error_message: str = ""
    model_path: str | None = None
    thumbnail_path: str | None = None
    request_images: list[TaskImage] = field(default_factory=list)
    using_test_mode: bool = False
    should_texture: bool = True

    def to_response(self, base_url: str) -> dict[str, Any]:
        base = base_url.rstrip("/")
        return {
            "id": self.id,
            "type": "image-to-3d",
            "adapter_id": self.adapter_id,
            "model_urls": {
                "glb": f"{base}/openapi/v1/image-to-3d/{self.id}/output/model.glb",
            }
            if self.model_path
            else {},
            "thumbnail_url": "",
            "depth_preview_url": "",
            "normal_preview_url": "",
            "progress": self.progress,
            "width": self.width,
            "height": self.height,
            "palette": self.palette,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "status": self.status,
            "texture_urls": [],
            "task_error": {
                "message": self.error_message,
            },
            "using_test_mode": self.using_test_mode,
        }


class PipelineManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._background_remover: Any | None = None
        self._pipelines: dict[tuple[str, str], Any] = {}
        self._texture_pipelines: dict[str, tuple[Any, Any]] = {}

    def _create_pipeline(
        self,
        *,
        device: str,
        model_id: str,
        subfolder: str,
    ) -> Any:
        _, pipeline_class = resolve_shape_runtime(model_id, subfolder)
        variant = pretrained_variant_for(model_id, subfolder, device)
        ensure_pretrained_model_files(
            model_id=model_id,
            subfolder=subfolder,
            use_safetensors=USE_SAFETENSORS,
            variant=variant,
        )
        pipeline = pipeline_class.from_pretrained(
            model_id,
            subfolder=subfolder,
            device=device,
            dtype=dtype_for_device(device),
            variant=variant,
            use_safetensors=USE_SAFETENSORS,
        )
        if device == "mps" and hasattr(pipeline, "scheduler") and hasattr(pipeline.scheduler, "sigmas"):
            pipeline.scheduler.sigmas = pipeline.scheduler.sigmas.float()
        if ENABLE_FLASHVDM and "turbo" in subfolder and hasattr(pipeline, "enable_flashvdm"):
            try:
                pipeline.enable_flashvdm(topk_mode="merge")
            except Exception:
                pass
        return pipeline

    def get_pipeline(self, kind: str, device: str = PREFERRED_DEVICE) -> Any:
        with self._lock:
            cache_key = (kind, device)
            cached = self._pipelines.get(cache_key)
            if cached is not None:
                return cached
            pipeline = self._create_pipeline(
                device=device,
                model_id=MODEL_ID_MULTI if kind == "multi" else MODEL_ID_SINGLE,
                subfolder=MODEL_SUBFOLDER_MULTI if kind == "multi" else MODEL_SUBFOLDER_SINGLE,
            )
            self._pipelines[cache_key] = pipeline
            return pipeline

    def get_background_remover(self) -> Any | None:
        if not REMOVE_BACKGROUND:
            return None
        with self._lock:
            if self._background_remover is None:
                background_remover_class, _ = resolve_shape_runtime(MODEL_ID_SINGLE, MODEL_SUBFOLDER_SINGLE)
                self._background_remover = background_remover_class()
            return self._background_remover

    def get_texture_pipeline(self, device: str = PREFERRED_DEVICE) -> tuple[Any, Any]:
        if device != "cuda":
            raise RuntimeError("Official Hunyuan texture generation requires CUDA.")
        with self._lock:
            cached = self._texture_pipelines.get(device)
            if cached is not None:
                return cached
            paint_config_class, paint_pipeline_class, glb_builder = resolve_texture_runtime()
            paint_config = paint_config_class(TEXTURE_MAX_VIEW_COUNT, TEXTURE_RESOLUTION)
            paint_config.device = device
            paint_config.realesrgan_ckpt_path = str(ensure_realesrgan_checkpoint())
            paint_config.multiview_cfg_path = str(
                HUNYUAN21_SOURCE_ROOT / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml"
            )
            paint_config.custom_pipeline = str(HUNYUAN21_SOURCE_ROOT / "hy3dpaint" / "hunyuanpaintpbr")
            pipeline = paint_pipeline_class(paint_config)
            cached = (pipeline, glb_builder)
            self._texture_pipelines[device] = cached
            return cached

    def preload_single_async(self) -> None:
        if not PRELOAD_SINGLE:
            return

        def preload() -> None:
            try:
                self.get_pipeline("single", PREFERRED_DEVICE)
            except Exception:
                pass

        thread = threading.Thread(target=preload, daemon=True)
        thread.start()


class TaskStore:
    def __init__(self) -> None:
        self._root = ensure_dir(TASK_ROOT)
        self._lock = threading.Lock()
        self._tasks: dict[str, TaskRecord] = {}
        self._executor = ThreadPoolExecutor(max_workers=max(1, MAX_CONCURRENT_TASKS))
        self._pipelines = PipelineManager()

    def initialize(self) -> None:
        for task_dir in self._root.iterdir():
            if not task_dir.is_dir():
                continue
            metadata_path = task_dir / "task.json"
            if not metadata_path.exists():
                continue
            try:
                raw = json.loads(metadata_path.read_text("utf-8"))
            except Exception:
                continue
            request_images = [
                TaskImage(
                    file_name=str(item.get("file_name", "")),
                    mime_type=str(item.get("mime_type", "image/png")),
                    role=normalize_role(str(item.get("role", "detail"))),
                    path=str(task_dir / str(item.get("file_name", ""))),
                )
                for item in raw.get("request_images", [])
                if isinstance(item, dict)
            ]
            task = TaskRecord(
                id=str(raw.get("id", task_dir.name)),
                status=str(raw.get("status", "FAILED")),
                progress=int(raw.get("progress", 100)),
                created_at=int(raw.get("created_at", now_ms())),
                started_at=int(raw.get("started_at", 0)),
                finished_at=int(raw.get("finished_at", 0)),
                adapter_id=str(raw.get("adapter_id", "portrait_volume")),
                width=raw.get("width"),
                height=raw.get("height"),
                palette=[str(item) for item in raw.get("palette", []) if isinstance(item, str)],
                error_message=str(raw.get("error_message", "")),
                model_path=str(task_dir / str(raw.get("model_file", ""))) if raw.get("model_file") else None,
                thumbnail_path=None,
                request_images=request_images,
                using_test_mode=bool(raw.get("using_test_mode", False)),
                should_texture=bool(raw.get("should_texture", True)),
            )
            if task.status in {"PENDING", "IN_PROGRESS"}:
                task.status = "FAILED"
                task.progress = 100
                task.finished_at = now_ms()
                task.error_message = "Backend restarted before task completion."
                self._append_task_log(task, "Backend restarted before task completion.")
                self._save(task)
            self._tasks[task.id] = task
        self._pipelines.preload_single_async()

    def _task_dir(self, task_id: str) -> Path:
        return ensure_dir(self._root / task_id)

    def _task_log_path(self, task_id: str) -> Path:
        return self._task_dir(task_id) / "debug.log"

    def _append_task_log(self, task: TaskRecord, message: str) -> None:
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}] {message}\n"
        log_path = self._task_log_path(task.id)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
        print(f"[studio-ai-real-backend][{task.id}] {message}", flush=True)

    def _metadata_for(self, task: TaskRecord) -> dict[str, Any]:
        model_file = Path(task.model_path).name if task.model_path else None
        return {
            "id": task.id,
            "status": task.status,
            "progress": task.progress,
            "created_at": task.created_at,
            "started_at": task.started_at,
            "finished_at": task.finished_at,
            "adapter_id": task.adapter_id,
            "width": task.width,
            "height": task.height,
            "palette": task.palette,
            "error_message": task.error_message,
            "model_file": model_file,
            "using_test_mode": task.using_test_mode,
            "should_texture": task.should_texture,
            "request_images": [
                {
                    "file_name": Path(image.path).name,
                    "mime_type": image.mime_type,
                    "role": image.role,
                }
                for image in task.request_images
                if image.path
            ],
        }

    def _save(self, task: TaskRecord) -> None:
        metadata_path = self._task_dir(task.id) / "task.json"
        metadata_path.write_text(json.dumps(self._metadata_for(task), indent=2), "utf-8")

    def create(self, payload: dict[str, Any]) -> TaskRecord:
        primary_url = payload.get("image_url")
        if not isinstance(primary_url, str) or not primary_url.strip():
            raise HTTPException(status_code=400, detail="image_url is required.")
        additional_payload = payload.get("image_urls", [])
        if additional_payload is None:
            additional_payload = []
        if not isinstance(additional_payload, list):
            raise HTTPException(status_code=400, detail="image_urls must be an array.")

        task_id = str(uuid4())
        task_dir = self._task_dir(task_id)
        request_images: list[TaskImage] = []
        decoded_images = [({"image_url": primary_url, "role": payload.get("image_role", "front")})]
        decoded_images.extend(item for item in additional_payload if isinstance(item, dict))
        for index, item in enumerate(decoded_images):
            image_url = item.get("image_url")
            if not isinstance(image_url, str) or not image_url.strip():
                continue
            body, mime_type = load_image_bytes(image_url)
            role = normalize_role(item.get("role") if isinstance(item.get("role"), str) else "detail")
            file_name = f"input-{index}{guess_extension(mime_type)}"
            file_path = task_dir / file_name
            file_path.write_bytes(body)
            request_images.append(
                TaskImage(
                    file_name=file_name,
                    mime_type=mime_type,
                    role="front" if index == 0 else role,
                    path=str(file_path),
                )
            )

        if not request_images:
            raise HTTPException(status_code=400, detail="At least one valid image is required.")

        task = TaskRecord(
            id=task_id,
            status="PENDING",
            progress=0,
            created_at=now_ms(),
            started_at=0,
            finished_at=0,
            adapter_id="portrait_volume",
            width=None,
            height=None,
            request_images=request_images,
            using_test_mode=False,
            should_texture=bool(payload.get("should_texture", True)),
        )
        with self._lock:
            self._tasks[task.id] = task
            self._save(task)
        self._append_task_log(
            task,
            f"Queued task with {len(request_images)} image(s). should_texture={task.should_texture}.",
        )
        self._executor.submit(self._run_task, task.id)
        return task

    def get(self, task_id: str) -> TaskRecord | None:
        with self._lock:
            return self._tasks.get(task_id)

    def _prepare_image(self, record: TaskImage) -> Image.Image:
        with Image.open(record.path) as original:
            had_alpha = "A" in original.getbands()
            image = original.convert("RGBA")
        if not had_alpha:
            remover = self._pipelines.get_background_remover()
            if remover is not None:
                image = remover(image)
        return normalize_condition_image(image)

    def _prepare_model_input(self, task: TaskRecord) -> tuple[str, Any, Image.Image]:
        prepared_images = [(record, self._prepare_image(record)) for record in task.request_images]
        primary_image = prepared_images[0][1]
        if len(prepared_images) < 2:
            return "single", primary_image, primary_image

        used: set[str] = set()
        view_images: dict[str, Image.Image] = {}
        for record, image in prepared_images:
            key = assign_multiview_key(record.role, used)
            if key is None:
                continue
            used.add(key)
            view_images[key] = image
        if len(view_images) < 2:
            return "single", primary_image, primary_image
        return "multi", view_images, primary_image

    def _run_task(self, task_id: str) -> None:
        task = self.get(task_id)
        if task is None:
            return
        try:
            task.status = "IN_PROGRESS"
            task.progress = 10
            task.started_at = now_ms()
            self._save(task)
            self._append_task_log(task, "Task started.")

            mode, model_input, primary_image = self._prepare_model_input(task)
            task.progress = 30
            task.width = primary_image.width
            task.height = primary_image.height
            task.palette = sample_palette(primary_image)
            self._save(task)
            self._append_task_log(
                task,
                f"Prepared input image(s). mode={mode} size={primary_image.width}x{primary_image.height}.",
            )

            task.progress = 55
            self._save(task)
            self._append_task_log(task, f"Loading shape pipeline on device={PREFERRED_DEVICE}.")

            shape_device = PREFERRED_DEVICE
            try:
                pipeline = self._pipelines.get_pipeline(mode, shape_device)
                generator = torch.manual_seed(now_ms())
                self._append_task_log(task, "Starting shape generation.")
                result = pipeline(
                    image=model_input,
                    num_inference_steps=NUM_INFERENCE_STEPS,
                    guidance_scale=GUIDANCE_SCALE,
                    octree_resolution=OCTREE_RESOLUTION,
                    num_chunks=NUM_CHUNKS,
                    generator=generator,
                    output_type="trimesh",
                    enable_pbar=False,
                )
            except Exception as error:
                if PREFERRED_DEVICE != "mps" or "float64" not in str(error).lower():
                    raise
                shape_device = "cpu"
                task.progress = 60
                task.error_message = "MPS float64 path detected. Retrying on CPU."
                self._save(task)
                self._append_task_log(task, "MPS float64 path detected. Retrying shape generation on CPU.")
                pipeline = self._pipelines.get_pipeline(mode, shape_device)
                generator = torch.manual_seed(now_ms())
                result = pipeline(
                    image=model_input,
                    num_inference_steps=NUM_INFERENCE_STEPS,
                    guidance_scale=GUIDANCE_SCALE,
                    octree_resolution=OCTREE_RESOLUTION,
                    num_chunks=NUM_CHUNKS,
                    generator=generator,
                    output_type="trimesh",
                    enable_pbar=False,
                )
                task.error_message = ""
            mesh = unwrap_mesh(result)
            task.progress = 85
            self._save(task)
            self._append_task_log(task, f"Shape generation finished on device={shape_device}.")

            model_path = self._task_dir(task.id) / "model.glb"
            if mode == "single":
                mesh = reduce_single_view_depth(mesh)
                self._append_task_log(task, "Applied single-view depth reduction.")
            if task.should_texture and ENABLE_TEXTURE_PIPELINE and shape_device == "cuda":
                shape_mesh_path = self._task_dir(task.id) / "shape.glb"
                mesh.export(shape_mesh_path)
                textured_obj_path = self._task_dir(task.id) / "textured_mesh.obj"
                paint_pipeline, glb_builder = self._pipelines.get_texture_pipeline(shape_device)
                self._append_task_log(task, "Starting official CUDA texture pipeline.")
                painted_obj_path = Path(
                    paint_pipeline(
                        mesh_path=str(shape_mesh_path),
                        image_path=primary_image,
                        output_mesh_path=str(textured_obj_path),
                        save_glb=False,
                    )
                )
                self._append_task_log(task, f"Texture pipeline produced {painted_obj_path.name}.")
                textures = {
                    "albedo": str(painted_obj_path.with_suffix(".jpg")),
                    "metallic": str(painted_obj_path.with_name(f"{painted_obj_path.stem}_metallic.jpg")),
                    "roughness": str(painted_obj_path.with_name(f"{painted_obj_path.stem}_roughness.jpg")),
                }
                glb_builder(str(painted_obj_path), textures, str(model_path))
                self._append_task_log(task, "Built textured GLB with PBR materials.")
            else:
                self._append_task_log(
                    task,
                    (
                        "Using fallback texturing. "
                        f"should_texture={task.should_texture} "
                        f"enable_texture_pipeline={ENABLE_TEXTURE_PIPELINE} device={shape_device}."
                    ),
                )
                mesh = apply_reference_texture_fallback(mesh, primary_image)
                mesh.export(model_path)
            task.progress = 92
            self._save(task)
            self._append_task_log(task, f"Exported model to {model_path.name}.")

            task.model_path = str(model_path)
            task.progress = 100
            task.status = "SUCCEEDED"
            task.finished_at = now_ms()
            task.error_message = ""
            self._save(task)
            self._append_task_log(task, "Task completed successfully.")
        except Exception as error:
            task.status = "FAILED"
            task.progress = 100
            task.finished_at = now_ms()
            task.error_message = str(error)
            self._save(task)
            self._append_task_log(task, f"Task failed: {error}")
            self._append_task_log(task, traceback.format_exc().rstrip())


task_store = TaskStore()
task_store.initialize()
app = FastAPI(title="Claw3D Studio Real Backend")


@app.get("/health")
def health(request: Request) -> JSONResponse:
    require_authorization(request)
    return JSONResponse(
        {
            "ok": True,
            "service": "studio-ai-real-backend",
            "device": PREFERRED_DEVICE,
            "public_base_url": PUBLIC_BASE_URL or f"http://{HOST}:{PORT}",
        }
    )


@app.post("/openapi/v1/image-to-3d")
async def create_task(request: Request) -> JSONResponse:
    require_authorization(request)
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload. {error}") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object payload.")
    task = task_store.create(payload)
    return JSONResponse({"result": task.id})


@app.get("/openapi/v1/image-to-3d/{task_id}")
def get_task(task_id: str, request: Request) -> JSONResponse:
    require_authorization(request)
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return JSONResponse(task.to_response(resolve_request_base_url(request)))


@app.get("/openapi/v1/image-to-3d/{task_id}/debug-log")
def get_task_debug_log(task_id: str, request: Request) -> JSONResponse:
    require_authorization(request)
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    log_path = task_store._task_log_path(task_id)
    if not log_path.exists():
        return JSONResponse({"task_id": task_id, "log": ""})
    return JSONResponse({"task_id": task_id, "log": log_path.read_text("utf-8")})


@app.get("/openapi/v1/image-to-3d/{task_id}/output/model.glb")
def get_model(task_id: str, request: Request) -> FileResponse:
    require_authorization(request)
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return file_response_or_404(task.model_path, "model/gltf-binary")


@app.get("/openapi/v1/image-to-3d/{task_id}/output/thumbnail.png")
def get_thumbnail(task_id: str, request: Request) -> FileResponse:
    require_authorization(request)
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return file_response_or_404(task.thumbnail_path, "image/png")


def main() -> None:
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
