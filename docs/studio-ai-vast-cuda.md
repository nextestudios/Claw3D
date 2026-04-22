# Studio AI on Vast.ai CUDA

This guide runs the CUDA texture backend on a rented Vast.ai GPU while keeping Claw3D app and worker on localhost.

## 1) Build and publish the CUDA backend image

Build from the repository root:

```bash
docker build -f server/studio-ai-real-backend.cuda.Dockerfile -t <registry>/<image>:<tag> .
```

Push the image to a registry your Vast.ai instance can pull.

## 2) Launch on Vast.ai

Recommended instance settings:

- Persistent instance (not serverless).
- One NVIDIA GPU with enough VRAM for Hunyuan3D shape + paint stages.
- Docker image set to `<registry>/<image>:<tag>`.
- Expose container port `8000` with Docker options `-p 8000:8000`.
- Set `OPEN_BUTTON_PORT=8000` in Vast if you want the UI open shortcut to target the API port.
- Mount persistent storage so model caches survive restarts.

Recommended container env vars:

- `CLAW3D_STUDIO_LOCAL_UPSTREAM_HOST=0.0.0.0`.
- `CLAW3D_STUDIO_LOCAL_UPSTREAM_PORT=8000`.
- `CLAW3D_STUDIO_REAL_BACKEND_DEVICE=cuda`.
- `CLAW3D_STUDIO_REAL_BACKEND_API_KEY=<shared-token>`.
- `CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT=/opt/hunyuan/Hunyuan3D-2.1`.

After startup, obtain the public `IP:PORT` mapping from the Vast instance panel.

## 3) Point the local worker to the remote backend

Keep Studio using the local worker URL:

- `CLAW3D_STUDIO_PROVIDER_URL=http://127.0.0.1:3333/openapi/v1`.

Run the local worker in upstream mode:

```bash
CLAW3D_STUDIO_WORKER_MODE=upstream_openapi \
CLAW3D_STUDIO_UPSTREAM_PROVIDER_URL=http://<vast-public-ip>:<vast-public-port>/openapi/v1 \
CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY=<shared-token> \
npm run studio-ai-worker
```

Then run the app:

```bash
CLAW3D_STUDIO_ENABLE_REAL_AI=true \
CLAW3D_STUDIO_PROVIDER_URL=http://127.0.0.1:3333/openapi/v1 \
npm run dev
```

## 4) HTTPS and token guidance

- If the endpoint is plain HTTP on a public IP, traffic is not encrypted.
- Prefer TLS termination in front of Vast, then use `https://.../openapi/v1`.
- The backend accepts `Authorization: Bearer <token>` when `CLAW3D_STUDIO_REAL_BACKEND_API_KEY` is set.
- Reuse that same token in `CLAW3D_STUDIO_UPSTREAM_PROVIDER_API_KEY` on the local worker.

## 5) Health check

With token auth enabled:

```bash
curl -H "Authorization: Bearer <shared-token>" "http://<vast-public-ip>:<vast-public-port>/health"
```

Without token auth:

```bash
curl "http://<vast-public-ip>:<vast-public-port>/health"
```

## 6) End-to-end smoke test

Run the included smoke script from the repo root to validate create, poll, and model download:

```bash
npm run smoke:remote-upstream -- \
  --base-url "http://<vast-public-ip>:<vast-public-port>/openapi/v1" \
  --api-key "<shared-token>" \
  --image "<absolute-path-to-input-image>" \
  --output "tmp/vast-smoke.glb"
```

The script performs:

- `GET /health`.
- `POST /openapi/v1/image-to-3d`.
- `GET /openapi/v1/image-to-3d/{id}` polling.
- `GET .../output/model.glb` download.
