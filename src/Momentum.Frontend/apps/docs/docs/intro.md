---
title: Momentum
sidebar_label: Overview
description: Reference documentation for the Momentum platform — a generic MCP-enabled SaaS starter.
sidebar_position: 1
slug: /
tags: [overview, adoption, security]
---

Momentum is a reference architecture for a hosted MCP-enabled SaaS platform.

It gives your AI host a standardized, model-context-protocol surface, while keeping strong authentication and authorization boundaries on the server.

Users authenticate when they connect from their MCP client.

## What It Is

- A reference implementation showing how to run an MCP server behind a hosted web app.
- A starting point you can adapt to your own domain — boards, tickets, docs, anything.
- A bundle that includes server, web app, UI app, SDK, and this documentation site.

## What It Provides

- An HTTP MCP endpoint with OAuth 2.1 authentication.
- A namespaced tool surface (`momentum_*`) so tenants never collide.
- A single-page web app for signed-in users.
- A bundled UI app (HTML artifact) that hosts can open inline.
- Strict server-side authorization for every tool call.

## What It Feels Like to Use

1. You ask your AI assistant to perform an action against your tenant.
2. The assistant authenticates and calls the relevant `momentum_*` tool.
3. The server checks authorization, mutates state if allowed, and returns a result.
4. You open the web app or UI app to review and continue working visually.

> Image placeholder: Screenshot of the web app dashboard for the signed-in user.

## Start Here

- [Connect Your AI Client](guides/connect-your-ai-client)
- [Your First Session](guides/your-first-session)
- [Why You Can Trust This Service](guides/why-trust-this-service)

## Why Teams Trust It

- Access is identity-based, not anonymous.
- Operations are authorized server-side on every call.
- Sensitive operations are owner- or admin-only by default.
- Unauthorized requests are denied before any data is returned.

## Security Model in One Minute

1. Every request is tied to a user identity.
2. Every tool call checks the caller's permission scope.
3. Read access does not imply write access.
4. Authorization decisions are explicit and reversible by the data owner.

If you are evaluating adoption, start with [Why You Can Trust This Service](guides/why-trust-this-service), then review [Security FAQ](guides/security-faq) and [Auth and Modes](reference/auth-and-modes).
