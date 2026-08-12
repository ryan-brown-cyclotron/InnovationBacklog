# Authentication & On-Behalf-Of (OBO)

> Validated 2026-08-11. Sources: Azure Functions MCP bindings doc (2026-06), Configure built-in MCP server authorization (preview, 2025-11), ADO Entra OAuth doc, Dataverse OAuth doc, Entra Agent ID docs.

Goal: preserve each user's real permissions in **both** Dataverse and ADO. The server performs **downstream token exchange** — one incoming user token → two separate downstream tokens.

## Inbound: the two auth layers on a Functions-hosted MCP server

The Function App's MCP endpoints have **two independent access-control layers**. Don't conflate them:

### Layer 1 — Webhook system key (transport-level, default ON)
- Hosted in Azure, the MCP endpoints require the system key named **`mcp_extension`** by default — via `x-functions-key` header or `code` query param; otherwise `401`.
- Controlled by `host.json` → `extensions.mcp.system.webhookAuthorizationLevel`: `"System"` (default) or `"Anonymous"` (no key required).
- This is a shared secret gate, **not** user identity. It says nothing about *who* is calling.

### Layer 2 — Built-in MCP server authorization (identity-based, preview)
- This **is App Service Authentication (EasyAuth)** extended with **Protected Resource Metadata (PRM)** support to comply with the MCP authorization spec. It is not a separate product and not an external gateway.
- Configure an identity provider (Entra ID) on the app — use a **dedicated app registration** for the MCP server, don't reuse another component's.
- Enable PRM by setting the app setting:
  `WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES = api://<client-id>/user_impersonation` (or your exposed scope).
- Flow: unauthenticated request → `401` challenge → client reads `/.well-known/oauth-protected-resource` → OAuth 2.0 (PKCE) against Entra → retries with bearer → App Service Auth validates (signature, audience, issuer, expiry) → request reaches function code already authenticated.
- Scope of control: **server-level**. It does not do per-tool authorization — that's ours to implement in tool code if needed.
- Works **regardless** of the Layer-1 key setting. A sane production posture: identity layer ON; key either kept (defense in depth) or set `Anonymous` to simplify client config.

### Client-side consent gotchas (Entra)
- Entra ID does **not** support Dynamic Client Registration — MCP clients need a **preconfigured client ID**.
- **Preauthorize known client applications** on the server's app registration. Some clients (e.g. GitHub Copilot in VS Code) never surface an interactive consent prompt, so without preauthorization users hit consent failures.
- Dev/test shortcut: author consent for yourself by browsing to `<app-url>/.auth/login/aad`.

### The non-negotiable rule
Microsoft's own caution: the token used for MCP server authorization represents access to **your MCP server**, not any downstream resource. **Never pass it through** to Dataverse/ADO — that's a named vulnerability pattern. Downstream access = a **new token via OBO** (explicit delegation).

## Downstream: two OBO exchanges, not one

OBO produces a token scoped to a **single resource audience**, so Dataverse and ADO are two distinct exchanges with distinct lifetimes and caches.

```
1. Client authenticates to the MCP server (Layer 2 above).
   Incoming token audience = api://{our-mcp-app-id}/...   ← must be OUR app reg.
2a. OBO exchange → Dataverse-audience token
2b. OBO exchange → ADO-audience token
3. Route each tool call to the right token per backend.
```

OBO is **backend-agnostic** — it exchanges the incoming user token for whatever downstream scope is requested. Nothing constrains which resources you can OBO into, provided permissions + consent exist. Microsoft's `aka.ms/remote-mcp` samples demonstrate exactly this pattern (their example targets Graph; Dataverse and ADO are just different audiences).

## Downstream scopes

### Azure DevOps
- Resource ID (permanent, static): `499b84ac-1321-427f-aa17-267ca6975798`
- Resource URI: `https://app.vssps.visualstudio.com`
- Broad delegated scope: `499b84ac-1321-427f-aa17-267ca6975798/user_impersonation`
- All permissioned scopes: `499b84ac-1321-427f-aa17-267ca6975798/.default`

**Down-scope if possible.** ADO supports granular delegated scopes via the Entra OAuth flow — Microsoft recommends net-new apps request only what they need instead of `user_impersonation`. Since our surface is read/query, check the `scopes` header on each ADO REST reference page we call and request just those.

**Scope-isolation gotcha.** The ADO scope misbehaves when bundled with default OpenID scopes (`openid`, `profile`, `offline_access`, `User.Read`) — tokens can come back with the **Graph** audience (`00000003-0000-0000-c000-000000000000`) instead of ADO's. Request the ADO scope cleanly in its own exchange.

**Token/account quirks.** ADO issues v1 tokens and doesn't natively support MSA (personal) accounts via Entra OAuth. Non-issue for org accounts; flag if guest/MSA identities are in scope.

### Dataverse
- Scope: `https://{yourorg}.crm.dynamics.com/user_impersonation` (or `/.default`)
- Audience is the **specific environment URL** → **per-environment**. Dev/test/prod or per-client environments are distinct downstream targets.

## App registration — `requiredResourceAccess`

```jsonc
"requiredResourceAccess": [
  {
    "resourceAppId": "499b84ac-1321-427f-aa17-267ca6975798",   // Azure DevOps
    "resourceAccess": [ { "id": "<scope-guid>", "type": "Scope" } ]
  },
  {
    "resourceAppId": "<Dataverse-resource-app-id>",             // Dataverse
    "resourceAccess": [ { "id": "<scope-guid>", "type": "Scope" } ]
  }
]
```

## Prerequisites (planning line items)

1. **Admin consent** — both delegated permissions must be admin-consented on the app registration before OBO succeeds. One-time tenant-admin action.
2. **User must exist + hold a role in each system.** OBO carries existing access; it doesn't grant it. No Dataverse security role or no ADO project membership → downstream `403`. Handle partial access explicitly (see `00`).
3. **Client credential for the exchange** — prefer **federated identity credential (FIC) with a managed identity** or a **certificate** over a client secret in production. On a Function App, the app's managed identity as FIC is the clean path.
4. **Preauthorized client apps** on the server registration (see consent gotchas above).

## Classic OBO vs. Entra Agent ID

- **Classic OBO** (plain app registration, `jwt-bearer` exchange): simpler, well-trodden, what `Microsoft.Identity.Web` samples show. **Sufficient here.**
- **Entra Agent ID** (agent identity blueprint + agent identity; two-stage exchange): purpose-built for "agent acting for a user across resources"; supported grants `client_credentials`, `jwt-bearer`, `refresh_token`; agents can't run interactive `/authorize` flows. More setup. Consider only if this server must be a durable, governed *agent identity* in the tenant.

**Recommendation:** start with classic OBO; revisit Agent ID only if governance pushes that way.

## Token caching

- Cache **per user, per resource** (two entries per user), with independent expiry/refresh.
- `Microsoft.Identity.Web` / MSAL handle exchange + caching (see `04`).
- Do **not** cache user-scoped tool responses across users.
