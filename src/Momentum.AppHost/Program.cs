SetDefaultEnvironmentVariable("ASPNETCORE_URLS", "http://localhost:15888");
SetDefaultEnvironmentVariable("DOTNET_DASHBOARD_OTLP_ENDPOINT_URL", "http://localhost:19276");
SetDefaultEnvironmentVariable("DOTNET_RESOURCE_SERVICE_ENDPOINT_URL", "http://localhost:20231");
SetDefaultEnvironmentVariable("ASPIRE_ALLOW_UNSECURED_TRANSPORT", "true");

var builder = DistributedApplication.CreateBuilder(args);

// Fixed rather than Aspire-assigned so .mcp.json can name a stable URL.
const int McpPort = 7071;

static void SetDefaultEnvironmentVariable(string name, string value)
{
    if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name)))
    {
        Environment.SetEnvironmentVariable(name, value);
    }
}

var service = builder.AddProject<Projects.Momentum_Service>("service")
    .WithExternalHttpEndpoints();

/*
    The MCP server is a Functions isolated worker, and the MCP endpoints live on the
    Functions *host* at /runtime/webhooks/mcp — not on the worker executable. AddProject
    would launch the worker directly and serve nothing, so the Core Tools host is what
    gets launched, the same way the frontend launches pnpm.

    AddAzureFunctionsProject is the tidier model but provisions Azurite as a container;
    this repo's dev loop runs Azurite via npx. Switch once that changes.
*/
if (IsExecutableAvailable("func"))
{
    /*
        isProxied: false because the Functions host owns 7071 outright and .mcp.json
        names that address directly. Aspire's proxy would otherwise have to sit on a
        different port from the one clients are configured against — and it refuses to
        proxy a non-container resource whose port and targetPort are equal anyway.
    */
    builder.AddExecutable("mcp", "func", "../Momentum.Mcp", "host", "start", "--port", McpPort.ToString())
        .WithHttpEndpoint(port: McpPort, targetPort: McpPort, name: "http", isProxied: false)
        .WithExternalHttpEndpoints();
}

if (IsExecutableAvailable("pnpm"))
{
    builder.AddExecutable("frontend", "pnpm", "../Momentum.Frontend", "dev")
        .WithReference(service)
        .WithEnvironment("VITE_MOMENTUM_API_URL", service.GetEndpoint("http"));
}

builder.Build().Run();

static bool IsExecutableAvailable(string name)
{
    var extensions = OperatingSystem.IsWindows()
        ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT").Split(';')
        : [string.Empty];

    return (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
        .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
        .Any(directory => extensions.Any(extension => File.Exists(Path.Combine(directory, name + extension))));
}
