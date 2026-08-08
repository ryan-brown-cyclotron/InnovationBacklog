using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Runtime.Mcp;

public static class McpAuthorizationPolicy
{
    private static readonly Dictionary<string, Role> RequiredRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["search_catalog"] = Role.Submitter,
        ["search_backlog"] = Role.Submitter,
        ["get_submission"] = Role.Submitter,
        ["create_backlog_submission"] = Role.Submitter,
        ["create_solution_submission"] = Role.Submitter,
        ["add_comment"] = Role.Submitter,
        ["accept_submission"] = Role.Approver,
        ["reject_submission"] = Role.Approver
    };

    public static void EnsureAuthorized(string toolName, Role callerRole)
    {
        if (!RequiredRoles.TryGetValue(toolName, out var requiredRole))
            return;

        if (callerRole < requiredRole)
            throw new InvalidOperationException($"Tool '{toolName}' requires role {requiredRole} or higher.");
    }

    public static Role RequiredRoleFor(string toolName) =>
        RequiredRoles.TryGetValue(toolName, out var role) ? role : Role.Submitter;
}
