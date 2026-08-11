using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Hosting;

namespace Momentum.Mcp;

public class Program
{
    public static void Main()
    {
        var host = new HostBuilder()
            .ConfigureServices(services =>
            {
                // Service registration for MCP will go here when implementing real tools/resources
            })
            .ConfigureFunctionsWorkerDefaults()
            .Build();

        host.Run();
    }
}
