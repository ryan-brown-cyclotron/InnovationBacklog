# Custom connector stubs

Two connectors bridge the Function App into Power Platform. They front the same app and
the same identity, and they have almost nothing else in common.

| | `momentum-mcp` | `skill-intake` |
|---|---|---|
| Consumer | Agents (Copilot Studio) | The UI, on behalf of a person |
| Shape | One operation, forever | One operation per endpoint |
| Grows when tools are added | **No** | n/a |
| Endpoint | `/runtime/webhooks/mcp` | `/api/skills/{validate,commit,provision}` |

Both are **Swagger 2.0**. Power Platform custom connectors do not accept OpenAPI 3.x.

## `momentum-mcp` — for agents

`x-ms-agentic-protocol: mcp-streamable-1.0` tells Copilot Studio to treat the operation
as an MCP server rather than as a REST call. It connects, runs the MCP handshake, and
**discovers the tools at runtime from the server itself.**

The practical consequence: adding `search`, `list`, `get` and `describe` to the server
changes **nothing in this file**. Write it once. The tool descriptions in
`host.json` and in each `[McpToolTrigger]` are what the agent actually reads, so that is
where the wording work belongs — not here.

## `skill-intake` — for the UI

An ordinary typed REST connector. This one *does* grow: every new endpoint needs a path,
an operation, schemas, and `x-ms-summary` on each field (that is what Power Apps shows as
a label — without it the designer falls back to the raw property name).

Skill intake is deliberately **not** an MCP tool. Adopting a skill into the marketplace is
a governed action taken by a person who has just approved it; it is not a decision an
agent should be able to make. Sharing the Function App is a hosting convenience, not a
statement that the two surfaces are equivalent.

Note the size ceiling. The upload is base64 in JSON — the right choice for a connector,
since multipart is awkward to describe — but that inflates the payload by about a third,
and connector calls time out near 120 seconds. The server caps a package at 20 MB
uncompressed, 5 MB per file, 200 files.

## The two auth layers

Same model as the MCP endpoint, and worth not conflating:

1. **Function key** (`x-functions-key`) — a transport gate. A shared secret that says
   nothing about who is calling. `skill-intake` carries it as a connection parameter with
   a `setheader` policy; the MCP endpoint has its own `mcp_extension` system key, which
   can be turned off in `host.json` if the identity layer is doing the work.
2. **Entra OAuth** — the identity layer, and the only one that carries a *user*. Both
   `apiProperties.json` files set `enableOnbehalfOfLogin`, because the server exchanges
   the inbound token for Dataverse and Azure DevOps tokens on the caller's behalf. Without
   it the server has a caller it cannot act for.

## Before importing

Every file has `REPLACE-WITH-` placeholders. Fill them from the output of
[`Provision-McpAppRegistration.ps1`](../../../scripts/provisioning/Provision-McpAppRegistration.ps1),
which prints the client id, tenant id, and scope:

- `REPLACE-WITH-FUNCTION-APP` — function app host name
- `REPLACE-WITH-CLIENT-ID` — the MCP app registration's client id
- `REPLACE-WITH-TENANT-ID` — tenant id

Then, per connector:

```powershell
pac connector create --api-definition-file apiDefinition.swagger.json `
                     --api-properties-file apiProperties.json
```

The consuming client must be **preauthorized** on the app registration — Entra has no
dynamic client registration, and an unlisted client fails with a consent error that reads
like a server bug. The provisioning script handles the known ones.
