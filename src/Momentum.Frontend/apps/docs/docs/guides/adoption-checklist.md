---
title: Service Evaluation Checklist
sidebar_label: Evaluation Checklist
description: Customer-facing checklist for evaluating trust, safety, and rollout readiness of Momentum.
sidebar_position: 5
tags: [adoption, checklist, security]
---

Use this checklist when deciding whether to adopt a deployment of Momentum.

## Security Readiness

- Client authentication flow verified against your hosted MCP endpoint (for example `https://starter.example.com/mcp`).
- Bearer token validation tested for valid and invalid tokens.
- Owner-only operations verified for your domain (for example share, unshare, delete).
- Read and write permissions tested with separate user identities.

## Data Governance

- Database storage path and backup plan documented.
- Retention and deletion expectations defined for tenant content.
- Access review process established for shared resources.

## Operational Readiness

- Health and error monitoring in place for the HTTP endpoint.
- Hosted endpoint documented (for example `https://starter.example.com/mcp`).
- Incident response and status communication process documented.

## Integration Readiness

- MCP hosts configured with the correct endpoint and auth flow.
- Tool-level behavior tested with real workflows.
- End-user guidance prepared for sharing and permission boundaries.
