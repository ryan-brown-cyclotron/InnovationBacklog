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

var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(emulator => emulator.WithArgs(
        "azurite",
        "-l", "/data",
        "--blobHost", "0.0.0.0",
        "--queueHost", "0.0.0.0",
        "--tableHost", "0.0.0.0",
        "--skipApiVersionCheck"));
var tables = storage.AddTables("tables");
var queues = storage.AddQueues("queues");

var service = builder.AddProject<Projects.Momentum_Service>("service")
    .WithReference(tables)
    .WithReference(queues)
    .WithExternalHttpEndpoints();

if (IsExecutableAvailable("func"))
{
    builder.AddProject<Projects.Momentum_Worker>("worker")
        .WithReference(tables)
        .WithReference(queues);
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
