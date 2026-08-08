---
title: Tool Reference
sidebar_label: Tools
description: MCP tool surface for Momentum — namespaced, server-authorized, and ready to adapt.
sidebar_position: 1
tags: [reference, tools]
---

All tools are namespaced with `momentum_`.

The reference surface below shows the shape of a typical starter deployment. Adapt the resource names to your own domain.

## CRUD

Standard per-resource create, read, update, delete operations:

- `momentum_resource_list`
- `momentum_resource_get`
- `momentum_resource_create`
- `momentum_resource_update`
- `momentum_resource_delete`

## Links

Optional relation tools for modeling connections between resources:

- `momentum_link_list`
- `momentum_link_create`
- `momentum_link_update`
- `momentum_link_delete`

## Sharing

Owner-only tools for granting and revoking access:

- `momentum_resource_share`
- `momentum_resource_unshare`

## Batch

A single transactional batch tool:

- `momentum_resource_batch`

## Search

Full-text search across resources the caller can see:

- `momentum_search_resources`

## App

Tools that open the bundled UI app for a given resource:

- `momentum_app_open`

## Permission Expectations

- Read tools require visibility for the caller (owner or shared).
- Mutation tools require write or owner permission.
- Sharing and deletion are owner-only.

## Visual Tool Walkthrough

> Image placeholder: Tool-by-tool screenshot walkthrough adapted to your domain.

Use a sequence of labeled UI screenshots to map each tool's behavior to the surface your users see. The reference architecture ships with a placeholder UI app (`apps/mcp-board`) so you can capture these screenshots once you adapt the starter to your own resources.
