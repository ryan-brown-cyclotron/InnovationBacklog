---
title: Security FAQ
sidebar_label: Security FAQ
description: Common trust and security questions from teams adopting Momentum.
sidebar_position: 4
tags: [security, faq, trust]
---

## Can one user see every record in the system?

No. Users only see records they own, records explicitly shared with them, or records their role grants access to.

## Can a read-only user modify content?

No. Read-only permissions cannot create, update, or delete content.

## Who can share a resource with others?

Only the resource owner (or an explicit admin role) can share or unshare access.

## What happens with invalid or missing authentication?

The request is denied and the service returns an authentication challenge.

## Is access control done in the client or on the server?

On the server. Every operation is validated server-side before data is returned or changed.

## Can automation bypass normal permissions?

No. Tool handlers enforce the same permission model for all callers.

## What should we verify during adoption?

- Owners can share and unshare.
- Shared-write users can edit but not manage sharing.
- Shared-read users can view but cannot edit.
- Unshared users receive access denied.
