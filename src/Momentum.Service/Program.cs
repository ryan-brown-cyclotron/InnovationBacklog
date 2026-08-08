using System.Security.Claims;
using Momentum.Library.Application.Ports;
using Momentum.Library.Infrastructure.AzureStorage;
using Momentum.Library.Infrastructure.Identity;
using Momentum.Service.Api;
using Momentum.Service.Auth;
using Momentum.Service.Mcp;
using Momentum.Service.Seeding;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Momentum.Service;

public class Program
{
    public static async Task Main(string[] args)
    {
        if (args.Contains("--seed-demo"))
        {
            await RunSeedDemoAsync(args);
            return;
        }

        if (args.Contains("--stdio"))
        {
            await RunStdioAsync(args);
            return;
        }

        await RunHttpAsync(args);
    }

    /// <summary>
    /// Replaces this application's data with the demonstration dataset.
    /// Destructive, so it refuses anything but local emulator storage unless
    /// --force is passed, and it only ever touches tables this application owns.
    /// </summary>
    private static async Task RunSeedDemoAsync(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);
        builder.Logging.ClearProviders();

        var tableConnectionString = ResolveTableStorageConnectionString(builder.Configuration);
        var queueConnectionString = ResolveQueueStorageConnectionString(builder.Configuration);
        var blobConnectionString = ResolveBlobStorageConnectionString(builder.Configuration);

        var forced = args.Contains("--force");
        if (!DemoDataSeeder.IsEmulatorStorage(tableConnectionString) && !forced)
        {
            Console.Error.WriteLine(
                "Refusing to seed: the storage connection string does not look like a local emulator. "
                + "Seeding deletes all Momentum data. Re-run with --force if this is really what you want.");
            Environment.ExitCode = 1;
            return;
        }

        builder.Services.AddCatalystStorage(tableConnectionString, queueConnectionString, blobConnectionString);
        builder.Services.AddScoped<IIdentityProvider>(_ => new BusinessIdentityAdapter(CreateDevelopmentPrincipal));

        var app = builder.Build();
        var tableOptions = app.Services.GetRequiredService<TableStorageOptions>();
        var blobOptions = app.Services.GetRequiredService<BlobStorageOptions>();

        Console.WriteLine("Deleting all Momentum data...");
        await DemoDataSeeder.Reset(tableOptions, blobOptions);

        Console.WriteLine("Recreating storage...");
        await app.Services.GetRequiredService<CatalystStorageInitializer>().InitializeAsync();

        Console.WriteLine("Writing the demonstration dataset...");
        using var scope = app.Services.CreateScope();
        await DemoDataSeeder.Seed(scope.ServiceProvider);

        Console.WriteLine("Done. Sign in as dev@localhost to see it.");
    }

    private static async Task RunStdioAsync(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        // stdio transport requires a clean stdout; keep all logging off the console.
        builder.Logging.ClearProviders();

        var storageConnectionString = ResolveFallbackStorageConnectionString(builder.Configuration);
        builder.Services.AddCatalystStorage(storageConnectionString);
        builder.Services.AddScoped<IIdentityProvider>(_ => new BusinessIdentityAdapter(CreateDevelopmentPrincipal));

        builder.Services.AddCatalyst(McpTransportMode.Stdio);

        var app = builder.Build();
        await app.Services.GetRequiredService<CatalystStorageInitializer>().InitializeAsync();

        await app.RunAsync();
    }

    private static async Task RunHttpAsync(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        var devMode = args.Contains("--dev") || builder.Environment.IsDevelopment();
        var authConfig = AuthConfigLoader.Load(devMode);

        builder.AddServiceDefaults();
        builder.Services.AddCatalystStorage(
            ResolveTableStorageConnectionString(builder.Configuration),
            ResolveQueueStorageConnectionString(builder.Configuration),
            ResolveBlobStorageConnectionString(builder.Configuration));
        builder.Services.AddSingleton(authConfig);
        builder.Services.AddSingleton<JwtValidator>();
        builder.Services.AddHttpClient();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IIdentityProvider>(services => new BusinessIdentityAdapter(() =>
            services.GetRequiredService<IHttpContextAccessor>().HttpContext?.User ?? new ClaimsPrincipal()));
        builder.Services.AddCatalyst(McpTransportMode.Http);

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("DevCors", policy =>
            {
                policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
            });
        });

        var app = builder.Build();
        var webHostEnvironment = app.Services.GetRequiredService<IWebHostEnvironment>();
        webHostEnvironment.WebRootPath ??= Path.Combine(webHostEnvironment.ContentRootPath, "wwwroot");

        var webAppPath = Path.Combine(webHostEnvironment.WebRootPath, "apps", "web");
        Directory.CreateDirectory(webAppPath);
        var webAppFileProvider = new PhysicalFileProvider(webAppPath);

        var docsPath = Path.Combine(webHostEnvironment.WebRootPath, "apps", "docs");
        Directory.CreateDirectory(docsPath);
        var docsFileProvider = new PhysicalFileProvider(docsPath);

        app.UseDefaultFiles(new DefaultFilesOptions
        {
            FileProvider = webAppFileProvider,
            RequestPath = ""
        });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = webAppFileProvider,
            RequestPath = ""
        });

        app.UseDefaultFiles(new DefaultFilesOptions
        {
            FileProvider = docsFileProvider,
            RequestPath = "/docs"
        });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = docsFileProvider,
            RequestPath = "/docs"
        });

        app.UseStaticFiles();

        if (devMode)
        {
            app.UseCors("DevCors");
        }

        app.UseWebSessionAuth();

        app.MapDefaultEndpoints();
        app.MapGet("/api/health", () => Results.Ok(new { ok = true, name = Constants.Slug, version = "1.0.0" }));
        app.MapWebAuthEndpoints(authConfig);
        app.MapOAuthEndpoints(authConfig);
        app.MapCatalystApi();

        app.UseWhen(context => context.Request.Path.StartsWithSegments("/api/mcp"), branch =>
        {
            branch.UseMcpAuth();
        });

        app.MapMcp("/api/mcp");

        // Legacy redirect
        app.Map("/mcp", (HttpRequest req) => Results.Redirect($"/api/mcp{req.QueryString}", permanent: true));

        // Docs SPA fallback for client-side routes under /docs
        app.MapGet("/docs/{**splat}", (IWebHostEnvironment env) =>
        {
            var indexPath = Path.Combine(env.WebRootPath, "apps", "docs", "index.html");
            if (File.Exists(indexPath)) return Results.File(indexPath, "text/html");
            return Results.Text("Docs not built. Run 'pnpm build' in src/Momentum.Frontend/ to generate the docs.", "text/plain", statusCode: 503);
        });

        // Web SPA fallback for all other unmatched routes (excluding /api handled by API routes)
        app.MapFallback((HttpContext context, IWebHostEnvironment env) =>
        {
            var path = context.Request.Path;
            if (path.StartsWithSegments("/api"))
            {
                return Results.NotFound(new { error = "Not found" });
            }

            var indexPath = Path.Combine(env.WebRootPath, "apps", "web", "index.html");
            if (File.Exists(indexPath)) return Results.File(indexPath, "text/html");
            return Results.Text("UI not built. Run 'pnpm build:apps' in src/Momentum.Frontend/ to generate the web app.", "text/plain", statusCode: 503);
        });

        await app.Services.GetRequiredService<CatalystStorageInitializer>().InitializeAsync();
        await app.RunAsync();
    }

    private static string ResolveTableStorageConnectionString(IConfiguration configuration)
    {
        return configuration.GetConnectionString(Constants.StorageConnectionStringName)
            ?? configuration.GetConnectionString("tables")
            ?? Environment.GetEnvironmentVariable(Constants.StorageConnectionStringVariable)
            ?? "UseDevelopmentStorage=true";
    }

    private static string ResolveQueueStorageConnectionString(IConfiguration configuration)
    {
        return configuration.GetConnectionString(Constants.StorageConnectionStringName)
            ?? configuration.GetConnectionString("queues")
            ?? Environment.GetEnvironmentVariable(Constants.StorageConnectionStringVariable)
            ?? "UseDevelopmentStorage=true";
    }

    private static string ResolveBlobStorageConnectionString(IConfiguration configuration)
    {
        return configuration.GetConnectionString(Constants.StorageConnectionStringName)
            ?? configuration.GetConnectionString("blobs")
            ?? Environment.GetEnvironmentVariable(Constants.StorageConnectionStringVariable)
            ?? "UseDevelopmentStorage=true";
    }

    private static string ResolveFallbackStorageConnectionString(IConfiguration configuration) =>
        ResolveTableStorageConnectionString(configuration);

    private static ClaimsPrincipal CreateDevelopmentPrincipal()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "dev@localhost"),
            new Claim(ClaimTypes.Email, "dev@localhost"),
            new Claim(ClaimTypes.Role, "administrator"),
            new Claim("momentum-role", "administrator")
        };
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Momentum.Stdio"));
    }
}
