# Variants

## Purpose
Describe the distinct **hosts** the Innovation Hub product runs in. A variant is not a different product and not a different UI — it is the same experience mounted against a different substrate, for a customer who cannot or should not take the substrate the other variant assumes. This segment exists so that a reader asking "why is there a Power Apps version" gets an answer about context and fit, not an answer about implementation.

## What Counts As A Variant
A variant is a host that satisfies all of the following:

- It mounts the **same shared UI** (`@momentum/ui`'s `<App/>`), not a lookalike.
- It supplies its own **data seam** — one service or provider implementation — and nothing else.
- It targets a **materially different deployment context** (different identity, different system of record, different operating model, different buyer).

A surface that reuses components but composes its own pages is not a variant; it is a different application. A surface that changes the backend without changing the deployment context is not a variant; it is a repository refactor.

## Current Variants

| Variant | System of record | Identity | Where it runs | Status |
|---|---|---|---|---|
| **Hosted web** (`apps/web` + `Momentum.Service`) | Azure Table Storage | Auth0 / OIDC via `Momentum.Service` | Container app / Aspire topology | Reference implementation |
| **Power Platform code app** (`apps/code-innovation-backlog`) | Azure DevOps work items + Dataverse engagement tables | Microsoft Entra, via the Power Apps host | Power Apps environment (`[Playground] AI Engineering`) | Documented here |

The MCP board app (`apps/mcp-board`) is deliberately **not** a variant: it composes its own resources against the canonical tool surface rather than mounting `<App/>`. See `docs/design/platform/frontend/applications.md`.

## Owned Responsibilities
- The definition of a variant and the bar for adding one.
- Per-variant context, platform justification, and alignment to the system design.
- Per-variant measurement — the KPIs a variant is answerable for.

## Explicit Non-Responsibilities
- Capability behavior, which is identical across variants by construction (see `docs/design/capabilities/`).
- Cross-cutting rules (see `docs/design/cross-cutting/`).
- Platform mechanics of the hosted topology (see `docs/design/platform/`).
- Runtime operations, provisioning scripts, and environment values (see `CHECKPOINT.md` and `scripts/provisioning/`).

## Invariants
- **One UI.** A variant that needs its own pages is a failed variant; the divergence belongs in the data seam or in the shared UI, never in a parallel component tree.
- **The seam is one file's worth of surface.** A variant is judged by how little host-specific code it needs, not by how much it can do.
- A variant may **narrow** capability where its substrate cannot support one, and must declare the narrowing as a stated gap rather than a silent difference.
- Authorization is enforced by the variant's substrate, never by the shared UI. Frontend role checks stay presentational in every variant.
- A variant is added for a **deployment context**, not for a technology preference.

## Deeper Documents
- `docs/design/variants/code-app/index.md` — the Power Platform code app variant.
