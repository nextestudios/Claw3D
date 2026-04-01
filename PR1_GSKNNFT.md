## Summary

Introduce a backend-neutral runtime provider layer in Studio, with OpenClaw wrapped as the first provider.

This PR does not add Hermes or Vera yet. It creates the seam they need.

## What This PR Does

- adds a runtime provider interface
- wraps the existing OpenClaw integration behind that interface
- introduces capability flags for optional backend features
- adds a Studio-side runtime event normalization layer
- updates the UI/state layer to stop assuming every backend supports config, approvals, files, skills, and cron

## What This PR Does Not Do

- no Hermes provider yet
- no Vera provider yet
- no removal of OpenClaw support
- no behavior change intended for existing OpenClaw users beyond internal refactoring

## Why

Claw3D is currently OpenClaw-shaped at the integration boundary. That makes alternative backends work only through protocol emulation.

This PR creates a backend-neutral seam so future providers can integrate natively.

## Follow-Up PRs

- PR 2: safe UI/UX cherry-picks from current Hermes work
- PR 3: Hermes native provider
- PR 4: Vera/Custom provider

## Testing

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run e2e`

## AI-assisted

- [ ] AI-assisted
