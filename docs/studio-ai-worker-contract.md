# Claw3D Studio AI Worker Contract

This document describes the current self-hosted image-to-3D worker contract used by Claw3D Studio.

## Purpose

Claw3D Studio is the product layer.
The Studio AI worker is the self-hosted backend service that receives image-to-3D jobs and returns task progress plus output artifacts.

Studio talks to the worker through a stable HTTP contract.
The goal is to keep Studio unchanged while the worker internals improve from mock generation to real model-backed reconstruction.

## Worker process

Current entrypoint:

- `npm run studio:ai-worker`

Current implementation:

- `server/studio-ai-worker.js`

Default bind:

- Host: `127.0.0.1`
- Port: `3333`

Environment overrides:

- `CLAW3D_STUDIO_PROVIDER_HOST`
- `CLAW3D_STUDIO_PROVIDER_PORT`

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

The worker now supports adapter-based generation.

Current adapters:

- `portrait-volume` — default adapter
- `heightfield-relief` — simpler fallback adapter

Current behavior:

- decodes uploaded image pixels locally
- samples intensities and colors from the decoded raster
- produces GLB artifacts through internal geometry adapters
- exposes a task lifecycle compatible with Studio

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

- `npm run studio:ai-worker`

### Terminal 2

- `CLAW3D_STUDIO_ENABLE_REAL_AI=true npm run dev`

Optional explicit provider URL:

- `CLAW3D_STUDIO_ENABLE_REAL_AI=true CLAW3D_STUDIO_PROVIDER_URL=http://127.0.0.1:3333/openapi/v1 npm run dev`

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

- The worker still uses a mock internal adapter, not a learned 3D reconstruction model.
- The output is relief-style and better than the old primitive placeholders, but still not production-quality reconstruction.
- The contract is intentionally stable so a real model adapter can replace the mock without breaking Studio.
