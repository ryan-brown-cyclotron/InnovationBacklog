using Microsoft.Extensions.Hosting;

namespace Momentum.Service;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.AddServiceDefaults();

        var app = builder.Build();

        app.MapDefaultEndpoints();

        await app.RunAsync();
    }
}
