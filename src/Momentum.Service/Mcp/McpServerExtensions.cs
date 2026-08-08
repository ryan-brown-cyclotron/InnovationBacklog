using Momentum.Library.Runtime.Mcp;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Momentum.Service.Mcp;

public enum McpTransportMode
{
    Http,
    Stdio
}

public static class McpServerExtensions
{
    public static IMcpServerBuilder AddCatalyst(this IServiceCollection services, McpTransportMode transport = McpTransportMode.Http)
    {
        var builder = services.AddMcpServer(options =>
            {
                options.ServerInfo = new Implementation { Name = Constants.Slug, Version = "1.0.0" };
            });

        _ = transport switch
        {
            McpTransportMode.Stdio => builder.WithStdioServerTransport(),
            _ => builder.WithHttpTransport()
        };

        return CatalystMcpServer.Configure(builder);
    }
}
