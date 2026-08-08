# ── UI build stage ─────────────────────────────────────────────────────────────
FROM node:22-slim AS ui-build
WORKDIR /src/ui

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace manifests first for layer caching
COPY src/Momentum.Frontend/package.json src/Momentum.Frontend/pnpm-workspace.yaml src/Momentum.Frontend/.npmrc ./
COPY src/Momentum.Frontend/apps/mcp-board/package.json apps/mcp-board/
COPY src/Momentum.Frontend/apps/web/package.json apps/web/
COPY src/Momentum.Frontend/apps/docs/package.json apps/docs/
COPY src/Momentum.Frontend/packages/sdk/package.json packages/sdk/
COPY src/Momentum.Frontend/packages/ui/package.json packages/ui/
COPY src/Momentum.Frontend/packages/contracts/package.json packages/contracts/
COPY src/Momentum.Frontend/apps/spfx/package.json apps/spfx/

RUN pnpm install

# Copy all UI source files
COPY src/Momentum.Frontend/ .

# Build the MCP apps, web SPA, and docs into the .NET server's wwwroot
RUN pnpm build:apps

# ── .NET build stage ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS dotnet-build
WORKDIR /src

# Copy solution and project files
COPY global.json Directory.Build.props Directory.Packages.props Momentum.slnx ./
COPY src/ ./src/

# Bring the built UI assets into the server project's wwwroot
COPY --from=ui-build /src/ui/src/Momentum.Service/wwwroot ./src/Momentum.Service/wwwroot

# Restore and publish
RUN dotnet restore Momentum.slnx
RUN dotnet publish src/Momentum.Service/Momentum.Service.csproj -c Release -o /app/publish --no-restore

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=dotnet-build /app/publish .

ENV MOMENTUM_STORAGE_CONNECTION_STRING=""

EXPOSE 8080

ENTRYPOINT ["dotnet", "Momentum.Service.dll"]
