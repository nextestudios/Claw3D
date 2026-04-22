# Claw3D Studio AI Worker Contract

This document describes the current self-hosted image-to-3D worker contract used by Claw3D Studio.

## Purpose

Claw3D Studio is the product layer.
The Studio AI worker is the self-hosted backend service that receives image-to-3D jobs and returns task progress plus output artifacts.

Studio talks to the worker through a stable HTTP contract.
The goal is to keep Studio unchanged while the worker internals improve from mock generation to real model-backed reconstruction.

## Worker process

Current entrypoint:

- `npm run studio-ai-worker`
- `npm run studio-ai-upstream-local`
- `npm run studio-ai-upstream-setup`

Current implementation:

- `server/studio-ai-worker.js`

Default bind:

- Host: `127.0.0.1`
- Port: `3333`

Environment overrides:

- `CLAW3D_STUDIO_PROVIDER_HOST`
- `CLAW3D_STUDIO_PROVIDER_PORT`
- `CLAW3D_STUDIO_WORKER_MODE` (`local_mock` or `upstream_openapi`)
- `CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL` (required when using `upstream_openapi`)
- `CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY` (optional bearer token for upstream requests)
- `CLAW3D_STUDIO_UPSTREAM_POLL_INTERVAL_MS` (optional poll cadence in milliseconds)
- `CLAW3D_STUDIO_UPSTREAM_TIMEOUT_MS` (optional timeout in milliseconds)
- `CLAW3D_STUDIO_LOCAL_UPSTREAM_HOST` (optional bind override for `npm run studio-ai-upstream-local`)
- `CLAW3D_STUDIO_LOCAL_UPSTREAM_PORT` (optional bind override for `npm run studio-ai-upstream-local`)
- `CLAW3D_STUDIO_LOCAL_UPSTREAM_PUBLIC_URL` (optional public base URL returned by the Python backend)
- `CLAW3D_STUDIO_REAL_BACKEND_DEVICE` (`auto`, `mps`, or `cpu`)
- `CLAW3D_STUDIO_REAL_BACKEND_NUM_INFERENCE_STEPS`
- `CLAW3D_STUDIO_REAL_BACKEND_GUIDANCE_SCALE`
- `CLAW3D_STUDIO_REAL_BACKEND_OCTREE_RESOLUTION`
- `CLAW3D_STUDIO_REAL_BACKEND_NUM_CHUNKS`
- `CLAW3D_STUDIO_REAL_BACKEND_TARGET_IMAGE_SIZE`
- `CLAW3D_STUDIO_REAL_BACKEND_CONDITION_PADDING_RATIO`
- `CLAW3D_STUDIO_REAL_BACKEND_REMOVE_BACKGROUND`
- `CLAW3D_STUDIO_REAL_BACKEND_ENABLE_FLASHVDM`
- `CLAW3D_STUDIO_PROVIDER_PUBLIC_URL` (optional externally reachable base URL in returned task artifact links)

## Studio configuration

To enable Studio to use the self-hosted worker:

- `CLAW3D_STUDIO_ENABLE_REAL_AI=true`
- `CLAW3D_STUDIO_PROVIDER_URL=http://127.0.0.1:3333/openapi/v1`

Optional:

- `CLAW3D_STUDIO_PROVIDER_API_KEY=<token>`

When the provider URL is not configured, the provider layer defaults to the local worker endpoint.

## Endpoints

### Health

- `GET /health`

Response:

- `200 OK`
- `{ "ok": true, "service": "studio-ai-worker" }`

### Create task

- `POST /openapi/v1/image-to-3d`

Request body:

- JSON
- `image_url` required
- accepts:
  - public URL
  - data URI

Current supported optional fields:

- `texture_prompt`
- `model_type`
- `target_formats`
- `topology`
- `target_polycount`
- `should_remesh`
- `adapter_id`

Current adapter values:

- `portrait-volume`
- `heightfield-relief`

Current response:

- `200 OK`
- `{ "result": "<task-id>" }`

### Get task

- `GET /openapi/v1/image-to-3d/:id`

Response shape:

- `id`
- `type`
- `model_urls.glb`
- `thumbnail_url`
- `progress`
- `created_at`
- `started_at`
- `finished_at`
- `status`
- `texture_urls`
- `task_error.message`

Status values:

- `PENDING`
- `IN_PROGRESS`
- `SUCCEEDED`
- `FAILED`
- `CANCELED`

### Download model

- `GET /openapi/v1/image-to-3d/:id/output/model.glb`

Returns:

- `200 OK` with GLB file when ready
- `404` if not ready

### Download thumbnail

- `GET /openapi/v1/image-to-3d/:id/output/thumbnail.png`

Returns:

- `200 OK` with PNG file when ready
- `404` if not ready

## Current adapter architecture

The worker supports adapter-based generation and backend mode switching.

Current adapters:

- `portrait-volume` — default adapter
- `heightfield-relief` — simpler fallback adapter

Current behavior in `local_mock` mode:

- decodes uploaded image pixels locally
- samples intensities and colors from the decoded raster
- produces GLB artifacts through internal geometry adapters
- exposes a task lifecycle compatible with Studio

Current behavior in `upstream_openapi` mode:

- accepts the same worker request payload from Studio
- forwards generation requests to an upstream provider at `CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL`
- polls upstream task status
- downloads upstream GLB/preview artifacts
- serves downloaded artifacts back through the same worker contract

### Adapter notes

#### `portrait-volume`

- default adapter for self-hosted image-to-3D jobs
- biases the generated mesh toward a portrait-like volume
- uses layered box volumes, collar/halo forms, and portrait masking

#### `heightfield-relief`

- simpler fallback adapter
- creates a relief-style displaced panel from sampled intensity/color grids
- useful as a baseline when stronger adapters are unavailable

Next adapters can be added behind the same contract without changing Studio.

## Local developer workflow

### Terminal 1

- `npm run studio-ai-upstream-setup`

### Terminal 2

- `npm run studio-ai-upstream-local`

### Terminal 3

- `CLAW3D_STUDIO_WORKER_MODE=upstream_openapi CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL=http://127.0.0.1:8080/openapi/v1 npm run studio-ai-worker`

### Terminal 4

- `CLAW3D_STUDIO_ENABLE_REAL_AI=true CLAW3D_STUDIO_PROVIDER_URL=http://127.0.0.1:3333/openapi/v1 npm run dev`

The local upstream helper now starts a Python Hunyuan-based image-to-3D backend on `127.0.0.1:8080`.
The first launch can take several minutes because the model weights may need to download and initialize.
The default quality profile now uses Hunyuan3D 2.1 for single-view generation, the non-turbo Hunyuan multi-view model for multiple images, stronger source-image normalization, and higher inference/detail settings than the initial speed-first setup.

Then open:

- `/studio`

Recommended manual checks:

1. Upload a reference image.
2. Choose `Self-hosted AI` as the generation backend.
3. Generate from image.
4. Confirm a pending project appears.
5. Wait for task completion or click `Sync now`.
6. Confirm thumbnail/GLB availability.

## Current limitations

- `local_mock` mode still uses internal heuristic adapters, not a learned 3D reconstruction model.
- The output is relief-style and better than the old primitive placeholders, but still not production-quality reconstruction.
- `upstream_openapi` mode quality depends entirely on the connected upstream model service.
- The built-in local upstream backend uses Hunyuan3D community weights, which have their own license terms.
- The contract is intentionally stable so backend internals can change without breaking Studio.
