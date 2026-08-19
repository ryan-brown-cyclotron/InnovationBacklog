# MCP tool descriptors

The tool surface as it actually exists, in `src/Momentum.Mcp/Tools/`. Five tools, all
**read-only**.

This file is a map, not a source of truth. What an agent reads is the description string on
each `[McpToolTrigger]` and `[McpToolProperty]`, so **wording work belongs in the C#**, not
here — and the connector stub (`docs/stubs/api/momentum-mcp/`) discovers all of this at
runtime and never needs changing when a tool is added.

## The four domain tools — `Tools/BacklogTools.cs`

They speak the domain's vocabulary, not the stores'. An agent asks for an idea or a solution;
it never names a work item type, a WIQL clause, an OData filter or an entity set. Each tool
fans out internally to whichever backend holds the answer, and how many round trips that
costs is not part of the contract.

Every tool takes `facet` — `"idea"` for a need somebody raised, `"solution"` for something
reusable that answers one.

| Tool | Arguments | Reads |
|---|---|---|
| `search` | `facet`*, `query`* | Azure DevOps |
| `list` | `facet`*, `status`, `tag` | Azure DevOps |
| `get` | `facet`*, `id`* | Azure DevOps **and** Dataverse |
| `describe` | `facet`* | Azure DevOps metadata |

`*` required.

- **`search`** — the primary discovery tool. Whole words against title and description, most
  recently changed first. Returns the total matched alongside the page, so a truncated answer
  is distinguishable from a small catalogue. No wildcards, no field syntax: `ai` does not hit
  `maintenance`. Engagement counts are not included — that is `get`.
- **`list`** — browsing without a search term, optionally narrowed to one status or one tag.
  `describe` first: a filter naming a value that does not exist returns nothing, which is
  indistinguishable from an empty catalogue.
- **`get`** — one item in full plus its engagement (votes, offers to help, and for a solution,
  who is using it). The only tool that reaches both backends, so the only one reporting two
  statuses — a caller with access to one and not the other gets the half they are entitled to
  rather than an error.
- **`describe`** — the statuses, tags and fields that exist for a facet, so filters are built
  from real values instead of guessed. Schema-level, safe to call once per conversation.

Page size is fixed at 50 and is deliberately **not** an argument: a model given a limit tunes
it instead of narrowing its query.

## `whoami` — `Tools/DiagnosticsTool.cs`

No arguments. Reports the calling identity and which backends are reachable *as that user*.

This is the partial-access probe, and it sets the precedent the others follow. Access to
Dataverse and to Azure DevOps is independent — a user with a Dataverse security role but no
Azure DevOps project membership succeeds against one and gets a 403 from the other. It is the
only tool that can tell "you have no access" from "there is nothing there", which is why every
other tool's failure text points at it.

## Authorization

There is no per-tool role gate, and that is the design rather than an omission. Every tool
runs **as the caller** — the inbound token is exchanged per backend on-behalf-of, and each
store applies its own row-level access. An agent sees exactly what the person driving it can
see, so a role check here would be a second, weaker copy of a decision Dataverse and Azure
DevOps have already made.

The consequence worth stating: **partial results are normal and are not errors.** A tool that
reached one backend and not the other returns the half it got, with the other half's status
attached.

## Writes

None, on purpose. Write tools stay out of scope and, when they arrive, arrive separately and
gated — deciding to adopt or approve something is not an agent's call.

Skill intake is the worked example. It is plain HTTP on the same function app
(`POST /api/skills/{validate,commit,provision}`) and deliberately **not** an MCP tool: adopting
a skill into the marketplace is a governed action taken by a person who has just approved it.
Sharing the function app is a hosting convenience, not a statement that the two surfaces are
equivalent.

## A trap in the generator

`McpToolProperty`'s second argument is the **description**, not the type. The JSON type is
derived from the parameter's CLR type. The attribute also exposes a `Description` property, and
setting both writes `description` twice into `functions.metadata`.

Every argument is a `string` for a related reason: the generator emits no `dataType` at all for
an `int?`, so a numeric parameter reaches the model untyped. Ids are parsed and validated in
the method body instead.

Both mistakes compile and deploy. They surface only as a tool whose schema claims its argument
is called `"string"`.
