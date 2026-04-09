# Multi-Floor Runtime Architecture

> Architecture note for evolving Claw3D from single-runtime switching into one persistent building with multiple runtime-backed floors.

## Goal

Claw3D should move from:

- one selected runtime at a time

to:

- one building shell
- multiple floors
- one runtime binding per floor
- one or more floors active in the same session
- persistent roster/state per floor
- controlled cross-floor interaction

This is the bridge from the merged runtime seam work into Office Systems.

## Product Model

The user should think in places, not provider toggles.

Examples:

- `Lobby`
  - onboarding, demo, reception, visitor flow
- `OpenClaw Floor`
  - default upstream team
- `Hermes Floor`
  - supervisor / orchestration team
- `Custom Floor`
  - downstream/orchestrator/runtime experiments
- `Training Floor`
  - classrooms, auditorium, distillation labs, evals, coaching, simulations
- `Trader's Floor`
  - event streams, signals, analyst desks, execution pits
- `Outside / Campus`
  - stadium, events, unlockables, public scenes

Additional future departments:

- `War Room`
  - incident response, debugging, approvals, ops escalation
- `R&D Lab`
  - prompt experiments, model comparisons, benchmarks
- `Legal / Compliance`
  - permissions, policies, audit trails
- `Studio / Broadcast Room`
  - demos, presentations, voice/video outputs
- `Watercooler / Commons`
  - intentional cross-agent cross-talk space

## Core Principles

- One runtime per floor.
- One shared building shell above all floors.
- Floor state is persistent and local to that floor.
- Building systems are shared and runtime-neutral.
- Cross-floor coordination is explicit, not accidental.
- The gateway/runtime remains the source of truth for runtime-owned data.

## Why Floors

Floors solve several problems at once:

- they preserve backend neutrality
- they prevent multi-runtime support from flattening into one undifferentiated roster
- they make agent origin legible to the user
- they let Office Systems map naturally onto place
- they create a clean future path for cross-runtime coordination

Instead of "choose one provider", the user can think:

- OpenClaw is downstairs
- Hermes is on the first floor
- Custom is upstairs
- Demo starts in the lobby

## Building Layers

### 1. Building Shell

Persistent across the whole app:

- top-level navigation
- player identity
- building map / floor switcher
- building-wide settings
- shared event feed
- shared progression/unlocks
- common Office Systems surfaces

This layer should not depend on one runtime being selected.

### 2. Floor Runtime Surface

Owned per floor:

- provider binding
- runtime profile and connection settings
- connection status and error state
- hydrated roster for that floor
- floor-local room state
- floor signage / presentation metadata

### 3. Shared Building Systems

Runtime-neutral systems that can reference one or many floors:

- bulletin board
- whiteboard
- meeting rooms
- QA systems
- approvals
- shared announcements
- watercooler / commons

### 4. Cross-Floor Coordination

Later-phase systems:

- cross-floor messaging
- supervisor handoff chains
- dispatch boards
- agent encounter rules
- multi-floor meetings

## Runtime Rules

Each floor has exactly one runtime binding at a time.

Examples:

- `openclaw-ground`
  - provider: `openclaw`
- `hermes-first`
  - provider: `hermes`
- `custom-second`
  - provider: `custom`
- `demo-lobby`
  - provider: `demo`

A floor can be:

- configured but disconnected
- connecting
- connected
- errored

Multiple floors may be loaded in the same session, but they should not share runtime connection state.

## State Ownership

### Runtime-owned

Still owned by the runtime/gateway:

- agent records
- sessions
- approvals
- runtime files
- runtime event streams

### Studio-owned

Local Claw3D state should own:

- floor registry
- active floor
- saved runtime profile per floor
- last-known-good profile per floor
- floor-local presentation preferences
- building-level Office Systems state

This follows the existing architecture boundary in [ARCHITECTURE.md](/c:/Users/G/Desktop/Builds/sigilnet/isolation/Claw3D/ARCHITECTURE.md): Claw3D should not become the system of record for runtime agent state.

## Floor Registry

The first concrete implementation step should be a floor registry.

Required fields:

- floor id
- label
- provider
- zone / level kind
- connection profile key
- whether the floor is enabled

## Current Implementation Status

Implemented in the current floor/runtime slice:

- canonical floor ids and registry helpers
- persisted `activeFloorId`
- persisted floor-local runtime status and gateway metadata
- floor roster cache and provenance-preserving roster entries
- shell-level floor picker in `OfficeScreen`

Explicitly deferred:

- cross-floor messaging
- supervisor handoff chains
- shared commons/watercooler traffic
- specialized floor systems like Training, Trader's Floor, and Campus gameplay

Reason for deferral:

- cross-agent messaging primitives should be tightened first
- then cross-floor messaging can build on a cleaner interaction model
