---
name: runtime provider layer
about: Studio-Style runtime layer for providers
title: "[FEATURE]"
labels: enhancement
assignees: 'iamlukethedev/gsknnft'

---

## Summary

Claw3D currently assumes an OpenClaw-shaped backend contract in several key places, which makes alternative backends work only by emulating the OpenClaw gateway protocol.

I want to propose a backend-neutral runtime provider layer inside Studio so Claw3D can support:

- OpenClaw without regression
- Hermes via ACP and/or Hermes API server
- Vera via the Vera orchestrator
- future backends without requiring each one to impersonate OpenClaw

This would also let us safely reuse the high-value UX work from the current Hermes PR without locking Claw3D into the wrong long-term seam.

**Problem description**

Today, Claw3D is still strongly coupled to OpenClaw-style assumptions:

- gateway/browser client semantics
- config mutation surfaces
- approvals surfaces
- session/event shapes
- OpenClaw-specific state/config discovery

That means non-OpenClaw integrations end up building compatibility shims instead of integrating natively.
PR #70 is useful as a short-term experiment, but it does not solve the general problem. It makes Hermes emulate OpenClaw rather than making Claw3D backend-neutral.

**OpenClaw compatibility**

Claw3D depends on **OpenClaw**. Any proposed feature must remain compatible with OpenClaw and should not break the integration between the two projects.

If this feature affects OpenClaw, please describe:

- How it interacts with OpenClaw
- Whether changes to OpenClaw would be required
- Any compatibility considerations

**Proposed solution**

Introduce a Studio-side runtime provider layer with a normalized contract for:

- agents
- sessions
- chat send/abort/wait
- streaming events
- session previews
- optional capabilities such as config, approvals, files, skills, and cron

The browser should consume Claw3D-native runtime events from Studio, and Studio should adapt provider-native behavior from:

- OpenClaw provider
- Hermes provider
- Vera provider

Capability flags should replace fake-success stubs. If a backend does not support approvals or config mutation, the UI should disable or hide those controls instead of pretending the write succeeded.

## Why This Helps

- Keeps OpenClaw support intact
- Lets Hermes integrate cleanly via ACP/API surfaces
- Lets Vera integrate as its own orchestrated backend instead of an OpenClaw clone
- Makes future integrations cheaper and cleaner
- Preserves the useful UX wins from the Hermes work

## Suggested PR Split

1. Runtime provider abstraction
2. Safe UX cherry-picks from Hermes work
3. Hermes native provider
4. Vera provider
5. Optional compatibility shim cleanup

## High-Value Pieces Worth Reusing

- agent role/title in office UI
- click-to-chat
- streaming speech bubbles
- `read_agent_context`
- Hermes env/config docs

## Docs / Notes

I wrote a more detailed integration plan here:

- `docs/integrations/universal-backend-plan.md`

## Questions

- Would you accept a first PR that only introduces the runtime provider seam while keeping OpenClaw as the default provider?
- If yes, I can follow with smaller PRs for the Hermes/Vera integrations after that.
