# Momentum.Mcp — the MCP tool surface and the skill intake endpoints.
#
# There is no UI stage. The frontend is a Power Apps code app, published to Power Platform
# rather than served from here, and Momentum.Service is an empty shell that hosts nothing.
# This image is the whole server.
#
# The MCP endpoints live on the Functions *host*, not on the worker executable, so the runtime
# stage has to be a Functions base image. A plain `dotnet/aspnet` image would start the worker
# and serve nothing at /runtime/webhooks/mcp — it would look like a routing bug rather than a
# missing host.

# ── Build ──────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Manifests before sources, so editing code does not invalidate the restore layer.
# Directory.Packages.props is required, not optional: central package management means the
# project files carry no versions and restore fails without it.
COPY global.json Directory.Build.props Directory.Packages.props ./

# The reference chain is Mcp -> Infrastructure -> Application -> Domain. Nothing else is
# needed — Contracts, ServiceDefaults and Service are not on it.
COPY src/Momentum.Library/Momentum.Library.Domain/Momentum.Library.Domain.csproj \
     src/Momentum.Library/Momentum.Library.Domain/
COPY src/Momentum.Library/Momentum.Library.Application/Momentum.Library.Application.csproj \
     src/Momentum.Library/Momentum.Library.Application/
COPY src/Momentum.Library/Momentum.Library.Infrastructure/Momentum.Library.Infrastructure.csproj \
     src/Momentum.Library/Momentum.Library.Infrastructure/
COPY src/Momentum.Mcp/Momentum.Mcp.csproj src/Momentum.Mcp/

# The project, not the solution: restoring Momentum.slnx would pull in the Aspire app host and
# its container tooling, none of which this image contains or needs.
RUN dotnet restore src/Momentum.Mcp/Momentum.Mcp.csproj

COPY src/Momentum.Library/ src/Momentum.Library/
COPY src/Momentum.Mcp/ src/Momentum.Mcp/

# Deliberately NOT --no-restore. The Functions Worker SDK generates an inner WorkerExtensions
# project during build and restores it separately; the restore above cannot have covered it,
# and --no-restore fails there rather than in an obvious place.
RUN dotnet publish src/Momentum.Mcp/Momentum.Mcp.csproj -c Release -o /app/publish

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/azure-functions/dotnet-isolated:4-dotnet-isolated10.0 AS runtime

# The base image sets FUNCTIONS_WORKER_RUNTIME and serves on port 80.
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

COPY --from=build /app/publish /home/site/wwwroot

# ── Runtime configuration ──────────────────────────────────────────────────────
#
# Nothing is baked in. Every setting below is supplied by the platform, and note the
# DOUBLE UNDERSCORES — this is Linux, and a colon is not legal in an environment variable
# name, so the `Momentum:Skills:Pat` form used in local.settings.json does not work here.
#
#   AzureWebJobsStorage                     required by the host for its own bookkeeping
#   Momentum__Mcp__DataverseEnvironmentUrl
#   Momentum__Mcp__AdoOrganization
#   Momentum__Mcp__AdoProject
#   Momentum__Mcp__ClientId                 the server's own app registration
#   Momentum__Mcp__TenantId
#   Momentum__Skills__Host                  AzureDevOps | GitHub
#   Momentum__Skills__Auth                  Caller | Pat
#   Momentum__Skills__Pat                   a Key Vault reference, never a literal
#
# Momentum__Mcp__AuthMode defaults to Obo and must stay there: DevCli runs every request as
# the signed-in Azure CLI user and is refused outside Development.
#
# Full reference: docs/reference/skill-intake-configuration.md
#
# local.settings.json is excluded by .dockerignore. It is gitignored, so it is absent from a
# clean checkout — but on a developer machine it exists and holds the PAT, and without that
# exclusion `docker build .` would copy it into a build layer.
