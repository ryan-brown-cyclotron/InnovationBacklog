# Momentum

Momentum is an authenticated backlog and solution-catalog workspace. Business users submit backlog ideas or existing solutions, automated triage prepares structured evidence, and approvers accept or reject submissions before publication.

Momentum is the system of record. Azure Table Storage holds business state, Azure Queue Storage carries workflow events, and `Momentum.Worker` executes queue-triggered triage and publication work. The HTTP API powers the browser experience while the MCP server exposes the same business capabilities to agents.

---

## Current Capabilities

- Backlog and solution submission intake
- Automatic creation triage through a queue-triggered Worker
- Audience-filtered comments and internal review notes
- Approver inbox with durable accept and reject decisions
- Backlog and solution-catalog publication and search
- HTTP and MCP capability surfaces with shared authorization
- Aspire composition for Azurite, Service, Worker, and Frontend

---

## Project Structure

```
.
├── src/
│   ├── Momentum.AppHost/        # Aspire app host
│   ├── Momentum.Service/          # .NET server: MCP, auth, REST API, DB
│   ├── Momentum.ServiceDefaults/ # Aspire service defaults
│   ├── Momentum.Contracts/      # Shared DTOs and constants
│   ├── Momentum.Worker/          # Queue-triggered Azure Functions
│   ├── Momentum.Library/         # Domain, Application, Runtime, Infrastructure
│   └── Momentum.Frontend/        # React/Vite workspace (pnpm + Turbo)
│       ├── apps/
│       │   ├── board/                 # MCP app bundle (single-file HTML)
│       │   └── web/                   # Public web SPA
│       ├── packages/
│       │   ├── sdk/                   # Shared types, namespace constants, React context
│       │   └── ui/                    # React components for the MCP app
│       ├── package.json
│       ├── pnpm-workspace.yaml
│       └── turbo.json
├── scripts/                           # PowerShell helpers for Auth0/OAuth setup
├── Dockerfile
└── docs/
    └── reference/
        ├── architecture.md
        └── glossary.md
```

---

## Quick Start

### Full local application

```bash
# Build the solution
dotnet build Momentum.slnx

# Run Azurite, Service, Worker, and Frontend
dotnet run --project src/Momentum.AppHost
```

Or use the PowerShell helper:

```powershell
scripts/start-http-dev.ps1
```

Use the Service endpoint shown in the Aspire dashboard. The MCP endpoint is `/api/mcp`.

### UI workspace

```bash
cd src/Momentum.Frontend
corepack enable
pnpm install --frozen-lockfile
pnpm build:apps
```

The built apps are output to `src/Momentum.Service/wwwroot/apps/` and served by the .NET server.

The board is delivered through the MCP resource URI `ui://momentum/board/app.html`. Its React shell uses the official MCP Apps bridge for host initialization, host styling, automatic resizing, and calls back to server tools with `app.callServerTool(...)`.

### Connect VS Code

The included `.vscode/mcp.json` points VS Code to the local development endpoint:

```json
{
  "servers": {
    "momentum-http": {
      "type": "http",
      "url": "http://localhost:5100/api/mcp"
    }
  }
}
```

Start only one HTTP hosting path at a time. Running Aspire and `scripts/start-http-dev.ps1` simultaneously can compete for port `5000`. After rebuilding the server or board, restart the MCP server and reconnect it in VS Code so the host reads the current tool metadata and HTML resource.

---

## Configuration

All settings are passed as environment variables. The prefix is `MOMENTUM_*`.

### Storage

| Variable | Default | Description |
|---|---|---|
| `MOMENTUM_STORAGE_CONNECTION_STRING` | `UseDevelopmentStorage=true` | Azure Storage or Azurite connection string |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `MOMENTUM_AUTH_MODE` | `entra` in HTTP mode | `none` \| `entra` \| `oauth` |
| `MOMENTUM_AUTH_ENTRA_TENANT_ID` | | Required when mode is `entra` |
| `MOMENTUM_AUTH_ENTRA_CLIENT_ID` | | Required when mode is `entra` |
| `MOMENTUM_AUTH_ENTRA_CLIENT_SECRET` | | Required when mode is `entra` |
| `MOMENTUM_AUTH_OAUTH_ISSUER` | | Required when mode is `oauth` |
| `MOMENTUM_AUTH_OAUTH_CLIENT_ID` | | Required when mode is `oauth` |
| `MOMENTUM_AUTH_OAUTH_CLIENT_SECRET` | | Required when mode is `oauth` |
| `MOMENTUM_SESSION_SECRET` | `dev-secret-change-me` | Cookie signing secret |
| `MOMENTUM_AUTH_PRE_REGISTERED_CLIENTS` | | JSON array of clients with custom URI schemes |

See `.env.example` for the full list.

### Auth0 Helper

```powershell
scripts/configure-auth0.ps1 -Domain <your-domain>.us.auth0.com -AppName "Momentum Server"
scripts/start-http-auth.ps1
```

---

## MCP Server Usage

### HTTP

```json
{
  "servers": {
    "momentum": {
      "type": "http",
      "url": "https://your-domain.com/api/mcp"
    }
  }
}
```

The server exposes example MCP primitives:

- `momentum_hello` — greeting tool
- `momentum_list_items` / `momentum_create_item` — example CRUD tools
- `momentum_board` — opens the interactive MCP App board
- `momentum://workspace` — example resource
- `ui://momentum/board/app.html` — single-file MCP App resource
- `momentum_hello` — example prompt template

Replace these stubs with your own domain tools as you build your product.

---

## Deployment

Build the Docker image:

```bash
docker build -t momentum .
docker run -p 8080:8080 -v mcp-starter-data:/mnt/data momentum
```

The container exposes the server on port `8080`.

---

## License

MIT
