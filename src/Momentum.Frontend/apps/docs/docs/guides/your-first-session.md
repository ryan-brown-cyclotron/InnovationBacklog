---
title: Your First Session
sidebar_label: Your First Session
description: A friendly walkthrough of what to ask and what to expect in your first 10 minutes with Momentum.
sidebar_position: 2
tags: [onboarding, usage]
---

Use this walkthrough to experience Momentum quickly.

## 1. Sign In

Open the web app and sign in with OAuth.

What happens:

- You get a session with your user identity.
- Your MCP-scoped access token is issued on demand.

## 2. Discover Tools

Ask:

"What tools do you have from the Momentum server?"

What happens:

- Your assistant lists the `momentum_*` tools it can call.
- Read-only tools are available immediately.

## 3. Take a Read Action

Ask:

"Run a read-only tool and summarize what comes back."

What happens:

- The server validates your authorization and returns scoped data.

> Image placeholder: Chat transcript showing a successful read tool call.

## 4. Take a Write Action

Ask:

"Use a write tool to create something in my account."

What happens:

- The server validates write permission and creates the resource.

## 5. Open the Web App

Ask:

"Open the web app so I can review what you did."

Or click the bundled UI from the app toolbar.

> Image placeholder: Web app view of the resource that was just created.

## 6. Open the Bundled UI App

MCP hosts can also open the inlined UI app resource (`ui://momentum/`).

What you see:

- A focused view of the resource the assistant just touched.
- Any actions appropriate to that view.

> Image placeholder: Bundled UI app inline view inside the MCP host.

## 7. Try a Share Flow

Ask:

"Share this with teammate@example.com as read."

What happens:

- The owner-only share tool runs.
- The teammate gets view access.

> Image placeholder: Share modal showing invite workflow.

## 8. Revoke Access

Ask:

"Revoke teammate@example.com's access."

What happens:

- The owner-only unshare tool runs.
- The teammate immediately loses access on the next call.

## 9. Run a Batch Operation

Ask:

"Create three related items in one batch."

What happens:

- The server runs a single transactional batch.
- If any item fails, the whole transaction rolls back.

## 10. Explore Surface

Ask:

"List resources, prompts, and tools available."

What happens:

- You see the full MCP surface for the starter.

## What You Just Validated

- You can sign in and authenticate against the MCP endpoint.
- You can discover and call `momentum_*` tools.
- Read tools run with the minimum scope required.
- Write tools respect your owner / write permission.
- Sharing is explicit and reversible.
- Authorization is enforced server-side on every call.
