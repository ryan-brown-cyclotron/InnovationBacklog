SetDefaultEnvironmentVariable("ASPNETCORE_URLS", "http://localhost:15888");
SetDefaultEnvironmentVariable("DOTNET_DASHBOARD_OTLP_ENDPOINT_URL", "http://localhost:19276");
SetDefaultEnvironmentVariable("DOTNET_RESOURCE_SERVICE_ENDPOINT_URL", "http://localhost:20231");
SetDefaultEnvironmentVariable("ASPIRE_ALLOW_UNSECURED_TRANSPORT", "true");

var builder = DistributedApplication.CreateBuilder(args);

static void SetDefaultEnvironmentVariable(string name, string value)
{
    if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name)))
    {
        Environment.SetEnvironmentVariable(name, value);
    }
}

var service = builder.AddProject<Projects.Momentum_Service>("service")
    .WithExternalHttpEndpoints();

builder.AddProject<Projects.Momentum_Mcp>("mcp")
    .WithExternalHttpEndpoints();

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
