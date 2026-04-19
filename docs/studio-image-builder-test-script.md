# Claw3D Studio Local Test Script

This script verifies the current Claw3D Studio builders.

Important.
- The world builder and image-guided asset builder work locally.
- No gateway connection is required for any steps in this document.
- If the app shows any gateway-related controls in the header, they can be ignored for Studio testing.

## Preconditions

1. Install dependencies.
2. Start Claw3D locally.
3. Open the app in a browser.
4. Navigate to `/studio`.

Commands.
- `npm install`
- `npm run dev`

## Test A: Text world builder

Goal.
- Confirm prompt-only world generation works without a gateway.

Steps.
1. Open `/studio`.
2. Do not upload an image.
3. Enter a project name.
4. Enter a generation brief describing a world or asset set.
5. Choose style, scale, focus, and optionally seed.
6. Click `Generate scene`.

Expected.
- A new project appears in the project library.
- The 3D preview renders.
- Scene notes appear.
- The project card shows `Export GLB`, `Export manifest`, and `Apply to office`.

Extra checks.
- Click `Export GLB` and confirm a `.glb` download starts.
- Click `Export manifest` and confirm a `.json` download starts.
- Click `Apply to office` and confirm a success status message appears.

## Test B: Image-guided avatar builder

Goal.
- Confirm image upload and image-guided avatar proxy generation works locally.

Steps.
1. Open `/studio`.
2. Click `Upload image`.
3. Select a PNG, JPEG, or WEBP reference image.
4. Wait for the upload to finish.
5. Confirm the reference image preview appears.
6. Confirm palette chips are extracted and displayed.
7. Keep or update the project name and prompt.
8. Click `Generate from image`.

Expected.
- A new project appears in the project library.
- The project shows the `image avatar` mode tag.
- The 3D preview renders an avatar-like proxy.
- The preview shows the reference image overlay.
- The project card shows a thumbnail of the uploaded source image.

Extra checks.
- Click `Export GLB` and confirm a `.glb` download starts.
- Click `Export manifest` and confirm a `.json` download starts.
- Confirm the status line reports successful generation and export.

## Test C: Local-only behavior

Goal.
- Confirm Studio generation does not depend on any gateway.

Steps.
1. Keep the app on `/studio`.
2. Do not connect any gateway.
3. Run both Test A and Test B.

Expected.
- Text world generation still works.
- Image-guided avatar generation still works.
- GLB export still works.
- No gateway connection is required at any point.

## Automated checks

Run these after code changes.
- `npm run typecheck`
- `npm run build`
- `npm run test -- --run tests/unit/studioWorldRoute.test.ts`
- `npx eslint src/app/api/studio-world/route.ts src/features/studio-world/**/*.tsx src/features/studio-world/**/*.ts src/lib/studio-world/**/*.ts tests/unit/studioWorldRoute.test.ts`

## Current scope note

The image builder currently creates a stylized 3D proxy guided by the uploaded image.
It does not yet perform full neural image-to-mesh reconstruction.
