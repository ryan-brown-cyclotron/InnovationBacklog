# .NET 10 Packages & Project Setup

> Validated 2026-08-11 against Microsoft Learn (functions-bindings-mcp, updated 2026-06; configure-authentication-mcp preview doc) and NuGet. Package versions are a snapshot — re-verify before pinning.

Target: **.NET 10 isolated Azure Function App** hosting a domain-specific MCP server that calls Dataverse + ADO under per-user OBO.

---

## 0. Hosting model (decide FIRST)

Two ways to expose MCP from a .NET isolated Function App. **Both support per-user OBO into Dataverse and ADO; no external gateway is required.** The choice is about how much pipeline you own.

### Option A — Functions MCP extension  ← recommended starting point
`Microsoft.Azure.Functions.Worker.Extensions.Mcp`

- Triggers/bindings expose functions as MCP **tools, resources, and prompts** (MCP Apps supported for interactive UIs).
- Transport: **streamable HTTP** at `/runtime/webhooks/mcp` (default; recommended). Legacy **SSE** at `/runtime/webhooks/mcp/sse` (deprecated by newer protocol versions).
- **Isolated worker only.** No in-process; no PowerShell.
- Requirements (validated):
  - `Microsoft.Azure.Functions.Worker` **≥ 2.1.0**
  - `Microsoft.Azure.Functions.Worker.Sdk` **≥ 2.0.2**
  - Core Tools **≥ 4.0.7030** for local dev
  - **SSE transport only:** relies on Azure Queue storage in the host storage account (`AzureWebJobsStorage`). With identity-based connections, grant the app **Storage Queue Data Contributor** + **Storage Queue Data Message Processor**. (Streamable HTTP avoids this dependency.)

#### Auth on Option A — two independent layers (don't conflate)

**Layer 1 — webhook system key (transport gate, default ON).** Hosted in Azure, the MCP endpoints require the system key **`mcp_extension`** (`x-functions-key` header or `code` param) unless `host.json` sets:
```jsonc
{
  "extensions": {
    "mcp": {
      "system": { "webhookAuthorizationLevel": "Anonymous" }   // default: "System"
    }
  }
}
```
This is a shared secret, not identity.

**Layer 2 — built-in MCP server authorization (identity, preview).** This **is App Service Authentication (EasyAuth) with Protected Resource Metadata support** — it implements the MCP authorization spec (401 challenge + PRM doc + token validation) and works regardless of the Layer-1 key setting. Setup:
1. Configure Entra ID as the identity provider on the app, with a **dedicated app registration** for the MCP server.
2. Set `WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES = api://<client-id>/user_impersonation` (or your exposed scope).
3. **Preauthorize known MCP client applications** on the registration — Entra has no Dynamic Client Registration, and some clients (VS Code Copilot) never show an interactive consent prompt.
4. Authorization is **server-level**, not per-tool. Per-tool checks are your code.

**OBO caution (Microsoft's own):** the inbound token represents access to *the MCP server only*. Never pass it downstream — exchange it via OBO for Dataverse/ADO tokens in tool code (see `01`).

Other `host.json` knobs: `instructions`, `serverName`, `serverVersion`, `encryptClientState` (default `true`; leave on in prod).

### Option B — MCP ASP.NET Core SDK inside the Function App
`ModelContextProtocol.AspNetCore` (official C# SDK, maintained with Microsoft)

- You own the HTTP pipeline: wire inbound token validation + OBO via `Microsoft.Identity.Web` yourself.
- More control (custom middleware, non-Entra IdPs, bespoke per-tool authz), more code.
- Choose if you outgrow the extension's abstraction.

**Recommendation:** **Option A** with Layer-2 identity auth enabled. Drop to Option B only on a concrete limitation.

---

## 1. MCP SDK packages (Option B, or client-side use)

Official C# SDK (`modelcontextprotocol/csharp-sdk`):

| Package | Use |
|---|---|
| `ModelContextProtocol.Core` | Client + low-level server APIs, minimal deps |
| `ModelContextProtocol` | Hosting + DI extensions (refs Core); non-HTTP projects |
| `ModelContextProtocol.AspNetCore` | **HTTP-based MCP servers** ← Option B |

Optional extensions: `ModelContextProtocol.Extensions.Tasks` (long-running tools w/ status polling), `ModelContextProtocol.Extensions.Apps` (interactive UI in MCP hosts).

---

## 2. Functions (isolated worker) base

```bash
dotnet add package Microsoft.Azure.Functions.Worker            # >= 2.1.0
dotnet add package Microsoft.Azure.Functions.Worker.Sdk        # >= 2.0.2
dotnet add package Microsoft.Azure.Functions.Worker.Extensions.Mcp   # Option A
dotnet add package Microsoft.Azure.Functions.Worker.ApplicationInsights
```
Option B instead: swap `…Extensions.Mcp` for `ModelContextProtocol.AspNetCore` + `Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore`.

---

## 3. Identity / OBO

```bash
dotnet add package Microsoft.Identity.Web        # incoming-token context + OBO acquisition
dotnet add package Azure.Identity                # managed identity (FIC client credential)
```
- Two acquisitions per user — one per downstream scope set (Dataverse, ADO). See `01`.
- Client credential: **managed identity as FIC** or cert; avoid secrets in prod.
- Wrinkle: `Microsoft.Identity.Web`'s conveniences don't always auto-fire in every worker context — be ready to invoke the OBO call explicitly (MSAL `AcquireTokenOnBehalfOf`) if the wrapper doesn't engage in the isolated worker.

---

## 4. Dataverse client

**4a. Raw Web API over `HttpClient`** (recommended) — no Dataverse package. `IHttpClientFactory` + OBO token → `…/api/data/v9.2/…` (see `02`). Lightest, predictable in isolated/Linux hosting.

**4b. Typed SDK**
```bash
dotnet add package Microsoft.PowerPlatform.Dataverse.Client
```
- Typed `QueryExpression` / `RetrieveMultiple` / `IOrganizationServiceAsync2`; MSAL-based.
- **OBO fit:** use the constructor overload taking a **token-provider function** (`Func<string, Task<string>>` — receives the InstanceURI, returns an access token on demand). Feed it the OBO Dataverse token so `ServiceClient` runs as the calling user.
- `Microsoft.PowerPlatform.Dataverse.Client.AzAuth` adds `DefaultAzureCredential` (app-only managed identity — not user OBO).
- SDK team explicitly supports ASP.NET Core / Azure Functions / Linux scenarios, but it's heavier than raw HTTP.

---

## 5. Azure DevOps client

**5a. Raw REST over `HttpClient`** (recommended) — no ADO package. OBO token → `https://dev.azure.com/{org}/…` and (if relevance search) `https://almsearch.dev.azure.com/{org}/…` (see `03`). Cleanest for the WIQL→hydrate two-hop.

**5b. Official client libraries**
```bash
dotnet add package Microsoft.TeamFoundationServer.Client   # WorkItemTrackingHttpClient.QueryByWiqlAsync
dotnet add package Microsoft.VisualStudio.Services.Client  # VssConnection, credentials
```
- Typed WIQL, same two-hop (QueryByWiql returns IDs; hydrate separately). Construct `VssConnection` with a bearer credential from the OBO token. Historically awkward in isolated Functions — hence 5a.

---

## 6. Plumbing

```bash
dotnet add package Microsoft.Extensions.Http               # IHttpClientFactory (named client per backend)
dotnet add package Microsoft.Extensions.Caching.Memory     # per-user/per-resource token cache; schema cache
```
`System.Text.Json` (in-box) parses both backends' payloads; model lean DTOs only.

---

## 7. Minimal package set (recommended path: Option A + raw REST)

```bash
# Functions host + MCP extension
dotnet add package Microsoft.Azure.Functions.Worker
dotnet add package Microsoft.Azure.Functions.Worker.Sdk
dotnet add package Microsoft.Azure.Functions.Worker.Extensions.Mcp
dotnet add package Microsoft.Azure.Functions.Worker.ApplicationInsights

# Identity / OBO (downstream exchanges in tool code)
dotnet add package Microsoft.Identity.Web
dotnet add package Azure.Identity

# Plumbing
dotnet add package Microsoft.Extensions.Http
dotnet add package Microsoft.Extensions.Caching.Memory
```
Add the Dataverse `ServiceClient` and/or ADO client libs **only** if you choose typed clients over raw REST.

---

## 8. Setup checklist

- [ ] .NET 10 SDK; Core Tools ≥ 4.0.7030.
- [ ] Dedicated app registration for the MCP server; expose an API scope (`api://{app-id}/user_impersonation` or `access_as_user`).
- [ ] `requiredResourceAccess` declares Dataverse + ADO delegated scopes (see `01`).
- [ ] Admin consent granted for both downstream scopes.
- [ ] Known MCP client applications **preauthorized** on the registration (no DCR in Entra; some clients can't show consent).
- [ ] Function App managed identity → set up as **FIC** client credential on the registration.
- [ ] Layer 2: App Service Authentication (Entra) enabled; `WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES` set.
- [ ] Layer 1 decision: keep `mcp_extension` system key (defense in depth) or set `webhookAuthorizationLevel: Anonymous`.
- [ ] Transport: streamable HTTP (`/runtime/webhooks/mcp`); only enable SSE if a client requires it — and if so, grant Storage Queue Data **Contributor** + **Message Processor** to the identity on the host storage account.
- [ ] Dataverse client choice (raw REST vs `ServiceClient`) and ADO client choice (raw REST vs official libs).
- [ ] Per-user, per-resource token cache wired.
- [ ] Partial-access failure mode chosen per tool (degrade vs fail-whole).
- [ ] No caching of user-scoped tool responses across users; schema/metadata cache OK.
- [ ] Never forward the inbound MCP-server token downstream — OBO only.

---

## Version snapshot (2026-08-11 — re-verify before pinning)

| Package | Version seen |
|---|---|
| `ModelContextProtocol` / `ModelContextProtocol.AspNetCore` | 2.1.0 |
| `ModelContextProtocol.Core` | 1.2.0 |
| `Microsoft.Azure.Functions.Worker.Extensions.Mcp` | 1.4.0 stable (1.5.0-preview.1 available) |
| `Microsoft.Azure.Functions.Worker` | ≥ 2.1.0 required |
| `Microsoft.Azure.Functions.Worker.Sdk` | ≥ 2.0.2 required |
| `Microsoft.PowerPlatform.Dataverse.Client` | 1.2.26 |
| `Microsoft.PowerPlatform.Dataverse.Client.AzAuth` | 1.1.14 |

Status notes: MCP extension **GA** (extension bundle `[4.0.0, 5.0.0)` for non-.NET stacks); built-in MCP server authorization (PRM via App Service Auth) is **preview**; portal one-click MCP auth config is **preview**.
