---
title: Connect Your AI Client
sidebar_label: Connect Your AI Client
description: Setup instructions for VS Code, Claude Desktop, and other MCP-compatible hosts.
sidebar_position: 1
tags: [setup, copilot, claude, mcp]
---

This guide helps you connect Momentum to your preferred AI client or MCP host.

## Before You Connect

1. Sign in to your Momentum deployment in a browser.
2. Copy your MCP endpoint URL from the app settings or your admin documentation.
3. Be ready to authenticate when your client prompts during connection.

For local development, the endpoint is typically:

```text
http://localhost:3000/mcp
```

For hosted deployments, replace the host with your own (for example `https://starter.example.com/mcp`).

## Option A: VS Code (GitHub Copilot)

Create or update your MCP config file:

- `.vscode/mcp.json` (workspace)

Example:

```json
{
  "servers": {
    "mcp-starter": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

> Image placeholder: VS Code MCP server list showing the `mcp-starter` server connected.

## Option B: Claude Desktop

In Claude Desktop MCP settings, add a server with the same shape:

- `type: http`
- `url: http://localhost:3000/mcp` (or your hosted endpoint)

Authenticate when prompted.

> Image placeholder: Claude Desktop MCP settings page with the Momentum entry.

## Option C: Other MCP Hosts

Most MCP clients accept equivalent server definitions.

Use an HTTP MCP server definition pointing to your endpoint:

- `http://localhost:3000/mcp` (or your hosted equivalent)

If your host supports OAuth discovery, the authentication flow is discovered automatically.

## Quick Connection Check

Ask your assistant:

- "Show me what tools you have available."
- "List the tools in the `momentum` namespace."
- "Run a read-only tool against my account."

If these succeed, your connection is working.

> Image placeholder: Chat transcript showing first successful tool calls.
