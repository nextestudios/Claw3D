## Summary

This PR combines the runtime-provider groundwork with a production-ready
Hermes adapter path and a built-in demo gateway.

It is intended to solve three problems together:

- make Claw3D less hard-bound to OpenClaw assumptions
- make Hermes usable now without frontend rewrites
- make the office explorable without any external framework install

## What This PR Includes

### 1. Runtime/provider seam in Studio

- adds a backend-neutral runtime layer in Studio
- wraps the current OpenClaw-shaped client behind that seam
- adds capability checks so the UI can stop assuming every backend supports every surface
- normalizes runtime events for future provider work

### 2. Hermes adapter support

- adds `server/hermes-gateway-adapter.js`
- adds `npm run hermes-adapter`
- adds Hermes setup docs in `docs/hermes-gateway.md`
- supports multi-agent orchestration tools including `read_agent_context`
- carries agent role/title into the office UI
- supports click-to-chat and streaming speech bubbles in the office

### 3. Demo mode

- adds `server/demo-gateway-adapter.js`
- adds `npm run demo-gateway`
- adds setup guidance in the connection UI and docs
- allows users to boot the office with mock agents and no OpenClaw/Hermes install

### 4. Production fixes from the Hermes review

- `chat.abort` now targets the requested run/session instead of aborting all active runs
- history clears now persist correctly after session resets and agent deletes/dismissals
- `scripts/clawd3d-start.sh` resolves the repo path dynamically
- old gateway protocol mismatches now surface clearer guidance in the UI
- connection UI now has explicit presets for Demo, Hermes, and OpenClaw

## Important Scope Note

This PR does **not** introduce a fully native Hermes provider yet.

Hermes is production-ready here through the adapter path, on top of the
new runtime seam. ACP remains the preferred follow-up direction for a
future Hermes-native provider.

## Changelog

- `src/lib/runtime/*`
  - added runtime provider seam and normalized runtime events
- `server/hermes-gateway-adapter.js`
  - added Hermes gateway adapter
  - added targeted abort semantics
  - fixed persistence behavior for history clears
  - added `read_agent_context`
- `server/demo-gateway-adapter.js`
  - added no-framework mock gateway for demo mode
- `src/features/agents/components/GatewayConnectScreen.tsx`
  - added clearer setup guidance and backend presets
- `src/features/agents/components/ConnectionPanel.tsx`
  - added quick provider presets for switching after boot
- `src/features/office/screens/OfficeScreen.tsx`
  - added live streaming office speech support wiring
- `src/features/retro-office/*`
  - added role-aware office agent subtitles and click-to-chat polish
- `README.md`
  - documented Hermes and demo mode paths
- `docs/hermes-gateway.md`
  - updated setup, scope, production notes, and ACP status

## Validation

- [x] `npm run typecheck`
- [x] `node --check server/hermes-gateway-adapter.js`
- [x] `node --check server/demo-gateway-adapter.js`
- [x] `npx vitest run tests/unit/agentChatPanel-controls.test.ts`

## Suggested Reviewer Focus

- Hermes adapter protocol compatibility with current Claw3D usage
- no-framework demo-mode onboarding quality
- runtime seam correctness and capability-gating behavior
- whether ACP-native Hermes should be a follow-up PR instead of being folded into this one

## Follow-Up Work

- implement a real Hermes-native provider using ACP and/or Hermes API surfaces
- add dedicated provider selection/config in Studio settings beyond URL presets
- add adapter/integration tests for Hermes and demo gateways
