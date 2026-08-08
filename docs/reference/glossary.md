# Glossary

Terminology used throughout the Momentum reference architecture.

## User-facing vocabulary

One word per concept in the UI. The code and storage names differ in places and
deliberately stay put — this table is the mapping, and the right-hand column
lists wording that must not appear on screen.

| UI term | Means | Code / storage | Do not use on screen |
|---------|-------|----------------|----------------------|
| **Idea** | Something the organization should explore, improve, or build | `Request` (`RequestType.Backlog`), `?need=` deep link, `NeedGroups` | need, demand, request, submission |
| **Solution** | Something reusable that already exists | `Solution` | catalog item, asset |
| **Comment** | A message on an idea or solution | `Comment` | contribution |
| **Attachment** | A file on a comment | `CommentAttachment` | upload, file |
| **Upvote** (noun and verb) | The engagement signal on an idea | `Vote` | support, supporter, "support this idea" |
| **Participation request** | Someone asking to help with an idea or solution | `Contribution` | contribution |
| **Shared by** | The person who created the item | `submittedBy` | submitted by, started by, owner |
| **Share** (verb) | Adding an idea or solution | `Create*` handlers | submit, post |
| **Your work** | The signed-in person's own items | | my work |
| **Demo link** | Link to a working demo or example of a solution | `Solution.DemoUrl` | preview, sample |
| **Who can see this** | An item's visibility, set by administrators | `ItemVisibility` | permissions, sharing |
| **Everyone / Approvers only / Hidden** | The three visibility levels | `ItemVisibility.Everyone|Approvers|Hidden` | public, private, archived |

**Contribution** belongs to participation requests. "Contribute" and
"contributor" are allowed only in the general sense of taking part in the hub
(`Where you can contribute`, `People contributing`) — never as a synonym for a
comment, and never as the label of a comment action.

**Submission** stays a design-doc word for the record entering triage and
approval. On screen the thing is an **idea** or a **solution**; the queue that
reviews them is **Approvals**.

`AuditRecord.Summary` is stored evidence written for the record, and rows
predating this vocabulary keep their original wording. Activity feeds therefore
phrase themselves from the stable `Action` and `ResourceType` fields —
`activityVerb` and `activityTarget` in `packages/ui/src/utils.ts` are the single
place that wording lives. Never render a raw audit summary as UI prose.

## Platform terms

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol — an open protocol for connecting AI agents to data sources and tools. |
| **MCP server** | The server process that exposes tools, resources, and prompts to an MCP host. |
| **MCP host** | The client application (e.g., Claude Desktop, VS Code) that connects to an MCP server. |
| **MCP app** | An interactive HTML app served as an MCP resource and embedded in the host via an iframe. |
| **ext-apps** | The MCP SDK extension (`@modelcontextprotocol/ext-apps`) for embedding interactive apps in MCP host iframes. |
| **Namespace** | The `momentum` prefix applied to all tool names, resource URIs, and env vars. Defined in `src/Momentum.Contracts/Constants.cs` and the UI SDK. |
| **AppShell** | The React layout component that bootstraps the MCP app context. |
| **OAuth 2.1 proxy** | The server component that acts as an authorization server to MCP clients while delegating authentication to an upstream IdP. |
| **PKCE** | Proof Key for Code Exchange — the OAuth 2.1 mechanism used during authorization. |
| **Protected Resource Metadata** | RFC 9728 metadata returned by the server to help MCP clients discover the OAuth authorization server. |
| **Submission** | A backlog idea or existing solution entering Momentum triage and approval. |
| **Backlog item** | A published record derived from an accepted backlog submission. |
| **Catalog item** | A published solution record derived from an accepted solution submission. |
| **Event claim** | An atomic Azure Table record preventing duplicate queue delivery from repeating workflow effects. |
| **Migration** | A versioned SQL script in `core/db/schema.ts` that evolves the database schema. Tracked by the `schema_version` table. |
