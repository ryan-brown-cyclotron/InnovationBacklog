using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol;

namespace Momentum.Library.Runtime.Mcp;

public static class CatalystMcpServer
{
    public static IMcpServerBuilder Configure(IMcpServerBuilder builder, JsonSerializerOptions? serializerOptions = null)
    {
        return builder.WithTools<CatalystToolRegistry>(serializerOptions);
    }
}
