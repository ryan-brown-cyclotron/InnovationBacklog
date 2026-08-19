# Innovation Backlog

A catalogue of **ideas** people raised and **solutions** that answer them, reached two ways: a
Power Apps code app for people, and an MCP server for agents. Both read the same two systems of
record and neither owns data of its own.

**Azure DevOps work items** hold ideas and solutions — their titles, descriptions, states,
tags and hierarchy. **Dataverse** holds engagement: votes, offers to help, adoptions, and the
engagement rollups. Nothing is copied between them; a read that needs both fans out and joins
in the reader.

Every call runs **as the calling user**. The inbound token is exchanged per backend
on-behalf-of, so each store applies its own row-level access and an agent sees exactly what the
person driving it can see. Access to the two backends is independent, which makes **partial
results normal** — a caller entitled to one and not the other gets the half they are entitled
to, with the other half's status attached, rather than an error.

---

## What's here

| Project | What it is |
|---|---|
| `src/Momentum.Mcp` | **The server.** Azure Functions isolated worker. Five read-only MCP tools plus three HTTP endpoints for skill intake |
| `src/Momentum.Library/` | `Domain`, `Application`, `Infrastructure`. Skill intake's mechanics and its git adapters |
| `src/Momentum.Frontend/apps/code-innovation-backlog` | **The app.** A Power Apps code app (React + Vite) |
| `src/Momentum.Frontend/packages/` | `logic` (domain + providers), `ui` (components), `contracts`, `sdk` |
| `src/Momentum.AppHost` | Aspire composition for the dev loop |
| `src/Momentum.Contracts` | DTOs shared between the .NET side and the generated TypeScript |
| `src/Momentum.Service` | An empty ASP.NET shell. Health checks only — it serves no application |
| `tests/Momentum.Tests` | 286 tests |
| `scripts/provisioning/` | PowerShell to provision Dataverse schema, the ADO project and process, and the skills repository |
| `docs/` | `reference/`, `design/`, `stubs/` (Power Platform connector definitions) |

Two leftovers to know about before you go looking, both from the starter this repo grew out of:

- **`Momentum.Service` hosts nothing.** Health checks only. It is wired into the app host merely
  because the app host predates its emptying. It is not the API.
- **`apps/web`, `apps/docs` and `packages/sdk` are inert boilerplate**, and `pnpm build:apps`
  filters `@momentum/mcp-board`, a package that no longer exists — so that script is broken and
  nothing depends on it. `code-innovation-backlog` is the only live frontend. There is no hosted
  web experience and none is planned.

---

## Running it

Two entry points. They compete for port 7071, so run one at a time.

### The function app on its own

What you want when the server is what you are working on.

```powershell
# Azurite, in its own terminal — the Functions host will not start without it
npx azurite --silent --location .azurite

./scripts/dev/start-mcp.ps1
```

| | |
|---|---|
| MCP tools | `http://localhost:7071/runtime/webhooks/mcp` |
| Skill intake | `http://localhost:7071/api/skills/{validate,commit,provision}` |

The script exists because three things are easy to get wrong: the MCP endpoints live on the
Functions **host**, not the worker, so `dotnet run` serves nothing; `global.json` can pin an SDK
ahead of the installed runtime, so the worker needs `DOTNET_ROLL_FORWARD`; and the host's
failure without a storage emulator never mentions Azurite.

### Everything

```bash
dotnet run --project src/Momentum.AppHost
```

Launches the function app via Core Tools and the code app's dev server via pnpm, each only if
`func` / `pnpm` is on PATH. Ports and the dashboard URL are in
[`src/Momentum.AppHost/Program.cs`](src/Momentum.AppHost/Program.cs).

### The code app alone

```bash
cd src/Momentum.Frontend
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @innovation-backlog/code-app dev
```

### Connect VS Code

[`.vscode/mcp.json`](.vscode/mcp.json) already points at the local endpoint. After changing tool
metadata, restart the server and reconnect it — the host reads tool descriptions once, at
connect.

---

## Configuration

Function app settings. Colon-delimited under `Values` in `local.settings.json`; as Azure app
settings, replace each colon with a **double underscore** (`Momentum__Skills__Host`), because a
colon is not legal in an environment variable name on Linux.

`local.settings.json` is gitignored, so nothing below has a checked-in copy to crib from.

### Backends — `Momentum:Mcp`

| Setting | Notes |
|---|---|
| `DataverseEnvironmentUrl` | e.g. `https://org9ceb01a6.crm.dynamics.com`. The OBO audience, so each environment is a distinct downstream target |
| `AdoOrganization` | Name, not a URL |
| `AdoProject` | Default project for work item queries |
| `AuthMode` | `Obo` in production. `DevCli` borrows the signed-in Azure CLI user's tokens and is **refused outside Development** |
| `ClientId`, `TenantId` | The server's own app registration. Required under `Obo` |

Validated at startup — a missing environment URL stops the host rather than surfacing as a
confusing 404 on the first tool call.

### Skill intake — `Momentum:Skills`

Which git host the skills repository is on, which repository, and which credential. Supports
Azure DevOps and GitHub, with either the caller's identity or a PAT.

Full reference, including the PAT scopes each host needs and the startup failures the validator
produces: **[docs/reference/skill-intake-configuration.md](docs/reference/skill-intake-configuration.md)**.

---

## The MCP surface

Five tools, all read-only. `search`, `list`, `get` and `describe` take a `facet` — `"idea"` or
`"solution"`; `whoami` takes nothing and reports which backends are reachable as the caller,
which is how you tell "no access" from "nothing there".

Per-tool arguments and the reasoning behind them:
[docs/stubs/prompts/mcp-tool-descriptors.md](docs/stubs/prompts/mcp-tool-descriptors.md).

There are no write tools, on purpose. Skill intake is the worked counter-example: it is plain
HTTP on the same function app rather than a tool, because adopting a skill into the marketplace
is a governed action taken by a person who has just approved it, not a decision an agent should
be able to make.

### Power Platform connectors

Two, in [`docs/stubs/api/`](docs/stubs/api/), both **Swagger 2.0** — custom connectors do not
accept OpenAPI 3.x.

- `momentum-mcp` — one operation, forever. `x-ms-agentic-protocol: mcp-streamable-1.0` makes
  Copilot Studio run the MCP handshake and discover tools at runtime, so adding a tool changes
  nothing in the file.
- `skill-intake` — an ordinary typed REST connector, one operation per endpoint. This one does
  grow.

---

## Deployment

Provisioning scripts and their prerequisites are documented in
[`scripts/provisioning/README.md`](scripts/provisioning/README.md); current state and open
questions are in [`CHECKPOINT.md`](CHECKPOINT.md).

### Container

[`Dockerfile`](Dockerfile) builds `Momentum.Mcp` and nothing else.

```bash
docker build -t momentum-mcp .
```

The runtime stage is a **Functions** base image (`azure-functions/dotnet-isolated:4-dotnet-isolated10.0`),
not `dotnet/aspnet`. That is not incidental: the MCP endpoints live on the Functions *host*, so a
plain aspnet image would start the worker and serve nothing at `/runtime/webhooks/mcp` — which
looks like a routing bug rather than a missing host. The base image serves on port 80.

Nothing is baked in. Every setting is supplied by the platform, and on Linux that means
**double underscores** — `Momentum__Skills__Pat`, not `Momentum:Skills:Pat`. The full list is in
the Dockerfile's trailing comment and in
[skill-intake-configuration.md](docs/reference/skill-intake-configuration.md).

`local.settings.json` holds the PAT and is excluded by [`.dockerignore`](.dockerignore). It is
gitignored, so a clean checkout does not have it — but `docker build` sends the working tree,
not the commit, and a developer machine does.

---

## License

MIT
