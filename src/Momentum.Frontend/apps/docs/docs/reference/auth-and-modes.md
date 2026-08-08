---
title: Auth and Modes
sidebar_label: Auth and Modes
description: Authentication and access model for Momentum in local and hosted deployments.
sidebar_position: 2
tags: [reference, auth]
---

## Service Endpoint

Local development:

```text
http://localhost:3000/mcp
```

Hosted deployment (replace with your own host):

```text
https://starter.example.com/mcp
```

## Authentication

- Users authenticate when connecting from a supported MCP client.
- Clients connect to the MCP endpoint over HTTP (local) or HTTPS (hosted).
- OAuth 2.1 bearer auth identifies the user for every request.

## Access Model

- Owner: full control over a resource.
- Shared write: can edit resource contents.
- Shared read: can view resource contents.
- No share: no access.

> Image placeholder: Access modal showing invite and read-only sharing.

## OAuth Behavior

If a token is missing or invalid, the service returns an authentication challenge with OAuth resource metadata.

This lets compatible MCP clients guide users through authentication without exposing protected data.

## Deployment Modes

- **Local dev** — fast iteration against a local server.
- **Hosted single-tenant** — a deployment for one organization.
- **Hosted multi-tenant** — multiple organizations share an instance, isolated by tenant ID.

The reference architecture supports all three modes with the same authorization model.
