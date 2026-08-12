using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Momentum.Mcp;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

/*
    Deliberately not AddServiceDefaults(). Momentum.ServiceDefaults carries a
    FrameworkReference to Microsoft.AspNetCore.App and hangs its endpoints off a
    WebApplication; the Functions worker is neither. Telemetry comes from the worker's
    own Application Insights integration and the OTLP variables the host passes down.
*/
builder.Services.AddMomentumMcp(builder.Configuration, builder.Environment);

builder.Build().Run();
