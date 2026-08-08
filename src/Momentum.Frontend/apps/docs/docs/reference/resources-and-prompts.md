---
title: Resources and Prompts
sidebar_label: Resources and Prompts
description: Reference for MCP resources and prompt templates exposed by Momentum.
sidebar_position: 3
tags: [reference, resources, prompts]
---

## Resources

Resources are exposed under the `momentum://` URI scheme:

- `momentum://workspace/summary`
- `momentum://{resource}/{id}/summary`

The starter also exposes a UI app resource for inline rendering inside MCP hosts:

- `ui://momentum/app.html`

## Prompts

Prompt templates expose common workflows as reusable starting points:

- `summarize-workspace`
- `open-resource`

## How Resources Help Hosts

Resources expose structured summaries that help hosts reason about the user's state without first calling many tools.

This keeps responses fast and avoids brittle chat-only flows.

## Adding Your Own

When you adapt the starter to your own domain, follow the same conventions:

- Use `momentum://` URIs for read-only summaries.
- Use `ui://momentum/{kind}/app.html` for bundled UI apps.
- Use `momentum_*` for tool names so tenants never collide.
